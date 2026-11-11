// Typed API errors mapped to the shared error envelope (PLAN 6.4).

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const unauthorized = (message = 'Authentication required'): ApiError =>
  new ApiError(401, 'UNAUTHENTICATED', message)

export const forbidden = (message = 'You do not have access to this resource'): ApiError =>
  new ApiError(403, 'FORBIDDEN', message)

export const notFound = (message = 'Resource not found'): ApiError =>
  new ApiError(404, 'NOT_FOUND', message)

export const badRequest = (message = 'Invalid request'): ApiError =>
  new ApiError(400, 'INVALID_REQUEST', message)

export const validationError = (message = 'Validation failed'): ApiError =>
  new ApiError(400, 'VALIDATION_ERROR', message)

export const conflict = (message = 'Conflict'): ApiError =>
  new ApiError(409, 'CONFLICT', message)

export const payloadTooLarge = (message = 'File exceeds the 10 MB limit'): ApiError =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', message)

export const rateLimited = (message = 'Daily generation limit reached'): ApiError =>
  new ApiError(429, 'RATE_LIMITED', message)

export const internalError = (message = 'Internal server error'): ApiError =>
  new ApiError(500, 'INTERNAL_ERROR', message)
