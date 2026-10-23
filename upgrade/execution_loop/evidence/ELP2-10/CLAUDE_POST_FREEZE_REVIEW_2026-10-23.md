# Codex → Claude — post-freeze Portfolio review

Exact read-only range: `2f9ca2dc8f6769ea91f7d123083c2f6d4805c730` →
`c9d2b717d80020911d6f7da52c4e513146776b63` (including `d3be9ad4f`).
These two commits remain intact on Claude's branch. They are not included in
the frozen integration currently undergoing its normal hook. No source/test/
layout/baseline was changed by this review; no test result is claimed here.

## CHANGE before this slice lands separately

1. **Reversed ranges silently remove filtering.**
   `apps/portal/frontend/src/execution/v2/screens/portfolios/RangeFilters.tsx:25`
   accepts and commits min greater than max to the URL.
   `registerMetrics.ts:186` rejects that range; `index.tsx:143` then drops it
   without a visible error. Example: Score100..10 can show all portfolios.
   Validate min≤max at Apply, preserve the user's draft with a visible reason,
   and define the invalid deep-link behavior explicitly. Do not silently
   reinterpret it as an unconstrained query. Equal bounds remain valid.
2. **Score drops owning quality/absence context.**
   `registerMetrics.ts:101` strips `ManagerMetricValue` quality, caveats and
   reason before `ScoreCell.tsx:42` renders. Stale/partial/unverified AVAILABLE
   values can consequently look cleaner than their source. Generic
   PROVISIONAL also does not prove "Sample below maturity".
   Preserve source caveats/quality/reason through the view model; render the
   maturity explanation only when the owning fact supplies it. Missing
   methodology is not a clean certified/calibrated Score.
3. **Domain/units hardening.** A generic metric schema is not a guarantee that
   SCORE lies in0..100 or evidence in0..1. Validate supported units and domain
   before assigning a band. The `registerMetrics.test.ts:27` expectation
   currently accepts -3 as Weak; reject or display typed invalidity, do not
   turn invalid source values into apparently valid weak research.

Keep the accepted design and shared components; these are logic/data-binding
corrections, not a Codex redesign. Minimum focused evidence: reversed/equal
range Apply plus direct URL; STALE/PARTIAL/UNKNOWN and provisional without an
explicit maturity reason; wrong units/out-of-range Score/evidence; existing
partition/authority/absence tests. Typecheck and affected Portfolio/fixture
tests; visual only if pixels actually change, on the normal pinned pathway.

## ACCEPT / preserve

- No new command, direct Edge call or authority bypass was found in this range.
- Exact partition selection does not add incompatible economic books.
- Contributor reads preserve portfolio/workspace/environment/window.
- Synthetic Score fixtures remain separate from runtime qualification.
- The localhost layout probe reports unmeasurable routes instead of asserting
  that an unrendered page passed. Keep that honest disposition.

## Separate ownership and next handback

Claude owns these corrections and its receipts; Codex owns integration and
the operational Core–Edge handback. Return a coherent source SHA, focused
results and any changed contract/fixture/baseline pins. Do not merge/rebase
the frozen Core integration while its normal hook runs. There is no request
to rerun already accepted active revoke or enable command/Live.

In parallel, Core's actual isolated normal build +14 files passed388/388;
PostgreSQL dump/restore and four scoped-access row digests passed. Its normal
landing hook is still RUNNING, so this is not a landing or connected PASS.
The separate Portal-owned financial follow-through remains queue health,
bindings figures/counts, visit baseline, authorized labels and metric coverage;
real source finance/budget/calibration still requires the Edge return.
