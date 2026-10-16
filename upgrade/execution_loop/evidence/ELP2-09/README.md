# ELP2-09 — Realtime revocation và replay

## Entry / approved scope

Bobby assigned ELP2-09 on2026-10-16. Repo `/home/bobby/portal-research`,
branch `docs/research-loop-plan`, clean entry
`daf434875e28aa131105d7f27d910b2f0ca05792`. No goal/push/merge/deploy,
frontend/preview build, upstream activation or HK mutation is assigned.

Read Unified§14/ELP2-09, Portal guide§§5.3/6.3–6.6/13.4/15 ELP2-09,
relevant Edge continuity/filter/recovery sections, campaign rules§§7–8,
packet template and01/04/05/06/07/08 dependencies. Authority remains Portal
identity/policy, TS business/economics, Edge transport/projection. Legacy raw
stream denial and retained-review no-stream behavior remain intact.

Goal: bounded scoped replay contracts, current-authority delivery/cursor fences,
durable projection/checkpoint and post-commit ACK proof, backpressure/reconnect
bounds, revocation race harness and operator/Claude handoff. Reuse existing
minted read scopes, command reauthorization and selected projection journal;
no second financial ledger or generic browser source feed.

Primary owns new `execution-v2/realtime*`, integration with scoped authorities
where required, generators/contracts/tests and shared tracking. Additive
migration only if existing storage cannot carry the invariant, reserved by
primary after inventory. Forbidden: frontend, Research implementation,
credentials/config, source TS/PM/Edge writes, business commands, service changes.

Validation: focused affected unit/contract/race tests first; real disposable
PostgreSQL where durable transaction claims require it; one coherent normal-hook
commit, no bypass. One heavy lane, aggregate4CPU/4GiB/8GiB transient,≤2workers.
No TS/DL workload. No performance SLA is invented from local timing. Rollback:
disable new stream sends/consumer, preserve journal/checkpoints/current policy
and safe authorized snapshots; never restore revoked access or erase facts.

## Task map (before delegation)

| Task | Owner / write allowlist | Inputs / output / acceptance | Budget / exclusions |
| --- | --- | --- | --- |
|09-SOURCE|Read-only source agent; only `ELP2-09/source-alignment.md`|Repin correct HK PM/Edge worktrees/current guides/journals/locks; continuity/coverage/ACK qualification and exact gaps|SSH metadata/source only; no runtime/API/DB writes, tests/build, branch/credential changes|
|09-REUSE|Read-only independent reviewer; only `ELP2-09/reuse-review.md`|Audit scoped reads/legacy realtime/projection and queue/export/cache boundaries; propose exact reuse/security tests forT09-01…14|No application/shared contracts/docs edits, build/DB tests or Git mutations|
|09-CORE|Primary; remaining allowlist|Freeze schema, implement bounded replay/authority primitives, integrate reused storage, generator/fixtures, tests/receipts/journal/handoff|One heavy validation lane; own all shared artifacts and final integration|
|09-TEST|Independent test writer; only `apps/control-api/test/elp209-realtime.spec.ts`|Pure cursor/notice/hub tests against frozen runtime module; primary runs tests/integration|No app/contracts/shared docs edits, generator/build/DB/Git actions; no heavy workload|

Source/design/fixture/component/DB/runtime/browser evidence remain separate.
AllT09 gates NOT_RUN at entry. Frontend NOT_STARTED_BY_OWNER_DIRECTION;
handoff AWAITING_CONSUMER_REVIEW. Full phase PASS is not claimed until its
mandatory source/privacy/propagation gates have actual evidence.

## Current backend return — 2026-10-16

Producer: coherent normal-hook commit containing this packet, parent
`daf434875e28aa131105d7f27d910b2f0ca05792`. This is a **bounded backend
component/contract delivery**, not a mounted source-connected SSE service.
Terminal normal-hook exit0 is required to land. Final counts, log digest and
commit are recorded in
`/home/bobby/.local/state/portal-execution-elp209/20261016/landing-receipt.json`;
do not treat a planned hook as PASS.

[Source audit](source-alignment.md) pins PM R2
`d16aa2b5f251596e469807f57e81fe14cdc7e763` and final Edge
`f10c15f6bd6d7e30358af5946c2877b33b8fe4c2`, including the concurrent source
owner commit. [Independent review](reuse-review.md), especially its final §9,
corrects an earlier generic cursor assumption against exact Edge semantics.
[Contract/handoff and debt](coverage-and-handoff.md) and
[recovery runbook](replay-runbook.md) are part of the delivery.

### Delivered / compatibility

- Exact Edge notification-only notice/batch parser and canonical Quality;
  generated schema-only OpenAPI, JSON Schema, TypeScript and eight synthetic
  examples. Five downstream states have precise action/terminal/absence rules.
  Private scope/authority inputs are not a browser DTO. No public SSE route,
  source adapter, credential, timer or runtime flag is installed.
- AES-256-GCM, domain-separated rotating keys, random fixed-length padding and
  TTL-bound cursor bind actor/session/current scope, workspace/environment/
  profile, app/field/model/schema/query/source-set, epoch/generation, snapshot
  and interval. Raw offsets, hidden counts and source-token length/equality
  are not exposed. Current candidate accepts the pinned scoped `kc1`
  constructor's private cursor **≤2048 bytes**, outer token≤4096 characters;
  this is not support for arbitrary generic4096-byte source tokens.
- Snapshot-barrier-only subscription, exact source batch validation, no
  `notices(None)` start-at-head shortcut. Visible/hidden scanning belongs to
  the qualified private adapter. `caught_up` is transport, not completeness;
  true gap/malformed batch/generation mismatch resets instead of guessing.
- Stable authorization identity excludes changing document revision and
  hidden directory membership, but preserves effective visible tuples/fields
  and current authority. Every protected send resolves current business scope
  and requires separate `stream.subscribe`; one synchronous write is fenced
  under existing app policy/session locks. No source/network await holds the
  delivery transaction. Remote TS authority is not atomically locked by Portal.
- Per-client entries/bytes, global bytes, active+pending subscriptions, source
  flights and deadlines are explicit finite limits. Identical scoped in-flight
  reads coalesce; one stuck abort-ignoring provider keeps its occupied slot.
  Slow clients reset/purge; stop latches across pending authorization; peers
  remain independent. No browser TS polling or new background service.
- Reuse migration135 immutable document/head transaction. ACK is after COMMIT
  and after releasing the DB connection. Failed ACK leaves the commit intact;
  retry deduplicates the current revision. Correction/removal preserves prior
  documents, and A→B→A cannot resurrect stale facts. This is a **local projection
  ACK**, not a new TS event/retention ACK. No migration or second financial ledger.

### Tests / failures / exact proof level

| Check | Observed result |
| --- | --- |
| First generation on host | Failed because host contracts node_modules lacked zod; used existing Control API dependency resolution via NODE_PATH, without dependency/lockfile change. Canonical isolated contract cell installs its own pinned dependencies |
| Independent pure test draft | Initial fixture incorrectly repeated a cursor; fixed test adapter to advance it. Final delegated67/67 PASS, not source qualification |
| Final focused pure replay | **68/68 PASS**,966ms,10:57:11UTC; includes invalid trusted clock and private cursor2048/2049 boundary. One worker |
| Focused contract parity | **25/25 PASS**,566ms,10:53:22UTC; AJV2020/runtime, strict states, canonical Quality/UTC and bounds |
| Focused real PostgreSQL cell | **206/206 PASS**,4 files,27.18s,10:56:58UTC; Control API build and scoped restore drill PASS. Covers the then-frozen67pure/110scope/18store/11command cases; later local revoke trace and replacement-removal cases belong to final normal-hook result, not this earlier count |
| Source build/typecheck | Host no-emit PASS; focused canonical cell build PASS. Final coherent source build belongs to normal hook |
| Drift/snapshot/static legacy | Generator --check and snapshot PASS; N29 and EDS-12 static check exit0, runtime_effect NONE. Not a new product activation |
| Final normal hook | Required before landing; `/tmp/elp209-normal-hook-20261016.log` and external landing receipt hold actual terminal result and final counts. Focused/full overlapping tests are not added as unique coverage |
| Source/runtime/browser | Read-only source pins/code/journals only. No real Edge TLS/JWT/read policy, source-loss proof, remote propagation, browser/HiFi, source calls, preview rebuild or deployed artifact verification |

### Requirement → code/proof → gate disposition

All PASS below mean the stated **component/isolated-PG boundary only**. Guide
mandatory source/privacy/propagation exit remains distinct.

| Gate | Implementation and discriminating evidence | Disposition / limit |
| --- | --- | --- |
| T09-01 snapshot/tail, durable ACK | Required barrier cursor, Last-Event-ID binding; PG committed head visible from independent client; lost ACK retry and rollback | PASS component/PG; qualified snapshot→source tail integration OPEN05-001/06-002 |
| T09-02 duplicate/order/removal | Exact notice cursor validation; existing seq+1/digest/current-idempotency; append-only correction/removal and reject historical A→B→A | PASS isolated journal; no financial delta/tombstone stream invented |
| T09-03 epoch/generation | Separate cursor binding axes; mismatch terminal resync; immutable generation CAS reused | PASS component/PG; actual producer replacement generation source gate OPEN |
| T09-04 wrong/expired cursor | All14 binding axes, MAC/tag/key/schema/query/filter/expiry/size/clock negatives | PASS component; current source trust not commissioned |
| T09-05 cache+stream revoke | Current read-scope HIT/FOLLOWER/MISS regressions retained and rerun; fresh business+stream fence, revoked/expired session/grant, queued writes purged | PASS local authority; cross-host measured propagation OPEN |
| T09-06 replay/export after revoke | Old cursor cannot supply current scope; every send rechecks; no Execution export/download mounted (04 census) | Replay denial PASS; positive Execution export N/A absent product route, not substitute Research export |
| T09-07 queued intents/late facts | Re-run unchanged07 transactional revoke-before-send and lookup-only accepted outcome after human revoke; local projection ingest has no human session dependency | PASS TEST_ONLY PG/command regression; actual source commit authority remains07-001 |
| T09-08 reconnect/slow consumers | Pending+active cap before authorization; immutable required limits, per-client/global bytes, coalescing, latch/late result, abort-ignoring provider slot retention | PASS component; placement/cadence/load/RSS/SLA belongs10, no automatic runtime defaults |
| T09-09 visible-hidden-visible | Coalesced scan-end notices; hidden-only heartbeat, fixed-size randomized encrypted token, no public sequence/count; own visible authorization identity | PASS trusted-adapter double; actual dense source receipt verification OPEN05-001 |
| T09-10 true loss | Missing/inconsistent continuation, duplicates, stalled uncaught-up page or private coverage error fail to resync; PG missing sequence rejected | PASS negative handling; external coverage cryptographic proof not supplied by a parsed batch |
| T09-11 revoke during replay | Final-write guard, prefetched source wait vs committed app revoke, pending revoke advisory lock; no legacy fallback | PASS local component/PG; final local trace recorded by normal hook, not distributed SLA |
| T09-12 legacy mapping | Unchanged foundation explicit legacy disposition and V2 legacy-stream denial rerun in normal hook | Reused tests only; no ambiguous generation mapping or legacy raw feed enabled |
| T09-13 field/model invalidation | Cursor revision binding + fresh field/tuple scope, field-policy/model/schema negatives | PASS component; actual model-publication adapter still06-002 |
| T09-14 linked researcher privacy | Reused scoped DB linked-shell/tuple/filter/field negatives; opaque no-count frames, own-query isolation | PASS local component; source→browser manager/researcher privacy receipt OPEN |

### Review fixes / resource and rollback closeout

The independent review found four implementation defects; this delivery fixes
all four: complete frozen limits, release-before-ACK, latched stop and bounded
pending authorization. Also fixed temporal window/action consistency, session401
classification, bad trusted clock and hidden-directory identity leakage. Review
is not counted as a test or source receipt.

Pre-heavy host read:32,092MiB total,11,886MiB available;157GiB disk available.
Canonical focused cell ceilings3CPU/3GiB Node +1CPU/1GiB PostgreSQL, worker1;
existing script trap removed its owned containers/network/temp dependency tree
on exit0. No source/Portal runtime volumes were mounted or removed. Peak RSS/
sourceQPS/latency under load **NOT_MEASURED**; no performance gate claimed.
Final hook cell/cleanup and line stats are in the external landing receipt.

Rollback: no new mounted path to deactivate; stop candidate hub/sends if later
integrated, keep current authorized named snapshots with freshness, journal,
checkpoints and accepted-command reconciliation. Never restore old grants,
erase old facts or blindly resend an unknown command.

### Exit / next work

- **Backend:** CONTRACT_AND_COMPONENT_QUALIFIED_AT_COMMIT, normal hook required;
  no known failing local test at focused freeze. **Full09 exit:
  NOT_MET_SOURCE_PROPAGATION_BROWSER**, not product-active or source-qualified.
- **Frontend:** NOT_STARTED_BY_OWNER_DIRECTION;09-001 handoff
  AWAITING_CONSUMER_REVIEW. No FE/layout/token/baseline changes.
- **Backend next-ready:** selected ELP2-10 bounded performance/coexistence impact
  work after separate assignment. Real source stream activation still requires
  existing05-001/06-002/07-001 source/trust work; this does not block independent10.
- **Claude next-ready when assigned:** UXM-08/09/10 typed revalidate/resync/revoke/
  retained stories from09 fixture; real-source/browser lane only after explicit
  compatible adapter/source/trust qualification. See prompt in handoff.
- **Two-way requests:** one new09-001 consumer handoff; existing source debts
  referenced, not duplicated. No consumer acceptance received. No formula or
  extra authority decision requested from Bobby in this backend scope.
- **Recommended assignment:** ELP2-10 selected workload/placement with approved
  target/budgets, not automatic source/SSE/trading activation. No next phase,
  goal, push, dev/main merge, signing or deploy started by this packet.
