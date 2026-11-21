# ELP2-10 — current provider and approval continuation

## Entry / approved scope

Bobby assigned continuation of the remaining real source/current-human provider
and approved budget/calibration gates on 2026-10-16. Entry: clean
`12a6412b5312d6f2a593654c2b9c18f62fd6d4a8`,
`/home/bobby/portal-research`, `docs/research-loop-plan`.
Read Unified §14, campaign rules and the preceding [commissioning return](commissioning.md).
Retain that implementation and its terminal hook receipt; do not rerun unchanged
gates just to repeat the earlier result.

Local backend/source integration only within ELP2-10. HK source/manifest/journal
inspection is read-only. No remote build, DB/business query, credential/service
change, frontend edit, new phase, push, dev/main merge or release. No fabricated
human mapping, normalized source contract, budget approval or calibration.
Existing local test envelope is aggregate 4 CPU/4 GiB, one heavy lane and ≤8 GiB
transient storage; no source-connected load while an owner measurement is active.

## Task map

| Task / owner | Read / write ownership | Output / acceptance | Resource and exclusions |
| --- | --- | --- | --- |
|10P-SOURCE / source reviewer|Read current exact HK PM and Edge worktrees, source contracts, journals/locks; notes only|Repin HEAD plus WIP, identify actual mounted publication and current-human/field-policy authority; exact locator and any new usable port, not an invented route|Read-only SSH; no credentials, business calls, tests, build or remote writes|
|10P-POLICY / policy reviewer|Read local and exact HK approved manifests/config/journals; notes only|Identify actual independently approved budget/calibration artifacts and decision authority; separate proposal, synthetic constants and owner approval|Read-only files/metadata; no load, config changes, source data collection or approval inference|
|10P-TRUST / independent writer reviewer|Read local AccessService/trust, private runtime and existing session/current-authority contracts; notes only|Determine whether existing Portal authority can legitimately implement the current-human boundary; report concrete local bugs or exact missing mapping/receipt, without duplicate abstractions|No edits, tests or runtime/credential access; no authority inferred from ADMIN/name/workload identity|
|10P-PRIMARY / integration|Own local implementation if supported by current contracts; shared packet/Unified; impacted validation|Integrate usable qualified source without weakening authority, or record the exact minimal missing source/decision package; review both returns|No writes to other agents' files; normal hook once if implementation changes; no unrelated full tests|

Before implementation, bind the exact source/schema/profile to the existing
private installation. Review source and policy returns independently. If no
qualified provider or approved artifact exists, keep the dependent gate closed
and state precisely what is needed; absence of an artifact is not a new approval.

### Independent review finding and bounded implementation

10P-TRUST found a real local bootstrap dead end: reviewed business root grants
must install without TS receipts, while ordinary receipt intake requires a
delegation proposal that cannot be created for the protected owner. Existing
Manager tests insert accepted roots directly and do not cover this path.
Fix within the assigned commissioning scope, not by relaxing grant checks:

- 10P-ROOT / writer agent owns only new
  `apps/control-api/src/execution-v2/access-root-receipt.ts` and
  `apps/control-api/test/elp210-root-receipt.spec.ts`. Implement private exact-root
  acceptance with independently provider-verified context plus held current
  mapping/membership fence, reviewed policy/root digests, locks, immutable source
  dedup/audit and expiry. No HTTP route, TS wire declaration, default trust,
  migration, source activation, Git action or heavy tests.
- Primary owns the optional trust port, AccessService delegation, composition
  passthroughs and tests/integration. All provider I/O resolves before Core locks;
  the qualified lease must remain held through COMMIT and be released afterward.
- After source audit,10P-SOURCE independently reviews these local root-intake
  paths read-only for privilege/race/receipt/fence errors; no shared edits/tests.
- Existing policy installation still rejects copied receipts. Ordinary
  delegation, protected-owner/self-change guards, field policies and source
  acceptance remain unchanged. Missing optional provider fails closed.
- New proof types are **private normalized verifier output**, not a claim that
  TS already publishes a corresponding wire. Source-connected commissioning
  remains blocked until the real verified adapter exists.

Risk/rollback: false human authority, stale field grants, source-wide population
leaks and unapproved numeric scores. Keep installation absent/stop the worker on
failure; preserve immutable revisions, current grants, lease fences and audit.

## Actual return

Local implementation is complete; actual focused and terminal validation is
recorded below. No source/approval gate is declared PASS by implementation or
by receiving permission to continue.

### Fresh source and approval evidence

Read-only SSH at 14:41–14:50 UTC on 2026-10-16:

| Exact target | Observed state / useful new evidence | Boundary |
| --- | --- | --- |
|PM `/home/bobby/.worktrees/trading-system-pm-v1_1`, `feat/portfolio-account-v1_1-parallel@c401a02365bbe2ae341a7a135391ce3789aeb29d`|Owner publication/capture/source-input WIP preserved. New `contracts/baseline/portfolio-account-v1_1/pma11-13-publication-evidence.json` reports **286/286 PASS** (90 PG +196 unit), isolated SGP run finished14:42:46UTC|Not “never behavior tested” anymore. Explicit `TEST_ONLY`, `BOOTSTRAP_ONLY`, no full-state snapshot provider and `runtime_export_enabled:false`; no current-human runtime authority or connected acceptance|
|Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, `feat/execution-edge-upgrade-v1_2@4c6250ca0a5bce2e81811d07a12f271476b39429`|New09 correctness/recovery evidence; owner bootstrap SHADOW/ACTIVE/ROLLED_BACK WIP and migration0022 preserved|Same trusted manifest/binding/fence inputs; no current-human/field-policy provider or normalized population mount. `performance_acceptance:false`, not approved capacity|
|HK host measurement lease|`claude-g12-final`, P18.4 G12 v224 final faults,14:29:50–15:59:50UTC|No source-connected load. Lease expiry does not assign a Portal window|

Primary directly reread current source/evidence after the reviewers. Exact
hashes below bind those observations, not an indefinitely moving remote HEAD:

- PM publication evidence: `3efb8e2960f930c6ce9345dc1eb8ca6ff7b53c8a71082bd83d0852e30946c3b9`.
  Reviewer earlier saw `ca92a167…`; owner subsequently appended metadata pins.
  The primary hash is current at its read. The actual tested source hashes and
 286-test JUnit hash `24c480c0c37197b4500b4911e8fea5dbd5349c8f3a384bb8858b905220cf9a0d`
  are recorded inside that receipt; source-only tests are not Portal integration.
- PM current R2 guide: `4d12f4b583717c3f56f7f6f3c7689390f52502a528e25c558d255b5a508f12d6`.
  Its tested preparation metadata revision `6269f5d8…` is historical.
- PM16 current readiness: `255ed08d992c942a1813f9cd4c4bf8812e4c851c2376c33c0e7ac694aa536951`;
  earlier tested metadata `8090ca58…` remains historical. Execution campaign
  approval/SLO/restore fields are still pending; the approved PM15 fresh
  migration rehearsal is not a capacity/calibration approval.
- Edge01 measurement plan: `aaa1c7d023bd5a36f9a5a219b958c7ea88be67dea332b3a674ff6073ee9a17a1`.
  **All14** group approval references/baselines/bounds are still null. The phase
  assignment naming Bobby is not numeric operating-budget approval.
- Edge06 resource profile: `a148533861168c268c469321727c526b54ca219ea24773ab8e087ee6d2a9d7bd`;
  explicitly isolated test safety controls, not production acceptance.
- Edge09 qualification: `c40fba20c9fb1af96a1be1f2b065e2a5a5be54e84c4674cf54635e59e4804de2`;
  correctness/shared-host evidence, capacity/performance acceptance false.

### Actual authority boundaries — no duplicate identity service

Portal already owns stable issuer/subject→user bindings, session generation and
revocation, workspace membership, owner anchor, reviewed app policy and current
grants (`repos/bindings.ts`, `auth/auth.service.ts`, `repos/sessions.ts`,
`execution-v2/access.service.ts`). Reuse them. They do not attest TS user IDs,
portfolio membership, ownership, field policy or source population.

The exact remote seams are real but are **not installed providers**:

- PM `identity/human.py:69–175`: existing `pma.identity.v1` crypto verification
  and a current authority lease fenced through the owning outer COMMIT.
  A valid JWT or one-shot current lookup alone is explicitly insufficient.
- PM `operator_session.py:44–81`: distinct human and workload leases, audience
  `pma.management.v1`. Existing `execution:manager-v2:read` workload transport
  is not a substitute for this human/business boundary.
- PM `operator_reports_repository.py` / `report_delivery.py`: current-authorized
  report census and `pma.report-snapshot-delivery.v1`, bounded transport with
  storage ACK distinct from consumer-applied checkpoint. Candidate report GET
  exists; no qualified production export/current-provider mount exists.
- PM `report_source_inputs.py:90–166`: attributable report/cost/notional facts;
  `strategy_id` is **not** a Portal alpha/version association. Existing binding
  and account rows do not contain immutable `alpha_version_id`. No name/slug
  parsing can close that five-anchor population gap. Missing historical
  associations must remain typed absent.
- Edge `query-api/src/scoped/authority.rs`: real `CurrentReadGrantProvider`
  default remains unavailable; positive implementations are test providers.
  New bootstrap rollout metadata does not create source/current authority.

No approved horizon calibration artifact was found in the inspected local,
PM or Edge source/decision/receipt scope. This is not a new formula choice.
Numeric Score remains `policy_pending`; independent valid business reads do
not need to wait for Score/Regime.

## Minimal coordinated source package — requires exact remote approval

This is the concrete unblock proposal for canonical05-001/06-002/10-002,
not another generic request to “send an owner return.” Current PM next action
is its **round3 PMA11-03/04 current-read authority/privacy RG03/RG08**, awaiting
that source owner's exact approval; this Portal assignment does not overwrite
or authorize changes to its active WIP.

1. **Portal / existing identity boundary:** freeze the issuance/current-lease
   agreement with PM's actual `pma.identity.v1`. Reuse stable user/session/
   workspace and current revisions; no new identity database, ADMIN inference,
   workload-as-human shortcut or credential activation. The local private root
   receipt fix does not by itself implement this distributed lease.
2. **PM / isolated reviewed candidate integration:** implement current human/
   workload leases and `ReportAccess` over the canonical membership/binding/
   assignment chain; explicitly associate Portal alpha/version with TS strategy/
   deployment. Connect existing report source inputs, publication authority and
   delivery. Mount **GET-only private candidate reads**, not the full operator
   router, which also composes command adapters. Keep production/native capture
   promotion, financial mutations and commands off.
3. **Edge / source-bound candidate adapter:** implement the real current grant
   provider over the reviewed PM boundary and adapt the genuine report delivery
   into the existing scoped projection. Agree any missing source wire before
   implementation; do not invent an already-existing `/publication` endpoint.
   Reuse Portal12a6412b runtime/writer/calculator; do not build another scaffold.
4. **Qualification and rollback:** exact isolated DB/network/ports, pinned
   candidates, one source-owned measurement window and one heavy lane. Exercise
   valid current human, revoke before/during read, wrong workspace/tuple, field
   redaction, historical membership, changed population, expired lease, atomic
   commit, lost ACK/restart. Rollback removes only candidate mounts/provider
   installation; preserves mapping revisions, immutable facts, fences and audit.
   No production/dev/main/release/Live operations.

Before remote changes, record the exact selected source/profile, isolated target,
CPU/RAM/storage/time ceiling, test receipts and rollback with the source owners.
The already-approved **local**4CPU/4GiB/8GiB envelope is not authority to borrow
HK or another owner's database or measurement window.

### Budget and calibration acceptance, separate from implementation permission

| Required artifact | Concrete next action | What does not count |
| --- | --- | --- |
|Scope/host/profile/workload capacity envelope|After real source qualification, collect B0/B1/B2 baselines and propose per-group thresholds with units, replica/queue/pool/storage/lag/fanout bounds. Owner approves the exact manifest before acceptance load|Phase assignment, synthetic PostgreSQL timings, a null-valued14-group plan or expiry of a foreign lock|
|Horizon-specific Score runtime artifact|One verified economic domain/window/basis first; derive/document anchor calibration, stress delta, block/origin/grid, maturity/freshness, precision and validity from qualified source inputs; independent owner approval over exact bytes/hash|Production numbers copied from fixture, market-only returns replacing strategy economics, formula approval relabeled as calibration approval|

Do not block qualified snapshot reads on unrelated calibrated metrics. Conversely,
do not call the source/capacity/Score/browser gates complete after fixing only the
local bootstrap intake.

## Local implementation, independent review and compatibility

- `access-root-receipt.ts`: strict private `REVIEWED_POLICY_ROOT` normalized
  proof, independently qualified mapping/member lease before Core I/O; exact
  owner anchor, policy/install/root grant digests, action/selector/environment,
  active identities/membership, DB-clock validity and restricted field policy.
  Source revocation guards are synchronous; keep the source lease held through
  the outer COMMIT/ROLLBACK and Core connection release. ACCEPTED attaches the
  membership receipt atomically with immutable audit; REJECTED/UNKNOWN do not
  grant business authority. Exact source retry returns history only, never
  restores a revoked root. Changed source payload conflicts. Post-COMMIT fence
  or release failure returns uncertain acknowledgement503, not a fake rollback.
- `access.service.ts`: actual policy installation records canonical root-grant
  digests; new private `acceptRootTsReceipt` composes the independently injected
  verifier. Existing installation still forbids copied root business receipts;
  delegation/self-owner protections remain unchanged. Historical installations
  without original root digests fail closed and require a newly reviewed policy
  revision; do not rewrite immutable historical approval evidence.
- `access-trust.ts`, `publication-adapter.ts`, `manager-runtime.ts`: optional
  fail-closed verifier with preserved method binding. Missing provider cannot
  connect to Core through this intake, let alone create a grant.
- `elp210-root-receipt.spec.ts`, `elp210-commissioning.spec.ts`: regressions
  through the actual policy installer/service, not direct accepted-root seeds;
  owner/other positive, exact replay, policy/root/source binding negatives,
  revoke/archive/password/workspace negatives, final expiry/revocation rollback,
  sync guard, release order/failure, detached verifier references, historical
  missing digests and trust-composition forwarding.

Independent10P-SOURCE review: **ACCEPT**, no blocking privilege/race defect.
Preserve these qualification caveats:

1. Real verifier/release operations must have finite cancellation/cleanup and
   resource bounds; these are trusted-provider obligations, not an installed
   remote deadline mechanism in this private module. They remain qualification
   prerequisites of the actual source adapter.
2. Expiry during COMMIT cannot undo a durable commit. Stored expiry and current
   `grantCurrent` checks still refuse expired rights; historical receipt outcome
   is not a claim of current entitlement.
3. This is private normalized verifier output, **not a new TS wire**, a mounted
   human provider, owner recovery or new public mutation endpoint.

Public compatibility: no changed OpenAPI/schema/generated DTO, HTTP route,
source cursor, browser parameter, migration, package dependency or frontend
path. Existing optional6Manager contracts remain as12a6412b. No fixture identity
or numeric Score is promoted to product authority.

## Actual validation and landing receipt

Focused disposable PostgreSQL/Node runner **exit0**, buildPASS, **127/127PASS**
(70 existing access transaction +10 commissioning +47 root receipt), three
files,42.40s Vitest; PostgreSQL dump/restore including all four scoped-access
row digestsPASS. Ran in the approved single4CPU/4GiB lane. Snapshot contains
the original root tests; three additional historical/service-forwarding
regressions added after staging are deliberately reserved for the single
normal-hook landing validation, not claimed covered by that earlier snapshot.
No second focused rerun is required. Exact log:
`/home/bobby/.local/state/portal-execution-elp210/20261016/root-intake-focused.log`,
SHA256 `7a882a23d475673ec8da1ccdda96f3d5ecf798bcf3d0c8046b94913b5c6fbe0d`.

Terminal normal hook is required before commit. The actual exit, exact commit,
source/test hashes, counts, logs and owned-cell teardown are recorded at
`/home/bobby/.local/state/portal-execution-elp210/20261016/root-intake-terminal.json`.
No pending test or future hook is PASS in this packet. Prior12a6412b terminal
hook/restore remains reusable for unchanged source; not added again to new test
coverage. Local synthetic provider tests cannot close source/current-human,
capacity/calibration, paired coexistence/G2 or frontend/browser gates.

Observed focused cell14:58UTC: PG68.41MiB/1GiB, Node1020MiB/3GiB and about98%of
oneCPU at the sample. Enforced total cap remains4CPU/4GiB; this is not peak RSS
or a production workload baseline. Runner uses no published port or persistent
volume, internal temporary network, owned cleanup trap. No other images,
containers, volumes, PM WIP or source data may be cleaned by this slice.
Focused runner trap completed and exact two container/network names were
confirmed absent after exit0. No image or persistent volume was deleted.

## Exit, next backend, consumer handoff and rollback

Canonical new local finding **ELP2-REQ-10-003** is implemented; local validation
and landing must be read from the actual terminal receipt above. Whole10 stays
**NOT_MET_SOURCE_CURRENT_HUMAN_BUDGET_CALIBRATION_COEXISTENCE_BROWSER**.
Existing05-001/06-002/00-005/10-002 remain open with the exact source package
described above. This is not “wait for TS to upgrade everything”; the specific
remaining seam is current authority/publication association and its bounded
reviewed candidate integration. No independent valid read waits on Score.

Backend next: after Bobby approves the exact remote change package, coordinate
PM round3 current-read authority/privacy and Edge candidate adapters in isolated
owner-approved cells; qualify actual source/human/revoke/population, then obtain
measured budget and approved calibration artifact. Until that approval, safe
work is read-only source alignment and local implementation/receipt completion,
not unauthorized remote security configuration or another scaffold.

Claude next, **when assigned**: read06/08/09/10 handoffs and12a6412b generated
`ManagerDataset.score_details?` / `ManagerScorePublication`; implement the six
named Manager/360 consumers and honest independent absence states. This private
root intake introduces no new UI binding. Record exact producer/build/profile,
1280/660/a11y/context/revocation/idle receipt; fixture proof is not real API
acceptance.10-001 remains **AWAITING_CONSUMER_REVIEW**; no new consumer request
was received in this slice and writing this handoff is not acknowledgement.

Rollback: keep the optional provider uninstalled; pending roots remain pending.
If later installed, stop only that candidate worker/provider, preserving grants,
original policy/audit, receipt history, mapping revisions and lease fences. Do
not rewrite historical policy events or install a copied acceptance. No goal,
push, dev/main merge, ELP2-11, frontend build, runtime/credential/financial change
or release occurred in this continuation.
