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

## Final actual candidate — 65bdc8e2

Mandatory hook retake **PASS: 1469 Control API tests / 1 opt-in skip**,
contracts **219/219**. `6a2bfdc9` rebased to `65bdc8e2` after preserving
Claude `a599bd3f` (32 files, +2465/-233). Only the append conflict in the
backend queue needed resolution; both agents' sections are retained. Own
commit: 14 files, +140/-25. Backend and current Claude chart frontend build;
production dependency prune reports 0 vulnerabilities. No frontend edit by
Codex. This is not a browser/visual acceptance result.

Clean application source `65bdc8e254c6393c8884de4433f64b61acbdde30`,
seven exact images, `dirty=false`, isolated `portal-research-p23-ol12` /
`:8096`. Pins and sanitized receipt hashes are collected in the
[P24 local candidate manifest](../P24/current-source-candidate-manifest.v1.json).
No signed release or production activation is implied.

| Actual measurement | Result |
| --- | --- |
| Far-seek, 20 distinct authenticated readers / 140 GET | **PASS**: all 200; Library depth 13, Replay depth 17 / playhead 1650, no implicit/active compute. Library 192, sparkline 449, Report 380, Search 494, Replay deep/previous/far 802/737/731 ms p95. Peak 598724608 bytes. |
| One real 92-day WFO + four durable queued intents / 120 GET | **FAIL on latency**: all GET 200 and WFO COMPLETED/READY, but Library 538 > 500 and Progress 568 > 500 ms. Evidence 337, Search 461, Report 148, Replay 304 ms pass. Peak 955523072 bytes, queued intents cancelled through API after measurement. |
| Execution isolation around that same workload | **Scoped PASS**: before/after queue 0/0, during 1/4; same-host Execution GET/denial, outside container identities and health unchanged. Does not override the W06 latency failure. |
| Shared utility, fresh actual parent | **PASS**: four active exports, fifth 503, same-key replay uses no extra slot, verify 503 then 200 after drain, fifth export then 202. |
| Tenant/cache/ETag, ten named GET routes | **Scoped PASS**: membership, anonymous denial, cache policy and weak revalidation. Legacy export and full T05 remain separate. |
| DB/NATS/worker outage | **PASS**: DB structured refusal 5013 ms; Control API same process/restart count; one intent resumes after NATS/worker restart and reaches COMPLETED/READY. Archived source/auth unchanged. |

Real fresh WFO: `rrun_cc8554d6d2b768a028909cfb0cad50f9`; 2026-06-01
through 2026-09-01, BTCUSDT 1h, first OOS 2026-06-08, weekly expanding,
three optimizer trials, pinned QuantBT 1.1.1. Fault-recovery fixed regression:
`rrun_a77aff5c3846aa64886d949fa0b75755`. Earlier monthly/rolling/Spot/Quarterly
proofs retain their original run/image scope; they are not silently rewritten
as runs on this candidate. The Python worker pin is unchanged.

## Coherent restore and an old test-store loss

The default strict restore **FAILS** before backup because three database
records remain SEALED while their manifest bytes are absent. Read-only
inventory verifies **70/73** sealed artifacts, not zero: the first diagnostic
incorrectly compared PostgreSQL bigint strings to Python integers; correcting
only that diagnostic type comparison yields the exact three missing IDs.

| Artifact | Run / source of the absence |
| --- | --- |
| `rart_64469653604a37d46833ed048ba75c1d7e864b60` | `rrun_e2c3a4d31decb9f5d77b77fe49616fdb`; old disposable disk-pressure run |
| `rart_0a356b7ee5c8e6f85ebeeb9ca416c1a347229b0f` | `rrun_1690a9830787332de93d93d457c8aa0e`; [T03 full-run recovery](./T03_FULL_DURABLE_RUN_2026-09-29.md) |
| `rart_830fa0d721d3817db2c4881b54c1cd84fa3306a0` | `rrun_c93896666b0f3f1647aaa4967ce8c792`; [T03 clean recovery](./T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md) |

The T03 packets explicitly record deletion of the separate disposable ext4
images after recovery, without promoting their new artifact bytes into the
original named volume. Each missing artifact has zero retention references
and ten recorded parts. No hash-matching copy was found in the retained
owned backups. Do not reconstruct a new manifest/Parquet payload and call
it the old byte receipt; do not delete database history or relabel SEALED.
The old T03 scoped runtime result is not whole-store restore proof.

`restore-receipt.mjs` now has an explicit
`--record-partial-missing-manifests` evidence mode. Default mode stays strict.
The extra mode records every missing manifest and expected digest, verifies
all existing manifests/parts/documents and the complete tree, and compares
the missing set exactly across the restore. Corrupt or missing parts of a
present manifest still abort. Any missing manifest leaves **passed=false /
exit 1**, even if coherent copying itself succeeds. The focused harness file
passes, including refusal of changed missing sets/tree hashes and empty
verified populations. Application images/contracts are unchanged by this
instrumentation refinement; its byte hash is embedded in the private receipt.

Actual fresh-volume restore: **144 tables**, complete rows/auth/RLS/roles/
memberships/schema/constraints/sequences/functions parity, **805 part
records**, **3132 files**, **70 verified sealed artifacts + the same three
MISSING manifests**. Five named reads work with the restored worker OFF.
Original volumes and image pins are restored in `finally`, without `-v`.
`coherent_restore_passed=true`, **full integrity passed=false**. All original
failures are retained. This is not full T06/T14 or P23 GO.

Actual byte-observer API checks on the three old runs return
`artifact_bytes=MISSING`, source-derived `integrity=NOT_PUBLISHED` (not an
invented BLOCKED state). An initial proof assertion incorrectly expected
BLOCKED; that failed receipt is kept. The complete three-response observation
receipt preserves the actual source states. No sealed metadata is rewritten.

## Cleanup, handoff and exact remaining gates

Supported owner account APIs with step-up disabled exactly 21 non-owner
temporary P23 accounts and revoked sessions for all 22 test identities,
owner last. SQL readback proves **0 ACTIVE sessions** for these exact IDs;
test owner anchor remains. No Bobby/Stan/Thanhvuong production account changed.
Owned containers/network were stopped/removed; original and fresh restore
volumes, backups, private 0600 receipts and immutable rollback tags retained.
Shared :8095, dev/stable/production, Trading System and remotes untouched.

**P23/P24 remain OPEN**, with exact blockers rather than a blanket NO_GO:
W06 Library/Progress p95, historical negative-test-store artifact loss,
real second-engine T07/T13/P24-T05, full frontend/browser/visual/print and
owner acceptance, full linked audit-child source case, signed-release proof.
The available self-audit and exposure writer are delivered; the queue's typed
NOT_PUBLISHED alternative for the non-reusable audit child does not prove
that child's restoration. No additional whole-suite run outside the required
commit hook is needed; the restore-harness change has its focused test and
actual restore receipt above.
