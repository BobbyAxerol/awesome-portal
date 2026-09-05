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
| DR-07 | EDS-08 packet và BR-EX-79 FINAL (A–E) đang là 2 kênh tới cùng source owner | TB | 08 | OPEN | |
| DR-08 | §17.2 chưa ghi fact: cursor TTL read-plane paper = 48h (đã deploy) | THẤP | 17.2 | OPEN | |
| DR-09 | Paper Overview cap 200 rows làm chart hero vỡ NGAY HÔM NAY — không được đợi tới EDS-06/07; vá theo §14-FixA (DERIVED-sum series từ mirror) rồi EDS thay sau | CAO | ngay | OPEN — Claude nhận làm | |
| DR-10 | Payload budget chưa là con số per-phase (5.9MB workbench, 2.4MB alpha đo thật) | TB | 07/12 | OPEN | |
| DR-11 | **Đảo thứ tự adapt-first (đo 04-09)**: codex đang code EDS-09 (5 file WIP edge +264/−21) trong khi EDS-01→08 chưa mở phase nào theo ladder; EDS-09 lại bị chặn bởi EDS-08 `EVENT_SOURCE_ACCEPTED` (external, chưa có — domain_events bị chính plan từ chối) → công sức này KHÔNG tạo ra dữ liệu nhìn thấy nào trên màn cho tới khi nguồn giao event contract, ngược mục tiêu owner "mọi màn có số" và ngược chính doctrine §17.5 "EDS-03..07 must not wait". Đề nghị: (a) đổi thứ tự sang 01→03 vertical đầu tiên, hoặc (b) nếu giữ EDS-09 thì tuyên bố rõ đây là contract-prep offline và mở song song EDS-01. **Cập nhật theo OR-1 (04-09): vế event-journal đã được owner gỡ — EDS-09 chạy trên observation lane là hợp lệ; DR-11 chỉ còn yêu cầu mở song song lane FE 01→03** | **CAO** | thứ tự chiến dịch | OPEN-THU HẸP | |
| DR-12 | **Status ladder không được ghi**: chỉ EDS-00 có dòng Status; 01→12 không có `PLANNED/CONTRACT_LOCKED/...` trong §17 → không ai track được tiến độ bằng văn bản, vi phạm luật "mỗi phase commit implementation+tests+journal cùng lúc" của chính plan | TB | §17 bookkeeping | OPEN | |

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

## 6. Định nghĩa HOÀN THÀNH của cả chiến dịch (theo owner order)

Mọi ô §2 phải là `●` hoặc `○-typed-có-lý-do-nguồn`; không còn `✗`; mọi `⏳` đã
đổi thành phase-đã-giao; motion checklist (tick/breathe/pulse/grow) nổ được
trên dev khi điều kiện dữ liệu thật của nó xảy ra; và mọi DR đóng. Khi đó
frontend == showcase về hành vi, chỉ khác một điều: **số là thật**.
