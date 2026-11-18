# Portal → PM: original command07 commissioning request

Date: 2026-10-21. Delegation: Claude C4, approved by Bobby; Codex coordinates,
Claude owns Portal implementation/consumer, PM/TS retain economic authority.
**Prepared state: NOT_SENT. Owner acknowledgement: NOT_ACKNOWLEDGED.** Actual
delivery is recorded separately in the receiving owner's Unified journal. Writing this
file is not delivery, approval, commissioning or connected acceptance.

## Scope and observed pins

Original request: Edge EPG10-07, RG03/RG04/RG16/RG17; no new phase.
Read-only HK observation, not a runtime scan or a test:

- PM `/home/bobby/.worktrees/trading-system-pm-v1_1`,
  `feat/portfolio-account-v1_1-parallel@e2efd91bc147f53f08c750e165fee67ebdb4b57a`.
- Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
  `feat/execution-edge-upgrade-v1_2@276536c2039b85549b8b7b2ae6049d7370851a9c`.
- Portal canonical `docs/research-loop-plan@7818d5631e0da37563bca5715fd46d40b66ef1de`;
  implementation `claude/fe-parity@7378d4232010de6033449e7f5323780eed5095ae`.
  Both have owner Markdown WIP; neither pin is asserted as the installed V2 UI.
- PM baseline directory: `contracts/baseline/portfolio-account-v1_1/`.
  `pma11-14-edge-command-transport.json` SHA256
  `83d251e847169571bdfd13839d9a2bcace7db3dda1e5be5b340650a56a6437ba`;
  `pma11-14-edge-command-handoff.json` SHA256
  `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b`.
  Qualified runtime cells and native targets remain empty.
- Current-recall handoff `pma11-14-current-recall-read-handoff.json` SHA256
  `ea9f1fa90b34f483e8bdaf2d61b30e16237d39b76ec005788aa9bc59fd0edb7f`,
  `QUALIFIED_ISOLATED_SOURCE_NOT_INSTALLED`.

## Already implemented; do not rebuild it

PM has command lifecycle/held-COMMIT and bounded transport implementation;
Edge has relay/ledger/recovery source. Current-recall read is also implemented
and isolated-qualified. Portal has typed refusal, status/workflow and consumer
contracts. These facts do not commission actual submit/status cells; do not
turn old `NOT_RUN` wording into a request to rewrite existing code.

## Requested owning return

1. Return the first genuinely commissioned **operation × environment × native
   target/profile** cell, with authenticated submit/status endpoint references,
   current human/session/workload/delegation and policy revisions. Empty cells
   remain unavailable; do not activate all structural capital shapes together.
2. Provide authority held through outer COMMIT, including revoke/response-loss,
   original/latest complete outcome, same-key conflict, UNKNOWN recovery and
   one-effect evidence. APPLIED is not venue-filled. Recovery never resubmits
   with a new key; authoritative retention/idempotency policy must be explicit.
3. Disposition current-recall read separately from historical status: original
   recall identifier, relationship to command ID, exact remainder and five CAS
   fields, current read authority, and actual installed consumer binding.
4. Return source/image/config pins, actual receipt paths, private reference
   names/hashes and precise qualified scope. Review current TLS evidence rather
   than recycling an old expired-certificate claim. No secret values in Git.

## Owning reply locators and completion

Reply in the **existing PM baseline handoff/current-recall packet**, linked from
`/home/bobby/.worktrees/trading-system-pm-v1_1/TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md`
§58.307/58.308 (observed lines84878/84904; sections are stable locators).
Detailed authority guide is the current R2 in that PM worktree:
`upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`.
Coordinate the same result with Edge's existing
`upgrade/evidence/execution-edge-v1_2/EPG10-07/COMMAND_RELAY_AND_OWNER_RETURN.md`.
ACK must name owner, accepted/change-requested scope and exact next return;
delivery alone is not ACK. Portal records a new consumer receipt only when the
matched cell is actually consumed and tested.

## Boundary and concurrent Core recovery

This request does not authorize runtime changes, grants, commands or Live.
Existing scoped approvals remain valid; request exact missing admission inputs,
not renewed generic permission. At the source-correlated cut, Core retained
eight admissions: seven settled and original lease
`785387ba-ef57-455d-a7ba-f92663baae60` / attempt
`07becd72-1e11-4ab9-8a96-d5fd7339f1a0` unresolved. Codex owns its existing
transport fix and same-key recovery. Do not duplicate issue/revoke/cleanup or
infer command authority from the separate Research READ/SSE proof. No new
tests, remote writes or operational actions were performed to prepare this file.
