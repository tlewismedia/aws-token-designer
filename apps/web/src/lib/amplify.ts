// Amplify Auth v6 configuration (PLAN 6.2). Applied once at app startup when
// the public Cognito config is present; without it (e.g. unit tests) the app
// renders as logged out.

import { Amplify } from 'aws-amplify'
import { publicConfig } from './config'

export function configureAmplify(): void {
  const cfg = publicConfig()
  if (!cfg) return
  // Amplify derives the Cognito region from the pool id prefix — no explicit
  // region key is supported here.
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cfg.userPoolId,
        userPoolClientId: cfg.userPoolClientId,
        loginWith: { email: true },
      },
    },
  })
}
