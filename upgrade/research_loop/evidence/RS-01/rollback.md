# RS-01 rollback

RS-01 is additive and feature-dark. Rollback is one of:

1. Keep the Research evidence/progress/replay feature flags disabled.
2. Select the R1-compatible reader/transform for historical R1 receipts.
3. If a future enabled R2 reader is withdrawn, deploy a signed release that
   disables that reader; retain source receipts, projections, series and the
   terminal checkpoint unchanged.

Do not update/delete R1/R2 rows, alter immutable triggers, rewrite historical
metric labels, drop the new tables/constraints, or change a global Execution
pool policy as rollback.

