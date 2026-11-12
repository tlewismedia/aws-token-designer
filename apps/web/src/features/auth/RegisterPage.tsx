import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button/Button'
import { useAuth } from '../../contexts/auth-context'
import { ApiError } from '../../lib/api'
import './Register.css'

export default function RegisterPage() {
  const { signUp, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      // Auto-confirm is enabled for the demo; sign in right after.
      await signUp(email, password)
      await signIn(email, password)
      navigate('/', {
        replace: true,
        state: { registrationSuccess: true },
      })
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not create the account. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="register-container">
      <form className="register-form" onSubmit={(e) => void handleSubmit(e)}>
        <h2>Register</h2>
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm password"
          aria-label="Confirm password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p className="register-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Registering…' : 'Register'}
        </Button>
      </form>
    </div>
  )
}
