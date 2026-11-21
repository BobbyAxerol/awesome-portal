# Recovery V2 local fence: privileged writer roles — 2026-11-05

**SOURCE-ONLY; NOT A RESTORE OR CUTOVER PERMIT.** Review found that the
base generation fence and the two extensions replace `writer_is_safe` but
did not reject PostgreSQL `CREATEDB` or `REPLICATION` attributes. All three
candidate definitions now reject those attributes on the selected writer
and reject membership in a role carrying either attribute. Existing checks
for superuser, CREATEROLE, BYPASSRLS, owner/schema and ACL risks remain.

The three disposable PostgreSQL suites each assert fail-closed behavior for
both direct role attributes and membership in a role with both attributes,
as well as their existing rotation, stale writer and coverage checks:

- `bash scripts/test-elp2-restore-inventory-rls.sh restore-fence`: **2/2**, exit 0.
- `bash scripts/test-elp2-restore-inventory-rls.sh restore-c2-fence`: **2/2**, exit 0.
- `bash scripts/test-elp2-restore-inventory-rls.sh restore-delivery-fence`: **2/2**, exit 0.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **8/8**, exit 0,
  rerun after the three SQL changes on two disposable PostgreSQL clusters,
  including the migrated/candidate-schema inventory checkpoint.

The scripts used disposable, resource-bounded PostgreSQL containers and their
own cleanup traps; a subsequent read-only check found no container matching
`elp2-restore-rls`. `git diff --check` passed for tracked files only; these
candidate files are untracked. No shared runtime or database was changed.

| Local uncommitted file | SHA-256 |
| --- | --- |
| `restore-local-generation-fence-candidate.sql` | `4a222a8883ab6ca47a2333cc6b6811ebf358f9992ca2da6d816ec4aa37235a66` |
| `restore-local-generation-c2-extension-candidate.sql` | `333e000bb6b076157d91acebf99006ca950cc999b9cecd61c0213bd4fce1ff8f` |
| `restore-local-generation-delivery-extension-candidate.sql` | `35d8c665ee65cd4412a23ece88bd1e6ddf6a947b16747543c9ea09df0cba0843` |
| `restore-local-generation-fence-pg.spec.ts` | `623e5ef9844bfbe3bec451dd659cd2abc37005f090baa3d7eed8d8d720484010` |
| `restore-local-generation-c2-extension-pg.spec.ts` | `1c2ff4302def6b201246a47de0baa997ecb20a0a41b09c028002583d4969947e` |
| `restore-local-generation-delivery-extension-pg.spec.ts` | `0136ad151570152043988262668d6fd0d7edc05e844d7ef6206dab6fd6001647` |

This is a conservative role-policy hardening, not a claim that every
privileged role is exploitable or that role membership alone inherits these
attributes. It does not fence an old database copy or in-flight HTTP/source
operations, establish post-snapshot terminal/ACK completeness, qualify the
installer ACL, or authorize V2 restore. The new checkpoint run covers these
local SQL hashes, but must be retaken if its integrated dependencies change;
full typecheck, normal hook and representative restore also remain open. No
frontend action or connected acceptance follows.
