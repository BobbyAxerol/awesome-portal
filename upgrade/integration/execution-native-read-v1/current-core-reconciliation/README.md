# Original08 — Core read/SSE reconciliation and actual consumer targets

Status: **SOURCE_QUALIFIED**, not installed or connected acceptance.
This is a delta against committed Core
`e19ad906d713d59688390ca24affdf626e22e16f`, not a replacement for the
[historical 5291 profile](../current-core-runtime-profile/README.md).
The [original08 journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#23207-original08--actual-provider-owning-boundary-and-connected-acceptance)
is authoritative for approval, actual attempts, runtime and remaining work.

## Current owner direction — integration first

**Owner target correction,19Oct Asia/Saigon — CURRENT, supersedes the dev
target selection below:** `portal.primusspark.com` is main/stable and the
genuine Cloudflare/Zero Trust security target. `dev-portal.primusspark.com`
is dev preview, NOT the Execution v2 consumer. The actual consumer is
`research-portal.primusspark.com` -> live tunnel/nginx ->127.0.0.1:8095 ->
`portal-research-preview`, source `/home/bobby/portal-research`, branch
`docs/research-loop-plan`, currently d0789674. The earlier c43/dev DB choice
was our target-selection error, not a missing Bobby-provided Access setup.
Do not commission Access or native authority on dev to satisfy this packet.
Historical observations below remain dated provenance, not current actions.

Actual Research Control API still runs image d13cef069471/config42a9f3ad,
AUTH_MODE=dev, no native config pair; separate DB system7688673963308855330,
volumeportal-research-preview_portal-postgres-data, ledger127. Bobby is ACTIVE
as usr_5a38d5dfb08b44748f5776fbe04a1434 (different from stable); exact Stan/
Thanhvuong lookup has no rows. Stable system7675333655652302882/ledger39 has
all three ACTIVE. Same workspace string does not make those systems/IDs or
trust interchangeable. Exact READ ONLY metadata and live route fields support
this map; no private subjects/credentials or product rows are published.

The current Research runbook records Bobby's10Oct exception: public review
preview, no Cloudflare Access, preview auto-login; external Execution sources,
streaming and commands disabled. Preserve that exception, not claim it as
production security. The source auth/context GET can mint a preview session,
so this audit deliberately does NOT call it. Main received6TLS-verified,
no-cookie front-door checks (3paths x missing/forged headers), all302to the
official Access issuer; this proves only front-door refusal, not login,
JWT revocation or the unmounted new native HTTP/SSE path.

See the [corrected target/action journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-owner-target-correction--2026-10-19-asiasaigon)
and [bounded receipt](stable39-qualification.json). No rollout, migration,
identity/grant/password/session or auth change occurred. Do not reuse stable's
expired DB-pinned commissioning artifact for Research or treat a main Access
PASS as Research native acceptance. The next package belongs on the reviewed
Research/Core consumer source; main security checks remain separately scoped.

**Latest19Oct12:54Asia/Saigon:** Core independently adopted/requalified its
actual successor d0789674,64paths/+6018/-190. Its actual terminal on SGP at
`/home/bobby/.local/state/portal-execution-elp210/20261019/c7-terminal.md`
records1118contract/8102API PASS,3SKIP, build/scoped restore PASS. Preserve
the earlier failed/pending receipt; this is a new combined source gate, not
inherited8060PASS or genuine HK/provider/auth acceptance. Do not reapply this
old22patch over the adopted native files or overwrite subsequent Core WIP.
Integration runtime still uses old8400439b/config963a3d84; source adoption is
now complete, but an exact reviewed release/image/schema/private refs/protected
auth still has to be commissioned in original08, with stable unchanged.

The prior remaining cleanup is now COMPLETE: exact HK1175file/20629199B source
child and sole symlink removed without following dependencies,41runtime tuples
unchanged; SGP2exact idle cache IDs/16384B removed,51runtime tuples unchanged.
No volumes/data/authority/peer jobs/active or rollback resources removed. See
the [latest original08 journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-resumed-integration-commissioning-and-exact-cleanup--2026-10-19-1254-asiasaigon)
and focused receipt for disk/cleanup evidence and publication scope. Older
entries below are time-specific history, not current pending-cleanup claims.

### Earlier integration selection — SUPERSEDED by the owner target correction

The earlier19Oct reply was interpreted as the Core integration release first, **not**
the earlier stable-rollout option. Stable production must remain unchanged.
The qualified source base is still e19+this22-file delta. Actual integration
service8400439b/config963a3d84 points at /home/bobby/portal-integration,
docs/consolidation-closeout-20260919@c43ee031; do not apply this exact-preimage
patch there blindly. The Core owner adopts the packet in its matched reviewed
release, retaining its current writers/pool/coordinator. Source adoption is not
an authorized whole stable release or an acknowledgement from the consumer.

Actual source delivery/adoption preparation,19Oct08:30–08:43Asia/Saigon:
exact5f433 Git object fetched on SGP once the full guard was quiet. Read-only
preflight on owning e19 PASS/22files/writes0. A separate source feature
`feat/execution-native-read-integration` now exists at
`/home/bobby/.worktrees/portal-execution-native-core-integration`, started from
dev53316263 and fast-forwarded only there to e19. The exact22-file delta is
applied and verified, plus3required Core tracking files: staged25paths,
+1982/-99 total. Normal gate/publication have since completed below; the
08:43entry records preparation only, not Core-owner ACK. Peer checkout/index states and51runtime tuples
unchanged; temporary packet/lease removed. Active feature retained for review,
not deployment. See [focused receipt](stable39-qualification.json).

**Published19Oct09:51Asia/Saigon:**
[`feat/execution-native-read-integration@b87f73db`](https://github.com/BobbyAxerol/awesome-portal/tree/b87f73dbda3d119dbb09ed9f263b89738abbb874)
is the actual prepared Core source, not merely a patch to discover. On SGP its
active source checkout is the candidate path above, clean. Agent Core should
fetch this feature, compare its25-path delta against parent e19, and read
`upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`'s final Original08 task card plus its
two backend indices. Adopt through its reviewed integration release; **do not
blindly apply over the old c43 integration or deploy stable**. Shared dev/main
and both peer refs unchanged; normal pre-commit/pre-push enabled, no merge.

Actual full gate:1087contract PASS/74files; API8060PASS/7SKIP in413PASS/3SKIP
files,0FAIL, TypeScript and isolated PostgreSQL restore PASS. Four native-PG
rollback cases intentionally skip the normal cell's incompatible hostname;
the identical source already passed its dedicated guarded4case rollback
profile in [source qualification](qualification.json#L98). This is separate
from the7case stable39 runtime factory, not a fabricated coverage substitution.
Other3skips belong to Research read-model/real-DR/real-source profiles, not
proven here. No runtime/human/provider/capacity acceptance follows from these
source tests. Raw before/after runtime flag FALSE is retained: exact comparison
shows all51original tuples unchanged plus2foreign test cells, never operational
drift; foreign overlap invalidates any timing/capacity inference.

**Parallel Core update observed10:30Asia/Saigon:** owning research source is now
`35953e07`, with421peer paths changed since e19. None touches the22native source
paths; read-only `git apply --check` PASS, writes0, HEAD/index unchanged. Six
qualified dependencies changed: operational-read contract/repository/service,
query contracts/Postgres engine and the operational-current spec. Review shows
FE-042authorized incident links/FE-043scoped counts and a same-snapshot reader;
existing `list` remains, but this is not byte-identical qualification. Core
must retain these peer semantics and qualify its actual combined integration
revision. Do not silently refresh the e19closure pins, inherit8060results as
359qualification, overwrite421UI/peer paths or deploy stable. The published
b87candidate remains the exact qualified delta to adopt, not a stale-runtime
claim. No native source conflict or need for a new phase was inferred.

Own test cells/network/lease are removed and hook PID terminal. The exact D4
test image has also been removed after SGP became quiet;2source-cache records
(16KiB total) await the new foreign Node jobs' completion. The first exact-ID
prune was a no-op and is not reported as success. No broad prune. The20.63MB HK test
specimen plus five-path journal commit await the active HK reservation (latest
read ends11:57:58Asia/Saigon) and actual quiet. These pending items are not
declared completed. Retain active feature and all operational/rollback/private
artifacts; no schema/auth/DB/deploy/Cloudflare/session change occurred.
Read-only reconciliation10:39Asia/Saigon confirms both exact8KiB cache IDs
still present and foreign npm/Node jobs active; no cleanup receipt or complete
claim. Candidate b87remains clean; stable/integration/preview image/config and
restart0 unchanged. The HK five-path journal/receipt update is still local WIP,
not part of the already-published Core source commit.

The integration DB is system7675320204448350242/39, volume
portal_portal-postgres-data, not stable7675333655652302882. Bobby is ACTIVE;
Stan was INVITED in the bounded audit. Use the target's reviewed exact mapping
and normal invitation/auth flow, not stable key/grant copies or a status edit.
Prepare a distinct private integration config/trust/key reference and explicit
schema/window/recovery boundary before native admission. Existing stable
commissioning inputs remain pinned to stable, not a retargetable template.

Bobby will complete official Cloudflare login when opened. At01:21UTC the
integration public origin https://dev-portal.primusspark.com returns200 without
an Access redirect; stable https://portal.primusspark.com redirects to the
official issuer. These were header-only, unauthenticated diagnostics, not
proof of provider commissioning or a successful login. Do not open a dev CLI
flow and call it genuine authority, silently switch its auth, or use a stable
session against another target. Correct integration Access/auth must be ready
before its positive human drill; no token/cookie belongs in Git/chat/logs.

Follow-up01:23UTC HEAD metadata request (no user token, cookie or body) finds
no Access application metadata on dev (404); stable returns Access metadata.
This does not inspect or exhaustively prove the account's policy configuration.
Only the two known SGP credential locations and portal-dev.env were inspected
for reference/presence, not secret values; no management reference was found
there. The [official Cloudflare CLI flow](https://developers.cloudflare.com/cloudflare-one/tutorials/cli/)
requires the correct Access application. No login process/token cache/session
has been created, avoiding an unused or wrong-target user credential.

Fresh01:26UTC integration READ ONLY/rollback recheck confirms the exact volume/
system/39-ledger. Each named user already has one binding to the official
Cloudflare issuer, so do not recreate accounts or invent a dev mapping. Bobby
has one workspace; Stan remains INVITED with no workspace. Preserve normal
invitation and current identity/policy checks; binding presence is not a grant
or proof of a successful session.

### Core-owner adoption action and return

1. Source adoption/current-dependency qualification is already DONE at d078;
   do not reapply the old22patch or rerun its unchanged source just for a new
   tracking date. Preserve subsequent Core backend/contract/frontend WIP.
2. Assemble the native consumer on the actual Research/Core release line,
   not old c43/dev. Review only its native schema/install delta, explicit
   loader mounts/env pair and selected read/stream writer mode; prevent a
   second legacy projection writer. A source commit is not a running image.
3. Match Research DB7688673963308855330 and its actual user/workspace identity
   to a fresh reviewed source READ/STREAM acceptance and private serving refs.
   Stable-only ID/key/grant/window artifacts are not a retargetable template.
   Do not create users, promote invitations or seed grants/sessions by SQL.
4. Keep genuine security acceptance on main/stable. A public auto-login
   Research preview must not acquire a genuine-person/native read grant by
   treating its dev header/session as verified human authority. Resolve the
   exact authenticated consumer/publication scope with the owning Core release;
   do not ask Bobby for an irrelevant dev Cloudflare management reference.
5. Return the actual immutable image/config, exact DB/schema/identity and
   private ref paths, read/stream scope, activation window, drain/recovery and
   rollback owner. Bind and run revoke/cache/cursor/SSE in original08 as soon
   as those real inputs are valid; no new phase or generic repeat approval.
   Main front-door evidence and Research consumer evidence stay separate.

Rollback stops only new candidate admission, drains physical work and retains
ambiguous outcomes/recovery custody before removing candidate mounts. No
audit deletion, permissive fallback, stable replacement or dev migration.

## Current e19 against stable39 — 2026-10-19

The unchanged genuine seven-case factory has now also run on **this current
e19+22delta**, not merely historical5291: strict compilation and7cases PASS,
0FAIL/ERROR/SKIP. The independently pinned39-ledger/golden, real filesystem,
private-file checks, same-pool coordinator and AppModule are exercised in a
disposable HK PostgreSQL specimen. The intentionally unserved PM origin and
TEST_ONLY users do not prove real PM authority or Bobby/Stan authentication.
See [focused receipt](stable39-qualification.json); these7are a new execution
of existing cases, not7new authored cases or a rerun of the931-case profile.
All owned cells/network/lease/tmpfs keys were removed at terminal completion;
the one1175-file/20.63MB disposable source copy awaits exact quiet teardown.
Do not delete its borrowed /deps/node_modules target or operational artifacts.

Actual SGP Core remains source e4fd9365/image d2c23ad668fc, AUTH_MODE
cloudflare_access_local_password, on the real stable39 DB. Installing candidate
guards/policy and replacing this owning service is an operational change,
not a consequence of these tests. Candidate SQL is still explicitly isolated
until adopted; no full current-Core migration bootstrap or second authority
instance is permitted. Keep node-owned serving secrets separate from root-only
offline owner artifacts. Expired intake bounds installation, not grant expiry.
Normal Cloudflare assertion + Portal login must supply the genuine caller;
never insert sessions or change auth mode/passwords to manufacture acceptance.

The actual released-to-current Git comparison is **987Control-API paths**, not
22or171:864added/123modified, including498src/388test/99migration paths and
both package files.171was only5291→e19. The focused receipt now records the
exact name-status digest and four actual Core service/config identities.
No service has native configuration. A subsequent bounded read-only audit
confirms the four services use **different physical PostgreSQL systems/volumes**,
even though each database is named portal_control:

| Core project | Database system ID | Ledger | Named identity state |
| --- | --- | --- | --- |
| portal-stable-v1-0-1 | 7675333655652302882 | 39 | Existing pinned Bobby/Stan/Thanh ACTIVE |
| portal-research-preview | 7688673963308855330 | 127 | Bobby has a different ID; Stan/Thanh absent |
| portal | 7675320204448350242 | 39 | Same named IDs, but Stan INVITED |
| portal-probe | 7682060456617267240 | 29 | Same named IDs, but Stan INVITED |

Only stable matches the existing private native commissioning target. The
other three use dev auth and are **not** interchangeable genuine-user targets.
Do not copy the stable keys/grants, activate an invitation, create duplicate
accounts or change the pinned system ID to make another target pass. A newly
chosen integration target needs its own reviewed identity/authority inputs;
its test proof remains distinct from production/human-auth acceptance.
Whole-release compatibility is unqualified, not proven broken by this count.
Have the Core owner adopt this exact delta in its matched reviewed release;
do not promote all peer changes, bootstrap all migrations, backport to stable
or restore a stale permissive route as an incidental Edge test operation.

## Exact scope

The22-file patch retains current Core self-eligibility/current-grant behavior,
the scalar-only bounded observation journal and current typed policy refusal.
It adds the already reviewed same-pool/trust/coordinator native HTTP/SSE mount,
runtime loader and actual-work drain. Core's `settleSourceReads()` lifecycle API
uses the same original retained-flight settlement as the full Hub drain;
abort/timeout is never treated as physical completion or source ACK.

One projection test fixture is adapted to the current typed principal and
ProjectionRow shapes, explicitly synthetic and not an authenticated authority
proof. Two inherited trailing empty lines are removed. No command/financial,
membership ceiling, broker, source publication, UI or mode authority is added.

All17 overlapping inputs were manually compared;53 other current files remain
byte-for-byte unchanged and one has the fixture-only repair above. The finite
profile used for comparison is NOT a proven common Git ancestor. No deletion
was inferred merely because Core had not adopted an earlier published mount.
Read-only1168-path metadata confirms zero drift between captured WIP and e19;
hashing is per-file evidence, not an atomic repository snapshot.

## Verification and safe application

The manifest pins22 whole-file preimages/outputs and1168 app dependencies,
plus three fixed auxiliary sources and the declared bootstrap layout copy.
No dependency cache, ENV, secret, certificate private key or DB rows are here.
Fresh final21-spec strict PASS;931 behavior test executions PASS across
393native/realtime +534current-policy/projection +4separate PG rollback cases,
zeroFAIL/ERROR/SKIP. Three exact application/output/wrong-preimage checks PASS.
The production strict gate precedes only one removed EOF newline in one
production file; the receipt proves exact byte equivalence apart from that LF
and all other production bytes unchanged. Final affected-spec strict and all
behavior runs use the exact published outputs. Parameterized null/nonfinite
inputs can have identical rendered case labels; accepted suite files are
disjoint, with no failed-run or historical393-case credit inherited.
See [qualification.json](qualification.json) for exact attempts, pins and
cleanup, including the original11fixture diagnostics and wrong-hostname
setup failure/52skips. Neither failure was waived or relabelled PASS.
The [independent cleanup audit](cleanup.json) confirms all10disposable source
trees/18flat files and owned cells/networks/lease are absent. The first cleanup
receipt writer failed after teardown; original deletion disk metrics were not
retained and are not reconstructed. Fresh audit disk213165694976→213164609536B
is explicitly not a reclaimed-GB measurement. Active native runtime/private
PKI/config/DB/history, shared dependencies and operational rollback are retained.

Core e19 is committed on its owning SGP checkout but was NOT reachable from
the advertised remote research-loop-plan line at the recorded check. Use
that exact verified local commit or have its owner publish it before fetching
elsewhere; this packet does not push their branch or copy171peer changes.

Separately, SGP's read-only remote check at19Oct00:43UTC succeeds for the Edge
feature ref at5f433f8c. The owning agent can see the published handoff on
awesome-portal; this is not proof it has fetched/applied/accepted it. Our fetch
was deferred at that check. Actual01:30UTC fetch and01:43UTC source-candidate
application succeeded later, with peer checkout/index/runtime preserved, as
recorded above. Normal hook/publication still waits for the fresh physical
guard; source preparation is not the Core owner's ACK or connected acceptance.

Use only an isolated clean feature checkout
at the exact e19 source/dependency closure, with the fixed auxiliary sources:

```sh
python3 -B /path/to/edge/scripts/epg10-08/publication.py \
  --packet /path/to/edge/upgrade/integration/execution-native-read-v1/current-core-reconciliation \
  --target "$PWD"
git apply --unidiff-zero --check /path/to/edge/upgrade/integration/execution-native-read-v1/current-core-reconciliation/qualified.patch
git apply --unidiff-zero /path/to/edge/upgrade/integration/execution-native-read-v1/current-core-reconciliation/qualified.patch
```

Do not force, use rejects, overwrite peer work or deploy from a test specimen.
Verify every output and unchanged dependency after application. Source
qualification is not actual Core schema/intake installation, human/session
authentication, native held authority or connected revoke/cache/cursor/SSE.
Use the [actual native commissioning packet](../native-db-commissioning/README.md)
for the genuine target/producer/private-reference boundary. Full08 remains
NOT_MET;09connected is not started by this packet. Command07, publisher03 and
capacity01/06 retain their own original owner/acceptance gates.
