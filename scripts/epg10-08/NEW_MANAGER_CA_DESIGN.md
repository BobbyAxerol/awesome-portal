# New Manager CA for 10-year standing leaves (design, 2026-11-16)

Status: `--prepare --new-ca` and `--activate` of such a bundle are implemented in
`renew_manager_tls.py` and `tested locally` with throw-away CAs only. Nothing has
run against real files, containers or the host. Not `shadow-certified`.

Why: the current Manager CA (`trading-system-portal-manager-read-v1-ca`, ends
2027-08-27T10:31Z) caps every leaf. The owner wants long-lived leaves, and the
Manager CA is independent of the Execution Offline Root, so a new Manager CA is
the path. A leaf must never outlive its CA; explicit `--validity-days` is already
capped at CA notAfter - 7 days.

## 1. Every place a trust anchor lives

Evidence = what I grepped/read; "not checked" = could not or did not verify.

Anchors that must hold the CA set (the tool stages and replaces exactly these two):

| # | Path | Consumers | Evidence |
|---|---|---|---|
| A1 | `/home/bobby/secure/portal-manager-read-v2/runtime/mtls-ca-cert.pem` (tool `RUNTIME / 'mtls-ca-cert.pem'`, mode 0600/0640) | The 6 Manager services (paper/sandbox/live x read/issuer), file bind-mounted read-only at `/run/secrets/mtls-ca-cert.pem` through env vars `PORTAL_MANAGER_READ_TRUST_BUNDLE_HOST_PATH` and `PORTAL_MANAGER_ISSUER_TRUST_BUNDLE_HOST_PATH` (`trading_system/docker-compose.portal-manager-read.yml:28,66`). The tool's own `qualify()` also uses it as the client trust file. | Servers load it with `build_manager_mtls_server_context` (`cadata=`, any number of certs) and `ManagerMtlsVerifier` (`load_pem_x509_certificates`, every cert must be CA:TRUE; issuer found by subject + validity + signature) in `trading_system/services/portal_execution_owner/identity/manager.py:282-299,576-597`. A multi-CA bundle is therefore accepted by design. The 2026-10-22 trust review in this repo (`upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_TS_PM_53890231_AND_ALL_MODE_MANAGER_TRUST_REVIEW_2026-10-22.md`) records that all six share this one file. |
| A2 | `/srv/primus/portal/source-proxy/manager-v2-ca.crt` (tool `PROXY / 'manager-v2-ca.crt'`, mode 0644) | The 3 nginx Source Proxies (paper/sandbox/live), seen in the container as `/run/secrets/manager-v2-ca.crt` (`proxy_ssl_trusted_certificate`, `proxy_ssl_verify on; proxy_ssl_verify_depth 1`). | `deploy/execution-d1/source-proxy/manager-v2-locations.conf.template` lines 18,41,64,87,110,133; `manager-r4-r5-extension-locations.conf.template` lines 25,48,71,94; the byte-identical contract copy `services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/source-proxy-manager-v2-locations.conf.template` (pinned by `contract-pack.lock.json`, so it must not be edited for this change). Rendered per profile as `manager-v2-locations.conf`, `manager-v2-locations-sandbox.conf`, `manager-v2-locations-live.conf` (`scripts/execution-profile-runtime-prepare.sh:66-73`). Preflight checks mode 644 (`scripts/execution-d2-preflight.sh:457`) and `openssl verify -CAfile manager-v2-ca.crt manager-v2-client.pem` (`:551`). The directory is bind-mounted at `/run/secrets` through `SOURCE_PROXY_SECRET_DIRECTORY` (`deploy/execution-d1/compose.dark.yaml:~172`). |

Not checked / open (Core must confirm, I did not read `/srv` or `/home/bobby/secure`):
- That `SOURCE_PROXY_SECRET_DIRECTORY` for all three proxies is `/srv/primus/portal/source-proxy`. It is inferred from the existing tool replacing `PROXY/manager-v2-client.pem` and from the shared-directory check in `execution-profile-runtime-prepare.sh`.
- `trading_system/docker-compose.portal-command-r1.yml:25,63` also mounts a `/run/secrets/mtls-ca-cert.pem` from `PORTAL_COMMAND_TRUST_BUNDLE_HOST_PATH`. If that host path is the same Manager CA file, the command-plane services are further consumers. Unknown; they are not in the tool's 9-service roster.
- The private per-profile `manager-runtime.env` files (could carry a pinned subject or hash).

Leaves replaced together with the anchors (same keys, names, extensions):
`runtime/facade-server-cert.pem`, `runtime/issuer-server-cert.pem`,
`runtime/source-proxy-manager-client.pem`, `source-proxy/manager-v2-client.pem`.

Pins by value:
- `CA_SHA` in `renew_manager_tls.py:35` = SHA-256 of the DER of the old CA (`e4a0ff8f...ddfe`). Existing mode keeps using it. In new-CA mode it still pins the OLD CA that must be in both anchors today.
- Manifest `ca_sha256` (= `CA_SHA`) and, new mode only, `new_ca_sha256`.
- Docs only: the 2026-10-22 review records the raw file SHA-256 of A1 (`e439296e...`); no code compares it.
- No `ca_sha256`/`ca_pin` constant for the Manager CA found in this repo (Rust, TS, scripts) or in `trading_system/services/portal_execution_owner` by grep. The Rust `manager-v2-client` crate's `root_ca_pem` is the Edge to Source Proxy leg (`source-proxy-ca.crt`), a different CA, and is NOT affected.
- The old CA private key (`CA_KEY`, `/home/bobby/secure/portal-manager-read-v1/mtls-ca-private.pem`) is read only by the existing mode. New-CA prepare never reads it.

## 2. What the new mode does

`--prepare --new-ca [--validity-days N] [--ca-validity-days M]` (M default 3650, 1..3700; N as before, default 30, explicit N must end at least 7 days before the new CA expires):

1. Same gates as today: lock check, old CA pinned by `CA_SHA`, roster all running, both anchors must each contain exactly the pinned old CA (`ANCHOR_NOT_PINNED_CA`, which also refuses a second prepare after anchors are already dual).
2. Generate a new Ed25519 CA in memory: subject = old subject with only the CN replaced by `trading-system-portal-manager-read-v2-ca`, CA:TRUE pathlen 0 (critical), KeyUsage keyCertSign+cRLSign, SKI, notAfter = now + M days.
3. Sign same-identity leaves (same keys, subject, extensions; only the AuthorityKeyIdentifier is re-derived from the new CA, otherwise OpenSSL rejects the chain) for N days, primary and fallback sets as today.
4. Stage one trust bundle per anchor: old CA PEM + new CA PEM, in the primary and fallback sets.
5. Bundle (root-owned 0700, files 0600): `new-ca.pem`, `new-ca-key.pem` (new CA private key, never printed or logged), `primary-0..5.pem`, `fallback-0..5.pem`, `original-0..5.pem`, `manifest.json`. Manifest adds `new_ca`, `new_ca_sha256`, `new_ca_not_after_utc`, `ca_validity_days`, `validity_days`, `leaf_not_after_utc`, and six targets (four leaves + two anchors).
6. Prints only public values (status, bundle path, manifest sha256, new CA sha256 and notAfter).

`--activate <bundle>`:
- If `manifest.new_ca` is set, the expected roster is exactly the six manifest targets (`TARGET_ROSTER_CHANGED` otherwise); the old CA is still pinned by `CA_SHA`; the new CA is pinned by `manifest.new_ca_sha256` (`NEW_CA_INVALID`); staged files and live originals are hash-checked as today (anchors are read with mode 0644 allowed, `LIVE_INPUT_CHANGED` if either drifted); each trust bundle must be exactly old CA + new CA (`STAGED_TRUST_BUNDLE_INVALID`); leaves must be issued by the new CA and each notAfter must equal the manifest value (`STAGED_VALIDITY_MISMATCH`).
- Existing mode is untouched: no `new_ca` key means `TARGETS` only and `CA_SHA` only.

## 3. Stages (as implemented) and one deliberate deviation

Implemented: ONE publish stage, using the existing `publish()` and the existing fallback and containment structure.

1. Under the measurement lease: replace the 4 leaves and 2 anchors (dual-CA bundles + new-CA leaves).
2. Restart the 6 Managers, `nginx -t` and reload the 3 proxies (existing `reload_contexts`).
3. `qualify(new_ca)`: as today, plus for every Manager TLS port the served leaf must name the new CA as issuer and verify under the new CA key (`SERVED_CHAIN_NOT_NEW_CA`). Proxy to Manager legs are proven by the 4 positive profile reads each (they only succeed if nginx trusts the new chain via A2). Then the roster must be unchanged.
4. Failure: install the fallback set (same dual bundles, other new-CA-signed leaves), reload, qualify; if that fails too, stop the 6 Managers (`contain_failure`). Unchanged rule.

Deviation from the requested two-stage flow (anchors first and probe the OLD chain, then leaves): the old leaves expire 2026-11-15T12:37:33Z per the 2026-10-22 trust review (not re-checked on disk). From then on there is no old chain that can answer a probe, so a first stage could only prove that the dual bundles load. It would cost a second restart cycle of 6 services and add a partial state with no benefit. I did not implement a stage that can never produce meaningful evidence. If the old leaves were still valid when this runs, a two-stage variant (anchors only, probe old chain, then leaves) is a small follow-up on `publish()`; it is not in this commit.

Overlap safety that the single stage still gives: both anchors keep trusting the old CA until phase 2, so anything still presenting an old-CA leaf is not cut off by trust alone; only expiry affects it.

## 4. Failure and containment matrix

| Where it fails | Result | Recovery |
|---|---|---|
| prepare: any gate, range, anchor check, write error | exact new bundle dir removed (including `new-ca-key.pem`); no live file touched | rerun after fixing |
| activate before publish (lock, roster, hash drift, validation) | nothing written | fix, re-prepare |
| during/after primary publish (replace, restart, reload, any probe) | fallback set installed (dual bundles + other new-CA leaves), same reload and qualify | `PRIMARY_FAILED_VALID_FALLBACK_LOADED` |
| fallback also fails | the 6 Managers are stopped, proxies left up | `REPAIR_AND_FALLBACK_FAILED_AFFECTED_MANAGERS_STOPPED`; owner decides |
| a Manager still running after stop attempt | `REPAIR_FAILED_CONTAINMENT_UNCONFIRMED` | manual |
| deadline / lease lost | same path as failure | as above |

There is no "roll back to the old chain": the old leaves are expired and are never reinstalled. Old anchor files are kept as `original-4.pem`, `original-5.pem` in the bundle for forensics.

## 5. What the owner must approve

1. Generate a new Manager CA and its custody choice for `new-ca-key.pem` (it stays inside the root-owned 0700 bundle; the tool does not move or delete it). With N = M - 7 no later CA use is needed, so shredding after activation is an option; otherwise move it to a custody path. Decision needed before activate.
2. Dates: M and N. Example for 10 years: `--ca-validity-days 3650 --validity-days 3640`.
3. Blast radius of activate: files `runtime/facade-server-cert.pem`, `runtime/issuer-server-cert.pem`, `runtime/source-proxy-manager-client.pem`, `source-proxy/manager-v2-client.pem`, `runtime/mtls-ca-cert.pem`, `source-proxy/manager-v2-ca.crt`; `docker restart` of the 6 Manager containers; `nginx -s reload` of the 3 proxies; nothing else (no image, config, DB, JWT or key change).
4. Rollback = the fallback set described above; there is no return to the old CA.
5. Phase 2 is a separate later approval.

Estimated outage (estimate, not measured): the Manager routes are already down if the old leaves have expired. During activate the 6 restarts are sequential with a 10 s stop grace each, plus start and 6 TLS handshakes and 3 profiles x 8 requests; expect about 2-4 minutes inside the 600 s stage deadline and 1710 s lease.

## 6. Phase 2 (not in this commit): retire the old CA

At a later calm window, after the new chain has been used without incident: prepare a second bundle that replaces both anchors with the new CA only (leaves untouched), publish, reload, probe. The old CA private key is not needed. Preconditions to add when written: every live leaf issued by the new CA, no consumer still presenting an old-CA leaf, and the command-plane question in section 1 answered. The old CA expires 2027-08-27 anyway, after which a dual bundle with an expired CA is inert: `_require_direct_trust` already ignores authorities that are not valid at the time of the check.

## 7. Known risks

- The two anchors must be real regular files with link count 1 (`private_read` rejects symlinks and hard links). If `manager-v2-ca.crt` is a symlink or hard link on the host, prepare fails closed with `PRIVATE_FILE_INVALID`.
- The new CA pin for activate comes from the manifest file in the root-owned bundle; there is no second independent pin. The owner should compare the printed `new_ca_sha256` and `manifest_sha256` at approval time.
- Leaves signed by the new CA drop any `issuer name + serial` part of an original AuthorityKeyIdentifier and carry the key identifier only.
- No real certificate was inspected (reading `/home/bobby/secure` and `/srv` was out of bounds), so the real leaf extension set, the real old CA subject attributes and the real file modes are unverified.
