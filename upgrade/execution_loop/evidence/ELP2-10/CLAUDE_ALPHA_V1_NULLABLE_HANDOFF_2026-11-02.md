# Claude handoff — Alpha V1 nullable facts (2 Nov 2026)

> **Follow-through, 2 Nov:** Bobby authorized Codex to update the Alpha
> parser/data-binding and its tests without changing the approved design.
> The previously failing consumer below is fixed in local source commit
> `4bd2a5f00ef36e57d52dc8fa50f1a8c1a15bb862` on
> `docs/research-loop-plan`. Its normal repository hook passed, including
> 12,132 Control API tests (8 skipped) and the isolated PostgreSQL restore
> drill. The original request and 28/29 result below are retained as history;
> Claude should review the landed fix and run the remaining browser/visual
> and qualified-source gates, not implement the same parser again. The code
> is not installed or released.

## Codex consumer follow-through

- `profileRead.ts` now has a distinct Alpha Resource V1 reader. The Fleet
  list reader remains strict; the scoped Resource V2 body is not parsed as
  V1. Typed absence and its reason remain distinct from the decimal `"0"`.
- Existing Alpha view/model and legacy recomposition data bindings consume
  the V1 shape. Unknown health is not promoted to READY, null portfolio IDs
  do not become selection options, and unavailable aggregates are not shown
  as complete values. No design, colour, layout or baseline was changed.
- The checked-in synthetic service fixture, older complete V1 shape,
  malformed availability/reason pairs, nullable time/portfolio, V1/V2
  dispatch, and positive-zero cases have focused coverage. A React test
  exercises the existing screen with a synthetic HTTP client; it is not a
  Playwright/browser or connected-source receipt.
- An affected six-suite checkpoint passed **494/494**; a later four-suite
  check including Alpha scoped, Fleet conformance, profile integration and
  the amended canonical test passed **691/691**. The suites overlap and
  must not be added together as independent coverage.
- Frontend `npm exec -- tsc -b --pretty false` exited **0** on the unchanged
  frontend candidate diff (157.29 seconds; peak 2,596,156 KiB). This is not
  the normal integration hook or browser/real-source acceptance.
- The exact six modified frontend source/test files and qualification
  boundaries are recorded in the [backend six-package receipt](./CODEX_BACKEND_SIX_PACKAGE_FOLLOWTHROUGH_2026-11-02.md#alpha-v1-nullable-consumer-follow-through--2-nov-2026).
  The final normal hook has passed; integrated browser/visual and real
  Edge-source acceptance remain separate. Claude should review the result on
  the actual integration candidate and report any remaining issue.

## Integration boundary

This backend and the authorized consumer fix are committed in
`/home/bobby/portal-research` on `docs/research-loop-plan`; they are **not
installed or released**. Please consume/review the landed fix on the UI lane,
then return browser/visual findings and exact candidate pins. Do not implement
it again, revert this schema, replace absent values with zero, or change the
approved component design.

The backend ledger and test limits are in
[`CODEX_BACKEND_SIX_PACKAGE_FOLLOWTHROUGH_2026-11-02.md`](./CODEX_BACKEND_SIX_PACKAGE_FOLLOWTHROUGH_2026-11-02.md).
The historical blocker was `apps/portal/frontend/src/execution/api/profileRead.ts`,
`readAlphaFleetItem` and its `readFleetDeployment` / currency readers, which
previously rejected the new nullable facts rather than rendering absence.
Before the fix, `canonicalServing.test.tsx` reported **28 passed / 1 failed**
at `expect(item).not.toBeNull()`. The later 691/691 focused test checkpoint
above includes the corrected consumer; this remains distinct from integrated
browser acceptance and is not a reason to fall back to fabricated zeroes.

## Consumer requirements

- Dispatch on `schema_version`: `execution.alpha-resource.v1` is the legacy
  compatibility projection; `execution.alpha-resource.v2` is the separately
  scoped authorized-facts body. Do not reinterpret V2 as V1. See
  `packages/contracts/generated/execution-serving-reads.d.ts`, component
  `execution-alpha-resource.v1.schema`, and
  `packages/contracts/schemas/execution-alpha-resource.v1.schema.json`.
- For a deployment, validate `position_count_availability` and
  `position_count_reason_code` as a pair. `AVAILABLE` requires a non-negative
  integer and null reason; `UNAVAILABLE` requires null and
  `POSITION_POPULATION_NOT_QUALIFIED`. For legacy payloads omitting the pair,
  the schema requires the integer; do not infer new availability from null.
- When `position_metrics_availability` is present, it is `UNAVAILABLE` with
  `POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED` and all four of `realized_pnl`,
  `unrealized_pnl`, `net_pnl` and `exposure` are null. When that pair is
  absent, the legacy schema requires four decimal strings. Preserve the
  distinction between null and a source-published `"0"`; never add up an
  unqualified population.
- Currency aggregate rows may likewise carry typed `UNAVAILABLE` and nullable
  financial amounts; validate their state/reason using the checked-in schema
  before mapping. Preserve exact decimal strings and currency, and don't
  infer an aggregate or valuation across an unknown currency.
- Nested `deployments[].allocation`, `balance_total`, `balance_free`, and
  `balance_locked` can also be null when the retained inputs are partial,
  duplicated or currency-ambiguous. More than one observed currency can
  occur with `UNAVAILABLE` amounts. Keep source `"0"` distinct from null;
  do not select the first conflicting currency or supply a zero default.
- Deployment `health` may be `UNKNOWN`, and `updated_at` may be null as the
  schema permits. Adapt any dependent view model deliberately; missing time
  or unknown health is not a healthy status. Keep existing presentation and
  accessible component semantics.
- Account 360 also has unqualified headroom / differences: consume the typed
  availability from the generated contract; leave null as absent rather than
  rendering zero or in-sync. Approval Evidence may return a typed unavailable
  or denied problem; do not turn that into real evidence.
- The retained source-health composition may now refuse with the existing
  `EXECUTION_READ_NOT_AVAILABLE` (404) or `EXECUTION_READ_ACCESS_CHANGED`
  (409) when an earlier scope is revoked or a profile head changes before the
  combined result is released. Do not keep the earlier profile as freshly
  available after such a refusal; clear/refetch according to the existing
  access-change flow. This is not a new READ/STREAM entitlement.
- The retained Profile stage and Account 360 aggregate now perform the same
  kind of final recheck on each contributing scope/head. A revoke, changed
  policy/snapshot or authority outage can make the entire read return the
  existing 404/409/503 instead of rendering earlier sibling rows as fresh.
  Use the existing clear/refetch and typed-error handling; this is not a new
  payload field, permission or a redesign request. It is not native-source or
  browser acceptance.
- Retained Resource 360 applies a common final check to its contributing
  per-environment scopes as well. When that check refuses a stale or revoked
  scope, handle the existing 404/409/503 as an access/source change, not as a
  freshly available partial Alpha/Portfolio/Account/Binding. This does not
  change the payload or add a purpose; native HTTP custody remains separate.

## Suggested acceptance

1. Test the checked-in service-generated synthetic fixture
   `packages/contracts/fixtures/execution-alpha-resource.v1.synthetic.valid.json`
   with `apps/portal/frontend/src/execution/v2/screens/alpha/canonicalServing.test.tsx`.
   Include positive zero, typed null, older complete legacy payload, malformed
   state/reason pairs and dispatch of V2 as a separate variant.
2. Exercise the corresponding view model/render and ensure no valid partial
   response blanks the whole Alpha screen. Keep fixture and connected-source
   receipts separate. Add the relevant account-availability tests.
3. Report the exact candidate/consumer commits and focused tests. Full hook,
   visual baseline, browser on the candidate and a real qualified source are
   separate acceptance gates. No request to redo already-consumed R-B/R-C UI.

## Later Core follow-through — Account 360 retained exact lookup

The local Core candidate can now find a unique, authorized Account beyond the
first retained page when its complete local snapshot proves that identity. It
holds separate Account/Alpha purposes through the final snapshot/grant fence.
There is no new public field and no requested layout change. Use the existing
typed absence/refusal states for partial, ambiguous, denied or changed data;
do not infer an external broker binding or financial value. Browser testing
on the integrated candidate is still needed. This does not establish an Edge
source or production entitlement. [Evidence and exact scope](./CODEX_BACKEND_SIX_PACKAGE_FOLLOWTHROUGH_2026-11-02.md#exact-account-360-retained-lookup--2-nov-2026).
