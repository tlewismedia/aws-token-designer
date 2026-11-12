import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context'
import { useMe } from '../../hooks/useMe'
import Navbar from './Navbar'

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

function renderNavbar() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue({ sub: 'sub-1', email: 'dev@example.com' })}>
        <Navbar />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useMeMock.mockReset().mockReturnValue({
    data: { profile: { credits: 7 }, sheets: [] },
    isPending: false,
  } as unknown as ReturnType<typeof useMe>)
})

describe('Navbar', () => {
  it('shows the Token Shoppe logo, credit balance, and account menu', async () => {
    renderNavbar()

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toHaveClass('navbar')

    const homeLink = screen.getByLabelText('Token Shoppe home')
    expect(homeLink).toHaveTextContent('Token Shoppe beta')
    expect(screen.getByText('beta')).toHaveClass('logo-beta')
    expect(screen.getByText('7')).toHaveClass('credit-amount')
    expect(screen.getByRole('tooltip')).toHaveTextContent('token purchasing coming soon')

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument()
  })
})
