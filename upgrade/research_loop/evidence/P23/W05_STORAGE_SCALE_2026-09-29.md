# P23 W05 — synthetic storage-only scale on the isolated cell

2026-09-29 · Codex · `docs/research-loop-plan` · **W05 storage-only scoped PASS; P23 OPEN**.

This test used only the isolated `portal-research-p23-ol12` PostgreSQL 16
container (image `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`,
memory/swap cap 900,000,000 bytes) and the existing seven-service 5-GB
profile. It created session-local tables with `LIKE ... INCLUDING ALL` from
the **current** `research.trial_index`, `research.evaluations` and
`research.current_source_rows_v1` tables. This copies the current columns,
checks, uniqueness and indexes for a storage/page-plan measurement; it does
not copy foreign keys, RLS, importer triggers or application authority.
There was no Trading System, HMD, engine, browser or product API call.

The single `psql` session set `work_mem=1MB`, `temp_file_limit=512MB` and
`statement_timeout=600000ms`, inserted generated rows with `generate_series`,
ran `ANALYZE` and `EXPLAIN (ANALYZE, BUFFERS)` on 200-row trial/evaluation/
replay keysets and the transition keyset, then explicitly `ROLLBACK`ed.
Its first small-schema trial passed. The first full-size attempt stopped at
replay insert because a synthetic timestamp used `integer` arithmetic;
PostgreSQL aborted that transaction. The corrected retake used `bigint` and
completed; neither attempt wrote a persistent Research row.

| Measurement | Actual result |
| --- | ---: |
| Trial rows / evaluation rows / replay observation rows | 100,000 / 100,000 / 1,000,000 |
| Trial / evaluation / replay total relation bytes | 38,240,256 / 21,938,176 / 395,763,712 |
| Total generated relation bytes | 455,942,144 |
| Trial / evaluation / replay insert | 2,151 / 1,227 / 61,546 ms |
| 200-row trial keyset / evaluation keyset | 0.231 / 0.192 ms execution |
| 200-row replay tail / transition keyset | 0.188 / 0.322 ms execution |
| Seven-service cgroup series | 20 samples at 5-second spacing; 823,009,280-byte peak; strict caps PASS |
| Post-rollback synthetic tables / workspace / retained rows | 0 / 0 / 0 |

All four reads used the copied B-tree indexes; their actual plans showed no
sequential scan, temp-read or temp-write spill at `work_mem=1MB`. The
transition query returned 188 actual rows after ordinal 990000; its plan
used the copied source-ordinal index. The other keysets returned 200 rows.
PostgreSQL completed `ROLLBACK` in 153 ms. The host remained at 59% disk use
with 258 GB available in the follow-up read-only capacity check.

This satisfies the Guide's **synthetic storage-only** W05 shape and gives
real index, space and capped-memory numbers. It does **not** prove a
million-row Portal replay BFF, importer/retention throughput, RLS, a real
alpha/claim, or browser performance. Those are distinct P23/P24 gates.
No SLO, pool, admission, API/UI or Production setting changed. The exact
P23 cell is torn down without `-v` after this test; its existing volumes and
private receipts are retained.
