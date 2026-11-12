// Sheet queries + mutations with optimistic updates for add/remove/clear
// (PLAN 6.9). The sheet the UI edits is the newest one (single-sheet UI,
// matching the source app).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SheetsResponse, Sheet } from '@aws-token-designer/shared'
import { MAX_SHEET_TOKENS } from '@aws-token-designer/shared/constants'
import { useAuth } from '../contexts/auth-context'
import { apiFetch } from '../lib/api'
import { queryKeys } from '../lib/query-client'

export function useSheets() {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const query = useQuery({
    queryKey: queryKeys.sheets(sub),
    enabled: Boolean(user),
    queryFn: () => apiFetch<SheetsResponse>('/sheets'),
  })
  return { ...query, latestSheet: query.data?.sheets[0] ?? undefined }
}

interface SheetCacheHelpers {
  invalidate: () => void
  setOptimistic: (updater: (sheet: Sheet) => Sheet) => void
  latestSheet: () => Sheet | undefined
}

function useSheetCacheHelpers(): SheetCacheHelpers {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const queryClient = useQueryClient()
  const key = queryKeys.sheets(sub)
  return {
    invalidate: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
    setOptimistic: (updater) => {
      const current = queryClient.getQueryData<SheetsResponse>(key)
      if (!current?.sheets[0]) return
      const [latest, ...rest] = current.sheets
      queryClient.setQueryData<SheetsResponse>(key, {
        sheets: [updater({ ...latest }), ...rest],
      })
    },
    latestSheet: () => queryClient.getQueryData<SheetsResponse>(key)?.sheets[0],
  }
}

export function useAddToken() {
  const helpers = useSheetCacheHelpers()
  return useMutation({
    mutationFn: async (imageId: string) => {
      const latest = helpers.latestSheet()
      if (!latest) throw new Error('No sheet available')
      return apiFetch<{ sheet: Sheet }>(`/sheets/${latest.id}/images`, {
        method: 'POST',
        body: { imageId },
      })
    },
    onMutate: (imageId) => {
      helpers.setOptimistic((sheet) => ({ ...sheet, images: [...sheet.images, imageId] }))
    },
    onError: helpers.invalidate,
    onSuccess: helpers.invalidate,
  })
}

export function useRemoveToken() {
  const helpers = useSheetCacheHelpers()
  return useMutation({
    mutationFn: async (index: number) => {
      const latest = helpers.latestSheet()
      if (!latest) throw new Error('No sheet available')
      return apiFetch<{ sheet: Sheet }>(`/sheets/${latest.id}/images/${index}`, {
        method: 'DELETE',
      })
    },
    onMutate: (index) => {
      helpers.setOptimistic((sheet) => ({
        ...sheet,
        images: sheet.images.filter((_, i) => i !== index),
      }))
    },
    onError: helpers.invalidate,
    onSuccess: helpers.invalidate,
  })
}

export function useClearSheet() {
  const helpers = useSheetCacheHelpers()
  return useMutation({
    mutationFn: async () => {
      const latest = helpers.latestSheet()
      if (!latest) throw new Error('No sheet available')
      return apiFetch<{ sheet: Sheet }>(`/sheets/${latest.id}`, {
        method: 'PATCH',
        body: { images: [] },
      })
    },
    onMutate: () => {
      helpers.setOptimistic((sheet) => ({ ...sheet, images: [] }))
    },
    onError: helpers.invalidate,
    onSuccess: helpers.invalidate,
  })
}

export function useCreateSheet() {
  const helpers = useSheetCacheHelpers()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ sheet: Sheet }>('/sheets', { method: 'POST', body: { name } }),
    onSuccess: helpers.invalidate,
  })
}

export const MAX_TOKENS = MAX_SHEET_TOKENS
