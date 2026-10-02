# Rà soát frontend Research Loop (S00–S14) — F1→F5, luồng UX, link qua lại (2026-10-02)

Người đọc: Bobby, **trước khi rà bằng mắt**. Soạn bởi Claude từ 6 báo cáo kiểm toán độc lập (trình duyệt thật + code) và kiểm lại 5 phát hiện then chốt bằng tay. Báo cáo gốc: `evidence/P21/audit-2026-10-02-final/` (`DOCS_A`, `DOCS_B_*`, `FLOW_A/B/C`, `CROSS`). Ảnh (~900, desktop + mobile) ngoài git: `/home/bobby/portal-research-qa-2026-10-02/audit-final/<NHÓM>/`.

## 0. Kết luận ngắn

- **F1, F2, F3 (trung thực, bind field có sẵn, HiFi) về cơ bản xong** trên các run thành công; ledger đang *lệch* (28 dòng đã xong còn ghi mở, 5 dòng ghi xong nhưng code/UI khác).
- **F4 (D-AN-01) xong về chức năng**; rolling bị loại có chủ ý (all-time). Còn nhãn "— OOS" ở S04 trái với câu "all time" trong ledger.
- **F5**: lane real-API 54/54, visual 360/0 fail, D7 có receipt, G-20 xong. **Chưa đóng về a11y**: axe chạy trên dữ liệu thật ra nhiều lỗi nghiêm trọng mà lần axe 90/90 trước (stub) không thấy.
- **Đúng định hướng của bạn ở**: nguồn rõ + vắng có mã, all-time, chart sống (S04), liên kết qua lại trên run thành công, cursor sống qua Back/Forward (5 bước), mobile không cuộn ngang ở 390 trên các màn đi qua.
- **Chưa đúng ở**: (a) **run lỗi/huỷ/chờ** — nhiều màn không nói thật và không có lối thoát; (b) **New Run** vài lỗi hợp lệ giả; (c) **mobile** thanh trên quá cao, mục tiêu chạm quá nhỏ; (d) **chữ/định dạng chưa thống nhất** ("not published" lặp 108 lần, float thô, 5 kiểu ngày); (e) **hub tab = deep-dive** lặp nội dung (cần bạn quyết).
- Không có P0. Tổng ~90 phát hiện; **P1 ≈ 14**, xếp thành 5 đợt sửa ở §5.

## 1. Phạm vi và giới hạn trung thực
Sáu auditor chạy trên preview `:8095` (bản ≈ HEAD, chưa gồm sửa CSS bảng drawdown S09), run: WFO global R-WFO-023, WFO causal R-WFO-027, fixed R-P04-021/022, FAILED R-P04-020, QUEUED R-WFO-025, 404/denied. Mỗi luồng chụp từng bước, bấm link thật, `Back/Forward`, deep-link bản copy, mobile 390/360, bàn phím, axe.
**Không kiểm được (cần dữ liệu/ghi)**: seal-confirm và publish (không có run chưa seal nào đủ bằng chứng để seal), create→progress qua phiên auditor, S14 bước 2–3 (parse bị 403 từ origin `localhost` — **lỗi do auditor gọi sai origin CSRF, không phải của người dùng thật**; tôi đã tạo run bình thường khi đặt đúng `Origin`), mobile hover/loading. Phát hiện "mọi ghi đều 403" của FLOW_A vì thế chỉ giữ lại ý **UX**: ba thông báo 403 khác nhau, không nói phải làm gì.

## 2. Trạng thái F1 → F5 (đối chiếu từng dòng với code + trình duyệt)
112 dòng S00–S06 + toàn bộ S07–S14 + sổ §19 + danh sách hoãn.

| Đợt | Nội dung | Thực tế | Dòng cần sửa/cập nhật |
|---|---|---|---|
| **F1 trung thực** | không in 0 cho null, bỏ nhãn tự đặt, chữ thật | **DONE** trừ 5 dòng *ghi sai* | S08 readout vẫn in `pos 0.03386197520287556` (FG 08-05); tổng phí cửa sổ vẫn **tính ở trình duyệt** `ExecuteCandleReplay.tsx:232` (FG 08-06/07); S06 còn 4 chỗ `?? "—"` (`SearchStageB.tsx:493`, `SearchDetail.tsx:1041/1172/1440`); S03 claim passport in enum thô trái F1b; S00 thẻ "Alpha version" tới banner "Pick a run to open Attempt Lineage" (N-02) |
| **F1b/F1c** | 3 quyết định + giảm chữ | **DONE** (VD-F1-01..03, VD-TEXT-01) | còn dư chữ: S01 `rc — not published` ×43, S04 15 ô "pending source" cho run QUEUED, S02 bảng Review in hai lần |
| **F2 bind field có sẵn** | | **DONE** + đã bind thêm B6/B7/B8/B9/B10/B11 | — |
| **F2b luồng UX** | | **PARTIAL** | xem §4 (lối thoát, cursor, draft) |
| **F3 HiFi parity** | title, khung 272, dấu −, nền | **DONE**; baseline 28 ảnh S00–S14 có | thiếu baseline **S03 Progress, S12 Atlas**; HiFi 09 `doc-page.js` vẫn thiếu; tên ô baseline dùng số "repo screen" lệch số S |
| **F4 D-AN-01 (FE)** | all-time, hero, behavior | **DONE về chức năng**; `rolling` WONT_DO | S04 biểu đồ đang tên "Strategy vs benchmark — **OOS**", ledger ghi "all time"; S09 vẫn in +0,12% và −0,15% là "net OOS return" không nêu nguồn (G-02) |
| **F5 lane/test** | lane, axe, visual | lane **54/54**, visual **360/0**, D7 **đóng**, G-20 **đóng** | **a11y chưa đóng**: axe trên dữ liệu thật có lỗi nghiêm trọng (§3); stub lane P22 S11 dựng tay chưa chạy lại ở mọi chỗ |

**Ledger lệch (cần sửa trong markdown):** 28 dòng LEDGER_STALE (xong còn ghi mở, vd 00-1a..d, 02-5/7/10a/16/18, 03-I/J, 04-G/H/L, X-07 titles, minus, faint ink, S09 QA #7/#13/#24/#32/#35/#42, "rc & publish dead link"), 5 dòng WRONG (ở bảng trên), §19 cột trạng thái còn ghi OPEN cho G-01…G-17 dù §22/§24/§28 đã chuyển.

## 3. Sổ backend (§19) — thực tế trên preview
Giao: G-01 (pair 2 chiều 200, 020×023 200; WFO×P04 refused có kiểu), G-03, G-04, G-05, G-06, G-07, G-09, G-12, G-13, G-14, G-15, G-17. Một phần: G-02 (số đã có basis nhưng S09 chưa nêu), G-10 (verified_range có; tick/lot/expiry NOT_PUBLISHED), G-11 (7 run P04 `SEALED_ENRICHMENT_NOT_COMPUTED`). Mở: **G-08** (WFO không có order/fill/blotter/MAE-MFE), **G-18**. G-16 WONT_DO. Chỉ còn việc Codex: G-08, G-18, source-time IS, VN profile, P23/P24.
Lưu ý: `overall.pct = 10` vẫn được server trả cho run FAILED — màn không được coi là tiến độ.

## 4. Luồng và link qua lại (đã bấm thật)
| Luồng | Kết quả |
|---|---|
| Journey → Library → hub → stage → Report → RC → Lineage → Compare → Library (run **thành công**) | **Đi được**, có nút tới/lui mọi màn, Back/Forward giữ cursor qua 5 bước, copy link mở lại đúng trạng thái trên cả 3 run |
| Hub ↔ deep-dive S05–S08 | link có; **mỗi tab hub hiển thị cả thân deep-dive** (2 URL, điều khiển trùng) — **cần bạn quyết** |
| Run **FAILED / CANCELLED / QUEUED / không tồn tại / denied** | Progress, hub, RC có lối ra; **Report, RC composer, Lineage/Compare skeleton thì không** và nhiều màn chỉ hiện "EMPTY/PARTIAL" chung, không nói "run đã lỗi" |
| New Run (draft → preflight → create) | tới preflight được; **create chưa kiểm được** (xem §1); rời giữa chừng làm mất draft, 1 lần Back ra khỏi wizard |

## 5. Phát hiện gộp, xếp theo mức và đợt sửa
(P1 ≈ 14. ★ = tôi kiểm lại bằng tay: **đúng**.)

### Đợt W1 — Trung thực trạng thái run + lối thoát (P1, làm trước)
1. ★ **Hub run FAILED ghi `S4 EXECUTE · RUNNING`** — chip stage phải theo trạng thái run (FLOW_C #1).
2. **RC bỏ qua trạng thái run**: run lỗi/huỷ/chờ vẫn thấy composer DRAFT; cần màn "run đã lỗi/huỷ — không có gì để release" + lối tới Progress/Library/New Run (FLOW_C #2).
3. ★ **RC đã seal vẫn in "local seal blocked"** cạnh "SEALED LOCALLY" + nút Publish (FLOW_C #3, DOCS_B S11).
4. **Report/Lineage/Compare cho run huỷ/chờ/không tồn tại/denied**: màn EMPTY chung, không có link Library; Report 404 còn nút Print và link tới hub của run không tồn tại (FLOW_C #4–5).
5. **S10 mặc định chỉ 3/49 attempt, 5 attempt mới nhất bị giấu sau "+46 probes"** (DOCS_B) — mở theo attempt đang xem hoặc N mới nhất.
6. **Cùng một trial hai số**: S03/S04 "351", S05/S06 "350", không ghi 0/1-based (DOCS_A N-03). Ghi rõ "trial 351 (source id 350)".
7. P2: link ngược của Report/RC/S14 **cứng `fold=1`** làm mất cursor; thiếu `?attempt=` (FLOW_C #6, DOCS_B).

### Đợt W2 — New Run đúng (P1)
8. ★ **WFO nâng cao để trống vẫn "valid", Review không lỗi, Preflight bật** (khác Three-Window). 
9. ★ **Ký hiệu không có trong danh mục (`ZZZ`) vẫn "valid"** và chảy xuống Review.
10. **Rời giữa chừng làm mất draft; Back từ bất kỳ bước nào ra khỏi wizard; quay lại `?step=review` với form rỗng.** Cần push history mỗi bước hoặc hỏi "bỏ draft?".
11. P2: không có nút Back/Next giữa 8 bước; Strategy và Optimization gần chỉ-đọc mà tốn 2 click; Review liệt kê thiếu lỗi, một câu chung cho mọi lỗi cửa sổ, không link tới bước chứa lỗi; đỏ "A symbol is required." ngay khi chọn dataset.
12. P2: ba thông báo 403 khác nhau, không nói phải làm gì → một trạng thái "phiên chỉ đọc" thống nhất.
13. P2: Command Center / Journey (node 04/05/12) vẫn tới màn **cũ** `/new` `/imports` `/runs/legacy`, hai trải nghiệm "New run"; Journey "shipped" gắn nhầm. `Runs (1)` trong khi library có 49. Alpha dropdown còn `s14-ui-receipt`.

### Đợt W3 — Mobile (P1)
14. **Thanh trên cao 129–153px**, S04 thêm thẻ cursor sticky ~165px → che ~300/800px; gom Theme/Density/Planned modules vào drawer, không sticky hai tầng.
15. **Tab strip hub: ô "→ PROMOTION · SOON" đè lên tab S3 FREEZE** ở 390px (FLOW_B báo; tôi xác nhận dải tab dài 904px, chưa đo chồng lấn trực tiếp).
16. **Mục tiêu chạm**: hầu hết 12–19px (S01: 303/354 dưới 24px; hub: 49/56 dưới 32px; stepper fold 13×14). Mục tiêu ≥24px (WCAG 2.5.8), CTA chính ≥40px.
17. Cuộn ngang: Command Center 506px, `/research/quantbt` 412px (thẻ journey `min-w`), S03 chip claim tràn 3px ở 360; S09 cột digest "một ký tự mỗi dòng"; S07 hàng causal bị cắt ở 1280 và 390.

### Đợt W4 — Nhất quán (P1/P2: một component, không vá lẻ)
18. **Một component "vắng"**: câu từ lý do server, mã ở tooltip, 1 kiểu (hiện 8 kiểu trên 13 màn; "not published" ×108 ở S01 và S06). Run QUEUED vẽ 15 ô "pending source".
19. **Một formatter giá trị**: enum (cùng giá trị 3 dạng chữ), ngày `YYYY-MM-DD HH:mm UTC` (hiện 5 kiểu), không float thô (S08 `pos`, tooltip Compare `19909.4192…`, `-0.000` cho −3.3e-16), bảng sr-only ISO-ms.
20. **Một header cho S03–S14**: crumb + h1 + `← prev · next →` + copy-link; thêm h1 cho S04/S09–S13; 5 biến thể header/breadcrumb hiện tại; title 3 mẫu; `Runs / R-xxx / stage` cho cả S05–S07 (hiện chỉ có "Evidence Flow").
21. **CLS cao**: S05 0,79, S09 0,69, S04 0,45; flash `rrun_3d56…` trong crumb trước khi nhãn R-WFO-… đến → skeleton giữ chiều cao + không hiện id thô.
22. Cắt chữ: S01 `rc — not published` ×43 → "no release candidate" hoặc bỏ; rail Review lặp; chip tự lặp; "Rebased 100" luôn disabled (bỏ); chuỗi regex làm helper text; `TRONG INBOX` (có thể lỗi chính tả).

### Đợt W5 — A11y, chart, cursor (P1/P2)
23. **Axe nghiêm trọng (dữ liệu thật)**: S13 `aria-pressed` + link tương phản 1,67:1 sáng/1,31:1 tối; S06 135 `aria-label` trên span không role; S07 nested-interactive; S03 vùng log không focus được; S05 16 nút θ-lane 2,52:1; h1/h2 thiếu và 2 `<main>` ở S04 404.
24. **Chart**: chỉ S04 có bàn phím/chạm/hover; S08, S09, S06 chỉ hover, không `tabindex`/label; S09 tap không hiện tooltip; trục chồng nhau ở mobile; S06 scatter hover/click chưa xác nhận.
25. **Cursor**: "reset θ*" về fold 1 thay vì hand-off của Progress (fold 9/trial 351); bộ chọn study S06 causal không theo cursor ("STUDY 0 · OUTER FOLD 0" khi `fold=2`); `?window=` rơi khi qua crumb/next-prev; `seq` S08 không ghi vào hash (copy link không chia sẻ được bar), P04 lại thêm `seq=1` dù lane không có; chip Progress S1–S3 → deep-dive nhưng S4/S5 → tab hub.
26. P2/P3 còn lại: S11 ghost card khi không tìm thấy; S12 "EMPTY" với tab chết; S13 hướng "claim ↑" khó hiểu, 23 cột config-diff không "top N/total"; S14 stepper thiếu mũi tên, lỗi origin in hai lần, file không phải `.py` vẫn nhận; Library tìm kiếm không khớp nhãn thấy (R-P04-022 → 0 kết quả), nhãn "LAST 30D" cạnh đường all-time; selecting run thứ 3 âm thầm đẩy run cũ; Back từ hub về Library mất vị trí cuộn.

## 6. Cần bạn quyết (chỉ những điều tôi không tự quyết được)
1. **Hub tab vs deep-dive**: giữ cả hai (hiện lặp nội dung) hay hub chỉ tóm tắt + link? (theo "giảm chữ" tôi nghiêng về: tab hub là bản tóm tắt, deep-dive là thân đầy đủ.)
2. **Draft khi rời giữa chừng**: lưu tự động (đang có cho reload) mở rộng cho rời trong app, hay hỏi xác nhận?
3. **Màn cũ** `/new`, `/imports`, `/runs/legacy` còn gắn "shipped": chuyển hướng sang màn mới hay ẩn?
4. **Số trial**: hiện "351 (source id 350)" ở mọi màn — OK?
5. **S10 mặc định**: mở theo attempt đang xem + N mới nhất — OK?
6. **Run chưa seal để kiểm seal/publish**: cho tôi tạo một run đủ bằng chứng trên preview (cần Codex/hoặc tôi điều chỉnh) để kiểm hộp xác nhận seal và publish?

## 7. Đề xuất thực hiện (nếu bạn đồng ý, tôi làm tự động theo đợt, mỗi đợt có test + trình duyệt + visual)
W1 → W2 → W3 → W4 → W5. W1/W2 sửa lỗi trung thực/đúng nghiệp vụ (ưu tiên cao nhất, ảnh hưởng baseline ít); W3/W4 đổi giao diện nhiều → chạy recorder baseline sau mỗi đợt; W5 gồm axe để đóng F5 phần a11y. Mỗi đợt dùng agent song song, tôi ghép + commit qua hook + deploy + đo lại bằng đúng các script audit này.
