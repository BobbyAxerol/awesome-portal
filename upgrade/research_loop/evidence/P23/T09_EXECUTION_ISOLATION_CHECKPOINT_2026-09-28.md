# P23-T09 — dynamic Execution isolation during owned Research W06

2026-09-28 · Codex · `docs/research-loop-plan` · **scoped T09 PASS, full P23 NOT_QUALIFIED**.
This proof ran only on `portal-research-p23-ol12` at loopback :8096 with pinned
Control API candidate source `19a8e81362e0e6aa3e09ad1a1c224db226c37455`.
It did not command or restart stable, Execution, AWS-HK, Trading System, shared
preview :8095, or any source service. The four outside-P23 Portal containers
were read-only sentinels, not test targets.

## Actual overlap and invariant

The owned W06 producer admitted **one real HEAVY WFO**, queued **four distinct
durable HEAVY intents**, completed the primary and cancelled queued-only
intents through the public Research API. The T09 probe required the Research
job census to be 0 active/0 queued before and after, and exactly 1 active/4
queued both before and after the *during* Execution sentinel. All three
conditions held. W06 child exited zero; seven-service capped peak was
**614,277,120 bytes**, below the 5,000,000,000-byte aggregate cap.

For each phase the same real P23 owner and member issued named GETs to
`execution/activation/capabilities` and `execution/runtime-manifest`; anonymous
requests to both remained HTTP 401. Volatile top-level `read_at`/`read_at_ms`
were excluded from the equality signature; all remaining published response
bytes were hashed without storing business rows in Git. All **six** phase
probes had identical actor-bound status/signature before, during and after.
Four same-host, outside-P23 containers (Portal web/API in the two existing
projects) kept the same IDs, image IDs, restart counts and healthy status.
Their four loopback `/api/control/healthz`/`readyz` responses stayed HTTP 200
with unchanged digests throughout. This proves no observed same-host
Execution-authority/health drift under the specified Research queue overlap.
It does **not** prove an AWS-HK source or authenticated stable business read;
no remote transport was opened for this test.

**W06 is still FAIL, not disguised by T09.** In this workload, Library had
17/20 HTTP 200 and **3/20 HTTP 503**, p95 **1,263 ms**; Progress and Evidence
were 20/20 200 but p95 **572/658 ms** versus 500 ms. Search/Report/Replay were
20/20 200 and under their own targets. Reader views created no implicit jobs.
The old Library 490-ms PASS on a smaller clean 2026-09-27 cell remains a
historical receipt, not evidence that this enlarged 40+ run cell now passes.

The next typed-code retake refused earlier, at the fourth attempted preflight:
`RESEARCH_PREFLIGHT_UNAVAILABLE`. The actual actor already had eight live
preflight manifests; this is the published quota, not an engine/source
failure. The retake's finally block restarted the owned worker and cancelled
its queued-only intents. A read-only check found 0 active/0 queued afterward.
No preflight expiry, role, password, business row, or quota was edited. The
retake must wait for *natural* expiry and then repeat with the P23 sampler
that records only bounded typed error codes. The earlier 3 Library 503
responses cannot be attributed to a specific error code retroactively.

## Natural-expiry retake, same pinned cell

After all eight actor preflights expired naturally (read-only census: 0 active),
the same existing-account sessions were checked through normal password login;
no credential, role, TTL, quota or run row was reset. A fresh W06 used one
real HEAVY plus four queued intents again, with 0 active/0 queued jobs before
and after. The bounded sampler retained only typed codes, not server prose or
business responses. This time all six routes returned **20/20 HTTP 200**, so
there was no error code to attribute. The five non-Library routes met their
warm targets (Progress 290 ms, Evidence 386 ms, Search 279 ms, Report 213 ms,
Replay 284 ms p95); Library still missed **500 ms**, at **773 ms p95**. The
seven-service cap peak was **679,227,392 bytes** and T09's scoped Execution
sentinels again stayed unchanged. The prior 3×503 remains a real intermittent
failure; the retake does not erase it.

A separate read-only Library gradient on this same enlarged cell, **without**
HEAVY/queued work, used the same 20 authenticated reader identities and one
named GET per identity at concurrency 1/4/8/20. All 80 GETs were 200; p95 was
72/109/181/375 ms respectively. This is an inline diagnostic preserved only
in the operator transcript, not a separately archived acceptance receipt. It
supports contention under concurrent
compute as a hypothesis but does not identify whether admission wait,
PostgreSQL, auth, reconciliation or serialization dominates W06. No admission
limit, pool size, response contract or SLO was changed. The next source-owner
step is a bounded stage-timing measurement on the exact W06 route; fix only the
measured stage, then retake both current-size W06 and cold T08 on one pinned
candidate.

The retake private receipts (same 0600 root) are:

| Receipt | SHA-256 |
|---|---|
| `t09-codes-20260928.json` | `676df31fa7c30294eca05068035d817b8eb1a4b4bbd644cfe492005a281d932b` |
| `t09-codes-20260928-w06-workload.json` | `4bec51aec8129f4dbab051d06de014d5a02f3f60597e0a222ca046ffd87858d5` |
| `t09-codes-20260928-w06-read.json` | `a8c29b4b273540d44ddb1a9a27feceb9799bed391b818406339cdf2a67902511` |
| `t09-codes-20260928-w06-resource-series.json` | `27d8ac53b35d8bb54de435fa3611198d259ce931b6bd6a26d8c97a48056367e7` |

## Evidence and exact scope

Private 0600 root:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
No credential, cookie, DSN, raw response or business row is committed.

| Receipt | SHA-256 | Scope |
|---|---|---|
| `t09-coupling-20260928.json` | `3676beff4562053f4ee51e43878f854fd900721117a4dd98b45ca31409b1577d` | Before/during/after Execution authority, same-host health and exact W06 queue overlap |
| `t09-coupling-20260928-w06-workload.json` | `0a53411d3cdc95794dc93d8db4c66f492fe69acf12405a68e76b4cefb97a1c73` | Real HEAVY/queued admission, completion, cleanup |
| `t09-coupling-20260928-w06-read.json` | `d4459f2efd134945073c678f6be69397c95cb502f12f40d405c36ae5048ab2a6` | 20-reader named GET statuses/latencies, including the failed Library |
| `t09-coupling-20260928-w06-resource-series.json` | `44e07b94b918cacbf73d21b992c083f7a487f51f10a78b3ed06892b5f8c1175c` | Capped seven-service memory series |
| `t09-errorcodes-20260928-workload.json` | `4c9b70374d2e27b37dce5fe7a17455297455114993672ad1f4c1eb442e295515` | Preserved failed retake: fourth preflight typed 503 and owned queue cleanup |

The probe is [t09-execution-isolation.mjs](../../../../scripts/research-p23/t09-execution-isolation.mjs);
its focused signature/queue tests and the bounded typed-error sampler tests
pass **10/10**; the complete P23-owned Node suite passes **52/52**. It never
invokes an Execution POST or uses stable credentials.
The companion test only verifies the sampler saves a whitelisted error code,
not server messages. Full P23-T09 still needs the complete final-candidate
cross-stack/Execution regression and any AWS-HK-facing smoke chosen in P24;
T01/W06 latency/backpressure is independently failed and remains mandatory.
