# S3 — Kế hoạch dựng V2 cho Paper workbench, Sandbox, Canary, Live, New request (2026-10-19)

Chủ: Claude. Bobby quyết ngày 2026-10-19: dựng V2 cho năm màn này theo hi-fi trong artifact "Execution V2 Screens". Bản phân tích dưới đây do một agent chỉ-đọc lập (xem ảnh hi-fi và mã V1/V2), không phải quyết định. Quyết định D1–D13 tôi áp dụng theo khuyến nghị của phân tích (xem mục "Quyết định áp dụng" ở cuối) và chờ Bobby phủ quyết; không quyết định nào đổi chức năng đang chạy của V1.

# Kế hoạch dựng V2 cho 5 màn: Paper workbench, Sandbox, Canary, Live, New request (+ drawer)

Phân tích chỉ-đọc, không sửa gì. Nhánh `claude/fe-parity`, cây `/home/bobby/portal-research-fe`. Đường dẫn bên dưới tính từ `apps/portal/frontend/src/execution/` trừ khi ghi khác. Chữ "V2" = thư mục `v2/`.

Ảnh hi-fi đã trích ra `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/screens-art/` và đã xem: `deployment-{mgr,res,wire}`, `hl-deployment-orders`, `sandbox-{mgr,res,v1}`, `canary-{mgr,res}`, `live-{mgr,res}`, `hl-live-mismatch`, `new-approval-{mgr,res}`, `hl-new-approval-drawer`. Các trạng thái không có ảnh (normal/loading/partial/stale/guarded/mismatch/gap, source-not-qualified) tôi đọc từ mã HTML/JS của hi-fi trong `upgrade/execution_loop/design/hifi/v2/` (`deployment.html`, `sandbox.html`, `canary.html`, `live.html`, `new-approval.html`, `modules/stage.js`), nên đó là bằng chứng bằng mã, không phải bằng ảnh.

## 0. Sáu phát hiện quyết định cách làm

1. **Dữ liệu thật của Sandbox, Canary, Live gần như trống ở thời điểm này.** V1 chỉ vẽ phần thân hi-fi khi lab truyền `visuals` (smoke); route sản phẩm không bao giờ truyền. Fixture công bố `execution-{sandbox-certification,canary-control-room,live-full-operations}.unavailable.valid.json` cho thấy `runtime_state: null`, KPI `value: null`, mọi panel `unavailable`. Schema còn ghim hằng số nguồn tối: `series.points maxItems 0`, `rollback_readiness.ready const false`, `production_command_active const false`, `positions/blotter.rows` là object tự do (≤80 thuộc tính, không có kiểu), `source_panels.*.data` là object tự do (≤16 thuộc tính, không đặt tên khóa cho bộ ba Internal/Broker/Difference). Hệ quả: V2 của ba màn này đúng cấu trúc hi-fi nhưng trên sản phẩm sẽ hiện chủ yếu "Not available" hoặc "Not published (FE-xxx)". Muốn thấy đủ hi-fi chỉ làm được bằng fixture mức view-model ở lab/unit test (lane `FIXTURE_LAB`), không bằng double dạng wire hợp schema. Paper workbench là ngoại lệ: profile `/screens/paper/{id}` có dữ liệu thật (orders, fills, positions, account_equity, observation_gate).
2. **Hai route thật đã tồn tại và phải giữ.** `POST /governance/approvals` (New request; `delivery_policy.governance_write_enabled: true` trong registry) và `POST /governance/sandbox/capture-note` (ghi chú review của Sandbox, có capability `SANDBOX_NOTE` từ `getReviewCaptureCapabilities`). V1_SUBSCREEN_DISPOSITION gọi đây là "POST thật duy nhất ở stage". Phần còn lại (Halt/Reduce/Close, Hold/Reduce/Rollback/Request scale, Submit for review, Request exit review, Request Sandbox exit review) không có route lệnh, nên disabled kèm lý do. Câu "không có lệnh thật" của yêu cầu cần Bobby xác nhận lại cho hai ngoại lệ này (quyết định D1).
3. **Cùng một route có thể trả thân V1 hoặc V2.** Workspace SCOPED_V2 trả `portal.execution.following-parent.v2` ở `/deployments/{id}/{certification,canary}` và `portal.execution.live-source-operations.v2` ở `/deployments/{id}/live`. Các reader V1 (`readSandboxCertification`, `readCanaryControlRoom`, `readLiveFullOperations`) từ chối thân đó (`v1Refusal`). Cổng `ExecutionApi.getSandboxCertification/getCanaryControlRoom/getLiveFullOperations` hiện chỉ gọi reader V1. `v2/readers/dispatch.ts` đã có `readSandboxByVersion/readCanaryByVersion/readLiveFullByVersion` nhưng chưa nối vào cổng. Cần thêm phương thức cổng nhận biết phiên bản (việc W0b).
4. **V1 reader bỏ rơi nhiều khối hi-fi cần.** Canary/Live V1 không đọc `positions`, `blotter`, `orders`, `series`, `open_order_footer` (chỉ giữ `PanelEnvelope`), và không đọc nội dung `data` của `source_panels`. V2 phải viết reader mới (mỗi màn một reader trong thư mục của nó), tay viết theo `v2/boundary.ts`, kèm conformance test như `bffDoubleAlpha.test.ts`.
5. **Canary bị trỏ nhầm.** `v2/screens/alpha/model.ts` `deploymentHref` và `v2/screens/portfolios/routes.ts` đều đưa stage CANARY tới `/deployments/live/{id}` (Live), không bao giờ tới `/deployments/live/{id}/canary`. Sweep 03 cũng ghi V1 LiveOverview không link phòng Canary. Cần sửa hai dòng đó và định nghĩa hành vi khi Live mở một deployment đang ở Canary (quyết định D5).
6. **Hi-fi sai so với dữ liệu ở vài chỗ cố định** (xem mục "độ lệch HiFi" ở cuối): tuổi "Stale 14m" tính ở client, "R1 ✓ R2 ✓" (lịch sử stage), `Runtime: Running since`, `Reconciliation: 1 unknown order`, cột Positions Long/Short/Gross, gauge % used, min summary 24 ký tự (server và V1 là 8).

## 1. Nền chung dùng lại và việc dựng mới

**Đã có, dùng lại** (v2/): `blocks/{Kpi,KpiStrip,SectionPanel,PanelHead,StateBoundary,PanelGate,Triad,JourneySpine,EventFeed,NotPublished,MetricText}`, `charts/{EquityPanel (band, ghost, drawdown, segments hatch, EventRibbon), CompareOverlay, Spark, DivBars, CapitalFlow}`, `Drawer.tsx` (`Drawer`, `DockAction` = nút disabled + một dòng lý do + link My access, `useDockSelection`, `useDockMode`), `cardsTable.tsx` (thẻ ở ≤660px), `Flag` (16 kind), `boundary.ts` (`readDecimal`, `readMetric`, `readAsOf`, `formatAsOf`), `urlState.ts` (`useExecUrlState`, `withContext`), `tabAliases.ts` (đã có surface `paper`), `shell/ContextBar` (`windowLock`, `envLock`), `shell/roleNav.ts` (`holds`, `V2_CAPABILITY`), `readers/dispatch.ts`, `readers/liveSourceOperations.ts`, `testkit/{matrix,negative,scale}`. Mẫu màn: `v2/screens/alpha` (hook `useRead`, model, tab theo URL, `sel` mở Drawer).

**Chưa có, cần dựng một lần cho cả năm màn (W0a, một writer):**
- `StageHeader` (khung guard viền kép cho Canary/Live, viền trái cho Sandbox, crumb, thẻ stage "Real capital at risk", ba chip Runtime / Display freshness / Reconciliation, `JourneySpine variant="compact"` có điều hướng bằng `onSelect`, ô `extra` cho thanh Trial day). Hi-fi `modules/stage.js` `G.head`.
- `Tabs` dùng chung (tablist, mũi tên, roving tabindex, giá trị trong `?tab=`). Hiện mỗi màn tự viết tablist.
- `CapGauge` (hi-fi `.gg`, vạch 80%).
- `BlockerList` ("What is blocking", viền đỏ trái, một mã ở Provenance).
- Từ điển lý do disabled một nơi (chuyển từ `KIT.WHY` của hi-fi): `noGrant` "Needs the approver grant", `notEnabled`, `liveClosed` "Live decisions are closed on this build", `readOnly`, `relay`. File mới `v2/screens/stage/reasons.ts`.
- Mở rộng `Triad` thêm trạng thái "suppressed" (cột Broker/Difference hiện "Hidden while the figures disagree", khác "Not available") cho Live mismatch.
- `ContextBar`: `EnvLock` thêm `effective` để thanh bối cảnh hiện đúng môi trường của deployment (mở `/deployments/paper/x` mà URL không có `env=paper` hiện đang đánh dấu Real-funded). Cách dùng giống `BLOTTER_ENV_LOCK`.
- `notPublished.tsx`: thêm các FE id mới vào `FE_REQUEST_LABEL` (bảng này giới hạn `NotPublishedId`).
- CSS dùng chung: file mới `v2/css/stage.css` (không đụng `blocks.css`).

**Cổng và reader (W0b, một writer):** `api/ports.ts`, `api/httpApi.ts`, `api/fixtureApi.ts` thêm `getSandboxCertificationVersioned`, `getCanaryVersioned`, `getLiveFullVersioned(deploymentId, {panel?, cursor?})` trả `VersionRead`; reader mới đặt trong `v2/readers/` hoặc thư mục màn. `getDeploymentQuality` và `getFinancialChart({subjectKind:"deployment"})` đã có sẵn trong cổng.

**Bài học từ rules phải theo:** reader dùng `typeof x === "boolean"` và so sánh enum chuỗi, không `.enabled === true` (`failClosed.test.ts`); không `"—"` hay `"N/A"` (`absentValues`); mọi `<button disabled>` có `aria-describedby` (`disabledReason`); không import `*.fixtures` từ mã sản phẩm (`productBoundary` tự quét mọi file dưới `v2/`); không tên cast (`castLeak`: không dùng `dep_88`, dùng `dep_TEST_ONLY_*` trong test); chỉ `font: var(--exec-font-*)`, không hex; V2 chunk chỉ qua `import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(...) : null` như mẫu trong `ExecutionPreviewRoute.tsx`.

**Chuẩn tab và URL (áp cho cả ba màn stage).** Hi-fi dùng slug, V1 dùng nhãn, review2/07 dùng slug ngắn khác nhau. Khuyến nghị: dùng slug của hi-fi làm chính, alias nhãn V1 và slug 07 trong `tabAliases.ts` (quyết định D3):

| Màn | Slug (hi-fi) | Alias nhận thêm |
|---|---|---|
| paper | `overview`, `orders`, `fills`, `positions`, `sessions` | đã có (`accounting` → `overview#accounting`, `evidence` → `overview#evidence`) |
| sandbox | `reconciliation`, `steps`, `promotion-plans`, `timeline` | `Promotion plans`, `plans`, `Steps (7)` |
| canary | `envelope`, `positions-orders`, `reconciliation`, `guard-rule` | `Positions & orders`, `Guard rule`, `positions`, `guard` |
| live | `exposure-orders`, `continuity`, `predecessor-envelope`, `guard-rules` | `Exposure & orders`, `Predecessor envelope`, `exposure`, `predecessor`, `guard` |

Giá trị lạ → tab mặc định + notice một dòng (không im lặng), `replace` để chuẩn hoá URL. Tab V1 của Sandbox/Canary/Live là `useState` cục bộ, chưa có URL, nên không có deep link cũ nào bị phá.

**Khóa cờ và cách chặn chunk.** `v2/flags.ts` đã có `workbench` nhưng route chưa dùng. Đề xuất thêm `sandbox`, `canary`, `live`, `request` (quyết định D2: một cờ `stages` thay cho ba?). Mỗi màn một `const V2X = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/<x>")) : null`, rồi `V2X && isV2Screen("<key>") ? <Suspense>…</Suspense> : <ContainerV1/>`. Build cờ tắt không phát chunk (kiểm bằng grep `dist/assets` như S0-MAP §3). `playwright.config.ts` danh sách `VITE_EXECUTION_V2_SCREENS` cổng 4176 phải thêm các khóa mới. Route V1 và `delivery_profile` registry không đổi; không đổi `screen_id`.

**Chuẩn kiểm thử mọi màn** (rules 9.8.3, UXM07-RULES-CHECKLIST §2): L1 ma trận trạng thái (dùng `testkit/matrix.ts`: loading, ok, partial, stale, denied, unavailable, terminal, empty, unsupported-schema; mỗi trạng thái có tên ổn định). L2 scale (200 hàng, keyset, 1 MiB, `testkit/scale.ts`). L3 negative (`testkit/negative.ts`: decimal là number, exponent, `-0`, enum lạ, thiếu bắt buộc, schema đổi, prototype pollution; đòi: không throw, không rò `probe`). Mỗi reader có `*.conformance.test.ts` so với schema đã phát hành. Writer chỉ chạy vitest tập trung + `tsc`; người tích hợp chạy rộng một lần (rules §10.10a). Mọi biên bản nêu lane `FIXTURE_LAB` hoặc `BFF_DOUBLE`, không gọi là real-API.

---

## 2. Màn 1: Deployment / Paper workbench (flag `workbench`)

### (1) Hi-fi cho thấy gì
Nguồn: `deployment-mgr.jpg`, `deployment-res.jpg`, `hl-deployment-orders.jpg`, `deployment.html`.
- Masthead: breadcrumb "← Alpha · Alpha Fleet / BTC-Trend v3 / Paper monitor", tiêu đề + thẻ PAPER, câu hỏi "Tracking approved evidence? Ready to leave Paper?", hàng `Core · Paper-sim-01 · Simulated · SIM`, link Alpha và Account (Account ẩn với researcher, thay bằng "Account not available").
- Dải 3 ô: Runtime (Running, Since 12 Oct 08:00Z), Display freshness (Stale 14m, Last event), Reconciliation (Reconciling, "1 unknown order · Operations").
- Panel Lifecycle: JourneySpine compact (R1 ✓, R2 ✓, PAPER ●, SANDBOX, CANARY, LIVE), "3 of 7 criteria", nút "Request exit review" disabled "Blocked: 1 criterion unmet · My access".
- Thanh tab 5: Overview, Orders, Fills, Positions, Sessions.
- Overview: "Equity vs approved band" (đường equity + dải band + drawdown tách panel, nhãn SIMULATED, hatch phần mô phỏng, LOW/HIGH, readout) cạnh "Exit gate" (Observation days, Drift vs approved band, Fills reconcile, Cost drift, link "Open exit review"); "Runtime health" (Mode · venue, Open positions, Last source update, Fills counted, Provenance) cạnh "Accounting" (Equity, Net PnL, Fees, Funding "Not available · Counted separately", Cash free · locked); "Execution quality" (Sessions, Orders, Fills, Rejected "Of 2 submitted", Latency "Not available · Broker timestamps not published") có cờ Partial.
- Orders (Client order, Side, Quantity, Price, State, link "Blotter ↗"), Fills (When UTC, Client order, Quantity, Price, Fee SIM), Positions (Symbol, Long, Short, Gross), Sessions (Started, Ended, State).
- Thanh "On scroll" cố định dưới (tên + Running + Stale + Reconciling + ← Alpha). Chế độ nq: mọi số thành "Not available" + lý do ngắn; banner "Source not qualified".
- Researcher: giống Manager nhưng mất link Account (V1 thiếu Accounts trong nav).

### (2) Khối đã có và khối mới
Dùng lại: `StageHeader`/`Tabs`/`CapGauge` (W0a), `KpiStrip`+`Kpi`, `JourneySpine compact` (current=`paper`), `EquityPanel` (đã có `band`, `drawdown`, `segments`, `serverEnvelope`), `SectionPanel`, `StateBoundary`/`PanelGate`, `CardsTable`, `Flag`, `NotPublished`, mẫu `equityInputs` ở `v2/screens/alpha/model.ts`, `DockAction`.
Mới (trong `v2/screens/workbench/`): `model.ts` (profile envelope → view-model, dùng `readDecimal/readMetric`), `OverviewTab`, `OrdersTab`, `FillsTab`, `PositionsTab`, `SessionsTab`, `ExitGatePanel`, `StickySummary` (thanh "On scroll"), `useWorkbenchReads.ts`. Không dùng `workbenchProps` V1 (`paperWorkbenchData.ts` trả chuỗi đã format, không dùng được cho `boundary`).

### (3) Dữ liệu từng khối và khoảng trống
| Khối | Nguồn hôm nay | Khoảng trống |
|---|---|---|
| Danh tính (strategy, portfolio, account, venue) | `getPaperWorkbenchProfile(id,"paper"\|"vnm")` → `deployment` (`strategy_id`, `portfolio_id`, `account_id`, `venue`) | Tên alpha/portfolio không có, chỉ id. **FE-066 (mới đề xuất)**: anchors đọc được. Crumb dùng `strategy_id` làm nhãn. |
| Runtime "Running since" | chỉ `deployment.active` (cờ của nguồn, V1 ghi chú "not a health check") | Không có `runtime_state`/since. **FE-067 (mới)**. Chip hiện "Not published (FE-067)" kèm dòng "Source flag: active"; không vẽ "Running" xanh. |
| Display freshness | `envelope.freshness` + `asOf` | Hiện trạng thái + "Last event 17 Oct 09:14Z"; **không tự tính "14m"** ở client (chỉ in nếu server đưa `age_seconds`). AGING/PAUSED lệ thuộc FE-004. |
| Reconciliation + "1 unknown order" | không có | **FE-067**. Link Operations giữ (không số đếm). |
| Spine (R1/R2 done, days, criteria) | không | **FE-027/028**. Spine chỉ biết `current=paper` từ route; các stage khác "Unknown / Not published (FE-027/028)". Đây là độ lệch có chủ ý so với hi-fi. |
| "3 of 7 criteria" + "Blocked: 1 criterion unmet" | `observation_gate` (observed_days vs policy, trade_count vs policy, `state`, `window_bounded`) | Chỉ có 2 tiêu chí số (ngày, giao dịch) và verdict của server; 7 tiêu chí **FE-028**. Hiện "Observation gate: MET/PARTIAL/BLOCKED" theo `state` của server. Nút Request exit review disabled: lý do "Not published (FE-028)" hoặc lý do gate. `createPaperExit` có trong cổng nhưng V2 không gọi (UXM-09). |
| Equity vs approved band | `account_equity` rows (`equity`, `drawdown` từng điểm, `ts`), `history_windows.account_equity.downsample`; fallback `query_analytics.chart_series`; hoặc `getFinancialChart(subjectKind:"deployment", environment:"paper")` (chưa kiểm server phục vụ kind này) | Band = `N28_RESEARCH_EVIDENCE_JOIN_NOT_ACTIVATED`, **FE-029**: `band` bỏ trống và panel ghi "Not published (FE-029)". Drawdown vẽ từ giá trị đã publish từng snapshot (EquityPanel không tự suy). Cửa sổ 7D/30D/90D/ALL **FE-025** (đặt `windowLock` có `effective`). |
| Exit gate 4 hàng | gate verdict, drift hàng duy nhất INSUFFICIENT_DATA | Hàng Fills reconcile, Cost drift: **FE-028**. |
| Runtime health | `deployment.mode`/`venue`, đếm positions, `updated_at`, `head.total_fills`, `state_digest` | Đủ cho 4 hàng; digest vào Provenance. |
| Accounting | `account_equity` head: equity, net_pnl, fee_total, cash_free/locked, funding_pnl | Funding "Counted separately" giữ; hàng nào null → "Not available". |
| Execution quality | `getDeploymentQuality(id,"paper")`: sessions/orders/fills population, rejected, rejectRate, `latencyState` | Latency "Not available" (đúng hi-fi), cờ Partial theo `latencyState`. |
| Orders / Fills | profile `orders`, `fills` (một trang bounded, không cursor) | Cột Blotter ↗ → `/deployments/blotter?deployment=<id>&order=<id>` (Blotter V2 chỉ thu hẹp các trang đã tải vì thiếu FE-052). Profile có thể ~7,4 MB và ~6 s (comment trong `recomposeContainers.tsx`). |
| Positions | profile `positions` (quantity, side, avg_px_open, mark, unrealized) | Hi-fi cột Long/Short/Gross không có nguồn: dùng cột đã publish; cột hi-fi khác là **FE-051** (A360-1, mở rộng tới deployment). |
| Sessions | chỉ số đếm qua quality; V1 ghi "profile publishes no session branch" | Hàng phiên: **FE-067**. Có thể thử `getQueryAnalytics("deployments", id)` nhóm fact `sessions` (chưa kiểm cho deployment). Tab hiện đếm + "Not published (FE-067)", không bảng rỗng. |
| Chip VN (VN market) | V1 truyền `calendar={null}` cả hai biến thể | Lịch phiên (timezone, cửa sổ, nghỉ trưa, ATO/ATC): **FE-070 (mới)**. Chip "VN market · calendar Not published (FE-070)"; không tính PAUSED. |

### (4) Route, tab, URL, cờ, gating
- Route giữ: `/deployments/paper/:deploymentId` (`EXECUTION_PAPER_WORKBENCH_SCREEN`) và `/deployments/paper/:deploymentId/vn-market` (`..._VNM_SCREEN`) cùng mount một component; biến thể = `cal=vn` (cục bộ). `/deployments/paper` (danh sách) vẫn là V1 `PaperOverviewRichContainer` (Fleet lens thuộc phạm vi khác).
- Tham số: `tab` (mặc định `overview`, không ghi), `cal`, `window`, `env` khoá = `paper` qua `EnvLock.effective`, `workspace_id`, `from`/`ctx`. Anchor `#accounting`, `#evidence` còn dùng (alias có sẵn). V1 mặc định mở Orders khi URL trần; V2 mở Overview (đã ghi trong `tabAliases.ts` "decision 4").
- Cờ `workbench` (đã có). Cửa sổ khoá: `windowLock {reason, effective:"Published window"}`.
- Gating: server là ranh giới (403 → panel denied + My access). Client chỉ ẩn link Account bằng `V2_CAPABILITY.accountsRead` ("execution.accounts.read", tên tạm FE-037) và link Portfolio bằng `portfoliosRead`; researcher nhận "Account not available".
- Làm mới: V1 có realtime profile (`useProfileRealtime`); các màn V2 khác đọc một lần và đọc lại khi vào lại. Khuyến nghị giữ mô hình này + nút Refresh (quyết định D11).

### (5) Hành động
Chỉ-đọc: tab, link Alpha/Account/Operations/Open exit review (điều hướng), link Blotter. Disabled kèm lý do: "Request exit review" (DockAction, `Not published (FE-028)` hoặc lý do gate, My access). Không có ghi.

### (6) Kiểm thử, e2e, double
- L1: `ok`, `partial` (profile rỗng `execution-paper-workbench.partial.valid.json`), `stale` (envelope.freshness STALE), `denied`, `unavailable`, `loading`, VN variant, researcher (mất Account), tab lạ → notice. L2: orders/fills 200+ hàng ("Top 200 of N", keyset khi có), profile 1 MiB và ~7 MB (đo thời gian, không render >200 hàng), chart 5.000 điểm <150 nút. L3: decimal là number, `null` vs thiếu, enum trạng thái lạ → "Unknown", id trùng. Test riêng: `FIXTURE` không chứa số "0" thay cho null; `active:false` không thành "Halted".
- e2e `execution-v2-s1.spec.ts` thêm: `["workbench", "/deployments/paper/dep_TEST_ONLY_paper", '[data-screen="workbench-v2"]']`, `?tab=fills`, `/vn-market`, mỗi route 1440 và 390.
- Double: `answerExecutionBff` đã trả `paperWorkbenchEnvelope(id)` và `deploymentQualityEnvelope`. Cần bản "sparse-realistic" (có orders gồm một UNKNOWN, một FILLED; fills; positions; account_equity ~200 điểm có drawdown) trong `e2e/bffDoubleStage.ts`, hợp schema `execution-paper-read`.

### (7) Ước lượng và file
~22 giờ-writer (18–26). W-PAPER sở hữu: `v2/screens/workbench/**` (index.tsx, model.ts, model.test.ts, workbench.test.tsx, OverviewTab/OrdersTab/FillsTab/PositionsTab/SessionsTab, ExitGatePanel, StickySummary, useWorkbenchReads.ts), `v2/css/workbench.css`.

---

## 3. Màn 2: Sandbox certification (flag `sandbox`)

### (1) Hi-fi
Nguồn: `sandbox-mgr.jpg`, `sandbox-res.jpg`, `sandbox-v1.png` (V1 hiện nay), `sandbox.html`.
- Khung head viền trái vàng: crumb "Alpha Fleet / DOGE-Mom v2 / OKX-Test-01 / Sandbox", thẻ SANDBOX, tiêu đề, sub "DOGE-Mom v2 · OKX testnet", 3 chip (Runtime, Display freshness, Reconciliation "2 OPEN"), spine compact (R1 R2 PAPER ✓, SANDBOX đỏ, CANARY, LIVE). Thanh bối cảnh khoá "Window fixed: Certification run".
- Tab: Reconciliation, Steps (7), Promotion plans, Timeline.
- Hàng KPI 5: Steps passed "4 / 7" (1 failed · 2 unavailable), Open findings, Critical open, Promotion plans, Gate (BLOCKED).
- Reconciliation: Triad (Internal EXECUTION, Broker, Difference DERIVED; 4 hàng Equity, Fees, BTC position, Open orders; "As of"); panel Findings (Finding, Severity, Opened, Status).
- Steps: lưới 4 cột 7 bước, mỗi bước viền trên màu theo trạng thái, cờ Pass/Fail/Unavailable, một câu why, "Checked <at> · <nguồn>".
- Promotion plans, Timeline: bảng.
- Rail: panel "Exit review" (Blocked; danh sách lý do viền đỏ; "Submit for review" disabled "Steps 4 and 6 must pass first"; "Request Sandbox exit review" disabled "Not enabled for this profile"; `<details>` What exit needs, Provenance); panel "Record review note" (ghi chú ≥24 ký tự, nút Record, "Recorded" + Open in Approvals/Copy reference/Write another).
- Trạng thái: normal/loading/partial/stale/nq. Researcher: "You can't open this page. See what you can access · Alpha Fleet". Reviewer: nút Record disabled `noGrant`.

### (2) Khối
Dùng lại: `StageHeader`/`Tabs`, `KpiStrip`, `Triad`, `CardsTable`, `Flag`, `SectionPanel`, `StateBoundary`, `Drawer`/`DockAction`, `BlockerList`, `reasons.ts`, `JourneySpine compact`.
Mới (`v2/screens/sandbox/`): `StepsGrid` (7 ô), `FindingsTable`, `PromotionPlans`, `TimelineTable`, `ExitReviewPanel`, `ReviewNoteForm` (bọc `captureSandboxNote` có sẵn), `model.ts` hợp nhất hai thân V1 (`SandboxCertification`) và V2 (`SandboxParentV2`), reader chỉ đọc thêm phần V1 mà `readSandboxCertification` hiện chưa giữ.

### (3) Dữ liệu và khoảng trống
| Khối | Nguồn | Khoảng trống |
|---|---|---|
| 7 bước, Steps passed | V1: `steps[]` (`step_key`, `evaluation_state` PASS/FAIL/STALE/UNAVAILABLE, `strip_state`, `as_of`, `expires_at`, `summary`, `blocker_code`) + `progress`; V2 parent: `steps.items[]` (`recorded`, `storedEvaluation`, `asOf`, `expiresAt`) | Nguồn tối: cả 7 bước UNAVAILABLE hôm nay. Câu "why" lấy từ `summary`/`blocker_code` đã công bố, không tự viết ("Testnet keys accepted…" của hi-fi là mẫu). Số "4 / 7" lấy từ `progress.passedCount/totalCount`, không đếm lại. V2 parent không có `summary`/`progress`: hiện "Not published". |
| KPI Findings, Critical open | `findings.total_count`, rows `severity/status` | `critical open` do server hay đếm? V1 `certificationBlocked` có lọc client CRITICAL chưa RESOLVED; hi-fi cần số: chỉ in nếu `findings` hoàn chỉnh (`truncated:false`), nếu không "Not available". |
| Triad | V1 `source_panels` (internal/broker/difference) chỉ `PanelEnvelope`; `data` object tự do ≤16 thuộc tính | Tên khóa hàng (Equity, Fees paid, BTC position, Open orders) **không có trong contract**: **FE-072 (mới)**. Cho tới lúc đó Triad cả 3 cột "Not available" + panel_state/lý do. Difference không tự trừ. |
| Findings | `findings.rows` (`severity`, `status`, `identity`, `local_value`, `broker_value`) | Không có "Opened at" (hi-fi cột Opened): "Not published (FE-072)". |
| Promotion plans | `promotion_plans[]` (`plan_id`, `target_stage`, `status` BLOCKED, `blocker_codes`, `created_at`) | Hi-fi cột Envelope (5,000.00 USDT) và Author không có ở đây: "Not published (FE-072)". |
| Timeline | `timeline.rows` (`action`, `actor_user_id`, `created_at`) | Có thật. Mã `action` → nhãn đọc được cần bảng copy (FE-015). |
| Exit review, Submit, Request exit | `progress.eligible`, `blocker_codes`; không có route lệnh | Disabled kèm lý do; dòng blockers lấy từ `blocker_codes`, mã thô vào Provenance (V1_SCREEN_REVIEW: "Rò mã nội bộ" là lỗi cần sửa). |
| Chip Runtime/Freshness/Reconciliation | `runtime_state` null; `sourcePanels[].freshness`; findings mở | Runtime "Not published"; freshness lấy từ panel; Reconciliation: "N open" nếu `findings` hoàn chỉnh, ngược lại "Not reported". |
| Spine | route biết stage=sandbox; lineage R1/R2 có `lineage[]` (kind/value/href) | Spine: current=`sandbox`; R1/R2 hiện link approval từ `lineage` nhưng không "done" (FE-027). |
| Ghi chú review | `getReviewCaptureCapabilities(workspaceId)` + `captureSandboxNote` (key theo ý định, `expected_workflow_version`) | Có thật; tối thiểu 24 ký tự khớp hi-fi và V1 (server tối thiểu 8). Cần `workspaceId` từ manifest; nếu thiếu → disabled kèm lý do. |
| Crumb alpha / "DOGE-Mom v2" | không có `alpha_id/name` | **FE-066**. |

### (4) Route, tab, URL, cờ, gating
Route giữ `/deployments/sandbox/:deploymentId`; `/deployments/sandbox` (tổng quan) vẫn V1. `tab` slug ở bảng trên (V1 chưa có `?tab=`). `windowLock {reason:"The certification run fixes the window", effective:"Certification run"}`; `EnvLock.effective="sandbox"`. Cờ `sandbox`. Gating: server là ranh giới; 403 → thẻ "You can't open this page" kèm "See what you can access" (link `/administration/profile-access` kèm `withContext`) và "Alpha Fleet". Ghi chú chỉ bật khi capability `SANDBOX_NOTE` của server là AVAILABLE; reviewer thấy disabled `noGrant` theo kết quả server, không theo tên vai trò. Không đưa tên capability `sandbox.*` vào client (quyết định D10).

### (5) Hành động
Thật: Record review note (POST `/governance/sandbox/capture-note`; kết quả recorded/replayed/failed; Copy reference; link "Open in Approvals"). Disabled có lý do: Submit for review, Request Sandbox exit review. Chỉ-đọc: tab, link lineage.

### (6) Kiểm thử
L1: hi-fi `normal/loading/partial/stale/nq` ánh xạ sang `ok/loading/partial/stale/unavailable`, thêm `denied`, V2 parent body, V1 body, thân lạ ("unsupported" + `unsupportedText`), researcher/reviewer/operator theo capability set, capture capability AVAILABLE/UNAVAILABLE/null. L2: findings 50 (tối đa trang), timeline cắt `truncated`. L3: reader hai phiên bản, `schema_swapped` (nhầm V1/V2 → không đọc nửa vời), `evaluation_state` lạ, hash sai. Test lưu `request_key` ổn định khi gửi lại cùng payload, đổi payload thì khoá mới; double-click không tạo hai ghi.
e2e: thêm `["sandbox","/deployments/sandbox/dep_TEST_ONLY_sbx",'[data-screen="sandbox-v2"]']`, `?tab=steps`, `?tab=Promotion+plans` (alias), POST `capture-note` thành công và 24-ký-tự guard. Double: `SANDBOX_CERTIFICATION_FIXTURE` đã có; thêm bản có steps PASS/FAIL/UNAVAILABLE và findings (hợp schema V1; `execution-sandbox-certification.v1.schema.json` cho phép rows), cùng thân V2 `following-parent.v2`.

### (7) Ước lượng và file
~18 giờ. W-SANDBOX: `v2/screens/sandbox/**` (index.tsx, model.ts, readSandbox.ts, StepsGrid, FindingsTable, PromotionPlans, TimelineTable, ExitReviewPanel, ReviewNoteForm, tests), `v2/css/sandbox.css`.

---

## 4. Màn 3: Canary control room (flag `canary`)

### (1) Hi-fi
Nguồn: `canary-mgr.jpg`, `canary-res.jpg`, `canary.html`.
- Head khung kép đỏ (guard): crumb, "LIVE · CANARY Real capital at risk", tiêu đề, sub, 3 chip, spine (R1…SANDBOX done, CANARY now, LIVE), thanh "Trial day 6 of 14" + 14 ô + "Exit review in 8 days". Khoá cửa sổ "Trial window".
- KPI 5: Capital consumed (76% of approved), Gross notional, Daily PnL, Open orders (Max 20), Broker equity (Internal …).
- Panel chart "Live vs Paper vs Backtest · Return since canary start" (3 đường + hatch gap Live vs Paper, readout, chú thích "Dashed = simulated").
- Tab: Envelope (bảng Cap/Limit/Approved/Consumed/Used + gauge, cờ "Within envelope"), Positions & orders, Reconciliation (Triad), Guard rule.
- Rail 3 panel: "Promotion decision · Via exit review" (Hold, Reduce, Rollback, Request scale: tất cả disabled "Live decisions are closed on this build" / "Opens at day 14, in 8 days"; `<details>` How promotion works), "Before scale-up" (danh sách blockers), "Rollback readiness" (4 mục: Flatten plan prepared, Paper twin running, Broker data fresh, Last rollback drill).
- Trạng thái thêm `guarded` (broker 14 phút: banner "Scale-up is blocked. Protective actions stay open."). Researcher: "You can't open this page".

### (2) Khối
Dùng lại: `StageHeader`, `Tabs`, `KpiStrip`, `EquityPanel` (đường Live + `ghost` Paper), `Triad`, `CapGauge`, `CardsTable`, `BlockerList`, `DockAction`, `reasons.ts`, `Flag`, `JourneySpine compact`.
Mới (`v2/screens/canary/`): `TrialStrip` (14 ô), `EnvelopeTable`, `PositionsOrdersTab`, `GuardRuleTab`, `DecisionPanel`, `RollbackPanel`, `readCanary.ts` (đọc thêm `positions`, `blotter`, `series`, `envelope_compliance`), `model.ts`. Biểu đồ ba đường dựa `EquityPanel` + `ghost`; đường Backtest thứ ba và hatch gap Live–Paper chưa có trong `EquityPanel` (một `ghost` duy nhất): chỉ cần khi FE-029 có dữ liệu, ghi là việc W-CANARY với W0a hoặc mở rộng `CompareOverlay`.

### (3) Dữ liệu và khoảng trống
| Khối | Nguồn | Khoảng trống |
|---|---|---|
| Header, ids | `deployment` (id, portfolio, account, venue, `declared_environment`), `lifecycle.declared_stage` | Alpha: **FE-066**. |
| Trial day 6/14 | `lifecycle.day_index`, `duration_days` (null khi tối) | "Exit review in 8 days" cần ngày mở: **FE-071 (mới)**. Ô thời gian: nếu `day_index` null → "Trial day not stated" (V1 đã nói thế), không "day 0". |
| KPI 5 | `kpis[]` (`value` null, `unit`, `envelope`) | Tối hôm nay. "76% of approved" là phép chia: không tự chia (D7); in "of approved <số>" nếu server cung cấp, không thì chỉ giá trị. |
| Chart | `series` (`points maxItems 0`, `resolution null`) | Schema chặn điểm. Live: `getFinancialChart({environment:"live", subjectKind:"deployment", metric:"net_pnl"})` (chưa kiểm). Paper twin, Backtest, "Return since canary start": **FE-029 + FE-013 + FE-006** + **FE-072** (series typed cấp deployment). Panel `ChartUnavailable` "Not published (FE-029)". |
| Envelope Limit/Approved/Consumed/Used | `envelope.limits` (capital, gross notional, daily loss, max open orders, duration: Approved đã có chuỗi decimal chính xác); `envelope_compliance` (`limits`, `consumed` null, `headroom` null, `base_risk_profile_verified`) | Cột Limit (chính sách cơ sở) và Consumed, Used % không có: **FE-071**. Gauge chỉ vẽ khi server cho tỷ lệ (D7); cờ Within envelope cũng cần server verdict. |
| Positions & orders | `positions`, `blotter` (rows object tự do, `exact_total` null) | Cột Symbol/Side/Qty/Entry/Mark/uPnL/Leverage và Open orders (Type/Price/Since/Ack latency): **FE-072**. |
| Reconciliation Triad | `source_panels.*.data` | **FE-072** như Sandbox. |
| Guard rule | `command_policy.guard_semantics` (`BROKER_STALE_BLOCKS_SCALE_ONLY`), `protective/scale_up.brokerSyncBlocks` | Có thật: bảng 1 hàng suy từ `guardAsymmetry` (đã có trong `certification.ts`). Cột "Now": freshness của panel broker. |
| Promotion decision 4 nút | `command_policy.protective/scale_up` (`visible/enabled/blockerCodes`), `production_command_active` | Disabled theo D9, lý do `liveClosed`; "Request scale: Opens at day 14" cần FE-071. V1 ẩn nhóm khi `visible:false`; V2 hiện disabled (khác V1, D6). |
| Before scale-up | `lifecycle.blocker_codes`, `envelope.blocker_codes`, `command_policy.*.blockerCodes` | Dịch mã → câu đời thường cần bảng copy (FE-015); mã thô vào Provenance. |
| Rollback readiness 4 mục | `rollback_readiness` = `ready` + `blocker_codes` + envelope | Bốn mục có ngày kiểm tra: **FE-071**; hôm nay chỉ một cờ Ready/Not ready + mã. |
| Guarded (broker stale) | `PanelEnvelope.freshness` của panel broker | Có thật: banner khi freshness STALE; asymmetric lấy từ `brokerSyncBlocks`. |

### (4) Route, tab, URL, cờ, gating
Route `/deployments/live/:deploymentId/canary` (`EXECUTION_CANARY_CONTROL_ROOM_SCREEN`). Header chung với Live: Spine compact `onSelect` điều hướng giữa `/live/:id/canary` và `/live/:id` ("Canary⇄Live", review2/07). Tham số: `tab`, `window` khoá "Trial window", `EnvLock.effective="live"`. Cờ `canary`. Gating: server 403 → "You can't open this page". Hành động: `governance.canary.decide` (tên có thật trong session) quyết định dòng lý do ("Needs the approver grant" nếu thiếu; "Live decisions are closed on this build" nếu có nhưng bị đóng). Việc đọc dựa server, không chặn bằng `governance.canary.read` ở client.

### (5) Hành động
Tất cả disabled có lý do: Hold, Reduce, Rollback, Request scale (UXM-09/10 chưa làm). Link Open exit review (điều hướng tới `/governance/exit-reviews` hoặc cockpit nếu có). Chỉ-đọc còn lại.

### (6) Kiểm thử
L1: normal, loading, partial, stale, guarded, nq, denied, thân V1 / V2 `CanaryParentV2` (proposal envelope DRAFT, chỉ "proposed not effective"), `day_index` null/số, `productionCommandActive` false. L2: positions/blotter 200 hàng, series 5.000 điểm khi có. L3: decimal sai trong `limits`, `status` lạ, `visible/enabled` không boolean (đọc theo `typeof`). Test "cap không bao giờ in `0` thay null", "gauge không vẽ khi thiếu ratio". e2e: `["canary","/deployments/live/dep_TEST_ONLY_live/canary",'[data-screen="canary-v2"]']`, spine Canary⇄Live click, tab alias. Double: `CANARY_ROOM_FIXTURE` có sẵn; thêm bản SOURCE_BACKED hợp schema (panel ready/stale, envelope_compliance populated) trong `bffDoubleStage.ts`; kiểm conformance với `execution-canary-control-room.v1.schema.json` (ràng buộc const phải xem lại, nếu bản populated vi phạm const thì chuyển sang fixture mức view-model).

### (7) Ước lượng và file
~20 giờ. W-CANARY: `v2/screens/canary/**` (index.tsx, model.ts, readCanary.ts, TrialStrip, EnvelopeTable, PositionsOrdersTab, GuardRuleTab, DecisionPanel, RollbackPanel, tests), `v2/css/canary.css`.

---

## 5. Màn 4: Live operations (flag `live`)

### (1) Hi-fi
Nguồn: `live-mgr.jpg`, `hl-live-mismatch.jpg`, `live-res.jpg`, `live.html`.
- Head khung kép đỏ: "LIVE Real capital at risk", crumb, tiêu đề "Live operations", 3 chip (Reconciliation: Matched / MISMATCH / Not checked), spine (… CANARY done, LIVE now). Khoá cửa sổ "Since activation".
- KPI 5: Capital (Allocated), Gross notional (68% of capital), Daily PnL, Open orders, Broker equity ("Matches internal"; khi mismatch: "Hidden · While figures disagree").
- Slot chart: "Live net PnL" (đường + drawdown tách panel, HIGH/LOW); khi MISMATCH thay bằng khung đỏ "Internal and broker figures disagree. Chart hidden until reconciled." + chip Open finding; khi GAP: "Updates are missing from 11:52Z to 12:04Z. Chart hidden…" + Open operation.
- Tab: Exposure & orders (Triad + bảng Positions: Symbol, Side, Quantity, Entry, Unrealised PnL, Leverage, Ack latency), Continuity (State, Gap window, Last update, Affected sources), Predecessor envelope (cờ "Not active for Live", bảng cap đã duyệt), Guard rules (3 hàng: mismatch → broker values hidden; gap → risk-increasing blocked; gap → protective stay open).
- Rail: "Protective ladder · Halt → Reduce → Close" (3 bậc có vạch màu độ cao tăng dần, mỗi bậc nút disabled "Live decisions are closed on this build · My access"), "What is blocking" (Commands are closed…, Risk-increasing blocked…, Canary exit evidence is not available, Provenance).
- Researcher: "You can't open this page".

### (2) Khối
Dùng lại: `StageHeader`, `Tabs`, `KpiStrip`, `EquityPanel` (+ `drawdown`), `Triad` (mở rộng suppressed ở W0a), `CardsTable`, `Flag`, `BlockerList`, `DockAction`, `reasons.ts`. Mới (`v2/screens/live/`): `ProtectiveLadder` (khối mới có nghĩa nghiệp vụ, chỉ ở Live), `ChartSlot` (chart / mismatch / gap / unavailable), `ContinuityTab`, `PredecessorTab`, `GuardRulesTab`, `PositionsTable`, `readLiveFull.ts` (đọc thêm `positions`, `orders`, `open_order_footer`, `series`, `incidents`, `rollback_readiness`; kèm dispatch sang `readLiveSourceOperationsV2` cho workspace SCOPED_V2 với `panel=`/`cursor=`).

### (3) Dữ liệu và khoảng trống
| Khối | Nguồn | Khoảng trống |
|---|---|---|
| KPI 5 | V1 `kpis[]` (broker-derived bị reader V1 tước khi `broker_values_visible:false`); V2 live-source không có KPI | V2 SCOPED: không có tổng; không tự cộng positions (rule "không tính tổng"). Hiện "Not published (FE-072)". Broker equity khi suppress: "Hidden", khác "Not available" (đã mô hình hoá trong V1 là `suppressed`). |
| Chip Runtime | `runtime_state` null (V1) hoặc `runtime.state:null` + `SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED` (V2) | Không có, "Not published". Không "Running" xanh. |
| Chip Reconciliation / chart slot / Open finding | `broker_consistency.state` (UNAVAILABLE/MISMATCH/IN_SYNC), `broker_values_visible`, `finding_href`, `dry_run_reconcile_href` | Có thật; V2 live-source có panel `reconciliation` quan sát lưu giữ, "source_verdict NOT_ASSERTED". Mismatch → slot đỏ (đã là hành vi V1 `exec-mismatch-slot`). |
| Gap slot | `projection_continuity` (`state` CONTIGUOUS/GAP/UNAVAILABLE, `gap_detected` boolean\|null, epoch/sequence, `affected_authorities`) | Khung thời gian "11:52Z to 12:04Z" không có trường (chỉ epoch/sequence): "Not published (FE-072)". `null` ≠ không gap (`liveGuardRules.r4Blocked`). |
| Chart Live net PnL | `series` (`points maxItems 0`); thay bằng `getFinancialChart(deployment, live, net_pnl)` nếu server phục vụ | Windowed return/DD **FE-025/006/013**. Slot vẽ khi có chuỗi, ngoài ra `ChartUnavailable` "Not published (FE-013)". |
| Positions | V1 `positions.rows` (tự do); V2 live-source `positions` (`signed_qty`, `avg_px_open`, `mark_price`, `unrealized_pnl`, `notional`, quan sát lưu giữ, "BOUNDED_RETAINED_NOT_FULL_HISTORY", `exact_total:null`, ≤200/trang) | Cột Leverage và Ack latency hi-fi không có trong `VALUE_FIELDS` V2: "Not published (FE-072)". `returnedCount` là cỡ trang, không phải tổng. Không tô màu theo dấu khi partial. |
| Triad Internal/Broker/Difference | `source_panels.*.data` | **FE-072**; hôm nay "Not available"/"Hidden". |
| Continuity tab | `projection_continuity` | Có thật (state, epoch · sequence, affected authorities, blocker). |
| Predecessor envelope | `predecessor_canary_envelope` (limits chuỗi chính xác, `active_for_live_full`) | Có thật; thiếu → "No Live envelope is on record" (câu hi-fi) chỉ khi server nói; không thì "Not available". |
| Guard rules | `command_policy` (`protective.sourceGapBlocks`, `riskIncreasing.sourceGapBlocks`), `liveGuardRules` | Có thật, 3 hàng suy từ cờ cấu trúc, không từ chuỗi `guard_semantics`. |
| Protective ladder | `command_policy.protective/risk_increasing` (`visible/enabled/blockerCodes`) | Disabled theo D9/D6 (V1 ẩn khi `visible:false`). Thứ tự bậc Halt→Reduce→Emergency close là từ vựng UI, không phải trạng thái. |
| What is blocking | `lifecycle.blocker_codes`, `brokerConsistency.blockerCodes`, `projectionContinuity.blockerCodes`, `realtimeBlockers`, `suppressedBrokerFields` | Dịch mã → câu cần copy dictionary (FE-015). |
| Open orders footer | `open_order_footer.exact_open_order_count` | Hôm nay tối. |

### (4) Route, tab, URL, cờ, gating
Route `/deployments/live/:deploymentId` (`EXECUTION_LIVE_FULL_OPERATIONS_SCREEN`); `/deployments/live` (danh sách) vẫn V1. Nếu `lifecycle.declared_stage` là Canary (`LIVE_CANARY`) màn hiện notice "This deployment is in Canary" với link `/live/:id/canary`, không tự redirect (D5). `tab` slug bảng trên; `window` khoá "Since activation"; `EnvLock.effective="live"`; `workspace_id` giữ. Cờ `live`. Gating như Canary với `governance.live.decide`/`governance.live.read`. Với V2 live-source: `panel`/`cursor` là tham số đọc nội bộ (cursor `lps2.*` opaque), không vào URL trang.

### (5) Hành động
Disabled có lý do: Halt, Reduce, Emergency close (lý do `liveClosed` + My access), không bao giờ là no-op bật như V1 (sweep 03: "enabled no-op if policy enables"). Chỉ-đọc: link Open finding/Open operation (điều hướng), tab. Không ghi.

### (6) Kiểm thử
L1: normal, loading, partial, stale, mismatch, gap, nq, denied, V1 body, V2 live-source body (PARTIAL/NOT_PUBLISHED cho 11 panel), `broker_values_visible` false/true, `gap_detected` null/true/false. L2: positions 200 + `has_more`, 1 MiB (`live-source` giới hạn), cursor từ bộ lọc khác. L3: `broker_values_visible` thiếu = không hiện số broker; broker KPI bị tước ở reader (test cũ trong `liveFull.test.tsx` giữ nguyên bất biến); `exact_total` null không thành 0; thân V2 sai `closed` keys → `unsupported`. Test "mismatch không bao giờ làm rò giá trị broker vào DOM".
e2e: `["live","/deployments/live/dep_TEST_ONLY_live",'[data-screen="live-v2"]']`, canary-stage deployment → notice, tab alias, hai khổ. Double: `LIVE_FULL_FIXTURE` đã có; thêm biến thể mismatch, gap, và thân `live-source.synthetic.valid.json` (đã có trong `packages/contracts/fixtures`).

### (7) Ước lượng và file
~22 giờ. W-LIVE: `v2/screens/live/**` (index.tsx, model.ts, readLiveFull.ts, ChartSlot, ProtectiveLadder, PositionsTable, ContinuityTab, PredecessorTab, GuardRulesTab, tests), `v2/css/live.css`.

---

## 6. Màn 5: New request và biến thể drawer (flag `request`)

### (1) Hi-fi
Nguồn: `new-approval-mgr.jpg`, `new-approval-res.jpg`, `hl-new-approval-drawer.jpg`, `new-approval.html`.
- Tiêu đề "New approval request", phụ đề "Research → R1 gate · when it did not start in Research"; công tắc "Route page | Drawer from the queue" (chỉ của hi-fi, không phải tính năng) và chip "Fresh · 12:04Z".
- Thanh bước "1 · Declare · you, now | 2 · R1 · a quant reviewer, not you | 3 · R2 · capital, only after R1".
- Form: Alpha (chọn, nhãn "ALL AUTHORIZED"/"YOUR ALPHAS"), Evidence run (+ link Run Library), Methodology claim (một claim thì chữ, nhiều thì chọn; `<details>` Ids edit by hand), Summary (đếm "0 · MIN 24").
- Thanh "Still needed": cờ INCOMPLETE + câu "Still needed: an alpha, an evidence run, a methodology claim, a summary of 24+ characters (0 so far)" + nút "Submit for R1 review" (disabled "Fill the missing fields first").
- Aside "What happens next" (Digest, Reviewer, Duplicates). `<details>` "Preview the result states" (Created, Duplicate, Refused, Offline) chỉ để xem thiết kế.
- Kết quả: Created (AP-203, gate R1, quorum 0 of 2, clock 24 h, Open request/New request, Provenance), Duplicate (AP-201 đã có), Refused (CLAIM_NOT_ELIGIBLE), Offline/Uncertain ("Check original request", "Submit again" disabled).
- Biến thể drawer: queue SLA bên trái (Overdue/Needs you/Pending) giữ nguyên, form mở trong dock phải 380px, nút Close, "What happens next" thu vào `<details>`. Operator: "You can't open this page". Reviewer: form read-only "Reviewers decide requests; they don't open them".

### (2) Khối
Dùng lại: `Drawer` (modal ≤1500px, dock khi rộng, Esc, trả focus), `SectionPanel`, `Flag`, `PanelState`, `StateBoundary`. Có sẵn trong V1 và dùng lại logic (không gọi lại giao diện): `useRunSuggestions`/`readRunOptions` (`runSuggestions.ts`), `ApprovalCreateInput/Outcome`, vòng đời `request_key` (`mintKey`, `intent` ref, `inFlight` ref) của `NewApprovalRequestContainer`.
Mới (`v2/screens/request/`): `NewRequestForm` (dùng chung cho trang và drawer), `NewRequestPage`, `NewRequestDrawer`, `StepBar`, `StillNeeded`, `OutcomePanel` (created/replayed/duplicate/refused/failed/offline), `useNewRequest.ts`, `model.ts`.

### (3) Dữ liệu và khoảng trống
| Khối | Nguồn | Khoảng trống |
|---|---|---|
| Danh sách Alpha | V1 container không bao giờ truyền `alphaOptions` (sweep 02: "DEAD"); `getAlphaFleet` có nhưng trang đầu, không `q` (FE-008) | Khuyến nghị lấy alpha từ chính danh sách run `COMPLETED` (`binding.alpha_id/alpha_name`), tức "Alphas with a completed run", không đoán quyền. Nhãn "ALL AUTHORIZED/YOUR ALPHAS" cần server (FE-026): **FE-069 (mới)**. |
| Evidence run | `GET /api/v1/quantbt/runs?limit=50` (`readRunOptions`: COMPLETED, `binding.alpha_id`) | Giới hạn 50 và không lọc theo alpha: **FE-069**. Hết 50 thì picker cắt và nói rõ ("Showing 50"). Route này nằm ngoài `/api/v1/execution/**` nên double hiện không phủ (cần `page.route` riêng). |
| Methodology claim | `eligible_methodology_claim_ids`, `methodology_claims` (grade/state), `methodology_claims_availability` | Có thật; 3 trạng thái (undefined/null+reason/[]) giữ như V1. |
| Summary | – | Hi-fi tối thiểu 24, V1 và server (`execution-governance-product.v1.schema.json`) là 8: quyết định D8. |
| Submit | `POST /governance/approvals` (`governance.approval-create-request.v1`) → created/replayed/duplicate/failed (+`offline`) | Có thật. Receipt 4 trục (delivery/business/projection/venue) cho lệnh khác không áp dụng ở đây; `slaDueAt`, `quorumRequired`, `policyVersion`, `requester` có. "Clock Starts now · 24 h" hi-fi: chỉ in `slaDueAt` nếu có. |
| "Check original request" khi offline | `ApprovalCreateOutcome.failed.offline` + cùng `request_key` | Không có read "tra cứu theo key". Hôm nay nút Check original request mở Inbox; tra theo key cần **FE-069**/FE-030. Retry dùng cùng key và payload (V1 đã làm) là chống trùng. |
| Quyền tạo yêu cầu | không có capability tên `approval.create` trong session hay trong `ELIGIBILITY_ACTION_RULES` | **FE-068 (mới)**. Hôm nay: server refuse → `failed`; reviewer read-only theo hi-fi cần server nói (không theo tên vai trò). |
| Chip "Fresh · 12:04Z" | – | Không có nguồn cho "run registry fresh"; bỏ chip, thay bằng nhãn nguồn khi run list lỗi ("Run Library not available: <reason>"). |

### (4) Route, URL, cờ, gating
Giữ `/governance/approvals/new[?alpha=&run=&claim=]` (đọc một lần khi mở, như V1; tên tham số không đổi). Một route, một component. Cờ `request`. `PreviewFrame` hiện coi `EXECUTION_NEW_APPROVAL_REQUEST_SCREEN` là bề mặt "governance" sáng (`GOVERNANCE_SCREENS`) trừ khi `onCockpit`; V2 cần đưa nó vào nhánh Carbon khi `isV2Screen("request")` (một sửa ở `ExecutionPreviewRoute.tsx`, người tích hợp; quyết định A2 "một theme Carbon").
Drawer từ hàng đợi: tham số `new` hoặc dùng `sel=new`? `sel` của cockpit đang là mã yêu cầu được chọn nên `sel=new` đụng nghĩa; khuyến nghị thêm một khoá cục bộ `compose=request` (thêm codec vào `urlState.ts`, W0a) để back đóng drawer và hàng đợi không đổi (D8). Cockpit cần một nút "New request" trong đầu Queue và mount `NewRequestDrawer` (sửa nhỏ `v2/screens/cockpit/index.tsx` và `Queue.tsx`, W-REQUEST là người duy nhất chạm hai file này). Chú ý: tiêu đề `cockpit/index.tsx` nói "never calls any write" và drawer sẽ phá câu đó; cập nhật tài liệu đầu file và test `cockpit.test.tsx` kiểm "không gọi plan/apply" (New request là POST governance, không phải lệnh plan/apply).
Gating: server là ranh giới; reviewer/operator hi-fi cần capability/eligibility (FE-068); đến lúc đó hiển thị "You can't open this page" khi server trả 403, và form editable cho người còn lại.

### (5) Hành động
Thật: Submit for R1 review (POST, khoá theo ý định, chặn bấm đúp đồng bộ bằng ref). Disabled có lý do: Submit khi thiếu trường ("Fill the missing fields first", câu "Still needed" theo từng trường), khi đang gửi, khi run registry không đọc được. Chỉ-đọc: link Run Library (`/research/quantbt/runs`), Open request, Open Approval Inbox, "New request" (reset khoá + summary). "Preview the result states" của hi-fi là công cụ thiết kế, không đưa vào sản phẩm (kết quả đó phủ bằng test).

### (6) Kiểm thử
L1: form (chưa chọn, đủ, 1 claim, nhiều claim, không liệt kê được claim, run list unavailable/loading), kết quả created, replayed, duplicate (có và không `existingApprovalId`), refused (`CLAIM_NOT_ELIGIBLE` hiển thị mã ở Provenance), failed online, failed offline + retry cùng khoá, đổi payload → khoá mới, drawer: mở/đóng bằng URL, Esc, trả focus, hàng đợi giữ nguyên, 390/834. L2: 50 run, 30 alpha trong picker, summary 2.000 ký tự. L3: `request_key` trùng, outcome thân lạ (ApprovalCreateOutcome unreadable → failed), id có ký tự điều khiển. Test "chặn bấm đúp tạo một POST", "mọi nút disabled có `aria-describedby`".
e2e: `["new-request","/governance/approvals/new",'[data-screen="new-request-v2"]']` và `["new-request-drawer","/governance/approvals?compose=request",'.exec-ck']` cùng test tương tác (chọn run, nhập 24+ ký tự, Submit → created; Submit lần 2 cùng payload → replayed; alpha "RSI" → duplicate bằng cách double đọc body; claim lạ → refused; request failure → offline). Double: POST đã có (`APPROVAL_CREATED`); thêm 4 kết quả theo thân request, và `page.route("**/api/v1/quantbt/runs**")` trong spec hoặc `e2e/bffDoubleRequest.ts`.

### (7) Ước lượng và file
~16 giờ (form + trang + drawer 13, hook-in cockpit 3). W-REQUEST: `v2/screens/request/**`, `v2/css/request.css`, và chỉ trong cockpit: `v2/screens/cockpit/index.tsx`, `v2/screens/cockpit/Queue.tsx`, `v2/screens/cockpit/cockpit.test.tsx` (phần liên quan).

---

## 7. Phân việc, file dùng chung, ước lượng tổng

| Đơn vị | Việc | Giờ | File sở hữu |
|---|---|---|---|
| W0a | Nền UI dùng chung | 9 | `v2/flags.ts` (+test), `v2/tabAliases.ts` (+test), `v2/urlState.ts` (+test, khoá `compose`), `v2/shell/ContextBar.tsx` (+test, `EnvLock.effective`), `v2/blocks/{StageHeader,Tabs,CapGauge,BlockerList}.tsx`, `v2/blocks/Triad.tsx` (suppressed), `v2/blocks/index.ts`, `v2/blocks/notPublished.tsx`, `v2/css/stage.css`, `v2/screens/stage/reasons.ts`, sửa một dòng `v2/screens/alpha/model.ts` `deploymentHref` và `v2/screens/portfolios/routes.ts` (CANARY → `/canary`) |
| W0b | Cổng và reader phiên bản | 7 | `api/ports.ts`, `api/httpApi.ts`, `api/fixtureApi.ts`, `v2/readers/dispatch.ts` (chỉ khi cần xuất thêm) + test |
| W-PAPER | Paper workbench | 22 | `v2/screens/workbench/**`, `v2/css/workbench.css` |
| W-SANDBOX | Sandbox | 18 | `v2/screens/sandbox/**`, `v2/css/sandbox.css` |
| W-CANARY | Canary | 20 | `v2/screens/canary/**`, `v2/css/canary.css` |
| W-LIVE | Live | 22 | `v2/screens/live/**`, `v2/css/live.css` |
| W-REQUEST | New request + drawer | 16 | `v2/screens/request/**`, `v2/css/request.css`, cockpit `index.tsx`, `Queue.tsx` |
| W-E2E | Double và spec | 11 | `e2e/bffDoubleStage.ts` (mới), `e2e/bffDoubleRequest.ts` (mới), `e2e/bffDouble.ts` (chỉ dòng nối), `e2e/execution-v2-s1.spec.ts`, `playwright.config.ts` (danh sách khoá cổng 4176) |
| W-INTEG | Route + kiểm cuối | 6 | `ExecutionPreviewRoute.tsx` (lazy + case + `windowLock/envLock` theo `screenId` + nhánh Carbon cho request), `v2/flagOn.test.tsx`, `v2/flagOff.test.tsx` (nếu cần), `v2/v2Hygiene.test.ts` (chỉ khi cần allowlist), `docs`/packet |
| Tổng | | ~131 giờ-writer | Chưa tính review của Bobby (~3 giờ), một pass so sánh trình duyệt/HiFi (~6 giờ), ghi evidence (~4 giờ), baseline visual ở mốc R2 |

**File dùng chung, chỉ một người được chạm:** `ExecutionPreviewRoute.tsx`, `v2/flags.ts`, `v2/urlState.ts`, `v2/tabAliases.ts`, `v2/shell/ContextBar.tsx`, `v2/blocks/index.ts`, `v2/blocks/Triad.tsx`, `v2/blocks/notPublished.tsx`, `v2/css/stage.css` và `v2/css/blocks.css`, `api/ports.ts`, `api/httpApi.ts`, `api/fixtureApi.ts`, mọi `e2e/bffDouble*.ts` và spec (một người tại một thời điểm), `playwright.config.ts`, `src/vite-env.d.ts` (không cần đổi vì khoá nằm trong chuỗi), `deploy/images/portal-web.Dockerfile` (FE-040, thuộc Codex/ops). Bốn màn không chia sẻ file nào với nhau sau khi W0a và W0b xong.

**Thứ tự và song song.** (1) W0a và W0b chạy song song ngay (hai nhóm file rời nhau), ~9 giờ; hai bên công bố chữ ký kiểu trước (như U2/U3 trong S0-MAP: ~30 phút) để các màn code theo. (2) Cùng lúc, W-PAPER, W-REQUEST và W-E2E (double Paper và Request) bắt đầu ngay vì chỉ dùng cổng có sẵn (profile Paper, `createApprovalRequest`, `runSuggestions`), không đợi W0b; chỉ cần `StageHeader/Tabs` từ W0a cho Paper. (3) Sandbox, Canary, Live bắt đầu khi W0b có phương thức phiên bản (tuần tự: ~7 giờ sau xuất phát); ba màn này song song với nhau, mỗi màn một thư mục. (4) W-INTEG cuối cùng, sau khi cả năm mặc định xuất (export default) tồn tại; có thể dựng sẵn stub để nối route sớm. Đường găng: W0a (9) → màn lớn nhất (Live 22) → INTEG (6) → khoảng 37 giờ lịch với 6 writer; một writer duy nhất ~131 giờ. Ưu tiên giá trị: Paper và New request trước (dữ liệu thật, giá trị trung thực cao), Sandbox (có ghi thật), Canary và Live sau (nguồn tối).

## 8. Đề xuất mã FE mới (CHƯA gửi Codex, cần Bobby duyệt; số tiếp theo sau FE-065, FE-064 đã để trống)

- **FE-066** anchors: `/deployments/{id}/{certification,canary,live}` và `/screens/paper/{id}` mang `alpha_id`, tên alpha, tên portfolio (chỉ có id hôm nay).
- **FE-067** Paper: `runtime_state` + since, verdict đối soát + số lệnh chưa rõ, hàng session (id, started, ended, state).
- **FE-068** self-eligibility cho các hành động: `approval.create`, `sandbox.review_note`, `paper.exit_review_request`, `canary.{hold,reduce,rollback,request_scale}`, `live.{halt,reduce,emergency_close}` (mở rộng FE-015/058/059).
- **FE-069** New request: run list lọc theo alpha + cursor vượt `limit=50`, nhãn phạm vi alpha từ server, tra cứu yêu cầu theo `request_key`.
- **FE-070** lịch phiên VN (timezone, cửa sổ, nghỉ trưa, ATO/ATC, ngày nghỉ).
- **FE-071** Canary: hàng tuân thủ envelope (limit chính sách, approved, consumed, tỷ lệ used, as-of), 4 mục rollback có ngày kiểm tra, lịch trial (`started_at`, `exit_review_opens_at`).
- **FE-072** hàng và chuỗi có kiểu cho stage: khoá `source_panels.*.data` (Triad), `positions/blotter/orders.rows` (kể cả leverage, ack latency), `series.points` cấp deployment, khoảng gap của continuity, cột Opened/Envelope/Author của findings/plans.

Dùng lại id sẵn có: FE-004 (AGING/PAUSED), FE-006/013/025 (cửa sổ, return, drawdown), FE-015 (copy lý do), FE-026 (policy researcher), FE-027/028 (lifecycle, tiêu chí), FE-029 (band, paper twin, baseline), FE-030, FE-037/058 (capability), FE-051 (long/short/gross), FE-052 (blotter theo deployment).

## 9. Rủi ro

1. Ba màn stage trông "trống" trên dữ liệu thật; nếu mong đợi hi-fi đầy đủ ngay khi bật cờ sẽ thất vọng. Cần nói thẳng ở handoff (độ lệch có chủ ý) và đo bằng lane `FIXTURE_LAB`.
2. Double dạng wire hợp schema bị ràng buộc bởi hằng số nguồn tối của schema V1; nếu bản populated vi phạm `const` thì conformance test đỏ. Có thể phải đưa fixture đầy đủ xuống mức view-model (unit/lab), hoặc xin Codex biến thể SOURCE_BACKED hợp schema.
3. Profile Paper ~7,4 MB và ~6 s; V2 đọc một lần mà không còn realtime: cảm giác chậm, có thể mất "tươi". Có contract `execution.paper-workbench.shadow-panel.v1` (panel `orders|positions`, keyset) trong `packages/contracts/openapi/execution-analytics.openapi.json` chưa được FE dùng; cần hỏi Codex route và qualification.
4. Hai ghi thật (New request, Sandbox note) nằm trong màn mà brief nói "không lệnh thật": một lỗi gating có thể để người không đủ quyền thấy nút bật. Server là ranh giới, nhưng test phải khoá hành vi disabled-by-server.
5. Nhầm phiên bản V1/V2 trên cùng route (F8-01): đã có dispatch, nhưng nếu W0b chậm, ba màn stage không có cổng đúng; tránh bằng việc làm W0b đầu tiên.
6. `ExecutionPreviewRoute.tsx` là điểm dồn: sửa sai làm chunk V2 lọt vào build cờ tắt. Gate: `grep -rl "exec-stage\|exec-blk" dist/assets` rỗng khi cờ tắt, `flagOff.test.tsx` DOM identity, `app/bundle.test.ts`.
7. Quy tắc `failClosed.test.ts` cấm `.visible === true`, `.enabled === true` trong mã mới; reader V1 làm vậy là đúng cho V1, V2 phải dùng `typeof`. Dễ chép nhầm.
8. Hi-fi tự mâu thuẫn một chỗ: thanh bối cảnh ở Sandbox hiện "Real-funded" được chọn; sản phẩm dùng `EnvLock.effective="sandbox"`. Ghi vào danh sách độ lệch.
9. Chi phí kiểm thử: bốn màn mới thêm ~14 route×khổ vào `chromium-v2`, một visual ghi baseline mới (chỉ nhóm mới, ảnh chạy trong image pinned) ở mốc R2.

## 10. Quyết định Bobby cần chốt (không tôi quyết thay)

- **D1. Hai ghi thật.** Giữ New request Submit và Sandbox Record review note bật (các POST đã có và được server cho phép), hay tắt chúng cùng các lệnh khác? Khuyến nghị tôi nêu: giữ, vì V1 đang làm và mất chúng là lùi chức năng.
- **D2. Khoá cờ.** Thêm `sandbox`, `canary`, `live`, `request` riêng (bật từng màn) hay một khoá `stages` cho ba màn stage?
- **D3. Slug tab.** Dùng slug của hi-fi (`promotion-plans`, `positions-orders`, `guard-rule`…) hay slug ngắn của review2/07 (`plans`, `positions`, `guard`…); alias cả hai bất kể.
- **D4. Chuẩn "đủ" cho ba màn stage.** Chấp nhận cấu trúc đúng hi-fi + trạng thái trống trung thực trên sản phẩm, và chỉ chứng minh độ trung thực hi-fi bằng fixture mức view-model ở lab; hay chờ Codex phát hành thân SOURCE_BACKED/typed rows (FE-072) trước khi coi là xong.
- **D5. Canary đi vào Live.** Sửa link Alpha 360 và Portfolio 360 để CANARY → `/live/:id/canary`; khi Live mở deployment Canary thì chỉ hiện notice có link (khuyến nghị) hay tự chuyển.
- **D6. Nhóm hành động `visible:false`.** V1 ẩn hẳn (để không giống canary đang chạy); D9 và hi-fi yêu cầu hiện disabled có lý do. Xác nhận theo D9.
- **D7. Gauge "Used".** Cho phép tỷ lệ consumed ÷ approved tính chính xác ở client (hiển thị làm tròn), hay chỉ vẽ khi server publish tỷ lệ (V1 `certification.ts` quy tắc 2: "không tính headroom ở browser"). Khuyến nghị: chỉ khi server publish.
- **D8. New request.** (a) Tối thiểu summary: 24 (hi-fi) hay 8 (server và V1)? (b) Nguồn danh sách Alpha: suy từ run `COMPLETED` (khuyến nghị) hay đọc từ Fleet. (c) Khoá URL của drawer: `compose=request` (khuyến nghị) hay mượn `sel`. (d) Bỏ chip "Fresh · 12:04Z" vì không có nguồn.
- **D9. Công bố mã FE mới.** Duyệt danh sách FE-066…072 để ghi vào `FRONTEND_BACKEND_SYNC.md` và `evidence/UXM-07/backend-requests.md` (việc ghi nằm ngoài mô tả này).
- **D10. Chặn bằng capability.** Dựa vào server (403/typed refusal) cho Sandbox, Canary, Live, New request (khuyến nghị, giống Alpha 360) hay thêm tên capability tạm kiểu `execution.sandbox.read` fail-closed như FE-037 (khiến mọi người dùng bị chặn cho tới khi session cấp).
- **D11. Làm mới.** Màn V2 đọc một lần (+ nút Refresh) như các màn V2 khác, hay nối lại realtime profile của V1 cho Paper và Live. Rủi ro 3 liên quan.
- **D12. Paper profile lớn.** Chấp nhận một đọc 7 MB ở V2 hiện tại, hay hỏi Codex route phân trang `shadow-panel` trước khi bật cờ `workbench`.
- **D13. Độ lệch HiFi cần duyệt.** (a) Chip Runtime/Reconciliation "Not published" thay cho "Running/Reconciling" xanh cho tới FE-067; (b) Spine không đánh "done" R1/R2 cho tới FE-027; (c) không in tuổi "14m" tự tính; (d) Positions Paper dùng cột đã publish thay Long/Short/Gross; (e) Sessions tab và chip VN hiện "Not published" kèm id; (f) bỏ "Preview the result states" và công tắc "Route page | Drawer" khỏi sản phẩm; (g) thanh bối cảnh khoá môi trường theo deployment.

Đường dẫn chính đã đọc: `upgrade/execution_loop/design/{README.md,UXM-01-ia-and-metric-dictionary.md,UXM-02-journeys.md,review2/07-routes-urls-migration.md,sweep/03-source-stage-screens.md,sweep/02-source-governance-ops.md,impl/S0-IMPLEMENTATION-MAP.md,impl/UXM07-RULES-CHECKLIST.md,hifi/v2/{deployment,sandbox,canary,live,new-approval}.html,hifi/v2/modules/stage.js}`, `upgrade/execution_loop/evidence/UXM-07/hifi-comparison-2026-10-18.md`, `upgrade/execution_loop/FRONTEND_BACKEND_SYNC.md`, `upgrade/execution_loop/AGENT_WORKING_RULES.md`, `CLAUDE.md` §3, `apps/portal/registry/registry.json`, `apps/portal/frontend/src/execution/{ExecutionPreviewRoute.tsx,v2/**,screens/{recomposeContainers,containers,NewApprovalRequest}.tsx,certification.ts,liveFull.ts,paperWorkbenchData.ts,api/ports.ts,api/httpApi.ts,runSuggestions.ts}`, `apps/portal/frontend/e2e/{bffDouble.ts,bffDoubleV2.ts,bffDoubleAlpha.ts,execution-v2-s1.spec.ts,screensV2Harness.ts}`, `apps/portal/frontend/playwright.config.ts`, `packages/contracts/{fixtures,schemas,generated}`."


## Quyết định áp dụng (DECISIONS_DELEGATED, chờ Bobby phủ quyết)
| # | Quyết định áp dụng | Lý do |
| --- | --- | --- |
| D1 | Giữ bật hai ghi thật đã có: New request Submit và Sandbox Record review note (server là ranh giới; test khóa hành vi disabled-by-server) | V1 đang làm; bỏ là lùi chức năng |
| D2 | Khóa cờ riêng cho từng màn: `workbench`, `sandbox`, `canary`, `live`, `request` | Bật/tắt từng màn khi review |
| D3 | Slug tab theo hi-fi; alias nhãn V1 và slug ngắn của review2/07 | Deep link cũ không gãy |
| D4 | Chấp nhận cấu trúc đúng hi-fi + trạng thái trống trung thực trên dữ liệu thật cho Sandbox/Canary/Live; độ trung thực hi-fi chứng minh bằng fixture mức view-model (FIXTURE_LAB) | Nguồn đang tối, không bịa |
| D5 | Sửa link CANARY → `/deployments/live/:id/canary`; Live mở deployment đang Canary thì hiện notice có link | Link hiện đang sai |
| D6 | Nhóm hành động ẩn ở V1 hiện dạng disabled có lý do (theo D9 của thiết kế) | Hi-fi và D9 yêu cầu |
| D7 | Gauge "Used" chỉ vẽ khi server publish tỷ lệ | Không tính headroom ở browser |
| D8 | New request: min summary 8 (server/V1), Alpha suy từ run COMPLETED, khóa URL drawer `compose=request`, bỏ chip "Fresh" không có nguồn | Khớp server |
| D9 | Ghi FE-066…072 vào sổ ở trạng thái OPEN; chưa gửi Codex | Chờ Bobby chọn lúc gửi |
| D10 | Chặn bằng phản hồi server (403/typed refusal) như Alpha 360, không thêm tên capability tạm | Tránh khóa mọi người dùng |
| D11 | Đọc một lần + nút Refresh như các màn V2 khác | Nhất quán |
| D12 | Chấp nhận đọc profile Paper lớn ở lần đầu; ghi request hỏi Codex route phân trang `shadow-panel` | Không chặn cờ `workbench` |
| D13 | Chấp nhận các lệch hi-fi (a)–(g): chip chưa publish ghi "Not published", spine không đánh done khi chưa có lịch sử, không tự tính tuổi, cột Positions đã publish, Sessions/VN "Not published", bỏ công tắc Route|Drawer, thanh bối cảnh khóa env theo deployment | Giữ nguyên luật trung thực |

## W0b signatures (cổng nhận biết phiên bản, 2026-10-19)

Writer W0b công bố để ba màn Sandbox, Canary, Live code theo. Đường dẫn tính từ `apps/portal/frontend/src/execution/`. Ba phương thức nằm trong `ExecutionApi` (`api/ports.ts`), cài ở `api/httpApi.ts` (HTTP thật) và `api/fixtureApi.ts` (lab: bọc fixture V1 thành `v1`). Phương thức V1 (`getSandboxCertification`, `getCanaryControlRoom`, `getLiveFullOperations`) và mọi chỗ gọi chúng không đổi.

```ts
// api/ports.ts
getSandboxCertificationVersioned(deploymentId: string, options?: StageVersionedOptions): Promise<Result<SandboxVersionRead>>;
getCanaryVersioned(deploymentId: string, options?: StageVersionedOptions): Promise<Result<CanaryVersionRead>>;
getLiveFullVersioned(deploymentId: string, options?: LiveFullVersionedOptions): Promise<Result<LiveFullVersionRead>>;

// v2/readers/dispatch.ts (kiểu và helper mới; hành vi của dispatch không đổi)
export type SandboxVersionRead  = VersionRead<SandboxCertification, SandboxParentV2>;   // GET /deployments/{id}/certification
export type CanaryVersionRead   = VersionRead<CanaryControlRoom, CanaryParentV2>;       // GET /deployments/{id}/canary
export type LiveFullVersionRead = VersionRead<LiveFullOperations, LiveSourceOperationsV2>; // GET /deployments/{id}/live
export interface StageVersionedOptions { workspaceId?: string }                         // ?workspace_id=
export interface LiveFullVersionedOptions extends StageVersionedOptions { panel?: string; cursor?: string }
export const LIVE_FULL_PAGEABLE_PANELS: readonly LiveSourcePanelName[];                  // 10 panel, không có broker_sync
export function stageVersionedSearch(o?: LiveFullVersionedOptions): { ok: true; search: string } | { ok: false; reason: string };
export function v1Versioned<A, B>(r: Result<A>): Result<VersionRead<A, B>>;             // bọc kết quả V1 (cổng fixture)
// VersionRead<A,B> (đã có) =
//   | { kind: "v1"; schemaVersion: string | null; value: A }
//   | { kind: "v2"; schemaVersion: string; value: B }
//   | { kind: "unsupported"; schemaVersion: string | null; reason: UnsupportedReason }
```

Quy ước kết quả (`Result<VersionRead<A,B>>`):
- `ok: true, value.kind === "v1"`: thân V1, giá trị đúng như reader V1 trả. `"v2"`: thân V2 đã qua reader V2 chặt (`readSandboxParentV2`, `readCanaryParentV2`, `readLiveSourceOperationsV2`). Không bao giờ có đối tượng hình V1 cho thân V2.
- `ok: true, value.kind === "unsupported"` là một câu trả lời đọc được, không phải lỗi mạng: `schema_version` lạ hoặc của route khác, thân V2 sai hình (`V2_MALFORMED`), thân không phải JSON hoặc không phải object (`NOT_AN_OBJECT`, `schemaVersion: null`). Màn dùng `unsupportedText(value)` để hiện câu; kết quả không chứa thân, chỉ chứa `schema_version` (cắt 80 ký tự, đã bỏ ký tự điều khiển). Khác `getGovernanceParent` (cùng kiểu nhưng cổng HTTP của nó trả `unavailable` cho `unsupported`): ở đây `unsupported` ở trong `ok`, đúng như tài liệu cổng đó mô tả.
- `ok: false`: 401/403 là `denied`; 404/409/5xx, lỗi mạng, đọc bị hủy (signal đã abort hoặc abort giữa chừng) là `unavailable`; 429 là `stale`. `reason` giữ `code: message` của server như mọi cổng khác. Không bao giờ throw.
- Live: `panel` phải là một trong 10 panel phân trang (`deployments, positions, sessions, orders, fills, accounts, account_balances, margin_balances, account_sync, reconciliation`) và `cursor` đòi `panel`; sai thì `ok: false, status: "unavailable"` và KHÔNG gửi request. `cursor` là chuỗi mờ do server cấp cho đúng panel đó; cursor hết hạn được server từ chối (409, `unavailable`), màn đọc lại panel từ trang đầu. Sandbox và Canary chỉ nhận `workspaceId`.
- Màn V2 nên dùng `api.withReadSignal?.(signal) ?? api` như các `useRead` hiện có để hủy đọc khi rời màn.
- Ví dụ dùng: `const r = await api.getLiveFullVersioned(id, { panel: "orders", cursor }); if (r.ok && r.value.kind === "v2") r.value.value.panels.orders`.

## W0a signatures (nền UI dùng chung, 2026-10-19)

Writer W0a công bố để Paper, Sandbox, Canary, Live và New request code song song. Đường dẫn tính từ `apps/portal/frontend/src/execution/v2/`. Mọi khối import từ barrel `blocks/index.ts`; CSS đã được import trong từng khối (`css/stage.css`), màn không import thêm. Mọi chuỗi UI tiếng Anh. Chưa có gì được nối vào `ExecutionPreviewRoute.tsx` (việc của W-INTEG).

### Cờ (`flags.ts`)
```ts
EXEC_V2_SCREEN_KEYS  // + "sandbox" | "canary" | "live" | "request" ("workbench" đã có = khóa Paper)
EXEC_V2_PERMANENT_RESERVED_KEYS = ["archived", "replay"]
EXEC_V2_PENDING_KEYS            = ["workbench", "sandbox", "canary", "live", "request"]
EXEC_V2_RESERVED_KEYS           = [...permanent, ...pending]   // isV2Screen(key) trả false cho các khóa này dù manifest liệt kê
```
Quyết định `workbench`: giữ trong tập reserved (nhóm "pending"), cùng bốn khóa mới. Lý do: test `flags.test.ts` đòi mọi khóa không reserved phải được đọc bởi `isV2Screen("<khóa>")` trong mã sản phẩm; hiện chưa có route nào đọc năm khóa này. Khi W-INTEG thêm `isV2Screen("<khóa>")` vào `ExecutionPreviewRoute.tsx` cho một màn thì xóa đúng khóa đó khỏi `EXEC_V2_PENDING_KEYS` trong cùng commit (test sẽ đỏ nếu quên một trong hai nửa). `playwright.config.ts` cổng 4176 đã liệt kê năm khóa (vô hại khi còn reserved).

### URL và tab (`urlState.ts`, `tabAliases.ts`)
```ts
// urlState.ts
export const EXEC_COMPOSERS = ["request"] as const;
export type ExecComposer = "request";
interface ExecUrlParams { /* ...cũ */ compose: ExecComposer | null }   // ?compose=request mở drawer New request; cục bộ, KHÔNG nằm trong CONTEXT_KEYS
// useExecUrlState().set({ compose: "request" })  -> push (Back đóng drawer); set({ compose: null }) -> gỡ khóa

// tabAliases.ts
export type TabSurface = "alpha" | "portfolio" | "paper" | "sandbox" | "canary" | "live";
// default / keys:
//  sandbox: reconciliation | steps | promotion-plans | timeline
//  canary : envelope | positions-orders | reconciliation | guard-rule
//  live   : exposure-orders | continuity | predecessor-envelope | guard-rules
// alias: nhãn V1 ("Promotion plans", "Positions & orders", "Guard rule", "Exposure & orders", "Predecessor envelope", "Guard rules"),
//        slug ngắn review2/07 (plans, positions, guard, exposure, predecessor), "Steps (7)" (đếm trong ngoặc bị bỏ).
resolveTab(surface, raw): TabResolution      // { target:{tab,hash,params}, legacy, notice }  (không đổi chữ ký)
applyTab(surface, search, resolution): { search, hash }
```

### ContextBar (`shell/ContextBar.tsx`)
```ts
export interface EnvLock {
  reason: string;
  /** môi trường của chính màn (deployment): nút này được nhấn thay cho `env` của URL; in "Environment fixed: <nhãn>". */
  effective?: ExecEnv;            // "live" | "paper" | "sandbox"
}
// Cách dùng (integrator, giống BLOTTER_ENV_LOCK): envLock={{ reason: "The deployment fixes the environment.", effective: "sandbox" }}
// Canary/Live: effective: "live" (nhãn Real-funded). Giá trị lạ bị bỏ qua. Không đặt effective -> hành vi cũ (Blotter).
```

### StageHeader (`blocks/StageHeader.tsx`)
```ts
export type StageGuardStage = "sandbox" | "canary" | "live";
export const STAGE_GUARD: Record<StageGuardStage, { word: string; frame: "double" | "left"; risk: boolean }>;
export const REAL_CAPITAL_AT_RISK = "Real capital at risk";           // chỉ in khi risk=true (canary, live)
export const STAGE_CHIP_LABELS = { runtime: "Runtime", freshness: "Display freshness", reconciliation: "Reconciliation" } as const;

export type StageChipValue =
  | { state: "loading" }
  | { state: "not-published"; id: NotPublishedId; detail?: string }   // "Not published (FE-067) Source flag: active"
  | { state: "not-available"; reason?: string }                        // "Not available · <reason>"
  | { state: "flag"; kind: FlagKind; label: string; note?: ReactNode }
  | { state: "dot"; tone: "ok" | "warn" | "mute"; text: string; note?: ReactNode };   // freshness: "Fresh · 12:04Z"
export interface StageChips { runtime: StageChipValue; freshness: StageChipValue; reconciliation: StageChipValue }
export interface StageCrumb { label: string; to?: string | null }       // không có `to` = trang hiện tại (aria-current)

export interface StageHeaderProps {
  stage: StageGuardStage;
  crumb: readonly StageCrumb[];
  title: string;                                   // h1
  subtitle?: ReactNode;
  chips: StageChips;
  spine?: Omit<JourneySpineProps, "variant">;      // current, blocked, stages, selected, onSelect  (luôn variant="compact")
  extra?: ReactNode;                               // trong khung, dưới spine (Canary: thanh Trial day)
  renderLink?: (to: string, children: ReactNode) => ReactNode;   // truyền react-router Link; mặc định <a href>
}
export function StageHeader(props: StageHeaderProps): JSX.Element;
export function StageChipRow(props: { chips: StageChips }): JSX.Element;   // ba chip riêng (Paper có thể dùng)
```
Khung: `data-frame="double"` (Canary/Live, viền kép `--guard`) hoặc `"left"` (Sandbox, viền trái `--env-sandbox`); `data-stage` trên `<header>`.

### Tabs (`blocks/Tabs.tsx`)
```ts
export interface StageTab { id: string; label: string; count?: number | null }   // count in "(7)" chỉ khi là số nguyên >= 0
export interface TabsProps { tabs: readonly StageTab[]; value: string; onChange(id: string): void; label: string; children?: ReactNode; notice?: string | null }
export function Tabs(props: TabsProps): JSX.Element;       // thuần: tablist + tabpanel; Left/Right (quay vòng), Home, End; roving tabindex; aria-controls

export interface UrlTab { value: string; notice: string | null; set(id: string): void }
export function useUrlTab(surface: TabSurface): UrlTab;    // đọc ?tab= qua tabAliases, replace để chuẩn hóa, set() push
export function UrlTabs(props: { surface: TabSurface; tabs: readonly StageTab[]; label: string; children: (active: string) => ReactNode }): JSX.Element;
// <UrlTabs surface="sandbox" tabs={[{id:"reconciliation",label:"Reconciliation"},{id:"steps",label:"Steps",count:7},...]} label="Sandbox sections">{(tab) => ...}</UrlTabs>
```
`id` của tab phải đúng khóa của bảng slug (`tabAliases.ts`). Account360 và Access giữ tablist riêng (chưa đổi).

### CapGauge (`blocks/CapGauge.tsx`)
```ts
export interface CapGaugeProps {
  ratio?: string | null;     // PHÂN SỐ thập phân server đã publish ("0.76" = 76%). undefined = chưa publish; null/sai = không đọc được
  label: string;             // "Capital" -> aria-label "Capital: 76.00% used"
  fe?: NotPublishedId;       // mặc định "FE-071"
  showText?: boolean;        // mặc định true
}
export function CapGauge(props: CapGaugeProps): JSX.Element;
export function fractionToPercent(fraction: string): string | null;   // "0.7634" -> "76.34"; chỉ dịch dấu thập phân trên chuỗi
export function toneOfUsed(percent: number): "ok" | "warn" | "bad";   // >=80 warn, >=95 bad (mốc hi-fi, không phải chính sách server)
```
D7: không bao giờ tự chia consumed/approved; không có `ratio` thì in `Not published (FE-071) Used`.

### BlockerList (`blocks/BlockerList.tsx`)
```ts
export interface BlockerItem { key: string; text: string; code?: string | null }   // text = câu đời thường; code = mã server, chỉ vào Provenance
export interface BlockerListProps {
  items: readonly BlockerItem[];
  title?: string;                  // "What is blocking"
  emptyText?: ReactNode;           // mặc định "Not available" (danh sách rỗng KHÔNG có nghĩa là không bị chặn; truyền "Nothing is blocking." chỉ khi server nói)
  provenance?: ReactNode;          // dòng phụ dưới các mã
  frame?: "panel" | "bare";        // bare = không bọc SectionPanel (đặt trong panel "Exit review")
  label?: string;                  // tên danh sách khi bare
}
export function BlockerList(props: BlockerListProps): JSX.Element;
```

### Triad.suppressed (`blocks/Triad.tsx`)
```ts
interface TriadProps { /* ...cũ */ suppressed?: boolean }   // cột Broker + Difference không vẽ hàng/giá trị/as-of; in "Hidden while the figures disagree."
export const TRIAD_SUPPRESSED_COPY = "Hidden while the figures disagree";
// Live: suppressed = !(broker_values_visible exactly true)   (fail-closed ở phía màn).
```

### FE id mới (`blocks/notPublished.tsx`)
`FE_REQUEST_LABEL` có thêm `"FE-066" | "FE-067" | "FE-068" | "FE-069" | "FE-070" | "FE-071" | "FE-072"` (nhãn theo mục 8). Dùng được trong `NotPublished id=`, `notPublishedText`, `CapGauge fe=`, `StageChipValue`. Là request OPEN, người tích hợp ghi sổ.

### Lý do disabled (`screens/stage/reasons.ts`)
```ts
export const STAGE_WHY = {
  noGrant: "Needs the approver grant",
  notEnabled: "Not enabled for this profile",
  liveClosed: "Live decisions are closed on this build",
  readOnly: "Read-only on this build",
  relay: "Relay is not qualified yet",
} as const;
export type StageWhyKey = keyof typeof STAGE_WHY;
export const STAGE_WHY_KEYS: readonly StageWhyKey[];
export function stageWhy(key: StageWhyKey): string;     // khóa lạ -> câu notEnabled
// <DockAction label="Hold" reason={stageWhy("liveClosed")} accessHref="/administration/profile-access" />
```

### Link Canary (D5)
`alpha/model.ts` `deploymentHref("canary", id)` và `portfolios/routes.ts` `DEFAULT_ROUTES.deployment(id, "CANARY")` giờ trả `/deployments/live/{id}/canary`. `account/model.ts` `deploymentHref` (theo `mode`, không có stage Canary) không đổi.
