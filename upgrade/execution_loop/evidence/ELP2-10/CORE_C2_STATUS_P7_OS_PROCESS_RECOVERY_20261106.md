# C2 STATUS — isolated P7 recovery in a separate OS process

**TEST/SOURCE WIP ONLY. NOT RUNTIME, A2, AN EDGE ACK OR A V2 RESTORE.**
Checkout `docs/research-loop-plan`, committed HEAD `2faa8968f`.

## What was exercised

The Core/P7 two-PostgreSQL cell now creates and persists a STATUS assertion
through real Core access, command, fingerprint, P7 fence and independent
custody candidates. After the parent authority is shut down, a separate OS
process constructs fresh access, P7 verifier, custody and authority objects,
reads the same synthetic original, and returns the **same assertion and lease**.
The parent checks that there is still one original context link. The child
then closes its pools and exits with code 0.

The child will only run with the explicit disposable-P7 test flag and matching
`elp2-c2-p7-pg-<suffix>` / `elp2-c2-p7-authority-<suffix>` hosts and
`portal_c2_p7_<suffix>` database. Synthetic registration, source membership,
keys, witness and original are passed only through the child IPC channel; no
values are printed or written to the repository. Synthetic key buffers in the
parent are cleared after the child returns. The owner acceptance and upstream
original remain test data, not commissioned authority.

This is process reconstruction, **not** an observed kill/restart of an
installed service, an HTTP custody response, external recipient ACK, real
source terminal, DR cutover, or independently qualified anti-rollback witness.
The other P7 suite cases and previous receipts must not be added together as
separate connected acceptance runs.

## Test and cleanup

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**,
  exit 0; one suite, 57.17 seconds. Its first run was **5 PASS / 4 FAIL**:
  the expanded first case exceeded Vitest's prior 20-second test timeout and
  the later cases depended on its setup. The integrated case now has its own
  60-second test timeout, with the child itself bounded by 20 seconds plus an
  8-second exit check. This changes no authorization or source deadline.
- Strict helper-only TypeScript check, 768 MiB heap: exit 0.
  `node --check test/fixtures/c2-status-p7-restart-child.cjs`: exit 0.
  The test-inclusive TypeScript check was attempted twice but exhausted
  **768 MiB** and then **1,100 MiB** heap (exit 134 both times); neither is a
  PASS. It was not rerun with a larger budget. Full candidate typecheck and
  normal hook remain required on the frozen integrated candidate.
- Configured aggregate cell ceiling: 2 CPU / 1.5 GiB; actual peak
  **NOT_MEASURED**. Its exact temporary containers and network were removed by
  the test trap; read-only prefix checks found none afterwards. No core dump
  was found at the Control API root after the typecheck failures.

## WIP file pins — SHA-256

| File | Hash |
| --- | --- |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `59a8e99251f5a069cebff5a36728d98509fec916b4cd686330fb5e4b64e4e197` |
| `apps/control-api/test/fixtures/c2-status-core-authority-fixture.ts` | `16157e2a90745c193b1af7e5b2ff241007af3284345fcf1de223ca1ae92e8276` |
| `apps/control-api/test/fixtures/c2-status-p7-restart-child.cjs` | `331f91d0576e4e8033fa20b9d735782776e52a3b1bd607b9ab55ef00559bdaaa` |

These replace the corresponding test-file pins in
[the previous receipt](CORE_C2_STATUS_REAL_CORE_PREPARATION_20261106.md);
that receipt remains valid only for its recorded historical inputs.

## Next / consumer / rollback

Core must join the actual authority/P7 path to authenticated HTTP custody and
test recovery across process loss, terminal and recipient ACK; obtain genuine
source and ACK via Edge. Independently controlled anti-rollback authority,
old-holder fencing, post-snapshot reconciliation, representative restore,
candidate integration and qualification remain open. No frontend contract or
action is added; Claude may continue on the existing consumer. Leave the
candidate unmounted and V2 restore refused until the relevant gates pass.
