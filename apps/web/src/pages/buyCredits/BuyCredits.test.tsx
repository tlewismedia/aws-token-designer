import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BuyCredits from './BuyCredits'

describe('BuyCredits', () => {
  it('renders the source shell with a disabled checkout container', () => {
    render(<BuyCredits />)

    expect(screen.getByRole('heading', { name: 'Buy Credits' })).toBeInTheDocument()

    const container = document.getElementById('checkout-container')
    expect(container).not.toBeNull()
    expect(container).toContainElement(
      screen.getByText('Credit purchasing is coming soon.'),
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
