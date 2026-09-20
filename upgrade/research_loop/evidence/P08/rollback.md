# P08 rollback and recovery boundary

P08 has no deployed worker or browser consumer to stop. A safe rollback is a
paired Control API + Portal API **reader/route** rollback:

1. Remove the public same-origin controller and the private snapshot route
   together; never leave a public controller that can call an absent private
   authority.
2. Retain immutable `research.preflight_manifests` records and referenced
   shared snapshots. Do not delete research evidence, HMD data or source bytes
   merely to roll back a reader.
3. A future incompatible schema revision invalidates old opaque preflight
   tokens at the submitter boundary and publishes a new versioned contract.
   It does not update existing manifest rows or silently resnapshot data.
4. Expired metadata cleanup remains actor-scoped and bounded. It never reaches
   shared snapshot files, business tables, QuantBT, Execution or Trading
   System resources.
5. The test teardown removes only its named disposable tmpfs PostgreSQL
   container. No persistent database, Docker volume, image or deployment is
   touched.
