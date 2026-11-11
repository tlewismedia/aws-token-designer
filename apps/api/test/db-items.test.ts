// Regression: entity items must never carry undefined values, and the
// production DocumentClient marshals them (SDK v3 throws on undefined
// otherwise — caught in review against the production client configuration).

import { describe, expect, it } from 'vitest'
import type { Image, Sheet } from '@aws-token-designer/shared'
import { toItem, imageFromItem, sheetFromItem } from '../src/lib/db.js'

const baseImage: Image = {
  id: 'img-1',
  sub: 'user-1',
  name: 'Goblin',
  status: 'pending',
  fullKey: 'users/user-1/images/img-1/full.png',
  thumbKey: 'users/user-1/images/img-1/thumb.png',
  contentType: 'image/png',
  // description, style, updatedAt deliberately absent/undefined
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('toItem marshalling safety', () => {
  it('omits optional keys when absent (no undefined values reach the SDK)', () => {
    const item = toItem({ ...baseImage, description: undefined, style: undefined })
    expect(Object.values(item).some((v) => v === undefined)).toBe(false)
    expect(Object.hasOwn(item, 'description')).toBe(false)
    expect(Object.hasOwn(item, 'style')).toBe(false)
  })

  it('round-trips an image without optional fields', () => {
    const image = imageFromItem(toItem(baseImage) as never)
    expect(image.id).toBe('img-1')
    expect(image.sub).toBe('user-1')
    expect(image.description).toBeUndefined()
  })

  it('round-trips a sheet without optional fields', () => {
    const sheet: Sheet = {
      id: 'sheet-1',
      sub: 'user-1',
      name: 'Default Sheet',
      template: 'default',
      images: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const round = sheetFromItem(toItem(sheet) as never)
    expect(round.images).toEqual([])
    expect(round.updatedAt).toBeUndefined()
    const item = toItem(sheet) as Record<string, unknown>
    expect(Object.values(item).some((v) => v === undefined)).toBe(false)
  })
})
