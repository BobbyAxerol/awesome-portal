# Core–Claude integration candidate — 28 October 2026

Status: **CANDIDATE ONLY; NOT LANDED, NOT CONNECTED, ELP2-10/11 OPEN**.

## Inputs and integration

- Shared `docs/research-loop-plan` at `0f5c361a8`; Claude
  `claude/step-b-integrate` at `d80a02d6a233a23b211b41a23f42a465a345bc57`;
  independent Research-stage fix `837eae444244ad2e99f2a195b30170f3ae3a13a0`.
- Separate worktree `/home/bobby/portal-elp2-integrate-20261028`, branch
  `chore/elp2-integrate-20261028`. The merge candidate `156ddae6c` preserves
  both histories. The three-file Research-stage/browser integration is
  `0c3441a5f`; the additional selected-record read assertion is
  `aea2501be2f899e97c118c5bf4cbb1eb1c861421`, tree
  `f0393dfecdb481e540f09a03a0460b960ac0d6cf`.
- From the shared pin the candidate changes 380 files, +14,364/-1,389; that is
  the aggregate of both authors, **not** a claim Core wrote those lines. One
  trailing space in Claude's e2e fixture was corrected, with no semantic/UI
  change. No tracked WIP from either original worktree was overwritten.

## Actual checks

- Research-stage and world-tie focused tests on the integrated tree: **73/73
  PASS**, exit 0. Initial sandbox attempt was interrupted (exit 130) after the
  loopback-dependent suite stalled; the passing run used the approved local
  loopback network outside that sandbox.
- Frontend `tsc -b --pretty false`: **PASS**, exit 0. Vite fixture build:
  **PASS** after linking the existing Roadmap dependency tree. The first build
  failed to resolve `mermaid` because the new worktree lacked that dependency;
  it was not counted as a pass.
- Positive fixture browser journey: 10 screens visited, zero recorded bad API,
  console/page errors or document overflow at 1280/660. Six Research-stage
  cases (plain/workspace/workspace+unknown deployment × two widths) returned
  HTTP 200 and rendered. On Approval the V2 queue button selected `EX-803`;
  both `/api/v1/execution/governance/exit-reviews/EX-803` and
  `/api/v1/execution/governance/approvals/EX-803/evidence` returned **200**.
  The walker formerly expected only a legacy per-request anchor; the candidate
  tests the actual V2 selection and the selected-record read instead. This was
  reached via the Approval hub, **not** proof of a deployment-to-approval
  relationship or an independent R1 reviewer/write.
- World comparison: **89 checks, 0 mismatches, 6 skipped**; detail-link sweep
  **0/92 executed**. Therefore the focused positive journey passes its stated
  assertions, but is not a complete 92-link or all-scenario acceptance.
  Raw generated receipt is retained outside Git at
  `/home/bobby/.local/state/portal-execution-elp2-evidence/20261028/RESEARCH_INTEGRATED_APPROVAL_BROWSER.json`,
  SHA256 `87ea25fb794d8483e5121526ea07c0e9556e53700ff65375e50c66c29fa1275b`.

## Handoff and remaining gates

Claude: review the candidate without replacing newer work; use the Research
alpha fix and V2 Approval test on the integrated pin. Continue QA8's remaining
findings and explicitly check the six skipped ties and actual cross-object
approval navigation. No component layout or product design was changed here.

The integrated diff needs review and a normal full hook on its final frozen
tree before ff-only landing. The separate candidate is not the shared branch;
focused tests/build do not replace that gate. The older whole-Core and
targeted Core typechecks timed out; this frontend typecheck does not close them.
Edge mailbox was rechecked against its current checkout: no newer qualified
source/binding return was found. Discovery V2 still needs source/trust/current
rights and connected READ/STREAM/revoke/recovery; financial source ownership,
census, proof/APPLIED→ACK, same-original STATUS gateway, approved calibration,
G2/coexistence and connected browser remain open. Calendar is `SOURCE_DARK`.
Migration/restore rehearsal must use the final pinned candidate; prior backup
preservation is not that rehearsal. Do not use expired binding or fixture to
claim any connected gate.

R1 was used for candidate integration and focused-test commits under campaign
§10.10c; final landing requires the normal gate. This documentation update is
R0 (§10.10d), with explicit paths, `git diff --check`, link checks and tracking
test. Owned temporary browser/build directories and two dependency symlinks
were removed; raw evidence above and both source worktrees were preserved.
