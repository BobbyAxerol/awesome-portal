# Portal Execution Edge — Maximum Data Discovery, Publication & Return Request — v1.0

| Thuộc tính | Giá trị |
|---|---|
| Ngày | 2026-09-04 |
| Repository | `BobbyAxerol/awesome-portal` |
| Nhánh làm việc | `feat/execution-data-activation` |
| Bên gửi | Portal SGP control plane / Execution Portal |
| Bên nhận | Portal Execution Edge trên AWS-HK và agent/operator có quyền đọc Trading System source |
| Frontend baseline | Frozen execution frontend hiện tại; showcase chỉ là visual/interaction reference |
| Tài liệu liên quan | `upgrade/backend/EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md`, `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` §16, và `EXECUTION_DURABLE_STREAMING_FROZEN_FRONTEND_INTEGRATION_AND_FINANCIAL_CHART_PLAN_v1.1.md` |
| Trạng thái | `READ_ONLY_DISCOVERY_REQUESTED / EDGE_BRANCH_IMPLEMENTATION_REQUESTED / RUNTIME_MUTATION_REQUIRES_OWNER_WINDOW` |
| Kết quả bắt buộc | Trả một machine-readable source/contract/coverage pack đầy đủ để Portal có thể xây và nối từng màn hình bằng dữ liệu thật mà không phải đoán nguồn |

> **Owner intent:** Portal phải khai thác tối đa mọi dữ liệu authoritative đang tồn tại và hữu ích trong Trading System/database/source services. Không được tự giới hạn theo 2.000 rows, current projection catalogue, chín MC hiện tại, hoặc những field đã được biết trước. Nếu dữ liệu cần cho Portal đã tồn tại, Execution Edge phải tìm thấy, phân loại, expose hoặc đề xuất derived contract phù hợp. Nếu dữ liệu thực sự chưa tồn tại, phải trả typed absence và một owner request duy nhất.

---

## 0. Quyết định trung tâm

### 0.1 “Không có boundary dữ liệu tùy ý” nghĩa là gì

Trong request này:

```text
NO ARBITRARY DATA-SCOPE BOUNDARY
```

nghĩa là:

- Không giới hạn census vào các relation đang có trong `profile-projection.catalog.ts`.
- Không giới hạn vào các field Portal hiện đã whitelist nếu source còn field hữu ích cho cùng screen/domain.
- Không giới hạn full history vào 2.000, 5.000 hoặc một số rows cố định.
- Không bỏ qua table/view/event journal chỉ vì current Source Proxy chưa publish.
- Không coi một page đầu là toàn population.
- Không chỉ trả current state nếu lịch sử/event source đã tồn tại.
- Không chỉ trả raw table nếu metric authoritative có thể derive chính xác từ các source hiện có.
- Không đóng request bằng “source không có trong current catalogue” trước khi kiểm tra database, view, audit/history/outbox và producer code liên quan.
- Không yêu cầu Portal tự đoán join hoặc công thức nếu Execution Cell đang nắm authority tốt hơn.

### 0.2 Những boundary vẫn bắt buộc

“No arbitrary data boundary” **không** có nghĩa mở database tùy ý hoặc gửi response vô hạn. Các boundary sau vẫn bắt buộc:

1. **Authority boundary:** Trading System vẫn là authority; Portal mirror chỉ là read model.
2. **Security boundary:** không browser-direct, không raw DSN/credential/private key/broker secret.
3. **Profile boundary:** mode, venue, account, workspace, deployment và portfolio phải scope chính xác.
4. **Transport boundary:** mỗi page/frame có row/byte cap, nhưng cursor phải cho phép đọc toàn population.
5. **Resource boundary:** exact allowlist cho operation, schema, field class và delegated identity.
6. **Privacy boundary:** Git chỉ chứa sanitized evidence, aliases, aggregate counts và digests.
7. **Command boundary:** request này ưu tiên read/data publication; command activation cần owner window riêng.
8. **Operational boundary:** source discovery được phép read-only; runtime mutation/deploy/unhalt cần Bobby phê duyệt.

Nói cách khác:

```text
Total data/history: không cap tùy ý.
Mỗi transport frame/request: luôn bounded.
Source access: luôn scoped, audited và fail-closed.
```

---

## 1. Quan hệ authority với các tài liệu hiện tại

### 1.1 `EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md`

File ngày 2026-09-03 tiếp tục được giữ như:

```text
RUNTIME_DIAGNOSTIC_EVIDENCE
```

Nó không nên tiếp tục được coi là active request duy nhất vì trong cùng file còn lẫn:

- ask đã resolved;
- ask đã superseded;
- source-side gap;
- Portal-side adapter gap;
- owner decision;
- historical diagnosis.

Request v1.0 này yêu cầu bên Execution Edge **reconcile** toàn bộ các phát hiện đó thành return pack mới, không xóa evidence cũ.

### 1.2 `owner-request.v3.json`

`owner-request.v3.json` vẫn là machine evidence lịch sử cho MC-01…MC-09. Tuy nhiên:

- MC-01 cần revision mới đủ cho full incremental event stream và deterministic Trade Replay.
- Các source đã tồn tại như candles, ticks, calendar, benchmark derivation hoặc exact twin join không được tự động gộp vào “Trading System missing capability” nếu Edge có thể adapt.
- Không sửa silent v3 in-place; phát hành revision mới có `supersedes_request_revision`.

### 1.3 Unified plan §16

§16 là runtime gap audit có giá trị. Nó không tự đóng vai trò source contract. Bên Execution Edge phải trả machine-readable evidence để các row trong §16 chuyển từ:

```text
OBSERVED / INFERRED
```

sang:

```text
SOURCE_CONFIRMED
CONTRACT_PUBLISHED
EDGE_IMPLEMENTED
PORTAL_CONSUMABLE
```

---

## 2. Objectives

Bên Execution Edge phải hoàn thành bảy mục tiêu:

1. **Discover all useful source data:** kiểm tra toàn bộ database/source surface liên quan, không chỉ current catalogue.
2. **Classify semantics:** xác định current state, immutable fact, snapshot, versioned event, ledger, audit, derived view hay operational status.
3. **Map to frozen frontend:** map từng source/field/derivation vào từng screen, panel, field và action requirement.
4. **Publish what already exists:** tạo hoặc mở rộng typed read/history/event contracts cho dữ liệu đã có.
5. **Derive where authoritative:** tính source-local metric khi Execution Cell giữ semantics tốt hơn Portal, nhưng phải trả provenance và raw reproducible inputs.
6. **Escalate only genuine absence:** chỉ mở owner request khi đã chứng minh dữ liệu/producer thực sự không tồn tại hoặc không thể expose an toàn.
7. **Return a complete machine pack:** Portal phải có thể generate storage, adapters, BFF contracts, fixtures và tests từ return pack mà không hỏi lại từng relation.

---

## 3. Non-goals và điều cấm

Request này không yêu cầu:

- mở generic SQL endpoint;
- gửi schema/database credentials;
- gửi raw business rows vào Git;
- expose Redis inspect;
- browser gọi AWS-HK trực tiếp;
- copy broker payload không redaction;
- biến SGP thành execution authority;
- dựng dữ liệu giả để lấp màn hình;
- suy diễn order lifecycle từ một current row rồi gọi đó là deterministic replay;
- coi absence là zero;
- coi response page hết rows là full population nếu chưa có exact total/coverage;
- unhalt Paper/Sandbox/Live chỉ để UI có animation;
- deploy runtime khi chưa có owner-approved release window;
- trả một giant unbounded response.

---

## 4. Mandatory execution stages

### Stage E0 — Deployed truth capture

### Work

Trước khi đọc source semantics, ghi nhận chính xác runtime đang chạy:

- Trading System commit.
- Manager/source facade commit.
- Portal Execution Edge commit.
- Container image digests.
- Source catalogue revision/digest.
- Serving-policy revision/digest.
- Enabled profiles.
- Enabled relations.
- Runtime flags liên quan read, history, event stream, SSE, commands.
- Database schema/migration revisions.
- Time of capture bằng `UtcEpochMs`.
- Current source high watermarks/cursors nếu có.

### Output

```text
DEPLOYED_RUNTIME_MANIFEST.json
```

### Gate

Không dùng code checkout khác version để kết luận runtime behavior.

---

### Stage E1 — Maximum source/database census

#### 4.1 Phạm vi discovery bắt buộc

Đi qua tất cả source surface có thể chứa execution truth hoặc dữ liệu cần cho Portal:

- relational databases;
- schemas, tables, views, materialized views;
- append-only journals;
- outbox tables;
- audit/history tables;
- event stores;
- command ledgers;
- reconciliation ledgers;
- accounting/performance snapshots;
- producer-owned read models;
- source service APIs;
- market-data service APIs;
- file/object artifacts được database tham chiếu;
- operational status tables;
- persistent queue/dead-letter metadata nếu liên quan incident/replay;
- Redis chỉ khi đó là source operational authority đã được xác định, không trả raw keys/payloads vào Git.

Không dừng ở 96 relation hoặc current `manager-v2` catalogue.

#### 4.2 Với mỗi relation/source operation phải trả

| Nhóm | Field bắt buộc |
|---|---|
| Identity | source system, database, schema, relation/view/API, source owner |
| Kind | table/view/materialized view/event stream/current projection/snapshot/ledger |
| Authority | execution/accounting/risk/broker/market/derived/operational |
| Mutability | immutable append, mutable current row, versioned event, periodic snapshot |
| Keys | primary key, unique keys, stable event/fact ID |
| Ordering | event sequence, timestamp ordering, tie-break key |
| Time | all timestamp columns, units, precision, clock authority, timezone semantics |
| Scope | mode, venue, profile, deployment, strategy, portfolio, account, session, instrument |
| Lineage | parent keys and join cardinality |
| Columns | complete column inventory, type, nullable, semantic meaning |
| Data quality | duplicate count, null rates, orphan counts, invalid enums |
| Volume | row count, bytes, 1h/24h/7d/30d rates, observed peak |
| Freshness | latest business/event timestamp, producer cadence, source lag |
| Retention | earliest available data, purge policy, partitioning |
| Change semantics | insert/update/delete/correction/tombstone behavior |
| Queryability | indexes, keyset capability, exact resource filters, full-range support |
| Publication | current route/relation, contract revision, page/frame limits |
| Portal usefulness | required now, derivable, future-useful, unsafe/secret, irrelevant |
| Empty semantics | complete empty, producer inactive, no activity, not implemented, unavailable |

#### 4.3 Output

```text
SOURCE_SYSTEM_INVENTORY.json
DATABASE_RELATION_CENSUS.csv
COLUMN_SEMANTICS_CATALOG.csv
SOURCE_LINEAGE_GRAPH.json
PROFILE_MODE_VENUE_COVERAGE.json
```

### Gate

```text
unclassified_relevant_relations = 0
unclassified_timestamp_columns = 0
unclassified_mutability = 0
```

---

### Stage E2 — Domain-by-domain exploitation audit

Bên Execution Edge phải kiểm tra tối thiểu các domain dưới đây. Danh sách này là **minimum**, không phải maximum.

#### 4.4 Alpha, strategy, deployment và artifact

Tìm và trả:

- alpha/strategy identity;
- versions and artifact digest;
- deployment lifecycle;
- stage/mode/venue;
- config revision;
- parameter/reference artifact;
- research run linkage nếu được publish;
- activation/deactivation timestamps;
- ownership/trader;
- strategy-to-account/portfolio mapping;
- status/state reason;
- deployment replacement/supersession history;
- artifact metadata, retention và signed read reference.

#### 4.5 Portfolio, allocation và capital

Tìm và trả:

- portfolio definitions;
- effective-dated allocations;
- allocation changes;
- target/max capital;
- reservations;
- capital transfers;
- account/deployment membership by effective time;
- portfolio base currency;
- physical versus virtual capital;
- capital headroom;
- portfolio/account/deployment lineage;
- historical membership policy;
- portfolio equity source hoặc exact derivation inputs.

Không dùng current membership để restate lịch sử mà không khai báo.

#### 4.6 Accounts, balances, margin, bindings và sync

Tìm và trả:

- internal account;
- external/venue account;
- binding identity;
- account status;
- balance by currency;
- free/locked/total cash;
- buying power;
- margin initial/maintenance;
- collateral;
- account sync;
- broker sync;
- credential metadata **không chứa secret**;
- last successful sync;
- sync errors;
- broker/account heartbeat;
- venue-account lifecycle;
- orphan/cross-family rows;
- complete empty-state reason.

#### 4.7 Positions và exposure

Tìm và trả:

- current positions;
- position lifecycle nếu có;
- signed quantity;
- average open/close;
- realized/unrealized PnL;
- mark/index/last price provenance;
- notional;
- long/short exposure;
- instrument;
- open/close timestamps;
- position version;
- physical/virtual/reserved exposure;
- peak quantity;
- liquidation/margin information nếu có;
- exact link tới orders/fills/risk decisions.

#### 4.8 Orders, fills và conditional orders

Tìm và trả:

- current order rows;
- immutable order state transitions;
- submit/source ack/broker ack/terminal timestamps;
- cancel/replace/amend lifecycle;
- reject codes/messages;
- risk grant;
- client/venue order IDs;
- conditional order groups/legs;
- fill facts;
- fee/commission;
- liquidity side;
- trade ID;
- trade time;
- partial fills;
- late/corrected fills;
- order-to-fill causal linkage;
- dedupe/replay semantics.

#### 4.9 Execution sessions và cycles

Tìm và trả:

- execution session ID;
- cycle key;
- started/updated/completed;
- state transitions;
- counts by funnel stage;
- producer/service version;
- reason for no activity;
- heartbeat;
- session errors;
- per-session source completeness;
- link to deployment/account/strategy.

#### 4.10 Signal, sizing và risk

Tìm và trả:

- signal intent;
- sizing request/decision;
- requested versus approved quantity;
- sizing constraints;
- risk check request;
- risk decision;
- risk grant;
- reject/limit/breach reason;
- risk rule/limit ID;
- pre/post exposure;
- account/deployment/portfolio risk snapshots;
- risk configuration revision;
- kill-switch state transitions;
- risk breach lifecycle;
- concentration/leverage/margin limit;
- operator override/waiver evidence nếu authority nằm ở Trading System;
- clock authority and precision.

Aggregate counters không thay thế event-level risk decisions nếu event source tồn tại.

#### 4.11 Accounting, equity, performance và valuation

Tìm và trả:

- cash;
- fees;
- funding;
- realized/unrealized/gross/net PnL;
- equity;
- drawdown;
- notional;
- fill counts;
- account/deployment/instrument/portfolio snapshots;
- accounting ledger/events nếu có;
- capital flows;
- snapshot reason;
- state/input digest;
- mark price;
- mark source;
- mark timestamp;
- valuation formula revision;
- correction/restate semantics;
- currency and FX policy.

Đặc biệt điều tra mark/PnL oscillation đã ghi nhận, và trả provenance đủ để Portal không phải đoán.

#### 4.12 Reconciliation, incidents và operational truth

Tìm và trả:

- reconciliation findings;
- lifecycle open/ack/resolved;
- expected versus observed;
- severity;
- affected account/order/fill/position;
- remediation command;
- source heartbeat;
- data staleness;
- dead-letter/retry state;
- command ambiguity;
- service health;
- broker connectivity;
- operational kill-switch state;
- error codes;
- incident evidence linkage.

#### 4.13 Commands và terminal verification

Tìm và trả:

- command accepted/dispatched/acknowledged/terminal events;
- idempotency key;
- command capability;
- target version;
- payload digest;
- source/broker receipts;
- terminal verification;
- uncertain/partial state;
- retry/reconciliation policy;
- operator/approver identities dưới dạng safe references;
- command-to-order/session/reconciliation links.

#### 4.14 Market context

Tìm và trả hoặc adapt:

- latest ticks;
- mark/index/last;
- OHLCV candles;
- instrument master;
- contract multiplier;
- tick/lot size;
- trading calendar;
- session/auction windows;
- holidays;
- benchmark series hoặc exact derivation inputs;
- venue timezone;
- data revision;
- source timestamp;
- candle completeness;
- VNM order/session constraints.

Không mở missing-capability request cho dữ liệu đã có ở Data Layer/market services trước khi Edge xác nhận không thể consume/adapt.

---

### Stage E3 — Screen/field/action source coverage

#### 4.15 Screen inventory tối thiểu

Map dữ liệu vào toàn bộ execution loop hiện tại:

1. Shell/registry.
2. Approval Inbox.
3. Gate R1.
4. Gate R2.
5. Conditions/Waivers.
6. Paper Overview.
7. Paper Workbench.
8. Paper Exit Review.
9. Full Blotter.
10. Alpha Fleet.
11. Alpha 360.
12. Portfolio 360.
13. Account 360.
14. Accounts & Bindings.
15. Sandbox Overview/Workbench/Certification/Exit.
16. Canary Overview/Control Room/Drift/Rollback.
17. Live Overview/Workbench/Full Operations.
18. Operations Queue.
19. Incident Detail.
20. Command Center.
21. Trade Replay.
22. VNM-specific execution workbench.

#### 4.16 Required mapping grain

Không trả một row chung cho cả screen. Mỗi row phải là:

```text
screen_id
panel_id
frontend_field_path
visible_meaning
required_or_optional
source_system
source_relation_or_operation
source_columns
primary_resource_key
join_path
authority
mutability
delivery_class
history_requirement
freshness_requirement
formula_id
formula_version
currency_policy
timestamp_policy
edge_operation
portal_derivation_allowed
current_status
missing_reason
owner
```

#### 4.17 Delivery class

Mỗi field/panel phải thuộc đúng một class:

```text
AVAILABLE_DIRECT
AVAILABLE_DERIVED_AT_EDGE
AVAILABLE_DERIVED_AT_PORTAL
EXISTS_NOT_PUBLISHED
EXISTS_BUT_SEMANTICS_UNRESOLVED
EXISTS_BUT_NOT_SAFE_TO_EXPOSE
SOURCE_DOES_NOT_EXIST
OWNER_ACTION_REQUIRED
```

Không để blank hoặc `TBD` không owner.

#### 4.18 Action support

Với mỗi button/action cần execution truth, trả:

- capability ID;
- required resource identity;
- source preconditions;
- current availability;
- disabled reason;
- plan/apply/verify contract nếu là command;
- return/terminal evidence target.

### Output

```text
SCREEN_FIELD_SOURCE_COVERAGE.csv
ACTION_CAPABILITY_COVERAGE.csv
DERIVED_METRIC_FEASIBILITY.csv
```

### Gate

```text
unmapped_required_frontend_fields = 0
unmapped_execution_actions = 0
```

---

### Stage E4 — Canonical source contracts

#### 4.19 Time contract

Tất cả wire/event/history/chart timestamp mới phải dùng:

```text
UtcEpochMs = Unix epoch milliseconds in UTC
```

Quy tắc:

- JSON: integer `int64`.
- Rust: newtype, không raw `i64` trôi nổi.
- TypeScript: branded type.
- Python/NumPy adapter: normalize UTC rồi chuyển `datetime64[ms]`.
- Date-only session calendar có thể dùng `YYYY-MM-DD`, nhưng phải có `venue_timezone`.
- Không trả native date string phụ thuộc locale.
- Không trộn second/microsecond/nanosecond mà không khai unit.
- Mỗi timestamp phải có semantic name: `event_time_ms`, `effective_at_ms`, `observed_at_ms`, `ingested_at_ms`, `source_ack_at_ms`, v.v.

#### 4.20 Decimal contract

Money, price, quantity, fee, PnL, rate và exposure dùng exact decimal string:

```json
{
  "value": "1000234.12000000",
  "currency": "USDT",
  "scale": 8
}
```

Không dùng IEEE-754 number cho financial truth.

#### 4.21 Identity and lineage contract

Mọi fact/event có các identity có thể áp dụng:

```text
profile_id
mode
venue
deployment_id
strategy_id
alpha_id
portfolio_id
account_id
binding_id
venue_account_id
execution_session_id
command_id
order_id
client_order_id
venue_order_id
fill_id
instrument_id
trace_id
correlation_id
causation_id
```

Không dùng heuristic “trùng hai trong bốn key”. Nếu source thiếu key, phải công bố exact immutable mapping hoặc typed lineage limitation.

#### 4.22 Full incremental event contract v2

MC-01 revision mới tối thiểu cần:

```yaml
schema_version: trading-system.portal-execution.incremental-events.v2
request_revision: portal.execution.trading-system-owner-request.v4

page:
  source_contract_revision: string
  source_epoch: string
  stream_id: string
  snapshot_high_watermark: string|null
  from_sequence: string|null
  to_sequence: string|null
  next_cursor: string|null
  earliest_available_cursor: string|null
  retention_floor_ms: UtcEpochMs|null
  has_more: boolean
  completeness: COMPLETE|PARTIAL|GAP
  resnapshot_required: boolean
  checksum: string
  events: Event[]

event:
  event_id: string
  source_sequence: string
  event_type: string
  operation: UPSERT|DELETE|CORRECTION

  event_time_ms: UtcEpochMs
  effective_at_ms: UtcEpochMs|null
  observed_at_ms: UtcEpochMs|null
  ingested_at_ms: UtcEpochMs|null

  entity_kind: string
  entity_id: string
  entity_version: string|null

  trace_id: string|null
  correlation_id: string|null
  causation_id: string|null

  profile_id: string
  mode: PAPER|SANDBOX|LIVE
  venue: string|null
  deployment_id: string|null
  strategy_id: string|null
  alpha_id: string|null
  portfolio_id: string|null
  account_id: string|null
  execution_session_id: string|null
  command_id: string|null
  order_id: string|null
  fill_id: string|null
  instrument_id: string|null

  payload_schema_version: string
  payload_digest: string
  payload: object
```

#### 4.23 Mandatory stream semantics

- stable event identity;
- monotonic source sequence hoặc exact ordered opaque token;
- snapshot high watermark;
- append/correction/delete semantics;
- replay/dedupe rules;
- late event behavior;
- cursor TTL;
- retention floor;
- gap detection;
- typed resnapshot;
- source epoch reset;
- frame checksum;
- pagination continuation tại tail;
- no silent restart from latest;
- durable resume from last ACK;
- coverage by entity/event kind.

#### 4.24 Minimum event coverage for full replay

```text
SIGNAL_INTENT_CREATED
SIZING_REQUESTED
SIZING_APPROVED
SIZING_REDUCED
SIZING_REJECTED
RISK_CHECK_REQUESTED
RISK_APPROVED
RISK_REJECTED
RISK_LIMIT_CHANGED
RISK_BREACH_OPENED
RISK_BREACH_RESOLVED
COMMAND_ACCEPTED
COMMAND_DISPATCHED
COMMAND_ACKNOWLEDGED
COMMAND_TERMINAL
ORDER_CREATED
ORDER_SUBMITTED
ORDER_SOURCE_ACKNOWLEDGED
ORDER_BROKER_ACKNOWLEDGED
ORDER_REJECTED
ORDER_REPLACE_REQUESTED
ORDER_REPLACED
CANCEL_REQUESTED
ORDER_CANCELED
ORDER_EXPIRED
PARTIAL_FILL
FILL
FILL_CORRECTED
POSITION_UPDATED
ACCOUNTING_UPDATED
EQUITY_SNAPSHOT
RECONCILIATION_FINDING_OPENED
RECONCILIATION_FINDING_RESOLVED
ALLOCATION_CHANGED
BROKER_SYNC_STATE_CHANGED
KILL_SWITCH_STATE_CHANGED
```

Bên Edge phải đánh dấu event nào:

```text
AVAILABLE
DERIVABLE
CURRENT_STATE_ONLY
NOT_RETAINED
SOURCE_ABSENT
```

---

### Stage E5 — Publication/adaptation implementation

#### 4.25 Nguyên tắc “existing data first”

Với mỗi required field/capability:

1. Nếu data đã có và current Edge publish được: mở rộng contract/add field.
2. Nếu data đã có nhưng chưa published: tạo typed view/adapter/read operation.
3. Nếu data nằm ở source khác trong Execution Cell/Data Layer: tạo source adapter.
4. Nếu data derive chính xác từ nhiều source: tạo derived operation với provenance.
5. Nếu chỉ có current row: publish current state và khai `CURRENT_STATE_ONLY`; không gọi là history.
6. Nếu event history tồn tại: publish append-all event/history contract.
7. Nếu source không tồn tại: tạo một owner request machine-readable duy nhất.

#### 4.26 Required read capabilities

Các route sau là preferred capabilities; equivalent routes được chấp nhận nếu schema/semantics tương đương:

```text
GET /portal/execution/v4/sources/catalog
GET /portal/execution/v4/sources/{source_id}/coverage
GET /portal/execution/v4/entities/{entity_kind}/{entity_id}
GET /portal/execution/v4/relations/{relation}/rows
GET /portal/execution/v4/history/{relation}
GET /portal/execution/v4/events
GET /portal/execution/v4/snapshots/{profile_id}
GET /portal/execution/v4/orders/{order_id}/timeline
GET /portal/execution/v4/traces/{trace_id}
GET /portal/execution/v4/deployments/{deployment_id}/execution-evidence
GET /portal/execution/v4/accounts/{account_id}/risk-evidence
GET /portal/execution/v4/broker-bindings/{binding_id}/exposure-population
GET /portal/execution/v4/health/publications
```

#### 4.27 No total-history cap

Mỗi history operation:

- có bounded `limit`;
- có opaque keyset cursor;
- có `has_more`;
- có source total hoặc `total_unknown`;
- có earliest/newest timestamp;
- có retention floor;
- có truncated flag;
- cho phép đọc hết qua continuation;
- không hardcode dừng tại 2.000/5.000/20.000/200 entries.

#### 4.28 Snapshot + tail bootstrap

Bắt buộc hỗ trợ:

```text
snapshot at high watermark W
→ backfill all accepted facts/events <= W
→ tail from W+1
→ durable ACK after SGP commit
→ resume after reconnect
→ resnapshot on typed gap/epoch change
```

#### 4.29 Current-state reducers

Đối với mutable entity:

- event/history append theo `event_id` hoặc `(entity_id, entity_version)`;
- current table/view upsert riêng;
- không dùng `ON CONFLICT DO NOTHING` trên entity ID để lưu lifecycle;
- corrections phải có provenance;
- source `updated_at` không thay thế authoritative event time.

#### 4.30 Existing-source adapter list cần xử lý riêng

Bên Edge phải xác nhận và implement/adapt khi source đã có:

- market candles;
- latest ticks/mark/index;
- venue/session calendar;
- VNM preload candles;
- benchmark derivation;
- exact Paper/Live twin join;
- instrument master;
- broker/account heartbeat;
- current/source health.

Chỉ chuyển sang missing-capability khi census chứng minh nguồn thực sự không tồn tại hoặc không thể dùng.

---

### Stage E6 — Domain-specific acceptance

#### 4.31 Equity/performance/accounting

Acceptance:

- full retained history queryable;
- account/deployment/portfolio/instrument scope exact;
- chart-ready compact series operation;
- raw facts vẫn queryable;
- mark provenance;
- capital-flow policy;
- currency policy;
- formula revision;
- correction/restate semantics;
- no 2.000 total cap;
- 30d/90d/all range coverage declared.

#### 4.32 Risk

Acceptance:

- current risk state;
- full available risk event history;
- decisions/grants/rejects/limits/breaches;
- exact deployment/account/portfolio links;
- config revision;
- requested versus approved quantity;
- source completeness;
- no-event is distinguished from zero rejects;
- raw facts plus derived rollup provenance.

#### 4.33 Orders/fills/Trade Replay

Acceptance:

- all orders/fills in retained range queryable;
- order lifecycle events preserved;
- cancel/replace/reject/ack/terminal stages;
- causal trace from signal/sizing/risk/command/order/fill/accounting/recon where source supports it;
- deterministic order/trace timeline digest;
- no `.slice(-200)` semantics;
- late/corrected event handling;
- virtualized cursor API support;
- broker/source clock authority.

#### 4.34 Accounts/bindings/exposure

Acceptance:

- full account/venue-account/binding population;
- balances/margin/sync;
- exact physical/virtual/open/reserved exposure;
- complete empty-state reason;
- no cross-profile orphan rows;
- exact parent-set integrity;
- current and history where available.

#### 4.35 Operations/reconciliation/commands

Acceptance:

- command lifecycle and terminal verification;
- reconciliation lifecycle;
- incident/evidence linkage;
- ambiguous command state preserved;
- service/publication health;
- owner decision separated from source availability;
- read and command identity separate.

#### 4.36 Market context

Acceptance:

- candles/ticks/calendar/instrument metadata;
- UTC epoch-ms;
- source authority and revision;
- trading session semantics;
- benchmark derivation provenance;
- no duplicate market authority if Data Layer already owns source.

---

### Stage E7 — Rust performance and resilience

#### 4.37 Architecture requirement

Latency/throughput-sensitive source/stream work phải nằm ở Rust Execution Edge, không dồn steady-state full-history polling vào TypeScript.

#### 4.38 Required mechanics

- Tokio async pipeline.
- Bounded channels.
- Batch by rows + bytes + max wait.
- HTTP/2 or equivalent framed stream.
- mTLS and delegated JWT.
- Compression.
- Sequence/gap validation.
- Dedupe.
- Backpressure.
- Separate live-tail and backfill lanes.
- Durable checkpoint.
- Restart resume.
- Typed overload/gap.
- No silent drop.
- Per-domain cadence rather than one global cadence.
- Browser fan-out phải được localize tại SGP; số browser không tăng AWS-HK reads.

#### 4.39 Benchmark outputs

Return:

- observed source peak rows/s and bytes/s;
- Edge extract/encode throughput;
- network throughput/RTT;
- SGP ingest throughput;
- end-to-end lag p50/p95/p99;
- batch/frame size sweep;
- CPU/RSS;
- error/reconnect/gap rates;
- backfill catch-up rate;
- 1/5/30-minute outage recovery;
- maximum safe concurrency;
- exact image/commit/config.

Không khóa performance SLO tuyệt đối bằng phỏng đoán; phải dựa trên measured workload và có headroom tối thiểu.

---

## 5. Return pack bắt buộc

Bên Execution Edge phải trả đúng cấu trúc:

```text
portal-execution-edge-maximum-data-return-v1/
├── MASTER_RESPONSE.md
├── owner-response.v2.json
├── DEPLOYED_RUNTIME_MANIFEST.json
├── SOURCE_SYSTEM_INVENTORY.json
├── DATABASE_RELATION_CENSUS.csv
├── COLUMN_SEMANTICS_CATALOG.csv
├── SOURCE_LINEAGE_GRAPH.json
├── PROFILE_MODE_VENUE_COVERAGE.json
├── SCREEN_FIELD_SOURCE_COVERAGE.csv
├── ACTION_CAPABILITY_COVERAGE.csv
├── DERIVED_METRIC_FEASIBILITY.csv
├── EVENT_CONTINUITY_REPORT.md
├── ORDER_FILL_REPLAY_CAPABILITY.json
├── RISK_DATA_CAPABILITY.json
├── ACCOUNTING_EQUITY_CAPABILITY.json
├── ACCOUNT_BINDING_CAPABILITY.json
├── MARKET_CONTEXT_CAPABILITY.json
├── PUBLICATION_HEALTH_CAPABILITY.json
├── SOURCE_PUBLICATION_PLAN.json
├── SOURCE_OWNER_GAPS.json
├── RELEASE_COMPATIBILITY_MATRIX.json
├── schemas/
│   ├── source-catalog.v1.schema.json
│   ├── relation-history.v1.schema.json
│   ├── incremental-events.v2.schema.json
│   ├── source-health.v1.schema.json
│   └── domain schemas...
├── fixtures/
│   ├── empty/
│   ├── populated/
│   ├── partial/
│   ├── stale/
│   ├── gap/
│   ├── duplicate/
│   ├── correction/
│   └── next-page/
├── benchmarks/
│   ├── SOURCE_RATE_WINDOWS.csv
│   ├── EDGE_STREAM_BENCHMARK.json
│   ├── CROSS_CELL_BENCHMARK.json
│   └── FAILURE_RECOVERY_REPORT.md
├── evidence/
│   ├── EVIDENCE_INDEX.md
│   └── sanitized summaries/digests only
└── MANIFEST.sha256
```

### 5.1 `owner-response.v2.json` minimum

```json
{
  "schema_version": "portal.execution.edge-owner-response.v2",
  "request_revision": "portal.execution.edge-maximum-data-request.v1",
  "captured_at_ms": 0,
  "source_commit": "",
  "edge_commit": "",
  "image_digest": "",
  "catalogue_digest": "",
  "serving_policy_digest": "",
  "capabilities": [
    {
      "capability_id": "",
      "status": "AVAILABLE_DIRECT",
      "operation": "",
      "schema_revision": "",
      "profiles": [],
      "earliest_available_ms": null,
      "latest_available_ms": null,
      "retention_floor_ms": null,
      "population_exact": false,
      "source_total": null,
      "history_semantics": "APPEND_ONLY",
      "timestamp_contract": "UTC_EPOCH_MS",
      "decimal_contract": "EXACT_DECIMAL_STRING",
      "known_limitations": [],
      "required_owner_action": null
    }
  ],
  "genuine_source_gaps": [],
  "portal_adapter_work": [],
  "runtime_activation_required": [],
  "return_pack_digest": ""
}
```

### 5.2 `SOURCE_OWNER_GAPS.json`

Chỉ chứa gap thật sau census:

```json
{
  "gaps": [
    {
      "gap_id": "MC-XX",
      "frontend_consumers": [],
      "why_existing_sources_are_insufficient": "",
      "minimum_required_contract": "",
      "source_owner": "",
      "priority": "P0",
      "blocks": [],
      "temporary_typed_state": "UNAVAILABLE"
    }
  ]
}
```

Không gộp adapter work của Portal/Edge vào source-owner gap.

---

## 6. Required status vocabulary

Không trả tự do kiểu “có vẻ có”, “probably”, “empty” hoặc “not wired”. Dùng:

```text
AVAILABLE_DIRECT
AVAILABLE_DERIVED_AT_EDGE
AVAILABLE_DERIVED_AT_PORTAL
EXISTS_NOT_PUBLISHED
EXISTS_BUT_SEMANTICS_UNRESOLVED
CURRENT_STATE_ONLY
EVENT_HISTORY_AVAILABLE
HISTORY_NOT_RETAINED
SOURCE_EMPTY_COMPLETE
PRODUCER_INACTIVE
PROFILE_INACTIVE
OWNER_ACTION_REQUIRED
SOURCE_DOES_NOT_EXIST
UNSAFE_TO_EXPOSE
CONTRACT_INCOMPATIBLE
```

Mỗi status phải có:

- reason code;
- evidence reference;
- as-of epoch ms;
- source revision;
- impacted screens;
- next owner/action;
- whether Portal can proceed.

---

## 7. Specific current items to reconcile

### 7.1 Scoped balances release

Trả:

- exact cause;
- current/next catalogue digest;
- current/next Edge image;
- source view/relation revision;
- parent integrity before/after;
- coordinated rollout order;
- rollback order;
- cursor continuity;
- Portal rebind prerequisite.

### 7.2 Portfolio equity

Trả một quyết định machine-readable:

```text
DIRECT_SOURCE_USABLE
DERIVED_ACCOUNT_SUM_REQUIRED
PER_SCOPE_PRODUCER_REQUIRED
```

Nếu dùng derived sum:

- effective-dated membership;
- currency policy;
- capital flow policy;
- formula revision;
- input completeness;
- source digest.

### 7.3 Cursor semantics

Xác nhận:

- current TTL;
- tail cursor behavior;
- next cursor at end;
- retention floor;
- gap on expired cursor;
- backward-compatible revision;
- retry/resume policy.

### 7.4 Marking/PnL oscillation

Trả:

- mark price;
- mark/index/last source;
- mark timestamp;
- instrument;
- position quantity;
- contract multiplier;
- valuation currency;
- formula revision;
- config revision;
- correction semantics;
- whether behavior is intended or defect.

### 7.5 Empty publications

Với `venue_accounts`, `margin_balances`, sync, conditional orders, reconciliation và các zero-row source khác, trả một trong:

```text
SOURCE_EMPTY_COMPLETE
NO_BUSINESS_ACTIVITY
PRODUCER_INACTIVE
PROFILE_INACTIVE
FEATURE_NOT_IMPLEMENTED
SOURCE_UNAVAILABLE
```

kèm cadence và last nonempty timestamp.

### 7.6 Existing-source market adapters

Xác nhận riêng cho:

- candles;
- latest ticks;
- venue calendar;
- benchmark;
- Paper/Live twin join;
- VNM data.

Không gọi tất cả là MC-01…09 nếu source đã tồn tại.

### 7.7 MC-01 v4

Phát hành machine request/response revision mới cho `event.full-incremental` theo §4.22–4.24.

---

## 8. Verification protocol

Mỗi capability delivered phải có evidence chain:

```text
source/database evidence
→ source contract/schema
→ Edge adapter/stream
→ cursor/sequence continuity
→ populated/empty/partial/gap fixtures
→ sanitized live probe
→ performance benchmark
→ release compatibility
→ Portal-consumable return pack
```

Sau khi Portal nhận, product closure tiếp tục:

```text
SGP durable ingest
→ current/history/derived read model
→ TypeScript screen BFF
→ frozen frontend
→ browser route/button/render evidence
```

Source publication **không tự động** đồng nghĩa screen complete.

---

## 9. Acceptance gates

Request này chỉ `ACCEPTED` khi:

1. Runtime manifest bind đúng image/commit/catalogue.
2. Tất cả relevant source relations được inventory.
3. Tất cả columns có type/time/meaning/sensitivity classification.
4. Tất cả frozen frontend required fields có source/derivation/typed absence.
5. Tất cả execution actions có capability mapping.
6. Orders/fills/risk/command lifecycle semantics được xác định.
7. Không còn total-history cap; continuation đọc được toàn retained population.
8. UtcEpochMs và exact decimal contracts được publish.
9. MC-01 v4 hoặc equivalent full-event contract được trả.
10. Existing-source adapters được phân biệt khỏi genuine source gaps.
11. Return pack validate theo schemas.
12. Fixtures cover empty/populated/partial/stale/gap/duplicate/correction/next page.
13. Performance/failure evidence bind đúng image.
14. Không có secret/raw business rows trong Git.
15. Release and rollback matrix đầy đủ.
16. Portal có thể bắt đầu implementation mà không cần đoán join/source/formula.

---

## 10. Work authorization boundaries

### Có thể làm ngay

- read-only runtime/database/source census;
- code inspection;
- contract/schema/fixture generation;
- Edge branch implementation;
- local/unit/integration tests;
- sanitized benchmarks;
- return pack;
- staged migration/view/adapter không active.

### Cần Bobby mở window

- production DB/view migration có runtime effect;
- source catalogue/policy activation;
- Edge image deployment;
- network/identity change;
- profile activation;
- unhalt;
- command activation;
- release to `dev`/`portal-dev`/production.

---

## 11. Handoff message to the Execution Edge agent

```text
Use this request as a discovery-and-publication contract, not as permission
to mutate production.

First inspect every authoritative database/source surface relevant to the
frozen Execution Portal. Do not stop at the current projection catalogue or
the existing MC-01..09 list. If useful data exists, classify and expose it
through typed, scoped, resumable contracts, or declare an exact derived
contract with provenance. Do not cap total history; use bounded frames and
cursor continuation. Do not infer lifecycle from mutable current rows.

Return the complete `portal-execution-edge-maximum-data-return-v1` pack.
Every required frontend field and execution action must map to a source,
derivation, or typed genuine absence. Separate Portal/Edge adapter work from
Trading System producer gaps. Use UTC epoch milliseconds on wire contracts,
exact decimal strings for financial values, exact lineage keys, and
snapshot-plus-tail semantics for full history/replay.

No source publication is product-complete until SGP storage, BFF, frozen
frontend and deployed-browser evidence consume it in the same vertical
phase.
```

---


## 12. Portal downstream work-order generation

Return pack phải đủ để Portal tự tạo backlog triển khai theo từng screen mà không hỏi lại source semantics. Với mỗi `SCREEN_FIELD_SOURCE_COVERAGE.csv` row, bên Edge phải cung cấp đủ dữ liệu để sinh:

```text
source adapter task
→ SGP append/current table migration
→ cursor/checkpoint task
→ reducer/derivation task
→ BFF field/panel task
→ generated contract/fixture task
→ frontend consumer assertion
→ runtime verification task
```

Mỗi row tối thiểu cần thêm:

- `edge_contract_revision`;
- `edge_operation`;
- `response_json_path`;
- `pagination_or_stream`;
- `source_epoch_field`;
- `cursor_field`;
- `sequence_field`;
- `dedupe_key`;
- `correction_key`;
- `retention_floor_ms`;
- `expected_cadence_ms`;
- `population_exactness`;
- `recommended_sgp_storage_kind`;
- `recommended_current_state_key`;
- `recommended_partition_time`;
- `recommended_derived_formula`;
- `frontend_state_when_absent`;
- `acceptance_fixture`;
- `live_probe_available`;
- `blocks_phase`.

Output thêm:

```text
PORTAL_DOWNSTREAM_WORK_ORDERS.json
```

Ví dụ:

```json
{
  "work_orders": [
    {
      "work_order_id": "EDGE_TO_PORTAL_PAPER_ORDER_EVENTS",
      "screen_ids": [
        "EXECUTION_PAPER_WORKBENCH_SCREEN",
        "EXECUTION_FULL_BLOTTER_SCREEN",
        "EXECUTION_TRADE_REPLAY_SCREEN"
      ],
      "source_capability_id": "event.full-incremental",
      "entity_kinds": ["ORDER", "FILL", "RISK_DECISION", "COMMAND"],
      "edge_operation": "GET /portal/execution/v4/events",
      "history_semantics": "VERSIONED_EVENT",
      "dedupe_key": ["source_epoch", "event_id"],
      "ordering_key": ["source_epoch", "source_sequence"],
      "sgp_storage_kind": "APPEND_ONLY_TYPED_EVENT",
      "current_reducer_required": true,
      "frontend_contracts": [
        "execution-paper.workbench.v2",
        "execution-blotter.v2",
        "execution-trade-replay.v2"
      ],
      "status": "EDGE_IMPLEMENTED",
      "known_limitations": []
    }
  ]
}
```

### Existing transport bounds

Current contracts may retain compatibility limits such as page rows, frame bytes, concurrency hoặc source admission rate. Những con số này chỉ là transport/operational controls:

- không được biến thành total-history cap;
- không được làm screen thiếu dữ liệu mà không có cursor/continuation;
- phải được benchmark và versioned;
- nếu không đủ cho backfill/live-tail, bên Edge phải đề xuất revision có evidence;
- không silent widen hoặc silent truncate.

---

## 13. Final status rule


Allowed completion ladder:

```text
DISCOVERY_COMPLETE
SOURCE_SEMANTICS_CONFIRMED
SCREEN_COVERAGE_COMPLETE
CONTRACT_PUBLISHED
EDGE_IMPLEMENTED
EDGE_SHADOW_VERIFIED
RETURN_PACK_ACCEPTED
DEPLOY_WINDOW_READY
RUNTIME_PUBLISHED
PORTAL_CONSUMED
PRODUCT_ACTIVE
```

Không dùng một mình:

```text
SOURCE_DONE
BACKEND_DONE
RELATION_AVAILABLE
INTEGRATION_COMPLETE
```

Một relation “available” nhưng chưa có full population semantics, cursor, lineage, time/decimal contract, fixtures và screen mapping vẫn chưa đủ để Portal xây đúng.
