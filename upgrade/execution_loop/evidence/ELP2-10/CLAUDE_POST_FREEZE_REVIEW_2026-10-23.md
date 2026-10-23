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

## Addendum — subsequent Fleet cut, independent review

Read-only review at `77617e379d64dedc331e12448d6dcaa91f3277c5`, range
`c9d2b717d..77617e379`; later FE2 tip observed
`0da0988556e64f3c3dc2327224ccb166d735f0ff` separately. No backend, contracts
or service implementation changed after the frozen `2f9ca2dc` in that tip.
This is not acceptance of the later frontend slice and does not move the cut.

Additional CHANGE requests for Claude, preserving the approved components:

1. `screens/fleet/fleetMetricsModel.ts:195` deduplicates partition choices by
   domain/currency only, while the request also binds basis/native-profile/
   domain-proof. Keep the complete five-field identity and distinguish labels;
   test two Paper/USDT partitions with different owning books. Do not silently
   retain the first partition at `screens/fleet/index.tsx:257`.
2. `fleetMetricsModel.ts:260` must not turn every absence without an evidence
   field into `insufficient`, including `MIXED_ECONOMIC_DOMAINS`. Preserve
   unpublished evidence as null; only show insufficient evidence when the
   owning reason actually states it. Test those two dispositions separately
   through `FleetDatasetTable.tsx:207`.
3. `screens/fleet/useFleetSparks.ts:32` must invalidate cached and in-flight
   series when the owning dataset generation/revision changes or its scoped
   authority is evicted. Refresh at `index.tsx:216` must not combine new dataset
   facts with an old NAV sparkline. Add refresh/revoke/late-response tests.

The earlier Portfolio range/quality/domain requests remain open at the reviewed
cut. Codex does not rewrite the frontend in this review. Claude should return
each corrected SHA and focused consumer receipt for a separate landing.

Current gate correction: the normal backend run ended with 10,175 PASS,
23 FAIL and seven skips (eight failed suites); it is **not RUNNING/PASS**.
Five affected fixture/Financial/Command/queue files retook 118/118 on the host.
The six independent optional-purpose/anchor cases retain the original timeout
and assertions; their isolated PostgreSQL retake and final landing are pending.

## Addendum — shell cut `766615d12`, separate scope review

Claude's newer `766615d12` shell remains outside the frozen integration.
This read-only review requests three scoped logic corrections:

1. `shell/ExecCommandBar.tsx:92` keys search only by text/search/debounce;
completed or late results can survive workspace, environment or permission
changes. Selection at line 78 then attaches the new workspace to an old result.
Clear/abort/refetch using the full owning scope/session/allowed-source key;
bind displayed results and selection to that same key. Test a deferred old
workspace response after navigation, environment switch and capability removal.
2. `shell/entitySearch.ts:101–134` omits `workspace_id` from Alpha, Account
and Portfolio reads. `manager-lists.controller.ts:29–50` already accepts this
scope, but lines 75–80 fall back to the home workspace if it is absent.
Thread the current workspace through those three existing ports/query types;
do not search workspace A and navigate its IDs into workspace B. Test all five
search families with a non-home workspace. No backend contract change is needed.
3. `shell/navCounts.tsx:95–117` aborts the old request without invalidating
its displayed counts when workspace changes. Key the badge state to its
workspace/eligibility, or clear it synchronously; a pending B read must never
show A's old counts. Test deferred B and revoked eligibility.

Keep the approved component/design and server authorization fences intact.
This is a read-only finding, not a claim of runtime exploitation or a reason
to drop Claude's later commits. Return these with their separate corrected SHA.
Fixture-only nginx commit `2e9531af6` is ACCEPT: its two exact Access routes
remain in the explicitly mounted fixture overlay and do not enable production
authority. The previous six Portfolio/Fleet findings remain open at this cut.

Focused update: six files now passed 424/424 on isolated PG/HTTP. The runner
then failed before restore after Codex edited its running Bash file; that is
an operator error, **not a complete restore gate**. The fixed runner then
passed both Paper-reader suites (37/37) and the actual PostgreSQL restore/four
scoped-access digest drill, exit 0. Final normal hook and landing stay
pending. Offline proposal validation is now 12/12 after an independently found
inherited-workload-key error was demonstrated then fixed. No load authorized.
