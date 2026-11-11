# C2 P3 and P7 — focused Core tests, 5 November 2026

Disposition: **SOURCE_ONLY; A2/B2/recovery NOT_READY**. No source acceptance,
grant, token, publication signature, live listener or runtime installation is
created by these tests.

## Source semantics

Core read the TS `TS-ANSWERS.md` through the Edge host, including C-P3-1..4,
R-P5-1..5 and the source recovery table. TS confirms a signed `UNKNOWN` may
follow an ENTER that was denied or whose response was lost: its journal starts
before ENTER. Core must retain the exact original attempt and cannot translate
UNKNOWN to rollback. An authentic terminal `ROLLED_BACK` for that original
must be ACKed even where ENTER never succeeded; terminal ACK is exactly
`{replayed, phase}`. Global authority revision is fail-closed for C2 Paper;
Core still owes its change announcement/republishing and post-C3 owner-scope.

## Implementation and validation

| Source/test | SHA256 |
|---|---|
| `src/execution-v2/current-human-candidate.ts` | `ac8e19f7e8e990ccc4df5b525f616db89db46bf5a21669d0f37b707df52769b6` |
| `src/execution-v2/current-human-c2-unentered-unknown-candidate.sql` | `dda4e2655cb1a8d07be4d61bb099b3111da6df9908576876f6c83c307e07ddd7` |
| `test/c2-unentered-unknown-pg.spec.ts` | `c36fa5093f8918a25cf9498fb293c6411987cb5173f9c961b5e758cff4544dfe` |
| `src/execution-v2/c2-p7-acceptance.ts` | `6d59ee3b837a42cc77a19659370efa0704b384aaca1f3b821b301ff0aa79017e` |
| `test/c2-p7-acceptance-pg.spec.ts` | `b9a22ea2017a789d50d15efacd340856f729977dc98fba15c9292e4a25765475` |
| `src/execution-v2/c2-b2-publication-preflight.ts` | `81dec391e76cb1c3667cfb78729b5192b15003e2b4d52ea14ccf7d868b313c6c` |

Paths are relative to `apps/control-api/`. Candidate SQL is additive and is
**not** a numbered or runtime-installed migration.

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-unentered-unknown`:
  **4/4** in disposable PostgreSQL. Covers ISSUED/RETIRED → UNKNOWN, exact
  rollback and replay, wrong attempt/COMMITTED rejection, reconstruction,
  drain and concurrent UNKNOWN, plus entered → UNKNOWN → COMMITTED.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-regression`: **8/8**
  selected, **102 skipped**, not a full-suite pass. Covers selected revoke,
  global revision, restore quiescence and unentered rollback cases. These
  cases exercised the base SQL, while the four-test lane above applied the
  additive candidate SQL.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **5/5** with
  synthetic owner/session/source proofs on disposable PostgreSQL. Exact-byte
  retry fencing is not a semantic-intent fence.
- `bash scripts/test-elp2-c2-p7-pg.sh`: **2/2**, synthetic source verifier
  and disposable PostgreSQL, actual delivered B1 public bytes. Exercises
  session/owner/step-up locking, preparation retry, immutable records, source
  mismatch and session revocation. Unit **7/7** separately passed.
- The source-only B2 preparation bridge passed **3/3** focused tests. A
  separate combined run was interrupted and is **not** counted as PASS.

Each PostgreSQL cell used a unique database, bounded containers, a heavy-work
lock, internal network and tmpfs. Exact owned containers/networks were cleaned
up; the P7 container and network inventory returned empty. A read-only
aggregate query of the existing Research preview database found **zero current
owner sessions** at the time observed. The first role/permission probes failed;
the corrected read-only query succeeded. This is not a request to reset an
account, synthesize a session, or treat a chat approval as P7 evidence.

## Still required

The candidate must be integrated with the actual source-authenticated verifier
and held source fence, current owner identity/workspace mapping and real
step-up session. P7 records above are explicitly `RECORDED_NOT_AUTHORIZED`.
The Core raw-byte duplicate fence does not identify the same semantic original
encoded differently; custody/ACK and same-original recovery remain open. The
additive C-P3-3 trigger needs full integration and migration review. Independent
recovery authority, old-holder fencing and terminal/ACK reconciliation after
snapshot remain unqualified; no database cutover is authorized. The A2 listener,
JWKS and signed B2 remain uninstalled/unissued.
