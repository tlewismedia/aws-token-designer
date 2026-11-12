// TokenSheet renders one tile per `sheet.images` entry and removes by the
// original sheet index, so a dangling image reference cannot shift the
// removal target (FR-8). The grid stays 7×9 (63 cells) and print waits for the
// resolved thumbnails without re-waiting after the sheet changes.

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TokenSheet from './TokenSheet'

const mocks = vi.hoisted(() => {
  type MockImage = {
    id: string
    name: string
    status: string
    thumbUrl: string
  }

  const image = (id: string, name: string): MockImage => ({
    id,
    name,
    status: 'ready',
    thumbUrl: `https://example.test/${id}.png`,
  })

  const first = image('img-1', 'Goblin')
  const second = image('img-2', 'Troll')
  const third = image('img-3', 'Ogre')
  const sheet = {
    id: 'sheet-1',
    sub: 'user-1',
    name: 'New Collection',
    template: 'default',
    // First entry resolves to no image; second is a ready image.
    images: ['dangling', 'img-1'],
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  return {
    removeToken: vi.fn<() => Promise<unknown>>(),
    clearSheet: vi.fn(),
    createSheet: vi.fn(),
    createError: null as Error | null,
    sheet: sheet as typeof sheet | null,
    images: [first] as MockImage[],
    first,
    second,
    third,
    pristineSheet: sheet,
  }
})

vi.mock('../../hooks/useSheets', () => ({
  useSheets: () => ({ latestSheet: mocks.sheet, isLoading: false, isError: false }),
  useRemoveToken: () => ({ mutateAsync: mocks.removeToken, error: null }),
  useClearSheet: () => ({ mutate: mocks.clearSheet, isPending: false, error: null }),
  useCreateSheet: () => ({
    mutate: mocks.createSheet,
    isPending: false,
    error: mocks.createError,
  }),
  MAX_TOKENS: 63,
}))

vi.mock('../../hooks/useImages', () => ({
  useImages: () => ({ data: { images: mocks.images }, isLoading: false, isError: false }),
}))

function sheetWith(images: string[]) {
  return { ...mocks.pristineSheet, images }
}

function printButton() {
  return screen.getByRole('button', { name: 'Print' })
}

describe('TokenSheet', () => {
  beforeEach(() => {
    mocks.removeToken.mockReset()
    mocks.clearSheet.mockReset()
    mocks.createSheet.mockReset()
    mocks.removeToken.mockResolvedValue(undefined)
    mocks.sheet = mocks.pristineSheet
    mocks.images = [mocks.first]
    mocks.createError = null
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

    expect(printButton()).toBeDisabled()

    const image = document.querySelector('.token img')
    expect(image).not.toBeNull()
    fireEvent.load(image as HTMLImageElement)

    expect(printButton()).toBeEnabled()
  })

  it('stays print-ready when a token is added after existing thumbs loaded', () => {
    mocks.images = [mocks.first]
    mocks.sheet = sheetWith(['img-1'])
    const { rerender } = render(<TokenSheet />)

    expect(printButton()).toBeDisabled()
    fireEvent.load(document.querySelector('.token img') as HTMLImageElement)
    expect(printButton()).toBeEnabled()

    mocks.images = [mocks.first, mocks.second]
    mocks.sheet = sheetWith(['img-1', 'img-2'])
    rerender(<TokenSheet />)

    expect(printButton()).toBeDisabled()
    const images = document.querySelectorAll('.token img')
    expect(images).toHaveLength(2)
    fireEvent.load(images[1] as HTMLImageElement)

    expect(printButton()).toBeEnabled()
  })

  it('keeps already-loaded thumbs ready when a middle token is removed', () => {
    mocks.images = [mocks.first, mocks.second, mocks.third]
    mocks.sheet = sheetWith(['img-1', 'img-2', 'img-3'])
    const { rerender } = render(<TokenSheet />)

    document
      .querySelectorAll('.token img')
      .forEach((image) => fireEvent.load(image as HTMLImageElement))
    expect(printButton()).toBeEnabled()

    mocks.sheet = sheetWith(['img-1', 'img-3'])
    rerender(<TokenSheet />)

    expect(document.querySelectorAll('.token img')).toHaveLength(2)
    expect(printButton()).toBeEnabled()
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

    expect(mocks.createSheet).toHaveBeenCalledWith('New Collection')
  })

  it('surfaces a create-sheet error in the no-sheet state', () => {
    mocks.sheet = null
    mocks.createError = new Error('Sheets unavailable')
    render(<TokenSheet />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not create token sheet: Sheets unavailable',
    )
  })
})
