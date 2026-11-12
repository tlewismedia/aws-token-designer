import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  it('renders the source under-construction placeholder', () => {
    render(<DashboardPage />)

    expect(
      screen.getByRole('heading', { name: 'Dashboard - Under Construction' }),
    ).toBeInTheDocument()
  })
})
