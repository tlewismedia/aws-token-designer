// TokenSheet renders one tile per `sheet.images` entry and removes by the
// original sheet index, so a dangling image reference cannot shift the
// removal target (FR-8).

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TokenSheet from './TokenSheet'

const mocks = vi.hoisted(() => ({
  removeToken: vi.fn(),
  clearSheet: vi.fn(),
  createSheet: vi.fn(),
  sheet: {
    id: 'sheet-1',
    sub: 'user-1',
    name: 'Default Sheet',
    template: 'default',
    // First entry resolves to no image; second is a ready image.
    images: ['dangling', 'img-1'],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
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
}))

vi.mock('../../hooks/useSheets', () => ({
  useSheets: () => ({ latestSheet: mocks.sheet, isLoading: false, isError: false }),
  useRemoveToken: () => ({ mutate: mocks.removeToken }),
  useClearSheet: () => ({ mutate: mocks.clearSheet, isPending: false }),
  useCreateSheet: () => ({ mutate: mocks.createSheet, isPending: false }),
  MAX_TOKENS: 63,
}))

vi.mock('../../hooks/useImages', () => ({
  useImages: () => ({ data: { images: [mocks.image] }, isLoading: false, isError: false }),
}))

describe('TokenSheet', () => {
  beforeEach(() => {
    mocks.removeToken.mockClear()
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
})
