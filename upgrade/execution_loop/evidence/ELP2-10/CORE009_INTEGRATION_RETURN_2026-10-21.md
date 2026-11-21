# Core009 — integrator return, 21/10/2026 (Asia/Saigon)

Scope: Bobby's four-input Edge handoff, inside C7 / EPG10-08, not a new
phase. Claude is Portal implementation owner (§10.13); Codex integrates and
supports the operator step. Source preparation is not installation or
connected acceptance. **Do not reissue the already COMMIT/ACKed 008 identity.**

## 1. ACK and exact integration boundary

- Canonical base: `docs/research-loop-plan`,
  `7818d5631e0da37563bca5715fd46d40b66ef1de`. Preserve its multi-owner Markdown WIP.
- Isolated candidate: `/home/bobby/portal-core009-integration`,
  `chore/core009-connected-20261021`. No frontend, AppModule, migration145/146,
  capital workflow, registry8, source/HK mutation or broad peer merge.
- Claude code accepted for this candidate: `85fc86b8`, `f1d18dc5`,
  `110bb875`, `5ae9e17e`, `b70f8f77`, `4b2b76e0`, `81e8a546`.
  Keep canonical self-eligibility imports in the single access-service
  conflict; add only manager-revoke imports/methods. Keep all three Edge R3
  fixes (exact session/file cleanup, verified complete token write, truly
  offline session dry-run).
- Take only the composition-test query signature correction from `4972daec`
  and read-only template test mount/environment from `105775f0`.
- Integrator correction: install CLI now exposes the two documented
  `AccessPolicyError` categories `POLICY_REVISION_CONFLICT` and
  `RECEIPT_NOT_QUALIFIED`, instead of hiding them behind
  `NATIVE_RESEARCH_INSTALL_FAILED`. All other arbitrary error details stay
  private. Add focused spoofing/detail-leak regression tests.
- Claude's ACK/coordination documents exist in peer commit `86664380`;
  receiving/writing those documents is **not** an Edge or PM acknowledgement.
  Peer hook receipt at `30207702` checked source `105775f0`: contracts1504,
  API9232 PASS / 3 skips, PG restore PASS. That result does not certify this
  different minimal candidate; its normal gate runs separately once.

## 2. Validation and runtime disposition

At the source-record cut, integration is prepared; normal hook, immutable
image build and read-only runtime readback are **PENDING**, not prewritten
PASS. The operator's terminal result must append the actual source commit,
image ID, log hashes, test counts and cleanup before Edge consumes it.

No public HTTP contract or database migration is changed in this slice.
Tests cover Plan B bounded READ/STREAM grants, exact target ownership,
idempotent remove-only revoke, native stream/current-authority fences,
acceptance-session issue/revoke and private-file failures. Synthetic values
in tests/templates never become runtime config or acceptance.

Installed Research image at the preceding observation:
`sha256:7b2c7f34f134323201f447084440973b9aefd22318fdb09ff1e1bc35c4c4395d`
(source7818d563). It is **not Core009**. Old bootstrap hash:
`cc6ae429c0283105818b1c8ab7133a5380fbe49f6834fe5910daa1eb9dd1c5f4`.
Do not label a newly built image INSTALLED without container/image/config
readback. Preserve the old bootstrap and recovery inputs.

## 3. Core selection and finite window

Selection to revalidate before any mutation:
`portal_control` / system `7688673963308855330` / login `portal`;
owner `usr_5a38d5dfb08b44748f5776fbe04a1434`;
workspace `ws_06G19F61YB8CFR7TEWMS7HQ660`;
Paper / `PAPER_BINANCE_USDM`;
issuer `portal-control-api.native-manager-read`;
TS identity `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`, mapping revision1.

Plan B: distinct READ and STREAM grant IDs, each at most two hours and
never beyond renewed source trust. READ does not imply STREAM. The session
is an exact Research application session, not password/Cloudflare/human
presence proof. Runtime candidate ceiling remains 2 CPU / 1536 MiB /
128 pids. No command/Live, stable/dev/main or provider28445 changes.

Proposed window: one jointly scheduled interval after image/validator and
fresh Edge pins are ready, at most120 minutes. **No start/end time agreed
yet.** Do not open28446 merely to wait. Pre-stage remove-only grant revoke;
bind session-revoke to the actual issued session before delivering its
private reference. UNKNOWN or unresolved custody means preserve originals,
not forced teardown or SQL repair.

Needed from Edge/PM for that window (not from Bobby as pasted credentials):

1. Renewed trust expiry, current native acceptance revision/receipt/
   document/policy/semantic/owner-mapping pins and effective/expiry times.
2. Fresh observer origin, workload, source fingerprint and TLS leaf pins;
   signer/TLS private file references, not contents.
3. Exact seal-to-domain mapping and runner execution UID; earliest/latest
   supported window and agreed stop/recovery owners.

Old acceptance revisions1/2 are revoked and old trust expired
`2026-10-20T08:00:59Z`. Static field-policy references already PROVIDED:
do not reopen that as missing authority, and do not treat static files as
renewed current authority. Source preparation/image can be returned now;
filled private config, real validator, policy install, session and connected
READ/SSE wait only for their own actual prerequisites.

## 4. Independent owner returns — fresh SSH read-only cut

Observed 21/10/2026 00:03–00:05 VN:

| Input | Source and evidence | Required next action / honest status |
| --- | --- | --- |
| Edge08/read09 | Edge `73e73a2c65fa2942e1531cb1958a5e46b843bcb1`; `EPG10-08/CONNECTED_READ_BINDING_OWNER_ACTION.md` SHA256 `4472151fc5f05adc19fdbea6c0e6585d898a8cf938afc24cac984c3d17a52ec3`; connected runner `cad1eeb6b8f3cd8244cdf7e3f3dd0001a7fefb32a105bdbfab60d7ecc519debf` | Core-only integration first; fresh source/window then connected acceptance, not replayed008 identity. |
| PM command07 | PM `98a4a97e48cf8caecbf7d65f294b4ebb922d1bf7`; Unified §58.276–278 / lines84162–84249; lifecycle ownership, mounted drain and bootstrap implemented | Six local bootstrap cases and six publication-bootstrap cases are TEST_ONLY; genuine authenticated operation × environment × native-profile / held-COMMIT / status-recovery proof remains with PM. Do not ask PM to rewrite delivered lifecycle code. |
| TS publisher03 | TS next `0cd356dab20dc385d9effbda408a0ea53280aa4b`; N03 manifest SHA256 `f3a496034abbb9fc3e29789d147b8040825015ed700113725717dd460d414872`; PM Unified §58.279 IN_PROGRESS | Native publisher ownership/generation same-TX work is already being implemented by PM for TS integration. Do not duplicate it in Portal. N03 still owner_accepted=false / SOURCE_DARK; await actual writer/export/ordering/barrier and installed proof. |
| Target01/06 | PM pilot proposal `77a7b9859386cc32d9b0017b0b92ab79db381bcc74556c6d43a1034c1dfefaaa`, evidence `57d37691f1b8a350a7033cd8186737ead0eec3694c1529472269b126d53cbcae` | execution_ready=false; numeric target/real filesystem/resource approval remains pending. PM pilot is not Edge B0/B1/B2 coexistence. Do not promote proposed3CPU/2560MiB to approved bounds. |

Exact HK roots:
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
`/home/bobby/.worktrees/trading-system-pm-v1_1`,
`/home/bobby/.worktrees/trading-system-next-upgrade`.
PM tracked journal WIP was preserved (cut diff SHA256
`7d79381a3d218d5e85634d7f88821982e21b53ac409607853490c8ff3d6fe0c7`).
These are observation pins, not installed-source claims.

## 5. Cleanup, next owners and exit

Normal gate uses one disposable PostgreSQL/Node cell under
`/tmp/portal-heavy.lock`; no competing heavy job. Image build uses only
committed Core inputs, bounded resources and a preserved rollback image.
No broad Docker prune, volume deletion, source data or authority edits.
Terminal evidence must distinguish temporary test teardown from retained
candidate/rollback images.

Core next: terminal gate → immutable image → fresh pin validation →
read-only custody/backup → IPC quiesce → official install/composition →
session/reference → finite READ/STREAM/revoke/recovery. Do not SIGKILL the
old identity bootstrap. PM07, TS03 and target01/06 proceed independently.
Claude continues the already assigned consumers/review requests; no new
UI contract or design request from this Core-only slice.

**ELP2-10 remains NOT_MET; ELP2-11 not opened.** The connected packet needs
actual source/Core/physical-egress correlation. EOF/reconnect403 alone
does not prove active-stream revoke or absence of late bytes.
