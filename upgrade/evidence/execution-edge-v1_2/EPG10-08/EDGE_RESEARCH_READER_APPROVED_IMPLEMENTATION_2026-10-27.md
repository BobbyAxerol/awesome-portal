# Edge Research reader — approved implementation / current binding intake

27Oct2026. Bobby approved the exact two-role/private-schema/execute-only
observe() delta in EDGE_RESEARCH_READER_DB_SCOPE_PROPOSAL_2026-10-27.md.
This is not another approval request for that delta. **SOURCE_IMPLEMENTED /
ISOLATED_QUALIFIED / REAL_INSTALL_NOT_READY.** PM sourcec2668cfa is committed
and clean; no source DB mutation or membership observation has occurred.

**Latest continuation supersedes the earlier pending metadata decision below:**
the exact existing Timescale metadata exception is implemented and its actual
source admission guard PASS. No shared ACL was changed. See
[current continuation result](#continuation-result--exact-metadata-gap-closed).
Only Core's current/explicit NEW_SELECTED tuple/workload/deadline remains external
before real installation; historical tuples are not installation authority.

## Core input needed for the real fixed binding

Core's requested follow-through requires a fixed current Research/Paper tuple.
The public packets contain only the HISTORICAL target below, not a currently
confirmed workload/private discovery manifest. Source implementation/testing
continues independently; do not fabricate the missing workload or an entitlement.

- human issuer: portal-control-api.native-manager-read
- subject: usr_5a38d5dfb08b44748f5776fbe04a1434
- workspace: ws_06G19F61YB8CFR7TEWMS7HQ660
- environment: paper
- intended workload ID: CORE_TO_CONFIRM
- current private manifest/config reference and hash: CORE_TO_RETURN
- viable finite binding validity: CORE_TO_RETURN (not a reused expired slot)

**Core action:** confirm/change the intended target above and return the exact
workload and current private manifest locator/hash (not secrets). These pin a
new observation reader, not READ/STREAM or an accepted original. If no discovery
manifest exists yet, Core may explicitly select the new stable workload ID and
target for this commissioning operation; label it NEW_SELECTED, not observed
runtime authority. Fresh separate Research trust follows the existing approved
procedure; no old/stable private credential or expired certificate is reused.

## Qualified source implementation

The login receives no source-table SELECT; the no-selector function selects
only the pinned Research identity's Paper heads and legitimate ancestor/history
rows. The legacy native _leg business validator is reused through row retrieval
ports. Restricted mapping/runtime is explicit and default-off, no raw-table
fallback. Effective PUBLIC/schema reachability is checked: inaccessible old
SECURITY DEFINER functions are not falsely called usable, but a newly callable
one fails closed without changing shared ACLs.

Source DB remains live_data_executor/system7674585245102796834; source data,
old roles, stable/dev/provider28445 and command/Live are untouched. Full
08/read09/ELP2-10 remain OPEN. Actual tests/source pins/install/cleanup are
recorded below; this return does not claim installed or connected PASS.

## Final source pin and owning boundaries

- Source checkout: HK `/home/bobby/.worktrees/pm-core-financial-assembly-20261024`.
- Branch: `feat/core-financial-assembly-20261024`.
- Commit: `c2668cfa8d7435889cac0adf5575b0c985acb1ab`, normal local commit as
  BobbyAxerol,10files/+2043/-49 including the source main-plan journal. Clean.
- No push/merge, remote CI or image build. Core can inspect this exact HK
  source pin; delivery of this Markdown does not deploy/copy these source files.
- SQL/installer and test delegates had disjoint files; primary integrated,
  reviewed and ran tests. Core/PM/TS peer changes and active candidates preserved.

The only default-compatible native change extracts receipt retrieval from `_leg`;
`EnvelopeNativeReader` inherits its actual receipt/digest/current-lineage business
validator. Legacy direct-source path/wire stays unchanged. Restricted mode is
explicit via `source.accessor_function_sha256` and exact new role, one binding,
pool<=2/inflight1 and existing finite timeout bounds. No source-schema USAGE or
base-table/column SELECT is granted to the login to make preflight pass.
The adapter introspects protected relation privileges through catalogue OIDs,
not a text-to-regclass lookup that itself requires source-schema USAGE.

`research_reader_install` is an inert explicit installer, not an automatic import
migration. `render_install()` requires the reviewed catalogue pin, fixed tuple,
source fingerprint and finite validity. SQL is password-free, transactionally
refuses drift/name reuse/unsafe PUBLIC surfaces, creates only approved objects,
then verifies the old baseline and new exact grants. `function_pins()` reports
the actual PostgreSQL definition/body hashes after a real install; those live
pins are **NOT_AVAILABLE** now, never replaced with fixture hashes. Existing
PUBLIC TEMPORARY and safe fingerprint introspection stay as observed, not falsely
reported denied. No explicit fingerprint-function grant is added to the login.

Full SHA256 pins at the committed source:

| Source path relative to PM checkout | SHA256 |
| --- | --- |
| services/portfolio_management/research_reader_install.py | 2d9d26b21d93a8e8d2b775d039e144792153230661740e4507d1288482d83010 |
| services/portfolio_management/research_reader_source.py | 769dea8b321ba935deea0c7a1d0a393b2040fe4652e4b7164be85cc8209bd05a |
| services/portfolio_management/research_membership_discovery.py | 3b752e8aecc55bc6f1fc64f264bddeabf9bd65c5882d642804cfc8266dd5fa56 |
| services/portfolio_management/native_relations.py | 93717765bc7a9bc7228f285e86b6bae9f88c8b1d7efb37935663df2f7a1e6584 |
| services/portfolio_management/identity_mapping_runtime.py | 59cecccd198f21d8a2c6360c751be7f6dbb7f62e9dbee2ed1300959123d8bbc2 |
| contracts/baseline/portfolio-account-v1_1/research-reader-observe.sql | 4fd2cc07cc013de473420424c2be4790463173a45ea0199fee4420c52eceaca8 |
| tests/unit/test_research_reader_source.py | 5c238dca9eedf7910fe7aee07d9e5131aef617a696fee20d74c0cb6882b6ba4f |
| tests/unit/test_research_reader_install.py | 024c8509f28b39d43f94537cd90689af12a437e3f494d830b18f34719088980a |
| scripts/research_reader_isolated_test.py | fd6a59e8e9f2f4014a8f657eb2e18f3c52a44b4ce335beba3fd6b3792bcc7263 |

## Actual qualification and known failed attempts

Final focused regression: **130PASS/0FAIL/0SKIP,4.76s**, existing image
`sha256:089658c89d560197778b8ba7dde8f9ac6539950251605e0438396e11b02ede65`.
Command inside read-only source mount, no network,1CPU/700MiB, temporary64MiB:

```sh
python -m pytest -o addopts='' -p no:cacheprovider -q \
  tests/unit/test_research_membership_discovery_route.py \
  tests/unit/test_pma11_identity_mapping_runtime.py \
  tests/unit/test_pma11_native_relations.py \
  tests/unit/test_elp210_existing_identity_mapping.py \
  tests/unit/test_research_reader_source.py \
  tests/unit/test_research_reader_install.py
```

Actual disposable PostgreSQL: **61PASS/0FAIL**, script above with mandatory
`RESEARCH_READER_TEST_ONLY=YES_ISOLATED_DISPOSABLE`, fixed test host/database,
existing exact source-image binary6343bdc8/PostgreSQL15. Fixture database is
`TEMPLATE template0` with no Timescale extension, synthetic TEST_ONLY rows.
This is actual SQL/privilege/recovery correctness, **not actual Timescale target,
source entitlement, performance/capacity or connected acceptance**.

Cases cover guarded atomic install and stale SQL/catalogue/source/name refusal;
unreachable versus newly reachable PUBLIC definer; genuine native ancestor,
predecessor and evaluated-history parity; execute-only mapping; exact tuple,
source/owner/hash/ACL drift; absent/revoked/ambiguous/tampered lineage; head/depth/
history/byte caps; direct table/column/DML/persistent-DDL/SET ROLE denial;
temporary-object/GUC/search-path substitution; actual held source-table lock
timeout/caller cancellation; failure after actual COMMIT or actual pool release
with no result disclosure; server-side deadline; `disable_reader()` denying
old-session accessor and new authentication without killing sessions or dropping
objects, while the old source catalogue digest stays unchanged.

Failed attempts remain visible: initial wrong filename ran no tests; old28ea
image lacked the pre-existing required qdl_sdk.execution_quality, collection
failed; one SQL-format-only new test assertion was corrected. Actual PG caught
installer variable/alias and CASE parser defects, an invalid assumption that
PUBLIC fingerprint introspection is denied, and text-name privilege introspection
requiring intentionally absent schema USAGE. All were corrected before the
final passes; no production source install was attempted. PG15 TCP readiness
was corrected to avoid its temporary init Unix socket. Default Timescale fixture
still correctly refuses its existing PUBLIC metadata, separately from all PASS
counts. Failure paths/cells were not silently counted as qualification.

## Real source preflight: exact remaining scope issue

Verified same database/system, only bounded catalogue/ACL reads in READ ONLY
transactions; **no membership/identity/policy/receipt rows read**. Five-relation
catalogue27924bytes, SHA256
`fd4a84a99e8e04e9ef18afb2d708e75dfaf65a83ea8306cf921965527f3b1266`.
This is a metadata observation hash, **not an installation backup**. Take a fresh
private bounded backup immediately before any later qualified installation.

Actual metadata-only installer guard returns
`42501 RESEARCH_INSTALL_PUBLIC_DATA_UNSAFE`. There are **52 existing PUBLIC
SELECT ACL entries on reachable Timescale metadata relations/sequences/views**,
including `_timescaledb_catalog.bgw_job`, `_timescaledb_config.bgw_job` and
`timescaledb_information.jobs`/job histories. Their configuration/history must
not automatically be called harmless or declared part of the fixed Research
row envelope. None of the five application tables has a PUBLIC grant.
Existing PUBLIC `pg_control_system()` EXECUTE also exists; that safe system
introspection is preserved without adding an explicit new-login grant.

A PostgreSQL role cannot DENY a privilege inherited from PUBLIC. Installing a
login and claiming it can select nothing outside observe() would therefore be
false. The exact approval forbids old ACL changes; it did not explicitly approve
these extension-metadata SELECT rights as an exception. Installer stays closed:
no silent `_timescaledb_*` prefix exemption, no broad table grant, RLS change or
shared PUBLIC revoke. Source rows remain UNKNOWN, not MISSING or authorized.

## READY matrix and exact next actions

| Item | Actual status | Owner/action |
| --- | --- | --- |
| Additive installer/accessor/adapter | SOURCE_IMPLEMENTED, ISOLATED_QUALIFIED | Edge sourcec2668cfa, no independent code/test work remains in this slice |
| Real DB PUBLIC scope | NOT_READY | Bobby/source owner must explicitly decide existing Timescale metadata exception versus separately scoped shared-ACL hardening; do not assume either approved |
| Current Research identity/workload | NOT_READY | Core return/confirm the intake tuple/workload/current manifest and finite validity above, not a historical TS ID or an invented grant |
| New roles/schema/function/credential | NOT_INSTALLED / NOT_CREATED | After both inputs: fresh private catalogue backup/revalidation, reviewed exact SQL hash, apply only approved delta, verify baseline/function pins |
| Real private listener/trust/observation | NOT_READY | Existing matched composition/window procedure after qualified install; new separate Research trust, never old/stable secret |
| ROOT/CURRENT/READ/STREAM/08/read09 | OPEN / NOT_MET | Observe actual original and then separately qualify authority/revoke/recovery; discovery is not a grant |

The approved two-role mechanism itself needs no repeated approval. Only the
newly observed inherited surface requires a scope decision. Choosing an exception
must pin exact extension objects/definitions/ACLs and retain denial on application
data/native authority; it is not implemented without that decision. Shared-ACL
hardening would have a different blast radius and requires its own review.
Research/Paper here is this approved helper's boundary, **not a reduction of
existing Manager Paper/Sandbox/Canary/Live contracts** or an activation of trading.

## Cleanup, runtime and source/release reconciliation

- Every owned PG/Python cell `--rm`, PG1CPU/512MiB, Python1CPU/700MiB,
  PG256MiB tmpfs, internal labelled network, no host port/persistent volume.
  Exact names epg10-research-reader-{db,pg-spec,pg}-20261027 removed/absent;
  no other agent's resource/lock/container/cache touched. No SGP test cell.
- No image build/pull or BuildKit writes. Pre-existing224images/shared cache
  inventory inspected, not globally pruned or attributed to this task. Active
  and explicitly retained rollback images kept; none was created by this slice.
- Available root disk entry59106344960B→posttest59448823808B under shared
  activity, not a reclaimed-space claim. Only own34929-byte Python installer
  cache removed; immediate free59828736000→59828772864B. No source/data deletion.
- Real source image6343bdc8, native28ea3958, Edge d6aa7a51 and Proxy aa14e21c
  retained exact prior digests/start times, restart0. No restart/install/deploy,
  DB business mutation, session termination, secret/certificate or auth change.
- HK canonical TS `/home/bobby/trading_system`, observed
  `fix/dev-consumer-recovery-integration@668e10320c0bf5a9089e33b72f317d8d7c7215c3`,
  peer-owned/unmodified. Canonical Portal
  `/home/bobby/.worktrees/portal-execution-manager-v2`,
  `feat/manager-v2-paper-read@54c6f5f3cccd68f400f4dd25ae6f4b17320a7db4`.
- Active source feature worktrees: PM c2668cfa above; Edge current-policy
  `portal-core-current-policy-wire-20261024@68344dad`; source-owner
  `portal-execution-edge-upgrade-v1_2`, branchfeat/execution-edge-upgrade-v1_2.
  No merged/abandoned worktree disposed because this task did not merge any.
- SGP canonical Core `/home/bobby/portal-research`,
  `docs/research-loop-plan@eabe5de32a64e9d802cddd5ffee4f2782219b112`, unchanged
  at final SSH recheck. Only this public Markdown mirrored; no source/secret
  transfer, Core plan overwrite, stable/dev/provider28445 or runtime change.
- Stable release and rollback custody unchanged: previously recorded
  `/srv/primus/portal/releases/a9b10385ab6c16350555f70f4379dfa23ca6b20c/` and
  rollback6180b9bf/cd79e9c6/98a191c7. No new runtime qualification inferred.

Core: read this single final return rather than reusing the proposal's pending
approval status. Return the exact missing current binding and route the newly
observed metadata scope decision to Bobby. Do not repeat retired specimens or
claim source install/connected PASS from source qualification or file delivery.

## Continuation approved27Oct — metadata decision taken; Core input still needed

Bobby requested immediate continuation after the concrete two-input return.
Edge chose the additive/no-shared-ACL-change option: explicitly admit only the
exact currently reviewed Timescale extension metadata PUBLIC SELECT set under
a separately pinned object/definition/ACL/extension digest. Do not call that
absolute execute-only DB access. This exception gives no new grant, allows no
application table/column read, DML, prefix exemption or native authority. New or
changed metadata/privileges must refuse until separately reviewed. The old strict
behavior remains default without the explicit private source metadata pin.
Implementation/full-Timescale isolated qualification is IN_PROGRESS from
c2668cfa; previous test counts above remain previous qualified-source evidence,
not these new cases. No real installation has occurred.

**Core priority action now, independent of that test:** return these public
binding fields and private-reference hashes in this existing mailbox/owner-return:

```text
CORE_BINDING_STATUS=CONFIRMED_CURRENT or NEW_SELECTED
HUMAN_ISSUER=<confirm/change historical intended issuer above>
SUBJECT=<confirm/change stable Portal ID above>
WORKSPACE_ID=<confirm/change workspace above>
ENVIRONMENT=paper
WORKLOAD_ID=<the exact Research discovery service identity to commission>
VALID_UNTIL=<viable finite future UTC deadline, not an expired slot>
PRIVATE_MANIFEST_REF=<owner-only locator, or NEW_SELECTED pending creation>
PRIVATE_MANIFEST_SHA256=<actual bytes when created, never a fixture hash>
```

NEW_SELECTED is allowed when no runtime manifest exists: Core selects the new
discovery workload/target explicitly; it does not assert that an old runtime is
configured or that a user already has a membership/grant. No secret value is
requested. Edge then pins the new source accessor/config and provisions only
the approved two-role mechanism; current trust/connected authority is qualified
separately. Do not send a generic READY/health or repeat that Edge must propose
the DB mechanism: Bobby already approved it and sourcec2668cfa exists.

## Continuation result — exact metadata gap closed

The earlier metadata-decision blocker is **RESOLVED**, not still awaiting Bobby.
The chosen additive option preserves existing shared ACLs: optional private
`source.public_metadata_sha256` admits only the exact reviewed PUBLIC SELECT
Timescale extension-member objects; no pin retains strict rejection. Installer,
post-install verifier and every restricted observation use the same catalogue
definition. No schema-prefix exception or install-time auto-adoption. Additional
objects, changed definitions/ACLs/extension version, column/DML/sequence USAGE or
UPDATE and callable native authority still refuse. Direct application-table
SELECT remains unavailable to the new login; owner receives only the approved
five SELECT grants. Temporary tables remain allowed by existing PUBLIC TEMPORARY,
not falsely called a persistent data/DDL grant.

### Actual source metadata evidence

Only catalogue metadata, bounded READ ONLY/2s statement/250ms lock transactions,
ROLLBACK. Exact source still system7674585245102796834/OID16384/live_data_executor.
Reviewed52 Timescale2.28.3 objects:25tables,19views,8sequences. Canonical numeric
snapshot149964bytes, SHA256
`6635b6bad6a117d8ae995909456f4475a9b26a32dcbab325eea38807096b6308`.
Pins cover OIDs/namespace/owner, complete ACLs/columns/view parse-tree hashes,
constraints/indexes/options/sequence definitions and extension identity/version.
No config/job-history/identity/membership/receipt row contents were selected.

The exact opt-in admission guard and existing PUBLIC safety checks both PASS
on the real source. Five-application-relation catalogue remains27924bytes, SHA
`fd4a84a99e8e04e9ef18afb2d708e75dfaf65a83ea8306cf921965527f3b1266`.
New roles0/schema0; no function/credential/listener installed. These hashes are
observations, not a private pre-install backup or runtime membership acceptance.

### Remaining input, one owner/action

**Core:** return the `CORE_BINDING_STATUS` through `PRIVATE_MANIFEST_SHA256`
fields in the preceding continuation section. Confirm current values or select
a fresh stable Research discovery workload/tuple explicitly as NEW_SELECTED,
with a viable finite deadline. No old runtime credential/session required.
Edge can then take the bounded private backup, render/review the exact SQL,
apply only the approved two-role/schema/accessor delta and verify actual hashes;
trust/listener/discovery acceptance follows matched composition separately.
No repeated generic phase/DB approval, historical entitlement or fake receipt.
Full08/read09/ELP2-10 remain OPEN/NOT_MET. Discovery never grants READ or STREAM.

### Final source, qualification and cleanup

PM source commit **fb9a7ce759fac3bbea58d4d9886c8ed6fd30fe5f**, same
`feat/core-financial-assembly-20261024` checkout above, clean normal Bobby commit:
8files/+824/-29 including mandatory PM plan. No push/merge/image build or CI.
Earlier c2668cfa is the predecessor, not the final metadata-capable installer.

| Changed source/test relative to PM checkout | SHA256 |
| --- | --- |
| services/portfolio_management/research_reader_metadata.py | 9772931d2cfcbad96664ce568949e7137e384b7dc26082b07eeca23523c3583d |
| services/portfolio_management/research_reader_install.py | 0e9caf90e1900fc52fddec764c089594dfa983c2e39ce8c2c7f41f37692fa0b1 |
| services/portfolio_management/research_reader_source.py | a2ee6af783ac976f0c08a18cc8edfef03271cb259353c465f66c6c0e1167b92b |
| services/portfolio_management/identity_mapping_runtime.py | fc5ee763a3cbb49dc5bf2d3fd3e2d20ee249d52a8c5ce95fb7cbed909f5839b6 |
| tests/unit/test_research_reader_source.py | 71a2b2823a8fed0dfd2f98f8c5360b33fd869f227a15515bdbef43a4683282fd |
| tests/unit/test_research_reader_install.py | 0c62b9e94789c48726a391a3b02c6961f4efda82a695fff3190eda65a9b09d8d |
| scripts/research_reader_isolated_test.py | c2a60ad1635ef4c3a6b1d7469ecdde9552ab6bb7634aae82394518d0dc223518 |

Final139focusedPASS/0FAIL/0SKIP,4.83s; same six-module command/image089658 above.
Actual PG15 source-image6343bdc8 **86PASS/0FAIL with Timescale2.28.3** and
**77PASS/0FAIL without extension, strict legacy path**. Each independently
provenanced TEST_ONLY disposable fixture, not a real source identity/membership,
capacity or connected acceptance. Run the fixed-target script with mandatory
`RESEARCH_READER_TEST_ONLY=YES_ISOLATED_DISPOSABLE`; add exactly
`USE_TIMESCALE_TEMPLATE=YES` only for the extension-bearing cell.
Script cannot target an operational host/database through flags or DSN overrides.

New actual PG cases cover metadata stale pin/extra member/definition/ACL drift;
pgXapp literal-prefix audit;9hidden/direct table/column/function/sequence/owner/
schema/database overgrants; positive verifier with retained TEMP objects; original
native validation, lock/cancel, post-COMMIT/release nondisclosure, expiry and
revoke old session/new authentication all still pass. First attempts caught a
strict-fixture field mismatch, PG15 OID JSON serialization and overstrict TEMP
owner audit. Fixed before final passes, no red result called external debt.

Exact labelled disposable cells/network absent after both final runs; no host
port/volume/source row/credential retained. Existing images reused, no test image
or BuildKit artifact created. Shared inventory226images/50active/92.89GB and
BuildKit1307/63active/132GB retained (peer-owned/active+rollback), no broad prune.
Root free entry59573633024B/pretest58934382592B/final59586035712B; shared-host
changes are not claimed reclaimed space. No SGP test resources created.
Source/native and three existing Edge/Proxy profiles retain exact previously
recorded digests/start times/restart0. Source/config revision unchanged; protected
stable/dev/provider28445, all-mode Manager, command/Live and rollback custody
untouched. Canonical checkouts/active features/stable/rollback locations remain
the prior reconciliation above; only PM source pin advances to fb9a7ce7.

Final Core intake check09:24UTC27Oct: sourceeabe5de3, no new binding return.
All independently runnable owned code/tests/metadata review are finished.
**Next:** Core returns the selected fixed tuple/workload/deadline above; Edge
installs/verifies the approved exact delta in this same08 task. This Markdown
delivery is not a consumer ACK, runtime install or connected PASS.

## 09:42UTC continuation — private backup ready, binding still absent

Bobby requested continuation through backup/install/verify in the same08 scope.
Rechecked both public mailboxes, current Core source and accessible relevant
private manifest filenames. Core remains eabe5de3; no current discovery binding/
workload/finite validity returned. Old inaccessible/retired session directories
were not elevated into or reused. No historical tuple is treated as current.

Owned independent step finished: source catalogue-only backup at HK
`/home/bobby/secure/edge-research-reader-20261027-iaecH4H5/manifest.json`.
Manifest SHA256 `aa8965b8a22ef2b50aecc0c5110ad41af14f11045776c417ff8e5cab20830778`.
Directory0700/files0600, Bobby-owned. `catalogue-backup.json.gz.b64` is20917bytes
ASCII/15686bytes compressed; verified decompressed snapshot203485bytes/SHA256
`d2a5e1193fd0c6d98bb5fea7a85952b80e7e4117bf6e721c48f62a97d35bf3b9`.
Retain for install-review audit, not disposable test garbage. No secret/password,
identity/membership/policy/receipt/config-history rows or large data dump.
Includes five-relation definitions/ACL/RLS, reviewed PUBLIC metadata, relevant
role attributes/memberships, DB ACL and proposed-name absence. No private backup
bytes copied to SGP or Git. It is explicitly UNBOUND/NOT_INSTALLED and must be
revalidated immediately before any eventual apply; it is not a release manifest.

Fresh bounded READ ONLY/RR source checks preserve cataloguefd4a84a9 and exact
52-object metadata6635b6ba. New roles0/schema0/functions0, source6343bdc8/restart0.
First metadata admission+backup attempt hit the2s statement timeout and produced
no file or mutation. One retake with transaction-local JIT off passed within the
same statement2s/lock250ms bounds. Shared settings unchanged; no latency/capacity
or production-readiness claim. Read-only transactions ended/rolled back normally;
no installed reader, credential, listener, runtime change or new source tests.
Prior139/86/77 PASS remain inherited unmodified-source evidence, not rerun here.

**Core action still required:** return the exact block above now, confirming
current values or selecting NEW_SELECTED tuple/workload/deadline. This is NOT a
request for new owner approval or another DB design. Sourcefb9a7ce7 and the exact
approved two-role mechanism already exist; Edge owns backup/apply/verify after
that input. Return into this existing ELP2-10 mailbox and mirror to HK EPG10-08.
Do not mark READY from filename delivery, reuse retired session credentials,
or interpret discovery as membership/READ/STREAM. Full08/read09 still NOT_MET.
