# Agents

Operational rules for every agent working in this repo. Adapted from the
starling-data orchestration model to this project's board, Terraform/TypeScript
conventions, and OpenCode subagents.

**Read at the start of every task:** this file, `docs/PLAN.md`,
`docs/ARCHITECTURE.md`, and the GitHub issue you are assigned to.

---

## Principles

1. **One agent, one job.** Subagents produce artifacts (code, reviews). They do not decide workflow.
2. **The orchestrator owns all external state.** Only the main agent changes GitHub issues, board items, labels, milestones, and PRs. Subagents cannot run `gh` at all.
3. **Durable artifacts over chat.** Decisions live in GitHub issues, PRs, and commits — not in conversation history.
4. **Human at the state transitions.** Humans confirm anything hard to reverse: posting a review, opening a PR, merging, closing an issue.
5. **Traceable provenance.** Every agent action is tagged (`AGENT:` commits, `[IMPLEMENTER AGENT]` / `[REVIEWER AGENT]` reports) so a human can see what was done by whom.
6. **Always link.** When mentioning an issue or PR, include the full URL (e.g. `https://github.com/tlewismedia/aws-token-designer/issues/3`) — not just `#3`.
7. **Trust but verify.** Check the actual diff/code before accepting an agent's summary as complete.

---

## Roles

### Orchestrator (main agent, Build)

The only actor that:

- Creates, labels, and closes GitHub issues.
- Moves board items (Backlog → Ready → In Progress → In Review → Done).
- Opens and merges PRs (merges only with human confirmation).
- Creates worktrees and moves subagent sessions into them.
- Decides which subagent runs next and in what order.

Reads: this file, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, the issue body, the relevant code.

### Implementer (subagent, `.opencode/agents/implementer.md`)

Invoked once the human has approved the issue body (which _is_ the spec).

Reads: issue body + plan/architecture docs + relevant code.

Writes code and tests in a worktree branch.

Rules:

- Branch name: `issue-<N>/<short-description>`.
- TypeScript strict. Terraform for infra. No plain JS.
- Write tests when the spec asks for them.
- Do not exceed spec scope. If something outside scope needs changing, surface it — don't silently do it.
- Do not push, open PRs, or touch issue/board state (`gh` is denied).
- Do not touch secrets, `.env`, or Terraform state.
- Commit prefix: `AGENT:` on every commit. First line: `AGENT: <imperative summary>`.

### Reviewer (subagent, `.opencode/agents/reviewer.md`)

Invoked after the implementer reports completion.

Reads: the diff, the spec, plan/architecture docs.

Checks:

1. Does the code satisfy every acceptance criterion?
2. Are the tests meaningful? Do they cover the spec's edge cases?
3. Does anything contradict the plan, architecture, or ADRs?
4. Obvious bugs or security issues?

Output: either `[REVIEWER AGENT] APPROVED` or a numbered list of issues with `file:line` references.

Read-only: cannot edit files or run anything beyond diff/log/status/test/lint/typecheck/validate. Cannot post to GitHub.

---

## Specs live in the issue body

There is no separate Spec Writer role. The orchestrator drafts the spec directly in the issue body (goal, scope, tasks, acceptance criteria, verification, dependencies, risks, definition of done). The human reads the issue before the implementer is dispatched — that's the spec-approval gate.

If a spec genuinely needs research the orchestrator doesn't have, the orchestrator does a narrow, one-off research dispatch (Explore subagent) and edits the findings into the issue body itself.

---

## Workflow

```
1. Orchestrator → creates issue with spec in the body (or improves an existing one)
2. Human        → reads the issue body; approves or edits it
3. Orchestrator → moves board item to In Progress
4. Implementer  → writes code + tests on a worktree branch
5. Orchestrator → inspects the diff; moves board item to In Review
6. Reviewer     → outputs APPROVED or REQUESTED CHANGES
7a. If REQUESTED CHANGES → surface to human; re-dispatch implementer only with confirmation
7b. If APPROVED           → ask human before posting verdict or opening PR
8. Human        → reviews PR diff and merges (auto-closes issue via `Closes #<N>`)
9. Orchestrator → moves board item to Done after merge
```

Board transitions are manual (orchestrator via `gh`/GraphQL). The deleted
`project-automation.yml` workflow is intentionally gone — automation returns
only if a second human or CI-driven flow needs it.

---

## Labels and board fields

Workflow state lives on the **board** (`Status` field), not in labels:

| Board status      | Meaning                              |
| ----------------- | ------------------------------------ |
| `Backlog`         | Not yet prioritized                  |
| `Ready`           | Prioritized, ready to start          |
| `In Progress`     | Implementer working                  |
| `In Review`       | Implementer done; reviewer running   |
| `Done`            | Merged and verified                  |

Labels describe the work (`type:*`, `area:*`, `phase:*`, `priority:*`, `size:*`).
Milestones M0–M6 group issues by delivery phase. Only the orchestrator sets these.

---

## Branch and PR convention

- Branch: `issue-<N>/<short-description>` — one issue per branch, one branch per issue.
- PR title matches branch description.
- PR body must include `Closes #<N>` so merging auto-closes the issue.
- Commits: prefixed `AGENT:` when an agent authored them. Humans commit without the prefix.

---

## What needs confirmation

**Orchestrator may do without asking:**

- Creating/updating issues, board moves, label/milestone changes.
- Spawning implementer/reviewer subagents on an approved spec.
- Posting implementer progress notes.

**Requires human confirmation before action:**

- Merging a PR.
- Closing an issue.
- Posting a reviewer verdict as a GitHub comment.
- Opening a PR.
- Deleting branches or worktrees.
- Any `git reset --hard`, force push, or amend of pushed commits.
- Re-dispatching the implementer after REQUESTED CHANGES.

Why: merging and closing are hard to reverse. PRs open only after review so the human has a diff to judge. A REQUESTED CHANGES verdict deserves a human decision on whether to re-dispatch, adjust the spec, or close as won't-fix.

---

## Parallelism

- Run independent issues in parallel (separate worktrees).
- Run dependent issues in sequence — the orchestrator tracks the DAG (`Blocked by` / `Blocks` in each issue).
- Never run two agents against the same worktree at once.
- Implementation and review for the same issue must be serial.

---

## How to dispatch agents

The orchestrator invokes subagents via the `subagent` tool with complete, self-contained prompts. Subagents start with zero context: re-state the goal, constraints, and expected output every time.

### Dispatching Implementer

1. Fetch the issue (`gh issue view`), confirm the spec is complete.
2. Create the worktree (`worktree_create`), move the session (`session_move`).
3. Call `subagent` with `agent: "implementer"` and a prompt containing:
   - the full issue body verbatim
   - acceptance criteria as a numbered list
   - relevant file paths
   - worktree path and branch name
   - constraints reminder (`AGENT:` commits, no push/PR/state, no scope creep)

### Dispatching Reviewer

1. Capture the diff (`git diff main...issue-<N>/<slug>`) and test output.
2. Call `subagent` with `agent: "reviewer"` and a prompt containing:
   - branch name, full issue body, acceptance checklist
   - the diff (or instructions to read it from the branch)
   - the test-run output

### Dispatch principles

1. **Self-contained prompts.** Never assume shared context.
2. **Synthesise findings.** Never tell a subagent "based on the other agent's output, do X." Read the output, understand it, then decide.
3. **Specific instructions.** File paths, line numbers, acceptance criteria — don't make the agent guess.
4. **Trust but verify.** Inspect the real diff before accepting a summary.

---

## Working with the orchestrator

There are no slash commands for this workflow — it's conversational. Tell the
main agent what to do in plain language:

- "Implement #3" — fetch the spec, verify it's complete, create the worktree,
  spawn the implementer, inspect the diff, move the card to In Review.
- "Review the Phase 2 work" — capture the diff and test output, spawn the
  reviewer, surface the verdict. Nothing posted or opened without your confirmation.
- "Write a ticket for X" — draft the spec in the issue body per the ticket
  template (or use the `/ticket` skill).

The agent files above define the subagent contracts; this document defines the
orchestration. The checklist the old `/implement` and `/review` commands
contained lives in "How to dispatch agents" below.

---

## Memory

The orchestrator records durable cross-session knowledge when it emerges:

- User preferences confirmed or corrected.
- Project decisions and their motivation.
- External resource pointers (repo, board, issue URLs).

Memory does **not** capture: code snippets, file paths, recent commits, git history (all derivable).
