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
| 12 | P2 | The nine N28 owner requests MC-01…MC-09 | typed unavailable until verified | see §7 |
| 13 | P2 · deferred by owner | `PAPER_DNSE_VNM` N13B publication | not published | VN market family home (Portal groundwork landed flag-off; owner says later) |
| Q | question | 316/364 paper orders are `RISK_REJECTED` (87 %) | rendered truthfully | confirm intended risk config vs paper-runner defect |

## 1. P0 — resume the equity/performance publications

The single biggest visual gap on every screen is here. Portal renders these
relations end-to-end (charts, ladders, derived series all wired and tested);
they are empty because the source currently publishes empty pages.

### 1.1 `manager.performance:account_equity_snapshots`
- Live state: page answers `AVAILABLE`, completeness `SOURCE_PARTIAL`, zero
  items, all profiles.
- Ask: resume row publication for every active paper deployment/account, and
  state why the page is PARTIAL when it is.
- Expected columns (Portal reads exactly these; extras ignored):
  `id, ts, deployment_id, strategy_id, account_id, mode, venue, currency,
  cash_total, cash_free, cash_locked, margin_initial, margin_maintenance,
  realized_pnl, unrealized_pnl, fee_total, funding_pnl, gross_pnl, net_pnl,
  equity, drawdown, total_notional, total_fills, source, created_at`.
  Money = exact decimal strings; `mode` must equal the profile's mode.
- Acceptance: rows visible in the SGP projection
  (`manager.performance:account_equity_snapshots` items > 0), Paper/Alpha 360
  equity chart renders, and the SGP 30-day ladder begins accumulating
  (`window {days:30, basis:MERGED_SNAPSHOT_LADDER}` already declared).

### 1.2 `manager.performance:performance_snapshots`
- Same live state and same ask/acceptance as 1.1; columns per the published
  catalogue (`id, ts, deployment_id, strategy_id, account_id, mode, venue,
  instrument_id, symbol, currency, position_*, avg_px_open, mark_price,
  notional, exposure_long, exposure_short, cash_*, realized_pnl,
  unrealized_pnl, net_pnl, equity, ...`).

### 1.3 `manager.performance:portfolio_equity_snapshots`
- Live state: `UNAVAILABLE · MANAGER_V2_SOURCE_CONTRACT_REJECTED` — the edge
  adapter rejects the source shape; typed since Phase 1 and never delivered.
- Ask: publish the relation matching the catalogued contract
  (`id, ts, portfolio_id, currency, allocated_capital, account_count,
  cash_total, cash_free, cash_locked, margin_initial, margin_maintenance,
  realized_pnl, unrealized_pnl, fee_total, funding_pnl, gross_pnl, net_pnl,
  equity, drawdown, total_notional, total_fills, source, created_at`), or
  return the edge-side rejection detail (your deployed edge logs carry the
  exact violation) so the contract can be amended deliberately.
- Until then Portal serves `portfolio-equity-derived.v1` (exact forward-filled
  sum of member-account equity, authority DERIVED) — it also needs 1.1.

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

## 5. P1 — history depth and streaming cadence

- Today every relation is a flat hot window; 30-day rollups and history
  charts need either (a) a **retention floor ≥ 30 d** on the three
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

## 6. P2 — the nine standing N28 owner requests (unchanged, still open)

`owner-request.v3.json` remains the authoritative machine copy; summary:

| Request | Capability | Operation asked |
|---|---|---|
| MC-01 | `event.full-incremental` | `GET /portal/execution/v3/events` — ordered cursor, UPSERT/DELETE, retention floor, typed gap/resync |
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

## 8. Verification protocol

For every delivered item Portal verifies with the same live inventory used to
write this request (relation availability/reason/rows per profile in the SGP
projection, then the consuming screen), and answers with a dated
`VERIFIED`/`REJECTED` note in the unified plan §13. Nothing is accepted from
documentation alone.
