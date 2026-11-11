// Sheet routes: CRUD + add/remove token (FR-7–FR-9, max 63 enforced server-side).

import {
  addTokenRequestSchema,
  createSheetRequestSchema,
  updateSheetRequestSchema,
  type Sheet,
} from '@aws-token-designer/shared'
import type { App } from '../app.js'
import { parseJsonBody } from '../app.js'
import { badRequest, notFound } from '../lib/errors.js'
import { getRepo, sheetFromItem } from '../lib/db.js'
import { ulid } from '../lib/ulid.js'

export function registerSheetsRoutes(app: App): void {
  app.get('/sheets', async (c) => {
    const repo = getRepo()
    const sheets = await repo.listSheets(c.get('sub'))
    return c.json({ sheets })
  })

  app.post('/sheets', async (c) => {
    const body = await parseJsonBody(c, createSheetRequestSchema)
    const repo = getRepo()
    const sub = c.get('sub')
    const sheet: Sheet = {
      id: ulid(),
      sub,
      name: body.name,
      template: body.template,
      images: [],
      createdAt: new Date().toISOString(),
    }
    await repo.putSheet(sheet)
    return c.json({ sheet }, 201)
  })

  app.patch('/sheets/:id', async (c) => {
    const body = await parseJsonBody(c, updateSheetRequestSchema)
    const repo = getRepo()
    const sub = c.get('sub')
    const sheetId = c.req.param('id')

    await repo.getSheetForSub(sub, sheetId) // ownership + existence
    await repo.updateSheet(sub, sheetId, body)
    const item = await repo.getSheetForSub(sub, sheetId)
    return c.json({ sheet: sheetFromItem(item) })
  })

  app.delete('/sheets/:id', async (c) => {
    const repo = getRepo()
    const sub = c.get('sub')
    const sheetId = c.req.param('id')
    await repo.getSheetForSub(sub, sheetId) // ownership + existence
    await repo.deleteSheetItem(sub, sheetId)
    return c.body(null, 204)
  })

  // Add a token (image id) to a sheet (FR-7). Duplicates are allowed, as in
  // the source app. 409 when the sheet is at the 63-token limit.
  app.post('/sheets/:id/images', async (c) => {
    const body = await parseJsonBody(c, addTokenRequestSchema)
    const repo = getRepo()
    const sub = c.get('sub')
    const sheetId = c.req.param('id')

    await repo.getSheetForSub(sub, sheetId)
    const image = await repo.getImageForSub(sub, body.imageId)
    if (image.status !== 'ready') {
      throw badRequest('Only ready images can be added to a sheet')
    }
    await repo.addTokenToSheet(sub, sheetId, body.imageId)
    const item = await repo.getSheetForSub(sub, sheetId)
    return c.json({ sheet: sheetFromItem(item) }, 201)
  })

  // Remove a token by index (FR-8).
  app.delete('/sheets/:id/images/:index', async (c) => {
    const repo = getRepo()
    const sub = c.get('sub')
    const sheetId = c.req.param('id')
    const rawIndex = c.req.param('index')
    const index = Number.parseInt(rawIndex, 10)
    if (!Number.isInteger(index) || index < 0) {
      throw badRequest('Index must be a non-negative integer')
    }

    const item = await repo.getSheetForSub(sub, sheetId)
    const images = [...(item.images ?? [])]
    if (index >= images.length) {
      throw notFound(`No token at index ${index}`)
    }
    images.splice(index, 1)
    await repo.updateSheet(sub, sheetId, { images })
    const updated = await repo.getSheetForSub(sub, sheetId)
    return c.json({ sheet: sheetFromItem(updated) })
  })
}
