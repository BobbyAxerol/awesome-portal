# Paper-to-Live Execution Portal — Backend & Institutional UI/UX Adjustment Specification v0.6

> **Đường dẫn đề xuất:** `upgrade/PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md`
> **Loại tài liệu:** Additive adjustment; không thay thế v0.4 hoặc v0.5
> **Phạm vi:** Portal từ operational Paper → Sandbox → Live Canary → Live, cùng Portfolio/Alpha/Account/Deployment 360°
> **Nguồn nghiệp vụ:** `DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`, `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`, `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN(2).md`
> **Ngày:** 2026-08-16

---

## 1. Quyết định cần khóa

Portal không được tạo một accounting/execution model thứ hai. Nó là **control plane + read experience** trên Trading System đang chạy tại Execution Cell AWS HK.

```text
Research Cell — DO SGP
  Unified Portal / Research / QuantBT / Planning
                 │
                 │ secure query + command + event contracts
                 ▼
Execution Cell — AWS HK
  Trading Gateway / Risk / Execution / Accounting / Reconciliation
  PostgreSQL + TimescaleDB / Redis / broker adapters
```

Người dùng vẫn dùng một domain và một shell. Các màn Paper/Sandbox/Canary/Live trong Portal chính gọi Execution Cell qua typed gateway; browser không truy cập PostgreSQL, Redis hoặc broker adapter trực tiếp.

### 1.1 Source of truth

| Domain | Authority |
|---|---|
| Alpha identity | `strategies.strategy_id`; `alpha_id` chỉ là compatibility alias |
| Order lifecycle | `orders`; không đọc hoặc tái tạo `binance_sent_orders` |
| Fill ledger | `fills` |
| Current virtual position | `positions_v2` |
| Internal account accounting | `account_balances`, `margin_balances`, `account_reservations`, `cash_ledger`, `margin_ledger` |
| Deployment | `strategy_deployments` |
| Portfolio capital | `portfolios`, `portfolio_allocations`, `portfolio_capital_ledger` |
| Paper working orders | `paper_open_orders` |
| Sandbox/live physical truth | broker current-state projection qua `external_account_ref` |
| Performance history | `performance_snapshots`, `account_equity_snapshots`, `portfolio_equity_snapshots` |
| Operational mismatch | `reconciliation_findings` |
| Emergency action | `operator_operations` |
| Immutable trace/replay evidence | `domain_events`, canonical order/fill/bracket evidence |

### 1.2 Identity graph

```text
portfolio_id
  └── allocation_id
       └── deployment_id
            ├── strategy_id  (= canonical alpha identity)
            ├── account_id   (= virtual accounting/risk boundary)
            ├── mode         (= paper | sandbox | live)
            ├── venue
            └── external_account_ref (optional physical broker binding)
```

Invariant:

```text
Một internal account = một strategy/alpha + một mode + một venue.
Không dùng chung account_id giữa hai alpha.
Một physical broker binding có thể được nhiều virtual account tham chiếu.
```

### 1.3 Canary không phải execution mode mới

Schema hiện chỉ có `paper`, `sandbox`, `live`, `replay`, `backtest`. Vì vậy không thêm `mode=canary`.

```text
mode             = nơi lệnh được thực thi
promotion_stage  = mức governance/capital rollout
```

Đề xuất additive contract:

```text
promotion_stage:
  PAPER_OBSERVATION
  SANDBOX_VALIDATION
  LIVE_CANARY
  LIVE_FULL

strategy_deployments:
  promotion_stage
  revision
  alpha_version_id
  artifact_digest
  approved_run_id
  approval_id
  promoted_at
  promoted_by
```

`LIVE_CANARY` vẫn chạy `mode=live`, nhưng capital nhỏ, risk envelope hẹp, monitoring chặt, rollback đã chuẩn bị và không được tự động biến thành `LIVE_FULL` theo thời gian.

---

## 2. Backend boundary cho Portal

### 2.1 Không rewrite Trading System để phục vụ UI

Phân công target:

```text
TypeScript Portal Control Plane
  auth/RBAC, workflow, screen APIs, report orchestration,
  inter-cell client, projection freshness, approval/promotion

Python Trading System tại AWS
  gateway, risk, execution adapters, paper matcher,
  accounting, broker sync, reconciliation, canonical writes

Rust read/realtime services — chỉ sau profiling
  large Timescale/Arrow query, aggregation, realtime fan-out,
  không trực tiếp quyết định risk hoặc ghi accounting state
```

Portal backend không được gọi repository Python nội bộ hoặc import business code của Trading System. Contract là HTTP/event/artifact đã version hóa.

### 2.2 Hai loại API

#### Execution Query API — read-only

```text
GET /portal/execution/v1/overview
GET /portal/execution/v1/alphas
GET /portal/execution/v1/alphas/{strategy_id}
GET /portal/execution/v1/portfolios/{portfolio_id}
GET /portal/execution/v1/accounts/{account_id}
GET /portal/execution/v1/deployments/{deployment_id}
GET /portal/execution/v1/sessions/{execution_session_id}
GET /portal/execution/v1/orders/{client_order_id}/trace
GET /portal/execution/v1/broker-bindings/{external_account_ref}
GET /portal/execution/v1/reconciliation
GET /portal/execution/v1/operations
GET /portal/execution/v1/reports/{report_type}
```

Mọi response phải có:

```json
{
  "data": {},
  "authority": "EXECUTION_CELL",
  "as_of": "...",
  "source_sequence": "...",
  "freshness": "FRESH|DEGRADED|STALE|UNAVAILABLE",
  "projection_lag_ms": 0,
  "trace_id": "..."
}
```

#### Execution Command API — side effect

```text
POST /deployments/{id}/state/plan
POST /deployments/{id}/state/apply
POST /deployments/{id}/promotions/plan
POST /deployments/{id}/promotions/apply
POST /accounts/{id}/sync
POST /accounts/{id}/reconciliation/plan
POST /accounts/{id}/reconciliation/apply
POST /allocations/{id}/changes/plan
POST /allocations/{id}/changes/apply
POST /risk-profiles/{scope}/changes/plan
POST /risk-profiles/{scope}/changes/apply
POST /operations/emergency-close/plan
POST /operations/emergency-close/apply
GET  /operations/{operation_id}/verify
```

Mọi mutation bắt buộc có:

```text
command_id
idempotency_key
expected_revision
actor_id + delegated actor assertion
reason
expires_at
approval_id khi cần
scope ids
```

Execution Cell tự kiểm tra lại role, resource permission, state, broker freshness, approval và risk. Portal `ADMIN` không đồng nghĩa bypass live policy.

### 2.3 Không cho Portal ghi DB trực tiếp

CLI hiện tại đã là thin client qua admin API; Portal phải dùng cùng nguyên tắc:

```text
CLI ───────┐
           ├── versioned execution/admin APIs ──> domain services
Portal ────┘
```

Không tạo SQL mutation riêng cho UI. Nếu một Portal action chưa có API tương ứng, bổ sung API/domain command trước rồi mới bật UI action.

---

## 3. Read model và realtime giữa AWS HK ↔ DO SGP

### 3.1 Hai tầng dữ liệu

**Projection tại Research** dùng cho danh sách, dashboard và chart không nhạy cảm:

- alpha/deployment status summary;
- portfolio/account equity summary;
- PnL/exposure snapshots;
- open incident/reconciliation counts;
- service/readiness summary.

**Authoritative query tới AWS** dùng khi:

- mở Current Positions/Open Orders;
- kiểm tra broker sync trước mutation;
- promotion review;
- allocation/risk change;
- emergency action;
- xem physical broker exposure.

### 3.2 Event relay

Execution phát event versioned; Research cập nhật projection idempotently.

```text
execution.deployment.changed
execution.session.changed
execution.order.changed
execution.fill.created
execution.position.changed
execution.account.changed
execution.performance.changed
execution.reconciliation.changed
execution.operation.changed
execution.health.changed
```

Mỗi event cần `event_id`, `aggregate_id`, `aggregate_version`, `source_sequence`, `occurred_at`, `schema_version`, `correlation_id`, `causation_id`.

Portal phải hiển thị `STALE` thay vì dùng projection cũ như live truth. Không cố strong consistency xuyên SGP–HK; consistency được giữ bằng single ownership, sequence, expected revision, idempotency và reconciliation.

### 3.3 Realtime transport

- REST snapshot cho lần tải đầu.
- SSE cho status/PnL/operations feed thông thường.
- WebSocket chỉ cho dense live tape hoặc multi-channel streaming có nhu cầu thật.
- Không polling từng card mỗi giây.
- Large order/fill history dùng cursor pagination và server-side aggregation; không tải toàn bộ JSON vào browser.

---

## 4. Information Architecture từ Paper trở đi

```text
Operations
├── Command Center
├── Alpha Fleet
├── Portfolios
├── Deployments
│   ├── Paper
│   ├── Sandbox
│   ├── Live Canary
│   └── Live
├── Accounts
├── Orders & Fills
├── Risk & Sizing
├── Broker Sync & Reconciliation
├── Incidents & Operations
└── Reports
```

### 4.1 Màn chung toàn quỹ

#### Operations Command Center

Một màn ra quyết định, không phải collection card trang trí:

- tổng equity, net PnL, drawdown và allocated capital theo currency;
- active/reducing/halted deployment;
- broker sync freshness;
- open reconciliation findings theo severity;
- unresolved dead letters;
- current exposure theo mode/venue;
- order/fill activity tape;
- incident và operation đang `PARTIAL`/`FAILED`;
- `as_of`, authority và projection lag luôn hiện.

#### Alpha Fleet

Dense table theo `strategy_id`:

```text
Alpha | Owner | Paper | Sandbox | Canary | Live | Portfolio
Equity | Net PnL | DD | Exposure | Open Orders | Sync | Findings | Last Cycle
```

Click một alpha mở **Alpha 360°**; không mở modal chứa vài KPI.

#### Portfolio Fleet

- equity/NAV và drawdown;
- allocated vs max capital;
- cash free/locked;
- gross/net exposure;
- alpha contribution;
- account count và state;
- open risk/reconciliation issues.

#### Deployment Board

Một board/table có filter `mode`, `promotion_stage`, `venue`, `state`, `portfolio_id`, `strategy_id`.

Mỗi row phải phân biệt:

```text
Runtime state       ACTIVE | REDUCING | HALTED | ARCHIVED
Promotion stage     PAPER_OBSERVATION | SANDBOX_VALIDATION | LIVE_CANARY | LIVE_FULL
Readiness           READY | DEGRADED | BLOCKED
Broker sync         OK | STALE | MISMATCH | ERROR | N/A
```

---

## 5. Entity 360° screens

### 5.1 Alpha 360° — `strategy_id`

Header:

```text
Alpha identity | owner | artifact/version | certification
active deployment chips | portfolio links | aggregate health | last activity
```

Tabs:

1. **Overview:** paper/sandbox/live equity overlay, current exposure, deployment state, latest cycle.
2. **Deployments:** mọi `deployment_id` theo account/mode/venue/stage.
3. **Performance:** PnL decomposition, equity, drawdown, fees, funding, symbol contribution.
4. **Positions:** virtual `positions_v2`, grouped by account and mode.
5. **Orders & Fills:** canonical order funnel và execution tape.
6. **Risk & Sizing:** risk profile hierarchy, risk grants, sizing decisions và reject reasons.
7. **Execution Sessions:** rebalance/candle cycles với submitted → risk → sent → filled funnel.
8. **Accounting:** balances, reservations, cash/margin ledger, settlement buckets.
9. **Reconciliation:** account và physical binding discrepancies.
10. **Audit:** capital changes, state changes, operator operations, domain trace.

Không cộng trực tiếp currency khác nhau. Mọi aggregate phải có base-currency conversion policy hoặc tách series theo currency.

### 5.2 Portfolio 360° — `portfolio_id`

Tabs:

- Overview/NAV;
- Allocations;
- Alpha Contribution;
- Accounts;
- Exposure & Margin;
- Capital Ledger;
- Performance;
- Risk & State;
- Reconciliation;
- Audit.

Các action capital phải mở **Action Drawer** có before/after, expected revision, reason, effect preview và approval requirement.

### 5.3 Account 360° — `account_id`

Account là màn quan trọng nhất từ Paper trở đi:

- account type, margin mode, settlement policy, leverage;
- total/free/locked cash;
- initial/maintenance margin;
- buying power;
- current positions/open orders;
- reservations và pending exposure;
- equity/PnL/drawdown;
- broker sync status, age, source và digest;
- physical binding và NET/HEDGE mode;
- reconciliation findings;
- cash/margin ledger;
- related deployment/portfolio/alpha.

Với sandbox/live, đặt song song:

```text
Internal virtual state | Physical broker state | Difference
```

Không gán toàn bộ physical position cho từng alpha khi nhiều account dùng chung `external_account_ref`.

### 5.4 Deployment 360° — `deployment_id`

- runtime state và promotion stage;
- immutable artifact/version/approval lineage;
- portfolio allocation và risk capacity;
- account/venue/policy;
- current execution session;
- performance, exposure và order activity;
- broker readiness;
- incidents/reconciliation;
- state/promotion timeline;
- actions: reduce, halt, resume, promote, rollback.

### 5.5 Execution Session 360° — `execution_session_id`

Dùng counters có sẵn để hiển thị một rebalance cycle:

```text
Submitted → Risk Approved/Rejected → Sent → Filled/Partial/Broker Rejected
                                → Accounting Recovered
                                → Reconciliation Deferred/Actionable
```

Kèm duration waterfall:

```text
alpha signal
→ gateway intake
→ risk decision
→ broker acknowledgement
→ first/last fill
→ accounting applied
→ reconciliation clean
```

Chỉ hiển thị latency nào có timestamp/evidence thật; field chưa có phải ghi `NOT_INSTRUMENTED`, không suy đoán.

### 5.6 Order Trace 360° — `account_id + client_order_id`

Một timeline duy nhất:

```text
Sizing Decision
→ Execution Session
→ Risk Grant / Risk Reject
→ Canonical Order
→ Broker Attempts / ACK Evidence
→ Fill(s)
→ Reservation/Pending Exposure
→ Position & Ledger Effects
→ Performance Projection
→ Reconciliation Finding/Resolution
→ Bracket/Conditional Group nếu có
```

Đây là UI tương đương `cli ops trace-order`, nhưng không đọc legacy order store.

### 5.7 Broker Binding 360° — `external_account_ref`

- physical cash/buying power;
- physical positions/open orders;
- bound virtual accounts;
- aggregate virtual exposure vs physical exposure;
- NET/HEDGE constraints;
- sync freshness/history;
- reconciliation status;
- blast-radius warning trước physical action.

---

## 6. Chart, metric và report contract

### 6.1 Production chart matrix

| View | Visual | Canonical source |
|---|---|---|
| Portfolio | Equity/NAV + drawdown | `portfolio_equity_snapshots` |
| Portfolio | Allocated/max capital | `portfolio_allocations`, `portfolio_capital_ledger` |
| Portfolio | Alpha contribution | account/deployment equity deltas grouped by `strategy_id` |
| Alpha/Account | Equity + net/gross PnL | `account_equity_snapshots` |
| Alpha/Account | Realized/unrealized/fees/funding | account/performance snapshots + `funding_accruals` |
| Alpha | Long/short/notional exposure | `performance_snapshots`, `positions_v2` |
| Account | Free/locked cash and margin | balances, margin balances, reservations |
| Session | Order funnel | `execution_sessions` counters + canonical orders/fills |
| Risk | Limit utilization | `risk_profiles`, positions, pending exposure, allocations |
| Sizing | Requested → rounded → capped quantity | `sizing_decisions` |
| Execution | Order status/reject distribution | `orders.status`, `error_code`, `error_message` |
| Reconciliation | Open finding count/age/severity | `reconciliation_findings` |
| Broker | Virtual vs physical exposure | current-state projections + `venue_accounts` |
| Ops | Service readiness and freshness | `service_heartbeats`, stream/monitor metrics |
| Rust rollout | parity/divergence/latency | `engine_shadow_comparisons` — chỉ scope được phép |

### 6.2 Metrics chưa có canonical evidence

Không tự bịa:

- slippage vs decision/reference price;
- broker ACK latency đầy đủ;
- fill-to-accounting latency đầy đủ;
- Sharpe/Sortino cho live series;
- backtest ↔ paper ↔ live degradation;
- alpha contribution sau FX conversion.

Muốn bật phải thêm metric contract/version rõ ràng. Đề xuất:

```text
execution_quality_events
  strategy_id, account_id, deployment_id, client_order_id
  decision_price, arrival_price, broker_ack_at
  first_fill_at, last_fill_at, accounting_applied_at
  expected_qty, filled_qty, vwap, slippage_bps
  formula_version, source_evidence
```

Backtest-paper-live comparison phải join Research artifact/run với Execution deployment bằng `alpha_version_id`, `artifact_digest`, `approved_run_id`; không join bằng tên alpha hoặc timestamp gần nhau.

### 6.3 Chart rules

Mọi figure phải hiển thị:

```text
unit/currency
mode + venue + account scope
timezone
as_of/freshness
authority source
formula version
gap/missing-data behavior
downsampling method
```

Không smooth line làm sai dữ liệu; không mix Paper và Live mà thiếu semantic line style; không dùng gauge hoặc sparkline nếu không giúp quyết định.

### 6.4 Report pack

1. **Daily Fund Operations:** NAV, PnL, exposure, capital, open risk/reconciliation/incident.
2. **Alpha Operations:** deployment states, cycles, PnL, fills, rejects, sizing, divergence.
3. **Execution Quality:** order funnel, fill ratio, maker/taker, fee/funding, latency/slippage khi đủ evidence.
4. **Broker Control:** sync freshness, virtual-vs-physical exposure, mismatches và repair actions.
5. **Capital & Accounting:** allocation changes, cash/margin ledger, reservations, settlements.
6. **Incident & Emergency:** dead letters, findings, operator operations, plan/apply/verify evidence.

Report phải có immutable manifest: query range, source sequence/as-of, formula version, filters, generated_at, actor và artifact checksum.

---

## 7. Luồng vận hành theo mode

### 7.1 Paper Observation

```text
Create/verify strategy
→ create paper account
→ set account policy
→ seed virtual capital
→ attach portfolio allocation
→ configure risk + paper matcher
→ start deployment
→ observe sessions/orders/fills/accounting
→ pass paper acceptance gate
```

Paper vẫn phải dùng canonical orders/fills/accounting, persisted open orders, reservations, fees, slippage/latency config và settlement policy của venue mục tiêu.

### 7.2 Sandbox Validation

```text
Create sandbox account
→ bind external_account_ref
→ require broker sync
→ keep HALTED
→ sync broker
→ reconcile positions/open orders
→ tiny controlled smoke
→ observation/soak
→ clean exposure
→ final sync + reconciliation
→ return HALTED hoặc request promotion
```

Portal không cho `ACTIVE` khi sync missing/stale/error/mismatch.

### 7.3 Live Canary

```text
Approved immutable artifact
→ approved run/evidence
→ live account + broker binding verified
→ broker sync/reconciliation clean
→ allocation/risk envelope rất nhỏ
→ step-up auth + dual approval
→ stage LIVE_CANARY
→ bounded observation
→ promote, hold, reduce hoặc rollback
```

### 7.4 Live Full

Chỉ cho phép khi:

- canary evidence đạt gate;
- no unresolved critical finding;
- broker current state fresh;
- rollback/emergency plan verified;
- actor/approval/audit lineage đầy đủ;
- same artifact digest được promote, không rebuild.

---

## 8. Dangerous-action UX

State-changing action không dùng nút confirm đơn giản.

```text
PLAN
  show affected alpha/account/deployment/order/position
  show before/after and blast radius
  validate freshness, permissions, approvals, expected revision

APPLY
  explicit reason + short-lived confirmation
  create command/operation id

VERIFY
  wait for authoritative terminal state
  expose PARTIAL residue and required next action
```

Áp dụng cho:

- allocation increase/withdraw/rebalance;
- deployment halt/reduce/resume;
- risk limit change;
- sandbox/live promotion;
- emergency close;
- physical broker reconciliation apply;
- engine authority transition.

Emergency close phải dùng đúng semantics hiện có: `plan → apply → verify`; `PARTIAL` không được hiển thị như success.

---

## 9. Backend gaps cần agent xử lý trước khi bật full UI

| Gap | Hành động |
|---|---|
| Chưa có dedicated Portal execution query facade | Tạo read-only aggregate API; không cho frontend đọc DB/Redis |
| Canary chưa có schema semantics | Thêm `promotion_stage`, promotion/approval records; không thêm mode giả |
| Deployment chưa có immutable research lineage đầy đủ | Thêm `alpha_version_id`, digest, approved run/evidence |
| `audit_log` chưa có active writer | Bật canonical security audit hoặc hợp nhất rõ với active portfolio/operator audit |
| Dashboard realtime chưa có event contract | Thêm versioned execution projection events + source sequence |
| Slippage/latency thiếu evidence chuẩn | Thêm execution-quality event/projection trước khi vẽ chart |
| Report chưa có immutable artifact | Thêm report job/manifest/object-store contract |
| Live action chưa có delegated actor/expected revision | Bổ sung vào Execution Command API |
| Cross-cell stale handling chưa explicit | Mọi response/chart/table có freshness and authority envelope |
| Shared physical broker binding dễ bị hiểu sai | Bắt buộc Broker Binding 360° và aggregate reconciliation |
| Legacy compatibility dễ rò vào Portal | Contract test cấm query legacy alpha/binance tables cho màn mới |

### Hard rules cho agent

- Gateway enqueue/HTTP `202` không phải final execution success.
- Fill progression chỉ lấy từ canonical fill evidence; không suy fill từ requested order quantity.
- Paper restart dùng DB/paper working state làm authority.
- Sandbox/live restart dùng broker sync + reconciliation làm authority.
- `positions_v2` là virtual per-alpha state; physical broker snapshot là aggregate theo binding.
- Không xóa trading records để “reset” production; dùng lifecycle/emergency operations.
- Không mở action UI nếu backend command, audit và rollback chưa tồn tại.

---

## 10. UI component program

Claude phải reuse QuantBT design system và component đã có; chỉ promote component khi phục vụ nhiều màn thực.

Shared execution primitives nên có:

```text
EntityHeader
ModeStageBadge
AuthorityFreshnessStamp
MetricStrip
FinancialTimeSeriesFigure
PnLDecompositionFigure
ExposureFigure
DenseEntityTable
ExecutionFunnel
LifecycleTimeline
OrderTraceTimeline
ReconciliationDiff
BrokerBindingMap
ActionPlanDrawer
AuditEvidenceTable
OperationalStatusRail
```

Không tạo generic `StatCard`, `FancyCard`, `AIInsightCard` hàng loạt. Component phải giải quyết concern thật: authority, freshness, financial precision, lifecycle, trace hoặc action safety.

---

## 11. Delivery phases

### EP-0 — Contract & authority freeze

- khóa ID graph và canonical sources;
- khóa mode vs promotion stage;
- inventory existing APIs/CLI;
- define query/command/event schemas;
- define permissions và dangerous-action policy.

### EP-1 — Read-only Paper Portal

- Operations Overview;
- Alpha/Portfolio/Account/Deployment 360°;
- canonical orders/fills/positions;
- PnL/equity/exposure charts;
- session funnel, sizing, trace, dead letters/findings;
- no mutation ngoài link sang CLI/runbook.

### EP-2 — Paper control workflow

- create/seed/configure/allocate;
- state and risk changes;
- plan/apply/verify;
- complete audit and optimistic concurrency;
- Paper report pack.

### EP-3 — Sandbox operations

- broker binding/current state;
- sync/reconciliation;
- virtual-vs-physical diff;
- tiny-smoke workflow;
- restart recovery and stale-state handling.

### EP-4 — Canary/Live governance

- immutable artifact lineage;
- approval and promotion records;
- live canary allocation/risk envelope;
- step-up auth, dual approval, rollback;
- emergency route and ops console.

### EP-5 — Realtime & advanced reporting

- SSE/WebSocket stream;
- execution quality evidence;
- backtest-paper-live comparison;
- immutable report artifacts;
- Rust query/fan-out only after profiling gate.

---

## 12. Acceptance gate

Một phase chỉ được coi hoàn tất khi:

- màn hình không đọc legacy order/account sources;
- mọi number có unit, currency, scope, formula và source;
- current-state view có `as_of` và stale behavior;
- mutation dùng idempotency + expected revision + actor + audit;
- sandbox/live fail closed khi broker state không sạch;
- order trace nối được sizing → risk → order → fill → accounting → reconciliation;
- Paper/Sandbox/Live không bị trộn authority;
- shared physical binding được hiển thị đúng aggregate blast radius;
- report có reproducible manifest;
- UI không có fake KPI, fake live data hoặc generic AI-dashboard component;
- Research outage không dừng execution và WAN partition không mở rộng quyền.

---

## 13. Work order ngắn cho agent

1. Đọc ba source document của tài liệu này và v0.4/v0.5.
2. Inventory endpoint hiện có; đánh dấu `AVAILABLE`, `PARTIAL`, `MISSING`.
3. Viết OpenAPI cho Execution Query/Command facade trước UI implementation.
4. Dựng Figma/React prototype cho Operations Overview + Alpha 360 + Account 360 + Order Trace.
5. Bind từng KPI/chart/table vào canonical table/API; field chưa có phải ghi concern, không fixture như production.
6. Implement EP-1 read-only trước; chỉ mở mutation ở EP-2 sau khi plan/apply/verify và audit pass.
7. Không triển khai Canary/Live UI action trước khi additive promotion schema, delegated actor và approval gate được merge.

---

## 14. Quyết định cuối v0.6

```text
Portal chung cho toàn quỹ.
Trading System AWS là authority từ operational Paper trở đi.
Strategy/Alpha, Account, Deployment và Portfolio đều có màn 360° riêng.
Màn tổng thể phục vụ fund manager; màn entity phục vụ drill-down và operation.
Chart phải lấy từ canonical accounting/performance evidence.
Canary là governance stage của live, không phải mode giả.
Mọi action nguy hiểm là plan → apply → verify.
UI được sáng tạo mạnh, nhưng không được sáng tạo source of truth.
```
