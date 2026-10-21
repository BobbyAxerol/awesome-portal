# Codex → Claude: DEBT-030 / DEBT-042 disposition

Read-only source cut: Claude `90f84643`,21October2026. No new endpoint,
command, grant or runtime commissioning is performed by this review.

## DEBT-UXM07-030 / UXM08-REQ-A

The blanket claim “there is no pagination operation” is superseded:
`packages/contracts/openapi/execution-manager-lists.openapi.json:10` publishes
`listAlphaFleet` with After/Before/Limit and a server-policy-selected scoped
response (`:66–75`). Snapshot/stream operations also exist in
`execution-alpha-fleet-realtime.openapi.json:9,162` and their controller.
Empty paths in the older schema-only `execution-scoped-realtime.openapi.json`
do not prove absence of an HTTP route.

Actual remaining work: map the slice's `ScopedPagePort` to the correct
existing generated HTTP operation and qualify source/authority. A named
Manager dataset response and `ManagerScopedResponse` are different envelopes;
never interchange them to satisfy a fixture. Claude owns this consumer and
any assigned additive projection; Codex coordinates connected source pins.
Do not create a duplicate page endpoint from the stale debt wording.

## DEBT-UXM07-042 — exact action/family mapping

| Control | Existing publication | Correct disposition / next owner |
| --- | --- | --- |
| Return capital | `access.contract.ts:14` has `capital.return_capital`; absent from `self-eligibility.ts:37` and executor allowlist (`foundation.contract.ts:18`, `command.service.ts:20`) | Family NOT_COMMISSIONED. No alias to recall, negative funding or immediate decrease. PM/source owner returns real writer qualification before an eligibility action is enabled. |
| Lock allocation | Candidate `ADMIN_LOCK/ADMIN_UNLOCK` codec (`pm-control-adapter.ts:5,99`); no corresponding access action or mounted coordinator/route/trust | NOT_COMMISSIONED. Economic risk lock is not “freeze edit controls”; do not reuse halt/resume. |
| Deploy version / start on account | `deployment.activate` exists in catalogue (`access.contract.ts:16`) but not row eligibility or mounted activation family | Activation NOT_COMMISSIONED. `deployment.register` / `INSTANCE_REGISTRATION_PREVIEW` (`self-eligibility.ts:162`) only registers an instance; it does not start, fund or activate a version. |
| Rotate credential | `self-context.ts:48–55` already publishes `REVISE_BINDING`, `CREDENTIAL_ONLY`, `BINDING`, `NOT_COMMISSIONED`, `COMMAND_FAMILY_NOT_COMMISSIONED`, `step_up_required:null` | Claude consumes this typed refusal; no invented apply action, secret display or local fallback. |
| Incident acknowledge | Mounted Portal-only route `incident.controller.ts:87` | Endpoint exists; advisory eligibility vocabulary/consumer remains. Do not call the whole endpoint NOT_COMMISSIONED or borrow `maintenance.execute`. |
| Incident mitigate | Mounted route `incident.controller.ts:172`; repository`:360–371` requires OPEN, acknowledged, assignee and mitigation evidence | Same Portal-only disposition, preserve exact preconditions. |
| Incident resolve | Mounted route `incident.controller.ts:189`; repository`:383–390` requires MITIGATED and CLEAN_DRY_RUN evidence | `resolution_gate` is already published (`incident.service.ts:340`); copy saying “No gate is published” is stale. |

Incident writes retain ADMIN (`incident.service.ts:185,350`), workspace,
Origin/CSRF checks (`incident.controller.ts:214–246`). Their response explicitly
states `source_side_effect_requested:false` and
`deployment_resume_requested:false` (`incident.service.ts:201–208`). A Portal
incident workflow is not TS command authority or proof of trading safety.

This resolves the ambiguous vocabulary question by source evidence; it does
not close missing commissioning or advisory publication. Under campaign§10.13
Claude retains assigned backend/consumer implementation, Codex retains review
and PM/TS/Edge coordination. Any new action/family requires one coherent
contract, schema, generated types, fixture and negative tests—never a UI-only
permission assumption. Capital step-up purpose follows the exact intent's
authorization (`command-trust.ts:18–23`), not an unconditional R2 alias.

## Next actions / acceptance

Claude: correct the stale ledger rows, wire existing typed refusal and
resolution gate, then return the exact operation/envelope mapping for page
port review. Keep missing economic command families disabled with the precise
source reason. Codex: repin genuine command commissioning before enabling any
new family and review the resulting contract. No fixture is connected proof.
