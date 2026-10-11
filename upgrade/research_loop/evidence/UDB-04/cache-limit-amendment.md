# UDB-04 — Approved 16 MiB retained-data cache amendment

2026-10-11 · branch `docs/research-loop-plan` · parent `45821580`.
Bobby explicitly approved **contract + strict frontend validator**, preserving
the design. This amendment supersedes the earlier optional/not-activated
cache proposal only; **ACCEPTANCE_OPEN_NOT_PHASE_PASS** remains unchanged.

## Delivered boundary

- One backend constant: **16,777,216 bytes**. The snapshot repository bounds
  the aggregate serialized data across at most three entries, not 16 MiB per
  entry. The separately bounded metadata cache remains a single entry.
  This is not a heap/RAM limit or an HTTP-response limit.
- TTL remains 2,000 ms. Sixteen in-flight reads, revision revalidation,
  workspace/environment/profile keys and transactional-cache bypass unchanged.
  Too-large snapshots are returned through the existing bounded named BFFs
  but are not retained; eviction preserves the aggregate bound.
- Effective permissions, owner and sessions are never cached. Core access is
  still rechecked for every request, including after a cold shared read;
  expiry, revoke and source-store outages keep their existing refusal paths.
- `execution-retained-review.v1.schema.json` is the OpenAPI `$ref` authority.
  The named generator regenerates `execution-retained-review.d.ts`;
  `components["schemas"]["RetainedReviewResponse"]["revocation"]` now publishes
  the exact literal `16777216`. Canonical fixture and strict browser validator
  agree. No new endpoint, source acceptance or profile activation.
- Only frontend production change: one validator literal. No TSX/component,
  layout, typography, palette, copy, interaction or visual baseline changed.
  Unrelated 8 MiB transport/market/artifact bounds remain unchanged.

## Focused tests / evidence reuse

| Check | Actual result |
|---|---|
| Backend context/cache/outage suite | Initial 13/13 PASS; the subsequently added exact-byte test separately 1/1 PASS, 13 deselected. Final normal hook exercises all 14 together. |
| Byte bounds | 7/9/15 MiB views retained; 17 MiB refused from cache. Exactly 16,777,216 serialized bytes retained; one extra byte not retained. Two 9 MiB views evict the first, not exceed the aggregate budget. |
| Canonical schema/OpenAPI/generated contract | 4/4 PASS; exact approved literal, stale 8 MiB, over-budget, string/null and permission-cache negatives. |
| Strict frontend consumer and failure/session behavior | 47/47 PASS; canonical 16 MiB accepted; stale 8 MiB/invalid bounds rejected; initial stale response opens neither polling nor streaming. Existing revoke/logout/scope/failure tests preserved. |
| Preview builds | Control API compile PASS; web `tsc -b` + Vite production build PASS. Planning build reused unchanged Docker layer, no redundant engine rebuild. |
| Real browser | 4/4 scoped cells PASS, Fleet/Paper at1280/660 on Chromium151.0.7922.34: actual context16MiB, retained banner, overflow0, console/page/APIerrors0, stream/write0. One context per document, explicit Refresh reads once, idle3s/0API. Logout201; not full68cell/Axe acceptance. Screenshot buffers were hashed then discarded, not a new visual baseline/retained image receipt. |
| Normal root hook | Required once for the coherent commit. Final verdict/log hash/commit binding recorded after it in private `cache-amendment-post-commit.json`, not guessed from focused tests. |

Do not rerun QuantBT, restore a clone, create jobs or re-record UI baselines
for a cache-policy literal. Older mixed-load latency FAILs and accessibility/
Portfolio/CC bootstrap gaps remain open; this amendment does not manufacture
a single-candidate performance or product PASS.

## Preview / rollback / cleanup boundary

Build and replace only `control-api` and `portal-web` through the existing
preview helper. No migration/bootstrap, PG/NATS/worker restart, auth/grant edit,
source/Edge/SSE/command, remote push, dev/main/stable or signed release.
Preserve both previous image aliases before build. A rollback restores both
old images together, since an old strict browser rejects a 16 MiB context.
A loaded old bundle likewise needs reload after this coordinated preview
change; malformed policy must fail closed rather than revive live transport.

Pre-build free disk: 178,402,951,168 / 665,811,062,784 bytes, 26.79%; above
C4's 20% threshold. No new test volume/account/job; no broad prune, cache
purge or business-data deletion. Raw browser evidence stays private 0600,
30-day retention. Current/previous images remain protected.

## Applied preview identity / real data-cache proof

Helper app-only rollout completed2026-10-11T03:45:54Z, Nginx configuration
check/reload PASS. Six unchanged services retain **both container ID and image**:
Core PG, Execution PG, NATS, Research API, worker, Roadmap. No migration.

- Control API: `sha256:1fa9b8be1b40a97a7debd0940dae9a88ec1ee1ead7d8eb30c4359abe0f2ed3d0`.
- Web: `sha256:a460de6b0be3593a46fdd6944ed60ae30fa8bc44d05062e3311be6a12faa87f3`;
  bundle `/assets/index-BFOr8Gf2.js`.
- Exact Control COPY inputs549files:
  `2037ce7de13e784420e8407ea24426c0573f9c5ef10fd054cccb0ec6dd411701`.
  Built from parent45821580 + recorded working diff, not a signed/cleanrelease.
  After commit, bind the unchanged inputs without rebuilding docs.
- Real retained Paper snapshot **11,184,215 serialized bytes**: initial4queries,
  same-process warm0queries/identical view; after2.1s expiry1revision query,
  identical view/original source clocks. This direct repository probe is not
  HTTP authorization or latency qualification. Edge/Market/SSE/commands/mirror
  writer+reads all remainfalse. No authority state or source data was written.

Private raw evidence appended without overwriting old terminal receipts:
`/home/bobby/.local/state/portal-udb04/acceptance-20261011/`,0600,30days:

| File | SHA-256 |
|---|---|
| `cache-amendment-before.json` | `c37912c87e96cabce264e927afae76965130fc84d88ef9a6e319f9c89c12f205` |
| `cache-amendment-read.json` | `545fca198fd09a9c11cbb7bae3025b12b11c38fd5af1496701a2fd88df625eff` |
| `cache-amendment-browser.json` | `60516c8db8352ed730dfe21d833d90dbcaa58a1767f0ca0634b7867ad70d89eb` |

Post-build free disk178,206,105,600bytes/665,811,062,784bytes≈26.77%.
No new owned account/volume/job; the browser's exact test session was logged
out. Previous Control4278509a/webae86a99c aliases remain resolvable rollback
pins. No image/cache pruning while build/verification is active.

## Claude handoff

Consume the regenerated canonical fixture/contract; no UI redesign or manual
type is needed. This exact validator edit is owner-approved and already
implemented by Codex; do not duplicate it. Continue the separately assigned
`FE-UDB04-01` bootstrap and `FE-UDB04-02` accessibility fixes. Backend still
owns four summary SLOs and Portfolio/context burst qualification.
