// Generate modal (FR-4): prompt + optional negative prompt + style, then poll
// the async job (PLAN 6.7/6.9). The gallery invalidates once the job succeeds;
// failures show a safe message and polling stops.

import { useState, type FormEvent } from 'react'
import type { ImageStyle } from '@aws-token-designer/shared'
import Modal from '../../components/Modal'
import {
  generationErrorMessage,
  useGenerateImage,
  useGenerationJob,
} from '../../hooks/useGeneration'

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
  const [error, setError] = useState('')

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
    setError('')
    onClose()
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!prompt.trim() || isWorking) return
    setError('')
    setJobId(null)
    try {
      const result = await generate.mutateAsync({
        prompt: prompt.trim(),
        ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
        style,
      })
      setJobId(result.jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start generation')
    }
  }

  let statusMessage = ''
  let statusIsError = false
  if (succeeded) {
    statusMessage = 'Your image is ready — it has been added to the gallery.'
  } else if (failedCode) {
    statusMessage = generationErrorMessage(failedCode)
    statusIsError = true
  } else if (pollingError) {
    statusMessage = pollingError
    statusIsError = true
  } else if (pollTimedOut) {
    statusMessage =
      'Still working — check the gallery in a moment. You can close this dialog.'
  } else if (isWorking) {
    statusMessage = 'Generating your image… this usually takes 10–30 seconds.'
  }
  const shownMessage = error || statusMessage
  const shownIsError = Boolean(error) || statusIsError

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Generate an image">
      <form className="form" onSubmit={(e) => void handleSubmit(e)}>
        {shownMessage && (
          <p
            className={shownIsError ? 'form-error' : 'form-note'}
            role="status"
            aria-live="polite"
          >
            {shownMessage}
          </p>
        )}
        <label htmlFor="gen-prompt">Prompt</label>
        <textarea
          id="gen-prompt"
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
          <option value="photographic">Photographic</option>
          <option value="anime">Anime</option>
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
