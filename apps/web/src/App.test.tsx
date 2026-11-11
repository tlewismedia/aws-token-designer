import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the marketing page with the application heading', async () => {
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /aws token designer/i }),
      ).toBeInTheDocument(),
    )
  })
})
