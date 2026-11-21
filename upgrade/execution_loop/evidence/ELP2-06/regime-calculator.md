# ELP2-06 — frozen-input Regime calculator follow-through

2026-10-17, approved[backend02–11 batch](../../../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-backend-gap-batch-02-11).
Canonical requests remain06-002 and00-005. This is a private shared-calculator
implementation, **not** completed source→worker→projection→API commissioning.
Frontend NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.

## Scope, source and ownership

Entry `/home/bobby/portal-research`, `docs/research-loop-plan`,
`8ba33de3cf2cb91a4d58bf7421c6b7b4fc5ce462`. Independent writer owns only new
`manager-regime.ts` and `elp206-manager-regime.spec.ts`; primary integrates,
independent reviewer checks semantics, primary owns shared journal/testing/Git.
Authority: Score FINAL v1.1§§9–11/R01–R25, ELP2-06 and campaign rules. Reuse
existing exact-decimal helpers; no second economic kernel, feature calibration,
policy approval, grants, scheduler/service, DB/migration, API or frontend edit.

## Implemented calculation, not invented authority

- Exact alpha/version/research binding, separate strategy/trade params and
  mapping, universe/venue/data/split provenance. Closed-bar, knowledge-cutoff,
  complete horizon, reconciliation, required-cost and purge/embargo/OOS-reuse
  eligibility are independent of how attractive an outcome is.
- Frozen feature schema/scaler/support parameters are inputs, not defaults.
  Up to3 dimensions, MAD scale1.4826, equal-omega robust distance, Gaussian
  weights, ESS, stage-separated descriptive realized net-TWR summaries and
  empirical quantiles. No probability/forecast, score multiplier, TradeState,
  risk-control inhibition or automatic execution.
- Research history is labelled retrospective simulation, not pretended
  prospective deployment evidence. Deployment support requires binding and
  artifact/evidence availability before effective start; replay uses knowable
  facts. ResearchIS/OOS/Validation, Paper, Sandbox, Canary and Live keep separate
  outcomes/ESS. Many overlapping windows do not become independent episodes.
- Archived strategies retain eligible pre-archive historical evidence. New
  post-archive monitoring requires an exact independently approved separate
  Paper deployment and frozen archive/binding receipt; no automatic Live,
  unarchive or synthetic forward history. Missing archive proof abstains.
- Explicit reasons/locators for unbound/stale/invalid/missing/cost/support
  states. No epsilon for zero MAD, clipping unsupported outliers, dropping
  losses, hidden equal-weight fallback or resurrecting an all-underflow kernel.
- Finite structural bounds and precision checks are safety limits, **not**
  approved runtime budgets/calibration. TEST_ONLY calculation can only enter
  labelled preview; internal verified/approved assertions are not approval proof.

## Independent review and actual validation

First source freeze had51 fixture tests green in the shared profile focus;
review nevertheless found three real defects: prospective proof times,
catastrophic cancellation from subtracting large z-scores, and removing valid
pre-archive history. A reference expectation also exceeded the specification's
1e-9 tolerance. These findings were fixed rather than waived by the green run;
new regression cases and tighter exact reference expectations are mandatory.
The old51 PASS is retained as a historical diagnostic, not final acceptance.

At preparation, corrected source/test were prepared for the one coherent
normal-hook batch with OwnProfile/recovery; corrected tests were NOT_RUN.
The actual local retake is recorded below; full landing is still its own gate.
No engine/TS/DL jobs, source DB rows, remote writes, runtime/credential changes,
consumer/browser acceptance or numerical production approval are claimed.
Core one heavy lane≤4CPU/4GiB/8GiB transient; cleanup only exact owned resources.
The full legacy hook also runs historical cells with their own script limits;
its resource receipt must not pretend every legacy container has a cgroup cap.

Corrected local pure retake: **72/72 PASS**,0FAIL/SKIP,0.563s, one worker/512MiB
Node heap, existing pinned local Vitest4.1.11. Source sha256
`c74aba37cfb6e8a304f23b198fb4011453af37dedad9eb99557083a4b2cb0110`;
test `4abf70dc3c9b2c3949bc47bdc6ce7a8c7c6da7d268113d2ea75318c184b0e336`.
Reviewer ACCEPT_SOURCE_ONLY after rereading all fixes. A first CLI invocation
duplicated the package's existing worker flags and exited before any test;
corrected `NODE_OPTIONS=--max-old-space-size=512 npm test -- test/elp206-manager-regime.spec.ts`
produced this retake. No source policy or installed provider is certified.
Full locked-install/API build/contract/PG regression remains the normal-hook
landing gate; its exact terminal receipt is under
`/home/bobby/.local/state/portal-execution-elp210/20261017/profile-recovery-land-*/`.
Only a normal-hook exit0 can create the commit containing this packet.

## Remaining complete chain / future handoff

This function must not be exposed as a public JSON worker/API input. Next:

1. Authenticated exact scoped binding/deployment/evidence source and frozen
   feature/reference artifact manifests; authorize **before** joining or
   emitting counts/reasons, including researcher-denominator privacy.
2. A private policy loader with independently accepted byte/hash/scope/time
   approval pins. Self-declared `RUNTIME_APPROVED`, `verified` or a monitoring
   boolean in source JSON is not enough. Calibration stays00-005.
3. Bounded off-request worker/materialization, append-only correction/replay
   and atomic source/checkpoint publication. Cache keys bind authorized scope,
   subject, policy/schema/basis/reference revisions; no per-dashboard compute.
4. Public generated contract/fixtures, read-time source/current-policy fence,
   genuine source→API tie-out and then an explicitly assigned Claude consumer.

No public schema changed by this private calculator, so Claude has no new field
to consume yet. Existing Regime typed absence remains truthful. Composition is
a separate allocation/full-denominator chain and remains open; it cannot use
Regime availability as a dependency. Full ELP2-06 exit NOT_MET. Rollback removes
only the unmounted function; preserve all identities, grants, policy/source
artifacts and immutable projection history. Backend may continue the loader/
materialization chain under the approved batch without waiting for frontend.
