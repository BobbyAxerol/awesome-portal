# D-AN-01 — Portal tự tính analytics mô tả, trên toàn bộ run ("all time") — Bobby, 2026-09-30

**Quyết định của Bobby, thay thế mọi yêu cầu cũ gửi QuantBT cho các số này.** Thắng HiFi 04/09/01 và spec tương ứng ở những chỗ mâu thuẫn; không xoá critique/addendum cũ (A13.1).

## 1. Nội dung

1. **Không đòi QuantBT publish** các số phân tích mô tả (rolling Sharpe, beta/correlation với benchmark, Sortino, CAGR, profit factor, skew, excess kurtosis, hit rate, win rate, thời gian giữ lệnh, exposure, turnover…). QuantBT trả **dữ liệu thô** (equity/returns theo bar, daily returns, positions, diagnostics như turnover/phí, trades nếu route có); **Portal backend tự tính** bằng numpy (numba khi cần tốc độ), đơn giản, nhanh, có test.
2. **Mặc định là ALL TIME** — tính trên toàn bộ phạm vi của run (OOS đã khâu với WFO; OOS sau mốc P08 với fixed profile — cùng phạm vi `scoped_result` đang dùng cho `net_oos_return`). **Không có rolling 30D / 63D / 20-observation** ở các màn chi tiết.
3. **Ngoại lệ duy nhất — màn thu nhỏ** (thẻ Run Library S01, các sparkline/chip tóm tắt): được hiện **30 ngày gần nhất** (last-30D) để vừa thẻ; nhãn phải ghi rõ "last 30D".
4. **Ranh giới không đổi:** QuantBT vẫn là nguồn sự thật cho **PnL, fills, objective, tối ưu hoá, equity**. Portal chỉ **thống kê mô tả trên chuỗi engine đã phát ra** — không tái tính PnL, không dựng fill, không chấm objective. (Làm rõ luật `apps/portal/AGENTS.md` "do not reimplement objectives or PnL" — thống kê mô tả không phải PnL.)
5. **Trung thực:** mỗi số mang `origin: "PORTAL_DERIVED"`, `scope`, `source_locator` (chuỗi đầu vào), `input_digest`; dữ liệu đầu vào không đủ → typed absence với mã lý do riêng (vd `PORTAL_ANALYTICS_TOO_FEW_DAILY_RETURNS`), **không** bao giờ 0 thay cho null.

## 2. Danh mục số (all time, trừ khi ghi khác)

| Số | Đầu vào thô (đã có trong worker `research_retained_analytics.py`) | Ghi chú |
|---|---|---|
| Sharpe (annualised, 365) | `scoped.daily_returns` | đã có `full_report`; giữ ENGINE_DIRECT nếu engine trả, ngược lại PORTAL_DERIVED |
| Sortino | daily returns | downside deviation |
| CAGR | equity đầu/cuối + khoảng thời gian | |
| Max drawdown / thời gian hồi phục | equity | engine có MDD thì dùng engine |
| Volatility (annualised) | daily returns | |
| Skew, excess kurtosis | daily returns | |
| Beta, correlation với benchmark | daily returns + **benchmark = giá close HMD của chính symbol/timeframe của run** trên cùng phạm vi, cùng múi giờ | benchmark mặc định = buy-and-hold symbol của run; ghi `benchmark_locator` |
| Benchmark return (all time) | HMD close đầu/cuối phạm vi | |
| Exposure long / short / flat | positions (theo bar) | đã có exposure_fraction — tách L/S/F |
| Turnover | diagnostics.turnover | đã có |
| Hit rate long-bar / short-bar | positions × bar returns | |
| Profit factor, win rate, avg holding, payoff, max consecutive losses | trades nếu route có; **route `signal_notional`/close-target không có trade ledger** → tính trên **position episodes** (vào→thoát từ positions), nhãn rõ "episodes, not audited trades" | không giả làm trade |
| Monthly returns | equity resample tháng | đã có trên S04 |
| Phân phối return | daily returns | đã có (histogram) |

**Bỏ:** `rolling_sharpe_63` (retained-analytics v1), "Rolling 20-observation return" (S04 EChart 5), "rolling 63-day Sharpe · rolling beta" (S04 EChart 3). Chuỗi rolling chỉ còn cho màn thu nhỏ nếu cần (last-30D).

## 3. Điều chỉnh HiFi / spec (thắng bản cũ)

| Màn | Khối HiFi cũ | Thay bằng |
|---|---|---|
| S04 Evidence Flow · Summary | EChart 3 "rolling 30d Sharpe · rolling beta vs BTC" | **"Strategy vs benchmark — all time"**: equity chiến lược và benchmark cùng rebase 100 trên cùng phạm vi, kèm ô Beta / Corr / Sharpe / Sortino all-time |
| S04 | Ô Behavior (8 ô) | cùng 8 ô + Sortino/CAGR/PF/hit rate, **all time**, nhãn `portal-derived` |
| S04 | EChart 5 rolling 20-observation return | bỏ (phân phối return + monthly returns đã nói điều đó) |
| S04 | 15 ô headline | giữ 5 ô hero như HiFi; các số còn lại vào khối Behavior |
| S09 Run Report | các ô metric "not published" (Sortino, CAGR, PF, benchmark…) | số all-time portal-derived, cùng nguồn với S04 |
| S01 Run Library | sparkline / chip trên thẻ | **last-30D** (ngoại lệ màn thu nhỏ), nhãn "last 30D" |
| S06/S13 | per-candidate max drawdown, K/pool membership | **vẫn là engine** (nằm trong optimizer) — không thuộc D-AN-01 |

## 4. Ai làm gì

- **Codex (backend):** BR-AN-01 trong `CODEX_BACKEND_GAPS_2026-09-30.md` — module `research_portal_analytics.py` (numpy; numba nếu > ~10⁶ điểm), mở rộng retained-analytics lên **v2** (bỏ `rolling_sharpe_63`, thêm các số mục 2 + benchmark + `last_30d` cho thẻ S01), contract + fixture canonical, test số học trên chuỗi đã biết đáp án.
- **Claude (frontend):** đổi S04 EChart 3/5 + ô Behavior + 5 ô hero, S09 ô metric, S01 thẻ last-30D theo mục 3; typed absence cho run cũ chưa có v2.
