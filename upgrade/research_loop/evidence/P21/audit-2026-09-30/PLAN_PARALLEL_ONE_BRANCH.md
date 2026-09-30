# Một nhánh, hai làn song song — Claude (FE) · Codex (BE) (2026-09-30)

## 0. Hiện trạng nhánh

- **Nhánh chính duy nhất:** `docs/research-loop-plan` @ **`f7c76bae`** (đã fast-forward từ `c2ec1443`, không rebase, không force). Chưa push `origin` / `primus-origin` — chờ Bobby.
- Nhánh gom `integrate/research-loop-2026-09-30` đã xoá (trùng commit với nhánh chính). Sao lưu vẫn giữ: `backup/rl-0930/{codex,claude,g2}`, `~/.local/share/rl-0930-patches/`.
- Preview research-portal chạy đúng `f7c76bae`.

## 1. Cách làm song song trên một nhánh

Git không cho hai worktree cùng checkout một nhánh, nên:

| Worktree | Nhánh | Ai | Làm gì |
|---|---|---|---|
| `/home/bobby/portal-research` | `docs/research-loop-plan` | **nhánh chính** — Codex đang giữ checkout này | nơi "hạ cánh"; build preview |
| `/home/bobby/portal-research-fe` | `claude/fe-parity` | Claude | frontend: UI/UX theo HiFi, nối FE↔BE |
| (Codex tự tạo) `/home/bobby/portal-research-be` | `codex/be-gaps` | Codex | backend ≤P21 được giao + P23/P24 |

**Luật hạ cánh (land) — mỗi lần một bên:**
1. Trên nhánh làn: `git rebase docs/research-loop-plan` (làn ngắn, rebase được; không bao giờ rebase nhánh chính).
2. Commit qua hook trên nhánh làn.
3. Hạ cánh bằng **fast-forward only**, trong checkout của nhánh chính khi nó sạch: `git -C /home/bobby/portal-research merge --ff-only <nhánh-làn>`. Không ff được thì quay lại bước 1.
4. Báo bên kia commit mới; bên kia rebase làn của mình trước khi làm tiếp.
5. Nhịp: 1–2 lần/ngày hoặc khi xong một gói; không giữ làn quá lâu.

**Tránh đụng nhau:** Claude ghi `apps/portal/frontend/src/research/**`, `src/app/**`, `e2e/*research*`, evidence FE. Codex ghi `apps/control-api/src/research/**`, migration **078+**, OpenAPI research. Dùng chung (báo trước): `packages/contracts` (Codex publish → Claude regenerate), fixtures canonical, `contracts-snapshot.json`, `UNIFIED_IMPLEMENTATION_PLAN.md` (mỗi bên chỉ sửa dòng/section của mình). File nóng FE (`EvidenceFlow.tsx`, `NewRun.tsx`, `TopBar.tsx`) chỉ Claude sửa.

## 2. Frontend (Claude) — chờ Bobby review UI hiện tại rồi chốt hướng

Đã biết, xếp sẵn: nền sidebar hở dưới ~1100px · S02 timeline cửa sổ thành dải · S11 digest tràn, S13 bảng diff bị cắt · S06 dòng vắng có nhãn cho search cinema (D6) · S04 15 ô → gộp ô vắng · S12 dải "what it reads" + công thức đặt kiểu toán · các lỗi F1 trung thực (S02 null→0, ✓ xanh sai, S01 legacy /evidence, S05 ✓ tự vẽ, S14 mã thô 403≠404, S11 mã `P22_${state}` tự đặt…) · đọc field BE đã trả (imported_alpha, reproduction, net_oos_return, historical_identity, import_attestation, P22 pick) · lane 50/54 → 54/54 (stub P22 theo FG-05). Bobby quyết: ladder S13, chip S10.

## 3. Backend (Codex) — gap còn thiếu, thứ tự đề xuất

Nguồn: `P21/audit-2026-09-30/1_backend.md`, `2_wiring.md`.

**Đợt B1 — chặn nghiệm thu FE (làm trước, nhỏ):**
| Id | Việc | Locator |
|---|---|---|
| S14-RW-BR-01 | register lại bản ACTIVE → 500 (CHECK supersedes) | `repository.ts:1074-1093`, migration 057 |
| S14-RW-BR-02 | analyser ghi FAIL nhầm trường mirror | P10 S14 receipt |
| WS-LEAK-01 | progress `console`/`events` + export `download_href` không mang `workspace_id` | progress/report export |
| CSRF-DOC-01 | 4 OpenAPI (alpha-import, run-create, preflight, progress) khai `x-csrf-token`; runtime `x-portal-csrf` | packages/contracts |
| CG-S00-AV-01 | descriptor thẻ `alpha-version`: `requires_alpha` (hoặc route) — lane S00 đỏ vì FE phải bắt chọn run | journey descriptor v3 |
| CMP-V3-01 | compare đọc OOS Sharpe P04 từ metric v3 (Run Library có 0.744, compare báo vắng) | compare service |

**Đợt B2 — fact nguồn cho màn (26 gói CG-FG còn mở; owner cần Bobby chốt, đề xuất Codex):** thứ tự S03 (manifest 7 dòng, planned folds, journal, trial rate) → S04 (claim P04 hub, cert caps, window counts, coverage, WFO aggregate) → S05 (verdict train∩test) → S02 (cert_cap reason, bar counts) → còn lại. 3 gói đóng được ngay (S03-03, S04-03, S12-01); 8 gói giao một phần.

**Đợt B3 — ≤P21 khác:** CG-P23-T12-01 (nhận audit child đã pin) · CG-P21-01/03/05 (fixture pack/Problem, ETag trong OpenAPI, pack) · BR-D4-1/3 (biên bar thật, fact profile khoá) · E10-O3 receipt runtime cross-workspace · sổ: CG-P21 owner → Claude, 02 đóng; S14-RW-BR-03 đóng (`4e343fe9`).

**Đợt B4 — P23/P24 (Codex):** F3 54/54 real-API · F5 502 + nghiệm thu đủ · T14 (exposure + audit child thật) · T10 trên cùng candidate · bộ DR/BR/GX · bảo mật `/api/runs/:id/export` cũ (**chưa ai nhận**) · CG-FG-P22-01 · P24 sau P23. Chờ ngoài: T07/T13 (engine thứ hai), OL-24 (host research-dev), E5-O1/O2 + benchmark (QuantBT engine).

**Mỗi gói backend xong:** Codex publish contract → báo Claude → Claude regenerate + nối FE trong làn FE, hạ cánh sau.

## 4. Bobby quyết

1. Duyệt cách làm song song mục 1 (Codex chuyển sang worktree `codex/be-gaps`, nhánh chính chỉ để hạ cánh).
2. Owner 26 gói CG-FG (đề xuất Codex, theo thứ tự B2).
3. Sau khi xem UI: hướng sửa FE (mục 2), ladder S13, chip S10.
4. Khi nào push `docs/research-loop-plan` lên hai origin.
