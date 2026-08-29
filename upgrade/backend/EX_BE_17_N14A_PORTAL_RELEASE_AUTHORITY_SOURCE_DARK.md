# N14A — Portal release authority, source-dark

Status: `N14A_COMPLETE_SOURCE_DARK / RELEASE_CANDIDATE_AUTOMATION_READY /
PRODUCTION_INACTIVE / N14B_COMPATIBILITY_ADJUNCT_ACCEPTED_SEPARATELY`

Date: 2026-08-26  
Owner: Portal backend  
External contact: none  
Trading System traffic: none

## Goal and boundary

N14A makes one Portal release an exact, reviewable set of bytes without
claiming Trading System or runtime authority. It owns Portal release
manifests, image supply-chain evidence, SGP dev/stable isolation, migration,
restore and rollback policy. It does not import an owner candidate, open
AWS-HK traffic, enable Projection/Query/SSE/commands or deploy Trading System.

## Delivered architecture

### Immutable six-service release pack

`portal.release-manifest.v1` binds one protected-main commit to all six Portal
images by `image@sha256`, both deployment profiles, the exact compatibility
matrix, migration-chain digest, candidate-evidence digest and rollback
runbook. The service set is exact:

- SGP Research: Portal API, Portal web, Control API and Roadmap API;
- AWS-HK Execution: Rust Execution Edge and Source Proxy, both source-dark.

Unknown, duplicate, missing, tag-only or digest-drifted images fail closed.
JSON duplicate keys, symlinks, unsafe paths, oversized files and secret-shaped
evidence are rejected before interpretation.

### Supply-chain and owner decision

Protected-main publication waits for the successful `Portal CI` check on the
same commit. BuildKit produces provenance and SBOM attestations for every
image. Trivy records HIGH/CRITICAL evidence and rejects every CRITICAL finding.
Cosign signs all six immutable image digests and verifies signature, SPDX SBOM
and SLSA provenance before the candidate is generated.

Production deployment accepts only the exact GitHub Actions candidate run and
reviewed manifest SHA-256. The protected production environment owner must
explicitly accept the bound vulnerability evidence. The generated
`ACCEPT_SOURCE_DARK` decision is hash-bound to the manifest and evidence; both
blobs are keyless-signed and verified before deployment. This decision can
authorize Portal deployment only. Source, Query, SSE, commands and Trading
System release acceptance are hard false.

### Dev/stable and per-cell isolation

The canonical SGP development channel remains project `portal`, loopback
`127.0.0.1:8080`, origin `dev-portal.primusspark.com` and tag `dev`. Stable is
project `portal-stable`, loopback `127.0.0.1:18081`, origin
`portal.primusspark.com`, branch `main` and exact per-service digest images.
Their PostgreSQL, Roadmap and artifact volumes are disjoint. AWS-HK remains an
image-only private profile with its own projection namespace and every source
flag false.

The production Compose file no longer uses a shared tag to select service
bytes. `PORTAL_IMAGE_TAG` is attribution metadata; four SGP image references
must come from the accepted manifest as exact digests.

### Migration, restore and rollback

The manifest binds the append-only Control API migration chain and policy
`FORWARD_ONLY_WITH_PROVEN_RESTORE_AND_FORWARD_FIX`. The rehearsal creates
three real, separate PostgreSQL volumes: dev, stable and isolated restore.
It proves:

- stable backup is captured before migration and verifies by SHA-256;
- an expand-only migration plus forward fix reaches the intended stable state;
- dev remains byte-logically untouched by stable work;
- the pre-release stable dump restores to the exact prior marker;
- no mutable volume is shared across dev, stable and restore.

Rollback selects a previously accepted, signed per-cell image manifest. An
already-applied database migration is never destructively reversed; a
compatible forward fix is the normal recovery path. Backup restore is first
rehearsed into an isolated target.

## Verification evidence

- release-authority unit/security suite: **17/17 passed**;
- actual OpenSSL Ed25519 manifest and owner-decision sign/verify: passed;
- tampered signature, replayed decision, digest drift, CRITICAL CVE, missing
  gate, symlink, secret material, shared volume and source activation: rejected;
- Docker PostgreSQL dev/stable/restore rehearsal: passed and cleaned up;
- dev, stable and AWS-HK Compose rendering: passed;
- stable backup/restore and expand/forward-fix: passed;
- GitHub Actions `actionlint 1.7.7`: passed;
- JSON syntax, Python compile and shell syntax: passed;
- no AWS-HK, Trading System, source credential or production runtime was used.

The real keyless Cosign image evidence is intentionally created only after
this code reaches protected `main`; local synthetic evidence is never
relabelled as a production candidate.

## A result and B next action

| Phase | Lane A result | Exact Lane B next action |
|---|---|---|
| N13 | source-dark seven-capability state machine, PostgreSQL plan/apply/verify and fixture rollback complete | after the master owner return and N06 evidence, import exact owner bytes and promote one Paper read capability to shadow; never use templates |
| N14 | immutable six-image release pack, supply-chain gates, owner decision, dev/stable isolation and restore/rollback rehearsal complete | after N13B selects an exact target, bind accepted Trading System source/gateway commit, images, config and contracts; run joint preflight/deploy/rollback/forward-fix and record both owners' exact approval |
| N15 | read/command foundations exist; Event/Artifact source-dark contract remains the next Portal-owned slice | after N15A and owner publication, exercise real mTLS/JWT four-interface transport, WAN/fault/compatibility acceptance without authority widening |
| N16 | not started; next after N15A is source-dark routing/emergency policy | after N15B and accepted R3 protective routes, prove real acknowledgement/reconciliation during a bounded owner window; R4 never inherits the path |
| N17 | not started; source-dark SLO/DR/rotation preparation follows N16A | only after N13B–N16B, run bounded production SLO/DR/game-day evidence and obtain Bobby's final exact sign-off; this maps to product phase 18 |

## N14B admission — superseded 2026-08-29

N14B is now accepted as a separate current-source compatibility adjunct for
the exact bounded Paper target selected by N13B. It re-verifies the complete
N14A candidate and does not edit or relabel N14A evidence. Its Portal decision
still does not authorize deployment, source/Query/SSE/command activation or a
Trading System release. See
[`EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md`](./EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md).

Canonical runbook:
[`portal-n14a-source-dark-release-and-rollback.md`](../../deploy/runbooks/portal-n14a-source-dark-release-and-rollback.md).
