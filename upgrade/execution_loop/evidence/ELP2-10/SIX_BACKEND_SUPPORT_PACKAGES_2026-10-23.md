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
| 4 Accounts | Authorized same-snapshot counts and list figures projection; reuse published DTO; no per-row read amplification; query/permission tests | PROJECTION_AND_FIXTURE_DELIVERED 0f0d5cc85; real-source batch carrier/wiring OPEN, browser/installation pending |
| 5 Contributors | Authorized alpha attribution and bounded group continuation beyond 200; full-population aggregate semantics; no sum of returns/scores; pagination/security tests | SOURCE_AND_FIXTURE_DELIVERED ace3547ca; grouped reader integration and real Return/Score publication OPEN |
| 6 Names/finance | Authorized portfolio label joins; exact grain/unit/source binding for financial DTO/fixtures; no wallet-equity substitution or cross-currency sums | SOURCE_AND_FIXTURE_DELIVERED 37bbecf92; consumer/browser and qualified real financial inputs OPEN |

Each closeout must name code SHA, changed paths, tests actually run, contract
generation impact, remaining real-source inputs and Claude consumer action.
Helpers alone do not close a served route; a fixture test is not a browser receipt.
Conversely, real Edge readiness does not block rich positive fixture acceptance.

## Package6 entry — Names/finance, 24 October (Asia/Saigon)

Base4253f88ed, clean support lane; Claude inspected atbeed0225e. Inputs:
[FE-CAT-8/9](FE_CAT_8_9_ADDITIVE_FIELDS_2026-10-23.md), previous five package
receipts and Unified §14. Preserve their source gaps; do not relabel fixture
completion as financial commissioning. No runtime/remote push/UI ownership change.

Requirement matrix: (1) portfolio_name in scoped deployments/allocations joined
only from portfolios already authorized in the SAME document/profile; (2) complete
positive fixture wallet/equity, budget/exposure and order VWAP/fees with explicit
grain, units and exact arithmetic; (3) reusable DTO/generator/tests and precise
Claude handoff. No strategy/deployment display name invented for real data.
Source fields absent from Edge remain unqualified, not copied from fixture.

Disjoint lanes: names backend agent owns ResourceRead helper/service/tests;
fixture agent owns review-finance/review-relations and fixture tests; reviewer
read-only source/contract audit. Primary owns public generator/types, docs and
integration. Shared component/e2e source remains Claude's. Focused tests and one
backend build; no PG gate unless implementation actually changes persistence.
Rollback: revert source slice before installation, preserve all data and receipts.

### Package6 delivery and exact consumer handoff

1. `ResourceReadService` joins portfolio labels only AFTER scoped row/field
   authorization from the same detached retained profile snapshot. Both
   `DeploymentsScopedRow` and `PortfolioAllocationsScopedRow` gain optional
   `portfolio_name: string|null` and `portfolio_name_reason_code`. Known name has
   null reason; absence uses PORTFOLIO_NAME_NOT_READ/NOT_PUBLISHED/NOT_AUTHORIZED/
   AMBIGUOUS. Hidden and genuinely missing identity both stay NOT_PUBLISHED,
   never existence disclosure. A global name register is not read. One raw
   snapshot, no N+1, no change to legacy v1 or full-portfolio financial authority.
   Public revision changes with visible label, not hidden label changes.
2. Generated contract: `execution-resource-scoped.d.ts`, same four
   `executionScoped{Alpha,Portfolio,Account,Binding}ResourceGetV2` operations.
   JSON/Zod share generator `generate-execution-resource-scoped.mjs`.
   New canonical fixture `execution-resource-portfolio-names.synthetic.valid.json`
   has positive label and null+reason cases without rewriting old fixtures.
3. Claude must extend closed Resource360 reader allowlists/validation for these
   optional fields before rollout; show ID fallback when missing and retain
   workspace/environment link context. Label is never an access grant. Existing
   components can consume names; no design change was made here. Add fixture and
   browser1280/660 long-label checks. Producer tests are not browser acceptance.
4. Opt-in `review-finance.ts` completes generated Account rows using the same
   graph: portfolio/strategy/deployment display labels, allocation-level
   exposure_long/short/gross, budget_used/approved. Explicit **synthetic** margin
   scenario: used=10% of graph gross exposure; approved=used+500 units. This is
   independent of allocated capital, not a production risk/leverage default.
   All figures remain exact decimal strings with that row's currency/time;
   per-currency partitions are not summed. Existing shared physical book keeps
   wallet != equity and distinct list/detail/exposure figures. Native adverse/
   missing-source cases are not overwritten. Existing open ProfileRead rows
   accept these keys; closed real custody DTO/allowlists are NOT widened.
5. Fixed a genuine positive-fixture bug: a200-order response can contain only
   100 fills. Prior helper inferred zero/absent financial facts for tail orders.
   Reuse the existing exact VWAP/fee helper on25-order fixture source pages,
   bounded60pages/1500orders. Match original order/account/mode/venue/client IDs;
   public order/fill pages and cursors stay unchanged. Mixed-currency fees stay
   absent as a scalar, never combined. This is in-process fixture work, not
   product/source fanout or a new real financial derivation.

### Package6 source inputs still OPEN — single coordinator Edge

The source registry `apps/control-api/src/execution/eds11r-manager-relation-registry.generated.ts`
still publishes broker buying_power/currency/synced_at, not wallet/native equity;
orders do not carry order VWAP/fees; allocations carry allocated_capital/max_capital,
not a defined margin/risk used/approved statement or allocation exposure. An order
leg price or per-fill commission is not automatically an order summary. Source
catalogue pins were not changed. Do not interpret uncommissioned real fields as0.

Required Edge return (TS/PM stay behind Edge): (a) broker wallet/equity per currency
with observed time and coverage, (b) budget definitions distinguishing economic
backing/margin-risk budget/exposure cap, (c) allocation exposure per side/currency
and exact population, (d) complete order fill-summary VWAP + per-currency fees,
source revision, completeness and correction semantics. After those exist, wire
the qualified batch adapter—not one upstream call per UI row. Package4 batch and
package5 Return/Score requests remain OPEN. This packet is a written source-input
handoff, not a claim that Edge has received/accepted/implemented it.

### Package6 verification checkpoint

Backend31 distinct PASS (30 initial,1 new revision-binding targeted retake),
including16 existing Resource360 regressions. Contract/schema fixtures33/33PASS.
Final financial fixture+Accounts regression **8/8 PASS**, including1500-order
independent traversal, page after1300 and FILLED+ETHUSDT filtered continuation;
mixed-currency source example leaves scalar fee absent while VWAP remains present.
Independent review ACCEPT, requested tail/filter coverage implemented before
freeze. Generator/snapshot611 and diff checks PASS. Build/browser/landing statuses
are recorded at final freeze; no DB/migration changes, so no redundant DB restore.
No frontend edits, runtime/source change, grant, command/Live or remote push.

Reused package4 wallet/equity implementation, not a second delivery. Financial
fixture tests validate through the actual ProfileRead consumer. BFF bundle build
PASS; schema generator and snapshot611PASS. Current Claude pin remainsbeed0225e;
new source/consumer work after that pin must be reconciled at landing, not
overwritten wholesale. Source census above is the checked-in contract, not a
claim of a new HK runtime inspection.

Resource cleanup: no DB/container/network/session/credential created. Tests
finished; dependency links and ignored build outputs retained for reuse.
Root217GiB free/66%used: NO_ACTION_NEEDED. Normal integration hook is reserved for
the frozen common-branch landing under §10.10c; this source slice uses focused
gates, docs use R0 §10.10d. No remote push or dev/main merge follows this work.

### Package6 final pin / next-ready work

Code `37bbecf92`:14files,+1958/-7, largely the new canonical JSON response fixture
and generated schemas/types, not1958 handwritten logic lines. Control API build
PASS on final source. Backend31, contract33, financial/Accounts8 PASS as scoped
above; BFF build, generator/snapshot611 and tracking/diff checksPASS. Independent
review ACCEPT with tail/filter test added. Producer delivered on support lane only;
not landed/installed/browser accepted. No new source migration or configuration.

Claude can now consume label fields and review all six package fixtures, preserving
approved components. **Gói1–6 source/fixture tasks delivered, not whole ELP2-10
qualified.** Next integrator work is reconcile these focused diffs with Claude's
reader changes and one frozen landing gate; next real backend work is Edge batch
financial/Return/Score source binding already listed, not repeated fixture work.
Claude returns reader/browser acceptance or exact contract request in this packet.
No new numbered package/phase, command/Live or runtime rollout starts implicitly.

## Package5 entry and contract handoff — Contributors, 23 October

Base `b29145100`, clean isolated support lane on entry. Claude source inspected
`beed0225ebe141157b81cb1e3c14a04c9c9a08b0`, including
[FE-CAT-5 corrective request](FE_CAT_5_CONTRIBUTORS_DIGEST_2026-10-23.md).
No frontend components, source runtime, DB/migration, deployment or remote push.
Backend agent owns model/schema/invariants; fixture agent owns BFF; independent
reviewer owns only new controller tests; primary owns generator/docs/integration.

Existing `groups` rejected populations above200. New optional query fields
`group_limit` (effective default200, range1–200), `group_after`, `group_before`
provide independent signed group continuation. They require nonempty `group_by`;
the two directions are mutually exclusive. Row `limit/after/before` are unchanged.
`group_page` is additive for old payload compatibility and emitted for grouped
queries only: limit, returned_count, authorized_filtered_count, next_cursor,
previous_cursor. Group counts describe the FULL authorized filtered query;
stage membership groups may overlap, so never sum groups into one book.

Each alpha group may publish `attribution {alpha_id,name,owner_user_id,
name_reason_code,owner_reason_code}`. Consensus is over its full authorized
membership, not `items` on the current page, and never an unrestricted identity
lookup. Names/owners absent or conflicting stay null with GROUP_NAME/OWNER_
NOT_PUBLISHED/AMBIGUOUS. Existing member semantics are `alpha_fleet_overview`;
this is not a portfolio label renamed as alpha. Field masking still applies.

Cursor namespace separates rows/groups and binds workspace/current authority,
source revision/generation, surface, filters, window, sort and limits. Changing
those restarts pagination, not reuse of a stale token. Each response keeps200
group and1MiB bounds; reductions run only for returned groups over full group
membership. No silent truncation or reduced denominator/share on a later page.

### Claude consumer action

Generated `execution-manager-models.d.ts`: `ManagerDatasetQuery` and
`ManagerDataset`. Existing Fund operation `executionManagerFundOverviewGetV1`
continues to serve Contributors. Add groupLimit/groupAfter/groupBefore in its
reader; keep row limit1 if desired. **The current reader has closed `hasOnly`
allowlists**: update envelope/group allowlists AND validate the new optional
shapes before deploying this grouped producer. Generated types alone do not
change runtime validation. Bare/non-grouped reads preserve the old envelope.
Read attribution directly; do not page-join
names. Read `group_page` to determine completeness instead of guessing from
groups.length>=200. Exactly200 can be complete. Reset both page cursors when
query/context changes; preserve workspace/environment/window through links.

Canonical static fixture:
`packages/contracts/fixtures/execution-manager-contributors.synthetic.valid.json`.
Opt-in review BFF supplies populated linked/scaled scenarios using this contract;
Claude tests long labels, narrow view, forward/back navigation and filters without
rewriting the accepted component. Fixture acceptance remains independent of
real-source commissioning. Browser/visual receipt is AWAITING_CONSUMER_REVIEW.

### Financial scope, source request and rollback

No Return or Score summation was added. Existing partitioned nonadditive return
still returns CONSOLIDATED_PATH_REQUIRED where a consolidated source path is
needed. Real group Score requires qualified precomputed alpha/version/population/
window semantics; identical numeric child scores are not such proof. Complete
fixture methodology is synthetic only. Remaining source owner is Edge coordinator
with TS/PM behind it: supply consolidated return and qualified exact-population
score publication/provenance before claiming complete real Contributors metrics.
This input does not block group navigation/name UI acceptance. Package4 batch
financial request stays OPEN. Rollback is source revert before install; no DB
or custody data touched. Next approved backend package6 remains queued until this
package's source/tests/handoff are committed.

### Package5 verification and limitations

- Backend model/ALL focused suites **108/108 PASS**; controller numeric parsing,
  cursor forwarding and workspace denial **14/14 PASS**. Covers207groups200+7,
  backwards paging, unchanged row page, source/scope/filter/limit-bound cursors,
  masked/ambiguous attribution and response invariants. Independent reviewer
  ACCEPT for this implementation scope; real-source metrics are not included.
- Manager generated contract suites **72/72 PASS** after fixes; Visit Digest
  **7/7 PASS** on ephemeral loopback. Initial contract run found strict AJV query
  refinement declarations and an existing anonymous-schema collision: fixed
  generator declarations and gave our package3 Visit Digest its canonical `$id`.
  No response shape/route behavior changed by the `$id` repair. Research analytics
  schema was not edited. Initial loopback sandbox EPERM retaken with bounded
  localhost permission; not treated as an application failure.
- Linked Contributors fixture final **4/4 PASS** and fixture BFF build PASS. Test-only
  expansion of the same linked graph exercises291groups using17/34 pages,
  full-population shares, query/workspace/direction/row-cursor refusal and ALL.
  Existing default large fixture has97groups;291 is a test scenario, not a claim
  about deployed data. Rich200group response exceeds1MiB and is explicitly
  refused; smaller group_limit traverses all groups without loosening the budget.
- ALL fixture now gathers bounded20-row source pages rather than treating the
  first200 rows (or an oversized response) as the full environment. Max10k rows,
  500pages and repeated-cursor detection; incomplete traversal stays unavailable.
- Generator drift checks, snapshot610files and tracking/diff checks PASS.
  Control API `npm run build` PASS; existing positive-BFF/ALL/lifecycle contract
  regressions **27/27 PASS**. No PostgreSQL changes warrant a new DB/restore test. No UI edit,
  preview rebuild or real-source test is claimed. Normal landing hook remains at
  frozen integration, per §10.10c; intermediate commit uses focused gates.
- Cleanup: no DB/container/network/test credentials created; ephemeral HTTP
  server closed by test teardown. Capacity217GiB free,66% used. Keep reusable
  dependency/build outputs; NO_ACTION_NEEDED, no broad cleanup.

### Package5 final source pin and next work

Code `ace3547ca`:19files,+1401/-24 including generated contract/fixture bytes,
not1401 hand-written backend lines. Build PASS before the final conditional
omission of group_page on bare reads; affected default-shape tests retaken2/2PASS
(106 deliberately not rerun). Fixture final4/4 validates every200response with
the backend schema and ungrouped response with the actual frontend reader.
Old grouped reader refusal was observed, so **do not deploy this grouped BFF
before Claude's reader patch**. No unsupported claim of zero consumer work.
Verification §10.10c focused lanes; normal integration hook belongs to later
frozen landing. Docs R0 §10.10d; diff/tracking/snapshot checks pass.

Producer source/fixtures delivered, not landed, installed or browser accepted.
Claude action: typed query + closed-reader mapping + Contributors continuation/
attribution, tests and browser1280/660; leave approved layout unchanged unless
separately reviewed. Source-input requests remain with Edge coordinator for
consolidated Return/Score and package4 batch figures. No new Bobby decision is
needed for those existing semantics. Backend next: approved package6 Names/finance;
do not redo delivered group paging or package4 projection while waiting for source.

## Package4 entry — Accounts list, 23 October

Base `b6c90263bb67ea3b4afbe6448587dc216222e2b1`, clean support lane above.
Assignment: finish the existing `execution.bindings-list.v1` figures/counts path,
not redesign Accounts or silently widen the separate scoped V2 DTO.
Read FE-CAT-4/DEBT-UXM07-052 packet and current Claude WP-K addendum at observed
`b805efb217dbcef26599deefff87236cebe7eb79`; WP-K group query/series proposals
are separate from this list projection and are not marked delivered here.

Task ownership: backend agent owns manager-lists/repository and focused tests;
fixture agent owns opt-in fixture-BFF overlay/tests; Codex owns review, migration
number reservation151, shared tracking and one integrated test run. No frontend
component edits, no source command, remote push or preview installation.

Required checks: migration/read roundtrip; figures preserve exact decimals,
currency and null/omitted/zero; list/counts share repeatable-read snapshot before
pagination; no unauthorized environment or per-binding source fanout; fixture
list/detail/exposure agree. Normal hook is reserved for frozen landing (§10.10c).
Tests that touch PostgreSQL use the existing disposable bounded gate, not live DB.
Rollback before installation is source revert; future forward migration retains
old data and the optional column, never destructive data rollback.

### Package4 source-input follow-up — FE-CAT-4 / DEBT-UXM07-052

The earlier request's `broker_account_sync_effective.native_equity` locator is
not established by the checked-in source census. Exact locator:
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/COLUMN_SEMANTICS_CATALOG.csv:261`.
That relation lists `balances` JSONB, `currency`, `synced_at`, not a top-level
native equity column. `paper-read/manager-records.ts` currently accepts scalar
and scalar-array fields, not an arbitrary broker JSON object. Do not widen it
to raw broker data or infer equity from wallet/buying power.

Remaining real-source input owner: Edge coordinator, with TS/PM producer owners
behind it. Required action: publish a bounded, versioned batch carrier keyed by
workspace/profile/environment/binding/account + exact source revision, with
qualified `native_equity`, virtual `used`/published `headroom`, unique sleeve
population, per-currency amounts, source observation time and completeness.
An explicit missing figure is null; a family not published is omitted. Supply
schema + sanitized example + source locators; preserve full-grain authorization.
Existing per-binding analytics exposure is not a batch proof and must not become
one source call per list row. Codex then connects that carrier to the existing
atomic `replaceBindings` input; absent input must remain absent on refresh.

This is an OPEN source/wiring request, not proof that real list figures are
already populated. The independent fixture adapter can serve complete linked
figures now. Scoped-manager V2 keeps its existing distinct DTO/field policy;
this package does not grant it legacy full-account figures.

### Package4 implementation and consumer handoff

- Additive migration151 (optional JSONB,32KiB bound, historical SQL NULL); no
  backfill and no installation. Atomic repository replacement sanitizes existing
  `BindingFigures`; page and binding-detail carry the same optional shape.
- `legacyBindings` uses existing `listWithSnapshot`: page, metadata and selected
  environment's count share a repeatable-read transaction. Count is full snapshot,
  not page size or search result. Other environments and global all/issues stay
  null, not zero, because this request has not authorized them. No new source
  reads per account. Existing cursor behavior is unchanged across requests.
- Reviewer caught JSON `null` versus SQL NULL in the new column; fixed before
  grouped PostgreSQL verification. No broad auth or scoped-V2 fallback change.
- Populated/layout-stress BFF uses one cached synthetic physical book per generated
  binding plus the existing deployment allocation graph. List, binding detail,
  Account broker facts and exposure agree per currency; wallet differs from
  equity; internal NAV is not relabelled physical equity. Named native scenarios
  are untouched; EXPIRED/NOT_PUBLISHED retain explicit absence scenarios.

Contract unchanged: `execution-manager-lists.d.ts` / `BindingItem.figures` and
`BindingsResponse.counts`, existing FE-CAT-4 canonical fixtures. No generator
change needed; snapshot609files check PASS. New linked scenario test is
`packages/contracts/test/execution-accounts-linked-fixture.spec.ts`, medium and
large populations across all3environments and every page, through real FE readers.
Focused contract+linked fixture8/8PASS; BFF buildPASS (agent receipt), independent
review SQL-null finding fixed; tracking/diff checksPASS. PostgreSQL/build/restore
result is recorded in final receipt below, not assumed here.

**Claude — AWAITING_CONSUMER_REVIEW:** reuse accepted Accounts components and
published figures reader; do not add a second client calculator. All four keys
on positive generated rows let existing consumer skip row fallback. Missing key
on real-source rows still needs the existing bounded fallback; null must not
trigger substitution. Display per-environment counts only when non-null. The
fixture's all-profile counts are valid in its full-access scenario; real selected
profile responses deliberately do not claim an all-profile total. Review list to
Account/exposure navigation, pagination, mixed currencies, explicit absence and
1280/660 overflow on a rebuilt fixture preview. Browser/visual NOT_RUN here.

**Remaining/backend next:** source batch carrier/wiring remains OPEN above;
installation and normal-hook integration separate. Package5 Contributors is the
next approved backend package, not started in this Accounts-only turn. No new
Bobby decision is needed for fixture consumption; Edge source request is written,
not claimed transmitted or accepted. No runtime/remote/deploy/Live changes.

### Package4 verification history

Initial bounded `control-api-test.sh` build and migration151 PASS. Test result:
15PASS/2FAIL, plus one suite failed to load the schema. Two new assertions assumed
ascending tie-break order while the default is descending; tests now request
`binding_id:asc` explicitly. Existing figures unit spec ignored the gate's
`PORTAL_CONTRACTS_DIR`; it now honors that mounted path. Neither fix changes
production code. Initial log `/tmp/accounts-package4-gate.log` SHA256
`170b6dfc485e140addf270f1714567835d40c99fafeb6754fb3c8fc2d75cd8f5`.

Retake uses identical3specs on one disposable PostgreSQL1CPU/1GiB, random loopback
port, one host Vitest worker; reuses the unchanged source build PASS instead of
spending another full build. Exact cell `accounts-package4-retake-20261023` is
owned by the retake script and removed on exit. This is focused verification,
not a new full integration-hook or connected Edge acceptance claim.

First retake:28/29PASS; the remaining failure was `beforeEach truncateAll` timing
out60seconds while clearing the entire unrelated application schema. It was not
a failed projection assertion. New suite now clears only its two owned tables;
no timeout/SLO was relaxed. Only its4tests are retaken; the other25PASS are reused.
Log `/tmp/accounts-package4-retake.log` SHA256
`58e7ba16b3876909e8da2137a02bc16c8bbf9aaf77c2e01b6de2433ad48c3eca`.

### Package4 final producer return — 0f0d5cc85

10 code/migration/test files, +342/-24; no frontend component edits.
Final projection-only retake4/4PASS, unchanged other specs25/25PASS reused from
the previous run:29 distinct tests, not a claim of one all-green first run.
Contract+linked fixture8/8PASS; ledger22/22PASS; snapshot609files, BFF build and
tracking/diff checksPASS. Control API build and migration151 PASS from initial
gate; no production source changes after that build (test-only corrections).
Independent read-only review ACCEPT after SQL NULL repair and detail carry fix.

Final log `/tmp/accounts-package4-final.log` SHA256
`718714ffbfc5b5256553bb351b5f020e6f2d1c2d2fc11e54d6b08c01bc729022`.
Retake dump/restore succeeded; projection digest matches the EMPTY final test
state (`d41d8cd98f00b204e9800998ecf8427e`), not proof of populated financial DR.
Official-writer roundtrip/nonempty figures are covered by the PG tests instead.
Disposable retake cell removed by trap; no source/runtime data touched. Root
217GiB free at entry. Dependency links/build outputs kept for reuse; no prune.

Intermediate source commit uses focused-gate exception §10.10c; normal frozen
landing hook remains pending. Markdown verification R0 §10.10d. Code is committed
on support lane only, not pushed or landed on the common Research branch.
Exit: storage/read and complete linked fixture delivered; DEBT-052 real batch
financial projection remains OPEN with exact input/action above. Claude can
consume fixture now; installation/source/browser are not silently marked PASS.

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
