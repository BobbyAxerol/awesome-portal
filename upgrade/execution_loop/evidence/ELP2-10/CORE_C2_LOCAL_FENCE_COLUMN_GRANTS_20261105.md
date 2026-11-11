# Local recovery fence: column-only privileges — 2026-11-05

**Disposition: source candidate repaired and tested on disposable PostgreSQL;
not installed, not a V2 restore authorization or connected receipt.**

The local generation fence's `writer_is_safe` checked table-level INSERT and
UPDATE privileges on its protected head and history relations. PostgreSQL can
grant either privilege for individual columns without granting it on the whole
table. Before the change, a regression granted `UPDATE(writer_oid)` on the
head to a writer: `has_table_privilege` was false, but
`has_any_column_privilege` was true, and the candidate still allowed a fenced
business write. The disposable base test consequently failed: **1 passed,
1 failed**. This is an observation about the candidate, not a claim about an
installed runtime.

The base SQL and both C2/delivery extensions now reject effective INSERT or
UPDATE privileges on any column of the protected relations; they continue to
check the other table-level mutation privileges. Both extensions redefine the
function, so all three must be selected together. Regression cases check direct
column grants on head, writer history and freeze history, and an inherited
column grant in the base suite. The writer must fail closed, not merely report
the unsafe role.

## Focused verification

`scripts/test-elp2-restore-inventory-rls.sh` with each named selector used
disposable PostgreSQL test infrastructure:

| Selector | Result after fix |
| --- | --- |
| `restore-fence` | 2/2 PASS, including inherited column grant |
| `restore-c2-fence` | 2/2 PASS |
| `restore-delivery-fence` | 2/2 PASS |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | 8/8 PASS on two disposable clusters; includes migrated/candidate schema with all three changed fence files |

The last base retake completed with exit 0 after the inherited case was added.
The test harness cleans its disposable containers and network. No product DB,
runtime, migration, authority or frontend was changed by these tests. Full
typecheck and normal hook were not run as part of this slice. The initial
checkpoint invocation was refused by the sandbox's `sudo` restriction; the
approved isolated retake completed with exit 0. The checkpoint test is a
local integration regression, not a complete independent restore barrier.

## Source pins

| Path under repository root | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-local-generation-fence-candidate.sql` | `2fe6598c8f093c7a76e96d33333f71f6935f76821f20357e97b9cc8ad1a53fd0` |
| `apps/control-api/src/execution-v2/restore-local-generation-c2-extension-candidate.sql` | `94a3645b2a1233ef5a3f5f5bb7262ac0ef87ec7c784e172ce980e17128036485` |
| `apps/control-api/src/execution-v2/restore-local-generation-delivery-extension-candidate.sql` | `7dacdb09c9c9e264719eccea4aff287a666033e2b9350bcfc0290a92b312a7c9` |
| `apps/control-api/test/restore-local-generation-fence-pg.spec.ts` | `af7e849214ea765663c6e1377898e2c82d861cb8413e282a13f854e3408b1776` |
| `apps/control-api/test/restore-local-generation-c2-extension-pg.spec.ts` | `7b21619ac0900dee598cf848ed10b0e48865b121dd52b6a06d093f9b0c40f24a` |
| `apps/control-api/test/restore-local-generation-delivery-extension-pg.spec.ts` | `0e4aebf36d987de11414e7391820eeda481879fbc0a3efc638d996cb94309f34` |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority.ts` | `52265367d3f11b773fc9b166deb00b9d54caa7c988e66e0bfee09d5368bb5ce3` |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority.sql` | `ef9b52f2fdfc6c30044abe05d3fe248bc75812d11dc029af06de72252bc55bfa` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `17dd14a763489ae8982749ba62f9f74965e378aec337eeb6c1b3272cc4279262` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `37b4c824a46fc1bc6eff4392e277da20fed472a8c5353913639527998991c50e` |

These are uncommitted candidate files. Revalidate transitive schema, role and
test inputs on the selected integration candidate. This local fence does not
fence an older database copy, independently administered authority, HTTP or
Edge/TS, nor prove post-snapshot terminal/ACK completeness. Role changes
concurrent with in-flight operations are not established by this receipt. V2
restore remains refused pending the complete recovery protocol. A2, P7 and
connected acceptance remain open. No new frontend contract or action.
