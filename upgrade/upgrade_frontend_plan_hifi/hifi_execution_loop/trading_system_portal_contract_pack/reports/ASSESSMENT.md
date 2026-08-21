# ASSESSMENT — Trading System so với yêu cầu Portal (handoff §1–§6)

> ⚠ **Superseded in part by [PHASE-F.md](PHASE-F.md) (2026-08-21).**
> Phase F re-derived every claim mechanically and found six errors in this document.
> Where the two disagree, Phase F and [`../extract/`](../extract/) are authoritative.
> Specifically corrected here: `aggregate_version` is PARTIAL not CHƯA_ĐẠT (order groups have `expected_version` + 409 `VERSION_OR_STATE_CONFLICT`); `DENIED`/`CONFLICT` exist in the command-journal state machine; the 12-fact event catalog has exactly **one** runtime event type; cursor paging IS feasible via `/v1/events`; the command journal is running but `ROLLOUT=OFF` with 430 `DEAD` rows; and `X-API-Key` is **optional**, which makes the auth gap far larger than recorded here (TS-GAP-008).

> Ngày: 2026-08-20 | Nguồn: 5 phase discovery (reports/PHASE-A..E.md) + runtime evidence
> Thang đánh giá: `ĐẠT` / `ĐẠT_MỘT_PHẦN` / `CHƯA_ĐẠT` — kèm evidence và deep-dive cần làm

---

## 1. So với §2 — Authority và phạm vi tuyệt đối

**Kết luận: ĐẠT 100%.** Mọi quyền Trading System sở hữu đều được xác nhận runtime:

| TS sở hữu | Bằng chứng |
|---|---|
| order/risk/execution decision | executor + risk_engine + engine_authority (BLOCKED/FAILED fail-closed), preflight |
| paper matcher và working-order authority | paper_execution_service (internal matcher), execution_sessions |
| canonical orders/fills | `orders`, `fills` (hypertable) — binance_fills/alpha_positions chỉ legacy projection |
| account, position, balance, reservation, ledger | `accounts`, `positions`, `account_balances`, ledger — canonical |
| strategy deployment runtime | 47 alphas registered, 12–13 paper chạy, trading-state admin |
| broker binding, sync, reconciliation | broker_sync_state_history, broker-bindings API, reconciliation service |
| command journal, ACK/fill evidence, operational truth | command_dispatch/execution_command/copy_event outboxes, journal, replay |
| broker credentials | credential_ref scoped `binance:{mode}:{external_account_ref}` — không lộ |

Các điều cấm Portal (§2.3) — hiện trạng TS tương thích: TS **không expose** internal DB/Redis cho Portal (chỉ API + snapshot query); không có endpoint nào để Portal "suy FILLED từ quantity" vì status state machine đầy đủ (FILLED/PARTIALLY_FILLED/…); `202` chỉ xuất hiện ở operation/replay jobs (không phải terminal) — đúng chuẩn Portal yêu cầu phân biệt.

---

## 2. So với §5.1 — Query API baseline

| Baseline dòng | Đánh giá | Bằng chứng | Deep-dive |
|---|---|---|---|
| HTTPS + JSON | `ĐẠT` (JSON; TLS là trách nhiệm edge/WireGuard — nội bộ HTTP) | OpenAPI 3.1, runtime 200 | — |
| OpenAPI 3.1 | `ĐẠT` | 91 paths, semantic identical committed, sha256 canonical `5dabf1bb…` | — |
| Request/response versioned | `ĐẠT` | revision headers, 406 unsupported, /v1/contracts matrix | — |
| Cursor/keyset pagination | `CHƯA_ĐẠT` | chỉ `limit`; không cursor (TS-GAP-001) | DD-01, DD-06 |
| Server-side filter/range/downsample | `ĐẠT_MỘT_PHẦN` | filter theo account/mode/venue/symbol + history range có; **downsample chưa có** (snapshot hypertables thô) | DD-01 |
| Envelope `as_of` | `ĐẠT` | response ts / snapshot ts / health ts | — |
| Envelope `source_sequence` | `ĐẠT_MỘT_PHẦN` | **không global sequence**; có event_id (domain_events), sequence_id (outbox), updated_at — Portal projection tự duy trì | DD-02 |
| Envelope `aggregate_version` | `CHƯA_ĐẠT` | không có aggregate version trong response; Portal tự tính từ projection | — |
| Envelope `authority` | `ĐẠT` | /v1/health/capabilities rollout_state + revision | — |

---

## 3. So với §5.2 — Durable event relay

| Baseline | Đánh giá | Bằng chứng | Deep-dive |
|---|---|---|---|
| Transactional outbox | `ĐẠT` | `copy_event_outbox` (+ domain_events, command/execution outboxes), at-least-once, dedupe copy_event_id, sequence_id | — |
| Versioned event | `ĐẠT` | schema_version + canonical_contract_version (domain_events), schema_version (outbox) | — |
| Authenticated relay | `CHƯA_ĐẠT` (cho chuẩn §6.6) | outbox→Redis stream không auth riêng (network scoped); Portal bị cấm đọc/ghi Redis trực tiếp (§2.3) → **cần relay qua API hoặc owner-approved adapter** | DD-02 |
| Nguồn đọc cho Portal | `ĐẠT_MỘT_PHẦN` | `/v1/events`, `/v1/admin/events`, replay API tồn tại — chưa verify response shape/ordering | DD-02 |
| Traffic thực | `CHƯA_ĐẠT` (chứng minh end-to-end) | `copy:events:v1` chưa tồn tại (XINFO no such key) — chưa có copy event từ migration (TS-GAP-002) | DD-08 (chờ traffic) |

---

## 4. So với §5.3 — Browser realtime

| Baseline | Đánh giá | Bằng chứng | Deep-dive |
|---|---|---|---|
| REST snapshot khi kết nối | `ĐẠT` | query API current-state đủ (positions/orders/performance/sessions) | — |
| SSE/WebSocket fan-out | `CHƯA_ĐẠT` ở TS (không WS/SSE trong 91 paths) | — **Portal edge tự build** (đã nằm trong portal-execution-edge-rs); TS chỉ cần cung cấp nguồn delta | DD-02 |
| snapshot → cursor/sequence → delta | `ĐẠT_MỘT_PHẦN` | nguồn cursor: event_id (domain_events) + sequence_id (outbox); gap resync qua replay API | DD-02 |
| Gap bắt buộc resync | `ĐẠT` | /v1/admin/replay/* + /v1/replay/* (order-lifecycle, events, compare, jobs) | — |
| Bounded queue/backpressure/slow-consumer | Portal-owned | — | — |

---

## 5. So với §5.4 — Admin command (PLAN → APPLY → VERIFY)

| Baseline | Đánh giá | Bằng chứng | Deep-dive |
|---|---|---|---|
| Portal gọi cùng Admin API CLI dùng | `ĐẠT` | CLI HTTP group gọi chính `/v1/admin/*`; Portal không cần shell | — |
| PLAN→APPLY→VERIFY đủ 3 bước | `ĐẠT_MỘT_PHẦN` | **chỉ `emergency-close` có đủ 3 bước** (plan/apply/verify runtime); `config` có plan+apply; các mutation còn lại (portfolio/account/risk/copy/deployments) **apply trực tiếp** — `PARTIAL` | DD-03 |
| Command evidence states (PLANNED/ACCEPTED/IN_PROGRESS/VERIFIED/PARTIAL/FAILED/DENIED/CONFLICT/EXPIRED) | `ĐẠT_MỘT_PHẦN` | có: operation_id states, replay jobs (PENDING/RUNNING/COMPLETED/FAILED), journal INCOMPLETE/BLOCKED, PARTIAL trên bracket/journal; **chưa thấy DENIED/CONFLICT/EXPIRED state machine công bố** | DD-03, DD-04 |
| `expected_aggregate_version` | `CHƯA_ĐẠT` | không có field này trong API hiện tại | DD-03 |
| idempotency_key | `ĐẠT` | idempotency_key + event_idempotency (payload hash) | — |
| actor/reason/approval | `ĐẠT_MỘT_PHẦN` | operator_operations + journal lưu actor/reason/approval; **chưa verify schema** | DD-03 |

---

## 6. So với §6 — Security architecture

| Mục | Đánh giá | Bằng chứng | Deep-dive |
|---|---|---|---|
| mTLS workload identity | `CHƯA_ĐẠT` (TS) — edge làm | TS chỉ X-API-Key/X-Admin-Token | — (Portal edge) |
| Delegated JWT verify | `CHƯA_ĐẠT` | TS không verify delegated actor assertion (TS-GAP-003) — Portal edge giữ actor/audit, báo gap | — |
| Allowlist service account riêng cho Portal | `KHẢ_THI` — chưa tạo | gate:apikeys allowlist per-key; **cần owner approval** (mutation) | Owner decision #1 |
| DB read-only role (§6.7) | `KHẢ_THI` — chưa approve | 94 tables canonical; SELECT-only role + allowlist view khả thi không sửa source; **OWNER_DECISION_REQUIRED** | Owner decision #2 |
| Event relay auth (§6.6) | Portal-owned | TS chỉ cần nguồn API/events | DD-02 |
| Admin credential riêng cho Portal edge | `KHẢ_THI` — chưa tạo | X-Admin-Token riêng, allowlist endpoint | Owner decision |

---

## 7. Tổng kết: ĐẠT / CHƯA_ĐẠT và deep-dive cần làm

### Trading System hiện đạt
- Authority §2: **đạt đầy đủ** — không cần đổi gì.
- Query API lõi: OpenAPI versioned, snapshot/filter/range, as_of/authority — **đạt**; chỉ thiếu cursor pagination.
- Outbox/event schema + dedupe/ordering/DLQ: **đạt về thiết kế** — chưa có traffic để chứng minh end-to-end.
- Admin API cho Portal (không shell, không CLI string): **đạt**; PLAN/APPLY/VERIFY đầy đủ chỉ ở emergency-close, phần còn lại PARTIAL.

### Chưa đạt (gap chính cho Portal)
1. **Cursor pagination** (orders/fills) — Full Blotter (TS-GAP-001)
2. **Event relay nguồn authenticated** — Portal không được đọc Redis trực tiếp; cần relay qua API/replay (TS-GAP-002 liên quan)
3. **Delegated actor assertion** — TS không verify (TS-GAP-003) — edge giữ audit
4. **expected_aggregate_version + state machine DENIED/CONFLICT/EXPIRED** cho admin command
5. **Traffic copy events chưa có** — không chứng minh được ordering/gap thực
6. **Live evidence UNKNOWN** (HALTED) — Canary/Live screens chỉ mock được

### Deep-dive tiếp theo (read-only, theo thứ tự ưu tiên)

| ID | Deep-dive | Mục đích | Sản phẩm |
|---|---|---|---|
| DD-01 | Đọc **response/param schema chi tiết** của orders/fills/positions/events trong openapi (components schemas) | Xác định keyset khả thi: filter from/to + (updated_at, client_order_id) làm cursor ở adapter Rust mà không cần sửa API? | Kết luận cursor adapter-side vs cần TS bổ sung param (→ owner decision) |
| DD-02 | Verify **/v1/events + /v1/admin/events**: response shape, ordering (event_id asc?), filter (time-range, alpha, type), page size | Định nguồn delta cho SSE/WS fan-out + cursor + gap resync | Event relay contract cho edge |
| DD-03 | Đọc **command request schema** của các admin mutation (idempotency_key? reason? actor? expected_version?) trong openapi | Map 9 evidence states §5.4 sang API hiện có; xác định missing field | Command contract map |
| DD-04 | Thống kê **status codes/202** từ openapi responses (operations, replay jobs, execution sessions) | Xác định endpoint nào 202-not-terminal — đúng chuẩn Portal | Bảng 202/terminal |
| DD-05 | **VN_MARKET_V1 calendar + LO/ATO/ATC** từ dnse adapter source + symbol universe | Paper Workbench VNM mapping chính xác | Venue capability VNM |
| DD-06 | Quyết định **cursor strategy** (adapter-side keyset vs TS-side cursor param) | Unblock Full Blotter | Owner decision |
| DD-07 | **Data layer kline missing (734) + queue drops** — đọc upgrade evidence + health history | Đánh giá capacity nếu Portal cần market data qua data_layer (P1) | Capacity report |
| DD-08 | Đo **payload size sanitized** khi có copy traffic đầu tiên (không đọc raw) | Sizing event relay (maxlen 500k, DLQ) | Sizing confirm |

### Owner decisions (chốt trước khi Portal implement)
1. Portal service account + API key allowlist (tạo key riêng)
2. Read-only DB role (§6.7) — approve hay không
3. Cursor strategy DD-06: adapter-side (không sửa TS) hay TS-side (cần approval sửa API)
4. Shadow order-command.v2@2.0.0 → authoritative?
5. Live-mode connect window
6. Observability profile (loki/grafana) bật hay không

**Kết luận chung:** Trading System đạt ~80% yêu cầu Portal ở mức contract; phần chưa đạt đều nằm ở **pagination, event-relay nguồn, delegated actor, aggregate_version** — tất cả đều giải quyết được ở **Portal edge (adapter) hoặc quyết định owner**, không cần sửa Trading System runtime trừ cursor strategy (DD-06).