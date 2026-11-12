// Generate image form (FR-4, issue #65): source Name/Description/Style/
// negative_prompt layout, with the port's async job polling and structured
// moderation/rate-limit/network errors kept behind it.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IMAGE_STYLES, type ImageStyle } from '@aws-token-designer/shared'
import {
  generationErrorInfo,
  useGenerateImage,
  useGenerationJob,
  type GenerationErrorInfo,
} from '../../hooks/useGeneration'
import { ApiError } from '../../lib/api'
import './GenerateImageForm.css'

const DEFAULT_STYLE: ImageStyle = 'photographic'

/** Human-readable label for a style id. */
function styleLabel(style: ImageStyle): string {
  return style
    .split('-')
    .map((part) =>
      part === '3d' ? '3D' : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ')
}

export default function GenerateImageForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [style, setStyle] = useState<ImageStyle>(DEFAULT_STYLE)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<GenerationErrorInfo | null>(null)
  const [success, setSuccess] = useState('')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const handledJobRef = useRef<string | null>(null)

  const generate = useGenerateImage()
  const job = useGenerationJob(jobId)
  // Before the first submit there is no job; ignore any stale hook state.
  const jobStatus = jobId ? job.data?.job.status : undefined
  const isWorking =
    generate.isPending || jobStatus === 'pending' || jobStatus === 'processing'
  const succeeded = jobStatus === 'succeeded'
  const failedCode = jobStatus === 'failed' ? job.data?.job.error : undefined
  const pollingError = jobId && job.isError ? job.error.message : ''
  const pollTimedOut = Boolean(jobId) && job.pollTimedOut

  // Show the source success copy and reset the form once the async job lands.
  useEffect(() => {
    if (!jobId || !succeeded || handledJobRef.current === jobId) return

    handledJobRef.current = jobId
    setSuccess('Image generated successfully!')
    setError(null)
    setName('')
    setDescription('')
    setNegativePrompt('')
    setStyle(DEFAULT_STYLE)
  }, [jobId, succeeded])

  // When the provider rejects the description, put the cursor back in it so
  // editing and retrying is one step.
  useEffect(() => {
    if (failedCode) descriptionRef.current?.focus()
  }, [failedCode])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName || !trimmedDescription || isWorking) return

    setError(null)
    setSuccess('')
    setJobId(null)

    try {
      const result = await generate.mutateAsync({
        name: trimmedName,
        description: trimmedDescription,
        ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
        style,
      })
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
  if (pollTimedOut && !succeeded) {
    statusMessage =
      'Still working — check the gallery in a moment. You can close this dialog.'
  } else if (isWorking) {
    statusMessage = 'Generating your image… this usually takes 10–30 seconds.'
  }

  return (
    <div className="generate-image-form-container">
      <form className="generate-image-form" onSubmit={(e) => void handleSubmit(e)}>
        <h2 id="modal-title">Generate Image</h2>

        <div className="form-group">
          <label htmlFor="generate-name">Name *</label>
          <input
            type="text"
            id="generate-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter image name"
            maxLength={100}
            disabled={isWorking}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="generate-description">Description *</label>
          <textarea
            id="generate-description"
            ref={descriptionRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the image you want to generate"
            rows={4}
            maxLength={1000}
            disabled={isWorking}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="generate-style">Style</label>
          <select
            id="generate-style"
            value={style}
            onChange={(e) => setStyle(e.target.value as ImageStyle)}
            disabled={isWorking}
            required
          >
            {IMAGE_STYLES.map((option) => (
              <option key={option} value={option}>
                {styleLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="generate-negative-prompt">negative_prompt</label>
          <textarea
            id="generate-negative-prompt"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="what you don't want to see (optional)"
            rows={4}
            maxLength={1000}
            disabled={isWorking}
          />
        </div>

        {errorInfo ? (
          <div className="error-panel" role="alert">
            <strong className="error-title">{errorInfo.title}</strong>
            <p className="error-message">{errorInfo.message}</p>
            {errorInfo.hint && <p className="error-hint">{errorInfo.hint}</p>}
          </div>
        ) : success ? (
          <p className="success-message" role="status">
            {success}
          </p>
        ) : (
          statusMessage && (
            <p className="form-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )
        )}

        <button type="submit" disabled={isWorking} className="generate-button">
          {isWorking ? 'Generating...' : 'Generate'}
        </button>

        <p className="form-note">Free during the demo — limited to 20 generations per day.</p>
      </form>
    </div>
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
        hint: 'Sign in again, then retry the description.',
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
