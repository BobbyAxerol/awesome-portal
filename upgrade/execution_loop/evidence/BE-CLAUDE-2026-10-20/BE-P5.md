# BE-P5 — ELP2-03 + ELP2-07 + governance (Claude, 2026-10-20)

Owner Claude (backend, assigned by Bobby 2026-10-20 from Codex's debt list); branch `claude/be-gaps-2` from
`792319bb`. Producer-side contract and read-side delivery for FE-062/063/068/069. **Not** provider/runtime/browser
acceptance, **not** an installed policy or grant, **not** a source qualification. No migration, no HK/SSH/credential/
Docker/network use, no FE edit, no edit to `UNIFIED_IMPLEMENTATION_PLAN.md` or `FRONTEND_BACKEND_SYNC.md`.

Status words follow Guide §5.2 (never bare DONE): every request below is `CONTRACT_COMPLETE` +
`FRONTEND_INTEGRATION_PENDING` + `OPERATIONAL_EVIDENCE_PENDING` (PostgreSQL/HTTP paths NOT_RUN here); commits are
`CONTRACT_DELIVERED_AT_COMMIT` as listed. Verification tier R3 **focused only**; the full hook was not run
(`git -c core.hooksPath=/dev/null`), so every commit is `PENDING_GATE` until Codex/lead run the ordinary hook.

## 1. Status per request id

| ID | Status | Commit | One line |
| --- | --- | --- | --- |
| FE-063 | CONTRACT_DELIVERED_AT_COMMIT 6cd24760 | 6cd24760 | `recipient_account_id` (required, nullable) on the served `PendingControlStatus` |
| FE-062 | CONTRACT_DELIVERED_AT_COMMIT de4ebb4c | de4ebb4c | `GET /api/v1/execution/pending-recalls` exact-resource discovery of open recalls the Portal controlled |
| FE-068 | CONTRACT_DELIVERED_AT_COMMIT a74f6456 + f48a97c6 | a74f6456, f48a97c6 | batch multi-resource eligibility + typed step-up (access family); stage-action eligibility (governance) |
| FE-069 | CONTRACT_DELIVERED_AT_COMMIT f48a97c6 | f48a97c6 | read-by-`request_key`; run list/cursor/alpha filter already served by Research (no BE change) |
| ELP2-07 other families | EXTERNAL_CONTRACT_PENDING (not mine) | n/a | table in §6 |

`f48a97c6` carries FE-068 (stage actions) and FE-069 together: both patch the governance OpenAPI through one new
idempotent tool and share one fixture, controller and generated `.d.ts`, so a clean split by request id was not possible.

## 2. FE-068 — self-eligibility before the click

The existing `GET /eligibility` (`portal.self-eligibility.v1`, FE-015/058/059) is **byte-identical**: the FE reader
is strict (`additionalProperties:false` plus a conformance test), so every extension is a new route/schema.

### 2a. Stage actions — `GET /api/v1/execution/governance/stage-action-eligibility[?workspace_id=]`

Schema `portal.stage-action-eligibility.v1` (OpenAPI `StageActionEligibility`, operation
`executionStageActionEligibilityV1`, fixture `packages/contracts/fixtures/governance-requester-reads.synthetic.valid.json`
`stage_action_eligibility.*`, 7 cases). Exactly **ten** actions in fixed order (FE-068 names "11" but lists ten):
`approval.create, sandbox.review_note, paper.exit_review_request, canary.{hold,reduce,rollback,request_scale},
live.{halt,reduce,emergency_close}`. These are **display identifiers, not capability names** and are never accepted as
authority. Per row: `verdict` (`ELIGIBLE | NOT_ELIGIBLE | NOT_COMMISSIONED`), `eligible`, `reason_class` (= `public_copy_key`),
`basis` (the rule the producing route enforces today), `step_up_required` (`false` | `null`), `step_up_state`
(`NOT_REQUIRED | NOT_DETERMINED`), `alpha_scope` (only `approval.create`). Top level: `session_step_up
{state ACTIVE|NOT_ACTIVE, valid_until_ms}` = this session's own step-up fact; `observed_at_ms` (Portal evaluation time, no lease).

What the server actually enforces today (read from the routes, not invented):

| Action | Route and rule | Reasons produced |
| --- | --- | --- |
| `approval.create` | `POST /governance/approvals`: workspace membership only (no role, no gate capability, no step-up) | `SUBMIT_CHECKS_REQUIRED`, `RETAINED_REVIEW_READ_ONLY` |
| `sandbox.review_note` | `…/sandbox/capture-note`: role `ADMIN` + membership (gate `PAPER_EXIT` is role-only) | + `ADMIN_ROLE_REQUIRED` |
| `paper.exit_review_request` | `…/paper-exit/create`: `ADMIN` + `governance.r2.read|decide` in scope + paper projection config | + `GOVERNANCE_CAPABILITY_REQUIRED`, `GOVERNANCE_SCOPE_MISMATCH`, `CAPTURE_PROJECTION_NOT_AUTHORIZED` |
| `canary.*`, `live.*` | **no Portal route exists**; no related capability is consulted (mapping `live.halt`→`safety.halt` or `governance.live.decide` would invent authority) | `COMMAND_FAMILY_NOT_COMMISSIONED`, verdict `NOT_COMMISSIONED`, `step_up_required:null` (never `false`) |

Reason order mirrors `GovernanceReviewCaptureService.capture()` (retained-review mutation refusal in `SessionGuard` first,
then role, then gate authority, then config). `RETAINED_REVIEW_READ_ONLY` is the precise "closed on this build" state, told
apart from "no grant" (`GOVERNANCE_*`) and "not enabled" (`COMMAND_FAMILY_NOT_COMMISSIONED`).
`ELIGIBLE` only means "the knowable preconditions did not refuse you"; run completeness, parent approval, versions,
projection freshness and idempotency are still checked at submit.

Finding for Codex/Bobby: the FE copy "Reviewers decide requests; they don't open them" has **no server rule behind it**:
`createApproval` checks membership only. The row says so (`basis: WORKSPACE_MEMBERSHIP`) instead of mapping a role name.
The Researcher field matrix is not touched (needs approval).

`grant_ref` (asked as optional) is **not published**: `OwnerAccessService.effectiveAccess` carries capability names and
scopes but no grant ids, and the R2/Paper-Exit authority is role + capability, not one grant row.

### 2b. Multi-resource + typed step-up — `GET /api/admin/profile-access/v2/eligibility/batch`

Schema `portal.self-eligibility-batch.v1` (`AccessEligibilityBatch`, operation `portalScopedAccessEligibilityBatchGetV1`,
fixture `execution-access.synthetic.valid.json` → `batch_cases`, kept apart from `cases` so the old exact type-set tests are untouched).
Query: `workspace_id`, `environment`, `resources` (1–8 unique `KIND:encodeURIComponent(id)` tokens, comma-separated,
canonical encoding only, so a comma in an id cannot split a token), `actions` (the existing 1–16 CSV). Each resource returns
exactly the v1 rows (same evaluator, reasons, target rules; an action unsupported by one resource is a typed per-resource
`ACTION_TARGET_UNSUPPORTED`, not a batch failure) plus `step_up_state`:
`NOT_REQUIRED` (rule false) / `PLAN_DEPENDENT` (rule null) / `REQUIRED` (rule true, no active session step-up) / `ACTIVE`.
`session_step_up` = `{state, valid_until_ms (≤ session ceiling), challenge{mechanism PASSWORD_REAUTH, route, precondition,
precondition_met}}`. No new auth mechanism. `precondition_met` reports exactly the precondition of the existing
`POST /step-up`: a current own `ALLOW access.grant|access.revoke` grant.

Finding for Codex/Bobby: a delegated user holding `capital.*` but no `access.grant|access.revoke` cannot pass the current
step-up route (it answers `ACCESS_DENIED`), yet capital mutations require a step-up. The batch now makes that visible
(`REQUIRED` + `precondition_met:false`) instead of leaving a dead button. I changed nothing about it.

## 3. FE-069

| Part | Result |
| --- | --- |
| Run list filter by alpha + cursor beyond 50 | **Already served**: `GET /api/v1/quantbt/runs` (`research.run-library.v1`) takes `alpha[]`, `status[]`, `cursor`/`before`, `limit≤50` and returns `page.{next_cursor,has_more,filtered_rows}` and an aggregate `filter_catalog.alphas` (≤200, whole workspace, not the first 50). No BE change; FE-only (below). |
| Alpha scope label | The server publishes the **create** route's scope: `approval.create` row `alpha_scope: WORKSPACE_ALL_COMPLETED_RUNS` (membership may request on any completed workspace run). A `YOUR ALPHAS` value is **never emitted** because no per-owner restriction exists on create; the FE phrase "ALL AUTHORIZED" is copy over `WORKSPACE_ALL_COMPLETED_RUNS`. A label on the run-list read itself is a Research-owner change (not mine). |
| Lookup by `request_key` | `GET /api/v1/execution/governance/approvals/request-lookup?request_key=[&workspace_id][&alpha_id&evidence_run_id&methodology_claim_id&summary]` → `governance.approval-request-lookup.v1`: `state NONE | FOUND | KEY_PAYLOAD_CONFLICT`, `payload_check NOT_COMPARED | MATCH | MISMATCH`, `result` = exactly the `governance.approval-create.v1` body a replay returns (`replayed:true`). Keyed by the **caller** (`findCreatedApproval(workspace, user.userId, key)`), so another actor's request, even with the same key, is indistinguishable from `NONE`. Payload fields are all-or-none; without them `FOUND` only says a request exists under the key. Same authority as the replay branch (session + membership, no gate capability). Writes nothing, refreshes no run. |

## 4. FE-062 / FE-063 (ELP2-07)

FE-063: `publishPendingControlStatus` now also sets `recipient_account_id` from the verified original intent
(`business_payload.recipient_kind === DEPLOYMENT_ACCOUNT ? recipient_account_id : null`), the same post-authority path
as `currency`; the authorization's `recipient` is already asserted equal to the intent (`assertPendingAuthorizationIdentity`).
Rule `resource.kind === DEPLOYMENT ⇔ recipient_account_id != null` in zod and JSON Schema. Stored/durable bytes unchanged.

FE-062: `GET /api/v1/execution/pending-recalls?workspace_id&resource_kind&resource_id&environment`
(`portal.execution.pending-recall-discovery.v1`, operation `executionPendingRecallDiscoveryV1`). Built from the Portal's
own `execution_pending_recall_commands` for the exact resource: per original recall, `original_recall_id`, `currency`,
`recipient_account_id`, last KNOWN `amounts` and the five exact CAS `versions` (`WAITING_ENCUMBRANCE`), or a pure unresolved
send as `UNKNOWN` with null economics; a terminal known outcome closes the recall; a newer unresolved command never erases an
accepted receipt (`unresolved_command_id`). Authority = the status read's (`prepareExact`, exact current audit.read + TS
correspondence **before** any private row, every row identity must equal the target, divergent currency/recipient for one recall
→ 503). Finite 100 + `truncated`. **Typed unavailable**: `coverage: PORTAL_CONTROLLED_RECALLS_ONLY` and
`untracked_recalls {NOT_PUBLISHED, RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED}`: a recall never controlled through the Portal has
no Portal record, and the capital-command row carries neither the 5 CAS counters nor a proven `control_receipt_id`
(only `business.revision`/`receipt_ref`), so first-control discovery needs a qualified PM source read (not mine, not available).
`GET` root added to `coreExecutionRead` (mutations stay refused by `SessionGuard`).

## 5. Files

Source: `execution-v2/{pending-control.contract,pending-control.service,pending-control.store,pending-control.controller,self-eligibility,access.service,access.controller}.ts`,
`execution/retained-read-profile.ts`, `governance/{stage-action-eligibility,stage-action-eligibility.service,approval-request-lookup}.ts` (new),
`governance/{governance.service,governance.controller}.ts`, `app.module.ts` (one provider).
Contracts: generators `generate-execution-pending-control.mjs`, `generate-execution-access.mjs`, **new** `generate-governance-requester-reads.mjs`;
regenerated `execution-pending-control|execution-access|execution-governance` OpenAPI + `.d.ts`; fixtures
`execution-pending-control-currency`, `execution-access` (`batch_cases`), new `governance-requester-reads.synthetic.valid.json`.
Shared files touched (minimal): `scripts/contracts-test.sh` (stages the 3 pure files + `auth/governance-access.ts` into the Docker cell), `packages/contracts/package.json` (+1 script `generate:governance-requester-reads`),
`tooling/verify-generated.sh` (+1 `--check` line), `retained-read-profile.ts` (+1 route), `app.module.ts` (+2 lines),
`governance.service.ts`/`governance.controller.ts` (additive methods/routes), `self-eligibility.ts` (additive exports only).
Not committed by design: `contracts-snapshot.json`, EDS-12/N29 ledgers, `registry`, route-inventory/capability-inventory ledgers (lead regenerates).

## 6. ELP2-07 families that are NOT mine — exact missing link

Source: [remaining-source-families-review.md](../ELP2-07/remaining-source-families-review.md) §1 table; nothing below was started.

| Family | Missing link (verbatim intent of the review) |
| --- | --- |
| ADMIN_LOCK / ADMIN_UNLOCK | full Portal family, exact app actions, result-trust; generic outcome reader has no lock receipt-proof coverage; HALT/RESUME is not an alias |
| REALLOCATE_BUDGET | result binding + approval + three-resource authority; existing outcome reader caps at 2 budgets, cannot carry a 3-budget composite; not recall+FUND |
| BIND / REVISE_BINDING | full family; `binding.change.propose` only proposes; no commissioned real binding authority/census/provider |
| MOVE_ASSIGNMENT / CANCEL_MOVE | dual-scope current rights, source financial proof; pending progress needs an explicit owning continuation |
| SET_LEVERAGE / MARGIN / POSITION / ACCOUNT mode | whole physical-profile transition: app physical authority, pre-send controller, native readback, post-COMMIT sender |
| LIFECYCLE / SET_TRADING_STATE / archive / monitor | state/admission/whole-census provider and app mapping; bound registry lifecycle unsupported |
| RETURN_CAPITAL / SET_RISK_LIMITS | source-owner prerequisite (persistent writer/receipt/reversal; no selected risk writer) |
| APPLY_PENDING / CANCEL_REMAINING | **exists** (Codex 5291a80f); FE-062/063 above add its read side. Provider still unqualified (OPEN_SOURCE_RUNTIME) |

## 7. FE reader change per field (do not edit FE here)

| Field / route | FE file | Change |
| --- | --- | --- |
| `recipient_account_id` on pending status | `v2/readers/commandCurrency.ts` (`readPendingControlStatusV1`, closed key list ~l.310/370) + `commandCurrency.conformance.test.ts` | accept the new required nullable key; refuse non-null for PORTFOLIO and null for DEPLOYMENT; show owning account in the pending dock (`screens/operations/OperationDock.tsx`) |
| `GET /pending-recalls` | new reader beside `commandCurrency.ts`; `OperationDock.tsx` | read on open of the pending dock for the exact resource; list `original_recall_id/currency/amounts/versions`; pre-fill `expected_versions` as a starting point only (preview rechecks); always render `untracked_recalls` as "recalls never controlled here are not listed"; `truncated` → "showing newest 100" |
| `stage-action-eligibility` | `v2/screens/stage/reasons.ts` (`noGrant/liveClosed/notEnabled`), `canary/Rail.tsx`, `live/parts.tsx`, `sandbox/ExitReviewPanel.tsx`, `workbench/ExitGatePanel.tsx`, `screens/request/*` | map `reason_class`: `GOVERNANCE_*`/`ADMIN_ROLE_REQUIRED` → no grant; `RETAINED_REVIEW_READ_ONLY` → closed on this build; `COMMAND_FAMILY_NOT_COMMISSIONED` → not enabled; keep D10 (no invented capability names); re-ask on mount/workspace switch/focus; never cache across sessions; `blocks/notPublished.tsx` FE-068 label can lose the `Not published` state for these ten |
| `eligibility/batch` | `v2/readers/accessSelf.ts` (+ `accessSelf.conformance.test.ts`) | add a second reader (new schema_version, closed keys, 1–8 resources, `resources` token encoding = `encodeURIComponent(id)` once more); consume `step_up_state` + `session_step_up` in `laneModel` stepUp instead of the `NOT_CHECKED` constants (v1 constants remain valid on the single route) |
| `approvals/request-lookup` | `screens/request/useNewRequest.ts`, `NewRequestForm.tsx`, `OutcomePanel.tsx` | on offline/uncertain outcome call the lookup with the same `request_key` (+ the four payload fields to get `MATCH`/`KEY_PAYLOAD_CONFLICT`), instead of "Check original request" opening the Inbox; `NONE` → safe to retry the same key and payload |
| run list | `screens/request/runSuggestions.ts` / `model.ts` | call `/api/v1/quantbt/runs?status=COMPLETED&alpha=<id>&limit=50[&cursor=]`; build the alpha picker from `filter_catalog.alphas`; follow `page.next_cursor` |

## 8. Tests and what was not run

| Gate | Result |
| --- | --- |
| `contracts` focused: `execution-pending-control` 30, `execution-access` 62 (incl. 4 new FE-068), `governance-requester-reads` 17 | PASS (local vitest) |
| `control-api` focused (unlocked, `--maxWorkers=3`): `pending-recall-discovery` 7, `stage-action-eligibility` 11, `approval-request-lookup` 9, `elp2-self-eligibility-batch` 11, plus unchanged `elp2-self-eligibility` 108, `-extra` 46, `elp2-access-policy` 69, `problem-code-vocabulary` 9 | 270/270 PASS |
| `tsc -p apps/control-api/tsconfig.build.json --noEmit` PASS (exit 0, run on the tree of f48a97c6 minus the ledger) |
| generator `--check` for pending-control, access, governance requester-reads | PASS |
| `scripts/contracts-test.sh` (Docker, wrapper) PASS 79 files / 1180 tests (second run; the first run failed only because the new pure files were not staged into the Docker cell, fixed in `scripts/contracts-test.sh`) |
| PostgreSQL-backed specs (`elp207-pending-control-transaction` expectations for `recipient_account_id` were edited; discovery/stage/lookup service paths) | **NOT_RUN** (no DB here) |
| `elp2-governance-reads.spec` 1 failure: `toHaveBeenCalledExactlyOnceWith` is not a matcher of the vitest 2.1.9 in the symlinked node_modules (environment, not caused by this change; 32 other tests pass) | ENV_ISSUE |
| Mounted HTTP, SessionGuard retained-review POST refusal for the three routes, browser | **NOT_RUN** |

## 9. Producer-receipt request to Codex

Please review and (when the hook window allows) run the ordinary R3 hook over the commits above. Specific questions:
1. Is `authority`'s read order for `paper.exit_review_request` (role → `governance.r2.read|decide` → projection config) the intended pre-click mirror of `capture()`, or should the row also surface `GOVERNANCE_R1_*` for `R2_CREATE` (not asked here)?
2. Confirm `original_recall_id` equals the PM `command_id` the pending-control intent carries; the Portal capital command row does not store it, hence no first-control discovery.
3. Decide whether the step-up route precondition (`access.grant|revoke`) is intended for capital actors; this contract now exposes it, it does not change it.
4. Registered ledgers that list routes (`upgrade/research_loop/evidence/P01/route-inventory.live.json`, `hifi_execution_loop/r2_ledger/capability-inventory.v1.json`, `contracts-snapshot.json`, EDS-12/N29) need the lead's regeneration for the four new routes.
