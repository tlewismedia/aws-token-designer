import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context'
import HomePage from './HomePage'

vi.mock('../sheets/SheetBuilder', () => ({
  default: () => <p>builder-stub</p>,
}))

function authValue(user: AuthContextValue['user']): AuthContextValue {
  return {
    user,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location-state">{JSON.stringify(location.state)}</p>
}

function renderHome(
  user: AuthContextValue['user'] = null,
  state: unknown = null,
) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
      <AuthContext.Provider value={authValue(user)}>
        <Routes>
          <Route path="*" element={<HomePage />} />
        </Routes>
        <LocationProbe />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('HomePage', () => {
  it('renders the marketing block for logged-out visitors', () => {
    renderHome()

    expect(
      screen.getByRole('heading', { name: /aws token designer/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('builder-stub')).not.toBeInTheDocument()
  })

  it('renders the builder for signed-in users', () => {
    renderHome({ sub: 'sub-1', email: 'dev@example.com' })

    expect(screen.getByText('builder-stub')).toBeInTheDocument()
    expect(screen.queryByText('Registration successful.')).not.toBeInTheDocument()
  })

  it('shows the registration banner for ~4 seconds and clears the router state', () => {
    vi.useFakeTimers()

    renderHome(
      { sub: 'sub-1', email: 'dev@example.com' },
      { registrationSuccess: true },
    )

    expect(screen.getByText('Registration successful.')).toBeInTheDocument()
    expect(screen.getByTestId('location-state')).toHaveTextContent('null')

    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(screen.getByText('Registration successful.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Registration successful.')).not.toBeInTheDocument()
  })
})
