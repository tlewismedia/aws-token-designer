// DynamoDB repository for the single table (docs/PLAN.md section 6.5).
//
// Item shapes:
//   Profile : PK USER#<sub>  SK PROFILE            (email, credits)
//   Image   : PK USER#<sub>  SK IMAGE#<ulid>       (entityId = ulid, status, S3 keys)
//   Sheet   : PK USER#<sub>  SK SHEET#<ulid>       (entityId = ulid, name, images[])
//   Job     : PK USER#<sub>  SK JOB#<ulid>         (entityId = ulid, status, imageId, prompt)
//   Rate    : PK USER#<sub>  SK RATE#<yyyy-mm-dd>  (count, expiresAt TTL)
//
// Image/sheet/job items carry an `entityId` attribute indexed by the `byId`
// GSI so handlers can distinguish "does not exist" (404) from "owned by
// someone else" (403) — see the ownership checks in the routes.

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
import type { Image, Job, JobStatus, Profile, Sheet } from '@aws-token-designer/shared'
import {
  DAILY_GENERATION_CAP,
  DEFAULT_CREDITS,
  DEFAULT_SHEET_NAME,
  DEFAULT_SHEET_TEMPLATE,
  JOB_PROCESSING_LEASE_MS,
  MAX_SHEET_TOKENS,
  PK_PREFIX,
  RATE_TTL_DAYS,
  SK_IMAGE_PREFIX,
  SK_JOB_PREFIX,
  SK_PROFILE,
  SK_RATE_PREFIX,
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

export interface JobItem extends EntityItem {
  type: 'generation'
  status: JobStatus
  imageId: string
  prompt: string
  negativePrompt?: string
  style?: Job['style']
  error?: string
  /** ISO timestamp of the current processing lease start. */
  processingAt?: string
  expiresAt?: number
}

/** Jobs carry `entityId` so the API can answer 403 vs 404 for path ids. */
export function toJobItem(job: Job): JobItem {
  const { sub, id, ...rest } = job
  return stripUndefined({
    PK: `${PK_PREFIX}${sub}`,
    SK: `${SK_JOB_PREFIX}${id}`,
    entityId: id,
    ...rest,
  }) as unknown as JobItem
}

export function jobFromItem(item: JobItem): Job {
  return {
    id: item.entityId,
    sub: subFromPk(item.PK),
    type: item.type,
    status: item.status,
    imageId: item.imageId,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    style: item.style,
    error: item.error,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    expiresAt: item.expiresAt,
  }
}

/** UTC date key for the daily generation cap (`RATE#<yyyy-mm-dd>`). */
export function utcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function toItem(entity: Omit<Image, 'sub'> & { sub: string }): ImageItem
export function toItem(entity: Sheet): SheetItem
export function toItem(entity: Record<string, unknown>): EntityItem {
  const sub = entity.sub as string
  const id = entity.id as string
  if ('status' in entity && 'fullKey' in entity) {
    const { sub: _sub, id: _id, ...rest } = entity
    return stripUndefined({
      PK: `${PK_PREFIX}${sub}`,
      SK: `${SK_IMAGE_PREFIX}${id}`,
      entityId: id,
      ...rest,
    }) as unknown as ImageItem
  }
  const { sub: _sub, id: _id, ...rest } = entity
  return stripUndefined({
    PK: `${PK_PREFIX}${sub}`,
    SK: `${SK_SHEET_PREFIX}${id}`,
    entityId: id,
    ...rest,
  }) as unknown as SheetItem
}

/**
 * Drop keys whose value is undefined. Optional entity fields (description,
 * style, updatedAt) reach toItem as present-but-undefined keys, and the SDK
 * marshalling step would otherwise throw (defense in depth alongside the
 * removeUndefinedValues option on the production DocumentClient).
 */
function stripUndefined(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined))
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

  // -- Jobs ------------------------------------------------------------------

  async putJob(job: Job): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: toJobItem(job) }))
  }

  /** Direct lookup inside the caller's partition (used by the worker). */
  async getJob(sub: string, jobId: string): Promise<JobItem | null> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_JOB_PREFIX}${jobId}` },
      }),
    )
    return (res.Item as JobItem | undefined) ?? null
  }

  /** Cross-partition lookup via the `byId` GSI (403 vs 404 for GET /jobs). */
  async findJobById(entityId: string): Promise<JobItem | null> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'byId',
        KeyConditionExpression: 'entityId = :id',
        ExpressionAttributeValues: { ':id': entityId },
        Limit: 1,
      }),
    )
    return (res.Items?.[0] as JobItem | undefined) ?? null
  }

  async getJobForSub(sub: string, jobId: string): Promise<JobItem> {
    const item = await this.findJobById(jobId)
    if (!item) throw notFound('Job not found')
    if (item.PK !== `${PK_PREFIX}${sub}`) throw forbidden('Job belongs to another user')
    return item
  }

  /**
   * Idempotency gate for the worker: pending → processing. A second attempt
   * while the lease is fresh no-ops; a retry may reclaim a `processing` job
   * whose `processingAt` is older than JOB_PROCESSING_LEASE_MS (e.g. the first
   * worker died mid-flight), so jobs cannot stay stuck forever.
   * Returns false when another attempt holds a fresh lease or the job is
   * terminal.
   */
  async claimJobForProcessing(sub: string, jobId: string): Promise<boolean> {
    const now = nowIso()
    const staleBefore = new Date(Date.now() - JOB_PROCESSING_LEASE_MS).toISOString()
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_JOB_PREFIX}${jobId}` },
          UpdateExpression: 'SET #status = :processing, processingAt = :now, updatedAt = :now',
          // attribute_not_exists covers jobs claimed before processingAt was
          // introduced; they are treated as stale and reclaimable.
          ConditionExpression:
            '#status = :pending OR (#status = :processing AND (attribute_not_exists(processingAt) OR processingAt < :staleBefore))',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':processing': 'processing',
            ':pending': 'pending',
            ':now': now,
            ':staleBefore': staleBefore,
          },
        }),
      )
      return true
    } catch (err) {
      if (isConditionalCheckFailed(err)) return false
      throw err
    }
  }

  /**
   * Worker-only success transition. Conditional so an older/late attempt (or
   * an API-side invoke failure) can never flip a terminal job; a conditional
   * failure is a logged no-op.
   */
  async markJobSucceeded(sub: string, jobId: string, imageId: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_JOB_PREFIX}${jobId}` },
          UpdateExpression:
            'SET #status = :status, imageId = :imageId, updatedAt = :now REMOVE #error',
          ConditionExpression: '#status = :processing',
          ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
          ExpressionAttributeValues: {
            ':status': 'succeeded',
            ':imageId': imageId,
            ':processing': 'processing',
            ':now': nowIso(),
          },
        }),
      )
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        logJobTransitionNoop(jobId, 'succeeded')
        return
      }
      throw err
    }
  }

  /**
   * Terminal-safe failure transition. Only pending/processing jobs can fail;
   * a late API invoke failure therefore cannot overwrite a job the worker
   * already marked succeeded. Conditional failure is a logged no-op.
   */
  async markJobFailed(sub: string, jobId: string, errorCode: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_JOB_PREFIX}${jobId}` },
          UpdateExpression: 'SET #status = :status, #error = :error, updatedAt = :now',
          ConditionExpression: '#status IN (:pending, :processing)',
          ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':error': errorCode,
            ':pending': 'pending',
            ':processing': 'processing',
            ':now': nowIso(),
          },
        }),
      )
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        logJobTransitionNoop(jobId, 'failed')
        return
      }
      throw err
    }
  }

  // -- Daily generation cap --------------------------------------------------

  /**
   * Atomically consume one generation from the user's daily allowance.
   * Returns false when the cap is already reached. The condition is evaluated
   * server-side, so two racing requests cannot both exceed the cap.
   *
   * Cap accounting: the increment happens before job creation/invoke, so a
   * failed submission still consumes one slot. That is deliberate — it keeps
   * the cap binding even when a caller repeatedly invokes a failing worker.
   */
  async consumeDailyGeneration(
    sub: string,
    date: string = utcDateKey(),
  ): Promise<boolean> {
    const expiresAt = Math.floor(Date.now() / 1000) + RATE_TTL_DAYS * 24 * 60 * 60
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `${PK_PREFIX}${sub}`, SK: `${SK_RATE_PREFIX}${date}` },
          UpdateExpression: 'SET expiresAt = if_not_exists(expiresAt, :exp) ADD #count :one',
          ConditionExpression: 'attribute_not_exists(#count) OR #count < :max',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: {
            ':one': 1,
            ':max': DAILY_GENERATION_CAP,
            ':exp': expiresAt,
          },
          ReturnValues: 'UPDATED_NEW',
        }),
      )
      return true
    } catch (err) {
      if (isConditionalCheckFailed(err)) return false
      throw err
    }
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

  /**
   * Create the profile + default sheet; safe to call on every GET /me.
   *
   * Benign first-login race: two concurrent first requests can both see zero
   * sheets and each put a default sheet, leaving the user with two. This is a
   * demo-only edge (the UI always edits the newest sheet and the result is
   * still usable); a conditional write would need a fixed sheet id.
   */
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

/** A conditional terminal transition lost to an already-terminal job. */
function logJobTransitionNoop(jobId: string, attempted: 'succeeded' | 'failed'): void {
  console.log(
    JSON.stringify({
      level: 'info',
      component: 'repo',
      message: 'job already terminal; transition ignored',
      jobId,
      attempted,
    }),
  )
}

function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  )
}

/**
 * Production-shaped DocumentClient. `removeUndefinedValues` is required:
 * entity items legitimately carry optional fields and SDK v3 refuses to
 * marshall undefined values (AWS SDK v3 error: "Pass options.removeUndefinedValues=true").
 * The integration tests reuse this factory so they exercise the same
 * configuration the Lambda runs with.
 */
export function createDocClient(options: { endpoint?: string; region?: string } = {}): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient(
      options.endpoint
        ? {
            region: options.region ?? 'us-west-2',
            endpoint: options.endpoint,
            credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
          }
        : {},
    ),
    { marshallOptions: { removeUndefinedValues: true } },
  )
}

let singleton: Repo | null = null

/** Shared repo built from process.env (TABLE_NAME). */
export function getRepo(): Repo {
  if (!singleton) {
    const tableName = process.env.TABLE_NAME
    if (!tableName) throw internalError('TABLE_NAME is not set')
    singleton = new Repo(createDocClient(), tableName)
  }
  return singleton
}
