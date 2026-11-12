// SheetBuilder wiring (issue #65): the add buttons open the source-style
// Modal with the ported generate/upload forms inside.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../images/ImageGallery', () => ({
  default: () => <p>gallery-stub</p>,
}))

vi.mock('./TokenSheet', () => ({
  default: () => <p>sheet-stub</p>,
}))

vi.mock('../images/GenerateImageForm', () => ({
  default: () => <p>generate-form-stub</p>,
}))

vi.mock('../images/UploadImageForm', () => ({
  default: () => <p>upload-form-stub</p>,
}))

import SheetBuilder from './SheetBuilder'

afterEach(() => {
  document.body.style.overflow = ''
})

describe('SheetBuilder', () => {
  it('opens the generate form in a modal and closes it with the source ×', async () => {
    const user = userEvent.setup()
    render(<SheetBuilder />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generate image' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('generate-form-stub')).toBeInTheDocument()
    expect(screen.queryByText('upload-form-stub')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the upload form in a modal', async () => {
    const user = userEvent.setup()
    render(<SheetBuilder />)

    await user.click(screen.getByRole('button', { name: 'Upload image' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('upload-form-stub')).toBeInTheDocument()
  })
})
