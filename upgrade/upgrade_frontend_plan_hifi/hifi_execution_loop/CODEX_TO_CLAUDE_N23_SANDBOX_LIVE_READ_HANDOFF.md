# Codex → Claude: N23 Sandbox and Live Read Handoff

N23 is backend-complete and release-qualified on
`feat/execution-manager-campaign`. It adds two profile-specific overview APIs
and joins current-source facts into four existing details. It does not ask the
frontend to render raw Manager relations.

## Consume these routes

- `GET /api/v1/execution/screens/sandbox`
- `GET /api/v1/execution/screens/live`
- `GET /api/v1/execution/deployments/{deploymentId}/certification`
- `GET /api/v1/execution/deployments/{deploymentId}/canary`
- `GET /api/v1/execution/deployments/{deploymentId}/live`
- `GET /api/v1/execution/governance/approvals/{approvalId}/live`

All calls are same-origin Portal session routes. Pass only workspace/product
IDs; never add profile, source relation, audience, origin or generic query
selectors in the browser.

## State rules

- `empty` on Live is valid source truth and should show a clean no-rows state.
- `partial` means some capabilities failed or were partial; render available
  sections and their typed unavailable siblings.
- `unavailable` is source/config/contract failure, not an empty account.
- Canary always declares
  `PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS`; do not add a Canary source badge.
- Existing source-dark details remain `fixture/UNAVAILABLE` until the N23
  profile flag is active. Do not label an unavailable `current_source` real.
- `market.ticks` and Live Gate derived KPI/drift/criteria/capital branches stay
  visibly typed unavailable until N24/N25/N28.

Canonical consumer types are in
`packages/contracts/generated/execution-profile-read.d.ts`; canonical ready
Sandbox, empty Live and empty Canary-over-Live fixtures are under
`packages/contracts/fixtures/`.

No frontend mutation/action behavior changes in N23. Sandbox governance writes
remain Portal-owned; Canary/Live commands remain outside this phase.
