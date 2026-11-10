# ADR-0004: Use Presigned S3 for Media

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

Images are private per user, include a full-size and a thumbnail, and must be uploaded and read without exceeding API payload limits. Cost should stay near zero.

## Options Considered

1. **Base64 through the API** — simple but limited by API Gateway (10 MB) and Lambda (6 MB sync) payloads; inefficient.
2. **Presigned S3 PUT/GET** — browser uploads directly; API returns short-lived GET URLs; private bucket; no key management.
3. **CloudFront signed URLs** — private CDN delivery, but requires a key group, private-key management, and cache-policy care.

## Decision

Use **presigned S3 URLs** for uploads and reads in v1. Revisit CloudFront signed URLs later if CDN caching or a media custom domain is needed.

## Consequences

- Positive: avoids API payload limits; simple IAM-based access; private bucket; near-zero cost at demo traffic.
- Negative: no CDN caching; every image request hits S3; URLs expire and must be refreshed.
- Follow-ups: 1-hour URL TTL; TanStack Query refetch before expiry; server-side re-encode strips EXIF.
