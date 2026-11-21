# P23 W08/T02: actual cycles, scratch failure and owner handoff

Date: 2026-09-27 · Codex · `docs/research-loop-plan`.
Owned project `portal-research-p23-ol12`, loopback 8096. This continues the
original eight-group goal; **T02/P23/P24 remain unqualified**. No shared 8095,
Production, dev/main, frontend, AWS-HK/TS or source-service changes.

## Actual execution, not a fixture

Warmup `rrun_0d7891d8904d2a753d87771a59ffcdde` is COMPLETED/READY.
The same public WFO admission used real BTCUSDT 1h HMD, 2026-06-01 through
2026-07-15, first OOS 2026-07-01, weekly expanding windows, mode_1/global,
three real optimizer trials and seed 42. Thresholds were fixed before testing:
three complete/fail/cancel rounds, unchanged parent identity, aggregate
5,000,000,000 bytes, RSS/PSS growth <=64 MiB, FD growth <=4 and no new
transient scratch bytes/files at quiescence. Do not relax them after failure.

| Round | Action | Actual run | Final public state |
|---|---|---|---|
| 0 | complete | `rrun_796097406953bbcb7de41efc471815b3` | COMPLETED |
| 0 | exact child SIGKILL | `rrun_c84cfa593d213b80183978dfb36f30fc` | FAILED |
| 0 | public cancel | `rrun_df4a59c1ee0c225c6f0c23e28bbba312` | CANCELLED |
| 1 | complete | `rrun_97f5d981d1a62fd8e4fa630a920e5f98` | COMPLETED |
| 1 | exact child SIGKILL | `rrun_969c83ee6301297f468c24e0dd5ac84b` | FAILED |
| 1 | public cancel | `rrun_6097f544495de60528763019b85fd6e1` | CANCELLED |

Each fault matched the new job/attempt/lease receipt, process group and
`/proc` start identity before signalling. No parent/service restart or SQL
lease/terminal manufacture. Cancellation converged in about 98/102 seconds,
within the declared 180-second observation bound; this does **not** establish
when the child exited or prove an immediate-cancel/OOM gate.

133 strict aggregate samples peaked at **615333888 bytes**. Worker parent
start stayed `401235431`; RSS 170258432 -> 173776896, PSS 129189888 ->
132529152, FD 7 -> 7. These two rounds support scoped worker measurements,
not three-round T02 acceptance or indefinite-memory stability.

## Failures preserved and instrumentation corrected

- Supervisor scratch: baseline 102 files/3125718 bytes; round 0 123/3628979;
  round 1 144/4132243. **+42 files/+1006525 bytes** after six terminal jobs.
  Market scratch remained zero. This proves scratch/forensic accumulation,
  not a native RAM leak. Do not delete earlier files to manufacture PASS.
- Third-round preflight returned 503 `RESEARCH_PREFLIGHT_UNAVAILABLE` before
  creating another run. Read-only SQL showed eight unexpired actor-scoped
  manifests. `repository.ts:2203` enforces the configured eight-slot budget;
  `preflight.service.ts:447` maps that refusal. This is backpressure, not an
  engine/service failure. The harness now waits for natural expiry (bounded
  660 seconds, resource samples), without changing quota or expiring tokens.
- Control API PID1 was Docker init, not Node. The two-round receipt's API
  PID1 RSS/PSS/FD are **invalid as application-process measurements**. The
  new probe requires exactly one `node dist/main.js`, measures its PID/start
  and refuses missing/ambiguous selection. Actual current Node PID is 7.
  Aggregate cgroup samples and worker measurements remain valid; a corrected
  full three-round receipt is still required.
- The first attempt refused its fault probe because SQL bigint lease epoch
  was a string while the child receipt was an integer. It never signalled
  that child; cleanup cancelled only that admitted job. Canonical positive
  decimal validation now preserves exact epoch identity. Failed evidence is
  retained separately, not rewritten as a successful fault.

## CG-P23-T02-01 — precise <=P21 owner request, not a new phase

Owner: **Claude**, per Unified §13.4.1. Codex owns qualification/receipt and
does not edit the shared source services without confirmed handoff.

Source locators: `apps/portal/backend/src/portal_api/services/research_supervisor.py:679`
creates a once-only `scratch_root/job_id/worker_attempt_id` with receipt,
result/logs/progress; the launch path has no terminal directory cleanup.
`services/research_run_producer.py:747-771` copies WFO output and removes the
output/market directories, but leaves the supervisor attempt directory.

Required repair: bounded, lease-aware terminal scratch lifecycle for
complete/fail/cancel, including the fixed/imported/WFO shared launch paths.
Keep required audit/receipt facts durable; preserve launch-once/fencing,
live leases, running child/thread safety, source retention and original seals.
Copy/validate WFO output before any cleanup. Do not weaken anti-replay by
removing its only durable guard, race `asyncio.to_thread`, or erase old forensic
evidence as qualification cleanup. A retained forensic cache needs an explicit
bounded lifecycle and agreed gate semantics, not silent threshold relaxation.

Done when: owner regression tests prove those safety conditions and the owned
cell runs all three corrected complete/fail/cancel rounds on the pinned repair
candidate with the predeclared plateau/scratch gates. Request is **OPEN**;
other T03/T12/T14 work proceeds without waiting on this source-owner repair.

## Evidence, validation and cleanup

Private root `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`;
0600 files, no cookies/passwords/DSNs/business responses in Git.

| Private file | SHA-256 |
|---|---|
| `plateau-wfo-cycles.json` — first instrumentation refusal | `c68c50ca4e09499f52052e4bef45224f4c1fe5c30ce0e14f38a9be8000ad48be` |
| `plateau-wfo-cycles-retake.json` — six actual terminals, third admission refused | `0179ce5123fffb56b2e8859a9629779c6c282915fd35e67ebb4f2ce393fdd1a4` |
| `plateau-scoped-capacity.json` — current corrected Node measurement/preservation | `893c7e20238d9bca09fd63dadb2b9efefb0fe3a23627ab0ff1a3f15e7497e086` |

Focused command: `node --test scripts/research-p23/plateau-receipt.test.mjs scripts/research-p23/resource-snapshot.test.mjs`
covers three-round requirements, growth/refusal, exact Node selection and
actor-budget pacing. Unit tests do not supersede the failed runtime receipt.
Mandatory whole-workspace commit hook is separate; no application rebuild is
needed for these tool/doc-only changes.

At 2026-09-27T20:55:46.940Z: aggregate **420007936 bytes**, active compute 0,
pending exports 0, root free **278997598208 bytes**; all nine preexisting
sealed manifest pins match. This checks manifest pins, not a fresh whole-tree
byte verification. Earlier comparison refused a bigint string/number mismatch;
canonical exact revision comparison corrected the instrument, not database data.
No prune, scratch deletion, restart or token-expiry mutation. Original volumes,
rollback images, backups and failure receipts remain retained. Existing C4
follow-up remains at qualification end: revoke the 22 test identities/sessions,
down only this owned project without `-v`, and inventory exact retained resources.
