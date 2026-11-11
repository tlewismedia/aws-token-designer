// GET /me: lazy profile + default-sheet bootstrap (PLAN 6.3, FR-2, FR-3).

import type { App } from '../app.js'
import { getRepo } from '../lib/db.js'

export function registerMeRoutes(app: App): void {
  app.get('/me', async (c) => {
    const sub = c.get('sub')
    const email = c.get('email')
    const repo = getRepo()

    let profile = await repo.getProfile(sub)
    if (!profile) {
      await repo.createProfileIfAbsent(sub, email)
      profile = await repo.getProfile(sub)
    }
    if (!profile) {
      // Cannot happen: createProfileIfAbsent either wrote or found one.
      throw new Error('Profile bootstrap failed')
    }

    // First login creates the default sheet (idempotent, FR-3).
    await repo.ensureDefaultSheet(sub)
    const sheets = await repo.listSheets(sub)

    return c.json({ profile, sheets })
  })
}
