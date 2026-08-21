# Phase D — Failure/Recovery, Test Environment, Evolution, Workload, Observability

> Handoff sections: 7.11, 7.12, 7.14 (P0) + 7.10, 7.13 (P1) | Status: `CONFIRMED_SOURCE`/`CONFIRMED_RUNTIME`/`ESTIMATE`

## 7.11 Failure/recovery behavior — `CONFIRMED_SOURCE`

| Cơ chế | Chi tiết | Evidence |
|---|---|---|
| Order submit retry | Retryable markers `TIMEOUT/TEMPORARY/UNAVAILABLE/CONNECTION/RESET/502/503/504/TOO MANY REQUESTS`; backoff theo attempt; batch + single retry tới max attempts; hết → dead letter | `services/executor/main.py:114-251,467` |
| Order uncertain | Sau retry hết hạn → `XADD order.uncertain` (stream) cho reconciliation xử lý | `executor/main.py:525`, `reconciliation/main.py:74` |
| Reconciliation service | Reconcile positions + open orders từ latest broker sync; paper reconcile; uncertain orders reconciliation | `services/reconciliation/main.py:29-74` |
| Copy outbox DLQ | Quá max attempts (10) → `copy_event_dead_letters`; commit Redis ID + reason vào DLQ; at-least-once + dedupe `copy_event_id` + `sequence_id` ordering | `COPY_TRADING_OUTBOX_GUIDE.md` |
| Command journal | State machine; `INCOMPLETE` detection khi thiếu chứng từ; `BLOCKED` fail-closed | `services/command_journal/retention.py` |
| Replay | `/v1/admin/replay/*` order lifecycle + events + compare; `execution_replay_jobs` status PENDING/RUNNING/COMPLETED/FAILED | `services/replay/`, `init-db/32-execution-replay-v2.sql` |
| Engine authority | `BLOCKED/FAILED` claims → `AUTHORITY_SCOPE_BLOCKED`; fail-closed trước khi submit | `services/engine_authority/` |
| Market data recovery | Data layer: reconnect_count + gap_detected/gap_fill metrics, outage tracking per shard | runtime health |

## 7.12 Safe integration/test environment — `CONFIRMED_RUNTIME` + `CONFIRMED_SOURCE`

- **Sandbox Binance testnet**: 35 accounts (`sandbox-binance-*`) share `external_account_ref=binance_testnet_main` (shared physical broker account model) — đang chạy, 4 clients connected, circuit closed, cooldown 120s (`CONFIRMED_RUNTIME`).
- **Paper**: 51 bindings paper (BINANCE + DNSE) — paper-binance là môi trường an toàn nhất cho Portal integration đầu tiên (không chạm broker/testnet shared).
- **DNSE**: VN market calendar `VN_MARKET_V1`, settlement `IMMEDIATE/VN_T_PLUS`; VN_DERIVATIVE paper-only; stream `MARKET_CLOSED` ngoài giờ.
- **Replay/backtest**: `REPLAY_V2_ENABLED=false` (default, `.env.example`), replay service + fixtures trong `services/replay/adapters` + `contracts/baseline/v1/representative-v1-contracts.json` (golden corpus).
- **Golden tests**: `tests/unit` + `tests/integration` (phase1..7, copy delivery, journal, bracket lifecycle, engine authority, venue identity, canonical projection…).
- Tổng quan config apply (EXECUTION_LOG 2026-08): portfolios=2, alphas=47, accounts=85, allocations=85, copy_publish_policies=80.

## 7.14 Contract evolution policy — `CONFIRMED_SOURCE`

- HTTP V1 authority = `contracts/openapi/trading-system-v1.json` (frozen baseline 2026-08-05, commit d4e05dc); runtime semantic-identical với committed (Phase A).
- Compatible V1 additions optional; thay đổi required-field/enum-semantic/status-code → bắt buộc major mới hoặc pinned revision; unknown canonical enum **fail closed**; unknown V1 optional field giữ hành vi frozen V1.
- Gateway sở hữu V1→canonical translation; downstream nhận đúng 1 authoritative V1 command.
- Unsupported pinned revision → **406**; không header → frozen V1 behavior.
- Shadow `order-command.v2@2.0.0` đang sau flag (`enabled=false`, sample_rate 1.0, 70 skipped) — chưa authoritative.

## 7.10 Workload/capacity profile — `ESTIMATE` (không load test)

- Host: 15.33GiB RAM, disk 59G (66% used lúc baseline 2026-08-05).
- **docker stats hiện tại** (snapshot 2026-08-20): gateway 31.86% CPU / 400.6MiB; live_data_executor 36.42% / 639.6MiB; data_layer_service 23.71% / 311.9MiB; còn lại < 100MiB/service. Tổng ~2.1GiB RAM / 16 containers.
- Data layer throughput runtime: 335,534,436 items published (~4 ngày uptime ≈ **~975 items/s trung bình**, đỉnh cao hơn nhiều; batch 140,000,250); queue drops 1,311,777 (backlog đỉnh) — capacity đang bị áp lực đỉnh nhưng không mất feed vĩnh viễn (16 shards connected).
- Kết luận cho Portal edge container: **ESTIMATE** — cần ~300–500MiB RAM + <1 vCPU cho phép xử lý copy/event stream ở tốc độ hiện tại; nếu subscribe full `copy:events:v1` ở mức 1k events/s thì cần producer backlog sizing (maxlen 500k ≈ 8 phút ở đỉnh) — khuyến nghị Portal dùng replay/backfill API cho catch-up thay vì tin vào buffer duy nhất.

## 7.13 Observability — `PARTIAL`

- `monitor_service` đang chạy: dead-letter writer, findings, streams, alerts (Ops).
- Structured JSON logs per service (Python logging); logs container stdout → có thể gắn loki/promtail/grafana (profile `observability` trong docker-compose.yml: loki 3.2.1, promtail 3.2.1, grafana) — **profile chưa được bật** (không container loki/promtail/grafana đang chạy) → `PARTIAL`.
- **Không có `/metrics` Prometheus endpoint** trong OpenAPI (91 paths) → `MISSING` nếu Portal cần scrape.
- Health: `/v1/health` (freshness + stale services), `/v1/health/capabilities`, data layer health chi tiết (shards/feeds/drops) — đủ cho monitoring cấp hợp đồng.