# P23 — temporal candidate load and bounded verification repair

Status: **OPEN — real load SLO failed; no full P23/P24 PASS claimed**.
Candidate measured: clean `6726b4b51908657b49049cb6e6c69b722324543d`,
isolated `portal-research-p23-ol12`, localhost :8096. Shared :8095, frontend,
production, source market data and protected strategy are untouched.

## Actual retained run and measured failures

Private evidence is under
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`, mode 0600.
No session, credential, cursor or business rows are copied into Git.

| Receipt | Actual result |
| --- | --- |
| `temporal-final-b-workload.json` | 92-day WFO `rrun_50b0515e08ce92d55800c3a0668a7933`, June 1–September 1, first OOS June 8, BTCUSDT 1h, three real trials per fold: COMPLETED/READY. One heavy active / four distinct queued; 120/120 authenticated reads 200, no implicit reader jobs. Peak 682,192,896 bytes, below 5 GiB. **FAIL warm latency**: Library 715 ms, Progress 743 ms, Evidence 628 ms; Search 455, Report 227, Replay 246 ms. |
| `temporal-final-c-workload.json` | Retake hit the actor's eight live preflight-manifest slots. Five identical preflights in the preceding run plus three new ones explain the fourth 503. Own queued intents were cancelled; TTL/quota not changed. This is a failed harness run, not PASS. |
| `temporal-final-fresh-parent-quota.json` | **PASS** actual four-export quota, fifth export and verify refusal, idempotent replay without a slot, bounded drain and recovery, on fresh parent above. Final base memory 539,009,024 bytes. |
| `temporal-final-quota.json` | Old parent replayed completed idempotency keys, so zero jobs were active instead of four. Preserve this failed harness receipt; use a fresh parent on retake. |
| `temporal-final-farseek.json` | 20 distinct readers, 13 Library pages, 17 Replay pages, playhead 1650; all 140 reads 200, no implicit job, peak 622,624,768 bytes. **FAIL SLO**: deep Library 1,294 ms; sparkline 664; Report 1,116; Search 2,372; Replay deep/previous/far 1,225/1,383/1,097 ms. |
| `temporal-final-library-sql-cost.json` | Exact scoped repository, real member: 199 ms total for 20 cards, page query 94 ms and census 30 ms. Database membership/RLS checks remain intact. |

The failed tests are not reclassified as cold, deleted, or replaced by unit
tests. No SLO is weakened. Only a corrected clean candidate retake can pass.

## Bounded repair

The coalesced Library repository shares the same DB-returned enrichment
object among simultaneous readers, but each card revalidates the entire
enrichment schema and SHA-256. `verifiedEnriched` now verifies an object once,
deep-freezes both source and parsed result, and uses a **WeakMap keyed by that
exact object**, with mandatory digest and run binding on reuse. A new DB
object is always validated; no digest-only trust cache or retained-row cache
is added. Membership/RLS, workspace isolation, source-evidence joins and
freshness are unchanged. Strings continue through normal parsing.

The workload driver reuses one accepted, exact-spec, same-actor preflight for
five **distinct durable intents**. Each create still rechecks the producer
token/spec/actor/authorization. The utility driver accepts an explicit real
parent run for an idempotency-safe fresh retake. Neither changes production
quota, TTL, public APIs or UI.

Focused tests: enrichment 7/7; mixed-workload and utility harness test files
pass, including mutation/digest/run refusal, fresh-object verification,
different-spec refusal and invalid parent IDs. Mandatory full hook and
clean-image measurement are recorded in the next acceptance update.

## Still required

Retake warm/far-seek load without concurrent build/fault drills, then actual
DB/NATS/worker recovery and coherent DB/artifact restore on the same image
set. T07/T13 still need a real second qualified engine release; unsupported
non-reusable audit-child and whole frontend/browser acceptance remain typed
and open. Preserve rollback tags and original volumes. Revoke only owned
test identities and stop only this cell at final closeout. No remote push.
