# ELP2-03 — Backend → Claude contract handoff

Frontend `NOT_STARTED_BY_OWNER_DIRECTION`; acknowledgement
`AWAITING_CONSUMER_REVIEW`. This packet is not an instruction to start UI.
Producer branch `docs/research-loop-plan`, entry
`b448c0be655817dc49dd02f86aa2544e64c00d48`. Delivery is currently a working
diff, not a landed or deployed release; final receipt/commit belongs in README.

## Operations and generation

`npm --prefix packages/contracts run generate:execution-access` publishes
[OpenAPI](../../../../packages/contracts/openapi/execution-access.openapi.json),
[generated types](../../../../packages/contracts/generated/execution-access.d.ts)
and [synthetic fixtures](../../../../packages/contracts/fixtures/execution-access.synthetic.valid.json).
All fixture identities, policy approvals, receipt IDs and TS states are
`TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`. No actual principal is granted rights.

| Operation ID | Method / suffix under `/api/admin/profile-access/v2` | Main generated schema |
| --- | --- | --- |
| `portalScopedAccessEffectiveGetV1` | GET `/effective?workspace_id=…` | `AccessEffective` |
| `portalScopedAccessPreviewPostV1` | POST `/preview` | `AccessPreviewRequest` → `AccessPreview` |
| `portalScopedAccessProposalPostV1` | POST `/proposals` | `AccessProposalRequest` → `AccessResult` |
| `portalScopedAccessProposalGetV1` | GET `/proposals/{id}?workspace_id=…` | `AccessProposal` |
| `portalScopedAccessRevokePostV1` | POST `/grants/{id}/revoke` | `AccessRevokeRequest` → `AccessResult` |
| `portalScopedAccessRevokePreviewPostV1` | POST `/grants/{id}/preview-revoke` | `AccessRevokeRequest` → `AccessRevokePreview` |
| `portalScopedAccessStepUpPostV1` | POST `/step-up` | `AccessStepUpRequest` → `AccessStepUp` |
| `portalScopedAccessAuditGetV1` | GET `/audit?workspace_id=…&subject_user_id=…` | `AccessAudit` |

Source controller is registered in AppModule; isolated mounted HTTP tests are
separate evidence from registration. These operations are not available on a
shared preview until a separately approved runtime/migration package. There is
**no public policy-install, TS acceptance or verifier-selection operation**.
Default trust is unqualified, so new scoped policy is pending/fail-closed.
Legacy A4 routes and finite ten-action namespace remain owner-only unchanged.

## Semantics the consumer must preserve

- Authenticated actor/session/generation comes only from SessionGuard. Body
  fields cannot choose actor, issuer, role/preset, human mapping, source proof,
  policy approval or SQL/resource query. IDs are exact stable IDs, not names.
- Every mutation needs existing same-origin and double-CSRF headers plus a
  stable idempotency key. Step-up proves the caller's own current password; it
  grants no capability. Passwords never belong in receipt, URL or audit.
- Preview is advisory. `allowed`/`ELIGIBLE` is **not** a committed grant or TS
  right. Submit exact returned digest and expected policy/ceiling/TS revisions;
  current session, whole ancestor ceiling and wall-clock validity are rechecked.
  `effect_preview.before` covers only current grants with the exact selector,
  not every overlapping/hidden entitlement. `after` is conditional on commit,
  never a new effective right. Revoke preview returns a current-authorized
  before/after diff including ALLOW versus DENY. `grant_state=REVOKED_ON_COMMIT`
  withdraws that grant, while `effective_access=CURRENT_POLICY_REEVALUATED`
  makes no promise that all overlapping access disappears. Removing DENY can
  increase rights: it is current-owner-only with explicit revoke authority;
  delegated ordinary revoke is not permission to remove a constraint. Business
  revocation is NOT_CONFIRMED and committed obligations CONTINUE. Preview does not revoke.
- `APP_APPLIED` means Portal application authority only. `TS_PENDING`,
  `TS_REJECTED`, `TS_UNKNOWN` never activate a new TS-dependent grant. Only an
  internal qualified acceptance bound to current mapping/membership may yield
  `TS_APPLIED`; it is not evidence that a trade happened.
- The original submission receipt and HTTP status do not change on retry.
  `replayed=true` returns history, not renewed current authority. A changed
  actor/body/key binding conflicts; revoked current authority cannot retrieve
  a receipt by using it as a credential. Do not blind-retry with a new key.
- `AccessEffective.grants[].current` is a conservative whole-scope statement:
  an ALLOW must be current throughout its resolved resources/environments and
  survive current DENY and ancestors. It is not a universal button permission
  or a promise that a partially allowed set contains no accessible resources.
  Exact reads/actions still use the server decision for their own resource.
- Own effective read does not enumerate other users' grants. Proposal access
  requires current issuer/target/scoped read authority. Unknown and hidden IDs
  use the same public not-found shape. Technical/secrets/export/stream rights
  do not follow business read-all. Researcher field policy remains pending
  until canonical00 request002 is approved; no financial fields are guessed.
- Portal revoke withdraws local access immediately. `ts_authority=UNKNOWN` on
  business revoke explicitly does not claim TS-wide business revocation.
  An old accepted receipt can remain historical ACCEPTED while `current=false`.
- Epoch milliseconds are UTC; validity is `[from,until)`, null end is unbounded
  only inside the parent ceiling. Opaque revisions are exact strings, not
  comparable numbers. Null is not zero or accepted authority.
- Audit is private/no-store, max100 items; default25. Opaque keyset cursors bind
  actor/session generation/workspace/subject/policy/scope/limit and expire.
  Never reuse a cursor after those inputs change; never parse its contents.

## Consumer work when Bobby assigns it

M10/access preview and diff: reuse accepted components; typed pending/denied,
step-up, revision conflict, immutable receipt and app-vs-TS states. Do not infer
permission from ADMIN/display name, synthesize an owner/manager preset, seed
fixtures as current rights, or turn recovery/commands on. Keep disabled reasons
and next steps public-safe; show request/receipt ID in detail, not raw prose.
Use generated response types; errors 400/401/403/404/409/503 are distinct. A
successful replay keeps the original status (proposal201, revoke200).

Required eventual consumer evidence: current-session expiry/revoke, exact
ceiling/resources/environment, key retry/conflict, hidden IDs, app-applied vs
TS-pending/rejected/unknown, owner protection, audit pagination and zero idle
polling unless a future phase explicitly commissions it. Synthetic fixtures
prove composition only; real producer acceptance remains external request003.
Do not edit Research/Planning or global design tokens for this handoff.

## Dependencies / next

Migration `1723680000134` is additive, creates four Portal workflow/audit stores
and **no policy/user/grant seed**. Preserve accepted audit and revocation when
rolling back application writes; destructive down migration is not an
operational rollback. DB runtime changes require their own approved package.

Backend04 may consume this evaluator only after03's transaction/revoke tests
and coherent normal-hook commit.04 must enforce scope before queries/totals,
redact fields/metadata and recheck in-flight/cache/cursor/export/stream results.
Guide00 external decisions/trust are not converted into technical PASS.

No new FE-to-backend request has been received because frontend has not been
assigned. This file is the producer handoff, **not** a claim Claude received or
accepted it. Canonical request002/003 owners/done-when stay in the00 packet.

## Working artifact pin before the normal-hook landing

UNCOMMITTED staged implementation/contracts/test diff against02 entry,
SHA-256 `4eb718b691234c52d81a8a02b331a508bd3d7d964b9d2b99a83ef82e14b4f849`.
Reproduce over `git diff --cached --binary -- apps/control-api packages/contracts
scripts/control-api-test.sh scripts/contracts-test.sh` while these paths remain unchanged. This excludes
journal/index updates and is not a release/image identity.

| Artifact | SHA-256 |
| --- | --- |
| OpenAPI | `ad387d087b8deaee14e611e0dbda7dae844ca1e7a3112acc87a55a887213c0d5` |
| Generated types | `fd5702d4e8b62a755df5e7b143cdb3e0c9b05d117f89977c0aba84d4385b1c9b` |
| 12 synthetic cases | `20d185ffb7037aab829ec71d3f529a594b108d7ea47a3cd073189e8b476ea693` |
| Additive migration0134 | `279a15abf0bf03058e9c06dbf2d4d01516cb4d7f4eb233eab260e5ec8437862c` |

Contract37/37 PASS; pure/earlier mounted-PG receipts and their precise snapshot
limits are in README. The70-case latest transactional definitions are not yet
a PASS receipt. A normal-hook commit and backend-next gate are still pending.
All examples remain TEST_ONLY; no shared preview/browser consumer is certified.
