# ADR-0009: Diagram Tooling — Living Mermaid Views + Polished PlantUML Snapshot

- Status: **Superseded by ADR-0010**
- Date: 2026-11-09
- Deciders: Tom

## Context

We need two different things from diagrams:

1. **Living engineering views** that change with the architecture and can be reviewed in PRs.
2. A **polished AWS deployment view** with official AWS icons and colors for stakeholders and portfolio use.

Mermaid is excellent for the first, but it cannot reliably render official AWS icon packs (especially on GitHub) and has limited layout control. A manual tool produces the best-looking result but drifts and is hard to review.

## Options Considered

1. **Mermaid only** — versioned and reviewable, but generic shapes, limited layout, and no reliable official AWS icons.
2. **Manual tool only (draw.io/Lucidchart)** — polished, but drifts, poor diffs, and often lives outside the repo.
3. **Hybrid: Mermaid living views + PlantUML/AWS-icon snapshot + optional draw.io polish** — reviewable engineering views and a polished deployment diagram, with clear roles.
4. **Model-driven (Structurizr/ArchiMate)** — consistent multi-view output, but heavier setup than this demo needs.

## Decision

Use the hybrid approach:

- **Mermaid** in `docs/ARCHITECTURE.md` for C4 context/container, sequence, and deployment views. These are the living, PR-reviewed diagrams.
- **PlantUML + `aws-icons-for-plantuml`** for the polished AWS deployment view (`docs/diagrams/aws-deployment.puml`), rendered to SVG/PNG.
- **Optional draw.io/Figma polish** of the exported SVG for final layout/annotation. If polished manually, commit the `.drawio` source alongside the export.
- A pinned AWS icon set (`v23.1`) fetched into `.cache/` by `scripts/fetch-aws-icons.sh`; `scripts/render-diagrams.sh` renders with Docker.

## Consequences

- Positive: living views stay close to the code; the polished view uses official AWS icons and colors; the source and export are versioned.
- Negative: two artifacts to maintain; PlantUML auto-layout may need a manual polish pass.
- Follow-ups: regenerate the snapshot when the deployment topology changes materially or at milestones; do not maintain two hand-drawn copies of the same view; record the last-updated date in `docs/diagrams/README.md`.
