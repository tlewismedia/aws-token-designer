// Generation hooks (FR-4, PLAN 6.7/6.9): submit a prompt, then poll the job
// every 2s until it is terminal. On success the gallery is invalidated.

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GenerateImageRequest,
  GenerateImageResponse,
  JobResponse,
} from '@aws-token-designer/shared'
import { JOB_POLL_INTERVAL_MS } from '@aws-token-designer/shared'
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
 * the interval automatically when `refetchInterval` returns false (terminal
 * status), and the gallery is invalidated once on `succeeded`.
 */
export function useGenerationJob(jobId: string | null) {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: queryKeys.job(sub, jobId ?? ''),
    enabled: Boolean(user && jobId),
    queryFn: () => apiFetch<JobResponse>(`/jobs/${jobId}`),
    refetchInterval: (current) => {
      const status = current.state.data?.job.status
      return status === 'pending' || status === 'processing'
        ? JOB_POLL_INTERVAL_MS
        : false
    },
  })

  const status = query.data?.job.status
  useEffect(() => {
    if (status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.images(sub) })
    }
  }, [status, queryClient, sub])

  return query
}

/** User-facing text for the safe error codes the worker stores on a job. */
export function generationErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'GENERATION_DISABLED':
      return 'Image generation is temporarily disabled. Please try again later.'
    case 'RATE_LIMITED':
      return 'You have reached the daily generation limit (20). Try again tomorrow.'
    case 'GENERATION_FAILED':
    default:
      return 'Image generation failed. Please try again.'
  }
}
