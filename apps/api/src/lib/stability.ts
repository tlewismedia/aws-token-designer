// Stability AI client for the generateWorker (PLAN 6.7).
//
// Uses the Node 22 global `fetch`/`FormData`/`Blob`; the Stability key comes
// from SSM SecureString and is only ever placed in the Authorization header.
// Non-2xx responses throw a typed error carrying the status for safe logging
// (the response body may contain provider details, so it is not propagated).

import type { ImageStyle } from '@aws-token-designer/shared'
import { STABILITY_TIMEOUT_MS } from '@aws-token-designer/shared'

export const STABILITY_ULTRA_URL =
  'https://api.stability.ai/v2beta/stable-image/generate/ultra'

export class StabilityError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Stability request failed with status ${status}`)
    this.name = 'StabilityError'
    this.status = status
  }
}

export interface StabilityRequest {
  apiKey: string
  prompt: string
  negativePrompt?: string
  style?: ImageStyle
  /** Override for tests; defaults to the production endpoint. */
  url?: string
  /** Override for tests; defaults to STABILITY_TIMEOUT_MS. */
  timeoutMs?: number
}

/** Map the app's style ids to Stability `style_preset` values. */
export function stylePreset(style: ImageStyle | undefined): string | undefined {
  // Stability's preset names match the app's style ids today.
  return style
}

/** Call Stability ultra and return the generated PNG bytes. */
export async function generateStabilityImage(input: StabilityRequest): Promise<Buffer> {
  const form = new FormData()
  form.append('prompt', input.prompt)
  if (input.negativePrompt) form.append('negative_prompt', input.negativePrompt)
  form.append('aspect_ratio', '1:1')
  form.append('output_format', 'png')
  const preset = stylePreset(input.style)
  if (preset) form.append('style_preset', preset)

  let res: Response
  try {
    res = await fetch(input.url ?? STABILITY_ULTRA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'image/*',
      },
      body: form,
      signal: AbortSignal.timeout(input.timeoutMs ?? STABILITY_TIMEOUT_MS),
    })
  } catch {
    // Network/timeout failures are wrapped so the worker never sees (or logs)
    // provider internals.
    throw new StabilityError(0)
  }

  if (!res.ok) {
    throw new StabilityError(res.status)
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length === 0) throw new StabilityError(res.status)
  return bytes
}
