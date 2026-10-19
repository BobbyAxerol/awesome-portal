# UXM-07 — Frontend implementation, slices S0 + S1 + S2 + S3 (fixture-browser lane)

Chủ: Claude · cập nhật 2026-10-19 (Asia/Saigon) · Trạng thái: **R2 của S0–S2 đã xong; S1/S2 đã hạ cánh lên `docs/research-loop-plan` tại `35953e07`; S3 (Paper workbench, Sandbox, Canary, Live, New request) đã dựng, tip `21af6792` trên `claude/fe-parity`, tier R1 từng lát + cổng trên cây đã merge, R2 của S3 chưa chạy; cổng trình duyệt V2 hiện 74 pass / 2 fail (DEBT-UXM07-023); chưa push** — hồ sơ: [receipt](frontend-receipt.md), [backend-requests](backend-requests.md), [test-results](test-results.json), [debt](debt-register.json), [rollback](rollback.md), [user-flow-audit](user-flow-audit-2026-10-19.md), [S3 plan](../../design/impl/S3-STAGE-SCREENS-PLAN-2026-10-19.md). (Các mục 1–3 dưới đây là thẻ phạm vi S0/S1 lúc bắt đầu, giữ nguyên làm lịch sử; mục 4b, 4c và 5–7 phản ánh tình trạng hiện tại.) Khớp [Rules §7](../../AGENT_WORKING_RULES.md), [PHASE_PACKET_TEMPLATE](../../PHASE_PACKET_TEMPLATE.md), checklist [design/impl/UXM07-RULES-CHECKLIST.md](../../design/impl/UXM07-RULES-CHECKLIST.md).
Lane mọi receipt: **FIXTURE_LAB / BFF_DOUBLE** (Rules 9.5.5). Fixture thành công không phải real-API acceptance; đọc dữ liệu thật thuộc UXM-08.

## 1. Entry gate
- **Approval reference:** Bobby, 2026-10-18, "Duyệt hết" cho đề xuất: giao UXM-07 lát S0 (nền tảng) + S1 (Approvals cockpit ở chế độ xem trước, Operations, Access, Fleet danh tính), kèm các bước 1–4 (gửi Codex, hạ cánh, kit); đã duyệt HIFI/LOWFI (Artifact v11); quyết định U1–U4 ([design/README](../../design/README.md)); reader viết tay (2026-10-18); thêm token vào khối carbon của `tokens.css` (S0, append-only, không `color-mix`). Bobby nêu "bạn cứ làm theo kế hoạch đã duyệt, đọc lại rules".
- **Giả định tôi ghi để Bobby sửa nếu sai:** nhánh đích `claude/fe-parity` (worktree `/home/bobby/portal-research-fe`); rebase lên `docs/research-loop-plan` @ `ac056d46` được coi là đã duyệt vì là quy trình đã dùng từ đầu; **không push; không ff-merge** vào `/home/bobby/portal-research` khi Codex còn thay đổi staged (cần lượt hạ cánh thống nhất); **không rebuild preview dùng chung**, không Docker/DB, không HK.
- **Resource ceiling:** một job nặng mỗi lần; Playwright workers ≤2; ≤4 CPU/4 GiB; đĩa ≤8 GiB; không port công khai mới; dọn tài nguyên của mình, không `docker prune`. Test: vitest focused theo từng đơn vị + `tsc -b`; full lane và baseline có pinned image chỉ ở mốc.
- **Pins (G0):** Portal producer `ac056d46` (sau rebase); HIFI kit = commit `29cdd3e4` (`design/hifi/v2`); decision register `design/review2/00`; TS `c4819bc0` (chưa repin), PM `b9fae791` (**không dùng ngữ nghĩa PM ở S0/S1**), Edge `20a1d27f`; HK: N/A (pin từ digest, ngày 2026-10-18). Generated types/fixtures: ghi hash khi bắt đầu từng đơn vị.

## 2. Phạm vi
**S0 nền tảng (sau cờ `VITE_EXECUTION_V2_SCREENS`, mặc định tắt; cần `VITE_EXECUTION_PREVIEW_ENABLED=true`):**
| Đơn vị | Nội dung | File (một người ghi) |
| --- | --- | --- |
| U1 Token | `--series*`, `--f-*` (+ `--f-pending-hatch`) append-only trong khối execution-carbon; cặp màu trực tiếp theo từng loại (không gián tiếp qua `--c`) | `src/styles/tokens.css` (chỉ khối carbon), `tokens.test.ts` |
| U2 Cờ + URL | manifest cờ; `urlState.ts` (env, window, ccy, stage, q, sort, group, sel, tab, view, ctx, from; mặc định không serialize); `tabAliases.ts` (`?tab=Insight+Charts` → slug) | `src/execution/v2/{flags,urlState,tabAliases}.ts`, `vite-env.d.ts`; `useParamState` giữ nguyên |
| U3 Flag | `Flag` ngữ nghĩa (16 loại) glyph + hue; chữ 11px = `--exec-font-label`; `attention` không đỏ như rejected (cần Bobby xác nhận hue: tôi chọn vàng cam) | `v2/Flag.tsx`, `flagKinds.ts`, `v2/css/flag.css` |
| U4 Shell | `ContextBar` gắn trong `PreviewFrame` chỉ khi cờ `shell` bật. `CommandBar` (⌘K) **không** nằm trong `PreviewFrame`: từ 2026-10-19 (Bobby chốt) nó gắn ở `PortalShell` qua `ExecCommandBar` (lazy, chỉ khi cờ `shell` bật **và** route là Execution — `app/commandRouting.ts`; route Research/Planning/Governance-light giữ palette V1). **`Sidebar` ở S0 chưa đụng; từ FF-A `e6127770` (2026-10-19) `Sidebar.tsx` và `PortalRoutes.tsx` đã đổi, sau cờ `shell`** (rail gọi `applyV2Nav`, ẩn mục `APPROVALS` có `navigation.scoped_v2_replacement` theo FE-039, mang `workspace_id`/env/window/ccy qua `withContext`); `PortalShell.tsx`, `commandRouting.ts`, `portal/navigation.ts` (xuất `isNavigable`) đổi ở `e926b09a`. **Bobby cần xác nhận việc chạm các file nav dùng chung này** (xem mục 7 "Cần Bobby quyết", DEBT-UXM07-024) | `v2/shell/{ContextBar,CommandBar,ExecCommandBar,roleNav}`, `app/{PortalShell,commandRouting}`, `v2/css/shell.css` |
| U5 Drawer + thẻ | `.exec-dock` (không trùng `.exec-drawer*`), `cardsTable` ≤660px | `v2/Drawer.tsx`, `v2/cardsTable.tsx` |
| U6 Reader | `v2/boundary.ts` trên `readExactDecimal`/`formatExact`; bất biến: `available ⇔ value`, reason khi thiếu, không `.field === true`, không "—" | `v2/boundary.ts` + test (positive, L3 âm tính, bảng ràng buộc chéo của Codex khi có) |
| U7 Tích hợp | sửa một dòng `ExecutionPreviewRoute.tsx` (`PreviewFrame`); thêm `v2` vào `productBoundary.test.ts`; `v2Hygiene` + test DOM giống hệt khi cờ tắt | primary (một người ghi) |

**S1 (sau S0 xong, thẻ chi tiết sẽ cập nhật trước khi build):** Approvals cockpit (hàng đợi + khung, **nút quyết định luôn tắt "Preview · not recorded"**, chỉ hiện trạng thái receipt từ fixture; ghi quyết định là lệnh thuộc UXM-09), Operations (grain `operation_id`; "Mine", Acknowledge, Resolve tắt kèm lý do; chưa có actor/SLA), Incident drawer (chỉ root), Access, Fleet danh tính (cột không tiền). Chặn theo **capability**, không theo tên vai (Rules 9.3.7). Nối dữ liệu qua HTTP adapter + BFF double (`e2e/bffDouble.ts`) dùng fixture L0 của Codex; không fixture trong product graph. S2–S4 chỉ thiết kế.
**Ngoài phạm vi (tạm hoãn vì vi phạm quy tắc hoặc chờ nguồn):** bật màn trên route sản phẩm và xoá test/baseline/component V1 (migration bước 5–6); sửa shell/nav/registry (chờ Codex rev 7); Dockerfile ARG cho cờ (yêu cầu cho chủ file); recorder baseline gắn cứng Research (cần gọi có phạm vi); mọi đọc thật, lệnh, HK.

## 2b. Thẻ S1 đã tinh chỉnh (2026-10-18, sau khảo sát chỉ-đọc; trước khi build)

**Lane:** FIXTURE_LAB / BFF_DOUBLE. Màn V2 mount sau cờ khoá tương ứng (`fleet`, `cockpit`, `ops`, `profile`) bằng mẫu `lazy()` đọc chuỗi env thô như `PreviewFrame` (S0), điều kiện `isV2Screen(key)` trong `switch` của `ExecutionPreviewRoute.tsx`. Mọi đọc đi qua `ExecutionApi`/`httpApi` và `e2e/bffDouble.ts`; màn V2 không import `*.fixtures`/`*.smoke`. Không bật cờ trên route sản phẩm (migration bước 5–6 hoãn); không xoá test/baseline V1 (C2).

### Thứ tự build (theo độ sẵn sàng dữ liệu) và cỡ
| Bước | Màn | Cỡ | Đọc đã publish | Chưa publish → hiển thị "Not published" + FE-xxx |
| --- | --- | --- | --- | --- |
| S1a | **Fleet identity** (không tiền) | M | `/alphas` v2: alpha+version, owner, portfolios, stage, health, attentionReasons, đếm | group (FE-012), readiness x/7 (FE-027/028), Archived (FE-034), Compare-in (FE-033), Map (FE-035), window (FE-025). Cột tiền/sparkline bị loại ở S1 |
| S1b | **Approvals cockpit** (xem trước) | L | inbox + R1/R2/Live/Exit + waivers + history; 5 làn gate + làn waiver | làn Archive/Reactivation/Capital (FE-034), criteria đồng nhất (FE-028), evidence chart (FE-029), call/ladder/receipt_ref (FE-030). Nút quyết định **luôn tắt** "Preview · not recorded" |
| S1c | **Operations queue V2** | M–L | `portal.execution.operational-queue.v2` (operation_id, command_key, target, env, risk, severity, source_status, verification_result, triage_state) | Mine/ack/resolve actor, SLA, Display axis, amounts, Audit (FE-021), source health, Exceptions. Mine/Ack/Resolve tắt kèm lý do |
| S1d | **Incident drawer (root)** | S–M | `portal.execution.incident-current-root.v2` | evidence, operations taken, gates, timeline, assignee (`historical_children` NOT_PUBLISHED). Drawer trên route, hàng đợi vẫn mount |
| S1e | **Access (xem của mình)** | M | session `access.capabilities`; `/api/admin/profile-access/v2/effective` (POLICY_PENDING, grants rỗng) | "granted by", preset, reason_class (FE-015), researcher policy (FE-026). Làm cuối; phụ thuộc FE-037/038 |

### Scale-refine 6 ô (rút gọn, theo CLAUDE.md §8)
| Màn | Cardinality (hi-fi → thật) | Break point | Degradation | Server contract | Invariant | Perf budget |
| --- | --- | --- | --- | --- | --- | --- |
| Fleet | 9 alpha → 10²–10³ alpha, 3–6 deployment mỗi alpha | >~200 hàng DOM; cột Stage/Health đọc không nổi ở <660px | keyset page theo `limit`+cursor, cards <=660px; không virtualize trước 500 | `/alphas` đã có cursor/sort/limit; group server-side = FE-012 | đếm `~` khi xấp xỉ; "top N / total"; PARTIAL không xanh | ≤200 DOM row/trang |
| Cockpit | 5 approval → 10²–10³ mở, 8 làn | hàng đợi >100 | lọc theo làn + trang; "Needs you" ghim | inbox cursor sẵn có; ladder FE-030 | quorum/SLA hiện số thật, không làm tròn; waiver không lẫn gate | ≤150 DOM node hàng đợi |
| Ops queue | 6 op → 10³–10⁵ op | >200 hàng; bảng 6 cột vỡ <900px | keyset (before/after), cards, cap + "xem tất cả"; không đếm cục bộ | cursor/sort/filter server (đã có), `assigned_to=me` trả 400 → nút Mine tắt | Unknown outcome không gộp thành xanh; số op không viết tắt | ≤200 DOM row |
| Incident | 1 gốc | n/a | n/a (chỉ root) | `historical_children` NOT_PUBLISHED | không dựng timeline giả | n/a |
| Access | 12 hành động | n/a | n/a | effective/POLICY_PENDING | "Not available yet" khác "Not allowed" | n/a |

### Kế hoạch fixture (Rules 9.5) — bffDouble, không đưa vào product graph
- L0 hợp lệ: fixture canonical `packages/contracts/fixtures/execution-operational-current.synthetic.valid.json` (queue/incident), `execution-alpha-fleet-list.v2.valid.json`, `governance-live-review.valid.json`; mở rộng `alphaFleet()` trong double lên 3–5 hàng có lọc stage/owner/health và phân trang.
- L1 rỗng, L2 PARTIAL/STALE, L3 âm tính (field sai kiểu, `value` kèm `UNAVAILABLE`) nằm trong test của reader (`v2/readers/*.test.ts`), không trong double.
- Double chỉ trả V2 khi test bật (`stubExecutionBff(page, {operations:"v2"})`) để hành trình V1 giữ nguyên.
- Mọi endpoint mới phải thêm vào `bffDouble.contract.spec.ts`; endpoint chưa có → 501 và màn V2 hiện "Not published", không crash.

### File dùng chung chạm vào (mỗi file một người ghi: primary)
`ExecutionPreviewRoute.tsx` (4 case có cờ), `api/ports.ts` + `api/httpApi.ts` (đọc V2: operational queue, incident root, access effective), `e2e/bffDouble.ts` + `bffDouble.contract.spec.ts`, `playwright.config.ts` (**project thứ 3**: cổng mới, build có `VITE_EXECUTION_V2_SCREENS`; V1 giữ cổng 4174/4175), `app/PortalRoutes.tsx` (chỉ S1e). Spec/PNG V2 đặt tên mới cạnh V1.

### Tác động V1 khi cờ tắt / bật
Cờ tắt: không đổi (bằng chứng S0 mở rộng: DOM test + dist grep cho từng khoá). Cờ bật: spec V1 journeys EL-V2-05/07, `execution-preview` ROUTES và 7 PNG governance sẽ đổi trên build đó → chỉ chạy trong project thứ 3, không chạy trong 4174/4175.

### Câu hỏi còn mở (không chặn S1a–S1d)
1. Capability cho Operations/Accounts (FE-037) — nav fail-closed tới khi Codex trả lời.
2. Access: `profile` là self-view hay trình soạn của owner (FE-038); S1e xây self-view.
3. `window` 24H cục bộ cho Operations hay dùng window chung — dùng 24H cục bộ theo review2/07, ghi lại.

## 3. Ma trận yêu cầu → test → exit (S0; S1 cập nhật sau)
| Yêu cầu | Reuse/Change/New | Test | Exit |
| --- | --- | --- | --- |
| Token carbon mới, không đổi pixel V1 | New (append-only) | `tokens.test.ts` + diff hunk chỉ trong khối carbon | PASS khi test xanh và DOM tắt cờ giống hệt |
| Cờ ngữ nghĩa | New | render 16 loại, không xanh cho partial, cặp tương phản | PASS |
| URL layer + bí danh tab | New | parser, `withContext`, alias, mặc định không serialize, back/forward | PASS |
| Reader biên | New | positive, L3 âm tính, bất biến `available ⇔ value` | PASS |
| ContextBar / CommandBar / Drawer / cards | New | DOM + phím ⌘K, drawer docked/overlay, cards 660 | PASS |
| Cờ tắt = không đổi | Change | DOM identical, `dist` không chứa `exec-flag/exec-ctxbar/exec-cmdbar`, baseline pinned (mốc) | PASS ở mốc |

UX-F áp dụng (fixture lane, tập con): F01/02/03 (vai, deny), F04/05/06 (ngữ cảnh, kinh tế), F19/20 (điều hướng, URL), F22 (design system); còn lại N/A cho S0 vì chưa có màn (ghi lý do khi đóng).

## 4. Hồ sơ, request, nợ
- **Receipt (V2; CLAUDE.md §7.10 chỉ đặt tên Research):** `frontend-receipt.md`, `backend-requests.md`, `test-results.json`, `debt-register.json`, `rollback.md` trong thư mục này (Bobby sửa nếu muốn tên khác).
- **Request:** FE-001…065 và FE-066…072 + S3-U1…U4 ở [sổ đồng bộ](../../FRONTEND_BACKEND_SYNC.md) (§3, §3b, §6); thẻ đầy đủ ở [backend-requests](backend-requests.md); thứ tự ưu tiên ở [codex-priority-requests](codex-priority-requests-2026-10-19.md). Tất cả dòng FE-057…065 và FE-066…072: **OPEN, chưa gửi Codex**. P1 chặn: FE-025, 027, 028, 030, 072. Tin nhắn cho Codex: [PROMPT_FOR_CODEX](../../design/sync/PROMPT_FOR_CODEX.md) (AWAITING_CONSUMER_REVIEW).
- **Nợ mở (cập nhật 2026-10-19; đã bỏ các mục đã đóng):** danh sách đầy đủ trong [debt-register](debt-register.json). Đã đóng và bỏ khỏi đây: DEBT-UXM07-001/002/003/009/010/012 và FE-040 (Dockerfile ARG, `c2ac97da`), FE-042/043 (B1, đã render). Còn mở: PM pin (không dùng ngữ nghĩa PM ở các màn UXM-07, xem pins ở mục 7); hue `attention` (chọn cam `#ffa51f`, chờ Bobby xác nhận); bảng ràng buộc chéo RV-1 và MD-1…MD-8 (Codex); 004 (chỉ còn FE-048 phía server), 005/006 (tên capability tạm, Compare không có row registry), 007 (đỏ có sẵn trên tip Codex), 008, 011, 013, 014 (`realtimeProducerConsumer`); mới từ S3: 015 (9 hàng `KNOWN_OVERFLOW`), 016 (chưa baseline cho nhóm V2 mới), 017 (không axe), 018 (thiếu conformance Paper/Request/Live V1), 019 (file V1 dùng chung chưa verify visual), 020 (href PAPER_EXIT không có route), 021 (ngăn kéo docked ≥1500px), 022 (Fleet Board 8 lane tràn), 023 (2 test trình duyệt đỏ), 024 (Bobby duyệt chạm file nav).

## 4b. S3 screens wired (2026-10-19, W-INTEG)
Năm màn tầng stage đã được nối vào `ExecutionPreviewRoute.tsx`, mỗi màn một khoá và một chunk `lazy()` đọc chuỗi env thô (cờ tắt không phát chunk nào). `EXEC_V2_PENDING_KEYS` giờ rỗng; còn `archived`, `replay` là khoá dành riêng vĩnh viễn.

| Khoá | Route | Gốc V2 (`data-screen`) | Ghi chú |
|---|---|---|---|
| `workbench` | `/deployments/paper/:deploymentId`, `/deployments/paper/:deploymentId/vn-market` | `workbench-v2` | Chỉ nhánh có `deploymentId`; `/deployments/paper` (không id) vẫn là redirect Fleet hoặc danh sách V1. Biến thể `vnm` là prop |
| `sandbox` | `/deployments/sandbox/:deploymentId` | `sandbox-v2` | Danh sách không id giữ `stageListRedirect("sandbox")` hoặc V1 |
| `canary` | `/deployments/live/:deploymentId/canary` | `canary-v2` | Màn tự đọc `workspace_id` từ URL |
| `live` | `/deployments/live/:deploymentId` | `live-v2` | `/deployments/live/:id` là Live, `/…/canary` là Canary |
| `request` | `/governance/approvals/new` | `new-request-v2` | Bề mặt Carbon khi cờ bật (V1 giữ bề mặt governance). Ngăn kéo (`?compose=request`) đi theo khoá `cockpit`: nút "New request" trên Approvals, kể cả chế độ nhà nghiên cứu |

Thanh bối cảnh (cờ `shell` bật, cùng màn bật): cửa sổ bị khoá với nhãn riêng (Published window · Certification run · Trial window · Since activation), môi trường khoá với lý do "The deployment fixes the environment." Cờ tắt giữ lý do "The path sets the environment." và không có chip cửa sổ. Ngăn kéo mở thì phím j/k/n/Esc không điều khiển hàng đợi cockpit. Test: `v2/flagOn.test.tsx`, `v2/flagOff.test.tsx`, `v2/linkTargets.test.tsx`, `v2/flags.test.ts`, `screens/cockpit/cockpit.test.tsx`.

## 5. Rollback (S0 đến S3)
Cách chính vẫn là tắt cờ: bỏ khoá khỏi `VITE_EXECUTION_V2_SCREENS` / `PORTAL_EXECUTION_V2_SCREENS` (mặc định rỗng; FE-040 đã có ở Dockerfile, `c2ac97da`) rồi build lại; không cần revert code và khoá nào cũng không cần migration. Bảng đầy đủ **khoá cờ → màn/route → commit → lệnh lùi** cho cả 20 khoá (chỉ `archived` và `replay` là dành riêng), cùng phần backend/hạ tầng (migration `1723680000145` kèm Down, Dockerfile ARG, compose, overlay fixture BFF, contract FE-056/049/061) và những file V1 dùng chung đã đổi ở [rollback.md](rollback.md). Câu cũ "không đụng backend/registry/contracts", "không migration" và "Dockerfile chưa có cờ" **không còn đúng** và đã được sửa ở đó. Các lệnh `git revert` ghi ở đó chưa được chạy thử.

## 6. Báo cáo cuối lát S3 (CLAUDE.md §7.4, 7 mục) — trạng thái 2026-10-19
1. **Đang ở đâu.** UXM-07, slice S3 (Paper workbench, Sandbox, Canary, Live, New request) **đã dựng và đã nối route sau khoá riêng**; kèm FF-A/B1/B2 (sửa luồng và route), crawler link và sửa reader. Giữa chừng ở mốc: R1 từng lát xong, **R2 của S3 chưa chạy**, và cổng trình duyệt V2 **đang đỏ 2/76** (DEBT-UXM07-023). Chưa push, chưa hạ cánh S3.
2. **File đã sửa.** Trong khoảng `35953e07..21af6792`: 444 file (Claude 360 file: `src/execution/v2/**` 251 file gồm 5 thư mục màn mới `screens/{workbench,sandbox,canary,live,request}`, `blocks/{StageHeader,Tabs,CapGauge,BlockerList}`, `screens/stage/reasons.ts`, `css/{stage,workbench,sandbox,canary,live,request}.css`; `src/execution/{certification,liveFull,links,ExecutionPreviewRoute}` ; `src/app/{Sidebar,PortalRoutes,PortalShell,commandRouting}`; `e2e/{bffDoubleStage,execution-v2-s1.spec,execution-v2-links.spec,v2Lane}`; fixture BFF; control-api/contracts cho FE-056/049/061 và migration 145; docs). Liệt kê từng đường dẫn: `git diff --stat 35953e07..21af6792`; theo loại ở [frontend-receipt](frontend-receipt.md) mục "Số liệu thay đổi".
3. **Số dòng.** Tổng `+64.540/−1.182` (444 file), trong đó Codex (`d0789674`, `678cf731`) `+8.604/−210` (93 file) và Claude `+55.940/−976` (360 file). Theo loại: V2 code `+15.490/−508`, test V2 `+21.100/−135`, css `+2.867/−41`, V1/dùng chung `+920/−82`, e2e `+2.427/−136`, fixture BFF `+8.438/−0`, contracts `+414/−22`, control-api `+506/−24`, deploy/scripts `+668/−2`, markdown `+1.624/−16`.
4. **Align với codex.** Chạm: contract FE-056 (operator task display), FE-049 (`Decimal.maxLength`, `PARTIAL`), FE-061 (mã lỗi đóng), migration `1723680000145` (cần Codex review, M2 vẫn mở); không đổi `screen_id`/registry; không dùng `EX-BE-*` mới; **7 request mới FE-066…072 và S3-U1…U4 chưa gửi**. Không làm đổi thứ Codex đang dựa vào (mọi thay đổi additive; V1 byte-identical khi cờ tắt, bằng DOM test). Hai ghi thật (New request, ghi chú Sandbox) là route V1 đã có.
5. **Evidence.** `tsc` exit 0; vitest rộng 38.699 pass / 5 fail (đều `realtimeProducerConsumer`, DEBT-UXM07-014) / 8 expected-fail / 2 skipped; Playwright V2 74 pass / **2 fail**; chi tiết và lệnh: [test-results.json](test-results.json) khối `s3`. **Chưa chạy:** visual pinned-image cho nhóm mới và file V1 dùng chung, hook đầy đủ, axe, đọc API thật.
6. **Tiếp theo.** (a) Chẩn đoán và sửa hai test trình duyệt đỏ trên bản build mới (DEBT-UXM07-023), vì cổng R2 không thể chạy khi đang đỏ; (b) sửa 9 hàng `KNOWN_OVERFLOW` (DEBT-015) và chạy axe (DEBT-017); (c) thêm conformance Paper/Request/Live V1 (DEBT-018); (d) R2: visual pinned-image verify rồi ghi baseline cho nhóm V2 mới, hook đầy đủ, rebase nếu Codex có tip mới.
7. **Khi nào sang phase mới.** S3 đóng khi: hai test đỏ xanh trên build mới; vitest rộng chỉ còn đỏ của Codex; visual verify của file V1 dùng chung không đỏ ngoài tập đã đỏ trên tip sạch của Codex (DEBT-007); baseline nhóm mới được ghi và xem; hook đầy đủ xanh; Bobby xác nhận mục 7 (nav dùng chung, D1–D13). Sang UXM-08 (đọc API thật) cần thêm: ít nhất FE-072 và FE-067 có hợp đồng và fixture SOURCE_BACKED, FE-037/058 trả lời, nguồn Research được cài (`NO_ACTIVE_MAPPING` hiện còn), và phiên Bobby chọn gửi các request.

## 7. Hai chiều, quyết định, bước kế tiếp, pins
**Yêu cầu hai chiều.**
- *FE → Codex (OPEN, chưa gửi):* FE-057…063/065 (nav/eligibility), FE-066…072, S3-U1 (route `shadow-panel` + qualification), S3-U2 (schema + fixture cho alpha-resource/subject-records/observed-timeline/market-candles; FE đọc v1, v2 đã có), S3-U3 (hai cổng `deployment` chưa kiểm), S3-U4 (FE-051 cho vị thế deployment); cũng chờ Codex review FE-056/049/061 và migration 145. Chi tiết: [backend-requests](backend-requests.md) mục S3.
- *Codex → FE:* trả lời Q1–Q6 (`consumer-review-self-contracts-2026-10-19.md` §9) để nối `self-navigation`/`self-eligibility`; mở phạm vi nguồn tối (Sandbox/Canary/Live) và Research-only install (hiện `NO_ACTIVE_MAPPING`); quyết định M2 (đếm `status_counts` luôn bật); phát hành fixture Manager `REAL_RECEIPT`. FE chưa nhận gói nào mới ngoài `d0789674` và `678cf731`.

**Cần Bobby quyết.**
1. *Chạm file nav dùng chung* (`Sidebar.tsx`, `PortalRoutes.tsx` ở FF-A `e6127770`; `PortalShell.tsx`, `commandRouting.ts`, `navigation.ts` ở `e926b09a`): đều sau cờ `shell`, off thì giống hệt (có test); CLAUDE.md §0 đòi hỏi Bobby khi chạm component dùng chung. Xác nhận giữ, hoặc revert (lệnh ở rollback.md). DEBT-UXM07-024.
2. Phủ quyết hoặc xác nhận D1–D13 của S3 (đặc biệt D1 giữ hai ghi thật bật, D4 chấp nhận "đúng cấu trúc, trống trung thực" cho Sandbox/Canary/Live, D13 a–g).
3. Gửi nhóm request nào cho Codex trước (đề xuất: FE-072, FE-067, FE-071, S3-U1, S3-U2).
4. Href `PAPER_EXIT` của Sandbox trỏ `/deployments/paper/exit/{id}` không có route: ánh xạ sang `/governance/exit-reviews/{id}` ở FE hay chờ Codex (DEBT-UXM07-020).
5. Hue `attention` cam; copy `reason_class` (Q6); câu chữ ô "Not published (FE-015)" cho eligibility.
6. Cho phép chạy visual pinned-image ở R2 và ghi baseline nhóm mới (quy tắc đã ghi: Claude tự chạy recorder, xem contact sheet).

**Đề xuất bước kế tiếp (Claude, không cần chờ ai):** sửa hai test đỏ → sửa overflow + axe → conformance còn thiếu → R2 (visual verify, baseline, hook) → cập nhật Unified §14 và push khi Bobby bảo. Đã có [rollback](rollback.md) để lùi theo khoá.

**Pins (đọc, chưa đọc lại bằng runtime).** Portal: base landing `35953e07`, tip `21af6792`; Codex đã tích hợp `d0789674` (native read runtime) và `678cf731` (isolated Research native review, exact stage reads); `f4643915` (Codex) không có trong lịch sử của tip. Kit hi-fi `design/hifi/v2` (pin S0 `29cdd3e4`/`e454ebde` theo mục 1 và receipt). Four-source cut 2026-10-19T04:46Z theo [Source Truth Board](../SOURCE_TRUTH_BOARD.md): Edge `5f433f8c`, PM `908169aa`, TS `365902e1`, DL `9b42667e` (không có mount runtime nào được nâng thành `EXISTS_MOUNTED`; PM mapping cho Research Bobby trả `NO_ACTIVE_MAPPING`). Registry rev 7 (chỉ `navigation.scoped_v2_replacement` cho `APPROVALS`). Contracts snapshot đã sinh lại (`4954dc01`); ledger N29/EDS-12 làm mới ở `21af6792`.
