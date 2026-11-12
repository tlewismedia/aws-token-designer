// Generation routes (PLAN 6.4/6.7, FR-4):
//   POST /images/generate  → validate, daily cap, create JOB, async invoke
//   GET  /jobs/{jobId}     → poll job status (owner only)

import { generateImageRequestSchema, type Job } from '@aws-token-designer/shared'
import { JOB_TTL_DAYS } from '@aws-token-designer/shared'
import type { App } from '../app.js'
import { parseJsonBody } from '../app.js'
import { getRepo, jobFromItem, utcDateKey } from '../lib/db.js'
import { internalError, rateLimited } from '../lib/errors.js'
import { ulid } from '../lib/ulid.js'
import { invokeGenerationWorker } from '../lib/worker-invoke.js'

export function registerJobsRoutes(app: App): void {
  app.post('/images/generate', async (c) => {
    const body = await parseJsonBody(c, generateImageRequestSchema)
    const sub = c.get('sub')
    const repo = getRepo()

    // Validate first, then consume a daily slot, then create the job. The
    // increment is atomic so concurrent requests cannot exceed the cap.
    const allowed = await repo.consumeDailyGeneration(sub, utcDateKey())
    if (!allowed) {
      throw rateLimited('Daily generation limit reached (20 per day)')
    }

    const now = Date.now()
    const jobId = ulid()
    const imageId = ulid()
    const job: Job = {
      id: jobId,
      sub,
      type: 'generation',
      status: 'pending',
      imageId,
      name: body.name,
      prompt: body.description,
      negativePrompt: body.negativePrompt || undefined,
      style: body.style,
      createdAt: new Date(now).toISOString(),
      expiresAt: Math.floor(now / 1000) + JOB_TTL_DAYS * 24 * 60 * 60,
    }
    await repo.putJob(job)

    try {
      await invokeGenerationWorker({ jobId, sub })
    } catch {
      // Best effort: surface a terminal state so the client stops polling.
      // The daily cap slot is intentionally not refunded (see
      // Repo.consumeDailyGeneration); repeated invoke failures stay capped.
      console.error(
        JSON.stringify({
          level: 'error',
          requestId: c.get('requestId'),
          message: 'failed to invoke generate worker',
          jobId,
        }),
      )
      try {
        // Pending-only: if the invoke was actually accepted and the worker
        // is processing, do not preempt it — the worker will settle the job.
        await repo.markPendingJobFailed(sub, jobId, 'GENERATION_FAILED')
      } catch {
        // Ignore: the 500 below is the primary signal.
      }
      throw internalError('Could not start image generation')
    }

    return c.json({ jobId }, 202)
  })

  app.get('/jobs/:jobId', async (c) => {
    const repo = getRepo()
    const sub = c.get('sub')
    const jobId = c.req.param('jobId')
    const item = await repo.getJobForSub(sub, jobId)
    return c.json({ job: jobFromItem(item) })
  })
}
