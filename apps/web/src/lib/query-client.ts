// TanStack Query client + keys (PLAN 6.9).

import { QueryClient } from '@tanstack/react-query'

export const queryKeys = {
  me: (sub: string) => ['profile', sub] as const,
  images: (sub: string) => ['images', sub] as const,
  sheets: (sub: string) => ['sheets', sub] as const,
  job: (sub: string, jobId: string) => ['job', sub, jobId] as const,
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  })
}
