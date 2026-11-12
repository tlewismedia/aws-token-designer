// GenerateImageForm (issue #65): source fields + styles, async polling, and
// the port's structured moderation/rate-limit errors.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  pending: false,
  job: {
    data: undefined as { job: { status: string; error?: string } } | undefined,
    isError: false,
    error: null as Error | null,
    pollTimedOut: false,
  },
}))

vi.mock('../../hooks/useGeneration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useGeneration')>()
  return {
    ...actual,
    useGenerateImage: () => ({ mutateAsync: mocks.generate, isPending: mocks.pending }),
    useGenerationJob: () => mocks.job,
  }
})

import GenerateImageForm from './GenerateImageForm'

function setJob(
  status: string,
  options: { error?: string; pollTimedOut?: boolean } = {},
) {
  mocks.job = {
    data: { job: { status, ...(options.error ? { error: options.error } : {}) } },
    isError: false,
    error: null,
    pollTimedOut: options.pollTimedOut ?? false,
  }
}

async function fillRequiredFields(name = 'Goblin chief', description = 'A goblin chief') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Name *'), name)
  await user.type(screen.getByLabelText('Description *'), description)
  return user
}

beforeEach(() => {
  mocks.generate.mockReset()
  mocks.pending = false
  mocks.job = { data: undefined, isError: false, error: null, pollTimedOut: false }
})

describe('GenerateImageForm', () => {
  it('renders the source fields and all 17 styles', () => {
    render(<GenerateImageForm />)

    expect(screen.getByRole('heading', { name: 'Generate Image' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toBeRequired()
    expect(screen.getByLabelText('Description *')).toBeRequired()
    expect(screen.getByLabelText('Style')).toHaveValue('photographic')
    expect(screen.getByLabelText('negative_prompt')).toBeInTheDocument()

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(17)
    expect(screen.getByRole('option', { name: '3D Model' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tile Texture' })).toBeInTheDocument()
  })

  it('does not submit without a name and description', async () => {
    const user = userEvent.setup()
    render(<GenerateImageForm />)

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('submits the source fields and shows progress while the job runs', async () => {
    mocks.generate.mockResolvedValue({ jobId: 'job-1' })
    setJob('pending')
    render(<GenerateImageForm />)

    const user = await fillRequiredFields()
    await user.selectOptions(screen.getByLabelText('Style'), 'anime')
    await user.type(screen.getByLabelText('negative_prompt'), 'blurry')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() =>
      expect(mocks.generate).toHaveBeenCalledWith({
        name: 'Goblin chief',
        description: 'A goblin chief',
        negativePrompt: 'blurry',
        style: 'anime',
      }),
    )
    expect(screen.getByText(/generating your image/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generating...' })).toBeDisabled()
  })

  it('shows the source success copy and resets the form when the job succeeds', async () => {
    mocks.generate.mockResolvedValue({ jobId: 'job-1' })
    setJob('succeeded')
    render(<GenerateImageForm />)

    const user = await fillRequiredFields()
    await user.type(screen.getByLabelText('negative_prompt'), 'blurry')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() =>
      expect(screen.getByText('Image generated successfully!')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Name *')).toHaveValue('')
    expect(screen.getByLabelText('Description *')).toHaveValue('')
    expect(screen.getByLabelText('negative_prompt')).toHaveValue('')
    expect(screen.getByLabelText('Style')).toHaveValue('photographic')
  })

  it('keeps a moderated failure actionable and refocuses the description', async () => {
    mocks.generate.mockResolvedValue({ jobId: 'job-1' })
    setJob('failed', { error: 'GENERATION_MODERATED' })
    render(<GenerateImageForm />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/that prompt was blocked/i)
    expect(alert).toHaveTextContent(/content filter/i)
    expect(alert).toHaveTextContent(/rewording the character/i)
    expect(screen.getByLabelText('Description *')).toHaveFocus()
    expect(screen.getByLabelText('Description *')).toHaveValue('A goblin chief')
  })

  it('maps a rate-limit response to the daily-limit panel', async () => {
    mocks.generate.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Too many generations today'),
    )
    render(<GenerateImageForm />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/daily limit reached/i)
    expect(alert).toHaveTextContent(/midnight UTC/i)
  })
})
