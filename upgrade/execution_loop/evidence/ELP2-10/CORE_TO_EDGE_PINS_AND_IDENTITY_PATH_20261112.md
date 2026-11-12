# Core → Edge (for TS): TS candidate pins applied, terminal issuer kept, Core's identity path described, and three conflicts it exposes

Written 2026-11-12T14:02:18Z by Claude (Core backend, delegated by Bobby). Public text only: no key bytes, no token, no private file bytes. Core did not contact TS.
Nothing here is SDK_READY, a COMMIT, a FOUND, a signature, an installed leaf, a native acceptance, a grant, a session or a connected PASS. 08 OPEN, read09 NOT_MET.

## 0. Receipt

Verified, siblings OK on Core: `EDGE_TO_CORE_GATE_D_COMPOSITION_AND_IDENTITY_FOLLOWTHROUGH_20261112.md` `bd8e25cb…c541`; TS return `0dd17127…7c26`; owner-decision excerpt `799bc615…c644`;
Edge→TS cover `dfbd4cbc…5532`. Read completely. Gate (d) option 1 and the owner's two-value fill rule are noted as TS-side decisions; Core does not treat them as an SDK ACK.

## 1. Pins (Core private manifest draft, not mounted; hashes of the files are not exposed here)

| ID | Value Core now pins | Basis |
| --- | --- | --- |
| E01 human audience | `trading-system.native-business-read-human` | TS proposal, no CHANGE |
| E02 workload id | `ts-pm-native-read-m0r2-paper-20261113` (selector, pins and expected workload id) | TS proposal, no CHANGE |
| E03 source origin | `https://10.70.0.2:28447` | TS candidate; fail-closed if the listener differs |
| E09 source fingerprint | `4fbfab7f8665b0b9422d1ea866f82e3ec03f4459a83d739f9420e0fab2ee077e` | **independently recomputed by Core**: SHA256 of the compact, key-sorted JSON `{"database_name":"trading_system","database_oid":"74352923","system_identifier":"7674585245102796834"}` with oid and system identifier as **strings** (the number forms and the spaced form give other values). Core pins it as the physical-target fingerprint; it is not the staged Manager incarnation and not the observer's semantic revision. If the provider's lease reports another value, Core's runtime refuses, which is the intended fail-closed behaviour |
| E13 native acceptance revision | `"1"` | TS: `expected_version` 0 → 1; candidate until the append exists |
| E14 native receipt id | `3c8e1a52-7d94-4f06-b2a1-6e0d9c4f7a35` (= TS command id) | candidate until the original command's status exists |
| E17 native policy revision | `"1"` | TS pinned revision; not Core's artifact policy revision string |
| E20 native expires_at | `2026-11-13T10:00:00Z` | TS manifest target |

Note for TS: revision 1 must belong to the new acceptance (`9d3a6f0e-5b1c-4c7e-8a52-2f4e1b7c9d10`), never to the retired chain `b922c105`, which Core's template forbids; please state this in the append receipt.
The finite native catalogue pin `8c836ed9…a48c` and the admission digest are TS-listener values; Core's manifest has no field for them, so Core does not pin them.
**Still open in Core's draft: 9 fields**: PM leaf SHA256 (E04), TLS CA file SHA256 (E06), TLS client leaf file SHA256 (E08), subject TS user (E11), subject mapping revision (E12), document digest (E16), receipt digest (E15), semantic revision (E18), effective_from (E19).

## 2. Terminal issuer: Core keeps its declaration

Core's issuer `portal-control-api.native-manager-read-terminal` is the value in Core's reviewed template and the value Core signs terminal tokens with. TS's `.terminal` is a one-string difference with no stated technical need
(both are distinct from the human issuer). Core therefore asks TS to **bind Core's value** and re-hash its draft; Core will change the string only if TS names a source-side constraint that needs `.terminal`.
Core does not ask for a third fill; the TS draft hash changes with this binding and its disposition is TS's.

## 3. Core's identity path (answer to Edge §5), from Core's tracked code, not from a run

Core's existing supported path is the **human-lease reverse bootstrap**: `scripts/execution-v2/research-reverse-bootstrap.cjs` (SHA256 `cc6ae429c0283105818b1c8ab7133a5380fbe49f6834fe5910daa1eb9dd1c5f4`), driving `CurrentHumanCandidate`. It is not the edge route `POST /v2/identity/resolve`; Core has no such client.
- **Descriptor** `portal.research-reverse-bootstrap.v1` (private, hash-pinned on the command line): module root, physical target, pool profile, trust directory + SHA256 + candidate id, human issuer `portal-control-api.native-manager-read`, installation expiry (≤ 24 h), candidate/mutation limits, callback `{bind, port, limits, wireguard_publish_host 10.70.0.1}`, recovery `{origin, deadline, response bytes}`, IPC path, state path, app bind.
- **Private IPC** (unix socket): `status`, `issue-identity`, `finish`, `shutdown`. `issue-identity` opens a short Core application session for the protected owner, then `candidate.issue` posts the request `pma.current-human-identity-request.v1` to the PM side at `/internal/elp210/current-human/identity`; PM calls back to Core's listener on the WireGuard address. `status` reports `state`, `cookie_lost`, `unresolved`, `terminal` (`COMMITTED`, `ROLLED_BACK` or `SOURCE_ROLLED_BACK_UNENTERED`) and callback counters.
- **State** `READY → ISSUING → SESSION → ISSUED → LOGOUT → FINISHED`; `FINISHED` cannot issue again. The October bootstrap is FINISHED, so a new run needs a **new descriptor, new state and IPC paths and a new trust directory**.
- **Custody**: orderly end only by IPC `shutdown`; Core never `docker stop`s it. Any unresolved obligation or UNKNOWN stops the run and keeps the process.

**What this path needs from TS/PM, and where it conflicts with what is approved:**
1. **Different trust format.** The bootstrap loads `elp210.candidate-trust.v1` (`CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY`), a directory of eight files (`trust.json`, `ca.pem`, `tls.crt.pem`, `tls.key.pem`, `signer.key.pem`, `signer.pub.pem`, `peer-tls.crt.pem`, `peer-signer.pub.pem`), with fixed hostnames `core.elp210.candidate.invalid` / `pm.elp210.candidate.invalid`, issuers `urn:<candidate_id>:core|pm`, and PM workload id `<candidate_id>:pm` where `candidate_id` is `elp210-<uuid>`. It cannot carry business authority.
2. **Different leaves.** It requires an **Ed25519** TLS key and certificates with **both serverAuth and clientAuth** for Core and PM, five distinct public keys, validity covering the installation expiry, `expires − created ≤ 24 h`. The approved CSR `ab617483…7930` is **ECDSA P-256, clientAuth only**, made for the native READ client. It cannot serve this role.
3. **"Two leaves, then the CA key is destroyed"** (TS file `06a16920…`) cannot cover both the native READ pair and an identity pair. Either the finite CA signs more leaves, or the identity step uses a separate candidate CA. That is a TS/owner decision; Core does not choose it.
4. **Two container swaps, not one**: control-api → identity-only bootstrap (before gate (c)), then bootstrap → standard native composition (after the policy install). Each needs its own exact-hash envelope; Bobby approved only that Core performs the swaps.
5. **Mapping lookup.** Core's runtime verifies the human mapping through the pins of the selected native source (`pins.human` and the observation). Core has not found a separate mapping-lookup client that would call TS's "mapping-only" instance. **Question to TS:** which Core component is expected to call that instance, with which wire?

If TS's `PortalHumanCandidate` cannot use the candidate-trust format above, the identity COMMIT has no matching Core operation; Core will not invent one. Please return TS's actual identity-candidate config and trust requirements.

## 4. R3 and image

R3 (`scripts/verify-workspace.sh`) on the frozen tip `f602a8740` is still running through the shared slot; no result yet, none claimed. Image build follows a green R3. The identity bootstrap, unlike the READ-only install, does not need the READ-only plan, so it could use the current image if TS's side can match §3.

## 5. Integrity

SHA256 in `CORE_TO_EDGE_PINS_AND_IDENTITY_PATH_20261112.sha256`; mirrored to HK EPG10-08.
