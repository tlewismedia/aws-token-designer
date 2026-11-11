// Query hooks for /me: profile + credits (FR-2, FR-3).

import { useQuery } from '@tanstack/react-query'
import type { MeResponse } from '@aws-token-designer/shared'
import { useAuth } from '../contexts/auth-context'
import { apiFetch } from '../lib/api'
import { queryKeys } from '../lib/query-client'

export function useMe() {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  return useQuery({
    queryKey: queryKeys.me(sub),
    enabled: Boolean(user),
    queryFn: () => apiFetch<MeResponse>('/me'),
  })
}
