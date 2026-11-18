# Manager surface census v2 (candidate)

This directory is the N18 census revision that follows the frozen v1 census
(`../manager-surface-census-v1`, never modified). v2 is a superset: the 96 v1
relations (byte-identical entries) plus the 13 T1 relations captured by the
owner E1 census on 2026-11-16, 109 relations in total.

What differs from v1:

- `schema_version` is `portal.execution.manager-surface-census.v2`.
- `counts.relations` is 109; all other counts are unchanged.
- The 13 added relations are all `PROJECTION_INPUT`, consumer
  `PROJECTION_REDUCER`, delivery phase `N24`, no `screen_ids`, owner
  `TRADING_SYSTEM_SOURCE_OWNER`. A later revision upgrades one to
  `SCREEN_BOUND` only when a screen needs it.
- `source_snapshot_state` gains `UNKNOWN`: a relation PostgreSQL has never
  analysed (`reltuples = -1`) is neither `EMPTY` nor `NONEMPTY`. Seven of the
  13 added relations are in that state; none of the 96 v1 entries is.
- `source_artifacts` gains `e1_census_v2_relations` (sha256 of
  `../maximum-data-return-v2/DATABASE_RELATION_CENSUS.csv`) and
  `evidence_time` gains `e1_census_v2_capture`.

Class counts: SCREEN_BOUND 54, PROJECTION_INPUT 29, AUDIT_ONLY 13,
INTERNAL_ONLY 13.

Regenerate or verify with `scripts/execution-n18-census.py --census-version 2
--render|--verify`; run the gate with `scripts/execution-n18-census-v2-test.sh`.
The E1 pack (109 relations only) is in `../maximum-data-return-v2`. No v1 file,
Rust pin or runtime authority is touched by this directory.
