# Hướng dẫn triển khai backend và hợp đồng dữ liệu Execution Loop Portal v2

Tài liệu đồng hành với TS Portfolio Account Management v1.1, Execution Portal Edge Upgrade v1.2 và bộ đặc tả Manager UX cùng score và regime

- **Phiên bản:** 1.2
- **Ngày:** 2026-10-15 UTC
- **Đối tượng:** Bobby, người triển khai Portal BFF và Edge, TS backend, người thiết kế HIFI và người nghiệm thu
- **Trạng thái:** công thức, trọng số và bands scoring ở companion v1.1 đã được chọn; runtime calibration/config, field disclosure và activation gates còn phải hoàn thiện đúng phạm vi. Đây là cập nhật tài liệu; chưa sửa code, migration, cấu hình hoặc dịch vụ
- **Đầu ra:** Fund Overview, Portfolio Overview và Alpha Fleet ưu tiên manager; quyền đọc theo business scope; contracts dữ liệu và score/regime có provenance; command bridge có receipt; 12 phase và gates theo endpoint
- **Test mới trong tài liệu:** `ELP2-Txx-nn`, toàn bộ **PLANNED / NOT RUN** cho đến khi có execution receipt gắn đúng source và môi trường
- **Phạm vi release:** chức năng Portal v2 được chọn, cùng contract tương thích với TS và Edge; không tự bật giao dịch thật

## 1 Kết luận và cách dùng

Portal v2 cần được xây như một ứng dụng quản trị có backend và hợp đồng dữ liệu riêng. Chỉ thêm màn hình gọi API hiện hữu sẽ không giải quyết được quyền own/shared/cross-scope, dữ liệu tổng hợp đúng thời điểm, truy vết command hoặc thu hồi quyền trên cache và stream. Bản nâng cấp phải đồng thời làm bốn việc: chuẩn hóa quyền theo resource; xuất bản catalogue dữ liệu TS có grain và chất lượng rõ; xây read model có giới hạn tài nguyên; nối thao tác người dùng vào authority TS với trạng thái kết quả kiểm chứng được.

Tận dụng stack và source Portal hiện có: React/Vite, NestJS/Fastify BFF, Edge Rust Axum/Tokio/Postgres, danh tính và session hiện có. Không tạo hệ đăng nhập thứ hai; không sao chép economic ledger hoặc risk kernel sang Portal. TS tiếp tục quyết định tiền, budget, reservations, membership nghiệp vụ và admission. Portal quyết định đăng nhập, hồ sơ, session và quyền dùng ứng dụng; quyền thao tác nghiệp vụ còn phải được TS chấp nhận tại authority.

Luồng sản phẩm ưu tiên người quản lý: Fund Overview → Portfolio Overview → Alpha Fleet → drill-down Portfolio/Alpha/Account 360. Bobby và Stan phải xem được toàn bộ nghiệp vụ trong phạm vi hệ thống; quyền đọc này không tự cấp mutation, user administration, maintenance hoặc development. Thanhvuong chỉ discover portfolio khi có alpha liên kết với chính researcher owner `user_id` của mình; nội dung bên trong là lát cắt đã lọc an toàn và tập metrics hạn chế, không phải full portfolio. Chi tiết field matrix ở §4.8 là đề xuất cần duyệt trước xuất bản dữ liệu.

Người triển khai đọc theo thứ tự: baseline ở chương 2; ranh giới authority và quyền ở chương 3–5; contract và dữ liệu ở chương 6–9; màn hình và command ở chương 10–12; phase và gates ở chương 15–17. Người thiết kế HIFI dùng chương 10–12 và fixtures chương 14, không cần tự suy ý nghĩa các trạng thái kinh tế từ tên nút.

### 1.1 Bộ tài liệu chia trách nhiệm

| Tài liệu | Quyết định chính | Tài liệu này sử dụng thế nào |
|---|---|---|
| `TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1.md` bản R2 hiện hành trong PM worktree ở §2.1 | Entity, authority TS, capital và budget semantics, membership nghiệp vụ, accounting, admission, PM gates | Nguồn chuẩn; không dùng bản Library/TS worktree cũ trước R2 để ghi đè dispositions đã duyệt |
| `EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` | Gateway/Edge transport, integration, compatibility, recovery và deployment bridge | Nguồn chuẩn cho cách đưa dữ liệu và command qua biên hệ thống |
| Tài liệu này | Portal governance, manager-first datasets, API payloads, field policy, workflows, resource budgets và 12 phase Portal | Contract nguồn cho UI, không đổi financial payload hay lặp engine TS |
| `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` | Formula/bands đã chọn: raw QBTS, attribution, allocation-weighted AlphaScore, direct economic PortfolioScore và Regime Fit độc lập | Pin `qbts_prb_v1_1`, `quality_bands_v1_1`, compatible windows/basis và runtime calibration artifact; không fork formula trong Portal |
| `EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md` | Information architecture, HIFI, interaction và fixture screens | Tham chiếu schema/fixture IDs trong guide này; không tự phát minh field hoặc tính score trong browser |
| `PARALLEL_IMPLEMENTATION_AGENT_PROMPTS_v1.2_VI.md` | Prompts theo owner/scope và dependency graph | Dùng phases/gates/schema đã pin; mọi repo/VPS mutation cần approval riêng |
| `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` | Quyết định đã chốt, config/gates còn mở và PM delta | Không mở lại formula/bands hoặc PM R2; rehearsal/probe không là production approval |
| `SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md` | Source/input gaps và tính khả thi triển khai scoring | Dùng để lập dependency/readiness theo metric; không biến gap Regime/grouping/raw alpha thành global NAV-score gate |

Khi hai tài liệu chưa khớp, ghi contract decision và chặn đúng chức năng bị ảnh hưởng. Không sửa nghĩa tiền để làm UI thuận tiện hơn, cũng không khóa toàn bộ Portal chỉ vì một advanced metric chưa được chứng minh.

### 1.2 Phạm vi bắt buộc và phần không kéo vào release

Bắt buộc: Fund Overview; Portfolio Overview; Alpha Fleet; Profile & Access; Portfolio 360; Alpha 360; Account/Broker 360; catalogue có coverage; scoped list/detail/search/export/stream; capital statement và command status; assignment/binding readiness; lineage và audit; migration, recovery, performance evidence.

Không thuộc release Portal v1.2 mặc định: arbitrary portfolio tree, contributor percentage, investor accounting, payroll, custom report builder, tạo tài khoản sàn, native transfer, đổi margin mode, nhập hoặc xoay secret, tự liquidation, tự nâng leverage hoặc budget theo lợi nhuận. Mô hình portfolio riêng giao researcher được hỗ trợ bằng cùng membership model; không cần engine A/B riêng. Drawdown/return/Sharpe chỉ xuất bản khi phương pháp và chuỗi dữ liệu đã đạt gate, không biến thành dự án metrics nâng cao bắt buộc.

### 1.3 Quyền triển khai

Phê duyệt tài liệu không phải phê duyệt sửa repo hay VPS. Mọi gói sửa code, file, schema, cấu hình hoặc trạng thái dịch vụ trên repo/VPS cần Bobby phê duyệt trước với target, tác động, kiểm tra và rollback cụ thể. Các lệnh SQL và JSON trong đây là contract đề xuất, không phải lệnh đã chạy. Source review là read-only; không suy test pass từ việc tìm thấy test file.

## 2 Baseline và bằng chứng nguồn

### 2.1 Baseline cần pin trước mỗi phase

Snapshot ngày 2026-10-15 dưới đây thay baseline triển khai ngày 2026-10-10. Đây là các mốc source/evidence được ghi nhận trong đợt rà soát; runtime, migrations và activation cần receipt riêng. Các test ELP2 mới vẫn PLANNED / NOT RUN.

| Thành phần | Mốc ngày 2026-10-15 | Giới hạn kết luận |
|---|---|---|
| Portal main và dev | `533162635f56584d630e3d971d77d50860595f15`; stable repo `/home/bobby/portal-main-release` | Main/dev source cùng pin; không tự suy deployed build |
| Portal release tag lịch sử | `v1.1.1` tại `e4fd93658de1ff0614126a85d70e59a23c25a01f` | Giữ để kiểm compatibility; không coi tag và HEAD là một |
| TS N1 worktree | `/home/bobby/.worktrees/trading-system-next-upgrade`, `feat/v2-rust-first-okx-demo`, `6c5a1df3597b9753eb2d90eae3233d696900d420`; dirty N1 runner/test và untracked PM guide | Receipt phải kèm dirty diff digest; không gắn kết quả của working tree vào clean commit giả |
| Data Loop closure | `/home/bobby/.worktrees/data-layer-p184-closure`, `fix/p184-dl-closure`, `f8e5442fa85e8e0a10f4407e0ca3bd1257f6543b`, clean | Data Loop closure evidence riêng; không thay N1 readiness |
| PM R2 worktree | `/home/bobby/.worktrees/trading-system-pm-v1_1`, `feat/portfolio-account-v1_1-parallel`, `d16aa2b5f251596e469807f57e81fe14cdc7e763`, clean | Economic backing, margin-risk budget và independent exposure cap; không global 1x gross-notional |
| Research backend source map lịch sử | `/home/bobby/portal-research-be`, `codex/be-gaps`, `fdea081d912854223499e995e6bd4b4482229249`, clean tại lượt đọc cũ | Locators §2.3 giữ đúng pin cũ, không gán lại line numbers sang HEAD mới |
| Research backend targeted input audit mới | `/home/bobby/portal-research-be`, `codex/be-gaps`, `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1` | Targeted input evidence §2.3.1; source-only, dirty/deployed/config status cần receipt hiện hành trước triển khai |
| Research frontend | `/home/bobby/portal-research-fe`, `claude/fe-parity`, `051eeb89a8105d9f76032422c75821d7af98d1e2`, clean | Source parity/design reference; không tự merge, release hoặc chứng nhận Execution integration |

Mỗi evidence chứa repo/path, branch, commit, dirty state/digest, relevant runtime/config fingerprint và thời điểm đọc. Paths/branch chưa có trong receipt phải được bổ sung trong ELP2-00, không đoán từ commit. Khi HEAD đổi, chỉ reuse test nếu chứng minh đường code/schema/config liên quan không đổi; nếu không, chạy lại đúng phạm vi sau phê duyệt.

**Trạng thái bằng chứng được phép phát biểu:** N1 B6 capacity `6k × 2` và `9k × 2` PASS, nhưng core-kill F1 convergence còn mở nên N1 **NOT READY**. PMA15 fresh rehearsal đã ghi nhận 101 migrations, 11 candidates và 106 pytest PASS. P16 bốn PostgreSQL probes PASS chỉ chứng minh bốn probes, không phải full P16 campaign; trust/exporter adapter integration thực còn pending. Không chuyển các số này thành ELP2 PASS hoặc end-to-end Portal readiness. Performance G2 là gate hiệu năng bắt buộc trong scope phù hợp; nó khác mainnet-canary G2 tùy chọn ở §16.4.

Có thể bắt đầu contracts, synthetic fixtures, thiết kế UI và read-only adapters theo từng endpoint ngay, không đợi toàn N1/P16 đóng. Chỉ kích hoạt endpoint/mutation sau đúng dependency proof của nó; commands chưa certified vẫn disabled và fail closed.

### 2.2 Source map và điểm mở rộng

Bảng source locators dưới đây giữ provenance của review read-only ngày 2026-10-10; cần đối chiếu với pins ngày 2026-10-15 trước implementation. Review tài liệu này không chạy Docker/DB, build, test hoặc migration. Các nhãn sau dùng thống nhất: **SOURCE VERIFIED** là code/schema/contract có trong source; **PROPOSED** là target cần xây; **RUNTIME UNVERIFIED** là chưa có bằng chứng đang chạy/applied.

| Baseline liên quan | Branch và commit | Cách dùng |
|---|---|---|
| TS source snapshot lịch sử | `/home/bobby/.worktrees/trading-system-next-upgrade`, `feat/v2-rust-first-okx-demo`, `faf6f8480b5dff532b87fa0a60c59d1f2a29458f` | Locators lịch sử cho publication/command; không thay TS/PM pins 2026-10-15 |
| TS canonical cũ | `/home/bobby/trading_system`, `668e103`, dirty | Không dùng làm baseline triển khai |
| Portal nghiên cứu | `/home/bobby/portal-research`, `docs/research-loop-plan`, `99a2eb73214ab31598a6aa8cbb5b38c02272d813`, dirty/ahead 388 | Qualification EDS12/N29; không thay Portal stable hoặc Edge core |
| Manager v2 lịch sử | `feat/manager-v2-paper-read`, `54c6f5f3` | Read/maximum-data request reference |
| Data activation lịch sử | `feat/execution-data-activation`, `6f6503ea` | Handoff/activation contract reference |
| Current BFF lịch sử | `feat/eds-current-bff`, `bab79402` | Current-page BFF reference |
| Owner-return lịch sử | `docs/eds09-ts-owner-return-handoff`, `ec97c483` | Handoff reference |
| R4/R5 lịch sử | `deploy/r4r5-activation`, `d63a6501` | Profile prep/historical evidence |

Tại review 2026-10-10, source publication được đọc ở TS `faf6f848`; không dùng kết luận “không có branch mới hơn” làm phát biểu hiện tại. Historical branches và runtime manifest capture 2026-09-04 không chứng minh deployment 2026-10-15. Research BE/FE mới trong §2.1 là nguồn reuse có kiểm soát, không tự thay Execution baseline.

| Vùng source | Exact references | Kết luận và điểm mở rộng |
|---|---|---|
| Unified Portal plan | `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` §17, §17.2, §17.3, §17.5, §20 | SOURCE VERIFIED. Census 96 relations/5 GET primitives/104 gateway ops và 34 fields là plan inventory lịch sử, không phải current completeness proof |
| Relation/capability analysis | `upgrade/backend/EX_BE_21_N18_MANAGER_RELATION_CAPABILITY_CENSUS.md`; `EX_BE_31_N28_GENUINE_MISSING_CAPABILITY_ADAPTERS.md` | Đầu vào map gaps, không thay fresh route/dataset tests |
| Profile và lifecycle | `apps/control-api/src/admin/{owner-access,governance-grants,account-lifecycle}.*`; migrations `0034-owner-anchor`, `0035-account-lifecycle`, `0036-governance-grants` | SOURCE VERIFIED. Reuse owner singleton, lifecycle, revisioned grants; không greenfield auth |
| Current/read/history | `apps/control-api/src/execution/{current-source.controller.ts,profile-read-adapter.controller.ts,profile-history.controller.ts,resource-read/*,maximum-data-operation.controller.ts}` | SOURCE VERIFIED. Mở rộng field/rights/cutoff adapters theo catalogue |
| Mirror và realtime | `apps/control-api/src/execution/durable-mirror-integrity.controller.ts`, `realtime.controller.ts`; Edge `realtime-sse` crate | Route/design có mặt; runtime và per-family history chưa chứng minh |
| Analytics và BFF | `apps/control-api/src/execution/{analytics.controller.ts,financial-chart.controller.ts,market-candles.controller.ts,market-context.controller.ts,portal-derivations.controller.ts,operational-composition.controller.ts}`; `operations/incident.controller.ts`, `governance/*`, `manager-lists/*`, `screen-bff/*` | Reuse composition hiện có; `screen-bff/catalogue.ts` ALPHA/PORTFOLIO/ACCOUNT không tự là business ACL |
| ADMIN còn trực tiếp | `apps/control-api/src/facade/facade.controller.ts:220`; `execution/analytics.controller.ts:51`; `execution/realtime.controller.ts:61`; `execution/r3-governed-command-ledger.ts:110,139` | Refactor inventory bắt buộc; rà thêm commands/PaperExit/callers trước đổi gate |
| TS portfolio/binding | `init-db/11-portfolio-management.sql`; `services/portfolio_management/{repository.py,account_sync.py,sync_storage.py}`; migrations 24,35,49,55 | SOURCE VERIFIED existing models, chưa chứng minh PM v1.1 memberships/owner ACL |
| TS publication | `init-db/48-v2-source-change-journal.sql`, `59-v2-source-commit-order-replay.sql`, `60-v2-source-journal-paper-reader.sql`, `67-v2-p16-consumer-publication-controls.sql`; `domain/{source_change_journal.py,consumer_publication.py}`; `services/source_change_journal/{repository.py,consumer_repository.py,publication_repository.py,read_source.py,restore.py,writer.py}` | SOURCE VERIFIED; immutable catalogue/manifest/evidence, mutable drain/revoke và secret-shaped-field rejection hiện diện; runtime chưa chứng minh |
| TS identity/catalogue | `services/portal_execution_owner/identity/{policy.py,manager.py}`; `services/portal_execution_owner/catalogue.py` | Source-dark, runtime_enabled mặc định false; human/workload mapping phải certify |
| TS command | `init-db/46-portal-command-paper-r1.sql`; `services/portal_execution_owner/command/{catalogue.py,adapter.py,issuer.py,runtime.py,server.py,durable_port.py,artifacts.py}` | Config-gated command admission/status/receipt source; route binding, feature enable, kill-switch và mTLS/JWT gates không được bỏ |
| Edge reuse | `services/portal-execution-edge-rs/README.md`; `crates/{ts-adapter-v1,edge-auth,ts-transport,projection-core,projection-store-pg,edge-service}`; `deploy/compose.execution-edge.yaml` | GET allowlist, JWT delegation, bounded transport, projection foundations có source; sensitive flags mặc định false |
| Edge durable history | `crates/projection-store-pg/migrations/0007_d4_source_checkpoint`, `0008_shared_consumer_lease`, `0009_retention_recovery_cleanup`, `0012_manager_projection`, `0014_manager_realtime_cycle_journal`, `0017_eds09_authoritative_event_store`, `0018_eds11r_event_log_anchor` | Schema source hiện diện không chứng minh migration đã apply hoặc full durable history |
| Edge current-page limits | `contracts/maximum-data-return-v1/SOURCE_PUBLICATION_PLAN.json`; `e7-resilience-capacity.v1.json` | Fixed Manager request tối đa 200 rows/1 MiB; P/S max safe 1/L2 là current-page evidence, không global replay/SLO |
| Edge command relay | `crates/edge-service/src/main.rs`; `contracts/n12-command-relay-v1-request/README.md` | Main từ chối enabled command relay; gate/template hoàn tất nhưng owner publication pending, production inactive theo contract |

**Source-declared existing routes, runtime chưa xác minh:**

- `/api/v1/execution/current-source/:environment/screens/:screenId`
- `/api/v1/execution/history/:environment/:relationKey`
- `/api/v1/execution/resources/{alphas|portfolios|accounts|bindings}/:resource_id`
- `/api/v1/execution/durable-mirror/integrity`
- `/api/v1/execution/manager/deployments`, `/operations`, `/current/:operationId`
- `/api/admin/profile-access`, `/api/admin/accounts`
- TS `/portal/execution/v1/command-plans/paper/halt`, `/portal/execution/v1/command-operations/*`

Source topology §17.3 là Browser BFF → SGP read model/cache → private HK Rust Edge `/internal/v2/manager/*` → source proxy → TS. `deploy/execution-d1/source-proxy/manager-v2-locations.conf.template` hiện giới hạn `manager-paper-read`; proxy giữ mTLS credentials. Mở dataset/mode mới cần approved publication/allowlist, không biến thành generic TS proxy.

Targeted review lịch sử tại TS `faf6f848` chưa thấy implementation PM v1.1 alpha-owner/business-membership ACL tương ứng; nhận định này không phủ nhận phần PM mới ở pin §2.1, nhưng integration phải chứng minh riêng; migration 48 defer membership đến writer/publisher admission. Đây là dependency xây TS authority, không phải lý do Portal tự nhận authority. P15.T05 trong Unified Plan khoảng dòng 26450 nêu flow-adjusted return nhưng drawdown raw; fixture chương 14 phải giữ gap này hiển thị.

### 2.3 Targeted source audit ngày 2026 10 15

Các locators sau lấy từ targeted read-only audit cùng bundle, chi tiết tại `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` §8. Paths relative đúng worktree/commit ở §2.1: BE `fdea081d912854223499e995e6bd4b4482229249`, FE `051eeb89a8105d9f76032422c75821d7af98d1e2`, PM `d16aa2b5f251596e469807f57e81fe14cdc7e763`. **Runtime/deployed UI, mounted business authority và actual exporter/trust integration chưa được xác minh bởi lần đọc này.** Không đổi source-present thành deployed/completed.

| Source | Exact relative locator | Finding và reuse hoặc gap |
|---|---|---|
| BE existing Manager routes | `apps/control-api/src/manager-lists/manager-lists.controller.ts:18-76` | GET `/api/v1/execution/alphas`, `/portfolios`, `/broker-bindings` có source; ưu tiên adapter thay greenfield route |
| BE Fleet schema và access | `apps/control-api/src/manager-lists/contracts.ts:5-23,62-88,129-175`; controller trên `:70-76` | Stages Paper/Sandbox/Live, allocation/balance/PnL/paper-performance có source; workspace/ADMIN-USER gate chưa có researcher owner-user-ID row ACL, Canary và new field metadata cần bổ sung |
| BE refresh/coalescing | `apps/control-api/src/manager-lists/manager-lists.service.ts:28-33,336-456` | 5-second snapshot expiry, coalesced refresh có thể reuse; fanout 8 relations/profile và Paper performance là hotspot cần đo |
| BE persisted fleet | `apps/control-api/src/manager-lists/manager-lists.repository.ts:135-163` | Delete toàn scope rồi insert lại; xem xét changed-key upsert/delete với correct tombstones/checkpoints, không sửa nếu chưa approval |
| FE requested columns và filters | `apps/portal/frontend/src/execution/screens/AlphaFleet.tsx:29-31,125-135,222-255` | Các cột gần yêu cầu hiện hữu; còn Research stage, owner/stage filter sau nhận list; thiếu QBTS và full server sort/group-by contract |
| FE stage pipeline | `apps/portal/frontend/src/execution/fleetPipeline.ts:1-11,16-24,81-88` | Current deployment projection, chưa immutable stage history đủ cho regime/Archive lineage |
| FE route/preview mapping | `apps/portal/frontend/src/app/PortalRoutes.tsx:53-83,170-251`; `apps/portal/frontend/src/execution/previewRegistry.ts:1-56` | Preview-gated source; không chứng minh màn này đang phục vụ production |
| Research evidence và deployment boundary | `apps/control-api/src/research/release-candidate.service.ts:365-371,428-443`; `apps/control-api/src/research/journey.descriptor.v3.ts:102-112` | Run/version/parameter evidence có nền reuse; execution deployment out-of-scope, venue/account/capital GateR2 chưa là immutable deployment-binding proof |
| PM business read foundation | `services/portfolio_management/membership_contract.py:1-7,21-40,64-161`; `services/portfolio_management/membership_repository.py:103-161` | Candidate owner user_id, report.read và scopes; không còn nói “PM chưa có code”, nhưng mounted runtime/exporter integration phải chứng minh |
| PM instance lifecycle | `services/portfolio_management/instance_contract.py:101-144` | REGISTERED_UNFUNDED → MATERIALIZED_HALTED → ARCHIVED có candidate contract; archive-continuing-paper clone chưa được source này chứng minh |
| Edge data/commands defaults | `services/portal-execution-edge-rs/crates/edge-service/src/main.rs:362-431,474-596,1981-2047,2112-2155,2491-2562` | Bounded polling/page/admission, default-off features, profile authorization và relay refusal phải giữ; không dùng source defaults làm measured performance promise |

Không tìm thấy QBTS/AlphaScore/PortfolioScore implementation/formula trong phạm vi Portal BE/FE được audit, hoặc fund overview cashflow/model fields trong existing Manager contract. Đây là kết luận giới hạn source đã đọc, không phát biểu mọi repo đều không có. Nếu implementation sau đó tìm thấy authoritative legacy model, cần compatibility/migration mapping trước áp formula v1.1 đã chọn; giữ historical version riêng, không mở lại phương án công thức. Không có bằng chứng cho full deployed financial catalogue chỉ từ các Fleet columns.

### 2.3.1 Input audit scoring final và numeric activation

Audit bổ sung trong `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` §9 dùng PM `d16aa2b5f251596e469807f57e81fe14cdc7e763` và Research BE **`d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`**. Chỉ locators mới dưới đây thuộc audit mới; §2.3 với BE `fdea081...` vẫn là historical source map. Đây là evidence được cung cấp trong bundle, không phải một lần chạy/audit repo mới bởi việc sửa guide. Applied migrations, retained run history, data completeness và runtime/deployed UI chưa được chứng minh.

| Input/dependency | Source locator được audit | Readiness và giới hạn |
|---|---|---|
| Equity snapshots và consolidation | TS `init-db/10-performance.sql:74-102`; `init-db/19-performance-pnl-ops.sql:9-44`; `services/performance/repository.py:508-660` | Có source snapshot/cadence/consolidation; cần actual window continuity, valuation/cost watermark và coverage. |
| Flow-adjusted TWR, SR, MDD/ADD | TS `services/performance/native_owner.py:39-48,147-150`; PM `services/portfolio_management/operator_reports_contract.py:174-202` | Native performance hiện point-in-time equity; report còn `UNAVAILABLE_METHOD_NOT_CERTIFIED`. Cần derived read-side projection/method certification; balance growth không thay TWR. |
| Flow classification | PM `services/portfolio_management/operator_reports_contract.py:313-379` | CapitalFlow FUND/RETURN_CAPITAL/internal-pair có candidate contract; chưa complete runtime publication. Không suy flows từ balance delta. |
| Baseline costs | TS `services/performance/repository.py:844-893`; `domain/economic_facts.py:77-91,1013-1075` | Commission/funding/economic facts có source; complete borrow/carry applicability và coverage chưa verified. Missing không zero; not-applicable phải có profile proof. |
| Interval gross executed notional | TS `init-db/05-trading-core-v2.sql:146-187`, instrument metadata `:77-101` | Fill qty/price/time/instrument có, canonical interval notional aggregate chưa found; cần instrument multiplier/FX adapter và dedup fill completeness. |
| Alpha sleeve ownership | TS `services/performance/repository.py:515-580`; `services/portal_execution_owner/n11/catalogue.py:233-248` | Ambiguity rejection/bounded contributions có source; publication/partition coverage chưa verified. Không lấy full physical balance làm sleeve NAV. |
| Research binding khi applicable | BE mới `apps/control-api/src/research/release-candidate.service.ts:43-60,469-496,621-638`; `alpha-version-declaration.ts:101-156` | Run/version/parameter pins có; accepted TS deployment binding và actual retained run history chưa proven. Chỉ gate research/Regime-dependent outputs, không universal gate ledger-only NAV score. |
| Corrections/continuity | PM `services/portfolio_management/durable_economics_contract.py:31-86,266-285` | Candidate source revision/continuity/attribution có; cần retained published coverage và replay proof. |
| Calibration config | Chưa tìm thấy approved production artifact trong phạm vi audit | Formula/bands đã chọn; chưa có approved anchors/delta/grid/blocks/maturity/freshness. Numeric production `policy_pending` tới approved runtime config. |

MVP khả thi cho một verified currency/domain/profile/window: regular economic snapshots + classified flows + applicable cost coverage + interval instrument/FX notional + approved calibration. Raw alpha cần thêm sleeve partition proof; PortfolioScore dùng consolidated economic facts riêng. Nếu phát sinh zero flows/fills hoặc cost not-applicable, phải có coverage chứng minh; absence of rows không phải proof. Inputs độc lập đã đủ vẫn phục vụ metrics tương ứng; giữ typed-null/status theo dependency graph khi thiếu. Feasibility review giải thích complexity/derived projections, không claim numerical activation đã sẵn sàng.

### 2.4 Những điểm phải giữ và những khoảng trống cần lấp

Nền có thể tái sử dụng: `portal_users` với ADMIN/USER, mapping provider/issuer/subject, protected-owner anchor, sessions/CSRF, capability grants có revision, idempotency và audit. Không bỏ các lớp này để tạo bảng role độc lập không liên kết.

Khoảng trống cần giải quyết: `OwnerAccessGuard` hiện giữ một số grants operations owner-only, trong khi một số commands, PaperExit, analytics/realtime controllers còn khóa ADMIN. Phải map từng route để Stan có scoped delegation đúng ceiling khi được cấp, không đổi owner-only thành ADMIN blanket; catalogue ALPHA/PORTFOLIO/ACCOUNT thiên về role/workspace, chưa đủ own/shared/cross-scope. ADMIN cũ không tự là owner mới, cũng không chứng minh quyền trên mọi resource. Portal journal/observation theo trang đang xem không phải TS economic ledger hoặc catalogue đầy đủ.

Mục tiêu là một policy evaluator dùng chung với adapter cho routes hiện có. Một route đã được chuyển sang policy mới không được fallback về ADMIN khi thiếu entitlement hoặc TS không sẵn sàng. Route legacy chưa chuyển phải được liệt kê rõ, giữ hành vi cũ theo scope được chứng nhận, không quảng bá là Portal v2 granular permissions.

## 3 Authority và mô hình nghiệp vụ

### 3.1 Authority matrix

| Đối tượng | Authority | Portal giữ gì | Không được làm |
|---|---|---|---|
| Login identity, session, CSRF, trạng thái đăng nhập | Portal identity/session hiện có | Stable Portal user ID, verified identity refs, session generation, audit | Dùng email/display name hoặc workload subject làm khóa quyền |
| Hồ sơ, role preset ứng dụng, quyền UI/app | Portal governance | Versioned grants, delegation ceiling, effective app policy | Cho role name vượt TS business authority |
| User mapping sang TS | Verified identity mapping và contract hai phía | Mapping receipt, trạng thái liên kết, versions | Tạo user TS bằng tên giống nhau rồi coi là đã xác minh |
| PM membership, business capability, alpha owner | TS authority | Proposal và projection từ TS accepted receipt | Sửa local row rồi báo membership nghiệp vụ đã hiệu lực |
| Portfolio, deployment, internal account, assignment, binding | TS registry/management authority | Read projections, alias/registry refs, proposed commands | Đổi foreign key/owner trực tiếp qua BFF |
| Economic facts, postings, fees, source claims | TS/P18 | Projection có lineage, receipt refs, watermarks | Ledger thứ hai hoặc correction bằng sửa số trên UI |
| Budget, root limits, recall, locks, capacity | TS capital/risk authority | Exact command/receipt/status và display projection | Tính available để tự chấp nhận command |
| Native physical account/profile/pool | Verified venue registry và TS | Metadata redacted, custody/readiness, reconciliation | Xem internal budget là số dư sàn hoặc custody isolation |
| Command delivery | Portal BFF và Edge transport | Request/correlation/delivery/unknown state | Đổi transport ACK thành applied |
| Quyết định apply/commit/admission | TS | Receipt nhận từ authority | Tin preview hoặc cached grant tại thời điểm commit |
| QBTS, composition AlphaScore, direct PortfolioScore, Regime Fit | Shared calculation module ngoài order path theo `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`; Research/read-side worker có thể host sau audit | P/R/B, band, evidence maturity, exact economic/research provenance theo metric; Portal chỉ cache/serve | Browser/controller tự tính, PortfolioScore suy từ AlphaScore/HHI, hoặc heavy analytics trên TS hot path |

### 3.2 Cấu trúc cố định và ba danh tính

Cấu trúc kinh tế giữ nguyên **root → portfolio → deployment/internal account**. Không thêm PM entity `book_id`, bảng books hoặc portfolio tree. `subject_type=manager_book` trong scoring companion chỉ là analytics subject/discriminator của consolidated authorized root scope, ánh xạ về `root_id` và consolidation manifest hiện hữu; không tạo entity/capital authority mới. `account_id` là khóa accounting/execution; `deployment_id` là một instance; một alpha có thể có nhiều deployments trong nhiều portfolios.

Ba danh tính độc lập:

1. Alpha owner: một owner hiện hành và immutable owner history, dùng trách nhiệm nghiên cứu và attribution.
2. Portfolio manager/member: membership và capability trong portfolio cụ thể, không tự sở hữu các alpha được chọn.
3. Deploy actor: người/workload thực hiện từng lần triển khai, không tự trở thành alpha owner hay capital authority.

PM mặc định có thể quản lý alpha của nhiều researchers. Khi giao portfolio riêng cho researcher, chỉ thêm membership/capability tương ứng. Alpha ownership không tạo quyền deploy, capital hoặc full portfolio. Theo yêu cầu v1.1, current researcher-owner `user_id` được liên kết đúng alpha tạo eligibility discover portfolio có alpha đó; quyền đọc nội dung vẫn là projection hạn chế theo §4.8, không full totals, peer rows hoặc mọi instance.

### 3.3 Hai điều kiện cho một business mutation

Quyết định Portal cho phép đi tiếp khi session hợp lệ, app capability và scope phù hợp, version hiện hành, không vi phạm protected-owner/delegation rules. Sau đó TS vẫn kiểm user mapping, effective business membership, source/target scope, expected versions, policy, binding, risk/capital conditions tại commit. Thiếu một trong hai điều kiện thì không áp dụng.

Một Portal admin có thể quản lý user nhưng không được cấp vốn nếu TS chưa cho quyền capital. Một PM có quyền capital nhưng Portal session bị revoke không thể gửi intent mới qua Portal. Workload phục hồi committed obligations tiếp tục bằng service principal và original causal records; không phụ thuộc việc researcher còn đăng nhập.

## 4 Profile và Access

### 4.1 Ba preset dùng để nghiệm thu

Tên người chỉ dùng trong fixtures và onboarding mapping đã xác minh. Enforcement dùng stable user ID, protected-owner relation, capability, scope và revision; không có `if name == Bobby/Stan/Thanhvuong`.

| Preset | Quyền đọc nghiệp vụ bắt buộc | Quyền thao tác riêng | Không tự được làm |
|---|---|---|---|
| Protected owner tương ứng Bobby | Toàn bộ business overview, portfolios, alpha fleet và drill-down được phép theo security policy | Owner governance, capital, trading hoặc development chỉ theo explicit capability/approval và TS checks | Full visibility không bypass risk/accounting, không raw credentials hoặc tự cho maintenance |
| Manager tương ứng Stan | Cùng all-business visibility như Bobby, không bị giới hạn bởi mutation ceiling P1/mode | User administration, scoped grant/revoke và business mutation chỉ khi được Bobby delegate trong ceiling và được TS accept khi applicable | Không self-elevate, đổi protected owner, tự maintenance/dev hoặc mutation chỉ vì xem được dữ liệu |
| Researcher tương ứng Thanhvuong | Own alpha và portfolio discoverability khi current researcher owner `user_id` thực sự linked alpha trong portfolio; read projection hạn chế | Alpha metadata hoặc action khác chỉ nếu có explicit capability; không suy từ discoverability | Không full portfolio totals, peer rows, aggregate/sort/export/SSE side channels, full physical account hoặc portfolio không linked |

ADMIN/USER là compatibility input, không là policy mới. Map từng principal thành capabilities đã review; không convert ADMIN thành owner/developer. Tách ba chiều: `business_visibility`, `mutation_scope`, `delegation_ceiling`. Stan có thể xem P2/LIVE nhưng chỉ thao tác P1/SANDBOX nếu đó là ceiling đã được cấp. Yêu cầu all-business visibility không phải yêu cầu grant sẵn export, mutation hay maintenance. Quyền all-business vẫn loại secrets, authentication material và dữ liệu ngoài business release scope.

### 4.2 Capability và scope model đề xuất

Mỗi grant cần: subject principal; action; resource kind; exact scope hoặc phạm vi hữu hạn; mode/environment; điều kiện; grant source; grantor; delegation ceiling ref; effect; effective interval; policy version; grant revision; reason; audit/receipt. `DENY` và protected constraints thắng `ALLOW`; không có grant thì từ chối.

| Nhóm action đề xuất | Ý nghĩa | Giới hạn quan trọng |
|---|---|---|
| `profile.read_self`, `profile.update_self` | Hồ sơ hiển thị cá nhân | Không sửa identity keys, role, owner hoặc grants |
| `users.read`, `users.create`, `users.manage_status`, `sessions.revoke` | Vòng đời Portal users | Bảo vệ owner, self privilege và delegated scope |
| `access.read`, `access.preview`, `access.propose`, `access.grant`, `access.revoke` | Quyền ứng dụng và proposal nghiệp vụ | Grant chỉ trong ceiling; grant quyền grant cũng cần delegation rõ |
| `alpha.read`, `alpha.metadata.edit`, `alpha.owner.propose` | Alpha registry | Ownership change là TS workflow; không đổi historical attribution |
| `business.read_all`, `portfolio.discover_linked`, `portfolio.read_restricted`, `portfolio.read`, `portfolio.manage`, `membership.propose` | All-business read hoặc linked-researcher projection, tách mutation | `read_all` là explicit reviewed capability; discoverability resolve bằng owner user_id; membership mutation vẫn cần TS acceptance |
| `account.read`, `binding.read`, `binding.change.propose` | Internal và physical-linked views | Explicit source/target scope; raw secret luôn excluded |
| `capital.preview`, các `capital.<operation>` | Command theo PM v1.1 | Tách FUND/budget/return/lock/recall; không một quyền write-all |
| `deployment.register`, `deployment.activate`, `deployment.assignment.propose` | Instance lifecycle | Deploy tách khỏi owner, capital, trading |
| `safety.halt`, `safety.reducing`, `safety.resume` | State control nghiệp vụ | Không suy RESUME/UNLOCK từ HALT; TS gates vẫn áp dụng |
| `audit.read`, `report.export`, `stream.subscribe` | Read surfaces bổ sung | Có view không mặc nhiên có export; mọi payload vẫn lọc scope |
| `maintenance.*`, `development.*`, `owner.recovery` | Hoạt động kỹ thuật/owner | Chỉ explicit protected delegation; không thuộc Stan mặc định |

Tên action là đề xuất để chuẩn hóa; trước code phải map vào capability vocabulary hiện có, giữ alias compatibility có hạn. Không dùng prefix wildcard như `*` cho Stan. Resource selectors nên typed: `OWN_ALPHA`, `EXPLICIT_RESOURCE_SET`, `PORTFOLIO_MEMBERSHIP`, `ROOT_SCOPE`; mọi selector resolve thành authorized relation trong query, không chỉ kiểm UI.

### 4.3 Effective permissions đến từ đâu

Mở rộng trang và route hiện có `/api/admin/profile-access`, không xây một vùng Profile & Access tách biệt. Trang Profile hiển thị identity đã xác minh, preset mô tả, active grants, resource/mode scopes, nguồn cấp, người cấp, hiệu lực/hết hạn, application policy revision, TS membership revision, sync status và ngày kiểm tra. Endpoint trả cả `effective` lẫn `proposed`, không merge pending vào effective.

Thuật toán contract:

1. Resolve authenticated Portal principal bằng session; reject disabled/revoked/expired session generation.
2. Resolve protected constraints và current app policy revision; expand preset thành explicit capabilities theo version.
3. Kết hợp direct grant, delegated grant và explicit shared-resource relations; trừ deny, expiry và revoked grants.
4. Giới hạn bằng delegation ceiling, resource/mode/account scope và trạng thái user.
5. Với nghiệp vụ TS, intersect với TS accepted memberships/capabilities và authoritative current revision; chỉ preview nếu TS state chưa đủ freshness, mutation fail closed.
6. Trả permission decision ID, allowed action và lý do đã redacted; không trả danh sách resource bị che để giải thích vì sao user không được thấy.

Role preset giúp onboarding; permissions mới là nguồn thực thi. Historical owner/member không tạo current read grant. Người trước đây thuộc portfolio có thể vẫn được ghi trong audit nhưng không xem lại report nếu chưa có quyền hiện tại.

### 4.4 Luồng thêm user và lifecycle

`INVITED/PENDING_IDENTITY → ACTIVE → SUSPENDED → ARCHIVED` là vocabulary UI đề xuất, cần adapter tới lifecycle hiện có. Việc tạo user chưa có verified subject chỉ tạo pending invitation/mapping, không cấp session hợp lệ hay suy identity từ email. Không hard-delete user đã có audit hoặc facts; archive giữ referential history.

Người có `users.create` chọn preset, scopes và proposed rights trong ceiling; preview liệt kê những quyền effective ngay ở Portal, những quyền cần TS accept và những quyền bị từ chối. Submit với idempotency/version tạo receipt. UI chỉ báo user hoạt động sau identity/lifecycle conditions được đáp ứng. Suspend/revoke sessions tăng session generation hoặc cơ chế tương đương hiện có; cookie cũ, refresh path, WebSocket/SSE và queued new intents bị invalidated.

Stan không được dùng tạo user thứ hai rồi grant quyền vượt ceiling để tự leo quyền; evaluator kiểm cả khả năng delegated onward và target protected roles. Không cho sửa own privilege qua group/preset edit, user clone, membership batch hoặc đổi identity liên kết. Sửa display name/email liên hệ không được đổi authenticated subject.

### 4.5 Luồng grant revoke và acceptance TS

1. Người quản trị mở target user; đọc effective grant set và expected revisions.
2. Chọn resource, action, mode, thời hạn, reason; preview additions/removals, bị ảnh hưởng sessions/views/commands, quyền quản trị còn lại, delegated ceiling và TS validation.
3. Portal kiểm quyền người cấp tại thời điểm submit. Vi phạm ceiling hoặc self-elevation trả `DELEGATION_CEILING_EXCEEDED`/`SELF_PRIVILEGE_CHANGE_DENIED`, không gửi intent xuống TS.
4. App-only change commit trong Portal authority, ghi revision/audit và phát invalidation. Business membership change tạo proposal có digest, expected effective revision, delegation source/ceiling và human principal; gửi TS qua trusted transport.
5. TS accept trả `membership_revision`, `effective_at`, receipt và policy refs; Portal projection mới chuyển business grant sang effective. Reject/conflict giữ quyền cũ và hiển thị reason. Timeout giữ `UNKNOWN/PENDING_VERIFICATION`, reconcile cùng key.
6. Revoke phải có semantics fail closed: Portal chặn new intent/read surfaces theo revocation authority đã hiệu lực; TS kiểm current authority trước commit. Nếu business revoke chưa được TS accept, hiển thị rõ app access đã khóa và business revocation còn chờ; không tuyên bố đã revoke toàn hệ thống.
7. Quá trình đối soát kiểm đủ Portal revision, TS receipt và propagation status. Không tự resend với key mới để vượt conflict.

Grant/revoke có effect preview nhưng preview không khóa business state. Người review cần xem trước/sau, quyền mất, session/stream ảnh hưởng và những committed obligations vẫn tiếp tục. Receipt phân biệt `PORTAL_APPLIED`, `TS_PENDING`, `TS_APPLIED`, `TS_REJECTED`, `UNKNOWN` theo authority; không dùng một dấu xanh cho hai hệ chưa đồng thuận.

### 4.6 Protected owner bootstrap và recovery

Giữ owner anchor hiện có, xác minh stable principal gắn Bobby; không suy từ user đầu tiên, email hay ADMIN. Fresh install chỉ bootstrap một lần từ thủ tục được duyệt, có trusted identity proof, unique/transactional guard và immutable audit. Restart hoặc migration không bootstrap lại nếu anchor đã tồn tại.

Đề xuất baseline một protected owner với recovery ngoài self-service thông thường. Không cho Stan đổi/suspend/archive owner, revoke owner sessions như một quản trị user thường, hạ role, đổi subject, chuyển anchor, hoặc sửa preset khiến owner mất đường quản trị. Nếu sau này nhiều owner, last-effective-owner check phải serializable/transactional khi revoke/suspend, không chỉ đếm trước khi write.

**Quyết định cần Bobby duyệt trước triển khai:** ai có recovery authority khi owner mất truy cập, bằng chứng cần có, có dual control hay không, nơi giữ recovery procedure, thời hạn và audit. Không tự tạo backdoor account, password mặc định hoặc recovery token. Chưa chốt recovery thì block owner-changing workflows; những scoped researcher/read workflows vẫn có thể đi tiếp sau gate riêng.

### 4.7 Audit và khả năng giải thích

Audit gồm human requester, authenticated Portal principal, service actor, approver nếu có, target, action, scope, before/after digest, proposal/effective revisions, ceiling ref, outcome/reason, UTC timestamps, idempotency/correlation, TS receipt và source provenance. Redact secret và session token. Ghi deny quan trọng nhưng không ghi raw sensitive payload.

Một user đọc own effective permissions được thấy nguồn quyền mình; chỉ người có audit scope mới thấy grantor/target khác. Explain endpoint không là enumeration oracle: unknown và unauthorized resources trả cùng public shape; internal deny detail chỉ trong audit được phân quyền.

### 4.8 Field matrix cho manager và linked researcher

**Đã là yêu cầu:** Bobby/Stan all-business visibility; Thanhvuong chỉ discover portfolio khi current researcher owner `user_id` linked ít nhất một alpha trong portfolio, và chỉ xem metrics hạn chế qua safely filtered projection. **Còn là PROPOSED cần Bobby duyệt:** chính xác field nào được researcher xem, scale/precision/bands, download/export rights và lịch sử sau khi ownership/link thay đổi. “Mức vừa phải” không tự xác định danh sách fields hay threshold. Khi matrix chưa duyệt, chỉ dùng synthetic fixtures; live researcher field không được tự bật rộng.

| Field hoặc surface | Bobby và Stan | Thanhvuong khi linked, đề xuất cần duyệt | Khi không linked hoặc link bị revoke |
|---|---|---|---|
| Portfolio ID và display label | Có, trong all-business read | Có shell tối thiểu cho portfolio đủ eligibility; không peer count | Không discover; public not-found shape |
| Own alpha ID/version, owner user_id, linked deployment reference | Có | Chỉ own linked rows được duyệt; owner identity là self, không enumerate người khác | Không có rows |
| Stage presence và lifecycle | Có | Chỉ stage/lifecycle của own linked instances; không toàn portfolio stage breakdown | Không có |
| Own-alpha moderate performance | Metrics exact có nguồn theo quyền | Candidate: QBTS hoặc quality bands; authorized own-slice net PnL/return khi methodology đủ; exact vs band phải duyệt riêng | Không có |
| Alloc, account balance, unrealized PnL, equity 30D | Theo field authority và dedupe | Mặc định restricted; chỉ field đã duyệt cho own linked slice, không native account toàn pool | Không có |
| Portfolio totals, fund totals, total AUM/capital/PNL, full Portfolio Score | Có theo source quality | Không; không gửi rồi chỉ hide trên FE | Không có |
| Peer alpha rows, owner list, peer count, distribution, contribution rankings | Có | Không, kể cả aggregate/facets hoặc order của hidden peers | Không có |
| Health/source and regime evidence | Có business-safe detail | Safe own-slice status và eligible research lineage; không host/account/peer identifiers | Không có |
| Sort/filter/group, search/count | Trên toàn authorized business set | Chỉ approved visible fields và own filtered rows; không full portfolio metric sort hoặc hidden membership inference | Không có |
| Exports và SSE | Separate capability + same field policy | Mặc định disabled cho restricted portfolio; chỉ bật khi explicit approved field/scope policy và negative tests | Không có |
| Mutation, user/grant administration, maintenance | Theo capability riêng, không từ read_all | Không từ ownership/discoverability | Không có |

Eligibility query phải join verified principal → current alpha researcher-owner relation → version/deployment/portfolio membership tại cutoff được công bố. Một field tên owner bằng chuỗi, deploy actor giống tên, historical owner đã mất quyền, alpha alias hoặc share link không thay verified `user_id`. Chốt semantics với TS registry/current Research ownership mapping; unresolved identity/link trả unavailable/deny-safe, không fuzzy match tên.

Restricted response dùng `view_kind=RESEARCHER_LINKED_SLICE`, `coverage=AUTHORIZED_ONLY`, `totals_scope=VISIBLE_ROWS_ONLY` nếu có subtotal approved, và `is_full_portfolio=false`. `visible_count` chỉ đếm rows được duyệt; không `total_count`, `hidden_count` hoặc đủ hai số để trừ ra peers. Portfolio discovery có thể chỉ trả shell và own rows, không cấp `portfolio.read_full` ngầm. Sau unlink/revoke, invalidate list/detail/cache/export/stream/cursor theo revision hiện hành.


## 5 Enforcement xuyên suốt mọi đường đọc và ghi

### 5.1 Một policy decision nhiều enforcement points

BFF gắn principal và policy context từ trusted session, không nhận actor do browser tự khai. Mọi route gọi cùng evaluator; repository/query builder nhận một typed authorized scope bắt buộc. Không có default `scope=all` khi thiếu parameter. TS vẫn là enforcement cuối cho business mutation và authoritative reads cần quyền TS.

Read authorization phải đứng trước pagination, count, aggregation và relation expansion. Nếu chỉ lọc response sau khi lấy trang, user có thể suy số tài nguyên ẩn từ total/page gaps, đồng thời kết quả search và aggregate sai. Không tính tổng toàn portfolio rồi trừ child không được xem bằng UI.

| Surface | Bắt buộc | Attack fixture |
|---|---|---|
| Detail/deep link | Authorize exact resource trước response, public not-found shape đồng nhất | Đoán ID portfolio khác |
| List/filter/search | Scope predicate trong truy vấn; count/facets chỉ authorized set | Search tên alpha bị che, total có thay đổi |
| Nested joins | Kiểm child relation và redaction theo field-level scope | Alpha được share kéo theo private account/broker |
| Aggregates/charts | Dedup authorized source set trước sum; coverage rõ | Tổng alpha lộ performance instance portfolio khác |
| Export/download | Recheck lúc tạo, lúc tải; file gắn policy revision/scope/expiry | URL export cũ sau revoke |
| SSE/replay | Authorize subscription, fanout và replay theo current policy | Last-Event-ID thuộc scope khác |
| Cache | Key gồm user/scope digest/policy revision/mode/query/generation | Hai users dùng chung URL |
| Error/status | Không lộ existence, label hoặc blocker của hidden resource | Command status ID của user khác |
| Direct API/batch | Auth+CSRF cho mutation, item-scope evaluation, không UI-only gate | Gọi route ADMIN legacy bị bỏ kiểm |

Một researcher có `alpha.read` chỉ thấy metadata/instances được cấp. Linked portfolio discovery theo §4.8 thêm shell và own permitted rows, không mở full portfolio. Không nhận count tổng instance toàn hệ nếu count đó bị bảo vệ. Contract trả `visibility: SCOPED` và `coverage: AUTHORIZED_ONLY`, không `total_instances=7` nếu chỉ một instance được xem. Nếu việc biết alpha tồn tại cũng bị cấm, không trả shell metadata.

### 5.2 Shared physical account và privacy

Account/Broker 360 có thể có một physical account nối nhiều portfolios. Quyền nhìn internal account không tự cho xem toàn native balance, sibling labels, venue UID hoặc risk-pool participants. Khi cần cảnh báo rủi ro chung, trả thông tin đã redacted như `shared_pool=true`, `scope_visibility=PARTIAL` và risk-quality được phép; không liệt kê sibling bị che.

Reconciliation full custody view cần capability riêng. Restricted user không được dùng chênh lệch giữa physical tổng và visible internal subtotal để suy hidden balances. Không xuất cả hai số khi tổ hợp làm lộ dữ liệu ngoài scope; hiển thị quality/redaction reason thay cho phần bị che.

### 5.3 Revocation và expiry

Sau app revocation commit, invalidation phát cùng transaction/outbox phù hợp. BFF từ chối new requests theo revision mới; caches chứa protected rows bị purge hoặc không còn hit do key revision; SSE subscriptions re-evaluate rồi đóng hoặc chuyển thành `access_revoked` không chứa target data; replay luôn kiểm quyền hiện tại, kể cả event được tạo trước revoke.

Queued intent chưa commit phải được reauthorize khi lấy từ queue và tại TS commit. Intent trước revoke không được quyền vĩnh viễn chỉ vì có signed envelope cũ. Approval receipt còn phải current, target/payload-bound và chưa hết hạn; revoke không được bypass bằng offline replay.

Facts và obligations đã committed vẫn phải được tiếp nhận, settle và reconcile bằng causal IDs cũ. Revoke người dùng không xóa economic facts, không hủy lệnh sàn, không trả budget, không rewrite owner history. UI không dùng revoke như một trading stop; HALT/REDUCING là command nghiệp vụ riêng.

TTL và bounded propagation phải đo và được duyệt theo risk, không ghi một con số tùy ý thành SLA. Trong khoảng không xác minh được current policy, new mutation fail closed. Với read, chọn policy stale-deny cho protected content; không tiếp tục stream sensitive rows cho đến hết TTL theo best effort.

## 6 Hợp đồng dữ liệu dùng chung

### 6.1 Resource registry

| Resource | ID chuẩn | Mapping phải giữ | Display không là authority |
|---|---|---|---|
| User | stable Portal user ID và verified TS user mapping | provider/issuer/subject; TS mapping receipt | Tên, email, avatar |
| Alpha và AlphaVersion | Canonical alpha ID và immutable alpha version ID | Legacy alias, researcher owner user_id/revision, research run/parameter digest, registry version | Tên alpha hoặc score không xác định version |
| Portfolio | stable `portfolio_id`, `root_id` | Current/historical memberships và assignment set | Nhãn portfolio |
| Deployment | immutable `deployment_id` | AlphaVersion/account/environment/assignment versions, financial stage history, lifecycle và clone lineage | Tên có researcher/portfolio; stage label không là execution permission |
| Internal account | `account_id` | Deployment, original economics, source/pool scopes | Balance label hoặc book alias |
| Physical account | Existing venue registry identity | Native UID/profile/region/env refs đã verified | Friendly alias hoặc credential label |
| Binding | Stable binding ref và revision | Original native account/pool/profile cho order | Binding hiện tại không thay binding cũ |
| Fact/order/episode | Authority source identity | Native order correlation, economic source/revision, episode | Timestamp hoặc amount không đủ dedupe |
| Command | Authority command ID + idempotency scope/key | Payload digest, delivery correlation, receipts | Browser request ID không chứng minh effect |

Browser không parse owner/venue/portfolio từ ID string. `@` và legacy alias phải round-trip qua URL/JSON/export, encode một lần đúng client/router; alias resolve phải trả canonical ID và mapping version. Ambiguous mapping trả explicit error, không chọn kết quả đầu. Không rewrite historical primary keys để đồng nhất display.

### 6.2 Numeric thời gian và đơn vị

Money, quantity, rate và price truyền decimal string; dùng exact decimal/numeric theo TS contract, không JavaScript Number để cộng vốn. Field có unit/currency/basis bắt buộc. `null` là chưa biết hoặc không áp dụng tùy reason, không đổi thành zero. Một value có thể được hiển thị làm tròn nhưng export/command giữ exact canonical value và quy tắc rounding đã duyệt.

Wire timestamp đề xuất là UTC epoch milliseconds `*_at_ms`, số nguyên an toàn và schema validated; adapter ánh xạ từ TS existing timestamp mà không sửa nguồn. Nếu TS precision cao hơn millisecond, giữ original sequence/source timestamp để thứ tự và dedupe không mất độ chính xác. IDs/version counters có thể vượt safe integer phải serialize string. Revisions/digests đưa ra client chỉ thuộc authorized scope hoặc là opaque token; không dùng global counters để làm lộ thay đổi ở hidden resources. UI địa phương hóa display; API/as-of/audit giữ UTC.

Phân biệt:

- `as_of_ms`: thời điểm kinh tế được yêu cầu xem.
- `recorded_through_ms`: giới hạn tri thức đã được ghi để tái lập report.
- `facts_through_ms`: watermark đầy đủ theo source contract, không tự bằng as-of.
- `produced_at_ms`: thời điểm projection/response được tạo.
- `received_at_ms`: lúc Portal nhận, không chứng minh source còn mới.
- `effective_at_ms`: thời điểm membership/assignment/policy hoặc business effect có hiệu lực.

### 6.2.1 Stage và lifecycle là hai trục

UI filter có đúng `All / Live / Canary / Sandbox / Paper`. Wire filter `ALL` là chọn tất cả **authorized** stages, không là financial stage. `financial_stage` chỉ `LIVE | CANARY | SANDBOX | PAPER`; không có `RESEARCH` hoặc `ARCHIVE` trong enum này. Research là nguồn evidence/score, không financial stage.

`stage_presence` là tập stage của đúng row grain và source cutoff. Một alpha version có thể đồng thời hiện diện ở Paper và Live; không tự rút về một badge “cao nhất”. Environment, native profile và governance state tách khỏi stage: Canary cần explicit limited-live policy/profile nếu có giao dịch live; nhãn Canary không tự chứng minh live readiness hoặc bỏ approval.

`lifecycle_status` riêng như `ACTIVE | ARCHIVE_REQUESTED | ARCHIVED`, ánh xạ versioned sang TS states thật. Archive giữ original IDs, owner/assignment/stage history và late-fact lineage. “Monitor bằng paper clone” tạo một instance Paper mới có `origin_deployment_id`, `origin_alpha_version_id`, `clone_reason=ARCHIVE_MONITOR`, effective time và approved config digest; không biến archived row thành financial stage thứ năm, không chuyển nghĩa tài sản cũ sang Paper, không auto promote Live.

Đối với instance từng execution: open positions, working orders, reservations, unknown outcomes và pending settlement phải có explicit disposition đã được TS chấp nhận trước khi đóng former execution. Archive/clone không cancel, flatten, liquidate, return capital hoặc release budget ngầm. Khi disposition chưa đủ, workflow giữ ARCHIVE_REQUESTED/PENDING_DRAIN và hiển thị blockers an toàn; paper monitoring có thể là bước riêng được duyệt, không chứng minh execution đã đóng.

### 6.2.2 Metric capsule và comparable units

Mọi scalar metric dùng shape chung: `value` decimal string hoặc null; `unit`; `currency` khi là money; `basis`; `window`; `denominator` hoặc null; `methodology_ref`; `availability`; `quality`; `source_confidence`; `provenance`; `calculation_revision`; `policy_revision`. Registry xác định field nào được aggregate/sort/filter, không suy từ JSON type.

Money chỉ comparable cùng economic domain, currency/basis/cutoff và authorized source set. Metric bắt buộc có `economic_domain` và verified environment/native-profile proof reference hoặc explicit non-custodial Paper source; thiếu domain proof thì unavailable, không suy từ stage label. Cross-currency sorting cần approved valuation numeraire, FX source/time/revision và quality; thiếu thì partition theo currency hoặc trả `INCOMPARABLE_UNITS`, không convert ngầm. Rate phải chỉ rõ `RATIO` hay `PERCENT`; QBTS points không là return %. Monetary PnL amount không được so với percentage chỉ vì cả hai hiển thị số.

Mỗi percentage giữ exact numerator/denominator và denominator kind: current allocation, period opening capital, net contributed capital, average weighted capital hoặc approved return methodology. Nếu denominator zero/negative/unsupported, value null với reason; không Infinity/NaN và không hiển thị 0%. Chỉ gọi performance return khi đúng approved cashflow methodology, không `PnL / latest balance` do UI tự đặt.


### 6.3 Snapshot envelope đề xuất

```json
{
  "schema_version": "portal.snapshot.v1",
  "dataset": "portfolio_overview",
  "availability": "AVAILABLE",
  "scope": {"kind": "PORTFOLIO", "id": "P_FIXTURE_1", "financial_stage": "SANDBOX", "execution_environment": "SANDBOX"},
  "snapshot_id": "snap_fixture_001",
  "as_of_ms": 1791600000000,
  "recorded_through_ms": 1791600000000,
  "facts_through_ms": 1791599998000,
  "produced_at_ms": 1791600000500,
  "quality": {
    "completeness": "PARTIAL",
    "freshness": "FRESH",
    "reasons": ["PENDING_FEE_FACT"],
    "coverage": "AUTHORIZED_ONLY"
  },
  "versions": {
    "app_policy": "42",
    "ts_membership": "19",
    "assignment_set_digest": "fixture_digest",
    "projection_generation": "7",
    "source_continuity_epoch": "3",
    "reducer": "portfolio-overview.v1",
    "numeric_policy": "approved-policy-ref"
  },
  "source_set_digest": "fixture_source_set",
  "resume_cursor": "opaque_scope_bound_cursor",
  "coverage_watermark": "opaque_authenticated_scoped_watermark",
  "data": {
    "economic_assigned": {"amount": "1000.00", "currency": "USDT"},
    "budget": {"amount": "800.00", "currency": "USDT"},
    "nav": {"amount": null, "currency": "USDT", "reason": "PENDING_FEE_FACT"}
  }
}
```

Các ID, thời điểm và số tiền trên chỉ là fixture. Contract envelope không thay authoritative TS report fields; adapter giữ exact semantics và source refs. `completeness` và `freshness` độc lập: fresh nhưng partial vẫn không COMPLETE; complete ở cutoff cũ có thể stale với màn hình hiện tại. Giữ mapping cho quality TS `COMPLETE/PARTIAL/STALE/UNRESOLVED`; Portal không nâng chất lượng bằng việc parse thành công.

### 6.4 Snapshot delta và replay

Snapshot cố định source-set/generation/cutoff; delta chứa event ID, dataset, entity key, sequence/source offset, schema version, generation, continuity epoch, effective/recorded times, changed rows hoặc replacement, tombstone nếu visibility/archival thay đổi. Lựa chọn baseline: **upsert/replacement theo key + version**, không gửi amount delta mà browser tự cộng nếu replay có thể lặp.

Subscribe trả snapshot với cursor tại barrier nhất quán; sau đó replay strictly-after cursor. Dedupe theo authority event/source ID và version, không timestamp. Out-of-order event không ghi đè newer row; gap hoặc epoch/generation mismatch trả `RESYNC_REQUIRED`, client lấy snapshot mới. Không âm thầm bỏ mất event để giữ chart mượt.

Cursor opaque, ký hoặc bound server-side vào dataset/query/scope/policy principal digest/mode/generation, có retention và expiry. Cursor không là authorization. Reconnect dùng current policy; cursor bị revoke trả scoped reset/access denied, không replay cache cũ. Response lỗi cursor không lộ offset hoặc dataset của người khác.

Mixed-source view cần barrier/watermarks theo từng nguồn và completeness vector. Không yêu cầu một global transaction giữa TS và Portal nếu chưa có; thay bằng explicit common cutoff + quality, hoặc `PARTIAL/UNRESOLVED` khi không có consistent basis. Command receipt có thể đi trước projection; UI hiển thị applied receipt và `projection_catching_up`, không gửi lặp command.

### 6.5 Filtered stream không lộ hidden sequence

Global source sequence không được dùng trực tiếp làm visible-stream gap detector. Fixture source events `visible1 / hidden2 / visible3` là một source stream liên tục; user chỉ thấy 1 và 3 không có nghĩa mất event. Không trả sequence/count của hidden2 hoặc tổng hidden rows để giải thích coverage.

Edge giữ source integrity/checkpoint proof ở trusted boundary, thực hiện scoped filtering theo current policy, rồi phát **opaque continuation** và **authenticated coverage/scan watermark** cho authorized view. Watermark chứng minh source interval đã được quét/covered dưới dataset/policy/generation đã pin, không tiết lộ hidden sequence/count. Portal kiểm proof/binding thay vì suy completeness từ hai visible IDs liên tiếp. Event IDs public nên opaque nếu global numbering tự làm lộ hidden activity.

Một true source loss hoặc thiếu visible event trong interval phải bị source integrity/coverage verification phát hiện và trả canonical `RESYNC_REQUIRED` hoặc unavailable theo contract; không được giả full coverage vì filter trả empty. Policy/scope revision thay đổi làm cursor cũ bị reauthorize/invalidate và snapshot mới theo scope mới. Revoke giữa replay phải dừng trước phát tiếp dữ liệu bị thu hồi; đã ghi facts không bị xóa.

Acceptance bổ sung `ELP2-T09-09`: visible1/hidden2/visible3 không false gap và không hidden counts; `ELP2-T09-10`: actual source/visible-event loss không fake COMPLETE; `ELP2-T09-11`: revoke giữa replay, cursor scope change và coverage proof mismatch.

### 6.6 Mapping Edge canonical và browser DTO

`contract_version=edge.v1` là **shared Edge→Portal transport đề xuất**, chưa claim runtime. `schema_version=portal.snapshot.v1` là browser DTO riêng; adapter versioned giữ semantic mapping dưới đây. Không silent rename legacy RFC3339/lowercase/source_generation. Canonical reset duy nhất là `RESYNC_REQUIRED`; UI có thể dịch copy nhưng không tạo wire status cạnh tranh.

| Edge canonical đề xuất | Portal browser DTO | Quy tắc mapping |
|---|---|---|
| `contract_version=edge.v1` | `schema_version=portal.snapshot.v1` | Validate hai schemas riêng; adapter version và coverage được pin |
| `source_continuity_epoch` | `versions.source_continuity_epoch` | Source discontinuity epoch, không projection generation |
| `projection_generation` | `versions.projection_generation` | Chỉ copy nếu projection đó được reuse; BFF projection riêng phải có generation/lineage riêng rõ |
| `as_of_ms` | `as_of_ms` | Cùng economic cutoff; UTC epoch-ms safe integer |
| `source_observed_at_ms` | Source observation metadata | Không tự biến thành facts_through hoặc recorded_through |
| `emitted_at_ms` | Transport metadata | Không map thành produced_at_ms; Portal projection timestamp tạo riêng |
| Source coverage/recorded proof | `facts_through_ms`, `recorded_through_ms` | Chỉ derive khi proof cùng source-set/cutoff semantics; thiếu proof để unavailable/partial |
| `quality.completeness/freshness/reasons/coverage` | `quality.*` | Uppercase enums và meanings giữ nguyên; mapping không nâng quality |
| `availability` | `availability` hoặc field availability theo schema | Uppercase; unavailable giữ reason/null, không zero |
| `continuation` | `resume_cursor` | Opaque scope/policy/generation-bound; không parse thành visible sequence |
| `coverage_watermark` | `coverage_watermark` | Opaque authenticated proof, giữ authorization binding |
| `RESYNC_REQUIRED` | `RESYNC_REQUIRED` + localized copy | Snapshot lại khi current quyền cho phép |
| Source environment và approved stage history | `execution_environment` riêng; `financial_stage` và `stage_presence` riêng | UI dùng All/Live/Canary/Sandbox/Paper; legacy DEMO chỉ là alias verified SANDBOX ở adapter. Canary không là environment mới và không tự cấp live permission |
| IDs/revisions/counters strings | IDs và `versions.*` strings | Không Number conversion; timestamp safe integer là exception đã định nghĩa |

Runtime legacy timestamp RFC3339 có thể parse sang UTCms tại explicit adapter khi timezone/precision được xác minh, giữ original source ordering proof. Nếu field legacy `source_generation` không phân biệt continuity và projection, không đoán split; mark unsupported/missing proof cho stream certification. Case `ELP2-T01-09` kiểm mapping timestamps/enums/environments, `ELP2-T09-12` kiểm generation/legacy incompatibility không silent accept.

### 6.7 Pagination search export

Keyset cursor theo stable sort tuple như `(effective_at_ms, immutable_id)`; tie-breaker bắt buộc. Snapshot-bound paging hoặc explicit live-view semantics, tránh offset trôi gây missing/duplicate. `limit` có cap theo dataset, `sort/filter` allowlist; không nhận SQL/expression tùy ý. Count phải cùng authorized predicate/cutoff; có thể trả `count_status=NOT_COMPUTED` nếu count đắt, không estimate mà gọi exact.

Export chạy từ authorized snapshot, exact decimals và schema/version/quality header, giới hạn rows/bytes/time. Job recheck authority trước tạo và trước download; revoke vô hiệu hóa signed access token hoặc server download gate. Không đưa raw UID, credentials, hidden memberships vào CSV qua các cột debug. Escape CSV formula cells, dùng filename an toàn, retention có policy. Tạo export không tạo read rights mới. Revocation chặn truy cập tương lai; không thể thu hồi tri thức hoặc bản file người dùng đã tải hợp lệ trước đó. Retention và cảnh báo download phải nói đúng giới hạn này.

### 6.8 Alpha Fleet query contract

`ALL` là union để discovery/navigation, **không là economic aggregation domain**. Real-funded NAV chỉ dùng eligible authoritative real-funded source set ở Live/Canary theo native profile/binding proof; cùng account xuất hiện cả Live và Canary tính đúng một lần. Paper simulations và Sandbox demo cohorts tách từng partition, không cộng vào real-funded NAV hoặc cộng lẫn nhau chỉ vì cùng USDT. Archive-monitor Paper clone không mang vốn/PnL thực từ former Live instance sang một dòng tài sản mới.

Response ALL trả `stage_metrics`/`economic_partitions` hoặc refs tới partitions cùng economic domain/native profile; generic combined monetary metric phải null/unavailable với reason `MIXED_ECONOMIC_DOMAINS` nếu không có single comparable basis. Sorting money across ALL chỉ hợp lệ khi chọn một economic partition chung; không xếp Paper 100000 bên cạnh Live 1000 như cùng AUM. Portfolio/model weights lấy đúng allocation snapshot/domain đã pin, không tính hai lần alpha/account do nhiều stage presence.

Grain mặc định là `alpha_id × alpha_version_id × portfolio_id` với explicit selected-stage set; child deployments/accounts có references riêng. Muốn chế độ “gộp alpha qua portfolios” phải request aggregation grain khác, công bố source set và không cộng lại cùng account. Keyset tuple luôn kết thúc bằng immutable row key; số rows thay đổi do stage presence không làm reset identity tùy tiện.

Server hỗ trợ sort/filter/group-by cho **mọi metric scalar applicable và được phép** trong catalogue §7.2, không chỉ PnL: Alpha/Version, Owner, Portfolio, Stage Presence, Alloc, PnL amount, Unrealized PnL, Account balance, Equity 30D summary, Health/Source và QBTS. Allowlist nêu operator, null ordering, direction, unit/basis, enum ordering và grouping meaning. Client không tự sort một page rồi gọi toàn bảng đã sorted. Field bị restricted không được dùng làm sort/filter/group key dù response không chứa field đó.

Series Equity 30D không có total order tự nhiên. API cho sort theo scalar được đặt tên rõ, ví dụ `equity_30d_end_value` hoặc certified `return_30d_pct`; `equity_30d_points` chỉ để vẽ. Raw equity change chỉ dùng nhãn raw-equity change, không giả performance return. Stage Presence là set, filter theo set membership; nếu cần sort phải pin approved deterministic set ordering, không infer risk rank. Health/Source enum ordering được catalogue công bố, null đứng vị trí cố định.

Một query gồm `stage_filter`, `lifecycle_filter`, typed filters, sort tuple, group_by, window, limit và snapshot/cursor. Snapshot giữ authorized predicate, field-policy revision, source-set/generation, methodology/model revisions, cutoff và normalization currency. Tiếp trang không đổi các giá trị này; mismatch trả `RESYNC_REQUIRED` hoặc `QUERY_SNAPSHOT_MISMATCH`. Aggregate/group footer tính sau authorization và filter, không sau pagination; missing/partial rows làm coverage partial. Counts/subtotals không bao gồm peers bị ẩn. Export/SSE reuse chính query + field policy, không có đường “full raw data” bypass.


## 7 Catalogue nghiệp vụ và cách khai thác

Catalogue là contract inventory có owner, schema, grain, source/version, authorization predicate, quality/freshness, available filters, indexes, snapshot/delta capability, retention và sample fixtures. Một dataset chỉ được đưa vào UI khi inventory ghi `EXISTING_VERIFIED`, `ADAPTER_REQUIRED`, `NEW_PROJECTION` hoặc `UNAVAILABLE`; endpoint được tìm thấy không đủ để ghi business completeness.

| Family | Grain và nguồn chuẩn | Read model phục vụ | Quyền và giới hạn | Consumer và nghiệm thu |
|---|---|---|---|---|
| Identity profile session | User/identity/session generation từ Portal; verified TS mapping | Own profile, directory, session summaries | Self hoặc user-admin; không tokens | Profile & Access; mapping/suspend/revoke fixtures |
| Membership và ownership | User×portfolio×effective interval; alpha owner revision từ TS | Effective grants, pending proposals, owner history | Current grant trước historical attribution | Access, Portfolio/Alpha; no former-member leak |
| Portfolio deployment assignment | Portfolio/deployment/account với assignment interval | Registry lists, instance matrix, readiness | Exact resource/mode; source và target cho move | Ba 360 views; stable IDs/multi-instance |
| Bindings native profile | Existing physical binding/profile/pool revision | Account bridge, shared-pool warning, verification status | Redacted current scope; full custody riêng | Account/Broker; native identity không suy alias |
| Capital budget locks recalls | Command/leg/lock ID và authoritative versions | Capital statement, available budget display, pending blockers | Operation-specific + parent scope | Portfolio/selected instance; amount partition |
| Orders fills obligations | Original order/fill/source revision; committed scope | Active obligations, pending-drain, execution timeline | Trading/read scope; late original attribution | Assignment, Alpha/Account; unknown giữ obligation |
| Economics postings corrections | Economic source/revision và posting legs | PnL components, assignment/return lines, corrections | Authorized original source set | Statements/reports; balanced/dedup/restated |
| Positions episodes | Account/instrument/side/episode/binding revision | Position and risk exposure cards | Exact account/mode; HEDGE legs riêng | Alpha/Account; no flat-label release |
| Risk capacity state | Authority decision/version, pool and ancestor state | New-risk readiness/blockers, gates | Redacted reason theo visibility | Capital/activate; display không authority |
| Valuation reconciliation quality | Proof/reconciliation finding/source watermark | NAV quality, native/internal bridge, unavailable metric | Custody visibility, scoped source set | Three 360; no fake COMPLETE |
| Audit receipts recovery | Command/event/correlation/actor/receipt | Audit timeline, status lookup, unknown recovery | Audit/status resource scope | All workflows; ACK≠APPLIED |
| Fund and portfolio overview | Root/portfolio × currency × approved cutoff/source set | Initial/additional funds, cashflows, NAV, absolute PnL and exact-denominator metrics | Business read_all; researcher never full totals implicitly | Manager landing; external/internal flow elimination |
| Alpha Fleet | AlphaVersion × portfolio × selected stage set, dedup account sources | Server-sortable/filterable/groupable manager table | All-business read or approved researcher slice only | Manager drill-down; stable snapshot and no double-count |
| Shared quality score and Regime Fit | Alpha/deployment economic binding hoặc portfolio/root consolidated NAV snapshot; research run bắt buộc chỉ khi dùng research evidence/Regime | Raw QBTS, score contribution, composition AlphaScore, direct PortfolioScore, regime evidence | Shared off-order-path calculator/read model; field-policy enforcement | No browser formula; evidence/status theo own dependency; actual/mixed/research provenance tách |

Availability nghiệp vụ dùng `AVAILABLE/PARTIAL/UNAVAILABLE/OUT_OF_SCOPE` theo PM catalogue. Đây là trục riêng với readiness `EXISTING_VERIFIED/ADAPTER_REQUIRED/NEW_PROJECTION`, history capability và quality/freshness. Legacy `CURRENT_ONLY/HISTORY_AVAILABLE/PLANNED` phải qua mapping theo nghĩa: current-only có thể AVAILABLE cho snapshot nhưng UNAVAILABLE cho history; PLANNED không tự là available. OUT_OF_SCOPE trên response chỉ mô tả requested operation/dataset scope một cách an toàn, không xác nhận tài nguyên ẩn tồn tại.

Một family có thể cần nhiều endpoints hoặc bảng; không tạo một JSON mega endpoint cho mọi thứ. Tuy nhiên ba operator views phải khai thác đủ catalogue trên theo quyền, không dừng ở balances/PnL rồi bỏ membership, obligations, capital statement, lineage và recovery.

### 7.1 Coverage manifest đề xuất

```yaml
# PROPOSED contract metadata, không phải cấu hình đã triển khai
dataset: capital_statement
version: portal.capital-statement.v1
owner: ts-capital-authority
status: NEW_PROJECTION
grain: [command_id, receipt_leg_id, source_revision]
read_authority: current_resource_permission_then_historical_source_set
money_fields: exact_decimal_string_with_currency
supports: [snapshot, keyset_page, export, scoped_delta]
required_lineage: [ts_receipt, assignment_revision, source_identity]
quality_dependencies: [capital_receipts, economics_watermark, corrections]
consumers: [portfolio_360, alpha_selected_instance, account_360]
```

Manifest có `unsupported_fields` và reason. Ví dụ thiếu verified fees thì card actual net PnL phải partial/unavailable theo definition; không lấp zero. Catalogue full coverage là inventory đủ các family và explicit unsupported outcomes, không phải bắt mọi future feature xuất hiện trong release.

### 7.2 Field catalogue bắt buộc cho Manager

Bảng sau là **PROPOSED schema**, không khẳng định fields đã có runtime. Mỗi field đăng ký `producer_owner`, `source_schema/version`, exact source refs, grain, unit, authority predicate, field-policy revision, availability reason, source confidence, freshness, method/model revision, input lineage, sort/filter/group support và tests. Quyền Manager đọc all-business không thay data readiness.

| Field | Source owner và nghĩa | Authorization và availability | Query/aggregation rule |
|---|---|---|---|
| `alpha_id`, `alpha_version_id`, `alpha_name` | Registry + canonical Research version mapping | Manager; researcher chỉ linked own alpha, mapping unresolved không đoán | Exact ID/name search; stable version tie-break |
| `owner_user_id`, owner display | Verified current researcher-owner mapping; history separate | Manager; researcher self-only | Server sort/group theo stable user ID; display name không khóa quyền |
| `portfolio_id`, portfolio display | TS registry/assignment interval | Manager; researcher eligible shell | Group theo ID, không full totals với restricted view |
| `stage_presence`, `lifecycle_status` | TS stage/lifecycle history projection | Current scope; no Research/Archive stage | Stage-set filter; lifecycle filter riêng |
| `alloc` | Default đề xuất là economic capital assigned, field basis ghi rõ; budget riêng | Manager; researcher default restricted chờ matrix | Sum unique assignment/economic source; không cộng budget vào alloc |
| `management_budget`, `margin_risk_budget`, `exposure_cap` | PM R2 authoritative independent dimensions | Theo explicit field policy; missing proof null | Không cộng các dimension hoặc đổi chúng thành cùng 1x cap |
| `pnl_amount`, `unrealized_pnl` | Authoritative economics và valuation projection | Manager; researcher own-slice chỉ nếu duyệt | Exact amount/currency; gross/net/fee/funding convention required |
| `account_balance` | Mặc định `INTERNAL_ACCOUNT_BALANCE`, internal-account accounting balance đúng grain; native custody là field riêng | Manager; restricted account/pool redaction | Unique account once per source set; account có nhiều fleet rows không cộng lặp |
| `equity_30d_points`, `equity_30d_end_value` | Valuation history + cashflow annotations | History proof, coverage/watermark và approved view | Bounded downsampling; scalar endpoint value sortable; series không sort trực tiếp |
| `return_30d_pct` | Approved cashflow-aware methodology | Null nếu input/method chưa certified | Exact denominator/method; không từ raw sparkline |
| `health`, `source_status` | Operational + publication/reconciliation quality | Business-safe status; sensitive topology redacted | Declared enum ordering; không “healthy” khi source stale/unverified |
| `qbts` với P/R/B và six atomic contributions | `q_i=F_pi(X_i)` từ đúng alpha/deployment/sleeve net economic path | Math-complete short sample có numeric `provisional`; runtime config/binding/cost/basis hợp lệ; own-slice disclosure riêng | Raw quality points/band, không nhân allocation trước; cùng q ở detail và manager row |
| `alpha_score_contribution` | `c_i=w_i*q_i`; raw score snapshot ref và full-scope weight | Manager; researcher chỉ khi field policy cho phép mà không lộ denominator/hidden scope | Điểm đóng góp, không PnL/risk contribution; `band_code=null` luôn |
| `alpha_score` | `A=sum(w_i*q_i)`, `w_i=a_i/sum(a)` trên allocated economic capital verified | Manager; numeric available/provisional raw scores cùng basis/window, full denominator; missing q → partial coverage | Subtitle “Chất lượng trên vốn đã phân bổ”; không là kết quả danh mục; disclose provisional allocation weight |
| `portfolio_score` | `F_pi(X_p)` trực tiếp từ portfolio NAV/flows/cost/stress path; manager dùng dedup consolidated path | Own economic input/config/maturity status; không phụ thuộc full alpha-q coverage, grouping hoặc Regime | Không average child scores, không composition fallback/HHI penalty; cash và internal transfer đúng scope |
| `regime_fit` | Bound historical research run/version/params + stage/evidence history | Research binding/features/support policy riêng; missing → typed null/abstention của Regime | Descriptive historical matching, không prediction/probability, không sửa QBTS/band hoặc direct PortfolioScore |
| `initial_funds`, `added_funds`, `returned_funds` | TS applied funding/return receipts, root elimination | Manager; full fund/portfolio totals blocked researcher | Initial bucket bất biến theo definition; added bucket không gồm trading profit |
| `net_pnl`, `nav`, `return_pct` | Authoritative economics/valuation; canonical return method | Quality/completeness riêng từng field | PnL không cashflow; percentages giữ denominator; no invented bucket PnL |

`source_confidence` ghi trạng thái bằng chứng như `VERIFIED`, `PARTIAL`, `UNVERIFIED`, `INSUFFICIENT_DATA`; enum cuối cần pin với canonical contract. Confidence không làm thay authorization, completeness hoặc business readiness. Provenance chứa reference opaque tới authorized evidence, không leak hidden account/source IDs. Field catalogue phải có cả unavailable variants để HIFI không tự điền số giả.

### 7.3 Hợp đồng scoring đã chọn và dependency độc lập

`SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` là authority duy nhất của formula `qbts_prb_v1_1` và bands `quality_bands_v1_1`. Công thức, trọng số và bands đã được chủ hệ thống chọn. Runtime anchors theo horizon, delta stress, block horizon/origin, evidence/maturity/freshness thresholds, precision và calibration/release artifact chưa có số production trong cuộc duyệt; thiếu chúng trả `policy_pending`, không lấy fixture làm default. Các biểu thức dưới là contract checks trích đúng companion, không cho phép một implementation công thức riêng tại FE/BFF.

#### 7.3.1 Formula và năm bands

- `F_pi(X)=0.45*P+0.30*R+0.25*B`.
- `P=0.70*N_T(TWR_excess)+0.30*N_SR(SR_period)`.
- `R=0.60*N_MDD_minus(MDD)+0.40*N_ADD_minus(ADD)`.
- `B=0.50*(100*p_positive_blocks)+0.50*N_T(TWR_stress_excess)`.
- Six atomic weights tương ứng: `0.315 / 0.135 / 0.180 / 0.120 / 0.125 / 0.125`. Không renormalize khi thiếu component, không confidence multiplier, HHI discount hoặc regime modifier.

`N_m_plus(x)=100*clip((x-L_m)/(U_m-L_m),0,1)`; `N_m_minus=100-N_m_plus`. Anchors finite, U>L, downside anchors không âm, fixed per compatible profile/window; net/stress TWR dùng **cùng** anchors. TWR excess là `product(1+r_net)-product(1+r_cash)`, không compound arithmetic excess returns. `SR_period=mean(r_net-r_cash)/sample_std(r_net-r_cash)` cùng grid, không annualize mặc định; n>=2 và std>0. Net path đã loại external-flow effects, gồm cash, realized/unrealized PnL và required baseline costs.

Từ unitized `E_0=1`, `E_t=E_(t-1)*(1+r_t)`, `DD_t=1-E_t/max(E_0..E_t)`; MDD=max DD và ADD=mean DD của toàn window, **gồm DD=0**, không thêm E0 vào sample. Positive blocks là fraction complete, predeclared nonoverlapping blocks có net excess TWR>0; tie=0, no-trade-but-valued block vẫn tính, completed block missing không được loại để làm ratio đẹp. K>=1 là math minimum; maturity riêng.

Stress là **một fixed-path additional-cost scenario**: `DeltaC_j=(delta_bps/10000)*gross_executed_notional_j`, `r_stress_j=r_net_j-DeltaC_j/V_start_after_flow_j`; compound rồi trừ cash TWR cùng window. Mỗi fill side tính một lần, derivative/inverse notional theo instrument authority/FX, internal transfers không turnover. Không trừ baseline fees/slippage hai lần; không mô tả thành execution resimulation. Verified zero turnover khác missing turnover. `1+r_stress<=0` → `INVALID_STRESS_PATH`; stress TWR không được cao hơn net TWR khi path hợp lệ. Missing required fees → `partial_costs`; missing gross notional chỉ làm stress/Robustness/full composite partial khi baseline metrics còn độc lập hợp lệ.

| Canonical score chưa UI rounding | Band code | Nhãn |
|---|---|---|
| `[0,40)` | `weak` | Yếu |
| `[40,60)` | `neutral` | Trung tính |
| `[60,75)` | `fair` | Khá |
| `[75,90)` | `good` | Tốt |
| `[90,100]` | `very_good` | Rất tốt |

Band dùng canonical value trước display rounding; 74.999 vẫn `fair`, không trình bày “75.0 — Khá” gây hiểu nhầm. Null không band/không zero; contribution và bounds không quality band. Provisional numeric nhận band với badge “Sơ bộ”, không claim statistical validation, percentile, probability hoặc quyền Live.

#### 7.3.2 Bốn outputs và manager economic subject

| Output | Input và ý nghĩa | Độc lập cần giữ |
|---|---|---|
| `qbts` (`q_i`) | F_pi của exact alpha/deployment/sleeve path; raw quality | Manager denominator/grouping đổi không đổi q nếu path/basis không đổi; sizing/leverage thực đổi có thể đổi path/q. |
| `alpha_score_contribution` (`c_i`) | `w_i*q_i`, raw score ref + full-scope allocation snapshot | Không band, không PnL/risk contribution; không gọi c là raw quality. |
| `alpha_score` (`A`) | `sum_i(c_i)` trên mọi positive allocated economic capital thuộc scope | Missing/incomparable q ảnh hưởng A; không hidden renormalization. Idle cash không q=0; subtitle bắt buộc “Chất lượng trên vốn đã phân bổ”. |
| `portfolio_score` (`q_p`, manager `q_M`) | F_pi trực tiếp từ own portfolio hoặc consolidated manager/root NAV/flows/costs/benchmark/stress | Không mean raw scores/child PortfolioScores, không A trừ concentration. Missing q/grouping/research linkage của alpha không tự chặn score economic path đã reconcile. |

`a_i` là allocated economic capital đã verified, không budget/margin/exposure. `w_i=a_i/sum(a)` gồm cả missing/stale/incomparable positive-allocation rows; UI filter/lifecycle/hidden researcher rows không làm đổi manager denominator. Raw scores valid cho A là fresh/bound numeric `available` hoặc `provisional`, dùng runtime config được duyệt và **cùng comparison window/basis**. Full coverage có provisional → A provisional và công bố `provisional_allocated_weight=sum(a_provisional)/sum(a_all)`; không discount. Thiếu q → A null `partial_coverage`, bounds `[sum_valid(w*q), sum_valid(w*q)+100*sum_missing(w)]` nếu cùng thang hợp lệ; subset average chỉ drill-down. Zero allocation → A null `no_allocation`; PortfolioScore vẫn xét own NAV, kể cả book có cash.

Portfolio/root manager score dựng path từ consolidated authoritative ledger, loại duplicate accounts/fills và internal transfers, gồm cash/reserves/costs/FX cùng basis. Transfer giữa hai portfolios là internal với root, external với từng child; không average child score hoặc dùng current allocation để backfill historical returns. `subject_type=manager_book` là analytics metadata ánh xạ root, không thêm PM book entity. Single alpha và portfolio cùng exact path/cost/cash/basis phải cho cùng quality score; chia clone rows không đổi economic score.

HHI allocation, HHI score contribution, dispersion, correlation và risk contribution là diagnostics riêng. Grouping thiếu chỉ chặn diagnostics cần group; dispersion cần q/weights nhưng không cần group. Missing correlation không được điền 0. Score HHI tại zero positive score credit trả null; không suy PortfolioScore từ HHI hoặc number of lineages.

#### 7.3.3 Trạng thái, basis, timeline và evidence binding

Phân biệt numeric validity, evidence maturity và runtime config. Raw/direct score numeric: `available`, `provisional`; non-numeric gồm `policy_pending`, `unbound`, `invalid_data`, `stale`, `partial_costs`, `partial_components`, `insufficient_data`. A thêm `partial_coverage`, `incomparable_basis`, `no_allocation`. Không đặt maturity gate dài hạn thành điều kiện numeric khi đủ toán/dữ liệu; cũng không điền component thiếu bằng 0 hoặc thay weights. Full score null giữ components/bounds chỉ khi dependencies của chính chúng hợp lệ. Missing baseline fees có thể invalid toàn net path, không giữ TWR/SR/DD/blocks như đã net đầy đủ.

`comparable_basis_id` pin verified economic domain/series kind, window/frequency/calendar/timezone, currency/cash/FX/cost/flow policy, formula/config/calibration/stress/block versions. `individual_evidence_binding_id` giữ exact alpha/deployment/version/strategy params/trade params/data snapshot; portfolio/root dùng `subject_binding_id` với economic ownership/consolidation manifest. Binding riêng khác nhau giữa alpha là bình thường. `basis_id` legacy chỉ alias của comparable basis, không unique run/alpha identity. Research binding/run ID bắt buộc **khi dùng research evidence hoặc Regime Fit**; economic NAV score không cần bịa run ID nếu không dùng research evidence.

Short score chỉ dùng effective window thật với calibration duration tương ứng. Score 5 ngày không là score 30 ngày, không annualize/extrapolate để vào 30d headline. Hai alpha đủ cùng 7d window nhưng maturity limited có thể aggregate numeric provisional trên chính 7d basis. Chưa có duration config → policy pending/explicit preview, không dùng anchors khác horizon. Source/data faults giải quyết trước, maturity xét sau; last-known stale value tách snapshot khỏi current numeric valid set.

Timeline Paper→Sandbox→Canary→Live giữ mọi segment provenance. Canary→Live cùng actual economic path/config/accounting liên tục không reset score window/peak vì tên stage. Cross-stage forward observation chỉ nối unitized returns theo **predeclared authoritative-source-per-interval**, nonoverlap, version/executable equivalence verified, aligned grid/cash/cost/FX và transition/continuity manifest; không cherry-pick source theo outcome, không backfill gap bằng nguồn đẹp hơn. Không nối nominal virtual/actual capital. Mixed observation có `series_kind=cross_stage_forward_observation`, `economic_domain=mixed_observation`, label “Forward tổng hợp xuyên stage — không phải actual track record”, actual/total durations riêng và comparison facet riêng; không thay actual portfolio/manager headline. Thiếu continuity → giữ segment cards, không full stitched score.

Regime Fit giữ exact research binding/run/version/params và available-at/cutoff; features/reference outcomes hoàn tất, scaler/support policy khóa trước evaluation. Status và descriptive matched historical outcomes độc lập P/R/B, band và TradeState. Missing Regime không invalidate raw q/PortfolioScore có economic inputs hợp lệ; score/Regime outage không vô hiệu authorized close/reduce-risk. UI không được ghi supported thành win probability hoặc execution-ready.

#### 7.3.4 Owner, computation và release dependency

Shared module ngoài order path là formula authority; reuse accounting/TWR inputs đã có, không tạo economic kernel thứ hai. Worker có bounded compute/corrections/replay budget; Portal BFF authorize trước join/serialize, serve immutable results/cache, không heavy synchronous dashboard recompute. tradingEdge/TS phát facts và receipts, không calibration/nearest-neighbor trong order loop. Current user permission tách score policy; researcher chỉ approved own slice, không manager denominators/provisional weights/hidden contributions qua DTO, sort, cache, export hoặc SSE.

Formula và bands đã approved-design; production numeric release cần approved calibration/config và source/window proof. Thiếu calibration chỉ chặn numeric metrics phụ thuộc; không chặn Fund absolute economics, catalogue, safe read-only UI, unrelated commands/status hoặc Regime branch có config độc lập. Exact config approval không là repo/VPS/deploy/Live approval. Compatibility/migration phải xóa semantic fallback của score cũ, giữ historical legacy version và original/restated snapshots riêng.

## 8 Read model và storage tối thiểu

### 8.1 Sở hữu ghi và đường dữ liệu

TS facts/receipts/outbox hoặc approved read APIs → Edge ingestion/checkpoint → Portal read projections → BFF scoped queries → React snapshot/delta. Chỉ một writer cho mỗi projection partition/generation; reader không sửa projection. Nếu Edge đã cung cấp projection phù hợp, reuse thay vì thêm một bản sao BFF. Portal governance tables vẫn do Portal authority ghi; business projection không nhận write trực tiếp từ settings UI.

Ingestion không trở thành TS transaction participant. TS commit receipt là sự thật; projection eventual consistency được biểu đạt bằng watermarks. Outbox/checkpoint/resume và source continuity có contract; nếu upstream chỉ cung cấp polling API, adapter poll tập trung, bounded cadence và revision-aware, không mỗi browser poll TS.

### 8.2 Logical stores đề xuất

| Store logic | Key và fields cốt lõi | Index chính | Retention và rebuild |
|---|---|---|---|
| Governance effective grants | subject, action, resource scope, interval, revision, ceiling ref | subject+revision; resource+action; active interval | Immutable events và effective projection; giữ audit |
| Business membership proposals | proposal ID/key/digest, expected version, TS receipt/status | unique principal+scope+key; status+updated_at | Pending/rejected không thành grant; replay idempotent |
| Registry projection | resource kind/id, canonical refs, version, generation | type+mode+ID; portfolio+deployment; alpha+deployment | Rebuild từ registry snapshot/events; aliases riêng |
| Assignment and owner intervals | resource ID, valid_from/to, recorded sequence, source revision | resource+effective range; account+assignment | Bitemporal provenance; không cascade delete |
| Overview projection | target scope/currency/basis/cutoff/generation, metrics/quality, field-policy/model revisions | scope+as_of; mode+scope; authorized relation join | Rebuildable, source-set digest |
| Capital statement projection | command/receipt leg/source revision, currency, typed effect | scope+effective_at+ID; command ID; source ID unique | Immutable receipt lineage; corrections versioned |
| Obligation projection | original order/reservation/account/binding/assignment, state/version | account+nonterminal; source correlation | Unknown retained; terminal retention policy |
| Command tracking | scoped key/digest, delivery attempts, TS receipt/state, versions | unique idempotency scope+key; pending+next_check | Outcome durable; no retry-new-key |
| Ingestion dedupe/checkpoint | source+partition+epoch+event/version, offset, generation | unique source identity+revision; partition cursor | Atomic apply/checkpoint; retention đủ replay horizon |
| Audit and access invalidation | actor/subject/scope/revision/outcome/correlation | target+time; actor+time; policy revision | Append-only, protected retention |
| Shared score/regime outputs | typed subject binding, economic snapshot/consolidation refs, formula/config/band revision, window/basis, evidence/maturity, continuity manifest; research binding chỉ khi applicable | immutable input digest+policy+subject; scope+cutoff; allocation snapshot riêng A, grouping version riêng diagnostics | Canonical off-order-path worker/read model; original/restated revisions, bounded correction-aware recompute |

Đây là logical schema để hợp nhất với tables hiện có sau source review. Không tạo cả mười bảng nếu stores hiện có đủ contract; không nén các invariants required vào JSONB chỉ để giảm số bảng.

### 8.3 SQL minh họa đề xuất

```sql
-- CONCEPTUAL ONLY: tên, numeric precision và migration ID phải chốt từ catalog thật.
CREATE TABLE portal_command_tracking_v2 (
  command_tracking_id text PRIMARY KEY,
  principal_id text NOT NULL,
  idempotency_scope text NOT NULL,
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  resource_kind text NOT NULL,
  resource_id text NOT NULL,
  delivery_state text NOT NULL,
  business_state text,
  ts_command_id text,
  ts_receipt_ref text,
  expected_business_version text NOT NULL,
  app_policy_revision text NOT NULL,
  updated_at_ms bigint NOT NULL,
  UNIQUE (idempotency_scope, idempotency_key)
);
CREATE INDEX portal_command_pending_v2_idx
  ON portal_command_tracking_v2 (delivery_state, updated_at_ms, command_tracking_id);

CREATE TABLE portal_ingestion_checkpoint_v2 (
  source_id text NOT NULL,
  partition_id text NOT NULL,
  continuity_epoch text NOT NULL,
  projection_generation text NOT NULL,
  source_offset text NOT NULL,
  updated_at_ms bigint NOT NULL,
  PRIMARY KEY (source_id, partition_id, projection_generation)
);
```

Dedupe insert, projection update và checkpoint advance cùng một local transaction. Unknown commit của ingestion phải resolve checkpoint/dedupe record trước retry. Nếu apply projection xong nhưng checkpoint chưa commit được, atomic rollback hoặc replay idempotent phải chứng minh không double effect. Schema example không tạo foreign-key dependency tới hidden resources trong response; security predicate vẫn bắt buộc.

### 8.4 Aggregation đúng source set

Trước join, resolve authorized source identities theo effective assignment/owner và recorded cutoff. Group/dedupe từng economic source/revision theo semantics correction, sau đó aggregate. Hai facts khác nhau cùng `100` phải cộng `200`; một fact `100` join hai owner rows vẫn là `100`. Không dùng `SUM(DISTINCT amount)`.

Portfolio aggregate gồm các internal non-overlapping sources và residual được chứng minh thuộc portfolio. Root eliminate internal assignment/return hai phía; không cộng physical balance rồi cộng internal account NAV lần nữa. Researcher attribution là lát cắt cùng tài sản, không thêm tài sản mới. Nếu một internal/native account chứa nhiều alpha mà source không có attribution chứng minh được, không chia balance cho alpha theo allocation weight hoặc row count. Trả authorized account aggregate riêng hoặc unavailable; restricted researcher không nhận whole-account balance để giả own-alpha balance. Tổng theo broker là custody basis, tổng theo portfolio là management/attribution basis; không đặt chúng trong một grand total chung.

Query fixtures phải bao gồm same-alpha multi-instance, shared physical account, late fee sau đổi owner/assignment, corrections, incomplete pages và hidden siblings. RLS có thể là defense-in-depth nếu phù hợp repository, nhưng không mặc định claim đã có RLS; BFF/query-level scope vẫn phải test.

### 8.5 Correction và recomputation có ngân sách

Late fact/correction đổi source revision, không sửa ledger qua Portal. Projection lưu invalidation dependency từ source identity → affected account/AlphaVersion/portfolio/window → canonical model output. Chỉ recompute affected partitions/windows; immutable prior result vẫn tra được theo revision và recorded cutoff. Publish generation mới atomically với source-set digest, quality và calculation revision; browser nhận replacement/reset, không tự cộng lại score/PnL.

Recompute jobs có bounded queue, concurrency, CPU/memory/time budget, dedupe/coalescing key, retry backoff và cancellation/resume contract. Chưa có approved measurement thì chỉ chạy fixture/local design; production backfill cần approval riêng. Tránh scan toàn history cho mỗi correction, mỗi user hoặc mỗi request. Research computation dùng service/read-side đã tách budget khỏi TS hot path; không thêm analytics đắt, portfolio score hoặc regime ML vào TS transaction/admission loop. Vượt budget trả last certified snapshot với stale label hoặc unavailable theo policy; không bỏ authorization, precision hoặc correction proof để nhanh hơn.


## 9 API surface và command bridge

### 9.1 Route inventory đề xuất

**Toàn bộ đường dẫn `/api/v2/...` trong mục này là NEW PROPOSED**, không phải API đã tìm thấy trong source. Ưu tiên adapter trên `/api/admin/profile-access`, `/api/admin/accounts` và `/api/v1/execution/...` hiện hữu nếu đáp ứng compatibility; không buộc mở version route mới. Phase ELP2-00/05 phải map vào route hiện hữu, chọn adapter hoặc route mới và pin OpenAPI version. Existing route chỉ được ghi existing khi có source path/commit ở mục 2.2. Không đổi route production chỉ để khớp tên minh họa.

| Route NEW PROPOSED | Dataset hoặc command | Authority và gate |
|---|---|---|
| `GET /api/v2/me/profile` | Verified profile, current effective rights, pending proposals | Self, no raw identities/secrets beyond permitted fields |
| `GET /api/v2/users` và `GET /api/v2/users/{id}/access` | Scoped directory/access matrix | User-read/admin scope, protected fields redacted |
| `POST /api/v2/access/preview` | Before/after grant impact | Current grant authority và delegation ceiling |
| `POST /api/v2/access/proposals` | App change hoặc TS business membership proposal | Current actor, CAS/idempotency, protected-owner guards |
| `POST /api/v2/users/{id}/lifecycle` | Activate/suspend/archive, session invalidation | Separate user-manage capability, no self/owner bypass |
| `GET /api/v2/catalogue` | Dataset capabilities/schemas/availability theo scope | Không lộ hidden resource inventory |
| `GET /api/v2/manager/fund-overview` | Root funding/cashflows/NAV/PnL and model refs | Explicit business.read_all + source/metric gates |
| `GET /api/v2/manager/portfolio-overview` | Authorized portfolio summaries | Manager full view; researcher route uses distinct restricted schema |
| `GET /api/v2/manager/alpha-fleet` | Typed query, snapshot-bound page/group aggregates | Field policy before sort/filter/group/page; manager or approved own slice |
| `GET /api/v2/portfolios/{id}/researcher-view` | Eligible portfolio shell and own linked alpha slice | Verified current owner user_id; no full totals or peers |
| `GET /api/v2/research-model-results/{id}` | Canonical score/regime artifact reference | Authorized source/model result only; not expensive recompute-on-read |
| `GET /api/v2/portfolios` và `GET /api/v2/portfolios/{id}/overview` | Portfolio registry/360 snapshot | Current portfolio read và authorized source set |
| `GET /api/v2/alphas` và `GET /api/v2/alphas/{id}/overview` | Own/shared alpha + permitted instances | Không lộ deployments ngoài scope |
| `GET /api/v2/accounts/{id}/overview` | Exact internal account 360 | Account scope, mode và native metadata redaction |
| `GET /api/v2/brokers/{id}/accounts` | Verified physical registry subset | Explicit custody/broker scope |
| `GET /api/v2/resources/{kind}/{id}/capital-statement` | Typed applied capital/budget rows | Exact resource + report capability |
| `GET /api/v2/resources/{kind}/{id}/obligations` | Orders/reservations/unknowns/drain blockers | Resource scope, no hidden cross-scope detail |
| `POST /api/v2/commands/preview` | TS authoritative preview/dry-run | Action/scope/current policy; no reserve |
| `POST /api/v2/commands` | Trusted command dispatch | CSRF, idempotency, expected versions, TS commit checks |
| `GET /api/v2/commands/{id}` | Delivery/business status và receipt | Exact command resource access, no enumeration |
| `GET /api/v2/events` | Scoped dataset snapshot/delta subscription | Current policy + cursor binding + replay filtering |
| `POST /api/v2/exports` và `GET /api/v2/exports/{id}` | Snapshot-bound authorized export | Separate export right; recheck lúc download |
| `GET /api/v2/audit` | Scoped actor/command/resource timeline | Audit scope và redaction |

Không có business mutation bằng GET. Read-only URL không chứa secret, access token hoặc sensitive identity. Batch mutation nếu được hỗ trợ phải định nghĩa atomic/per-item behavior; không report toàn batch APPLIED khi vài item rejected. Baseline có thể không hỗ trợ batch write để giữ contract gọn.

### 9.1.1 Manager payload đề xuất và fixture compatibility

Các JSON dưới là synthetic schema examples, không là API runtime hoặc financial evidence. Fields money/score đầy đủ phải tuân metric capsule §6.2.2; phần abbreviated reference không cho phép thiếu required metadata trong schema thật.

```json
{
  "schema_version": "portal.manager-overview.v1.2",
  "view_kind": "MANAGER_FULL",
  "scope": {"root_id": "R_FIXTURE", "stage_filter": "ALL", "economic_domain": "REAL_FUNDED", "eligible_stage_set": ["LIVE", "CANARY"]},
  "snapshot_id": "snap_manager_fixture",
  "field_policy_revision": "proposal-not-approved",
  "availability": "PARTIAL",
  "economic_source_set": {"ref": "real_funded_unique_accounts_fixture", "native_profile_proof_ref": "verified_profile_fixture", "dedupe_basis": "UNIQUE_AUTHORITY_ACCOUNT_SOURCE"},
  "simulation_partition_refs": ["paper_cohort_fixture", "sandbox_demo_cohort_fixture"],
  "funding": {
    "initial_funds": {"value": "1000.00", "currency": "USDT", "basis": "APPLIED_INITIAL_FUNDING"},
    "added_funds": {"value": "200.00", "currency": "USDT", "basis": "APPLIED_ADDITIONAL_FUNDING"},
    "returned_funds": {"value": "300.00", "currency": "USDT", "basis": "APPLIED_RETURN_CAPITAL"},
    "net_contributed": {"value": "900.00", "currency": "USDT"}
  },
  "performance": {
    "net_pnl": {"value": "0.00", "currency": "USDT", "source_ref": "economics_fixture"},
    "return_pct": {"value": null, "unit": "PERCENT", "denominator": null, "reason": "METHODOLOGY_NOT_CERTIFIED"},
    "pnl_by_funding_bucket": {"availability": "UNAVAILABLE", "reason": "LOT_ATTRIBUTION_METHOD_NOT_APPROVED"}
  },
  "model_result_refs": {"alpha_score": null, "portfolio_score": null},
  "provenance": {"source_set_digest": "fixture_digest", "calculation_revision": "1", "facts_through_ms": 1792022400000}
}
```

```json
{
  "schema_version": "portal.alpha-fleet.v1.2",
  "view_kind": "MANAGER_FULL",
  "snapshot_id": "snap_fleet_fixture",
  "query": {"stage_filter": "ALL", "lifecycle_filter": "ACTIVE", "sort": [{"field": "alpha_id", "direction": "ASC"}, {"field": "row_id", "direction": "ASC"}], "group_by": "portfolio_id"},
  "field_policy_revision": "proposal-not-approved",
  "rows": [{
    "row_id": "fleet_A1_V3_P1",
    "alpha_id": "A1", "alpha_version_id": "V3", "owner_user_id": "U_RESEARCHER_1", "portfolio_id": "P1",
    "stage_presence": ["PAPER", "SANDBOX"], "lifecycle_status": "ACTIVE",
    "combined_monetary_metrics": {"availability": "UNAVAILABLE", "reason": "MIXED_ECONOMIC_DOMAINS"},
    "stage_metrics": [
      {"stage": "PAPER", "economic_domain": "PAPER_SIMULATION", "cohort_id": "paper_cohort_fixture", "source_proof_ref": "non_custodial_paper_fixture", "metric_partition_ref": "paper_metrics_fixture"},
      {"stage": "SANDBOX", "economic_domain": "SANDBOX_DEMO", "cohort_id": "sandbox_demo_cohort_fixture", "native_profile_proof_ref": "verified_sandbox_profile_fixture", "metric_partition_ref": "sandbox_metrics_fixture"}
    ],
    "metric_partition_fields": ["alloc", "pnl_amount", "unrealized_pnl", "account_balance", "equity_30d"],
    "health": "DEGRADED", "source_status": "PARTIAL",
    "qbts": {"result_ref": "shared_score_fixture", "comparable_basis_id": "selected_forward_basis_fixture", "individual_evidence_binding_id": "alpha_A1_V3_paper_economic_fixture", "evidence_view": "FORWARD_SIMULATED", "value": null, "status": "policy_pending", "formula_approved": true, "runtime_config_approved": false, "band_code": null, "reason_codes": ["RUNTIME_CALIBRATION_NOT_APPROVED"]}
  }],
  "next_cursor": "opaque_snapshot_query_policy_bound",
  "group_totals": {"availability": "UNAVAILABLE", "reason": "MIXED_ECONOMIC_DOMAINS", "economic_partition_refs": ["paper_metrics_fixture", "sandbox_metrics_fixture"]}
}
```

Một `metric_partition_ref` phải resolve sang cùng snapshot/policy và payload có `economic_domain`, cohort/profile/binding proof, unique account/source-set digest, stage set, currency/basis, cutoff và metric capsules. Không có scalar amount chung ngầm cho row nhiều domains. Ví dụ capsule đầy đủ cho một Paper partition:

```json
{
  "field": "pnl_amount",
  "value": "10.00",
  "unit": "MONEY",
  "currency": "USDT",
  "economic_domain": "PAPER_SIMULATION",
  "source_proof_ref": "non_custodial_paper_fixture",
  "basis": "NET_AUTHORITATIVE_SIMULATION_PNL",
  "window": {"start_ms": 1791936000000, "end_ms": 1792022400000},
  "denominator": null,
  "methodology_ref": "approved_economics_policy_fixture",
  "availability": "AVAILABLE",
  "quality": {"completeness": "COMPLETE", "freshness": "FRESH", "coverage": "AUTHORIZED_ONLY"},
  "source_confidence": "VERIFIED",
  "provenance": {"source_set_digest": "paper_sources_fixture", "recorded_through_ms": 1792022400000},
  "calculation_revision": "1",
  "policy_revision": "fixture_policy_not_production"
}
```

### 9.1.2 Restricted portfolio payload đề xuất

Đây là schema riêng, không response full portfolio rồi redact tùy FE. Middleware áp field allowlist và query allowlist trước fetch/aggregation. Example chỉ có identity/stage và model refs chưa bật; exact metric disclosure cần field matrix được duyệt.

```json
{
  "schema_version": "portal.researcher-linked-slice.v1.2",
  "view_kind": "RESEARCHER_LINKED_SLICE",
  "portfolio": {"id": "P1", "label": "Portfolio fixture"},
  "is_full_portfolio": false,
  "coverage": "AUTHORIZED_ONLY",
  "field_policy_revision": "proposal-not-approved",
  "eligibility": {"basis": "CURRENT_RESEARCHER_OWNER_USER_ID_LINK", "decision_ref": "opaque_self_scope_decision"},
  "rows": [{"alpha_id": "A1", "alpha_version_id": "V3", "stage_presence": ["PAPER"], "lifecycle_status": "ACTIVE", "approved_metric_refs": []}],
  "visible_count": 1,
  "capabilities": {"export": false, "stream": false, "mutations": []},
  "next_cursor": null
}
```

Không có `portfolio_total`, `peer_rows`, `hidden_count`, `total_count_all`, full `portfolio_score` hay native custody total. Denied field queries trả safe error trước sorting/filtering; dùng cùng not-found shape cho nonexistent/not-eligible portfolio. Policy revision thay đổi invalidates snapshot/cursor và rechecks download/replay.

### 9.1.3 Shared score wire contract và trạng thái độc lập

Exact schema/formula authority là `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` §§8–9; Portal giữ nguyên nghĩa tại explicit versioned adapter. Tên field/schema dưới là target contract, chưa claim endpoint đã deploy. Lowercase analytics status không silent map thành uppercase transport/business availability: một snapshot `PARTIAL` có thể chứa PortfolioScore `available`, A `partial_coverage` và Regime `unbound` cùng lúc.

| Group | Fields bắt buộc hoặc conditional | Validation/mapping |
|---|---|---|
| Shared quality envelope | `value`, `status`, `reason_codes`, `policy_version`, `formula_hash`, `policy_hash`, `approved_policy_id`, `band_code`, `band_policy_version`, `components`, `bounds`, `evidence_status`, `revision`, `supersedes_revision` | Scores/metrics/components/bounds decimal strings/null; raw/direct/A `[0,100]`; null không band; approved formula không thay approved runtime config. |
| Exact subject | `subject_type`, subject refs; `individual_evidence_binding_id` hoặc `subject_binding_id`, `data_snapshot_id` | Alpha/deployment/sleeve có own economic binding; portfolio/root consolidated binding; `manager_book` analytics-only. Research linkage `not_applicable` được phép cho NAV-only score. |
| Comparison/time | `comparable_basis_id`, `requested_window_start_ms`, `requested_window_end_ms`, `window_start_ms`, `window_end_ms`, `as_of_ms`, `knowledge_cutoff_ms`, `computed_at_ms` | UTC epoch-ms safe integers; `[start,end)`; requested/effective duration không bị tráo. `basis_id` chỉ legacy alias, explicit adapter. |
| Evidence/continuity | `sample_count`, `complete_block_count`, `trade_count`, `observed_duration_ms`, `actual_duration_ms`, `stage_breakdown`, `series_kind`, `economic_domain`, continuity/source-selection refs khi mixed | Counts validated integers, duration union không overlap; stage không tự xác định domain. Actual và mixed observation facets riêng. |
| P/R/B và atomic metrics | `performance`, `risk`, `robustness`; net/cash/excess TWR, SR_period, MDD, ADD, positive block ratio, stress excess TWR; normalized/contribution points | Metric-specific status/dependencies; six fixed weights; no missing-to-zero/no reweight; exact formula §7.3.1. |
| Costs/policy | `cost_coverage`, `stress_policy_id`, calibration/block/precision/source refs | Required baseline fees khác incremental stress; missing turnover khác verified zero; fixture policy không publish production. |
| `alpha_score_contribution` | `value`, `allocation_weight`, `raw_score_ref`, `allocation_snapshot_id`, `band_code` | Value=w*q, band always null; weight full denominator; no raw-quality label. |
| `alpha_score` | Shared relevant fields + `allocation_snapshot_id`, `score_coverage_allocated`, `unscored_allocated_weight`, `provisional_allocated_weight`, `mature_allocated_weight`, `allocation_coverage_nav`, `scored_nav_weight`, `idle_cash_weight` | Valid q includes provisional same-basis/window; NAV coverage only verified current-NAV partition; missing q affects A only. |
| `portfolio_score` | Shared fields + `return_source_snapshot_id`, `consolidation_manifest_id` | Direct economic NAV; no required alpha-score list, HHI, lambda or bound research run when not using research. |
| `diagnostics` | Allocation/score HHI, dispersion, correlation/risk contribution; own status/coverage/grouping refs | Not PortfolioScore inputs. Unknown grouping does not block A/raw/direct scores; negative risk contribution is not allocation weight. |
| `regime_fit` | `status`, `reason_codes`, `policy_version`, `policy_hash`, `approved_policy_id`, `research_binding_id`, `bound_run_id`, `strategy_version`, `params_hash`, feature/evidence snapshots, `as_of_ms`, `feature_cutoff_ms`, `reference_cutoff_ms`, distance, neighbor/effective sample/episode counts, stage summaries | Exact research binding mandatory; observed support descriptive, never probability. Canonical unsuffixed legacy timestamps map explicitly to `_ms` preserving source precision. |
| `preview`, last-known | Separately labelled objects with own policy/window/as-of/revision | Policy-pending preview/stale snapshot excluded from current valid aggregate. Provisional is current numeric when valid, not forced into preview. |

Coverage/provisional weights và stage breakdown có thể lộ full composition. Researcher slice không nhận manager totals/denominators/hidden contributions/peer status reasons, kể cả error metadata; approved raw own-alpha field vẫn phải exact authorized binding. Research binding missing chỉ làm metric thực sự dùng research evidence unbound; không cascade sang direct portfolio NAV score.

Cache keys gồm authorized scope/principal-policy revision, formula/config/basis/window/source revisions; A thêm allocation snapshot; direct portfolio thêm consolidated ledger manifest; mixed observation thêm continuity/source-selection manifest; group diagnostics thêm grouping version. Không bắt grouping update thay PortfolioScore key/value nếu economics không đổi. Recompute khi sealed valuation/cost/FX/benchmark watermark, complete block, allocation change, policy release hoặc source correction; không dùng chưa-closed bar làm completed observation. Late fees tạo new revision, `original_as_published` và `restated` tách nhau; replay không nhìn artifact available sau as-of.

#### 9.1.3.1 Fixture raw q 73.3 và attribution

**Synthetic contract fixture only.** Các anchors ở companion §5.9 và 8-day duration dưới chỉ để kiểm toán mapping, không calibration/release production. Giả sử fixture policy đã có đủ approved-in-fixture config, 16 samples/8 completed blocks cùng grid, math complete nhưng evidence limited. Normalized atomic points 80/80/60/75/75/65 cho P=80, R=66, B=70 và q=73.3. Thay maturity không thay numeric value.

```json
{
  "schema_version": "portal.score-view.v1.2",
  "execution_context": "SYNTHETIC_FIXTURE_ONLY",
  "subject_type": "deployment",
  "subject_ref": "D_ALPHA_FIXTURE",
  "qbts": {
    "value": "73.3", "status": "provisional", "reason_codes": ["EVIDENCE_LIMITED"],
    "band_code": "fair", "band_policy_version": "quality_bands_v1_1",
    "policy_version": "qbts_prb_v1_1", "formula_hash": "fixture_formula_hash",
    "policy_hash": "fixture_only_config_hash", "approved_policy_id": "fixture_only_policy",
    "evidence_status": "limited", "comparable_basis_id": "fixture_actual_8d_profile",
    "individual_evidence_binding_id": "fixture_deployment_economic_binding",
    "research_linkage": "not_applicable",
    "requested_window_start_ms": 1791331200000, "requested_window_end_ms": 1792022400000,
    "window_start_ms": 1791331200000, "window_end_ms": 1792022400000,
    "as_of_ms": 1792022400000, "knowledge_cutoff_ms": 1792022400000, "computed_at_ms": 1792022401000,
    "sample_count": 16, "complete_block_count": 8, "trade_count": null,
    "observed_duration_ms": 691200000, "actual_duration_ms": 691200000,
    "economic_domain": "actual", "series_kind": "single_domain_economic",
    "stage_breakdown": [{"stage": "CANARY", "observed_duration_ms": 345600000}, {"stage": "LIVE", "observed_duration_ms": 345600000}],
    "components": {
      "performance": {"value": "80", "net_excess_twr": {"raw": "0.06", "normalized": "80", "contribution": "25.2"}, "sharpe_period": {"raw": "0.12", "normalized": "80", "contribution": "10.8"}},
      "risk": {"value": "66", "mdd": {"raw": "0.04", "normalized": "60", "contribution": "10.8"}, "add": {"raw": "0.01", "normalized": "75", "contribution": "9"}},
      "robustness": {"value": "70", "positive_block_ratio": {"raw": "0.75", "normalized": "75", "contribution": "9.375"}, "stress_excess_twr": {"raw": "0.045", "normalized": "65", "contribution": "8.125"}}
    },
    "bounds": null, "cost_coverage": {"status": "complete", "source_ref": "fixture_net_cost_manifest"},
    "stress_policy_id": "fixture_only_additional_cost_policy", "data_snapshot_id": "fixture_economic_snapshot",
    "revision": "1", "supersedes_revision": null
  },
  "alpha_score_contribution": {
    "value": "18.325", "allocation_weight": "0.25", "raw_score_ref": "fixture_q_73_3_rev1",
    "allocation_snapshot_id": "fixture_allocation_snapshot", "band_code": null
  }
}
```

`trade_count=null` ở ví dụ vì không dùng count này làm math input, không phải bằng chứng missing fill notional. Source fixture vẫn giả định baseline/stress manifests đầy đủ. Production turnover/cost proof bắt buộc riêng. Lowercase `actual`/`single_domain_economic` là analytics vocabulary; adapter phải map explicit từ verified operational domain refs, không đổi `financial_stage` enums.

#### 9.1.3.2 Composition thiếu q nhưng direct PortfolioScore vẫn available

Synthetic example với NAV100, cash20, allocation60/20, q90/missing và current-NAV partition proof: A coverage=.75, bounds[67.5,92.5]. Direct portfolio economic path có đủ own inputs/config và maturity trong fixture nên score riêng 73.3; con số này từ P/R/B fixture, **không suy từ allocations/q rows**. Grouping và Regime thiếu không hạ direct status. Các envelopes/provenance đã khai ở §9.1.3 vẫn required; JSON dưới chỉ là state fragment.

```json
{
  "execution_context": "SYNTHETIC_FIXTURE_ONLY",
  "alpha_score": {
    "value": null, "status": "partial_coverage", "reason_codes": ["RAW_ALPHA_SCORE_MISSING"], "band_code": null,
    "score_coverage_allocated": "0.75", "unscored_allocated_weight": "0.25", "provisional_allocated_weight": "0",
    "mature_allocated_weight": "0.75", "allocation_coverage_nav": "0.8", "scored_nav_weight": "0.6", "idle_cash_weight": "0.2",
    "bounds": {"lower": "67.5", "upper": "92.5"}, "allocation_snapshot_id": "fixture_a60_a20"
  },
  "portfolio_score": {
    "value": "73.3", "status": "available", "reason_codes": [], "band_code": "fair",
    "band_policy_version": "quality_bands_v1_1", "policy_version": "qbts_prb_v1_1",
    "subject_binding_id": "fixture_portfolio_economic_binding", "research_linkage": "not_applicable",
    "return_source_snapshot_id": "fixture_complete_portfolio_nav", "consolidation_manifest_id": "fixture_verified_ownership",
    "evidence_status": "sufficient_for_display"
  },
  "diagnostics": {"allocation_hhi": {"value": null, "status": "unavailable", "reason_codes": ["GROUPING_INCOMPLETE"]}},
  "regime_fit": {"status": "unbound", "reason_codes": ["RESEARCH_BINDING_MISSING"], "matched_outcome_summary": null}
}
```

Khi q missing ở row allocation20 có q=50 provisional cùng window/basis, A=80 `provisional`, coverage1, provisional weight=.25; direct score không tự thay vì thay availability của q. Ngược lại đủ q nhưng NAV thiếu → chỉ direct score unavailable, không lấy A làm fallback. Cash-only có zero excess variance → direct score partial/null theo Sharpe, không gán 0/100.

#### 9.1.3.3 Missing stress và missing fees là typed null khác nhau

Fragment fixture dùng cùng năm baseline atomic inputs như q73.3, nhưng chưa có gross notional cho stress. Known contribution sum=65.175, upper=77.675; B/full score null, P=80 và R=66 vẫn hợp lệ. Đây là mathematical bounds, không confidence interval/band.

```json
{
  "execution_context": "SYNTHETIC_FIXTURE_ONLY",
  "stress_missing": {
    "value": null, "status": "partial_components", "band_code": null,
    "reason_codes": ["GROSS_EXECUTED_NOTIONAL_MISSING"],
    "components": {
      "performance": {"value": "80"}, "risk": {"value": "66"},
      "robustness": {"value": null, "positive_block_ratio": {"raw": "0.75", "normalized": "75"}, "stress_excess_twr": {"raw": null, "normalized": null, "contribution": null}}
    },
    "bounds": {"lower": "65.175", "upper": "77.675"}
  },
  "required_fees_missing": {
    "value": null, "status": "partial_costs", "band_code": null,
    "reason_codes": ["REQUIRED_FEE_FACT_MISSING"], "bounds": null,
    "components": {"performance": {"value": null}, "risk": {"value": null}, "robustness": {"value": null}},
    "cost_coverage": {"status": "partial", "missing_required_costs": ["applicable_funding"]}
  }
}
```

Missing fees có dependency rộng vì net path chưa đúng; không giữ gross metrics như known net components. Verified no-turnover cho stress=baseline path; missing turnover không là no-turnover. Policy delta=0 chỉ identity fixture/diagnostic, không approved production adversity scenario.

Compatibility pack pin OpenAPI/JSON Schema, fixture IDs/hashes, field catalogue, canonical policy/band version, exact adapter mapping và rendered UI state. Research BE/FE branch không tự là integration proof. Contract tests kiểm old reader unknown fields/enums, null/missing fields, provisional inclusion, direct economic independence và restricted schema. Screenshots có ngày 2027 vẫn chỉ mock input, không market evidence. Design handoff không cấp repo/VPS/API activation approval.

### 9.2 Trusted envelope và payload PM giữ nguyên

Browser chỉ gửi operation, exact target/business payload, expected versions, reason và client idempotency key. BFF resolve actor/session/rights, kiểm CSRF và tạo trusted transport context. Không forward `X-User-ID` do browser tự đặt; proxy phải strip/overwrite untrusted identity headers.

```json
{
  "transport_schema_version": "portal.ts-command-context.v1",
  "context": {
    "request_id": "req_fixture_1",
    "human_principal_ref": "verified_user_fixture_stan",
    "workload_principal_ref": "portal_bff_service",
    "app_policy_revision": "42",
    "ts_membership_revision": "19",
    "delegation_receipt_ref": "delegation_fixture_7",
    "authorized_scope": {
      "root_id": "R_FIXTURE", "portfolio_id": "P_FIXTURE_1",
      "deployment_id": "D_FIXTURE_A", "account_id": "A_FIXTURE_A", "mode": "SANDBOX"
    },
    "policy_version": "approved-policy-ref",
    "canonical_payload_digest": "sha256_of_canonical_business_payload",
    "approval_receipt_ref": null,
    "issued_at_ms": 1791600000000,
    "expires_at_ms": 1791600030000
  },
  "business_payload_ref": {
    "schema_version": "pma.capital-command.v1.1",
    "authoritative_payload_ref": "immutable_ts_validated_payload_fixture_1",
    "canonical_payload_digest": "sha256_of_unchanged_authoritative_payload"
  }
}
```

Đây là **pseudo-envelope dùng payload reference**, không phải request thực thi hoàn chỉnh. Payload reference phải resolve tới toàn bộ payload bất biến đã validate bằng schema authority, gồm mọi field required theo PM §7.4; digest phải khớp bytes/canonicalization đã chốt. Nếu transport gửi payload inline, copy nguyên payload authority, không dựng subset từ ví dụ này. Reference không là quyền truy cập và không thay TS commit validation. Không coi ví dụ này là định nghĩa thay thế `pma.capital-command.v1.1`. Thời hạn 30 giây trong fixture không là SLA hoặc policy mặc định. Approval receipt chỉ dùng khi policy thực sự yêu cầu; không tạo receipt giả từ nút Confirm.

Legacy browser label DEMO phải được BFF resolve thành canonical SANDBOX cùng verified execution backend/native profile của đúng venue trước khi tạo transport context; server không tin mode label do browser tự khai, và generic sandbox không tự chứng minh OKX Demo. Mapping này không sửa `mode` hoặc financial fields bên trong authoritative PM payload.

Trusted context được xác thực bằng service-to-service mechanism đã có, có audience và replay controls. Context không biến BFF thành financial authority. TS xác minh principal mapping, current policy/membership/delegation, scopes, approved payload digest/receipt, expiry và expected versions ngay trước commit; các kiểm tra source/capacity/binding vẫn ở TS.

### 9.3 Idempotency và state machine hai lớp

| Lớp | Trạng thái đề xuất | Ý nghĩa |
|---|---|---|
| Delivery | `PREPARED`, `SENDING`, `ACKNOWLEDGED`, `DELIVERY_UNKNOWN`, `FAILED_BEFORE_SEND` | Chỉ nói đường vận chuyển, không nói effect tiền |
| Business | PM `APPLIED`, `PARTIALLY_APPLIED`, `WAITING_ENCUMBRANCE`, `CANCELLED`, `PARTIALLY_APPLIED_CANCELLED`, `REJECTED`; domain khác theo receipt | TS authoritative disposition |
| Projection | `CURRENT`, `CATCHING_UP`, `STALE`, `UNAVAILABLE` | Khả năng report đã thấy effect |

Cùng idempotency scope+key+canonical payload trả cùng command/receipt. Cùng key khác digest trả `IDEMPOTENCY_CONFLICT`; browser không tự tạo key mới để thử lại. Key được giữ xuyên double-click, Back/Forward, timeout, reconnect và worker restart. Sau unknown, query authority receipt theo key/correlation; chỉ retry cùng key khi route được chứng minh idempotent và outcome vẫn chưa xác định.

`202/ACKNOWLEDGED` chỉ cho biết đã nhận/gửi. UI dùng “Đã gửi, đang chờ TS xác nhận”, không “Đã cấp vốn”. ACK rồi mạng đứt không cho cancel như chưa gửi. Command status mất đọc do revoke không đổi business outcome; UI nói quyền truy cập đã thay đổi, recovery chạy nội bộ theo permitted system workflow.

### 9.4 Error contract

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message_key": "command.refresh_and_review",
    "retryable": false,
    "correlation_id": "req_fixture_1",
    "safe_details": {"next_action": "REFRESH_PREVIEW"}
  }
}
```

HTTP status là transport/API shape; machine `code` và business receipt là contract. Unauthorized resource và nonexistent resource dùng cùng public not-found shape; authenticated action denied trên resource đã được phép thấy có thể trả 403 và safe reason. Không trả stack trace, query text, internal UID hoặc hidden blocker resource names.

| Code | Copy HIFI gợi ý | Hành động hợp lệ |
|---|---|---|
| `ACCESS_DENIED` | “Bạn chưa có quyền thực hiện thao tác này.” | Xem quyền hiện có hoặc gửi yêu cầu theo workflow được duyệt |
| `DELEGATION_CEILING_EXCEEDED` | “Quyền này vượt phạm vi bạn được phép cấp.” | Giảm scope hoặc nhờ owner xét |
| `SELF_PRIVILEGE_CHANGE_DENIED` | “Bạn không thể thay đổi quyền quản trị của chính mình.” | Người có authority khác xét theo policy |
| `OWNER_PROTECTED` | “Tài khoản owner được bảo vệ. Cần quy trình owner riêng.” | Không có override thường |
| `TS_MEMBERSHIP_PENDING` | “Quyền nghiệp vụ đang chờ TS chấp nhận.” | Theo dõi receipt, chưa bật thao tác |
| `VERSION_CONFLICT` | “Dữ liệu đã thay đổi. Tải lại và kiểm tra preview.” | Preview mới; không âm thầm đổi amount/delta |
| `IDEMPOTENCY_CONFLICT` | “Mã yêu cầu đã dùng cho nội dung khác.” | Dừng, đối chiếu request/receipt |
| `OUTCOME_UNKNOWN` | “Chưa xác định kết quả. Đang đối chiếu yêu cầu cũ.” | Không gửi yêu cầu mới |
| `CAPACITY_UNAVAILABLE` / `SOURCE_UNVERIFIED` | “Chưa đủ bằng chứng nguồn hoặc capacity để áp dụng.” | Xem quality/source blocker được phép |
| `PENDING_DRAIN` | “Đang chờ nghĩa vụ hiện có được xử lý.” | Xem obligations; không tự close/cancel |
| `DATA_STALE` | “Dữ liệu đã cũ. Thao tác này cần kiểm tra lại.” | Refresh nguồn/preview, fail closed khi cần |
| `UNSUPPORTED_SCOPE` / `UNSUPPORTED_BUDGET_MODEL` | “Scope hoặc mô hình này chưa được hỗ trợ.” | Không fallback legacy authority |
| `RESYNC_REQUIRED` | “Dữ liệu đã thay đổi phiên. Đang tải snapshot mới.” | Rebuild view, không cộng delta mù |

## 10 Đặc tả màn hình và quy trình cho HIFI

### 10.1 Khung trạng thái chung

Mỗi màn hình có: phạm vi đang xem, mode/environment nổi bật, thời điểm dữ liệu, quality/freshness, current quyền và actions hợp lệ; active tab không quyết định quyền. Không hiển thị nút mutation chỉ vì row có dữ liệu. Loading, empty authorized set, forbidden/not-found, partial, stale, disconnected và unavailable phải là các trạng thái khác nhau.

Không dùng một toast thoáng qua làm bằng chứng command. Sau submit mở receipt panel có command ID, exact target, requested/applied/pending/rejected/cancelled, authority versions, timestamps và blockers. Refresh trang vẫn tìm được trạng thái cũ. Screen reader và keyboard focus phải nhận status/error; không dựa vào màu đỏ/xanh đơn thuần.

### 10.2 Manager landing và Alpha Fleet

Trang vào mặc định cho manager là Fund Overview, kế tiếp Portfolio Overview và Alpha Fleet; 360 screens là drill-down. Không bắt người dùng đi qua chi tiết từng account để biết toàn quỹ. Trang restricted researcher có layout riêng và scope notice rõ, không dùng cùng cards full totals ở trạng thái hidden.

- **Fund Overview:** direct consolidated manager PortfolioScore khi own input/config gates đủ, kèm P/R/B/band/evidence; composition AlphaScore riêng. Initial funds, added funds, returns/net capital flows, authoritative net PnL, NAV/equity quality, currency/basis/cutoff và exact-denominator percentages khi certified vẫn hiện theo own readiness. Hai funding buckets không có PnL tự gán khi chưa có lot methodology.
- **Portfolio Overview:** headline direct PortfolioScore từ portfolio NAV, P/R/B/band/evidence/window; composition AlphaScore có subtitle “Chất lượng trên vốn đã phân bổ”, coverage và provisional weight riêng; economics/budget tách biệt. Manager Fund view dùng F_pi trên consolidated root NAV đã dedupe, không average portfolio scores. Giữ đúng snapshot/filter khi drill-down; không cộng physical custody vào managed totals.
- **Alpha Fleet:** Alpha/Version, Owner, Portfolio, Stage Presence, Alloc, PnL amount, Unrealized PnL, Account balance, Equity 30D, Health/Source, QBTS. Server sort/filter/group tất cả scalar applicable theo §6.8; selection giữ immutable IDs, không phụ thuộc row index. Loading, empty, partial, stale, incomparable unit, insufficient history và forbidden là fixtures riêng.
- **Filters:** All/Live/Canary/Sandbox/Paper; lifecycle Active/Archive Requested/Archived riêng. Không Research stage. StagePresence hỗ trợ nhiều badges, không tự giả một alpha chỉ ở một stage.
- **Score/regime detail:** formula/config/band, requested/effective window, P/R/B và six atomic contributions, raw q riêng c_i (không band), evidence/provisional badge, costs/stress, economic binding hoặc research run khi applicable. Early/mixed observation facets có actual duration/continuity rõ; Regime independent descriptive support. UI không tính/chuẩn hóa lại score hoặc tự khóa authorized reduce-risk khi analytics thiếu.
- **Design handoff:** dùng §9.1 payloads và FX-13…19; link mỗi card/table cell/action với field catalogue, policy state, availability và disabled reason. Mẫu HIFI đẹp không được thay synthetic values thành financial claims.


### 10.3 Profile và Access

- **Datasets:** verified profile; users; effective app grants; TS accepted membership; proposals; sessions redacted; audit; protected-owner metadata được phép.
- **Read APIs:** me/profile, users/access, audit. **Actions:** create user, profile metadata update, lifecycle, preview/propose grant/revoke, session revoke.
- **Layout:** thông tin user; quyền hiện hành grouped theo resource/action; nguồn quyền và expiry; pending changes; preview before/after; session control; timeline.
- **State detail:** business pending có nhãn riêng từ app-applied; rejected giữ before-state; unknown không hiện grant effective; stale permissions khóa submit và yêu cầu refresh.
- **Tests:** `ELP2-T02-01…08`, `ELP2-T03-01…08`, `ELP2-T09-01…08`. HIFI fixture phải có Stan xem/cấp trong ceiling, bị chặn self-elevation; researcher chỉ self; owner protected.

### 10.4 Portfolio 360

- **Datasets:** registry/root/membership; deployment matrix; economic assigned/NAV quality; budget and available display; capital statement; locks/recalls; obligations; reconciliation; audit.
- **Read APIs:** portfolios/overview, capital-statement, obligations, command status và scoped events.
- **Actions:** create portfolio, membership proposal, register selected alpha instance, preview FUND/grant/decrease/recall/lock, safety state, assignment proposal, archive khi đủ gates. Mọi action gắn capability riêng.
- **Layout:** identity/mode/currency; PM/members; economic cards và budget cards tách nhóm; instances; capital activity; blockers/reconciliation; audit. Shared pool warning hiện cạnh binding và trước activation.
- **Totals:** scope/cutoff/source set rõ. Không cộng alpha subtotal với account rows, không cộng budgets vào NAV. Missing value để “Chưa xác định”, không zero.
- **Tests:** `ELP2-T06-01…08`, `ELP2-T08-01…10`, `ELP2-T10-01…08`.

### 10.5 Alpha 360

- **Datasets:** registry/current owner + history; permitted deployments across portfolios/modes; per-instance capital and outcomes; economic attribution/positions/episodes; quality.
- **Actions:** edit metadata nếu được cấp; ownership proposal riêng; register/activate chỉ theo portfolio/deploy rights. Trước capital action buộc chọn exact deployment/account; chỉ alpha ID trả ambiguous nếu có nhiều candidates.
- **Layout:** alpha identity/owner; instance selector có account/deployment IDs, portfolio/mode/venue; results authorized-only; selected-instance capital statement; execution/obligations; lineage.
- **Quyền:** own alpha tạo linked-portfolio discoverability theo verified user_id và §4.8, không full portfolio/instance financial access; share metadata không tự share financial details. Historical attribution không dùng để bypass quyền hiện tại.
- **Metrics:** absolute PnL/fees/funding/exposure trước; return/drawdown chỉ có methodology proof. Không lấy trung bình Sharpe/returns thành aggregate.
- **Tests:** `ELP2-T04-01…08`, `ELP2-T06-01…08`, `ELP2-T10-01…08`.

### 10.6 Account và Broker 360

- **Datasets:** exact internal account/deployment/binding; physical registry/profile/pool; native balance/equity nếu được phép; attributed economics/budget; positions/orders/unknowns; reconciliation bridge.
- **Actions:** binding proposal/readiness, selected account capital và safety controls theo quyền. Không có default native transfer, create subaccount, rotate key, đổi margin mode.
- **Layout:** internal account header; verified physical link đã redacted; custody tab nếu có quyền; attribution/budget tab; obligations; source quality; audit. Dòng cảnh báo “Các account nội bộ có thể dùng chung native risk pool” phải rõ khi applicable.
- **Amounts:** physical custody chỉ tính một lần theo native scope. Internal allocations/budgets không là native available balance. Partial custody visibility không cho suy hidden siblings từ tổng.
- **Tests:** `ELP2-T04-04…08`, `ELP2-T06-03…08`, `ELP2-T08-07…10`.

### 10.7 Tạo portfolio hoặc đăng ký instance

Form buộc explicit zero/positive initial economic capital và initial budget riêng, currency, source, effective time, selected alpha/owner, target portfolio, mode/venue và verified binding. Không khôi phục default seed `100000`. Preview chỉ rõ bước create, FUND và grant; nếu không có certified atomic boundary thì trình bày các bước/receipts riêng.

Create thành công nhưng FUND chưa áp dụng hiện `CREATED_UNFUNDED`; budget zero không cho new risk. Nếu thiếu identity/binding/source, form giữ draft hoặc resource ở non-trading state theo TS, không gắn “Ready”. Paper synthetic source phải đánh dấu PAPER; không mô tả Paper là OKX Demo. Submit không tự activate hay đặt lệnh.

### 10.8 Assignment và binding với nghĩa vụ mở

Move portfolio assignment giữ account/deployment/alpha/mode/venue/physical binding; cần quyền cả source và destination. Open orders/positions/reservations/unknowns/locks/recalls trả `PENDING_DRAIN`, old assignment còn active; facts tiếp tục attribution gốc. Không auto liquidation, cancel orders hoặc unlock.

HIFI hiển thị source→destination, retained IDs, pending blockers được phép, source budget return receipts, target grant riêng, residual economic settlement/assignment evidence. Nếu không cùng certified transaction, hiển thị các bước và halted/drained gap; không gọi atomic end-to-end. Cancel pending move không undo budget/economic receipts đã applied. Late fee của old order vẫn về old assignment.

Native rebinding là workflow khác: cần verified target/profile/pool/mode, outstanding obligations và original order correlation. Không reuse nút move để đổi venue/native account. Nếu PM/Edge chưa có certified rebind contract, screen chỉ read readiness/propose và trả unsupported/blocked; không tự đổi current binding để làm old facts khớp target mới.

## 11 Capital và governance workflows

### 11.1 Ba loại vốn và hai loại grant

UI phải tách economic assignment (`FUND`, `RETURN_CAPITAL`), management budget (`INITIAL_GRANT`, `TOP_UP`, decrease/recall) và native physical transfer. Capital commands PM v1.1 luôn ghi `physical_transfer_performed=false`. Budget grant không là execution grant gắn reservation P18. Không viết “Chuyển tiền” cho TOP_UP hay “Rút tiền sàn” cho RETURN_CAPITAL.

`SET_ROOT_LIMIT` đổi nominal cap, economic effect bằng 0; bootstrap source/cap cần proof và approval theo PM guide. Budget đủ không chứng minh economic backing/native capacity đủ. Portal hiển thị `budget_model`/policy ref và capacity proof theo PM R2 pin §2.1: economic backing, margin-risk budget và independent exposure cap là các dimension riêng. Không dùng baseline global 1x gross-notional, không đổi leverage hoặc native reservation path thành PM policy. Risk/exposure caps và support matrix phải được TS certify; Portal không tự bật. Không suy hỗ trợ product/collateral từ suffix USDT/USD hoặc profile label. Current NAV không tự nâng approved nominal cap; profit/loss/fees được phản ánh theo authority, không do Portal tự cộng vào budget.

### 11.2 Screen action mapping

| UI action | Exact PM operation và target | Preview bắt buộc | Thành công và pending |
|---|---|---|---|
| Tạo portfolio/instance | CREATE_PORTFOLIO / REGISTER_INSTANCE | Zero/positive capital, budget riêng, source, IDs, mode/binding | CREATED_UNFUNDED nếu chưa funding; registration receipt không là funded |
| Giao vốn kinh tế | FUND tới P hoặc exact D/A | Source/asset/currency/pool, paired assignment, economic effect và budget=0 | Chỉ applied receipt mới vào economic additions |
| Đặt trần root | SET_ROOT_LIMIT exact root bucket | Before/after cap, expected revision, source/claims/delegation floor | Không thêm tiền hoặc tự tăng descendant budgets |
| Cấp budget ban đầu | INITIAL_GRANT exact P hoặc D/A | Recipient chưa initial, parent available, nominal cap, economic=0 | Parent/budget paired receipts; zero budget không new risk |
| Tăng budget | TOP_UP exact P hoặc D/A | Delta, immediate parent debit, scope/currency/capacity | Không tăng NAV/economic additions |
| Giảm ngay | IMMEDIATE_DECREASE | Amount và releasable proof, parent credit | Vượt free reject toàn bộ; không tự chuyển thành recall |
| Thu hồi một phần/toàn bộ | RECALL_PARTIAL / RECALL_FULL | Frozen requested amount, applied free/pending, ancestor gates, child blockers | WAITING_ENCUMBRANCE/PARTIALLY_APPLIED, không auto liquidate |
| Áp dụng phần chờ | APPLY_PENDING exact recall command | Current command version, causal release evidence | Chỉ approved remainder; idempotent worker, no new intent |
| Hủy phần chưa áp dụng | CANCEL_REMAINING exact command | Pending amount còn có thể cancel, applied giữ nguyên | CANCELLED hoặc PARTIALLY_APPLIED_CANCELLED |
| Trả vốn kinh tế | RETURN_CAPITAL exact D/A→P hoặc P→root | Verified free cash, original source/pool, budget-release links | All-or-nothing, economic reverse assignment, budget=0, no transfer |
| Phân bổ lại budget | REALLOCATE_BUDGET approved R2 composite qua immediate parent | Exact source/target, parent, amount/CAS và certified transaction boundary theo R2 | Giữ approved R2 composite disposition; chỉ activate scope có actual atomic/receipt evidence, không direct alpha-to-alpha |
| Khóa/mở khóa | ADMIN_LOCK / ADMIN_UNLOCK exact lock ID | Kind/amount/reason, local/ancestor effects, independent blockers | Unlock một lock không gỡ các lock/restriction khác |
| Dừng/giảm/tiếp tục | HALT / REDUCING / RESUME | Scope và inherited gates, current risk/source/binding | Resume không vượt ancestor, REDUCING cần proof thực sự |
| Đổi portfolio assignment | MOVE_DEPLOYMENT_ASSIGNMENT exact D/A | Source/target rights, drain, budget/residual receipts | PENDING_DRAIN hoặc applied new assignment interval |
| Lưu trữ và paper monitoring | ARCHIVE exact resource; optional CREATE_PAPER_CLONE theo contract riêng | Explicit disposition cho residual positions/working orders/unknowns, budget/settlement và lineage | Giữ stage/history/facts; pending nếu chưa drain/disposition; clone không implicit close, return hoặc live |
| Chỉnh target budget | ADJUST_TARGET_BUDGET approved R2 target adapter | CAS target→resolved delta/operation theo exact approved R2 semantics, no silent recall | Design đã được chọn; activation đợi scope/transaction evidence, không mở lại thành optional default-off proposal |

Các semantics theo approved PM R2 disposition tại pin §2.1, đọc cùng PM v1.1 chương 7 và delta register. Composite reallocation/target adapter đã là lựa chọn design R2; guide này không mở lại thành quyết định optional mới. Readiness/activation vẫn cần actual integration và certified transaction scope, không suy từ design approval. Portal không thêm trạng thái tiền riêng để gom operations. Amount-bearing receipt giữ chính xác:

`requested_amount = applied_amount + pending_amount + cancelled_amount + rejected_amount`

Applied/cancelled không giảm do refresh/replay; pending không được cộng vào capital statement như actual flow. Trạng thái `PARTIALLY_APPLIED_CANCELLED` không được rút gọn thành “Đã hủy” làm người dùng nghĩ phần đã áp dụng bị undo.

### 11.3 Confirmation và approval panel

Panel hiển thị target canonical IDs và labels; mode/environment; operation; currency/amount exact và formatted; before/after dự kiến; economic/budget/native-transfer distinctions; source/parent; expected versions; reason; authority/approval requirements; blockers; hậu quả không tự rollback. Confirm tạo intent theo policy, không cấp thêm authority.

Các flow giao dịch thực tế phải theo authorization riêng. Tài liệu không cho phép đặt live order, đổi native account hoặc chuyển tiền. Dù button hiện enabled trong fixture, runtime phải bị khóa theo release/mode approval và TS gates. Không dùng “owner đã duyệt tài liệu” làm approval receipt cho command.

### 11.4 Tận dụng stages governance hiện có

Giữ governance/command ledger R1/R2 và live rule đang có làm baseline; map từng operation mới vào existing planning, confirmation, acceptance, execution/status stages sau khi đọc source. Không rename stage rồi bỏ kill-switch, identity, mode/source binding, source-plan binding hoặc live-approval requirements. R3 ledger ADMIN checks trong source-map là điểm refactor authorization, không phải permission để bỏ ledger.

R1 Paper HALT route hiện có là source-declared/config-gated; không suy thành general Demo/Live relay. Mỗi command family/mode có manifest riêng: declared → TS publication/admission certified → Edge transport certified → Portal workflow accepted → activation explicitly approved. Không bắt live trading để nghiệm thu UI/API semantics.

## 12 Chất lượng báo cáo và trạng thái người dùng

### 12.1 Capital statement và hiệu năng

Ba 360 views dùng cùng statement contract: opening economic capital và receipt; cumulative applied additions/returns; net economic assignments; current NAV/quality; realized/unrealized PnL; actual/pending fees; funding/interest; initial/current budget; top-ups/decreases/recall applied; pending/cancelled; locks/gates. Cumulative fields ghi cutoff và dedupe source identity, không thay opening bằng latest balance.

Tiền đã return từ realized profit không làm historical PnL mất đi. Internal assignments eliminate tại root; physical equity không cộng lặp với internal assets. Fee field phải ghi gross/net inclusion, tránh trừ actual expense hai lần.

### 12.1.1 Initial funds added funds và tỷ lệ

Fund overview phân biệt lifetime initial funding, subsequent added funding, returned capital, period opening NAV và current NAV. Initial funds là applied initial-funding receipts theo definition được duyệt, không rewrite thành latest balance; added funds là applied additional external funding, không profit, budget TOP_UP hoặc internal allocation. Tại root loại bỏ paired internal FUND/RETURN flows; tại portfolio hiển thị đúng inbound/outbound assignment basis mà không gọi mọi assignment là deposit trên sàn.

Mỗi card % ghi tên denominator và exact denominator amount/currency/window. Funding share ratio có thể có denominator `initial + added` khi policy chốt, nhưng không gọi là investment return. Return % cần methodology/cashflow proof theo §12.2 và canonical model; thiếu denominator/input phải null. Withdrawals không làm PnL âm, deposits không là lãi. Fixture initial 1000 + added 200 − returned 300 = net contributed 900, không trade/fees → net PnL 0 theo authoritative facts; raw equity change −10% so với opening 1000 không là performance loss.

Hai cards Initial funds và Added funds chỉ là funding buckets. Không gán phần lợi nhuận/lỗ cho từng bucket theo tỷ lệ mặc định, FIFO, pro-rata hoặc ngày nạp khi chưa có explicit approved lot-attribution methodology và complete receipts. `pnl_by_funding_bucket=UNAVAILABLE/LOT_ATTRIBUTION_METHOD_NOT_APPROVED` là hành vi đúng. Nếu sau này approved attribution model, version nó và ghi exact lot/source lineage, không restate historical results âm thầm.


### 12.2 P15 cashflow metric acceptance

P15.T05 source review cho thấy cần kiểm raw drawdown trước khi xuất bản performance. Fixture không-trade chỉ deposit/withdrawal phải kiểm điều kiện: raw equity có thể giảm khi rút vốn, nhưng không được gọi phần giảm đó là trading loss hoặc performance drawdown nếu chưa có flow-adjusted methodology hợp lệ.

Contract advanced metric chứa `methodology_id/version`, observation/source-set/cashflow policy, input completeness, timezone/window, calculation revision và quality. Chưa chứng minh phương pháp → `value=null`, `availability=UNAVAILABLE`, reason `METHODOLOGY_NOT_CERTIFIED` hoặc `INSUFFICIENT_FLOW_SERIES`. Có thể hiển thị “Biến động equity thô” dưới nhãn riêng nếu scope cho phép, không gọi nó return/drawdown hiệu suất.

Đây là acceptance fixture bắt buộc cho mọi metric được quảng bá. Không yêu cầu tạo engine TWR/MWR/Sharpe/drawdown riêng trong Portal để hoàn tất core release; reuse canonical Research read-side nếu method đã certified. Nếu feature disabled/unavailable được trình bày đúng và absolute economics/capital statements đạt gate thì release core không bị chặn bởi advanced metrics.

### 12.3 Tương tác lỗi và cạnh tranh

| Sự kiện | UI phải làm | Backend phải chứng minh |
|---|---|---|
| Double-click | Một logical intent, disable duplicate submit nhưng giữ status | Cùng key một effect dù hai requests đến đồng thời |
| Back/Forward hoặc refresh | Khôi phục command panel từ durable ID | Không POST lại ngầm |
| Timeout trước/không biết send | Hiển thị unknown hoặc failed-before-send có proof | Query receipt trước retry cùng key |
| ACK rồi disconnect | Giữ waiting verification | Không báo applied; eventual reconcile |
| Reconnect SSE | Resume cursor hoặc reset snapshot | No missing/double rows; current auth |
| Cancel form trước submit | Bỏ local draft theo UI | Không có business command |
| Cancel sau submit | Gửi only supported cancel-remaining command, preview hiện applied | Không cancel transport như chưa có effect |
| Policy revoke khi đang mở modal | Đóng submit/refresh quyền, redacted reason | Recheck BFF/TS commit, no stale approval |
| Business version thay đổi | Giữ entered values để review, yêu cầu preview mới | CAS conflict, không tự recompute rồi apply |
| TS unavailable | Read quality theo last valid snapshot policy, mutation blocked/unknown tùy send | Không fallback authority, bounded retry |
| Receipt applied nhưng projection cũ | Hiện receipt applied + đang cập nhật view | Không gửi lặp; watermark reconcile |

## 13 Tối ưu tài nguyên và khả năng vận hành

### 13.1 Tối ưu theo topology hiện có

BFF đọc SGP read model/cache; Edge private HK tập trung ingest/transport từ TS theo allowlist. Browser chỉ nhận scoped snapshot/delta. Không fan-out một TS request cho mỗi card, tab hoặc browser; cũng không mở một source stream riêng cho mỗi user khi có thể dùng one consumer + policy-filtered fanout.

Current-page evidence 200 rows/1 MiB và P/S max safe 1/L2 chỉ áp dụng profile đã chứng minh. Không lấy con số đó làm cap cho mọi dataset hoặc cam kết full-history throughput. Trước mở durable history, đo source publication, Edge storage, SGP query/fanout và research coexistence cùng workload thực tế được phê duyệt.

### 13.1.1 Hotspot hiện có và thứ tự tối ưu

Targeted source §2.3 cho phép lập measurement plan cụ thể: Manager snapshot expiry 5 giây, refresh 8 relations/profile, thêm Paper performance; theoretical ceiling cho ba profiles là 25 drains × tối đa 10 pages × 200 rows = 50.000 source rows/refresh. Đây chỉ là trần lý thuyết từ source bounds, không lượng đọc luôn xảy ra, không benchmark/current CPU-RAM, cũng không chứng minh nguyên nhân duy nhất của tải người dùng thấy.

Reuse coalescing/SWR trước, gom authorized consumers trên một ingestion path; phân loại cadence theo dataset; chuyển full-refresh sang journal/cursor khi nguồn được certified; changed-key upsert/delete thay rewrite toàn Fleet scope nếu tests chứng minh correctness; precompute bounded Research-side partitions/rollups và query indexes theo actual plans. Không tăng polling interval để che tải rồi làm freshness sai. Source schema không đủ delta thì giữ bounded polling explicit thay giả event support. So sánh trước/sau cùng workload/source/host limits, gồm TS/DL/research regression, corrections, revoke propagation và recovery, trước chọn placement hoặc thresholds.

### 13.2 Giới hạn và measurement manifest

Mỗi dataset/profile phải có: expected rows/row size, page/batch cap, source cadence, freshness target, replay horizon, event rate/burst, max concurrent subscriptions, connection pool/bounded queue, query timeout, storage/retention, checkpoint lag alarm và load shedding. Các giá trị là quyết định đo được trong phase ELP2-10; không tự chọn chỉ vì host có một số CPU/RAM danh nghĩa.

Benchmark ghi host/container limits, CPU/RAM/disk/I/O, DB version/schema/indexes, workload/data size, concurrency, TS and research baseline, query plans, p50/p95/p99, connection wait, WAL/write amplification, ingest/replay lag, queue depth và errors. Đặt acceptance thresholds trước run dựa baseline và operational budget; báo cả regression của TS/research, không chỉ BFF latency.

### 13.3 Read model trước cache

Precompute fund/portfolio overview, Alpha Fleet, capital statement và obligation summaries theo source key/cutoff; score/regime reuse canonical Research outputs, recompute theo bounded budget §8.5; index query paths thật; use keyset paging; tránh N+1 và unbounded joins. Incremental update hoặc batch debounce khi semantics cho phép, nhưng không trì hoãn revocation vì muốn giảm writes.

Cache có bounded cardinality/TTL/size, keys chứa scope/policy/generation/query. Không cache full hidden dataset rồi lọc client-side. Read pool riêng/timeouts chỉ giảm connection competition, không loại trừ shared I/O/cache/WAL contention; đo isolation thật. Read replica có lag cũng phải thể hiện quality và không dùng để quyết định capital capacity.

### 13.4 Fanout backpressure và recovery

Slow client có bounded buffer; vượt cap gửi safe resync signal hoặc disconnect rồi snapshot, không giữ RAM vô hạn. Heartbeats không quảng bá data freshness. SSE reconnect storm có jitter/rate limits/per-user quotas; replay từ persisted journal trong retention đã chứng minh, không query TS full history mỗi lần browser refresh.

Single consumer lease/partition ownership và fencing phải rõ: process nào được ingest, checkpoint authority ở đâu, failover/DR ai sở hữu, restore epoch đổi khi nào. In-memory lock không đủ chống hai replicas. Dedupe bắt buộc cả khi lease split-brain bị thử nghiệm. ELP2-10 phải chốt placement/lease/DR decision, không suy triển khai từ template.

### 13.5 Observability đủ nhưng không lộ dữ liệu

Metrics: source lag, projection generation, dedupe/replay counts, gap/reset, command unknown age, policy revision lag, revoke propagation, denied scope accesses, query latency/cost, queue/pool use. Logs theo correlation/receipt IDs; không raw session/JWT/API key, credential DSN, full personal data hoặc SQL bind values chứa secret. Trace IDs có thể đưa vào UI support; internal topology/hidden resource names không cần gửi browser.

## 14 Fixture pack và acceptance matrix tái sử dụng

### 14.1 Dữ liệu kiểm thử chuẩn

Tất cả số/IDs sau là synthetic fixtures trong môi trường được phép; không mô tả tài sản hay users thật.

| Fixture | Nội dung | Invariants phải chứng minh |
|---|---|---|
| FX-01 Identity and delegation | UO/UM có all-business read; UM mutation/delegation ceiling P1/SANDBOX nếu được cấp, không dev; UR owner user_id linked A1; US owner A2 | Read visibility độc lập mutation; no hardcoded name/self-elevation/protected-owner change |
| FX-02 Shared alpha instances | A1 version V1 có D1/C1 tại P1 và D2/C2 tại P2; UR current owner user_id linked A1, financial read chỉ D1 nếu được duyệt; A2 peer khác owner | UR discover P1/P2 shell và own permitted slices, không full totals/peers hoặc D2 finance ngầm; unrelated P3 không discover |
| FX-03 Physical shared pool | C1/C3 khác portfolio cùng physical V1; C2 tại V2; native amount riêng từng pool | Custody dedupe, không suy sibling, no physical+internal double count |
| FX-04 Capital lifecycle | P1 kinh tế 1000 USDT; budget 800; selected C1 grant 500; nguồn/versions verified | FUND/budget độc lập; parent conservation; pending không là applied |
| FX-05 Recall and unknown | C1 có pending recall, open obligation và unknown order; partial applied + cancel race | Amount partition, original claims retained, không auto liquidation |
| FX-06 Temporal attribution | Owner/assignment/binding đổi qua intervals; old order late fill/fee sau cutoff | Current read grant trước historical facts; pinned original attribution, restatement |
| FX-07 Transport uncertainty | Duplicate submit, ACK before TS commit, commit before response, worker/browser restart | Same key one effect; UNKNOWN resolve receipt; ACK không applied |
| FX-08 Publication replay | Duplicate/out-of-order events, missing seq, epoch reset, snapshot/tail boundary, expired cursor | Dedupe; gap→resnapshot; no silent completeness; authorized replay |
| FX-09 Access races | Revoke/expiry giữa preview–send–queue–commit và trong stream/export | Current authority check; cache/stream/file access stopped; committed facts continue |
| FX-10 Cashflow only | Opening equity 1000; deposit +200; withdrawal −300; no trades/PnL/fees | Economic net 900 theo source proof; không gọi −300 withdrawal là loss/drawdown hiệu suất |
| FX-11 Dedupe and decimals | Two distinct facts 100+100; one repeated source100; large/very small exact decimal, currency mismatch | 200 cho distinct; one effect cho replay; no float/implicit currency sum |
| FX-12 Host coexistence | Approved volume/replay/export and concurrent research workload, measured baseline | Bounded queues/pools/fanout; no unapproved resource regression |
| FX-13 Manager full visibility | UO/UM xem P1/P2 tất cả stages; UM không có P2 mutation | Same business reads; mutation vẫn denied; no maintenance grant |
| FX-14 Researcher link privacy | Correct owner user_id vs same-name/actor/historical-owner/unlinked; unlink giữa page/stream/export | Only eligible portfolio shell/own slice; no totals, peers, sort/facet/export/SSE leak |
| FX-15 Fleet query | Shared account across stage rows, mixed currency, null metrics, ties, group/page boundary | Server full-set sort/filter/group, stable snapshot, no double-count, typed units |
| FX-16 Archive monitoring | Former Live deployment còn position/order/unknown; optional Paper clone same AlphaVersion | Explicit disposition trước close, pending giữ obligations, lineage preserved, no auto-live |
| FX-17 Funding buckets | Initial 1000, added 200, returned 300; no trades; missing lot policy | Net PnL 0; cashflows distinct; no invented per-bucket PnL/return denominator |
| FX-18 Shared score/regime | Raw q73.3 fair/provisional; A weighted attribution; direct portfolio path; required cost/stress missing và independent Regime status | Fixed P/R/B/bands, no browser formula, compatible provisional aggregate, no HHI penalty; missing q không chặn direct PortfolioScore; typed null khi thực sự thiếu inputs |
| FX-19 Correction budget | Late fee/correction affects one portfolio/window; replay while model job pending | Bounded affected-scope recompute, revisioned result, no heavy TS work, stale/partial honest |
| FX-20 Economic domain partition | One real-funded account in Live+Canary; separate Sandbox/Paper accounts; archive-monitor clone of Live | Real-funded NAV unique source once; simulations/cohorts separate; ALL combined money unavailable without comparable basis; clone adds no real asset |
| FX-21 Provisional window | Two math-complete 7d raw scores with limited maturity; separate 5d alpha in requested30d | Same7d provisional allowed in A; explicit provisional weight; 5d never masquerades as30d; missing duration config policy_pending |
| FX-22 Independent outputs | A missing25% q; own portfolio NAV complete; unknown grouping/research binding; inverse case NAV missing with all q valid | A null/bounds[67.5,92.5], direct PortfolioScore available if own gate passes; grouping only diagnostics; no A fallback when NAV missing |
| FX-23 Cost and stress faults | q73.3 baseline fixture, missing gross notional vs missing required fees, verified zero-turnover and invalid stress path | Stress missing typed null/bounds[65.175,77.675]; fees invalidate dependent net metrics; no missing-to-zero; stress monotone and dedup fill sides |
| FX-24 Cross-stage continuity | Same actual Canary→Live; Paper40d+Sandbox20d+actual10d; parallel overlapping paper/live; version/flow gap | Actual continuity retained; mixed forward70d/actual10d facet only; preselection/no overlap/no cherry-pick; invalid continuity stays segments |
| FX-25 Direct score bands and migration | q73.3/fair/provisional, c18.325/no band; band edges; manager transfers/dedup; legacy version history | Shared formula/bands; raw/direct same exact path same score; consolidated manager not average children; no legacy penalty fallback or changed historical semantics |

### 14.2 Ma trận ba preset và cross-scope

`A` chỉ allow khi explicit capability và gate tương ứng đã thỏa; `D` deny; `S` approved restricted slice. Read_all được yêu cầu cho UO/UM; mutation/delegation fixtures độc lập. Matrix field chi tiết §4.8 vẫn PROPOSED cần duyệt, không hardcode tên.

| Hành động trong fixtures | UO owner | UM manager | UR linked researcher | Kiểm tra bổ sung |
|---|---|---|---|---|
| Xem Fund/Portfolio Overview toàn business | A | A | D | UR không nhận full cards/totals/Portfolio Score |
| Xem Alpha Fleet toàn business | A | A | S own rows được duyệt | Server query không lộ peers qua sort/group/count |
| Discover P1/P2 có A1 do UR own | A | A | S shell/own slice | Current verified owner user_id, không display name |
| Discover P3 không linked | A | A | D | List/detail/search/export/SSE đều không lộ |
| Xem D2/P2 cùng alpha, chưa financial grant | A | A | S metadata approved, D restricted finance | Discoverability không financial full read |
| Xem/sửa own display profile | A | A | A | Không issuer/subject/role edit |
| Xem users directory/tạo user/grant trong ceiling | A nếu capability | A nếu delegated | D | Read_all không tự cấp user admin |
| Grant P2/LIVE khi mutation ceiling chỉ P1/SANDBOX | Theo explicit right | D | D | UM vẫn được read P2/LIVE |
| Đổi own administration/protected owner | Owner procedure | D | D | Preset/group/clone bypass denied |
| Dùng maintenance/dev | Chỉ nếu explicit grant | D mặc định | D | All-business read không technical authority |
| Sửa A1 metadata | Theo grant | D nếu chưa grant | A nếu grant | Owner không mặc định deploy/capital |
| Xem full physical V1 business-safe custody | A nếu field scope | A nếu field scope | D mặc định | No credential/hidden-pool subtraction leak |
| FUND/TOP_UP/RECALL P1 | Theo TS operation right | Theo TS operation right trong ceiling | D | UI visibility không command permission |
| Deploy/activate hoặc archive/clone | Theo separate right/gate | Theo separate right/gate | D nếu chỉ alpha-owner | Explicit disposition; no auto-live |
| Historical report sau mất current link/grant | Theo current grant | Theo current grant | D | Historical attribution không khôi phục quyền |
| Export/SSE restricted portfolio | Separate rights | Separate rights | D mặc định đến approved policy | Same field/query policy; no raw-data bypass |

### 14.3 Matrix interaction và surface

Mỗi read case quan trọng chạy ít nhất qua list, detail, search, aggregate, export, nested relation, SSE initial, replay và direct API. Mỗi command case chạy qua UI và API bypass với cùng expected outcome. Mỗi grant/revoke case có trước/sau cache hit và concurrent in-flight request.

Mỗi command family được quảng bá phải có: happy path; missing right; wrong resource/mode; stale version; double-click; key/digest conflict; timeout trước và sau commit; refresh/back/reconnect; revoke giữa preview/commit; cancel đúng semantics; unavailable source; receipt/projection lag. Không bắt một cancelled transport request phải undo TS commit.

## 15 Kế hoạch 12 phase triển khai

### 15.1 Quy tắc phase

Namespace `ELP2-00…11` là kế hoạch Portal, không đổi phase EDS/PMA11 hoặc migration numbering. Gate kiểm theo artifact/endpoint/action được activate; không lấy số phase làm global waterfall. Contract/fixture/design/read-only adapter có thể làm song song khi inputs được pin; activation chờ dependencies riêng của surface đó. Mỗi phase có approval triển khai riêng theo môi trường; tài liệu này chỉ cho phép chuẩn bị/review.

Mọi tests bên dưới **PLANNED / NOT RUN**. Test file hiện hữu có thể reuse nhưng execution receipt phải pin source/runtime/schema/config. PASS của mock/component không thay real PostgreSQL/concurrency, source-to-Portal E2E hoặc privacy negative tests. Khi dependency TS chưa có implementation, ghi BLOCKED đúng item, không fake adapter success.

### 15.2 Dependency graph và điểm bắt đầu song song

Các mũi tên dưới là dependency về evidence, không là quyền triển khai. Gói repo/VPS changes vẫn cần phê duyệt riêng. `C` là contract/fixture, `R` là selected read-only runtime, `M` là mutation activation.

- ELP2-00 baseline + initial decisions → ELP2-01 C; có thể mở thiết kế Manager/HIFI của ELP2-08 bằng synthetic fixtures ngay sau freeze schema đầu tiên.
- ELP2-01 C → ELP2-02 identity design, ELP2-03 policy design, ELP2-05 catalogue/publication contract, ELP2-06 projection/query design và ELP2-07 disabled-command fixtures song song.
- ELP2-02/03 current identity-policy proof + per-endpoint ELP2-04 privacy proof + ELP2-05 selected publication proof → ELP2-06 selected R. Không cần chờ toàn N1 hoặc full P16 để mock hoặc xây adapter; endpoint dùng actual exporter/trust integration chưa proved vẫn BLOCKED runtime.
- Selected R + relevant ELP2-09 replay/revoke proof → snapshot/SSE surface activation riêng; endpoint chỉ snapshot không được quảng bá history/replay nếu chưa certified.
- ELP2-07 M chỉ mở sau exact operation×stage/environment TS authority, trust/exporter/relay integration, financial semantics, N1/PM gates applicable và approval. N1 core-kill F1 còn mở, PM P16 mới probes PASS không được bỏ qua ở path phụ thuộc.
- ELP2-10 performance/quality/coexistence chạy cho selected activated surfaces; performance G2 mandatory nếu manifest yêu cầu. ELP2-11 release chỉ certified scope; optional mainnet canary là quyết định khác.

Mỗi endpoint có manifest `design_ready`, `fixture_compatible`, `source_ready`, `identity_policy_ready`, `privacy_ready`, `metric_ready`, `performance_ready`, `runtime_enabled`, blockers và approver. Command còn disabled phải reject direct API fail closed, không chỉ hide nút. UI và docs được bàn giao trước full integration, với availability/pending states đúng nghĩa.


### ELP2-00 Chốt baseline coverage và quyết định

**Mục tiêu và phụ thuộc:** khởi động từ source map chương 2; chốt phạm vi release, authority, manager-first datasets, route inventory và approval boundaries; source audit phải phân biệt N1/PM/Research evidence.

**Checklist:**
- [ ] Pin commits, clean/dirty state, deployed build riêng; reconcile stable/main/tag/research branches.
- [ ] Map existing ProfileAccess/ADMIN/command paths và full catalogue families; classify source/target/runtime.
- [ ] Chốt XLC-01…11 và decisions ở chương 17, gồm owner recovery, selected modes, history/retention, placement/DR.
- [ ] Tạo source-to-requirement/test coverage matrix; không dùng census lịch sử làm current completeness.

**Deliverables:** baseline manifest; decision register; existing/new route map; approved scope and exclusions; test evidence template. **Tests:** `ELP2-T00-01` source manifest exact refs; `-02` route↔controller census; `-03` dataset family coverage; `-04` branch/deployment distinction; `-05` old/new test evidence classification; `-06` no live activation implicit.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T00-07` N1 capacity PASS nhưng F1 NOT READY; PM rehearsal/probes không full campaign; `-08` Research branches không tự là Execution baseline.

**Evidence và exit:** người chịu trách nhiệm ký scope/authority decisions; mọi unavailable field có reason/owner; không còn baseline ambiguity ảnh hưởng implementation. **Rollback:** chưa đổi runtime; cập nhật quyết định bằng version mới, giữ old evidence. **Phase report:** decisions approved/pending, affected sources, unresolved blockers, next phase được mở.

### ELP2-01 Chốt authority schema và contract fixtures

**Mục tiêu và phụ thuộc:** baseline/decisions liên quan của 00; contract đủ để TS, Edge, BFF và HIFI implement độc lập mà không đoán semantics.

**Checklist:**
- [ ] Pin Portal identity/app rights vs TS membership/capital authority; human/workload distinction.
- [ ] Chuẩn hóa resource registry, decimal/currency/time/version, snapshot/delta và command context.
- [ ] Preserve PM payload và amount partition; define capability/action mapping từ vocabulary hiện có.
- [ ] Lập JSON/OpenAPI/schema examples và golden fixture pack FX-01…25; chọn unsupported outcomes rõ. Formula/bands v1.1 pin nguyên; không biến calibration approval thành chọn lại công thức.

**Deliverables:** versioned schema/field dictionary; authority matrix; golden requests/responses; compatibility mapping. **Tests:** `ELP2-T01-01` decimal/NULL exact round-trip; `-02` UTC/version overflow; `-03` actor spoof rejection; `-04` scope/currency/mode validation; `-05` PM payload preservation; `-06` human vs workload identity; `-07` source/generation/quality headers; `-08` alias/ambiguous ID handling; `-09` explicit Edge/legacy/browser DTO mapping.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T01-10` stage/environment/lifecycle disjoint; `-11` metric capsule/field catalogue/model revision compatibility; `-12` manager vs restricted response schemas.

**Bổ sung v1.2, PLANNED / NOT RUN:** `ELP2-T01-13` fixed P/R/B, atomic weights, band edges và decimal/null schema; `ELP2-T01-14` requested/effective window, economic-vs-research binding và manager_book analytics-only; `ELP2-T01-15` per-metric statuses và lowercase analytics/uppercase availability mapping, no shared global score gate.

**Evidence và exit:** schema validation và TS/Edge/Portal review thống nhất; no unknown money meaning. **Rollback:** giữ version cũ; new contracts additive/off; không reinterpret receipts đã lưu. **Phase report:** schema versions, fixture hashes, compatibility/debt và decisions còn chặn.

### ELP2-02 Nâng cấp Profile identity và lifecycle

**Mục tiêu và phụ thuộc:** 01; mở rộng `/api/admin/profile-access`, `/api/admin/accounts`, sessions/lifecycle hiện có, không tạo auth mới.

**Checklist:**
- [ ] Reuse `portal_users`, provider/issuer/subject, owner anchor và session/CSRF.
- [ ] Add verified TS mapping state, effective rights panel và user lifecycle receipt.
- [ ] Guard protected owner, last-owner rules nếu đa owner, identity immutable mapping, no hard-delete history.
- [ ] Session invalidation path cho suspend/revoke; self profile fields allowlist.

**Deliverables:** profile/access DTOs; lifecycle adapter; owner bootstrap/recovery runbook đã duyệt; UI states/fixtures. **Tests FX-01/09:** `ELP2-T02-01` identity collision; `-02` safe own-profile edit; `-03` lifecycle/CSRF; `-04` expired/revoked session; `-05` protected-owner denial; `-06` concurrent last-owner preservation nếu applicable; `-07` bootstrap once/no restart reset; `-08` history survives archive.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T02-09` verified researcher owner user_id mapping không fuzzy name/deploy-actor; `-10` read visibility tách lifecycle/mutation authority.

**Evidence và exit:** migrated identity/session regressions pass; no owner lockout path; recovery decision approved hoặc owner-changing features explicitly disabled. **Rollback:** disable new lifecycle mutations; retain anchor/identity/audit/session generations, không restore revoked sessions. **Phase report:** migration mapping, guard coverage, session effects và recovery limitation.

### ELP2-03 Triển khai capability delegation và TS membership proposal

**Mục tiêu và phụ thuộc:** contracts 01/02 cho policy design/fixtures; TS acceptance proof chỉ chặn business-grant activation. Three presets là mapping, enforcement không dùng tên; read_all tách mutation/delegation.

**Checklist:**
- [ ] Implement shared policy evaluator, resource/mode/account scopes, deny-default và delegation ceiling.
- [ ] Preview grant/revoke before/after, protected/self restrictions, expected revisions/idempotency.
- [ ] Distinguish app-applied/TS-pending/TS-applied/rejected/unknown; TS receipt mới update effective business rights.
- [ ] Audit actor/approver/ceiling/policy/digest và invalidate quyền khi hiệu lực đổi.

**Deliverables:** capability registry; reviewed preset mappings; proposal/receipt adapter; access preview UI spec. **Tests FX-01/07/09:** `ELP2-T03-01` three presets; `-02` ceiling resource+mode; `-03` self-elevation indirect bypass; `-04` grant-of-grant restriction; `-05` pending/rejected no effective TS grant; `-06` stale revision/digest conflict; `-07` revoke between preview/commit; `-08` accepted receipt audit/replay.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T03-09` Bobby/Stan all-business read với limited mutation ceiling; `-10` OwnerAccessGuard scoped delegation adapter không blanket ADMIN; `-11` pending field policy no live researcher disclosure.

**Evidence và exit:** direct API matches UI decisions; TS rejects unauthorized proposals; no local-only membership authority. Nếu TS membership chưa implement, business grant activation BLOCKED; app-only reviewed functionality có gate riêng. **Rollback:** stop new proposals, preserve accepted revisions, audit và pending reconciliation; không tự reverse TS grants. **Phase report:** app/TS acceptance coverage, propagation status, blockers.

### ELP2-04 Áp quyền trên mọi read surface

**Mục tiêu và phụ thuộc:** 01/03 policy contract để xây/tests độc lập; current identity/policy runtime proof trước mở từng endpoint. Chống IDOR/existence leak, researcher linked-slice leakage và hidden-metric query inference.

**Checklist:**
- [ ] Typed authorized query scope bắt buộc; predicates trước paging/count/aggregate.
- [ ] Refactor documented ADMIN remnants qua evaluator; rà commands/PaperExit/facade bypass.
- [ ] Current read grant trước historical source attribution; shared physical redaction.
- [ ] Export/status/audit/download/cursors cùng policy; no shared-cache poisoning.

**Deliverables:** route authorization matrix; repository scope contracts; redaction schema; negative fixtures. **Tests FX-02/03/06/09:** `ELP2-T04-01` own/shared alpha; `-02` linked-portfolio discovery nhưng full/peer-finance denial; `-03` list/search/facets/count; `-04` detail/deep link/joins; `-05` aggregates/physical subtraction leak; `-06` exports/download/status; `-07` former-member historical denial; `-08` ADMIN/direct API bypass and safe errors.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T04-09` linked/unlinked/historical-owner discovery; `-10` restricted portfolio no totals/peers/aggregate/sort inference; `-11` denied fields through export/SSE/cache; `-12` unlink in-flight invalidation.

**Evidence và exit:** zero unauthorized fields/existence signals in approved test matrix; UI-hidden controls không là sole defense. **Rollback:** disable new dataset routes, invalidate scoped caches; giữ deny-default, không fallback broad ADMIN. **Phase report:** surface coverage, leakage probes, unresolved high-severity findings.

### ELP2-05 Nối catalogue và TS publication

**Mục tiêu và phụ thuộc:** 01 cho catalogue/adapter design và fixtures; chỉ runtime của selected dataset cần 04 privacy, TS publication/admission và Edge allowlist proof tương ứng.

**Checklist:**
- [ ] Catalogue all families; reconcile current-source/history/resource adapters và maximum-data request.
- [ ] Map grain, writer, source ID/revision, schema, quality, paging, retention cho từng dataset.
- [ ] Verify secret exclusion, immutable manifest, drain/revoke behavior; no generic proxy.
- [ ] Certify snapshot/tail barrier, source continuity và missing capabilities; keep unsupported reason.

**Deliverables:** publication manifest; dataset registry; route adapters; field coverage/gap list. **Tests FX-08/11:** `ELP2-T05-01` family/field coverage; `-02` allowlist/mode boundaries; `-03` secret-shaped field reject; `-04` bounded page/cursor; `-05` snapshot W/tail W+1; `-06` publication revoke/drain; `-07` continuity epoch/gap; `-08` source unsupported becomes unavailable.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T05-09` fund/fleet/model field coverage with owners/provenance; `-10` trust/exporter integration pending remains unavailable; `-11` per-endpoint readiness manifest blocks only dependent surface.

**Bổ sung v1.2, PLANNED / NOT RUN:** `ELP2-T05-12` snapshots/flow/cost/interval-notional availability at §2.3.1; point-in-time native equity không certified return history; `ELP2-T05-13` ledger-only direct score không yêu cầu research run, research/Regime evidence vẫn phải bound.

**Evidence và exit:** exact published schemas and read receipts from permitted environment; no claim full history từ current-page profile. **Rollback:** close new publication/adapter activation theo approved plan, retain source facts/checkpoints; no generic fallback. **Phase report:** datasets certified/blocked, per-family history/retention coverage và publication owner.

### ELP2-06 Xây Manager read models và 360 datasets

**Mục tiêu và phụ thuộc:** 01 contracts cho design/fixtures; selected 05 publication + 04 privacy trước runtime. Bounded, rebuildable Fund/Portfolio Overview và Alpha Fleet trước drill-down 360, đúng economic grain.

**Checklist:**
- [ ] Reuse Edge projection store/current+journal/checkpoint; add only missing logical stores.
- [ ] Atomic dedupe/apply/checkpoint; owner/assignment/binding intervals và source-set digest.
- [ ] Precompute overview/statement/obligation queries, keyset pagination/indexes, typed quality.
- [ ] Prove authorized aggregation, root elimination, shared physical dedupe và null/decimal semantics.

**Deliverables:** schema/index proposal and approved migrations; projection reducers; manager-first và three-view snapshots; canonical score/regime adapter; rebuild/tie-out scripts. **Tests FX-02/03/04/06/08/11:** `ELP2-T06-01` equal distinct amounts sum; `-02` duplicate-source join once; `-03` physical/internal no double count; `-04` multi-instance/scoped alpha; `-05` capital statement typed flows; `-06` historical cutoff/restatement; `-07` atomic crash/checkpoint replay; `-08` quality/paging/rebuild parity.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T06-09` fleet server sort/filter/group all applicable scalar fields; `-10` stable query snapshot/ties/nulls/units; `-11` multi-stage shared-account no double count; `-12` bounded correction/model recomputation; `-13` ALL/domain partitions, Live+Canary shared-account dedupe and Paper clone excludes real NAV.

**Bổ sung v1.2, PLANNED / NOT RUN:** `ELP2-T06-14` q73.3/P80/R66/B70 và c18.325, raw/c/A/direct-score separation; `ELP2-T06-15` same-window provisional aggregation, full denominator và provisional allocation weight; `ELP2-T06-16` missing q/A partial nhưng own NAV score available, inverse no NAV no fallback; `ELP2-T06-17` grouping/correlation/Regime independence; `ELP2-T06-18` manager consolidated F(path), internal transfer elimination và clone/account/fill dedupe, không average child score; `ELP2-T06-19` baseline cost vs missing stress dependency, zero-turnover proof, stress monotonicity/invalid path; `ELP2-T06-20` same-actual continuity, cross-stage source preselection/nonoverlap/version/gap/actual-duration proof.

**Evidence và exit:** source→projection tie-out exact by currency/source set; no fake complete; real DB component evidence. **Rollback:** switch read generation/feature flag only if compatible; keep immutable events/receipts, mark older generation stale. **Phase report:** row/amount/source hashes, query/index evidence, rejected/gap counts.

### ELP2-07 Xây trusted command và status bridge

**Mục tiêu và phụ thuộc:** 01/03/05; TS/Edge command capability được certified/approved theo operation/mode trước activation.

**Checklist:**
- [ ] Strip untrusted identity headers; attach current principal/scope/policy/approval digest context.
- [ ] Preserve PM business payload; TS commit recheck/CAS; delivery and business states separate.
- [ ] Durable idempotency/status/unknown reconciliation; same key across retries/restart.
- [ ] Reuse R1/R2/live governance gates và existing ledger; retain kill-switch/config/source binding.

**Deliverables:** dispatch/status adapter; command tracking schema; receipt panel contract; recovery runbook. **Tests FX-07/09:** `ELP2-T07-01` spoofed actor/scope; `-02` policy revoke/expiry at commit; `-03` double-click concurrent one effect; `-04` key/digest conflict; `-05` ACK before commit not applied; `-06` commit-before-response reconcile; `-07` restart/unknown same key; `-08` expected version/approval receipt binding.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T07-09` disabled direct commands fail closed; `-10` PM R2 backing/margin-risk/exposure dimensions preserved; `-11` all-business read does not permit mutation.

**Evidence và exit:** exact TS receipts plus transport trace prove outcome; Edge source currently refuses relay until upgraded gate, so no pretending existing activation. **Rollback:** disable new sends, retain status/receipt reconciliation and committed obligations; no undo economic effects. **Phase report:** operation/mode certified matrix, unknown outcomes, disabled paths và approval dependencies.

### ELP2-08 Hoàn thiện workflows và HIFI states

**Mục tiêu và phụ thuộc:** 01 fixtures đủ để bắt đầu HIFI ngay; selected 06/03 cho read-only integration, 07 chỉ khi bật actions. Hoàn thiện manager-first behavior và drill-down, không chờ mọi command để thiết kế.

**Checklist:**
- [ ] Wire Fund Overview → Portfolio Overview → Alpha Fleet → Portfolio/Alpha/Account/Broker 360; ProfileAccess và dataset-action-right matrix.
- [ ] Capital preview/receipt flows, initial zero/funded distinction, exact selected instance.
- [ ] Assignment/drain/rebind readiness, inherited blockers và archive gates.
- [ ] Error copy/accessibility, loading/empty/partial/stale/unknown, refresh/back/cancel semantics.

**Deliverables:** HIFI text specs + fixture responses; UI implementation nếu approved; operator walkthrough scripts. **Tests FX-01…07/09:** `ELP2-T08-01` three presets screen/actions; `-02` create zero/positive separated receipts; `-03` FUND vs grant/return no transfer; `-04` decrease reject vs recall pending; `-05` partial apply/cancel amount partition; `-06` locks/ancestor resume restrictions; `-07` ambiguous alpha/instance deny; `-08` move pending/drained/late attribution; `-09` rebind with obligations blocked; `-10` refresh/back/double-click/cancel and projection lag.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T08-11` manager-first navigation/fixtures; `-12` All/Live/Canary/Sandbox/Paper and separate archive; `-13` residual disposition and Paper clone lineage/no auto-live; `-14` canonical score/regime evidence and no browser formulas.

**Bổ sung v1.2, PLANNED / NOT RUN:** `ELP2-T08-15` q73.3 fair/Sơ bộ, contribution no band, raw/composition/direct headlines và threshold rounding; `ELP2-T08-16` Early5d/compare30d và mixed-observation labels/actual duration không thay actual headline; `ELP2-T08-17` analytics unavailable/stale/unbound không chặn authorized close/reduce-risk; own-slice không lộ manager denominators/provisional weights.

**Evidence và exit:** each advertised action has dataset, API, rights, receipt states, safe error and test coverage; no dead success button. **Rollback:** hide/disable new actions, retain readable status/history; no reverting grants/budgets by UI rollback. **Phase report:** workflow coverage, screen states verified, accessibility/errors/debt.

### ELP2-09 Chứng minh realtime revocation và replay

**Mục tiêu và phụ thuộc:** 04/06 cho read stream; 07 chỉ cho queued-intent/command cases. Scoped realtime phải đúng qua reconnect, policy change và continuity gaps; design/fixture có thể bắt đầu từ 01.

**Checklist:**
- [ ] Snapshot-bound cursor, generation/epoch, dedupe, Last-Event-ID authorization và reset behavior.
- [ ] Fanout per authorized subscription, bounded buffer/backpressure, no browser TS polling.
- [ ] Revoke/expiry closes protected streams/cache/download access; queued intents recheck.
- [ ] Keep committed obligations/late facts ingestion independent of user access.

**Deliverables:** SSE/delta contract; revocation propagation design; integration race harness; replay runbook. **Tests FX-08/09:** `ELP2-T09-01` snapshot/tail no gap; `-02` duplicate/out-of-order; `-03` epoch/generation reset; `-04` wrong-scope/expired cursor; `-05` revoke current cache+stream; `-06` replay/export after revoke; `-07` queued intent denial while late facts continue; `-08` reconnect storm/slow client bounds; `-09` visible-hidden-visible no false gap; `-10` true-loss coverage detection; `-11` revoke/scope change during replay; `-12` legacy/generation mapping fail-closed.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T09-13` field-policy/model revision invalidates query cursors safely; `-14` linked researcher no hidden total/peer events during replay.

**Evidence và exit:** privacy race traces and measured propagation bound; no stale grants accepted at commit; gap never marked complete. **Rollback:** stop realtime and serve authorized snapshots with explicit freshness; preserve journal/checkpoints, no unsafe replay cache. **Phase report:** cursor/revoke cases, measured propagation, continuity/retention limits.

### ELP2-10 Kiểm performance quality và coexistence

**Mục tiêu và phụ thuộc:** per-surface read/replay implementation từ 06/08/09, không bắt endpoint snapshot-only có SSE trước đo; certify selected data volume, source freshness và host resource budget alongside TS/research.

**Checklist:**
- [ ] Approve measurement thresholds/host constraints before load tests; no production load without permission.
- [ ] Capture query plans/indexes, pools, queues, fanout, replay/storage retention và source-call amplification.
- [ ] Cashflow-only oracle; advanced metrics unavailable unless certified; no double-counted assets.
- [ ] Chốt placement, consumer lease/fencing, DR/checkpoint ownership, retention/resnapshot limits.

**Deliverables:** benchmark manifest/results; SLO/resource budget; metric availability matrix; capacity/recovery runbook. **Tests FX-10/11/12:** `ELP2-T10-01` deposit/withdrawal-only metric labeling; `-02` missing methodology unavailable; `-03` exact aggregate/FX/quality; `-04` bounded source calls per browser growth; `-05` mixed query+ingest/export load; `-06` research/TS regression budget; `-07` lease failover/retention/DR reset; `-08` approved latency/lag/storage/error thresholds.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T10-09` funding buckets no invented PnL and exact denominators; `-10` canonical Research reuse/input-window isolation; `-11` bounded recompute and no expensive TS analytics; `-12` performance G2 evidence distinct optional mainnet canary.

**Bổ sung v1.2, PLANNED / NOT RUN:** `ELP2-T10-13` approved horizon-specific calibration/stress/block/maturity artifact, no fixture defaults, no empirical-validation claim từ smoke; `ELP2-T10-14` numerical fixture, temporal replay/source availability và runtime/browser/security evidence tách nhóm, partial/freshness gate chỉ dependent metrics.

**Evidence và exit:** measurements meet approved scope/baseline, no invented current host capacity; unsupported advanced metrics explicitly unavailable. **Rollback:** reduce approved feature scope/fanout/concurrency, disable expensive queries, retain correctness/security; no loosening budgets or deleting needed history. **Phase report:** before/after evidence, regression/debt, supported volume và outstanding capacity risks.

### ELP2-11 Migration tích hợp và bàn giao release

**Mục tiêu và phụ thuộc:** all mandatory selected gates 00–10; production cutover chỉ sau explicit approval riêng.

**Checklist:**
- [ ] Expand→backfill→dual-read/shadow→selected activation, schema/event compatibility và rollback readers.
- [ ] Real DB multi-connection races/crash/unknown commit, source-to-Edge-to-BFF-to-UI tests, all three presets và surface matrix.
- [ ] Restore rehearsal, migration manifest, one writer/lease, session/policy revision continuity, no migrated-scope fail-open.
- [ ] Operator training, deny/unknown/recovery walkthrough; disable unsupported routes and document remaining scopes.

**Deliverables:** approved release/rollback manifest; migration/tie-out evidence; integration receipts; operation handover. **Tests:** `ELP2-T11-01` old/new contract compatibility; `-02` idempotent migration/backfill; `-03` real DB concurrency/fence; `-04` crash/restore/replay tie-out; `-05` source-to-UI receipt/state E2E; `-06` full privacy bypass matrix; `-07` rollback preserves facts/IDs/rights; `-08` operator handover and disabled scopes; `-09` G1 OKX Demo evidence khi certify impacted TS trading flow; `-10` mainnet-canary G2 optional/no implicit live, performance G2 vẫn mandatory theo scope.

**Bổ sung v1.1, PLANNED / NOT RUN:** `ELP2-T11-11` canonical model/UI fixture compatibility; `-12` selected endpoint gates and fail-closed disabled scope; `-13` manager/researcher field policy approval and privacy full-surface evidence.

**Bổ sung v1.2, PLANNED / NOT RUN:** `ELP2-T11-14` remove old score formula/penalty fallback từ new-version DTO/UI/cache, preserve versioned legacy/original history; `ELP2-T11-15` approved formula vs runtime config vs repo/deploy approval tách biệt và source audit pin mới/locators cũ không trộn.

**Evidence và exit:** exact release/source/config/schema and independent receipts; all selected mandatory gates PASS, no unexplained critical discrepancy; approvals recorded. Không gọi BLOCKED test là PASS hoặc thay real DB bằng mock. **Rollback:** disable new mutation/stream paths, deny new risk nếu affected authority cần, preserve source ingestion/late facts/status; revert compatible readers/transport only, never reverse finances silently. **Phase report:** final scope certified, G1/G2 applicability, known limitations, monitoring/ownership và next authorized action.

## 16 Bằng chứng nghiệm thu migration và rollback

### 16.1 Evidence receipt tối thiểu

```yaml
# TEMPLATE ONLY, không phải test đã chạy
phase_id: ELP2-00
status: PLANNED
scope: selected-datasets-and-modes
source_manifest:
  portal_commit: required
  edge_commit: required
  ts_commit: required
schema_versions: []
policy_versions: []
fixtures: []
test_cases: []
environment_and_approval_ref: required-before-execution
results: []
artifacts:
  source_to_projection_tieout: null
  request_response_and_receipts_redacted: null
  concurrency_or_failure_trace: null
  query_and_resource_measurements: null
risks: []
debt: []
blockers: []
exit_gate: NOT_EVALUATED
rollback_rehearsal: NOT_RUN
next_authorized_step: review
```

Mỗi case ghi expected/actual, PASS/FAIL/BLOCKED/NOT RUN, source/config/schema, fixture seed/digest, command/event IDs đã redacted, thời điểm, log/trace artifact và người xác nhận. Tests trên SOURCE VERIFIED vẫn NOT RUN đến khi có execution receipt. Reuse historical evidence phải nêu phạm vi tương đương và những gì không được chứng minh tại HEAD mới.

### 16.2 Contract compatibility và migration

Expand schema/fields trước, new readers biết version, old consumers từ chối unsupported version rõ ràng. Không đổi unit, sign, `null`, effective time hay money meaning dưới cùng schema version. Event envelope/additive optional field chỉ backward-compatible khi consumer behavior đã test; enum mới có fallback safe, không mặc nhiên coi unknown là success.

Backfill chạy idempotent trên approved test environment, có candidate mappings cho user/owner/assignment/alias; ambiguous giữ unresolved. Không tự hardcode researcher từ ID hoặc latest owner. So sánh counts, source identities, exact amounts/currency, permissions và historical cutoff trước/sau. Không rewrite original economics/history hoặc primary keys để backfill thuận tiện.

Shadow reads không gửi business mutations đôi. Một capital authority/writer duy nhất, một fenced projection writer per partition; dual read chỉ so sánh kết quả. Chuyển generation/cursor phải có reset/resnapshot contract, giữ current authorization. Khi permission model migrate, fail closed ở migrated scope, không fallback coarse ADMIN.

### 16.3 Rollback operational

Rollback code/config/read generation không reverse finances. Applied FUND/RETURN/grant/recall/lock có receipt giữ nguyên; muốn thay đổi tiếp cần authorized compensating command và current safety checks. Không restore database snapshot cũ lên ledger đang nhận late facts để làm UI “quay về”.

Cho phép rollback reader/transport chỉ khi compatibility manifest chứng minh vẫn đọc được new IDs/versions/receipts và enforcement không yếu hơn. Nếu không, disable affected surfaces/new sends, giữ status/ingestion/reconciliation và phục hồi projection version có kiểm chứng. Giữ revoked rights và session generations; rollback app không phục hồi session đã vô hiệu hóa.

### 16.4 G1 và hai nghĩa G2 phải tách

**G1 actual OKX Demo:** khi chứng nhận TS trading flow bị tác động, actual OKX Demo end-to-end bắt buộc theo TS/Edge acceptance; Paper/mock/UI receipt không thay Demo proof. Demo tests cần environment/action approval. Pure documentation, synthetic HIFI và read-only contract design không cần đặt lệnh để bàn giao.

**Performance G2:** gate performance/capacity/coexistence trong N1/PM/Portal measurement manifest là bắt buộc khi certify workload/scope tương ứng. Capacity `6k × 2`, `9k × 2` PASS không tự đóng core-kill F1 convergence, recovery hoặc full performance campaign. Không cho `NOT_REQUESTED` chỉ vì không chạy mainnet; thiếu evidence giữ affected readiness BLOCKED/NOT READY.

**Mainnet-canary G2:** optional live canary chỉ khi Bobby yêu cầu và phê duyệt exact scope/actions. Không có live funds/credentials/approval không chặn base documentation hoặc selected non-live release nếu mọi gate bắt buộc khác PASS. Không đặt live order để chứng minh hoàn tất; ghi `NOT_APPLICABLE/NOT_REQUESTED` cho **mainnet-canary** scope, không đổi nó thành PASS hoặc exemption cho performance G2.

Evidence manifest dùng namespaced IDs như `N1.performance.G2`, `ELP2.performance`, `TS.mainnet_canary.G2` và source gate reference, tránh một cột `G2` mơ hồ. Canary UI stage riêng với tên test gate, không tự activate vì gate label giống nhau.

## 17 Shared decisions và checklist bàn giao

### 17.1 Shared contract register

| ID | Quyết định chung | Owner authority và nghiệm thu |
|---|---|---|
| XLC-01 | Portal identity/session/app rights; TS accepted business membership/capital; protected owner và delegated ceiling | Portal+TS schema/permission review; FX-01/09; ELP2-01…04 |
| XLC-02 | Full business catalogue với IDs, grain, source-set, availability và consumer mapping | TS publisher+Edge+Portal; family coverage/secret exclusion; ELP2-05/06 |
| XLC-03 | Snapshot/delta/cursor/epoch/generation và policy-filtered replay | TS publication+Edge checkpoint+Portal subscription; FX-08/09; ELP2-05/09 |
| XLC-04 | Unchanged authoritative PM payload + trusted human/service context, idempotency/receipt/commit recheck | TS command authority; FX-07/09; ELP2-07/08 |
| XLC-05 | Revocation/expiry effects across sessions/caches/streams/replay/exports/queued intents; committed facts continue | Portal policy and TS authority; FX-09; ELP2-03/04/09 |
| XLC-06 | Per-family freshness/retention/resource budget, placement/lease/DR, shared-host coexistence | Source/Edge/BFF operations owners; measured evidence; ELP2-10 |
| XLC-07 | Cashflows separate PnL; P15 raw-drawdown acceptance; advanced metrics unavailable until certified | TS metric authority; FX-10; ELP2-10 |
| XLC-08 | Baseline/source/runtime separation; real DB; G1 applicable mandatory; performance G2 mandatory và mainnet-canary G2 optional tách IDs | Release owner; ELP2-00/10/11 và PM/Edge scope gates |
| XLC-09 | Manager all-business visibility; researcher owner-user-ID linked discovery + proposed approved-field slice; no query/export/SSE leaks | Portal+TS/Research mapping+owner field-policy approval; FX-13/14; ELP2-03/04/09 |
| XLC-10 | Manager-first overview/Fleet, stages vs lifecycle, archive/Paper clone disposition/lineage, exact metric units and denominators | TS registry/economics+Portal; FX-15/16/17; ELP2-01/06/08 |
| XLC-11 | Approved P/R/B/bands; raw q, contribution c, composition A, direct portfolio/root NAV score độc lập; provisional same-window aggregation; Regime/diagnostics riêng; bounded corrections | Shared analytics owner+Portal adapter; final score companion, feasibility review, FX-18/19/21…25; ELP2-01/05/06/08/10 |

### 17.2 Những quyết định phải chốt trước activation liên quan

| Decision | Đề xuất trong guide | Chưa chốt thì ảnh hưởng gì |
|---|---|---|
| DEC-ELP-01 Owner recovery | Reuse protected anchor; separate explicit recovery, no ordinary admin override | Chặn owner-changing/recovery actions, không tạo backdoor |
| DEC-ELP-02 Delegation ceiling | Stan quản trị users và granular rights trong resource/mode/action ceiling Bobby cấp | Không bật rộng manager grants trước reviewed mapping |
| DEC-ELP-03 TS membership acceptance | Revisioned proposal→TS receipt; rejected/pending không effective | Business grants/cross-scope mutation chưa activate |
| DEC-ELP-04 Endpoint strategy | Prefer existing route adapters; `/api/v2` chỉ minh họa NEW | Chốt OpenAPI/compatibility trước client implementation |
| DEC-ELP-05 Durable history per family | Source journal/publication→Edge persisted checkpoint/projection, bounded retention | Dataset chưa proved history chỉ current snapshot/explicit unavailable |
| DEC-ELP-06 Placement and DR | Reuse SGP/HK topology theo measured budget, lease/fence rõ | Không mở fanout/history scale trước evidence |
| DEC-ELP-07 Command activation | Approved operation×mode matrix, reuse R1/R2/live gates | Relay/routes disabled; read/status scope vẫn có thể nghiệm thu riêng |
| DEC-ELP-08 Advanced metrics | UNAVAILABLE nếu methodology/input proof thiếu | Không chặn core absolute PnL/capital statement release |
| DEC-ELP-09 Export and retention | Scoped snapshot-bound exports, recheck download/revoke, bounded retention | Giữ export disabled tới khi lifecycle/quyền rõ |
| DEC-ELP-10 Performance thresholds | Đo baseline host với TS/research; approve SLO/recompute budget trước tests; performance G2 riêng mainnet | Không claim host capacity hoặc chạy load production |
| DEC-ELP-11 Researcher field matrix | Approve exact fields/precision/bands/windows for linked own slice; default exports/SSE off | Có thể design synthetic fixtures; không tự publish restricted financial metrics |
| DEC-ELP-12 Score runtime config và Regime policy | Formula `qbts_prb_v1_1`, weights/bands và direct NAV PortfolioScore đã chọn; hoàn thiện horizon anchors, delta, block/maturity/freshness/calibration artifact và Regime config riêng | Thiếu approved runtime config → metric `policy_pending`; không mở lại formula/bands, không block unrelated reads/direct NAV score vì thiếu Regime/grouping/q của alpha |
| DEC-ELP-13 Archive monitoring | Separate lifecycle và Paper clone; explicit residual disposition và lineage | Không đóng former execution hoặc auto-live từ Archive |
| DEC-ELP-14 Funding/return methods | Opening/additional funding definitions; exact percentage denominators; lot attribution nếu cần | Per-bucket PnL unavailable đến approved methodology |
| DEC-ELP-15 Per-endpoint activation | Contracts/fixtures/HIFI parallel; exact read/mutation dependency gates | Disabled commands fail closed, pending trust/exporter path không runtime success |

### 17.3 Checklist final release

- [ ] Baseline manifest pin đúng TS/Portal/Edge, deployed state đã xác minh riêng khi deploy.
- [ ] ProfileAccess tái sử dụng identity/session/owner/grants hiện có; ba presets được map bằng stable IDs, không tên.
- [ ] Bobby và Stan có all-business visibility; mutation/user/grant administration chỉ trong explicit ceiling; maintenance/dev không tự cấp.
- [ ] Thanhvuong linked-portfolio discovery theo verified researcher owner user_id; approved restricted-field matrix, no full totals/peers/sort/export/SSE leak.
- [ ] TS membership/owner authority được chứng minh cho scope bật; pending proposals không effective.
- [ ] Fund Overview → Portfolio Overview → Alpha Fleet trước drill-down; full catalogue có grain, owner, field policy, availability/confidence/provenance.
- [ ] All/Live/Canary/Sandbox/Paper đúng filter; Archive lifecycle riêng; residual disposition và Paper clone lineage không auto-live.
- [ ] Fleet server sort/filter/group/pagination theo authorized snapshot và comparable typed units; shared accounts không double count; ALL partitions Paper/Sandbox khác real-funded Live/Canary, clone không tạo real NAV.
- [ ] P/R/B và bands đúng final companion; raw q và unbanded contribution tách A composition/direct PortfolioScore; manager score dùng consolidated dedup NAV; không HHI penalty/average child scores/browser formula.
- [ ] Mọi list/detail/search/export/SSE/joins/aggregate enforce current scope và không lộ existence.
- [ ] Physical/internal/root/alpha attribution totals không double count; decimal/currency/cutoff đúng.
- [ ] Snapshot/delta/replay/cursor và access revoke đạt race/gap tests.
- [ ] Commands giữ PM semantics, exact recipient, trusted context, same key, authoritative receipt; ACK không applied.
- [ ] Capital/assignment/lock/recall workflows có pending/unknown/stale/error states cho HIFI.
- [ ] P15 cashflow-only fixture pass hoặc advanced metric unavailable; initial/added funds không có PnL tự gán; percentages có exact denominator.
- [ ] Corrections/recomputation versioned, bounded và isolated khỏi TS hot path; original/restated và availability cutoff rõ; historical/forward Regime evidence tách.
- [ ] Numeric provisional same-window/basis aggregate được và disclose provisional weight; missing q chỉ composition, missing grouping chỉ diagnostics, missing research binding chỉ research-dependent metric; short/mixed durations không giả actual30d.
- [ ] Runtime anchors/delta/grid/block/maturity/freshness config được duyệt riêng; audit input gaps §2.3.1 đã có receipts cho đúng activated metrics; fixture values không thành production defaults.
- [ ] Cost/FX/flow/notional dependency tests, stress monotonicity, band boundaries, manager consolidation và scoped privacy đều có actual integration evidence khi phát hành numeric service.
- [ ] Performance/resource/retention/DR evidence đúng host/scope, không gây regression ngoài budget cho TS/research.
- [ ] Migration/restore/rollback giữ facts, IDs, revoked rights và committed obligations.
- [ ] G1, performance G2 và optional mainnet-canary G2 tách rõ; N1 F1 và P16 integration blockers ghi đúng, không biến narrow PASS thành full readiness.
- [ ] Endpoint readiness manifest cho phép parallel contracts/UI/read-only scope nhưng disabled commands fail closed; UI fixture/model compatibility đã verify.
- [ ] Có explicit approval riêng trước repo/VPS changes và activation, không suy từ việc nhận tài liệu.

## 18 Kết quả mong đợi

Portal v2 hoàn tất trong scope được duyệt khi manager đi từ toàn quỹ tới portfolio và Alpha Fleet trước drill-down, researcher thấy đúng linked slice, mỗi người biết mình được quyền gì và xem dữ liệu có nguồn/độ mới rõ, thực hiện đúng thao tác trong authority được giao, và theo dõi đến kết quả TS có receipt. Người quản trị phải giải thích được ai cấp quyền, quyền nào đang chờ TS, command nào đã áp dụng và dữ liệu nào chưa đầy đủ. Hệ thống vẫn đúng khi mất mạng, replay, đổi quyền, đổi assignment hoặc nhận late facts.

Tiêu chuẩn hoàn tất là contract và behavior đã có bằng chứng, không phải số màn hình, số endpoint hoặc số bảng mới. Những phần chưa được certified tiếp tục bị khóa hoặc hiển thị unavailable đúng nghĩa; chúng không được lấp bằng dữ liệu giả hay quyền ADMIN rộng hơn.

### Tương thích metric basis với scoring companion

Canonical scoring dùng `comparable_basis_id` cho điều kiện có thể so sánh (verified economic domain, series kind/evidence view, exact window/frequency, currency/cost/return/calibration/stress/block policy; stage không tự là boundary) và `individual_evidence_binding_id` cho alpha/version/params/data snapshot cụ thể. Research run binding conditional khi dùng research evidence/Regime; portfolio/root direct score dùng `subject_binding_id` của economic/consolidation snapshot. Các alpha khác nhau phải có binding riêng nhưng vẫn có thể cùng comparable basis. Field `basis_id` trong DTO/fixture minh họa hoặc adapter cũ của guide này, khi dùng cho scoring, là compatibility alias **chỉ** của `comparable_basis_id`; không đưa identity riêng của alpha vào comparison key. Public canonical schema mới xuất cả hai trường và deprecate alias có version. Không dùng label stage để suy economic domain.

NAV coverage chỉ xuất khi allocation values được chứng minh là partition của **current NAV cùng valuation/currency/time basis**. Economic assigned capital 100 và current NAV 90 sau lỗ có thể hợp lệ; khi chưa có partition proof trả coverage null với basis-mismatch/not-applicable, không tự báo double-count hoặc clamp về 100%. Weight basis của composition AlphaScore đã chọn là `allocated_economic_capital`; source mapping/ownership snapshot phải verified. Risk budget, exposure cap và native margin không thay economic allocated capital. Direct PortfolioScore dùng chính economic path, không dùng weight basis của A để tính trung bình score.
