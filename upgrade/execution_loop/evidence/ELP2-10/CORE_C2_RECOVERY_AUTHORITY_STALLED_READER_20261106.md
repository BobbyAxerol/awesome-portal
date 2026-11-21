# Recovery V2 — stalled authority reader, 2026-11-06

**SOURCE/TEST ONLY; NOT A RESTORE PERMIT.** Follow-through to
[authority readback](CORE_C2_RECOVERY_AUTHORITY_READBACK_20261106.md). The
unmounted checkpoint reader holds SHARE locks while validating the journal;
an application stalled between SQL statements could retain those locks and
block authority writers indefinitely. The existing `lock_timeout` and
`statement_timeout` do not bound this idle interval.

## Change and validation

- The candidate sets `idle_in_transaction_session_timeout` to five seconds
  inside its transaction, before acquiring journal locks. If its client stalls
  between queries, PostgreSQL closes the session and releases its locks; the
  interrupted reader must fail, not return a verified result. This is a local
  candidate timeout, not an approved production budget or a bound on an entire
  transaction with continuing statements. A role able to change its own
  settings is not fenced by this client setting. Helper ownership/ACL,
  independent operator trust, availability and production budget remain to be
  qualified. The helper itself is not installed by this change.
- Reproduced before the fix with the real disposable authority DB: the stalled
  reader was still present after the eight-second observation; the expanded
  suite returned **22/23**, not PASS. The test cleanup resumed the reader.
- Final retake `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **23/23**
  across two disposable PostgreSQL clusters. The added case waits until the
  server terminates the idle reader, requires the interrupted read to fail,
  obtains a writer-conflicting `ROW EXCLUSIVE` lock, then successfully reads
  again via a fresh connection. The numbers overlap the previous readback
  receipt and must not be added together.
- Focused TypeScript check of the reader and its PG test, using the Control API
  compiler with explicit ES2022/CommonJS/decorator flags, exited 0;
  `git diff --check` exited 0 for tracked changes only. The full integration
  hook, test-inclusive project typecheck and runtime commissioning were not run.
- Direct `./scripts/...` failed with permission denied because the script is
  not executable; running with `bash` was intentional. The sandboxed Docker
  attempt could not use sudo; the approved isolated retake used the normal
  harness. The harness bounds each PG container to 0.4 CPU / 320 MiB and the
  node test container to 1.2 CPU / 896 MiB. Peak actual resources were not
  measured. Read-only Docker census after completion found no `elp2-ckpt-`
  containers or networks. No shared DB, runtime, frontend or Edge was changed.

## Pins and continuation

| Local uncommitted file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority-reader.ts` | `8f9fa8a3827185707e94c0c9969de6d27a516edb56d007280d1aa8b2c26740e8` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `46d11b3842fac74194c707a2bdddf66ed6d9dd7ad99983928957ac54115e1575` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `6cb5ec3096b69873b1b1b5d78d620b108f5e29e3b2606ce51ff5214a20604bf7` |

These source and test pins supersede the same files' pins in the earlier
readback receipt; the SQL helper did not change. Review/integrate the WIP,
qualify independent checkpoint/owner authority, old-holder and source fencing,
complete post-snapshot terminal/ACK reconciliation, and rehearse restore on the
final candidate. **ELP2-10/11 remain open.** P7/A2 and real Edge acceptance
remain separate. Rollback: leave the candidate unmounted; preserve the existing
V2 restore refusal. No frontend contract or consumer action is requested.
