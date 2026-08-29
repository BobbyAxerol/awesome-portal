# Audit — mật độ, chữ giải thích và Insight Charts (2026-08-25)

> Đầu vào cho **EL-V2-10** (handoff §12, phase Bobby thêm 2026-08-25). Đọc trên
> `feat/execution_loop @ 388189c`, baseline `el-v2-08-*.png`, và render thật ở
> dev-portal (image build 04:51, flag preview bật). Không sửa màn nào trong lúc audit;
> việc duy nhất đã làm là **smoke data cho Alpha 360 Insight** (§3) để nhìn thấy grid.

## 1. Kết luận ngắn

| # | Phát hiện | Mức | Màn |
|---|---|---|---|
| F1 | 9/12 tile Insight của Alpha 360 là **khung chữ**, không có chart nào — vì không contract nào publish series (BR-EX-34). Mọi lỗi layout/gap/tooltip của grid bị che. | chặn review | Alpha 360 |
| F2 | Grid tile `repeat(auto-fit, minmax(340px,1fr))` + `height=220` → ở 1440 hai cột lệch chiều cao (tile state ngắn, tile chart dài), caption wrap 3 dòng đẩy khung không thẳng hàng. | UX | Alpha 360, Portfolio 360 |
| F3 | `.exec-alpha-tiles` **định nghĩa hai lần** trong `execution.css` (2588 với `minmax(22rem)`/`space-3`, 4504 với `minmax(340px)`/`space-2`) — cái sau thắng, cái trước là xác chết. | nợ kỹ thuật | CSS chung |
| F4 | `EquityChart` **bỏ rơi `envelope.warnings`** (chỉ `ChartTile` in). Server flag một series → chart hiển thị như sạch. Đã sửa trong lát này (`EnvelopeWarnings`). | trung thực | mọi chart equity |
| F5 | Chữ giải thích lặp: tiêu đề tile + câu "X: series not published…" + caption; đầu màn có subtitle *"One alpha, all its deployments across venue × mode × stage — every panel below obeys the scope bar."* rồi ngay dưới scope bar lại *"every panel below obeys this scope · venue list from registry, never hardcoded"*, rồi rail lại *"Change the scope bar and every panel follows."* — **ba câu cùng một ý trên một màn**. | copy budget §7.2 | Alpha 360 (mẫu), lặp ở 360 khác |
| F6 | Số string literal ≥60 ký tự trong mã màn (proxy cho prose): R2 14 · Sandbox 11 · Paper Exit 11 · R1 11 · Portfolio 10 · Queue 10 · Incident 9 · Command Center 9 · Live 8 · Account 8 · Canary 7 · Inbox 7 · Blotter 5 · Alpha 4 · Drawer 4 · Paper 2. Governance nặng chữ nhất. | copy budget | 17 màn |
| F7 | Caption envelope in **mono full-width dưới mỗi tile** (`30d · 1h · USDT · as_of … · DERIVED · x.v1 · 43800 → 4368 samples · downsample lttb · coverage 98%`): 12 lần một trang. Cần giữ (§16.2) nhưng nên rút thành 1 dòng + disclosure. | mật độ | mọi tile |
| F8 | **Lộ ra nhờ smoke:** nhãn gap của `markArea` (`reason`) vẽ **đè lên legend** ở đỉnh chart (EquityChart, mọi màn có gap) — chữ chồng chữ, không đọc được. | lỗi hiển thị | mọi EquityChart |
| F9 | **Lộ ra nhờ smoke:** thanh tool 4 nút (Reset zoom/Table/Expand/Export) lặp trên 9 tile + dataZoom slider mỗi tile → ~70px chrome/tile, chart 220px chỉ còn ~45% chiều cao tile. Tool nên gom vào menu hoặc hiện khi hover/focus; slider tắt ở tile, giữ ở Expand. | mật độ | tile grid |

## 2. Đo được gì (Alpha 360 · Insight Charts · 1440×900)

- Tile "ok" trước smoke: 1 h3 + 1 câu 2 dòng + caption 3 dòng = **~110px chữ, 0px chart**.
- Tile state (insufficient/unavailable): panel state ~90px + caption 3 dòng.
- Chiều cao hai cột lệch nhau 20–60px mỗi hàng → khung không khớp (F2).
- Rail phải: 4 blocker WATCH lặp lại đúng nội dung tile 5/8/10 (đã thấy trên grid).
- Trên fold (900px): banner + Inspector + tiêu đề + subtitle + scope bar + tab = **~400px** trước tile đầu tiên.

## 3. Smoke data — đã bật, có hợp đồng xoá

- File: `apps/portal/frontend/src/execution/alpha360.smoke.ts` — cờ duy nhất
  `ALPHA_INSIGHT_SMOKE = true`; 9 series tất định (720 bucket/1h, 1 gap 4 bucket), mỗi
  series `evidenceOnly: true` (chart in *"Evidence fixture — not a published projection."*),
  envelope mang warning **`SMOKE DATA — … delete when BR-EX-34 publishes equity_projection.v1`**
  và row count nói đúng 720/720, coverage 100%, không downsample.
- Nối: `alpha360.fixtures.ts` → `withSmokeSeries(HONEST_TILES, ALPHA_INSIGHT_SMOKE)`. Tắt cờ = 9
  khung "not published" như cũ (test khoá cả hai nhánh).
- **Xoá khi:** BR-EX-34 giao fixture canonical series theo tile. Bốn bước xoá ghi ở đầu file smoke;
  tracker giữ một dòng nợ cho tới lúc đó.
- Smoke **không** giả kiểu chart: histogram/funnel/waterfall/heatmap đang vẽ bằng line vì
  `EquityChart` là component duy nhất — đó là nội dung BR-EX-40.

## 4. Đề xuất cho EL-V2-10 (chi tiết ở handoff §12 · EL-V2-10)

1. Tile grid: cột cố định theo breakpoint (≥1728: 3 cột · 1440: 2 cột · <1024: 1), tile
   `min-height` chung để hàng thẳng, caption 1 dòng `text-overflow` + nút "envelope" mở
   disclosure đầy đủ; height chart 260–300.
2. Copy: một câu scope duy nhất (bỏ subtitle + hint dưới scope bar, giữ rail); tile ok không có
   câu "series not published" lặp tiêu đề — chỉ state chip + lý do.
3. Gỡ định nghĩa CSS trùng (F3); token spacing tile dùng `--space-3` thống nhất.
4. Áp cùng grammar cho Portfolio 360 (2 EquityChart height 200) và Account 360.
5. Sửa F8 (label gap xuống trục x hoặc tooltip) và F9 trước khi baseline lô 1.
6. Governance (R1/R2/Exit/Inbox): chuyển prose invariant vào disclosure; đo lại F6 sau khi xong,
   mục tiêu ≤4 literal/màn.

## 5. Sau khi sửa (EL-V2-10 lô 1+2, cùng ngày) — disposition từng phát hiện

| # | Sửa | Ở đâu |
|---|---|---|
| F1 | smoke 9 tile (giữ, có hợp đồng xoá) | `alpha360.smoke.ts` |
| F2 | grid 2 cột cố định (3 cột ≥1728), `min-height: 360px`, plot `flex:1` → hàng thẳng, tile state ngang tile chart | `execution.css` `.exec-alpha-tiles` |
| F3 | gỡ block `.exec-alpha-tiles` trùng (2588) — còn **một** định nghĩa | `execution.css` |
| F4 | `EnvelopeWarnings` in `envelope.warnings` ở cả nhánh chart và nhánh unavailable | `EquityChart.tsx` |
| F5 | Alpha 360: bỏ hint dưới scope bar, `purpose` 41 ký tự, rail giữ câu duy nhất; 7 `purpose` dài khác rút ≤65 ký tự (Account, Drawer, Command Center, Blotter, Live, Queue, Portfolio) | `screens/*` |
| F6 | note cơ chế → `<Hint>` (details, chữ vẫn trong DOM): Queue ×1, Incident ×2, Canary ×1, Blotter ×2, Alpha ×3; 6 câu hướng dẫn rút ngắn | `components/hint.tsx` |
| F7 | caption tile: 1 dòng `window · interval · currency · authority` + disclosure "envelope" chứa đủ §16.2 (không ellipsis) | `EnvelopeCaption` |
| F8 | `markArea.label.show=false`; lý do gap chuyển vào tooltip tại bucket trong gap | `equityOption` |
| F9 | `compact`: 2 nút (Table/Expand) thay 4, không slider, không legend, grid top 12px; Expand trả lại đủ tool + slider + legend | `EquityChart` |

**Thước "prose hiển thị mặc định"** (literal ≥60 ký tự, trừ reason/blocked/Hint/label/detail — proxy
của §7.2; thước cũ ở F6 đếm cả lý do state nên không phản ánh cắt): Queue 7→3 · Incident 5→3 ·
Alpha 3→1 · Drawer 2→0 · Command Center 6→5 · Canary 6→5 · còn lại giữ nguyên vì phần dư là câu
quyết định/guard band/state. Ngưỡng ≤4 đạt ở 16/17 màn; Canary và Command Center = 5, phần dư là
`StageGuardBand` (rule an toàn) và alert stream — cố ý giữ.

**Không đổi:** giá trị, state, fail-closed, contract. Text gấp vào `Hint`/disclosure vẫn nằm trong
DOM nên test theo text không phải sửa; chỉ 2 assertion khớp chuỗi rút gọn được cập nhật.

## 6. Vòng 3 — grammar v3 sau khi Bobby xem dev-portal (cùng ngày)

Bobby xem trực tiếp và chỉ 4 điểm: quá nhiều chữ/khung, góc vuông, chữ không cùng kiểu, ô khít.
Nguyên nhân gốc tìm được bằng cách "duyệt web" headless (harness chụp 18 route ở 1440×900):

| Gốc | Ở đâu | Sửa |
|---|---|---|
| theme `operations-carbon` ép **radius 0** toàn bộ (DS §7 flat) | `tokens.css` | override radius 4/8/12 trong `.exec-surface` — token gốc không đổi, Research/Planning giữ baseline |
| `--exec-font-meta`/`caption` là **mono** → mọi state/caption/meta thành log | `execution.css` + `typeRoles.test.ts` | meta/caption → Inter 12/16, 11/14; thêm role `id` mono cho mã; test EL-V2-02 cập nhật (owner override) |
| panel nào cũng `border: 1px` + rail 4 hộp chồng + governance có **hộp bao ngoài** khiến KPI nổi mất nền (`surface-3` = `paper-raised`) | `.exec-strip-cell`, `.exec-rail-section`, `.exec-inbox/.exec-gate/.exec-exit` | panel = nền nổi không viền; rail = một cột chữ, chỉ Next là card, khối rỗng ẩn; bỏ hộp bao governance; ô trong panel dùng `surface-2` |
| gap 12px khắp nơi | `.exec-ws`, canvas, tabs | nhịp 24/16/12 |
| banner preview 2 tầng sticky | `.exec-preview-banner` | 1 dòng 32px, radius, Details + Inspector gấp phải |
| Exit Review lặp "Promote X to Y?" 3 lần; note carried-question 2 dòng | `PaperExitReview.tsx` | purpose = gateSummary; note 1 dòng |

Tài liệu: `DESIGN_GRAMMAR_V3.md`; override ghi ở đầu `PHASE_TRACKER.md` và trong EL-V2-10 của handoff.
Harness chụp: `e2e/_probe-shots.spec.ts` (không commit — khớp `testMatch _probe*` nên sẽ chạy trong gate).

## 7. Vòng 4 — stage workbenches lên chart (Bobby: "toàn chữ hardcode")

Đối chiếu hi-fi 1c/1d/1e/1f với mã: hi-fi có **Live vs Paper vs Backtest** (multi-line, phân biệt bằng
kiểu nét), **envelope consumed** (capital/drawdown/orders/day so với cap), **ACK latency p50/p95**,
**slippage/reject/broker freshness**, **positions table** (uPnL, leverage, ack), **contribution 30d**
(Live), **order-type matrix** (Sandbox). Mã chỉ có `EquityChart series=null` + `SourceTile` "unavailable".

Đã dựng: `components/visuals.tsx` (`StageLinesChart`, `CapGauges`, `HistogramChart`, `SparkTile`,
`DailyBarsChart`, `PositionsTable`, `OrderTypeMatrix`) + `stage.smoke.ts` (cờ `STAGE_SMOKE`, mọi
visual in cảnh báo SMOKE, hợp đồng xoá đầu file) + prop `visuals` trên 4 màn (không có = honest state).
Sandbox: stepper 7 bước gọn (lý do gấp "why"), rail gom 7 mã `SANDBOX_STEP_*` thành một blocker;
`ExecutionContextRail` dedupe blocker trùng mã. Spec cho codex: **BR-EX-41** (7 mục).
