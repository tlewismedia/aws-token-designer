// Image queries + mutations: list, upload (presign → S3 PUT → complete),
// delete (FR-5, FR-6, FR-10).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ImageWithUrls,
  ImagesResponse,
  UploadUrlResponse,
} from '@aws-token-designer/shared'
import { MAX_UPLOAD_BYTES, IMAGE_CONTENT_TYPES } from '@aws-token-designer/shared'
import { useAuth } from '../contexts/auth-context'
import { apiFetch, ApiError } from '../lib/api'
import { queryKeys } from '../lib/query-client'

export function useImages() {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  return useQuery({
    queryKey: queryKeys.images(sub),
    enabled: Boolean(user),
    queryFn: () => apiFetch<ImagesResponse>('/images'),
  })
}

export interface UploadImageInput {
  file: File
  name: string
  description?: string
  style?: 'photographic' | 'anime'
}

export function useUploadImage() {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadImageInput): Promise<ImageWithUrls> => {
      const { file, name, description, style } = input
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Images must be 10 MB or smaller')
      }
      if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
        throw new ApiError(400, 'INVALID_REQUEST', 'Only PNG, JPEG, or WebP images are supported')
      }
      const presign = await apiFetch<UploadUrlResponse>('/images/upload-url', {
        method: 'POST',
        body: { name, description, style, contentType: file.type },
      })
      // Browser uploads straight to S3 (PLAN 6.6).
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) {
        throw new ApiError(put.status, 'UPLOAD_FAILED', 'Upload to storage failed')
      }
      // Synchronous processing server-side (validate, strip EXIF, thumbnail).
      return apiFetch<ImageWithUrls>(`/images/${presign.imageId}/complete`, { method: 'POST' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.images(sub) })
    },
  })
}

export function useDeleteImage() {
  const { user } = useAuth()
  const sub = user?.sub ?? ''
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (imageId: string) =>
      apiFetch<void>(`/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.images(sub) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sheets(sub) })
    },
  })
}
