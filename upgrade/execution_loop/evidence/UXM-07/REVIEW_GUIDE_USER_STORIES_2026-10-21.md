# Hướng dẫn review UI/UX Execution V2 trên research-portal (user stories) — 2026-10-21

Dành cho: Bobby (reviewer). Mục đích: duyệt **giao diện và luồng dùng** của Execution V2 **trước khi** backend (Codex / Edge / PM / TS) nghiệm thu xong.
Lane: **FIXTURE_LAB** (dữ liệu mẫu, không phải dữ liệu thật, không phải bằng chứng nghiệm thu).
Nhánh mã mô tả: `claude/post-freeze-20261021` @ `91f28db4`. Ảnh: `review-guide-2026-10-21/` (1440 px, chụp trên preview).

Quy ước trạng thái từng URL/bước trong tài liệu này:

| Nhãn | Nghĩa |
| --- | --- |
| **verified 2026-10-21** | Đã nạp thật trên `http://127.0.0.1:8095` bằng Chromium (chỉ đọc), đúng chữ như trong bảng |
| **sau rebuild** | Mô tả theo mã/spec của nhánh post-freeze; preview đang chạy bản build cũ hơn nên **chưa thấy** trên 8095 |
| **dark** | Khóa cờ tắt trong preview; chỉ thấy sau khi lead đổi cờ + rebuild |

---

## 0. Bạn đang nhìn cái gì

### 0.1 FIXTURE_LAB là gì (đọc trước)

- Mọi màn Execution trên 8095 do một server mẫu (`portal-fixture-bff`) trả lời. **Không có** Trading System, broker, database, Control API phía sau. Số liệu có **hình dạng đúng**, **giá trị bịa**.
- Dải vàng cố định ở đầu mọi trang: `FIXTURE DATA - sample data for UI/UX review, not real data, not acceptance evidence`.
- Không có đăng nhập thật. Bạn luôn là **"Fixture reviewer"** (owner, 14 capability, không session/cookie). Việc bạn làm **không gán cho ai** và không đổi gì trên lần đọc kế (cùng request luôn trả cùng byte).
- Ảnh chụp từ đây chỉ chứng minh **cách màn hình trông** với dữ liệu hình dạng này. Không chứng minh server thật trả gì (xem mục 2.5).
- `/__fixture/lane` (verified 2026-10-21) báo: `lane FIXTURE_LAB`, `scale medium`, `writes refuse`, `fixture_now_iso 2026-08-22T13:00:00Z`.

### 0.2 Preview đang chạy bản cũ hơn nhánh post-freeze

Preview 8095 hiện phục vụ **registry revision 8** (bản build trước các lát post-freeze 2026-10-21). Lead sẽ rebuild; đến lúc đó các dòng "sau rebuild" mới hiện. Khác biệt đã quan sát được:

| Việc | Trên 8095 hôm nay (verified) | Sau rebuild (theo mã/spec) |
| --- | --- | --- |
| Compare | `/deployments/compare` → "No data yet / No feature in the current registry claims this route". Dùng được qua `/deployments/portfolios?view=compare&in=…` | `/deployments/compare?in=…` là route chính (registry rev 9); URL `?view=compare` chuyển hướng về đó |
| Rail Actions của Portfolio 360 | 6 nút đều "NOT APPLICABLE: UNAVAILABLE", câu "The backend publishes no eligibility for this portfolio, so no action is offered." Không gọi đọc eligibility khi mở rail dù URL có `workspace_id` | Mở rail + URL có `?workspace_id=` → hỏi eligibility một lần, mỗi nút in một câu theo quyền của bạn (xem Story 2). Không bao giờ bật nút |
| Câu từ chối của Paper exit request | `The server did not record this request (unavailable). HTTP_405: The request failed.` | `The server did not record this request.` + nút **"Server reason"** (mã nằm sau nút, không in "(unavailable)") |
| Users @390 px | 50 hàng, cao 7 807 px | Mười thẻ + "Load more" (DEBT-031) |
| Alpha 360 Orders & Fills @390 px | 9 hàng (6 order + 3 fill) | Ba hàng mỗi bảng + "Load more" |
| Cờ phụ | `command`, `scoped`, `fleet-stream` **tắt** (xem 0.3) | cùng, trừ khi lead bật |
| Chữ trên Access | `Provisional capability names: …`, tên `execution.portfolios.read`… | Không còn in tên capability tạm; token menu `nav:*` (DEBT-005) |
| Nhãn cờ extrema ở Paper equity | `PARTIAL · SERVER REDUCTION DOES NOT GUARANTEE EXTREMA` | Chỉ nói "extrema" khi nguồn công bố đúng phương pháp `PER_SERIES_BUCKET_EXTREMA` (`892cdabb`) |

### 0.3 Khóa cờ nào đang bật trong preview

Đọc từ bundle đang phục vụ (verified 2026-10-21): `fleet, archived, portfolios, alpha, workbench, account, ops, profile, overview, cockpit, shell, compare, blotter, admin, users, replay, sandbox, canary, live, request` = **20 khóa**. (`archived` và `replay` chỉ là khóa dự trữ: Archived là một lens của Fleet, Replay là tab của Alpha 360.)

**Tắt** (không nằm trong 20): `command` (câu chuyện lệnh `/execution/command` + form "Preview control" ở dock Operations), `scoped` (`/execution/slice`), `fleet-stream` (chip STREAM của Fleet).

- `/execution/slice?fixture=chain` (bộ phân trang 3 trang) → trên 8095 rơi về "Execution Command Center / No data yet" (**dark**, verified rằng nó không tải). Spec: `e2e/execution-v2-scoped-pager.spec.ts`.
- `/execution/command` → tương tự **dark** (verified).
- Bật bằng cách thêm khóa vào `PORTAL_EXECUTION_V2_SCREENS` trong env file preview (ngoài checkout) rồi `scripts/research-preview/preview.sh build portal-web` + `up` — **việc của lead**, không phải reviewer.

### 0.4 Người dùng, workspace, dữ liệu demo

| Mục | Giá trị | Ghi chú |
| --- | --- | --- |
| Người dùng | "Fixture reviewer" (owner; `FIXTURE_LAB`) | `/api/auth/context` verified. Không đăng nhập/đăng xuất được (route bị từ chối có chủ ý) |
| Workspace mặc định | không có `workspace_id` trong URL | Hầu hết màn không cần workspace |
| `ws_TEST_ONLY_shared` | mở nút **Request review** của Paper exit | Story 5 |
| `ws_TEST_EXIT_OFF` | đóng nút đó (lý do từ server) | Story 5 |
| `ws_TEST_GRANTS` | Access có bảng grant mẫu | Story 8 |
| `ws_TEST_EMPTY`, `ws_TEST_DENIED`, `ws_TEST_UNAVAILABLE`, `ws_TEST_OTHER_USER`, `ws_TEST_MALFORMED` | các trạng thái đọc Access | `Access policy: Not available / From the access read` (verified cho DENIED, UNAVAILABLE, OTHER_USER) |
| `ws_TEST_SCOPED_V2` | thân V2 của Live/Canary/Sandbox | `/deployments/live/dep_live_01?workspace_id=ws_TEST_SCOPED_V2` verified (stress số lớn, Story 10) |
| Alpha | `alpha_btc_trend` (đầy đủ nhất), `alpha_a`; bất kỳ id nào cũng ra cùng dữ liệu mẫu đổi tên | Fleet dùng id khác (`alpha_a`…); xem 2.5 |
| Portfolio | `pf_TEST_ONLY_core` (mixed books), `pf_TEST_ONLY_satellite`, `pf_TEST_ONLY_canary` (Simulated), `pf_scale_001…025` | |
| Account | `acc_bnc_core` (có đầy đủ tab), `acc_bnc_sub`, `acc_scale_*` | |
| Deployment | `dep_paper_01`, `dep_sandbox_01`, `dep_canary_01`, `dep_live_01`; Exit: `dep_exit_none`, `dep_exit_not_approved`, `dep_exit_not_admin`, `dep_exit_expired` | |
| Incident | `inc_fixture_44` | |

### 0.5 Ghi chép "bật ghi" cho Paper exit request

Preview đang `FIXTURE_WRITES=refuse` (mặc định): mọi POST trả `405`, nên **không thể thấy trạng thái thành công**. Để thấy Created/Duplicate/Refused/Denied: lead đặt `FIXTURE_WRITES=doubles` trong env file preview (ngoài checkout, không in ra) rồi chạy **chỉ** `scripts/research-preview/preview.sh up portal-fixture-bff` (scoped, không chạm `control-api`). Các câu trả lời là hàng "đóng hộp" cố định, **không đổi gì trên lần đọc kế** (README-fixture.md, "Writes"). Nút "Request review" không cần khóa `command`.

### 0.6 Cách đọc một màn hình (dùng cho mọi story)

| Thành phần | Ý nghĩa |
| --- | --- |
| Thanh **CONTEXT** (Real-funded / Paper / Sandbox, Window) | Lọc môi trường/cửa sổ. Dòng `Not applied: Environment, Window` = màn này đọc **không** có tham số đó; thanh chỉ để xem, không đổi số |
| Dòng **`Not available: …`** + nút `?` | Một dòng gom mọi ô thiếu; bấm `?` mở lý do + mã yêu cầu `FE-nnn` (mục 2.2–2.3) |
| Chip trạng thái (✓ OK, ◐ PARTIAL, ◷ STALE, ◔ PENDING, ⚠ NEEDS ATTENTION, ✕ REJECTED, ? OUTCOME UNKNOWN, ❚❚ PAUSED, ○ NOT APPLICABLE) | Luôn có **glyph + chữ** (không chỉ màu) |
| Giờ | Hai dạng: `2026-10-17 12:04:00 UTC` (đầy đủ) và `17 Oct 12:04Z` (gọn). Luôn UTC. Giờ "as of" cố định theo từng double, **không phải** "bây giờ" |
| Nút tắt | Luôn kèm lý do + link "My access"; nút không bao giờ im lặng |
| Dock (ngăn bên phải) | Mở bằng `?sel=…` trên URL; **Esc** đóng và trả focus |

---

## 1. Mười user story

Mỗi story: persona, mục tiêu, các bước (URL / thao tác → bạn thấy gì), kết quả tốt, màn **cố ý không nói** gì, và câu hỏi để bạn phán xét. Cột "Preview" theo nhãn ở đầu tài liệu; ô trống = **verified 2026-10-21**.

### Story 1 — Fleet → alpha → Trade Replay (Fund Manager)

Mục tiêu: từ cái nhìn toàn quỹ tới một lệnh cụ thể và thấy nó trên biểu đồ nến.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | Mở `/execution` (Overview) | `Overview, bobby`; `NEEDS ATTENTION: BUSY, 3 RANKED`; `Read 2026-10-17 12:04:00 UTC · Not live`; chip `◐ PARTIAL`; NAV `99.25 USDT`; `OPEN INCIDENTS at least 1`; bảng "CURRENT BY CURRENCY" (JPY/USD/USDT); `Not available: Net PnL, Return, Drawdown, Capital, Since your last visit, Contributors`; `FLEET BY STAGE` Paper 13 / Sandbox 6 / Canary 8 / Live 20 / Research 5 | ảnh `22-overview.png` |
| 2 | Sidebar → **Alpha Fleet** (`/deployments/alphas`) | KPI: `ALPHAS 40`, `DEPLOYMENTS 67`, `PORTFOLIOS 20`, `NEED ATTENTION 11`, `RESEARCH ONLY 5`; lens `ALL 40 / REAL-FUNDED ~28 / SANDBOX 6 / PAPER 13 / ARCHIVED`; chân `40 of 40 alphas`; dòng `Not available: Group by, Map, Window, Readiness, Compare, Archived list` | |
| 3 | Bấm tab **Board** | Cột theo stage; `Loaded rows only: 13 alphas; an alpha in several stages is in each of its lanes`; `Readiness: Not published (FE-027) for every alpha here` | ảnh `21-fleet-board.png` |
| 4 | Về **Table**, bấm một hàng (vd "Carry A") | Dock "Carry A / Version 3.2"; Lifecycle R1·R2·**PAPER**·SANDBOX·CANARY·LIVE; `Alpha id alpha_a`; `Lifecycle readiness Not published (FE-027, FE-028)`; `Compare Not published (FE-033)` | `?sel=alpha_a`; ảnh `01-fleet-table-drawer.png` |
| 5 | Dock → **Open Alpha 360** | `/deployments/alphas/alpha_a?from=fleet`; chip `◔ PENDING: NOT SCORED · POLICY NOT SET`; `Request archive` / `Request gate review` **tắt** kèm `Not published (FE-034). Archive requests cannot be recorded yet.` + link "My access"; Lifecycle "Now in Live"; KPI `NET PNL, CURRENT +1,120.80 USDT`, `EXPOSURE, CURRENT 126,500.00 USDT` | ảnh `02-alpha360-overview.png` |
| 6 | Mở thẳng `/deployments/alphas/alpha_btc_trend`, tab **DEPLOYMENTS** | `4 deployments` (Paper dep_paper_01 -84.20, Sandbox dep_sandbox_01 0.00, Canary dep_canary_01, Live dep_live_01 +1,120.80 USDT); `No allocation total: rows sit in different partitions`. Link `dep_*` mở màn stage tương ứng | `?tab=deployments` |
| 7 | Tab **ORDERS & FILLS** | `ORDERS 8 · FILLS 3 · REJECTED 1 Of 8 orders · LATENCY Not available · Broker timestamps not published`; bảng 6 order, `6 orders loaded, more in the retained window` + **Load more**; fill `fill_003` fee `Not available · Fee not published` | `?tab=orders`; ảnh `03-alpha360-orders-fills.png` |
| 8 | Ở một hàng order, cột REPLAY bấm **Open** (`Open ord_007 in Trade Replay`) | `?tab=replay&focus=order:ord_007`; `Opened at order ord_007. The matching rows and markers are highlighted.`; `← Back to Orders & Fills`; chart nến `25 bars · 1h · 3 fills · 2 legs · 0 round trips · 3 position boxes`; `Interval derived from the strategy id`; `TRADE LOG — EVENTS BEHIND THE MARKERS 8 events · BTCUSDT` | ảnh `04-trade-replay.png` |
| 9 | Tab **ACTIVITY & DECISIONS**, **RESEARCH EVIDENCE**, **REGIME FIT**, menu **MORE** (Trade Replay / Positions / Reconciliation) | Activity: `Observed timeline: a Portal observation of the current page, not an event replay`; Evidence: `Research binding: RESEARCH_RUN_NOT_BOUND`; Regime: `Historical support, not a forecast` + `◔ PENDING: NOT EVALUATED` | |

**Kết quả tốt:** bạn đi từ quỹ → alpha → deployment → lệnh → nến mà không cần nhớ id; mọi liên kết giữ ngữ cảnh (`from=fleet`, `← Alpha Fleet`).
**Màn cố ý KHÔNG nói:** tên/phiên bản alpha (`Not available: Name, Version, Run, Evidence`, FE-066/029); return/drawdown/regime fit (FE-006/025/011); lifecycle "xong R1/R2" (FE-027/028 — spine không vẽ "done"); không có nến "đẹp" bịa: nến là **venue candles** và marker là **DERIVED** (ghép leg theo thời gian). Trade Replay không vẽ đường equity/fill.
**Phán xét:** (a) đường từ Fleet tới Replay có quá nhiều bước? (b) lifecycle spine có làm bạn tưởng alpha "đã qua gate" không? (c) tên tab `ORDERS & FILLS` / `MORE` có đúng ngôn ngữ của bạn không? (d) bảng Orders: đủ cột hay nhiều cột trống ("Not available")? (e) `Replay > Open` có thấy được/đủ lớn bằng bàn phím không?

---

### Story 2 — Portfolios → Portfolio 360 → rail Actions → Account 360 (Portfolio Manager)

Mục tiêu: hiểu vốn và quyền hành động trên một portfolio, và biết hành động **chưa** làm được.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/deployments/portfolios` | `25 portfolios`; `PARTIAL DATA: BRANCH NOT WHOLE / Paper: Partial (the data feed is running behind)`; bộ lọc `All 25 / Real-funded 19 / Simulated 19`, `Currency: any / JPY / USD / USDT`; hàng "Core" có `PARTIAL DATA: MIXED BOOKS (Real-funded and Simulated books together)`; "Pilot" `Not available · owner not published`, `Not available · no allocation published`; `Not available: NAV, Net PnL, Return, Drawdown, Concentration, Score` | |
| 2 | Bấm hàng **Core** (`/deployments/portfolios/pf_TEST_ONLY_core`) | `Core · pf_TEST_ONLY_core · M. Tran · USDT`; `Simulated capital. It is never added to Real-funded figures.`; KPI `Alphas 4 · Deployments 5 · Accounts 4 · Allocated (current) 540,000.00 USDT · NAV 99.25 USDT`; 6 tab OVERVIEW / ALLOCATIONS / ALPHAS / ACCOUNTS / RISK AND HEALTH / PEOPLE AND ACTIVITY | (không có ảnh riêng) |
| 3 | Tab **ALLOCATIONS** (`?tab=allocations`) | `REAL-FUNDED Live and Canary` bảng `460,000.00 / 700,000.00 / …`; sổ vốn `Capital ledger · Live`: `Allocate 50,000.00 USDT 90,000.00 → 140,000.00`; `Append-only, newest first. Showing 5 of 12. The read is bounded to the latest entries and publishes no older page.`; khối `SIMULATED … never added to Real-funded`; `The ledger published no entry in Paper. An empty ledger is a fact, not a zero balance.` | |
| 4 | Tab **RISK AND HEALTH** | `Portfolio gross exposure Not available · not published; it is not worked out here`; margin theo account `Not available · not published`; `CORRELATION … Not available · No correlation data source` | console có `503 …/correlation` (đúng: trạng thái "unavailable" có kiểu, không phải lỗi) |
| 5 | Nút **Actions** (đầu trang) | Dock "Actions · Core": `PREVIEW UNAVAILABLE Not published (FE-020). A preview cannot be shown, so nothing here can be reviewed or submitted.`; 6 hành động: `Grant budget`, `Recall budget`, `Set target budget`, `Return capital`, `Lock allocation`, `Deploy version`, mỗi cái `NOT APPLICABLE: UNAVAILABLE` + câu lý do | `?sel=rail:actions`; ảnh `06-portfolio-360-actions-rail.png` |
| 6 | Thử URL có workspace: `…/pf_TEST_ONLY_core?workspace_id=ws_TEST_ONLY&sel=rail:actions` | **Hôm nay:** rail không đổi (không có lần đọc eligibility). **Sau rebuild:** hỏi eligibility một lần; mỗi nút một câu — `Initial grant: you hold a current grant. Preview is not available here, so nothing can be submitted (FE-020)`, hoặc lý do `You don't have access to this action here` / `Access policy isn't active for your workspace yet` / `Restricted view isn't available yet` / `Not available for this kind of item`; Return/Lock/Deploy: `The eligibility vocabulary has no action for returning capital.` (… `locking an allocation`, `starting a version on an account`); **không có workspace trên URL:** `Not read. This page's address names no workspace, so it did not ask what you may do here.` Fixture chỉ trả một câu hỏi đã nêu, nên với portfolio này rail rất có thể nói `The eligibility read could not be completed.`/`…answered another question…` — **dự đoán từ mã, chưa quan sát** | sau rebuild |
| 7 | Tab **ACCOUNTS** của Portfolio 360 liệt kê 4 account (`Binance-02 … STALE`, `Bybit-01`, `OKX-01`, `Paper-Binance`); **bấm `Binance-02` ra lỗi của fixture** (`Unavailable · ACCOUNT_NOT_FOUND: no account Binance-02` + `Try again` — id trong portfolio không khớp id của double Account). Để xem Account 360 đầy đủ hãy vào `/deployments/accounts` → hàng `bnc_main@BINANCE`, hoặc mở thẳng `/deployments/accounts/acc_bnc_core` | `Binance-02 sleeve · pf_core · USDT · Real-funded`; `Sleeve / Physical binding`; chip `◷ STALE: STALE 14 MIN`; `Shared by 3 sleeves`; `PHYSICAL BINDING Native account Withheld`; `INTERNAL LEDGER · THIS SLEEVE 88,200.00 USDT` tách khỏi `NATIVE CUSTODY · WHOLE ACCOUNT 301,100.00 USDT`; `Not totalled: native balance is not split among sleeves`; tab OVERVIEW / POSITIONS / ALLOCATIONS / FEES & FUNDING / RECONCILIATION / ACTIVITY | ảnh `09-account-360.png` |
| 8 | Account 360 → **RECONCILIATION** (`?tab=rec`) | Bộ ba INTERNAL · BROKER · DIFFERENCE; BROKER/DIFFERENCE `Not computed` / `Not available`; `Published verdict (USDT) ? OUTCOME UNKNOWN: NO VERDICT Shared binding: the balance difference is not computed.`; lịch sử sync `7 of 7` | |

**Kết quả tốt:** bạn thấy **tại sao** từng nút vốn chưa bật, không chỉ "bị tắt". Không có chỗ nào cộng vốn Simulated vào Real-funded. Số nội bộ (internal ledger) không bị trộn với số venue.
**Cố ý KHÔNG nói:** quyền hành động (mọi nút luôn tắt, kể cả khi "ALLOWED" — một lần đọc quyền **không phải** lệnh cho phép); NAV/Return/Drawdown/Concentration (FE-005/006/013); "Capital statements" (FE-017); địa chỉ broker (`Withheld`); chênh lệch số dư khi binding dùng chung (không suy ra).
**Phán xét:** (a) sáu nút tắt với câu dài có thể ép bạn đọc quá nhiều — nên gom lại? (b) từ "sleeve", "binding", "partition" có thân thuộc không? (c) `PARTIAL DATA: MIXED BOOKS` đủ rõ vì sao? (d) tách INTERNAL / NATIVE CUSTODY có làm bạn tin số hơn hay rối hơn?

---

### Story 3 — So sánh hai portfolio (Portfolio Manager)

Mục tiêu: đặt hai portfolio **cùng cơ sở** cạnh nhau; hiểu khi nào **không** so được.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/deployments/portfolios`, tick hộp `Select Basis Book 06 to compare` rồi `Select Satellite to compare` (2–4 portfolio) | Thanh `Select 2 to 4 portfolios to compare`; chưa đủ 2 thì `Compare: Select at least 2 portfolios`; đủ 2 thì thành link **`Compare 2`** và URL thêm `?in=pf_scale_006,pf_TEST_ONLY_satellite` | Hôm nay đi tới `?view=compare`; **sau rebuild** đi tới `/deployments/compare?in=…` |
| 2 | Cặp so được: `/deployments/portfolios?view=compare&in=pf_TEST_ONLY_satellite,pf_scale_006` (**sau rebuild:** `/deployments/compare?in=pf_TEST_ONLY_satellite,pf_scale_006`) | `SERIES USDT · Real-funded basis`; chip `• INFORMATIONAL: PUBLISHED SERIES`; biểu đồ 2 đường; `Basis: NAV in USDT · paper book · basis TEST_ONLY:nav-ledger · methodology TEST_ONLY:nav-twr.v1 · window … · points as published: nothing rebased, filled or converted`; `6 points, none reduced · 1 gap drawn as a gap, not joined`; bảng METRICS (Base currency, Owner, State, Domain, Allocations, Deployments, Allocated capital) | ảnh `07-compare-comparable.png` |
| 3 | Cặp **không** so được: `…in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite` (URL của spec) | `Pick two comparable portfolios`; `Core ○ NOT APPLICABLE: NOT COMPARABLE Real-funded and Simulated books share one allocation figure, so it cannot be read on one basis`; `Basis: No aligned series: the common basis is not established`; vẫn có bảng METRICS | ảnh `08-compare-not-comparable.png` |
| 4 | Thử `…in=pf_TEST_ONLY_satellite,pf_scale_012` | `Other currency (JPY); cannot be compared on a USDT basis` | |
| 5 | Thử `…in=pf_TEST_ONLY_satellite,pf_TEST_ONLY_canary` | `Simulated book; the basis is Real-funded, and the two are never combined` | |
| 6 | Từ Portfolio 360, link **Compare with** | Sang Compare với portfolio đó đã chọn sẵn (`in=pf_TEST_ONLY_core`) | hôm nay trỏ `?view=compare`; sau rebuild trỏ `/deployments/compare` |

**Kết quả tốt:** màn **từ chối so sánh** bằng lý do cụ thể thay vì vẽ hai đường lệch nhau; khi so được, mọi đường chung một trục và cơ sở được in rõ.
**Cố ý KHÔNG nói:** `NAV, Net PnL, Return, Max drawdown, Score` (FE-013/005/006/011); không rebase/lấp/đổi tiền tệ; không vẽ "tương quan".
**Phán xét:** (a) lý do "not comparable" có đủ hành động tiếp theo ("chọn cái khác")? (b) có nên ẩn cặp không so được khỏi danh sách chọn thay vì để chọn rồi từ chối? (c) dòng `Basis:` quá dài/kỹ thuật? (d) tên "Compare" và "Compare with" có nhất quán?

---

### Story 4 — Blotter: lọc, cột, phân trang, điện thoại (Risk/Operations)

Mục tiêu: tìm lệnh bị từ chối và lần ngược về alpha.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/deployments/blotter` | Chip `Window: Current retained window`; `environment Paper`; dòng `Environment and window come from this read, not from the context bar: the orders read has no environment or window filter yet (Not published, FE-052, FE-025, FE-041). …`; `As of 2026-10-17 12:00:00 UTC`; chip `All 300 / Open 60 / Partial 30 / Filled 150 / Rejected 30` và `No chip: Canceled 30`; `Showing 50 of 300 authorized · newest first`; nút `Export` **tắt** + `Not published (FE-016)` | ảnh `10-blotter.png` |
| 2 | Bấm chip **Rejected 30** | URL `?status=REJECTED`; `Showing 30 of 30 matching · 300 authorized · newest first`; chỉ hàng `✕ REJECTED` | |
| 3 | Gõ `BTCUSDT` vào ô **Symbol** (hoặc chọn `Venue: all`, `Side: both`) | Sau một nhịp (có debounce) URL thành `?symbol=BTCUSDT`, nút `Clear all` xuất hiện, `Showing 50 of 100 matching · 300 authorized · newest first` | |
| 4 | **Columns** | Hộp tick: Time (UTC), Order, Alpha, Account, Venue, Symbol, Side and type, TIF, Price, Trigger, Quantity, Filled, Client ID, Venue order, Session, Risk grant, Updated (UTC), Status; `Order and Status always stay visible.` | ảnh `11-blotter-columns.png` |
| 5 | Nút `+` (`Show legs and fills for order ord_00300`) | Mở `Bracket legs` (Entry / Take profit / Stop loss với `✓ FILLED` / `◔ PENDING: ARMED`), `Fills` (`fil_00300_1 … 0.0123 USDT`; `A fee is in its own currency and is never summed across currencies.`) và `Order path` (Submitted → Risk grant `+400 ms` → Venue acknowledged …) | |
| 6 | Bấm `ord_00300` | Sang Alpha 360 Trade Replay với `from=blotter`; chữ `← Blotter`; với alpha khác `Order ord_00300 is not among the 6 loaded orders; the Portal holds more. Load more orders below to look further.` (trung thực: không giả vờ có) | |
| 7 | Chân bảng: **Newer / Older** | Phân trang keyset; không có tổng số trang | |
| 8 | Điện thoại 390 px: `/deployments/blotter` | Không tràn ngang; mỗi lệnh là một thẻ; `Showing 10 of 300 authorized · newest first`; **Newer / Older** ở **đầu** danh sách kèm `At the newest rows, older rows exist` (xem Story 10) | ảnh `phone-390-blotter.png` |

**Kết quả tốt:** chip đếm và dòng "Showing N of M" luôn khớp nhau; bộ lọc ở phía server nên số `matching` đúng, không phải "trong các trang đã tải".
**Cố ý KHÔNG nói:** `deployment`, giá trung bình/slippage/fee từng lệnh (FE-052); export (FE-016); môi trường/cửa sổ của thanh CONTEXT **không** đổi hàng (màn nói thẳng điều đó).
**Phán xét:** (a) đoạn chú `Environment and window come from this read…` quá dài? (b) `No chip: Canceled 30` có gây bối rối không? (c) số lượng `Price`/`Quantity` có đúng độ chính xác bạn mong (giữ nguyên chữ số, không viết tắt)? (d) bộ cột mặc định có đúng cột bạn dùng hằng ngày?

---

### Story 5 — Paper workbench → yêu cầu review exit (Portfolio Manager → Governance approver)

Mục tiêu: xin review để chuyển Paper → Sandbox, với phiên bản approval được ghim.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/deployments/paper/dep_paper_01` | `Paper monitor`; `DISPLAY FRESHNESS Fresh As of 17 Oct 09:14Z`; `NOT AVAILABLE Runtime, Reconciliation`; chip `◐ PARTIAL` ở Lifecycle `Observation gate`; Equity `106,857.29 USDT` (`200 points, none reduced · Server: 200 of 1,438 points, bucket_last`); tab OVERVIEW / ORDERS / FILLS / POSITIONS / SESSIONS | |
| 2 | Cuộn tới **EXIT GATE · Paper → Sandbox** | `GATE VERDICT ◐ PARTIAL`; `OBSERVATION DAYS 3 of 14 days`; `TRADES 30 of 60 trades`; `Not available: Drift vs approved band, Fills reconcile, Cost drift`; `Policy PAPER_OBSERVATION · paper.v1`. **Không có workspace trên URL:** `Request review` tắt, `No workspace is named for this read.` + "My access" | |
| 3 | Mở `/deployments/paper/dep_paper_01?workspace_id=ws_TEST_ONLY_shared` | Ô nhập `Why this deployment is ready`; `At least 8 characters (0 so far)`; nút **Request review** tắt cho tới khi đủ ký tự (đếm `35 characters`) | |
| 4 | Gõ "Ready after the observation window." → **Request review** | **Hôm nay (writes=refuse):** hộp đỏ `The server did not record this request (unavailable). HTTP_405: The request failed.` (ảnh `12-paper-exit-refused-writes-refuse.png`) — đúng thiết kế: không bao giờ giả thành công. **Sau rebuild:** `The server did not record this request.` + **Server reason**. **Với `FIXTURE_WRITES=doubles`:** `Applied: Requested`, `pexit_fx_dep_paper_01_<hash>`, `0 of 1 approvers`, link `Open in Approvals` | cần `doubles` (0.5) |
| 5 | Với `doubles`, gõ câu bắt đầu bằng `REPLAY` (vd "REPLAY of an earlier request.") | `Matched an earlier request` (không nhân đôi) | cần `doubles` |
| 6 | Với `doubles`, gõ `DENIED for this admin please.` | `The server did not record this request.` + `Needs the Admin role`; **Server reason** → `ADMIN_ROLE_REQUIRED` (403) | cần `doubles` + sau rebuild cho chữ |
| 7 | Với `doubles`, gõ `REFUSE this request please.` / `STALE projection please.` | **Server reason** → `APPROVAL_VERSION_CONFLICT` (409) / `CAPTURE_PROJECTION_VERSION_CONFLICT` (409); không bao giờ hiện "recorded" | cần `doubles` |
| 8 | Các trạng thái **đóng** (verified, không cần `doubles`): `?workspace_id=ws_TEST_EXIT_OFF` · `dep_exit_none` · `dep_exit_not_approved` · `dep_exit_not_admin` · `dep_exit_expired` (đều với `ws_TEST_ONLY_shared`) | `Not enabled for this profile` · `This deployment has no R2 review.` · `Not available: R2 must be approved before this can go on.` · `Not available: this needs an administrator role.` · `Not available: this approval has expired.` — mỗi cái kèm "My access" | |
| 9 | Tab **FILLS** (`?tab=fills`), **ORDERS**, **POSITIONS**, **SESSIONS** | Bảng tối đa 200 hàng + "Showing N of total"; Sessions `Not published (FE-067)` kèm số đếm | |

**Request được gửi đi mang gì:** `r2_approval_id`, `expected_r2_version` (3) và `expected_projection_digest` (`sha256:cccc…`) — **do server cấp** qua `GET /governance/paper-exit/parent`, không do giao diện tự đặt. Đó là điều "expected_versions" nghĩa: nếu approval đổi phiên bản trước khi bạn gửi, server từ chối (409) và màn **không** nói đã gửi.
**Cố ý KHÔNG nói:** runtime/reconciliation "xanh" (FE-067); drawdown/approved band (`Not available: Drawdown, Approved band, Window`); sau khi gửi, trạng thái luôn **đọc lại từ server**, không lạc quan. Form **"Preview control"** của dock Operations là bề mặt khác (khóa `command`) và **vẫn tắt** vì fixture không có recall mở để dựng `expected_versions`.
**Phán xét:** (a) 8 ký tự tối thiểu + đếm ký tự có đủ rõ? (b) trạng thái đóng có nói **ai** có thể mở nó? (c) hộp "Server reason" có giấu mã đủ để không dọa, đủ để nhờ hỗ trợ? (d) sau khi "Applied: Requested", bạn có biết bước kế tiếp (Open in Approvals)?

---

### Story 6 — Hàng đợi Approvals và yêu cầu mới (Governance approver + Researcher/analyst)

Mục tiêu: người duyệt thấy việc của mình; nhà nghiên cứu khai báo một yêu cầu mới.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/governance/approvals` | `Approvals · 30 pending · 11 overdue · 1 due soon`; dòng `Preview build. Decisions are shown here, not recorded.`; làn `All gates 30 / R1 11 / R2 8 / Exit 8 / Live 3 / Waiver / Archive / Reactivation / Capital`; lọc `Open 30 / Needs you 10 / Yours 3 / Closed`; hàng "R1 · RSI v1.7 · RC-41 · PENDING 1/2 · NEEDS YOU · 22h left · 1 of 2 approvers" | URL tự thêm `?sel=AP-352`; ảnh `20-approvals-cockpit.png` |
| 2 | Bấm hàng "RSI v1.7" | `AP-201`; `Ladder: Not published (FE-030)`; `Checklist 5 of 6 … 0 insufficient`; tiêu chí `WITHIN … Not published (FE-028)`; nút **Approve** và **Other decisions** luôn **tắt** | |
| 3 | `/governance/approvals/new` (trang) hoặc `/governance/approvals?compose=request` (ngăn kéo) hoặc nút **New request** | Form 3 bước `1 · Declare / 2 · R1 / 3 · R2`; `Alpha`, `Evidence run`, `Methodology claim`, `Summary` (`0 · min 8`); `INCOMPLETE Still needed: an alpha, an evidence run, a methodology claim, a summary of 8+ characters.`; **Submit for R1 review** tắt | `Run Library not available` (xem lưu ý) |

**Lưu ý hôm nay:** `GET /api/v1/quantbt/runs` trả 401 trên preview nên Evidence run phải **gõ tay** (`Run Library not available. Type the ids below.`) — đã ghi ở mục 2.5. URL `?compose=request` chỉ **điền form**, không bao giờ gửi.
**Cố ý KHÔNG nói:** quyết định không được ghi (`Preview · not recorded` — cockpit không gọi POST); thang duyệt/SLA/receipt (FE-030); biểu đồ bằng chứng (FE-029); tiêu chí `Not published (FE-028)`.
**Phán xét:** (a) với nút luôn tắt, người duyệt có hiểu đây là bản xem thử không? (b) "Needs you / Yours" phân biệt rõ chưa? (c) khóa phím tắt `Keys` có cần thiết? (d) form 8 ký tự tối thiểu: khớp kỳ vọng của người khai báo?

---

### Story 7 — Operations queue → incident → dock (Risk/Operations)

Mục tiêu: tìm việc cần chú ý, mở chi tiết, và biết nút nào **chưa** có tác dụng.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/execution/operations` | KPI `IN SCOPE 120 · MATCHING 61 · LOADED 50 of 61 matching · READ Available`; `Source journal unavailable`; `Not available: Triage, Verification, Source status, Severity counts (FE-043)`; tab COMMANDS / EXCEPTIONS / AUDIT; lens `Needs attention / Mine / All`; `Mine: Not published (FE-030). No assignee or creator is published, so it cannot be filtered to you.`; bảng **trống** kèm `All 50 loaded rows are older than 24H. Widen the window to see them.` | ảnh `13-operations-queue.png` (đã mở rộng) |
| 2 | Bấm **All time** (hoặc 7D/30D/90D) | URL `?range=all`; bảng hàng theo giờ `22 Aug 12:27Z …`; mỗi hàng: đích + thao tác (`Account acc_scale_063 · Sync · Real-funded · Info`), `Not published (FE-042)` (liên kết incident), chip nhận (✓ VERIFIED / ✕ REJECTED OR FAILED / ? OUTCOME UNKNOWN / ◔ PENDING / ◷ STALE: EXPIRED…) + `Source succeeded · verification succeeded`, nút **Review** | |
| 3 | Bấm **Review** ở hàng đầu | Dock `account/sync · op_SCALE_0002`; `Receipt ✓ VERIFIED`; `Triage ⚠ UNACKNOWLEDGED`; `Risk tier R3 live protective`; **Acknowledge** và **Resolve** tắt: `Not published (FE-015). ADMIN-only write, not offered yet.` / `Needs a reason and evidence, not offered yet.` + "My access"; **Esc** đóng, URL bỏ `sel` | `?sel=op_SCALE_0002`; ảnh `14-operations-dock.png` |
| 4 | Hàng `Portfolio pf_TEST_ONLY_canary · Adjust target budget · Critical`, bấm **Check original request** | Dock `Outcome unknown. Check the original request. Do not send it again.`; `Send again — Blocked until the outcome is known.`; `Open recalls the Portal controlled … No open recall that the Portal controlled on this target.` | `?sel=op_TEST_ONLY_s01` |
| 5 | `/execution/operations/incidents/inc_fixture_44` | Dock "Incident inc_fixture_44 ⚠ OPEN · WARNING"; `Open / Mitigated / Resolved`; `Forward only. Mitigated and resolved are Portal records, not a safety statement.`; `Resolving closes the incident only. It never resumes a deployment.`; 4 nút (`Acknowledge`, `Assign to me`, `Mark mitigated`, `Mark resolved`) tắt kèm `Not published (FE-015/FE-030)`; `Not available: Evidence, Operations taken, Resolution gates, Timeline, Assignee` | ảnh `15-incident-drawer.png` |

**Kết quả tốt:** bạn **không thể** vô tình bấm gửi lại lệnh có kết quả chưa biết; mỗi trạng thái "Unknown/Failed/Expired" có câu hành động.
**Cố ý KHÔNG nói:** từ hàng của queue **không mở được incident** (route-only, FE-042); ai xác nhận/giải quyết (FE-021); số tiền/hiển thị (FE-032); đếm theo trạng thái (FE-043). "Mitigated/Resolved" là bản ghi Portal, **không** là tuyên bố an toàn.
**Phán xét:** (a) mặc định 24H cho ra bảng trống — lỗi chào đón hay đúng sự thật? (b) bốn nút tắt trong incident có làm màn trông "hỏng"? (c) nhãn `NEEDS ATTENTION: UNACKNOWLEDGED` vs `Triage`; (d) nút **Review** có đúng tên với việc nó làm (mở dock)?

---

### Story 8 — Admin: Actions, Users, Access (Admin)

Mục tiêu: biết ai là ai, ai được làm gì, và hành động quản trị nào đang bật.

| # | Làm | Bạn thấy | Preview |
| --- | --- | --- | --- |
| 1 | `/administration/actions` | `Admin Actions`; `❚❚ PAUSED: RELAY OFF`; `Command authority: Fail closed. First reason nothing is live: PROJECTION, kill switch engaged.`; `All 24 · Ready 0 · Not enabled 12 · Start elsewhere 4 · Not offered 8`; `0 of 24 can run now`; nhóm READ / PORTFOLIO CAPITAL / DEPLOYMENT RISK / ACCOUNT / SYNC AND RECONCILIATION / EMERGENCY; `START IN PORTFOLIOS` kèm nút **Open** | |
| 2 | `/administration/users` | Banner `◈ AWAITING APPROVAL: STEP-UP REQUIRED / Open the current Users screen`; `Accounts 123 · Active 87 · Invited 12 · Disabled 12 · Archived 12 · Locked 5`; `Invite account Not published (FE-015, FE-026, FE-037, FE-038)`; `Role presets Not published (FE-053)`; `16 accounts are awaiting a first password.`; `123 of 123` | ảnh `16-users.png` |
| 3 | Bấm một hàng (vd Account 4) | Dock: role/state/revision/history; **Disable**, **Archive** tắt: `Account changes are made on the current Users screen.` + link `Current Users screen` | `?sel=usr_0004`; ảnh `17-users-dock.png` |
| 4 | `/administration/profile-access?workspace_id=ws_TEST_GRANTS` — tab **MY ACCESS** (tự xem) | `Signed in as Fixture reviewer`, `Owner`, `Capabilities held 14`, `Access policy Available · Revision p1_TEST_ONLY`; `WHAT YOU CAN SEE` (Overview, Portfolios, Alpha Fleet, Accounts, Operations, Approvals, Blotter, R1/R2/Canary/Live gate: `✓ CAN SEE`) và `WHAT YOU CAN DO` (`Decide at R1 gate … ALLOWED`, `Manage grants`, `Manage users`); bảng `GRANTED TO YOU` (portfolio.read Allow, alpha.metadata.edit, capital.preview `❚❚ NOT CURRENT`, report.export Deny); `POLICY: Researcher field policy Not published (FE-026)`; `Owner recovery OFF … OWNER_RECOVERY_NOT_APPROVED` | ảnh `18-access-my-access.png` |
| 5 | Các workspace khác (`ws_TEST_DENIED`, `…_UNAVAILABLE`, `…_OTHER_USER`) | `Access policy: Not available · From the access read` (phần còn lại của trang vẫn dựng từ session) | |
| 6 | Tab **MANAGE GRANTS** | **Hôm nay:** `STEP-UP REQUIRED`, `✕ Something went wrong · Could not read the access policy.` + **Retry** (fixture **không** phục vụ đọc legacy `/api/admin/profile-access`, trả 401). Đây là giới hạn của preview, không phải màn hỏng | ảnh `19-access-manage-grants-fixture-error.png` |

**Cố ý KHÔNG nói:** Users **chỉ đọc** ở V2 (ghi nằm ở màn cũ); `Last sign-in` (FE-053); policy cho researcher (FE-026); recovery chủ sở hữu (chưa duyệt).
**Phán xét:** (a) hai bảng "CAN SEE / CAN DO" có giúp bạn trả lời "tôi làm được gì?" nhanh không? (b) `Capabilities held 14` có ý nghĩa với bạn, hay nên bỏ? (c) 0 of 24 nút Admin bật: đúng kỳ vọng ở lab? (d) tên "Admin Actions" vs "Profile & Access" vs "Users" trong sidebar.

---

### Story 9 — Chip STREAM trên Fleet (Fund Manager) — **dark**

Mục tiêu: hiểu chip Live / Paused / Stopped và việc "bảng không bao giờ bị lấy đi" khi stream ngừng.

Trạng thái: khóa `fleet-stream` (cần cả `fleet`) **tắt** trên 8095. Verified: `/deployments/alphas?stage=paper` **không** có chip (`data-testid="fleet-stream"` vắng). Các bước dưới là từ `e2e/execution-v2-fleet-stream.spec.ts` (build riêng cổng 4177) và `bffDoubleManager.ts` — **sau khi lead bật khóa + rebuild**:

| # | Làm | Bạn thấy (theo spec) |
| --- | --- | --- |
| 1 | `/deployments/alphas?stage=paper` | Chip thoáng **Live**, rồi **Paused** (stream hữu hạn của fixture đóng sau một nhịp), nối lại bằng cursor đã nhận, và sau ~8 lần đóng liên tiếp chip dừng ở **Stopped**: nút `Why the stream is stopped` → `Too many reconnects. RECONNECT_LIMIT Nothing is retrying by itself; retry when ready.`; nút **Start over** thử lại |
| 2 | Bấm tab lens **All** | Chip biến mất, không còn request nào (stream chỉ tồn tại trong phạm vi đã chọn) |
| 3 | Chuyển tab trình duyệt sang nền rồi quay lại | **Paused** khi ẩn; tiếp tục bằng cursor khi hiện lại |
| 4 | Ở mọi trạng thái | Bảng `Alpha fleet` **luôn còn nguyên**; trạng thái stream không lấy mất bảng |

Các biến thể có lý do khác (`access_revoked` → `Your access to this scope changed. ACCESS_CHANGED Sign in again or request access.` không có Start over; `WHOLE_FLEET_AUTHORITY_REQUIRED`, `STREAM_AUTHORITY_NOT_GRANTED`, `STREAM_CAPACITY_REACHED` → `This read has no live stream behind it. <CODE> …`; resync quá nhiều → `Too many resyncs in a short time; stopped.`) chỉ chọn được qua `workspace_id=ws_TEST_FLEET_RT_*` ở **spec**, vì route Fleet không truyền `workspace_id` cho màn: **reviewer không tự chọn biến thể bằng URL**, chỉ thấy hành vi mặc định ở bước 1.
**Cố ý KHÔNG nói:** "đang nhận dữ liệu thật". Server mẫu chỉ gửi **một heartbeat rồi kết thúc**; chip này chứng minh **máy trạng thái và lời lẽ**, không chứng minh độ trễ hay revoke thật. Notice nguồn của Edge là `NOT_COMMISSIONED` (DEBT-026).
**Phán xét:** (a) "Live/Paused/Stopped" có thật sự báo điều bạn cần (dữ liệu có mới không)? (b) chip nằm đúng chỗ, không chen với KPI? (c) `Start over` có đúng tên? (d) bạn muốn thấy tuổi dữ liệu thay vì tên trạng thái?

---

### Story 10 — Vòng điện thoại 390 px: Users / Live / Blotter (mọi persona)

Mục tiêu: dùng được bằng một tay, không cuộn ngang, không mất chữ.

Mở bằng DevTools device mode 390×844, hoặc trình duyệt điện thoại tới `http://127.0.0.1:8095`.

| # | URL | Bạn thấy (đo trên preview, verified) | Kỳ vọng sau rebuild |
| --- | --- | --- | --- |
| 1 | `/administration/users` | Không tràn ngang (0 px); mỗi tài khoản là một thẻ (STATE / ROLE / REVISION); menu sidebar thu vào nút hamburger; **50 hàng, cao ~7 800 px** | Mười thẻ + `Load more` (DEBT-031 đóng phần Users) |
| 2 | `/deployments/live/dep_live_01` | Cao ~1 900 px, không tràn; `Live / Real capital at risk / Live operations`; `Source not qualified.`; `Not available: Capital, Gross notional, Daily P&L, Open orders, Broker equity`; thang bảo vệ `PROTECTIVE LADDER Halt → Reduce → Close` (3 bậc, tắt: `Not offered in the portal yet · Basis: none published · Step-up: not determined`); `WHAT IS BLOCKING` (9 dòng) | cùng |
| 3 | `/deployments/blotter` | Không tràn; **10** thẻ (`Showing 10 of 300 authorized`) + Newer/Older, cao ~2 900 px | cùng |
| 4 | `/deployments/alphas/alpha_btc_trend?tab=orders` | 9 hàng | Ba hàng mỗi bảng + `Load more` |
| 5 | Mọi màn ở bước 1–3, dùng **Tab** | Skip link `Skip to main content`; thứ tự focus hợp lý; dock đóng bằng Esc | |

Ảnh 390 px: `phone-390-users.png`, `phone-390-live.png`, `phone-390-blotter.png`, `phone-390-alpha-orders.png` (chụp **viewport**, 1 màn hình đầu, không phải trang dài).
**Phán xét:** (a) thẻ phone có giữ được thông tin quan trọng nhất ở dòng đầu? (b) trang quá dài khiến bạn mất vị trí? (c) vùng chạm nút ≥ 44 px? (d) chữ không bị cắt (nhãn trục, giá trị cuối)?

---

## 2. Cheat-sheet "trung thực dữ liệu"

### 2.1 Vì sao ô nói "Not available"

Nguyên tắc: **không bao giờ in `0`, `-` hay `N/A` thay cho số vắng**. Giá trị vắng luôn thành một câu có lý do. Một giá trị `0` chỉ xuất hiện khi nguồn **công bố** là 0.

| Cách viết trên màn | Nghĩa |
| --- | --- |
| `Not available: A, B, C` + nút `?` | Một dòng gom các ô chưa có giá trị; `?` mở **lý do từng ô + mã yêu cầu FE** |
| `Not published (FE-nnn)` (trong ô/nút) | Server chưa công bố trường đó; `FE-nnn` là thẻ yêu cầu backend (sổ `backend-requests.md`) |
| `Not applied: Environment, Window` (thanh CONTEXT) | Lần đọc của màn **không có** tham số đó; thanh chỉ để xem |
| `Withheld` | Người xem không được thấy (vd địa chỉ broker) |
| `Hidden` (Live) | Có giá trị nhưng bị ẩn có chủ ý (không rò giá trị broker khi lệch) |
| `Not computed` | Có đủ nguyên liệu nhưng **không được suy ra ở trình duyệt** (vd chênh lệch số dư dùng chung) |
| `Showing N of M`, `Latest 5 of 12 entries, no older page`, `Server: 200 of 1,438 points` | Danh sách/biểu đồ bị **giới hạn**; luôn nêu giới hạn |
| `(stale)`, `STALE 14 MIN`, `PARTIAL`, `DISPLAY CATCHING UP` | Dữ liệu cũ/thiếu/chậm; không gộp thành "xanh" |
| `OUTCOME UNKNOWN` | Không biết lệnh có thành công không; **cấm gửi lại** |

### 2.2 Các họ lý do (bấm `?`, hoặc nhìn câu dưới nút)

| Họ | Ví dụ chữ trên màn | Nghĩa | Mở khóa khi |
| --- | --- | --- | --- |
| **Nguồn chưa được đưa vào** (not commissioned) | `Not offered in the portal yet`; `source.edge_notice_source NOT_COMMISSIONED`; `Source not qualified.`; `Source journal unavailable` | Chưa có route/nguồn nào ở phía hệ thống thật | Edge/Core đưa nguồn vào + Codex nhận route |
| **Ngoài phạm vi lần đọc này** | `This screen's read has no environment filter.`; `Window applies when the server supports it.`; `…cannot be limited to one portfolio` | Contract hiện tại không có tham số đó | Codex công bố tham số (FE-025, FE-041…) |
| **Chính sách chưa bật** | `Access policy isn't active for your workspace yet` (POLICY_PENDING); `Restricted view isn't available yet`; `Owner recovery has not been approved, so it is off.`; `Researcher field policy Not published (FE-026)` | Quy tắc quyền/riêng tư chưa được duyệt | Bobby/Codex duyệt chính sách |
| **Chưa công bố trường** | `Not published (FE-005)`, `(FE-013)`… | Nguồn có thể có, hợp đồng chưa có trường | Codex thêm field (additive) |
| **Không có quyền** | `You don't have access to this action here`; `Needs the Admin role`; `Needs the approver grant` | Bạn thiếu grant | Cấp grant (Admin) |
| **Đóng có chủ ý ở bản build này** | `Live decisions are closed on this build`; `Read-only on this build`; `Relay is not qualified yet`; `kill switch engaged` | Lệnh bị khóa cho tới khi relay/step-up được nhận | Codex nhận relay + step-up; Bobby mở |
| **Khớp/đối soát chưa có kết quả** | `Not computed`; `NO VERDICT Shared binding…` | Trình duyệt không tự tính | Nguồn TS/PM công bố verdict |
| **Fixture từ chối ghi** | `HTTP_405` / `The server did not record this request` | `FIXTURE_WRITES=refuse` | Đặt `doubles` (0.5) — chỉ để xem trạng thái đóng hộp |

### 2.3 Giải mã mã `FE-nnn` hay gặp (từ bảng `FE_REQUEST_LABEL`)

| Mã | Nghĩa | Mã | Nghĩa |
| --- | --- | --- | --- |
| FE-005 | Tổng theo cửa sổ và tập trung | FE-029 | Bằng chứng, baseline, liên kết run |
| FE-006 | Return (phương pháp theo nguồn) | FE-030 | Người tạo, thang, SLA, "needs you" |
| FE-011 | Score | FE-031 | Event feed |
| FE-012 | Group by | FE-032 | Trạng thái nhận và số tiền |
| FE-013 | NAV và drawdown | FE-033 | Compare |
| FE-015 | Quyền theo hàng + lý do nút tắt | FE-034 | Danh sách Archived |
| FE-016 | Export | FE-035 | Map |
| FE-017 | Báo cáo vốn | FE-066 | Tên alpha/portfolio trên deployment |
| FE-020 | Xem trước lệnh | FE-067 | Runtime, đối soát, phiên |
| FE-021 | Nguồn audit: ai làm gì | FE-068 | Quyền cho hành động stage |
| FE-025 | Cửa sổ (window) | FE-069 | New request: run list, phạm vi alpha |
| FE-026 | Chính sách trường cho researcher | FE-070 | Lịch phiên VN |
| FE-027/028 | Lifecycle stage / tiêu chí gate | FE-071/072 | Envelope Canary / hàng-chuỗi có kiểu |

### 2.4 FIXTURE_LAB nghĩa là gì, và cái gì **chưa được chứng minh**

- Dữ liệu = **bịa có hình dạng đúng** + một số fixture "TEST_ONLY_SYNTHETIC" do Codex phát hành.
- **Không có** bằng chứng kết nối: chưa có lần đọc nào đi từ Trading System → Edge → Core → Control API → trình duyệt. ELP2-10 vẫn **NOT_MET**; Core009 `PREPARED_SOURCE_ONLY`; các phép đo M-1…M-7/G2 chờ Core009 + nguồn tài chính.
- Danh tính "Fixture reviewer", banner và `sessionId fixture-lab-no-session` là **nhãn**, không phải bằng chứng danh tính/quyền.
- `Read 21 Oct …Z` ở Access là đồng hồ trình duyệt của bạn; các giờ khác là giờ **cố định của fixture** (`FIXTURE_NOW_ISO`). "14 min ago", "46 d ago" trong Accounts trôi theo đồng hồ trình duyệt.
- Ảnh/screenshot chứng minh cách màn hình trông, không chứng minh server thật trả gì.

### 2.5 Điểm không nhất quán đã biết của fixture (đừng tính là lỗi UI)

| Quan sát (verified) | Nguyên nhân |
| --- | --- |
| Fleet hàng `alpha_a` ghi `1 deployment` nhưng Alpha 360 `alpha_a` hiện 4 stage | Hai double khác nhau; Alpha 360 trả cùng một bộ cho **mọi** alpha id |
| Link từ Blotter mở alpha `adaptive_hma_cpp_00115m` rồi nói `Order ord_00300 is not among the 6 loaded orders` | Alpha 360 mẫu không chứa lệnh blotter; câu này **là** hành vi trung thực |
| `NAV 99.25 USDT` giống nhau ở Overview, Portfolio, Compare; Compare: `Satellite 99.25` vs `Basis Book 06 4,990.00` | Một chuỗi NAV mẫu dùng lại |
| Console luôn có `404 GET /api/v1/execution/retained-review` | double trả 404 có kiểu "not configured"; Playwright cũng bỏ qua dòng này |
| Portfolio 360: `503 …/portfolios/pf_TEST_ONLY_core/correlation` | trạng thái "unavailable" có kiểu (`No correlation data source`) |
| Access: `401 GET /api/admin/profile-access` | fixture không phục vụ đọc legacy → "Manage grants" báo `Could not read the access policy.` |
| New request: `401 GET /api/v1/quantbt/runs` → `Run Library not available` | cấu hình route của preview; README ghi fixture phục vụ route này nhưng thực tế trả 401 — báo lead |
| Portfolio 360 → tab ACCOUNTS → `Binance-02` = `ACCOUNT_NOT_FOUND: no account Binance-02` (mã thô hiện ra) | id của portfolio và id của double Account không khớp; vẫn là điểm để bạn chấm "mã thô" (mục 4, #9) |
| Trang có link `tradingview.com` trong biểu đồ nến | thư viện biểu đồ (attribution); không có request ra ngoài origin |

---

## 3. Còn chờ Codex / Edge / PM / TS (mở khóa bằng gì, ai)

Nguồn: `backend-requests.md`, `debt-register.json`, `DEBT_RECONCILIATION_2026-10-21.md` mục 5. Cột "Chủ" theo sổ; Codex xác nhận lần cuối.

| Bạn thấy trên màn | Mã | Mở khóa bằng | Chủ |
| --- | --- | --- | --- |
| Net PnL / Return / Window / `Not applied: Window` | FE-005/006/025/041 | tham số cửa sổ + phương pháp return theo nguồn | Codex (contract), PM (số) |
| NAV, drawdown, chuỗi NAV | FE-013 | nguồn NAV (sổ NAV) | PM / Core |
| NET_PNL có thể nhân đôi ở account dùng chung | DEBT-029 | ánh xạ producer chọn bởi PM/Edge | PM, Edge |
| Score | FE-011 | chính sách chấm điểm | Bobby + Codex |
| Lifecycle "xong R1/R2", tiêu chí gate, ngày vào stage | FE-027/028 | nguồn gate + ngày | TS / Core, Codex |
| Runtime, Reconciliation, Sessions (`NOT AVAILABLE Runtime, Reconciliation`) | FE-067 | `runtime_state`, verdict đối soát, hàng phiên | TS |
| Tên alpha/portfolio trên deployment | FE-066 | field tên nullable | Codex, TS |
| Nút vốn luôn tắt; câu `Not published (FE-015)`; Return/Lock/Deploy không có action | FE-015/060, DEBT-042 | thêm action vào từ vựng eligibility | Codex, PM |
| Xem trước lệnh (`PREVIEW UNAVAILABLE`), ghi từ Operations/Admin | FE-020 | relay được nhận + step-up | Codex, Edge |
| `Live decisions are closed on this build`, Halt/Reduce/Emergency close | FE-068/071 | relay + step-up, Bobby mở | Codex, Edge, Bobby |
| Ai làm gì / receipt / audit | FE-021/031/032 | nguồn audit + feed sự kiện | Edge / Core |
| Mở incident từ hàng queue | FE-042 | `incident_id` trên item | Codex |
| Đếm theo trạng thái ở Operations | FE-043, DEBT-028 | `status_counts` opt-in (B1) | Claude (BE) + Codex review |
| Compare nâng cao, Archived, Map, Group by | FE-033/034/035/012 | nguồn + contract | Codex |
| Canary envelope / rollback / ngày trial; Live `Source not qualified.` | FE-071 | nguồn Canary/Live đủ điều kiện | Edge + TS |
| Cột Positions/Orders/Triad có số; chart Live net PnL | FE-072 | schema có kiểu cho hàng và chuỗi | Codex + TS |
| Lịch VN market | FE-070 | read lịch theo venue | Codex |
| Account: margin ratio, product, long/short/gross | FE-050/051 | thêm field | TS / Edge |
| Export Blotter; deployment/slippage/fee từng lệnh | FE-016/052 | field + route export | Codex |
| Users: `Last sign-in`, role presets | FE-053 | field | Codex |
| Researcher field policy; Owner recovery | FE-026 | chính sách được duyệt | Bobby |
| New request: danh sách run đủ, tra theo request key | FE-069 | `alpha_id` filter + cursor + lookup | Codex |
| Chip STREAM thật: quyền stream, notice nguồn, revoke | DEBT-026/027 | Edge đưa notice nguồn; nối revoke xuyên process | Edge, Claude (BE) |
| Slice phân trang (`/execution/slice`) | DEBT-030 | operation trang kế đã sinh sẵn | Codex → Claude |
| Records history cap 200 | DEBT-047/FE-073 | đo chiều sâu history | Codex |
| Mọi thứ "kết nối thật", danh tính thật, đăng nhập | ELP2-10, Core009 | ca kết nối original08, nginx `real-routes`, quyết định bước D | Edge + Core + Codex + Bobby |

---

## 4. Checklist reviewer cho **mỗi màn** (10 mục)

Đánh dấu cho từng màn bạn mở; ghi sai lệch vào mục 5.

| # | Kiểm | Cách thử | Đạt khi |
| --- | --- | --- | --- |
| 1 | **Header** | Nhìn đầu trang | Tên màn đúng, breadcrumb đúng, dải FIXTURE vàng có, ngữ cảnh/`Not applied` đúng |
| 2 | **Trạng thái rỗng** | Chọn lọc cho ra 0 hàng (vd Operations 24H, Blotter lọc lạ) | Có câu giải thích + việc làm tiếp, không bảng trắng |
| 3 | **Một dòng "Not available"** | Tìm dòng `Not available: …`; bấm `?` | Mỗi màn/panel chỉ một dòng; `?` cho lý do + mã FE; không có `0`/`-`/`N/A` thay số |
| 4 | **Định dạng giờ** | Đọc mọi mốc giờ | Luôn UTC (`17 Oct 09:00Z` hoặc `2026-10-17 12:04:00 UTC`); không giờ địa phương |
| 5 | **Số chính xác** | Nhìn số lớn/số thập phân (Live `?workspace_id=ws_TEST_SCOPED_V2`: `9,007,199,254,740,993.1235`) | Không viết tắt, không làm tròn ngầm; âm/dương rõ; đơn vị tiền kèm theo |
| 6 | **Bàn phím** | Tab xuyên màn; mở dock bằng Enter; Esc | Có skip link; focus nhìn thấy; dock đóng bằng Esc và trả focus; chip không chỉ bằng màu |
| 7 | **390 px** | Thu hẹp 390 px | Không cuộn ngang; thẻ giữ thông tin chính; nút ≥ 44 px |
| 8 | **Console sạch** | DevTools Console | Chỉ có dòng đã biết (2.5): `404 …/retained-review`, và các 401/503/405 đã nêu; không lỗi JS, không request ra ngoài origin |
| 9 | **Không lộ mã thô** | Đọc mọi chữ | Không `HTTP_405`, `UNKNOWN_*`, `undefined`, `[object Object]` ngoài hộp "Server reason"/`?`; (hôm nay còn `HTTP_405` trên Paper exit — dự kiến hết sau rebuild) |
| 10 | **Câu chữ (copy)** | Đọc nhãn/nút/lý do | Tiếng Anh nhất quán; "Request review" vs "Submit for R1 review" đúng ý; không hứa điều chưa làm được |

---

## 5. Mẫu phản hồi (copy bảng này)

Độ nghiêm trọng: **B** = chặn quyết định, **M** = sai/gây hiểu nhầm, **m** = nhỏ/thẩm mỹ, **Q** = câu hỏi.

| Màn (URL) | Bạn thấy gì | Mong đợi gì | Mức | Story |
| --- | --- | --- | --- | --- |
| _vd_ `/deployments/portfolios/pf_TEST_ONLY_core?sel=rail:actions` | 6 nút tắt cùng một câu dài | Gom thành một câu + danh sách ngắn | m | 2 |
| | | | | |
| | | | | |

---

## Phụ lục A — URL đã nạp (Chromium host, chỉ đọc, 1440 px, 2026-10-21)

Tất cả trả **200 và dựng đúng màn** trừ ba dòng cuối.

| URL | Kết quả |
| --- | --- |
| `/execution` · `/deployments/alphas` · `/deployments/alphas?stage=paper` (+ `&view=board`) | OK |
| `/deployments/alphas/alpha_btc_trend` (+ `?tab=deployments|orders|activity|evidence|regime|replay`, `?tab=replay&focus=order:ord_007`) | OK |
| `/deployments/alphas/alpha_a?from=fleet` · `/deployments/alphas/adaptive_hma_cpp_00115m?tab=Trade+Replay&focus=order:ord_00300&from=blotter` | OK |
| `/deployments/portfolios` · `/deployments/portfolios/pf_TEST_ONLY_core` (+ `?tab=allocations|alphas|accounts|risk|people`, `?sel=rail:actions`, `&workspace_id=ws_TEST_ONLY`) | OK (rail không đổi theo workspace: bản cũ) |
| `/deployments/portfolios?view=compare&in=…` (core+satellite; satellite+`pf_scale_006`; `pf_scale_006`+`pf_scale_001`; satellite+`pf_scale_012`) | OK |
| `/deployments/accounts` · `/deployments/accounts/acc_bnc_core` (+ `?tab=pos|all|fee|rec|act`) | OK |
| `/deployments/accounts/Binance-02` (link từ Portfolio 360) | Màn dựng nhưng nội dung là lỗi fixture `ACCOUNT_NOT_FOUND` |
| `/deployments/blotter` (+ `?status=REJECTED`) | OK |
| `/deployments/paper/dep_paper_01` (+ `?tab=fills`, `?workspace_id=ws_TEST_ONLY_shared`, `ws_TEST_EXIT_OFF`, `dep_exit_*`) | OK; gửi → 405 (writes=refuse) |
| `/deployments/sandbox/dep_sandbox_01` · `/deployments/live/dep_canary_01/canary` · `/deployments/live/dep_live_01` (+ `?workspace_id=ws_TEST_SCOPED_V2`) | OK |
| `/execution/operations` (+ `?range=all`, `&sel=op_SCALE_0002`, `&sel=op_TEST_ONLY_s01`) · `/execution/operations/incidents/inc_fixture_44` | OK |
| `/governance/approvals` · `/governance/approvals/AP-201/r1` (chuyển về danh sách `?sel=…`) · `/governance/approvals/new` · `/governance/approvals?compose=request` | OK (Run Library 401) |
| `/administration/actions` · `/administration/users` (+ `?sel=usr_0004`) · `/administration/profile-access?workspace_id=ws_TEST_GRANTS|…_EMPTY|…_DENIED|…_UNAVAILABLE|…_OTHER_USER` | OK; tab MANAGE GRANTS → lỗi fixture |
| `/deployments/compare?in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite` | **KHÔNG tải đúng** trên 8095: "No data yet" (registry rev 8) — **sau rebuild** |
| `/execution/slice?fixture=chain` | **KHÔNG tải đúng**: rơi về Command Center "No data yet" (khóa `scoped` tắt) — **dark** |
| `/execution/command` và chip STREAM Fleet | **dark** (khóa `command`, `fleet-stream` tắt) |

Spec tham chiếu: `apps/portal/frontend/e2e/v2Lane.ts` (bảng `SCREENS`), `execution-v2-paper-exit.spec.ts`, `execution-v2-fleet-stream.spec.ts`, `execution-v2-scoped-pager.spec.ts`, `execution-v2-s1.spec.ts`; mô tả preview: `deploy/research-preview/README-fixture.md`; biên nhận: `frontend-receipt.md`.
