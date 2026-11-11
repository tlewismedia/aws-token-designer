// Lambda entry point: Cognito JWT authorizer on API Gateway validates the
// token; this handler serves the Hono app via @hono/aws-lambda.
//
// API Gateway HTTP API v2 puts the stage name in the invocation path
// (`/api/health`), and @hono/aws-lambda builds the request URL from
// `rawPath` without stripping it. Mount the routes under the same prefix so
// the deployed handler matches (PLAN 6.4 stage `api`); API_BASE_PATH allows
// overriding it if the stage is ever renamed.

import { handle } from '@hono/aws-lambda'
import { createApp } from './app.js'

const basePath = process.env.API_BASE_PATH ?? '/api'

const app = createApp({ basePath })

export const handler = handle(app)
