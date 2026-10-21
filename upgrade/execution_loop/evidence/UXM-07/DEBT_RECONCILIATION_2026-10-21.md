# Đối soát debt-register UXM-07, 2026-10-21

Pin: `claude/fe-parity` @ `799effc8`. Chỉ đọc git, mã, receipt; không chạy test, không Docker, không sửa mã/test/snapshot. Sổ: [debt-register.json](debt-register.json) (viết lại: 23 mở, 17 đóng). Lane: FIXTURE_LAB/BFF_DOUBLE; không mục nào là INSTALLED/CONNECTED/OWNER_ACCEPTED.

Kết quả: 19 mục mở cũ → **11 đóng**, **8 còn mở** (4 thu hẹp); **15 mục mới** (026–040). Tổng: 23 mở, 17 đóng (6 đóng cũ + 11).
Không có mục SUPERSEDED thuần; 016 và 018 thu hẹp thay vì đóng.

Lệch SHA: nhiều SHA trong sổ cũ và trong lời giao việc là SHA trước rebase, không có trong HEAD. Đã quy về SHA trong HEAD: `008603b4`→`543b30b4`, `34b30032`→`a067682e` (001), `0341aec1`→`d4bab3b2` (003), `185076d8`/`8da315b9`→`8e051084`/`d519232e` (010), `2b9c6fcf`/`654a39b3`/`185076d8`→`e5ba9eaf`/`a2f45299`/`8e051084` (012), `83854d9d`→`4b12bb0c`. Đã sửa `closed_by` ở 001/003/010/012 trong sổ.

## 1. Bảng mục cũ

| id | Trước | Sau | Bằng chứng (SHA có trong HEAD) |
| --- | --- | --- | --- |
| 004 reader defects | mở (FE-048 + MD) | MỞ, hẹp: chỉ FE-048 và 5 `it.fails` có chủ ý | FE xong `bcfde9fe`, `809d9360`, `dc0bded5`, `4c65f2e4` (không in 0); MD-1..8 Codex ACCEPTED (ACK_ALL_BACKEND §3.3); FE-048 vẫn OPEN (backend-requests.md) |
| 005 tên capability tạm | mở | MỞ (chờ chủ), refresh | W1/W3 + route tự xem `a68f17a6`, `9c90e68a`; `execution.accounts.manage` đã bỏ; `roleNav.ts V2_CAPABILITY` còn 4 tên `execution.*`/`portal.execution.blotter.read` |
| 006 Compare không có registry row | mở | MỞ | `registry.json` revision 8, không có `EXECUTION_COMPARE_SCREEN`; baseline Compare ghi trên `?view=compare` |
| 007 đỏ visual/e2e trên tip Codex | mở | **ĐÓNG** | `0356b0dc` (surface audit, EL-V2-05, c06 bỏ khỏi chromium project, 1 baseline ghi lại); compare lần 1 580/37/16 (HOOK_RESULT, HANDOFF §10); chạy lại trên SHA cuối chưa có receipt → 037 |
| 008 hàng HIFI chưa làm | mở | MỞ (polish), refresh | T-B5 Table/Expand đã có (`charts/ChartTools.tsx`, `693ee04d`); Bobby duyệt copy 2026-10-21 (BOBBY_DECISIONS row 1); còn Y-label thập phân, Open orders, L-B7, OP-5 |
| 011 reader tự-eligibility chưa nối | mở | MỞ, hẹp | W1/W3 xong; Codex đã trả Q1–Q6; còn câu Access "Not published (FE-015)" (`access/index.tsx:284`) chờ Bobby/Codex duyệt chữ, và nối laneModel (FE-059/060) |
| 013 phát hiện reader/testkit | mở | MỞ, còn 4/5 | testkit `discriminator` đóng (`ad118f15`); còn `tradeReplayModel.ts:55`, `subjectActivity.ts:69`, `portfolios/format.tsx:86`, V1 `accountApi.ts:163` (đều xác minh ở HEAD) |
| 014 realtimeProducerConsumer đỏ | mở ("môi trường Codex") | **ĐÓNG** | `11906064`: stub `Optional` thiếu trong harness; không phải lỗi môi trường. Hook `a896bd08` ghi vitest `src/execution`+`src/app` xanh. Không có receipt chạy riêng; không chạy lại ở đây (worktree thiếu node_modules) |
| 015 KNOWN_OVERFLOW 9 hàng | mở | **ĐÓNG** | `c78f48c8`; `e2e/execution-v2-s1.spec.ts` có `KNOWN_OVERFLOW = {}`; s1+links 76 pass (HANDOFF §5) |
| 016 baseline V2 | mở | MỞ, thu hẹp | `fe84ee69`+`bc83e84b`+`2fb75539`: 46 ảnh, ghi 46 pass, so sánh 46/46 hai lần, rồi 46/46 hai lần sau lượt hai (v2-baselines README). Chưa có: New request (trang+drawer, dock ≥1500), Operations dock/incident, Fleet Board/Map, form Exit, form pending-control |
| 017 axe | mở | **ĐÓNG** | `939189ac` (axe 32 route × 3 độ rộng), `438dc1ee` (`KNOWN_AXE={}`), ux-audit-B: 0 vi phạm / 25 route; UXM-10 README F-2 đã ghi mục này là cũ |
| 018 thiếu conformance | mở | MỞ, thu hẹp | Còn thiếu: reader Workbench (`execution-paper-read.v1`), kết quả create-request; Live V1 chỉ phủ ở `dispatch.conformance` (6 body × 8 route). Đã có: Sandbox, Canary, lookup (FE-069), catalogue, scoped, fleet realtime, BE-P4/12/14/15/17 |
| 019 V1-shared chưa qua visual | mở | **ĐÓNG** | compare pinned image trên tip 2026-10-20: 580 pass; 1 lệch thật ghi lại, 36 lệch là test/môi trường, sửa ở `0356b0dc`, `543b30b4`, `97454777`. So sánh trên SHA hạ cánh → 037 |
| 020 PAPER_EXIT lineage không có route | mở | **ĐÓNG** (FE) | `c78f48c8` `sandbox/lineageRoute.ts` + `lineageRoute.test.ts`. Dư: dòng allow-list `sandbox-lineage-paper-exit` trong `e2e/execution-v2-links.spec.ts` đã chết, nên xoá; Codex có thể publish href đã mount (tuỳ chọn) |
| 021 drawer dock ≥1500 | đã CLOSED trong mảng mở | **ĐÓNG** (chuyển mảng) | `c78f48c8` |
| 022 Fleet 8 lanes | đã CLOSED trong mảng mở | **ĐÓNG** (chuyển mảng) | `9215c5dd` |
| 023 Playwright V2 2/76 | đã CLOSED trong mảng mở | **ĐÓNG** (chuyển mảng) | `6e741dc0` (requestPolicy trên route canonical); `543b30b4`, `97454777`; s1+links 76 |
| 024 duyệt sửa shell | APPROVED_BY_BOBBY | **ĐÓNG** (chuyển mảng) | Bobby 2026-10-20; digest flag-off ghim |
| 025 đổi V1 không sau cờ | APPROVED_BY_BOBBY | **ĐÓNG** `ACCEPTED_EXCEPTION` | Bobby 2026-10-20; giữ để biết khi rollback cờ |

Đã đóng từ trước, chỉ sửa SHA: 001, 002, 003, 009, 010, 012.

## 2. Mục mới (đều đã xác minh trong mã hoặc receipt; chưa chạy test)

| id | Nội dung | Nguồn xác minh | Chủ |
| --- | --- | --- | --- |
| 026 | Notice nguồn Fleet realtime `NOT_COMMISSIONED`; stream chỉ báo "có revision mới", dark tới khi có grant | BE-P17.md; CODEX_LANDING_REVIEW §5 | Edge/nguồn |
| 027 | `AlphaFleetRealtimeService.revokeSession` không có nơi gọi; độ trễ thật ≤1 chu kỳ poll (5 s) | `alpha-fleet-realtime.service.ts:229`; BE-P17 mục 3, 5 | Claude (BE), Codex review |
| 028 | B1: ≤~7 câu SQL luôn bật/request, `statement_timeout` từng câu, không deadline cả tx, gate EXPLAIN/10^6 link chưa chạy | b1-handoff.md dòng 93/108/137/140 | Codex quyết, Claude chạy PG |
| 029 | NET_PNL không dedupe theo ownership: account chung bị nhân đôi nếu nguồn gửi hai fact | BE-P16.md hàng #11 | Core/PM + Claude/Codex |
| 030 | Pager slice chỉ fixture; contract không có operation trang kế | `5bc040f6`; UXM-08 README yêu cầu A | Codex (operation) → Claude (port) |
| 031 | Trang phone dài: Users@390 = 7.673 px / 123 hàng; Alpha Orders@390 = 4.466 px | v2-baselines README | Claude |
| 032 | Vitest flaky khi tải: account search, portfolio "Net PnL ONCE"; lead báo thêm fleetDataset (chưa tái hiện ở đây) | ui-copy-diet-manager, ux-audit-B README | Claude |
| 033 | `createPaperExit`/`captureR2`: 5xx và 2xx không đọc được không thành OUTCOME_UNKNOWN (khác `captureSandboxNote`); màn nói "không ghi" sai | `httpApi.ts:754`, `ExitReviewRequest.tsx:182-185,288` | Claude; Bobby (ngoại lệ V1) |
| 034 | Câu từ chối Exit in "(unavailable)" cho 409 (từ `panelStatusForHttp`) | `ExitReviewRequest.tsx:288`, `adapter.ts:599`, `routeTable.ts:191` | Claude |
| 035 | CR-02 còn CHANGE: retry repair dùng chung `last_error_*`, revision cũ có thể đói | CODEX_LANDING_REVIEW §8, §10; `manager-series.store.ts` | Claude, Codex review |
| 036 | CR-01 (`dd9609af`) chưa có receipt chạy tập trung; PG NOT_RUN | CODEX_LANDING_REVIEW §9; BE-P17 §9 | Claude |
| 037 | Gate trên SHA đóng băng: hook R2/R3 + visual cả suite; carry 2 đường native client của Codex; rebase; ff-only | HOOK_RESULT; F1_F9 F4; LANDING_REVIEW §6, §8, §10 | Claude + Codex integrator |
| 038 | Hàng trạng thái cũ còn ghi "mở/NOT_RUN" (HANDOFF §10, F1_F9 F4/F6/F7, README UXM-07) | LANDING_REVIEW §5, §10 | Claude |
| 039 | Account 360 demoted dùng `--ink-faint: var(--ink-soft)` riêng; chưa quyết cách làm chung | `account.css:434-442`; UXM-10 F-5(a) | Bobby/Claude |
| 040 | Phát hiện audit A/B ghi "open" chưa có hàng sổ, chưa kiểm lại ở HEAD (B16/17/20/22/24/27, A10 đã sửa) | READMEs audit A/B | Claude; Bobby (design call) |

Đã kiểm, không thêm: "Operations dock/Resolve reason bị cắt" — đã sửa bằng `a13b4fa6` (`dock.css`: lý do wrap, tiêu đề dock là tên lệnh); chỉ kiểm bằng CSS/commit, không chụp lại màn hình.

## 3. Còn lại thật sự, theo chủ

**Claude (không chờ ai):** 016 thêm baseline cho trạng thái chưa phủ (sau khi đóng băng) · 018 hai conformance + ma trận · 013 bốn mục reader · 031, 032, 034, 036, 038, 040 · 035 CR-02 (migration additive, PG proof) · 027 nối `revokeSession` sau review · xoá dòng allow-list chết (020) · 037 gate trên SHA cuối + carry 2 đường Codex khi có SHA.

**Codex:** FE-048 (004) · tên capability + projection (005) · `EXECUTION_COMPARE_SCREEN` + FE-039 ở registry kế tiếp (006) · review CR-01/CR-02, B1 (028: include=, deadline, EXPLAIN) · operation trang kế cho slice (030) · SHA native-business-read-client cho integrator · ff-only landing (037).

**Bobby:** chữ ô Access per-action eligibility (011) · ngoại lệ V1 cho 033 (và 013 nếu đổi pixel V1) · cách làm chung cho demotion (039) · các design call trong 040 · Y-label thập phân (008, cùng Codex).

**Chủ nguồn (Edge/PM/Core):** notice source Fleet (026) · statement đếm account chung một lần theo ownership (029) · nguồn PnL/equity theo deployment (Bobby đã chốt chưa mở subject Alpha/Deployment, 2026-10-21).

Không đổi: ELP2-10 vẫn NOT_MET; Core009 `PREPARED_SOURCE_ONLY`; các gate đo M-1..M-7/G2 chờ Core009 + nguồn tài chính.
