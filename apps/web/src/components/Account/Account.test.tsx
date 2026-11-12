import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context'
import Account from './Account'

const signOutMock = vi.fn()

function authValue(user: AuthContextValue['user']): AuthContextValue {
  return {
    user,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: signOutMock,
  }
}

function renderAccount(user: AuthContextValue['user'] = { sub: 'sub-1', email: 'jane.doe@example.com' }) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthContext.Provider value={authValue(user)}>
        <Routes>
          <Route path="/dashboard" element={<Account />} />
          <Route path="/" element={<p>home-page</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  signOutMock.mockReset().mockResolvedValue(undefined)
})

describe('Account', () => {
  it('uses email initials for the avatar (Cognito has no display name)', () => {
    renderAccount()

    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument()
    expect(screen.getByText('JA')).toHaveClass('avatar-initials')
  })

  it('opens the dropdown and closes it on an outside click', async () => {
    renderAccount()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('logs out and returns home', async () => {
    renderAccount()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))

    await waitFor(() => expect(screen.getByText('home-page')).toBeInTheDocument())
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})
