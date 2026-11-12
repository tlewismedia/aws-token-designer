// Generation hooks (FR-4, PLAN 6.7/6.9): submit a prompt, then poll the job
// every 2s until it is terminal. On success the gallery is invalidated.

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GenerateImageRequest,
  GenerateImageResponse,
  JobResponse,
} from '@aws-token-designer/shared'
import { JOB_POLL_INTERVAL_MS, JOB_POLL_MAX_ATTEMPTS } from '@aws-token-designer/shared/constants'
import { useAuth } from '../contexts/auth-context'
import { apiFetch } from '../lib/api'
import { queryKeys } from '../lib/query-client'

export function useGenerateImage() {
  return useMutation({
    mutationFn: (input: GenerateImageRequest) =>
      apiFetch<GenerateImageResponse>('/images/generate', {
        method: 'POST',
        body: input,
      }),
  })
}

/**
 * Poll a generation job while it is pending/processing. TanStack Query stops
 * the interval when `refetchInterval` returns false: terminal status, or the
 * bounded attempt cap (~150 s at 2 s cadence). `pollTimedOut` lets the UI say
 * "still working — check the gallery" instead of polling forever.
 * The gallery is invalidated once on `succeeded`.
 */
export function useGenerationJob(jobId: string | null) {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const queryClient = useQueryClient()
  // Count poll attempts per job so the client can stop after a bounded window
  // (~75 polls ≈ 150 s at the 2 s cadence) even if the server never reaches a
  // terminal state. The ref is read by the interval callback (no stale
  // closure); the state copy drives the UI.
  const [pollState, setPollState] = useState<{ jobId: string | null; count: number }>({
    jobId: null,
    count: 0,
  })
  const pollJobIdRef = useRef<string | null>(null)
  const pollCountRef = useRef(0)

  const query = useQuery({
    queryKey: queryKeys.job(sub, jobId ?? ''),
    enabled: Boolean(user && jobId),
    queryFn: () => {
      if (pollJobIdRef.current !== jobId) {
        pollJobIdRef.current = jobId
        pollCountRef.current = 0
      }
      pollCountRef.current += 1
      setPollState({ jobId, count: pollCountRef.current })
      return apiFetch<JobResponse>(`/jobs/${jobId}`)
    },
    refetchInterval: (current) => {
      const status = current.state.data?.job.status
      if (status !== 'pending' && status !== 'processing') return false
      if (pollCountRef.current >= JOB_POLL_MAX_ATTEMPTS) return false
      return JOB_POLL_INTERVAL_MS
    },
  })

  const status = query.data?.job.status
  const pollTimedOut =
    Boolean(jobId) &&
    status !== 'succeeded' &&
    status !== 'failed' &&
    pollState.jobId === jobId &&
    pollState.count >= JOB_POLL_MAX_ATTEMPTS

  useEffect(() => {
    if (status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.images(sub) })
    }
  }, [status, queryClient, sub])

  // After the bounded poll window, refresh the gallery once so a job that
  // completes late can appear without a manual reload.
  useEffect(() => {
    if (pollTimedOut) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.images(sub) })
    }
  }, [pollTimedOut, queryClient, sub])

  return { ...query, pollTimedOut }
}

/** User-facing text for the safe error codes the worker stores on a job. */
export function generationErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'GENERATION_DISABLED':
      return 'Image generation is temporarily disabled. Please try again later.'
    case 'RATE_LIMITED':
      return 'You have reached the daily generation limit (20). Try again tomorrow.'
    case 'GENERATION_MODERATED':
      return 'The prompt was rejected by the image provider’s content filter. Try a different description.'
    case 'GENERATION_FAILED':
    default:
      return 'Image generation failed. Please try again.'
  }
}
