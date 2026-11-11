// Checkout return-page status (FR-12, PLAN 6.8/6.9). Polls a few times while
// the webhook is still applying credits, then stops and lets the user refresh.
// The status endpoint verifies ownership server-side; a 403/404 never exposes
// another user's data.

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CheckoutSessionStatusResponse } from '@aws-token-designer/shared'
import {
  CHECKOUT_POLL_INTERVAL_MS,
  CHECKOUT_POLL_MAX_ATTEMPTS,
} from '@aws-token-designer/shared'
import { useAuth } from '../contexts/auth-context'
import { apiFetch } from '../lib/api'
import { queryKeys } from '../lib/query-client'

export function useCheckoutStatus(sessionId: string | null) {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const queryClient = useQueryClient()
  const attemptsRef = useRef(0)
  const sessionRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey: queryKeys.checkout(sub, sessionId ?? ''),
    enabled: Boolean(user && sessionId),
    queryFn: () => {
      if (sessionRef.current !== sessionId) {
        sessionRef.current = sessionId
        attemptsRef.current = 0
      }
      attemptsRef.current += 1
      return apiFetch<CheckoutSessionStatusResponse>(
        `/checkout/session/${encodeURIComponent(sessionId ?? '')}`,
      )
    },
    // 403/404 are terminal for this screen; do not retry them.
    retry: false,
    refetchInterval: (current) => {
      if (current.state.data?.status !== 'pending') return false
      if (attemptsRef.current >= CHECKOUT_POLL_MAX_ATTEMPTS) return false
      return CHECKOUT_POLL_INTERVAL_MS
    },
  })

  // Credits landing should update the navbar balance without a reload.
  useEffect(() => {
    if (query.data?.status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me(sub) })
    }
  }, [query.data?.status, queryClient, sub])

  return query
}
