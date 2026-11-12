import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BuyCreditsPage from './BuyCreditsPage'

describe('BuyCreditsPage', () => {
  it('renders the source shell with a disabled checkout container', () => {
    render(<BuyCreditsPage />)

    expect(screen.getByRole('heading', { name: 'Buy Credits' })).toBeInTheDocument()

    const container = document.getElementById('checkout-container')
    expect(container).not.toBeNull()
    expect(container).toContainElement(
      screen.getByText('Credit purchasing is coming soon.'),
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
