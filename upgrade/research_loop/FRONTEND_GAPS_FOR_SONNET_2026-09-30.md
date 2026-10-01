# Research Loop — gap frontend còn lại (cho Sonnet làm) · Claude soạn, 2026-09-30

> Trạng thái (2026-10-01): **đợt F1 đã làm xong — xem §8**. F2–F5 chưa làm. §5 (bớt chữ) vẫn chờ Bobby duyệt. Chưa gồm danh sách sửa UI/UX Bobby sẽ gửi sau (§7).

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

## 6. Kiểm từng ô trên run dài 400 trials (2026-09-30)

**Run:** hai run Delta WFO 400 trials, BTCUSDT 1h, 2026-05-01 → 2026-07-31, OOS đầu 2026-06-01, fold weekly expanding (9 fold): **R-WFO-020** `rrun_3258a4c4…` (claude-preview) và **R-WFO-002** `rrun_d61c000d…` (bobby). Cả hai COMPLETED/READY trong ~50 s. Preview build `8c376879` (cờ `PREVIEW_LONG_WFO`). Hai workspace cho **cùng** kết quả mọi màn (chỉ khác nhãn/digest/giờ). Không bấm gì ghi dữ liệu.

**Bảng từng ô (block | ô | loại | giá trị màn | field/giá trị API | chủ | ghi chú):** [`fe-inventory/B3_cells_s00_s07_400trials.md`](evidence/P21/audit-2026-09-30/fe-inventory/B3_cells_s00_s07_400trials.md) (210 ô) · [`fe-inventory/B4_cells_s08_s14_400trials.md`](evidence/P21/audit-2026-09-30/fe-inventory/B4_cells_s08_s14_400trials.md). Ảnh + JSON API đã chụp nằm trong scratchpad của lần kiểm.

| Màn | OK | WRONG | EMPTY-HONEST | NO-API | SCALE | FE-LOCAL |
|---|---|---|---|---|---|---|
| S00–S07 | 100 | 53 | 30 | 9 | 15 | 3 |
| S08–S14 | 68 | 35 | 24 | 4 (+2 unbound) | 7 | 3 |

### 6.1 Lỗi server chỉ lộ ở 400 trials (chặn nghiệm thu — đã thêm vào hàng đợi Codex, mục B0)

1. **Search read 503 ở 400 trials** (`current-source/search` → `RESEARCH_CURRENT_SOURCE_UNAVAILABLE`, kể cả `?limit=1`; run 3 trials vẫn 200). Hệ quả: S06 trống, θ* S05 trống, tab Search S04 trống, report sidecar gọi search thất bại **và nuốt lỗi** → **không report nào được seal** (S09 404, S11 mục 7 MISSING, link report S10 chết). Nguyên nhân khả dĩ: commit `8c376879` (Claude) nâng trần trial lên 400 nhưng để `probe.objective_rows ≤128`, mảng candidate `≤64` và ngân sách byte của search read (`current-source.contract.ts:803-816`). **Lỗi do Claude gây ra ở thay đổi preview** — sửa: nâng các trần đó dưới cùng cờ, phân trang ledger; report sidecar không được nuốt lỗi.
2. **Child-audit mất bản ghi OOS generation**: QuantBT giữ 2.000 bản ghi child-audit và bỏ 2.212; trên cả 9 fold phần bị bỏ gồm **mọi** bản ghi "out-of-sample generation" → freeze báo `QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD` từng fold; S08 link "child" treo "reading…", bảng audit 64 dòng in-sample giống nhau (~2.950 px) không dòng nào được đánh dấu; S11 mục 6 MISSING → **run 400 trials không bao giờ seal được**. Cần: Portal giữ ưu tiên bản ghi OOS generation khi cắt (hoặc engine tăng giới hạn) — Codex/engine.
3. Một số run 3 trials cũ (R-WFO-010…014) cũng không có report → sidecar nuốt lỗi không chỉ ở 400 trials.

### 6.2 Sai trên màn (FE, theo mức nặng)

- **S09 báo "DENIED — You don't have access"** trên run của chính mình khi thật ra là "chưa có report được seal"; crumb/tiêu đề in `rrun_…`; hộp certification tả một report không tồn tại; bản in Letter trống.
- **Cùng một run, số mâu thuẫn giữa các màn:** trades — S08 "0 trade records, 6 transitions" vs S13/Library "trades 19"; θ* — trial 394 (S03, cursor S04) vs 393 (S07, S11); "Best J₁" 4,948 ở chỗ này, −4,797 chỗ kia; S13 pair gắn "total return (OOS)" cho return cửa sổ chung −0,79% trong khi return của run +1,28%; hai max drawdown (−0,80% / −1,07%) không nhãn scope.
- **"Stitched OOS" chứa 744 bar trước OOS** (phân phối return S04, rolling-20, sparkline S01 2.184 điểm) — OOS thật 1.440 (`oos_observation_count`).
- **S02 `?from=` run 400 trials → nháp 1 trial** (FE điền theo trial được atlas chấp nhận, `NewRunRoute.tsx:342-347`; atlas còn nêu profile cũ `p10.fixed-qualification.v1`, "seed MUST_BE_NULL" cạnh seed 42); ô ngày `datetime-local` trống vì không nhận "Z"; ngày OOS đầu không hiện ở đâu.
- **S06 khi search lỗi nói sai:** in mã P04 `P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED` trên run WFO, "mode/schedule not published", "POOL FREEZE · NONE — NO SEARCH RAN" trong khi tab hub ghi "S2 SEARCH · DONE".
- **S04 tab Claim** lấy danh sách vắng từ hub cũ ("per_fold_metrics — not published") trong khi tab Summary cùng hub vẽ bảng per-fold.
- **S07 "sealed params digest" in candidate id** (`2944fed1…`), digest thật (`aeb7bab2…`) nằm ngay trên màn; what-if in float thô và lộ tên slider giả của HiFi ("entry_z", "atr_mult").
- **S00:** thẻ Alpha version vẫn bắt chọn run dù descriptor nay trả `requires_alpha: true` (Codex B1#3 đã giao); thẻ Compare ngược lại (`requires_run: true` mà không cho chọn run).
- **S05:** vẫn tự vẽ ✓ train∩test dù server nay trả `train_test_disjoint` (Codex B1#9 đã giao).
- **S10/S13:** chip ACTIVE trên mọi attempt (FAILED, CANCELLED, READY) — lấy từ lifecycle version; S13 config-diff so với một run P04 tuỳ ý (R-P04-006) do FE chọn; S10 mặc định chỉ hiện 1 attempt FAILED, R-WFO-020 bị giấu trong 38 "probes".
- **Shell "Runs (1)"** đếm một dòng legacy ETHUSDT; Library có 39/17; dòng legacy đó QUEUED ở Library nhưng `/api/runs` nói COMPLETED.
- Alpha thử `s14-ui-receipt`, `s14-api-receipt` hiện trong bộ chọn alpha của New Run (claude-preview).
- S09 vẫn liệt kê vắng "rolling sharpe" dù D-AN-01 đã bỏ rolling; S13 vẽ Sharpe 0 của fold phẳng như số đo thật; S12 không hiện `trial_ceiling` (4000) đã được trả; S14 hiện "new run with this av_ →" trước khi đăng ký gì.

### 6.3 Quy mô (400 trials)

S04 bảng a11y ẩn 955 dòng (5.179 node DOM) · S08 bảng child-audit ~2.950 px · S13 16 thẻ ladder với "claim ↑ →" giữa claim bằng nhau · S13 biểu đồ per-fold 7/10 đường chồng lên nhau, 3 màu xám gần giống · S13 config diff rộng 1.831 px không nhãn "N of M". Thời gian tải 0,95–4,7 s, không phải nút cổ chai. 660 px: không cuộn ngang toàn trang.

### 6.4 Đối chiếu danh sách cũ

Đã giao phía backend, FE chưa đọc: `requires_alpha` (S00), `train_test_disjoint` (S05); AN-22 OOS Sharpe P04 ở S13 đã có (trừ R-P04-006). CG-FG-S08-01 không cần backend (`params_digest` đã có ở progress). Không tái hiện: D6 (Review 4h vs 1h) trên `?from=`. Xác nhận lại khoảng 40 dòng đã biết (04-H, 04-S, AN-16/17/18, X3, D7, 07-12, FG 12-02, D11, 08-16, 08-06/07, D10, 09-02/03, D8, FG 10-11, CG-FG-S10-02, 13-04, CG-FG-S14-03…).

## 7. Danh sách sửa UI/UX của Bobby

_(Bobby sẽ gửi)_

## 8. Trạng thái

### Đợt F1 — trung thực (2026-10-01) · commit: batch F1 trên `claude/fe-parity` (hash ghi ở báo cáo) · base `4ad9ac59`

Bằng chứng từng mục (trước/sau, tên test, ảnh + SHA-256): `evidence/P21/audit-2026-09-30/f1/{S02,S05_S07_S08,S10_S13,S14_S11,S01_S03,S04_S09,S12}.md`. Gate đã chạy: **vitest toàn bộ frontend 222 file / 4300 pass / 3 skip**; `tsc -b --noEmit` sạch; hook ở commit. **Chưa chạy:** build, visual, lane real-API, axe (theo luật test theo tầng — mốc sau).

| Nhóm | Mục | Kết quả | Ghi chú còn lại |
|---|---|---|---|
| S02 | A2b-PF (null→0 ở preflight) | DONE | live preflight bị từ chối cho actor auto-login → kiểm bằng fixture canonical |
| S02 | S02-01 cert ceiling | DONE | in `cert_cap.reason` của atlas |
| S02 | FG 02-8b ✓ xanh bước chưa vào | DONE | Review không bao giờ có ✓ (verdict là của preflight server) |
| S02 | D6 Review 4h vs select 1h | DONE | chọn hiện giá trị không khai báo ("4h · not declared") thay vì tự snap; tái hiện được trên mọi nháp gắn version chỉ 1h |
| S02 | CG-P02-02/P08-02 create từ chối v2 | DONE | câu tĩnh "Preflight accepts this; create does not admit it yet." — Codex có thể thêm fact để bind |
| S02 | `?from=` run 400 trials → nháp 1 trial; ô ngày trống | DONE | race trong `NewRunRoute.tsx` đã sửa; **cần Codex** B3#14: atlas `submission_constraints` còn nêu profile cũ (count 1, seed MUST_BE_NULL); banner "COPIED FROM" in `rrun_…` vì nhãn không có trong requested-spec |
| S05 | FG 05-15 ✓ train∩test | DONE | bind `guards.train_test_disjoint` (PASS ✓ / FAIL ✕ / vắng có mã) |
| S05 | FG 05-17 gap scan null→0 | DONE | |
| S05 | X5 imported | DONE | chỉ unit (preview không có run imported) |
| S07 | D7 what-if float thô / slider / tên giả / enum | DONE | ΔJ₁ cũng định dạng (nới mốc P16-T06 "exact string" ở mặt hiển thị; exact vẫn ở `title`) |
| S08 | FG 08-05 float thô; D11 `carry_position` + trục giá; FG 08-06/07 FE tự tính | DONE | còn: `usePlayAcrossFolds.ts` status line vẫn in `carry_position` (test pin), caption overview chưa nhóm nghìn |
| S10 | CG-FG-S10-01 digest sai ô | DONE | bind `selected_trial_id`/`selected_params_digest`; nhánh có pick chỉ kiểm bằng fixture (preview không có pick) |
| S10 | CG-FG-S10-02 chip ACTIVE trên FAILED | DONE (quy tắc **tạm**) | chip chỉ là "version ACTIVE/…" hoặc trạng thái attempt; **vẫn chờ Bobby chốt từ vựng** + field server |
| S13 | mũi tên "claim ↑" giữa claim bằng nhau + câu luật | DONE | "same claim →"; câu luật có điều kiện; chờ Bobby duyệt chữ |
| S13 | (audit 400) nhãn scope pair + baseline config-diff tuỳ ý | DONE | còn thẻ trajectory "release candidate" dùng `.at(-1)` ACTIVE do FE chọn |
| S14 | S14-02 lý do ADMIN tự đặt | DONE | bind `may_activate_reason` |
| S14 | S14-03 copy "OL-01" cũ + link trước khi đăng ký | DONE | bind `run_admission` |
| S14 | 14-09 dòng chữ ký | DONE | bind `import_attestation` |
| S14 | 14-21/22 + S14-C1 banner 403/404 | DONE | **câu origin-refusal cần Bobby duyệt**; `DRAFT_NOTE` giữ nguyên (quyết định chữ của Bobby); `IMPORT_META` còn "activation ADMIN-only" cứng |
| S11 | 11-26 mã `P22_${state}` tự chế | DONE | contract không có enum cho Reason (chỉ pattern) → test đối chiếu mã control-api phát ra |
| S01 | FG 01-13 legacy link `/evidence` | DONE | |
| S01 | chip rc im lặng | DONE | `rc — not published` hiện trên cả 39 thẻ (nếu quá ồn: chỉ hiện khi lý do ≠ `P21_NO_PERSISTED_RELEASE_CANDIDATE`) |
| S03 | FG 03-T nhãn transport | DONE | |
| S03 | X7 console/events thiếu `workspace_id` | DONE | nguồn workspace hiện = `?workspace_id=` trên URL (FE chưa có nguồn khác) |
| S03 | 03-M scope IMPORTED_* | DONE | |
| S03 | CG-P10-04 trial rate | DONE | typed absence; còn 3 chuỗi vắng dạng câu (FOLD_SELECTION…) ngoài phạm vi |
| S04 | FG 04-F "not published" lúc đang tải | DONE | `reading…` / `not read` |
| S04 | Net return tile | DONE | |
| S04 | mã lý do FE tự bịa | DONE | |
| S04 | tab Claim mâu thuẫn Summary | DONE | |
| S09 | D8 legend "IS account" | DONE | quyết định nằm trong record |
| S09 | D2 evidence link | DONE | |
| S09 | "DENIED" nhầm khi chưa seal report | **PARTIAL** | FE làm tạm bằng request Run Library thứ hai để phân biệt "chưa seal" với "không thấy"; **cần Codex LW-02** (404 có mã riêng) để bỏ request đó; crumb/tiêu đề đã dùng nhãn R-WFO |
| S12 | CG-FG-S12-01 `historical_identity` | DONE | e2e `atlas-historical.json` đã sửa đúng union; view lịch sử vẫn hiện 3 tab rỗng + footer (HiFi không có trạng thái này — Bobby quyết) |
| S00 | thẻ Alpha version / Compare theo `requires_alpha` / `requires_run` | DONE | |
| S12 | `trial_ceiling` | REPORT | đã hiện ở "release facts" (mặc định gập); không đổi |

**Mục mới phát hiện khi làm F1 (đưa vào F2/F3):** `PICK_TARGET_LABEL` (S01 `RunLibrary.tsx:~1122`) thiếu `alpha_version_legacy` → banner "Pick a run to open alpha_version_legacy" lộ token thô (sau khi bấm thẻ Alpha version ở S00) · `e2e/fixtures.ts` và `e2e/research-qualification/stubs.ts` còn phục vụ `journey-v3` (descriptor đã v4) · caption overview S08 chưa nhóm nghìn.
