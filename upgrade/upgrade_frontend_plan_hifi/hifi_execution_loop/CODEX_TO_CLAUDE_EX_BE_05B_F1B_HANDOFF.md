# Codex → Claude — EX-BE-05b/F1b Incident Detail Handoff

Date: 2026-08-23  
Backend status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Frontend lane: Phase 8 Incident Detail Lane A; registry remains `fixture`

## Read order

1. `packages/contracts/generated/execution-operations.d.ts`
2. `packages/contracts/fixtures/execution-incident-detail.open.valid.json`
3. `packages/contracts/fixtures/execution-incident-workflow.resolved.valid.json`
4. `packages/contracts/openapi/execution-operations.openapi.json`
5. `upgrade/backend/EX_BE_05B_F1B_INCIDENT_DETAIL.md`

Generated declarations and fixtures win over prose. Extend the existing
execution adapter; do not create a second incident model.

## Claude can implement now

- Bind Phase 8 Lane A to the incident detail and workflow response shapes.
- Render the forward-only `OPEN → MITIGATED → RESOLVED` rail. Never render a
  reverse or reopen transition.
- Keep acknowledgement and assignment distinct from workflow state.
- Render `correlated_operations`, `evidence`, `annotations` and `timeline`
  using server `total_count`/`returned_count`/`truncated`; cap rendering and do
  not infer missing history.
- Render all four `source_panels` independently. Their current state is
  `unavailable`, not empty, healthy or zero.
- Send `request_key` and `expected_workflow_version` for every mutation. A 409
  requires refresh/review; never blind retry a changed payload.
- Use `resolution_gate` for affordance, while treating the server mutation as
  authoritative. Resolve requires the stored clean-dry-run evidence reference
  and a reason.
- Show clearly that resolve closes the Portal incident only. It never resumes
  a deployment or changes Trading System state.

## Stop gates

Do not activate the registry route/profile, hide the fixture badge, open
EventSource, call AWS-HK, or source findings/alerts/dead-letters/trace-order
from DB, Redis or CLI. Do not upload artifact bodies through this API: F1b
stores SHA-256 evidence references and metadata only. Do not add a Resume
button as a side effect of resolution.

## Required frontend evidence

1. OPEN, MITIGATED and RESOLVED rail states plus malformed-state fail-closed;
2. four explicit unavailable source panels;
3. exact/truncated collection counts and a bounded timeline;
4. ADMIN action visibility and USER/401/403 handling;
5. acknowledge, assign, annotate and evidence flows with focus restoration;
6. mitigation blockers and clean-dry-run resolution blocker;
7. expected-version conflict refresh/review UX;
8. replayed mutation does not duplicate toast or timeline rows;
9. credential-like note validation is rendered safely without echoing input;
10. resolved state contains no auto-resume affordance;
11. keyboard, narrow viewport and reduced-motion coverage.

Claude can do this in parallel while Codex rechecks the D2 IAM DryRun. Phase 7
F1a and Phase 8 F1b are independent Lane A adapters; neither authorizes a live
source or command route.
