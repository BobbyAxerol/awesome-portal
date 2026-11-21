# ELP2-09 — scoped notification contract and consumer handoff

## Claude intake2026-10-18 — FE-004/024/031

Owner Codex. Accepted to-do: genuine business-change identities and cross-device
per-user marker, independent from the existing notification-only revalidation
contract. No notification becomes an economic event. Distinguish no changes,
source unavailable and a retention/continuity gap; retain separate source status
and coverage axes. Exit: monotonic marker/current scope/revoke/privacy tests,
actual source continuity receipt and consumer ACK. Fixture-only peer S0/S1 is
not a realtime consumer qualification. [Pinned review](../ELP2-10/claude-review-intake-2026-10-18.md).


Producer: commit containing this packet, parent
`daf434875e28aa131105d7f27d910b2f0ca05792` on `docs/research-loop-plan`.
Contract delivery is not runtime/consumer acceptance. Read [phase receipt](README.md),
[exact source pins](source-alignment.md) and [runbook](replay-runbook.md).

## Contract and readiness

`packages/contracts/generated/execution-scoped-realtime.d.ts` publishes
`components["schemas"]["ScopedRealtimeFrame"]` and canonical `Quality`.
Source-private `EdgeScopedNotice`/`EdgeScopedNoticeBatch` are transport parser
definitions, **never a browser operation or public proxy**. Scope binding,
source cursor, signing keys, current-grant inputs and baseline barrier are
server-only. OpenAPI `paths={}` deliberately commissions no listener/API.

Generate with `npm run generate:execution-scoped-realtime` in
`packages/contracts`; aggregate generation/drift/snapshot gate includes it.
Fixtures at `fixtures/execution-scoped-realtime.synthetic.valid.json` are
TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT, production_config=false. They carry
no valid credentials, grants or deployed source authority. They are contract
examples, not actual connection or financial coverage receipts.

Compatibility: additive schema-only v1; no existing stream DTO or operation
changed. The candidate is one named `alpha_fleet_overview` subscription, not
an arbitrary relation feed or blanket activation of all360 screens. Future
named datasets require exact source/query/model qualification. No migration.

| Readiness axis | Current state |
| --- | --- |
| Design/contract | Published parser/schema/generated client and finite states |
| Fixture/component | Dedicated pure and strict-contract tests PASS; isolated app-policy/PG fences |
| Real source read/transport | NOT_QUALIFIED; source publication/coverage/fence + current trust/TLS missing |
| Command | No new command or replay side effect;07 reauthorization/recovery unchanged |
| Runtime/browser | NOT_STARTED; retained review still no stream/no poll |
| Consumer | NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW |

## Field → interaction map (layout remains Claude's)

All frames have `schema_version=portal.execution.scoped-realtime.v1` and
`semantics=NOTIFICATION_ONLY`. A notice is **not** financial/order lifecycle
data, a complete history proof or permission to apply arithmetic deltas.

| Event / fields | Consumer behavior / security |
| --- | --- |
| `revalidate`, terminal=false, non-null cursor/generation/Quality, `READ_NAMED_SNAPSHOT` | Keep opaque cursor only for this exact authorized context; invalidate/read the named same-origin BFF after its current authorization, coalescing refreshes. Do not call Edge or mutate financial values from the notice |
| `heartbeat`, terminal=false, null Quality, `RESUME_PORTAL_CURSOR` | Transport liveness only; retain resume token. Do not change economic freshness/completeness or flash empty/full data |
| `resync_required`, terminal=true/reconnect_required=true, cursor/generation/Quality null, `READ_NAMED_SNAPSHOT` | Stop old stream, discard its queue/cursor, obtain current authorized snapshot/barrier before a new bounded reconnect. Expiry/generation/model/coverage mismatch never blindly retries the old cursor |
| `access_revoked`, terminal=true, protected fields null, `SIGN_IN_OR_REQUEST_ACCESS` | Stop/purge stream and protected cached/view data; no automatic legacy fallback. Other independently authorized screens/Research polling need not stop |
| `unavailable`, terminal=true, protected fields null, `WAIT` | Stop sends, show bounded retry/source unavailable. Only independently authorized snapshots may remain under explicit freshness policy. No claim that missing source data is zero or an empty history |

`reason_code` is finite typed control information, not raw server/source error
copy. Use concise English copy under current UX design; no internal SQL,
credential, resource enumeration or peer-count disclosure. Terminal metadata
contains no former-scope IDs or economic payload. Revalidate Quality uses
canonical completeness/freshness/coverage/confidence/reasons; source_as_of_ms
is nullable, portal_observed_at_ms UTC safe integer. Observation is not source
time; heartbeat carries neither source quality nor a synthetic current clock.
Exact decimal financial data remain in the named BFF, not in these notices.

Resume tokens are encrypted/authenticated and fixed-length randomized, not
parseable JSON. Never reconstruct scope or compare token values/length for
hidden activity. All context axes are server-bound; changing workspace,
environment/profile, user/session, query/filter/window, policy/field/model/
schema, source-set/epoch/generation or baseline requires the corresponding
fresh current authorization. Token possession does not grant access.

Candidate private token limit is2048bytes / public4096characters; pinned Edge
scoped `kc1` uses fixed hash claims + UUID private reference and fits this
constructor. **Generic4096-byte source token support is not claimed.** Before
commissioning, adapter tests must assert exact source-format/max token size;
a format revision or larger source token needs reviewed compatibility/storage
or public budget change, never truncation. Keys/TTL are not production defaults.

## Backend integration boundary / source owner requests

1. A named server reader must obtain a genuine snapshot barrier and qualified
   current source/model/field binding. `notices(None)` is start-at-head, not a
   safe initial snapshot. Do not accept caller baseline/scope inputs over HTTP.
2. A commissioned `ScopedNoticeSource` must verify dense local receipt
   membership/digests, source continuity/current policy/retention BEFORE returning
   batches; `caught_up=true` is not that proof. Edge concrete coalesced notice
   cursor equals scan-end, including hidden trailing groups. Preserve exact
   source contract, do not compare sparse visible ordinals.
3. A server coordinator owns finite cadence, clients/cohorts, pending auth,
   source deadlines/slots, bytes and per-client output. No timer/listener is
   installed by this component. Test the actual adapter's response/input bytes
   and snapshot-to-tail races before mounting it. ELP2-10 measures workload;
   this constructor's finite ceilings are not production configuration.
4. `scopedNoticeGuard` must resolve a fresh minted business scope from the
   named current dataset for each delivery. The DB write boundary additionally
   requires exact `stream.subscribe`, current session/policy/expiry and serializes
   against app revocation. Sender callback must synchronously enqueue bytes,
   never await a socket/source or return an asynchronous promise.
5. Local projection commit wrapper ACKs only after durable transaction and
   releases pool connection first. Duplicate-current retry is safe; stale
   history replay is not. It does not create TS event coverage/ACK or replica
   fencing. Existing07 source receipt lookup continues after a human revoke
   under service authority, without a new send/key or public disclosure.

## Canonical request / debt ledger

| ID / direction / owner | Observed vs expected / impact | Done-when / status / delivered contract |
| --- | --- | --- |
| **ELP2-REQ-09-001**, Codex → Claude, UXM-08/09/10 | Backend finite states/fixtures published, no accepted visual or real source; consumer must not turn notification-only into financial event replay, infer quality from heartbeat or re-enable retained polling | AWAITING_CONSUMER_REVIEW. Bobby assigns UX scope; Claude maps generated ScopedRealtimeFrame→approved components/states, tests wrong-context/revoke/resync/retained/backpressure, browser receipt with exact bundle/API/source and reverse request for missing fields. Delivered at packet commit; example N09-REVALIDATE and four sibling states; no consumer ACK received |
| Existing [ELP2-REQ-05-001](../ELP2-05/README.md) / source capture owner | Stale publisher/fence and selected authenticated source coverage remain absent; malformed batch handling does not supply those facts | OPEN_SOURCE_CONTRACT at canonical05. Re-evaluate dependent09 source-loss/snapshot-tail gates only with actual source receipt |
| Existing [ELP2-REQ-06-002](../ELP2-06/README.md) / backend/publication/config owners | Actual named projection materialization/current source/model binding and selected cross-profile tie-out not commissioned | OPEN_DEPENDENT_IMPLEMENTATION at canonical06. Actual source→atomic revision→named BFF→consumer receipt before positive runtime09 |
| Existing07-001 / source transport/trust owner ([07 ledger](../ELP2-07/coverage-and-handoff.md)) | EPG10-08 current-policy/mTLS/JWT/runtime adapter not qualified; Portal DB locks are not a distributed TS revocation transaction | Inherit original07 debt, not duplicate. Need exact source/profile/time/source-loss/retention and measured cross-host propagation proof; no activation from fixture success |

No new formula, calibration or privilege choice requested. Export positive
lane is NOT_APPLICABLE because no Execution export/download route is mounted,
not because report/export authorization is optional. New source/model adapter,
operational cadence/performance and positive browser lane are not silently
declared deferred/accepted.

## Prompt for Claude when Bobby assigns frontend

> Read Unified§14 ELP2-09, this handoff,09 README/source-alignment and ELP2-08
> workflow states. Use generated ScopedRealtimeFrame and shared synthetic
> fixtures; do not copy types or render raw source reason strings. Design the
> revalidate/heartbeat/resync/revoked/unavailable states within the approved
> Execution hierarchy/components, preserving Research and retained no-stream.
> No public SSE operation is mounted yet: implement fixture/state consumption
> only, do not fabricate an endpoint or source-connected browser receipt. Each
> current-context change resets its continuation; revoked data never survives
> via cache/reconnect/legacy fallback. Record component/contract/browser mapping,
> exact bundle/lane, reverse backend request and ACK09-001. Do not enable flags,
> source TLS, pollers, commands, dev/main or deploy from this handoff.

### 2026-10-17 private coordinator follow-through

Backend now supplies an optional owned-Hub lifecycle in the existing serial
Manager tick, including IDLE financial input, and abort-safe stop accounting.
See [implementation/gate boundary](README.md#approved-backend-follow-through--2026-10-17).
Public contract, fixtures and this consumer prompt are unchanged. No route,
source factory or STREAM grant was commissioned; browser remains NOT_RUN and
Claude NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW. Do not create
a frontend endpoint or enable a stream merely because the coordinator exists.

### C7 source-only composition —2026-10-18

Dependency-closed native Manager preparation, separate READ/STREAM current
domain facts and authenticated observation resume coordinates are integrated
WIP. [Exact boundary and source checkpoint](../ELP2-10/manager-intake-2026-10-18.md).
No transport/listener/provider, grant, installer or stream was activated;
connected two-human/current-COMMIT/continuity proof remains separate and open.
