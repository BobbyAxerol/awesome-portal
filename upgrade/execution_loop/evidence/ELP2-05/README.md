# ELP2-05 — Catalogue and TS publication

## Entry / approved scope

Bobby assigned ELP2-05 on 2026-10-16. Worktree `/home/bobby/portal-research`,
branch `docs/research-loop-plan`, clean entry at
`2ec5924da42a42525f96cb733e30bb062a034074`. No goal, push, merge dev/main,
deployment, remote edit, credential renewal, source activation or frontend work.
Guide: Portal v1.2 §2.3.1 / §15 ELP2-05, Edge EPG10-02…05;
[rules](../../AGENT_WORKING_RULES.md). Reuse scoped readers and normal-hook
receipt from ELP2-04; do not equate current-page or retained observations with
authoritative history or certified returns.

Own local `execution-v2` publication/catalogue modules and tests, narrow contract
generator/schema/fixtures and this packet/Unified. Preserve Research, frontend,
policy/grants, source facts and existing checkpoints. No migration anticipated.
Local bounded validation: at most one isolated PostgreSQL cell, aggregate
4 CPU/4 GiB, ≤2 workers, one heavy lane; no live TS/DL probes or load. Entry
capacity: root 156 GiB free (25%), available RAM 12,741 MiB. Rollback: revert
this adapter/contract slice; never restore revoked authority or delete facts.

## Task map and single-writer ownership

| Task | Owner / allowlist | Output / constraints |
| --- | --- | --- |
| Source alignment | Primary | Read-only HK pins and source manifests; no business rows or credentials |
| Edge publication review | Independent agent | Read-only selected Edge contract/journal; report exact proof/gaps; no edits/runtime |
| Local catalogue review / bounded translator fixes | Independent agent | Initially read-only; explicit follow-up owned only maximum-data-operation.service.ts and new current-page tests. Primary resumed these paths after handoff, reviewed and integrated; no simultaneous writers/runtime |
| Publication schema/registry/adapters | Primary | One writer for contracts/generated/backend/shared docs; bounded selected-family integration |
| Integration and acceptance | Primary | Focused tests, normal-hook coherent commit, teardown and handoff; no duplicate full gates |

## Required evidence

T05-01…13 map family/field coverage, allowlist/mode boundaries, secret rejection,
bounds/cursors, snapshot/tail barrier, revoke/drain, continuity, typed absence,
fund/fleet/model provenance, pending trust, per-surface readiness, economic inputs
and ledger-only versus Research-dependent score inputs. Actual results and
external source/runtime gaps will be recorded here before delivery. No planned
test is PASS and no fixture is a production receipt.

## Delivery and actual validation

[Source alignment](source-alignment.md) and [coverage/consumer handoff](coverage-and-handoff.md)
are part of this delivery. Source imports are pinned *logical contract bytes*,
not copied business data. New catalogue metadata is additive on the existing
session-guarded operations route; no mounted route is added or renamed. Existing
112-pattern census/54 concrete aliases therefore remains applicable. No migration,
new pool, cache, projector, credential client or persistent publication state.

Changes: publication schema/registry and generated client; internal deny-default
provider composition; selected field secret guard; named current-page request
limit and byte preflight; strict zone/calendar validation compatible with actual
Manager microseconds; private timestamp-key grain preserved in both current and
retained named adapters (no change to public milliseconds, exact-ms IDs or API).
Rejected oversized pages do not persist a cursor. Existing
scope checks/current grants and final-delivery fences remain authoritative.

| Actual run / scope | Result |
| --- | --- |
| Narrow generation, immutable source hash checks | PASS; generated only publication artifacts, no Research regeneration |
| Contract schema/source/parser parity |7/7 PASS,0.845s; actual logical-source fixture, separate TEST_ONLY publication fixture |
| Focused API (publication, current-page, existing54-alias suite, scoped product reads) |131/131 PASS,4 files,16.00s; no DB/remote source/runtime |
| Additional full-manifest AJV parity / publication suite |25/25 PASS,0.794s;24 overlap the131 above, one new check. Not156 unique cases |
| Focused raw logs | `/tmp/elp205-focused-20261016.log`, SHA256 `57c191ab81e2880902c9e6d3ddf0e83601363c5eff3cb2fff7487f53362c3c61`; `/tmp/elp205-manifest-20261016.log`, SHA256 `5151a7e0aa0a4639ed72ad4814548cbaf0237c6b6bb67731010ffcf14e1b3b3c` |
| Earlier local attempts | First current-page parser rejected valid source microseconds: corrected after independent review; final suite includes6/9digit positives. First existing manifest assertion rejected the static family name `sync_health_cursor_retention` as if it were a raw cursor; original operation leakage oracle retained, additive catalogue validated separately. Neither failure is hidden as PASS |
| Normal hook/build/full regressions/isolated PG restore | Terminal result in `/tmp/elp205-normal-hook-20261016.log`; commit lands only if normal hook returns0. No hook bypass or blanket source-runtime certification |

The added AJV test initially used an OpenAPI `components` keyword directly as
JSON Schema; corrected using the repository's local `$defs` conversion and passed.
Do not add earlier18/34/66-case repeats to the final focused coverage or count contract parity as
additional source/runtime coverage. ELP2-04 actual scoped HTTP/PG/auth/cache tests
are reused only for unchanged ReadScopes/query/delivery code. The new composed
publication helper is unmounted: its pure tests do not constitute source mTLS,
real capture, durable ACK or browser acceptance.

## Requirement → implementation / evidence → exit

| Guide gate | Implementation / focused evidence | Technical result / real-source disposition |
| --- | --- | --- |
| T05-01 family/field coverage | Exact42-family registry/31-field dictionary, generated metadata and source hash/schema tests;14 product groups mapped in handoff | PASS inventory; not42 certified publications |
| T05-02 allowlist/mode | Static54 named operations; strict family/dataset/workspace/profile/revision/window/purpose binding; no generic proxy | PASS contract/negative tests; selected source authorization still requires current04 policy |
| T05-03 secret-shaped fields | Selected schema compiler rejects credential-shaped names; finite safe DTO, unknown raw fields remain stripped | PASS selected schema and existing leakage tests |
| T05-04 rows/bytes/cursor | Both translators enforce requested limit≤200,1MiB serialized bound before continuation persistence; canonical sub-ms source-key hashing avoids ID collision, with current/retained parity and strict calendar checks; existing opaque relation-bound repository unchanged | PASS focused checks; existing cursor DB proof reused, no full stable snapshot claim |
| T05-05 snapshot W/tail W+1 | Exact decimal-counter proof parser, expected partition/epoch/generation/snapshot; beyond JS integer precision | PASS TEST_ONLY input validation; **source-connected barrier NOT_RUN/BLOCKED** |
| T05-06 drain/revoke | No publication cache/fallback; reread through existing mint/delivery boundary, typed drain/revoke/expiry | PASS provider contract; actual producer drain NOT_RUN |
| T05-07 epoch/gap | Expected continuity tuple and floor checks, missing proof/changed epoch/generation/partition/snapshot refusal | PASS TEST_ONLY; real stale-publisher fence remains unproved |
| T05-08 unsupported | Null qualified-source port remains null; unavailable reason never becomes successful empty or fabricated value | PASS |
| T05-09 fund/Fleet/model | Exact source owners/grains, field sources/units; separate canonical NAV/composition/Regime families | PASS mapping; positive economic publication not certified |
| T05-10 pending trust/exporter | Frozen new exports reject TEST_ONLY by default and self-asserted SOURCE_VERIFIED blobs; no credential/transport activation | PASS fail-closed; real trust still00-003 |
| T05-11 readiness isolation | New42-family unavailability does not shut separate authorized legacy current-page adapters | PASS existing-page regressions; no uncommissioned family enabled |
| T05-12 economic inputs | Explicit snapshots vs return history, classified flows, applicable costs and unique instrument/FX interval notional | PASS dependency/source map; actual continuity/cost/flow coverage remains unqualified |
| T05-13 direct ledger vs Research | Pinned metric dependency graph: no mandatory Research run on direct PortfolioScore; exact binding remains required for Regime | PASS contract; calculator/calibration not implemented by05 |

**Backend technical verdict:** catalogue/adapter/error/contract slice delivered
through its normal-hook commit. **Full ELP2-05 runtime exit NOT_MET**: exact
selected new-family real publication/read/coverage/trust and capture receipts do
not yet exist in the inspected source. Do not relabel this as complete because
tests passed. No data/SSE/commands became available through this package.

## Canonical new requests / inherited debt

| ID / sender → owner | Observed → expected / impact | Done-when / disposition | Consumer |
| --- | --- | --- | --- |
| ELP2-REQ-05-001 · Codex → TS/Edge capture owner | EPG10-03 stale publisher survives takeover; source fence absent. Dependent snapshot-tail cannot be certified | OPEN_SOURCE_CONTRACT; fix generation check at durable commit, real multi-connection late-commit/takeover proof and selected writer coverage. Destination Edge03/04, Portal05/06/09 re-evaluate only impacted receipts | No authoritative stream/replay claim |
| ELP2-REQ-05-002 · Codex → Claude | Additive static catalogue and current-page semantics published; not yet acknowledged | CONTRACT_DELIVERED_AT_PACKET_COMMIT (normal hook required); generated PublicationCatalogue / ManagerPublicationManifest, fixture and mapping in handoff. CLOSED only after assigned consumer receipt | AWAITING_CONSUMER_REVIEW; NOT_STARTED_BY_OWNER_DIRECTION |

Inherited canonical IDs, **not duplicated or closed here**:
00-002 reviewed field matrix;00-003 exact image/schema/profile/trust/selected
publication receipts;00-004 runtime attestation;00-005 metric calculator/config;
04-008 current parent lineage;04-009 technical/audit/private scoped transports;
04-010 assigned consumer acceptance. Their owner/done-when stays in the original
packet. Source absence is a typed block, not a completed positive feature.

## Resource/rollback and next step

Pure focused tests created no containers, DB, files in runtime or remote load.
Normal hook owns its disposable PG/node/network and trap teardown. Terminal
cleanup/capacity is recorded after that hook; retain raw logs/evidence, no broad
prune or deletion of data/active/rollback images. Default trust, runtime flags,
users/grants and checkpoints stay unchanged. Roll back additive contract/adapter
code without reviving denied V2 or reverting source state.

- Backend next-ready: ELP2-06 **design/fixtures/selected existing scoped read
  work only**, after Bobby assigns it. New source-connected projection requires
 05-001 and00-003 selected family proof; other independent work needn't wait.
- Claude next-ready: assigned UXM field/availability/read-only fixture work
  using the handoff. No frontend implementation automatically assigned by05.
- No further owner choice is requested for this already-approved local slice.
  Remote capture/trust/runtime changes need an exact separate approved package.
- No goal, push, dev/main merge, signed release, deployment or next phase started.
