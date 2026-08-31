# N29 Execution Manager product release and rollback

## Authority

This runbook releases only the exact manifest-bound capability set. It never
authorizes a Trading System change, direct database/Redis/browser access or a
Live mutation. Bobby owns merge and stable release decisions.

## Candidate admission

1. Run Portal CI including `execution-n29-product-acceptance-test.sh`.
2. Require the BR-EX-69 create/idempotency/SoD suite and BR-EX-71
   keyset/LAPSED-attention suite to pass against a fresh PostgreSQL migration.
3. Require the N29 verdict to remain `BACKEND_ACCEPTED_PRODUCT_RELEASE_NO_GO`
   until the frontend same-origin consumer gate is attached and its browser
   smoke evidence is recorded.
4. Merge through `dev`; promote a reviewed commit to `main` only after the
   exact product gate changes to GO in a later manifest revision.
5. Let `publish-images.yml` build, scan, sign and attest all six images. Never
   replace its immutable digest with a mutable tag.
6. Verify the release pack, compatibility matrix, SBOM, provenance and Cosign
   identity before changing a deployment profile.

## Profile order and rollback

Qualify Paper, then Sandbox, then Live read. A profile rollback disables its
frontend/BFF consumer first, then SSE, query and projection writers, and only
then restores the previous verified Edge image. Other profiles remain active.
Projection epochs are retained through the rollback window; no database is
deleted. Commands remain disabled throughout this release.

Abort on cross-profile rows, auth widening, unbounded response, cursor gap
without resnapshot, repeated native EventSource reconnect, projection
discontinuity, unknown N28 reason code or any source mutation. Restore the
previous signed image set and verify typed unavailable behavior before closing
the incident.

## Recovery evidence

Use the N17A/N24 restore and deterministic rebuild drills. Record measured
RPO/RTO, BFF/Edge latency, SSE recovery, source-loss and auth-loss results from
the actual candidate; never relabel provisional budgets as a production SLO.
