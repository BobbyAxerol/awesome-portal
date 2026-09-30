# Kế hoạch: gom code về một nhánh → test → rebuild research-portal (bật đủ cờ) → làm song song FE (Claude) / BE (Codex)

Claude, 2026-09-30. Dựa trên [README.md](README.md) (rà soát 5 hướng) và phản biện của Codex. **Chưa push lên origin/primus-origin**; rebuild chỉ trỏ `research-portal.primusspark.com` (stack preview cô lập `portal-research-preview`), không đụng dev/main, không cần CI/CD.

## 0. Hiện trạng: commit hai bên đang ở đâu

| | Nhánh / chỗ | Head | So với origin `d3d99f26` |
|---|---|---|---|
| Nền chung | `origin/docs/research-loop-plan` | `d3d99f26` | — (điểm chung duy nhất của hai bên) |
| Codex | `docs/research-loop-plan` (local) ở `/home/bobby/portal-research`, sạch, đang tạm dừng | `c2ec1443` | +126 commit (115 dưới tên BobbyAxerol từ agent, 11 của Vuong — gồm ~9 slice FE "FG"), chưa push |
| Claude | detached ở `/home/bobby/portal-research-w1-build` | `d7db1cb3` | +3 commit: S14 `49256a2a`, G10 `6a4cb383`, G5 `d7db1cb3` + chưa commit (topbar A, token S14, docs, rà soát) |
| Claude — agent | G2 `ed33db0d` (nhánh riêng, đã qua hook); G1, G3, G4/G7, G8 **chưa commit** trong worktree agent | — | cắt từ `d3d99f26` |

**Hai bên chưa hề cùng nằm trên một nhánh**: chỉ chung `d3d99f26`, rồi tách. Nhánh Codex *đã chứa* `codex/research-ol-p22-p24` và nhánh E10-O3 cũ của Claude (vào qua merge `46e138c3`, migration đổi 069→076).

## 1. Cách gom an toàn

**Nguyên tắc:** nhánh Codex (126 commit) là đích; phần của Claude *xếp lên trên*. Không rebase lại lịch sử của Codex, không force, không sửa checkout của Codex.

**Bước 1 — lưới an toàn (không đổi gì):**
- Tạo ref sao lưu: `backup/rl-0930/codex` = `c2ec1443`, `backup/rl-0930/claude` = `d7db1cb3`, `backup/rl-0930/g2` = `ed33db0d`.
- Diff chưa commit của từng worktree agent đã được lưu dạng patch (`scratchpad/audit0930/t_*.patch`); lưu thêm một bản vào `~/.local/share/rl-0930-patches/` (ngoài /tmp). Không xoá worktree, nhánh hay stash nào trong đợt này.

**Bước 2 — worktree gom mới** `/home/bobby/portal-research-integrate`, nhánh `integrate/research-loop-2026-09-30`, từ `c2ec1443`. Codex không ghi vào đây.

**Bước 3 — mang phần Claude vào, theo thứ tự, mỗi gói một commit:**

| # | Gói | Cách | Conflict dự kiến → xử lý |
|---|---|---|---|
| 1 | S14 `49256a2a`, G5 `d7db1cb3` | cherry-pick (đã qua hook) | sạch; kiểm G5 lại với probe in S09 `e4b9447e` của Codex |
| 2 | G10 `6a4cb383` | cherry-pick | `NewRun.tsx`: **lấy FG-08 của Codex** (bao trọn phần refusal); giữ phần S10 (thứ tự cây), receipt, ledger |
| 3 | G2 `ed33db0d` | cherry-pick | `NewRun.tsx` với FG-05/FG-08: gộp tay (prefill giữ nguyên, refusal theo FG-08) |
| 4 | w1-build chưa commit: topbar A, token S14, docs + thư mục rà soát | áp patch → commit qua hook | `AlphaImport.tsx` 1 hunk comment; ledger status |
| 5 | G1 (S08 play across folds), G8 (S06 dải glyph) | áp patch → commit qua hook | sạch |
| 6 | G7 (chỉ phần probe/axe, heading Freeze, contrast Split) | áp patch có chọn lọc → commit qua hook | bỏ phần ladder `CompareDetail` (đã có FG-04a) — **trừ khi Bobby chọn G4** |
| 7 | G3 — chỉ phần nhãn S05–S08 (`useRunLabelRead`, `RUN_LABEL_READ_SEGMENTS`, crumb) | áp patch có chọn lọc → commit qua hook | **bỏ** toàn bộ backend/contract/fixture của G3 (Codex đã có `display_label`, đặt đúng chỗ) |
| 8 | Sửa e2e: `journey-v2` → v3 ở `e2e/fixtures.ts:262` + 2 probe | code mới | — |
| 9 | Regenerate contracts bằng script repo; re-pin N29 rồi EDS-12 nếu digest đổi | lệnh repo | không sửa tay `.d.ts` |

> **Cần Bobby cho phép**: bước 4–7 là "áp diff của agent vào cây rồi commit **qua hook**". Lần trước `cherry-pick -n` bị bộ phân loại quyền chặn là "CI bypass". Hook vẫn chạy trên mọi commit — không bỏ bước kiểm nào. Để đỡ tốn tài nguyên: gói 4–9 gom thành **3 commit** (FE fixes · e2e/probe · docs) = 3 lần hook (~12 phút mỗi lần, chạy nối tiếp, nền).

**Bước 4 — Codex tiếp tục** trên chính nhánh `integrate/…` (hoặc fast-forward `docs/research-loop-plan` lên đó) sau khi Claude báo gom xong. Từ đây **một nhánh chung**, mỗi bên làm trên worktree riêng cắt từ nó, đưa về bằng merge/rebase nhỏ theo nhịp (mục 4).

## 2. Test — đây là mốc, nên chạy đủ (một lần)

| Tầng | Gì | Ghi chú |
|---|---|---|
| Tĩnh | `tsc` FE + control-api build; `snapshot.py --check`; contracts-test (Docker); N29/EDS-12 | |
| Unit | **toàn bộ vitest frontend** (hook không chạy — đó là cách `tokens.test.ts` đỏ lọt qua); control-api research spec với PG tạm | chạy khi máy rảnh để tránh timeout ảo |
| Hook | `verify-workspace.sh` trên 3 commit | chờ bằng `/proc`, không `kill -0` |
| Sau rebuild | lane real-API P23 (F3) trên preview; đi tay 15 màn ở 1440 + 660, **xem ảnh**; axe 15 màn (probe G7) | |
| Visual | pinned image, **khi host rảnh**, chỉ đối chiếu | lệch đã biết (topbar A, badge SOON) → trình Bobby, không tự `--update` |

## 3. Rebuild research-portal — bật đủ cờ, không giấu gì

Code đọc **19 cờ `CONTROL_API_FEATURE_RESEARCH_*` + 6 cờ `PORTAL_FEATURE_RESEARCH_*`**. Preview hiện bật 15 + 4. **Đang tắt:**

| Cờ | Điều kiện kèm (từ `config.ts`) |
|---|---|
| `CONTROL_API_FEATURE_RESEARCH_IMPORTED_EXECUTION` + `PORTAL_…_IMPORTED_EXECUTION` | RUN_PRODUCER, PROGRESS, RETAINED_ARTIFACTS, EVIDENCE + **`INTERNAL_PRINCIPAL_SECRET`** (preview chưa có → sinh ngẫu nhiên, không in ra) |
| `CONTROL_API_FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY` | FREEZE, RETAINED_ARTIFACTS + `INTERNAL_PRINCIPAL_SECRET` |
| `CONTROL_API_FEATURE_RESEARCH_WHATIF` + `PORTAL_…_WHATIF` | WFO_PROFILE, FREEZE |
| `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION` | RELEASE_CANDIDATES |

Cờ Execution (`FEATURE_EXECUTION_*`) giữ tắt — không thuộc Research Loop.

**Trình tự:**
1. `pg_dump` DB preview (sao lưu).
2. Sửa `pgmigrations`: đổi tên hàng 068→075, 069→076 (không chạy lại — 075/076 không idempotent); rồi cho 070–074, 077 chạy theo thứ tự.
3. Cập nhật **template** `scripts/research-preview/preview.sh` để bật đủ 25 cờ + sinh `INTERNAL_PRINCIPAL_SECRET` (lần build sau không thiếu); cập nhật `preview.env` hiện tại (chỉ ghi khoá, không in giá trị).
4. **Rotate activation code** bobby + claude-preview trong cùng đợt (mã cũ đã lộ trong transcript agent S14).
5. `preview.sh build` từ nhánh gom → `up` → so image ID đang chạy với tag; so tên bundle trên host công khai.
6. Seed nếu cần: một run imported (OL-01) và một publication P22 để màn S11/S14 có dữ liệu thật.
7. Bobby xem trên `research-portal.primusspark.com` rồi quyết tiếp.

## 4. Làm song song sau khi gom

**Làn theo file — để ít conflict:**

| Làn | Claude | Codex |
|---|---|---|
| Sở hữu ghi | `apps/portal/frontend/src/research/**`, `src/app/**`, `e2e/*research*`, evidence FE | `apps/control-api/src/research/**`, migration **078+**, OpenAPI research |
| Dùng chung, phải báo trước | `packages/contracts` (Codex publish → Claude regenerate), fixtures canonical, `contracts-snapshot.json` | như trái |
| Unified §13 | chỉ ghi receipt/section của mình; không sửa dòng board Codex vừa sửa | board, P22–P24 |
| Nhịp | mỗi bên worktree riêng cắt từ nhánh chung; đưa về 1–2 lần/ngày, bên đưa sau rebase lên bên đưa trước; file nóng (`NewRun.tsx`, `TopBar.tsx`) báo trước khi đụng | |

**Claude — frontend, ưu tiên theo thứ tự:**

| Đợt | Nội dung | Cỡ |
|---|---|---|
| F1 · lỗi trung thực + P2 | S02 `PreflightPanel` in 0 cho null; S02 ✓ xanh ở bước chưa hợp lệ; S01 run legacy trỏ `/evidence`; S05 ✓ tự vẽ → typed absence; S10 `sid()` bỏ registry nhãn + digest sai ô; S08 float thô ở state-at-cursor; S14 mã thô (403≠404); S11 mã `P22_${state}` tự đặt; S03 `IMPORTED_FIXED_PROFILE`; fold id `0/1` (S05/S09); `OOS_SHARPE` dấu `−`; `<title>` mọi màn; S09–S13 lệch 8 px (`OWN_FRAME_SCREEN`) | ~15 × S |
| F2 · đọc field backend đã trả | `imported_alpha` (S06/S07); `reproduction` + `REPRODUCTION_OF` (S02/S10); `summary_analytics.net_oos_return` (S04); `historical_identity`/`facts_reason` (S12); `import_attestation` (S14); P22 pick state + `selected_trial_id` (S11); per-fold digest (S08-01); `cert_cap.reason` (S02-01); `market_overview` (sau khi Bobby chọn) | ~10 × S–M |
| F3 · đủ HiFi | S03 bốn claim phương pháp + forecast lúc queued (03-I/J — **mở lại E4**); S02 ~11 gap; S00 chữ/kiểu; S04 tab Stage 1–4 (theo quyết định); S07 banner BLOCKED; S06 giá trị đúng khi hover; S12 nút thử lại; S13/S14 theo quyết định | M |
| F4 · nghiệm thu | ô lane F3 cho D7/D4/G8/nhãn; baseline visual (Bobby duyệt); receipt từng màn trên preview | — |

**Backend Claude cần — viết request, Bobby giao ai làm:**

| Id | Cần gì | Chặn FE nào | Đề xuất người làm |
|---|---|---|---|
| S14-RW-BR-01 | register lại bản ACTIVE → 500 | S14 nghiệm thu | Codex (gấp, nhỏ) hoặc Claude |
| S14-RW-BR-02 | analyser ghi FAIL nhầm trường | S14 | như trên |
| WS-LEAK-01 | progress `console`/`events` + export `download_href` thiếu `workspace_id` | S03, S09 | Codex |
| CSRF-DOC-01 | 4 OpenAPI khai `x-csrf-token` thay `x-portal-csrf` | contract test | Codex |
| CG-P23-T12-01 | nhận audit child đã pin | T12/T14 | Codex (đang làm P23) |
| CG-P21-01/03/05 | fixture pack/Problem; khai ETag trong OpenAPI; pack (Bobby) | S11 | Claude hoặc Codex |
| BR-D4-1/3 | biên bar thật + fact profile khoá | S02 prefill chính xác | Codex |
| 26 gói CG-FG còn mở (S02…S14) | fact nguồn cho từng màn | typed absence ở FE | **Bobby chốt owner**; đề xuất Codex làm theo thứ tự S03 → S04 → S05 → S02 (mở khoá F3 của FE) |
| E10-O3 | receipt runtime cross-workspace | — | Codex |

**Codex — song song, ít đụng FE:** trước hết các mục chặn nghiệm thu FE (S14-RW-BR-01/02, WS-LEAK-01, CSRF-DOC-01) → CG-FG S03/S04 → phần P23 còn lại (F5 502, T14, T10 cùng candidate, DR/BR/GX, bảo mật export cũ — hiện chưa ai nhận) → CG-FG-P22-01 → P24. T07/T13 chờ engine thứ hai; OL-24 chờ ops.

**Sổ cần sửa khi gom** (mỗi bên sửa phần của mình): mục G §13.4.1 (Claude — G3/G11/G10/(c) lỗi thời; mở lại E4); CG-P21 owner → Claude, 02 đóng; S14-RW-BR-03 đóng; board P24 → Codex; bảng request P22/P23 (Codex).

## 5. Bobby quyết trước khi bắt đầu

1. **Cho phép** áp diff agent vào cây gom rồi commit qua hook (mục 1, bước 3).
2. Owner 26 gói CG-FG còn mở.
3. Ladder S13: FG-04a (Codex) hay G4 (Claude). · P04 overview: `candle_overview` hay `market_overview`.
4. Bật cả 4 cờ đang tắt trên preview (khuyến nghị: có — preview cô lập).

Các quyết định HiFi (VD-FG-*, contrast, chữ S14…) không chặn việc gom; để sau khi Bobby xem bản rebuild.
