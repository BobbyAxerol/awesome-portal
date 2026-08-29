# Execution Loop request ledger

**Reconciled:** 2026-08-22  
**Backend owner:** Codex  
**Frontend owner:** Claude  
**Authority order:** published source/contracts → Master Plan → this ledger →
shared tracker/roadmap

This is the canonical cross-team request ledger. It records delivery without
claiming production activation. `*_COMPLETE` is always qualified by scope;
none of the rows below authorizes AWS/network/source/realtime/command changes.

## 1. Status vocabulary

| Status | Meaning |
|---|---|
| `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | Contract and fixtures are validated; runtime authority remains dark. |
| `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Portal repository/API path exists; real source or production activation remains gated. |
| `DECISION_COMPLETE / IMPLEMENTATION_TRACKED` | Product/architecture ruling is recorded and its implementation has a named phase. |
| `EXTERNAL_CONTRACT_PENDING` | Trading System owner must publish a purpose-built authenticated contract; Portal must not invent one. |
| `OWNER_DECISION_PENDING` | Bobby or named source owner must decide semantics/scope before implementation. |
| `FRONTEND_INTEGRATION_PENDING` | Backend contract exists; Claude owns the remaining Lane A/Lane B mapping. |

## 2. PRE-IAM request closure: H-1 through H-12

All H-series items are backend-owned and were accepted by PRE-IAM-04. Evidence
is in [`PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md`](../../backend/PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md).

| Request | Owner | Blocker / residual dependency | Status |
|---|---|---|---|
| H-1 exact decimal parsing | Codex | production source activation only | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| H-2 canonical Inbox `view` | Codex contract; Claude consumer | B7 registry/consumer review | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| H-3 epoch recovery deadline | Codex | real SSE parity/activation | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| H-4 sequence-gap reason | Codex | real source gap corpus | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| H-5 cursor-ahead reason | Codex | real replay/retention evidence | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| H-6 typed analytics errors | Codex; Claude consumer | Claude typed-error mapping | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| H-7 bounded ledger/funnel | Codex; Claude consumer | Claude bounded-window labels; source parity | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| H-8 distinct cursor failures | Codex; Claude consumer | Claude recovery mapping | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| H-9 workflow/verification split | Codex; Claude consumer | Claude operation-state mapping | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| H-10 analytics schema gate | Codex | none inside offline scope | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| H-11 Rust/OpenAPI parity | Codex | real source parity remains EX-BE-08 | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| H-12 six-fixture coverage | Codex; Claude consumer | Claude consumes five added fixtures | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |

## 3. FE/BE audit requests A-1 through A-7

| Request | Owner | Blocker / residual dependency | Status |
|---|---|---|---|
| A-1 native EventSource resume precedence | Codex | real snapshot/SSE parity before activation | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| A-2 canonical keyset field names | Codex | source-backed route activation | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` |
| A-3 exact aggregates by currency | Codex contract; Claude consumer | no generic order-list route until BR-EX-24 | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| A-4 typed page retention | Codex contract; source owner | real retention policy/time range | `CONTRACT_COMPLETE / OWNER_DECISION_PENDING` |
| A-5 nullable projection-gap facts | Claude consumer | null means absent fact, never zero | `DECISION_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| A-6 delegated assertion expiry | Codex contract; Claude consumer | do not present as Portal-session expiry | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` |
| A-7 BR-EX-24–27 follow-up | owners below | one consolidated machine-readable owner publication still required | `PORTAL_REQUEST_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` |

## 4. BR-EX request ledger

### 4.1 BR-EX-01 through BR-EX-22

All twenty-two requests have a recorded `ACCEPT` or `MODIFY` ruling in
[Master Plan §15.1](../../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md#151-decisions-on-all-twenty-two-frontend-requests).
Codex owns backend realization by the phase named there; Claude owns the
consumer. Their status is `DECISION_COMPLETE / IMPLEMENTATION_TRACKED`; source
activation remains independently gated by the per-phase table in §12.2.

### 4.2 BR-EX-23 through BR-EX-29

| Request | Owner | Exact blocker / safe current behavior | Status |
|---|---|---|---|
| BR-EX-23 R2 `portfolio_id` + `currency` | Codex contract; Claude consumer | none in contract; Claude removed fixture defaults | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` |
| BR-EX-24 scope-bound order list | Trading System source owner + Bobby scope; Codex adapter gate complete | `orders.list` exact GET requested; Full Blotter stays fixture until accepted publication | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` |
| BR-EX-25 five-hop vs four-stage funnel | Bobby product/source owner | semantic-ruling artifact requires owner choice; UI does not invent signal/intent facts | `PORTAL_REQUEST_COMPLETE / OWNER_RULING_PENDING` |
| BR-EX-26 aggregate exposure verdict | Trading System source owner; Codex adapter gate complete | `bindings.exposure-verdict` requests full-population per-currency verdict; UI stays unavailable | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` |
| BR-EX-27 packed correlation `sample_counts` | Trading System source owner; Codex adapter gate complete | `portfolios.correlation-samples` requests per-cell counts and explicit diagonal semantics | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` |
| BR-EX-28 canonical command catalogue | Codex N12; Claude consumer; Trading System publication owner | revision-2 64-action inventory stays unreachable; the master campaign's N12 annex requests nine exact R1–R4 capabilities, validates a dedicated command identity and owner artifact bytes, and keeps all runtime command flags false | `PORTAL_COMMAND_GATE_COMPLETE / MASTER_OWNER_REQUEST_READY / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE` |
| BR-EX-28 allocation classification | Bobby/Trading System command owner; Codex enforces conservative floor | remains at least R1, owner-reviewed and plan/apply-gated; it can never fall to R0 without a published ruling | `OWNER_DECISION_PENDING` |
| BR-EX-29 typed `conditions[]` | Codex EX-BE-05b/F0; Claude consumer | backend/schema/PostgreSQL canonical array delivered; legacy singular value remains only at explicit compatibility boundary | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` |

### 4.3 BR-EX-28 reachability stop gate

The following eight actions have no purpose-built Trading System HTTP route.
Their canonical catalogue entries must keep `portal_reachable=false`. Ownership
is the Trading System contract owner; Codex may add a Portal compatibility
adapter only after that owner publishes an authenticated, typed route.

| Action | Needed by | Status | Prohibited substitute |
|---|---|---|---|
| `ops/command-journal` | Operations Queue | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct PostgreSQL/CLI |
| `ops/findings` | Operations Queue | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct PostgreSQL/CLI |
| `ops/alerts` | Incident Detail | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct Redis/CLI |
| `ops/dead-letters` | Incident Detail | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct Redis/CLI |
| `ops/trace-order` | Incident Detail | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct PostgreSQL/Redis/CLI |
| `ops/streams` | Command Center | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct Redis stream access |
| `ops/alpha-activity` | Command Center | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | direct Redis/CLI |
| `ops/redis-retention` | Operations/diagnostics | `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING` | generic Redis keyspace access |

Generic `redis/get` and `redis/scan` are explicitly **REJECTED as Portal
capabilities**. If a screen needs data currently discovered through either CLI
command, the Trading System owner must publish a bounded typed endpoint for
that use case. Portal never receives a generic DB, Redis or CLI escape hatch.

### 4.4 N12 command publication stop gate

N12 contributes one nine-capability machine annex to the official master owner
campaign, plus a byte-bound verifier and restart-safe Rust
authorization/journal gate. It does not publish or activate a route. Dedicated
command identity, exact schemas/fixtures, terminal corpus and owner evidence
remain external. HTTP 202 stays non-terminal;
`UNCERTAIN` disables blind retry and blocks same-target R4. Command kill switch
and Paper/Sandbox/R3/R4 flags are independent of every read/query/SSE flag.

### 4.5 Official owner-request entrypoint

The only active Trading System request is
`upgrade/backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md`.
It includes the N02/N03 incremental source, N06 evidence, N11 external reads,
N12 commands, N15 Event/Artifact rulings and N13–N17 operational evidence.
No component pack is sent independently. A future external capability amends
the master revision; it does not create another free-standing request file.

### 4.6 D4 source-identity/cursor ruling

Status: `D4_OFFLINE_AUTHORIZATION_PREPARED /
LIVE_D4_PREDECESSOR_BLOCKED`.

The discovered optional `X-API-Key` behavior is not accepted as a dedicated
Paper read identity. Orders/fills/positions limit-only reads and the currently
sparse event feed do not yet prove a complete cursor/resync source. These are
Trading System owner contract requests, not permission for Portal to use DB,
Redis, CLI or broker access. Until published and proven, related source work is
`EXTERNAL_CONTRACT_PENDING`, the D4 epoch cannot leave `BUILDING`, and all
delivery profiles remain `fixture`.

## 5. Deployment and source gates

| Gate | Owner | Blocker | Status |
|---|---|---|---|
| D1 private network | Bobby/AWS owner | accepted 2026-08-23: exact privately recorded SG rule, two-cell preflight, handshake, public denial and link-loss evidence | `D1_NETWORK_ACCEPTED / APPLICATION_DARK` |
| D2 dark services | Bobby authorizes; Codex executes runbook | owner-approved existing AWS-HK host only; full Portal stays on SGP; hard ceilings are 5.00 vCPU / 5,632 MiB peak and 4.00 vCPU / 4,608 MiB long-running, not reservations; baseline/delta admission remains authoritative; keep the existing D1 IAM role but detach/isolate its instance profile while workloads run; publish signed Edge/Proxy digests; stage real workload PKI/JWKS and open D2 window; private TLS/SCRAM PG boundary is integration-proven; no new EC2/EIP/D1B | `D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED` |
| D3 public/auth transport | Bobby + Codex | accepted D2 plus explicit window | `PLANNED / PREDECESSOR_BLOCKED` |
| D4 Paper source shadow | Trading System source owner + Bobby + Codex | typed source capability, dedicated read identity and D3 evidence | `PLANNED / PREDECESSOR_BLOCKED` |
| EX-BE-05b live relay | Trading System command owner + Bobby + Codex | published command capability, mTLS/delegated auth and activation decision | `PRODUCTION_INACTIVE` |

## 6. Exact next sequence

1. `EX-BE-05b/F0` is complete at `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`:
   scoped catalogue revision 2, typed conditions, `HASH_ONLY_NO_RAW` plans,
   bounded concurrent retry and deny-by-default plan/apply/verify/Rust relay
   contract foundation are delivered.
2. `EX-BE-05b/F1a` Operations Queue is complete at
   `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`: SGP Portal-owned exact-count
   keyset reads and acknowledge→resolve triage are live in contract/API tests,
   while source result fields remain immutable/unavailable and outbox stays
   empty.
3. `EX-BE-05b/F1b` Incident Detail is complete at
   `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`: Portal-owned workflow,
   evidence, annotations and operation correlation are available on SGP; four
   Execution source panels remain typed unavailable and resolve cannot resume.
4. `EX-BE-05b/F2` Sandbox Certification is complete at
   `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`: exactly seven source-dark
   steps, hash-bound evidence, SoD decisions and permanently blocked CANARY
   promotion planning are available on SGP; no outbox or activation exists.
5. Claude consumes F1a Queue, F1b Incident Detail and F2 Sandbox Certification
   on Lane A. It keeps the eight actions, source panels and Sandbox runtime
   visibly unavailable and does not enable a product/source/command route.
6. `EX-BE-05b/F3` Canary Control Room is complete at
   `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`: immutable DRAFT envelope
   revisions and a source-dark read model are available on SGP.
   `BROKER_STALE_BLOCKS_SCALE_ONLY` is typed; both command groups remain
   invisible/disabled. No source ingestion, outbox or activation exists.
7. Claude consumes F3 on Lane A using `execution-canary.d.ts` and the unavailable
   fixture; it must preserve fixture/production-inactive and null-runtime truth.
8. Bobby/Trading System owners resolve BR-EX-24–28 source semantics and publish
   purpose-built contracts. Portal work then creates compatibility adapters,
   never Trading System implementations.
9. D1–D4 remain owner/change-window gated and are not implied by
   F0/F1a/F1b/F2/F3.

## 3. Hi-fi V2 requests — Claude → Codex (2026-08-25)

Intake chính thức: bảng §7.2 của backend plan (`portal-backend-plan/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`) — hàng BR-EX-41…46, `RECEIVED` 2026-08-25. Phụ lục schema: [`BACKEND_REQUEST_HIFI_V2_2026-08-25.md`](BACKEND_REQUEST_HIFI_V2_2026-08-25.md). Mỗi hàng gắn với một file smoke sẽ xoá khi giao.

| Request | Owner | Màn | Smoke xoá khi giao | Status |
|---|---|---|---|---|
| BR-EX-42 pinned stage/status/figure | Codex | Command Center | `commandCenter.smoke.ts` (`CC_PIN_EXTRA`) | `REQUESTED 2026-08-25` |
| BR-EX-45 promotion pipeline | Codex | Command Center | `commandCenter.smoke.ts` (`CC_PIPELINE`) | `REQUESTED 2026-08-25` |
| BR-EX-46 incident v2 (market band, facts, gates) | Codex | Incident Detail | `incident.smoke.ts` | `REQUESTED 2026-08-25` |
| BR-EX-41 stage telemetry ×7 | Codex | Paper/Sandbox/Canary/Live | `stage.smoke.ts` | `REQUESTED 2026-08-25` |
| BR-EX-43 alerts summary + market/alerts SSE | Codex | shell + Incident + CC | `CC_SMOKE_MOTION` | `REQUESTED 2026-08-25` |
| BR-EX-44 fleet cell sub/tone/href | Codex | Command Center | `commandCenter.smoke.ts` (`CC_FLEET_EXTRA`) | `REQUESTED 2026-08-25` |
| BR-EX-34/40 tile series + tile kind | Codex | Alpha 360 | `alpha360.smoke.ts` | `REQUESTED 2026-08-24/25` |

