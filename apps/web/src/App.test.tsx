import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCurrentUserMock = vi.fn()
const fetchAuthSessionMock = vi.fn()

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  fetchAuthSession: (...args: unknown[]) => fetchAuthSessionMock(...args),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('./hooks/useMe', () => ({
  useMe: () => ({ data: { profile: { credits: 12 }, sheets: [] }, isPending: false }),
}))

vi.mock('./features/sheets/SheetBuilder', () => ({
  default: () => <p>builder-stub</p>,
}))

import App from './App'

beforeEach(() => {
  getCurrentUserMock.mockReset()
  fetchAuthSessionMock.mockReset()
})

describe('App shell', () => {
  it('renders the promotion page without a navbar when signed out', async () => {
    getCurrentUserMock.mockRejectedValue(new Error('not signed in'))

    render(<App />)

    await waitFor(() =>
      expect(screen.getByText(/fastest, easiest way to create game tokens/i)).toBeInTheDocument(),
    )
    expect(screen.getAllByRole('button', { name: 'Sign Up Now' })).toHaveLength(2)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByText(/please log in to view your credits/i)).not.toBeInTheDocument()
  })

  it('renders the navbar when signed in', async () => {
    getCurrentUserMock.mockResolvedValue({ username: 'dev-user@example.com' })
    fetchAuthSessionMock.mockResolvedValue({
      tokens: { idToken: { payload: { sub: 'sub-1' } } },
    })

    render(<App />)

    const nav = await screen.findByRole('navigation')
    expect(nav).toHaveTextContent('Token Shoppe beta')
    expect(nav).toHaveTextContent('12')
    expect(screen.getByText('builder-stub')).toBeInTheDocument()
  })
})
