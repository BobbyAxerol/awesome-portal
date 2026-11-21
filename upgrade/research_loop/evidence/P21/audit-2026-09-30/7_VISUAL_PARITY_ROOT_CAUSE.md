# Tại sao research-portal "toàn chữ" — kiểm bằng ảnh HiFi ↔ live (Claude, 2026-09-30)

Bobby: "không có màn index như HiFi; vào S1–S5, Atlas… toàn chữ là chữ; build có đủ không, mất code hay lỗi?"

Cách kiểm: chụp **chính file HiFi** (`release-v1.1/QuantBT NN *.dc.html`) và **research-portal thật** ở 1440, đặt cạnh nhau, click từng tab. Ảnh: `scratchpad/cmp0930/`.

## Kết luận

**Không mất code, build đủ.** Preview chạy `784bb19d` (nhánh gom), image = tag, bundle công khai = bundle local. Các màn deep-dive có đủ đồ hoạ: 05 Split (fold timeline, θ* flow, bảng fold), 08 Execute (candle replay 16 hình), 12 Atlas (5 mode, công thức, schedule→claim), 00 Journey Map (8 tầng P1–P8, bảng mapping).

**Lỗi là của Claude — ba chỗ:**

| # | Lỗi | Bằng chứng | Vì sao lọt |
|---|---|---|---|
| V1 | **Màn index (S00) không ai tới được**: `/research/quantbt` (link "QuantBT Backtest" ở sidebar) redirect sang Run Library; Journey Map chỉ ở `/research/quantbt/journey`, không link nào trỏ vào | `QuantBTModule.tsx` `<Route index … Navigate to runs>` | HiFi `index.html` mở thẳng Journey Map; không ai so điểm vào |
| V2 | **Hub 04 — tab S1 Split, S2 Search, S3 Freeze, S4 Execute, S5 Claim, Atlas chỉ in 4 ô chữ** "not published — the Evidence Hub publishes this stage's timeline, not its content. Screen 05 reads it" + nút "open deep dive". HiFi vẽ **thân đầy đủ** trong tab (fold timeline, bảng fold, candle replay, event ledger, inspector…) | ảnh `tab-*-hifi.png` vs `tab-*-live.png` | Làm tắt từ P13 ("deep dive owns the full story"), rà soát 09-30 đã ghi "chưa có quyết định" nhưng không sửa. **Còn sai sự thật**: nói "not published" trong khi chính dữ liệu đó màn 05/08 đang vẽ |
| V3 | Phase đóng theo tiêu chí **field/contract + typed absence**, không theo **ảnh so HiFi**. Nên màn "đúng dữ liệu" vẫn qua dù trông khác HiFi | receipt các phase đo field, không đo hình | quy trình nghiệm thu thiếu bước so ảnh từng khối |

**Chỗ "chữ" là trung thực, không phải lỗi FE** (engine/backend chưa publish — để nguyên typed absence, đã có request):
S04 Behavior 8 ô, rolling Sharpe/beta, benchmark, OOS Sortino/CAGR/PF (engine QuantBT 1.1.1 không publish); certification (E5/E16).

**Chỗ lệch đồ hoạ nhỏ hơn** (sửa sau V1/V2):
- S12 Atlas: HiFi "WHAT IT READS" là dải ô minh hoạ (IS pulse / OOS hatched / bootstrap ghosts / plateau dots / shards), live in chip chữ; công thức HiFi đặt kiểu toán, live in mono.
- S04: 15 ô số liệu (8 "not published") so với 5 ô hero của HiFi — nên gộp ô vắng thành một dòng.
- Sidebar: nền xám dừng ~1100px, trang dài hơn thì hở.

## Sửa (đang làm, 2026-09-30)

1. **V1** — `/research/quantbt` mở Journey Map (index = S00, như HiFi `index.html`).
2. **V2** — mỗi tab hub render **thân thật** bằng chính component + read của deep-dive (không viết lại, không suy diễn): S1 ← `SplitDetail` fold timeline + bảng; S2 ← Search stage A/B + dải glyph; S3 ← Freeze digest chain; S4 ← candle replay; S5 ← cert chain / manifest; Atlas ← ma trận Atlas. Deep-dive link giữ lại. Chỉ khi read thật từ chối mới in typed absence (với mã của read đó).
3. **Nghiệm thu mới cho mọi màn**: chụp HiFi ↔ live từng khối, không đóng màn khi còn khối "chữ thay hình" mà dữ liệu có.

## Đã làm (2026-09-30, cùng buổi)

| Lỗi | Sửa | Test |
|---|---|---|
| V1 | `/research/quantbt` render Journey Map (S00) — sidebar "QuantBT Backtest" mở đúng màn index như HiFi `index.html` | quantbt/app/journey 139 pass |
| V2 · S1 Split | tab nhúng thân Screen 05 (`SplitRouteBody embedded`), cursor dùng chung với hub (click fold trong tab đổi fold của hub) | hubStageSplit 5 + evidenceFlow/splitDetail |
| V2 · S2 Search | tab nhúng thân Screen 06 (`SearchRoute embedded`) | hubStageSearch 2 + search* 282 |
| V2 · S3 Freeze | tab nhúng thân Screen 07 (`FreezeRoute embedded`) | hubStageFreeze 2 + freeze/evidenceFlow |
| V2 · S4 Execute | tab nhúng thân Screen 08 (`ExecuteContainer embedded`), fold hub ↔ replay đồng bộ hai chiều | hubStageExecute 5 + execute* |
| V2 · Atlas | tab vẽ ma trận Atlas bằng cùng read + component Screen 12 (`EngineAtlas embedded`, vị trí giữ trong state để không ghi đè hash cursor của hub) | evidenceFlow/engineAtlas 178 |
| V2 · S5 Claim | (agent đang làm) manifest từ progress read như S03 | — |
| S03 tiêu đề | "Run completed — R-WFO-017" (nhãn run), không còn `rrun_…` | runProgress 124 |

Sau gộp: research + app + quantbt **1761 test, 0 fail** (trước khi thêm Claim).

**Quét các màn còn lại** ([8_visual_sweep_other_screens.md](8_visual_sweep_other_screens.md)): ngoài S00/S04, đồ hoạ HiFi đều đã vẽ; chữ còn lại chủ yếu là vắng có mã lý do. Còn: S13 ladder 15 thẻ cùng claim với mũi tên "claim ↑" (quyết định Bobby: gộp theo họ claim / bỏ mũi tên khi bằng nhau); S13 OOS Sharpe P04 vắng trong compare nhưng Run Library có 0.744 (request backend: compare đọc metric v3); S02 timeline cửa sổ in chữ thay dải (S, dùng lại `SplitBand`); S06 search cinema chưa dựng theo D6 — cần một dòng vắng có nhãn; tràn chữ digest S11, bảng diff S13 bị cắt; S10 chip ACTIVE là trạng thái **version** (thiết kế cũ) cạnh attempt FAILED — Bobby quyết có đổi sang trạng thái attempt không; file HiFi 09 thiếu `doc-page.js`.
