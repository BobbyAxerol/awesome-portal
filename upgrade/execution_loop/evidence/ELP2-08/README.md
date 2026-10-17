# ELP2-08 — Workflows và HiFi states

**2026-10-17 continuation:** [capital workflow read](capital-workflow-read.md)
adds the missing current-authorized local GET, preserving the schema-only
workflow OpenAPI and original command semantics. Applied/uncommitted, tests
NOT_RUN at entry. Source/consumer/full08 gates remain separate; Claude held.

## Entry / approved scope

Bobby assigned ELP2-08 on 2026-10-16. Entry:
`/home/bobby/portal-research`, `docs/research-loop-plan`,
`3d537127313fb3c282eda054fd180499fe4732ca`; working tree clean.
Follow Unified §14, Portal guide §10–12/15 ELP2-08, UX guide §5–18,
campaign rules §§7–8 and dependency packets01/03/04/05/06/07.

Goal: additive, generated workflow state/fixture contracts and pure backend
projections for capital, create, lifecycle/obligations, navigation/context and
score explanations. Reuse existing command/status, scoped readers, score and
Governance authorities. No new business executor or second ledger.

Owned: new `execution-v2/workflow*`, dedicated tests, contracts tooling/schema/
fixtures/generated outputs, this packet and Unified index. Forbidden: frontend,
legacy accepted UI/tokens, source TS/PM/Edge changes, identity/grant mutation,
runtime config/deploy/activation, new command families, dev/main and pushes.
No migration, database or public route is planned: state projection is not a
browser endpoint accepting trusted facts. Source-dark boundaries remain closed.

Budget: one isolated heavy lane, aggregate4CPU/4GiB/8GiB transient, workers≤2.
Focused changed tests first; one normal-hook coherent commit, no bypass.
Read-only HK pin/journal audit only; no source tests or runtime/business queries.
Rollback: remove additive unused workflow projection/contract; preserve source,
accepted receipts, grants, ledgers and original ELP2-07 recovery path.

## Task map (recorded before delegation)

| Task | Owner / allowlist | Output / acceptance | Budget / exclusions |
| --- | --- | --- | --- |
| W08-CORE | Primary: workflow schema/projection, generator, fixtures, tests, shared docs | T08-01…17 technical traceability and typed Claude handoff; normal-hook landing | Single heavy lane; no frontend/source/runtime changes |
| W08-SOURCE | Read-only agent; may write only `ELP2-08/source-alignment.md` | Re-pin exact HK PM/Edge worktrees, current R2 workflow/obligation semantics; classify source vs runtime | SSH metadata/source only; no Git mutation/credential output/remote tests |
| W08-REUSE | Read-only agent; may write only `ELP2-08/reuse-review.md` | Existing contracts/fixtures/Governance/score reuse and missing T08 mapping; identify security contradictions | No code/shared docs/generation/build/test/commit |
| W08-TEST | Independent test writer: only `apps/control-api/test/elp208-workflow.spec.ts` after initial schema freeze | Pure projection T08 negatives, exact decimals, missing obligations/receipts and source-dark invariants | No application/shared schema/docs/Git changes or heavy tests; primary runs integration |

Primary reviews findings and owns all integration/shared files. Fixture design
readiness, real-source reads, command runtime, browser/design acceptance and
owner acceptance are separate. Claude remains NOT_STARTED_BY_OWNER_DIRECTION;
handoff AWAITING_CONSUMER_REVIEW. No full phase PASS is claimed at entry.

## Validation / exit

The following current return supersedes this entry-only status; source/runtime
and actual browser acceptance are still separate.

## Current technical return — 2026-10-16

Producer is the coherent normal-hook commit containing this packet, parent
`3d537127313fb3c282eda054fd180499fe4732ca`. Terminal hook exit0 is mandatory
before landing. [Contract pins, HIFI text/state specification, action inventory,
walkthrough and Claude request](coverage-and-handoff.md) are part of this return.
[Source audit](source-alignment.md) and [independent reuse review](reuse-review.md)
pin source vs runtime and prevent duplicate authorities/calculators.

### Delivered / exact scope

- Generated strict WorkflowCreate/Capital/Confirmation/Lifecycle/ReadState/
  Navigation/Action/Screen and canonical-score presentation types, JSON Schema,
  schema-only OpenAPI and shared synthetic stories. Existing aggregate generate,
  deterministic comparison, snapshot and isolated contracts test harness include
  these files. No public workflow route or trusted-fact intake was mounted.
- Pure projections preserve separate create/FUND/grant receipts, explicit zero,
  exact five-way amount partition, economic vs budget effects, four independent
  command dimensions, draft cancel vs cancel-remaining and lookup-only refresh.
- Lifecycle readiness requires current scoped inputs/exact instance, fresh
  complete obligation census and, for move, three separate applied receipts.
  Null/stale/unknown isn't drained; archive/rebind/resume do not bypass terminal
  lifecycle, ancestor/local restrictions or source qualification. Paper monitor
  lineage is a separate deployment, not an automatic live/promotion operation.
- Navigation keeps workspace/stage/lifecycle/view/currency/window/IDs and
  Research RC→correct Governance gate origin. Same-origin gate links do not
  install decision evidence or grants.10 screen mappings distinguish current
  routes, proposed M01/M08 and M02 directory refinement;24 advertised action
  descriptors disclose exact supported capital API vs pending other adapters.
- Canonical ScoreCapsule and command definitions are reused exactly, not
  reimplemented. q73.3/fair/provisional, contribution/no-band, composition/direct,
  Early5d/request30d and mixed70d/actual10d remain distinct synthetic stories.
  No numeric production defaults/calibration or analytics-dependent safety gate.

### Tests / failures / impact limits

| Validation | Actual result |
| --- | --- |
| First local generation | FAIL on nested ZodUnknown transform; fixed converter and replaced that nested field with strict canonical CommandIntent reference; no broad JSON proxy published |
| Initial focused API |74PASS/1FAIL: old test expected already-ARCHIVED to be ready for archive. PM R2 terminal-state predicate retained; test now checks BLOCKED plus preserved PAPER stage, not reopened state |
| Final focused API `vitest run test/elp208-workflow.spec.ts --maxWorkers=1` | **76/76 PASS**,1 file,528ms,09:56:42 UTC; includes missing move receipts, local lock after ancestor unlock, exact decimals and forged funded headline |
| Final focused contracts `vitest run test/execution-workflows.spec.ts --maxWorkers=1` | **56/56 PASS**,1 file,1.00s,09:56:43 UTC; valid fixture/runtime parity, strict negative JSON, canonical references, capability vocabulary and action/screen coverage |
| Generate `npm run generate:execution-workflows` | PASS after final source/fixture freeze; generated types from OpenAPI, not hand-authored |
| Source typecheck earlier in implementation | PASS before final monitor/state refinements; final source build belongs to normal-hook terminal result, not this earlier measurement |
| Snapshot / drift / normal-hook | Required landing checks; terminal results/log are recorded in `/tmp/elp208-normal-hook-20261016.log` and `/home/bobby/.local/state/portal-execution-elp208/20261016/landing-receipt.json`. No prewritten full-suite PASS |
| Source / browser / runtime | Read-only HK code/pins/journal audit only. No qualified TS/Edge workflow call, real command, UI/a11y/browser, migration, deployment or frontend build |

Focused counts are not added to the full hook as extra unique coverage. Existing
06 score and07 idempotency/source-dark receipts are reused only for unchanged
dependencies; not new08 UI/source evidence. No existing accepted schema, route,
runtime flag, financial posting, user/grant or frontend source changed.

### Requirement → proof → disposition

| T08 | Technical proof / fixture | What remains outside this slice |
| --- | --- | --- |
|01|Three presets, same manager visibility ≠ equal mutation/delegation; own-slice strict metadata|Actual personas/approved policy/UI receipt|
|02|Zero/unfunded/funded separate steps,9 states, forged success refused|Owning create/FUND/grant and reload UI|
|03|FUND vs management budget vs nominal root; confirmation separate capacities; unsupported RETURN explicit|Real before/after/RETURN adapter|
|04|Immediate decrease rejection distinct from recall WAITING/partial|Source pending/drain receipt|
|05|Exact partition incl18-decimal tail; applied amount kept after remainder cancel|Commissioned cancel action/UI|
|06|Ancestor/local lock/unknown restrictions not bypassed by Resume|Owning unlock/risk/activation proof|
|07|Current source/destination access checked before parse/disclosure; exact instance required|Actual picker/current source ACL|
|08|Incomplete/stale/null census blocked; open obligations pending;3 receipts required; original attribution retained|Source move/late causal event trace|
|09|Rebind distinct, no borrowed bridge, working-order/unknown blocks|Qualified binding-change operation|
|10|12 read states, protected discard, ACK≠applied, stale projection, no resend, draft cancel semantics|Browser back/refresh/reload/double-click/focus|
|11|10 screen map, Manager/own-slice, exact route vs proposal|Approved directory/Overview/HiFi composition|
|12|ALL navigation +4 stages, archive lifecycle separately; financial stage survives terminal archive|Browser filter/saved view behavior|
|13|Residual archive blocked, monitor absent or separate immutable lineage, no auto-live/reactivation|Commissioned archive/clone/monitor source lane|
|14|Canonical score binding/pending state; Regime never changes formula|Qualified source/config and UI explanations|
|15|73.3/fair/Sơ bộ,74.999 fair; contribution no band, four distinct kinds|Actual display/rounding/a11y|
|16|Early5d/request30d diagnostic, mixed70d/actual10d and stage durations|Actual source continuity and UI facet|
|17|No analytics safety gate, no own-slice manager denominators|Source-authorized safety and browser privacy|

These are **component/contract PASS**, not original mandatory full gate PASS.
`FULL_ELP2_08_EXIT=NOT_MET_SOURCE_DESIGN_BROWSER`. Applicable UX-F fixture map,
operator steps and advertised action dataset/API/right/status/error/test map
are in the handoff; all new browser verdicts remain NOT_RUN.

### Resources / cleanup / rollback

No new service, database, volume, port, migration, business data or source API
workload. Focused Node tests each one worker,≤1.1seconds suite duration; this is
not a performance/SLO proof. Around09:43 UTC: root621GiB/464GiB used/157GiB
free(75%); RAM32,092MiB, available12,877MiB, no swap. One mandatory isolated
hook lane uses existing bounded scripts, aggregate4CPU/4GiB; disposable cells
are removed only by their owned EXIT traps. Final read-only capacity/owned-cell
census belongs to landing receipt. No shared image/cache/volume prune, no runner
changes. Existing C4-GOV-CAPACITY-01 remains canonical capacity follow-up.

Rollback additive unused state projection/consumer only; retain current rights,
receipts, committed obligations and07 original-intent reconciliation. No shared
runtime changed; no financial reversal, schema downgrade or source rollback.

### Exit / next / two-way requests

- **Backend technical slice:** delivered through successful normal-hook landing;
  original08 exit remains NOT_MET_SOURCE_DESIGN_BROWSER, not product-active.
- **Backend next:**09 scoped realtime/revocation/replay is next-ready after
  separate Bobby assignment; independent10 acceptance planning can be scoped.
  No next phase or goal was started by this08 assignment.
- **Debt:** inherit07-001/002 source and exact operation adapters,06-002 selected
  materialization/config/ALL tie-out. Do not duplicate them as invented08 debt.
- **Claude next:** UXM-03…09 design/fixture consumer when Bobby assigns it;
  `ELP2-REQ-08-001` has pins/types/stories/walkthrough/exit above. Frontend remains
  NOT_STARTED_BY_OWNER_DIRECTION; AWAITING_CONSUMER_REVIEW, no acknowledgement
  or reverse request received. No assumption that handoff means user approved UI.
- **Bobby:** no extra formula/fixture decision required for this technical
  delivery; source activation, accepted HiFi and next phase remain separate.

## Approved follow-through — 2026-10-17

The[non-amount target-setting correction](nonamount-capital.md) fixes a real
workflow mismatch with strict PM target wires. Applied UNCOMMITTED/PENDING_GATE;
only SET_ROOT_LIMIT/ADJUST_TARGET_BUDGET may retain null amounts on a genuine
known receipt. Canonical schema/fixtures regenerate together; source runtime
and Claude consumer remain unqualified/owner-held. Full08exit is unchanged.

**Terminal focused addendum,09:04UTC:** [non-amount workflow regressions](nonamount-capital.md#terminal-focused-correctness--2026-10-17t090412z)
PASS within247/247API and84/84contract tests, APIbuild/scopedPGrestore PASS.
Exact source/foreign index/protected runtimes unchanged; own resources removed.
Only coherent normal-hook landing and actual source/consumer gates remain;
do not treat this local correction as a commissioned executor.
