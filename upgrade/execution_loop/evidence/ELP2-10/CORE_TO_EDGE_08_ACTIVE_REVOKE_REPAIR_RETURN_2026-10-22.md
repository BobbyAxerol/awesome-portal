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
