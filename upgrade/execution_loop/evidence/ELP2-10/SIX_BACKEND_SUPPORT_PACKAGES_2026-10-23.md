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
| 3 Visit digest | User/workspace baseline, snapshot revision, explicit seen transition, typed changes and safe links; authorization/isolation/replay tests plus populated fixture | BACKEND_SOURCE_DELIVERED 8822d58f2; PG/contract/fixture gates PASS; not installed/consumer accepted |
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

## Package3 — per-user/workspace visit digest

Entry: Bobby assigned package3 explicitly; source `1e21ee7fb0ff0b0966e4ed40b5e47f6d3feb8e27`, clean
`chore/complete-fixture-review-20261023` in `/home/bobby/portal-fixture-support`.
Read Claude FE_CAT_5_CONTRIBUTORS_DIGEST_2026-10-23 and current review2 C1 stories.
Claude lane observed `ca011f3c4` at entry, then `b1642585b`; its UI files remain untouched.
Primary owns pure projection/schema/BFF/shared registration; subagent owns
store/service/controller and focused tests; primary reviewed authorization and bounds.

### Implementation and scope

- New GET `/api/v1/execution/visit-digest` and POST `/api/v1/execution/visit-digest/seen`,
  optional `workspace_id`; actor always from session. Existing command-center feature
  gate and current scoped reader fences reused. No external request or new grant.
- Portal Core owns the comparison baseline, not Edge. Migration150 adds one row
  per current user/workspace membership; fingerprints only, no historical labels,
  financial amounts or new event ledger. Removing membership/user/workspace cascades
  its baseline; no production database modified. GET does not write.
- POST requires Origin + session-bound `x-portal-csrf` and cookie, exact snapshot
  revision and expected baseline version. Same-revision retry is idempotent. Another
  tab/stale source returns409; never silently mark newer unseen facts. Transaction
  commits after final reader authority fence, rollback on revoke/failure.
- Bounded200 observations/96KiB stored fingerprints, max2 admitted writers/process,
  reduced for smaller configured pools with a reserved Core connection (max1 refuses
  seen with503 before acquiring a client),
  nonblocking user/workspace advisory lock; no unbounded wait queue. Source and pool
  failure return typed503; no success without persistence. Core-owned source does
  not require another Edge acknowledgement to design/test the UI.
- Current real source is the authorized command-center triage/today/source slice.
  `coverage=BOUNDED_OBSERVATIONS` is explicit: no complete history, NAV-delta or
  resolved/deleted inference from rows falling out of a top-N query. Newly visible
  fact is `NEW_OBSERVATION`, not proof of newly created business object. Revoked
  previous facts never appear in output. Missing workflow lineage in scoped source
  remains missing; this package does not invent authority/source events.
- Rich fixture uses the shared scaled deployment/operation graph with an explicit
  seeded earlier baseline, changed/new observations, safe object links and mark-seen
  state. User/workspace stores are isolated and bounded32 in the fixture server;
  scenario resets on fixture server restart. This is not the durable real adapter.

### Claude handoff (AWAITING_CONSUMER_REVIEW)

Generated `packages/contracts/generated/execution-visit-digest.d.ts`:
`executionVisitDigestGetV1`, `executionVisitDigestSeenV1`, `VisitDigest`, `VisitDigestSeen`.
Regenerate: `npm run generate:execution-visit-digest` in contracts workspace.
Canonical example: `fixtures/execution-visit-digest.synthetic.valid.json`, three
cases first_visit/changed/seen; standalone schema and OpenAPI publish the same shape.

Connect Overview's existing C1 frame via typed port; no redesigned component needed.
Check response `workspace_id` against request, and `may_mark_seen` before enabling
the explicit action (`READ_ONLY_PROFILE` for retained reads / refused fixture writes).
`NO_BASELINE` is a first-visit state, not an empty history. Explicitly mark seen using
the returned `mark_seen` body; don't do it during GET/render/mount. Display current
label/value/as_of and server href without parsing strings into permissions/events;
retain workspace context. EMPTY after acknowledgement is not a complete-history
claim. Refetch on409 and let the user act again;503 retains the prior UI baseline.
Fixture writes obey `FIXTURE_WRITES=refuse`; no polling/source connection is added.
Ordinary profile supports authenticated seen after migration. Retained GET keeps
Core workspace and all retained writes remain forbidden. `native_manager_review_v1`
has a closed allowlist that does NOT include these new routes: its commissioning
is separate, not silently widened by this feature or claimed available on preview.
Review populated, first-visit sparse, empty-after-seen, wrong workspace, two-tab
conflict, reload and1280/660 overflow. Browser/visual and real installed API remain
Claude/commissioning acceptance, not claimed by producer tests.

### Verification / remaining

Contract + actual loopback BFF7/7PASS; route/persistence ledger22/22PASS. Initial
HTTP attempt was refused by sandbox EPERM, not a product regression; bounded
loopback retake passed. PG migration/rollback test receipt follows below. No remote
push, runtime change, preview rebuild, command or Live; normal integration hook is
deferred to frozen landing under §10.10c, not bypassed as a completion claim.
Backend next approved package4 Accounts projection; packages5/6 remain queued.
Rollback: revert source slice before installation; after future migration, disable
consumer/route use and preserve baseline table rather than destructive rollback.

Independent review found and fixed a CSRF request type mismatch, undersized-pool
admission and terminal version overflow. Native profile allowlist limitation is
accepted/documented, not bypassed. Frozen PG cell tests migration/store before the
two final conservative admission/version guards; those receive focused unit retake,
not a false claim of the entire HEAD being one installed candidate.

### Final producer receipt — 8822d58f2

23 code/schema/test/ledger files, +1916/-6 (includes generated OpenAPI/schema/types,
not 1916 lines of hand-written backend). No frontend source/component changes.

- Final isolated `control-api-test.sh` selected3specs: buildPASS, migration150PASS,
  **19/19PASS** (includes4 real PostgreSQL tests), restore drillPASS with scoped
  access digests. Real DB tests cover persistence/isolation, final-fence rollback,
  nonblocking concurrent lock and removal-of-membership cleanup.
- Latest focused service/controller retake **17/17PASS**, including pool-size1
  refusal, terminal version bound and retained-profile behavior. Overlaps15 tests
  in the frozen PG run; do NOT add totals as distinct coverage.
- Final contract/loopback fixture **7/7PASS**; ledger **22/22PASS**; fixture BFF build
  PASS; generator check/snapshot609files PASS; diff/tracking checks PASS.
- Initial full build failed on missing request `csrfSecretHash` type; fixed and
  retaken. First failed log SHA256
  `dd1d0ac76d471a4021f30a5ccc600562465ab6aa56b4c1a89cbafbe8a179fe5c`.
- Final local log `/tmp/visit-digest-focused-gate-final.log`, SHA256
  `e062fbef25c41d1d915b61f64e992fdd394a65807fc420009889746deff8859d`.
- C4 cleanup: exact test node/Postgres/network suffix18987952814118471 absent
  after script trap; loopback server closed. Root218GiB free/65% used.
  NO_ACTION_NEEDED; keep dependency links/build outputs for reuse, no image prune.

Intermediate code commit used focused-gate exception §10.10c (hooks disabled only
for this command); no normal-hook/landing claim. Docs verification R0 §10.10d.
Exit: backend baseline + bounded-source adapter + fixture contract delivered.
Installation/native commissioning and Claude consumer/browser remain NOT_RUN;
full event history/NAV change feed is not claimed. Claude can implement fixture
consumer now from this SHA. Backend next package4; no new Bobby decision needed
for that already-approved package, no implicit release/runtime authority.
