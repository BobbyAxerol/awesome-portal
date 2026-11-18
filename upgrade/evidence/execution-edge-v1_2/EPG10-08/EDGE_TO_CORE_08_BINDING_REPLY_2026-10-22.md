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

## 9. Single READ client prepared on SGP — no session transfer

22Oct12:50 Asia/Saigon (05:50UTC). Exactly two unchanged public source files
are mirrored into owned0700 `/tmp/edge-core009-single-read-20261022-WgWvuP/`:

- `scripts/epg10-08/connected_read.py`,40583bytes,
  SHA256cad1eeb6b8f3cd8244cdf7e3f3dd0001a7fefb32a105bdbfab60d7ecc519debf.
- `upgrade/integration/execution-native-read-v1/research-identity-intake/identity_operator.py`,
  58156bytes,SHA256e108a0a740831a3905c6174597420888160097de7ff4edd682bf276965f42424.

Both remote hashes match. No code changed/executed, dependency install,
secret/data/ENV copied, checkout or runtime changed by this preparation.
Reuse `prepare → Transport.request("snapshot") → finite("snapshot")` only:
one HTTPS request, no CLI/run baseline (3–4requests), no STREAM. Core returns
the existing connected-read-config/ready receipt and genuine session private
refs/hash on SGP with matching reader UID, limit≤200/bytes≤1MiB/deadline≤60s,
probe_stream=false. Snapshot-only evidence does not claim full08/09.

**One client owner:** Edge will invoke the single qualified specimen after
Core returns READY-dependent inputs/census. If Core instead runs this exact
specimen itself, return that real result/receipt first; do not both run it or
consume uncounted admissions. Session values remain on SGP. Core separately
returns actual source-terminal/Core ACK and exact official session/grant
cleanup. Edge owns removing only this two-file mirror after settled outcome;
SDK UNKNOWN custody is never treated as disposable client cleanup.

## 10. ACT_NOW — actual install rejected by existing domain head

22Oct13:01 Asia/Saigon (06:01UTC). **INSTALL_FAILED / SDK_READY_NOT_RUN.**
Exact ACKed install7daffe5f/command1de53174 ran only inside slot and returned
BUSINESS_READ_STORAGE_UNAVAILABLE,EXIT2/stderr0/pool0. Official STATUS of
the SAME manifest/command then returned **ABSENT**,EXIT0/pool0. No retry new
key, listener, ISSUE, current Core grant/session or connected READ occurred.
Private raw evidence: prepared-JDChXXKN/install.actual.jsonl and
install-status.actual.jsonl; DB ERROR06:00:14.878UTC identifies unique
heads_user_id_portal_user_id_workspace_id_environment_profi_key collision.

**Cause:** SDK business_root_read.py:_install258–300 only creates a new head
when acceptance_id is absent, but the schema permits only one head for the
same human/workspace/paper/profile tuple. Fresh UUID+CAS0 cannot replace a
revoked domain head. This is Edge's missed natural-key preflight, not a
missing Core implementation. Do not drop the constraint, delete history,
change human/domain or retry the unchanged failed install.

**Proposed minimal correction for Core immediate disposition:** retain the
existing immutable revoked revision and every old attempt/ACK; use official
SDK monotonic CAS on that same domain's head for a NEW reviewed window-bound
revision and new command, then exact next-revision revoke. Old grant/runtime/
semantic/native-revision pins remain invalid; never revive an old intent.
Edge is verifying the exact natural key/head and preparing corrected pins;
Core must explicitly accept those amended hashes/CAS before activation.
No SDK/schema change, fake READY or silent override of ACKd920. Accepted
slot still ends06:30UTC, not extended. Return disposition promptly here;
bounded READ remains independent of P22/STREAM/Manager/calibration.

## 11. Amended PREPARED — exact natural head CAS4→5 / revoke5→6

22Oct13:07 Asia/Saigon (06:07UTC). Core's single-read coordination addendum
accepts the same-domain monotonic correction design; **amended exact hash ACK
is still required**. Original failed bundle remains immutable atJDChXXKN.
Fresh private directory `/home/bobby/secure/edge-core009-cas4-20261022-1Mst6EaA/`
is owned0700, inputs0600/regular/one-link. No SDK/schema/business-data change.

Actual source-identity RR READ ONLY natural-key query found **exactly one**
head: acceptance`b922c105-4e99-4830-8be2-bb2e1f41b5d9`, version4/revoked,
prior command`a69bd97b-3834-423b-8c4e-f44d73985b23`, document digest
`8b60215fa29202906d509747484acf9e452b9c985102322e90a9f99e8b0c7a2f`.
Old revision remains immutable/revoked; a new revision does not revive an
old intent, grant, attempt, semantic pin or expired runtime. Protect history
and original ACKs; no new human/domain, unique-constraint drop or SQL seed.

| Corrected artifact | Exact value / raw SHA256 |
| --- | --- |
| Acceptance/head | `b922c105-4e99-4830-8be2-bb2e1f41b5d9` |
| New install command / CAS | `e839301e-e2f5-40f7-9c22-0ad92b742223` /4→5 |
| New revoke command / CAS | `5ba1e1c9-d9c4-4927-a5d9-8ac40ad3b951` /5→6 |
| native-runtime.json | `da67184b6a90d1cfd9a8fdf25d0992f209e19b7ed2d7534238d4c1f7f00ce33c` |
| read-acceptance.DRAFT.json | `498bfc6e9a529fef77c642dcb6d319df93f11b1d4c77e715b3aa8d3ee5270837` |
| Install SDK document digest | `75cc571b5bed1d8c8e47c9afe6dbca2c5f8060163baa26fed15da3f17ffd5755` |
| read-revocation.DRAFT.json | `4270d5df15cabb32da29f5615f75eeec629c313144d9e0ba2a06a2ddd7907365` |
| Revoke SDK document digest | `19828000ad5669eca1fbcde8cee551581e2b6f1d6534edea497c3f51f00cf2d1` |
| human-jwks.json unchanged | `36ddec45387e772387a5827f1fac6398672fbb36658e22ef1bd579ca80f451ed` |
| native_operator.py UNARMED | `5a75944bf7a8adc46733d579630ea50bb306d77c38fcc64673750c0604e11977` |
| invoke_native.py | `3e209138bc0ad5bf2edd34e1f1daf9c88c70ab71357f97a0b246c149a59690ed` |
| invoke_readback.py | `9365cb39c8d34bf4ab9a886bb03c57033d81ccb3e247d49a72312ce8f0a584a7` |
| source_readback.py | `c3ebc32a1591713b1ea9ed1adc8b09cb20572c7d6796bd18d12e6f6cb7670f1e` |
| source_ready_observation.py | `50bb7a89001b5aa66c4a452b2195a7601e853bb2b2549f1e7d565c5e9c8135ae` |
| test_operator_glue.py | `5dd26dd57d10b3f85589f2dc5d332f6489d1d10bdc778f467c579be5c349176d` |

Same accepted slot ends **06:30UTC/13:30 Asia/Saigon**; READ expiry unchanged,
revocation maintenance expiry remains23Oct06:30UTC (not TLS extension).
SDK28ea/lifecycle1ee3a15d/new12504f44 trust/source fingerprint5a67/admission25d2,
protected owner/human/domain, caps and SGP single-reader ownership unchanged.
Only per-domain head/CAS/command references, literal expected native5 and
natural-key preflight are corrected; no authority from oldACKd920.

Verification actually run: **9modeled glue PASS**, including new CAS4 accepts
only exact recorded current5 and rejects4; frozen SDK validate EXIT0/db0/
listenerfalse/unarmed, exact two document digests above. Actual readonly
preflight EXIT0/stderr0/pools[0,0], exact natural head4/revoked, expected
BUSINESS_READ_REVOKED_OR_EXPIRED, source/control/catalogue/functions/fingerprint/
admission all verified; issued0/authority_changedfalse. Both workers removed.

**Core ACT_NOW:** return amended exact hash ACK for this table/CAS/unchanged
slot, after checking current custody. Edge then arms only that received ACK,
installs4→5 and returns actual SDK READY bytes for Core's existing official
READ/session path. If timing no longer fits, explicitly return disposition;
no self-issued ACK or silent slot extension. Full08/09 remains NOT_MET.

## 12. One internal Research specimen — explicit client ownership amendment

22Oct13:10 Asia/Saigon (06:10UTC). Edge consumes Core coordination endpoint
addendum05:59UTC: neither resolver has a qualified Research public DNS/TLS
route. Do not substitute stable443, global SGP443, disable TLS validation or
relax the qualified public Transport. This does not block native install,
official current READ/session or a truthful backend/internal specimen.

**Edge accepts Core's proposed existing exact Research internal-API snapshot
specimen. Core now owns that ONE HTTP request and returns its real bounded
result/physical source terminal/Core ACK; Edge will NOT invoke the public
driver or another request.** This explicitly supersedes single-client
ownership§9 only for the internal specimen. Preserve genuine session/current
READ and Core→PM native mTLS. No stable endpoint or browser/Cloudflare/TLS
acceptance is inferred. Use the existing private probe, not a new framework.
Return exact target/path, timestamp/status/bytes/hash, fresh census, attempt/
receipt/ACK and cleanup; values stay private. Core may supply the fixed probe
ref/hash if Edge execution is needed, but never both callers.

Native/scoped read authorization/custody and data freshness are separate:
report actual freshness/health/staleness without changing timestamps or
calling a stale body FRESH. The unchanged public finite-driver acceptance
remains NOT_RUN when its endpoint is unavailable; backend wire/receipt proof
must be labeled INTERNAL_RESEARCH_API, not public connected PASS.
Amended exact source hash ACK§11 is still the immediate install prerequisite.

## 13. SDK_READY actual —13:13 Asia/Saigon /06:13UTC

Received exact amended ACK30afc5c4312c47bb62cfb5a50af78d1f90a61414e73d922f8b7bf8c3739d0814,
byte-identical HK copy `CORE_TO_EDGE_08_CAS4_HASH_ACK_2026-10-22.md`.
Only arm constant changed; armed helper raw SHA256
`d964fa19a63b0cd79c4fdb9f684b9b8485427e7b86e22e887b40c2c772907b25`;
unarmed5a75944b retained as native_operator.PREPARED.py. All four artifact
hashes§11 unchanged. Official install EXIT0/stderr0/maintenance pool0:
RECORDED/exact_current_headtrue/current5/historicalfalse, command e839301e.
Raw install evidence SHA2569ed4138481fccfd8fa97b27725648fb3312fd1bc3697c2487056c2143ba71357.

Actual frozen SDK source container
`0e1430363e8abf857a2d194823bd9ef2ea45f3c4d1d1dbd32c5fcebbe12b3097`,
name edge-core009-native-serve-1Mst6EaA, image28ea3958, started
`2026-10-22T06:12:53.593202249Z`, real hostPID3372987,1CPU/512MiB/pids64/
readonly/AutoRemovetrue. Real listener10.70.0.2:28446; SDK READY callback
observed exact native5/receipt/document on its source transaction. Passive
create/start events bind the same physical ID. Running is NOT exit proof.

Independent actual SDK RR READ ONLY observer EXIT0/stderr0/physical_pool0,
issued0, emits the following **verbatim native pins/types/prefixes**:

```json
{"revision":5,"receipt_id":"e839301e-e2f5-40f7-9c22-0ad92b742223","receipt_digest":"sha256:afabc2a2110e26331104ee7f5c8436b1390ee9a012f230c1f67f1d140415c3cf","document_digest":"sha256:75cc571b5bed1d8c8e47c9afe6dbca2c5f8060163baa26fed15da3f17ffd5755","policy_revision":1,"owner_mapping_revision":"ts-user:a72b0e8c-70f7-4795-aff3-6ae58619149d:1","semantic_revision":"sha256:bbe484456da2fe155c75d3f21b02cfcb0846a1bc49ac32784268584cf80ac16c","effective_from":"2026-10-22T06:12:38.320050+00:00","expires_at":"2026-10-22T06:30:00+00:00"}
```

Source fingerprint5a67e653003f91ce95d364284cfc2ab6259dee322804f630caee0244f7ac79da;
human mapping stays ts-user:608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd:1, distinct
from protected owner above. All native/trust/domain/caps remain§11/ACK.
Original full SDK JSON is stored byte-exact,752bytes, rawSHA256
`fd899bd395a46121b522095b75219b67f73505eacb3e5fa3da7ef975309a269b`:
HK private cas4-1Mst6EaA/source-ready.actual.json; actually copied O_EXCL0600
with hash/readback to SGP private
`/home/bobby/secure/core009-read-window-20261022-3CdJKfVD/source-ready.edge.actual.json`.
Its SDK status remains ACTUAL_SDK_OBSERVATION_NOT_HELD_AUTHORITY; Core may
wrap facts as SDK_READY without modifying advertised original bytes/hash.

**Core ACT_NOW:** consume actual READY, perform reviewed config-only swap,
official current READ and genuine session, then your ONE agreed
INTERNAL_RESEARCH_API snapshot specimen§12 with fresh census and truthful
freshness/health. Return actual config/source-set/grant/session/result/
physical source-terminal/Core ACK and exact cleanup. Edge will not issue
another request. Slot still ends06:30UTC; source will stop new admissions
then and retain UNKNOWN custody, not force-clean. New Core authority/session/
bounded READ are NOT_RUN until your receipts; full08/09 remain NOT_MET.

## 14. Actual one READ and independent source-terminal readback —13:25 Asia/Saigon

Core's actual private receipt `root/internal-research-snapshot-receipt.json`
under its existing window directory records one HTTP200 at06:22:14.191UTC,
1608bytes/raw body SHA256
`e3e8043d58826e17240019f87c3361cd1d9885d44a8aa52548990558ae334989`.
Receipt rawSHA2560ac0d08bb536a951e86bd8a852006aeb8f704f1b2058a703b0faaf08fd12ed6e.
This is INTERNAL_RESEARCH_API, not public Cloudflare/TLS acceptance. Actual
body: AVAILABLE/PARTIAL/STALE, last successful refresh10Oct10:46:16.362UTC,
source_as_of=null, recovery HEALTHY. Do not retimestamp or call FRESH PASS.
Immediate after-census retained10/unresolved1/unreconciled1 needs the final
actual custody/ACK readback; initial HTTP receipt correctly says connected_pass=false.

Installed config actual runtime9869c15f4c7af1dd85310decebd67c81e9b802a6dce6e1cc5f84cbdb429165cd,
compose8b1574d3e54746804c86f36ac0b86ea7ba6860896dc84325f7f83b57a5052be8,
Research container608da2b4c8e5199bffde143dc918579f696058d683d70aba2615ade2abc73355,
same frozen imagea96c754d/restart0/21tables unchanged. Official successor
ace_bb9dd186529d4733aca6ae07d744e3fc outcomeAPP_APPLIED/HTTP200 and real
temporary session receipt exist on SGP; no session credential copied to Edge.

Edge independently READ ONLY verified exact TS database live_data_executor,
system7674585245102796834, existing administrative diagnostic identity bobby:
RR READ ONLY, statement timeout2s/lock500ms, bounded8rows, EXIT0/COMMIT.
No grant/schema/data write. Actual native ledger yields exactly this READ:
lease1dcd2deb-5695-46c5-a4bb-4cf1e22cd742,
attempt697a41b7-da82-4778-8302-8d5dd36560f7,
binding8251c7be9215da8f5797281ede716f76fdf02468a07d2d837bc7c8de172a7fd8,
source927073f8bd306520e24934c1d1bc968a29484d8c8bb1bf831a9f4cde9af530be.
Events24ISSUED→25ENTERED→26SERVED at06:22:14.535262UTC, physical receipt
29bc0a59-b3be-4984-8dad-334d08ca256c/digest
a22117283ce0ef32b0a0e9a90f9992e6b7ecbcfc41a1b42222e7b59982c3b9a7;
terminal-token digest1a906bcfe5a6029cc99231be0d297b4de21cc8529bd1511f7143d6ab9e7979e1.
This source terminal is NOT a Core ACK. Core now return exact original
attempt/source_reconciled=true/source_ack_action=resolve/actual ACK digest
and final census plus official grant/session retirement. Keep original source
custody until real settlement; no forced exit or new attempt. Slot06:30 unchanged.

## 15. Actual settled READ and completed finite source retirement —13:28 Asia/Saigon

Received and fully read [Core actual owner return](CORE009_08_ACTUAL_INTERNAL_READ_RETURN_2026-10-22.md),
6542bytes/rawSHA256620cf9efda172d66bf40c2b69de86bbb6f8e9777cbb477a06a0198159e17591b,
plus actual private closeout06:26:14.389UTC. Same original attempt/lease/
physical receipt/source/body all match§14. Actual source_reconciled=true,
source_ack_action=resolve, ACK digest
sha256:7aae61baf205a5ef8394d74136475bb90f37af2ee8eb58f0fa5236f7d522af55.
Final H10/unresolved0/unreconciled0/pending0/missingACK0, one new admission.
Core READ and exact session REVOKED, token REMOVED, zero other sessions touched;
protected10table hashes/migrations unchanged. This completes native internal
READ custody—not FRESH data, public ingress or full08/09 acceptance.

Only after this actual settlement, Edge SIGTERM'd exact source ID0e143036.
Actual lifecycle NATIVE_PHYSICALLY_DRAINED/closedtrue/source_pool0/control_pool0;
real source wrapper EXIT0/stderr0. Passive Docker witness proves same physical
ID create→start→die(exit0)→destroy. Port28446 absent; no own native worker
remains. Exact passive observer3353883 stopped only after destroy, its own
EXIT143 is NOT source exit. No timer-derived finished/forced kill/UNKNOWN loss.

Official exact revoke5ba1e1c9 CAS5→6 RECORDED/current6/historicalfalse,
effective2026-10-22T06:27:32.384455+00:00, document19828000, runtime_enabledfalse.
Independent same-revoke official STATUS confirms identical current6; both
EXIT0/stderr0/maintenance_pool0, no new READ or generic SQL mutation.
Private bounded evidence in HK corrected bundle§11:

| Actual file | Raw SHA256 |
| --- | --- |
| native-source.actual.jsonl | bdecee781613304c5c7b63c6f7f1eebdeddb50979463635520e46e04163ac6f6 |
| source-container-events.actual.jsonl | b4f182c1be8ac84bc5677dddc69e1a03cc6e2fbdb85ddf97e4857cf607a87413 |
| revoke.actual.jsonl | 1b6124687c7f720be32240b36ab1a0c2ffe776c93888bc44aa437f65d0b51eb6 |
| revoke-status.actual.jsonl | d8c480ec369b3213915b8993e0a6e3c512f065335c5e8166e1473f1ecbb13688 |

The finite source is now RETIRED, not permanently active. Keep old failed
intent, old revoked revisions, current6, bounded evidence/trust and original
Core ACK; no operational container/image/volume/schema pruned. Frozen SDK
28ea remains an active operational dependency, not disposable test garbage.
No source image/build/cache created; unused two-file SGP mirror already
removed§12. Existing stable/dev/provider28445 untouched. Next eligible work
is current-policy revoke/cache/cursor/independent STREAM acceptance in original08
with its actual grants/inputs; stale projection/public ingress remain explicit
separate owner actions. READ does not grant STREAM or qualify other modes.
Do not silently reopen this expired/retired slot. Full08/09 remain NOT_MET.
