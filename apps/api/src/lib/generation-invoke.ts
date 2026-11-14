// Async invoke of the generateWorker Lambda (PLAN 6.7).
//
// InvocationType 'Event' returns as soon as Lambda accepts the event, so the
// API stays well under its 30s timeout even when Stability is slow. The event
// is intentionally minimal: the worker reloads the JOB item by sub+jobId.

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

let client: LambdaClient | null = null

function lambda(): LambdaClient {
  if (!client) client = new LambdaClient({})
  return client
}

export function resetLambdaClientForTests(): void {
  client = null
}

export interface GenerationJobEvent {
  jobId: string
  sub: string
}

export async function invokeGenerationWorker(event: GenerationJobEvent): Promise<void> {
  const functionName = process.env.WORKER_FUNCTION_NAME
  if (!functionName) throw new Error('WORKER_FUNCTION_NAME is not set')

  const res = await lambda().send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: new TextEncoder().encode(JSON.stringify(event)),
    }),
  )
  if (res.StatusCode !== undefined && res.StatusCode >= 300) {
    throw new Error(`Worker invoke failed with status ${res.StatusCode}`)
  }
}
