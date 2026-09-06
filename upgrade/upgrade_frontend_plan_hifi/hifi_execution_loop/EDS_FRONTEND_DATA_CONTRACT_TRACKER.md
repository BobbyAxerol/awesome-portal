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
| DR-18 | **Workspace mặc định = workspace cá nhân của session** (`SessionGuard.ensurePersonal`) mà EDS-04/05/07 chỉ chấp nhận đúng `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID`: user KHÔNG phải chủ workspace đó (mọi người trừ Bobby) nhận 404 typed `EDS0x_PROJECTION_WORKSPACE_NOT_FOUND` trừ khi query mang `workspace_id` — mà không envelope nào (`/screens/*`, `/resources/*`, `/contract-authority`) publish id này cho browser. Đo 05-09 trên probe (claude-probe, member nhưng không chủ): Alpha 360 resource, 4 tile derivation, chart Account 360 đều 404 typed; đổi owner trên probe DB → tất cả READY. Spec codex `portal-derivations.spec:pins…` cố ý fail-closed, nên đây là quyết định thiết kế cần chốt, không phải bug tôi tự sửa. **Backend request**: (a) publish `projection_workspace_id` trong `/contract-authority` để FE gửi kèm, hoặc (b) khi query không có `workspace_id` và user là member của projection workspace thì mặc định vào đó | CAO (mọi user ≠ Bobby) | 04/05/07 | OPEN — chờ codex chọn (a)/(b) | |
| DR-19 | **N29 acceptance pack pin sha256 của file FE** (`recomposeContainers.tsx`, `profileContainers.tsx`, `e2e/bffDouble.ts`, …): mọi wire FE hợp lệ đều làm pre-commit đỏ `evidence digest drifted`. Đợt 2 tôi re-pin 2 digest theo đúng cách codex đã làm ở `a511508`; `bffDouble.ts` giữ nguyên nên e2e double trả 501 gap cho route EDS-05/07 (tile render unavailable — trung thực nhưng không phải trạng thái thật). Đề nghị: tách file FE khỏi pin N29 hoặc ghi thủ tục re-pin vào README pack | TB | N29 pack | OPEN | |
| DR-20 | **Mirror EDS-06 trên dev rỗng (0 row) và chỉ có relation paper** sau backfill từ `execution_timeseries_history` (710k row → `account_equity_snapshots` 581k · `performance_snapshots` 129k · `fills` 71): EDS-07 chart cho live/sandbox/deployment trả `EDS07_RELATION_NOT_MIRRORED` tới khi worker mirror các profile đó (flag bật 05-09 tối trên dev). Đây chính là câu hỏi DR-01 (absorb/replace): tôi đã absorb history→mirror bằng script (digest canonical y hệt `durable-mirror.repository.ts`), codex xác nhận cách này hay worker tự backfill | CAO | 06/07 | OPEN | |
| DR-21 | **`alphas/{id}/activity` EMPTY `EDS05_ALPHA_NOT_FOUND` cho mọi id đã thử** (`signalcombine00230m`, `gridcombine001`, `adaptive_hma_cpp_00115m` — id thứ ba là `strategy_id` thật trong deployments, strategies relation có 48 row AVAILABLE) → khóa join của alpha_id sai hoặc alpha_id là trường khác (`alpha_id` registry?). Tile Alpha 360 vì thế luôn EMPTY dù alpha đang chạy paper | TB | 05 | OPEN — codex chỉ khóa đúng | |
| DR-22 | **N25 `query-analytics.source_facts` không scope theo alpha**: `fills` 63 / `orders` 770 là toàn profile (fill mẫu thuộc `fib_sl_tp_strength_0015m` khi hỏi `adaptive_hma_cpp_00115m`; alpha này chỉ 10/19). Tile "Exact query surface" và funnel vì thế in số toàn profile dưới tên alpha. FE tạm lọc theo account của alpha (Trade Replay); các tile khác vẫn dùng số server. Đề nghị server scope facts theo subject hoặc ghi rõ `scope: PROFILE` trong envelope | CAO (số sai chủ) | N25 | OPEN | |
| DR-23 | **Nến cho Trade Replay** (OR-4): Portal đọc klines công khai Binance USDM dưới cờ, authority `VENUE_PUBLIC_MARKET_DATA`. Codex xác nhận/từ chối phân loại; nếu từ chối thì Trade Replay quay lại đường chấm fill-price tới khi BR-EX-50 | TB | new route | OPEN — chờ codex + Bobby (egress) | |

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

**Tiến độ OR-3 (05-09 tối)**: dòng 1 ✅ ship `172ebdd` — `src/charts/financial/`
(`chartTheme.ts` đọc token `--exec-chart-*` từ `styles/tokens.css`;
`financialData.ts` biến đổi thuần, test được; `PrimusFinancialChart.tsx` uPlot
1.6.32 load động — jsdom không đụng canvas). Look: line #42a365 + gradient
fade, band vàng đứt nét + fill, gap gạch chéo đỏ, pill giá cuối exact + halo
(pulse CHỈ khi server nói fresh), tooltip UTC, Lin/Log, 1W/1M/3M/ALL, kéo-zoom,
Ctrl+wheel zoom, Shift+wheel pan, double-click reset. Baseline visual
`v2-equity-chart-demo` (2 viewport) cập nhật; 4 baseline màn có chart KHÔNG
đổi quá 0.2%. Dòng 2 (ECharts reskin bar/heatmap) và sparkline fleet: chưa.

## OR-4 (PROPOSED ⚖ — đã triển khai dưới cờ, chờ Bobby chốt) — Nến venue công khai cho Trade Replay

Owner 06-09: *"Trade replay là vẽ trên candle như indicator TradingView… làm khi
nào cho được thì thôi."* Trading System không publish kline (E5/N28; EDS-10b của
codex ghi rõ `EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED`, không bao giờ tự bịa
OHLCV). Không có nến thì không thể "vẽ marker lên nến".

**Quyết định đề xuất (tôi đã làm, cờ mặc định OFF):** Portal tự đọc **klines
công khai của venue** — với profile paper USDM đó chính là Binance USDM
(`fapi.binance.com/fapi/v1/klines`, không cần credential) — làm *market
context* cho Trade Replay. Route mới `GET /api/v1/execution/market/candles`
(control-api, `ExecutionMarketCandlesController/Service`): venue/market cố
định BINANCE/USDM, symbol theo regex, interval trong {1m,5m,15m,1h,4h,1d},
limit ≤ 1500, from/to UTC ms; cache 30s; ngân sách 60 call/phút; timeout 6s;
mọi envelope mang `source_authority: VENUE_PUBLIC_MARKET_DATA` + endpoint +
câu "not the Trading System kline shard (BR-EX-50 pending)"; lỗi typed
(FEATURE_DISABLED / RATE_LIMITED / SYMBOL_UNKNOWN → EMPTY / VENUE_ERROR /
VENUE_UNREACHABLE / VENUE_MALFORMED). Cờ `FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES`
(compose overlay local-projection, bật trên dev `.env`). Test unit 10 case.

**Vì sao chấp nhận được:** paper engine mark theo chính feed Binance đó; nến
là dữ liệu công khai, không phải "lịch sử của nguồn"; FE ghi rõ nguồn ở
footer và chip; khi BR-EX-50 giao kline shard thì đổi nguồn lớp nến, giữ
nguyên marker/leg/log. **Điểm cần Bobby chốt:** control-api có được phép gọi
ra ngoài tới venue công khai không (hiện nó đã reach được, 200/206ms); codex
có đồng ý phân loại authority `VENUE_PUBLIC_MARKET_DATA` không (DR-23).

## OR-5 (R1+R2+R3 ĐÃ GIAO 06-09 trên `feat/trade-replay-signature` — chờ Bobby duyệt trên dev; xem OR-5.8/5.9/5.10) — Trade Replay "signature": chuẩn TradingView

Owner 06-09 hỏi ý kiến: *"có nên đầu tư thêm thời gian để trade replay động
hơn như các sàn / TradingView — mượt, crosshair hiện số nến, tam giác vào/ra
cho long và short màu khác nến, to hơn một tí, cách thể hiện lệnh điều kiện /
grid / 1–2 leg sáng tạo hơn, kéo giãn trục giá, kéo ngang mượt bằng chuột —
tôi muốn chỗ đó như một signature."* Đây là đánh giá, không phải goal; kết
luận ghi ở đây để Bobby quyết.

### OR-5.1 Hiện trạng thật (bản 3, `daa30a8`)

Engine SVG tự viết (`TradeReplayEvents.tsx`, ~560 dòng, port từ hi-fi): nến
là `<path>`, marker là **glyph chữ** ▲▼◇× (`<text fontSize>`), tooltip bằng
`<title>` của trình duyệt, wheel = zoom bước 0.75, kéo = pan, Fit. **Chưa có**:
crosshair + bảng OHLCV theo con trỏ, kéo giãn trục giá, zoom neo tại con trỏ,
quán tính khi kéo, HiDPI canvas, đồng bộ hover marker ↔ dòng log. Mỗi
mousemove đi qua React state → 1500 bar vẫn ổn nhưng không bao giờ "mượt như
sàn"; muốn mượt phải viết lại vòng tương tác bằng rAF/refs — tức là tự viết
lại nửa thư viện chart.

### OR-5.2 Khuyến nghị: NÊN làm, và làm bằng **TradingView Lightweight Charts**

| Phương án | Vì sao / vì sao không |
|---|---|
| **Lightweight Charts (TradingView, Apache-2.0 + attribution)** — **chọn** | Chính thư viện của TradingView: canvas HiDPI, crosshair + legend, kéo giãn trục giá (`axisPressedMouseMove`), zoom neo con trỏ, kinetic scroll, series markers, price lines, **primitive/plugin API** để vẽ thứ của riêng ta (leg, bracket, grid). ~45 KB gz, lazy-import như uPlot. Tick mọi ô Bobby nêu; phần "signature" là primitive ta tự vẽ. |
| Giữ SVG, tự đánh bóng | Cùng số ngày để viết lại crosshair/kinetic/axis-drag, kết quả vẫn không đạt cảm giác TV. Không chọn. |
| ECharts candlestick (đã có trong bundle) | Có candlestick + dataZoom nhưng cảm giác dashboard, không kéo giãn trục giá, không có cơ chế vẽ primitive theo pixel; không phải signature. Không chọn. |
| uPlot candles (đã có cho equity) | Vẽ nến bằng draw hook được, nhưng crosshair-legend/axis-drag/kinetic/markers đều tự viết. Không chọn cho màn này; uPlot vẫn giữ cho equity (OR-3). |
| TradingView Charting Library (bản đầy đủ) | Proprietary, cần ký license; quá tay cho một tab. Không chọn. |

**Ràng buộc license:** Apache-2.0 kèm *attribution notice* — phải hiện link
"TradingView" ở chỗ người dùng thấy (thường là góc chart, kiểu các sàn ghi
"Charting by TradingView"). Bobby chốt có chấp nhận dấu đó trên portal không.

### OR-5.3 Grammar "signature" đề xuất (vẽ bằng primitive, dữ liệu 100% server)

- **Marker vào/ra theo *side* của vị thế, không theo màu nến**: LONG = tam giác ▲ dưới low, màu token mới `--exec-trade-long` (teal/cyan, khác xanh nến); SHORT = ▼ trên high, `--exec-trade-short` (amber/magenta, khác đỏ nến). Vào = đặc; ra = rỗng cùng màu + nhãn pnl (dấu pnl đổi màu chữ, không đổi hình). Cỡ 10–12 px, viền 1 px màu nền để đọc được trên bấc nến. Giá marker = `fill.price` server.
- **Bracket (1–2 leg)**: có TP → dải mờ entry→TP (tint long); có SL → dải mờ entry→SL (tint short); có cả hai → một "position box" kiểu công cụ Long/Short Position của TV, nhãn R:R ở mép phải. Level = `trigger_price`, thời gian từ submit → terminal (đã có trong `legLevels`). Kích hoạt (TRIGGER) = ◇ nhỏ trên chính đường đó; REJECT = × ; CANCEL = đường cắt cụt có nhãn.
- **Grid / nhiều lệnh chờ cùng lúc**: ladder — mỗi level một vạch ngắn cùng màu side, gộp thành "×N levels" khi >8 trong cùng cửa sổ (nhãn trung thực khi cap, §8 invariant).
- **Round trip**: ruy-băng mảnh nối entry→exit, nhãn pnl server; hover marker → sáng dòng log; click dòng log → chart cuộn tới trade (đồng bộ hai chiều).
- **Crosshair**: O/H/L/C/V của nến dưới con trỏ + "Δ từ entry" nếu đang có vị thế mở tại thời điểm đó (tính từ fill server, ghi rõ DERIVED).
- **Trung thực với nguồn**: nến vẫn `VENUE_PUBLIC_MARKET_DATA` (OR-4); fill nằm ngoài dải nến (đã thấy 1 fill ~3,500 khi nến ~1,845) vẽ rỗng + nhãn "off venue print", không kéo về nến. Mọi typed state giữ nguyên.

### OR-5.4 Lộ trình + ước lượng thật

| Bước | Giao gì | Ước lượng |
|---|---|---|
| S1 lõi | `lightweight-charts` lazy-import; `ReplayCandleChart` canvas, theme từ `--exec-chart-*` + 2 token trade mới (chỉ trong `tokens.css`, U02 gate); crosshair + legend; markers long/short; price line TP/SL; interval/Fit/typed states; giữ nguyên `readReplayOrders/pairRoundTrips/legLevels/buildLog` | 1.5–2 ngày |
| S2 signature | primitive bracket/position box, ladder grid, ribbon round trip, trigger/reject/cancel, hover card marker, đồng bộ log ↔ chart, phím ←/→ nhảy trade | 2–3 ngày |
| S3 gate | vitest (jsdom không có canvas → mock LWC, test data model), Playwright baseline mới cho tab Replay, perf budget 1500 bar / 60 fps pan, reduced-motion, attribution link | 1 ngày |

Tổng **4–6 ngày làm việc**. Reuse: cùng component cho Account 360 (fill của
account), Full Blotter "open on chart", Sandbox certification replay — không
phải chart riêng cho một tab.

### OR-5.5 Ba nhóm quyết định (§7.7)

- **(a) Bobby quyết**: ① làm hay để sau §A5.5 (Paper/Portfolio/Live Overview còn lệch showcase); ② chấp nhận attribution "TradingView" trên chart; ③ egress venue công khai (OR-4) — signature trên nến sai nguồn thì đẹp vô nghĩa.
- **(b) Claude làm không cần chờ**: S1–S3 ở trên, toàn bộ FE, không đổi contract nào.
- **(c) chờ codex**: BR-EX-50 kline shard (để marker khớp feed của chính hệ thống, hết cảnh fill lệch nến) — không chặn S1–S3, chỉ đổi nguồn lớp nến khi giao; DR-22 scope facts theo alpha.

### OR-5.6 Quyết định owner 06-09 (chiều) — OR-5 chuyển sang **APPROVED để lập kế hoạch**, duyệt từng phase

Nguyên văn: *"không cần chờ codex, làm riêng được. Ưu tiên làm cái này trước,
các G và R khác goal sau. Chấp nhận hiện TradingView badge. Nguồn nến lấy từ
data layer bên Trading System qua portal execution, hoặc tự call REST Binance /
OKX theo đúng interval của alpha_id — không cần nhanh/stream, chỉ cần đúng và
khớp giá từ database Trading System lên nến; order, fill, lệnh điều kiện, mark…
từ database Trading System vẽ lên candle. Cho phép tăng chiều cao khung Trade
Replay vừa phải. Tạo 3 phase, duyệt từng cái."*

| Điểm | Chốt | Hệ quả kế hoạch |
|---|---|---|
| Ưu tiên | OR-5 trước §A5.5 và mọi G/R khác | 3 phase dưới đây là việc kế tiếp của Claude; không đụng phase EDS của codex |
| Attribution | Chấp nhận badge "TradingView" | Đặt góc dưới-phải chart, kích thước tối thiểu theo NOTICE của thư viện |
| Nguồn nến | REST venue trực tiếp (Binance/OKX) **hoặc** data_layer qua edge; đúng interval alpha | Phase 1 dùng route OR-4 (đã có), thêm OKX; adapter nguồn để đổi sang data_layer `/v1/binance/futures/klines/{symbol}` (pack `extract/data-layer-contract.json`) khi BR-EX-50 giao — chart không đổi |
| Khung | Tăng chiều cao vừa phải | 258 px (viewBox hiện tại) → **420 px** mặc định, nút Expand → 620 px, nhớ theo viewer |

**Kiểm sẵn sàng bằng máy (06-09, dev DB read-only + host egress):**
- Deployment của `adaptive_hma_cpp_00115m`: `venue BINANCE`, `mode paper|sandbox`, instrument `ETHUSDT.BINANCE`, account riêng từng alpha (`paper-binance-<strategy_id>`) → lọc theo account (DR-22) là an toàn với cách đặt tên này.
- **Trading System không publish timeframe của alpha**: strategy row chỉ có `active, trader_id, created_at, strategy_id`; không object nào trong projection có key `timeframe|interval|resolution`. → Phase 1 suy interval từ hậu tố id (`…15m`, `…30m`) và **dán nhãn DERIVED, cho đổi tay**; ghi **BR-EX-80** xin codex trường `timeframe` trong strategies/fleet register. Không bịa.
- Egress từ host: Binance `fapi/v1/klines` 200/0.14s, OKX `api/v5/market/candles` 200/0.16s. DNSE (VN) không có nến công khai tương đương → typed `MARKET_CANDLES_VENUE_UNSUPPORTED`.
- Trong DB có `mark_price`/`mark_price_at` trên position rows (75 object) → Phase 2 vẽ được đường mark DERIVED từ chính hệ thống để đối chiếu với nến venue.
- Thư viện: `lightweight-charts` chưa có trong bundle; sẽ pin version chính xác, lazy-import như uPlot (OR-3).

### OR-5.7 Kế hoạch 3 phase — mỗi phase một gate, Bobby duyệt từng phase

**Phase R1 — Nền chart chuẩn TradingView (lõi)** · ước lượng 2 ngày · trạng thái: **ĐÃ GIAO 06-09 → xem OR-5.8, chờ Bobby duyệt trên dev**

| | |
|---|---|
| Giao | `ReplayCandleChart` (canvas, Lightweight Charts) thay lớp vẽ SVG; giữ nguyên lớp dữ liệu `readReplayOrders / readReplayFills / legRole / pairRoundTrips / legLevels / buildLog` và log bên phải |
| Tương tác | crosshair + bảng O/H/L/C/V + thời gian UTC theo con trỏ; kéo trục giá để giãn/nén; wheel zoom neo tại con trỏ; kéo ngang có quán tính; double-click trục giá = auto-scale; Fit; phím Home/End |
| Marker (bản đầu) | ▲ LONG dưới low màu `--exec-trade-long`, ▼ SHORT trên high màu `--exec-trade-short` (token mới, chỉ trong `tokens.css`); vào = đặc, ra = rỗng + nhãn pnl server; cỡ 10–12 px, viền nền; TP/SL của leg đang hiển thị = price line có nhãn |
| Nến | interval mặc định = timeframe alpha (DERIVED từ id, đổi tay được); venue theo deployment (BINANCE → `fapi`, OKX → `api/v5`, khác → typed unsupported); range = sự kiện ±N nến; cache/budget như OR-4 |
| Khung | 420 px + Expand 620 px; badge TradingView; footer nguồn + giờ fetch + authority giữ nguyên |
| File | FE: `components/ReplayCandleChart.tsx` (mới), `TradeReplayEvents.tsx` (bỏ lớp SVG nến, giữ data + log), `styles/tokens.css` (+2 token), `execution.css` (khung), `api/marketCandles.ts` (+venue/interval map). BE: `market-candles.service.ts` (+OKX adapter, venue map), spec |
| Gate | control-api spec; FE `tsc` + vitest (mock LWC trong jsdom, test lớp dữ liệu + props) + build; Playwright baseline mới cho tab Replay trên probe; đo pan 1500 nến ≥ 55 fps bằng harness; U02 colour/font gate |
| Bobby kiểm trên dev | crosshair đúng số nến; kéo trục giá; zoom tại con trỏ; kéo quán tính; marker long/short đúng màu, đúng side, to hơn; badge; khung cao hơn; đổi interval |
| Đóng khi | gate xanh + Bobby OK trên dev + dòng deploy ghi ở đây |

**Phase R2 — Signature: lệnh điều kiện, bracket, grid, round trip, đồng bộ log** · 2–3 ngày · trạng thái: **ĐÃ GIAO 06-09 → xem OR-5.9, chờ Bobby duyệt trên dev**

| | |
|---|---|
| Giao | primitive tự vẽ (`ISeriesPrimitive`): **bracket** entry→TP (tint long) / entry→SL (tint short), cả hai → position box + nhãn R:R; **ladder** cho grid/nhiều lệnh chờ (gộp "×N levels" khi >8, nhãn trung thực); TRIGGER ◇ trên đường leg, REJECT ×, CANCEL đường cắt cụt; **ruy băng round trip** entry→exit + pnl server; **hover card** marker (order id, qty, giá, phí, realized pnl, thời gian ack nếu có); **đồng bộ hai chiều** hover/click marker ↔ dòng log, phím ←/→ nhảy trade; fill ngoài dải nến vẽ rỗng + "off venue print"; **đường mark DERIVED** từ `mark_price` DB (đối chiếu DB ↔ nến venue) |
| Dữ liệu | 100% server: `trigger_price`, `order_type`, `realized_pnl`, `submitted_at/updated_at`, `mark_price`; FE chỉ ghép (round trip, vai leg) và ghi rõ DERIVED |
| Gate | unit test hình học/ghép; Playwright baseline 4 trạng thái (1 leg, 2 leg, grid, reject); reduced-motion; §8 scale cells (cardinality fill/leg trong cửa sổ, cap) |
| Bobby kiểm | bracket/box đọc được ngay; grid không rối; hover card đúng số; click log → chart cuộn tới trade |
| Đóng khi | gate xanh + Bobby OK grammar + §8 đủ 6 ô |

**Phase R3 — Hiệu năng, dùng lại, sẵn sàng đổi nguồn** · 1–1.5 ngày · trạng thái: **ĐÃ GIAO 06-09 → xem OR-5.10, chờ Bobby duyệt trên dev**

| | |
|---|---|
| Giao | fetch nến theo trang ≤1500/call, khâu coverage, gap gạch chéo; prefetch khi kéo tới mép; auto-fit interval theo range; nhớ interval/height theo viewer; **dùng lại** chart ở Account 360 (fill của account) và Full Blotter "open on chart" (deep link `?tab=Trade%20Replay&order=`); adapter nguồn nến: `VENUE_PUBLIC_MARKET_DATA` ↔ data_layer qua edge (BR-EX-50) ↔ Trading System kline shard — chart không đổi; tiêu thụ BR-EX-80 `timeframe` khi codex giao |
| Gate | full FE gate + refresh baseline; perf budget ghi số thật; tracker cập nhật A0/§8; Reuse report |
| Đóng khi | gate xanh + Bobby OK + OR-5 chuyển DONE; DR-23 đóng theo phân loại của codex |

**Backend request (BR-EX-80, @codex):** trường `timeframe`/`bar_interval` của
strategy trong relation `strategies` (hoặc fleet register BR-EX-72) để Trade
Replay chọn đúng interval mà không suy từ id. Ảnh hưởng: tới khi giao, FE
dán nhãn DERIVED. Đề xuất schema: `timeframe: "1m"|"5m"|"15m"|"30m"|"1h"|"4h"|"1d"`.

### OR-5.8 Phase R1 — ĐÃ GIAO 06-09 (chờ Bobby duyệt trên dev) · nhánh `feat/trade-replay-signature` (từ `daa30a8`)

**Commit:** `e465100` (control-api: phân trang Binance tới 6000 nến, adapter OKX SWAP, interval 30m) · `ce9d230` (FE: chart canvas Lightweight Charts, marker theo side, cửa sổ mở đầu theo fill, N29 re-pin). Push `origin/feat/trade-replay-signature`.

**Đã làm (khớp OR-5.7 R1):**
- `ReplayCandleChart.tsx` (mới, ~600 dòng): wrapper `lightweight-charts@5.2.1` (lazy-import như uPlot), `TradesPrimitive` vẽ toàn bộ lớp trade từ dòng server; HUD crosshair O/H/L/C/V/Δ%; kéo trục giá, wheel zoom neo con trỏ, kinetic pan (tắt khi reduced-motion/webdriver); Fit; palette đọc từ token CSS lúc chạy (không màu thô trong TSX); badge TradingView (`attributionLogo`) + dòng attribution ở footer.
- Marker theo **side vị thế**: LONG ▲ teal dưới giá (vào đặc) / ▽ rỗng trên giá (ra, nhãn realized_pnl màu theo dấu); SHORT ▼ amber trên giá / △ rỗng dưới giá. Cỡ 13×14 px, viền nền. TP/SL leg nét đứt tại `trigger_price` từ submit→terminal, nhãn khi ≥70 px; round trip nét chấm màu side; reject ×; print lệch xa (fill 3,500 giữa nến 1,8xx) kẹp mép + nhãn "off venue print".
- x của sự kiện = chỉ số nến lẻ (`logicalOf`, i−0.5+phần lẻ) — thư viện chỉ map chỉ số nguyên nên cộng phần lẻ × barSpacing (lỗi thật đã bắt trên probe: mọi marker về x=0).
- Cửa sổ mở đầu: từ fill thứ 6 cuối → fill cuối (+pad), lệnh sau chỉ gộp nếu ≤2 ngày; **áp lại khi fill đến đợt sau** (resource rows trước, N25 facts sau) — trước đó view bị giữ ở đợt 1.
- Khung 420 px, Expand 620 px (nhớ theo viewer, localStorage). Token mới `--exec-candle-up/down`, `--exec-trade-long/short`, `--exec-chart-crosshair` cho 4 theme.
- Interval mặc định = hậu tố id (`…00115m` → 15m, nhãn "inferred from the strategy id · DERIVED"), đổi tay được; `fittingInterval` giữ interval alpha tới 6000 nến rồi mới nâng. Venue theo deployment (BINANCE→USDM, OKX→SWAP; khác → typed unsupported).
- Backend: Binance 1500/trang đi tới từ `from_ms` (hoặc lùi từ `to_ms`), OKX `history-candles` 100/trang newest-first đảo từng trang; `coverage.pages`; `truncated` = đầy limit mà cửa sổ còn hở. Config `EXECUTION_PUBLIC_MARKET_CANDLES_OKX_ORIGIN`.

**Gate (số thật):** control-api build-tsc sạch, spec 10/10 · FE tsc sạch (15 lỗi tsc còn lại đều ở spec của codex `canary-control-room/command-center/profile-projection`, không thuộc diff) · vitest **1880 pass / 1 skipped (104 file)** · U02 colour/font gate qua hook pre-commit.

**Bằng chứng browser (probe :8090, harness `replay-r1.js`, DPR 2):** `r1e_01_tab.png` (cả tab), `r1e_02_chart.png` (cửa sổ mở đầu Jul 24→27: 3 round trip, leg TP/SL, nhãn −3.4896/+1.3208/+2.05821), `r1e_07_fit.png` (Fit cả record Jul 19→Aug 3, reject ×, print 3,500 kẹp mép), `r1e_08_tall.png` (620 px). Đo: 1512 nến 15m (2 trang), 10 fill, 12 leg, 5 round trip; HUD crosshair "Jul 18 22:00 UTC · O 1,859.98 H … C 1,862.11"; hover marker → "LONG exit · TP · fill 4047 · SELL 0.077 @ 1,960.82 · realized 2.05821"; dòng log sáng theo marker; pan 40 bước **60 fps**; đổi interval 15m→1h → 378 nến; console 0 lỗi.

**Phát hiện ngoài lề, đã xử lý:** DB probe thiếu migration `1723680000024_execution-portal-observation-journal` → worker projection `POSTGRES_42703`, reads 503 `PHASE2_PROJECTION_STALE_CEILING_EXCEEDED`; chạy `control-api-migrate` cho DB probe, refresh lại bình thường. Dev không bị (migration đã có).

**Chưa có trong R1 (đúng kế hoạch):** bracket/position box, ladder grid, hover card, click log → chart, phím ←/→ (R2); prefetch/trang khi kéo, nhớ interval, dùng lại Account 360/Blotter, adapter nguồn (R3). OKX adapter có spec nhưng chưa có alpha OKX trong fleet để nhìn bằng mắt.

**Bobby kiểm trên dev:** `/deployments/alphas/adaptive_hma_cpp_00115m?tab=Trade%20Replay` — di chuột thấy HUD số nến; kéo trục giá phải giãn/nén; wheel zoom tại con trỏ; kéo ngang có quán tính; Fit; Expand; đổi interval; hover ▲▽ thấy fill; badge TradingView góc dưới trái.

### OR-5.9 Phase R2 — ĐÃ GIAO 06-09 (chờ Bobby duyệt trên dev) · commit `5704ac4` trên `feat/trade-replay-signature`

**Đã làm (khớp OR-5.7 R2), toàn bộ từ dòng server:**
- **Position box** (công cụ Long/Short Position của TradingView): mỗi fill vào lệnh nhận TP và SL được arm trong cửa sổ ghép 180 s sau fill (client id không có khoá chung → ghép theo thời gian, ghi **DERIVED** trong title/legend); vùng lời entry→TP (tint good), vùng rủi ro entry→SL (tint bad), đường entry màu side, nhãn **R:R** = |TP−entry|/|entry−SL| từ chính các mức server; hộp còn mở thì mép phải nét đứt.
- **Kết cục leg**: ◇ tại thời điểm leg khớp (TRIGGER), ⊣ tại thời điểm huỷ (CANCEL) — từ `status` của order leg và `updated_at`.
- **Ladder**: lệnh LIMIT nghỉ (không phải TP/SL) vẽ nét chấm tại `price` từ submit → terminal, tối đa 8 trong khung, còn lại đếm "+N resting levels not drawn". Alpha này không có lệnh LIMIT → ladder = 0 (đúng dữ liệu); có unit test với 2 lệnh LIMIT.
- **Hover card** theo con trỏ: fill · side·qty · price · fee (+currency, taker/maker) · realized (màu theo dấu) · order (id·type·status, cảnh báo "no venue id") · time · trade id; reject card có mã lỗi + lý do + "drawn at (nearest fill · DERIVED)" khi lệnh không có giá; ladder card có armed/ended.
- **Đồng bộ hai chiều**: hover marker → dòng log sáng; click marker → chọn dòng log (cuộn tới); hover dòng log → marker/leg/hộp sáng; click hoặc Enter dòng log → chart cuộn về sự kiện, giữ độ rộng cửa sổ, vòng highlight; **← →** (khi khung chart có focus) bước qua từng fill theo thời gian.
- Không vẽ đường mark DERIVED từ `positions.mark_price` như dự kiến: trường này **null** cho alpha (vị thế FLAT) → không có gì để vẽ, không bịa.

**Gate:** FE tsc sạch · vitest ****1887 pass / 1 skipped (104 file; hook pre-commit xanh, gồm U02 token gate sau khi bỏ rgba() → globalAlpha)**** · U02 colour/font gate qua hook.

**Bằng chứng browser (probe :8090, harness `replay-r2.js`):** `r2d_02_chart.png` (3 hộp trong cửa sổ mở đầu: SHORT Jul 24 R:R 1.05 SL trigger ◇ / TP ⊣, LONG Jul 25 R:R 0.72 TP ◇ / SL ⊣, LONG Jul 26 TP ◇), `r2a_03_card.png` (card "LONG EXIT · TP" fill 4047, fee 0.06039326 USDT taker, realized 2.05821, order 40548 TAKE_PROFIT_MARKET FILLED), `r2d_05_row_focus.png` (click dòng fill 1877 → chart về Jul 18), `r2d_07_fit.png` (Fit: 5 hộp, vòng chọn fill 2386, off print 3,500 kẹp mép, leg lẻ Jul 28–Aug 3, reject ×). Đo: 5 bracket (R:R 2.00 / 0.91 / 1.05 / 0.72 / 0.66), 12 leg end; click marker → `selected fill:4047`; click dòng log fill 1877 → visible range 628..961 → −144..189 (về đúng fill); ArrowRight ×2 từ 1877 → 1894 → 2386; console 0 lỗi.

**§8 scale refine — Trade Replay (6 ô):**

| Ô | Trade Replay |
|---|---|
| Cardinality | hi-fi ngầm ~10 fill / 6 leg / 1 symbol; thực tế alpha này 10 fill · 29 order · 12 leg trong 46 ngày; p95 fleet ước ~10³ fill/alpha/quý (grid alpha cao hơn); nến 6000/lần đọc |
| Break point | >~300 marker trong một khung: nhãn pnl và hộp chồng nhau; >8 mức ladder trong khung: rối; >6000 nến: interval tự nâng |
| Degradation | nhãn pnl ẩn khi <2.5 px/nến; R:R ẩn khi hộp <46 px; ladder cap 8 + đếm phần còn lại; nến nâng interval (nhãn ghi "requested · fits"); hover card/hit-test chỉ trên đối tượng đã vẽ trong khung |
| Server contract | BR-EX-50 kline shard (thay VENUE_PUBLIC_MARKET_DATA), BR-EX-80 `timeframe`, DR-22 facts scope theo alpha, DR-24 (mới): fill của order 41279 (FILLED) không có trong `fills` — projection cắt/thiếu |
| Invariant | mọi số = chuỗi server; ghép round trip/bracket ghi DERIVED; print lệch không kéo về nến (vẽ rỗng + nhãn); cap ladder luôn in "+N"; không typed state nào bị hộp/nhãn che thành xanh |
| Perf budget | pan 60 fps @1512 nến + 10 fill (đo); ngân sách 6000 nến + 500 marker ≥ 55 fps (đo ở R3); updateAllViews O(objects) mỗi frame, không React re-render khi hover trừ khi đổi đối tượng |

**Bobby kiểm trên dev:** hover ▲▽ thấy card; click ▲ thấy dòng log được chọn; click dòng FILL cũ thấy chart cuộn về; nhấn vào khung rồi ← → ; hộp lời/lỗ và R:R ở mỗi entry; ◇/⊣ ở cuối leg.

### OR-5.10 Phase R3 — ĐÃ GIAO 06-09 (chờ Bobby duyệt trên dev) · commit `e06963a` trên `feat/trade-replay-signature`

**Đã làm (khớp OR-5.7 R3):**
- **Phân trang khi kéo tới mép**: chart phát tín hiệu khi cửa sổ vào trong 40 nến của đầu/cuối record (chỉ sau khi cửa sổ mở đầu đã ổn định, không bắn từ lần layout đầu của thư viện); container đọc thêm 1 trang 1500 nến phía đó (single-flight, phía đã hết thì nhớ), gộp tăng dần theo open time, giữ nguyên cửa sổ thời gian đang xem; header ghi "loading earlier/later candles".
- **Nhớ theo viewer**: interval theo subject (`exec.replay.interval.<alpha|account>`), chiều cao (R1). Nhãn "5m · remembered".
- **BR-EX-80 sẵn sàng**: nếu strategies/deployments rows có `timeframe|bar_interval|interval|resolution` hợp lệ → dùng và ghi "strategy timeframe (published)"; hôm nay không có → suy từ id (DERIVED). Account id `paper-binance-<strategy_id>` cũng suy được.
- **Deep link**: `?tab=Trade%20Replay&focus=order:<id>` (hoặc `fill:<id>`) mở replay, chọn và cuộn tới đối tượng lệnh đó để lại (fill / reject / leg / ladder). **Full Blotter**: mỗi dòng có "open on chart" → link đó (hàng blotter mang `strategy_id`, không có `deployment_id`). Sửa kèm: `order_id` trong blotter là số → trước in "order id not published", nay in đúng số.
- **Account 360**: mount cùng `TradeReplayLive` (slot `tradeReplay` sau equity chart) trên rows của account (EDS-04) + N25 facts của strategy account đang deploy; **scope theo account** — phát hiện & sửa: deployments trong N25 là toàn profile nên bản đầu kéo 42 account vào (25 fill lạ BTC/SOL); nay `replayEvents(…, accountId)` chỉ nhận account đó (test unit).
- **Adapter nguồn nến (backend)**: `EXECUTION_MARKET_CANDLES_SOURCE = venue_public | data_layer`; envelope thêm `source.kind`, `source_authority` = `VENUE_PUBLIC_MARKET_DATA` | `TRADING_SYSTEM_DATA_LAYER`; `data_layer` trả typed `MARKET_CANDLES_SOURCE_NOT_WIRED` (không gọi venue, không bịa) tới khi codex giao BR-EX-50 qua edge (`/v1/binance/futures/klines/{symbol}` trong data-layer-contract.json). Đổi nguồn = đổi env, chart/route/vocabulary không đổi.

**Gate:** control-api build-tsc sạch, spec 11/11 · FE tsc sạch · vitest ****1891 pass / 1 skipped (104 file)**** · U02 gate qua hook.

**Bằng chứng browser (probe :8090, harness `replay-r3.js`):** kéo sang quá khứ 6 lần → 1512 → **3012 nến** (call thứ 2: `to_ms=<first−1>&limit=1500`), `r3c_01_paged_left.png`; chọn 5m → 4536 nến, pan **60 fps**; reload → "5m · remembered"; `?focus=order:40548` → chọn `fill:4047`, chart canh giữa (`r3c_02_deeplink.png`); Account 360 `paper-binance-adaptive_hma_cpp_00115m` → panel Trade replay + log, 1512 nến, **đúng 10 fill của account** (`r3c_03_account.png`); Blotter 49 dòng → 49 link `open on chart` (ví dụ `/deployments/alphas/sl_tp_map_ma_00115m_binance?tab=Trade%20Replay&focus=order:48651`); console 0 lỗi.

**Perf budget (đo):** 4536 nến 5m + 10 fill + 5 hộp: pan 60 fps; 7534 nến (khi thử paging tự phát): 61 fps. Trần đọc 6000/lần + paging 1500/lần; ladder cap 8.

**Reuse report (v0.5 §11.3):** `ReplayCandleChart` + `TradeReplayEvents` dùng ở Alpha 360 và Account 360; Blotter chỉ thêm link (không panel mới); token/chip/legend/footer/table dùng lại `.exec-rp-*` có sẵn; không tạo primitive mới ngoài `TradesPrimitive`.

**Còn lại / ngoài phạm vi:** nến từ data_layer (BR-EX-50, codex); `timeframe` (BR-EX-80, codex); DR-24 fill thiếu của order 41279; DR-25 (mới) EDS-04 account resource chỉ trả 1 fill (bị bound) trong khi N25 có 10 — codex xác nhận bound; OKX chưa có alpha để nhìn bằng mắt; hatched gap chưa cần (venue liên tục).

**Bobby kiểm trên dev:** kéo chart sang trái tới hết nến → thấy "loading earlier candles" rồi nến nối dài; đổi interval rồi reload → nhớ; mở Blotter → bấm "open on chart" → replay mở đúng lệnh; mở Accounts & Bindings → account paper → panel Trade replay dưới equity.

### OR-5.11 Kiểm phủ từ vựng lệnh (owner hỏi 06-09: "OCO, reduce_only, GTC… cover hết chưa?") · commit `5b59384`

**Đo trên projection dev (812 order, mọi profile):** `order_type` = TAKE_PROFIT_MARKET 641 · MARKET 92 · STOP_MARKET 47 · LIMIT 32; `status` = RISK_REJECTED 658 · FILLED 91 · CANCELED 63; `time_in_force` = GTC 812; `position_side` = BOTH 812; `reduce_only` true 732 / false 80; `post_only` false 812; venue BINANCE 812. Khoá trên order rows: không có trường OCO / bracket_group / trailing / activation / callback nào — OCO chỉ tồn tại ngầm qua cặp TP+SL cùng bracket. Client id: `brk-<hash>-en0|st0|tp1..tp4` (bracket, tới 4 TP một phần) và `0000..0007` (grid LIMIT).

| Từ vựng | Nguồn | Vẽ / xử lý | Trạng thái |
|---|---|---|---|
| MARKET entry/exit | type + fill | ▲▼ theo side vị thế, exit rỗng + pnl | ✓ dữ liệu thật |
| LIMIT (grid/ladder) | type LIMIT, price, status | ┈ mức nghỉ từ submit→terminal, cap 8 + "+N hidden" | ✓ `burst_paper_alpha` 16 mức → 8 vẽ + 8 đếm |
| TAKE_PROFIT_MARKET / _LIMIT | type prefix | leg TP, ◇ khi khớp, ⊣ khi huỷ/expire | ✓ |
| STOP_MARKET / STOP_LIMIT | type prefix | leg SL | ✓ |
| TRAILING_STOP_* | type prefix | leg bảo vệ nhãn TRAIL tại `trigger_price` (chưa có trong dữ liệu; không có activation/callback để vẽ thêm) | ✓ logic + test, chưa thấy dữ liệu |
| Bracket nhiều TP (tp1..tp4) | coid suffix + thời điểm arm | box tới TP xa nhất, nhãn "R:R x · TP×n", từng mức TP vẽ riêng | ✓ sửa 06-09 (trước chỉ nhận 1 TP) |
| OCO | không có trường | ngầm: TP khớp ◇ → SL huỷ ⊣ trong cùng box; không dán nhãn "OCO" vì nguồn không nói | ✓ trung thực |
| reduce_only | flag | phân vai leg khi type không nói; hiện trong log/card | ✓ |
| post_only / time_in_force (GTC/IOC/FOK/GTX) | flag/text | log + card (không cần hình); IOC/FOK không khớp → EXPIRED/CANCELED xử lý theo status | ✓ |
| position_side LONG/SHORT (hedge) | field | side marker/box lấy từ position_side khi ≠ BOTH | ✓ logic + test, dữ liệu hôm nay chỉ BOTH |
| RISK_REJECTED / REJECTED / DENIED | status | × gộp theo nến "×N", card lý do; **lệnh reject không bao giờ là leg/ladder** | ✓ sửa 06-09 (fib: 24–31 "TP" ma → 0–3 thật; 310 reject → 16 cụm, max ×31) |
| CANCELED / EXPIRED | status | ⊣ cuối leg / mức (EXPIRED ghi "expired"), log EXPIRE | ✓ |
| TRIGGERED (chạm mức, chờ khớp) | status | ◇ tại updated_at, leg vẫn working; log "triggered · awaiting fill" | ✓ logic + test |
| NEW/WORKING/INITIALIZED/SUBMITTED/ACCEPTED/PENDING_*/PARTIALLY_FILLED | status | leg/mức đang working (không có mốc kết thúc), fill từng phần qua rows `fills` | ✓ |
| VN (DNSE: LO/ATO/ATC/MP) | chưa có trong projection | không có nến công khai (typed unsupported); type VN chưa map — sẽ map khi có dữ liệu | ✗ ngoài dữ liệu hôm nay |
| Fill giá lệch venue (paper) | fills | vẽ rỗng + "off venue print · giá" (fib: 125.00; adaptive: 3,500) | ✓ |

**Kết luận trung thực:** phủ 100 % từ vựng đang có trong DB và toàn bộ status của contract; ba mục có logic + test nhưng chưa có dữ liệu để nhìn bằng mắt (trailing, hedge position_side, TRIGGERED/EXPIRED/DENIED); VN types ngoài phạm vi dữ liệu hiện tại. Bằng chứng: `vocab2_fib_sl_tp_strength_0015m_fit.png`, `vocab2_burst_paper_alpha_fit.png`.

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
| A-04 | EDS-04 bốn màn resource | từng màn một | 🟡 **CHẤM MỘT PHẦN 05-09 (tối)** — 4/4 route 200 trên probe, 17–18 panel typed (READY/PARTIAL/EMPTY), binding lạ → EMPTY typed; FE đã wire sẵn (recomposeContainers) và render thật trên probe. Còn: ký từng màn + identity ngoài trang đầu (Bobby xem dev) · **DR-18** (workspace) |
| A-05 | EDS-05 derivations+governance | từng op một | 🟡 **CHẤM MỘT PHẦN 05-09 (tối)** — 5/5 derivation route 200 typed; execution-quality có số thật (19 orders · 10 fills · reject 1/19); capital PARTIAL (ledger chưa publish); source-health PARTIAL/AGING; activity EMPTY mọi id thử (**DR-21**); governance approvals 200 (filter[...]); ops queue 403 cho USER (typed denied). FE wire 4 tile (§A4). Golden vector chưa tính lại |
| A-06 | EDS-06 mirror/index cutover | dual-read bật | 🔶 SẴN SÀNG CHẤM — `3a9c996` (DR-01 phải trả lời trong lúc chấm) |
| A-07 | EDS-07 chart DTO | DTO đầu tiên | 🟢 **A-07 CHẤM ĐẠT-CORE 05-09 (tối)** — paper account equity/drawdown READY 1946/51370 điểm `MIN_MAX_LAST_BUCKET_V1` (extrema+first/last giữ, gaps không publish); portfolio → UNAVAILABLE `MANAGER_V2_SOURCE_CONTRACT_REJECTED` (nguồn); live/sandbox → `EDS07_RELATION_NOT_MIRRORED` tới khi mirror có relation (**DR-20**); viewport ngoài 256–2048 bị 400 (FE clamp); risk-decisions typed EMPTY/UNAVAILABLE. **A-07b ✅ ĐÃ SHIP** `172ebdd` PrimusFinancialChart |
| A-08 | EDS-08 asks packet | packet hợp nhất | ✅ **CHẤM ĐẠT 05-09** — addendum ghi parent MC-01, một kênh duy nhất → **DR-07 ĐÓNG** |
| A-09 | EDS-09 observation-lane | reducer đầu ra đầu tiên | ✅ **ĐÃ CHẤM 05-09: ACCEPT-CORE / DR-13 OPEN** — xem phiếu |
| A-10 | EDS-10 replay/candles | contract chấp nhận | ⬜ xa |
| A-11 | EDS-11 SSE + action graph | kênh SSE v2 | ⬜ xa |
| A-12 | EDS-12 release | gói release | ⬜ xa |

**ĐANG Ở ĐÂY (05-09 tối) →** đợt goal 2 (G7+G4+G5) ĐÃ LÊN dev-portal — xem **§A4**; chờ Bobby goal cả đợt 1+2. Lịch sử: L1 ✅ · A-08 ✅ · A-09 ✅(có điều kiện DR-13) · hàng đợi
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
- **Trạng thái (05-09 tối)**: 🟡 chấm route + render, chưa ký màn. Bằng chứng
  probe (claude-probe, `workspace_id` tường minh): `/resources/alphas/…` 200
  628KB 18 panel · `/portfolios/…` 200 960KB 18 panel · `/accounts/…` 200
  497KB 17 panel · `/bindings/unknown` 200 EMPTY typed (không 404 — đúng spec
  "absence stays EMPTY"). Panel state phân bố: strategies/deployments/accounts/
  portfolios/positions READY; balances/sync/sessions/orders/fills PARTIAL;
  venue_accounts EMPTY. FE: cả 4 container đã đọc resource BFF; Alpha 360 render
  thật trên probe (ảnh §A4). **Chặn ký**: DR-18 (session của user không phải
  chủ projection workspace → 404 typed) và payload 0.5–1MB/màn (DR-10).

### Phiếu A-05 — EDS-05: 5 derivations + governance/ops
- **Bước chấm**: golden vectors từng formula (tôi tự tính lại bằng exact
  decimal độc lập); partial/stale lan truyền đúng; redaction dead-letter
  (bucket D) không lộ raw; mọi route governance/ops probe xanh.
- **ĐẠT khi**: 5 formula + 8 màn governance/ops ký.
- **Trạng thái (05-09 tối)**: 🟡 route + FE wire xong, formula chưa ký.
  Probe: `source-health` PARTIAL (paper AVAILABLE/AGING/PARTIAL, seq 7387) ·
  `deployments/{id}/execution-quality` PARTIAL `SOURCE_PARTIAL` với số thật
  (sessions 2000 · orders 19 · fills 10 · submitted 19 · filled 11 · risk-rej 1
  · reject_rate 1/19 · latency UNAVAILABLE `N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED`)
  · `portfolios/{id}/capital` PARTIAL `EDS05_PORTFOLIO_CAPITAL_LEDGER_NOT_PUBLISHED`
  (USDT 42 tài khoản · allocated 11,360,000 · unpublished: portfolio_capital_ledger,
  account_reservations) · `alphas/{id}/activity` EMPTY `EDS05_ALPHA_NOT_FOUND`
  cho CẢ 3 id thử (DR-21) · `conditional-groups/{id}` EMPTY typed. Governance:
  approvals 200 (lọc bằng `filter[environment]=`, không phải `environment=`);
  ops queue 403 với role USER (typed denied — Bobby ADMIN không bị). Deployment
  id phải URL-encode (`:` trong id) — không encode thì 404 `REQUEST_REJECTED`
  từ gateway. FE (`172ebdd`): 4 tile EDS-05 lên 4 màn (§A4).

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
- **Trạng thái (05-09 tối)**: A-07 🟢 **ĐẠT-CORE** — DTO đúng MỘT từ vựng
  downsample (`sampling.algorithm` + cờ `preserves_*`), extrema/first/last
  bảo toàn theo cờ server, budget điểm theo `viewport_px` (256–2048, ngoài
  khoảng server trả 400 chứ không clamp → FE clamp trước khi gọi), `scale_mode`
  LOG tôn trọng bằng nút Lin/Log (không client clamp). Chưa ĐẠT-FULL vì:
  portfolio subject bị nguồn từ chối, live/sandbox chưa mirror (DR-20), gaps
  `SOURCE_GAP_INTERVALS_NOT_PUBLISHED`. · A-07b ✅ **ĐÃ SHIP** (`172ebdd`):
  `charts/financial/{chartTheme,financialData,PrimusFinancialChart}` + adapter
  `api/financialChart.ts`; artifact-look tái hiện trên probe (ảnh §A4).

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
| G4 | A-04 + wire 4 màn resource | Alpha/Portfolio/Account/Binding 360 mở từ khóa chuẩn, deployment ngoài trang đầu vẫn mở được | 1.5 ngày | 🟡 **ĐỢT 2 (05-09 tối)** — route+render xong, chưa ký màn (DR-18/DR-10) — chờ Bobby goal trên dev |
| G5 | A-05 + wire governance/ops | Inbox/R1/R2/Exit/Waivers/Queue/Incident có số + formula version hiện trên tile | 1 ngày | 🟡 **ĐỢT 2 (05-09 tối)** — 4 tile derivation lên Command Center / Paper Workbench / Portfolio 360 / Alpha 360, formula id+version hiện trên tile; governance/ops tile CHƯA (route governance đã probe) — chờ Bobby goal |
| G6 | A-06 cutover từng màn (dual-read parity, DR-01 trả lời tại đây) | Cùng màn, số y hệt, payload NHẸ hẳn (đo byte trước/sau đính vào phiếu) | 1 ngày | ⬜ |
| G7 | A-07 + **A-07b `PrimusFinancialChart` + chartTheme.ts (OR-3)** ăn chart DTO | Chart equity/perf/drawdown ĐÚNG LOOK artifact đã duyệt, sparkline fleet, hết cap 2000 | 1.5–2 ngày | ✅ **ĐỢT 2 (05-09 tối) — SHIP `172ebdd`**: mọi EquityChart (Paper Workbench, Alpha 360, Live Full, Canary, Insight tile) chạy uPlot; Account 360 ăn EDS-07 DTO; sparkline fleet + ECharts reskin CHƯA — chờ Bobby goal |
| G8 | EDS-09b observation adapter (DR-13) + wire journal → EDS-11 SSE khi codex giao | Motion tick/flash nổ lại bằng revision thật | theo codex | ⬜ |

Tổng: **~8–10 ngày làm việc** cho chuỗi goal G1→G7 (EDS-10 chờ gate trading,
đúng chốt owner). Sau mỗi bước (5), §A0 lật trạng thái — Bobby dõi goal chỉ
bằng một bảng.

## A4. NHẬT KÝ GOAL ĐỢT 2 — G7 (chart) + G4 (resource) + G5 (derivations) — 05-09 tối

Owner order: *"3 phase 1 lúc, test kỹ, khai thác hết backend, đẹp, khớp với
frontend đã giao, hiệu ứng động không được mất, chart như BingX/OKX"*. Làm trên
nhánh `feat/eds-current-bff` (worktree `/home/bobby/portal-eds-current-bff`).

### A4.1 Đã giao (commit)

| Commit | Nội dung |
|---|---|
| `172ebdd` | **PrimusFinancialChart** (uPlot 1.6.32) thay ECharts trong `EquityChart` — cùng props/contract `EquitySeries`, cùng Table/Expand/Export, thêm Lin/Log · 1W/1M/3M/ALL · legend toggle band · kéo-zoom, Ctrl+wheel zoom, Shift+wheel pan, double-click reset · pill giá cuối exact + halo (pulse chỉ khi server nói fresh) · tooltip UTC · gap gạch chéo · band vàng. Adapter **EDS-07** `api/financialChart.ts` (reader + `financialChartView` → envelope khai downsample/rows/retention) wire vào **Account 360**. **EDS-05**: `api/derivations.ts` (4 reader) + `components/DerivationTile.tsx` (một grammar: chip state server, formula id·version, inputs kèm state, số = chuỗi server, reject rate giữ tử/mẫu) lên Command Center (source health), Paper Workbench (execution quality), Portfolio 360 tab Capital Ledger (capital), Alpha 360 Overview (activity). Token `--exec-chart-*` vào `styles/tokens.css` (gate U02 xanh). N29 pack re-pin 2 digest FE (DR-19). |
| `0964773` | compose overlay local-projection: map `FEATURE_EXECUTION_DURABLE_MIRROR(_READS)` ← `CONTROL_API_*` (mặc định false). |
| `635e2a5` | Tile derivation mang đúng grammar panel (`exec-gate-panel`, title direct-child → exec-a3/pf2 restyle như panel cạnh); Source health gộp 1 board 3 env; Capital board env × currency (3 env đọc riêng, không gộp, không total); quality tile lên cả nhánh non-hifi workbench; fill chart fade sớm; baseline `v2-equity-chart-demo` ×2 cập nhật. |

Gate FE: `tsc -b` sạch · vitest **99 file / 1847 pass** · `vite build` OK ·
Playwright fixtures **90/90** (chỉ 2 baseline chart-demo đổi; 4 baseline màn có
chart trong dung sai 0.2%). Gate control-api trong pre-commit (`verify-workspace`)
xanh cho `172ebdd`/`0964773`.

### A4.2 Bằng chứng probe-runtime (image `eds-probe`, DB restore dev, user claude-probe)

| Màn | Route probe | Thấy gì (thật, không fixture) |
|---|---|---|
| Account 360 | `/deployments/accounts/paper-binance-gridcombine001_4h` | Chart EDS-07 READY **2327 điểm** từ **51375 row** `MIN_MAX_LAST_BUCKET_V1`, cửa sổ 2026-06-30→09-05, bucket 6087s, pill `1,000,000.00`, pulse (server fresh), caption khai downsample + cảnh báo "retained snapshot range — not event replay" |
| Alpha 360 | `/deployments/alphas/adaptive_hma_cpp_00115m` | Equity-by-stage chart uPlot (46 điểm window 30d), tile Activity rollup **EMPTY typed** `EDS05_ALPHA_NOT_FOUND` (DR-21) |
| Portfolio 360 · Capital Ledger | `/deployments/portfolios/portfolio_types_pool?tab=Capital%20Ledger` | Capital board: paper USDT 42 tài khoản allocated 11,360,000 / max 11,360,000 / total-free-locked; sandbox/live "no currency rows"; PARTIAL `…LEDGER_NOT_PUBLISHED`; unpublished inputs nêu tên |
| Paper Workbench | `/deployments/paper/<deployment_id url-encoded>` | Chart 1473 điểm; tile Execution quality PARTIAL: sessions 2000 · orders 19 · fills 10 · submitted 19 · filled 11 · risk-rej 1 · reject 1/19 · latency UNAVAILABLE `N28_…` |
| Command Center | `/execution` | Source health board: paper/sandbox/live PARTIAL · AVAILABLE · AGING · seq 7483/7477/… |

Ảnh chụp 1440px lưu scratchpad phiên (`shot4_*.png`); Bobby duyệt trực tiếp
trên dev-portal. **Lưu ý probe**: claude-probe không phải chủ projection
workspace nên lần chụp đầu mọi EDS-04/05/07 trả 404 typed (DR-18); tôi đổi
owner workspace **trên DB probe** (không đụng dev) để chụp đường dữ liệu.
Trên dev, Bobby là chủ `ws_06G19F61YB8CFR7TEWMS7HQ660` → không gặp DR-18.

### A4.3 Deploy dev (`dev-portal.primusspark.com`)

- `.env` dev: bật `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=true` và
  `…_READS=true` (05-09 tối). Backfill mirror dev từ `execution_timeseries_history`
  (710k row) bằng script canonical-digest — chỉ paper relations có (DR-20).
- Image `:dev` build từ nhánh eds **`635e2a5`** (control-api + portal-web),
  `up -d` hai service trong project `portal` lúc 05-09 ~20:20 UTC — **ĐÃ LÊN**:
  `portal-control-api-1` + `portal-portal-web-1` healthy trên image `:dev` mới,
  env container có `FEATURE_EXECUTION_DURABLE_MIRROR=true`, `…_READS=true`,
  `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID=ws_06G19F61YB8CFR7TEWMS7HQ660`;
  mirror dev **710,449 row** (backfill 710k + worker); bundle FE
  `assets/index-BvUcBKjK.js`; `/views/equity-chart` không session → 401 typed
  (đúng). Các service khác (postgres/nats/minio/portal-api/quant-worker/
  roadmap-api) không đụng. Rollback: `up -d` lại với image `:dev` cũ hoặc tắt
  hai cờ trong `.env` rồi `up -d control-api`.

### A4.4 Bobby kiểm gì trên dev (checklist goal)

1. `/deployments/accounts/paper-binance-gridcombine001_4h` — chart "ACCOUNT
   EQUITY · PAPER": kéo chọn vùng để zoom, double-click reset, Ctrl+wheel,
   Lin/Log, 1W/1M/3M/ALL, hover tooltip UTC, pill giá cuối có halo nhấp nháy
   (fresh). Caption phải khai `51375 → 2327 samples · downsample MIN_MAX_LAST_BUCKET_V1`.
2. `/deployments/paper/<deployment>` — chart equity mới + tile "Execution quality"
   PARTIAL với số thật, reject rate `1 / 19`.
3. `/deployments/portfolios/portfolio_types_pool?tab=Capital%20Ledger` — board
   "Capital by currency" 3 chip env, hàng paper USDT.
4. `/deployments/alphas/<alpha>` — chart Equity by stage mới; tile Activity
   rollup EMPTY typed (DR-21, chờ codex sửa khóa).
5. `/execution` — board Source health 3 env ngay dưới masthead.
6. Không màn nào mất hiệu ứng động cũ: motion vẫn gate theo freshness/tick
   như trước; pulse chart chỉ thêm khi fresh.

### A4.5 Chưa làm / giới hạn thật

- Sparkline fleet uPlot và ECharts reskin (OR-3 dòng 2) chưa.
- Governance/ops tile (Inbox/R1/R2/Exit/Waivers/Queue/Incident) của G5 chưa
  wire thêm — route đã probe xanh (approvals) / 403 USER (queue).
- EDS-07 cho live/sandbox/deployment: UNAVAILABLE typed tới khi mirror có
  relation (DR-20); portfolio subject: nguồn từ chối (BR-EX-79 Ask).
- Ký từng màn A-04 (identity ngoài trang đầu, mixed-currency) chưa làm.
- e2e BFF double không có route EDS-05/07 (DR-19) → e2e thấy typed unavailable.

## A5. GOAL 06-09 — "so sánh từng tí" showcase ↔ dev-portal, chart/insight/replay không có dữ liệu, Command Center mất động

Owner hỏi ba câu: (1) G7+G4+G5 sửa màn nào, (2) vì sao Insight Charts và
Trade Replay vẫn không có dữ liệu dù equity chart đã mới, (3) Command Center
mất động, mất màu so với showcase. Trả lời bằng đo máy, không bằng cảm giác.

### A5.1 Câu 1 — G7+G4+G5 đã chạm màn nào (xem chi tiết §A4.1)

| Màn | Đổi gì |
|---|---|
| Account 360 | chart EDS-07 mới (uPlot) + pulse fresh |
| Paper Workbench | equity chart uPlot + tile Execution quality |
| Alpha 360 | Equity-by-stage chart uPlot; tile Activity (EMPTY typed, DR-21); Insight tile Stage equity uPlot |
| Portfolio 360 · Capital Ledger | board Capital 3 env × currency |
| Command Center | board Source health 3 env |
| Live Full · Canary · Fixtures demo | equity chart uPlot (cùng component) |

Không đổi: Paper/Sandbox/Live Overview, Fleet, Blotter, Governance, Ops.

### A5.2 Cách đo

Showcase = `execution-portal` (:8081, build **preview** `VITE_EXECUTION_PREVIEW_ENABLED`,
`previewControllers.tsx` bơm **smoke** `ccSmoke()/paperSmoke()/pfDemo()/TradeReplay`).
Dev = image `635e2a5` chụp trên probe :8090 (login localhost :8080 bị
ORIGIN_DENIED — cùng image, dữ liệu thật). Harness `shots5.js`: cùng viewport
1440×1100, đếm `document.getAnimations()`, phần tử có CSS animation, `data-tone`,
canvas, panel; 7 route mỗi bên.

### A5.3 Kết quả đo (trước khi sửa, 06-09)

| Màn | Showcase | Dev (thật) | Khác biệt gốc |
|---|---|---|---|
| Command Center | **24** phần tử động (beat, pulse CRITICAL, rankring, overdue/due text, drain, flash ×3, canary, funnel grow ×4, matrix nowdot ×5); panel **Promotion pipeline**; tone warn3/bad2/mute2/good1 | **3** động (rankring + overdue của 1 hàng OVERDUE thật); **không có** Promotion pipeline; không beat; tone chỉ warn×7 (chip source-health) | Toàn bộ động/màu showcase đến từ `ccSmoke()` (pipeline giả, pin/fleet giả, clock giả). Dev không có nguồn thay thế → mất |
| Alpha 360 Overview | 3 canvas, tone 11 | 2 canvas, tone 6 | tương đương; khác dữ liệu |
| Alpha 360 · Insight Charts | **12 canvas** (12 chart demo, 11 chữ SMOKE) | **1 canvas** (Stage equity) · 6 tile chỉ in số (fact rows) · 2 tile **insufficient_data dù server AVAILABLE** (Drawdown overlap, Correlation — FE không có case vẽ) · 3 UNAVAILABLE thật (Market candles N28, ρ timeline, Paper-vs-live drift) | FE chỉ vẽ chart cho stage-equity; các branch khác có dữ liệu (funnel 770 orders, quality, contribution, journal 200 event, drawdown 43 alpha × 50 ngày, correlation 66 pair) nhưng FE in chữ hoặc bỏ qua |
| Alpha 360 · Trade Replay | chart replay SVG demo + trade log | **0 canvas**: chỉ thông báo "candles unavailable" + bảng 200 event | Không có candles (N28) → FE bỏ luôn chart dù có equity series 1474 điểm + 12 fill |
| Paper Overview | 4 canvas · 2 động (gatechip pulse, tick) | 1 canvas · 0 động · 1 empty | smoke `paperSmoke()`; chưa xử lý đợt này |
| Portfolio 360 Overview | 4 canvas · 2 động (livedot, kpival) | 0 canvas · 0 panel | smoke `pfDemo()`; chưa xử lý đợt này |
| Live Overview | 4 canvas · 3 động | 0 canvas | smoke; chưa xử lý đợt này |

Payload thật: `GET /alphas/{id}/query-analytics` = **4.0 MB** (source_facts 6627
row) — DR-10 đo lại.

### A5.4 Sửa trong goal này (nhánh eds, sau `635e2a5`)

**Command Center — động và màu từ dữ liệu thật, không smoke**
- **Promotion pipeline thật** từ Fleet register (`GET /alphas`, BR-EX-72): funnel
  = số alpha có deployment trong stage (funnel grow), matrix alpha × stage
  (ô `current` = deployments hôm nay, chip stage màu, nowdot), cap 12 hàng
  có ghi "top 12 of N". Register không publish lịch sử promotion → không ô
  "done", không conversion — ghi thẳng trong footer panel (`fleetPipeline.ts`).
- **Beat** chạy khi SSE stream thật đang nối (`live.phase` ≠ idle/auth_expired/
  source_lost), không phải khi smoke.
- **Đồng hồ thật**: `age mm:ss` kể từ `read_at` nhích mỗi giây; thanh SLA
  (`Needs you now`) chạy theo (drain/overdue/due-text) — tắt trên fixtures/
  webdriver/reduced-motion như mọi motion khác.
- CRITICAL pulse, severity colour, OVERDUE: vốn đã theo dữ liệu thật, giữ.
- Chưa có nguồn thật → không làm: figure nhấp nháy ở Pinned (không có pin
  thật), sub-note màu ở Fleet cells (server không publish tone).

**Alpha 360 · Insight Charts — 8 tile vẽ chart từ số server**
| Tile | Chart | Nguồn |
|---|---|---|
| Exact query surface | bars đếm fact/relation | `source_fact` counts |
| Exposure profile | bars notional/position | `positions[]` |
| Stage equity | uPlot (đã có) | `chart_series[equity]` |
| Execution quality | bars submitted/filled/risk-rej/broker-rej | `execution_quality.v1` |
| Venue contribution | bars net/venue·currency (không cộng chéo currency) | performance |
| Order funnel | bars total + status | `order_funnel.v1` |
| Trade replay journal | bars event/ngày UTC — **đếm phía client**, provenance ghi rõ | `replay.trade_log` |
| Drawdown overlap | LinesChart drawdown alpha này + band các cửa sổ joint-drawdown | `drawdown_overlap.v1` (đọc mới) |
| Correlation matrix | bars ρ với từng alpha khác, ρ=0 threshold | `portfolio-correlation-returns.v1` pairs (đọc mới) |
| Market candles · ρ timeline · Paper-vs-live | typed UNAVAILABLE (thật) | N28 / N25 |

**Alpha 360 · Trade Replay** — *(sửa lại 06-09 sau khi owner chỉ ra tôi làm sai
kiểu chart)* đúng grammar hi-fi/BR-EX-50: cùng engine SVG của showcase
(`components/TradeReplayEvents.tsx` viết theo `TradeReplay.tsx`): chip
account/symbol (symbol chọn được thật), `last fill` ▲/▼, nút + − ◀ ▶ Fit,
drag/wheel; marker ▲ entry fill (good) · ▼ exit fill (good/bad theo dấu
`realized_pnl` server publish, warn nếu chưa publish) · ◇ leg armed · ×
rejected; leg TP/STOP = đường dashed tại `trigger_price` từ submit→terminal;
round trip entry→exit nét đứt, nhãn = `realized_pnl` của fill exit (không trừ
phía client); legend + footer như hi-fi; trade log 8 cột (time · event chip
FILL/ACK/SUBMIT/TRIGGER/REJECT/CANCEL · order·leg · type·side · qty ·
price/trigger · fee maker/taker · note) mới nhất trước. **Lớp candle chưa có**
(E5/N28, BR-EX-50 codex): thay bằng đường chấm nối giá các fill và dòng chữ
trong plot nói rõ — khi BR-EX-50 giao thì lắp candle vào đúng lớp đó. Dữ liệu:
orders/fills của resource EDS-04 ∪ facts analytics lọc theo account của alpha
(facts N25 KHÔNG scope theo alpha — 63 fill/770 order là toàn profile; chỉ 10/19
thuộc alpha này).
**Bản 3 (06-09, sau khi owner yêu cầu nến thật):** lớp nến = klines công khai
Binance USDM qua route mới `/market/candles` (OR-4): wick + body up/down như
hi-fi, marker/leg/round-trip vẽ lên nến, chip interval (1m…1d, tự nâng khi
range vượt 1500 bar), `mark` = close nến cuối, footer ghi nguồn + giờ fetch +
"VENUE_PUBLIC_MARKET_DATA, not the Trading System kline shard". Khi cờ tắt
hoặc venue lỗi → quay lại đường chấm fill-price với lý do typed.

### A5.5 Còn lệch showcase, chưa làm đợt này (đề xuất goal kế)

- Paper Overview (`paperSmoke`: gate chip pulse, tick, 3 chart demo) → cần
  wire funnel/runway từ profile thật + tick từ SSE.
- Portfolio 360 Overview (`pfDemo`: livedot, kpival tick, equity vs benchmark,
  cross-portfolio, config log) → equity portfolio bị nguồn từ chối
  (`portfolio_equity` MANAGER_V2_SOURCE_CONTRACT_REJECTED) — chặn ở BR-EX-79.
- Live Overview (livedot/kpival tick, 4 chart) → không có deployment live.
- Fleet sparkline uPlot + ECharts reskin (OR-3 dòng 2).

### A5.6 Bằng chứng sau sửa (probe :8090, cùng harness, cùng viewport)

| Màn | Trước | Sau | Showcase (tham chiếu) |
|---|---|---|---|
| Command Center — phần tử động | 3 | **32** (beat 1 · rankring 1 · overdue 2 · funnel grow 4 · matrix nowdot 24) | 24 |
| Command Center — panel | 5 (không pipeline) | **6** — có Promotion pipeline thật (43 alpha, 12 hàng hiện, footer ghi cap) | 5 (pipeline giả 4 hàng) |
| Alpha 360 · Insight Charts — canvas | 1 | **9** (3 UNAVAILABLE typed thật, 0 insufficient_data) | 12 (toàn demo) |
| Alpha 360 · Trade Replay — chart | bảng, không chart | **SVG replay đúng grammar hi-fi** (marker ▲▼◇×, leg TP/STOP, round trip, log 8 cột) — lớp candle chờ BR-EX-50 | SVG demo (smoke) |

Trade Replay (bản sửa lại): 6 fill trong cửa sổ mở đầu 11d, marker ▲▼◇×, 2 leg dashed, round trip `1.3208 · TP`, trục 1,800–1,950 (fill 3,500 ngoài dải vẽ ở mép, ghi off-scale), log 29 event ETHUSDT.

Trade Replay **bản 3 (nến thật)**: 257 nến 1h Binance USDM ETHUSDT hiện trong cửa sổ 11d (378 bar fetch), marker ▲▼◇× + 2 leg + round trip vẽ lên nến, `mark 1,845.38 ▼` = close nến cuối, footer ghi `fapi.binance.com/fapi/v1/klines · fetched 05:00:04Z · VENUE_PUBLIC_MARKET_DATA`. Gate: control-api tsc sạch + spec 10/10 · FE tsc sạch · vitest **103 file / 1871 pass**.

Gate: `tsc -b` sạch · vitest **102 file / 1866 pass** · N29 re-pin 2 digest. Ảnh
`s5_probe2_*.png`, `s5_probe3_*.png` (scratchpad phiên).

**Deploy dev 06-09 ~05:05 UTC**: `portal-control-api-1` + `portal-portal-web-1` recreate trên image `:dev` mới (control-api có route `/market/candles`, cờ `FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=true` trong `.env` dev; bundle FE `assets/index-P0O2ckNK.js`). Commit FE trên `feat/eds-current-bff`: `7f6f5cb` (motion + insight charts) · `91bf468` (Trade Replay grammar hi-fi) · `743907e` (cửa sổ mở đầu) · `daa30a8` (nến venue: route klines có cờ + lớp nến hi-fi; push xong `feat/eds-current-bff`).

## A3. Luật vận hành kế hoạch này

1. Mỗi phiếu chấm trong ≤1 ngày từ lúc codex giao; trượt → DR mới + codex sửa
   trong phase đó, không nợ sang phase sau.
2. Kết quả (PASS/FAIL + bằng chứng) ghi vào đúng phiếu ở file này — Bobby đọc
   MỘT file biết toàn cục; tracker §2/§4 lật ô tương ứng cùng commit.
3. Thứ tự chấm = thứ tự codex giao; không chấm chay khi chưa có vật giao —
   trừ L1 (đã xong) và A-07b (việc FE độc lập).
