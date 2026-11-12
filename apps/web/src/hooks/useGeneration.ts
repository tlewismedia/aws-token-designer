// Generation hooks (FR-4, PLAN 6.7/6.9): submit a description, then poll the
// job every 2s until it is terminal. On success the gallery is invalidated.

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GenerateImageRequest,
  GenerateImageResponse,
  ImageStyle,
  JobResponse,
} from '@aws-token-designer/shared'
import { JOB_POLL_INTERVAL_MS, JOB_POLL_MAX_ATTEMPTS } from '@aws-token-designer/shared/constants'
import { useAuth } from '../contexts/auth-context'
import { apiFetch } from '../lib/api'
import { queryKeys } from '../lib/query-client'

/**
 * Temporary adapter for the pre-#65 form, which still has a single "Prompt"
 * field. The prompt becomes the description (Stability prompt) and the first
 * 100 characters become the image name; #65 replaces this with the real
 * name + description fields.
 */
export function generateRequestFromPrompt(
  prompt: string,
  options: { negativePrompt?: string; style?: ImageStyle } = {},
): GenerateImageRequest {
  const description = prompt.trim()
  return {
    name: description.slice(0, 100) || 'Generated image',
    description,
    ...(options.negativePrompt ? { negativePrompt: options.negativePrompt } : {}),
    ...(options.style ? { style: options.style } : {}),
  }
}

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

export interface GenerationErrorInfo {
  /** Short headline shown in bold. */
  title: string
  /** What happened, in plain language. */
  message: string
  /** What the user can do next. */
  hint?: string
}

/** Structured, user-facing error copy for the safe codes the worker stores. */
export function generationErrorInfo(code: string | undefined): GenerationErrorInfo {
  switch (code) {
    case 'GENERATION_DISABLED':
      return {
        title: 'Generation is paused',
        message: 'Image generation is temporarily switched off right now.',
        hint: 'Please try again a little later.',
      }
    case 'RATE_LIMITED':
      return {
        title: 'Daily limit reached',
        message: 'You have used all 20 generations for today.',
        hint: 'The limit resets at midnight UTC.',
      }
    case 'GENERATION_MODERATED':
      return {
        title: 'That prompt was blocked',
        message:
          'The image provider’s content filter rejected this prompt, so no image was generated. Descriptions that are sexual, graphic, or otherwise restricted are blocked.',
        hint: 'Try rewording the character: focus on clothing, pose, equipment, and setting instead. The prompt is still here so you can edit it.',
      }
    case 'GENERATION_FAILED':
      return {
        title: 'Generation failed',
        message: 'The image service did not return an image this time.',
        hint: 'Try again in a moment; if it keeps failing, simplify the prompt.',
      }
    default:
      return {
        title: 'Something went wrong',
        message: 'The image could not be generated.',
        hint: 'Try again in a moment.',
      }
  }
}

/** Backwards-compatible one-line text (used in tests and compact UIs). */
export function generationErrorMessage(code: string | undefined): string {
  return generationErrorInfo(code).message
}
