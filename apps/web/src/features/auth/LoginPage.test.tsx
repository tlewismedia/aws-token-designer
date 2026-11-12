import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context'
import { ApiError } from '../../lib/api'
import LoginPage from './LoginPage'

const signInMock = vi.fn()

function authValue(): AuthContextValue {
  return {
    user: null,
    loading: false,
    signIn: signInMock,
    signUp: vi.fn(),
    signOut: vi.fn(),
  }
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider value={authValue()}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>home-page</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  signInMock.mockReset()
})

describe('LoginPage', () => {
  it('shows an inline error for bad credentials (no alert)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    signInMock.mockRejectedValue(
      new ApiError(401, 'NOT_AUTHORIZED', 'Incorrect username or password.'),
    )

    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect username or password.',
    )
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('signs in and navigates home', async () => {
    signInMock.mockResolvedValue(undefined)

    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => expect(screen.getByText('home-page')).toBeInTheDocument())
    expect(signInMock).toHaveBeenCalledWith('dev@example.com', 'correct-horse')
  })
})
