# Edge → Core — NEW independent STREAM/revoke/recovery proposal

22October2026. **SOURCE_ARTIFACTS_PREPARED / UNARMED; SDK_READY_NOT_RUN.**
Continuation of original EPG10-08/read09, not another phase or new business
authority. [Unified](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-independent-stream-proposal-and-read09-continuation-22oct2026).
Read current Core actual-return and AFTER_REAL_READ_OWNER_ACTIONS in this
directory. The completed internal READ/SERVED/Core ACK and native revoke6
remain historical immutable proof; do not replay that request, session or slot.

## 1. Window and exact source artifacts — PREPARED, not installed

Propose **22Oct14:15–14:45 Asia/Saigon =07:15–07:45UTC**. Core must return
the exact hash/window/one-client ACK before arm/install. A late or incomplete
ACK does not shift this slot or extend expiry. No listener/process is scheduled.

New private preparation on HK, directory0700/files0600/Bobby/regular/nlink1:
`/home/bobby/secure/edge-core009-stream-20261022-2pOaSGvN/`.
No credential/key copied into it. Existing root-only DSN references are read
only by the qualified wrapper into private stdin, never argv/log/chat/Git.

| Artifact / invariant | Exact proposed pin |
| --- | --- |
| Domain acceptance head, unchanged identity/domain | `b922c105-4e99-4830-8be2-bb2e1f41b5d9`; actual6/revoked |
| NEW install command / CAS | `23d39406-f294-45d5-9ddb-d72800da0ea1`;6→7 |
| NEW revoke command / CAS | `84d18247-cb75-45b5-9a4e-26fbde231e3a`;7→8 |
| `native-runtime.json` raw SHA256 | `da67184b6a90d1cfd9a8fdf25d0992f209e19b7ed2d7534238d4c1f7f00ce33c` |
| `read-acceptance.DRAFT.json` raw SHA256 | `48b2c15029acbfcfd55f4237c200df326c56320ffcdb72970327b98b6eca3118` |
| Install SDK document digest | `585dc37c8ad82cbba9fa5517a32b6cb7d9e14c4801be59a50f494852039bb448` |
| `read-revocation.DRAFT.json` raw SHA256 | `2ddd06b89e00e19ba957553803ffe57ae572d7b22512a06251f4be5dd34f31ad` |
| Revoke SDK document digest | `0f20ec80b625f43ce6301f20fff8707efd977b1e157d84e7716bacc6321c1b18` |
| `human-jwks.json` unchanged raw SHA256 | `36ddec45387e772387a5827f1fac6398672fbb36658e22ef1bd579ca80f451ed` |
| UNARMED `native_operator.py` and `.PREPARED.py` raw SHA256 | `e8ae0e405f6b92864d02e5ad6169896adcc536f2974f856fe41c4afccfe0b0e0` |
| `invoke_native.py` raw SHA256 | `ad505f700565f0ae70576c18ddda5cca6dca4c25356d31b617430857ee3b8ab2` |
| `invoke_readback.py` raw SHA256 | `d21e59ab131a5c942c434b375c2080eb67b8034b304ce8a99dc8025255f7a844` |
| `source_readback.py` raw SHA256 | `e91a77a1cd3b410cd811eb51c1c28ad072780e6d5148d1af383bf15dea1fc2a9` |
| `source_ready_observation.py` raw SHA256 | `8e9b5673553388c5d454bfbef07026b638d5a887c9998981523b898f0de7fed3` |
| `test_operator_glue.py` raw SHA256 | `4a6504c7ae446dfd50a060932f8da5ee5d062d899ed20e71f82837af626ee698` |

READ/source expiry07:45UTC is not the separate revoke-maintenance expiry
23Oct07:45UTC. The latter permits exact retirement/recovery, not new reads.
Same-domain new monotonic revision preserves old6/old failed intent/receipts;
no old intent revived, head deleted or unique constraint/schema changed.

## 2. Frozen source, identity, trust and limits

- SDK image `sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`.
- Closure `/home/bobby/.local/share/portal-execution-operator/closures/sha256-32119f66b5cb54ee1242cf4cef6f8086f0618e1d8062294aa0af356ce4914a63`.
- Lifecycle SHA256 `1ee3a15db548c2a472fe195a23af6905da36ca690eebcc7e3e5d774de2a8a632`.
- Candidate native endpoint `10.70.0.2:28446`, TLS1.3/mTLS only. Expected
  worker `edge-core009-native-serve-2pOaSGvN`,1CPU/512MiB/pids64/read-only/
  cap-drop/no-new-privileges/--rm. No worker is started by this proposal.
- Trust `/home/bobby/secure/edge-core009-trust-20261022-5e3a2ac0/`, exact8files;
  trust rawSHA256 `12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`.
  Workload `elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm`, human audience
  `urn:elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm`, Core kid suffix`:core`.
  Native trust validity ends23Oct03:00:58UTC, beyond proposed source expiry.
- Exact DB `live_data_executor`, system`7674585245102796834`; source fingerprint
  `5a67e653003f91ce95d364284cfc2ab6259dee322804f630caee0244f7ac79da`.
  Source/control roles and pinned function/catalogue/admission hashes are
  unchanged in runtime above. TS4096retained/8unresolved is NOT Core C288.
- Human `usr_5a38d5dfb08b44748f5776fbe04a1434` ↔ TS
  `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`/mapping1, workspace
  `ws_06G19F61YB8CFR7TEWMS7HQ660`, Paper profile`PAPER_BINANCE_USDM`.
  Protected owner remains `usr_3e5917c6d92545c69465fe5ab812eddb` ↔ TS
  `a72b0e8c-70f7-4795-aff3-6ae58619149d`/mapping1. Never swap these.
- Domain catalogue`0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`,
  profile`5c33c4e0276dd849215d2662c157418a75e91a06fd405f6b369dcc172b722c03`,
  field policy`b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3`.
- Source pools1+1/inflight1/local pending-attempts8 unchanged. Local slots are
  released only after genuine terminal/recovery ACK (`_attempts.pop`), not
  a cumulative8admission cap or permission to forget unresolved originals.

## 3. One-client ownership and acceptance/recovery schedule

**Propose Core as sole executor of every HTTP/SSE specimen on SGP.** Edge
does not also invoke connected_read.py or the old snapshot probe. Core ACKs
one exact runner/config/pause/rollback set; no duplicate clients/new framework.
Use an explicitly classified INTERNAL_RESEARCH_API path while public Research
DNS/TLS remains unavailable; no stable443 substitution, relaxed public driver
or public Cloudflare/password/human-presence acceptance claim.

| Step | Owner / exact boundary | Current readiness |
| --- | --- | --- |
| Hash ACK, install6→7, real SDK READY/readback | Core ACK; Edge exact official SDK and process witness | PREPARED; not installed |
| Research config, source set, C288, independent READ/session | Core official writer/session; fresh overall H/census | NOT_READY until Core config/artifact return |
| Separate STREAM install | Core official same-domain STREAM action; one fixed non-sliding60s expiry across two sequential subscriptions | NOT_RUN; READ never supplies STREAM |
| Initial SSE + cursor checkpoint | Core sole subscriber, actual current seals/lease/physical terminal/ACK | NOT_RUN |
| Restart/reconnect/recovery | Core pins exact Research-only API container/PID/graceful stop/restart and existing official original-key recovery transport; Edge keeps native source/custody alive | Core procedure/pin ACK required |
| Resumed SSE + active STREAM revoke | Core sole subscriber+official CLI revoke while connected BEFORE same60s expiry; no grant extension or API shutdown posing as revoke | NOT_RUN |
| READ preserved / denied STREAM / current-epoch cache+cursor checks | Core exact existing routes/receipts, current READ stays independent; actual HIT needs real observer, not repeated200 | Eligible cases separate; P22 actual HIT NOT_READY until installed proof |
| READ/session retirement, all original custody resolved | Core official exact revokes/logout; same attempt/receipt/body/source ACK and final census | NOT_RUN |
| Source physical drain + native revoke7→8 | Edge after actual settlement, wrapper exit/pools0/die/destroy/port absence + official same-revoke STATUS | PREPARED; not executed |

Core accepts a specific restart point/physical-close proof before executing
it. Do not force-restart the source or kill an UNKNOWN API/transport; genuine
uncertainty uses the existing original attempt, physical receipt and ACK.
If restart cannot safely fit the single60s grant, mark that specimen NOT_RUN
and stop/settle; do not renew invisibly or call expiry an active revoke.
Server final-egress/revision checks are required; EOF/client counters alone
are not revoke evidence. Any additional fault/admission must be enumerated.

Accepted schedule remains `7+Q+E`, Q<=1/E<=1, server B244/K1/one notice per
source poll and fixed60s grant. Preserve reserve20: `Cmin=H+273`; historical
H10 implies283, NOT a fresh census or automatic applied288. Current C32 leaves
only2new admissions; no full run under32. Core returns actual retained288
config/admission bounds, M accounting and stop-on-unexpected-increment proof.
API1.5CPU/1024MiB + ONE maintenance CLI0.5CPU/512MiB, pool3+1<=4 is Core's
proposed config partition, not an applied/measured budget. No old/new API overlap.
TS source1CPU/512MiB on HK remains separate. No custody deletion/counter reset.

The same-actor independent unaffected-domain positive control is still
NOT_AUTHORIZED/NOT_RUN per Core; a second URL/session or READ after STREAM
revoke is not another domain. Do not fabricate a control or relax Paper guard.
STALE/PARTIAL current data stays honest; security/custody acceptance does not
become FRESH publication, another mode or full08/09 acceptance.

## 4. Preparation tests and cleanup actually performed

- Final **12modeled glue tests PASS**, no DB/listener/authority: new6→7 and
 7→8 exact-current checks, missing ACK, before/after window, UNKNOWN original
 bytes/pool closure, late READY denial/drain, zero-DB validation and bounded
 stderr. Initial host run2PASS/7ERROR exposed PyO3 re-import inside restored
 sys.modules; preloaded the real extension before patch.dict, no assertion
 relaxation. Intermediate11PASS is overlapping, not added to final12.
- Actual frozen SDK validation EXIT0/stderr0/db_connections0/listenerfalse,
  ACKnull/PROPOSED_NOT_MATCHED. Raw outputSHA256
  `cdb6b3d968b0fbf731ac72b3a304f42159c1b7a52d67a637666c69b41f1fb1b2`.
  Original validation EXIT2/REVOCATION_SELECTION_CHANGED caught old private
  validation literals before I/O; corrected exact7/new-command and added
  modeled regression. Original failed output retained, not relabeled PASS.
- Actual source/control RR READ ONLY preflight EXIT0/stderr0/pools[0,0], exact
  naturalhead6/revoked, correct DB/system/mappings/catalogue/functions/trust,
  observer BUSINESS_READ_REVOKED_OR_EXPIRED, issued0/authority_changedfalse.
  Raw outputSHA256 `9dd8cb2a627e1ca77879e89db4756f246cef1112f0a40c84353dd4b784fb6dd0`.
- Every verifier --rm container is gone; port28446 absent, no source started.
  No image/build/cache created or shared resource pruned. Private artifacts,
  failed/successful bounded evidence and existing trust retained for review;
  none is a new SDK_READY, grant/session or connected STREAM receipt.

## 5. Separate Manager target/TLS/JWKS readiness

**CURRENT_INGRESS_PINNED / NEW_RESEARCH_BINDING_NOT_READY.** Targets are Rust
Edge `10.70.0.2:8443/8444/8445` (Paper/Sandbox/Live; Canary governed Live),
NOT the backend Manager loopback8023/8123/8223 certificate/JWKS. No all-mode
product ceiling is inferred from the concrete Paper native specimen.

All3current Edge image
`sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e`,
restart0. Compose config hashes Paper6180b9bf/Sandboxcd79e9c6/Live98a191c7
are unchanged; full tuples in current Unified. Common mounted public files
under `/srv/primus/portal/execution-edge/`:

| Public ingress artifact | Actual raw SHA256 / meaning |
| --- | --- |
| `edge-server.crt` | `90ff7329bad9374646d515daf4537fefb447aa48e2b56cbfd5ea0feda5381342`; IP10.70.0.2/serverAuth, expires20Feb2027 05:34:40UTC |
| `sgp-client-ca.crt` | `d5a878b4be4a9ee777533d69095462016a2baacd050b5d2d58e16af64f4a6391`; fingerprint78a6de84…7166bc2c, expires23Aug2028 |
| `control-api.jwks.json` | `e52e026a2dabed206153669d6aca25379a0494cf325b7f3c26035546f330452a`; RSA/RS256 kid`portal-d3-b69d63fc1a88a0a4`, no private JWK fields |

Issuer remains portal-control-api; audiences per mode are
portal-execution-edge-paper/sandbox/live. These are mounted/current pins,
not proof a newly edited shared file is loaded. Existing Research RS256 kid/CSR
`research-20261021-c185ee3d` is already prepared on Core; an issuer-signed
client leaf/chain has NOT been returned. Native Ed25519 trust12504f44 is not Manager trust. Existing Core
inactive config3efc6346 still distinguishes positive inactive validation from
ISSUED_LEAF_MISSING. No new JWKS overlap or three-Edge reconcile performed.
Issuer owner returns controlled CA/service locator and signed public leaf;
Core returns exact public Research JWK; Edge then reviews old+new overlap,
3service reconcile/window/rollback. No generated issuer or private-key request.

## 6. Separate G2/apparatus readiness

**SOURCE_PREPARATION_EXISTS / CONNECTED_G2_NOT_READY.** Existing Edge
measurement-plan f9418cd7 and isolated-target are preparation, not execution.
Core source122fc5f1/3d4164bd and34/34harness receipt remain source-only;
actual serving Core is8ac4f553/imagea96/runtime9869c15f/schema149, not P22/G2.
No new M0/M5/M7, load or latency/capacity measurement run by this proposal.

Target/TS/DL still owe accepted numeric14group budget, actual target/config/
workload/census/collector/query/clock/apparatus/gate/population/source-schema,
stop/restore and future quiet window; calibration also needs comparable
population and pinned fit/evaluation split. Core owes normal-gated image and
Portal B1/B2 driver/P184 population binding. Preserve original M5/M7 NOT_RUN
bytes/hashes; READ200 and C288 correctness approval are not those measurements.
Return any independently complete apparatus part now, never invent a threshold.

## 7. Core action and return contract

1. Return exact hash/window/sole-client ACK for§§1–3 and reviewed config/cap/
   partition/restart/rollback/runner pins; partial ACKs do not activate others.
2. Edge arms only the received exact ACK and installs only in the NEW slot,
   then returns actual native7/receipt/document/semantic/fingerprint/time and
   original SDK bytes/hash plus physical container/start/listener witness.
3. Core applies its reviewed configuration and independently issues genuine
   READ then STREAM/session when ready; owns the sole specimens/revokes/
   original-key recovery and returns real source-terminal/Core ACK/census.
4. Edge correlates/readbacks, drains only settled originals, exact revoke8/
   STATUS and cleanup. UNKNOWN preserves original SDK/receipt/custody.

No stable/dev/provider28445, command/capital/Live trading, new schema/domain,
arbitrary SQL, public UI or historical custody deletion. No push/merge.
Full08/read09 remains NOT_MET. This document is PREPARED, never SDK_READY.
