# Registered native ROOT receipt provider — 25 October 2026

Status: **SOURCE_IMPLEMENTED / FOCUSED_CELL_PASS, NOT_INSTALLED**.
This delivers ordinary ROOT receipt intake, not Manager-domain authority or a
commissioned provider for subsequent READ/STREAM/HISTORY/REPLAY.

## Inputs and implementation

Core base `0fae408ee0340f27546b3687b19bd1cb196267f7`, owned branch
`chore/core-provider-assembly-20261025`. PM wire source base
`29022f96578b5fde5e6ed7627e4d2d613b778fa8` in its separately owned candidate.

- New private codec and pinned mTLS client authenticate six fixed native
  routes; registered version remains a BIGINT string, never a JavaScript float.
- QUALIFY issues an unentered observation and cancels it; COMMIT reacquires a
  fresh held MUTATION using the actual persisted Core mutation identity.
- Migration 152 stores immutable original, attempt, source digest and terminal
  custody. Core's actual grant/event and mutation terminal commit together.
- Lost ISSUE/ENTER/source ACK retains the same original. Recovery serializes
  rollback tombstones or replays the genuine COMMITTED terminal; it does not
  manufacture a held handle, receipt, source ENTER, new intent or human session.
- Existing source providers and read purposes are preserved. `compose()` only
  replaces `verifyRootReceipt`, not `relations()` or `verifiedHumanMapping()`.

## Actual verification

| Gate | Result and scope |
| --- | --- |
| Native codec/client | 24 PASS, real loopback mTLS with explicit synthetic source responses |
| Four affected forwarding suites | 192 PASS, 80 conditional PG cases skipped in this pure lane |
| Core source TypeScript | `tsc -p tsconfig.build.json --noEmit` PASS |
| `control-api-test.sh test/elp210-native-root-provider.spec.ts test/elp210-root-receipt.spec.ts` | 73 PASS; real isolated PostgreSQL, migration 152, max-one-connection Core, loopback mTLS, physical COMMIT/rollback/recovery; regular dump/restore gate PASS |
| PM provider review | ACCEPT after atomic same-lease admission and UTF-8 response-budget fixes |

The default restore tool's versioned fingerprints retain their existing
relation inventory; this is not a claim of a new dedicated ROOT-custody DR
certification. The dump includes the new table, and focused tests independently
verify retained originals/terminals reject edits/deletes.

The broad `npm run typecheck` was also attempted: NOT_PASS because of existing
test mocks/frontend JSX configuration plus one new command constructor error.
The command error was fixed; the production-only build and the official focused
PostgreSQL runner subsequently compiled successfully. Do not call the broad
test typecheck green or count skipped cases as PASS.

## Commissioning / handoff

No image, listener, runtime configuration, schema, account, grant or policy was
installed. No UI, push, stable/dev/main/provider28445 or command/Live changes.
An independently accepted ordinary ROOT original and reviewed native
registration/trust are still required for real source installation. Historical
ROOT receipt attachment cannot substitute for fresh current READ/STREAM
authority. Missing credentials/authority are not fabricated from Manager grants.

Claude can review the internal boundary without changing components or public
DTOs. Core next: finish the financial owning-COMMIT/APPLIED/ACK chain and Edge
STATUS-only composition; then combine source gates at the controlled landing
milestone. Full ELP2-10 and ELP2-11 entry remain NOT_MET.

Verification policy: focused source intermediate commit under campaign
§10.10c; full normal hook belongs to the frozen landing candidate, not this
uninstalled source snapshot. Rollback is removal of candidate mounts only;
never delete retained attempts, source custody, permissions or audit.
