# Edge → Core/Bobby: exact Research reader DB-scope proposal

27October2026 (Asia/Saigon). **CATALOGUE_VERIFIED / PROPOSAL_READY /
SOURCE_IMPLEMENTATION_AND_PROTECTED_DB_CHANGE_NOT_APPROVED.**
Original EPG10-08/read09 and ELP2-10 remain OPEN. This is not an observation
of a Research membership, an installed reader, a grant or a connected PASS.

## 1. Request and source custody

Requested Core file, fully read over pinned SSH on SGP:
`/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/RESEARCH_READER_HK_FOLLOWTHROUGH_2026-10-27.md`.
SHA256 `c7c702edd9137e032ebcac6a1148bead342eb0ddde01ce04372a2a69e1eaa305`.
Its linked `RESEARCH_MEMBERSHIP_DISCOVERY_2026-10-27.md` records source-only
PM/Edge/Core discovery implementation and the exact outstanding DB boundary.

Actual observed sources (paths marked HK are not SGP checkout paths):

| Owner | Checkout/branch | Observed source |
| --- | --- | --- |
| Core/SGP | `/home/bobby/portal-research`, `docs/research-loop-plan` | `eabe5de32a64e9d802cddd5ffee4f2782219b112` |
| PM candidate/HK | `/home/bobby/.worktrees/pm-core-financial-assembly-20261024`, `feat/core-financial-assembly-20261024` | `0853ffe4157cdbcabff64e8e5a440967fe760f81`, clean |
| Edge candidate/HK | `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`, `feat/core-current-policy-wire-20261024` | `68344dad9042860f561c11873096314b9a9b2f73`, clean |
| Edge source-owner journal/HK | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, `feat/execution-edge-upgrade-v1_2` | `8727e5303b1815d54bc2bdcb927a55457ff4da5b`; peer WIP preserved |

HK main journal is
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`,
anchor `epg10-08-research-reader-db-scope-20261027`.
Core's governing plan remains its SGP `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`.

## 2. Actual catalogue findings, not inferred source data

Verified exact source:

- Container `08df6d6d79e3eef7a3981d57bb6e0979a36a42ff050d9883eda851dff1867feb`,
  name `live_data_executor`, image
  `sha256:6343bdc87ca132c6b53acb26113a6bad1821d188fa39975a745f32ddd9757634`.
- Database `live_data_executor`, OID `16384`, PostgreSQL system identifier
  `7674585245102796834`; not the active P184 test PostgreSQL or Edge projection DB.
- Canonical source fingerprint
  `5a67e653003f91ce95d364284cfc2ab6259dee322804f630caee0244f7ac79da`.
  Preimage, with the existing sorted compact UTF-8 canonicalization:
  `{"database_name":"live_data_executor","database_oid":"16384","system_identifier":"7674585245102796834"}`.

Only `pg_catalog`/privilege/system metadata were queried. Each SQL transaction
was READ ONLY with statement timeout2000ms, lock timeout250ms and ROLLBACK.
Local PostgreSQL peer authentication used configured administrator name bobby;
no database password/DSN or protected stable-source credential was accessed.
The preliminary default-postgres login failed (role absent); the configured
owner metadata probe then succeeded. It is not Research-reader acceptance.

| Relation | RLS/force-RLS | Current checked native-source SELECT |
| --- | --- | --- |
| `public.ts_users` | false/false | yes |
| `pm_membership.policy` | false/false | yes |
| `pm_membership.memberships` | false/false | no |
| `pm_membership.membership_revisions` | false/false | no |
| `pm_membership.receipts` | false/false | no |

All five have owner bobby/no row policies. Native maintenance has the same
five-relation SELECT disposition; no privilege was changed. Across all119
non-system roles, the only nonowner membership-table readers found are existing
services001/services002, both SUPERUSER/BYPASSRLS. They must not be reused.
`ts_portal_research_identity` is NOLOGIN/NOINHERIT, without role parents or
SELECT on these five relations; it is not an operational discovery credential.
Catalogue search found zero SECURITY DEFINER functions whose source directly
references the membership-head/receipt tables; this is a bounded inspection,
not a proof about every possible dynamic function/view or undisclosed secret.
No independently scoped approved Research reader was identified.

PUBLIC ACL metadata was also checked: the database grants PUBLIC CONNECT and
TEMPORARY; schema public grants only USAGE, pm_membership grants nothing, and
none of the five base tables grants PUBLIC privileges. The additive proposal
does not revoke shared PUBLIC rights. In particular, it does not promise that
the new login cannot create temporary objects; that existing capability is
not source-table access and must not be mistaken for a globally DDL-denied role.

**No membership/identity source rows were queried.** Their existence, absence,
current status, receipt and lineage remain UNKNOWN, not MISSING.

## 3. Why existing code/tests cannot simply be installed

At PM0853ffe4, `research_membership_discovery.py` checks nonsuperuser/NOBYPASSRLS
and pins its transaction/identity/fingerprint, but selects the base tables.
`scripts/research_membership_discovery_isolated_test.py` grants unrestricted
table SELECT in its TEST_ONLY DB. Its existing PASS proves behavior, not DB
row isolation. Copying those grants into the protected source would fail the
explicit follow-through requirement.

`identity_mapping_runtime.py` also shares a pool with the ordinary mapping
lookup/preflight, which directly queries `public.ts_users`. A new execute-only
role cannot be substituted into that pool without a matching source adapter.
Do not make startup pass by broadening the new role's table privileges.
The normal native-fence privilege verifier expects its separate SELECT profile;
it must not be weakened or relabelled as this proposed execute-only profile.

## 4. Smallest proposed additive delta — REQUIRES BOBBY APPROVAL

Target is only the verified database/system above. Proposed names were absent
in the read-only catalogue check; revalidate exact absence at installation.

| New object | Exact proposed privilege/purpose |
| --- | --- |
| `ts_portal_research_membership_owner` | NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE/NOCREATEDB/NOREPLICATION, no role parents; owns only the new accessor. Necessary read privileges on the five declared relations and fingerprint introspection; no DML or membership changes. Never grant this role to the login. |
| `ts_portal_research_membership_read` | Separate LOGIN/NOINHERIT, NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB/NOREPLICATION, no role parents, proposed connection limit2. New explicit grants are DB CONNECT, new-schema USAGE and one exact accessor EXECUTE; no direct source-table/column SELECT, DML, persistent schema CREATE, native-authority grant or delegation. Existing PUBLIC privileges remain and require effective-privilege preflight, not a false claim of only one callable function. Secret stays in a new owner-only private reference. |
| `elp210_research_discovery` | Private new schema; no PUBLIC privileges or login CREATE. No shared schema or table altered. |
| `elp210_research_discovery.observe()` | One no-selector SECURITY DEFINER accessor; fixed `search_path=pg_catalog`, fully qualified/static SQL, PUBLIC EXECUTE revoked, exact reviewed function owner/hash. Bound to the intended login and one installation-pinned Research identity/workspace/workload/literal Paper tuple. |

No RLS is enabled/changed on shared base tables. Existing roles, grants,
functions, native authority, provider28445 and membership data are untouched.

The accessor derives permitted rows itself, not from caller IDs/GUCs: exact
mapping, current policy, at most8 Paper heads, bounded same-scope parent closure,
legitimate protected-owner/ancestor user rows, the matching head receipts and
only original/predecessor/evaluated historical revisions required by that closure.
It must refuse foreign-mode/foreign-scope links, ambiguity, overflow and output
excess before returning bytes. Strip receipt reason/workload_actor; no secrets.
All relation/function references are explicitly qualified; neither a temporary
object nor caller-set search_path may substitute a source or validator. Effective
PUBLIC function privileges must also be audited for source/authority escalation;
an unsafe existing grant fails installation rather than expanding this proposal
into shared ACL changes.
Actual database/system fingerprint is returned from the verified source, never
accepted as a caller-provided label. Login needs no direct pg_control grant.

Core's last documented identity tuple is HISTORICAL, not a current entitlement:
issuer `portal-control-api.native-manager-read`, subject
`usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`, environment `paper`.
Core must confirm that target and the exact current workload/private manifest
before freeze; mapping/user/status/receipt must subsequently be observed, not
assumed from historical TS ID608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd.

Proposed observation bounds: pool/connection cap2, max inflight1, overall8s,
query2s/lock250ms, existing8-head/8-depth/72-current-closure and existing output
byte ceiling32768; at most80 distinct historical revisions (8heads ×
[original + predecessor + up to8 evaluated revisions], before deduplication).
The latter derives from existing NativeReference's maximum8 evaluated entries,
not a measured throughput allowance. No truncation into COMPLETE; exhaustion refuses.
These are approval proposals, not measured/approved production capacity.
Install-time finite validity must be checked by the accessor itself; PostgreSQL
password VALID UNTIL alone is not a runtime deadline. No expiring slot is
reserved while awaiting approval/source qualification.

## 5. Source implementation and isolated tests before real installation

After approval of this mechanism, Edge coordinates the PM-owned source patch
on the clean declared candidate with one writer per file. Add the accessor
installer/closed manifest/catalogue verifier and a bounded row-envelope source.
Preserve the existing `_leg`/digest/lineage validator: extract only its receipt
and historical-image retrieval behind a compatible trusted source port.
Do not implement a second business validator or turn a JSON envelope into a grant.

Mapping/discovery composition must use the explicit restricted source port and
its exact pool/role/preflight. Preserve the legacy native/mapping default and
roles; never silently fall back to them. Identity-only observation may reuse
the exact bounded selected mapping from this port, not a broad table grant.
Keep existing PM→Edge→Core wire/schema unchanged unless all owners accept a
necessary versioned delta.

Required actual disposable-PG/security tests before source installation:

- Direct source-table/column reads, source DML/persistent DDL, SET ROLE to
  owner, unrelated native-authority escalation and arbitrary caller-set
  GUC/selector escalation fail. Explicitly test PUBLIC privileges and temporary
  object substitution; do not report the existing TEMPORARY right as denied.
- Legitimate owner/ancestor/historical lineage remains available; wrong
  identity/workspace/workload/mode/scope and unrelated heads/receipts do not.
- Correct missing/revoked/ambiguous/tampered/predecessor/history behavior,
  depth/head/historical/output caps and source/ACL/owner/function drift.
- Unchanged native `_leg` parity, read-only repeatable-read consistency and
  rollback/timeout/cancellation/COMMIT-or-release failure with no disclosure.
- PM startup/mapping preflight works with restricted privileges; all legacy
  paths and Edge/Core response correlation remain compatible.

Existing component test counts are not rerun or advertised as these new cases.
No new source patch, product test, role, grant, function or install is claimed here.

## 6. Backup/audit, installation and exact rollback

Before an approved installation, capture a private bounded catalogue snapshot
of the five source relations' owners/ACL/RLS/definitions, relevant existing role
memberships/function ACLs, proposed-name absence and source fingerprint.
Record reviewed installer/config/SQL hashes and the exact approved target and
window. Only additive catalogue objects/privileges are proposed, not data writes;
do not take a large data dump or stop shared writers merely for this change.
Installer must refuse object/name/owner/ACL drift and roll back its transaction
on any mismatch. Verify the original catalogue baseline and new exact grants
afterwards; no membership/policy/user/receipt row or old grant is modified.

New credential material is created only after approval, owner-only outside Git,
not copied from stable and never printed. Temporary listener/trust and a real
observation require their separate matched composition/window after source
qualification. Retain resulting observation privately with hash/provenance;
not MAPPING_FOUND/grant by assumption, not ROOT/CURRENT/STREAM acceptance.

Rollback: stop only new Research admission; drain/recover owned original
obligations, then revoke exact new accessor EXECUTE and disable the new login.
Keep audit/custody. Remove only the exact new objects/roles after verifying
no active/unknown custody, sessions or external dependencies, under the approved
rollback. Never CAS an old native authority, kill shared sessions, drop source
data/schema, use DROP CASCADE or reset existing roles/permissions.

## 7. Owner/action and truthful exit

- **Bobby:** approve/change the exact new two-role/private-schema/accessor
  source-DB mechanism above on live_data_executor/system7674585245102796834.
  This is the required protected-DB delta decision, NOT another phase approval.
- **Core:** return the intended current Research tuple/workload/private-manifest
  reference; prepare current separate Research trust using the approved procedure
  once a viable source/window exists. Do not use expired23Oct certificates or
  stable/service-superuser credentials; do not create source entitlement rows.
- **Edge + PM source owner:** after the mechanism approval, implement/test the
  restricted source/installer, verify exact approved target and apply only the
  qualified additive delta. Then return one genuine bounded observation.
- **Core + Edge:** if a genuine original exists, qualify correspondence and
  ROOT/CURRENT independently, STREAM separately, then connected revoke/recovery.
  If absent/revoked, identify the official owning writer; never insert a fixture.

Diagnostic exit: exact target/catalogue gap and a safe proposed mechanism are
established. Reader/config/source implementation and connected acceptance are
NOT_READY; ELP2-10/08/read09 stay OPEN. No frontend change is requested.
No test resource, image, network, volume, credential or runtime was created;
cleanup is NO_ACTION_NEEDED for this metadata/documentation slice. Existing
source candidates, operational authority, rollback images and peer WIP remain.
