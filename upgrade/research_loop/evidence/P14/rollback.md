# P14 rollback

1. Render and deploy a signed release with
   `CONTROL_API_FEATURE_RESEARCH_SPLIT=false`.
2. Verify the P14 route returns the typed feature-dark response and P10/P11
   flags retain their independently approved values.
3. Do **not** drop `research.run_split_*_v1`, delete source receipts, rewrite
   progress events/bundles, restart a worker, alter an Execution profile,
   open a holdout, or run a cleanup command.

A compatible future release can read the same immutable source/projection
revision. Rollback is an availability decision, never evidence deletion.
