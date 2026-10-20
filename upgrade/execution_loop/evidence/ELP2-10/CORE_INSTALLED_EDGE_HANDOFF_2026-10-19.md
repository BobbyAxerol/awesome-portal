# Core installed → Edge handoff — 2026-10-19, 12:34 UTC

## Scope and verdict

Bobby approved the Research-only Core test → build → backup → forward134 →
registered custody schema → reverse mTLS installation, then secure PM-only
input transfer. This return records actual results, not a proposed deployment.
No frontend, dev/main/stable, command/Live, Git push or signed release changed.

**Core installation and secure transfer: VERIFIED. Edge owner acceptance and
physical identity COMMIT + Core ACK: NOT_RUN. Whole ELP2-10: NOT_MET;
ELP2-11: NOT_ENTRY_READY.** Earlier failed attempts remain evidence, not PASS.

## 1. Actual source, gate and image

- Branch `docs/research-loop-plan`, implementation commit
  `f46439157fe25892fc4372dda532bd1f8bdc4773`; no push. Ten files,
  +952/−8: three backend/test files and seven tracking/patch files. No FE edit.
- Normal hook completed12:12:51UTC: contracts1141PASS; API8309PASS/3existing
  skips,419filesPASS/2skipped; build, scoped restore and ordinary verification
  passed. Eight protected runtime tuples unchanged; owned test resources0.
  Focused200PASS is overlapping evidence, **not** additional coverage.
- Gate log SHA256
  `0c3432f9e4a29e336920333fa66f15cb173930a628e8a4e251eaed14b63044e5`.
- Actual built/running Core image
  `sha256:16bf254b5e8b9fb7781cd9f08379706f5a9c06577e48f8b5d2603dacabfdc5e5`.
  Build completed12:20:57UTC; offline compiled-image/dependency checks passed.
  Image receipt SHA256
  `77f087b27f0936039e964ae74d35c3724b3345ffd6006de2a612e80a88405710`.
  Runtime identity refers to this implementation commit, not a later docs-only
  revision. Unchanged tests/build were not rerun for operational CLI fixes.

## 2. Actual Research backup, schema and listener

Research DB `portal_control`, physical system`7688673963308855330`.
Only the old Research Core writer was stopped during installation.

| Item | Actual result / pin |
| --- | --- |
| Backup | Custom dump31005076bytes; SHA256`db0a6e9ad40ad2079416f405faf0608718cc8b1fb91767515fbe8c462df18fea`; TOC139159bytes; complete/quiesced/hash/TOC verified. This backup was not freshly restored; TOC is not restore proof. |
| Migration | Official exact-name/count1 forward134, `APPLIED_VERIFIED`; ledger127→128, ending`1723680000134_execution-access-policy-v2`. No unbounded migrate, manual ledger edit, seed or DOWN. |
| Protected state | Before/after SHA256`d2c5c40a22fabd662f465df59d76f5bf879714af616ec1ec374125618df45ef2`; original127ledger rows preserved. New four policy tables empty. |
| Custody schema | Official registered installer, `INSTALLED_VERIFIED`, `research-current-human.v1`; SQL SHA256`826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`; ledger remains128. |
| Actual Core container | `67e606f8cf163513bfab7cfa47101fa724b54fb5673026952a61cc69aaf81cd7` |
| Actual Compose config | `b3213d8c2aa6a156123b93d92841cad204f6bbbe748a31b9e98eb428ccec87b9` |
| Accepted effective config | SHA256`cdc24b493bb8673caeff748e0dad63d41261770d70df072c69974c22fbe13c3f`; actual image/environment/mounts/networks/ports/hardening match. |
| Reverse listener | WireGuard`10.70.0.1:28444`; TLS1.3, Core SAN`core.elp210.candidate.invalid`; private IPC READY, unresolved0, callbacks0, no identity/session issued. |
| Public Research | `http://127.0.0.1:8095/api/control/readyz`200; nginx config/reload passed. Public auto actor remains`claude-preview`, retained profile/command flags unchanged. |
| Unrelated stacks | Seven runtime tuples unchanged, including Research portal-api and stable/dev/probe API services. |

Private actual receipts under
`/home/bobby/secure/portal-research-c7-20261019/maintenance-state-v1/`:

- `install-window.complete.json` SHA256
  `002f87c9733da38f16ca5edb69fd1ddc7d3d271e304575e0ca2d26aae1dfe186`.
- `migration134-operation.json` SHA256
  `bdfade214b2ab7f2117d1fd3e1db55c9d1591ca0211745ec8340437fa7e85a75`.
- `schema-operation.json.verified` SHA256
  `53de47e1fbe10926bc89dfa9d67ca061e57082b0b322c8ab223fe3f45553c91e`.
- `backup-metadata.json` SHA256
  `831a1f412bcafd0dcabde91c06403d6af1cd54c856bea7887ccd432768a5d0d0`.

## 3. Delivered to HK — ready for Edge owner review

**Actually transferred and remotely hash/mode verified:**
`/home/bobby/secure/portal-core-c7-return-20261019-f46439157fe2/`.

Manifest `core-installation-handoff.json` SHA256
`15d94c6fae07e0cbb251d5193eb89bf74ca9682a2adebf43e1192955031eb4b2`.
Schema`portal.research-core-owner-return.v1`. Directory0700, ten files0600:
nine PM-owned trust/TLS/signer/public-human-JWKS inputs plus that manifest.
No Core private key, session, token, password or DB credential was copied.

HK actually completed TLS1.3 CA/SAN/exact-Core-leaf verification while
presenting the PM client certificate. Core leaf SHA256
`a7fe6cb9069e85cb77ba0de475b016e025098f66e2b033f77c7f7961dff66c6d`.
**That handshake alone does not prove application-level acceptance of the exact
PM client leaf, owner acknowledgement, identity COMMIT or source READ/STREAM.**

Private transfer receipt `edge-transfer.complete.json` SHA256
`38fabe479b76f695088124a56bd120fed17b5207bb89c9fa25c3aae2cb719289`:
`TRANSFERRED_VERIFIED_AWAITING_EDGE_OWNER_ACK`; source window NOT_OPENED.
Trust expires`2026-10-20T08:00:59Z`; expiry is not a rollback/revoke receipt.

### Edge owner: next bounded package

1. Read this return and the actual private manifest. Verify file hashes,
   exact issuer/subject/workspace/Paper scope, Core image/config/schema and
   active trust. Reconcile latest PM runtime config against the owner journal;
   do not substitute stable identities, old trust or username matching.
2. Return a genuine acknowledgement naming that manifest SHA256, the receiving
   locator, official helper/source pins, source recovery readiness and a finite
   window. File transfer is not that acknowledgement.
3. Use the already-adopted official Edge helper
   `5f1a0f293311f752d934de72666f8b2e9d671c899eec115d08d7ccd30265dec2`.
   Do not reapply the historical companion or recreate installed source schema/
   role. Source-only new runner proposals are NOT qualified/adopted operators.
4. Recovery endpoint/owner custody must be READY before the JIT genuine30s
   assertion. Core will issue exactly one temporary private AuthService PREVIEW
   session for the existing exact Research Bobby identity through its private
   IPC, not public auto-login. Send unchanged raw request bytes to the official
   SDK. Do not print/store the token/cookie in a report.
5. Execute one finite same-attempt source transaction and retain physical
   receipt plus exact Core terminal ACK. Retry/recovery use the original key.
   UNKNOWN retains live custody; no timer-based rollback, reissue or SIGKILL.
6. After known terminal + ACK, drain handlers, retire the scoped source window
   and revoke exactly that temporary session through Core's existing finish
   path. Then report original-role/cap preservation and cleanup. Independent
   READ/STREAM policy/finite/SSE acceptance remains a separate next gate.

## 4. Failures retained; bounded resources and rollback

Operational failures were fail-closed, preserved and independently reviewed:
private file permissions, duplicate inherited Compose security option, numeric
byte-string normalization, dependency-image list comparison, then unsupported
`compose run --no-build`. The last failure happened in CLI parsing before any
forward container or migration PREPARED state existed. Explicit resume verified
that exact failure and original source/config/backup; no backup/test/build redo.
Migration guards and exact source pins were not weakened.

Build disk growth386314240bytes; backup31005076bytes. Host-wide minimum observed
MemAvailable1272000512bytes is shared-host telemetry, not isolated process RSS or
approved production budget. Per-RUN build3CPU/3GiB; maintenance1CPU/512MiB;
reverse2CPU/1536MiB; no broad prune. Test/maintenance one-off containers are
removed; listener/private custody and backups/rollback images intentionally stay
for the approved owner window. No credential issued means none claimed revoked.

Rollback may remove candidate serving only after obligations settle. Do not
restart old uncoordinated identity code under mandatory installed guards, drop
schema/audit, restore revoked grants or erase failed receipts. Forward repair is
required if the old image is incompatible. The old image and backup remain.

## 5. Remaining phases and two-way handoff

| Owner | Open work / next-ready scope |
| --- | --- |
| Core + Edge | Genuine connected identity COMMIT/Core ACK; then exact source READ and Portal READ/STREAM finite/SSE, revoke/replay/restart/recovery on installed pins. No connected PASS yet. |
| Source/financial provider | Qualified current financial publication; missing inputs remain typed absence, not zero or synthesized facts. |
| Bobby + Core | Approve numerical capacity/calibration artifacts from actual measurements. Formula/weights/bands already locked; no formula re-decision requested. |
| Core + source owners | Matched coexistence/P184 performance G2 baseline/workload/config/window. Unfilled inputs or unrelated TS/DL/PM measurements do not close it. |
| Claude | Can consume committed manager/contracts/fixtures now and continue independent UI/accessibility work. Genuine-source browser lanes await the accepted installed provider; do not use fixture BFF as C7 evidence. FE-054 partial delivery is not all-subitems accepted. No new public FE field in this repair. |
| ELP2-11 | Not entry-ready and not assigned by this handoff; no release/dev/main/deploy implied. |

Canonical navigation:
[Unified](../../../UNIFIED_IMPLEMENTATION_PLAN.md#execution-loop-v2),
[previous owner-return/wire detail](CORE_TO_EDGE_EPG10_08_OWNER_RETURN.md),
[C7 implementation ledger](c7-closeout-followthrough-2026-10-19.md),
[FE request ledger](../../FRONTEND_BACKEND_SYNC.md).

This runtime receipt is written after the already-committed implementation.
Its documentation landing is separate; do not mistake an uncommitted receipt
for a different built image or rerun unchanged full gates solely for this text.
