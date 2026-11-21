# Edge–TS–Core: official-database read and E2E execution packet

Date: 2026-11-11 UTC. Owner/coordinator: Execution Edge. This is the single
consolidated request for the existing EPG10-04/05/06/08-read/09-read work; it
does not create a new phase or replace the command-authority exchange.

**Current disposition: REQUESTED / NOT CONNECTED / NOT ACCEPTED.** Respond
incrementally: a missing item must not hold up independent inputs. No secret,
password, private key, bearer token or business-row dump in this packet,
mailbox, Git, or chat. Secret references belong in approved private storage.

## 1. Owner intent and existing observations

Bobby approved access to all current and future application tables for the
manager-read identity, and all Paper, Sandbox, Canary and Live read modes.
This is read authority, not permission to issue commands, bypass Portal RBAC,
provide arbitrary SQL, or place orders. The source of truth remains TS; Portal
does not receive direct TS DB credentials. TS -> Manager facade -> Source Proxy
-> Rust Edge -> SGP Portal Core -> authorized consuming service is the target.
Classify only what is proven per mode; never alias Canary to Live or claim a
mode is connected based on the presence of code or an unrelated environment.

The last Edge metadata observation on 11Nov was PostgreSQL system identifier
`7674585245102796834`, database `trading_system`, OID `74352923`. Existing
login `ts_portal_manager_read_facade` was a member of the group
`ts_portal_manager_read` but lacked DB CONNECT; the group had no table or
column SELECT on the 311 inventoried relations across 16 inspected schemas.
This is a timestamped observation, not an assertion about current ACLs. Counts
include partitions, not 311 distinct datasets. The old Manager catalogue is
only 96 relations; grants alone cannot make every dataset an API.

## 2. TS return to Edge: independent read inputs

Please publish each item READY with evidence or NOT_READY with owner, concrete
action and estimated UTC; link your return from `ts-to-portal/TS-ANSWERS.md`
or reply in that mailbox. Avoid requiring Core/A2/B2 to finish for DB read.

1. **Target and grants.** Reconfirm the actual primary/DB identifier, endpoint
   and TLS/credential *references*, installed revisions and current roles.
   For the existing facade login and effective `SET LOCAL ROLE` group, provide
   reviewed `CONNECT`, schema `USAGE`, and `SELECT` for all owner-approved
   current application tables/views/partitions, including PM schemas. Account
   for view dependencies/RLS and default privileges for every relevant object
   creator so future application objects are covered. Identify exceptions with
   reasons instead of silently excluding a schema. Prove real-role read-only
   and failed write/DDL; give a revocation/rollback recipe and owner. Do not
   provide superuser, broad write, secret values, or credentials to Portal.
2. **Source/semantic contract.** Return dataset owners, keys, relevant source
   revision, profile/venue/tenant predicates, shared vs mode-specific semantics,
   and real Canary identity. Classify the 41 old fixed-context relations
   before placing that facade against a shared database; a missing predicate
   is not proof that data is global. Include financial semantics for positions,
   equity/NAV, PnL, fees, funding, transfers and corrections; do not double count
   portfolios/accounts or treat transfers as profit. Return bounded keyset
   indexes/query-plan evidence for qualified feeds and known-null cases.
3. **Absence/deletion authority.** Specify a bounded source-consistent scan or
   authoritative point-absence lookup with scope, key, source generation,
   transaction/snapshot and error semantics; explain concurrent changes and
   scope-revocation behavior. Each page in an independent transaction is not a
   coherent full snapshot. Until proof is bound, Edge must not infer a deletion
   from a missing row and must report stale/partial/unavailable honestly.
4. **Controlled validation.** Identify real populated, permitted profiles and
   safe correlation references / bounded aggregate or pre-authorized test
   namespace, plus workload caps, owner and exact runtime/rollback target.
   No uncontrolled production writes are requested. Return hashes/revisions,
   actual-role grants and test receipts rather than rows or sensitive payloads.
5. **Independent event/history lane.** Separately return currently installed
   publication mechanism, source/role and writer coverage, commit ordering,
   publisher fence, correction semantics, retention/resume and evidence. Table
   names or replication-slot counts are not proof. This item does not block
   independently correct snapshot reads; it does block claims of full replay.

## 3. Edge-owned implementation and preparation

- Recheck source and release pins and actual role on receipt, preserving other
  agents' WIP; align catalogue/typed mappings with verified TS schema and all
  requested profiles. Expose only verified semantics via bounded existing
  contracts; no generic DB proxy or arbitrary SQL. Preserve V1 compatibility.
- Finish verified scope/absence-based reconciliation and atomic checkpoint;
  exercise multi-page concurrent change, partial page, retry, correction,
  duplicate, scope change and crash boundaries. The local fail-closed guard is
  not authoritative deletion. Never mark unseen data deleted by inference.
- Complete worker OOM/429/backoff/restart work with bounded memory, page and
  concurrency and actual workload evidence; distinguish the previously tested
  candidate from the currently installed image. No unapproved runtime change.
- Prepare one precise rollout/rollback manifest: exact service(s), source and
  immutable image/config/secret references, target identity per profile,
  bounded budget, observability, retained previous deployment, stop conditions
  and owner. Do not change unrelated services, DB data, ACLs or release state.
- Provide Core with the verified service endpoint/transport and source-set
  contract and request its installed current-policy/session/profile mapping.
  Record each consumer's readiness separately; Core must not receive DB login.

## 4. Connected E2E acceptance, run when each input is available

For each genuinely provisioned mode, pin database, facade/Source Proxy, Edge
and SGP Core image/config/source revisions, identities and correlation receipt.
Record unavailable modes separately; do not substitute synthetic tests.

1. Connect with the actual least-privilege identity; verify `current_database`,
   effective role/transaction read-only, TLS, permitted reads and denied writes.
2. Trace real permitted source records through facade, proxy, Edge and SGP Core
   to the authorized API; compare keys, scope, decimal/timestamp/financial
   semantics, freshness and data lineage without exporting private payloads.
3. Test cursor and continuation across page boundaries (existing compatibility
   route limit 200 rows / 1 MiB), concurrent changes, current-policy denial,
   unauthorized scope, revoke/cache/cursor and stream where independently
   provisioned. `STALE`/`PARTIAL` must not become `FRESH`/complete.
4. Exercise scoped transient upstream loss, 429/backpressure, Edge restart,
   checkpoint recovery, absence proof and safe rollback on actual target, with
   bounded workload and TS/DL coexistence measurements. Avoid destructive
   fault injection into shared production services; use a properly scoped
   target or owned isolated test where the real failure cannot safely run.
5. Publish per-mode/dataset pass/fail/not-run, exact case counts, source pins,
   latency/resource measurements, rollback result and cleanup. Isolated tests
   remain isolated evidence; success for one mode is not all-mode acceptance.

## 5. Boundaries, closeout, and references

Edge coordinates TS and Core and updates the main Edge Unified plan and this
mailbox. No read acceptance until the actual path and recovery pass; no full
EPG10-08/09, command, history/replay, or production-capacity PASS by inference.
A2/B2 command authority and the EPG10-03 journal/fence are independent tracks;
keep their custody and original exchange rules unchanged. No command/live
mutation is enabled by this read packet. Genuine external prerequisites must
name owner/action; incomplete Edge implementation is not relabeled debt.

Evidence in Edge checkout `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`:

- `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` (main journal).
- `upgrade/upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` §§03–06, 08–09.
- `upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_TS_DATABASE_CENSUS_20261111.md`.
- `upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_TS_V206_FIXED_CONTEXT_SCOPE_INVENTORY_20261108.md`.
- `upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_MANAGER_PAGINATION_CONSISTENCY_20261108.md`.
- `upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_TS_C2_PAPER_FACADE_REPOINT_PROPOSAL_20261104.md` is historical Paper-only preparation, **not** an all-mode authorization or deployment receipt.
