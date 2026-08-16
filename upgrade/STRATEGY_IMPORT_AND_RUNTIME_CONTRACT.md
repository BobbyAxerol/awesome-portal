# Strategy Import & Runtime Contract (QuantBT Portal)

> **Trạng thái:** Design note cho slice "Alpha/Strategy Import" (U14) — bổ sung,
> không thay thế guide v0.4/v0.5/v0.6.
> **Ngày:** 2026-08-16
> **Nguồn:** v0.4 §7.2 endpoint table, §9 alpha platform, `alpha.yaml` draft;
> code hiện tại: `apps/portal/strategy/` (specification, kernel),
> `portal_api/strategies/` (registry + adapter), `portal_api/adapters/quantbt.py`
> (QuantBTGateway), `registry/alphas.v1.json`, `registry/engine-capabilities.v1.json`.

## 1. Strategy được gọi từ đâu (hiện tại và sau import)

```text
UI (strategy picker)
  -> GET /api/strategies            (built-in registry projection)
  -> GET /api/v1/alphas             (imported alpha registry projection)
  -> POST /api/runs                 (payload mang strategy_id)
  -> PreflightService               (validate parameter space + capability)
  -> StrategyRegistry adapter       (generate_signals / build_walkforward_signal)
  -> QuantBTGateway                 (public QuantBTEndpoint chỉ, không internal kernel)
  -> strategy package / protected kernel (default) HOẶC imported alpha artifact (sau import)
```

Quy tắc:

- **Strategy mặc định `delta-rsi-polynomial-alpha` giữ built-in** trong
  `apps/portal/strategy/` (protected kernel) — không đổi, không replace.
- **Strategy import mới đi qua cùng một cổng adapter** — `StrategyRegistry`
  mở rộng `register/unregister` cho imported artifacts; **không tạo đường gọi
  riêng** và browser không bao giờ chạy code tùy ý (U14 quarantine pipeline).
- Portal chỉ nói chuyện với `QuantBTEndpoint` public factory (§7.1); không
  import internal kernel, không hardcode `backend="rust"`.

## 2. Contract bắt buộc — mirror chiến lược mẫu

Một strategy import hợp lệ phải cung cấp đủ field tương đương
`DELTA_RSI_SPECIFICATION` cộng phần khai báo endpoint/output:

| Field | Mẫu hiện tại (`delta-rsi-polynomial-alpha`) | Ghi chú |
|---|---|---|
| `strategy_id` | `delta-rsi-polynomial-alpha` | `^[a-z][a-z0-9-]{2,63}$`; ổn định, đổi ID = bản mới |
| `display_name` | `Delta-RSI Polynomial Alpha` | UI copy |
| `version` | `1.0.0` | SemVer; mỗi import bất biến |
| `default_timeframe` | `1h` | có thể ghi đè theo request hợp lệ |
| `required_columns` | `open, high, low, close, volume` | phải là tập con của OHLCV chuẩn hiện tại |
| `structural_contract` | polynomial_degree, long_entry, … | bất biến theo version, để audit |
| `parameter_space` | `{window: (20,60,2), rsi_l: (12,30,1), …}` | kind `int_range`/`float_range` (+ `categorical` dự phòng), luôn `(low, high, step)` |
| `entrypoint` | `strategy.delta_rsi:DeltaRsiStrategyAdapter` | thêm cho import: `pkg.module:Class` |
| `artifact.digest` | `sha256:<protected package digest>` | import phải có digest verify |
| `data_requirements` | crypto · OHLCV · timeframes [1h,4h,1d] · warmup 300 · point_in_time | từ `alpha.yaml` §9.3 |
| `determinism` | `seed_required: true, external_io: false` | lookahead/no-io smoke bắt buộc |
| `supported_endpoint_ids` | `["walk_forward"]` hiện tại | khai theo bảng §7.2, capability-gated |
| `execution_contracts` | `["close_target_v2"]` | v0.6 execution contract |
| `output_contract` | xem mục 3 | index/timestamps/columns bắt buộc |

## 3. Output contract — index, timestamps, schema

Mọi artifact từ strategy (built-in lẫn import) phải tuân:

- **Index**: `pd.DatetimeIndex` timezone-aware UTC, sắp tăng, không trùng lặp;
  `observed_at` ISO-8601 UTC ở mọi metadata/event.
- **Cột bắt buộc**: `required_columns` của spec + các cột tín hiệu do
  `input_kind` quy định (`target_signal` → cột target/position/signal; future
  kinds theo §7.2 input modes).
- **Per endpoint** (bảng §7.2): `walk_forward`/`train_test_split` → folds +
  selection trace + series theo segment; `signal_notional` → signal column +
  sizing/cost; `orders`/`fill_replay` → orders/fills schema; portfolio →
  weights/positions/rebalance; arbitrage → leg/package validation + rejection
  report. Strategy chỉ khai endpoint mà contract tests của nó cover được.
- **Metric**: do QuantBT endpoint tính — Portal không tính lại; UI hiển thị
  kèm `definition/unit/segment/source/as_of` (v0.6 §6).

## 4. Endpoint support matrix (khai báo, không suy đoán)

Theo §7.3: chỉ hiển thị capability khi `engine-capabilities.v1` của exact
release công bố, gắn trạng thái `STABLE | EXPERIMENTAL | SCHEMA_ONLY |
VALIDATION_ONLY | DISABLED`. Imported strategy phải:

1. Khai `supported_endpoint_ids` trong alpha manifest.
2. Có contract test per endpoint (determinism, no-lookahead, QuantBT smoke).
3. Được đăng ký vào capability registry trước khi preflight cho phép run.

Hiện tại release 1.0.8 đã certified cho `walk_forward` (three-window +
advanced); các endpoint khác trong §7.2 mở dần theo capability slice — một
strategy import vẫn có thể chỉ support `walk_forward` như mẫu hiện tại.

## 5. Import flow (U14, theo v0.5 §7 source→release discipline)

```text
Bobby/contributor push code + alpha.yaml (reviewed, dev)
  -> quarantine ingest (alpha registry, digest verify)
  -> hermetic build + lock/SBOM/secret/license scan
  -> contract tests: determinism / no-lookahead / QuantBT smoke
  -> signed publication -> register vào StrategyRegistry + capability manifest
  -> UI strategy picker thấy strategy mới; run bình thường
```

Không chấp nhận: import trực tiếp file từ browser; entrypoint tùy ý không qua
scan; strategy không có artifact digest.

## 6. Gap → slice đề xuất (U14 Alpha/Strategy Import)

1. `StrategyRegistry.register/import` + adapter cho imported artifact (cùng
   interface `generate_signals`/`build_walkforward_signal` như mẫu).
2. `POST /api/v1/alphas/import` (admin/owner-only, BFF sau này): validate
   `alpha.yaml`, verify digest, quarantine state, không execute code trong
   request loop.
3. Capability gate cho `supported_endpoint_ids` + preflight checks
   (`required_columns ⊆ frame`, timeframe ∈ `data_requirements.timeframes`,
   seed bắt buộc khi `determinism.seed_required`).
4. UI: strategy picker từ `/api/strategies` + `/api/v1/alphas` (built-in +
   imported), Import Wizard Flow A/B — Claude làm sau khi backend slice xong.
5. Test mẫu: import một strategy synthetic đủ field như `DELTA_RSI_SPEC` →
   xuất hiện ở `/api/strategies`, preflight pass, run qua `walk_forward` với
   fixture market, artifact cùng output contract; digest sai → quarantine.

> Ghi chú phân phối: tài liệu này là design note cho slice import strategy;
> khi codex duyệt sẽ chuyển thành deep dive `BAR-21_STRATEGY_IMPORT.md` và
> cập nhật vào Backend Architecture Guide + backend README.
