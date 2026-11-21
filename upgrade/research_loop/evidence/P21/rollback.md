# P21 rollback boundary

P21 rollback is a **feature-admission rollback**, not a data rollback.

1. Set `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=false` through the
   normal profile/release process.
2. Do not truncate, delete, rewrite, VACUUM FULL, restore-over, or manually
   alter `release_candidate_*_v1` tables, existing Research runs, reports,
   evidence, splits, source projections, or retention pins.
3. Do not send a cancellation, revocation, approval or Execution command:
   P21 never created one. A locally sealed pack remains a retained immutable
   record with `NOT_DELIVERED` / `NOT_APPROVED`.
4. Verify the composer endpoints fail closed with typed 503 and unrelated
   Research/Execution routes retain their prior behavior.
5. Record the feature revision, timestamp, operator and affected profile in
   the release journal. Re-enable only after the failure has a focused
   regression proof.

This boundary intentionally keeps future P22 publication reconciliation
possible. Deleting a local pack to make a UI look unsealed is forbidden.
