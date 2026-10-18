# Review2-06 — Thuật ngữ, vocabulary cờ, và copy audit (critic, chỉ đọc)

Phạm vi: `hifi/m01–m10`, `hifi/concepts/c1–c4`, `hifi.css/js`, UXM-01 §3–§4, README, V1_SCREEN_REVIEW, guide v1.1 §6–§14, CLAUDE.md §3.
Cách đọc: trích toàn bộ text nhìn thấy (bỏ script/style) + chuỗi trong script + `hifi.js` (regex gán cờ). Số đếm là số thật từ trích xuất; "~" là ước lượng.
Lưu ý: không tìm thấy câu "stage names verbatim" trong CLAUDE.md §3; quy tắc dưới (§1.3) là suy ra từ §3.3 + D4 ("bám chữ hi-fi"), cần Bobby xác nhận.

## 1. Glossary: một khái niệm, nhiều tên

### 1.1 Bảng đồng nghĩa và thuật ngữ chuẩn (canonical)
| # | Khái niệm | Các tên đang dùng (màn) | Chuẩn đề xuất | Ghi chú |
| - | --- | --- | --- | --- |
| G1 | Trang tổng quan | Overview (nav, M01); "My overview" (researcher); "Command Center" (V1, README, UXM-01) | **Overview** | Researcher: giữ tên "Overview" + banner "Your slice only", bỏ "My overview/My portfolios" |
| G2 | Miền vốn thật | "Live" (selector M01/M02/M03/c1); "Real-funded" (M05 selector, M01 chip, M04, M06); "Real" (M02 cột Domain); "actual" (M05, M09) ; "Mainnet" (M06) | **Real-funded** (domain); "Live" chỉ là tên stage | Hiện "Live" = domain (Live+Canary) lẫn stage Live: M03 tab Live=38 vs env Live. URL `env=live` giữ nguyên |
| G3 | Miền mô phỏng | Paper / Sandbox / "Simulated" / "Virtual funds" / "sim" / "Testnet" / "Paper twin" / "Paper monitor" | **Simulated** (domain); Paper, Sandbox = stage; "Virtual funds" chỉ ở c2 | "Paper monitor" (M08) khác "Paper" stage: giữ, luôn đi với "simulated" |
| G4 | Hàng đợi cần người quyết | Approval Inbox (nav, M09 link); Decisions (M09 tab theo S3, c4 "Decision cockpit"); Approvals (M04 tab); Waivers, Exit Reviews (nav); "Needs my approval" | **Approvals** (hàng đợi); **Decision** = hành vi/kết quả ghi lại (Approve/Reject) | 14× "Inbox", 11× "Decision", 17× "Approval": 3 từ cho một danh sách. Xem N2 |
| G5 | Việc cần người xử lý | Exceptions (M09 tab/KPI); Incidents (M04 tab, INC-0318); INCIDENT tag (M01); "Needs attention" (M01 panel, Health value, M08); "Attention" (M01 bảng) | **Incident** (có ID INC-) ; "Needs attention" chỉ là giá trị Health | M04 INC-0318 "Valuation not reconciled" = M09 exception "Unreconciled valuation": cùng sự việc, hai tên. "Findings": 0 hit |
| G6 | Bằng chứng lệnh | Receipt (M09 cột trạng thái; M05 cột "Receipts" = số đếm; M05/c2 "rc-8812" = ID); "Outcome" (M04 "Outcome unknown"); "Applied" | **Receipt** = bản ghi của trading system; trạng thái = cột "Receipt"; ID = "Receipt ID"; đếm = "Linked receipts" | "Accepted" (M04) ≠ Applied |
| G7 | Trạng thái hiển thị sau lệnh | "Reconciliation" (M09 cột, giá trị Catching up/Current); "Read side" (M04, Current/Catching up/Status lookup); "Display updating" (M09 Next); "Reconciling" (M06/M07 sổ cái) | **Display** (Current / Catching up / Resync needed) cho projection; "Reconciliation" chỉ cho khớp sổ cái/venue | Va chạm thật: cùng chữ "Reconciliation" = hai nghĩa trong M09 vs M06. Xem N7 |
| G8 | Giá trị vốn | "Net asset value" (M01 KPI, 2×); "NAV" (12×); "Current NAV"; "Economic capital" (17×: M02, M04, M01 capital); "Current total" (M01 bảng); "Equity" (chart); "Account balance" (M06); "Balance" (M03); "Venue balance, total" (M04); "Wallet balance · shared"/"Native equity"/"Native custody" (M06) | **Net asset value** (NAV) cho portfolio/fund; **Account balance** (sleeve, nội bộ); **Venue balance** (whole account, native) | M04: "Economic capital 612,480.40" = NAV nhưng đặt tên khác M01. Bỏ "Economic capital" khỏi nhãn (để tooltip alias) |
| G9 | Hạn mức/phân bổ/vốn | Allocation (cột số tiền M03/M04/M06), "Allocations" (cột **số đếm** M02), "Allocated capital" (M02), "Allocated" (M04 khối Budget), Budget (21×), "Approved budget", "PM capital" (M06 = budget), "Virtual allocation" (M08), "Budget used" (M01/M06), Capital (khối) | **Capital** = tiền thật (initial/added/returned/NAV); **Budget** = hạn mức quản lý đặt, không phải tiền; **Allocation** = budget gán cho 1 alpha/deployment | "Allocated capital" → "Allocated budget"; "PM capital" → "Budget"; "Allocations" (đếm) → "# allocations"; "Virtual allocation" → "Simulated budget". Xem N5 |
| G10 | Chiều "stage/mode/env/domain" | env=live/paper/sandbox (URL, selector); stage = Live/Canary/Sandbox/Paper; domain = Real/Real-funded/Simulated; "Environment: Mainnet" (M06); "Domain" (M02 cột); "mode" (V1) | **Domain** (Real-funded/Simulated) = selector trên cùng; **Stage** = Paper→Sandbox→Canary→Live; **Environment** chỉ ở Binding (Mainnet/Testnet) | 3 selector khác tên cho cùng ô: M01 "Live/Paper/Sandbox" vs M05 "Real-funded/Paper/Sandbox" |
| G11 | Phần tài khoản | Sleeve / "LOGICAL" / "INTERNAL" / "THIS SLEEVE" vs "Physical binding" / "NATIVE" / "WHOLE ACCOUNT" / "Physical account" | **Sleeve** vs **Physical account**; chip phạm vi chỉ "THIS SLEEVE" / "WHOLE ACCOUNT" | 3 cặp nhãn cho một phân đôi; bỏ LOGICAL/INTERNAL/NATIVE/PHYSICAL làm chip |
| G12 | Điểm chất lượng | QBTS (M03, M05, M08), "Score" (M02/M04), "Alpha score", "Portfolio score", "Mixed score", "Composition score" | **Alpha score (QBTS)** lần đầu mỗi màn, sau đó "QBTS"; **Portfolio score**; bỏ "Score" trần | QBTS chưa được định nghĩa ở đâu trong UI |
| G13 | Chờ | Pending (score; request AP-; amount; "Pending receipts"), "Pending recall", "Pending drain", "Awaiting approval", "Needs approval", "Waiting" (grant), "Pending / lock" | "Pending" chỉ khi có sự kiện bên ngoài đang chạy; score dùng "Not scored" | 7 nghĩa của "Pending". Xem N6 |
| G14 | Thiếu giá trị | Not available / Not published / Not computed / Not evaluated / Not applicable / Not shown (to your role) / Unavailable / Not loaded / None published / No source / No series published / Unknown / "—" | Xem §4.1 (6 loại, mỗi loại một cụm) | M01 "My alphas": Allocation hiện "—" cho SOL-Break (Paper): vi phạm §3.3 |
| G15 | Gate | "Gate R1" (c4), "R1 gate" (M10), "Live gate", "Gate Live"/"Live Promotion" (c4), "Gate decisions R1, R2, Canary" | **R1 gate · R2 gate · Canary gate · Live gate** | Một thứ tự: <tên> gate |
| G16 | Thay đổi vốn | "Recall budget" (M04/M09 mô tả), "RECALL_PARTIAL/RECALL_FULL" (M09 Intent), "Recall" (M03 nút), "RECALL" tag (M01), "Pending recall" (M02) vs "Recall pending" (M01/M03/M04/c3) | "Recall budget"; trạng thái luôn **Recall pending** | Thứ tự từ đảo nhau ở 2 màn |

**Tên màn nav vs nội dung:** M09 file tên `operations-decisions` nhưng nội dung chỉ có Commands/Exceptions/Audit; tab "Decisions" (S3) chưa xuất hiện, chỉ có chip "Needs my approval" và link "Approval Inbox". Nav còn 3 mục Governance riêng trong khi C4 nói cockpit là trải nghiệm duyệt chính: nav và quyết định C4/S3 mâu thuẫn.

### 1.3 Khi nào giữ nguyên chữ (verbatim) và khi nào dùng nhãn thân thiện
- **Giữ nguyên, không đổi tên**: tên stage sản phẩm Paper, Sandbox, Canary, Live và gate R1/R2 (D4: bám hi-fi; thứ tự lộ trình R1 → R2 → Paper → Sandbox → Canary → Live). Không dịch/đổi sang "Observation", "Validation".
- **Enum máy chỉ xuất hiện verbatim ở Provenance/Audit/Copy references**: `PAPER_OBSERVATION`, `SANDBOX_VALIDATION`, `LIVE_GATE`, `PENDING_DRAIN`, `ARCHIVE_REQUESTED`, intent (`ADJUST_TARGET_BUDGET`...), `receipt_ref`, `idem_…`. Trích nguyên khi người dùng cần copy/đối chiếu với audit.
- **Vi phạm hiện tại**: c4 hiển thị `SANDBOX_VALIDATION`, `LIVE`, `paper_activation_authorization`, `research_approval_id`, `RC-41`, `PF-MAIN`; M09 cột Intent hiển thị 6 mã intent; M04/M05 hiển thị `pf_0001`, `ls_0192`, `live-0192`, `bind-p-0031`, `av-0003`, `run_0412`, `a-7f3a91`. ID định tuyến được phép làm **nhãn phụ** (mono, nhỏ); không được là nhãn chính.
- Trạng thái lifecycle (ARCHIVE REQUESTED, PENDING DRAIN): hiện dùng enum viết hoa như nhãn. Nên "Archive requested", "Pending drain" (sentence case) + tooltip giải thích "drain".

## 2. Vocabulary cờ / trạng thái

### 2.1 Bộ cờ UI2 (từ `hifi.js` K[], thứ tự ưu tiên regex quyết định cờ)
| Key | Nhãn chuẩn | Glyph | Màu | Dùng khi | Quy tắc "không bao giờ xanh" / ghi chú |
| --- | --- | --- | --- | --- | --- |
| pending | Pending | ◔ (sọc chéo) | vàng | chờ sự kiện ngoài (duyệt, drain, recall) | không đổi thành applied khi chưa có receipt |
| recall | Recall pending | ↩ | cam | recall ngân sách chưa xong | regex bị "pending" chặn trước: "Recall pending"/"Pending recall" ra ◔ chứ không ↩ (lỗi) |
| partial | Partial | ◐ | vàng đất | availability=PARTIAL, receipt Partial | **không bao giờ xanh**; luôn kèm lý do ("Partial · fees") |
| unknown | Unknown | ? (viền đứt) | hồng | outcome UNKNOWN; source_state UNKNOWN | UNKNOWN ≠ lỗi ≠ failed; không có nút gửi lại |
| applied | Applied | ✓ | teal | receipt APPLIED, Complete, Current, Verified | duy nhất cờ "tốt"; chỉ xanh khi dữ liệu hiển thị cũng Current, nếu không đi cặp với ⟳ |
| rejected | Rejected / Failed | ✕ | đỏ | receipt Rejected, Failed, MISMATCH, Blocker | regex còn bắt "attention": "Needs attention" ra ✕ đỏ (lỗi: attention ≠ failure) |
| reconciling | Reconciling / Catching up | ⟳ | xanh dương | đang khớp / projection chưa đuổi kịp | "Reconciled" cũng bị bắt ra ⟳ (lỗi); "Unreconciled" cũng ⟳ |
| stale | Stale | ◷ | vàng | freshness STALE (kèm tuổi: "Stale 14m") | không xanh, không đỏ |
| paused | Paused | ❚❚ | xám | monitor/runtime dừng | chưa thấy dùng trong 14 file |
| approval | Approval | ◈ | tím | item chờ duyệt (M01), "Exit review ready" (c3) | |
| incident | Incident | ▲ | đỏ đậm | incident mở | |
| operation | Operation | ◆ | xanh nhạt | operation đang chạy | |
- Thiếu cờ cho: **Fresh** (không glyph: chỉ chữ), **Provisional**, **Simulated**, **Preview**, **Policy not set**, **Not available** (xám, không glyph).
- 12 key phải map 1-1 với 12 nhãn; hiện map bằng regex trên text hiển thị (`.tagu:not([data-k])`): đổi một chữ trong copy là đổi cờ. Cần map theo enum `state`, không theo chuỗi.

### 2.2 Lỗi/bất nhất tìm thấy
1. "Accepted" (receipt, M04) khớp `accepted` → **✓ teal như Applied**. Accepted ≠ Applied (guide §14). Vi phạm never-green.
2. Chữ "Complete"/"incomplete" cùng regex `complete` → "Fees incomplete" nếu thành chip sẽ ra ✓. Phải đặt `^complete$`.
3. "Needs attention" → ✕ đỏ (rejected). Nên là ◔/▲ amber riêng ("attention").
4. "OK · 12s" (M02) không match `^ok$` nên không có ✓, trong khi "OK" (M01/M03) có ✓. Hai bảng cùng cột Health khác nhau.
5. c4: "Warn" gán `partial` + glyph "!" (ghi đè ◐); "Within" gán `applied` ✓ (Within limit ≠ Applied); "Recorded" gán `rejected` ✕ cho quyết định Reject đã ghi: nhãn "Recorded" mang ✕ đỏ như lỗi.
6. Hai hệ cờ cùng tồn tại: `data-k` (~30 chip) và class cũ `good/warn/bad/acc` (28 good, 22 warn, 5 bad, 2 acc, hand-written); cờ Allowed/Needs approval/Waiting ở M10 còn dùng class cũ.
7. Cột **Health** (M02) trộn 5 chiều: health ("OK"), freshness ("Stale 14m"), tác vụ ("Pending recall"), chất lượng ("Partial · fees"), nguồn ("Unknown"). UXM-01 yêu cầu Health và Source state là hai chip typed riêng.
8. "Source not ready" (toggle thiết kế, M04 nút "Source not ready", M07 "Runtime source not ready") vs "Source not qualified" (banner, KPI): cùng trạng thái, hai tên.

### 2.3 Họ nhãn khác (ngoài 12 cờ)
Health: OK / Needs attention / Stale / Unknown. Freshness: Fresh · 12:04Z / Fresh · 8s / Stale 14m / Freshness unknown. Availability: Not available / Partial / Not applicable. Score: Pending / Provisional / band Weak–Very good / POLICY NOT SET. Regime: SUPPORTED / WEAK / OUT OF SUPPORT / INSUFFICIENT DATA / STALE / UNBOUND. Lifecycle: ACTIVE / ARCHIVE REQUESTED / PENDING DRAIN / ARCHIVED. Runtime: Running / Ended · promoted / Failed / Quota-limited / Not provisioned / Stale 3h / Monitor not running. Verdict (c4): Within / Warn / Blocker. Access (M10): Allowed / Needs approval / Waiting / Not allowed / Not available yet / Not shown. Scope: THIS SLEEVE / WHOLE ACCOUNT / INTERNAL / NATIVE. Khác: SIMULATED, PREVIEW · NOT APPLIED, FUTURE · ILLUSTRATION, NOT ACTUAL TRACK RECORD, STEP-UP REQUIRED, MATCH/MISMATCH, Shared, Locked.

### 2.4 Never-green rules (đề xuất chuẩn; ★ = đã có trong UXM-01/guide)
★ PARTIAL, STALE, UNKNOWN, Pending, Provisional, Reconciling, Catching up, Not available: không xanh, không tick. ★ UNKNOWN ≠ failed ≠ retry. ★ Không dùng "0", "-", "N/A" thay null. Thêm: (a) Receipt Applied đi cặp Display chip; Display≠Current thì không có tick đơn lẻ; (b) Health "OK" chỉ khi source Fresh + không incident mở; nguồn Stale thì hiển thị Stale, không "OK · …"; (c) Fresh chỉ xanh nhạt/trung tính, không xanh khi source chưa qualified; (d) Regime SUPPORTED dùng trung tính (không xanh: "not a forecast"); (e) band provisional = viền/sọc, không fill đặc xanh; (f) giá trị PARTIAL: số màu trung tính, không +xanh/−đỏ; (g) Simulated luôn nét đứt/sọc tím, không dùng màu PnL của actual; (h) Not available/Not applicable = xám, không bao giờ đỏ; (i) số 0 chỉ hiện khi backend publish 0 (M01/M04 "Returned 0.00", M06 "Δ 0", M08 "Unknown outcomes 0", M09 "Cancelled 0.00" cần cờ "published zero" trong contract, nếu không thì Not available).

## 3. Copy audit

### 3.1 Số liệu theo màn (chuỗi riêng biệt; ">60" = số chuỗi dài hơn 60 ký tự)
| Màn | Chuỗi | >60 | 41–60 | "Not available" | "Not published" | Ghi chú nổi bật |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | 192 | 1 | 1 | 18 | 0 | banner 71 ký tự; "—" thay null |
| M02 | 421 | 0 | 4 | 64 | 18 | HHI/Identity only/Modified Dietz |
| M03 | 187 | 0 | 2 | 29 | 1 | cột tiền "Not available" lặp ×6 mỗi hàng |
| M04 | 671 | 0 | 4 | 75 | 53 | **128 ô thiếu**; V1 vấn đề #3 vẫn còn |
| M05 | 427 | 2 | 4 | 36 | 1 | 126/110 ký tự; FUTURE·ILLUSTRATION |
| M06 | 226 | 2 | 1 | 25 | 0 | nhãn kép LOGICAL/INTERNAL/NATIVE |
| M07 | 74 | 0 | 0 | 3 | 0 | "—" làm glyph stage chưa tới |
| M08 | 199 | 1 | 3 | 6 | 0 | 79 ký tự |
| M09 | 324 | 1 | 3 | 12 | 0 | **165 ký tự**; 6 mã intent; 3 loại ID |
| M10 | 242 | 1 | 1 | 14 | 0 | 115 ký tự; 12 hàng "Not available · Not loaded" |
| c1–c4 | 74/119/79/257 | 1/1/0/0 | 0/5/4/7 | 0/0/0/4 | 0/0/0/1 | c4: ~12 chuỗi chứa enum/ID thô trong script |
Tổng: 10 chuỗi tĩnh >60 (2 là tiêu đề chrome của concept); ~49 chuỗi 41–60; ~15 chuỗi trong script >40 chứa mã thô. Đoạn giải thích đầy đủ: M09 "About", M05 continuity + manifest, M10 footer, M08 reactivation, M01 banner (5 đoạn).

### 3.2 Trùng lặp
- Cụm "Source not qualified" lặp 4–5 lần mỗi màn ở trạng thái Source-not-ready (banner + mỗi KPI + chip). M05: banner + 3 lý do + Regime. Quy tắc: banner nói một lần, ô chỉ ghi "Not available".
- "Modified Dietz": M04 ×4 (KPI, chip, Basis and method, caption); M02 ×2; M01 ×2; M05 ×3; c2 ×1.
- "Check the original request": M09 KPI note, cột Next, nút drawer, tooltip, footer (5 lần).
- "Your slice only" có 5 biến thể: "Your slice only. Fund totals and peers are hidden." (M01) / "Totals and peers are hidden." (M02/M04) / "Peers and fund totals are hidden." (M05) / "Your slice only." (M03) / "Other sleeves and native balance are hidden." (M06). Thứ tự "totals and peers" đảo nhau.
- Banner thiếu nguồn: 8 biến thể (M01..c3, M08, M09, M10); xem §4.3.
- Duplicate nghĩa: M04 "Net PnL, since start" vs KPI "Net PnL · 30D"; "Economic capital" ở KPI và Capital và Budget header.

### 3.3 Jargon và mã thô hiển thị
Jargon: qualified, certified, drain, sleeve, native, basis, read side, idempotency/"idem_", HHI, QBTS, Modified Dietz, TWR, OOS/IS, "digest", "twin", "step-up", "unitized", "hatched", "headroom", "reservations", "settlement pending", "Identity only".
Mã thô (~25 họ): intent `ADJUST_TARGET_BUDGET`, `SET_ROOT_LIMIT`, `RECALL_PARTIAL`, `RECALL_FULL`, `TOP_UP`, `ARCHIVE` (M09); `idem_4b19…c2`, `receipt_ref`, `source_event_ref`, `revision` (M09); `budget.adjust` (M04 drawer); `pf_0001`, `pf_unallocated`, `ls_0192`, `live-0192`, `acct-l-0092`, `bind-p-0031`, `av-0003`, `run_0412`, `a-7f3a91`, `user_7f3a…e1`, `rc-8812`, `cmd-7d41`, `AP-1047`, `INC-0318`, `EX-702`, `policy approval.v3`, `paper_activation_authorization`, `research_approval_id`, `SANDBOX_VALIDATION`, `PF-MAIN`, `CAL-XXXX`.

### 3.4 Định dạng không nhất quán
| Hạng mục | Quan sát | Chuẩn đề xuất |
| --- | --- | --- |
| Số tiền | `1,204,210.55` (2dp) cạnh `120,000`, `842,300 / 1,100,000`, `80,000 / 100,000`, `61,300 / 35,100` (0dp) cùng một màn | USDT luôn 2dp, tách nghìn bằng `,`, thập phân `.`; không bỏ `.00` (khớp UXM-01: chuỗi decimal chính xác) |
| Viết tắt k/M | chart flag `+20k` (hifi.js `/1000 … "k"`); c3 "Recall 20k pending"; UXM-01: "không bao giờ rút gọn k/M" | cấm k/M cho tiền; dùng `+20,000.00` hoặc chỉ ghi "+20,000" nếu chart quá chật và tooltip có đủ |
| Dấu trừ | U+2212 nhất quán ở nội dung tĩnh (0 hyphen-minus trong 14 file); `hifi.js` fmt() cũng dùng U+2212 | Giữ U+2212; dấu `+` tường minh cho PnL/return/flows |
| Tiền tệ | "USDT" sau số trong KPI, trong header cột ("Fees USDT", "Notional USDT"), "ccy" cột (c4), "100,000 USDT sim", "−40,000 USDT", "Recall 25,000.00" không có | Mã tiền: đứng **sau** số, nhỏ; trong bảng ghi ở header một lần; mọi số tiền lẻ loi (chip, thông báo) phải kèm mã |
| % | `+7.5%`, `37.0%`, `5.1%` (1dp); `0.2%`, `98.2%`; c4 dùng `pt`, `bp`, `ms` | 1dp; đơn vị khác chỉ trong bảng verdict, ghi trong ô |
| Drawdown | "Drawdown", "Max drawdown", "Max −6.8%" / "max −3.7%", "Drawdown now / max · 30D", "Drawdown current / max" | "Drawdown" (hiện tại) + "Max drawdown"; không viết "max" trần thường/hoa |
| Ngày | `Oct 11` (M05), `18 Sep` (M08), `1 Sep 2026` (M10), `2026-07-02 09:00Z` (M05), `2026-10-17 09:14` (c2), `Today · 17 Oct` (M09) | Một mẫu: `17 Oct 2026` hoặc bỏ năm khi cùng năm (`17 Oct`); ISO chỉ ở ô Copy/Provenance |
| Giờ/múi | `12:04Z` (header), `09:14` trần (M04, M09 theo UTC+7), `(UTC)` ở header cột (M05/M06/c2), `09:12Z` | Bảng UTC: header ghi "(UTC)", ô `09:14`; ngoài bảng `09:14Z`. M09 UTC+7 mâu thuẫn mọi màn khác. Xem N9 |
| Tuổi/độ tươi | `14m`, `14 m`, `14m ago`, `3h`, `3 h ago`, `2 min ago`, `9 s ago`, `41s ago`, `Ends in 7h 12m`, `due in 1:00h`, `overdue 2:00` | `14m ago` không khoảng trắng; `7h 12m`; SLA `due in 1h`/`overdue 2h` |
| Khoảng | `Oct 07 – Oct 11` (en dash, có khoảng), `Oct 11 →` (mở), `Sep 17 – Oct 07` | giữ ` – `; mở bằng `→` |
| Fresh | `Fresh · 12:04Z` (đồng hồ) vs `Fresh · 8s`, `Fresh · 20s` (tuổi) | luôn dạng **as-of**: `Fresh · 12:04Z`; tuổi chỉ ở hàng bảng |
| Số đếm | `7 rows`, `Showing 50 of 214`, `Showing 5 of 17 authorized`, `4 / 5`, `720/720` | `Showing 50 of 214` ; chia `4 / 5` có khoảng |
| Mũi tên | `Investigate →`, `Verify →`, `Review →`, `Open →`, `Open ↗`, `Open Alpha 360`, `Open in Alpha Fleet`, `← Fleet results` | Động từ cụ thể + `→` cho điều hướng nội bộ; `↗` chỉ khi ra ngoài; `← <Tên màn>` cho quay lại |
| Viết hoa/ký hiệu | Title Case tên màn ("Archived Alphas"), sentence case nhãn, CSS ép HOA cho `.tagu`; viết tắt "dep.", "deploy." lẫn trong M02 ("Alphas / deploy." vs "Alphas / dep.") | Nhãn cột sentence case; không viết tắt; chip tự do về HOA (CSS lo) nhưng thứ tự từ cố định |
| Cửa sổ | cột "30D" cố định trong khi mặc định UI3 = 90D; JS `labelWin` đổi chữ lúc chạy | nhãn cột từ state, không chép tay "30D"; ghi "requested vs effective" như M05 |

### 3.5 25 chuỗi tệ nhất → thay thế ngắn
| # | Vị trí | Hiện tại | Đề xuất |
| - | --- | --- | --- |
| 1 | M09 About (165) | "Tracks receipts only; capital actions start elsewhere. Intent, receipt and reconciliation are separate facts. UNKNOWN means query the original request, never resend." | "UNKNOWN: check the original request. Never resend." (+ tooltip "Intent, receipt and display are separate facts") |
| 2 | M05 continuity (126) | "Canary → Live keeps one account, sleeve and config, so the path is continuous. Paper monitor since Oct 12 is not on this line." | "Canary → Live is one path (same account, config)." + footnote "Paper monitor excluded." |
| 3 | M05 manifest (110) | "Same version and params · one source per interval · no overlap or backfill · compatible grid, currency, costs." | "Same version, params · one source/interval · no backfill" |
| 4 | M10 footer (115) | "Waiting means the grant was sent and the trading system has not accepted it. Owner accounts cannot be changed here." | "Waiting: grant sent, not accepted yet." ; "Owner accounts can't be edited here." |
| 5 | M08 (79) | "A review, default target Paper. Never goes live or lifts the archive by itself." | "Opens a review (default: Paper). Never goes live alone." |
| 6 | M01 banner (71) | "Live source is not qualified yet. Figures stay unavailable until it is." | "Source not qualified. Nothing is estimated." (B1) |
| 7 | M06 (72) | "Venue cross margin does not isolate logical portfolios in a liquidation." | "Cross margin: a liquidation can hit every sleeve." |
| 8 | M06 (66) | "Shared account · 3 sleeves. Native figures are not sleeve capital." | "Shared by 3 sleeves. Native figures cover the whole account." |
| 9 | c2 (63) | "Capital, budget, exposure and venue margin are separate columns" | "Capital, budget, exposure, margin: separate columns" |
| 10 | c2 (62) | "A limit set by the manager. Not funded by specific cash flows." | "A limit, not cash. Not tied to a funding source." |
| 11 | M09 Intent (6 mã) | `ADJUST_TARGET_BUDGET` `SET_ROOT_LIMIT` `RECALL_PARTIAL` `RECALL_FULL` `TOP_UP` `ARCHIVE` | "Set target budget" · "Set root limit" · "Recall budget (partial)" · "Recall budget (full)" · "Top up account" · "Archive alpha" ; mã vào drawer |
| 12 | M09 drawer | `idem_4b19…c2` / `receipt_ref` / `source_event_ref` / `revision` | "Request ID" / "Receipt ID" / "Source event" / "Revision" (mono, nút Copy) |
| 13 | c4 | "Gate met — ready to promote to SANDBOX_VALIDATION" | "Criteria met. Promote to Sandbox." |
| 14 | c4 | "Promotes to SANDBOX_VALIDATION · no external effect" / "Promotes to LIVE · step-up required" | "Moves to Sandbox. No external effect." / "Moves to Live. Step-up required." |
| 15 | c4 | "Creates research_approval_id bound to RC-41" | "Records approval for RC-41." |
| 16 | c4 | "Grants paper_activation_authorization only" | "Authorises Paper start only." |
| 17 | c4 | "Blocked — 1 blocker: broker sync stale" | "Blocked: broker sync stale (14m)" |
| 18 | c4 | "Can be approved — 1 warning suggests a condition" | "Approvable. 1 warning: add a condition." |
| 19 | M01 | "Fees and funding incl." | "Incl. fees and funding" |
| 20 | M02 | "7 rows · 3 portfolios in another currency · Switch basis" | "7 rows · 3 in other currencies · Switch basis" |
| 21 | M02/M04 | "Concentration · allocation HHI" / "Concentration (HHI)" | "Concentration" ; tooltip "HHI: 1 = one holding" |
| 22 | M02/M04 | "Identity only" ×27 | "Names only" ; banner "Money, risk, score: not available yet" |
| 23 | M03/M10 | "Export is not available yet" / "Export is not built yet." / "Needs an export grant" / "No permission" | "Export isn't available yet." hoặc "Export needs a grant." (một trong hai theo lý do) |
| 24 | M10 | "Up to the access you hold." | "Limited to your own access." |
| 25 | M04 | "Budget, pending until obligations clear" / "Pending until they fill or cancel" | "Pending until orders fill or cancel" (dùng một câu cho cả hai) |

## 4. Microcopy standards
### 4.1 Not available + lý do (6 loại, lý do là cụm danh từ ≤28 ký tự, không dấu chấm, không mã)
| Loại | Cụm chuẩn | Hiện đang dùng (gộp lại) | Hiển thị |
| --- | --- | --- | --- |
| Nguồn chưa qualified (503) | **Source not qualified** | "Not qualified", "Source not ready", "Ledger not qualified", "Native source not qualified", "Command status not qualified" | chip xám |
| Nguồn chưa publish | **Not published** | "Source not published", "Series not published", "None published", "No series published", "Profile not published" | gom 1 lần/khối (M04: 53 ô) |
| Phương pháp/chính sách | **Method not certified** / **Policy not set** / **Method not approved** | "Not certified", "Policy pending" | |
| Thiếu dữ liệu | **Fees incomplete** / **No NAV series** / **No grouping** / **No matched windows** | "Grouping incomplete", "No equity series" (≡ No NAV series), "Source insufficient" | |
| Phụ thuộc | **Needs <X>** | "Needs PnL", "Needs QBTS and weight", "Needs the archive list" | dùng đúng một mẫu |
| Quyền | **Not shown to your role** / **Needs <grant>** | "Not shown", "No permission", "Not loaded" | kèm link "Why? → Profile & Access" (D9) |
| Không áp dụng | **Not applicable** + 1 lý do | "No receipt / Not applicable" (preview), "—" (M01 Paper allocation) | không bao giờ "—" |
| Chưa tính | **Not computed** + lý do | "Not computed · Native spans all sleeves" | |
Quy tắc ô: `Not available` (faint) + lý do 2 dòng; **cột có ≥4 ô cùng lý do** → lý do đưa lên header/caption, ô chỉ `Not available` (không lặp). Mã gốc ở tooltip.

### 4.2 Disabled-reason (D9: tắt + 1 dòng lý do + link M10)
Mẫu: `<Hành động>` (disabled) · dòng dưới `<Nguyên nhân>.` ≤50 ký tự · link `Why →`. Nhóm lý do: role ("Your role does not include this."), flag ("Not turned on for this environment."), chưa xây ("Not offered in the portal yet."), nghĩa vụ ("Open obligations: recall pending."), nguồn ("Source not qualified."), tự duyệt ("You created this request."), step-up ("Step-up required."), version ("Version conflict. Review the new preview."). Không dùng "Source not ready" trên nút (M04). Không "Unavailable" + "Not evaluated" cùng một hàng hành động.

### 4.3 Banner (một kiểu, hai dòng tối đa)
| Mã | Điều kiện | Copy |
| --- | --- | --- |
| B1 | 503 NOT_QUALIFIED | "**Source not qualified.** Figures are not available. Nothing is estimated." |
| B2 | Researcher | "**Your slice only.** Totals and peers are hidden." (một thứ tự duy nhất) |
| B3 | Partial/stale | "**Partial data.** <khối> excludes <nguồn>. As of 12:04Z." |
| B4 | 409 | "**Data changed.** Showing the latest. Your position was reset." |
| B5 | UNKNOWN | "**Outcome unknown.** Check the original request. Don't resend." |
| B6 | Preview | "**Preview, not applied.** Nothing is sent until you submit." |
Banner không lặp trong ô; không dùng mã; không "yet" nếu không có ETA.

### 4.4 Empty / confirm / error
- **Empty** (có publish nhưng rỗng ≠ Not available): "No open exceptions." / "No requests in this window." + 1 bước ("Change window"). Không dùng "Not available" cho rỗng. Chart: "No series published" chỉ khi chưa publish; rỗng thật: "No data in 90D".
- **Confirm**: nút = động từ + đối tượng ("Submit recall", không "OK"/"Submit command" chung). Sau gửi: "Request sent. Waiting for receipt." (không "Success"/"Done"). Applied: "Applied. Display updating." Rejected: "Rejected: <lý do>. Nothing changed." Archive: "Archive requested. Nothing is archived until a receipt says so." Reject quyết định: bắt buộc ghi chú ("Required to reject · 12+ characters" → "Add a reason (12+ characters)").
- **Error**: "<Điều gì xảy ra>. <Việc nên làm>." ≤2 câu + `Copy details` (request ID). 403 "Your role does not include this." ; mạng "Can't reach the server. Showing data from 12:04Z." ; timeout lệnh "No answer yet. Check status before sending again." ; 5xx "Something went wrong. Request ID …". Không hiển thị exception code.

## 5. Decisions Bobby must take (đặt tên)
| # | Câu hỏi | Lựa chọn | Khuyến nghị |
| --- | --- | --- | --- |
| N1 | Selector trên cùng: "Live / Paper / Sandbox" hay "Real-funded / Paper / Sandbox" (G2, G10) | A: giữ Live (URL khớp); B: Real-funded (D2 đã chốt "Real-funded"); C: song song | **B**; "Live" chỉ là stage; URL `env=live` giữ |
| N2 | Hàng đợi duyệt: tên và chỗ ở (G4); mâu thuẫn S3 (tab Decisions ở M09) vs C4 (cockpit chính) vs nav 3 mục | A: "Approvals" 1 mục nav, loại theo filter; B: "Decisions"; C: giữ 3 mục | **A**; M09 tab đổi "Approvals"; "Decision" = panel verdict |
| N3 | Exception vs Incident (G5) | A: 1 từ "Incidents" ; B: Exception=hàng đợi tự sinh, Incident=case có ID; C: giữ | **A** (INC- là ID, "Open incidents 3"); M01 kind giữ "INCIDENT" |
| N4 | NAV vs Economic capital (G8) | A: NAV mọi nơi; B: Economic capital mọi nơi; C: giữ | **A**, "Economic capital" thành alias tooltip |
| N5 | Capital/Budget/Allocation (G9) | A: 3 từ có định nghĩa như §1.1; B: gộp Budget=Allocation | **A**; sửa "Allocated capital", "PM capital", "Virtual allocation", cột "Allocations" |
| N6 | Score chưa có policy: "Pending" hay "Not scored" | A: giữ UXM-01 ("Pending · score policy pending"); B: "Not scored · Policy not set" | **B** ("Pending" là sự kiện đang chạy; policy không có ETA) , cần sửa UXM-01 §3 |
| N7 | Tên chiều projection | A: "Display"; B: "Read side"; C: "Reconciliation" | **A** ("Applied · display updating" khớp guide §14) ; Reconciliation chỉ ledger/venue |
| N8 | Giọng researcher | A: "My …"/"Alphas you own"; B: tên thực thể + banner B2 + chip "Your slice" | **B** |
| N9 | Múi giờ/ngày | A: UTC mọi nơi (khớp receipt/audit); B: local UTC+7 (guide §4.3, M09); C: UTC trong bảng, local trong hover | **C**; định dạng `17 Oct 09:14Z`, năm khi khác năm hiện tại |
| N10 | ID trong UI (G, §1.3) | A: ID là nhãn phụ mono; B: ẩn hẳn trong Provenance | **A**, và cấm enum thô ngoài Provenance/Audit |
| N11 | Cặp nhãn sleeve/account (G11) | giữ 3 cặp / 1 cặp | **1 cặp**: "This sleeve" / "Whole account" |
| N12 | "qualified" vs "ready" (nguồn) | A: "Source not qualified" (khớp 503 copy đã duyệt); B: "Source not ready" | **A** ; bỏ "Source not ready" khỏi UI (chỉ còn nhãn nút thiết kế) |
| N13 | Gate wording | "Gate R1" vs "R1 gate" | **R1 gate** (M10 đã dùng) ; "Live gate" thay "Live Promotion" |
| N14 | Ký hiệu "Identity only" | giữ / "Names only" | **Names only** |
