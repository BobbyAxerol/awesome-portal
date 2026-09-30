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
