# UXM-07 · rollback (S0 đến S3, cập nhật 2026-10-19, tip `21af6792`)

Thứ tự ưu tiên khi cần lùi: **(1) tắt cờ, (2) revert commit, (3) gỡ hạ tầng/backend**. Mọi SHA dưới đây là SHA của nhánh `claude/fe-parity` hiện tại (đã rebase); các SHA cũ trong `frontend-receipt.md` (ví dụ `d891b2a5`, `50994a6b`, `f0b17ec4`) là trước rebase và chỉ còn trong reflog/backup. Các lệnh `git revert` ở đây **chưa chạy thử** (cây này là cây tài liệu); chạy trong worktree bỏ đi trước và kiểm `tsc` rồi vitest tập trung.

## 1. Tắt cờ (cách chính, không đổi code)
`VITE_EXECUTION_V2_SCREENS` là danh sách build-time; mặc định rỗng thì mọi màn quay về V1. Trong stack: `PORTAL_EXECUTION_V2_SCREENS` (compose map sang build arg `EXECUTION_V2_SCREENS` của `deploy/images/portal-web.Dockerfile`, FE-040 đã có ở `c2ac97da`, mặc định rỗng). Bỏ một khoá khỏi danh sách rồi build lại là tắt đúng màn đó; không khoá nào cần migration. Cờ cũng cần `VITE_EXECUTION_PREVIEW_ENABLED=true`. Với khoá tắt, không có chunk nào của màn đó trong `dist` (kiểm: `grep -rl "exec-blk\|exec-stage" dist/assets` rỗng khi danh sách rỗng).

## 2. Từng khoá cờ (20 khoá, `EXEC_V2_SCREEN_KEYS` trong `v2/flags.ts`)
Cột "Commit" = commit dựng + các commit sau đó có chạm thư mục của màn (`git log --format=%h --reverse -- <thư mục>`). Nhiều commit S1/S2 dùng chung cho nhiều màn, nên **revert theo một màn của S1/S2 không phải một lệnh sạch: dùng cờ**. S3 có commit riêng cho từng màn.

| Khoá | Màn / route | Commit | Lùi bằng |
| --- | --- | --- | --- |
| `shell` | Thanh bối cảnh (`ContextBar`), ⌘K V2 (`CommandBar`, gắn ở `PortalShell` chỉ trên route Execution), overlay nav của rail (`Sidebar` qua `applyV2Nav`), redirect `/deployments/alphas/archived` và `/governance/exit-reviews` | `deb179c0` (S0), `5e64d31b`, `42a6959d`, `649ecef9`, `e926b09a` (PortalShell, commandRouting, `navigation.ts` xuất `isNavigable`, `v2/css/shell.css` +7), `e6127770` (FF-A: `Sidebar.tsx`, `PortalRoutes.tsx`), `9735d803` (`EnvLock.effective`), `2404c164` | Cờ: bỏ `shell`. Code: `git revert --no-commit e6127770 e926b09a 649ecef9` rồi kiểm `PortalShell`/`Sidebar` về hành vi cũ. **Chạm file chung: cần Bobby xác nhận (DEBT-UXM07-024)** |
| `fleet` | Alpha Fleet bảng, Board, ngăn kéo: `/deployments/alphas`; lens Archived `?tab=archived`; redirect danh sách stage `/deployments/{paper,sandbox,live}` → Fleet | `3f83e224` + `b6ae30d1` (nối), `fe06bcfa`; sau đó `ac331f17 bcfde9fe 031d25d7 1801ec3c d519232e 42a6959d 142946e3 82943cfb` | Cờ |
| `archived` | **Dành riêng vĩnh viễn**: không mount gì (lens Archived là một phần của `fleet`) | `deb179c0` (khoá), `e6127770` (redirect, cần `fleet`) | Không có gì để lùi |
| `portfolios` | Portfolios list `/deployments/portfolios`, Portfolio 360 `/deployments/portfolios/:portfolioId` | `fd2898ff`; sau đó `bcfde9fe adf161e9 03f15c9f e5ba9eaf 8791b1d2 b46a6fdb 9735d803 65a5f74e` | Cờ |
| `compare` | Compare: `/deployments/portfolios?view=compare` (không có route riêng, DEBT-UXM07-006) | `9c28e19b` (khoá), `fd2898ff`, `8791b1d2` (link) | Cờ |
| `alpha` | Alpha 360 `/deployments/alphas/:alphaId` (tab, Replay `?tab=replay`) | `5d12dc25`; sau đó `adf161e9 03f15c9f 807e40aa 31e702c0 42a6959d 9735d803 82943cfb` | Cờ |
| `replay` | **Dành riêng vĩnh viễn**: Trade Replay là tab của `alpha`, không đọc khoá `replay` | `5d12dc25 adf161e9 807e40aa 31e702c0 82943cfb` (mã Replay nằm trong `screens/alpha/replay`) | Tắt `alpha` |
| `account` | Accounts `/deployments/accounts`, Account 360 `/deployments/accounts/:accountId` | `7e97bd08`; sau đó `79bde102 59f7ac51 8e051084 82943cfb` | Cờ |
| `ops` | Operations queue `/execution/operations`, Incident root `/execution/operations/incidents/:incidentId` | `3f83e224` + `b6ae30d1`; sau đó `dc0bded5 031d25d7 1801ec3c d519232e a8d29672 65a5f74e` | Cờ |
| `profile` | Profile & Access (xem của mình) `/administration/profile-access` (mount ở `PortalRoutes`) | `7e2ca4ff`; sau đó `79bde102 59f7ac51 8c4dc9e3 65a5f74e` | Cờ |
| `overview` | Command Center `/execution` | `b45ae39f`; sau đó `bcfde9fe 031d25d7 a2f45299 42a6959d 65a5f74e` | Cờ |
| `cockpit` | Approvals cockpit `/governance/approvals*`, redirect Exit Reviews, ngăn kéo New request `?compose=request` | `3f83e224` + `b6ae30d1`; sau đó `ac331f17 4c507ec3 bcfde9fe 031d25d7 7a8aff4f 1801ec3c d519232e 807e40aa 051ce4f7 82943cfb ef9014f3 8b9f361a` | Cờ. Tắt `cockpit` cũng gỡ ngăn kéo New request |
| `blotter` | Full Blotter `/deployments/blotter` | `b45ae39f`; sau đó `79bde102 59f7ac51 e5ba9eaf 42a6959d 65a5f74e` | Cờ |
| `admin` | Admin Actions `/administration/actions` | `b45ae39f`; sau đó `59f7ac51 8e051084 f8a9f73e 051ce4f7 e086cb9a 65a5f74e dd4fab21` | Cờ |
| `users` | Users `/administration/users` (ghi vẫn ở V1, `?view=legacy`) | `b45ae39f`; sau đó `79bde102 59f7ac51 8e051084 f8a9f73e 35268995` | Cờ |
| `workbench` | **S3** Paper workbench `/deployments/paper/:deploymentId`, `/vn-market` (hết dành riêng) | `913ff641` (dựng), `ef9014f3` (nối) | Cờ. Code: `git revert --no-commit ef9014f3 913ff641` (ef9014f3 nối cả 5 màn S3; xem mục 3) |
| `sandbox` | **S3** Sandbox `/deployments/sandbox/:deploymentId` (cùng ghi chú review thật) | `93b33116`, `94402566` (reader), `ef9014f3` | Cờ |
| `canary` | **S3** Canary `/deployments/live/:deploymentId/canary` | `4eb1fb55`, `94402566`, `ef9014f3` | Cờ |
| `live` | **S3** Live `/deployments/live/:deploymentId` | `2b831cb8`, `94402566`, `ef9014f3` | Cờ |
| `request` | **S3** New request `/governance/approvals/new` (+ ngăn kéo trên cockpit) | `a2af09bc`, `ef9014f3`, `8b9f361a` | Cờ. Tắt `request` giữ trang V1; ngăn kéo cockpit còn nếu `cockpit` bật |

Khoá dành riêng: chỉ `archived` và `replay`. `EXEC_V2_PENDING_KEYS` rỗng từ `ef9014f3`.

## 3. Revert S3 trọn gói và các lát cắt
Newest first. Hai lệnh không đụng backend:
- Toàn bộ S3 (năm màn, khung dùng chung, cổng có phiên bản, tích hợp, e2e, reader): `git revert --no-commit 94402566 8b9f361a fcca44ed ef9014f3 a2af09bc 2b831cb8 4eb1fb55 93b33116 913ff641 855ad7c0 9735d803`. Sau đó chạy `tsc`, `vitest run src/execution src/app`, `scripts/refresh-release-integrity-ledgers.sh --write` (ledger N29/EDS-12 ghim hash theo file). `9735d803` cũng đã sửa link Canary (D5) và `94402566` đổi hai reader V1 dùng chung (`certification.ts`, `liveFull.ts`, thêm field có kiểu, markup V1 giống cũ).
- Sửa luồng (FF-A/B1/B2) và crawler: `git revert --no-commit 82943cfb 65a5f74e e6127770` (FF-B2, FF-B1, FF-A) và `dd4fab21 2404c164` cho crawler. `ef9014f3` sửa lại `ExecutionPreviewRoute.tsx` sau `e6127770`, nên có thể phải giải quyết xung đột bằng tay.

## 4. Backend, hạ tầng, contract (không phải cờ)
| Thay đổi | Commit | Lùi bằng |
| --- | --- | --- |
| B1 backend FE-042/043: `status_counts` và liên kết operation→incident trên queue V2 (control-api, additive, không đổi bảng) | `afc5864e` (đã nằm dưới `35953e07`) | `git revert afc5864e`; FE (`a8d29672`) tự hạ cấp: không có `incident_links`/`status_counts` thì hiện "Not published" |
| **Migration `1723680000145`** `execution_incident_operation_links_operation_idx` (index additive, `(workspace_id, operation_id, created_at DESC, incident_id DESC)`) | `cb8ca689` | Đã áp vào DB thì chạy Down của chính file migration: `DROP INDEX IF EXISTS execution_incident_operation_links_operation_idx;` rồi mới `git revert cb8ca689`. Không đổi cột/ràng buộc/writer. (Câu cũ "không có migration" không còn đúng) |
| B2 Dockerfile: `ARG EXECUTION_V2_SCREENS` / `ENV VITE_EXECUTION_V2_SCREENS` trong `deploy/images/portal-web.Dockerfile` (FE-040), map ở `compose.yaml`; mặc định rỗng | `c2ac97da`; `7cecb7b8` (build context thêm `apps/portal/fixture-bff`) | Mặc định rỗng không ảnh hưởng build; `git revert 7cecb7b8 c2ac97da` nếu cần gỡ hẳn. (Câu cũ "Dockerfile chưa có cờ" không còn đúng) |
| Fixture BFF (server `node:http`, route table, golden 882 ca) và overlay compose/nginx của Research preview, banner FIXTURE DATA | `9c1af6bf 2b3ec764 578c10b3 c9f8d259 4d566307 44ffa34b 718d4667 f4098dba fbfc804a 3ca367fe a7f7b0fd 7cecb7b8`, `fcca44ed` (route cho màn S3), `a7f7b0fd` (runbook) | Tắt: `scripts/research-preview/preview.sh fixture off` (xoá marker `fixture-bff.enabled`); stack quay về dịch vụ thật. Gỡ code: revert các commit trên theo thứ tự ngược |
| FE-056 operator task `display_name`/`description`/`scope_label` | `e086cb9a` | Revert, rồi `cd packages/contracts && npm run generate`, `scripts/contracts-test.sh`, và `scripts/refresh-release-integrity-ledgers.sh --write`. Golden fixture BFF `4d566307` cũng phải revert |
| FE-049 schema fleet: `Decimal.maxLength 128`, `MetricState` thêm `PARTIAL` | `c460b693` | Như trên (đổi contract, phải sinh lại `generated` và ledger) |
| FE-061 từ vựng mã lỗi đóng cho `AccessProblem`/`PendingControlProblem` | `595cfc2b` | Như trên |
| Ledger N29/EDS-12 làm mới sau mỗi lần merge | `4954dc01 0160bf20 ccfb100a 21af6792` | `scripts/refresh-release-integrity-ledgers.sh --write` sau bất kỳ revert nào chạm file được ghim; `--check` phải sạch |

## 5. Những gì S3 đã chạm ngoài thư mục `v2/` (để biết revert kéo theo gì)
Đã sửa (đúng, thay cho câu cũ "không đổi shell.css, Dockerfile, contracts/generated"):
- `v2/css/shell.css` (+7 dòng, `e926b09a`), `execution.css` (một dòng chữ nút governance V1, `a067682e`, DEBT-UXM07-001), `playwright.config.ts` (project `chromium-v2` cổng 4176 và danh sách khoá), `deploy/images/portal-web.Dockerfile` (+3), `deploy/images/fixture-bff.Dockerfile` (mới), `packages/contracts/generated/*` (sinh lại: FE-056/049/061 và Codex), một baseline PNG (`el-v2-08-account-acct-live-grid`, DEBT-UXM07-003, commit `5fe17718`).
- File V1/dùng chung: `app/{Sidebar,PortalRoutes,PortalShell,commandRouting}.tsx|ts`, `portal/navigation.ts` (xuất `isNavigable`), `execution/links.ts`, `execution/certification.ts`, `execution/liveFull.ts`, `ExecutionPreviewRoute.tsx`. Tất cả nằm sau cờ hoặc là thay đổi additive; **visual V1 verify chưa chạy** (DEBT-UXM07-019).
- Token: một hunk append-only trong khối carbon của `tokens.css` (`deb179c0`); gỡ không đổi pixel V1.

## 6. Dữ liệu
Không đổi dữ liệu nghiệp vụ, không HK. Hai ghi thật tồn tại và vẫn là của V1 (không phải của UXM-07): `POST /governance/approvals` và `POST /governance/sandbox/capture-note`; màn S3 chỉ gọi lại chúng (D1) theo khoá ý định. Revert code không xoá bản ghi nào đã tạo.
