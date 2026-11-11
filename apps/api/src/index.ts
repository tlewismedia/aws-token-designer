// Lambda entry point: Cognito JWT authorizer on API Gateway validates the
// token; this handler serves the Hono app via @hono/aws-lambda.

import { handle } from '@hono/aws-lambda'
import { createApp } from './app.js'

const app = createApp()

export const handler = handle(app)
