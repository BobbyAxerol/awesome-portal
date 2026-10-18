# UXM-07 S0 · frontend receipt

Chủ: Claude · 2026-10-18 · Lane: **FIXTURE_LAB** (chưa có đọc thật; không có route/màn mới). Code commit `d891b2a5` trên `claude/fe-parity` (chưa push; chưa ff-merge). Thẻ phạm vi: [README](README.md).

## Đã đọc (file@commit)
Digest Codex `design/sync/2026-10-18-codex-digest.md` (Portal `ac056d46`, tip hiện tại `0d5ceaba`); [S0-IMPLEMENTATION-MAP](../../design/impl/S0-IMPLEMENTATION-MAP.md) và [UXM07-RULES-CHECKLIST](../../design/impl/UXM07-RULES-CHECKLIST.md) @ `44f5c4eb`; kit `design/hifi/v2` @ `e454ebde`; review2/06, 07 (alias tab, manifest, URL).

## Giao gì (7 đơn vị, một người ghi mỗi file)
| Đơn vị | Giao | File chính |
| --- | --- | --- |
| U1 Token | `--series*`, `--f-<kind>`/`-bg` (16 loại), hatch; `attention` cam `#ffa51f`/`#301e05` 8.11:1, cách đỏ rejected >30° | `styles/tokens.css` (+54, một hunk trong khối carbon), `tokens.test.ts` (+126) |
| U2 Cờ + URL | `parseV2Manifest`, `isV2Screen` (cần cờ umbrella), `parseUrlParams`/`serializeUrlParams`/`withContext`/`useExecUrlState`, `resolveTab` | `v2/flags.ts`, `urlState.ts`, `tabAliases.ts`, `vite-env.d.ts` |
| U3 Flag | 16 loại glyph + chữ, bảng kind duy nhất, CSS cặp trực tiếp | `v2/Flag.tsx`, `flagKinds.ts`, `css/flag.css` |
| U4 Shell | `ContextBar` (+`ConnectedContextBar`), `CommandBar`, `roleNav` thuần theo capability | `v2/shell/*`, `css/shell.css` |
| U5 Drawer + thẻ | `Drawer` (`.exec-dock`), `DockAction`, `useDockSelection`, `CardsTable` | `v2/Drawer.tsx`, `cardsTable.tsx`, `css/dock.css`, `css/cards.css` |
| U6 Reader | `readDecimal`, `readMetric`, `readAsOf`, `formatAsOf` | `v2/boundary.ts` |
| U7 Tích hợp | export `PreviewFrame` + một dòng có điều kiện; `productBoundary` duyệt `v2/`; `v2Hygiene`; test cờ tắt/bật | `ExecutionPreviewRoute.tsx`, `productBoundary.test.ts`, `v2/v2Hygiene.test.ts`, `flagOff/flagOn.test.tsx` |

Chưa gắn vào `PortalShell`/`Sidebar` (đợi registry rev 7 và capability, FE-037/039); `CommandBar` chưa thay palette.

## Chứng cứ cờ tắt không đổi
- DOM của `PreviewFrame` khi cờ tắt = snapshot chụp từ markup V1 trước khi thêm nhánh V2 (`flagOff.test.tsx`).
- `vite build` cờ tắt: 0 file chứa `exec-flag|exec-ctxbar|exec-cmdbar`; cờ bật (`shell`): có chunk `ContextBar` (2 file). Điều kiện `lazy()` đọc chuỗi env thô để bundler gỡ chunk (lần đầu dùng hằng đã import vẫn để lại chunk — đã sửa).
- Token chỉ thêm khai báo trong khối carbon (diff một hunk `@@ -567,0 +568,54 @@`).
- Baseline ảnh pinned-image: **chưa chạy** (chỉ ở mốc, Rules/memory).

## Khác biệt so với bản đồ / thiết kế
1. `readMetric(raw, {unit})` cần đối số thứ hai; `-0`/`-0.00` bị từ chối (ngữ pháp `readExactDecimal` nhận, nên reader chặn riêng).
2. URL ghi `window` chữ thường (`7d/30d/90d/all`, theo review2/07 §1); kiểu trong code chữ hoa. Hỏi Bobby nếu muốn chữ hoa trên URL.
3. `isV2Screen` mới là cổng fail-closed; `EXECUTION_V2_SCREENS` chỉ là parse thô.
4. Tên capability cho nav là **đặt tạm** (FE-037); trước khi session cấp thì Portfolios/Accounts/Operations/Blotter không hiện cho ai.
5. `CommandBar` thêm `onQueryChange`/`filterLocally` cho tìm kiếm phạm vi server.
6. `useDockMode` dùng chung breakpoint 1500px cho role và CSS.

## Reuse report
Dùng lại: `useParamState` (không sửa), `readExactDecimal/formatExact/readUtcEpochMs`, `MetricState`, `sidebarGroups()`, token carbon sẵn có (`--scrim`, `--warn-bg`, `--on-accent`). Mới: toàn bộ `src/execution/v2/**`. Không dùng lại được: `.exec-drawer*` (của `CommandPlanDrawer`).

## Số liệu commit `d891b2a5`
37 file, +4101/−11 (gồm 4 file ledger toàn vẹn do `refresh-release-integrity-ledgers.sh --write`). Code tay: 33 file dưới `apps/portal/frontend/src`; chi tiết `git show --numstat d891b2a5`.
