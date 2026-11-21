# C2 ENTER custody and bounded outcome reservation — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED; NOT A2 OR RESTORE CUTOVER.** Research branch
`docs/research-loop-plan` at base `2faa8968fddbde59b2e59525e334ba3d83886144`
plus existing shared uncommitted WIP. No runtime, credential, DB, grant,
command, Live or stable/dev/main state was changed.

The unmounted C2 mTLS listener now invokes a custodied ENTER path: Core first
admits the exact attempt, then the independent journal verifies its signed
source proof against the locked lease and stores ENTER **before HTTP ACK**. A
lost custody commit response does not return an ACK or permit retrying ENTER as
a new transaction; the original remains ENTERED for same-original recovery.
The independent chain reserves bounded slots for an issued original's possible
ENTER, UNKNOWN and terminal before that assertion is released; it refuses a new
original if the remaining outcomes would not fit. The candidate SQL is an
isolated installer, not an installed migration.

## Tests

- `bash scripts/test-elp2-independent-custody-pg.sh`: exit 0, **4/4** using
  two disposable PostgreSQL clusters and loopback mTLS with synthetic keys.
  It verifies mTLS ENTER, ENTER record before 200, refusal of repeated ENTER,
  lost ENTER custody response without success, insufficient reserved capacity,
  UNKNOWN and terminal after drain, signed-proof renewal, original/attempt and
  receipt mismatches, and one terminal event. The runner cleaned its cell.
- `npm test -- test/c2-human-issuer-composition.spec.ts
  test/elp210-current-human-transport.spec.ts`: exit 0, **33/33** with isolated
  loopback TLS. Focused strict TypeScript checking of the C2 composition and
  imports exited 0. Neither is the final integrated hook or live acceptance.

| Input | SHA-256 |
| --- | --- |
| `c2-custodied-terminal-candidate.ts` | `c97f144f4843133a7b111df8042d9ba61c21e0f1aab4de20cb07220030a9a129` |
| `restore-independent-custody-candidate.ts` | `4b9165c78e126b676755b98dfe2c4e58d8e5f8c8b701827290fe5119d3e20073` |
| `restore-independent-custody-candidate.sql` | `bf844229058e13bec99caacdb613813c4bd09609121fd6679c8140da6df35e46` |
| `current-human-transport.ts` | `c5fe3f48eff835bf2bdca071a77488daf93c252fdda1f1c02c5efe3c035518a2` |
| `restore-independent-custody-candidate-pg.spec.ts` | `5507edf9bd6946a8e8349871cc9adf9f3c4c95d3f1009069070579fb24d5950e` |

These supersede matching hashes in preceding custody receipts.

## Remaining

Capacity refusal can leave an unexposed Core ISSUED lease after the source DB
commit; this is fail-closed, but a separately qualified reservation/recovery
protocol is still required. Independent failure-domain/immutable authority,
old-holder fence, complete source/ACK census and restored cutover are not
proved. P7 genuine acceptance and source-revocation fencing, actual listener,
P8 and A2 remain uncommissioned; B2 remains unsigned. Final integration review,
normal hook and landing are still open. Fixture proofs are not source evidence.
