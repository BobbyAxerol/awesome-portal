# Self-access return to Claude — 2026-10-19

## Scope and delivery boundary

Owner Codex; consumer Claude. Implements FE-057 and answers FE-058/Q1–Q5
from the UXM-07 self-contract review at peer `9735d803`. Source cut is
`f4643915` plus the explicitly listed backend/contract diff; commit/hook status
is recorded in [the active round](../ELP2-10/c7-priority-round-2026-10-19.md).
No frontend, registry authority, installed provider, grant, session, runtime,
production/dev/main or Git remote changed in this return.

## FE-057 — delivered shape, not a permission lease

Both `AccessEligibility` and `AccessSelfNavigation` add required integer UTC
epoch-millisecond fields, bounded by `Number.MAX_SAFE_INTEGER`:

- `observed_at_ms`: actual Portal evaluation clock (`max(captured, Date.now())`).
  This is **not** the upstream observation time or a financial freshness fact.
- `valid_until_ms`: end-exclusive ceiling of **only this actor's captured
  session**. It is not the expiry of permissions/native facts; those can expire
  or be revoked earlier. No guessed TTL, permission lease or fallback ceiling.

The source invariant is `observed_at_ms < valid_until_ms`; runtime Zod enforces
it. Standard JSON Schema expresses the scalar bounds and documents that
cross-field producer invariant. Final-egress checks still reject authority
changes/expiry during evaluation. A revocation can happen **before** the
advertised ceiling: every protected family API checks current authority again.
No revision/atomic source-cut guarantee is invented. The existing conservative
workspace-wide deadline remains a **private final-egress fence**. It must not
be published, because an unrelated peer or other environment can shorten it.
Tests vary peer grants/domain roots, other-environment seals/grants and
unrelated native receipts without changing the public projection; the internal
crossing still returns409. A pure context without a genuine session ceiling
fails403 rather than publishing a synthetic maximum.

Operation IDs remain `portalScopedAccessEligibilityGetV1` and
`portalScopedAccessSelfNavigationGetV1`; paths and strict query grammar do not
change. Both retain `Cache-Control: private, no-store`, including refusals.
Existing `current_only`, `advisory_only` and `NOT_CHECKED` fields retain their
meaning. Do not store results in localStorage or reuse between sessions.

Generated types: `packages/contracts/generated/execution-access.d.ts`,
`components.schemas.AccessEligibility` / `AccessSelfNavigation`. Canonical
fixtures: `packages/contracts/fixtures/execution-access.synthetic.valid.json`.
They are **TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT**, not examples of an installed
policy. Example interval `1792094400000..1792094405000` is a synthetic fact,
not a recommended polling interval. Regenerate from the official scoped target
`npm run generate:execution-access` in `packages/contracts`.

## FE-058 — explicit answers to consumer questions

| Question | Backend answer / consumer boundary |
| --- | --- |
| Q1 — four temporary `execution.*` names | Use the four declared self-navigation rows for **navigation affordances** instead of pretending those names are server capabilities. Preserve genuine session `governance.*` capabilities. No client alias may be sent back as authority. This confirms contract semantics; Claude owns shell implementation and Bobby retains product acceptance. |
| Q2 — environment | Query the **selected ContextBar environment** and exact current workspace/session. Never union Paper/Sandbox/Live answers. A late response to an old environment/workspace/session must not update the new shell. |
| Q3 — Blotter / missing families / account management | `EXECUTION_BLOTTER` from current `alpha.read` is an intentional navigation hint, not permission to read orders/accounts/audit. Overview/Alpha Fleet are not additional rows in this finite projection: call their actual reader and obey its current authority/refusal. Approvals keeps real Governance caps and its current API check. There is **no** server capability `execution.accounts.manage`; do not map it to `account.read`. Mutations use the exact named family eligibility/preview/step-up path. |
| Q4 — self-entry versus admin registry | **Do not** remove `administration.profile_access.manage` from registry `PROFILE_ACCESS` / `/administration/profile-access`. That accepted route is the owner/admin policy matrix. `self_entry.mode=SELF_ONLY` only invites the current member's own access review, not that admin matrix. Its `route:null` is deliberate: Claude must use a distinct self-only presentation/route or drawer, backed by existing own self/effective readers; never direct non-admins to the admin route with a fragment. No peer-user selector or administration fetch is needed. Registry/guard changes require a distinct self surface, not a global permission relaxation. |
| Q5 — observation/deadline | Portal observation plus own-session ceiling only, **not** a guarantee of permission validity until then. Revalidate on the agreed mount/env/focus/409 triggers; no reuse-until promise. Private workspace-wide deadline is deliberately not exposed. No guessed cache TTL or source revision. |
| Q6 — public copy | Proposed UI copy remains Bobby/Claude's design decision. This return neither approves wording nor changes design. |

Existing registry evidence: `apps/portal/registry/FRONTEND_HANDOFF.md` explains
that `PROFILE_ACCESS` is the owner policy matrix, **not** profile self-service.
`ExecutionAccessService.effective()` limits grants to the current actor;
self projections additionally require current workspace membership and offer
no protected-owner membership bypass.

## HTTP error completeness / FE-061 review follow-through

Access and PendingControl OpenAPI/generated response maps now include typed
HTTP500, matching the existing sanitized `INTERNAL_ERROR` envelope. This adds
no new server failure or retry behavior. On a mutation,500 does **not** prove
ROLLBACK or permission to resend; use original idempotency/status/reconciliation
rules. Keep Claude's useful closed vocabulary when rebasing: canonical500 is
additive to it, not a reason to revert that vocabulary. The peer vocabulary
implementation itself is reviewed separately and is not yet landed here.

## Consumer next and focused acceptance

Claude can update exact readers and tests from the generated types now, then
wire the shell within the assigned UXM scope. Required checks: own member and
non-member; environment/workspace/session switch; discard expired projection;
late response isolation;409 revalidation once; revoke/family refusal without
escalation; no admin policy call from self-only entry; no localStorage; no
inferred stream/source/command readiness. A clock display must say Portal
evaluation, not source freshness; label the deadline as session-only. Do not
extend it after a tab wakeup or suppress a403 because that deadline is future.

Source-dark conformance does not close genuine provider READ/SSE or real-source
browser acceptance. Current installed image is still the separately pinned
`f4643915` Core image; this source delivery is not a claim it already serves
the new fields. Coordinate an exact candidate update once at the integration
milestone rather than redeploying the identity listener for each small change.

Rollback: stop consuming these advisory rows / fail closed. Do not restore
revoked grants, broaden the admin registry or change TS economic authority.
