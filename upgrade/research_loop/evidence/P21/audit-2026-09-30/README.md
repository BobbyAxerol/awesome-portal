# Rà soát toàn bộ Research Loop — backend, nối FE↔BE, HiFi 00–14, commit rơi (Claude, 2026-09-30)

Bobby hỏi sau phản biện của Codex: backend còn gì chưa làm, frontend còn phase nào phải nối với backend, frontend đã khớp và đủ HiFi chưa — trước khi ra lệnh gom mọi commit về **một nhánh Research Loop**.

Cách làm: 5 hướng rà **chỉ đọc** (không build, không test), trên **hợp** của các nhánh như sau khi gom: nhánh Codex `docs/research-loop-plan` @ **`c2ec1443`** (đi trước origin `d3d99f26` **126 commit**, chưa push), nhánh Claude `w1-build` @ `d7db1cb3` + chưa commit, và các worktree agent G1–G8. Chi tiết từng khối, có file:line:

| File | Nội dung |
|---|---|
| [1_backend.md](1_backend.md) | backend theo phase P01–P24: trạng thái, owner, locator |
| [2_wiring.md](2_wiring.md) | nối FE↔BE theo màn; 37 gói CG-FG phân loại |
| [3a_hifi_s00_s02.md](3a_hifi_s00_s02.md) · [3b_hifi_s03_s04.md](3b_hifi_s03_s04.md) · [3c_hifi_s05_s07.md](3c_hifi_s05_s07.md) · [4_hifi_s08_s14.md](4_hifi_s08_s14.md) | HiFi ↔ code từng khối |
| [5_inventory.md](5_inventory.md) | commit/worktree/stash/nhánh rơi + thứ tự gom |

## 1. Phản biện của Codex — kiểm lại

Codex **đúng**: OL-01 mới chứng minh trên cell cô lập (Production chưa bật); P23 còn T14 và bộ DR/BR/GX; T10 Python xanh; E5-O1/O2 là request tới QuantBT engine; CG-FG-R2-01 đã đóng; P24 thuộc Codex. Hai chỗ Codex còn lệch: dòng board P24 (U:3637) vẫn ghi "unassigned"; "39 packet còn mở" thực là 38. Và cả hai bên **đều chưa nhận** 37 gói CG-FG màn S02–S14 (xem 3).

## 2. Backend còn chưa làm

| Nhóm | Mục | Owner |
|---|---|---|
| **Lỗi thật** | **S14-RW-BR-01** register lại bản ACTIVE → 500 (`repository.ts:1074-1093` + CHECK migration 057), còn ở `c2ec1443` | Claude ≤P21 |
| | S14-RW-BR-02 analyser ghi FAIL nhầm trường | Claude ≤P21 |
| ≤P21 khác | CG-P23-T12-01 nhận audit child đã pin (chỉ profile reuse qua); CG-P21-01/03/05 (fixture pack/Problem, ETag chưa khai trong OpenAPI, pack chờ Bobby); BR-D4-1/3 (biên bar thật, fact profile khoá) | Claude ≤P21 |
| | Rò workspace: progress `console`/`events` không gửi `workspace_id`; `download_href` export không có | Claude ≤P21 |
| | CSRF drift: 4 OpenAPI khai `x-csrf-token`, runtime dùng `x-portal-csrf` (chỉ contract) | Claude ≤P21 |
| 37 gói CG-FG S02–S14 | 3 đóng được (S03-03, S04-03, S12-01), 8 giao một phần, 26 mở (2 có điều kiện); **không gói nào có comment của Codex** | **Bobby chốt owner** |
| P22 | CG-FG-P22-01 (`downstream_code`) | Codex |
| P23 | F3 54/54 real-API; F5 502 + nghiệm thu đủ; T07/T13 (cần engine thứ hai); T10 trên cùng candidate; T14 (exposure + audit child thật); bộ DR/BR/GX; OL-24 (chưa có host research-dev); bảo mật `/api/runs/:id/export` cũ (**chưa ai nhận**) | Codex / ops |
| P24 | chưa bắt đầu, chờ P23 | Codex |
| Ngoài Portal | E5-O1/O2, benchmark, WFO in-sample equity | QuantBT engine |
| Đã xong, sổ còn ghi mở | S14-RW-BR-03 (`4e343fe9`); CG-P21-02; OL-02, OL-03/05/07/09/13, E16-R2, D1-O1 (mục G của tôi lỗi thời); E10-O1 (F4 của Codex đã chứng minh bằng fault injection) | sửa sổ |

## 3. Nối FE↔BE

- **Đường dẫn:** 48 operation research khớp giữa client FE, OpenAPI và controller — **không lệch path/verb nào**.
- **Không màn nào GAP ở mức sản phẩm.** WIRED: S00 (e2e vỡ), S01, S03, S07. PARTIAL: các màn còn lại.
- **Backend đã trả mà FE chưa đọc:** `imported_alpha` (S06, S07 — run import mất `source_digest`/entrypoint), `reproduction` + `REPRODUCTION_OF` (S02), `summary_analytics.net_oos_return` (S04), `market_overview` (S08 chỉ đọc `candle_overview` — nguồn khác nhau, **Bobby chọn một**), P22 pick state + `selected_trial_id` (S11), `historical_identity`/`facts_reason` (S12), `import_attestation` (S14).
- **FE tự suy thay vì đọc server:** ✓ train∩test ở S05 (`SplitDetail.tsx:1873`); `lineageStatus` + digest sai ô ở S10 (`LineageDetail.tsx:1054`); `PreflightPanel` in 0 cho null (S02) — **vi phạm luật không-0-cho-null**.
- **Vỡ sau khi gom:** Codex xoá fixture journey v2, nhưng `e2e/fixtures.ts:262` + 2 probe còn nạp → vỡ fixture lane + visual suite (nguồn 64 lỗi OL-24). Việc của Claude.

## 4. HiFi ↔ code, từng màn

| Màn | Kết luận | Còn lại chính |
|---|---|---|
| S00 | chạy đủ, chữ/kiểu lệch | kicker/tiêu đề không theo HiFi; legend; `h2` ăn font serif (`base.css:14`); khối mapping thiếu link — S |
| S01 | gần khớp | **P2:** run legacy chọn từ `?to=` vẫn trỏ `/evidence`; `alpha_version_legacy` in khoá thô; thẻ running in `pct%`/giây thay `fold 3/5`/`42m` — S |
| S02 | chạy thật đủ; **xa HiFi nhất** | ~11 gap FE: **P2** bước chưa hợp lệ hiện ✓ xanh; stepper xuống 2 hàng; "not reported" ×6 lúc mở; summary nằm ở rail; card forecast thiếu gold/sha; không ghi `?step=`. Preview fold plan trước preflight — **chưa ai quyết** |
| S03 | **thiếu** | passport có (claim/cert/seal/hand-off) nhưng **4 claim phương pháp (03-I) + forecast lúc queued (03-J) chưa có** → E4 ở sổ ghi "ĐÓNG" là **sai, phải mở lại**; nhãn tiêu đề in `rrun_`; `IMPORTED_FIXED_PROFILE` chưa xử lý |
| S04 | đủ như hub, chưa đủ như HiFi | `summary_analytics` (IS equity, rolling Sharpe, 6/8 tile) **chỉ ở nhánh Codex** — phải gom; tab Stage 1–4 là preview + link thay thân HiFi (**chưa có quyết định**); `<main>` lồng |
| S05 | khung đủ | fold id in `0/1`; ngày fold ẩn ở 660; enum thô lane P04; không có dòng purge/embargo |
| S06 | đủ khi gom G8 | chip OOS (F-1, Bobby); số làm tròn không có giá trị đúng khi hover; sub-panel mode 2–5 chưa dựng (tiềm ẩn) |
| S07 | đủ mọi khối có nguồn | banner BLOCKED chưa bật khi integrity BLOCKED/binding DRIFT; engine pin P04 chỉ ở nhánh Codex |
| S08 | khớp trong các lệch đã ghi | **nhánh Claude còn lộ nến tương lai khi reveal nhân quả — nhánh Codex đã sửa, phải lấy bản Codex**; state-at-cursor P04 in float thô; nút G1 rộng 406 px vs 154 (chưa duyệt) |
| S09 | đủ cấu trúc | fold in `0/1`; `OOS_SHARPE` dấu `-` (formatter chung, ảnh hưởng S10/S13); in trên dữ liệu thật chưa chạy |
| S10 | cây đúng nhờ `6a4cb383` | `sid()` bỏ qua registry nhãn → in `rrun_…` (sửa 1 dòng); dòng mờ trượt contrast (Bobby) |
| S11 | **toàn bộ phần P22 chỉ ở nhánh Codex** | mã `P22_${state}` do FE tự đặt; digest không rút gọn; ~8 VD-FG chờ quyết; receipt thật Delta→R1 (OL-05) chưa có |
| S12 | khớp theo quyết định (VD-RF04) | trạng thái 503 không có nút thử lại; fixture historical sai shape |
| S13 | đủ, nhưng ladder **dựng hai lần** | FG-04a (Codex, flex) vs G4 (Claude, grid) — **Bobby chọn**; chữ connector khi claim bằng nhau |
| S14 | E6 duyệt, ghi thật qua | 2 quyết định chữ (S14-C1); banner in mã thô → 403 ≠ 404; `import_attestation` chưa đọc |
| Chung | — | S09–S13 lệch 8 px (x=280 vs 272, thiếu `OWN_FRAME_SCREEN`); không màn nào đặt `<title>`; hộp refusal còn in chữ server (VD-FG-01-01); D-B1 |

Tổng: khoảng **50–60 sửa nhỏ (S) phía FE**, vài mục M (S02, S03 03-I/J, S04 summary_analytics nếu không gom được nguyên), và **~25 quyết định** đang chờ (phần lớn là VD-FG-* do Codex đề xuất, chưa được duyệt).

## 5. Commit rơi — không mất gì, nhưng có việc trùng

- Một repo, 41 worktree chung `/home/bobby/portal/.git`.
- Mọi worktree G hôm nay cắt từ `d3d99f26` nên **không thấy** việc Codex 09-27→09-30. **G3 trùng** việc Codex ship (`08fa8ee0`, `8ad39e83`, `74abadd4`) và đọc nhãn RC sai chỗ → bỏ phần backend/contract; **giữ phần nhãn S05–S08** (Codex chỉ phủ S09/S11/S13). **G4 trùng** FG-04a → chỉ giữ phần G7 (probe, `axeReceipt.ts`, sửa heading Freeze, contrast Split).
- Phải mang về: chưa commit ở w1-build (topbar A, token S14, docs); G1; G2 `ed33db0d` (đụng `NewRun.tsx` với FG-08); G8; G7. `6a4cb383` (G10) đụng FG-08 của Codex ở `NewRun.tsx` — **FG-08 bao trọn** phần refusal, lấy bản Codex, giữ phần S10 của G10.
- Đã có sẵn / bỏ: G5 (= `d7db1cb3`), nhánh E10-O3 (vào qua `46e138c3`, migration đổi 069→076), các worktree cũ 09-26, 18 worktree sạch, `ol-p22-p24`. Bỏ: G14 bản cuộn ngang; `codex/p22-wip-2026-09-24` và stash@{0} (E16-R1 cũ) — **xin Codex đồng ý trước**.
- **Bẫy migration:** Codex đổi 068→075, 069→076; DB preview đã chạy 068/069 → sửa hàng `pgmigrations` trước khi deploy, không thì 075/076 chạy lại (không idempotent).

## 6. Thứ tự gom đề xuất (chờ lệnh Bobby)

1. Codex dừng ghi, push `c2ec1443` lên origin (fast-forward, không force). Đây là đích.
2. Tạo nhánh gom từ `c2ec1443`; mang vào theo thứ tự: S14 `49256a2a` + G5 (sạch) → G10 (lấy FG-08 cho `NewRun.tsx`, giữ S10) → w1-build chưa commit → G1, G8, G2, G7 → phần S05–S08 của G3.
3. Sửa journey v2→v3 trong e2e.
4. Regenerate contracts bằng script repo; **một** lần hook.
5. Push; sửa `pgmigrations` trên preview; **một** lần rebuild preview → Bobby xem.
6. Sau đó mới: lane F3, visual (khi máy rảnh, sau khi Bobby duyệt baseline).

## 7. Bobby quyết

1. **Lệnh gom** + nhờ Codex push `c2ec1443` và dừng ghi trong lúc gom.
2. **Owner 37 gói CG-FG S02–S14** (sửa service ≤P21 → theo phân vai là Claude; ghi owner Codex).
3. Ladder S13: FG-04a hay G4. · P04 overview: `candle_overview` hay `market_overview`.
4. S02 preview fold plan trước preflight: làm hay bỏ. · S04 tab Stage 1–4: preview+link hay thân HiFi.
5. ~20 VD-FG-* của Codex (chữ refusal, SLA, badge…) + VD-FG-01-01 (chữ server trong hộp refusal).
6. Contrast màu HiFi S01/S03/S04/S10; D-B1; chip OOS S06; chữ S14; nút G1 rộng 406 px.
7. Rotate activation code preview (vẫn treo).

E10-O1 **không cần** fault injection nữa (F4 của Codex đã chứng minh); E10-O3 còn thiếu receipt runtime cross-workspace.
