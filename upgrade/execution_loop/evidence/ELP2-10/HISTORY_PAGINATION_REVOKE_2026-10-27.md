# Execution History: bounded pagination and revoke — 27 October 2026

## Scope and result

Test-only source commit `989ff3a8e` exercises the existing mounted History V2
Core HTTP path with real disposable PostgreSQL, synthetic data and TEST_ONLY
trust. It inserts 2,500 authorized points alongside three existing ones, reads
all 2,503 points in six 500-row pages, verifies exact order and complete
authorized count, asserts each response is at most 1 MiB, and verifies that
an earlier cursor cannot return items after grant revocation. Existing negative
tests also cover workspace/session scope, in-flight revoke, source cutover and
microsecond cursor preservation. No production code or API contract changed.

Focused `scripts/control-api-test.sh test/elp2-history-read.spec.ts` on this
change: Control API build and migrations PASS; **27/27** tests PASS, including
the new case (2.139 s); isolated PostgreSQL restore/preservation drill PASS.
These are not additional to a full-suite total. An initial sandbox attempt
could not access Docker and exited before running tests; the approved Docker
rerun produced the result above. The exact disposable test Node and PostgreSQL
containers were absent on the read-only post-run check. At inspection Claude's
frontend Vitest suite was also running; both processes were left untouched.
Timing is not a concurrency, network, production SLO or source qualification.

Per campaign §10.10c this is a focused test-only intermediate commit with its
affected PostgreSQL gate passed; `--no-verify` avoids another full frozen-tree
hook. The latest production-code normal-hook receipt remains tied to
`4e3199bd0`, not to a purported new full-suite run.

## Next and handoff

Actual History remains open: Edge-qualified source, HISTORY-specific grant,
pagination/byte-budget and revoke/recovery measurements on that source are
still required. Financial carrier and ownership/census, Calendar provider,
gateway, connected READ/STREAM, calibration and coexistence/G2 remain open.
Claude may continue the previously delivered FE-069 catalogue pagination
handoff; this test adds no frontend field or consumer change. No runtime,
frontend, dev/main/stable, remote push, command or Live state changed.

Verification for this Markdown receipt and Unified link: R0, exact staged
paths, `git diff --cached --check`, linked-file inspection and
`scripts/execution-tracking-test.sh`.
