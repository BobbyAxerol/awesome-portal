# Codex → Claude: integrate outstanding six-package handoffs

Date:24October2026 Asia/Saigon. Bobby requests integration before new backend work.
This packet is a handoff, not consumer ACK or authorization to deploy/push/merge
dev/main. Keep existing campaign rules and one integrator for common-branch landing.

## 1. Verified pins and what NOT to redo

- Codex lane `/home/bobby/portal-fixture-support`, branch
  `chore/complete-fixture-review-20261023`, source/docs tip `948136a8a` before this
  handoff. Source6 `37bbecf92`; source5 `ace3547ca`.
- Claude inspected `/home/bobby/portal-research-fe2`, branch
  `claude/post-land-20261022`, clean tip
  `beed0225ebe141157b81cb1e3c14a04c9c9a08b0`.
- Merge-base `1229059fbdb95400d4254921e1c9017b77a617bd`: lanes diverge. Similar
  files/receipts are present in both; do not infer missing code from ancestry alone.
  Do not cherry-pick the entire support history or replace shared files wholesale.
- Canonical detailed requirements, fixtures, tests and source debts:
  [six-package ledger](SIX_BACKEND_SUPPORT_PACKAGES_2026-10-23.md).

| Package | Observed consumer progress | Remaining action |
|---|---|---|
|1 Linked fixtures,0297c4902|Claude has reconciliation5c6ba3cf7 and later shared-world/scenario work|Preserve newer world/clock/aliases; reconcile latest support diffs and retake affected journeys, not rebuild graph|
|2 Timing,40d3540c7|Reader accepts EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED and empty unavailable_fields; stageTiming test exists|Verify against delivered timed fixture and browser; record ACCEPT or precise gap, do not rewrite reader|
|3 Visit digest,8822d58f2|83667ac73 wires persisted visit digest; beed0225e fixes reached import|Review final contract/fixture, seen409/CSRF/user/workspace cases; integration receipt, not duplicate implementation|
|4 Accounts,0f0d5cc85|7bdbbf07e consumes counts correctly; figures/handoff already present|Reconcile shared physical book/list-detail fixtures; verify absent/null/zero/mixed currencies; real source batch remains open|
|5 Contributors,ace3547ca|No group_page consumer observed in inspected reader; packet still has older request|Implement new query/reader/group continuation and attribution below|
|6 Names/finance,37bbecf92|No acceptance of new scoped child-label contract observed|Integrate optional labels and finance fixture repair below|

Observed code is not a browser acceptance receipt. Conversely, old
AWAITING_CONSUMER_REVIEW text is not proof that Claude did no work. Return separate
code-integrated, fixture-verified and browser-verified status for each package.

## 2. Priority A — Contributors consumer before grouped BFF rollout

Read package5 section in ledger and generated `execution-manager-models.d.ts`.
Operation remains `executionManagerFundOverviewGetV1`; no component redesign.

- Add optional group_limit/group_after/group_before to typed request port;
  row limit1 can remain. One group direction only, nonempty group_by.
- Extend closed runtime reader allowlists AND validation for optional group_page
  and groups[].attribution. Generated types alone are insufficient: old grouped
  reader was observed to reject the new response. Bare reads remain unchanged.
- group_page gives limit/returned_count/authorized_filtered_count/next_cursor/
  previous_cursor. No more completeness guess from groups.length>=200.
- Attribution carries alpha_id/name/owner_user_id and name/owner reason codes.
  Consume directly, not join from row page or global identity lookup.
- Reset cursors on workspace/environment/window/filter/sort/limit changes;
  preserve context in links. Full-group totals stay full on every page.
- Respect1MiB response bound: request a sensible bounded group page (e.g. tested
  17/34/50), support continuation; do not raise budget or silently drop groups.
- Use canonical execution-manager-contributors.synthetic.valid.json and linked
  fixture tests; cover >200, exactly200 complete, next/back, masked labels and
  unchanged full-population shares. Real Return/Score source gap remains explicit.

## 3. Priority B — names and financial fixture integration

Read package6; generated `execution-resource-scoped.d.ts` adds optional
portfolio_name and portfolio_name_reason_code on DeploymentsScopedRow and
PortfolioAllocationsScopedRow. Update closed scoped reader for those fields,
including null+reason and legacy absence; keep ID fallback and existing design.
Use execution-resource-portfolio-names.synthetic.valid.json. Do not infer rights
from labels or expose a hidden portfolio via a client-side lookup.

Integrate `review-finance.ts` + focused `review-relations.ts` wiring against your
newer world code, not file replacement. Generated Account budgets/exposure use
one graph and exact decimals. Wallet/equity remain distinct through package4.
Fixture budget10%gross+500headroom is a declared synthetic scenario, not TS config.

Important repair: public Blotter caps fills at100 while orders may be200. Source
slice reuses complete small fixture pages for order VWAP/fees, preserving public
pagination. Tests cover1500orders, tail after1300, filtered FILLED+ETHUSDT and
mixed fee currencies. Preserve your newer scenario overlays while ensuring they
do not reintroduce page-based false zero. No changes to real allowlists/authority.

## 4. Integration workflow and exit

1. Read current rules, Unified §14, sync and ledger; repin clean/dirty state of
   both lanes. ACK this packet with owned files and findings in your own packet.
2. Compare semantic diffs for package5/6, preserve both sides' tests/docs/evidence.
   Shared files needing care: review-manager.ts, review-relations.ts, contracts
   snapshot/generator outputs and Unified/sync. Regenerate outputs from reconciled
   sources; do not manually splice generated types or revert newer scenarios.
3. Claude implements consumer/fixture changes in own lane. Codex remains common
   branch integrator; do not independently merge/rebase shared branch, force-push,
   deploy or touch dev/main. Return exact source SHA for coordinated landing.
4. Focused reader/contract/fixture tests first, one affected tsc/build as needed.
   Browser on approved fixture environment at1280/660: overflow, long labels,
   navigation/back/reload, group paging, counts, digest actions, Account↔Portfolio
   and order/fill consistency; console and request failures recorded.
5. Reuse unaffected receipts with impact note; one normal hook at frozen landing.
   No repeated full gate for Markdown. No need to wait for Edge to test fixture UI.
6. Return per package ACCEPTED or CHANGES_REQUESTED with exact locator, tests,
   source/bundle pin, browser receipts, cleanup and remaining real-source gap.
   Update Unified/sync without erasing historical failures. No claim all six
   browser-qualified merely because producer tests pass.

## 5. Things deliberately not assigned again

Do not reimplement delivered Visit Digest, timing or Accounts counts. Do not
invent real financial fields: broker wallet/equity, PM budget/exposure definitions,
order summaries and group Return/Score await the Edge coordinator's qualified
publication. They do not block positive fixture UI review. No new backend package
starts in this handoff; close integration feedback before choosing next backend work.

Dispatch state: written and linked in Codex lane; user receives prompt/path.
No claim that Claude has read/ACKed this new packet until its receipt exists.
