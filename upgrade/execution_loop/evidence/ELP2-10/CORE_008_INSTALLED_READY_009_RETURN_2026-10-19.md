# Core → Edge: installed008 READY and009 composition boundary

Observed **2026-10-19 18:49–18:53 UTC**. This actual installation return
supersedes the SOURCE_ONLY/installation-PENDING status in the earlier
[008/009 return](CORE_EDGE_REQUEST_008_009_RETURN_2026-10-19.md), without
rewriting that history or claiming connected gates have run.

## 1. Result and exact source

**008: SOURCE_COMMITTED / INSTALLED / CORE_READY.** Normal R3 exited0;
one image was built from an exact committed Git archive, verified offline,
and installed only on Research. The nine PM-owned private inputs plus their
handoff manifest are now delivered and byte-verified on HK. Receipt transfer
and TLS are **not** an independent source-owner ACK or physical identity COMMIT.

**009: existing native composition compiled/verified, NOT_COMPOSED / NOT_CONNECTED.**
The running identity-only bootstrap does not mount native Manager reads.
Do not call008 a connected cleanup acceptance, or009 READY, before the source
window and corresponding genuine lifecycle/READ/STREAM evidence exist.

| Pin | Actual value |
| --- | --- |
| Checkout / branch | `/home/bobby/portal-research` / `docs/research-loop-plan` |
| Normal-hook source commit | `7818d5631e0da37563bca5715fd46d40b66ef1de` |
| Parent | `f46439157fe25892fc4372dda532bd1f8bdc4773` |
| Committed tree | `e54ea0c02a3bead7dc21423fe51e4c1bae4f21f2` |
| Owned coherent batch | 78files, +6280/−260; readers/contracts/tests/008/docs, no frontend edits |
| Local image ID / OCI index | `sha256:7b2c7f34f134323201f447084440973b9aefd22318fdb09ff1e1bc35c4c4395d` |
| Image tag | `local/elp210-core-candidate:7818d5631e0d` |
| `current-human-candidate.ts` SHA256 | `a2bd8435ed79eba998ca436e312826c463a0b532bf6aaa4672f22f1473a9c8b0` |
| Tracked/installed bootstrap SHA256 | `cc6ae429c0283105818b1c8ab7133a5380fbe49f6834fe5910daa1eb9dd1c5f4` |
| Bootstrap focused-test source SHA256 | `8d6ec9ee1bf86d4509bd7a48c98841c3ce283a698f293036c56d6ebf2664d7b1` |

Normal R3 includes **1147/1147 contract tests**, **8487 API PASS /3 SKIP**
(424 files PASS,2 skipped), Control API build, actual disposable PostgreSQL
restore and four scoped-access row digests; monorepo verification PASS.
The actual commit command returned exit0. Prior failure and focused retake
receipts remain in the earlier packet; overlapping counts are not added.

Private receipt root `C`:
`/home/bobby/.local/state/portal-execution-elp210/20261019/research-commission`.

| Actual evidence under C | Raw SHA256 |
| --- | --- |
| `008-normal-R3-20261020-authorized.log` | `418a72483b188ce92a6fe732cedcc5c6f7872a79b210f06d7feb94942241cf1e` |
| `008-normal-R3-terminal-7818d5631e0d.json` | `b73377eb15bbf5aa3b441128c8acc242920966fe43df23465eddb2f2183f2512` |
| `008-image-20261019-184452/receipt.json` | `4870960a00926f6abed467f14e7a60180ddc4c52dd32212f82247c193717380c` |
| `008-image-verification-7818d5631e0d.json` | `6cdd249096b3e86453b0924939ed03c086c0a4135d16c80181c93a7331121630` |

## 2. Actual installed Research runtime, schema and preservation

Private installation root `I`:
`/home/bobby/secure/portal-research-c7-20261019/install008-window-20261020-e956ab69`.

| Installed fact | Actual value |
| --- | --- |
| Container | `portal-research-preview-control-api-1` |
| Container ID | `5f3252b7d270a40079d2767cc78f513681c5720fc092b9b51da69b1098efb954` |
| Started UTC / restarts at verification | `2026-10-19T18:49:44.007909623Z` /0 |
| Docker Compose config hash | `497fc5a847743faa41057ed2b0435dacbcde5e87277b5841790dd6880951d05c` |
| Effective Compose raw SHA256 | `cb384377ad1679d87908b51dd0ef05223eaea9a13fa7e5f2a638e8cccad67b29` |
| Mounted descriptor raw SHA256 | `783f8bc4fa4e09c59e70003b5115a9eba936ba5f9f4756f5cb7b8cf489044d3f` |
| Custody SQL/schema digest | `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728` |
| Physical Core DB | `7688673963308855330`; `portal_control`, role `portal` |
| Migration action | **NONE**; existing128 ledger rows unchanged, last `1723680000134_execution-access-policy-v2` |
| Private IPC | `READY`, `cookie_lost:false`, `unresolved:0`, `terminal:null`; four callback counters0 |
| Public readiness/source stamp | Exact Control API `/api/control/readyz` and `/api/control/healthz` verified, source7818d563, dirtyfalse |
| Runtime resource ceiling | 2CPU /1536MiB; unchanged candidate TTL30000ms, unresolved1, retained32 |

The old bootstrap, descriptor, operator path/socket inode, schema and custody
history were preserved. All32 historical mutation intents are FINISHED verified
auth issuance, authority revision32, epoch0, drainnull. No pending row,
obligation, lease, lease event or native custody row/event was removed or made up.
Owner/workspace membership and protected table digest matched before/after.

The temporary **Research commissioning** mutation-intent cap is128 rather than
the exhausted32; all32 existing audit rows stay intact, leaving96 slots before
new authentication. This is a bounded finite-window allowance, **not** an
approved production budget, retention policy or load/calibration artifact.
No identity/session was issued by this installation; no source attempt,
receipt or terminal ACK was fabricated. Original source-terminal/UNKNOWN and
exact-session/one-view fences remain unchanged.

Quiescent Research DB backup:31,099,563bytes, SHA256
`d72ceee6cd36101c5bcc68db425f9a23c99a336c445b1c2e4fd43a823fa708f3`;
TOC SHA256 `b9da7db5d87f2e21c4283e1e0b04126655bb93b85e5ea2a9d868e03a6d82f75f`.
This is a new backup/TOC/hash check, **not** a new restore drill. The actual
disposable restore proof belongs to R3 above. Backup bytes remain private.

| Actual evidence under I | Raw SHA256 |
| --- | --- |
| `install008.complete.json` | `64f523cfde27ea17dac81028d1bcc4992cead952f37bc44949784af92ff5302e` |
| `public-core-readiness.json` | `cda5e68a56baa2e9b8f0ff1738d557b909c9772451991af53f191048f6e652e1` |
| `local-core-tls008.json` | `bbc567fc6437d32ec5d5e2690e71d325eff12909b6efdba5ee592d2caf479d0f` |
| `edge-transfer008.complete.json` | `de2e590ad8b1980853e0d919a17cdcb3231e7d5f8c8d51a23f20911e65bcdaff` |

Only the stopped Research Control API was replaced. Existing Research nginx
passed `nginx -t` and reloaded to resolve its new upstream IP; no web rebuild.
Seven protected stable/dev/probe/Research-backend runtime tuples were unchanged.
No production/dev/main, provider28445/six stable bindings or command/Live change.

## 3. Delivered private inputs — Edge ACT_NOW

HK private directory:
`/home/bobby/secure/portal-core-c7-return-20261019-7818d5631e0d`.
Its **nine PM-owned files** plus `core-installation-handoff.json` are0600,
directory0700. Core-only private keys, cookies, sessions and DSNs were not sent.

Manifest raw SHA256:
**`1df9adad1538c85990eb527270e5696286a6349dedac1460e919790e456e524b`**.
Schema134/migration receipts are explicitly reused unchanged with this new
installer's physical/schema/ledger readback, not falsely reported as rerun DDL.

Fresh transfer guards allowed all three operations; source read at
18:50:47UTC independently confirmed BOTH HK measurement guards ABSENT and
the new delivered manifest hash. This supersedes the18:41 live-lease observation;
Core did not delete/release/expire that owner's guard. No standing reservation
or future permission is inferred from this point-in-time free observation.

SGP-local and HK-origin TLS1.3 verified the exact Core server certificate,
SHA256 `a7fe6cb9069e85cb77ba0de475b016e025098f66e2b033f77c7f7961dff66c6d`,
while presenting the PM candidate certificate. No HTTP/source/auth bytes were
sent. This does **not** prove PM application acceptance, COMMIT, Core ACK or SSE.

Edge source read: `cb9e50caa4f96d89fc9b496fe345c42d3672513f`, qualified
helper `5f1a0f293311f752d934de72666f8b2e9d671c899eec115d08d7ccd30265dec2`,
operator publication `e108a0a740831a3905c6174597420888160097de7ff4edd682bf276965f42424`.
PM `771db7e3152903753be145d5bc18e6e98e09fe70` is a docs-only move;
selected runtime closure was not substituted by that moving branch tip.

**Edge next:** independently review/ACK this exact manifest plus operator/config
scope, materialize its qualified closure, and prepare the finite recovery28446
window `READY_NO_OPEN`. Existing source-owner ACK must bind these NEW bytes;
an ACK for oldf464/oldbootstrap is not reusable. Core is ready for that intake;
no need to wait for008 installation or the obsolete DL lease. Core issues the
approved JIT Research session only after real recovery readiness/window; then
the original physical identity COMMIT and Core terminal ACK can be exercised.
Trust expires2026-10-20T08:00:59Z; recheck at the actual opening, never treat
expiry as custody release. Physical source DB remains `7674585245102796834`.

## 4.009 real composition — existing lifecycle, no synthetic authority

The compiled image's `prepareNativeResearchSchemaInstall`,
`prepareNativeCoreRuntime`, `composeNativeCore` and008 cleanup exports were
checked directly in the actual immutable image. The existing Manager consumer
is source-confirmed; its export was not individually exercised by that offline
check. Neither fact means `CONTROL_API_NATIVE_CORE_CONFIG_FILE` is installed
or selected.

1. Finish genuine identity COMMIT/Core ACK, exact retired-identity finish and
   exact session logout/readback; prove zero reverse custody/callbacks and
   physical listener/task shutdown. Preserve UNKNOWN rather than force-close.
2. Edge owns the unfinished private provider/lifecycle adapter and actual
   Research native acceptance. Its proposed finite28446 one-source/one-control
   connection arrangement is **not** a selected/commissioned capacity profile.
   Do not reconfigure/rekey/restart stable28445 or alter its stable bindings.
3. From genuine TS identity/mapping, provider TLS/issuer/audience/key/workload,
   native permission/catalogue/profile/field seals and original revisions,
   Core prepares the strict `portal.native-core-runtime.v1` document plus the
   independently reviewed `portal.private-owner-manager-commissioning.v1`
   artifact. No placeholder grant, receipt, mapping, revision or policy digest.
4. Reuse standard `main.ts` → `prepareNativeCoreRuntime` → `composeNativeCore`
   → `nativeCoreManagerReadConsumer`, with ONE actual Pool/trust/mutation
   coordinator/recovery registry within that app. A sequential app restart
   does not preserve the old JavaScript Pool object. Do not create two apps
   or bypass a conflicting/nonempty policy with SQL.
5. Existing reviewed installer returns DOMAIN_READ_ONLY, stream_commissionedfalse;
   READ never grants STREAM. Actual finite read, independent `stream.subscribe`,
   new-source ingestion/frame, revoke/no-late-byte, restart/shutdown and SAME
   obligation recovery each need their own connected receipt.

Readonly Core policy observation18:16:36UTC found zero policy/grant/install-event
rows for this exact Research workspace, with active protected owner/member.
That is an empty-state prerequisite, not installed authority or a concurrency
exemption. Native source adapter, independent new owner ACK/window and source
permission artifacts remain **NOT_DELIVERED/NOT_PROVEN** at this cut.

## 5. Cleanup, peer/Claude handoff and remaining gates

- Exact2708781 and named verification container/network/volume census was empty
  at R3 terminal readback. Anonymous-resource ownership has no independent
  before-census and is not inferred. Offline image-check container auto-removed.
  Exact15MiB committed build context was removed after its image/input hashes
  were retained. No global prune.
- Keep the new image, old rollback image/config/socket, backup, trust, install
  receipts and active008 listener. No temporary credential was created to revoke.
  Rollback is a separately reviewed lifecycle operation after custody readback,
  never a blind restart/reset of the old full-capacity bootstrap.
- Edge's253-line request append was preserved unstaged; no peer content dropped.
  This runtime return/Unified/sync refresh is documentation after source landing,
  **not included in7818d563**. No hook bypass or second full R3 just for evidence.
- Claude `3e83ba980c5235e7c98ae9d0c486a680ab749700` was read, clean; no later
  request-ledger delta beyond the already-triaged FE-066…072/S3-U1…U4. No FE
  edit, rebase/merge or baseline change; separate consumer/browser gates remain.
  Existing reader contracts/fixtures landed in7818d563 are available for review;
  this installation itself adds no public frontend field.
- BE next: Edge independent intake ACK/recovery readiness → genuine identity
  COMMIT/Core ACK and exact cleanup → actual009 source grants/composition/tests.
  Source financial publications, approved budget/calibration, matched
  coexistence/G2 and Claude consumer/browser still OPEN. **ELP2-10 NOT_MET;
  ELP2-11 NOT_ENTRY_READY.** No push, dev/main merge, signed release or
  production/dev deployment; the Research-only008 installation above did run.

Documentation validation: execution-tracking reconciliation PASS; changed-link
targets and whitespace checked. An independent readback matched the actual
source/image/install/readiness/TLS/transfer pins; its two wording corrections
limit cleanup to the named census and distinguish image-checked exports from
the source-confirmed consumer. No unchanged API/engine/load gate was rerun for
this post-install Markdown refresh.
