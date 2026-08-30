# Manager surface census v1

This directory is the immutable N18 planning boundary for the Execution Loop
Manager expansion campaign. It inventories the complete known source surface
from committed sanitized artifacts; it does not query AWS-HK, PostgreSQL,
Redis, a broker or a CLI.

`manager-surface-census.v1.json` freezes:

- 96 Manager runtime relations and their product classification;
- five published Manager-v2 GET primitives;
- 104 published Gateway operations and 64 CLI catalogue actions;
- 27 current Portal read capabilities and nine requested command contracts;
- BR-EX-41 through BR-EX-71 with one delivery phase each;
- the corrected six-relation N17B Paper baseline;
- Paper, Sandbox and Live availability without inventing source support.

`source_snapshot_state` only retains the sanitized `NONEMPTY`/`EMPTY`
classification from the owner capture. It never retains counts or business
rows. `profile_availability` is Portal availability, not a claim that the
underlying relation is absent. `UNAVAILABLE` therefore remains an honest
state until the named delivery phase closes.

Run the deterministic gate with:

```bash
./scripts/execution-n18-census-test.sh
```

Any relation, catalogue, ledger or digest drift fails closed. Regenerate the
fixture only as part of a reviewed N18 contract revision; never hand-edit it.
N18 adds no endpoint, migration, source traffic or runtime authority.

