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
| DR-13 | **OR-1 gap của EDS-09**: core chờ external acceptance, không có observation adapter → giá trị màn hình = 0 tới khi trading giao MC-01. Yêu cầu phase nhỏ **EDS-09b**: adapter map mirror/drain observations vào CHÍNH core này (stream class riêng, nhãn `PORTAL_OBSERVATION`, admission facts do Portal tự phát hành) — mở reducer/journal/EDS-11 fan-out NGAY. Core generic sẵn nên đây là việc nhỏ | **CAO** | EDS-09b | **ĐÓNG phía FE 07-09** (A6.5, `9eca5f8`): adapter = BFF observed-timeline của codex (EDS-09b/10b) mount trên Alpha/Account 360, nhịp theo `projection.sequence`/`read_at` thật; A-09 chờ Bobby ký trên dev | Playwright probe: rev 32→33, beat 0→1; CC `as_of` tiến + `data-revision` 1 |
| DR-15 | **A-01: pin catalogue digest sai trường** — intake lấy `catalogue_digest` (9040f, hash response-body) thay vì `catalogue_sha256` envelope (0c71b, có sẵn trong e6-runtime-evidence của chính pack) → mọi live read 502 `EDS01_SOURCE_CONTRACT_REJECTED`; gate xanh nhờ fixture nên không ai thấy. **Đã sửa tại source bởi Claude (quyền backend), chờ gate re-run + codex xác nhận trường chuẩn trong contract test** | CAO | EDS-01 | FIXED-IN-REVIEW | |
| DR-16 | **Sập cả cycle vì 1 relation mới bị từ chối**: `manager.risk:risk_grants` (sandbox) trả `N23_PROFILE_READ_NOT_ACCEPTED` ×7 → mã này không nằm trong danh sách cô lập của worker → cycle sandbox fail liên tục → snapshot vượt stale ceiling → **cả màn Sandbox 'unavailable'** (regression so với dev đang ready/COMPLETE). Fix: thêm N22/N23_PROFILE_READ_NOT_ACCEPTED vào isolate per-relation (UNAVAILABLE typed, carry phần còn lại) | **CAO — CHẶN G3** | worker (Claude nhận vá) + codex rà acceptance list | **FIXED 05-09** — isolate N22/N23 per-relation + regression test, gate 383/383, sandbox hồi sinh trên probe; codex còn rà DR-17 | |
| DR-17 | Binding mới `risk_grants`/`sizing_decisions` được thêm vào catalog worker nhưng chưa được proxy/edge chấp nhận cho screen tương ứng (sandbox N23; paper sizing N17B) — cần khớp acceptance list ↔ catalog trước khi thêm binding | TB | EDS-03/06 | OPEN | |
| DR-14 | Test trực tiếp EDS-09 đếm được 7 (5 core + 2 store) so với 10 vùng khai trong report — cần bảng map test↔claim (hoặc chỉ rõ spec TS 306 dòng gánh vùng nào) để nghiệm thu chặt | THẤP | EDS-09 docs | OPEN | |
| DR-12 | *(một phần đã khắc phục 05-09: mỗi phase có file EDS_xx riêng mang Status ladder trong worktree eds — §17 unified plan vẫn chưa sync, giữ OPEN mức THẤP)* **Status ladder không được ghi**: chỉ EDS-00 có dòng Status; 01→12 không có `PLANNED/CONTRACT_LOCKED/...` trong §17 → không ai track được tiến độ bằng văn bản, vi phạm luật "mỗi phase commit implementation+tests+journal cùng lúc" của chính plan | TB | §17 bookkeeping | OPEN | |
| DR-18 | **Workspace mặc định = workspace cá nhân của session** (`SessionGuard.ensurePersonal`) mà EDS-04/05/07 chỉ chấp nhận đúng `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID`: user KHÔNG phải chủ workspace đó (mọi người trừ Bobby) nhận 404 typed `EDS0x_PROJECTION_WORKSPACE_NOT_FOUND` trừ khi query mang `workspace_id` — mà không envelope nào (`/screens/*`, `/resources/*`, `/contract-authority`) publish id này cho browser. Đo 05-09 trên probe (claude-probe, member nhưng không chủ): Alpha 360 resource, 4 tile derivation, chart Account 360 đều 404 typed; đổi owner trên probe DB → tất cả READY. Spec codex `portal-derivations.spec:pins…` cố ý fail-closed, nên đây là quyết định thiết kế cần chốt, không phải bug tôi tự sửa. **Backend request**: (a) publish `projection_workspace_id` trong `/contract-authority` để FE gửi kèm, hoặc (b) khi query không có `workspace_id` và user là member của projection workspace thì mặc định vào đó | CAO (mọi user ≠ Bobby) | 04/05/07 | OPEN — chờ codex chọn (a)/(b) | |
| DR-19 | **N29 acceptance pack pin sha256 của file FE** (`recomposeContainers.tsx`, `profileContainers.tsx`, `e2e/bffDouble.ts`, …): mọi wire FE hợp lệ đều làm pre-commit đỏ `evidence digest drifted`. Đợt 2 tôi re-pin 2 digest theo đúng cách codex đã làm ở `a511508`; `bffDouble.ts` giữ nguyên nên e2e double trả 501 gap cho route EDS-05/07 (tile render unavailable — trung thực nhưng không phải trạng thái thật). Đề nghị: tách file FE khỏi pin N29 hoặc ghi thủ tục re-pin vào README pack | TB | N29 pack | OPEN | |
| DR-20 | **Mirror EDS-06 trên dev rỗng (0 row) và chỉ có relation paper** sau backfill từ `execution_timeseries_history` (710k row → `account_equity_snapshots` 581k · `performance_snapshots` 129k · `fills` 71): EDS-07 chart cho live/sandbox/deployment trả `EDS07_RELATION_NOT_MIRRORED` tới khi worker mirror các profile đó (flag bật 05-09 tối trên dev). Đây chính là câu hỏi DR-01 (absorb/replace): tôi đã absorb history→mirror bằng script (digest canonical y hệt `durable-mirror.repository.ts`), codex xác nhận cách này hay worker tự backfill | CAO | 06/07 | OPEN | |
| DR-21 | **`alphas/{id}/activity` EMPTY `EDS05_ALPHA_NOT_FOUND` cho mọi id đã thử** (`signalcombine00230m`, `gridcombine001`, `adaptive_hma_cpp_00115m` — id thứ ba là `strategy_id` thật trong deployments, strategies relation có 48 row AVAILABLE) → khóa join của alpha_id sai hoặc alpha_id là trường khác (`alpha_id` registry?). Tile Alpha 360 vì thế luôn EMPTY dù alpha đang chạy paper | TB | 05 | OPEN — codex chỉ khóa đúng | |
| DR-22 | **N25 `query-analytics.source_facts` không scope theo alpha**: `fills` 63 / `orders` 770 là toàn profile (fill mẫu thuộc `fib_sl_tp_strength_0015m` khi hỏi `adaptive_hma_cpp_00115m`; alpha này chỉ 10/19). Tile "Exact query surface" và funnel vì thế in số toàn profile dưới tên alpha. FE tạm lọc theo account của alpha (Trade Replay); các tile khác vẫn dùng số server. Đề nghị server scope facts theo subject hoặc ghi rõ `scope: PROFILE` trong envelope | CAO (số sai chủ) | N25 | **ĐÓNG phía FE 07-09** (A6.6): replay + funnel Alpha 360 đọc page set EDS-11R1 lọc theo `strategy_id`/`account_id`, nhãn nguồn rõ; scope phía server vẫn thuộc BR-EX-81 | probe: `ORDERS (PAGE SET · THIS SUBJECT)`, hết nhãn profile-wide |
| DR-23 | **Nến cho Trade Replay** (OR-4): Portal đọc klines công khai Binance USDM dưới cờ, authority `VENUE_PUBLIC_MARKET_DATA`. Codex xác nhận/từ chối phân loại; nếu từ chối thì Trade Replay quay lại đường chấm fill-price tới khi BR-EX-50 | TB | new route | OPEN — chờ codex + Bobby (egress) | |
| DR-26 | **`orders`/`fills` chỉ là bounded current page toàn profile** (812 order của 11 strategy, 71 fill của 5 strategy trên 42 strategy deploy): alpha có lịch sử equity (`delta_rsi_00115m`: 2024 snapshot) nhưng 0 order/fill đọc được → Trade Replay / Orders & Fills / funnel không thể đúng theo alpha; ô Overview in số toàn profile (DR-22). FE đã nói rõ bằng số trong empty state (`ce08548`). Cần BR-EX-81: đọc order/fill theo `strategy_id`/`account_id` có cursor, hoặc mirror bền `orders`/`fills` như equity (EDS-06) | CAO | 04/N25 | OPEN — @codex | |
| DR-28 | **Projection paper trên dev bị từ chối mỗi chu kỳ từ 06:12 UTC 07-09** (`N31_PROFILE_PROJECTION_DOCUMENT_INVALID` → `CYCLE_FAILED`): validator provenance EDS-11R3 (`5287c3b`, codex) đòi mọi row của document có catalogue phải mang catalogue sha, nhưng ladder gộp nguyên row cũ (cửa sổ 2.000 dòng equity/session/performance của paper viết trước khi có catalogue, không sha) → document bị từ chối, và document bị từ chối không bao giờ được thay → `query-analytics`/`observed-timeline` 503 `PHASE2_PROJECTION_STALE_CEILING_EXCEEDED`, `resources/alphas` 404 → **Insight Charts + Trade Replay rỗng trên dev** (Bobby báo 07-09). Sandbox/live cửa sổ nhỏ nên vẫn refresh; probe (dump 05-09) không dính. Sửa (Claude, backend scope): row giữ lại chỉ vào document mới khi provenance khớp (bỏ + ladder đọc lại, không dán nhãn giả), carry-forward cùng luật, validator ghi `detail` lý do vào log | **CAO** (dev mù 4 giờ) | EDS-11R3 / N31 | **ĐÃ SỬA 07-09** `a4f1ecb` (A7.5) — @codex xác nhận luật provenance (row cũ không sha bị bỏ + ladder đọc lại, không dán nhãn) | log dev: 318 `refresh_failed` 06:12→10:27; snapshot paper kẹt seq 10100 / as_of 05:27:55, rows_no_sha = 2000/2000 |
| DR-29 | **Drain page set (G9) chỉ chạy khi resource `ok`** → khi resource 404/denied, Trade Replay treo nhãn "relation page set loading" với 0 lượt đọc (đo trên dev bằng user không phải Bobby: 120 s, reads=0). Sửa FE: drain chạy ngay khi resource đã trả lời (ok hay không), env fallback; test hook | TRUNG | G9 (FE) | **ĐÃ SỬA 07-09** `8a43b5f` + `44c5715` (A7.6) | harness `dev-replay-wait.js` |
| DR-30 | **EDS-04 resource read gắn projection với đúng một workspace = workspace cá nhân của Bobby** (`SessionGuard.ensurePersonal` → `resource-read.controller` so với `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID`): mọi user khác (thanhvuong, claude-probe) nhận 404 `EDS04_PROJECTION_WORKSPACE_NOT_FOUND` cho Alpha/Account/Portfolio 360 và `derivations/*/activity`, dù `?workspace_id=` + membership thì 200. Với Bobby dev đúng; với người khác màn 360 rỗng dù dữ liệu có. Đề nghị: resource read chọn workspace projection khi user là member (không chỉ personal), hoặc gắn projection với workspace chung | CAO (đa người dùng) | EDS-04 | OPEN — @codex/Bobby quyết; 07-09 Claude đã thêm `claude-probe` làm MEMBER `ws_06G19…` trên dev để kiểm (dữ liệu test, xoá được) | curl dev: `resources/alphas/fib` 404 (session) · 200 (`?workspace_id=ws_06G19…`) |
| DR-27 | **`resources/alphas/:id` trả `selected_environment="live"` khi không có `requested_environment`** — là mặc định của resolver, không phải nơi alpha chạy (mọi row của `fib_sl_tp_strength_0015m` là paper/sandbox). Hệ quả: Activity rollup EDS-05 (`activityEnv`) và observed timeline đọc `live` → rỗng dù paper có dữ liệu. FE (G8) cho observed timeline lấy env từ `panels.deployments.rows[].mode` (chip paper/sandbox); Activity vẫn theo resolver. Đề nghị: resolver chọn env theo deployment thật khi không được hỏi, hoặc Bobby cho FE đổi Activity sang cùng luật | TRUNG (số rỗng sai chủ) | EDS-04 resource | OPEN — đề xuất 07-09 (A6.5), Bobby/codex quyết | curl probe: `selected_environment: live`, `projection[]` paper/sandbox/live, deployments rows mode paper/sandbox |

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

## OR-5 (R1–R4 ĐÃ GIAO và MERGE vào `feat/eds-current-bff` @ `f04dad8` 06-09 — FE đóng; nguồn còn BR-EX-50/80/81; xem OR-5.8…5.13) — Trade Replay "signature": chuẩn TradingView

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

### OR-5.12 Owner phát hiện 06-09: alpha "có dữ liệu" mà Trade Replay trống (`delta_rsi_00115m`) · commit `ce08548`

**Đo:** projection dev không có **bất kỳ** order/fill nào của `delta_rsi_00115m` (resource EDS-04: orders 0 / fills 0; snapshot: 0 dòng theo `strategy_id` lẫn `account_id`; mirror: 0 fill) dù có 2 deployment (paper, sandbox) và **2024 account_equity_snapshots** trong mirror. Trang "bounded current page" toàn profile chỉ chứa **812 order của 11 strategy** và **71 fill của 5 strategy** (fib 45 · adaptive 10 · burst 8 · combine_0014h 7 · combine_0011h 1) trên **42 strategy deploy**. Các ô Overview "orders (window) 730 · filled 58 · risk_rejected 646" là số toàn profile (DR-22) → người đọc tưởng alpha có dữ liệu.

**Không phải hardcode:** cùng một đường code cho mọi alpha (`replayEvents` scope theo deployment/account/strategy_id); alpha nào có dòng trong trang là hiện (đã nhìn 5 alpha: adaptive, fib, burst, và 2 combine qua log). Khoảng trống là **nguồn**: facade manager chỉ phát trang hiện tại của `orders`/`fills`, không có đọc theo alpha ra ngoài trang.

**Sửa (FE, `ce08548`):** empty state của replay in đúng số: "No order or fill of `<alpha>` is present in the retained projection page. The page holds N orders and M fills across K strategies — none of them belongs here" + chú thích DR-22/BR-EX-81; nhãn ô funnel Overview thêm "· profile-wide". Không bịa thêm gì.

**DR-26 (mới, CAO):** `orders`/`fills` chỉ là bounded current page toàn profile; alpha có lịch sử equity nhưng không có order/fill nào đọc được → Trade Replay, Orders & Fills, funnel không thể đúng theo alpha. **BR-EX-81 (@codex):** đọc order/fill theo `strategy_id`/`account_id` có phân trang (cursor) ra ngoài trang hiện tại, hoặc mirror bền `orders`/`fills` như đã làm với equity (EDS-06) — đề xuất schema: `GET /resources/alphas/{id}/orders?cursor&limit`, `…/fills?cursor&limit`, cùng envelope EDS-04.

**Owner 06-09 (tối):** *"thêm BR-EX-81 vào EDS-12 luôn, đảm bảo nó call hết data từ trading system qua portal execution edge."* Đã ghi vào `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` (bảng request: BR-EX-80 timeframe + BR-EX-81 full `orders`/`fills` history qua edge → durable mirror → đọc theo alpha/account có cursor; mục EDS-12: đầu việc + điều kiện Exit "mọi strategy đọc đủ order/fill qua edge, Trade Replay không rỗng khi nguồn có fill"). Sửa trong worktree codex `/home/bobby/portal-eds10-eds11` (nhánh `feat/eds11r-r4-r5-activation`), **đang staged, chưa commit được**: hook pre-commit của nhánh đó rớt ở gate "Imported Manager route template does not match the active template" (6 lần, không liên quan docs) — codex commit cùng lần sau hoặc sửa gate. Bản patch giữ ngay dưới đây (một markdown duy nhất, không file mới) để không mất:

```diff
diff --git a/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md b/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md
index 39e1946..d6ac74c 100644
--- a/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md
+++ b/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md
@@ -3035,7 +3035,9 @@ Append rows here. Do not create another active request file.
 | BR-EX-77 | 2026-09-02 | Fleet/lists freshness + realtime coverage | Fleet chip pinned STALE (5 s constant vs 15–60 s cadence); Fleet/360/Blotter/CC have no stream binding; delta handling is refetch-per-event | Envelope-declared freshness budgets per ingestion class with AGING tier; extend profile-realtime to remaining read screens; bounded delta coalescing | `PORTAL_PROJECTION` envelopes | read-only · low | existing SSE bounds; coalesce ≥1 s | Phase 1 five-kind contract | budget absent → UNKNOWN never fake-FRESH | unit + SSE + journey with motion assertions | Claude (backend co-impl) | Phase 4 / P4-C | `RECEIVED` | all rich read screens | dev read only | Phase 4 §P4-C; findings F3/F4 |
 | BR-EX-78 | 2026-09-02 | Profile taxonomy + lineage observability + window ladder | N30 lineage guard structurally rejects non-BINANCE paper parents (DNSE/VN) with no diagnostics; flat 400-row windows block 30 d rollups/history | Owner profile-set decision (recommend `PAPER_DNSE_VNM`); reject counters by missing-parent class in envelope; per-class ingestion windows + warm SGP history; DERIVED portfolio-equity while MC gap stays typed | `TRADING_SYSTEM` via `PORTAL_PROJECTION`; derived `DERIVED` | read-only · medium (taxonomy touches isolation proofs) | window ladder per N29-RTA budget table | Phase 1 lineage guard; owner decision | strict rejection retained; counters bounded | taxonomy negatives + migration/restore + parity | Codex + Claude | Phase 4 / P4-D | `APPROVED_IMPLEMENTATION_IN_PROGRESS` (2026-09-03, Bobby approved `PAPER_DNSE_VNM`) | VNM workbench, Fleet rollups, history charts | dev read only | Phase 4 §P4-D; findings F5/F6/F7/F9 |
 | BR-EX-79 | 2026-09-03 | Source publication set for full-data screens | Live sweep: equity/performance relations empty (`SOURCE_PARTIAL`, 0 rows), `portfolio_equity` contract-rejected since Phase 1, live balances published without live accounts, cross-family rows in the BINANCE paper feed, `venue_accounts`/margin/sync zero, candles/benchmark/twin-join not activated, no ≥30 d retention | Detailed publication request to the Execution Cell agent: `upgrade/backend/EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md` (13 items P0–P2 + 1 question; restates MC-01…09; DNSE deferred by owner) | `TRADING_SYSTEM` / Execution Cell | read-only · none Portal-side | per-item bounds in the request | none (Portal seams delivered Phase 4) | typed states stay until verified | live projection inventory before/after | Execution Cell agent | Phase 4 follow-on | `EXTERNAL_CONTRACT_PENDING` | every data-bearing screen | n/a | request doc §0 table |
-| _next: BR-EX-80_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |
+| BR-EX-80 | 2026-09-06 | Alpha 360 · Trade Replay (candle interval) · Account 360 | The source publishes no strategy timeframe (strategies relation carries `active, trader_id, created_at, strategy_id` only), so the replay infers the bar interval from the strategy id suffix and labels it DERIVED | Facts: `strategies[].timeframe` (or `bar_interval`) in the strategies relation and the fleet register, vocabulary `1m\|5m\|15m\|30m\|1h\|4h\|1d` | TRADING_SYSTEM | read-only · low | 42 strategies; static per version | `strategies` relation (EDS-04) · BR-EX-72 fleet register | absent → frontend keeps the suffix rule with its DERIVED label | frontend `replayCandleChart.test` (published timeframe wins over the suffix) | Codex | EDS-04 / EDS-12 | `RECEIVED` | `TradeReplayLive` — `publishedTimeframe()` already reads it | none | OR-5.6 (tracker) · DR-21 |
+| BR-EX-81 | 2026-09-06 | Alpha 360 · Trade Replay + Orders & Fills · Account 360 · Full Blotter | `orders` / `fills` reach the Portal as one bounded current page per profile (2026-09-06: 812 orders of 11 strategies, 71 fills of 5, over 42 deployed): an alpha with 2,026 equity snapshots (`delta_rsi_0011d`) has zero readable orders or fills, so Trade Replay, Orders & Fills and the funnels cannot be true per alpha, while the Overview funnel counts are profile-wide (DR-22) | **Owner order 2026-09-06: pull the complete `orders` and `fills` history of every profile from the Trading System through the portal execution edge** into the durable mirror (as EDS-06 did for equity: resumable cursor drain, digest dedupe, append-only, gap ledger), then serve per-subject reads: `GET /api/v1/execution/resources/alphas/{id}/orders\|fills?cursor&limit` and `…/accounts/{id}/orders\|fills…` (keyset `(updated_at, order_id)` / `(trade_time, fill_id)`, ≤500 a page, exact `total`), same EDS-04 envelope with `completeness` and `coverage{from,to,rows}`; N25 `source_facts` scoped to the subject (closes DR-22) | TRADING_SYSTEM rows · PORTAL_OBSERVATION mirror (append-only) · nothing DERIVED | read-only · medium: a page presented as history is exactly the misread this removes | 10³–10⁵ rows per alpha; pages ≤500; freshness = mirror `as_of`; a truncated drain must be named in `completeness` | EDS-06 mirror worker · §6.5 orders/fills routes (N11) · manager facade paging semantics (source owner to confirm cursor/page contract) | until delivered the replay prints "no order or fill of <alpha> in the retained page · the page holds N orders / M fills / K strategies" (`ce08548`); no client-side widening | mirror row counts equal source counts per relation and profile; every strategy with fills in the source renders ≥1 marker; `delta_rsi_0011d` replay is non-empty iff the source holds its fills; frontend deletes the account-scoped client filter of the profile page on delivery | Codex · source owner (facade paging) | **EDS-12** (owner order 2026-09-06) | `RECEIVED` | `TradeReplayLive` / `replayEvents` — consumer ready; stopgap filter to be removed | none until approved | DR-22 · DR-24 · DR-25 · DR-26 · OR-5.12 (tracker) · BR-EX-50 |
+| _next: BR-EX-82_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |
 
 ### 7.3 Request quality gate
 
@@ -6114,6 +6116,13 @@ waiting for unrelated external gaps.
   frontend bundle and source compatibility digests;
 - stage per operation/screen/profile: Paper, Sandbox, Canary-over-Live, Live;
 - remove expired adapters only after zero-use observation;
+- **BR-EX-81 (owner order 2026-09-06):** drain the complete `orders` / `fills`
+  history of every profile from the Trading System through the portal execution
+  edge into the durable mirror and serve per-alpha / per-account cursor reads;
+  no order-bearing screen (Trade Replay, Orders & Fills, Blotter, funnels) may
+  be qualified on the bounded current page, which on 2026-09-06 held 812 orders
+  of 11 strategies and 71 fills of 5 over 42 deployed (DR-26); BR-EX-80
+  (strategy timeframe) rides the same relation refresh;
 - record any remaining external capability as a versioned next-campaign input,
   not hidden technical debt.
 
@@ -6124,8 +6133,10 @@ exact deployed-image verification.
 
 **Exit:** all accepted-source scope is `PRODUCT_ACTIVE` and
 `OPERATIONS_QUALIFIED`; zero P0/P1 integrity issues; rollback evidence exists;
-owner signs visual/data/action parity. Protected-main merge and stable release
-remain explicit Bobby actions.
+every deployed strategy's orders and fills are readable in full through the
+edge and its Trade Replay is non-empty whenever the source holds its fills
+(BR-EX-81); owner signs visual/data/action parity. Protected-main merge and
+stable release remain explicit Bobby actions.
 
 ### 17.6 Frontend collaboration lanes
```

### OR-5.13 Owner 06-09 (tối): nghiệm thu EDS-12 + BR-EX-80/81 của codex · viết sẵn logic nhóm lệnh/ledger (R4) · merge nhánh replay

**Nghiệm thu codex (chạy gate của họ tại `/home/bobby/portal-eds12-failure-dr-release`, HEAD `8a7bd6f`, `scripts/execution-eds12-qualification-test.sh`):**
- N29: `RELEASE_CANDIDATE_READY`, `product_release: NO_GO`, blocker `N29-REL-01`.
- EDS-12: `EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING`, `runtime_effect: NONE`, `operations_qualified: false`, `product_active: false`, 10 failure scenarios, 9 mutation test fail-closed pass. Giao phẩm: crate `eds12-qualification`, contracts `eds12-release-qualification-v1` (qualification/failure-matrix/deployed-evidence schema), `EX_BE_37_*.md`, `PHASE_12_QUALIFICATION.md`, runbook vận hành/rollback. **Là khung nghiệm thu tĩnh, chưa có bằng chứng deploy, không đổi runtime.**
- **BR-EX-80/81: KHÔNG giao.** Codex xếp `source_extensions`: BR-EX-80 `SOURCE_OWNER_RETURN_REQUIRED` (cần nguồn phát `timeframe`), BR-EX-81 `SOURCE_PAGING_AND_DRAIN_PROOF_REQUIRED` ("BR-EX-81 is closed only when the Portal drains complete retained order/fill history through the private Manager relation pager into its append-only mirror, with cursor/restart/dedupe/count parity proof"). Hệ quả: alpha ngoài trang hiện tại (`delta_rsi_*`, 37/42 strategy) vẫn trống replay trên dev — đúng như empty state đang nói. Cần Bobby giao lại codex phần drain + đọc theo subject.
- Kiểm tra nhánh: `feat/eds12-failure-dr-release` mở từ `feat/execution-data-activation` (chứa cả docs tracker của tôi); `feat/eds11r-r4-r5-activation` chứa bản re-apply của các commit replay bản 2/3 của tôi (`7ec17dd`, `97ab33f`) với hash khác — khi codex merge `feat/eds-current-bff` sẽ conflict trên `TradeReplayEvents.tsx`/`recomposeContainers.tsx`; ghi để codex biết trước.

**R4 — viết sẵn cho các bảng nhóm lệnh/ledger (commit `f04dad8`), theo schema guide §7/§16/§11 + vocabularies của contract pack:**
| Bảng nguồn | Reader | Vẽ khi có | Hôm nay |
|---|---|---|---|
| `order_brackets` + `order_bracket_legs` (ENTRY/STOP/TP/TRAILING, `leg_index`, `entry_client_order_id`, `activation_policy`, `oco_policy`) | `readBracketGroups` | box lập từ group của nguồn (thay ghép theo thời gian), leg type published thắng heuristic, leg chưa thành order = mức "planned" | chưa phát → box vẫn DERIVED, legend ghi "order_brackets not published" |
| `conditional_order_groups` + `_legs` (BRACKET/OCO/OTO/OUO; `execution_trigger`, `late_fill_policy`, `remainder_policy`; leg state WAITING…REJECTED) | `readConditionalGroups` | brace ⌐ tại thời điểm tạo, ngang qua các mức leg, nhãn contingency + state, leg WAITING nét chấm, state cần chú ý màu bad | chưa phát |
| `arb_order_packages` (ATOMIC_ALL_OR_NONE, `planned_orders`, gross/net notional, imbalance) | `readOrderPackages` | dải ▒ qua pane từ created→completed, nhãn "ATOMIC ×N · state", leg symbol khác liệt kê trong card | chưa phát |
| `portfolio_capital_ledger` (ALLOCATE/WITHDRAW/REBALANCE/ADJUST/INITIAL_ALLOCATE) + `settlements` (CASH/SECURITY × PAYABLE/RECEIVABLE) | `readLedgerMovements` | ◆ ở mép dưới trục thời gian, nhãn loại + số, card before→after | chưa phát |
Scope theo account/strategy (`scopeGroups`), "not published" ≠ "published, empty" (`published{}` flags), test `tradeReplayGroups.test.ts` 8 case với fixture đúng cột schema. Gate: tsc sạch, vitest **1904 pass / 1 skipped (105 file)**; probe: adaptive/fib không đổi hình, legend ghi 4 dòng "not published".

**Không viết sẵn (nói rõ):** `order_group_event_inbox`/`execution_command_outbox` (hàng đợi nội bộ, không phải sự kiện vẽ), `sizing_decisions` (audit sizing — hợp với card của entry hơn là chart; để R5 nếu Bobby muốn), `order_pending_exposure` (rủi ro, không phải lệnh).

**Merge (06-09 tối):** `feat/trade-replay-signature` → `feat/eds-current-bff` fast-forward `daa30a8..f04dad8` (8 commit: e465100 · ce9d230 · 5704ac4 · e06963a · 5b59384 · ce08548 · f04dad8 + pack), push `origin/feat/eds-current-bff`; dev deploy từ `feat/eds-current-bff` @ `f04dad8` (control-api + portal-web `:dev`). OR-5 **đóng phần FE**; còn treo phía nguồn: BR-EX-50 (kline shard), BR-EX-80 (timeframe), BR-EX-81 (drain orders/fills), DR-22/24/25/26. Việc kế: quay lại các G/R còn dở theo `/goal` của Bobby.
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
| A-04 | EDS-04 bốn màn resource | từng màn một | 🟡 **CHẤM MỘT PHẦN 05-09 (tối)** — 4/4 route 200 trên probe, 17–18 panel typed (READY/PARTIAL/EMPTY), binding lạ → EMPTY typed; FE đã wire sẵn (recomposeContainers) và render thật trên probe. Còn: ký từng màn + identity ngoài trang đầu (Bobby xem dev) · **DR-18** (workspace) · 07-09 G9 (A6.6): Alpha 360 replay + funnel theo subject từ page set EDS-11R1 |
| A-05 | EDS-05 derivations+governance | từng op một | 🟡 **CHẤM MỘT PHẦN 05-09 (tối)** — 5/5 derivation route 200 typed; execution-quality có số thật (19 orders · 10 fills · reject 1/19); capital PARTIAL (ledger chưa publish); source-health PARTIAL/AGING; activity EMPTY mọi id thử (**DR-21**); governance approvals 200 (filter[...]); ops queue 403 cho USER (typed denied). FE wire 4 tile (§A4). Golden vector chưa tính lại · 07-09 G9 (A6.6): Account 360 replay theo `account_id` từ page set EDS-11R1; DR-27 (env resolver) treo |
| A-06 | EDS-06 mirror/index cutover | dual-read bật | 🔶 SẴN SÀNG CHẤM — `3a9c996` (DR-01 phải trả lời trong lúc chấm) |
| A-07 | EDS-07 chart DTO | DTO đầu tiên | 🟢 **A-07 CHẤM ĐẠT-CORE 05-09 (tối)** — paper account equity/drawdown READY 1946/51370 điểm `MIN_MAX_LAST_BUCKET_V1` (extrema+first/last giữ, gaps không publish); portfolio → UNAVAILABLE `MANAGER_V2_SOURCE_CONTRACT_REJECTED` (nguồn); live/sandbox → `EDS07_RELATION_NOT_MIRRORED` tới khi mirror có relation (**DR-20**); viewport ngoài 256–2048 bị 400 (FE clamp); risk-decisions typed EMPTY/UNAVAILABLE. **A-07b ✅ ĐÃ SHIP** `172ebdd` PrimusFinancialChart |
| A-08 | EDS-08 asks packet | packet hợp nhất | ✅ **CHẤM ĐẠT 05-09** — addendum ghi parent MC-01, một kênh duy nhất → **DR-07 ĐÓNG** |
| A-09 | EDS-09 observation-lane | reducer đầu ra đầu tiên | ✅ **ĐÃ CHẤM 05-09: ACCEPT-CORE** · 07-09: DR-13 đóng phía FE (G8, A6.5) — chờ Bobby xem dev rồi ký hết |
| A-10 | EDS-10 replay/candles | contract chấp nhận | 🟡 **06-09**: FE Trade Replay xong (OR-5, `f04dad8`) trên nến venue (OR-4); codex EDS-10b/11R4 market-context BFF ở nhánh riêng → hợp nhất nguồn nến ở A6.3 I3 |
| A-11 | EDS-11 SSE + action graph | kênh SSE v2 | ⬜ chờ I0 hợp nhánh (codex có 11R1/11R3/R4-R5 trên `feat/eds11r-r4-r5-activation`) |
| A-12 | EDS-12 release | gói release | 🟡 **06-09 nghiệm thu**: static qualification ready (gate codex pass), deployed evidence pending, BR-EX-80/81 đóng băng thành gate nguồn — xem A6.2; FE cấp ma trận browser ở A6.3 I6 |

**ĐANG Ở ĐÂY (07-09 tối, sau Goal 1) →** Goal 1 xong (§A10): 8 màn chi tiết mở được cho mọi member, `Soon` thay cho "blocked"; **Goal 2 xong** (§A11), **Goal 3 xong** (§A12); kế tiếp **Goal 4** (§A9.4). Trước đó: owner chỉnh cách hiểu: TS đã trả hết, chỗ thiếu ghi **Soon** chứ không blocked; mọi lệch showcase là **P0**. Đo lại 34 màn/tab → **15 nợ P0** (§A9.3) xếp thành **7 goal theo phase** (§A9.4). Head `2a79b0c` trên 3 ref, dev chạy code `44c5715` = I0 + G8 + G9/G9b + hotfix DR-28/DR-29 (§A7.5–A7.6) sau khi Bobby báo Insight Charts/Trade Replay rỗng; **A-12 ACCEPT-STATIC**, phase bổ sung §A7.3; chờ Bobby kiểm tra lại dev, ký A-04/A-05/A-09, quyết DR-27/DR-30, đẩy source owner (BR-EX-80/81), rồi goal G10 → G12-prep → G6 → G11. Trước đó: đợt goal 2 (G7+G4+G5) — §A4. Lịch sử: L1 ✅ · A-08 ✅ · A-09 ✅(có điều kiện DR-13) · hàng đợi
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
| G8 | EDS-09b observation adapter (DR-13) + wire journal → EDS-11 SSE khi codex giao | Motion tick/flash nổ lại bằng revision thật | theo codex | ⬜ chờ I0 (A6.3) |

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

## A6. SAU EDS-12 — CÒN GÌ, DỞ GÌ, GHÉP NỐI BE↔FE THẾ NÀO (owner hỏi 06-09 tối; đánh giá kết thúc bằng markdown theo §7.7)

### A6.1 Trạng thái thật của hai bên (đo 06-09 tối)

**Backend (codex) — nằm ở nhánh của codex, CHƯA có trên dev và chưa vào `feat/eds-current-bff`:**

| Phase | Codex nói | Bằng chứng tôi kiểm | Nhánh |
|---|---|---|---|
| EDS-09b observation lane | closed (observed timeline BFF `bd05671`, safe local revalidation `e709b0d`, source-dark authoritative ledger receiver `50239f6`) | commit có; gate riêng chưa chạy được ngoài worktree codex | `feat/eds11r-r4-r5-activation` |
| EDS-10b market context | "close R4 market context contract boundary" `e57404d`, source-dark market context BFF gate `fe595d2`, `EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED` | trùng phạm vi OR-4 (route venue của tôi) → phải hợp nhất một nguồn nến (§A6.3 I3) | cùng nhánh |
| EDS-11R1 named relation BFF + hydrate rich panels | `6d3dde4`, `0e6a83a`, `22f6b71`, `d32cd8f` | codex re-apply commit replay bản 2/3 của tôi (`7ec17dd`, `97ab33f`) → conflict chắc chắn với `f04dad8` ở `TradeReplayEvents.tsx`/`recomposeContainers.tsx` | cùng nhánh |
| EDS-11R3 local provenance | closed `5287c3b` | commit có | cùng nhánh |
| R4/R5 manager lanes (bounded) | `b76d281`, `d63a650`, `5abd275`; pinned `98c47b3` | commit có; lease TTL 900 | cùng nhánh |
| EDS-12 failure/DR/release | `EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING`, `runtime_effect NONE` | **chạy gate của codex: pass** (N29 `RELEASE_CANDIDATE_READY` nhưng `product_release NO_GO`, blocker N29-REL-01; EDS-12 static ready, deployed evidence pending) | `feat/eds12-failure-dr-release` (mở từ `feat/execution-data-activation`, 18 ahead / 31 behind `feat/eds-current-bff`) |
| BR-EX-80 / 81 | `SOURCE_OWNER_RETURN_REQUIRED` / `SOURCE_PAGING_AND_DRAIN_PROOF_REQUIRED` | **chưa giao** — 37/42 alpha vẫn trống replay | — |

Khoảng cách nhánh: `feat/eds11r-r4-r5-activation` **+41 / −13** so với `feat/eds-current-bff`; `feat/eds12-failure-dr-release` **+18 / −31**. Dev hiện chạy `feat/eds-current-bff @ f04dad8` (FE đầy đủ + backend tới EDS-07/OR-4). Gate D2 của nhánh eds11r ("Imported Manager route template…") rớt 6/6 lúc 06-09 tối rồi tự pass khi chạy lại lẻ → gate phụ thuộc trạng thái runtime của codex, không tái lập được từ ngoài.

**Frontend (Claude) — trên dev:**

| Phiếu / goal | Trạng thái | Còn dở |
|---|---|---|
| G1–G3 (A-01…A-03) | ✅ chấm xong | — |
| G4 (A-04) | 🟡 4/4 route, panel typed | ký từng màn (identity ngoài trang đầu, mixed-currency) |
| G5 (A-05) | 🟡 4 tile derivation lên CC | governance/ops tile (Inbox/R1/R2/Exit/Waivers/Queue/Incident) |
| G7 (A-07) | 🟢 core (uPlot, equity/drawdown) | live/sandbox/deployment typed tới khi mirror; fleet sparkline; ECharts reskin |
| OR-5 R1–R4 Trade Replay | ✅ merge `f04dad8` | phụ thuộc nguồn: BR-EX-50/80/81 |
| G6 (A-06 EDS-06 cutover, dual-read parity, DR-01) | ⬜ | chưa bắt đầu |
| G8 (A-09 EDS-09b adapter + DR-13) | ⬜ | codex đã có BFF, chưa hợp nhánh |
| A-10 (EDS-10 candles) | ⬜ | hợp nhất OR-4 ↔ EDS-10b |
| A-11 (EDS-11 SSE + action graph) | ⬜ | chờ hợp nhánh |
| A-12 (EDS-12) | 🟡 static ready | deployed evidence = ma trận browser từng màn (FE làm được) |
| Parity showcase §A5.5 | 🟡 | Paper/Portfolio/Live Overview motion+chart, fleet sparkline, ECharts reskin |
| e2e BFF double (DR-19) | ⬜ | route EDS-05/07 chưa có trong double |

### A6.2 Nghiệm thu codex — kết luận
EDS-12 **đạt ở mức khung tĩnh** (crate + contracts + failure matrix + runbook + mutation test), chưa có bằng chứng deploy, không đổi runtime; hai request nguồn của tôi bị đóng băng thành gate. Các phase 09b/10b/11R1/11R3/R4-R5 chỉ có commit trên nhánh codex — **chưa thể nghiệm thu bằng runtime** vì chưa ở trên dev và chưa hợp với `feat/eds-current-bff`. Điều kiện nghiệm thu thật cho từng phase ghi ở A6.3.

### A6.3 Kế hoạch ghép nối BE↔FE sau EDS-12 (đề xuất, Bobby duyệt từng bước như trước)

| Bước | Ai | Giao gì | Bobby thấy gì trên dev | Đóng khi |
|---|---|---|---|---|
| **I0 hợp nhánh** | codex (+Bobby chốt head) | merge `feat/eds-current-bff@f04dad8` vào `feat/eds11r-r4-r5-activation` (giữ bản của tôi ở TradeReplayEvents/recomposeContainers vì `7ec17dd`/`97ab33f` là bản re-apply cũ), rồi gộp `feat/eds12-failure-dr-release`; một head duy nhất (đề nghị `feat/execution-integration`) → deploy dev từ đó | mọi màn hiện tại y nguyên + backend 09b/11R có mặt | gate hook xanh trên head; dev chạy head; tracker ghi hash |
| **G8 / I1** | Claude | EDS-09b observation adapter (DR-13) + observed timeline BFF → Command Center beat/journal/flash theo revision thật | motion trên CC/journal chạy bằng revision nguồn, không còn clock nội bộ | A-09 ký; test revision replay |
| **G9 / I2** | Claude | EDS-11R1 named relation BFF thay đường đọc resource/N25 nơi BFF là authoritative; đóng DR-22 (facts scope theo subject) | Alpha/Account 360 số theo đúng subject, Overview không còn "profile-wide" | A-04/A-05 ký từng màn |
| **G10 / I3** | Claude + codex | một nguồn nến: `EXECUTION_MARKET_CANDLES_SOURCE=data_layer` nối vào market-context BFF của EDS-10b/11R4; OR-4 giữ làm fallback typed | Trade Replay nến từ Trading System, footer ghi `TRADING_SYSTEM_DATA_LAYER` | A-10 ký; marker khớp feed hệ thống |
| **G6 / I4** | Claude | EDS-06 cutover dual-read parity từng màn, DR-01 trả lời | cùng màn, số y hệt, payload nhẹ (đo byte) | A-06 ký |
| **G11 / I5** | Claude | EDS-11 SSE + action graph; R4/R5 lanes bounded hiện typed | realtime SSE v2; hành động R4/R5 hiện đúng trạng thái bounded | A-11 ký |
| **G12 / I6** | Claude → codex | ma trận browser có xác thực ready/empty/partial/stale/unavailable/denied/error từng màn (harness đã có) làm `deployed-evidence.v1` của EDS-12 | — (bằng chứng) | A-12: codex chuyển EDS-12 khỏi `DEPLOYED_EVIDENCE_PENDING` |
| **P // song song** | Claude | parity §A5.5: Paper/Portfolio/Live Overview motion+chart, fleet sparkline uPlot, ECharts reskin; G4 ký từng màn; G5 governance tile; DR-19 BFF double | showcase↔dev từng màn | §A5 bảng đo trước/sau |
| **S nguồn** | Bobby → codex/source owner | BR-EX-81 (drain orders/fills + đọc theo subject), BR-EX-80 (timeframe), BR-EX-50 (kline shard), DR-24/25/26 | replay/Orders & Fills đúng cho mọi alpha | mirror = source count; `delta_rsi_*` không rỗng khi nguồn có fill |

Thứ tự đề xuất: **I0 → G8 → G9 → G10 → G6 → G11 → G12**, P chạy song song, S do Bobby giao. Không bước nào ký DONE khi Evidence trống (§A3).

### A6.4 I0 — hợp nhánh ĐÃ LÀM 07-09 (owner giao cho Claude thay vì chờ codex)

Head tích hợp duy nhất: **`feat/execution-integration`** (worktree `/home/bobby/portal-integration`), push `origin`.

| Commit | Nội dung | Conflict giải thế nào |
|---|---|---|
| `636a92c` | merge `feat/eds-current-bff@f04dad8` vào `feat/eds11r-r4-r5-activation@5abd275` | 8 file: `TradeReplayEvents.tsx`, 2 test, `recomposeContainers.tsx` → **bản của tôi** (codex mang bản re-apply cũ `7ec17dd`/`97ab33f`); `app.module.ts` → union (AuthoritativeEventLedgerRepository + ExecutionMarketCandlesService); compose local-projection → giữ cờ candles; N29 pack → re-pin theo file đã merge. **Lỗi thật bắt được ở hook:** `FastifyError: GET /api/v1/execution/market/candles already declared` — `MarketContextController` của codex (EDS-10b/11R4, data_layer qua Manager) đã giữ route đó → route nến venue công khai của tôi đổi thành **`/market/venue-candles`** (FE + test + harness cập nhật); G10 hợp nhất hai nguồn sau `EXECUTION_MARKET_CANDLES_SOURCE`. Gate trên cây merge: FE tsc sạch, vitest 105 file / 1902 pass / 3 skipped; control-api build-tsc sạch, market-candles + eds11r-market-context spec 18/18; hook pre-commit xanh (control-api suite 50 file) |
| `8f6aff5` | merge docs `118406c` (BR-EX-80/81 rows) | không conflict |
| `8dc281e` | merge `feat/eds12-failure-dr-release@8a7bd6f` | plan backend → bản codex (EDS-12 viết lại rows BR-EX-80/81); FRONTEND_HANDOFF giữ cả 8.50 (EDS-09b observation-revision) và EDS-12 handoff đổi số **8.55**; tracking test giữ chuỗi bắt buộc; **EDS-12 pack "evidence digest drifted: n29_acceptance"** → re-pin `qualification.v1.json` (n29_acceptance + current_source_proxy của 11R1) + MANIFEST, đúng thực hành `8a7bd6f`; `verify-static` vẫn `EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING` |

**Deploy dev:** script build phải truyền `--env-file /home/bobby/portal-dev/.env` vì compose của codex yêu cầu `PORTAL_RUNTIME_GID` (987) và `CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY` (đã có sẵn trong `.env` dev). Dòng deploy + kết quả route mới (`/views/observed-timeline`, `/manager/current/:op`, `/market/venue-candles`) ghi ở A6.5 sau khi build xong.

**Cho codex:** hai nhánh của codex giờ nằm sau head tích hợp; mọi việc tiếp theo (G8/G9/G10…) làm trên `feat/execution-integration`; Bobby chốt khi nào head này vào `dev`.

### A6.5 G8 — EDS-09b adapter → motion theo revision thật — ĐÃ LÀM 07-09 (commit `9eca5f8` trên `feat/execution-integration`, push; hook đầy đủ xanh: N29 complete-surface / Phase 2 / tracking reconciliation / monorepo verification)

**Giao gì (18 file, +572/−7):** Alpha 360 và Account 360 mount BFF observed timeline của codex (`GET /views/observed-timeline`, `portal.execution.observed-timeline-bff.v1`) thành panel **Observed timeline**: chip provenance (`PORTAL_OBSERVATION` · `BOUNDED_CURRENT_PAGE`), state + reason code của BFF, mỗi quan sát một dòng (source clock, record kind, values, `rejected_exact_value_fields` gọi tên), `unavailable_segments` hiện "Soon · …", trang sau theo `after` của chính BFF. Không tổng hợp gì: EMPTY hiện là EMPTY. **Motion theo revision thật:** nhịp (beat) chỉ nổ khi `projection.sequence` (panel) hoặc `read_at` của snapshot Command Center tiến; re-read theo cadence projection 15 s, dừng khi tab ẩn, chỉ tắt ở trang `/_fixtures`. Backend: `analytics.controller.ts` log lớp lỗi upstream trước khi trả 502 typed (nhờ đó tìm ra lỗi probe bên dưới). N29 + EDS-12 pack re-pin theo cây làm việc.

| Bằng chứng | Kết quả thật |
|---|---|
| vitest FE (cây G8) | 106 file · **1910 pass** · 3 skipped; `tsc --noEmit` sạch; gate typography sửa bằng cách dùng lại `exec-rp-title` (không thêm class uppercase) |
| Probe stack (`:8090`, DB dump dev) | **Lỗi thật tìm được:** `query-analytics`/`observed-timeline` 502 vì DB probe thiếu migration 025–027 của codex (`column "source_catalogue_sha256" does not exist`) — dev đã có; áp migration → `query-analytics` 200, `observed-timeline` 200 PARTIAL |
| Browser (Playwright, alpha có lệnh `fib_sl_tp_strength_0015m`) | Alpha 360 Overview: panel `PARTIAL · EDS10_OBSERVED_TIMELINE_CURRENT_PAGE_PARTIAL`, **100 quan sát**, env `paper*` / `sandbox`, `rev 32 → 33` sau 20 s, `data-beat` 0 → 1; Account 360 (`paper-binance-fib_sl_tp_strength_0015m`): 100 quan sát; Command Center: `as_of 06:03:16.618 → 06:03:31.623`, `data-revision` 1 (nhịp theo `read_at` thật, không theo đồng hồ) |
| Alpha không có command (delta_rsi) | panel EMPTY 0 quan sát — đúng với nguồn (curl cùng subject cũng 0) |

**Ba phát hiện ghi lại (không phải lỗi của codex, nhưng phải biết):**
1. `usePollTick` lúc đầu tôi gắn vào `smokeMotionAllowed()` (tắt dưới `navigator.webdriver`) → trong trình duyệt tự động panel không bao giờ re-read, kiểm tra G8 đầu tiên báo CC đứng yên. Tách `pollAllowed()`: **re-read dữ liệu không phải motion** — chạy cả khi reduced-motion và dưới Playwright, chỉ tắt ở `/_fixtures` và khi tab ẩn. Motion (animation) vẫn theo `smokeMotionAllowed()`.
2. **DR-27 (mới, đề xuất codex/Bobby):** `resources/alphas/:id` trả `selected_environment = "live"` khi không `requested_environment` — là mặc định của resolver, không phải nơi alpha đang chạy (mọi row của `fib_sl_tp_strength_0015m` là paper/sandbox). Panel observed timeline vì thế đọc `live` → 0 quan sát dù paper có 100. Sửa phía FE: panel lấy môi trường từ chính `panels.deployments.rows[].mode` của resource (chip `paper`/`sandbox`, mặc định env đầu tiên có deploy). **Còn treo:** Activity rollup EDS-05 (`activityEnv`) vẫn đọc theo `selected_environment` → với alpha paper nó đang đọc live; đề nghị resolver chọn env theo deployment thật, hoặc FE đổi Activity sang cùng luật (chờ Bobby quyết vì đổi số Activity trên màn).
3. BFF observed-timeline chỉ nhận `subject_kind ∈ {deployment, alpha, portfolio, account}` (`strategy` → `EDS10_OBSERVED_TIMELINE_QUERY_INVALID`) — FE gửi `alpha`, khớp.

**Deploy dev:** từ `9eca5f8` bằng `deploy-int.sh` (build + up đều `--env-file portal-dev/.env`) — dòng kết quả ở A6.6 cùng G9.

**Đóng gì:** DR-13 (motion theo clock nội bộ) đóng phía FE bằng nhịp theo `sequence`/`read_at`; **A-09 chưa ký** — Bobby xem trên dev rồi ký. G9 làm tiếp trên cùng head.

### A6.6 G9 — EDS-11R1 named relation BFF thay đường đọc N25 cho Trade Replay + funnel, đóng DR-22 phía FE — ĐÃ LÀM 07-09 (commit `9a516b2` trên `feat/execution-integration`, push; hook đầy đủ xanh)

**Giao gì (9 file, +391 mới / +132/−14 sửa):** `api/managerRelations.ts` (reader trang `portal.execution.eds11r.manager-relation-page.v1`, `relationPagePath`, `relationRow` chỉ đổi TIMESTAMP ms → ISO, `drainRelation` đi hết continuation ≤ 40 trang × 200 dòng, thử lại một trang đúng một lần, `drainRelations` tối đa 3 relation cùng lúc, `subjectRows`, `subjectFunnel`), `useRelationFacts.ts` (drain một lần theo subject/env, đọc lại mỗi 60 s khi tab hiện), port/http/fixture `getManagerRelationPage`, `TradeReplayLive` lấy orders/fills/order_brackets/legs/conditional groups/legs/capital ledger từ page set (orders/fills lọc theo `strategy_id`/`account_id`; group tables nguyên vẹn, `scopeGroups` lọc), N25 chỉ còn cho deployments/strategies (venue, timeframe) và làm bản đứng-thay khi page set đang tải hoặc BFF không có; panel ghi rõ nguồn trong legend + empty state; Alpha 360 funnel đếm từ dòng của chính subject (`≥` khi walk bị cap). **Không có route** cho `arb_order_packages`/`settlements` trong registry 54 route → hai bảng đó vẫn N25 (reader đã sẵn từ R-phase).

| Bằng chứng | Kết quả thật |
|---|---|
| vitest FE (cây G9) | 107 file · **1921 pass** · 3 skipped; `tsc --noEmit` sạch; `npm run build` OK (`index-UvmWWYW2.js` 228 kB) |
| Probe drain (curl, paper) | `orders` **6 trang · 1166 dòng · 12 strategy**, `fills` **31 trang · 6088 dòng**, `has_more=false`, `completeness=COMPLETE` — so với trang N25 bounded: 812 orders / 71 fills. `delta_rsi_*` **vẫn không có dòng nào ở nguồn** → DR-26/BR-EX-81 giữ nguyên (không phải lỗi portal) |
| Browser Alpha 360 `fib_sl_tp_strength_0015m` | Overview KPI: `ORDERS (PAGE SET · THIS SUBJECT)` · `FILLED/CANCELED/RISK_REJECTED · THIS SUBJECT` — **hết nhãn profile-wide**; Trade Replay legend: `source: Manager relation page set (EDS-11R1) · 56 pages · drained to the relations' end · COMPLETE`, **382 dòng** log của subject (trước: 71 fills cho cả profile); 56 lượt đọc relation đều 200 |
| Browser `delta_rsi_0011d` | "No order or fill of delta_rsi_0011d is present in the Manager relation page set (EDS-11R1). The page holds 1166 orders and 6088 fills across 12 strategies (56 pages · drained to the relations' end · COMPLETE) — none of them belongs here." |
| Browser Account 360 `paper-binance-fib_sl_tp_strength_0015m` | cùng nguồn page set, 482 dòng theo `account_id` |
| Sự cố thật | lần chạy đầu 1/46 trang `fills` trả **502**, lần sau 1 trang **503** (Manager chịu tải khi 7 relation drain song song) → thêm thử-lại-một-lần và giới hạn 3 relation đồng thời; sau đó walk hoàn tất `COMPLETE` |

**Chi phí thật phải nói:** một lần mở Alpha 360 = **56 lượt đọc, ~25–40 s** để hết page set (fills 31 trang tuần tự ~0.8 s/trang); trong lúc đó màn hiện trang N25 với nhãn "relation page set loading". Đây là hệ quả của việc BFF chỉ có đọc theo trang toàn profile, không có đọc theo subject — **BR-EX-81** (drain + đọc theo subject phía nguồn) vẫn là lời giải đúng; G9 là bản trung thực chạy được trong lúc chờ.

**G9b — scale refine §8 bắt buộc, tìm ra từ chính ảnh chụp probe (commit `712c0a7`):** với page set làm nguồn, bảng Trade log vẽ **toàn bộ 382 dòng** (ảnh cao 21.799 px); account có thể tới hàng nghìn dòng → DOM phình. Sửa: log hiện **200 dòng mới nhất**, header "200 of N events shown · newest first", nút "show 200 older events · K older not shown — the chart still draws every event"; chọn marker trên chart hoặc deep link `focus=` tự lộ dòng của nó rồi mới cuộn tới. Chart vẫn vẽ đủ mọi event, chỉ bảng được phân trang. Test: 450 fill → 200 dòng, bấm → 400, còn 50; rerender cùng nội dung không gập lại (lỗi thật bắt được trên probe: poll dựng lại mảng → reset). **Cùng commit:** lần probe thứ 3 walk `fills`/`order-bracket-legs` gặp **503 hai lần liên tiếp** cho cùng cursor (Manager connection dùng chung với projection worker — log worker `execution_profile_projection_relation_failed … N21_SHARED_*`), trang đó curl lại sau vài giây thì 200 → retry theo lịch 400 ms + 1,5 s và chỉ 2 relation đi song song; walk dừng sớm vẫn ghi "stopped early — a lower bound · PARTIAL · fills: <mã>" và drain lại sau 60 s. Ô §8 cho Trade Replay: Cardinality 10²–10⁴ dòng/subject · Break point ~10³ dòng DOM · Degradation cap 200 + reveal · Invariant nhãn "N of M shown", chart không cap · Server contract vẫn BR-EX-81.

**Đóng gì:** DR-22 đóng phía FE (facts scope theo subject, nhãn nguồn đúng); A-04/A-05 (Alpha 360 / Account 360) đề nghị Bobby ký sau khi xem dev. **Deploy dev:** `dev chạy head `712c0a7` (I0 + G8 + G9 + G9b) qua `deploy-int.sh` (build + up với `--env-file portal-dev/.env`): `portal-web:dev` bundle `index-C9ticVIn.js` (cùng cây với ảnh probe), `control-api:dev` từ `9eca5f8` (G9/G9b không đổi backend) — cả hai healthy; route `/manager/current/*` là của codex, có trên dev từ I0. Bobby kiểm tra tại `https://portal.primusspark.com` / `http://127.0.0.1:8080``.

## A7. NGHIỆM THU BẢN CUỐI CODEX TRẢ (07-09, owner: "codex EDS-12 đã xong, cung cấp hết sức") + PHASE BỔ SUNG (§7.7: đánh giá kết thúc bằng markdown)

### A7.1 Kiểm nhánh — một head duy nhất
| Nhánh | Trạng thái so với `feat/execution-integration@712c0a7` | Việc |
|---|---|---|
| `feat/eds12-failure-dr-release@8a7bd6f`, `feat/eds11r-r4-r5-activation@118406c`, `feat/eds10-eds11-observation@50239f6`, `docs/eds09-ts-owner-return-handoff@ec97c48`, `feat/eds-current-bff@f04dad8` | **đã nằm trọn trong head** (`git rev-list HEAD..<nhánh>` = 0) | không còn gì để gộp; remote không có commit codex mới sau I0 |
| `feat/execution-n08-sse-activation` (8 commit, 30-08: BR-EX-67…71 plan, spec BR_EX_68, PHASE_TRACKER, `execution-tracking-test.sh`) | **bị head vượt qua**: head có nhiều tham chiếu BR-EX-67…71 hơn nhánh này và đã có `upgrade/BR_EX_68_ADMIN_ACTION_DRAWER_SPEC.md`; 8 commit chỉ không phải tổ tiên vì codex đưa nội dung sang nhánh khác | **không gộp** (gộp sẽ kéo bản cũ của script gate tracking đè lên bản mới) |
| `feat/execution-data-activation` (tracker A6.4–A6.6 + A7 này) | docs-only, merge khô 0 conflict | gộp vào head ngay sau commit này để head mang tracker mới nhất (merge commit ghi ở A7.4) |
| `fix/v1.0.1-*`, `chore/primus-origin-mirror-policy` | nhánh hotfix/main-track, ngoài scope Execution Loop | để Bobby |
| **Diff chưa commit trong worktree `portal-dev`** (5 file edge-service Rust + compose/env, +264/−21: "P4-E cadence ladder" — `FeedClass` Transactional/AccountState/Metadata, 3 biến `EDGE_MANAGER_PROJECTION_POLL_INTERVAL_*_MS`) | **không phải của Claude**, chưa build, không thuộc EDS-12 | **không commit hộ** — codex/Bobby quyết: commit lên nhánh codex hoặc bỏ. Script commit tracker chỉ `git add` tracker |

### A7.2 Phiếu A-12 — EDS-12 release qualification (đo 07-09 trên head `712c0a7`)
| Hạng mục codex giao | Đo được | Kết luận |
|---|---|---|
| Static qualification pack `eds12-release-qualification-v1` (qualification + failure-matrix 10 kịch bản + schema + MANIFEST) | `./scripts/execution-eds12-qualification-test.sh` trên head: N29 `RELEASE_CANDIDATE_READY` (product_release `NO_GO`, blocker `N29-REL-01`), EDS-12 `EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING`, 4 profile stage, `runtime_effect NONE`, **9 mutation case fail-closed pass**; pack đã re-pin đúng thực hành sau mỗi commit FE (N29 digest) | ✅ **ACCEPT (static)** |
| Offline DR (`--offline-dr`, PITR/restore/rebuild disposable PG) | codex pin "verified P01 R4 R5 integration" (`8a7bd6f`); Claude **chưa chạy lại** drill này | ✅ nhận theo bằng chứng codex, ghi rõ chưa tái chạy |
| Deployed product evidence (`portal.execution.eds12-deployed-evidence.v1`, bound `candidate_qualification_sha256`, `exact_deployed_browser_state_matrix REQUIRED`, `verify-deployed` từ chối non-main/unsigned/profile-mixed) | chưa có — theo thiết kế: chỉ tạo cho image set protected-main; codex "sẽ giao evidence shape sau release protected-main" (handoff §8.55) | ⏳ **PENDING đúng nghĩa** → G12 (Claude dựng ma trận browser + payload nháp; final sau khi Bobby merge main) |
| Runtime BFF đã dùng bởi FE (đo probe, cùng code head) | `command-center` 200/0,12 s · `resources/alphas|accounts` 200 partial · `views/observed-timeline` 200 · `views/equity-chart` 200/1,96 s · `manager/current/orders|order-brackets` 200 PARTIAL · `manager/operations` 200 · `market/venue-candles` 200 READY · `command-center/realtime-snapshot` 200 (`manager-realtime-snapshot.v2`) · `market/candles` typed `EDS11R4_MARKET_QUERY_INVALID` khi thiếu tham số (source-dark, đúng) | ✅ đúng typed, không có route nào trả 5xx khi rảnh; 5xx lẻ chỉ khi drain 56 trang (A6.6) |
| Luật §8.55 cho FE (4 stage tách biệt, 7 state, không gọi nguồn từ browser, không tái dựng lịch sử client-side, không claim `PRODUCT_ACTIVE`) | FE hiện tại: page set EDS-11R1 dán nhãn "current page set", N25 dán nhãn "bounded current page", BR-EX-80 giữ `DERIVED` hiển thị, không có fetch nào ngoài `/api/v1/execution/*` same-origin | ✅ tuân thủ |
| BR-EX-80 timeframe | `SOURCE_OWNER_RETURN_REQUIRED` — codex không tự làm được | ⏳ Bobby → source owner |
| BR-EX-81 drain lịch sử orders/fills vào mirror | README pack: đóng khi Portal drain **complete retained history** qua Manager relation pager với cursor/restart/dedupe/count parity; pager đã có (EDS-11R1) nhưng envelope Manager `retention_floor_status: UNDECLARED_BY_MANAGER_ENVELOPE`, `replay_eligible: false` → codex "hết sức" = **chờ source owner khai retention/cursor**. G9 đã chứng minh pager đi hết 56 trang COMPLETE (bằng chứng cursor/dedupe một phần) | ⏳ Bobby → source owner; codex làm mirror khi có khai báo |

**Kết luận A-12: ACCEPT-STATIC** (không phải `PRODUCT_ACTIVE`). Codex đã giao hết phần Portal có thể giao; hai đầu vào còn lại thuộc **source owner** (Trading System), Bobby là người đẩy.

### A7.3 Phase bổ sung (đề xuất; Bobby duyệt từng goal; **mỗi goal = rebuild dev + báo cáo: ghép nối được gì · enhance gì so với showcase · backend hỗ trợ gì**)
| Phase | Ai | Giao gì | Enhance so với showcase (UI/UX) | Backend hỗ trợ / điều kiện | Đóng khi |
|---|---|---|---|---|---|
| **G10** một nguồn nến | Claude (+codex khi owner trả) | `EXECUTION_MARKET_CANDLES_SOURCE=data_layer` nối `MarketContextService` (EDS-10b/11R4) thay `MARKET_CANDLES_SOURCE_NOT_WIRED`; venue public vẫn là fallback typed | Trade Replay nến từ chính feed hệ thống, footer `TRADING_SYSTEM_DATA_LAYER`; marker khớp nến | market-context còn **source-dark** (`market-context-owner-request.v1` chờ owner return) → G10 giao đường dây + typed dark trên dev; sáng khi owner trả | A-10 ký; harness: `source.kind=data_layer` khi cờ bật |
| **G12-prep** deployed evidence | Claude → codex | harness ma trận **4 profile × 7 state** trên dev (đã có harness từng màn), sinh payload nháp theo `deployed-evidence.v1.schema.json`, tự kiểm shape bằng `verify-deployed` (sẽ bị từ chối non-main — đúng) | không đổi UI; là bằng chứng để đổi decision | final chỉ sau khi Bobby merge head → `main` (image protected-main) và codex giao evidence shape | A-12 → `PRODUCT_ACTIVE` do Bobby+codex |
| **G6** EDS-06 cutover parity | Claude | dual-read parity từng màn (số y hệt, đo byte payload), DR-01 trả lời | cùng màn, nhẹ hơn, nhanh hơn | mirror reads đã bật (`FEATURE_EXECUTION_DURABLE_MIRROR_READS`) | A-06 ký từng màn |
| **G11** SSE v2 + action graph | Claude | CC beat/journal theo SSE v2 (`manager-realtime-snapshot.v2`), R4/R5 lanes bounded typed | motion thật trên CC/journal như showcase; hành động hiện đúng trạng thái | realtime của codex đã có trên head | A-11 ký |
| **G13** DR-27 env | Claude (Bobby quyết trước) | Activity rollup + execution-quality tiles theo env deploy thật (như observed timeline/replay) | hết cảnh "FILLED COUNT 0" cạnh funnel 721 trên alpha paper | hoặc codex sửa resolver `selected_environment` | số Activity đổi đúng chủ |
| **G14** chi phí replay | Claude đề xuất **BR-EX-82** → codex | filter theo subject trên chính named op (`manager/current/orders|fills?strategy_id|account_id`) hoặc page set cache phía Portal | Trade Replay mở < 3 s thay vì 25–40 s (56 trang) | stopgap trước BR-EX-81; không đổi luật "browser không gọi relation thô" | replay fib mở < 3 s, cùng số |
| **P** parity §A5.5 (song song) | Claude | Paper/Portfolio/Live Overview motion + chart, fleet sparkline uPlot, ECharts reskin, G4 ký từng màn, G5 governance tile, DR-19 BFF double | đúng thứ showcase có mà dev chưa | — | §A5 bảng đo trước/sau |
| **S** nguồn | Bobby → source owner | BR-EX-80 timeframe, BR-EX-81 khai retention/cursor rồi codex drain mirror, DR-24/25/26 | `delta_rsi_*` có replay khi nguồn có fill | — | mirror = source count |

Thứ tự đề xuất: **G10 → G12-prep → G6 → G11**, G13/G14 nhỏ chen giữa khi Bobby quyết, P song song. Mỗi goal đóng bằng gate thật (§A3) và một dòng "enhance so với showcase" có ảnh.

### A7.4 Deploy dev sau nghiệm thu
`Sau commit này: tracker docs gộp vào `feat/execution-integration` (merge commit ghi ở A7.1 lần cập nhật kế), dev rebuild từ head gộp bằng `deploy-int.sh`. Code không đổi so với `712c0a7` → `portal-web` bundle `index-C9ticVIn.js`, `control-api` từ `9eca5f8`; Bobby kiểm tra 3 phase (I0/G8/G9) và gate theo §A6.4–A6.6 trên dev.`

### A7.5 Hotfix DR-28 — dev mù vì projection paper bị từ chối (Bobby báo 07-09: Insight Charts không hiện, Trade Replay lỗi)

**Bobby thấy gì (đo lại bằng harness trên dev trước khi vá):** Alpha 360 `fib_sl_tp_strength_0015m`: banner `EDS04_PROJECTION_WORKSPACE_NOT_FOUND`, 12 tile Insight Charts `UNAVAILABLE · PHASE2_PROJECTION_STALE_CEILING_EXCEEDED`, Trade Replay `Unavailable`, observed timeline `UNAVAILABLE`; API: `resources/alphas` 404, `query-analytics` 503, `observed-timeline` 503, `derivations/.../activity` 404. FE hiện đúng trạng thái typed (không bịa) — lỗi ở backend projection. **Không phải thiếu code trên nhánh**: mọi nhánh codex đã nằm trong head (A7.1).

**Nguyên nhân (log + DB dev):** worker `ExecutionProfileProjectionWorker` fail mỗi chu kỳ cho paper từ **06:12 UTC 07-09** (318 lần `execution_profile_projection_refresh_failed · N31_PROFILE_PROJECTION_DOCUMENT_INVALID`); snapshot paper kẹt `projection_sequence 10100 · source_as_of 05:27:55` (document viết trước khi có catalogue), sandbox/live vẫn refresh (seq 367/370). Validator provenance EDS-11R3 (`profile-projection.repository.ts:validateDocument`, codex `5287c3b`) đòi mọi row của document có catalogue phải mang `lineage.source_catalogue_sha256`; `mergeTimeSeriesWindow` gộp nguyên row cũ (2.000 dòng equity/session/performance của paper, `rows_no_sha = 2000/2000`) → document mới bị từ chối → không bao giờ được thay → stale > 300 s → 503. Probe (dump 05-09) không dính vì cửa sổ cũ khác.

**Sửa (backend scope Bobby giao; commit `a4f1ecb`, +/− xem git):** `provenanceCompatibleRows()` — row giữ lại chỉ vào document mới khi provenance khớp (có catalogue: row phải có sha hợp lệ; không catalogue: row không được có sha); row không khớp bị **bỏ và ladder đọc lại từ nguồn**, không dán nhãn giả; log `execution_profile_projection_window_rows_dropped` per relation; nhánh carry-forward cùng luật + relation nêu catalogue của document; validator trả `detail` (điều kiện nào từ chối, ký tự thường, ≤200) vào log `refresh_failed`. Spec mới: drop/keep theo catalogue; `documentInvalidReason` nêu đúng check và chấp nhận document sau khi lọc.

| Bằng chứng | Kết quả |
|---|---|
| Gate control-api (`scripts/control-api-test.sh`, gồm tsc + restore drill) | **50 file · 429 test pass** (lần 1 fail vì import trùng trong spec, đã sửa) |
| Hook pre-commit đầy đủ | xanh, push `origin/feat/execution-integration@a4f1ecb` |
| Dev sau deploy | `projection paper refresh lại lúc **10:51:28 UTC** (epoch mới, `projection_sequence 1`, có catalogue; log `window_rows_dropped` 2×2.000 cho `performance_snapshots`/`account_equity_snapshots` đúng như thiết kế, ladder đọc lại từ nguồn); `query-analytics` **200**, `observed-timeline` **200**; harness dev: Insight Charts **7 tile ok** (Exact query surface, Exposure profile, Execution quality, Venue contribution, Order funnel, Drawdown overlap, Correlation matrix) + các tile còn lại typed đúng (Trade replay journal/Market candles UNAVAILABLE có mã, observed-timeline/mark-context `insufficient_data`), Trade Replay **25 events · 4.527 nến 15m · 200 dòng log** trên trang N25, page set EDS-11R1 drain trên dev 30,8 s (fills 31 trang) không lỗi. Còn 404 `resources/alphas` chỉ với user không phải Bobby → DR-30.` |

**Cho codex:** xác nhận luật "row pre-catalogue không được relabel, bị bỏ và đọc lại" là đúng ý EDS-11R3; nếu codex muốn giữ row cũ dưới nhãn `UNDECLARED`, đổi validator chứ không đổi FE. **Bài học ghi §7.8:** sau mỗi merge backend của codex phải xem log worker trên dev 1 chu kỳ (`refresh_failed`) trước khi báo "đã lên dev".

### A7.6 Rebuild dev sau hotfix — head và trạng thái để Bobby kiểm tra (07-09 chiều)

| Commit | Nội dung | Gate |
|---|---|---|
| `a4f1ecb` | DR-28 backend: row pre-catalogue không vào document có catalogue (bỏ + ladder đọc lại), carry-forward cùng luật, validator ghi `detail` | control-api 50 file · 429 test (gồm restore drill); hook đầy đủ |
| `8a43b5f` | DR-29 FE: drain page set chạy khi resource đã trả lời (ok hay không) | FE 108 file · 1925 pass; hook đầy đủ |
| `44c5715` | DR-29b FE: drain latch (bật rồi không tắt) + huỷ walk bị thay thế (`DRAIN_CANCELLED`) — dev đo 168 lượt đọc/phút do 3 walk chồng nhau khi resource nhấp nháy loading↔unavailable, Manager trả `N21_SHARED_CONCURRENCY_EXHAUSTED` | FE 108 file · 1927 pass; hook đầy đủ |

**Dev đang chạy head `44c5715`** (`deploy-int.sh`: control-api từ `a4f1ecb`, portal-web bundle ghi bên dưới). **Đo sau cùng trên dev:** `portal-web bundle `index-CR_yaGXG.js`; Trade Replay fib: **56 lượt đọc → "Manager relation page set · 56 pages · drained to the relations' end · COMPLETE" sau ~40 s**, 29 events · 4.527 nến 15m · 200 dòng log; Overview `ORDERS (PAGE SET · THIS SUBJECT)` + FILLED/CANCELED/RISK_REJECTED theo subject; Insight Charts 7 tile ok, còn lại typed; worker projection **0 `refresh_failed` trong 10 phút**, snapshot paper seq 43 / live 438 / sandbox 441 đều tiến (11:27 UTC).`

**Bobby kiểm tra gì:** Alpha 360 `fib_sl_tp_strength_0015m` → Overview (funnel theo subject sau khi page set drain xong ~30 s), Insight Charts (7 tile có số, tile còn lại typed), Trade Replay (nến 15m + marker; legend "source: Manager relation page set … COMPLETE" sau ~30 s, trước đó "retained projection page (N25) · loading"), Observed timeline; Command Center nhịp theo `read_at`. Với user khác Bobby: màn 360 vẫn 404 EDS-04 (DR-30, thiết kế hiện tại).

**Enhance so với showcase (đợt này):** không thêm UI mới — đợt này là **khôi phục dữ liệu thật** cho Insight Charts/Trade Replay trên dev và làm drain page set đúng kỷ luật (1 walk, huỷ walk thừa). Backend hỗ trợ: projection worker tự hồi phục sau catalogue rotation; log nêu lý do từ chối document.

## A8. SAU HOTFIX 07-09 — CÒN BAO NHIÊU PHASE ĐỂ NGHIỆM THU HẾT BACKEND BỔ SUNG VÀ GHÉP NỐI HOÀN HẢO THEO SHOWCASE (owner hỏi 07-09 chiều; §7.7)

### A8.1 Nhánh — một head, ba tên
| Ref | Commit | Ghi chú |
|---|---|---|
| `origin/feat/execution-integration` | `2a79b0c` | head làm việc (code `44c5715` + tracker) |
| `origin/feat/execution-data-activation` | `2a79b0c` | **nhánh làm dở trước đó (tracker/phase) — ff 07-09** theo lệnh owner |
| `origin/feat/eds-current-bff` | `2a79b0c` | nhánh code EDS trước đó — ff, worktree `portal-eds-current-bff` cùng head |
| worktree `portal-dev` (cục bộ) | `dcc4eda` | **không ff được**: 5 file edge-service sửa dở không phải của Claude (P4-E cadence ladder) đè lên 2 file mà diff chạm (`compose.execution-edge.yaml`, `edge-service/src/main.rs`) → codex/Bobby commit hoặc bỏ WIP rồi `git merge --ff-only`. Tracker từ giờ sửa trên worktree integration (cùng nhánh), push cả ba ref |

Dev đang chạy code `44c5715` (docs-only từ đó). Bobby merge head này vào `dev`/`main` là quyền của Bobby; `main` cần cho G12 final (image protected-main).

### A8.2 Đếm — còn gì (trạng thái 07-09 chiều)
| Nhóm | Còn | Chi tiết |
|---|---|---|
| **Phiếu nghiệm thu backend (A-xx) chưa ký** | **7** | A-04 (4 màn resource — ký từng màn trên dev), A-05 (derivations — DR-27 env), A-06 (EDS-06 mirror cutover parity, DR-01), A-09 (observation lane — chỉ còn ký), A-10 (candles một nguồn), A-11 (SSE v2 + action graph), A-12 (EDS-12 deployed evidence → `PRODUCT_ACTIVE`) |
| **Phase ghép nối FE ↔ backend (G)** | **6** | G10 nến `data_layer`; G12-prep ma trận 4 profile × 7 state + payload `deployed-evidence.v1` nháp; G6 dual-read parity từng màn; G11 SSE v2 + action graph (R4/R5 lanes typed); G13 DR-27 env cho Activity/execution-quality; G14 BR-EX-82 (đọc theo subject) để replay mở < 3 s |
| **Parity showcase (execution.primusspark.com) còn lệch — §A5.5** | **4** | P1 Paper Overview (funnel/runway từ profile thật + tick SSE); P2 Portfolio 360 Overview (**chặn nguồn BR-EX-79** `portfolio_equity` REJECTED — làm phần typed + layout, số khi nguồn trả); P3 Live Overview (không có deployment live → motion SSE + trạng thái trung thực, không demo); P4 fleet sparkline uPlot + ECharts reskin (OR-3) |
| **Đã ngang showcase (không tính)** | — | Command Center motion + Promotion pipeline thật (A5.6: 32 phần tử động vs 24 demo), Alpha 360 Insight Charts 9 canvas từ số server, Trade Replay TradingView-grade (nến venue, marker, groups, log 200), Observed timeline (G8), funnel theo subject (G9) |
| ~~Nguồn (S) — ngoài tay Portal~~ → **Soon** (sửa 07-09 tối theo owner) | 0 chặn | BR-EX-50/79/80/81, DR-24/25/26 **không còn là blocker**: UI ghi `Soon · <mã>`, phase và phiếu nghiệm thu vẫn chạy — xem §A9.0 và §A9.5 |
| **Bobby quyết** | 4 | DR-27 (env resolver), DR-30 (workspace đa người dùng), merge head → `main` (mở G12 final), WIP edge-service trong `portal-dev` |

**Tổng để "hoàn hảo theo showcase" phía Portal: 6 phase G + 4 việc parity P, khép bằng 7 phiếu A.** Không phase nào ký DONE khi Evidence trống (§A3).

### A8.3 Lộ trình goal (mỗi goal = rebuild dev + báo cáo: ghép nối được gì · enhance gì so với showcase · backend hỗ trợ gì)
| Goal | Gồm | Đóng bằng | Enhance so với showcase |
|---|---|---|---|
| **Goal 1** | G10 + G13 | A-10 (một phần tới khi owner trả market-context), A-05 ký lại sau DR-27 | nến từ feed hệ thống khi có; Activity/execution-quality đúng env |
| **Goal 2** | G11 | A-11 | CC/journal/lanes động theo SSE v2 như showcase, không smoke |
| **Goal 3** | G6 | A-06, DR-01 | cùng màn, payload nhẹ, số y hệt |
| **Goal 4** | P1 + P3 + P4 (+ P2 phần typed) | §A5 bảng đo trước/sau từng màn | Paper/Live/Portfolio Overview + fleet ngang showcase |
| **Goal 5** | G12-prep + G14 (BR-EX-82 → codex) | A-12 (final sau `main`), replay < 3 s | — (bằng chứng + tốc độ) |
| Song song | Bobby ký A-04/A-05/A-09 trên dev; đẩy S | — | — |

5 goal, ~2–3 ngày làm việc phía FE nếu backend/nguồn không chặn thêm; P2 và A-10/A-12 final phụ thuộc nguồn/main.

## A9. ĐO LẠI TOÀN BỘ showcase ↔ dev (07-09 tối) — SỔ NỢ P0 VÀ GOAL THEO PHASE

> **Owner chỉnh cách hiểu (07-09):** *"owner đã trả hết rồi… những gì portal execution edge bên kia, lẫn những gì mình có thể đọc và call về là toàn bộ rồi. Những chỗ TS chưa đáp ứng thì phải note là **Soon**, chứ blocked lại để các phase và nghiệm thu khác bị dừng lại. Không có kiểu ngoại trừ gì hết: chỗ nào không đúng yêu cầu showcase về UI/UX, tính động, tính chính xác, những nút ấn bên trong thì đều là technical debt, phải đẩy lệnh xử lý hết ngay Priority 0."*

### A9.0 Luật mới (thay luật cũ trong A6.3/A7.3/A8.2)
1. **Không còn trạng thái "blocked/chờ nguồn".** Mọi `BR-EX-*`/`DR-*` thuộc nhóm "TS chưa trả" đổi thành **`Soon`**: UI hiện chip `Soon · <mã>` ở đúng ô/panel đó, phase vẫn chạy, nghiệm thu vẫn ký cho phần đã có. Chỉ `DENIED` (quyền) và `ERROR` (lỗi thật) mới giữ nguyên tên.
2. **Không có ngoại lệ.** Mọi sai lệch với showcase — bố cục, panel, tile, cột, chip, **nút bấm và hành vi của nút**, tính động, con số — đều là technical debt **P0**, ghi vào §A9.3, không dồn sang "đợt sau".
3. **Đo trước khi nói.** Mỗi mục P0 phải có số đo showcase vs dev trong §A9.2/§A9.3; đóng mục phải đo lại cùng harness.

### A9.1 Cách đo (tái lập được)
Showcase = container `portal-showcase` `http://127.0.0.1:8081` (bản preview, smoke). Dev = `http://localhost:8080` head `44c5715`, đăng nhập `claude-probe` qua `context.request.post` (fetch trong trang từ `127.0.0.1` bị 403 origin). Harness `parity2.js` (scratchpad), viewport 1440×1100, `reducedMotion: no-preference`: đếm canvas/svg, phần tử có CSS animation + `document.getAnimations()`, **liệt kê từng nút** (nhãn + disabled), select và số option, tab, panel `section[aria-label]`, `tbody tr`, `data-state`/`data-tone`, đếm từ khoá (`Soon`/`unavailable`/`not published`/`pending`/`blocked`/`insufficient`), API 4xx/5xx, và 2 khung hình cách 1,6 s để bắt chuyển động. **34 route/tab mỗi bên** (13 màn danh sách + 11 màn chi tiết + 10 tab Alpha 360).

### A9.2 Kết quả đo — bảng tổng (showcase / dev)
| Màn | canvas | CSS-anim | nút | hàng | panel | Ghi chú đo được |
|---|---|---|---|---|---|---|
| Command Center | 0/0 | 24/**29** | 3/0 | 4/12 | 5/6 | dev hơn về động; thiếu 3 hàng "needs attention" (dữ liệu) |
| Operations Queue | 1/0 | 4/1 | 10/4 | 7/0 | 1/1 | thiếu chart, "Needs attention", phân trang ▲▼ |
| Approval Inbox | 0/0 | 2/0 | 12/9 | 6/0 | 1/1 | thiếu filter "Mine", 0 hàng (nguồn) |
| Waivers | 0/0 | 3/0 | 12/7 | 5/1 | 1/1 | thiếu filter "All (8)", hàng mở rộng ▸ |
| Exit Reviews | 0/0 | 0/0 | 4/0 | 0/0 | 1/1 | thiếu 4 nút hành động |
| Portfolios | **4/0** | 2/0 | **11/0** | 10/2 | **3/0** | thiếu 6 tab, 3 panel, 4 chart, 3 nút cửa sổ |
| Alpha Fleet | **4/0** | 2/0 | 9/51 | 16/48 | 0/0 | thiếu sparkline 30d, filter Venue/Owner, cột Next gate |
| Paper Trading | **4/1** | 2/0 | 8/43 | 0/0 | 4/3 | thiếu 3 chart, filter venue/portfolio, panel "Left paper, last 90 days" |
| Sandbox | 0/0 | 5/0 | 7/0 | 6/35 | **3/0** | thiếu 3 panel + 4 filter |
| Live Operations | **4/0** | 3/0 | 6/0 | 8/0 | 0/0 | thiếu 4 chart + 4 filter |
| Accounts & Bindings | 0/0 | 5/0 | 6/2 | 13/43 | 0/0 | thiếu 5 filter + hàng mở rộng binding |
| Blotter | 0/0 | 3/0 | 24/60 | 23/49 | 0/0 | thiếu filter Brackets/Conditional, "load older", hàng mở rộng |
| Gate R1 / R2 | 2/0 · 0/0 | 0/0 | **6/0** | 0/0 · 10/0 | 3/1 · 1/1 | thiếu **Approve / Approve with condition / Attach condition / Request changes / Deny** + link policy registry; 404 nguồn |
| Exit Review detail | 0/0 | 0/0 | **4/0** | 0/0 | 1/1 | thiếu Approve promotion / Extend +14d / Reject / Copy |
| Paper Workbench | **8/0** | 0/0 | **13/0** | 10/0 | **12/0** | 404 resource (DR-30) → mất cả màn |
| Sandbox Workbench | 3/0 | 2/0 | 11/4 | 3/0 | 18/5 | thiếu 8 panel hi-fi + 7 nút |
| Canary Control Room | **5/0** | 1/0 | 6/0 | 6/0 | **16/0** | 404 nguồn (không có deployment live) |
| Live Full | **5/0** | 0/0 | 8/4 | 8/0 | 14/4 | thiếu Halt/Reduce/Emergency close ▾, 8 panel |
| Portfolio 360 | **4/0** | 2/0 | 11/8 | 10/0 | 3/1 | thiếu 3 panel + nút 30d/90d/All |
| Account 360 | 0/0 | 0/0 | 3/1 | 6/**100** | 0/3 | thiếu Sync now / Dry-run reconcile |
| Incident Detail | 1/0 | 3/0 | 3/0 | 0/0 | **5/0** | 403 → mất 5 panel + Acknowledge / Mark RESOLVED |
| Admin Action Drawer | 0/0 | 0/0 | **98/0** | 0/0 | 0/0 | 403 `commands/catalog` → mất toàn bộ 64 lệnh |
| Alpha 360 · Overview | 3/2 | 0/0 | 16/18 | 7/100 | 1/4 | thiếu panel "Equity by stage · All · 30d" |
| Alpha 360 · Insight Charts | **12/7** | 0/0 | 28/12 | 0/28 | 12/15 | **5 tile hi-fi vắng** (xem A9.3 P0-3) |
| Alpha 360 · Trade Replay | 0/**7** | 0/0 | 17/17 | 8/200 | 2/3 | **KHÔNG phải nợ — đây là phần nâng cấp có chủ đích** (owner chốt OR-5): showcase chỉ có SVG demo, dev có nến venue thật + marker/bracket/leg/ladder + log phân trang. Showcase **không phải chuẩn** ở màn này; chuẩn là bản dev, và còn nâng tiếp ở Goal 7 |
| Positions / Orders&Fills / Risk / Sessions / Accounting / Reconciliation / Audit | 0/0 | 0/0 | 10/10 | — | 0/1 | ngang bố cục; dev in "not published" 2–39 lần/tab → phải là `Soon` |

**Hai con số nói nhiều nhất:** (a) **10/13 màn danh sách trên dev có 0 phần tử động** trong khi showcase có 2–5; (b) **scope bar của mọi màn 360 chỉ có 1 lựa chọn** mỗi trục (showcase: Portfolio 2 · Mode 4 · Venue 5 · Window 4) nên bốn ô Select bị `disabled` — người dùng bấm không được.

### A9.3 SỔ NỢ P0 (không có mục nào là "để sau")
| # | Nợ | Đo được | Sửa gì | Ai |
|---|---|---|---|---|
| **P0-1** | **Mọi user ≠ Bobby mất dữ liệu màn chi tiết**: `resources/*`, `derivations/*` trả 404 `EDS04_PROJECTION_WORKSPACE_NOT_FOUND` vì `SessionGuard` gán workspace **cá nhân**, còn projection gắn với workspace của Bobby | curl đo 07-09: `resources/alphas\|accounts\|portfolios` và `derivations/alphas/*/activity` = **404 với workspace phiên · 200 với `?workspace_id=`** | Resource/profile read chấp nhận workspace projection khi user **là member** (giữ nguyên kiểm tra membership); Admin drawer + Incident đọc được ở vai reader | Claude (backend scope) |
| **P0-2** | **Scope bar chết** — Portfolio/Mode/Venue/Window mỗi trục 1 option, Select `disabled` | dev 1/1/1/1 · showcase 2/4/5/4 | Nạp option từ fleet + registry + profile (`ALL` + giá trị thật), Window `30d/90d/1y/All`; khi trục thật sự một giá trị thì ghi rõ lý do thay vì khoá câm | Claude |
| **P0-3** | **Insight Charts lệch hi-fi**: thiếu 5 tile — *Trade return histogram · Execution density day × hour · Regime-shaded equity · Risk utilization · Cost drag waterfall*; và 4 tile dev đặt tên riêng không có trong hi-fi | 12 canvas showcase vs 7 dev; tên tile lệch 9/12 | Dựng đủ 12 tile theo tên và thứ tự hi-fi từ dữ liệu đã có; tile nào nguồn chưa trả → `Soon · <mã>`; tile phụ của Portal xuống hàng dưới, không chiếm chỗ tile hi-fi | Claude |
| **P0-4** | **Portfolios + Portfolio 360 gần như trống**: thiếu 6 tab (Overview · Structure & Correlation · Capital Ledger · Approvals · Incidents · Audit), 3 panel (Equity vs benchmark · Cross-portfolio · Configuration log), 4 chart, nút 30d/90d/All, Rebalance plan ▾, Report pack | 11 nút → 0; 3 panel → 0; 4 canvas → 0 | Dựng đủ tab/panel/nút; `portfolio_equity` nguồn từ chối → panel ghi `Soon · MANAGER_V2_SOURCE_CONTRACT_REJECTED` (không chặn tab khác) | Claude |
| **P0-5** | **Alpha Fleet**: thiếu sparkline equity 30d mỗi hàng, filter Venue/Owner, cột "Next gate" | 4 canvas → 0; 2 select → 0 | uPlot sparkline từ `account_equity_snapshots`; filter từ registry; cột next-gate từ governance | Claude |
| **P0-6** | **Blotter**: thiếu filter Brackets/Conditional, nút "load older", hàng mở rộng ▸ chi tiết lệnh | 24 nút → 60 nhưng vắng 4 nhóm trên | Thêm 2 filter (đã có dữ liệu group từ G9), keyset "load older", hàng mở rộng | Claude |
| **P0-7** | **Accounts & Bindings**: chỉ có Previous/Next; thiếu filter All/Issues/Live-bound/Paper/Testnet và hàng mở rộng binding | 6 nút → 2 | Thêm 5 filter + hàng mở rộng (binding detail) | Claude |
| **P0-8** | **Paper/Sandbox/Live Overview**: thiếu 3–4 chart mỗi màn, filter venue/portfolio, panel *Left paper last 90 days*, *Venue connectivity*, *Testnet order execution*, *Recently certified*, filter Canary/Full/Issues | canvas 4/1 · 0/0 · 4/0 | Dựng chart + filter + panel từ dữ liệu profile; ô nào nguồn chưa trả → `Soon` | Claude |
| **P0-9** | **Workbench/Canary/Live Full**: Paper Workbench mất cả màn (P0-1); Sandbox Workbench thiếu 8 panel + 7 nút (Sync broker, Dry-run reconcile, Open smoke window ⌄, Submit for review, Request Sandbox Exit Review, Copy full, Timeline); Canary thiếu 16 panel; Live Full thiếu Halt ▾ / Reduce ▾ / Emergency close ▾ + 8 panel | xem A9.2 | Dựng panel theo hi-fi; nút mutation hiện **disabled kèm lý do** đúng luật read-only, không được vắng mặt | Claude |
| **P0-10** | **Gate R1/R2 + Exit Review detail**: vắng toàn bộ nút quyết định (Approve · Approve with condition · Attach condition · Request changes · Deny · Approve promotion · Extend +14d · Reject) và 2 panel bằng chứng | 6 nút → 0; 4 nút → 0 | Dựng nút + panel; chưa có hàng nào từ nguồn → hiện `Soon` chứ không để trang trắng | Claude |
| **P0-11** | **Operations Queue · Incident Detail · Admin Action Drawer**: thiếu "Needs attention", phân trang ▲▼, chart; incident mất 5 panel + Acknowledge/Mark RESOLVED; drawer mất toàn bộ 64 lệnh (403 catalog) | 10→4 · 3→0 · **98→0** | **Đo lại cho đúng (07-09):** `commands/catalog`, `operations/incidents/*`, `/operations` trả **403 `ADMIN_ROLE_REQUIRED` / `QUERY_FORBIDDEN` cho tài khoản USER — đúng thiết kế**, và dev đã hiện typed "Withheld · The command catalogue is available to Admin operators only". Nợ thật ở đây là: (a) chưa ai đo ba màn này **bằng tài khoản ADMIN** nên không biết 64 lệnh/5 panel có dựng đủ không; (b) Ops Queue thiếu "Needs attention" + phân trang ▲▼ + chart. Việc: Bobby cấp một tài khoản ADMIN chỉ-đọc cho harness (hoặc Claude đo bằng phiên của Bobby), rồi dựng nốt | Claude + Bobby cấp tài khoản |
| **P0-12** | **Tính động**: 10/13 màn danh sách 0 animation trên dev | showcase 2–5 mỗi màn | Nhịp theo revision thật (đã có `useRevisionBeat`/`usePollTick` từ G8) cho fleet/blotter/accounts/paper/sandbox/live/portfolios/approvals/waivers/ops | Claude |
| **P0-13** | **Ngôn ngữ trạng thái**: dev in "not published" 237 chỗ (99 ở Blotter, 48 ở Paper, 39 ở Orders & Fills) và "unavailable/pending/blocked" cho phần **TS sẽ trả** | đếm từ khoá A9.2 | Helper `soonLabel(reasonCode)`: nhóm "nguồn sẽ có" (`BR-EX-50/79/80/81`, `N28_*`, `EDS10_*_GAP_CONFIRMED`, `MANAGER_V2_SOURCE_CONTRACT_REJECTED`, `N23_SCREEN_OUTSIDE_RELEASE`) → **`Soon · <mã>`**; giữ `DENIED`/`ERROR` cho lỗi thật; ô giá trị trống của một bản ghi vẫn là "not published" (đúng nghĩa dữ liệu) | Claude |
| **P0-14** | **Trạng thái rỗng** — *đã đo lại 07-09 và thu hẹp*: Approval Inbox ("Inbox zero…"), Waivers ("an empty filter is a fact, not a failure"), Operations Queue ("The queue is empty, which is different from a queue that could not be read"), Live Overview ("the source published an empty set") **đã trung thực sẵn**. Đổi chúng thành "Soon" sẽ là **nói dối** (§3.3): rỗng-dữ-liệu ≠ chưa-có-tính-năng | rows 0/6, 0/0, 0/7, 0/8 | Giữ nguyên các câu trên. Chỉ dùng `soonEmptyLine()` ở nơi bảng rỗng **vì nguồn từ chối capability** (ví dụ quan hệ bị Manager từ chối). Việc còn lại của các màn này là chart/filter/panel — thuộc P0-8/P0-11 | Claude |
| **P0-16** | **Frontend gọi endpoint không tồn tại** (đo lại sau Goal 1): `GET /derivations/alphas/{id}/orders-fills` → `404 REQUEST_REJECTED`; `GET /governance/exit-reviews` → `REQUEST_REJECTED`; `GET /portfolios/{id}/capital` → `404 REQUEST_REJECTED` dù controller khai `@Get("/portfolios/:portfolio_id/capital")` (sai prefix ở FE hoặc BE); `GET /portfolios/{id}/correlation` và `/capital-ledger` → `503 ANALYTICS_UPSTREAM_REJECTED` (phải phân loại: nguồn từ chối → `Soon`, hay lỗi thật → giữ UNAVAILABLE) | curl 07-09 | Đối chiếu lại đường dẫn với `FRONTEND_HANDOFF` §6.5/§8; sửa FE hoặc mở Backend request nếu route thật sự chưa có | Claude |
| **P0-17** | **Chip \"Mine\" của Approval Inbox không dùng được**: `?view=MINE` trả `FILTER_NOT_ALLOWED` (showcase có \"Mine (3)\") | curl 07-09 | Hoặc BE allowlist `MINE`, hoặc FE ẩn chip kèm lý do — không được để nút bấm ra lỗi | Claude (+codex nếu cần allowlist) |
| **P0-15** | **Alpha 360 Overview**: thiếu panel "Equity by stage · All · 30d" (showcase 3 canvas, dev 2) và 6 liên kết deployment/account trong hàng | 3/2 canvas | Bổ sung panel + liên kết | Claude |

### A9.4 TÁM GOAL THEO PHASE (owner chốt 07-09 tối; viết theo §7.4 — mỗi goal nêu **giao gì · gate đóng · enhance so với showcase · backend hỗ trợ · phiếu A**)

> Luật chung cho cả 8 goal: (1) mỗi goal kết thúc bằng **gate xanh → commit từng bước → rebuild dev → báo cáo 7 mục** kèm ảnh trước/sau và số đo lại bằng chính harness §A9.1; (2) không mục nào được hoãn vì nguồn — thiếu thì ghi `Soon · <mã>`; (3) mỗi màn phải trả đủ 6 ô scale refine §8 trước khi đóng; (4) nút mutation vẫn **disabled kèm lý do**, không được vắng mặt (luật read-only §3.5).

#### Goal 1 — Mở khoá dữ liệu & ngôn ngữ trạng thái (P0-1 · P0-13 · P0-14)
| Mục | Nội dung |
|---|---|
| **Giao gì** | (a) **P0-1**: `resource-read` và `profile-read` mặc định đọc **workspace của projection** thay vì workspace cá nhân của phiên, vẫn kiểm tra membership — mọi tài khoản là member thấy đúng dữ liệu Bobby thấy; (b) **P0-13**: helper `soonLabel(reasonCode)` phân loại mã nguồn (`BR-EX-50/79/80/81`, `N28_*`, `EDS10_*_GAP_CONFIRMED`, `MANAGER_V2_SOURCE_CONTRACT_REJECTED`, `N23_SCREEN_OUTSIDE_RELEASE`, `N17B_SOURCE_REJECTED`) thành **`Soon · <mã>`**, giữ `DENIED`/`ERROR` cho quyền và lỗi thật, giữ "not published" cho ô giá trị trống của một bản ghi; (c) **P0-14**: empty state chuẩn cho Approval Inbox · Exit Reviews · Operations Queue · Live Operations · mọi bảng 0 hàng — giữ nguyên bố cục, filter và cột, thêm một dòng `Soon · nguồn chưa phát hành hàng nào cho profile này` + số hàng của trang hiện tại |
| **Gate đóng** | control-api suite (50 file) + FE suite + `tsc` + build xanh; harness đo lại: **0 lỗi 404 workspace** trên 8 màn chi tiết; đếm từ khoá: 0 chỗ dùng "blocked" cho nguồn; 4 màn danh sách 0 hàng đều có dòng `Soon` |
| **Enhance so với showcase** | showcase không có khái niệm này (nó là smoke): dev nói **vì sao trống và khi nào có**, trong khi showcase chỉ vẽ dữ liệu giả |
| **Backend hỗ trợ** | không cần contract mới — chỉ đổi mặc định workspace trong 2 controller của codex, giữ nguyên kiểm tra quyền |
| **Phiếu A** | mở đường cho A-04/A-05 ký lại từng màn (trước đó không đo được vì 404) |

#### Goal 2 — Điều khiển và các màn danh sách (P0-2 · P0-5 · P0-6 · P0-7 · P0-17)
| Mục | Nội dung |
|---|---|
| **Giao gì** | **Scope bar thật** trên mọi màn 360: Portfolio/Mode/Venue từ fleet + registry, Window `30d/90d/1y/All`, đổi scope thì mọi panel đổi theo (showcase 2/4/5/4 · dev đang 1/1/1/1 nên bốn Select bị khoá); **Alpha Fleet**: sparkline equity 30d mỗi hàng (uPlot, từ `account_equity_snapshots`), filter Venue/Owner, cột "Next gate"; **Blotter**: filter Brackets/Conditional (dữ liệu group đã có từ G9), nút "load older" keyset, hàng mở rộng ▸ chi tiết lệnh; **Accounts & Bindings**: 5 filter (All/Issues/Live-bound/Paper/Testnet) + hàng mở rộng binding; **P0-17**: chip "Mine" hoặc allowlist `MINE` hoặc ẩn kèm lý do |
| **Gate đóng** | harness: số nút và số option/trục của dev **≥ showcase** trên 4 màn; đổi scope làm panel đổi (kiểm bằng 2 lần chụp); §8: cap hàng + nhãn "N of M" giữ nguyên |
| **Enhance** | fleet 48 alpha thật (showcase 6), blotter 49 hàng thật (showcase 23) — filter và sparkline làm dữ liệu thật đọc được, không chỉ đẹp |
| **Backend hỗ trợ** | có sẵn: fleet BFF, `manager/current/*` (EDS-11R1), `account_equity_snapshots`; `MINE` cần codex allowlist nếu chọn hướng đó |
| **Phiếu A** | A-04 (Alpha Fleet, Accounts), A-05 |

#### Goal 3 — Insight Charts đúng hi-fi & Portfolio 360 (P0-3 · P0-4 · P0-15)
| Mục | Nội dung |
|---|---|
| **Giao gì** | **12 tile hi-fi đúng tên và thứ tự**: 1 Equity by stage · 2 Drawdown & underwater · 3 Rolling corr vs benchmark · 4 Venue contribution · 5 Execution quality by venue · 6 Order funnel · 7 Trade return histogram · 8 Execution density day × hour · 9 Regime-shaded equity · 10 Paper vs Live drift · 11 Risk utilization · 12 Cost drag waterfall (dev đang thiếu 5 tile 7/8/9/11/12 và đặt tên khác ở 4 tile); tile phụ của Portal (Exact query surface, observed-timeline, mark-context, Market candles) xuống hàng dưới, không chiếm chỗ tile hi-fi; **Portfolio 360**: 6 tab (Overview · Structure & Correlation · Capital Ledger · Approvals · Incidents · Audit), 3 panel (Equity vs benchmark · Cross-portfolio · Configuration log), 4 chart, nút 30d/90d/All + Rebalance plan ▾ + Report pack; **Alpha 360 Overview**: panel "Equity by stage · All · 30d" + 6 liên kết deployment/account |
| **Gate đóng** | canvas Insight ≥ 12 và tên khớp hi-fi 12/12; Portfolio tab = 6, panel = 3; tile/panel nào nguồn chưa trả → `Soon · <mã>` (ví dụ `portfolio_equity` = `Soon · MANAGER_V2_SOURCE_CONTRACT_REJECTED`) |
| **Enhance** | showcase vẽ 12 tile bằng số giả; dev vẽ bằng số server và ghi rõ nguồn từng tile |
| **Backend hỗ trợ** | `query-analytics` (order funnel, execution quality, drawdown overlap, correlation), `manager/current/portfolio-capital-ledger`, equity chart DTO |
| **Phiếu A** | A-04 (Portfolio 360), A-07 (chart DTO) |

#### Goal 4 — Ba màn stage & ba workbench (P0-8 · P0-9)
| Mục | Nội dung |
|---|---|
| **Giao gì** | **Paper/Sandbox/Live Overview**: 4 chart mỗi màn, filter venue/portfolio, panel *Left paper, last 90 days* · *Venue connectivity (testnet)* · *Testnet order execution 7d* · *Recently certified*, filter Canary/Full/Issues cho Live; **Paper Workbench** (12 panel hi-fi: Observation gate, Equity series · published, Equity vs approved research evidence, Drift vs approved evidence, Orders and fills overlay, ACK latency, Accounting, Observation policy · consumed…) + 13 nút (8 tab nội bộ, Export, Expand, Table, Copy full, Request Paper Exit Review); **Sandbox Workbench**: 8 panel + Sync broker · Dry-run reconcile · Open smoke window ⌄ · Submit for review · Request Sandbox Exit Review · Copy full · Timeline; **Canary Control Room**: 16 panel (Canary envelope, Envelope compliance, Exit readiness, Live positions & open orders, Incidents · reconciliation…); **Live Full**: Halt ▾ · Reduce ▾ · Emergency close ▾ (disabled kèm lý do) + 8 panel |
| **Gate đóng** | panel và nút của dev ≥ showcase từng màn; không màn nào trắng; mutation disabled có lý do đọc được; §8 cho bảng lớn |
| **Enhance** | các panel này trên showcase là hi-fi tĩnh; dev nối vào derivation thật, ô thiếu ghi `Soon` |
| **Backend hỗ trợ** | `derivations/deployments/*`, `paper-read`, `sandbox-certification`, `canary`, `live-operations` — kiểm lại đường dẫn (P0-16) trước khi dựng |
| **Phiếu A** | A-03 (ba màn stage), A-05 |

#### Goal 5 — Governance & Operations (P0-10 · P0-11 · P0-16)
| Mục | Nội dung |
|---|---|
| **Giao gì** | **Gate R1/R2**: Approve · Approve with condition · Attach condition · Request changes · Deny + link policy registry + 2 panel bằng chứng (Equity across window roles, WFO stability per fold); **Exit Review detail**: Approve promotion · Extend observation +14d · Reject — back to Paper HELD · Copy; **Operations Queue — phần còn lại sau `1884b2a`** (owner chốt 07-09 tối): (a) **chart** của queue (showcase 1 canvas: phân bố theo mức nghiêm trọng/tuổi), (b) **phân trang ▲ newer / ▼ older** nối keyset thật (nút đã có, chưa nối vì trước đây đọc 404), (c) đủ 10 nút như showcase (hiện 6); **Incident Detail — phần còn lại**: (a) **5 panel** Timeline · Operations taken · Evidence · Resolution gates · Annotations, (b) chạy trên **một incident id thật của dev** (dev chưa có incident nào; lấy từ `manager/operations` hoặc journal — không dùng `inc_44` của showcase), (c) Acknowledge · Mark RESOLVED disabled kèm lý do khi gate chưa đủ; **Admin Action Drawer**: đã đo **94 nút / 64 lệnh** với vai ADMIN (`5e00251`) — còn ~4 chip filter so với showcase; **P0-16**: sửa `derivations/alphas/*/orders-fills`, `governance/exit-reviews`, `portfolios/{id}/capital` đang trả `REQUEST_REJECTED` |
| **Gate đóng** | đo bằng **vai ADMIN** (đã có: `claude-probe` được nâng ADMIN trên dev DB, hạ lại bằng một câu lệnh): nút quyết định hiện đủ, trạng thái quyền đúng; với vai USER vẫn hiện `Withheld` typed. Số đo phải đạt: Operations Queue ≥ 10 nút + 1 chart + phân trang chạy; Incident Detail 5 panel trên id thật; Gate R1/R2 6 nút; Exit detail 4 nút |
| **Enhance** | showcase vẽ nút không nối gì; dev nối catalog thật và nói rõ vì sao một nút bị khoá |
| **Backend hỗ trợ** | `governance/*` (N09), `commands/catalog` (ADMIN), `operations/incidents` (ADMIN) |
| **Phiếu A** | A-09 (ops lane), A-11 (action graph) |

#### Goal 6 — Tính động toàn hệ (P0-12)
| Mục | Nội dung |
|---|---|
| **Giao gì** | Nhịp theo **revision thật** (đã có `useRevisionBeat`/`usePollTick` từ G8) cho 10 màn danh sách đang đứng yên: Alpha Fleet · Blotter · Accounts · Paper · Sandbox · Live · Portfolios · Approval Inbox · Waivers · Operations Queue; flash hàng mới, đếm ngược overdue, drain bar, pulse mức nghiêm trọng — tất cả đọc từ dữ liệu, không smoke |
| **Gate đóng** | harness: số phần tử động của dev ≥ showcase từng màn (showcase 2–5); hai khung hình cách 1,6 s phải khác nhau ở đúng các phần tử đó; `prefers-reduced-motion` vẫn tắt animation, polling vẫn chạy |
| **Enhance** | showcase động bằng đồng hồ giả; dev động bằng `projection.sequence`/`read_at` thật — nhìn là biết dữ liệu vừa đổi |
| **Backend hỗ trợ** | projection sequence + `command-center/realtime-snapshot` (đã có) |
| **Phiếu A** | A-09 (DR-13 đã đóng phía FE), chuẩn bị A-11 |

#### Goal 7 — Nguồn nến một mối & SSE v2 & Trade Replay nâng cấp tiếp (G10 · G11 · OR-5 tiếp)
| Mục | Nội dung |
|---|---|
| **Giao gì** | `EXECUTION_MARKET_CANDLES_SOURCE=data_layer` nối vào market-context BFF của codex (EDS-10b/11R4), nến venue giữ làm fallback typed; SSE v2 (`manager-realtime-snapshot.v2`) cho Command Center/journal + action graph R4/R5 lanes; **Trade Replay đi tiếp phần đã vượt showcase**: nhiều symbol cùng lúc, so trùng nến của Trading System với nến venue, đánh dấu lệch, và phần replay theo phiên |
| **Gate đóng** | footer replay ghi `TRADING_SYSTEM_DATA_LAYER` khi cờ bật (chưa có owner return thì ghi `Soon` và vẫn đóng goal); SSE v2 chạy trên dev; harness đo marker khớp nến |
| **Enhance** | đây là **phần dev vượt showcase** — showcase chỉ có SVG demo; mục tiêu là replay dùng được thật, không phải bằng showcase |
| **Backend hỗ trợ** | market-context BFF (codex), realtime v2 (đã có trên head) |
| **Phiếu A** | A-10, A-11 |

#### Goal 8 — Parity EDS-06 & bằng chứng EDS-12 (G6 · G12-prep)
| Mục | Nội dung |
|---|---|
| **Giao gì** | Dual-read parity từng màn (số y hệt, đo byte payload, trả lời DR-01); ma trận **4 profile × 7 state** trên dev bằng harness §A9.1, sinh payload `deployed-evidence.v1` nháp và tự kiểm bằng `verify-deployed` |
| **Gate đóng** | A-06 ký từng màn; payload đúng schema (bị từ chối vì non-main là **đúng**, chờ Bobby merge `main`) |
| **Enhance** | không đổi UI — giảm payload và khoá bằng chứng release |
| **Backend hỗ trợ** | mirror reads (đã bật), `execution-eds12-qualification.py verify-deployed` |
| **Phiếu A** | A-06, A-12 |

### A9.5 Chuyển toàn bộ "blocked/chờ nguồn" sang `Soon` (áp dụng ngay cho tracker này)
| Mục cũ | Trước | Từ 07-09 |
|---|---|---|
| BR-EX-50 (kline shard) | "chờ codex, chặn A-10" | **Soon** — Trade Replay vẫn chạy trên nến venue; footer ghi `Soon · BR-EX-50` |
| BR-EX-79 (portfolio equity) | "chặn §A5.5 Portfolio Overview" | **Soon** — Portfolio 360 vẫn dựng đủ tab/panel; panel equity ghi `Soon · MANAGER_V2_SOURCE_CONTRACT_REJECTED` |
| BR-EX-80 (timeframe) | `SOURCE_OWNER_RETURN_REQUIRED` | **Soon** — giữ suffix `DERIVED` hiển thị, không chặn A-10/A-12 |
| BR-EX-81 (history orders/fills) | `SOURCE_PAGING_AND_DRAIN_PROOF_REQUIRED`, "chặn replay đúng alpha" | **Soon** — page set EDS-11R1 đã drain đủ 56 trang `COMPLETE`; nhãn "current page set" giữ nguyên |
| DR-24 / DR-25 / DR-26 | "OPEN — @codex" | **Soon** — `delta_rsi_*` hiện `Soon` thay vì rỗng câm (P0-14) |
| A-10 / A-11 / A-12 | "chờ hợp nhánh / chờ nguồn" | ký được phần đã giao; phần nguồn ghi `Soon` trong phiếu, **không giữ phiếu mở vì nguồn** |

## A10. GOAL 1 ĐÃ LÀM (07-09 tối) — mở khoá dữ liệu & ngôn ngữ `Soon`

**Commit `83da3a4`** trên `feat/execution-integration`, push cả ba ref; dev rebuild từ đó (`portal-web` bundle `index-CaaSY2AT.js`).

### A10.1 Giao gì
| Nợ | Sửa | File |
|---|---|---|
| **P0-1** | Bốn đường đọc gắn projection (`resource-read`, `portal-derivations`, `operational-composition`, `financial-chart`) trước đây mặc định lấy **workspace cá nhân của phiên**; projection lại nằm ở đúng một workspace (của Bobby) → mọi tài khoản khác nhận 404 trên 8 màn. Nay **đọc không nêu workspace = workspace của chính projection**; membership vẫn quyết định quyền, và caller **nêu** workspace lạ vẫn bị từ chối — đúng tính chất mà check gốc bảo vệ (không ai dán nhãn workspace khác lên dữ liệu projection) | 4 controller + 2 spec |
| **P0-13** | `soon.ts`: phân loại mã nguồn (`BR-EX-50/79/80/81`, `N28_*`, `E5_MARKET_CANDLES*`, `EDS10_*_SOURCE_GAP_CONFIRMED`, `MARKET_CANDLES_SOURCE_NOT_WIRED`, `MANAGER_V2_SOURCE_CONTRACT_REJECTED`, `N17B_SOURCE_REJECTED`, `N23_*`) → panel hiện **`Soon · <mã>`**; `DENIED` giữ là quyền, `STALE`/`terminal` giữ là lỗi; **mã lạ vẫn UNAVAILABLE** để một lỗi mới không lẻn vào chữ "Soon". Footer/notice Trade Replay: `Trading System candles: Soon · <mã>` | `soon.ts`, `states.tsx`, `TradeReplayEvents.tsx` + test |
| **P0-14** | Giữ nguyên các empty state đang trung thực (xem P0-14 đã chỉnh ở §A9.3) — không đổi rỗng-dữ-liệu thành "Soon" | — |

### A10.2 Evidence (đo thật, không suy đoán)
| Gate | Kết quả |
|---|---|
| `scripts/control-api-test.sh` | **50 file · 432 test pass** (gồm restore drill); lần đầu 1 fail do assertion thiếu tham số, đã sửa |
| FE vitest + tsc + build | **109 file · 1933 pass · 1 skipped**; `tsc` sạch; build 6,9 s |
| Hook pre-commit | xanh; push 3 ref |
| **8 route trên dev bằng phiên `claude-probe` (không `?workspace_id`)** | `resources/alphas` · `resources/accounts` · `resources/portfolios` · `derivations/alphas/*/activity` · `views/equity-chart` · `query-analytics` · `views/observed-timeline` · `command-center` = **200/200 (trước: 404 ở 4 route đầu)**; số route lỗi: **0** |
| Trình duyệt (harness A9.1, so trước/sau) | **Paper Workbench 0 → 15 nút, 0 → 2 panel** (trước là trang trắng); **Account 360 1 → 16 nút, 3 → 4 panel**; Alpha 360 Overview 18 → 22 nút; chữ **`Soon`** xuất hiện đúng chỗ: Insight Charts 8, Gate R1/R2 + Exit detail 6, Account 360 4, Overview 3, Trade Replay 1 |
| Không đổi sai chỗ | các tab Positions…Audit mất banner "Alpha resource state" vì resource **đã đọc được** — đúng, không phải mất panel |

### A10.3 Việc mở ra sau khi mở khoá (đưa vào Goal 3/5, đã ghi ở §A9.3)
1. **Portfolio 360 vẫn trống** — nhưng **không phải** do workspace: `GET /portfolios/{id}/capital` trả `404 REQUEST_REJECTED` (sai prefix giữa FE và BE), `correlation` + `capital-ledger` trả `503 ANALYTICS_UPSTREAM_REJECTED`. → P0-16 mở rộng, làm ở **Goal 3**.
2. **Canary / Gate R1 / Gate R2 / Exit detail** vẫn 404 vì id showcase không tồn tại trên dev (nguồn chưa phát hành) — đúng luật `Soon`, không chặn goal nào; nút quyết định vẫn phải dựng (**Goal 5**).
3. **Incident Detail + Admin Action Drawer**: `403 ADMIN_ROLE_REQUIRED` với tài khoản USER và hiện "Withheld" typed — **đúng thiết kế**. Owner nhắc (đúng): không đi xin tài khoản, tự làm — Claude **tự nâng `claude-probe` lên ADMIN trên dev DB** (`update portal_users set role='ADMIN'`, dữ liệu test, hạ lại bằng một câu lệnh) rồi đo. Kết quả: **Admin Action Drawer 0 → 94 nút** (`commands/catalog` trả `total_entries 64`, đủ 64 lệnh theo nhóm READ/MUTATION/DANGER; showcase 98 — còn ~4 chip filter), `operations` 200, `manager/operations` 200. Incident Detail vẫn 404 vì `inc_44` là id của showcase; dev chưa có incident nào → Goal 5 sẽ dùng id thật.

### A10.5 Bổ sung sau khi đo bằng quyền ADMIN — một nút bấm chết (commit `1884b2a`)
`OperationsQueueContainer` mặc định `workspaceId = "default"` và gửi `workspace_id=default`; **"default" không phải một workspace**, nên mọi lượt đọc trả **404** và Operations Queue không có dòng nào trên dev. Đây đúng loại nợ owner nói: nút bấm bên trong không chạy, và chỉ lộ ra khi **đo bằng đúng vai**. Sửa: đọc không nêu workspace (server tự phân giải về workspace projection theo luật Goal 1); **lệnh triage vẫn phải nêu workspace tường minh** — đọc có thể phân giải hộ, mutation thì không — thiếu thì nút Acknowledge/Resolve **disabled** thay vì gửi lệnh sai. Test mới khẳng định cả hai. **Đo lại sau deploy:** Operations Queue **0 → 1 hàng thật**, **4 → 6 nút** (showcase 10 với 7 hàng demo; phần còn lại là chart + phân trang, thuộc P0-11 ở Goal 5).

### A10.4 Cho codex
Đổi mặc định workspace là **thay đổi hành vi có chủ đích** ở 4 controller của codex: caller không nêu workspace nay đọc projection workspace thay vì workspace cá nhân. Hai tính chất cũ giữ nguyên và có test: (a) nêu workspace lạ → 404; (b) không phải member → 404. Nếu codex muốn luật khác (ví dụ chỉ owner được đọc), nói sớm — hiện tại luật này là điều kiện để bất kỳ ai ngoài Bobby dùng được Portal.

## A11. GOAL 2 ĐÃ LÀM (07-09 tối) — điều khiển thật và các màn danh sách

Commit `03ffec8` (chính) · `2d84032` (mặc định window) · `4c1ec3b` (hai lỗi đo được trên dev). Ba ref cùng head; dev rebuild sau mỗi bước.

### A11.1 Giao gì
| Nợ | Trước | Sau |
|---|---|---|
| **P0-2 scope bar** | 4 Select ghi vào state, state chỉ tới **2 caption**; mọi hàng đứng yên; Window hardcode `30d` | Lọc **trên facts, một lần**, trước khi mọi panel dẫn xuất → panel obey theo cấu trúc. Window `30d/90d/1y/All`. Thanh scope nói rõ trục đang lọc và **số hàng bị ẩn**. Không bịa chiều: hàng **không mang** trường đang lọc thì **giữ lại** (chỉ loại hàng mang trường và không khớp) |
| **P0-5 Alpha Fleet** | không filter venue/owner, không sparkline | 2 select từ chính rows (Venue/Owner) + đếm "N of M alphas hidden"; **cột equity 30d**: mỗi hàng tự tải chuỗi **khi mở rộng** (1 request/alpha, không phải 48 khi vào màn), trước đó ghi "expand to load"; chuỗi là chuỗi **đã publish** mà Alpha 360 vẽ, không tính lại |
| **P0-6 Blotter** | chip Brackets/Conditional **chỉ có ở bản smoke** | chip chạy trên **order groups đã publish** (EDS-11R1); ghi rõ: chip nhóm lọc **trang đã tải**, chip status **truy vấn lại server** |
| **P0-7 Accounts & Bindings** | chỉ Previous/Next | 5 filter hi-fi kèm số đếm; phân biệt "không binding nào khớp filter" với "workspace không có binding nào" |
| **P0-17 chip "Mine"** | tôi ghi là nợ | **không phải nợ** — chip đã có (filter `INBOX`, nhãn "Mine (N)" khi server trả `counts.mine`); `view=MINE` trong curl của tôi là **tôi gọi sai**, FE gửi `view=INBOX`. Ghi lại cho đúng |

### A11.2 Ba lỗi chỉ lộ ra khi **đo bằng trình duyệt trên dev**, không phải khi đọc code
1. **Window mặc định 30d ẩn 203/205 hàng.** Khi thanh scope còn là trang trí thì mặc định 30d vô hại; lọc thật thì nó giấu gần hết dữ liệu tháng 8 của dev ngay khi mở màn. Đổi mặc định **All** (`2d84032`) — màn không được nói dối trước khi người đọc bấm gì.
2. **Chip Brackets khớp 0 hàng.** Nguồn có **404 bracket**, nhưng group đặt tên leg bằng `client_order_id` còn hàng Blotter chỉ mang `order_id` số → lọc 21 hàng còn 0. Hàng nay mang thêm client id (ẩn trong bảng, chỉ dùng để khớp nhóm).
3. **Chip Brackets ghi 404 rồi lọc ra 0.** Số trên chip là tổng bracket **của nguồn**, còn chip lọc **trang đã tải** — hai dân số khác nhau đặt cạnh nhau. Nay chip đếm **số hàng của trang đang tải thuộc một nhóm**, và dòng hint nói đủ ba số: bao nhiêu hàng đã tải, bao nhiêu trong số đó thuộc nhóm, và nguồn có bao nhiêu nhóm — kèm lối đi tiếp ("load older rows").
4. **Cả 43 binding bị coi là "Issues".** Vì `credential_state = NOT_PUBLISHED` bị tính là lỗi. "Issue" nay chỉ là trạng thái **nguồn tự gọi là sai** (SUSPENDED/REVOKED/EXPIRED/SYNC_FAILED/MISMATCH…); trường chưa publish thì không phải lỗi.

### A11.3 Evidence (đo trên dev sau deploy)
| Kiểm | Kết quả |
|---|---|
| Scope Alpha 360 | mở màn: "nothing is filtered out right now"; chọn Mode SANDBOX → "mode SANDBOX — 273 rows outside this scope are hidden", bảng Positions về 0 hàng đúng với dữ liệu |
| Scope options | Portfolio 2 · Mode 3 · Venue 2 · **Window 4** (trước 1/1/1/1 → 4 Select bị khoá) |
| Alpha Fleet | Venue/Owner select xuất hiện; lọc venue: 50 → 45 hàng, note "5 of 48 alphas hidden"; mở rộng hàng → **sparkline ECharts** vẽ từ 1 request/alpha |
| Blotter | chip **"Brackets (404)"** hiện từ nguồn thật; hint đổi đúng theo chip đang dùng |
| Accounts | 2 → 7 nút; "Testnet" lọc 43 → 1 hàng |
| Gate | FE 110 file · **1948 test** · tsc sạch · build sạch; hook đầy đủ xanh mỗi commit |
| Pack | script re-pin nay đọc **bảng EVIDENCE_PATHS của chính gate** — lần trước pin tay 2 khoá nên hook từ chối `br72_frontend_test_sha256` |

### A11.4 Còn nợ trong nhóm màn danh sách (đưa sang Goal tương ứng)
- **Cột "next gate" của Fleet**: dev hiện `attentionReasons` (thật) — showcase hiện gate governance ("R2 AP-352 OVERDUE 26h"). Khi governance có hàng thật thì cột này mới có nội dung tương đương → **Goal 5**.
- **Blotter "load older"**: đã có sẵn keyset (`onLoadOlder`); cần kiểm khi trang có `next_cursor` thật → **Goal 5** cùng phân trang Ops.

## A12. GOAL 3 ĐÃ LÀM (07-09 tối) — 12 tile hi-fi và Portfolio 360 Overview

Commit `65b3131` (chính) · `63da0d9` (ba lỗi thấy bằng mắt). Ba ref cùng head; dev rebuild sau mỗi bước.

### A12.1 Insight Charts — đúng 12 tile hi-fi, đúng thứ tự (P0-3)
| # | Tile | Nguồn thật dùng | Trạng thái trên dev |
|---|---|---|---|
| 1 | Equity by stage | `chart_series` equity | **chart** |
| 2 | Drawdown & underwater | `drawdown_overlap.alphas[].series` + overlaps | **chart** (max drawdown −0.001037 @ 2026-07-08, 68d) |
| 3 | Rolling corr vs benchmark | `correlation.pairs` (68d · 43 alphas) | **chart** + `Soon · BENCHMARK_SERIES_NOT_PUBLISHED` |
| 4 | Venue contribution | **performance snapshot của nguồn** (ưu tiên) → fills là dự phòng | **chart** (BINANCE·USDT net −143.54583478) |
| 5 | Execution quality by venue | orders/fills nhóm theo venue + `execution_quality.v1` | **chart** + `Soon · N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED` cho ack latency |
| 6 | Order funnel | `order_funnel.v1` | **chart** |
| 7 | Trade return histogram | `fills.realized_pnl` (page set EDS-11R1) | **chart** — đếm riêng số fill không có realized value, không coi là 0 |
| 8 | Execution density day × hour | `fills.trade_time` → 7×24 UTC | **heatmap** + `Soon · VENUE_SESSION_CALENDAR_NOT_PUBLISHED` |
| 9 | Regime-shaded equity | equity có, nhãn regime chưa | `Soon · REGIME_LABELS_NOT_PUBLISHED` |
| 10 | Paper vs Live drift | cần cả hai phía; dev không có deployment live | `Soon · PAPER_LIVE_DRIFT_NOT_PUBLISHED` kèm danh sách mode thấy được |
| 11 | Risk utilization | `risk-profiles` + `alpha-risk-config` đều bị Manager từ chối | `Soon · N17B_SOURCE_REJECTED` |
| 12 | Cost drag waterfall | `fills.realized_pnl` + `fills.commission` theo **từng currency** | **chart** + `Soon` cho funding và slippage |

Tile phụ của Portal (Exact query surface, Exposure profile, Trade replay journal, observed-timeline, mark-context, Market candles) xếp **sau** 12 tile, đánh số 13+; branch nào đã có tile hi-fi thì **không lặp lại** lần hai dưới tên khác.

### A12.2 Portfolio 360 · Overview — ba panel hi-fi (P0-4)
| Panel | Nguồn | Trên dev |
|---|---|---|
| Equity vs benchmark | `manager/current/portfolio-equity-snapshots` | **chart 4 snapshot**; đường benchmark ghi `Soon · BENCHMARK_SERIES_NOT_PUBLISHED` |
| Cross-portfolio | cùng relation, mọi portfolio | **2 hàng** — first/last equity + **net của chính nguồn**; mỗi portfolio theo base currency riêng |
| Configuration log | `manager/current/portfolio-capital-ledger` | **25 hàng thật**: thời điểm, movement, actor (`bobby`), amount, allocated before → after, reason |

### A12.3 Năm lỗi tìm được, ba trong số đó chỉ thấy khi mở trình duyệt
1. **Gộp facts làm mất dữ liệu**: `combinedFacts` để mảng rỗng của resource ghi đè mảng có dữ liệu của analytics → tile Venue contribution trống dù số nằm sẵn. Nay chỉ ghi đè khi resource **có hàng**.
2. **Số học trên trường vốn**: bảng Cross-portfolio ban đầu lấy `last − first` trên `equity` — gate `analytics.test.ts` cấm đúng tên trường này. Snapshot đã có `net_pnl`, nên bỏ phép trừ và hiển thị số của nguồn.
3. **Tile 1 nói "series not published"** dù chuỗi equity nằm ngay cạnh: tile trả trạng thái mà không trả series. Chỉ thấy bằng mắt.
4. **16 nhãn band chồng lên nhau** trong tile 2 (150 px) thành một vệt xám: giữ nhãn khi ≤3 band, còn lại chuyển số xuống hàng fact.
5. **Cỡ trang cố định 200 làm một relation đọc được thành "không đọc được"**: `portfolio-equity-snapshots` nhận trang **5** và từ chối **8** (`N17B_SOURCE_REJECTED`) — đo trên dev. Drain nay hạ dần **200 → 50 → 20 → 5**, và **không chờ retry** khi đang dò cỡ trang (một nguồn từ chối 200 sẽ từ chối lại sau 1,5 s).

### A12.4 Evidence
| Gate | Kết quả |
|---|---|
| FE vitest | **111 file · 1957 pass · 1 skipped** |
| `tsc --noEmit` | sạch |
| `npm run build` | sạch |
| Hook pre-commit | xanh cho cả hai commit; ba ref cùng head |
| Trình duyệt (dev, tài khoản không phải chủ workspace) | Insight Charts **18 tile · 10 chart**, 12 tile đầu đúng tên và thứ tự hi-fi; Portfolio Overview **3 panel** với chart 4 điểm, 2 hàng cross-portfolio, 25 hàng configuration log |

**Còn treo cho goal sau:** tile 9/10/11 chờ nguồn (regime labels, deployment live, risk profile) — ghi `Soon`, không chặn; console dev còn 502/503 lẻ khi ba màn cùng drain (đã có retry + hạ cỡ trang, sẽ gộp cache ở Goal 6).

## A13. GOAL 4 ĐÃ LÀM (07-09 khuya) — ba màn stage và ba workbench (P0-8, P0-9)

Commit `94d099d` (4a) · `<4b>` (Live Full + Paper panel + gộp derivation). Ba ref
cùng head; dev rebuild sau bước cuối.

### A13.0 Chẩn đoán: không thiếu dữ liệu, thiếu đường dẫn tới panel

Đo trước khi sửa cho thấy Paper Workbench trên dev **2/12 panel**, Sandbox
Overview **0 panel / 0 nút**, Live **0 panel**. Nguyên nhân **không phải** thiếu
nguồn. `GET /screens/paper/{deploymentId}` trả về đủ: `deployment`,
`observation_gate`, 19 order, 10 fill, 1 247 dòng `performance`, 1 438 dòng
`account_equity`, cùng **một envelope query-analytics đầy đủ cho từng
deployment** (chart_series 1 438 điểm, execution_quality, order_funnel 770 lệnh,
correlation 66 cặp, drawdown_overlap 43 alpha).

Toàn bộ 12 panel của màn đã tồn tại từ phase 4 — nhưng nằm trong nhánh
`{hifi ? …}`, mà `hifi` chỉ được truyền từ phòng lab. Sản phẩm không bao giờ
truyền nó, nên dev rơi xuống nhánh dự phòng: một chart và không gì khác. **Đây
không phải bản rút gọn của màn, mà là một màn khác.**

### A13.1 Nguồn thật đã khai thác

| Màn | Nguồn | Kết quả trên dev |
|---|---|---|
| Paper Workbench | `screens/paper/{id}` (deployment, observation_gate, orders, fills, positions, performance, account_equity, query_analytics) | 12 panel; chart equity **1 438 snapshot** kèm drawdown; gate 50/30 ngày · 10/300 lệnh |
| Paper Overview | `derived_insights` (cumulative_return, order_funnel_7d) | 4 panel — panel 4 ghi `Soon` vì chưa có lịch sử rời stage |
| Sandbox Overview | relation `broker-account-sync-current-state` (1 hàng), `reconciliation-findings` (3 hàng), `orders` (COMPLETE, 0 hàng) | 3 panel + bộ lọc theo `state` thật |
| Live Overview | `screens/live` (mọi nhánh EMPTY — không có deployment live) | bộ lọc All/Full/Canary/Issues, chip 0 thì **disabled kèm lý do** |
| Live Full | `deployments/{id}/live` (broker_consistency, projection_continuity, command_policy, lifecycle) | 2 panel: broker truth và protective actions |

### A13.2 Ba lỗi trong container thật, chỉ lộ ra khi gộp derivation

Container được route là `PaperWorkbenchRichContainer`, không phải
`PaperWorkbenchContainer` (hàm này **không có ai gọi** — code chết, đã trả về
nguyên trạng). Khi gộp về một `paperWorkbenchData` dùng chung thì ba lỗi lộ ra:

1. **`active === true` được đọc thành `READY`** — đúng lỗi ACTIVE ≠ READY mà
   guide §6 cấm. Trên dev nó *trông* đúng chỉ vì gate tình cờ có `reason_code`
   đi kèm; nếu gate không phát mã lý do thì một deployment đang chạy sẽ hiện
   READY. Nay readiness là verdict của server.
2. **Tiêu chí chưa đạt chỉ liệt kê khi `NOT_MET`** — dev phát `PARTIAL`, nên nút
   ghi "blocked: 1 gate criteria unmet" mà **không nêu tiêu chí nào**. Nay nêu
   đủ, kể cả `window_bounded` (nguồn giữ ít lịch sử hơn policy hỏi — chờ thêm
   cũng không đóng được gate).
3. **Panel "Portfolio contribution" bị đổ 4 trường execution-quality đầu tiên** —
   một phép đo khác dưới tiêu đề của người khác. Nay dùng correlation/drawdown
   của chính nguồn, phần portfolio ghi `Soon`.

### A13.3 Một quyết định đi ngược yêu cầu bề mặt, và lý do

Goal 4 yêu cầu Live Full có Halt / Reduce / Emergency close **disabled kèm lý
do**. Nhưng `command_policy` phát `visible: false` cho cả nhóm protective, và
repo **đã có contract test** nói nhóm invisible thì phải **vắng mặt**, không
phải làm mờ. Luật đó đúng và nó thắng: một nút chạm vào vốn thật mà vẫn tồn tại
là nút người vận hành sẽ với tay tới giữa sự cố, và làm mờ chỉ dời thời điểm
phát hiện sang lúc tệ nhất. Panel vì vậy **nói bằng chữ** ba nút nào đang bị
giữ lại và trích mã blocker của chính policy (`PRODUCTION_COMMAND_INACTIVE`).
Khi policy cho `visible: true` thì nút hiện như cũ, disabled cùng mã đó.

### A13.4 Những chỗ ghi `Soon` (không chặn phase nào)

| Chỗ | Mã nguồn phát |
|---|---|
| ACK latency (Paper Workbench, Sandbox connectivity) | `N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED` |
| Drift vs approved research evidence | `N28_RESEARCH_EVIDENCE_JOIN_NOT_ACTIVATED` |
| Portfolio contribution của deployment | `N28_PORTFOLIO_EQUITY_NOT_PUBLISHED` |
| "Left paper 90d" và "Recently certified" | `N28_STAGE_EXIT_HISTORY_NOT_PUBLISHED` |
| Canary Control Room | dev trả `CANARY_ENVELOPE_NOT_FOUND` — **không có deployment canary**, đây là sự thật chứ không phải lỗi |

### A13.5 Evidence

| Gate | Kết quả |
|---|---|
| FE vitest | **112 file · 1 972 pass · 1 skipped** |
| `tsc --noEmit` | sạch |
| `npm run build` | sạch |
| Hook pre-commit | xanh cho 4a; 4b bị `br72_frontend_containers_sha256` drift một lần vì sửa file sau khi repin, gộp lại thành một commit sạch |
| Trình duyệt (dev) | đo lại sau bước rebuild cuối — ghi vào A13.6 |

### A13.6 Đo bằng trình duyệt sau rebuild (dev `911ccb9`)

| Màn | Panel dev | Panel showcase | Nút dev | Nút showcase | Hàng dev |
|---|---|---|---|---|---|
| Paper Overview | **4** | 4 | 43 (mỗi deployment một hàng bấm được) | 8 | 43 deployment |
| Sandbox Overview | **3** | 3 | 2 chip lọc (`All 35`, `ACTIVE 35`) | 7 | 39 |
| Live Overview | 0 | 0 | **4 chip, cả 4 disabled kèm lý do** | 6 | 0 (không có deployment live) |
| Paper Workbench | **7 panel + 7 tab** | 12 | 11 (Lin/Log/1W/ALL/Table/Expand/Export + exit + tab) | 13 | 19 order |
| Sandbox Certification | 5 | 18 | 6 | 11 | 0 |

**Paper Workbench — nhìn tận mắt** (ảnh `wb_full.png`, 1440×2552):
KPI `Equity 20,000.00 USDT · Net PnL 122.30519373 USDT · Drawdown 0.00 ·
Trades 10 · Projection age FRESH`; chart equity **1 433 mẫu** với caption ghi
đúng downsample của nguồn (`30d · 3632s buckets · PER_SERIES_BUCKET_EXTREMA ·
6619 → 1433`); Observation gate `50/30 days · 10/300 trades · 0/1 sessions` và
nút `Request Paper Exit Review — blocked: 2 gate criteria unmet` **nêu đủ hai
tiêu chí** ngay dưới; Accounting 10 dòng; contribution `ρ -0.43 vs
burst_paper_alpha · 29 overlapping days`; tab Orders hiện **19/19 lệnh** với
`REDUCE_ONLY_WOULD_INCREASE_LONG` màu đỏ; Execution quality `19 submitted · 11
filled · 1 risk rejected · reject rate 1/19 · latency UNAVAILABLE`.

**Sandbox — nội dung ba panel thật**: order journal *"The orders relation
answered for sandbox and returned no row"* (rỗng thật, không phải lỗi); Venue
connectivity **1 tài khoản** `binance_testnet_main · BINANCE · BINANCE_FUTURES`
kèm buying power và last sync; findings **0 open of 3** với đủ severity/status/
thời điểm.

**Một lỗi trợ năng tự tìm ra khi đọc DOM**: panel thứ ba mang `aria-label`
"Recently certified" trong khi tiêu đề hiển thị là "Reconciliation findings" —
người dùng screen reader nghe một đằng, nhìn thấy một nẻo. Đã sửa cho khớp.

**Lưu ý về công cụ đo, không phải về sản phẩm**: `parity2.js` báo Paper
Workbench 0 panel trong lượt chạy 5 route liên tiếp, nhưng mở thẳng route đó thì
`main` chứa **7 section**, cao 2 552 px, không có lỗi console và không có API
4xx. Nguyên nhân là `networkidle` trên một màn có polling; số liệu bảng trên lấy
từ lượt mở thẳng.

**Còn nợ sang goal sau:** Paper Workbench còn 5 panel hi-fi chưa có nguồn
(market-candles overlay, regime, benchmark) — Goal 7; Sandbox Certification 13
panel còn lại phụ thuộc **chưa có certification record** (`workflow_state:
NOT_COMMISSIONED`, cả 7 bước `PHASE2_CERTIFICATION_RECORD_NOT_CREATED`) → Goal 5;
Canary Control Room chờ có deployment canary.

### A13.7 Kiểm lại trước Goal 5 — một lỗi hiệu năng tìm được bằng đồng hồ

Rebuild xong tôi bấm lại từng màn thay vì tin bảng số. Paper Workbench **20.6
giây** mới hiện panel đầu, suốt thời gian đó chỉ có chữ "Loading". Dấu vết đo
trên dev:

```
 413ms  GET /screens/paper/{id}        <- màn tự đọc
 968ms  GET /screens/paper/{id}        <- đọc lại, y hệt
7536ms  200, 7.02 MB                   <- phản hồi lần 1, bị vứt
20628ms 200, 7.02 MB                   <- phản hồi lần 2
20630ms panel đầu tiên hiện
```

**Nguyên nhân**: `bootstrap` của kênh realtime lấy snapshot để lấy cursor cho
stream, rồi đẩy nó qua `updateFrom` — hàm này bump `refreshKey` cho mọi thứ
không phải heartbeat. Mọi màn profile khoá lần đọc theo `refreshKey`, nên **chỉ
cần stream kết nối là tất cả đọc lại**, đúng lúc lần đọc đầu còn đang bay; mà
`useApiRead` huỷ lần đọc đang bay khi deps đổi, nên phản hồi đầu bị vứt. Hai
lần đọc 7 MB xếp hàng ở server và người dùng chờ cả hai.

Snapshot bootstrap là **cái bắt tay, không phải delta**: nó nói chưa có gì xảy
ra, và màn vừa tự đọc dữ liệu xong. Nay nó không refresh nữa. Bootstrap **sau
một gap** thì vẫn refresh, vì dữ liệu có thể đã đổi lúc stream chết.

| | Trước | Sau |
|---|---|---|
| Paper Workbench, panel đầu | 20.6s | **6.1s** |
| Số lần đọc profile khi mở | 2 | **1** |

Kèm theo: `keepValue` cho workbench và ba màn overview, để một tick sau đó
refresh tại chỗ thay vì kéo màn về skeleton — đúng cái `useApiRead` đã tự ghi
trong comment là "live data feels broken".

**Chưa sửa, và không sửa ở frontend được**: 7 MB + ~6s cho workbench của **một**
deployment. Màn cần snapshot mới nhất và một chuỗi đã downsample, không cần
1 438 dòng × 29 cột. Đây là việc của contract → **Backend request cho codex**,
vì cắt ở trình duyệt nghĩa là đã tải về rồi mới cắt.

**Còn một chỗ nữa Bobby sẽ thấy trong console**: Portfolio 360 có 502/503 ở
`capital-ledger`, `correlation` và `portfolio-equity-snapshots` khi ba màn cùng
drain. Retry phục hồi được nên **ba panel vẫn có dữ liệu thật**, nhưng tiếng ồn
là thật → gộp cache ở **Goal 6**.

### A13.8 Owner giao làm backend hai chỗ (08-09) — payload và tiếng ồn 5xx

Bobby: *"Bạn cũng là backend mà, làm luôn chỗ này nhé"*. Cả hai đã sửa ở đúng
tầng, không đẩy sang codex.

#### 1. Payload workbench 7.0 MB → 1.88 MB

Đo theo từng khoá trước khi cắt:

| Phần | Trước | Sau | Vì sao |
|---|---:|---:|---|
| `query_analytics.analytics.source_facts` | 3.88 MB | **0** | 15 nhóm fact phục vụ Trade Replay ở màn 360; workbench **không đọc nhóm nào**. `query()` nay nhận `sourceFacts: false`; nhóm được **làm rỗng, không xoá** để reader kiểm `source_facts.orders.length` không phải kiểm thêm sự tồn tại của trường |
| `performance` depth 30 ngày | 1.32 MB | **0** | Không panel nào vẽ chuỗi performance; panel Accounting đọc **dòng mới nhất**, mà trang relation bounded đã có. Còn **một** history query thay vì hai |
| `account_equity` depth | 1.44 MB | 1.44 MB | **Giữ nguyên** — đây là chuỗi chart equity thật sự vẽ, và directive của owner 2026-09-03 nói rõ màn phân tích hiện chuỗi sâu nhất có thật |

#### 2. Correlation toàn fleet tính lại cho mọi subject

Payload xuống 1.88 MB rồi mà vẫn 4.6s, và thời gian **không phải** ở truyền tải:

```
/screens/paper                     0.79s
/deployments/{id}/query-analytics  3.13s
/screens/paper/{id}                4.57s
```

3.1s là `portfolioStatistics`: 90 ngày daily closes toàn fleet, correlation 43
alpha (**903 cặp**), drawdown overlap. **Subject không hề tham gia phép tính
đó** — mọi workbench và mọi alpha 360 đều tính lại y hệt. Nay memo hoá theo
**epoch + sequence của chính projection**, nên cache **không thể** trả số cũ hơn
dữ liệu nó mô tả (projection refresh → sequence mới → miss). Lỗi không được
cache.

#### Kết quả đo trên dev

| | Trước | Sau |
|---|---:|---:|
| Payload workbench | 7.00 MB | **1.88 MB** |
| Panel đầu tiên hiện (browser) | 20.6s | **4.1s** |
| `/alphas/{id}/query-analytics` | 2.90s | **1.19s** |
| Workbench warm | 6.6s | **3.5s** |

#### 3. Còn lại: một defect của nguồn, không vá sâu

`portfolio-equity-snapshots` nhận **đúng 5 dòng** và từ chối **6** trở lên
(`N17B_SOURCE_REJECTED` / `MANAGER_V2_SOURCE_CONTRACT_REJECTED`) — bisect trên
dev 2026-09-08 — **trong khi tự khai `maximum_page_rows: 200` và
`has_more: true`**. Projection worker cũng vấp đúng chỗ này
(`execution_profile_projection_relation_failed`), và đó là lý do relation này
không có trong local projection.

Tôi **không** dựng thang retry trong đường dẫn nguồn dùng chung để che: đoán sai
cỡ trang thì trả về trang thiếu mà vẫn báo khoẻ. Thay vào đó walk **nhớ cỡ trang
nguồn đã nhận**, lưu `sessionStorage` để sống qua reload — dò một lần thay vì
một lần mỗi drain.

**Backend request cho codex (kèm bằng chứng):**
1. `portfolio_equity_snapshots` và `sizing_decisions` bị Manager v2 từ chối —
   relation tự mâu thuẫn với manifest của nó.
2. `/internal/v1/screens/portfolio-360/{id}/correlation` và `/capital-ledger`
   trả **503** trên profile này. Portal đang hiện typed state trung thực (panel
   Overview vẫn có dữ liệu thật từ relation), nhưng hai route này chưa phục vụ
   được. Không che 503 thành 200 vì upstream **thật sự** đang nói unavailable.

### A13.9 Owner: *"đừng request nữa, cùng nhau làm rồi viết vào"* — ba lỗi đã sửa, và pass động/màu

Bobby bác việc đẩy sang codex. Ba lỗi của Portfolio 360 đã **sửa trong Portal**,
không còn request nào treo.

#### 1 & 2. `capital-ledger` và `correlation` — phục vụ tại chỗ

Upstream `/internal/v1/screens/portfolio-360/{id}/…` trả **503** trên profile
này. Nhưng Portal **đã có** cả hai dữ kiện, nên nay tự phục vụ
(`Portfolio360LocalService`), upstream chỉ còn là dự phòng:

| Route | Nguồn Portal | Kết quả trên dev |
|---|---|---|
| `correlation` | cùng 90 ngày daily closes mà analytics envelope dùng, lọc theo strategy của portfolio | **42 label · 55 cặp**, hệ số thật (0.997 giữa `combine_weight_sl_tp_0011h` và `sl_tp_map_ma_00115m_binance` trên 66 ngày chung) |
| `capital-ledger` | relation `portfolio-capital-ledger` — đúng cái Configuration log đang vẽ | **1 bucket USDT · 42 entry**, gross increase 11 360 000, before → after đầy đủ |

Hai luật giữ trong file đó, vì chúng quyết định số có đáng tin không:
- **`direction` đọc từ allocation, không từ dấu của `amount`.** Reader của hợp
  đồng cấm đoán direction; ở đây nó do so `before_allocated` với
  `after_allocated` — hai số nguồn tự phát. Thiếu một trong hai thì **bỏ dòng**,
  không đoán.
- **Cộng số thập phân bằng BigInt trên chuỗi** — không float nào chạm vào một
  con số vốn.
- Clustering để **rỗng**: không nguồn nào phát, và suy ra cụm từ hệ số là
  service tự quyết định cấu trúc của portfolio.

#### 3. Cursor bị từ chối — tìm ra quy luật thật

Đi hết relation bằng thang cỡ trang (dev 2026-09-08: 9 request, 8 từ chối, 5
dòng): `portfolio-equity-snapshots` có **đúng 5 dòng**, khai `has_more: true` ở
cuối, rồi **từ chối chính cursor nó vừa phát — ở mọi cỡ trang, xuống tận 1**.
Không phải "limit > số dòng còn lại" như tôi đoán lúc đầu.

Portal nay **không hỏi lại một cursor đã bị từ chối**. Khoá theo **chính
cursor**, không theo relation: dữ liệu đổi thì trang một phát cursor mới và
cursor đó được thử — nguồn nào sửa được sẽ tự động dùng lại, không cần mở tab
mới. Đã ghi lý do `CONTINUATION_REFUSED_BY_SOURCE` thay cho một 502 lặp.

#### 4. Pass động, màu, highlight so với showcase

Đo cả hai bên. Showcase có **`om-tick` + `om-pulse`** trên gần hết màn danh
sách (chấm sống cạnh authority); dev có **0**. Nguyên nhân: `exec-af-livedot`
chỉ được render **trong nhánh demo** — nhánh dữ liệu thật không có.

Không chép chấm xanh nhấp nháy một cách vô điều kiện, vì đó là kiểu chuyển động
tệ nhất: **màn trông sống trong khi stream đã chết**. Chấm nay buộc vào
**phase thật của kênh realtime**:

| phase | chấm | ý nghĩa |
|---|---|---|
| `live` | xanh, **nhấp nháy** | stream đang giao delta |
| `connecting` / `recovering` | vàng, đứng yên | giá trị là lần đọc gần nhất |
| `closed` / `auth_expired` | đỏ, đứng yên | sẽ **không** tự cập nhật nữa |
| không có | xám, đứng yên | không có stream nào mở |

Portfolio 360 đọc cả ba book nên lấy **phase tệ nhất** — một live stream chết
không được nấp sau một paper stream khoẻ.

**Màu**: showcase tô trạng thái trong bảng (`good/warn/bad/mute`), dev để chữ
trơn — deployment HALTED và ACTIVE trông giống nhau tới khi đọc chữ. Thêm
`sourceTone()`: **màu là kênh thứ hai chồng lên chữ, không thay chữ**, và một
từ trạng thái lạ được vẽ **trơn chứ không đoán** — tô xanh chỉ vì nó không nằm
trong danh sách xấu chính là cách một màn nói dối rằng deployment đang khoẻ.

**Một lỗi của chính tôi, sửa ngay sau khi đo**: lần đầu tôi khoá "cursor đã bị
từ chối" theo **chính cursor**. Đo lại thì vẫn 1 lỗi mỗi lần vào — vì Portal
**cấp continuation id mới mỗi lần đọc trang một**, nên khoá đó không bao giờ
khớp lại chính nó. Nay khoá theo **relation** kèm **TTL 10 phút**: im lặng giữa
các lần drain, nhưng vẫn tự thử lại, nên nguồn nào được sửa sẽ tự dùng lại mà
không cần mở tab mới.

**`om-pulse` — nhãn "cần chú ý"**: showcase nhấp nháy con số Halted / Findings /
Issues. Dev nay cũng vậy, **nhưng chỉ khi con số khác 0**: một số 0 nhấp nháy
dạy người vận hành bỏ qua đúng cái số đáng nhìn.

Gate: FE **113 file · 1 981 test**, tsc sạch; control-api `src` build sạch.

### A13.10 Pass tinh chỉnh UI theo 5 điểm owner đưa (08-09)

Đo trước, sửa sau. Commit `26e6c4b`, `3c838ec` (+ commit số thập phân).

#### 1. Nhãn stage — một cỡ ở mọi màn ✅

Audit từng màn cho bốn chữ PAPER / SANDBOX / CANARY / LIVE:

| Nơi | Trước | Sau |
|---|---|---|
| Alpha Fleet (`exec-af-stage`) | **10px mono** ← mẫu anh chọn | 10px mono |
| Masthead workbench (`exec-chip[data-axis=stage]`) | 12px, letter-spacing khác | **10px mono** |
| 360 (`exec-env`) | 12px | **10px mono** |

Cùng một token màu (`--env-*`) nên không thể lệch lại. **Nhấn mạnh bằng weight,
viền và chấm chạy — không bao giờ bằng cỡ**, vì chip to hơn đẩy cả hàng lệch.
Thêm `StageLabel` cho các dòng nguồn ghi stage bằng chuỗi tự do.

#### 2. Chart Insight — tile 10 dựng lại trên dữ liệu thật ✅ (9/11 vẫn thiếu nguồn)

Tile 10 trước ghi `Soon · PAPER_LIVE_DRIFT_NOT_PUBLISHED · modes seen: paper` —
**sai hai lần**: alpha này deploy ở **cả paper và sandbox**, và không thiếu công
thức mà thiếu đầu vào.

Hai sự thật quyết định tile này được vẽ gì:
- **Không relation execution nào mang research run id hay artifact digest** mà
  deployment được duyệt theo. Nên drift-vs-approved-evidence **không tính được**,
  và được **nêu tên** chứ không xấp xỉ từ các stage — xấp xỉ là một phép đo khác
  dưới tiêu đề của tile.
- Nhưng **cùng một strategy có chạy giống nhau ở từng stage không** thì tính
  được, và đó mới là câu người vận hành hỏi ở đây.

`alphas/{id}/stage-drift` đọc daily closes của mọi stage **trên cùng một lưới
ngày**: ngày thiếu ở một stage là lỗ của stage đó, không phải dịch chuyển của
stage kia, và để `null` chứ **không carry-forward** — đường phẳng vẽ đè lên lỗ
là lời khẳng định ổn định mà không ai đo.

Trên dev nó nói ngay điều đáng biết:

| stage | kết quả |
|---|---|
| paper | 28 daily closes, 19 997.87 → 20 000 |
| sandbox | **có deployment, nhưng không phát equity nào trong cửa sổ** |
| live | không có deployment |

Tile 9 (regime labels) và 11 (risk profile) **thật sự chưa có nguồn** — giữ
`Soon` kèm mã.

#### 3. Tooltip chart — một hộp duy nhất ✅

Trước mỗi chart tự viết: ISO thô kèm ms và `Z`, `as_of` lặp lại **bên trong hộp
mà người đọc mở ra để xem một con số**, hàng canh lệch nhau ở từng tile.
`chartTooltip` nay là hộp duy nhất: **dấu thời gian tới giây**, giá trị
**canh phải, tabular** nên hai series đọc thành một cột, provenance một dòng
lặng. **Bỏ `as_of`** — caption của tile đã mang envelope rồi.

#### 4. Datetime và số ✅ (realtime giá/PnL: **chưa**)

- **`utcStamp` bỏ millisecond** (owner 2026-09-08, thay quyết định 08-30). Ba
  chữ số đuôi có ở mọi hàng của mọi bảng, không ai đọc, mà tốn đúng phần canh
  hàng của những số có đọc. Chuỗi gốc chính xác vẫn nằm ở `title`.
- **`components/cells`**: `Stamp · Money · Qty · Ratio · Count` — Alpha 360
  từng hiện `2026-07-28T00:30:06.551061Z` và `0.079000000000000000` cạnh một
  workbench hiện cùng hai sự kiện đó bằng hai cách khác. Nay một bộ.
- **Tiền tối đa 4 chữ số thập phân**: cột PnL từng xếp `123.19605`, `89.3469`,
  `4,332.5415`, `28,579.6057488` chồng lên nhau — bốn thang trong một cột cùng
  đơn vị. **Ngoại lệ giữ cho trung thực**: giá trị nhỏ tới mức 4 số sẽ làm tròn
  thành 0 thì **giữ thang riêng tới 8** — in `0.0000` cho một phí thật
  `0.00001234` chính là lỗi null-hiện-thành-0 mà surface này cấm.

#### 5. Alpha Fleet — equity 30D hiện luôn ✅

Trước: một request cho **mỗi** alpha, chỉ bắn khi expand (50 dòng = 50 lượt
đọc), cột ghi "expand to load". Nay `alphas/equity-sparklines` trả **toàn bộ 43
series trong một lượt đọc** từ chính daily closes mà fleet statistics đã nạp —
**0.96s, một request**.

**Và một lỗi im lặng lộ ra khi nhìn**: dù đã có dữ liệu, cột vẫn **trống** —
43 canvas trong DOM, không nét nào. `SparkLine` đặt điểm trên **trục thời gian**
mà Fleet truyền `"0"`, `"1"`, `"2"` — vị trí trong dãy, không phải mốc thời
gian. Mọi điểm rơi vào cùng một toạ độ không đọc được, ECharts vẽ đường dài 0 và
**không báo lỗi gì**. Nay dãy chỉ-là-hình-dạng dùng trục category. Chuỗi phẳng
(equity không đổi) cũng từng vô hình vì min = max — nay được chừa chỗ, vì
"equity alpha này không đổi" **là một câu trả lời** và phải trông như một câu
trả lời.

**Chưa làm**: giá và PnL nhảy realtime ở Alpha Fleet / Portfolio. Hiện hai màn
đã re-đọc theo delta của projection stream (`keepValue`, không giật về skeleton),
nhưng chưa có tick giá theo từng giây. Ghi lại để làm, không nhận là đã xong.

**Ba gate bắt đúng lỗi của tôi trong pass này**: type-role scale từ chối một
font token mới, từ chối `text-transform: uppercase` ngoài role `th`, và từ chối
một khai báo `font-size` lạc. Cả ba đều là lỗi của tôi và gate đều đúng.

### A13.11 Vòng tinh chỉnh thứ hai (08-09) — All mặc định, tick động, và hai tile trống

Commit `36dc7fa`, `bd58574`, `4fcd3f7`.

#### 1. "All" trước đây là nói sai ✅

Selector ghi **All** trong khi server **kẹp mọi lượt đọc phân tích ở 30 ngày**,
mà mirror giữ **67 ngày**. Chart vẽ một tháng dưới caption ghi "All" là tệ nhất
trong hai đằng, vì người đọc **không có cách nào biết**.

| | Trước | Sau |
|---|---:|---:|
| Workbench equity | 30 ngày · 1 424 dòng | **49 ngày · 1 600 dòng** (từ 29 322 dòng nguồn) |
| Stage drift | 28 ngày | **50 ngày** (18-07 → 05-09) |
| Cột EQUITY 30D ở Fleet | 30 ngày | **giữ 30** — header của nó ghi ba mươi |

Mỗi envelope nay báo **khoảng thật sự trả về**, không phải khoảng đã hỏi.

#### 2. Tick động — `useChangeFlash` ✅ (equity liên tục: **additional, đang chờ nguồn**)

Showcase tick liên tục vì được nuôi bằng đồng hồ demo. Chép y thế lên dữ liệu
thật là **diễn**: nó nói "đang có chuyện" trong khi không có, và khi người đọc
học được điều đó, họ **thôi nhìn đúng vào lúc thật sự có chuyện**.

Nên chuyển động duy nhất là **nháy khi giá trị đổi thật**: hướng nằm ở màu, còn
cái nháy mang thông tin "nó đã đổi". Delta nào không đụng tới một con số thì con
số đó đứng yên. **Yêu cầu additional của owner được ghi nhận**: khi equity
projection phát liên tục, chính những con số này sẽ động liên tục **mà không cần
sửa thêm dòng nào** — cái nháy bám dữ liệu, không bám timer.

**Một lỗi trong chính hook đó, do test của nó bắt**: `Number(null)` là 0, nên
một con số **mất giá trị** bị đọc thành **rơi về 0** và nháy đỏ — đúng lỗi
null-hiện-thành-0 khoác màu. Nay chỉ khẳng định hướng khi **cả hai vế đều thật
sự là số**; mất giá trị vẫn nháy vì đó là thay đổi, nhưng **không có hướng**.

#### 3. Hai tile Insight trống — soi từng cái ✅

| Tile | Chẩn đoán | Kết quả |
|---|---|---|
| 9 regime-shaded | không nguồn nào phát regime label | `Soon` — đúng |
| 11 risk utilization | Manager từ chối relation risk | `Soon` — đúng |
| 15 replay journal | EDS10 replay source gap, đã xác nhận | `Soon` — đúng |
| 18 market candles | EDS10 OHLCV source gap, đã xác nhận | `Soon` — đúng |
| **16 observed-timeline** | khai PARTIAL mà **không có nhánh vẽ** | **đã sửa** |
| **17 derived-mark-context** | khai PARTIAL mà **không có nhánh vẽ** | **đã sửa** |

Hai cái cuối in "the branch answered with no rows for this window" **đè lên
6 407 entries nằm cách đó một component** — payload của chúng không đi trong
analytics envelope mà đến từ `/views/observed-timeline`, route mà **chính màn
này đã đọc** cho panel bên dưới.

**Và một lần sửa hụt, đo lại mới thấy**: lần đầu tôi cho panel *chuyền ngược*
trang lên cho tile. Nhưng panel đó nằm ở **tab Trade Replay** — nên tile chỉ có
dữ liệu sau khi ai đó mở đúng tab kia, một phụ thuộc không người đọc nào nhìn
thấy hay suy ra được. Nay **màn sở hữu lần đọc**: một request, panel vẽ nó, hai
tile lấy cùng trang, mở tab nào cũng có.

#### 4. Hai lỗi từ ảnh chụp của owner ✅

- Masthead Alpha/Portfolio 360 in `as_of 07:38:55.978714Z` — giờ trần kèm micro
  giây, cắt thô từ chuỗi ISO. Nay dùng đồng hồ chung: `2026-09-08 08:24:01 UTC`.
- Alpha không có label bị đặt tiêu đề **"Unnamed alpha · adaptive_hma_cpp_00115m"**
  — gọi tên sự vắng mặt hai lần. Nay dẫn bằng chính id và ghi nhỏ
  "no label published" ở chỗ đáng lẽ là tên.

## A3. Luật vận hành kế hoạch này

1. Mỗi phiếu chấm trong ≤1 ngày từ lúc codex giao; trượt → DR mới + codex sửa
   trong phase đó, không nợ sang phase sau.
2. Kết quả (PASS/FAIL + bằng chứng) ghi vào đúng phiếu ở file này — Bobby đọc
   MỘT file biết toàn cục; tracker §2/§4 lật ô tương ứng cùng commit.
3. Thứ tự chấm = thứ tự codex giao; không chấm chay khi chưa có vật giao —
   trừ L1 (đã xong) và A-07b (việc FE độc lập).
