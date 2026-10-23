# Complete positive fixture support — Codex → Claude, 23 October 2026

## Decision and scope

Bobby requests a complete, linked synthetic development world to review journeys
and UI before every real Edge API is connected. The default review scenario must
show populated charts, financial facts, lifecycle and workflow; it must not inherit
real-source unavailability. Synthetic `AVAILABLE`, `COMPLETE`, `FRESH` and
`VERIFIED` are legitimate scenario values. Do not add repetitive warning copy to
each card. Keep fixture provenance in the review harness/receipt, with an optional
single unobtrusive review indicator. Real runtime rules remain unchanged.

This delivery adds **two fixture producers**, not all 42 catalogue families and not
a browser acceptance claim. Claude owns BFF/component wiring. No production,
credentials, migration, source runtime, command or Live activation is involved.

## Inputs / pins

- Claude source used: `1229059fbdb95400d4254921e1c9017b77a617bd`.
- Worktree: `/home/bobby/portal-fixture-support`, branch
  `chore/complete-fixture-review-20261023`, created from that Claude source.
- Latest read-back of Claude advanced to `4230ae2f6385fcffcc2a0d7d5664b8e537039516`.
  Its eight newer commits add populated Paper/Sandbox/Canary/Live review bodies,
  lifecycle hooks and tests. Preserve/reuse `bffSimulatedStage.ts` and WP-F3;
  do not rebuild these screens or treat the older missing-stage notes as current.
- Edge SSH read-only: `bobby@16.163.212.33`, worktree
  `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, observed HEAD
  `d4e1bee6b2c90cf5340391f036d6df27101b83ce`. Peer WIP was preserved.
- Actual source catalogue:
  `services/portal-execution-edge-rs/contracts/execution-catalogue-v1/registry.json`
  SHA256 `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67`.
  This path is on HK; do not invent a local mirror. It lists 42 logical families
  (39 Edge + 3 Portal views), not 42 commissioned runtime endpoints.

## Delivered source and focused acceptance

Producer code commit: `5251da70b` (4 new files, +209 lines). Documentation is a
separate R0 commit; source remains in this support lane pending integration.

1. `packages/contracts/tooling/execution-manager-positive-series-fixtures.mjs`
   exports `buildPositiveManagerSeries({ lane: 'FIXTURE_LAB', nav, pointCount })`.
   Pass a populated canonical NAV response. It returns `{ NAV, NET_PNL, RETURN,
   DRAWDOWN }` in the **existing served ManagerSeriesResponse shape**. Each view
   shares subject IDs, partition, selected window and synthetic book; opening and
   closing NAV are preserved. PnL/return/drawdown are calculated with fixed-point
   BigInt arithmetic. Default 240 points; fixture tests exercise 3/240/1440.
   This is a test-data density range, not a new API limit or performance claim.
   There are no manufactured midpoint gaps or SOURCE_GAP reasons in this profile.
   Cross-currency money is incomparable; ratio views follow the existing producer
   comparison semantics. No cross-currency sum is performed.
2. `packages/contracts/tooling/execution-manager-positive-world.mjs` exports
   `positiveManagerWorld()`, extending the existing `topologyWorld()` identity graph:
   three alpha/portfolio/deployment tuples, two physical accounts (one shared),
   Paper/Sandbox/Live **synthetic environments only**. Allocation + realized +
   unrealized PnL equals unique-account balances; free + locked equals total.
   Original negative/multicurrency factories remain unchanged.

Focused command, one worker, no Docker/DB/build/network:

```sh
cd packages/contracts
./node_modules/.bin/vitest run test/execution-manager-positive-series.spec.ts \
  test/execution-manager-positive-world.spec.ts --maxWorkers=1 --no-file-parallelism
```

**10/10 PASS**, 2 files, 3.56 seconds on 23 October 09:28 UTC. Series payloads
validate against both JSON Schema and backend Zod. Tests cover exact book tie-outs,
identity, no mutation, deterministic generation, density, window boundaries and
mixed-currency comparison. An initial test incorrectly expected ratio currency
refusal; implementation/test were corrected to the existing producer derivation,
not by weakening the contract. Independent read-only review of arithmetic/graph
found no blocker; focused tests are the acceptance evidence.

No served schema changed, so no generated DTO regeneration is required. Intermediate
commit uses campaign §10.10c focused verification, not another full landing hook.
Existing frozen integration is untouched. No processes or test containers remain
from this slice; worktree/dependency symlinks are retained for handoff.
Documentation verification: `git diff --check` and
`scripts/execution-tracking-test.sh` PASS; handoff/guide links resolve locally.

## Claude: integrate now, without waiting for Edge

1. In your owned `apps/portal/fixture-bff/review-manager.ts`, add a complete-positive
   profile using the series helper. Existing source-dark/partial profiles stay
   separately selectable. Do not blanket-relabel real responses.
2. In `apps/portal/fixture-bff/review-relations.ts` / BFF composition, consume the
   shared positive world. Derive table endpoints and series NAV template from the
   same selected tuple/book. Do not maintain independent totals in each screen.
   Test account shared by two deployments to avoid counting its balance twice.
3. Reuse your `1229059` sibling contracts/fixtures for approval evidence, incident
   children, operation audit, alpha lifecycle and entity search. No duplicate DTOs.
4. Populate positive navigation: Overview → Fleet/Portfolio → Alpha/Account →
   deployment → approval/evidence → operation/status → incident/audit → history.
   Resolve all fixture foreign keys and back-links. Add in-memory scenario
   transitions for plan/apply/status/retry with deterministic reset; never call
   real command transport from the fixture adapter. Reuse the latest WP-F3 stage
   variants; this instruction extends their connections, not a request to redo them.
5. Keep the production consumer/DTO boundary the same. Switching review source
   selects the real API adapter; it must not require rewriting components or
   deleting mock constants from each component.
6. Browser receipt: primary happy path + dense/long-name/large-number variants at
   1280 and 660; charts/tooltips, table scroll, pagination, dialogs and back-links;
   zero overflow or accidental upstream calls. Separately select denied, stale,
   empty, missing and exact-zero scenarios. Do not infer UI acceptance from these
   producer unit tests. Preserve approved design, avoid repeated technical prose.

## Complete catalogue coverage backlog (not all delivered by this slice)

For each exact family below, record source field → Portal DTO → fixture factory →
consumer route/panel → browser receipt. Unmounted runtime is **not** a reason to
leave its positive fixture blank. Where no Portal DTO exists, add a typed contract
and producer fixture first; do not inject arbitrary fields that validators discard.

| Scenario group | Exact catalogue family IDs | Required linked story |
| --- | --- | --- |
| Identity and ownership | `user_identity_mapping`, `portfolio_registry`, `portfolio_membership`, `alpha_registry`, `alpha_ownership`, `deployment_registry`, `portal_identity_profile_session` | Distinct researcher, deployer, reviewer; historical owner and current membership; self/other access scenarios |
| Account and capital | `internal_accounts`, `venue_physical_account_registry`, `account_binding`, `root_capital_limit`, `economic_capital_assignment`, `budget_entitlement`, `execution_grant_reservation`, `balances_collateral` | Shared account, separate economic assignment vs risk budget vs exposure cap, exact totals and currencies |
| Controls and lifecycle | `administrative_locks`, `recall_requests`, `trading_state`, `archive_paper_watch` | Pending/applied/rejected recall, lock reason, state history, origin/clone link; successful scenario by default |
| Trading journal | `order_intents`, `obligations_unknown_execution_outcomes`, `orders_execution_status`, `fills`, `positions_episodes` | One intent→order→partial/final fills→position episode; separate rejected/cancelled/unknown recovery variants |
| Financial ledger | `fees_funding`, `accounting_postings_corrections`, `economic_journal`, `valuation_prices_used`, `risk_state_limits`, `reconciliation` | Exact fees/funding, correction lineage, valuation cut, reconciled account and explicit break/resolution scenario |
| Workflow and transport | `command_receipts`, `operational_audit`, `publication_catalogue_manifest`, `sync_health_cursor_retention`, `recovery_quality_events` | Shared command/idempotency/receipt IDs, actor and policy, cursor continuation, revoke/recovery variants |
| Reports, Score and Manager | `report_snapshots`, `qbts_per_alpha`, `manager_alpha_score`, `portfolio_score`, `regime_fit`, `fund_portfolio_overview`, `alpha_fleet_overview` | Report→source cut; score raw/contribution/composition, exact window/portfolio membership; rich synthetic scores without claiming production calibration |

## Backend requests / next-ready work

- **Ready now:** the two producers above; Claude's new sibling contracts already
  exist. Queue open incidents already have a positive fixture implementation;
  do not reopen the historical null-only debt.
- **Contract gap needing coordinated work:** Manager Fleet stage entered-at / days
  remain constrained by `execution-manager-lifecycle-semantics.mjs` and
  `execution-manager-p1-fixtures.mjs`. The lifecycle sibling already carries timing;
  project it into a served typed Manager field before showing real numbers there.
  Change shared contracts/pins after the currently frozen integration, not during it.
- **Digest baseline:** Overview still needs an explicit workspace/user comparison
  baseline contract; do not invent it as a frontend payload. Claude can implement
  it under current backend ownership and request Codex review.
- **Independent ongoing Core work:** connected READ/STREAM, Manager trust, financial
  source binding, command gateway and numeric qualification remain separate real
  integration obligations. They do not block fixture UI/journey acceptance.
- Rollback of this slice: remove the new BFF profile/import when wired; original
  factories and real routes are untouched. No retained data or runtime rollback.

## Pasteable assignment

Claude: read this packet and campaign §10.14. Build the complete-positive review
profile from the delivered helpers and your existing sibling DTOs; use one linked
fixture graph, not independent screen constants. The default happy path must show
all contract-supported panels with rich positive data, regardless of real Edge
readiness. Keep error/absence cases separately selectable. Complete the 42-family
coverage matrix with explicit contract gaps, wire all route/back-link journeys,
and browser-test density/overflow at 1280/660. Keep approved components/design.
Return consumer receipts with exact SHA; no source commissioning is required for
synthetic UI acceptance. Send Codex concrete shared-contract gaps for review.
