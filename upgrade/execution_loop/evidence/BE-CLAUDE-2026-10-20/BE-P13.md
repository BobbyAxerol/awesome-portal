# BE-P13 — Commands/workflows contract package: F0 apply truth, idempotency, typed absences, catalogue alignment, remaining-family gaps (Claude, 2026-10-20)

Owner Claude (backend writer; Bobby assigned ALL remaining backend on 2026-10-20, Codex reviews). Base `be6d98d1` (tip of `claude/fe-parity`, contains BE-P1..P10 and the FE consumers).
Tier **R3, focused gates only**; ordinary hook **NOT_RUN** (`git -c core.hooksPath=/dev/null`). This is CONTRACT + VALIDATOR + FIXTURE + TYPED-ABSENCE work on the portal side. **No command is
enabled or sent anywhere**: no Live, no relay activation, no source side effect, no provider call, no source/HK/SSH/credential/runtime/Docker access, no DB mutation, no container restart, no FE edit,
nothing written under `/home/bobby/portal-research`, no edit of `UNIFIED_IMPLEMENTATION_PLAN.md` / `FRONTEND_BACKEND_SYNC.md`. `contracts-snapshot.json` and the EDS-12/N29 ledgers are NOT committed
(the lead regenerates; `snapshot.py` now tracks the new fixtures). Nothing here is installed or connected: **FIXTURE_VERIFIED (pure), PG/HTTP NOT_RUN**.

## LOUD: what this package ADDED beyond contract artifacts

| Kind | What | Where | Ledger row |
| --- | --- | --- | --- |
| **HTTP route** | `GET /api/v1/execution/operations/f0/{operation_id}/apply-attempts/{request_key}?workspace_id=` (read-only, private no-store) | `operations/f0-read.controller.ts` | `capability-inventory.v1.json` (+1 row, `route_count` 259 -> 260) |
| **Migration** | `1723680000146_execution-f0-apply-attempts.sql`: ONE new append-only table `execution_f0_apply_attempts` (PK workspace+actor+key; CHECKs make "sent"/"retryable" unrepresentable; UPDATE/DELETE trigger-forbidden). Additive, Down drops it. **Number clash risk:** BE-P7 §"B" also names `...146` as the next free number if its `proof_family` column option is chosen; whoever lands second renumbers (trivial, no content dependency). | `apps/control-api/migrations/` | `persistence-ownership.v1.json` (+1 row) |
| Request body change | `execution.command-apply-request.v1` now REQUIRES `request_key` (no FE caller sends F0 apply today; the story uses a fake port). A keyless body is a typed 400 `INVALID_EXECUTION_COMMAND_APPLY`. | `contracts.ts`, `governance.controller.ts` | n/a |
| Wire fields added | `cost_impact` + `current_primitive` on the F0 plan; `cost_impact` on CommandPreview; `source_rejection` + `venue_fill` on every CommandStatus projection; `CommandSubmitResult` (= status + `replayed`) as the submit 200 | see tasks | n/a |

## Commits (one logical commit per concern, private worktree branch `worktree-agent-a1605e65d79e5945f`, none pushed)

1. `3c653cc6` task 5 — catalogue schema/service/fixture alignment.
2. `b8792631` tasks 1+2 — F0 apply DENIED-only truth, request_key, replay, conflict, lookup route, migration 146.
3. `f7e9343e` tasks 3+4 — typed absences on CommandStatus, submit replay marker, cost/impact on plan and preview.
4. (the commit containing this file) task 6 — this ledger (docs).

## Task 1 — can F0 apply ever succeed? **No.** Published exactly that.

Evidence from code, not from a doc: `ExecutionOperationsService.apply(...)` is typed `Promise<never>`; after the creator-scoped plan lookup (404 if absent) it records an audit event and throws
`COMMAND_RELAY_DISABLED` 409. Every F0 plan row is `status = 'BLOCKED'`, `relay_capability = 'DISABLED'`, `source_side_effect_requested = false` by **table CHECKs**
(`1723680000006_execution-operations-f0.sql`), the plan table is trigger-immutable, and `apply_token` is a schema constant `null`. There is no flag, state or branch from which a 2xx, ACCEPTED, SUCCEEDED
or source request is reachable. (The `@HttpCode(202)` on the route belongs to the Paper-Exit / Governance apply schemas that share the URL; F0 never reaches it.)

Published truth:
* OpenAPI `applyExecutionCommandF0` has **no 2xx**; responses are 400/401/403/404/409 only. `409` is a `oneOf` of `F0ApplyDeniedProblem` and `F0ApplyKeyConflictProblem`.
* **Wire discrepancy fixed in the contract (found, not caused):** the old `RelayDenied` schema/fixture (`schema_version: execution.command-relay-decision.v1`, `decision: DENIED`, ...) was **never the 409 body**.
  The shared error filter sends `{ error:{code,message}, request_id, details:{...} }`. The contract now publishes that exact envelope; `details` carries the six `RelayDenied` fields unchanged plus
  `request_key` and `replayed` (`F0ApplyDecision`). `RelayDenied` stays as the lookup's `relay_decision` (FOUND) and as a pinned fixture.
* No success fixture exists; `be-p13-f0-apply.spec.ts` and `packages/contracts/test/execution-f0-apply.spec.ts` assert: only 4xx responses, no `ACCEPTED|SUCCEEDED|APPLIED|apply_token|"status"` in any apply fixture,
  the set of apply fixtures is exactly the six listed below, and the denial cannot be widened (`retry_allowed:true`, `source_request_sent:true`, `decision:"ACCEPTED"` all fail schema AND runtime parser).
* A success shape appears only when a family WITH its own authority exists (coordinator + source outcome + held-COMMIT), under a different request schema; never by widening this one.

## Task 2 — idempotency of F0 apply: key, replay, conflict, lookup after response loss

Convention: the neighbours (plan, acknowledge, resolve, incident) put `request_key` in the **body** with grammar `^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$`; apply joins them (the capital family uses the
`x-portal-idempotency-key` header because its key lives inside the PM business payload).
* **Same key + same operation** -> the same typed 409 with `details.replayed: true`; one stored attempt (`execution_f0_apply_attempts`, PK workspace+actor+key; the first use wins and is never updated).
* **Same key + a different operation of the same actor** -> `409 REQUEST_KEY_PAYLOAD_CONFLICT` (`details:{request_key, source_request_sent:false}`), nothing recorded, the other operation NOT named, audit `CONFLICT`.
* **Keyed by the actor:** the plan lookup and the attempt predicate carry the session actor; another user's plan is a 404 and the same key text is independent.
* **Lookup after response loss** — chose the *smaller* of {extend `GET /operations/f0/{id}` | new read route}: extending the 12-field strict F0 detail reader would change a pinned, strictly-consumed body;
  a new GET with a 3-way answer is additive. `GET .../f0/{operation_id}/apply-attempts/{request_key}` answers `NONE | FOUND | CONFLICT` (`F0ApplyAttemptLookup`).
  **Authorize before data:** the caller names the operation; its exact ACCOUNT/PORTFOLIO/DEPLOYMENT target needs current TS-accepted `audit.read` (full DENY/delegation graph) BEFORE the attempt row is read,
  and again after the last await; a revoked reader learns nothing, **not even NONE** (no existence oracle). CONFLICT never names the other operation.
  Limit, same as the existing F0 reader: the lookup can only authorize ACCOUNT / PORTFOLIO / DEPLOYMENT targets (`f0ReadTarget`); for a plan on BROKER_BINDING / ORDER / SYSTEM it answers 404 (apply itself still replays and conflicts correctly).
* **CommandStatus replay marker:** the F0 apply has no `CommandStatus`; for the capital family the existing field could not say "this call did not send". New schema `CommandSubmitResult` = `CommandStatus` +
  `replayed: boolean`, the 200 of `executionCapitalCommandSubmitV1` only (true for a known idempotency key or a concurrent identical submit that did not send; false for the originating call). GET status,
  reconcile, collection and workflow bodies never carry it.
* Fixtures: `execution-command-apply-denied` (first), `...-denied.replayed` (REPLAYED), `...-key-conflict`, `execution-command-apply-attempt.none|found|conflict`; capital: `submit_first` / `submit_replayed`.

## Task 3 — source rejection reason and venue partial quantities: typed absence, because the code can produce nothing else

`sourceCommandResult` (the only thing a source can hand back) has **no rejection-reason field and no fill-quantity field**; `commandBusiness` has `state/receipt_ref/source_event_ref/revision/amounts`; the
venue vocabulary is `NOT_APPLICABLE|UNKNOWN|PENDING|ACKNOWLEDGED|FILLED|REJECTED` (no PARTIALLY_FILLED). So the closed vocabulary is derived from what is stored, never guessed:
* `source_rejection`: `{state:"NOT_APPLICABLE", reason:null}` or `{state:"NOT_PUBLISHED", reason:"SOURCE_RESULT_HAS_NO_REJECTION_REASON"}` (NOT_PUBLISHED exactly when `business.state = REJECTED` or `amounts.rejected` is nonzero).
* `venue_fill`: `{state:"NOT_APPLICABLE", reason:null, quantities:null}` iff venue is `NOT_APPLICABLE`, else `{state:"NOT_PUBLISHED", reason:"SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities:null}` (FILLED included).
* **No PUBLISHED branch exists**, deliberately: the shape of a venue quantity is a source fact. The slot is `quantities: null`; widening it is a *versioned* schema change after PM/Edge publish quantities (source request FE-032 stands).
* Both are projection-time derivations (`publicStatusFacets`, `toPublicCommandStatus`); the stored status grammar is untouched. Quantities as "exact decimal strings" will reuse `unsignedDecimal` when a source publishes them.

## Task 4 — plan cost/impact (FE-020): typed absence on the F0 plan and on CommandPreview

No plan or preview carries a cost, fee or impact value, so none is published and the client never computes one: `cost_impact: {state:"NOT_PUBLISHED", reason:"NO_COST_OR_IMPACT_SOURCE"}`
(`CostImpactAbsence`, one shared definition). F0 plan: `executionCommandPlanResponse` (new pure parser `f0-plan.contract.ts`) now validates the service's own output.
**Found while doing this:** the served F0 plan always carried `current_primitive` (null, or the N16B emergency-close object) but the schema, canonical fixture and strict reader did not list it, so
**the real 201 body was not schema-valid** (the FE's 17-key strict plan reader would reject a live plan). Published now (`current_primitive`), with a second canonical fixture for the one command that carries it
(`execution-command-plan.emergency-close.valid.json`), and a spec asserts the service's output keys equal both fixtures'.

## Task 5 — catalogue: extend schema to what is served (the smaller safe option), fix the one dead branch in the service

Real divergence was bigger than reported: besides `classification` and `PARTIAL`, `n16bCatalogueEntry` makes `ops/emergency-close` serve `source_route_state: CURRENT_PRIMITIVE_CONFIRMED`,
`blocked_reason: N16B_RUNTIME_ACTIVATION_PENDING` and five extra keys (`current_primitive_state`, `current_capability_id`, `accepted_environments`, `accepted_target_types`, `runtime_active`), none in the schema
(`additionalProperties:false`, enums closed), so the whole served body failed the published schema.
* Recommended/implemented: **extend the schema** (fixing the service would delete accepted N16B behaviour and its separate gate). New enum members + conditional extras (only with `CURRENT_PRIMITIVE_CONFIRMED`),
  `classification.state` without `CONNECTED`, new `ServedCommandCatalogue` requiring `classification` on every entry (the route's 200).
* **`PARTIAL`:** the service branch `any CONNECTED -> PARTIAL` was unreachable (every entry is `portal_reachable:false`) and contradicted the schema constant `DISABLED`. Removed (always `DISABLED`); a CONNECTED
  classification now throws `503 COMMAND_CATALOGUE_SENDABLE_CLAIM` instead of publishing a sendable claim. A transport activation = `catalogue_revision 3`, not a widened constant.
* **The pinned extract fixture `execution-command-catalog.valid.json` is byte-identical on purpose:** the N16B acceptance record (`execution-protective-path.current-emergency-close.accepted.json`,
  `immutable_bindings.command_catalog_sha256`, checked by `execution-n16b-current-protective-test.sh`) pins its sha256; changing it would silently re-pin an accepted record. The served form is a **new canonical
  fixture** `execution-command-catalog.served.valid.json`, produced by the same function the service applies (generator `servedEntry`), and `be-p13-catalogue.spec.ts` compares the live service output with it entry by entry.

## FE reader changes required (NOT done: FE files are not mine; every change is a closed-key addition)

FE tests that load these canonical fixtures (`commandCurrency*`, `commandOperation.conformance`, workflow/collection readers, `command.test`/`storyData`) will fail until the readers are taught. Per field:

| Field / shape | Where it appears | Reader change |
| --- | --- | --- |
| `request_key` in the F0 apply request | `execution.command-apply-request.v1` | Only if/when F0 apply is wired; the story fake port should send it. |
| 409 F0 apply body | `execution-command-apply-denied(.replayed)`, `...-key-conflict` | New strict reader `readF0ApplyDenied`: keys `error{code,message}`, `request_id`, `details` (8 keys: the six RelayDenied + `request_key`, `replayed`); constants `retry_allowed:false`, `source_request_sent:false`. Legacy `commandPlan.ts#readRelayDenial` reads `source_request_sent` at the TOP level, where the wire has no such key, so today it reports "a request had already reached the Trading System" for a denial that sent nothing (safe direction, wrong copy): read `details`. |
| lookup | `execution-command-apply-attempt.none|found|conflict` | New reader `readF0ApplyAttemptLookupV1` (3 closed variants); `screens/command/lookup.ts` can offer "query by key" when UNKNOWN and an operation id is known. |
| `current_primitive`, `cost_impact` | F0 plan (`readCommandPlanV1`) | `PLAN_KEYS` 17 -> 19: `current_primitive` = `null` or exactly the 5-key N16B object; `cost_impact` = `{state:"NOT_PUBLISHED",reason:"NO_COST_OR_IMPACT_SOURCE"}`. |
| `cost_impact` | CommandPreview (`preview_blocked`, `preview_allowed`) | Add to the preview reader; PlanPanel's "Not published (FE-020)" text comes from the field, not a constant. |
| `source_rejection`, `venue_fill` | every CommandStatus (GET, reconcile, collection items, workflow.status, submit) | Add both as required closed unions; FacetList's "Fill quantity and partial fills: Not published (FE-032)" becomes the server's `venue_fill`. |
| `replayed` | `CommandSubmitResult` only (submit 200) | Submit receipt reader reads the bit (REPLAYED no longer inferred from "id already shown"); status reads must still REJECT it. |
| Catalogue | `readers/commandCatalogue.ts` | Load `execution-command-catalog.served.valid.json` (the extract stays pinned). Add `CURRENT_PRIMITIVE_CONFIRMED` to `source_route_state`, `N16B_RUNTIME_ACTIVATION_PENDING` to `blocked_reason` (only beside it), the five optional N16B extras (only with it; `http_method/path` are null there), require `classification` on every entry; `classification.state` has no `CONNECTED` (the `sendable_claim` rule stays as defence in depth); `capability_state` stays the constant `DISABLED`. The ops/emergency-close entry is the only one that exercises the new branch. |

## Tests: actual vs NOT_RUN

Actual (all PASS in this lane): control-api pure specs `be-p13-catalogue` (7), `be-p13-f0-apply` (22), `be-p13-status-facets` (9); control-api regression `elp207-command`, `elp207-command-transaction`, `elp208-*`,
`elp204-command-collection`, `elp204-operation-parent` (PG-backed ones skip); contracts workspace `vitest run` (87 files) + `execution-f0-apply.spec` (new) + extended `execution-trusted-commands.spec`;
`node tooling/execution-operation-reader.mjs --check`, `generate-execution-command-catalog.mjs --check`, trusted/workflows/scoped-realtime `--check`, generated `.d.ts` regenerated through the repo generators;
`tsc -p tsconfig.build.json --noEmit` exit 0. `scripts/contracts-test.sh` run ONCE on the final bytes (Docker via the wrapper, `/tmp/portal-heavy.lock`): "Contracts workspace tests passed", exit 0.
**NOT_RUN:** PostgreSQL (migration 146, `recordApplyAttempt`/`findApplyAttempt` SQL, the updated PG assertions in `execution-operations.spec` / `elp207-command-transaction.spec`, mounted HTTP of the lookup route);
the FE vitest/e2e/visual suites; normal R3 hook; `snapshot.py --check` (snapshot not regenerated by design).

## Owner decisions / questions

1. **Migration number 146** (see LOUD table) — confirm who owns it relative to BE-P7 option B.
2. **Re-pin vs served-fixture split for the catalogue**: I kept the N16B-pinned extract immutable and added a served fixture. If the owner prefers ONE canonical catalogue fixture, the N16B acceptance record's `command_catalog_sha256` must be consciously re-pinned (and the N17B/N29 chain refreshed).
3. `request_key` is REQUIRED on F0 apply (a 400 for old clients). Acceptable because F0 apply has never succeeded and no FE caller exists; say so if you want it optional-with-default instead.
4. Venue quantities / source rejection reasons need a **PM/Edge** publication (FE-032 source request): which source field, which vocabulary. Until then they are typed absences by design.

## Task 6 — remaining families: the exact missing link (no implementation of any family without its authority)

Landed source-dark and OUT of this table: REGISTER_INSTANCE (migration 143, `instance-registration.*`), APPLY_PENDING + CANCEL_REMAINING (migration 144, `pending-control.*`), the eight capital operations
(`command.*`). Note: the generated workflow coverage inventory still labels APPLY_PENDING / CANCEL_REMAINING / REGISTER_INSTANCE `EXACT_ACTION_CATALOGUE_PENDING` / `SOURCE_ADAPTER_PENDING`
(`execution-workflow-fixtures.mjs`); that inventory is stale against the code and should be refreshed by its owner when those families are re-qualified (not changed here: it would imply a commissioning claim I cannot make).
Source facts are from `ELP2-07/remaining-source-families-review.md` (SOURCE_ONLY, PM `59ea9aa`/`39aaa9c`, 2026-10-18) and must be **repinned before any implementation** (handoff rule). Edge command-activation matrix: 0 qualified runtime operations.

| Family | Coordinator (Portal) | Authority (app actions / current rights) | Outcome (authenticated result) | Commissioning | Source qualification | THE exact missing link |
| --- | --- | --- | --- | --- | --- | --- |
| ADMIN_LOCK / ADMIN_UNLOCK | None. Only the candidate codec `pm-control-adapter.ts`; no store/DTO/routes/trust | No lock/unlock actions in `access.contract.ts`; `safety.resume` must not be borrowed; source caps BUDGET (lock) vs UNLOCK (unlock) | PM lock writer returns a real receipt/event but passes **no immutable `receipt_evidence`** (`lock_reallocation_repository.py:84`); generic full-outcome reader has no lock coverage | No operation x environment qualified; provider default-unqualified | PM must add source-owned exact lock/budget evidence + verification | **Source outcome evidence for locks** (PM change), then exact app actions, then a family coordinator. Not aliasable to HALT/RESUME. |
| REALLOCATE_BUDGET | None (codec `pm-reallocation-adapter.ts` only) | No action; needs current authority on **three** targets (parent, source, destination) and an approved R2 composite permit; 7 CAS keys | Existing capital full-outcome proof is capped at 2 budgets; reallocation needs the 3 budget revisions + both RETURN/REGRANT legs | Not commissioned | PM writer exists (atomic parent/source/target); result binding/approval for 3 resources absent | **3-budget outcome contract** + approval binding + three-resource authority. Not aliasable to recall + FUND (handoff rule). |
| BIND / REVISE_BINDING | None | `binding.change.propose` is **proposal-only**; no reviewed apply action | PM binding metadata writer returns a receipt; Portal has no trusted result path | Not commissioned; REVISE_BINDING is credential-rotation only | Real binding authority/census/provider absent; native rebind is separate PM/controller work (not in the dispatch) | **Reviewed apply action + trusted result** for a metadata-only family; native rebind is a different, unstarted source feature. |
| MOVE_ASSIGNMENT / CANCEL_MOVE | None | `deployment.assignment.propose` cannot be promoted; needs apply/cancel on **both** old and new portfolios before any private detail | Seven-key census (positions, orders, reservations, unknown, locks, pending_recall, fees) + three independent MoveProofs receipts; progress needs an owning continuation, not GET/resend | Not commissioned | Financial proof provider must bind receipt contents (settlements count is not the fees census) | **Dual-scope authority + continuation service authority + financial proof provider**; no automatic cancel/liquidation/unlock. |
| Physical-profile transitions (leverage / margin / position / account mode) | Codec + presenter only (`pm-profile-adapter.ts`, `profile-adapter.contract.ts`); no dispatch orchestration | Four separate physical-profile capabilities in PM; no Portal action / physical-scope mapping for the whole affected set | PM presenter returns CURRENT refs, not immutable native proof; PREPARE/reconcile is not closure | Needs simulator/native readback, post-COMMIT sender, topology fencing | Affected-set owner (incl. other writers), current pre-send fence, model/backing/risk revalidation | **Native readback + post-COMMIT sender + whole-wallet affected-set owner**; exposing PREPARE/reconcile alone is not the family. |
| Lifecycle / archive / monitor | `workflow` presentation only; no executor for ARCHIVE / CREATE_PAPER_MONITOR / REACTIVATE | Exist: `deployment.register`, `safety.halt/reducing/resume`; **missing:** archive, monitor, reactivate, create-portfolio, paper-clone | PM `SET_TRADING_STATE` writer exists (APPLIED has `execution_authorized=false`); bound registry lifecycle explicitly unsupported | Provider/certification absent; Paper clone / create-Portfolio / native rebind have **no management dispatch** in scanned source | ARCHIVE needs zero budget + 8-key census (incl. active_children, fees) and an actual child/lock check; ACTIVE needs fresh risk-clear proof | **Actual state/admission/census provider + exact app mapping**; archive/monitor have no source dispatch at all. |
| RETURN_CAPITAL | None | `capital.return_capital` IS in the action vocabulary (so authority naming is not the gap) | PM parser/status knows RETURN; **no persistent writer, no dispatch branch, no VERSION_KEYS entry; the capital-command SQL CHECK excludes RETURN** | None possible | Source-owned economic claim/reducer/posting/receipt, free-cash and backing integration absent | **A PM economic writer.** Portal must not simulate (no negative FUND, no recall alias, no synthetic event, no second ledger). |
| SET_RISK_LIMITS | None | No action | No selected management writer | None possible | Capability/design only | **A selected PM writer and an apply contract.** |

Common to every row (the handoff's per-family checklist): current-human + separate economic authority, scope/target/env, expected version (CAS), original immutable intent, durable intake before I/O, authenticated result,
same-key recovery, audit. The two landed families (pending-control, registration) are the structural pattern to copy once a row's "missing link" is closed; copying the pattern first would only create a source-dark shell that cannot be qualified.

## Backend next / frontend next / source request

* Backend next: none of the rows above is implementable without its first missing link; the next executable Portal-side work is the FE-facing refresh of the stale workflow coverage inventory once Codex confirms which families count as landed, and a PG run of migration 146 in an approved disposable cell.
* Frontend next: teach the readers per the table above, switch the catalogue lane to the served fixture, wire `request_key` into the fake port and a real HTTP port when assigned.
* Source requests (PM/Edge, unchanged IDs): FE-032 (rejection reason and venue quantities field/vocabulary), lock `receipt_evidence`, 3-budget outcome proof, RETURN writer, SET_RISK_LIMITS writer, archive/monitor dispatch.
