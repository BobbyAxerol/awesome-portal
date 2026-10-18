# UXM-07 — Frontend implementation (scope card, CHƯA được giao)

Trạng thái: **PROPOSED**. Bobby chưa giao phase; chưa có code. Tài liệu này chỉ là thẻ phạm vi để Bobby giao hoặc sửa.
Nguồn thiết kế: [design/README](../../design/README.md), [review2/00 sổ quyết định](../../design/review2/00-decision-register.md), [kit V2](../../design/hifi/v2/README.md), [route/URL/migration](../../design/review2/07-routes-urls-migration.md), [dữ liệu](../../design/review2/04-data-feasibility-backend-asks.md).

## 1. Quyết định đã chốt cho UXM-07 (Bobby, 2026-10-18)
- Lát code đầu: **nền tảng + lát có dữ liệu thật trước.**
- Reader ở ranh giới response: **viết tay** + bảng ràng buộc chéo do Codex ghi (FE-001/RV-1).
- Cockpit: sau khi ghi quyết định **ở lại receipt**, có nút "Next request".
- Operations/Incident: reviewer và researcher **bị chặn**; chỉ thấy trạng thái yêu cầu của mình ở Approvals.
- Một theme Carbon; một mục Approvals chạy cockpit; cockpit sở hữu mọi loại quyết định; researcher thấy allocation + PnL của mình.

## 2. Lát (mỗi lát một lane commit, sau cờ theo từng màn)
| Lát | Nội dung | Có dữ liệu thật? |
| --- | --- | --- |
| S0 Nền tảng | Thêm `--series*`, `--flag-*` vào tokens.css (không `color-mix`); cờ ngữ nghĩa; shell + thanh ngữ cảnh + ⌘K; layer URL (parser, `withContext`, bảng bí danh tab, `ctx`/`from`); một drawer; thẻ ở ≤660px; reader viết tay | Không cần |
| S1 Governance + vận hành | Approvals cockpit (chưa có chart evidence), Operations, Incident (drawer), Access, từ điển lý do cho nút bị chặn | Portal-owned, sớm nhất |
| S2 Danh tính và sự kiện | Fleet bảng (cột không tiền), Blotter, bảng order/fill/position ở Account/Deployment, dải hành trình từ `stage_presence`, Trade Replay (log) | Có sau khi nguồn đạt |
| S3 Tiền mỏng | allocation, balance, PnL cell; heat map; ledger Portfolio | Chờ nguồn PM/TS |
| S4 Chỉ thiết kế đến khi nguồn đạt | Overview KPI/NAV, return/DD/score, capital flow, Compare series, ribbon, evidence diff chart, digest, "As of" | Không (typed-absence 1 dòng) |

## 3. Thứ tự migration giữ CI xanh (07 §4)
1) Codex thêm registry rev 7 (chỉ thêm) · 2) lớp URL + bí danh (không đổi e2e) · 3) `?tab=` thêm cho Sandbox/Canary/Live/Account, route mới tắt cờ · 4) thêm spec V2 cạnh spec V1 · 5) bật từng màn, cùng commit gỡ test V1 tương ứng: Fleet + redirect, Portfolios/M04, Alpha, Stage header, Account, Operations/Incident, Access, Overview, cockpit cuối · 6) xoá component/fixture-lab V1.
Baseline ảnh chỉ re-record bằng `./scripts/portal-web-visual.sh`, ép `=all`, xem contact sheet; không `--update-snapshots` trần.

## 4. Cờ
Giữ `VITE_EXECUTION_PREVIEW_ENABLED` làm cờ tổng; thêm `VITE_EXECUTION_V2_SCREENS=<danh sách>` một manifest giống nhau ở dev và stable; cùng route, hai component (không tiền tố `/v2`); redirect chỉ bật khi màn đích bật; `?v2=1` chỉ để trình diễn, không đổi nguồn dữ liệu.

## 5. Cổng đạt chuẩn từng màn
Trạng thái (healthy/not qualified/researcher/loading/denied/unavailable) trong unit test · e2e BFF-double với 3 persona · baseline ghi lại ở image ghim, xem contact sheet · DOM ≤ 8000, heap ≤ 200 MB, không cắt số, drawer ở 390/834 · nguồn có thật hoặc điều khiển tắt kèm lý do + link M10.

## 6. Yêu cầu và nợ
FE-001…022 (cũ) + **FE-023…036** (vòng rà 2) ở [sổ đồng bộ](../../FRONTEND_BACKEND_SYNC.md). P1 chặn S1/S2: FE-025 (window), FE-027 (vòng đời stage), FE-028 (tiêu chí gate), FE-030 (receipt/quorum).

## 7. Exit và tiếp theo
Chưa giao. Cần Bobby: giao UXM-07 (đủ S0 hoặc S0+S1) kèm tài nguyên test và nhánh đích; xác nhận ai hạ cánh vào cây tích hợp (đang có thay đổi chưa commit của Codex).
