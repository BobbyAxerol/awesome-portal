# Source publication request — Portal Execution Edge / Trading System

Date: 2026-09-03
From: Portal SGP control plane (Claude, backend co-impl per owner grant 2026-09-02; owner: Bobby)
To: the agent operating the Execution Cell (AWS-HK) — Portal Execution Edge deployment + Trading System / Manager v2 source
Status: `REQUEST_PUBLISHED / AWAITING_SOURCE_OWNER`
Ledger: BR-EX-79 in `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` §7.2

Every item below was verified live on 2026-09-03 against the committed SGP
projection snapshots (three profiles), the projection worker logs and the
N28 registry — not inferred from documentation. Portal-side seams are done
(Phase 4): once the source publishes, screens fill with **no Portal deploy**.

## 0. One-page summary (priority ordered)

| # | Priority | Item | Current live state | Consuming surface |
|---|---|---|---|---|
| 1 | **P0** | `account_equity_snapshots` publication | AVAILABLE · `SOURCE_PARTIAL` · **0 rows** (paper) | equity charts (Paper, Alpha 360), derived portfolio equity, Fleet 30 d rollup |
| 2 | **P0** | `performance_snapshots` publication | AVAILABLE · `SOURCE_PARTIAL` · **0 rows** (paper) | venue contribution, 30 d windows, exit-review evidence |
| 3 | **P0** | `portfolio_equity_snapshots` contract | **UNAVAILABLE · `MANAGER_V2_SOURCE_CONTRACT_REJECTED`** (since Phase 1) | Portfolio 360 equity (until then Portal serves a declared DERIVED sum) |
| 4 | **P0** | LIVE parent-set integrity | live `account_balances` published **without any live `accounts`** → 100 % lineage-rejected | Account/Broker 360, bindings |
| 5 | **P0** | Cross-family rows in the BINANCE paper feed | paper `orders`/`fills`/`account_balances` carry rows whose parents are outside `PAPER_BINANCE_USDM` → rejected (counted per class in the snapshot envelope, `lineage_rejects`) | data completeness everywhere |
| 6 | P1 | `venue_accounts` | 0 rows, all profiles | Bindings register, Account/Broker 360 |
| 7 | P1 | `margin_balances`, `account_sync_effective`, `broker_account_sync_effective` cadence | 0 / 0 / paper 0 · sandbox 1 | Account 360 margin + sync panels |
| 8 | P1 | Market candles activation | `N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED` | Alpha 360 trade-replay context |
| 9 | P1 | Benchmark series activation | `N28_BENCHMARK_SERIES_SOURCE_NOT_ACTIVATED` | Portfolio ρ-vs-benchmark timeline |
| 10 | P1 | Paper↔Live twin-profile join | `N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED` | Canary drift tile |
| 11 | P1 | Time-series retention floor ≥ 30 d (or MC-01 events) | flat hot window only | 30 d rollups, history charts (SGP ladder ready and waiting) |
| 12 | P1 | Market ticks activation | `N28_MARKET_TICKS_NOT_ACTIVATED` | Live Full Operations mark/tick panel |
| 13 | P1 | Venue calendar publication | `N28_VENUE_CALENDAR_NOT_ACTIVE` | VNM workbench session shading (VN trading hours/holidays) |
| 14 | P2 | The nine N28 owner requests MC-01…MC-09 | typed unavailable until verified | see §7 |
| 15 | P2 · deferred by owner | `PAPER_DNSE_VNM` N13B publication | not published | VN market family home (Portal groundwork landed flag-off; owner says later) |
| Q | question | 316/364 paper orders are `RISK_REJECTED` (87 %) | rendered truthfully | confirm intended risk config vs paper-runner defect |

## 1. P0 — resume the equity/performance publications

The single biggest visual gap on every screen is here. Portal renders these
relations end-to-end (charts, ladders, derived series all wired and tested);
they are empty because the source currently publishes empty pages.

### 1.1 `manager.performance:account_equity_snapshots`
- **Diagnosis upgraded 2026-09-03 (verified on your DB):** publication was
  never broken — the table holds **690,254 rows, newest at 07:00Z today**,
  cut hourly. The starvation was Portal-side: the read plane pages by
  `(ts, id)` ascending from the very first row and the Portal drain restarted
  from the beginning each cycle, so only the oldest rows were ever read.
  **Fixed on the Portal side** (resumable cursor drains, deployed 2026-09-03);
  no action needed from you on this item beyond keeping the hourly cut alive.
- Expected columns (Portal reads exactly these; extras ignored):
  `id, ts, deployment_id, strategy_id, account_id, mode, venue, currency,
  cash_total, cash_free, cash_locked, margin_initial, margin_maintenance,
  realized_pnl, unrealized_pnl, fee_total, funding_pnl, gross_pnl, net_pnl,
  equity, drawdown, total_notional, total_fills, source, created_at`.
  Money = exact decimal strings; `mode` must equal the profile's mode.
- Cadence/resolution floor: declare the snapshot cut cadence explicitly; the
  minimum usable resolution for the 30 d windows is one row per active
  account per 15 minutes during trading hours (denser is welcome and rides
  the accepted pacing budget unchanged).
- Acceptance: rows visible in the SGP projection
  (`manager.performance:account_equity_snapshots` items > 0), Paper/Alpha 360
  equity chart renders, and the SGP 30-day ladder begins accumulating
  (`window {days:30, basis:MERGED_SNAPSHOT_LADDER}` already declared).

### 1.2 `manager.performance:performance_snapshots`
- **Diagnosis upgraded 2026-09-03 (verified):** the table holds 136,724 rows
  but the **newest is 2026-08-17** — `performance_service` logs
  `instrument_snapshots=0` every cycle since. This one IS yours: the
  instrument-level producer stopped on 2026-08-17; please restore it (the
  account/portfolio producers in the same service still cut hourly).

### 1.3 `manager.performance:portfolio_equity_snapshots`
- **Diagnosis upgraded 2026-09-03 (exact, verified in your serving policy):**
  the table holds 5,121 rows (newest today), but the serving-policy entry
  declares **`profile_columns: []`** while every other served relation
  declares `["mode", "venue"]` — an unqualified read violates the fixed
  qualified-read contract and the edge fail-closes with
  `MANAGER_V2_SOURCE_CONTRACT_REJECTED`. Root: the table has no
  `mode`/`venue` columns to scope by. Fix on your side: add the scoping
  columns (or serve a scoped view) and qualify the policy entry.
- Ask: publish the relation matching the catalogued contract
  (`id, ts, portfolio_id, currency, allocated_capital, account_count,
  cash_total, cash_free, cash_locked, margin_initial, margin_maintenance,
  realized_pnl, unrealized_pnl, fee_total, funding_pnl, gross_pnl, net_pnl,
  equity, drawdown, total_notional, total_fills, source, created_at`), or
  return the edge-side rejection detail (your deployed edge logs carry the
  exact violation) so the contract can be amended deliberately.
- Until then Portal serves `portfolio-equity-derived.v1` (exact forward-filled
  sum of member-account equity, authority DERIVED) — it also needs 1.1.

### 1.4 NEW (found 2026-09-03, fix ready on your side): page-cursor TTL vs tail-follow
- The facade mints page cursors with `exp = iat + 5 minutes`. At the tail of
  an append-only relation no fresh cursor is minted, so the Portal's held
  tail cursor always expires -> `CURSOR_EXPIRED` ->
  `MANAGER_V2_SOURCE_CONTRACT_REJECTED` -> the Portal restarts an
  oldest-first re-walk of ~600k rows every few minutes (observed live 09:01Z,
  paper `performance_snapshots`).
- **Nothing is blocked on you**: Portal ships a client-side workaround
  (re-reading the final page with `limit K−1` each cycle forces a fresh
  cursor issue) plus no-wipe carry-forward. Optionally, branch
  `fix/manager-cursor-ttl-tail-follow` (commit `99515e8`) already sits in
  your worktree raising the codec TTL to 48 h — a cursor is a sealed keyset
  position, not a grant — which would remove the extra request; deploying it
  is a rule-12 recreate (rollback = image sha `2e80ad38`). See also §5.1.

## 2. P0 — parent-set integrity in the published feeds

The Portal lineage guard is strict by design: a child row whose parent is not
in the same profile's accepted set is dropped and counted. Two live findings
are source-side inconsistencies, not Portal bugs:

1. **LIVE balances without LIVE accounts.** The live feed publishes
   `account_balances` rows while `accounts` returns zero rows → every balance
   is rejected (`N30_PROFILE_LINEAGE_REJECTED`, live). Publish the owning
   `accounts` rows, or stop publishing orphan balances.
2. **Cross-family rows inside `PAPER_BINANCE_USDM`.** Paper `orders`, `fills`
   and `account_balances` pages include rows whose `account_id`/`strategy_id`
   parents are not part of the BINANCE-USDM paper family (the DNSE/VN family
   is the known candidate). They are dropped and now counted per
   missing-parent class in the snapshot envelope (`lineage_rejects`). Scope
   each profile's feed to its own family; the VN family's home is item §8.
3. Sandbox `reconciliation_findings` reference parents absent from the
   sandbox set — same rule, same fix.

Question Q: 87 % of paper orders (316/364) are `RISK_REJECTED`. Portal maps
and renders this truthfully; please confirm whether this reject rate is the
intended risk configuration or a paper-runner defect on your side.

## 3. P1 — zero-row publications product screens already bind

| Relation | All-profile state | Consuming screen | Ask |
|---|---|---|---|
| `manager.venue-accounts:venue_accounts` | 0 rows everywhere | Bindings register (binding_id spine), Account/Broker 360 | publish, or declare intentionally absent so the screen states that reason |
| `manager.accounts:margin_balances` | 0 rows (sandbox/live) | Account 360 margin panel | publish for margin-enabled accounts |
| `manager.accounts:account_sync_effective` | 0 rows | Account 360 sync panel | publish per sync cycle |
| `manager.accounts:broker_account_sync_effective` | paper 0 · sandbox 1 · live 0 | bindings credential/sync column | confirm cadence; paper shows none |
| `manager.conditional-orders:*` | 0 rows | Blotter legs/groups | confirm true zero (no conditional orders yet) |
| `manager.reconciliation:reconciliation_findings` | 0 rows | Operations, CC needs-you, workbench | confirm publication semantics: findings are published whenever they exist, with `status`/`severity`/`resolved_at` lifecycle |

## 4. P1 — analytics source activations (one each)

1. **Market candles** (`N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED`): bounded
   OHLCV read per `symbol × timeframe × window` (exact decimal strings,
   keyset cursor, declared venue/clock authority). Consumer: Alpha 360 trade
   replay context; the exact order/fill journal already renders without it.
2. **Benchmark series** (`N28_BENCHMARK_SERIES_SOURCE_NOT_ACTIVATED`): one
   declared benchmark series (id, currency, points `ts, value`) per market.
   Consumer: portfolio ρ-timeline.
3. **Twin-profile join** (`N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED`): paper and
   live series joined by artifact digest for the same alpha (equal windows).
   Consumer: canary drift tile.
4. **Market ticks** (`N28_MARKET_TICKS_NOT_ACTIVATED`): bounded latest
   tick/mark read per instrument (exact decimal price, venue timestamp,
   clock authority). Consumer: Live Full Operations mark/tick panel
   (`market.ticks` capability on `EXECUTION_LIVE_FULL_OPERATIONS_SCREEN`).
5. **Venue calendar** (`N28_VENUE_CALENDAR_NOT_ACTIVE`): trading
   sessions/holidays per venue and market (effective_from, session windows,
   timezone authority). Consumer: VNM workbench session shading; pairs with
   MC-06 (`venue.vnm-order-types`).

## 5. P1 — history depth and streaming cadence

- Today every relation is a flat hot window; 30-day rollups, history charts
  and the multi-alpha derivations
  (`N25_INSUFFICIENT_MULTI_ALPHA_HISTORY`: portfolio drawdown-overlap and
  correlation) need either (a) a **retention floor ≥ 30 d** on the three
  time-series relations with keyset continuation, or (b) the **MC-01
  incremental event stream** (already formally requested — §7), which the SGP
  ladder then folds locally.
- SGP already merges a declared 30 d / 5,000-row window per refresh; the edge
  per-class cadence groundwork (transactional / account-state / metadata
  intervals) is implemented in-repo (`EDGE_MANAGER_PROJECTION_POLL_INTERVAL_
  {TRANSACTIONAL,ACCOUNT_STATE,METADATA}_MS`, defaults preserve today's
  single cadence) and waits on your deploy window. Journal push/tail remains
  the target transport per the P4-E matrix
  (`deploy/execution-phase4/production-streaming-config.md`).

### 5.1 Note for your side: manager cursor TTL vs pull consumers (FYI, worked around)

Your facade's page cursors expire five minutes after issue, and a tail page
issues no cursor. A pull consumer that follows the (ts, id) tail therefore
cannot legally hold its position; Portal now forces a fresh issue each cycle
by re-reading the final page with `limit K-1`. This works and stays inside
the read contract, but costs one extra bounded request per relation per
cycle. If you ever revisit the codec, a longer TTL (or a tail cursor on the
final page) removes that workaround; nothing is blocked on it.

## 6. P2 — the nine standing N28 owner requests (unchanged, still open)

`owner-request.v3.json` remains the authoritative machine copy; summary:

| Request | Capability | Operation asked |
|---|---|---|
| MC-01 | `event.full-incremental` | `GET /portal/execution/v3/events` — ordered cursor, UPSERT/DELETE, retention floor, typed gap/resync. Additional named consumers since v3: the SGP history ladder (§5) and the Portfolio capital-ledger timeline (allocation change events) |
| MC-02 | `artifact.reference` | artifact metadata + signed read (sha256, retention, access policy) |
| MC-03 | `execution.broker-ack-timestamps` | per-order submit/ack/terminal timestamps with clock authority |
| MC-04 | `execution.signal-intent-funnel` | per-deployment windowed funnel counts |
| MC-05 | `binding.full-exposure-population` | full physical/virtual/open/reserved population + verdict |
| MC-06 | `venue.vnm-order-types` | VN venue order-type/session constraint publication |
| MC-07 | `admin.sizing-explanation` | sizing decision inputs/constraints/reason codes |
| MC-08 | `admin.config-plan-apply` | config plan/apply artifacts with policy verdict |
| MC-09 | `command.delegated-terminal-policy` | delegated command terminal states + verification evidence |

## 7. P2 — deferred by owner: `PAPER_DNSE_VNM` (N13B publication)

Owner approved the taxonomy and then deferred activation ("từ từ"). When
scheduled, the Execution Cell publishes a new N13B profile: origin (HTTPS),
audience `portal-execution-edge-paper-dnse`, profile id `PAPER_DNSE_VNM`,
qualification manifest, and the VN-family relations scoped to it. Portal-side
config/lineage groundwork is already landed flag-off; activation is one env
set on each side after your publication.

## 8. Common contract terms for every item above

All new or changed publications inherit the terms already accepted in
`owner-request.v3.json` `common_contract` unchanged: TLS 1.3 mTLS transport;
short-lived delegated JWT bound to the exact capability/resource/profile;
read and command identities distinct; no browser-direct access; additive
compatibility required (`X-Trading-Contract-Revision`); bounds
`maximum_page_rows 5000`, `maximum_response_bytes 8 MiB`,
`maximum_concurrency_per_identity 2`; no automatic retry; and
`portal_activation_on_publication false` — Portal activates each delivery
deliberately after verification, never implicitly.

Additionally, per the contract-pack process every new/changed relation ships
with canonical fixtures (at minimum `empty` and one populated page) and a
redaction pass, and the shared source-admission budget (15 r/s across every
profile) is unchanged — publications must fit inside it, not widen it.

## 9. Deliberately NOT requested

For completeness, the three intentional exclusions stand (recorded in the
N29 debt register, non-blocking, do not build them for Portal):
`redis-inspect`, `testnet-hard-reset`, `lab-reset`.

## 10. Verification protocol

For every delivered item Portal verifies with the same live inventory used to
write this request (relation availability/reason/rows per profile in the SGP
projection, then the consuming screen), and answers with a dated
`VERIFIED`/`REJECTED` note in the unified plan §13. Nothing is accepted from
documentation alone.
