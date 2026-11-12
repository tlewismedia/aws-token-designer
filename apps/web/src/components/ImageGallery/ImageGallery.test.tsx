// ImageGallery (FR-6) shows the source gallery chrome: count heading, 150px
// thumbnails, hover overlays, and visible add/delete mutation errors.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageGallery from './ImageGallery'

const mocks = vi.hoisted(() => {
  type MockImage = {
    id: string
    sub: string
    name: string
    status: string
    contentType: string
    fullKey: string
    thumbKey: string
    createdAt: string
    thumbUrl: string
    fullUrl: string
  }

  const image: MockImage = {
    id: 'img-1',
    sub: 'user-1',
    name: 'Goblin',
    status: 'ready',
    contentType: 'image/png',
    fullKey: 'users/user-1/images/img-1/full.png',
    thumbKey: 'users/user-1/images/img-1/thumb.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    thumbUrl: 'https://example.test/thumb.png',
    fullUrl: 'https://example.test/full.png',
  }

  return {
    loading: false,
    error: null as Error | null,
    sheetImages: [] as string[],
    addToken: vi.fn<(imageId: string) => Promise<unknown>>(),
    deleteImage: vi.fn<(imageId: string) => Promise<unknown>>(),
    images: [image] as MockImage[],
    initialImages: [image] as MockImage[],
  }
})

vi.mock('../../hooks/useImages', () => ({
  useImages: () =>
    mocks.loading
      ? { isLoading: true, isError: false, data: undefined }
      : mocks.error
        ? { isLoading: false, isError: true, error: mocks.error, data: undefined }
        : { isLoading: false, isError: false, data: { images: mocks.images } },
  useDeleteImage: () => ({ mutateAsync: mocks.deleteImage, isPending: false }),
}))

vi.mock('../../hooks/useSheets', () => ({
  useSheets: () => ({ latestSheet: { id: 'sheet-1', images: mocks.sheetImages } }),
  useAddToken: () => ({ mutateAsync: mocks.addToken, isPending: false }),
  MAX_TOKENS: 63,
}))

describe('ImageGallery', () => {
  beforeEach(() => {
    mocks.loading = false
    mocks.error = null
    mocks.sheetImages = []
    mocks.images = mocks.initialImages
    mocks.addToken.mockReset()
    mocks.deleteImage.mockReset()
    mocks.addToken.mockResolvedValue(undefined)
    mocks.deleteImage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the count heading, thumbnail, and overlay actions', () => {
    render(<ImageGallery />)

    expect(screen.getByRole('heading', { name: 'Your Generated Images (1)' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Goblin' })).toHaveAttribute(
      'src',
      'https://example.test/thumb.png',
    )
    expect(screen.getByRole('button', { name: 'Add to sheet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeInTheDocument()
  })

  it('renders the source empty state', () => {
    mocks.images = []
    render(<ImageGallery />)

    expect(screen.getByText(/no images yet/i)).toBeInTheDocument()
    expect(screen.getByText(/generate your first image/i)).toBeInTheDocument()
  })

  it('renders the loading state', () => {
    mocks.loading = true
    render(<ImageGallery />)

    expect(screen.getByText('Loading images…')).toBeInTheDocument()
  })

  it('renders the error state', () => {
    mocks.error = new Error('Images unavailable')
    render(<ImageGallery />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load images: Images unavailable',
    )
  })

  it('hides Add once the sheet holds 63 tokens', () => {
    mocks.sheetImages = Array.from({ length: 63 }, (_, index) => `img-${index}`)
    render(<ImageGallery />)

    expect(screen.queryByRole('button', { name: 'Add to sheet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeInTheDocument()
  })

  it('surfaces a rejected add (for example a full sheet) instead of swallowing it', async () => {
    mocks.addToken.mockRejectedValueOnce(new Error('Sheet is full (409)'))
    render(<ImageGallery />)

    await userEvent.click(screen.getByRole('button', { name: 'Add to sheet' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not add image: Sheet is full (409)',
      ),
    )
  })

  it('confirms before deleting and surfaces delete failures', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mocks.deleteImage.mockRejectedValueOnce(new Error('Delete failed'))
    render(<ImageGallery />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }))
    expect(confirm).toHaveBeenCalledWith(
      'Delete “Goblin” and remove it from all sheets?',
    )
    expect(mocks.deleteImage).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not delete image: Delete failed',
      ),
    )
  })
})
