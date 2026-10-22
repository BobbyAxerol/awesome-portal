# Core009 current08 binding — staged owner return

**ACK_STAGE1 / READY_TO_PREPARE_FRESH_NATIVE_BINDING; not SOURCE_READY or connected PASS.**
Operator: Codex/Core integrator,22Oct10:00 Asia/Saigon (03:00UTC).
Responds to [Edge08§11](EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF_2026-10-21.md#11-current-owner-action--22-october-2026).
Do not wait for the independent P22/full-suite gates to return an eligible READ.

## 1. Direct installed observations (22Oct09:57 Asia/Saigon)

- Canonical source `docs/research-loop-plan@e18a1460`; actual installed OCI
  remains8ac4f553, image
  `sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`.
- Container `593acd09aa85ffbb21cd0f599db65276ca2ef858485da21716198344f6541ee4`,
  running/restart0, started21Oct19:02:12UTC. No successor rebuild/reinstall.
- Actual container env selects `native_manager_review_v1`, `PORTAL_ENV=local`,
  `AUTH_MODE=dev` and the exact Research workspace below. This is backend
  commissioning, not password/Cloudflare/public-browser certification.
- Actual selected native runtime SHA256
  `f3fe876df8c47acdf82da46a2046cc9878362614b47339ad888f67b9457863b9` at
  `/home/bobby/secure/core009-commissioning-20261021-xwAWdhFY/runtime.json`.
  Private effective Compose SHA256
  `7be687b6cdf1fe9872f9960c4cdf4b855646609bffff5e3cbe3c344bfeb37dd1` at
  `/home/bobby/secure/core009-successor-rollout-20261021-jvq2Up/effective-compose.json`.
  These are two distinct artifacts; do not substitute oldf251d677/render pins.
- One bounded actual **READ ONLY** transaction verified DB `portal_control`,
  role `portal`, system `7688673963308855330`;143migration ledger entries,
  last `1723680000149_execution-operation-queue-scope-lookup-index`;
  native obligations8retained/0unreconciled. Existing custody schema hash
  `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`.
  No row, grant, session or source changed by observation.

## 2. Exact unchanged human/domain; fresh source must be supplied, not inferred

Owner/subject `usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`; issuer
`portal-control-api.native-manager-read`; TS mapping
`608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`, revision1.
Paper profile `PAPER_BINANCE_USDM`:

- catalogue `0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`;
- profile `5c33c4e0276dd849215d2662c157418a75e91a06fd405f6b369dcc172b722c03`;
- field policy `b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3`.

The current runtime's source receipt/policy interval is **expired**. It is
recovery history, not current authority. Fresh Edge return must name source
set, actual receipt/revision/document/fingerprint and effective interval,
plus actual SDK install/config/head and current owner-mapping semantics.
Core will pin the exact returned bytes; it will not copy old revisions into
a new acceptance or treat runtime health as a source read.

## 3. Fresh native trust and finite-window plan

Both old native leaf **and its CA** expire22Oct09:48:30 Asia/Saigon
(02:48:30UTC). They are not reusable. Under Bobby's existing Research-only
compatible-bundle approval, Core prepares a **new exclusive candidate bundle**
using the reviewed `scripts/execution-v2/provision-candidate-trust.mjs`.
This is native candidate TLS/Ed25519 only, not the separate Manager RS256
issuer. Existing `/home/bobby/secure` was actually0775, so the tool correctly
refused it before creating any files; its permissions are not changed. A new
exclusive0700parent directly below `/home/bobby` is used instead. The tool
creates a new exclusive child,0600leaves and retires its transient
CA key before returning. Old trust/artifact bytes remain untouched.

Resource: one local OpenSSL/key-generation command, no Docker/DB/listener;
no stable key copied or new human/grant/session created. Validate new trust
metadata, validity, public fingerprints, CA-key retirement and exact8PM files.
Any private PM-leaf transfer requires the exact private target/scope; no Core
private key leaves SGP. Rollback before install is to leave the new bundle
inactive; cleanup only its owned temporary secrets after terminal/recovery.

Proposed coordinated native correctness slot **22Oct10:15–10:45 Asia/Saigon**
(`2026-10-22T03:15:00Z`…`03:45:00Z`). This is Core's offered availability,
not an armed source/window. If preparation cannot fit, Edge returns the next
usable exact slot instead of publishing a window already about to expire.
Existing C32/R20 leaves at most3positive admissions; eligible READ first.
No C288 or new workload budget is applied by this ACK.

**Actual inactive trust prepared22Oct10:00:58 Asia/Saigon:**
`/home/bobby/.core009-research-trust-20261022-UpUk9ZhN/elp210-trust-o26Tdn/`;
candidate `elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881`, PM workload
`elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm`.
Trust manifest raw SHA256
`12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`.
Valid through23Oct10:00:58 Asia/Saigon (`2026-10-23T03:00:58Z`).
Certificate DER fingerprints(SHA256):

- CA `2d87c4a50c81ca74ab94fe3f07b2625f624b40eb5b9c0d24462dc8d5aebdf7dd`;
- Core `6fb3a1468139d3dcd2628ebe13c069f79b34461bb5e8f71b7cb54cf7f403e304`;
- PM `40252d3b9b2c5f4cefd2ac095b9cf9def1102c42f2be47d24bd3e575b4c263fc`.

Actual13/13local crypto/file/scope checks PASS: transient CA private key is
gone; Paper/workspace exact; no authority installed; each leaf verifies against
the new CA, covers the offered window and matches its TLS private key; each
signing public/private pair matches; each side has exactly8regular one-link
owned0600files. These are **trust preparation**, not PM handshake/source proof.
Old bundle remains unchanged. Exactly8PM-side file transfer to a new private
HK directory was requested from Bobby; **not transferred/installed yet**.
Core private key is not included in that transfer. Public pins may be shared
now independently of that approval or full-suite numeric decision.

Sequence: new trust/private source draft → Core exact hash ACK/config →
Edge real preflight/install/SDK READY → official successor READ installation
and genuine finite Research session → bounded READ/revoke/recovery/ACK →
logout/retire exact scope. No session is minted while waiting for READY.
Installed official successor supports the same-identity sequence; preserve
retained old recovery selections and source-terminal/UNKNOWN fences.

## 4. Full-suite inputs (independent, still not claimed installed)

- P22 actual private factory and G2 same-buffer fix are being completed in
  `/home/bobby/portal-core009-successor`; source-only until qualified/installed.
  Focused private factory+observer tests now pass111/111 on actual host
  metadata; unchanged loader/realtime files add41/41. New G2 pure/real local
  CLI suite34/34 with the unchanged pinned Claude quiet helper bridged by an
  operator-only loader. No source/window/load proof follows from unit tests.
- READ and STREAM remain distinct policy/grant revisions. STREAM snapshot
  comes after its grant install; active revoke must precede expiry. Use real
  current-epoch cache observation before READ revoke, not a prior-epoch HIT.
- Full C288/R20/B244/60s/K1 remains a **numeric proposal**, explicitly sent to
  Bobby for disposition. No restart/purge may reset history to fit C32.
- The installed Research composition has one Paper actor. A genuine unaffected
  native control is **not currently supplied**; no fixture/unrelated HTTP200
  is substituted. Source/authority owners must return an existing eligible
  independent native binding, or obtain approval for its smallest delta.
- Separate Manager issued leaf/chain, C5 genuine financial producer mapping,
  budget/calibration and M5/M7 collector/census/window inputs remain exactly
  as requested in [the active round return](CORE009_MAINLINE_COMMISSIONING_2026-10-22.md).

## 5. Stage2 — actual installation/session return

**NOT_RUN / NOT_READY** pending fresh trust/source bytes and actual SDK READY.
No fresh session/grant/stream/restart or command/Live action has been taken.
After execution, publish a new immutable supplemental return with exact
config/source/private-session references+hashes/expiry, official operation
IDs, image/schema, measured receipts and cleanup. Never place secret values
in Markdown, Git, chat or the public owner mailbox.
