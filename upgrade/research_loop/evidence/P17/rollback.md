# P17 rollback

1. Render and deploy a signed release with
   `CONTROL_API_FEATURE_RESEARCH_REPLAY=false`.
2. Verify the Replay route is feature-dark while P13 Evidence retains its
   independently approved state.
3. Do **not** drop/rewrite P13 rows, delete immutable source facts, restart a
   worker, alter an Execution profile, access a source/artifact database or run
   a broad Docker/cache cleanup.

P17 writes no replay receipt or checkpoint. Availability rollback requires no
data rollback, and a compatible future release may read the same P13 revision.
