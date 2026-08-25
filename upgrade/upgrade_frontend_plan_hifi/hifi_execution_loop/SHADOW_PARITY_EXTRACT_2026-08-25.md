# Parity — contract fixtures vs real extracts (EL-V2-09, 2026-08-25)

**Nguồn thật có sẵn trong repo:** `trading_system_portal_contract_pack/event-samples/*.json` (5 sự kiện) và
`error-samples/problems.v1.json` — extract từ Execution Cell AWS-HK, redaction PASS. **Chưa phải shadow epoch
BE-V2-F** (chưa giao); đây là parity ở mức mẫu sự kiện/lỗi, chạy bằng `apps/portal/frontend/scripts/shadow-parity.mjs`
trong image `node:22-alpine`. Không dòng lệch nào bị giấu; mỗi dòng có disposition.

## Bảng tổng

| Cặp | Kết quả |
|---|---|
| event.valid.json ↔ event-samples/fill.created.v1.json | 25 mismatch row(s) |
| event.valid.json ↔ event-samples/order.changed.v1.json | 26 mismatch row(s) |
| event.valid.json ↔ event-samples/position.changed.v1.json | 23 mismatch row(s) |
| event.valid.json ↔ event-samples/operation.changed.v1.json | 20 mismatch row(s) |
| event.valid.json ↔ event-samples/reconciliation.changed.v1.json | 20 mismatch row(s) |
| execution-command-relay-denied.valid.json ↔ error-samples/problems.v1.json | 9 mismatch row(s) |

## Disposition (mọi dòng lệch được giải thích)

| Nhóm lệch | Disposition | Việc phát sinh |
|---|---|---|
| `schema` — fixture có `aggregate_*`, `workspace_id`, `occurred_at`, `producer`, `traceparent`, `idempotency_key`, `payload`; sample có `trade_id`, `symbol`, `quantity`, `price`… | **Khác tầng, không phải lỗi:** `event.valid.json` là **envelope** sự kiện Portal (Control API), còn sample là **payload body** của Execution Cell. Parity thật phải so `envelope.payload` ↔ sample sau khi D4 mapper publish shape | ghi vào BR-EX-39 (dưới) — codex publish envelope+payload mẫu cho từng `event_type` |
| `value .schema_version` — fixture `1` (int) vs sample `"v1"` (string) | **Lệch thật cần quyết:** hai kiểu khác nhau cho cùng tên trường; reader Portal (`readGapReason`/SSE mapper) đọc `schema_version` như thế nào phụ thuộc mapper D4 | BR-EX-39 |
| `value .event_type` — `quant.run.progressed.v1` vs `fill.created` | fixture là sự kiện QuantBT (Research), sample là Execution — khác domain; SSE Execution subscribe `fill.recorded`… (edge names) chứ không `fill.created` (TS names) → **mapper đổi tên sự kiện** là việc của edge | ghi nhận; không đổi frontend |
| `error-samples/problems.v1.json` ↔ `command-relay-denied` | **Khác tầng:** problems.v1 là catalogue lỗi (envelope + examples), relay-denied là một quyết định cụ thể; hợp lệ so `examples[i]` ↔ fixture khi codex trỏ mapping | ghi nhận |
| `_provenance` chỉ có ở sample | metadata extract, không phải trường contract | bỏ qua trong lens `schema` khi chạy trên shadow (flag `--ignore _provenance` — thêm khi có epoch) |

**Kết luận:** 0 dòng lệch **không giải thích**; 1 lệch thật cần backend quyết (`schema_version` int vs string).
Parity trên **shadow epoch** vẫn chờ BE-V2-F.

## Chi tiết — fill.created

| lens | path | fixture | shadow |
|---|---|---|---|
| value | .event_id | "evt_01J2K3M4N5P6Q7R8S9T0A1B2C7" | "synth-ev-0002" |
| value | .event_type | "quant.run.progressed.v1" | "fill.created" |
| value | .schema_version | 1 | "v1" |
| schema | .aggregate_type | present | ∅ |
| schema | .aggregate_id | present | ∅ |
| schema | .aggregate_version | present | ∅ |
| schema | .workspace_id | present | ∅ |
| schema | .occurred_at | present | ∅ |
| schema | .produced_at | present | ∅ |
| schema | .producer | present | ∅ |
| schema | .traceparent | present | ∅ |
| schema | .idempotency_key | present | ∅ |
| schema | .payload | present | ∅ |
| schema | ._provenance | ∅ | present |
| schema | .trade_id | ∅ | present |
| schema | .client_order_id | ∅ | present |
| schema | .alpha_id | ∅ | present |
| schema | .symbol | ∅ | present |
| schema | .side | ∅ | present |
| schema | .quantity | ∅ | present |
| schema | .price | ∅ | present |
| schema | .fee_quote | ∅ | present |
| schema | .mode | ∅ | present |
| schema | .venue | ∅ | present |
| schema | .trade_time | ∅ | present |

25 mismatch row(s)

## Chi tiết — problems.v1

| lens | path | fixture | shadow |
|---|---|---|---|
| value | .schema_version | "execution.command-relay-decision.v1" | "problems-v1" |
| schema | .operation_id | present | ∅ |
| schema | .decision | present | ∅ |
| schema | .reason | present | ∅ |
| schema | .retry_allowed | present | ∅ |
| schema | .source_request_sent | present | ∅ |
| schema | .envelope | ∅ | present |
| schema | .examples | ∅ | present |
| schema | .empty_vs_unavailable | ∅ | present |

9 mismatch row(s)
