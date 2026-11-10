# Diagrams

This folder holds the **AWS deployment view** (D2). The **living** C4 and
sequence diagrams are in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Files

| File | Purpose |
|---|---|
| `aws-deployment.d2` | D2 source with AWS icons |
| `aws-deployment.svg` | Generated vector export (preferred for docs) |
| `aws-deployment.png` | Generated raster export (for slides/chat) |
| `aws-deployment.drawio` | Optional manual polish snapshot (if needed) |

## Prerequisites

- **Docker** (recommended). The render script uses the `terrastruct/d2`
  image, so no local install is needed.
- Network access to `icons.terrastruct.com` at render time (icons are
  fetched remotely, not vendored).

## Generate

From the repo root:

```bash
./scripts/render-diagram.sh
```

This renders both SVG and PNG from `aws-deployment.d2`.

## Without Docker

Install D2 (`brew install d2`), then run:

```bash
d2 docs/diagrams/aws-deployment.d2 docs/diagrams/aws-deployment.svg
d2 docs/diagrams/aws-deployment.d2 docs/diagrams/aws-deployment.png
```

Or use the [D2 Playground](https://play.d2lang.com) for quick previews.

## Editing workflow

1. Edit `aws-deployment.d2`.
2. Run `./scripts/render-diagram.sh` (or just commit — the lefthook
   pre-commit hook in `lefthook.yml` re-renders changed `.d2` sources and
   stages the exports automatically; run `lefthook install` once per clone
   to enable it).
3. Inspect `aws-deployment.svg`/`.png`.
4. If the auto-layout needs a final touch, open the SVG in draw.io/Figma, polish, and commit `aws-deployment.drawio` alongside the export.
5. Update the "Last updated" date below.

## Living vs snapshot

- **Living views:** Mermaid context/container/sequence diagrams in `docs/ARCHITECTURE.md`. Update them in the PR that changes the architecture.
- **Snapshot:** this D2 diagram. Regenerate it when the deployment topology changes materially or at milestones. It is not expected to be pixel-perfect in sync with every commit.

Don't maintain two hand-drawn copies of the same view. The Mermaid views are logical; this is the AWS deployment view.

## Comparison with other renderers

See [`compare/COMPARISON.md`](compare/COMPARISON.md) for the evaluation
that led to standardizing on D2 (see ADR-0010). The `compare/` folder keeps
the Python `diagrams` reference output and the draw.io polish instructions.

## Icon usage

AWS icons are fetched from Terrastruct's hosted icon library at render time.
They approximate the official AWS Architecture Icons; do not present the
diagram as an official AWS reference architecture. Use the group
borders/colors for boundaries and annotations.

**Last updated:** 2026-11-10
