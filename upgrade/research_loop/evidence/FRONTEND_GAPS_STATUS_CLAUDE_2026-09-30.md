# Frontend Research Loop — plan tiến triển đến đâu, gap còn lại (Claude, 2026-09-30)

Bobby (2026-09-30): "đọc lại toàn Unified plan đã tiến triển đến đâu và báo cáo frontend còn những gap nào
… nạp context lại lẫn đọc lại rules". Theo rule §7.7 kết quả nằm ở file này **trước** khi trả lời chat.
Nguồn sự thật vẫn là [Unified §13.4.1](../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-open-ledger); file này ghi
**cách kiểm, những chỗ sổ ghi sai, và lý do** — bảng việc còn lại nằm ở §13.4.1 mục G.

## 0. Cách kiểm, và những gì chưa kiểm

| Kiểm | Kết quả |
|---|---|
| Nhánh | local = `origin` = `primus-origin` = `a00df203`. **Không có commit mới** kể từ 2026-09-27; Codex chưa đẩy gì thêm (nhánh `codex/p22-wip-2026-09-24` vẫn là bản 24/9) |
| Rule §7.9 (đọc lại phase đã làm) | Có 15 packet/handoff và 17 contract sinh lại trong 7 ngày, nhưng tất cả đổi trong 23–27/9 và trùng các gói W/X/E/P22 đã tích hợp. **Không có commit nào sau 27/9**, nên không có amendment nào mới kể từ lần đọc trước — tôi kết luận từ đó, không đọc lại từng file |
| Gate trên HEAD `a00df203` | `tsc -b --noEmit` **exit 0**; vitest `src/research`+`src/features/quantbt`+`src/app` **52 file · 1512 pass · 1 skip, exit 0**. Đây là lần đầu bản gộp cuối (RF-04 + E16-R1 + E10-O3 + lane) chạy full frontend |
| **Chưa chạy hôm nay** | lane real-API (lần cuối 52/54 ngày 27/9), visual baseline (lần cuối 332/16/0 ở `1dec9d33`, **trước** S08/S12 đổi), hook backend |
| Dữ liệu thật | preview `:8095` ở `c81e8dc2`, migration 067, **đọc-only**. Nó **không** chứa E16-R1 (068), E10-O3 (069) và RF-04 |

## 1. Plan tiến triển đến đâu

| Nhóm | Trạng thái |
|---|---|
| P01–P05, RF-01 | Hoàn tất cả FE lẫn BE |
| RF-02…RF-06 | Đóng/đã giao. RF-02 Bobby duyệt; RF-03 chỉ còn `CG-RF02-01` (nay là OL-01, chờ ops); RF-04/RF-06 chờ Bobby xem danh sách lệch HiFi |
| P06–P14 | Hoàn tất; P13–P17 ASTRA_REMEDIATED, hai quyết định owner (DR-02, Reveal) đã chốt |
| **P15–P21** (màn 06–13, composer S11) | **Code xong cả FE lẫn BE ≤P21.** Mọi gói E1–E7 (FE), E10–E15 (BE), E16 (làm bằng R1) đã gộp; lane real-API phủ đủ 14 màn. Phần còn lại là **kiểm chứng trên dữ liệu thật và một số gap nhỏ** (§4) |
| P22 | Backend Codex xong; FE S11 publish đã tích hợp (X1). **Chưa** có receipt thật Delta→R1 (OL-05) |
| P23 | Harness sẵn sàng; qualification chưa chạy (OL-12, OL-24). Runner P23 lane fixture 78/78 |
| P24 | Chưa mở — chỉ mở khi mục A và B của sổ rỗng |

Đếm trong sổ: mục **A** (backend) 13 dòng — 11 còn mở, trong đó **9 của Codex**; mục **B** 5 dòng — 4 đóng (OL-20…23), OL-24 mở; mục **E** 15 gói (E1–E7, E10–E17) — 14 xong ở mức code (E16 làm bằng R1, phần R2 còn mở), E17 buộc vào OL-01; mục **D** 10 quyết định thiết kế — **6 đã làm** (D1, D2, D3, D8, D9, D10), 2 chủ ý không làm (D5 hoãn, D6 không dựng trace), **2 chưa làm** (D4, D7 — xem §2).

## 2. Sổ đã ghi sai hoặc thiếu — phát hiện hôm nay

| # | Phát hiện | Bằng chứng | Xử lý |
|---|---|---|---|
| 1 | **Plan trỏ tới record E14 không tồn tại** (từ 27/9) | `ls P18/ \| grep E14` rỗng; agent E14 bị cắt trước khi viết | Đã viết [`P18/E14_…md`](P18/E14_S05_S09_FIELDS_CLAUDE_2026-09-26.md) từ diff + dữ liệu thật |
| 2 | **E14 ghi "ĐÓNG" quá tay** cho ô OOS RETURN (9.8) và qualifier P04 (9.7) | API thật: `headline` của cả hai run chỉ có **6 khoá**, không `NET_RETURN`; identity P04 vẫn `mode_1_decay × global`. Contract nói rõ *"NET_RETURN is additive — a core sealed before E14 has six tiles"*; report bất biến sau seal | Đóng ở mức **code + test**; receipt thật chờ **một run seal sau E14** |
| 3 | **D4 (S02 prefill khoảng thời gian từ coverage dataset) chưa từng build** | `NewRunRoute.tsx:277-285` chỉ prefill theo `?alpha=&av=`; coverage chỉ hiện chữ (`NewRun.tsx:685`), không điền ngày | Vào sổ G2 |
| 4 | **D7 (S08 "play across folds", công tắc mặc định tắt) chưa từng build** | grep `across folds`/`playAcross` chỉ trúng một tiêu đề của S06 | Vào sổ G1 |
| 5 | **D1-O1 chưa vào sổ**: nhãn `R-WFO-###` không hiện khi mở thẳng S09/S11/S13 bằng link | Record D1/E13: read của ba màn không trả `display_label` | Vào sổ G3 |
| 6 | **OL-02 và OL-24 rơi khỏi mục F** | mục F không nhắc; OL-02 chỉ còn ở mục A và D, OL-24 chỉ ở mục B | Vào sổ G11, G12 |
| 7 | **Mục F tự mâu thuẫn**: đoạn mở đầu nói "hai việc đang làm dở, chưa commit" trong khi bảng ngay dưới ghi F1/F2 đã xong | `UNIFIED…:3755` | Đã sửa đoạn mở đầu |
| 8 | **7 dòng board P15–P21 còn ghi trạng thái 26/9** ("X2 in progress", "X3", "X1") | §13.4 dòng P15–P21 | Đã thêm dòng "NOW 2026-09-30" ở đầu mỗi dòng |
| 9 | D1-O2 ("card S01 in id ngắn") trong record D1 vẫn ghi mở | đã sửa ở `05f0d6a0` — S01 in `R-P04-017` | Ghi trong G3 là đã đóng |
| 10 | E5-O5 ("nhãn fold decay 0-based") trong record E5 vẫn ghi mở | đã sửa bằng `foldLabel` khi gộp E5/E6 | Không còn mở |
| 11 | E6 open #4: probe a11y RF-04 "không thấy `[data-screen]`" | import trùng ở `_probe-research-product.spec.ts` đã sửa khi gộp; **vụ `[data-screen]` chưa động tới** | Vào sổ G7 |

## 3. Đã xác minh trên dữ liệu thật hôm nay (preview `c81e8dc2`)

| Điều | Kết quả |
|---|---|
| S05: gap scan + stitch digest (E14 5.11/5.12) | Hiện đúng: "gap scan ✓ 1 of 1 fold boundary · no gap"; "stitch digest 812b913261e7… verified against fold boundaries · 2 segments, 336 observations" |
| S09: evidence link (9.15) | Có, đúng URL kèm `report_revision` |
| S13 markets (E7 backend) | **Nhóm hoạt động thật**: `mode=markets` trả **1 thẻ** (trước: 24 thẻ theo run); alpha này chỉ có một market BTCUSDT·1h nên 33 run gộp thành 1 là đúng |
| S01 (D1, D3) | Card head `R-P04-017`; thanh đếm trạng thái `33 runs · 14 completed · 19 failed` |
| S09: ô OOS RETURN + qualifier P04 | **Không thể** thấy được — report seal trước E14 (§2 mục 2) |
| S09: lưới equity 6 đường (9.10) | Chưa xác nhận bằng mắt |

## 4. Gap frontend còn lại (bản đầy đủ nằm ở plan §13.4.1 mục G)

### (b) Claude làm được, không chờ ai

| Id | Gap | Cỡ |
|---|---|---|
| G1 | **D7** — S08 công tắc "play across folds" (mặc định tắt; bật thì đọc cửa sổ kế ở biên fold) | S–M |
| G2 | **D4** — S02 prefill IS/OOS từ coverage của dataset đã chọn, sửa được; không có dataset thì để trống | S |
| G3 | **D1-O1** — nhãn `R-WFO-###` khi mở thẳng S09/S11/S13 (thêm `display_label` vào 3 read, backend ≤P21 nhỏ) | S |
| G4 | Ladder S13: mũi tên `claim ↑ →` treo ở cuối hàng | S |
| G5 | S09: in Letter/A4 chạy lại; nhìn lưới 6 đường trên dữ liệu thật; ô NET_RETURN + qualifier chờ G10 | S |
| G6 | Visual baseline chạy lại sau S08/S12 — **chỉ** qua `./scripts/portal-web-visual.sh`; nếu lệch ô nào thì trình Bobby, không tự sinh lại | S (+ ~18 phút chạy) |
| G7 | Probe a11y RF-04 không thấy `[data-screen]` trên dev server (mọi màn) — lỗi harness | S |
| G8 | S06 dải glyph theo fold "what this mode reads" (HiFi 6.4) | M |
| G9 | S14 registry strip: cap "top N / total" — chưa cần ở 1 entry, ghi để khỏi quên | S |
| G10 | **Một stack ghi được + run mới** — cổng chung cho receipt thật của: E13 (clone tạo cây lồng), E14 (NET_RETURN + qualifier), E16-R1 (dải nến P04), E10-O1/O3 (hội tụ), S02 create + preflight, S14 write. Gộp F4 + F5 | — |
| G11 | **OL-02** — receipt verify byte: MATCH và một MISMATCH có chủ ý, observer bật | S (cần G10) |
| G12 | **OL-24** — P23 browser-real / research-dev | Codex + Claude |

### (c) Chờ Codex — frontend tự sáng khi field có (đang hiện typed absence, không bịa)

OL-13 (rc chip S01, "last published RC" S02) · OL-07 + OL-09 (S11: assignee pool / quorum / decision / lỗi publish) ·
OL-03 (pick ở S10) · OL-05 (receipt thật Delta→R1 → S11 publish happy path) · E16-R2 (engine pin, S07) ·
E6-BR-01 (chữ ký/SBOM, S14) · E5-O1/O2 (engine: max_dd từng candidate, K thật cho mode 3/4/5).

### (a) Bobby quyết hoặc duyệt

| Việc | Phương án và hệ quả |
|---|---|
| **Cho phép ghi vào preview** (mở G10) | **A (khuyến nghị):** seed 2 run mới (WFO + P04) bằng `scripts/research-preview/seed-run.mjs` — thêm 2 dòng vào DB preview cô lập (33→35 run), không đụng stack nào khác; mở khoá 6 receipt cùng lúc. **B:** giữ read-only — E13/E14/E16-R1/E10 ở lại "đóng ở mức code" |
| Duyệt lệch HiFi **VD-RF04-01** (S12 cao hơn HiFi 205 px vì engine trả chữ gấp 2,5 lần mẫu) và **VD-RF04-02** (hai kiểu bố cục term trên một màn) | Duyệt = đóng RF-04. Không duyệt = phải chọn: cắt term (đã từ chối) hoặc thu chữ dưới cỡ nhỏ nhất (đã từ chối) |
| Duyệt bảng lệch HiFi của S14 (E6) | Đóng E6 |
| **D-B1** — token `--ink-faint` `#939db0` (ngoại lệ axe duy nhất) | Đổi token là đụng baseline → phải là bước riêng |
| Độ phân giải dải nến S08: WFO 160 bucket, P04 48 bucket | Đồng nhất hay giữ (mỗi caption ghi cỡ bucket nên không nói dối) |
| Ladder S13 khi > 12 attempt có claim | Quyết định thiết kế mới |
| Migration cho `relation_kind = CLONE_OF` (E13-O3) | Hiện clone đọc là "parent edge" trơn — chấp nhận được; đổi cần một số migration |
| Backfill overview OHLC cho run P04 cũ (E16R1 #1) | Cần đọc lại snapshot P08 — thiết kế nặng hơn, chỉ nếu muốn |

## 5. Thứ tự đề xuất và điều kiện đóng P15–P21

1. **Build lại preview** (068 + 069 + RF-04) rồi chạy lane → receipt xanh 54/54 (F3) — kiểm, không phải code.
2. **G6** visual baseline sau S08/S12.
3. **Bobby gật G10** → seed run mới → receipt E13, E14, E16-R1, E10, G11.
4. Code G1, G2, G3, G4, G7 (nhỏ, độc lập, tôi làm được ngay); G8, G9 sau.
5. Bobby duyệt bảng lệch (VD-RF04-01/02, S14, D-B1).

**Điều kiện đóng P15–P21:** F3 xanh 54/54 · G6 chạy xong · G10 làm xong với receipt thật · G1–G4 xong hoặc Bobby chấp nhận hoãn ·
các mục (a) được duyệt. **P22/P23** chờ Codex (OL-03…OL-13).

## 6. Cập nhật cùng ngày — Bobby duyệt, G10 chạy (2026-09-30, sau `d3d99f26`)

**Bobby đã duyệt:** phương án A (seed run mới trên preview), VD-RF04-01 + VD-RF04-02 (RF-04 đóng), bảng lệch HiFi S14 (E6 đóng).

**G10 — receipt thật** (`G10_WRITABLE_PREVIEW_RECEIPT_CLAUDE_2026-09-30.md`, S14: `P10/S14_REAL_WRITE_RECEIPT_CLAUDE_2026-09-30.md`):

| Gói | Kết quả |
|---|---|
| E14 (NET_RETURN + qualifier) | PASS trên R-P04-018 / R-WFO-017 |
| E16-R1 (dải nến P04) | PASS — 744 bar → 47 nến × 16 |
| S02 create + preflight | PASS — 201 → 202, tạo R-P04-019 |
| E13 (cây lồng) | PASS — kèm sửa lỗi thứ tự cây S10 |
| E10 một trạng thái | PASS — 36/36 khớp |
| E10-O1/O3 hội tụ | **NOT_RUN** — cần Bobby cho phép cố ý làm kẹt một run |
| S14 ghi thật | PASS — 2 entry ACTIVE; 3 backend request mới (dưới) |

**Hai lỗi frontend chỉ dữ liệu thật mới lộ — đã sửa:** S02 im lặng với mọi refusal không có field (403/401/503/mạng); S10 vẽ clone dưới sai cha.

**Gap mới phát sinh:**

| Id | Gap | Chủ |
|---|---|---|
| G13 | S08 mở thẳng link in `rrun_464bf9c3` thay vì `R-P04-018` — giao cho agent G3 (mở rộng D1-O1 sang S05–S08) | Claude |
| S14-RW-BR-01 | register replay sau khi activate → 500 (CHECK supersedes) | Codex |
| S14-RW-BR-02 | FAIL ghi vào nhầm hàng mirror | Codex |
| S14-RW-BR-03 | trả 201, OpenAPI ghi 200 | Codex |
| S14-C1 | Câu refusal origin ở S14 mô tả sai lý do; ghi chú DRAFT ở bước 3 — quyết copy | Bobby |

**Sự cố bảo mật:** agent S14 đã `cat` file activation code của preview (bobby, claude-preview), nên mã nằm trong transcript agent đó. Đề nghị xoay (rotate) hai mã.

## 7. Batch G1–G8 — agents đã xong, chờ gộp một commit (2026-09-30)

| Gói | Worktree / commit | Kết quả | Còn mở |
|---|---|---|---|
| G1 D7 play across folds (S08) | agent-afd8…, chưa commit | 36 test mới + S08 109/109; browser trên preview WFO: đúng 1 read mỗi biên | lane real-API chưa có ô; nhãn rộng hơn HiFi (406 vs 154 px) |
| G2 D4 prefill (S02) | `ed33db0d` (qua hook) | 33 test mới; chỉ điền 4 biên ngoài theo coverage | preflight có thể từ chối IS start (warmup) — cần receipt ghi; BR-D4-1..3 |
| G3 D1-O1 nhãn cold link (S05–S09, S11, S13) | agent-ab5c…, chưa commit, +1380/−61 (có backend) | backend 605 pass, FE 233 pass; S05–S08 thật trên preview | ETag report giờ phủ toàn bộ body (RF-05) — chấp nhận, addendum P18; một read thừa trên WFO |
| G4 ladder S13 + G7 probe | agent-a12f…, chưa commit | ladder dạng grid, 0 mũi tên treo; probe axe 15 màn × 3 cỡ | axe đỏ S01/S03/S04/S10 (màu HiFi/dim có chủ ý — Bobby), S02/S06/S08 heading-order |
| G5 S09 print | `d7db1cb3` đã vào w1-build | 4 lỗi in/trục sửa | đọc dữ liệu thật chưa chạy |
| G8 S06 dải glyph fold | agent-a935…, staged | 41 test mới; hình học khớp HiFi | F-1: chip OOS nói `selection input`, dải nói retrospective — Bobby |
| Token gate S14 | w1-build, chưa commit | `tokens.test.ts` đỏ từ E6 — sửa bằng `--shadow-e1` | hook không chạy vitest frontend → lỗ gate |
| G14 topbar — **Bobby chọn A** | w1-build, chưa commit (`TopBar.tsx`, `shell.css`, test mới 3/3) | chỉ màn run: <1440 px bỏ đoạn `QuantBT Backtest`, <1366 px bỏ tên màn; giữ `Research / R-WFO-017`. Đo trên preview thật: 1280/1440/1728 cao 56 px một hàng; 1440 = đúng HiFi. Bản agent (cuộn ngang mọi màn) **bỏ** | 660 px vẫn xuống dòng như cũ (không đổi). Baseline Research laptop sẽ đổi (crumb ngắn hơn) |

**Chặn:** gộp diff của agent vào w1-build (`cherry-pick -n`) bị bộ phân loại quyền chặn là "CI bypass" — cần Bobby cho phép; hook vẫn chạy trên commit gộp.

## 8. Báo cáo tổng cho Bobby — FE gap, backend Codex, tương thích, việc còn lại (2026-09-30 chiều)

Nguồn: mục 7 ở trên + `P21/CODEX_BACKEND_AND_COMPAT_SURVEY_CLAUDE_2026-09-30.md` (khảo sát chỉ đọc, merge thử bằng `git merge-tree`).

### 8.1 Phát hiện lớn nhất: hai nhánh đã tách xa nhau

- Nhánh Codex (`/home/bobby/portal-research`, `2bfeb53e`) **đi trước origin 123 commit, chưa push**; chứa cả `codex/research-ol-p22-p24`. Trong đó ~9 commit là **slice frontend FG** (44 file FE).
- Ba thứ tôi/agent làm hôm nay **trùng** với việc Codex đã làm: sửa refusal S02 (trùng FG-08 `a1d7bf3f`), mũi tên ladder S13 G4 (trùng FG-04a `b896d98d`, thiết kế khác: grid vs flex), `display_label` G3 (trùng CG-FG-D1-O1 `08fa8ee0`/`8ad39e83`).
- Codex **đổi số migration 068→075, 069→076**. DB preview đã chạy 068/069 → phải sửa bảng `pgmigrations` trước khi deploy nhánh Codex, không thì migration chạy lại và hỏng (075/076 không idempotent).
- Codex **xoá fixture journey v2**, nhưng 3 file e2e còn nạp nó → hỏng cả fixture lane + visual suite sau merge (nguyên nhân 64 lỗi ENOENT của OL-24). Việc của tôi.

### 8.2 Backend Codex đang ở đâu

| Mục | Trạng thái |
|---|---|
| P22 (OL-03…OL-11, OL-13; migration 070–073) | backend real-preview **xong**; product browser còn |
| OL-01 imported/DRAFT (074) | **mới chứng minh trên môi trường cô lập**; Research production chưa bật (sửa theo phản biện Codex) |
| OL-02 byte verify | xong |
| E11/E14 analytics, E13 lineage, E15, E16 `market_overview` + `engine_pin` (trả lời E16-R2) | xong |
| E6-BR-01 chữ ký/SBOM | chỉ "not published" có kiểu |
| **P23 (OL-12)** | **đang làm**: nhiều pass scoped xong (F3 WFO 12/12, F5 ghi S02/S14…, T10 Python suite xanh); còn F3 54/54 real-API, F5 502 + nghiệm thu đủ, T07/T13 với engine thứ hai, T10 trên cùng candidate, **T14 exposure/audit-child**, **bộ DR/BR/GX tổng thể**, bảo mật export cũ |
| P24 | **đã giao Codex** (backend P22–P24); chưa triển khai, chờ P23 + nghiệm thu frontend |
| Request còn mở | E5-O1/O2 là request tới **QuantBT engine** (drawdown từng candidate; K + membership pool) — Portal không tự tính trung thực được, đã hiện typed absence; 37 gói CG-FG-S02…S14 còn phải triage/triển khai (CG-FG-D1-O1 và **CG-FG-R2-01 đã đóng**); CG-FG-P22-01 |

### 8.3 Tương thích FE ↔ BE

- **Contract:** không field nào bị xoá/đổi tên — chỉ thêm. Frontend hiện tại không vỡ vì contract.
- **Lỗi thật nếu merge G3 nguyên trạng:** G3 đọc nhãn RC ở `run.display_label`, Codex trả ở top-level → nhãn mất âm thầm. ⇒ **không merge G3 nguyên**; cắt còn phần Codex chưa có (nhãn S05–S08, crumb topbar).
- `engine_pin` giờ bắt buộc → vài fixture typed cũ có thể lỗi tsc sau merge.
- Hai field overview P04 song song: `candle_overview` (tôi, E16-R1) và `market_overview` (Codex) → **Bobby chọn một**.
- **Codex publish nhưng FE chưa đọc:** `replay.market_overview`, `import_attestation`, `imported_alpha`, `reproduction` + quan hệ `REPRODUCTION_OF`, `imported_*` (portal-api).
- Conflict merge: `NewRun.tsx` 2 hunk, `AlphaImport.tsx` 1, G3 ~40, G4 6; G1, G2, G8, topbar A sạch.

### 8.4 Gap frontend còn lại (sau batch hôm nay)

**(b) Claude làm, không chờ ai**
1. Hợp nhất với nhánh Codex (sau khi Codex push) + sửa tham chiếu journey v2→v3.
2. Cắt G3; chọn bản ladder (Bobby); merge G1, G2, G8, topbar A, token S14.
3. Đọc các field Codex đã publish (8.3).
4. a11y: heading-order S02/S06/S08; từ ngữ imported-alpha ở `SplitDetail`.
5. S09: đọc dữ liệu thật (G5 nửa sau); `OOS_SHARPE` in dấu `-` thay vì `−`.
6. Lane F3 54/54, F5 đủ; G9 cap S14; receipt G11/OL-02 phía FE.
7. Backend ≤P21 của tôi: S14-RW-BR-01..03 (500 khi replay bản active — ưu tiên), CG-P21-01..05, BR-D4-1..3.
8. Lỗ gate: hook không chạy vitest frontend (token test đỏ lọt qua).

**(a) Bobby quyết**
- Ladder S13: G4 (grid) hay FG-04a của Codex.
- P04 overview: `candle_overview` hay `market_overview`.
- a11y màu HiFi S01/S03/S04/S10; chip OOS S06 (đề xuất `retrospective`); chữ S14; D-B1.
- Cập nhật baseline visual Research (sau khi merge xong).
- Rotate activation code; cho phép làm kẹt run (E10-O1/O3).
- Cách gộp diff agent (A: áp vào cây rồi 1 commit qua hook; B: mỗi agent tự commit).

**(c) Chờ Codex**
- **Push `2bfeb53e`** (việc chặn mọi thứ phía trên).
- P23 phần còn lại, P24, E5-O1/O2.

### 8.5 Có nên rebuild research-portal bây giờ?

**Chưa.** Preview đang chạy `d3d99f26`; nhánh của tôi thiếu 123 commit của Codex, còn nhánh Codex thiếu việc hôm nay của tôi. Build lúc này cho Bobby xem một bản **sẽ bị thay ngay** sau hợp nhất, và build nhánh Codex lên DB preview hiện tại sẽ đụng lỗi migration 068/069→075/076. Thứ tự đề xuất — mỗi bước chạy **một lần**:
1. Codex push `2bfeb53e` (fast-forward, không force).
2. Tôi merge vào `w1-build`, cắt G3, gộp batch, sửa journey v2→v3 → **một** commit qua hook.
3. Sửa `pgmigrations` trên DB preview (068→075, 069→076).
4. **Một** lần rebuild preview → Bobby xem → quyết tiếp. Lane + visual chạy sau khi Bobby xem, lúc máy rảnh.

Nếu Bobby muốn xem ngay: preview hiện tại (`d3d99f26`) đã có G10 (E14, E16-R1, S02 tạo run, E13) trên dữ liệu thật; chưa có các sửa hôm nay.

> **Sửa theo phản biện Codex (2026-09-30):** câu "OL-01…OL-11 xong" và "P24 chưa ai nhận" ở bản trước là sai; P23 còn nhiều hơn bốn mục. Đã sửa bảng 8.2. Rà soát sâu từng phase đang chạy (backend / nối FE↔BE / HiFi 00–07 / HiFi 08–14 / kiểm kê commit rơi).
