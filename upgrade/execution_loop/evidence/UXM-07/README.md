# UXM-07 — Frontend implementation, slices S0 + S1 (fixture-browser lane)

Chủ: Claude · 2026-10-18 (Asia/Saigon) · Trạng thái: **ASSIGNED, chưa bắt đầu code** (assignment xem §1). Khớp [Rules §7](../../AGENT_WORKING_RULES.md), [PHASE_PACKET_TEMPLATE](../../PHASE_PACKET_TEMPLATE.md), checklist [design/impl/UXM07-RULES-CHECKLIST.md](../../design/impl/UXM07-RULES-CHECKLIST.md).
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
| U4 Shell | `ContextBar` + `CommandBar` (⌘K) như component, gắn trong `PreviewFrame` chỉ khi cờ bật; **chưa đụng `PortalShell`/`Sidebar`** (đợi registry rev 7) | `v2/{ContextBar,CommandBar,roleNav}.tsx`, `v2/css/shell.css` |
| U5 Drawer + thẻ | `.exec-dock` (không trùng `.exec-drawer*`), `cardsTable` ≤660px | `v2/Drawer.tsx`, `v2/cardsTable.tsx` |
| U6 Reader | `v2/boundary.ts` trên `readExactDecimal`/`formatExact`; bất biến: `available ⇔ value`, reason khi thiếu, không `.field === true`, không "—" | `v2/boundary.ts` + test (positive, L3 âm tính, bảng ràng buộc chéo của Codex khi có) |
| U7 Tích hợp | sửa một dòng `ExecutionPreviewRoute.tsx` (`PreviewFrame`); thêm `v2` vào `productBoundary.test.ts`; `v2Hygiene` + test DOM giống hệt khi cờ tắt | primary (một người ghi) |

**S1 (sau S0 xong, thẻ chi tiết sẽ cập nhật trước khi build):** Approvals cockpit (hàng đợi + khung, **nút quyết định luôn tắt "Preview · not recorded"**, chỉ hiện trạng thái receipt từ fixture; ghi quyết định là lệnh thuộc UXM-09), Operations (grain `operation_id`; "Mine", Acknowledge, Resolve tắt kèm lý do; chưa có actor/SLA), Incident drawer (chỉ root), Access, Fleet danh tính (cột không tiền). Chặn theo **capability**, không theo tên vai (Rules 9.3.7). Nối dữ liệu qua HTTP adapter + BFF double (`e2e/bffDouble.ts`) dùng fixture L0 của Codex; không fixture trong product graph. S2–S4 chỉ thiết kế.
**Ngoài phạm vi (tạm hoãn vì vi phạm quy tắc hoặc chờ nguồn):** bật màn trên route sản phẩm và xoá test/baseline/component V1 (migration bước 5–6); sửa shell/nav/registry (chờ Codex rev 7); Dockerfile ARG cho cờ (yêu cầu cho chủ file); recorder baseline gắn cứng Research (cần gọi có phạm vi); mọi đọc thật, lệnh, HK.

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
- **Nợ mở:** hue `attention`; PM pin; bảng ràng buộc chéo (RV-1).

## 5. Rollback
Tắt cờ `VITE_EXECUTION_V2_SCREENS` (mặc định đã tắt) rồi xoá `src/execution/v2/**` và các test mới; token chỉ append trong khối carbon nên gỡ không ảnh hưởng; không đụng backend/registry/contracts.

## 6. Báo cáo cuối lát và tiếp theo
Theo template 7 mục (CLAUDE.md §7.4) + Rules 7.4 bảy mục; cập nhật packet này, Unified §14 và sổ đồng bộ cùng lần giao. Tiếp theo: U1 → U2…U6 song song → U7 → mốc kiểm (full vitest + tsc + baseline pinned).
