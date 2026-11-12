// Generation route tests (PLAN 6.4/6.7): validation, daily cap, async invoke,
// job polling, ownership (403) and missing jobs (404).

import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.TABLE_NAME = 'test-table'
process.env.MEDIA_BUCKET = 'test-bucket'
process.env.WORKER_FUNCTION_NAME = 'token-designer-dev-generate-worker'

const repoStub = vi.hoisted(() => ({
  consumeDailyGeneration: vi.fn(),
  putJob: vi.fn(),
  markPendingJobFailed: vi.fn(),
  getJobForSub: vi.fn(),
}))

vi.mock('../src/lib/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/db.js')>()
  return { ...actual, getRepo: () => repoStub }
})

const invokeMock = vi.hoisted(() => ({ invokeGenerationWorker: vi.fn() }))
vi.mock('../src/lib/worker-invoke.js', () => invokeMock)

import { createApp } from '../src/app.js'
import { forbidden, notFound } from '../src/lib/errors.js'
import type { Job } from '@aws-token-designer/shared'

const event = (sub = 'user-1') => ({
  event: {
    requestContext: {
      requestId: 'req-123',
      authorizer: { jwt: { claims: { sub, email: `${sub}@example.com` } } },
    },
  },
})

function request(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
  sub = 'user-1',
) {
  return app.request(path, init, event(sub))
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

const jobItem = {
  PK: 'USER#user-1',
  SK: 'JOB#job-1',
  entityId: 'job-1',
  type: 'generation' as const,
  status: 'succeeded' as const,
  imageId: 'img-1',
  name: 'Goblin chief',
  prompt: 'A goblin chief',
  style: 'anime' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: 1767225600,
}

beforeEach(() => {
  vi.clearAllMocks()
  repoStub.consumeDailyGeneration.mockResolvedValue(true)
  repoStub.putJob.mockResolvedValue(undefined)
  repoStub.markPendingJobFailed.mockResolvedValue(undefined)
  invokeMock.invokeGenerationWorker.mockResolvedValue(undefined)
})

describe('POST /images/generate', () => {
  it('returns 202 with a jobId and invokes the worker with the job payload', async () => {
    const app = createApp()
    const res = await request(app, '/images/generate', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Goblin chief',
        description: 'A goblin chief',
        style: 'anime',
      }),
    })
    expect(res.status).toBe(202)
    const body = await json<{ jobId: string }>(res)
    expect(body.jobId).toBeTruthy()

    expect(repoStub.consumeDailyGeneration).toHaveBeenCalledTimes(1)
    expect(repoStub.putJob).toHaveBeenCalledTimes(1)
    const job = repoStub.putJob.mock.calls[0][0] as Job
    expect(job).toMatchObject({
      id: body.jobId,
      sub: 'user-1',
      type: 'generation',
      status: 'pending',
      name: 'Goblin chief',
      prompt: 'A goblin chief',
      style: 'anime',
    })
    expect(job.imageId).toBeTruthy()
    expect(job.imageId).not.toBe(job.id)
    expect(typeof job.expiresAt).toBe('number')
    expect(invokeMock.invokeGenerationWorker).toHaveBeenCalledWith({
      jobId: body.jobId,
      sub: 'user-1',
    })
  })

  it('rejects invalid bodies with 400 before consuming the cap', async () => {
    const app = createApp()
    const res = await request(app, '/images/generate', {
      method: 'POST',
      body: JSON.stringify({ negativePrompt: 'blurry' }),
    })
    expect(res.status).toBe(400)
    const body = await json<{ error: { code: string } }>(res)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(repoStub.consumeDailyGeneration).not.toHaveBeenCalled()
    expect(repoStub.putJob).not.toHaveBeenCalled()
    expect(invokeMock.invokeGenerationWorker).not.toHaveBeenCalled()
  })

  it('returns 429 when the daily cap is exhausted', async () => {
    repoStub.consumeDailyGeneration.mockResolvedValue(false)
    const app = createApp()
    const res = await request(app, '/images/generate', {
      method: 'POST',
      body: JSON.stringify({ name: 'Goblin chief', description: 'A goblin chief' }),
    })
    expect(res.status).toBe(429)
    const body = await json<{ error: { code: string } }>(res)
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(repoStub.putJob).not.toHaveBeenCalled()
    expect(invokeMock.invokeGenerationWorker).not.toHaveBeenCalled()
  })

  it('marks the job failed and returns 500 when the worker invoke fails', async () => {
    invokeMock.invokeGenerationWorker.mockRejectedValue(new Error('lambda down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createApp()
    const res = await request(app, '/images/generate', {
      method: 'POST',
      body: JSON.stringify({ name: 'Goblin chief', description: 'A goblin chief' }),
    })
    expect(res.status).toBe(500)
    const body = await json<{ error: { code: string } }>(res)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    const job = repoStub.putJob.mock.calls[0][0] as Job
    expect(repoStub.markPendingJobFailed).toHaveBeenCalledWith(
      'user-1',
      job.id,
      'GENERATION_FAILED',
    )
    errorSpy.mockRestore()
  })
})

describe('GET /jobs/:jobId', () => {
  it('returns the caller\u2019s job', async () => {
    repoStub.getJobForSub.mockResolvedValue(jobItem)
    const app = createApp()
    const res = await request(app, '/jobs/job-1')
    expect(res.status).toBe(200)
    const body = await json<{ job: Job }>(res)
    expect(body.job).toMatchObject({ id: 'job-1', status: 'succeeded', imageId: 'img-1' })
    expect(repoStub.getJobForSub).toHaveBeenCalledWith('user-1', 'job-1')
  })

  it('returns 403 for another user\u2019s job', async () => {
    repoStub.getJobForSub.mockRejectedValue(forbidden('Job belongs to another user'))
    const app = createApp()
    const res = await request(app, '/jobs/job-1')
    expect(res.status).toBe(403)
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('FORBIDDEN')
  })

  it('returns 404 for an unknown job', async () => {
    repoStub.getJobForSub.mockRejectedValue(notFound('Job not found'))
    const app = createApp()
    const res = await request(app, '/jobs/missing')
    expect(res.status).toBe(404)
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('NOT_FOUND')
  })
})
