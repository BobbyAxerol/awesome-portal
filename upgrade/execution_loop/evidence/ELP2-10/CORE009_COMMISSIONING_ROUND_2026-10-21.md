# Core009 commissioning, independent review and landing preparation — 21 October 2026

**Current06:55UTC:** the05:45 source-tested update below is historical.
Normal R3 subsequently failed; fixed commit/image/recovery are still pending.
First focused capacity wait expired without starting a cell; one bounded
six-file retake is queued. [Actual readiness](CORE009_RECOVERY_READINESS_UPDATE_2026-10-21.md).
C4/C5 delivery and PM source ACK are complete as separately scoped; no TS03
or target/budget commissioning inferred. No new runtime/credential action.

Status: **INSTALLED / RETAINED_NATIVE_READ_AND_SSE_PROVED / RECOVERY_FIX_IN_PROGRESS**
as of05:45UTC; active STREAM revoke closed the client but custody is not yet
terminal. Eight admissions: seven source-correlated terminals, one ISSUED.
Two-file transport repair has Node22 54/54 focused PASS; normal hook pending,
not installed. Revoke/restart/recovery and expired-token cleanup remain open.
[Actual finding](CORE009_RECOVERY_BUSY_FINDING_2026-10-21.md) and
[recovery-only coordination](CORE009_RECOVERY_ONLY_WINDOW_REQUEST_2026-10-21.md).
This is the existing
C7/EPG10-08/ELP2-10 package, not ELP2-11 or release approval.

## Assignment and entry pins

Bobby explicitly approved this round's three lanes in chat on 21 October:
Core-owned configuration and bounded Research commissioning; independent
review of Claude's backend; integration/ledger preparation without losing WIP.
The earlier approvals cover exact Research identity, independent finite Paper
READ/STREAM, temporary application acceptance session and exact cleanup. They
do not authorize stable/dev/main, provider28445, commands/Live or production
budget/calibration changes.

- Canonical: `docs/research-loop-plan@7818d5631e0da37563bca5715fd46d40b66ef1de`,
  `/home/bobby/portal-research`; existing multi-owner Markdown WIP preserved.
- Isolated Core: `chore/core009-connected-20261021@734353113d8bec85f78b35ab81c9c1a40e93a67e`,
  `/home/bobby/portal-core009-integration`, clean at entry. Reviewed immutable
  image `sha256:9cf5fffac3e0bf55ea4b23c9df2b85565da556b973fbb1ce6928936f49a2950c`.
- Claude: `claude/fe-parity@97454777066e75f8c76e8e9fab2dd4361fdb0956`
  at assignment, advanced to `fe84ee69e1bbab0eb204f8c3414a7618bf372a77`
  during read-only review. Source commits preserved, no peer edits.
- HK Edge read at 04:00 UTC: `d15de83ee56ac57e68f33075f5920321a1cf54f0`;
  current source-owner packet and WIP preserved. Dedicated trust transfer is
  already VERIFIED, not an outstanding permission request.

## Work ownership and acceptance

| Lane | Writer / scope | Gate |
| --- | --- | --- |
| Core commissioning | Primary; private Core refs/config, bounded validation and exact Research operational actions | Actual file/image/config/schema pins, second review, zero-custody IPC quiesce, post-quiescence backup, official install/session/revoke; no fake native acceptance |
| Backend review | `claude_backend_review`; one standalone review receipt only, source read-only | ACCEPT/CHANGE by code locator and existing/focused evidence; source review is not connected acceptance |
| Landing review | `landing_delta_review`; one standalone review receipt only | Unique/overlapping source and migration inventory, safe landing order; no actual merge/rebase/stash |
| Operator review | Reused `core009_operator_review`; read-only independent bounds/config review | Exact reviewed finite bounds, private-file pin/ownership and cleanup procedure |

Primary owns Unified/sync and integration. No frontend, shared generated
contract, migration or Claude source changes in these review lanes. Three
helpers: two new independent review agents, one reused operator reviewer.

## Operational boundaries

Research Core maximum remains 2 CPU / 1536 MiB / 128 PIDs. Source one-inflight,
1+1 pools and 32768-byte requests/responses remain finite correctness limits,
not production performance approval. No new heavy build or unchanged full
suite: reuse exact candidate normal-hook/image receipts.

Edge proposed 04:15–05:45 UTC today, not yet an acknowledged window. Core
first resolves its own signing/TLS references and reviewed runtime limits;
fresh native acceptance/current head and actual observer facts stay pending
until the source owner supplies them. Never reuse revoked head2 or fabricate
session IDs to complete a file. Before any swap: filled artifacts validated
and independently reviewed, G1–G12 per operator runbook with the prepared
return's corrected post-quiescence backup order.

Rollback retains008 image/bootstrap/descriptor, all DB/audit/custody and
backup. Official remove-only grant/session revocation precedes exact token
cleanup; UNKNOWN retains original recovery objects. No SQL repair, broad
cleanup, forced bootstrap stop or hidden retry.

## Results and handoff

The initial read-only check confirms008 remains
running on image7b2c7f34, restart0;009 is built but not installed. Source
preflight and receipt transfer are real; READ/SSE acceptance is not yet proved.
Claude may continue UI/visual independently. Source-review findings will be
returned as concrete producer requests, not changes to Claude's UI.

### Core-owned preparation and fresh readback, 04:02–04:06 UTC

**Window ACK delivered:** [Core operator return](CORE009_OPERATOR_WINDOW_ACK_2026-10-21.md),
SHA256`18a04d74ad455cd3daafe24751251d19560d2b5ab3827e11bd4a9b4835ca01ed`,
copied to HK original08 packet and byte hash readback matched. Core accepts
04:15–05:45UTC,90minutes; not installed/connected/source acceptance. Independent
operator review **ACCEPT_FOR_WINDOW_PREPARATION** on actual private metadata
`d8ce6f12000f3423c640ca0158e31d0328f1069546fe98eca75c9f1b1e3b01fe`:
all7intended artifacts hash/shape/window-correct, exactly two separate grants.
Only nine native facts and actual issued session ID remain unknown; full
validator/root ownership review still follows actual source return. This
supersedes earlier NOT_ACKNOWLEDGED window wording, not missing pins.

Prepared a new immutable private generation at
`/home/bobby/secure/core009-commissioning-20261021-xwAWdhFY`:49resolved/40pending
names (formerly18/71); metadata SHA256
`3f761dba3c2ce5d4681c1756b6970d7514c9ec417bf6d0d46940a84ce9d1b61e`.
All Core-only key/certificate refs hashed locally, no key copy/print;0700/0600.
Installed008 pool4/connect3000/statement5000/query6000/idleTX3000ms,
lease30s/1unresolved/32retained, mutations128/recovery4 reused unchanged.
Narrow finite correctness selection: hub2clients/4entries,32KiBframe,
64KiBclient/128KiBtotal,2notices/read5s; egress1MiB/inflight1/send5s/quiesce1s;
terminal30s. These are operational test limits within the approved envelope,
not measured production budgets or calibration. Source deadline5s needs the
source-owner match; native control messages remain32KiB (not the1MiB DTO).

Actual READ ONLY A–F confirms DB/system/owner unchanged, authority34/epoch3,
no drain, unresolved0/nativeobligations0,34FINISHED intents, no policy/grants
or acceptance session; owner's normal sessions preserved. Initial readback
omitted the psql variables, failed at blockC and rolled back on disconnect;
corrected readback completed through explicit ROLLBACK. IPC status actually
FINISHED/COMMITTED,cookie_lost=false,unresolved0,callbackinflight0/accepted2.
No shutdown performed. Sandbox-local IPC probe failed before connection;
approved operator probe succeeded. Neither failure created authority/custody.

Transport correction found before install: renewed PM leaf SAN covers
`pm.elp210.candidate.invalid` and127.0.0.1, **not10.70.0.2**. Core will use
`https://pm.elp210.candidate.invalid:28446` with an exact container-local
host mapping to10.70.0.2. Preserve hostname+CA+leaf/TLS1.3 verification;
do not use the IP origin or disable certificate checks. Original partial
draft is not installed; next generation records this correction.

### Independent review / Claude action now

[Producer review](CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md) and
[landing review](CODEX_LANDING_REVIEW_2026-10-21.md) received. Primary checked
the four source locators. **ACCEPT source** B1/B2, index145 and DENIED-only
F0/migration146; **CHANGES_REQUESTED** CR-01Fleet public lineage pairing,
CR-02series failure recovery/digest mismatch, CR-03series leading completeness,
CR-04strict source timestamp parsing. Each review item includes minimum tests.
Claude owns these source fixes; Codex has not edited them. None licenses
financial writer/Fleet stream activation or blocks isolated native Core009.

Landing preparation found34/40candidate paths already byte-identical to peer.
Only three diagnostic fix paths(+45/-1) need carrying to peer; keep peer's
additional access/session work. No migration144checksum collision;145–147
are peer additions. No merge while canonical/peer WIP remain. Latest46-image
V2 verify receipts are fixture evidence, not the whole prior visual suite.

### Actual native pins, validation and first install attempt,04:20–04:34UTC

Edge actually installed native head3 and opened its separate28446 lifecycle
listener. [Producer return](EDGE_NATIVE_SOURCE_READY_2026-10-21.md) SHA90dfdc58
matches HK. Core initially copied two JSON numeric counters verbatim, rejected
by the frozen decimal-string codec; this was an operator preparation mistake,
not source authority drift. Preserve rejected runtimecde14448. Correct wire
encoding3→"3",1→"1" changes no timestamp/digest/fact: current runtime5344B,
SHA256`f3fe876df8c47acdf82da46a2046cc9878362614b47339ad888f67b9457863b9`.
Owner artifactdb72179f remains unchanged. Effective Composedf671785, no exposed
port, exact existing two networks,2CPU/1536MiB/128PIDs, commands/Live disabled.

Actual image validators UID1000 and UID0 both exit0/stat_refs=true/ok=true,
zero warnings/errors at04:31:30/32; official offline session dry-run exit0 at
04:32:05. Independent G4 review accepted preparation, including same-byte
root/service files. An unrelated HMD worker's observed auto-restarts retain
the same ID/image/config; no peer service touched. Ephemeral foreign test cells
are not persistent-service protection targets. Full protection of all other
Research, dev/stable persistent services remains.

Fresh A–F/IPC proves custody0/mutations34FINISHED, owner unchanged, no grants or
acceptance session. IPCshutdown returned SHUTDOWN_READY and008 exited0 itself.
Post-quiescence backup31,100,869bytes, dumpSHA256
`1a4ce30207106e80c8bb32e07d97df9b84d63f229ed67d1c0d68534879332051`,
TOCSHA256`a0c334ccd94f90cd91348fcb68ef83780b47112ebb0a79b9e6ad1eb2c5617a27`.
TOC/hash verified, not a restore claim.

First official policy CLI exited1 at04:33:25 with
`CURRENT_HUMAN_SCHEMA_INPUT_CHANGED`, before opening its DB transaction. Exact
image diagnosis: schema file exists with expected826e4e08 hash, but UID1000/
0600; root with all capabilities dropped gets EACCES. **No policy/session
installed.** Keep this failed receipt. Fix only the root CLI's same-byte
schema-file reference/custody, not SQL, schema ledger or runtime capability;
then repeat the same official policy artifact after revalidation/readback.

One newly explicit data-plane limit:28446 is the native lifecycle provider,
not the Manager relation-page HTTP service. The finite snapshot/STREAM lane
uses the existing retained observation projection and can be qualified
separately. General Manager data pages must not be called source READY without
the separately commissioned dataset origin. No fallback to stable28445.

### Core009 installed,04:37–04:40UTC — actual, not connected PASS

Prepared exactly the packaged826e4e08 SQL bytes as a root-owned0600 read-only
mount for the one-shot CLI. No SQL execution/schema changes or capability
addition. Retake of the SAME policy artifact exit0 at04:37:26; original refusal
retained. Official ACK records READ_AND_STREAM, two distinct grants and
command_commissioned:false. Runtime/owner/effective configuration hashes stay
f3fe876d/db72179f/df671785. Same source/image; no rebuild/full-suite repetition.

Actual Core container
`4095af125f9e31d1b8a4dcb6048553546a877092a24463918739ee0a1db11aaa`
uses image9cf5fffa, restart0, exact native environment/mounts/bounds. Health
and readiness200 through the container AND Research nginx8095 report
commit73435311,dirty=false,auth_mode=dev,PostgreSQLready. Runtime proofSHA
`d0a28a26ce208062b9ebf0c5ccbdee835871b4ffdeac2abe62e5a59d461b4359`.

Actual AuthService acceptance-session issue exit0 at04:38:51: session
`ses_5e86a430f62b4f77ad2af3053113dd9f`, idle expiry05:08:51.180UTC,
absolute05:38:51.180UTC, within05:45grant end. Token only in root0600 file;
no token/cookie in Git/chat. This is application-session evidence, not
password/Cloudflare/human-presence proof. Prepared exact revoke template must
bind that issued ID and pass review before handing Edge the private reference.

Post-install/session READONLY readback: authority39/epoch3/drainnull,
36FINISHEDmutations, unresolved0/nativeobligations0; onepolicy/twogrants at
revision1, oneACTIVEacceptance session. Protected owner remains ACTIVE/member,
not archived/must-change. **Normal sessions unchanged:14ACTIVE/672REVOKED.**
No positive native READ or STREAM has been sent by Core yet. Edge owns the
bounded connected case and matched terminal/frame correlation.

### Actual READY delivered04:47UTC

[Installed owner-return](CORE009_INSTALLED_READY_RETURN_2026-10-21.md), SHA
`46d36b843ded3b6721596a2ca043d987b06313dbf91a767d190c3fb5111ffee5`,
copied to HK original08 packet; actual readback matches. Exact issued session
bound to revoke artifact3dd1de26; all four official offline revoke dry-runs
(session, stream, read, all) exit0. No live revocation yet. Independent binding
review follows. Edge has real image/config/schema, session private reference,
actual finite grant IDs and source receipt, plus initial snapshot and1–2frame
case budget. No repeated native ISSUE/duplicate positive by Core. No connected
PASS inferred from transfer, health or application grants.

Independent session-artifact review ACCEPT: reconstructing the reviewed template
with ONLY actual session ID reproduces3dd1de26; genuine issue/stdout/runtime
hashes match. Host metadata checked by primary: root0:0/0600/single-link, revoke
artifact910B/token327B. Agent did not claim host ownership through its sandbox.
Official session dry-run exit0/verified:true, no token contents read. Actual
04:48readonly observation still unresolved0/native0/unfinished0/oneACTIVE
acceptance session. This remains pre-connected observation, not cleanup proof.

Claude has now committed an explicit ACK atfe1cfaf4, accepting CR01–04 and their
focused gates,3-path diagnostic carry and packaged-SQL-mode correction. None
of those backend repairs is yet DELIVERED at that SHA. Latest peer delta is
UI/visual/ACK,24files+174/-29 with15binary; no source overwrite by Codex.
`scripts/execution-tracking-test.sh` PASS and `git diff --check` PASS for docs;
no redundant full suite/build run while unchanged Core candidate is installed.

### First real HTTP specimen and fixture-route correction04:52–04:57UTC

Edge's ONE8095snapshot returned200/237B/15ms, body304a4455, without nativeheaders;
Core nativeobligations0. Preserve receipt72260d84, not READ PASS. Primary actual
nginx-T and independent source review prove the Execution-specific prefix uses
Claude's intentional fixture-BFF; the8-key body exactly matches its double.
Core's earlier8095 target recommendation was insufficient. No issue/COMMIT/ACK
was attempted by that fixture request. **No UI overlay/source change.**

[Corrected private target return](CORE009_FIXTURE_ROUTE_DIAGNOSIS_2026-10-21.md)
SHA388a88c6 delivered HK. Actual container4095af12 private172.22.0.5:4000 health200
reports73435311/dirtyfalse; sameownerworkspace verified. Edge owns one corrected
private native snapshot; Core has not duplicated it. This is private backend
proof only, not public nginx/browser acceptance. Also delivered retained/current
freshness distinction47096aa5; never upgrade stale/unknown toFRESH to pass.

### Actual native READ05:01–05:04UTC

Edge's corrected private-Core GET returned200/1608B/1181ms, bodye3e8043d and
native baseline/cursor headers. Actual Core read-only correlation shows exactly
ONE MANAGER_HTTP lease22bc1a61/attempt56fed375, phaseSERVED, receipt3f58c27b/
d147e865, source_reconciled:true/ACKresolve/db00e814; body digest matches physical
response, unresolved0/unfinished0. [Full actual correlation return](CORE009_FIRST_NATIVE_READ_CORRELATION_2026-10-21.md)
SHAa39591b1 transferredHK; Edge cross-checks original source receipt before its
next STREAM. RetainedFRESHfalse preserved, no public/browser/financial PASS.
05:04status confirms original686normal sessions preserved and sameoneacceptance
session; no grant revoke yet. This supersedes NOT_CONNECTED for the bounded
private HTTP lane only, not fullrevoke/restart/recovery/STREAM acceptance.

### Native SSE, exact session cleanup and bounded continuation05:08–05:17UTC

[Four original native terminal rows and old-session cleanup](CORE009_SSE_TERMINAL_AND_SESSION_ROTATION_2026-10-21.md):
fresh HTTP followed by2real heartbeat frames, allSERVED/source_reconciled/ACKresolve,
unresolved0/unfinished0. Edge independently matched each original TS physical
receipt. These are retained-notification frames, not newly published financial
data or currentFRESH/public-browser acceptance. Earlier409expired300scursor is
preserved; no error body was captured by that initial observer, so exact code
is source-consistent inference, not captured-wire proof.

Original session idleexpiry05:08:51 was not extended. Official exact revoke
completed05:10:23, receipt e99e706c, tokenREMOVED, zeroother sessions touched;
normal686sessions/14ACTIVE unchanged. [New continuation READY](CORE009_CONTINUATION_READY_2026-10-21.md)
officially issued05:16:54 with TTL1200, idle=absolute05:36:54, same grants/subject/
workspace/sourcewindow, distinct private token path/session ID. Cleanup artifact
already bound and official offline dry-revoke PASS. Independent helper review
caught totalretainedrow count incorrectly being treated as open custody before
any issue; corrected to the pinned schema's reconciledterminal/ACK predicate,
preserving all history. Independent final ACCEPT a6dfc6ad; issue5358a369.

Next Edge-owned activeSTREAM-only revoke is coordinated via the exact official
Core helper/hash to avoid two independent dispatches. Core owns final READ and
session cleanup, Edge owns sourcehead/28446 retirement. Clean restart will not
be called UNKNOWN/lost-ACK recovery: startup reconstructs recovery registry but
does not itself replay pending operations. No silent admissioncap/windowchange.

### Incremental independent Claude review,05:05–05:21UTC

Peer ec228e53 delivered CR02/03. CR03 ACCEPT(source/focused):42materializer
tests pass; a duplicate independent execution is NOT84coverage. CR02 remains
CHANGE: mutable last_error_code/revision resets repair count if live failures
interleave, allowing RETRY_1 indefinitely. Exact producer request and minimum
interleave/restart/fencing PostgreSQL gate sent to Claude's review-return file.
CR04 independently123/123PASS; diagnostics1328d1b7 and SQL-mode6da309df plus
staticgate9810f8ef accepted, not installed in the frozen Core73435311 image.
CR01 still open; no blanket acceptance or frontend overwrite.
