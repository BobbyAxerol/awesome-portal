# UDB-01 — Shared identity, PostgreSQL profiles and bounded cache

Status: PASS — PREVIEW_STORAGE_BASELINE (Bobby approval,2026-10-10).
Branch: `docs/research-loop-plan`; no remote push/dev/stable rollout.

Scope: versioned PostgreSQL profiles and existing cache lifecycle, append-only
repair for the historical migration129 no-op, isolated real-PG qualification,
shared preview forward activation only. No UI, auth policy/grant/bootstrap,
upstream TLS/source activation, domain DB separation or business-data mutation.

## Required reading / preserved authority

- Root `AGENTS.md`; Research working rules A13; Unified UDB addendum and
  UDB-01 entry/to-do/tests/rollback; §13.3 test economy.
- Dual-cell guide §§2–6; backend architecture §§7–13; hotfix2026-10-09 and
  `c823bda9`/`99a2eb73`; unified preview receipt2026-10-10; C4 cleanup.
- Auth/owner/grants/workspace code and P22 FK relationships remain authority.

## Test matrix

| Gate | Evidence/status |
|---|---|
| T01 identity/owner/grants preservation | PASS: real-PG owner/auth/delegation negatives;16 Core/Research custody hashes unchanged across preview change |
| T02 fresh/historical DDL/profile/restart | PASS:95/95 focused tests on16.15/P23 cap; legacy129-no-op repair preserves ledger; preview actual config/129–130/restart verified |
| T03 cache lifecycle/reuse/churn/crash | PASS:focused quota/TOAST/lock/crash +8,969 changed-body writes over602.478s,119 actual vacuum cycles,live entry intact,no TRUNCATE,injected pressure denial/recovery |
| T04 RAM/WAL/IO/pool/physical size | PASS:7 config cases,4.6GB rendered envelope;physical max318,799,872B,PG sampled cgroup max554,508,288B under899,997,696B,OOM0;WAL/temp/IO/pool samples retained |
| C4 | PASS:focused PG and all owned lane containers/network/test volume removed;collector exit0,inactive;private evidence/backup/rollback images retained30days |

The qualification is a scoped local **cache-fixture / real PostgreSQL** lane;
it is not a Trading System/engine/product-live receipt. Bobby approved replacing
the24h wait with sustained large changed-body load, repeated vacuum/plateau,
pressure negatives and unchanged custody. See the exact conditions in the
operator runbook. Every required predicate passed and owned teardown completed.
Original24h lane retained as SUPERSEDED_NOT_24H_PASS;serial underload attempt
retained separately,not acceptance. Reuse unaffected existing
Research/Execution numerical/UI evidence; no engine or frontend rebuild here.

See [phase report](./phase-report.md), [storage/authority manifest](./storage-and-identity.md)
and [PostgreSQL operator runbook](../../../../deploy/postgres/README.md).
Known in-scope debt:0; [dispositions](./debt-register.json). No UDB-02 approval
or product/release acceptance inferred from storage qualification.
