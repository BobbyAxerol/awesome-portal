# Edge → Core — original08 acceptance handoff, 21 October2026

Status: **REQUESTED / AWAITING_OWNER_RETURN / FULL08_NOT_MET**.
Bobby requests this handoff so Core can finish its part and Edge can continue
acceptance. This consolidates the existing Core009/original08 task; it is not
a new phase, replacement ledger, release or blanket runtime authorization.
Read cut:21Oct11:25UTC /18:25Asia/Saigon. No secret values belong in this file.

## 1. Correct checkout, current truth and reading order

| Boundary | Owning source / readpoint |
| --- | --- |
| HK Edge | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, `feat/execution-edge-upgrade-v1_2@d52f156d1ec68d3ff3b1671d9fa5b448460e4cb9` |
| HK main plan | `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#epg10-08-core-acceptance-handoff-20261021` in that checkout |
| SGP canonical Core | `/home/bobby/portal-research`, `docs/research-loop-plan@7818d5631e0da37563bca5715fd46d40b66ef1de`; preserve WIP |
| SGP frozen Core candidate | `/home/bobby/portal-core009-integration`, `chore/core009-connected-20261021@734353113d8bec85f78b35ab81c9c1a40e93a67e`; source/index owned by the current PM/Core operator |
| Existing Core task | `upgrade/execution_loop/evidence/ELP2-10/EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md` in canonical Core |

Read Core `AGENTS.md`, `upgrade/execution_loop/AGENT_WORKING_RULES.md`, and its
Unified current ELP2-10 entry, then the following existing owner packets there:

1. `CORE_C7_OWNER_COORDINATION_2026-10-21.md`: one-writer ownership and exact
   recovery custody; do not use its historical controller as a fresh live pin.
2. `CODEX_REVIEW_AND_OWNER_FOLLOWTHROUGH_2026-10-21.md`: latest gate/harness,
   image-swap helper and actual client-pause requirements; refresh before use.
3. `CORE009_STREAM_DRAIN_RECOVERY_2026-10-21.md` and
   `CORE009_RECOVERY_ONLY_WINDOW_REQUEST_2026-10-21.md`: original same-key duty.
4. `CORE009_MANAGER_PKI_OWNER_REQUEST_2026-10-21.md`: separate Manager data trust.

Independent11:25:25 observation: installed Core container4095af12 still uses
image`sha256:9cf5fffac3e0bf55ea4b23c9df2b85565da556b973fbb1ce6928936f49a2950c`,
Compose config`423573a8e40e5cd5fbc552078d13a170713c449ea927478fdf9815a1b0e56db0`,
running/restart0. This is the old installed base, not the corrected build.
The latest owner follow-through reports R3-1052 exit143/no image, caused by
alphabetic test hostnames violating the native numeric-only DB guard; cleanup
is owner-reported. PM owns the corrected numeric-namespace freeze and retake.
Do not describe source readiness, a controller's disappearance or build-only
readiness as actual normal-hook PASS/installed READY. Repin changing WIP.

## 2. What PM/Core must finish, in existing ownership

1. **PM operator:** finish the corrected, frozen normalR3, coherent source
   commit and conditional image build. Preserve guards/assertions/timeouts;
   return actual terminal counts/exit/log hashes and exact cleanup. Core/Edge
   start no duplicate hook or build; obsolete cells belong to their owner.
2. **Core operator:** review the actual source/image/schema/helper/config pins
   and install only on the already approved isolated Research target. Follow
   the owning runbook's real client-pause/quiescence ACK, root0600 reviewed swap
   plan and post-quiescence backup. Fence all historical dispatch namespaces;
   do not invent `.closed`/pause receipts or touch stable/dev/provider28445.
3. **Core → Edge READY:** return actual installed container/image/start/restart,
   config/schema/helper pins, rollback references and the exact matching
   finite recovery-only window.21Oct10:30–12:00UTC /17:30–19:00Asia/Saigon is
   availability ONLY, not client-pause ACK, installed readiness or renewed
   session/grant/head. If it cannot fit, propose a new finite slot for Edge
   to match; never slide the expired window or force-stop original custody.
4. **Core official recovery:** only after those checks, use the official
   same-artifact/same-idempotency continuation, with original Base/binding.
   Return authenticated source terminal/cancel-unentered and matching durable
   Core ACK. Exit75/UNKNOWN retains custody; no blind new-key retry, forged
   terminal, manual SQL, new ISSUE/ENTER or source-head retirement shortcut.
5. **Joint cleanup:** follow the owning lifecycle's official scoped
   STREAM → READ → temporary-session order. Correlate actual source settlement,
   Core ACK, handler/pool drain and natural physical SDK/process exit before
   declaring retirement complete; do not invent a replacement ordering gate.
   Preserve normal sessions,
   current production grants, business history and rollback artifacts.
   `NOOP_EXPIRED`/expired-session cleanup is not active-revocation proof.

Original immutable recovery identifiers (locators, NOT authorization):

```text
lease=785387ba-ef57-455d-a7ba-f92663baae60
attempt=07becd72-1e11-4ab9-8a96-d5fd7339f1a0
binding=ef98ed112e70b264857d42172b51980661238045ea3e8fa5f1cb0afe480eb69b
source=42f88db9a0195feaf60cbd54c842d30660eba2e22a929bad7a86fd19e5791826
official_stream_revoke_artifact_sha256=d9e3c07deeb1b4851f7906c5184daa753f44dff31b0e092f8c95d87c48411b5f
native_endpoint_port=28446
```

## 3. Return bundle that makes Edge acceptance runnable

Return one owner Markdown in the existing canonical ELP2-10 packet; link it
from Core Unified/sync and copy only sanitized/public evidence to HK original08.
Private configuration, session/token, keys and operator artifact bytes stay in
their approved custody; provide protected references, never values in Git/chat.

| Return | Minimum required evidence |
| --- | --- |
| Qualified source | Full commit; relevant diff/source hashes; normal gate exit/counts/log hash; build provenance; no unresolved changed-path failure |
| Installed target | Immutable image ID/digest; actual container/service; start/restart; schema/config/helper/plan hashes; named rollback; actual pause ACK |
| Operator window | Explicit UTC start/end, scope and Core/Edge matching ACK; scheduling separated from acquisition/authority |
| Original recovery | Same lease/attempt/artifact/idempotency; authenticated source state/terminal receipt and digest; matching durable Core ACK; exact CLI exit and unresolved census |
| Physical cleanup | Handler/pool drain, real process exit, exact temporary grant/session disposition; own resource absence and pre/post disk; retained operational/rollback set |
| Next real read tests | Actual Research user/workspace/profile, current READ and separately qualified STREAM authority, genuine finite session private reference, routes/cursors and coordinated revoke actions |

Partial returns are useful: install/recovery can be returned before unrelated
PKI or financial/source-publication work. Producer delivery is not Edge PASS;
Edge verifies each case independently. Nothing here asks for TS journal/capital
upgrades, new Portal accounts, new architecture or UI implementation.

## 4. Separate all-mode Manager trust — no recovery dependency

Scope is **Paper/Sandbox/Canary/Live**, not Paper-only. Existing data origins
are Paper8443, Sandbox8444, Live8445; Canary uses governed Live facts, not a
fourth TS endpoint/profile. Native28446/Ed25519 is not ManagerRS256/mTLS trust.

Core already holds inactive Research-only signer/client keys on SGP and has
delivered public CSR/JWK. Do not regenerate, reuse stable keys or issue under
an invented/test CA. Core coordinates the genuine PKI/target owner and returns:

- Actual issuer/PKI reference or named responsible owner, signed public client
  leaf/chain, validity/EKU/SAN/SPKI and full public hashes. A CSR is not a leaf.
- Its reviewed per-mode issuer/audience/origin/selector/workload configuration
  and private references; current-policy READ and STREAM remain separate.
- Agreed old/new public trust pins and rollback for the separately reviewed
  three-serving-Edge TLS/JWKS reconcile. This packet executes no such change;
  the native recovery window is not the trust-reconciliation window.

The existing owner PKI request contains full public input hashes. If the issuer
is outside Core's custody, return that exact owner/reference and forwarding
receipt, not another generic request for Bobby to find key bytes. Do not hold
original recovery for this independent data-leg input. No command, capital,
broker or Live-trading activation follows from all-mode read scope.

## 5. What Edge executes next, and what is already done

After genuine current inputs, Edge runs only the eligible existing connected
runner cases: independent source/Core terminal and ACK correlation; physical
exit and cleanup; READ/STREAM positive controls; active stream-only revoke with
unaffected READ; READ revoke across cache/cursor/reconnect/SSE; per-frame current
authority and recovery. Reject stale/wrong-scope/profile/trust inputs. Preserve
real-denial evidence and distinguish expired-session denial from active revoke.
Full08 needs its declared case matrix; scoped PASS never silently closes it.
Command07/08-command keeps its own PM authority-through-COMMIT dependency.

Do not repeat these completed, separately scoped receipts merely for counts:

- Current C5 sourcec6022e03:4PASS/0FAIL/297explicit-filter-SKIP; scoped PG restore
  PASS. SGP `epg10-08-c5-filtered-jkvso0_t/filtered-result.json` SHA256
  `3abdf722d3f8ce8c81973226bc160df9404dad513e482dc9c05ba20f6c44cfe1`.
- Edge d52f156d normal hook130contract/717API/build/PGrestore PASS; actual own
  test resources cleaned. Not Core normalR3/installed/connected evidence.
- Three actual all-mode missing-client-certificate TLS denials PASS, not
  positive Manager READ, active revocation or public Cloudflare/browser proof.

**Done-when for this request:** Core returns the actionable bundle above;
Edge consumes/verifies it and records exact case dispositions in original08.
No new phase or repeat generic phase approval; do not declare09 connected,
10cutover,11acceptance, stable release or the whole master request complete.


## 6. Current READ/STREAM follow-through —21Oct15:45UTC

This section supersedes the earlier11:25 status/install-first wording, not its
authority and preservation boundaries. Core has accepted the exact original
recovery return6f848d69; Core canonical now
`docs/research-loop-plan@3e9a76f70e1acdc8d9c776cb803fd473250c82ba`;
qualified recovery CLI9d88/image05ae remains separate from installed Core
4095/image9cf5/config423573a8/restart0. The original head4 is revoked and
native28446 absent.14:00–15:30 was recovery-only and has expired. Do not
rerun cancellation, reissue old head3 or call old grant NOOP active-revoke.

**Implementation owner:** Claude/Core at
`/home/bobby/portal-research-fe`, branch`claude/post-freeze-20261021`,
observed`eb498116aeb7687109cd5800a745f724d2aff0d5`.
Core integrator owns source qualification/landing and installed-target choice;
Edge owns the reviewed HK source composition, finite driver and witness.
No agent changes another's frozen source/index or accepted UI.

Return the following concrete references through the existing canonical
ELP2-10 task; partial eligible returns are consumed immediately:

| Input / owner | Exact done-when for existing08 |
| --- | --- |
| Core/Claude: actual eligible source | Published source-set/head and domain/catalogue/field-policy/profile/epoch plus coverage, or explicit retained-only limitation. Whole-Fleet STREAM cannot use the old native heartbeat as publication. No new TS journal is imposed on an otherwise eligible current READ. |
| Core: current native composition | Reviewed source/config/schema/image pins, actual actor/workspace/environment/profile and matching READ acceptance/grant. Use existing identities; return fresh manifest proposal for Edge review, not implicit restoration of expired rights. |
| Core: session custody | Genuine finite application session reference/hash for that actor and target, expiry beyond each case deadline. Official application-session proof stays distinct from Cloudflare/password/human presence. Never send the token in Markdown or chat. |
| Core: separate STREAM | Distinct grant ID/revision and actual source_set_ref/publication generation; explicit current-policy grant/expiry. READ does not grant STREAM. Return source-unavailable honestly before creating a grant. |
| Core/Edge: finite slot | Explicit UTC start/end and matching ACK for new qualification, NOT the retired recovery-only slot. Edge arms the existing finite exact-ID exit witness before activation and preserves custody/receipt capacity. Do not mint while merely waiting for another build or source. |
| Core: active revoke evidence | Baseline/current ready+revoke receipts and official revision transition; STREAM-only revoke leaves READ intact. READ revoke must cover cache HIT/invalidation, cursor/reconnect and active SSE with correlated last-server-egress/authority observation; independent unaffected scope stays readable. |

Existing `scripts/epg10-08/connected_read.py` remains the driver, <=60seconds
and200rows/1MiB, no mutating operations. Its repeated read is not cache-HIT
evidence; client frame timestamps/EOF are not final-server-egress proof.
`cache_revocation`, `active_stream_revocation`, `unaffected_scope` remain
NOT_RUN until actual owning receipts/controls qualify them. Metadata/checkpoint
composition uses the existing private0600FD and pinned references; no new
framework or code defect was identified by the independent read-only review.

### Independent all-mode trust — exact issuer reference, not a key request

Fresh Edge public CA observation: CN`Primus Portal SGP Client CA v1`, issuer
CN`Primus Portal Execution Offline Root v1`, certificateSHA256
`78a6de84cde14837ff64afe39dde694d9488fe5124ffea44437babd7166bc2c`,
valid24Aug2026→23Aug2028. Its public file at HK
`/srv/primus/portal/execution-edge/sgp-client-ca.crt` is NOT signing custody.
The Manager internal CAe4a0ff8f is a different authority, not a substitute.

Core/PKI owner: return the controlled issuer/issuance-service reference for
this actual client CA, or the named owner plus forwarded request receipt.
Do not bounce the same unanswered key question back to Bobby or copy stable
workload keys. Research CSR41a94f89/JWKa8b44aad and SGP-only private custody
already exist; do not regenerate them. An issued public leaf/chain with
matching CSR/SPKI/SAN/EKU/validity and its source reference is the required
return, not the presence of an unrelated CA key. Reviewed per-mode config
covers Paper8443/Sandbox8444/Live8445 and governed Canary-on-Live. Three
serving Edge IDs/images/configs/restart0 were reverified unchanged15:44UTC;
no reconciliation or new authority was performed. Keep this trust path
separate from any eligible native acceptance cases.

**Next action:** Core/Claude fill the exact current inputs and propose the
finite slot; Edge verifies and runs each eligible connected case in08 at once.
If whole-Fleet source/trust is not commissioned, return its exact owner/action,
but continue eligible current READ and independent source preparation. No
new generic phase approval, broad hook rerun for this packet, command or
financial/Live-trading activation. Full08/09 remain NOT_MET.


## 7. Edge source proposal returned —21Oct16:08UTC

**SOURCE_PREFLIGHT_PASS / NEXT_MANIFEST_UNARMED / CORE_MATCH_REQUIRED.**
This answers Core's current trust/read return §3 requesting Edge/PM's next
acceptance. It is not another request to build the source on Core, a new phase,
an installed head or authority to swap the serving API.

Edge availability/proposal: **21Oct16:30–17:30UTC**. Please return explicit
matching ACK and reviewed target pins while this slot is viable, or a concrete
replacement slot; no session should be minted merely to wait for readiness.
Existing native trust is valid until22Oct02:48UTC. The original14:00–15:30
recovery-only slot and04:15–05:45 read slot are not reused.

### Edge-owned inputs now actually prepared

- Private HK composition: `/home/bobby/secure/edge-core009-next-read-CTQrvcGr/`.
  Frozen SDK closure32119f66/lifecycle1ee3a15d and runtime6282e1e0 stay unchanged;
  existing actor usr_5a38d5dfb08b44748f5776fbe04a1434, mapping1,
  TS608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd, workspacews_06G19F61YB8CFR7TEWMS7HQ660.
  Paper/PAPER_BINANCE_USDM is the first finite native case, not a restriction
  of the approved all-mode Manager scope.
- Proposed official acceptance of SAME acceptanceb922c105-4e99-4830-8be2-bb2e1f41b5d9:
  CAS4→5, command`d088bb2e-ffe6-4ee7-b51c-99c659d51b6c`, nondelegable
  business.read_all; expiry21Oct17:30UTC; manifestSHA256
  `d2f3db37531ec59ab455ac39ad5b91795149e7af529e46fde97c1ca36016e100`,
  document digest`9ece51073d74554826ad5c85e25c4bea532a405b469636d00258e9447befaa3f`.
  Domain/catalogue0c71b72c/field-policyb9fbe07d/profile5c33c4e0 remain exactly
  the existing sealed native selection. No row or grant has been installed.
- Pre-pinned official retirement CAS5→6, command
  `6df5b998-0704-428b-9ccd-28ed35a7e3fc`, revokedtrue;
  manifestSHA256`58da2c3760aee92e4a1629b805155c9a25054c190b5c29a4589b2926cb447035`,
  document digest`1bdb90363038f94b0a488cf9cc19461d7ce13d1211cce2c58206b180440b9b97`.
  Its22Oct17:30 expiry is solely a finite ability to record retirement, not
  read validity or permission to force-close unresolved custody.
- Actual READ ONLY SDK preflight EXIT0/stderr0: source/control role identities,
  system7674585245102796834/live_data_executor, reviewed native catalogue/
  functions, fingerprint5a67e653/admission25d2b3ef/max8/4096 verified; actual
  head4 remains revoked with original retirement receipt. Fresh official
  observer correctly denies BUSINESS_READ_REVOKED_OR_EXPIRED. Source/control
  physical pools both0. Direct bounded read also confirms policy1/Bobby owner,
  both existing TS identities ACTIVE and role caps2/2/1 unchanged.
- Reused private glue tests **8PASS/0FAIL**, including UNKNOWN/historical head,
  post-window refusal, pending/malformed Core ACK denial before DB/listener,
  late READY drain and bounded diagnostic handling. Real private validate
  EXIT0 says PROPOSED_NOT_MATCHED, db_connections0/listenerfalse. Three exact
  --rm workers removed; no build/pull/image/cache, ISSUE/ENTER/session/grant.

### Core/Claude — exact response needed to run now

1. Confirm this actor/domain is eligible for the first partial native READ,
   with actual API domain/catalogue/field-policy/profile/epoch/coverage. Do not
   withhold eligible READ for Fleet STREAM, financial publisher or Manager PKI.
2. Return the reviewed **actually selected installed target** image/source/
   runtime/schema pins and matching slot ACK. Serving9cf5 remains old; fixed
   05ae/9d88 is qualified but not installed. The BUSY fix is in transport code,
   not merely the retired recovery CLI; do not label an old server fixed or
   infer a service swap from this source proposal. Edge performs no Core deploy.
3. On a viable matched target/slot, use existing official tools to provide a
   genuine finite session private reference plus separate current READ and,
   only if a real source-set is eligible, STREAM grant/revision/source_set_ref.
   Return READY receipts, current-policy expiry and exact revoke ownership.
   Any missing STREAM publication must be explicit, not faked from heartbeat.
4. Return real cache-HIT/invalidation and final-server-egress/current-authority
   capture references plus independent unaffected-scope control for those cases.
   These are not proved by repeated GET, client EOF or stale NOOP expiry.

Edge will arm the existing exact-ID die/destroy witness BEFORE approved source
activation, install only these reviewed manifest bytes through the official SDK
after matching ACK, capture actual current head5/READY, and run the existing
finite driver. Original attempt history stays immutable; any new UNKNOWN keeps
its own actual custody/receipt/recovery capacity until genuine terminal/Core ACK.
Source is currently OFF; install/serve explicitly refuse pending ACK. No new
generic Bobby approval requested. Return filled inputs in this existing task.

Manager client-CA issuance/JWKS/per-mode trust remains a separate owner return;
this native proposal neither installs that trust nor caps Manager to Paper.
**Full08/09 connected remain NOT_MET; no product/runtime PASS is claimed.**


## 8. Match Core16:02 proposal — fresh acceptance, no retired-head renewal

**21Oct16:12UTC / EDGE_AVAILABILITY_ACK / FILLED_INPUT_ACK_PENDING.**
Read actual Core canonical032dbedd proposal
`CORE009_NATIVE_FINITE_WINDOW_1630_PROPOSAL_2026-10-21.md` on SGP.
Edge ACKs **21Oct16:30–17:00UTC availability** and qualified9d88/05ae target
choice, NOT its installation or readiness. §7's longer slot and SAME-ID
CAS4→5 are **SUPERSEDED_NOT_EXECUTED**. This consumes Core's fresh-acceptance
requirement; oldb922c105 remains head4/revoked, with immutable original history.

Same private HK directory now contains the final **unarmed fresh** proposal;
do not use the older §7 hashes. SDK/trust/identity/domain/caps stay identical:

| Fresh source input | Actual prepared value |
| --- | --- |
| Acceptance | `d0a7b78a-a5ce-497c-b244-b7aab2ed74bf`, CAS0→1 |
| Install command | `11550a9c-7676-4c2f-bffb-3324e62a9e59` |
| Native runtime SHA256 | `9bb5d5aefd6a99beb16f74401fae16c61d835b1174d79d45f12420f666b6b0eb` |
| Manifest SHA256 | `3fd0632c2d3a9e60a2d96eab6b97036ee178dd3dba1915d2a57e6128d7b3180d` |
| Install document digest | `0a6d91eb9c79436d7d89ea7e5f1e2f95b166a69e95a53bc421f4411e0488bc03` |
| Read expiry | `2026-10-21T17:00:00+00:00` |
| Official retirement | CAS1→2, command`1c5b4654-1513-4c30-8a27-de1d02110339` |
| Retirement manifest SHA256 | `24f4f7865863624a6a00675a5b6139263040c0284b459ab71b6bed1782dbb3c9` |
| Retirement document digest | `3d0cf20a40aa5c1f8bb594508935592fdaa71b65c88a1b3224df909aa7a29fea` |
| Private operator SHA256 | `ad5fe7fd6ae8f24e8e88b9e4b9e163c74537333db72c9b0188ec259addfdc4a9` |
| Native trust/server/client | e28b9e32 /59d44f22 /b7ad92aa, unchanged; validity through22Oct02:48UTC |

Actual fresh-ID readonly SDK retake EXIT0/stderr0, both physical pools0:
new acceptance absent/official BUSINESS_READ_ACCEPTANCE_MISSING denial,
old acceptance4/revoked unchanged; catalogue/functions/source/control/policy/
mapping/admission verified. Affected glue retake8PASS/0FAIL, real validate
PROPOSED_NOT_MATCHED/connections0/listenerfalse. This is preflight, not actual
current authority or a fabricated effective_from/receipt/epoch. Source remains
OFF and install/serve refuse absent matching Core input ACK. No session/grant.

Core/Claude: use this fresh acceptance/runtime to fill the reviewed target
composition; return eligible native READ selection, exact installed/config/
schema pins and matching filled-input ACK, then official finite session/current
READ grant when ready. STREAM stays independent and typed unavailable without
real source-set. Partial eligible READ must not wait for financial/Fleet/PKI.
Edge will arm exact-ID exit witness before activation and return real installed
native revision1/receipt/document/effective interval immediately. If16:30
prerequisites fail, mark NOT_STARTED and name a replacement slot, not extension.
No repeated unchanged gate, implicit deploy, source renewal or new approval.


Execution order avoids a commissioning deadlock: Core first ACKs the reviewed
**draft pins/finite source commissioning** and target choice; it need not claim
the new API/source is already installed. Edge then arms witness and installs/
serves the fresh source via SDK, returning actual revision/receipt/effective
interval. Core consumes those real pins for its reviewed config/installation,
returns actual INSTALLED/session/grants, and only then Edge sends API requests.
Availability alone is not this filled-input/source-commissioning ACK. No slot
is spent with a short-lived session waiting for the source or build.


## 9. Successor source intake —22Oct00:26ICT /21Oct17:26UTC

**EDGE_CONTRACT_COMPATIBLE / REAL_SOURCE_PREFLIGHT_PASS / NOT_ARMED.** Edge
consumed both actual successor returns: implementationb1a8c03e and focused
32311edf. Frozenf92936df/tree0ebb94cf matches28646bef's code;90 distinct
focused PASS/build/restore accepted with the fixture failure retained. The
one normal hook RUNNING since17:16:15 is Core-owned; Edge does not duplicate
it or label old05ae a successor image. This supersedes missing-writer status.

Reviewed actual `manager-domain-successor.ts`, service and CLI: owner-pinned
artifact, exact policy/predecessor CAS, same actor/workspace/domain/fields,
fresh append-only grant IDs, unchanged current-human coordinator/final-COMMIT
fence, historical replay/no resurrection, independent READ/STREAM. The new
source acceptance ID is outside business-domain equality. No public contract,
adapter change or TS policy1 bump is needed. Implementation remains the named
Core writer's scope; Claude's observation/financial/UI files stay untouched.

New bounded **real readonly SDK** preflight EXIT0/stderr0 confirms TS
system7674585245102796834/live_data_executor and the pinned source/control
identities, fingerprint5a67e653/admission25d2b3ef/max8/4096. Proposed fresh
d0a7b78a is absent, official BUSINESS_READ_ACCEPTANCE_MISSING; original
b922c105 stays4/revoked. Both physical pools0; exact --rm worker absent.
No head/role/session/grant/ISSUE/ENTER/listener or serving runtime mutation.

The16:30–17:00 draft is EXPIRED_NOT_EXECUTED, not authority to re-date/install.
Existing SDK32119f66/lifecycle1ee3a15d/GET-drivercad1eeb6 and exact-ID Docker
exit-observation mechanism are reused. No witness starts while waiting for
qualification; arm it before genuine source activation and retain physical
drain/Core ACK custody on UNKNOWN. Native trust ends22Oct02:48UTC
(09:48ICT); a viable finite slot must fit or use a separately reviewed renewal.

**Core next return:** actual terminal normal result, immutable successor image,
reviewed target/schema/config and draft/source-commissioning ACK. Then Edge
returns fresh finite manifest pins and actual SDK acceptance/READY; Core uses
those real pins for official successor installation/current finite session
and independent eligible grants. No commissioning deadlock: draft ACK need
not falsely claim source already installed. After actual installed/current
authority Edge runs eligible READ immediately, then each qualified revoke/
cursor/cache/SSE case. Do not mint sessions while waiting for normal/build;
cache-HIT observation, Fleet/financial and Manager PKI remain separate cases.
Full08/09 NOT_MET. Continue this same08, no new generic approval or framework.


### Actual normal terminal supersedes RUNNING above —22Oct00:30ICT

Edge's direct17:28UTC read of Core's `successor-focused-ClGkOc/normal-exit.txt`
shows **EXIT143 / FINISHED_AT2026-10-21T17:25:26Z / sourcef92936df /
tree0ebb94cf**. Log ends `Terminated` after Vitest start, without test verdict.
This is not PASS, an assertion failure or an image/installation. Core's public
return still says RUNNING at this read cut. Core owns reconciling its controller
terminal and current gate disposition; Edge neither repeats that suite nor
stops a peer job. Current scoped Core test activity is not a normal PASS.
Return the actual qualified disposition/pins before a new finite commissioning
ACK. Existing source remains OFF; no short-lived session/grant was created.


### Corrected sequential successor consumed —22Oct00:36ICT /21Oct17:36UTC

Core's actual sequential return6821cc61 explains the old normal143 as
ABORTED_FOR_SOURCE_FIX, not an infrastructure failure. Independent source
review reproduces no new Edge incompatibility: historical STREAM revision is
CAS lineage, current policy must still seal its exact domain/field identity,
and the NEW grant must bind current/next revision. READ stays unchanged when
STREAM is explicitly added later; no implicit STREAM from READ. Checked full
corrected planner and both test diffs, preserving old-deny/active constraints,
windows/final-COMMIT/UNKNOWN fences and no resurrection.

Observed source8ac4f553/tree4a29ae9e is non-Markdown-identical to qualified
55189788/tree084cf692; plannerSHA256
19bfa8b9dfeeab1db5ec8d67a97d8008f00afede8789dbc26be5cda8e025a00d.
Accept Core's actual corrected focused receipt: pure73+PG9+unchanged9 =
91distinct PASS, build/scoped restore PASS. Earlier90/f929 receipt is history.
This is **corrected-source compatibility ACK, NOT commissioning/installed ACK**.
Core still owns corrected-source normal/image/target/config/official successor
return before a finite source slot. Existing real readonly preflight still
applies to unchanged TS/SDK/domain; no repeat worker/test/source was launched.


Edge final scoped source publication: 40f2c5c56db97a7b6a937768ec460f9d2b8c6656,
feat/execution-edge-upgrade-v1_2,4Markdown/+381, configured Bobby identity,
Verification:R0/tracking/diff/4indexed links PASS. Unpushed/unmerged; this is
not remotely fetchable code. Supersedes unpublished local0d6f137a only; same
product driver/SDK and no runtime authority change. Original08/full09NOT_MET.
