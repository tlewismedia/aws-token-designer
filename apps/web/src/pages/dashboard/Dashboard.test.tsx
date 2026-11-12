import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Dashboard from './Dashboard'

describe('Dashboard', () => {
  it('renders the source under-construction placeholder', () => {
    render(<Dashboard />)

    expect(
      screen.getByRole('heading', { name: 'Dashboard - Under Construction' }),
    ).toBeInTheDocument()
  })
})
