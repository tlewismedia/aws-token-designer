# AWS Token Designer

A port of the Firebase Token Designer to AWS. Users generate or upload token images, arrange up to 63 of them on a printable sheet, and print it.

**Status:** v1 implemented and deployed to `dev`; `prod` is Terraform-ready and
pending the operator deploy. See the [Definition of Done](docs/PLAN.md#12-definition-of-done)
and [RAID](docs/RAID.md) for the remaining external items.

## Links

- Repo: https://github.com/tlewismedia/aws-token-designer
- Kanban board: https://github.com/users/tlewismedia/projects/7
- Issues: https://github.com/tlewismedia/aws-token-designer/issues

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Official implementation plan (phases, security design, DoD) |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Functional/non-functional requirements (FR/NFR) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture document and diagrams |
| [`docs/TERRAFORM.md`](docs/TERRAFORM.md) | Terraform primer, environments, state, CI plan job |
| [`docs/COSTS.md`](docs/COSTS.md) | Monthly cost estimate, guardrails, how to check spend |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, controls checklist, secret handling |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Alert response, kill switch, rollback, on-call checks |
| [`docs/TESTING.md`](docs/TESTING.md) | Automated checks, E2E, alarm drill, prod smoke, rollback drill |
| [`docs/RAID.md`](docs/RAID.md) | Risks, assumptions, issues, dependencies |
| [`docs/PUBLIC_SAFE.md`](docs/PUBLIC_SAFE.md) | Public repository policy and checklist |
| [`docs/adr/README.md`](docs/adr/README.md) | Architecture Decision Records index and template |
| [`docs/AGENTS.md`](docs/AGENTS.md) | Agent orchestration rules (implementer/reviewer workflow) |
| [`docs/diagrams/README.md`](docs/diagrams/README.md) | Diagram generation and polish workflow |
| [`PRE_PLANNING.md`](PRE_PLANNING.md) | Discussion record and decision log |
| [`SECURITY.md`](SECURITY.md) | Vulnerability disclosure policy |

## Planned Stack

- **Frontend:** Vite + React 19 + TypeScript, TanStack Query v5, Amplify Auth v6
- **Auth:** Amazon Cognito
- **API:** API Gateway HTTP API + Lambda (Node 22)
- **Data:** DynamoDB (single table, on-demand)
- **Files:** private S3 + presigned URLs
- **AI:** Stability AI via async worker Lambda
- **Payments:** Stripe embedded checkout
- **Hosting:** S3 + CloudFront (same-origin `/api/*` proxy)
- **IaC:** Terraform >= 1.10
- **Region:** us-west-2

## Deploy

Infrastructure is Terraform in `infra/envs/<env>` (`dev` or `prod`); the SPA is
built and published to the CloudFront-fronted S3 bucket by a script.

```sh
# 1. Infrastructure (see docs/TERRAFORM.md for bootstrap/backend setup).
terraform -chdir=infra/envs/dev init -backend-config=backend.hcl
terraform -chdir=infra/envs/dev apply

# 2. Build + deploy the SPA, then invalidate /index.html.
./scripts/deploy-web.sh          # dev (default)
./scripts/deploy-web.sh prod     # prod
# prints https://<distribution>.cloudfront.net
```

The SPA and API share that one origin (`/api/*` is proxied by CloudFront), so
there is no API CORS configuration (the media bucket has a CORS rule for presigned browser uploads) or build-time API URL. Verification commands,
`E2E_BASE_URL` (run Playwright against the deployed site), the alarm/budget
drill, prod smoke, and rollback drill are in
[`docs/TESTING.md`](docs/TESTING.md) and [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

Production stateful resources are protected against destruction (DynamoDB and
Cognito native deletion protection; prod-only S3 bucket policies denying
`DeleteBucket`); see
[`docs/TERRAFORM.md`](docs/TERRAFORM.md#prevent_destroy--deletion-protection).

## Diagrams

![AWS Token Designer deployment view](docs/diagrams/aws-deployment.svg)

- [Polished AWS deployment view](docs/diagrams/aws-deployment.svg)
- [Diagram workflow](docs/diagrams/README.md)

## Security

This repository may be public. Do not commit secrets, Terraform state, or personal data. See [`docs/PUBLIC_SAFE.md`](docs/PUBLIC_SAFE.md).

## License

TBD.
