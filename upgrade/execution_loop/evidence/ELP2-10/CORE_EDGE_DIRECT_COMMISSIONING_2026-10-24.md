# Direct Core ↔ Edge commissioning — 24 October 2026

## Scope and actual result

Bobby requested direct SSH implementation/commissioning on HK, not another
request-only round. This follows [the preceding source receipt](CORE_CANDIDATE_COMMISSIONING_2026-10-24.md).
Primary integrated the isolated Research candidates; three existing helpers
handled disjoint source preparation, financial implementation and independent
review. No frontend, remote Git push, stable/dev/main, provider28445, command
or Live change. No permissions were inferred from a TLS certificate or ADMIN.

**Actual isolated installation/exercise completed and was retired cleanly.**
Core and Edge connected over TLS1.3/mTLS through a dedicated SSH tunnel. Real
unauthorized/malformed requests were refused. This is machine transport and
fail-closed commissioning, **not a positive business READ, STREAM or six-phase
acceptance**. Shared Research preview is still on its preceding image.

## Pins and runtime facts

| Surface | Exact pin / disposition |
| --- | --- |
| Core source packaged | `docs/research-loop-plan@664433587050ab8673fa03318a5e74d8b33b146d` |
| Compiled production closure | 672 JS/JSON files; aggregate SHA256 `e8e9d9b16c4f5a94e7301647514d56c7d0f69a90a1f3dce3e987610bd9862435`; preceding production-build receipt reused, not a new compilation claim |
| Actual candidate image | `sha256:50939bb5784b58b0bc68121c4920c703abf208da7dfba74541934fe53e48e9b2`, 69,471,201 bytes; COPY-only package, not final R2 image |
| Core private runtime config | SHA256 `a76f23816b93c5e22ec0b99ab1c534d3e6b389e4f34bcc02dad318eb5e3b206d` |
| Owned Edge source at exercise | `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024@8b010874af2237cddb3ad32c6c8083b2e0a52a56` |
| Actual Edge executable | SHA256 `3e0c4e53a06aa99b0b336de31c43201a7b839e1f0cd4bddbdc60ee628c003b03`, mounted in the existing pinned image; not falsely described as a new image |
| Edge runtime config | SHA256 `cf142e9d57e79237f9ce53601c09e18b560ad0075960e70cadb9a911f5550270`; retired finite config, not reusable READY |
| Source preparation script | SHA256 `d2acc89aa53c5880afa879786afb17ea122dc54864a4a5b07a2707f1677bbca5` |
| Native machine trust | Manifest SHA256 `95d892e9394dc71a808f722b35390b4277caebd8eb6296a1f13ca44c91f156e0`; existing fresh candidate trust, not a human grant |
| Actual Core target | DB `portal_control`, role `portal`, system ID `7688673963308855330`, owner `usr_5a38d5dfb08b44748f5776fbe04a1434`, existing workspace `ws_06G19F61YB8CFR7TEWMS7HQ660` |
| Peers preserved | Active Edge `8727e5303b1815d54bc2bdcb927a55457ff4da5b`, PM `6f474c72088f000a198a73324ad3083236f2bf5c`, including their WIP; Claude clean `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` |

The literal `research-workspace` is **not an existing Core workspace**. Corrected
private commissioning metadata to the actual workspace above; physical source
workspace remains `workspace_execution_manager`. This is an explicit binding,
not renaming source authority, copying stable rights or changing public DTOs.

Actual read-only source preparation kept all **722 physical ACCOUNT rows**:
196 account, 341 balance, 185 policy, four selections, original per-grain IDs,
payload hashes, source time, epoch and cycle. Source epoch
`01a05c70-81ec-7380-801d-45c706f937c0`; original source timestamp
`2026-10-20T13:31:29.218Z` was not replaced by fresh observation time. Private
DSN retained `verify-full`, source DNS and exact CA, without a plaintext bypass.
Publication metadata remained explicitly **UNAPPROVED**; reading source bytes
does not independently approve the census or the caller's access to it.

## What actually ran

| Check | Actual result / limit of proof |
| --- | --- |
| Core startup | Real AuthService, AccessService, ReadScopes, registered DB identity and CurrentViewCoreComposition; private listener `127.0.0.1:28664`; zero sessions/grants issued |
| Edge startup | Actual `core-manager-current-check` exit0 and isolated serve process; mTLS callback points to the real Core composition, no accepting test provider |
| Core → Edge | Actual TLS1.3 request without bearer/context returned **404** `RESOURCE_NOT_AVAILABLE`, `execution.scoped-error.v1`; not a positive data read |
| Edge → Core | Actual mTLS POST with invalid `{}` context returned **400** `CURRENT_VIEW_REQUEST_INVALID`, `portal.execution.current-view-error.v1`; no fabricated principal |
| Shutdown | Core emitted `DRAINED`; Core and Edge exit0, OOMfalse; both owned containers and dedicated tunnel removed |
| Image hygiene | Tiny no-network read-only container confirmed compiled app exists and no `/private`, runtime env or temporary TLS/signing key is baked into this image; new ordinary intake is not in the already-packaged image |

Each service used 0.75 CPU / 512 MiB / pids128, read-only root, dropped
capabilities and non-root user; combined 1.5 CPU / 1024 MiB, below the approved
2 CPU / 1536 MiB / 300-second correctness envelope. Only loopback candidate
ports28664/28665 and the dedicated SSH forwards were used. These are imposed
limits, **not measured production budgets or coexistence/G2 PASS**.

Initial HK launch failed because its private files belong to UID1001 whereas
the copied launcher specified UID1000. Retake used actual HK UID/GID1001:1001;
no permission broadening or guard weakening. First capped BuildKit attempt
could not resolve a local-only base digest; the local COPY-only build then
succeeded with no network/pull. Its first context included local private input
files, but the Dockerfile copied only `dist/`, no secret was sent to an external
builder/registry, and the actual image hygiene check passed. A strict allowlist
`.dockerignore` was added before any further build. Do not claim the initial
context itself was secret-free.

## Current policy investigation and missing implementation

Read-only checks on the **actual** Core workspace found 13 policy events and
seven stored grants. All seven are `portal.manager-domain-grant.v1`, with
zero currently unexpired/unrevoked grants. Preserve this history. The preceding
zero-row query concerned the non-existing literal `research-workspace`; it
does not establish absence of history in the real workspace.

Existing native Manager grants are neither ordinary entity roots nor implicit
`business.read_all` for the Accounts census. The actual Accounts BFF requires
complete independently published population authorization. Do not weaken its
guard or reattach an expired native grant to make the new read pass.

Concrete remaining bridge: the source must retain/verify the original root
membership receipt and hold current mapping/membership through Core COMMIT,
with exact ACCOUNT correspondence, or commission a separately accepted complete
population protocol. PM's `PinnedCurrentAccessInstaller` is financial portfolio
current-access, not a Core ACCOUNT root receipt. Its native observation helper
explicitly cannot authorize SERVE/COMMIT. This is missing implementation and
source qualification, **not another request for Bobby to re-approve login**.

### New Core ordinary-policy intake

`src/execution-v2/ordinary-policy-intake.ts` composes the **existing** official
policy writer using the same real pool, registered Research schema, coordinator
and source provider. Root-owned0600/hash/O_NOFOLLOW private artifact, exact
target/owner/principal/workspace, bounded Paper grants, no embedded TS receipt,
no onward delegation/native authority import. Constructor installs nothing.
Economic roots still need the independently held source receipt. A callback's
presence is not qualification; null verification continues to refuse reads.
ACK explicitly means `POLICY_INSTALL_ONLY`, never commissioned READ/STREAM.

Source/test commit **`bac63eec4`**: two code/test files +316/−0 and one
machine-readable verification record +71/−0. Strict affected production module
**and its actual transitive dependencies** compile PASS exit0 using the existing
production options; no declaration stubs or runtime guard were substituted.
No intake artifact/policy/grant was installed in this round.

### Concrete financial source proof, not an accepting callback

Owned PM candidate now contains an Ed25519 output signer and independent
verifier, composed into the actual original-publication authority wrapper.
Owned Edge contains the corresponding concrete `SourceProofVerifier` for the
existing financial runtime. Closed financial purpose differs from identity JWT:
exact original manifest/binding/generation, receiver, kind/input digest and
group/chunk association, canonical encoding, millisecond expiry ≤30s. No
generic sign-caller-bytes service, fixture key or identity-purpose fallback.

PM R1 commit `02174b3ff947dc5185c8fb641c55034329d2300d`: two files +490/−0.
Edge R1 commit `8183b22e174e97ac13cb8f8661beecb3c5cfc96d`: four files +621/−2,
including production dependency promotion and actual verifier registration;
Cargo.lock unchanged. Both owned HK candidates are clean. Source totals this
round: **8 code/test/build files +1427/−2**, across Core/Edge/PM; the JSON
verification record and Markdown are counted separately, not as more code.
Independent review ACCEPT applies to **SOURCE_ONLY / PROPOSED Research wire**.
It does not approve trust or claim genuine APPLIED. Authentic receiver
checkpoint/status after physical COMMIT and idempotent same-original source
ACK still need their actual provider binding; factories have no accepting
defaults. No new financial key, source policy, runtime mount or fake receipt.

## Verification, reuse and cleanup

Verification tier **R1**, campaign§10.10c: intermediate source only, no push or
final ff-landing/R2 certificate. Existing unchanged 82 bootstrap/recovery,
19 real TLS and40 real-PG receipt remain reusable at their exact preceding
pins; they are not added to this round's test count. No browser/full-load gate
was run against the uncommissioned authority.

- New Core intake: **31/31 focused PASS**, explicitly schema/filesystem/writer
  doubles, not real policy installation or source acceptance.
- PM isolated suite: **128/128 PASS**,43new proof tests +85 unchanged original
  wrapper/authority/endpoint regressions; pinned SDK2.4.0; read-only/no-network,
  2 CPU/1536 MiB/pids128/300s, temporary container removed. Transcript SHA256
  `8d962b4d04d3af0a9f8a10cf4a292e1e1f1c78caeaf6c9917633c81dae85b082`.
- Full production tsc attempt150s timed out124; bounded retake293s exhausted
  the1450MiB Node heap, exit134. **Neither is PASS.** No increased production
  budget or full-test rerun was used to hide this. Narrow affected compilation
  with real transitive dependencies then **PASS exit0**; this does not erase
  the full-project resource failures.
- Rust **11/11 PASS**, real Ed25519/Python cross-language vector and actual
  runtime-trait composition; production `clippy --lib --bins -- -D warnings`
  PASS. Compile16.93s, tests0.12s, Clippy12.82s; offline/read-only source,
  2 CPU/1536 MiB/300s cell removed. Log SHA256
  `6d215077314e3f51647e885c9d5921a9cd2499f9b3c4fde3ebc0312dd78295d3`.

[Machine-readable dispositions](CORE_EDGE_DIRECT_COMMISSIONING_2026-10-24.test-results.json)
retain failures and positive/negative scope separately. No counts from this
round are combined with older receipts to manufacture new coverage.

Private operator evidence retained at
`/home/bobby/secure/core-edge-current-install-20261024-jkBGy6PN/`:
public preparation/runtime/config/terminal/request/response logs and exact
compiled-file inventory. HK retired candidate evidence:
`/home/bobby/secure/core-manager-current-install-20261024-jkbg-r2/`.
Public code/config pins above contain no secret values.

**Cleaned:** three local transient copies (runtime env, TLS key, signer key)
after matching retained originals, plus eight HK transient DSN/combined identity/
TLS-key/cursor-key copies across initial and retake directories. Shredded only
these named leaves; do not recover/reuse them. Original approved trust keys,
source rows, expired grant history, custody and audit remain intact. Original
fresh native trust is retained under its existing finite expiry, not active
source authority. No broad directory deletion, volume/image prune or peer WIP
cleanup. Image and sanitized logs retained for reproducibility, Core-owned.
Post-cleanup read-only capacity: SGP621GiB total/411GiB used/210GiB free;
HK484GiB total/324GiB used/161GiB free (both67%). No owned candidate container
or28664/28665 listener left; both owned HK source worktrees clean. Capacity
disposition **NO_ACTION_NEEDED** for retired test cells; retained exact image,
public evidence and finite original trust have Core ownership/expiry.

## APPLIED receiver and command assembly follow-through —14:18UTC

Continued direct implementation on the owned HK candidates, not another
request-only packet. PM source **`d9d132dbcd51cb345ba0465fd03cb8df88691f40`**
adds two files,+473/−0. Edge source
**`bd2f42d1de40523f1de79575a2c4b39b35c2b34f`** adds/changes nine files,
+1580/−16. This follow-through is **11 source/test files,+2053/−16**, separately
from the preceding proof/intake packages and Markdown. Both owned HK worktrees
are clean. Intermediate R1 scoped commits follow campaign§10.10c; no push,
shared-branch integration or final R2/hook/installation claim.

### Genuine receiver checkpoint instead of an accepting APPLIED callback

- `projection-store-pg/src/bootstrap/financial_receiver.rs` looks up only an
  **existing** exact original, writer fence, manifest/limits and cursor. No
  INSERT, `bootstrap_begin`, new generation or synthetic receipt. Even its
  read transaction must physically COMMIT before returning the actual receipt.
- `edge-service/src/financial_receiver.rs` composes the concrete financial
  signature verifier with that store primitive. CONTROL purpose/window is
  checked before and after DB I/O and before response; full raw-request digest
  is correlated. APPLIED means receiver projection checkpoint, with
  `business_applied:null`, not source ACK, economic application or a human grant.
- The explicit default-off receiver uses a **separate TLS1.3/mTLS listener**,
  PM CA plus exact PM leaf, finite bounds and concurrency/deadline/body limits.
  Existing Core-only listener/client roles are not broadened. No listener,
  certificate, signing key, grant or source authority was installed.
- PM `report_publication_receiver.py` supplies actual CA/hostname/leaf-pinned
  HTTP transport and the original-authority composition, no redirects,
  environment proxy, permissive TLS, alternate transport or accepting default.
  It renews the original source before the check and validates expiry after I/O.
  Review corrected exact-clock-equality rejection; a few elapsed milliseconds
  are now valid, while backward/future/stale time is refused.
- The actual existing `BootstrapReceipt` serializes **generation/cursor only**;
  internal revision has `#[serde(skip)]`. Independently verified this fact and
  locked it with a shared Python/Rust vector, without inventing a revision DTO.
  Current checkpoint must exactly match the requested cursor. An advanced
  checkpoint is conservatively refused, **not historical ACK proof**.
- `original_acknowledge` remains a distinct required source callback. Its
  durable implementation/accepted source binding is still missing; this new
  status client does not invent a source ACK ledger or alias APPLIED to ACK.

### Actual command constructor, still new-send OFF

`edge-service/src/core_command_runtime.rs` now assembles
`PgPmCommandContext → PmHttpCommandPort → DurableCommandRelay::with_control →`
the existing ORIGINAL handler. One process-owned admission and private OFF
send-control are shared across requests; no public enable method, new HTTP
wire/route/listener, migration, service-recovery impersonation or current-actor
cache. Authenticated original scope and request-specific current command
authority/issuer are mandatory. READ/financial trust is never a fallback.

Extended the existing genuine disposable-PG/mTLS test to call this actual
constructor for STATUS and revoke, not another manually assembled relay. It
observed exactly the original TEST_ONLY SUBMIT then STATUS, no third HTTP after
revoke, unchanged original custody, and OFF refusal for an entirely new
original **before any row, issuer call or HTTP**. Source reply/current authority
in this test are explicitly TEST_ONLY; this is not an actual PM capital command.
The production current-command issuer, accepted Core→Edge gateway mapping and
independent SERVICE recovery are not supplied by this constructor.

### Focused gates, initial failures and reuse

- PM **158/158 PASS**:30new receiver cases +128 direct proof/authority/endpoint
  regressions. This supersedes that earlier128-case run for this retake; do not
  sum repeated cases as new coverage. Transcript SHA256
  `3f8c55483c1a381a238c8f332a697face5fec4630045ecbdd1a33fe17a10e1e6`.
- Rust **19/19 PASS**:8command composition,6financial receiver,4actual-PG
  checkpoint/restart/fencing,1actual constructor PG/mTLS STATUS/revoke/OFF
  regression. Transcript SHA256
  `caa20f2e5e1c7027f11f6202ae488be1ef4b93f61a65fbd58d3127cdaa3a365d`.
  That combined script then failed strict lint; the19 tests remain PASS,
  **the combined script exit101 is not an overall PASS**.
- Initial DB launcher caught PostgreSQL's temporary initialization socket,
  then found it restarting; no Rust test ran. Corrected readiness to final TCP
  service and removed both owned cells before retake. No lowered test gate.
- Production Clippy first caught a wildcard import, then the replacement's
  unused import and a doc-backtick warning. All initial failures retained.
  Corrected imports/docs only; strict `clippy --lib --bins -- -D warnings`
  **PASS**,13.36s; final log SHA256
  `16b22c8fea57f2af0b8b714495f8a10ed33af885d3df57830bb2f5e25576f470`.
  Final explicit test-import compilation **PASS**,15.03s, log SHA256
  `043c3b988e8901f57aa5f1fb693297895347ff1bc44213f53ae43cdee1f2f4d1`.
  No repeated database/crypto suite for import/documentation-only corrections.
- Independent source review ACCEPT; primary additionally reviewed clock,
  serialized receipt, genuine checkpoint and command admission/custody seams.
  All nine final local/HK Edge files compared byte-for-byte by SHA256 before
  commit. No generated public contract/type/layout/baseline changed.

Tests used existing pinned images, offline SDK/Cargo caches, serial cells.
PG0.5CPU/256MiB + Rust1.5CPU/1280MiB remained within the combined correctness
envelope; runtime sample (not a peak/SLO) Rust85.41%CPU/83.19MiB and
PG50.02%CPU/85.05MiB. Production lint/import-only compile used a separate
no-network2CPU/1536MiB cell. Each invocation bounded300s. All named test/lint
containers removed; disposable PG tmpfs removed with its container. No key,
session, grant, source row, shared service or volume was created/changed by
this follow-through. Retained source cache/transcripts remain Core-owned;
capacity SGP210GiB free/HK160GiB free, both67%used: **NO_ACTION_NEEDED**.

### Remaining source implementation, not a generic window wait

Ordinary Accounts still needs the actual held original membership/root bridge:
PM `native_relations.py:428–595` checks the command/membership lineage, but its
observation explicitly cannot authorize SERVE/COMMIT. The held business-read
provider is a collection purpose, **not entity ROOT_SCOPE**; its SQL fence does
not cover memberships, membership revisions and receipts. A five-table held
dependency closure and exact Core-root/resource-census correspondence still
need implementation/qualification. The722 raw source rows are not an
authorized complete-population census. This investigation does not replace
current rights with a native historical grant or an accepting callback.

**Backend next:** implement/qualify that original root bridge; bind independently
accepted financial trust and durable original source ACK, then mount/test the
completed private receiver. Gateway current-command/service providers remain
separate from OFF composition. Budget/calibration/coexistence/G2 and browser
acceptance still need the appropriate actual source/configuration; no synthetic
load bounds or source receipt is promoted. No new request was found at Claude's
still-clean pinned worktree. **Claude next:** keep current components/fixtures;
no new public field, enum, client regeneration or UI task in this slice.

## Phase exits and consumer handoff

| Phase | Next actual exit, not an invented external wait |
| --- | --- |
| ELP2-05 | Receiver COMMIT/checkpoint→APPLIED source is now implemented/tested; accept/bind financial-purpose trust and genuine durable same-original source ACK, mount receiver and take actual publication receipt |
| ELP2-06 | Source-held ordinary current membership/complete Accounts authority + independently approved metadata; bind Manager business certificate/audience/profile and exercise actual authorized API |
| ELP2-07 | Actual disabled PG/HTTPS command constructor is implemented/tested; supply current-command/issuer and independent SERVICE recovery, commission accepted Edge-only gateway; do not activate command/Live |
| ELP2-09 | Fresh independently permitted READ/STREAM and current source; positive cache/cursor/SSE/revoke/restart/recovery; separate HISTORY/REPLAY authority |
| ELP2-10 | Freeze compatible image/config/schema, approved numeric workload/budget/calibration, matched coexistence/G2 and real browser consumer |
| ELP2-11 | Integrate qualified source/permissions with applicable DR/rollback/restore/review; reuse unchanged verified backup rather than rerunning it |

**Claude next:** preserve accepted components and rich fixtures; no new public
OpenAPI/type/enum/layout/baseline in this slice. Existing API readers can consume
each actually qualified source independently. No human/browser success may be
inferred from this transport-negative receipt. No new committed Claude request
or consumer ACK was found/invented at the pinned clean worktree.

Rollback is already executed for the isolated runtime: owned processes/tunnel
stopped, temporary private copies retired, shared healthy Research image
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`
unchanged. No migration was required or claimed. **Six phase exits stay open.**

## Held native membership bridge —15:34UTC source delivery

This additive source delivery supersedes only the earlier statement that the
membership fence component had not been implemented. It does **not** supersede
the outstanding complete Core-root/census qualification or claim runtime install.
Core base remains `05c88880443569d995ac0a6414481e75a04d6d37`; Claude remains
clean at `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`, no new committed intake.
Owned Edge remains clean at `bd2f42d1de40523f1de79575a2c4b39b35c2b34f`.
Peer PM `6f474c72088f000a198a73324ad3083236f2bf5c` and Edge
`8727e5303b1815d54bc2bdcb927a55457ff4da5b` retain their unrelated WIP.

### Implementation and immutable source pin

On HK, owned PM worktree
`/home/bobby/.worktrees/pm-core-financial-assembly-20261024`, branch
`feat/core-financial-assembly-20261024`, commit
**`63e1464c50f0598a21db62e874dae04200cb70d8`** contains five files,+569/−8;
four executable/test/SQL files account for **+494/−8**, source receipt75 lines:

| File under PM worktree | Implemented behavior |
| --- | --- |
| `services/portfolio_management/native_relations_held.py` | Actual selected native lineage → same-RR dependency closure → physical epoch CAS/COMMIT → existing held-fence terminal lifecycle |
| `services/portfolio_management/native_fence.py` | Explicit optional membership coverage; default original four-table behavior preserved |
| `contracts/baseline/portfolio-account-v1_1/pma11-membership-relations-fence-candidate.sql` | Additive row-key namespaces and write/TRUNCATE guards for membership heads, exact revisions and original receipts; original SQL checksums unchanged |
| `tests/integration/test_pma11_native_relations_held_pg.py` | Actual PG held writes/revoke, restart/UNKNOWN, selected lineage, operation and drift negatives |
| `upgrade/CORE_NATIVE_MEMBERSHIP_FENCE_RETURN_2026-10-24.md` | Exact source/log/resource pins and uninstalled-source handoff |

The constructor requires explicit **READ or MUTATION**; a read does not silently
become mutation authority. Native inspection remains SELECT-only. Exact subject,
issuer/workspace/environment/request/selection binding precedes admission. Missing
or denied lineage, dependency overflow/collision, wrong terminal family and
schema/function/guard drift refuse. Original acquisition/semantic revision stays
stable through lost issue response, cancellation, restart and UNKNOWN; expiry
does not manufacture ROLLBACK or a fresh intent. Selected native dependency
writes remain quarantined until the matching original terminal.

The additive SQL is **UNINSTALLED**. Its future function/catalogue hashes must
be reviewed, not automatically accepted. No existing migration was rewritten,
nor was a Core schema version applied. Component capability is explicitly
`NATIVE_MEMBERSHIP_FENCED_NOT_CORE_QUALIFIED`: accepted Core policy/install/grant,
mapping and complete resource-census inputs remain separate held authorities.
The raw722 source rows are still not an authorized Accounts population. Test
Core terminal signatures/census inputs are TEST_ONLY, not a real Core COMMIT.

### Focused gate and review disposition

- Final **18/18 PASS**,12.33s:11 new held-membership cases plus7 existing
  native-reader cases. This supersedes the initial16-case run, not16+18 coverage.
- Original four-table held regression **8/8 PASS**,7.03s; reused after the final
  freeze because its shared production helper bytes did not change.
- Strengthened real repository-revoke oracle **1/1 PASS**,1.45s, is a repeated
  case, **not a nineteenth test**: revoke fails while held, succeeds after the
  matching terminal, then the revoked original cannot issue another lease.
- Actual SQL/transactions include COMMIT-response ambiguity/readback, restart
  cancellation and UNKNOWN surviving expiry/restart; independent review ACCEPT.
- Final log SHA256 `e76a499f324394972504e17a36d9ca1153384c693ca4a9b74933da6ee59b8cec`;
  legacy `7c09cd82e4ebf0bf415d686baa9524a4b1550c0bdfaeefa4dd29ca42293bda1c`;
  strengthened revoke `da2232e25d87016b5d5c7d6f7d59aa370262d640db2d1ef6cb88a9fd71f78505`.
  Logs remain on HK under `/tmp/core-membership-held-*-20261024.log`.

PG0.5CPU/256MiB plus runner1.5CPU/1280MiB stayed within the combined approved
2CPU/1536MiB/300s correctness envelope, pinned SDK2.4, read-only application
source, no host ports. All named containers/internal network removed after
exit0, no OOM. Initial serial invocations omitted the advisory heavy-lock;
inventory showed no competing owned gate. Final18-case gate used
`flock -n /tmp/portal-heavy.lock`; this does not retroactively claim the initial
invocations held it. No peer workload was stopped or modified.

**Next backend:** compose this actual component with independently accepted
Core-root/install/policy/census providers and exact original authenticated
transport. The component is no longer missing; collection READ still cannot be
renamed entity ROOT_SCOPE. **Claude:** no public DTO, enum, generated client,
component or visual change; keep the accepted fixture/reader and require actual
qualified source before claiming a positive Accounts/current-human lane.

### Command provider audit — exact implementation still required

Reused unchanged constructor/PG/mTLS receipts; no duplicate gate was run.
The audit of Core `execution-v2/command.store.ts:8–15,80–82`,
`edge-command-adapter.ts:55–65`, `edge-command-gateway-binding.ts:29–37`
and PM `pma11-14-edge-command-transport.json:21–23,65,89–98` establishes:

1. Core retains Portal intent/auth/status, not the authenticated Edge physical
   original and exact PM wrapper bytes. A caller-provided reference/hash wrapper
   would not repair this. Implement an owner-accepted original/delivery registry.
2. Current-human issue commits before signing; lost issue/sign response can
   leave a genuine lease. Add **command-specific one-view issuance custody**
   bound to the same original/delivery/acquisition. Reissuing is not recovery.
3. Command current permission/publication is independent of identity and
   CURRENT/HISTORY/EXPORT/STREAM/REPLAY or financial snapshot/page/delta purposes.
   Supply its actual command issuer/provider; never reuse READ or financial trust.
4. Existing PM exact submit/status wire is HUMAN-only. SERVICE recovery remains
   separately NOT_PUBLISHED, not supplied by the human identity recovery server.

These are concrete source-authority gaps, not merely a scheduling/window wait.
The genuine Edge constructor already composed under private new-send OFF stays
unchanged. No command/Live, gateway or upstream runtime is enabled by this audit.

## Durable original source ACK —15:40UTC source delivery

Owned PM commit **`740f313583be6f91c38dd02a359777eb02aad54a`** adds exactly
two files,**+666/−0**: `services/portfolio_management/report_publication_ack.py`
(244 lines) and `tests/unit/test_pma11_report_publication_ack.py`(422).
R1 focused source commit, independently ACCEPTED; no push, install, credential,
schema change or economic write. Existing PM `source_change_receipts` and
`SourceChangeJournalTransaction.claim_receipt` are reused, not a new financial
ledger or generation. Source SHA256
`90472c64e02b5f9a82380cfb3122cab7f9468a29aa5593b64cbeaa327f41a919`;
test `78844f5824a016d819baef0397791355e0333edc10e53f14d6116578e797abc7`.

### Persistence, ambiguity and authority boundaries

- Receipt identity binds the exact receiver, original source/binding/manifest,
  generation and complete opaque cursor; payload also binds the selected source
  publication descriptors and resource selection. Existing cursor wire remains
  **generation/cursor only**. Uniqueness/conflict checks use the real SQL writer.
- Success returns only after physical transaction COMMIT **and** pool release.
  A lost callback response retries the same key/row; restart recovery neither
  creates a HUMAN lease/intent nor rereads publication data. Missing durable
  metadata explicitly refuses recovery instead of asserting ACK or APPLIED.
- The first ACK internally checks immutable publication integrity and the real
  complete transaction-group boundary. Its separately installed source-owner
  metadata-ACK purpose must therefore authorize **bounded internal integrity
  SELECT plus receipt INSERT**, not just descriptor access. The constructor's
  install pins are not source-owner approval, HUMAN authority or a runtime grant.
  No such purpose/privilege/trust binding was commissioned by this source test.
- Existing public `ReportPublicationAuthority.acknowledge` keeps source/HUMAN
  renewal and genuine receiver APPLIED **before first ACK**. Metadata recovery
  is a separate private owner-custody operation. It must run before a consumed
  assertion could otherwise be reused; absence cannot be turned into success
  or an accepting callback. Source ACK does not mean economic/business APPLIED.
- Independent review found caller-owned cursor mutation across `await`; the
  returned generation/cursor now comes from the validated pre-await identity.
  Primary review also found unbounded semaphore admission; queue acquisition
  now has the declared finite timeout and cancellation-safe release.

### Focused proof, precise scope and cleanup

Final **32/32 PASS**(28 unit +4 actual disposable PG),0.98s. A strengthened
existing PG visibility case then **1/1 PASS**,0.86s; not a33rd unique case.
That oracle uses a distinct physical asyncpg connection/PID to observe the
committed receipt. Other PG cases cover same-row restart after discarded
callback response, rejected partial-group rollback and concurrent same-key
uniqueness. Unit doubles inject ambiguous COMMIT/release, binding/conflict,
caller-mutation, bounded busy and cancellation paths.

The PG tests use the actual existing SQL receipt writer and compatible receipt
table constraints with **synthetic publication projection**. They do not
qualify the full source schema/financial authority. Response-loss PG proof is
at the callback-response boundary after COMMIT; it is **not an injected network
COMMIT-ack loss**. Initial29-case gate was superseded by the final32 after the
two source corrections; repeated cases are not additional coverage.

Pinned existing PM image
`sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`,
PG `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`,
SDK2.4. No image was built/pulled. PG0.5CPU/384MiB plus runner1.5CPU/1152MiB,
combined2CPU/1536MiB/300s; PG network-none and runner only its private namespace,
no host ports. The named one-off PG job held the HK advisory heavy lock and
released it before docs/review. Both owned disposable containers removed.

Local retained log
`/tmp/elp211-pm-financial-20261024.H8yK84fv/financial-ack-pm-focused-20261024.log`,
SHA256 `8ad87c2fdbc812fb83ddf13887edcd94f34196a62416b1f6b9bb8ad780213540`;
runner `/tmp/run-financial-ack-focused-20261024.sh`,
SHA256 `b5b278fb06d40b76ed8bb9d2c32eb23a63701f592ffb2d45407888bdae31e622`.

**Runtime/consumer verdict remains OPEN.** Source has a real durable ACK writer,
not an accepting lambda, but this alone does not install financial source trust
or prove a complete original publication over the real receiver. The concrete
factory wiring is a separate following source slice; its final pin and test
result must be recorded before claiming even that source composition delivered.
No new public contract/enum/generated type/UI work is requested from Claude.

## Concrete ACK factory and round closeout —15:44UTC

The previously outstanding **basic callback wiring is now implemented**, not
left for an accepting callback or a future helper. Owned HK PM commit
**`d7b1bdc707829c47356cf0f8cebf85ea0a3023a2`**, two files,+265/−2:
`services/portfolio_management/report_publication_receiver.py`(+79/−2) and
`tests/unit/test_pma11_report_publication_receiver_composition.py`(+186).
Independent final source review ACCEPT. The only post-test source change was
the module's stale introductory docstring, not executable behavior.

`compose_durable_receiver_checked_authority` creates exactly one actual
`OriginalPublicationAcknowledgement` from the same bootstrap/intent/receiver/
manifest and required `SourceAcknowledgementInstallation`. It passes only
that provider's `.acknowledge` into the existing checked receiver authority.
The typed holder contains the unchanged actual `ReportPublicationAuthority`
plus a **separate private** durable-recovery handle. It mounts no route and
supplies no callable fallback, synthetic assertion, default trust or grant.

The public order stays current-source/HUMAN renewal → genuine receiver APPLIED
→ durable source ACK. The owner-authenticated original custody path may recover
an already committed exact-original ACK privately **before** trying to reuse
a consumed assertion. Missing metadata remains explicit; any normal retry
requires freshly valid source authority, not a new publication intent or lease
fabricated by the recovery function. Installing this custody composition and
its exact source-owner purpose/privileges/trust is still real commissioning
work, not completed by a Python constructor or its fixtures.

Focused **51/51 PASS**,1.96s:21 new concrete-composition cases plus30 original
receiver regressions. Correct source→APPLIED→ACK ordering, same provider/original,
missing pins/providers, wrong receiver/source/manifest, separate metadata-only
recovery, no public fallback and original error propagation all covered.
Network/SQL/source fixtures are TEST_ONLY; this suite does not claim genuine
HTTP, HUMAN, PG or connected financial authority. The preceding actual-PG
receipt is reused unchanged; no second PG/full gate was run for this wiring.

Source SHA256 `69d635f69bda9300858da2939ad14fe1b0acaa5b98bd09c121cc4011879dc068`;
test `cafcb3be31acdb6f508a2107f75ef46ef3c411c8c9fe564c2f2e0ebbd4d160a4`.
Local log
`/tmp/elp211-pm-financial-20261024.H8yK84fv/financial-receiver-composition-focused-20261024.log`,
SHA256 `ea0228fc5cf7e3f3a84d73e9c66eda76448b30dd4acfb8008a55772a386ccf2e`;
HK runner `/tmp/run-financial-receiver-composition-focused-20261024.sh`,
SHA256 `a343b07215fe29737bee7b9a272cccc2f16bd78fe2045ba456bd4134c850ed67`.
Pure-unit no-network2CPU/1536MiB/300s cell removed; no PG/heavy lock or new
image build/pull. Resource figures in these new membership/ACK/factory lanes
are configured **ceilings**, not measured peaks: CPU/RSS peaks NOT_MEASURED;
no performance/coexistence/G2 conclusion is drawn from correctness timings.

### Exact round inventory and current phase exits

This round's PM diff `d9d132db..d7b1bdc7` is **9 unique files,+1500/−10**,
including75 lines of PM source receipt. Executable source/SQL/tests alone are
**8 files,+1425/−10**. It comprises63e1464c,740f3135,d7b1bdc7; do not count
earlier APPLIED/command deliveries again. All three are **intermediate R1**
source commits; final integration/normal-hook landing remains NOT_RUN, not R2.
Core source/base and UI are unchanged by these commits; only this public
receipt, its machine dispositions, Unified and sync are updated on Core.
Core JSON evidence is R1; Markdown records are R0. JSON parse/unique-lane and
link/anchor/diff checks PASS; `scripts/execution-tracking-test.sh` PASS.
Core machine-evidence commit `255f12bf10b11779cced74940cf5bad7c74676cb`
records these source-only results on `docs/research-loop-plan`.
No full build/hook was repeated for recording evidence.

Read-back at15:44UTC: owned PMd7b1bdc7 and Edgebd2f42d1 trees clean, new
named membership/ACK cells absent. HK152GiB free/69%used; retained original
trust, source/audit/custody, source caches and public transcripts remain intact.
No broad cleanup, shared-preview image/config/schema update, new session/grant,
UI change, push, stable/dev/main/provider28445, command or Live operation.

| Phase | Actual delivered source versus exact next backend action |
| --- | --- |
| ELP2-05 | Concrete receiver/APPLIED and durable source ACK + factory exist. Install accepted financial-purpose trust, metadata ACK/integrity privileges and authenticated original custody; take actual source publication→receiver COMMIT→source ACK receipt |
| ELP2-06 | Native selected-membership held component exists. Compose accepted Core policy/install/grant/mapping and complete resource-census authorities over exact original transport; then Manager certificate/audience/profile and authorized Accounts/Portfolio/Exposure API acceptance |
| ELP2-07 | OFF PG/HTTPS constructor exists. Implement authenticated original/delivery registry and command-specific one-view issuer custody/current-command provider; separate SERVICE recovery contract and commissioned Edge-only gateway; do not enable command/Live |
| ELP2-09 | Independently permitted fresh READ/STREAM and qualified source binding; actual cache/cursor/SSE/revoke/restart/recovery. HISTORY/REPLAY remain separate rights |
| ELP2-10 | Integrate compatible source/image/config/schema only in its allowed lane; approved numeric budget/calibration, matched coexistence/G2 and real browser acceptance; no shared-preview runtime update authorized in this round |
| ELP2-11 | Qualified cross-source permission/data migration, applicable restore/rollback/DR and final review manifest; reuse unaffected valid receipts, no release/deploy claim |

**Claude handoff:** no public BFF/OpenAPI/generated type, enum or UI binding was
changed in this source round. Keep accepted components and rich fixtures; do
not redo them or label source-only assembly a live consumer success. Consume
each source once independently commissioned and record actual image/config/
schema/authority pins in the browser receipt. Claude's clean00e7f6cf remains the
last observed source; no new request/acceptance was invented. **Backend next**
is accepted original/root/census/provider composition plus purpose-bound source
commissioning, not reimplementing these completed fence/ACK helpers. No extra
Bobby decision is invented for the source implementation already approved.
