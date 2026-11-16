# `main.tf` — Storage module (web + media buckets)

**Purpose:** Create the two private S3 buckets and their baseline security/lifecycle settings.

## Buckets

| Bucket | Holds | Access |
|---|---|---|
| `<project>-<stage>-web` | Built SPA (`index.html`, hashed assets) | CloudFront OAC only (policy lives in the cloudfront module). |
| `<project>-<stage>-media` | Full + thumbnail images | Presigned URLs only; CORS rule lives in the cloudfront module. |

## Shared settings (both buckets)

- **Ownership controls:** `BucketOwnerEnforced` (ACLs disabled).
- **Public access block:** all four flags true.
- **SSE-S3:** AES256 at rest, no KMS cost.
- **Lifecycle:** abort incomplete multipart uploads after 1 day.

## Teaching notes

- **Why no web-bucket policy here?** The OAC policy needs the CloudFront distribution ARN, which only the cloudfront module knows. It lives there to avoid a cycle.
- **Why no media CORS here?** The CORS rule needs the distribution domain, and S3 has one CORS singleton per bucket. The `moved` blocks in the envs relocate the existing resource into cloudfront without recreation.
- **Prod deletion protection:** a bucket policy denies `s3:DeleteBucket` for media. The web bucket gets the matching statement in the cloudfront module’s policy. An explicit Deny beats IAM Allow.
- **Dev is destroyable:** no deletion policy in dev, so the stack can be torn down.
- **SSE-S3 vs SSE-KMS:** SSE-S3 is free and sufficient here; KMS adds key cost and IAM complexity.

## Safe changes

- Changing bucket names creates new buckets; it is not a rename.
- Do not remove the public access block.
- Do not add a second bucket policy; S3 allows one.

## Related

- `infra/modules/cloudfront` (OAC policy + media CORS)
- `infra/modules/lambda` (media bucket IAM)
- ADR-0004
