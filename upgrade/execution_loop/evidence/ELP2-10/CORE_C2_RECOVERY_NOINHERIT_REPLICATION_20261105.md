# Recovery/P7: reachable role parameter privilege — 2026-11-05

**SOURCE/TEST ONLY; unmounted.** A2, V2 restore and ELP2-10/11 remain open. This is not an independent old-holder fence, source proof or a cutover permit.

## Finding and correction

The earlier necessary check tested `has_parameter_privilege(writer, 'session_replication_role', 'SET')`. On the disposable recovery database, a login marked `NOINHERIT` had no such effective privilege itself, yet could `SET ROLE` to a parent with that privilege. Before this change its ordinary insert was allowed by the local fence; the targeted regression reproduced that result. The three source-only `writer_is_safe` variants now reject if **any reachable member role** has that parameter privilege. P7's necessary role check and diagnostic rights fingerprint likewise inspect the transitive reachable roles.

**Material residual risk:** this change does not stop an already admitted writer after an administrator grants the dangerous privilege. In an isolated test, after the grant the writer set the parameter through its parent, reset role and inserted with triggers disabled; the transaction was rolled back and the row was absent afterward. A trigger cannot enforce a check while it is disabled. Independent control and fencing of privilege changes and old holders remain required; do not commission or restore merely because these tests pass.

The first P7 regression mistakenly assumed the parameter privilege function would return false for that test role; it returned true and those two initial runs failed. The corrected regression does not use that assumption; it verifies the real role switch, changed observation and refusal. The first recovery run had the opposite expectation and failed at that expectation; after correcting it, the pre-fix run reproduced the admitted insert. None of these failed runs is a pass.

## Validation

- Disposable recovery base fence: **2/2**, including `NOINHERIT`, explicit `SET ROLE`, refusal while triggers run and the rolled-back post-admission bypass counterexample.
- Disposable C2 and delivery extension suites: **2/2** each, including reachable parent parameter grant on the replaced `writer_is_safe` implementation.
- P7 schema observation: **6/6** after correction; checks reachable role and observation drift. Fingerprint contents changed again, so previous rights digests cannot serve as the new qualified baseline.
- Two-cluster checkpoint, authority-upgrade and STATUS census retake: **19/19** on these SQL inputs. Strict focused typecheck for the P7 observation source and `git diff --check`: exit 0. No full compiler or normal hook.
- Runners owned and cleaned their cells; no container matching `elp2-` remained afterward. Peak resources not measured.

| Working input | SHA-256 |
| --- | --- |
| `restore-local-generation-fence-candidate.sql` | `62479f7222ff2ff6beab3889518ea96d69469b41bd97bf0f587197aab662101d` |
| `restore-local-generation-c2-extension-candidate.sql` | `bab9f66f4e0d16b29cf307ae5ebe295b25a2570a7b74263fac4f8e86d1880d60` |
| `restore-local-generation-delivery-extension-candidate.sql` | `20a8cb9c8eb2735f570a3d58dec4cc207c03d91ccaa044438cf93c3cfbff4665` |
| `c2-p7-schema-observation.ts` | `cfecf76c817a088ae280701b7be38b4122d8b910fcbc3db5426a306f0c8082cb` |
| `restore-local-generation-fence-pg.spec.ts` | `0f6b3d77771fd35e9885d9dddbe57af79ce1da0689415e07dcdfe9362d126432` |
| `restore-local-generation-c2-extension-pg.spec.ts` | `85ab054fdb1d56191fdedea287035b6bdeb69bd6ad190b115160e2fac51388d0` |
| `restore-local-generation-delivery-extension-pg.spec.ts` | `6953c98fa554f7f991928c66f46948aa122c39066c9d58efb24eef097f2db8c8` |
| `c2-p7-schema-observation-pg.spec.ts` | `8917abf132566039698cf2ef554552136aa822ed13eb370bfd1f467d7ab4b234` |

This supersedes the earlier P7 rights-fingerprint and local-fence input pins where these files overlap; all transitive impacts still need review on the frozen candidate. No frontend change or source authority was created.
