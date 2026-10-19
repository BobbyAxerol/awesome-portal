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

---
# Phần 2 — Audit route/URL độc lập (cùng ngày, HEAD `855ad7c0`)

Manifest đầy đủ lúc audit (`855ad7c0`): `fleet,archived,portfolios,alpha,workbench,account,ops,profile,overview,cockpit,shell,compare,blotter,admin,users,replay`; `archived`, `workbench`, `replay` là reserved (không mount). **Cập nhật sau S3 (`ef9014f3`): `workbench` đã live (Paper workbench V2 mount sau khoá `workbench`); manifest nay có 20 khoá (thêm `sandbox`, `canary`, `live`, `request`); chỉ `archived` và `replay` còn là khoá dành riêng.** Registry rev 7: chỉ thêm `navigation.scoped_v2_replacement` cho `APPROVALS` (FE-039); các mục C-2…C-7 của review2/07 (tắt `show_in_sidebar` Paper/Sandbox/Live/Exit Reviews, hai screen mới Archived và Compare, đổi nhãn) **chưa có trong registry**.

## Lỗi route xếp theo ảnh hưởng
**Cao**
- **D1** Rail không dùng overlay V2: `app/Sidebar.tsx:33` chỉ gọi `sidebarGroups`; `applyV2Nav` chỉ cho ⌘K. Rail còn Paper/Sandbox/Live/Waivers/Exit Reviews/Blotter, hai mục Approvals, không lọc quyền. Sửa: khi `EXECUTION_V2_SHELL` dùng `applyV2Nav` và ẩn `APPROVALS` khi có `scoped_v2_replacement`.
- **D2** Profile & Access chỉ đọc "Granted to you" khi URL có `workspace_id` (`access/index.tsx:100`); vào từ rail thì trống. Sửa: dùng workspace của session nếu có; nếu không, sửa câu copy.
- **D3** Esc ở cockpit bỏ toàn bộ query gồm `workspace_id` (`ExecutionPreviewRoute.tsx:345`); path (`…/AP-1/r1`) và `?sel=AP-2` có thể mâu thuẫn.
- **D4** Admin: mặc định `/execution/portfolios` không có route; `?source=admin` không ai đọc; không truyền `accessHref`.
- **D5** Link incident từ Portfolio 360 dùng `?sel=<incidentId>` trên Operations (là operation id): `portfolios/portfolio/People.tsx:95` (và `:76`).
- **D6** Context bar: env nhấn sai trên `/deployments/paper/:id`; nút env bật nhưng bị bỏ qua ở Fleet, Ops, Overview, Cockpit, Admin, Compare; chỉ Blotter được khóa.
- **D7** Giá trị URL sai bị nuốt im lặng (`urlState.ts:191-213` tính `invalid`, 0 consumer); `?view=foo` ở Fleet làm hook đọc tắt → skeleton vĩnh viễn.

**Trung bình** — M1 notice tab lạ của Account 360 biến mất sau một frame; M2 nút Compare hiện dù cờ `compare` tắt; M3 Operations giữ filter/range trong `useState` và `?operation=` push thêm history; M4 Canary dẫn vào `/live/:id` (3 nơi); M5 alias tab Alpha làm rơi hash; M6 "← Alpha Fleet results" mất bộ lọc; M7 `<a href>` gây tải lại trang (Alpha TableTabs/OrdersTab/replay/Lifecycle, Blotter, EventFeed); M8 Drawer đóng để lại history trùng; M9 `/governance/exit-reviews` root và lane cockpit không nằm trong URL; M10 Blotter V2 đọc `status` còn V1 dùng `filter`; M11 href server phát (`?filter=findings|broker_sync`) Operations bỏ qua; M12 Admin V2 bỏ `operation/action/binding/cmd`; M13 `workspace_id` không nhất quán (rail bỏ, ⌘K giữ).
**Thấp** — L1 `/governance/approvals/new`, `/administration/actions`, `vn-market` chỉ vào bằng URL/link V1; L2 `binding` còn trong URL sau khi đóng; L3 `from` rò sang link không liên quan; L4 `withContext` nhận href tuyệt đối/scheme lạ; L5 Cmd-K trên hai route sáng mở palette V1; L6 `reviewRouteFor` không encode id; L7 tắt "show commissioned" làm mục chạy thật biến khỏi rail.

## Authority qua URL
Không route V2 nào render dữ liệu ngoài BFF; không tham số nào đổi nguồn sang fixture. `compose=request` chưa có trong mã (khi làm phải không tự POST từ URL). Cockpit chỉ preview.

## Quyết định URL còn mở
Bobby: nối `applyV2Nav` vào Sidebar ngay hay chờ Codex tắt `show_in_sidebar`; path hay bar thắng về env; rail mang `workspace_id`/env/window như ⌘K; redirect `/governance/exit-reviews` và lane vào URL; Archived là route hay `?tab=archived`; Compare là `/deployments/compare` hay `?view=compare`; redirect `/backtests/approvals`; ý nghĩa window `all`/`24h`/`from..to`; `ctx` thay `from`. Codex: khóa hai screen mới và cờ nav (registry), Q4/FE-038, C-9 stage xuyên env, binding→account lookup, FE-037, nguồn href command-center.

---
# Trạng thái sau sửa (cập nhật 2026-10-19, tip `21af6792`)

Cách đọc: **FIXED (commit)** = đã sửa trong cây này, có test của commit đó; **OPEN** = chưa sửa; **DECIDED** = đã chốt có chủ ý, không sửa ở FE. Nguồn: thông điệp commit và mã hiện hành (đã đối chiếu `git log 35953e07..HEAD`); chưa chạy lại hành trình bằng tay trên bản build mới. Các commit: FF-A `e6127770` (route/URL, sau cờ `shell`), FF-B1 `65a5f74e`, FF-B2 `82943cfb`, crawler `dd4fab21` (+`2404c164`), W0a `9735d803`, integrate `ef9014f3`, `8b9f361a` (drawer New request).

## Mười lỗi luồng
| # | Lỗi | Trạng thái | Commit / lý do |
| --- | --- | --- | --- |
| 1 | Session thật của owner không có `execution.*` | **DECIDED** (fail-closed giữ nguyên) | Không đổi luật trung thực; V2 giữ tắt ở stack có session thật tới khi Codex trả lời FE-037/058; preview fixture cấp capability. Ghi ở debt DEBT-UXM07-005 |
| 2 | Link chết trong Admin (`/execution/portfolios`) | **FIXED** | `65a5f74e` (mặc định `/deployments/portfolios`, `/execution/operations`, không `?source=admin`); `dd4fab21` sửa "Open Portfolios"; crawler giữ |
| 3 | Researcher mở request của mình lại thấy danh sách | **FIXED** | `82943cfb` (request của chính mình mở read-only theo path) |
| 4 | Mất `workspace_id`/ngữ cảnh khi Esc ở cockpit và khi dùng sidebar | **FIXED** | `e6127770` (Esc giữ context, bỏ `sel`; rail mang `workspace_id`/env/window/ccy qua `withContext`) |
| 5 | Mục tiêu Operations là chữ thường, không phải link | **FIXED** | `65a5f74e` (`targetHrefFor` + `withContext`; chữ thường chỉ khi không có route) |
| 6 | Href server phát (`?operation_id=`, `?filter=…`) không được đọc | **FIXED** (một phần là DECIDED) | `65a5f74e`: `?operation_id=` → `?operation=`; `?filter=findings\|broker_sync` được giữ và Operations V2 nói hàng đợi không có bộ lọc đó (nguồn href vẫn của Codex) |
| 7 | Researcher không có đường đi; Alpha 360 thiếu Request archive / gate review | **FIXED** | `65a5f74e` (Overview researcher: tên alpha là link, panel link Alpha Fleet) + `82943cfb` (hai điều khiển tắt kèm lý do, FE-020/034) |
| 8 | Back không biết nguồn | **FIXED** | `82943cfb` (`from` + `back` qua `v2/backTo.ts` cho Fleet, Alpha 360, Account 360, Trade Replay) |
| 9 | Bộ chọn env là nút giả | **FIXED** (khoá có lý do) | `e6127770` (màn bỏ qua env thì khoá kèm lý do; route có env trong path hiện env của path kèm notice); `ef9014f3` khoá theo deployment cho năm màn stage. `pickLens` đặt `env` theo lens: chưa kiểm |
| 10 | D9 (disabled + lý do + My access) thiếu ở Cockpit, Blotter, Admin, Users | **FIXED** | `e6127770` (link My access qua `withContext`), `65a5f74e` (panel denied của Overview/Operations) |

Ghi thêm của audit luồng: link Canary nhầm → **FIXED** `9735d803` (`alpha/model.ts`, `portfolios/routes.ts` trỏ `/deployments/live/{id}/canary`; D5 của S3). `/deployments/alphas/archived` → **FIXED** `e6127770` (redirect sang `?tab=archived`). `<a href>` gây tải lại trang ở Alpha/Blotter → **FIXED** `82943cfb`, `65a5f74e`. Filter/lens/range của Operations và lane/lens của Cockpit trong `useState` → **FIXED** `65a5f74e` (Operations), `82943cfb` (Cockpit). `?binding=B` không redirect sang `/accounts/:id?view=physical` → **OPEN** (cần Codex: binding→account lookup, FE-050). Quản lý focus theo route → **OPEN** (không có commit nào xử lý; không kiểm lại).

## Lỗi route D1–D7 và M1–M13
(Audit route chỉ đánh số M1…M13; không có M14.)
| Mã | Trạng thái | Commit / lý do |
| --- | --- | --- |
| D1 Rail không dùng overlay V2 | **FIXED** | `e6127770`: `Sidebar` gọi `applyV2Nav` khi cờ `shell` bật và ẩn mục `APPROVALS` mang `navigation.scoped_v2_replacement` (FE-039). **Chạm file dùng chung `Sidebar.tsx`, `PortalShell`, `PortalRoutes.tsx`, `navigation`: cần Bobby xác nhận** (README mục "Cần Bobby quyết") |
| D2 Profile & Access trống khi vào từ rail | **FIXED** | `65a5f74e`: dùng workspace của session khi có, ngược lại copy chính xác |
| D3 Esc cockpit mất query; path vs `?sel=` mâu thuẫn | **FIXED** | `e6127770` |
| D4 Admin: mặc định chết, `?source=admin`, thiếu `accessHref` | **FIXED** | `65a5f74e` + `e6127770` |
| D5 Link incident từ Portfolio 360 dùng `?sel=<incidentId>` | **FIXED** | `65a5f74e`: `/execution/operations/incidents/<id>`; operation dùng `?operation=` |
| D6 Context bar: env sai trên Paper; nút env bị bỏ qua | **FIXED** | `e6127770`, `ef9014f3` (+ W0a `EnvLock.effective`, `9735d803`) |
| D7 Giá trị URL sai bị nuốt im lặng; `?view=foo` ở Fleet → skeleton | **FIXED** | `e6127770` (tham số bị từ chối được gọi tên, không echo, có Dismiss); `82943cfb` (view Fleet lạ đọc như bảng) |
| M1 notice tab lạ của Account 360 biến mất | **FIXED** | `82943cfb` |
| M2 nút Compare hiện dù cờ `compare` tắt | **FIXED** | `e6127770` (`RouteFeatures`), `65a5f74e` (`routes.compare` có thể null: không link, nút tắt kèm lý do) |
| M3 Operations giữ filter trong `useState`, `?operation=` push history | **FIXED** | `65a5f74e` (URL, `replace`; `?operation=` tiêu thụ một lần) |
| M4 Canary dẫn vào `/live/:id` | **FIXED** (hai nơi đã kiểm; nơi thứ ba chưa kiểm) | `9735d803` (`alpha/model.ts`, `portfolios/routes.ts`), `82943cfb` (link account Canary) |
| M5 alias tab Alpha làm rơi hash | **FIXED** | `82943cfb` |
| M6 "← Alpha Fleet results" mất bộ lọc | **FIXED** | `82943cfb` (Back theo nguồn) |
| M7 `<a href>` gây tải lại trang | **FIXED** | `82943cfb` (Alpha, Account, Cockpit, Fleet, Drawer), `65a5f74e` (Blotter) |
| M8 Drawer đóng để lại history trùng | **FIXED** | `82943cfb` (và `051ce4f7`: focus chỉ khi người dùng đóng) |
| M9 `/governance/exit-reviews` root và lane không nằm trong URL | **FIXED** | `e6127770` (redirect root sang `approvals?view=exit-reviews`), `82943cfb` (lane/lens/waiver trong URL) |
| M10 Blotter V2 đọc `status`, V1 dùng `filter` | **FIXED** | `65a5f74e` (V1 `filter` đọc như `status`, từ lạ được nói ra) |
| M11 href server phát bị Operations bỏ qua | **FIXED** / DECIDED | như lỗi luồng #6 |
| M12 Admin V2 bỏ `operation/action/binding/cmd` | **FIXED** | `65a5f74e` (đọc, chọn sẵn task theo id/catalogue key, không chạy gì) |
| M13 `workspace_id` không nhất quán (rail bỏ, ⌘K giữ) | **FIXED** | `e6127770` |

Mức thấp L1–L7: L4 (`withContext` nhận href lạ) **FIXED** `e6127770`; L1 `/governance/approvals/new` nay có nút "New request" trên cockpit **FIXED** `ef9014f3`; L2, L3, L5, L6, L7 **OPEN / không kiểm lại**. Quyết định URL còn mở ở trên (Compare route riêng cần registry rev 7, `ctx` thay `from`, ý nghĩa window `all`/`24h`/`from..to`, redirect `/backtests/approvals`) vẫn **OPEN**; "applyV2Nav vào Sidebar ngay" đã được làm theo hướng "ngay, sau cờ `shell`" và cần Bobby xác nhận.
