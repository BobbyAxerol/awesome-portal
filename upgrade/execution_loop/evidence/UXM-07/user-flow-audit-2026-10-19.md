# UXM-07 — Audit luồng người dùng (UX journeys) và route, 2026-10-19

Chủ: Claude. Hai audit chỉ-đọc độc lập (luồng hành trình và route) đối chiếu concept/hi-fi/spec đã duyệt với mã tại `855ad7c0`; kèm bộ crawler link chạy thật (e2e). Phần này ghi kết quả audit luồng; kết quả route và crawler ghi ở mục cuối khi xong.

## Kết luận
Luồng chính đã chạy (Overview→Operations→Incident, Fleet→Alpha 360, Portfolios→Compare, Operations→Incident, ⌘K). Còn **10 lỗi luồng** và nhiều chỗ thiếu link/lý do disabled. Phần lớn là sửa nhỏ phía FE; hai vấn đề cần backend/quyết định (FE-037 quyền tạm; hành động ghi của cockpit).

## 10 lỗi luồng hại nhất
| # | Lỗi | Vị trí | Sửa nhỏ nhất | Loại |
| --- | --- | --- | --- | --- |
| 1 | Session thật của owner không có `execution.*`, nên V2 coi là researcher / từ chối Accounts / ẩn Blotter (e2e che lỗi vì double cấp sẵn quyền) | `overview/index.tsx:124`, `account/index.tsx:85`, `alpha/index.tsx:114`, `blotter/index.tsx:153`, `roleNav.ts`, `e2e/bffAnswerer.ts:75` | **Không đổi fail-closed** (luật trung thực). Giữ cờ V2 tắt ở stack có session thật cho tới khi Codex trả lời FE-037/058; preview fixture không bị ảnh hưởng vì fixture BFF cấp capability | Chờ Codex |
| 2 | Link chết trong Admin: mặc định `/execution/portfolios` không có route | `admin/index.tsx:74`, `ActionPane.tsx:212`, test pin sai `admin.test.tsx:130` | đổi mặc định thành `/deployments/portfolios` | FE |
| 3 | Researcher mở request của mình lại thấy danh sách | `cockpit/index.tsx:572` (`mode === "own"` bỏ `pathSelection`) | hiển thị `EvidenceFrame` chỉ-đọc cho request đó | FE |
| 4 | Mất `workspace_id`/ngữ cảnh khi Esc ở cockpit và khi dùng sidebar | `ExecutionPreviewRoute.tsx:345`, `Sidebar.tsx` | giữ `search` ngữ cảnh khi navigate; `NavLink` dùng `withContext` | FE |
| 5 | Mục tiêu Operations (Portfolio/Account/Deployment) là chữ thường, không phải link | `QueueTable.tsx:38`, `OperationDock.tsx:85`, `IncidentRootDrawer.tsx:160` | dùng `targetHrefFor` + `withContext` | FE |
| 6 | Href do server phát (`?operation_id=`, `?filter=…`) không được Operations đọc | `command-center.repository.ts:403,437,523,566`; `links.ts canonicalHref` | map `operation_id`→`operation`, đọc `filter` hoặc ghi chú không áp | FE (+ lỗi cũ V1) |
| 7 | Researcher không có đường đi (cột Alpha không phải link, không có "Alpha Fleet"); Alpha 360 thiếu "Request archive"/"Request gate review" (kể cả dạng tắt kèm lý do) | `overview/index.tsx:179-186`, `alpha/index.tsx` | thêm `Link` và hai `DockAction` tắt (FE-020/034) | FE |
| 8 | Back không biết nguồn, không khôi phục trạng thái danh sách (chỉ Compare có `from`) | `alpha/index.tsx:203` và các `Link` vào Alpha/Account/Portfolio | `from=` hoặc `state` nguồn, đích dựng nhãn và đích từ đó | FE |
| 9 | Bộ chọn env trong context bar là nút giả trên Fleet, Overview, Cockpit, Portfolios, Compare | `ExecutionPreviewRoute.tsx` (envLock), `fleet pickLens` | `envLock` có lý do giống `BLOTTER_ENV_LOCK`; `pickLens` đặt `env` theo lens | FE |
| 10 | D9 (disabled + lý do + link My access) thiếu: Cockpit, Blotter, Admin, Users không truyền `accessHref` | `ExecutionPreviewRoute.tsx:377,425,476`, `PortalRoutes.tsx UsersEntry` | truyền `accessHref="/administration/profile-access"`; thêm `actions` có link vào PanelState denied | FE |

Ghi thêm: link Canary trỏ nhầm `/deployments/live/:id` (sửa trong W0a); không có quản lý focus theo route; Alpha 360 và Blotter dùng `<a href>` gây tải lại trang; bộ lọc/lens/range của Operations và lane/lens của Cockpit nằm trong `useState` nên deep link không giữ; `/deployments/alphas/archived` rơi vào Alpha 360 với `alphaId=archived`; `?binding=B` không redirect sang `/accounts/:id?view=physical`.

## Hành trình cần dữ liệu backend chưa có
Quyết định cockpit → receipt → next (FE-030/020/015/028/029); Request archive/Withdraw/làn Archive-Reactivation-Capital (FE-034); Portfolio Actions và receipt ở Operations (FE-015/020/032); Acknowledge/Resolve (FE-015/021/030); nav theo quyền thật (FE-037/038/039); ⌘K tìm entity và digest (FE-023/024); window/Return/Drawdown (FE-025/006/013); Fleet group/map/readiness (FE-012/035/027/028); Compare alpha (FE-033); Blotter theo env/deployment (FE-052); Trade replay trang riêng (FE-054); Portfolios cursor/`q`/approvals theo portfolio (FE-044/045). FE-042/043 đã giao và đã render.

## Lệch concept chưa có quyết định ghi lại (cần Bobby chốt hoặc ghi nhận)
Back theo nguồn; rail nav 7–9 mục (`applyV2Nav` chỉ dùng cho ⌘K); redirect `/governance/exit-reviews` và hợp nhất Waivers/Exit/New request vào Approvals (A1–A3); landing theo capability; D9 toàn app; env không ảnh hưởng dữ liệu trên ≥5 màn; link vào Blotter và Researcher Overview→Fleet/Alpha; route `/deployments/alphas/archived`; `?binding=B`; "Open in Alpha Fleet" không lọc theo portfolio; `#cap=` ở My access; `urlState` bỏ giá trị sai không báo.
