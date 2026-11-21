# C2 issuer upgrade: existing function drift guard — 2026-11-06

**UNMOUNTED CANDIDATE; no runtime, P7/A2, or V2 restore authorization.**
Supersedes only the SQL/test pins, not the history or broader scope, of the
[partial-schema guard receipt](CORE_C2_ISSUER_PARTIAL_SCHEMA_GUARD_20261106.md).

## Reproduced and repaired

The prior candidate used `CREATE OR REPLACE FUNCTION` unconditionally. In a
disposable regression, a deliberately drifted existing custody trigger body
was silently replaced and the upgrade committed; the test expecting a
refusal failed before the fix. The candidate now checks the existing body and
execution attributes against a same-version temporary reference and refuses
drift, including `SECURITY DEFINER`; it leaves the existing function untouched.
If the old schema has no function or trigger, the upgrade creates both. A
rejected transaction leaves the drifted function and pre-upgrade columns
unchanged; a valid partial upgrade retains historical null pins. The temporary
reference function is dropped before commit. Candidate schema is still fenced.

## Verification

- Initial selected regression failed as expected before the fix: the upgrade
  resolved successfully instead of refusing the drifted body. No existing
  operational database was modified.
- Selected issuer upgrade retake: **1/1 PASS, 22 skipped**; exercises missing
  and weak constraints, wrong attributes, changed function body, security
  definer, transaction preservation and absent-function installation.
- Full `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **23/23
  PASS** on two disposable PostgreSQL clusters. This overlaps the selected test.
- `bash scripts/test-elp2-c2-historical-clone.sh`: **2/2 PASS** with the new
  SQL on the retained backup mounted read-only. Scope remains the selected
  14 historical relation fingerprints and named security metadata; it is not
  an operational migration, independent source authority, or complete restore.
- Focused strict TypeScript retake for the changed test completed **exit 0**;
  this is not a full-project typecheck. `scripts/execution-tracking-test.sh`
  and tracked-file `git diff --check` passed. Full normal hook has not run.

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-human-issuer-upgrade-candidate.sql` | `81cbe2e424e18d6f535a880bcd58f5068ccb72a2d17e9030203626390bf58f18` |
| `apps/control-api/test/c2-owner-issuer-pg.spec.ts` | `5dafd51a045ef1d731f47309235c0e0b0c4c5a1c3a82c90204125042dfb3bc7a` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `e3c911cb0adc61d810d4477fb3398d5a26e5fa4ede8b3a7a5ccb38b359719138` |
| `scripts/test-elp2-c2-historical-clone.sh` | `a21723ca2091c54a95c003b9c45901a75c492060fb518941cc22e056c67cff14` |

The bounded test containers/networks use the scripts' cleanup traps; post-run
checks found no matching named test node, PostgreSQL, authority containers or
networks. The historical clone's anonymous volume identifier was not captured,
so its independent absence was not checked. The backup is retained. Disk:
270 GiB available, 57% used. No UI, shared runtime, grant or remote changed.

## Still required

Exact function owner/ACL, trigger coverage and malicious concurrent DDL are
not qualified by a body check. Independent owner/authority and old-holder
fences, post-snapshot source terminal/ACK reconciliation, full V2 recovery,
P7/A2, Edge connected tests, final migration/rollback and integration hook
remain open. No frontend contract/action is introduced by this candidate.
