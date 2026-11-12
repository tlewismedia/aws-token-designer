# ADR-0011: Port the Source UI Markup and CSS

- Status: Accepted
- Date: 2026-11-12
- Deciders: Tom
- Related: ADR-0006 (custom Cognito forms), ADR-0008 (cost guardrails),
  `docs/PLAN.md` §6.2, `docs/ARCHITECTURE.md` §5.3

## Context

The AWS port initially used a Vite/React scaffold with its own styling. After
the functional port (auth, images, sheets, generation, upload, print, billing
shells) the shipped UI no longer looked like the Firebase source app, and the
source remained the visual reference (`/Users/tomlewis/prj/firebase-token-designer`,
live at `https://game-token-generator.web.app`).

The port also has constraints the source did not: Cognito auth forms instead of
Firebase UI, async generation jobs instead of a direct call, a server-enforced
63-token cap, disabled purchases, a `font-src 'self'` CSP, and a public-repo
asset/copy review. A straight copy would not compile against the AWS contracts,
and a fresh redesign would drift further from the reference.

## Options Considered

1. **Keep the scaffold UI** — least churn, but the visual/product parity goal is
   lost and reviewers cannot compare screens side by side.
2. **Port the source markup and CSS per component, adapting behavior** — keeps
   the familiar layout, typography, images, and print sheet while replacing
   Firebase-specific behavior with the AWS contracts. Cost: source CSS quirks
   and dead rules come along unless pruned.
3. **Redesign from scratch** — clean CSS and modern components, but unnecessary
   design work and a larger, harder-to-review diff against the reference.

## Decision

Port the source markup and component CSS, preserving source class names and
visual decisions (global theme in `App.css`, component files beside each
component). Adapt only where the backend differs:

- Cognito/Amplify auth pages with inline auth errors (replacing Firebase UI
  alerts). Registration also adds a Confirm password field; the source form has
  email/password only.
- Async generation: keep the source form fields and copy, poll the job, and show
  structured moderation/rate-limit errors.
- Gallery/sheet add/remove/clear/delete use TanStack Query mutations; the server
  enforces ownership and the 63-token cap.
- Self-host the source fonts with `@fontsource` because the deployed CSP is
  `font-src 'self'`; no `fonts.googleapis.com` or `fonts.gstatic.com` requests.
- Keep the source print sheet 7.5in × 10in with a 7×9 (63-cell) grid and hide
  the navbar, library, and sheet header when printing.
- `/buy-credits` keeps the source page shell but is inert: no Stripe.js, no
  publishable key, and no checkout request.
- Brand the product **Token Shoppe beta** in the document title, logo, and
  marketing copy. `Token Designer` remains the project/repo name.
- Prune source-only dead rules (`.sheet-info`, `.collection-placeholder`,
  `.promo__for_who_list`, `.promo__work_call_out`). `styles.css` is limited to
  the shared border-box reset, `.loading`, and `.error-message`, with a header
  comment explaining why it still exists.

Intentional differences from the source UI are documented in
`docs/TESTING.md` (return-page copy and states) and `docs/PLAN.md` §6.2.

## Consequences

- Positive: the deployed app is visually comparable with the source at desktop
  and mobile widths; the print sheet matches; one theme instead of two; future
  visual fixes are easy to diff against the reference.
- Negative: some source CSS is global and quirky (hover-only overlay buttons,
  print scaling); the port inherits accessibility and responsiveness gaps that
  were present in the reference. Bundling fonts adds a small asset payload.
- Follow-ups: confirm artwork licensing/provenance before publishing assets
  (`docs/PUBLIC_SAFE.md`); keep the print and `/buy-credits` checks in
  `docs/TESTING.md` after future UI changes; revisit a11y (focus visibility,
  contrast, and keyboard access to hover-only controls) if the UI is promoted
  beyond demo status.
