# Edge → Core — missing active-revoke specimen PREPARED

22October2026. **STEPS1–2_COMPLETE / SOURCE_PREPARED_UNARMED /
SDK_READY_NOT_RUN / CONNECTED_NOT_RUN.** This is original EPG10-08/read09,
not a new phase. Bobby approved review and preparation/delivery only in this
slice. A Core ACK does not itself execute or authorize this slice to install.
[Unified](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-active-revoke-preparation-only-22oct2026),
[detailed guide](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-08-hoàn-thiện-revocation-scope-và-tls).

## 1. NEW proposed window and actual predecessor

**22Oct10:30–11:00UTC =17:30–18:00Asia/Saigon.** The previous Core
09:30–10:00UTC offer is explicitly superseded, not silently extended/reopened.
No scheduled process, listener, native9, grant/session or future config exists
from this preparation. If exact ACK/execution authority or adequate reserve
is missing, stay UNARMED and explicitly propose another slot; never roll expiry.

Actual READ ONLY preflight verifies native **8/revoked**, original command
`84d18247-cb75-45b5-9a4e-26fbde231e3a`, raw manifest
`2ddd06b89e00e19ba957553803ffe57ae572d7b22512a06251f4be5dd34f31ad`,
document `0f20ec80b625f43ce6301f20fff8707efd977b1e157d84e7716bacc6321c1b18`,
same natural-key acceptance `b922c105-4e99-4830-8be2-bb2e1f41b5d9`.
Old receipts/UNKNOWN custody/source-terminal ACKs remain immutable. Prior
[actual partial STREAM/retirement](EDGE_TO_CORE_08_STREAM_ACTUAL_READY_2026-10-22.md#final-actual-stage--source-retired-stream-acceptance-partial)
is history, not READY for this new slot. Do not repeat completed READ or restart.

## 2. Exact Edge artifacts, all UNARMED

HK private directory0700/files0600/Bobby/regular/nlink1:
`/home/bobby/secure/edge-core009-active-revoke-20261022-pSaE4LlC/`.
No credential/key was copied. Existing root-only DSN references enter the
qualified wrapper through private stdin, never arguments/logs/Git. The new
private glue only repins window/CAS/commands and verifies the exact retired8.
Frozen product SDK/lifecycle/runtime/identity/domain/trust are unchanged.

| Artifact | Raw SHA256 / exact proposal |
| --- | --- |
| Install command / CAS | `5f8f6fc0-c111-40dc-aa88-2b7760e6e798`;8→9 |
| Revoke command / CAS | `0f2556d0-3dbe-4e7c-bc03-60c5d9e8b73e`;9→10 |
| `native-runtime.json` | `da67184b6a90d1cfd9a8fdf25d0992f209e19b7ed2d7534238d4c1f7f00ce33c` |
| `read-acceptance.DRAFT.json` | `b9e93f0017da7ada0bf0019908c349b7fd9816de2f376b064d15cf68c09d206a` |
| Install SDK document digest | `47a0f5d583ccd2c04c33b2e72bd12e2ac2be124ac6c31cce05e1a087eb37831a` |
| `read-revocation.DRAFT.json` | `5791d1c608dc86e278dd73ef1a58c0ffa421ae6848ed12812a4e2e0ea0d0ce74` |
| Revoke SDK document digest | `5de2d00c48bf42ab2914bbe4ebd6e47e3cc49d9342a751a5f02b5ce8b72ed4e0` |
| `human-jwks.json` | `36ddec45387e772387a5827f1fac6398672fbb36658e22ef1bd579ca80f451ed` |
| `native_operator.py` and `native_operator.PREPARED.py` | `894c7157e56f8020d5183207607308334c1c38f4ce7dabb16c1b547b48e07072` |
| `invoke_native.py` | `2a4736224a4fdd1230f4b00f12aa70abc1b901d21cda2ba3f7faf24d97c48f8c` |
| `invoke_readback.py` | `bc1b9e5a32bc4512ff2f23f4cb3561fc0d8ad704e1b103f2344e532ed2563126` |
| `source_readback.py` | `7be8296ba7ab4ca2011b5fed180d63138d11e941a7b0341cf1030cfe15b5e1ae` |
| `source_ready_observation.py` | `7746363db613cffc7d22d52d17d8e0e55a1082dc73a8fb69b9d5476a887b7465` |
| `test_operator_glue.py` | `1de8b2bff366bd90c382310a6500294a5d96dd78cc1d4fb459b4b9032415f114` |

`CORE_WINDOW_ACK_SHA256=None`; prepared/helper bytes match. Source/read expiry
22Oct11:00UTC; exact revoke-maintenance expiry23Oct11:00UTC only supports
retirement/recovery, never new reads. Future ACK arm changes only its explicit
ACK constant and must return the armed hash; preserve these PREPARED bytes.

- Frozen SDK image `sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`;
  closure `/home/bobby/.local/share/portal-execution-operator/closures/sha256-32119f66b5cb54ee1242cf4cef6f8086f0618e1d8062294aa0af356ce4914a63`.
- Lifecycle raw `1ee3a15db548c2a472fe195a23af6905da36ca690eebcc7e3e5d774de2a8a632`.
- Potential source `10.70.0.2:28446`, TLS1.3/mTLS, worker
  `edge-core009-native-serve-pSaE4LlC`,1CPU/512MiB/pids64/read-only/cap-drop/
  no-new-privileges/--rm; **NOT started**. Pools1+1/inflight1/local pending8,
  slots released only on actual terminal ACK; not a cumulative8admission cap.
- Trust `/home/bobby/secure/edge-core009-trust-20261022-5e3a2ac0/`, existing8files,
  trust raw `12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`.
  Actual frozen SDK validates all pinned trust files and leaf validity beyond
  slot end; earliest expiry23Oct03:00:58UTC. No key/certificate rotation here.
- DB `live_data_executor`, system `7674585245102796834`, fingerprint
  `5a67e653003f91ce95d364284cfc2ab6259dee322804f630caee0244f7ac79da`.
  Source/control/maintenance roles remain `ts_portal_native_read_source`,
  `ts_portal_native_read_control`, `ts_portal_native_read_maintenance`.
  TS4096retained/8unresolved is not CoreC288.
- Human `usr_5a38d5dfb08b44748f5776fbe04a1434` ↔ TS
  `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`, mapping1/workspace
  `ws_06G19F61YB8CFR7TEWMS7HQ660`. Protected owner TS
  `a72b0e8c-70f7-4795-aff3-6ae58619149d`, mapping1/policy1 unchanged.
  Concrete specimen profile is `PAPER_BINANCE_USDM`, not an all-mode product
  ceiling or authorization for Sandbox/Canary/Live trading.
- Catalogue `0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`,
  profile `5c33c4e0276dd849215d2662c157418a75e91a06fd405f6b369dcc172b722c03`,
  field policy `b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3`.

## 3. Core repair pins reviewed, NOT an installed qualified binding

Received exact Core return raw
`aac02d41a6a04612f5f5c3879dfcbc14a6004d606fa6419628248f2c19e0fae5`,
canonical SGP `upgrade/execution_loop/evidence/ELP2-10/CORE_TO_EDGE_08_ACTIVE_REVOKE_REPAIR_RETURN_2026-10-22.md`.
Current canonical Core branch `docs/research-loop-plan`, HEAD
`82848983e1c973634f4205b99947cc1bf03fdf8a`, not a runtime identifier.

Core reports combined normal gate EXIT0/de8f6382: contracts1633PASS;
API10015PASS/7explicitSKIP; corrected genuinePG positives10/10PASS. Additional
narrow mapper repair `3265ce18745560cfad391e81054b7aa46eac9097`: production
buildPASS, focused56PASS/117PG-onlySKIP. Broad fixture typecheck EXIT2 remains
disclosed, not silently PASS. No repeat full gate for this Markdown proposal.

Actual read-only Docker inspection confirms still installed Research image
`sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`,
container `46c94107ed4bd9d227d83ab31c023be22fae1d6b5c7b961acb13f15e9ca1d0bf`,
restart0/schema149; old runtime a8142e41/composece339063 scope is expired.
Minimal candidate exists, **not installed**:
`sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069`.
It is old a96/source8ac plus only compiled read-scope.js mapper repair, not a
deployment of the whole Claude/P22/G2 tree. Keep a96 as named rollback.
New Core runtime/compose/backup/expectation/grant/session hashes are
**NOT_READY until Core actually prepares them from this proposal + real READY**.

Verified by SSH/hash, not just copied from historical v2/v3 notes:

| Core private artifact | Exact raw SHA256 |
| --- | --- |
| `core009-stream-window-20261022-1OXiioSB/stream-probe.mjs` | `9649c2e0cda16c3c50f9ca9cab9e9a708b7f8a62027f9ea4c014f5f2f3c384d0` |
| Same directory `stream-probe-recovery.mjs` | `6797eed448eb473f8fc8d429671acbc756cc350b2324a3a2e18f62e45fa6d3f5` |
| Same directory `stream-probe-recovery.test.mjs` | `c083db6cebe05996a42a23b315980b90a17557acfaa2b04af4b943333e933fd4` |
| `core009-active-revoke-20261022-SAmgpeJ7/prepare.mjs` | `c7ce1b1a684e431dd062610421ca6782da1404786c670881f05d69d7fa9d8bc8` |
| Same fresh directory `operate.mjs` | `373aa97db5c3d2fd29b029851ace05449c249204eff49161e7f0289f8065fd28` |

All are below `/home/bobby/secure/` on SGP; Core reports103/103 probe/helper
offlinePASS and9/9 preparation/guardPASS. Edge reviewed new expectation/READY
guards and unchanged fences, did not run these Core tests or create authority.
Core uses fresh receipt directory, not old already-used1OXiioSB artifacts.

## 4. Exact missing-only execution/cleanup contract — NOT_RUN

Core is the **sole HTTP/SSE client**. After exact mutual hash ACK and authorized
activation, Edge official install8→9/actual SDK observation precedes Core
config/image swap + separate official READ, fixed60sSTREAM and real session.
Core consumes exact revision9/receipt/install document/fingerprint/trust pins.
No public Cloudflare acceptance, fake session or duplicate Edge probe.

- Select `node stream-probe.mjs --active-revoke-only`: exactly one subscription,
  a real typed heartbeat, no API restart/resubscribe; unchanged API PID required.
  Exactly two bounded finite reads,12s each: new-source signed cursor bootstrap
  and independent READ after STREAM revoke. These controls are not READ replay.
- C288/reserve20, entire fixed60s producer bound244 at250ms Manager cadence;
  `Cmin=H+266<=288`. Fresh H>22 or pending/unresolved/unreconciled refuses.
  Read-only Core census09:55UTC is H16/unresolved0/unreconciled0/pending0,
  giving282 then; **not a future capacity guarantee**. No audit purge,
  raisedC,55s-only assumption or unrelated Fleet5000ms substitution.
- Core API1.5CPU/1GiB/pool3 plus one CLI0.5CPU/512MiB/pool1; no API overlap.
  Recheck census after quiesce and just before live STREAM. Not G2 budgets.
- One known physically closed typed75 may use only one prompt exact-original
  artifact/hash/revocation-id continuation after actual closure/settlement,
  bounded8s wait +250ms settle, with10s original TTL/window reserve. UNKNOWN,
  refusal/wronghash, insufficient time, second75/NOOP_EXPIRED fail closed.
- Require actual official REVOKED before fixed expiry, non-client-induced
  stream termination, matching typed authority denial using real Last-Event-ID,
  no denial admission increase, independent READ200 and all original terminal
  Core/source ACKs. Transport error is not clean EOF; SNAPSHOT_REQUIRED409,
  local abort, natural expiry or socket closure alone is not revoke PASS.
- Settle exact grants/session and custody to0 before Edge source drain. No
  forced kill or false rollback. Preserve UNKNOWN/original physical receipt and
  ACK; recover same attempt. Edge then physicalpools0/wrapperEXIT0/die/destroy/
  socketabsent and exact native revoke9→10 + STATUS. Retain original evidence.
- On Core failed image/config validation, restore only the exact pinned Research
  a96 backup/config after genuine quiescence; do not copy stable authority or
  delete ledger. Core must return actual backup/config/install/rollback pins.

## 5. Actual preparation verification and resource retention

12modeled glue tests PASS/0fail: CAS8→9/revoke9→10, missing ACK, before/after
window, UNKNOWN original bytes/pool closure, late READY rejection/drain,
zero-DB validate and bounded stderr. Frozen SDK validate EXIT0/stderr0/DB0/
listenerfalse/ACKnull; actual source/control RR READ ONLY preflight EXIT0/
stderr0/pools[0,0]/issued0/authority_changedfalse. It verifies exact revoked8,
natural head, DB/system/fingerprint/catalogue/control/admission and native
owner/human mapping1/ACTIVE/policy/domain checks before expected revoked denial.
Final bounded evidence in the HK private directory above:

| Generated evidence | Raw SHA256 |
| --- | --- |
| `validation.actual.jsonl` | `d301c4bbad52386a968ed719b16988094b82d0559d066812391a4759a66433dc` |
| `readonly-preflight.actual.jsonl` | `d1066b87a8b35d872bcac831e9fa3c30a09d98899bce7a9ced00576207966ea8` |
| `glue-test.actual.txt` | `c658ca5a7bde7132ebd99ea73b0d2c9eb2b8cdbd298a066a57e3ddadc46e2515` |

Every own verifier used --rm/caps and is gone; port28446 absent. Three HK Edge
d6aa and operational native28ea restart0 unchanged. No images/build cache,
grant/session/schema/DB row or source listener created. Keep only this private
proposal/trust/bounded evidence for ACK review; do not prune shared operational,
rollback, volume, source or custody. Read-only inventory observed109images/
42active,585BuildKit/66.37GB amid peer activity; not an owned cleanup target.
Initial read-only inspection used project names rather than actual service
containers and failed; corrected exact names prove restart0, no runtime mutation.

**Verification: R0** Markdown-only publication, explicit staged scope/diff/
link/secret checks and execution-tracking test required before commit. No
push/merge/GitHub CI. Full08/read09 **NOT_MET**; no09connected/10cutover/11release.
Manager multi-mode trust and G2 remain separate owner inputs; current status is
[separate Manager/G2 readiness](EDGE_TO_CORE_08_MANAGER_AND_G2_READINESS_2026-10-22.md),
not a reason to block this eligible native case or fabricate FRESH/cache-HIT.

## 6. Core action and reply location

Read this exact packet, return exact file hash/window/install/revoke/runtime/
SDK/trust/runner/image/rollback acceptance or explicit mismatch. Propose an
alternative window explicitly if needed. Return public sanitized ACK/config
readiness in canonical SGP `upgrade/execution_loop/evidence/ELP2-10/`, mirror
the reply into HK EPG10-08, link Core Unified/sync, and state each actual status.
Do not issue grants/session/install/claim Edge READY from this PREPARED return.
The next execution slice is Edge actual install/READY, then Core configuration
and the one missing specimen, only under its matching execution authority.
