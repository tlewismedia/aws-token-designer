// AuthProvider: user state + signIn/signUp/signOut.
// Logout clears the TanStack Query cache (FR-1, PLAN 6.9).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth'
import { AuthContext, type AuthContextValue } from './auth-context'
import { UNAUTHORIZED_EVENT } from '../lib/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    async function restore(): Promise<void> {
      try {
        const current = await getCurrentUser()
        const session = await fetchAuthSession()
        const sub = session.tokens?.idToken?.payload.sub
        if (cancelled) return
        if (sub) {
          setUser({
            sub: String(sub),
            email: String(current.username ?? ''),
          })
        }
      } catch {
        // Not signed in — normal state.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(async () => {
    await amplifySignOut()
    setUser(null)
    // Drop every cached query — no cross-account data leakage (FR-1).
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    const onUnauthorized = () => {
      void signOut()
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [signOut])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await amplifySignIn({ username: email, password })
    if (result.isSignedIn) {
      const current = await getCurrentUser()
      const session = await fetchAuthSession()
      const sub = session.tokens?.idToken?.payload.sub
      if (sub) {
        setUser({ sub: String(sub), email: String(current.username ?? email) })
      }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    // Auto-confirm is on (pre-sign-up trigger), so sign-in works immediately.
    await amplifySignUp({ username: email, password, options: { userAttributes: { email } } })
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
