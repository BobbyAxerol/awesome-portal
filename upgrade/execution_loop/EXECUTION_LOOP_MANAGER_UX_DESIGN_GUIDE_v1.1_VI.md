# Execution Loop Manager UX Design Guide

**Phiên bản:** 1.1 tiếng Việt · **Ngày:** 2026-10-15 UTC  
**Người sử dụng:** Bobby, Stan, Claude thiết kế và agent frontend/backend.  
**Mục tiêu:** bổ sung lớp tổng quan manager-first trên Execution Loop hiện có, giữ khả năng drill-down và contracts nghiệp vụ. Đây là đặc tả để thiết kế, không phải giao diện đã triển khai hoặc quyền sửa server.

Bản 1.1 đồng bộ score đã chọn: một P/R/B 45/30/25, PortfolioScore trực tiếp từ NAV danh mục, provisional hợp lệ và timeline xuyên stage có continuity. Formula/weights/bands đã chốt; calibration/config production và phê duyệt gói triển khai là các gates riêng.

## 1. Kết luận sản phẩm

Manager cần trả lời nhanh: vốn đang ở đâu, alpha nào đóng góp, phần nào tập trung/rủi ro, dữ liệu có đáng tin, việc gì cần xử lý. Sau đó mới đi sâu một alpha, deployment, account, order hoặc fill.

Luồng chính: **Overview → Portfolios hoặc Alpha Fleet → Portfolio / Account / Alpha 360 → Deployment → Orders / Fills / Reconciliation**. Các màn chi tiết hiện có được reuse khi source/runtime mapping đã xác minh; không xây một portal mới làm mất deep links cũ.

Ba nguyên tắc:

1. Tổng quan sạch nhưng không che context: date/window, currency, economic domain, stage, quyền xem, freshness và nguồn luôn truy cập được.
2. Một metric phải có grain và nghĩa rõ. Vốn kinh tế, budget, margin và exposure không là cùng một con số; score không thay PnL hoặc quyền giao dịch.
3. UI có thể dựng trước với fixtures. Nối dữ liệu thật và bật actions theo từng capability/endpoint đã đạt gate; mockup không chứng minh backend đã sẵn sàng.

### 1.1 Tài liệu đi cùng và phạm vi

- `EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md`: authority, ACL, datasets, API/command contracts, 12 ELP2 phases.
- `EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md`: publication, projection, replay/freshness, resource budgets và 12 EPG10 phases.
- `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`: **đặc tả công thức duy nhất đã được chọn**, P/R/B, bands, evidence/basis, direct PortfolioScore và descriptive Regime Fit; calibration/config production vẫn cần hoàn thiện.
- `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md`: source pins, PM R2 và decision register.
- `PARALLEL_IMPLEMENTATION_AGENT_PROMPTS_v1.2_VI.md`: prompts riêng cho Claude/Edge/Portal/frontend/analytics.
- `SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md`: feasibility, gaps về data/config và gates triển khai score; không là công thức cạnh tranh.

Không tạo thêm phiên bản financial kernel, identity provider hoặc risk authority trong thiết kế. Phần layout/HIFI do Claude đề xuất; các invariants về dữ liệu/quyền/tiền không được sửa để đơn giản hóa màn hình.

## 2. Baseline và reuse map đã kiểm tra

Đã xem trực tiếp hai ảnh lowfi của người dùng. Các ngày 30/06/27–10/07/27 và ô xx chỉ là ví dụ, không phải dữ liệu vận hành. Ảnh là hướng tổ chức thông tin; không bắt buộc giữ grid Excel hoặc kích thước từng ô.

Source audit: BE `/home/bobby/portal-research-be` tại `fdea081d912854223499e995e6bd4b4482229249`, FE `/home/bobby/portal-research-fe` tại `051eeb89a8105d9f76032422c75821d7af98d1e2`. Đây là **research worktrees có source Execution**, không tự là frontend/backend đang deploy. Main/dev source riêng tại `533162635f56584d630e3d971d77d50860595f15`.

| Thành phần thấy trong source | Locator relative | Reuse hoặc thay đổi cần thiết |
|---|---|---|
| Alpha Fleet columns/filter | `apps/portal/frontend/src/execution/screens/AlphaFleet.tsx:29-31,125-135,222-255` | Reuse entity/detail navigation và columns; bỏ Research stage, thêm Canary, QBTS, server sort/filter/groupby và scoped data |
| Fleet pipeline | `apps/portal/frontend/src/execution/fleetPipeline.ts:1-11,16-24,81-88` | Current deployment không đủ stage history; cần event timeline riêng |
| Preview routes | `apps/portal/frontend/src/app/PortalRoutes.tsx:53-83,170-251`; `apps/portal/frontend/src/execution/previewRegistry.ts:1-56` | Kiểm chứng route nào production/preview trước reuse, giữ feature gating |
| Manager endpoints | `apps/control-api/src/manager-lists/manager-lists.controller.ts:18-76` | Có source `/api/v1/execution/alphas`, `/portfolios`, `/broker-bindings`; không mặc định đã expose production |
| Manager fields/roles | `apps/control-api/src/manager-lists/contracts.ts:5-23,62-88,129-175` | Workspace/ADMIN/USER chưa đủ row ACL theo researcher owner; chỉ Paper/Sandbox/Live chưa đáp ứng Canary |
| Research candidate handoff | `apps/control-api/src/research/release-candidate.service.ts:365-371,428-443` | Có evidence/run/params nhưng deployment out-of-scope; cần accepted immutable binding ở Execution |

**Chưa audit browser của deployment hiện hành trong lượt này.** UX-00 phải kiểm tra bản đang phục vụ hoặc screenshot/route inventory đã được Bobby xác nhận, rồi lập bảng giữ/đổi/thêm. Không nói màn hình source/preview là màn production đã xem. Không thay research BE/FE vào production vì chúng có commit mới hơn.

## 3. Personas và quyền xem

### 3.1 Policy yêu cầu và phần cần chốt

| Persona | Quyền xem business theo yêu cầu | Không tự được cấp |
|---|---|---|
| Bobby | Toàn bộ dữ liệu nghiệp vụ được công bố trong hệ thống | Truyền secrets, bypass safety, tự live/cutover ngoài approval |
| Stan | Cùng all-business visibility để quản lý tổng thể | Owner recovery, self-elevation, maintenance/dev, mutation/grants ngoài ceiling đã cấp |
| Thanhvuong | Portfolio có alpha gắn researcher owner `user_id` của mình; nội dung/metrics hạn chế | Peer alpha, full portfolio/account totals, global ranking, mọi mutation chỉ từ việc discover portfolio |

Enforcement dùng stable user IDs/capabilities/revisions, không so tên Bobby/Stan/Thanhvuong. Global visibility không là global mutation. Quyền app login khác quyền TS business.

### 3.2 Field policy đề xuất cho researcher — cần duyệt trước mở dữ liệu thật

| Surface | Đề xuất an toàn cho Thanhvuong | Manager |
|---|---|---|
| Portfolio list | Tên/ID portfolio liên quan, own-alpha count, own authorized stage/health | Full authorized list/aggregates |
| Portfolio header | Nhãn “Phần bạn được phép xem”; không ghi “Tổng portfolio” cho subtotal | Full totals kèm source-set/coverage |
| Alpha rows | Own alpha/version, researcher attribution, authorized deployment/stage, health | All business alpha rows |
| Performance | Own attributable return/drawdown/score/evidence nếu field policy duyệt | Full component và portfolio metrics |
| Vốn tuyệt đối/balance | Mặc định không xuất full physical-account/portfolio amount; own allocated amount chỉ khi field policy cho phép | Economic allocated/capital/budget/margin/exposure tách riêng |
| Ranking | Xếp trong own authorized cohort; denominator không chứa hidden peers | Manager cohort comparable basis |
| Export | Chỉ có khi grant riêng; cùng row/field policy và thời điểm authorization | Theo explicit export grant |
| Action buttons | Chỉ operation có explicit capability và prerequisites | Cũng theo capability/ceiling, không theo persona label |

Không dùng tooltip “còn 7 alpha khác” hoặc percent-of-whole để làm lộ phần bị ẩn. Không gửi full dataset rồi filter trong browser. Policy áp trước sort/filter/search/groupby/count/aggregate/cursor/export/SSE. Khi revoke, xóa dữ liệu restricted khỏi state/cache UI theo contract; không tiếp tục phát payload cũ qua stream.

Historical ownership: không tự cho quyền xem dữ liệu trước/sau khi owner đổi. Chính sách temporal grant/history phải được chốt; mặc định query theo effective authorized relation. Nhãn attribution lịch sử giữ nguyên cho audit, không tự chuyển quyền truy cập.

## 4. Information architecture

### 4.1 Navigation đề xuất

- **Overview**: tổng quan manager; researcher chuyển sang My Execution Overview.
- **Portfolios**: list/board và Portfolio 360.
- **Alpha Fleet**: All, Live, Canary, Sandbox, Paper; các view tương ứng là filter presets.
- **Accounts**: logical accounts và physical broker bindings với grain rõ ràng.
- **Archived Alphas**: archive watchlist/paper monitoring, tách khỏi active Fleet mặc định.
- **Operations**: command status, exceptions/reconciliation và audit theo quyền.
- **Profile & Access**: reuse foundation hiện có, tách visibility khỏi grant/mutation.

Research Loop là ứng dụng/evidence link liên quan, không là stage tab trong Execution. “All” không là stage thứ năm. “Archive” là lifecycle, không là stage tài chính.

### 4.2 Hierarchy và row grain

Hierarchy quản trị canonical: root/fund → portfolio → deployment/internal-account theo backend contract. AlphaVersion, researcher owner và physical-account binding là các references được liên kết, không thêm entity book hoặc ép thành một cây ownership mới. `subject_type=manager_book` trong analytics chỉ là nhãn scope hợp nhất của root/fund đã có, không tạo business entity/book ledger mới. Một alpha/version có thể có nhiều deployments, portfolios và stages; một physical account có thể phục vụ nhiều logical sleeves.

Fleet overview mặc định một row cho `(alpha_id, alpha_version_id, portfolio_id)` theo backend contract, có expandable deployment/internal-account children. Cross-portfolio aggregate chỉ là view riêng khi backend hỗ trợ explicit grain/source-set/ACL; không thay default row key. Monetary cells chỉ dùng một selected economic partition/basis; nếu row có nhiều basis thì hiển thị “N partitions”/N/A và mở children. Không cộng shared account balance cho mỗi alpha.

Breadcrumb và header cho biết đang xem alpha identity, version, deployment hay physical account. Dùng ID để định tuyến, display name chỉ để đọc. Các ký tự @ và aliases lịch sử phải hiển thị đúng, không parse label để suy ownership/profile.

### 4.3 Global context và state URL

Date/window, reporting currency, economic domain, stage, portfolio/user selector, evidence view, search/sort/groupby và selected deployment được lưu trong URL hoặc saved-view ID có version. Back/forward và deep-link không âm thầm reset context. Saved view không cấp quyền; khi mở lại phải re-evaluate ACL và giải thích các filter không còn hợp lệ.

Date picker hiển thị timezone, inclusive UI dates chuyển thành half-open UTC interval qua contract. “Equity 30D” là cửa sổ cố định được ghi rõ; nếu global date chọn 7D, không âm thầm gọi sparkline đó là 7D. Timestamps hiển thị timezone địa phương, dữ liệu wire UTC epoch-ms.

## 5. Danh mục màn hình

| ID | Màn | Mục tiêu | Reuse/new |
|---|---|---|---|
| M01 | Manager Overview | NAV/flows/performance/score/attention trước drilldown | New overview shell, reuse metrics components nếu hợp lệ |
| M02 | Portfolios Directory | So sánh portfolio cùng basis, tìm allocation/concentration/health | New manager-first list/summary |
| M03 | Alpha Fleet | Sort/filter/groupby alpha/version và mở deployments | Refine source Fleet hiện có |
| M04 | Portfolio 360 | Capital, allocations, contributors, risk, users, activity | Reuse detail + thêm overview/permissions/score |
| M05 | Alpha 360 | Performance, provenance, regime, stages, deployments | Reuse detail + evidence/lineage tabs |
| M06 | Account 360 | Logical vs physical identity, funding/risk/margin/obligations | Reuse + clarify scope/shared balance |
| M07 | Deployment & Execution Detail | Native order/fill/session/reconciliation evidence | Preserve hiện có; cải thiện breadcrumbs và state |
| M08 | Archived Alphas | Watch paper, support evidence, review reactivation | New lifecycle/monitor view |
| M09 | Operations & Decisions | Applied/pending/unknown receipts, exceptions và audit | Reuse existing status/logs; contract-first gaps |
| M10 | Profile & Access | Self visibility, manager delegation và access explanations | Reuse source; refine capability semantics |

## 6. M01 Manager Overview theo ảnh 1

### 6.1 Bố cục

Header: scope/title, as-of/freshness, date range, currency/economic-domain selector. Hàng đầu 4–6 KPI quan trọng thay vì hàng chục thẻ giống nhau. Phần giữa: performance chart bên trái hoặc rộng chính, capital-flow breakdown và score/exposure summary cạnh bên. Phần dưới: top/bottom contributors, concentration/health alerts, portfolio list để drill-down.

Không mặc định “All stages” thành NAV tổng. Manager real-funded NAV có thể gồm Live/Canary dùng vốn thật nếu authoritative source-set chứng minh, dedupe một lần. Paper/Sandbox simulated capital hiển thị panel/badge riêng. Stage label không đủ xác định economic domain/native profile.

### 6.2 Map đủ các hàng trong lowfi

| Hàng yêu cầu | Trình bày ở aggregate chính | Initial Funds / Added Funds columns |
|---|---|---|
| Current Total | Current NAV/equity theo valuation basis; cash/budget không thay NAV | Chỉ current cohort value nếu có approved lot/cohort accounting; nếu không N/A “Chưa có attribution theo nguồn vốn” |
| Profit Amount | Net PnL amount, realized/unrealized và fees/funding scope | Không chia lãi theo lần nạp bằng tỷ lệ tùy ý; N/A nếu thiếu method |
| Total PNL % | Labeled cashflow-adjusted TWR hoặc method đã công bố | N/A nếu không tính được return riêng từng cohort |
| Realized PNL % | Amount là chính; nếu có ratio ghi rõ mẫu số và method, không gọi standalone TWR | N/A khi cohort attribution/denominator chưa đủ |
| Unrealized PNL % | Amount + valuation time; ratio chỉ theo denominator khai báo | N/A khi chưa có attribution |
| Current Drawdown from ATH % | Từ unitized/cashflow-adjusted series; nêu ATH inception hay selected window | Cohort DD chỉ nếu có valid cohort return path, không tự vẽ |
| Max Drawdown % | Window cụ thể, high-water marks và data gaps rõ | Cohort MDD N/A nếu thiếu series |
| Portfolio Score | Direct `F_pi(NAV/return path)` của portfolio hoặc manager scope hợp nhất, P/R/B + band/evidence/version | Không coi Initial/Added Funds là hai portfolio độc lập để nhân đôi score |
| Alpha Score | `A=sum(w_i*q_i)`, chất lượng trên vốn đã phân bổ; coverage/provisional weight riêng | Cùng score cohort contract; không tạo hai score nếu không có cohort definition |
| PNL Chart | Net PnL/return/equity toggle, cashflow markers | Flows là markers/series riêng; không biến deposit thành profit |

Có thể giữ hai cột Initial Funds/Added Funds trong capital statement để bám ý Stan. Đây là breakdown dòng tiền, không là hai track record độc lập. Không lược bỏ các hàng yêu cầu; hiển thị unavailable có lý do khi chưa đủ accounting. Vì ảnh ghi “Alpha Score QBTS 0 Weight” nhưng yêu cầu chữ nêu weighted allocated funds, bản này dùng **weighted AlphaScore**.

### 6.3 Capital panel

Tách initial funding, additions, returns/withdrawals, net external flows, current economic capital/NAV, approved budget, used/available risk capacity và exposure cap. GRANT/TOP_UP không tự là nạp tiền. Recall pending không thành cash available cho cấp cha. PnL tốt không tự tăng budget.

Nếu cần metric “capital efficiency”, trình bày definition/cost/leverage basis và mark proposed; không thêm vào headline mà chưa chốt. Không cộng số USDT với USD/BTC, không dùng currency display conversion như ledger truth.

### 6.4 Attention và contributor panels

Ưu tiên exceptions có hậu quả: stale/unreconciled valuation, pending recall, unknown command outcome, exposure/margin breach, source gap, concentrated score contribution, monitor stopped. Mỗi item có target/source/time/reason/action được phép, không chỉ đèn đỏ chung chung.

Top/bottom contributor theo realized/net PnL có basis riêng với ranking QBTS. “Best alpha” không đồng nghĩa high PnL amount vì allocation khác nhau. Cho toggle amount/return/QBTS với label rõ; không dùng một rank trộn units.

## 7. M02 Portfolios Directory và M04 Portfolio 360

Directory có name/ID, manager, authorized alpha/deployment count, real/sim domain, economic capital, PnL/return/DD, AlphaScore/PortfolioScore, concentration, health/as-of. Default columns gọn; column chooser giữ accessibility. Các cột không comparable acrosscurrency/window phải disable global sort hoặc yêu cầu chọn basis.

Portfolio 360 gồm:

- **Overview:** capital statement, performance, score/coverage, concentration và exceptions.
- **Allocations:** hierarchical allocation và pending recall/lock, economic backing tách budget/exposure/native margin; không coi available margin sàn là PM allocatable amount.
- **Alphas:** Fleet scoped portfolio, contribution và deployment children.
- **Accounts:** logical/physical bindings, shared account warning, currency/venue/profile.
- **Risk & Health:** drawdown/exposure, reconciliation, margin diagnostics, concentration và correlation nếu có data.
- **People & Activity:** attribution, PM/delegated roles và audit; historical attribution không tự cho current access.

Action grant/recall/return/lock/deploy hiện theo capability và verified supported profile. Confirmation có target IDs, amount/unit, expected version, authority reason và nghĩa vụ còn mở; preview không phải applied receipt. Không vẽ một nút “Move money” cho thao tác chỉ điều chuyển budget.

Researcher vào cùng route nhưng dùng safely filtered projection, banner own-slice, không full portfolio totals/peer list/aggregate denominator. Không dùng lock icon để vẫn tải hidden value.

## 8. M03 Alpha Fleet theo ảnh 2

### 8.1 Columns bắt buộc

| Column | Grain / ngữ nghĩa | Sort/filter/groupby |
|---|---|---|
| Alpha / Version | Stable IDs, display name, immutable version | Search/lexical sort; group alpha/family |
| Owner / Portfolio | Researcher owner tách PM/deployer; có nhiều portfolio thì badge + children | Filter/group owner, portfolio; ACL trước query |
| Stage Presence | Live/Canary/Sandbox/Paper presence từ actual instances | Multi-filter; group stage làm membership groups, không cộng trùng totals |
| Alloc | Economic allocation basis/time; budget ở field khác | Numeric sort/range filter trong currency/basis; group portfolio |
| PNL Amount | Net/realized basis và selected window | Numeric sort/range, no crosscurrency implicit sort |
| Unrealized PNL | Valuation snapshot, amount | Numeric sort/range; missing distinct from zero |
| Account Balance | Mặc định `INTERNAL_ACCOUNT_BALANCE`, theo internal-account unique source-set và approved grain; native custody balance là field riêng restricted | Numeric sort/filter chỉ trong comparable basis; native physical balance ở authorized custody drilldown; không sum shared source qua Fleet rows |
| Equity 30D | Unitized/economic series được ghi loại, 30D và coverage | Sparkline không tự sort; cho chọn scalar metric return30D/DD30D hoặc equity_30d_end_value theo currency/basis |
| Health / Source State | Operational status tách data freshness/availability | Filter/group typed state; no lexical severity guessing |
| QBTS | Selected comparable basis, evidence eligibility, policy version | Numeric sort khi valid; null-last + missing-reason filter |

Additional optional columns: deployer, venue/product/profile, economic domain, current drawdown, fee/funding completeness, score coverage, regime-fit status, last trade/event, archive monitor state. Để trong column chooser/detail, không ép tất cả lên mặc định.

### 8.2 Sorting, filtering và grouping bắt buộc

Sort server-side, stable tie-breaker bằng immutable ID, snapshot/cursor pinned. Header thể hiện asc/desc và priority multi-sort. Null không đổi thành 0; dùng explicit null-last cho cả hai chiều, và filter “missing/stale/insufficient evidence”. Không sort decimal strings theo lexical order. Numeric filters ghi unit/range/inclusive boundary.

Filters: stage, lifecycle, portfolio, owner, venue, logical account, economic domain, version, health/source, score/evidence/regime, currency, date/window, PnL/DD/score ranges. Backend đăng ký field operator allowlist; không nhận arbitrary SQL.

Groupby đề xuất: portfolio → owner; stage → portfolio; owner → alpha family; venue/profile; health/source; regime support; archive monitor state. Mặc định tối đa hai cấp; higher grouping là proposed UX option, không tạo query fanout vô hạn. Group header có counts/totals đúng authorized set và grain, prefix “unique alpha” vs “deployments”.

Một alpha nhiều stages có thể xuất hiện ở nhiều stage groups; không cộng group subtotals thành global total. Cung cấp unique entity count và partition-specific money. Group totals tính từ toàn authorized query, không từ page hiện tại; nếu chỉ page totals thì label rõ.

### 8.3 User experience

Sticky identity columns/header; compact density có lựa chọn; horizontal scroll có affordance. Filter chips clear-one/clear-all, saved views có version. Mở detail giữ query context và có back-to-results. Bulk actions chỉ với explicit capability, exact selected IDs/version, không “select all” bất ngờ gồm hidden rows. Mọi action disable reason không tiết lộ dữ liệu ngoài quyền.

Export phản ánh authorized filter/snapshot, fields/basis/method/as-of; reauthorize khi tạo và tải file. CSV không được chứa formula injection từ display names. Không xuất peer scores hoặc hidden total count qua footer.

## 9. M05 Alpha 360 và M07 deployment detail

Alpha header: name/ID, version, researcher owner, binding/run/evidence, lifecycle, stage presence; không đặt deployer làm tác giả. Summary có economics, raw QBTS/band/P/R/B/evidence, regime-fit và deployments; contribution `w_i*q_i` là trường riêng không có quality band.

Các tab:

1. Performance: net equity/return/PnL/MDD/ADD/costs, explicit selected domain/window. Research OOS, forward simulated và actual economic paths giữ facets riêng; timeline xuyên stage và mixed forward observation chỉ nối theo mục 9.1, không giả thành actual equity.
2. Deployments: stage, account, portfolio, runtime state, native profile, status/reasons, start/end và linked receipts.
3. Research Evidence: bound run_id/version/params digest, selected parameter bundle, original/revised evidence, OOS/IS/holdout provenance, artifact availability time.
4. Regime Fit: current market features, historical support, matched windows và stage-separated outcomes; TradeState nằm riêng.
5. Orders/Fills: link đúng existing detail, venue IDs/client IDs, partial fills, fees/funding, unknown/reconciling states.
6. Activity/Decisions: stage events, allocation changes, archive/reactivation decisions, actor/revision/receipt.

Deployment registration/promotion giữ immutable alpha/version/strategy params/trade params và evidence revision theo authority contract. Khi dùng research evidence hoặc Regime Fit phải có exact research binding/run_id và mapping hợp lệ; run mới sau start không được backdate thành bằng chứng cũ. Thiếu/mismatch research binding làm phần research/Regime Fit `unbound`, không tự chọn latest run. Score chỉ dùng economic NAV/ledger hợp lệ không bắt buộc research binding và không bị vô hiệu chỉ vì linkage đó thiếu.

Compare versions giữ cùng window/cost/economic basis hoặc ghi “không so trực tiếp”; thay strategy/trade params có ý nghĩa tạo alpha score boundary, không cộng lịch sử cũ để tăng sample. Economic history của portfolio/manager không reset khi đổi constituent.

### 9.1 Timeline xuyên stage và observational facet

Timeline giữ Paper → Sandbox → Canary → Live với version/configuration, source, costs và verified economic domain của từng segment. Canary → Live chỉ đổi label trên cùng actual account/sleeve/config và accounting liên tục thì không reset return path hoặc peak trong window; stage breakdown vẫn hiện.

Mixed forward observation chỉ được công bố khi continuity manifest xác minh cùng version/params hoặc mapping equivalence đã biết trước; một authoritative source mỗi interval theo lịch chọn nguồn trước outcome; không overlap, không chọn đoạn tốt hơn giữa paper/live hoặc backfill gap sau khi biết PnL. Grid/cash reference/currency/cost basis/policy phải tương thích và transition handoff/rebase có chứng cứ. Nối unitized returns, không nối nominal simulated capital vào actual NAV; thiếu điều kiện thì giữ segment cards, full mixed score unavailable.

Facet riêng có `series_kind=cross_stage_forward_observation`, `economic_domain=mixed_observation` là analytics metadata, không operational enums mới; label “Forward tổng hợp xuyên stage — không phải actual track record”. Hiện observed duration và actual duration cạnh score: 40 ngày Paper + 20 ngày Sandbox + 10 ngày actual không overlap là 70 ngày forward, chỉ 10 ngày actual. Không đưa mixed score hoặc virtual allocation vào headline actual AlphaScore/PortfolioScore. Research backtest không trở thành forward observation; Regime Fit vẫn giữ summaries theo domain/stage.

## 10. M06 Account 360

Tách logical account/sleeve khỏi physical venue/sub-account. Header ghi venue, native account/product/position/margin mode, currency, paper/demo/mainnet environment proof và physical binding ID. Không suy mode từ suffix tên account.

Panels: balance/equity source, position/orders, margin/native risk, PM capital/budget/exposure, allocations, fees/funding/borrow, reconciliation và audit. Hedge gross exposure không bị net hóa âm thầm. Cross margin ở sàn không chứng minh logical portfolios được liquidation isolation.

Native custody/shared physical-account balance là physical fact riêng; không gắn toàn balance đó thành “vốn alpha” ở nhiều rows. Cột Account Balance mặc định ở Fleet theo INTERNAL_ACCOUNT_BALANCE source-set của backend, không tự thay bằng native custody balance. UI hiển thị shared binding và attributable metrics nếu nguồn thật có; thiếu attribution thì N/A. Researcher không được suy total qua component remainder.

## 11. Score UX và giải thích

### 11.1 Một công thức đã chọn và bốn ngữ nghĩa hiển thị

Canonical authority là `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`. `F_pi=0.45P+0.30R+0.25B` với `P=0.70*N_T(TWR_excess)+0.30*N_SR(SR_period)`, `R=0.60*N_MDD_minus(MDD)+0.40*N_ADD_minus(ADD)`, `B=0.50*(100*p_positive_blocks)+0.50*N_T(TWR_stress_excess)`. Net và stress excess TWR dùng cùng anchors; downside metric nhỏ hơn tốt hơn. Đây là formula/weights/bands đã được chọn, không yêu cầu Bobby chọn lại nhiều công thức. Production anchors theo horizon, stress delta, block/grid/maturity và calibration artifact còn pending; fixture numbers không được dùng làm config thật.

| Surface | Metric và nhãn | Yêu cầu giải thích |
|---|---|---|
| Alpha detail/Fleet | Raw `qbts.value=q_i=F_pi(X_i)` | Chất lượng alpha/deployment/sleeve đúng grain; P/R/B, six atomic components, net TWR/MDD/ADD/costs, band và evidence. Consolidated alpha cần economic path đã dedupe, không mean deployment scores. |
| Manager alpha row | `alpha_score_contribution=c_i=w_i*q_i` | Điểm đóng góp theo allocation; raw q, allocation amount/weight và c_i ở cột riêng. Không quality band hoặc nhầm với PnL/risk contribution. |
| Portfolio/manager composition | `alpha_score=A=sum(w_i*q_i)` | Subtitle “Chất lượng trên vốn đã phân bổ”; weights từ allocated economic capital, không margin/budget/exposure. |
| Portfolio/manager headline | `portfolio_score=F_pi(X_p)` / `F_pi(X_M)` | Trực tiếp từ reconciled consolidated NAV/net return/cost path; không A trừ HHI, không mean portfolio con. `manager_book` chỉ analytical subject cho root/fund scope. |

TWR excess là chênh lệch net cumulative TWR và cash-reference cumulative TWR, không compound arithmetic excess. SR dùng return frequency đã khai báo; zero variance không thành infinity/100. ADD gồm toàn bộ observations, kể cả DD=0, không chỉ underwater episodes. Stress là một fixed-path incremental cost trên gross executed notional đã dedupe, không trừ lại baseline fees/slippage và không mô tả như mô phỏng lại execution. Các raw economics và breaches luôn xem được dù điểm đã clip.

### 11.2 Bands và cách đọc

| Canonical value trước UI rounding | Band | Nhãn |
|---|---|---|
| `[0,40)` | weak | Yếu |
| `[40,60)` | neutral | Trung tính |
| `[60,75)` | fair | Khá |
| `[75,90)` | good | Tốt |
| `[90,100]` | very_good | Rất tốt |

Dùng `quality_bands_v1_1` từ canonical unrounded value: 74.999 vẫn Khá; đủ precision/tooltip để không ghi “75.0 — Khá” gây hiểu nhầm. Raw/portfolio scores cùng profile dùng cùng bands; A có thể có band với subtitle allocation. Contribution, HHI, PnL contribution và bounds không có quality band. Score null không là 0 và không nhận band. Provisional numeric có band + badge “Sơ bộ”, observed/actual duration; không gọi là validated, probability, percentile hoặc quyền Live.

### 11.3 Trạng thái, cửa sổ và independence

Mỗi metric có value/status/reasons, comparable basis, individual/subject binding, formula/config versions, source snapshot/as-of, requested/effective window, sample/blocks/duration, evidence, coverage và components. `basis_id` legacy chỉ alias `comparable_basis_id`; individual run/alpha identity không được nhét vào comparison key.

- Đủ math/data/components + runtime config đã approved, nhưng sample chưa đạt maturity: numeric `provisional`; được sort/rank và vào A khi cùng window/basis, có evidence badge. Full coverage với ít nhất một provisional q làm A provisional, công bố `provisional_allocated_weight` trên toàn allocated capital. Không confidence discount.
- Alpha mới 5 ngày trong compare 30 ngày giữ Early facet; numeric 5 ngày chỉ khi có policy cho đúng duration, không giả score 30 ngày. Cùng 7 ngày, cùng basis vẫn được aggregate sơ bộ dù maturity còn limited.
- Thiếu atomic component: full q/direct score null `partial_components`; giữ valid components và mathematically justified lower/upper bounds, không midpoint/zero/renormalize weights. Missing required fees có thể làm nhiều component invalid theo dependency, không giữ net metrics sai làm known.
- Thiếu/stale/incomparable q trên bất kỳ positive allocation: full A null/partial coverage, denominator giữ toàn scope; có thể hiện bounds và detail-only scored subset average với tên riêng. Điều này không làm mất direct PortfolioScore có NAV/cost/benchmark/stress inputs riêng hợp lệ; maturity lấy từ chính portfolio/manager path, không từ alpha có sample ngắn nhất. Ngược lại đủ q không cho phép lấy A thay khi portfolio path thiếu.
- `policy_pending` là config production chưa đủ; shadow/fixture preview riêng, không vào production aggregate. Stale giữ last-known snapshot với timestamp riêng, không vào fresh valid set. Maturity không che invalid data/policy/cost faults.
- Economic score không dùng research evidence thì không đòi research run binding. Regime unavailable hoặc research unbound không tự chặn q/direct score; exact economic subject/data binding vẫn bắt buộc.

Idle cash không là alpha q=0. Cash vẫn trong portfolio NAV và tác động direct score qua economic path; A chỉ chất lượng allocated capital. Zero allocation cho A `no_allocation`, không ép direct portfolio score thành 0 hoặc 100. NAV coverage chỉ có nếu allocation là current-NAV partition verified; assigned capital 100/NAV 90 sau lỗ không tự là overlap. Khi không cùng basis, NAV coverage null/not_applicable.

### 11.4 Diagnostics, explanations và updates

Allocation HHI và score-contribution HHI là diagnostics theo versioned lineage groups; HHI vốn cần allocation/grouping đầy đủ, HHI score cần thêm full compatible q coverage và positive score credit. Thiếu grouping chỉ làm diagnostics cần grouping unavailable, không chặn A hoặc PortfolioScore. Score dispersion cần raw-score coverage, không cần grouping. Correlation/risk contribution cần data riêng; missing không là zero hoặc “đa dạng hóa tốt”. Clone/split không tạo diversity credit giả; không có lambda/HHI discount trong formula, DTO hoặc production slider.

Score drawer gồm P/R/B, six atomic contributions, raw inputs, normalized points, fixed stress assumptions, policy hash/calibration ID, window/grid/cost basis, source/evidence, missing reasons và bounds. Composition drawer thêm allocation snapshot/full denominator/provisional weight; direct portfolio drawer thêm consolidated NAV/flow/cost/FX/dedupe manifest. HHI/correlation ở diagnostics panel riêng, Regime Fit ở historical-support panel riêng.

Cập nhật theo sealed input watermark; không compute nặng mỗi dashboard refresh. Charts giữ original_as_published/restated và correction reason. Đổi formula/config/window/anchors phải có boundary marker, không mô tả thành alpha tự tốt lên. Filters không đổi headline denominator âm thầm: thay scope phải đổi scope_id/label/snapshot rõ. Quyền close/reduce-risk đã được cấp không phụ thuộc analytics availability/band.

## 12. Regime Fit nhẹ và UX

Câu hỏi: “Thị trường hiện tại giống những giai đoạn nào mà alpha phiên bản/params này đã có dữ liệu, và nó từng hoạt động ra sao?” Không gọi đây là xác suất alpha sẽ thắng.

V1 bắt đầu price-based volatility/trend, liquidity chỉ nếu nguồn đủ; không cần host ML model mới. Features tính từ trailing closed data; reference windows/outcomes đã hoàn tất và biết tại as-of, scaler/policy locked trước evaluation. Research OOS, Paper, Sandbox, Canary, Live giữ riêng; không để nhiều simulated windows biến thành badge live-confidence.

Màn hình gồm:
- Current feature profile và source freshness.
- Support badge: supported, weak_support, out_of_support, insufficient_data, stale hoặc unbound; không chỉ xanh/đỏ.
- Matched historical windows: source/stage/date/horizon/params, distance, observations/distinct episodes và cost assumptions.
- Descriptive historical outcomes: mean/median/quantiles có label lịch sử; không ghi expected future return.
- Difference explanation: volatility/trend/liquidity nào ngoài reference, data nào thiếu.

TradeState flat/long/short/blocked là engine fact, không đổi theo MarketRegime label. Không tự khuyên tăng vốn hoặc đổi params chỉ vì regime-fit supported. “In regime” nếu dùng như label phải được chú thích là historical support, không chứng minh profitable suitability; unsupported không chắc chắn thua.

Regime Fit không cộng/nhân vào QBTS, A hoặc direct PortfolioScore, không đổi quality band; unavailable không chặn economic score có inputs độc lập hợp lệ. Current outcome không được dùng chọn neighbors hoặc gọi regime win/loss. Run/params thay đổi tạo evidence boundary; retroactive analysis tách view với prospective evidence. Display calculation revision/as-published và restated khi có data corrections.

## 13. M08 Archived Alphas và paper monitoring

Archive là lifecycle/decision state, stage vẫn Paper/Sandbox/Canary/Live. UI label chuẩn `Archived Alphas`; nếu cần alias “Archived Signals” thì vẫn cùng entity contract.

Archive flow:
1. Chọn alpha version/deployments, reason và evidence window; xem vị thế/lệnh/reservations/unknowns/settlement còn mở.
2. Hiển thị action plan được TS hỗ trợ: stop new risk, disposition nghĩa vụ, các bước cần approval. Archive không tự cancel/flatten/liquidate/return capital.
3. Gửi command có actor/idempotency/expected revision. Giữ Archive requested/Pending drain khi nghĩa vụ chưa hoàn tất.
4. Tạo paper-monitor deployment riêng khi đã được duyệt scope/config/quota, giữ origin IDs/version/params/binding; không chuyển tiền thật sang Paper.
5. Chỉ ghi original archived/retired theo authority receipt đúng scope. Paper monitor chạy độc lập, không chứng minh original đã flat.

Filter active/archive/stage/table không được loại alpha còn vốn hoặc nghĩa vụ khỏi full-manager economic NAV hoặc denominator score. Score tính riêng cho filtered cohort phải mang tên/cohort/source-set riêng, không thay headline toàn danh mục.

Archived list columns: alpha/version/owner, archive reason/date, previous stage, residual obligations, monitor running/paused/stale/not provisioned, paper start/virtual allocation, post-archive net return/DD/QBTS evidence, regime support, review status. Sort/filter/groupby cùng engine query/ACL của Fleet.

Mở detail có hai timeline riêng: prior economic history và forward paper monitor. Monitor chỉ có evidence từ khi thật sự chạy; không backfill rồi gọi là paper forward. Có stopped/failed/quota-limited states, last successful observation và data gaps. Archive list không làm phát sinh hàng nghìn jobs vô hạn; cadence/resource cap do policy duyệt.

Reactivation là review mới: reason, bound version/params, evidence mới, remaining obligations, capability/profile/certification và target stage. UI mặc định đề xuất review/paper trước; không tự đưa thẳng Live hoặc tự gỡ archive vì score vượt ngưỡng. Đổi params tạo version/evidence lineage mới theo contract, không overwrite bản đã archived.

## 14. Command UX và các state độc lập

| Chiều trạng thái | Ví dụ | Ý nghĩa |
|---|---|---|
| Transport/client | submitting, request sent, timeout | Chưa chứng minh TS accept/apply |
| Authoritative command | accepted, applied, rejected, failed, outcome unknown | Receipt TS và idempotency/status lookup |
| Projection | current, catching_up, resync_required | Read-side đã thấy effects/revision chưa |
| Venue/execution | working, partial fill, filled, canceled, reconciling | Source exchange/execution facts, không suy từ command applied |

TS receipt có thể APPLIED trong khi projection CATCHING_UP. UI thông báo “Đã áp dụng, dữ liệu hiển thị đang cập nhật”, giữ receipt và không resend command. HTTP200 không là APPLIED; APPLIED không là filled.

Repeated click bị khóa theo request/idempotency nhưng có accessibility/status. Timeout lookup status trước retry; unknown không đổi thành failed để user gửi lại. Revoke khi panel mở hoặc trước commit phải được server re-check; UI cập nhật capability và giữ committed facts theo quyền phù hợp.

## 15. Visual design và interaction rules cho Claude

- Manager hierarchy rõ: ít KPI chính, whitespace, units đồng nhất, detail qua drawer/tab; không tô tất cả thành alert cards.
- Một palette riêng cho lifecycle/stage; severity dùng semantic badges có text/icon, không phụ thuộc màu. Demo/simulated luôn nhận diện được.
- Tables có sticky context, column chooser, keyboard navigation, sort aria-label, focus ring, density settings; 30D sparkline có text alternative.
- Charts không dùng dual axis gây hiểu lầm giữa flows và returns; annotations về deposits/withdrawals/halts/gaps, tooltip exact basis/time. Decimation chỉ cho display, không dùng data downsample tính canonical metrics.
- Empty zero-data khác permission denied và missing upstream. Khi source stale giữ last-known as-of nếu policy cho phép, không giả fresh vì heartbeat còn chạy.
- Desktop ưu tiên overview/table rộng. Tablet giữ core columns và drilldown; mobile ưu tiên status/action-safe reading, không ép bảng 12 cột thành font nhỏ.
- Dialog cancel/back/close không submit; browser back/forward giữ selected scope. Destructive/high-impact action có specific target confirmation, không dùng toast chung thay receipt.
- Existing detail links hỗ trợ mở tab mới; không mất row context sau quay lại. Không đổi tên IDs/path một cách phá bookmarks.

## 16. Shared backend/UX contracts

XLC-01…08 giữ từ hai backend guides. XLC-09 là manager visibility/researcher scoped field policy; XLC-10 manager workflow/lifecycle/typed metrics; XLC-11 shared canonical Research analytics. UX không tạo công thức hoặc enum cạnh tranh.

Mỗi field manifest có: identity/grain, economic domain/native profile proof, currency/unit, definition/method, window/as-of, source-set/revision, availability/completeness, freshness, evidence/policy status, ACL scope/field-policy revision, sort/filter/group support. Monetary/ratio/score wire values theo shared decimal-string contract, epoch-ms timestamps và opaque/string revisions; browser không lexical-sort decimal values.

Một serialized UI fixture có thể gồm `{fixture_id, schema_version, principal_scope, route_context, response, expected_ui_state}`. Tên route mới chỉ PROPOSED tới khi mapped vào actual source/OpenAPI. UI requests không được chọn arbitrary DB relation, secret account identifiers hay raw SQL.

Thứ tự query: authenticate → authorize rows/fields → select comparable partition → filter/group/aggregate/sort → paginate → serialize/redact → scoped cache/stream. Backend có thể tối ưu implementation nhưng phải giữ semantics này. Không tính total từ dataset toàn workspace rồi cắt rows.

## 17. Fixture pack và acceptance coverage

Mọi fixture dưới đây PLANNED/NOT RUN; dùng synthetic nonsecret IDs, không biến số minh họa thành test result.

| ID | Tình huống | Điều UI/backend phải chứng minh |
|---|---|---|
| UX-F01 | Bobby/Stan read-all nhưng mutation ceiling khác | Visibility giống nhau; action capability khác; no self-elevation |
| UX-F02 | Thanhvuong có 1 alpha trong portfolio nhiều peers | Own slice; không peer rows/counts/totals/percent denominator leaks |
| UX-F03 | Ownership/link đổi hoặc revoke SSE đang mở | Scope/cache/export/stream cập nhật; không hidden stale payload |
| UX-F04 | Alpha nhiều deployments/stages/shared physical account | Unique counts và money source-set đúng, không balance double-count |
| UX-F05 | All có Live+Canary thật và Paper/Sandbox sim | Partition rõ, NAV thật dedupe; no combined simulated PnL |
| UX-F06 | Deposit giữa window | PnL/return/DD không biến deposit thành profit; cohort fields unavailable nếu thiếu attribution |
| UX-F07 | Missing required fees/funding, stale valuation | Canonical metric/score N/A hoặc partial đúng contract, không zero |
| UX-F08 | High short-sample QBTS đủ components/window/config | Numeric provisional được sort/aggregate same basis; badge và provisional allocated weight; khác window vào Early facet |
| UX-F09 | 25% allocated capital thiếu q; mọi positive missing weight đều áp dụng | A null + coverage/bounds, không renormalize subset; direct PortfolioScore độc lập nếu own economic inputs đủ |
| UX-F10 | Clone alpha thành nhiều rows | Group-level concentration không cải thiện giả |
| UX-F11 | Unknown grouping hoặc assigned100/NAV90 sau lỗ | HHI unavailable khi thiếu grouping; A/direct PortfolioScore độc lập; NAV coverage basis handling đúng |
| UX-F12 | Unbound/mismatched params, future research run | Regime unbound; no retroactive prospective proof; economic-only score không bị chặn chỉ vì thiếu research linkage |
| UX-F13 | Out-of-support/liquidity missing/MAD0 | Typed abstention, không green fit badge |
| UX-F14 | Archive Live có positions/working orders | Pending disposition; không fake flat/return funds |
| UX-F15 | Archived monitor not provisioned/stale/quota stopped | Không fake paper evidence; explicit last observation |
| UX-F16 | Reactivation reviewed nhưng chưa certified | Không live/send funds tự động; action gated |
| UX-F17 | TS APPLIED, projection lag, venue partial fill | Ba trạng thái đồng thời đúng, không duplicate command |
| UX-F18 | Repeated clicks/timeout/back/cancel/reconnect | Stable request/status/deep link, không accidental submit |
| UX-F19 | Server pagination/sort nulls/decimal strings/groups | Stable snapshot/tie-breaker, full-query vs page totals label |
| UX-F20 | Multiple currencies, changed basis/filter | No invalid crosscurrency sort/aggregate/score comparison |
| UX-F21 | Cache/replay epoch reset/slow SSE consumer | Resync flow không duplicate financial effect; stale honest |
| UX-F22 | Mobile/tablet/keyboard/screen reader | Core context accessible, no clip/missing focus |
| UX-F23 | Research/preview route source chưa deployed | Design handoff ghi reuse candidate, không claim production proof |
| UX-F24 | No eligible alpha/zero allocation/zero-return series | Empty/no_allocation/undefined ratio đúng, không divide0 |


### 17.1 Fixtures bổ sung cho score v1.1

| ID | Tình huống | Điều UI/backend phải chứng minh |
|---|---|---|
| UX-F25 | Fixture P80/R66/B70 | QBTS73.3/fair; six atomic components và fixed cost stress đúng spec; không dùng anchors fixture làm production |
| UX-F26 | Band boundaries 0/40/60/75/90/100 và 74.999 | Canonical unrounded bands đúng; contribution/bounds/null không quality band |
| UX-F27 | q88/60, allocation20/80 | Contributions17.6/48; A65.6/fair với subtitle; không suy direct PortfolioScore từ A |
| UX-F28 | Single-alpha exact same economic path/basis | Direct PortfolioScore bằng q; không HHI penalty; clone/split giữ score khi path không đổi |
| UX-F29 | Constituent q thiếu / grouping thiếu / portfolio NAV thiếu | Ba dependency failures riêng; không cascade null sai giữa A/direct score/HHI |
| UX-F30 | NAV100/cash20/a60/20/q90 và q50 provisional | A80 provisional, provisional allocated weight 25%; cash trong direct path; q50 missing thì A bounds 67.5–92.5, value null |
| UX-F31 | Zero-variance Sharpe hoặc stress component missing | Full score null/partial với valid bounds; không infinity, zero-fill hoặc reweight; thiếu fees invalidates dependent inputs |
| UX-F32 | Cùng window 7d limited so với early 5d trong 30d | Same-window provisional aggregate được; different-window Early riêng, không extrapolate |
| UX-F33 | Canary→Live cùng actual ledger/config | Không reset score path/peak vì stage label; stage breakdown còn |
| UX-F34 | Paper 40d + Sandbox 20d + actual 10d, không overlap | Mixed forward70d, actual10d, observational facet riêng; không nominal capital merge |
| UX-F35 | Paper/live overlap, source chọn sau outcome, gap hoặc params change | Fail stitch; giữ segment cards/boundary; predeclared source và continuity bắt buộc |
| UX-F36 | Hai portfolio và internal transfer manager | F trên consolidated path, không average child scores; transfer nội bộ không external flow manager |
| UX-F37 | Net/stress anchors mismatch, double fee, invalid stress wealth | Config/data fault rõ; không publish false numeric score, raw breach vẫn hiện |
| UX-F38 | Regime supported nhưng historical outcome âm / unavailable | Regime không tăng/giảm score/band; authorized reduce-risk không bị khóa |
| UX-F39 | Formula approved nhưng config/horizon calibration pending | UI phân biệt formula đã chọn với config pending; preview không vào production aggregate |
| UX-F40 | Fee correction, policy/window đổi, historical allocation | Original/restated và snapshot đúng thời điểm; không lấy current weights backfill history |

UX-F01…24 giữ ID và phạm vi kiểm thử nền; các expected score semantics tại F08/F09/F11/F12 được cập nhật theo quyết định v1.1. UX-F25…40 bổ sung coverage, không thay các fixtures cũ. Map calculator/integration test IDs về mục 11 của score specification; tất cả vẫn PLANNED/NOT RUN cho tới khi có receipt thực.

## 18. Kế hoạch 11 phase UX và frontend handoff

Namespace UXM-00…10 chỉ là design/frontend workstream, không thay ELP2/EPG10/PMA11. Mỗi phase giữ mục tiêu, inputs, tasks, deliverables, tests, exit, blockers và rollback. Chưa phase nào được tính PASS chỉ vì có tài liệu này.

### UXM-00 Audit và reuse map

- Inputs: source manifest, actual deployment route/screenshot được phép, hai ảnh lowfi, guides.
- Tasks: xác minh existing/preview/new screens, persona flows, route/deep-link map; ghi gaps và chọn integration baseline.
- Deliverables: inventory và giữ/đổi/thêm matrix; source/runtime pins riêng.
- Tests/exit: UX-F23, mapping được review; không claim xem UI deployed khi chỉ đọc source. Không cần chờ N1.
- Rollback: tài liệu-only, không đổi routes/runtime.

### UXM-01 IA và metric dictionary

- Inputs: UXM-00, ELP2-01/EPG10-02 contract drafts.
- Tasks: sitemap manager-first, context/date/currency/domain/grain; mapping mọi hàng hai ảnh; score/evidence labels.
- Deliverables: IA, field manifest, glossary và open policy register.
- Tests/exit: UX-F04/05/06/20/24; economics rõ, không missing row semantics. Formula/weights/bands đã chọn; runtime config/calibration có thể pending.
- Rollback: versioned design revision, giữ prior approved spec.

### UXM-02 Personas và authorization states

- Inputs: field-policy proposal, authority/capability model; schema fixtures.
- Tasks: read-all manager, restricted researcher, denied/revoked/empty states, action ceilings.
- Deliverables: role-specific journeys, field/surface matrix, backend acceptance requirements.
- Tests/exit: UX-F01/02/03; server enforcement có contract, approval field matrix còn thiếu chặn real data riêng.
- Rollback: restrict feature/scope; không restore revoked rights.

### UXM-03 Lowfi Overview và Portfolios

- Inputs: UXM-01/02; ảnh overview.
- Tasks: KPI hierarchy, capital/performance/score panels, contributors và drilldown; initial/added funds semantics.
- Deliverables: lowfi M01/M02/M04 và source-state variants.
- Tests/exit: UX-F05/06/07/11; Bobby review flow trước HIFI; không cần backend runtime.
- Rollback: design revision, no production route switch.

### UXM-04 Lowfi Fleet và detailed navigation

- Inputs: source Fleet, UXM-01/02; ảnh Fleet.
- Tasks: all columns, sort/filter/groupby, deployment expansion, account/alpha detail breadcrumbs.
- Deliverables: M03/M05/M06/M07 reuse/new map và interactive lowfi.
- Tests/exit: UX-F04/19/20; không Research tab, count/amount grain đúng.
- Rollback: preserve existing detail/deep links; revert design branch only after permission.

### UXM-05 Score Regime và Archive workflows

- Inputs: scoring companion, binding/lifecycle contracts.
- Tasks: raw/contribution/composition/direct score explanations, bands/provisional/partial coverage; strict continuity/observational facet; independent historical-support drawer; archive obligations + paper monitor + reactivation review.
- Deliverables: M08 and panels/confirmation states, approved-formula/config-pending variants; không mở lại competing formulas.
- Tests/exit: UX-F08…16 và UX-F25…40; no predictive/auto-live claims, dependency independence, bands/continuity và unknown states complete.
- Rollback: disable new analytics/monitor actions, preserve existing facts/status.

### UXM-06 HIFI và design system

- Inputs: approved lowfi/policy labels, existing Portal design tokens.
- Tasks: typography/layout/cards/tables/charts, responsive, accessibility, selected/hover/error/replay states.
- Deliverables: HIFI desktop/tablet/mobile, component/state specs and design-to-contract annotations.
- Tests/exit: UX-F22 plus screenshot metric coverage; design review. Không cần đặt lệnh hoặc G1 để chốt HIFI.
- Rollback: revert design version, không thay production app.

### UXM-07 Frontend fixture implementation

- Inputs: Bobby approved implementation scope/environment; pinned design + schema/fixtures.
- Tasks: typed adapters/components/routes behind flags, URL context, saved views, snapshot sorting/paging.
- Deliverables: isolated frontend code và fixture-browser test receipts.
- Tests/exit: UX-F01…40 applicable fixture subset, repeated clicks/back/cancel; chưa gọi real integration PASS.
- Rollback: feature flag off/route compatibility; no server/DB migration implied.

### UXM-08 Read-only vertical slice

- Inputs: ELP2-04 ACL, selected ELP2-05/06 endpoint và Edge dataset publication/checkpoint gates.
- Tasks: nối một portfolio→fleet→alpha detail; real source-to-API-to-UI metric/permission/freshness tie-out.
- Deliverables: exact scoped E2E receipts, source/runtime/schema pins.
- Tests/exit: UX-F02/03/04/05/07/19/21; dataset nào thiếu giữ unavailable. Không đợi unrelated N1 path.
- Rollback: revert reader/flag with compatible schema; preserve facts, never rollback ledger snapshot.

### UXM-09 Operations và command UX integration

- Inputs: exact operation TS authority, trust/relay/status/revoke/profile evidence và approved action scope.
- Tasks: confirmation/receipt/status lookup/unknown/replay; archive actions chỉ khi lifecycle authority sẵn sàng.
- Deliverables: operation-specific UI-to-authority tests; disabled remaining operations.
- Tests/exit: UX-F14…18; impacted trading flow dùng certification riêng, mainnet canary không tự chạy.
- Rollback: disable sends, preserve receipt/status/reconciliation; don't duplicate/reverse financial effects.

### UXM-10 Coexistence accessibility và release handoff

- Inputs: selected read/action scope completed, budgets and release approval.
- Tasks: browser/API load/reconnect/slow-client tests, query fanout/resource budgets, responsive and access regressions, operator runbook.
- Deliverables: scope manifest, test matrix, known gates, deployment/rollback package.
- Tests/exit: no trading-server workload per browser tab, valid resource measurements, selected acceptance complete; deploy only after approval.
- Rollback: scoped UI/read-side release rollback preserving IDs/contracts/revocations and economic facts.

UXM-03/04/05 có thể chạy song song sau shared IA/contracts. UXM-06/07 không cần đợi mọi backend phase kết thúc. UXM-08/09 đóng theo endpoint/operation cụ thể, không tự bỏ exit gates để gọi track complete.

## 19. Claude bàn giao những gì

1. Sitemap và 3 persona journeys; giải thích manageroverview trước detail.
2. Bảng existing/refine/new có exact source/runtime evidence; không chế route deployed.
3. Lowfi và HIFI cho M01…M10, desktop/tablet/mobile với state coverage.
4. Components, token reuse, interaction annotations, sort/filter/groupby/save-view behavior và accessibility.
5. Map từng UI field/action tới backend contract/fixture/capability; field unavailable có explanation.
6. Traceability từ mọi yêu cầu/hàng lowfi tới screen/metric/acceptance ID.
7. Open decisions tách business policy với technical verification; không bắt Bobby duyệt sự tồn tại của dữ liệu thay agent kiểm tra.
8. Handoff frontend với scope/branches/dependencies/rollback; không tự deploy hoặc thay financial semantics.

## 20. Điều kiện bảo toàn

Không làm mất data lineage, deep links, quyền đã revoke hoặc sự phân biệt simulator/real capital để đổi lấy UI đẹp. Không đặt score trước raw economic truth. Không gộp archived paper results vào live NAV. Không cho rằng Chart đẹp, HTTP200 hay fixture PASS là chứng minh execution với sàn. Các câu hỏi policy còn mở được ghi rõ; phần độc lập vẫn tiến hành được sau phê duyệt đúng môi trường.

## 21. Tham khảo UX account management từ các sàn

Các nguồn chính thức đã đọc để tham khảo cách tổ chức thông tin; không dùng chúng làm authority của TS hoặc sao chép nguyên permission matrix/UX assets.

- [Binance Sub-account Functions](https://www.binance.com/en/support/faq/detail/360020632811): phân nhóm Account Management, Asset Management, Order Management, Transaction History và Transaction Statistics. Áp dụng ý tưởng overview tài sản đi trước order details, các nhóm dữ liệu có scope/export riêng; không sao chép hành vi xóa/đóng account vào Archive của hệ thống.
- [OKX What is sub-account](https://www.okx.com/help/what-is-sub-account): phân biệt main/sub-account và loại account. Áp dụng context switch rõ ràng và luôn hiện account/environment; đổi tab không có nghĩa đổi quyền hoặc binding.
- [Bybit Custodial Trading Subaccount FAQ](https://www.bybit.com/en/help-center/article/FAQ-Custodial-Trading-Subaccount): tham khảo sự tách biệt quyền xem tài sản, giao dịch, rút tiền và xem order history. Quyền thực của Bobby/Stan/Thanhvuong vẫn theo policy nội bộ đã duyệt, không theo ma trận của Bybit.

Đây là product interpretation, không phải tuyên bố rằng các sàn dùng QBTS, regime-fit hoặc workflow Archive-paper như guide này. Những phần đó là thiết kế riêng: score formula/weights/bands đã chọn theo specification; config/calibration và các policy chưa duyệt vẫn được ghi đúng trạng thái.
