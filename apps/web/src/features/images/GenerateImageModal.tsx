// Generate modal (FR-4): prompt + optional negative prompt + style, then poll
// the async job (PLAN 6.7/6.9). The gallery invalidates once the job succeeds;
// failures show a safe message and polling stops.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IMAGE_STYLES, type ImageStyle } from '@aws-token-designer/shared'
import Modal from '../../components/Modal'
import {
  generateRequestFromPrompt,
  generationErrorInfo,
  useGenerateImage,
  useGenerationJob,
  type GenerationErrorInfo,
} from '../../hooks/useGeneration'
import { ApiError } from '../../lib/api'

/** Human-readable label for a style id (full form lands in #65). */
function styleLabel(style: ImageStyle): string {
  return style
    .split('-')
    .map((part) =>
      part === '3d' ? '3D' : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ')
}

export default function GenerateImageModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [style, setStyle] = useState<ImageStyle>('photographic')
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<GenerationErrorInfo | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const generate = useGenerateImage()
  const job = useGenerationJob(jobId)
  const jobStatus = job.data?.job.status
  const isWorking =
    generate.isPending || jobStatus === 'pending' || jobStatus === 'processing'
  const succeeded = jobStatus === 'succeeded'
  const failedCode = jobStatus === 'failed' ? job.data?.job.error : undefined
  const pollingError = job.isError ? job.error.message : ''
  const pollTimedOut = job.pollTimedOut

  /** Reset the flow and close (backdrop, Escape, ×, or Done). */
  const handleClose = () => {
    setPrompt('')
    setNegativePrompt('')
    setStyle('photographic')
    setJobId(null)
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!prompt.trim() || isWorking) return
    setError(null)
    setJobId(null)
    try {
      const result = await generate.mutateAsync(
        generateRequestFromPrompt(prompt, {
          ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
          style,
        }),
      )
      setJobId(result.jobId)
    } catch (err) {
      setError(errorInfoFromRequest(err))
    }
  }

  // A structured error always wins over the status note.
  const errorInfo: GenerationErrorInfo | null =
    error ??
    (failedCode
      ? generationErrorInfo(failedCode)
      : pollingError
        ? {
            title: 'Lost connection',
            message: 'We could not check whether the image finished.',
            hint: 'It may still complete — check the gallery in a moment.',
          }
        : null)

  let statusMessage = ''
  if (succeeded) {
    statusMessage = 'Your image is ready — it has been added to the gallery.'
  } else if (pollTimedOut) {
    statusMessage =
      'Still working — check the gallery in a moment. You can close this dialog.'
  } else if (isWorking) {
    statusMessage = 'Generating your image… this usually takes 10–30 seconds.'
  }

  // When the provider rejects the prompt, put the cursor back in the textarea
  // so editing and retrying is one step.
  useEffect(() => {
    if (failedCode) promptRef.current?.focus()
  }, [failedCode])

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Generate an image">
      <form className="form" onSubmit={(e) => void handleSubmit(e)}>
        {errorInfo ? (
          <div className="error-panel" role="alert">
            <strong className="error-title">{errorInfo.title}</strong>
            <p className="error-message">{errorInfo.message}</p>
            {errorInfo.hint && <p className="error-hint">{errorInfo.hint}</p>}
          </div>
        ) : (
          statusMessage && (
            <p className="form-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )
        )}
        <label htmlFor="gen-prompt">Prompt</label>
        <textarea
          id="gen-prompt"
          ref={promptRef}
          required
          maxLength={1000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isWorking || succeeded}
          placeholder="A stoic dwarf paladin in ornate plate armour"
        />
        <label htmlFor="gen-negative">Negative prompt (optional)</label>
        <textarea
          id="gen-negative"
          maxLength={1000}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          disabled={isWorking || succeeded}
          placeholder="blurry, extra limbs, text"
        />
        <label htmlFor="gen-style">Style</label>
        <select
          id="gen-style"
          value={style}
          onChange={(e) => setStyle(e.target.value as ImageStyle)}
          disabled={isWorking || succeeded}
        >
          {IMAGE_STYLES.map((option) => (
            <option key={option} value={option}>
              {styleLabel(option)}
            </option>
          ))}
        </select>
        {succeeded ? (
          <button type="button" className="btn btn-primary" onClick={handleClose}>
            Done
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!prompt.trim() || isWorking}
          >
            {pollTimedOut ? 'Still working…' : isWorking ? 'Generating…' : 'Generate'}
          </button>
        )}
        <p className="form-note">Free during the demo — limited to 20 generations per day.</p>
      </form>
    </Modal>
  )
}

/**
 * Map a failed `POST /images/generate` to friendly copy. The API error
 * message is safe to show, but status-specific guidance is more useful.
 */
function errorInfoFromRequest(err: unknown): GenerationErrorInfo {
  if (err instanceof ApiError) {
    if (err.status === 429) return generationErrorInfo('RATE_LIMITED')
    if (err.status === 503) return generationErrorInfo('GENERATION_DISABLED')
    if (err.status === 401) {
      return {
        title: 'Session expired',
        message: 'Your sign-in session has expired.',
        hint: 'Sign in again, then retry the prompt.',
      }
    }
    return {
      title: 'Could not start generation',
      message: err.message,
      hint: 'Check your connection and try again.',
    }
  }
  if (err instanceof TypeError) {
    return {
      title: 'Could not reach the server',
      message: 'The request did not get through.',
      hint: 'Check your connection and try again.',
    }
  }
  return {
    title: 'Could not start generation',
    message: err instanceof Error ? err.message : 'Please try again.',
    hint: 'If this keeps happening, reload the page.',
  }
}
