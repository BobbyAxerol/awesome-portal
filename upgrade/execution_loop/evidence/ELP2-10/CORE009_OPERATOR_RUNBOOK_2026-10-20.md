# Core009 operator runbook — Research only (PREPARED, NOT RUN)

Written 2026-10-20 by Claude (backend writer). **Nothing here has been executed.**
Every step marked OPERATOR touches a runtime, a database or a secret and needs
Bobby's explicit go for that step, an approved operator (Codex/Bobby, not this
writer), and the Research-only boundary: no stable/dev/main, no provider28445,
no command/Live, no change to C7 identity/custody/provider/bootstrap *history*.
Companion analysis: [CORE009_PREPARATION_2026-10-20.md](CORE009_PREPARATION_2026-10-20.md).
Templates and readback SQL: `deploy/research-preview/native-core-templates/`.

## 0. What must be true before ANY restart (all rows, else STOP)

| # | Condition | How it is shown | Owner |
| --- | --- | --- | --- |
| G1 | Bobby approved: artifact content (policy revision, field seals, grant window, plan READ-only or READ+STREAM), the restart, the operator | written approval reference placed in the artifact `approval_ref` | Bobby |
| G2 | Fresh Edge finite-window pins exist (NEW append-only acceptance; never revision 1/2 of `b922c105`) and the PM/Core trust is current at the window end | Edge observer return; `--trust-expires-at` accepted by the validator | Edge / PM |
| G3 | Both private files are filled, hash-pinned, and the offline validator exits 0 (section 2) | validator report hash recorded | Claude/Codex |
| G4 | A second reviewer compared the filled files with G1/G2 inputs (not with the template) | review record + both file SHA256 | Codex |
| G5 | Zero Core custody (section 3, block B): no unresolved obligation, no ISSUED/ENTERED/UNKNOWN lease, `drain_id` null, IPC `status` READY/FINISHED with `cookie_lost:false`, `unresolved:0`, callbacks 0 | readback output | operator |
| G6 | Policy/grant rows for the exact workspace are still empty (block C) — otherwise it is a typed conflict, not an install | readback output | operator |
| G7 | Protected owner ACTIVE, member of the workspace, not archived/must-change (block D) | readback output | operator |
| G8 | Fresh DB backup + TOC hash taken after quiesce | file size + SHA256 | operator |
| G9 | Mutation capacity: `mutation_intents_used` + 1 ≤ `maximum_intents` in the manifest (install uses exactly one intent; every later login/logout uses more) | block B vs manifest | operator |
| G10 | Rollback inputs preserved (old image, old compose/overlays, old bootstrap + descriptor, trust, backup) | listing with hashes | operator |

## 1. Fill the templates (outside Git, on the host)

1. Copy the two templates to a root-only private directory. Choose the owner
   template: `…read-only.template.json` (default) or `…read-and-stream.template.json`
   (only if Bobby chose plan B — see the analysis, section 5).
2. Replace every quoted `"<<FILL:type:NAME|hint>>"` including its quotes. `int`
   and `ms` become bare JSON numbers; others stay strings. Same NAME means the
   same value everywhere (domain seals appear in the runtime AND the artifact).
3. Write both files in the reviewed **compact** form: `node -e
   "const f=process.argv[1];const fs=require('fs');fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f,'utf8'))))" <file>`.
   Any other byte spelling is refused by the runtime and the installer.
4. `sha256sum <owner artifact>` → `owner_intakes[0].approved_sha256` in the manifest.
   Re-compact the manifest, then `sha256sum <manifest>` → the value of
   `CONTROL_API_NATIVE_CORE_CONFIG_SHA256`.
5. Ownership: **two reference sets are needed.** The server (`USER node`) must own
   every TLS/signing reference and the manifest (0400/0600). The offline
   installer reads the owner artifact only if it is `root`-owned 0600, so the
   installer must run as root, and then the references it loads must be
   root-owned too. Provide a root-owned copy of the same bytes at the SAME
   container paths for the installer run only; hashes are identical.

## 2. Offline validation (no secret is read, nothing connects)

Build once from the reviewed commit: `cd apps/control-api && npm run build`.

```
node dist/cli/core009-validate.js --runtime <manifest> --owner <artifact> \
  --plan read-only --expect-runtime-sha256 <CONTROL_API_NATIVE_CORE_CONFIG_SHA256> \
  --trust-expires-at <UTC ISO of the renewed trust end> \
  --stat-refs --runtime-uid <uid of the service> --runtime-path <manifest path as mounted>
```
Run it a second time with `--runtime-uid 0` against the installer's root-owned
copies. Exit 0 required both times. A pass is not an approval or an install.
If the policy is installed BEFORE the fresh Edge pins exist (to avoid the
Core/Edge wait cycle), validate that installer-only manifest with
`--policy-install-only` (stale source/native windows become warnings; owner
intake and grant windows stay strict), and validate the serving manifest, with
the live pins, in the normal mode before the server is created.
Typical refusals: `*_PLACEHOLDER_UNRESOLVED`, `*_SCHEMA_*` (unknown key, inline
secret, wrong type), `OWNER_ARTIFACT_SHA256_PIN_MISMATCH`, `OWNER_TARGET_PIN_MISMATCH`,
`INSTALLATION_*`/`GRANT_*` window codes, `STREAM_GRANT_IN_READ_ONLY_PLAN`,
`SELECTION_HAS_NO_READ_GRANT`, `*_OWNER_MISMATCH` (the uid tension above).

## 3. Read-only readback — OPERATOR

`psql -X -v ON_ERROR_STOP=1 -v ws=ws_06G19F61YB8CFR7TEWMS7HQ660 -v owner=usr_5a38d5dfb08b44748f5776fbe04a1434 -f core009-readonly-readback.sql`
(one READ ONLY transaction, always rolled back). Expected **before** install:

| Block | Expectation |
| --- | --- |
| A | `portal_control` / role `portal` / system `7688673963308855330` (identical to both files) |
| B | `drain_id` null; leases all COMMITTED/ROLLED_BACK/RETIRED (no ISSUED/ENTERED/UNKNOWN); `unresolved_obligations` 0; `native_read_obligations` 0; mutations all FINISHED; `mutation_intents_used` ≤ manifest cap − 1 |
| C | no policy row, no grants, no `POLICY_INSTALL` event |
| D | owner `ACTIVE`, `must_change_password` false, `archived` false, member 1 |

After install (section 5): C shows exactly one policy row (the reviewed
revision), one `business.read_all` ALLOW (+ one `stream.subscribe` ALLOW only in
plan B), one `POLICY_INSTALL` event; B shows `mutation_intents_used` +1 FINISHED
and `drain_id` null.

## 4. Quiesce the identity-only bootstrap — OPERATOR

1. Private IPC `status` → `READY` or `FINISHED`, `cookie_lost:false`, `unresolved:0`, callbacks 0.
2. Private IPC `shutdown` → `SHUTDOWN_READY`, then the process exits by itself.
   **Do not `docker stop`/`restart`**: the bootstrap deliberately ignores
   SIGINT/SIGTERM, so Docker would SIGKILL it after the grace period and leave
   `BOOTSTRAP_STARTUP_REFUSED_REVIEW_CUSTODY` on the next start (the 2026-10-19
   incident).
3. Anything non-zero or UNKNOWN: **STOP**. The old bootstrap is the only process
   that can recover reverse identity custody; keep it running, change nothing.

## 5. Install the owner policy — OPERATOR (one-shot, offline, no listener)

`node dist/cli/execution-native-install.js policy` in a one-shot container with
the Research native-review overlay environment, as root with the installer's
root-owned reference copies. It prepares the manifest, composes on its own
pool, and calls the existing `installOwnerPolicies`. Expected stdout:
`{"schema_version":"portal.native-research-owner-install.v1","results":[{"state":"REVIEWED_MANAGER_POLICY_ACKNOWLEDGED",
"authority_scope":"DOMAIN_READ_ONLY"|"DOMAIN_READ_AND_STREAM_GRANT",…}]}` — the
`authority_scope`/`stream_commissioned` split exists only in an image built from
this package's commit; the currently installed image always prints
`DOMAIN_READ_ONLY`/`stream_commissioned:false` even for an artifact that records
a STREAM grant, so confirm STREAM with readback block C, never with the ACK.
Failure handling: a typed `POLICY_REVISION_CONFLICT` means the workspace is not
fresh or the revision exists with different bytes — **stop, report, never
retry with edited data or seed SQL**. Retrying the exact same files replays the
immutable ACK without writing.

## 6. Start the standard composition — OPERATOR

Create the Research control-api from the reviewed compose overlays
(`compose.native-review.yaml` is the last overlay) with the default command
`node dist/main.js`, the environment pair
`CONTROL_API_NATIVE_CORE_CONFIG_FILE=<mounted manifest>` and
`CONTROL_API_NATIVE_CORE_CONFIG_SHA256=<hash>`, references mounted `:ro`, ceiling
unchanged (2 CPU / 1536 MiB / 128 pids). **Never set the pair on the old
bootstrap container: it ignores it silently and stays identity-only.** Verify:
running image ID equals the intended tag, `/api/control/readyz` and `healthz`,
stamp matches the source, and the process listens on the same upstream the
Research nginx resolves (reload nginx only if the container IP changed).
`CONTROL_API_STARTUP_FAILED` on stderr = fixed category, nothing started; read
section 8 before retrying.

## 7. Acceptance is a separate step

A genuine session for the protected owner, READ, then independent STREAM, revoke
and recovery cases are Edge/Core connected evidence and are **not** produced by
this runbook. Session issuance is an open question for Bobby (analysis, section 9).

## 8. Rollback and stop rules

| Situation | Action |
| --- | --- |
| Before section 5 | Nothing changed. Discard the private copies. |
| Policy installed, server not started or failed | Policy rows are immutable history (no Core delete/overwrite path). The old identity-only bootstrap is unaffected by them and may be restarted from its preserved image/compose/descriptor only after block B is zero. Containment is the finite grant `valid_until_ms`. |
| Standard server running, must stop | `SIGTERM` the process: it drains the app, then ends its own Core pool (exit 0). Exit 1 + `CONTROL_API_NATIVE_SHUTDOWN_RECOVERY_REQUIRED` = drain not proven: keep the container and DB as they are, do not kill or reset. Then block B before anything else. |
| Any UNKNOWN / non-zero custody | Keep original objects, recovery registry inputs, receipts. Expiry of a window or trust is **not** a release. No force-close, no SQL repair, no fabricated terminal row. |
| Return to the previous service | Preserved image `sha256:7b2c7f34…`, old compose + overlays, bootstrap `cc6ae429…` + descriptor; state file `FINISHED` means it cannot issue another identity (correct). Starting it is a separately reviewed lifecycle step, never a blind restart. |

Backup restore is a last resort and a separate decision (it would also roll back
unrelated Research data written since the backup).
