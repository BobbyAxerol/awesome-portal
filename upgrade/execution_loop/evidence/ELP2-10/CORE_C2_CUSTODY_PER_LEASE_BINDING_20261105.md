# C2 custody per-lease binding — candidate, 2026-11-05

**Status: SOURCE_ONLY; NOT READY for integration or connected acceptance.**
This candidate binds each new C2 lease to the custody configuration at issue,
preserves that pin over restart, checks it on append/ENTER/terminal/resume,
and rejects changing the pin or removing its assertion digest. Existing
unpinned leases are not backfilled; their custody entry remains unavailable.
Configuration is copied/frozen; adjustable capacity is excluded from identity.
An unpinned legacy C2 issue interface remains candidate-only and must not be
mounted or treated as an accepted production issuance path.

The candidate schema upgrade initially failed on an existing trigger. The
upgrade now accepts only the expected enabled row-level BEFORE UPDATE trigger
for its function, creates it if absent, and still rejects a fully applied
upgrade. It does not apply to a running database.

## Focused checks

- Independent custody: **4/4 PASS** on two separate disposable PostgreSQL
  clusters, including wrong-store refusal, capacity, reissue/restart and
  immutable pin; test cell cleanup is handled by the script.
- Candidate legacy upgrade: **1/1 PASS** on disposable PostgreSQL after the
  initial failure and repair; 17 other tests were excluded in that run.
- Core quiescence / current-human transport / issuer composition: **39/39 PASS**.
- Targeted strict TypeScript check: **PASS**.
- Full C2 owner suite: **14/18 PASS, 4 FAIL**. Four legacy tests call the
  uncustodied C2 ENTER/RESOLVE paths; these now fail closed with
  `CURRENT_HUMAN_C2_CUSTODY_REQUIRED`. They need migration to a genuine
  two-cluster custody test harness, preserving assertions on expiry, key
  rotation, UNKNOWN and terminal after revoke. Do not weaken the guard or
  relabel the four tests as passing. The previously reported 110/110 belongs
  to an earlier source revision and is not a receipt for this one.

## Exact source pins (SHA-256)

| File | SHA-256 |
| --- | --- |
| `current-human-candidate.sql` | `083a2bb04f846feefcf1e64ca71ee9159987672ec9a59d8cfef80577a0790f54` |
| `c2-human-issuer-upgrade-candidate.sql` | `30fe8602b44f8ee015a4b8432a8821b3589ee8264d08f382d94e329fbe950f62` |
| `current-human-candidate.ts` | `ceae13232b0f5ae8b92cbe77c528beee76e520c4e72ff899fa85f62a87fb164c` |
| `restore-independent-custody-candidate.ts` | `e08de7c87614f5b9cda74b3683c5f231f917308bdcb9bc9c89e274fdb8cadbf7` |
| `c2-custodied-issuer-candidate.ts` | `4fac2fd7d9214241996d6e3cce57aec46a34e0fda22d47f22c7f47b0adafe65e` |
| `restore-independent-custody-candidate-pg.spec.ts` | `4d30597982dee8a27ba6213e9969263ed89ebd4ffe04678cec42243d43092857` |

Files are under `apps/control-api/src/execution-v2/`, except the last under
`apps/control-api/test/`. Pins identify working-tree bytes, not an image.

## Remaining gates

Complete and retest the four owner scenarios against independent custody;
qualify failure-domain isolation and authority DB ownership/ACL; complete
post-snapshot terminal/ACK reconciliation and restore with representative
history. Matching PostgreSQL system identifiers alone do not establish a
separate physical failure domain, especially for clones. Actual A2 issuer,
listener, source registration and authenticated P7 remain uncommissioned;
static R1 is only a delivered partial. The first attempted SSH address failed
host identity validation and was not used. Another HK address explicitly
recorded in an existing Claude handoff was subsequently verified against the
existing `known_hosts` entry and read-only SSH succeeded; no host key was
replaced or bypassed. Edge status on that host confirms static R1 in the TS
exchange, not full A2 acceptance. No runtime/schema installed, no source ACK,
no B2 signature, no normal hook, landing or push in this slice.

## Follow-through: owner scenarios on two clusters

The earlier **14/18** result above is retained as the original run, not the
current disposition. The `c2-owner` test cell now starts a second disposable
PostgreSQL cluster and verifies distinct system identifiers before use. Four
tests exercise the custodied issuer and terminal coordinators, including
expiry, rotated human key, UNKNOWN and terminal after revoke. The terminal
retry uses the identical signed source proof, not a new source attempt.
The expiration fixture was extended from 3.5 to 8 seconds to allow the real
two-cluster operations, and still checks entry before expiry and settlement
after expiry. The forged assertion is now stopped by the earlier custody
digest fence; rotated-key revalidation and post-revoke terminal checks remain.

`bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **18/18 PASS**.
Both databases and the test network are disposable; script cleanup ran.
This is not a qualified independent failure-domain deployment or connected
source/Edge acceptance.

| Follow-through input | SHA-256 |
| --- | --- |
| `apps/control-api/test/c2-owner-issuer-pg.spec.ts` | `451e28f8ef97ca9844308282ac603be405bf8cce310569d91f4539265be8aea2` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `42572ea61fde889c527a4f248b8bfe8b370a67fbe9cb16c9404a4bed5b5e5aa5` |

Resource correction: the first two-cluster owner run configured aggregate
container caps of 2.4 CPU / 1,856 MiB, exceeding the approved candidate
ceiling. Actual usage was not measured, so it is unknown whether usage
exceeded that ceiling. No persistent resources were installed. The runner
was corrected to an aggregate 2 CPU / 1,536 MiB, and the complete owner suite
was repeated at those caps: **18/18 PASS**, exit 0. The source-current
`scripts/test-elp2-current-human-pg.sh` also completed **110/110 PASS**, exit 0.
These are separate disposable cells, not one connected acceptance run.
