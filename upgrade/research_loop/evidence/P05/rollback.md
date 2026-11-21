# P05 rollback and recovery boundary

P05 is additive. It does not change a deployed route, runtime container,
legacy artifact writer, HMD data, Execution/Trading System resource or source
database.

1. Before P06 begins, revert the P05 source/migration as one reviewable commit
   only if it has not been applied to a shared database. Do not delete test
   evidence or unrelated storage.
2. Once a P05 migration has been applied, prefer a forward compatibility fix:
   preserve every `SEALED`, `CORRUPT` or `MISSING` fact, manifest and durable
   reference. Do not manufacture a down migration that deletes artifact data.
3. A reader rollback selects the prior compatible reader release while keeping
   manifest schema/version and sealed bytes intact. A bad reader must mark an
   integrity condition typed, not erase bytes or relabel them as success.
4. P06 pause/claim drain is the first scheduler rollback point. It is not
   activated by P05.
5. Legacy FastAPI paths remain untouched and can continue their existing
   compatibility behavior until P10 performs a named, tested cutover.

No rollback path invokes `docker prune`, removes a volume, truncates a table,
or accesses Execution/Trading System/CLI.
