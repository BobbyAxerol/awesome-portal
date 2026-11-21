# Full qualification goal — F6, upgrade and verifier checkpoint

Date: 2026-09-27 · Codex · branch `docs/research-loop-plan` · working base `decb5f6c`.
Scope: first checkpoint of Bobby's full eight-group qualification goal, not a
replacement goal and not full P23/P24 acceptance. No push/release/runtime rollout.

## Instructions and authoritative sources read

- Root AGENTS; Research A13; Unified §13.3/§13.4.1 and P23/P24; full private goal objective.
- P12 README, phase-report, p12-closure-codex and dedicated PostgreSQL runner.
- P22 current backend packet and P23 README/phase-report/OL-12 plan.
- Guide P23/P24, §16 workload/SLO/fault/scenario matrix.
- E11–E17 final acceptance and commit-gate receipt (not reused as full qualification).

## F6 — CLOSED backend regression

`bash scripts/research-loop-v11/test-p12-postgres.sh` first reproduced **9/11**:
one expectation omitted the published `source.lane`, the other expected a
P13 revision from an RS-02 seal-only fixture. These are stale assertions,
not permission to fabricate a projection or drop value/provenance checks.

The repaired test follows both actual named contracts:
persisted P13 keeps `PORTAL_PERSISTED_RESEARCH`/`p13r1_…`/series digest;
retained RS-02 keeps `PORTAL_RETAINED_CURRENT_SOURCE`/`rs02r1`/null series digest.
Card `evidence_revision` is null when there is no P13 projection. It additionally
checks exact three metrics and their OOS scope/definition, source values,
first/last/global extrema, the immutable seal manifest, and zero P13 projections
after reading. No production/service/contract semantics were changed.
Second actual run: **11/11 PASS**, exact tmpfs PostgreSQL containers removed by trap.

## Migration compatibility — current-history proof

Read-only actual shared-preview `pgmigrations` on 2026-09-27 ends at
`1723680000067_research-journey-descriptor-v3`; no 068/069 rows are recorded.
Those contributor packet labels are not evidence that they ran on this DB.
Shared preview itself was not migrated, restarted or modified.

New `research-preview-upgrade.spec.ts` runs the actual <=067 source chain on
disposable PostgreSQL, creates historical-run/workspace/password/session/user
sentinels, then invokes the unchanged production migration CLI through 076.
Every old ledger row (including microsecond timestamp and id) is unchanged;
data/auth JSON byte digest is unchanged; overview constraint and convergence
index exist. A second migrator invocation appends no row and changes no
data/auth bytes. **2/2 PASS**. No ledger repair, renamed historical row,
`checkOrder` weakening, SQL-file rewrite or DB deletion on a runtime.

This proves the current 067→076 and already-current restart paths. It is not a
claim about an unknown host whose ledger actually contains conflicting 068/069;
such a host must be inspected and stays fail-closed. Actual candidate rebuild
and full restore/pin preservation remain F3/P23/P24 gates.

## P23 verifier correction — tested, not qualified

- All 15 T-id descriptions equal the canonical Guide P23 table; a contract test
  reads that table and fails on mapping drift.
- Receipt references must exist as bounded private regular files and their
  actual SHA-256 must match. Missing, symlink, changed, public or wrong-candidate
  proofs are rejected, including a change after intake.
- Every envelope binds exact project, loopback URL and candidate source SHA.
- T01/T11 cannot pass without complete capped cgroup time-series plus 20 actual
  principal read evidence in the same window. T01 also requires active/queued
  heavy work and completion. Runtime JSON is matched to its hashed locator.
- Wrong manifest/project selectors are refused before executing measurement.
- Named Library/sparkline reads are supported without widening to legacy
  producers, Execution commands or a non-Research target.

Focused verifier: **12/12 PASS**. Node resource/read samplers: **7/7 PASS**.
These verifier fixtures are technical tests, not real mixed-workload evidence.
No P23 T row is closed merely by this checkpoint. Mandatory commit hook runs
the required whole-workspace gate; its actual result is retained separately.

## Actual private receipts

All logs are 0600 under `/home/bobby/.local/state/portal-research-p23/20260927/checkpoint/`.

| File | SHA-256 | Result |
|---|---|---|
| `f6-original.log` | `e5c92077e63243cbedc5246d016494afbe95120d5ae285f04a172b5b4180c957` | Original 2 failures preserved |
| `f6-fixed.log` | `de47c7e5e1dc08f1d4f70c72c503f2386385c8c48d987b55ccf81503afb6b057` | 11/11 PASS |
| `upgrade.log` | `6b6da5bd884f3c4a46856b5a6ec9e2552cec3a1eadb99e99609bb3cf35bf9c16` | 2/2 PASS |
| `verifier.log` | `984fda841c277dda26b4f8dab4561b55f98d988298a002e5c3cfb67b2ede772c` | 12/12 PASS |
| `verifier-final.log` | `4176ed7bfe10b52447ff0e3f2b743d1b107eef3f31656a622181707760912df4` | 12/12 PASS after strengthening hashed negative fixtures |
| `samplers.log` | `c8de72c0889ccd94934773e9bcdff8c50138d02d8a15f5a69a79ec1d776c3c87` | 7/7 PASS |

## Cleanup, preservation and next actual work

Exact test PostgreSQL containers are absent; disposable migration-test DB and
temporary test directories were removed by their scoped cleanup. No shared
volume/image/cache prune. Post-checkpoint host: 22,448 MiB available RAM;
root 282,817,671,168 bytes free (58% used). Shared preview remains running.
No frontend component/design/baseline changed; no production, dev/main,
AWS-HK or Trading System action and no push.

Next: provision one P23-owned capped cell; collect real lost-terminal/retry-expiry
and intact-live-lease recovery plus observer MATCH/MISMATCH on a test copy.
Then the full 20-principal/5-GB/workload/fault/restore/cold/upgrade lane,
candidate full browser write/consumer receipts, import-signing semantics and
P24 review packet. The full eight-group goal stays ACTIVE.
