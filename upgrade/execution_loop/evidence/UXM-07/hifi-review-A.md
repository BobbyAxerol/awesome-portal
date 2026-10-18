# UXM-07 · Rà soát HIFI so với bản cài đặt, nhóm A (overview, fleet, operations, incident, cockpit)

Phạm vi: chỉ đọc code, không sửa gì ngoài file này. Mốc so sánh: HIFI v2 (`design/hifi/v2/*.html`, `kit.css`, `modules/cockpit.js`, `modules/spine.js`) ở chế độ "Not qualified" (gần dữ liệu backend publish hôm nay) và "ok" để xem cấu trúc. Bản cài đặt đo ở 1440 và 390 (`scratchpad/s1shots/*`). Giá trị HIFI lấy từ `kit.css` và `cockpit.js`; giá trị cài đặt lấy từ `apps/portal/frontend/src/execution/v2/css/*.css` và `screens/*`.

Lớp: **A** = DATA_ABSENT (backend chưa publish, cite FE id trong `FRONTEND_BACKEND_SYNC.md`); **B** = FIDELITY (MAJOR / MINOR); **C** = INTENTIONAL (shell portal, nhãn nav, theme, thanh "design preview", bộ chuyển role, hoặc quyết định đã ghi).

Giới hạn bằng chứng: không có ảnh chụp drawer của Fleet và Operations (dock), nên các dòng về dock chỉ dựa trên code (`OperationDock.tsx`, `FleetDrawer.tsx`). Drawer Incident có ảnh ở 1440 và 390.

## 0. Lỗi hệ thống (xuất hiện ở nhiều màn, đếm riêng, không cộng vào bảng từng màn)

| ID | Lớp | Mô tả (HIFI so với cài đặt) | Sửa nhỏ nhất |
|---|---|---|---|
| SYS-1 | C | Nhãn KPI, tiêu đề panel, tab, `th` mất kiểu "mono 11px, uppercase, letter-spacing .10 đến .12em" của HIFI (`.kpi .l`, `.ph`, `th`, `.tabs button`). Cài đặt dùng `--exec-font-label`/`--exec-font-th` (sans hoặc mono 11/16, chữ thường). Đây là deviation đã ghi ở `design/impl/S0-IMPLEMENTATION-MAP.md` (type-role test + hygiene allowlist), nhưng `review2/03` dòng 117 vẫn yêu cầu caps. | Không sửa nếu Bobby giữ quyết định. Nếu muốn khớp HIFI: thêm allowlist uppercase cho `.exec-blk-kpi-label`, `.exec-blk-ph-title`, `.exec-cards thead th` trong `v2Hygiene.test.ts`. |
| SYS-2 | B MINOR | Khoảng cách giữa context bar và tiêu đề trang gần 0 đến 2px ở cả 5 màn (ảnh 1440: viền dưới ctxbar y=118, chữ H1 bắt đầu y≈120). HIFI: `main{padding:24px}` và `.stack{gap:24px}` nên cách 24px; lề ngang 24px (HIFI x=252) so với 16px (cài đặt x=244). Chip "Fresh/As of/Observed" của Fleet và Operations dính vào viền ctxbar. | `css/shell.css` `.exec-ctxbar { margin-bottom: var(--space-5); }` (hoặc `padding-top` ở `.exec-preview-shell > :not(.exec-ctxbar)`); lề ngang thuộc shell portal (C). |
| SYS-3 | B MINOR | KPI strip của Fleet và Operations không dùng `.exec-blk-kpis`: hộp rời `gap: var(--space-2)` (Fleet) / `var(--space-3)` (Operations), viền `--line`, padding 8/12 (Fleet) so với HIFI `.kpis` liền nhau `gap:1px`, nền `--line-strong`, viền ngoài `--line-strong`, ô padding 12/16, giá trị 24/32. Overview đã dùng `blocks.css` nên khớp. | `fleet.css .exec-fleet-kpis/.exec-fleet-kpi`, `operations.css .exec-ops-kpis/.exec-ops-kpi`: thay bằng `.exec-blk-kpis`/`.exec-blk-kpi` (đã có sẵn). |
| SYS-4 | B MINOR | Drawer overlay đặt `top: var(--exec-dock-top, 81px)` (`dock.css:26`); không nơi nào set `--exec-dock-top`. 81px của HIFI = 52px header + 29px thanh "design preview" (không thuộc sản phẩm), nên cài đặt chừa dải chết ~29px dưới topbar (ảnh incident-wide: drawer bắt đầu y=81, topbar kết thúc y=52). | Set `--exec-dock-top: 52px` ở `.exec-preview-shell` hoặc đổi mặc định. |
| SYS-5 | C | Shell portal: topbar "QUANT ECOSYSTEM PORTAL", chip RESEARCH, selector "Execution Carbon/Operational", sidebar nhiều nhóm (Command, Governance, Deployments, Research...), nhãn "Execution Command Center", "Operations Queue", "Approval Inbox" (HIFI: Overview, Operations, Approvals), breadcrumb, dòng "Window applies when the server supports it", thanh "Design preview/Role/Data" của HIFI. | Không. |
| SYS-6 | A | Ctxbar thiếu chip "USDT · one basis" và "Scope: All portfolios ▾" (HIFI). Scope IN-filter nhiều subject chưa có (FE-033); cơ sở tiền tệ chưa có read nào công bố (FE-017 tên/đơn vị metric). | Chờ Codex. |

## 1. Overview (`screens/overview/index.tsx`, `css/overview.css`)

| ID | Lớp | HIFI so với cài đặt | Sửa nhỏ nhất |
|---|---|---|---|
| OV-1 | A | NAV, Net PnL, Return, Drawdown: HIFI nq in "Not available" cỡ 16/32 sans + lý do; cài đặt in "Not published (FE-005/006/013/025)" (quy tắc `Not published (FE-xxx)`). FE-005 tổng thiếu nguồn, FE-006 methodology, FE-013 time-series, FE-025 window. | Chờ Codex. |
| OV-2 | B MINOR | Chuỗi id dài `(FE-005/006/013/025)` ngắt giữa id ở 4 ô KPI ở 1440: "(FE-" xuống dòng rồi "005/006/013/025)" (ô ~196px, chữ 13px `--exec-font-data`). HIFI `.v.na` 16/32 một dòng. | `blocks.css .exec-blk-np`: bọc id trong span `white-space: nowrap`, hoặc rút gọn nhãn "FE-005 +3" ở `Gap` (`overview/index.tsx`). |
| OV-3 | B MINOR | Ô "Open incidents": HIFI có link "Operations" ở dòng note (`.kpi .n a`), cài đặt note là chữ thường "Incidents in the ranked list" không link. | `overview/index.tsx` Cell note: `<Link to={ctx("/execution/operations")}>Operations</Link>`. |
| OV-4 | C | Ô thứ 6 "Needs attention 3 of 214" và "at least 1": dữ liệu publish thật, nằm trong ghi chú đầu `index.tsx` (counts giữ `~`/"at least"). | Không. |
| OV-5 | A | Panel Performance: seg Net PnL/Return/Equity + chart + caption (FE-013 series, FE-025 window). Cài đặt: placeholder gạch chéo, header "Window: Not published (FE-025)". | Chờ Codex. |
| OV-6 | B MINOR | Placeholder cao 180px (`EquityPanel height={180}`), HIFI `.empty{min-height:240px}`; header Performance không có hàng seg (HIFI `.ph` có seg ở trái), nên cấu trúc "final" chưa thấy. | `index.tsx`: `height={240}`; render seg 3 nút disabled kèm lý do (cùng cách Fleet làm). |
| OV-7 | A | Capital: HIFI 4 hàng (Initial, Added, Returned, **NAV** in đậm) + thanh Budget used 6px, 76.5%. Cài đặt: 5 hàng đều "Not published (FE-017)"; Budget used là hàng thứ 5, không có thanh. FE-017 (tên/đơn vị metric statement). | Chờ Codex. |
| OV-8 | **B MAJOR** | **Panel "Needs attention" bị cắt ở 1440.** HIFI là danh sách `.item` (cờ + tiêu đề + link hành động bên phải + dòng meta + thanh SLA 3px) trong panel 1/3. Cài đặt dùng `CardsTable` 5 cột (Rank, Kind, What, SLA, Open) trong panel ~377px: cột "SLA" bị cắt ("Overdue (since 202…"), cột **Open** (Investigate/Verify/Review, đường vào Operations) nằm ngoài khung và chỉ tới được bằng cuộn ngang vô hình (`.exec-cards-wrap{overflow-x:auto}`). Cột "What" co lại còn ~60px nên tiêu đề xuống 3 đến 4 dòng, mỗi hàng cao 118 đến 120px (HIFI ~70px). Panel "Since your last visit" bên cạnh bị kéo dãn theo, để trống ~330px. Ở 390px thì thẻ xếp dọc, đọc được. | `overview/index.tsx`: thay `triageColumns` bằng danh sách `<ul>` kiểu `.item` (flag + title, link `Open` cùng hàng, `r.summary` làm meta, SLA một dòng rút gọn); thêm `.exec-ov-item` vào `overview.css`. Phương án nhỏ hơn: `grid-template-columns: 1.4fr 1fr 1fr` cho `.exec-ov-grid3` và ẩn cột Rank. |
| OV-9 | A | Thanh SLA (HIFI `.sla` 3px, đỏ 100% cho quá hạn, vàng theo tỉ lệ). Server chỉ nói due/age dạng chữ; tỉ lệ cần sla_due_at + thời điểm tạo do server nêu (FE-030). | Chờ Codex. |
| OV-10 | B MINOR | Cột SLA in nguyên "Overdue (since 2026-08-22 11:58:00 UTC), age 10 min" (HIFI "overdue 2:00" trong `.m`, 12/16). | Rút gọn trong `triageRows` (`overviewModel.ts`): "Overdue 10 min", giữ ISO ở `title`. |
| OV-11 | A | "Since your last visit" (FE-024 marker + change feed) và "Contributors" (FE-025, đóng góp theo window; HIFI có seg Amount/Portfolios). | Chờ Codex. |
| OV-12 | C | Thêm các block có dữ liệu thật mà HIFI không có: "Current by currency", "Fleet by stage", "Today", "Source health" (ghi ở đầu `index.tsx`). | Không. |
| OV-13 | C | Header: hai Flag (BUSY, FRESH) + "Read ... UTC" + nút Refresh + dòng trạng thái stream; HIFI một chip "Fresh · 12:04Z". Tiêu đề "Overview, bobby". | Không. |
| OV-14 | B MINOR | Trạng thái nguồn không lên đầu trang: Source health báo PARTIAL ×3 ở cuối trang (y≈1530 trên 1684) trong khi header hiện "✓ FRESH" xanh. HIFI nq đặt banner "Source not qualified..." ngay dưới masthead. Dữ liệu đã đọc sẵn (`composition.sourceHealth`). | `index.tsx`: nếu có profile `state !== AVAILABLE` thì render `.exec-ov-banner` "Some sources are partial; figures may be incomplete" dưới header. |
| OV-15 | B MINOR | Capital: nhãn hàng là `<th>` thừa hưởng uppercase+tracking từ `base.css` ("INITIAL FUNDS"), HIFI nhãn là `td` chữ thường 13px; hàng NAV không in đậm (HIFI `<b>`). | `overview.css .exec-ov-cap th { text-transform: none; letter-spacing: normal; }`; NAV `<th>` font-weight 600. |

Narrow 390: dùng được. KPI một cột như HIFI (<660), bảng triage đổi sang thẻ nên không bị cắt, nút Refresh và Open với tới được. Ghi chú: cột Open nằm cuối thẻ.

Đếm Overview: A = 5 (OV-1, 5, 7, 9, 11); B MAJOR = 1 (OV-8); B MINOR = 6 (OV-2, 3, 6, 10, 14, 15); C = 3 (OV-4, 12, 13).

## 2. Alpha Fleet (`screens/fleet/*`, `css/fleet.css`)

| ID | Lớp | HIFI so với cài đặt | Sửa nhỏ nhất |
|---|---|---|---|
| FL-1 | **B MAJOR** | **Mất dấu giai đoạn (stage) và mini-spine, thứ dữ liệu hiện có vẫn đủ để vẽ.** HIFI cột Stage: ô vuông 8×8 màu theo stage (`--stage-paper` tím, sandbox vàng, live đỏ, canary viền rỗng 2px) + nhãn mono caps + `sp-mini` 6 ô 9×9 (R1, R2, Paper, Sandbox, Canary, Live; ô trước stage hiện tại "done", ô hiện tại "cur", sau là "nos"; `Spine.fromStage` chỉ cần stage hiện tại). Cài đặt: ô chữ viền `--line-strong` đơn sắc (`.exec-fleet-stage`, font label 11/16), mọi stage cùng một màu; `data-stage` đã được `FleetTable.tsx` phát ra nhưng `fleet.css` không có rule nào dùng. Trong bảng 214 alpha, người đọc phải đọc chữ để phân biệt Paper/Sandbox/Canary/Live. | `fleet.css`: `.exec-fleet-stage[data-stage="PAPER"]::before` v.v. với `--stage-paper`, `--env-sandbox`, `--env-canary`, `--env-live` (token đã có, xem `charts.css:574-576`); `FleetTable.tsx` `StageCell`: thêm `<JourneySpine variant="mini" …>` từ `v2/blocks/JourneySpine.tsx`. |
| FL-2 | B MINOR | Mật độ và đọc trùng: hàng cao 53px (Carry A) đến 87px (Momentum C, 3 dòng) so với HIFI `td{height:32px}` một dòng. Cờ sức khỏe xuất hiện hai lần: dưới Stage ("✓ READY") và trong Deployments ("1 deployment ✓ READY"), hai nguồn khác nhau nhưng nhãn giống hệt. HIFI có cột Health riêng. Trang 50 hàng dài ~2.650px (HIFI ~1.750px). | `FleetTable.tsx`: tách cột "Health" (cờ alpha), để Deployments chỉ hiện số lượng + cờ xấu nhất khi khác cờ alpha; đặt `exec-fleet-reasons` vào `title`. |
| FL-3 | B MINOR | Cột Readiness luôn bật với "Not published (FE-027, FE-028)" lặp ở mọi hàng, và cột Actions với nút Compare lặp mọi hàng. HIFI: Readiness mặc định tắt (`cols.rd:0`, bật qua Columns), chọn so sánh bằng checkbox + một nút Compare trên toolbar. Hai cột này tốn ~300px mà không mang thông tin. | `FleetTable.tsx`: bỏ cột `readiness` và `actions`; lý do FE-027/028/033 đã có ở dòng "Not published yet" trên bảng. |
| FL-4 | A | Allocation, Net PnL (window), Unrealized, Equity sparkline, Health stale-age; KPI "Ready for exit review" và "Archive in progress". FE-025 window, FE-013 series, FE-027/028 readiness, FE-034 archive. (HIFI nq cũng in "Not available/No series"; màn cố ý identity-only, ghi ở đầu `index.tsx`.) | Chờ Codex. |
| FL-5 | A | Portfolio filter, "Then by", Group, Board, Map, Window, tab Archived (disabled kèm lý do FE-012, FE-027, FE-035, FE-025, FE-034). Đã đúng quy tắc disabled + reason. | Chờ Codex. |
| FL-6 | A | Compare 2 đến 4 alpha (FE-033), Export (FE-016). | Chờ Codex. |
| FL-7 | B MINOR | Thiếu popover "Columns ▾" (HIFI `#colb`/`#colm`, checkbox cho Owner, Portfolio, Stage, Allocation, ...). Không phụ thuộc dữ liệu. | `fleet/index.tsx`: thêm popover; lưu `cols` vào URL hoặc state. |
| FL-8 | B MINOR | Thiếu chip bộ lọc đang bật có ✕ ("lens: Real-funded (Canary + Live)", "owner: x"), "Clear all" và disclosure "URL" (HIFI `#chips`). Cài đặt chỉ có nút "Clear filters" khi có filter. | `fleet/index.tsx`: render chip từ `q/stage/owner/health`. |
| FL-9 | B MINOR | Tab lens: HIFI `.tabs button` mono 500 12/18 uppercase .06em, padding 8/16, chọn = chữ trắng + gạch chân 2px accent, không nền. Cài đặt: `--exec-font-control` 13/18 sans, padding 6/12, chọn thêm nền `--accent-soft`. Select/input: HIFI mono 500 12/18, cài đặt sans 13/18. | `fleet.css .exec-fleet-tab`, `.exec-fleet-select`: đổi role font, bỏ `background` ở trạng thái chọn. |
| FL-10 | B MINOR | Seg Table/Board/Map nằm trong toolbar, HIFI ở masthead cạnh chip Fresh; chip Fresh/As of dính viền ctxbar (SYS-2). | Chuyển `.exec-fleet-seg` vào `.exec-fleet-head`. |
| FL-11 | B MINOR | Drawer (chỉ qua code): không có "Lifecycle" compact spine (HIFI `#dsp`, suy ra được từ stage), nút chính là "Open Alpha 360" (HIFI "Open alpha", `btn pri`). Stage chỉ liệt kê ở Identity. | `FleetDrawer.tsx`: thêm `<JourneySpine variant="compact">` sau Flag. |
| FL-12 | A | Drawer: khối Position (allocation, Net PnL, unrealized, exit criteria), "Still open", nút "Archive alpha…" (FE-025, FE-027/028, FE-034, FE-015). | Chờ Codex. |
| FL-13 | C | Subtitle "Identity only. Allocation, PnL and equity are not shown on this screen."; KPI 5 ô theo `summary` (Alphas, Deployments, Portfolios, Need attention, Research only) thay cho 4 ô HIFI; select Sort thay cho sắp xếp bằng ⇅ ở header cột; cờ Fresh + "As of" theo envelope. | Không. |
| FL-14 | C | Số tab dạng "~3" cho Real-funded (cận trên khi alpha ở cả Canary và Live), quy tắc trung thực số xấp xỉ. | Không. |

Narrow 390: dùng được; bảng đổi sang thẻ (không bị cắt), thanh công cụ xuống dòng, ô tìm kiếm full width, Sort và Owner với tới được; KPI 2 cột (HIFI 1 cột dưới 660, `auto-fit minmax(150px)`: MINOR, chấp nhận). Nút Compare disabled vẫn chiếm một dòng mỗi thẻ (xem FL-3).

Đếm Fleet: A = 4 (FL-4, 5, 6, 12); B MAJOR = 1 (FL-1); B MINOR = 7 (FL-2, 3, 7, 8, 9, 10, 11); C = 2 (FL-13, 14).

## 3. Operations (`screens/operations/index.tsx`, `QueueTable.tsx`, `OperationDock.tsx`, `css/operations.css`)

| ID | Lớp | HIFI so với cài đặt | Sửa nhỏ nhất |
|---|---|---|---|
| OP-1 | A | KPI "Unknown outcomes / Pending receipts / Display catching up" cần đếm theo trạng thái do server tính (FE-043 `status_counts`). Cài đặt thay bằng In scope, Matching, Loaded, Read (số server đã nêu). | Chờ Codex. |
| OP-2 | A | Cột Intent và Display (FE-020 preview, FE-032 receipt/display axis), seg Source "Admin journal" và tab Audit (FE-021), lens "Mine" (FE-030, disabled kèm lý do), tab Exceptions và số đếm (FE-031), bảng Source health có Freshness (FE-021). | Chờ Codex. |
| OP-2b | A | Dock: Acknowledge, Resolve, textarea ghi chú ≥12 ký tự (FE-015 eligibility; lệnh thuộc Codex, Rules 10.11). Đã disabled kèm lý do. | Chờ Codex. |
| OP-3 | **B MAJOR** | **Cột "Next" không còn là cột hành động.** HIFI: "Check original request" là nút (`btn`), "Open obligations" là link, "Display updating" là chữ; đây là CTA an toàn duy nhất cho kết quả Unknown/Uncertain ("Do not send it again"). Cài đặt: cả 8 hàng đều in cờ "UNACKNOWLEDGED" giống nhau (lens mặc định đã lọc đúng trạng thái này nên cột không mang thông tin) và "Check the original request" chỉ là chữ `exec-ops-meta`, không phải điều khiển; hàng UNKNOWN OUTCOME (11:58Z) trông giống hàng khác. | `QueueTable.tsx` cột `next`: nếu `outcome.checkOriginal` render `<button className="exec-ops-apply" onClick={() => onOpen(row)}>Check original request</button>`; chỉ in Flag triage khi `triageState !== "UNACKNOWLEDGED"` hoặc khi lens "All". |
| OP-4 | B MINOR | Ô Target: HIFI tên đậm có link + dòng thao tác "Adjust target budget" (sans 13px, `.sub` 12px); thời gian mono "14:12Z". Cài đặt in `Portfolio pf_TEST_ONLY_canary` (mono, id thô) + `portfolio/adjust-target-budget · Real-funded · Critical` (command_key thô, 12px) và thời gian "22 Aug 12:00Z" (sans). Tên đối tượng chưa publish (A) nhưng command_key có thể được diễn đạt lại. | `outcome.ts`: bảng `commandKey → "Adjust target budget"`; `QueueTable.tsx` Time dùng `exec-font-id`. |
| OP-5 | B MINOR | Cửa sổ thời gian: HIFI ctxbar hiện chip khóa "Window fixed: 24H Operations" (`data-window-lock`) và seg Range cục bộ 24H/7D/30D/90D/ALL. Cài đặt: ctxbar vẫn hiện 7D/30D/90D/ALL với 90D sáng (đã disabled, lý do "Window applies when the server supports it") trong khi bảng đang lọc 24H, hai điều khiển mâu thuẫn; seg cục bộ thiếu 90D, nhãn "All time". `ContextBar` đã có prop `windowLock` (`ContextBar.tsx:44,90`). | `ExecutionPreviewRoute` hoặc screen: truyền `windowLock={{ effective: "24H Operations", reason: … }}`; thêm 90D vào `WINDOWS`. |
| OP-6 | B MINOR | Ba dòng chữ rời nhau giữa toolbar và bảng: "Mine: Not published (FE-030)…" (11px), "Not published (FE-020) Intent axis." và "(FE-032) Display axis and amounts." (13px, không khung). HIFI giữ cấu trúc bằng cột thật. | `QueueTable.tsx`: thêm hai cột "Intent" và "Display" với ô `Not published (FE-020/FE-032)` rồi bỏ `.exec-ops-np-list`. |
| OP-7 | B MINOR | Source health nói "Not published (FE-021)… nothing assumed healthy" trong khi Overview cùng bản build in PARTIAL ×3 theo profile từ composition read. Hai màn kể hai câu chuyện khác nhau. HIFI: tóm tắt "· 2 of 3 partial" + bảng Profile/State/Freshness. | Operations đọc cùng `sourceHealth` (hoặc link sang Overview) và in tóm tắt trong `<summary>`. |
| OP-8 | B MINOR | Tab: HIFI mono 500 12/18 caps, gạch chân; cài đặt `.exec-ops-tab` hộp có viền, 13/18 sans. Tab "Exceptions" thiếu số đếm (A, FE-031). Chip masthead "Observed …" + "Source journal unavailable" thay cho chip "Fresh · 12:04Z". | `operations.css .exec-ops-tab`. |
| OP-9 | B MINOR | Ô "Read: Available" in từ trạng thái ở cỡ KPI 24/32 (`exec-ops-kpi-value`), như một con số; ô KPI là hộp rời (SYS-3). | Dùng `Flag`/body 13px cho ô Read. |
| OP-10 | B MINOR | Dock (chỉ qua code): thiếu nút chính "Check original request" và nút "Send again" disabled với lý do "Blocked until the outcome is known" (HIFI `data-d="unk"`, không cần dữ liệu mới); 14 hàng fact phẳng (Risk tier, Authority, Version...) thay cho bố cục Intent/Receipt/Display + khối Effect + `<details>` Provenance. | `OperationDock.tsx`: thêm hai nút (disabled "Send again" có `why`), gom Version/Authority vào `<details>` Provenance. |
| OP-11 | C | Chip "Observed", tiêu đề "Operations Queue" ở nhóm Command, màn "You can't open this page" cho reviewer/researcher (không có ở shell cài đặt). | Không. |
| OP-12 | C | Thêm bộ lọc thật mà HIFI chỉ để dropdown disabled: Triage, Severity, Verification, Target type, Environment, Command key + Apply (đều là tham số của read đã publish). | Không. |

Narrow 390: dùng được. Bảng thành thẻ (không bị cắt), mọi select và nút Apply với tới, Refresh hiển thị. Khoảng 1.100px dọc cho 8 thẻ là chấp nhận được.

Đếm Operations: A = 3 (OP-1, 2, 2b); B MAJOR = 1 (OP-3); B MINOR = 7 (OP-4, 5, 6, 7, 8, 9, 10); C = 2 (OP-11, 12).

## 4. Incident (`screens/operations/IncidentRootDrawer.tsx`, `css/dock.css`, `css/operations.css`)

HIFI `incident.html` là trang đầy đủ; bản cài đặt là route-drawer phủ lên Operations. Đó là quyết định đã ghi (`review2/07-routes-urls-migration.md` dòng 21 và 125, `README.md` S3 "Incident giữ route, mở dạng drawer từ M09"), nên không tính là deviation; chỉ so nội dung.

| ID | Lớp | HIFI so với cài đặt | Sửa nhỏ nhất |
|---|---|---|---|
| INC-1 | **B MAJOR** | **Phần "Not published" (Evidence, Operations taken, Resolution gates, Timeline, Assignee) nằm dưới nếp gấp ở cả hai viewport, và footer hành động chiếm gần 40% drawer.** Footer `.exec-dock-actions` gồm 4 `DockAction`, mỗi nút kèm 2 dòng lý do "Not published (FE-015). Acknowledging an incident is an ADMIN-only…": cao ~300px trên viewport 819px (1440×900, 37%) và ~298px trên 763px (390×844, 39%). Vùng thân cuộn chỉ còn ~455px (1440) và ~370px (390); ảnh chụp dừng ở "Resolving closes the incident only…", dòng "Source" ở 390 bị cắt giữa chữ, không có dấu hiệu cuộn. Người đọc thấy nút bị khóa nhưng không thấy chính cấu trúc thiếu gì và vì sao. HIFI: một hàng 6 nút + một dòng `why` ("Relay is not qualified yet · My access"). | `dock.css .exec-dock-actions`: `max-height` + `overflow:auto`, hoặc `DockAction` dùng một dòng lý do chung dưới hàng nút (như HIFI) và để chi tiết FE-015 vào `title`/`aria-describedby`; `IncidentRootDrawer.tsx`: đặt khối "Not published" trước bảng facts. |
| INC-2 | C | Trang đầy đủ thành route-drawer (xem trên). | Không. |
| INC-3 | B MINOR | Bốn panel của HIFI (Evidence "0 references" + 4 cờ "Not available", Operations taken, Resolution gates "4 blocked", Timeline "2 events") không có chỗ giữ; cài đặt gộp thành một danh sách 5 mục "Not published (FE-031)" lặp mã lý do `children.reasonCode` 5 lần. Overview giữ "cấu trúc cuối" bằng placeholder có tên panel, ở đây thì không. | `IncidentRootDrawer.tsx`: 4 `<section>` nhỏ có tiêu đề và một dòng `Not published (FE-031)`, hiện reason code một lần. |
| INC-4 | A | Tiêu đề "Position mismatch requires investigation", chip INC-44, link `paper-grid-v21`, "No assignee" (incident root không có title/summary/assignee). Cài đặt in "Incident inc_fixture_44" + `Account acc_TEST_ONLY_operational · Paper`. FE-031 (children NOT_PUBLISHED), FE-030 (assignee). | Chờ Codex. |
| INC-5 | A | Evidence refs, Operations taken, Gates + thông điệp "4 blocked", Timeline, nút "Record exposure mitigated", "Attach dry-run evidence", ô ghi chú giải quyết (FE-031 feed, FE-015 eligibility; lệnh thuộc Codex). Cài đặt chỉ có 4 nút: thiếu hai nút vì không có gate nào được publish. | Chờ Codex. |
| INC-6 | B MINOR | Thanh trạng thái: HIFI ba hộp liền nhau (`margin-right:-1px`), mono 500 12/18 caps .08em, padding 8/16, trong một panel kèm "Forward only · every transition is audited". Cài đặt `.exec-ops-rail li`: ba hộp rời `gap: var(--space-2)`, sans 13/18, viền `--line-strong` giống nút bấm dù không tương tác (ảnh: "Open/Mitigated/Resolved" trông như nút). | `operations.css .exec-ops-rail`: `gap:0`, `li+li{margin-left:-1px}`, bỏ `cursor`/dáng nút (ví dụ viền `--line`); giữ `<ol aria-label>`. |
| INC-7 | B MINOR | HIFI gộp "Open · Critical" thành một cờ ở masthead; cài đặt tách State (cờ nhỏ) và Severity (chữ "Warning") thành hai hàng trong bảng facts, không có masthead riêng. | `IncidentRootDrawer.tsx`: thêm Flag "State · Severity" ở dòng subtitle. |
| INC-8 | B MINOR | D9 "disabled + reason + My access": `DockAction` có `accessHref` nhưng drawer không truyền, nên không có link "My access" (ảnh 1440 và 390). | `IncidentRootDrawer.tsx` và `OperationDock.tsx`: `accessHref="/execution/access"`. |
| INC-9 | B MINOR | Offset drawer (SYS-4): bắt đầu y=81 thay vì 52. | Xem SYS-4. |

Narrow 390: drawer mở được, nút Close ở góc phải với tới được, các nút hành động chạm được; vấn đề là INC-1 (vùng đọc chỉ ~370px, dòng "Source" cắt). Không có bảng bị cắt.

Đếm Incident: A = 2 (INC-4, 5); B MAJOR = 1 (INC-1); B MINOR = 5 (INC-3, 6, 7, 8, 9); C = 1 (INC-2).

## 5. Cockpit / Approvals (`screens/cockpit/*`, `css/cockpit.css`)

Bố cục ba cột khớp HIFI: hàng đợi 268px, evidence `minmax(0,1fr)`, rail 316px, khoảng cách 16px (đo ảnh: 244 đến 512, 1108 đến 1424; `cockpit.css` `.exec-ck`). Thẻ hàng đợi (tag kind, tiêu đề, cờ PENDING/BLOCKER/NEEDS YOU, thanh SLA, dòng thời hạn) khớp tốt.

| ID | Lớp | HIFI so với cài đặt | Sửa nhỏ nhất |
|---|---|---|---|
| CK-1 | **B MAJOR** | **Lần tải đầu hiển thị trang gần như trống.** HIFI chọn sẵn một yêu cầu (`S.sel`) nên giữa và rail đã có evidence, verdict, ô ghi chú. Cài đặt không chọn gì (`selectedKey = url.value.sel ?? pathSelection?.id ?? null`): giữa 540px chỉ có hộp "Nothing selected / press J to start", rail chỉ có "Select a request…". Người duyệt phải click hoặc bấm J mới thấy nội dung quyết định. Đây không phải quyết định đã ghi: test chỉ khẳng định "nothing selected says so" (`cockpit.test.tsx:416`). | `cockpit/index.tsx`: khi `selectedKey === null`, có hàng, và viewport ≥1100px, gọi `urlSet({ sel: items[0].key }, { replace: true })` (ưu tiên hàng "Needs you"); giữ Esc để bỏ chọn. |
| CK-2 | B MINOR | Phân cấp chữ: H1 "Approvals" dùng `--exec-font-subtitle` (400 14/20) qua `.exec-ck-page > .exec-ck-mast .exec-ck-h`; HIFI `h1{400 24/32}` (Overview, Fleet, Operations của chính bản cài đặt đều 24/32). Tiêu đề evidence `.exec-ck-evidence .exec-ck-h` 14/20 (HIFI ~20px trong ảnh); h2 verdict `.exec-ck-vh` `--exec-font-section` 600 15/22 so với HIFI `.vd h2` 500 18/26. | `cockpit.css`: đổi hai selector đầu sang `--exec-font-title`, `.exec-ck-vh` sang 500 18/26 (không có role, dùng `--exec-font-subtitle` hoặc thêm role). |
| CK-3 | B MINOR | Masthead: HIFI chip "Fresh · 12:04Z", nút "New request", nút "? Keys" (mở bảng phím). Cài đặt: dòng đếm "5 pending · 1 overdue · 1 due soon" (dữ liệu thật, C), không có nút Keys (chức năng cục bộ, không cần dữ liệu). | `cockpit/index.tsx`: thêm nút Keys mở overlay phím tắt (J/K/A/R/N/Esc). |
| CK-4 | B MINOR | Dải phím tắt nằm ngoài panel hàng đợi, full width ở y≈1090; HIFI `.keys` là footer của panel Queue (nền `--sunken`, border-top `--line-strong`), có "?" help, và "Decided today · 2" thu gọn phía trên. A/R/N chỉ thông báo lý do (preview). | Chuyển `.exec-ck-keys` vào `Queue.tsx` footer; thêm `?`. |
| CK-5 | B MINOR | Chip lane thiếu số đếm (HIFI "All 8, R1 1, R2 1, Exit 1, Live 1, ..."); cài đặt chỉ nhãn, font 11/16 so với HIFI 10.5/16 mono (không có role 10.5). | `Queue.tsx`: nối `lensCounts`/`inbox.counts` theo lane nếu server đã trả; nếu chưa, ghi vào backend-requests. |
| CK-6 | A | Lane Archive/Reactivation/Capital (FE-034, đã disabled kèm "Not published (FE-034)"); "Observed and limit" ở bảng checklist (FE-028); biểu đồ evidence "Excluded from this preview" (FE-029); "Ladder" (FE-030); hàng Receipt "Ladder, Call, Receipt ref, What changes" (FE-030); dòng "Counts as 1 of 1 approvals". | Chờ Codex. |
| CK-7 | B MINOR | Verdict thiếu thanh meter phân đoạn (HIFI `.meter i` 30×8, gap 3px, màu accent/warn/bad theo từng tiêu chí) dù đã có số "5 within, 1 watch, 0 blocking"; viền trái 4px đã khớp. | `EvidenceFrame.tsx` verdict: render N ô theo `within/watch/blocking`. |
| CK-8 | B MINOR | Lỗi chữ: banner "Preview build. Decisions are shown here, not recorded. Preview · not recorded." lặp "not recorded" (`index.tsx` ghép `PREVIEW_REASON` sau câu có sẵn). | `cockpit/index.tsx`: bỏ `{PREVIEW_REASON}` khỏi banner hoặc bỏ câu đầu. |
| CK-9 | C | Banner "Preview build" thay cho banner "Source not qualified" của HIFI; lens "Open/Needs you/Yours/Closed" thay cho "Decided today"; breadcrumb "Governance / Approval Inbox", tiêu đề sidebar "Approval Inbox". Nút Approve disabled vì lệnh quyết định chưa nối (Codex sở hữu commands, Rules 10.11). | Không. |
| CK-10 | B MINOR | Khối Receipt/Preview: HIFI `.rc` viền đứt `--ink-soft` + tiêu đề "Preview · not recorded" + hàng Decision, Request, You, Counts as, What changes; cài đặt viền liền, thiếu hàng "You" (Bobby · Manager), tín hiệu "đây là bản xem trước" yếu hơn. | `cockpit.css`: `.exec-ck-panel[aria-label="Receipt"]:not([data-recorded])` đặt `border-style: dashed; border-color: var(--ink-soft)`; thêm hàng "You". |
| CK-11 | A | Nút Approve/Other decisions/Withdraw: gọi quyết định hợp nhất, preview "what changes", receipt (FE-030, FE-015). | Chờ Codex. |
| CK-12 | B MINOR | Narrow 390: chọn một thẻ xong, evidence và rail nằm cách ~800px bên dưới danh sách 5 thẻ (ảnh: queue y=330 đến 1150, evidence sau đó) mà không cuộn tới; HIFI cũng xếp dọc nên chỉ coi là MINOR. | `index.tsx` `select`: `scrollIntoView` tới `.exec-ck-main` khi cột đã xếp dọc. |

Narrow 390 (cockpit-narrow, cockpit-r1-narrow): dùng được, không bảng nào bị cắt (bảng "Checklist findings" và "Artifact passport" giữ 3 cột, ô Criterion xuống 4 đến 5 dòng nhưng đọc được), ô Note và nút với tới được; rail nằm dưới evidence.

Đếm Cockpit: A = 2 (CK-6, CK-11); B MAJOR = 1 (CK-1); B MINOR = 8 (CK-2, 3, 4, 5, 7, 8, 10, 12); C = 1 (CK-9).

## 6. Bảng đếm

| Màn | A | B MAJOR | B MINOR | C |
|---|---|---|---|---|
| Overview | 5 | 1 | 6 | 3 |
| Fleet | 4 | 1 | 7 | 2 |
| Operations | 3 | 1 | 7 | 2 |
| Incident | 2 | 1 | 5 | 1 |
| Cockpit | 2 | 1 | 8 | 1 |
| Hệ thống (SYS-1..6, không cộng vào trên) | 1 | 0 | 3 | 2 |
| **Tổng (5 màn)** | **16** | **5** | **33** | **9** |

## 7. Năm sửa MAJOR theo tác động người dùng

1. **OV-8, Overview "Needs attention" bị cắt ở 1440.** Cột Open (đường vào Operations) và SLA không nhìn thấy trên màn đích của người quản lý. Sửa: `overview/index.tsx` render danh sách `.item` thay vì `CardsTable` 5 cột trong panel 1/3.
2. **OP-3, Operations cột "Next" không còn là hành động.** Hàng Unknown/Uncertain không có nút "Check original request" và cả 8 hàng cùng cờ UNACKNOWLEDGED. Sửa: `QueueTable.tsx` đổi cột `next` thành nút/link, chỉ in cờ triage khi khác UNACKNOWLEDGED.
3. **CK-1, Cockpit không chọn sẵn yêu cầu nào.** Lần tải đầu: giữa và rail trống. Sửa: `cockpit/index.tsx` auto-select hàng đầu (ưu tiên "Needs you") bằng `urlSet({ sel }, { replace: true })` ở viewport ≥1100px.
4. **INC-1, Drawer Incident: footer hành động chiếm ~40% chiều cao và che khối "Not published".** Sửa: `dock.css .exec-dock-actions` giới hạn chiều cao hoặc gom lý do thành một dòng (như HIFI), đưa khối "Not published" lên trước bảng facts.
5. **FL-1, Fleet mất dấu stage theo màu và mini-spine.** Dữ liệu stage đã có; token `--stage-paper`, `--env-sandbox`, `--env-canary`, `--env-live` và `blocks/JourneySpine.tsx` đã có. Sửa: `fleet.css .exec-fleet-stage[data-stage]` + `FleetTable.tsx` thêm `JourneySpine variant="mini"`.
