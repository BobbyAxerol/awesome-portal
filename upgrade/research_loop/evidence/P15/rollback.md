# P15 rollback

1. Render and deploy a signed release with
   `CONTROL_API_FEATURE_RESEARCH_SEARCH=false`.
2. Verify P15 Search returns the typed feature-dark refusal while P10/P11/P14
   flags retain their independently approved values.
3. Do **not** drop/modify P10/P14 rows, source receipts, worker journals or
   immutable bundles; do not restart a worker, change an Execution profile,
   open a direct source database connection, or run cleanup commands.

A compatible future release may read the same immutable receipt. Rollback is
only an availability decision, never evidence deletion or reinterpretation.
