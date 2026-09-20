# P07 rollback and recovery boundary

P07 has no running worker, browser action, deployment or imported-source
execution path to stop. A safe rollback is a **reader/route rollback**, never
deletion of provenance:

1. Roll back Control API and Portal API images/configuration together so the
   private analyser route and public same-origin P07 controller are absent as
   one coherent release slice. Do not expose the analyser as a public route.
2. Do not delete `research.import_sources` referenced by
   `research.alpha_versions`, `research.alpha_digest_claims`, activation audit
   rows or prior attempts/runs. They are immutable reproducibility evidence.
3. Expired unbound source rows may continue through the same bounded cleanup
   operation; never run a broad source/table purge.
4. Do not alter protected QuantBT source, existing AlphaVersion identity,
   active registry pointer, execution alpha, P04 data path or future P10
   worker merely to undo a P07 reader/UI deployment.
5. If analyser contract needs revision, publish a new schema/version, require
   parse + gates again and retain old receipt as historical evidence. Do not
   mutate stored bytes or reuse a receipt across an analysis digest.

The P07 test teardown removes only its exact disposable tmpfs PostgreSQL
container. It never reaches a persistent database, volume, runner, release,
historical source, Execution service or Trading System process.
