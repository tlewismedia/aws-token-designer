import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../contexts/auth-context'
import { ApiError } from '../lib/api'
import Register from './Register'

const signUpMock = vi.fn()
const signInMock = vi.fn()

function authValue(): AuthContextValue {
  return {
    user: null,
    loading: false,
    signIn: signInMock,
    signUp: signUpMock,
    signOut: vi.fn(),
  }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <p data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </p>
  )
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthContext.Provider value={authValue()}>
        <Register />
        <LocationProbe />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  signUpMock.mockReset()
  signInMock.mockReset()
})

describe('Register', () => {
  it('keeps the confirm-password field and reports a mismatch inline', async () => {
    renderRegister()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Test1234!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Test12345!')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match')
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('shows an inline error when registration fails', async () => {
    signUpMock.mockRejectedValue(new ApiError(409, 'EMAIL_EXISTS', 'User already exists'))

    renderRegister()

    await userEvent.type(screen.getByLabelText('Email'), 'taken@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Test1234!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Test1234!')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('User already exists')
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('signs in and navigates home with the registration-success state', async () => {
    signUpMock.mockResolvedValue(undefined)
    signInMock.mockResolvedValue(undefined)

    renderRegister()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Test1234!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Test1234!')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/|{"registrationSuccess":true}',
      ),
    )
    expect(signUpMock).toHaveBeenCalledWith('new@example.com', 'Test1234!')
    expect(signInMock).toHaveBeenCalledWith('new@example.com', 'Test1234!')
  })
})
