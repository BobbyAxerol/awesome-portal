# Kế hoạch sửa frontend Research Loop — 5 đợt W1→W5 (2026-10-02)

Nguồn: `FRONTEND_AUDIT_2026-10-02.md` + vòng rà sâu (`evidence/P21/audit-2026-10-02-final/`: `SPEC_W1`, `SPEC_W5`, `TEXT_A/B/C`). Chi tiết file:line nằm trong các SPEC; file này là bản điều hành: **làm gì, theo thứ tự nào, đo bằng gì, và cái gì cần Bobby quyết**.

## 0. Định hướng ràng buộc (mọi đợt phải tuân)
1. Rõ nguồn: số nào cũng nói từ đâu (tooltip), vắng = **một câu ngắn** dựng từ lý do server (mã chỉ ở tooltip); UI không tính giá trị suy ra.
2. UI đẹp, bám HiFi; chỗ Bobby tuỳ biến thì **ít chữ thắng**.
3. UX clear: mỗi màn có **bước kế rõ ràng**, không ngõ cụt; có đường **đi và về**.
4. Gắn kết: Library ↔ Progress ↔ Hub ↔ stage ↔ Report ↔ RC ↔ Lineage ↔ Compare ↔ Atlas ↔ New Run, cursor (`fold/trial/params/seq/window/attempt`) sống qua link và Back/Forward.
5. Đầy đủ life cycle: failed / cancelled / queued / not-found / denied / loading / empty mỗi cái một màn thật, có lối thoát.
6. All-time, dữ liệu raw từ QuantBT/HMD, suy ra tính một lần ở server.
7. **GIẢM CHỮ (định hướng mới của Bobby, áp cho mọi đợt)**: bỏ chữ hard-code không phục vụ luồng; rút mọi lời giải thích không cần; giải thích đi vào **tooltip** (`title` + accessible name), không bao giờ là đoạn inline; nhãn điều khiển 1–3 từ; một sự thật không lặp hai lần trên một màn; không enum thô/snake_case nhìn thấy; trạng thái server được **humanise một lần bằng một hàm**.

Quy tắc giữ khi cắt chữ: (a) vắng có kiểu giữ **một câu**; (b) số giữ nhãn + đơn vị, nguồn ở tooltip; (c) tên truy cập (aria) không mất; (d) không cắt thứ làm đổi nghĩa trung thực.

## 1. Quyết định đã chốt (Bobby, 2026-10-02)
- **Hub tab = tóm tắt**, deep-dive = thân đầy đủ (W4).
- **Draft New Run tự lưu + mỗi bước một history entry**; Library hiện "Tiếp tục draft" (W2).
- **Màn cũ** `/new`, `/imports`, `/runs/legacy` **chuyển hướng** sang màn mới, bỏ chữ "shipped" (W2).
- **Run sealable để kiểm seal/publish**: Claude dựng — **xong**: R-WFO-022 đã điền hai khai báo, nút "Local seal evidence pack" bật, hộp xác nhận audit (Esc đóng, không ghi). Chưa bấm confirm/publish.
- **Token** `--ink-faint` sáng `#939db0→#5f6b80`, tối `#738095→#8a98ac` (và `--ink-mute` sáng `#566278`): **duyệt**, làm thành commit riêng trong W5 (dịch mọi baseline, tôi chạy recorder và gửi ảnh trước/sau).
- **Breadcrumb trong trang bỏ**, dùng một `PageHeader` (W4).
- **Seal**: Bobby cho bấm `Confirm local seal` trên R-WFO-022 — **đã seal** (`rc_06GFW43NE42YF64NMXYDS6GD32`, `POST …/seal 201`; sau seal edit khoá, Publish sẵn sàng). **Publish: hỏi riêng trước khi bấm** (ghi vào approval graph).
- Tôi tự quyết theo nguyên tắc: S10 mở theo attempt đang xem + 8 mới nhất; nhãn trial `trial 351 · source 350`.

## 2. W1 — Trung thực trạng thái run + lối thoát (spec: `SPEC_W1.md`)
Lõi dùng chung (G1, **đã viết**): `runTerminalState` + `runStatusWord` (một hàm humanise), `useRunStatus`, `RunExitBar`, `runLinks` (13 builder cursor-aware), `trialLabel`, fixture + 57 test.
| Mục | Sửa | Đo |
|---|---|---|
| B1 hub chip | chip/dot/hàng stage lấy từ vòng đời run: `failed / cancelled / not run / stopped` (hôm nay stage đang chạy lúc run lỗi vẫn ghi RUNNING) | unit từng ô ma trận + probe real-API run FAILED |
| B2 RC | ẩn `gate_verdict` cũ khi `SEALED_LOCAL`; run lỗi/huỷ/chờ chỉ hiện `Failed.` + lối thoát, **không** composer DRAFT | probe R-WFO-023 (sealed), R-P04-020 (failed) |
| B3 link | thay `DEFAULT_CURSOR`/`fold=1` cứng bằng `runLinks`; mang `?attempt=` và cursor ở Report/RC/S14/Lineage | cursor round-trip hub→report→RC→hub |
| B4 S10 | mở theo attempt đang xem (`?run=`) + 8 mới nhất; probe cũ sau **một** nút `older probes (K)` (`?probes=1`); số khớp | probe 49 attempt |
| B5 trial | một hàm in `trial 351 · source 350` (chỗ chỉ có source id in `source 350`, không +1 ở trình duyệt) ~15 chỗ | grep test không còn số trial in tay |
| Màn lỗi/huỷ/chờ/không tìm thấy/denied | **một banner một dòng + RunExitBar** (Progress · Library · New run) trên S03–S13; denied chỉ hiện thông báo, không khung xương | ma trận 9 trạng thái × 10 màn |
Cắt chữ trong W1 (SPEC §6): Report 404 chỉ `Run not available.` + một lối ra (bỏ Print/link hub của run không tồn tại); RC run lỗi 661→~230 từ, 404 174→~25; S10 393→~255.
Nhóm làm: G1 xong → G2 (S03/S04/S05–S08) ∥ G3 (S09/S11) ∥ G4 (S10/S12/S13/S01/Journey) → tích hợp.

## 3. W2 — New Run đúng (S02/S14 + màn cũ)
- Advanced walk-forward: bắt buộc First OOS, horizon/purge/embargo, mode → bước `error`, Review liệt kê, **tắt Preflight** (như Three-Window).
- Ký hiệu ngoài danh mục không được `valid`; thông báo một dòng.
- **Draft**: tự lưu (mở rộng cho rời trong app) + **push history mỗi bước** (Back lùi một bước, không ra khỏi wizard); không bao giờ render `?step=review` khi draft rỗng; Library chip `Tiếp tục draft · bước N`.
- Nút **Back/Next** giữa 8 bước; Strategy và Optimization chỉ-đọc → gộp/bỏ bước (tự chọn version khi chỉ có một); lỗi Review đầy đủ, **mỗi lỗi link tới bước chứa lỗi**, thông báo cửa sổ cụ thể (không một câu chung), không đỏ ngay khi vừa chọn dataset.
- 403/ghi bị từ chối: **một** trạng thái "phiên chỉ đọc" thay ba câu khác nhau.
- Chuyển hướng `/new → /runs/new`, `/imports → /alpha-import`, `/runs/legacy → /runs`; Command Center/Journey hết chữ "shipped", node 04/05/12 trỏ màn mới; title chuẩn; bỏ header trùng ở landing; `Runs (1)` → số thật (49).
- S14: mũi tên trong stepper, một thông báo lỗi origin (không in hai lần), chặn file không `.py`; ẩn alpha receipt `s14-*` khỏi dropdown.
- Cắt chữ: rail Review lặp mọi bước; `NO VERSION CHOSEN/not declared` lặp; helper regex; "Label/purge/embargo: preflight only for now."; "TRONG INBOX" (nghi lỗi chính tả).

## 4. W3 — Mobile (390/360)
- Thanh trên **129–153px → ~56px**: gom Theme/Density/Planned modules vào một menu Display, bỏ chip "Default Workspace", **20 chip SOON/PROTOTYPE ở sidebar bỏ hẳn** (giữ làm mờ + aria-label); thẻ cursor sticky của S04 thu gọn được.
- Tab strip hub: ô `→ PROMOTION · SOON` ra khỏi hàng tab (hoặc ẩn ở hẹp); scroll-snap; Freeze bấm được.
- Mục tiêu chạm: điều khiển chính ≥40px, còn lại ≥24px (WCAG 2.5.8): stepper fold, link prev/next, chip S1–S5, checkbox compare, pill wizard, zoom ±.
- Hết cuộn ngang: Command Center 506px, `/research/quantbt` 412px (thẻ journey `min-w`), S03 chip claim ở 360, S09 cột digest (wrap/ellipsis), S07 hàng causal bị cắt.
- Đo lại bằng `overflow.mjs` ở 1440/1280/390/360 + recorder baseline.

## 5. W4 — Nhất quán + **giảm chữ** (một component, không vá lẻ)
Component dùng chung: `AbsenceSummary`/`ResearchNotice` (một câu ≤6 từ, mã+request id ở tooltip, một hành động), `humanise()` (thay 6 bản sao + 17 chỗ inline), `formatValue` (ngày `YYYY-MM-DD HH:mm UTC`, 2/3 chữ số thập phân, U+2212, không float thô), `PageHeader` (crumb + h1 + `← prev · next →` + copy-link; thêm h1 S04/S09–S13; title một mẫu), skeleton giữ chiều cao (CLS S05 0,79 / S09 0,69 / S04 0,45; không nháy `rrun_…` ở crumb).
**Hub tab = tóm tắt** (quyết định §1): mỗi tab hub = một thẻ (số chính + trạng thái + mini-chart) + nút "Mở S6 Search →"; bỏ nội dung lặp với deep-dive; child-audit panel chỉ còn một chủ (S08), S07 link tới.
**Số đo chữ (từ `TEXT_A/B/C`, đếm `main.innerText`, đích là ước lượng cộng các cắt):** S04 hub R-WFO-023 (7 tab) **10.208 → ~1.465 từ**; S04 queued/failed/cancelled 4.000+ → 120/700 (một panel trạng thái + link Progress thay 7 tab "pending"); S01 Library 3.306 → ~1.550; S00 Journey 768 → ~190; S03 R-WFO-023 389 (**3.560 gồm console 400 dòng**) → ~190; S02 ~280/bước → ~175; S05–S09 ≈ −3.000 từ; S10–S14 3.194 → ~1.460.
Cắt chữ lớn nhất, theo thứ tự tiết kiệm:
0. **S03 console in cả 400 dòng sau khi run xong (~3.100 từ)** → 10 dòng cuối + "show all"; **S04 tab Search nhúng cả deep-dive + sổ 100 trial (~3.900)** → tóm tắt + link; **S04 tab Execute in mỗi capability thiếu 3–4 lần (~1.700)** → một lần, mã ở tooltip; **S04 tab Atlas = nguyên Engine Atlas (~1.230)** → link; **hub của run queued/failed/cancelled (~3.500–3.900)** → một panel trạng thái.
0b. S01: câu "NOT ISSUED — …" mỗi thẻ (650 từ), `rc — not published` ×48 (188), nhãn "evidence trail" (98), chip alpha/instrument/mode lặp mỗi thẻ (~490).
0c. Vỏ hub lặp trên cả 7 tab (~120 từ/tab): lưới 8 trường "STAGE 5 CLAIM" toàn "not published" snake_case, nhãn phụ tab, thanh cursor với trường "not served for this lane" + hàng link trùng.
0d. S00: mô tả thẻ + mục "Shipped tab → new screen" (~580) — chữ đến từ descriptor backend (`journey.descriptor.v3.ts:69-126`): sửa bằng tooltip FE hoặc yêu cầu Codex bản descriptor mới; S02 rail Review lặp mỗi bước (`NewRun.tsx:3012`) + Optimization in 28 dòng `RELEASE_DEFAULT · LOCKED`.
Số lần lặp: `not published` 801 lần (14 component cục bộ), `not served for this lane` 97, `not visited` 147, `pending source` 54, `RELEASE_DEFAULT/LOCKED` 84.
Dữ liệu đáng ngờ: hub Summary R-WFO-023 có `Trade count 45` cạnh `Engine trades: 33` (hai số cho một nhãn) → gom về một nguồn và nhãn.
Danh sách cắt gốc (TEXT_B/C):
1. S06 sổ trial (~−1.600 từ): bỏ cột seed/state/OOS đồng nhất → **một dòng chú thích dưới tiêu đề** (mã ở tooltip); tham số chỉ in giá trị; digest ra tooltip. Mẫu chung "cột đồng nhất → một dòng; cột vắng một phần → dấu mờ + dòng `7/100 not published`".
2. S08 P04/FAILED: một khối "Not published by this source", bỏ 5 thẻ rỗng + 7 câu disclosure.
3. S09: gộp Identity + Provenance + Key artifacts một khối; bảng Metrics bỏ cột scope/origin → tooltip.
4. Mã lý do inline (`P04_SOURCE_DID_NOT_PUBLISH_*`, `QUANTBT_*`) → tooltip ở 25+ chỗ.
5. S12 Atlas 1046→~430 từ (bảng "schedule → claim" lặp 5 lần, "no cert cap" 5 lần); S13 ladder 23 thẻ bỏ dòng enum + gloss sr-only trùng (~−320); S11 sealed 683→~300.
6. Sidebar 20 chip; S01 `rc — not published` ×43 → "no release candidate" hoặc bỏ; banner `Run failed at S4 Execute` một lần ở S05–S08.
7. Số nhìn thấy sai: S08 `pos 0.03386197520287556`, tooltip Compare `19909.419272059647`, `-0.000`; tổng phí cửa sổ tính ở trình duyệt `ExecuteCandleReplay.tsx:232` → server cấp hoặc bỏ.
8. Lỗi bổ sung từ vòng rà sâu: tooltip "Screen NN" (16+ chỗ) bỏ; hằng chết ở `ReleaseCandidateDetail.tsx:95/239`; S08 "trade PnL" card có ở P04 mà không ở WFO (thống nhất); S06 hai thước đo fold (0-/1-based).

## 6. W5 — A11y, chart, cursor (spec: `SPEC_W5.md`; đã đo lại bằng axe)
**Hiệu chỉnh số liệu so với vòng 1:** "135 aria-label" của S06 = 96 bin histogram + 39 chấm pool (scatter đã có role + phím mũi tên); S09 bàn phím đã chạy, **lỗ hổng là cảm ứng** (tap không hiện tooltip: `pointerleave` xoá readout, thiếu `pointerdown`); pill 390px đã có tên; S04 404 đã có h1 nhưng **2 `<main>`**, hub thường mới thiếu h1; tương phản link S13 (1,67/1,31) là link-trong-đoạn → **gạch chân**, không đổi token.
- Axe: S13 `aria-pressed`; S06 span aria-label không role (bin/chấm); S07 nested-interactive; S03 vùng log focus được; **S05 θ-lane 2,52:1 do `opacity:.6` lên cả nhãn** (`SplitDetail.tsx:2470,2487`) → chỉ làm mờ phần fill; h1/h2 S04; `<main>` lồng.
- **Một hợp đồng chart** (`useChartContract`, file mới `chartContract.tsx`): vùng focus được, `role`/`aria-label`, mũi tên/Home/End/Esc, ± zoom, **tap hiện tooltip**, tóm tắt sr-only, reduced-motion; áp S06 scatter, S08 candle/equity, S09 equity/histogram/monthly/episodes, S13 overlay.
- Cursor: `reset θ*` về hand-off của Progress (hiện về fold 1); bộ chọn study S06 causal theo cursor (nhãn 0/1-based thống nhất); `?window=` chuyển vào hash (link cũ rewrite một lần); `seq` ghi khi phát dừng (lane retained); hết `seq=1` giả ở P04; chip Progress thống nhất (S1–S3 deep-dive, S4/S5 hub → đề xuất S4 deep-dive); thông báo một dòng khi hash bị sửa tay rác; phím Space/mũi tên S08 chỉ trong vùng replay (hiện listener toàn cửa sổ); `withWindow` hai bản có mặc định khác nhau → một bản.
- Token (**quyết định cần Bobby, tách commit riêng vì dịch mọi baseline**): `--ink-faint` sáng `#939db0 → #5f6b80` (5,11/5,38/4,81/4,51/4,59 trên paper/raised/sunken/accent-soft/line-soft), `--ink-mute` `#566278`; tối `--ink-faint` `#738095 → #8a98ac` (≥4,98).
- Tab stop: S06 717, S07 130, S09 61 → roving tabindex cho bảng/ledger.
- Đóng F5 phần a11y: axe 0 critical/serious trên 15 màn × 2 theme × 2 độ rộng bằng dữ liệu thật.

## 7. Thứ tự và cổng
W1 → W2 → W3 → W4 → W5 (W5-A/E lõi serial trước). Mỗi đợt: agent song song theo nhóm file không giao nhau (SPEC §5) → tôi ghép → `tsc` + vitest đầy đủ → commit qua hook → deploy preview → lane real-API 54/54 + 4 độ rộng không tràn ngang + probe real-API đúng trạng thái → **visual compare**; baseline chỉ ghi lại khi thay đổi có chủ ý (recorder đã có quyền).
Đo "ít chữ": đếm từ `main.innerText` trước/sau trên 5 run chuẩn; mục tiêu **−25% trên S05–S09 và −50% trên S10–S14**, không cắt thứ làm mất nguồn hoặc tên truy cập.

## 8. Còn cần Bobby
1. Chuyển `window` vào hash (link `?window=` cũ vẫn chạy qua rewrite): khuyến nghị **có** (cursor một chỗ, Back/Forward nhất quán).
2. Phím Space/mũi tên của S08 chỉ trong vùng replay: khuyến nghị **có** (hiện listener toàn cửa sổ).
3. **Publish** R-WFO-022 (ghi approval graph): hỏi lại ngay trước khi bấm.

## 9. Ghi nhận cho Codex (không chặn FE)
- Run WFO tạo gần đây (R-WFO-024/026/027) thiếu hàng RC `METRICS_SEMANTICS` (`P21_RETAINED_REPORT_NOT_SEALED`) dù báo cáo đã seal; R-WFO-022 cũ thì ổn — quan sát, chưa rõ nguyên nhân.
- Tuỳ chọn (SPEC_W1 §8): `selected_trial_ordinal` trên selection của split/search/freeze để S05/S06 in `trial 351 · source 350` mà không phải +1 ở trình duyệt.
