# C2 STATUS: original command workspace binding

**SOURCE/TEST ONLY; not installed, not Edge acceptance, and not ELP2-07/10/11
PASS.** The shared checkout has unrelated WIP; this record describes only the
specific files and test below.

`PgCommandStatusPreparations.reserve/find` already join the immutable original
command to its workspace. The unmounted current-human candidate separately
checked a preparation against its immutable fingerprint but did not recheck the
command's workspace. It now also requires the fingerprint's command workspace
to equal the preparation workspace on C2 issue, same-lease resume and
revalidation. The existing preparation row lock is retained. This is
defence-in-depth against a misbound/corrupted preparation; no production
incident or ordinary-path exploit has been demonstrated.

The isolated regression inserts a separate TEST_ONLY command and fingerprint
in another workspace with otherwise equal synthetic digests and points a
privileged test preparation at it. All three issuer operations refuse; after
restoring the original link the positive flow remains functional. The test
does not authenticate a real owner, source, Edge ACK or production DB role.

## Verification and pins

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS** using
  two disposable PostgreSQL systems. First run: **1 PASS / 8 FAIL**. Its first
  failure was the test fixture creating a workspace after pinning the global
  authority revision; the resulting revision change made an earlier fence
  refuse before the intended check and later cases used incomplete state. The
  fixture now creates the other workspace before the revision baseline. The
  failed run is not counted as evidence of the new fence.
- Focused strict TypeScript check of `current-human-candidate.ts`: exit 0. The
  first invocation used an absent root `tsc` path and exited 127; the retake
  used the control-api local binary. Neither check is the integrated hook.
- `git diff --check`: exit 0. Script-created test containers and network were
  absent in the read-only post-check. No production/stable/dev database,
  shared runtime, UI, command/Live or Edge source was changed.
- SHA-256 `current-human-candidate.ts`:
  `8929d23c4fca6916f0b912a5e583d09c773a299a19ba0e25575227824e34e099`.
- SHA-256 `c2-p7-owner-intent-candidate-pg.spec.ts`:
  `59834af558578f50b06797f8a7e4157ca923e09ea6c71a6b147d83b66b02044e`.

The SELECT joins the immutable command and holds `FOR SHARE` on the
preparation until the transaction ends. Restricted runtime role/row-lock
privileges, trusted writer and HTTP egress custody still require qualification.
Independent owner authority, genuine Edge terminal/ACK, V2 restore, candidate
integration and final gates remain open. No frontend contract/action is added.
Rollback: keep this unmounted WIP out of runtime; no data/schema was changed.
