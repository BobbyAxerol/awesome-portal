# Khai báo dữ liệu của Run — hợp đồng dataset / symbol / interval từ HMD thô (Claude soạn, Bobby giao hướng, 2026-10-01)

Giao Codex làm: `CODEX_BACKEND_GAPS_2026-09-30.md` **§14 (Đợt B7)**. Hợp nhất và thay thế BR-F4-02…08 và BR-F3-01; cùng nguyên tắc với `ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md` (B6, đã nghiệm thu).

## 1. Vấn đề Bobby nêu

"Backend có thể trả rất nhiều endpoint, symbol, interval, nhưng điều kiện trong Run không phù hợp và frontend chưa hiện để khai báo đầy đủ." Đã đo trên preview thật (2026-10-01): `GET /api/v1/research/datasets` chỉ công bố **một** dataset `crypto-binance-1m` (BINANCE), 7 timeframe, 29 symbol (5 PERPETUAL + 24 QUARTERLY) với coverage **theo tháng** (`MONTH_PARTITION`). Người dùng không biết symbol nào có bar ở timeframe nào, từ ngày nào đến ngày nào, dữ liệu có lỗ hổng không, tick/lot/hết hạn là gì, ước lượng bao nhiêu fold, bao nhiêu bar mỗi window. Preflight là nơi duy nhất báo "thiếu" — sau khi đã khai báo.

## 2. Quy tắc

1. **Nguồn là HMD thô** (reader đã duyệt, layout `hive-symbol-year-month-v1`): mọi số về dữ liệu đọc từ metadata/partition của reader, không bịa phía Portal, không đoán từ tên symbol (ví dụ không parse `_YYMMDD`).
2. **Tính toán gom một chỗ:** cái cần dẫn xuất từ thô (coverage chính xác, chất lượng, bar mong đợi) tính trong **một** service dữ liệu (đề xuất `enrich_dataset_catalog`, cạnh `research_dataset_catalog`), có cache bất biến theo `catalog_revision`; GET không quét dữ liệu.
3. **Mọi vắng đều có kiểu** (`NOT_PUBLISHED` + mã lý do thật), không 0/rỗng giả. Mỗi fact có `origin` (`HMD_DIRECT` | `PORTAL_DERIVED`) và `as_of_utc_ms`.
4. **UI chốt trước:** S02 đã dựng bộ chọn (dataset · symbol có coverage · timeframe chip · coverage trên trục window); FE đọc các trường tùy chọn dưới đây và hiện khi có. Backend làm cho khớp rồi gửi fixture canonical.

## 3. Contract đề xuất `research.dataset-catalog.v2` (Codex quyết schema cuối)

| Khối | Nội dung | S02 hiện |
|---|---|---|
| `datasets[]` | thêm `asset_class`, `quote_currency`, `session_calendar`, `catalog_revision`, `as_of_utc_ms`; `timeframes[{timeframe, resolution_seconds, availability, reason_code}]` (từ vựng chuẩn `1d`) | hàng danh tính, chip timeframe có lý do |
| `datasets[]` nhiều phần tử | mọi dataset reader gắn được (venue/asset class khác): `availability` + `unavailable_reason` cho cái chưa mount | select nhiều dataset, hàng bị tắt kèm lý do |
| `symbols` phân trang | `GET /api/v1/research/datasets/{id}/symbols?q=&kind=&timeframe=&cursor=&limit=` → `{items, total, next_cursor}`; lọc theo `timeframe` chỉ trả symbol có bar ở timeframe đó | combobox tìm phía server khi `total` lớn |
| `symbols[].instrument` | `display_name`, `contract_kind`, `underlying`, `base`, `quote`, `settle_currency`, `tick_size`, `lot_size`, `contract_multiplier`, `listing_utc_ms`, `expiry_utc_ms` (QUARTERLY) | cột trong picker; chọn quarterly theo hạn |
| `symbols[].coverage_by_timeframe[]` | `{timeframe, first_bar_utc_ms, last_bar_utc_ms, bar_count, expected_bar_count, missing_ratio, gap_count, largest_gap_seconds}` (chính xác tới bar, mỗi timeframe) | thanh coverage đúng timeframe đang chọn; cảnh báo biên window; "n of m bars" |
| `symbols[].quality` | `{state, reason_code, gap_count, missing_ratio, duplicate_bar_count, as_of_utc_ms}` | chip chất lượng + tooltip |
| `profiles` (Atlas `portal_admission.profiles[]`) | theo profile: `trial_range{min,max,default}`, `seed_policy`, `fold_range`, `fold_granularity`, `timeframes_allowed`, `schedules_allowed`, `window_min_bars` | khoá ô trials/seed theo profile (02-15), nhãn "folds 2–16" |

## 4. Preflight / ước lượng (điều kiện của Run)

| Mã | Cần gì |
|---|---|
| DR-07 | **Bar theo window trước khi chạy:** `POST …/preflight` (hoặc dry-run) trả `windows{is,oos,holdout}{bars, first_bar_utc_ms, last_bar_utc_ms}` và `warmup{bars_required, bars_available_before_is}` — S02 hiện số bar thật cạnh mỗi dải |
| DR-08 | **Số fold ước lượng cho khoảng khai báo:** `planned_folds{count, basis, min_bars_per_fold}` theo `(is/oos/holdout window, schedule, granularity)`; vượt/không đủ → `reason_code` |
| DR-09 | **Điều kiện hợp lệ phục vụ sẵn:** `conditions[]{key, state, reason_code, observed, required}` (đủ bar, coverage phủ window, timeframe được khai, profile cho phép, seed/trials) để S02 hiện từng điều kiện ✓/✗ ngay khi khai báo, trước preflight đầy đủ |

## 5. Yêu cầu chuẩn cho backend (DR-01…10)

| Mã | Yêu cầu | Nghiệm thu |
|---|---|---|
| DR-01 | Service `enrich_dataset_catalog`: đọc metadata/partition HMD, dựng `coverage_by_timeframe` chính xác + `quality` + `instrument`, cache bất biến theo `catalog_revision`, GET không quét | test đơn vị trên layout giả; cùng input → cùng revision/byte |
| DR-02 | Từ vựng timeframe chuẩn (`1d`) xuyên suốt catalog, alpha declaration và preflight (đã đóng ở `83201af3`; giữ) | contracts test |
| DR-03 | Catalog nhiều dataset (mọi mount của reader; cái chưa mount → `unavailable_reason`) | preview: danh sách đủ mount |
| DR-04 | Endpoint symbols phân trang + `q`/`kind`/`timeframe` | PG/contract test; `total` đúng |
| DR-05 | `instrument` (tick/lot/multiplier/listing/expiry) từ HMD hoặc nguồn chính thức; thiếu → vắng có mã | BTCUSDT, BNBUSDT, `BTCUSDT_210326` |
| DR-06 | `quality` theo symbol×timeframe | một symbol có lỗ hổng thật hiện `gap_count>0` |
| DR-07 | Bar theo window + warmup trong preflight/dry-run | BTCUSDT 1h: IS/OOS/holdout khớp oracle độc lập |
| DR-08 | Ước lượng fold (`planned_folds`) cho khoảng khai báo | khớp số fold preflight/run thật |
| DR-09 | `conditions[]` phục vụ sẵn + `profiles[]` đầy đủ (thay `submission_constraints` cũ: trial 1 / seed null vs thực tế 400 / 42) | S02 khoá trials/seed đúng profile |
| DR-10 | Fixture canonical `research-dataset-catalog.v2.*.valid.json` (healthy, multi-dataset, partial-quality, symbol-absent) + OpenAPI + generated types; receipt trên preview thật tạo 1 run WFO + 1 run P04 hoàn toàn từ khai báo trong S02 | contracts test; receipt `evidence/P13/` |

## 6. Phía FE

S02 đã có: dataset identity, symbol combobox có coverage (tháng), timeframe chip (đủ dataset, lý do bật/tắt), coverage trên trục window, cảnh báo biên, route cards. FE đang thêm đọc các trường tùy chọn ở §3 (fixture đề xuất `evidence/P21/data-declaration/dataset-catalog.v2.proposed.fixture.json`, số lấy từ catalog thật, phần mới đánh dấu PROPOSED) và dùng `portal_admission.profiles` để khoá trials/seed (LW-07 đã giao). Khi backend giao, FE đổi fixture đề xuất → fixture chuẩn.
