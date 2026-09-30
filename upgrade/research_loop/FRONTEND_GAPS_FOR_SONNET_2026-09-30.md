# Research Loop — gap frontend còn lại (cho Sonnet làm) · Claude soạn, 2026-09-30

> Trạng thái: **CHỜ BOBBY DUYỆT** — chưa làm mục nào trong file này. Chưa gồm danh sách sửa UI/UX Bobby sẽ gửi sau (sẽ thêm thành §7).

## 0. Bạn là ai, làm ở đâu

- Bạn làm **frontend** Research Loop V1.1 (QuantBT Backtest, `/research/quantbt/*`), 15 màn S00–S14. Backend do Codex làm song song theo `upgrade/research_loop/CODEX_BACKEND_GAPS_2026-09-30.md` — **không sửa backend**; thiếu field thì ghi vào §6 "chờ Codex".
- **Worktree:** `/home/bobby/portal-research-fe`, nhánh `claude/fe-parity`. Nhánh chính duy nhất `docs/research-loop-plan` (checkout `/home/bobby/portal-research`, chỉ để hạ cánh + build preview).
- **Hạ cánh:** `git rebase docs/research-loop-plan` → commit **qua hook** (không bao giờ `--no-verify`) → khi checkout chính sạch: `git -C /home/bobby/portal-research merge --ff-only claude/fe-parity`. **Không push** khi Bobby chưa bảo.
- **Ghi file:** `apps/portal/frontend/src/research/**`, `src/app/**`, `src/features/quantbt/**`, `e2e/*research*`, evidence FE. Không ghi `apps/control-api/**`, `apps/portal/backend/**`, migration, OpenAPI.

## 1. Đọc gì, theo thứ tự

1. `CLAUDE.md` (root) — luật cứng §3 (trung thực: **không bao giờ 0 thay null**; states tách bạch loading/empty/partial/stale/denied/unavailable/terminal; không suy diễn backend), báo cáo 7 mục §7.4, markdown trước chat §7.7.
2. `upgrade/research_loop/CLAUDE-FOR-thanhvuong.md` §"Research working rules".
3. **File này.**
4. `upgrade/research_loop/D-AN-01_PORTAL_ANALYTICS_ALL_TIME.md` — analytics all-time (Portal tính), bỏ rolling; S01 thẻ last-30D.
5. HiFi (**authority giao diện**, thắng code): `upgrade/research_loop/release-v1.1/QuantBT NN *.dc.html` (00 Journey Map … 14 Alpha Import). Mở bằng trình duyệt (`file://`); HiFi 09 cần serve HTTP (thiếu `doc-page.js`). Đo padding/font/gap từng khối từ HiFi trước khi dựng — primitive dùng chung hay đè mất.
6. Unified plan `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` §13: board ~L3600–3720; note chi tiết dưới `#rl-pXX`; quyết định §13.4.1 (E/F/G, D1–D10, VD-* đã duyệt). **Addendum sau thắng bản gốc**, không xoá cái cũ (A13.1). Lệch HiFi chỉ hợp lệ khi có VD-* **đã duyệt**; VD-FG-* của Codex phần lớn **chưa duyệt**.
7. Bằng chứng gap (chỉ đọc mục đang làm): `upgrade/research_loop/evidence/P21/audit-2026-09-30/` — `3a/3b/3c/4_hifi_*` (HiFi↔code từng khối), `2_wiring.md`, `6_browser_walk_after_rebuild.md`, `7_VISUAL_PARITY_ROOT_CAUSE.md`, `8_visual_sweep_other_screens.md`, `codex-inventory/A1…A5`.

## 2. Luật làm việc (bắt buộc)

- **HiFi từng khối**: mỗi màn đóng khi **chụp HiFi và live cạnh nhau, từng khối** — không đóng khi còn "chữ thay hình" mà dữ liệu có (bài học 2026-09-30: tab hub in "not published" trong khi màn deep-dive vẽ được chính dữ liệu đó).
- **Tái dùng, không viết lại**: màn nào đã có component vẽ dữ liệu thì nhúng (`embedded`), đừng dựng bản thứ hai.
- **Trung thực**: vắng dữ liệu → typed absence **ngắn** + mã lý do của server; không 0/—/N/A thay số; không tự tính số ở FE (D-AN-01: backend tính).
- **Ít chữ hard-code (Bobby 2026-09-30)**: màn có biểu đồ/số liệu chỉ giữ tiêu đề, nhãn trục/legend, đơn vị, scope/cửa sổ, lý do vắng ngắn. Câu giải thích dài dưới biểu đồ, footer "rules of this screen", câu "the UI computes nothing…" → bỏ / rút ≤8 chữ / chuyển tooltip — theo §5.
- **UI copy tiếng Anh**; số font mono.
- **Test theo tầng**: lúc làm — vitest file mình sửa + `npx tsc -b --noEmit` + xem trên Vite dev proxy tới preview; **mốc** (trước hạ cánh) — toàn bộ vitest frontend (hook không chạy nó); lane real-API + visual chỉ khi Bobby yêu cầu/mốc lớn, chạy khi máy rảnh. Không `--update-snapshots` khi chưa được duyệt.
- **Preview**: `https://research-portal.primusspark.com` (tự đăng nhập). Vite dev: config cục bộ (không commit) proxy `/api` → `http://127.0.0.1:8095`; mở `http://localhost:<port>`. Dừng server bằng PID, không `pkill -f`.
- **Không push, không đụng dev/main, không in env/credential.**

## 3. Báo cáo sau mỗi gói (template 7 mục, CLAUDE.md §7.4)

1 Đang ở đâu (gói/mục) · 2 File đã sửa (từng đường dẫn) · 3 Số dòng (`git diff --numstat` thật) · 4 Align với Codex (field/contract nào, chờ id nào) · 5 Evidence (lệnh + kết quả thật; chưa chạy thì ghi chưa chạy) · 6 Tiếp theo · 7 Điều kiện đóng. Đánh giá/audit ghi vào markdown **trước** khi trả lời chat. Mỗi mục xong: đánh dấu trong §8 file này (id, commit, test, ảnh HiFi/live SHA-256 16 hex).

## 4. Gap frontend — danh sách đầy đủ đã kiểm trên code (`6ac69315`)

**Bảng chi tiết (189 dòng, mỗi dòng có HiFi locator, code file:line, nghiệm thu, cỡ, phụ thuộc):** [`evidence/P21/audit-2026-09-30/fe-inventory/B1_fe_gaps_verified.md`](evidence/P21/audit-2026-09-30/fe-inventory/B1_fe_gaps_verified.md). Ký hiệu trạng thái: `OPEN ✓` đọc lại hôm nay vẫn sai · `OPEN =` file chưa đổi từ lần audit · `OPEN ?` chỉ trình duyệt xác nhận được. §0 của bảng liệt kê những gì đã sửa hôm nay (đừng làm lại).

| Nhóm | Số dòng | Ghi chú |
|---|---|---|
| HONESTY (sai sự thật trên màn) | 48 | 33 nặng ở §1 bảng + 15 lộ token thô |
| HIFI parity | 62 | |
| FE↔BE bind | 39 | ~15 **không cần Codex** (field đã có, FE chưa đọc) |
| DECISION (Bobby) | 20 dòng / ~45 VD id | |
| LANE / test | 13 | |
| A11Y | 7 | |

Theo màn: S00 6 · S01 9 · S02 23 · S03 9 · S04 27 · S05 12 · S06 10 · S07 8 · S08 12 · S09 9 · S10 10 · S11 8 · S12 7 · S13 9 · S14 10 · chung 9 · lane 11.

### 4.1 Thứ tự làm

1. **Đợt F1 — trung thực (bảng §1), làm trước hết:** S02 `PreflightPanel.tsx:399-401` in 0 cho null · S05 ✓ "train ∩ test = ∅" tự vẽ (`SplitDetail.tsx:1890`) + gap scan null→0 (`:1177`) · S10 digest duyệt in vào ô param-set (`LineageDetail.tsx:1086`) + ACTIVE trên attempt FAILED (`:200`, chờ Bobby chốt từ vựng) · S14 lý do ADMIN tự đặt (`AlphaImport.tsx:753`), chữ "Not admitted yet (OL-01)" cũ, dòng chữ ký hard-code dù `import_attestation` đã được trả · S11 mã `P22_${state}` tự chế (`ReleaseCandidateDetail.tsx:1977`) · S02 "cert ceiling not published" hard-code, ✓ xanh ở bước chưa vào, Review 4h vs select 1h · S04 "Net return" gắn cho account return (`net_oos_return` không được đọc), "not published" lúc hub còn đang tải · S12 bỏ qua `historical_identity` (release lịch sử ra thân rỗng) · S08 float thô ở cursor + `carry_position` làm headline · S07 what-if in `-1.4435308120735202` · S03 console/events thiếu `workspace_id` · S13 mũi tên "claim ↑" giữa hai claim bằng nhau · S09 legend "IS account" mâu thuẫn danh sách vắng.
2. **Đợt F2 — bind field đã có (không chờ Codex):** ~15 dòng nhóm FE↔BE đánh dấu "served" trong bảng.
3. **Đợt F3 — HiFi parity theo màn** S00→S14 + chung: `<title>` mọi màn · khung x=280 vs 272 (`QuantBTModule.tsx:247`, S09–S13/S00/S02) · dấu `−` cho số âm (`researchFormat.ts:31,40`) · nền sidebar (xác nhận bằng trình duyệt cuộn).
4. **Đợt F4 — D-AN-01 phía FE** (sau khi Codex giao BR-AN-01 v2): S04 "Strategy vs benchmark — all time" thay EChart 3, bỏ EChart 5 (rolling-20, **làm ngay được**), 5 ô hero, khối Behavior all-time, vắng có mã cho seal cũ; S09 cùng bộ số; S01 thẻ last-30D.
5. **Đợt F5 — lane/test:** lane real-API 50/54 (2 ô stub P22 dựng lại theo FG-05 — FE; 2 ô chờ CG-S00-AV-01 — Codex) · fixture e2e `atlas-historical.json` sai union · chạy lại visual/axe/in S09 dữ liệu thật trên cây gộp · sổ §13.4.1: E4/E15 ghi đóng nhưng S03 chưa có code, E1 ghi đã làm tròn bảng a11y S04 nhưng chưa.

Cỡ: gần hết là S; M: S03 methodology claims, S04 D-AN-01, S02 bảng review vào panel chính, S12 dải "what it reads", tab hub gọn (nếu Bobby muốn); L tiềm ẩn: S06 panel mode 2–5 (chỉ khi có run như vậy).

## 5. Giảm chữ hard-code (đề xuất, **chờ Bobby duyệt**)

Bảng đầy đủ (156 chuỗi, file:line, chữ gốc, câu HiFi tương ứng, đề xuất REMOVE / SHORTEN / TOOLTIP / KEEP): [`fe-inventory/B2_text_trim_proposal.md`](evidence/P21/audit-2026-09-30/fe-inventory/B2_text_trim_proposal.md). Ảnh 16 màn ở 1440 kèm theo trong scratchpad của lần kiểm.

**Tổng:** chữ hard-code người đọc thấy (chuỗi ≥ 8 chữ, không tính chữ do server trả) **~5.516 → ~1.210 chữ (−78%)**. Theo màn: S06 611→167 · S13 508→56 · S07 450→94 · S08 441→147 · S04 397→46 · S05 300→56 · S09 290→58 · S03 149→16 · S12 139→16 · S01 115→18. Tab hub S04 dùng chung component với S05–S08 nên sửa một lần là được cả hai chỗ.

**Đề xuất chính:**
1. **Bỏ mọi footer "rules of this screen"** (8 màn + S09): `FreezeDetail.tsx:90`, `CompareDetail.tsx:207`, `RunLibrary.tsx:74` (luật ComparisonContractKey chuyển vào tooltip nút Compare đang disable), `SplitDetail.tsx:99`, `EngineAtlas.tsx:1028`, `ExecuteDetail.tsx:78`, `RunProgress.tsx:82`, `SearchDetail.tsx:100`, `ReportDetail.tsx:117`.
2. **S13:** câu "Walk-forward OOS calibrated across the folds after the fact — not a causal claim." lặp trên **mỗi** thẻ ladder (15 thẻ × 14 chữ) → chuyển vào tooltip chip claim family (`CompareDetail.tsx:106`); bỏ callout luật (`:160`) vì header ladder đã nói.
3. **S04:** footer per-fold verdict 94 chữ → "fold_01, fold_02 drag · rule v1 ⓘ", ngưỡng vào tooltip (`EvidenceFlow.tsx:2524`); bỏ các câu "the UI computes nothing / bins nothing / never infers" dưới biểu đồ (`:1934`, `:3200`, `:3406`, `:3450`), "Drawdown is a restatement…" (`:2652`), footer sampling (`:105`); ghi chú claim strip rút còn "issued by quantbt-engine 1.1.1" (`:557`).
4. **S06:** rút caption biểu đồ (`SearchSurface.tsx:529`, `:137`; `SearchDetail.tsx:1141`; `SearchStageB.tsx:209`); bỏ đoạn giải thích Stage A/B (`SearchDetail.tsx:1615`) vì tiêu đề cột đã nói.
5. **Mọi màn:** bỏ subtitle dưới header (17–36 chữ) và "— đuôi giải thích" của tiêu đề khối (vd "per-fold verdict — which fold carries the run…", "trade anatomy — close-target schema…", "config diff — the only keys that changed…").
6. **S05/S07/S08:** rút `retainedLane.ts:141`, `ExecuteCandleReplay.tsx:53` còn một dòng; `FreezeDetail.tsx:829` → "match = manifest, row counts, batch receipt only".

**Giữ (rút ngắn):** mọi typed absence dạng "<thứ gì> — not published" + chip mã lý do; nhãn scope, đơn vị, legend, trục.

**Lưu ý trước khi làm:**
- Phần lớn chữ bỏ đi là **nguyên văn HiFi** → Bobby duyệt hướng này thì ghi thành **một** quyết định lệch HiFi (vd `VD-TEXT-01`), không cần từng dòng.
- Test đơn vị đang ghim nguyên văn các hằng này (runLibrary.rf06, splitDetail, searchDetail, freezeDetail, executeReplay, compareDetail) và `e2e/research-foundation/atlas.json` → sửa test cùng lúc; baseline visual sẽ đổi → trình Bobby, không tự `--update`.
- Lỗi kèm theo: `WhatIfCard.tsx:367` viết thường enum → "over the global study is folds" (đọc như động từ "is"). Chữ server dài (S09 58 chữ "Net return and drawdown are the retained final-account path…") → xin Codex bản ≤12 chữ. Help ẩn `usePlayAcrossFolds.ts:48` (68 chữ) quá dài kể cả cho tooltip.

## 6. Kiểm từng ô trên run dài 400 trials (R-WFO-long)

_(chờ run 400 trials trên preview — bobby + claude-preview)_

## 7. Danh sách sửa UI/UX của Bobby

_(Bobby sẽ gửi)_

## 8. Trạng thái

| Id | Commit | Test | Ảnh HiFi / live | Ghi chú |
|---|---|---|---|---|
| | | | | |
