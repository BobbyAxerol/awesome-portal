# P18 — Thanhvuong frontend receipt (Screen 09 Run Report)

**Trạng thái:** `P18-A S09 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push lên primus-origin, chưa PR`.
Backend P18 vẫn là `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK`
([P18 README](./README.md)). Receipt này chỉ ghi lại thay đổi frontend và
evidence. Nó không đổi rule, không đổi contract, không đổi phase gate, và
không gọi P18 là `VERIFIED`.

## 0. Packet và những gì đã đọc

**Packet P18 của Thanhvuong** (cả năm file nằm cạnh file này):

| File | Nội dung |
|---|---|
| `thanhvuong-frontend-receipt.md` | receipt này: đã đọc, git, file, mapping hi-fi, so hi-fi, evidence, discrepancy, scale refine, kết luận |
| [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md) | receipt backend request: `CG-P18-01…10` theo template CLAUDE.md §5 + locator/actual/expected/đề xuất/test/fallback, việc Bobby quyết B1–B6, trạng thái kiểm lại ngày 2026-09-23 |
| [thanhvuong-test-results.json](./thanhvuong-test-results.json) | evidence máy đọc được: từng gate, lệnh, exit, số đếm, gate chưa chạy, SHA-256 ảnh/PDF/log |
| [thanhvuong-debt-register.json](./thanhvuong-debt-register.json) | debt trong scope: `open_implementation_debt` rỗng, `open_debt` rỗng (A1/A2 audit đã sửa ở `29c28f4a`, geometry hi-fi ở `548e8d29`, §4, §5.5, §7); lỗi đã sửa trong phase, request mở, downstream gate |
| [thanhvuong-rollback.md](./thanhvuong-rollback.md) | revert từng commit, theo thứ tự mới nhất trước |

Dòng trạng thái ở Unified §13 và implementation note dưới
[`#rl-p18`](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-p18) trỏ về packet này.

**Đã đọc (`READ`), theo CLAUDE.md §7.9** (commit = commit cuối chạm file đó,
`git log -1 --format=%h -- <file>`). Baseline `primus-origin/docs/research-loop-plan`
= `e39bacfa` như lúc lập plan. Lúc đóng packet (sau `git fetch`) baseline đã tiến
tới `6a87f77b` (5 commit RF-02/preview, không chạm file S09 nào); cột cuối ghi
để đối chiếu. Audit 2026-09-23: baseline tiến tiếp tới `361f68b4`
("QuantBT opens on the Research Loop screens", chạm `QuantBTModule.tsx`;
`git merge-file` với merge-base `30fb9f21`: 0 xung đột; contract report không đổi,
vẫn không có fixture report).

| File | Nhánh (`aea76f69`) | Baseline `e39bacfa` | `6a87f77b` |
|---|---|---|---|
| `CLAUDE.md` (§3, §5, §7, §7.10, §8) | `19310912` | `8ca7bc11` | `8ca7bc11` |
| `upgrade/research_loop/CLAUDE-FOR-thanhvuong.md` (A4, A4.1, A13.1–A13.4) | `30fb9f21` | `30fb9f21` | `30fb9f21` |
| `upgrade/research_loop/THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` | `30fb9f21` | `51b11247` (addendum RF-01/RF-02, đã áp dụng ở P17) | `51b11247` |
| `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` §13 board, `#rl-p18`, `#rl-p13-p17-audit`, `#rl-rs-03` | `c6bad9aa` | `e39bacfa` | `3be077f3` (RF-02 approved; không đổi `#rl-p18`) |
| `evidence/P18/frontend-handoff-claude.md` | `095df2e2` | `095df2e2` | `095df2e2` |
| `evidence/P18/README.md`, `evidence/P18/phase-report.md` | `095df2e2` | `095df2e2` | `095df2e2` |
| `evidence/P17/thanhvuong-*` (packet mẫu, 5 file) | `c6bad9aa` | — (chưa có trên baseline) | — |
| `evidence/RS-03/frontend-handoff-claude.md` | `0507197a` | `0507197a` | `0507197a` |
| `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` §P18 (`P18-T01…T12`, `V11-P18-DR/BR/GX`) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/docs/screens/09_run_report.md` (T01–T10, §9 CSS ledger, §16 copy, §18 SVG) | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `release-v1.1/QuantBT 09 Run Report.dc.html`, mở trong browser ở 1280/660 | `a402f7b9` | `a402f7b9` | `a402f7b9` |
| `packages/contracts/openapi/research-report.openapi.json` + `generated/research-report.d.ts` | `095df2e2` | `095df2e2` | `095df2e2` |
| `apps/control-api/src/research/report.service.ts`, `report.error.ts`, `report.repository.ts` (chỉ đọc, lấy key/label/reason code thật) | — | — | — |

`git diff e39bacfa HEAD --stat -- packages/contracts/openapi/research-report.openapi.json packages/contracts/generated/research-report.d.ts`
rỗng (cũng rỗng với `6a87f77b`). Không có fixture report ở cả ba ref
(`git ls-tree -r <ref> --name-only | grep -i "fixtures.*report"` exit 1).

### 0.1 Guide `P18-T01…T12` + `V11-P18-*` — frontend cover được gì

| ID | Nội dung Guide | Frontend hôm nay |
|---|---|---|
| T01 | Report và hub/raw metrics/digests khớp | **PENDING** — cần API thật; stub không chứng minh parity |
| T02 | Mode5 / selection-adjusted OOS có scope đúng | **PENDING** — chỉ in nhãn/scope server gửi; cần API thật |
| T03 | Print downsample chỉ ảnh hưởng display | Một phần: SVG vẽ đúng `points` server cấp, caption in `emitted_point_count` / `source_observation_count` / `sampling`; số headline không đổi (U06, U23; browser full + print). Không có client downsample |
| T04–T07 | restart / bounded / CSV injection / old engine | Backend (PASS trong [phase-report](./phase-report.md)). Frontend chỉ: filename và `download_href` là của server, không tạo tên file (U17, U24) |
| T08 | Toàn bộ test S09 | Một phần: spec T01, T02, T09, T10 có; T07 (copy verbatim) **một phần** — note no-print, câu T10, title §16.1 verbatim, nhưng passport title, meta header, dòng stage và identity key cố ý khác spec vì contract (D1/D2/D5, `CG-P18-01/03/05/11`); T03 (32 fold), T04 (digest chéo màn bằng fixture), T05/T06 (scratch/FAILED), T08 (axe) **PENDING** (§4.1, §5) |
| T09 | Pick/verify/slider trước Report không đổi θ/metrics/digest | Một phần: browser case 15 `no-mutation-after-inspect` (rời sang `/search` rồi quay lại: text sheet giống hệt, revision giữ, 304). Chứng minh với digest thật cần API thật |
| T10 | Audit reused-original vs linked-child | **PENDING** — contract chưa có field lineage |
| T11 | Re-export sau upgrade engine-default | **PENDING** — backend/API thật; frontend in `presentation_revision` tách với `report_revision` |
| T12 | Warning giữ semantic label ở print và bundle | Một phần: warnings in trong sheet, không ẩn dòng nào, có ở print emulation và PDF (U27, browser print). Bundle download: PENDING API thật |
| `V11-P18-DR` | Delta/dữ liệu | **PENDING** — không có compute/real data ở lane này |
| `V11-P18-BR` | Browser/visual/action | Một phần: `PRODUCT_ROUTE_BROWSER_RECEIPT` với API stub, preview riêng, không phải dev host |
| `V11-P18-GX` | protected hash, no-debt, report | Một phần: hook tay, `git diff --check`, `open_implementation_debt` và `open_debt` rỗng (A1/A2 audit sửa ở `29c28f4a`); không có rebuild/deploy receipt |

`READ` khác `IMPLEMENTED` khác `VERIFIED` (A4.1).

## 1. Git: base, head, branch

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21`, remote duy nhất là `primus-origin` |
| Base của P18 | `19310912b9695c9e5bb48f05432ff4726767d61f` (docs: rule packet CLAUDE.md §7.10) |
| Commit code P18 | `70044e40` feat(research): S09 report client and export hooks · `1757b7d5` feat(research): S09 Run Report screen, route and links · `6057a4c8` test(research): S09 unit lane S09-U01..U26 · `93a435bb` fix(research): S09 warnings print inside the sheet, annotation stays screen-only · `aea76f6923e8d6acc51c851607a79e2f44b51fe7` fix(research): S09 long identifiers wrap, header keeps the certification box, print margins · `29c28f4aea87d43f56dbf1187595de6944863831` fix(research): S09 screen-reader equity table leaves the layout, table cells keep words whole · `548e8d29a7bf13d5f87a0ecdfd11e6bfba121e8c` feat(research): S09 layout follows the hi-fi sheet geometry |
| Ghi chú lịch sử | `1757b7d5` ban đầu là `04495395`, được amend local **trước khi push** (chuyển notice + retry ra ngoài `ResearchPanel`, D9). Không merge, rebase hay force |
| Docs commit | commit docs này (packet 5 file + dòng §13 + implementation note `#rl-p18`); các vòng trước `47165016` (audit), `a9471cdd`; `62cfe6ed` (audit fixes); vòng này `docs(research): P18 packet after hi-fi geometry alignment` |
| Tác giả | `Vuong <thanhvuong11052003@gmail.com>`, trailer `Co-Authored-By: Claude Fable 5.1` |
| Baseline | `docs/research-loop-plan` = `e39bacfa` lúc lập plan, `6a87f77b` lúc đóng packet. **Chưa merge/rebase**. Bobby quyết cách tích hợp (§6, B1) |
| Push / PR | Push `19310912..<commit docs này>` lên `primus-origin` (pre-push chạy tay exit 0), không force; vòng này push `62cfe6ed..<commit docs này>`. Chưa PR |

## 2. File đã sửa (`git diff --numstat 19310912 548e8d29 -- apps/portal/frontend`)

| File | + | − | Mục đích |
|---|---:|---:|---|
| `src/research/reportClient.ts` | 328 | 0 | 4 operation đúng tên generated; 304/`Fresh<T>`; POST export kèm CSRF; `toReportRefusal` (F-04); word maps; `EXPORT_FORMAT_LABEL`, `ARTIFACT_LABEL` |
| `src/research/useReport.ts` | 130 | 0 | Một GET khi vào, không poll, không refetch on focus; retry gửi lại kèm ETag đang giữ (Map in-memory) |
| `src/research/useReportExport.ts` | 152 | 0 | Tạo job → poll 2000 ms chỉ khi QUEUED/RUNNING; dừng khi terminal / unmount / `document.hidden`; 409 giữ job |
| `src/research/reportEquity.ts` | 174 | 0 | `equitySvg` pure function (spec §18): path theo thời gian, bỏ điểm không parse được; nhãn trục y = chuỗi equity server của điểm cao/thấp nhất, ≤ 6 ngày UTC cho trục x, fold boundary kèm `fold_id`, điểm sâu nhất của underwater |
| `src/research/ReportDetail.tsx` | 1109 | 0 | Sheet S09: 16 `data-panel`, geometry theo hi-fi (passport ngang, identity + headline một hàng, equity có trục/legend/underwater 92px, chain + artifacts hai card, promotion + provenance một card), print CSS scoped, `@page { margin: 0.55in }`; bảng sr-only equity trong wrapper `.rr-sr` (ẩn khi in); ô bảng giữ nguyên chữ; một `h1` (title là `h2`); verdict rule đọc từ `provenance.verdict_rule_revision` |
| `src/research/ReportRoute.tsx` | 41 | 0 | Route; đặt `html[data-research-print-sheet]` chỉ khi mount |
| `src/research/reportDetail.test.tsx` | 1036 | 0 | 44 test, nhóm `S09-U01…U40` (U14 tham số ×5) |
| `src/research/utcMinute.ts` | 8 | 0 | `iso()` chuyển nguyên từ `ExecuteDetail.tsx`, dùng chung S08/S09 |
| `src/research/ExecuteDetail.tsx` | 5 | 9 | Import `iso` từ `utcMinute.ts`; `data-next="run-report"` thành Link |
| `src/research/EvidenceFlow.tsx` | 13 | 4 | Hub "generate report → 09" thành Link; "release candidate → 11" giữ refused |
| `src/features/quantbt/QuantBTModule.tsx` | 4 | 1 | Mount `runs/:runId/report`; loại `report` khỏi lookup `/api/runs/:id` cũ |
| `src/research/researchBoundary.test.ts` | 1 | 0 | Thêm `reportClient.ts` vào `NETWORK_MODULES` |
| `tsconfig.json` | 3 | 0 | Alias `@portal/contracts-research-report` |
| **Tổng** | **3004** | **14** | 13 file, tất cả thuộc `apps/portal/frontend/**` (code head `548e8d29`; ở `29c28f4a` là +2660/−14, ở `aea76f69` là +2582/−14). Riêng `548e8d29`: `ReportDetail.tsx` +328/−189, `reportDetail.test.tsx` +156/−6, `reportEquity.ts` +106/−51 |

Không đụng backend, `packages/contracts/**`, OpenAPI, fixture canonical,
migration, `apps/portal/strategy/**`, control-plane, deploy, `package.json` hay
lock file. `npm --prefix packages/contracts run generate:research-report` exit 0,
`git status packages/contracts` sạch.

**Contract đã tiêu thụ:** `research-report.openapi.json` `version 1.0.0`,
SHA-256 `7faa3c5dcf644024…`; `generated/research-report.d.ts` SHA-256
`76d21e7447087431…`. Operation: `researchReportDetailGetV1` (private ETag/304),
`researchReportExportCreateV1` (CSRF), `researchReportExportStatusGetV1`,
`researchReportExportDownloadGetV1` (chỉ dùng `download_href`, không fetch
bytes). Không có DTO tự định nghĩa, không parse prose lỗi, không tính số.

## 3. Mapping hi-fi → component → field → state → test → browser assertion

Viewport 1280 và 660. "Unit" = vitest `S09-Uxx`; "Browser" = probe trên product
route (§5.2), dòng RECEIPT nào cũng `overflow=0 noise=0`.

| Phần tử hi-fi | Component / `data-panel` | Field contract | Typed state | Unit | Browser assertion |
|---|---|---|---|---|---|
| No-print bar (← Hub · Stage 5, crumb, Print, Export, note) | `NoPrintBar` / `noprint-bar` (`.no-print`) | `exports.formats`, `exports.unavailable_formats[]` | mọi state, kể cả loading và refusal | U01, U08, U10, U11 | Print emulation `display:none`; Hub href `/evidence#stage=claim&fold=2`; RC là SPAN có `title`; Parquet/Archive disabled |
| Header, kicker, title, run chip, meta | `Header` / `header` | `run_id`, `sealed_at_utc_ms`, `report_revision`, `presentation_revision`, `frozen_core.report_source` | loading (khung), available | U01, U03 | Còn dưới mọi refusal (chỉ còn `noprint-bar, header, footer`) |
| Certification box | `Header` `[data-cert]` | — (`CG-P18-02`) | typed absence | U02, U30 | `CERT 1280` screen beside=true; print Letter beside=true (sau `aea76f69`) |
| Claim passport | `Passport` / `passport` | `frozen_core.passport[6]` (ReportFact) | AVAILABLE text hoặc NOT_PUBLISHED + reason | U05 | full: 6 fact nằm ngang một hàng ở 1280; partial: reason `P18_*_NOT_PUBLISHED` (U36) |
| Identity block | `Identity` / `identity` | `frozen_core.identity[12]` key/label/value | AVAILABLE hoặc withheld | U05, U37 | 12 hàng; cạnh headline ở 1280 (tỉ lệ 1.21), xếp chồng ở 660 |
| Headline (6 ô) + footnote | `HeadlineRow` / `headline` | `frozen_core.headline[6]`, `headline_footnote` | value hoặc withheld + reason | U03, U04 | full `1.186 / -0.214 / -0.0931 / 412 / 0.5437 / -12.40` nguyên chuỗi; partial 3 ô withheld `P04_SOURCE_DID_NOT_PUBLISH_{OOS_SHARPE,DECAY_MEAN,WIN_RATE}`, `fakeZero=false`; 6 tile 2 cột × 3 hàng (U37) |
| Metrics table (không có trong hi-fi) | `Metrics` / `metrics` | `frozen_core.metrics[8]` | value hoặc withheld | U03 | 8 metric |
| Equity + underwater | `EquityFigure` / `equity` (SVG tĩnh, `equitySvg`) | `frozen_core.equity` points/counts/sampling/availability | AVAILABLE vẽ; NOT_PUBLISHED khung + "series unavailable — numbers unaffected" + reason | U06, U07, U23, U38 | full: title "Equity — stitched OOS (5 folds)", "emitted 240 of 240 source observations · sampling full · UTC", plot 215 px, y `131.0832`/`94.3324`, 6 nhãn ngày, underwater 92 px "-0.029997 fraction"; partial: câu T10 + reason |
| Fold boundary markers | `EquityFigure` | `frozen_core.folds.rows[].start_utc_ms` | chỉ vẽ khi folds AVAILABLE | U06, U38 | 5 boundary kèm nhãn `fold_id` |
| Per-fold verdict | `FoldVerdicts` / `folds` | `frozen_core.folds` (state, rows, reason_code) | rows hoặc một hàng absent + reason | U07 | full `PASS,PASS,WARN,DRAG,PASS`; partial `P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS` |
| Certification chain / stage checks | `StageChain` / `stages` | `frozen_core.stages[5]` key/state/timestamps | PENDING/RUNNING/DONE; không bao giờ PASS | U05, U39 | Stages không có chữ "PASS"; card "Certification chain" cạnh artifacts ở 1280 và Letter (1.1 : 1), xếp chồng ở 660 |
| Key artifacts & digests | `Artifacts` / `artifacts` | `frozen_core.artifacts[7]` | SEALED digest đầy đủ hoặc state + reason | U05, U28 | full 7 SEALED (stub); partial 7 NOT_PUBLISHED đúng reason; digest xuống dòng, không cắt (`CLIP` `[]`) |
| Warnings (không có trong hi-fi) | `Warnings` / `warnings` (trong sheet, sau artifacts) | `frozen_core.warnings[]` | ACTIVE / NOT_APPLICABLE, in mọi dòng | U02, U27 | print: `warnings visible=true` |
| Promotion state | `Promotion` / `promotion` | `frozen_core.promotion` | NOT_PUBLISHED (hằng trong contract) + reason | U05 | `P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL` |
| Provenance | `Provenance` / `provenance` | `provenance.*`, `source_revisions`, `source_digests`, `source_absences` | luôn có | U03, U05, U28 | `CLIP 1280` provenance-line sw 380 = cw 380; `CLIP-PAPER` letter-816 `[]`, a4-794 `[]` |
| Footer | `Footer` / `footer` (khối in cuối) | `run_id`, `sealed_at_utc_ms` | luôn có | U01, U02, U27 | footer là con cuối của sheet; mọi phần tử sau có tổ tiên `.no-print` |
| Export jobs (không có trong hi-fi) | `Exports` / `exports` (`.no-print`) | ExportJob state/filename/size/sha256/download_href/failure_code, `maximum_bytes` | none/requesting/queued/running/ready/failed/refused | U17–U22, U24, U31 | JSON: 1 POST có `x-portal-csrf`, `statusGets=2` rồi dừng, `downloads=0`; CSV failed `P18_EXPORT_TRANSFORM_FAILED`; 409 giữ job, `posts=1` |
| Approval annotation | `AnnotationBlock` / `annotation` (`.no-print`, sau footer) | `approval_annotation` | AVAILABLE hoặc NOT_PUBLISHED + reason | U05, U27 | `P18_APPROVAL_ANNOTATION_NOT_PUBLISHED`; print `display:none` |
| Screen state / refusal | `ReportNotice` (`.no-print`), `ResearchPanel` | HTTP status + `error.code` | loading, partial, stale, denied, empty (404), unavailable, terminal | U01, U07, U12–U16 | 400 terminal; 401 denied; 403 denied `leak=false`; 404 empty `leak=false`; 409 stale; 503 unavailable + retry |
| Print | scoped `<style>`, `html[data-research-print-sheet]` | — | — | U08, U09, U29 | print emulation: shell chrome `none`, sheet visible, `requests-during=0`; nút Print → `window.print` 1 lần, 0 request |
| Deep link / hard refresh / 304 | `ReportRoute`, `useReport` | ETag | — | U12, U13 | 1 GET mỗi lần tải; SPA quay lại gửi `If-None-Match` → 304, `rev-same=true`; reload không gửi INM (Map in-memory) |

## 4. So hi-fi với product (1280 / 660)

Evidence: hi-fi `p18-hifi-09-1280-visible.png` (`5fd5b53938bbd146`) và
`p18-hifi-09-660-visible.png` (`df8cb60d0e8f40c3`) đặt cạnh product sau vòng
geometry `p18-full-1280.png` (`fa49b62246fae639`) và `p18-full-660.png`
(`3412bab7ac56abef`) trong `~/tv-shots/p18-hifi/`; ảnh ghép
`p18-side-by-side-1280.png` (`c4b1ade537d64302`, hi-fi trái, product phải) và
ảnh từng khối `p18-block-{header,passport,identity,equity,stages,promotion}-{1280,660}.png`.
Hi-fi cần `doc-page.js`, file này **không có trong repo** nên `<doc-page>` không
upgrade và giữ `visibility:hidden`; bản `*-visible.png` inject CSS ép visible,
chỉ để xem, file hi-fi không đổi.

Quy tắc (CLAUDE.md rule 9): bố cục theo hi-fi; chỉ được lệch khi thiếu field.
Đo trong browser bằng probe `hifi-geometry @1280/@660` (dòng `GEOM`, screen và
Letter).

| Khối | Hi-fi | Product (`548e8d29`) | Khớp? / lý do còn lệch (chỉ được là thiếu field) |
|---|---|---|---|
| Header | eyebrow 9px uppercase, title Newsreader 27px, meta mono 10px, cert box phải, gạch 2px | eyebrow 9px, title 27px, meta 10px, cert box phải ở 1280 và trên Letter, gạch 2px | **Khớp geometry.** Chữ title cố định "QuantBT Run Report" vì contract không có strategy/symbol/TF cho title (`CG-P18-03`); cert box là typed absence vì không có grade (`CG-P18-02`) |
| Passport | facts nằm ngang (flex wrap, gap 8px 26px, padding 9px 12px), label 8.5px trên, value mono 10.5px dưới; header nền sunken 9.5px | y hệt; 1 hàng ở 1280, 2 hàng trên Letter, wrap ở 660 | **Khớp geometry.** Label là "fact N" thay vì tên key vì `ReportFact` không có key/label (`CG-P18-01`) |
| Identity + headline | một hàng: identity `flex:1.15` grid `auto 1fr` mono 10px; tile `flex:1 1 44%`, value mono 15px/600; footnote 9px | một hàng (tỉ lệ đo 1.21), 6 tile 2 cột × 3 hàng, `headline_footnote` 9px; metrics ngay sau hàng; 660 xếp chồng | **Khớp.** Identity 12 hàng (hi-fi 9) và 6 tile (hi-fi 4) vì contract có 12/6 key cố định; value là chuỗi server nguyên văn, không tô màu/không thêm % (không có field dấu/đơn vị) |
| Equity | figcaption hai đầu (Newsreader 13.5px / mono 8.5px), plot 215px, grid dashed, trục y/x, legend phải, fold dashed kèm nhãn, underwater 92px | y hệt: "Equity — stitched OOS (5 folds)" (số fold chỉ khi folds AVAILABLE), "emitted 240 of 240 source observations · sampling full · UTC", plot 215, 6 nhãn ngày `2024-08-30…2024-10-09`, 5 nhãn fold, legend "Stitched OOS" + "IS account — not published (CG-P18-06)" mờ, underwater 92 "-0.029997 fraction"; SVG thuần, không toFixed/Intl | **Khớp geometry.** Không có đường IS (`CG-P18-06`); trục y chỉ 2 nhãn = chuỗi equity server của điểm cao/thấp nhất (hi-fi 4 tick tính ra — client không được tính số); vế phải caption là count/sampling thay vì filename/digest vì không có field artifact filename (`CG-P18-07`) |
| Certification chain + artifacts | hai card cạnh nhau (1.1 : 1): hàng `S1 · Split` \| mô tả \| cap; artifacts grid `auto 1fr` 9.5px | hai card cạnh nhau ở 1280 và Letter (tỉ lệ 1.1), xếp chồng ở 660; hàng `S1 · Split` \| state + started/completed UTC \| state, không bao giờ PASS; artifacts grid, absence tô màu theo state | **Khớp geometry.** Cột phải là state thay vì cap/binding vì stage không có field kết quả (`CG-P18-05`); tên artifact là enum contract, không có đuôi file (`CG-P18-07`); digest in đầy đủ (invariant §8, D3) |
| Promotion + provenance | một card 2 cột, cột provenance có border-left | y hệt; 660 xếp chồng (border-top) | **Khớp.** Promotion là typed absence (`Promotion.state` hằng `NOT_PUBLISHED`); provenance thêm dl revision/digest/absence (field contract) |
| Footer | mono 8.5px hai đầu: "Quant Ecosystem Portal · Research · confidential" \| run · report · "page prints on letter or A4" | y hệt: `run_id · report <sealed_at>Z · page prints on letter or A4` | **Khớp** |
| Per-fold, metrics, warnings | per-fold 8 cột; không có metrics/warnings | không đổi vòng này | Per-fold 3 cột vì chỉ có fold_id/start/end/verdict (`CG-P18-04`); metrics/warnings là field contract không có trong hi-fi (D6) |
| Chiều rộng sheet | `<doc-page>` (không render được, thiếu `doc-page.js`) | theo cột nội dung của shell (bỏ max-width 880) | Hi-fi không đo được; product lấy bề rộng no-print bar |
| No-print bar, exports, annotation, shell | Hub · RC / Run Report + note | không đổi (D6, D7, D10) | Route 11 chưa có; export theo `exports.formats` |
| 660 | overflow 0 | overflow 0; idrow, chain row, pp card xếp chồng; `GEOM-SPLIT` `[]` | **Khớp** (spec cho phép xếp chồng) |

Kết quả: 7 khối geometry khớp; mọi chỗ còn lệch đều do thiếu field
(`CG-P18-01…07`), không còn lệch vì bố cục. PDF Letter **5 → 4** trang, A4
**5 → 3** (sheet gọn hơn).

### 4.1 Discrepancy hi-fi ≠ spec ≠ contract

**Contract là nguồn thật.** Bố cục theo hi-fi; nhãn theo spec khi contract
không cấp; số/chữ chỉ lấy từ contract. Ô hi-fi không có field thì giữ panel
kèm typed absence + reason.

| # | Mục | Hi-fi | Spec 09 | Contract | Đang làm | Loại |
|---|---|---|---|---|---|---|
| D1 | Passport | 6 key (validation_claim, chronological_claim, oos_used_for_selection, holdout_state, scoring_backend, mode × schedule), "quoted verbatim" từ Stage 5 | 6 dòng "k — v", tên khác | `ReportFact[6]` không có key/label | "claim passport — sealed source facts, quoted verbatim", đánh số fact | `CG-P18-01` |
| D2 | Tiêu đề | theo run | "QuantBT Run Report" | không có strategy/symbol/TF riêng cho title | "QuantBT Run Report" cố định; symbol/TF ở identity | `VISUAL_DECISION_REQUIRED`, `CG-P18-03` |
| D3 | Digest | rút gọn `sha256:2ba4…` | T04: util rút gọn chung | `Digest` đầy đủ | In đầy đủ, xuống dòng; không có util rút gọn chung, `ProvenanceStrip` cũng in đủ | invariant §8 |
| D4 | Folds | 8 cột | bảng in | chỉ fold_id/start/end/verdict | 3 cột + caption | `CG-P18-04` |
| D5 | Stages | chain + cap | 5 dòng PASS | state PENDING/RUNNING/DONE, không có PASS | timeline state + UTC | `CG-P18-05` |
| D6 | Thứ tự khối | — | — | warnings thuộc `frozen_core`; annotation là row mutable riêng | warnings in trong sheet; annotation + exports sau footer, `.no-print` (`93a435bb`) | quyết định coordinator; exit gate "print fields/digests match original revision" |
| D13 | `@page` | `<doc-page margin="0.55in">` | doc-page giữ page box | `doc-page.js` bị cấm trong product (handoff) | Route sở hữu `@page { margin: 0.55in }` trong print rules scoped, chỉ tồn tại khi mount | spec ≠ handoff |
| — | Annotation no-print | không có | — | handoff: annotation tách khỏi frozen core | hiện trên màn hình, không in | theo handoff |
| — | Metrics, warnings, exports | không có | có một phần | có field | vẽ | contract rộng hơn hi-fi |
| — | State "full" trong stub | — | — | `Artifact.state` cho phép `SEALED`; `Promotion.state` là hằng `NOT_PUBLISHED` | Stub "full" có 7 artifact SEALED để thử nhánh render; source `P13_P17_FIXED_PROFILE` hôm nay luôn trả NOT_PUBLISHED (README P18) | ghi để không đọc nhầm stub thành năng lực nguồn |
| — | Spec T05/T06 (scratch, FAILED run) | — | có | report chỉ seal ở `run_completed`; không có field scratch/binding | chưa có biến thể; run chưa seal → 404 `empty` | PENDING |

## 5. Evidence

### 5.1 Test lanes (`apps/portal/frontend`, Node v20.20.2, tree = `aea76f69`; dòng in đậm đầu bảng là tree `548e8d29`, rồi `29c28f4a`)

| Lane | Lệnh | Exit | Kết quả |
|---|---|---:|---|
| **Typecheck + build (tree `548e8d29`)** | `npx tsc -b --noEmit`; `npm run build` | 0 / 0 | PASS (chỉ cảnh báo chunk) |
| **Unit toàn bộ (tree `548e8d29`)** | `npx vitest run` | 0 | **170 file · 3015 pass · 1 skip** (3016). Lần đầu 1 fail là flake `PortalShell` đã biết (§7, B5); chạy lại một lần pass |
| **Unit S09 (tree `548e8d29`)** | `npx vitest run src/research/reportDetail.test.tsx` | 0 | **44/44** (`S09-U01…U40`, U14 ×5); kèm boundary 58/58 |
| **Browser toàn Research, 1 worker (tree `548e8d29`)** | `RESEARCH_SHOT_DIR=~/tv-shots/p18-hifi npx playwright test -c .tv-probe.config.ts --workers=1` | 0 | **131/131** (fixtures 8, product 74, tvp18 49 = 46 + audit-measure 1 + hifi-geometry 2), 4.7 min; 46 RECEIPT `overflow=0 noise=0`; `GEOM` như §4; `CLIP`/`CLIP-PAPER`/split `[]`; `scrollHeight` 3 103, print 816 2 467 = 2 467; PDF Letter 4 trang, A4 3 |
| **Typecheck + build (tree `29c28f4a`)** | `npx tsc -b --noEmit`; `npm run build` | 0 / 0 | PASS (chỉ cảnh báo chunk) |
| **Unit toàn bộ (tree `29c28f4a`)** | `npx vitest run` | 0 | **170 file · 3010 pass · 1 skip** (3011); pass ngay lần đầu, flake `PortalShell` không xuất hiện |
| **Unit S09 (tree `29c28f4a`)** | `npx vitest run src/research/reportDetail.test.tsx` | 0 | **39/39** (`S09-U01…U35`, U14 ×5); kèm boundary 53/53 |
| **Browser toàn Research, 1 worker (tree `29c28f4a`)** | `RESEARCH_SHOT_DIR=~/tv-shots/p18-fix2 npx playwright test -c .tv-probe.config.ts --workers=1` | 0 | **129/129** (fixtures 8, product 74, tvp18 46, audit-measure 1), 4.5 min; 44 RECEIPT `overflow=0 noise=0`; đo trước/sau ở §5.5 |
| Typecheck | `npx tsc -b --noEmit` | 0 | PASS |
| Build | `npm run build` | 0 | PASS (chỉ cảnh báo chunk >500 kB đã có từ trước) |
| Unit toàn bộ | `npx vitest run` | 0 | **170 file · 3006 pass · 1 skip** (baseline 169 / 2971 / 1). Lần chạy đầu fail do flake `PortalShell` (§7), lần hai pass |
| Unit S09 | `npx vitest run src/research/reportDetail.test.tsx` | 0 | 35/35 (`S09-U01…U31`, U14 ×5); kèm boundary 49/49 |
| Boundary | `researchBoundary.test.ts` | 0 | 14/14 |
| Lane bị ảnh hưởng | evidenceFlow, executeReplay, features/quantbt | 0 | 140 pass (6 file) |
| Contracts | `npm --prefix packages/contracts run generate:research-report` | 0 | `git status packages/contracts` sạch |
| Browser toàn Research, 1 worker (tree `93a435bb`) | `playwright test -c <probe config 127.0.0.1:4417> --workers=1` | 0 | **128/128** (fixtures 8, product 74, tvp18 46), 4.6 min |
| Browser S09 probe, chạy lại sau fix (tree `aea76f69`) | `playwright test -c .tv-probe.config.ts e2e/_probe-research-tvp18.spec.ts --workers=1` | 0 | **46/46**, 3.3 min, 44 dòng RECEIPT đều `overflow=0 noise=0`; clip-audit giờ **assert** `[]` ở screen/print/letter-816/a4-794 |
| **Browser toàn Research, 1 worker (tree `47165016` = code `aea76f69`, audit 2026-09-23)** | `RESEARCH_SHOT_DIR=~/tv-shots/p18-audit npx playwright test -c .tv-probe.config.ts --workers=1` | 0 | **128/128** (fixtures 8, product 74, tvp18 46), 4.5 min; 44 RECEIPT `overflow=0 noise=0`; spec `586f39fe2d65f5ba` |
| Browser audit probe (tree `47165016`) | `_probe-research-tvaudit.spec.ts` (tạm, đã xoá) | 0 | 8/8: full/partial 1280/660 16 panel, print 0 request, 404 leak=false; **tìm ra 2 lỗi code** (§5.5) |
| Browser S09 probe lần đầu (tree `93a435bb`) | cùng lệnh | 1 → 0 | run1 40/4 fail do noise route S06 `/current-source/search` 404 và cookie CSRF; run2 44/44 sau khi gắn nhãn noise theo phase |

Playwright 1.62.1, Chromium 151.0.7922.34 headless. Preview là `vite preview`
riêng của workspace ở `127.0.0.1:4417`, dựng từ build trên, đã kill đúng PID sau
khi chạy (`ss -ltnp | grep 4417` rỗng). Không đụng preview 4317–4320 của Bobby.
Spec probe tạm và config probe **không commit, đã xoá** trên server (bản sao ở
scratchpad của phiên: spec B `32dc5f08f7ea7061`, spec chạy lại `586f39fe2d65f5ba`).
Toàn bộ 128 probe đã chạy lại trên head `47165016` (code = `aea76f69`) trong
audit 2026-09-23: 128/128 (§5.5).

### 5.2 Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (API stub)

Route `/research/quantbt/runs/R-WFO-118/report`. Response được stub theo shape
của `apps/control-api/src/research/report.service.ts` (key, label, reason code
thật), vì chưa có fixture canonical (`CG-P18-09`).

| State / tương tác | Kết quả ở 1280 và 660 |
|---|---|
| loading (trả chậm 1500 ms) | `state=loading aria-busy=1 numeric-nodes=0`, 1 GET |
| full | 16 `data-panel` đúng thứ tự D6; headline nguyên chuỗi; không "N/A"; `reportGets=1` |
| partial | câu T10 + reason; 3 headline withheld có reason; `fakeZero=false`; vẫn 16 khối |
| not-published annotation/promotion | reason `P18_APPROVAL_ANNOTATION_NOT_PUBLISHED`, `P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL` |
| 400 / 401 / 403 / 404 / 409 / 503 | terminal / denied / denied / empty / stale / unavailable; không in prose server (`leak=false`); 503 có "read again" |
| 304 | SPA quay lại: GET kèm INM, 304, `rev-same=true meta-same=true` |
| Export JSON | QUEUED → RUNNING → READY, 2 GET status rồi dừng, 0 request thêm trong 5 s, không tự `/download` |
| Export CSV failed | `P18_EXPORT_TRANSFORM_FAILED`, poll dừng |
| Export 409 | giữ job, không POST lần 2 |
| Poll khi unmount / tab ẩn | unmount: 0 status sau 5 s; ẩn (`document.hidden`): 0 request, hiện lại: poll tiếp |
| Print emulation | no-print bar/exports/annotation `none`; shell chrome `none`; sheet/footer/warnings visible; 0 request |
| PDF (`page.pdf`, `printBackground:true`) | sau fix: Letter 119 055 B, A4 118 199 B (trước fix: Letter 116 166 B 6 trang, A4 116 345 B) |
| Deep link + hard refresh | 1 GET mỗi lần tải; giữ hash `#stage=execute&fold=2` |
| Keyboard | `a[back-to-hub]` → `button[print]` → `button[export-json]` → `button[export-csv]`; Enter trên Print → print 1 lần; outline solid |
| Links | Hub "generate report → 09" và S08 `[data-next=run-report]` → `/report`; "release candidate → 11" vẫn SPAN |
| No mutation after inspect | `text-identical=true len=14975 rev-same=true`, lần quay lại là 304 |
| Console / network | noise 0 ở mọi RECEIPT; chỉ same-origin `…/report`, `…/report/exports*` |
| Clip / cert (sau fix) | `CLIP 1280/660` screen/print `[]`; `CLIP-PAPER` letter-816/a4-794 `[]`; `CERT 1280` beside=true screen + print Letter; `CERT 660` screen xếp chồng (cho phép), print Letter beside=true |

Screenshot, PDF và log **không commit** (A4.1). Nằm ở `~/tv-shots/p18/` (tree
`93a435bb`) và `~/tv-shots/p18-fix/` (tree `aea76f69`). SHA-256 16 hex đầu:

| File (`p18-fix/`) | SHA-256 | File (`p18-fix/`) | SHA-256 |
|---|---|---|---|
| `p18-full-1280.png` | `c5f72b4c1de9b74b` | `p18-full-660.png` | `4f9675d5b4b013db` |
| `p18-partial-1280.png` | `a5ab1d94adca7957` | `p18-partial-660.png` | `a3b732ee2fcae6d0` |
| `p18-refusal-403-1280.png` | `93234d0dbbba6a5f` | `p18-refusal-403-660.png` | `aafb275f41bb1498` |
| `p18-refusal-503-1280.png` | `d727b2a4ddf16673` | `p18-refusal-503-660.png` | `cb916583e2d8ebf5` |
| `p18-print-emulated-1280.png` | `056533506eec2d27` | `p18-print-emulated-660.png` | `80085d7ea030cc82` |
| `p18-print-letter.pdf` | `74a52a0347d9f02c` | `p18-print-a4.pdf` | `0ae364b761bf4d15` |
| `p18-clip-provenance-1280.png` | `30d0479253a8cbcd` | `probe.log` (112 dòng) | `32aaa0840aaf7ce5` |
| hi-fi `p18-hifi-09-1280-visible.png` | `5fd5b53938bbd146` | hi-fi `p18-hifi-09-660-visible.png` | `df8cb60d0e8f40c3` |

| File (`p18/`, trước fix) | SHA-256 | File (`p18/`, trước fix) | SHA-256 |
|---|---|---|---|
| `p18-full-1280.png` | `a5fe682939db6259` | `p18-full-660.png` | `df224dce6a41c67c` |
| `p18-print-letter.pdf` | `5b964b2c1ee3ed5e` | `p18-print-a4.pdf` | `a4d5dbc75aa2f271` |
| `p18-clip-provenance-1280.png` (evidence B1) | `dd610e64cccb8cd3` | `probe.log` (110 dòng) | `36c265155dc9da46` |
| `full-suite.log` (128/128) | `21923e05fff5bf5b` | | |

Danh sách đầy đủ ở [thanhvuong-test-results.json](./thanhvuong-test-results.json).

### 5.3 Loại receipt

| Loại | Có? | Ghi chú |
|---|---|---|
| `COMPONENT_FIXTURE_BROWSER_RECEIPT` | không | Không có harness component; unit RTL không tính là loại này |
| `PRODUCT_ROUTE_BROWSER_RECEIPT` | **có** | §5.2, API stub theo shape service (không có fixture → `CG-P18-09`) |
| `REAL_API_E2E_RECEIPT` | **không** | `FEATURE_RESEARCH_REPORTS=false`. Lane preview RF-02 (`6a87f77b`) không bật cờ report |
| axe (a11y scan) | không | axe-core không có trong lock file (như P16/P17, Bobby quyết) |

### 5.4 Hook chạy tay

| Đối tượng | Kiểm tra | Kết quả |
|---|---|---|
| 5 commit code + lần amend `1757b7d5` | `git diff --cached --check` rồi `bash .githooks/pre-commit` trên index | exit 0, ×6 |
| Range `19310912..HEAD` | `git diff --check` | exit 0 |
| Commit code `29c28f4a` | `git diff --cached --check` rồi `bash .githooks/pre-commit` trên index | exit 0 |
| Commit code `548e8d29` | `git diff --cached --check` rồi `bash .githooks/pre-commit` trên index | exit 0 |
| Commit docs này | `bash .githooks/pre-commit` trên index | exit 0 |
| Push `19310912..<commit docs này>` | `printf '<ref> <sha> <ref> <sha>' \| bash .githooks/pre-push primus-origin <url>` | exit 0 |

`core.hooksPath` vẫn không đặt trong workspace (như P16/P17); bù bằng chạy tay.

### 5.5 Audit độc lập 2026-09-23 (head `47165016`)

Audit mắt mới (Opus 5.5) chạy lại browser thật trên head cuối, preview riêng
`127.0.0.1:4417` (đã kill theo process group, `ss -ltnp | grep 4417` rỗng),
probe/config tạm đã xoá, `git status --short` rỗng. Evidence ở
`~/tv-shots/p18-audit/` (121 file, `SHA256SUMS.sha` sha256 `7a887864dd51f184`).

| Mục | Kết quả |
|---|---|
| Toàn bộ probe Research | **128/128**, 1 worker, 4.5 min (`playwright.log` `0d921ba246acf9dc`, `probe.log` 112 dòng `32aaa0840aaf7ce5` — trùng byte với lần chạy `p18-fix`) |
| Ảnh product | `p18-audit-full-1280.png` `c5f72b4c1de9b74b`, `-660` `4f9675d5b4b013db` (trùng byte `p18-fix`: render tất định); print emulation `p18-audit-full-print-1280.png` `6d47ff38b9b3cd4f`; 404 `p18-audit-refusal-404-1280.png` `7968645971986f04` |
| Print | no-print bar / exports / annotation / notice `none`, warnings `block`, module header `none`, 0 request |
| a11y nhanh (không phải axe) | 1 `article`, `nav[aria-label=Report actions]`, 0 `th` thiếu `scope`; trang có **2 `h1`** ("QuantBT Backtest" của module header + "QuantBT Run Report") |
| Bundle | S09 nằm trong chunk `QuantBTModule-*.js` (108 203 B gzip), không có chunk route riêng → spec §14.6 "< 40KB gzip" không đo được, PENDING |
| **A1 — lỗi code** | Bảng `sr-only` các điểm equity (240 hàng) cao **4 818 px** dù `sr-only`: bảng không co dưới nội dung nên `height:1px` không có tác dụng. 1280: `scrollHeight` 6 049 vs đáy nội dung 3 257 (~2 800 px trống cuối trang); print 816: 5 746 vs đáy sheet 2 611. PDF Letter **7 trang, gỡ bảng này còn 5** → ≥ 2 trang trắng cuối bản in. `ReportDetail.tsx:538-551`. Ghi `open_debt` `S09-SRONLY-TABLE-HEIGHT` |
| **A2 — lỗi code** | `.rr-table td { word-break: break-all }` (`ReportDetail.tsx:161-162`) bẻ cả chữ thường: cột state artifacts in "seal/ed" (7/7 ô cao 2 dòng), header "STAT/E", tên "selection_/trace", "fill_ledge/r", "metrics_su/mmary" ở 1280 và print 816. Clip-audit không bắt vì không tràn. Ghi `open_debt` `S09-TABLE-WORD-BREAK` |

Hai lỗi A1/A2 không sửa trong audit (chỉ được sửa docs); **đã sửa ở `29c28f4a`**
(§7), cùng 2 mục nhỏ của audit (2 `h1`; verdict rule hard-code). Đo lại trên
`29c28f4a` (probe `audit-measure @1280`, `~/tv-shots/p18-fix2/`):

| Đo | Trước (`aea76f69`) | Sau (`29c28f4a`) |
|---|---|---|
| `scrollHeight` 1280 | 6 049 (đáy trang 3 257) | 3 307 (đáy trang 3 243; 64 px là padding shell, như nhau khi gỡ bảng sr) |
| print 816 | 5 746 vs đáy sheet 2 611 | 2 597 = 2 597 |
| PDF Letter / A4 | 7 / 6 trang | **5 / 5** trang (gỡ bảng sr vẫn 5 / 5) |
| Số `h1` | 2 | 1 ("QuantBT Backtest" của module header) |
| Chữ bị bẻ trong ô | `sealed`, `selection_trace`, `fill_ledger`, `metrics_summary` | `[]` trên màn 1280 và Letter |
| Clip / cert | `[]` / beside | `[]` ở 1280/660/letter-816/a4-794; cert beside=true 1280 + Letter |

SHA-256 16 hex (`p18-fix2/`): `p18-full-1280.png` `a8ab1b48792ac397`,
`p18-print-letter.pdf` `ecd1cc0d30d73171` (118 772 B), `p18-print-a4.pdf`
`2af23630fb09fdca` (118 185 B), `probe.log` `a190efb59e0be98b`,
`playwright.log` `b1a085ed68fa1571`. PDF trước sửa lưu ở
`p18-audit-before-letter.pdf` (7 trang) / `p18-audit-before-a4.pdf` (6 trang).
Preview 4417 đã kill đúng PID node (kiểm cmdline), `ss -ltnp | grep 4417` rỗng;
probe/config tạm đã xoá.

## 6. Việc Bobby quyết

Chi tiết và đề xuất: [thanhvuong-backend-requests.md §3](./thanhvuong-backend-requests.md#3-việc-bobby-quyết-không-phải-backend).

- **B1** tích hợp baseline `e39bacfa`→`6a87f77b`. File P18 cũng đổi trên
  baseline: chỉ `EvidenceFlow.tsx`; `git merge-file` ba bản (`30fb9f21` /
  `HEAD` / `e39bacfa`) **không xung đột** (`QuantBTModule.tsx`, `tsconfig.json`,
  `researchBoundary.test.ts` cũng 0 xung đột). Xung đột `FreezeDetail.tsx` của
  P17 vẫn còn. Khi tích hợp, `toReportRefusal` chuyển sang `toResearchRefusal`
  + `RefusalNote` của baseline và thêm mã `RESEARCH_REPORT_*` vào
  `SURFACE_CODES`.
- **B2** `VISUAL_DECISION_REQUIRED`: tiêu đề S09 và badge certification.
- **B3** cách chạy axe.
- **B4** PDF Letter/A4 làm PR artifact (không commit được).
- **B5** flake `PortalShell.test.tsx` ngoài diff: có mở `fix/*` riêng không.
- **B6** 401 hiện chỉ có copy; màn session-expired thuộc U07.

## 7. Discrepancy và lỗi tìm ra, sửa trong phase

| Mục | Tìm ra ở | Xử lý |
|---|---|---|
| **S09-HIFI-GEOMETRY** 5 khối + header lệch geometry hi-fi dù contract đủ field (passport dọc, identity/headline xếp chồng, equity không trục/legend, chain/artifacts và promotion/provenance xếp chồng) | Coordinator, rule 9, 2026-09-23 | **Sửa ở `548e8d29`**: passport flex ngang; `.rr-idrow` identity 1.15 : headline 1 (tile 44%, 2 × 3, footnote); equity figcaption hai đầu, plot 215, trục từ chuỗi server, legend, fold label, underwater 92; `.rr-chainrow` 1.1 : 1; `.rr-pp` 2 cột; footer/header theo hi-fi; 660 xếp chồng, print giữ hàng ngang (U36–U40; probe `hifi-geometry`) |
| Header bảng metrics bẻ chữ ở 660 ("Initia l equity", "SCO PE") do `.rr-page { overflow-wrap: anywhere }` (có từ trước, lộ khi xem 660) | Vòng geometry, ảnh 660 | **Sửa ở `548e8d29`**: `.rr-table th { word-break: normal; overflow-wrap: break-word }` (U33); probe split-word mở rộng sang `th`, `.rr-artgrid .k`, passport `.k`: `[]` ở 1280 và 660 |
| **A1** bảng sr-only equity (240 hàng) cao 4 818 px: `scrollHeight` 1280 6 049 vs đáy 3 257; PDF Letter 7 trang (5 khi gỡ bảng) | Audit 2026-09-23 (§5.5) | **Sửa ở `29c28f4a`**: bảng nằm trong `<div className="rr-sr sr-only" data-sr-equity-table>` (block clip: absolute, 1px, overflow hidden, clip); print ẩn `.rr-sr`. `scrollHeight` 3 307, print 816 2 597 = 2 597, Letter **7 → 5**, A4 6 → 5 (U32) |
| **A2** `.rr-table td { word-break: break-all }` bẻ chữ thường ("seal/ed", "STAT/E", tên artifact) | Audit 2026-09-23 (§5.5) | **Sửa ở `29c28f4a`**: `td { word-break: normal; overflow-wrap: break-word }`, chỉ `td.rr-long` giữ `break-all`. Dùng `break-word` thay `anywhere` như đề xuất: `anywhere` hạ min-content nên bảng auto-layout vẫn thu cột và bẻ "sealed" (đo trong browser). Chữ bị bẻ `[]` ở 1280 và Letter (U33) |
| 2 `h1` trên trang | Audit (§5.5 a11y) | **Sửa ở `29c28f4a`**: title report là `h2`; module header giữ `h1` duy nhất (U34) |
| Verdict rule hard-code trong caption fold | Audit notes | **Sửa ở `29c28f4a`**: đọc `provenance.verdict_rule_revision` nguyên chuỗi (U35) |
| **B1** giá trị sealed bị cắt ở provenance line (`word-break: normal` + `.rr-block overflow:hidden`; 1280 sw 478 > cw 380; Letter 478 > 377; A4 478 > 366) | Gói B clip-audit, `p18-clip-provenance-1280.png` `dd610e64cccb8cd3` | **Sửa ở `aea76f69`**: `.rr-long` (`overflow-wrap: anywhere; word-break: break-all`) cho revision/digest/ETag/job id/sha256/filename; bỏ `overflow:hidden`. Probe chạy lại assert clip `[]` (U28) |
| **N1** cert box rớt dòng ở 1280 | Gói B | **Sửa ở `aea76f69`**: cột chữ `flex: 1 1 0; min-width: 0`, `.rr-cert` `flex: none` (U30) |
| **N2** PDF không có lề | Gói B | **Sửa ở `aea76f69`**: `@page { margin: 0.55in }` scoped (U29, D13) |
| **N5** "archive" chữ thường | Gói B | **Sửa ở `aea76f69`**: "Archive" (U31) |
| Thứ tự warnings/annotation (D6) | Gói A | **Sửa ở `93a435bb`**: warnings in trong sheet; annotation ra sau footer, `.no-print` (U27) |
| **N3** OpenAPI `GET …/report` chỉ khai 200/304/400/401/403/404/503; client vẫn map 409 → stale | Gói B | Không phải lỗi UI. `report.service.ts` `read()` trả 404 khi chưa có report; 409 `RESEARCH_REPORT_NOT_READY` chỉ ở materialize/export create. Giữ mapping phòng thủ, ghi `CG-P18-10` |
| **N4/B6** 401 chỉ hiện copy | Gói B | Ngoài S09 (U07) |
| **N6** override riêng `visibilityState` không dừng poll | Gói B | Hook đọc `document.hidden`; tab thật đổi cả hai. Ghi cho probe sau |
| **N7** route S06 `/search` sinh 404 `current-source/search` từ fixture `stubPortalApi` | Gói B | Ngoài S09; probe gắn nhãn noise theo phase |
| Astra checkpoint "do not enter P18 yet" (Unified `#rl-p13-p17-audit`) vs board §13 P18 `S09_BROWSER_PRINT_PENDING_CLAUDE` và handoff giao Claude | Lúc lập plan | Xử lý như P17: làm P18-A frontend consumer trên contract đã publish, **không claim `VERIFIED`**, để Bobby quyết |
| Flake `PortalShell.test.tsx > mounts QuantBT under its canonical route with no nested topbar` (một lần `foundation.test.tsx > P09-T04`) | Gói A | Chạy riêng 52/52 pass; cũng xuất hiện ở `6057a4c8` khi stash fix. Không sửa (ngoài S09), B5 |

## 8. Scale refine (CLAUDE.md §8)

| Ô | S09 |
|---|---|
| **Cardinality** | Contract cố định: passport 6, identity 12, metrics 8, headline 6, stages 5, artifacts 7, warnings ≤ 8, folds ≤ 256 hàng, equity ≤ 600 điểm (`emitted_point_count` max 600). Hi-fi giả định 5 fold; spec T03 giả định 32 fold. Probe dùng 5 fold, 240 điểm |
| **Break point** | Bảng fold: chưa đo với 32/256 hàng (không có fixture; spec T03 PENDING). Dự kiến bảng fold là khối duy nhất vượt một trang giấy; equity SVG không vỡ theo N vì trần 600 điểm |
| **Degradation** | Bảng fold chảy nhiều trang: `.rr-table thead { display: table-header-group }` (thead lặp mỗi trang), `tr { break-inside: avoid }`; passport/identity/headline `break-inside: avoid`. Equity: downsample là **của server** (`sampling` = `FULL` / `EXTREMA_BUCKET_V1`); client không gộp thêm |
| **Server contract** | Đã có: trần `maxItems`, `sampling`, `source_observation_count`, `emitted_point_count`. Cần: fixture 32/256 fold để đo break point (`CG-P18-09`) |
| **Invariant giữ nguyên** | Không rút gọn digest/revision (xuống dòng, không ellipsis); caption equity luôn in "emitted N of M source observations · sampling …"; số in nguyên chuỗi `ExactDecimal` (U25 grep không có `toFixed`/`Intl`); NOT_PUBLISHED không thành 0 |
| **Perf budget** | SVG path ≤ `emitted_point_count` đỉnh (≤ 600); 1 GET report mỗi lần vào, 0 request khi print; poll export 1 interval 2000 ms chỉ khi QUEUED/RUNNING |

## 9. Request cho Codex

Receipt đầy đủ theo template CLAUDE.md §5:
[thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md). Tóm tắt:
`CG-P18-01` passport key/label · `02` certification grade · `03` title theo run ·
`04` cột per-fold · `05` kết quả từng stage · `06` IS equity series · `07`
artifact filename/bytes · `08` caption params handoff · `09` fixture canonical
P18 · `10` 409 trên GET report chưa khai trong OpenAPI · `11` identity spec §16.3 +
binding scratch (thêm ở audit). Tất cả OPEN, kiểm lại 2026-09-23 trên `e39bacfa`,
`6a87f77b` và (audit) `361f68b4`.

## 10. Kết luận có phạm vi

- **`P18-A S09 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · đã push, chưa PR`.**
  Frontend bám hi-fi trong giới hạn contract; mọi khối hi-fi giữ chỗ, ô không có
  field in typed absence + reason code. Hai lỗi audit A1/A2
  và 2 mục nhỏ đã sửa ở `29c28f4a`; geometry hi-fi sửa ở `548e8d29` — mọi chỗ còn lệch hi-fi chỉ do thiếu field (§4, §7); `open_debt` rỗng; còn lại là các mục mở ở §6.
- Chưa `VERIFIED`: thiếu `REAL_API_E2E_RECEIPT` (feature-dark), axe, tích hợp
  baseline (B1), `CG-P18-*`, `VISUAL_DECISION_REQUIRED` tiêu đề/cert (B2).
  Toàn bộ probe Research chạy lại trên `29c28f4a`: 129/129; trên `548e8d29`: 131/131; unit 3015 pass / 1 skip.

## 11. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `ResearchPanel` (state frame, `aria-busy`) | Research shell |
| `Fresh<T>` / `NOT_MODIFIED` + ETag | mẫu `evidenceClient.ts` |
| CSRF POST | mẫu `freezeClient.ts` |
| Copy refusal F-04 | mẫu `replayClient.ts` (`002e4098`) |
| `iso()` UTC phút | chuyển từ `ExecuteDetail.tsx` sang `utcMinute.ts`, không viết bản thứ hai |
| `deepDiveHref` / cursor hash | cursor chung của Research |
| `PortalApiError` | `lib/api` |
| Token màu `--ink-*`, `--accent`, `--warn`, `--bad`; font mono cho số | Fund Paper tokens |

Mới: `equitySvg` (spec §18 yêu cầu SVG tĩnh, không dùng echarts), print CSS
scoped. **Trùng lặp cục bộ:** Freeze/Split vẫn giữ bản `iso` riêng (ngoài
scope). Không có màu raw ngoài token, không copy asset bên ngoài, không dùng
`doc-page.js`.
