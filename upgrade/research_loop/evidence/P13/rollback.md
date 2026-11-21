# P13 rollback

1. Render and deploy a signed release with
   `CONTROL_API_FEATURE_RESEARCH_EVIDENCE=false`.
2. Verify the two P13 routes return the typed feature-dark response and that
   P10/P11 flags retain their independently approved values.
3. Do **not** drop `research.run_evidence_*_v1`, delete source receipts,
   rewrite progress events/bundles, restart a worker, alter an Execution
   profile or run a database cleanup command.

The future compatible release reads the same immutable source/projection
revisions. Rollback is an availability decision, never evidence deletion.
