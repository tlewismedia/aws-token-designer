---
description: Dispatch the reviewer subagent for an implementation
agent: build
---

Dispatch the `reviewer` subagent for issue #$1 in tlewismedia/aws-token-designer.

Before dispatching:

1. Identify the branch: `issue-$1/<short-desc>`.
2. Fetch the issue body — it is the spec.
3. Capture `git diff main...issue-$1/<short-desc>`.
4. Run `npm test`, `npm run lint`, `npx tsc --noEmit` and capture the output.

Dispatch with:

- branch name
- full issue body
- acceptance criteria as a checklist
- the diff (or instructions to read it)
- the test output

Expected: `[REVIEWER AGENT] APPROVED` or `REQUESTED CHANGES` with file:line issues.

After it returns:

1. If REQUESTED CHANGES, synthesize and ask the human before re-dispatching.
2. If APPROVED, ask the human before posting the verdict or opening the PR.
