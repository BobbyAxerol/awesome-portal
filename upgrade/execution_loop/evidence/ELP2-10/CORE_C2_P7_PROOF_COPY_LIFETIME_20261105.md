# P7 verifier proof-copy lifetime — 2026-11-05

**SOURCE ONLY; P7/A2 NOT READY.** The record candidate and review service
previously passed fresh in-process copies of the signed source envelope to a
verifier without explicitly clearing those copies. Both paths now clear their
own copy in a `finally`, including verification failure, exception, and
database errors; the caller-owned buffer and the service's pinned input are
not modified. This reduces avoidable in-process retention: JavaScript strings,
runtime copies, the configured pinned source envelope, verifier internals and
external storage are not claimed to be securely erased. This is not a grant,
owner acceptance, or an HTTP delivery/revocation fence.

- P7 acceptance/review/HTTP focused tests: **30/30 PASS** across three files.
  Tests check copy clearing after success and thrown/rejected verification,
  preservation of caller/pinned bytes and continued operation.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **5/5 PASS**, exit 0,
  disposable PostgreSQL and synthetic HTTP session/owner/source. The test cell
  was removed; a subsequent container inventory showed no P7 cell.
- Strict targeted TypeScript check of the two changed modules and transitive
  imports: exit 0. `git diff --check`: exit 0 for tracked files. Full candidate
  typecheck and normal hook were not run.
- An initial test invocation supplied `--maxWorkers` twice and exited before
  running tests. It was corrected; it is not counted as a pass.

Local uncommitted SHA256:

| File | SHA256 |
| --- | --- |
| `c2-p7-acceptance.ts` | `32902b2b029e48675964e92fdf6a4e7519bb0df99148c14473fc91d4076c7f3a` |
| `c2-p7-review-candidate.service.ts` | `e1ded483f0153d9fda059f231ec88d07ed96b0ca13681dd176351be6e5ed822f` |
| `c2-p7-acceptance.spec.ts` | `2edf02507bdc298042455c50cc45eecf05dd520f26db1f8829859f00a6f56612` |
| `c2-p7-review-candidate.spec.ts` | `18058689ca2ab2d91722cee97c30f7d23d41490dac18e632ac6129d143782e3d` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `15360917e6e3ba15095730a149bad9cff79dd3aa694ecc92a289001179b516cf` |

No shared runtime, credentials, grants, frontend, stable/dev/main, or remote
refs were changed. Core still must implement and qualify same-fence P7/issuer
delivery and the V2 restore barrier; Claude has no new field to consume.
