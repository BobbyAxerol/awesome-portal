# Kế hoạch frontend V2 — mười phase EL-V2-00…09 — 2026-08-24

Nguồn lệnh: `CODEX_TO_CLAUDE_EXECUTION_PRODUCT_UIUX_REFACTOR_HANDOFF.md` (1.116 dòng, đã đọc trọn),
trạng thái **OWNER_REJECTED_CURRENT_PRODUCT_COMPOSITION**, owner override §0.1 ngày 2026-08-24.

## 0. Xác nhận và thừa nhận

**Xác nhận: đúng mười phase, EL-V2-00 → EL-V2-09, làm tuần tự, mỗi lúc một phase WIP, EL-V2-04 phải
có Bobby duyệt hình ảnh trước khi sang EL-V2-05.** Lane backend §12.11 (BE-V2-A…G) chạy song song và
không cho phép tôi bỏ phase nào.

**Tôi đã sai, cụ thể ở năm điểm — không phải sai chung chung:**

1. **Sai câu hỏi.** Tôi tối ưu "từng khối giống hi-fi" và chưa bao giờ hỏi "toàn bộ ghép lại có đọc
   như MỘT sản phẩm không". Shell sáng bao quanh một khối Carbon đen là seam tôi tự tạo ra bằng chính
   kiến trúc `ExecutionSurface` "two surfaces, not one" — tôi còn viết doc-comment bảo vệ nó.
2. **Sai điểm bám.** Tôi coi "governance light" là hợp đồng bất biến; owner override nói thẳng: một
   workspace Carbon từ Approval Inbox tới Live. Chi tiết đó không sống sót khi gặp shell thật, và tôi
   đã ghim nó vào cả test (`execution-fixtures.spec.ts` assert governance sáng) — test đó giờ là
   assertion lỗi thời phải viết lại.
3. **Sai giọng chữ.** 144 lần `--font-mono` trong `execution.css` là số liệu của handoff, và nó đúng:
   tôi để giọng terminal thành giọng mặc định của cả sản phẩm — tiêu đề trang, nút, nhãn, prose đều
   mono uppercase nhỏ. Terminal đúng chỗ là một *component bằng chứng*, không phải cả trang.
4. **Sai ngôn ngữ trạng thái.** Tôi ghi "screen built" khi thứ tồn tại là *component contract trên
   trang fixtures*. Từ giờ mỗi mục tách bốn trạng thái: `component contract` / `product route` /
   `nested interactions` / `integrated visual approved`.
5. **Review preview của tôi trả lời đúng câu hỏi hẹp và thiếu câu hỏi lớn.** "Làm đúng, 3 điểm không
   chặn" đúng ở tầng an toàn/cách ly (routing, stop gates, zero request) — nhưng tôi không hỏi "sản
   phẩm có dùng được không", và các nút no-op tồn tại vì chính tôi để callback optional.

**Cái gì còn đứng:** facts, 7 states, decimal string, fail-closed, authority envelope, contracts,
fixtures, 1.497 unit test, và patch responsive (handoff chấm KEEP 7/10 — giữ như một *subtask được
đặt tên*, không phải V2). Nội dung đúng; **cách trình bày** bị từ chối.

**Định hướng Bobby chốt thêm (message 2026-08-24):** hi-fi là sàn nội dung tối thiểu; design system
được linh động; giảm chữ không đáng có; terminal + portal side thiên về **chart đẹp, chuẩn, kích
thước, số liệu** hơn là chữ; chữ chỉ ở nơi cần diễn giải/hướng dẫn. Điều này khớp §11.8 của handoff
("HiFi is the capability floor, not a pixel prison") — tôi lấy làm nguyên tắc thiết kế xuyên suốt.

## 1. Kế hoạch từng phase — mô tả của handoff + phần tôi bổ sung chi tiết

Với mỗi phase: **[H]** = handoff yêu cầu (tóm), **[+]** = tôi bổ sung cụ thể, **[Cách]** = cách làm.

### EL-V2-00 — Re-baseline + kiểm kê HiFi + sự thật trong tracking
- **[H]** Đọc trọn 18 file `.dc.html` (kể cả demo props, biến thể ẩn, scripts); dựng ledger §11.6
  từng dòng cho mọi view/tab/state/action/drawer/drill-down; đánh dấu composition `REWORK_REQUIRED`;
  chụp before-screenshots 1280×800/1440×900/1728×1000 **có shell thật**; liệt kê assertion/doc lỗi thời.
- **[+]** Ledger tôi sẽ dựng dạng bảng có 6 cột: `nguồn HiFi → capability → component/route hiện có →
  disposition (implemented / improved equivalent / disabled with reason / hidden by policy / backend
  request / MISSING) → test → evidence`. Thêm cột **"chữ hay chart?"** — với từng block hi-fi tôi ghi
  rõ block đó trong V2 sẽ là chart/số/badge hay là câu chữ, để thi hành chỉ đạo giảm text ngay từ
  ledger chứ không đợi tới lúc viết JSX. Script quét `.dc.html` bằng máy (đếm tab, nút, data-state,
  onclick) để danh sách control không phụ thuộc mắt tôi — mắt tôi đã từng bỏ sót.
- **[Cách]** Đọc 18 file theo cụm archetype (Governance → Workbench → Ops → 360° → Tools → Wireframes
  tổng); mỗi file xong thì đổ luôn vào ledger, không đọc dồn rồi viết dồn. Before-screenshots chụp
  bằng spec mới `execution-product-routes.spec.ts` (shell hiện, không ẩn topbar) — spec này về sau
  thành baseline class thứ hai mà §2.6 đòi.

### EL-V2-01 — Một workspace Carbon theo route
- **[H]** `PortalPresentationMode` ("research-light" | "execution-carbon") đặt **trên** `PortalShell`,
  suy từ screen_id đã resolve (không suy từ delivery_profile); topbar/sidebar/canvas/rail/overlay/
  palette đổi **nguyên tử**; selector hiển thị mode hiệu lực; xoá nhánh `governance →
  operations-carbon-light` và test của nó; Research/Planning không đổi; banner preview nén còn một dòng.
- **[+]** Sẽ có **non-drift gate**: chạy lại 101 baseline QuantBT như một assertion của phase (Research
  không được đổi một pixel). Viết bảng token map: token nào của Carbon phủ lên shell khi ở mode
  execution, token nào giữ nguyên — để diff CSS đọc được thay vì một trận đổi màu. `ExecutionSurface`
  giữ lại làm semantic container (density/spacing), không còn là ranh giới theme; doc-comment
  "two surfaces" viết lại thành lời giải thích tại sao nó từng sai.
- **[Cách]** Làm trên context provider + `data-mode` ở root; một commit riêng cho phần xoá
  governance-light assertions để revert được sạch.

### EL-V2-02 — Typography ngữ nghĩa + primitive workspace
- **[H]** Chốt font thật (bundle IBM Plex hoặc chuẩn hoá Inter+JetBrains Mono và sửa claim); thang
  vai trò khoá §5.2 (title 24/32 sans, KPI 24/32 mono, meta 11/16…); mono rút về số/danh tính/bằng
  chứng; dựng `ExecutionWorkspace`, `ExecutionPageHeader`, `ExecutionTabs`, `ExecutionContextRail`,
  `ExecutionProvenanceDrawer`, `ExecutionTerminal` (bounded); **chưa** restyle 17 màn.
- **[+]** Đề xuất của tôi: **chuẩn hoá Inter + JetBrains Mono** (đường 2 của §5.1) — hai font đã bundle,
  zero rủi ro tải font mới, sửa claim là một dòng doc; nếu Bobby thích IBM Plex thì nói ở goal phase.
  Thêm **gate cấu trúc kiểu failClosed**: test đếm số `font-family` literal trong execution.css phải
  giảm về ≈0 (mọi chữ đi qua role class), và cấm size mới ngoài thang §5.2. Mỗi primitive có fixture
  case riêng trên trang fixtures như mọi component trước nay.
- **[Cách]** Token trước, component sau; một màn nhỏ (Command Center head) làm nơi thử vai trò chữ
  trước khi khoá — đúng yêu cầu "migrate only a small component fixture".

### EL-V2-03 — Preview có state + toàn vẹn tương tác
- **[H]** Thay mount tĩnh bằng preview controller/state machine mỗi route; phân loại mọi control theo
  §8.1 (local UI phải chạy; navigation phải route thật; mutation nguồn disabled kèm lý do); bỏ
  `screenId` khỏi chrome; test cấu trúc "nút enabled phải gây hậu quả quan sát được"; 6 journey §8.2.
- **[+]** Đổi **kiểu prop** để lớp lỗi này không tái sinh: control nào render enabled thì handler
  **bắt buộc** ở tầng type (không còn `onTabChange?`); component nhận `readonly`/`disabledReason`
  tường minh thay vì im lặng khi thiếu callback. Đây là phiên bản UI của bài học `=== true` — làm
  đường sai không compile được thay vì dặn nhau tránh.
- **[Cách]** Một `usePreviewController(screenId)` chung giữ tab/scope/cursor/drawer state + fixture
  mutation mô phỏng có ghi chú "simulated"; journey test viết bằng Playwright trên product route thật.

### EL-V2-04 — Lát cắt dọc chuẩn: Paper Workbench + Paper Exit ⛔ *gate Bobby duyệt*
- **[H]** §10 nguyên văn: masthead quyết định-trước (tên người đọc được + id ngắn + badge stage/
  readiness tách + 1 CTA); lifecycle rail; KPI strip 5 ô; **chart equity thật có trục/tooltip/approved
  envelope/reset/expand/table view — cấm khung trắng**; rail phải theo tab; tab đổi nội dung thật;
  digest/lineage vào Provenance drawer; journey Paper → request exit → Exit Review → quay lại còn
  context; FRESH/AGING/STALE/PAUSED/UNKNOWN + MET/UNMET/INSUFFICIENT đủ.
- **[+]** Đây là phase "chart đẹp, chuẩn, số liệu hơn chữ" thể hiện rõ nhất: tôi sẽ nối **ECharts**
  (đã có trong repo phía Research) cho equity series fixture — trục thời gian thật, đường approved
  envelope, vùng gap, caption một dòng. Trước khi viết JSX sẽ giao **layout proposal đo bằng px** ở
  1440×900 và 1728×1000 (bounding regions, vai trò chữ từng vùng, hành vi rail, ma trận tương tác)
  đúng §14.5 — Bobby duyệt proposal rồi mới code, đỡ một vòng làm lại.
- **[Cách]** Reuse tối đa reader/fixture hiện có (số không đổi, chỗ đứng đổi); mọi câu prose trong màn
  qua bộ lọc "state → consequence → next action", câu nào không thuộc ba loại thì vào disclosure.

### EL-V2-05 — Chuỗi quyết định Governance
- **[H]** Inbox, R1, R2, Exit Review cùng Carbon; sticky decision bar; evidence vào section/tab;
  R2 capital preview phân biệt bằng viền/elevation + nhãn `PREVIEW`, không phải theme khác; request-
  changes chỉ khi backend có verb — không thì unavailable + backend request; test creator/reviewer/
  denied/expired/conflict; bind SGP Control API thật nơi registry cho phép.
- **[+]** BR-EX-30 (7 trường R2 chưa publish) và outcome "Request changes" — hai món treo từ trước —
  được gắn thẳng vào ledger phase này làm disposition `backend request`, khỏi trôi. Bảng SoD/role
  variant sẽ test bằng ma trận (it.each) thay vì từng case lẻ.
- **[Cách]** Làm theo journey Inbox→R1→R2→Exit một mạch để context-preserving navigation là thứ được
  dựng, không phải thứ vá.

### EL-V2-06 — Workbench các stage: VNM → Sandbox → Canary → Live
- **[H]** Tái dùng anatomy Paper đã duyệt; VNM đủ calendar/session/ATO-ATC/settlement; Sandbox đủ 7
  step + triptych + smoke plan; Canary/Live giữ guard band + suppression + bất đối xứng protective/
  risk-increasing; dense content vào tab; command vẫn disabled.
- **[+]** "Guard band không nhuộm đỏ cả trang": tôi sẽ viết quy tắc thành token (band đỏ đặc = duy
  nhất một dải masthead; panel giữ nền Carbon thường) và một visual case so Canary vs Live cạnh nhau
  để bất đối xứng nhìn thấy được. Reuse report từng màn (đúng §11 guide v0.5).
- **[Cách]** VNM trước (gần Paper nhất) rồi Sandbox → Canary → Live theo độ rủi ro tăng dần.

### EL-V2-07 — Operations + Incident + Command workflow
- **[H]** Command Center xếp hạng attention, BUSY/QUIET thật; Queue nối rail cảnh báo theo dòng đang
  chọn, ack ≠ resolve; Incident: evidence/timeline/actions tab, forward-only; Action Drawer đủ
  catalogue + reason + step-up + PLAN/APPLY/VERIFY + PARTIAL/residue + Equivalent CLI read-only;
  **terminal §9 đúng anatomy** (toolbar, cột ổn định, follow/pause, copy/export, typed gap rows,
  202 ≠ success); Break-glass chỉ khi đủ ceremony.
- **[+]** Terminal là component tôi dựng ở V2-02 nhưng phase này mới cho nó việc thật — tôi sẽ ghim
  bằng test "terminal không bao giờ tuyên bố success trên 202" (bài học adapter đã có, nâng lên UI).
  Ba lớp fail-closed của commandPlan/liveFull giữ nguyên làm nền cho VERIFY hiển thị.
- **[Cách]** Queue→Incident→Drawer→Verify→Queue là journey trục; làm trục trước, nhánh sau.

### EL-V2-08 — Entity 360 + Blotter (bề mặt phân tích)
- **[H]** Đủ mọi tab/role lens Alpha/Portfolio/Account; scope lan tới mọi panel; triptych internal/
  physical/difference; Blotter được phần lớn canvas, filter sticky cục bộ, cross-filter/reset, funnel,
  keyset, virtualization; chart đủ tooltip/zoom/reset/expand/table/export/cross-filter;
  insufficient-data tường minh; không recompute tài chính trong browser.
- **[+]** Đây là chỗ tiêu thụ `aggregates_by_currency` đang treo: tổng theo tiền tệ vào footer Blotter
  với ba biến đếm không gộp + `invalid_numeric_count` hiện khi >0 — reader + UI + test cùng một phase,
  đúng luật "không cầu một đầu". 12 analytical tiles của Alpha 360 chuyển từ khung sang chart thật
  cùng cơ chế ECharts của V2-04.
- **[Cách]** Blotter trước (virtualization + keyset đã có sẵn phần nền), 360° sau.

### EL-V2-09 — Lane B nguồn thật + hardening + nghiệm thu V2
- **[H]** Chỉ tiêu thụ capability đã kích hoạt sau §12.11; một màn/một profile một lần, Paper
  read-only trước; so parity fixture/shadow/source, không giấu mismatch; typed 401/gap/cursor/epoch/
  reconnect/backpressure; gate visual/a11y/keyboard/load/memory/DOM đủ các route; chứng minh Research/
  Planning không trôi; rollback về profile cũ; owner sign-off.
- **[+]** Typed-401 của SSE nối lại đúng câu hỏi §8.18 tôi đã gửi codex (EventSource không đọc được
  status → cần typed error frame hoặc preflight) — phase này là nơi câu trả lời của codex được tiêu
  thụ. Shadow parity report tôi sẽ dựng bằng script so từng field fixture vs shadow, xuất bảng lệch.
- **[Cách]** Theo đúng thứ tự BE-V2-E/F/G; mỗi kích hoạt một commit + một dòng evidence riêng để
  rollback từng nấc.

## 2. Trình tự ngay bây giờ (theo §14 và §2.7.6)

1. Commit patch responsive đang treo **dưới nhãn subtask** (không phải V2) — giữ theo yêu cầu §2.7.1.
2. Cập nhật `PHASE_TRACKER.md`: bảng V2 mười phase (bốn cột trạng thái mới) + đánh dấu composition
   `REWORK_REQUIRED`; `ROADMAP_FRONTEND.md` trỏ về kế hoạch này.
3. Chờ Bobby goal **EL-V2-00** → đọc 18 `.dc.html`, dựng ledger, chụp before, liệt kê assertion lỗi
   thời. Xong evidence mới đụng V2-01.
4. Antigravity được mời phản biện hierarchy/type scale/state semantics từ sau EL-V2-00 (§14.6).

## 3. Ràng buộc không đổi

Không đổi backend/contract/safety; `delivery_profile=fixture` giữ; browser không chạm AWS-HK;
fail-closed không yếu đi; số chính xác không đổi — **đổi độ nổi bật mặc định, không đổi sự thật** (§15).
