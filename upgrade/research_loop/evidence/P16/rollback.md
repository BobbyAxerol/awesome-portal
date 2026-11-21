# P16 rollback

1. Render and deploy a signed release with
   `CONTROL_API_FEATURE_RESEARCH_FREEZE=false`.
2. Verify the Freeze GET/verify routes remain feature-dark while P10/P11/P14
   flags retain their independently approved values.
3. Do **not** drop/rewrite P10/P14 rows, delete immutable source facts, restart
   a worker, alter an Execution profile, access an artifact/source database,
   or run a broad Docker/cache cleanup.

P16 writes no freeze receipt, so availability rollback never needs data
rollback. A compatible later release may read the same P14 revision.
