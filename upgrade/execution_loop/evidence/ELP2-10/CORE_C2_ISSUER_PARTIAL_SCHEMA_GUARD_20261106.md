# C2 issuer upgrade: partially present schema guard — 2026-11-06

**SOURCE-ONLY, UNMOUNTED.** This does not commission P7/A2, authorize a
runtime migration, or permit a V2 restore. The issuer remains fenced.

## Defect and change

The candidate forward-upgrade accepted an already-present nullable `text`
pin without verifying the pin's required CHECK constraint. A partial or
drifted schema could therefore be accepted while lacking the intended digest
validation. The disposable regression was run before the fix and failed
because the upgrade resolved successfully instead of rejecting that schema.
This is a candidate-schema defect, not a finding that production was exposed.

The unmounted upgrade now verifies the expected validated CHECK expression
for each already-present text pin using a same-PostgreSQL-version temporary
reference relation; it also rejects existing pins with defaults, generated or
identity attributes, wrong type or NOT NULL. Missing columns are still added
normally. An existing column with no constraint, a weak `CHECK`, an unvalidated
CHECK or a default is refused inside the transaction. No historical issuer or
digest is inferred; historical nulls stay null. The test verifies that a
rejected transaction did not add another missing column and that a clean
partial upgrade remains possible.

## Tests and scope

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-issuer-upgrade`:
  **1/1 selected PASS; 22 skipped**. This was the pre-fix failing test and
  then the passing retake, extended with weak/unvalidated/default negatives.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **23/23 PASS**
  on the two-cluster disposable cell; includes the selected upgrade test.
  These totals overlap and must not be added as independent coverage.
- `bash scripts/test-elp2-c2-historical-clone.sh`: **2/2 PASS** on the same
  read-only historical preview backup and bounded disposable restore described
  in [the original receipt](CORE_C2_HISTORICAL_CLONE_REHEARSAL_20261106.md),
  retaken with the SQL hash below. It checks the selected historical rows,
  synthetic legacy lease and selected security metadata, not every database
  object or a production restore. The original receipt retains its old pins.
- The first test-inclusive focused TypeScript invocation exited **2** because
  its hand-written flags omitted this project's `experimentalDecorators` and
  `emitDecoratorMetadata`. This is not a PASS. The same targeted check was
  rerun with both flags and completed **exit 0**. This is not the full-project
  typecheck or normal hook.
  `bash scripts/execution-tracking-test.sh` passed. `git diff --check` passed
  for tracked files; separate `git diff --no-index --check` checks of this
  SQL, its test and this receipt produced no whitespace warnings (exit 1
  denotes differences from an empty file). The full hook has not been run and
  no candidate SHA has been frozen.

## Pins and cleanup

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-human-issuer-upgrade-candidate.sql` | `6a6ac5596de8a1e3cacbc831f4619a3757555680db0ec89c7d01f9950f44db32` |
| `apps/control-api/test/c2-owner-issuer-pg.spec.ts` | `c7e05c4a236bd400721bfdedcec784fa31ce4db3ecb214e2bf5b7d31e05c69b6` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `e3c911cb0adc61d810d4477fb3398d5a26e5fa4ede8b3a7a5ccb38b359719138` |
| `apps/control-api/test/c2-historical-candidate-rehearsal.spec.ts` | `f9dbfa4bdd3661ba8aa0750900793f01a0e3a46d272c2f7e7a761782ca54fdaf` |
| `scripts/test-elp2-c2-historical-clone.sh` | `a21723ca2091c54a95c003b9c45901a75c492060fb518941cc22e056c67cff14` |

Both scripts use bounded disposable cells and cleanup traps; the historical
backup was mounted read-only and retained. Post-run checks found no test
node containers or networks with the `elp2-restore-rls` / `elp2-c2-clone`
names, or containers with the `control-api-test-postgres` /
`control-api-test-authority` names. The clone's anonymous volume ID was not
separately captured, so its independent absence was not verified. No shared
volume, live database, runtime, credential or UI was
changed. Disk snapshot: `/home/bobby` 270 GiB available, 57% used.

## Remaining gates

The guard is not a complete schema, function-body, role/ACL, or independent
authority qualification. Existing trigger/function state, old-holder and
source fencing, terminal/ACK reconciliation, safe V2 restore, A2/P7 and Edge
commissioning remain open. The integrated candidate, its transitive test
pins, representative migration/rollback and final normal hook remain open.
There is no frontend contract change or new Claude action in this slice.
