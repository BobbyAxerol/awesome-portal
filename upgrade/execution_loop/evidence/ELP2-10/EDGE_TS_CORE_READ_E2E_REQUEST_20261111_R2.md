# Edge–TS–Core: official-database read and E2E execution packet

Date: 2026-11-11 UTC. Owner/coordinator: Execution Edge. This is the single
consolidated request for the existing EPG10-04/05/06/08-read/09-read work; it
does not create a new phase or replace the command-authority exchange.

**R2 is the operative complete packet:** includes every R1 section below plus
the concrete runner return and matrix in §§6–9. It supersedes, without
overwriting, R1 SHA256
`9404a094e58ee3bf29c1af050ed2f3c09f3e7fa61e2a0143a10083faefe9666f`.
Do not wait for every row: deliver each scope and run the cases it enables.

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

## 6. Core → Edge exact existing runner input, one set per actual scope

Core owns installed Portal runtime, policy/grant and genuine session; Edge
coordinates and consumes them. The following matches
`scripts/epg10-08/connected_read.py` as inspected on 11Nov, not an invented
public API. Return a **private reference `{path, sha256}` for each document**;
keep the actual session/token/private receipts out of this mailbox, Git and
chat. SHA256 values below are lowercase 64 hexadecimal unless indicated.
Use one new current selection and matching time window; never reuse retired
source/identity/session or an expired operational window.

### 6.1 Core installed-ready document: baseline read

Provide private `portal.execution.connected-read-ready.v1` with:

- `status=INSTALLED`, `native_selection_verified=true`; exact `origin`,
  `environment`, `workspace_id`, `profile_id`, `projection_epoch` and
  `acceptance_id`. Existing runner origin is fixed to
  `https://research-portal.primusspark.com`; `api_ip` must be the actually
  commissioned global IP. Confirm API routing/TLS and current service owners.
- `core_commit` (40 lowercase hex), `core_image` (`sha256:` + 64 hex),
  `core_config_sha256`, `field_policy_sha256`, `catalogue_sha256` and
  optional `api_leaf_sha256`; publish the current immutable image/config
  references and the TS→proxy→Edge source-set linkage separately. If selected
  relation is available, give `relation_catalogue_sha256`; otherwise this
  runner correctly skips the relation specimen, and that case is NOT_RUN.
- `subject` (actual `usr_…`), `native_revision` (positive integer),
  `policy_revision`, `manager_grant_id`, `manager_grant_revision`,
  `read_authorized=true`, `native_revoked=false`, and explicit
  `stream_authorized` boolean. Include `session_sha256` of the private session
  reference. If STREAM is selected, provide its **distinct** `stream_grant_id`
  and `stream_grant_revision`, plus `source_set_ref`, installed stream path,
  and a real bounded way to observe an applicable notice. READ does not grant
  STREAM. An empty/quiet stream remains NOT_RUN for the notice case.
- UTC `expires_at`, `trust_expires_at`, `native_expires_at`; each must outlive
  the agreed request deadline. For the current runner, `environment` must be
  `paper`, `sandbox`, or `live`, workspace match `ws_[A-Za-z0-9]{8,96}` and
  profile match `[A-Z][A-Z0-9_]{2,95}`. This is a runner limitation, not an
  owner change to exclude Canary: TS/Core return actual Canary identity and
  Edge changes/tests the binding before presenting any Canary PASS.

### 6.2 Private session and Edge config

Give either the existing owner-approved private browser-session document or the
official `portal.research-acceptance-session-token.v1` with exactly
`schema_version, session_id, user_id, cookie_name, token, absolute_expires_at`;
the latter uses `cookie_name=__Host-portal_session`, matching `session_id` in
the ready document and matching its `subject`. The session must outlive the
entire test deadline. These credentials stay in owner-private files; Core
returns **only their reference and hash**, not the values. An application
session is not proof of Cloudflare, password or human-presence authentication;
Core separately supplies those references/receipts when the route requires
them. Do not fabricate a human session or change a production user's password.

Edge assembles private `portal.execution.connected-read-config.v1` referencing
the ready and session documents by `{path,sha256}`. Required fields: `origin`,
`stage` (`baseline` or `post_revoke`), `environment`, `workspace_id`,
`profile_id`, integer `limit` 1..200, `max_bytes` 1..1048576,
`deadline_seconds` 1..60, boolean `probe_stream`, plus optional boolean
`observe_active_stream` for a baseline stream. Exact values are bounded for
the specimen and are not the overall system capacity budget. If Core has an
existing compatible owner configuration, return its private reference; Edge
must verify pins and deadlines before use.

### 6.3 Revocation/cache/stream inputs and ownership

For a new revoke specimen, Edge first collects the **actual** baseline and
private cursor checkpoint. Core executes its authorized current-policy revoke
and returns a fresh ready document and private
`portal.execution.connected-read-revoke.v1` referencing baseline, before/after
producer hashes, scope digest, policy/grant/native revisions, UTC commit time
and official receipt hash/ref. CORE_MANAGER_DOMAIN and PM_NATIVE_READ have
different semantics; PM-native denial requires a separate correlated owner
receipt and is not made PASS by an EOF. For STREAM-only revoke include actual
action, distinct stream grant IDs/revisions and an official
`portal.native-research-manager-revoke.v1` / nested
`portal.manager-domain-revoke-receipt.v1` matching that grant and pre-expiry
timing. If cache/P22 is in scope, Core returns private pinned prime/HIT and
custody/ACK references matching the same baseline and scoped revoke; the
runner does not independently authenticate P22 MACs. Return `NOT_READY` with
owner/time for each missing item; do not duplicate the already-accepted
23Oct active-revoke specimen or claim this single runner proves all 08/09.

## 7. TS return envelope and runnable-first criteria

Use the existing `ts-to-portal` mailbox and return one versioned Markdown/JSON
record (no secret values), with for **each dataset/profile**:

1. DB system identifier and database OID, installed source revision/image,
   actual role/group and private endpoint/TLS/login *references*; grant SQL or
   equivalent receipt, schema/object/owner scope and future-default privileges,
   RLS/view/partition checks, read-only positive and failed-write results.
2. Dataset ID, source relation/view, keys and stable sort/continuation, source
   revision/epoch, mode/venue/portfolio/account/shared scope, units/precision,
   join/cardinality, correction/deletion/retention/freshness rules, real
   Canary identity, and query-plan evidence. Return exactly what exists;
   explicitly label any unavailable/non-authoritative property.
3. A usable source-consistent scan/barrier or point-absence contract and proof:
   endpoint/schema/version, exact identity and scoped key, meaning of present,
   confirmed absent, unauthorized, stale, timeout and error, source generation
   and consistency rules. Explicitly indicate if source-side work remains.
   If unavailable, Edge can do bounded read-only observations for otherwise
   qualified datasets, but cannot call unproved tombstone handling complete.
4. Safe bounded real record correlation references (private if sensitive),
   limits, intended test target, data producer/test owner, and expected
   comparison/oracle without putting record values into the shared packet.
   Do not alter live business facts just for tests. Return readable source
   revisions, per-item READY/NOT_READY, owner, action and UTC target.

The first proven scope enables actual-role direct/Facade/Edge bounded-read
tests immediately, subject to correct deployed target; Core participation
enables full path to SGP. Remaining scopes continue independently. All 41
legacy fixed-context relation classifications are required before claiming
the whole affected catalogue against the shared DB, not before testing one
unaffected, demonstrably scoped dataset. Wide ACL does not imply all 311
objects are already served. Event/history evidence and A2/B2 command work are
separate and cannot be silently upgraded by this read test.

## 8. E2E case matrix: accountable owner and required evidence

All cases start NOT_RUN. Each PASS is limited to the named dataset, scope,
mode, version and target, with actual source/identity and a bounded receipt.
Edge owns orchestration, comparison and publication; TS/Core supply only their
own authorities and evidence. A fixture result is never a real-path PASS.

| ID | Scenario / expected result | Executor and dependencies |
| --- | --- | --- |
| R01 | DB ID, TLS, `CONNECT`/effective role, SELECT/views/RLS/defaults; write/DDL denied | TS provisions; Edge verifies actual facade identity; owner-safe negative |
| R02 | Source record → facade → proxy → Edge → SGP Core API, same selected scope/units/lineage and nonempty or honestly empty result | Edge coordinates; TS safe oracle; Core installed READY/session |
| R03 | keyset >1 page, cursor bounds, no duplicated/omitted scoped record and correct PARTIAL/continuation | Edge; TS exact scope/key and controlled case |
| R04 | known scoped correction/delete applied exactly once; per-page concurrent move cannot fabricate delete | Edge + TS authoritative absence/barrier and safe test namespace |
| R05 | permitted read, wrong identity/profile denied; current policy and invalid/expired credentials fail closed | Core supplies real policy/grants; Edge runs and correlates |
| R06 | cache HIT before genuine revoke, then no stale authorized response/cursor; other scopes unaffected | Core supplies P22/custody, authority/revoke receipts; Edge verifies |
| R07 | independent STREAM notice/resume and active revoke; READ remains valid if only STREAM revoked | Core real distinct stream grant/receipt; Edge runs applicable case |
| R08 | 429/backpressure, bounded queues/memory and no loss; real configured limits and resume | Edge runs isolated then scoped connected; target owner caps/measure window |
| R09 | source outage/Edge restart at checkpoint and recovery; no incorrect tombstone or duplicate; immutable target pins | Edge runs scoped target; TS confirms source; avoid shared-service fault |
| R10 | exact re-point/rollback: prior image/config/data generation retained, restored and read path verified | Edge runs declared service-specific drill; Core/TS attest affected target |
| R11 | all approved modes Paper/Sandbox/Canary/Live individually; no cross-mode identity or aggregation leak | TS/Core return each binding, Edge implements/qualifies each independently |
| R12 | CPU/RSS/DB load/latency/lag/queue and TS/DL coexistence against approved numeric envelope | Edge + target owners; measurement lock, not fixture/load guess |
| R13 | manager catalogue/data surface, financial fields and correction semantics; list unavailable vs deployed | TS schema/source authority; Edge source/catalogue/route implementation |

For each R01–R13 record `PASS/FAIL/NOT_RUN`, mode/dataset, timestamp, image,
config and source pins, actual executor, expected/observed bounded digest or
reason, limits, source/Portal acknowledgments and cleanup. Capture negatives,
abort and precise rollback as well as success; keep evidence bounded. R04/R09
may require a specifically controlled target, not unsafe production mutation.
Tests are grouped to avoid replaying already-accepted exact specimens. No
phase is declared complete solely because the runner returns scoped HTTP200.

## 9. Release and single follow-through

- Edge keeps one owner/action matrix and receives TS and Core returns; users do
  not have to relay individual questions. Immediately preflight each return
  for correct target, hashes, missing fields, expiry and source consistency;
  request only genuinely missing items in one consolidated response.
- Edge implements/tests its remaining catalogue, projection, source-absence,
  worker/backpressure, Canary and actual Core binding; build and release only
  exact service/target with identified previous image/config, private refs,
  resource budget and safe rollback. No user/UI work or trading command.
- After R01–R13 pass as applicable, publish a **per-mode, per-dataset**
  sanitized Core handoff including endpoint/DTO catalogue and versions,
  permissions, pagination, freshness, recovery/rollback, exact receipts,
  support/unavailable matrix and consumer owner. Register external gaps under
  their actual owner; never call unfinished Edge code/failed tests debt.
- Full read is complete only for qualified scopes, not automatically all
  modes or all tables. Full master request additionally needs independent
  command and event/history acceptance. A2/B2 and journal do not block a
  valid first scoped read; do not assert their completeness.
