# Governance cross-loop — Claude consumer handoff

Date: 2026-10-12. Canonical branch: `docs/research-loop-plan`.
Backend delivery is the commit containing this packet; no remote push or runtime
rollout. Read the linked [backend receipt](./GOVERNANCE_CROSS_LOOP_REPAIR_2026-10-12.md)
and [Unified repair entry](../../../UNIFIED_IMPLEMENTATION_PLAN.md#governance-cross-loop-repair--bobby-approved-2026-10-12)
before implementing. This handoff is not a new design or source activation.

## Authority and scope

Respect root `AGENTS.md`, research-working-rules in `CLAUDE-FOR-thanhvuong.md`,
Execution HiFi/specs and accepted shared components. Keep layout, typography,
colors and baselines. Commit only owned frontend/evidence paths. Do not change
backend, migrations, capabilities, profiles, Edge/SSE/TS commands or release.
Record frontend progress, remaining requests and exact receipts in Unified/§57;
do not replace historical findings. Do not infer success from fixture acceptance.

R1 is a local Portal decision, not a Trading System execution command. Creating
an R2/Paper Exit review is not approving that gate or granting execution. R2 has
no commissioned decision executor in this delivery. Gate position is not a
history of accepted gates. Never send the R1 command as an R2 decision.

## Published types and compatibility

`packages/contracts/generated/execution-governance.d.ts` now publishes:

- `components["schemas"]["DecisionContext"]`.
- `components["schemas"]["CaptureContext"]`.
- Optional `data.decision_context` and `data.capture_context` on the established
  R1 and R2 reads, with optional envelope `workspace_id` typed too.

Use generated types and boundary validation, not string parsing or invented
identifiers. `npm run generate:governance-review-context` in `packages/contracts`
is the scoped regeneration target. It also regenerates the dependent Profile/Live
declarations, which reuse R2. Canonical labelled synthetic example:
`fixtures/governance-review-context.synthetic.valid.json`. It is not a real run
receipt. Old responses omitting these fields are compatible; omission does not
grant permission. R2 legacy eligibility is not proof of an executable command.

## FE-GOV-01 — R1 decision hashes and conditions

Owner paths: `apps/portal/frontend/src/execution/screens/containers.tsx` (R1
decision container), `api/httpApi.ts` and the established decision input/reader.
The current call omits `evidenceHashes`, so the client posts `[]`. A real request
with nonempty evidence then gets `EVIDENCE_HASH_MISMATCH` blockers on its plan.

- For the R1 command, use the same read's `workspace_id`, `approval_id`,
  `expected_approval_version` and exact `evidence_hashes` from `decision_context`.
  Do not post the manifest hash as an artifact hash, chip text, label or partial
  subset. Preserve unique hashes; null/over-bound pins mean unavailable, not `[]`.
- `availability:AVAILABLE` means a command executor/context exists, not that
  every verb is eligible. Intersect it with the server's per-verb `eligibility`.
  Self-approval, expiry, completeness, blocking findings and version checks stay
  authoritative on plan/apply. A stale read can receive a valid blocked plan.
- With older responses, verified `evidence_manifest.entries[].sha256` can supply
  exact R1 hashes if the current boundary knows the complete manifest. Otherwise
  show a reason and request a fresh read, never silently default hashes to `[]`.
- Keep typed `conditions` for both `APPROVE_WITH_CONDITION` and
  `REQUEST_CHANGES`. The latter requires at least one remediation condition;
  the existing shared client drops them unless decision is conditional approval.
- Paper Exit uses its own decision contract and `lineage` digests; the shared
  decision hook also omits hashes today. Fix that binding against its existing
  input type; do not attach this R1 context to Paper Exit or alias command types.

Exit: fixture/parser coverage plus real-API plan/apply by an independent reviewer
with nonempty evidence; empty/changed hash, stale version and revoked grant
negatives. Preserve decision outcomes and separation of duties; do not create a
new product approval solely to claim browser acceptance without approved input.

## FE-GOV-02 — Truthful R2/Live decision affordance

`DecisionContext` on R2 is `BLOCKED / R2_EXECUTION_DECISION_NOT_COMMISSIONED`;
`command_type`, `request_schema_version`, `plan_path`, `evidence_hashes` are null.
All R2 decision verbs are false; Inbox `needs_you` does not pretend an R2/Live
decision can execute. Display a concise disabled-state reason. Do not fall back
to an R1 command even for an owner or a historical response claiming eligibility.
Explicitly distinguish viewing/capturing a review from granting execution.

Exit: R2 and Live reads produce no R1 plan request from their decision controls;
an intentionally misaddressed R1 request gets typed `409
GOVERNANCE_DECISION_GATE_MISMATCH` only for a user allowed to see that gate.
Other users retain non-disclosing 404/403. No new source authority or mutation.

## FE-GOV-03 — R1→R2 and R2→Paper Exit capture

The existing `ReviewCapturePanel`/same-origin named operations already exist.
Wire them to the new read inputs instead of asking users to invent ids/digests.

| Read / action | Existing POST | Input binding |
| --- | --- | --- |
| R1 / `R2_CREATE` | `/api/v1/execution/governance/r2/capture` | `workspace_id`, `parent_approval_id→r1_approval_id`, `expected_parent_version→expected_r1_version`, `expected_projection_digest`, exact candidate `deployment_id/portfolio_id/risk_grant_id` |
| R2 / `PAPER_EXIT_CREATE` | `/api/v1/execution/governance/paper-exit/create` | same scope pins, `parent_approval_id→r2_approval_id`, `expected_parent_version→expected_r2_version`, exact candidate deployment |

User provides the bounded summary and a retry-safe `request_key`. R2 currency
is reviewer-requested review scope, not an FX conversion/source balance. A
candidate currency is null when absent; never default it to USDT or zero. Require
an explicit valid reviewer selection if the source did not record it. Candidate
tuple selection must stay together, not mix ids from different rows. Up to 50
choices; `candidates_truncated` honestly describes a bounded list, not all data.

`BLOCKED` contexts contain null projection digest and no candidates. Show their
typed reason; do not enable a form from role, previous state or cached capability.
ADMIN alone is insufficient: existing exact parent/target read capabilities are
rechecked on capture and retry. Revocation can therefore return403 on a retry.
Retained/source-off/stale/scope-mismatched/outage states cannot capture a fresh
source review. An approved parent alone does not remove that constraint. A GET
does not mutate anything; POST rechecks source digest, scope, expiry and versions.

Exit: capture-context read → exact POST → read path, retry idempotency and
stale/refused alternatives on an authorized isolated source-backed cell. On the
shared retained preview, the accepted result is the blocked read-only state;
do not enable flags/insert business rows merely to produce a positive screenshot.

## FE-GOV-04 — Workspace and gate track

- Backend R2's `r1_reference.href` now includes `workspace_id`; the canonical
  pattern permits that bounded same-origin query, not arbitrary redirect params.
  Update an old boundary validator if it still rejects every query. Preserve that
  exact workspace through click, reload, deep link, linked evidence and capture
  result navigation. A workspace change must invalidate/refetch the approval,
  not keep a previous workspace's ready decision state.
- `components/gateFrame.tsx` currently marks earlier gates `done` from the
  selected gate's index. Render workflow position as position, not acceptance.
  Accepted/completed state must come from an explicit recorded reference/status;
  missing lineage stays missing. Do not infer Paper/Sandbox/Canary/Live PASS from
  an R2 chip or the step's place in the track. No new backend state is invented.
- Preserve the already accepted §56 source links and claim selector. RUN is
  still not REPORT merely because a label mentions a report.

Exit: affected HiFi/component browser check at 1280/660, keyboard/accessibility,
workspace click/reload and negative/retained paths, zero console errors and no
idle stream/poll or cross-origin calls. Use the standard visual runner if the
affected UI changes; no blanket re-record. Report real/fixture lanes separately.

## Prompt Bobby can send Claude

Read Unified's 2026-10-12 Governance repair entry, backend receipt and this
handoff. Implement FE-GOV-01…04 on the same canonical Research branch, respecting
owned paths and accepted UI. Use generated types; fix only bindings and truthful
action/state rendering, not layout/colors. Preserve workspace, exact hashes,
conditions and candidate tuples. R2 has no executor: never an R1 alias; retained
preview captures stay blocked. Record affected tests/browser/HiFi receipts,
new CG requests and remaining authority gaps in Unified/§57. No source activation,
capability change, DB insertion, remote push or dev/main/release without Bobby.
