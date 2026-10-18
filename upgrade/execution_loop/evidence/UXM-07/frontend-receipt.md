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

---

# S1 · Fleet identity, Approvals cockpit (preview), Operations queue V2, Incident root

Lane: **FIXTURE_LAB / BFF_DOUBLE**. Commit code `50994a6b` (màn hình + plumbing) và `f0b17ec4` (nối route, theme, project Playwright thứ ba); tier **R1** (Rules §10.10), R2 chờ cuối S1. Chưa push.

## Giao gì
| Màn | Khoá cờ | File chính (`src/execution/v2/`) | Dữ liệu |
| --- | --- | --- | --- |
| Fleet identity (không tiền) | `fleet` | `screens/fleet/*`, `css/fleet.css` | `/alphas` v2; `e2e/bffDouble.ts` `alphaFleet()` 5 hàng có lọc + keyset |
| Approvals cockpit (preview) | `cockpit` | `screens/cockpit/*`, `css/cockpit.css` | inbox, R1/R2/Live/Exit, waivers, history; nút quyết định luôn tắt "Preview · not recorded"; không gọi POST |
| Operations queue V2 | `ops` | `screens/operations/*`, `readers/operationalQueue.ts`, `css/operations.css`; `ports.ts`/`httpApi.ts` hai phương thức mới; `e2e/bffDoubleV2.ts` | `portal.execution.operational-queue.v2`; phân biệt `schema_version`, body V1 → "unsupported shape" |
| Incident root drawer | `ops` | `screens/operations/IncidentRootDrawer.tsx` | `portal.execution.incident-current-root.v2`; chỉ gốc |

Nối: `ExecutionPreviewRoute.tsx` (mount lazy theo `isV2Screen`, gate `import()` bằng chuỗi env thô), `app/presentation.tsx` (route cockpit sang Carbon khi cờ bật — quyết định A2), `ConnectedContextBar` khoá window mặc định (FE-025), `playwright.config.ts` project `chromium-v2` cổng 4176, `e2e/execution-v2-s1.spec.ts`.

## Cell "Not published" (mã FE theo sổ đồng bộ)
Fleet: readiness FE-027/028, Compare FE-033, Archived FE-034, Group FE-012, Board FE-012/027, Map FE-035, Window FE-025. Cockpit: criteria FE-028, chart FE-029, ladder/call/receipt FE-030, làn Archive/Reactivation/Capital FE-034, step-up FE-015. Operations/Incident: Intent FE-020, Display/amounts FE-032, Audit/source health/ack actor FE-021, Mine/assignee FE-030, Exceptions/evidence/timeline FE-031, hành động ghi FE-015. Yêu cầu mới: FE-042, FE-043.

## Evidence (thật)
- Trình duyệt thật (bản build cờ bật, BFF double): 10/10 (5 route × rộng/hẹp), không lỗi console, không request ra ngoài origin, không tràn ngang. Ảnh được xem bằng mắt, **không** thay cho baseline.
- Trình duyệt bắt được 4 lỗi mà test đơn vị xanh vẫn lọt: (1) cockpit còn theme sáng trong shell sáng → cùng một theme Carbon; (2) nút window mở dù server chưa có tham số; (3) double trả `observed_at_ms: 0` hiện "Observed 1 Jan 00:00Z"; (4) tôi gắn cockpit vào nhầm `case` làm hỏng Command Center, bị bắt vì route R1 vẫn hiện V1.
- Vitest rộng `src/execution src/styles src/app src/portal e2e`: 3355 pass, 2 fail đã biết (DEBT-001/002). `tsc --noEmit` sạch. Build cờ tắt: 0 file chứa class V2.
- Đổi tên gốc Fleet V2 thành `exec-fleet-v2` vì V1 đã dùng `exec-fleet` làm marker.

## Chưa làm (NOT_RUN)
Baseline ảnh pinned-image, Playwright V1 ở 4174/4175 (spec `execution-preview` đã đỏ sẵn, DEBT-003), bundle-size test (không có `dist/`), hook đầy đủ (R2). Access (S1e) chưa làm: chờ FE-037/038.

## Khác thiết kế/brief
Cockpit: hàng đợi dạng danh sách nút (thẻ <660px), không phải `CardsTable`; "All" ở chip làn không gồm waiver; `rawRows` thêm vào `InboxResult` vì reader V1 bỏ creator/requester; `DecidedRow.approvalId` thêm (additive). Operations: cửa sổ 24H là state cục bộ (codec URL chỉ biết 7D/30D/90D/ALL); không mở incident từ hàng (FE-042).
