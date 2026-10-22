# Core → Edge — missing active-revoke specimen: repair and new-window proposal

22 October 2026. Owner: Codex, Core reviewer/integrator/operator; Claude keeps Portal implementation/UI. **REPAIR_READY_OFFLINE / NOT_READY_TO_BIND. Full08/read09 NOT_MET.** This return answers the new owner request explicitly. It does not reopen retired source8, extend a grant or claim connected repair acceptance.

## 1. Exact inputs and original-state diagnosis

Read and hash-verified the [final actual source retirement](EDGE_TO_CORE_08_STREAM_ACTUAL_READY_2026-10-22.md): `28bdcaca3b450abc34dcdb0a064e51d072c0c7da6be926d1bfcca8a5f9ad9e0c`. The [original Core partial return](CORE_TO_EDGE_08_ACTUAL_STREAM_PARTIAL_RETURN_2026-10-22.md) remains `3d1be141fdb8fe4b6afbd7c43a1f873ee8c65b06f6460bc94b2b95f31cc4848b`; [installed config return](CORE_TO_EDGE_08_STREAM_CONFIG_RETURN_2026-10-22.md) remains `845769057b6803b52e4b7cd88f9462cc3196eb08140a37a71f2ba69511395c71`.

The [first repair/correlation handback](CORE_TO_EDGE_08_ACTIVE_REVOKE_RECOVERY_REPAIR_2026-10-22.md), current hash `5ed53b2beded073a2c35365133500ec64bc9f35f73c90559df19502fcb2e8831`, retains v1 failure, exact mutation/artifact identity, physical process exit and the late recovery. **`MANAGER_REVOKE_DRAIN_PENDING` is an outward classification, not the root-cause diagnosis.**

Additional actual read-only audit was taken from Research in one `REPEATABLE READ READ ONLY` transaction with3s statement timeout and ROLLBACK. Private sanitized receipt: `/home/bobby/secure/core009-stream-window-20261022-1OXiioSB/root/original-revoke-correlation.json`, 13,724bytes, SHA256 `3de362006f84276521f724e434b0be268ddb503db3d18969d857461fd3b74125`. It includes immutable mutation/native event history, all15 native final rows and global census; no base body, bearer, cookie, credential or authority write.

| Original fact | Exact observation / interpretation |
| --- | --- |
| Last resumed frame | lease`fec4d32b-6bbf-4284-8df9-f225a8667e64`, attempt`197ef0b3-f92b-4431-a83e-35b69975fef6`; expiry07:38:28UTC |
| Event79 /80 | `SENDING`07:37:59.507215Z → `SERVED`07:37:59.519773Z |
| Original mutation | `0fe27d1b-3ec3-43e2-89df-fdbca22cc411` created07:37:59.557126Z, while that frame had not yet reached its last recorded update |
| Event81 | Another `SERVED` update07:37:59.938081Z. Trigger time is not COMMIT time; phase-only history does not by itself encode when the source-reconciled bit became true |
| Client / final CLI | Subscriber transport error/census0 unresolved at07:38:00.082Z; physical CLI exit75 at07:38:00.673Z, fixed grant expiry07:38:34.515Z |
| Exact final source ACK | Last frame now has `source_reconciled=true`, action`resolve`, digest`sha256:fe90958ea059c177ac1d232a0d42100dc8c934afa760ea8980f22899239150b2` |
| Global state / same-intent outcome | H16/unresolved0/unreconciled0/pending0; no reverse-family event in this interval; original mutation ultimately FINISHED with the preserved late `NOOP_EXPIRED` receipt |

Source diagnosis is narrower than a guessed writer defect. Installed coordinator/candidate/revoke/composition/schema bytes match canonical review source. `current-human-candidate.sql:197–200` defines native unresolved as **NOT source_reconciled**, not whether the socket has closed or phase is SERVED. `current-human-mutations.ts:172,187,261–280` opens a durable drain, runs one bounded recovery pass, then checks global unresolved state. A cold CLI cannot invent the API owner's physical-close witness (`current-human-candidate.ts:1205–1259`). Final source ACK is distinct from local delivery completion. This audit explains the relevant in-flight drain/ACK interval; it does **not** preserve the exact failed pending-query timestamp/count or swallowed source-recovery exception. Therefore the precise private exception subtype at the first CLI return remains **NOT_OBSERVED**, not manufactured from the public code.

**Proven actionable defect:** the v1 operator abandoned the known closed/retry-required original intent despite about33.842s remaining, then retried only after expiry. That scheduling error prevents proof even when original custody settles. No capacity/constraint/UNKNOWN fence weakening or replacement intent is warranted. The exact artifact hash remains `2df2a1c527af877d13676828851804e8d0425ab058aedb37bcc36cb389293adb`, revocation id`core009-stream-revoke-53f0f9d4-956d-4a78-922d-e6a6e6a0a6cf`; it is historical and is not reused for new authority.

## 2. Repair / tests and source-only integration

The first return gives actual v1/v2/helper/operator hashes and **34/34 offline tests PASS**, including bounded Docker-stderr framing. Same-artifact continuation is limited to one known physically closed typed75, preserves10s of original TTL/window, and rejects UNKNOWN, refusal, changed hash, insufficient time, second75 or NOOP_EXPIRED. No Portal authority semantics changed and no original receipt/ACK was replaced. An active-revoke-only probe is being separated from the already-proven restart scenario; its exact final pins/tests will be appended before READY.

Claude backend query/clock review is ACCEPT at source level; genuine disabled/locked fixture positives have been corrected only in the isolated integration checkout. Claude`3aaf24f4` + private P22`122fc5f1`/G2`3d4164bd` + canonical successor/docs are frozen together on tree`4309b7907b508d7d726913201f4161d1c48402ef`. The one normal hook is still running; no code mutation or second heavy gate runs concurrently. This source-only tree is **not** the installed image and is not a commissioning receipt. Claude WIP is untouched.

## 3. Actual installed pins versus proposed future binding

| Layer | Actual pin / status |
| --- | --- |
| Research Core source/image | `8ac4f5530adfcfc6f5ecfb92da55bb56329df92d` / `sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121` |
| Core schema |149; no migration/schema change in this repair |
| Serving container |`46c94107ed4bd9d227d83ab31c023be22fae1d6b5c7b961acb13f15e9ca1d0bf`, healthy at original cleanup |
| Installed runtime / compose |`a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168` / `ce33906393df4a3de6e7e3758e02d014b822a9d559fda73863de56220ae66bc4`; **old scope expired**, not current READY |
| Native Research trust |`12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`; source proposal validity through23Oct03:00:58UTC; recheck exact leaves before new ACK |
| Bounds |Approved ResearchC288/reserve20; API1.5CPU/1024MiB/pool3 + one official CLI0.5CPU/512MiB/pool1, total2CPU/1536MiB. Not G2/calibration/production budget |
| Source head |Edge official native7→8 retired and physically gone. No new source manifest/window/config installed |

## 4. New proposal — do not bind yet

**Proposed availability:22Oct08:50–09:20UTC**, subject to completed integration gate, actual source-owner PREPARED hashes and mutual ACK before opening. If either owner misses the start, return a new proposal explicitly; no silent extension/reopening. This is an offer, not permission to arm an unspecified source.

1. **Edge:** return PREPARED manifest/source/image/config/runner hashes and current monotonic predecessor/CAS, native trust validity and bounded cleanup. Propose the fresh revision only from actual retired8 state; preserve prior intents/custody. Do not start listener or call READY before Core's exact hash ACK.
2. **Core:** after gate result and fresh proposal, validate/re-pin exact private composition and perform only the approved config-only Research binding. Issue a genuinely separate current READ control and fixed60s STREAM via official writers; never copy stable authority. New case has its own reviewed artifacts; recovery within that case retains its exact artifact/hash/revocation_id.
3. **Missing specimen only:** one required fresh-source cursor bootstrap, one subscriber receiving a real heartbeat, official active STREAM revoke while API/subscriber remain active, prompt same-intent continuation only if needed, REVOKED before fixed expiry, stream denied and independent READ still allowed. The bootstrap/control reads are dependencies/control observations of this case, **not a rerun of the completed READ qualification**. No repeat restart gate. Exact admission census is returned.
4. **Cleanup:** preserve original source-terminal/UNKNOWN fences and original ACKs, settle obligations to0, retire only the case's grants/session, remove only unused tool credential copies, retain audit/backup/serving references. Then Edge drains/retires the exact new source and returns real physical exit/pools/STATUS. Never label natural expiry or EOF alone as revoke PASS.

**READY disposition now:** offline scheduling repair ready; operational binding **NOT_READY** pending final one-shot gate, active-only runner pins and exact Edge proposal/ACK. No request for renewed overall phase approval. Manager trust, financial mapping, budget/calibration, coexistence/G2, private P22 installed cache/control and Claude browser acceptance remain independent gaps. No stable/dev/main/provider28445, command/Live, push or release change.

## 5. Active-only runner finalized —22Oct08:28UTC

This addendum supersedes only the pending active-only runner statement above, not the original observations or binding preconditions. Invoke the new specimen with `node stream-probe.mjs --active-revoke-only` in a **fresh prepared private directory**, never in the already-used receipt directory. The repaired runner is private operator tooling, not a new installed Portal writer/image.

| Private artifact / preserved version | SHA256 |
| --- | --- |
| Active-only capable `stream-probe.mjs` |`2512c64ccd0ce2de4c3252fa3adf602becc74fa1bbbfdad1d61fcec61b5a6135` |
| `stream-probe-recovery.mjs` |`7f4b9927cbb98c98b5c318da3b71c73fe3264e79a93eeffe4caa93a7a7ea66c8` |
| Focused offline helper/probe tests |`ee3bc6fb9b748625580051ed216446546c61241a70eca9371294a37719e4da5c` |
| Unchanged official-writer operator `operate.mjs` |`6e42b246e6fabd0aaeeb60ff00f89dd842c0e498f189c04b9458fe576d49c09b` |
| Preserved actual-used v1 / preserved v2 probe |`40532b965fb3a01564aed25eb6ed1a4a2d8abefab9eb64cb9ab4894ea066900b` / `f164048fc112a4f30df7469d936693788bc4521007e78e635dacfa1137f923dd` |

**46/46 offline tests PASS**,0fail/0skip,185.86ms; syntax PASS. These tests prove operator scheduling/framing/argument handling only; they create no Docker/DB/native/source receipt and do not close connected active revoke. Root reviewed the helper and probe; source implementation ownership remains Claude's, with no Portal code changes requested by this repair.

Active-only takes exactly one positive typed-heartbeat subscription, never quiesces/restarts the API or subscribes twice, and asserts the API PID remains unchanged. It performs exactly **two bounded finite reads** (12s each): new-source cursor bootstrap and independent unaffected READ control. The original full restart mode remains preserved but is not selected for the missing-case retake. Known physical exit75 can receive only one prompt same-artifact continuation with10s original clock reserve; UNKNOWN, ambiguity, refusal, changed hash, insufficient time, another75 or natural expiry remains a failed specimen. It accepts only a real `REVOKED` receipt before the original fixed expiry; `NOOP_EXPIRED` never passes.

**Status after this addendum: runner READY_OFFLINE; binding NOT_READY** pending the already-running single combined normal gate and Edge's new exact PREPARED manifest/window/trust hashes. Proposed08:50–09:20UTC remains conditional, not an installed window. Edge can return preparation pins immediately; do not reopen native8 or infer a source listener/grant/session from this return.

Verification: R0 Markdown-only; `git diff --check` and `scripts/execution-tracking-test.sh` PASS; local linked targets/hash pins reviewed. Public copy contains no credential values. Hook/build/DB/native calls are deliberately not repeated for this documentation delivery; the independent frozen integration gate remains running. Sanitized delivery is checked by SHA256 on both hosts. Source fences, custody and cleanup remain unchanged.

## 6. Superseding repair review and NEW availability —22Oct08:54UTC

**SOURCE_REPAIR_TESTED / RUNNER_READY_OFFLINE / BINDING_NOT_READY.** The08:50–09:20UTC offer above is withdrawn: no matching Edge PREPARED/ACK was received and the additional typed-denial defect below needs its qualified image. **NEW proposed availability:22Oct09:30–10:00UTC (16:30–17:00Asia/Saigon)**. This is preparation availability only, not an armed source, approved config or silent extension. Return exact fresh PREPARED pins; Core will ACK their actual hashes before any source activation. If either owner misses this offer, propose another window explicitly.

### Actual full integration gate, not runtime deployment

The single normal hook completed EXIT0 at08:45:22.508UTC, merge commit`de8f63824fbe89d20f6cfe601a436c8c69f21294`, frozen tree`4309b7907b508d7d726913201f4161d1c48402ef`. Contracts91files/1,633tests PASS; Control API488files/10,015tests PASS,4files/7tests explicit skips; corrected BE-P23 genuine disabled/locked PostgreSQL positives10/10 PASS. Migration/restore/security/query/governance and tracking checks PASS. Private497,079byte log SHA256`6af9d652ad5c29675728bd9431a5a5011035a9b11bf174544316360b25364b4f`. This qualifies the recorded source tree, **not** a new connected specimen or installed image. Private P22/G2 ancestry and newer canonical operational Markdown are preserved without another full hook; Claude WIP stays untouched.

### Two additional false-positive paths removed

1. The actual scope issuer omitted`AccessPolicyError("ACCESS_DENIED")`; revoked/missing STREAM became sanitized503`EXECUTION_READ_AUTHORITY_UNAVAILABLE`. Narrow source repair maps it to existing403`EXECUTION_READ_SCOPE_REQUIRED`; genuine DB/provider failures stay503. No grant, authority rule, API field or source fence is relaxed. Focused real-module/mocked-effect tests56PASS; the separately PG-gated read-scope file is explicitly117SKIPPED in this host run, not claimed as new PostgreSQL coverage. Build/typecheck and exact repair commit/image pins follow in the next addendum.
2. The original post-expiry409 body was`SNAPSHOT_REQUIRED`: its private follow-up omitted`Last-Event-ID`. It is **not** an authority-denial proof. Original partial/failure receipts remain immutable. The repaired probe uses the actual signed cursor and accepts only the matching existing typed403/404/409 authority codes, with unchanged retained census and0unresolved/unreconciled/pending; cursor/generation/capacity errors do not pass.

### Current private operator pins (supersede §5 versions)

| Artifact | SHA256 / actual validation |
| --- | --- |
|`stream-probe.mjs`|`9649c2e0cda16c3c50f9ca9cab9e9a708b7f8a62027f9ea4c014f5f2f3c384d0`|
|`stream-probe-recovery.mjs`|`6797eed448eb473f8fc8d429671acbc756cc350b2324a3a2e18f62e45fa6d3f5`|
|Offline recovery tests|`c083db6cebe05996a42a23b315980b90a17557acfaa2b04af4b943333e933fd4`;103/103PASS,0fail, syntaxPASS|
|Fresh draft`prepare.mjs`|`c7ce1b1a684e431dd062610421ca6782da1404786c670881f05d69d7fa9d8bc8`|
|Fresh draft`operate.mjs`|`373aa97db5c3d2fd29b029851ace05449c249204eff49161e7f0289f8065fd28`|

Private fresh draft directory`/home/bobby/secure/core009-active-revoke-20261022-SAmgpeJ7/` contains **no issued expectation, grants/session or installed config**. Schema/pin guards and capacity boundary extraction9/9offlinePASS, syntaxPASS. It requires present, well-typed values on both expected/actual READY; exact future qualified image/source; separate rollback image; fresh capacity check after quiesce and immediately before live STREAM apply. These private operator checks are not new Portal/Edge authority or source acceptance.

One subscriber, no restart/resubscribe; keep the conservative **entire fixed60sSTREAM producer bound244**, not the55s client hard-stop. Source Manager cadence is250ms, not the unrelated Fleet5000ms. Missing-only capacity minimum is **H+20reserve+244STREAM+2finite reads = H+266≤288**; last observedH16 gives282 and6headroom. Recheck fresh H/custody before applying; H>22 refuses, never prune audit or enlargeC. Denied reconnect must be rejected before admission. Positive bootstrap/control reads are not READ requalification. API1.5CPU/1GiB/pool3 plus one CLI0.5CPU/512MiB/pool1 remain unchanged.

Only an actual non-client-induced subscriber closure can accompany success/recovery. Native writer deliberately destroys the socket, so a transport read error is recorded as such, not falsely relabelled clean EOF; local abort/parse/size failures are not a physical revoke witness. Neither closure alone nor`NOOP_EXPIRED` passes. Official`REVOKED` must precede the original fixed expiry, preserve exact artifact/hash/revocation id, keep API PID unchanged, and satisfy typed denial/independent READ/custody checks.

**Edge next action:** return fresh native revision>8/current predecessor CAS, source image/config/install/revoke/runner hashes and actual trust coverage for the NEW offer; do not arm until exact Core hash ACK. Old native8/listener/grant/session stay retired. Installed Core remains the old a96/image/schema149 and expired runtime pins in §3 until an explicit actual installation addendum. No current READY or connected PASS is inferred. Full08/read09NOT_MET; Manager/financial/budget/calibration/G2/browser remain independent.

## 7. Actual repair source and minimal candidate image —22Oct08:59UTC

Source repair commit`3265ce18745560cfad391e81054b7aa46eac9097`, source tree`d5079012f0ee3257ad7029ebe544387ea02ca3c5`,2backend paths/+47/−1. Production API build EXIT0; target real-module/mocked-effect56PASS/117PG-onlySKIPPED as §6. Ledger refresh reports unchanged/current,`runtime_effect:NONE`. No frontend, generated contract or policy/permission change.

Actual **uninstalled minimal image**:
`sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069`, local tag`local/elp210-core009-active-revoke:3265ce187455`.
To avoid repeating the expensive compile or deploying unrelated source, this image derives from the exact installed a96 base/source8ac, replacing **only**`/opt/control-api/dist/execution-v2/read-scope.js` compiled by the passed build from the one-line mapper repair. It is **not the entire integrated Claude/P22/G2 tree deployed**. Source TS SHA256`136b2e92a9668e5340e5e1b60c0ee9c910d4b171dc6fd41386256a448b001056`; compiled module SHA256`3904bf5f68c2f67fd03357be67850c6e056bd3d1d8a349ab576566d60c1bd3aa`; Dockerfile SHA256`8dc21af7288a7de24f8be30efc4485bd080278314ea18c82b2eaaeb417693ce6`; build-log SHA256`c83f3cfc791ba64c78bd1d7ee0f192acb79e13c737535c6378a4fc84247dca19`. Offline no-network/read-only image probe confirms exact module and UID1000; it is image-content evidence, not an API/connected permission proof. The1.54s build used the existing heavy lock; first root O_CREAT lock-open failed before build and was corrected by read-only opening the same inode, with no lock permission change.

Private image receipt`/home/bobby/secure/core009-revoke-image-20261022-NihgQcOt/image-receipt.json`; no credentials in build context or image. The no-network probe used0.5CPU/128MiB/cap-drop-ALL/no-new-privileges/--rm; no API/source/DB/config was changed. Keep both a96 rollback and new image; no shared image/cache/volume prune.

The fresh preparation and operator pins in §6 now explicitly require this qualified candidate image/source provenance and a new actual Edge READY before creating any private expectation/config. They retain the separate original a96 rollback image. Current installed image/config/schema remain §3, **no fresh config/schema receipt exists yet**. Broad all-test-fixture typecheck EXIT2 is separately disclosed in the [integration packet](CORE009_INTEGRATION_CUT_2026-10-22.md#actual-final-gate-and-additive-repair-22oct2026), not claimed PASS. It does not alter the production-build and focused-test results above.

**Current disposition: SOURCE_READY / IMAGE_CONTENT_READY / RUNNER_READY_OFFLINE; CONNECTED_BINDING_NOT_READY.** Edge can prepare the NEW09:30–10:00UTC offer immediately and return exact manifest/window/trust/CAS pins. Core then validates and ACKs those actual pins; only real fresh READY permits the approved backup/config/image swap, official separate READ+fixed STREAM, and missing active-revoke specimen. No old source/grant/slot is reused. Full08/read09 staysNOT_MET until the genuine before-expiry receipt, not merely this handback.
