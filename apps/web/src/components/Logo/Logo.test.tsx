import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Logo from './Logo'

describe('Logo', () => {
  it('renders the Token Shoppe wordmark with the beta badge', () => {
    render(<Logo />)

    const logo = screen.getByText(/Token Shoppe/)
    expect(logo).toHaveClass('logo', 'logo--large')
    expect(logo).toHaveTextContent('Token Shoppe beta')

    const beta = screen.getByText('beta')
    expect(beta).toHaveClass('logo-beta')
  })

  it('supports the small variant', () => {
    render(<Logo size="small" />)

    expect(screen.getByText(/Token Shoppe/)).toHaveClass('logo', 'logo--small')
  })
})
