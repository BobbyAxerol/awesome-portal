# C2 P7/STATUS/recovery cross-slice regression — 2026-11-06

**TEST-FIX AND FOCUSED RETAKE ONLY.** Checkout `docs/research-loop-plan` at
committed HEAD `2faa8968fddb` plus shared, unfrozen tracked and untracked WIP.
This is not an integrated candidate, normal hook, runtime installation, A2,
owner authentication, Edge ACK, restore authorization or phase PASS.

## Finding and change

A cross-slice run exposed a stale SQL-flow fake in
`apps/control-api/test/restore-checkpoint-authority.spec.ts`: the authority
candidate now obtains and verifies the catalog SHARE lock before examining the
journal guard, but the fake did not recognize those queries. Five tests failed
with `Unexpected SQL: SELECT portal_restore_authority.lock_guard_catalog_for_write()`.
The test-only correction models the query and checks its ordering, and adds a
negative case that returns no lock and verifies no head/event was written. It
does not change the authority implementation or weaken its guard. The fake is
not a PostgreSQL lock, DDL race, independent trust boundary or restore proof.

## Verification and boundaries

- First 26-file focused run, default sandbox: **189 PASS, 29 FAIL, 5 SKIP**.
  The five failures above were the stale fake; 24 transport failures reported
  `listen EPERM 127.0.0.1`, because that sandbox denied loopback binding. This
  failed run is retained here and is not counted as PASS.
- After the fake correction, the same 26 files ran with authorized loopback:
  **25 files PASS, one file skipped; 219 tests PASS, 5 SKIP**, exit 0. The
  files cover B1/B2 preparation, P7 candidate/guards, STATUS and checkpoint
  unit control flow. This combines multiple independent fixtures and is not
  one end-to-end connected flow. The skipped cases required separately
  supplied public B1 bytes and pin.
- A separate retake supplied the previously pinned public B1 byte file and
  independent SHA-256 `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`:
  **3 files, 16 tests PASS**, including the five previously skipped cases.
  Eleven other cases overlap the previous run and must not be added as new
  coverage. B1 validation and ephemeral test keys do not sign B2, establish
  owner acceptance or qualify the TS/Edge source.
- Both Vitest runs used a single worker and `/tmp/portal-heavy.lock`. The
  authorized retake opened local test listeners only; no shared runtime,
  credentials, persistent database or Edge service was changed. These two runs
  used no disposable containers. Resource peaks were **NOT_MEASURED**; the
  read-only capacity snapshot showed 256 GiB free on `/home/bobby`.
- Current-WIP retake of `bash scripts/test-elp2-restore-checkpoint-pg.sh`:
  **3 files / 30 tests PASS**, exit 0: checkpoint authority 10/10, populated
  STATUS ACK census 11/11 and schema/helper upgrade 9/9, on isolated disposable
  PostgreSQL clusters including the script's separate migrated database. The
  script uses its own nonblocking heavy lock and exact-name cleanup; filtered
  read-only Docker checks found no remaining `elp2-ckpt-` containers/networks.
  Configured maximum is 2 CPU / 1.5 GiB; actual peaks were NOT_MEASURED. Two
  earlier attempts incorrectly wrapped this self-locking script in another
  `flock` and exited 1 immediately, before creating resources; neither is a
  test result. This retake overlaps earlier receipts and is not evidence of
  deployed schema, an independently operated authority, genuine Edge ACK, a
  representative restored environment or a restore permit.
- `git diff --check` passed for tracked changes and
  `bash scripts/execution-tracking-test.sh` passed after the Unified/sync
  update. The test and this receipt are currently untracked; neither result
  reviews their complete contents or makes the shared WIP committed.
- Working-file SHA-256: test
  `ad391aaed7829c270e507921aface0e4bf6fa5032e2d74003ef5976c5792f902`;
  `restore-checkpoint-authority.ts`
  `5c18aa01759132d508de7e2d34b33c08f043a1bd64b7951059a2a91189ba3135`.
  Other transitive inputs were not frozen; retake affected gates on the final
  candidate. This is not the full project typecheck or normal hook.

  PostgreSQL test pins: checkpoint
  `d61e7bcf4f1af7385b646a480130a91e0116b354799478ab76ea75c4985bd12d`;
  upgrade `de83d2c96aac21b092985be1594570a381fd467ed2dedb22fb5dfc8025227e29`;
  ACK census `561a43ef09f512a4f1e186b98a5d3285ca3c2f83f5617a9e2f7e83becca1b34d`;
  script `9e764073f09c456912e63ee99b49f990449229ce60fd9fca22815a3d57b44bfc`.

## Next work and rollback

Core must still qualify independent P7 owner authentication/key custody,
exclusive HTTP egress, and independent monotonic recovery authority with
old-holder fences and post-snapshot terminal/ACK census; integrate and review
the shared WIP before final gates. Edge remains the source for genuine
authority and terminal/ACK evidence. **A2 NOT_READY, B2 NOT_SIGNED;
ELP2-10/11 OPEN.** No frontend contract or Claude consumer change is requested.
Rollback: leave the candidate unmounted and V2 restore refused; reverting this
test-only fake change would restore the stale test failure, not a safer runtime.
