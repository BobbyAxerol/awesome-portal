# Claude review intake — 2026-10-18

SOURCE_REVIEWED / ACCEPTED_FOR_PHASE_PLANNING. This is an intake and impact
review, not a second request ledger, consumer acknowledgement or runtime receipt.
Registration normal-hook30009 is terminal PASS at ff83f176; this intake follows it.

## Inputs and actual consumer state

Canonical producer `docs/research-loop-plan` at
`25218372a10147b9910458f08a85c93479169d3f` plus the frozen registration batch.
Peer `/home/bobby/portal-research-fe`, branch `claude/fe-parity`, inspected clean
at `3b6dad1671e0a8ef2e479b3110dea9fddc2d0689`; no peer merge, edits or tests.

The original FE request authority remains that revision's
`upgrade/execution_loop/FRONTEND_BACKEND_SYNC.md` (FE-001…043 / RV-1…10).
Read alongside design/sync digest/prompt, review2/04 feasibility and current
decisions, UXM-07 frontend receipt/backend requests/debt, and campaign rules.
Those reported FE browser/test results were read, not rerun or independently
certified by this backend intake.

Claude has UXM-00 audit/IA/design material and UXM-07 S0/S1 fixture/BFF-double
implementation. S1 is R1-only, R2 pending; Access S1e awaits FE-037/038. This
supersedes current blanket claims that frontend is unassigned/not started, not
the historical truth of those older entries. It does not imply integration,
real-source qualification, current browser acceptance or blanket consumer ACK.
The pending-recall family specifically remains AWAITING_CONSUMER_REVIEW.

## Triage and owning phase plan

Triage is ACCEPTED_FOR_IMPLEMENTATION unless explicitly stated otherwise.
An accepted request is not DELIVERED. Preserve the original IDs, requirements,
owner decisions, history and consumer receipt in the original FE ledger; place
the following to-do/exit requirements in the existing owning phase packet.

| Owning phase | Original request IDs / requirement | To-do and exit, not yet a passing gate |
|---|---|---|
|02|FE-038; 03/08 consumers|Reuse guarded self-profile/effective self-access, add an explicit self-entry while keeping privileged users/grants management guarded. Non-admin own-positive/other-user-negative, URL/reload and no administration exposure.|
|03|FE-015/026/037|Publish exact current action/target/environment eligibility and navigation projection. Do not append provisional menu names to the legacy owner-all capability catalogue. Current native correspondence, DENY, delegation/expiry, independent account/operational-audit grants and wrong-workspace tests; APIs still recheck. FE-026 NEEDS_OWNER_DECISION on the finite own-researcher field matrix, never grant all.|
|04|FE-001/009/014/016/021/023/042/043; DEBT-UXM07-002|Canonical contract/invariant/fixture manifest; scoped directory/search/export/audit purposes as actually assigned. Reuse many-to-many incident links with both ends authorized, bounded results and typed unattested-history absence. Status counts use the SAME authorized filtered query snapshot, not page rows or N status calls. Register queue_v2 as VIEW_DERIVED over the existing backing table, no new writer/retention claim.|
|05|FE-002/003/004/017/018/019/022|Publish source-specific stage/environment/freshness mapping, immutable historical alpha-version binding and distinct economic/budget statement lineage. Current PM source pin39aaa9 is source-only, not deployed authority. FE-018 CHANGES_REQUESTED: versioned compatibility/pins, not vendoring the whole Edge repository. Missing source mappings remain open with exact producer locators.|
|06|FE-005/006/007/008/009/010/011/012/013/014/017/022/025/029/032/033/035/036/041|Guarantee actual metric keys; bounded text query/window semantics, financial series, compatible compare, basis-qualified flow graph and slim measured map. Bind scope/window/source generation to cursor/cache. FE-025 and041 share ONE backend implementation. FE-036 NEEDS_OWNER_DECISION: explicitly current-only, or separately authorized bounded as-of contract; never silently ignore as_of_ms.|
|07|FE-015/020/021; 08 command consumers|Exact trusted-family eligibility, safe closed copy and separate local/source audit purposes. Rollback capital/registration/pending previews are non-durable and non-reserving; submit alone persists custody. No preview-only receipt or permanent row invented. Pending operations use separate exact accepted actions, not a weaker capital grant.|
|08|FE-015/020/027/028/030/031/034/039; 02/03 self-nav consumers|Source-backed ordered lifecycle, lossless gate criteria, revised cockpit orchestration, subject events and archive/disposition/monitor semantics. FE-030 CHANGES_REQUESTED: reuse existing plan/apply/current gate fences, not a new generic executor. Registry V2 duplicate-nav cutover must preserve V1 flag-off/deep links. Missing source executor stays locked; archive never liquidates/returns capital or starts Live.|
|09|FE-004/024/031|Preserve source status/coverage axes. A revalidate notification is not a business event. Per-user cross-device marker/change feed needs actual event identities, monotonic marker, gap/unavailable state and current-scope/revoke negatives.|
|10|FE-019/035/040 and impacted performance/browser gates|Default-empty explicit build screen manifest only after corresponding FE code lands; no new runtime activation. Measure affected rows/bytes/latency rather than raising rich caps. Actual providers, approved config/budget, paired coexistence/P184 G2 and selected real-browser gates remain distinct from these fixture/source-only reviews.|

## Existing behavior to reuse or correct, with source locators

- FE-005 conservative totals are already delivered in `manager-model.ts`
  fact census/sumMetric: missing required source facts returns null plus typed
  reason. FE-009 already rejects serialized output above1MiB or groups above200;
  never silently drop children. Add representative fixtures/docs, not a second
  implementation or a partial sum labelled total.
- FE-010 current statement scope is authorized selected-resource/stages BEFORE
  table filters; group totals cover the whole authorized FILTERED query.
  Label this distinction. A new filtered statement is a separately named field,
  not an incompatible change to the current amount.
- FE-006 CHANGES_REQUESTED: methodology_ref is source-specific, not universally
  Modified Dietz/TWR. FE-011 CHANGES_REQUESTED: retain the qualified precomputed
  numeric Score sort/scalar; source-dark today does not make its schema invalid.
- `OwnerAccessService.effectiveAccess` grants the legacy owner every configured
  PORTAL_CAPABILITIES entry. FE-037 cannot be implemented by simply appending
  four Execution names: that would bypass distinct current TS/native scope.
- FE-042 `execution_incident_operation_links` (migration0009) is many-to-many;
  do not select the first incident or infer its permission from operation access.
  FE-043 query/postgres already has a repeatable-read aggregate boundary; reuse
  it and define supported KPI predicates. Queue SUCCEEDED is not financial
  APPLIED, projection convergence or venue success.
- FE-020 source rollback preview is not durable registration/capital receipt.
  Existing gate plan/apply has different lifecycle; review each family rather
  than generalizing one promise across all cockpit rows.
- DEBT-UXM07-001 contrast requires approved frontend/baseline work. DEBT-003 is
  the BFF-double's missing retained-review response; require a canonical honest
  non-retained test state, not hiding console errors or changing product flags.

## Verification and next delivery

This intake performed source reads, SHA/dirty checks and contract-to-code review
only. It ran no frontend/browser/build/DB lane and no new source API, and did
not change a formula, policy artifact, actual grant, calibration, runtime flag,
credential or protected stack. Reuse unaffected receipts with dependency hashes;
new contracts need generated types, canonical synthetic fixtures, focused
negative/authority tests and actual source qualification separately.

Before every backend entry/freeze/landing/exit, repin the actual peer review and
only mark DELIVERED with landed producer SHA/type/fixture/example and limits.
Claude then records ACCEPTED or CHANGES_REQUESTED with its own consumer receipt.
No written handoff proves it was sent, read, integrated or tested against a real
source. Keep ELP2-11 NOT_ENTRY_READY until its mandatory original gates pass.

Integration order: missing queue-view ownership plus safe self/nav contracts;
Manager P1 query/metric/window bundle; lifecycle/criteria/cockpit reuse; remaining
bounded source-backed refinements. Continue the already-approved pending family
independently; none of this intake activates an upstream or opens a new phase.

## C1→C7 acknowledgement — Bobby approved 2026-10-18

Read peer prompt at `488b245738cd49a320aa948350e679f5d2092697` plus
rules10.10–12 and Source Truth Board. This supersedes the prompt's draft
AWAITING_BOBBY_APPROVAL label for this assigned backend package only.

1. **B1/B2 ownership accepted.** No Codex edits planned in operations/**,
   execution-operational-current-reader.mjs or portal-web.Dockerfile. The C2
   queue view correction only classifies existing migration141 in the shared
   persistence ledger: VIEW_DERIVED, no writer, retention/disposal inherited
   from execution_operation_queue_items. No new writer/TTL/runtime claim.
   Shared generated outputs are regenerated from source, never hand-merged.
2. **C3→C4→C5 order accepted.** C3 must use full current scoped authority,
   not the legacy owner-all catalogue. Self-entry cannot expose the admin
   matrix. C4 implements FE-025/041 once and explicitly rejects supplied
   as_of_ms (CURRENT_ONLY); no fictional window or source freshness.
3. **SSH sample format accepted:** file@fullSHA:line, observed UTC and host/
   worktree, with file digest for WIP; source code, isolated qualification,
   selected provider and mounted runtime are separate assertions. Family
   order: self/current authority, Manager facts, command/lifecycle, realtime.
   A clean SHA or passing owner cell alone never means EXISTS_MOUNTED.
4. **Researcher field matrix** remains a finite proposal for Bobby review,
   never blanket permission or an automatic grant. C5/C7 preserve source/
   executor commissioning and ELP2-11 NOT_ENTRY_READY.

C1's SQL repair passed migration/direct SQL assertions in the focused retake;
one new test fixture required explicit INSERT for a distinct DENY grant.
Corrected fixture awaits the normal-hook terminal. C2 shares that coherent
R3 landing rather than charging a separate full hook for one metadata row.
No Claude source merge until canonical is clean, peer rebased on the actual
landed SHA and Claude's R2 evidence covers that exact SHA. No push/deploy.

### Actual C1/C2 terminal and C3–C7 integration

C1/C2 landed at `5291a80f68a11cbccad879d1e99bb6282634f636` after actual
normal-hook terminal `pending-control-land-151825` at16:04:56UTC. Contracts
996PASS, clean supported-Node22 API build PASS, API7503PASS/3skip. All eight
protected runtime tuples, source/index preservation and exact cell teardown
PASS. Log SHA256 `275849cab47c0489bdc960b6c97374156f225eafee024b83e5fb883baeabf6f2`.
Previous failed terminal above is preserved; this is not a source mount.

Peer read refreshed at `128e1cf4d154df17fe1d8d4b16bb538ce5f4471c`; B1 staged
operations/query/generator changes are owned by Claude and were not copied or
edited. F8's consumer-review is a request, not an ACK. C3–C7 applied reviewed
implementation and F8 dispositions are tracked in the owning phase handoffs
and [current integration/validation packet](manager-intake-2026-10-18.md).
The [finite researcher proposal](../ELP2-03/researcher-field-policy-proposal-2026-10-18.md)
is NOT_INSTALLED, awaiting Bobby's field-policy decision; no wildcard grant.

### Committed B1/B2 source review — awaiting exact-source landing gate

Read-only peer HEAD `34b30032957196dad327755fa5cd136691ac7dd6`; B1 producer
`517684b6613449c71c5c7417f74aba900c835ae9`, B2 `77ded3ef9fc0298641f344cb5abbcd081d0ccb1f`.
Disposition: backend source **ACCEPTED_FOR_INTEGRATION**, not runtime/SLO or
observed R3 acceptance. Same-snapshot authorized m:n incident links and finite
faceted status counts preserve hidden-row non-disclosure; Matching must use
filtered_count, never the facet count or financial APPLIED semantics. ROOT
verification and actual schema141 refute the speculative incident-retarget race.
Current canonical tree has not imported these peer commits.

Two consumer/document requests for Claude before landing: require exact finite
`ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED` and
`INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE` literals in operationalQueue reader
(and two negative mutations), not arbitrary nonempty strings; update B1's stale
UNCOMMITTED/no-R3 handoff with actual terminal receipt/source hash. Commit body
alone does not prove a normal-hook result. Preserve prior focused receipts.
Canonical must first be green/clean; then Claude rebases/regenerates and takes
R2 on that exact successor SHA before any ff-only landing. No dirty merge,
manual generated hunk splice, push, preview activation or dev/main promotion.
