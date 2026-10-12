# Governance cross-loop — Claude consumer receipt (FE-GOV-01…04)

2026-10-12 · lane `claude/fe-parity` on top of `cde4ddae` (backend §57). Read first: [handoff](./GOVERNANCE_CROSS_LOOP_CLAUDE_HANDOFF_2026-10-12.md) and
[backend receipt](./GOVERNANCE_CROSS_LOOP_REPAIR_2026-10-12.md) @cde4ddae; generated `execution-governance.d.ts` + the labelled synthetic fixture
`governance-review-context.synthetic.valid.json` (loaded by the tests, not copied). No backend, migration, capability, profile, Edge/SSE/command or release change.

## What the screens do now

| Id | Behaviour | Where |
|---|---|---|
| FE-GOV-01 R1 | The plan carries the **same read's** workspace, approval, version and exact unique evidence hashes (`decision_context`). `AVAILABLE` ∩ the server's per-verb eligibility; null/over-bound pins = closed with a reason, never `[]`. Older reads: only a COMPLETE verified manifest (every entry a valid sha256, count equal) supplies hashes, else closed + "reload". Typed conditions travel with approve-with-condition **and request-changes** (the latter needs ≥ 1; the button says so). Request key includes the pins. | `api/governanceContext.ts`, `api/rows.ts`, `api/httpApi.ts`, `containers.tsx`, `GateR1Review.tsx` |
| FE-GOV-01 Paper Exit | Pins the exit read's `lineage[].digest` (unique, sorted); a REQUIRED entry with no digest (or unreadable `required` bit) = no plan, with the reason. Own contract, own command type; no R1 context attached. | `rows.ts`, `containers.tsx` |
| FE-GOV-02 R2/Live | No `decide` exists in the R2 or Live container: every verb (Deny and Request changes included) is closed with "R2/Live decisions are not commissioned yet — viewing or capturing grants no execution", from the typed BLOCKED context **and** for historical responses claiming eligibility. Nothing is ever planned. | `containers.tsx`, `GateR2Review.tsx`, `GateLiveReview.tsx` |
| FE-GOV-03 | `CaptureNextStep` on R1 (`R2_CREATE`) and R2 (`PAPER_EXIT_CREATE`) built from `capture_context`: exact parent id/version, projection digest, candidate tuple kept together (deployment + portfolio + risk grant + currency), ≤ 50 choices with a "bounded list" note, request key per opened form. Currency is shown when recorded, otherwise an explicit validated reviewer entry (never defaulted); a tuple with no risk grant cannot be captured as R2. BLOCKED/absent/invalid/retained = a typed reason and **no form**. The result links to the Portal review screen with `workspace_id` (not the raw API path). Wording: records a Portal review, never approves a gate. | `components/CaptureNextStep.tsx`, `ReviewCapture.tsx`, `containers.tsx` |
| FE-GOV-04 | R2→R1 `href` accepted only as the bounded same-origin R1 path with at most `workspace_id` (a legacy href gets the read's own workspace; hostile/extra-query/other-workspace = unlinked). Containers re-read on a workspace change and the route remounts them by `approval|workspace`; Paper Exit reads with `workspace_id`. Gate track = **position only** (the other dots are neutral); the stepper ticks only a RECORDED reference (a release candidate id; an R1 reference whose state is APPROVED). §56 source links / claim selector unchanged. | `governanceContext.ts`, `ExecutionPreviewRoute.tsx`, `gateFrame.tsx` |

## Evidence (real vs fixture, separately)

- **Unit/component (fixture + published synthetic):** 37 new tests (`governanceCrossLoop.test.tsx`) — boundary refusals (duplicate/malformed/over-bound hashes, wrong command, R2 with a command, capture bounds/currency/dupes), binding matrix, backlink validator, plan/apply bodies and call arguments, R2/Live never plan, capture POST bodies, blocked/retained states, workspace re-read, wire bodies of the R1 and Paper Exit plans. Frontend `src/execution`: 124 files / 2082 tests pass; `tsc -b` clean.
- **Browser, research preview (real stack, retained, no approvals exist) at 1280 and 660:** R1, R2, Live and Exit routes with `?workspace_id=research-workspace` — the API call carries that workspace and the URL keeps it across reload; 0 horizontal overflow; 0 page errors; 0 cross-origin requests; **0 API requests in 20 s idle** (no stream/poll). The browser logs 4 "Failed to load resource 404" lines — the typed answers for the probe ids that do not exist, not script errors. `/execution/_fixtures` renders the three next-step states (2 blocked, 1 available).
- **Not observed (needs an authorized source-backed cell / real approval):** a real R1 plan/apply with non-empty evidence by an independent reviewer; a positive `capture_context`; `409 GOVERNANCE_DECISION_GATE_MISMATCH`; revoked-grant 403 on a capture retry. The shared retained preview has no approval or capture candidate, and no flag was flipped or row inserted to make one (as the handoff requires). The preview control-api is the §56 build, not a build of `cde4ddae`.

## Discrepancy to confirm with Codex (CG-GOV-01)

The **Paper Exit read does not publish the complete evidence-hash set** its plan compares against (`snapshot.evidence[].sha256` in `paper-exit.service.ts`); it publishes `evidence_set_hash`, finding `evidence_hash` and `lineage[].digest`. The handoff says to pin lineage digests, which is what is sent — but unless the lineage digests equal that set, the plan returns `EVIDENCE_HASH_MISMATCH` (typed, shown, no apply). Request: add `decision_context` (or `evidence_hashes`) to the Paper Exit read exactly like R1's.

## Rollback

Revert the commit; the screens return to posting `[]` hashes and the R1 command for R2 (the defects this fixes). No schema, flag or data change.
