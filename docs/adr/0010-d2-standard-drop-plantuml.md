# ADR-0010: Standardize on D2 for Diagrams, Drop PlantUML

- Status: Accepted
- Date: 2026-11-10
- Deciders: Tom
- Supersedes: ADR-0009

## Context

ADR-0009 adopted a hybrid: Mermaid living views plus a PlantUML + AWS-icon
deployment snapshot. After generating the same architecture in PlantUML, D2,
and Python `diagrams` (see `docs/diagrams/compare/COMPARISON.md`), D2 rendered
the most readable diagram — less packed, easier to follow — with the simplest
source of the three.

## Options Considered

1. **Keep PlantUML for the deployment snapshot** — official icon set, pinned
   and reproducible, closest to AWS house style; but heavier authoring
   (`awslib` includes, macros, skinparam) and a second toolchain.
2. **Standardize on D2** — best readability and authoring experience; one
   toolchain for structural and deployment views; icons fetched from
   `icons.terrastruct.com` at render time (network dependency, no pinning).
3. **Python `diagrams`** — rejected; Graphviz auto-layout fights this
   topology (poor edge routing and label placement).

## Decision

Standardize on **D2**. Drop PlantUML: remove the `.puml` source,
`fetch-aws-icons.sh`, and `render-diagrams.sh`; promote the D2 comparison
output to `docs/diagrams/aws-deployment.d2` (+ SVG/PNG) with
`scripts/render-diagram.sh`. Mermaid sequence/context views in
`ARCHITECTURE.md` stay as the living views; draw.io remains the optional
manual polish path.

## Consequences

- Positive: one diagram toolchain; most readable output; simplest sources
  and diffs; less to maintain.
- Negative: icons are Terrastruct-hosted, not the official AWS icon package;
  renders require network access to `icons.terrastruct.com`; SSM/Budgets use
  generic icons.
- Follow-ups: vendor icon SVGs locally if render reproducibility becomes a
  problem; add the `lefthook`/`pre-commit` render hook and CI staleness check
  in Phase 0 (see `docs/PLAN.md`).
