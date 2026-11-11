import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'
import { useMe } from '../hooks/useMe'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const me = useMe()

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        AWS Token Designer
      </Link>
      <div className="navbar-actions">
        {user ? (
          <>
            {me.data && (
              <span className="credits" title="Available credits">
                {me.data.profile.credits} credits
              </span>
            )}
            <button className="btn btn-secondary" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-secondary">
              Sign in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
