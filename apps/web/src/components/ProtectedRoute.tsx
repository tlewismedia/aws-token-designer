// Protected routes: redirect unauthenticated users to /login (FR-14).

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/auth-context'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return <p className="loading">Loading…</p>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
