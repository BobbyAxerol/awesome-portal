# B10 CHILD_AUDIT_CLOCKS

Bound `researchChildAuditCompanionGetV1` (client `childAuditCompanionClient.ts`, hook `useChildAuditCompanion.ts`,
panel `ChildAuditCompanionPanel.tsx`): read on click, named page sizes 25/50/100, server `next_cursor` paging,
filters fold / closed context / exact `#` (exclusive with cursor). Custody told apart by name: FULL_SOURCE_RETAINED
(rows + manifest seal), LEGACY_SAMPLE (no rows drawn), NOT_RETAINED. Counts/drops/total verbatim; null = "not published".

Mounted in FreezeDetail (retained lane, only when `fold_ordering` is served). OrchestrationClocks (new) shows P11
`stage_events` as "orchestration · stage N ..." in SearchDetail B1 and Freeze ordering; RunProgress stage log rows are
tagged "orchestration".

NEEDS-SHARED: (1) ExecuteCandleReplay.tsx ChildAuditCard — label its 64-row witness "legacy sample · not full rows"
and mount `<ChildAuditCompanionPanel runId workspaceId />` (or link) there for S08. (2) tsconfig/vitest alias
`@portal/contracts-research-child-audit-companion` (I import by relative path, type-only). (3) FreezeRoute.tsx should pass
`workspaceId` to FreezeScreen (new optional prop).
Engine pool-freeze / first-OOS-read clock: none published in source, so none shown (pool.frozen_at stays typed absence).
