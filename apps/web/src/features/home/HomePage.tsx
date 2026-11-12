// Marketing page for logged-out visitors; the builder for signed-in users
// (FR-13, matches the source Home behavior).

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/auth-context'
import Promotion from '../../components/Promotion/Promotion'
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
      <Promotion />
    </div>
  )
}
