# draw.io polish baseline (manual)

This folder is for the optional **manual polish pass** described in
`docs/diagrams/README.md` and `docs/diagrams/compare/COMPARISON.md`.

## Workflow

1. Open [draw.io](https://app.diagrams.net/) (or the desktop app).
2. **Arrange → Insert → Advanced → Mermaid**, then paste a Mermaid
   diagram from `docs/ARCHITECTURE.md`
   — or — **File → Import** the D2 SVG (`docs/diagrams/aws-deployment.svg`).
3. Replace generic nodes with shapes from the built-in **AWS** shape
   libraries (or import the official AWS Architecture Icons).
4. Adjust layout, group colors, labels, and legend.
5. Save the source as `docs/diagrams/compare/drawio/aws-deployment.drawio`
   and export `aws-deployment.svg` / `aws-deployment.png` next to it.
6. Reference the winner in `docs/diagrams/compare/COMPARISON.md`.

## Why manual?

draw.io gives full layout control and the closest match to the official
AWS reference style, but the `.drawio` source is XML (noisy diffs) and the
polish is lost on regeneration. Treat it as a **milestone snapshot**, not a
living view — see ADR-0009.
