# ELP2-00 — Coverage, authority và reuse map

Source: Portal `be56efdf8a44b0fd8cd44202b04ada582293a1dd`; state/runtime pins
ở [baseline manifest](baseline-manifest.json). `SOURCE_CONFIRMED` dưới đây là
source audit, không phải endpoint/runtime V2 đã qualification. Guide gốc giữ nguyên.

## 1. Census tái lập và giới hạn

Chạy `node upgrade/execution_loop/evidence/ELP2-00/audit-source.mjs` từ repo.
Script chỉ parse TypeScript AST/JSON, hash file và đọc Git; không import app,
không API/DB/network/write. Nó nhận cả `AppModule.register()` DynamicModule,
decorator array paths và normalize `:param`/`{param}` khi match OpenAPI.
Output đã lưu ở [source-census.json](source-census.json), gồm từng route,
controller/handler/line, guard, module registration, spec/operationId và hashes.

| Tập kiểm | Kết quả source audit | Không được suy ra |
| --- | --- | --- |
| Execution `/api/v1/execution*` | 28 controllers, 112 route patterns: 84 GET / 28 POST; 112 registered, 112 có SessionGuard, không trùng method/path | Guard cấp class không chứng minh resource/field ACL hoặc quyền TS |
| OpenAPI | 46 files đã scan; 21 Execution specs; 79/112 route match trực tiếp, 33 không match | Không phải 79 route đã integration-test hoặc 33 route cần mở mới |
| Legacy Manager catalogue | 96 relations = 54 SCREEN_BOUND + 16 PROJECTION_INPUT + 13 AUDIT_ONLY + 13 INTERNAL_ONLY | Không phải full PM R2 catalogue, 96 bảng DB runtime hoặc history completeness |
| Named operations | 54 aliases sau một pattern `manager/current/:operationId` | Không cộng thành 54 controller routes mới |
| Administration / auth | 16 admin routes / 5 auth routes, ngoài 112 Execution patterns | Không phải delegation ceiling Stan đã triển khai |
| Facades | Array/wildcard paths được liệt kê riêng trong `adjacent_routes` | Không gộp wildcard thành mọi business endpoint phía sau |

Trong 33 unmatched: **2 raw-source route đã retired**, luôn410
`N20_RAW_SOURCE_BROWSER_FORBIDDEN` / `USE_CANONICAL_SCREEN_BFF`
(`execution/current-source.controller.ts:8–27`). Giữ khóa, không publish lại.
31 còn lại thuộc analytics3, financial2, market candles1, manager discovery2,
operational composition7, derivations5, history1, read adapter1, realtime
diagnostics1, runtime manifest1, durable integrity1, subject activity2 và
resource detail4. Mỗi route có locator chính xác trong JSON. ELP2-01/06 phải
classify public/internal/retired và schema-compatible trước khi thêm spec;
**không expose generic relation/cursor internals để đủ số lượng**.

## 2. Existing / change / new surfaces

Source locators dưới đây relative `apps/control-api/src/`, trừ khi ghi khác.
PUBLIC TARGET là đề xuất contract, **chưa phải route mới đã publish**; ưu tiên
adapter route cũ và compatibility, không thêm `/api/v2` chỉ vì guide minh họa.

| Surface | Reuse đã thấy | Change/new còn cần | Owner / phase |
| --- | --- | --- | --- |
| Profile identity / owner | `domain.ts`; `auth/owner-access.service.ts`; `admin/owner-access.guard.ts`; lifecycle/step-up controllers | Stable identity mapping, resource×mode rights, protected recovery riêng | Portal · 01–03 |
| Delegation / access | `admin/governance-grants.service.ts:360`; current workspace grants | Hiện cấm toàn `administration.*` delegation; explicit Stan ceiling, accepted TS membership và current-policy evaluator chưa đủ | Portal + TS · 01/03/04 |
| Manager lists | `manager-lists/manager-lists.controller.ts`; service/repository/contracts | Fleet grain alpha/version/portfolio, Canary partition, safe all-scalar filtering/group/totals, revisioned current-resource ACL | Portal · 01/04/06 |
| Resource detail / BFF | `resource-read/resource-read.controller.ts`; `screen-bff/screen-bff.service.ts` | Named overview/portfolio/account/alpha/deployment DTO đủ per-field policy/metric provenance | Portal + Edge · 01/05/06 |
| Maximum current reads | `execution/maximum-data-operation.controller.ts`; `eds11r-manager-relation.registry.ts`; `current-source.proxy.ts` | Map each PM R2 family; accepted publication/trust/schema proof, no direct DB | TS/Edge + Portal · 05/06 |
| Projection / cache | Shared-read repository; manager lists refresh/coalescing; UDB retained context | Effective policy/field revision in cache key; changed-key upserts/ingestion bounds; no owner-wide totals then filter | Portal · 04/06/09/10 |
| Snapshot / stream | `execution/realtime.controller.ts`; profile realtime/projection; durable stores | V2 barrier/epoch/correction/floor + filtered continuity, revoke proof; existing workspace/profile recheck is not full V2 proof | TS/Edge + Portal · 05/09 |
| Governance / operations | `governance/governance.controller.ts`; service; operations catalogue | Exact PM operation×mode/action bridge, trusted human context, CAS/idempotency/status/recovery; keep gate-specific executors | Portal + TS/Edge · 07/08 |
| History / charts | Financial chart/history/subject activity controllers | Per-family authoritative vs observed history; corrections; economic-return inputs and cross-currency coverage | TS/Edge + Portal · 05/06/10 |
| Export | No dedicated V2 Execution export controller found in controller census; retained context disallows download | Scoped snapshot-bound job→status→download, revoke/expiry/access recheck, storage caps | Portal · 01/04/06/09 |
| Shared QBTS / Regime | Existing PnL/health/metric availability are reuse inputs, not QBTS implementation | No `qbts_prb_v1_1` calculator/typed score capsule found in bounded Control API/Execution Edge/Execution OpenAPI search; new shared calculation+config+capsule needed | Analytics + Portal · Score P0/P1; 01/05/06 |

Specific policy hazards to retain in tests: `SessionGuard` calls personal
workspace provisioning (`facade/session.guard.ts:42`), so an authenticated GET
is not automatically read-only; this audit does **not** invoke one. Shared-read
cache scopes principal/role/workspace/profile/adapter/path, not an evidenced
effective field-policy digest (`execution/shared-read.repository.ts:17`).
`manager-lists/contracts.ts:5` has paper/sandbox/live, not a new certified Canary
mode. `AlphaFleetRow` groups portfolios under alpha; it is not target Fleet grain.
Owner display strings are not verified researcher user IDs. R2 and Paper Exit
ADMIN checks must be classified before migration, never blanket-removed.

## 3. Full business family map — 14/14 inventoried, not 14/14 available

This is the ELP2-00 requirement/source map, **not the final per-field publication
manifest**. ELP2-01/05 must expand these sets to field/grain/source authority,
availability reason, owner and consumer. A missing publication is not empty data.

| # | Required family / authority | Current source or reuse | Target gap, typed disposition and owner | Next |
| --- | --- | --- | --- | --- |
| 01 | Identity/session/app rights · Portal | Domain, session/owner/lifecycle/grants | `POLICY_MAPPING_PENDING`: stable IDs/ceiling; Portal identity owner | 01–04 |
| 02 | Membership/researcher ownership · TS accepted + Portal ID | PM R2 membership contract; Research bindings | `TS_ACCEPTANCE_NOT_PROVED`: proposal/current membership and researcher≠deployer proof; TS/Portal | 01/03/04/05 |
| 03 | Portfolio/deployment assignment · TS/PM | Manager portfolio/deployment/current operations | `PM_R2_PUBLICATION_NOT_QUALIFIED`: native IDs/grain/account lineage; TS publisher + Edge | 05/06 |
| 04 | Binding/native profile · TS | Resource binding, profile-read, activation metadata | `V2_PROFILE_MAPPING_PENDING`: mode/stage/lifecycle disjoint; TS + Portal | 01/05/06 |
| 05 | Capital budgets/locks/recalls · TS/PM | PM R2 durable economics/instance contracts; legacy capital derivation | `PM_TRUST_AND_PUBLICATION_PENDING`: backing vs risk/margin vs cap, no universal1x; TS/Edge | 05/07 |
| 06 | Orders/fills/obligations · TS | Named relation catalogue + subject activity | `HISTORY_CONTINUITY_NOT_QUALIFIED`: current/observed ≠ authoritative replay; TS/Edge | 05/06/09 |
| 07 | Postings/corrections · TS economic ledger | PM durable economics contract, no new deployed Portal publication proven | `ECONOMIC_JOURNAL_PROOF_PENDING`: original/restated lineage, no second ledger; TS publisher | 05/06/10 |
| 08 | Positions/episodes · TS | Resource detail, financial queries, relation BFF | `EPISODE_GRAIN_AND_CORRECTION_PENDING`: stable IDs and late obligations; TS/Edge | 05/06 |
| 09 | Risk/capacity · TS | Risk-decision views / PM instance contracts | `BUDGET_BASIS_PENDING`: independent cap/native margin/backing and exact units; TS/Portal | 01/05/06 |
| 10 | Valuation/reconciliation/quality · TS | Financial/chart/source-health/operational composition | `VALUATION_INPUT_COVERAGE_PENDING`: as-of, currency/FX/cost provenance; TS/Edge | 05/06/10 |
| 11 | Audit/receipts/recovery · domain owner | Governance plan/apply/status, PM operator reports, operations/incident | `PM_COMMAND_BRIDGE_NOT_COMMISSIONED`: trusted actor/receipt/recheck; Portal + TS/Edge | 07/08/09 |
| 12 | Fund/portfolio overview · TS economic facts, Portal projection | Portfolio lists/capital/chart derivations | `CONSOLIDATED_NAV_AND_FLOW_PROOF_PENDING`: unique ownership, actual/virtual partitions, cashflow≠PnL; TS/analytics | 05/06/10 |
| 13 | Alpha Fleet · TS IDs + Portal view/ACL | Manager lists and nested alpha portfolios | `FLEET_GRAIN_POLICY_PENDING`: alpha/version/portfolio, archive/Paper clone/current owner; Portal | 01/04/06/08 |
| 14 | QBTS/Regime · shared analytics with certified inputs | Fixed spec and feasibility, not source runtime calculator | `POLICY_CONFIG_PENDING` / input-specific absence: direct F(NAV) independent A/q/Regime; analytics owner + Bobby config approval | Score P0–P3 / 01/05/06/10 |

Reason labels in this inventory are **audit classifications**, not newly published
wire enums. ELP2-01 must publish the actual schema/reason vocabulary and canonical
fixtures; Claude must not import these labels as if generated types existed.

## 4. Historical evidence and affected-test handoff

- UDB/Governance retained preview and existing EDS/R3 evidence remain their
  original scope. Reuse source adapters/guards/tests; no blanket V2 PASS.
- E5/E7 source pages were bounded current-page evidence (e.g. deployment_current
  limit1, page200/1MiB). They prove neither full history nor a new shared-host SLO.
- Existing test sources suitable for affected regressions: manager-lists,
  resource-read, a4-owner-access, a4-governance-delegation,
  eds11r-manager-relation-bff, execution-realtime,
  r3-current-source-coverage-ledger. **NOT_RUN here**; select after actual changes.
- Historical numerical47/47 in the score guide is not a test run of this package.
  Formula fixed; runtime calibration/config and input coverage remain separate.
- HK N1 final stage100#2 journal has G2/G4/G7/G8 FAIL. New G7 source fix is not a
  new PASS. PM101+11 SQL rehearsal and four TEST_ONLY PG probes do not supply
  deployed human trust or full P16 proof. See manifest for exact revisions.
- Guide T00-07 wording contains older F1 status. Preserve it historically;
  current audit evaluates **capacity/recovery/runtime evidence separation**, not
  an assertion that obsolete F1 wording is current. Never exempt performance G2
  using optional mainnet-canary G2; namespaced gates required in 10/11.

Canonical per-phase test/receipt/report template is
[PHASE_PACKET_TEMPLATE.md](../../PHASE_PACKET_TEMPLATE.md). No full build,
engine test, browser or load run is appropriate for this read-only baseline.
