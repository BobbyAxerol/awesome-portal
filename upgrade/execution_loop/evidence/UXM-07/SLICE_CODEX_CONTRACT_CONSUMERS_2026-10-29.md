# Slice: consumers for Codex's two answers to hand-back 2 (29 Oct 2026)

Branch `claude/slice-codex-consumers`, based on the frozen candidate `claude/step-b-integrate` (hook-verified `9054bd410`; docs after it only), plus two Codex commits cherry-picked unchanged in meaning: `9188297ba` (approval inbox `subject_type`, now `feefca6b3` here) and `9d5b9ced9` (FE-069 negative vectors, now `15b7ad775`). The frozen branch is untouched; this slice is separate so Codex can take it together with, or after, its landing.

## What it does

1. **Approval inbox `subject_type`** (`APPROVAL_INBOX_SUBJECT_TYPE_2026-10-28.md`): `readInboxRowV2` validates the optional enum `ALPHA_VERSION | DEPLOYMENT | EXIT_REVIEW`; absent (older server) is a valid row with no type; any other value, null, lower case or non-string refuses the row. The queue context line prints the kind in words ("alpha version av_grid22") next to the id. It is a hint, not a link: Codex's note says the target must be resolved through its own authorized relation, and none is published for the row, so no link is made and nothing is inferred from the gate, label or id. Tests: 4 new cases in `inboxRowV2.test.ts` (35 pass).
2. **FE-069 negative vectors** (`FE069_CATALOGUE_NEGATIVE_FIXTURE_2026-10-28.md`): the catalogue reader refuses all six published cases whole (unknown authority, limit above cap, unexpected field, missing cursor for more, cursor when no more, duplicate alpha id), never as an empty page, and the `schema_rejects` flag each case carries is true against the schema (three cross-field cases are schema-valid on purpose). Tests: `runLibraryAlphaCatalogue.conformance.test.ts` 62 pass (was 55).

## Checks run on this slice, and not run

Run: the two test files above; cockpit, readers, `src/execution/api`, `src/fixtureBff` (2,095 tests) and the hygiene tests (disabledReason, v2Hygiene, titleAbsence, productBoundary) with 12 files / 924 tests green; `tsc --noEmit`: no error outside `features/roadmap-task-board` (that tree has no dependencies linked in this worktree); N29 and EDS-12 refresh: unchanged.
Not run: the full vitest, the full hook, V2 pixel baselines and a browser journey. The queue line changes one text segment of the cockpit cell, so the V2 cockpit baseline may need one re-record; the normal hook on the final integrated tree is Codex's gate. Old closed-schema consumers outside the V2 reader were not searched beyond the typed readers.

## Open after this slice

Linking the row to its subject needs a published authorized relation per kind (Codex's note: do not assume `ALPHA_VERSION` is an Alpha 360 id; do not invent a deployment id from an exit review). Until it is published the row stays text.

## Update 29 Oct, after Codex's answer `CODEX_TO_CLAUDE_FOUR_REQUESTS_2026-10-29.md` (`9b8d4ed2c`)

Branch tip `44859cd78` (three slices cherry-picked from `claude/slice-rb`, `-ra`, `-rc`); the frozen candidate is untouched.

- **R-B, guarded blocker join** (`bae574591`): the Live evidence frame prints the selected inbox row's blocker line only when ALL hold: row id equals the live-parent `approval_id`, a workspace was requested and equals the gate body's workspace, row gate `LIVE_GATE`, row environment `LIVE`, row `subject_type` `DEPLOYMENT`, row `subject_id` equals the gate's `deployment_id`, equal `approval_version` (now a validated optional field of the inbox row reader), non-blank summary, and the inbox read is current. Any miss keeps the generic "Evidence incomplete" and is never read as zero blockers. Limits: the row publishes no workspace of its own, so "same workspace" is the workspace the page asked both reads for; with no workspace named the join stays closed; no end-to-end test through `DecisionCockpit`. Tests: 20 pure-join, 7 rendered-frame, 1 reader.
- **R-C, fixture-only equity projection** (`44859cd78`): fixture route from the world graph (one book line, drawdown = value/running max - 1, retired deployments end at their exit, 5,000-point cap, illustrative band joined to a fixture run id and digest with warning `FIXTURE_ILLUSTRATIVE_BAND`), port method and strict closed reader (`runtime_active` and `source_side_effect_requested` constant false), 58 reader conformance tests over the published valid fixture and its negatives, 11 route tests over every world deployment, ties W200-W203, reader-guard group W125. No screen is wired; the real route stays source-dark and real screens keep typed absence. Receipt: `EQUITY_PROJECTION_FIXTURE_RECEIPT_2026-10-29.md`.
- **R-A, declared variant views, fixture context only** (`eda23c349`): `e2e/bffWorldVariants.ts` declares which variant views exist per stage and their base deployment; the suffix-stripping code is gone (an undeclared look-alike id such as `dep_x_dark` no longer resolves; one old test expectation changed for that reason and says so). No member was added to any production payload; the mapping is used inside the fixture adapter and published by the fixture-only read route `GET /__fixture/variants` labelled `DECLARED_FIXTURE_GRAPH_NOT_A_PRODUCTION_RELATIONSHIP_NOT_AN_AUTHORIZATION_RULE`. 15 tests, tie W210.
- **R-D:** accepted by Codex as not reproduced; nothing changed.

Checks on the merged slice: `tsc` no error outside `features/roadmap-task-board` (dependency noise of the worktree); 122 test files, 68,999 tests passed (fixtureBff, cockpit, readers, api); N29 and EDS-12 refresh unchanged. Not run: the full vitest, the full hook, V2 baselines (the cockpit evidence line and the queue context line may need one re-record), a browser journey.

## Follow-through, 29 Oct (branch `claude/slice-followthrough`, answers `CODEX_TO_CLAUDE_RB_RC_FOLLOWTHROUGH_2026-10-29.md`)

Based on the consumer slice `2a2a2d5a4` plus Codex's staged R-A source and R-B browser spec adopted unchanged in meaning (`02cc16b91`). The frozen candidate `claude/step-b-integrate` is untouched.

- **R-B browser flake: environment, not a product race.** In every failing trace no `/api/v1/execution` request was made: 15-83 lazy route chunks were aborted with `net::ERR_NETWORK_CHANGED` (the host has Docker bridges/veth created and removed by other work; the netlink events themselves were not captured). The earlier join spec passed 8 of 10, then 9 of 10 with waits.
- **R-B backend, one authorized snapshot** (`LIVE_BLOCKERS` purpose; design `RB_BLOCKER_SNAPSHOT_DESIGN_2026-10-29.md`, receipt `RB_BLOCKER_SNAPSHOT_RECEIPT_2026-10-29.md`): the optional `blockers` block of the Live parent body is read in the gate's own `REPEATABLE READ READ ONLY` transaction; `LIVE_ROOT` stays byte-for-byte unchanged (cap 31 to 32 seals, one new purpose digest); states: key omitted (not authorized), AVAILABLE (`SAME_READ_SNAPSHOT_AS_APPROVAL`, count 0 means null summary), ABSENT with a reason code; never truncated, never zero. Finding: migration 142 makes the blocker columns immutable after capture, so the real hazard was pairing them with a gate body of another lifecycle moment; the real-DB test commits a concurrent status/version change right after the root statement and shows the read stays consistent. The cockpit reads the blocker line only from that block; the cross-read inbox join and its props are removed with no fallback. Decision for Codex: a typed marker instead of omitting the key when not authorized would be a contract choice (omitting was chosen to keep the old body byte-identical). A policy owner must still install a `LIVE_BLOCKERS` seal and the matching `audit.read` grant for any real workspace; until then real bodies omit the block and the cockpit shows the generic "Evidence incomplete".
- **R-B browser spec, snapshot model** (`959f8d35e`, `cf867a276`): 11 cases at 1280 and 660, 10 of 10 consecutive runs, 220 traces without a network fault, trace sha256 in `rb-browser-2026-10-29/`. It exposed and fixed a product defect: a well-formed V2 parent body of another workspace or request was shown under the page's workspace; the reader now refuses it (`GOVERNANCE_PARENT_ANSWERS_ANOTHER_WORKSPACE`, `..._REQUEST`).
- **R-C consumers, fixture lane** (`EQUITY_PROJECTION_CONSUMERS_RECEIPT_2026-10-29.md`): `workspace_id` on the reader URL (fixture route denies by workspace), the existing `ChartTools`/`EquityPanel` show the fixture projection on the Live room, Canary room, Paper workbench and Alpha 360 Performance tab (one deployment only), labelled "Fixture projection" with the band named "Illustrative band (fixture), not an approved band"; real route 404/501 keeps today's typed absence; 39 screen tests. No pixel baseline was re-recorded; the Live, Canary and Paper workbench cells would differ if run on the fixture BFF.
- **R-C source contract V2 and dark producer** (`EQUITY_PROJECTION_SOURCE_CONTRACT_DESIGN_2026-10-29.md`, `EQUITY_PROJECTION_SOURCE_RECEIPT_2026-10-29.md`): sibling route `GET /api/v1/execution/deployments/{id}/equity-projection/source`, schema `execution.analytics.equity-projection.source.v2`, explicit workspace and environment, hard 5,000 limit, series and band as independent AVAILABLE/ABSENT sections with closed reason vocabularies, each with its own lineage; drawdown derivation stated (`confirmed_by_source` only with EDGE_QUALIFIED authority); producer behind a port whose only implementation is `SOURCE_NOT_COMMISSIONED` (no I/O), exact `audit.read` leaf authorization, 404 without an existence oracle, route unmounted unless `equityProjectionSource === "SOURCE_DARK"`. V1 is untouched and still fixture-only. Decision for Codex: no `EQUITY_SERIES`/`EQUITY_BAND` field purposes were added (6 seals, cap 32 to 38; belongs to the commissioning slice). The connected receipt needs the Edge/Research-qualified inputs of the design note; no screen is wired to V2.

Checks on the merged follow-through branch: PostgreSQL test cell `elp204-positive-parent.spec.ts` 345 of 345 (317 existing plus 28 new R-B/R-C cases); contracts 113 files, 1,918 tests, also through `scripts/contracts-test.sh`; `snapshot.py --check` 716 files; control-api `tsc` build exit 0; frontend `tsc` no error outside `features/roadmap-task-board`; 174 test files, 72,015 tests (fixtureBff, cockpit, readers, api, live, canary, workbench, alpha, series); N29 and EDS-12 refresh unchanged. Not run: the full vitest, the full pre-commit hook, V2 pixel baselines, `verify-generated.sh` as a script, any connected-source acceptance.

## Review follow-up merged, 29 Oct (tip `53593ff4f` on `claude/slice-followthrough`)

Codex's CHANGES_REQUESTED items were done in three isolated lanes and merged by cherry-pick (no conflicts): `a19b5e19d` request-key-bound state derived in render for the equity projection and the three sibling hooks (R-C 1); `86540d476` fixture-lane browser acceptance of the V1 projection on four screens; `da2d627db`, `bb378c24c` V2 interval/coverage/source_rows invariants and the fail-closed field-authority guard (R-C 2-3); `308c09940` direct mid-flight `LIVE_BLOCKERS` grant revocation and seal expiry (R-B follow-up); `2ee7e5e38`, `1ba563e08` test repairs; `75ac51712` receipt.

Checks on the merged tree: control-api `tsc` clean; frontend `tsc` has 96 errors, all under `features/roadmap-task-board` (no `node_modules` in this worktree), none elsewhere; `snapshot.py --check` 716 files; N29 then EDS-12 `--check` current, `runtime_effect: NONE`; vitest on `screens/series`, `readers`, `fixtureBff`: 106 files / 67,866 tests passed, 0 errors. The Postgres cell (354/354) was run by the backend lane on its own branch, not re-run after the merge.

One defect found during the merge: `keyedAnswer.test.tsx` passed a fresh `{}` port every render, so the request key changed every render and the worker ran out of heap (`53593ff4f`, test-only, assertions unchanged). Product code is unaffected: the port comes from context and is stable.

Not run on this branch: full vitest, full hook, V2 pixel baselines (workbench-paper, live and canary will differ on the fixture BFF), `verify-generated.sh`. Fixture lane only: no real source, no field authority.

## research-portal handoff receipt, 30 Oct (REAL_API, current image)

Scope (Bobby, 2026-10-30): QuantBT backtest loop ↔ Execution V2 gate handoff, fixture lane switched off for the window only.
Window: `preview.sh fixture off` + `up portal-web` (≈11:08Z) → `fixture on` + `up portal-web` (≈11:10Z). `control-api`
(Up 3 days) and `portal-fixture-bff` untouched; `portal-web` recreated twice on the same image `sha256:0ce9b1aebf30…`
(stack commit `7946cd3d5`, not the 7d314d7be tip; no rebuild).

Proven with the real session (`claude-preview`, ADMIN; session revoked, logout 201):
- `GET /research/release-candidates/rc_06GGABY3…/publication` → DELIVERED, approval `apr_06GGAC00…` R1, href carries `workspace_id`.
- `GET /execution/governance/approvals/apr_06GGAC00…/r1` → same approval; `evidence_hashes` equals the publication's `legacy_artifact_sha256`; payload names the RC id and the run id.
- Browser: RC page link → `/governance/approvals/<id>/r1?workspace_id=…` mounts the Execution router and renders the R1 row (Quorum 0 of 1). 3 page loads total.

Not proven / open:
- R2 handoff: no R2 approval exists in this data; the only R1 is EXPIRED (2026-10-07). Not manufactured, per runbook.
- Two 404s on the R1 page against the deployed Control API: `/api/v1/execution/runtime-manifest` and `/governance/approvals/<id>/evidence`. Cause not established (controller exists in the repo for the first; the deployed image predates the tip). Needs a rebuild at the tip or Codex's mount flags before judging.
- `delivery_profile: "fixture"` appears on the real Control API's governance responses; its meaning was not confirmed.
- R1 `approval.release_candidate` is `null` although the publication points at it; the RC id appears elsewhere in the payload.
- Fixture lane returned to ON; the fixture BFF image does not yet contain R-B/R-C routes (rebuild at the tip is a separate step).

## research-portal rollout at tip + handoff scenario, 30 Oct (FIXTURE_LAB; not acceptance)

Rollout (Bobby-approved scope: `portal-web` + `portal-fixture-bff` only): built at `97f8fa212`, then
`preview.sh up portal-web portal-fixture-bff`. Images: web `0ce9b1aebf30` → `99583ec4ee92`, fixture BFF
`51023368d8ae` → `41d9d0ae9ede`. `control-api` untouched (Up 3 days). Rollback: retag
`local/portal-research-preview-{portal-web,fixture-bff}:pre-20261030-1152` as `:rf02`, then `up portal-web portal-fixture-bff`.
The approved HMD reader wheel (sha256 `3b2a41b8…`, identical in two checkouts) was copied into this worktree's ignored `vendor/hmd-reader/`.

Backend (deabe3d73): `GET /api/v1/execution/governance/approvals/:id/evidence`, dark (`approvalEvidence: "SOURCE_DARK"`),
unmounted by default, typed absence, deny-all field authority. Not deployed (control-api not rebuilt), so the real Control API still answers 404.
Unproven: Postgres/Docker tests, `AppModule` DI with the flag on, HTTP call. Contract follow-ups: withheld section maps to `null`;
problem codes vs the contract's two-value enum; the OpenAPI text "CONTRACT ONLY" and the test pinning it become stale once mounted.

Fixture (97f8fa212, register 2h): scenario `handoff` serves apr_TEST_ONLY_r1_{pending,approved,expired}, apr_TEST_ONLY_r2, apr_TEST_ONLY_r2_satellite
with one consistent RC/hash/as_of chain and the four evidence cases. Probed on the deployed lane (HTTP 200 on every read, statuses APPROVED/PENDING/EXPIRED
as designed); scenario then restored to `positive`. These rows are reachable by URL only (not in the inbox).
Observed, not explained: `GET /api/v1/research/release-candidates/…/publication` through the fixture lane answered 401, not the documented 404 refusal.

Verified: vitest fixtureBff + productBoundary + r2Ledger + analytics 1027 passed (57 files); control-api `approval-evidence.spec` 24/24.
Not run: Playwright and visual suites, a browser walk of the `handoff` rows, R2 on the real API (needs a real RC through R1).

## Open items resolved by probe and code, 31 Oct (REAL_API window 05:23Z to 05:24Z)

Window: `preview.sh fixture off` + `up portal-web`, then `fixture on` + `up portal-web`. `control-api` (Up 4 days) untouched. Real session `claude-preview`, workspace `ws_06G19F61YB8CFR7TEWMS7HQ660`.

- `GET /execution/runtime-manifest` (with and without `workspace_id`): 404 `EXECUTION_READ_NOT_AVAILABLE`, a typed refusal from the scoped manifest service (`scoped-runtime-manifest.service.ts` lines 47, 116, 139, 143), not a missing route. Which branch fires was not isolated. The fixture lane serves a positive manifest, so the two lanes differ here by design.
- `GET /execution/retained-review`: **200** on the real stack. The 404 on the fixture lane is the fixture BFF's documented double (`routeTable.ts` line 88, `UDB_RETAINED_REVIEW_NOT_CONFIGURED`). Pre-existing, not a regression.
- `GET /execution/governance/approvals/<id>/evidence` on the real stack: 404 `REQUEST_REJECTED`, the generic response of an unmounted route, as expected while `approvalEvidence` is not passed by any bootstrap.
- Research routes via the fixture lane: 401 `SESSION_REQUIRED`. The overlay has no location for `/api/v1/research/*`, so they reach the real Control API without a real session. ROUTES.md corrected.
- `delivery_profile: "fixture"`: a literal in `operations/workflow.service.ts` and `incident.service.ts` beside `source_integration_state: "UNAVAILABLE"`; it labels Portal-owned records with no source, not the lane.
- Evidence route over Postgres + HTTP: `elp204-positive-parent.spec.ts` 355 of 355. With the real governance visibility the route refuses first (503 `ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED`, no section in the body); with visibility granted it answers the typed no-source body.

Still open: R2 on the real API (needs a new RC through R1 by the real process); wiring `approvalEvidence: "SOURCE_DARK"` into a bootstrap and rebuilding `control-api` (not done; custody risk, and the route would only answer 503 until scoped governance is commissioned).

## Fresh RC through the real process, 31 Oct (REAL_API, fixture off 06:10Z to 06:14Z)

By Bobby's instruction (31 Oct: run every step to the end). Session `claude-preview`, personal workspace (the explicit `workspace_id` of the projection workspace is a 404 for this user on the Research reads). `control-api` untouched.

- Run `rrun_97c8ed4483b411213c21714be0aeb510` (delta-rsi-polynomial-alpha 1.0.1, trial 182): the only blocker was `P21_RESEARCHER_DECLARATIONS_REQUIRED`. Draft `rcd_06GS14NMX40MPTPQ8842VVBHA4` patched with two declarations that assert no research conclusion and state "not for deployment or capital; handoff exercise" (text is in the draft).
- Seal: 201, `rc_06GS14NNVE4AE8968M63F9W983`, pack digest `4d4459a4…8258`.
- Publish: the only eligible methodology claim was system-derived (`claim:sha256:dfdc483a…`), so no judgment was needed. Result DELIVERED; **R1 `apr_06GS14RF790VB67JAFWPZRTFH5` is PENDING** (created 06:08Z, SLA 1 Nov, expires 3 Nov).
- `GET …/governance/approvals/apr_06GS14RF…/r1`: 200; the body contains the run id, the RC id and `legacy_artifact_sha256` `19d35709…a8fe` (same as the publication).

Not done, on purpose: the R1 decision. It is the owner's gate. R2 follows only after R1 is APPROVED and a real projection exists; R2 on the real API therefore stays unproven until then.

## R1 decision attempt, 31 Oct: structurally refused on this stack

- The public auto-login of research-portal is `claude-preview`, the requester of the new R1, so the page shows `SELF_APPROVAL` / `separation_of_duties: VIOLATION` to anyone using the public host.
- `bobby` (the portal owner, `portal_owner_anchor`) could not see the approval: it lives in `ws_06GCVTHWC9WVPGEPR85AB15K82`, where `bobby` was not a member (`WORKSPACE_NOT_FOUND`). On Bobby's instruction `bobby` was added as MEMBER of that workspace on the preview DB (one `workspace_members` row; the ELP2-10 guard advanced `elp210_candidate.authority.revision` 90 → 91; it reads 96 after later logins, so the counter moves with ordinary activity). With that, `bobby` reads the R1 with `eligibility.can_approve: true`, `separation_of_duties: OK`.
- `POST /api/v1/execution/commands/plans` as `bobby` then returned 403. Cause: `session.guard.ts` line 98 to 99, the retained-review profile (`EXECUTION_READ_PROFILE=retained_review_v1`) refuses every non-GET under `/api/v1/execution` with `UDB_RETAINED_REVIEW_MUTATION_DISABLED`. This is the design of the C7 retained-review container, not an identity or permission problem.
- Consequence: **no R1 can be decided on research-portal while this container serves it**. R1 `apr_06GS14RF790VB67JAFWPZRTFH5` stays PENDING (expires 3 Nov). R2 on the real API cannot be accepted on this stack; it needs a stack whose Control API has Execution mutations enabled. R2 stays fixture-only (register section 2h).
- The membership row for `bobby` is left in place (removing it would advance the authority counter again). Remove with `DELETE FROM workspace_members WHERE workspace_id='ws_06GCVTHWC9WVPGEPR85AB15K82' AND user_id='usr_5a38d5dfb08b44748f5776fbe04a1434'` if unwanted.
- Full pre-commit hook on `1c6a13e1c` (detached worktree): exit 0 at 07:05Z.
