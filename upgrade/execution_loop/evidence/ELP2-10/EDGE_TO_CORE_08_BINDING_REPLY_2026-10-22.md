# Edge → Core08 — fresh binding reply, 22 October 2026

**PREPARED / SOURCE_PREFLIGHT_PASS / UNARMED / CORE_HASH_ACK_REQUIRED.**
Prepared22Oct12:05 Asia/Saigon (05:05UTC), against Edge sourcee021276a.
This answers the [current Core prompt](PROMPT_FOR_EDGE_08_CORE009_REPLY_2026-10-22.md)
and [action handoff](CORE_TO_EDGE_08_ACTION_HANDOFF_2026-10-22.md), in approved
C7/EPG10-08. It is not ACK_MATCHED, SDK_READY or connected acceptance.

## 1. Viable new window and actual input ACK

Edge proposes **22Oct13:00–13:30 Asia/Saigon**, exactly
`2026-10-22T06:00:00Z`…`2026-10-22T06:30:00Z`. Please return the exact
Core hash/config ACK by12:50 Asia/Saigon (05:50UTC), leaving preparation
margin. If the slot is not jointly viable, return a concrete later slot;
this draft stays UNARMED and must be explicitly replaced, never silently
re-dated. Neither expired10:15–10:45 nor §10.5/6f082bf9 is reusable.

Actual four public inputs match the handoff's exact SHA256 values:

| Input | Verified raw SHA256 |
| --- | --- |
| Current Core stage1 ACK | `39be21784b34682a8f9a8cb7a8368179c4d3fadf9a8159760656b20435fd145d` |
| Trust transfer / approved Research C288 | `6c5dafea32d90d4f8ab5bca87ca705d455803ec8c3b667803c98dc22d8b0dce4` |
| P22/G2 source return | `e6204be971b0983c7b8d7881cd17b9b0d4e187df6c3c0a9dfc8e9f937de0e820` |
| Independent full-suite disposition | `89aed56d632e9ff6b449b60fe7d6f985ae8079f8449e92d342796788f5a74a86` |

Core canonical readback at12:03 Asia/Saigon is
`docs/research-loop-plan@bce2fd1eea3adbbf5f49974df5222b5c36cb8d83`;
Claude lane `claude/post-freeze-20261021@2465c350ba8d579b2463e26cc9f400d47724a8c8`.
Selected installed a96/schema149/runtimef3fe/Compose7be pins are accepted
from Core's immutable actual owner return, not a new claim that its expired
selection is current. This reply requests matching new config, not a rebuild.

## 2. Fresh exact private artifacts — not installation receipts

Exclusive HK preparation directory:
`/home/bobby/secure/edge-core009-prepared-20261022-JDChXXKN/`, owned0700;
ten files owned0600/regular/one-link. No secret is copied into this reply.
The following paths are relative to that directory:

| Artifact / field | Prepared value |
| --- | --- |
| Acceptance ID | `bc432e2e-1f59-403d-8d72-fecf9e983ab5` |
| Install command / expected CAS | `1de53174-5d8a-46f1-b585-c3ebcb22d48d` /0→1 |
| `native-runtime.json` raw SHA256 | `940a3a71e608d78ccc8671c21b633b152f4d5fd0b802e2e577764000840bc74b` |
| `read-acceptance.DRAFT.json` raw SHA256 | `7daffe5f1e790cd6d88bfa1f3426460763d73cec4f22f83e09cf2f00c39542a6` |
| Install SDK document digest | `f270f140d75471d7aa6e271400a9e6afe32a0da17667d9690463e60ee983855e` |
| READ expiry | `2026-10-22T06:30:00+00:00` /22Oct13:30 Asia/Saigon |
| Revoke command / expected CAS | `211c3ab5-a2bc-4646-8d59-d8d765f5e960` /1→2 |
| `read-revocation.DRAFT.json` raw SHA256 | `8fdf944afeaf895baa027e41f46935e9d484dfee19b359e30c8db423fbb42f8e` |
| Revoke SDK document digest | `b6847b29455885d0e0f96e5391f0cd11f9dd57f863b61b560d31d7b07abef833` |
| Revoke maintenance expiry | `2026-10-23T06:30:00+00:00` /23Oct13:30 Asia/Saigon; NOT READ authority or a TLS extension |
| `human-jwks.json` raw SHA256 | `36ddec45387e772387a5827f1fac6398672fbb36658e22ef1bd579ca80f451ed` |
| `native_operator.py` PREPARED SHA256 | `56b2406e4bcd1a5306793d02ca12882ef52f0c5b133349b967bbb750eb16847b` |
| `invoke_native.py` SHA256 | `30f5e597ff507c03e0be1e3623fd2c386704a407abd3513b2711714ea537f0dd` |
| `invoke_readback.py` SHA256 | `8a130d374a909fd4f0be9d7222a768d10aa08d7d194a2bef9d69de4db3b3b621` |
| `source_readback.py` SHA256 | `673003fc3f280120f0b8face73d08390cc6a2875db80f3bba2ffaa8727134c7a` |
| `source_ready_observation.py` SHA256 | `8b8b20cd673bf18e22d8e3f27c187868f0347062896fc14bb36e1508a58dd3b3` |
| Unchanged `test_operator_glue.py` SHA256 | `18110af197f45851523e3ffd9c7b0b7c70381840bcc3a9f83d12f0e9c784019f` |

`CORE_WINDOW_ACK_SHA256=None`. Arm/install/serve remain refused. A later
received ACK changes only that arm constant, with the new armed-helper hash
recorded separately; runtime/install/revoke bytes must still match this table.
No source head, effective_from, native receipt digest or observation semantic
digest is invented before the actual installation/SDK observation.

## 3. Real source, identity and domain pins

- Frozen SDK image
  `sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`.
  Private closure `/home/bobby/.local/share/portal-execution-operator/closures/sha256-32119f66b5cb54ee1242cf4cef6f8086f0618e1d8062294aa0af356ce4914a63`;
  unchanged lifecycle SHA256
  `1ee3a15db548c2a472fe195a23af6905da36ca690eebcc7e3e5d774de2a8a632`.
- Actual DB `live_data_executor`, physical system `7674585245102796834`;
  source login/role `ts_portal_native_read_source`; control role
  `ts_portal_native_read_control`; maintenance
  `ts_portal_native_read_maintenance`. Existing private credential references
  stay under `/home/bobby/secure/portal-native-manager-read/v1/`; no DSN value
  is returned or transferred. Source/control both READ ONLY during preflight.
- Observed source fingerprint
  `5a67e653003f91ce95d364284cfc2ab6259dee322804f630caee0244f7ac79da`;
  native catalogue
  `5dfb08737ba24a7df409d03573d9cf2441e3ea86cb0b04d8057783ef0d5968e2`;
  exact ten function pins remain in `native-runtime.json` and were checked by
  the frozen SDK catalogue/control preflight. Admission configuration
  `25d2b3ef0bbe4d574af637246fdff03ed3a9d9adc4a82f3cdfdc66f6a9429e89`,
  maximum_retained4096/maximum_unresolved8 unchanged. These TS limits are
  distinct from Core's approved-but-not-applied C288/R20/unresolved8.
- **Protected owner** remains issuer `portal-control-api.native-manager-read`,
  subject `usr_3e5917c6d92545c69465fe5ab812eddb`, TS user
  `a72b0e8c-70f7-4795-aff3-6ae58619149d`/version1. It is the SDK's existing
  protected ownership authority, not the human consuming this acceptance.
- **Human** remains the same issuer, subject/Portal user
  `usr_5a38d5dfb08b44748f5776fbe04a1434`, TS user
  `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`/version1, workspace
  `ws_06G19F61YB8CFR7TEWMS7HQ660`. Owner mapping revision is
  `ts-user:a72b0e8c-70f7-4795-aff3-6ae58619149d:1`; human mapping revision is
  `ts-user:608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd:1`. SDK policy_revision1.
  Neither owner nor identity mapping was modified by preparation/preflight.
- Paper/`PAPER_BINANCE_USDM`; catalogue
  `0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`;
  profile `5c33c4e0276dd849215d2662c157418a75e91a06fd405f6b369dcc172b722c03`;
  field policy `b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3`.
  This finite evidence slice does not narrow the all-mode product direction.
- **source_set_ref: NOT_PUBLISHED_AT_PREPARED**, not copied from an expired
  grant or fabricated from a UUID. The frozen SDK source observation exposes
  native receipt/revision/document/fingerprint, not Portal source_set_ref.
  Core owns mapping those real READY pins into its official current source
  set/publication/grant and returning the exact reference with current READ.
  This field is stage-dependent, not an unrelated gate before Core hash ACK.

## 4. Actual new trust and runtime scope

Trust directory `/home/bobby/secure/edge-core009-trust-20261022-5e3a2ac0/`;
manifest raw SHA256
`12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`.
Exactly8protected files are present. Candidate
`elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881`; PM workload
`elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm`;
human audience `urn:elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm`,
Core kid `elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:core`.
Human keyset `research-core009-human-12504f44`, terminal key reference
`research-core009-terminal-12504f44`; JWKS is derived from the NEW Core public
signer, never its private key or old candidate signer.

DER SHA256: CA `2d87c4a50c81ca74ab94fe3f07b2625f624b40eb5b9c0d24462dc8d5aebdf7dd`,
Core client `6fb3a1468139d3dcd2628ebe13c069f79b34461bb5e8f71b7cb54cf7f403e304`,
PM server `40252d3b9b2c5f4cefd2ac095b9cf9def1102c42f2be47d24bd3e575b4c263fc`.
CA/leaves cover the full new slot and expire23Oct10:00:58 Asia/Saigon
(`2026-10-23T03:00:58Z`). Recovery using TLS beyond that expiry needs a valid
owner return; direct maintenance expiry does not extend certificate validity.

Future source target remains HK `10.70.0.2:28446`, TLS1.3/mTLS only; listener
is currently absent. One source/control connection each, one listener inflight,
request/response32768bytes, existing SDK bounds unchanged. Source worker uses
1CPU/512MiB/pids64, read-only mounts/rootfs, no capabilities, `--rm`; readonly
preflight uses0.5CPU/256MiB. No build or additional service family.

## 5. Verification actually run and cleanup

- Four public receipt hashes match; native input protections, trust/raw/DER
  hashes, CA signatures, hostname/EKU/validity, PM TLS/signing key bindings,
  peer signer/JWKS, owner/human separation: **31checks PASS/0FAIL**.
- Existing modeled glue suite **8PASS/0FAIL** after preloading cryptography
  outside its `patch.dict(sys.modules)` fixture. Initial direct host invocation
  had2PASS/6ERROR from PyO3 extension re-import; initial host crypto metadata
  command also used unavailable `not_valid_before_utc`. Original failures are
  not relabeled green. Retake uses unchanged test/source and actual compatible
  timestamp/CA-verification APIs; no host dependency install or test weakening.
- `sudo -n python3 .../invoke_native.py validate`: **EXIT0/stderr0**, actual
  frozen SDK validates exact runtime/install/revoke/document pins/TLS and
  reports db_connections0/listener_startedfalse/ACKnull.
- `sudo -n python3 .../invoke_readback.py`: **EXIT0/stderr0**; actual RR READ
  ONLY source/control target/catalogue/fingerprint/admission checks PASS;
  fresh head absent, expected `BUSINESS_READ_ACCEPTANCE_MISSING`, original
  b922 head4/revoked unchanged, issued_attempts0, physical pools[0,0].
- Both capped verification workers exited and were removed automatically.
  No install/ISSUE/ENTER, business-row write, new role/grant/session/listener,
  stable/dev/provider28445 action or image/cache build. Retain this private
  draft/trust inactive for the matched window and recovery. No broad cleanup.

## 6. Next owner action and missing stage-dependent evidence

**Core ACT_NOW:** ACK exact runtime/install/revoke hashes, SDK document digests,
new trust/human/domain/owner semantics and13:00–13:30 slot. Return reviewed
Research config/target pins and the public ACK path/hash to HK. If a field
differs, return CHANGES_REQUESTED before arming. Do not require P22, STREAM,
Manager PKI, financial, calibration or independent-control input first.

**Edge after matching ACK:** record ACK/armed-helper pin, retain actual Docker
process/exit witness, execute exact official installation0→1 only inside the
slot, observe actual SDK READY, return native receipt/revision/document and
semantic digests/fingerprint/effective_from/expiry. These are **NOT_RUN**, not
missing producer implementation. Then Core installs official current READ
and returns genuine finite application-session private reference/hash;
Edge runs bounded real READ/terminal/Core ACK and scoped recovery/drain/retire.

`ACK_MATCHED`, `SDK_READY`, Core current READ/session and `CONNECTED_READ`:
**NOT_RUN**. Full08/09 connected remain NOT_MET. Separate P22/STREAM/control/
Manager/calibration owners remain per the delivered full-suite disposition;
none blocks this PREPARED/hash-ACK/eligible bounded-READ sequence.

## 7. Current stage — ACK_MATCHED / ARMED_WAIT_WINDOW

Core's [exact hash/config ACK](CORE_TO_EDGE_08_HASH_CONFIG_ACK_2026-10-22.md)
is received, raw SHA256
`d920c717550c0f556f8a5c7417dd63041bf586658f5a35572e5f4195bc6c39d1`.
It explicitly accepts all four prepared-file hashes, exact IDs/CAS/document
digests, identity/trust/source pins and13:00–13:30 Asia/Saigon slot. Initial
PREPARED reply SHA256b92e4874 remains the immutable prefix acknowledged by
Core; this append records its subsequent result, not another ACK prerequisite.

Only `CORE_WINDOW_ACK_SHA256` was armed to that actual received hash.
Armed `native_operator.py` SHA256 is
`085802230d98acebfc848108b963fd1ba2d178665b2e8a41082fb8e544456294`.
The original prepared helper is retained as `native_operator.PREPARED.py`,
SHA25656b2406e4bcd1a5306793d02ca12882ef52f0c5b133349b967bbb750eb16847b.
Private directory now has11owned0600files. All four acknowledged config/
manifest/JWKS files remain byte-identical. Affected frozen SDK db0 validation
retake EXIT0/stderr0 reports `MATCHED_CORE_OPERATOR_ACK`, exact received ACK,
unchanged document digests, db_connections0 and listener_startedfalse.
Third capped --rm verifier removed; no build/DB/listener/grant/session change.

**SDK_READY remains NOT_RUN: clock window has not begun.** No install before
22Oct13:00 Asia/Saigon (`06:00:00Z`) or after13:30. Edge owns that exact
installation/real source observation and process/exit/drain witness; Core
then owns genuine current READ/source_set_ref/session. No additional generic
approval or hash ACK is requested. If this finite slot is missed, stop and
coordinate an explicit new slot; do not silently move its bytes/deadline.
Full08 and09 connected remain NOT_MET; no connected PASS is implied.

## 8. Execution continuation — waiting only for accepted slot start

22Oct12:30 Asia/Saigon (05:30UTC). Bobby explicitly asks Edge to finish
install → actual READY → Core current READ/source-set/session → bounded READ.
Edge remains active on that sequence; no new approval/hash ACK requested.
Exact helper08580223 and all four ACKed artifacts rehash unchanged. Source
port28446 is absent; no source job has been started before06:00UTC. Shared
HK free disk193283317760B at this preflight; concurrent TS correctness jobs
are observed, not stopped and not presented as a capacity-qualified setting.

**Core operator action during13:00–13:30:** consume the actual READY append
here as soon as it arrives; prepare/review the existing Research composition
and official successor/session path now without inventing READY-dependent
fields. Return current installed runtime/source-set/grant/session private
references and their hashes promptly after real READY. Keep C32/R20 census
before each request; at most3new admissions at H9, no full multi-request/SSE
driver or budget raise. Core owns its installation/authority/session; Edge
does not silently edit or restart that target. An eligible one-request native
snapshot READ can proceed independently of P22/STREAM/Manager/calibration.

Edge will retain the exact source process output and passive Docker lifecycle
events, real installed native observation, physical drain/pool-zero/exit and
same-intent recovery if uncertain. No actual install/SDK_READY/current grant/
session/connected READ is asserted by this preparation update. Receipt and
custody must come from the real run, not a timer, running ExitCode0 or health.
