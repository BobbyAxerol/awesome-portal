# Core: the two control-api swaps — DRAFT envelope outline (not for approval yet)

Written 2026-11-12T15:08:11Z by Claude (Core backend; operator by Bobby's decision of 2026-11-12). Public text only. **DRAFT:** values in «double angle brackets» do not exist yet.
An envelope is approved by the owner by exact SHA256 only after every «value» is filled and TS/Edge have returned their parts. Nothing here is run.

## 0. Common frame (both swaps)

| Item | State |
| --- | --- |
| Operator | the Core agent, running as the host user with root only through `sudo` for root-owned reference copies; it needs a live session during the slot |
| Current service | `portal-research-preview-control-api-1`, image `sha256:d15e8e21bdebacd9c972b9350ef38a7a07509c61a9231f157b898b3c2c78410a` (revision `2e31b74da`), standard `node dist/main.js`, user node, mounts only the two read-only secret directories; compose files recorded in its container label (`compose.yaml`, research-progress, research-preview, execution-store, retained-review, fixture-bff, hybrid-fixture and an image override) |
| Candidate image | «image id built from the R3-green commit», source «commit», tree «tree», R3 receipt «sha», archive-build receipt «sha»; must contain the READ-only plan, the successor domain renewal, the identity mapping probe, the ready producer |
| Read-only readback (blocks A–F of `core009-readonly-readback.sql`) | run before each swap and after; measured today 2026-11-12T14:50Z: drain empty, unresolved 0, one COMMITTED lease, mutations all FINISHED, 57 intents used, owner ACTIVE and a member, no active acceptance session |
| Mutation-intent cap | 1 in the first draft is wrong: **80** proposed (57 used); October precedent 128 |
| Backup (G8) | fresh DB backup + TOC hash after quiesce, before any write |
| Resource ceilings | 2 CPU, 1536 MiB, 128 pids, read-only root, `cap_drop ALL`, user 1000:1000 (as the October bootstrap) |
| Stop rule | any non-zero exit, UNKNOWN custody, unresolved obligation, callback in flight or hash mismatch: **stop, change nothing, keep the running process and every saved record**; never `docker stop` a bootstrap, never SQL repair, never a new attempt |

## 1. Swap 1 — standard control-api → identity-only bootstrap (06:40–07:05Z, before gate (c))

Precondition: TS/Edge deliver the candidate trust directory (eight files, §4 of the C01–C08 disposition), the source recovery origin and port, and the operator is READY to RUN. Without them nothing starts.
Composition (modelled on the October record `reverse-compose008`): image «id», `entrypoint node`, user 1000:1000, `restart no`, `init`, read-only, `cap_drop ALL`, 2 CPU / 1536 MiB / 128 pids, port `10.70.0.1:28461:28461` (callback), `extra_hosts pm.elp210.candidate.invalid:10.70.0.2`, mounts: candidate trust dir `:ro`, bootstrap directory (script `cc6ae429…` + descriptor, `:ro`), operator directory (IPC socket and state, `:rw`); command `reverse-bootstrap.cjs <descriptor> <descriptor sha256 «sha»>`.
Steps: (1) readback + backup; (2) preserve the current container, image alias and compose recipe for rollback; (3) recreate the `control-api` service from the override, no dependencies; verify image id equals the intended one; reload nginx so its upstream resolves the new address (`nginx -t` first); (4) IPC `status` must show READY, `unresolved 0`, callbacks 0; (5) `issue-identity` → proof returned on IPC; **deliver it to the Edge operator's private stdin over the approved private channel** (never a mailbox, file in Git, or chat); (6) the operator performs the source COMMIT and the VERIFIED read-only post-check (Edge/TS); (7) IPC `status` must show `terminal: COMMITTED`, callbacks as expected; (8) `finish` → `FINISHED`; (9) `shutdown` → `SHUTDOWN_READY`, the process exits by itself; (10) readback again.
Rollback: **before step 5**, recreate the standard service from the preserved recipe (image `d15e8e21…`), nginx reload, readback. **From step 5** the identity is a fact on the TS side: keep the bootstrap, follow its saved records, never re-issue; recovery is the bootstrap's own `finish`/`status` path.
Effects to disclose: the bootstrap mints a real Portal session for Bobby's account (about 5 minutes) and uses one or more of the mutation intents; the Research app is served by the bootstrap during the swap, and is unavailable between steps 3 and the reload.

## 2. Between the swaps (07:05–07:14Z)

Core's probe CLI (read-only) asks the TS mapping instance for the new subject: FOUND tuple → Core's gate (c) ACK input. TS appends the native acceptance (`effective_from` ≤ 07:10Z, 07:14Z latest with owner consent). Core fills the five mechanical native values, compacts and hashes the serving manifest (`CONTROL_API_NATIVE_CORE_CONFIG_SHA256`), and validates it in normal mode with the live pins, both uids, before the server exists.

## 3. Swap 2 — bootstrap exited → native composition (from 07:15:00Z)

Steps: (1) readback (block C now shows the old policy; E the 7 old grants); (2) offline **successor writer** as root with root-owned reference copies and the native-review environment: artifact `4412d884…14b7b`, `--not-before-ms 1794554100000 --not-after-ms 1794561300000`; ACK expected: one READ grant, `stream_commissioned` false; (3) recreate `control-api` with the native-review overlay last and `CONTROL_API_NATIVE_CORE_CONFIG_FILE` / `_SHA256`: image id, `/api/control/readyz` and `healthz`, stamp equals the commit, nginx upstream; (4) issue the acceptance session (artifact «sha», TTL 2,700 s, token only into a root-owned 0600 file); hand Edge the **path and `session_id`**, never the token; (5) Edge runs the one bounded READ, runner start no later than session expiry − 630 s; (6) at about 09:20Z: revoke artifact `1d4f27dd…37de` (one READ item), session revoke, readback E/F; (7) leave or stop the server as Bobby decides.
Rollback: revoke grant and session (the grant also ends at 09:15Z by itself); stop the server by SIGTERM (drain; exit 1 with `NATIVE_SHUTDOWN_RECOVERY_REQUIRED` means keep everything); return to image `d15e8e21…` only as a separately reviewed step.

## 4. Open before this can be approved

Candidate trust and TS's recovery port; the operator's current identity recipe (Edge); the image and manifest hashes; TS's gate (b) hashes; the owner's exact-delta approvals listed in the C01–C08 disposition §6. The 2026-10-19 `REVIEW_CUSTODY` incident concerned the old retained-review entrypoint, not the standard container running today; Core will confirm by reading the compose recipe before swap 1, not assume.
