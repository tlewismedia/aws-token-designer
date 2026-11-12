// TokenSheet renders one tile per `sheet.images` entry and removes by the
// original sheet index, so a dangling image reference cannot shift the
// removal target (FR-8). The grid stays 7×9 (63 cells) and print waits for the
// resolved thumbnails.

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TokenSheet from './TokenSheet'

const mocks = vi.hoisted(() => {
  const sheet = {
    id: 'sheet-1',
    sub: 'user-1',
    name: 'Default Sheet',
    template: 'default',
    // First entry resolves to no image; second is a ready image.
    images: ['dangling', 'img-1'],
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  return {
    removeToken: vi.fn<() => Promise<unknown>>(),
    clearSheet: vi.fn(),
    createSheet: vi.fn(),
    sheet: sheet as typeof sheet | null,
    image: {
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
    },
    pristineSheet: sheet,
  }
})

vi.mock('../../hooks/useSheets', () => ({
  useSheets: () => ({ latestSheet: mocks.sheet, isLoading: false, isError: false }),
  useRemoveToken: () => ({ mutateAsync: mocks.removeToken, error: null }),
  useClearSheet: () => ({ mutate: mocks.clearSheet, isPending: false, error: null }),
  useCreateSheet: () => ({ mutate: mocks.createSheet, isPending: false }),
  MAX_TOKENS: 63,
}))

vi.mock('../../hooks/useImages', () => ({
  useImages: () => ({ data: { images: [mocks.image] }, isLoading: false, isError: false }),
}))

describe('TokenSheet', () => {
  beforeEach(() => {
    mocks.removeToken.mockReset()
    mocks.clearSheet.mockReset()
    mocks.createSheet.mockReset()
    mocks.removeToken.mockResolvedValue(undefined)
    mocks.sheet = mocks.pristineSheet
  })

  it('removes the clicked token by its original sheet index', async () => {
    render(<TokenSheet />)

    // The unresolved id still occupies a tile, before the ready image.
    expect(screen.getByLabelText('Unresolved token')).toBeInTheDocument()
    const removeButtons = screen.getAllByRole('button', { name: /remove token/i })
    expect(removeButtons).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Remove token 2' }))

    // Index 1 (the valid image), not 0 (the filtered/unresolved entry).
    expect(mocks.removeToken).toHaveBeenCalledWith(1)
  })

  it('renders a 7×9 grid with empty circles for the unused cells', () => {
    const { container } = render(<TokenSheet />)

    expect(container.querySelectorAll('.image-grid .token')).toHaveLength(2)
    expect(container.querySelectorAll('.image-grid .empty-token')).toHaveLength(61)
  })

  it('keeps Print disabled until the resolved thumbnails load', () => {
    render(<TokenSheet />)

    const print = screen.getByRole('button', { name: 'Print' })
    expect(print).toBeDisabled()

    const image = document.querySelector('.token img')
    expect(image).not.toBeNull()
    fireEvent.load(image as HTMLImageElement)

    expect(print).toBeEnabled()
  })

  it('clears the sheet from the icon button', async () => {
    render(<TokenSheet />)

    await userEvent.click(screen.getByRole('button', { name: 'Clear sheet' }))

    expect(mocks.clearSheet).toHaveBeenCalledTimes(1)
  })

  it('shows the source no-sheet copy and creates a default sheet', async () => {
    mocks.sheet = null
    render(<TokenSheet />)

    expect(
      screen.getByText('No token sheets found. Create one to get started!'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add Token Sheet' }))

    expect(mocks.createSheet).toHaveBeenCalledWith('Default Sheet')
  })
})
