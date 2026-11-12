// Marketing page for logged-out visitors; the builder for signed-in users
// (FR-13, matches the source Home behavior).
//
// Promotion content is ported in a later ticket; the existing marketing block
// stands in for it until then.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/auth-context'
import SheetBuilder from '../sheets/SheetBuilder'
import './Home.css'

export default function HomePage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(
    Boolean(location.state?.registrationSuccess),
  )

  // Consume the router state so a refresh/revisit does not replay the banner.
  useEffect(() => {
    if (!location.state?.registrationSuccess) return

    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  // The banner is transient: hide it after four seconds.
  useEffect(() => {
    if (!showRegistrationSuccess) return

    const timer = window.setTimeout(() => {
      setShowRegistrationSuccess(false)
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [showRegistrationSuccess])

  if (loading) return <main className="loading">Loading…</main>

  const successBanner = showRegistrationSuccess && (
    <div className="home-success-banner">Registration successful.</div>
  )

  if (user) {
    return (
      <div className="home-container home-container--loggedin">
        {successBanner}
        <SheetBuilder />
      </div>
    )
  }

  return (
    <div className="home-container">
      {successBanner}
      <main className="marketing">
        <h1>AWS Token Designer</h1>
        <p className="tagline">
          Generate or upload RPG token images, arrange up to 63 on a print sheet, and print it —
          all in your browser.
        </p>
        <ul className="marketing-list">
          <li>Upload your own art (PNG, JPEG, WebP, GIF up to 10 MB)</li>
          <li>AI-generated tokens from a prompt (Stability AI)</li>
          <li>7×9 print sheet — 63 tokens per page</li>
        </ul>
        <p className="marketing-cta">Sign in or register to start building your first sheet.</p>
      </main>
    </div>
  )
}
