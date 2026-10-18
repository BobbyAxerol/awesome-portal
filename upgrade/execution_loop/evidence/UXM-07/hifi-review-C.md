# UXM-07 · Rà HIFI v2 so với implementation, nhóm C

Phạm vi: accounts, account-360 (hi-fi `account.html`), blotter, admin, users, access. Chỉ đọc code; file này là sản phẩm duy nhất. Ngày rà: 2026-10-18.

## 0. Cách đọc

- LEFT = HIFI v2 ở chế độ `not qualified`; RIGHT = implementation ở 1440px; cấu trúc đầy đủ lấy từ `hf/<page>-ok.png`. Số đo HIFI đọc từ `kit.css` và `<page>.html`; số đo implementation đọc từ `v2/css/*.css`, `cards.css`, `blocks.css`, `execution.css` (type roles) và đối chiếu bằng ảnh `s1shots/*`.
- Phân loại: **A** DATA_ABSENT (kèm FE id trong `FRONTEND_BACKEND_SYNC.md` hoặc `backend-requests.md`), **B** FIDELITY (MAJOR hoặc MINOR, kèm fix nhỏ nhất), **C** INTENTIONAL.
- Account 360 hiển thị bình thường trong ảnh (không phải trang access-denied). Dữ liệu là fixture `_TEST_ONLY` (id kiểu `pf_core`, `acc_bnc_core`) ở trạng thái stale, nên một số khác biệt về tên hiển thị đến từ fixture, không phải từ code.
- Giá trị token: `--space-1..5` = 4/8/12/16/24px; `--exec-font-title` 400 24/32 sans; `subtitle` 400 14/20; `section` 600 15/22; `body` 400 13/20; `control` 500 13/18; `th` 500 11/16 sans; `data` 400 12/18; `num` 400 14/20 mono; `kpi` 400 24/32 mono; `meta` 400 12/16 sans; `id` 400 12/16 mono; `caption` 400 11/14 sans; `label` 500 11/16 mono. Các role này chỉ tồn tại dưới `.exec-surface` hoặc `[data-theme="operations-carbon"]` (`execution/execution.css:47`).

## 1. Phát hiện dùng chung (đếm riêng, không cộng vào từng màn)

| ID | Lớp | Mức | HIFI | Implementation | Fix nhỏ nhất |
|---|---|---|---|---|---|
| S1 | B | MINOR | `.tabs button` mono 500 12/18, in hoa, `letter-spacing .06em`, padding 8/16. `.ph` mono 500 11/16 in hoa `.12em` trên nền sunken, cao 34px. `.kpi .l` mono in hoa `.1em` | Tab dùng `--exec-font-control` (sans 13/18, không in hoa, padding 6/12). Tiêu đề panel `.exec-blk-ph-title` dùng `--exec-font-label` (mono 11/16, không in hoa, không giãn chữ). KPI label cũng vậy. Lý do là quy tắc vệ sinh CSS "no uppercase" của v2 (`v2Hygiene.test.ts`), không phải quyết định thiết kế | Thêm `text-transform:uppercase; letter-spacing:.1em` vào `.exec-blk-ph-title`, `.exec-blk-kpi-label`, `.exec-acct-tab`, và đưa các selector đó vào allowlist của `v2Hygiene.test.ts` |
| S2 | B | MINOR | `main{padding:24px}`: khối đầu trang cách ctxbar 24px | `ContextBar` và `h1`/`header` của màn dính nhau (0 đến 1px, thấy ở accounts, account-360, blotter, admin). Chip freshness nằm sát đường viền ctxbar | Thêm `margin-bottom: var(--space-4)` cho wrapper của `ContextBar` trong shell, hoặc `padding-top` cho root của từng màn (shell, cần Bobby/Codex đồng ý vì chạm shell chung) |
| S3 | B | MINOR | `.stack{gap:24px}` | `.exec-blk-demoted` (`blocks.css:140`) là block thường, không có gap. Mọi `StateBoundary` ở trạng thái partial hoặc stale làm các con liền nhau 0px (xem B-A360-1) | `.exec-blk-demoted{display:flex;flex-direction:column;gap:var(--space-3)}` |

Shared C (không cần sửa): chrome shell (brand, breadcrumb, selector Workspace/Execution Carbon, nav gom nhóm khác HIFI), ContextBar nằm trong vùng nội dung thay vì full-width, dải "Design preview" và role/data switcher của HIFI, chuỗi "Window applies when the server supports it" (FE-025, FE-041).

## 2. Accounts

| ID | Lớp | Mức | HIFI vs implementation | Fix / FE |
|---|---|---|---|---|
| ACC-A1 | A | | Tên hiển thị binding ("Binance main") và đếm sleeve dưới cột Account ("3 sleeves"). Implementation in `bindingId` (`bnc_main@BINANCE`) và `accountId`; `BindingItem` không có label hay số sleeve | FE-050 (nguồn sibling sleeves của binding chung; `GET /broker-bindings`) |
| ACC-A2 | A | | Ba cột Physical equity, Σ Virtual · Headroom, Check: cả HIFI nq lẫn implementation in `Not available` + lý do. Implementation ghi "Read per binding" vì số nằm ở drawer | FE-050, FE-051 (A360-n) |
| ACC-A3 | A | | Đếm theo lens trên tab (All 6, Issues 3, Real-funded 4, Paper 1, Testnet 1) và tab "All environments": implementation chỉ đếm tab đang mở, tab All bị `aria-disabled` | ELP2-REQ-FE-014 (cross-env "All") |
| ACC-A4 | A | | Drawer thiếu Product, Margin mode, Environment proof ("Mainnet · 17 Oct 09:12Z") | FE-051 (A360-4), FE-050 |
| ACC-A5 | A | | Export disabled (HIFI cũng disabled) | FE-016 |
| ACC-B1 | B | MINOR | Cột Updated: HIFI là chấm vuông (warn khi >=30 phút) + "14 min ago" / "3 h ago"; implementation in giờ tuyệt đối "17 Oct 09:00Z", mất tín hiệu quá hạn | `AccountsList.tsx` cột `updated`: dùng `ageAtRead` (đã có trong `model.ts`) + `.dot` theo ngưỡng 30 phút |
| ACC-B2 | B | MINOR | Lý do Export: HIFI hiện chữ "Export is not available yet · My access" dưới nút. Implementation chỉ có `title` và text `sr-only`, người dùng bàn phím/cảm ứng không thấy lý do | `AccountsList.tsx`: thêm `<span className="exec-acct-note">` hiển thị `notPublished(FE.export)` cạnh nút |
| ACC-B3 | B | MINOR | Lens Issues: HIFI là tab có đếm. Implementation là nút bật/tắt "Issues only" không có số | Thêm đếm trên loaded rows vào nhãn nút ("Issues only 2 loaded"), hoặc giữ nhưng ghi chú trong tooltip; không cần redesign |
| ACC-B4 | B | MINOR | Chip freshness: HIFI là chip `chipx` (chấm + "Stale 14m") trong `.mast .ctrls`, căn đáy. Implementation: Flag "AGING" + "As of 17 Oct 09:00Z · Live environment", căn đỉnh, dính ctxbar (S2) | `account.css` `.exec-acct-head{align-items:flex-end}` |
| ACC-B5 | B | MINOR | Thanh công cụ: HIFI đặt Export bên phải (`.grow`). Implementation để tất cả bên trái, thêm "Issues only" | `.exec-acct-tool` thêm spacer `margin-left:auto` cho Export |
| ACC-B6 | B | MINOR | 390px: ô Search bị cắt placeholder ("Search binding or acco") vì chia dòng với select Venue (rộng 168px) | `account.css` `@media(max-width:660px){.exec-acct-field:first-child{flex:1 1 100%}}` |
| ACC-B7 | B | MINOR | Bảng chuỗi chữ: HIFI tên binding đậm 600 + dòng phụ 12/16; implementation 500 + `caption` 11/14. Giá trị trong ô số 14px mono so với 12px của HIFI | `.exec-acct-name`, `.exec-acct-sub` dùng `--exec-font-data` |
| ACC-C1 | C | | Nhãn nav "Accounts & Bindings" và breadcrumb "Deployments / Accounts & Bindings" | Shell |
| ACC-C2 | C | | Lens tên "Sandbox" thay "Testnet", tab theo context bar chứ không theo lens trong trang | Quyết định G2 (domain naming) |
| ACC-C3 | C | | Mục `<details>URL` của HIFI không có; URL là state | `useExecUrlState` |
| ACC-C4 | C | | Dải Design preview, role switcher, chip "USDT · one basis" và "Scope" trên ctxbar HIFI | Shell |
| ACC-C5 | C | | Banner "Source not qualified" chỉ hiện khi `completeness != COMPLETE` (data-driven), không cố định như HIFI nq | Reader |

Narrow 390: dùng được. Bảng chuyển thành card, không bị cắt; tab "All environments" cuộn ngang trong `.exec-acct-tabs`; nút Export, Issues, select đều với tới được. Chỉ lỗi ACC-B6.

Đếm Accounts: A 5, B MAJOR 0, B MINOR 7, C 5.

## 3. Account 360

| ID | Lớp | Mức | HIFI vs implementation | Fix / FE |
|---|---|---|---|---|
| A360-A1 | A | | KPI Budget: HIFI "80,000.00 / 100,000.00 Budget used / approved". Implementation `Not published (FE-017)` | FE-017 |
| A360-A2 | A | | Margin ratio `Not published (A360-2)`; Long / Short / Gross theo side `Not published (A360-1)` (cả ở KPI PM capital và tab Positions); credential alias/scopes (A360-3); product (A360-4) | FE-051 |
| A360-A3 | A | | KPI Native custody: HIFI headline Wallet balance 412,880.25 + Native equity 414,010.40. Implementation headline Buying power 301,100.00 và `Native equity: Not available / Venue field not reported`; Triad broker `Wallet balance` là `Not computed` | FE-050 (`buying_power`/`synced_at`, field wallet và equity) |
| A360-A4 | A | | Equity: thiếu dải Drawdown, nhãn HIGH/LOW, readout "Δ WINDOW +777 · DRAWDOWN −0.4%"; implementation chỉ có Change in window và 5 điểm có 1 khoảng trống vẽ hatch | FE-013 (chuỗi thời gian), FE-025 (window); drawdown không phải field đã publish (chưa có FE id riêng, cân nhắc thêm vào FE-013) |
| A360-A5 | A | | Tab Fees & funding theo cửa sổ 90D: implementation `Not published (FE-025)`; kèm hàng "current source row" | FE-025 |
| A360-A6 | A | | Tab Activity cột Actor và Receipt: không có nguồn | FE-021, FE-031 |
| A360-A7 | A | | Tên hiển thị portfolio / deployment ("Core", "Live deployment") là `pf_core`, `dep_btc_live` trong ảnh (một phần do fixture) | Chưa có FE id riêng; gần nhất FE-050; cần xác nhận với Codex |
| A360-B1 | B | MINOR | Khoảng cách panel Identity với thanh tab: 0px (thấy rõ trong ảnh, tab "Overview" dính đáy panel). HIFI `.stack` gap 24px. Do S3 và do `.exec-acct-v2 gap:var(--space-3)` (12px) | `blocks.css` `.exec-blk-demoted` flex+gap (S3); `account.css:3` đổi gap sang `var(--space-5)` |
| A360-B2 | B | MINOR | Hàng dữ kiện: HIFI `.dl` lưới 140px / 1fr, `dt` 12/20 faint, giá trị căn trái, gap 6/12. Implementation `.exec-acct-fact` là flex `space-between`, giá trị dạt sát mép phải panel (xa nhãn ~500px, khó dò hàng) | `account.css` `.exec-acct-fact{display:grid;grid-template-columns:140px minmax(0,1fr)}`, `dd{text-align:left}` (giữ cột đơn ở 660px như HIFI 110px) |
| A360-B3 | B | MINOR | Đầu trang: HIFI `align-items:flex-end`, ba điều khiển (Sleeve/Physical seg, chip freshness, flag Reconciling). Implementation căn đỉnh, 6 điều khiển (thêm currency select, Broker sync, Active, Refresh) nên chiếm cả hàng và đè lên hàng back-link | `.exec-acct-head{align-items:flex-end}`; Refresh nên chuyển sang menu phụ, không bắt buộc |
| A360-B4 | B | MINOR | Banner "Shared account": HIFI tông cảnh báo (`.banner` nền `#302608`, chữ và viền `--warn`). Implementation tông trung tính (`surface-2` + `line-strong`) nên không nổi bật là cảnh báo | `Account360.tsx:269` thêm `data-tone="stale"` cho banner shared; `account.css` đã có rule `[data-tone="stale"]` |
| A360-B5 | B | MINOR | Khối "Stale · The source gave no reason." (50px) do `StateBoundary` tự chèn khi stale không có lý do, lặp lại chip freshness trên đầu; HIFI không có | `blocks/StateBoundary.tsx:44` bỏ dòng PanelState khi `given === undefined` và đã có chip freshness (hoặc truyền `lastGood`) |
| A360-B6 | B | MINOR | Panel "Account equity" có hai tiêu đề (`.ph` và tiêu đề 15px 600 bên trong chart); HIFI chỉ có `.ph`. Nhãn trục Y 2 chữ số thập phân ("88,400.00") là quy tắc exact (C) | `readPanels.tsx` `EquityBlock`: bỏ `title` của chart |
| A360-B7 | B | MINOR | Panel Physical binding (sleeve view): thiếu hàng Product (HIFI có, dù nq là "Not available"); có thêm hàng Credential (HIFI chỉ ở view physical) và nút "Open physical binding view" nằm sát dưới hàng Credential, 0px margin | `Account360.tsx:176` thêm `<Fact label="Product"><Np fact={FE.product}/></Fact>`; nút thêm `margin-top:var(--space-3)` hoặc bỏ vì đã có seg |
| A360-B8 | B | MINOR | Tab: "Positions" thay "Positions & orders", "Fees and funding" thay "Fees & funding". Bảng Positions không có cột Open orders của HIFI | `TABS` trong `model.ts`; cột Open orders cần xác nhận nguồn (nếu `open_orders` có trong profile thì thêm cột) |
| A360-C1 | C | | `Native account`: "Withheld. The portal never shows the broker account reference." thay "Sub-account …4f2a" | Quyết định che tham chiếu broker |
| A360-C2 | C | | Cột Native attribution "Not computed / Native balance spans all sleeves" thay "Not available / No source" (R10: không chia balance native cho sleeve) | R10 |
| A360-C3 | C | | Back link, breadcrumb `acc_bnc_core`, nhãn nav | Shell |
| A360-C4 | C | | Currency select khi ledger đa tiền tệ; không cộng chéo tiền tệ | Quy tắc no cross-currency sum |

Narrow 390: dùng được. Header xếp dọc, seg/select/flag đều với tới; tab cuộn ngang ("Fees and fundin…" bị cắt nhưng là vùng cuộn như HIFI); bảng thành card; chart rút còn một nhãn trục X (chấp nhận được). Panel Physical binding dài hơn HIFI do Native account chiếm 3 dòng.

Đếm Account 360: A 7, B MAJOR 0, B MINOR 8, C 4.

## 4. Blotter

| ID | Lớp | Mức | HIFI vs implementation | Fix / FE |
|---|---|---|---|---|
| BLT-A1 | A | | Cột Deployment, và các chip scope server-side (`deployment`, `account`, `alpha`, "Add scope…"): scope chỉ lọc trên loaded rows; implementation không có select "Add scope…" | FE-052 (lọc stage/deployment/account/alpha trong `BlotterQuery`) |
| BLT-A2 | A | | Filled/Qty, Avg price, Slippage, Fee (USDT) từng đơn (3 trong 10 cột mặc định của HIFI). Implementation bỏ cột, chỉ có caption "Not in this read" | FE-052 |
| BLT-A3 | A | | Order funnel: HIFI dải 4 KPI theo scope (Submitted 96, Risk grant 91, Venue acknowledged 87, Filled 66). Implementation chỉ có đường đi theo từng đơn khi mở dòng | FE-052 (aggregate theo scope, ý gần nhất; cân nhắc id mới cho funnel counts) |
| BLT-A4 | A | | Chip trạng thái: HIFI All/Working/Conditional/Filled/Partial/Rejected/Cancelled; implementation All/Open/Partial/Filled/Rejected (`BlotterQuery` chỉ có các bucket này) | FE-052 |
| BLT-A5 | A | | Chip stage "Live, Canary from context bar" và cửa sổ 90D: implementation chip "environment Paper this read" trong khi ctxbar sáng "Real-funded"; subtitle ghi "Paper profile, current retained window". Trung thực nhưng ngữ cảnh và dữ liệu lệch nhau | FE-052 (stage filter), FE-025 và FE-041 (window, `windowLock`); đề nghị tạm khóa ctxbar cho màn này |
| BLT-A6 | A | | Export disabled | FE-016 |
| BLT-A7 | A | | Conditional groups: cột Deployment và Legs (trigger) của HIFI; implementation Symbol/Type/State/Target/Filled | FE-052 (bracket legs có `order_id`, deployment) |
| BLT-B1 | B | **MAJOR** | Cột Status bị cắt ở 1440px (header "STATU", cờ "✓ F"): bảng 10 cột mặc định rộng hơn khung. HIFI giải quyết bằng `.stk{position:sticky;right:0}` cho Status và mặc định 10 cột gọn (time 12px `17 Oct 09:58:00Z`, Deployment, không Alpha/Account/Venue). Implementation: Time 14px mono "2026-10-17 12:00:00 UTC" (~190px), thêm Alpha (18 ký tự), Account (20 ký tự), Venue mặc định bật, ô số `--exec-font-num` 14px so với `.bt td.n` 12px của HIFI | `blotterModel.ts` `COLUMNS`: `dflt:false` cho `alpha`, `account`, `venue`; `blotter.css`: `.exec-blt2-table th:last-child,td:last-child{position:sticky;right:0;background:var(--paper-raised);box-shadow:-1px 0 0 var(--line)}` (thêm hover/selected bg); định dạng thời gian `DD Mon HH:MM:SSZ`; `.exec-blt2-table td{font:var(--exec-font-data)}` và số 12px |
| BLT-B2 | B | **MAJOR** | 390px: bảng "Conditional groups" là `<table>` thường (`.exec-blt2-inner` `display:block; overflow-x:auto`), cột TARGET bị cắt, Filled và Opened (UTC) nằm ngoài màn, người dùng không thấy vì không có gợi ý cuộn | Dùng `CardsTable` cho groups (như bảng orders) trong `index.tsx`, bỏ `.exec-blt2-inner` ở <=660px |
| BLT-B3 | B | MINOR | Ô Order: HIFI nút `+`/`−` 20×20 (`aria-expanded`), chip id mono là link "Open on chart", dấu ◇ khi còn leg armed. Implementation nút chữ "Show" (+~30px bề rộng), id là text thường, không link, không ◇ | `blotter.css` `.exec-blt2-x`: 20×20 + glyph; id render qua `chartHref(order)`; thêm marker khi có leg `Armed` |
| BLT-B4 | B | MINOR | Order funnel và Conditional groups: HIFI là `details.panel` có `▸/▾`, funnel mở sẵn; implementation là panel tĩnh | Dùng `<details open>` + `::before` như HIFI |
| BLT-B5 | B | MINOR | Caption "(Not published; no request id yet)" lỗi thời: FE-052 đã lập. Cột Avg price và Fee không có tiêu đề "Not published (FE-052)" | `NOT_IN_READ` và caption trong `index.tsx`: ghi FE-052; thêm 2 cột mặc định tắt hiển thị `Not published (FE-052)` thay vì bỏ |
| BLT-B6 | B | MINOR | "How to read" của HIFI là `<details>`; implementation là caption tĩnh luôn mở | `<details>` |
| BLT-B7 | B | MINOR | 390px: "Side and type" tách hai span ra hai đầu card ("Buy ... Stop limit"); 50 card dài 20,172px, Newer/Older chỉ ở cuối | `cards.css` `td[data-l]` cho phép `justify-content:flex-end; gap:var(--space-2)` khi ô có hai span; thêm `Older` phía trên bảng ở <=660px |
| BLT-B8 | B | MINOR | Chip freshness: HIFI "Fresh · 12:00Z" (chấm + giờ rút gọn); implementation "FRESH As of 2026-10-17 12:00:00 UTC" dài, dính ctxbar (S2) | `blotter.css` `.exec-blt2-head{align-items:flex-end}` |
| BLT-C1 | C | | Dải "Design preview / Opened from / State" của HIFI | Không phải sản phẩm |
| BLT-C2 | C | | Phân trang keyset 50 dòng/trang (không "Showing 50 of 96" tính lại theo scope) và "Numbers are exact and never shortened" | Rule scale refine §8 |
| BLT-C3 | C | | Số luôn đầy đủ chữ số, không rút gọn | Rule exact |

Narrow 390: có thể dùng, nhưng B2 và B7 giảm khả năng dùng; control (Symbol, Venue, Side, chips, Columns, Export) đều với tới.

Đếm Blotter: A 7, B MAJOR 2, B MINOR 6, C 3.

## 5. Admin Actions

| ID | Lớp | Mức | HIFI vs implementation | Fix / FE |
|---|---|---|---|---|
| ADM-A1 | A | | Trạng thái dữ liệu: Ready 0 / Not enabled 12 / Not offered 8 (HIFI nq: Ready 1, 16, 3; ok: Ready 13). Relay off (`PROJECTION`, kill switch) khiến mọi hành động không bật | FE-015 (eligibility và lý do từng hàng), FE-037 |
| ADM-A2 | A | | Apply, Preview và dải 6 trạng thái command (Not started... Catching up): implementation chỉ Plan, Apply disabled kèm lý do | FE-020, FE-030 (Codex sở hữu commands) |
| ADM-B1 | B | **MAJOR** | Dòng phụ dưới tên hành động: HIFI là mô tả tiếng Anh ("Check that each service is up", "See balances and state of an account"). Implementation in catalogue key mono (`alpha/inspect`) hoặc "No catalogue key" ngay dưới "System health", người quản trị không hiểu hàng làm gì. Tên cũng khác ("Alpha / account inspect" thay "Account inspect", "Declarative config plan / apply" thay "Declarative config"); cột Scope in thô "account · alpha" thay "Account" | `admin/index.tsx` cột `action`: dùng `r.task.meta` (field có trong `OperatorTask`) làm dòng phụ nếu là câu thường, key chuyển vào Provenance; nếu `meta` không phải mô tả thì đây là A và cần thêm request cho server (chưa có FE id, xác nhận với Codex) |
| ADM-B2 | B | MINOR | Pane bên phải: HIFI mở sẵn pane "System health" 360px (WHAT/SCOPE/WHO/HOW/STATE + Run local read), bảng chiếm ~2/3. Implementation không chọn sẵn hàng nào, pane chỉ hiện khi bấm, bảng full-width | `admin/index.tsx`: khi `selection === null` và mode `dock`, mở hàng ready đầu tiên (replace) |
| ADM-B3 | B | MINOR | Banner relay-off: HIFI banner tông cảnh báo ("Source not qualified. Only local reads run."); implementation tông trung tính (`surface-2`) kèm flag "Relay off" | `admin.css` `.exec-adm-banner[data-tone="stale"]` |
| ADM-B4 | B | MINOR | Chân trang: HIFI là panel viền có link "Open in Operations (source: admin)" bên phải; implementation là một dòng caption trần. Link Operations ở đầu trang HIFI là chip viền, implementation là link thường | `.exec-adm-note` bọc trong panel; `.exec-adm-link` ở head dùng nút viền |
| ADM-B5 | B | MINOR | Đầu trang: sub-text thêm "This page plans; it does not apply."; thêm nút Refresh; chip freshness căn đỉnh dính ctxbar (S2) | `.exec-adm-head{align-items:flex-end}` |
| ADM-C1 | C | | Dải Design preview (page/command state), role switcher | Không phải sản phẩm |
| ADM-C2 | C | | Hàng "Not offered in the portal" gồm 8 mục thay 3 (do relay off, `SEMANTICALLY_INCOMPATIBLE`) | Theo N27 vocabulary |
| ADM-C3 | C | | "Plan-only": Apply luôn disabled, mọi hàng capital "Start in Portfolios" | Quyết định S2 |

Narrow 390: dùng được. Bảng thành card, nhưng nhãn "Action" bên trái và tên bên phải căn phải, tiêu đề panel xuống dòng (`Portfolio capital` thành hai dòng cạnh chú thích). Chip lọc trạng thái xuống dòng, đều với tới được.

Đếm Admin: A 2, B MAJOR 1, B MINOR 4, C 3.

## 6. Users

| ID | Lớp | Mức | HIFI vs implementation | Fix / FE |
|---|---|---|---|---|
| USR-A1 | A | | Role preset (Manager/Researcher/Operator/Reviewer/Viewer) làm filter có đếm, và cột "Role preset". Implementation có `Role: all` (Administrator/User thật) và select "Role preset: not published" disabled | FE-015, FE-026, FE-037, FE-038 |
| USR-A2 | A | | Cột Last seen (UTC) và "Never signed in"; implementation thay bằng cột Revision | FE-053 |
| USR-A3 | A | | Cột Actions (Disable/Enable, "You cannot disable yourself"), Invite account chủ động, panel step-up (Verify with security key), ô note >=12 ký tự, kết quả Accepted/Catching up | FE-015, FE-020 (command), step-up `step_up_required`; thay thế: link "Open the current Users screen" (Codex sở hữu commands) |
| USR-B1 | B | **MAJOR** | Toàn trang render ngoài `.exec-surface`: `UsersEntry` (`app/PortalRoutes.tsx:77`) gắn `<V2Users>` trần, còn `screens/access/index.tsx:366` tự bọc `ExecutionSurface`. Hệ quả: mọi `font: var(--exec-font-*)` không hợp lệ và rơi về 14px sans của body. Ảnh cho thấy tiêu đề "Users" ~14px (HIFI 24/32), giá trị KPI "123/87" ~14px sans (phải 24/32 mono), subtitle/caption/tên cột đều 14px | `screens/users/index.tsx`: bọc root `.exec-usr-v2` trong `<ExecutionSurface kind="deployments">` như access; thêm test kiểm `getComputedStyle(h1).fontSize` |
| USR-B2 | B | MINOR | Bảng không nằm trong panel có `.ph` "Accounts … 7 of 7"; đếm nằm ở chân. Cột tên: HIFI tên đậm + chip username mono là link sang Access; implementation tên + username mờ, không link, không "(you)" | `users/index.tsx`: bọc CardsTable bằng `SectionPanel title="Accounts" aside="{n} of {m}" flush`; thêm "(you)" khi `userId` là session |
| USR-B3 | B | MINOR | Chú thích lỗi thời và nối câu: "Not published (FE-015, FE-026, FE-037, FE-038) Role presets. Not published (no request filed yet) Last sign-in. ..." FE-053 đã tồn tại; câu dính liền như một đoạn | `users/index.tsx:329,391`: `ids="FE-053"`; tách thành danh sách hai dòng hoặc hai `<li>` |
| USR-B4 | B | MINOR | Ô Search 240px cắt placeholder ("Search by name or usernam…"); thanh công cụ gồm 3 select và nút nên xuống dòng lộn xộn ở 390px | `.exec-usr-input{width:280px}`; ở <=660px `flex:1 1 100%` |
| USR-B5 | B | MINOR | Dải 6 thẻ đếm (Accounts, Active, Invited, Disabled, Archived, Locked) không có trong HIFI, thay cho đếm theo preset; đẩy bảng xuống ~170px | Giữ (dữ liệu hỗ trợ); khi preset được publish thì thay bằng đếm theo preset như HIFI |
| USR-C1 | C | | Chip đầu trang: HIFI "Relay qualified" + "My access"; implementation flag step-up + link legacy | Quyết định `?view=legacy` |
| USR-C2 | C | | "Load more" và giới hạn 200 hàng; HIFI không phân trang | Rule scale §8 |
| USR-C3 | C | | Ctxbar không hiện trên trang Administration | Shell |

Narrow 390: dùng được về cấu trúc (card, filter, Load more), nhưng toàn bộ chữ 14px do USR-B1 và trang dài 9,552px; sửa B1 giảm đáng kể.

Đếm Users: A 3, B MAJOR 1, B MINOR 4, C 3.

## 7. Profile & Access

| ID | Lớp | Mức | HIFI vs implementation | Fix / FE |
|---|---|---|---|---|
| ACS-A1 | A | | Thẻ "Role preset Manager · Read-all · owner": implementation `Not published (FE-015)` | FE-015 |
| ACS-A2 | A | | Thẻ App sign-in ("Active · Ends in 7 h 12 m") và Business access ("Accepted · Membership r19"): implementation đổi thành Capabilities held 14 và Access policy Available | FE-038 (My access), FE-015 (session expiry chưa publish; cần xác nhận) |
| ACS-A3 | A | | What you can do: HIFI 13 hàng, chip STEP-UP, lý do tiếng thường ("Asks you to confirm it's you", "Relay is not qualified yet"). Implementation 6 hàng, cột Why in capability key ("Held: governance.r1.decide"), cuối bảng `Not published (FE-015)` | FE-015 (`reason_class`, `grant_ref`, `step_up_required`) |
| ACS-A4 | A | | What you can see: HIFI cột Scope ("ALL AUTHORIZED" / "CAN SEE"); implementation cột Basis (capability key), kèm ghi chú tên capability tạm | FE-037 |
| ACS-A5 | A | | Granted to you: thiếu "Granted by"; có thêm Environments, Revision, Trading system | FE-015 |
| ACS-A6 | A | | Manage grants: preset table, ma trận See/Decide theo gate, step-up. Implementation nhúng ma trận V1 ở tab thứ hai | FE-026, FE-038 (Codex sở hữu grants/capabilities) |
| ACS-B1 | B | **MAJOR** | Dải nhận diện (hàng đầu của trang): HIFI 4 thẻ liền, giá trị mono 24/32 ("Bobby", "Manager", "Active", "Accepted"), nhãn mono in hoa, ghi chú 12/16. Implementation 5 thẻ có khe hở 12px, nhãn `--exec-font-th` 11 sans, giá trị `--exec-font-subtitle` 14/20 (`access.css:108`), mất phân cấp; id dài "principal-visual-baseline" in cùng cỡ | `access.css:108` `.exec-acc-kpi-value{font:var(--exec-font-kpi)}` cho giá trị ngắn (Owner, 14, Available); dòng id/revision chuyển `--exec-font-id` bên dưới; `gap:1px` nền `--line-strong` như `.kpis` |
| ACS-B2 | B | MINOR | Tiêu đề panel: HIFI `.ph` mono 11/16 in hoa, cao 34px, nền sunken. Implementation `--exec-font-section` 15/22 600 trong header `padding 12/16` (cao ~48px), không sunken (`access.css:181`) | Dùng `SectionPanel` (`exec-blk-ph`) như các màn khác (S1) |
| ACS-B3 | B | MINOR | Bảng Granted to you: khóa `alpha.metadata.edit` ngắt giữa chữ ("alpha.metadata.e / dit") ở 1440px | `access.css` cho ô Access `overflow-wrap:normal; white-space:nowrap; min-width:14ch` |
| ACS-B4 | B | MINOR | Hai ô thông tin "Read 22 Aug 13:00Z" và Refresh thay chip "Fresh · 12:04Z"; subtitle thay "Bobby · Manager". "Read" ghi trung thực rằng portal không publish as-of | Giữ; chỉ đổi subtitle sang "Bobby · Owner" nếu muốn bám HIFI |
| ACS-C1 | C | | Tab "My access / Manage grants" chỉ hiện cho owner; chủ sở hữu giữ ma trận V1 ở tab hai (flag `profile`) | Comment `PortalRoutes.tsx` (D9) |
| ACS-C2 | C | | Panel "Policy" (Researcher field policy `Not published (FE-026)`, Owner recovery OFF) không có trong HIFI | Quyết định công bố policy |
| ACS-C3 | C | | Giá trị fixture `_TEST_ONLY`, `principal-visual-baseline`, "22 Aug" trong ảnh | Fixture, không phải code |

Narrow 390: dùng được. Thẻ nhận diện xếp 2 cột (thẻ "Role preset" lẻ một mình), các bảng thành card, không bị cắt, mọi nút với tới.

Đếm Access: A 6, B MAJOR 1, B MINOR 3, C 3.

## 8. Tổng hợp số lượng

| Màn | A | B MAJOR | B MINOR | C |
|---|---|---|---|---|
| Accounts | 5 | 0 | 7 | 5 |
| Account 360 | 7 | 0 | 8 | 4 |
| Blotter | 7 | 2 | 6 | 3 |
| Admin | 2 | 1 | 4 | 3 |
| Users | 3 | 1 | 4 | 3 |
| Access | 6 | 1 | 3 | 3 |
| Dùng chung (S1 đến S3) | 0 | 0 | 3 | 5 |
| **Tổng** | **30** | **5** | **35** | **26** |

Ghi chú đếm: mục dùng chung S1 đến S3 là B MINOR; 5 mục C dùng chung là chrome shell, ContextBar, dải Design preview, role switcher, chuỗi window.

## 9. Năm sửa MAJOR theo tác động người dùng

1. **BLT-B1** Blotter: cột Status bị cắt ở 1440px. Cột trạng thái là thông tin chính của đơn; sửa bằng sticky-right cho Status, tắt mặc định Alpha/Account/Venue, bỏ ngày dài và hạ chữ số 14px xuống 12px (`blotterModel.ts`, `blotter.css`).
2. **USR-B1** Users: bọc `ExecutionSurface` (`screens/users/index.tsx`). Một dòng sửa khôi phục toàn bộ phân cấp chữ của trang (tiêu đề 24px, KPI 24px mono).
3. **BLT-B2** Blotter 390px: bảng Conditional groups bị cắt, đổi sang `CardsTable` (`screens/blotter/index.tsx`).
4. **ADM-B1** Admin: dòng mô tả của 24 hành động đang là catalogue key; dùng `task.meta` làm mô tả (`screens/admin/index.tsx`, cột `action`), nếu `meta` không đủ thì mở request mới.
5. **ACS-B1** Access: dải nhận diện sai phân cấp (`css/access.css:108`), đưa giá trị về `--exec-font-kpi`.

Sau năm mục trên, các sửa MINOR đáng làm tiếp theo: S3 (`.exec-blk-demoted` gap, ảnh hưởng mọi trạng thái partial/stale), A360-B2 (lưới dữ kiện 140px/1fr), ACC-B1 (tuổi dữ liệu và chấm quá hạn).
