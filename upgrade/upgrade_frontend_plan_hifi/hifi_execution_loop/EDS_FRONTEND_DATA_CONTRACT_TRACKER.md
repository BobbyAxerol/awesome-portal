# EDS ↔ Frontend Data Contract Tracker — sổ theo dõi & phản biện song hành chiến dịch EDS

Ngày lập: 2026-09-04 · Người giữ bút: Claude (FE/UIUX lead) · codex ghi cột **[CODEX]** của mình, không sửa phần còn lại · Bobby quyết các ô ⚖.

**Mục đích (owner order 2026-09-04):** track qua từng phase EDS xem backend còn
thiếu gì để MỌI yếu tố động của frontend chuẩn showcase đều active và hiển thị
đúng dữ liệu — *chart nào cũng có số, bảng nào cũng có hàng, ở mọi màn lớn nhỏ* —
và phản biện kịp thời để những gì làm lệch chuẩn FE có một phase sửa (đề xuất
**EDS-R**, §5). Dữ liệu từ Trading System giữ đúng chuẩn của nó — Portal không
bịa, không làm mượt, không suy diễn.

**Cách đọc trạng thái:** `●` đang đúng/đủ hôm nay (đo thật 03-09) · `◐` một phần
· `○` trống nhưng ĐÚNG (nguồn chưa có/typed gap) · `✗` sai/lệch cần sửa · `⏳`
chờ phase EDS ghi ở cột đó · `⚖` chờ Bobby.

Nguồn sự thật khi mâu thuẫn: runtime evidence → E7 pack → unified plan §17 →
file này → ghi chú cũ. Mọi ô "hôm nay" trong file này lấy từ probe đăng nhập
thật 03-09 (§16 unified plan) — không suy đoán.

---

## 1. Bản đồ liên kết màn — identity đi qua từng cạnh

Mọi điều hướng mang MỘT khóa định danh chuẩn nguồn (EDS-04 cấm heuristic):

```text
Command Center ─(profile)→ Paper/Sandbox/Live Overview
  Overview ─(deployment_id = strategy:mode:venue:account)→ Workbench
  Overview ─(alpha nhấp tile)→ Alpha 360 ─(strategy_id)→ mọi panel con
Alpha Fleet List ─(strategy_id)→ Alpha 360 ─(deployment_id)→ Workbench ─(client_order_id)→ Blotter row
Portfolio List ─(portfolio_id)→ Portfolio 360 ─(allocation → account_id)→ Account 360
Accounts & Bindings List ─(binding_id | account_id)→ Binding detail / Account 360
Approval Inbox ─(approval_id)→ R1/R2/Live/Exit Review ─(subject id)→ màn subject tương ứng
Operations Queue ─(operation_id)→ Incident Detail ─(execution_session_id)→ Blotter lọc phiên
Canary ─(live profile + canary state)→ Live Full Operations
```

Quy tắc gắn kết: id hiển thị = tên từ entity-name registry (EDS-04), id kỹ thuật
chỉ nằm trong URL/state; con trỏ điều hướng KHÔNG bao giờ là source cursor.

---

## 2. Ma trận màn × yếu tố — cái gì cần gì để SỐNG

### 2.1 Command Center (màn lớn nhất — cửa ngõ)
| Yếu tố động | Dữ liệu cần | Nguồn | EDS | Hôm nay | Thiếu để active |
|---|---|---|---|---|---|
| KPI strip (fleet/sessions/incidents) | counts theo profile | sessions+deployments+findings | 03/05 | ● (5.7KB, compact) | — |
| Funnel bars grow-in | order_funnel counts | orders hot page → EDS-11 revision | 05 ⏸CHƯA MỞ | ● | — |
| Tick-flash ô số (data-tick) | delta thật khi có fill/order mới | SSE revision delta | 11 | ○ im — ĐÚNG vì halt | ⚖ un-halt |
| Freshness dot thở (FRESH) | freshness từ envelope | serving completeness | 02 ⏸CHƯA MỞ | ✗ PARTIAL toàn cục ghìm | DR-04 |
| SLA pulse (overdue) | approvals + sla clock | Portal workflow | 05 | ○ chưa có approval thật | dữ liệu governance |
| Needs-you rows | findings/dead-letter/waivers | reconciliation + Portal | 05 | ○ nguồn 0 rows — đúng | Ask D |

### 2.2 Paper Overview (PAPER_TRADING_SCREEN)
| Yếu tố | Dữ liệu | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|---|
| Equity by stage chart (hero) | series (t,v) 30d DERIVED-sum + band | mirror → chart DTO | **07** | ✗ đang 200 rows thô (cap BFF) — chart vỡ | **DR-09: không đợi 07, vá ngay theo §14-FixA** |
| Stage ladder / deployment tiles | deployments 43 + state | strategy_deployments | 03 ⏸CHƯA MỞ | ● | — |
| Contribution by venue | latest performance per venue | performance snapshots | 03 | ◐ số có, dừng 17/08 | un-halt |
| Sessions table | execution_sessions trang nóng | sessions | 03 | ● 100 rows | — |
| Freshness/completeness chrome | serving completeness | envelope v2 | 02 | ✗ PARTIAL vĩnh viễn | DR-04 |

### 2.3 Paper Workbench (+ VNM variant)
| Yếu tố | Dữ liệu | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|---|
| Equity/performance charts per-deployment | full 30d series downsample khai báo | mirror | 07 ⏸CHƯA MỞ | ● 1.540+1.699 điểm ĐÚNG dải | payload 5.9MB → DTO (t,v) DR-05 |
| Orders/Fills tabs | trang theo deployment | orders/fills mirror-index | 06 ⏸CHƯA MỞ | ✗ 0 rows (trang nóng 400 không chứa dep) | EDS-06 resource index |
| Position/risk tiles | positions + risk grants | positions_v2, risk_grants | 03/04 | ◐ 2 positions | — |
| VNM session shading | venue calendar | MC-06/Ask B | — | ○ typed | nguồn |
| Observation gate panel | Portal workflow | Portal | 05 | ● | — |

### 2.4 Full Blotter
| Yếu tố | Dữ liệu | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|---|
| Bảng orders/fills/journal 10⁵+ keyset ảo hoá | mirror transactional + index | EDS-06 | ◐ 93/63/100 trang nóng (240KB PARTIAL) | EDS-06; population nhỏ THẬT do idle+halt ⚖ |
| Conditional groups/legs | nguồn 0 rows | — | 03 | ○ đúng | xác nhận Ask D |
| Số exact không viết tắt | decimal strings | contract | 02 | ● | — |

### 2.5 Alpha Fleet List
| Yếu tố | Dữ liệu | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|---|
| Bảng fleet 43 dòng + state chips | strategies+deployments join server | EDS-04 op | 04 ⏸CHƯA MỞ | ● từ snapshot | chuyển named op |
| Sparkline 7d mỗi dòng | mini series per alpha | mirror daily/hourly | 07 | ✗ chưa serve | chart DTO nhỏ (đã demo artifact) |
| Lineage/reject counters | lineage_rejects envelope | worker | 03 | ● | — |

### 2.6 Alpha 360 (insight — 12 capability)
| Tile | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| stage-equity series | mirror subject depth | 07 | ● 1.540 điểm đúng 30d | DTO gọn DR-05 |
| exact-query / order-funnel / execution-quality / replay-journal | snapshot+journal | 03/05 | ● | — |
| position-exposure | positions | 03 | ◐ | un-halt cho sống động |
| contribution | fills→mirror time-dim | 07 | ✗ EMPTY (fills lệch trang nóng) | §14-E1s2 hoặc EDS-07 |
| portfolio-correlation · drawdown-overlap | mirror daily closes | (đã ship 03-09) | ● 66 cặp/43 alpha | EDS-06 absorb DR-01 |
| market-candles · rho-benchmark · canary-drift | MC-01..09 | 10 | ○ typed đúng | Ask B |

### 2.7 Portfolio List / Portfolio 360
| Yếu tố | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| Danh sách 2 portfolio + capital | portfolios+allocations | 04 | ● | — |
| Equity chart | DERIVED sum chính thức (1.3 CLOSED) | 07 | ◐ derived sống nhờ mirror | DTO |
| Correlation matrix | như 2.6 | — | ● | — |
| Capital ledger timeline | MC-01 events | 08→10 | ○ typed | Ask B |
| rho-vs-benchmark | benchmark series | 08→10 | ○ typed | Ask B |

### 2.8 Accounts & Bindings List / Account 360 / Binding detail
| Yếu tố | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| Balances panel | scoped view (release kit STAGED) | 06↔kit | ✗ lineage-reject mọi profile | **⚖ cửa sổ deploy Ask A** |
| Margin / sync / broker-sync / venue accounts | bảng nguồn 0 rows THẬT | 03 | ○ đúng | Ask D (trading sản xuất) |
| Account equity mini-chart | mirror per account | 07 | ⏳ | EDS-07 |
| Binding spine (binding_id) | venue_accounts | 04 | ○ | Ask D |

### 2.9 Sandbox Overview / Certification
| Yếu tố | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| Khung 35 deployments | ● ready/COMPLETE 15KB | 03 | ● | — |
| Sessions/margin/sync evidence | sandbox CHƯA TỪNG chạy | — | ○ đúng | ⚖ chạy sandbox cycles |

### 2.10 Live Overview / Live Full Operations / Canary
| Yếu tố | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| Toàn bộ bảng live | live accounts=0, HALTED by design | 03 | ○ `empty/COMPLETE` — chuẩn | ⚖ live activation |
| Tick/mark panel | market ticks MC | 10 | ○ typed | Ask B |
| Canary drift tile | twin join | 08→10 | ○ typed | Ask B + live |

### 2.11 Governance: Approval Inbox / R1-R2-Live / Exit Review / Waivers / New Approval
| Yếu tố | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| Bảng inbox + SLA + badges pulse | Portal workflow store | 05 | ◐ khung chạy, ít bản ghi thật | dòng chảy phê duyệt thật khi vận hành |
| Evidence links sang subject | composite revision | 05 | ⏳ | EDS-05 |

### 2.12 Operations Queue / Incident Detail / Admin Drawer (read)
| Yếu tố | Nguồn | EDS | Hôm nay | Thiếu |
|---|---|---|---|---|
| Queue + incident timeline | Portal ops + journal metadata redacted | 05 | ◐ | EDS-05 named ops |
| Dead-letter summaries | nguồn | 03 | ○ | — |
| Command journal panel | redacted metadata | 05 | ● 100 rows | — |

---

## 3. Điều kiện NGOÀI code để "mọi yếu tố động active" (không phase nào tự làm được)

| # | Điều kiện | Mở khóa gì | Chủ |
|---|---|---|---|
| P1 | **Un-halt** 3 khóa Redis | CC tick-flash, funnel sống, performance nối lại sau 17/08, blotter population lớn dần, workbench orders/fills sống | ⚖ Bobby |
| P2 | Cửa sổ deploy **Ask A** (release kit balances + census edge) | Account/Bindings panels, hết lineage-reject, PARTIAL bớt một nguồn | ⚖ Bobby + codex |
| P3 | **Ask B** MC-01..09 | candles, benchmark/rho, ticks, calendar VNM, twin/canary, capital ledger | Trading owner |
| P4 | **Ask C** marking oscillation | equity signalcombine hết răng giả (nếu là defect) | Trading owner |
| P5 | **Ask D** 3 bảng rỗng + sandbox cycles | venue/margin/sync panels, màn Sandbox có ruột | Trading owner |
| P6 | Live activation | toàn cụm Live/Canary | ⚖ Bobby |

---

## 4. Track theo phase EDS — FE nhận gì, thiếu gì thì chưa đạt "khớp 100%"

> Cách CHẤM từng phase: xem §A cuối file này (bảng §A0 = "đến đâu rồi").

| Phase | FE phải NHẬN được (điều kiện G5 từ phía FE) | Trạng thái | [CODEX] |
|---|---|---|---|
| 01 | 1 named op + fixture + bảng field-map cũ→mới cho vertical đầu | **CHƯA MỞ** (04-09: không ladder entry, không `MaximumDataOperationRegistry` trong code) | |
| 02 | generated TS types vào packages/contracts; **bảng map enum panel-state ↔ U02** (READY/ERROR ↔ ready/terminal…); envelope tách serving/population completeness (DR-04) | ⏳ | |
| 03 | mỗi màn stage: field-map + fixtures + lý do typed cho từng ô §2; **Paper Overview hết cap 200** (DR-09) | ⏳ | |
| 04 | resource ops + entity-name registry + khóa chuẩn theo §1 | ⏳ | |
| 05 | 5 derivation + governance/ops named ops, formula/version hiển thị được | ⏳ | |
| 06 | tuyên bố absorb/replace với mirror hiện hành (DR-01); index resource cho workbench/blotter; parity old/new để FE diff | ⏳ | |
| 07 | chart DTO đúng **một từ vựng downsample** (DR-05) đủ nuôi PrimusFinancialChart + sparkline fleet + contribution time-dim; chartTheme.ts chung uPlot+ECharts (quyết định owner 04-09) | ⏳ | |
| 08 ⏸CHƯA MỞ | owner packet HỢP NHẤT với BR-EX-79 A–E (DR-07) — **theo OR-1: không còn là blocker, chỉ là asks-nâng-cấp** | ⏳ | |
| 09 | không yêu cầu FE; FE chỉ cần event fixtures từ contract đã freeze | **WIP chưa commit** (+264/−21, 5 file edge, đo 04-09) — và bị khoá bởi EDS-08 `EVENT_SOURCE_ACCEPTED` chưa có → chưa thể yield gì cho màn hình | |
| 10 | candle DTO + quyết định renderer candle (lightweight-charts, chờ ⚖ attribution) | ⏳ | |
| 11 | SSE resume + **revision-tick attribute per panel cho motion** (DR-06); action graph semantic | ⏳ | |
| 12 | budget số cụ thể per route (≤300KB, p95…) trong gate; gói review owner | ⏳ | |

---

## 5. SỔ PHẢN BIỆN — Discrepancy & Repair ledger (đề xuất phase **EDS-R** trước EDS-11 để trả nợ)

| DR | Phát hiện (bằng chứng) | Nặng | Sửa ở | Trạng thái | [CODEX] |
|---|---|---|---|---|---|
| DR-01 | EDS-06 xây mirror mới trong khi `execution_timeseries_history` + downsampled read + history endpoint + N25 stats ĐANG chạy prod-dev — chưa có tuyên bố absorb/replace → nguy cơ 2 kho lệch | CAO | 06 | OPEN | |
| DR-02 | ~~Baseline lệch~~ **ĐÃ TỰ KIỂM VÀ RÚT LẠI 04-09**: `dcf580c ⊂ 6f6503e` — codex đã fast-forward đúng, baseline CHỨA trọn công việc 03-09 (E1..E7 là chuỗi commit mới phía trên). DR đóng, ghi lại để minh bạch | — | — | **CLOSED-RETRACTED** | |
| DR-03 | 5 file WIP edge nằm working tree chung >1 ngày — vi phạm single-writer, chặn build sạch. **Cập nhật 04-09: WIP đã phình +264/−21 và là chính nội dung EDS-09 (xem DR-11) — càng cần commit lên nhánh phụ ngay** | TB | codex commit/tách nhánh | OPEN | |
| DR-04 | Completeness trộn serving/population → PARTIAL vĩnh viễn, ghìm polish + motion mọi màn (đo 03-09) | CAO | 02 | OPEN | |
| DR-05 | Hai từ vựng downsample (đã ship vs §11.7) — FE chỉ được học một | TB | 07 | OPEN | |
| DR-06 | EDS-11 thiếu cơ chế motion khi kept-mounted (revision-tick per panel) — không có thì showcase-motion không bao giờ nổ lại | TB | 11 | OPEN | |
| DR-07 | EDS-08 packet và BR-EX-79 FINAL (A–E) đang là 2 kênh tới cùng source owner | TB | 08 | **ĐÓNG 05-09** — addendum EDS-09 ghi parent MC-01, tự tuyên bố không cạnh tranh; đã kiểm | |
| DR-08 | §17.2 chưa ghi fact: cursor TTL read-plane paper = 48h (đã deploy) | THẤP | 17.2 | OPEN | |
| DR-09 | Paper Overview cap 200 rows làm chart hero vỡ NGAY HÔM NAY — không được đợi tới EDS-06/07; vá theo §14-FixA (DERIVED-sum series từ mirror) rồi EDS thay sau | CAO | ngay | OPEN — Claude nhận làm | |
| DR-10 | Payload budget chưa là con số per-phase (5.9MB workbench, 2.4MB alpha đo thật) | TB | 07/12 | OPEN | |
| DR-11 | **Đảo thứ tự adapt-first (đo 04-09)**: codex đang code EDS-09 (5 file WIP edge +264/−21) trong khi EDS-01→08 chưa mở phase nào theo ladder; EDS-09 lại bị chặn bởi EDS-08 `EVENT_SOURCE_ACCEPTED` (external, chưa có — domain_events bị chính plan từ chối) → công sức này KHÔNG tạo ra dữ liệu nhìn thấy nào trên màn cho tới khi nguồn giao event contract, ngược mục tiêu owner "mọi màn có số" và ngược chính doctrine §17.5 "EDS-03..07 must not wait". Đề nghị: (a) đổi thứ tự sang 01→03 vertical đầu tiên, hoặc (b) nếu giữ EDS-09 thì tuyên bố rõ đây là contract-prep offline và mở song song EDS-01. **Cập nhật theo OR-1 (04-09): vế event-journal đã được owner gỡ — EDS-09 chạy trên observation lane là hợp lệ; DR-11 chỉ còn yêu cầu mở song song lane FE 01→03** | **CAO** | thứ tự chiến dịch | OPEN-THU HẸP | |
| DR-13 | **OR-1 gap của EDS-09**: core chờ external acceptance, không có observation adapter → giá trị màn hình = 0 tới khi trading giao MC-01. Yêu cầu phase nhỏ **EDS-09b**: adapter map mirror/drain observations vào CHÍNH core này (stream class riêng, nhãn `PORTAL_OBSERVATION`, admission facts do Portal tự phát hành) — mở reducer/journal/EDS-11 fan-out NGAY. Core generic sẵn nên đây là việc nhỏ | **CAO** | EDS-09b | OPEN | |
| DR-15 | **A-01: pin catalogue digest sai trường** — intake lấy `catalogue_digest` (9040f, hash response-body) thay vì `catalogue_sha256` envelope (0c71b, có sẵn trong e6-runtime-evidence của chính pack) → mọi live read 502 `EDS01_SOURCE_CONTRACT_REJECTED`; gate xanh nhờ fixture nên không ai thấy. **Đã sửa tại source bởi Claude (quyền backend), chờ gate re-run + codex xác nhận trường chuẩn trong contract test** | CAO | EDS-01 | FIXED-IN-REVIEW | |
| DR-16 | **Sập cả cycle vì 1 relation mới bị từ chối**: `manager.risk:risk_grants` (sandbox) trả `N23_PROFILE_READ_NOT_ACCEPTED` ×7 → mã này không nằm trong danh sách cô lập của worker → cycle sandbox fail liên tục → snapshot vượt stale ceiling → **cả màn Sandbox 'unavailable'** (regression so với dev đang ready/COMPLETE). Fix: thêm N22/N23_PROFILE_READ_NOT_ACCEPTED vào isolate per-relation (UNAVAILABLE typed, carry phần còn lại) | **CAO — CHẶN G3** | worker (Claude nhận vá) + codex rà acceptance list | **FIXED 05-09** — isolate N22/N23 per-relation + regression test, gate 383/383, sandbox hồi sinh trên probe; codex còn rà DR-17 | |
| DR-17 | Binding mới `risk_grants`/`sizing_decisions` được thêm vào catalog worker nhưng chưa được proxy/edge chấp nhận cho screen tương ứng (sandbox N23; paper sizing N17B) — cần khớp acceptance list ↔ catalog trước khi thêm binding | TB | EDS-03/06 | OPEN | |
| DR-14 | Test trực tiếp EDS-09 đếm được 7 (5 core + 2 store) so với 10 vùng khai trong report — cần bảng map test↔claim (hoặc chỉ rõ spec TS 306 dòng gánh vùng nào) để nghiệm thu chặt | THẤP | EDS-09 docs | OPEN | |
| DR-12 | *(một phần đã khắc phục 05-09: mỗi phase có file EDS_xx riêng mang Status ladder trong worktree eds — §17 unified plan vẫn chưa sync, giữ OPEN mức THẤP)* **Status ladder không được ghi**: chỉ EDS-00 có dòng Status; 01→12 không có `PLANNED/CONTRACT_LOCKED/...` trong §17 → không ai track được tiến độ bằng văn bản, vi phạm luật "mỗi phase commit implementation+tests+journal cùng lúc" của chính plan | TB | §17 bookkeeping | OPEN | |

Luật sổ: codex trả lời từng DR trong cột của mình (ACCEPT+phase / REJECT+lý do);
DR nào ACCEPT thì thành mục kiểm tra exit của phase tương ứng; mỗi tuần Bobby
duyệt các DR REJECT còn tranh chấp. FE có quyền thêm DR mới mỗi khi một phase
giao mà §2 còn ô `✗`.

---

## OR — Phán quyết owner (Bobby, 2026-09-04) — codex đọc và áp dụng ngay

**OR-1 — BỎ CHỜ event-journal phía Trading System.** Nguyên văn chỉ đạo: "cái
journal bên system bỏ đi, thay bằng cách khác — đợi bên kia upgrade lâu lắm;
tận dụng tối đa những gì portal-execution-edge + trading system ĐÃ giao, tìm
phương án khác nếu nguồn chưa có, để hoàn thành 100% frontend yêu cầu; không
cố chấp vào một yêu cầu phải đợi lâu."

Hệ quả áp lên chiến dịch:
- EDS-08 thu nhỏ thành "gửi asks hợp nhất (BR-EX-79 A–E) như CƠ HỘI nâng cấp
  sau" — **không còn là cổng chặn** của bất kỳ phase nào.
- EDS-09/10 đổi đầu vào từ "source event journal" sang **observation lane**:

| Thay thế | Cách làm bằng thứ ĐÃ có | Nhãn trung thực |
|---|---|---|
| OR-1a Pseudo-tail | Resumable drain + mirror (đang chạy prod-dev) chính là tail quan sát: dedupe khóa+digest, ordered theo (ts,id) Portal-observed | `PORTAL_OBSERVATION`, không phải source event — khái niệm này §EDS-06 đã định nghĩa sẵn |
| OR-1b Lifecycle replay xấp xỉ | Dựng timeline per order từ orders+fills+sessions+journal metadata ĐÃ giao (submitted_at/updated_at/trade_time) | ô thiếu ack-clock → typed gap Ô ĐÓ, phần còn lại replay bình thường |
| OR-1c Market context | Chưa có candles thì dùng mark_price/equity series ĐÃ có làm price-context line DERIVED có nhãn — TUYỆT ĐỐI không bịa OHLC | `DERIVED · mark-context` |
| OR-1d Retention | Mirror append-only của Portal LÀ retention floor — không cần floor từ nguồn | window khai báo như hiện tại |

- DR-11 cập nhật theo OR-1: EDS-09 re-aim lên observation-lane là HỢP LỆ và
  được khuyến khích; yêu cầu còn lại của DR-11 chỉ còn một vế: **mở song song
  lane FE (EDS-01→03)** để mọi thứ nguồn-side E1→E7 + observation chảy được
  lên màn hình.
- DR-07 hạ mức: packet asks vẫn hợp nhất một kênh nhưng là opportunity,
  không blocker.

## 5bis. Chốt đo tiến độ tới EDS-09 (04-09, bằng chứng máy)

Theo đúng thước đo của chính chiến dịch (status ladder + gates G0–G7):

| Nhóm | Đạt |
|---|---|
| EDS-00 planning | ✅ `PLANNING_GATE_COMPLETE` |
| Nền nguồn E1→E7 (tiền-EDS) | ✅ **ĐÃ CODE XONG** (commit chuỗi `c1e7149→81a8870`: E5 implement existing-data publication, E7 maximum data return — 34 capabilities, edge adapt trọn những gì Trading System đang giao). *Đính chính 04-09: chốt đo trước đó của Claude nói "codex chưa code" là SAI về tổng thể — chỉ đúng cho lane FE* |
| EDS-01→08 lane FE (contract/API/BFF giao frontend) | **0/8 phase mở** — chưa named op, chưa generated contract, chưa fixture/field-map nào giao FE. Đây mới là khoảng thiếu thật |
| EDS-09 | ~264 dòng WIP **chưa commit, chưa test, chưa gate**, và bị chặn bởi EDS-08 external → đóng góp cho "màn có số" hôm nay = **0** |
| Mục tiêu owner "chart/bảng có dữ liệu mọi màn" | phần đang SỐNG đến từ các fix ngoài-EDS (mirror, resumable drain, chart serving, correlation/drawdown — §14/§16 unified plan): ma trận §2 hiện ● 17 · ◐ 6 · ✗ 5 · ○-typed 14 · ⏳ 2 — tức ~77% yếu tố khả-thi-local đã sống, phần ✗ còn lại là DR-09 + serving, phần ○ chờ Asks A–E/un-halt, KHÔNG phụ thuộc EDS-09 |

Kết luận phản biện: đến thời điểm này chiến dịch EDS **chưa giao được deliverable
nào cho frontend**; giá trị mục tiêu đang được gánh bởi luồng §14. DR-11/DR-12
là hai điều chỉnh tối thiểu để EDS bắt đầu trả sản phẩm thay vì hạ tầng chờ.

## OR-2 (PROPOSED ⚖) — Phân vai sản xuất / nghiệm thu

codex = SẢN XUẤT (EDS backend, nguồn/mirror/named ops — không ai chen).
Claude = NGHIỆM THU KỸ THUẬT G5+G6 từng phase bằng harness đã chứng minh
(probe user thật, đo byte payload, screenshot, cập nhật ma trận §2) — *phase
chưa có chữ ký consumer = chưa DONE*; grant backend của Claude chỉ dùng cho
hotfix đường-nối kiểu DR-09 và xây acceptance-harness thành gate. Bobby =
nghiệm thu sản phẩm cuối (EDS-12). Lý do khách quan: 100% bug lọt lưới hôm
03-09 do người sản xuất tự nghiệm thu; người tiêu thụ contract là người duy
nhất thấy contract sai cho mình.

## OR-3 — Quyết định chart renderer (owner đã duyệt qua artifact 04-09)

| Loại | Renderer | Ai làm |
|---|---|---|
| Time-series tài chính (equity/performance/drawdown/risk/sparkline) | **uPlot** trong `PrimusFinancialChart` (visual như artifact đã duyệt) | Claude (lane §17.6 EDS-07); `chartTheme.ts` token chung khởi công được NGAY |
| Bar/funnel · heatmap · graph · parallel | **ECharts giữ nguyên, reskin bằng cùng token** (đã demo cạnh nhau trong artifact) | Claude |
| Candlestick market-context (EDS-10) | đề xuất `lightweight-charts` (Apache-2.0, cần ⚖ attribution TradingView) | chờ Bobby |
| Trade replay hiện tại | GIỮ NGUYÊN (owner chốt) | — |

## 7. NGHIỆM THU LỚP 1 (04-09) — chấm E7 pack ↔ ma trận màn, KHÔNG đợi hết EDS

Chính sách nghiệm thu 2 lớp: **Lớp 1 = contract đầu vào** (chấm được ngay vì
E1→E7 đã code + pack máy 126 dòng field×màn có sẵn `SCREEN_FIELD_SOURCE_
COVERAGE.csv`); **Lớp 2 = payload đầu ra** G5/G6 chấm THEO TỪNG VERTICAL ngay
khi codex mở lane FE — tuyệt đối không dồn cuối chiến dịch.

Kết quả lớp 1 trên 126 dòng (100% REQUIRED):

| Bucket | Số dòng | Bản chất | Phán quyết nghiệm thu |
|---|---|---|---|
| A · Chỉ thiếu NAMED QUERY PLAN (`E2_SEQUENTIAL_SHAPE_UNQUALIFIED` + họ `E5_NAMED_*_REQUIRED`) | **~67** | Dữ liệu CÓ THẬT ở trading, manager-v2 đang serve dạng trang bounded (probe 03-09 chứng thực) — chỉ thiếu named per-resource op | **ACCEPT-READY cho codex làm ngay, 0 phụ thuộc nguồn** — đúng OR-1. Đây là ruột EDS-01/03/04 |
| B · Time-keyset/history (equity_history, fills, command_journal — 12) | 12 | Cần cursor + restate contract | Mirror ĐÃ đáp ứng nhu cầu sản phẩm hôm nay (alpha 360 serve 1.540 điểm) — EDS-06/07 chỉ việc absorb (tăng lực cho DR-01) |
| C · Nguồn thật sự vắng (candles 3 · ticks 2 · VNM 2 · artifact 2 · drift 2 · replay-sequence 2 · mark-provenance dính kèm) | ~13 | Trading chưa có | Theo OR-1: thay thế DERIVED/observation có nhãn (mark-context, replay xấp xỉ) nơi làm được; còn lại typed — khớp cột ○ ma trận §2 + Ask B |
| D · Redaction (dead_letter UNSAFE_RAW 2) | 2 | Edge allowlist nhỏ | codex-lane, gộp vào EDS-05 |
| E · Portal đã có (BFF_AVAILABLE 14 · envelope-composes 16 · derived-at-portal) | ~32 | Đang chạy | ● |

Phát hiện bổ sung cho ma trận §2 (thiếu 3 nhóm phần tử, đã nhận nợ cập nhật):
`instrument_master` (workbench/portfolio), `sizing_decisions`+`risk_grants`
(màn Gate R1/R2/Live), `research_artifact` linkage (Alpha 360/R1). Pack cũng
xác nhận thiết kế đúng của tracker: mọi màn đều có hàng `source_health` —
khớp yêu cầu freshness/motion §2.1.

Kết luận lớp 1: **không có lý do chờ** — 67/126 dòng mở khoá thuần bằng công
việc codex-lane; 12 dòng đã được mirror gánh tạm; chỉ ~13 dòng thật sự thuộc
nguồn và đã có phương án OR-1. Con đường "mọi màn có số" nằm trọn trong tay
đội, đúng chỉ đạo owner.

## 6. Định nghĩa HOÀN THÀNH của cả chiến dịch (theo owner order)

Mọi ô §2 phải là `●` hoặc `○-typed-có-lý-do-nguồn`; không còn `✗`; mọi `⏳` đã
đổi thành phase-đã-giao; motion checklist (tick/breathe/pulse/grow) nổ được
trên dev khi điều kiện dữ liệu thật của nó xảy ra; và mọi DR đóng. Khi đó
frontend == showcase về hành vi, chỉ khác một điều: **số là thật**.

---

## A. KẾ HOẠCH NGHIỆM THU TỪNG PHASE (gộp vào đây 04-09 theo lệnh owner — một file duy nhất)

## A0. Bảng tổng — nhìn một phát biết đến đâu

| Phiếu | Chấm cái gì | Kích hoạt khi | Trạng thái 04-09 |
|---|---|---|---|
| **L1** | Contract đầu vào (E7 pack ↔ ma trận màn) | pack tồn tại | ✅ **ĐÃ CHẤM** — 126/126 dòng, 5 bucket (tracker §7) |
| A-01 | EDS-01 vertical đầu (named op deployment) | codex giao op+fixture | ✅ **PASS-VỚI-SỬA 05-09** (live-probe :8090): 3 env đúng (`POPULATED/POPULATED/EMPTY-authoritative`), DTO chuẩn (43 records, source_health trung thực, replay_eligible:false), negatives 3×400, cursor `mdc1.*` phân trang 0-overlap + cross-env bị chặn `EDS01_CURSOR_INVALID_OR_EXPIRED`, 16KB/43 rows. **DR-15 bắt tại chỗ**: pin catalogue sai trường (9040f response-body digest thay vì envelope 0c71b của chính e6-evidence) → op CHƯA TỪNG chạy nổi với nguồn sống (gate codex xanh vì fixture); đã sửa 1 dòng tại source, chờ gate re-run. Phụ: migration EDS phải chạy tay trên DB restore (bootstrap chỉ seed user) — ghi nhận quy trình |
| A-02 | EDS-02 generated contracts | types+enum-map giao | ✅ **PASS 05-09**: `/contract-authority` 200/213KB đủ blocks (clock_contract 7 đồng hồ, exact_value, panel_envelope, screen_data_manifest); FE `screenDataContract.ts` +321 dòng đã vào; gate FE codex 1.826 test + build xanh. Còn soi sâu enum-map ↔ U02 khi wire (ghi vào G-tích-hợp) |
| A-03 | EDS-03 ba màn stage | từng màn một | ✅ **PASS-VỚI-SỬA 05-09** sau vá DR-16: PAPER ✓ (43 dep + đủ arrays, ms-clocks); **SANDBOX HỒI SINH** `partial` + 35 deployments (risk_grants thành typed UNAVAILABLE đúng ô); LIVE ✓ arrays-0 trung thực (semantics completeness còn note trong phiếu); screenshot 3 màn authenticated render khác biệt thật (73/123/183KB). Còn theo dõi: paper 1,29MB (DR-10), live EMPTY-vs-PARTIAL note |
| A-04 | EDS-04 bốn màn resource | từng màn một | 🔶 SẴN SÀNG CHẤM — `a511508` |
| A-05 | EDS-05 derivations+governance | từng op một | 🔶 SẴN SÀNG CHẤM — `35e96e0` |
| A-06 | EDS-06 mirror/index cutover | dual-read bật | 🔶 SẴN SÀNG CHẤM — `3a9c996` (DR-01 phải trả lời trong lúc chấm) |
| A-07 | EDS-07 chart DTO | DTO đầu tiên | 🔶 SẴN SÀNG CHẤM — `6914c9b` |
| A-08 | EDS-08 asks packet | packet hợp nhất | ✅ **CHẤM ĐẠT 05-09** — addendum ghi parent MC-01, một kênh duy nhất → **DR-07 ĐÓNG** |
| A-09 | EDS-09 observation-lane | reducer đầu ra đầu tiên | ✅ **ĐÃ CHẤM 05-09: ACCEPT-CORE / DR-13 OPEN** — xem phiếu |
| A-10 | EDS-10 replay/candles | contract chấp nhận | ⬜ xa |
| A-11 | EDS-11 SSE + action graph | kênh SSE v2 | ⬜ xa |
| A-12 | EDS-12 release | gói release | ⬜ xa |

**ĐANG Ở ĐÂY (05-09) →** L1 ✅ · A-08 ✅ · A-09 ✅(có điều kiện DR-13) · hàng đợi
chấm: **A-01→A-07 đã đủ vật giao** trên nhánh `feat/eds-current-bff` (worktree
`/home/bobby/portal-eds-current-bff`). Bước kế: dựng runtime probe từ nhánh đó
(compose project phụ, không đụng dev) rồi chấm lần lượt A-01→A-07 theo SLA
≤1 ngày/phiếu. Không phiếu nào chấm gộp; ký xong mới DONE (OR-2).

## A1. Bộ đồ nghề chấm (đã dựng và đã chứng minh 03-09)

1. **Probe session**: user `claude-probe` (USER role) đăng nhập thật → curl
   từng route đúng như browser (đã bắt 30D/2-ngày, cap-200, 5.9MB).
2. **Bộ lệnh chuẩn mỗi phiếu**: `curl route → jq` kiểm shape; đếm byte
   (`%{size_download}`); đối chiếu giá trị money string-exact với SQL mirror;
   screenshot Playwright-docker khi phiếu có yếu tố visual.
3. **Sổ ghi**: kết quả từng phiếu ghi NGAY vào phiếu đó ở file này + lật ô
   ma trận tracker §2 tương ứng + (nếu trượt) mở DR mới.

## A2. Các phiếu chi tiết

### Phiếu A-01 — EDS-01: named op đầu tiên (`maximumDataDeploymentPageV1`)
- **Input từ codex**: route BFF + fixture + field-map cũ→mới cho Paper list.
- **Bước chấm (đúng thứ tự)**: (1) fixture decode qua generated type không lỗi;
  (2) probe route thật 3 profile × {empty/populated/partial}; (3) so từng
  field với field-map — không field nào READY+null; (4) negative: sai
  audience/profile → 4xx đúng mã; cursor Portal không chứa source cursor
  (base64-decode kiểm); (5) 1/10 request song song → upstream không khuếch
  đại (đếm qua log edge); (6) byte ≤ ngân sách khai báo.
- **ĐẠT khi**: 6/6 xanh + ô `deployments` các màn liên quan ở tracker §2 lật ●-qua-named-op.
- **Link**: bucket A (§7 tracker) · DR-11 vế lane-FE · OR-2.
- **Trạng thái**: ⬜ chờ codex giao. [Kết quả chấm: —]

### Phiếu A-02 — EDS-02: generated contracts
- **Input**: OpenAPI/types vào `packages/contracts/generated` + bảng map enum
  panel-state ↔ U02 + envelope tách serving/population (DR-04).
- **Bước chấm**: (1) `npm run generate` tái lập digest khớp; (2) enum map phủ
  đủ 7 state U02, không state mồ côi; (3) DR-04: fixture PARTIAL-population
  nhưng serving-COMPLETE render chrome `ready` + caption truncated; (4) FE
  build+test xanh sau khi thay 1 shape tay đầu tiên.
- **ĐẠT khi**: 4/4 + DR-04 đóng.
- **Trạng thái**: ⬜. [Kết quả: —]

### Phiếu A-03 — EDS-03: Paper/Sandbox/Live stage screens (chấm TỪNG MÀN)
- **Input mỗi màn**: named ops + field-map + fixtures.
- **Bước chấm mỗi màn**: (1) probe route: đủ mọi panel §2 của màn đó có
  data/typed-reason; (2) so ô ma trận: ô ✗ của màn phải hết (Paper Overview:
  chart hero full-range thay cap-200 — nếu codex tới trước DR-09 của tôi);
  (3) Live: bảng rỗng phải `EMPTY·COMPLETE` không phải unavailable; (4) byte
  budget từng route; (5) screenshot đối chiếu hi-fi (bố cục không đổi).
- **ĐẠT khi**: cả 3 màn ký riêng; ma trận §2.1–2.3+2.9–2.10 hết ✗.
- **Trạng thái**: ⬜ ×3. [Paper: — | Sandbox: — | Live: —]

### Phiếu A-04 — EDS-04: Alpha/Portfolio/Account/Binding (TỪNG MÀN)
- **Bước chấm thêm đặc thù**: khóa định danh đúng §1 tracker (không heuristic
  — thử deployment nằm NGOÀI trang đầu vẫn mở được 360); tên hiển thị từ
  entity-registry; mixed-currency fail-closed.
- **ĐẠT khi**: 4 màn ký; §2.5–2.8 hết ✗/⏳ phần local.
- **Trạng thái**: ⬜ ×4.

### Phiếu A-05 — EDS-05: 5 derivations + governance/ops
- **Bước chấm**: golden vectors từng formula (tôi tự tính lại bằng exact
  decimal độc lập); partial/stale lan truyền đúng; redaction dead-letter
  (bucket D) không lộ raw; mọi route governance/ops probe xanh.
- **ĐẠT khi**: 5 formula + 8 màn governance/ops ký.
- **Trạng thái**: ⬜.

### Phiếu A-06 — EDS-06: mirror/index cutover
- **Bước chấm**: (1) DR-01 phải có tuyên bố absorb/replace TRƯỚC khi chấm;
  (2) dual-read parity: old vs new cùng câu hỏi — diff = 0 trên mẫu tôi chọn
  (mẫu giấu trước); (3) cắt từng màn: sau cắt, probe lại toàn bộ phiếu A-03/04
  của màn đó PASS y nguyên; (4) rollback thử 1 màn: quay lại đường cũ không
  mất dữ liệu.
- **ĐẠT khi**: parity 0-diff + A-03/04 re-pass + rollback chứng minh.
- **Trạng thái**: ⬜ (mirror hiện tại của tôi là baseline so sánh).

### Phiếu A-07 — EDS-07: chart DTO  ·  A-07b — việc FE tôi tự chạy
- **A-07 chấm**: DTO đúng MỘT từ vựng downsample (DR-05); extrema/gap/first/
  last bảo toàn (tôi seed mẫu có bẫy — đường đơn điệu vs zig-zag như bài học
  fixture 03-09); `scale_mode` tôn trọng (không client clamp); budget điểm
  theo viewport; alpha/portfolio/stage chart routes probe + screenshot.
- **A-07b (không chờ codex)**: `chartTheme.ts` + `PrimusFinancialChart`
  component theo OR-3, ăn tạm serving hiện có; khi DTO tới chỉ đổi adapter.
- **ĐẠT khi**: mọi ô chart §2 lật ●; artifact-look tái hiện trên portal thật.
- **Trạng thái**: A-07 ⬜ · A-07b ⬜ tôi khởi công sau DR-09.

### Phiếu A-08 — EDS-08 (đã hạ blocker theo OR-1)
- **Chấm duy nhất**: packet asks hợp nhất = đúng BR-EX-79 A–E, một kênh
  (DR-07); không phase nào tuyên bố chờ nó.
- **Trạng thái**: ⬜.

### Phiếu A-09 — EDS-09 observation-lane (theo OR-1) — **ĐÃ CHẤM 05-09**
- **Vật giao đã đọc**: report `EDS_09_RUST_SNAPSHOT_TAIL_APPEND_STORE.md`
  (161 dòng, Status `CODE_COMPLETE_SOURCE_DARK/VERIFIED/RUNTIME_INACTIVE`),
  commit `5d904fb` (core `authoritative-event-core` 1.502 dòng + store PG +
  migration 0017 bảy bảng expand-only + spec TS 306 dòng), addendum MC-01.
- **Kết quả từng bước**:
  1. Đầu vào observation không chờ journal → **FAIL theo OR-1**: core được
     xây source-dark, TỪ CHỐI khởi tạo khi chưa có external acceptance
     (đúng nguyên văn report); không có adapter observation, grep
     `PORTAL_OBSERVATION` trong core = 0 → sinh **DR-13**.
  2. Nhãn observation → N/A (lane chưa tồn tại).
  3. Reducer đối chiếu SQL độc lập → PENDING (chờ DR-13/EDS-09b có input).
  4. Dedupe/gap/restart → **PASS trên thiết kế + test**: append nguyên tử
     ACK-sau-commit, duplicate trả lại receipt gốc, gap/epoch/checksum →
     quarantine + RESNAPSHOT_REQUIRED, restart resume có fence, triggers
     cấm update/delete facts. Kỷ luật fail-closed đúng chuẩn N-series.
- **Đánh giá chất lượng (khách quan)**: kiến trúc & kỷ luật **xuất sắc** —
  state machine snapshot→tail→ACK chặt, bounded queues, không lộ browser,
  không đụng runtime, gate khai PASS 05-09 (`execution-edge-test.sh` +
  control-api 382 tests — *khai bởi codex, tôi chưa re-run Rust gate độc
  lập*; test đếm trực tiếp: 5 core + 2 store — mỏng so với 10 vùng khai →
  **DR-14** yêu cầu mapping test↔claim).
- **Đánh giá khớp chỉ đạo OR-1**: **lệch một nửa** — đây là cỗ máy đợi
  nguồn; đóng góp cho "màn có số" hôm nay = 0 cho tới khi có adapter.
  Điểm sáng: core provider-neutral nên adapter observation (EDS-09b) là
  việc NHỎ, tái dùng toàn bộ máy.
- **PHÁN QUYẾT PHIẾU: `ACCEPT-CORE / CONDITIONAL`** — chấp nhận phần lõi;
  EDS-09 chỉ được tính là phục vụ mục tiêu owner khi **DR-13 (EDS-09b)**
  đóng. A-08 chấm kèm: addendum đúng một kênh MC-01 → DR-07 ĐÓNG.

### Phiếu A-10/11/12 — replay+candles / SSE+actions / release
- A-10: candle DTO + renderer OR-3 (⚖ attribution); replay xấp xỉ OR-1b có
  nhãn typed đúng ô thiếu. A-11: SSE resume/gap/100-client + revision-tick
  cho motion (DR-06) — tôi giả lập đứt mạng/chậm client; action graph đi đủ
  mọi nút. A-12: tôi nộp Bobby gói bằng chứng browser-matrix toàn màn.
- **Trạng thái**: ⬜ ×3.

## A2b. CHIẾN DỊCH CHẤM ✚ GHÉP NỐI ✚ BÀN GIAO TỪNG PHASE (sửa 05-09 theo ý owner: goal liên tiếp)

**Ý owner (đọc đúng):** mỗi phase không dừng ở "chấm đạt" — phải **ghép nối
vào frontend thật và lên dev** để Bobby NHÌN THẤY và goal, rồi mới sang phase
kế. Chuỗi goal liên tiếp, không dồn cuối.

**Vòng đời chuẩn MỖI phase (5 bước, lặp lại):**
```text
(1) CHẤM trên probe-runtime (phiếu A-xx, ≤1 ngày)
(2) GHÉP NỐI FE: wire container/api layer sang named ops theo field-map
    (lane §17.6 của Claude — có quyền backend, không hỏi lại)
(3) GATE FE: vitest + build + control gate nếu đụng BE
(4) DEPLOY DEV: nhánh tích hợp `feat/eds-integration`
    (= feat/eds-current-bff của codex ⊕ commit FE của Claude — dev chạy nhánh này từ G1)
(5) BOBBY GOAL trên dev → lật ✅ vào §A0 → mở phase kế
```
Trượt ở (1) → DR, codex sửa song song; trượt ở (3)/(4) → lỗi của tôi, sửa
trong ngày; không phase nào ✅ khi Bobby chưa goal bước (5).

**🎯 GOAL ĐỢT 1 (Bobby chốt 05-09): G1 → G2 → G3** — vertical proof nhỏ nhất
→ nền types + hết PARTIAL-oan mọi màn (DR-04) → 3 màn stage đầy đủ. Đợt 2 đề
xuất G7 (chart) nhảy trước G4/G5 vì không phụ thuộc chúng — chốt sau đợt 1.

| Bước | Chấm & Ghép | **Bobby nhìn thấy gì trên dev để goal** | Dự kiến | Trạng thái |
|---|---|---|---|---|
| G0 | Dựng probe-runtime (PG riêng restore dump dev :55432 loopback + image nhánh eds) + tạo nhánh `feat/eds-integration` | (hạ tầng — không cần goal) | 0.5 ngày | 🔶 ĐANG LÀM |
| G1 | A-01 + wire Paper list sang `maximumDataDeploymentPageV1` | Paper Overview: danh sách deployment chạy qua named op mới, chip trạng thái + freshness đúng | 1 ngày | ✅ CHẤM XONG (05-09, DR-15 fixed, gate 382) — chờ Bobby goal trên dev |
| G2 | A-02 + FE đổi sang generated types/UTC formatter/enum-map | Không đổi hình — nhưng caption completeness hết PARTIAL-oan (DR-04); tôi nộp ảnh before/after | 0.5–1 ngày | ✅ CHẤM XONG (authority 200/213KB; DR-04 top-level còn theo dõi ở G-sau) — chờ Bobby goal |
| G3 | A-03 + wire 3 màn stage (Paper→Sandbox→Live, từng màn goal riêng) | Mỗi màn stage đầy panel: ô nào trống là typed-lý-do, hết ✗ ma trận §2.1-2.3/2.9-2.10 | 1.5 ngày | ✅ CHẤM XONG sau vá DR-16 — build dev đang chạy, chờ Bobby goal cả đợt |
| G4 | A-04 + wire 4 màn resource | Alpha/Portfolio/Account/Binding 360 mở từ khóa chuẩn, deployment ngoài trang đầu vẫn mở được | 1.5 ngày | ⬜ |
| G5 | A-05 + wire governance/ops | Inbox/R1/R2/Exit/Waivers/Queue/Incident có số + formula version hiện trên tile | 1 ngày | ⬜ |
| G6 | A-06 cutover từng màn (dual-read parity, DR-01 trả lời tại đây) | Cùng màn, số y hệt, payload NHẸ hẳn (đo byte trước/sau đính vào phiếu) | 1 ngày | ⬜ |
| G7 | A-07 + **A-07b `PrimusFinancialChart` + chartTheme.ts (OR-3)** ăn chart DTO | Chart equity/perf/drawdown ĐÚNG LOOK artifact đã duyệt, sparkline fleet, hết cap 2000 | 1.5–2 ngày | ⬜ |
| G8 | EDS-09b observation adapter (DR-13) + wire journal → EDS-11 SSE khi codex giao | Motion tick/flash nổ lại bằng revision thật | theo codex | ⬜ |

Tổng: **~8–10 ngày làm việc** cho chuỗi goal G1→G7 (EDS-10 chờ gate trading,
đúng chốt owner). Sau mỗi bước (5), §A0 lật trạng thái — Bobby dõi goal chỉ
bằng một bảng.

## A3. Luật vận hành kế hoạch này

1. Mỗi phiếu chấm trong ≤1 ngày từ lúc codex giao; trượt → DR mới + codex sửa
   trong phase đó, không nợ sang phase sau.
2. Kết quả (PASS/FAIL + bằng chứng) ghi vào đúng phiếu ở file này — Bobby đọc
   MỘT file biết toàn cục; tracker §2/§4 lật ô tương ứng cùng commit.
3. Thứ tự chấm = thứ tự codex giao; không chấm chay khi chưa có vật giao —
   trừ L1 (đã xong) và A-07b (việc FE độc lập).
