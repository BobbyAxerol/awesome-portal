# UXM-07 — Consumer receipt: BE-P5 (FE-062 / FE-063 / FE-068 / FE-069), 2026-10-20

Writer: Claude (FE writer, consumer side). Consumer receipt per Rules §10.12.4 for the producer delivery
[BE-P5](../BE-CLAUDE-2026-10-20/BE-P5.md) (branch `claude/be-gaps-2`, commits `6cd24760`, `de4ebb4c`, `a74f6456`, `f48a97c6`). This is the
consumer's record, **not an ACK of Bobby** (§10.3). `FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are **not edited here**: the
"ledger cells" in §7 are for Codex or the next round to paste.

## 0. Pin

| Item | Value |
| --- | --- |
| Producer | BE-P5 as above. Contract artifacts read: `execution-pending-control.openapi.json` (+ `.d.ts`, generator), `execution-governance.openapi.json` (`StageActionEligibility`, `ApprovalRequestLookup`), `execution-access.openapi.json` (`AccessEligibilityBatch`), `research-run-library.openapi.json`, fixtures `execution-pending-control-currency`, `governance-requester-reads`, `execution-access` (`batch_cases`) |
| Consumer | `claude/fe-parity` @ `7df531d3` + four commits of this writer (worktree branch, not pushed): FE-063 `0491c4fa`, FE-062 `7f060ff2`, FE-068 `a1dec388`, FE-069 `b478825a` |
| Lane | **FIXTURE_LAB** for every test below. No `BFF_DOUBLE`, no `REAL_READ_RETAINED`, no `REAL_READ_QUALIFIED`: the installed image does not serve the four new routes yet and BE-P5 itself says PostgreSQL / HTTP paths are `NOT_RUN` |
| Source access | none (source-dark, §10.12.2c); no SSH, no Docker, no visual, no hook |

## 1. Verdicts

| ID | Verdict | One line |
| --- | --- | --- |
| FE-063 | **ACCEPTED** (contract + reader, FIXTURE_LAB) | `recipient_account_id` required nullable, non-null exactly for DEPLOYMENT, read and enforced both ways |
| FE-062 | **ACCEPTED** (contract + reader + dock) with one consumer left open | discovery reader, port and the operation dock list; `expected_versions` pre-fill has no consumer yet (no pending-control form exists in the FE) |
| FE-068 | **ACCEPTED** (contract, both readers, ports) / **consumer wiring PARTIAL** | stage-action eligibility explains 9 of 10 actions (every one that has a V2 control); the batch reader is delivered but nothing renders it yet |
| FE-069 | **ACCEPTED** | request-key lookup in the uncertain outcome, server alpha scope label, run list filtered by alpha with cursor, bounded Load more |

No `CHANGES_REQUESTED` against the producer. Open points are FE-side (§5) and three findings for Codex (§6).

## 2. FE-063 — `recipient_account_id` (commit `0491c4fa`)

| Published | Consumed | Note |
| --- | --- | --- |
| `PendingControlStatus.recipient_account_id` (required, `string \| null`) | 1/1 | read with the PM text rule; `null` stays `null` (never `""`) |
| rule `resource.kind = DEPLOYMENT <=> recipient_account_id != null` (JSON Schema + zod) | enforced in the reader and re-tested against the schema | reader refuses both wrong pairings; never repairs a side |
| fixture `deployment_cancelled` (9th status) | read, schema-valid | the key list in L0 now has 9 statuses |
| pre-upgrade body without the key | refused by schema (`$.recipient_account_id: required`) and reader | |

Tests: `commandCurrency.test` 87, `commandCurrency.conformance` 5739 (was 52 + 10 red). Where it is shown: the pending-control **status** has no
screen in the FE today (`readPendingControlStatusV1` is a reader plus tests), so the owning account is displayed through the discovery (§3).

## 3. FE-062 — pending recall discovery (commit `7f060ff2`)

| Published | Consumed | Note |
| --- | --- | --- |
| `schema_version`, `family`, `coverage`, `untracked_recalls{availability,reason_code}`, `resource`, `environment`, `items`, `truncated`, `observed_at_ms` | 9/9 | coverage and `untracked_recalls` held as constants a screen cannot turn into a census |
| per item: `original_recall_id`, `currency`, `recipient_account_id`, `state`, `amounts`, `versions`, `latest_receipt_id`, `last_known_command_id`, `unresolved_command_id`, `last_operation`, `updated_at_ms` | 11/11 | |
| the five CAS counters | printed as exact strings, exactly as published, only for a WAITING recall | never `Number` |
| UNKNOWN recall | amounts, versions and receipt are `null`; the dock says "Outcome unknown ... no amounts and no versions to show" | never zero |
| `truncated` | printed ("Showing the newest N. More open recalls matched") | |
| runtime rules (unique `original_recall_id`, ≤ 100, amount partition, WAITING shape, DEPLOYMENT <=> account) | enforced; stricter than the schema where the schema cannot say it | a violation voids the read |

Dock (`OperationDock` → `PendingRecallsSection`): for a PORTFOLIO or DEPLOYMENT row, one read on open for the exact resource and environment of the
row; ACCOUNT rows ask nothing. It always prints "Only recalls the Portal itself controlled are listed. Recalls not started through the Portal cannot be
discovered here" and "Not published: RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED"; an empty list reads "No open recall that the Portal controlled on this
target", never "no open recall". A failed, unreadable or other-resource answer shows no list and says so. The section has no button: it sends nothing.

Not consumed (intentional): `expected_versions` **pre-fill**. BE-P5 §7 asks for it, but there is no pending-control preview form in the FE to pre-fill, and
inventing one is outside this slice. The counters are on screen so a reader can see them; the next preview rechecks them regardless.

## 4. FE-068 — advisory eligibility (commit `a1dec388`)

### 4.1 `portal.stage-action-eligibility.v1` (consumed 100%)

Published 7 top-level keys + 9 row keys; consumed 16/16. The ten actions in the fixed order, one fixed basis / step-up / alpha scope / verdict set per
action, `public_copy_key = reason_class`, verdict x `eligible` x reason, session step-up (`ACTIVE` needs an end after the evaluation clock).
`stage_action` is held as a display identifier, never as a capability name (FE-037 stays provisional).

| Action | Where it reads | Result today |
| --- | --- | --- |
| `canary.hold / reduce / rollback / request_scale` | canary `DecisionPanel` | "Not offered in the portal yet · Basis: none published · Step-up: not determined"; still disabled |
| `live.halt / reduce / emergency_close` | live `ProtectiveLadder` | same text; still disabled |
| `sandbox.review_note` | sandbox `ReviewNoteForm`, only in its shut branch | refusing verdict -> the stage dictionary sentence + basis + step-up; an ELIGIBLE verdict leaves the capability read's sentence unchanged |
| `approval.create` | New request (closed submit by policy; a note beside an open submit) | refusing verdict replaces the policy sentence; never opens or closes the gate |
| `paper.exit_review_request` | **no V2 control to attach it to** | reader + text function ready; the workbench exit gate only links to the exit reviews, and the cockpit rail's "Create exit review" is driven by the capture-capability read. Not wired (§5) |

Rules kept: eligibility explains, never enables (`stageActionReason` returns text; an ELIGIBLE row and a missing/failed/other-workspace read return the
control's own fallback unchanged); re-asked on mount, workspace switch and focus; single-flight; late answers dropped; nothing cached across sessions.

### 4.2 `portal.self-eligibility-batch.v1` (reader + port only)

Published 9 top-level keys, `results[1..8]` x (`resource`, `actions[1..16]`), row = v1 row + `step_up_state`; consumed 100% **by the reader**. The v1 row
reader is reused verbatim (`readEligibilityRow`, exported), `accessSelf.ts` otherwise unchanged. Enforced beyond the schema: unique resources, the same
action order for every resource, `step_up_state` follows `step_up_required` and the session fact, session step-up never ends after the session ceiling.
`session_step_up.challenge.precondition_met` is read and kept (see §6.1). URL builder produces the canonical `KIND:encodeURIComponent(id)` tokens.

**Not consumed**: BE-P5 §7 asks `laneModel` (cockpit) to take `step_up_state` / `session_step_up` instead of the `NOT_CHECKED` constants. Nothing renders the
batch yet; the v1 constants remain valid on the single route. Owner: the cockpit lane slice (not in this writer's brief).

## 5. FE-069 — request lookup, alpha scope, run list (commit `b478825a`)

| Published | Consumed | Note |
| --- | --- | --- |
| `governance.approval-request-lookup.v1`: `state NONE / FOUND / KEY_PAYLOAD_CONFLICT`, `payload_check NOT_COMPARED / MATCH / MISMATCH`, `result` | 6/6 | state x payload_check x result enforced; the `result` is read through the same reader a replay uses (closed envelope + `readApprovalCreated` + a required `status`) |
| payload fields (`alpha_id`, `evidence_run_id`, `methodology_claim_id`, `summary`) | sent as the four stored fields, all or none | so the answer can say MATCH / MISMATCH |
| `approval.create.alpha_scope = WORKSPACE_ALL_COMPLETED_RUNS` | printed "All completed runs in this workspace" (needs Bobby's copy approval, brief-given) | nothing printed when the eligibility read published none; `YOUR ALPHAS` is never produced |
| `research.run-library.v1`: `alpha[]`, `status[]`, `cursor`, `limit`, `page.{next_cursor,has_more,filtered_rows}`, `filter_catalog.alphas` | 7/7 used | `status=COMPLETED&alpha=<id>&limit=50[&cursor=]`; picker = `filter_catalog.alphas`; Load more follows `next_cursor` of the same filter |

What the reader says: NONE "No request exists under this key... retrying with the same key and the same fields creates it" (the only state that makes a
same-key retry a first send); FOUND + MATCH "The request was created. The fields stored on the server are the ones in this form"; FOUND + NOT_COMPARED "The
fields were not compared... only says a request exists, not that it is this one"; CONFLICT "exists under this key, but with different fields... Retrying with
the same key is refused". FOUND shows the same facts a replay would, plus Open request. A failed lookup says it is still unknown.

Write-safety rules kept and re-tested: no Enter submit, no form-level submit, an uncertain outcome locks the payload, the retry is the same key with the
stored payload, a new send or discard clears the earlier check, the lookup is single-flight and never settles, retries or discards by itself.

Run list: bounded (50 per page, at most 10 pages, then "500 runs are loaded. Type the run id below for older ones" on a disabled button that states its
reason), single-flight, a cursor is only used with the filter it came from, a half-typed alpha id never starts a read, an unreadable body is "unavailable"
(never half a list). A body without a catalog (an older double) derives the picker from the loaded runs and says so. `runSuggestions.ts` (shared with V1) is
untouched; the V2 form uses the new `v2/screens/request/runLibrary.ts`.

## 6. Findings for Codex

### 6.1 A capital actor without `access.grant|revoke` cannot pass step-up (the dead button), not worked around

- **Reproduction**: (1) sign in as a delegated user whose own effective grants include `capital.top_up` (or any `capital.*` that needs step-up) and **no**
  `access.grant` / `access.revoke`; (2) `GET /api/admin/profile-access/v2/eligibility/batch?...&actions=capital.top_up` -> the row is
  `ALLOWED`, `step_up_required: true`, `step_up_state: REQUIRED`, and `session_step_up.challenge.precondition_met: false`; (3) `POST /api/admin/profile-access/v2/step-up`
  answers `ACCESS_DENIED`; (4) the capital mutation therefore can never be authorised for this actor. (From BE-P5 §2b; **not reproduced here**, NOT_RUN, no runtime.)
- **Expected behaviour**: either the step-up route's precondition is the capital actor's own (a user who may do a capital action may also re-authenticate for
  it), or the capital row is `UNAVAILABLE` with a typed reason instead of `ALLOWED` plus a step-up that cannot succeed.
- **Proposal** (Codex decides): decouple the step-up precondition from `access.grant|revoke`: "the caller holds any current own ALLOW whose rule is
  `step_up_required: true`" (the batch already computes exactly that set). Until then the FE does **not** work around it: the batch reader keeps
  `precondition_met` as published and no screen shows a step-up button because of it. No FE code makes up a step-up path.

### 6.2 The two sources for the sandbox note can disagree

`ReviewNoteForm` is gated by the existing `review-capture-capabilities` read (`SANDBOX_NOTE`); `stage-action-eligibility` carries `sandbox.review_note` for
the same fact. The FE keeps the capability read as the gate and uses the eligibility only for the words when the note is shut. If the two ever
disagree, the capability read wins and the words may read "eligible" nowhere. Suggest one of them is declared the source of truth in the contract notes.

### 6.3 Copy / contract nits

- `StageActionEligibilityRow` description says "false for the three live routes (they demand none)"; the three rows are `approval.create`,
  `sandbox.review_note`, `paper.exit_review_request`, not live. Wording only.
- `ADMIN_ROLE_REQUIRED` is shown with the stage dictionary's "Needs the approver grant" (BE-P5 §7 mapping); a role is not a grant. **Copy for Bobby**: keep, or a
  fourth sentence "Needs the Admin role". The basis is already shown beside it ("Basis: Admin role").
- The brief names 11 stage actions; the contract has 10 (BE-P5 §2a). The FE holds exactly the 10.
- Codex questions of BE-P5 §9: Q1 and Q3 are not FE questions; Q2 (`original_recall_id` = PM `command_id`): the FE shows the id as PM text and never joins it to a Portal command id.

## 7. Tests and gates (no Docker, no visual, no hook)

| Gate | Result | Lane |
| --- | --- | --- |
| `vitest run src/execution/v2/readers/commandCurrency` | 5826 pass (was 62 red) | FIXTURE_LAB |
| `disabledReason.test`, `v2Hygiene.test`, `productBoundary.test`, `readers/accessSelf*` | green (2915 with `stage`) | FIXTURE_LAB |
| new readers: `pendingRecallDiscovery.conformance` 939, `stageActionEligibility.conformance` 266, `accessSelfBatch.conformance` 294, `approvalRequestLookup.conformance` 143 | pass; schema is the oracle, the reader is never looser than the schema | FIXTURE_LAB |
| screens: `operations` (+ `pendingRecalls` 18) 141, `stage` 26, `request` 305 (lookup 16, eligibility 6, runLibrary 29) | pass | FIXTURE_LAB |
| `tsc --noEmit -p .` | exit 0, no line | |
| `vitest run src/execution/v2 src/app --maxWorkers=2` (after the four commits) | 157 of 161 files green; 57783 pass, 5 expected-fail, 3 skipped, **133 red, all outside this change** (next row) | FIXTURE_LAB |
| pre-existing red, not from this change | `readers/managerDataset.conformance` 108 and `managerDataset.test` 17 (the Manager readers, FE-A's files); `canary/readCanary.conformance` 3 and `sandbox/readSandbox.conformance` 5 (FE-C's files: the testkit checker lacks the schema keyword `dependentRequired`, `v2/testkit/schema.ts`, which this writer did not edit). `realtimeProducerConsumer` was not among them | |
| NOT_RUN | Playwright V2, visual pinned image, hook R2/R3, `BFF_DOUBLE` (the e2e double does not serve the four routes yet; owner: lead/next FE round), `REAL_READ_RETAINED`, `REAL_READ_QUALIFIED` (owner: Codex, the installed image does not serve them) | |

Verification tier: R1 for each commit (focused vitest + tsc), `R2 pending` for all four.

## 8. Remaining (owner, closing condition)

1. `paper.exit_review_request`: attach the verdict to the real control when the Paper exit request control exists in V2 (owner: the slice that adds it; closes when that control reads `stageActionReason`).
2. Batch consumption in the cockpit `laneModel` (`step_up_state`, `session_step_up`) and the step-up copy (owner: cockpit slice; closes with a screen test on `REQUIRED` / `ACTIVE` / `PLAN_DEPENDENT`). Needs Bobby on the dead-button copy after §6.1.
3. `expected_versions` pre-fill from the discovery (owner: the pending-control form, not yet in the FE).
4. `BFF_DOUBLE` for the four routes and a browser pass on the dock, the uncertain outcome and Load more (owner: lead; Playwright V2 + `e2e/bffDoubleV2`).
5. Copy needing Bobby: "All completed runs in this workspace", "Not offered in the portal yet", the lookup sentences in §5, "Needs the approver grant" for `ADMIN_ROLE_REQUIRED`.

Ledger cells proposed (Codex or next round pastes; not edited here): `FE-063 | DELIVERED -> consumer ACCEPTED 2026-10-20 (reader 0491c4fa) | FE-062 | DELIVERED -> consumer ACCEPTED (dock; pre-fill open) 7f060ff2 | FE-068 | DELIVERED -> consumer ACCEPTED (readers/ports), screens PARTIAL a1dec388 | FE-069 | DELIVERED -> consumer ACCEPTED`.

## 9. Rollback

Per commit, `git revert`: FE-069 (lookup, `runLibrary.ts`, form changes), FE-068 (readers, provider, four leaf edits, the route wrap), FE-062 (reader, dock section, port), FE-063
(reader key). Every read fails closed: a revert leaves the screens on today's generic reasons and the V1 run list.
