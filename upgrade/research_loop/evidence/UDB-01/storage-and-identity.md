# UDB-01 — storage, FK and identity manifest

Inventory2026-10-10 on preview:160 ordinary tables,312 FKs,77 crossing
public/research schema boundaries. Full catalog/constraint definitions and
hash-only custody are private in the phase change-window directory, not raw
users, sessions, cached payloads or source data in Git.

## Ownership decisions (inventory, NOT a UDB-02 move)

| Group | Existing relations / boundary | UDB decision |
|---|---|---|
| Core identity/security | `portal_users`,password/activation credentials,`auth_sessions`,external bindings,owner anchor,capability grants/events,owner step-up,account lifecycle | Remain one per environment. Preserve anchor by immutable user ID. Never duplicate into Execution domain DB. |
| Core workspace/control | workspaces,members,product/auth audit,outbox,`run_read_models` | Preserve membership and existing P22 graph/transaction semantics. No source provenance relabeling. |
| Governance | `governance_*` approvals,evidence,decisions,findings,R2/canary/sandbox/paper lineage/captures | Remain Core for this release; Research publication FKs and policy/quorum/self-approval are unchanged. |
| Research | all `research.*` source/attempt/job/producer/retention/seal/report/RC rows | Remain existing schema/DB with Core, no2PC or destructive migration. |
| Execution read/history candidates | profile/manager snapshots,alpha/portfolio/binding projections,timeseries and durable-mirror rows | Inventory UDB-02 candidates only; each has FK/cursor/profile/workspace/source authority review before moving. |
| Execution workflow/command/incident | activation/command plans,operation queue/workflow,incident facts/evidence/links,authoritative event ledger | Do not select by `execution_*` prefix. Dependencies and actual authority need per-table decision in UDB-02. |
| Recomputable cache | `execution_shared_read_cache`; admission/flights are separate lease tables | Only body cache UNLOGGED. Existing leader/follower lease semantics remain logged; lost body waits/refetches under same scope, no fake truth. |

Existing pool wiring has one10-connection Control API pool. Multiple domain
pool refactor belongs UDB-02, not a global DATABASE_URL substitution here.

## Authorization preserved, not redefined

Owner `portal_owner_anchor.user_id` → all10 finite Portal capabilities.
Non-owner ADMIN is not owner. Delegation `decide` implies that gate's `read`;
NULL workspace grants cover only already-member workspaces. Research
membership/create/export does not confer Governance decide. Actual Governance
evidence,revision,quorum/self-approval checks are separate from permissions.
Execution current readers also enforce the configured mirror workspace and
membership/profile gates; owner-vs-membership semantics are recorded, **not
silently replaced with an owner bypass**. Fine-grained Portfolio/Account grants
and TS endpoint mapping belong UDB-03 after the real published contract.

Expiry/revocation/session-version/credentials were not reset to test access.
Current preview has2 users,2 credentials,8 activation records,19,034 session
records,2 external bindings,1 owner anchor,4 grants/events and2 workspaces/
memberships. Before/after SHA-256 for all these tables match. The retained
session table is10,772,480B with0 currently usable sessions at the read-only
probe; expired records are not an account deny/reset or a cache purge target.
The preview's approved auto-login can create a normal new session on next use.

Research custody:112 runs/jobs/producers,37 source seals,4 RC packs and2
publications unchanged byte-hash. Historical QUEUED/PENDING with no worker
attempt remains untouched. No creation/cancellation/promotion/approval mutation.

## Runtime resource envelope

Shared preview only:PG1.5GiB,256MiB shared buffers,60connections,2MiB
work_mem/hash1,64MiB maintenance/32MiB ×2 autovacuum; temp file128MiB and
no parallel gather. P23 uses900,000,000B PG with128MiB shared buffers and
16MiB ×2 autovacuum; the unchanged8-service budgets total4.6GB. Kernel
cgroup cap rounds down to pages. Common dev/stable4GiB profile is versioned
for later approved deployment only; current default-config services unchanged.

PostgreSQL `max_wal_size` and temp file limits are not whole-volume quotas.
Cache live bytes/flight reservations, physical-pressure admission, absolute
TOAST vacuum, observed WAL/temp/pool/cgroup data and bounded retention work
together. Do not claim hard physical cap from a TTL or a no-live TRUNCATE.

Host root73% used (~169GiB free): C4 capacity observation attached, safe for
one cached Control API build plus bounded1.4GiB soak project. Unmanaged probe
and historical test PG containers are inventory-only follow-ups, not targets
deleted/stopped in this phase. No broad cleanup/no VACUUM FULL.
