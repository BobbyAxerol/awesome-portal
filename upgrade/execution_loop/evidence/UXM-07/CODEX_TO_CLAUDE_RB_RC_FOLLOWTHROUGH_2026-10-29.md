# Codex → Claude: R-B / R-C follow-through, 29 October

## Status and handoff

This packet is on candidate `fix/uxm07-ra-variant-20261029`, based on Claude slice `2a2a2d5a4`. It is **not** a landing or full-gate receipt. R-A source and the R-B browser spec remain uncommitted in the candidate worktree. The canonical Research branch and Claude's frozen checkpoint were not changed. Do not use an older frozen tree as proof that these edits landed.

**R-B remains OPEN: browser fixture exercised, same-snapshot evidence not established.** The current join checks workspace, approval, gate, subject, environment, deployment and version; a matching version across two HTTP reads does not prove that they share a database snapshot. In the current Live parent transaction the root reads `evidence_complete`, but does not return the queue's `blocker_count` or `blocker_summary`. Those fields are not authorized in the existing `LIVE_ROOT` parent-field purpose. Do not silently widen that existing purpose or interpret version equality as snapshot identity.

**R-C remains OPEN: fixture contract/reader only; no screen consumer and no qualified source.** The existing V1 schema explicitly fixes `runtime_active` to false. The reader's URL currently carries deployment, window and intent, but no explicit workspace; do not activate it against a multi-workspace source without designing and testing the workspace/access boundary. Existing `stage-equity` alone does not prove deployment identity, approved band lineage, or an authorized source for this route.

## R-B: fixture browser evidence and remaining implementation

Candidate browser test: `apps/portal/frontend/e2e/execution-v2-rb-fixture.spec.ts`, using the existing synthetic governance and parent fixtures. Command from `apps/portal/frontend`: `./node_modules/.bin/playwright test -c playwright.ra-fixture.config.ts execution-v2-rb-fixture.spec.ts` against a local Vite fixture build with cockpit enabled.

* Initial four join cases (matching / mismatching approval version, 1280 / 660) passed 4/4. With two independently denied endpoint cases added, the next run passed 5/6: the mismatch case at 1280 timed out before `Evidence incomplete` appeared; both denial cases passed. A further run passed the first two matching cases, again timed out at the 1280 mismatch after 15 seconds, passed mismatch at 660 and inbox denial; the gate-denial case was interrupted while waiting for its 403 response. This is a reproducibility/route-loading issue to investigate, **not a clean final browser PASS**. Preserve full Playwright output and request traces; do not merely suppress the assertion or mask the timing.
* Fixture requests independently enforce the requested workspace in the positive cases. Denial is simulated, not a live authorization or revoke receipt. No shared snapshot, real API, or final visual acceptance has been demonstrated.
* Review why the cockpit or direct gate route occasionally does not reach the asserted state / request. Ensure the negative test waits for the corresponding actual responses and final UI state before asserting absence; cover wrong workspace and denial for each endpoint independently.

Proposed backend route to closure, to be reviewed and implemented by Claude if Codex does not land it first:

1. Define an explicit, scoped, optional blocker-read capability/purpose and typed absence rather than widening `LIVE_ROOT` or inventing facts. Check policy, caps, workspace, principal, gate and sensitivity of summary. Preserve existing sealed-field compatibility.
2. Retrieve blocker count/summary together with the gate/approval inside one authorized `REPEATABLE READ` transaction, or use a separately designed authoritative snapshot token with equivalent DB-enforced guarantees. Include relevant fields in the revision/final authorization fence; test concurrent queue/approval mutation, mismatch, missing fields and refusal.
3. Update schema/OpenAPI and generated types, fixtures and consumer binding together. The browser must read only the authorized snapshot, render generic absence when unavailable, and test both positive and negative paths. Add a real or isolated-DB receipt demonstrating the actual same snapshot; fixture joining alone is insufficient.

## R-C: source and consumer work

1. Through Edge, establish an authorized, retained per-deployment equity series with workspace, currency, timestamp semantics, revision/lineage, missing/gap handling and retention; establish the approved Research band and its reference/digest separately. Missing band or source must be typed absence, not fabricated values. Confirm drawdown derivation and population with source authority.
2. Design a source-backed contract/version and implement authorized bounded producer and reader. Preserve V1's fixture-only meaning; validate workspace, permissions, maximum points, cursor/window and denial. Include source revision and independent availability for series and approved band. Do not turn `runtime_active` on in the synthetic V1 schema as a shortcut.
3. Claude owns the UI: connect the existing approved chart components for the applicable Live/Paper/Canary and Alpha 360 contexts to the fixture port first and then the qualified API, preserving visual design and clearly distinguishing fixture runs from real-source verification. Test populated, missing, unauthorized, mismatch and long-series views. Do not present illustrative bands as approved live bands.

## Integration / next action

Claude can start the browser-race investigation and R-C fixture consumers immediately. Backend snapshot/producer work can be implemented independently, but the actual R-C connected receipt needs qualified Edge inputs. Codex/Claude should reconcile against the latest SHA, run focused tests and one normal final hook before landing. No deployment, remote push, command/Live activation or production source mutation was performed here.
