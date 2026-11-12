import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context'
import Home from './Home'

vi.mock('../../components/SheetBuilder/SheetBuilder', () => ({
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
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<p>register-stub</p>} />
          <Route path="/login" element={<p>login-stub</p>} />
        </Routes>
        <LocationProbe />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Home', () => {
  it('renders the full promotion page for logged-out visitors', () => {
    renderHome()

    expect(screen.getByText(/Token Shoppe/)).toHaveTextContent('Token Shoppe beta')
    expect(
      screen.getByText(/fastest, easiest way to create game tokens/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Spend less time prepping and more time playing.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Designed to be as easy as possible to create game tokens',
      }),
    ).toBeInTheDocument()

    expect(screen.getAllByRole('button', { name: 'Sign Up Now' })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'login' })).toHaveAttribute(
      'href',
      '/login',
    )

    // All five promotion images are present.
    expect(screen.getByRole('img', { name: 'Cost of a coffee' })).toHaveAttribute(
      'src',
      '/images/cup.png',
    )
    expect(screen.getByRole('img', { name: 'Bag of tokens' })).toHaveAttribute(
      'src',
      '/images/bag.png',
    )
    expect(screen.getByRole('img', { name: 'Step 1' })).toHaveAttribute(
      'src',
      '/images/create.png',
    )
    expect(screen.getByRole('img', { name: 'Step 2' })).toHaveAttribute(
      'src',
      '/images/sheet.png',
    )
    expect(screen.getByRole('img', { name: 'Step 3' })).toHaveAttribute(
      'src',
      '/images/printer.png',
    )

    expect(screen.queryByText('builder-stub')).not.toBeInTheDocument()
  })

  it('navigates to registration from the sign-up buttons', async () => {
    renderHome()

    await userEvent.click(screen.getAllByRole('button', { name: 'Sign Up Now' })[0])

    expect(screen.getByText('register-stub')).toBeInTheDocument()
  })

  it('navigates to login from the login link', async () => {
    renderHome()

    await userEvent.click(screen.getByRole('link', { name: 'login' }))

    expect(screen.getByText('login-stub')).toBeInTheDocument()
  })

  it('renders the builder for signed-in users instead of the promotion', () => {
    renderHome({ sub: 'sub-1', email: 'dev@example.com' })

    expect(screen.getByText('builder-stub')).toBeInTheDocument()
    expect(screen.queryByText(/fastest, easiest way/i)).not.toBeInTheDocument()
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
