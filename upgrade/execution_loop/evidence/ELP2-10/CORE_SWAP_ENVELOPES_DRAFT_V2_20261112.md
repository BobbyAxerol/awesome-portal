# Core: disposition of decision sheet §§8–9, and the two swap envelopes v2 — DRAFT, not for approval yet

Written 2026-11-12T15:57:40Z by Claude (Core backend; operator by Bobby's decision of 2026-11-12). Public text only: no key, token or private file bytes. Core did not contact TS.
Read in full: `EDGE_TS_CORE_READ_COMPOSITION.md` §§8–9, SHA256 `6c2f9e41…f8c8` (sibling OK), and Edge's source bundle `edge-current-identity-20261112/` (`SHA256SUMS` verified, 0 failures).
Supersedes `CORE_SWAP_ENVELOPES_DRAFT_20261112.md` (`36bfb03f…7e82`, kept immutable). Values in «double angle brackets» do not exist yet; nothing is installed, signed, issued or run; no COMMIT, FOUND, session, grant or connected PASS. 08 OPEN, read09 NOT_MET.

## 1. Disposition of the three CHANGE requests of §9, and the cleanup invariant

| Item | Core | Effect |
| --- | --- | --- |
| §9.1 PREPARED → READY order | **ACCEPT.** Swap 1 no longer requires an actual Edge READY. Core installs the bootstrap to `status READY` with **no assertion issued**, returns the actual v2 installation metadata, then waits; TS opens its reviewed window and Edge emits `READY_EXTERNAL_WINDOW`; **only then** Core calls `issue-identity`. Rollback before `issue-identity` leaves the TS window to be closed by TS readback, never inferred from Edge's abort | §2 swap 1 |
| §9.2 No PM private material to Core | **ACCEPT.** Core builds its own eight-file trust directory from its own local keys plus authenticated **public** inputs (CA certificate, PM leaf, PM signer public key). PM keys stay on TS. Core generates its own Ed25519 TLS and signer keys only after the owner approves the exact CSR/trust delta | §2, §3 |
| §9.3 Original-attempt / source-close ordering | **ACCEPT.** Core keeps the bootstrap (callback listener and recovery client) running until Edge reports the source close (`RETIRED`/mapping released); only then `finish` and `shutdown`. Core never ends the bootstrap on Edge's abort, expiry or EOF | §2 steps |
| Cleanup invariant (§8.4) | **ACCEPT.** At expiry Core stops new admissions only; same-attempt custody and private material are preserved until terminal settlement, then scoped cleanup. No forced container stop, no lease/credential extension, no fake terminal. Core's own candidate private keys are kept until the original attempt is terminal; the CA private key is destroyed after issuance by its owner, independent of retained leaf keys | §2 |

## 2. Swap envelopes v2

### 2.0 Common frame
| Item | State |
| --- | --- |
| Operator | the Core agent, host user, `sudo` only for root-owned reference copies; needs a live session in the slot |
| Current service | `portal-research-preview-control-api-1`, image `sha256:d15e8e21bdebacd9c972b9350ef38a7a07509c61a9231f157b898b3c2c78410a` (rev `2e31b74da`), standard `node dist/main.js`, user node, two read-only secret mounts, no custody mounts (checked 2026-11-12) |
| Candidate image | «image id from the R3-green commit», commit «sha», tree «sha», R3 receipt «sha», archive-build receipt «sha»; must contain READ-only plan, successor domain renewal, mapping probe, ready producer |
| Readback A–F (`core009-readonly-readback.sql`) | before and after each swap. Measured 2026-11-12T14:50Z: drain empty; unresolved 0; one COMMITTED lease; mutations FINISHED; **57** intents used; owner ACTIVE and a member; 5 historical acceptance sessions all REVOKED |
| Mutation-intent cap | **80** proposed (October precedent 128); owner delta |
| Backup (G8) | DB backup + TOC hash after quiesce, before any write |
| Ceilings | 2 CPU, 1536 MiB, 128 pids, read-only root, `cap_drop ALL`, user 1000:1000 |
| Stop rule | any non-zero exit, UNKNOWN custody, unresolved obligation, callback in flight, hash mismatch: stop, change nothing, keep the process and every saved record; never `docker stop` a bootstrap, never SQL repair, never a new attempt |

### 2.1 Swap 1 — standard control-api → identity-only bootstrap
**Prerequisites (all must be true, else nothing starts):** Edge status **PREPARED** (reviewed source, pins, role and trust recipe, resources, rollback); TS gate-(b) approvals; candidate trust inputs: public CA, PM leaf, PM signer public key; owner approval of the candidate-PKI delta; candidate id «`elp210-…`», validity 06:30–08:00Z (the TS maximum is ≤ 3 h).
**Composition (October precedent `reverse-compose008`):** image «id»; `entrypoint node`; user 1000:1000; `restart no`; `init`; read-only; `cap_drop ALL`; ports `10.70.0.1:28461:28461`; `extra_hosts pm.elp210.candidate.invalid:10.70.0.2`, and the PM recovery origin `https://pm.elp210.candidate.invalid:28446` (TS confirms the port is free at S0); mounts: Core's own trust directory `:ro`, bootstrap directory (script `cc6ae429…` + descriptor «sha», `:ro`), operator directory (IPC socket, state, `:rw`); command `reverse-bootstrap.cjs <descriptor> <descriptor sha256>`.
**Steps:** (1) readback + backup + preserve the current container, image alias and compose recipe; (2) recreate the `control-api` service from the override, no dependencies, check image id, `nginx -t` and reload; (3) IPC `status` must show READY, unresolved 0, callbacks 0 — **no `issue-identity`**; (4) Core returns the actual **`portal.research-core-owner-return.v2`** metadata (§3) to Edge; (5) TS opens its window, Edge emits `READY_EXTERNAL_WINDOW`; (6) **only now** `issue-identity`; the proof goes over the approved private channel to the Edge operator's stdin, never a mailbox, log, Git or chat; (7) Edge/TS: official COMMIT, VERIFIED post-check, physical receipt, drain, `EXTERNAL_WINDOW_CLOSE_REQUIRED`, TS close, `CONFIRM_EXTERNAL_CLOSE`, `RETIRED`; (8) Core IPC `status` shows `terminal: COMMITTED`; **after Edge's RETIRED**: `finish` → `FINISHED`, `shutdown` → `SHUTDOWN_READY`, process exits by itself; (9) readback again.
**Rollback:** before step 6 recreate the standard service from the preserved recipe (image `d15e8e21…`), nginx reload, readback; the unused TS window is closed by TS readback. From step 6 the identity is a fact on the TS side: keep the bootstrap, follow its saved records, never re-issue.
**Disclosed effects:** the bootstrap mints a real Portal session for Bobby's account (about 5 minutes, from Core code, not his login) and uses mutation intents; Research app traffic is served by the bootstrap during the swap and is unavailable between steps 2 and the nginx reload.

### 2.2 Between the swaps (07:05–07:14Z)
Core's mapping probe (read-only) asks TS's mapping instance for the new subject; a FOUND tuple is Core's gate-(c) ACK input. TS appends the native acceptance (`effective_from` ≤ 07:10Z; 07:14Z latest with owner consent). Core fills the five mechanical native values, compacts and hashes the serving manifest, validates it in normal mode with the live pins and both uids before the server exists.

### 2.3 Swap 2 — bootstrap exited → native composition (from 07:15:00Z)
(1) readback; (2) offline successor writer as root with root-owned copies and the native-review environment: artifact `4412d884…14b7b`, `--not-before-ms 1794554100000 --not-after-ms 1794561300000`; expected ACK one READ grant, `stream_commissioned:false`; (3) recreate `control-api` with the native-review overlay last and `CONTROL_API_NATIVE_CORE_CONFIG_FILE`/`_SHA256`; verify image id, `/api/control/readyz`, `healthz`, commit stamp, nginx upstream; (4) acceptance session (artifact «sha», TTL 2,700 s, token only into a root-owned 0600 file); Edge gets the **path and `session_id`**, never the token; (5) Edge's bounded READ, runner start no later than session expiry − 630 s; (6) about 09:20Z: revoke artifact `1d4f27dd…37de` (one READ item), session revoke, readback E/F; (7) leave or stop the server as Bobby decides.
**Rollback:** revoke grant and session (the grant also ends at 09:15Z); stop the server by SIGTERM (drain; exit 1 with `NATIVE_SHUTDOWN_RECOVERY_REQUIRED` means keep everything); return to `d15e8e21…` only as a separately reviewed step.

## 3. `portal.research-core-owner-return.v2` — Core's public template (Edge's adapter shape)
Fields: `candidate_id` «…»; `trust_manifest_sha256` «sha of Core's trust.json»; `source_commit` «40 hex of the image's commit»; `core_origin` `https://core.elp210.candidate.invalid:28461`; `source_recovery_origin` `https://pm.elp210.candidate.invalid:28446`; `runtime` `{id «container id», image «sha256:…», running true, config_sha256 «descriptor sha», effective_config_sha256 «sha of `docker compose config` of the override», actual_config_mount_environment_network_port_match «true only after Core verifies it»}`; `public_files` exactly `peer-tls.crt.pem`, `peer-signer.pub.pem`, `signer.pub.pem` with their SHA256. All values are **born after the bootstrap runs**; Core fills nothing earlier and states runtime-up is not independent installation acceptance.

## 4. Status and what is still open
R3 on the staged successor/probe tree (`ede74a0a…`) is running and not finished at this writing; the commit, the image and their hashes follow only a green result. Open before approval: image and manifest pins, descriptor and trust hashes, TS gate-(b) hashes, the owner's exact deltas (successor change, cap 80, probe, identity effects and session mint, candidate PKI, two envelopes).
