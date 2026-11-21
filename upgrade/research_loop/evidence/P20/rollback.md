# P20 rollback and cleanup

1. Set `CONTROL_API_FEATURE_RESEARCH_COMPARE=false` in the approved Research
   deployment overlay and redeploy through the normal workflow.
2. Keep migration `1723680000054` and all immutable Research rows. The P20
   table is only an expiring cache; it is not a reason to roll back a schema.
3. Expire cache rows through the bounded P20 runtime cleanup or a controlled
   maintenance operation. Never use cache deletion as a way to alter evidence,
   attempts, runs, source rows, selection/promotion facts or approvals.
4. The P20 disposable PostgreSQL proof container was deleted immediately after
   its pass. No long-lived test service, image pull or shared database remains.
