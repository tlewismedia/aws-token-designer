// Seed a test user + profile + default sheet.
//
// Resource names come from Terraform outputs by default:
//   terraform -chdir=infra/envs/<TF_ENV> output -json
// If ALL of SEED_USER_POOL_ID, SEED_CLIENT_ID, and SEED_TABLE_NAME are set,
// Terraform is skipped entirely (useful in CI or without state access).
//
// Usage (requires AWS credentials; Terraform state access unless all SEED_*
// resource overrides are set):
//   npm run seed --workspace @aws-token-designer/api
//   TF_ENV=prod npm run seed --workspace @aws-token-designer/api
//
// Options via env:
//   TF_ENV          (default dev; selects infra/envs/<env> unless overridden)
//   SEED_EMAIL      (default dev-user@example.com)
//   SEED_PASSWORD   (default Test1234!)
//   SEED_SHEET_NAME (default "Default Sheet")
//   SEED_USER_POOL_ID / SEED_CLIENT_ID / SEED_TABLE_NAME: set all three to skip
//   Terraform; otherwise Terraform outputs are preferred and these are fallbacks

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import {
  DEFAULT_SHEET_NAME,
  DEFAULT_SHEET_TEMPLATE,
  DEFAULT_CREDITS,
  PK_PREFIX,
  SK_PROFILE,
  SK_SHEET_PREFIX,
} from '@aws-token-designer/shared'

interface DevOutputs {
  user_pool_id?: { value?: string }
  client_id?: { value?: string }
  table_name?: { value?: string }
}

interface TerraformOutput {
  value: unknown
}

function terraformEnv(): string {
  const env = process.env.TF_ENV?.trim() || 'dev'
  if (env !== 'dev' && env !== 'prod') {
    throw new Error(`TF_ENV must be "dev" or "prod" (got "${env}")`)
  }
  return env
}

function hasAllResourceOverrides(): boolean {
  return Boolean(
    process.env.SEED_USER_POOL_ID &&
      process.env.SEED_CLIENT_ID &&
      process.env.SEED_TABLE_NAME,
  )
}

async function loadOutputs(): Promise<DevOutputs> {
  if (hasAllResourceOverrides()) {
    console.log('seed: SEED_* resource overrides set; skipping terraform output')
    return {}
  }
  const { execFileSync } = await import('node:child_process')
  const env = terraformEnv()
  const raw = execFileSync('terraform', ['output', '-json'], {
    cwd: new URL(`../../../../infra/envs/${env}`, import.meta.url).pathname,
    encoding: 'utf-8',
  })
  return JSON.parse(raw) as DevOutputs
}

function out<T>(outputs: Record<string, TerraformOutput>, key: string, fallbackEnv: string): T {
  const fromTf = outputs[key]?.value
  if (fromTf !== undefined && fromTf !== null && fromTf !== '') return fromTf as T
  const fromEnv = process.env[fallbackEnv]
  if (fromEnv) return fromEnv as T
  throw new Error(
    `Missing output "${key}". Set ${fallbackEnv} or run terraform in infra/envs/${terraformEnv()}.`,
  )
}

async function main(): Promise<void> {
  const email = process.env.SEED_EMAIL ?? 'dev-user@example.com'
  const password = process.env.SEED_PASSWORD ?? 'Test1234!'
  const sheetName = process.env.SEED_SHEET_NAME ?? DEFAULT_SHEET_NAME

  const outputs = (await loadOutputs()) as unknown as Record<string, TerraformOutput>
  const userPoolId = out<string>(outputs, 'user_pool_id', 'SEED_USER_POOL_ID')
  const clientId = out<string>(outputs, 'client_id', 'SEED_CLIENT_ID')
  const tableName = out<string>(outputs, 'table_name', 'SEED_TABLE_NAME')
  const region = process.env.AWS_REGION ?? 'us-west-2'

  const cognito = new CognitoIdentityProviderClient({ region })

  // SignUp fires the auto-confirm pre-sign-up trigger (infra/modules/cognito).
  try {
    await cognito.send(
      new SignUpCommand({ ClientId: clientId, Username: email, Password: password }),
    )
    console.log(`seed: signed up ${email}`)
  } catch (err) {
    if ((err as { name?: string }).name === 'UsernameExistsException') {
      console.log('seed: user already exists; confirming instead')
    } else {
      throw err
    }
  }
  await cognito.send(
    new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
  )
  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      }),
    )
  } catch (err) {
    if ((err as { name?: string }).name === 'NotAuthorizedException') {
      throw new Error(
        'seed: could not set password (is the presignup auto-confirm trigger active?)',
      )
    }
    throw err
  }

  // The Cognito username IS the email (username_attributes = ["email"]).
  // Resolve the sub so the PROFILE/SHEET partition keys are correct.
  const user = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
  )
  const sub = (user.UserAttributes ?? []).find((a) => a.Name === 'sub')?.Value
  if (!sub) throw new Error('seed: could not resolve user sub')

  const doc = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region }),
    { marshallOptions: { removeUndefinedValues: true } },
  )
  const now = new Date().toISOString()
  const sheetId = `seed-${now.replace(/[-:.TZ]/g, '')}`

  try {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `${PK_PREFIX}${sub}`,
          SK: SK_PROFILE,
          email,
          credits: DEFAULT_CREDITS,
          createdAt: now,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    )
  } catch (err) {
    if (!(err instanceof Error) || !err.name.includes('ConditionalCheckFailed')) {
      if (err instanceof ResourceNotFoundException) {
        throw new Error(`seed: table ${tableName} not found — is the ${terraformEnv()} stack applied?`)
      }
      throw err
    }
    console.log('seed: profile already exists')
  }

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: `${PK_PREFIX}${sub}`,
        SK: `${SK_SHEET_PREFIX}${sheetId}`,
        entityId: sheetId,
        name: sheetName,
        template: DEFAULT_SHEET_TEMPLATE,
        images: [],
        createdAt: now,
      },
    }),
  )

  console.log('seed: done')
  console.log(`  email:    ${email}`)
  console.log(`  password: ${password}`)
  console.log(`  profile:  ${PK_PREFIX}${sub} / PROFILE (${DEFAULT_CREDITS} credits)`)
  console.log(`  sheet:    ${PK_PREFIX}${sub} / SHEET#${sheetId}`)
}

main().catch((err) => {
  console.error('seed failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
