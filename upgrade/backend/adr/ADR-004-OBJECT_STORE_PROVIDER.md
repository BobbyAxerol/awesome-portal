# ADR-004 — Object storage provider and retention profile

> **Status:** Proposed for owner confirmation (BAR-08 prerequisite)<br>
> **Date:** 2026-08-16<br>
> **Required by:** U11 immutable artifacts

## Context

U11 introduces immutable content-addressed artifacts. The guide locks an
S3-compatible API (MinIO local/CI) and leaves the production provider open.

## Decision

- Local/CI: **MinIO** (`minio/minio`) as the private compose service with a
  dev credential pair; layout mirrors the S3 bucket path one-to-one.
- Production: provider selected by the owner (Cloudflare R2 vs VPS-local
  MinIO vs managed S3) before the first U11 release; the application talks
  only the S3 API and signed object URLs, never provider SDK specifics.
- Retention: bundles are append-only; a garbage-collection reconcile job
  (orphan/corrupt detection) runs explicitly, never silently deletes.

## Rejected alternatives

- Filesystem-only storage: loses immutability/audit boundaries.
- Provider-specific SDK paths: lock-in before a production decision exists.

## Security/operations impact

- Credentials are runtime secrets; the repo never carries them.
- Content-addressing makes tampering detectable on read.

## Migration and rollback

- Legacy prototype artifacts import explicitly into bundles; rollback keeps
  the legacy reader untouched.

## Acceptance evidence

- MinIO service healthy in compose; content-addressed bundles verified by
  digest in tests and smoke.
