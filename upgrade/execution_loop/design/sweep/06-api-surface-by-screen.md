# Sweep 06 — API surface (V1) theo màn, đối chiếu HIFI M01–M10

Nguồn (read-only): `execution/api/{ports,httpApi,rows,financialChart,marketCandles,marketContext,observedTimeline,managerRelations,subjectActivity,derivations,profileRead,governanceContext}.ts`, `execution/{screenContracts,operations,commandPlan,analytics,certification,liveFull,adminCatalog,commandCenter,hifiTiles,hifiInsight}`, `screens/{containers,profileContainers,recomposeContainers}.tsx`, `packages/contracts/openapi/*`, `design/hifi/m01..m10.html` (văn bản + `hifi.js`).
Base = `/api/v1/execution`. R = read, C = command/POST có tác dụng, S = stream. HIFI: yes / partly / no. HIFI hiện **không có svg/canvas**; chỉ `equityChart()` (mode pnl|ret|eq) và `spark()` trong `hifi.js`.
HIFI chỉ phủ 10 màn manager; V1 có 30 screen (sweep 01). Mọi màn Governance/Stage/Blotter/Incident/Admin = **no** ở cột HIFI trừ khi ghi khác.

## 1. Bảng ExecutionApi (66 method trong `ports.ts`; gộp theo nhóm khi cùng route-họ)

| Method | Route | Loại | Field/series hiển thị ở V1 | Màn V1 gọi | HIFI |
| --- | --- | --- | --- | --- | --- |
| listApprovals | GET /governance/approvals `view,after,before,limit,workspace_id` | R | row: gate, subject, target, blockerCount/Summary, SLA(state,dueAt), quorum met/required, inert(SELF/QUORUM/BLOCKED), needsYou; counts pending/overdue/dueSoon/mine; inertCount; actor+roles; policyVersion | ApprovalInboxContainer | partly (M09 chỉ "Needs my approval" + link) |
| getApprovalHistory | GET /governance/approvals/history | R | decided: gate, subject, outcome(APPROVED/AWC/DENIED/CHANGES_REQUESTED), by, at, policyVersion | ApprovalInboxContainer | no |
| createApprovalRequest | POST /governance/approvals | C | requestKey, alpha, evidenceRun, methodologyClaim, summary -> created/replayed/duplicate/failed (approvalId, slaDueAt, quorumRequired) | NewApprovalRequest | no |
| getGateR1 | GET /governance/approvals/{id}/r1 | R | passport[], checklist[], locks(SELF_APPROVAL,BLOCKING_FINDINGS,EXPIRED,NOT_ELIGIBLE), eligibility, quorum, SLA, decided, expectedVersion | GateR1ReviewContainer | no |
| getGateR2 | GET .../{id}/r2 | R | readiness groups, capital deltas before/after + breach, R1 lineage (state,expiry,digest,by), artifactDigest, grantName, portfolio/ccy/amount, locks(+CAPITAL_BREACH,R1_NOT_VALID) | GateR2ReviewContainer | no |
| getCapitalPreview | POST /approvals/{id}/capital-preview | R (POST) | lines(label,ccy,before,after,note), maximumAllocated, requestedAmount, decisionEligible, blockers | GateR2ReviewContainer | partly (M04 "Review recall" preview khác lệnh) |
| getPaperExit | GET /governance/exit-reviews/{id} | R | gateMet/gateSummary, promoteTo, lineage, evidence panels, recommendation, activationPlan, quorum | PaperExitReviewContainer | no |
| getLiveReview | GET /governance/approvals/{id}/live | R | live-review payload | GateLiveReviewContainer | no |
| getWaivers | GET /governance/waivers `state,after,before,limit` | R | kind, state(OPEN/WAIVED/EXPIRING/LAPSED), statement, owner, dueAt, blocking, policyVersion, total/filtered | WaiversRegister (probe limit=1/state) | no |
| getReviewCaptureCapabilities, captureR2, createPaperExit, captureSandboxNote | GET /governance/review-capture-capabilities; POST /governance/{r2/capture,paper-exit/create,sandbox/capture-note} | R/C | capture candidates, capability flags | Gate R1/R2, SandboxCertification | no |
| planDecision | POST /commands/plans (decision body) | C | plan: operationId, applyToken, blockers[], warnings[], authority, expectedApprovalVersion, riskTier | useDecision (R1/R2/Exit/Live) | partly (M09 "Three facts" lặp mô hình) |
| applyPlan / pollOperation | POST /operations/{id}/apply (202) / GET /operations/{id} | C / R | status, verification, blockers[], relayReceipt, sourceSideEffectRequested | useDecision, IncidentDetail | partly (M09 Intent/Receipt/Reconciliation) |
| planCommand | POST /commands/plans (EXECUTION_COMMAND) | C | CommandPlan: blockers, applyToken, expiresAt, relayCapability, payloadHash, planDigest, replayed | **không màn nào gọi** | n/a (M04 Review recall cần) |
| getCommandCatalogue | GET /commands/catalog `workspace_id,environment,target_type,target_id,risk_tier` | R | key, group, riskTier, plan/apply/verify required, portalReachable, routeState, blockedReason | AdminCatalogueContainer | no |
| getOperatorTasks / runOperatorTask | GET /commands/tasks; POST /commands/tasks/{id}/run | R / C | task params, R0 run result | AdminCatalogueContainer | no |
| getActivationCapabilities | GET /activation/capabilities | R | owner-enabled flags | AdminCatalogueContainer | partly (M10 "Not turned on for this env") |
| getOperationalComposition | GET /compositions/{command-center,operations,waivers,admin-action-drawer} | R | journal rows(at,actor,command,outcome), commandAuthority, sourceHealth profiles, canaryTwin, data.{command_center,operations,waivers_register} | profileContainers (CC), OperationsQueue, Waivers, AdminDrawer | partly (M01 Needs attention, M09) |
| listOperations | GET /operations `workspace_id,after,before,limit,triage_state,environment,source_status` | R | QueueRow: severity, riskTier, sourceAuthority, sourceStatus, verification, triageState, workflowVersion, ack/resolve by/at/reason/evidenceHash | **chỉ Fixtures**; thật dùng composition | partly (M09 table khác trường) |
| acknowledgeOperation / resolveOperation | POST /operations/{id}/{acknowledge,resolve} | C | expected_workflow_version; resolve cần reason + evidenceHash | OperationsQueueContainer | partly (M09 có nút, không có evidence hash) |
| getIncident | GET /operations/incidents/{id}?workspace_id | R | state rail OPEN/MITIGATED/RESOLVED, sourcePanels, correlatedOperations, evidence, annotations, timeline, resolutionGate, assignedTo | IncidentDetailContainer | no (V1_SCREEN_REVIEW: drawer, chưa vẽ) |
| getMirrorIntegrity | GET /durable-mirror/integrity?environment | R | gap + conflict aggregate x3 env | OperationsQueueContainer | no |
| getCommandCenterSnapshot | GET /command-center | R | snapshot | **không màn nào gọi** (CC dùng composition + realtime) | n/a |
| getScreenProfile | GET /screens/{paper,sandbox,live} | R | ProfileEnvelope; data branches: deployments, orders, fills, positions, sessions, performance, reconciliation, broker_sync, account_sync, account_equity, account_balances, margin_balances, exposure_headroom, journal, venue_accounts, portfolio_allocations, accounts, differences; capabilities[], unavailableBranches | Paper/Sandbox/LiveOverviewRich, StageOverviewContainer | no (fold vào M03 `stage=`) |
| getBlotterProfile | GET /screens/blotter | R | orderId, at, deployment, venue, symbol, type, side, qty, price, status, fee+ccy, brackets, conditional groups; page/aggregates | FullBlotterRichContainer | no |
| getPaperWorkbenchProfile | GET /screens/paper/{id}[/vn-market] | R | deployment obj + orders/fills/positions/sessions/performance/account_equity | PaperWorkbenchRichContainer | partly (M07 header, tab con chưa vẽ) |
| getQueryAnalytics | GET /{alphas,portfolios,deployments}/{id}/query-analytics `source_facts,environment,account_id` | R | chart_series, positions, order_funnel(totalOrders,statusCounts), executionQuality, correlation pairs(rho,overlappingDays), drawdown_overlap(series,overlaps), replay.tradeLog, 12 branch capabilities | Alpha360, Portfolio360, Account360, QueryAnalyticsContainer | partly |
| getAlpha360Resource / getPortfolio360Resource / getAccount360Resource | GET /resources/{alphas,portfolios,accounts}/{id} | R | scoped resource envelope (alpha/portfolio/account + profile_coverage) | Alpha/Portfolio/Account 360 | yes (M05/M04/M06) |
| getBindingResource | GET /resources/bindings/{id} | R | binding resource | AccountsBindingsContainer | partly (M06 toggle Physical binding) |
| getAccountBroker360 | GET /screens/accounts/{id} | R | N28 envelope | **không màn nào gọi** | n/a |
| getFinancialChart | GET /views/equity-chart `environment,subject_kind,subject_id,metric,viewport_px,from_ms,to_ms,include_benchmark,workspace_id` | R | series[id,label,accountId,ccy,points[ms,decimal]], sampling, retention, benchmark, coverage.gaps, clocks | Portfolio360, Account360 | yes (M01/M04/M06 equity) |
| getSourceHealth / getSourceHealthRead | GET /derivations/source-health[?environment] | R | profile: state, freshness, completeness, asOf, globalSequence, retentionFloor, replayEligible, projectionEpoch/Sequence | SourceHealthLiveTiles, Paper/StageOverview | partly (M09 bảng 3 hàng) |
| getDeploymentQuality | GET /derivations/deployments/{id}/execution-quality | R | submitted, riskRejected, brokerRejected, filled, rejected, rejectRate n/d, latencyState, populations | PaperWorkbenchRich | no |
| getPortfolioCapital | GET /derivations/portfolios/{id}/capital | R | allocation/accountBalance by ccy bucket x3 env, unpublishedInputs | Portfolio360Rich | partly (M04 Capital) |
| getAlphaActivity | GET /derivations/alphas/{id}/activity | R | stateCounts, orderStatusCounts, populations, latestObservedAt | Alpha360Rich | no |
| getConditionalGroup | GET /derivations/conditional-groups/{id}?environment | R | legs[] | FullBlotterRich | no |
| getMarketCandles | GET /market/venue-candles `environment,venue,market,symbol,interval,from_ms,to_ms,limit<=6000` | R | candles t,o,h,l,c,v,closeT; coverage; lastCandleClosed | TradeReplayLive (Alpha360) | no (M05 chỉ tên tab Trade Replay) |
| getMarketContextCandles | GET /market/candles `environment,venue,instrument,interval,from_ms,to_ms,point_limit` | R | Trading System bars (source TRADING_SYSTEM_DATA_LAYER) | TradeReplayLive | no |
| getObservedTimeline | GET /views/observed-timeline `environment,subject_kind,subject_id,limit<=200,after` | R | entries(observedAt,type,price,qty,realizedPnl), segments, marks(markPrice), page | ObservedTimelineLive, Alpha360 | no |
| getManagerRelationPage | GET /manager/current/{route}?environment,limit,cursor | R | 15 relations: orders, fills, strategies, strategy-deployments, order-brackets(+legs), conditional-order-groups(+legs), portfolio-capital-ledger, portfolio-equity-snapshots, sizing-decisions, execution-sessions, command-journal, broker-account-sync, reconciliation-findings | useRelationFacts (Alpha/Portfolio/Account, Replay) | no |
| getSubjectActivity | GET /resources/{alphas,accounts}/{id}/{orders,fills}?environment,limit,after | R | records + timeframe provenance + coverage | useSubjectActivityFacts | partly (M05 Orders & Fills) |
| getAlphaFleet | GET /alphas `environment,after,before,limit,sort,search,stage,owner,health` | R | AlphaFleetItem + summary (xem mục 3-4) | AlphaFleetRich, CommandCenterSnapshot | yes (M03) |
| listPortfolios | GET /portfolios | R | portfolioId,name,owner,state,baseCcy,environments,allocationCount,deploymentCount,allocatedByCurrency,updatedAt | PortfolioListRich | yes (M02, kèm cột manager) |
| getBindings / getBindingDetail | GET /broker-bindings `environment,after,before,limit,sort,search,venue,state`; /{id}?environment | R | bindingId, accountId, venue, state, credentialState, updatedAt; detail + authority/freshness | AccountsBindingsRich, BindingDetail | no (không có list Accounts) |
| getEquitySparklines | GET /alphas/equity-sparklines?environment | R | series{alphaId: number[30]} | AlphaFleetRich | yes (M03 30D equity) |
| getStageDrift | GET /alphas/{id}/stage-drift?days | R | calendar[], windowDays, dailyBasis, stages{deployed,reasonCode,series[]} | Alpha360Rich (tile 10) | partly (M05 bảng Cross-stage, không vẽ) |
| getSandboxCertification | GET /deployments/{id}/certification | R | steps[7] (strip/evaluation state, evidenceHash, expiresAt, blocker), progress, findings(local vs broker value), promotionPlans, timeline | SandboxCertificationContainer | no |
| getCanaryControlRoom | GET /deployments/{id}/canary | R | envelope limits(capitalCap,grossNotionalCap,dailyLossCap,maxOpenOrders,durationDays), kpis, compliance, positions, blotter, series, rollbackReadiness, commandPolicy | CanaryControlRoomContainer | no (M07 chỉ header) |
| getLiveFullOperations | GET /deployments/{id}/live | R | kpis, panels, brokerConsistency, projectionContinuity, predecessorEnvelope, commandPolicy, realtimeStreamUrl | LiveFullOperationsContainer | no (M07 chỉ header) |
| getOrderFunnel | GET /orders/{id}/funnel | R | stages SUBMIT/SOURCE_ACK/BROKER_ACK/FILL, events(qty,at,authority), bounded | FullBlotterRich (FunnelCard) | no |
| getInsightBatch | POST /alphas/{id}/insight-previews (<=64) | R (POST) | metrics ALLOCATED_CAPITAL/USED_CAPITAL/NET_PNL/DRAWDOWN/CONTRIBUTION per item | **chỉ lab/Fixtures** | no |
| getCorrelation / getCapitalLedger / getCrossEquity | GET /portfolios/{id}/{correlation,capital-ledger,cross-equity}?environment | R | xem mục 2 | Portfolio360Rich | partly (M04 "Correlation: no data"; ledger, cross-equity no) |
| getBindingExposure | GET /broker-bindings/{id}/exposure | R | aggregate verdict OK/EXCEEDED/UNKNOWN, buckets used/reserved/available/headroom per ccy, account count vs expected | BindingDetailWithExposure | no |
| getRuntimeManifest / getScreenContracts | GET /runtime-manifest; /screen-contracts | R | page/byte/cursor bounds; screen availability | useExecutionRuntime | n/a (hạ tầng) |
| (S) profile realtime | GET /profiles/{env}/realtime-snapshot, /stream?cursor | S | revision tick -> refetch | profileRealtime.ts (Fleet, Overview, Workbench, 360) | partly (chip "Fresh · 12:04Z") |
| (S) command-center | GET /command-center/realtime-snapshot, /stream | S | cursor, projectionEpoch/Sequence | CommandCenterSnapshotContainer | partly |
| (S) live-full | `realtimeStreamUrl` trong getLiveFullOperations | S | live ticks | LiveFullOperations | no |

## 2. Chart envelope (V1 vẽ gì, series và trục)

| Chart | Nguồn | Series / cấu trúc | Trục | HIFI |
| --- | --- | --- | --- | --- |
| Equity (Portfolio 360, Account 360) | getFinancialChart, metric **chỉ "equity"** (17 metric có trong `FINANCIAL_METRICS`, UI không dùng 16 cái còn lại) | `series[]` {id,label,accountId,ccy, points [epoch_ms, decimal|null]}; envelope caption: algorithm MIN_MAX_LAST_BUCKET_V1, sourceRows, bucketSeconds, preservesExtrema/FirstLast/Gaps, gaps[], retention floor | x=thời gian UTC, y=tiền (1 ccy/series, không FX mix); preset range ALL..; `viewport_px` 256–2048 | yes (equityChart pnl/ret/eq, 1W..ALL, Lin/Log); **mất** caption downsample/retention/gaps; Benchmark hiển thị "Not available" nhưng V1 không bao giờ gửi `include_benchmark` |
| Equity by stage (Alpha 360 tile 1) | getQueryAnalytics.chartSeries | 1 line / stage (paper,sandbox,canary,live) | x=ngày, y=equity | partly (bảng Cross-stage, không vẽ) |
| Sparkline 30D | getEquitySparklines | `{alphaId: number[]}` 30 điểm, null-free | không trục | yes (M03/M08 `spark()`) |
| Paper vs Live drift (tile 10) | getStageDrift | `calendar[]` + `stages{stage:{deployed,reasonCode,series[number|null]}}`, hit-rate Δ, fill-delay Δ | x=calendar ngày, y=equity chuẩn hóa | no |
| Drawdown & underwater (tile 2) + episodes | queryAnalytics.drawdownOverlap | per-alpha `series[{t,drawdown}]`, maxDrawdown/At, overlaps[{from,to,alphaIds}] | x=ngày, y=% (<=0, zeroLine) | no (chỉ số "Drawdown now/max") |
| Correlation matrix | getCorrelation | PACKED_MATRIX (dimension<=150, values[] tam giác, sampleCounts) hoặc RANKED_PAIRS (<=500: left,right,coefficient,sampleCount); labels, clusters | ma trận alpha x alpha, -1..1 | no ("Not available · No data source") |
| Rolling corr vs benchmark (tile 3) | queryAnalytics.correlation.pairs | rho theo cặp, overlappingDays, windowDays | bar/line | no |
| Order funnel (tile 6 + blotter) | getOrderFunnel / queryAnalytics.orderFunnel | 4 stage SUBMIT→SOURCE_ACK→BROKER_ACK→FILL, state OBSERVED/PARTIAL/MISSING, eventCount, truncated | x=stage, y=count/qty | no |
| Candles + fill markers (Trade Replay) | getMarketCandles / getMarketContextCandles + relation orders/fills | OHLCV t,o,h,l,c,v; interval 1m..1d; markers = fills/orders; nguồn VENUE vs TRADING_SYSTEM | x=thời gian, y=giá | no |
| Contribution (venue, tile 4) | queryAnalytics performance / venueContribution | bar `venue · ccy` -> net pnl | x=venue·ccy, y=net pnl | partly (M05 "Contribution by venue", M04 "Contribution · 30D" = Not available) |
| Execution quality by venue (tile 5) | getDeploymentQuality + venueQuality | acks/fills, reject rate per venue | bar | no |
| Trade return histogram (tile 7) | returnHistogram(fills.realized_pnl) | 21 bucket {from,to,count}, p50, p95, withoutPnl | x=PnL bucket, y=count | no |
| Execution density day x hour (tile 8) | densityGrid(fills) | 7x24 fills/cell (DensityHeatmap) | x=hour, y=day | no |
| Regime-shaded equity (tile 9) | — | **không có dữ liệu** (REGIME_LABELS_NOT_PUBLISHED) | — | partly (M05 Regime fit panel, "FUTURE") |
| Risk utilization (tile 11) | CapGauges | notional / leverage / daily-loss vs risk profile | gauge | no |
| Cost drag waterfall (tile 12) | costDrag | gross → fees → funding → net | waterfall | no (M05 "Fees + funding" chỉ số) |
| Capital ledger | getCapitalLedger | buckets[ccy]{grossIncrease,grossDecrease,entries[movement INITIAL_ALLOCATE/ALLOCATE/WITHDRAW/REBALANCE/ADJUST, direction, amount, before/afterAllocated, accountId]} | bảng + bar | partly (M04 cash flows + Config log, không có entries) |
| Cross-portfolio standings | getCrossEquity | rows{firstEquity,lastEquity,netPnl,pointCount,first/lastAt,isSelf} | bảng/bar | no (V1_SCREEN_REVIEW: M02 thay) |
| Binding exposure headroom | getBindingExposure | buckets used/reserved/available/headroom, aggregate verdict | gauge/bảng | no |
| Canary/Live/Paper workbench | kpis + SparkTile, StageLinesChart, DailyBarsChart, CapGauges, HistogramChart | per-panel envelope (authority, freshness, suppressed) | — | no |
| Command Center | commandCenter.ts | Needs You (kind INCIDENT/APPROVAL/OPERATION, severity, slaState, rank, ageSeconds), Fleet cells (LIVE_FULL, LIVE_CANARY, SANDBOX, PAPER, BROKER_SYNC_ISSUES, OPEN_FINDINGS), Today (REVIEW_DUE, CONDITION_EXPIRY, VERIFIED_OPERATION) | — | partly (M01 chỉ Needs attention) |

## 3. Tham số filter/sort/group/query của list endpoint

| Endpoint | Server hỗ trợ | UI V1 thực sự gửi | Ghi chú cho V2 |
| --- | --- | --- | --- |
| alphas | `environment(all/paper/sandbox/live), after, before, limit, sort, search, stage, owner, health` | `limit=50`, `stage` (chip) | venue/owner lọc **phía client** trên trang đã tải; không có `group`, `portfolio_id` |
| portfolios | không tham số | — | trả cả list (`totalPortfolios`, `truncated`); không sort/phân trang |
| broker-bindings | `environment(paper/sandbox/live), after, before, limit, sort, search, venue, state` | `limit=50` | search/venue/state có trong port nhưng UI không bật |
| operations (composition) | `workspace_id, after, before, triage_state, assigned_to=me` (+ `limit` ở listOperations) | triage_state=UNACKNOWLEDGED (Needs attention), assigned_to=me (Mine); ALL_24H = không lọc | `environment`, `source_status` chỉ có ở `listOperations` (không UI); cursor loại trừ lẫn nhau |
| blotter | `after, before, limit, status, status_bucket(FILLED/PARTIAL/REJECTED/OPEN), venue, symbol, side(BUY/SELL), sort(submitted_at_desc/asc, updated_at_desc)` | `limit=50, after, status_bucket` | venue/symbol/side/sort chưa có UI; V1_SCREEN_REVIEW muốn thêm stage/deployment/account/alpha (chưa có trong `BlotterQuery`) |
| approvals | `view(INBOX,ALL,R1,R2,PAPER,SANDBOX,LIVE_GATES,EXIT_REVIEWS,OVERDUE), after, before, limit, workspace_id` | view + cursor | `before`/`after` loại trừ; `mine` chỉ là count |
| waivers | `state(OPEN,WAIVED,EXPIRING,LAPSED), after, before, limit` | state + limit(PAGE_SIZE) | probe 4 state limit=1 để đếm chip |
| command catalog | `workspace_id, environment, target_type, target_id, risk_tier` | environment/target | ADMIN-only, 403 = denied |
| query-analytics | `source_facts=false, environment, account_id` | alpha/portfolio: `source_facts=false` | |
| equity chart | `metric, from_ms, to_ms, viewport_px, include_benchmark` | `metric=equity`, range, viewport | benchmark chưa bao giờ bật |
| relation page / subject activity | `environment, limit (ladder 200/50/20/5), cursor/after` | drain nền | UXM-01 đề xuất `sort field:dir` <=3 và `group` <=2 (portfolio_id, owner_user_id, alpha_id, stage_presence, venue, health, source_state, lifecycle): **chưa có endpoint V1 nào hỗ trợ `group`** → thuộc manager-fleet V2 |

## 4. Số liệu/cột V1 hiển thị mà HIFI bỏ hoặc không vẽ

| Field | Màn V1 | Vì sao quan trọng |
| --- | --- | --- |
| Balance free / locked (`balanceFree`, `balanceLocked`), exposure, positionFactCount | Alpha Fleet | M03 chỉ có Balance tổng; free/locked là vốn rảnh thật |
| attentionReasons[] + metricsAvailability{state,reasonCode} | Alpha Fleet | HIFI chỉ có chip Health, mất lý do vì sao "Needs attention" |
| Research stage + researchOnlyCount, KPI strip 5 ô, session calendar OPEN/SUSPENDED_BY_CALENDAR (VN) | Alpha Fleet | V1_SCREEN_REVIEW tự chọn bỏ; VN là chip lịch phiên chưa thiết kế |
| Freshness budget (fresh/stale ms), projectionRefreshedAt, recordAuthority, sourceAuthority, deliveryProfile | mọi list/360 | HIFI có "Fresh · 12:04Z" nhưng không cho kiểm chứng ngưỡng |
| Chart caption: algorithm, sourceRows, bucketSeconds, preservesExtrema, gaps, retention floor, truncated/downsampled | Portfolio/Account equity | Downsample không khai báo = nói dối bằng cách bỏ sót (invariant CLAUDE.md §8) |
| 12 Insight tile (drawdown-underwater, rolling corr, exec quality by venue, funnel, histogram p50/p95, density 7x24, risk util, cost-drag waterfall, drift Δ) | Alpha 360 | HIFI M05 chỉ có tên tab "Insight Charts" |
| Execution quality: submitted / riskRejected / brokerRejected / filled / rejectRate n/d / latencyState | Paper workbench, Alpha 360 | chỉ số sức khỏe thực thi; M05 không có |
| Alpha activity: stateCounts, orderStatusCounts, latestObservedAt | Alpha 360 | |
| Trade Replay: candles + markers, interval picker, source VENUE vs TRADING_SYSTEM | Alpha 360 | không có trong HIFI; chốt "chỉ log đến khi có nến" |
| Observed timeline: entries price/qty/realizedPnl, marks markPrice | Alpha/Account 360 | M05 chỉ có Audit table |
| Capital ledger entries (movementType, direction, before/after allocated, accountId) | Portfolio 360 | HIFI thay bằng Config log; mất truy vết từng dịch chuyển vốn |
| Cross-equity standings, correlation matrix/pairs, drawdown overlap/episodes, influence graph | Portfolio 360 | M04: "Correlation: No data source"; overlap không có |
| Capital 3 partition (paper/sandbox/live) + unpublishedInputs | Portfolio 360 | HIFI gộp theo chọn env |
| Bindings: credentialState, exposure headroom (used/reserved/available/headroom), aggregate verdict | Accounts/Binding | không có màn Accounts list lẫn exposure verdict trong HIFI |
| Operations row: severity, riskTier, sourceAuthority, sourceStatus, verificationResult, workflowVersion, ack/resolve by/at/reason, resolutionEvidenceHash | Operations | M09 có Intent/Receipt/Reconciliation nhưng bỏ severity/risk/evidence hash (resolve cần evidence hash) |
| Incident: state rail, correlated operations, evidence, annotations, timeline, resolutionGate | Incident | chưa vẽ |
| Mirror integrity (gap + conflict x3 env), source-health projectionEpoch/Sequence/retentionFloor/replayEligible | Operations | M09 chỉ Complete/Partial + tuổi |
| Approval inbox: SLA state, quorum, inert reason, blockerSummary, history decided | Approval Inbox | chưa có màn |
| Gate R1/R2/Exit/Live: passport, checklist, locks, capital deltas + breach, lineage digest, expectedVersion | Governance | cả khung GateReviewShell chưa có HIFI |
| Waivers: kind, state, blocking, owner, dueAt | Waivers | chưa có HIFI |
| Sandbox cert 7 bước + findings(local vs broker); Canary envelope caps; Live broker-consistency/continuity | Stage | M07 chỉ header |
| Command Center: Fleet cells (BROKER_SYNC_ISSUES, OPEN_FINDINGS), Today panel (REVIEW_DUE, CONDITION_EXPIRY, VERIFIED_OPERATION) | Command Center | M01 chỉ Needs attention |
| Admin catalogue: riskTier, plan/apply/verify required, portalReachable, blockedReason; operator tasks | Admin Actions | |

Ngược lại, HIFI cần dữ liệu V1 **không** có: manager dataset (`/manager/fund-overview`, `/manager/fleet`, `/manager/{portfolios,alphas,accounts,deployments}/{id}/overview`, `/manager/score-view`, `/manager/score-revisions`, `/manager/operations`), `capital-commands` (preview/submit/get/reconcile), `/api/admin/profile-access/v2/*` (effective, preview, proposals, grants revoke, step-up, audit), Archive list (M08), Return/Modified-Dietz/Score/Drawdown scalar, benchmark.

## 5. Endpoint/method không có UI V1

- Method trong port không màn nào gọi: `planCommand`, `getCommandCenterSnapshot`, `getAccountBroker360`; `listOperations` và `getInsightBatch` chỉ ở `Fixtures.tsx`/lab (thật dùng composition / không dùng).
- Có contract + OpenAPI nhưng **không có method trong `ExecutionApi`**: `/manager/*` (8 route manager-models + `/manager/operations`), `capital-commands*` (4), `/api/admin/profile-access/v2/*` (8), `/deployments/{id}/equity-projection`, `/alphas/{id}/insight-series`, `/deployments/paper/{id}/projection/{panel}`, `/history/{environment}/{relationKey}`, `/market/latest`, `/retained-review`, `/live-gates/{id}/query-analytics`, `/contract-authority`, `/runtime-manifest/v2`, `/realtime/diagnostics`, `/adapters/{env}/{cap}`, `/screen-contracts/{id}`, `/activation/plans*` (4 POST/GET), governance write routes (`canary-envelopes`, `sandbox-certifications*` 4, `approvals/{id}/decision-plans` thay bằng `/commands/plans`), `commands/tasks/{id}/plan`, incident writes (`incidents`, `acknowledge`, `assign`, `annotations`, `evidence`, `operations`, `mitigate`, `resolve`: 8 POST).
- Dữ liệu chỉ có trong `FINANCIAL_METRICS` nhưng UI không gọi: gross_pnl, realized_pnl, unrealized_pnl, fee_total, funding_pnl, cash_*, margin_*, drawdown, notional, exposure_long/short, allocated_capital (16/17 metric).
