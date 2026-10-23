# Six approved backend support packages — execution order

Bobby approved all six packages on 23 October. Implementation lane:
`/home/bobby/portal-fixture-support`, `chore/complete-fixture-review-20261023`.
Claude owns components/design. No runtime/remote push or production changes.
Implement/accept packages in numbered order; disjoint preparation is permitted.
The existing frozen integration gate is not restarted for this work.

| Package | Work and acceptance | Current state |
| --- | --- | --- |
| 1 Linked fixtures | BFF uses shared synthetic facts; same IDs across tables/detail/charts; exact financial endpoints; contract and navigation tests | BACKEND_FIXTURE_READY 0297c4902; browser/visual and rollout not claimed |
| 2 Fleet timing | Exact lifecycle fact binding; entered-at/days agree with as-of; ambiguous/missing transitions remain explicit; schema/producer tests | BACKEND_SOURCE_DELIVERED 40d3540c7; consumer and real transition-source acceptance pending |
| 3 Visit digest | User/workspace baseline, snapshot revision, explicit seen transition, typed changes and safe links; authorization/isolation/replay tests plus populated fixture | QUEUED |
| 4 Accounts | Authorized same-snapshot counts and list figures projection; reuse published DTO; no per-row read amplification; query/permission tests | QUEUED |
| 5 Contributors | Authorized alpha attribution and bounded group continuation beyond 200; full-population aggregate semantics; no sum of returns/scores; pagination/security tests | QUEUED |
| 6 Names/finance | Authorized portfolio label joins; exact grain/unit/source binding for financial DTO/fixtures; no wallet-equity substitution or cross-currency sums | QUEUED |

Each closeout must name code SHA, changed paths, tests actually run, contract
generation impact, remaining real-source inputs and Claude consumer action.
Helpers alone do not close a served route; a fixture test is not a browser receipt.
Conversely, real Edge readiness does not block rich positive fixture acceptance.

## Entry observations

- Claude latest observed source `c059d9844` already contains the two positive
  fixture helpers and handoff; avoid re-delivery as new work.
- BFF `review-manager.ts` still injects SOURCE_GAP into populated series. Its
  existing per-subject NAV/PnL/Return endpoints tie to dataset figures; integration
  must preserve those ties rather than indiscriminately replace all four views.
- Manager timing fields exist, but policy advertises missing transition facts.
  Correct the fact adapter and publication policy together, not only fixture nulls.
- Accounts list figures mapper explicitly documents an absent projection column.
  Existing optional DTO/mapper is not evidence that the list serves figures.
- Contributors producer rejects more than 200 groups; continuation is not present.
- Current-human/Edge qualification remains a separate ongoing obligation; no
  command/Live activation follows from development scenario support.

## First implementation checkpoint

Package1: BFF populated/layout-stress now serves complete series without an
artificial missing midpoint. NAV/Drawdown share the positive helper walk; final
table endpoints are preserved. Dedicated producer-Zod tests **4/4 PASS** at
240/1440 points, including unchanged explicit EMPTY/UNAVAILABLE scenarios.
Full graph remains IN_PROGRESS: capital-statement NAV and allocation-based return
have different economic bases. Do not replace the latter with a zero-flow return
and call them reconciled. PnL/Return retain their published bases for now.

Package2: exact alpha/version/portfolio/environment/source-revision transition
helper and **11/11 focused tests PASS**. Half-open intervals, duplicates, competing
entries and invalid/future timestamps tested. Served policy/schema remains unchanged
until model/query-options/fixture wiring and generated schema publication are done.
This helper is not yet mounted on the Manager producer.

Intermediate commits use campaign §10.10c focused gates; no second normal hook,
DB, Docker, migration or runtime change. Tests created no retained resources.
Packages3–6 are still QUEUED, not DELIVERED. No six-package completion claim.

## Second checkpoint — 23 October

Code `e1ab80a4f`: Fleet no longer overwrites linked deployment PnL with a
row-index zero or unrealized PnL with an artificial null. Positive capital default
no longer injects a negative second book or missing pending amount. Adverse NAV
cannot enter the strictly-positive series helper and throw. Tests traverse the
shared scaled identity graph and compare Portfolio detail NAV to series endpoints.
Focused producers 15/15 PASS; affected actual consumer specs `reviewCapital` and
`wpcFixture` **27/27 PASS** after compatibility repair. No component/UI changes.

Package1 remains IN_PROGRESS, not full graph/browser acceptance. Original
`positiveManagerWorld()` is a separate canonical scoped-reader test graph, not
the scaled BFF graph; replacing existing IDs with it would break routes. The BFF
now reuses the scaled graph. Remaining work: reconcile physical-account/current
capital versus economic-sleeve performance across all account/detail routes,
and update explicit negative fixture scenarios/test expectations separately.

Code `40d3540c7`: package2 now accepts optional bounded `stage_transitions` in
the existing persisted Manager JSON document. It validates revision, environment
and member binding; derives timing through the real query producer; withholds
timing when a same-row sibling is unauthorized. ALL uses each environment's
own as-of. No assignment timestamp inference; no migration or real Edge source
adapter activation. Facts absent in current documents still produce absence.

Backend tests98/98 PASS; contract tests69/69 PASS; indexed lookup follow-up3/3
PASS (overlap, not added coverage). Narrow generation completed and snapshot
check matches604 files. Existing lifecycle.live fixture stays byte-identical;
new positive fixture is `execution-manager-dataset.lifecycle.transitions.synthetic.valid.json`.
Generated type remains `execution-manager-models.d.ts`.

### Exact Claude handoff

- Accept `stage_lifecycle.entry_time = EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED`
  in the Manager reader, retaining the legacy value.
- Accept `query_options.unavailable_fields = []` when all authorized filtered
  rows have timing; keep the legacy two-item absence pair. Numeric timing reader
  arithmetic already exists. Use the new transition fixture to test this path.
- Do not adopt the positive fixture as a default before updating both guards.
  Initial broad test caught this and the common fixture was restored: the two
  actual consumer specs above now pass unchanged.
- Older `reviewManager` assertions deliberately require a midpoint gap,
  index-based zero/null and negative capital, and `wpkSeries` pins eight decimal
  places while the contract permits more. Full four-spec run initially had
  66PASS/17FAIL, including the genuine reader/NAV defects now repaired. Remaining
  expectation changes are NOT claimed green; keep dedicated negative tests when
  changing the positive-default assertions. Do not re-record visual baselines
  merely to suppress failures.

Verification uses focused §10.10c gates; no extra heavy hook, deploy or push.
Dependency symlink is retained in this isolated worktree; no temporary diagnostic
file, container, DB or process from these tests remains. Core's separate frozen
integration landed at2a89e6d0d; this support branch is not part of that landing.

## Third checkpoint — core graph and scenario closeout, 0297c4902

Supersedes package1 graph/test debt above; historical failures remain recorded.
Account/Deployment overview now selects source contributions BEFORE aggregation.
Scaled internal Account balances use the same allocation + realized PnL graph as
Manager, with free + locked = total. Broker wallet/equity remain distinct. Capital
statements derive opening capital/current NAV from unique source deployments,
not arbitrary account-count constants. Current receipts use unwindowed source;
performance keeps its declared window and basis. Currencies remain separate.

Tests follow Fleet → deployment/account and Portfolio → series, checking IDs,
contributions and endpoints. Shared physical account balances are not summed once
per portfolio. Positive defaults no longer force gaps/index-based missing facts.
Dedicated sparse regression preserves zero/null/negative/EMPTY/UNAVAILABLE cases.
Legacy/native adverse fixtures are not overwritten to make positive paths pass.

Final affected consumer gate: **84/84 PASS**, four files,11.03s. Producer fixture
gate: **15/15 PASS**, three files,3.83s. Earlier runs overlap these totals, not
additional coverage. Fixture BFF bundle build and diff check PASS. No component
changes (only two consumer test files), no heavy hook, DB/Docker, runtime or push.

Package1 backend fixture scope is ready for integration and Claude browser review,
not a certification of every catalogue family. Package2 producer/schema delivery
remains40d3540c7; Claude accepts its enum/options before opting into timed fixture.
Claude next: integrate focused diffs, schedule fixture/web rebuild, review journeys
at1280/660 without redesign. Next backend package3 visit digest is already approved.
Ignored build output/dependency links retained; no test process or diagnostic left.
