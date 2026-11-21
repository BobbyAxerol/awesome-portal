# Review bundle — Execution management và score đã chốt

**Ngày:** 2026-10-15 UTC. **Trạng thái:** bộ tài liệu triển khai theo score design đã chốt; runtime calibration/config còn cần hoàn thiện; không phải release/certification. Không sửa repo/VPS hoặc thay đổi dịch vụ để tạo bundle này.

## 1. Kết luận và cách dùng

Có thể mở đồng thời ba track Edge, Portal backend và UI/UX. Bắt đầu inventory/contracts/fixtures và thiết kế; sửa code, chạy tests/build/migration hay triển khai trên repo/VPS chỉ sau phê duyệt gói thay đổi. Read-only integration mở theo dataset có đủ publication/ACL/replay/freshness, không bắt tất cả đợi full N1 hoặc full PM. Mutation activation và cutover có gates riêng.

Bundle gồm:

1. `EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` — nâng bản 1.1 đã giao, giữ 12 phases và XLC contracts, cập nhật baseline và tối ưu tài nguyên.
2. `EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md` — nâng bản 1.1, đồng bộ PM R2, global business-read của manager, restricted researcher view và các API/metric contracts mới.
3. `EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md` — cập nhật guide cho Claude thiết kế manager-first, có story, màn hình, state và acceptance.
4. `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` — specification đã chốt: một P/R/B, direct-NAV PortfolioScore, composition attribution và bands; chỉ runtime calibration/config chưa có production values/approval. Regime/Archive giữ scope độc lập.
5. `PARALLEL_IMPLEMENTATION_AGENT_PROMPTS_v1.2_VI.md` — prompt riêng Edge, Portal backend, Claude design, frontend implementation và analytics module.
6. File review này — thay đổi, PM impact và decision register, không mở lại formula đã chốt.
7. `SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md` — đánh giá khả thi, độ phức tạp, numerical validation và rủi ro input/calibration.

Hai ảnh lowfi được xem trực tiếp: overview có breakdown Initial Funds/Added Funds và fleet có Alpha/Version, Owner/Portfolio, Stage Presence, Alloc, PNL Amount, Unrealized PNL, Account Balance, Equity 30D, Health/Source State, QBTS. Ngày 2027 trong ảnh chỉ là mock. Yêu cầu chữ mới nhất về AlphaScore weighted allocation được ưu tiên so với nhãn “0 Weight” trong ảnh.

## 2. Source manifest kiểm tra ngày 2026-10-15

Đây là source review và đọc receipts, không phải đo runtime hiện tại hoặc chạy lại test. Pin được dùng làm mốc đối chiếu; khi bắt đầu triển khai phải refresh full SHA/dirty digest và exact source/runtime mapping.

| Thành phần | Worktree / branch | Full SHA tại audit | Giới hạn |
|---|---|---|---|
| TS execution | `/home/bobby/.worktrees/trading-system-next-upgrade`, `feat/v2-rust-first-okx-demo` | `6c5a1df3597b9753eb2d90eae3233d696900d420` | Dirty runner N1, unit test và untracked PM guide; commit không đại diện mọi bytes đang chỉnh |
| PM | `/home/bobby/.worktrees/trading-system-pm-v1_1`, `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763` | Clean source; không đồng nghĩa production PM activated |
| Data Layer canonical | `/home/bobby/data_layer`, `main` | `5bf5cd540498b82959342c7cfb2ebeaac3007426` | Unified plan có thay đổi local |
| Data Layer closure | `/home/bobby/.worktrees/data-layer-p184-closure`, `fix/p184-dl-closure` | `f8e5442fa85e8e0a10f4407e0ca3bd1257f6543b` | Clean; rollout journal không thay live runtime verification |
| Portal stable-source | `/home/bobby/portal-main-release`, `main` | `533162635f56584d630e3d971d77d50860595f15` | Main/dev source baseline lịch sử, chưa chắc deployment mới nhất |
| Portal research backend | `/home/bobby/portal-research-be`, `codex/be-gaps` | `fdea081d912854223499e995e6bd4b4482229249` | Research branch, không tự làm Execution integration baseline |
| Portal research frontend | `/home/bobby/portal-research-fe`, `claude/fe-parity` | `051eeb89a8105d9f76032422c75821d7af98d1e2` | Research branch, cần reuse/adoption decision |

### 2.1 TS/Data Layer readiness phải đọc đúng

- Historical E09/P18.3E certificate `EXPANDED_G1_HANDOFF_QUALIFIED` có scope OKX Demo + Binance USD-M Testnet; không mainnet.
- P184/N1 R2 B6 ghi 6k×2 và 9k×2 capacity/performance G2 PASS, core-kill F1 và operational convergence còn mở, cutover NOT_READY. Locator TS unified plan 76441–76456 tại audit.
- Stage-100 #1 pass G1/G2 nhưng fail G4/G7; #2 protocol fail DATA_STALE/high-volume writer limitation, plan 76402–76416. Không chọn một dòng “started” để kết luận cả campaign hoàn tất.
- P184 performance/freshness G2 (target 500 ms trong amendment R2) khác P19/G2 mainnet canary optional. Không miễn performance gate vì mainnet optional.
- Data Layer rollout journal 73281–73300 ghi RUST18/batch 1024. Không diễn giải là đo live mới.

## 3. PM v1.1 đang làm: giữ gì, bổ sung gì?

### 3.1 Không mở lại nền tảng đã chốt

Giữ model B mặc định, một researcher attribution owner cho alpha, deployer độc lập; optional model A; identity naming/IDs tương thích; TS là authority; single transactional economic authority; R2 margin/risk budget có economic backing và exposure cap riêng. Không quay lại universal gross-notional 1x. Các quyết định composite reallocation/target adapter đã nằm trong R2 phải đọc đúng revision, không tắt lại chỉ để giản lược UI.

Giữ receipts đã có: PMA15 `FRESH_REHEARSAL_PASS` (101 migrations, 11 candidates, reapply không drift, restore tie-out, 106 pytest) và PMA16 bốn isolated Real-PG probes PASS. Chúng không thay historical backfill/native authority/full T16/DBP/XLC/cutover. Không dùng bản PM cũ còn nằm trong execution worktree để phủ nhận evidence của worktree PM.

### 3.2 Những bổ sung mới thật sự cần xét ở ranh giới PM

| Yêu cầu mới | Có cần thay financial core? | Delta tối thiểu phải review |
|---|---|---|
| Manager overview/AlphaFleet, QBTS/ranking | Không | Publication/read catalogue, stable IDs, allocation/cashflow/valuation lineage, authorization metadata |
| Bobby/Stan global business read, Thanhvuong restricted portfolio/alpha | Không đổi capital math | Business read-scope/membership contract, explicit field policy và revoke chain; không suy research ownership = portfolio ownership |
| Regime-fit theo research run/version/params | Không | Binding references và immutable provenance nếu chưa có; read publication/permission, không nhập model ML vào authority |
| Archive tiếp tục paper monitoring | Không tự đổi native ledger | Lifecycle command có authority: original deployment obligations, monitoring deployment liên kết, explicit transition/receipt, resource/quota owner |
| Initial/Added funds breakdown | Không tạo investor accounting mới | Export capital-flow facts/source-set; nếu muốn attribution lãi theo từng lần cấp vốn thì cần policy/capability riêng, không bịa trong UI |
| Direct PortfolioScore và concentration diagnostics | Không enforcement risk mới | PortfolioScore dùng consolidated economic NAV/cost/turnover facts; HHI là diagnostic riêng, không thay PM hard budget/exposure gates |

**Cần bổ sung contract/read visibility và lifecycle Archive nếu source chưa đủ; không cần viết lại toàn bộ PM guide hoặc chờ hoàn thành mọi feature PM rồi mới dựng UI.** Các delta phải map vào phase đang chịu trách nhiệm và review tác động sau khi source audit xác nhận. Không tự tạo migration chỉ vì bảng trên đề xuất trường.

### 3.3 Acceptance bổ sung PM boundary

- Grant global business-read cho manager không cho phép tự grant, mutate capital hoặc maintenance ngoài ceiling đã duyệt.
- Thanhvuong được thấy portfolio shell phù hợp nhưng peer rows, full balance, totals, hidden counts, rank denominators, export và stream không rò rỉ.
- Archive yêu cầu có receipt, actor, expected revision, idempotency; tồn tại working orders/positions không được đánh dấu đã retired/flat một cách giả.
- Monitoring deployment có account/paper engine/policy riêng, không ghi đè execution history hoặc venue balance; reactivation là quyết định mới.
- Đổi attribution owner/binding hoặc revoke cập nhật cache/stream/replay/export và scope ngay theo acceptance đã chốt.

## 4. Score đã chốt và migration bắt buộc

User gửi `SCORE_REGIME_PROPOSAL_v1.1(1).md` ngày 2026-10-15 và xác nhận chốt một phương án. Bản final giữ nguyên specification đó. Không còn yêu cầu chọn A/B/C, không dùng lambda/HHI để tính PortfolioScore.

### 4.1 Công thức và semantics được giữ

- `F_pi = 0.45 P + 0.30 R + 0.25 B`.
- `P = 0.70 N_T(net excess TWR) + 0.30 N_SR(per-period Sharpe)`.
- `R = 0.60 N^-_MDD(MDD) + 0.40 N^-_ADD(ADD)`; ADD trên whole regular observation window, gồm các điểm DD=0.
- `B = 0.50 (100 * positive complete block ratio) + 0.50 N_T(stress excess TWR)`; stress là additional cost trên dedup gross executed notional với baseline opening capital, cùng anchors TWR, không là execution re-simulation.
- Raw alpha q đo deployment/sleeve thực với sizing/leverage/costs. Contribution `w*q` không có quality band; allocation-weighted AlphaScore là composition, không phải realized portfolio quality.
- PortfolioScore và manager headline dùng F trên consolidated flow-adjusted economic NAV tương ứng. Không average scores của alpha/portfolio con.
- HHI, dispersion/correlation/risk contribution chỉ là diagnostics. Missing grouping không làm mất direct PortfolioScore.
- Numeric `provisional` được tính/aggregate khi math-complete, fresh và cùng window/basis; công bố provisional allocation weight. Thiếu q chỉ làm composition thiếu, không tự làm PortfolioScore mất nếu NAV inputs đủ.
- Bands unrounded: [0,40) Yếu; [40,60) Trung tính; [60,75) Khá; [75,90) Tốt; [90,100] Rất tốt. Không gắn band lên contribution, bounds hoặc missing values.

### 4.2 Phân biệt approval

| Đã chốt theo user | Chưa có production values hoặc còn cần evidence |
|---|---|
| Formula, weights/component definitions, direct-NAV PortfolioScore, bands, provisional semantics | Horizon-specific normalization L/U; observation/block grid, cash reference/FX/cost profile; stress delta_bps; math/maturity/freshness precision config |
| Manager composition vs direct economic quality | Actual input availability, sleeve attribution and portfolio consolidation proof |
| Cross-stage timeline; continuity có điều kiện | Manifest nối sources/configs/segments, preselected schedule, no overlap/gap proof |
| Regime riêng, không nhân score hoặc permission | Feature/reference binding, support thresholds, regime calibration và runtime config |
| Edge/Portal/UI architecture, no new financial authority | Runtime config approval, implementation resources, deployment scope và integration acceptance |

Approved design không phải runtime-config-approved. Agent phải đề xuất/validate calibration artifact rồi xin duyệt config/release tương ứng; không biến fixture numbers thành production defaults. Dữ liệu/schema có thật hay không là việc engineering xác minh, không hỏi user phê duyệt thay bằng chứng.

### 4.3 Breaking changes từ bundle trước

| Nội dung cũ | Final thay thế | Nghiệm thu migration |
|---|---|---|
| Q/D/S candidate và ba formula options | Một P/R/B `qbts_prb_v1_1` | Formula hash/atomic contributions và reference tests mới |
| PortfolioScore = AlphaScore trừ concentration penalty | Direct F(consolidated NAV) | Thiếu q_i/grouping nhưng portfolio path đủ vẫn có direct score |
| Mẫu ngắn detail-preview only | Provisional numeric cùng window/basis được aggregate | Disclose provisional weight; không fake long-window history |
| Unknown lineage → PortfolioScore null | Chỉ diagnostic grouping unavailable | No cross-dependency HHI→score |
| Strict stage split được hiểu reset history | Same actual path continuity; mixed forward observation facet riêng | No virtual NAV merge, no post-outcome source picking, no overlap duration double-count |

Old scores/history giữ policy version, không overwrite as-published. Không giữ HHI-discount fallback trong backend/UI; nếu chưa có NAV input, PortfolioScore unavailable thay vì đổi sang formula cũ. Score mới làm mất compatibility phải có adapter/version migration; không lặng lẽ đổi semantics cùng field/version.

## 5. Khả thi và cách không làm quá phức tạp

Bài toán tính toán là khả thi: sáu metrics nguyên tử, linear clipping và fixed weighted composite. Shared Research-side module dùng arithmetic/stream summaries và bounded window recomputation; không cần ML service, covariance optimizer, Monte Carlo hay tái chạy toàn bộ strategy cho mỗi dashboard request. Phần khó là **economic inputs và calibration**, không phải weighted sum.

1. Bắt đầu một verified economic domain/currency/profile và một supported window có calibration; mở thêm 7/30/90-day profiles sau khi có config hợp lệ. Các cấu hình chưa hỗ trợ giữ policy_pending, không âm thầm remap.
2. Reuse TS accounting snapshots/flows/fees/fills/instrument valuation. Không tạo ledger/financial kernel thứ hai. Read-side tạo metric projection từ authoritative facts.
3. Compute sealed observations theo watermark, coalesce subject updates và cache theo policy/source/window revisions. Không tính mỗi tick/browser tab hoặc nhân full-history query vì nhiều manager mở màn hình.
4. Rolling MDD/ADD không được suy cập nhật O(1) từ một scalar cũ khi peak đầu window rời đi; bounded recomputation trên canonical window hoặc cấu trúc đã chứng minh parity. Corrections invalidate affected windows và giữ as-published/restated.
5. PortfolioScore cần consolidated NAV/cost/turnover đúng scope; không đòi mọi alpha q hoàn tất. Alpha raw score cần attributable sleeve data; full physical account balance không thay sleeve NAV.
6. Stress là normalized-return sensitivity trên fixed observed path, không dự báo market impact hoặc liquidity/liquidation. Stress-invalid/cost-missing giữ typed unavailable/breach, không zero/green.
7. Calibration phải phát hiện near-cash/high-score, component compensation, short-sample band jumps, sizing/turnover/tail/cost saturation; bands không là probability/percentile hoặc risk permission.
8. Regime, mixed-observation continuity và Archive monitor là modules có gate độc lập. Không buộc v1 score phải có ML hosting hoặc toàn bộ historical matching trước khi bắt đầu shared calculator/UI read-only.

Công thức đã kiểm được bằng fixtures không đồng nghĩa hiệu quả xếp hạng thực tế đã được chứng minh. Phân biệt math tests, metric-to-ledger parity, temporal calibration/shadow, UI/ACL integration và resource measurements. Các giới hạn chi tiết trong feasibility review.

## 6. Kiểm tra trước giao agent

- [ ] Gửi đúng backend v1.2, UX v1.1, score final v1.1 và PM R2 hiện hành, không mix file đuôi “(1)”/bản Library cũ mà không kiểm version.
- [ ] Chọn prompt đúng track; cùng source manifest/schema/fixtures giữa Edge, Portal và UI.
- [ ] Xác minh exact source/runtime pins tại thời điểm bắt đầu; preserve dirty work.
- [ ] Có approval gói sửa repo/VPS và môi trường/resource caps trước writes/tests.
- [ ] Formula design đã chốt; runtime config có approval IDs hoặc remains policy_pending/preview, không reset về chọn formula.
- [ ] Mỗi workstream biết mình không được sửa phần authority/infra của track khác.
- [ ] Report tách source present, isolated tests, integrated tests, runtime và certification.

## 7. Verification và giới hạn của bundle

Tài liệu là deliverable thiết kế. Mọi test case mới là PLANNED/NOT RUN trừ khi trích receipt lịch sử có scope rõ. Phụ lục score user gửi có 44/44 smoke tests PASS khi chạy lại. Bản FINAL bổ sung hai numeric guards và ba regression tests, đạt 47/47 PASS; giữ nguyên formula/weights/bands và file upload. Feasibility review tách provenance hai lượt cùng 1.000 property paths, không coi đó là production/market validation. Các ví dụ số chỉ kiểm toán công thức/semantics, không là backtest, benchmark tài nguyên hoặc bằng chứng hiệu quả giao dịch. Source audit chỉ đọc, không Docker bypass hoặc truy cập credentials. File guide cũ được giữ trong lịch sử phiên bản; bundle mới không tự thay server files.

## 8. Targeted source audit bổ sung cho yêu cầu manager UX và tài nguyên

Audit chỉ đọc cùng ngày, BE `fdea081d912854223499e995e6bd4b4482229249`, FE `051eeb89a8105d9f76032422c75821d7af98d1e2`, PM `d16aa2b5f251596e469807f57e81fe14cdc7e763`. Các paths dưới đây relative từ đúng repo/worktree ở §2. **Không xác minh được mapping UI/route đang deploy qua lần đọc này; preview-gated source không phải production UI proof.**

| Nguồn | Locator | Finding và tác động |
|---|---|---|
| BE Fleet contract | `apps/control-api/src/manager-lists/contracts.ts:5-23,62-88,129-175` | Có Paper/Sandbox/Live và metrics Fleet, workspace/role scope; cần Canary, row ACL, typed metrics mới |
| BE endpoints | `apps/control-api/src/manager-lists/manager-lists.controller.ts:18-76` | Có `/api/v1/execution/alphas`, `/portfolios`, `/broker-bindings`; workspace gate chưa đủ researcher row ownership |
| BE refresh | `apps/control-api/src/manager-lists/manager-lists.service.ts:28-33,336-456` | Snapshot 5s; coalesced refresh có thể reuse; mỗi profile 8 relations, profiles tuần tự, Paper performance thêm |
| BE projection | `apps/control-api/src/manager-lists/manager-lists.repository.ts:135-163` | Delete toàn scope rồi insert lại: candidate giảm write amplification bằng delta/upsert |
| FE Fleet | `apps/portal/frontend/src/execution/screens/AlphaFleet.tsx:29-31,125-135,222-255` | Cột gần ảnh; còn Research stage; client filter stage/owner; chưa đủ QBTS/sort/groupby theo yêu cầu |
| FE pipeline | `apps/portal/frontend/src/execution/fleetPipeline.ts:1-11,16-24,81-88` | Current deployment projection, chưa immutable stage history |
| FE routing | `apps/portal/frontend/src/app/PortalRoutes.tsx:53-83,170-251`; `apps/portal/frontend/src/execution/previewRegistry.ts:1-56` | Preview-gated route mapping; cần production reuse validation trước nói màn nào đang phục vụ |
| Edge controls | `services/portal-execution-edge-rs/crates/edge-service/src/main.rs:362-431,474-536` | Poll controls 250ms–60s, event page cap 200; admission 8rps/concurrency8, cache TTL750ms là source defaults/bounds, không performance promise |
| Edge features/security | same `main.rs:551-596,1981-2047,2112-2155,2491-2562` | Feature defaults off/command relay rejected, resource/profile authorization, single dispatch/no ambiguous retry, response bounds |
| Edge evidence | `services/portal-execution-edge-rs/contracts/maximum-data-return-v1/e7-resilience-capacity.v1.json:4-18,69-85,187-211`; same folder `MASTER_RESPONSE.md:34-54,70-92` | Narrow E7 September 4 probe, named deployment_current limit1; không production SLO/current resource usage/global replay proof |
| Research handoff | `apps/control-api/src/research/release-candidate.service.ts:365-371,428-443`; `apps/control-api/src/research/journey.descriptor.v3.ts:102-112` | Research có run/version/param evidence; execution deployment vẫn out-of-scope của release candidate, cần immutable binding được authority accept |
| PM read foundation | `services/portfolio_management/membership_contract.py:1-7,21-40,64-161`; `membership_repository.py:103-161` | Candidate owner user_id, report.read và scopes; chưa mounted runtime authority |
| PM lifecycle | `services/portfolio_management/instance_contract.py:101-144` | Candidate REGISTERED_UNFUNDED/MATERIALIZED_HALTED/ARCHIVED; chưa chứng minh archive-continuing-paper workflow |

### 8.1 Diễn giải đúng hotspot

Theoretical ceiling một all-environment refresh: 3 profiles × 8 relations + 1 Paper performance = 25 drains; mỗi drain tối đa 10 pages × 200 rows → 50.000 source rows. Đây là tính từ source bounds, **không** số dòng luôn đọc, không benchmark, không CPU/RAM hiện tại và không kết luận đây là nguyên nhân duy nhất của tải người dùng quan sát.

Ưu tiên tối ưu: reuse coalescing → classify cadence → incremental journal/cursor với correction semantics → entity-level upsert/delete → bounded rollups/query/fanout tại Research. Đo trước/sau trên cùng workload/source pins; không tăng polling interval đơn thuần rồi gọi là đạt nếu phá freshness/safety.

### 8.2 Những gì chưa có theo phạm vi source đã đọc

Không tìm thấy formula/implementation QBTS/AlphaScore/PortfolioScore trong Portal BE/FE được audit. Không mở rộng kết luận này thành “mọi repo đều không có”. Final score specification là phương án user đã chốt; nếu discovery có legacy implementation, giữ original policy/history và thực hiện versioned migration, không tự đổi lại formula.

Chưa có bằng chứng source cho alpha archive vẫn chạy paper monitor; chưa đầy đủ deployment↔research immutable binding và stage history. Vì vậy UI states phải có unavailable/proposal, backend phải tạo contracts tương ứng qua authority; không mock xong rồi báo dữ liệu thật đã sẵn sàng.

### 8.3 Sửa lỗi aggregation trước khi nối UI

`All` chỉ là chế độ điều hướng, không phải một economic domain. Dữ liệu Paper/Sandbox mô phỏng tách khỏi NAV thật. Live và Canary có thể cùng dùng tiền thật/shared account: chỉ cộng nguồn economic facts duy nhất có proof và cùng currency/valuation basis, không cộng balance từng stage. Mỗi money/score metric có partition/source-set/basis; unknown domain thì không gộp. Stage label tự nó không chứng minh tài sản là thật hay mô phỏng.

## 9. Targeted input audit cho score final ngày 2026-10-15

Source-only: PM `d16aa2b5f251596e469807f57e81fe14cdc7e763`; Research BE đã chuyển từ pin cũ sang **`d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`** trong lượt audit này. Các locator Research dưới đây dùng pin mới. Các source maps trước đó trong bundle giữ là historical evidence, không được gán các line numbers cũ sang commit mới nếu chưa đối chiếu. Chưa xác minh applied migrations, data completeness hoặc live runtime.

| Input | Source locator | Phân loại và bước cần làm |
|---|---|---|
| Account/portfolio equity snapshots | TS `init-db/10-performance.sql:74-102`; `init-db/19-performance-pnl-ops.sql:9-44`; `services/performance/repository.py:508-660` | Source có snapshots/cadence/consolidation. Cần window continuity/freshness/coverage proof thực tế |
| Flow-adjusted returns/TWR, per-period SR, MDD/ADD | TS `services/performance/native_owner.py:39-48,147-150`; PM `services/portfolio_management/operator_reports_contract.py:174-202` | Native source chỉ point-in-time equity, report contract còn UNAVAILABLE_METHOD_NOT_CERTIFIED; cần derived Research projection/method certification, không gọi balance growth là return |
| External funds/internal transfers | PM `operator_reports_contract.py:313-379` | Candidate CapitalFlow FUND/RETURN_CAPITAL/internal_pair có elimination, chưa là complete runtime publication; không suy cashflow từ balance delta |
| Fees/funding/borrow/carry | TS `services/performance/repository.py:844-893`; `domain/economic_facts.py:77-91,1013-1075` | Fill commission/funding và economic fact kinds có source; complete borrow/interest projection/coverage chưa chứng minh. Not applicable phải có profile proof, missing không là zero |
| Gross executed notional | TS `init-db/05-trading-core-v2.sql:146-187`; instrument metadata `:77-101` | Fills price/qty/time/instrument và multiplier/currency có; chưa tìm thấy canonical executed_notional interval aggregate. Cần adapter instrument/FX đúng và fill completeness |
| Fixed additional-cost stress | Các source fills/flows/valuation phía trên | Cần derived interval notional + baseline opening capital + approved delta profile; Research arithmetic, không execution simulation mới |
| Alpha sleeve attribution | TS `services/performance/repository.py:515-580`; `services/portal_execution_owner/n11/catalogue.py:233-248` | Ambiguous ownership bị reject; bounded deployment contribution source có nhưng publication/coverage chưa verified. Không lấy full physical balance làm sleeve NAV |
| Direct PortfolioScore | TS `portfolio_equity_snapshots` và consolidation tại repository `508-660` | Có đường source phù hợp để làm direct score nếu window/flows/costs/turnover đủ; không chờ mọi alpha q |
| Research evidence pins | BE `apps/control-api/src/research/release-candidate.service.ts:43-60,469-496,621-638`; `alpha-version-declaration.ts:101-156` | Research run/version/parameter digest có; chưa tìm thấy accepted TS deployment binding các pins. Binding này cần cho research/regime evidence, không chặn portfolio economic score chỉ dùng ledger |
| Corrections/continuity | PM `services/portfolio_management/durable_economics_contract.py:31-86,266-285` | Candidate revision/source continuity/attribution có; cần chứng minh retained published coverage, not runtime-ready by source alone |
| Production config/calibration | Không tìm thấy approved artifact trong phạm vi audit | Formula/bands đã chốt, nhưng L/U/delta/grid/blocks/maturity/freshness phải được đề xuất, kiểm tra và duyệt trước numerical production publication |

**MVP khả thi:** một verified currency/domain/profile và một requested window; regular snapshots + classified flows + applicable cost completeness + dedup fills/instrument/FX + approved calibration config. Nếu không có flow/fill/carry phải có coverage chứng minh bằng 0/not-applicable, không dùng thiếu rows làm bằng chứng. Raw alpha thêm sleeve partition proof; direct portfolio score dùng consolidated facts riêng. Research run pins chỉ cần cho features thực sự dùng research evidence, không phải universal numeric-score prerequisite.

Parent score specification §4/8 là nguồn status canonical (`available`/`provisional`, etc.); các từ mô tả trong audit không tạo enum API mới. Tên manager_book/book trong score là analytical consolidated subject trên scope fund/root/portfolio đã có, không yêu cầu tạo entity Book hoặc authority DB mới.
