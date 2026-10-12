# Governance cross-loop — backend repair and acceptance boundary

Date: 2026-10-12. Canonical branch: `docs/research-loop-plan`; base `be35972a`.
Backend delivery is the commit containing this packet, after the normal hook.
Scope: approved backend defects; frontend has a separate
[Claude handoff](./GOVERNANCE_CROSS_LOOP_CLAUDE_HANDOFF_2026-10-12.md).
No remote push, runtime rebuild, production/dev/main, source/Edge/SSE/command
activation, DB migration or identity/grant/volume change.

## What changed

1. R1 read publishes exact `DecisionContext` pins: workspace, approval/version,
   immutable manifest hash and sorted unique artifact hashes, max128. This fixes
   the missing backend input for a typed consumer. The browser must still use
   them; the existing FE request omits hashes today. Per-verb eligibility and
   plan/apply authorization/version/quorum/self-approval/expiry are unchanged.
2. R2/Live no longer advertise executable decision verbs/Inbox `needs_you` just
   because a capability exists. R2 context is typed blocked with null command,
   path and hashes. The only commissioned R1 command cannot decide R2. A caller
   who can read R2 receives precise409 gate mismatch; a caller lacking that
   read permission receives404 without gate information. No executor is invented.
3. R1/R2 reads publish bounded `CaptureContext` for the existing R2/Paper Exit
   routes. Parent pins, projection digest and accepted deployment/portfolio/risk
   choices are server-bound, max50 after max200 source rows/relation. Multiple
   accepted risk grants remain distinct; duplicate choices are removed. Currency
   is recorded or null, never guessed. Capture is a Portal review, not promotion.
4. Retained, source-off, stale, foreign-workspace/profile, missing/unknown relation
   and domain outage contexts are explicitly blocked. GET has no source refresh
   or business write. Incomplete R1 evidence is not accepted for downstream capture.
   Direct POST enforces the same source/lineage checks and refuses retained mode;
   browser tampering cannot enable it. Retry of an already recorded capture keeps
   its existing idempotent response and does not create a new mutation.
5. UDB-separated stores use the Execution pool for the projection snapshot,
   not the Core approval transaction's client. The legacy same-pool case keeps
   its transaction-local reader. Core capture rows/children/audit remain atomic;
   this does not claim a distributed transaction or source-side authorization.
6. R2→R1 reference URL includes the exact approval workspace; its canonical
   schema accepts that bounded same-origin query and rejects extra redirects.
7. Capture still requires ADMIN, plus fresh existing parent/target read rights:
   R1+R2 read for R2 capture, R2 read for Paper Exit. Role alone cannot bypass
   gate visibility; owner and exact workspace grants use the same shared helper.
   Permission is checked before both a new write and an idempotent replay, never
   cached. No new capability/grant is created and separation of duties remains.

## Contracts

New strict canonical schema `execution-governance-review-context.v1.schema.json`
defines `DecisionContext`/`CaptureContext`; matching Zod schemas and generated
`execution-governance.d.ts` and its transitive Profile/Live read types are delivered.
R1/R2 read fields are additive/optional
for old responses. Regeneration target: `npm run generate:governance-review-context`.
Synthetic example is labelled `SYNTHETIC_CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT`.
No raw relation/cursor/JWT/mTLS/source connection input reaches the browser.

## Tests and evidence

- New focused backend context tests:16 PASS (sorted/unique hashes, bounds,
  R2 alias refusal, accepted risk choices, absent currency, scope/venue binding,
  retained/source-off/outage/stale negatives, fresh read rights and both pool readers).
- New canonical/generated contract tests:5 PASS; with historical fixtures,139
  tests PASS (strict invariants, bounds, false availability, old compatibility
  and scoped backlink with unsafe query rejected).
- Real-PostgreSQL/API tests extend the existing authenticated product flow:
  R1 read pins → independent reviewer plan/apply → refreshed accepted R1 capture
  inputs → R2 capture → R2 read/Paper Exit capture. They also cover deliberate
  missing hashes, wrong command gate, narrow-capability nondisclosure, concurrency,
  rollback on audit failure, immutable lineage, safe rejection and no promotion.
- Final API suite/build/hook/cleanup result is recorded below after completion.
  The first full API run exposed a negative test reusing Stan after another test
  had legitimately delegated R2 read. The negative now uses an independent R1-only
  actor; existing capability enforcement is not weakened. Retake only affected
  Governance tests, preserving the first run's unrelated PASS results.
  Private diagnostics: `/home/bobby/.local/state/portal-governance-cross-loop/20261012/`.
  Fixture/isolated HTTP proofs are not a shared preview browser receipt.

The standard `scripts/control-api-test.sh` now accepts validated `test/*.spec.ts`
filenames for a focused retake in the identical cell/build/restore/cleanup. Zero
arguments still runs the full suite; paths outside that directory are refused.
The accepted test bar, isolation and restore checks are not weakened. Existing
N29/EDS-12 derived evidence digests are re-pinned with `runtime_effect:NONE`; no
authority/acceptance/release state is changed by that mechanical refresh.

## Final verification and C4 closeout

- Targeted final candidate:3 Governance files,54/54 tests PASS on real disposable
  PostgreSQL; Control API build PASS; actual `pg_dump`/`pg_restore` signature PASS.
  Command: `./scripts/control-api-test.sh test/governance.spec.ts
  test/governance-product.spec.ts test/governance-review-context.spec.ts`.
- Full first pass:2546 PASS,1 FAIL (the contaminated negative actor described
  above),3 SKIP across276 files. It is **not** reported as a full green run.
  The fixed negative and changed capture logic were retaken54/54; unrelated
  passing suites were not repeated. The three skip states were not converted
  into product evidence or claimed as new engine/source qualification.
- Contract/old fixtures:139/139 PASS. Frontend `tsc -b --noEmit` PASS without
  source/design changes. Snapshot358 tracked inputs matches; scoped generator
  regenerated offline. Test-runner shell syntax PASS and invalid outside test
  path rejected with exit2 before any cell is created.
- Normal root hook is the commit gate for this packet; its final result is the
  success/failure of the delivery commit and retained `commit-hook.log`, not a
  bypass. This is one coherent commit, not a full hook per minor edit.
  Attempt1 passed337 contract tests, then caught the transitive Profile/Live type
  not yet regenerated. The scoped generator now covers both dependency outputs;
  only generated declarations/digests were corrected. Retry the normal hook,
  not engine or already-verified API tests; preserve `commit-hook-attempt1.log`.
- Both test invocations completed their exact disposable-container/network/tmp
  teardown; no named DB volume, product identity/account or runtime was created.
  C4 snapshot:root621GiB,used458GiB,available163GiB (about26% free); about10.5GiB
  memory available. Deploy runner is active; Docker observation88.67GB images,
  195.3GB build cache,31.2GB local volumes. These are existing host inventory,
  **not** deletion targets. Phase decision:`NO_ADDITIONAL_PHASE_CLEANUP_REQUIRED`.
  Below30% free is an observation for existing C4 maintenance; above20% hard
  threshold. No broad prune, backup/release/rollback removal or DB business-row
  cleanup is authorized or performed here.

## Not claimed as closed

- Claude must implement FE-GOV-01…04; no frontend source/design/baseline was edited.
  R1/Paper Exit hash binding and R2 wrong-command callers remain FE work until
  their owned consumer is changed and affected browser receipts are supplied.
- R2 execution authorization and accepted Paper/Sandbox/Canary/Live promotion
  evidence are not commissioned by this patch. Their deliberate typed absence
  is not a backend transport defect and not a product PASS.
- Research→RC→R1 existing acceptance receipts remain valid where unchanged;
  full active downstream chain, source SLA renewal and release stay separate.
- Gate track's inferred historical completion is a frontend truth defect; handoff
  directs Claude to display position/recorded states without fabricating lineage.

Verdict: `BACKEND_REPAIR_VERIFIED / FRONTEND_HANDOFF_OPEN`, effective upon the
normal-hook delivery commit; frontend acceptance
and full active-chain authority are explicitly separate, not silently marked GO.
