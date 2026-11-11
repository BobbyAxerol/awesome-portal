# Recovery candidate: P7 guard coverage — 2026-11-05

**SOURCE AND TEST ONLY; UNCOMMITTED AND UNMOUNTED.** The V2 restore refusal remains in place. This is not an independent old-holder fence, owner authority, source ACK or cutover permit.

## Finding and change

The existing local frozen-checkpoint candidate checked the fixed relations, local generation triggers and delivery business guards, but did not validate the P7 business immutability/monotonicity triggers. On the disposable migrated/candidate schema, disabling the first P7 records guard still returned `candidate_coverage_valid() = true`. The initial regression run was **18 passed / 1 failed** and is not a pass.

The source-only candidate now requires all eight P7 record, registration, owner-intent and revocation guards to have the expected table, function identity, event/timing/row shape, enabled state and no predicate. The existing coverage check is shared by candidate/public writes and frozen checkpoint capture. The check cannot by itself attest trusted function bodies or independently fence privileged owners, another database clone, HTTP, or Edge.

## Validation

- Final `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **19/19** on two dedicated disposable PostgreSQL clusters. The expanded migrated-schema case individually disables all eight P7 triggers and verifies coverage and frozen capture reject each; it also checks active public and candidate writes refuse when a P7 guard is disabled. Existing STATUS ACK census and authority-upgrade suites are included. An intermediate post-fix run was also 19/19, before the final active-write assertions were added.
- `git diff --check`: exit 0. No full compiler, normal hook, real-source acceptance, migration or recovery rehearsal on the final candidate is claimed.
- The runner owns and removes its disposable resources; afterward no container matched `elp2-ckpt-`. Per-cell ceilings and image are defined by the script; peak use was not measured.

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-local-generation-public-extension-candidate.sql` | `5eb3f649014233ac4f5c22c4264ad3ddfa17913ca8b09f119b0607342f241ea4` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `2489896374580fb0c38b08e7b49b580e8789965294ada3d12f100bc0e77a1b78` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `f33df23fc66c316ac880662c9dac705eb6d0fe7f04cd5f90d3e77aeeedbd120a` |

## Remaining work

Qualify independent owner/signing authority and old-holder fencing; reconcile source terminal/ACK after snapshot; review complete security/body drift and writer coverage; then perform representative restore on the frozen, integrated candidate. P7/A2, B2, connected Edge, G2/browser and ELP2-10/11 remain open. No frontend contract changed. Rollback is the existing unmounted state and V2 restore refusal, not acceptance of unchecked guards.
