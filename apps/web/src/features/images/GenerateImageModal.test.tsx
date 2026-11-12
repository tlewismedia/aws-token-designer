// The generation failure UI must explain what happened and what to do next.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  job: {
    data: { job: { status: 'failed', error: 'GENERATION_MODERATED' } },
    isError: false,
    pollTimedOut: false,
  },
}))

vi.mock('../../hooks/useGeneration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useGeneration')>()
  return {
    ...actual,
    useGenerateImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useGenerationJob: () => mocks.job,
  }
})

import GenerateImageModal from './GenerateImageModal'

describe('GenerateImageModal errors', () => {
  it('explains a moderated prompt and focuses it for editing', () => {
    render(<GenerateImageModal isOpen onClose={() => {}} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/that prompt was blocked/i)
    expect(alert).toHaveTextContent(/content filter/i)
    expect(alert).toHaveTextContent(/rewording the character/i)

    expect(screen.getByLabelText('Prompt')).toHaveFocus()
  })
})
