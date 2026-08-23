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
| A-7 BR-EX-24–27 follow-up | owners below | four independent contract/owner decisions | `OWNER_DECISION_PENDING` |

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
| BR-EX-24 scope-bound order list | Trading System source owner + Bobby scope; Codex adapter after publication | no list capability exists; Full Blotter stays fixture and browser never fabricates totals | `OWNER_DECISION_PENDING` |
| BR-EX-25 five-hop vs four-stage funnel | Bobby product/source owner | published contract has four stages; UI labels the limitation and does not invent a fifth hop | `OWNER_DECISION_PENDING` |
| BR-EX-26 aggregate exposure verdict | Trading System source owner; Codex adapter after publication | no authoritative full-population verdict; UI is `unavailable`, never sums visible rows | `EXTERNAL_CONTRACT_PENDING` |
| BR-EX-27 packed correlation `sample_counts` | Trading System source owner; Codex adapter after publication | per-cell sample floor unavailable; UI does not infer insufficient data | `EXTERNAL_CONTRACT_PENDING` |
| BR-EX-28 canonical command catalogue | Codex EX-BE-05b/F0; Claude consumer | revision-2 64-action catalogue is ADMIN/workspace/actor/environment/entity/risk scoped; non-GET owner review and R1–R4 plan/apply are enforced; all entries remain unreachable and all runtime command flags remain false | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` |
| BR-EX-28 allocation classification | Bobby/Trading System command owner; Codex enforces conservative floor | remains at least R1, owner-reviewed and plan/apply-gated; it can never fall to R0 without a published ruling | `OWNER_DECISION_PENDING` |
| BR-EX-29 typed `conditions[]` | Codex EX-BE-05b/F0; Claude consumer | backend/schema/PostgreSQL canonical array delivered; legacy singular value remains only at explicit compatibility boundary | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` |

### 4.3 BR-EX-28 reachability stop gate

The following eight actions have no purpose-built Trading System HTTP route.
Their canonical catalogue entries must keep `portal_reachable=false`. Ownership
is the Trading System contract owner; Codex may add a Portal compatibility
adapter only after that owner publishes an authenticated, typed route.

| Action | Needed by | Status | Prohibited substitute |
|---|---|---|---|
| `ops/command-journal` | Operations Queue | `EXTERNAL_CONTRACT_PENDING` | direct PostgreSQL/CLI |
| `ops/findings` | Operations Queue | `EXTERNAL_CONTRACT_PENDING` | direct PostgreSQL/CLI |
| `ops/alerts` | Incident Detail | `EXTERNAL_CONTRACT_PENDING` | direct Redis/CLI |
| `ops/dead-letters` | Incident Detail | `EXTERNAL_CONTRACT_PENDING` | direct Redis/CLI |
| `ops/trace-order` | Incident Detail | `EXTERNAL_CONTRACT_PENDING` | direct PostgreSQL/Redis/CLI |
| `ops/streams` | Command Center | `EXTERNAL_CONTRACT_PENDING` | direct Redis stream access |
| `ops/alpha-activity` | Command Center | `EXTERNAL_CONTRACT_PENDING` | direct Redis/CLI |
| `ops/redis-retention` | Operations/diagnostics | `EXTERNAL_CONTRACT_PENDING` | generic Redis keyspace access |

Generic `redis/get` and `redis/scan` are explicitly **REJECTED as Portal
capabilities**. If a screen needs data currently discovered through either CLI
command, the Trading System owner must publish a bounded typed endpoint for
that use case. Portal never receives a generic DB, Redis or CLI escape hatch.

## 5. Deployment and source gates

| Gate | Owner | Blocker | Status |
|---|---|---|---|
| D1 private network | Bobby/AWS owner | exact Security Group rule identity, change window and live evidence | `D1_HOSTS_STAGED / AWS_OWNER_SG_RULE_PENDING` |
| D2 dark services | Bobby authorizes; Codex executes runbook | D1 evidence, resource admission, signed image digests, real identities, private PG decision | `D2_PREPARED / NOT_AUTHORIZED` |
| D3 public/auth transport | Bobby + Codex | accepted D2 plus explicit window | `PLANNED / PREDECESSOR_BLOCKED` |
| D4 Paper source shadow | Trading System source owner + Bobby + Codex | typed source capability, dedicated read identity and D3 evidence | `PLANNED / PREDECESSOR_BLOCKED` |
| EX-BE-05b live relay | Trading System command owner + Bobby + Codex | published command capability, mTLS/delegated auth and activation decision | `PRODUCTION_INACTIVE` |

## 6. Exact next sequence

1. `EX-BE-05b/F0` is complete at `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`:
   scoped catalogue revision 2, typed conditions, `HASH_ONLY_NO_RAW` plans,
   bounded concurrent retry and deny-by-default plan/apply/verify/Rust relay
   contract foundation are delivered.
2. Claude consumes the catalogue and typed conditions on Lane A; it keeps the
   eight actions visibly unavailable and does not enable a product route.
3. Bobby/Trading System owners resolve BR-EX-24–28 source semantics and publish
   purpose-built contracts. Portal work then creates compatibility adapters,
   never Trading System implementations.
4. D1–D4 remain owner/change-window gated and are not implied by F0.
