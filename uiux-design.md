# Hướng dẫn Thiết kế UI/UX — Hệ Component Báo cáo Định lượng

> Tài liệu này là "design system" cho các agent/dev khi viết UI/UX cho báo cáo.
> Nguồn trích xuất: `template.html` (design tokens + component tĩnh), `quant_bot/charts/` (ECharts + SVG), `quant_bot/analyzers/` (component sinh runtime), `quant_bot/renderers/html_renderer.py` (cơ chế nhúng dữ liệu).
> **Màu sắc cụ thể không quan trọng** — chỉ giữ vai trò ngữ nghĩa (cấu trúc / nổi bật / tốt / xấu / trung tính). Có thể đổi palette tự do miễn giữ đúng vai trò.

---

## 1. Triết lý thiết kế

- **Publication-grade "paper theme"**: báo cáo phải đẹp như một bài báo khoa học — không phải dashboard. Ưu tiên đọc tĩnh, in được, sau đó mới là tương tác.
- **Hệ phân cấp rõ**: phần (Part) → mục (section) → tiểu mục (h3 có tiền tố `§`) — luôn giữ đúng cấp heading để TOC rail khớp.
- **Số liệu luôn là mono**: mọi con số, ticker, thời điểm, nhãn bảng đều dùng font mono — tạo nhịp đọc "báo cáo tài chính".
- **2 tầng (Tier) khi trình bày chart**:
  - Tier 1: biểu đồ tương tác ECharts hiển thị sẵn (default mở).
  - Tier 2: bộ SVG gốc QuantStats thu gọn trong `<details class="qs-toggle">`.
- **Nội dung tiếng Việt**: tiêu đề, mô tả, chú thích, badge đều viết tiếng Việt (thuật ngữ kỹ thuật giữ tiếng Anh trong ngoặc nếu cần).
- **Giới hạn 3 màu chủ đạo** cho toàn bộ report: 1 màu cấu trúc (accent), 1 màu nhấn (highlight), 1 cặp tốt/xấu. Không thêm màu mới tùy tiện ngoài các vai trò trên.

---

## 2. Design Tokens (định nghĩa trong `:root` của `template.html`)

| Token | Vai trò | Ghi chú |
|---|---|---|
| `--paper` / `--paper-raised` | Nền trang / nền thẻ nổi | card, abstract, table hover |
| `--ink` / `--ink-soft` / `--ink-faint` | Chữ chính / phụ / mờ | phân cấp visual 3 bậc |
| `--line` / `--line-soft` | Viền chính / viền nhạt | border, divider, grid |
| `--accent` / `--accent-soft` | Màu cấu trúc (structural) | tiêu đề h3, TOC active, stepper, summary bar |
| `--accent-2` / `--accent-2-soft` | Màu nhấn (highlight) | eyebrow, fig-num, mũi tên, badge edge |
| `--good` / `--good-bg` | Trạng thái đạt / nền | badge pass, prefer col, màu dương |
| `--bad` / `--bad-bg` | Trạng thái lỗi / nền | badge fail, avoid col, màu âm |
| `--shadow` | Đổ bóng thẻ | rất nhẹ, chỉ cho card "chìm" hơn surface |

**Typography — 3 vai trò bắt buộc:**
- `--font-display` (serif): heading h1–h4, `kf-stat`, italic "dek" — chất "bài báo".
- `--font-body` (sans): nội dung, mô tả.
- `--font-mono`: số liệu, label uppercase, nhãn chart, caption, badge, chip.

**Chú thích vai trò (KHÔNG viết raw `#HEX` ngoài token):**
- Nền đen/slate đậm (như `#1E293B` trong SVG overlay) = sân tối cho chart đứng riêng — chỉ dùng cho SVG tùy chỉnh, không cho HTML.
- Xanh lá = thắng/dương (`--good`), đỏ = thua/âm (`--bad`), xanh dương = trung tính/tín hiệu thứ cấp, cam = cảnh báo ngưỡng sát.

---

## 3. Layout System

- **Grid 2 cột**: `.page` = rail TOC 250px (sticky, scroll riêng) + `.paper-col` nội dung.
- **Bề rộng nội dung theo ngữ cảnh**:
  - `.narrow` (780px): văn xuôi, bảng hẹp, section thảo luận — tối ưu dòng đọc.
  - `.wide` (980px): KPI, chart gallery, bảng rộng.
  - Breakpoint: <1080px → TOC thành thanh ngang tĩnh; <780px → chart-grid-2 về 1 cột; <640px → mọi grid 2 cột về 1 cột.
- **Print rules** (luôn kèm `@media print` khi thêm component): ẩn `.toc-rail`, mở hết collapsible, `break-inside: avoid` cho card/chart-figure/table/stepper, `break-before: page` cho part header.
- **Accessibility** (bắt buộc): `:focus-visible` luôn có outline; tôn trọng `prefers-reduced-motion`; `::selection` dùng màu nhấn; ẩn TOC khi in qua `.no-print`.

---

## 4. Component Catalog (đã có — giữ nguyên cấu trúc khi dùng lại)

### 4.1 Shell & điều hướng

| Component | Mô tả cấu trúc |
|---|---|
| **TOC Rail** | `.toc-rail` sticky; kicker mono uppercase mờ; link h1 (đậm, uppercase), h2, h3 (thụt vào) với border-left 2px, `.active` = màu accent + viền nhấn. |
| **Cover** | `.eyebrow` (mono uppercase, highlight) → h1 lớn → `.subtitle` (display italic, mờ) → `.meta-row` (dl 2 dòng: dt mono uppercase mờ, dd in đậm chính). |
| **Abstract** | Thẻ nổi: `.label` mono uppercase mờ + đoạn văn mềm. Không viền trái. |
| **Key Finding** | Banner nền accent đậm, chữ sáng: label mono uppercase nhạt / `kf-stat` (display, lớn) / mũi tên highlight / `kf-text` mô tả ngắn. Dùng tối đa 1–2 lần/báo cáo. |
| **Part Header** | Phân cách "Phần": border-top 3px đậm, `part-eyebrow` mono highlight, h2 lớn, `part-dek` display italic mờ. |
| **Section headings** | `level2 > h2`: font-size trung bình + border-bottom; `level3 > h3`: màu accent + tiền tố `§` màu nhấn (đừng vẽ số tay). |
| **Footer** | `.paper-footer`: mono nhỏ, mờ, flex space-between — thời gian tạo, bản quyền, liên kết. |

### 4.2 Hiển thị số liệu

| Component | Mô tả cấu trúc |
|---|---|
| **KPI Card** | `.card-grid` (auto-fit, min 210px) chứa `.kpi-card`: label mono uppercase mờ → value mono lớn đậm → target/badge nhỏ bên dưới. |
| **Badge pill** | `.badge.{pass/fail/edge/pending}`: mono 11px, padding 2px 9px, border-radius 20px, nền tint + chữ đậm màu trạng thái. Đi kèm text ngưỡng (VD: "yêu cầu ~20%/năm"). |
| **Bảng (generic)** | caption mono uppercase mờ trên đầu; `thead` mono 11.5px uppercase, border-bottom 2px đậm; `tbody tr:hover` đổi nền; `td.num` mono căn phải. |
| **Bảng sticky + nhóm** | `.priority-table`: header sticky; cột đầu mono số; mỗi dòng border-left 4px màu nhóm, kèm `.grp-legend` swatches. |
| **Decay Card** | `.decay-card`: label mono → `.dc-flow` (from → arrow → to, color riêng cho "suy giảm") → thanh tiến trình `.dc-bar` (phần dương nền tốt, khấu hao nền xấu) → `.dc-delta` tỷ lệ suy giảm đỏ đậm. |
| **Impact Card** | `.impact-card`: border-left 3px accent; các `.impact-row` (label mono uppercase trái 150px + nội dung), variant `.goal` (label xanh) / `.tradeoff` (label đỏ). |
| **Regime / Stress / Monthly cards** | Sinh runtime (xem mục 4.4) — chung "bộ khung card": border 1px, radius, nền trắng, header bar nền raised chứa h3 display 15px + bảng mono. |

### 4.3 Kể chuyện & giải thích

| Component | Mô tả cấu trúc |
|---|---|
| **Stepper** | `.stepper`: cột số tròn (nền accent, mono) + cột nội dung; đường nối dọc giữa các bước `.step::before`; variant `.compact` nhỏ hơn (dùng cho màu nhấn). |
| **Avoid/Prefer** | `.avoid-prefer` 2 cột: `.ap-col.avoid` (nền đỏ nhạt, title đỏ) vs `.ap-col.prefer` (nền xanh nhạt, title xanh); marker list cùng màu cột. |
| **Optimum Pair** | `.optimum-pair` 2 card so sánh sharp/flat: title màu xấu/tốt + SVG minh họa full-width trong card; căn giữa. |
| **Blockquote callout** | Border-left 3px highlight, nền raised, chữ mềm — dùng cho cảnh báo khung thời gian lệch, lưu ý quan trọng. |
| **Signal Flowchart** | Dòng inline: border dashed, mono nhỏ, text màu nhấn, mũi tên `➔` giữa các bước — mô tả pipeline tín hiệu. |
| **Guideline italic** | `<em>` kiểu chữ nghiêng mềm ngay dưới tiêu đề thẻ — hướng dẫn "viết gì vào đây" cho AI. |
| **Collapsible** | `.collapsible`: head mono uppercase (click toggle, mũi tên phải) + content có border-top; print = mở hết, ẩn head. |

### 4.4 Chart frame & component sinh runtime

| Component | Nguồn sinh | Mô tả |
|---|---|---|
| **Chart figure** | tĩnh | `.chart-figure`: số hình `.fig-num` (mono, highlight) + `.fig-title` đậm + `.fig-note` (chứa `data-analysis` chú giải từ AI). `.chart-frame` = khung trắng viền chứa SVG; `.chart-grid-2` = lưới 2 cột. |
| **Placeholder** | tĩnh | `.placeholder-figure`: dashed border, icon mono lớn — dùng khi chưa có dữ liệu. |
| **QuantStats accordion** | tĩnh | `details.qs-toggle`: summary mono trên nền accent-soft (hover đổi nền), body padding, chứa 12 `.chart-frame[data-slot]` đánh số liên tục "Hình N". |
| **Stress Test table** | `StressTestAnalyzer` | Card "Stress Test Analysis": thời kỳ khủng hoảng (COVID-19 Crash, 2022 Bear Market, LUNA/FTX…) vs benchmark; PnL dương/âm tô đỏ/xanh mono. |
| **Monthly heatmap** | `MonthlyReturnsHeatmapBuilder` | Card "Monthly Returns (%) & Annual Max Drawdown": cột Jan–Dec, nền cell alpha theo độ lớn (dương xanh / âm đỏ / 0 xám), cột Total + MaxDD cuối. |
| **Regime matrix** | `RegimeSensitivityAnalyzer` | Card "Ma trận Nhạy cảm Trạng thái": 4 regime (Bull/High-Vol Panic/Low-Vol Chop/Bear), mỗi dòng = status chip emoji + Win Rate/PF + Avg Hold/Fee Drag + Payoff/Loss Streak + cột AI diagnosis (RAG). |

### 4.5 Data-hook (cơ chế nhúng runtime — bắt buộc hiểu)

`HTMLReportRenderer` quét template bằng BeautifulSoup theo các attribute — **mọi component nhận dữ liệu động phải khai đúng hook**:

| Hook | Dữ liệu | Ví dụ |
|---|---|---|
| `data-slot` | SVG chart (svgs dict) | `<div class="chart-frame" data-slot="cumulative_return">` |
| `data-metric` | KPI value | `<div class="kc-value" data-metric="cagrpct">` |
| `data-badge` | Badge pill | `<div class="kc-target" data-badge="cagr">` |
| `data-analysis` | Text nhận định (AI/rule) | `<p data-analysis="part1_summary">` |
| `data-table` | Bảng sinh từ list (EOY, drawdowns) | `<tbody data-table="eoy">` |
| `data-container` | HTML block do analyzer sinh | `<div data-container="regime_sensitivity_matrix">` |
| `data-field` | Meta field | `<dd data-field="period_actual">` |

Quan trọng: hook prefix `test_` (VD `data-slot="test_cumulative_return"`, `data-metric="test_cagrpct"`) = vùng Test Set — renderer tự map sang dữ liệu test, không được tự ý đổi.

---

## 5. Chart Catalog (đã có)

### 5.1 Tier 1 — ECharts tương tác (Apache ECharts 5, `EChartsBuilder`)

Mỗi chart: title center mono-serif mix, `legend` trên cùng, `grid containLabel`, dashed splitLine, dataZoom (inside + slider) cho chart chuỗi thời gian, tooltip cross/item. ID pattern: `{train|test}-echart-{slug}`.

| # | Chart | Loại | Đặc điểm kỹ thuật |
|---|---|---|---|
| 1 | Standalone Equity & Drawdown Waterfall | Line + Line (dual grid) | 520px cao; grid trên equity, grid dưới drawdown inverse; dùng chung dataZoom 2 trục X; equity màu cấu trúc, drawdown diện tích đỏ mờ |
| 2 | Price Action & Trade Signal Overlay | Line + Scatter | Chuỗi liên tục theo execution timestamps; buy = tam giác xanh lá ▲, short = tam giác đỏ ngược ▼, màu sky cho đường giá; dataZoom slider |
| 3 | Long vs Short Breakdown | Combo Bar + Line (dual Y) | Bar count + bar PnL + line win-rate (Y2 0–100), 2 category cột |
| 4 | MAE vs MFE Excursion | Scatter | 1 series; màu điểm = PnL ≥0 xanh / <0 đỏ; tooltip custom MAE/MFE/PnL |
| 5 | Account Equity vs Free Margin | Line + Line | Total đặc, Free margin dashed nhấn; giới hạn 200 điểm gần nhất |
| 6 | Trade Return % Frequency | Bar histogram | Bin cố định [-10…+50]; màu bar theo bin (âm đỏ / dương xanh) |
| 7 | 30-Trade Rolling Win Rate | Line | Cần ≥10 lệnh mới render; trục Y cố định 0–100; màu nhấn |
| 8 | Holding Duration vs Return | Scatter 2 series | Win xanh / Loss đỏ; tooltip custom |
| 9 | Execution Density Heatmap (day × hour) | Heatmap | x = 24h, y = 7 ngày; visualMap gradient nền→cấu trúc; grid i=0 (bug: `grid: { height }`), position top |

### 5.2 Tier 2 — SVG QuantStats gốc (12 chart, đặt trong `details.qs-toggle`)

Đánh số liên tục **"Hình N"** theo thứ tự: Cumulative Return → Cumulative Return (Log) → EOY Returns → Monthly Dist → Return Quantiles → Daily Returns → Rolling Vol → Rolling Sharpe → Rolling Sortino → Worst Drawdowns → Underwater → Monthly Heatmap. Train = Hình 1–12, Test = Hình 13–24. Mỗi hình kèm `data-analysis` chú giải riêng.

### 5.3 SVG tùy chỉnh (`trade_overlay.py`, dark theme riêng)

- **Equity Trade Overlay**: nền slate đậm, đường equity xanh dương; ▲/▼ tam giác mã màu LONG/SHORT tại entry; ● vòng tròn exit (xanh = win, cam = loss); giới hạn 100 lệnh để nhẹ.
- **Trade PnL Distribution**: nền slate đậm, từng lệnh 1 bar xanh/đỏ, đường 0 dashed; caption 2 góc.

### 5.4 HTML tables kiểu chart (sinh runtime, đã liệt kê ở 4.4)

Stress test, monthly heatmap, regime matrix — không cần JS, tự responsive qua `overflow-x: auto`.

---

## 6. Quy ước đặt số & caption (bắt buộc)

- ECharts → **"EChart N"** (đánh liên tục train 1–8, test 9–16 — hiện Test bắt đầu EChart 9).
- SVG QuantStats / tùy chỉnh → **"Hình N"** (liên tục toàn báo cáo, không reset theo part).
- Không đánh số chồng lên nhau; khi thêm chart mới phải tính lại chuỗi số.

---

## 7. Component & Chart đề xuất mở rộng (chưa có — "xịn hơn")

> Khi thêm mới: ưu tiên tái sử dụng khung card/figure hiện có, dùng hook data-* chuẩn, giữ tầng Tier 1 mở / Tier 2 gấp.

### 7.1 Component mở rộng

| Component | Mô tả | Nơi dùng |
|---|---|---|
| **Metric Hero Strip** | Dải 4–6 chỉ số chính (CAGR, Sharpe, DD, PF) mỗi ô: label mono + value lớn + **sparkline mini** (đường equity chuẩn hóa) | Đầu Part I thay 3 KPI card lẻ |
| **Train vs Test Comparison Matrix** | Bảng 2 chiều: hàng = metric, cột = Train/Test + **cột Delta % kèm mũi tên tốt/xấu** | Thay cho bảng robustness 1.6 |
| **Callout tri-state** | `.callout.{info|warn|danger}`: icon + border-left màu theo mức, dùng chung cho mọi lưu ý (khung giờ lệch, fee, cờ AI fallback) | Cảnh báo xuyên report |
| **Status Gauge** | Radial gauge (chỉ số 0–100) cho Overfitting Rating / Robustness Score — màu tốt→xấu theo cung | Đầu section 1.6 |
| **Chip / Tag** | `.chip` mono nhỏ cho đặc tính chiến lược (Vol-breakout, ETHUSDT, Market Order, Volatility Parity) | Cover meta-row |
| **Tab switcher** | Tab Train/Test switch pattern nhỏ (thuần `<details>` hoặc radio) cho cùng 1 loại chart | Khi muốn rút gọn 2 accordion |
| **Sparkline in KPI** | Thêm SVG polyline nhỏ 80×24 trong mỗi kpi-card | Card KPI |
| **Streak Strip** | Dải lệnh thắng/thua dạng thanh ngang liên tục (xanh/đỏ), đánh dấu max loss streak | Dưới rolling win rate |
| **Fee Drag Waterfall** | Waterfall: Gross PnL → −Fees → −Slippage → Net, bằng ECharts `type:'waterfall'` | Section 1.3 / analysis |
| **Confidence Bar** | Thanh tiến trình % cho độ vững chắc (Train→Test giữ được bao nhiêu % hiệu năng) | 1.6 |

### 7.2 Chart types mở rộng

| Chart | Loại ECharts | Mô tả |
|---|---|---|
| **Monte Carlo Fan Chart** | Line × N paths + area band | Equity ngẫu nhiên N lần, highlight median + percentile 5–95 band — đánh giá variance của chiến lược |
| **Parameter Sensitivity Contour** | Heatmap 2D | Lưới (param A × param B) → CAGR/Sharpe, sắc độ theo giá trị; phát hiện vùng "sharp optimum" |
| **Regime-Shaded Equity** | Line + custom `markArea` | Equity curve nền phân đoạn màu theo regime (bull/panic/chop/bear) — ghép nối với table 4.4 |
| **Rolling Sharpe Band** | Line + band area | Rolling Sharpe cùng band ±1σ, vạch ngưỡng 1.0 |
| **Calendar Heatmap (năm)** | Heatmap 53 tuần × 7 ngày | Daily return per-day, dương/âm theo alpha |
| **Drawdown Gantt** | Custom series trên trục thời gian | Từng đợt drawdown là 1 thanh ngang với độ sâu + thời gian phục hồi |
| **Box-and-Whisker by Year** | Boxplot | Phân phối return lệnh theo từng năm — outlier, median, IQR |
| **Hexbin/Voronoi MAE–MFE** | ScatterGL / custom | Thay scatter 4 bằng density 2D khi trade > vài nghìn |
| **Cumulative PnL Contribution** | Stacked area / bar | PnL lũy kế tách theo Long/Short hoặc theo regime |
| **Volatility Cone** | Line + band | Vol rolling theo các cửa sổ 10/30/90/252 so với realised |
| **Trade Ladder** | Custom bar-x | Từng lệnh trên trục thời gian, chiều cao = size, màu = thắng/thua — nhìn ngay chuỗi streak |
| **Autocorrelation / QQ Plot** | Scatter + line | Kiểm định return i.i.d (bằng chứng overfitting/mean-reversion) |

Gợi ý tối ưu nhất để "xịn" với ít công sức: **Monte Carlo fan** (rất thuyết phục với investor), **regime-shaded equity** (gắn kết với regime matrix sẵn có), **fee drag waterfall** (kể chuyện chi phí), **parameter contour heatmap** (câu trả lời trực tiếp cho overfitting).

---

## 8. Checklist khi agent viết UI/UX mới

1. ☐ Component làm từ token CSS, không `#HEX` cứng ở phần HTML (trừ SVG dark theme riêng).
2. ☐ Dùng đúng hook data-* nếu cần nhận dữ liệu runtime; biết rõ prefix `test_` là của Test Set.
3. ☐ Giữ 3 vai trò font: display cho heading/số lớn, body cho văn, mono cho số/label.
4. ☐ Ưu tiên số liệu mono + căn phải trong bảng; thẻ `td.num`.
5. ☐ Chart mới: đánh số liên tục (EChart N / Hình N), kèm `.fig-note` chú giải, không phá chuỗi số hiện tại.
6. ☐ Responsive: grid 2 cột (`.chart-grid-2`, `.card-grid`) phải rơi về 1 cột <780px.
7. ☐ Row hover / focus-visible / reduced-motion / print rules — luôn kèm khi thêm thẻ.
8. ☐ Nội dung tiếng Việt, thuật ngữ mềm (guideline italic) giữ đúng ngữ điệu báo cáo.
9. ☐ Component phân tích mới (stress/regime/heatmap) → viết trong `quant_bot/analyzers/` như class render_html_table, nhúng qua `data-container` + `_fill_*` trong renderer.
10. ☐ Sinh lại report (`main.py`) + xem `report_final.html` để kiểm chứng trước khi hoàn thiện.