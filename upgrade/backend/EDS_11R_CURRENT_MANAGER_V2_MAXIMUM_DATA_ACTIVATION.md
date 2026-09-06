# EDS-11R — Current Manager-v2 maximum-data activation

**Status:** `R1_TO_R3_PORTAL_READY / R4_PORTAL_CONSUMER_AND_CONTRACT_SOURCE_DARK_READY / RUNTIME_NOT_ACTIVATED`  
**Date:** 2026-09-06  
**Scope:** Portal Execution Edge, Control API and same-origin Portal BFF only.  
**Does not authorize:** direct Trading System DB/Redis/broker/CLI access from
Portal, browser access to Edge, command activation, or a Trading System schema
rewrite.

**Canonical phase plan:** the complete closeable `EDS-11R1` through
`EDS-11R5` specification now lives in
[`EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`](../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md)
immediately before EDS-12.  This document preserves the technical runtime
inventory and detailed supporting rationale; the unified plan is the source of
execution order, ownership and phase exit gates.

## 1. Corrected decision

The earlier `SOURCE_GAP_CONFIRMED` wording correctly described **missing
authoritative semantics** such as replay continuity and candles.  It must not
be interpreted as “the current source has no usable data.”  A read-only AWS-HK
runtime inventory on 2026-09-06 establishes the opposite:

| Finding | Evidence / implication |
| --- | --- |
| Manager-v2 is current-source active for Paper, Sandbox and Live | Immutable runtime contract declares `PAPER_SANDBOX_LIVE_CURRENT_SOURCE_READ_ACTIVE`; each profile requires TLS 1.3 mTLS plus `execution:manager-v2:read`. |
| All three Manager instances carry the same 96-relation catalogue | Paper, Sandbox and Live each expose 96 relations with catalogue digest `9040f0897d8f452a486e51ce35abb7f3165b2238d07221b6b0e684d9829b012e`. |
| The deployed Source Proxy already forwards Manager-v2 | `/portal/execution/v2/manager/catalog`, `/capabilities`, `/projections/*` and bounded `/records/{schema}/{relation}` routes are present.  The legacy `/v1/*` routes returning `503` are not the Manager-v2 read plane. |
| All three Rust Edge profile containers are healthy | Paper, Sandbox and Live bind private WireGuard endpoints and have separate source proxies plus projection PostgreSQL. |
| Market data already exists behind AWS-HK services | Data Layer OpenAPI publishes bounded last-price, OHLCV/klines, session-calendar, universe and provider-health reads. |

Therefore **EDS-11R comes before EDS-12**.  It consumes the existing
Manager-v2 current-page plane to its maximum truthful extent.  EDS-12 remains
failure/DR/performance/product-release work; it must not be used as a place to
hide unfinished current-data integration.

## 2. Authority and truth model

1. The browser calls only named same-origin Portal BFF operations.
2. Control API calls the existing Edge private `/internal/v2/manager/...`
   bridge.  Edge remains the only caller of the AWS-HK Source Proxy.
3. Edge calls Manager-v2 with deployment-bound mTLS and a short-lived
   delegated JWT.  The browser never receives relation names, source cursors,
   mTLS material, upstream URLs or delegated JWTs.
4. Every browser DTO keeps `availability`, `freshness`, `completeness`,
   `as_of_ms`, profile, contract/catalogue revision, exact decimal strings and
   typed source failure.  A stage with no rows returns an authoritative empty
   panel, not a generic unavailable screen.
5. A named BFF selects a safe DTO subset.  It must not relay generic `raw`,
   `payload`, command payload, credential or opaque source fields simply
   because a relation is catalogued.
6. Profile isolation is mandatory: Paper, Sandbox and Live are separately
   authorized and persisted.  “Use all data” means use all authorized
   profile-scoped facts, never mix profiles or bypass the private boundary.

## 3. What can be used now

The existing 96-relation catalogue already includes current, bounded source
facts for the following product families:

| Product family | Current relations to consume through named BFFs | Honest UI state now |
| --- | --- | --- |
| Alpha / deployment | `strategies`, `strategy_deployments`, `alphas`, `alpha_positions`, `alpha_ledger`, `performance_snapshots` | Source-backed list/detail/current performance panels |
| Portfolio / account / binding | `portfolios`, `portfolio_allocations`, `portfolio_equity_snapshots`, `accounts`, `account_balances`, `margin_balances`, `account_sync_effective`, `broker_account_sync_effective`, `venue_accounts` | Source-backed current rows and explicitly Portal-derived cross-profile aggregates |
| Orders / fills / positions | `orders`, `fills`, `binance_fills`, `positions_v2`, conditional/bracket groups, `paper_open_orders`, `order_pending_exposure` | Current bounded lists and detail panels, with exact source empty/partial semantics |
| Risk / performance / reconciliation | `risk_grants`, `risk_profiles`, `sizing_decisions`, `performance_snapshots`, `reconciliation_findings`, `broker_sync_*` | Current risk, mark, equity and reconciliation panels |
| Operations / governance evidence | `execution_sessions`, `command_journal`, `command_ack_evidence`, `command_*`, `dead_letters`, `copy_event_*`, `service_heartbeats`, `redis_transport_epochs`, `audit_log` | Read-only, redacted operational and command-evidence panels |
| Current lifecycle observation | `domain_events`, `fills`, `positions_v2`, `command_ack_evidence`, `command_journal` | Bounded `CURRENT_SOURCE` / `PORTAL_OBSERVATION` timeline, never labelled authoritative replay |

The existing Manager-v2 contract is already bounded at the source.  Portal
continues to impose the smaller product limit of 200 rows / 1 MiB and retains
only a Portal-signed continuation for browser pagination.

## 4. What is genuinely a source-adapter task, not a data-collection task

The following facts are not in the Manager-v2 96-relation catalogue today,
although their upstream data services are running:

| Need | Existing AWS-HK source | Minimal owner work | Portal behaviour until published |
| --- | --- | --- | --- |
| latest tick / mark / index / last | Data Layer price and quote endpoints | Add a versioned, bounded Manager/Edge market read adapter | show existing mark context only when present; do not invent a tick |
| OHLCV / candles | Data Layer kline/OHLCV endpoints | Add a bounded candle adapter with venue/instrument/interval/range schema | retain financial series; candle panel stays typed `SOURCE_GAP_CONFIRMED` |
| benchmark / calendar / VNM constraints | Data Layer universe/session-calendar plus venue configuration | Add named derived benchmark and effective-dated metadata adapters | retain neutral typed panel state, never synthetic metadata |
| authoritative replay/corrections/ACK | `domain_events`, command and evidence tables contain current facts | Add a per-stream immutable envelope/sequence/epoch/retention adapter; it may read existing tables/outbox | render current observation history and evidence now, never claim global replay |

This is not a request for a new database or a second market store.  It is a
small, versioned source-facing adapter at the Trading System boundary.  Portal
must not call Data Layer directly because it would bypass the existing
profile/audience/mTLS authority chain.

## 5. EDS-11R delivery phases

### EDS-11R1 — Runtime authority and complete 96-relation intake

**Goal:** replace the old narrow, static relation selection with a
digest-pinned, server-owned named-operation registry covering every
screen-bound relation in the 96 catalogue.

**Implementation:**

- ingest and validate the Manager catalogue through the existing private
  capability route; pin its revision/digest per profile;
- declare one named Portal operation per screen/panel need, mapped to one or
  more exact source relations; no client-selected relation path;
- generate safe field selectors and deny source-sensitive fields at the
  Control API boundary; and
- add contract tests covering all screen-bound relations, unknown relation,
  cross-profile, cursor, page-size and source-drift rejection.

**Exit:** every currently usable relation is reachable by a named BFF or is
explicitly classified `audit-only`/`internal-only`, with no generic route
exposed to the browser.

### EDS-11R2 — Rich-screen current-data hydration

**Goal:** replace screen-level `Unavailable` states with panel-level current
truth for Alpha 360, Portfolio 360, Account/Broker 360, Paper, Sandbox, Live,
Blotter, Operations and governance screens.

**Implementation:**

- hydrate each rich frontend panel from its corresponding EDS-11R1 BFF;
- build source-backed detail/list joins only from documented identity keys;
- make absent rows `AUTHORITATIVE_EMPTY`, retained pagination `PARTIAL`, and
  source failure typed/stale without erasing the rich layout; and
- keep cross-profile portfolio calculations explicitly labelled
  `DERIVED_AT_PORTAL` with exact-decimal inputs and formula revision.

**Exit:** authenticated browser journeys prove every approved rich screen
keeps its composition under available, empty, partial, stale and denied
states.  No fixture-only product path remains.

### EDS-11R3 — Current projection, financial range and observation lane

**Goal:** activate the existing Portal durable projection/current revalidation
path for all admitted profiles and use it for efficient UI refresh.

**Implementation:**

- extend the source admission/coalescer and durable projection only for the
  named EDS-11R operations;
- serve retained equity/performance/risk windows from Portal storage, with
  source `as_of`/coverage/freshness preserved;
- publish current `domain_events`, fills, position and command evidence as
  bounded `CURRENT_SOURCE` / `PORTAL_OBSERVATION` rows; and
- fan out only committed local revision ticks via SSE, so tab refreshes never
  multiply AWS-HK reads.

**Exit:** load, reconnect, profile switch, stale-source, empty and 100-client
fan-out tests pass without any authoritative event/replay claim.

### EDS-11R4 — Market-context adapter acceptance

**Goal:** consume the existing AWS-HK Data Layer through a single TS-owned
private adapter, then expose chart-ready, bounded Portal BFFs.

**Owner deliverable:** one additive Market Context v1 contract for latest
observation, candles, benchmark, calendar and VNM constraints; no direct
browser or Portal-to-Data-Layer connection.

**Portal deliverable:** schema decoder, source profile binding, durable window
projection/cache, UTC/exact-decimal chart DTO and SSE invalidation.

**Portal contract record (2026-09-06):** both exact same-origin routes now
have canonical Schema/OpenAPI/generated TypeScript contracts and fixture
coverage in `packages/contracts/`. They are `GET` only, preserve exact decimal
and UTC-ms values, bind environment to a single profile, cap current/latest at
200 rows and candles at 2,000 rows / 8 MiB, and are still source-dark until the
owner return is verified. This contract does not add a direct Data Layer route,
runtime listener or source activation.

**Exit:** Paper/Sandbox/Live market panels receive source-backed or typed
empty/unsupported facts; chart data remains bounded and provenance-labelled.

### EDS-11R5 — Exact lifecycle continuity upgrade (optional product quality)

**Goal:** upgrade observed history into authoritative replay only when the TS
owner publishes per-stream sequence/epoch/correction/tombstone/retention
semantics over existing event/evidence sources.

**Exit:** snapshot-plus-tail, duplicate/gap/correction/retention/resnapshot
and cross-profile negative tests pass.  This phase is not a prerequisite for
EDS-11R1 through EDS-11R4 or for usable current data.

## 6. Next action before EDS-12

**EDS-11R1 is complete at the Portal contract gate.** It required no Trading
System code, AWS change window or new secret. The campaign branch now carries
a deterministic 96-relation manifest: all 54 `SCREEN_BOUND` rows map to named
same-origin operations, while 16 projection inputs, 13 audit-only rows and 13
internal-only rows have explicit non-browser dispositions. Only scalar,
non-sensitive fields compile into DTO selectors; raw record keys, JSON/array
values, sensitive structured columns, source cursors and transport material do
not cross the browser boundary. The public BFF aliases are fixed by the
compiled registry and preserve the 200-row/1-MiB source ceiling.

**Next:** start **EDS-11R2** on the same campaign branch. It consumes this
named operation manifest to hydrate each approved rich panel without replacing
screen composition, then records panel-local authoritative-empty/partial/
stale/denied states. EDS-11R3 may prepare only after R2 has fixed the exact
screen-to-operation consumers.

In parallel, send the owner only the EDS-11R4 market-context adapter request.
The wider source-completeness campaign remains a future quality upgrade, not a
blocker for current-data integration.

## 7. Verification record for this decision

This plan was derived from read-only AWS-HK inspection only:

- Manager Paper/Sandbox/Live containers: healthy/running, same 96-relation
  catalogue digest;
- Manager runtime activation contract: all three profiles
  `transport_qualified=true` and `current_source_read_enabled=true`;
- Manager qualification evidence: Paper and Sandbox source-backed row probes
  passed; Live's sampled deployment relation returned an authoritative empty
  rather than an unavailable transport;
- deployed Source Proxy: Manager-v2 internal routes forward to the owner
  facade; legacy `/v1` routes are intentionally fail-closed; and
- Data Layer OpenAPI: last-price, OHLCV/klines and session/universe endpoints
  are present on the private host.

No source data, secret, runtime config, network policy, container or command
state was changed during this inspection.
