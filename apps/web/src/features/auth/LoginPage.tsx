import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button/Button'
import { useAuth } from '../../contexts/auth-context'
import { ApiError } from '../../lib/api'
import './Login.css'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not sign in. Check your email and password.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={(e) => void handleSubmit(e)}>
        <h2>Login</h2>
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Login'}
        </Button>
      </form>
    </div>
  )
}
