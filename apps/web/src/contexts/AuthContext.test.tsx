// FR-1: signing out clears the TanStack Query cache (no cross-account data).

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOutMock = vi.fn()
const getCurrentUserMock = vi.fn()
const fetchAuthSessionMock = vi.fn()

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  fetchAuthSession: (...args: unknown[]) => fetchAuthSessionMock(...args),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: (...args: unknown[]) => signOutMock(...args),
  Amplify: { configure: vi.fn() },
}))

import { AuthProvider } from './AuthContext'
import { useAuth } from './auth-context'
import { createQueryClient } from '../lib/query-client'

let client = createQueryClient()

beforeEach(() => {
  client = createQueryClient()
  client.setQueryData(['profile', 'sub-1'], { profile: { credits: 10 } })
  getCurrentUserMock.mockReset().mockResolvedValue({ username: 'dev-user@example.com' })
  signOutMock.mockReset().mockResolvedValue(undefined)
  fetchAuthSessionMock.mockResolvedValue({
    tokens: { idToken: { payload: { sub: 'sub-1' }, toString: () => 'tok' } },
  })
})

function SignOutButton() {
  const { user, loading, signOut } = useAuth()
  if (loading) return <p>loading</p>
  return (
    <>
      <p>{user ? 'signed-in' : 'signed-out'}</p>
      <button onClick={() => void signOut()}>sign-out</button>
    </>
  )
}

describe('AuthProvider signOut', () => {
  it('clears the user and the query cache', async () => {
    const clearSpy = vi.spyOn(client, 'clear')
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SignOutButton />
        </AuthProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('signed-in')).toBeInTheDocument())
    expect(client.getQueryData(['profile', 'sub-1'])).toBeDefined()

    await userEvent.click(screen.getByText('sign-out'))

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['profile', 'sub-1'])).toBeUndefined()
  })
})
