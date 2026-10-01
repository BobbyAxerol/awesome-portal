# `enrich_analysis` — một service tính analytics từ dữ liệu thô QuantBT (Claude soạn, Bobby chốt hướng, 2026-10-01)

Giao cho Codex làm: xếp ở `CODEX_BACKEND_GAPS_2026-09-30.md` §13 (Đợt B6). Thay thế các yêu cầu rời BR-F4-09/10/11/14, BR-F6-01/02 và phần "last 30D" của D-AN-01 §1.3.

## 1. Quy tắc Bobby (không thương lượng)

1. **Nguồn là dữ liệu thô QuantBT.** Mọi số bắt đầu từ bảng thô đã seal (P05 `OBSERVATION`/`FOLD`, candle đã giữ, transition, child audit). Không lấy số từ chỗ nào khác, không bịa.
2. **Cái gì phải tính từ thô thì tính ở MỘT service** — tạm gọi `enrich_analysis`. Không để mỗi endpoint (Evidence, series, Library, Report, hub P04) tự tính một kiểu. Cùng một đường mã cho mọi lane và cho backfill seal cũ.
3. **Hiển thị all time.** Không cắt còn 30D/60D, không rolling làm số chính. Mọi con số/biểu đồ phủ toàn bộ cửa sổ OOS đã seal. Thẻ Library cũng all-time (sparkline all-time giảm mẫu giữ cực trị) — `last_30d` bỏ khỏi UI.
4. **UI/UX và contract chốt trước, rồi mới yêu cầu backend.** FE đã dựng sẵn phía đọc theo contract dưới đây với fixture đề xuất; backend làm cho khớp và gửi lại fixture chuẩn.

## 2. Service

- Tên: `enrich_analysis` (đề xuất: `apps/control-api/src/research/enrich-analysis/` + phần Python dẫn xuất ở `apps/portal/backend` nếu cần pinned QuantBT 1.1.1). Codex quyết vị trí.
- Vào: bảng thô đã seal của một run (cùng đầu vào AN-29: P05 OBSERVATION/FOLD, outer-OOS windows đã seal, candle giữ lại), kèm digest từng bảng.
- Ra: một khối `enriched_analysis` (§3), **bất biến, gắn digest**, lưu thành sidecar append-only như AN-29 (migration riêng). Seal cũ: operator backfill cùng service (dry-run/apply như AN-29); seal mới: sinh lúc seal.
- Mọi consumer đọc từ khối này: Evidence (S04), series `MONTHLY_RETURNS`/`RETURN_DISTRIBUTION`/… (đọc từ khối, nên **seal cũ cũng có**, hết `PORTAL_DERIVED_SERIES_SCOPE_NOT_OOS`), Library (thẻ S01), Report (S09, chỉ bổ sung, không viết lại lõi cũ), hub P04 (lane cố định dùng cùng service trên chuỗi equity mẫu của P04, có `lane`).
- Mỗi số có `origin` (`ENGINE_DIRECT` | `PORTAL_DERIVED`), `source_locator`, `input_digest`; thiếu đầu vào → `NOT_PUBLISHED` + mã lý do thật (không 0/—). Profit factor là mẫu return theo bar, không suy ra sổ giao dịch kiểm toán.

## 3. Contract `research.enriched-analysis.v1` (đề xuất — Codex quyết schema cuối)

Fixture đề xuất (số lấy từ R-WFO-023, KHÔNG phải output backend): `evidence/P21/enrich-analysis/enriched-analysis.proposed.fixture.json`. FE đọc đúng hình này.

| Khối | Nội dung | Ghi chú UI |
|---|---|---|
| `schema_version`, `service`, `basis` | `"research.enriched-analysis.v1"`, `"enrich_analysis"`, `"ALL_TIME"` | `basis` luôn `ALL_TIME`; UI từ chối nhãn khác |
| `run_id`, `input_digest`, `source_tables[{name,row_count,digest}]` | định danh + bảng thô đã dùng | tooltip nguồn |
| `scope` | `{window:"OOS", first_at_utc_ms, last_at_utc_ms, observation_count, fold_count, locator, benchmark_locator}` | nhãn "all time · OOS" |
| `windows` | `{is, oos, holdout}` mỗi cái `{state, reason_code}` | công tắc window của S04/S08; IS/Holdout vắng có mã (vd `QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT`, `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT`) |
| `facts.metrics`, `facts.behaviour` | đúng các Fact của analytics v2 (Sharpe, Sortino, CAGR, PF, hit rate, vol, skew, kurtosis, beta, corr, benchmark return, DD duration, sharpe decay; exposure L/S/F, win rate, payoff, hold, consecutive losses, turnover) | khối Behavior của S04 |
| `curves` | `{sampling:{source_observation_count, emitted_point_count, method}, strategy_rebased_100[], benchmark_rebased_100[], drawdown_fraction[]}` | "Strategy vs benchmark — all time" + đường drawdown dưới equity; giảm mẫu **giữ cực trị**, khai báo `method` |
| `monthly_returns` | `{state, reason_code, origin, includes_partial_months, values[{month_start_utc_ms, return_fraction, observation_count, expected_observation_count, partial, basis}]}` | **gồm tháng đầu/cuối một phần** (cờ `partial`); heatmap tháng |
| `return_distribution` | `{state, reason_code, origin, sampling, observation_count, bucket_basis, buckets[{lower_inclusive, upper, upper_inclusive, count}]}` | histogram |
| `drawdown_episodes` | `{state, reason_code, origin, total, values[{start_utc_ms, trough_utc_ms, recovery_utc_ms\|null, depth_fraction, duration_seconds}]}` (top 10 theo độ sâu) | bảng episode mới ở S04 |
| `library_summary` | `{label:"all time", basis:"ALL_TIME", state, reason_code, sparkline[], return_fraction, sharpe, max_drawdown_fraction}` | thẻ S01: sparkline + bộ ba all-time |
| `rolling` | **`null`** | không có rolling |

Chỗ phục vụ: `GET …/current-source/evidence` thêm `enriched_analysis` (giữ `summary_analytics_v2` một giai đoạn để tương thích, đánh dấu deprecated); Library item thêm `analytics_all_time` (= `library_summary`); series endpoints đọc từ khối; hub P04 thêm cùng khối ở `core`/`lane`.

## 4. Yêu cầu chuẩn cho backend (ER-01…10)

| Mã | Yêu cầu | Nghiệm thu |
|---|---|---|
| ER-01 | Service `enrich_analysis`: một hàm thuần từ bảng thô đã seal → khối §3; không I/O ngoài đọc bảng đã seal; không gọi HMD/engine | Test đơn vị trên fixture bảng thô; bất biến: cùng đầu vào → cùng `input_digest` và cùng khối byte-for-byte |
| ER-02 | Sidecar bất biến append-only (như AN-29): migration, guard UPDATE/DELETE, role runtime chỉ SELECT, digest xác minh khi đọc | PG test |
| ER-03 | Tháng một phần: `monthly_returns` gồm tháng đầu (cơ sở = vốn đầu hoặc quan sát OOS đầu) và tháng cuối, cờ `partial` + `observation_count` | R-WFO-023: tháng 7 **và** 8 (hiện chỉ có tháng 8) |
| ER-04 | Seal cũ hết bị từ chối: series MONTHLY/DISTRIBUTION đọc từ khối; backfill bằng CLI AN-29 mở rộng | R-WFO-020 và các run WFO cũ có hai panel |
| ER-05 | All-time: không `last_30d`/rolling làm số chính; `library_summary.sparkline` phủ cả OOS (≤ 64 điểm, giữ cực trị, khai báo `method`) | Library R-WFO-020/023 trả `analytics_all_time` |
| ER-06 | `drawdown_fraction` curve và `drawdown_episodes` (top 10, `total`) từ cùng chuỗi | Test với episode chưa hồi phục (`recovery_utc_ms:null`) |
| ER-07 | Fact thiếu đầu vào vẫn typed (`AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED`, …); `turnover_notional` và `sharpe_decay` của R-WFO-020 (hiện vắng dù v1 có turnover 11,646.76) tính được từ thô hoặc có mã lý do | Receipt |
| ER-08 | Hub P04: cùng service trên chuỗi equity mẫu của P04, `lane` ghi rõ, vắng có mã khi thiếu candle | R-P04-018 |
| ER-09 | Fixture canonical `research-enriched-analysis.*.valid.json` + OpenAPI + generated types (không sửa tay `.d.ts`); healthy / old-seal-absent / partial-month / no-benchmark | contracts test; FE đổi sang fixture chuẩn |
| ER-10 | Receipt trên preview thật: R-WFO-020 (seal cũ, backfill), R-WFO-023 (seal mới), một run P04 | `evidence/P13/` |

## 5. Dữ liệu khai báo run (cùng nguyên tắc: thô từ HMD/QuantBT)

Catalog dataset/symbol/timeframe cho S02 vẫn đi theo BR-F4-02…08 (coverage chính xác theo timeframe, metadata symbol, chất lượng dữ liệu, dataset/venue khác, tìm kiếm symbol, số bar theo window, ước lượng fold) — tất cả lấy từ reader HMD, không bịa phía Portal. BR-F4-01 (`1d`) đã đóng ở `83201af3`.

## 6. Phía FE (đã/đang làm trước khi yêu cầu này được giao)

Đọc `enriched_analysis` khi có và dùng nó thay cho series rời cho S04 (curve all-time, monthly, distribution, episodes), thẻ S01 `analytics_all_time` (nhãn "all time"; chưa có thì giữ `last_30d` đúng nhãn của nó, không đổi nhãn), S09 chỉ bổ sung. Khi backend giao, FE chỉ đổi fixture đề xuất → fixture chuẩn.

## 7. Góp ý contract từ phía UI sau khi dựng thử (2026-10-01, `evidence/P21/audit-2026-09-30/f4/S04_EA.md`)

1. `drawdown_episodes`: thêm cờ `longest_open` (hoặc `open_episode_present`) — khối Behavior cần biết "drawdown dài nhất còn mở" khi chỉ đọc từ khối.
2. `monthly_returns` fixture phải có ít nhất một tháng `partial: true` (đầu hoặc cuối) và một run chỉ một tháng (như R-P04-021) — thuộc ER-03/ER-09.
3. `return_distribution.buckets[].count`: chọn **một kiểu** (số nguyên). Fixture dùng số; type của hub hiện là chuỗi.
4. `windows.is`/`windows.holdout` có thể `AVAILABLE` nhưng khối chưa có payload cho chúng: nếu dự định phục vụ, thêm `facts`/`curves` theo window (`by_window`); chưa có thì giữ `NOT_PUBLISHED` + mã.
5. Vị trí khối ở hub P04: chốt đường (`core.enriched_analysis` hoặc top-level `enriched_analysis`, cùng tên với current-source) — FE đọc hub P04 từ top-level `summary_analytics_v2` hiện tại.
6. Đã dùng được ngay không cần đổi: hero Sharpe all-time ở hub P04 đọc từ `summary_analytics_v2.metrics.sharpe` (R-P04-021 trả 0.744).

