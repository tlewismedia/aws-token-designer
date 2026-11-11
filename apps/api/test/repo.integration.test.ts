// Integration tests against DynamoDB Local.
//
// Run locally:
//   docker run --rm -p 8000:8000 amazon/dynamodb-local
//   RUN_DDB_INTEGRATION=1 npm test -w @aws-token-designer/api
//
// Skipped unless RUN_DDB_INTEGRATION=1, so the default `npm test` stays green
// in environments without DynamoDB Local (matches docs/PLAN.md section 9:
// integration layer covers repository access patterns).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { JOB_PROCESSING_LEASE_MS } from '@aws-token-designer/shared'
import { Repo, imageFromItem, sheetFromItem, createDocClient } from '../src/lib/db.js'
import { ulid } from '../src/lib/ulid.js'

const enabled = process.env.RUN_DDB_INTEGRATION === '1'
const endpoint = process.env.DDB_LOCAL_URL ?? 'http://localhost:8000'

const ddb = new DynamoDBClient({
  region: 'us-test-1',
  endpoint,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})
// Production-shaped client (same factory the Lambda handler uses) pointed at
// DynamoDB Local — regression coverage for the removeUndefinedValues fix.
const doc = createDocClient({ endpoint, region: 'us-test-1' })
const TABLE = 'token-designer-test'

describe.skipIf(!enabled)('Repo against DynamoDB Local', () => {
  let repo: Repo

  beforeAll(async () => {
    const tables = await ddb.send(new ListTablesCommand({}))
    if (tables.TableNames?.includes(TABLE)) {
      await ddb.send(new DeleteTableCommand({ TableName: TABLE }))
    }
    await ddb.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'entityId', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'byId',
            KeySchema: [{ AttributeName: 'entityId', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      }),
    )
    repo = new Repo(doc, TABLE)
  })

  afterAll(async () => {
    await ddb.send(new DeleteTableCommand({ TableName: TABLE }))
  })

  describe('profile bootstrap (FR-3)', () => {
    it('creates profile once and stays idempotent', async () => {
      const missing = await repo.getProfile('user-a')
      expect(missing).toBeNull()
      await repo.createProfileIfAbsent('user-a', 'a@example.com')
      const profile = await repo.getProfile('user-a')
      expect(profile?.credits).toBe(10)
      expect(profile?.email).toBe('a@example.com')
      // Racing bootstrap: no error, credits unchanged.
      await repo.createProfileIfAbsent('user-a', 'a@example.com')
      expect((await repo.getProfile('user-a'))?.credits).toBe(10)
    })

    it('creates the default sheet once', async () => {
      await repo.ensureDefaultSheet('user-a')
      const first = await repo.listSheets('user-a')
      expect(first).toHaveLength(1)
      await repo.ensureDefaultSheet('user-a')
      const second = await repo.listSheets('user-a')
      expect(second).toHaveLength(1)
    })
  })

  describe('image ownership via byId GSI', () => {
    it('distinguishes 403 (other user) from 404 (missing)', async () => {
      const image = imageFromItem({
        PK: 'USER#user-a',
        SK: 'IMAGE#img-owned',
        entityId: 'img-owned',
        name: 'Owned',
        status: 'ready',
        fullKey: 'users/user-a/images/img-owned/full.png',
        thumbKey: 'users/user-a/images/img-owned/thumb.png',
        contentType: 'image/png',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      await repo.putImage(image)

      await expect(repo.getImageForSub('user-b', 'img-owned')).rejects.toThrow(
        /belongs to another user/,
      )
      await expect(repo.getImageForSub('user-a', 'img-missing')).rejects.toThrow(
        /Image not found/,
      )
      await expect(repo.getImageForSub('user-a', 'img-owned')).resolves.toMatchObject({
        entityId: 'img-owned',
      })
    })

    it('writes images with absent optional fields through the production-shaped client', async () => {
      // Regression: SDK v3 throws on undefined values when
      // removeUndefinedValues is not set; the factory used here matches the
      // Lambda's client configuration and toItem strips undefined keys.
      await repo.putImage(
        imageFromItem({
          PK: 'USER#user-a',
          SK: 'IMAGE#img-nofields',
          entityId: 'img-nofields',
          name: 'No optional fields',
          status: 'pending',
          fullKey: 'users/user-a/images/img-nofields/full.png',
          thumbKey: 'users/user-a/images/img-nofields/thumb.png',
          contentType: 'image/webp',
          createdAt: '2026-01-01T00:00:00.000Z',
          description: undefined,
          style: undefined,
        }),
      )
      const item = await repo.getImageForSub('user-a', 'img-nofields')
      expect(item.description).toBeUndefined()
      expect(item.style).toBeUndefined()
      expect(item.contentType).toBe('image/webp')
    })

    it('lists images newest first', async () => {
      const first = ulid()
      const second = ulid()
      for (const id of [first, second]) {
        await repo.putImage(
          imageFromItem({
            PK: 'USER#user-a',
            SK: `IMAGE#${id}`,
            entityId: id,
            name: id,
            status: 'ready',
            fullKey: `users/user-a/images/${id}/full.png`,
            thumbKey: `users/user-a/images/${id}/thumb.png`,
            contentType: 'image/png',
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        )
      }
      const images = await repo.listImages('user-a')
      const ids = images.map((i) => i.id)
      expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first))
    })
  })

  describe('generation jobs + daily cap (PLAN 6.5/6.7)', () => {
    const makeJob = (id: string, sub = 'user-a') => ({
      id,
      sub,
      type: 'generation' as const,
      status: 'pending' as const,
      imageId: `img-${id}`,
      prompt: 'A goblin chief',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    })

    /** Force a job into a processing state with a specific lease timestamp. */
    async function setProcessingAt(jobId: string, atMs: number): Promise<void> {
      await doc.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: 'USER#user-a', SK: `JOB#${jobId}` },
          UpdateExpression: 'SET #status = :processing, processingAt = :at',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':processing': 'processing',
            ':at': new Date(atMs).toISOString(),
          },
        }),
      )
    }

    it('allows exactly 20 generations per UTC day', async () => {
      const date = '2099-01-01'
      for (let i = 0; i < 20; i++) {
        await expect(repo.consumeDailyGeneration('cap-user', date)).resolves.toBe(true)
      }
      await expect(repo.consumeDailyGeneration('cap-user', date)).resolves.toBe(false)
      // Another user has an independent allowance.
      await expect(repo.consumeDailyGeneration('other-user', date)).resolves.toBe(true)
      // A new day starts a fresh counter.
      await expect(repo.consumeDailyGeneration('cap-user', '2099-01-02')).resolves.toBe(true)
    })

    it('claims a job once (pending → processing) and records success', async () => {
      const job = makeJob('job-claim')
      await repo.putJob(job)
      await expect(repo.claimJobForProcessing('user-a', job.id)).resolves.toBe(true)
      // Simulates the Lambda async retry: no second claim.
      await expect(repo.claimJobForProcessing('user-a', job.id)).resolves.toBe(false)
      await repo.markJobSucceeded('user-a', job.id, job.imageId)
      const item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('succeeded')
      expect(item?.imageId).toBe(job.imageId)
      expect(item?.error).toBeUndefined()
    })

    it('marks a job failed with a safe error code', async () => {
      const job = makeJob('job-fail')
      await repo.putJob(job)
      await repo.claimJobForProcessing('user-a', job.id)
      await repo.markJobFailed('user-a', job.id, 'GENERATION_DISABLED')
      const item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('failed')
      expect(item?.error).toBe('GENERATION_DISABLED')
    })

    it('reclaims only a processing lease older than 150 s', async () => {
      // Just outside the lease: reclaimable (this is the ~180 s Lambda retry
      // window after a 120 s worker timeout).
      const stale = makeJob('job-lease-stale')
      await repo.putJob(stale)
      await setProcessingAt(stale.id, Date.now() - JOB_PROCESSING_LEASE_MS - 5_000)
      await expect(repo.claimJobForProcessing('user-a', stale.id)).resolves.toBe(true)
      // The reclaim refreshed processingAt, so a concurrent retry no-ops.
      await expect(repo.claimJobForProcessing('user-a', stale.id)).resolves.toBe(false)
      const reclaimed = await repo.getJob('user-a', stale.id)
      expect(reclaimed?.status).toBe('processing')
      expect(reclaimed?.processingAt).toBeDefined()

      // Just inside the lease: still owned by the first attempt, no reclaim.
      const fresh = makeJob('job-lease-fresh')
      await repo.putJob(fresh)
      await setProcessingAt(fresh.id, Date.now() - JOB_PROCESSING_LEASE_MS + 10_000)
      await expect(repo.claimJobForProcessing('user-a', fresh.id)).resolves.toBe(false)
    })

    it('reclaims a legacy processing job with no processingAt', async () => {
      const job = makeJob('job-lease-legacy')
      await repo.putJob(job)
      await doc.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: 'USER#user-a', SK: `JOB#${job.id}` },
          UpdateExpression: 'SET #status = :processing',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':processing': 'processing' },
        }),
      )
      await expect(repo.claimJobForProcessing('user-a', job.id)).resolves.toBe(true)
    })

    it('a pending-only API failure cannot preempt a processing worker', async () => {
      const job = makeJob('job-api-race')
      await repo.putJob(job)
      await repo.claimJobForProcessing('user-a', job.id) // worker owns it
      // The API invoke response was lost: the pending-only transition no-ops.
      await repo.markPendingJobFailed('user-a', job.id, 'GENERATION_FAILED')
      let item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('processing')
      expect(item?.error).toBeUndefined()
      // The worker then completes normally.
      await repo.markJobSucceeded('user-a', job.id, job.imageId)
      item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('succeeded')
      expect(item?.error).toBeUndefined()
    })

    it('pending-only failure marks a still-pending job failed', async () => {
      const job = makeJob('job-api-pending-fail')
      await repo.putJob(job)
      await repo.markPendingJobFailed('user-a', job.id, 'GENERATION_FAILED')
      const item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('failed')
      expect(item?.error).toBe('GENERATION_FAILED')
    })

    it('a late/API failure cannot flip a succeeded job', async () => {
      const job = makeJob('job-terminal-success')
      await repo.putJob(job)
      await repo.claimJobForProcessing('user-a', job.id)
      await repo.markJobSucceeded('user-a', job.id, job.imageId)
      // This is the POST /images/generate invoke-failure path racing a
      // worker that already succeeded: it must be a no-op.
      await repo.markJobFailed('user-a', job.id, 'GENERATION_FAILED')
      // A stale worker retry must also not re-transition it.
      await repo.markJobSucceeded('user-a', job.id, job.imageId)
      const item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('succeeded')
      expect(item?.error).toBeUndefined()
    })

    it('success cannot overwrite a failed job', async () => {
      const job = makeJob('job-terminal-failed')
      await repo.putJob(job)
      await repo.claimJobForProcessing('user-a', job.id)
      await repo.markJobFailed('user-a', job.id, 'GENERATION_FAILED')
      await repo.markJobSucceeded('user-a', job.id, job.imageId)
      const item = await repo.getJob('user-a', job.id)
      expect(item?.status).toBe('failed')
      expect(item?.error).toBe('GENERATION_FAILED')
    })

    it('distinguishes 403 (other user) from 404 (missing) via byId', async () => {
      const job = makeJob('job-owned')
      await repo.putJob(job)
      await expect(repo.getJobForSub('user-b', job.id)).rejects.toThrow(
        /belongs to another user/,
      )
      await expect(repo.getJobForSub('user-a', 'job-missing')).rejects.toThrow(/Job not found/)
      await expect(repo.getJobForSub('user-a', job.id)).resolves.toMatchObject({
        entityId: job.id,
      })
    })
  })

  describe('sheet tokens (FR-7–FR-10)', () => {
    let sheetId = ''

    beforeEach(async () => {
      await repo.putSheet(
        sheetFromItem({
          PK: 'USER#user-a',
          SK: 'SHEET#sheet-x',
          entityId: 'sheet-x',
          name: 'Sheet',
          template: 'default',
          images: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      )
      sheetId = 'sheet-x'
    })

    it('adds tokens and enforces the 63 cap at write time', async () => {
      for (let i = 0; i < 63; i++) {
        await repo.addTokenToSheet('user-a', sheetId, `img-${i}`)
      }
      await expect(repo.addTokenToSheet('user-a', sheetId, 'img-64')).rejects.toThrow(
        /maximum of 63 tokens/,
      )
      const sheet = await repo.getSheetForSub('user-a', sheetId)
      expect(sheet.images).toHaveLength(63)
    })

    it('removes image references from all sheets on delete (FR-10)', async () => {
      await repo.addTokenToSheet('user-a', sheetId, 'img-del')
      await repo.removeImageFromAllSheets('user-a', 'img-del')
      const sheet = await repo.getSheetForSub('user-a', sheetId)
      expect(sheet.images).not.toContain('img-del')
    })
  })
})
