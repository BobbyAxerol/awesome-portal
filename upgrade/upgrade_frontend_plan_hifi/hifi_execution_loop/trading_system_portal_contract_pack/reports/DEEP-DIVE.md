# DEEP-DIVE — DD-01..05 (read-only, 2026-08-20)

> ⚠ **Superseded in part by [PHASE-F.md](PHASE-F.md) (2026-08-21).**
> Phase F re-derived every claim mechanically and found three errors in this document.
> Where the two disagree, Phase F and [`../extract/`](../extract/) are authoritative.
> Specifically corrected here: DD-05 `ATO`/`ATC` **are** declared in `OrderType` (but unimplemented); DD-05 `VN_T_PLUS` **is** fully implemented in trading_system; DD-01's "keyset not feasible" is too pessimistic — `/v1/events` gives an ascending time cursor.

> Bổ sung chi tiết contract cho Portal theo ASSESSMENT.md. Tất cả từ openapi runtime + source, không mutation.

## DD-01 — Schema params/responses list endpoints → keyset khả thi

| Endpoint | Filter thực tế (source) | Ordering | Limit | Cursor |
|---|---|---|---|---|
| GET /v1/orders | alpha_id/strategy_id, mode, venue/exchange, symbol | `ORDER BY updated_at DESC` | default 100 | **KHÔNG** |
| GET /v1/fills | alpha_id, mode, venue, symbol | `ORDER BY trade_time DESC` | default 100 | **KHÔNG** |
| GET /v1/positions | alpha_id, mode, venue, symbol, include_flat | (repository sort) | default 200 | KHÔNG |
| GET /v1/orders/{client_order_id} | path id + alpha/mode/venue/account | — | — | — |

**Kết luận DD-01:**
- OpenAPI **không khai báo query params** (91 paths đều vậy) — spec under-declared; filter thực tế nằm trong code (`main.py` query_params). Portal adapter phải dùng docs/source này, không thể tin spec param list.
- List orders/fills **không có from/to hay id> cursor** → keyset **KHÔNG khả thi adapter-side** qua API list. Các lựa chọn: (a) dùng event stream `/v1/events` (ASC, time-filtered) để build projection rồi query từ projection; (b) TS bổ sung param cursor (mutation, cần approval — Owner decision #3); (c) read-only DB adapter (Owner decision #2).

## DD-02 — /v1/events + /v1/admin/events (nguồn delta cho realtime)

- Handler: `/v1/events` (alpha-replay scope, route `events_read`) + `/v1/admin/events` (admin) → cùng `EventStoreRepository.query_domain_events`.
- Filters: `trace_id, client_order_id, alpha_id/strategy_id, account_id, mode, venue, event_type, from/ts_from, to/ts_to, limit` (default 500, **max 5000**).
- Ordering: **`ORDER BY event_ts ASC, created_at ASC`** — append-only replay order, lý tưởng cho relay.
- Cursor: dùng `from`/`to` (timestamptz) + tie-break `created_at`; response `{"status":"OK","events":[...],"count":N}`; event fields = domain_events columns (event_id, trace_id, causation_id, correlation_id, event_type, schema_version, producer, payload, canonical_contract_version, decision_digest…).
- **Kết luận DD-02:** nguồn delta cho SSE/WS fan-out = `/v1/events` với cursor time-based (from=last_event_ts). Gap resync = replay API. Không cần Redis. Portal không nên đọc Redis (cấm §2.3); authenticated relay qua API là đủ. Lưu ý: event_id không filter được trực tiếp → cursor dùng (event_ts, created_at); dedupe consumer bằng event_id khi nhận.

## DD-03 — Command schema admin mutations → map evidence states §5.4

- **OpenAPI không khai báo requestBody schema** cho mọi mutation (inline rỗng; chỉ 2 component schemas trong toàn spec) → contract-level evidence thiếu; validation nằm ở code (`engine.validate_*`, admin handlers).
- Order submit có `idempotency_key` + `DUPLICATE_ORDER_ID` reject (engine.py:192-297). Admin mutations (portfolio/state, trading-state, deployments, alphas/risk, copy policies, allocations): **không thấy idempotency_key/actor/expected_version** trong handler source → `PARTIAL/MISSING`.
- `trading-state` handler: state ∈ {ACTIVE, REDUCING, HALTED}, set thẳng Redis key `system:trading_state:{mode}:{venue}` — không journal, không plan/verify.
- **Kết luận DD-03:** evidence states §5.4: PLANNED/VERIFIED chỉ có ở emergency-close; ACCEPTED/IN_PROGRESS/FAILED có ở replay jobs + operations; PARTIAL có ở journal/brackets; **DENIED/CONFLICT/EXPIRED chưa có** (MISSING). `expected_aggregate_version` không tồn tại (MISSING). Portal edge phải tự map: command gửi kèm idempotency_key riêng của Portal + theo dõi state qua operation_id/replay_id, đừng giả định field TS.

## DD-04 — Status codes / 202-not-terminal

- Toàn bộ mutation endpoints khai báo `200` (+`422` validation) trong OpenAPI — **không 202** ở mức spec.
- Runtime exception duy nhất: `POST /v1/order-groups` trả **202** khi `submit=true` (async group submit), `201` khi không submit (main.py:791).
- Replay jobs + emergency-close trả 200 kèm `replay_id`/`operation_id` → trạng thái terminal theo dõi qua GET jobs/{id}, ops/emergency-close/{id} (PENDING/RUNNING/COMPLETED/FAILED).
- **Kết luận DD-04:** chỉ 1 endpoint 202 (order-groups submit); Portal rule "202 không phải terminal" áp dụng đúng cho endpoint này; mọi endpoint khác 200 = terminal/accept + theo dõi operation.

## DD-05 — VN market calendar + DNSE order types

- **Calendar VN (runtime source):** `data_layer/app/stream/dnse_ws.py:_is_market_open()` — Mon–Fri, tz UTC+7: **09:00–11:30, 13:00–14:30**; session status: MARKET_CLOSED / OPEN_HEALTHY / OPEN_STALE / BROKEN (health expose qua data layer /v1/health dnse_stream).
- **DNSE order types trong trading_system:** `[MARKET, LIMIT]` (config `allowed_order_types` per alpha) — **LO/ATO/ATC KHÔNG có** (`MISSING` trong gateway hiện tại).
- **Settlement:** paper_execution default `IMMEDIATE`; **VN_T_PLUS không có trong trading_system source** (DOCUMENTED_ONLY từ tài liệu cũ/legacy).
- **Kết luận DD-05:** Paper Workbench VNM hiện chỉ có MARKET/LIMIT trên DNSE paper; nếu HiFi cần LO/ATO/ATC → gap cần owner quyết (bổ sung order types là thay đổi Trading System, ngoài scope discovery). Calendar chuẩn = dnse_ws (UTC+7, 2 phiên).

## Tổng kết deep-dive

| ID | Kết luận | Unblock |
|---|---|---|
| DD-01 | Cursor adapter-side KHÔNG khả thi qua list API (không from/to/id>); dùng event projection hoặc quyết định owner | Full Blotter (TS-GAP-001) |
| DD-02 | `/v1/events` ASC + time-filter + limit 500/5000 = nguồn delta + cursor + resync hoàn chỉnh | SSE/WS fan-out, event relay |
| DD-03 | evidence states: chỉ PLANNED/VERIFIED (emergency-close), job states; DENIED/CONFLICT/EXPIRED + expected_aggregate_version MISSING | Admin command contract §5.4 |
| DD-04 | 202 duy nhất = order-groups submit; còn lại 200 + operation tracking | 202-not-terminal rule |
| DD-05 | VN calendar 09:00–11:30/13:00–14:30 UTC+7; DNSE chỉ MARKET/LIMIT; VN_T_PLUS không có | Paper Workbench VNM |

**Owner decisions mới phát sinh từ DD:** (a) cursor strategy (event projection vs TS-side cursor param vs DB adapter); (b) LO/ATO/ATC cho DNSE có cần không.