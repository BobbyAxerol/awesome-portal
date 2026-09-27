# P23-T04 — clean-candidate PostgreSQL/NATS/worker fault and recovery

2026-09-27 · Codex · owned `portal-research-p23-ol12` loopback `:8096` only.
This is **P23-T04 clean-candidate PASS**, not disk-full, multi-node failover,
full P23 or Production qualification. The application candidate and all seven
image IDs remain pinned to source `19a8e81362e0e6aa3e09ad1a1c224db226c37455`.

The preflight required zero active jobs. The first owner test-session check
reported idle expiry and refused the drill before any service was stopped;
normal password login renewed only namespaced P23 test sessions. No account
reset, DB expiry edit, membership change or production identity was involved.

`fault-receipt.mjs --label=clean-19a8e813` then used its existing scoped
`try/finally` drill. It stopped only the owned PostgreSQL container and observed
a structured read refusal within **5,014 ms** (required ≤10,000 ms). After
PostgreSQL recovered, the same Control API process/PID/restart count survived,
the owner identity still resolved and the archived Report read returned 200.
The original producer, artifact, progress-event and principal snapshot hashes
were unchanged. It then stopped only the owned worker and NATS, admitted one
real P04 run, replayed the **same client intent** with no second job or fake
source event, started NATS/worker and observed that same run
`COMPLETED/READY`. Archived source/auth hashes were unchanged again. The
`finally` path restored all three services; all seven are running and healthy
where health checks exist.

A separate post-fault readback checked all seven actual image IDs against the
pre-drill immutable candidate and measured the complete active project with
the strict cgroup instrument: **381,014,016 bytes** `memory.current` including
page cache, every service under its original memory/swap/PID cap. This is a
post-fault snapshot, **not** a mixed-load peak or a substitute for T01/T11.
No shared preview `:8095`, dev/stable, Production, Execution cell, AWS-HK/TS,
non-test account, or original artifact was stopped or mutated.

Private `0600` evidence at
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`:

| Receipt | SHA-256 |
|---|---|
| `fault-clean-19a8e813.json` | `b805d1dd78fd293d4907743408c249a55f0e5229eda6ac544cb1996e31f3b5df` |
| `t04-clean-postfault.json` | `52efd4e5b1fa1ef841e27059bcfafdc843345f3974d8ca46f00ef517ed1f073a` |

The prior dirty diagnostic failure/repair is preserved in
[read/outage checkpoint](./READ_OUTAGE_IMPORT_CHECKPOINT_2026-09-27.md), not
renamed as a clean pass. T02 scratch, T03 disk pressure, T05 cache/ETag,
T12 quota/audit, T14 absent exposure/audit-child facts, T15 browser and the
remaining P23/P24 gates stay open. The exact test identities/cell are retained
only until qualification closeout, then require scoped revoke/teardown under
cleanup C4; no prune or broad deletion was performed in this drill.
