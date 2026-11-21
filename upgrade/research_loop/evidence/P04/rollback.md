# P04 rollback

P04 has no migration, feature flag, runtime container, deployed dependency or
new job-submission operation. The only exposed product surface is the
read-only Atlas endpoint.

1. If P04 has not been merged, discard the P04 commit only; do not alter the
   existing Research or Execution runtime.
2. If a later phase has started jobs, rollback is a **release-pointer decision**:
   keep every historical run pinned to its recorded engine identity and do not
   rewrite a 1.1.1 result as 1.0.8.
3. Revert the P04 dependency/catalog/API snapshot together as one commit, then
   rerun the frozen compatibility and provenance gates.
4. Keep `wfo/folds.parquet` v1 reader shape. The additive
   `wfo/folds_extension.v1.parquet` can be ignored by a rollback reader; it is
   not a replacement for the stable artifact.

No downgrade is performed in place, no artifact is deleted, and no HMD or
Execution/Trading System data is touched.
