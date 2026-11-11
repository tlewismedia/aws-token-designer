// Minimal monotonic ULID generator (Crockford base32, 48-bit time + 80-bit
// randomness, sortable lexicographically). Avoids an extra dependency for one
// small primitive; see docs/PLAN.md section 6.5 for the key scheme.

import { randomBytes } from 'node:crypto'

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_LEN = 10
const RANDOM_LEN = 16

let lastTime = -1
let lastRandom: Uint8Array = randomBytes(RANDOM_LEN)

function encodeTime(time: number): string {
  let out = ''
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[time % 32] + out
    time = Math.floor(time / 32)
  }
  return out
}

function encodeRandom(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < RANDOM_LEN; i++) {
    out += ENCODING[bytes[i] % 32]
  }
  return out
}

function incrementRandom(bytes: Uint8Array): Uint8Array {
  const next = new Uint8Array(bytes)
  for (let i = next.length - 1; i >= 0; i--) {
    next[i] = (next[i] + 1) & 0xff
    if (next[i] !== 0) break
  }
  return next
}

/** Generate a new monotonic ULID (safe for sequential calls in one process). */
export function ulid(now: number = Date.now()): string {
  if (now <= lastTime) {
    lastRandom = incrementRandom(lastRandom)
  } else {
    lastTime = now
    lastRandom = randomBytes(RANDOM_LEN)
  }
  return encodeTime(now) + encodeRandom(lastRandom)
}
