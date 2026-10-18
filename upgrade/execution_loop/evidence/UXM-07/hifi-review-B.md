# UXM-07 — Rà soát HIFI v2 so với implementation, nhóm B

Phạm vi: Portfolios, Portfolio 360, Compare, Alpha 360, Alpha Replay (trang HIFI `trade-replay.html`).
Chế độ: chỉ đọc code. Không chạy trình duyệt. Mọi số "HIFI" lấy từ `design/hifi/v2/*.html`, `kit.css`, `modules/*.js`. Mọi số "impl" lấy từ `apps/portal/frontend/src/execution/v2/css/*.css`, `screens/**` và từ ảnh chụp 1440 / 390 trong scratchpad (`s1shots/`, `cmp/`, `hf/`).
Con số kích thước bảng Portfolios là ước lượng từ vị trí cột trong ảnh cộng với độ dài chuỗi và padding trong CSS, sai số khoảng ±5%.

Quy ước: A = DATA_ABSENT, B = FIDELITY (MAJOR / MINOR), C = INTENTIONAL. Mã FE lấy từ `FRONTEND_BACKEND_SYNC.md` (FE-001…043) và `evidence/UXM-07/backend-requests.md` (FE-044…055).

Giới hạn của lượt rà: ảnh impl chỉ có tab Overview (Portfolio 360) và tab Performance / Replay (Alpha 360). Các tab còn lại (Allocations, Alphas, Accounts, Risk, People, Deployments, Evidence, Orders, Activity) chỉ được đối chiếu bằng code, không bằng ảnh.

## 0. Phát hiện chung (ảnh hưởng cả 5 màn)

| # | Hạng | Nội dung | Số đo HIFI vs impl | Sửa nhỏ nhất |
|---|---|---|---|---|
| X1 | B MINOR | Nhịp dọc giữa các khối nhỏ hơn HIFI: `.stack{gap:24px}` | impl: `.exec-pf-v2`, `.exec-cmpr-v2` gap 12px (`--space-3`); `.exec-alp2-v2` gap 16px (`--space-4`). Chú thích đầu `alpha.css` ghi "page stack gap 24" nhưng giá trị thực là 16 | `portfolios.css .exec-pf-v2`, `compare.css .exec-cmpr-v2`, `alpha.css .exec-alp2-v2`: `gap: var(--space-5)` |
| X2 | B MINOR | Tiêu đề trang dính sát thanh Context: `main{padding:24px}` của HIFI không có trong ảnh impl (khoảng cách top 0px, lề phải 16px so với 24px). Đây là shell chung, chỉ ghi nhận | HIFI 24px / 24px; impl 0px / 16px | Chủ shell (ngoài nhóm B) |
| X3 | B MINOR | Nút bị tắt chỉ có lý do trong `title` hoặc `sr-only`. HIFI in dòng `.why` ngay dưới nút ("Export is not available yet · My access", "Select 2 to 4 portfolios"). Trên cảm ứng và với người nhìn thì lý do không tới được. Áp dụng: Export, Compare (Portfolios), Report pack (Portfolio 360) | HIFI `KIT.disabled()` + `.why` 11px/16px; impl `title=` + `<p class="exec-pf-sr">` | Tạo `DisabledReason` nhỏ in `.exec-pf-why` (caption role) cạnh nút, giữ `aria-describedby` |
| X4 | C | Chữ hoa mono của HIFI (th, tab, tiêu đề panel: `font:500 11px mono; letter-spacing:.1em; text-transform:uppercase`) được thay bằng vai trò chữ `--exec-font-th/label/control`, không in hoa. Theo `execution.css` (owner override EL-V2-10) và ghi chú đầu mỗi file css. Ảnh cho thấy chưa nhất quán: th của bảng Portfolios vẫn in hoa còn tiêu đề panel và tab thì không | | Không sửa. Nếu muốn thống nhất thì chọn một kiểu cho toàn V2 |
| X5 | C | Vỏ portal: sidebar (Command / Governance / Deployments / Research...), nhãn nav ("Deployments / Portfolios"), badge "Research", "Default Workspace", hai select "Execution Carbon / Operational", breadcrumb của shell, dòng "Window applies when the server supports it." (FE-041, `windowLock`) | | Không sửa |
| X6 | C | Phần chỉ có ở bản xem trước của HIFI: thanh `.strip` (Design preview, ROLE, DATA qualified / not qualified, Sample values), `.dstrip` của trade-replay, seg "Preview stage" trong Lifecycle, nhãn "Sample data" | | Không sửa |

---

## 1. Portfolios (HIFI `portfolios.html`)

Ảnh: `cmp/portfolios.png`, `hf/portfolios-nq.png`, `s1shots/portfolios-wide.png`, `-narrow.png`.

### 1.1 Bảng bị cắt, đã xác nhận và đo

Vùng nhìn thấy của bảng ở 1440: x = 244 đến 1424, tức 1.180px. Phần còn lại nằm trong `.exec-cards-wrap{overflow-x:auto}`, không có dấu hiệu cuộn.

| Cột impl | Rộng đo trong ảnh (px) | Ghi chú |
|---|---|---|
| Compare | 80 | |
| Portfolio | 262 | |
| Owner | 215 | |
| State | 104 | |
| Domain | 246 | cột này HIFI mặc định ẩn (`hide={dom:true}`) |
| Allocations | 105 | |
| Deployments | 112 | |
| Allocated capital | ~290 (ước lượng), chỉ thấy ~56 | cờ "Real-funded and Simulated books together" không xuống dòng |
| NAV / Net PnL / Return / Drawdown / Concentration | ~156 / 204 / 204 / 204 / 156 (ước lượng) | mỗi ô là một dòng "Not published (FE-xxx, FE-025)" với `white-space:nowrap` |

Tổng bảng khoảng 2.340px, gấp khoảng 2 lần vùng nhìn thấy. Năm cột số liệu cần quyết định (NAV, Net PnL, Return, Drawdown, Concentration) nằm ngoài màn hình, cùng một phần lớn cột Allocated capital.
HIFI đặt 11 cột vừa 1.130px: padding ô `6px 5px`, th `10px` được phép xuống dòng, `td.c-mgr` và `td.c-dom` `max-width:80px`, ô "Not available" hai dòng (giá trị rồi lý do).
Impl: `.exec-cards tbody td{padding:7px 12px; white-space:nowrap}`, th `11px; white-space:nowrap`, 13 cột.

### 1.2 Bảng lệch

| # | Hạng | HIFI | Impl | Sửa nhỏ nhất |
|---|---|---|---|---|
| P-A1 | A | Giá trị NAV, Net PnL, Return, Drawdown, Concentration | Ô "Not published (FE-013)", "(FE-005, FE-025)", "(FE-006, FE-025)", "(FE-013, FE-025)", "(FE-005)" | Không (đúng quy ước) |
| P-A2 | A | Cột Health (OK / RECALL / STALE / PARTIAL / UNKNOWN) | Cột State (ACTIVE / UNKNOWN) | Chờ FE-007 (`attention_reasons`) và FE-014 |
| P-A3 | A | Bộ lọc nhanh "Needs attention", "Stale" | Không có, thay bằng chip Domain | Cùng nguồn P-A2 |
| P-A4 | A | Dòng tfoot "Total · NAV · filtered set" | Dòng chữ "Total NAV, this set: Not published (FE-013)" | Không |
| P-A5 | A | 7 dòng, cột Manager đủ tên, cột "Alphas / deploy." | 6 trên 9 portfolio, "Load more" tắt (không cursor, FE-044); Owner có dòng "Not available · owner not published"; không có số alpha | Không |
| P-A6 | A | Cờ "Not scored · policy not set" | Chữ mờ "Score: Not published (FE-011)" | Không |
| P-A7 | A | Sort mặc định NAV giảm dần | Sort mặc định Name (NAV chưa publish, FE-013) | Không |
| P-B1 | **B MAJOR** | Bảng vừa khung 1.130px | Bảng ~2.340px, năm cột số bị cắt như trên | (1) `readHidden`: khi thiếu tham số `hide` thì ẩn `domain` mặc định. (2) `portfolios.css`: `.exec-pf-panel .exec-cards th, td {padding-left:5px; padding-right:5px}` và `.exec-pf-panel .exec-cards thead th {white-space:normal; vertical-align:bottom}`. (3) `.exec-pf-np {display:inline-block; white-space:normal; max-width:104px}` để "Not published" và "(FE-005, FE-025)" thành hai dòng. (4) `.exec-pf-alloc .exec-flag {white-space:normal}`. (5) `.exec-pf-domain, td owner {max-width:80px; white-space:normal}` |
| P-B2 | B MINOR | Padding ô `6px 5px`, `td` cao 36px, th 10px / `.04em` | `7px 12px`, cao 32px, th 11px | Gộp vào sửa P-B1 (2) |
| P-B3 | B MINOR | Phạm vi hàng theo Context: chọn Real-funded thì chỉ liệt kê Real-funded (+ Unallocated) | Thanh Context đang "Real-funded" nhưng bảng liệt kê cả Simulated; dòng phụ nói "All environments" và có chip Domain All / Real-funded / Simulated riêng | Cần chủ quyết định. Nếu giữ thì đổi dòng phụ thành "Context: Real-funded · showing all domains" (`portfolios/index.tsx`, `.exec-pf-sub`). Nguyên nhân gốc: FE-014, FE-044 |
| P-B4 | B MINOR | Sort bằng cách bấm th (mũi tên `th.s::after`); chỉ Search + chip lọc + Columns / Compact / Export | Hai `<select>` (Currency, Sort) và nút "Ascending"; thêm toolbar dài hơn, "Compact" và "Export" bị đẩy xuống hàng 2 ở 1440 | Thêm `aria-sort` + nút sort trong `<th>` ở `PortfolioTable.tsx` (`CardsColumn.sortKey`); chuyển select Currency vào menu Columns |
| P-B5 | B MINOR | Một panel (`.panel`: nền `--panel`, viền `--line-strong`, padding 16) bọc toolbar, sel-bar và bảng; khoảng cách trong panel 12px | Không có panel, các khối nằm trực tiếp trên nền trang, gap 12px | `portfolios.css .exec-pf-panel`: `background: var(--surface-1); border: 1px solid var(--line-strong); padding: var(--space-4)` |
| P-B6 | B MINOR | Một banner (nq) cao ~38px rồi tới panel (panel bắt đầu y=294) | Ba banner liên tiếp: info (names and allocation only...), Partial, Branch not whole. Bảng bắt đầu y=462 ở 1440 | Gộp Partial và Branch not whole vào một banner nhiều dòng (`index.tsx` dòng ~219-230) |
| P-B7 | B MINOR | Cột "Manager", "Alphas / deploy." (một cột) | "Owner", "Allocations" và "Deployments" tách đôi | Đổi nhãn "Owner" thành "Manager" nếu quyết định giữ thuật ngữ HIFI; còn lại là hệ quả dữ liệu |
| P-B8 | B MINOR | Số âm PnL/Return màu `--bad` (đỏ) | `.exec-pf-num[data-tone="negative"]` dùng `--series-dd` (cam; kit ghi `--series-dd` chỉ dùng cho drawdown / chart) | `portfolios.css`: đổi sang token tương đương `--bad` đã có trong tokens.css |
| P-B9 | B MINOR | Mobile ≤660: card, toolbar gọn (~300px chrome trước thẻ đầu) | Mobile hoạt động được (thẻ xếp chồng, không bảng cắt, nút Compare / Columns với tới được) nhưng thẻ đầu tiên chỉ bắt đầu ở y≈820 do ba banner + 7 control. Cờ "REAL-FUNDED AND SIMULATED BOOKS" chạm mép phải | Sửa P-B6; `.exec-pf-alloc .exec-flag {white-space:normal}` |
| P-C1…4 | C | Xem X4, X5, X6; nhãn nav "Deployments / Portfolios" thay "Execution / Portfolios" | | |

Đếm Portfolios: A = 7, B = 9 (MAJOR 1, MINOR 8), C = 4.

---

## 2. Portfolio 360 (HIFI `portfolio.html`)

Ảnh: `cmp/portfolio-360.png`, `hf/portfolio-ok.png`, `hf/portfolio-nq.png`, `s1shots/portfolio-360-wide.png`, `-narrow.png`.
Impl khác chế độ HIFI vì có dữ liệu thật một phần (chuỗi equity, bảng vốn theo currency), nên so cấu trúc với `-ok`, so chữ "không có dữ liệu" với `-nq`.

| # | Hạng | HIFI | Impl | Sửa nhỏ nhất |
|---|---|---|---|---|
| T-A1 | A | 4 KPI NAV / Net PnL / Return / Drawdown có giá trị (24px) | 4 ô "Not published (FE-013)", "(FE-005, FE-025)", "(FE-006, FE-025)", "(FE-013, FE-025)" | Không |
| T-A2 | A | Bảng statements Initial funds, Added funds, Returned, Net external flows, Net PnL since start, NAV, Approved, Allocated, Recalling, Headroom | Chín dòng "Not published (FE-017)" / "(FE-005, FE-025)" / "(FE-013)" | Không |
| T-A3 | A | Tab đổi chuỗi Net PnL / Return / NAV | Chỉ có "Equity" (account equity theo snapshot); Net PnL và Return tắt với lý do (FE-005, FE-006, FE-025, FE-013) | Không |
| T-A4 | A | Panel Drawdown màu cam, -3.3% | Vùng gạch chéo "Not published (FE-013, FE-025)" | Không |
| T-A5 | A | Thanh Concentration theo alpha (37.0 / 29.6 / 18.5 / 14.8%) | Một câu "Shares of 4 alphas... need the Manager grouping" (FE-005) | Không |
| T-A6 | A | Thanh "Allocated / Recalling of approved" | Không có (cần Approved, FE-017) | Không |
| T-A7 | A | Needs attention: dòng chi tiết ("since 17 Oct 09:14Z · budget still allocated") và link hành động Verify / Investigate | Một dòng flag + id + "BTC-Trend · Live"; không chi tiết, không link hành động (eligibility FE-015) | Không |
| T-A8 | A | Điểm đánh dấu dòng vốn (+100,000) trên chuỗi | Không có (FE-032) | Không |
| T-A9 | A | Tab Allocations: capital flow, ledger có receipt | Ô "Receipt" là Np (FE-032, FE-046) | Không |
| T-A10 | A | Tab People: feed Activity, Configuration log, Attribution | Np (FE-031 activity, FE-021 audit) | Không |
| T-A11 | A | Tab Alphas: Share of PnL, Health | Share là Np (FE-005, FE-025) | Không |
| T-B1 | **B MAJOR** | `.grid2` = `minmax(0,1fr) 360px` ở cả hai hàng của Overview (chart 780 / Capital 360; Concentration 780 / Needs attention 360). Panel Capital chỉ là danh sách statements | `.exec-pf-grid2` = `repeat(2, minmax(0,1fr))`: chart 584 / Capital 584. Panel Capital còn chứa bảng 6 cột theo currency (`CapitalEnv`: Currency, Allocated, Max, Balance total, Free, Locked) trong `overflow-x:auto`. Ảnh 1440: cột FREE bị cắt ("FRE", "544,910.0"), cột LOCKED không thấy. Cùng bảng này đã nằm ở tab Allocations (`Allocations.tsx:162`) nên bị lặp | (1) `Overview.tsx:120` bỏ `envs.map(<CapitalEnv/>)` khỏi `CapitalCard`. (2) `portfolios.css .exec-pf-grid2 {grid-template-columns: minmax(0,1fr) 360px}`, giữ `@media (max-width:900px)` một cột (HIFI cũng dùng `.grid2` cho các tab Alphas, Risk, People) |
| T-B2 | **B MAJOR** | Statements chia hai nhóm có hàng tiêu đề `tr.grp`: "Cash flows" và "Budget · not cash"; hàng Net external flows và NAV in đậm | Một bảng phẳng 9 dòng, không nhóm, không in đậm, nhãn hàng thành chữ hoa (`th`). Mất thông điệp ngân sách không phải tiền mặt | `Overview.tsx` `CapitalCard`: chèn hai `<tr className="exec-pf-grp"><th colSpan={2}>Cash flows</th></tr>` và `Budget · not cash`; `.exec-pf-grp th {background: var(--paper-sunken); font: var(--exec-font-data); color: var(--ink-soft)}`; hàng tổng `font-weight:500` |
| T-B3 | B MINOR | KPI: giá trị mono 24px/32px; nhãn mono 11px; ô padding 12px 16px; các ô chung một lưới 1px (`gap:1px`, nền `--line-strong`) | `.exec-pf-kpi-value` dùng `--exec-font-num` 14px/20px (token `--exec-font-kpi` 24/32 có sẵn); ô padding 8px 12px, cách nhau 8px, mỗi ô tự có viền. Thêm hàng KPI "identity" (Alphas, Deployments, Accounts, Allocated) mà HIFI không có, đẩy chart xuống ~100px. "Allocated (current) 540,000.00" là số thật duy nhất nhưng nhỏ hơn HIFI 10px | `portfolios.css .exec-pf-kpi-value {font: var(--exec-font-kpi)}`; `.exec-pf-kpis {gap:1px; background: var(--line-strong)}`; `.exec-pf-kpi {padding: var(--space-3) var(--space-4)}` |
| T-B4 | B MINOR | Header: h1 + dòng phụ; bên phải: cờ Not scored, chip Fresh, Report pack (tắt, có dòng lý do), "Compare with…" (viền), "Actions" nút trung tính | Có thêm link "Portfolios" nhỏ phía trên h1, cờ ACTIVE, chữ "As of ..."; "Actions" dùng `data-variant="primary"` (nền xanh) trong khi HIFI chỉ dùng xanh cho nút xác nhận; Report pack không có dòng lý do (X3) | `index.tsx`: bỏ `data-variant="primary"` ở nút Actions; xem X3 |
| T-B5 | B MINOR | Panel chart: header có seg trái, nút Table / Expand / Export phải; nhãn HIGH và LOW trên đường; lưới ngang; trục Y số nguyên (-5,000); 6 mốc trục X; một dòng caption | Header chỉ có tên "Equity" + seg; thiếu Table / Expand / Export; không nhãn HIGH / LOW; trục Y 2 chữ số thập phân ("618,000.00" làm tốn ~50px); 4 mốc X; ba dòng caption rời nhau (`40 points...`, `Retained snapshots...`, `As of...`); vùng vẽ dừng cách mép phải ~78px vì pill giá cuối | Thêm nút Table / Expand / Export (Export tắt + lý do) vào `aside` của `EquityCard`; `EquityPanel`: nhãn trục `maximumFractionDigits:0` khi range lớn hơn 1.000 |
| T-B6 | B MINOR | Needs attention: mỗi mục là flag + chip link + link hành động căn phải + dòng meta, ngăn cách `border-bottom: var(--line-soft)` | Danh sách `ul.exec-pf-list`, mỗi mục một dòng, không ngăn cách | `Overview.tsx` `Attention`: dùng bố cục `.exec-pf-action-head` (đã có) |
| T-B7 | B MINOR | Môi trường Simulated hiện banner "Simulated capital. It is never added to Real-funded figures." ngay trên Overview | Chỉ có trong tab Allocations | `index.tsx`: render banner info khi `ctx.environments` có môi trường khác `live` |
| T-B8 | B MINOR | Tab: chữ có gạch chân 2px accent; padding 8px 16px; không nền | `.exec-pf-tab[aria-selected]` thêm nền `--accent-soft`; padding 6px 12px | `portfolios.css .exec-pf-tab`: padding `var(--space-2) var(--space-4)`, bỏ nền ở trạng thái chọn |
| T-B9 | B MINOR | (Mobile) bố cục thẻ, chart cuộn ngang tối thiểu 900px | 390px dùng được. Nhưng: dòng "Not published (FE-013, FE-025) · Drawdown needs the NAV series" bị cắt mép phải trong khung gạch chéo; nhãn trục X chồng nhau ("16 Oct 00:00Z17 Oct 00:00Z") | `EquityPanel`: thu nhãn trục X còn 2 mốc dưới 480px; khung drawdown `white-space: normal` |
| T-B10 | B MINOR | Gap dọc 24px, chart/capital đều `align-items:start` | gap 12px (X1) | Xem X1 |
| T-C1…4 | C | X4, X5, X6, và Actions rail dùng Drawer dock 380px (quyết định D-drawer, khớp HIFI `drawer.dock`) | | |

Đếm Portfolio 360: A = 11, B = 10 (MAJOR 2, MINOR 8), C = 4. Các mục chung X1, X3 nằm ở phần 0, không tính lại ở đây.

---

## 3. Compare (HIFI `compare.html`, `modules/compare.js`)

Ảnh: `cmp/compare.png`, `hf/compare-ok.png`, `hf/compare-nq.png`, `s1shots/compare-wide.png`, `-narrow.png`.

| # | Hạng | HIFI | Impl | Sửa nhỏ nhất |
|---|---|---|---|---|
| K-A1 | A | Chart chồng 2-4 chuỗi, readout theo ngày, nhãn cuối đường | Khung gạch chéo "Not available · Aligned series are Not published (FE-033)" | Không |
| K-A2 | A | Chế độ Return / Net PnL | Không có dữ liệu để vẽ (FE-033, FE-006, FE-005) | Không (control: xem K-B2) |
| K-A3 | A | Hàng NAV, Net PnL, Return, Max drawdown, Score có giá trị | "Not published (FE-013)", "(FE-005, FE-025)", "(FE-006, FE-025)", "(FE-013, FE-025)", "(FE-011)" | Không |
| K-A4 | A | Ô vuông "best in a row" và chú thích "Square marks the best in a row" | Không có (cần giá trị, FE-005, FE-006, FE-013) | Không |
| K-A5 | A | Tab "Alphas" bật được | Tắt kèm lý do (FE-033) | Không |
| K-A6 | A | 8 chip ứng viên (Hedge, Basis-Arb, Asia-Pool...) | Chỉ 6 chip vì read trả 6 trên 9 (không cursor, FE-044) | Không |
| K-A7 | A | Phụ đề "Modified Dietz" | "identity and scalars only"; phương pháp theo nguồn (FE-006) | Không |
| K-B1 | B MINOR | Chip chọn nằm trong một `.panel` có header chứa seg Portfolios / Alphas (trái) và seg Return / Net PnL (phải) | Toolbar trần trên nền trang: seg Portfolios / Alphas + ô "Filter portfolios" + chữ "Window 90D"; không panel | `compare.css`: bọc `section.exec-pf-panel` bằng cùng kiểu panel đề xuất ở P-B5 |
| K-B2 | B MINOR | Seg Return / Net PnL luôn hiển thị (kể cả nq) | Không có | `compare/index.tsx`: thêm seg 2 nút tắt với `title=npReason(PF_FE.compareSeries, ...)` |
| K-B3 | B MINOR | Chip: mono 12px/500, ô vuông 10px; khi chọn: viền màu chuỗi + `box-shadow: inset 0 -2px 0 var(--c)`; chip không so được: gạch chéo + đường đứt, in lý do trong chip ("Other currency", "Return not available") | Chip chọn: viền `--ink-soft` + nền `--paper-raised`, không vạch màu chuỗi; chip không so được: nền phẳng + đường đứt; chip khác currency (Yen-Carry JPY) trông như chip thường, lý do chỉ có trong `title` và trong panel Partitions. Glyph hình tròn / thoi / tam giác là phần thêm có chủ ý cho a11y, giữ nguyên | `compare.css .exec-cmpr-chip[aria-pressed="true"] {border-color: var(--c); box-shadow: inset 0 -2px 0 var(--c)}` (đặt `--c` từ `data-tone`); `.exec-cmpr-chip[disabled] {background-image: repeating-linear-gradient(135deg, transparent 0 5px, var(--line) 5px 6px)}`; in `<small>` lý do khi `!row.comparable` |
| K-B4 | B MINOR | Không có panel "Partitions"; luật partition thể hiện bằng chip tắt. Chart bắt đầu y≈300 | Panel "Partitions" thêm ~160px; chart bắt đầu y≈515. Không tìm thấy quyết định ghi trong `review2/00-decision-register.md` cho panel này | Cần chủ xác nhận. Nếu giữ thì thu thành một dòng tóm tắt trong header panel "Series" |
| K-B5 | B MINOR | Header cột metric có ô màu chuỗi; cột số căn phải, mono (`th.n`); thứ tự hàng NAV, Net PnL, Return, Drawdown, Score | `numeric:false` nên mọi cột căn trái; header không có ô màu nên không nối được cột với màu chip; 6 hàng identity (Base currency, Owner, State, Domain, Allocations, Deployments) đứng trước 6 hàng số liệu. Hàng thêm có dữ liệu thật nên chấp nhận, nhưng nên đặt sau | `compare/index.tsx`: `numeric: true` cho cột portfolio, thêm `<i className="exec-cmpr-sw" data-tone=...>` vào nhãn cột, đưa `METRICS` số liệu lên trước |
| K-B6 | B MINOR | Gap 24px | gap 12px (X1) | X1 |
| K-C1…3 | C | X4, X5; "Back to Portfolios" đặt ở cụm bên phải cạnh chip fresh thay vì cạnh tiêu đề; kết quả khớp HIFI | | |

Mobile 390: dùng được. Chip xuống dòng gọn; thẻ metric đầy đủ, không bảng bị cắt, ô lọc và seg với tới được.

Đếm Compare: A = 7, B = 6 (MAJOR 0, MINOR 6), C = 3.

---

## 4. Alpha 360 (HIFI `alpha.html`, `modules/spine.js`)

Ảnh: `cmp/alpha-360.png`, `hf/alpha-ok.png`, `hf/alpha-nq.png`, `s1shots/alpha-360-wide.png`, `-narrow.png`.

| # | Hạng | HIFI | Impl | Sửa nhỏ nhất |
|---|---|---|---|---|
| L-A1 | A | Lifecycle: ngày trong stage ("40 D IN STAGE"), thanh tiêu chí 7/7, người quyết định, ngày thoát | Sáu thẻ đều "? UNKNOWN" gạch đứt, "Not published (FE-027/028)"; chỉ Live "NOW" có thật | Không (FE-027, FE-028) |
| L-A2 | A | Meta: "Run 12 Jul · Evidence revision 2" | "Run Not published (FE-029) · Evidence Not published (FE-029)" | Không |
| L-A3 | A | KPI Net PnL actual (+4,120.80, "90D requested · 10D effective"), Return +3.43%, Max drawdown -2.05% | Net PnL current (+1,120.80, vị thế hiện tại), Exposure current, Return và Max drawdown là Np (FE-006, FE-025) | Không |
| L-A4 | A | Tile Regime fit (flag INSUFFICIENT DATA) và tab Regime Fit có nội dung | Chỉ có tab với "Not evaluated" (FE-011) | Không (xem L-B4 cho tile) |
| L-A5 | A | Chart Net PnL Modified Dietz + drawdown -2.1%, "90D requested · 10D effective" | Chuỗi equity (21 điểm, có gap), drawdown gạch chéo "Not published (FE-025)", "Windowed return: Not published (FE-006)" | Không |
| L-A6 | A | Cost drag: thanh Fees -388, Funding -224 | "Fees and funding: Not published (FE-025) Per-alpha attribution"; Slippage "Not available" (đúng như HIFI) | Không |
| L-A7 | A | Contribution by venue (Binance +4,121) | Contribution theo deployment (position PnL hiện tại, không cửa sổ); không có phân rã theo venue trong resource (chưa có mã FE riêng; gần nhất FE-025) | Không |
| L-A8 | A | Forward observation: thanh 70D và 10D, Mixed return | "Not published (FE-029)", "(FE-011)" | Không |
| L-A9 | A | Facet "Forward simulated" và "Research OOS" có bảng | Ba facet có seg, nội dung theo dữ liệu có; đường dẫn Paper / Sandbox theo FE-029 | Không |
| L-B1 | B MINOR | Tab: Performance, Deployments, Research Evidence, **Regime Fit**, Orders & Fills, Activity & Decisions; "More ▾" chứa Trade Replay (liên kết tới trang riêng), Positions, Reconciliation | Tab: Performance, Deployments, Research Evidence, Orders & Fills, Activity & Decisions, **Trade Replay**; "More" chứa Regime Fit, Positions, Reconciliation (`alpha/model.ts` `ALPHA_TABS`, `ALPHA_MORE_TABS`). Có ghi chú FE-054 (không có route riêng cho replay) nhưng đảo thứ tự so với HIFI | `model.ts`: đổi chỗ `regime` và `replay` giữa hai mảng; replay vẫn mở bằng `?tab=replay` |
| L-B2 | B MINOR | Thẻ spine: `min-height:168px`; có tên stage in hoa mono, ô màu stage (Paper tím, Sandbox vàng, Canary viền đỏ, Live đỏ), chevron nối giữa các thẻ (`.sp-nd::after`), thanh tiêu chí 8px | Thẻ cao ~205px (nội dung); sáu thẻ lặp "Not published (FE-027/028)" in đậm 13px rồi "Stage history" bên dưới; không có chevron nối; ô màu stage chỉ có ở danh sách deployment bên dưới (`.exec-alp2-stage`), không có trên thẻ | `blocks/JourneySpine.tsx` + `blocks.css`: thêm `::after` chevron, ô màu stage trong `.g`; rút gọn Np trong thẻ về "Not published" + chú thích FE một lần dưới spine |
| L-B3 | B MINOR | Không có seg môi trường ở hàng tab (HIFI dựa vào thanh Context) | Seg "Real-funded / Paper / Sandbox" ở cuối hàng tab, lặp với thanh Context phía trên | `alpha/index.tsx` dòng ~293: chỉ hiện khi `deployed.length > 1` (đã vậy) và gắn nhãn "Book" để phân biệt với Context |
| L-B4 | B MINOR | Tile thứ 4 "Regime fit" (flag + "Separate from score · Open") | Không có tile; thay bằng Exposure current | `alpha/index.tsx` dải KPI: thêm tile "Regime fit" = `Np FE-011` + link "Open" sang tab Regime Fit |
| L-B5 | B MINOR | Contribution / Cost drag dùng `.grid2` = `minmax(0,1fr) 360px` (780 / 360) | `.exec-alp2-grid2` = `1fr 1fr` (580 / 580) | `alpha.css .exec-alp2-grid2 {grid-template-columns: minmax(0,1fr) 360px}` (áp cho `PerformanceTab.tsx:171`; `TableTabs.tsx:109` có thể giữ 1fr 1fr nếu cần) |
| L-B6 | B MINOR | Chart: header chỉ có seg Actual / Forward simulated / Research OOS và chữ phải; nhãn trục Y số nguyên; một dòng caption | Header có thêm tiêu đề "Equity"; trục Y "41,000.00" 2 chữ số; 3 hàng caption + thông báo ("21 points, none reduced · 1 gap...") | `PerformanceTab.tsx`: bỏ tiêu đề trùng; gộp caption thành một `.exec-alp2-cap` |
| L-B7 | B MINOR | Forward observation: lưới 2 cột (Forward / Actual) với số 24px "70D" / "10D" + thanh stage (gạch chéo tím / vàng, đặc đỏ) | Bảng key-value một cột, nhãn in hoa (FORWARD AND ACTUAL DAYS...). Thiếu khung hai số và thanh dù có thể vẽ khung rỗng | `PerformanceTab.tsx` Forward panel: dựng `.duo` hai cột, mỗi cột "Not available" 16px + lý do |
| L-B8 | B MINOR | Link quay lại "← Alpha Fleet results" (12px/16px, accent); gap 24px | "Back to Alpha Fleet"; gap 16px (X1) | Đổi nhãn; X1 |
| L-B9 | **B MAJOR** | (Mobile) Seg Actual / Forward simulated / Research OOS đọc được; thẻ spine 2 cột (HIFI: `repeat(2, minmax(0,1fr))` ≤660) | 390px: nút "Actual" vỡ chữ giữa từ ("Actu / al"), "Forward simulated" và "Research OOS" xuống 2-3 dòng; trong thẻ spine mã tham chiếu bị bẻ ("(FE-" xuống dòng "027/028)"); hàng tab xuống hai dòng, "More" lẻ loi | `alpha.css .exec-alp2-segbtn {white-space: nowrap}` + `.exec-alp2-filter {overflow-x:auto; flex-wrap:nowrap}` dưới 660px; `Np` trong thẻ: `white-space: nowrap` cho phần `(FE-xxx)` |
| L-B10 | B MINOR | Chi tiết stage trong panel con "LIVE · NOW" có thanh tiêu đề | Hộp "Live [CURRENT]" viền mảnh, không thanh tiêu đề; nội dung là danh sách deployment (thêm so với HIFI, có dữ liệu thật) | `alpha.css .exec-alp2-stage-wrap`: dùng `SectionPanel` nhỏ |
| L-C1…4 | C | X4, X5, X6 (seg "Preview stage"), chip "Identity only" của HIFI nq không dùng vì impl có dữ liệu thật | | |

Đếm Alpha 360: A = 9, B = 10 (MAJOR 1, MINOR 9), C = 4.

---

## 5. Alpha Replay (HIFI `trade-replay.html`, `modules/trade-replay.js`)

Ảnh: `cmp/alpha-replay.png`, `hf/trade-replay-ok.png`, `hf/trade-replay-nq.png`, `s1shots/alpha-replay-wide.png`, `-narrow.png`.

Lưu ý quan trọng: ảnh impl chụp **tab Trade Replay bên trong Alpha 360** (`?tab=replay`), không phải trang độc lập. Trong code có trang độc lập `screens/alpha/replay/index.tsx` (h1 "Trade Replay", chip), không thấy nơi gắn route cho nó khi tìm theo tên (`REPLAY_SCREEN_KEY`), nên chưa thể xác nhận bằng hình. Phần header của trang độc lập chỉ đối chiếu bằng code (R-B8).

| # | Hạng | HIFI | Impl | Sửa nhỏ nhất |
|---|---|---|---|---|
| R-A1 | A | Dải sự kiện dưới nến: ba làn STAGE / DECISION / INCIDENT (khái niệm C3) | Không có | Chờ FE-031 |
| R-A2 | A | Cột Fee có "No fill yet"; cột Result bằng lời | Fee "fee not published" khi thiếu; Result không có (cột Note là trạng thái thô) | Chờ FE-052 (fee, filled qty từng đơn); phần chữ thô xem R-B2 |
| R-A3 | A | Hộp TP/SL ghép theo bracket | Ghép theo thời gian ("order_brackets not published — boxes paired by time (DERIVED)") | Chờ FE-052 (bracket legs có `order_id`) |
| R-A4 | A | Nến mở theo mọi symbol | Nến chỉ từ venue public klines ("Trading System candles: Soon") | Không |
| R-B1 | **B MAJOR** | Trang riêng: tiêu đề + chip, rồi panel Candles bắt đầu y=325 (chart trong màn đầu tiên) | Tab nằm dưới panel Lifecycle (~210px) + dải KPI (~90px) + header (~110px) của Alpha 360: panel chart bắt đầu y≈830 ở màn 1440×900, tức nằm dưới nếp gấp; người dùng đi từ Blotter ("open on chart") phải cuộn gần một màn mới thấy nến | `alpha/index.tsx`: khi `tab === "replay"` chỉ render header + tab bar + `ReplayView` (bỏ `LifecyclePanel` và dải KPI); hoặc mount `replay/index.tsx` cho `?tab=replay` |
| R-B2 | **B MAJOR** | Nhật ký giao dịch bằng lời thường: Event "Armed / Fill / Submit / Cancel", Type·Side "Take profit · Buy", Result "Entry filled", "Waiting for the price", "Sent to venue", "Cancelled with its pair"; id lệnh là chip link (`ord-b7a2b7`) | Hiện mã thô: "MARKET GTC · SELL", "STOP_MARKET GTC reduce_only · SELL", "TAKE_PROFIT_MARKET GTC", "LIMIT GTC · BUY", cột Note "UNKNOWN · no venue_order_id", "PARTIALLY_FILLED", "NEW", "FILLED"; ô Order gộp "ord ord_007 · ENTRY" / "fill fill_003 · ord ord_004.ENTRY" | Ánh xạ trạng thái và loại lệnh sang lời trong lớp dựng hàng của `components/TradeReplayEvents` (hoặc ở `blocks/ReplayPanel.tsx`): bảng `ORDER_TYPE_WORD`, `RESULT_WORD`; tách ô Order thành chip id + cột Leg |
| R-B3 | **B MAJOR** | Mobile ≤660: `table.cards` xếp thành thẻ | 390px: bảng nhật ký không thành thẻ; các cột sau Order (Type, Qty, Price, Fee, Note) bị cắt ngoài mép, chỉ thấy TIME / EVENT / ORDER | Gắn `CardsTable` hoặc cùng quy tắc `@media (max-width:660px)` của `cards.css` cho bảng log trong `ReplayPanel` |
| R-B4 | B MINOR | Dưới chart: một hàng chú giải biểu tượng (Long entry, Long exit, Short entry, Short exit, Take-profit line, Stop-loss line) + dòng readout "Last candle / Fills in view / Step ← →"; phần cách dựng nằm trong `<details>` đóng "How this is built" | Khối chú giải + provenance ~120px, năm dòng mono nhỏ ("source:", "groups:", "orders ⋈ fills...", "charting: TradingView...") nằm mở ngay dưới chart | Bọc khối provenance trong `<details>` ở `ReplayPanel.tsx`; giữ một hàng chú giải |
| R-B5 | B MINOR | Nến lên: rỗng viền xanh `--series`, nến xuống: đặc xám; marker long `--series-2`, short `--series-dd` ("không dùng xanh lá / đỏ"); trục Y co theo nến + 12% | Nến xanh lá / đỏ mặc định của TradingView Lightweight Charts (disposition cho "REUSE nguyên"); trục Y bao cả TP 68,500 và SL 66,100 nên thân nến chỉ ~2px, gần như đường phẳng ở 67,193 | Cấu hình series colour trong `components/TradeReplayChart` (upColor, downColor) theo token; để autoscale theo nến, đặt TP / SL không ép phạm vi |
| R-B6 | B MINOR | Một thanh điều khiển: Symbol (select), Interval (select) | Hai lớp: bốn chip (Symbol, Interval, Book, Account) rồi lại thanh chọn trong chart (acct, BTCUSDT, BINANCE USDM, 1h) + thanh công cụ + − ◀ ▶ Fit Expand | `ReplayPanel.tsx`: bỏ chip Symbol và Interval trùng với select trong chart |
| R-B7 | B MINOR | Cột thời gian "17 Oct 10:05:00Z" một dòng; có nút "Show all 35 events" khi quá 10 hàng | "Oct 16 20:01:30" xuống hai dòng, không có "Z"; hàng đầu "02:00:00.000" không có ngày; cột Fee "fee not published" xuống hai dòng | Định dạng `dd Mon HH:mm:ssZ` `white-space:nowrap`; cột Fee rút còn "No fill yet" khi không có fill (đủ dữ liệu để phân biệt) |
| R-B8 | B MINOR | Header trang độc lập: chip BTC-Trend v3, Deployment, Account, chip "Fresh · 12:00Z" | `replay/index.tsx`: chỉ chip link alpha + Flag tên book; không link Deployment, Account hay chip độ tươi | Thêm hai link và `freshnessFlag` (đã có ở Portfolios) |
| R-C1…4 | C | X4, X5, X6 (`.dstrip`, nhãn "Sample data"); engine TradingView Lightweight Charts + chú ghi công (V1 REUSE theo `V1_SUBSCREEN_DISPOSITION.md`) | | |

Đếm Alpha Replay: A = 4, B = 8 (MAJOR 3, MINOR 5), C = 4.

---

## 6. Kiểm tra 390px

| Màn | Dùng được? | Bảng bị cắt? | Control với tới được? | Ghi chú |
|---|---|---|---|---|
| Portfolios | Có | Không (thẻ) | Có | Thẻ đầu tiên chỉ bắt đầu ở y≈820 (ba banner + 7 control); cờ mixed-book chạm mép phải |
| Portfolio 360 | Có | Không (thẻ) | Có | Khung drawdown cắt chữ; trục X chồng nhau |
| Compare | Có | Không | Có | Tốt, không vấn đề lớn |
| Alpha 360 | Một phần | Không | Có nhưng khó đọc | L-B9: seg bị vỡ chữ, mã FE bị bẻ giữa chừng |
| Alpha Replay | Một phần | **Có**: nhật ký cắt cột | Có (+ − Fit Expand) | R-B3; chú giải mono nhỏ rất dài |

---

## 7. Tổng kết

| Màn | A DATA_ABSENT | B MAJOR | B MINOR | B tổng | C |
|---|---|---|---|---|---|
| Portfolios | 7 | 1 | 8 | 9 | 4 |
| Portfolio 360 | 11 | 2 | 8 | 10 | 4 |
| Compare | 7 | 0 | 6 | 6 | 3 |
| Alpha 360 | 9 | 1 | 9 | 10 | 4 |
| Alpha Replay | 4 | 3 | 5 | 8 | 4 |
| Tổng | 38 | 7 | 36 | 43 | 19 |

Các mục chung X1…X6 ở phần 0 (nhịp dọc, padding main, lý do nút tắt, casing, vỏ portal, thanh preview) không tính vào bảng trên, trừ những dòng đã nhắc lại ở từng màn (T-B10, K-B6, L-B8 trỏ về X1; X3 xuất hiện ở T-B4) và C đã đếm theo màn.

### Năm sửa MAJOR quan trọng nhất, theo mức ảnh hưởng tới người dùng

1. **P-B1, Portfolios: bảng rộng ~2.340px trên khung 1.180px.** Năm cột quyết định bị cắt. Sửa: ẩn Domain mặc định, padding ô 5px, th xuống dòng, Np hai dòng (`portfolios.css`, `PortfolioTable.tsx`, `readHidden`).
2. **T-B1, Portfolio 360: lưới Overview 1fr / 1fr làm bảng vốn theo currency bị cắt (Free cụt, Locked mất) và lặp với tab Allocations.** Sửa: bỏ `CapitalEnv` khỏi `Overview.tsx:120`, đặt `.exec-pf-grid2` thành `minmax(0,1fr) 360px`.
3. **R-B2, Replay: nhật ký giao dịch hiện mã thô (`STOP_MARKET GTC reduce_only`, `PARTIALLY_FILLED`, `UNKNOWN · no venue_order_id`).** HIFI dùng lời thường. Sửa: ánh xạ loại lệnh và trạng thái sang lời, tách chip id lệnh.
4. **R-B3, Replay trên 390px: bảng nhật ký bị cắt cột, không thành thẻ.** Sửa: dùng quy tắc `cards.css` cho bảng log.
5. **T-B2, Portfolio 360: statements không có nhóm "Cash flows" / "Budget · not cash".** Mất thông điệp ngân sách không phải tiền mặt. Sửa: thêm hai hàng nhóm trong `Overview.tsx` `CapitalCard`.

Hai MAJOR còn lại, xếp ngay sau top 5: **R-B1** (replay nằm dưới Lifecycle và KPI, chart ở dưới nếp gấp; chỉ render header + tab + replay khi `tab === "replay"`) và **L-B9** (Alpha 360 trên 390px: nút seg vỡ chữ "Actu/al", mã FE bị bẻ).
