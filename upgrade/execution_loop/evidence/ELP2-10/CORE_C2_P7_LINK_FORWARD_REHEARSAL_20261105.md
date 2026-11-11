# P7 intent-link forward-upgrade rehearsal — 2026-11-05

**CANDIDATE ONLY; not a numbered product migration or runtime install.**
Branch `docs/research-loop-plan`, committed base
`2faa8968fddbde59b2e59525e334ba3d83886144`; working files are uncommitted.

## Change

An additive, explicitly bounded SQL candidate upgrades the previous P7
preparation-record schema with the new nullable owner-intent and confirmation
link. It locks both affected tables, refuses mismatched/partially upgraded
schemas and missing/disabled named immutable triggers, and adds pair, unique,
and foreign-key constraints in one transaction. Old rows remain unlinked;
no historical approval or source authority is inferred. Trigger name, shape
and function identity checks do not prove function contents, writer ACL,
physical independence, or a trustworthy owner.

The candidate is not integrated into the numbered migration runner. Before
installation, compare the actual historical schema, ownership/ACL and trigger
definitions with the approved candidate, classify old records, review lock
and deployment windows, and rehearse using a representative backup. An
application rollback can retain the additive schema: the prior writer uses an
explicit old-column insert and its new fields remain NULL. This is not a
destructive database down-migration, permission to drop columns, or a claim
that old application authority is safe to activate.

## Evidence

`bash scripts/test-elp2-c2-p7-pg.sh record-link-upgrade` exited 0: **1/1
PostgreSQL test**, with multiple assertions on a disposable database:

- Reconstructed earlier installer schema and a synthetic historical record;
  preserved the old row, table owner, ACL and named immutable guards.
- Refused a disabled guard and a conflicting table lock; both errors rolled
  back without adding columns. Applied the candidate once and rejected a
  second application without data loss.
- Proved the old-column insert still works; checked new linked rows and
  rejected reused, missing and partial links; immutable row update is refused.
- Strict focused TypeScript for this test passed. The temporary containers and
  internal network were cleaned by the test script. No shared database,
  runtime, user/permission, frontend or remote Git state was changed.

This is a synthetic old schema and record, **not** a restored historical
backup, a complete migration/DR gate or a final candidate qualification.
The existing P7 owner-intent/acceptance tests also remain tied to their own
receipt pins; retake affected dependencies on the frozen candidate.

| Input | SHA-256 |
| --- | --- |
| `c2-p7-record-link-upgrade-candidate.sql` | `ee5ac146e7192df1dc2b93fa2e088c4a1460a499a096df4d37e5396b46b06e1c` |
| `c2-p7-record-link-upgrade-pg.spec.ts` | `f1affc6cbab377087c68ab8f700f6df3434ca90d264d15ffbb53d5a3b39b9f1d` |
| `test-elp2-c2-p7-pg.sh` | `fd46e6cfc77c1c202597cdcf2307585447399c757270142089e9968863257fa2` |

P7 acceptance/source authority, independent recovery/fencing, P8/A2 and the
combined candidate hook remain open. No new Claude/frontend consumer request.
