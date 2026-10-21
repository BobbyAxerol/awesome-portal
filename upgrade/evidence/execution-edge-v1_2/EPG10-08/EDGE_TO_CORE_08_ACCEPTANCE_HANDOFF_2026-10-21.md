# Edge → Core — original08 acceptance handoff, 21 October2026

Status: **RECOVERY_ACCEPTED / CURRENT_READ_STREAM_INPUT_REQUESTED / FULL08_NOT_MET**.
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
