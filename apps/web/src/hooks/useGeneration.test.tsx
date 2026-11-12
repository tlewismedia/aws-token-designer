// useGenerationJob polling behavior: stop on terminal, invalidate once on
// success, and stop after the bounded attempt cap instead of polling forever.

import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  JOB_POLL_INTERVAL_MS,
  JOB_POLL_MAX_ATTEMPTS,
} from '@aws-token-designer/shared'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('../contexts/auth-context', () => ({
  useAuth: () => ({ user: { sub: 'user-1' } }),
}))

import { generateRequestFromPrompt, generationErrorInfo, useGenerationJob } from './useGeneration'

const baseJob = {
  id: 'job-1',
  sub: 'user-1',
  type: 'generation',
  status: 'processing',
  imageId: 'img-1',
  name: 'Goblin chief',
  prompt: 'A goblin chief',
  createdAt: '2026-01-01T00:00:00.000Z',
}

function jobResponse(status: string) {
  return { job: { ...baseJob, status } }
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } },
  })
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.apiFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useGenerationJob', () => {
  it('stops polling on a terminal state and invalidates the gallery once', async () => {
    mocks.apiFetch.mockResolvedValue(jobResponse('succeeded'))
    const client = makeClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useGenerationJob('job-1'), {
      wrapper: wrapperFor(client),
    })
    await flush()

    expect(result.current.data?.job.status).toBe('succeeded')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL_MS * 5)
    })

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['images', 'user-1'] })
  })

  it('stops after the bounded attempt cap, reports pollTimedOut, and refreshes the gallery', async () => {
    mocks.apiFetch.mockResolvedValue(jobResponse('processing'))
    const client = makeClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useGenerationJob('job-1'), {
      wrapper: wrapperFor(client),
    })
    await flush()

    // Advance well past the cap. Each 2s tick is one refetch while allowed.
    for (let i = 0; i < JOB_POLL_MAX_ATTEMPTS + 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL_MS)
      })
    }

    expect(result.current.pollTimedOut).toBe(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['images', 'user-1'] })
    expect(mocks.apiFetch.mock.calls.length).toBeLessThanOrEqual(JOB_POLL_MAX_ATTEMPTS)

    const callsAtCap = mocks.apiFetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL_MS * 10)
    })
    // No polling resumes after the cap.
    expect(mocks.apiFetch).toHaveBeenCalledTimes(callsAtCap)
  })

  it('does not fetch while no jobId is provided', async () => {
    renderHook(() => useGenerationJob(null), { wrapper: wrapperFor(makeClient()) })
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL_MS * 3)
    })
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })
})

describe('generateRequestFromPrompt', () => {
  it('maps the legacy prompt field to name + description for #64', () => {
    expect(
      generateRequestFromPrompt('  A goblin chief  ', {
        negativePrompt: 'blurry',
        style: 'anime',
      }),
    ).toEqual({
      name: 'A goblin chief',
      description: 'A goblin chief',
      negativePrompt: 'blurry',
      style: 'anime',
    })
  })

  it('truncates the name to 100 characters and falls back for a blank prompt', () => {
    const long = generateRequestFromPrompt('a'.repeat(150))
    expect(long.name).toHaveLength(100)
    expect(long.description).toHaveLength(150)
    expect(generateRequestFromPrompt('   ')).toEqual({
      name: 'Generated image',
      description: '',
    })
  })
})

describe('generationErrorInfo', () => {
  it('gives actionable copy for moderation and rate limits', () => {
    const moderated = generationErrorInfo('GENERATION_MODERATED')
    expect(moderated.title).toMatch(/blocked/i)
    expect(moderated.message).toMatch(/content filter/i)
    expect(moderated.hint).toMatch(/reword/i)

    const limited = generationErrorInfo('RATE_LIMITED')
    expect(limited.title).toMatch(/limit/i)
    expect(limited.hint).toMatch(/midnight UTC/i)

    const failed = generationErrorInfo('GENERATION_FAILED')
    expect(failed.title).toMatch(/failed/i)
    expect(failed.hint).toBeTruthy()
  })
})
