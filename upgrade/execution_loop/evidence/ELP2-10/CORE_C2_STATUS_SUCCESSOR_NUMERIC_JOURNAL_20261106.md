# C2 STATUS successor and numeric journal ordering — 2026-11-06

**UNMOUNTED SOURCE/TEST WIP; not a connected receipt, V2 restore permit or
phase completion.** Base `2faa8968fddbde59b2e59525e334ba3d83886144`; shared
worktree remains unfrozen. This follows the earlier STATUS adapter receipt;
the later source pins below supersede its corresponding point-in-time pins.

## Change and limits

The candidate can issue the next STATUS sequence for the same immutable
context and original only when its exact prior lease has a matching terminal
and persisted recipient delivery ACK, with P7, custody, assertion and session
bindings checked. A fresh context or different original remains fenced. A
terminal without the recipient ACK is insufficient. This is not evidence of
an actual Edge terminal or ACK, nor of full polling through the HTTP listener.

An initial integration retake exposed a second issue: PostgreSQL could order
the `generation::text` output alias lexicographically (`1, 10, 2`) instead
of ordering the underlying BIGINT. That caused custody history verification
to reject a valid chain after nine events. The unmounted custody inventory and
writer and the checkpoint authority writer and reader now qualify the numeric
column in `ORDER BY`. No event, hash, database or runtime state was rewritten.

## Focused validation

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: initial **7/9**, with
  the numeric-order error and a cascading drain failure. After fixing ordering,
  final **9/9 PASS** on two disposable PostgreSQL systems. The selected test
  checks terminal-without-ACK refusal, ACK mismatch, foreign context, incorrect
  predecessor, same-context successor, two concurrent attempts producing only
  one successor, revoke and inventory beyond nine events.
  Source proof, receiver ACK and identities are test-only.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh authority`: **10/10 PASS**
  on disposable systems. The added case appends/replays twelve events, then
  inserts a clearly synthetic closed observation in the test-only database to
  verify generation 13 and a generation 10 ancestor; bad ancestor is refused.
  It does not prove actual database closure or independent restore authority.
- `bash scripts/test-elp2-restore-inventory-rls.sh status-recovery`: **3 PASS,
  5 skipped** by test selection. Tests exercise PostgreSQL, process restart and
  loopback pinned mTLS with test-only source; no genuine Edge ACK is claimed.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-trust-reuse`: **3 PASS,
  107 skipped** by selection, covering the existing non-C2 STATUS fence and
  financial-read terminal cases against disposable PostgreSQL.
- `npx vitest run test/command-source-assertion.spec.ts --maxWorkers=1
  --no-file-parallelism`: **78/78 PASS**, synthetic authority ports.
- One combined strict TypeScript invocation including both source and the two
  PostgreSQL test files exhausted its 768 MiB heap (exit 134): **not PASS**.
  Separate strict 768 MiB invocations passed for checkpoint reader/writer plus
  checkpoint test, and for current-human plus custody source. The larger P7
  test was not included in the successful typecheck; Vitest transpilation is
  not a full typecheck. No full project check or normal hook is claimed.
- Test scripts use dedicated disposable cells; final read-only prefix checks
  found no `elp2-c2-p7-`, `elp2-ckpt-` or `elp2-restore-rls-` containers or
  networks. Aggregate cell limits were at most 2 CPU / 1.5 GiB; peaks were not
  measured. No unrelated resources were removed.

## WIP file hashes (SHA-256)

| File | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `ae41d2874f54fac399585102a847c8235f641b1af66d4367f1eb9d9908eb8c8f` |
| `restore-independent-custody-candidate.ts` | `a4e6527c58604ae21521bea9a34b61be422e9a59b87a05aea01fc3d8c9d440e7` |
| `restore-checkpoint-authority.ts` | `5c18aa01759132d508de7e2d34b33c08f043a1bd64b7951059a2a91189ba3135` |
| `restore-checkpoint-authority-reader.ts` | `02c3cb7e90fd4f0380989015b02e669dc7d283e0b13674d4dd65bade3197918f` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `b7c7e42d2bae2f0b8c26074601ed8e55459c035c55e8508743c6ba6ed49495b3` |
| `restore-checkpoint-authority-pg.spec.ts` | `d61e7bcf4f1af7385b646a480130a91e0116b354799478ab76ea75c4985bd12d` |
| `command-source-assertion-pg.spec.ts` | `c3d8507fe3fe5d6cb41856ad144795d933b0ae43a96f8cd9009e7430837ca798` |

Paths are under `apps/control-api/src/execution-v2/` for source and
`apps/control-api/test/` for specs. The current-human pin includes a
comment-only clarification made after the PG run.

## Next action and rollback

Core must compose the actual authority, P7/custody adapter and HTTP delivery,
test same-process ambiguous recovery on the combined real-PG path, and obtain
genuine source terminal/recipient ACK through Edge. Full restore still needs
independently held monotonic authority, old-holder and source fencing, complete
post-snapshot terminal/ACK reconciliation, and representative rehearsal.
Review shared WIP, freeze the candidate and run impacted gates plus one normal
hook before landing. No frontend field or action is introduced. Rollback is to
leave the candidate unmounted and keep V2 restore refused; retain all custody
and authority history. No push, runtime, database, Live or command activation.
