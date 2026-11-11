// DynamoDB repository for the single table (docs/PLAN.md section 6.5).
//
// Item shapes:
//   Profile : PK USER#<sub>  SK PROFILE            (email, credits)
//   Image   : PK USER#<sub>  SK IMAGE#<ulid>       (entityId = ulid, status, S3 keys)
//   Sheet   : PK USER#<sub>  SK SHEET#<ulid>       (entityId = ulid, name, images[])
//
// Image/sheet items carry an `entityId` attribute indexed by the `byId` GSI so
// handlers can distinguish "does not exist" (404) from "owned by someone else"
// (403) — see the ownership checks in the routes.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  type NativeAttributeValue,
} from '@aws-sdk/lib-dynamodb'
import type { Image, Profile, Sheet } from '@aws-token-designer/shared'
import {
  DEFAULT_CREDITS,
  DEFAULT_SHEET_NAME,
  DEFAULT_SHEET_TEMPLATE,
  MAX_SHEET_TOKENS,
  PK_PREFIX,
  SK_IMAGE_PREFIX,
  SK_PROFILE,
  SK_SHEET_PREFIX,
} from '@aws-token-designer/shared'
import { conflict, forbidden, internalError, notFound } from './errors.js'
import { ulid } from './ulid.js'

export const nowIso = (): string => new Date().toISOString()

export function subFromPk(pk: string): string {
  if (!pk.startsWith(PK_PREFIX)) {
    throw internalError('Malformed partition key')
  }
  return pk.slice(PK_PREFIX.length)
}

/** Minimal shape of an image or sheet item, shared by both entity types. */
export type EntityItem = Record<string, NativeAttributeValue> & {
  PK: string
  SK: string
  entityId: string
  createdAt: string
  updatedAt?: string
}

export interface ImageItem extends EntityItem {
  name: string
  status: Image['status']
  fullKey: string
  thumbKey: string
  contentType: string
  description?: string
  style?: string
}

export interface SheetItem extends EntityItem {
  name: string
  template: string
  images: string[]
}

export function toItem(entity: Omit<Image, 'sub'> & { sub: string }): ImageItem
export function toItem(entity: Sheet): SheetItem
export function toItem(entity: Record<string, unknown>): EntityItem {
  const sub = entity.sub as string
  const id = entity.id as string
  if ('status' in entity && 'fullKey' in entity) {
    const { sub: _sub, id: _id, ...rest } = entity
    return {
      PK: `${PK_PREFIX}${sub}`,
      SK: `${SK_IMAGE_PREFIX}${id}`,
      entityId: id,
      ...rest,
    } as unknown as ImageItem
  }
  const { sub: _sub, id: _id, ...rest } = entity
  return {
    PK: `${PK_PREFIX}${sub}`,
    SK: `${SK_SHEET_PREFIX}${id}`,
    entityId: id,
    ...rest,
  } as unknown as SheetItem
}

export function imageFromItem(item: ImageItem): Image {
  return {
    id: item.entityId,
    sub: subFromPk(item.PK),
    name: item.name,
    description: item.description,
    style: item.style as Image['style'] | undefined,
    status: item.status,
    fullKey: item.fullKey,
    thumbKey: item.thumbKey,
    contentType: item.contentType,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function sheetFromItem(item: SheetItem): Sheet {
  return {
    id: item.entityId,
    sub: subFromPk(item.PK),
    name: item.name,
    template: item.template,
    images: item.images ?? [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export class Repo {
  private readonly doc: DynamoDBDocumentClient

  constructor(
    doc: DynamoDBDocumentClient,
    private readonly table: string,
  ) {
    this.doc = doc
  }

  // -- Profile ---------------------------------------------------------------

  async getProfile(sub: string): Promise<Profile | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: `${PK_PREFIX}${sub}`, SK: SK_PROFILE } }),
    )
    if (!res.Item) return null
    return {
      sub,
      email: res.Item.email,
      credits: res.Item.credits,
      createdAt: res.Item.createdAt,
      updatedAt: res.Item.updatedAt,
    }
  }

  /** Create the profile if absent; returns it either way (idempotent). */
  async createProfileIfAbsent(sub: string, email: string): Promise<Profile | null> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            PK: `${PK_PREFIX}${sub}`,
            SK: SK_PROFILE,
            email,
            credits: DEFAULT_CREDITS,
            createdAt: nowIso(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      return null
    } catch (err) {
      if (isConditionalCheckFailed(err)) return null
      throw err
    }
  }

  // -- Images ----------------------------------------------------------------

  async putImage(image: Image): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: toItem(image) }),
    )
  }

  /**
   * Look up an image by id via the `byId` GSI. Returns the item, or null when
   * no item has that id. Ownership is checked against `PK` by the caller.
   */
  async findImageById(entityId: string): Promise<ImageItem | null> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'byId',
        KeyConditionExpression: 'entityId = :id',
        ExpressionAttributeValues: { ':id': entityId },
        Limit: 1,
      }),
    )
    return (res.Items?.[0] as ImageItem | undefined) ?? null
  }

  /** Fetch the caller's image by id, enforcing ownership (403 cross-user). */
  async getImageForSub(sub: string, imageId: string): Promise<ImageItem> {
    const item = await this.findImageById(imageId)
    if (!item) throw notFound('Image not found')
    if (item.PK !== `${PK_PREFIX}${sub}`) throw forbidden('Image belongs to another user')
    return item
  }

  async listImages(sub: string): Promise<Image[]> {
    const items = await this.queryPartition(sub, SK_IMAGE_PREFIX)
    return items.map((item) => imageFromItem(item as ImageItem))
  }

  async updateImageStatus(sub: string, imageId: string, status: Image['status']): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_IMAGE_PREFIX}${imageId}` },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':now': nowIso() },
      }),
    )
  }

  async deleteImageItem(sub: string, imageId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_IMAGE_PREFIX}${imageId}` },
      }),
    )
  }

  // -- Sheets ----------------------------------------------------------------

  async putSheet(sheet: Sheet): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: toItem(sheet) }),
    )
  }

  async findSheetById(entityId: string): Promise<SheetItem | null> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'byId',
        KeyConditionExpression: 'entityId = :id',
        ExpressionAttributeValues: { ':id': entityId },
        Limit: 1,
      }),
    )
    return (res.Items?.[0] as SheetItem | undefined) ?? null
  }

  async getSheetForSub(sub: string, sheetId: string): Promise<SheetItem> {
    const item = await this.findSheetById(sheetId)
    if (!item) throw notFound('Sheet not found')
    if (item.PK !== `${PK_PREFIX}${sub}`) throw forbidden('Sheet belongs to another user')
    return item
  }

  async listSheets(sub: string): Promise<Sheet[]> {
    const items = await this.queryPartition(sub, SK_SHEET_PREFIX)
    return items.map((item) => sheetFromItem(item as SheetItem))
  }

  /**
   * Append an image id to a sheet with a server-side size guard. Two racing
   * writers cannot exceed the limit: the condition is re-checked at write
   * time and a lost race surfaces as 409.
   */
  async addTokenToSheet(sub: string, sheetId: string, imageId: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_SHEET_PREFIX}${sheetId}` },
          UpdateExpression: 'SET #images = list_append(#images, :image), updatedAt = :now',
          ConditionExpression: 'attribute_exists(PK) AND size(#images) < :max',
          ExpressionAttributeNames: { '#images': 'images' },
          ExpressionAttributeValues: {
            ':image': [imageId],
            ':max': MAX_SHEET_TOKENS,
            ':now': nowIso(),
          },
        }),
      )
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        throw conflict(`Sheet already has the maximum of ${MAX_SHEET_TOKENS} tokens`)
      }
      throw err
    }
  }

  async updateSheet(
    sub: string,
    sheetId: string,
    patch: { name?: string; template?: string; images?: string[] },
  ): Promise<void> {
    const setParts: string[] = []
    const names: Record<string, string> = {}
    const values: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      setParts.push('#name = :name')
      names['#name'] = 'name'
      values[':name'] = patch.name
    }
    if (patch.template !== undefined) {
      setParts.push('#template = :template')
      names['#template'] = 'template'
      values[':template'] = patch.template
    }
    if (patch.images !== undefined) {
      setParts.push('#images = :images')
      names['#images'] = 'images'
      values[':images'] = patch.images
    }
    if (setParts.length === 0) return
    values[':now'] = nowIso()
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_SHEET_PREFIX}${sheetId}` },
          UpdateExpression: `SET ${setParts.join(', ')}, updatedAt = :now`,
          ConditionExpression: 'attribute_exists(PK)',
          ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
          ExpressionAttributeValues: values,
        }),
      )
    } catch (err) {
      if (isConditionalCheckFailed(err)) throw notFound('Sheet not found')
      throw err
    }
  }

  async deleteSheetItem(sub: string, sheetId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_SHEET_PREFIX}${sheetId}` },
      }),
    )
  }

  /** Remove an image id from every sheet that references it (FR-10). */
  async removeImageFromAllSheets(sub: string, imageId: string): Promise<void> {
    const sheets = await this.listSheets(sub)
    for (const sheet of sheets) {
      if (!sheet.images.includes(imageId)) continue
      await this.updateSheet(sub, sheet.id, {
        images: sheet.images.filter((id) => id !== imageId),
      })
    }
  }

  /** Create the profile + default sheet; safe to call on every GET /me. */
  async ensureDefaultSheet(sub: string): Promise<void> {
    const sheets = await this.listSheets(sub)
    if (sheets.length > 0) return
    const id = ulid()
    const sheet: Sheet = {
      id,
      sub,
      name: DEFAULT_SHEET_NAME,
      template: DEFAULT_SHEET_TEMPLATE,
      images: [],
      createdAt: nowIso(),
    }
    await this.putSheet(sheet)
  }

  private async queryPartition(sub: string, skPrefix: string): Promise<EntityItem[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `${PK_PREFIX}${sub}`,
          ':prefix': skPrefix,
        },
        ScanIndexForward: false, // newest first
      }),
    )
    return (res.Items as EntityItem[] | undefined) ?? []
  }
}

function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  )
}

// ---------------------------------------------------------------------------
// Singleton used by the Lambda handler
// ---------------------------------------------------------------------------

function defaultDocClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}))
}

let singleton: Repo | null = null

/** Shared repo built from process.env (TABLE_NAME). */
export function getRepo(): Repo {
  if (!singleton) {
    const tableName = process.env.TABLE_NAME
    if (!tableName) throw internalError('TABLE_NAME is not set')
    singleton = new Repo(defaultDocClient(), tableName)
  }
  return singleton
}
