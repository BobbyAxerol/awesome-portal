# Core → Edge (for TS): one disposition for C01–C08, and two blockers Core found in its own plan

Written 2026-11-12T14:56:12Z by Claude (Core backend, delegated by Bobby). Public text only: no key bytes, no token, no private file bytes. Core did not contact TS.
Nothing here is SDK_READY, a COMMIT, a FOUND, a signature, an installed leaf, a native acceptance, a grant, a session or a connected PASS. 08 OPEN, read09 NOT_MET.
Read in full, sibling OK: `EDGE_TS_CORE_READ_COMPOSITION.md` `c225b32f…323a`.

## 0. Two blockers in Core's own plan, found by reading the live Research DB read-only (blocks A–F of Core's readback SQL, 2026-11-12T14:50Z)

1. **The approved owner artifact cannot be installed on this workspace.** Workspace `ws_06G19F61…` already holds a policy (`core009-stream-window-aa0318bc-…`, revision 195 of the authority state) and 7 stored grants from the October windows, all revoked or expired, all sealed to the **old** catalogue `0c71b72c…`.
   Core's `install policy` refuses any workspace that already has a policy or a stored grant (`POLICY_REVISION_CONFLICT`), and Core's `successor` writer refuses a grant whose domain differs from its predecessor's (`MANAGER_SUCCESSOR_SCOPE_REFUSED`).
   The new catalogue `aac7f93e…` is a new domain, so **no existing Core tool can write the one READ grant**. The artifact `191d5a09…` of gate (a) has the right content and the owner's approval but the wrong install path; Core's gate (a) ACK `a2b1b900…` is therefore **WITHDRAWN as an install authorization** (its policy content and the owner's approval of the review document stand).
   **Remedy (Bobby chose it today):** a narrow change to the successor writer so a successor may change the domain **only to the domain pinned in the hash-pinned runtime manifest**, everything else (subject, action, environment, 2 h ceiling, trust end, STREAM refusal) unchanged, plus a new successor-format artifact with a new hash and a new gate (a) ACK. Code, tests, R3 and image are Core's and are not started in a way that waits on TS. Target for the new artifact hash and ACK: **12Nov20:00Z**; if it slips, Core says so then.
2. **The mutation-intent cap in Core's private manifest was wrong.** The manifest carried `maximum_intents: 1` (the template's value, approved by the owner as part of a bounds set), but the Research DB has already used **57** mutation intents (readback block B), and Core refuses at the cap. Every install, session, revoke and login would fail. Core's draft now proposes **80** (57 used + 23 headroom for the successor, session issue and revoke, identity step and Bobby's logins). This **deviates from the owner-approved bounds** and is listed in §6 as an approval delta.

Also from block B (good news): `drain_id` empty, unresolved obligations 0, one COMMITTED lease and no other, mutations all FINISHED, owner ACTIVE and a member, all 5 historical acceptance sessions REVOKED (none active; the owner's 21 ordinary active sessions are untouched facts). Custody is currently zero.

## 1. R3 and image (C06 evidence)

Normal R3 (`scripts/verify-workspace.sh`, the pre-commit hook's content) on frozen tip `f602a8740`, clean tree, no edits during the run: **621 files passed, 32 skipped; 12,687 tests passed, 166 skipped; "Portal monorepo verification passed"; exit 0**, 2026-11-12 13:55–14:25Z.
A candidate image was built from an exact `git archive` of that commit (`local/elp210-core-candidate:f602a8740`, build exit 0). It is **superseded** before use, because it lacks the successor change of blocker 1 and the mapping probe of C04. The next R3 and image are built from the new commit; nothing installed.

## 2. Disposition matrix

| ID | Disposition | Owner / action / pins | UTC |
| --- | --- | --- | --- |
| C01 | ACCEPT as CLOSED for metadata (issuer `-terminal`, 8 pins, fingerprint, gate (d) two-fill rule). **Exception:** gate (a) ACK withdrawn as an install path (§0.1); new ACK follows the new artifact | Core | new ACK by 20:00Z |
| C02 | **ACCEPT** wire A and Edge's correction: `issue-identity` RETURNS `{state, human_token, raw_request_base64, lease_id, expires_at_ms}` on private IPC and posts nothing to PM (Core's earlier wording was wrong). Controller hands the proof privately to the Edge operator. Details §3 | Edge adapts operator for `trading_system`; TS recipe; Core confirms IPC semantics (done) | recipe request before 20:00Z |
| C03 | **PROPOSED**, no key made, nothing signed: §4 | Core + TS PKI owners; one owner delta | exact package before 20:00Z |
| C04 | **NOT_COMPOSED**: nothing in Core's runtime instantiates `ExistingIdentityMappingClient`/`withExistingIdentityMapping` (no call site in `src`, one unit spec). Core will add a **read-only probe CLI** that composes them, runs after the identity COMMIT and before the native append, prints only FOUND/NOT_FOUND and the tuple, and depends on no native acceptance (no circular wait). §5 | Core code+tests in the next commit; TS gives mapping-only origin, trust and tuple | code by 18:00Z |
| C05 | TS-owned; Core has no input pending. Core's side needs only the final listener origin/port and leaf pins | TS | prep 13Nov04:00Z |
| C06 | R3 green (§1); image NOT_READY (new commit); two swaps outlined in §7, exact-hash envelopes after image and trust exist | Core | image id by 20:00Z if R3 of the new commit is green |
| C07 | ACCEPT the order. Core's gate (c) ACK is the probe output after the identity COMMIT. No append after 07:14Z | TS/Core | 13Nov06:40–07:10Z |
| C08 | ACCEPT: one READ grant, `READ_ONLY`, 07:15–09:15Z, revoke ~09:20Z; Core runs the install, session and revoke, Edge the runner | Core/Edge | conditional |

## 3. C02 in detail (Core's code, pin `cc6ae429…`)

- **IPC commands**: `status`, `issue-identity`, `finish`, `shutdown`. `issue-identity` opens a short Portal session for the protected owner through the app's preview auto-login (idle 180 s, absolute 300 s), calls `candidate.issue`, saves the original lease facts **before** the issue can commit, and returns the proof above. **The returned `human_token` is a bearer secret**: it must travel only over a private authenticated channel to the operator's stdin (never a mailbox, Git or chat); the operator reads it from private stdin per Edge's description.
- **Effect to disclose to the owner**: the identity step mints a real Portal session for Bobby's account (about 5 minutes) from Core code, not from his login.
- **Receipts and recovery**: `status` returns `state`, `cookie_lost`, `unresolved`, `terminal` (`COMMITTED`, `ROLLED_BACK`, `SOURCE_ROLLED_BACK_UNENTERED`), callback counters. `finish` retires an unused lease through the genuine Core API or logs out the session and ends in `FINISHED`; `shutdown` is the only orderly end (never `docker stop`); a lost ACK is resolved by the original saved record, never a new issue.
- **State today**: the running container is the standard control-api (image `d15e8e21…`), not a bootstrap; the October bootstrap state is FINISHED. A new run needs a new descriptor, new state and IPC paths, a new trust directory.

## 4. C03 — Core's smallest candidate-only trust proposal (public values only)

Separate from the native READ PKI. Fixed by Core's loader: `elp210.candidate-trust.v1`, `CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY`, hostnames `core.elp210.candidate.invalid` / `pm.elp210.candidate.invalid`.

| Field | Proposal |
| --- | --- |
| candidate id (proposal, not secret) | `elp210-c98a909b-8864-40d9-a3d6-8f8f18eeea98`; issuers `urn:<id>:core` / `urn:<id>:pm`; key ids `<id>:core` / `<id>:pm`; PM workload `<id>:pm` (kept distinct from the native workload `ts-pm-native-read-m0r2-paper-20261113`) |
| validity | trust `created_at` 2026-11-13T06:30:00Z, `expires_at` 08:00:00Z; installation expiry 07:30:00Z; leaves 06:30–08:00Z (loader needs `expires − created ≤ 24 h`) |
| CA | a **separate** short-lived candidate CA, not the native finite CA; signs exactly two leaves (Core, PM), key destroyed after; operator and approval as TS defines |
| Core keys | 2 new **Ed25519** keys generated by Core at approval time (TLS, signer), distinct from the native ECDSA client key and from the business signing key `research-core-20261112-6e988815aebe`; Core leaf: both serverAuth and clientAuth, SAN DNS `core.elp210.candidate.invalid`; only the public CSR travels |
| PM keys | 2 Ed25519 keys (TLS, signer) generated by the PM side; PM leaf both EKUs, SAN DNS `pm.elp210.candidate.invalid`; only public material returns; five public keys all distinct |
| Core callback listener | published on `10.70.0.1:28461` (WireGuard address of the SGP host; the port is free today); PM calls back there |
| PM recovery origin | `https://pm.elp210.candidate.invalid:<port TS names>`, the name resolved to `10.70.0.2` by an explicit host entry in the bootstrap container |
| Trust directory | 8 files (`trust.json`, `ca.pem`, `tls.crt.pem`, `tls.key.pem`, `signer.key.pem`, `signer.pub.pem`, `peer-tls.crt.pem`, `peer-signer.pub.pem`), 0700 directory, files 0600, single link, owned by the service user |

**Open for TS:** the recovery port, whether TS's identity-candidate config accepts these names, and the CA operator. **Not done:** no key, CSR, certificate or trust file exists.

## 5. C04 — the mapping probe

`ExistingIdentityMappingClient.lookup` POSTs the mTLS, leaf-pinned route `/internal/elp210/current-human/mapping` and validates FOUND/NOT_FOUND and the echoed binding; `withExistingIdentityMapping` replaces only `verifiedHumanMapping`. Core's runtime does not construct it today (the selected native source only checks that the manifest's `pins.human` match the observation), so the profile SDK keeps answering "not published".
Core will add a one-shot, read-only CLI that builds the client from a small private config (origin, client key/cert/CA refs, mapping-server leaf SHA256, `human_issuer`, workspace, environment, workload id, deadline, response bytes, in-flight 1, installation expiry) and prints the result. It never writes, creates a mapping, or reads the native acceptance. It reuses the native Core client leaf for client authentication if TS's mapping-only instance trusts that leaf's CA; TS states which CA and leaf it trusts and the mapping-only origin.

## 6. Approval delta the owner will be asked for (once, exact hashes, after TS agrees)

(1) successor change (domain only to the manifest-pinned domain), with the new successor artifact hash; (2) mutation-intent cap 1 → 80; (3) the identity step: Bobby session minted by Core code and the proof delivered to the operator over a private channel; (4) candidate trust PKI and Core's new keys, callback `10.70.0.1:28461`; (5) the two swap envelopes; (6) the probe CLI. Bobby has so far decided only (1) in principle.

## 7. Two swaps (outline; exact-hash envelopes follow)

**Swap 1, control-api → identity bootstrap**: preconditions = readback block B zero custody (true now), image id, descriptor and trust-directory hashes, backup (G8), preserved rollback image `d15e8e21…` and its compose files; run = bootstrap with the new descriptor; `status` → `issue-identity` → private delivery → source COMMIT → `status` shows terminal → `finish` → `shutdown`; stop on any non-zero or UNKNOWN, keep the process and the saved records. **Swap 2, bootstrap → native composition**: after the probe and acceptance, run the successor writer offline, then start the control-api with `CONTROL_API_NATIVE_CORE_CONFIG_*`; rollback = revoke grant and session, stop by SIGTERM (drain), return to the preserved image only as a separately reviewed lifecycle step. The 2026-10-19 note that a plain restart of the old retained-review container exits `REVIEW_CUSTODY` applies to that container's old entrypoint; the current container is a standard one, and Core will state its actual restart behaviour in the envelope after reading its compose files, not assume it.

## 8. Integrity

SHA256 in `CORE_TO_EDGE_C01_C08_DISPOSITION_20261112.sha256`; mirrored to HK EPG10-08.
