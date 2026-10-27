# Research membership reader — HK follow-through, 27 October 2026

**Status: source reader and connected acceptance NOT_READY; ELP2-10 OPEN.**
This is a read-only follow-through, not an assertion that the source contains
no Research identity, membership, receipt, or privilege. Scope is the already
approved Research/Paper lane; stable and production authority are not reused.

## Actual checks

- Core `docs/research-loop-plan` contains source `0f5fe5f56` and receipt
  `4bc06bfba`; implementation, pins, tests and cleanup are detailed in
  [bounded membership discovery](RESEARCH_MEMBERSHIP_DISCOVERY_2026-10-27.md).
- SSH to HK confirmed PM candidate `0853ffe4157cdbcabff64e8e5a440967fe760f81`
  and Edge candidate `68344dad9042860f561c11873096314b9a9b2f73`. Their source
  paths agree on the explicit private membership-discovery route, binding,
  schema and correlated response. This is source inspection, not an integrated
  TLS/DB run or a deployed-provider assertion.
- The primary Edge worktree has pre-existing unrelated tracked and untracked
  work; it was not modified. The latest matching source-owner return remains
  `EDGE_RESEARCH_READER_OWNER_RETURN_2026-10-27.md`, which says NOT_READY and
  identifies the prior Research certificates as expired. Metadata-only
  container and filename inspection did not establish a new authorized
  Research membership reader. Container names are not evidence of grants.
- No credential contents, source membership rows, existing role privileges or
  protected runtime configuration were read. No listener, database query,
  role, grant, certificate, container or source registration was created.

## Exact next owner action and access boundary

Edge/source ownership must identify an already provisioned, independently
scoped Research/Paper reader and its private references, database/system
fingerprint and binding, or propose its creation with the exact target and
grant mechanism. Core's bounded source reads `public.ts_users`,
`pm_membership.policy`, `memberships`, `membership_revisions` and `receipts`,
including legitimate owner/ancestor rows required to verify the selected
Research identity's lineage. It also checks the source-system fingerprint.

**A new PostgreSQL role with unrestricted table SELECT is not automatically a
Research-scoped reader.** Before applying any role/grant on a real database,
the source owner must verify how database-level row isolation, approved
lineage access and the fingerprint check are enforced; a filter in the
application alone does not reduce the role's database privileges. If creation
or privilege changes are required on the protected source, describe the exact
database, role, objects, scope, backup/audit and rollback for Bobby's separate
approval. Do not widen the old stable role or bypass its protected credential.

When a legitimate reader and a viable finite window exist, Core/Edge can use
the already approved separate Research trust procedure, verify its CA, peer,
expiry and pins, and run one bounded observation. That observation is not a
grant: independently qualify the original/correspondence and each of
ROOT/CURRENT and STREAM before connected READ/STREAM, revoke and recovery.
No observation or connected PASS is claimed by this receipt.

**Rollback:** no runtime or source mutation occurred in this follow-through;
retain existing candidate commits and all source data, permissions and audit.
Claude: no new frontend contract or consumer work is requested here.
