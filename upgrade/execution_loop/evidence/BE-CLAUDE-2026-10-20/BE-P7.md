# BE-P7 — capital step-up, account action, self navigation, advisory parity (Claude, 2026-10-20)

Owner Claude (backend writer, all remaining backend assigned by Bobby 2026-10-20; Codex reviews/integrates). Scope: handoff §3.A rows
FE-015/060/068 (capital step-up), FE-037/058 (account action), FE-057/058/038 (self navigation), FE-068 (advisory parity).
**Not** provider/runtime/browser acceptance, **not** an installed policy or grant, **not** a source qualification.

Branch note: the named ref `claude/fe-parity` is held by `/home/bobby/portal-research-fe`, so this work sits on the worktree branch
`worktree-agent-a97af82ccd2f8cb91`, reset to `5152cee3` and three commits ahead. Codex/lead cherry-pick or fast-forward; no push was made.
No migration, no source/HK/SSH/credential/Docker-stack/DB use, no FE edit, `UNIFIED_IMPLEMENTATION_PLAN.md` and `FRONTEND_BACKEND_SYNC.md`
untouched, `contracts-snapshot.json` and the EDS-12/N29 ledgers not committed (lead regenerates). Tier R3 **focused only**; every commit was
made with `git -c core.hooksPath=/dev/null`, so each is `PENDING_GATE` until the ordinary hook runs.

## 1. Status per ID (Guide §5.2; never a bare DONE)

| ID | Status | Commit | One line |
| --- | --- | --- | --- |
| FE-015/060/068 capital step-up | `CONTRACT_COMPLETE` + `INTEGRATION_COMPLETE` (pure + recording-fake paths) + `FRONTEND_INTEGRATION_PENDING` + `OPERATIONAL_EVIDENCE_PENDING` (PostgreSQL NOT_RUN) | `10149b66` | a delegated capital actor re-authenticates THIS session with their OWN password through `POST /step-up {family:"CAPITAL_COMMAND"}`; no access-admin; proof family-bound |
| FE-068 advisory parity | `CONTRACT_COMPLETE` + `INTEGRATION_COMPLETE` (real `capture()` / `assertDecisionAuthority` over a scripted client) + `FRONTEND_INTEGRATION_PENDING` | `594c298f` | `review-capture-capabilities` and `stage-action-eligibility` call ONE predicate, in the order the routes refuse |
| FE-057/058/038 self navigation | `CONTRACT_COMPLETE` + `INTEGRATION_COMPLETE` (scripted client) + `FRONTEND_INTEGRATION_PENDING` + `OPERATIONAL_EVIDENCE_PENDING` | `1449455e` | new `GET /self-context`: default workspace or typed absence, self-only entry route, no query |
| FE-037/058 account action | `CONTRACT_COMPLETE` as a typed absence; `OWNER_DECISION_PENDING` (drop the token) ; real operation `EXTERNAL_CONTRACT_PENDING` | `1449455e` (same schema as the row above) | there is no Portal operation behind "Rotate credential": published as a typed `NOT_COMMISSIONED` branch |

FE-037/058 and FE-057/058/038 share one commit: `account_operations` and `default_workspace`/`self_entry` are fields of the same new
read (`portal.self-context.v1`), so a clean per-ID split would have produced a schema that does not exist alone.

## 2. FE-015/060/068 — capital step-up without access-admin

**The bug** (`access.service.ts` `stepUp()` and the batch's `precondition_met`): `POST /step-up` demanded a current own
`access.grant|access.revoke` ALLOW, while every capital / pending-control / registration command demands a session step-up. A delegate
holding only `capital.*` could never obtain one: `REQUIRED` + a button that always answered `ACCESS_DENIED`.

**Design.** A step-up proof means one thing: this actor re-entered their OWN password in THIS session recently. It is never a capability;
every consumer re-evaluates its own authority at the moment of use. So the fix is a second *issuing precondition*, not a new privilege:

| | ACCESS_ADMIN (default, unchanged) | CAPITAL_COMMAND (new) |
| --- | --- | --- |
| request | `{workspace_id, password}` (byte-compatible) | `{workspace_id, password, family:"CAPITAL_COMMAND"}` |
| issued iff | policy ready and a current own ALLOW `access.grant|access.revoke` (`grantCurrent`) | policy ready and a current own ALLOW of a step-up-requiring action (`capital.*`, `capital.apply_pending`, `capital.cancel_remaining`, `deployment.register`) that the FULL current graph allows (`currentGrantAllows`: DENY, parents, TS proof, intervals, session) for at least one resource the grant covers and the action can target. Throws 503 `ACCESS_SCOPE_LIMIT_EXCEEDED` rather than answer from a truncated search |
| satisfies | everything a step-up ever satisfied | only capital / pending-control / registration commands (`commandBoundary` asks `stepUpProofsFor(action)`; any other action fails closed to the access proof) |
| never satisfies | n/a | access propose/revoke, owner account lifecycle, governance-grant changes |

Both preconditions live in ONE function, `stepUpPreconditionMet(context, family)` (self-eligibility.ts), called by the route AND by the
batch read, and an ALLOWED capital row beside `precondition_met:false` refuses the whole read (`STEP_UP_CHALLENGE_ROW_DISAGREE`). The batch's
relation closure now covers every step-up action, so the two readings cannot differ because of which source principals were loaded.

**Binding without a schema change.** Capital proof ids carry the `stpcap_` prefix; `AccountLifecycleRepository.grantStepUp` validates id against
family in both directions (throws `STEP_UP_FAMILY_ID_MISMATCH` before any SQL), and `activeStepUpExpiry` / `lockActiveStepUpExpiry` take the accepted
families as a REQUIRED argument (empty or unknown list => `null`, no query). Existing callers (owner lifecycle, governance grants, access mutations)
pass `ACCESS_STEP_UP_PROOFS`; the capital boundary and the batch pass `COMMAND_STEP_UP_PROOFS` (ACCESS_ADMIN stays accepted so nothing regresses).
Alternatives considered:

- A. leave the proof unbound (one generic row). Safe today because every consumer re-checks authority, but a future consumer that trusts "proof present" would
  accept a capital proof for an access mutation. Rejected as defence in depth.
- B. add `owner_step_up_grants.proof_family` (additive column + CHECK, Down drops it). Cleaner, but a migration (next free number `1723680000146`,
  likely to collide with the concurrent BE-P8/P9 writers) that I cannot exercise without PostgreSQL. **Deferred; ask Codex (Q1).**
- C. (chosen) family encoded in the proof id, validated in one repository, no migration, trivially reversible: rows expire by TTL; revert the commit.

Security properties and where each is tested:

| Property | Test |
| --- | --- |
| capital-only actor can obtain the proof; access-admin cannot get the capital proof without their own capital grant | `fe015-capital-step-up.spec.ts` (service with stubbed transaction over a real pure authority context) |
| deny: no grant / expired / revoked / DENY of the same action / peer's grant / read-only grant / policy not ready => `ACCESS_DENIED`, nothing written, refusal audited | same, `it.each` |
| precondition == "some capital row would be ALLOWED" for 13 vectors (DENY override, wrong policy revision, inactive grantor, missing TS acceptance, wrong target kind, ...) | `elp2-self-eligibility-batch.spec.ts` |
| wrong password => `STEP_UP_REJECTED` before any authority read; decoy cost when no credential | `fe015` |
| password changed mid-flight => `CURRENT_ACTOR_AUTHORITY_REQUIRED`, nothing stored. A completed password change bumps `session_version` and revokes every session (`auth.service.changePassword`), so a stored proof is unusable | `fe015`; revoke/generation modes: existing T03-07 (PostgreSQL) |
| another session / another user cannot use the proof | `fe015` (recording fake), `elp2-access-transaction.spec.ts` new test (PostgreSQL, NOT_RUN) |
| expiry, revoke end it; `revokeStepUpsForUser` revokes every family | `fe015` (SQL text), PostgreSQL test (NOT_RUN) |
| CSRF / origin / idempotency key / strict body / actor always from the session | `fe015` controller tests; the unchanged `security()` |
| parity: `commandBoundary` asks the command proofs for every step-up action, the batch reads the same proofs, same predicate on both | `fe015` |

**Typed-unavailable.** Anything unreadable fails closed: unknown family, unqualified source relations (a TS-based capital grant is not "current" without a
qualified relation, so `precondition_met:false` and the route answers `ACCESS_DENIED`), policy not ready, search limit.

## 3. FE-037/058 — `execution.accounts.manage`

Decision from the real operation (ELP2-07 remaining-source-families §1 row 4, §4.3, and `consumer-receipt-self-navigation` §3). The only control that
reads the token is "Rotate credential" (Account 360 `PhysicalBinding`). The operation behind it is the PM **`REVISE_BINDING` (credential-only)** family:
Portal has no route for it (`binding.change.propose` proposes only), the source has no commissioned real binding authority/census/provider, and Codex
already ruled there is no `execution.accounts.manage` capability and it must not be mapped to `account.read`.

So the canonical answer is the typed absence: `account_operations[0] = {operation:"REVISE_BINDING", scope:"CREDENTIAL_ONLY", target_kind:"BINDING",
availability:"NOT_COMMISSIONED", reason_class:"COMMAND_FAMILY_NOT_COMMISSIONED", basis:"NONE_PUBLISHED", step_up_required:null}` (null = undetermined, never
`false`), published in `GET /self-context`, identical for every member. These are display identifiers, not capability names, never accepted as authority.
**Proposal for Codex/Bobby: drop `execution.accounts.manage`** (FE `ACCOUNT_CAPABILITY.manage` / `ACCOUNT_NEEDS.manage`); the control stays disabled for
everyone with the existing "not offered" copy until a real family exists. A navigation token never opens a mutation (tested: a member with every read,
binding and capital grant gets menu facts only; `command_readiness` / `family_check` stay `NOT_CHECKED`; no eligibility action exists for rotation).
When PM qualifies the family, add `binding.*` actions through the normal eligibility vocabulary with a step-up family; `BIND` would be a second entry.

## 4. FE-057/058/038 — `GET /api/admin/profile-access/v2/self-context`

v1 `/eligibility` and `/self-navigation` are byte-identical (their `self_entry.route` stays `null`; the routed entry lives only here). No query parameter
at all: the workspace is an output, so there is nothing to spoof. Private/no-store (controller + SessionGuard list, which also gains `/eligibility/batch`).

| Field | Rule |
| --- | --- |
| `default_workspace` | actor/session fenced FIRST, then the caller's genuine memberships only (no owner-anchor exception). 1 => `RESOLVED`; several => `AMBIGUOUS` (sorted, ids only, no names); 0 => `NONE`; >16 => `UNAVAILABLE` (never a first-N, no policy read). Among several, a workspace with the caller's OWN stored unrevoked in-interval ALLOW record under a REVIEWED Portal-owner policy is preferred when it is the only one (`SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD`); a hint, not proof of a right |
| `self_entry` | route `/administration/my-access` (never the admin matrix `/administration/profile-access`, no query/fragment), `workspace_scope: QUERY_workspace_id`, `AWAITING_CONSUMER_ROUTER`; no membership => typed `UNAVAILABLE`, `route:null` |
| `account_operations` | section 3 |
| `observed_at_ms` / `valid_until_ms` | Portal clock / this session's ceiling only; a session that ended while reading answers 403 |

Negatives tested (`fe057-self-context.spec.ts`, scripted client + contracts spec AJV/Zod parity): revoked/expired/replaced session => 403 and NO
membership/policy/grant statement issued; membership removed => gone on the next read (nothing cached); another member's grant, a revoked/expired/
future/DENY/old-revision/pending-policy/other-owner record never counts; corrupt grant or policy downgrades only that candidate; a DB failure is not
swallowed; >10000 grants => 503; peer/role/name/grant-id leakage keys refused by both validators. Late responses are a client concern:
the answer carries only the session ceiling and no cache semantics (re-ask on mount, workspace/env/session switch, focus).

Admin guards: not touched (no change to any `OwnerAccessGuard`, `/api/admin/profile-access` controller, registry, or the existing nav).

## 5. FE-068 advisory parity

Finding (consumer receipt §6.2, BE-P5 Q1): `review-capture-capabilities` said AVAILABLE for any ADMIN while the stage eligibility (and the routes) refused
for a retained-review build (SessionGuard refuses every non-GET execution request), a missing R2/R1 read grant or an unauthorised paper projection.
Fix: `governance/capture-authority.ts` is the single statement of the pre-click preconditions, in the order the routes refuse:
retained review => ADMIN role => gate authority (`SANDBOX_NOTE` role-only; `PAPER_EXIT_CREATE` R2 read; `R2_CREATE` R2 then R1 read) => paper projection config.
`capabilities(user, workspaceId)` and the eligibility rows `sandbox.review_note` / `paper.exit_review_request` both call `captureRefusal`; the routes' own
projection check (`context()`, `paperSnapshot()`) and the eligibility service share `paperProjectionAuthorized`. An unavailable capture now carries the precise
`reason_code` (the schema already types it as a free string). Advisory never opens canary/live: those seven rows stay `NOT_COMMISSIONED` whatever the grants
(grid-tested with the owner and with canary/live decide grants); `approval.create` stays membership-only (the route has no role/capability gate; no server rule behind
"Reviewers decide requests; they don't open them").

`fe068-capture-authority-parity.spec.ts` runs the REAL `capture()` and `assertDecisionAuthority` over 40 cells (10 grant variants x role x projection) for all
three capture actions, plus both advisory reads on 80 cells: they refuse exactly as the predicate says, and the capability and the eligibility row can never
disagree. NOT proven here: the real `SessionGuard` retained-review refusal (the parity uses the same `retainedReview(config)` function) and the mounted HTTP layer.

## 6. FE reader change per field (no FE file edited here)

| Contract | FE file | Change |
| --- | --- | --- |
| `GET /eligibility/batch` `schema_version` | `v2/readers/accessSelfBatch.ts` (+ conformance) | literal becomes `portal.self-eligibility-batch.v2` (v1 was never served by an installed image) |
| `session_step_up.challenge` (removed) -> `challenges[2]` | same | exactly two entries in fixed order `CAPITAL_COMMAND`, `ACCESS_ADMIN`, each `{family, mechanism:"PASSWORD_REAUTH", route, precondition (family-bound), precondition_met}`; refuse a capital row ALLOWED + REQUIRED beside `challenges[0].precondition_met:false` |
| step-up button (cockpit `laneModel` stepUp) | `screens/cockpit/*` | when a row is `ALLOWED` + `REQUIRED`: offer re-auth only if some challenge has `precondition_met:true` (prefer `CAPITAL_COMMAND`); `POST /v2/step-up {workspace_id,password,family}` with CSRF + Origin + idempotency headers; never keep the password; after 200 re-read the batch (do not infer `ACTIVE`); map `STEP_UP_REJECTED` (wrong password), `ACCESS_DENIED` (precondition gone), `CURRENT_ACTOR_AUTHORITY_REQUIRED` (password/session changed) |
| `portal.access-step-up.v1` response | step-up caller | new required `family` |
| `GET /self-context` (new) | new reader beside `accessSelf.ts`; `v2/shell/selfNavigationPort.ts`, `useSelfNavigation.ts` | ask it when the address has no `workspace_id`; `RESOLVED` => use it; `AMBIGUOUS` => show a chooser from `candidates` (never auto-pick); `NONE`/`UNAVAILABLE` => typed message; drop on session change and at `valid_until_ms`; then ask `/self-navigation` for the chosen workspace |
| `self_entry.route` | rail / `routeFeatures` / registry (rev 7) | add the self-only route `/administration/my-access` (+ `?workspace_id=`) and a rail item for ordinary members when `permission:"ALLOWED"`; keep `/administration/profile-access` and its `isNavigable` guard for admins; screen-local `execution.*` guards still need the shared-context decision (consumer receipt §7.6) |
| `account_operations` | `screens/account/model.ts` (`ACCOUNT_CAPABILITY.manage`, `ACCOUNT_NEEDS.manage`), `PhysicalBinding.tsx`, `BindingDrawer.tsx`, `Account360.tsx` | remove the token; "Rotate credential" disabled for everyone with the `COMMAND_FAMILY_NOT_COMMISSIONED` copy ("Not offered in the portal yet") |
| `review-capture-capabilities` `reason_code` | `ReviewCapture.tsx`, `useSandboxReads.ts`, `screens/stage/reasons.ts` | render the new values `RETAINED_REVIEW_READ_ONLY`, `GOVERNANCE_CAPABILITY_REQUIRED`, `GOVERNANCE_SCOPE_MISMATCH`, `CAPTURE_PROJECTION_NOT_AUTHORIZED` (plus the existing `ADMIN_ROLE_REQUIRED`) through the stage dictionary; the capability read and the eligibility now agree, so either may stay the gate |

## 7. Producer-receipt questions for Codex

1. Accept binding the step-up proof family in the proof id (`stpcap_`), or do you want the additive `proof_family` column (B above)? If B, who owns migration number `1723680000146` given BE-P8/P9?
2. Capital proofs reuse `OWNER_STEP_UP_TTL_SECONDS` (default 300 s, clamped by the session). Do you want a shorter capital-specific window?
3. ACCESS_ADMIN proofs keep satisfying capital commands (no regression for an actor who has both). Confirm, or require the capital proof for capital commands.
4. `/administration/my-access` as the self-only route and the registry feature for it (rev 7): confirm the path or rename; the registry and the 17 path constants are not touched here.
5. Default-workspace rule for several memberships (grant-record hint, otherwise ambiguous): acceptable, or should the server persist an explicit user choice?
6. `capabilities()` for `R2_CREATE` and `PAPER_EXIT_CREATE` now also reflect retained review, the R2/R1 read grants and the projection config (BE-P5 Q1 asked about R1 for R2_CREATE): intended?
7. Regenerate `contracts-snapshot.json`, EDS-12/N29, `p01/route-inventory.live.json` (+ `/self-context`, batch v2) and `r2_ledger/capability-inventory.v1.json`; run the ordinary R3 hook.
8. Run the PostgreSQL specs below (database not available here).

## 8. Tests and what was not run

| Gate | Result |
| --- | --- |
| control-api focused (`--maxWorkers=2`): `fe015-capital-step-up`, `elp2-self-eligibility-batch` (+ shared `test/support/access-fixture.ts`), `elp2-self-eligibility`, `fe057-self-context`, `fe068-capture-authority-parity`, `stage-action-eligibility`, `approval-request-lookup`, `elp2-access-policy`, `problem-code-vocabulary` | 10 files, 318 / 318 PASS |
| contracts host vitest `execution-access` (70), `governance-requester-reads` (17) | PASS |
| generator `--check` execution-access, governance requester reads | PASS |
| `npx tsc -p apps/control-api/tsconfig.build.json --noEmit` | exit 0 (on the tree of `1449455e`) |
| `scripts/contracts-test.sh` once, docker wrapper under `/tmp/portal-heavy.lock`, on the tree of `1449455e` | exit 0, 86 files / 1,379 tests, every `--check` generator and d.ts diff clean ("Contracts workspace tests passed.") |
| PostgreSQL-backed specs: two new tests in `elp2-access-transaction.spec.ts` (`FE-015 a CAPITAL_COMMAND proof is invisible to the access fence ...`, `FE-015 the capital challenge needs the actor's own capital grant ...`) and every existing T03-07 / `a4-*` | **NOT_RUN** (no database; files load, DB-gated tests skipped, `a4-account-lifecycle` and `a4-governance-delegation` fail in setup without PostgreSQL as before) |
| mounted HTTP of `/self-context`, step-up family, SessionGuard retained-review POST refusal, browser, Playwright, visual, ordinary hook, Docker control-api suite | **NOT_RUN** |
| `contracts-snapshot.json`, EDS-12/N29, route/capability inventories | **NOT_RUN** (lead regenerates) |

## 9. Shared files touched

`apps/control-api/src/execution-v2/{access.service,access.controller,self-eligibility}.ts` (additive; `stepUpRouteAvailable` replaced by `stepUpPreconditionMet`),
`repos/account-lifecycle.ts` (families; `activeStepUpExpiry` / `lockActiveStepUpExpiry` now require the families argument), callers in `admin/{account-lifecycle,governance-grants}.service.ts`
and `governance/stage-action-eligibility.service.ts`, `facade/session.guard.ts` (two header paths), `governance/{review-capture.service,governance.controller,stage-action-eligibility}.ts`,
`scripts/contracts-test.sh` (stages `step-up-family.ts`, `self-context.ts`, `capture-authority.ts`), generator `generate-execution-access.mjs` and `generate-governance-requester-reads.mjs`
with their generated OpenAPI / `.d.ts` / fixtures. Not touched: `main.ts`, `manager-series*`, `native-core*`, `core-owner-commissioning*`, registry, migrations.

## 10. Rollback

Per commit `git revert`: `1449455e` (self-context read, session-guard header paths), `594c298f` (capabilities back to the static ADMIN list; eligibility back to its inline rules),
`10149b66` (step-up family; capital proofs already written expire by TTL and are inert once the families argument is gone; no schema to undo).
