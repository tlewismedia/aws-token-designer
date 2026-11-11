terraform {
  # Partial backend: real values live in backend.hcl (gitignored) and are
  # supplied via `terraform init -backend-config=backend.hcl`.
  # Backend blocks take no variables, so this block stays empty here.
  backend "s3" {}
}
