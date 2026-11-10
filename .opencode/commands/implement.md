---
description: Dispatch the implementer subagent for a GitHub issue
agent: build
---

Dispatch the `implementer` subagent for issue #$1 in tlewismedia/aws-token-designer.

Before dispatching:

1. `gh issue view $1 --repo tlewismedia/aws-token-designer --json title,body,labels`
2. Confirm the body has Goal, Scope, Tasks, Acceptance Criteria, Verification.
   If it is thin or ambiguous, stop and ask the human to flesh it out.
3. Read `docs/PLAN.md` and `docs/ARCHITECTURE.md`.
4. Create a worktree for `issue-$1` with the worktree tool.
5. Choose a branch slug: `issue-$1/<short-desc>`.

Dispatch with a self-contained prompt containing:

- the full issue body verbatim
- acceptance criteria as a numbered list
- relevant file paths
- worktree path and branch name
- constraints: `AGENT:` commits, no push/PR/issue state, no scope creep

After it returns:

1. Inspect the actual diff — do not trust the summary.
2. Verify branch name, commit prefixes, and scope.
3. Move the board item to In Review.
4. Do not open a PR until the reviewer approves and the human confirms.
