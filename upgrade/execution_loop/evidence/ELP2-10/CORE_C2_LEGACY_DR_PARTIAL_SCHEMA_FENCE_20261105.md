# Legacy DR refuses standalone C2 and recovery schemas — 2026-11-05

**SOURCE ONLY; V2 RESTORE STILL REFUSED.** Branch `docs/research-loop-plan`,
committed HEAD `2faa8968f`; changes are uncommitted and not installed. No
runtime, protected database, credential or UI was changed.

The legacy UDB-04 DR harness refuses a database containing Execution V2
authority or numbered V2 migrations. Its schema probe previously checked
the main `elp210_candidate` namespace but not independently installed C2,
local fence or restore-custody namespaces. A partial install or damaged
restore with only one of those namespaces could therefore be misclassified
as legacy if the other listed relations and migration records were absent.

The actual probe now also rejects any `elp210_c2_` namespace and the exact
`portal_local_write_fence`, `portal_restore_authority` and
`portal_restore_original_custody` namespaces. The prefix comparison is
literal, not a SQL wildcard. Existing relation and migration checks remain.
This affects the legacy test harness's refusal only; it does not enable V2
restore or change any running service.

## Validation

- `node --test scripts/research-udb/legacy-dr-guard.test.mjs`: exit 0.
- `bash scripts/test-elp2-restore-inventory-rls.sh legacy-dr-guard`: **1/1
  passed** on an isolated, newly created PostgreSQL database. The test reads
  the actual JS probe, checks each standalone namespace, a nonmatching
  lookalike, a clean legacy case and the existing migration check. The
  container/network cleanup ran; a read-only container-name check found no
  leftover container from that runner.
- `node --check scripts/research-udb/legacy-dr-guard.mjs`,
  `bash scripts/execution-tracking-test.sh`, and `git diff --check`: exit 0.
  No full project typecheck, normal hook, actual
  restore, connected acceptance or G2 is claimed.

| File | SHA-256 |
| --- | --- |
| `scripts/research-udb/legacy-dr-guard.mjs` | `fa1368d38890b22f19fd95f5f14aa53313417a9ab0242932d0208020d39fd802` |
| `scripts/research-udb/legacy-dr-guard.test.mjs` | `bacabff1f583eb07ecd1ef9c03912682dee1fbe5b97aa05f40c3ae1249da3839` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `815d43aa9e031e7e19f37e2508728d635222e439cbe8807f0f5ab398f18d5d5b` |
| `apps/control-api/test/legacy-dr-guard-pg.spec.ts` | `e389f243cb1685390b2cb3fbd36f182333e41052c551bf3263ce3f953bdf010d` |

No local schema probe can detect a backup that has lost *all* V2 schemas and
migration history. Independent install/custody authority, old-holder fencing,
post-snapshot terminal/ACK census and representative restore remain necessary.
The changed runner hash supersedes earlier runner pins only for this test;
revalidate dependent evidence on the frozen candidate. No frontend request.
