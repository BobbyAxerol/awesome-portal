# Core009 PM-half transfer — owner approved and verified

**DELIVERED / BYTE_VERIFIED / NOT_INSTALLED / NOT_CONNECTED**.
Verified `2026-10-21T03:27:24.390279Z` (21/10/2026 10:27 VN).
This supersedes the exact-transfer permission blocker in the earlier
Core/Edge returns, not their runtime/authority qualification gates.

## Approval, exact scope and result

Bobby explicitly approved transferring the eight files from
SGP `/home/bobby/secure/portal-research-c7-20261019/elp210-trust-dd9UCJ/pm/`
to HK `/home/bobby/secure/edge-core009-trust-WDEszqbY/`, with no Core private
key transfer or stable permission change. The formerly denied operation was
not retried until this exact approval arrived; no alternate relay was used.

- Source checked against the exact eight-name allowlist, single-link regular
  files, ownership and0600 modes; trust hash/workspace/Paper/freshness checked.
- HK host `ip-172-31-16-126`, verified SSH host key; destination was empty,
  canonical/non-symlink and0700 before transfer. SCP with eight explicit source
  paths and preserved modes exited0; no recursive/glob transfer.
- **8/8 hashes and sizes match**, total **4,058 bytes**. Files: `ca.pem`,
  `peer-signer.pub.pem`, `peer-tls.crt.pem`, `signer.key.pem`, `signer.pub.pem`,
  `tls.crt.pem`, `tls.key.pem`, `trust.json`.
- HK final directory0700, every file0600, owner/group1001:1001 (HK Bobby).
  SGP source owner/group1000:1000 remains unchanged; do not assume Linux UIDs
  are identical across hosts or widen permissions to make them match.
- Candidate `elp210-f9b8f85c-f84f-4544-b2ee-34e4d065fb7e`; trust SHA256
  `e28b9e3256b8127953df430b586a792d22663702057c6c8c42b2e6c8ee098983`;
  expires `2026-10-22T02:48:30Z` (22/10 09:48:30 VN), not extended.
- Core private keys stayed on SGP. No password, DSN, session/cookie, business
  data or stable key was transferred; no secret values were printed.

Detailed metadata-only receipt, including per-file hashes:
`/home/bobby/.local/state/portal-execution-elp210/20261021/core009-integration/pm-eight-file-transfer-20261021.json`,
SHA256 `b640a7c46cc79014592bbba7458e1132220bbb9b423fd6d1fb8fe6dadacc39bf`.

## Edge handoff — proceed in the existing08 scope

The exact PM half is now usable **local custody on HK**, not just an SGP path.
Verify PM key/public pairs locally; bind the already prepared NEW public Core
JWK (do not use the previous candidate's key id):
SGP `.../elp210-trust-dd9UCJ/public-adapter/human-jwks.json`,173bytes,
SHA256 `ca778484d655755a8722086f188291b6e026fa093b27ff1fc5f5466e51184bfe`.
That public adapter is not one of these eight transferred files; this receipt
does not claim it was installed or that any native acceptance was appended.

Agree the finite operator window and return genuine current-head native
acceptance/observer/workload/source pins through the original08 handoff. Core
then completes reviewed configuration and zero-custody swap/session work;
READ and STREAM grants remain independent. Keep source-terminal/UNKNOWN
fences, provider28445 and all stable/dev/main/command/Live boundaries intact.
Do not repeat completed identity008 or create a second trust bundle.

## Validation, cleanup and remaining gates

This is file-transfer evidence only; no app/test stack/build/DB/schema/grant/
session/listener/service action was run. Existing source hook receipts stay
attributed to73435311/image9cf5fffa; no full-suite rerun for byte transfer.
No archive, temporary staging copy or transient test resource was created.
Retain the exact approved source/destination candidate material for finite
acceptance. Owner retires only that candidate's private material after terminal
custody/abandonment/expiry with a cleanup receipt; do not delete it before use,
delete Core recovery inputs, or prune shared resources.

No merge/push or frontend edit. ELP2-10 remains NOT_MET; installed009 and real
READ/SSE/revoke/recovery are not claimed by this successful transfer.
