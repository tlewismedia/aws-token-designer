import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context'
import { useMe } from '../../hooks/useMe'
import CreditBalance from './CreditBalance'

vi.mock('../../hooks/useMe', () => ({ useMe: vi.fn() }))

const useMeMock = vi.mocked(useMe)

function authValue(user: AuthContextValue['user']): AuthContextValue {
  return {
    user,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }
}

function renderCreditBalance(user: AuthContextValue['user']) {
  return render(
    <AuthContext.Provider value={authValue(user)}>
      <CreditBalance />
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  useMeMock.mockReset()
})

describe('CreditBalance', () => {
  it('shows a loading message while the profile is pending', () => {
    useMeMock.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useMe>)

    renderCreditBalance({ sub: 'sub-1', email: 'dev@example.com' })

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the coin icon, amount, and the purchasing tooltip', () => {
    useMeMock.mockReturnValue({
      data: { profile: { credits: 42 }, sheets: [] },
      isPending: false,
    } as unknown as ReturnType<typeof useMe>)

    renderCreditBalance({ sub: 'sub-1', email: 'dev@example.com' })

    expect(screen.getByLabelText('Credits')).toBeInTheDocument()
    expect(screen.getByText('42')).toHaveClass('credit-amount')
    expect(screen.getByRole('tooltip')).toHaveTextContent('token purchasing coming soon')

    const container = screen.getByRole('tooltip').parentElement
    expect(container).toHaveAttribute('aria-disabled', 'true')
    expect(container).toHaveAttribute('aria-describedby', 'credit-balance-tooltip')
  })

  it('asks signed-out visitors to log in', () => {
    useMeMock.mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useMe>)

    renderCreditBalance(null)

    expect(screen.getByText('Please log in to view your credits')).toBeInTheDocument()
  })
})
