// SSM Parameter Store reads for the generateWorker (PLAN 6.7, 7.5).
//
// Secrets are never logged or returned in API responses; the worker only uses
// the Stability key to call the provider. A missing parameter is reported as
// `null` (fail closed), while other SSM errors surface so the worker can mark
// the job failed without leaking details.

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

let client: SSMClient | null = null

function ssm(): SSMClient {
  if (!client) client = new SSMClient({})
  return client
}

export function resetSsmClientForTests(): void {
  client = null
}

function isParameterNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'ParameterNotFound'
  )
}

/** Read a parameter value, or null when it does not exist. */
export async function getParameter(name: string, withDecryption = false): Promise<string | null> {
  try {
    const res = await ssm().send(
      new GetParameterCommand({ Name: name, WithDecryption: withDecryption }),
    )
    return res.Parameter?.Value ?? null
  } catch (err) {
    if (isParameterNotFound(err)) return null
    throw err
  }
}
