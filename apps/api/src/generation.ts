// generateWorker Lambda: async Stability generation (PLAN 6.7).
//
// Invoked asynchronously by POST /images/generate with `{ jobId, sub }`.
// Ordering is deliberate:
//   1. load the JOB item (silent no-op if missing),
//   2. conditionally claim pending → processing (async retries no-op),
//   3. kill switch (fail closed),
//   4. Stability key from SSM SecureString,
//   5. call Stability ultra, emit AI cost metrics,
//   6. sharp-process + write S3, create IMAGE, mark JOB succeeded,
//   7. any failure marks the job failed with a safe error code.
//
// Secrets and provider error bodies never reach the job record or the logs.

import type { Image, Job } from '@aws-token-designer/shared'
import { config } from './env.js'
import { getRepo, type JobItem, type Repo } from './lib/db.js'
import { emitGenerationFailure, emitGenerationMetrics } from './lib/metrics.js'
import { processImage } from './lib/process-image.js'
import { deleteObjects, putObject } from './lib/s3.js'
import { getParameter } from './lib/ssm.js'
import { generateStabilityImage, StabilityModerationError } from './lib/stability.js'

/** Safe error codes stored on the JOB item (never provider details). */
export const GENERATION_ERRORS = {
  disabled: 'GENERATION_DISABLED',
  failed: 'GENERATION_FAILED',
  moderated: 'GENERATION_MODERATED',
} as const

export interface GenerationJobEvent {
  jobId?: unknown
  sub?: unknown
}

interface ParsedEvent {
  jobId: string
  sub: string
}

function parseEvent(raw: unknown): ParsedEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const event = raw as GenerationJobEvent
  if (typeof event.jobId !== 'string' || event.jobId.length === 0) return null
  if (typeof event.sub !== 'string' || event.sub.length === 0) return null
  return { jobId: event.jobId, sub: event.sub }
}

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', component: 'generateWorker', ...fields }))
}

function logError(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', component: 'generateWorker', ...fields }))
}

export function generatedImageKeys(sub: string, imageId: string) {
  return {
    fullKey: `users/${sub}/images/${imageId}/full.png`,
    thumbKey: `users/${sub}/images/${imageId}/thumb.png`,
  }
}

function jobToImage(job: {
  sub: string
  imageId: string
  name: string
  prompt: string
  style?: Job['style']
}): Image {
  // The user's name labels the image; the prompt is retained as metadata
  // (bounded by the IMAGE schema's 500-char description cap).
  const description = job.prompt.slice(0, 500)
  const { fullKey, thumbKey } = generatedImageKeys(job.sub, job.imageId)
  return {
    id: job.imageId,
    sub: job.sub,
    name: job.name,
    description,
    style: job.style,
    status: 'ready',
    fullKey,
    thumbKey,
    contentType: 'image/png',
    createdAt: new Date().toISOString(),
  }
}

/**
 * Run one generation. Exported for unit tests; the Lambda handler is a thin
 * wrapper so event parsing and all failure paths are testable.
 */
export async function runGenerationJob(rawEvent: unknown): Promise<void> {
  const event = parseEvent(rawEvent)
  if (!event) {
    logError({ message: 'invalid generation event' })
    return
  }
  const { jobId, sub } = event

  let repo: Repo
  try {
    repo = getRepo()
  } catch {
    logError({ jobId, message: 'repository unavailable' })
    return
  }

  // 1. Load the job; a missing item means the event is stale or bogus.
  let job: JobItem | null
  try {
    job = await repo.getJob(sub, jobId)
  } catch {
    logError({ jobId, message: 'failed to load job' })
    return
  }
  if (!job) {
    log({ jobId, message: 'job not found; ignoring event' })
    return
  }

  // 2. Idempotency gate: only one attempt may move pending → processing.
  let claimed: boolean
  try {
    claimed = await repo.claimJobForProcessing(sub, jobId)
  } catch {
    logError({ jobId, message: 'failed to claim job' })
    return
  }
  if (!claimed) {
    log({ jobId, message: 'job already claimed or terminal; no-op' })
    return
  }

  const stage = process.env.STAGE ?? 'dev'

  const failSafe = async (errorCode: string): Promise<void> => {
    // Handled failures return success, so Lambda Errors stays flat; emit the
    // dedicated metric the generation-failures alarm watches.
    emitGenerationFailure({ stage, errorCode })
    try {
      await repo.markJobFailed(sub, jobId, errorCode)
    } catch {
      logError({ jobId, message: 'failed to mark job failed' })
    }
  }

  let cfg: ReturnType<typeof config>
  try {
    cfg = config()
  } catch {
    logError({ jobId, message: 'worker configuration missing' })
    await failSafe(GENERATION_ERRORS.failed)
    return
  }
  const stabilityParam = process.env.STABILITY_PARAM_NAME
  const killSwitchParam = process.env.KILL_SWITCH_PARAM_NAME

  // 3. Kill switch: fail closed on missing/unreadable values.
  let killSwitch: string | null
  try {
    killSwitch = killSwitchParam ? await getParameter(killSwitchParam, false) : null
  } catch {
    killSwitch = null
  }
  if (killSwitch !== 'true') {
    log({ jobId, message: 'generation disabled by kill switch' })
    await failSafe(GENERATION_ERRORS.disabled)
    return
  }

  // 4. Stability key from SSM SecureString.
  let apiKey: string | null
  try {
    apiKey = stabilityParam ? await getParameter(stabilityParam, true) : null
  } catch {
    apiKey = null
  }
  if (!apiKey) {
    log({ jobId, message: 'stability key unavailable' })
    await failSafe(GENERATION_ERRORS.failed)
    return
  }

  // 5. Call Stability. Cost is incurred once this returns an image, so emit
  // the AI metrics before sharp/S3 work (a later failure still cost money).
  let generated: Buffer
  try {
    generated = await generateStabilityImage({
      apiKey,
      prompt: job.prompt,
      negativePrompt: job.negativePrompt,
      style: job.style,
    })
  } catch (err) {
    // Safe fields only: status + error class, never the provider body/key.
    log({
      jobId,
      message: 'stability request failed',
      status: (err as { status?: number }).status,
      errorName: err instanceof Error ? err.name : 'unknown',
    })
    await failSafe(
      err instanceof StabilityModerationError
        ? GENERATION_ERRORS.moderated
        : GENERATION_ERRORS.failed,
    )
    return
  }
  emitGenerationMetrics({ stage })

  // 6. Process + persist. Any failure cleans up whatever was written.
  const { fullKey, thumbKey } = generatedImageKeys(sub, job.imageId)
  const writtenKeys: string[] = []
  let imageWritten = false
  try {
    const processed = await processImage(generated)
    await putObject(cfg.mediaBucket, fullKey, processed.full, 'image/png')
    writtenKeys.push(fullKey)
    await putObject(cfg.mediaBucket, thumbKey, processed.thumb, 'image/png')
    writtenKeys.push(thumbKey)

    const image = jobToImage({
      sub,
      imageId: job.imageId,
      name: job.name,
      prompt: job.prompt,
      style: job.style,
    })
    await repo.putImage(image)
    imageWritten = true
    await repo.markJobSucceeded(sub, jobId, job.imageId)
    log({ jobId, imageId: job.imageId, message: 'generation succeeded' })
  } catch {
    logError({ jobId, message: 'generation processing failed' })
    try {
      await deleteObjects(cfg.mediaBucket, writtenKeys)
    } catch {
      logError({ jobId, message: 'failed to clean up partial objects' })
    }
    if (imageWritten) {
      try {
        await repo.deleteImageItem(sub, job.imageId)
      } catch {
        logError({ jobId, message: 'failed to clean up partial image item' })
      }
    }
    await failSafe(GENERATION_ERRORS.failed)
  }
}

/** Lambda entry point. */
export const handler = async (event: unknown): Promise<void> => {
  await runGenerationJob(event)
}
