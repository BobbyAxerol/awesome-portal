# Core009 successor — actual focused qualification, 21 October 2026

**FOCUSED_SOURCE_QUALIFIED / SOURCE_ONLY / NOT_INSTALLED / NOT_CONNECTED_READY.**
This is the terminal for the gate started in the
[implementation scope](CORE009_SUCCESSOR_WRITER_IMPLEMENTATION_RETURN_2026-10-21.md),
not a replacement for any connected receipt or the prior432 normal gate.

## Source, scope and actual tests

- Branch `chore/core009-successor-20261021`, worktree
  `/home/bobby/portal-core009-successor`.
- Code commit after documentation-only rebase:
  `28646befa69e71d1729fd93b0d8a78d3a0941077`;
  tree `29e32f3a663f217bef1a171295cd0fc5940d1a64`.
- Five paths +711/-0: access.service87, private planner115, CLI52,
  pure tests291, disposable PostgreSQL tests166. No public contract, route,
  migration, frontend, normal coordinator or runtime configuration change.

| Test file | Actual terminal |
| --- | --- |
| `manager-domain-successor.spec.ts` | 73 PASS in first combined focused command |
| `native-manager-install-ack.spec.ts` | 6 PASS in that same command |
| `be-p10-manager-revoke-pg.spec.ts` | 3 PASS in that same command |
| `manager-domain-successor-pg.spec.ts` | first3 PASS/5 FAIL; corrected fixture, retry8 PASS |
| Source TypeScript build | PASS in both focused cell runs |
| Scoped PostgreSQL restore | first NOT_RUN after failed tests; retry PASS including four row digests |

First command17:03 UTC ran the four explicit files with
`scripts/control-api-test.sh` under the one heavy lock. Terminal was **EXIT1,
85 PASS/5 FAIL**, not hidden or treated as load flakiness. The new PG fixture
allowed grants from `now-1000` to `now+120000`, i.e.121 seconds, against its own
independent120-second maximum. Planner correctly refused. The fixture end was
changed to `now+119000`, keeping all production bounds/assertions unchanged.

Only that new PG file was retaken using the same isolated runner. Actual
Vitest start **17:11:48 UTC**, 8/8 PASS,20.40 seconds total; runner **EXIT0**,
source build/migrations and scoped restore PASS. No rerun of the82 passing
focused cases. These are90 distinct passing test cases after correction, not
93 passes or connected user acceptance.

Covered real disposable SQL: independently selected READ/STREAM; READ alone
refuses STREAM; exact target/policy/grant CAS; two competing successors; raw
artifact idempotency conflict; immutable predecessor and audit; exact replay
after revoke cannot reactivate; UNKNOWN custody retains fence; window expiry
after actual inserts rolls back policy/grants/event before COMMIT. Root-file
metadata and authority inputs are **synthetic test fixtures**; no genuine
operator artifact/provider/issuer or production identity is claimed.

Independent read-only review accepted the final commit-bound expiry fix and
all earlier scope/CAS/no-resurrection checks. No writer edits came from that
review. Pure test contribution came from the reused Edge-source review agent;
the primary reviewed/integrated it and ran the PG gate.

## Captured evidence and cleanup

Private captured retry output (not the full initial npm/build log):
`/home/bobby/.local/state/portal-execution-elp210/20261021/successor-focused-ClGkOc/pg-retry-captured.log`.
SHA256 `a600d2e7fb87891fdc354d021e05a7635251085223b70550cdc1426cacbad735`.
The first command's tool output preserves its failure/counts; no full first-run
log hash is claimed. Two duplicate host typecheck attempts were stopped with
EXIT143, never counted as PASS; source build came from the isolated runner.

Runner traps removed only each invocation's own cell/network/temp directory.
Post-terminal read-only Docker inventory returned **zero** matching
`control-api-test` containers and networks. No broad prune or business/rollback
artifact deletion. Snapshot: root80% used/126 GiB available (rounded),
MemAvailable9,177 MiB, no swap. First observed Node peak1.413 GiB under its3 GiB
cap; no peak claim for the second run. These are shared-host/correctness-cell
observations, **not** accepted coexistence, load, G2 or capacity measurements.

Integrity-ledger refresh/check: PASS, both ledgers unchanged, runtime effect
NONE. Git diff check PASS. Full normal hook is scheduled only at frozen-code
landing under campaign10.10c, not repeated for this Markdown return.

## Next, remaining gates and consumer

1. Freeze changed source, run the one required normal landing gate and build
   its immutable image. Do not call image05ae a successor-writer image.
2. Return real source/image/config pins before matching a new Edge window.
   Only then install through the official CLI and measure eligible READ plus
   separately granted STREAM/revoke/restart/recovery. Old source stays OFF;
   original custody remains DONE and must not be reissued.
3. Manager issuer/leaf, genuine financial mapping, measured owner bounds,
   calibration population/config, coexistence/G2 and browser remain OPEN.

No frontend API change is needed for this private writer. Claude keeps UI/
financial/observer/measurement fixes; their fixture/browser receipts remain
separate. No remote Git push, stable/dev/main change, command or Live activation.

## Frozen normal gate actually started17:16:15 UTC

After another Markdown-only canonical rebase, frozen source is
`f92936df24e78895c2e72832d8ade387e2c83863`, tree
`0ebb94cf7d8954acff130257025d69702f8fd1be`; owned code bytes unchanged from
the focused receipt. Actual original `.githooks/pre-commit` is running in the
isolated worktree under the one heavy lock. **RUNNING, not PASS**. No edits to
that frozen tree while it runs; no second hook on Claude's branch for this SHA.

Private controller/log/terminal paths are in the same `successor-focused-ClGkOc`
directory (`run-normal.sh`, `normal.log`, `normal-started.txt`, then
`normal-exit.txt` only once terminal). Capacity preflight20% disk and6 GiB
MemAvailable passed:135,011,934,208 disk bytes available and9,107,644 KiB
MemAvailable. Deadline7200s; private controller does not install/build/grant
anything after completion. A later actual terminal and image remain required.
