# ELP2-07 — coverage, command recovery và Claude handoff

## 1. Authority / exact delivered scope

Baseline `42c390796f4bd2a7de151313944b41f1245bdbc2`, same integration branch.
Source pins and direct excerpts: [source alignment](source-alignment.md).
TS/PM remain financial/business authority; Portal keeps identity, current app
policy, scoped intent and transport/status correlation. No economic postings,
native order, broker, generic CLI/URL, TS DB fallback or autonomous human
impersonation. Source-dark is enforced server-side, not a hidden button.

The eight existing source-pinned capital candidate bodies are supported by
the technical bridge: FUND, INITIAL_GRANT, TOP_UP, IMMEDIATE_DECREASE,
RECALL_PARTIAL, RECALL_FULL, ADJUST_TARGET_BUDGET, SET_ROOT_LIMIT. Their exact
`pma.capital-command.v1.1` body/counter strings are preserved; source still
owns recipient resolution, Decimal normalization and canonical digest.

No operation/environment is runtime qualified by this delivery. In particular:

| Operation family | Disposition / locator |
| --- | --- |
| Eight capital candidates above | Component implementation; injected TEST_ONLY proof only; deployed trust/relay unavailable |
| RETURN_CAPITAL | PM parser/status knows it, operator dispatch excludes it (`PM-G07-SEED-RETURN`); no synthetic economic adjustment |
| ADMIN_LOCK/UNLOCK, REALLOCATE_BUDGET, APPLY_PENDING/CANCEL_REMAINING | Source candidate control schema exists; not the frozen capital body or current exact Portal action catalogue. Direct new capital route rejects them; no mapping to a weaker existing action |
| Profile SET_LEVERAGE/MARGIN_MODE/POSITION_MODE/ACCOUNT_MODE | Separate PM profile PREPARE/RECONCILE semantics; not capital APPLIED or native execution. Existing readers/guarded operations unchanged |
| Entity create/register/assignment/archive, HALT/REDUCING/RESUME | Existing gate-specific Governance/protective paths preserved; not silently routed through the capital bridge or R1 executor |
| Autonomous new intents | No commissioned workload catalogue/provider supplied; denied. Internal recovery of accepted intent is lookup-only using explicit service authority, not renewed human intent |

## 2. Public contract freeze

Generator: `packages/contracts/tooling/generate-execution-trusted-commands.mjs`.
OpenAPI: `packages/contracts/openapi/execution-trusted-commands.openapi.json`.
Generated client: `packages/contracts/generated/execution-trusted-commands.d.ts`.
Canonical consumer fixture:
`packages/contracts/fixtures/execution-trusted-commands.synthetic.valid.json`.
Generate with `npm run generate:execution-trusted-commands` in contracts;
normal aggregate generation/check and snapshot include this additive API.

| Operation / generated path | Input → output | Rules |
| --- | --- | --- |
| `executionCapitalCommandPreviewV1` POST `/api/v1/execution/capital-commands/preview` | CommandIntent → CommandPreview | Current exact capital action; CSRF/Origin and header = PM key. No reservation/effect. Source-dark preview has allowed=false + typed reason, not fake profile/default |
| `executionCapitalCommandSubmitV1` POST `/api/v1/execution/capital-commands` | CommandSubmit → CommandStatus | Fresh step-up, current policy/grants + source mapping/membership/expiry/CAS/approval/qualified operation. Confirm is not approval. Reissued TTL alone does not change preview; authority/profile/payload/approval/CAS changes do |
| `executionCapitalCommandStatusV1` GET `/api/v1/execution/capital-commands/{id}` | workspace query → CommandStatus | Local-only; no send or source I/O. Current exact audit/report grant with accepted TS membership; hidden/missing/wrong workspace normalized404 |
| `executionCapitalCommandReconcileV1` POST `.../{id}/reconcile` | workspace body → CommandStatus | CSRF/Origin/key; current report authorization before/after; original authority/profile/key only. Never send or create a new intent |

Public types are `operations[...]` / `components.schemas.CommandIntent`,
`CommandSubmit`, `CommandPreview`, `CommandStatus`, `CommandProblem`.
All API values are exact decimal/counter strings and UTC milliseconds. No
human/workload IDs, JWT, mTLS, internal authorization references or PM reason
in the public status. Request inputs have no actor/workload/source URL/profile
authority installation. Outer recipient kind/deployment binding is structural;
the source resolves canonical complete recipient/account scope independently.

Public errors use fixed dictionary code/copy and safe next action, never source
exception text. Existing guard/auth errors retain the shared envelope.400 input,
401 session,403 current action/CSRF/step-up/context,404 unknown or hidden,
409 policy/preview/key change,502 unverified receipt,503 source/capacity.
All are private/no-store. Retained preview still blocks every mutation; this
phase does NOT enable commands on research-portal.

## 3. Four independent status dimensions

Delivery PREPARED → SENDING is committed with attempt fencing and audit before
network I/O. ACKNOWLEDGED only means transport acceptance, not APPLIED.
Business UNKNOWN has no receipt/revision/amounts; known result requires an
owning source receipt/event/revision. Exact fixed amounts bind source partition
to original intent and preserve applied/cancelled/rejected monotonicity.
APPLIED can coexist with CATCHING_UP projection and NOT_APPLICABLE venue;
never resubmit because a view is stale. No APPLIED → flat/filled inference.

Projection CURRENT/CATCHING_UP/STALE/UNAVAILABLE/UNKNOWN and venue remain source
facts. Missing lookup after timeout, expired idempotency coverage, unverified
receipt and SENDING after crash are not proof of no effect.

Portal intent fingerprint includes actor/workspace/environment/target/body;
keys are unique per workspace and conflicting intent is409. PM source digest
is the exact **bare64 hex** authoritative resolved-recipient/authority digest,
not Portal's prefixed hash or JSON.stringify digest. Source's own idempotency
scope remains authority + operation + key + requester/target binding.

## 4. Recovery / rollback runbook

1. Disable **new sends** by withdrawing qualified prepare/operation activation.
   Keep verified lookup/service-recovery available for already accepted intents.
2. Record original command ID, immutable PM key/body/scope and last status.
   Do not create a new key or assume timeout rolled back the source transaction.
3. GET reads local status only. Authorized reconcile, or internal recovery,
   calls verified source lookup of the original intent. Source report/recovery
   credentials are renewed by the qualified adapter, NEVER by replaying the
   expired human context as a new send.
4. Matching late receipt updates state + immutable event + existing product
   audit atomically. Missing/expired/unverified results remain unknown. A late
   sender cannot overwrite a reconciled receipt. Same-revision conflicting
   business facts and regression are refused; no financial compensation.
5. Browser requester loses current rights → no disclosure; accepted-obligation
   recovery may still ingest facts using explicit service authority. No
   recovery path restores revoked grants/session or places a new trade.
6. Migration136 is forward/additive Core metadata only. Down is intentionally
   non-destructive. Keep rows/events on application rollback; no TTL/cascade
   delete of unknown/accepted intent, no resetting keys or source history.

Bounds: intent/authorization/status each≤32KiB,≤100 unresolved and≤1024 total
intents per workspace stop **new** intake,≤4 underlying adapter calls per
service instance,10s request deadline + AbortSignal. A provider ignoring abort
keeps its slot until settle; timeout does not create unlimited background I/O.
New-send authorization lifetime is at most60seconds. Immutable state events are
not a TTL cache; their production retention/storage capacity and multi-instance
request pacing still need the source-connected activation qualification. No
claim of a fixed lifetime disk ceiling is made for accepted event history.
Existing same-key reads/recovery are not evicted at capacity. No source transport
is commissioned here; aggregate multi-instance/source rate qualification remains
an activation requirement, not a measured SLO claim. Private Core payload retains
the bounded original PM business reason, no credential/token; public audit is
hash/state-only. Accepted history retention is explicit, not a cache sweeper.

## 5. Handoff to Claude — NOT yet an assignment

Read the API above, canonical fixture, source limitations and UX guide UXM-09.
Reuse current approved components/layout; do not build a second command plane.

- Preview/confirmation: show exact action, target, amount/currency, versions,
  policy and required gate. Separate confirm from signed approval evidence.
- Receipt: present delivery, business, projection and venue independently.
  ACK+UNKNOWN and APPLIED+CATCHING_UP are expected, not contradictory.
- Timeout/restart: show original command ID and “Query same intent”; no blind
  retry/new-key button. Failed-before-send is not an invitation to replace key
  unless a separately approved source policy certifies no previous effect.
- Deny/revoke: current403/404 stops controls and cached receipt disclosure;
  fixed public error dictionary, never raw server/source strings.
- Keep uncommissioned operation/profile/environment controls visibly disabled
  with exact reason. Never infer read-all/ADMIN as capital write permission.
- Fixtures prove composition only. Real API/browser positive commands require
  a separately assigned non-retained isolated cell and qualified source path;
  no inserting grants/candidate rows or enabling shared preview writes.

Consumer status `NOT_STARTED_BY_OWNER_DIRECTION` /
`AWAITING_CONSUMER_REVIEW`. This file is ready for Bobby to forward; no claim
that Claude has received/implemented/accepted it.

## 6. Request / debt ledger

| ID / owner | Observed / expected / impact | Done-when / destination | Status |
| --- | --- | --- | --- |
| ELP2-07-001 TS/PM + Edge/ops | Historical entry said EPG10-07 not started; later source implementations/test slices now exist, while genuine selected provider/trust/router installation and connected authority remain unqualified. See latest source return below. Technical fixture proof is not installed authority | Exact source command/trust/status wire + authenticated human/workload commit checks, durable source/Edge correlation, retention proof and separately approved operation×environment activation; repin before connected acceptance | OPEN_SOURCE_RUNTIME; blocks real commands and full T07 source exit |
| ELP2-07-002 Portal + source owners | Eight capital bodies wired technically; control/profile/management/autonomous families have distinct policy/schema/side effects and no commissioned end-to-end matrix | Freeze named per-operation action/target/gate adapters against current source contracts; test each selected family before admitting; no weaker-capability alias. Keep unselected actions denied | OPEN_EXACT_OPERATION_COVERAGE, not hidden as delivered |
| ELP2-07-003 Claude/Bobby | No new UI assignment, browser proof or qualified non-retained consumer | UXM-09 explicit assignment; fixture story first, actual source/API/browser receipt only after001; exact delivery dimensions and negatives above | AWAITING_CONSUMER_REVIEW |

No formula/weight/band decision reopened. No new Bobby choice required for the
approved source-dark technical work. Activation/other operations require their
actual source qualification, not another generic permission question.

### Current source/Portal follow-through — 2026-10-17

Read-only PM source at e14f0b4c8a6bc5d4f3e07496753ff5fd60ebee01 now contains
original lifecycle/binding/capital-control history implementations. The capital
history manifest still explicitly disables runtime/route/environments and
certifies neither installed provider, native fence nor delivery apply. Native
current-relations proposal a4b9a570… is not jointly accepted or installed.
[Exact source observation and remaining ordered work](../ELP2-10/commissioning-followthrough.md#current-backend-return--2026-10-17t0904utc)
refines the stale original "source not started" row, not the connected gate.

Portal's per-grant command draft and final ordinary-intake expiry regression
are not applied/tested yet: they share the other owner's 12 staged access
paths. Integrate after write coordination, preserving original accepted fact,
full DENY/ancestor graph and real final transaction time; require real PG
rollback/zero-send evidence before delivery. Broader RETURN/control/profile/
assignment/archive/monitoring operation adapters remain 07-002, not covered
by the eight-operation capital body union. The locally corrected target-setting
workflow is [08's focused delivery](../ELP2-08/nonamount-capital.md#terminal-focused-correctness--2026-10-17t090412z),
not a new executor or actual source command. No new action/credential/runtime
is enabled; Claude stays owner-held with published handoffs awaiting review.

**Superseding implementation entry,2026-10-17T09:47UTC:** the peer index/source
pin is released. [Exact per-grant command and ordinary final-clock correction](current-grant-command.md)
are now APPLIED/UNCOMMITTED, with15 new actual-PG command cases, component
regressions and6 ordinary-intake cases. All new cases await the coherent normal
hook; private drafts are no longer the implementation state. Full07 source/
held-COMMIT/installation and broader-family gaps remain OPEN. No wire/DTO/FE
field or runtime enabled; consumer still AWAITING_CONSUMER_REVIEW.

**2026-10-17 finite reader subset:** see [04's exact producer packet](../ELP2-04/finite-account-command-readers.md).
New `executionCapitalCommandCollectionV1` is a local exact-resource/environment
CommandStatus collection, not the mixed operation queue or a command executor.
Shared report evaluation now retains delegation ancestors/DENYs while refusing
app-only audit ALLOW leaves. Proposed mounted HTTP/PG regression is NOT_RUN at
entry. Existing schemas/financial semantics/command flags unchanged; generated
query/result and synthetic example are for owner-assigned future consumers.

**Finite producer terminal,2026-10-17T20:07Z:** landed
`5cac1151e27a3276ed9c32f56fe485197c2cdcaa`; the proposed regression above
is no longer NOT_RUN. [Actual normal-hook/restore receipt](../ELP2-04/finite-account-command-readers.md#finite-reader-terminal-20261017-2007)
records6011 API/791 contract PASS with3 existing skips and unchanged runtimes.
This delivers only the finite exact-resource collection/alias subset, not an
additional executor, actual source authority or acknowledged frontend consumer.

## 2026-10-18 — exact report fences and refreshed PM source

Main accepted the [original07/08 repair matrix and typed consumer handoff](../ELP2-08/workflow-parity-and-read-fences.md)
at entry49bdc6e1. Actual operation IDs remain
`executionCapitalCommandStatusV1`, `executionCapitalCommandCollectionV1`,
`executionCapitalCommandWorkflowGetV1`. No route/public-field/action added.
Collection remains narrow status-only; full detail/workflow validate original
actor/hash/profile/CAS/amount separately from current read rights. Current
authority is checked after body/safe-error composition; GET never dispatches.
Code/derived contracts APPLIED_UNCOMMITTED, focused proof pending. No new
Claude receipt or ACK found on intake; consumer remains owner-held/awaited.

Read-only PM repin06:06–06:07UTC: exact approved PM worktree HEAD
`b9fae791824435f21d773705f21023cd38d1416d`, tracked diff and untracked-name
inventory empty at observation. `operator_adapters.py` SHA256
`8ca39c1b9e0e5d21f3d3d22b444270e69a840832a7b66c173b3ff6419bfc2ab9`;
`binding_contract.py` SHA256
`1bf9848a8e37ad9324cce0959b9b8df970df6efba36f6a413c5abc57b00814a5`.
Main read complete relevant diff from49a6acc3 plus current binding125–195.
Optional existing history exporter is not another command sender. Move census
requires exactly positions/orders/reservations/unknown/locks/pending_recall/
fees; no proof that local settlements covers fees. Zero census without three
capital receipts remains BLOCKED_RECEIPTS, readiness is not APPLIED.
Private exact source note SHA256
`0b5e400e9b8829ca98877cc1967a7f3d90350267bd2382e4b2a7ce99b478df40`.
Journal tail output was truncated; no new full journal/runtime acceptance
claimed. Original source family/action/COMMIT/installation gates stay OPEN.
