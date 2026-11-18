# Manager CA phase 2: drop the old v1 CA from both trust anchors (DRAFT for the owner, not approved)

Date: 2026-11-16. Status: plan plus an offline-tested tool mode. Nothing was run against files, containers or the host except read-only
inspection of public certificates and `docker inspect` mount metadata. Not `shadow-certified`; the new mode is `tested locally`
(85 unit tests in one capped container, 15 of them new).

Goal: both Manager trust anchors keep only `trading-system-portal-manager-read-v2-ca` (ends 2036-11-13) and no longer trust
`trading-system-portal-manager-read-v1-ca` (ends 2027-08-27). Leaves are not touched. Phase 1 is `NEW_MANAGER_CA_DESIGN.md`.
Why bother: the v1 CA private key still exists (`/home/bobby/secure/portal-manager-read-v1/mtls-ca-private.pem`, mode 0600, name only);
until phase 2 or 2027-08-27 anything signed with it is accepted by every Manager and proxy.

## 1. Inventory (public certificates only; marks: checked = read on 2026-11-16)

Method: parsed only CERTIFICATE blocks of the files (a private key block in the same file is never decoded or printed), signature checked
against the v1 and v2 CA public keys. Scan roots `/home/bobby/secure` and `/home/bobby/.local/state` (1319 files, 1 unreadable): the only
certificates anywhere in them that are signed by the Manager v1 or v2 CA are the ones below. `/srv/primus/portal` is not readable by
`bobby` (`drwxr-x--- root portal-runtime`), so the proxy-side files could not be read (not checked).

| role | file (checked) | CN | notAfter | SPKI sha256 (first 24) | signed by |
|---|---|---|---|---|---|
| CA v1 | in both anchors; `portal-manager-read-v1/mtls-ca-cert.pem`; `runtime/manager-v2-ca.crt` | `trading-system-portal-manager-read-v1-ca` | 2027-08-27T10:31Z | 129004247d536a19d98b9e9c | self (fp `e4a0ff8f...ddfe`) |
| CA v2 | `runtime/mtls-ca-cert.pem` (2nd cert) | `trading-system-portal-manager-read-v2-ca` | 2036-11-13T08:39Z | ece4521fb2ec60a79dd0c83a | self (fp `786691e5...4583`) |
| facade server leaf (Paper, Sandbox and Live share this one file) | `runtime/facade-server-cert.pem` | `trading-system-manager-facade-v2` | 2036-11-03T08:39Z | 945c3c55e6f256d49f028339 | v2 |
| issuer server leaf (all three profiles) | `runtime/issuer-server-cert.pem` | `trading-system-manager-issuer-v2` | 2036-11-03T08:39Z | bf293c335fb6201c9c68f062 | v2 |
| source-proxy client leaf (the three proxies present it to the Managers) | `runtime/source-proxy-manager-client.pem` (cert + key in one file) | `portal-source-proxy-manager-v2` | 2036-11-03T08:39Z | 202e5de4d2663822c0a6c3a9 | v2 |

- Anything still signed by v1 and so blocking phase 2: none found (checked, scope above). The 2026-11-15 expired v1 leaves exist only as
  `original-*.pem` forensic copies in the root-owned 0700 bundles `renewal-epg10-08-*` (unreadable to me, not trust consumers).
- Not checked, so phase 2 must verify at prepare time: `/srv/primus/portal/source-proxy/manager-v2-client.pem` (the tool requires it to equal
  the runtime copy, `PROXY_IDENTITY_COPIES_DIVERGED`), `/srv/primus/portal/source-proxy/manager-v2-ca.crt` (the tool requires exactly
  `[v1, v2]`, `ANCHOR_NOT_DUAL_CA`), and what the three proxies actually loaded (nginx reloaded at the 2026-11-16 08:48 activation; the proxy
  containers themselves started 2026-09-15).
- Anchor file A1 `runtime/mtls-ca-cert.pem` (mode 0600, 2 certs, size 1128, mtime 2026-11-16 08:48, nlink 1, regular file): holds v1 then v2.
- Stale single-CA copies that are NOT trust anchors in use: `runtime/manager-v2-ca.crt` and `portal-manager-read-v1/mtls-ca-cert.pem` hold v1 only.
  No container mounts them (checked). `provision-manager-v2-route.py` (private, line 192) copies a CA into `manager-v2-ca.crt` of a staging
  directory: re-running that script would put a v1-only anchor back. Do not run it; retire it separately.
- Other CA families (not Manager CA, unaffected, checked by issuer name): Edge to Source Proxy leg = `Primus Portal Execution Offline Root v1` and its
  children; Core/Portal native reads = `Primus Native Manager Read Finite CA m0r2-20261113`; Core ELP210 candidate CA; SGP Client CA v1
  (`portal-research-core009`); PM `pm-owner-local-ca`; `portal-command-r1-private-ca`. No Core, Edge or Portal client certificate found on
  the host is signed by the Manager v1 or v2 CA. Core therefore reaches Manager data only through the source proxies (their client leaf is the v2
  one above) and needs no certificate change; the Rust `manager-v2-client` crate's `root_ca_pem` is the Edge-to-proxy CA (design doc section 1).

## 2. Who reads each anchor and whether reload or recreate is needed

Mounts from `docker inspect` (destinations plus host source of the anchor only; `docker ps -a` roster as of this run).

| anchor | readers (container) | how mounted | applying a change needs |
|---|---|---|---|
| A1 `/home/bobby/secure/portal-manager-read-v2/runtime/mtls-ca-cert.pem` | Paper `portal-manager-read-paper-v2-portal_manager_read-1` and `...issuer-1` | file bind mount, `/run/secrets/mtls-ca-cert.pem` ro | container restart (the file is mounted by path at start; the trust bundle is read once at process start: `manager_server.py:190`, `manager_issuer.py:222`, `identity/manager.py:282-299`, no reload signal) |
| A1 | Sandbox `trading-system-manager-read-sandbox-portal_manager_read-1` and `...issuer-1` | the same host file, same destination | the same restart |
| A1 | Live `trading-system-manager-read-live-portal_manager_read-1` and `...issuer-1` | the same host file | the same restart |
| A2 `/srv/primus/portal/source-proxy/manager-v2-ca.crt` | `portal-execution-edge-source-proxy-1`, `...sandbox-source-proxy-1`, `...live-source-proxy-1` | the DIRECTORY `/srv/primus/portal/source-proxy` mounted at `/run/secrets` ro | `nginx -t` then `nginx -s reload` (no recreate); `os.replace` of the file is visible through the directory mount |
| none | `portal-execution-edge-*-execution-edge-1` and the manager-projection workers | mount `/srv/primus/portal/execution-edge` only (the Edge to proxy CA) | nothing |

All six Managers read the SAME file (checked in all six mount lists), so Sandbox and Live need no separate step. `portal-command-r1` is
not running (no such container); if it is ever started its `PORTAL_COMMAND_TRUST_BUNDLE_HOST_PATH` must not point at a v1-only or dual file by mistake (not checked).

## 3. Mechanism: `renew_manager_tls.py --prepare --drop-old-ca` then `--activate <bundle>`

`--prepare --drop-old-ca` (new, offline-tested): lock gate; both anchors must be exactly `[v1, v2]` with the pinned fingerprints (`CA_SHA`, new
`NEW_CA_SHA` = `786691e5...4583`, both asserted equal to what is in the files; a second run is refused); v2 CA must be a current self-signed
CA:TRUE with more than 30 days left; the four live leaves must be issued by v2, verify under the v2 key, NOT verify under the v1 key, and be valid
for at least 30 more days (`LEAF_NOT_NEW_CA`, `LEAF_STILL_SIGNED_BY_OLD_CA`, `LEAF_VALIDITY_TOO_SHORT_FOR_PHASE_2`); the two proxy-client copies must be identical; all
nine services running. It never reads a CA private key or a leaf key file and writes a root-owned 0700 bundle: `primary-0/1.pem` = v2 only,
`fallback-0/1.pem` and `original-0/1.pem` = the current dual bundles, `new-ca.pem` (public), `manifest.json` with the roster (id, image, config
hash) and the sha256 of every live leaf.

`--activate <bundle>` (existing flow, extended): measurement lease, roster and live-input hash checks, re-validation of the staged set and the live leaves,
`replace_exact` of the two anchors only (mode, uid, gid preserved; proxy file stays 0644), `docker restart --time 10` of the six Managers one after
another, `nginx -t` and reload of the three proxies, then `qualify(new_ca)`: for each of the six TLS ports the served leaf must equal the file on
disk and chain to the v2 CA, then 3 profiles x (4 positive reads + 4 negative cases incl. no-client-certificate denied) through the proxies, and finally
both anchors must equal the staged bytes (`ANCHOR_NOT_AS_STAGED`) and the roster must be unchanged. On any failure: install the fallback (the dual
bundles again, which is safe because every leaf is v2-signed), reload, qualify; if that fails too, stop the six Managers
(`REPAIR_AND_FALLBACK_FAILED_AFFECTED_MANAGERS_STOPPED`). Unlike phase 1 there IS a real rollback: the old anchors are valid and
still trusted by the leaves.

## 4. Ordered steps (owner approval needed; none executed)

Preconditions (read-only, same day as the window): measurement lock file absent; the roster of the nine services is the one in the approved window
(no image swap in between: e.g. the Paper Manager container restarted at 2026-11-16 18:41Z, so a `source_identity` image roll must be finished BEFORE `--prepare`,
otherwise `SERVICE_ID_IMAGE_CONFIG_CHANGED` refuses); cert expiry check (`scripts/cert_expiry_check.py`) shows the three leaves and CA v2 far from expiry;
read access to `/srv/primus/portal/source-proxy` confirmed (the tool runs as root).
1. Back up (as root, no key material printed): copy both anchors to a private dated directory, e.g. `cp -p runtime/mtls-ca-cert.pem` and `source-proxy/manager-v2-ca.crt`
   to `portal-manager-read-v2/ca-phase2-backup-<date>/`, and record `sha256sum` of both. This is the "dual bundle copy"; the bundle's `original-0/1.pem` is a second copy.
2. `python3 -B scripts/epg10-08/renew_manager_tls.py --prepare --drop-old-ca` (root). Expect `PREPARED_NOT_ACTIVATED`, `leaves_unchanged true`, `runtime_mutations 0`. Compare the printed
   `new_ca_sha256` with `786691e52b4ec5ba021484d663aa690b8d2020ccd016c34807d78cbfc2d04583` and note `manifest_sha256` and the bundle path for the approval record.
3. Owner approves the exact `manifest_sha256` and window. Tell the people in section 6 first.
4. `python3 -B scripts/epg10-08/renew_manager_tls.py --activate <bundle>` (root; takes the host measurement lease for up to 1710 s and releases it). Expect
   `MANAGER_TLS_REPAIRED_NOT_HUMAN_POLICY_ACCEPTANCE` with `drop_old_ca true`; on failure read the `{"stage","code"}` lines on stderr.
5. Verification list (section 5). Record the evidence in the window journal.
6. After success: keep the backup directory and the bundle for at least one release cycle; the v1 private key and the v2 CA key (`portal-manager-read-v1/mtls-ca-private-v2.pem`
   root-owned, and `new-ca-key.pem` inside the phase 1 bundle) are no longer needed for anything; their shredding or archival is a separate owner decision.

Expected outage (estimate, not measured; phase 1 observed the same sequence): the six Managers restart one after another with a 10 s stop grace plus start
time, about 2 to 4 minutes in total, inside the 600 s stage deadline; each Manager's routes (and the proxy routes in front of it) answer errors while that Manager is down. Nginx reloads cause no outage. No DB, JWT, image or config change.

## 5. Verification list

Before: both anchors are `[v1, v2]` (fingerprints); the three leaves verify under v2 only; roster running; no foreign lock.
After (read-only except the listed probes):
- both anchors parse to exactly one certificate, fp `786691e5...4583` (`openssl x509 -noout -fingerprint -sha256` per file) and equal `primary-0/1.pem` of the bundle; modes unchanged (0600 / 0644);
- the four leaf files are byte-identical to the values in the manifest `leaf_sha256` (checked by the tool);
- for the six ports the tool's `qualify()` passed: loaded certificate equals the file, chain to v2, TLS 1.3;
- 3 profiles x 4 positive reads + 4 negative cases passed through the proxies (the Edge-side view: HTTP 200 on catalog, capabilities, one record page, projection; 405/405/404 denials; no client certificate refused);
- `docker inspect` roster unchanged (ids, images, config hashes), restart counts only +1 for the six Managers; Manager logs of the last 5 minutes show no `MANAGER_MTLS_TRUST_REJECTED`;
- negative trust proof with public data only: `openssl verify -CAfile <anchor after> /home/bobby/secure/portal-manager-read-v1/mtls-ca-cert.pem` must FAIL (v1 no longer trusted) and the v2 leaf `openssl verify -CAfile <anchor after> <facade-server-cert.pem>` must PASS;
- if the Edge exposes its own Manager-reachability probe (for example the guard cache source identity read), it returns 200 for all three profiles; if a Manager runs the `source_identity` image, the catalogue answer still carries `data.source_identity`.

## 6. Who must be told, blockers, rollback

- Edge/Portal operators (Edge reads Manager data through the proxies; a few minutes of Manager 5xx); Core only as information, no Core certificate is involved (checked: no Core client leaf is signed by the Manager CAs).
  Anyone who runs the private `qualify-*.py` scripts or provisioning scripts in `/home/bobby/secure/portal-manager-read-v2` must stop using the v1-only `manager-v2-ca.crt`.
- Blocking items (all must be clear): any leaf, in any place not readable today, still signed by v1 (the tool refuses on the four it can read); any consumer of the anchors outside the nine services
  (the command-plane `portal-command-r1` if started; host scripts that hand-load `mtls-ca-cert.pem` as client trust); a foreign measurement lock; an image roll between prepare and activate.
- Rollback: automatic (fallback = the dual bundles) inside `--activate`; manual if the tool itself cannot run: as root copy the backup anchors back to both paths (preserve owner and mode), `docker restart` the six
  Managers one by one, `docker exec <proxy> nginx -t && nginx -s reload` for the three proxies, then run the same verification list. Nothing else changed, so nothing else needs undoing.

## 7. What could not be verified

`/srv/primus/portal/*` (proxy anchor, proxy client copy, Edge files) is not readable by `bobby`; what the proxies actually have loaded was not re-observed (no TLS connection to any running container was made);
the live served leaf of each Manager was not re-read (phase 1's `qualify` proved it at 08:48Z); the real timing of six restarts; whether `portal-command-r1` or other host scripts read the anchor; the Core-side view of whether any
Core component pins the Manager CA (none found in this repo or on the host by grep and by certificate scan).
