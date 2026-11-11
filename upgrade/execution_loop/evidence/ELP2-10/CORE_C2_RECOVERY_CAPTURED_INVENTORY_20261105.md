# Source-captured C2 inventory checkpoint — 2026-11-05

**SOURCE ONLY; NO RESTORE/CUTOVER PERMISSION.** This follows the local-drain
checkpoint and supersedes its source/test hashes. `captureAndAppendDrainedSource`
does not accept an inventory digest from its caller: it locks a fixed source
table profile, hashes bounded database rows and table security metadata, checks
the exact drained authority revision, and commits the drain-bound digest to
the independent checkpoint before releasing the source locks. It rejects
unexpected caller fields, missing/nonordinary tables, active row filtering,
unknown candidate relations, independent authority schemas on the source,
excess rows and the bounded capture deadline. Only the aggregate digest is
returned to the checkpoint writer; no source rows are published.

The profile covers the pre-C2 inventory plus owner step-up, the declared C2
P7, revision, fence, delivery, B2 and local-writer-fence tables. Security
metadata covers table ownership/ACL, columns, constraints, triggers and row
policies; this is not a complete inventory of database role memberships,
schema/function privileges, external key custody or other unlisted state.
The table locks block writes to that exact local set during capture; they do
not fence a separate DB copy, privileged administrators, source/Edge, HTTP or
all other Portal writes. A caller must retry an ambiguous operation with the
same ID; a changed snapshot becomes a conflict, not a new original.

## Checks

- Two disposable PostgreSQL clusters: **7/7 PASS**. Synthetic schema test
  verifies rejection of caller-provided digest and unknown relation, exact
  retry, changed rows/columns conflict, and row cap. Existing test also checks
  concurrent source-authority write is blocked during independent commit.
- Strict targeted TypeScript check of inventory/checkpoint modules: exit 0;
  `git diff --check`: exit 0 for tracked files. Normal hook and final candidate
  migration/restore have not run. The runner removed its test containers.
- Local uncommitted SHA256: inventory
  `0df0416fe528752d9ba0b4217d33592325b8be85930a470b62b1e60d90520650`,
  checkpoint `4b794927120a10bcd0d789f9f47b024c50d2eb8977139dd245f436d3fd363c5d`,
  PG test `523ba954115ab2510657928c9ee7cc8d65742eb9f754d3e6b6d64058b1d77ce1`.

Next: qualify the complete candidate profile and permissions on a representative
copy, independently fence old holders and in-flight writes, reconcile all
post-snapshot source terminals and ACKs, and rehearse restore/restart. The
pre-C2-only inventory still refuses C2 instead of silently omitting it. No
runtime, shared DB, real grant, frontend, remote ref or command/Live changed;
Claude has no new consumer field from this internal step.
