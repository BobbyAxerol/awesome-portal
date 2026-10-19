# UXM-07 — Frontend implementation, slices S0 + S1 (fixture-browser lane)

Chủ: Claude · 2026-10-18 (Asia/Saigon) · Trạng thái: **S0 @ `d891b2a5`; S1a–d (Fleet, Cockpit preview, Operations V2, Incident root) @ `50994a6b` + `f0b17ec4`, tier R1, chưa push; S1e Access + S2 (Overview, Portfolios/360/Compare, Alpha 360+Replay, Accounts/360, Blotter, Admin, Users) đã dựng ở lane fixture, tier R1 (B1/B2 qua hook R3); R2 mốc đang chạy (Rules §10.10)** — hồ sơ: [receipt](frontend-receipt.md), [backend-requests](backend-requests.md), [test-results](test-results.json), [debt](debt-register.json), [rollback](rollback.md). Khớp [Rules §7](../../AGENT_WORKING_RULES.md), [PHASE_PACKET_TEMPLATE](../../PHASE_PACKET_TEMPLATE.md), checklist [design/impl/UXM07-RULES-CHECKLIST.md](../../design/impl/UXM07-RULES-CHECKLIST.md).
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
| U4 Shell | `ContextBar` gắn trong `PreviewFrame` chỉ khi cờ `shell` bật. `CommandBar` (⌘K) **không** nằm trong `PreviewFrame`: từ 2026-10-19 (Bobby chốt) nó gắn ở `PortalShell` qua `ExecCommandBar` (lazy, chỉ khi cờ `shell` bật **và** route là Execution — `app/commandRouting.ts`; route Research/Planning/Governance-light giữ palette V1). **`Sidebar` chưa đụng** (đợi registry rev 7) | `v2/shell/{ContextBar,CommandBar,ExecCommandBar,roleNav}`, `app/{PortalShell,commandRouting}`, `v2/css/shell.css` |
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
- **Request:** FE-001…036 ở [sổ đồng bộ](../../FRONTEND_BACKEND_SYNC.md); P1 chặn S1/S2: FE-025, 027, 028, 030. Tin nhắn cho Codex: [PROMPT_FOR_CODEX](../../design/sync/PROMPT_FOR_CODEX.md) (AWAITING_CONSUMER_REVIEW).
- **Nợ mở:** hue `attention` (chọn cam, chờ Bobby xác nhận); PM pin; bảng ràng buộc chéo (RV-1); DEBT-UXM07-001/002 (lỗi có sẵn trên tip Codex, xem debt-register); FE-037…041 ở [backend-requests](backend-requests.md).

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

## 5. Rollback
Tắt cờ `VITE_EXECUTION_V2_SCREENS` (mặc định đã tắt) rồi xoá `src/execution/v2/**` và các test mới; token chỉ append trong khối carbon nên gỡ không ảnh hưởng; không đụng backend/registry/contracts.

## 6. Báo cáo cuối lát và tiếp theo
Theo template 7 mục (CLAUDE.md §7.4) + Rules 7.4 bảy mục; cập nhật packet này, Unified §14 và sổ đồng bộ cùng lần giao. Tiếp theo: U1 → U2…U6 song song → U7 → mốc kiểm (full vitest + tsc + baseline pinned).
