# ELP2-00 — Decision register và handoff

Authority: Bobby's approved guides and ELP2-00 audit assignment. Source/runtime
pins: [manifest](baseline-manifest.json). This register records already-selected
invariants and **explicit pending decisions**, not invented owner approvals.
Scope/recovery/delegation/runtime policies need owner review before activation.

## 1. XLC contract coverage — 11/11 mapped

| ID | Selected design, not a new runtime PASS | Remaining proof / owner / destination |
| --- | --- | --- |
| XLC-01 | Portal identity/app vs TS business authority; protected owner, delegated ceilings | Stable mapping + exact grant vocabulary/TS acceptance; Portal/TS · 01–04 |
| XLC-02 | Full catalogue, named safe DTOs and source/grain/availability | Per-family current PM publication and field policy; TS/Edge/Portal · 05/06 |
| XLC-03 | Barrier/snapshot/delta/epoch/cursor and filtered replay | Corrections/floor/resume/hidden skips proof; TS/Edge/Portal · 05/09 |
| XLC-04 | Unchanged PM payload + trusted human/workload, idempotency/commit recheck | Trust envelope, operation matrix and source receipt; TS/Portal · 07/08 |
| XLC-05 | Revoke caches/streams/export/queued intents, keep committed late facts | Effective-policy propagation/race tests; Portal/TS · 03/04/09 |
| XLC-06 | Bounded freshness/retention/resources, placement/lease/DR | Measured profile and approved test window/budget; ops · 10 |
| XLC-07 | Cashflow separate PnL; methodology/input-backed metrics | Economic inputs/cost/FX/flow and raw-DD tie-out; TS/analytics · 05/06/10 |
| XLC-08 | Source, real DB, runtime and named gate evidence kept distinct | Exact candidate dependency reuse + mandatory applicable G1/performanceG2; primary/ops · 00/10/11 |
| XLC-09 | Managers business read; researcher current-owner linked restricted slice | Exact field/precision/window matrix and no totals/rank leak; Bobby + Portal/TS · 03/04/09 |
| XLC-10 | Manager-first IA; actual/virtual, stage/lifecycle separate; archive clone lineage | Deployment/history/denominators/residual source semantics; TS/Portal + Claude · 01/06/08 |
| XLC-11 | Fixed P/R/B/weights/bands, raw q vs contribution vs A vs direct F(NAV), independent Regime | Shared calculator/config/input proof; analytics + Bobby · Score P0–P3 / 01/05/06/10 |

## 2. DEC-ELP-01…15 — verdict and feature-specific gates

All pending items below have an owner and unblock condition. They do not stop
ELP2-01 schema/fixture work with explicit disabled/pending states. They **do**
stop runtime opening of dependent fields/actions. No decision picks a new score
formula, turns off R2 target/composite design or permits direct TS storage access.

| Decision | Disposition now | Owner / next action / blocked scope |
| --- | --- | --- |
| DEC-ELP-01 | Protected anchor preserved; ordinary admin cannot recover/take over owner | Bobby + security: approve explicit recovery/dual-control/audit procedure before recovery actions; identity preservation can proceed |
| DEC-ELP-02 | Full business read design distinct from mutation/technical access; **exact Stan ceiling pending** | Portal proposes resource×mode×action and grant-of-grant matrix in01/03; Bobby approves before delegation activation |
| DEC-ELP-03 | Revisioned proposal→accepted TS receipt required, pending/rejected not effective | TS + Portal: agree/qualify human identity/membership envelope; current execution.read-only claim is insufficient for PM mutation |
| DEC-ELP-04 | Prefer existing named route adapters; `/api/v2` is not a mandatory namespace | Portal engineering01: freeze compatibility + OpenAPI map before generated clients; no need to ask Bobby per adapter path within approved scope |
| DEC-ELP-05 | Per-family durable journal→checkpoint/history design selected; retained current pages stay explicitly bounded | TS publisher/Edge05/09: publish family barrier/correction/floor/retention receipts before claiming history/replay |
| DEC-ELP-06 | Reuse SGP/HK topology principle; **new placement/pools/lease/DR profile pending** | Ops + Portal: measure/propose10; Bobby approves resource/service change before applying; no new host/DB here |
| DEC-ELP-07 | **V2 command activation not approved**; preserve current gate-specific behavior | Portal/TS propose operation×mode×environment matrix in07; Bobby separately approves runtime; Edge source rejects relay=true today |
| DEC-ELP-08 | Missing methodology/input → typed unavailable; never invent performance or use cashflow as PnL | TS/analytics: prove each metric in05/06/10; core authorized reads need not wait for unrelated advanced metrics |
| DEC-ELP-09 | Snapshot-bound authorized exports selected; **format/caps/grant/expiry/retention profile pending** | Portal/ops01/04/06/09 propose lifecycle; Bobby approves operating profile before new export activation |
| DEC-ELP-10 | **New SLO/quota/coexistence thresholds pending measured proposal** | Ops10: baseline, exact host window and impact budget → Bobby approval before load; retain existing valid SLOs, no weakening to PASS |
| DEC-ELP-11 | Researcher owner-linked discovery selected; **exact fields/precision/bands/windows after unlink pending** | Portal + TS + Bobby03/04: approve restricted-field matrix before disclosure/export/SSE; synthetic design allowed |
| DEC-ELP-12 | `qbts_prb_v1_1`, F=.45P+.30R+.25B, fixed atomic weights/bands and direct NAV semantics **already selected** | Analytics proposes versioned horizon anchors/stress delta/block-grid/maturity/freshness config; Bobby approves artifact. Regime support calibrated separately; no fixture production defaults |
| DEC-ELP-13 | Archive is lifecycle; monitoring Paper clone separate with lineage/quota; no auto liquidation/live | TS/Portal01/05/08: define residual disposition/clone receipts; approve exact operations before activation |
| DEC-ELP-14 | Funding/returns basis explicit; Initial/Added funds are cashflows, not cohort-PnL | TS/analytics05/06: exact denominators and flow evidence; bucket attribution only if separately supplied/proven, otherwise typed absence |
| DEC-ELP-15 | Per-endpoint readiness states; contract/design independent of runtime activation | Portal owns manifest01/05/10/11: source+identity+privacy+metric+performance+runtime enabled separately; disabled direct API fails closed |

## 3. Canonical requests arising from the audit

Status `OPEN` means handed to its named owner for future assigned phase, not a
current implementation task. No request is DELIVERED/VERIFIED from a prose plan.

| ID / sender → receiver | Observed → expected; impact | Contract/tests, dependency and done-when | State |
| --- | --- | --- | --- |
| ELP2-REQ-00-001 · Codex → Claude | Existing retained UI + two lowfi inputs → UXM-00 browser/reuse/role journeys; current preview source is saved045788b1, not be56HEAD | Read manifest and UX guide; audit 1280/660/current components/workspace deep links/retained idle requests; publish source+bundle+API pins, reuse/new/state map and requests, no new backend fact/UI implementation. Bobby must assign UXM-00 | OPEN · AWAITING_CONSUMER_REVIEW |
| ELP2-REQ-00-002 · Codex → Portal policy/Bobby | `administration.*` cannot delegate; no V2 field-policy matrix → reviewed Stan ceiling/researcher disclosure | DEC02/11; propose typed resource×mode/action/field schemas and deny/revoke fixtures01/03/04; closed only after exact owner approval + implementation/consumer proof for activated slice | OPEN · POLICY_DECISION_PENDING |
| ELP2-REQ-00-003 · Codex → Edge/TS ops | Manager Compose source path absent; images have no OCI revision; PM human trust unqualified → image/source/publication/trust custody | Before affected05/07 runtime: provide immutable source/build/schema/profile and accepted trust/publication receipts per family. Read/design fixtures remain independent | OPEN · SOURCE_RUNTIME_PROOF_PENDING |
| ELP2-REQ-00-004 · Codex → Portal ops | Dev image lacks revision; actual applied schemas not queried → exact deployed schema/config/source pin | Before affected rebuild/migration/load/deploy: authorized read-only schema/build attestation; never infer from Compose path or file presence | OPEN · RUNTIME_ATTESTATION_PENDING |
| ELP2-REQ-00-005 · Codex → Analytics/Bobby | Fixed score specification but no observed shared calculator/config artifact → typed metric capsule/config lifecycle | Score P0/P1 +01; publish shared calculator/schema fixtures, input/methodology proof and reviewed config. Pending states until then; no browser formula. Regime independent of F(NAV) | OPEN · CONFIG_AND_IMPLEMENTATION_PENDING |

These five requests summarize family/decision owners above; detailed future
changes keep this canonical ID or reference it rather than copying new ledgers.
No FE→BE request arrived during this audit; existing Research/Governance IDs
remain at their original locators and are not silently closed by ELP2-00.

## 4. Backend → Claude handoff, delivery level

- **Delivered now:** source/route/authority audit and state inventory, not new
  API/schema/generated types/fixtures. Producer application pin is be56HEAD;
  packet is **UNCOMMITTED**. No contract generation command is warranted yet.
- **Backend next:** ELP2-01, when Bobby assigns: DEC04 route compatibility;
  stable resource/actor IDs and PM envelope; exact decimal/UTCms/absence,
  policy/availability/readiness and score capsules; FX-01…25 canonical fixtures.
  Explicit pending config/ceiling/trust must not become sample live defaults.
- **Claude next:** request001 UXM-00 audit/design inventory, after assignment.
  Then UXM-01/02 IA, metric dictionary/role journeys against reviewed01 types.
  Two lowfi images are content inputs, not approved HiFi. No design-system,
  Research layout/baseline or runtime/source/command changes in this handoff.
- **Consumer details to preserve:** alpha/version/portfolio grain; UTCms and
  exact decimals; source time ≠ observed time; internal balance vs custody;
  current access before totals/filter/rank/export/SSE; actual vs virtual split;
  q/contribution/A/direct F(NAV) independent; stale/partial/denied/revoked/
  policy_pending/unknown outcome states. Never display unknown as0.
- **Real API availability:** current preview retained only; no new V2 endpoint
  qualified. Never call a fixture/bounded current-page audit full runtime proof.
- **Ack:** AWAITING_CONSUMER_REVIEW; this file is a handoff for Bobby to send,
  not a claim Claude has received/accepted it. Integration remains NOT_EVALUATED.

Suggested message to Claude:

> Đọc Unified §14 và ELP2-00 packet, nhất là decisions-and-handoff.md request001.
> Khi Bobby giao UXM-00, audit browser đúng retained preview/bundle đã pin;
> map current screens/components + hai lowfi vào manager-first role journeys,
> reuse/new/state inventory. Giữ Research/Governance workspace/deep links.
> Không triển khai UI mới hoặc đoán quyền/metric; ghi backend requests có
> locator/done-when. ELP2-01 chưa publish schema mới, nên chưa tự viết client.
