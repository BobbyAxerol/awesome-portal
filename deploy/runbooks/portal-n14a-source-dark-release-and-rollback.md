# N14A Portal source-dark release and rollback

Status: `PORTAL_RELEASE_AUTHORITY / SOURCE_DARK / NO_TRADING_SYSTEM_TRAFFIC`

This runbook deploys a reviewed Portal release without enabling Projection,
Query, SSE or command authority. It never copies a dev database into stable and
never deploys a Trading System release.

## Admission

1. The source commit is an exact `main` commit and every service image uses an
   immutable `@sha256:` reference produced from that commit.
2. `portal-release-authority.py verify --mode candidate` accepts the complete
   pack. Cosign verifies every image signature, SBOM and provenance attestation.
3. Trivy reports zero CRITICAL findings. HIGH findings, if any, are visible in
   the exact evidence digest reviewed by the Portal owner.
4. The production environment approval creates an exact
   `ACCEPT_SOURCE_DARK` decision; both manifest and decision are signed and
   acceptance verification succeeds.
5. Stable uses project `portal-stable`, loopback `127.0.0.1:18081` and its own
   PostgreSQL/Roadmap/artifact volumes. Dev uses project `portal`, loopback
   `127.0.0.1:8080` and separate volumes.

## Deploy

1. Save a consistent stable PostgreSQL custom dump and Roadmap SQLite online
   backup with SHA-256 checks before changing images.
2. Render the stable Compose file with the exact manifest image digests. Reject
   tags such as `dev`, `latest` or a feature commit.
3. Run append-only migrations from the candidate Control API image. Start the
   stack and wait for all three API readiness probes plus the web healthcheck.
4. Atomically record source commit, manifest digest, decision digest, image
   digests, migration-chain digest and deployment time.
5. Confirm every execution/source/query/SSE/command feature remains false and
   confirm no AWS-HK or Trading System request was made.

## Rollback

1. Disable the affected Portal entry point first if health or identity checks
   fail. Stable data remains mounted only by the stable project.
2. Select the previous accepted manifest and owner decision. Verify their
   signatures before pulling or starting images.
3. Roll back only the failed cell/service images. Never roll back Research
   merely because an inactive Execution image failed, or vice versa.
4. Do not reverse an already-applied database migration destructively. Keep
   expand/contract compatibility and ship the reviewed forward fix. Use the
   pre-deploy backup only for a declared restore incident into an isolated
   target first.
5. Preserve audit/outbox, activation plans and operator visibility. Record the
   failed candidate, reason, prior manifest and final health evidence.

## N14B boundary

N14B consumes a target profile accepted by N13B and binds the exact current
source/map/qualification/profile plus Portal adapter/config/image digests in a
separate compatibility adjunct. A new Trading System release is required only
when its runtime/config is changed. N14A evidence cannot be relabelled as N14B
evidence; neither N14A nor N14B compatibility evidence authorizes deployment,
source/Query/SSE/command traffic or a Trading System release.
