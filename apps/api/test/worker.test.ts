// generateWorker unit tests: Stability, SSM, S3, and the repo are stubbed.
// Covers the happy path, guardrails (kill switch, missing key), provider and
// sharp failures, and the pending→processing idempotency gate.

import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.TABLE_NAME = 'test-table'
process.env.MEDIA_BUCKET = 'test-bucket'
process.env.STABILITY_PARAM_NAME = '/token-designer/dev/stability/api-key'
process.env.KILL_SWITCH_PARAM_NAME = '/token-designer/dev/generation-enabled'
process.env.STAGE = 'dev'

const repoStub = vi.hoisted(() => ({
  getJob: vi.fn(),
  claimJobForProcessing: vi.fn(),
  putImage: vi.fn(),
  markJobSucceeded: vi.fn(),
  markJobFailed: vi.fn(),
  deleteImageItem: vi.fn(),
}))

vi.mock('../src/lib/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/db.js')>()
  return { ...actual, getRepo: () => repoStub }
})

const s3Mock = vi.hoisted(() => ({
  putObject: vi.fn(),
  deleteObjects: vi.fn(),
}))

vi.mock('../src/lib/s3.js', () => s3Mock)

const ssmMock = vi.hoisted(() => ({
  getParameter: vi.fn(),
}))

vi.mock('../src/lib/ssm.js', () => ssmMock)

const stabilityMock = vi.hoisted(() => ({
  generateStabilityImage: vi.fn(),
}))

vi.mock('../src/lib/stability.js', () => {
  class StabilityError extends Error {
    readonly status: number
    constructor(status: number) {
      super(`Stability request failed with status ${status}`)
      this.name = 'StabilityError'
      this.status = status
    }
  }
  return { ...stabilityMock, StabilityError }
})

const processImageMock = vi.hoisted(() => ({ processImage: vi.fn() }))
vi.mock('../src/lib/process-image.js', () => processImageMock)

import { GENERATION_ERRORS, runGenerationJob } from '../src/worker.js'
import { StabilityError } from '../src/lib/stability.js'

const jobItem = {
  PK: 'USER#user-1',
  SK: 'JOB#job-1',
  entityId: 'job-1',
  type: 'generation' as const,
  status: 'pending' as const,
  imageId: 'img-1',
  prompt: 'A goblin chief',
  negativePrompt: 'blurry',
  style: 'anime' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const event = { jobId: 'job-1', sub: 'user-1' }

function enableAll(): void {
  ssmMock.getParameter.mockImplementation(async (name: string) => {
    if (name === process.env.KILL_SWITCH_PARAM_NAME) return 'true'
    if (name === process.env.STABILITY_PARAM_NAME) return 'sk-test-key'
    return null
  })
}

function setupHappyPath(): void {
  repoStub.getJob.mockResolvedValue(jobItem)
  repoStub.claimJobForProcessing.mockResolvedValue(true)
  repoStub.putImage.mockResolvedValue(undefined)
  repoStub.markJobSucceeded.mockResolvedValue(undefined)
  repoStub.markJobFailed.mockResolvedValue(undefined)
  repoStub.deleteImageItem.mockResolvedValue(undefined)
  enableAll()
  stabilityMock.generateStabilityImage.mockResolvedValue(Buffer.from('generated-png'))
  processImageMock.processImage.mockResolvedValue({
    full: Buffer.from('full'),
    thumb: Buffer.from('thumb'),
    contentType: 'image/png',
  })
  s3Mock.putObject.mockResolvedValue(undefined)
  s3Mock.deleteObjects.mockResolvedValue(undefined)
}

/** Parse the EMF line the worker wrote via console.log. */
function findMetricLine(logSpy: {
  mock: { calls: unknown[][] }
}): Record<string, unknown> | null {
  for (const call of logSpy.mock.calls) {
    const value = call[0]
    if (typeof value !== 'string') continue
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      if (parsed._aws) return parsed
    } catch {
      // not JSON
    }
  }
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  setupHappyPath()
})

describe('runGenerationJob', () => {
  it('generates, writes S3, saves the image, marks the job succeeded, emits metrics', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runGenerationJob(event)

    expect(repoStub.getJob).toHaveBeenCalledWith('user-1', 'job-1')
    expect(repoStub.claimJobForProcessing).toHaveBeenCalledWith('user-1', 'job-1')
    expect(ssmMock.getParameter).toHaveBeenNthCalledWith(
      1,
      process.env.KILL_SWITCH_PARAM_NAME,
      false,
    )
    expect(ssmMock.getParameter).toHaveBeenNthCalledWith(
      2,
      process.env.STABILITY_PARAM_NAME,
      true,
    )
    expect(stabilityMock.generateStabilityImage).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      prompt: 'A goblin chief',
      negativePrompt: 'blurry',
      style: 'anime',
    })

    expect(s3Mock.putObject).toHaveBeenCalledTimes(2)
    expect(s3Mock.putObject).toHaveBeenNthCalledWith(
      1,
      'test-bucket',
      'users/user-1/images/img-1/full.png',
      Buffer.from('full'),
      'image/png',
    )
    expect(s3Mock.putObject).toHaveBeenNthCalledWith(
      2,
      'test-bucket',
      'users/user-1/images/img-1/thumb.png',
      Buffer.from('thumb'),
      'image/png',
    )

    expect(repoStub.putImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'img-1',
        sub: 'user-1',
        name: 'A goblin chief',
        style: 'anime',
        status: 'ready',
        fullKey: 'users/user-1/images/img-1/full.png',
        thumbKey: 'users/user-1/images/img-1/thumb.png',
      }),
    )
    expect(repoStub.markJobSucceeded).toHaveBeenCalledWith('user-1', 'job-1', 'img-1')
    expect(repoStub.markJobFailed).not.toHaveBeenCalled()

    const metric = findMetricLine(logSpy)
    expect(metric).not.toBeNull()
    const aws = metric?._aws as {
      CloudWatchMetrics: { Namespace: string; Dimensions: string[][]; Metrics: { Name: string }[] }[]
    }
    expect(aws.CloudWatchMetrics[0].Namespace).toBe('TokenDesigner')
    expect(aws.CloudWatchMetrics[0].Dimensions).toEqual([['Stage']])
    expect(aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name)).toEqual([
      'GenerationCount',
      'EstimatedAICost',
    ])
    expect(metric?.Stage).toBe('dev')
    expect(metric?.GenerationCount).toBe(1)
    expect(metric?.EstimatedAICost).toBe(0.08)
    logSpy.mockRestore()
  })

  it('refuses when the kill switch is false (no Stability call)', async () => {
    ssmMock.getParameter.mockResolvedValue('false')
    await runGenerationJob(event)
    expect(stabilityMock.generateStabilityImage).not.toHaveBeenCalled()
    expect(s3Mock.putObject).not.toHaveBeenCalled()
    expect(repoStub.markJobFailed).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      GENERATION_ERRORS.disabled,
    )
  })

  it('fails closed when the kill switch parameter is missing', async () => {
    ssmMock.getParameter.mockResolvedValue(null)
    await runGenerationJob(event)
    expect(stabilityMock.generateStabilityImage).not.toHaveBeenCalled()
    expect(repoStub.markJobFailed).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      GENERATION_ERRORS.disabled,
    )
  })

  it('fails the job when the Stability key is missing', async () => {
    ssmMock.getParameter.mockImplementation(async (name: string) =>
      name === process.env.KILL_SWITCH_PARAM_NAME ? 'true' : null,
    )
    await runGenerationJob(event)
    expect(stabilityMock.generateStabilityImage).not.toHaveBeenCalled()
    expect(repoStub.markJobFailed).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      GENERATION_ERRORS.failed,
    )
  })

  it('marks the job failed on a non-2xx Stability response', async () => {
    stabilityMock.generateStabilityImage.mockRejectedValue(new StabilityError(401))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runGenerationJob(event)
    expect(repoStub.markJobFailed).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      GENERATION_ERRORS.failed,
    )
    expect(s3Mock.putObject).not.toHaveBeenCalled()
    // No metric: the provider rejected the request before doing billable work.
    expect(findMetricLine(logSpy)).toBeNull()
    logSpy.mockRestore()
  })

  it('cleans up and fails when sharp processing throws', async () => {
    processImageMock.processImage.mockRejectedValue(new Error('sharp exploded'))
    await runGenerationJob(event)
    expect(s3Mock.putObject).not.toHaveBeenCalled()
    expect(repoStub.markJobSucceeded).not.toHaveBeenCalled()
    expect(repoStub.markJobFailed).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      GENERATION_ERRORS.failed,
    )
  })

  it('cleans up partial objects when the second S3 write fails', async () => {
    s3Mock.putObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('S3 unavailable'))
    await runGenerationJob(event)
    expect(s3Mock.deleteObjects).toHaveBeenCalledWith('test-bucket', [
      'users/user-1/images/img-1/full.png',
    ])
    expect(repoStub.putImage).not.toHaveBeenCalled()
    expect(repoStub.markJobFailed).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      GENERATION_ERRORS.failed,
    )
  })

  it('is idempotent: a retry that cannot claim the job does nothing', async () => {
    repoStub.claimJobForProcessing.mockResolvedValue(false)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runGenerationJob(event)
    expect(ssmMock.getParameter).not.toHaveBeenCalled()
    expect(stabilityMock.generateStabilityImage).not.toHaveBeenCalled()
    expect(s3Mock.putObject).not.toHaveBeenCalled()
    expect(repoStub.putImage).not.toHaveBeenCalled()
    expect(repoStub.markJobSucceeded).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('ignores an event whose job no longer exists', async () => {
    repoStub.getJob.mockResolvedValue(null)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runGenerationJob(event)
    expect(repoStub.claimJobForProcessing).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('ignores malformed events', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runGenerationJob({ jobId: 'job-1' })
    await runGenerationJob('nonsense')
    expect(repoStub.getJob).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
