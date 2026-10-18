# C6 — source inventory for the twelve peer-board families

2026-10-18 UTC · SOURCE_ONLY / NOT_RUN · private delegate return to Main.

This is a proposed source-column fill, not a board update, consumer receipt,
runtime inspection, command activation or phase acceptance. Only this private
directory is writable by this assignment. No tests, build, SQL, Docker, source
HTTP, credential reads, Git mutation or remote write occurred. SSH used only
approved Git metadata and source/receipt files on HK. Failed guessed filenames
were not treated as evidence of missing capabilities; only verified paths below
are proposed as locators.

## 1. Inputs, authority and source identity

Read the peer board and prompt completely, peer rules §10.11–10.12, canonical
root/campaign rules, source alignment, current Manager source intake,
registration/pending packets and relevant04/07/08/10 receipts. The newly supplied
Edge locator bundle was also inspected: latest owning journal19339–19405,
guide source/availability/command/gate requirements, catalogue README/schema/
registry/field/source-gap and PM mapping/golden metadata, complete Rust DTO
handoff and maximum-data README; PM discovery, selected-history export and
command handoff descriptors. Source extracts, not a new validation run.

| Name used below | Actual path / branch / source pin |
| --- | --- |
| P | `/home/bobby/portal-research` · `docs/research-loop-plan` · HEAD `ff83f1766b513c18d3fb0102cfc5c6889ffb6343`, with Main-owned pending-control/shared WIP. Local code locators below are inspected WORKING BYTES, not an assertion that every path equals HEAD; selected hashes in §5. |
| FE | `/home/bobby/portal-research-fe` · `claude/fe-parity` · clean `488b245738cd49a320aa948350e679f5d2092697` at entry. Board exists only here. |
| TS | HK `/home/bobby/.worktrees/trading-system-next-upgrade` · `feat/v2-rust-first-okx-demo` · `bc71311362828382c88daa6de8f1ff45287d4285`. Tracked clean; untracked PM guide copy preserved, not substituted for PM R2 guide. |
| PM | HK `/home/bobby/.worktrees/trading-system-pm-v1_1` · `feat/portfolio-account-v1_1-parallel` · clean `e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2`. |
| DL | HK `/home/bobby/.worktrees/data-layer-p184-closure` · `fix/p184-dl-closure` · clean `ff5ec7a48ef3531696d4621e97d1c44484660854` at final14:35:09Z metadata read. Earlier same-task observations were `6909f711f37f7adea209edc8bac168a3fb2adfbb` then `b389efc3a04df5602473471d362d0c18ee26e007`; concurrent advance is explicit, not atomic source capture. |
| E | HK `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2` · `feat/execution-edge-upgrade-v1_2` · `20a1d27fa4d03ef7162a7980fda3fe3602995a8b` plus staged/untracked owner WIP. `services/portal-execution-edge-rs/` is the contract/crate prefix below. |

Final SSH metadata observation: **2026-10-18T14:35:09Z**. TS/PM/DL tracked
unstaged and staged diff hashes are each the empty SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Edge unstaged binary diff SHA256
`831df9804df160ad7256abaaea7c63e829b58ee81e42b10689d516fbf2d06dec`;
staged binary diff SHA256
`367d90d940ab748a92eb216df3d3e235bdbd2c05b99fda19dbb33ae7dd1404a5`.
Untracked source/receipts need their own hashes, not a claim that these two
tracked-diff hashes cover them. Relevant untracked receipt hashes are below.

The final repin kept TS, PM, Edge HEAD and all three inspected DL file hashes
unchanged. DL's new commit is a release/fmt-equivalence journal addendum, not a
newly inspected business-source qualification. Edge's journal appended an
owner-approved **planned** connected sequence and a Core reservation; its final
journal SHA is `df13bb61f45f1ebe8a730ded967303632bcf94e7b7970d023a483b1597419b21`.
The earlier14:29 journal/diff hashes remain historical observations in §5;
neither observation claims atomic capture or completed source publication.

No fresh runtime identity, applied-schema, installed-grant/provider or business
data was inspected. A source branch/DI registration is not EXISTS_MOUNTED.

## 2. Board-ready source entries — all twelve rows

Every relative P source path below starts at `apps/control-api/src/` unless
otherwise stated. Remote locators mean `file@full SHA:line`, with E dirty
receipts additionally byte-pinned in §5. Preserve FE consumer/read-sample cells;
this task does not turn their NOT_DONE into MATCH.

### 1 — Alpha fleet identity

- Exact Portal route: `GET /api/v1/execution/alphas`, not root `/alphas`.
  P `manager-lists/manager-lists.controller.ts@ff83f176:21–34`;
  `manager-lists/scoped-manager.reader.ts:37–118,343–389` (qualified identity,
  profile/tuple/field filtering; financial absence remains explicit).
- TS current-page substrate:
  `services/portal_execution_owner/manager_facade.py@bc71311362828382c88daa6de8f1ff45287d4285:233–397,703–779,860–1007`;
  PM registry/ownership logical references are named by
  E `contracts/execution-catalogue-v1/registry.json@20a1d27fa4d03ef7162a7980fda3fe3602995a8b:411–489`
  (`alpha_registry`, `alpha_ownership`, unpublished temporal exports).
- E `crates/manager-projection/src/lib.rs@20a1d27fa4d03ef7162a7980fda3fe3602995a8b:283–328,421–489`
  is existing current-page projection construction, not a financial census or
  source-ordered event journal.
- Proposed current status: **SOURCE_DARK for V2/current authority mounting**;
  identity contract/local projection code exists. Historical retained V1
  browser/API evidence exists (§3), not current V2 mount evidence. Do not mark
  identity MISSING because financial fields are missing.
- Financial normalized publication remains MISSING / unqualified separately
  under row10; FE Group/Compare/Archive/Map/time-window requests are not
  automatically served by the logical registry.

### 2 — Operations queue V2

- `GET /api/v1/execution/operations` ·
  `portal.execution.operational-queue.v2`.
  P `governance/governance.controller.ts:116–132` selects SCOPED_V2;
  `operations/operational-read.service.ts:26–44,62–87` uses the existing query
  engine on `execution_operation_queue_v2`, current exact audit cohort first.
- Source is **Portal Core operational workflow**, not an absent HK endpoint.
  P `operations/operational-read.repository.ts:22–51` correlates stored F0
  provenance to immutable Portal queue; wrong-family/cross-workspace joins fail.
  `source_integration_state=UNAVAILABLE`, `source_side_effect_requested=false`,
  `source_as_of_ms=null` are deliberate served facts, not hidden success.
- Proposed board status: **SOURCE_DARK (current V2 preview mount unverified;
  Core producer implemented/tested locally)**. E/PM/DL source locators are
  **NOT_APPLICABLE to the finite queue facts**, not missing external authority.
  External execution outcome/source-health panels remain independently dark.
- Actual local receipts exist in `ELP2-04/current-operational-parents.md`;
  they are disposable PG/HTTP qualification, not source-mounted UXM-08.
  FE-042/043 remain Claude's separate B1; this audit does not claim them done.

### 3 — Incident current root

- `GET /api/v1/execution/operations/incidents/{id}` ·
  `portal.execution.incident-current-root.v2`.
  P `operations/operational-read.service.ts:111–130`;
  `operations/operational-read.repository.ts:54–77` reads current Core root and
  rechecks target/environment/state under the final current authority fence.
- Source is **Portal Core `execution_incidents` current root**. Historical
  evidence/timeline/actor annotations are NOT_PUBLISHED with
  `ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED`; current root does not authenticate
  historical child attribution. No invented PM incident export.
- Proposed status: **SOURCE_DARK (no current preview receipt for V2;
  finite Core root exists)**. FE-015/030/031 and two-end incident links remain
  separately tracked. A synthetic DTO is not the only evidence: actual local
  PG/HTTP tests exist, but no mounted consumer receipt follows from those tests.

### 4 — Governance inbox and R1/R2/Live/Paper Exit

- Existing routes under `/api/v1/execution`:
  `/governance/approvals`, `/governance/approvals/{id}/r1`, `/r2`, `/live`,
  `/governance/exit-reviews/{id}`. P
  `governance/governance.controller.ts:252–317,334–367`.
- Finite parents are **Core records**, not PM ledger facts:
  P `governance/positive-parent.repository.ts:126–146,334–464`;
  `positive-parent.service.ts:43–76` uses captured genuine anchors, current
  gate/audit/field policy and same-flight final fences.
  `live-parent.service.ts:25–59` keeps stored LIVE_GATE root distinct from
  source business panels; source verdict NOT_ASSERTED.
- Important split: inbox still calls
  `governance.service.ts:231–275,364–383`; scoped parent list readiness is
  not made available merely by delivering detail readers. R1 permissions/
  executor are not reused as R2/Live authority. The legacy route remains a
  separate dispatch, not proof that every V2 parent is mounted.
- Proposed status: **SOURCE_DARK (finite Core positive readers with actual
  local PG proof; external source panels unqualified)**. Retain SYNTHETIC_ONLY
  on fixture-only consumer lanes, not as a claim all backend proof is synthetic.
  E/PM are dependencies only for claimed external source panels/command effects,
  not a second owner of Core decisions.

### 5 — Waivers / Conditions register

- `GET /api/v1/execution/governance/waivers` actually calls the existing
  Conditions register. Schema `governance.conditions-register.v1`.
  P `governance/governance.controller.ts:284–297`;
  `governance/governance.service.ts:298–319`;
  `governance/contracts.ts:487–506` reads Core
  `governance_conditions_register` with visible gate restriction.
- Exact meaning is recorded **Portal conditions**, not a newly implemented
  TS financial waiver/exemption producer. Source authority is PORTAL_CONTROL.
- Proposed status: **SOURCE_DARK / scoped parent availability pending**;
  finite legacy Core contract exists. `assertParentReadCommissioned` is still
  required; do not substitute an ADMIN/read-all grant or label a hidden row empty.
  E/PM/DL: NOT_APPLICABLE for these finite Core rows. No current mounted
  reader/consumer receipt inspected. Claude can consume canonical contract in
  fixture lane without pretending a new TS waiver authority exists.

### 6 — Access effective / self

- `GET /api/admin/profile-access/v2/effective` ·
  `portal.access-effective.v1` / generated AccessEffective.
  P `execution-v2/access.controller.ts:15–46`;
  `access.service.ts:279–297` returns current own grants/policy state, not the
  hidden owner's whole grant population. `POLICY_PENDING` remains a real state.
- Sources: Core policy/grants/session plus independently qualified TS mapping/
  membership. P `access.service.ts:51–91`; `access-trust.ts:14–43` defaults
  verifyPolicy/receipts/mapping to unqualified. Current PM native provider
  `services/portfolio_management/native_business_read_provider.py@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2:24–127`
  and `native_fence.py:240–281` are source implementation, not a mounted
  Portal policy grant or calibration approval.
- Proposed status: **SOURCE_DARK (current policy/provider installation not
  attested)**. FE-037/038 navigation/self capability projection is C3 work,
  not proven by this existing endpoint. Researcher field allowance remains
  separately pending owner decision; catalogue field declarations grant nothing.

### 7 — Retained review context

- `GET /api/v1/execution/retained-review`, v1/v2 dispatch in P
  `execution/retained-review.controller.ts:23–84,87–135`.
  Source is local imported retained Execution snapshot plus current Core
  read permissions, not live Edge. It explicitly says upstream/source refresh/
  stream/mutation/live_eligibility all false.
- Correct board refinement: **not merely SYNTHETIC_ONLY historically**.
  UDB-03 has real222/222 API and68/68 browser receipt at exact older API image;
  later real6-cell retained consumer receipt pins images and raw evidence (§3).
- Proposed current status: **UNKNOWN for current V2 mount; historical real
  retained preview EXISTS_MOUNTED at its receipt pin only**. If board has only
  one status cell, use `SOURCE_DARK (V2); HISTORICAL retained mounted receipt`
  and link the exact receipt. Do not silently promote old V1 source/UI images
  into today's V2/source-connected UXM-08. Current state cannot be determined
  by this no-runtime task.

### 8 — Capital collection, status and workflow

- Existing `/api/v1/execution/capital-commands` GET/POST, `/preview`,
  `/{id}`, `/{id}/workflow`, `/{id}/reconcile`.
  P `execution-v2/command.controller.ts:15,30–64`;
  `command.store.ts:18–53` local immutable transport metadata in
  `execution_trusted_commands`, not a financial ledger.
- Source contract: PM
  `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-handoff.json@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2:1–19,48–121,177–243`.
  Existing8 capital ops differ from controls/profile/management. Empty enabled
  target/profile arrays mean NO_SCOPE_ENABLED, never wildcard. Candidate
  summary is expressly not a complete authority receipt; provider is
  UNCONFIGURED_FAIL_CLOSED, production/Edge wire mounted false.
- P `execution-v2/command-trust.ts:7–60` separates authenticated prepare/send/
  lookup and has `unqualifiedCommandTrust`. Local status GET is source-I/O-free;
  original expiry does not itself revoke current audit read rights.
- Proposed status: **SOURCE_DARK**. Local complete callable transport/recovery
  implementation and genuine disposable PG receipts exist. No actual command
  provider/runtime/environment installation is credited, and no automatic resend.

### 9 — Retained heartbeats and source health

- `GET /api/v1/execution/technical/service-heartbeats` ·
  `portal.execution.retained-service-heartbeats.v1`;
  P `execution/service-heartbeats.controller.ts:11–26`,
  `service-heartbeats.service.ts:36–43,76–173`.
- Retained relation key is exactly
  `manager.current.service-heartbeats:service_heartbeats`:
  P `execution/retained-service-heartbeat-projector.ts:7–55`.
  Finite fields are retained observation/last_seen with typed clocks;
  `source_status=null`, `health=null`,
  `SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED` are not live healthy proof.
- E/TS current-page Manager substrate may supply retained relation snapshots
  (row1 locators), but does not make them current liveness/source readiness.
  P `execution/operational-composition.service.ts:281–290` deliberately marks
  V2 wrong-purpose source-health/journal absent before source IO.
- Proposed status: **SOURCE_DARK (retained technical reader exists; current
  source-health authority unqualified)**. Do not combine heartbeat observation
  and actual source-health into a single green EXISTS_MOUNTED claim.

### 10 — Manager datasets, Score, Composition, Regime

- Six current routes: `/api/v1/execution/manager/fund-overview`, `/fleet`,
  `/portfolios/{id}/overview`, `/alphas/{id}/overview`,
  `/accounts/{id}/overview`, `/deployments/{id}/overview`.
  P `execution-v2/manager-model.controller.ts:13–28`;
  `manager-model.service.ts:29–99` requires `alpha_fleet_overview`, exact
  scopes and SOURCE_VERIFIED document, not TEST_ONLY in product.
  Response `portal.execution.manager-dataset.v1`.
- Runtime/consumer/workers ALREADY exist:
  P `execution-v2/manager-runtime.ts:36–105,244–278`;
  `app.module.ts:245–263,350`. No installation => no timers/source IO.
  Shared Score/Composition/Regime modules are not to be reimplemented.
- E logical financial view:
  `contracts/execution-catalogue-v1/registry.json@20a1d27fa4d03ef7162a7980fda3fe3602995a8b:2041–2085`;
  field gaps `field-dictionary.json:759–827` explicitly UNAVAILABLE.
  PM `source_history_export.py@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2:16–53`
  supplies17 selected-history factories, not normalized full economic input.
- Proposed status: **MISSING financial normalization/census/basis/corpus;
  SOURCE_DARK for implemented Portal pipeline/current publication**. Missing
  unique NAV, current same-basis valuation partition, allocated-capital
  denominator, flow/cost grids, exact five-ID/stage/source revision and distinct
  Regime reference corpus are not solved by history existence or calibration.
- DL market source candidate locators:
  `qdl/runtime/stable_source.py@b389efc3a04df5602473471d362d0c18ee26e007:134–190,210–263,336–356`,
  `qdl/query/service.py`, `config/v2/stable-source-bindings.yaml` (§5 hashes).
  They are not proof of Manager unique NAV or Regime accepted corpus.

### 11 — Instance registration

- Four paths `/api/v1/execution/instance-registrations/preview`, collection
  POST, `/{id}` GET, `/{id}/reconcile` POST.
  P `execution-v2/instance-registration.controller.ts:19,49–72`;
  service `:74–87,139–221,254–300`;
  trust `:20–50` pins exact source boundary; Main normal-hook commitff83f176
  and generated fixture exist, per owning packet.
- PM
  `services/portfolio_management/operator_management.py@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2:27–43,208–249,284–327`;
  `operator_adapters.py:422–454,511–519` candidate router construction.
  REGISTER_INSTANCE0→1 is registry-only REGISTERED_UNFUNDED; no automatic
  FUND, grant, canonical deployment/account pair or Live activation.
- Proposed status: **SOURCE_DARK**. Source bytes compatible (§5), but selected
  authenticated transport/provider/current-human installation is not attested.
  Parsing candidate summary is not authority. Consumer is specifically
  AWAITING_CONSUMER_REVIEW, not blanket FE_NOT_STARTED.

### 12 — Pending recall controls

- Four paths `/api/v1/execution/pending-recalls/preview`, collection POST,
  `/{id}` GET, `/{id}/reconcile` POST.
  P `execution-v2/pending-control.controller.ts:18,48–71`;
  `pending-control.service.ts:87–96,143–218,247–297`;
  `pending-control.trust.ts:24–54` pins selected source; metadata only in Core.
- PM
  `services/portfolio_management/operator_adapters.py@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2:27–36,147–175,233–312`;
  `services/risk_pool/recall_repository.py:126–179` handles APPLY_PENDING and
  CANCEL_REMAINING on the original remainder, not a negative FUND alias.
  Original vs linked latest receipt/operation and five-way exact partition remain
  distinct; WAITING can be ACKNOWLEDGED without being settled.
- Proposed status: **SOURCE_DARK / applied local WIP, validation pending** at
  the inspected P bytes. Packet's actual migration144 failure is retained;
  Main C1 repair/retake may supersede it after this audit. This task cannot
  claim commit/runtime/test success on concurrently changing code.
  No installed selected provider or consumer ACK credited.

## 3. Real historical retained evidence — do not erase, do not overpromote

Canonical `upgrade/research_loop/evidence/UDB-03/README.md:25–33` names actual
API222/222, existing browser68/68, API image
`sha256:ac7bb2950ecb2b3ec4ba0542f3725ea79205acc69deeeda25b668832a2ed0acd`.
`UDB-03/codex-consumer-refinement.md:44–78` names web image
`sha256:7fc8be4e966b4336d18ed221397a2ee96b6ee6ae6cbd01a03acb3a3e665db331`,
bundle `index-CBEWyyfN.js`,6real public retained cells/1280+660, no streams/
business writes, and raw browser SHA256
`f25b9ecebbe3811df8fe1344bda0a7e09fb011a75493d4a092f77eec52290a52`.
Failures503/invalid-clock/401 there include explicit injection, not a real
grant-revocation/outage proof. These are honest historical runtime receipts,
not receipt for P HEADff83/current V2 policy/schema/source provider.

## 4. Important newer owner results and catalogue scope

### Newer Edge result supersedes the old strict-timeout shorthand

E dirty owning journal
`upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md:19339–19405`, plus
`upgrade/evidence/execution-edge-v1_2/EPG10-08/native-current-manager-notice-port.json:1944–1965,2215–2217`
records **213 DISTINCT current-source cases PASS,145pure+68PG-fixture**, both
strict profiles PASS, same source manifest
`ed93f56f1031cebac36ed2139992e048568ddd432138f6cff8a09e9965e4f44e`.
Owner cleanup on HK/SGP is recorded, not independently runtime-rechecked here.
PM protocol/identity fixture remains synthetic; public mount/provider authority
NOT installed, original08 NOT_MET, connected09 NOT_STARTED. This is a material
update from canonical intake's114PASS+strict-timeout. Reuse owner receipt only
after exact changed-source compatibility review, not by importing its full
old Core source tree or claiming213 new Portal/current-runtime tests.

### Newer PM17-dataset delivery result

PM `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2:79499–79523` and
`contracts/baseline/portfolio-account-v1_1/pma11-13-typed-history-delivery-evidence.json:1–26`
record **90unique PASS =52PG+38unit**, separate26planning;17 new owning dataset
cases run through existing selected exporter → TLS1.3/mTLS → separate PG
storage, source fixture rows unchanged. Five use existing accepted-source
fixture classes;12 use explicit TEST_ONLY EXPORT grants. External identity/
workload/destination remain TEST_ONLY. Storage ACK is not consumer atomic
apply/checkpoint or full source census. No new actual runtime source authority.

### Exact bundle semantics, not42 or17 available product endpoints

- E `contracts/execution-catalogue-v1/README.md:22–39`: **39Edge families +3BE
  views =42 logical inventory rows**; no42running endpoints. Registry embeds
  older source pins TS216bffbe/PMd16aa2b5/DL87db2159/Researchc1d6b2dc;
  keep those original frozen pins, do not rewrite them to fresh worktree HEADs.
  `new_runtime_exports_enabled=false`, per-family UNAVAILABLE,
  `enabled_environments=[]`, history_fullfalse, coverage proofnull remain.
- `field-dictionary.json:1–4,759–827`: logical Manager field policy is not
  deployed grant; researcher fields pending; source-basis gaps explicitly
  UNAVAILABLE. `pm-controls-map.json:1–5,65–77` is synthetic alias parity,
  not admission or a product exposure policy.
- `manager-v2-paper-read-v1/RUST_DTO_HANDOFF.md:1–17,130–160` is historical
  typed façade blueprint, not new DSN/raw relation authority. Its Paper-only
  comment is not today's new catalogue's runtime activation.
- `maximum-data-return-v1/README.md:29–38,89–132,136–164,199–201` preserves
  old current-page200rows/1MiB as per-page, not total-history cap; E5 is
  source-dark, E6 includes historical same-host57named page observations,
  E7 portable return is not a new BFF/Edge deployment/current-native mount.
- PM discovery descriptor: exact candidate POST
  `/internal/pma11-candidate/catalogue/discover`,12logicalfamilies/17selected
  datasets, explicit opt-in UNMOUNTED, runtime_enabledfalse, environmentsempty.
  Discovery metadata is not permission/history/availability proof.
- PM selected export descriptor keeps source_census_complete/snapshot boundary/
  publication generation/applied checkpoint null. It is selected history,
  not a whole Manager financial snapshot even after typed delivery qualification.
- PM command handoff is ISOLATED_PACKAGE_QUALIFIED_SOURCE_DARK;
  production_mountedfalse/edge_wire_mountedfalse, provider
  UNCONFIGURED_FAIL_CLOSED. Genuine current-human COMMIT lease, full owning
  outcome, native/environment cells and installed trust remain explicit gates.

## 5. Exact read-byte pins

### Peer/Portal inspected bytes

| File | SHA256 |
| --- | --- |
| FE `evidence/SOURCE_TRUTH_BOARD.md` | `fb662c1085f49403c1421e75f9d57c64a72187fc6d67ca54104a79537cb900e4` |
| FE `design/sync/PROMPT_FOR_CODEX.md` | `f49e67052501655fc580827378f034da0652294a8a08544550a81fbf8063b82c` |
| FE campaign rules | `cb0c0e63c74af7ae731b9ff412b2906df6c7d8551c3702f0f353d46b533617fb` |
| P root AGENTS | `5430307c303de62353a90f14ccd751e40adf9f66a6ed67377fd10c97f099827e` |
| P campaign rules | `3be42840d8d103c30c7c3022231f16fc586d002b165b1d4d4fb903cb0bcc86f8` |
| P `app.module.ts` | `8526993d49de5aceb341b2a1f1831404ae9dc80865a09103d2e965c356ee4de1` |
| P `manager-lists/scoped-manager.reader.ts` | `2dde734686431b3c310dffc449b1458756e2d58544217177a170442a6eb7624e` |
| P `operations/operational-read.service.ts` | `97ba8d0c9a8a070a45518a9322c9d0c35ead5d128e6756470070aaee78186c1d` |
| P `operations/operational-read.repository.ts` | `20369db3915c468379d915edfa46379b61b2a0666179846730b1868a40bb80e3` |
| P `governance/governance.service.ts` | `9291ba7396fcf0a35d0874810ca3b596dafa5d19702cb278546d094d9506c94d` |
| P `governance/positive-parent.service.ts` | `bb71f02ac3df17f2a986b9c4d1d1f618d59063a8a2e6c39c395459a637fc2b09` |
| P `execution-v2/access.service.ts` | `3871073b663145597320af3f19c7b8bd43acb2581a7283e7a43158a4b7ef1f82` |
| P `execution/retained-review.controller.ts` | `3126195fb9d4212a87183570c24654fc8cb85f82e0edba91e887fc2e92255585` |
| P `execution/service-heartbeats.service.ts` | `86db4abd70cd5647375fe4b9acc87e6eb4dc15db01505d034cf8abee22949116` |
| P `execution-v2/manager-runtime.ts` | `532184d2776ac6323f058c5d02005aa2a9fd67ee6683f9fea2b8cdfc477c25c8` |
| P `execution-v2/instance-registration.service.ts` | `97b270a929e281aa2435bfbbfcb4225656a2f10f57ba1bdcd691df4c4c6c1d82` |
| P `execution-v2/pending-control.service.ts` (Main WIP) | `bdccb1bc0f666ea39497f00d1debfacb4ca66d3cb0f7190824fa6914934e2550` |
| P `ELP2-05/manager-source-intake.md` | `04983b4f8526268408f7ba9872a898f7c9e262a547f59909130d149a79bb8cd7` |
| P `ELP2-07/instance-registration.md` | `a6f1d7d009fbd1435ee7b0d5752ae744104f7d9750170b94480060a318cad197` |
| P `ELP2-07/pending-control.md` at audit | `e0706c10a41f4f6ad662980d98e0f7c53451f46a6dc7f322c4c8699a1949878c` |

### HK verified source/receipt bytes

| Relative path / owning tree | SHA256 |
| --- | --- |
| TS `services/portal_execution_owner/manager_facade.py` | `244315bf26c71ef74a131cac727f1d7d30e09ed25aa634f0f894f2de32a0d628` |
| TS `services/portal_execution_owner/catalogue.py` | `30f878d24eb926033fe84ec18ea5c60a580f2170ff08a927dba9924f3526e68f` |
| PM `services/portfolio_management/operator_adapters.py` | `ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e` |
| PM `services/portfolio_management/operator_management.py` | `f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab` |
| PM `services/risk_pool/recall_repository.py` | `8c62e73045f7c39483d69ddeff439b747b724970986db91e204005e1d95750e3` |
| PM `services/portfolio_management/operator_intent_journal.py` | `6cb6fac7bb81e61dddd2d9decbb099d22c040f13a71565a253dddb06b364492b` |
| PM `services/portfolio_management/operator_wire.py` | `3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9` |
| PM `services/portfolio_management/native_business_read_provider.py` | `0134b84aa9da5887214faa3108cc299a120a217762dabdb23386347589c9b048` |
| PM `services/portfolio_management/native_fence.py` | `ec7016f26ced2c2cba19e6c03b83ad70b2576d235078d64ccaa80beaaca87186` |
| PM `services/portfolio_management/source_history_export.py` | `1493455341d1e7a714bc10cdc6e2f733f22c247520836ee74fcd583d8c4409f6` |
| PM `services/portfolio_management/report_storage_transport.py` | `5bac57381200c9d659472c57b20f8cbae36b9b6730912790c64f1edf444fbd7a` |
| PM `services/portfolio_management/stored_report_source.py` | `139a816401de29d8345261758879bad24bf1c8c48eecb2ba19786d4393ba0dc1` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-14-history-correlation-evidence.json` | `40c83b78c2216c4fd6fb5545324a89dfb415486aafd9a429a5cba7f7407159fa` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-13-history-delivery-evidence.json` | `99254190e03a11eba5b48f9c21b3bde8f15a4cb854ca2178609b84a57fe251c4` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-13-typed-history-delivery-evidence.json` | `7c75611bbcba7ccad6b914dcaf19f76365bd8fc756b6487491eff68e158af280` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-14-dataset-discovery.json` | `7fbc9f59527b79ab82f84266266104aeb7c71c9702ca43f77450009462b98f5d` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-13-selected-history-export.json` | `6b78bfe784a29c917fdc40c5c31839c296f052b503c2e4e31225dda5ce1e9814` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-handoff.json` | `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b` |
| PM `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `1b9801fcd537492b868c4bdba851de7a177bbd5c8f85694f7b55d531db0b20e8` |
| E `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` (dirty,14:29 historical read) | `a444d4d7d0681ad5467dfa0b404140b58d70746343d4a93abffd2ee478252e35` |
| E same journal (final14:35 append repin) | `df13bb61f45f1ebe8a730ded967303632bcf94e7b7970d023a483b1597419b21` |
| E `upgrade/upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` | `10d388cd8ef400a449f139e95251af912961692e07ce4acd3b2de6fc063e6516` |
| E catalogue `README.md` | `f84e468c1bc79ffe7208f02fea02ff0470db46e7c910210ed5aa739b4a8ce7ef` |
| E catalogue `registry.json` | `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67` |
| E catalogue `catalogue.v1.schema.json` | `f5716fdc0725eeb65b9ab832efd8be22d155bcb8cd44b465f3e4e0a5c625e2a5` |
| E catalogue `field-dictionary.json` | `aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e` |
| E catalogue `pm-controls-map.json` | `c5d8f22199380b102516a6aa166bebcf30a9b6c80b45a6bb9b638dc6eb51d8bd` |
| E catalogue `golden.json` | `da068f67325b4ae673884433557ce1924048011ab7d90d5fa228e0ba75faea75` |
| E catalogue `mapping-golden.json` | `20b05095107461b1dd92d47191659246e4a788aac76bbe01dbc30dec22e4044c` |
| E `contracts/manager-v2-paper-read-v1/RUST_DTO_HANDOFF.md` | `7d50c2a3cae1270d72fef9bdb25d07c34c794570bfd8c5d99d05efb79637117c` |
| E `contracts/maximum-data-return-v1/README.md` | `780ceeff2b6293523f7444d5d0fbe956b39e95a07cb2b551bc76dfd11610d16d` |
| E `crates/manager-projection/src/lib.rs` | `d4f0c053a539fae8090ea69388a17b400c5daa7510ab7bd596d51b4cd1b505b7` |
| E EPG10-08 `native-current-manager-notice-port.json` (untracked) | `e0ef1c34a280c0f03bb23ca0ddc6dcc7cd5abc955a6efe69585398331c5c32ce` |
| E EPG10-08 `native-current-manager-reducer-qualification.json` (untracked) | `18e6247115e8a1af1227b64efa95168f50af82a416804d7afa5edc6ece878cf9` |
| DL `qdl/runtime/stable_source.py` | `eec6f49a0b8367125a1e0fd2b2aa4bd4d0e584baea1664c4702dbecf41f6496a` |
| DL `qdl/query/service.py` | `4b03b7c450833b686d613cb4408c7c908ad552997fc840dbf622333e72ff1665` |
| DL `config/v2/stable-source-bindings.yaml` | `9d4ab51e4880a3615e4171fe4cebc244c02522a20bbd3273973478ef32ec275d` |

## 6. Handoff / done-when

Main can transfer the twelve source entries into the board after its own
canonical/peer intake boundary; do not overwrite Claude's FE/sample/request
columns. Fill row5 as Conditions register; row10 with the six real routes;
row12 with the four actual paths and the latest C1 terminal, not this earlier
WIP observation. Link the historical retained evidence rather than deleting it.

For a family to change to current EXISTS_MOUNTED, require exact served image/
source/contract/provider/profile/environment/workspace/authority pins and real
authorized read receipt with current revoke/field/tuple/completeness semantics,
then Claude's consumer receipt/sample MATCH on that exact pin. A new commit,
DI controller, SQL migration, catalogue row, synthetic fixture or isolated
owner tests cannot substitute. Family-specific absence must retain reason and
owner; no hidden total/zero/healthy/applied inference.

Independent next work is compatible owner-source intake and the already
approved C1–C5 local gaps, not a new framework or re-running unchanged proof.
Source/provider/native/publication/coexistence/calibration/browser gates stay
owned under original05/06/07/09/10 IDs; full11 NOT_ENTRY_READY. No automatic
credential/certificate change, deployment, push or dev/main merge authorized by
this report. Rollback/cleanup: no resources/source changes to undo; retain this
bounded private audit only. No consumer ACK or phase full-PASS inferred.

## 7. Fresh source-publication addendum — later snapshot, not runtime acceptance

The §1–§6 snapshot ending14:35:09Z remains historical and unchanged. Main
reported new HK heads at15:05:08Z and approved a bounded source/metadata-only
follow-up on the SAME Edge/PM worktrees. Successful reads included timestamped
Edge journal15:06:47Z and PM journal15:06:51Z, with the principal read batch
ending15:08:13Z. Exact committed filenames and PM §58.154 were clarified at
15:11:23Z/15:11:38Z. Final clarification observation: **2026-10-18T15:11:38Z**.
These are sequential mutable-source observations, not an atomic capture. Failed
sandbox socket attempts returned no source evidence; only the successful
approved readonly SSH reads support this addendum. No provider, business API,
DB, credential, process, source activation or service state was queried.

### 7.1 New metadata and bounded diff impact

| Tree | Directly observed new source | Change from historical §1 pin |
| --- | --- | --- |
| Edge | `8b7eb0c1b5a1a4f4b717cd96799df658e1981a42`, same worktree/branch | `20a1d27f..8b7eb0c1`:28files,+10252/−6; guarded native-read publication, qualification artifacts, tests and journal. `d0aed38baba394f1542dc2e8b922479dfd9e5546` publishes the guarded source package; `8b7eb0c1` reuses the current Core history-fixture correction. |
| PM | `91ca9dfaf36a5c4ccedfa78209d38deafff29c72`, same worktree/branch | `e4dbc520..91ca9dfa`:5files,+346/−4; plan, discovery bounds, new approved-followthrough index, concurrency readiness and current R2 guide. Not a committed command/native wire change. Owner implementation WIP is separate below. |
| TS/DL | Not re-read by this bounded follow-up | Main's15:05:08Z report: TS still`bc71311362828382c88daa6de8f1ff45287d4285`; DL now`54caaa0c47de4c77c3d4239956cec852f3d0f238`. These are explicitly Main-reported metadata, not this delegate's fresh file-byte or runtime verification. |

Edge tracked unstaged and staged diffs were empty; each SHA256 was
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Untracked owner paths remained `apps/control-api/src/execution-v2/`,
`apps/control-api/test/native-read-egress.spec.ts` and
`upgrade/upgrade_v1.2/SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md`.
Empty tracked-diff hashes do not cover these untracked bytes or imply a clean
whole tree.

PM tracked WIP: `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` and
`services/portfolio_management/instance_repository.py`. Untracked owner paths:
`contracts/baseline/portfolio-account-v1_1/pma11-05-paper-monitor-candidate.sql`,
`contracts/baseline/portfolio-account-v1_1/pma11-elp210-research-association-candidate.sql`,
`services/portfolio_management/{paper_monitor_contract,paper_monitor_repository,research_association}.py`,
`tests/integration/{test_elp210_research_association,test_pma11_paper_monitor_repository}.py`
and `tests/unit/test_pma11_paper_monitor_contract.py`. PM unstaged binary-diff
SHA256 was`a35f12e05a27b23511b9e8cb8552fbabe127ef84cfe4d7de5970278df38d992e`;
staged diff hash was the empty hash above. No untracked-source hash was inferred
from these tracked hashes, and no peer WIP was changed.

### 7.2 Edge publication is now committed; current-Core mount is not established

Actual owner journal `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`
was inspected at19400–19526. Committed delivery directory
`upgrade/integration/execution-native-read-v1/` contains `README.md`,
`manifest.json`, `qualified-source-pins.json`, `qualified.patch` and
`qualification/{pg,production,spec}.json`. This is a useful new source delivery,
not merely the previous uncommitted draft. Its original qualification/source
pins must stay intact rather than be relabeled with a fresh HEAD.

- Guarded package:26source files (23latest authored plus3existing Manager
  prerequisites),188154-byte patch,697-file qualification closure pinned, not
  copied wholesale. Preimage/apply/output/reverse guards and8publication units
  are **owner-reported** PASS; this follow-up did not run them.
- Package preimage is Core`0d5ceaba3281cd51e8dd2f7caebc9a7b8e82db05`.
  Current-Core`ff83f176` overlap is exact:
  `execution-v2/access.service.ts`, `execution-v2/read-scope.ts`,
  `execution/current-source.proxy.ts`, `test/harness.ts` under the control API.
  Owner described semantic merges preserving current terminal/lease repairs;
  these are not proof of an applied/tested/current Core integration. Do not
  force the older patch over those current files or mistake preimage refusal
  for missing source implementation.
- Original213distinct cases remain145pure+68PG-fixture at the qualified
  source pins, reused rather than rerun/new coverage. They do not become
  connected or mounted because the source patch has now been committed.
- The separately invoked normal hook terminated14:51 with exit1:contract
  gate PASS, production TS build PASS, API716PASS/1FAIL/0SKIP across72files.
  The failure was fixed-date history-fixture aging at
  `test/profile-projection.spec.ts:1560` (expected102, actual empty). Restore
  was NOT_RUN after that failure. The717API cases include57older untracked
  egress-draft cases, not all published current-Core product tests.
- Commit`8b7eb0c1` adopts the test-only relative-recent-time correction from
  current Core; a corrected normal-hook terminal was **NOT_OBSERVED** in this
  bounded journal window. A commit alone cannot fill that missing result.
  Owner documented that the source commit did not automatically invoke a
  hook, and recorded a separate actual hook invocation instead.
- EDS12 verify-static is owner-reported PASS while `product_active=false`,
  `operations_qualified=false` and deployed evidence pending. Full08 remains
  IN_PROGRESS/NOT_MET. Selected source/provider, current trust, real HTTP/SSE,
  revocation/cache/cursor/command COMMIT,09connected and10cutover remain
  separate gates. No AppModule/DB/grant/runtime flag/listener/image activation
  follows from applying this source-only package.

### 7.3 PM adds the approved follow-through index; source-owner work is not receipt

The exact committed five-file delta is:

1. `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md`.
2. `contracts/baseline/portfolio-account-v1_1/pma11-14-dataset-discovery.json`.
3. `contracts/baseline/portfolio-account-v1_1/pma11-16-approved-followthrough.json`.
4. `contracts/baseline/portfolio-account-v1_1/pma11-16-concurrency-readiness.json`.
5. `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`.

The complete307-line approved-followthrough index declares schema
`pma.approved-followthrough.v1`, status
`APPROVED_SOURCE_IMPLEMENTATION_AND_ELIGIBLE_ISOLATED_INTEGRATION_OPEN`, and
artifact role`DEPENDENCY_AND_HANDOFF_INDEX_NOT_RUNTIME_REGISTRY_OR_ACCEPTANCE`.
Runtime activation and push/merge remain false; phase17 is NOT_STARTED. It
records9approved source-owner steps and their inputs/done-when, not grants or
installed availability. Source ownership no longer justifies calling those
approved implementation tasks external debt, but their approval is not PASS.

Discovery's changed bounds now correctly say17reviewed descriptors and17selected
datasets (previously16 in those two bounds). Its12logical families,
`runtime_enabled=false`, `enabled_environments=[]` and UNAVAILABLE/opt-in
candidate boundary remain intact.42mapped Edge logical families are not42
running endpoints. RETURN_CAPITAL remains unavailable pending its owning paired
return writer; it is not an alias for another operation. Source capture is
BOOTSTRAP_ONLY, not a whole-transaction or complete-financial-census proof.

Latest owning plan §58.151–§58.154 (approximately79510–79579) reports:

- §58.151: the nine-step source handoff matrix is prepared; planning/readiness
  metadata checks report planning-valid but execution-not-ready and0product
  cases run. New actual source integration still needs affected proof.
- §58.152: Research association candidate has3metadata tables and immutable
  version/source/owner correspondence. A deferred COMMIT owner/registry-head
  recheck omission was found in static review and correction planned before
  fresh testing. Fresh behavioral tests are NOT_RUN; older45candidate cases
  are not evidence for the current changed PM source. A Research seal/bundle
  is not a TS-accepted trade-parameter/config pin.
- §58.153: archive-origin Paper monitor/source/SQL and InstanceRepository
  storage-helper work are owner WIP. New linked IDs/generation are distinct;
  MATERIALIZED_HALTED/unfunded cannot inherit running/funding/activation or
  credentials. Tests NOT_RUN; API/capture/history integration is unfinished.
- §58.154: accepted executable-pin/stage timeline work is IMPLEMENTING, fresh
  unit/PG tests NOT_RUN. Financial stage PAPER/SANDBOX/CANARY/LIVE is separate
  from environment paper/sandbox/live. Stage/executable head/revision/outbox,
  exact accepted config source, corrections and current fences are described,
  not a served current-stage/day/financial history fact. API/capture/history/
  migration integration remains owned unfinished work. Do not satisfy C4's
  stage/window requests with this untested planned source.

The approved-followthrough index's46unchanged/4changed source-pin comparison
refers to an **older qualification closure**, not the committed e4dbc→91ca
delta. Do not confuse it with a fresh regression result or roll back the
current wire to those old receipt pins. Current90case isolated typed-history
receipt and command handoff bytes were unchanged at the fresh read.

### 7.4 Fresh inspected byte pins

| Tree/path | SHA256 at the bounded fresh read |
| --- | --- |
| E owning journal | `86426e91689bbb18f20fec87681d9b5f655b7305330a1e9921665b4690f6a0f9` |
| E `upgrade/integration/execution-native-read-v1/manifest.json` | `f3ef6c58525284f983f390316f18329ea6f0f03f8ef341a9f775f8314cce3ea8` |
| E same directory `qualified.patch` | `50b6bc52877d77526a55c96d38698c6bcc0ff440ef840cc2abde350474a67be1` |
| E same directory `qualified-source-pins.json` | `ed93f56f1031cebac36ed2139992e048568ddd432138f6cff8a09e9965e4f44e` |
| E catalogue `registry.json` (unchanged) | `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67` |
| E catalogue `field-dictionary.json` (unchanged) | `aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e` |
| E213case `native-current-manager-notice-port.json` (unchanged) | `e0ef1c34a280c0f03bb23ca0ddc6dcc7cd5abc955a6efe69585398331c5c32ce` |
| PM discovery JSON | `013e721ff223e2a8ceb33a002fb5134b87db51cad503d525ea7666d97128e17e` |
| PM approved-followthrough JSON | `7f13902327d24c4a1f039d2cdf8831cdd696754ee3e1938facef36ebaec84738` |
| PM concurrency-readiness JSON | `f4ed3bc96c7c8b70d77bb58228b69aef0a7f0ae8e27ae95ee0e26e1eed207d9c` |
| PM current R2 guide | `c783d029f62959a6e9701350c2555dca210cacc9b553706e73a368504c086f6c` |
| PM owning plan, dirty | `bc8f974f3a8f70d70a61a9cd25c3cbca60d1a60b043e13258f580e149d4b28b3` |
| PM `services/portfolio_management/instance_repository.py`, dirty | `a554976f8c2d957dab57ec52ae2f80b8aae5f9d19caac00de8c8585119e4b5e4` |
| PM `operator_adapters.py` (unchanged) | `ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e` |
| PM `operator_management.py` (unchanged) | `f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab` |
| PM `services/risk_pool/recall_repository.py` (unchanged) | `8c62e73045f7c39483d69ddeff439b747b724970986db91e204005e1d95750e3` |
| PM `native_business_read_provider.py` (unchanged) | `0134b84aa9da5887214faa3108cc299a120a217762dabdb23386347589c9b048` |
| PM `native_fence.py` (unchanged) | `ec7016f26ced2c2cba19e6c03b83ad70b2576d235078d64ccaa80beaaca87186` |
| PM90case typed-history delivery receipt (unchanged) | `7c75611bbcba7ccad6b914dcaf19f76365bd8fc756b6487491eff68e158af280` |
| PM capital command handoff (unchanged) | `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b` |

### 7.5 Board disposition and next useful action

All12current mount/provider cells remain UNKNOWN/SOURCE_DARK or the precise
MISSING financial-publication prerequisite already recorded. Historical retained
REAL receipts and isolated213/90case results are preserved at their own pins.
The useful new action is Main's reviewed semantic intake of the guarded Edge
source package into the SAME current-Core paths, followed by only affected
validation and actual selected-provider/current-authority qualification when
owned prerequisites exist. The fresh PM metadata gives exact owner follow-
through and pending source work; it supplies no invented NAV/denominator/stage/
Regime corpus and no automatic permission or COMMIT proof.

C1's latest PG34PASS/fullR3RUNNING is still Main-reported at this handoff;
this source follow-up did not observe its actual normal-hook terminal/commit.
Main alone updates that result. No FE sample MATCH, consumer ACK, runtime
mount, source-command outcome, phase completion or release was inferred.

## 8. Late peer-board preservation check —2026-10-18T15:14:49Z

A final text-only comparison found that Claude's board had changed during the
source follow-up. Its new byte hash is
`52717576624822eca6e47e6f77d5acce40ba0291612730b61074b21bea295d1a`;
the historical §5 hash`fb662c10...` is not rewritten. The complete new peer
board was re-read, without editing the FE worktree or inferring a new Git pin.
Proposed board now preserves the updated access-reader cell, distinct F0 versus
capital/currency warning, usable heartbeat-fixture note, pending-control review
risks and complete F8 consumer-receipt section verbatim.

F8 reports53/53AJV examples (40delivered+13WIP), actual contract ACCEPTED with
notes for several families, CHANGES_REQUESTED for R2/PaperExit, and pending
NOT_REVIEWABLE. Those are Claude's recorded consumer dispositions, not a source
sample or test run by this task. Registration is ACCEPTED as contract but screen
NOT_REVIEWABLE without HiFi; do not retain a global missing-ACK claim. All actual
source samples remain NOT_DONE. Scope remains source-only; Main separately
owns new C1 terminal/commit status and any canonical/peer semantic merge.

The late peer row12 historical source-status text was: `WIP staged-uncommitted;
4 suite lỗi migration 144, sau sửa 357 pass / 1 fail (theo note Codex)`.
It is preserved here as a peer-reported earlier result, not erased or promoted
to this task's test receipt. The newer Main-reported PG34PASS/fullR3RUNNING and
eventual actual terminal must be attached to their distinct source/run pins.
