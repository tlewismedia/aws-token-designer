// Public (non-secret) frontend config. Values come from infra/envs/dev
// outputs — see apps/web/.env.example. All of them are safe to commit
// (pool/client ids are public in OAuth clients).

export interface PublicConfig {
  region: string
  userPoolId: string
  userPoolClientId: string
}

export function publicConfig(): PublicConfig | null {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID
  const region = import.meta.env.VITE_AWS_REGION ?? 'us-west-2'
  if (!userPoolId || !userPoolClientId) return null
  return { region, userPoolId, userPoolClientId }
}
