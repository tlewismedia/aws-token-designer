import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHEET_NAME,
  DEFAULT_SHEET_TEMPLATE,
} from '../src/index.js'

describe('sheet defaults', () => {
  it('names a new profile sheet "New Collection" (source parity)', () => {
    expect(DEFAULT_SHEET_NAME).toBe('New Collection')
  })

  it('keeps the source sheet template', () => {
    expect(DEFAULT_SHEET_TEMPLATE).toBe('default')
  })
})
