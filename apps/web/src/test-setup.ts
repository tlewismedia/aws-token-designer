import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest `globals: false` — RTL cannot auto-register cleanup itself.
afterEach(() => {
  cleanup()
})
