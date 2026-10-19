# Hướng dẫn nâng cấp Execution Portal Edge v1.2

Thiết kế và kế hoạch triển khai luồng dữ liệu nhẹ giữa Trading System và Portal nội bộ trên Research server

- **Người sử dụng:** Bobby và người triển khai Trading System, Edge, Portal
- **Phiên bản:** 1.2 tiếng Việt
- **Ngày cập nhật:** 2026-10-15 UTC; kế thừa requirements, test IDs và 12 phase; đồng bộ scoring specification v1.1 đã chọn
- **Trạng thái:** công thức, trọng số và bands `qbts_prb_v1_1` đã được chọn; runtime calibration/config và các quyết định kỹ thuật còn mở phải có evidence trước release. Chỉ cập nhật tài liệu local; không xác nhận sửa repo/VPS, migration, benchmark, deployment hoặc bật command production
- **Phạm vi:** producer và export contract phía TS; transport; bootstrap và delta; projection, history và fanout phía Research; relay command tới TS authority; resource budgets và vận hành
- **Namespace phase:** `EPG10-00` đến `EPG10-11`; không phải phase P16/P18 hoặc số migration SQL
- **Namespace test:** `EPG10-Txx-nn`; mọi test mới là **PLANNED / NOT RUN** tới khi có execution receipt đúng source và môi trường
- **Tài liệu đi cùng:** `TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1.md` và `EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md`; công thức scoring/regime chỉ tham chiếu `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`; feasibility/source gaps đối chiếu `SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md`

## 1 Kết luận và ranh giới triển khai

Giữ TS là nơi quyết định business authorization, capital, admission, execution và economic truth. Producer Edge gần TS chỉ xuất canonical facts đã commit bằng contract có version và durable cursor. Research projector giữ read projection và lịch sử cần cho Portal; shared Research calculation module thực hiện rollup, scoring, regime/correlation và report. Research BFF thực hiện scoped query/cache/fanout; browser chỉ trình bày kết quả. Portal giữ login, session, Profile UI và app grants. App grant cho phép dùng ứng dụng không tự trở thành quyền thay vốn hoặc đặt lệnh trên TS.

Ưu tiên tái sử dụng Rust Axum, Tokio, SQLx, Rustls và PostgreSQL hiện có. Giữ Python read façade trong giai đoạn tương thích nếu đang phục vụ được; không đưa một vòng Python polling nặng vào trading loop. Portal tiếp tục NestJS/Fastify BFF và React/Vite. Không mặc định thêm Kafka, ClickHouse hoặc tách nhiều microservice. Chỉ thêm một thành phần khi có workload, capacity và failure boundary chứng minh nhu cầu.

Mục tiêu là lấy được **toàn bộ danh mục và lịch sử đã được nguồn công bố**, có phân trang và continuation; biết rõ phần nào nguồn chưa có. Tối ưu CPU/RAM/query/IO bằng giảm việc lặp lại và chuyển read work hợp lý, không bằng cắt mất account, alpha, portfolio hoặc financial facts. Command đi ngược về TS phải dùng authority sẵn có hoặc authority được triển khai và nghiệm thu riêng, không ghi thẳng SQL từ Research.

### 1.1 Kết quả nghiệm thu

1. Có source and runtime manifest, dataset catalogue, authority map và performance baseline riêng cho TS/Research.
2. Một snapshot có thể tiếp tục sau gián đoạn; delta không mất hoặc nhân đôi effect; reset generation, tombstone và correction đều có contract.
3. UI/consumer giữ đúng economic domain và không cộng virtual capital vào actual NAV; các venue/profile/physical-account không merge theo tên. Cross-stage forward observation chỉ ở facet riêng với continuity/source-selection proof §4.5.
4. Một người mở thêm dashboard không làm TS thực hiện lại full scan theo từng tab; fanout và history query nằm ở read side có capacity đã đo.
5. Command có human actor lẫn workload actor, kiểm quyền tại TS, expected version, idempotency, receipt bền vững và xử lý outcome unknown.
6. Từng bước có evidence, exit gate và rollback không xóa facts tài chính; thiếu runtime, schema, TLS hoặc policy approval thì affected gate giữ BLOCKED.

### 1.2 Ngoài phạm vi mặc định

Không xây lại accounting/risk engine, thay exchange connector, chuyển native funds, thêm investor accounting, tự đổi profile/margin mode, xoay credential hoặc kích hoạt live trading. Guide không cho phép sửa repo/VPS. Mỗi gói sửa code, file, cấu hình, schema hoặc trạng thái dịch vụ trên VPS cần Bobby phê duyệt trước, gồm target, thay đổi, validation, rủi ro và rollback.

Không được suy rằng đã có một endpoint chỉ vì tài liệu này mô tả contract của nó. Tên route/schema mới trong ví dụ là **đề xuất**, cần đối chiếu source ở EPG10-00 và khóa ở EPG10-02. Không coi file migration hiện diện là bằng chứng migration đã được áp dụng.

### 1.3 Hợp đồng chung giữa ba guide

| ID | Hợp đồng bất biến | Guide Edge chịu trách nhiệm | Guide đi cùng |
|---|---|---|---|
| XLC-01 | Authority tách login/app grant khỏi quyền business TS | Verified principal, trust boundary, authorization revision, commit check | PM định nghĩa quyền/capital; Portal định nghĩa login/Profile UI |
| XLC-02 | Catalogue đầy đủ, scope rõ, không ngụy tạo history | Producer catalogue, schema, availability, lineage và coverage manifest | Portal trình bày catalogue và trạng thái thiếu; PM định nghĩa entity |
| XLC-03 | Snapshot và delta không mất effect | Barrier, cursor, checkpoint, replay, dedup, tombstone và resync | Portal atomic promotion, reconnect và projection contracts |
| XLC-04 | Command có expected version, idempotency và durable receipt | Relay, timeout, unknown outcome và TS authority boundary | PM command semantics; Portal trải nghiệm accepted/terminal |
| XLC-05 | Revoke có hiệu lực tới cache, queue, stream và TS commit | Revocation propagation, fail closed và command recheck | Portal session/subscription handling; PM scoped grants |
| XLC-06 | Freshness và resource budget đo được | Cadence, overload, retention, baseline CPU/RAM/DB/IO | Portal stale/completeness display và query/fanout |
| XLC-07 | Cashflow và performance không lẫn | Exact events và metric lineage, full history, correction | PM economic/budget semantics; Portal report calculation |
| XLC-08 | Nghiệm thu theo evidence đúng mốc | Source/schema/runtime/TLS matrix, workload and receipts | Cả ba guide khóa cùng manifest và cutover gate |
| XLC-09 | Manager all-business visibility; researcher user-ID linked discovery và approved restricted slice | Scoped catalogue/query/cache/export/stream; no hidden input/count leak | Portal/Profile locks read policy; PM trusted identity/grants |
| XLC-10 | Manager-first overview/Fleet; stage khác lifecycle; Archive/Paper-clone explicit lineage; typed metrics | Publish stage/lifecycle/TradeState riêng, clone/disposition refs, unit/denominator/coverage | Manager UX và Portal DTO/render/action gates |
| XLC-11 | Một canonical Research score/regime contract với revision/correction-aware bounded compute | Minimal TS facts, Research module + source-set/window/cache version; browser presentation only | SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md và Portal/Research integration |

### 1.4 Những yêu cầu mới và phần còn cần duyệt

**Yêu cầu của Bobby cho lần tinh chỉnh này:** Edge chạy cạnh TS/Data Layer phải nhẹ, không chiếm CPU/RAM đáng kể của trading workload; chuyển history query/rollup/scoring/regime/correlation nặng sang Research. Giữ đầy đủ published catalogue/history, không dùng limit ẩn để làm dashboard nhanh. Bổ sung QBTS riêng từng alpha, manager-weighted AlphaScore, PortfolioScore trực tiếp từ portfolio NAV và manager PortfolioScore từ unique consolidated NAV; concentration là diagnostics riêng, regime fit theo research run và các cửa sổ stage trước, cùng Archive paper monitoring. Mỗi capability phải có scope, nguồn, version, coverage và trạng thái thiếu trung thực. Bobby và Stan được xem toàn bộ thông tin nghiệp vụ trong Execution Loop; Thanhvuong chỉ xem portfolio có alpha_id được liên kết với verified user ID của mình, với thông tin/metrics mức vừa phải. Full business visibility không bao gồm secrets/credential hoặc quyền sửa hệ thống. Field allowlist và mức aggregate dành cho Thanhvuong còn cần chốt; safe proposal ở §7.2 không tự là quyền mở rộng.

**Thiết kế scoring đã chọn:** `formula_id=qbts_prb_v1_1`, `F(X)=0.45P+0.30R+0.25B`, P/R/B và bands theo `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`. Raw QBTS đo deployment thực tế với sizing/leverage/cash/cost của nó; manager AlphaScore là `sum(w_i*q_i)` theo verified allocated economic capital; PortfolioScore là F trên chính portfolio NAV, manager là F trên consolidated unique NAV. Không có concentration penalty/lambda, confidence multiplier hoặc công thức cạnh tranh. Numeric provisional được dùng khi đầy đủ inputs và cùng window/basis; thiếu thành phần giữ full value null với bounds hợp lệ, không đổi weights.

**Còn cần calibration/config approval:** horizon/duration-specific anchors, stress delta, observation/flow grid, block horizon/origin, maturity/freshness, cash/FX/cost methods và precision; Regime Fit support thresholds; Archive cadence/retention; CPU/RAM/pool/IO ceilings và cutover thresholds. Formula approval khác runtime-config approval. Chưa có immutable approved calibration artifact thì production score `policy_pending`; fixture preview không được nâng thành production score. Guide khóa ownership/transport/resource/tests và tham chiếu một specification duy nhất, không chọn lại A/B/C hoặc tự gán số production.

PM impact là additive: bổ sung read DTO/lineage/metric metadata và reference tới PM R2 authority. Không thay capital payload, amount invariant, economic backing, margin-risk-budget hoặc separate exposure-cap semantics. Score/regime/Archive không tự tạo capital grant, reserve, chuyển tiền, bật live hoặc thay trading policy.

**Điểm bắt đầu:** có thể làm ngay inventory, schema/fixture design và đề xuất diff trong workspace được duyệt; mọi code/config/schema/service mutation trên repo/VPS vẫn cần approval trước. Chạy tests/build cũng phải theo target và quyền được duyệt. Read release xét từng dataset/consistency group theo §10.2, không đợi mọi TS roadmap hoàn thành và không sử dụng N1 hay PM test PASS làm chứng nhận chung.

## 2 Baseline và mức độ bằng chứng

### 2.1 Snapshot source chỉ đọc được cung cấp ngày 2026 10 15

Các facts dưới đây là snapshot của audit chỉ đọc được cung cấp ngày 2026-10-15; không là current-runtime attestation hoặc lần audit lại do phiên cập nhật tài liệu v1.2 thực hiện. Đây không phải một lần chạy test, DB probe, rollout hay runtime/TLS verification do guide thực hiện. `HISTORICAL_EVIDENCE` nghĩa là kết quả tại đúng source/fixture/lần chạy được audit báo lại; phải lấy receipt và kiểm applicability trước reuse.

| Evidence ID | Nguồn hoặc mốc | Quan sát được | Không được suy ra |
|---|---|---|---|
| SRC-TS-01 | TS `/home/bobby/.worktrees/trading-system-next-upgrade`, `feat/v2-rust-first-okx-demo`, `6c5a1df3597b9753eb2d90eae3233d696900d420` | Worktree **dirty**: N1 runner/test và PM guide untracked tại audit 15/10; pin diff/file digests trước run | HEAD không mô tả đủ working tree; không là deployed binary hoặc live certification |
| SRC-TS-02 | TS journal migration48 và publication substrate migrations59/60/67; source locators §2.4 | Substrate có trước, business membership/publication phải inventory lại theo writer và scope | Không mặc định PM v1.1 membership/capital đã published đầy đủ |
| SRC-TS-03 | P184N1R2 B6, workloads 6k×2 và 9k×2 | Audit báo capacity/performance G2 PASS trong fixture được chạy | Core-kill F1 convergence còn mở; cutover **NOT_READY**; không suy mọi N1 gate đạt |
| SRC-TS-04 | P184 performance G2 | Đây là performance gate với mốc 500 ms theo evidence contract P184 | Không phải P19 G2 mainnet canary, không optional hóa performance gate và không áp 500 ms cho mọi Edge/UI metric |
| SRC-DL-01 | DL `/home/bobby/.worktrees/data-layer-p184-closure`, `fix/p184-dl-closure`, `f8e5442fa85e8e0a10f4407e0ca3bd1257f6543b` | Clean tại audit; rollout journal cần review đúng revision | Journal không là live rollout verification; không claim deployed/current health |
| SRC-PM-01 | PM lane `d16aa2b5f251596e469807f57e81fe14cdc7e763`, clean | R2 dùng margin-risk budget + economic backing + separate exposure cap | Không có global 1× notional cap; Edge không định nghĩa lại risk/admission |
| SRC-PM-02 | P15 fresh rehearsal | Audit báo 101 migrations, 11 candidates, 106 pytest PASS trong rehearsal | Không là production applied schema hay integrated XLC acceptance |
| SRC-PM-03 | P16 isolated PostgreSQL probes | Bốn isolated PG probes PASS; P03 trust, P13 report, P14 adapter wiring còn pending | Không nâng thành full T16 DB / P / XLC hoặc identity/report/adapter end-to-end PASS |
| SRC-PORTAL-01 | Portal `/home/bobby/portal-main-release`, main/dev `533162635f56584d630e3d971d77d50860595f15` | Execution Portal source baseline được audit xác định | Không là current deployment/runtime/TLS |
| SRC-PORTAL-02 | Stable `v1.1.1`, `e4fd93658de1ff0614126a85d70e59a23c25a01f` | Historical stable để so diff | Không đồng nhất stable/main/dev/runtime |
| SRC-PORTAL-03 | Research BE `codex/be-gaps` @ `fdea081d912854223499e995e6bd4b4482229249`; FE `claude/fe-parity` @ `051eeb89a8105d9f76032422c75821d7af98d1e2` | Snapshot nhánh Research trong audit trước; targeted input audit §2.8 có BE pin mới | Không tự là Execution runtime baseline; không tự merge hoặc dùng FE/BE PASS thay Edge/Execution proof |
| SRC-EDGE-01 | Edge source trên Execution main; source map review 10/10 ở §2.4 | Current-page substrate, bounded transport và durable-history schema đã được ghi nhận | Current-page response không là global journal hoặc full retained history |
| SRC-EDGE-02 | N12 owner publication artifact và Edge relay source review | Artifact pending/production inactive tại mốc cũ; Edge source đã chủ động reject relay enable | Phải revalidate current implementation/config; không bật flag để thay missing implementation |
| SRC-EVD-01 | Source-isolated PASS; external N03 chưa được xác minh mới | Giữ đúng phạm vi từng evidence | Không nâng source/isolated probe thành full E2E |
| SRC-RUN-01 | Runtime, applied schema/indexes, TLS và DL rollout thực tế | Chưa có fresh runtime verification trong lần viết guide | UNKNOWN giữ nguyên; không bypass certificate hoặc điền mặc định lạc quan |

Mốc TS `faf6f8480b5dff532b87fa0a60c59d1f2a29458f` clean ngày 10/10 là historical baseline, đã được source snapshot 15/10 thay thế cho inventory mới. Source migrations “tới 99” là nhận xét cũ; P15 rehearsal 101 migrations là evidence target riêng, không được chuyển thành applied schema của TS/Edge runtime. Source review, test execution và runtime observation phải là ba dòng evidence khác nhau. Mỗi run cần full SHA, UTC timestamp, branch, dirty diff digest, untracked-file digests và fixture/target manifest. PM/DL/P184 receipts không tự truyền PASS sang Edge/Portal.

### 2.2 Phân loại mọi claim

- `SOURCE_CONFIRMED`: có locator và revision; chỉ chứng minh source làm gì.
- `RUNTIME_VERIFIED`: có target, thời gian, method và output được phép; có thời hạn phù hợp workload.
- `HISTORICAL_EVIDENCE`: kết quả tại mốc cũ, cần impact analysis trước reuse.
- `PROPOSED`: contract hoặc implementation trong guide này.
- `UNKNOWN` / `BLOCKED`: thiếu evidence hoặc permission; không thay bằng default lạc quan.

Mỗi report phải ghi source/runtime mismatch nếu có. Một service đang chạy không chứng minh nó dùng source đang checkout. Một HTTP 200 không chứng minh authorization, completeness, replay, business consistency hoặc certificate chain đúng.

### 2.3 Danh sách phải đọc trước sửa

Inventory tối thiểu: writer của từng dataset, migration tạo schema và indexes, serialization DTO, HTTP and stream routes, Python read façade, Rust exporter/owner paths, publication gate, identity verifier, permit/cursor/retention state, Portal sync worker, projector, BFF cache và browser subscription. Với locator chưa chốt, ghi `UNRESOLVED` và owner; không tạo tên file phỏng đoán rồi coi là source map.

### 2.4 Source map lịch sử ngày 2026 10 10 và yêu cầu revalidation

Source map này giữ locators đã được đọc ngày 10/10 để reuse và traceability; trước sửa phải kiểm tồn tại/semantics/diff tại SHA 15/10 ở §2.1. Review lịch sử chỉ dùng đọc source qua SSH. Không sửa code/config/quyền, không đọc credentials, không chạy Docker/DB/build/test/migration. Mọi locator dưới đây chứng minh **source hiện diện**, không chứng minh deployment hoặc applied schema. Source Edge root trong bảng là `services/portal-execution-edge-rs/` của Portal main; prefix này áp cho các `crates/` bên dưới.

| Source ID | Repo và exact path | Điều đã xác nhận và việc reuse |
|---|---|---|
| SM-01 | TS `init-db/11-portfolio-management.sql`; `services/portfolio_management/{repository.py,account_sync.py,sync_storage.py}` | Portfolio/allocation/ledger substrate. Inventory exact writers/history; không coi allocation labels là HARD capital authority |
| SM-02 | TS `init-db/24-physical-broker-sync.sql`, `35-canonical-domain-projections.sql`, `49-okx-demo-account-foundation.sql`, `55-v2-physical-egress.sql`; Unified Plan §45 | Physical broker/account binding source; cần scope/profile/temporal lineage |
| SM-03 | TS `init-db/48-v2-source-change-journal.sql`, `59-v2-source-commit-order-replay.sql`, `60-v2-source-journal-paper-reader.sql`; `domain/source_change_journal.py`; `services/source_change_journal/repository.py` | Change-journal/commit-order/paper-reader source đã có; reuse và test guarantee thực, không thiết kế như migration59 chưa tồn tại |
| SM-04 | TS `init-db/67-v2-p16-consumer-publication-controls.sql`; `domain/consumer_publication.py`; `services/source_change_journal/{consumer_repository.py,publication_repository.py,read_source.py,restore.py,writer.py}` | Catalogue/manifest/evidence immutable, drain/revoke projection mutable; secret-shaped fields bị reject trong consumer repository |
| SM-05 | TS `services/portal_execution_owner/catalogue.py`; `services/portal_execution_owner/identity/{policy.py,manager.py}` | Publication/identity source-dark; `runtime_enabled` default false, chưa là current runtime proof |
| SM-06 | TS `init-db/46-portal-command-paper-r1.sql`; `services/portal_execution_owner/command/{catalogue.py,adapter.py,issuer.py,runtime.py,server.py,durable_port.py,artifacts.py}` | Durable accept/claim/status và command boundary source-present, config-gated. Runtime cần feature enable, source/route binding, kill-switch off và mTLS/JWT |
| SM-07 | Portal Edge `README.md`; `crates/{ts-adapter-v1,edge-auth,ts-transport,projection-core,projection-store-pg,edge-service}` | Adapter chỉ allowlisted GET; local JWT delegation; TLS1.3/bounded queue; cursor/epoch/replay/freshness; current+journal+checkpoint+gap store; compatibility endpoint mTLS |
| SM-08 | Portal `deploy/compose.execution-edge.yaml`; `deploy/execution-d1/source-proxy/manager-v2-locations.conf.template` | Sensitive feature flags default false; proxy mode hiện source chỉ `manager-paper-read`, giữ mTLS credentials. Không suy flag live từ template |
| SM-09 | Portal Edge `crates/edge-service/src/main.rs` | **Source chủ động từ chối khi `EDGE_COMMAND_RELAY_ENABLED` được bật.** Relay cần implementation/review/test, không chỉ đổi false thành true |
| SM-10 | Portal `contracts/maximum-data-return-v1/SOURCE_PUBLICATION_PLAN.json`; `e7-resilience-capacity.v1.json` cùng thư mục | Fixed Manager profile current-page request tối đa 200 rows/1 MiB, opaque source cursor, không generic/direct. E7 P/S max safe 1, L2 trong scope artifact; không proof global gap/replay/independent-cell SLO |
| SM-11 | Portal Edge `crates/projection-store-pg/migrations/0001…0018`, gồm `0007_d4_source_checkpoint`, `0008_shared_consumer_lease`, `0009_retention_recovery_cleanup`, `0012_manager_projection`, `0014_manager_realtime_cycle_journal`, `0017_eds09_authoritative_event_store`, `0018_eds11r_event_log_anchor` | **Durable-history schema source tồn tại.** EDS8–11 vẫn cần end-to-end publication/order/replay/retention proof; không mô tả schema này là chưa có |
| SM-12 | Portal `contracts/n12-command-relay-v1-request/README.md` | Gate/template complete theo artifact, owner publication pending, production inactive tại mốc artifact; không live attestation |
| SM-13 | Portal `contracts/maximum-data-return-v1/DEPLOYED_RUNTIME_MANIFEST.json` | Capture lịch sử ngày 04/09, TS `9081397…`; không dùng thay runtime/TLS/relay check hiện tại |
| SM-14 | Portal `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` §17, §17.2, §17.3, §17.5 và §20 | EDS path/phase/authority. §17.2 census 96 relations, 5 GET primitives, 104 gateway ops, 34 fields = 22 direct +5 derived +6 gaps +1 Canary trong scope tài liệu |
| SM-15 | Portal `apps/control-api/src/execution/{current-source.controller.ts,profile-read-adapter.controller.ts,profile-history.controller.ts,maximum-data-operation.controller.ts,durable-mirror-integrity.controller.ts,realtime.controller.ts,analytics.controller.ts}` và `resource-read/*` | Source read/history/maximum-data/integrity/realtime/analytics controllers. Source route presence không là runtime guarantee |
| SM-16 | Portal `apps/control-api/src/execution/{financial-chart.controller.ts,market-candles.controller.ts,market-context.controller.ts,portal-derivations.controller.ts,operational-composition.controller.ts}`; `operations/incident.controller.ts`, `governance/*`, `manager-lists/*`, `screen-bff/*` | Projection/analytics/workflow integration seams cho Research read side |
| SM-17 | Portal `admin/{owner-access,governance-grants,account-lifecycle}.*`; migration IDs `0034-owner-anchor`, `0035-account-lifecycle`, `0036-governance-grants` | Portal owner anchor, account lifecycle, revisioned app governance. Chưa là TS alpha-owner/shared-alpha/cross-scope business ACL |
| SM-18 | Portal `facade/facade.controller.ts:220`, `execution/analytics.controller.ts:51`, `execution/realtime.controller.ts:61`, `execution/r3-governed-command-ledger.ts:110,139`, dưới `apps/control-api/src/` | Coarse ADMIN checks còn trong source, là refactor inventory; không nâng Portal thành business authority |
| SM-19 | TS Unified Plan `P15.T05`, khoảng dòng 26450 | Flow-adjusted return nhưng drawdown raw trong reviewed implementation; cần cashflow-only oracle nếu metric được công bố. Advanced metric chưa certify có thể DISABLED/UNAVAILABLE |

`SM-10` là page contract hiện hữu, không phải tổng limit mong muốn của catalogue mới. Giữ bound đã approve khi compatibility còn cần; full publication mở rộng bằng dataset/permit/continuation contract, không tự bỏ allowlist hoặc tăng payload vô hạn. Source-current-page chứng minh ít hơn full-history transport target.

Source routes đã đọc gồm `/portal/execution/v1/command-plans/paper/halt` và `/portal/execution/v1/command-operations/*` ở TS; `/internal/v2/manager/*` ở Edge path được Portal plan mô tả; Portal `/api/v1/execution/current-source/:environment/screens/:screenId`, `/api/v1/execution/history/:environment/:relationKey`, `/api/v1/execution/resources/{alphas|portfolios|accounts|bindings}/:resource_id`, `/api/v1/execution/durable-mirror/integrity`, `/api/v1/execution/manager/deployments`, `/operations`, `/current/:operationId`, `/api/admin/profile-access`, `/api/admin/accounts`. Đây là **route declarations/source path**, chưa kiểm current runtime. Không gộp shorthand `/operations` thành URL root đoán; đọc controller prefix trước implementation.

Các vùng dự kiến sửa **sau approval**, không phải active runtime: Edge `crates/{maximum-data-adapter,manager-v2-client,ts-transport,edge-auth,projection-core,projection-store-pg,realtime-sse,command-relay,intercell-gateway}` và Portal `contracts/{maximum-data-return-v1,n12-command-relay-v1-request}`. Ưu tiên sửa đúng module đã có; không nhân thêm một stack song song.

### 2.5 Nhánh lịch sử và nhánh qualification

| Repo hoặc worktree | Branch và commit | Cách dùng |
|---|---|---|
| TS canonical cũ `/home/bobby/trading_system` | `668e103`, dirty | Cũ hơn baseline; không dùng làm target implementation |
| Portal research `/home/bobby/portal-research` | `docs/research-loop-plan` @ `99a2eb73214ab31598a6aa8cbb5b38c02272d813`, dirty, ahead388 theo review | Chỉ bổ sung EDS12/N29 qualification contracts; không đổi Edge core và không là runtime mới |
| Manager v2 worktree | `feat/manager-v2-paper-read` @ `54c6f5f3`, clean, 04/09 | Historical Manager read/maximum-data request |
| Data activation worktree | `feat/execution-data-activation` @ `6f6503ea`, clean, 04/09 | Historical source handoff/activation |
| Current BFF worktree | `feat/eds-current-bff` @ `bab79402`, clean, 05/09 | Historical current-page BFF |
| Owner-return worktree | `docs/eds09-ts-owner-return-handoff` @ `ec97c483`, clean | Historical owner-return contract |
| R4/R5 worktree | `deploy/r4r5-activation` @ `d63a6501`, clean | Historical profile prep/activation evidence |

Bảng §2.5 lưu lịch sử qualification, không mô tả trạng thái branch hiện tại. Inventory implementation phải bắt đầu từ exact SHAs §2.1, gồm TS dirty diff và Research BE/FE riêng; không lấy tên branch activation để chứng nhận service đang active. N12 TS boundary source-present/config-gated khác Edge relay source-rejected; cả hai dependency phải đóng riêng.

### 2.6 Source audit tài nguyên ngày 2026 10 15

Audit chỉ đọc ngày 2026-10-15 được chuyển từ guide v1.1 ghi nhận source tại Research BE `fdea081d912854223499e995e6bd4b4482229249` và FE `051eeb89a8105d9f76032422c75821d7af98d1e2`; không chạy benchmark, không verify deployed UI/runtime. Locators dưới đây là full repo-relative paths từ đúng BE/FE worktree của audit; EPG10-00 kiểm lại exact file digests/working-tree state trước sửa. Khác revision với Execution main phải diff/reconcile, không tự coi Research source là Execution baseline.

| Source locator và revision scope | Quan sát source | Tác động implementation và cách xác minh |
|---|---|---|
| `services/portal-execution-edge-rs/crates/edge-service/src/main.rs:362–431` tại BE audit | Poll controls có khoảng 250 ms–60 s; event page cap 200 | Reuse bounded controls; inventory current defaults/effective config và measured cadence. Không coi min poll interval là guaranteed latency hoặc page cap là full history |
| `services/portal-execution-edge-rs/crates/edge-service/src/main.rs:474–536` tại BE audit | Shared admission defaults 8 requests/s, concurrency 8, cache TTL 750 ms | Có admission/cache substrate. Đây là source defaults, chưa là production limits; cộng all replicas/scopes, kiểm cache keys/auth revision và double-fetch |
| `services/portal-execution-edge-rs/crates/edge-service/src/main.rs:1981–2047,2112–2155,2491–2562` tại BE audit | Có response byte caps/related response controls | Reuse và test compressed/decompressed/in-flight buffer cost, oversized-event behavior; không suy RSS bounded chỉ từ response cap |
| `services/portal-execution-edge-rs/contracts/maximum-data-return-v1/e7-resilience-capacity.v1.json:4–18,69–85,187–211`, artifact 04/09 | `deployment_current` limit 1; read-only concurrency 1 Paper/Sandbox, 2 Live trong fixture artifact | Không production SLO, không global replay/full-history/capacity proof; giữ exact evidence scope |
| `apps/control-api/src/manager-lists/manager-lists.service.ts:28–33,386–455` tại BE audit | Snapshot expiry 5 s; refresh fleet đi tuần tự các profiles, mỗi profile fanout 8 relations và thêm Paper performance; mỗi relation tối đa 10 pages × 200 rows | Potential amplification hotspot. All-environment upper path lý thuyết 25 drains / 50,000 rows mỗi refresh, **chưa là actual rows/QPS/CPU**. Phải đo calls/rows/bytes/duration theo trigger/profile/consumer |
| `apps/control-api/src/manager-lists/manager-lists.service.ts:336–384` tại BE audit | Có stale-while-revalidate/coalescing hiện hữu | Reuse semantics trước thêm scheduler/cache mới; test key/scope/revoke, refresh stampede và freshness chính xác |
| `apps/control-api/src/manager-lists/manager-lists.repository.ts:135–163` tại BE audit | Transaction xóa toàn fleet scope rồi insert lại toàn bộ snapshot | Potential DB write/WAL amplification; giữ atomicity nhưng đề xuất entity-level upserts/tombstones + incremental checkpoint, không xóa history/financial facts |
| BE/FE audit về scoring/Archive | Chưa tìm thấy QBTS formula implementation hoặc Archive paper-watch source | Guide/companion là proposed capability; không tuyên bố button, score engine hay watch runtime hiện hữu |

Expiry 5 s của manager snapshot và TTL 750 ms của shared admission/cache là hai lớp khác nhau. Không cộng/trừ chúng để suy end-to-end freshness; capture trigger timeline, upstream fetch, projection commit, cache serve và browser delivery. Bound 10 pages hiện tại cần explicit PARTIAL/continuation nếu còn dữ liệu; không coi drained max-page count là COMPLETE.

### 2.7 Thứ tự tối ưu từ code hiện tại

1. **P0 đo và khóa scope:** instrument current refresh triggers, calls/rows/bytes per relation/profile, duration, cache hits/SWR/single-flight, DB rows deleted/inserted/updated, WAL, CPU/RSS và lag. So same source-set/coverage giữa baseline/candidate; không quy theoretical 50,000 thành measured load.
2. **P1 đổi read contract sang incremental:** reuse certified journal/correction/cursor substrate; một committed batch làm tiến checkpoint, không full fleet fetch cho mỗi refresh. Producer vẫn minimal; unsupported source giữ explicit current-only/partial thay invent delta.
3. **P2 đổi Research projection writer:** entity-level upserts + explicit tombstones và checkpoint cùng transaction/consistency group; chỉ update changed entities. Existing atomic full snapshot còn dùng cho bootstrap/verified resync với bounded staging; không làm steady-state default. Daily/window rollups là derived Research views có version và correction invalidation, không ledger thứ hai.
4. **P3 cadence và reuse:** reuse SWR/coalescing ở source hiện có; chia exact-event/current-mark/catalogue/history/analytics/Archive cadence theo §6.1. Shared notify/poll fallback, one source consumer và scoped cache/fanout. Tăng TTL đơn thuần không sửa expensive refresh hoặc revoke safety.
5. **P4 query/serialization:** cap concurrency/calls/bytes, keyset/index plan, narrow columns, bounded parse/compress, incremental rollups và decimated presentation. Giữ full history continuation và exact analytical input.

Ưu tiên này là implementation proposal dựa source audit, chưa là approved patch hay kết quả giảm CPU/RAM. Mỗi thay đổi phải có before/after evidence §9, tests §10 và approval đúng repo/target. Chi tiết audit chung được giữ trong `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md`; receipt/source revisions vẫn phải pin trong execution manifest.

### 2.8 Targeted input audit cho scoring final

`REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` §9 ghi targeted source-only audit ngày 2026-10-15, PM pin `d16aa2b5f251596e469807f57e81fe14cdc7e763` và Research BE repin `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`. Các BE/FE pin và line locators §2.1/2.4/2.6 là historical source snapshots; không gán line numbers cũ sang BE mới. Targeted audit chưa xác minh applied schema, published data completeness, calibration hoặc current runtime.

- Equity snapshots có source ở TS `init-db/10-performance.sql:74–102`, `init-db/19-performance-pnl-ops.sql:9–44`, `services/performance/repository.py:508–660`. Native source `services/performance/native_owner.py:39–48,147–150` chỉ point-in-time equity; PM `services/portfolio_management/operator_reports_contract.py:174–202` còn `UNAVAILABLE_METHOD_NOT_CERTIFIED` cho return/Sharpe/drawdown. Không lấy source snapshot existence làm metric certification; cần derived Research projection với flow/grid/cost proof §8.6.
- Capital flow candidate ở PM `services/portfolio_management/operator_reports_contract.py:313–379` có FUND/RETURN_CAPITAL/internal-pair elimination. Fee/funding/economic-fact substrate có source nhưng borrow/interest completeness chưa chứng minh; fills + instrument metadata có, chưa tìm thấy canonical interval executed-notional aggregate. Exact source locators và gaps theo từng input giữ ở review §9. Missing rows không chứng minh zero/no cost; reuse source facts, bổ sung scoped Research adapters cho notional/FX/costs sau approval.
- Research run/version/parameter digests ở BE mới đã có source pins, accepted TS deployment binding chưa tìm thấy trong phạm vi audit. Gap này chặn research/Regime evidence tương ứng; không chặn direct economic PortfolioScore chỉ dùng own reconciled ledger. Direct portfolio path không phải chờ mọi alpha q; raw alpha vẫn cần sleeve attribution/partition proof, không lấy cả physical balance làm sleeve NAV.
- Formula/bands đã chọn nhưng approved production calibration artifact chưa được tìm thấy trong phạm vi audit. L/U, delta, grid/blocks/maturity/freshness tiếp tục config-pending. Analytical `manager_book` là consolidated subject của authorized fund/root/portfolio scope hiện hữu, không đề xuất thêm Book authority/entity DB mới.

MVP scoped có thể bắt đầu với một verified currency/domain/profile/window, regular valuations + classified flows + required costs + deduped fill/instrument/FX facts và approved runtime config. Phần nào không applicable cần proof theo profile; chưa đủ proof dùng canonical status của final spec, không thêm status API từ wording audit. Audit nguồn không thay math/integration/runtime/release receipts.

## 3 Kiến trúc triển khai có điều kiện

### 3.1 Placement và ownership

| Thành phần | Vị trí đề xuất | Quyền | Điều kiện giữ hoặc chuyển |
|---|---|---|---|
| Native exchange ingest và trading loop | TS hiện tại | Exchange facts, execution, risk inputs theo authority hiện có | Không chuyển chỉ để phục vụ dashboard; bảo toàn private WS lifecycle |
| Transactional domain writer và change capture | Cùng authority DB/TS | Ghi business facts và outbox/journal atomically | Writer coverage và transaction semantics được chứng minh |
| Producer Edge và export boundary | Gần TS/Data Layer; reuse module/process hiện có nếu isolation đạt | Incremental committed-fact export, durable cursor, bounded serialization; relay tới TS handler riêng | Hard ceilings CPU/RAM/pool/IO; không history analytics/scoring; không thêm hop vô ích |
| Durable replication consumer và projection | Research nếu capacity đủ | Chỉ ghi read model và receipt mirror của mình | Capacity headroom, backup, retention và restart đã đo |
| Shared calculation module, history, analytics, report materialization | Research read side | Read/rebuild exact facts và accepted Research artifacts; incremental rollups/scoring/regime/correlation | Một canonical calculation contract; bounded job queues, source lineage; không financial authority |
| BFF query cache và realtime fanout | Research/Portal | Scoped reads, authorized subscriptions | Cache/stream keyed by scope+auth revision+generation |
| Browser UI | Client | Chỉ sử dụng BFF được authorized | Không nhận service credential, DSN hoặc native API key |

Research không mặc nhiên mạnh hơn TS. EPG10-01 đo cả hai host, CPU steal, memory pressure, IO và DB contention trước chốt placement. Nếu Research thiếu capacity, giảm fanout/report concurrency, tăng cache/coalescing hợp lệ hoặc đề xuất capacity riêng; không đẩy tải chưa đo trở lại trading critical path.

### 3.2 Hai luồng riêng

**Read plane:** TS committed facts → bounded export → durable Research consumer → projection/checkpoint transaction → scoped BFF query và stream. Không để một browser chậm giữ source DB transaction mở. UI chỉ nhận delta sau khi read model commit.

**Command plane:** Portal verified session → BFF tạo actor envelope → workload-authenticated relay → TS validate identity, current business authorization, version và preconditions → existing domain handler → durable receipt/outcome → export/reconcile về read model. Command không chờ browser online và không coi mirror receipt trên Research là business commit.

Một service có thể chứa cả hai module nhưng phải tách queue, pool budget, admission và metrics. Backlog bootstrap hoặc report không được chiếm hết command/status capacity. Command/status cũng không được phá latency budget của trading loop.

### 3.3 Không có hai authority đồng thời

Một dataset có đúng một writer authority trong một generation. Khi chuyển projection writer hoặc producer role, thực hiện fence bằng generation/lease được kiểm tại commit. Old process còn chạy nhưng generation cũ phải bị từ chối ghi; lease theo thời gian đơn thuần không đủ nếu process bị pause rồi sống lại.

Dual read/shadow compare được phép trong môi trường được duyệt. Dual business write vào hai engine độc lập bị cấm. Rollback projection khác rollback financial state: có thể đổi read pointer về projection tốt còn tương thích; không undo fill, fee, funding hoặc capital movement đã commit.

### 3.4 Phân chia workload để Edge sống cùng TS và Data Layer

Tên “Edge” không cho phép gộp producer, projector và browser BFF thành một process nặng trên trading host. Boundary triển khai phải ghi rõ:

1. **Producer cạnh TS:** chỉ committed-fact capture/export, permit/scope enforcement, cursor/checkpoint publication, bounded compression/serialization và operational counters. Tái sử dụng journal đã được chứng minh; không thêm independent economic ledger. Durable export ledger nếu cần chỉ giữ transport identity/cursor/status theo §5, không tính balance/PnL/risk riêng.
2. **Research projector:** nhận incremental batches, dedup, stage/apply theo consistency group, lưu exact published history và rebuildable read views. ACK sau durable commit. History backfill/checkpoint và refresh jobs có quota riêng; reconnect không quét lại toàn bộ history.
3. **Shared Research calculation module:** sở hữu công thức đã version hóa và input lineage cho QBTS, AlphaScore, PortfolioScore, regime fit, cashflow-adjusted reports và correlation. Chạy incremental theo affected entity/window; full recompute là bounded background job được admit riêng. Đây có thể là module trong service hiện có, không mặc định thêm microservice.
4. **Research BFF:** xác thực current scope, query projection/metric snapshots đã commit, cache/single-flight và fanout push notification/delta. Query history dùng keyset/index plan; không fanout raw TS fetch theo browser. BFF không tạo công thức thay thế.
5. **Browser:** filter/page/render, hiển thị score components/weights/availability và chart decimation có nhãn. Không tính canonical money/score/regime độc lập bằng JS, không trả kết quả decimated làm report/oracle.

Trade/risk source facts đang dùng ở TS phải tiếp tục theo authoritative cadence hiện có. Tối ưu UI không được làm chậm risk enforcement hoặc suppress financial events. Nếu capacity Research chưa đủ, giữ capability analytics UNAVAILABLE hoặc giảm cadence/concurrency đã duyệt; không tự chuyển job nặng sang TS/DL.

### 3.5 Rollout đọc theo dataset và ràng buộc chéo

Mỗi release row gồm dataset, authority, writer/source SHA, schema, mode/profile/scope, consistency group, published history coverage, cursor/barrier proof, ACL/trust, resource bound, tests và enabled state. Family có đủ proof được xét độc lập; family thiếu producer, P03 trust, P13 report hay P14 adapter chỉ giữ affected feature blocked. Shared security/correctness dependency thật vẫn phải đóng trước mở consumer.

N1 core-kill F1 còn mở chặn N1 cutover và mọi feature thật sự phụ thuộc guarantee đó. Nó **không tự là global blocker** của offline contract work hoặc read-only dataset độc lập có lineage, recovery, scope và resource proof riêng. Ngược lại, gắn nhãn “read-only” không miễn impact test nếu exporter làm thay đổi hot-path contention, resource admission hoặc lấy data phụ thuộc recovery đang mở. Ghi dependency/NOT_APPLICABLE bằng evidence, không bằng tên phase.

Read-only activation không cần command relay hoàn thiện. Cần test relay vẫn denied và bỏ/mờ action UI chưa được phép; không claim command-ready. Command và live mở bằng separate operation/mode gate sau §7/§10, không tự bật khi read projection đạt.

## 4 Catalogue tài nguyên và hợp đồng nguồn

### 4.1 Envelope bắt buộc

Tên sau là **logical field đề xuất**, không khẳng định DTO hiện tại đã có. Tại EPG10-02, map từng field sang contract hiện hữu hoặc migration additive.

```json
{
  "contract_version": "edge.v1",
  "schema_version": 1,
  "dataset": "portfolio_memberships",
  "source_continuity_epoch": "opaque-source-epoch",
  "projection_generation": "opaque-projection-generation",
  "scope": {
    "environment": "SANDBOX",
    "venue": "OKX",
    "native_profile_id": "opaque-profile-id",
    "execution_backend": "opaque-verified-backend",
    "portfolio_id": "opaque-portfolio-id"
  },
  "as_of_ms": 1791590400000,
  "source_observed_at_ms": 1791590400000,
  "emitted_at_ms": 1791590400001,
  "authorization_revision": "opaque-revision",
  "quality": {
    "completeness": "PARTIAL",
    "freshness": "UNRESOLVED",
    "reasons": ["PRODUCER_NOT_ADMITTED"],
    "coverage": "AUTHORIZED_ONLY"
  },
  "availability": "UNAVAILABLE",
  "implementation_status": "PLANNED",
  "history_capability": "UNKNOWN",
  "coverage": {"history_from_ms": null, "history_to_ms": null, "gaps": []},
  "coverage_watermark": null,
  "continuation": null
}
```

Ví dụ chỉ minh họa schema, không mô tả một record hay latency đã đo. Shared Edge→Portal transport `edge.v1` là **đề xuất**. `as_of_ms` là mốc trạng thái/snapshot; `source_observed_at_ms` là mốc xác nhận nguồn; `emitted_at_ms` là lúc serialize. Không lấy thời gian emit mới để che dữ liệu cũ. Canonical wire dùng UTC epoch milliseconds ở fields `*_ms`, số nguyên safe integer được schema validate; durations cũng có hậu tố `_ms`. Timestamps không dùng làm ordering/dedup key. Source precision cao hơn ms phải giữ original timestamp/commit position trong lineage phù hợp, không round để so revision.

`source_continuity_epoch` thay khi source continuity bị reset/restore hoặc bắt đầu một nguồn liên tục mới. `projection_generation` thay khi rebuild/replace read model, có thể đổi trong khi source epoch không đổi. Hai trường không thay thế nhau. Trước khi projection tồn tại, producer-only envelope có `projection_generation=null` theo schema riêng; Edge→Portal published projection phải có generation. Mọi cursor kiểm cả source epoch và applicable projection generation.

IDs, revisions, sequences/counters truyền opaque strings; không parse quyền/currency/venue/owner từ tên và không ép JS Number. Decimal money/quantity/price truyền decimal string với currency, scale/rounding contract và source units; không dùng floating point cho accounting. `null`, zero, missing, unknown và not applicable khác nhau. NaN/Infinity bị reject.

Wire quality/availability dùng uppercase. `quality.completeness` là `COMPLETE`, `PARTIAL` hoặc `UNRESOLVED`; `quality.freshness` là `FRESH`, `STALE` hoặc `UNRESOLVED`. `coverage=AUTHORIZED_ONLY` nói rõ complete trong phạm vi được phép. Availability có vocabulary tại 4.2. Không tự suy freshness từ completeness hoặc ngược lại.

#### Mapping transport và browser có version

| Nghĩa | Canonical Edge `edge.v1` | Browser `portal.snapshot.v1` | Adapter legacy và điều cấm |
|---|---|---|---|
| Source continuity | `source_continuity_epoch` | `versions.source_continuity_epoch` | Legacy `epoch/source_generation` chỉ map khi exact semantics đã chứng minh; không dùng một field cho hai epochs |
| Read-model generation | `projection_generation` | `versions.projection_generation` | Legacy `generation` cần explicit source mapping/version |
| Business/snapshot cutoff | `as_of_ms` | `as_of_ms` | RFC3339 legacy parse UTC rồi validate exact range/precision policy; không autodetect đơn vị |
| Knowledge/coverage time | `recorded_through_ms` / `facts_through_ms` nếu producer có proof | Fields cùng tên khi có cùng semantics | Không lấy `source_observed_at_ms` hoặc `emitted_at_ms` thay thế coverage watermark |
| Source observation | `source_observed_at_ms` | Giữ trong source lineage của browser DTO nếu cần | Không nâng source freshness chỉ vì browser nhận response |
| Export emission / projection production | `emitted_at_ms` | `produced_at_ms` do Portal projection ghi riêng; upstream emitted time giữ lineage | Không copy export time thành projection completion time |
| Quality | Uppercase `quality.{completeness,freshness,reasons,coverage}` | Object cùng semantics | Lowercase legacy chỉ chuyển bằng explicit enum table trong versioned adapter; unknown enum fail closed |
| Availability | `AVAILABLE/PARTIAL/UNAVAILABLE/OUT_OF_SCOPE` | Cùng enum và nghĩa với PM §9.6; reason/coverage giữ nguyên | History capability, implementation/evidence status là fields riêng theo 4.2; không map unavailable thành empty/zero |
| Continuation / resume | Opaque scoped `continuation` hoặc delta cursor + authenticated `coverage_watermark` | Opaque `resume_cursor` của BFF, bound cùng semantics | Không lộ raw global offset/count; BFF cursor không tự là source cursor |
| Environment | `scope.environment=PAPER/SANDBOX/LIVE` cùng venue/profile | Browser `scope.mode` theo explicit mapping | `DEMO` chỉ là browser label/adapter cho verified OKX Demo profile; không là alias generic mọi SANDBOX |
| Reset | `RESYNC_REQUIRED` | `RESYNC_REQUIRED`; UI copy có thể đặt tên riêng | Legacy/UI `RESET_REQUIRED` chỉ alias explicit trong adapter, không là canonical wire enum |

#### Scope mode và profile không được nhập nhằng

| TS canonical mode theo PM §4.3 | Edge representation | Browser presentation hợp lệ | Điều kiện bất biến |
|---|---|---|---|
| `paper` | `PAPER` | Paper theo Portal enum/display contract | Giữ `venue`, `native_profile_id`, `execution_backend`; không suy execution backend từ mode |
| `sandbox` | `SANDBOX` | Sandbox; `DEMO` chỉ khi verified OKX Demo profile được adapter nhận diện rõ | Không map mọi testnet/sandbox sang OKX Demo; giữ exact venue/profile/backend |
| `live` | `LIVE` | Live với activation policy riêng | Không chuyển từ sandbox vì browser label hoặc credential name |

Đổi casing chỉ là versioned representation mapping, không sửa TS domain IDs/mode names. TS payload vẫn dùng đúng canonical mode của authority; relay không rewrite opaque IDs có mode trong tên. Scope key còn gồm portfolio/account/deployment/physical binding khi applicable; hai records cùng mode nhưng khác venue/profile/backend không được merge. Unsupported mapping fail closed và báo OUT_OF_SCOPE/UNAVAILABLE theo đúng lý do đã scoped.

Versioned adapter phải ghi input/output schema versions, field/enum map, numeric/time conversion, unsupported values và golden vectors. Một adapter legacy RFC3339/lowercase không cho phép canonical wire gửi lẫn hai định dạng. Outer transport không sửa payload PM `pma.capital-command.v1.1`; field time bên trong payload theo authoritative schema riêng, được giữ nguyên.

### 4.2 Availability history và implementation status tách riêng

Canonical availability thống nhất PM §9.6 và Portal là:

- `AVAILABLE`: producer phục vụ được requested contract trong authorized scope; coverage/freshness vẫn phải được đọc riêng.
- `PARTIAL`: chỉ phục vụ một phần requested contract/coverage; reason và gaps bắt buộc, không quảng bá full retrieval.
- `UNAVAILABLE`: không phục vụ được request vì thiếu producer, chưa enabled/certified, source lỗi hoặc unsupported capability; reason an toàn cho caller.
- `OUT_OF_SCOPE`: ngoài selected supported/authorized scope. Không tiết lộ một hidden dataset/entity có tồn tại hay không; error/discovery behavior theo non-disclosure policy.

Ba chiều khác không được dùng làm giá trị availability:

| Chiều riêng | Fields hoặc enum đề xuất | Nghĩa |
|---|---|---|
| History capability | `history_capability=CURRENT_ONLY/HISTORY_AVAILABLE/UNKNOWN` | Có current state; hay có history với coverage; hay chưa xác minh. HISTORY_AVAILABLE không tự nghĩa full từ ngày đầu |
| Implementation | `implementation_status=PLANNED/SOURCE_VERIFIED/RUNTIME_PENDING/RUNTIME_VERIFIED` | Source và runtime evidence tiến tới đâu; CODE_MERGED hoặc SOURCE_VERIFIED không tự AVAILABLE |
| Evidence | `evidence_status=SOURCE_CONFIRMED/HISTORICAL_EVIDENCE/UNKNOWN/BLOCKED` cùng receipt refs | Chứng cứ của claim; độc lập current served scope và data quality |

Catalogue response nên chỉ public các implementation/evidence metadata được phép; không lộ private infrastructure qua reason. Với source và export có readiness khác nhau, ghi `source_availability` và `export_availability` cùng canonical enum, ngoài served-response `availability`, kèm scope/time riêng. Không copy source AVAILABLE sang export khi publisher chưa được admit.

| Legacy hoặc mô tả cũ | Mapping có version | Bảo toàn nghĩa |
|---|---|---|
| `current_only` / `CURRENT_ONLY` | `history_capability=CURRENT_ONLY`; availability xác định từ requested current/history contract | Current request có thể AVAILABLE, history request UNAVAILABLE; không chế history |
| `history_available` / `HISTORY_AVAILABLE` | `history_capability=HISTORY_AVAILABLE` + history coverage/gaps; availability từ requested coverage | History có gap có thể PARTIAL; complete current không suy complete history |
| `planned` / `PLANNED` | `implementation_status=PLANNED`, served availability UNAVAILABLE cho capability chưa phục vụ | Không gửi empty array như đã tải xong |
| Source verified nhưng runtime pending | `implementation_status=RUNTIME_PENDING`, evidence source refs; served availability theo actual proof, nếu chưa có thì UNAVAILABLE | Code tồn tại không nâng runtime thành verified |
| `restricted` / `RESTRICTED` | `OUT_OF_SCOPE` cùng safe response/redaction policy | Không lộ hidden existence/count; không dùng để cấp quyền rộng hơn |
| `unavailable` | `UNAVAILABLE` | Giữ reason không nhạy cảm và affected scope |

Empty authorized result chỉ hợp lệ khi request AVAILABLE, nguồn đủ completeness trong requested scope và thực sự không có record. Availability PARTIAL khác quality.completeness PARTIAL: một cái nói contract phục vụ được tới đâu, một cái nói chất lượng/coverage của dữ liệu đã trả. Fresh nhưng partial vẫn không COMPLETE; stale complete state vẫn có thể AVAILABLE theo stale-read policy đã công bố.

### 4.3 Ma trận catalogue đầy đủ

**Ký hiệu source status ở bảng:** `E` có substrate/source evidence cần inventory writer+schema; `P` upgrade/deferred hoặc chưa chứng minh published; `U` coverage hiện tại chưa đủ để kết luận. Toàn bộ trạng thái runtime/applied schema vẫn cần EPG10-00 xác minh. Những tên dataset là contract logic đề xuất, không phải tên bảng/API đã xác minh.

| Dataset logic | Authority và khóa chính | Nội dung cần xuất | Coverage phải chứng minh | Status/gate |
|---|---|---|---|---|
| User identity mapping | TS mapping của verified issuer+subject; user ID | Trạng thái active/suspended/archived, stable display metadata tối thiểu | Current + lifecycle history được duyệt; không password/token | P; XLC-01 |
| Portfolio registry | TS portfolio ID | Root relation cố định, currency/scope, trạng thái, version | Current và lifecycle/tombstone | E/U |
| Portfolio membership | TS portfolio+user+grant ID | Capabilities, effective interval, grantor, revision | Current + grant/revoke history; không suy từ owner text | P; migration48 deferred |
| Alpha registry | TS alpha/strategy ID | Definition reference, status, schema/version, alias nếu có | Full catalogue cả active/archived trong authorized scope | E/U |
| Alpha ownership | TS alpha owner relation | Đúng một owner, effective interval, attribution version | Temporal ownership, không đổi lịch sử theo owner hiện tại | P; PM v1.1 |
| Deployment registry | TS deployment ID | Alpha, account, portfolio, environment, venue, native profile, state | Current + assignment/lifecycle history | E/U |
| Internal accounts | TS account ID | Accounting currency, deployment/portfolio refs, state | Full current catalogue + lifecycle | E/U |
| Venue physical account registry | TS physical account ID | Venue, supported product/profile, status, redacted label | Current + profile verification evidence reference | E/U; không credential |
| Account binding | TS binding ID/revision | Logical→physical mapping, profile, validity interval | Current + historical bindings dùng replay/attribution | E/U |
| Root capital limit | TS capital authority | Approved cap, currency, version, effective time | Current + adjustment history | P; không suy từ equity |
| Economic capital assignment | P18 economic authority theo PM contract | FUND, RETURN_CAPITAL, verified source/parent, exact amount | Exact append-only events, corrections và full supported history | P/E theo path được certify |
| Budget entitlement | TS admission authority | Granted, committed, free, deficit, parent availability, version | Current + budget event history | P; allocation labels chưa là HARD authority |
| Execution grant/reservation | P18 risk/admission authority | Reservation, intent/order refs, lifecycle, remaining obligation | Current + exact transitions, unknown obligations | E/U; khác budget grant |
| Administrative locks | TS lock authority | Lock ID, reason class, inherited scope, created/released by, version | Current + lock/unlock history; không auto-expiry ngầm | P |
| Recall requests | TS recall state machine | Requested/applied/pending/cancelled, blockers, parent-child refs | Exact partial/pending/cancel history | P |
| Trading state | TS risk/admission | ACTIVE/REDUCING/HALTED, inherited restrictions | Current + change audit; source gate coverage phải verify | E/P |
| Order intents | TS execution authority | Immutable intent, actor, scope, idempotency, disposition | Durable history trong retention nghiệp vụ | E/U |
| Obligations và unknown execution outcomes | TS execution/risk authority | Pending order/position/funding obligations, uncertainty, recovery/reconciliation refs | Exact lifecycle tới resolved; không release capacity chỉ vì timeout | E/U |
| Orders và execution status | TS/exchange facts qua connector đã xác minh | Native/client IDs, quantities, side, status, finality, uncertainty | Exact transitions; late/duplicate/out-of-order mapping | E/U |
| Fills | TS canonical fill/economic authority | Fill source ID, order/account, qty/price/fee, occurred/recorded | Exact history; correction/reversal linkage | E/U |
| Positions và episodes | TS canonical position/economic authority | Net/hedge scope, quantity, cost basis, episode/finality | Current + reconstructible change/history coverage | E/U; true-flat contract |
| Balances và collateral | TS verified venue/risk snapshots | Currency, total/free/locked/available, observed time | Current snapshots + documented sampled history | E/U; không gọi sample là exact event history |
| Fees và funding | TS economic journal | Amount/currency, event source, effective time, adjustments | Exact history gồm late facts | E/U |
| Accounting postings và corrections | P18 accounting authority | Source fact, posting legs, correction/reversal link, currency, effective/recorded time | Exact immutable posted history; no overwrite | E/U |
| Economic journal | P18 accounting authority | Immutable fact/event IDs, debit/credit/effect provenance | Full published exact history + correction relationships | E/U |
| Valuation và prices used | TS approved valuation inputs; Research derived reports | Price source, timestamp, currency conversion policy/version | Coverage/freshness để reproduce metrics | E/U; no implicit USD=USDT |
| Risk state và limits | TS risk authority | Capacity, exposures, limit status, stale/blocked reason | Current authoritative state + policy/version history cần thiết | E/U |
| Reconciliation | TS reconciliation authority | Runs, checkpoints, breaks, resolution/correction refs | Durable run/break/resolution history | E/U |
| Command receipts | TS command ledger | Accepted/terminal state, target version, command/result refs | Durable history đủ idempotency và ambiguity window | P/U |
| Operational audit | Authority tạo hành động | Human/workload actor, action, target, auth revision, result | Append-only audit theo policy; redact sensitive payload | E/U |
| Publication catalogue/manifest | TS exporter authority | Dataset schema, scope, permit, generation, coverage, fences | Version history và active manifest | E; P16 substrate |
| Sync health/cursor/retention | Mỗi hop giữ state của mình | Source cursor, consumer commit, lag, retention floor, resync status | Operational history đủ sự cố và capacity planning | E/U |
| Recovery và quality events | Authority tương ứng và Research operational projection | Gap/quarantine/resync/restore, source continuity, finality/quality changes | History đủ reconstruct incident và report restatement | E/U |
| Report snapshots | Research derived read model | Portfolio/alpha-owner/venue views, metric version, as-of | Rebuildable snapshots và lineage; không là tiền authority | P/U |
| QBTS per alpha | Shared Research module; alpha/deployment/sleeve binding + window | Raw F(P/R/B), six atomic metrics/contributions, band/evidence/availability; giữ actual sizing/leverage/cost | Economic ledger/source set + binding; research run chỉ khi dùng research evidence; revisions/watermarks | P; formula đã chọn, runtime inputs/calibration pending |
| Manager AlphaScore | Shared Research module; manager/portfolio scope + policy revision | sum(w*q), w từ verified allocated economic capital; contribution, coverage/bounds và provisional weight | Full denominator incl. missing/stale/incomparable q; same window/basis; ACL-safe | P; không thay raw QBTS hoặc direct PortfolioScore |
| PortfolioScore | Shared Research module; portfolio/manager book + window | Direct F(portfolio NAV); manager F(unique consolidated NAV); P/R/B, band, evidence | Own ledger/cost/turnover/FX/flow watermark + dedupe manifest; độc lập raw q/grouping/correlation | P; formula đã chọn, runtime inputs/calibration pending |
| Regime fit | Shared Research module; alpha + research run + window + regime version | Descriptive historical matching, stage-separated outcomes, evidence/support | Exact binding + no-lookahead feature/reference manifests; không probability hoặc score multiplier | P; support calibration/runtime pending |
| Archive paper-watch | Research monitoring/read workflow; archived alpha + paper run + watch policy | Paper observations, cadence, retention, cost/status và re-review signal | Authorized watch run, stopped/paused state, gaps và immutable decision history | P; không auto-promote/live |

Catalogue phải thêm mọi resource nguồn thực tế phát hiện khi inventory, không giới hạn vào số dòng của bảng. Một dataset chỉ được đổi từ P/U sang certified sau writer map, query/schema fixture và runtime publication proof đúng scope. Alias/history archived không được loại vì UI mặc định chỉ xem active.

### 4.4 Pagination và tính đầy đủ

Dùng keyset pagination ổn định theo manifest/snapshot, không offset scan cho bảng lớn đang thay đổi. Page bị chặn theo cả row count và serialized bytes; một record quá lớn có error/alternative retrieval contract, không silently drop. `next_cursor` opaque, scoped, signed hoặc lưu server-side; gắn dataset, filter hash, generation, snapshot and schema version. Đổi filter hoặc scope thì không dùng cursor cũ.

Một export session có nhiều pages và có thể tiếp tục tới hết catalogue; page limit không là tổng data limit. UI list có thể virtualize hoặc tải dần, nhưng export/report có continuation và count/completeness theo nguồn. Count chưa được tính thì `unknown`, không suy bằng page size. Không cắt “top 100 account” rồi gọi full catalogue.

Từ chối cursor giả, cursor khác principal/scope, schema incompatible, generation cũ và cursor quá retention bằng error có mã rõ. Mã HTTP/route cụ thể chốt trong schema; consumer không parse chuỗi thông báo tự do.

### 4.5 Hợp đồng derived metrics và Archive watch

Canonical metric registry là contract logical cần map sang source thật tại EPG10-02; không khẳng định đã có service/table/endpoint. Mỗi metric có `metric_id`, `definition_version`, unit/direction, subject/economic scope, input dependencies và source authority, expected grid/window, validity/freshness rules, computation owner, precision, version/hash và correction invalidation. Tách raw metrics, quality scores, allocation attribution và diagnostics để không làm một optional dependency chặn toàn bộ score view.

Shared snapshot envelope phải có `subject_type/subject_id`, `comparable_basis_id`, individual/subject binding, formula/policy/calibration IDs/hash, approval reference, effective/requested windows, source-set digest, source dataset/epoch/checkpoint refs, source watermarks, `as_of_ms/knowledge_cutoff_ms/computed_at_ms`, stage breakdown, `series_kind/economic_domain`, sample/block/trade counts, observed/actual durations, evidence status, cost/stress provenance, `value/status/reason_codes/band/components/bounds`, revision/supersedes/original-restated và authorization scope/revision. Wire numeric metrics/weights/capital dùng decimal strings; timestamps/counts theo safe-integer schema. `null` khác zero; invalid/nonfinite bị reject. Score status lowercase của specification được giữ riêng với uppercase transport availability; adapter explicit, không ép `provisional` thành `UNAVAILABLE`.

Một score cùng subject/path/window/basis phải có cùng canonical value ở Research, BFF và UI. Raw QBTS `q_i=F(X_i)` không nhân manager allocation, nhưng giữ sizing thực tế trong từng deployment, leverage, cash và costs. `alpha_score_contribution=w_i*q_i` không có quality band. Allocation AlphaScore dùng toàn bộ positive allocation denominator, kể cả row bị UI filter, archived hoặc thiếu q; valid q gồm `available` và `provisional` cùng window/basis. Full coverage + provisional q → numeric provisional aggregate và công bố `provisional_allocated_weight`; thiếu q → full composition value null và valid bounds, không hidden renormalization. PortfolioScore và manager score lấy F trên own reconciled NAV path; thiếu q, lineage grouping, correlation hoặc research linkage không tự làm mất economic score hợp lệ.

Research binding/run bắt buộc khi dùng research evidence hoặc Regime Fit; pure economic ledger score dùng subject binding/data ownership manifest phù hợp, không bịa run ID. Actual books hợp nhất unique capital và internal-transfer elimination trước tính F; không average alpha/child-portfolio scores. HHI/dispersion/correlation/risk contribution có namespace/status riêng; thiếu grouping chỉ chặn grouping diagnostics. Missing required turnover chỉ chặn stress-dependent component, full F null/partial_components, giữ known components nếu inputs độc lập còn valid. Missing required baseline costs có thể invalid toàn bộ dependent net metrics; không giữ stale “known” values trong bounds.

Timeline Paper → Sandbox → Canary → Live giữ segment provenance. Same actual Canary→Live path với verified compatible configuration/accounting có thể tiếp tục history, không reset vì stage label. Alpha configuration thay đổi có ý nghĩa tạo boundary hoặc cần verified equivalence; portfolio/book history vẫn liên tục khi constituent được thêm/bỏ, không xóa kết quả cũ. Cross-stage forward series chỉ nối unitized net returns khi có predeclared nonoverlapping source schedule, exact/mapped-equivalent executable version, compatible grid/cost/basis, verified transition/rebase và continuity manifest. Parallel Paper/Live chỉ chọn một source cho mỗi interval từ trước outcome; gap không được cherry-pick/backfill bằng nguồn đẹp hơn. Label `series_kind=cross_stage_forward_observation`, `economic_domain=mixed_observation` và “Forward tổng hợp xuyên stage — không phải actual track record”; thời gian actual hiển thị riêng. Mixed score ở observational facet riêng, không đưa virtual capital vào actual denominator/NAV/headline.

Regime Fit giữ exact research run/binding, prior-stage reference windows và feature/outcome availability lúc quyết định; historical matching không là forecast/probability, không sửa QBTS/band/TradeState. Missing Regime inputs chỉ làm Regime unavailable/unbound theo own dependency graph.

Archive watch là Paper-only observation của deployment thật đã được người dùng duyệt; có monitoring identity, frozen version/params/binding, virtual allocation, cadence/retention/quota, stop/pause/resume và own telemetry. Strategy có thể vẫn archived; watchlist đọc đơn thuần không sinh evidence. Provision/start/stop, disposition/Paper clone và lifecycle mutation là action riêng cần approval; read/watch job không tự tạo clone, đặt lệnh, unarchive/promote/live hoặc đổi allocator. Giữ original history, source/version lineage và authorized command receipt.

Policy đã chọn không đồng nghĩa production inputs/config đã sẵn sàng. Schema/render/fixture work có thể đi trước; thiếu approved calibration artifact trả `policy_pending`, preview tách riêng khỏi production aggregate. Final authority là `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`; không có công thức Edge/BFF/browser thay thế.

## 5 Snapshot delta và recovery đúng thứ tự commit

### 5.1 Nguyên tắc ordering

Sequence được cấp trước khi transaction commit có thể có hole hoặc đảo thứ tự commit. Không dùng `MAX(id)`, `updated_at`, timestamp wall-clock, transaction ID tự tăng hoặc ID sàn làm bằng chứng “đã thấy mọi commit trước đây”. Tình huống bắt buộc: T1 nhận ID thấp rồi treo; T2 nhận ID cao và commit; exporter không được advance past T1 rồi bỏ mất T1 khi nó commit muộn.

Phải chứng minh contract ordering hiện có trước khi reuse journal. Có hai lớp thứ tự cần gọi đúng tên:

1. **Source commit coverage:** cơ chế bảo đảm không bỏ sót mọi transaction đã commit trong scope. Có thể là commit-position được DB hỗ trợ và kiểm chứng, hoặc outbox pending có claim/ack nguyên tử không dùng moving numeric high-water để bỏ row chưa commit. Cần chỉ rõ cách giữ transaction grouping và dependencies.
2. **Published stream sequence:** thứ tự append bền vững của exporter trong một stream/generation. Nó chỉ được quảng bá là source commit order nếu thực sự có proof tương ứng. Một publisher sequencer sau commit không tự chứng minh global original DB commit order.

Baseline là reuse P16/source journal nếu đạt proof. Nếu chưa đạt, EPG10-03 phải duyệt một phương án:

- Dùng capture có commit-aware position và transaction grouping, với replication/WAL retention cost được đo, quyền DB và security được phê duyệt; hoặc
- Transactional outbox đầy đủ, committed-pending scan không mất late commit, durable export ledger, deterministic entity revisions và grouped transaction publication. Contract công bố ordering của export ledger; nếu consumer cần snapshot đúng global source-commit prefix thì bổ sung barrier/proof tương đương trước khi tuyên bố đáp ứng.

Không thêm logical replication slot, trigger, publication, index hoặc background worker lên VPS trong quá trình phân tích. Không dùng một global lock trên trading writers làm mặc định “sửa ordering” trước khi đo contention. Nếu chỉ chứng minh ordering theo partition, công bố vector cursor/partition watermarks, không tự tạo global sequence giả.

### 5.2 Snapshot bootstrap

1. Xác thực workload và scope; trả manifest chứa dataset/schema, generation, coverage, ordering guarantee và continuation capability.
2. Tạo snapshot token/barrier theo cơ chế đã được chứng minh. Nếu dùng PostgreSQL consistent snapshot, pin isolation/lifetime và vacuum impact; snapshot không được giữ transaction vô hạn chờ browser.
3. Chọn start delta cursor trước hoặc đúng barrier theo thuật toán được certify; ghi rõ overlap range. Không lấy “thời điểm request bắt đầu” làm barrier dữ liệu.
4. Export bounded pages trong stable snapshot tới durable staging trên Research. Kiểm page digest, key uniqueness, referential coverage và full-page completion.
5. Consume delta overlap với dedup/entity revision; chấp nhận replay trùng về mặt vận chuyển nhưng chỉ một business effect/read effect. Tombstone trước/giữa/sau snapshot đều phải được reconcile.
6. Catch up tới một source coverage barrier đã chứng minh, hoặc ghi `CATCHING_UP`; không gọi complete chỉ vì tạm thời queue rỗng.
7. Commit projection manifest, dataset checkpoints và active-generation pointer atomically theo consistency group. Chỉ sau commit mới publish “ready” cho BFF.
8. Giữ old projection read-only trong cửa sổ rollback đã duyệt; không merge lẫn hai generation.

Nếu snapshot hết hạn giữa page, consumer không dùng page còn lại từ snapshot mới trộn với page cũ. Resume cùng token còn valid hoặc tạo generation/staging mới. Trạng thái public là `INITIALIZING`, `CATCHING_UP`, `READY`, `STALE`, `RESYNC_REQUIRED` hoặc `FAILED` theo contract; không hiển thị dữ liệu cũ như đang realtime.

### 5.3 Delta event và checkpoint

Logical event có `event_id`, dataset, entity key/revision, operation (`UPSERT`, `TOMBSTONE`, `CORRECTION`), transaction/group reference, source position nếu hỗ trợ, published cursor, `source_continuity_epoch`, `projection_generation` nếu applicable, schema và occurred/recorded/emitted timestamps theo canonical `*_ms` và authorized scope. Financial event còn có immutable native/canonical fact identity; equal amount không phải duplicate identity.

Research transaction thực hiện cùng nhau: validate fence → dedup insert → apply event hoặc correction → update projection → record checkpoint. Chỉ ACK cursor sau transaction commit. Crash trước commit replay toàn batch; crash sau commit trước ACK cũng replay nhưng dedup no-op. Không ghi cursor trước data để “giảm lag”.

Batch giới hạn rows, bytes và time. Không chẻ một consistency group bắt buộc thành visible half-state; có thể stage chunks rồi commit group marker nếu group lớn. Error một schema event không được bỏ qua rồi advance checkpoint như đã complete. Đưa raw payload đã redact vào quarantine theo policy, đánh dấu dataset degraded và giữ replay position; dataset độc lập chỉ tiếp tục nếu manifest xác nhận không có consistency dependency.

### 5.4 Dedup correction và tombstone

- Transport dedup key gồm stream/generation/event ID hoặc canonical identity đã chốt; phải xử lý replay qua source generation reset theo entity/fact semantics, không chỉ so số cursor.
- Same event ID + same digest là replay hợp lệ. Same ID + different digest là integrity conflict, dừng affected stream và giữ evidence.
- Entity revision mới hơn áp dụng; revision cũ replay no-op; cùng revision khác payload là conflict. Không dùng timestamp mới hơn như fallback.
- Financial correction là event mới link original fact, reason và policy version. Không overwrite một fill/fee cũ mất trace; projection áp correction idempotently và đánh dấu metric restatement.
- Tombstone chỉ có nghĩa xóa/ẩn current projection trong authorized scope; financial/audit history giữ theo policy. Khi principal mất quyền, không gửi nội dung đã bị thu hồi kèm tombstone; dùng subscription invalidation hoặc purge signal đã scoped.
- Delete rồi recreate cùng display name phải có stable entity identity/revision phân biệt; không hồi sinh dữ liệu cũ vì tên giống nhau.

### 5.5 Cursor retention và resync

Retained delta window dùng để phục hồi transport. Business history là dữ liệu nghiệp vụ lâu dài và có policy riêng. Giảm retention delta không cho phép xóa fills, economic journal, capital history hoặc audit cần giữ. Mỗi dataset công bố `earliest_replay_cursor`, current cursor, generation, history coverage và gap reason.

Consumer ACK được gắn durable consumer ID, generation và checkpoint. Source retention không tin ACK từ browser. Tính retention bằng outage objective, worst-case write rate, replay rate, storage headroom và legal/business policy đã duyệt. Nếu consumer quá chậm vượt floor, trả `RESYNC_REQUIRED`; không gửi phần còn lại rồi nói complete.

Resync tạo staging generation mới, giữ previous read model stale với as-of rõ nếu policy cho phép; atomic pointer swap sau validation. History backfill chạy riêng có quota để không starve fresh deltas. Không replay command side effect khi rebuild read projection.

### 5.6 Consistency groups

Registry catalogue có thể phân trang riêng. Nhóm có ràng buộc nghiệp vụ gồm portfolio/assignment/binding versions, capital/budget/lock/recall/admission state, order/fill/obligation/economic effect và command receipt/target version. Nếu không thể publish atomically cùng một commit group, envelope phải có transaction ID/group completion marker và consumer giữ provisional view cho tới đủ group.

Một report tổng portfolio chỉ công bố `complete` khi các input dataset đủ coverage tới compatible barrier. Có thể công bố partial report có component as-of/gaps; không lấy max timestamp từ một dataset để áp cho toàn report. Cross-partition order không được đoán từ wall-clock.

### 5.7 Continuity của stream đã lọc theo quyền

Một consumer scoped có thể thấy event global1, không được phép thấy global2, rồi thấy global3. Đây không phải source loss. Không yêu cầu số global sequence trong payload phải liên tục với client, không expose hidden counts, và không resync chỉ vì hiệu hai IDs lớn hơn1.

Producer/Edge phải có authenticated coverage/scan watermark hoặc equivalent continuity proof, cùng opaque continuation token được bind vào source epoch, dataset/query, scope/policy revision và consumer identity. Watermark chứng minh vùng nguồn đã được scan đầy đủ và filter đúng mà không tiết lộ nội dung/số lượng hidden events. Nó khác `last_visible_event_id`: một khoảng chỉ có hidden events vẫn có thể tiến coverage cursor an toàn.

Consumer phát hiện **loss thực** bằng publisher continuity/integrity proof, source retention floor, batch/group digest, missing authorised event trong golden manifest hoặc declared gap, không bằng đoán raw numeric gap. Source journal gap thực phải degrade/resync affected scope ngay cả khi visible IDs tình cờ liền nhau. Hệ thống cần trusted producer attest source scanning/retention; BFF không tự tạo watermark từ số event nhận được.

Scope hoặc policy revision đổi làm cursor cũ mất hiệu lực theo contract: deny/revalidate khi quyền giảm, bootstrap/resnapshot authorized state khi scope mới cần dữ liệu trước cursor. Không tái sử dụng cursor hẹp để bỏ qua lịch sử mới được phép, cũng không replay cached rộng cho scope đã thu hồi. Nếu chỉ local projection rebuild, source epoch giữ nguyên nhưng projection generation đổi vẫn cần remap/resync BFF cursor.

**Tests bổ sung:** `EPG10-T04-06` fixture visible1/hidden2/visible3 tiến đúng cursor, không false gap và không lộ hidden count; `EPG10-T04-07` bỏ mất một visible event thật hoặc source scan proof sai thì detect gap/`RESYNC_REQUIRED`; `EPG10-T04-08` scope grant/revoke/reset invalidates old cursor đúng policy và không omit newly authorized history.

## 6 Cadence retention và áp lực tài nguyên

### 6.1 Ma trận cadence

Cadence cụ thể là cấu hình được chốt sau baseline, không là benchmark đã đo. Private ingest, risk state và report snapshot có yêu cầu khác nhau.

| Nhóm | Thu nhận authority | Export/refresh | Có thể coalesce | Retention và backpressure |
|---|---|---|---|---|
| Private venue WS orders/fills | Theo connector/event stream đã có; REST reconciliation theo policy | Export committed canonical event liên tục, batch bounded | Không drop exact financial/order state transitions cần replay | Durable outbox/journal; pressure không chặn/dừng ingest tùy tiện |
| Fees/funding/economic postings | Exact durable event theo nguồn | Near-real-time batch theo lag budget | Không coalesce làm mất event; derived summary có thể thay thế | Full policy history và corrections |
| Capital/budget/lock/recall | Transactional authority commit | Ưu tiên propagation tới command/status/risk consumer | Không drop grant/revoke/lock/recall history | Retain receipt/audit và pending lifecycle đủ recovery |
| Membership/authorization | Trusted TS revision commit | Fast invalidation path + durable event | Chỉ coalesce notification; không bỏ grant/revoke fact, current revision hoặc audit | Fail closed nếu không biết current permission; queue recheck |
| Risk/current capacity | Internal loop theo policy hiện có | Snapshot/delta theo freshness SLO đã duyệt | Chỉ coalesce replaceable display notification cùng key; giữ canonical state facts và risk enforcement | Latest state+necessary history; stale admission do TS quyết |
| Position/balance display | Authority update/reconciliation | Bounded refresh theo audience/use case | Chỉ coalesce replaceable mark/display notification; balance/position canonical facts và required sample history vẫn giữ | Current+sampled history được gắn nhãn |
| Registry/alpha/account/bindings | Theo mutation | Event-driven; periodic digest reconciliation | Coalesce notification; giữ lifecycle/temporal history và every committed fact | Full catalogue với continuation |
| Valuation/price used | Theo approved source policy | Chỉ publish giá được dùng/nguồn cần cho report | Coalesce display mark ticks; giữ valuation input thực sự được dùng để reproduce metric | Coverage/currency/freshness rõ |
| Report snapshots/charts | Research computes from committed inputs | Debounce/coalesce theo dashboard SLO | Có, giữ newest complete report per key | Rebuildable; không xóa input economic events |
| Operational health | Process/DB/network metrics | Aggregate interval phù hợp observability budget | Có với counters/histograms đúng semantics | Downsample theo policy; incident evidence được giữ |
| History backfill | Bounded pages từ published history | Low-priority paced worker | Không drop records; pause/resume được | Quota độc lập để không starve delta/commands |

Ví dụ cấu hình thảo luận, **chưa đo và chưa phê duyệt**: batch export tối đa vài trăm KiB, flush trong hàng chục đến hàng trăm ms; report snapshot coalesce ở cỡ một giây; registry fallback check ở cỡ chục giây. Không copy các khoảng này thành production default. EPG10-01/06 xác định giá trị theo event rate, network, DB/pool và freshness cần thiết.

### 6.2 Resource budget bắt buộc

Mỗi process/module phải có cấu hình upper bound và metric cho:

- Số connection DB, statement timeout, transaction timeout, pending queries và maximum result bytes.
- Active HTTP requests, per-principal/per-scope concurrency, request/response body bytes, response timeout.
- Queue entries **và bytes**, maximum event bytes, in-flight batch bytes, retry backlog và durable spool storage.
- Snapshot sessions/pages, bootstrap jobs, history backfills và per-dataset quota.
- Stream connections, subscriptions per connection, fanout queue bytes per client, global fanout bytes và slow-client cutoff.
- Memory cache bytes, TTL/invalidation, negative-cache scope, decompressed payload bytes và compression CPU budget.
- Retry attempts/time window, jitter bounds, circuit-breaker state và recovery probes.

Đặt bound không bằng drop financial event. Khi RAM queue đầy, hãm fetch, trả overload có retry hint, ghi durable queue nếu design cho phép và giảm low-priority reads; source facts tiếp tục giữ đúng policy. Khi durable storage gần hết, alert và dừng feature export/backfill trước khi data loss; hành vi cuối cùng phải được authority owner duyệt và thử. Không cho journal retention xóa phần chưa export chỉ để service trông healthy.

### 6.3 Query và IO

Không chạy full-table count/aggregation trên trading DB cho mỗi refresh. Dùng covered/keyset reads, predicate scope và narrow columns; thay đổi index chỉ sau plan evidence. Những query plans có `EXPLAIN ANALYZE` thực sự chạy query phải nằm trong môi trường được phép và có workload budget; không tự chạy trên VPS trong phase đọc.

Cache snapshot theo dataset/scope/filter/schema/generation; single-flight một expensive request, không global cache không phân quyền. Cache authorized result phải gắn effective authorization revision; negative cache cũng scoped. Fanout một source delta tới nhiều clients ở Research, không một poll TS cho mỗi tab.

Tối ưu serialize/copy sau đo profiler: hạn chế JSON parse/serialize nhiều vòng, tránh clone whole catalogue, page streaming có bounded buffers, compression sau đo CPU/bytes. Rust async task không được gọi blocking DB/file/compression unbounded trên runtime worker; dùng bounded blocking pool khi cần. SQLx pool sizing phải tính tổng process/replica và DB connection headroom, không đặt cùng maximum cho mọi module.

Đo WAL/DB growth, index bloat, vacuum impact, disk latency, fsync, network bytes và query calls cùng CPU/RSS. Chuyển read load sang Research nhưng làm TS WAL/IO tăng mạnh không phải một cải thiện mặc định.

### 6.4 Retry reconnect và degraded mode

Retry transient read/network với exponential backoff + full jitter, capped concurrency và Retry-After nếu có. Auth denied, schema incompatible, integrity conflict và invalid cursor không blind retry. Retry command dùng cùng idempotency key và canonical payload; xem mục 7.

Sau restart, consumer đọc durable checkpoint/generation trước subscribe. Browser reconnect gửi last seen projection cursor chỉ để replay read events trong scope còn valid; BFF kiểm authorization mới trước phát lại. Token hết hạn/scope thu hồi thì ngừng stream; không tiếp tục vì socket đã mở từ trước.

Slow client bị ngắt bằng resumable reason/cursor hoặc cần refetch snapshot; không giữ unlimited queue. Có thể coalesce report notifications khi vẫn giữ exact server history. Không dùng silent drop exact events với consumer đang tưởng mình nhận đầy đủ.

### 6.5 Tối ưu incremental và loại bỏ fanout ngược về TS

**Producer transaction:** reuse minimal journal/outbox entry cùng domain transaction, chỉ ghi canonical IDs/versions/payload hoặc reference đủ reproduce theo contract. Không compute score, rolling history, percentile, correlation hoặc dashboard JSON trong transaction này. Publish committed batches bằng durable cursor; tránh mỗi reader query full current state rồi diff trong RAM. Đo write amplification của cách lưu payload/reference trước chốt vì thêm outbox cũng có CPU/WAL cost.

**Wake và fallback:** dùng existing commit-notify/push mechanism nếu scope và durability đã chứng minh; notification chỉ là wake hint, cursor/journal mới là truth. Khi hint mất hoặc restart, một bounded poller per source/dataset-group kiểm durable cursor với backoff/jitter. Browser refresh/subscription không tạo source poller mới. Không thêm DB notification/slot/trigger lên VPS nếu chưa có approval. Nếu nguồn chỉ hỗ trợ polling, dùng shared incremental poller, không per-browser/full-history polling.

**Batch và read side:** fetch bounded columns/rows/bytes; commit projection theo bounded batch/consistency group và acknowledge sau commit. Cache deserialized immutable envelope hoặc prepared statements chỉ khi profiler chứng minh lợi ích và byte cap đã chốt. Update affected aggregate/window theo event; correction tìm affected windows qua lineage index. Không chạy lại mọi alpha/portfolio khi chỉ một mark đổi; full recompute có queue riêng và checkpoint để pause/resume.

**Cache/fanout:** single-flight key gồm effective scope + authorization revision + filter/schema + generation + metric policy/source-set/window. Shared cache chỉ reuse giữa principal thật sự có equivalent permitted view; không dùng role name chung để suy equivalence. TTL, maximum entries/bytes và error-negative TTL đều bounded; revoke/correction/generation/policy change invalidate ngay theo contract. Notification debounce/coalesce key-level “newer revision available” hợp lệ; canonical financial facts và ledger transitions không bao giờ drop/coalesce.

**History/charts:** query keyset bằng index phù hợp scope/entity/time/version, chọn columns cần thiết, giới hạn page bytes và cancel khi client bỏ request. Plan evidence phải thể hiện scans/buffers/sort spill/lock wait ở cardinality thực. Research server có thể tạo time-bucket/min-max decimation để render chart; response mang method/bucket/sample coverage, giữ exact raw continuation. Không dùng downsampled chart points để tính score, drawdown, return hoặc chứng nhận không có spike. Không fetch nhiều năm raw history về browser cho một chart nhỏ, cũng không cắt history rồi đánh dấu complete.

### 6.6 Hard ceilings và hành vi khi chạm ngưỡng

Ceilings dưới đây là **configuration contract đề xuất, chưa đo/chưa phê duyệt**. Không có con số CPU/RAM dùng chung an toàn cho mọi VPS. EPG10-01 phải điền numeric limits và measurement window; EPG10-06 phải chứng minh enforcement. Giá trị chưa chốt là BLOCKED cho deployment mới, không unlimited. Existing page bound 200 rows/1 MiB của SM-10 chỉ giữ cho compatibility route đó, không tự dùng làm toàn bộ stream capacity.

| Boundary | Ceilings phải ghi trong approved config | Hành vi bắt buộc và evidence |
|---|---|---|
| Producer trên TS/DL host | CPU quota/share/reserve; RSS/working-set soft/high/hard; max tasks/threads; serialization/compression workers | High watermark hãm export/backfill trước hard limit; TS/DL reserve được bảo toàn; no OOM-induced lost source facts |
| Source DB | Tổng pool connections qua all replicas; acquire/statement/transaction timeout; max outstanding queries; page/result bytes | Pool không tăng theo dashboards; reject/throttle low-priority work; producer không giữ long tx khi network chậm |
| Source transport | In-flight request count; compressed/decompressed bytes; batch rows/bytes/time; max event bytes | Oversize explicit error/retrieval contract; staged consistency group; không silently omit record |
| Durable backlog | RAM queue entries/bytes; disk high/hard watermark; retention floor/outage runway | Pause fetching, preserve cursor/facts; bounded spool chỉ khi có design; alert trước exhausting disk |
| Research projector | Concurrent commit batches; pool and writer lock time; memory/event buffers | Single fenced writer per group; backpressure nguồn; independent groups tiếp tục chỉ khi dependency proof |
| History và analytics | Concurrent jobs; rows/bytes/time per query; working set; spill disk; max queued jobs; Archive watch quota | Cancel/pause/background low priority; incremental resume; không kéo SQL/compute ngược sang TS |
| BFF/cache/fanout | Total/cache bytes; TTL; per-client/global queues; subscribers; request deadline | Slow client disconnect/resume; no head-of-line blocking cho peers; current authorization check |
| Browser payload | Page response bytes; chart point/display budget; virtualized rows; export continuation | Thể hiện pagination/decimation/gaps; không fake full history hoặc recompute canonical score |

Sizing worksheet dùng observed rates/bytes, không dùng chỉ “event count”: `backlog_bytes ≈ peak_committed_bytes_per_second × approved_outage_seconds × measured_storage_amplification + safety_reserve`; `catchup_seconds ≈ backlog_events / (sustainable_replay_events_per_second − concurrent_producer_events_per_second)` chỉ hợp lệ khi denominator dương. RAM budget cộng queue caps + in-flight batch copies + parsed/decompressed buffers + cache + pool/task/runtime overhead; đo peak thực vì công thức chưa bao gồm allocator fragmentation. Tách TS producer budget khỏi total host TS+DL reserve và Research reserve.

Initial conservative implementation hypothesis có thể là một source consumer per certified stream/group, một bounded backfill job và minimal separate DB pools; số workers/connections chỉ tăng sau profiler và paired benchmark. Đây là điểm bắt đầu sizing, không phải production default hoặc proof throughput. CPU pinning/cgroup/memory limit/network/DB config changes phải có target approval; không thay config từ tài liệu này.

### 6.7 Isolation và ưu tiên công việc

Admission order đề xuất: TS trading/recovery obligations theo authority trước; auth revocation/command status và live committed delta theo own budgets; bootstrap; history export; report/scoring/correlation/Archive recompute sau. Không biến thứ tự này thành shared unbounded priority queue hoặc làm starvation: mỗi group có fair bounded quota và maximum age alarm. Command execution vẫn qua TS admission, không được ưu tiên vượt risk checks.

Slow Research consumer chỉ làm riêng stream/group backpressure hoặc resync theo contract. Slow browser chỉ làm queue của browser đó đầy rồi disconnect/resume; không giữ exporter/DB transaction hoặc ngăn các browser khác. Retry storm bị chặn bởi circuit breaker, jitter và global retry budget. Cache stampede sau revoke/reset/restart được single-flight và paced warm-up khống chế. Restart producer/projector phải đọc durable checkpoint, không hydrate toàn bộ history vào RAM.

### 6.8 Archive paper monitoring có chi phí hữu hạn

Mỗi watch có `watch_policy_version`, run/binding, explicit scope, allowed cadence, stop/pause conditions, retention class, next due time, oldest unprocessed input và resource budget. Scheduler gộp work theo market source/window thay vì scan từng alpha toàn bộ; input được dùng lại chỉ trong compatible source-set/feature-version. Limit concurrent watched runs và pending work là admission limit có visible WAITING/PAUSED reason, không cắt mất archived catalogue.

Cadence/retention/concurrency do Bobby duyệt sau sizing; không tự chạy liên tục mọi archived alpha. Chỉ Research workers xử lý paper observation/re-score, không tiêu thụ dedicated TS execution slot hoặc reserve real capital. Market data/history chưa available thì publish PARTIAL/UNAVAILABLE và gap, không fabricate backfill. Full archived history giữ theo approved dataset policy; watch retention khác economic/audit history retention.

## 7 Command relay và business authorization

### 7.1 Giữ nguyên contract của PM v1.1

Capital command payload giữ nguyên `schema_version = pma.capital-command.v1.1` theo mục 7.4 PM v1.1. Edge transport có thể thêm outer envelope gồm request/trace ID, verified human principal, workload identity, received time và relay metadata. Không đổi tên schema, tự chuyển operation, amount, currency hoặc expected versions; không tự diễn giải app role thành PM capability.

Capital payload gồm operation, idempotency key, canonical payload digest, target root/portfolio/recipient, currency hoặc supported collateral policy, decimal-string amount/target budget theo operation, expected versions, reason/source reference/effective time và approver receipt khi policy yêu cầu. `SET_ROOT_LIMIT` dùng target root limit riêng; không biến thành money transfer. TS tự kiểm pool/fencing versions.

Capital response giữ command ID, operation, target, business state, requested/applied/pending/cancelled/rejected amounts, current versions, before/after receipt, source/policy/binding refs, blockers và `physical_transfer_performed=false`. Relay không làm mất các trường này để chỉ trả “success”.

### 7.2 Trusted actor chain

Human actor xác minh từ session/token có issuer, subject, audience, signature và expiry đúng trust agreement. Workload actor xác minh riêng qua service auth đã được duyệt. Browser body `user_id`, `owner`, `role` hoặc caller-supplied header không đủ thẩm quyền. Edge chỉ tin delegated actor assertion từ trusted issuer và audience đúng; TS vẫn kiểm mapping, current membership, scoped capability và authorization revision.

Bobby là protected owner theo policy đã chốt. **Read product policy mới:** Bobby và Stan được xem toàn bộ business information của Execution Loop, gồm catalogue, portfolio/account/alpha/history và metrics khi đã available/certified. Đây không cấp quyền đọc secrets/credentials hoặc technical maintenance access. Runtime phải resolve verified issuer+subject sang approved business-read grant; không hard-code display name hoặc tự coi policy trong tài liệu là grant đã deployed.

Stan vẫn có các manager-admin actions đúng explicit grant/authority hiện có, không tự nâng quyền hoặc sửa protected owner. Full business-read scope không tự cấp command, capital, live, role-administration hoặc repo/VPS mutation authority. TS vẫn kiểm current capability/scope tại commit theo từng command.

**Thanhvuong:** eligible portfolio được xác định bằng relation đã chứng minh từ alpha_id tới verified user ID Thanhvuong, kèm temporal membership/binding khi applicable. “Mức vừa phải” chưa là complete field policy. Đề xuất fail-closed trong khi chờ duyệt: expose minimum portfolio identity/context và own-alpha slice cần thiết; moderate metrics chỉ từ authorized inputs. Không mặc định expose whole-portfolio holdings, other users/alpha details, capital amounts hoặc aggregate có thể suy ngược hidden members. Bobby cần duyệt exact field/metric allowlist và aggregate disclosure policy; rồi khóa version trong schema/ACL fixtures. Không dùng string match display name hoặc tên alpha làm entitlement.

Detailed Profile UI nằm ở guide Portal và manager UX companion. Edge/Research phải filter discovery, query, cache, metric source set và fanout theo cùng verified read policy, trả safe OUT_OF_SCOPE không leak hidden existence/count; broader read không là business-mutation authority.

Human request và autonomous workload request không thay thế nhau. Workload phải có explicit scope/capabilities; không gắn owner human giả để vượt policy. Audit lưu actual actors, delegation chain, auth revision và authority decision; không lưu bearer token hay secret.

### 7.3 Flow một command

1. BFF validate input shape và xác định target scope/version từ view hiện có; dry-run chỉ informational.
2. Relay persist local transport correlation nếu cần, forward original payload với cùng idempotency key và digest.
3. TS xác thực workload/human, resolve current business authority và target. Recheck schema, idempotency conflict, expected versions, binding/profile/mode, capacity và policy.
4. Authority handler kiểm authorization/revocation **tại commit boundary** với fencing/locking đúng; permission không chỉ được kiểm lúc enqueue.
5. Domain effects và durable command receipt commit theo transaction contract. Nếu effect qua external execution là bất đồng bộ, receipt thể hiện stage/unknown obligation đúng; không giả all-or-nothing với sàn.
6. Reply accepted/receipt, sau đó sync terminal outcome qua query/stream và authoritative events. Authoritative TS receipt có business state APPLIED cho phép UI xác nhận command APPLIED ngay trong đúng semantics của operation. Nếu read projection chưa match target version/command lineage, balance/portfolio view vẫn CATCHING_UP với as-of riêng tới khi reconcile; không chờ projection để đổi receipt APPLIED, không gửi command lại chỉ vì projection lag. APPLIED của một command không tự chứng minh venue order đã filled hoặc position đã flat; execution/fill/obligation lifecycle vẫn theo canonical venue/TS facts riêng.
7. Audit human/workload/action/target/result cùng trace; command payload chứa sensitive reason phải redact theo policy mà vẫn giữ digest/correlation.

Research không được kết nối DSN ghi trading tables, tạo journal posting riêng để “sửa” receipt, gọi sàn trực tiếp hoặc vượt gateway/risk/admission đã được certify. Approval cho relay deployment không bao gồm live action.

### 7.4 Accepted terminal và outcome unknown

Transport states đề xuất tách khỏi PM business state:

| Relay state | Ý nghĩa | Hành động hợp lệ |
|---|---|---|
| `NOT_SENT` | Chưa gửi tới authority | Có thể cancel local request nếu chắc chưa gửi |
| `SENT_OUTCOME_UNKNOWN` | Có thể TS đã nhận/commit, response mất | Query receipt theo same scoped idempotency key/command ID; không tạo key mới |
| `ACCEPTED` | Authority lưu nhận command, chưa chứng minh applied | Theo dõi durable outcome, không cộng vốn vào UI |
| `TERMINAL` | Có authoritative terminal disposition | Hiển thị PM business state/amounts đúng receipt |
| `REJECTED_BEFORE_ACCEPT` | Có definitive rejection và no-effect proof | Sửa request nếu được phép; request mới dùng semantics mới rõ |

PM states giữ nguyên `REJECTED`, `APPLIED`, `PARTIALLY_APPLIED`, `WAITING_ENCUMBRANCE`, `CANCELLED`, `PARTIALLY_APPLIED_CANCELLED`. Có pending thì chưa coi lifecycle kết thúc. Capital invariant là requested = applied + pending + cancelled + rejected; applied không giảm do retry hoặc cancel pending.

Không tìm thấy receipt ngay sau timeout chưa chắc no effect: handler/query replica có thể lag hoặc command chưa commit. Query authority route đáng tin, giữ unknown window và alert/runbook. Retry chỉ cùng key/digest trong retention được đảm bảo; nếu source idempotency retention đã hết và outcome chưa rõ, dừng để reconcile, không tự gửi mới.

Idempotency scope gồm authority, operation family và target/tenant/environment theo contract đã chốt; cross-mode/venue không collide. Same key same canonical payload trả original receipt; same key different payload là `IDEMPOTENCY_CONFLICT`. Digest phải định nghĩa canonical decimal, field omission/null, object key order và schema version; không hash raw JSON tùy whitespace.

### 7.5 Revocation và cache queues

- Portal session/app grant revoke chặn truy cập app theo policy; TS business membership revoke chặn business command theo current TS authority. Cần contract propagation hai chiều rõ, không gộp thành một flag.
- TS authority revision tăng atomically khi scope/capability thay đổi. Queued command mang observed revision nhưng authority không tin nó là current.
- Thu hồi invalidate BFF caches, server subscriptions và replay permission; active socket phải revalidate hoặc bị đóng. Hạn mức revocation latency được duyệt và đo ở EPG10-08.
- Queued/pending command chưa commit phải recheck current authorization. Đối với pending financial lifecycle đã được chấp nhận, policy xác định actor/service nào được tiếp tục an toàn; không để revoke làm mất recovery facts hoặc tự hủy applied amount.
- Authority unreachable hoặc revision không xác minh được: fail closed với new mutation. Read có thể phục vụ stale authorized projection chỉ trong policy rõ, không vượt scope đã revoke đã biết.
- Không dùng TTL dài làm bảo đảm revoke. Invalidation loss phải có bounded revalidation/circuit-breaker và test cụ thể.

### 7.6 Command coverage và activation

Chia command theo authority hiện có: lifecycle alpha/account/deployment, assignment/binding, capital/budget/lock/recall, halt/reducing/resume/archive, và nếu được phê duyệt riêng thì execution command. Mỗi operation có schema, permission, expected versions, effect boundary, unknown-outcome recovery và test fixture riêng. Operation chưa có authority implementation trả unavailable; không fallback SQL mutation.

Nghiệm thu component/read/relay dùng local deterministic và Demo E2E theo operation được phép. **G1 actual OKX Demo bắt buộc khi thay đổi chạm đường TS trading-flow cần certification**: generic sandbox hoặc mock không thay actual approved OKX Demo fixture/receipt. Chỉ làm tài liệu/read-only không tác động trading-flow thì không kéo G1 vào một gate ngoài phạm vi; declaration NOT_APPLICABLE phải có impact evidence. Admin command local fixtures vẫn cần real DB/concurrency khi invariant đòi hỏi.

P19 G2 mainnet canary chỉ mở khi Bobby yêu cầu rõ và phê duyệt scope live cụ thể. P184 G2 là capacity/performance gate riêng với 500 ms theo đúng P184 receipt; không được gọi optional và không dùng thay P19 live approval. Một route chỉ đọc chịu P184 non-regression khi nó cùng workload/host hoặc ảnh hưởng TS critical path; pure offline schema work có thể NOT_APPLICABLE với impact evidence. Thiếu production key/funds không chặn base release đã giới hạn read/Demo; không dùng việc “hoàn tất guide” làm lý do bật live. G1 thiếu target/permission giữ BLOCKED cho affected TS trading-flow release, không đổi thành P19 G2 hoặc generic mock để qua gate.

## 8 Security observability và chất lượng số liệu

### 8.1 Transport và secret boundary

Xác minh chain, hostname/SNI, expiry và trust store trên từng hop TS↔Edge↔Research. Dùng Rustls cấu hình đã verify trong source; không bật insecure verification, skip certificate hoặc tùy chọn tương đương để vượt test. Certificate rotation phải test new/old trust overlap có kiểm soát, reconnect và rollback trong quyền được duyệt. Nếu mTLS/service token hiện tại chưa rõ, chốt trust contract và permission trước cấu hình; không tự tạo credential hoặc mở firewall.

Chỉ expose read/command routes cần thiết trên interface/network đã duyệt. CORS không là auth boundary. Browser không có direct TS privileged route, DB DSN hoặc native venue key. Rate limit theo workload/principal/scope và global host budget; chống compression bomb/oversized JSON, deeply nested input, invalid decimals, path/ID injection và cache poisoning.

Service auth credential/CA private key không nằm trong response, log, metric label, fixture, evidence package hoặc frontend bundle. Audit chỉ giữ reference và redacted claim fingerprint. Error phải tách safe public reason khỏi internal diagnostic. Không xuất host private path hoặc stack trace có secret cho UI.

### 8.2 Health phải phản ánh đúng khả năng phục vụ

- **Liveness:** process/event loop còn tiến triển, không phụ thuộc tất cả downstream để tránh restart cascade.
- **Read readiness:** schema compatible, projection generation active, checkpoint usable, source freshness/completeness đáp ứng mode; stale-read policy được công bố riêng.
- **Command readiness:** authority route/trust/authorization verification khả dụng, durable receipt path hoạt động, supported operation enabled; không suy từ read ready.
- **Sync readiness:** source cursor hợp lệ, queue/storage trong budget, không gap hoặc integrity conflict chưa xử lý.
- **Dependency status:** TLS/auth/schema/source/DB/network state có reason, observed time và last success; không trả healthy chỉ vì page pack cached.

Một endpoint health có thể tổng hợp nhưng phải giữ component states; tránh một boolean xóa mất lý do. Stale data không đổi timestamp để làm health xanh.

### 8.3 Metrics tối thiểu

| Nhóm | Đo tại đâu | Số đo và cách sử dụng |
|---|---|---|
| Source/export | TS boundary | Committed/published/ACK positions, publish lag, batch bytes, pending rows+bytes, oldest unexported age |
| Correctness | Cả hai | Duplicate no-op, same-ID digest conflict, stale revision, gap/tombstone/correction counts, resync reasons |
| Query | TS/Research DB | Query calls, latency percentiles, rows scanned/returned, buffers/IO, lock wait, pool wait, timeout/cancel |
| Compute | Mỗi process/host | CPU time/rate, RSS/working set, heap peak, task/thread count, scheduler lag, CPU steal nếu có |
| Storage/network | Mỗi host/hop | Read/write bytes, fsync/WAL growth, disk queue latency, network bytes/retries, durable backlog capacity |
| Consumer | Research | Durable checkpoint, projection commit latency, bootstrap progress, backfill lag, active generation |
| BFF/fanout | Research/Portal | Query p50/p95/p99, cache hit/byte size, SWR/coalesced refresh, single-flight waits, active/slow clients, queued bytes |
| Manager refresh | Research/BFF + source boundary | Calls/rows/bytes per relation/profile, full-refresh duration, max-page exhaustion, DB deleted/inserted/upserted rows, WAL, cache age, source/projector lag; theoretical bound tách actual measurements |
| Commands | BFF/TS | Accepted→terminal time, unknown-outcome age, idempotency replay/conflict, auth/version rejection, queue rechecks |
| Authorization | Cả hai | Revoke commit→invalidation/denial latency, stale revision attempts, unauthorized subscriptions blocked |
| Data quality | Research | Dataset freshness/completeness, history gaps, reconciliation breaks, provisional/finalized report counts |

Metric names và label cardinality được review. Không dùng user ID, order ID, event ID hoặc command ID làm unbounded Prometheus labels. Correlate qua structured logs/traces có retention/redaction, không log full hot-path payload. Sampling observability không được sampling business journal.

### 8.4 Cashflow và metric lineage

Economic FUND/RETURN_CAPITAL là cashflow classification; budget grant/decrease/recall/lock là quyền sử dụng vốn. Native transfer là thao tác khác và không phát sinh từ capital commands v1.1. Report không tính top-up thành PnL hoặc budget recall thành realized loss; không cộng allocated budget vào equity.

Giữ event-time và recorded-time để late fees/funding/corrections tạo restated report có version. Nếu tính return có external cashflow, chốt metric definition và flow timing; không lấy equity growth thô để gọi strategy return. Advanced return/drawdown/Sharpe chưa certify giữ DISABLED hoặc availability UNAVAILABLE, không chặn core release; khi metric được quảng bá thì cashflow-only oracle là hard gate. USD và USDT không quy đổi 1:1 ngầm. Multi-currency report có valuation source/time/policy hoặc trả unsupported/partial.

Temporal attribution theo portfolio/deployment/account/alpha-owner/binding tại hiệu lực event; owner hiện tại không rewrite performance quá khứ. Join một fill với nhiều labels/assignments không được nhân đôi amount. Report snapshot lưu input dataset/generation/checkpoints, metric version, as-of và completeness để reproduce.

### 8.5 Một nơi tính canonical metrics

Producer chỉ xuất canonical facts tối thiểu: reconciled NAV/equity valuations, external/internal flows, realized/unrealized PnL, required fees/funding/borrow/rebates, deduped executed notional/instrument/FX facts, allocated economic capital và ownership partition, lifecycle/TradeState, source revisions/watermarks. Market/benchmark/features dùng nguồn đã được duyệt ở read side; không buộc TS trading loop tính history analytics. Gap/missing không được biến thành zero; gross notional=0 chỉ khi đã xác minh không có fills.

Shared Research calculation module là formula authority duy nhất: `qbts_prb_v1_1`, F=`0.45P+0.30R+0.25B`; P=`0.70*N_T(net_excess_TWR)+0.30*N_SR(SR_period)`; R=`0.60*N_MDD^-(MDD)+0.40*N_ADD^-(ADD)`; B=`0.50*(100*p_positive_blocks)+0.50*N_T(stress_excess_TWR)`. Six atomic weights là .315/.135/.180/.120/.125/.125. Cùng comparison profile dùng frozen linear-clip anchors cho alpha/portfolio; stress và baseline excess TWR dùng cùng anchors. P/R/B, normalized/raw inputs, contribution points và total giữ canonical precision trước UI rounding.

Bands `quality_bands_v1_1`: `[0,40)` weak/Yếu, `[40,60)` neutral/Trung tính, `[60,75)` fair/Khá, `[75,90)` good/Tốt, `[90,100]` very_good/Rất tốt. Null không có band; contribution/bounds/HHI không nhận quality band. Provisional numeric nhận band kèm “Sơ bộ”, không statistical validation hoặc quyền Live. Không thêm HHI/lambda, confidence discount, regime multiplier hoặc thay weights để lấp missing input.

Economic calculations reuse ledger/return kernels đã có sau metric-parity proof, không dựng financial authority thứ hai. Net excess TWR là `TWR_net−TWR_cash`, không compound arithmetic excess; SR không annualize input; ADD tính mọi observations gồm DD=0, không thêm E0 vào sample. Exact TWR cần valuation quanh flows; approximation chỉ khi có named approved method. N<2/std=0, K=0, missing completed block hoặc required path gaps → affected component unavailable, full F null/partial; incomplete tail loại theo predeclared block manifest. Math-complete short evidence → provisional, không bắt đợi history dài mới có score.

Raw QBTS giữ sizing/leverage/cash/cost của deployment. Allocation composition dùng verified economic allocation; direct PortfolioScore dùng own path và manager dùng unique consolidated path, không mean child scores. PortfolioScore không phụ thuộc q coverage/grouping/correlation/Research binding nếu own required economic inputs hợp lệ. Grouping update chỉ invalidate grouping diagnostics, không đổi direct score. Score/Regime faults không chặn authorized close/reduce-risk.

Rolling exact MDD/ADD phải rebuild peak từ E0 của từng window, hoặc dùng thuật toán incremental có proof tương đương. Khi peak cũ rời window, không chỉ trừ DD cũ/cộng DD mới; MVP bounded O(n) recompute theo affected window là phương án dễ kiểm. Kiểm mọi intermediate factors/equity/moments/stress/serialization đều finite và wealth factors/equity phải dương, không chỉ finite inputs; overflow/underflow không được thành điểm 0/100 hợp lệ. Named tolerance/quantization nằm trong config, không thêm epsilon tự ý sửa zero-variance semantics.

BFF chỉ đọc snapshots/cache và authorize trước join/serialize; bounded composition worker có thể nằm cùng service nhưng phải gọi cùng shared module, không chép formula vào controller. Browser chỉ format/sort/render. Bounded incremental jobs theo affected subject/window/revision, no heavy compute trên TS hoặc synchronous dashboard request.

### 8.6 Proof cho metric registry và score inputs

EPG10-00/02 phải tạo source-field mapping với trạng thái `verified`, `gap` hoặc `not_applicable` cho từng atomic metric; tên field tương tự không chứng minh cùng nghĩa. Registry/manifest phải khóa các chứng cứ sau trước numeric production release:

| Proof | Nội dung bắt buộc | Hành vi khi thiếu |
|---|---|---|
| NAV/flow grid | Opening/closing valuations quanh external flow; timing/FX; sleeve transfer external nhưng manager internal; positive capital; unitized path/grid coverage | Exact TWR chưa chứng minh → unavailable hoặc approved named approximation; không dùng raw NAV growth |
| Baseline net costs | Required cost set theo venue/product; fill-price slippage đã phản ánh, fee/rebate/funding/borrow applicability và revision | partial_costs; invalidate mọi dependent net metrics, không double-subtract slippage |
| Executed notional | Canonical fill-side identity, economic scope dedupe, instrument-specific notional/FX; zero-fill proof; split-sleeve receipts không nhân notional manager | Missing turnover làm stress component unavailable; transfers không là fills |
| Stress normalization | Cash-flow-free subperiod j: deltaC=delta_bps/10000*G_j; stress return=r_net−deltaC/V_start_plus; baseline opening capital, sau đó compound đúng observation grid | Không gộp monthly turnover/chia end capital; invalid 1+r_stress<=0 báo INVALID_STRESS_PATH, không compound đổi dấu |
| Watermarks | Own valuation/fees/funding/borrow/FX/cash-reference/turnover reconciliation cutoffs; required-input minimum compatible sealed cutoff; expected/received counts/gap reasons | Không lấy emission time hoặc fastest feed làm score as_of; gap invalidates đúng dependency |
| Normalization/config | Formula approved riêng runtime artifact; profile/window-specific L/U, same net/stress TWR anchors, block/origin, delta, maturity/freshness, precision/hash/approval/cutoff | policy_pending khi config chưa approved; fixture numbers không lấp production config |
| Economic ownership | Dedupe account/book/sleeve; explicit capital partition và internal-transfer elimination; archived exposure vẫn trong scope | Không cộng virtual NAV hoặc double-count physical account; allocation coverage NAV chỉ khi current-NAV partition proven |
| Continuity/replay | Predeclared source schedule, available-at/binding/config equivalence, nonoverlap, handoff/rebase, gap handling, original/restated revisions | Giữ segment cards; không nối invalid path, future facts hoặc mixed observation vào actual history |

Stress là fixed-path normalized-return sensitivity, không execution simulator: giữ observed fills/sizing path; delta cost chỉ incremental, không giả feedback tới liquidation/impact/order sizing. Bắt buộc chứng minh `TWR_stress_excess <= TWR_excess`, normalized stress không cao hơn normalized baseline trên cùng anchors; delta tăng không làm stress component/total tăng khi các inputs khác giữ nguyên. Missing stress chỉ thiếu atomic weight .125; bounds giữ known valid atoms và không đổi weights. Baseline cost gap khác stress-only gap vì dependency rộng hơn.

Một snapshot có `approved_policy_id`, source-set/watermark, subject binding và consolidation manifest khi áp dụng, cùng precision contract đầy đủ mới đủ điều kiện numeric available/provisional. Source defaults hoặc numerical fixture không là production calibration. Same input-set/profile/window/revision phải replay đúng; late fees/FX/turnover correction append revision và invalidate affected windows, giữ original_as_published. ACL phải chặn manager totals/denominators/hidden contributions trong API/export/cache của researcher, không chỉ ẩn ở UI.

## 9 Baseline và ngân sách nghiệm thu

### 9.1 Manifest cho một lần đo

Ghi TS/Edge/Portal full SHA và dirty diff digest; binary/container digest nếu có; applied schema/index inventory được phép; DB/OS/runtime/driver versions; host CPU/RAM/disk/network; pool/concurrency/feature config không có secrets; fixture seed và dataset cardinalities; retained history span; event rates và burst shape; client count/dashboard behavior; warm/cold cache; thời điểm UTC, sampling method và repeat protocol.

Không chọn chỉ một workload nhàn nhất để tuyên bố tối ưu. Thực hiện paired baseline/new trên cùng inputs và resource allocation, randomize hoặc kiểm soát order để tránh cache bias. Phân biệt container metric, process metric và host metric. Có confidence/variation report; số lần lặp và thời lượng phải đủ để thấy steady state, peak và recovery theo workload đã duyệt, không tự đặt một con số đẹp.

### 9.2 Workload matrix

| Workload ID | Tình huống | Fixture và invariant | Chi phí phải thu |
|---|---|---|---|
| W-IDLE | Không có business mutation; một health consumer | Catalogue vẫn accessible; không busy loop | Idle CPU/RSS, polling/query calls, network keepalive |
| W-NORMAL | Event mix đại diện orders/fills/balances/registry | Same exact final projection và trading behavior | CPU/RSS, query/IO, freshness, command/read latency |
| W-BURST | Burst events + bounded command/status traffic | Không mất exact facts, queue bounded và drain được | Peak memory, oldest backlog age, pool/lock wait, recovery time |
| W-DASH | N dashboard tabs/users, filters và repeated reconnect | Scope isolation; không N lần source full scan | TS vs Research QPS, cache hit, fanout bytes, slow-client cost |
| W-OUTAGE | TS↔Research disconnect, consumer restart, lost ACK | Durable recovery với same digest cuối | Journal/spool growth, replay cost, trading impact, catch-up lag |
| W-RESYNC | Cursor expired, bootstrap toàn catalogue và history backfill | New generation complete; live delta không starvation | TS scan/query/IO, Research peak RSS/disk, time-to-ready |
| W-REVOKE | Revoke giữa active stream/queued command | No unauthorized read/commit sau contract boundary | Propagation latency và fail-closed behavior |
| W-CORRECT | Late fee/funding/correction, reassignment và same-ID replay | Exact accounting/report restatement không duplicate | Recompute/query cost và completeness recovery |
| W-COEXIST-6K | Original pinned 6k×2 P184 fixture với TS + DL và Edge producer; Research consumers hoạt động | Giữ semantics 6k×2 của original harness, không tự gọi là TPS; full baseline/candidate invariants | Per-process và host CPU/RSS/DB/WAL/IO, P184 latency distribution, queue/recovery |
| W-COEXIST-9K | Original pinned 9k×2 P184 fixture, normal rồi overload/recovery hợp lệ | P184 performance gate và correctness giữ nguyên; không lấy B6 PASS làm candidate PASS | Resource headroom, p95/p99/max theo gate, backlog/drain, DL lag/errors |
| W-ANALYTICS | Many alpha/portfolio histories, score/regime/correlation + Archive jobs trên Research | Same exact metric oracle, bounded jobs, unaffected fresh projection | Query/compute/cache/spill, per-job cost, stale-age và fair scheduling |
| W-CACHE-RESET | Cold start, invalidation/revoke/reset đồng thời nhiều browser | Không stampede TS hoặc leak old scope; no false complete | Source QPS, single-flight count/wait, fanout queue bytes, time to valid view |

N, event rates, history size và outage duration được lấy từ baseline/capacity target đã duyệt. Fixture có thể scale nhiều mức, gồm full expected catalogue; không giảm cardinality chỉ để qua gate.

### 9.3 Budget register

Bobby/owner triển khai duyệt bảng trước tối ưu và trước mở scope; để `UNDECIDED` nghĩa là gate chưa đạt, không phải unlimited.

| Budget ID | Chỉ số | Cách quyết định và điều kiện đạt |
|---|---|---|
| B-TS-CPU | CPU idle/steady/burst trên TS | Baseline value + permitted absolute/relative delta; chọn reduction target có căn cứ |
| B-TS-RAM | RSS steady/peak và memory growth sau cycles | Không vượt safe headroom; không tăng theo uptime/total catalogue ngoài design bounded state |
| B-TS-DB | Query calls, time, scans, pool/lock wait | Dashboard scaling không tạo source work tuyến tính không cần thiết; bound được phê duyệt |
| B-TS-IO | Disk/WAL/network bytes và latency | Tính cả journal amplification; không đánh đổi IO critical path ngoài budget |
| B-TRADE | Trading/admission latency/error | Non-regression envelope riêng cho critical loop; không dùng average che p99 |
| B-RS | Research CPU/RSS/DB/IO/storage headroom | Fit measured capacity cả burst/resync; có reserve cho công việc Research khác |
| B-FRESH | Dataset-specific source→projection→UI lag | Percentile và maximum stale age theo category; risk authority không dựa UI cadence |
| B-REVOKE | Revocation boundary→denial/invalidation | Mốc TS commit và frontend exposure đều đo riêng; safety invariant không có tolerance grant sai |
| B-RECOVERY | Recovery throughput/time và maximum backlog | Sustain producer rate sau outage, bounded storage; cursor retention đủ agreed outage objective |
| B-CMD | Accepted/status/terminal/unknown age | Theo operation; WAITING_ENCUMBRANCE không bị ép timeout thành success |
| B-HISTORY | History query latency và export cost | Full retrieval có continuation, correct coverage, bounded pages/resources |
| B-DL | DL freshness/throughput/error và host/resource reserve | Cùng baseline+candidate measurement với TS; không đẩy cost của Edge sang DL mà bỏ khỏi report |
| B-EDGE | Producer CPU/RAM/query/IO hard ceilings | Chốt riêng soft/high/hard và overload actions §6.6; không dùng total-host average che Edge growth |
| B-ANALYTICS | Research score/regime/correlation/Archive work | Bounded queued+running jobs, approved cadence và per-window recompute cost; delta projection không bị starvation |

Với baseline B và new N, báo absolute delta `N−B` và relative delta khi B khác 0; khi B gần 0 dùng absolute bound đã duyệt. Các axes CPU/RAM/query/IO đều phải có số đo; nếu một axis tăng, báo tradeoff và xin approve, không chỉ chọn axis giảm. Zero loss, authorization correctness, exact accounting và scope isolation là hard gates, không “bù” bằng performance tốt.

### 9.4 Evidence package

Gói nghiệm thu gồm manifest, fixtures/digests, test receipts, raw redacted output, summarized metrics có query definitions, comparison plots hoặc CSV khi thực sự tạo, query plans được phép, fault timeline, source coverage matrix, decision register và rollback drill report. Giữ failed/blocked observations; rerun bổ sung observation mới thay vì sửa lịch sử.

Không ghi PASS nếu chỉ đọc source, mock trả success, single-connection thay cho concurrency, hoặc caller báo nhưng thiếu receipt. Mark `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE` cùng scope và reason. `NOT_APPLICABLE` phải có owner/decision, không dùng để bỏ security/correctness gate của đường chạy đang mở.

### 9.5 Phương pháp nghiệm thu Edge cùng TS và Data Layer

P184N1R2 B6 6k×2/9k×2 capacity/performance G2 PASS là baseline evidence, không chứng nhận Edge candidate và không đóng N1 F1 core-kill convergence. Lấy exact harness, fixtures, interpretation của 6k×2/9k×2, 500 ms metric/window, repeats và raw receipts trước reuse; không tự chuyển 6k/9k thành TPS/client count hay universal capacity claim.

Thực hiện paired runs trên approved isolated target theo ba cấu hình cùng seed/cardinality/hardware/history/cache regime:

1. **B0:** TS + DL baseline đúng pinned source/diff, Edge candidate disabled; giữ current approved read traffic để có comparison thực.
2. **B1:** cùng TS + DL, bật minimal producer + Research projection, không browser load; đo riêng incremental export/journal/serialization/transport cost.
3. **B2:** B1 + representative dashboards/history/score/regime/Archive workloads; chạy normal/burst/reconnect/cache reset/outage/resync. Client growth chỉ được tăng Research fanout/query cost trong envelope; source polling/fetch không nhân theo client.

Nếu baseline đang dùng legacy Edge, thêm paired legacy→candidate comparison cùng effective dataset/coverage/consistency để tránh “tối ưu” bằng giảm dữ liệu. Không chạy B0 bằng cách tắt safety-critical TS/DL function. Mọi enable/disable/load injection cần approval đúng target; source-only audit không tạo measurements.

Báo deltas `B1−B0`, `B2−B1`, `B2−B0` cho CPU core-time, sustained/peak RSS, allocations/working set, DB connections/query calls/pool waits/rows scanned, WAL/IO/network, TS trading/admission latency/error, DL lag/throughput/error và source→projection/UI lag. So cả percentile/max đúng gate, variation/confidence, backlog high watermark và drain. Phân tích cost per committed record/byte và per new dashboard, không chỉ total throughput.

Chạy cả 6k×2 và 9k×2 khi original P184 workloads áp dụng; case thiếu fixture/target/approval là BLOCKED, không thay bằng synthetic nhỏ rồi gọi tương đương. Dùng representative heavy-history cardinality riêng trên Research để kiểm analytics; không buộc tải unrelated research vào TS. Hard gates: exact facts/digests/ACL, P184 performance threshold khi impacted, approved B-TRADE/B-DL/B-EDGE/B-RS bounds, no unbounded RAM/backlog, recovery có tốc độ bền vững và không làm worsen unresolved N1 failure. N1 cutover vẫn NOT_READY tới khi own F1 gate đóng.

### 9.6 Checklist sizing trước implementation và trước mở scope

- [ ] Pin all source/diff/config/fixture digests, process placement, host capacity và existing TS/DL/Research workload.
- [ ] Inventory từng expensive path: trigger, cadence, query plan, rows/bytes, complexity theo catalogue/history/client count, owner và reusable state.
- [ ] Điền numeric soft/high/hard ceilings §6.6; account all replicas, DB pools, queues, decompressed copies, caches, thread/runtime overhead và disk runway.
- [ ] Chứng minh no per-browser TS polling, no repeated full history scan, no whole-catalogue clone per refresh và no hot-path canonical score calculation.
- [ ] Record index/query-plan proof ở approved target; keep query limits/statement cancel và vacuum/WAL impact.
- [ ] Compare exact output coverage/digest giữa baseline/candidate; pagination/decimation không trở thành silent cap hoặc mất spike.
- [ ] Run W-COEXIST-6K/9K + W-ANALYTICS/CACHE-RESET và original workload matrix; kiểm slowdown/queue spill/recovery khi resources bị giới hạn thực.
- [ ] Verify resource stops chỉ affect approved export/read/job paths, preserve committed facts/accepted receipts và không kill trading loop tùy ý.
- [ ] Review gain từng CPU/RAM/query/IO axis, tradeoffs, rejected assumptions và residual headroom; có owner sign-off trước deployment.
- [ ] Attach raw receipts/plots/configs và rerun impacted tests khi source, job policy, dataset size/cadence hoặc topology đổi.

## 10 Kế hoạch mười hai phase

### 10.1 Cách dùng

Mỗi phase tạo một gói thay đổi nhỏ có approval trước mutation, có diff review và test receipt. Dependencies dưới đây là kỹ thuật, không tự cho phép thực thi. Documentation/offline design có thể đi trước phần runtime bị block, nhưng không đóng affected gate.

Fixture bank dùng chung:

- **F-AUTH:** Bobby protected owner, Stan delegated manager-admin, Thanhvuong liên kết alpha qua verified user ID, researcher hai issuer/subject khác nhau cùng display name, suspended user, workload actor; Bobby/Stan full-business-read positive controls, Thanhvuong field/metric allowlist và cross-portfolio denied cases. Command-capital grants là fixture riêng, không kế thừa full read.
- **F-CATALOG:** hai portfolio, một alpha owner triển khai nhiều account/deployment, archived entities, aliases, bindings theo thời gian; đủ cardinality/record size để vượt nhiều pages.
- **F-TXN:** hai DB connections có commit đảo thứ tự cấp ID; aborted tx, long tx, same entity revisions, multi-entity transaction group; crash injection ở từng durable boundary.
- **F-MONEY:** FUND/RETURN_CAPITAL khác budget grant/recall, zero-capital, pending encumbrance, exact decimal, late fee/funding, partial/reversal/correction, USD khác USDT.
- **F-NET:** timeout trước/sau TS commit, lost response/ACK, disconnect, reconnect storm, slow client, expiry/rotation TLS và auth.
- **F-LOAD:** workload matrix W-IDLE…W-CORRECT với seed/cardinality/event-rate pinned; cùng fixtures chạy baseline và candidate.

Fixture sử dụng dữ liệu giả/deterministic đã redact; không copy production secret hoặc funding credential. Các thao tác command external chỉ Demo/sandbox/local deterministic trong môi trường được duyệt.

### EPG10-00 Khóa source authority và phạm vi

**Mục tiêu:** có baseline trung thực để không nâng kiến trúc dựa vào endpoint, migration hoặc runtime giả định. **Dependencies:** không có; là đầu vào mọi phase.

**Deliverables:** `source-runtime-manifest`, source map có writer/read/publication paths, authority matrix, permissions manifest, decision register DEC-E01…E15 và dependency map tới PM/Portal/DL; pin final specification và companion revisions.

**Checklist:**

- [ ] Pin full SHAs/dirty status cho TS, DL, PM, Edge/Portal main và stable, Research BE/FE riêng; ghi source review UTC, dirty/untracked digests và diff scope.
- [ ] Đọc AGENTS/custom permissions; tách read-only inspection khỏi mutation package cần duyệt.
- [ ] Map P16 catalogue/manifest/permit/cursor/retention và deferred membership; đọc source migrations tới current HEAD nhưng giữ applied schema riêng.
- [ ] Verify target service/binary/DB/TLS chỉ bằng read route được phép; missing source/runtime giữ UNKNOWN.
- [ ] List every authority/writer, human/workload trust, supported mode/venue/profile và unavailable operations.
- [ ] Khóa base release read/Demo; phân biệt P184 performance G2 500 ms với P19 G2 mainnet optional theo explicit request; N1 F1 còn mở không là global blocker của dataset đọc độc lập.

**Tests và fixtures:** `EPG10-T00-01` manifest rejects truncated/mismatched SHA ở release gate; `T00-02` migration source không làm applied-schema claim PASS; `T00-03` F-AUTH owner TEXT/shared admin token không đủ chứng minh business membership; `T00-04` pending production publication artifact không biến thành live flag.

**Tests v1.1 bổ sung:** `EPG10-T00-05` source manifest không dùng HEAD thay dirty/untracked digest; `T00-06` P184 G2/P19 G2/N1 F1 và P16 isolated/full DB/P/XLC status không bị nhập nhằng hoặc nâng scope.

**Evidence:** source locators/digests, read-only inspection receipts, unresolved matrix và approvals references. **Exit gate:** mọi affected path có authority owner và exact baseline; UNKNOWN runtime có blocker rõ, không cho dependent production gate pass. **Stop/rollback:** baseline đổi thì repin và invalidate affected receipts; phase inventory không có service rollback. **Phase report:** branch/source/runtime table, permission gaps, decisions cần Bobby duyệt và scopes đủ điều kiện bắt đầu 01/02.

### EPG10-01 Đo tải và chốt placement

**Mục tiêu:** biết chi phí thực của read/export hiện tại và capacity Research trước khi chuyển tải. **Dependencies:** 00 cho manifest; thiết kế harness/sizing worksheet chạy song song với 02 trong approved workspace. Đo tải thật cần target và permission riêng.

**Deliverables:** workload manifest, baseline metrics cho hai host, query inventory, bottleneck report và budget register đã chốt.

**Checklist:**

- [ ] Định nghĩa CPU/RSS/query/IO và freshness measurement cùng percentile/window; kiểm clock skew và local monotonic duration.
- [ ] Đo W-IDLE/NORMAL/BURST/DASH, sau đó OUTAGE/RESYNC ở test target được phép; baseline source unchanged.
- [ ] Attribute cost theo source fetch, serialization, network, projection, report và fanout; không gộp tất cả vào một average.
- [ ] Đo Research cùng existing workload; xác định headroom, notional consumer count và history growth.
- [ ] Chốt B-TS-CPU/RAM/DB/IO, B-TRADE, B-RS và data freshness; chọn targets dựa số đo.
- [ ] Quyết định module/process placement và resource isolation không tạo extra service nếu không cần.
- [ ] Lập B0/B1/B2 worksheet §9.5 và W-COEXIST-6K/9K; giữ nguyên P184 fixture semantics, 500 ms gate definition và N1 F1 NOT_READY.
- [ ] Chốt TS producer ceilings cùng B-DL/B-EDGE/B-ANALYTICS; sizing all pools/queues/copies và outage disk runway theo §6.6.

**Tests và fixtures:** `EPG10-T01-01` F-LOAD paired runs dùng same seed/cardinality/config; `T01-02` W-DASH tăng client chỉ ra source QPS amplification hiện có; `T01-03` W-RESYNC capture peak RSS/IO và trading impact; `T01-04` idle near-zero baseline dùng absolute delta, không chia phần trăm sai.

**Tests v1.1 bổ sung:** `EPG10-T01-05` W-COEXIST-6K/9K B0/B1/B2 giữ exact fixture/source/config manifest và gate metric; `T01-06` sizing cộng all pools/queues/in-flight/decompressed/cache bytes, no unowned CPU/RAM/IO reserve. Các tests đo tải vẫn NOT_RUN tới approved execution.

**Evidence:** raw metrics, query definitions, environment/config digest, variation và placement decision. **Exit gate:** từng axis có baseline và approved bound; thiếu capacity evidence thì chưa chuyển load. **Stop/rollback:** dừng load generator khi vượt safety budget, giữ observations; không tự tăng VPS resources/config. **Phase report:** bottlenecks xếp theo chi phí, placement được chọn, budgets và các phép đo còn thiếu.

### EPG10-02 Khóa catalogue schema và compatibility

**Mục tiêu:** mọi business resource có contract producer rõ và full retrieval được; không ép consumer đoán. **Dependencies:** 00; có thể khóa logical contracts/fixtures song song 01. Numeric pages/cadence và release capacity đợi 01, không chặn schema design.

**Deliverables:** versioned catalogue/schema registry, coverage matrix, DTO mapping existing→proposed, compatibility and error-code specification.

**Checklist:**

- [ ] Đối chiếu từng catalogue family với writer, source query, history table/journal và publication gate; bổ sung rows nguồn còn thiếu.
- [ ] Khóa IDs/decimals/UTC/ms/null/availability/as-of/completeness và environment/venue/profile scope.
- [ ] Tách availability AVAILABLE/PARTIAL/UNAVAILABLE/OUT_OF_SCOPE khỏi history capability và implementation/evidence status theo 4.2; explicit gaps, missing source không dùng empty success.
- [ ] Keyset pages theo snapshot; rows+bytes bound, continuation và oversized-record handling; full traversal không tổng row cap.
- [ ] Version additive fields, unknown-field handling và incompatible-major rejection; giữ canonical TS capital payload.
- [ ] Contract test fixtures cho old Python façade/new Rust exporter/Portal DTO; không silent precision loss.
- [ ] Khóa proposed metric/Archive DTO source-set/window/currency/correction/ACL metadata; formula_id=qbts_prb_v1_1 từ SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md; approved formula và pending runtime calibration/config là hai trạng thái riêng.
- [ ] Khóa canonical metric registry/dependency graph và §8.6 NAV/flow/cost/turnover/watermark/stress proof; tách formula_approved khỏi runtime_config_approved.
- [ ] Map PM R2 margin-risk/economic backing/separate exposure cap; không add global 1× notional cap hoặc đổi pma.capital-command.v1.1.

**Tests và fixtures:** `EPG10-T02-01` F-CATALOG traversal trả đủ unique entities qua nhiều page/bytes limits; `T02-02` large integer/decimal/null/zero round-trip exact; `T02-03` current-only không chứng nhận full history; `T02-04` cursor đổi scope/filter/generation bị từ chối; `T02-05` old compatible reader và unsupported schema behavior rõ; `T02-06` availability/history/implementation adapter giữ đúng nghĩa, RESTRICTED→OUT_OF_SCOPE không lộ hidden existence.

**Tests v1.1 bổ sung:** `EPG10-T02-07` metric DTO round-trip giữ source-set/window/currency/revision/evidence/availability và research run khi áp dụng; `T02-08` PM R2 risk/budget/backing/exposure fields không bị gom thành global 1× cap hoặc monetary equity; `T02-09` stage/lifecycle/TradeState/Archive dimensions, typed units/denominators và Paper-clone lineage round-trip không bị nhập nhằng.

**Tests v1.2 bổ sung:** `EPG10-T02-10` registry/envelope round-trip giữ P/R/B/six atoms/bands, formula/config approval riêng, comparable basis khác subject binding, source watermarks và stress/consolidation manifests; decimal/null/count/time đúng schema. `T02-11` metric dependency graph không thêm raw-q/grouping/correlation/Research binding vào direct economic PortfolioScore; legacy lambda field không đi vào v1.1 schema/compute.

**Evidence:** schemas và digests, source-coverage table, fixture expected outputs, compatibility receipts. **Exit gate:** 100% catalogue families có authority+availability+history scope+owner; mọi path bật có producer contract đã certify. **Stop/rollback:** chỉ bật supported subset và công bố unavailable; không delete unknown fields hoặc history để khớp DTO. **Phase report:** contract changes, unsupported datasets, coverage gaps và exact schemas được khóa.

### EPG10-03 Chứng minh capture và commit ordering

**Mục tiêu:** mọi committed business change được xuất đúng, không hole do late commit. **Dependencies:** 00/02; mutation approval cho test-only capture changes nếu cần.

**Deliverables:** transaction/capture design, ordering proof, writer-coverage map, durable export ledger/cursor semantics, retention ownership.

**Checklist:**

- [ ] Trace journal write cùng domain transaction; kiểm mọi writer/update/delete/correction path trong supported datasets.
- [ ] Chứng minh source commit coverage riêng với published sequence; công bố partition guarantee thật.
- [ ] Replay F-TXN với ID cấp trước nhưng commit muộn, aborted tx và multi-entity group.
- [ ] Nếu current P16 thiếu proof, duyệt phương án commit-aware hoặc outbox pending/ledger; đo write amplification/contention trước mở.
- [ ] Fence producer generation tại durable commit; no concurrent writers after lease loss.
- [ ] Retention không xóa unexported/unacknowledged rows ngoài policy resync được chứng minh.

**Tests và fixtures:** `EPG10-T03-01` T1 thấp-ID commit sau T2 vẫn xuất đủ đúng revision/group; `T03-02` abort không tạo business delta giả; `T03-03` crash domain commit/export append/mark published không mất hoặc tạo duplicate effect; `T03-04` stale generation writer bị reject; `T03-05` event same ID/different digest dừng stream thay vì overwrite.

**Evidence:** real PostgreSQL multi-connection receipt, failure timeline, source transaction paths, invariant queries và ordering claim scope. **Exit gate:** zero lost committed changes và exact expected digest trong fixtures; global ordering claim chỉ khi có proof, còn partition/vector contract đủ rõ. **Stop/rollback:** disable new publisher, retain domain facts/outbox; không reset cursor tới MAX(id). **Phase report:** proven guarantees, unresolved writers, write-cost delta và replayability floor.

### EPG10-04 Bootstrap delta và atomic projection

**Mục tiêu:** consumer có full consistent read model và recover sau crash. **Dependencies:** 02 cho isolated implementation/fixtures; 03 và Research DB capacity/permissions từ 01 trước certification từ nguồn thật. Không ghi integration PASS khi chỉ dùng fixture.

**Deliverables:** snapshot/manifest protocol, staging projection, checkpoint transaction, generation pointer, resync implementation and tests.

**Checklist:**

- [ ] Chốt barrier/overlap algorithm theo source guarantee; snapshot lifetime và vacuum cost bounded.
- [ ] Stage pages, digest/uniqueness/referential checks; không giữ TS transaction mở theo browser.
- [ ] Atomic apply+dedup+checkpoint; ACK sau commit; group completeness giữ provisional views.
- [ ] Xử lý tombstone, late correction, duplicate replay và aborted/expired snapshot.
- [ ] Resync generation mới, atomic pointer swap và rollback-compatible old projection.
- [ ] History backfill tách quota, không starve fresh deltas; checkpoints per dataset/consistency group.

**Tests và fixtures:** `EPG10-T04-01` F-CATALOG mutation/delete trong bootstrap không hole hoặc resurrection; `T04-02` crash trước/sau projection commit và trước ACK converges same digest; `T04-03` expired cursor tạo resync, không partial continuation disguised complete; `T04-04` cross-dataset group không visible half-state; `T04-05` generation switch đang query không mix epochs; `T04-06/07/08` scoped hidden skips, true visible loss và scope-change cursors theo 5.7.

**Evidence:** golden projections, source/read-model digest comparison, checkpoint rows, fault/restart timeline, snapshot expiry results. **Exit gate:** full authorised catalogue và published history scope reconstruct đúng; checkpoint/data consistency đạt all injected boundaries. **Stop/rollback:** giữ active generation cũ stale/read-only theo policy; quarantine new generation, không merge two histories. **Phase report:** bootstrap/replay cost, completeness proof và exact recovery behavior.

### EPG10-05 Tích hợp query history và realtime fanout

**Mục tiêu:** Portal đọc nhẹ từ Research, một nguồn phục vụ nhiều client mà vẫn đúng scope/freshness. **Dependencies:** 02 và Portal contracts cho isolated BFF/UI contract work; 04, read-scope security của 08 và 06 budgets trước activation nguồn thật.

**Deliverables:** BFF read routes map, scoped query/cache layer, subscription/replay interface, history continuation and freshness metadata.

**Checklist:**

- [ ] Giữ compatibility với existing routes; route mới chỉ mở sau schema tests, không biến proposed name thành hiện hữu.
- [ ] Research projection là source của dashboard/report/history query; TS read fallback chỉ trong policy đã đo.
- [ ] Cache key gồm principal effective scope/auth revision/filter/schema/generation; single-flight expensive query.
- [ ] Server-side pagination/full exports, browser virtualized list; count/completeness đúng nguồn.
- [ ] Per-client queue/byte caps, slow-client disconnect/resume và reconnect authorization.
- [ ] Tách replaceable display mark/notification coalescing khỏi exact financial event retention.
- [ ] Bounded chart paging/decimation có method/coverage; metrics/report dùng canonical exact input, không browser-derived score.
- [ ] Push/notify + shared poll fallback; test lost hint, cursor continuity, cache TTL/revision invalidation và single-flight khi reset.

**Tests và fixtures:** `EPG10-T05-01` F-AUTH hai scope cùng filter không leak cache; `T05-02` W-DASH nhiều tabs không nhân full TS scan theo client; `T05-03` F-NET slow client không tăng RAM vô hạn hoặc block peers; `T05-04` reconnect với cursor hợp lệ replay đủ, expired cursor yêu cầu refetch; `T05-05` unavailable/stale/partial không hiển thị complete realtime.

**Tests v1.1 bổ sung:** `EPG10-T05-06` history keyset/decimation returns exact continuation/coverage và retains spike extrema theo approved display method, không đổi canonical metric oracle; `T05-07` lost notify/restart dùng durable-cursor fallback, không missing facts; `T05-08` cache stampede/correction/revoke invalidation không phát old-scope/old-policy metric hoặc nhân source polling.

**Evidence:** route/DTO mapping, scoped cache fixtures, source-vs-Research QPS, fanout queue curves và UI integration receipts từ guide Portal. **Exit gate:** XLC-02/03/06 read E2E pass trong supported scopes, budgets đáp ứng. **Stop/rollback:** disable new fanout/route and serve compatible old scoped read, không bypass auth để giữ availability. **Phase report:** client scale được đo, history coverage và compatibility differences.

### EPG10-06 Áp resource budgets và tối ưu hot path

**Mục tiêu:** giảm chi phí TS có số đo, giữ queue/memory/DB bounded và không giảm correctness. **Dependencies:** instrumentation/ceiling design từ 00/01 và làm song song 02…05; final paired benchmark cần candidate 03/04/05 trong scope được đo.

**Deliverables:** per-module resource config, priority/backpressure policy, before/after benchmark, approved optimization diff và observability dashboard specification.

**Checklist:**

- [ ] Bound mọi queue theo entries+bytes; bound DB/HTTP/concurrency, cache memory và decompression.
- [ ] Cô lập live delta/command status khỏi bootstrap/history/report; admission không bị background worker chiếm pool.
- [ ] Thay repeated TS scan bằng snapshot reuse/single-flight/projection; index/query changes cần plan+approval.
- [ ] Profile serialization/compression/copy/task blocking; chỉ optimize nơi có evidence.
- [ ] Review audited manager fleet expiry/8-relation drains/max-page cap và full-scope delete+insert (§2.6); reuse SWR, thay steady-state bằng incremental upsert/checkpoint sau proof, giữ full snapshot chỉ cho bootstrap/resync.
- [ ] Test durable backlog/disk watermarks, throttling và retry jitter; không drop exact events.
- [ ] Rerun all workload matrix và công bố delta CPU/RAM/query/IO cả TS/DL/Research; ghi rõ mọi tradeoff.
- [ ] Chạy B0/B1/B2 ở pinned 6k×2/9k×2 workloads khi applicable; không reuse B6 PASS cho candidate.
- [ ] Verify source exporter không compute history rollups/score/regime/correlation; Research job quota/cancel/checkpoint không starve projector.
- [ ] Enforce soft/high/hard resource ceilings trong isolated load test; record backpressure trước OOM/disk-full và resume exact digest.

**Tests và fixtures:** `EPG10-T06-01` W-BURST queue/RSS không vượt approved bounds và drain theo recovery target; `T06-02` W-RESYNC không starve fresh delta/command status; `T06-03` network outage/backpressure giữ đủ exact event digest; `T06-04` dashboard client scale có TS amplification nằm trong B-TS-DB; `T06-05` candidate giữ B-TRADE và mọi budget đã duyệt.

**Tests v1.1 bổ sung:** `EPG10-T06-06` B0/B1/B2 6k×2/9k×2 giữ P184 performance gate khi impacted, B-DL và B-EDGE; `T06-07` enforced CPU/RAM/pool/queue/disk high-water giới hạn producer bằng backpressure, no lost facts; `T06-08` W-ANALYTICS/Archive full recompute bị quota/pause mà delta/TS không starvation; `T06-09` W-CACHE-RESET fanout source amplification bounded và slow clients không head-of-line block peers; `T06-10` incremental manager projection matches full-snapshot golden digest qua correction/tombstone/bootstrap, measured writes scale theo changed entities, max-page exhaustion không báo COMPLETE.

**Evidence:** paired metrics, profile/query plans được phép, config digest, rejected-load counters và all-event count/digest. **Exit gate:** đạt approved reduction targets và non-regression bounds; no data loss/scope leak; không có unbounded buffer. **Stop/rollback:** giảm/disable background exporter hoặc read feature theo approved policy, giữ durable journal; không throttle exchange ingest ngoài policy TS. **Phase report:** số trước/sau trên từng axis, bottleneck còn lại, configuration envelope an toàn và tradeoff cần duyệt.

### EPG10-07 Thực hiện command relay có durable receipt

**Mục tiêu:** hoàn thiện relay mới tại source hiện đang từ chối activation, đưa approved command tới TS đúng authority. **Dependencies:** 00/02, TS command handlers/identity/capital scopes đã được PM certify, 04 cho receipt projection; explicit mutation approval.

**Deliverables:** reviewed relay implementation, operation catalogue, actor/transport contract, status lookup, durable ambiguity handling và feature activation matrix.

**Checklist:**

- [ ] Sửa code từ chối relay hiện tại chỉ trong approved implementation package; không coi việc đổi flag là implementation.
- [ ] Preserve `pma.capital-command.v1.1` payload và states; map existing paper command catalogue riêng, không giả mọi PM operation đã tồn tại.
- [ ] Verify workload+human delegation, supported target/mode/profile, TS business authorization và expected versions.
- [ ] Implement same-key/digest replay và conflict; persist correlation để lost-response recovery.
- [ ] Distinguish accepted/terminal/unknown; status lookup authoritative và retention đủ ambiguity window.
- [ ] Reject direct SQL/exchange bypass; operation chưa publish trả unavailable; base release chỉ local/Demo allowed scopes.

**Tests và fixtures:** `EPG10-T07-01` F-NET TS commit trước response loss, retry same key có đúng một effect/receipt; `T07-02` same key different payload trả conflict; `T07-03` stale version/wrong mode/profile/unauthorized actor no effect; `T07-04` ACCEPTED không làm UI/relay nói APPLIED; `T07-05` pending recall receipt giữ exact amount invariant sau retry/cancel; `T07-06` missing authority implementation không fallback admin SQL.

**Evidence:** source diff, TS+Edge correlated receipts, domain before/after, canonical payload vectors và fault timeline. **Exit gate:** tất cả enabled operations có handler/permission/version/idempotency/status proof; unknown outcome recover được; no live activation implied. **Stop/rollback:** disable new command entrypoint, retain accepted operation ledger and status/recovery; không cancel hoặc undo applied amounts hàng loạt. **Phase report:** enabled operation matrix theo environment, terminal/unknown examples và authority gaps còn blocked.

### EPG10-08 Hoàn thiện revocation scope và TLS

**19Oct finite identity-role window:** [original08 journal](../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-research-identity-acl-window--2026-10-19-asiasaigon)
and [private operator packet](../integration/execution-native-read-v1/research-identity-intake/README.md#finite-identity-role-window--independently-implemented19oct)
record40new PG15/SCRAM +18baseline +14regression PASS, not genuine Core/human
acceptance. Exact one-shot ACL/pool/recovery/retirement is implemented; UNKNOWN
does not revoke recovery. Actual role remains dormant/no-writer; real Core
composition/session and connected revoke/cache/cursor/SSE remain original08.
Full connected08NOT_MET;09connected NOT_STARTED. No phase/gate weakening.

**Original08 Research prerequisite (19Oct):** [main journal](../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-research-identity-intake-preparation--2026-10-19-asiasaigon)
and [official-SDK intake/receipt packet](../integration/execution-native-read-v1/research-identity-intake/README.md):
14helper+18PG15 cases PASS; approved one receipt schema + isolated NOLOGIN/
no-grants role actually prepared on the exact TS physical target. No identity
or business authority is inferred; full connected08NOT_MET,09not started.
Core's genuine reverse/session composition still precedes finite identity ACL
activation and connected revoke/cache/cursor/SSE. Stable/provider28445 unchanged.

**Original08 pre-ENTER repair (19Oct):** [same-phase journal](../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-pre-enter-identity-window-recovery--2026-10-19-asiasaigon)
and [current helper/test packet](../integration/execution-native-read-v1/research-identity-intake/README.md)
supersede activation of the old235-line helper. Failed pre-ENTER RUN recovers
only its original attempt using official fenced physical ROLLED_BACK + Core
ACK, never fake finished/ENTER. Final89distinct isolated cases PASS,0FAIL/SKIP;
Core ACK model is explicitly not genuine connected acceptance. Core owns its
authenticated rollback-only seam and Research release134/trust/temporary PREVIEW
session (then exact revoke), which is not Cloudflare/password proof. HK slice
does not resume goal, activate role or change provider28445; full08NOT_MET and
09connectedNOT_STARTED. Original acceptance/security requirements below remain.

**Mục tiêu:** quyền thu hồi có hiệu lực xuyên cache/queue/socket và TS commit; transport fail closed. **Dependencies:** read-scope tests từ 02/05 và trust decisions, không cần 07 command hoàn tất. Command-scope revoke/commit tests cần 07 + TS authority. Security changes cần riêng approval theo loại.

**Deliverables:** revocation propagation contract, security test report, certificate/auth rotation plan, least-privilege access map và safe logging policy.

**Checklist:**

- [ ] Validate issuer/audience/signature/expiry và workload identity; trusted actor assertion không đọc từ arbitrary body.
- [ ] Revoke trong TS revision transaction, invalidate caches/subscriptions và recheck queued command tại commit.
- [ ] Inventory direct ADMIN remnants; no self-elevation/protected-owner mutation qua relay.
- [ ] Test cross-scope own/shared/delegated grants theo TS-approved business model; chưa có model thì deny/unavailable.
- [ ] Verify certificate chain/hostname/TLS config và reconnect on rotation; không bypass verification.
- [ ] Scrub secrets khỏi logs/metrics/error/evidence; validate oversized payload và rate limits.
- [ ] Tách read grants/cross-portfolio discovery khỏi command/capital capability; aggregate metric không leak hidden inputs qua weights/counts/reasons.
- [ ] Với read-only release, test mọi command entrypoint vẫn denied và UI không quảng bá command-ready.

**Tests và fixtures:** `EPG10-T08-01` F-AUTH revoke sau enqueue trước TS commit denies effect; `T08-02` revoke active SSE/cache không phát thêm restricted data ngoài certified boundary; `T08-03` Stan không self-elevate hoặc sửa protected owner; `T08-04` wrong issuer/audience/expired token and wrong certificate/hostname fail closed; `T08-05` key/cert rotation authorised flow giữ identity/scope correct; `T08-06` injected secret-shaped field không xuất publication/log.

**Tests v1.1 bổ sung:** `EPG10-T08-07` read-only scope vẫn deny command/capital mutation; hidden metric inputs/counts/weights không leak qua aggregate; `T08-08` auth revision/correction/generation invalidation đúng mọi Research cache và active stream, positive controls cho independent unaffected scope; `T08-09` Bobby/Stan full-business-read positive controls không mở secrets hoặc command rights; Thanhvuong chỉ eligible portfolio + approved own-slice fields/metrics, no hidden aggregates/counts qua cache/stream/export.

**Evidence:** authorization timeline theo monotonic+UTC clocks, safe negative-test logs, trust-store/config digest không secret, scan report. **Exit gate:** XLC-01/05 và TLS path đạt scoped proof; revoked command không commit; no secret leak. **Stop/rollback:** disable affected routes/streams, preserve receipt/status/recovery; không fallback shared admin identity hoặc insecure TLS. **Phase report:** measured revoke latency, exact deny behavior, trust gaps và security approvals còn thiếu.

### EPG10-09 Kiểm thử E2E dữ liệu command và recovery

**Execution tracking (2026-10-16):** Bobby đã duyệt09. Round độc lập và connected
acceptance được track riêng tại [main plan§23.18](../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2318-epg10-09-e2e-command-and-recovery-execution--2026-10-16)
và [21case/11XLC owner return](../evidence/execution-edge-v1_2/EPG10-09/E2E_AND_OWNER_RETURN.md).
Round độc lập COMPLETE:606PASS, fmt/strict Clippy PASS và cleanup xong;
full connected gate NOT_MET với exact owner/input/exit cho vòng2. Có thể đề xuất
10 independent preparation/drill; chưa có connected cutover/release approval.
Isolated Rust/PG/shared-oracle evidence không thay các E2E requirements bên dưới;
full connected gate vẫn cần exact source/authority/Research/budget returns.

**Mục tiêu:** chứng minh ba hệ thống hoạt động cùng nhau, không chỉ isolated PASS. **Dependencies:** 04/05/06 + read portion của 08 cho read-only scope; thêm 07 + command portion của 08 và PM impacted authority receipts cho enabled commands. Portal impacted receipts bắt buộc theo released surface; offline suite có thể chuẩn bị từ 02.

**Deliverables:** integrated fixture suite, cross-guide traceability, workload/fault evidence, failure triage và production-readiness gap register.

**Checklist:**

- [ ] E2E full catalogue/history → bootstrap/delta → BFF/UI cùng scopes, completeness và metrics.
- [ ] E2E approved Demo/local command → TS decision/effect/receipt → Edge projection → UI terminal state. Affected TS trading-flow certification phải có G1 actual OKX Demo; generic sandbox/mock không thay, pure docs/read-only không bị kéo vào gate này.
- [ ] Cover order/fill/fee/funding/correction/reconciliation và capital/budget distinction, temporal owner/binding attribution.
- [ ] Crash source/export/consumer/BFF, lost ACK/response, stale generation, corrupt page/schema và history retention expiry.
- [ ] Run F-TXN trên real PostgreSQL async/multi-connection; fixture/mock-only tests không thay thế.
- [ ] Rerun F-LOAD candidate với failure/recovery và preserve trading latency; phân biệt current-page evidence khỏi full-history proof.
- [ ] Shared Research calculation golden tests: same input-set/window/version, corrections, missing sample/coverage/currency, no-lookahead regime và Archive paper-only non-actuation.
- [ ] Certify metric sau approved runtime calibration, input/source proof và oracle của formula đã chọn; core read scope được đóng riêng khi metrics chưa available. Không nâng P16 four isolated probes thành full T16 DB/P/XLC.

**Tests và fixtures:** `EPG10-T09-01` F-CATALOG+F-MONEY complete history/reports match golden facts; `T09-02` deposit/withdrawal-only luôn không tạo trading PnL; return/drawdown hiệu suất được quảng bá phải pass approved cashflow-only oracle; advanced metrics chưa certify giữ DISABLED/UNAVAILABLE, không chặn core release; `T09-03` E2E command timeout/restart/revoke vẫn one effect và correct actor; `T09-04` failover/resync converges identical projection digest; `T09-05` all modes/profiles scoped và wrong-scope attempts denied; `T09-06` budgets hold under integrated W-BURST/OUTAGE/RESYNC.

**Tests v1.1 bổ sung:** `EPG10-T09-07` approved QBTS/AlphaScore/PortfolioScore golden vectors cùng version/source-set/window cho report/BFF/UI, corrections invalidate đúng affected windows; `T09-08` regime run/stage/window binding và feature/reference cutoffs không lookahead hoặc trộn strategy versions; `T09-09` Archive paper watch respects cadence/retention/resource quota, không auto-unarchive/promote/live/TradeState/allocator mutation; `T09-10` formula đã chọn nhưng chưa approved runtime config trả policy_pending/UNAVAILABLE, nhưng certified independent read dataset không bị global-block vì metric/N1/command gate không liên quan; `T09-11` Archive/Paper-clone explicit authorized disposition giữ original history và scope/identity lineage, read/watch không tạo clone hoặc lifecycle side effect.

**Tests v1.2 bổ sung — tất cả PLANNED / NOT RUN trong lần sửa tài liệu:**

| ID | Fixture / assertion bắt buộc |
|---|---|
| EPG10-T09-12 | Final spec numerical vectors: P80/R66/B70 → F73.3/fair; atomic weights và band boundaries dùng unrounded canonical value; report/BFF/UI parity |
| EPG10-T09-13 | Missing q làm composition partial; missing grouping/correlation chỉ degrade own diagnostics; missing research linkage không chặn ledger-only score; direct portfolio NAV score vẫn available/provisional khi own inputs đầy đủ; đủ q mà thiếu NAV không lấy AlphaScore thay PortfolioScore |
| EPG10-T09-14 | Same-window/basis complete short evidence → numeric provisional, same value khi đổi maturity; q90 available/q50 provisional với a60/20 → AlphaScore80/provisional weight.25; khác 5d/30d chỉ Early facet |
| EPG10-T09-15 | Missing Sharpe trong canonical fixture → full null/bounds62.5…76; missing turnover giữ known baseline atoms nhưng full null/stress partial; missing baseline fees invalidates dependent known atoms; không renormalize |
| EPG10-T09-16 | Stress proof: net.01/opening100/G200/delta5bps → extra cost.10/stress.009; fill-side dedupe, derivative notional, no transfer turnover/no double fee; delta/anchor monotonicity; invalid nonpositive stressed path fails |
| EPG10-T09-17 | Valuation/flow/grid/closed-block/late-cost/FX watermark gap → correct affected status; no zero-fill or forward-fill fiction; completed missing block khác incomplete tail; deposit fixture TWR7.1%, PnL9.1 |
| EPG10-T09-18 | Same actual Canary→Live giữ path; predeclared nonoverlap Paper40+Sandbox20+actual10 → forward70/actual10 mixed observational facet, không actual NAV; outcome-selected source/config mismatch/gap invalidates stitching |
| EPG10-T09-19 | Unique manager account NAV + internal-transfer elimination trước F; không mean child scores; split/clones cùng path không đổi direct score; missing grouping chỉ chặn HHI |
| EPG10-T09-20 | Approved formula + pending calibration → policy_pending, preview không vào production aggregate; fixture anchors/delta không tự trở thành production; score outage không chặn authorized reduce-risk |
| EPG10-T09-21 | Rolling window peak-exit fixture: MDD/ADD recompute theo new E0/peak, không subtract-old-DD shortcut; intermediate overflow/underflow/nonfinite stress rejected trước band/serialize |

**Evidence:** full execution manifest, TS/Edge/Portal correlation, source/read-model reconciliation, exact failed/blocked receipts và resource deltas. **Exit gate:** hard invariants pass trên đường chạy được mở; critical gaps không được che bằng E7/source-isolated PASS. External N03 chỉ pass khi có own fresh receipt. **Stop/rollback:** keep feature dark/shadow, fix failed scoped path và rerun impacted tests; không chuyển sang live để thay test environment thiếu. **Phase report:** traceability result từng XLC, support matrix, residual issues và release recommendation có scope.

### EPG10-10 Shadow fenced cutover và rollback drill

**Mục tiêu:** chuyển read/relay path có kiểm soát và chứng minh một writer generation. **Dependencies:** 09 cho exact dataset/consistency-group/operation scope sẽ mở, explicit release/target approval và backups/recovery plan đã verify. N1 F1/P184/live gates chỉ tham gia theo real dependency; không gộp all-roadmap gate.

**Deliverables:** change package, shadow comparison report, deployment/runbook sequence, fencing evidence, rollback drill và operator sign-off.

**Checklist:**

- [ ] Expand schema/config additively; record applied-state evidence sau khi authorized deployment thực sự chạy.
- [ ] Shadow reads/export/projection trên matched scope; compare event counts/digests/versions/quality/resource costs.
- [ ] Cut over per dataset/consumer group/mode đã duyệt, pause old writer và acquire new generation fence; chứng minh stale writer bị reject.
- [ ] Chỉ route read pointer sau complete checkpoint; command activation là decision riêng từng operation/mode.
- [ ] Rollback read pointer/code compatible, giữ accepted command receipts và status lookup; forward-repair economic facts khi cần.
- [ ] Giữ compatibility window và evidence; destructive cleanup/contract migration phải approval mới.

**Tests và fixtures:** `EPG10-T10-01` shadow/new projection match same barrier; `T10-02` stale old writer không ghi sau fence dù process sống lại; `T10-03` cutover giữa in-flight read/command không duplicate effect hoặc mất receipt; `T10-04` rollback consumer/route vẫn đọc accepted commands và exact history; `T10-05` interrupted cutover resume có operator state rõ, không hai active writers.

**Evidence:** release artifact/config digests, approval refs, fence/lease rows, before/after health/checkpoint, rollback timeline và preserved facts check. **Exit gate:** approved scope ổn định trong observation window dựa workload, đạt budgets và rollback drill; không cần production funds/keys nếu base release không live. **Stop/rollback:** trigger theo mục 13; freeze new entrypoint, retain events và reconcile unknown operations trước resume. **Phase report:** what changed/where/when, current active generation, validated scope, rollback readiness và go/no-go còn lại.

### EPG10-11 Bàn giao vận hành và đóng acceptance

**Mục tiêu:** operator có thể xử lý sự cố, cập nhật catalogue và kiểm performance mà không đoán. **Dependencies:** runbook/ownership/alerts chuẩn bị song song từ 00; final acceptance cần 10 trong exact released scope và retention decisions complete.

**Deliverables:** operation runbooks, ownership/on-call map, final acceptance matrix, approved configuration envelope, release notes và known limitations.

**Checklist:**

- [ ] Bàn giao source/consumer checkpoint, backlog, freshness, TLS/auth, unknown-command và storage alerts có actionable owner.
- [ ] Rehearse runbooks cursor expiry, slow clients, stale data, authority unavailable, revoke loss, projection corruption và cert expiry.
- [ ] Verify restore/rebuild projection từ retained history; backup scope không chứa unneeded secrets.
- [ ] Document per-family retention/archival/quality and full-catalogue continuation; policy changes cần decision revision.
- [ ] Close XLC traceability và impacted PM/Portal references bằng receipts, không copy PASS từ baseline cũ.
- [ ] Ghi rõ command modes/operations enabled; live vẫn disabled nếu chưa explicit approved; thêm source/schema/runtime freshness date.

**Tests và fixtures:** `EPG10-T11-01` operator khác thực hiện runbook trên approved test target không cần private knowledge; `T11-02` restore+resync tái tạo canonical digest và full coverage; `T11-03` alert firing/recovery có đúng owner/reason/action; `T11-04` release evidence references resolve và mỗi PASS đúng source/schema/runtime scope.

**Tests v1.1 bổ sung:** `EPG10-T11-05` operator nhận và xử lý watch/score-job backlog, policy revision và correction alert bằng bounded pause/resume, không cần TS heavy recompute; published metric revision và raw-history availability vẫn traceable.

**Evidence:** drill receipts, acceptance sign-off, unresolved limitations và updated source/runtime manifest. **Exit gate:** không có critical unresolved gate trong released scope; budgets/retention/ownership đã chốt; base release có supportable recovery. **Stop/rollback:** không đóng acceptance nếu cần secret/private command ngầm hoặc không restore được; giữ previous approved scope. **Phase report:** final support matrix, limitations, operational owners và next review triggers.

### 10.2 Dependencies song song và gates theo phạm vi

Phase IDs không đổi. “Bắt đầu được” dưới đây là work trong approved workspace/target, không là quyền sửa VPS hoặc PASS. Mỗi phase có thể có phần isolated sớm và phần integrated certification sau; report tách hai trạng thái, không gộp chúng.

| Phase | Có thể chuẩn bị hoặc triển khai isolated sau approval | Gate bắt buộc trước certification hoặc activation |
|---|---|---|
| EPG10-00 | Pin source/diff, scope, current audit và authorities ngay | Exact affected manifest + permissions + unresolved owner |
| EPG10-01 | Harness/metrics/sizing cùng 02; source-only hotspot inventory | Approved target; paired baseline, all-host budgets và runtime capacity |
| EPG10-02 | Catalogue, DTO, golden fixtures, metric metadata song song 01 | Source writer map; approved schema + runtime calibration/config của formula đã chọn khi exposed; numeric resource bounds trước release |
| EPG10-03 | Capture adapter/proof design và local fixtures sau 02 | Real DB commit/barrier/fence proof, write-cost bounds, source publication scope |
| EPG10-04 | Projector/staging/dedup/checkpoint với deterministic contracts sau 02 | 03 certified input + 01 Research capacity + fault/coverage receipts |
| EPG10-05 | BFF/history/fanout/browser adapters từ 02 + mock contract, song song 03/04 | 04 real data + 06 budgets + 08 read ACL/TLS trước mở route |
| EPG10-06 | Instrumentation, bounded config, cache/queue/query optimization cùng 03…05 | Candidate path + B0/B1/B2/coexist receipts + approved ceilings |
| EPG10-07 | Relay schema/denied-path/status fixture theo approved implementation scope | TS handler/trust/capital prerequisites, 04 receipts, 08 command security, operation certification |
| EPG10-08 | Read trust/revoke/TLS fixtures từ 02/05; command tests phát triển cùng 07 | Read scope không chờ command completion; enabled command phải có TS commit proof |
| EPG10-09 | Integrated harness/fixture/oracle chuẩn bị từ 02 | Read: 04/05/06/08-read; command thêm 07/08-command + impacted PM/G1; metrics thêm approved runtime calibration/input proof/oracle của formula đã chọn |
| EPG10-10 | Shadow/cutover/rollback plan chuẩn bị khi manifest ổn định | 09 đạt exact dataset/group/operation, explicit target approval, backups/fence/recovery; N1 cutover đợi F1 |
| EPG10-11 | Runbook/alerts/ownership tạo cùng implementation | 10 scoped rollout + operational drill/retention/acceptance evidence |

```text
00 ──┬── 01 baseline + ceilings ──────────────┐
     └── 02 schema/fixtures ── 03 capture ── 04 projection ── 05 read/fanout
             │                      │                  │          │
             ├── isolated 04/05     └──────────────────┴─────── 06 paired budgets
             ├── 08 read trust/TLS/revoke (parallel with 05) ─────────┤
             └── 07 command + TS prerequisites ── 08 command ──── optional command lane
04 + 05 + 06 + 08-read ── 09 scoped read E2E ── 10 read cutover ── 11 scoped handover
07 + 08-command + impacted PM/G1 ── 09 command E2E ── separate operation activation
qbts_prb_v1_1 + approved runtime config + Research module/oracles ── 09 metric E2E ── separate metric enable
```

`08-read`/`08-command` là scopes của EPG10-08, không phase IDs mới. Read-only release giữ 07 activation DISABLED có explicit scope decision, test denied-path và không quảng bá relay hoàn tất. Một PM P03/P13/P14 gap, source-publication gap hay N1 F1 issue chỉ chặn dependent path xác định; unresolved shared trust/correctness/resource gate vẫn chặn mọi exposed path dùng nó. Full guide acceptance cho relay phải có own 07/08/09 receipts; P19 mainnet live không là dependency của base read/Demo.

### 10.3 Gói công việc và handoff

Mỗi parallel lane cần owned files/modules, base SHA+dirty digest, contract version, allowed changes, tests, integration owner và evidence handoff. Schema contract được review trước implementation để không có hai DTO/score formulas. Rebase/merge chỉ sau dependency diff review và approval theo repo; không yêu cầu mỗi lane sửa cùng source file đồng thời.

Dùng `PARALLEL_IMPLEMENTATION_AGENT_PROMPTS_v1.2_VI.md` cho assignment thực thi; `EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md` cho manager surfaces; `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` cho decision/PM additive impact. Các companion không thay source manifest hoặc gate này. Handoff chỉ tuyên bố phần đã có receipt; implementation-ready khác runtime-ready và cutover-ready.

## 11 Decision register

Mọi decision dưới đây phải có owner, ngày UTC, evidence, accepted/rejected/deferred state và phạm vi. Baseline đề xuất giúp triển khai rõ ràng; không thay Bobby phê duyệt. Decision chưa chốt chặn đúng dependent feature, không cấm làm read-only analysis hoặc offline fixtures.

| ID | Quyết định | Baseline đề xuất | Cần chốt bằng gì | Khi chưa chốt |
|---|---|---|---|---|
| DEC-E01 | Scope release và mode/venue/profile | Read theo dataset + local/Demo command được chọn; P19 G2 mainnet optional riêng, P184 G2 performance giữ đúng gate | Supported-scope matrix và explicit release request | Live disabled; unavailable scopes không giả empty |
| DEC-E02 | Human/workload trust và business authority | Portal session/app grants; TS verified effective business membership, capital and owner authority | Trust issuer/audience, role mapping, DEC11-01/07, revocation policy | New mutation fail closed |
| DEC-E03 | Full catalogue và source publication | Expand approved producer families qua catalogue/permit; không generic DB access | Writer/query/source coverage và data classification | Family chưa certify có implementation PLANNED/RUNTIME_PENDING và served availability UNAVAILABLE |
| DEC-E04 | Ordering và snapshot barrier | Reuse migrations48/59/60/67 và journal nếu proof đủ | Multi-connection commit-order/capture/barrier receipts | Không claim global ordered/full replay |
| DEC-E05 | Placement lease failover và DR owner | Export/admission gần TS; projection/history/fanout trên Research có headroom | Capacity measurements, fence/lease semantics, backup/restore ownership | Không chuyển workload/writer |
| DEC-E06 | CPU RAM query IO và trading budgets | Baseline-relative reduction/non-regression theo mục9 | Actual metrics, host headroom và approved bounds | Optimization gate UNDECIDED |
| DEC-E07 | Per-family durable history và retention | Exact facts giữ theo business policy; replay window đủ outage; current snapshot sampled được gắn nhãn | Dataset-specific duration/storage/gap/backfill policy và cleanup permissions | Không xóa history hoặc quảng bá coverage ngoài proof |
| DEC-E08 | Per-dataset cadence freshness và revocation SLO | Event-driven exact facts; coalesce report state; bounded revoke enforcement | Measured ingest/write rates, approved lag/burst/stale bounds | UI stale; safety/mutation fail closed khi cần |
| DEC-E09 | Command publication activation và kill switch | Implement source rejection gap trước; operation/mode allowlist, current TS authority và receipt | Source review, N12 owner publication proof, E2E and release approval | Relay stays denied; no flag-only enable |
| DEC-E10 | TLS service authentication và rotation | Verify chain/hostname; reuse approved mTLS/JWT trust | Current config/runtime proof và security approval | No insecure fallback; affected route unavailable |
| DEC-E11 | Cashflow performance drawdown và finality | PM v1.1 semantics, exact flow-adjusted metrics với late correction lineage | Oracle và metric-version sign-off; P15.T05 gap được test | Affected score partial/invalid/policy_pending theo dependency; provisional chỉ khi math-complete nhưng evidence limited |
| DEC-E12 | Cutover recovery observation và ownership | Additive/shadow/fenced switch, recoverable read rollback, forward economic repair | Approved deployment package, thresholds, operator and escalation map | Feature dark/shadow; không destructive rollback |
| DEC-E13 | Runtime calibration/config và release của scoring đã chọn | Formula qbts_prb_v1_1, weights/bands đã duyệt theo SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md; shared Research module duy nhất | Approve immutable anchors/stress/block/maturity/grid/config artifact bằng calibration evidence; source proof, golden vectors, ACL/replay; Regime thresholds riêng | policy_pending/UNAVAILABLE cho numeric production chưa đủ config; không mở lại lựa chọn formula; independent core reads xét riêng |
| DEC-E14 | Archive paper monitoring | Research-only bounded jobs, explicit watch policy; no automatic promotion/live | Cadence/retention/admission/stop policy, resource benchmark và source availability | Archive catalogue/history vẫn đọc theo quyền; watch jobs chưa bật |
| DEC-E15 | Parallel read release và TS/DL coexistence | Scoped lane gates §10.2; 6k×2/9k×2 paired benchmarks §9.5 | Dependency proof; P184 G2 vs P19 G2 separation; N1 F1 impact; approved B-DL/B-EDGE ceilings | Affected activation blocked; offline/independent certified paths không global-block |

## 12 Acceptance traceability và evidence receipt

### 12.1 Cross-guide acceptance

| Shared ID | Hard invariant | Edge test coverage tối thiểu | Dependency bên ngoài | Evidence để đóng |
|---|---|---|---|---|
| XLC-01 | TS business authority; verified human/workload; no self-elevation | T00-03, T07-03/06, T08-01/03/04 | PM identity/membership/admission; Portal Profile & Access | Actor decision trace + denied cross-scope/no-effect proof |
| XLC-02 | Full authorised catalogue, correct source/history availability | T02-01/03/04/07, T05-04/05/06, T09-01/10 | Portal catalogue/BFF/UI metadata | Whole-traversal key/digest manifest và coverage table |
| XLC-03 | No lost/duplicate effect, checkpoint atomic, fenced generation | T03-01…05, T04-01…08, T10-01…05 | Portal projector/reconnect; TS transactional journal | Real DB/fault receipts + converged digest |
| XLC-04 | Same key one effect, accepted khác terminal, unknown recoverable | T07-01…06, T09-03, T10-03/04 | PM command contract; Portal receipt UI | Durable TS receipt + target version + transport timeline |
| XLC-05 | Revoke caches/streams/queued mutation và TS commit | T05-01/08, T08-01/02/03/04/07/08/09 | TS revision authority; Portal grant/session model | Revoke timeline, no forbidden read/commit |
| XLC-06 | Bounded resources, honest freshness, robust reconnect | T01-01…06, T05-02…08, T06-01…10 | Portal fanout/UI state and workload | Budget register + raw measurements + overload/recovery proof |
| XLC-07 | Capital flows không thành PnL; corrections/attribution exact | T07-05, T02-07/08, T09-01/02/04/07/08/09 | PM capital/economic semantics; Portal metric definitions | Golden financial oracle + report lineage/corrected output |
| XLC-08 | Claims đúng baseline/scope; rollback giữ truth; P184 performance G2 khác optional P19 mainnet | T00-01/02/04/05/06, T09-01…21, T10-01…05, T11-01…05 | Cả ba guide release manifest | Source/schema/runtime/TLS matrix + sign-off references |
| XLC-09 | Bobby/Stan full business read; Thanhvuong user-ID eligible discovery + approved restricted slice | T08-07/08/09, T05-01/08, T02-04 | Portal identity/field policy và PM verified read grants | Positive full-read controls + no hidden query/export/SSE/metric leakage |
| XLC-10 | Manager overview/Fleet metadata; stage/lifecycle separation, Archive/Paper-clone lineage, units/denominators | T02-09, T09-09/11, T05-06 | Manager UX companion, Portal DTO/actions, TS lifecycle authority | Versioned DTO vectors + authorized disposition receipts + exact original history |
| XLC-11 | One Research canonical score/regime owner; versioned inputs/corrections, bounded compute | T02-07/10/11, T06-08/10, T09-07/08/10/12…21, T11-05 | SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md + approved runtime config và shared Research module | Formula/source-set digest + golden oracle + resource/cache/correction receipts |

Txx trong bảng là viết tắt của `EPG10-Txx`; dấu `…` nghĩa là inclusive range của test được định nghĩa trong phase tương ứng, không là test đã chạy. Integration tests phải trỏ đúng partner test IDs khi các guide được triển khai; không invent PASS liên tài liệu từ contract review.

### 12.2 Receipt mẫu

Các paths dưới đây là **cấu trúc deliverable đề xuất khi chạy implementation**, không phải artifacts đã được tạo trong lần viết guide này.

```yaml
run_id: "<unique-run-id>"
case_id: "EPG10-T03-01"
status: "NOT_RUN"
observed_at_utc: null
source:
  ts_full_sha: "<verified-full-sha>"
  dl_full_sha: "<verified-full-sha-or-scoped-not-applicable>"
  pm_full_sha: "<verified-full-sha-or-scoped-not-applicable>"
  edge_portal_full_sha: "<verified-full-sha>"
  research_be_fe_shas: "<separate-verified-shas>"
  dirty_diff_digest: "<digest-or-clean>"
  untracked_file_digests: []
  binary_digest: "<verified-or-unknown>"
schema:
  applied_catalog_digest: "<verified-or-unknown>"
  migration_source_digest: "<separate-source-digest>"
environment:
  name: "<approved-test-target>"
  mode: "sandbox"
  venue_profile: "<approved-profile>"
  fixture_seed_digest: "<digest>"
  resource_config_digest: "<no-secret-config-digest>"
  resource_scenario: "<B0/B1/B2-or-not-applicable>"
  dataset_and_operation_scope: []
  formula_policy_digest: "<qbts_prb_v1_1-formula-hash>"
  runtime_calibration_digest: "<approved-or-policy-pending>"
  metric_registry_digest: "<verified-or-unresolved>"
  required_source_watermarks_digest: "<verified-or-unresolved>"
  stress_normalization_proof: "<receipt-or-not-run>"
permissions:
  approved_change_reference: "<approval-reference-if-required>"
inputs:
  precondition: "T1 obtains lower sequence and commits after T2"
expected:
  invariant: "Both committed effects exported without a hole"
observed:
  event_digest: null
  checkpoint: null
  source_continuity_epoch: null
  projection_generation: null
  queue_peak_bytes: null
  error: null
artifacts:
  raw_redacted_output: "evidence/<run-id>/raw/"
  fault_timeline: "evidence/<run-id>/timeline.json"
  metric_summary: "evidence/<run-id>/metrics.json"
reviewer: null
limitations: []
```

Không điền placeholder bằng guess để đóng gate. Test harness phải fail nếu expected invariant không được assert, command exit code không biết, fixture khác digest, hoặc mock được dùng thay external layer mà report vẫn gọi E2E.

### 12.3 Mẫu báo cáo mỗi phase

1. Phase, scope, start/end UTC, source/schema/runtime manifest và approved change reference.
2. Deliverables đã tạo hoặc thay đổi, exact files/contracts/migrations và compatibility impact.
3. Checklist completed/blocked; từng test receipt ID, status và reason.
4. Resource deltas và correctness/security invariants; phần nào là measured, historical hoặc chưa kiểm.
5. Remaining gaps theo dataset/operation/mode; ảnh hưởng tới phase tiếp và user-visible behavior.
6. Stop/rollback đã thử hay chưa, active generation/checkpoint, accepted command backlog cần giữ.
7. Quyết định cần duyệt; go/no-go cho scope tiếp theo, không tự mở rộng live scope.

## 13 Runbook vận hành

Các bước thay đổi state trong runbook chỉ được thực hiện trong phạm vi incident/deployment đã được Bobby phê duyệt. Nếu chưa có quyền cho target/action, thu thập read-only evidence an toàn rồi xin phép. Không đưa password, DSN, private key hoặc token vào ticket/report.

### RB-01 Lag tăng hoặc queue gần đầy

**Tín hiệu:** oldest-unexported age, source→projection lag, queue bytes hoặc pool wait vượt approved threshold.

**Chẩn đoán:** so source commit rate với exporter/consumer throughput; xác định TS query, network/TLS, Research DB, projection lock hay slow fanout. Kiểm cả bytes và events; một record lớn có thể làm RSS tăng dù queue count nhỏ. Xác minh source generation/cursor vẫn hợp lệ.

**Xử lý được duyệt:** pause/deprioritize backfill/report jobs, giảm fetch/concurrency để giữ trading budget, áp Retry-After/circuit breaker, drop/coalesce chỉ derived display notifications theo contract. Không drop fills/economic events, không tăng pool tới hết DB headroom. Nếu source durable storage có nguy cơ hết, chuyển RB-08.

**Điều kiện resume:** queue drain theo approved target, lag/freshness phục hồi và exact count/digest không gap; publish current degraded/ready status. **Evidence:** timeline, rates, config change reference và checkpoint trước/sau.

### RB-02 Cursor hết retention hoặc generation thay đổi

**Tín hiệu:** explicit cursor-expired/resync-required, unknown generation hoặc checkpoint không thuộc active manifest.

**Chẩn đoán:** đọc retention floor/manifest và consumer durable checkpoint; phân biệt event gap, source reset, scope change và corrupted local cursor. Không sửa cursor thủ công lên latest.

**Xử lý được duyệt:** giữ old projection stale nếu còn được phép đọc; tạo staging generation, bootstrap full authorised catalogue, consume certified overlap/delta, validate coverage/digest rồi atomic switch. History backfill thiếu được gắn gap cho tới hoàn tất. Không replay command side effects.

**Điều kiện resume:** source and projection generation match, consistency groups complete và checkpoint vượt approved catch-up barrier. **Evidence:** resync reason, old/new cursor, page digests, switch receipt và workload cost.

### RB-03 TLS hoặc workload authentication thất bại

**Tín hiệu:** certificate expiry/hostname/chain error, rejected issuer/audience, repeated 401/403 với workload route.

**Chẩn đoán:** kiểm clock, endpoint hostname, nonsecret certificate metadata/trust config và token metadata qua safe tooling; phân biệt network timeout với auth denial. Không đọc private key hoặc full bearer token để đưa vào report.

**Xử lý:** route fail closed, phục vụ stale reads chỉ khi policy cho phép; yêu cầu owner xử lý credential/trust rotation trong approved security flow. Không disable Rustls verification, bật insecure flag hoặc chuyển qua plaintext/private bypass route.

**Điều kiện resume:** verified TLS/auth smoke cùng principal/scope, reconnect/replay thành công không gap. **Evidence:** safe error fingerprint, issuer/audience reference, cert dates/hostname và authorized rotation receipt.

### RB-04 Command outcome unknown

**Tín hiệu:** request timeout/disconnect sau send, receipt mirror chưa có terminal, hoặc ACCEPTED quá operation-specific threshold.

**Chẩn đoán:** tìm original scoped idempotency key/digest và command ID; query TS authority receipt/status, không chỉ Research mirror. Kiểm active generation và operation still pending/encumbered hay handler unavailable. Query not-found trên stale replica không là no-effect proof.

**Xử lý:** retry status lookup với bounded backoff; nếu relay retry được phép thì cùng key/digest, không tạo key mới. Sau retention ambiguity boundary, dừng new request và reconcile source effects/receipt với operator. Cancel chỉ phần pending theo domain policy và user authority; không undo applied amount.

**Điều kiện resume:** authoritative terminal receipt hoặc explicit still-pending state với owner; projection/UI khớp target version. **Evidence:** full transport timeline đã redact, key/digest reference, TS receipt và invariant requested/applied/pending/cancelled/rejected.

### RB-05 Thu hồi quyền chưa lan tới cache hoặc stream

**Tín hiệu:** auth revision mismatch, user vẫn nhận scoped updates, invalidation lag vượt budget hoặc queued command dùng revision cũ.

**Chẩn đoán:** pin revoke commit revision/time tại TS; kiểm BFF cache namespace, session/app grant và business grant riêng; xem queue recheck và active subscriptions. Không mở scope để thử bằng account khác chưa được phép.

**Xử lý được duyệt:** close affected streams, invalidate exact scoped cache, fence affected command path, force current-authority revalidation. TS commit check phải tiếp tục deny; nếu có unauthorized effect thật, coi là security incident và preserve evidence, không tự đảo financial state.

**Điều kiện resume:** all affected surfaces deny/read-scope đúng revision, positive controls cho unaffected users vẫn hoạt động. **Evidence:** actor/scope/revision timeline và no-forbidden-effect/read proof; report discretely theo authorized audience.

### RB-06 Financial mismatch correction hoặc history gap

**Tín hiệu:** projection digest lệch source, reconciliation break, capital/equity/PnL không khớp, same-event-ID different digest hoặc missing history interval.

**Chẩn đoán:** so immutable source identities, dataset coverage, currency, binding/owner effective intervals, correction references và metric version. Kiểm duplicate joins và event-time/recorded-time trước kết luận source sai.

**Xử lý:** quarantine affected projection/group và mark report partial/stale/invalid theo dependency; score không được gọi provisional khi inputs hỏng; preserve source facts. Rebuild read model hoặc apply explicit correction đã được authority phát hành; không sửa SQL balance/journal từ Research. Same-ID integrity conflict yêu cầu authority owner điều tra trước advance checkpoint.

**Điều kiện resume:** exact source-derived reconciliation và golden oracle pass, gap resolved hoặc được công bố rõ. **Evidence:** source/consumer record IDs, digests, correction lineage, old/new report version và reason.

### RB-07 Failover hoặc nghi hai projection writers

**Tín hiệu:** lease conflict, stale generation write attempts, duplicate cursor ownership hoặc both workers report active.

**Chẩn đoán:** đọc current durable fence/generation và writer identities; không dựa solely process liveness hoặc wall-clock lease expiry. Xác định generation nào đã commit checkpoint/data.

**Xử lý được duyệt:** fence losing writer tại durable store, pause new activation cho tới chứng minh single writer. Promote standby chỉ với checkpoint/generation contract; old worker sống lại phải bị reject. Command receipt authority vẫn là TS, không promote Research thành writer business.

**Điều kiện resume:** one valid writer, replay from durable checkpoint converges, no lost committed events. **Evidence:** lease/fence transitions, rejected stale writes, failover timeline và recovery digest.

### RB-08 Storage pressure retention hoặc backup failure

**Tín hiệu:** journal/spool/projection disk high watermark, WAL retention growth, oldest-unexported age quá outage target hoặc restore check fail.

**Chẩn đoán:** tách exact business history, replay buffer, projection derived state, logs và backups; xác định largest growth source và free-space runway với rate thực. Không xóa journal theo tuổi khi chưa biết consumer ACK/coverage.

**Xử lý được duyệt:** pause backfill, giảm nonessential report/log volume theo policy, archive/cleanup chỉ đúng retention đã duyệt; request capacity nếu cần. Expire slow consumer theo contract có resync rõ; không báo full history nếu đã tạo gap. Cleanup irreversible cần approval đúng loại trước hành động.

**Điều kiện resume:** safe headroom, valid restore/replay và active consumers trong retention envelope. **Evidence:** size/rate/retention decision, cleanup scope, before/after coverage và restore drill.

### RB-09 Source publication hoặc command gate chưa sẵn sàng

**Tín hiệu:** family có implementation PLANNED hoặc availability UNAVAILABLE, N12 owner publication pending, runtime config gate denied, Edge rejects command relay enable.

**Chẩn đoán:** đọc source/release matrix và current permitted manifest; xác định missing writer/authority, TS route binding, identity proof hay Edge implementation. Không kết luận một cờ default false là toàn bộ blocker.

**Xử lý:** giữ feature denied/dark, hiển thị unsupported reason an toàn, tiếp tục read paths đã certify. Chuẩn bị implementation/approval package cho đúng missing capability; không generic proxy tới DB hoặc gọi direct source route ngoài allowlist.

**Điều kiện resume:** approved source changes, TS owner publication and config prerequisites, TLS/auth, E2E receipts và explicit activation theo operation/mode. **Evidence:** versioned catalogue/permit, source diff, gate check và deployment receipt.

## 14 Stop conditions và release checklist

### 14.1 Dừng affected path ngay khi có

- Lost committed event, cursor gap bị che, same-ID digest conflict hoặc projection checkpoint đi trước data.
- Unauthorized read/command, revoked actor vẫn commit, protected owner/self-elevation bypass hoặc credential xuất ra ngoài boundary.
- Duplicate financial effect, amount invariant sai, correction overwrite mất lineage hoặc cross-mode/venue/profile merge.
- Second active writer không bị durable fence chặn, source generation reset bị consumer bỏ qua.
- Resource/trading critical-path budget vượt approved limit, queue/memory growth không bounded, disk runway không đáp ứng recovery.
- TLS verification fail hoặc chỉ hoạt động khi dùng bypass; source/schema/runtime mismatch làm evidence hết hiệu lực.

Stop không tự nghĩa là kill trading service. Dừng feature/export/relay path bị ảnh hưởng theo approved incident plan; preserving execution/reconciliation obligations thuộc TS authority. Điều gì có thể dừng an toàn phải được drill trước cutover.

### 14.2 Checklist phát hành

- [ ] Exact source/runtime/schema/TLS matrix có thời gian và source digests; no unresolved critical mismatch.
- [ ] Catalogue full coverage/availability/history declared, per-family writer/authority/publication gate được map.
- [ ] Commit coverage, barrier, replay, dedup, correction, tombstone, retention, resync và fencing có real evidence.
- [ ] Every exposed read/stream/cache có scope và revoke behavior; Bobby/Stan business-read và Thanhvuong approved own-slice policy có receipts; every enabled command có current TS authority và durable receipt.
- [ ] Capital payload/states giữ nguyên PM v1.1, no direct SQL/execution bypass, no implicit live activation.
- [ ] CPU/RAM/query/IO/freshness/recovery budgets TS/DL/Edge/Research được chốt và đo baseline/candidate; no hidden data ceilings.
- [ ] B0/B1/B2 6k×2/9k×2 coexist receipts khi applicable; P184 performance G2 không lẫn optional P19 mainnet, N1 F1/cutover status được giữ đúng.
- [ ] Canonical scoring chỉ một Research implementation, final specification và approved runtime calibration/config; Regime Fit giữ support policy riêng; input lineage/ACL/corrections/window/oracle complete trước enable.
- [ ] Archive watch cadence/retention/quota/stop policy approved; no auto-live/promotion/capital mutation.
- [ ] Dataset-specific read release không phải global command/N1 acceptance; every scope dependency và unavailable reason được công bố.
- [ ] Full catalogue traversal, historical completeness và financial metric oracle được kiểm, source gaps được hiển thị đúng.
- [ ] Shadow/cutover/rollback/restore drills pass trong approved scope; facts và accepted commands được giữ.
- [ ] Runbook owners, alerts, certificate/retention review và source-change invalidation rules đã bàn giao.
- [ ] Release note nói rõ implemented source, measured runtime, enabled scope và remaining planned work.

## 15 Versioning và cách cập nhật guide

V1.2 thay toàn bộ wording công thức candidate/pending-selection của v1.1 bằng single approved design `qbts_prb_v1_1`, direct economic PortfolioScore, provisional/partial semantics và cross-stage continuity có điều kiện. Resource/source facts, XLC-01…11 và EPG10-00…11 giữ nguyên phạm vi; tests mới bổ sung không thay receipts cũ. Runtime anchors/stress/maturity/support thresholds vẫn chờ calibration/config evidence và approval; việc soạn guide không chứng nhận production readiness.

Patch version sửa diễn đạt/source locators mà không thay protocol; minor version thêm compatible field/dataset/capability; breaking schema hoặc authority semantics cần major contract migration với dual-read compatibility và replay strategy. Phiên bản tài liệu và phiên bản wire contract là hai thứ khác nhau.

Mỗi lần source branch, schema, publication manifest, trust policy, mode/profile allowlist hoặc metric definition đổi, thực hiện impact analysis tới XLC/test families. Chỉ rerun những impacted tests nếu có dependency proof; khi không xác định được scope, mở rộng rerun thay vì reuse toàn bộ historical PASS.

Guide này cung cấp kế hoạch triển khai và acceptance, không chứng nhận production hiện tại. Tất cả test mới vẫn **PLANNED / NOT RUN** cho tới khi có receipts đúng manifest. Full history/replay, command relay và business membership/capital authority chỉ được công bố hoạt động trong đúng scope đã được source, runtime và E2E evidence xác minh.

### Tương thích metric basis với scoring companion

Canonical scoring dùng `comparable_basis_id` cho điều kiện có thể so sánh (verified economic domain, series_kind, window/frequency, currency/cost/return/calibration policy; stage giữ trong provenance và không tự gây incompatibility) và `individual_evidence_binding_id` cho alpha/version/params/research run/data snapshot cụ thể. Các alpha khác nhau phải có binding riêng nhưng vẫn có thể cùng comparable basis. Field `basis_id` trong DTO/fixture minh họa hoặc adapter cũ của guide này, khi dùng cho scoring, là compatibility alias **chỉ** của `comparable_basis_id`; không đưa identity riêng của alpha vào comparison key. Public canonical schema mới xuất cả hai trường và deprecate alias có version. Không dùng label stage để suy economic domain.

NAV coverage chỉ xuất khi allocation values được chứng minh là partition của **current NAV cùng valuation/currency/time basis**. Economic assigned capital 100 và current NAV 90 sau lỗ có thể hợp lệ; khi chưa có partition proof trả coverage null với basis-mismatch/not-applicable, không tự báo double-count hoặc clamp về 100%. Weight basis đã chọn là allocated economic capital; source/attribution mapping vẫn phải verified; risk budget, exposure cap và native margin không thay economic allocated capital.
