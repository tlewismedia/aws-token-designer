// UploadImageForm (issue #65): source name/description/dropzone layout,
// client-side validation, and success/reset without dropping the payload.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_BYTES } from '@aws-token-designer/shared/constants'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  pending: false,
}))

vi.mock('../../hooks/useImages', () => ({
  useUploadImage: () => ({ mutateAsync: mocks.upload, isPending: mocks.pending }),
}))

import UploadImageForm from './UploadImageForm'

function pngFile(name = 'goblin.png', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' })
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input not found')
  return input
}

beforeEach(() => {
  mocks.upload.mockReset()
  mocks.pending = false
})

describe('UploadImageForm', () => {
  it('renders the source fields and upload affordance', () => {
    render(<UploadImageForm />)

    expect(screen.getByRole('heading', { name: 'Upload Image' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toBeRequired()
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument()
    expect(screen.getByText(/drag and drop an image here/i)).toBeInTheDocument()
    expect(screen.getByText(/PNG, JPEG, WebP, GIF \(Max 10MB\)/i)).toBeInTheDocument()
  })

  it('accepts a picked GIF and shows its filename and size', async () => {
    const user = userEvent.setup()
    const { container } = render(<UploadImageForm />)
    const file = new File([new Uint8Array(2 * 1024 * 1024)], 'goblin.gif', {
      type: 'image/gif',
    })

    await user.upload(fileInput(container), file)

    expect(screen.getByText('goblin.gif')).toBeInTheDocument()
    expect(screen.getByText('2.00 MB')).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toHaveValue('goblin')
  })

  it('accepts a file dropped onto the dropzone', () => {
    const { container } = render(<UploadImageForm />)
    const dropzone = container.querySelector('.dropzone')
    expect(dropzone).not.toBeNull()

    fireEvent.drop(dropzone as Element, {
      dataTransfer: { files: [pngFile('dropped.png', 2048)] },
    })

    expect(screen.getByText('dropped.png')).toBeInTheDocument()
    expect(screen.getByText('0.00 MB')).toBeInTheDocument()
  })

  it('rejects unsupported file types', () => {
    const { container } = render(<UploadImageForm />)
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    fireEvent.change(fileInput(container), { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent(/only png, jpeg, webp, or gif/i)
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })

  it('rejects files over the 10 MB limit', () => {
    const { container } = render(<UploadImageForm />)
    const file = pngFile('huge.png')
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 })

    fireEvent.change(fileInput(container), { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent(/less than 10MB/i)
  })

  it('sends name and description, then shows success and resets', async () => {
    mocks.upload.mockResolvedValue({ id: 'img-1' })
    const user = userEvent.setup()
    const { container } = render(<UploadImageForm />)
    const file = pngFile('goblin.png', 4096)

    await user.upload(fileInput(container), file)
    await user.clear(screen.getByLabelText('Name *'))
    await user.type(screen.getByLabelText('Name *'), 'Goblin chief')
    await user.type(
      screen.getByLabelText('Description (optional)'),
      'A goblin chief with a spear',
    )
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith({
        file,
        name: 'Goblin chief',
        description: 'A goblin chief with a spear',
      }),
    )
    expect(screen.getByText('Image uploaded successfully!')).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toHaveValue('')
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('')
    expect(screen.getByText(/drag and drop an image here/i)).toBeInTheDocument()
  })

  it('omits an empty description from the upload payload', async () => {
    mocks.upload.mockResolvedValue({ id: 'img-1' })
    const user = userEvent.setup()
    const { container } = render(<UploadImageForm />)
    const file = pngFile('goblin.png')

    await user.upload(fileInput(container), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
    expect(mocks.upload.mock.calls[0]?.[0]).toEqual({ file, name: 'goblin' })
  })

  it('surfaces an upload failure without clearing the form', async () => {
    mocks.upload.mockRejectedValue(new Error('Upload to storage failed'))
    const user = userEvent.setup()
    const { container } = render(<UploadImageForm />)
    const file = pngFile('goblin.png')

    await user.upload(fileInput(container), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/upload to storage failed/i)
    expect(screen.getByText('goblin.png')).toBeInTheDocument()
  })
})
