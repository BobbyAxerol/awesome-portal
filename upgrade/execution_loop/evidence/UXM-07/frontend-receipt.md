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

Chưa gắn vào `Sidebar` ở S0 (đợi registry rev 7 và capability, FE-037/039). **Đã đổi sau đó:** FF-A `e6127770` cho `Sidebar` gọi `applyV2Nav` khi cờ `shell` bật (cần Bobby xác nhận chạm file dùng chung, DEBT-UXM07-024). `ContextBar` gắn trong `PreviewFrame`; `CommandBar` không ở đó mà ở `PortalShell` (từ 2026-10-19, `ExecCommandBar` lazy, chỉ khi cờ `shell` bật và route là Execution; ngoài ra palette V1 giữ nguyên).

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

---

# S1e + S2 · Access, Overview, Portfolios, Portfolio 360, Compare, Alpha 360 + Replay, Accounts + Account 360, Blotter, Admin Actions, Users, và nền dùng chung

Lane: **FIXTURE_LAB / BFF_DOUBLE** (không có đọc thật). Tier **R1** cho mọi commit FE; backend B1 (`517684b6`) và B2 (`77ded3ef`) đã qua **hook đầy đủ (R3)**, hook đó phủ các commit R1/R0 trước nó. R2 đầy đủ của S1+S2 chạy ở cuối lát (xem test-results.json). Chưa push.

## Đã giao (commit, theo thứ tự)
| Việc | Commit | Ghi chú |
| --- | --- | --- |
| F5a testkit L1–L3 + conformance boundary/fleet/cockpit | `182096db` | 1.809 test, 10 lỗi reader ghi bằng `it.fails` |
| S2-0a biểu đồ SVG dùng chung · S2-0b khối dùng chung | `52b55c73` · `9c77ab86` | EquityPanel, Spark, DivBars, CompareOverlay, CapitalFlow, EventRibbon · Kpi, NotPublished, EventFeed, JourneySpine, Triad, ReplayPanel, StateBoundary |
| F10 reader V1 từ chối body V2 + reader V2 + dispatch + cockpit | `6cb31d4f` | sửa lỗi "no R1 lineage" sai |
| S1e Access | `b4c4c50f` | cờ `profile`; owner giữ ma trận V1 ở tab "Manage grants" |
| DEBT-003 retained-review | `0341aec1` | double trả 404 có kiểu; spec V1 xanh lại |
| B2 FE-040 · B1 FE-042/043 | `77ded3ef` · `517684b6` | B1 là backend (hook R3 xanh) |
| F8 consumer review + Board | `128e1cf4` | |
| DEBT-001 | `34b30032` | chữ nút governance V1 |
| S2 · Portfolios/360/Compare | `7d8b0df1` | cờ `portfolios`, `compare` |
| S2 · Alpha 360 + Replay | `0d545f4b` | cờ `alpha`, `replay` |
| S2 · Accounts + Account 360 | `1b7fca7d` | cờ `account` |
| S2 · Overview, Blotter, Admin, Users | `7077d590` | cờ `overview`, `blotter`, `admin`, `users` |
| S2 nối route + spec trình duyệt 17 route | `4becbee7` | |
| Sửa namespace class, nhãn biểu đồ, lý do trạng thái | `c2366a9c` | tìm bằng trình duyệt |
| `readConditionalGroup` đọc `contingency_type` | `59328a43` | lỗi V1 do gói Blotter tìm ra |
| F5b sửa 8 lỗi reader · bộ conformance phần 2 | `263eade6` · `6332a3d3` | 10.250 test, 26 `it.fails` mới |

## Evidence (thật)
- Trình duyệt thật (bản build cờ bật, BFF double, 17 route × 1440/390): **34/34**, không lỗi console, không request ra ngoài origin, không tràn ngang. Ảnh xem bằng mắt (không phải baseline).
- Trình duyệt bắt được bảy lỗi mà test đơn vị xanh vẫn lọt: theme cockpit sáng/tối lệch; nút window mở dù server chưa có; `observed_at_ms: 0`; gắn nhầm `case` làm hỏng Command Center; **class V2 trùng class V1** (`exec-chart-*`, `exec-alpha-*`, `exec-bl-*`, `exec-equity`, `exec-spark`: bật cờ sẽ restyle biểu đồ V1) → đổi tên + test chặn; nhãn trục/giá trị cuối bị cắt ở 390px; trạng thái Stale/Partial chỉ in một chữ vì thiếu lý do.
- Vitest rộng (`src/execution src/styles src/app src/portal e2e`): **17.492 pass**, 26 expected-fail (lỗi reader có ghi chú), **1 đỏ có sẵn** `r2Ledger` (DEBT-UXM07-002, Codex). `tsc` sạch. Build cờ tắt: 0 file chứa class V2.
- Reader V2 hiện chặn: số tiền dạng "1e5/NaN/-0/0x1F", id trùng trong trang, số nguyên > 2^53, status lạ bị coi là đã đóng, chuỗi 70.000 chữ số.

## Chưa làm / NOT_RUN
Baseline ảnh pinned-image và hook đầy đủ cho S2 (R2, bước kế tiếp); Playwright V1 journeys ở 4174/4175 (trừ `execution-preview`, đã chạy xanh); bundle-size test (cần `dist/`); researcher view (FE-026 chưa quyết, chỉ chặn theo capability); realtime/poll trên màn Alpha; route Compare riêng (cần registry rev 7).

## Khác thiết kế (ghi để Bobby/Codex xem)
Compare đặt ở `?view=compare` trên route Portfolios; Users chỉ đọc (ghi vẫn ở V1, `?view=legacy`); màn Accounts không có tab "All environments" (contract một environment); nhãn "Sandbox" thay "Testnet"; địa chỉ broker không bao giờ hiện ("Withheld"); Blotter scope chips chỉ lọc "loaded pages"; Admin cho "Make plan" với action SUPPORTED_BUT_INACTIVE (apply luôn tắt) — cần Bobby/Codex xác nhận; tên capability `execution.*` tạm (DEBT-UXM07-005).

## R2 (2026-10-18) — hook đầy đủ, baseline ảnh pinned-image, hạ cánh
- Nhánh `claude/fe-parity` đã rebase lên tip Codex `5291a80f` (Codex đã commit gói pending-recall; Source Truth Board do Codex điền cột nguồn cho 12 hàng).
- Visual (pinned image `mcr.microsoft.com/playwright:v1.62.1-noble`, toàn bộ): lần đầu 375 pass / 17 fail. 15 trong 17 lỗi (surface-audit ×10, EL-V2-05, c06 ×4) **cũng đỏ trên bản sạch của tip Codex** (ghi DEBT-UXM07-007); riêng 5 test WCAG-AA đỏ trên tip Codex nay **xanh** nhờ DEBT-UXM07-001. Hai lỗi do nhánh này (command-center, account cao hơn vì double V2 làm giàu fleet) đã sửa: dữ liệu giàu chỉ với `screensV2`.
- Một baseline được ghi lại có chủ đích: `el-v2-08-account-acct-live-grid-v21` (ảnh cũ in `UDB_CONTEXT_HTTP_501` do double chưa trả retained-review — DEBT-UXM07-003). Đã xem ảnh mới.
- Chi tiết: [test-results.json](test-results.json) mục `r2`.

## So sánh HIFI và sửa độ trung thực (2026-10-18/19)
Chi tiết: [hifi-comparison-2026-10-18.md](hifi-comparison-2026-10-18.md) và ba bảng review A/B/C. Kết quả: 17 sai khác MAJOR (16 đã sửa, 1 là dữ liệu vắng → FE-056), ~70/104 MINOR đã sửa, 84 dòng dữ liệu vắng đều có mã FE, 54 dòng có chủ ý. Sau sửa: vitest 17.547 pass/0 đỏ, trình duyệt V2 34/34, visual pinned-image 377 pass và 15 lỗi **đúng bằng** tập đã đỏ trên bản sạch của Codex (DEBT-UXM07-007). Commit: `5748ccdb` (lớp dùng chung), `18744bc4` (A), `1b17d791` (B), `1b0417bc` (C).

## Fidelity lượt 2 và F8c (2026-10-19)
Hai lượt review bị phản hồi là còn yếu (hai `it.fails`, khoảng 34 dòng MINOR, ba contract mới chưa review) nên làm thêm một lượt: ba gói sửa theo cụm màn và một gói review + reader. Mỗi gói tự dựng, chụp trước/sau trên cổng riêng.
- **F8c** `83854d9d`: reader `accessSelf.ts` (eligibility + navigation) và `commandCurrency.ts` (CommandStatus/PendingControlStatus `currency`), 7.946 test, 4 expected-fail ghim lỗ phía Codex. Đề xuất: eligibility ACCEPTED, navigation CHANGES_REQUESTED (không BLOCKER), currency ACCEPTED. Chưa nối vào màn hình hay roleNav. Chi tiết: `consumer-review-self-contracts-2026-10-19.md`.
- **C** `9f6b5dcb` Access/Accounts/Blotter/Admin/Users, kèm AE-2 phía FE (id có bidi/zero-width/điều khiển bị từ chối).
- **A** `4c65f2e4` Fleet/Operations/Incident/Cockpit, kèm D4 phía FE (stage vắng trong `stage_counts` in "Not available", không in 0).
- **B** `b7bd9d78` Portfolios/Compare/Alpha 360 (đầu bảng sắp xếp được, Partitions thu một dòng, nến xanh).
- Evidence: tsc 0; vitest rộng 31.297 pass, 1 đỏ là DEBT-UXM07-009 (Codex), 4 expected-fail của Codex; trình duyệt V2 34/34. Visual pinned-image và hook đầy đủ chạy ở bước R2 kế tiếp. Còn lại: DEBT-UXM07-008, -011, -012.

## Vòng kiểm toán và đóng F5 (2026-10-19)
Sau pass 2, bốn agent chỉ-đọc kiểm trung thực, a11y, các mục fidelity còn hở và ma trận L1–L3; năm writer sửa theo file (không ai commit chung cây).
- Trung thực (2 MAJOR + 5 MINOR): huy hiệu Issues-only không hiện 0 trước khi đọc xong; lane count Cockpit không lấy dữ liệu lane khác; verdict R1 có tiêu chí `insufficient` không bao giờ xanh; Portfolios subtitle nêu bộ lọc domain; Overview không đổi stage vắng thành 0; đếm "partial" ở source health chỉ tính PARTIAL; `updatedAgo` lấy sàn giờ. Commit `185076d8`, `8da315b9`, `2b9c6fcf`.
- A11y (1 MAJOR + ~12 MINOR): drawer Admin tự mở không cướp focus (`focusOnOpen`); Columns popover, hộp phím, pager Blotter một bản theo media query, glyph CSS không vào tên truy cập, link "My access: <hành động>".
- Fidelity còn hở đóng được ở FE: JourneySpine một ghi chú, PanelHead `lead`, windowLock Operations, EquityPanel 390px, Replay ghim mức TP/SL ngoài thang (opt-in, V1 không đổi), test incident chập chờn (DEBT-UXM07-010). Commit `654a39b3`, `4f892c47`.
- F5: accessEffective kiểm với schema (phát hiện AE-4, AE-5), Access cap 200, Admin rỗng/stale/cap, Users reader chặt, Compare/Replay quy mô + âm tính, pane governance 199..256 findings. Commit `86949186`, `33125d3e`, `96c64e76`. Ma trận: `conformance-matrix-2026-10-19.md`.
- Gate: tsc 0; vitest rộng 31.636 pass, 2 đỏ (r2Ledger của Codex; testHygiene do một `return` trong users.test.tsx, đã sửa); Playwright V2 34/34; visual pinned-image 377 pass và 15 đỏ trùng tập đã đỏ trên bản sạch của Codex. Còn: DEBT-UXM07-008, -011, -013.

## R2 cuối và hạ cánh (2026-10-19)
Rebase 20 commit lên tip mới của Codex `d0789674` (không xung đột; làm mới ledger N29/EDS-12). Codex đã thêm hàng r2Ledger nên DEBT-UXM07-009 đóng; Codex cũng sửa CC-1, CC-2, SE-1 nên reader `accessSelf`/`commandCurrency` được cập nhật theo luật 28 kind (commit `0f58115a`). Gate: tsc 0; vitest rộng 31.804 pass, 0 expected-fail, một file đỏ là test của Codex vốn đỏ trên bản sạch trong môi trường này (DEBT-UXM07-014); visual pinned-image 377 pass và 15 đỏ trùng tập của bản sạch Codex (DEBT-UXM07-007). Hook đầy đủ chạy ở commit này. **Hạ cánh:** chỉ làm khi cây Codex sạch và tip là tổ tiên; lần kiểm gần nhất cây Codex còn 6 file chưa commit nên chưa hạ cánh, nhánh `claude/fe-parity` giữ nguyên để Codex hoặc Bobby kéo.

## Đợt sửa thứ hai sau review độc lập (2026-10-19)
Hai review chỉ-đọc chạy trong lúc hook R2 đóng băng cây: logic FE (reader Users, Replay, Admin, Drawer, Cockpit, chart dùng chung, reader eligibility) và backend F1. Kết quả 0 BLOCKER; MAJOR: `display_name` hợp lệ theo server làm hỏng cả roster Users; banner focus của Replay nói sai khi còn trang chưa tải; bảng link incident thiếu index; đếm status luôn bật (quyết định mở). Đã sửa toàn bộ phần FE và thêm migration `1723680000145` (index). Commit: `0b113488` Users, `326325bd` Drawer/Admin/Cockpit, `633b7f11` Replay, `4fb72473` index và test snapshot-reader. Còn mở cho Codex/Bobby: M2 (đếm luôn bật: opt-in, SAVEPOINT hoặc GROUPING SETS), m1 (UI phải ghi "No readable incident links"), m2 (schema_version không đổi khi thêm trường), m3, m4. Quy trình test nhanh hơn được ghi ở AGENT_WORKING_RULES §10.10a (khóa heavy chỉ cho Docker/visual/hook).

---

# S3 · Paper workbench, Sandbox, Canary, Live, New request, luồng người dùng (FF-A/B1/B2), crawler (2026-10-19)

Lane: **FIXTURE_LAB / BFF_DOUBLE** (không đọc thật; nguồn Sandbox/Canary/Live đang tối). Tip `21af6792` trên `claude/fe-parity` (chưa push). Tier: **R1 từng lát + cổng trên cây đã merge; R2 chưa chạy** (visual pinned-image, hook đầy đủ). Kế hoạch: [S3-STAGE-SCREENS-PLAN](../../design/impl/S3-STAGE-SCREENS-PLAN-2026-10-19.md) (quyết định D1–D13 áp dụng theo khuyến nghị, chờ Bobby phủ quyết). Số liệu cổng: [test-results.json](test-results.json) khối `s3`. **Cổng trình duyệt V2 đang ĐỎ (74 pass / 2 fail), xem "Evidence".** SHA ở đây là SHA hiện tại sau rebase; SHA cũ ở các mục S0–S2 phía trên là trước rebase.

## Đã đọc (file@commit)
| Nguồn | Pin | Dùng cho |
| --- | --- | --- |
| Codex `d0789674` (native read runtime, CC-1/CC-2/SE-1) | ancestor của tip | Reader eligibility theo luật 28 kind (đã làm ở `b1fe1aa6`); S3 không đọc thêm contract từ gói này |
| Codex `678cf731` (isolate Research native review, exact stage reads) | ancestor của tip | Stage-drift v2 (`execution-alpha-stage-drift.v2.schema.json`, FE-054) và operator tasks; **các màn S3 không tiêu thụ stage-drift** |
| Codex `f4643915` ("recover exact source rollback before human ENTER", 2026-10-19 11:19) | **không** là ancestor của tip; chỉ xác nhận commit tồn tại | Không đọc nội dung; không có gì trong S3 phụ thuộc vào nó (chưa kiểm sâu) |
| `packages/contracts/schemas/execution-paper-read.v1.schema.json` | `f22f64be` (lần sửa cuối; không đổi bởi 678cf731) | Paper workbench. `Data` có nhánh `sessions`/`reconciliation` kiểu `Records` không đặt tên field mà màn không đọc (FE-067) |
| `…/execution-sandbox-certification.v1.schema.json` + fixture `…unavailable.valid.json` | `7424d1a8`, `421e21c7` | Sandbox V1 body; nguồn tối nên mọi bước UNAVAILABLE |
| `…/execution-canary-control-room.v1.schema.json` + fixture | `3960c184`, `02503386` | Canary V1; `series.points maxItems 0`, `rollback_readiness.ready const false` |
| `…/execution-live-full-operations.v1.schema.json` + fixture | `3960c184`, `421e21c7` | Live V1 |
| `…/execution-live-source.synthetic.valid.json` (V2 live-source) | `25218372` | Live V2, 11 panel quan sát lưu giữ |
| `…/execution-governance-product.v1.schema.json` (approval-create, summary 8..2000) | `5b682dbd` | New request; server tối thiểu 8 ký tự (hi-fi 24) |
| `…/execution-analytics.openapi.json` (shadow-panel) | `7424d1a8` | Đọc để hỏi Codex; **không dùng** (S3-U1) |
| Hi-fi `upgrade/execution_loop/design/hifi/v2/{deployment,sandbox,canary,live,new-approval}.html` + `modules/stage.js`; ảnh trích từ artifact "Execution V2 Screens" (`deployment-{mgr,res,wire}`, `hl-deployment-orders`, `sandbox-{mgr,res,v1}`, `canary-{mgr,res}`, `live-{mgr,res}`, `hl-live-mismatch`, `new-approval-{mgr,res}`, `hl-new-approval-drawer`) | kit `design/hifi/v2` (pin S0); ảnh chỉ nằm trong scratchpad phiên | Trạng thái không có ảnh (loading/partial/stale/guarded/mismatch/gap/nq) đọc từ mã HTML/JS: bằng chứng bằng mã, không bằng ảnh |

## Giao gì (commit, theo thứ tự)
| Việc | Commit | Ghi chú |
| --- | --- | --- |
| S3 plan + quyết định D1–D13 | `7ce1be27` | Phân tích chỉ-đọc của một agent; quyết định áp dụng chờ Bobby phủ quyết |
| W0a khung dùng chung | `9735d803` | 5 khoá cờ, slug tab + alias, `compose=request`, `EnvLock.effective`, `StageHeader`, `Tabs/UrlTabs`, `CapGauge`, `BlockerList`, `Triad.suppressed`, `reasons.ts`, `css/stage.css`, sửa link Canary (D5) |
| W0b cổng có phiên bản | `855ad7c0` | `getSandboxCertificationVersioned`, `getCanaryVersioned`, `getLiveFullVersioned(panel, cursor)` ở `ports/httpApi/fixtureApi` |
| W-PAPER | `913ff641` | `screens/workbench/**` |
| W-REQUEST | `a2af09bc` | `screens/request/**` (trang + `RequestDrawer`) |
| W-SANDBOX | `93b33116` | `screens/sandbox/**` (cả hai thân, ghi chú review) |
| W-CANARY | `4eb1fb55` | `screens/canary/**` |
| W-LIVE | `2b831cb8` | `screens/live/**` |
| W-INTEG | `ef9014f3` | Một chunk `lazy()` đọc chuỗi env thô cho mỗi màn; ContextBar khoá cửa sổ + env theo màn; New request sang Carbon; nút New request + `RequestDrawer` trên cockpit; `EXEC_V2_PENDING_KEYS` rỗng; sửa 3 test đỏ có sẵn |
| W-E2E | `fcca44ed` | `e2e/bffDoubleStage.ts`, 15 hàng SCREENS × 2 khổ, luồng click, crawler, route fixture BFF |
| Sửa ngăn kéo | `8b9f361a` | Ngăn kéo cockpit POST qua delivery policy của màn New request (policy của inbox có `governance_write_enabled=false`) |
| FF-A / FF-B1 / FF-B2 | `e6127770` / `65a5f74e` / `82943cfb` | Sửa 10 lỗi luồng + lỗi route (xem [user-flow-audit](user-flow-audit-2026-10-19.md) "Trạng thái sau sửa") |
| Crawler link | `dd4fab21`, `2404c164` | `e2e/execution-v2-links.spec.ts`, `v2Lane.ts`, `linkTargets.test.tsx` |
| Sửa reader | `94402566` | `certification.ts`, `liveFull.ts` (additive, V1 byte-identical), testkit `maxProperties`/`propertyNames`; gỡ workaround conformance của Canary/Access/Manager |
| Làm mới ledger N29/EDS-12 | `21af6792` | |

## Bản đồ hi-fi → component → field → trạng thái → test
Test là tệp trong `src/execution/v2/`; số `it()` là số khối trong tệp (case sinh bằng generator nhiều hơn: commit message ghi Paper model 369, màn L1 139, scale 9, negative 944 case thực chạy).

**Paper workbench** (`deployment-{mgr,res,wire}`, `hl-deployment-orders`; flag `workbench`; `screens/workbench/`)
| Hi-fi | Component | Field đã publish | Trạng thái | Test |
| --- | --- | --- | --- | --- |
| Masthead, crumb, thẻ PAPER, link Alpha/Account | `Header.tsx` | `deployment.{strategy_id,portfolio_id,account_id,venue}` | `Not published (FE-066)` cho tên; Account ẩn khi thiếu `execution.accounts.read` | `workbench.test.tsx` (71), `model.test.ts` (55) |
| 3 chip Runtime / Display freshness / Reconciliation | `Header.tsx` `chipsOf`, `StickySummary.tsx` | `deployment.active` (cờ nguồn), `envelope.freshness`, `asOf` | Runtime/Reconciliation `Not published (FE-067)`; freshness thật; không tuổi "14m" | cùng tệp |
| Lifecycle (spine, "3 of 7 criteria", Request exit review) | `LifecyclePanel`, `ExitGatePanel.tsx` | `observation_gate` (ngày, giao dịch, `state`) | spine không vẽ R1/R2 xong (FE-027/028); nút tắt kèm lý do + My access | cùng tệp |
| Tabs Overview/Orders/Fills/Positions/Sessions | `UrlTabs`, `OverviewTab`, `OrdersTab`, `FillsTab`, `PositionsTab`, `SessionsTab`, `TablePanel` | `orders`, `fills`, `positions`, `account_equity` | 200 hàng + "Showing N of total"; Sessions `Not published (FE-067)` kèm số đếm; Long/Short/Gross → cột đã publish | `workbench.scale.test.tsx` (9: thân 1 MiB và 7 MiB), `workbench.negative.test.tsx` (generator ~944 case) |
| Equity vs approved band | `OverviewTab` + `EquityPanel` | `account_equity` rows | band `Not published (FE-029)`; drawdown `(FE-013)` | `workbench.test.tsx` |
| Execution quality | `OverviewTab` | `getDeploymentQuality` | Latency "Not available", cờ Partial theo `latencyState` | cùng tệp |

**Sandbox** (`sandbox-{mgr,res,v1}`; flag `sandbox`; `screens/sandbox/`)
| Hi-fi | Component | Field | Trạng thái | Test |
| --- | --- | --- | --- | --- |
| Head, 3 chip, spine | `StageHeader` + `index.tsx` | `lifecycle`, `runtime_state` null | Runtime `Not published (FE-067)`; spine không "done" | `sandbox.test.tsx` (41) |
| 5 KPI (Steps passed, Open findings, Critical open, Plans, Gate) | `index.tsx` facts | `progress.passedCount/totalCount` (server), `findings` | Findings/Critical chỉ từ danh sách đầy đủ, ngược lại `(FE-072)` | `model.test.ts` (33) |
| Tab Reconciliation: Triad + Findings | `Triad` (suppressed), `FindingsPanel` | `source_panels` (envelope), `findings.rows` (`finding_code`, `summary`, `blocking`, `resolved_at`, `created_at`) | 3 cột "Not available" + lý do (khoá hàng FE-072); Difference không tự trừ | cùng tệp |
| Tab Steps (7 ô) | `StepsGrid.tsx` | `steps[]` V1 / `steps.items[]` V2 | PASS/FAIL/STALE/UNAVAILABLE từ server; "why" chỉ từ `summary` công bố | `readSandbox.conformance.test.ts` (21) |
| Promotion plans, Timeline | `PlansPanel`, `TimelinePanel` | `promotion_plans[]`, `timeline.rows` | Envelope/Author `(FE-072)` | `sandbox.test.tsx` |
| Rail: Exit review (Submit, Request exit disabled) + Record review note | `ExitReviewPanel`, `ReviewNoteForm` | `getReviewCaptureCapabilities`, `captureSandboxNote` | Ghi thật theo capability server, 8–1000 ký tự, không optimistic, idempotent theo ý định, từ chối có kiểu | `reviewNote.test.tsx` (25) |

**Canary** (`canary-{mgr,res}`; flag `canary`; `screens/canary/`)
| Hi-fi | Component | Field | Trạng thái | Test |
| --- | --- | --- | --- | --- |
| Khung kép guard, 3 chip, spine, Trial strip | `StageHeader`, `TrialStrip.tsx` | `lifecycle.day_index/duration_days` | "Trial day not stated" khi null; ngày mở exit `(FE-071)` | `canary.test.tsx` (48), `model.test.ts` (29) |
| 5 KPI | `Kpi` (index) | `kpis[]` | `value` null → Not available; không chia | cùng tệp |
| Chart Live vs Paper vs Backtest | `SeriesPanel` (`index.tsx`): một dòng `NotPublished`, không vẽ đường | `series` (`points maxItems 0`) | `Not published (FE-029/013/072)` | cùng tệp |
| Tab Envelope + gauge | `EnvelopeTab.tsx`, `CapGauge` | `envelope.limits`, `envelope_compliance` | gauge chỉ khi server cho tỷ lệ (D7); `(FE-071)` | `readCanary.conformance.test.ts` (22), `readCanary.test.ts` (28) |
| Tab Positions & orders | `PositionsOrdersTab.tsx` | `positions`, `blotter` rows (tên field của nguồn) | cột hi-fi `(FE-072)` | `canary.test.tsx` |
| Tab Reconciliation, Guard rule | `ReconGuardTabs.tsx` | `source_panels`, `command_policy.guard_semantics` | Triad "Not available"; guard rule suy từ cờ cấu trúc | cùng tệp |
| Rail: Hold/Reduce/Rollback/Request scale, Before scale-up, Rollback readiness | `DecisionPanel`, `BeforeScaleUp`, `RollbackPanel` (`Rail.tsx`) | `command_policy`, `lifecycle.blocker_codes`, `rollback_readiness` | luôn disabled + lý do (D6); "Ready" chỉ khi server true và không mâu thuẫn; 4 mục kiểm tra `(FE-071)` | cùng tệp |

**Live** (`live-{mgr,res}`, `hl-live-mismatch`; flag `live`; `screens/live/`)
| Hi-fi | Component | Field | Trạng thái | Test |
| --- | --- | --- | --- | --- |
| Khung kép, 3 chip, spine, thông báo Canary | `StageHeader` + notice | `broker_consistency.state`, `lifecycle.declared_stage` | Runtime `(FE-067)`; Canary chỉ có dòng link, không redirect (D5) | `live.test.tsx` (59), `model.test.ts` (37) |
| 5 KPI; chart slot (chart / mismatch / gap / unavailable) | `Kpi`, `ChartSlot` (`parts.tsx`) | `kpis`, `projection_continuity.gap_detected`, `broker_values_visible` | KPI `(FE-072)`; mismatch → khung đỏ + "Hidden", không rò giá trị broker (test DOM); gap null ≠ không gap | cùng tệp |
| Tab Exposure & orders (Triad + Positions) | `ExposureTab`, `KeyedTable` | `positions`, `orders` (V1 rows tự do; V2 `signed_qty`, `avg_px_open`, `mark_price`, …) | Leverage, Ack latency `(FE-072)`; keyset "Load more" 200 hàng, cursor hết hạn → khởi động lại | cùng tệp |
| Tab Continuity / Predecessor envelope / Guard rules | `ContinuityTab`, `PredecessorTab`, `GuardRulesTab` | `projection_continuity`, `predecessor_canary_envelope`, `command_policy` | gap window `(FE-072)`; 3 hàng guard từ cờ cấu trúc | cùng tệp |
| Rail: Protective ladder (Halt/Reduce/Close), What is blocking | `ProtectiveLadder`, `BlockerList` | `command_policy`, các `blocker_codes` | 3 bậc disabled "Live decisions are closed on this build" + My access; mã thô vào Provenance | cùng tệp |

**New request** (`new-approval-{mgr,res}`, `hl-new-approval-drawer`; flag `request`; `screens/request/`)
| Hi-fi | Component | Field | Trạng thái | Test |
| --- | --- | --- | --- | --- |
| Tiêu đề, StepBar 3 bước | `index.tsx`, `StepBar` | – | – | `request.test.tsx` (65) |
| Form: Alpha, Evidence run, Methodology claim, Summary | `NewRequestForm.tsx`, `useNewRequest.ts` | `GET /api/v1/quantbt/runs?limit=50` (COMPLETED), `eligible_methodology_claim_ids` | Alpha = alpha của run COMPLETED, "Showing 50" khi cắt `(FE-069)`; summary 8..2000 ký tự (D8) | `model.test.ts` (47), `request.test.tsx` |
| "Still needed" + Submit | thanh trong `NewRequestForm.tsx` | – | Submit tắt "Fill the missing fields first"; chặn bấm đúp; một khoá theo ý định | cùng tệp |
| Kết quả Created / Duplicate / Refused / Offline | `OutcomePanel.tsx` | `ApprovalCreateOutcome` (created, replayed, duplicate, refused, failed, offline) | mã từ chối vào Provenance; offline thử lại cùng khoá + payload | cùng tệp |
| Biến thể drawer 380px | `RequestDrawer.tsx` trên cockpit | `?compose=request` | URL chỉ điền form, không bao giờ POST; Esc trả focus; hàng đợi giữ nguyên | `request.test.tsx`, `cockpit.test.tsx`, e2e `execution-v2-s1.spec.ts:235` (đang đỏ) |

## Độ lệch so với hi-fi (D13 a–g và theo màn)
D13 (đã áp dụng, chờ Bobby phủ quyết): **(a)** chip Runtime/Reconciliation ghi "Not published" thay cho "Running/Reconciling" xanh tới FE-067; **(b)** spine không đánh "done" R1/R2 tới FE-027; **(c)** không in tuổi "14m" tự tính; **(d)** Positions Paper dùng cột đã publish thay Long/Short/Gross (FE-051); **(e)** tab Sessions và chip VN hiện "Not published" kèm id (FE-067, FE-070); **(f)** bỏ "Preview the result states" và công tắc "Route page | Drawer" khỏi sản phẩm; **(g)** thanh bối cảnh khoá môi trường theo deployment ("The deployment fixes the environment.").
Theo màn (từ commit message, tiêu đề tệp `index.tsx` và plan):
- Paper: mặc định mở Overview (V1 mở Orders); một đọc profile + nút Refresh, không realtime (D11); chấp nhận đọc profile ~7,4 MB ~6 s (D12, hỏi Codex S3-U1); bảng cắt 200 hàng; Account ẩn theo `execution.accounts.read` (tên tạm FE-037).
- Sandbox: ghi chú review tối thiểu 8 (server/V1), không phải 24 của hi-fi; Submit for review và Request Sandbox exit review luôn tắt (không có route lệnh, BR-EX-61); Difference không tự trừ; bước "why" chỉ từ câu server công bố.
- Canary: nhóm quyết định hiện dạng disabled kể cả khi V1 ẩn (`visible:false`, D6); không có "Used %" tự tính (D7); chart ba đường chưa vẽ: `SeriesPanel` chỉ in `Not published` (và `EquityPanel` chỉ có một `ghost`); "Ready" chỉ từ server true.
- Live: Halt/Reduce/Emergency close luôn disabled, không là no-op bật như V1; Canary notice thay vì redirect (D5); `panel`/`cursor` không vào URL trang.
- New request: không chip "Fresh · 12:04Z" (không có nguồn); danh sách Alpha suy từ run COMPLETED, không có nhãn ALL AUTHORIZED / YOUR ALPHAS (FE-069); khoá URL của ngăn kéo là `compose=request`; "Check original request" mở Inbox vì chưa có tra theo khoá (FE-069).

## Số liệu thay đổi
`git diff --stat 35953e07..21af6792`: **444 file, +64.540/−1.182**. Phần Codex (`d0789674`, `678cf731`): 93 file, +8.604/−210. Phần của Claude (`678cf731..21af6792`, 69 commit): **360 file, +55.940/−976**, theo loại: code sản phẩm V2 +15.490/−508 (141 file); css V2 +2.867/−41 (22); test và double V2 +21.100/−135 (88); code V1/dùng chung +920/−82 (15) và test của chúng +1.478/−2 (13); e2e spec và BFF double +2.427/−136 (11); fixture BFF +8.438/−0 (17); contracts (schema, generated, fixture) +414/−22 (15); control-api (FE-056/049/061, migration) +506/−24 (7); deploy/scripts +668/−2 (8); markdown +1.624/−16 (18); ledger JSON khác +8/−8 (5).

## Evidence (thật)
- `tsc --noEmit -p tsconfig.json`: exit 0.
- Vitest rộng `npx vitest run --maxWorkers=3 src/execution src/styles src/app src/portal src/fixtureBff e2e`: **38.699 pass, 5 fail, 8 expected-fail, 2 skipped; 267 tệp pass, 1 tệp fail**. 5 lỗi đều ở `realtimeProducerConsumer.test.tsx` (test môi trường của Codex, đỏ cả trên tip sạch của Codex, DEBT-UXM07-014).
- Playwright V2 (`execution-v2-s1` + `execution-v2-links`, `chromium-v2`): **exit 1: 74 pass, 2 fail**. Đỏ: (1) `execution-v2-s1.spec.ts:45` hàng `live-v2body` ở 1440: `[data-screen="live-v2"]` không hiện trong 5 s; (2) `:235` ngăn kéo New request: nút "Submit for R1 review" vẫn disabled ("This screen has no published delivery policy…"), đúng triệu chứng `8b9f361a` đã định sửa. Crawler link: pass (5,1 phút). **Chưa chẩn đoán trong bước docs; log không ghi bản build đã dùng** (DEBT-UXM07-023). Không gọi là xanh.
- Bước docs này: `scripts/execution-tracking-test.sh` (R0), `git diff --cached --check`, `node --test scripts/research-preview/fixture-bff-config.test.mjs` (15 pass).
- Trình duyệt bắt được cái test đơn vị không bắt (đã ghi trong commit): ngăn kéo cockpit bị policy inbox chặn POST (`8b9f361a`); ba test có sẵn đỏ trên tip (hàng canary, literal lane-root, literal testbase) được sửa cùng `ef9014f3`.

## Chưa làm / NOT_RUN
Visual pinned-image (verify) cho nhóm V2 mới và các tệp V1 dùng chung (`certification.ts`, `liveFull.ts`, `Sidebar`, `PortalShell`, `PortalRoutes`, `navigation`, `links`); hook đầy đủ; axe trên route V2; đọc API thật; bundle-size test (cần `dist/`); không có baseline ảnh nào cho nhóm mới (DEBT-UXM07-016/017/019). Ảnh hi-fi chỉ xem trong phiên (scratchpad), không commit.

## Agent log 2026-10-19 (vai trò đã dùng; không ghi số token vì không có số đo)
- Phân tích chỉ-đọc cho kế hoạch S3 (một agent, xem hi-fi và mã V1/V2): `7ce1be27`.
- Writer W0a (khung), W0b (cổng/reader có phiên bản): hai writer song song, file rời nhau.
- Writer theo màn: W-PAPER, W-SANDBOX, W-CANARY, W-LIVE, W-REQUEST (mỗi writer một thư mục, một commit).
- Writer sửa luồng: FF-A (route/URL), FF-B1 (Operations, Admin, Overview, Blotter, Access, Portfolios), FF-B2 (Alpha, Account, Cockpit, Fleet, Drawer).
- W-INTEG (nối route, người duy nhất chạm `ExecutionPreviewRoute.tsx`), W-E2E (double, spec, fixture BFF), writer crawler link, writer sửa reader (`94402566`).
- Reviewer độc lập chỉ-đọc: luồng hành trình (journeys), route/URL, trung thực (honesty), a11y, backend F1 (B1/FE-042), logic FE, kiểm tra đầy đủ (completeness audit); kết quả: [user-flow-audit](user-flow-audit-2026-10-19.md), mục "Đợt sửa thứ hai" phía trên, và danh sách trong phiên này. Hai review độc lập về S3 chưa có tệp trong `evidence/UXM-07/` tại thời điểm viết.
- Docs writer (bước này): chỉ sửa tài liệu và hai tệp fixture-preview; không sửa mã sản phẩm (ngoại trừ một câu comment trong `v2/blocks/notPublished.tsx`).
