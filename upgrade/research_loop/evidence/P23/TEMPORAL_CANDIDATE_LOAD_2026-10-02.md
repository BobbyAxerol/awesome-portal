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

## Second measurement and scoped SQL repair

Clean `660f4b18` kept the same seven-image cell topology. Private
`temporal-memo-farseek.json`: Library deep now **381 ms PASS**, but Search
**2,194 ms FAIL**, replay **1,332/1,502/1,558 ms FAIL** with bounded 503s.
The entire lane is not accepted just because Library improved.

The next repair keeps per-actor workspace membership, runtime-role RLS,
repeatable-read, transaction-local timeouts, **2 active / 18 queued** retained
read slots and the **750-ms** queue/acquisition limits:

- Merge the same five `set_config(..., true)` functions into one query in
  retained source and Report repositories; no setting or role is removed.
- S06 already needs all bounded trial/candidate/fold rows for surface/pool.
  A named internal `searchInputs` fetches those finite inputs and the exact
  sealed-request seed/S4 completion facts in one actor-authorized snapshot.
  Per-kind count must match the immutable seal and remain inside its existing
  bounds. Cursor signatures, limits, fold binding and response schemas remain
  unchanged; there is no persistent read/authorization cache.
- Replay page total/previous/following counts use one filtered aggregate,
  with the same sparse keyset edges, empty-page behavior and total count.
- Reuse the already-computed revision only inside that same request; it is
  not a cross-request trust cache.

Focused repository/service/surface/pool/digest regressions: **70/70 PASS**.
The Control API Docker build on pinned Node 22.23.2 succeeds. Diagnostic
`temporal-bundle-diagnostic.json` (explicit **dirty/diagnostic-only**, not P23
acceptance): 140/140 reads 200; p95 Library **205**, sparkline **363**, Report
**345**, Search **749**, replay **715/718/666** ms, all below unchanged targets.
Search is close to 750 ms; clean-candidate measurement is still required.

The first mandatory hook stops with **1,450 pass / 18 fail / 1 opt-in skip**:
all failures are the downstream Report fixture still missing the new internal
`searchInputs` mock. No commit is created and that run is not PASS. The
fixture adapter is now applied to Report and the opt-in DR fixture too;
focused Report retake **25/25 PASS**, DR still explicitly opt-in/skipped in
the host lane. The corrected mandatory hook and clean cell remain required.

## Compatible-major dependency remediation

The previous security blocker is repaired in the Control API manifest and
actual lock: Nest Fastify adapter **11.2.4**, Fastify **5.12.5**, fast-uri
**3.1.8/4.1.5**, brace-expansion **5.0.12**, test-only Undici **7.29.1**.
No major upgrade or shared node_modules installation is performed. The exact
nested lock copies have an offline regression guard. Full lock-only npm audit
on 2026-10-02 reports **0 vulnerabilities** (197 dependencies), and the real
production-image prune also reports 0. This is a dated audit result, not a
claim that future vulnerabilities or whole-product security cannot exist.

## Additional real functional receipts (not latency proof)

- `temporal-monthly-product.json`: real v2 monthly Delta/global run
  `rrun_b7ba4ed44f9c3b462a68b34d617941e0` is COMPLETED/READY. Split, Search,
  Freeze, Report and RC return 200 with retained AVAILABLE facts. It ran on
  the unchanged worker image during unrelated host gates; it is functional
  evidence only, not one-candidate performance proof.
- `temporal-frequency-estimates.json`: June–September v2 monthly gives
  3 feasible folds; quarterly frequency over that same window gives 1 fold
  and typed `PROFILE_FOLD_COUNT_NOT_ADMITTED` (minimum 2). An allowed
  frequency is not a promise that every date window is admissible.
- `temporal-three-window-estimate.json`: actual fixed IS/OOS/HOLDOUT metadata
  gives **168/168/48 bars**, **300/300 warmup**, one fold, ready=true, named
  P04 fixed profile. No run or source mutation is launched by this estimate.

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
## Clean e9c64d1c retake and single-snapshot S06 repair

Mandatory hook: **1468 Control API PASS / 1 opt-in SKIP**, contracts
**219/219 PASS**; commit `e9c64d1c` landed by fast-forward after preserving
Claude `d30a201d`. Control API and current Claude frontend both build. The
owned cell uses the new frontend, not the earlier eae8 bundle.

Private receipt byte SHA-256:
`e34f5b7f471e62cbe46c779a14490477320e0953bef1bafcb9323ec76e9dfed4`.
Actual clean `temporal-e9c-farseek.json`: 20 distinct authenticated readers,
140/140 GET 200, Library depth 13, Replay depth 17 / playhead 1650,
no implicit jobs, 24 capped samples, **601739264-byte peak**. Verdict **FAIL**:
Library p95 **521 > 500 ms**, Search **939 > 750 ms**. Sparkline 317, Report
481, Replay deep/previous/far 881/838/734 ms pass their unchanged targets.
This result supersedes no earlier failure and is not a P23 GO.

Next grouped repair binds S06's seal and finite TRIAL/CANDIDATE/FOLD inputs
to one authorized repeatable-read transaction, not two independent admission
turns. It omits the separate B6 enrichment lookup only for S06, which does
not serve that block. Evidence/series still fetch and verify B6; retained
summary/cursor digests, response schemas, actor/RLS checks, all timeout and
2-active/18-queued limits stay unchanged. Focused build and six suites:
**95/95 PASS**, including denied/no-seal/bounded single-snapshot checks.
The first focused fixture attempt failed because object spread copied the
old mock before its helper ran; the explicit mock repository adapter fixes
that ordering. A clean-image official retake remains necessary.

The mandatory hook found one additional RF-05 mock repository without the
new single-snapshot method: **1466 PASS / 3 FAIL / 1 opt-in SKIP**. Those three
failures are missing-method errors in the typed-absence test fixture, not
runtime receipts. That fixture now uses the same explicit mock adapter;
the hook is retaken without bypassing it.
