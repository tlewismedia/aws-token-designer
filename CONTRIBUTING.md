# Contributing

Thanks for contributing to AWS Token Designer. This is a public demo/portfolio
repo — keep every contribution free of secrets, personal emails (use
`alerts@example.com` as a placeholder), account IDs, and ARNs. See
[`docs/PUBLIC_SAFE.md`](docs/PUBLIC_SAFE.md).

## Workflow

1. Pick an issue and create **one branch per issue**:
   `issue-<N>/<short-slug>` (e.g. `issue-8/repo-hygiene`).
2. Make focused changes; follow TypeScript strict and Terraform-for-infra
   conventions.
3. Run lint, typecheck, and tests before pushing.
4. Open a PR whose body includes `Closes #<N>` so merging auto-closes the issue.

Agent-authored work follows [`docs/AGENTS.md`](docs/AGENTS.md): every
agent-authored commit is prefixed `AGENT:` (humans commit without the prefix),
and agents never push, open PRs, or change issue/board state.

## Checks

From the repo root:

```sh
npm run lint
npm run typecheck
npm run test
```

Frontend code lives in `apps/web` (Vite + React + TypeScript). Project docs
live in `docs/` (including ADRs in `docs/adr` and diagrams in
`docs/diagrams`).

Terraform infrastructure will live in `infra/` (planned — not yet present);
when it exists, validate with `terraform fmt -check -recursive` and
`terraform validate` before opening a PR.

## Diagrams (D2)

Source diagrams live in `docs/diagrams/*.d2`. After editing a `.d2` file,
re-render its SVG/PNG outputs:

```sh
./scripts/render-diagram.sh
```

This uses Docker (`terrastruct/d2`) and skips gracefully when Docker is
unavailable. See [`docs/diagrams/README.md`](docs/diagrams/README.md).

## Pull Requests

- Reference the issue: PR body must include `Closes #<N>`.
- Describe what changed and how it was verified (commands + results).
- Keep the diff scoped to the issue; surface out-of-scope needs instead of
  silently expanding scope.
- Confirm no secrets, account IDs, ARNs, or personal emails are included.
