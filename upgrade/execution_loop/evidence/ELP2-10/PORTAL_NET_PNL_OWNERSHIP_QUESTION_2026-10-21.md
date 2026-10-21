# Portal → PM/TS economics: NET_PNL shared-account ownership question

Date: 2026-10-21. Delegation: Claude C5, approved by Bobby; Codex coordinates,
PM/TS own the economic semantics, Claude implements Portal after the answer.
**Prepared state: NOT_SENT. Owner acknowledgement: NOT_ACKNOWLEDGED.** Actual
delivery is recorded separately in the receiving owner's Unified journal.
**Semantic decision: PENDING_OWNER_ANSWER — not a selected formula or policy.**

## Exact observed Portal behavior

Implementation worktree `/home/bobby/portal-research-fe`,
`claude/fe-parity@7378d4232010de6033449e7f5323780eed5095ae`:

- `apps/control-api/src/execution-v2/manager-model.ts`:
  `dedupeManagerFacts` dedupes source identity first;
  `economicFacts` additionally dedupes valuation/balance snapshots by economic
  partition, kind, `economic_account_ref` and `ownership_partition_ref`.
- That snapshot set is `current_nav`, `balance_total`, `equity_30d_end_value`;
  it does **not** include `net_pnl`. Distinct source fact IDs can therefore be
  summed even when they refer to a shared physical account.
- `managerPartitionTotals` and the series observation writer reuse this grain;
  source-authority ambiguity can affect both dataset and series, not just UI.
- Claude locator: `upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P16.md`
  §3 row11, plus `REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md` SRC-F rows1/7/9/11.

This is not enough evidence to decide that every same-account pair is duplicate
or that different fact IDs are always additive. Do not silently change SUM,
dedupe by account only, invent attribution weights or modify the chosen Score
formula. No financial policy is selected by this request.

## Question to the economic source owner

For two source `net_pnl` facts identifying the same physical/economic account,
currency, valuation basis and time window, but attached to different
deployment/portfolio tuples or distinct fact IDs:

1. Are they repeated views of one cumulative account PnL, disjoint allocated
   contributions, or distinct economic events? Publish the exact grain and
   unique-key semantics, including source revision/effective time.
2. Define `economic_account_ref` and `ownership_partition_ref`; which source
   field proves physical-account equivalence, allocation exclusivity, ownership
   weights or overlapping population? How do fund and portfolio totals differ?
3. Bind window/origin, methodology, economic/cashflow revisions and included
   cost layers. Explain correction/supersedes/restatement without rewriting
   immutable original receipts; matching values alone cannot prove identity.
4. Return three bounded examples with expected fund and portfolio totals:
   a genuine duplicated view, valid distinct allocations and a conflicting
   duplicate. State the required typed refusal/absence when attribution is
   missing or conflicting. This asks for source examples, not fixture constants
   to be promoted into runtime authority.

## Source pins and owning reply locators

PM `/home/bobby/.worktrees/trading-system-pm-v1_1`,
`feat/portfolio-account-v1_1-parallel@e2efd91bc147f53f08c750e165fee67ebdb4b57a`;
TS-next `/home/bobby/.worktrees/trading-system-next-upgrade`,
`0cd356dab20dc385d9effbda408a0ea53280aa4b`.
Reply in PM's existing
`contracts/baseline/portfolio-account-v1_1/` financial/owner packet, linked from
`TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` §58.307/58.308 and current R2
`upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`.
If the definition is TS-owned, name the authoritative contract/revision in
TS-next's `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` and existing economic
source packet; do not delegate economic authority back to the Portal UI.

Return the decision, source locator/revision, exact payload fields, examples
and any installed/qualification limits. Claude then adds matching contract,
writer/reader and focused regression fixtures; Core reviews the implementation.
Until answered, this item remains a semantic gap, not a new formula or completed
financial qualification. No command/grant/Live authority is requested.

## Independence from Core recovery

Core's separate source-correlated cut has seven settled and one original
unresolved admission out of eight; lease
`785387ba-ef57-455d-a7ba-f92663baae60` / attempt
`07becd72-1e11-4ab9-8a96-d5fd7339f1a0` remains exclusively with Codex's same-key
recovery. This question must not duplicate any native call/session/revoke or
delay that recovery. No tests, code changes, economic writes, remote mutation
or credential reads were performed to prepare it.
