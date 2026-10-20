# Core009 operator runbook — Research only (PREPARED, NOT RUN) — revision 2, Plan B

Written 2026-10-20 by Claude (backend writer); **revision 2 (BE-P10)** after Bobby's decisions of the same day:
Plan B (READ `business.read_all` and independent STREAM `stream.subscribe` grants installed **together**, each finite,
**at most 2 hours** and never beyond the **renewed** source trust), an **official Core-side revoke** for manager-domain
grants, and an **acceptance session issued by the actual AuthService** (a private temporary Research session, revoked when
done). **Nothing here has been executed.** Every step marked OPERATOR touches a runtime, a database or a secret and needs
the operator named for it (Codex runs the swap; Bobby approves artifacts), the Research-only boundary, and zero writes to
stable/dev/main, provider28445, command/Live or C7 identity/custody/provider/bootstrap *history*.
Companion analysis: [CORE009_PREPARATION_2026-10-20.md](CORE009_PREPARATION_2026-10-20.md); code and test ledger:
[../BE-CLAUDE-2026-10-20/BE-P10.md](../BE-CLAUDE-2026-10-20/BE-P10.md). Templates and readback SQL:
`deploy/research-preview/native-core-templates/`.

## What changed in revision 2 (one screen)

| Topic | Revision 1 | Revision 2 |
| --- | --- | --- |
| Plan | A or B open | **B decided.** One artifact, two grants (READ + STREAM), separate ids and separate expiries |
| Grant window | "decide with Bobby" | each grant <= **2 h** (`PLAN_B_MAXIMUM_GRANT_MS`), `valid_until` <= renewed trust end; enforced by the **installer** (manifest pin `grant_window`) **and** the validator |
| Core revoke | none (expiry only) | `execution-native-revoke` (offline, remove-only, READ and STREAM separately, idempotent, audited) |
| Acceptance session | open decision | `execution-native-session issue|revoke` (actual AuthService, <= 2 h, token only into a root-owned 0600 file, one active at a time) |
| ACK labels | derived since commit `2062fcdc` | unchanged rule + Plan B detail (`plan`, `grants[]`); an image **built from this package** is required, the installed `7b2c7f34` image predates all of it |
| Image | reuse or rebuild | **rebuild required** (Plan B caps, revoke and session CLIs live only in the new `dist/`); R3 on the final bytes first |
| Edge corrections (BE-P10 Revision 3, 20Oct) | token cleanup by path; unchecked write count; `--dry-run` after DB composition | cleanup bound to the exact session/file (section 8.2); complete, verified token write (section 7); `--dry-run` fully offline (section 2) |

## 0. What must be true before ANY restart (all rows, else STOP)

| # | Condition | How it is shown | Owner |
| --- | --- | --- | --- |
| G1 | Bobby approved the exact artifact content: policy revision, field seals, the **two** grants and their windows, the restart, the operator | written approval reference placed in the artifact `approval_ref` | Bobby |
| G2 | Fresh Edge finite-window pins exist (NEW append-only acceptance; never revision 1/2 of `b922c105`) and the PM/Core **renewed** trust is current; its end is the `--trust-expires-at` value and the manifest `grant_window.trust_not_after_ms` | Edge observer return | Edge / PM |
| G3 | All private files filled, hash-pinned, and the offline validator exits 0 in **Plan B** mode (section 2) | validator report hash recorded | Claude/Codex |
| G4 | A second reviewer compared the filled files with the G1/G2 inputs (not with the template) | review record + file SHA256 | Codex |
| G5 | Zero Core custody (section 3, block B): no unresolved obligation, no ISSUED/ENTERED/UNKNOWN lease, `drain_id` null, IPC `status` READY/FINISHED with `cookie_lost:false`, `unresolved:0`, callbacks 0 | readback output | operator |
| G6 | Policy/grant rows for the exact workspace are still empty (block C) — otherwise it is a typed conflict, not an install | readback output | operator |
| G7 | Protected owner ACTIVE, member of the workspace, not archived/must-change (block D) | readback output | operator |
| G8 | Fresh DB backup + TOC hash after quiesce | file size + SHA256 | operator |
| G9 | Mutation capacity: `mutation_intents_used` + **6** + every later login/logout <= `maximum_intents` of the manifest (install 1, session issue 1, session revoke 1, grant revoke 1 per distinct `revocation_id`, plus headroom for a retry-refused intent) | block B vs manifest | operator |
| G10 | Rollback inputs preserved (old image, old compose/overlays, old bootstrap + descriptor, trust, backup) | listing with hashes | operator |
| G11 | The image carrying this package is built, passed R3, and its ID is the one the one-shot containers and the server use (`dist/cli/execution-native-revoke.js` and `execution-native-session.js` exist) | image ID vs tag, file listing | Codex |
| G12 | The **revoke** artifact and the **session revoke** artifact are prepared, hash-pinned and reviewed BEFORE the window opens (a revoke must never wait for a fresh review) | file SHA256 list | Codex |

## 1. Fill the templates (outside Git, on the host)

Templates (all `<<FILL:type:NAME|hint>>`, same grammar; `int`/`ms` become bare numbers):

| File | Used by | When |
| --- | --- | --- |
| `native-core-runtime.v1.template.json` | server + every offline tool (target and caps come from its hash-pinned intake) | before install |
| `private-owner-manager-commissioning.v1.read-and-stream.template.json` | installer (**Plan B**, default) | before install |
| `private-owner-manager-commissioning.v1.read-only.template.json` | superseded Plan A, kept only for provenance; Plan B manifests carry `grant_window`, which a READ-only artifact fails | not used |
| `private-owner-acceptance-session-issue.v1.template.json` | `execution-native-session issue` | after the server is up |
| `private-owner-acceptance-session-revoke.v1.template.json` | `execution-native-session revoke` | prepared now, run at the end |
| `private-owner-manager-revoke.v1.template.json` | `execution-native-revoke` | prepared now, run at the end or on demand |

1. Copy to a root-only private directory. Replace every quoted placeholder **including its quotes**; the same NAME means the same value everywhere (domain seals appear in the runtime AND the artifact).
2. **Plan B values.** `PLAN_B_MAXIMUM_GRANT_MS` <= `7200000`. `TRUST_NOT_AFTER_MS` = the renewed trust end. READ and STREAM get **different** grant ids and **their own** `valid_from/until` (STREAM may end earlier than READ; neither may exceed 2 h or the trust end).
3. Compact form: `node -e "const f=process.argv[1];const fs=require('fs');fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f,'utf8'))))" <file>` for every file. Any other byte spelling is refused.
4. `sha256sum <owner artifact>` -> `owner_intakes[0].approved_sha256`; re-compact the manifest; `sha256sum <manifest>` -> `CONTROL_API_NATIVE_CORE_CONFIG_SHA256`.
5. Ownership: the server (`USER node`) owns every TLS/signing reference and the manifest (0400/0600). Every offline tool reads its **artifact** only if it is `root`-owned `0600`, so the tools run as root and then the references they load must be root-owned too: provide a root-owned copy of the same bytes at the SAME container paths for the one-shot runs; hashes are identical.
6. Prepare the **revoke** artifacts now (G12). `revocation_id` is new for every distinct decision; the grant ids/revisions are taken from the install ACK (`grants[]`) and readback block E, so the revoke file is finalized right after install and reviewed before the window.
7. Token file path (`SESSION_TOKEN_PATH`): a NEW file name inside a root-owned directory that is not group/world-writable (for example `/run/secrets/research-native/session/` created by the operator, mode 0700). The tool creates the file exclusively and refuses an existing one.

## 2. Offline validation (no secret is read, nothing connects)

Build once from the reviewed commit: `cd apps/control-api && npm run build`.

```
node dist/cli/core009-validate.js --runtime <manifest> --owner <artifact> \
  --plan read-and-stream --expect-runtime-sha256 <CONTROL_API_NATIVE_CORE_CONFIG_SHA256> \
  --trust-expires-at <UTC ISO of the RENEWED trust end> \
  --stat-refs --runtime-uid <uid of the service> --runtime-path <manifest path as mounted>
```
Run it a second time with `--runtime-uid 0` against the installer's root-owned copies. Exit 0 required both times. A pass is not an approval or an install.
`--trust-expires-at` is **mandatory** for Plan B. If the policy is installed BEFORE the fresh Edge pins exist (to avoid the Core/Edge wait cycle), add
`--policy-install-only` (stale source/native windows become warnings; owner intake **and grant windows stay strict**), and validate the serving manifest with the live pins
in normal mode before the server is created.
Plan B refusal codes (path only, never a value): `TRUST_END_REQUIRED_FOR_PLAN_B`, `GRANT_WINDOW_PIN_MISSING`, `GRANT_WINDOW_PIN_IN_READ_ONLY_PLAN`,
`GRANT_WINDOW_PIN_OUTLIVES_TRUST`, `PLAN_B_GRANT_SET_INVALID` (not exactly one READ ALLOW + one STREAM ALLOW), `PLAN_B_GRANT_ID_NOT_DISTINCT`,
`PLAN_B_GRANTS_NOT_SAME_SCOPE`, `GRANT_EXCEEDS_PLAN_B_WINDOW` (> 2 h or > pin), `GRANT_OUTLIVES_TRUST`; plus the existing `*_PLACEHOLDER_UNRESOLVED`,
`*_SCHEMA_*`, `OWNER_ARTIFACT_SHA256_PIN_MISMATCH`, `OWNER_TARGET_PIN_MISMATCH`, `INSTALLATION_*`, `GRANT_*` window codes, `*_OWNER_MISMATCH`.
The three new artifacts support `--dry-run`: `node dist/cli/execution-native-revoke.js --artifact ... --dry-run` (reads and verifies the file, touches no database) and
`node dist/cli/execution-native-session.js issue|revoke ... --dry-run`. The session dry-run is **fully offline** (BE-P10 Revision 3): it reads only the hash-pinned manifest target, and
runs **before** any pool, schema read, native composition, `AuthService` or credential service, so it cannot connect, mutate, create the token file or issue a session. It validates the artifact completely
(root-owned 0600, SHA-256, shape, target against the manifest pin, owner, TTL, window) and the database-free token-path rules: `issue` needs a root-owned, not group/world-writable directory and **nothing** at the
path (it never overwrites); `revoke` needs nothing at the path or a root-owned regular non-symlink file. It prints only `{"operation":...,"dry_run":true,"verified":true}`; a violation is the typed
`ACCEPTANCE_ARTIFACT_REFUSED` / `ACCEPTANCE_TOKEN_FILE_REFUSED` (exit 1). A green dry-run is not proof that a later real run succeeds (the target database and the session state are checked only then).

## 3. Read-only readback — OPERATOR

`psql -X -v ON_ERROR_STOP=1 -v ws=ws_06G19F61YB8CFR7TEWMS7HQ660 -v owner=usr_5a38d5dfb08b44748f5776fbe04a1434 -f core009-readonly-readback.sql`
(one READ ONLY transaction, always rolled back). Expected **before** install:

| Block | Expectation |
| --- | --- |
| A | `portal_control` / role `portal` / system `7688673963308855330` (identical to both files) |
| B | `drain_id` null; leases all COMMITTED/ROLLED_BACK/RETIRED; `unresolved_obligations` 0; `native_read_obligations` 0; mutations all FINISHED; `mutation_intents_used` <= manifest cap - 6 |
| C | no policy row, no grants, no `POLICY_INSTALL` event |
| D | owner `ACTIVE`, `must_change_password` false, `archived` false, member 1 |
| E | no manager-domain grant, no `REVOKE` event |
| F | no acceptance session of the owner; the owner's normal sessions listed (count only) |

After install (section 5): C shows one policy row (the reviewed revision), **two** domain grants (one `business.read_all` ALLOW, one `stream.subscribe` ALLOW), one `POLICY_INSTALL`
event; **E shows both grants with `window_minutes` <= 120, `valid_until_ms` <= trust end, `revoked_at_ms` null**; B shows `mutation_intents_used` +1 FINISHED, `drain_id` null.
After the session issue: F shows exactly one ACTIVE acceptance session (`absolute_expires_at` <= issue time + TTL <= the READ grant end). After the revokes: E shows the named
grants with `revoked_at_ms` set and a new revision plus one `REVOKE` row each; F shows the session REVOKED with `research_acceptance_revoked`; the owner's normal sessions unchanged.

## 4. Quiesce the identity-only bootstrap — OPERATOR (Codex)

1. Private IPC `status` -> `READY` or `FINISHED`, `cookie_lost:false`, `unresolved:0`, callbacks 0.
2. Private IPC `shutdown` -> `SHUTDOWN_READY`, then the process exits by itself. **Do not `docker stop`/`restart`**: the bootstrap ignores SIGINT/SIGTERM, so Docker would SIGKILL it and leave `BOOTSTRAP_STARTUP_REFUSED_REVIEW_CUSTODY` (the 2026-10-19 incident).
3. Anything non-zero or UNKNOWN: **STOP**. The old bootstrap is the only process that can recover reverse identity custody; keep it running, change nothing.

## 5. Install the owner policy — OPERATOR (one-shot, offline, no listener)

`node dist/cli/execution-native-install.js policy` in a one-shot container (the image built from this package) with the Research native-review overlay environment, as root with
root-owned reference copies. It **refuses to run unless the manifest carries `grant_window`** (`NATIVE_RESEARCH_INSTALL_GRANT_WINDOW_REQUIRED`), reads the artifact through the
root-owned 0600 boundary, enforces the Plan B caps again (installer-level, independent of the validator), composes on its own pool and calls `installOwnerPolicies`. Expected stdout:

```
{"schema_version":"portal.native-research-owner-install.v1","results":[{"state":"REVIEWED_MANAGER_POLICY_ACKNOWLEDGED",
 "authority_scope":"DOMAIN_READ_AND_STREAM_GRANT","artifact_sha256":"<hash>","workspace_id":"ws_06G19F61YB8CFR7TEWMS7HQ660",
 "stream_commissioned":true,"command_commissioned":false,"plan":"READ_AND_STREAM",
 "grants":[{"grant_id":"<read id>","action":"business.read_all","valid_from_ms":N,"valid_until_ms":N},
           {"grant_id":"<stream id>","action":"stream.subscribe","valid_from_ms":N,"valid_until_ms":N}]}]}
```
`DOMAIN_READ_ONLY` here means the wrong artifact or an image that predates this package: **stop**. `stream_commissioned:true` is a *grant record*: it says nothing about a source publication,
an SSE frame, a notice or egress. Failure handling: a typed `POLICY_REVISION_CONFLICT` means the workspace is not fresh or the revision exists with different bytes — **stop, report, never retry with
edited data or seed SQL**. A generic `RECEIPT_NOT_QUALIFIED` (503) is the one opaque refusal of the artifact boundary (file owner/mode/hash/window/target/Plan B caps): re-run the validator, do not guess.
Retrying the exact same files replays the immutable ACK without writing (also after the grants expired).

## 6. Start the standard composition — OPERATOR (Codex)

Create the Research control-api from the reviewed compose overlays (`compose.native-review.yaml` last) with the default command `node dist/main.js`, the environment pair
`CONTROL_API_NATIVE_CORE_CONFIG_FILE=<mounted manifest>` and `CONTROL_API_NATIVE_CORE_CONFIG_SHA256=<hash>`, references mounted `:ro`, ceiling unchanged (2 CPU / 1536 MiB / 128 pids).
**Never set the pair on the old bootstrap container: it ignores it silently.** Verify: running image ID equals the intended tag, `/api/control/readyz` and `healthz`, stamp matches the source,
the process listens on the upstream the Research nginx resolves. Note `FEATURE_EXECUTION_REALTIME_SSE` is `"false"` in the overlay while the native manager stream is mounted by the
native consumer with `realtime_limits`: confirm from the running process (not from the grant) that the STREAM route is actually reachable before calling STREAM acceptance ready.
`CONTROL_API_STARTUP_FAILED` on stderr = fixed category, nothing started; read section 9 before retrying.

## 7. Acceptance session (actual AuthService) — OPERATOR

Not a login, not Cloudflare, not a password, not a PREVIEW claim and not a copy of any session: Research **application-session** evidence of the same class as the approved PREVIEW session
(the receipt says `RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE`).

1. Fill and compact `private-owner-acceptance-session-issue.v1` (`SESSION_TTL_SECONDS` 60..7200 **and no longer than the READ grant has left**; `user_id` is fixed to the protected owner), hash it.
2. `node dist/cli/execution-native-session.js issue --artifact <path> --sha256 <hash> --not-before-ms <N> --not-after-ms <N>` (window <= 24 h; same environment/manifest as section 5; `--dry-run` first).
3. The tool creates the token file **exclusively** (root-owned, 0600, in a root-owned non-writable directory), issues the session through `AuthService` and the SAME coordinator, writes the token **only** into that file and prints (an acknowledgement is printed only after the **whole** token document was written, fsynced and read back byte-for-byte from the same descriptor; short writes are completed within a bounded number of attempts and a write that makes no progress fails):
   `{"schema_version":"portal.native-research-acceptance-session.v1","operation":"issue","receipt":{"session_id":"ses_...","user_id":"usr_5a38...","workspace_id":"ws_...","ttl_seconds":N,"idle_expires_at":"...","absolute_expires_at":"...","token_file":{"path_sha256":"...","owner_uid":0,"mode":"0600","bytes":N},"credential_class":"RESEARCH_APPLICATION_SESSION","evidence_class":"..."}}`
   The token is **never** printed, logged, audited or put in a receipt. The private reference handed to Edge is the **token file path + `session_id`** over the approved channel (never the token).
4. A second `issue` while one acceptance session is ACTIVE is **refused** (`ACCEPTANCE_ALREADY_ACTIVE`); it never replaces. Revoke first. Other sessions of the owner (Bobby's normal ones) neither block nor are touched.
5. Typed refusals (stderr `{"code":...}`): `ACCEPTANCE_ARTIFACT_REFUSED`, `ACCEPTANCE_TARGET_MISMATCH` (wrong DB/system/login, anchor is not the pinned owner, owner not a member), `ACCEPTANCE_UNAVAILABLE` (not dev/local, owner not ACTIVE, must-change, archived),
   `ACCEPTANCE_ALREADY_ACTIVE`, `ACCEPTANCE_TOKEN_FILE_REFUSED`, `ACCEPTANCE_TOKEN_WRITE_FAILED_SESSION_REVOKED` (the secret could not be stored completely: a short or zero write, a write error, an fsync failure or a failed read-back verification; the partial file was emptied and removed, the exact session was revoked at once, no acknowledgement and no receipt), `ACCEPTANCE_TOKEN_WRITE_FAILED_REVOKE_UNCONFIRMED`
   (**read block F and revoke by id before anything else**), `ACCEPTANCE_DRAIN_PENDING` / `ACCEPTANCE_RETRY_REQUIRED` (exit 75: retry the SAME command later).

## 8. Revoke and rollback

### 8.1 Official Core-side revoke of manager-domain grants (remove-only)

`node dist/cli/execution-native-revoke.js --artifact <path> --sha256 <hash> --not-before-ms <N> --not-after-ms <N>` (same environment; `--dry-run` verifies the file only).

* Names **exact grant ids** with the expected revision from block E / the install ACK. `mode: REVOKE` sets `revoked_at_ms`; `mode: NARROW` shortens `valid_until_ms` only. **READ and STREAM are separate items** (revoking STREAM leaves the READ digest and READ cursors valid; revoking READ also stops STREAM because STREAM requires a current READ).
* Remove-only: after the plan, the final object may differ from the stored grant only in `revision` and exactly one of `revoked_at_ms` / `valid_until_ms`, and validity never grows (checked on the final object).
* Never touches: legacy scoped grants (typed `MANAGER_REVOKE_GRANT_NOT_MANAGER_DOMAIN`), another workspace's grants (indistinguishable from unknown: `MANAGER_REVOKE_GRANT_NOT_FOUND`), the policy, the seals.
* Atomic per artifact (one transaction). Idempotent per `revocation_id`: the exact same file prints the original receipts with `replayed:true` and writes nothing; the same id with other bytes is `MANAGER_REVOKE_KEY_CONFLICT`.
* Typed no-ops: an expired grant (`NOOP_EXPIRED`) and an already revoked one (`NOOP_ALREADY_REVOKED`) are never rewritten; their audit row still records the decision.
* Audit: one immutable `portal_access_policy_events` row per grant (`operation='REVOKE'`, `source='portal.private-owner-manager-revoke.v1'`); facts only: grant identity, domain hashes, windows, approval/provenance references. No secret, path or artifact hash.
* Exit codes: `0` receipts on stdout; `75` retry the SAME file (`MANAGER_REVOKE_DRAIN_PENDING`: open drain or unresolved/UNKNOWN native custody; `MANAGER_REVOKE_RETRY_REQUIRED`: a lock timeout, e.g. a reader or another maintenance holds the workspace); `2` usage; `1` any other typed refusal (`MANAGER_REVOKE_ARTIFACT_REFUSED`, `_TARGET_MISMATCH`, `_NOT_COMMISSIONED`, `_GRANT_NOT_FOUND`, `_ACTION_MISMATCH`, `_REVISION_CONFLICT`, `_NARROW_INVALID`, `_NARROW_NOT_EARLIER`).
* A predictable refusal (unknown grant, stale revision, wrong target, ...) happens BEFORE any intent exists: nothing is stranded; fix the file and re-run (the same `revocation_id` is still free). A failure *after* the intent exists (for example a lock timeout while applying) keeps the intent PENDING: the authority drain stays open and **reads stay refused** until the SAME file completes, which is the intended fail-closed behavior for a revoke. Re-run the exact same file immediately; do not edit it, do not use SQL.
* **What a running consumer does** (verified with fakes in `be-p10-revoke-running-consumer.spec.ts`; real-PG half NOT_RUN): the revoke is DB state under the SAME coordinator, so there is no cross-process hint and none is needed.
  1. While the revoke runs the authority drain is open: new native admissions get `CURRENT_HUMAN_DRAINING`; the database triggers also refuse the grant write unless the coordinator owns the drain and **no native obligation is unresolved** (so a frame/READ in flight must settle first; that is the `75` retry).
  2. After commit, every subscribed stream client's next poll runs the trusted `current()` factory = a fresh locked Core decision. Revoked grant -> `ACCESS_DENIED`; contended lock -> `ACCESS_RETRY_REQUIRED`; narrowed window -> a different scope identity. Each **closes the client and the native stream** (`access_revoked`); no source read, no frame, no acquire and no byte follows (the hub never appends a terminal write to a native owner's response). The latency is the poll cadence of the server's stream coordinator.
  3. A frame being delivered re-checks again immediately before `acquire`, and the Candidate re-checks inside its own transaction before the physical send; a revoke committed between poll and send still refuses the frame.
  4. A READ cursor/token minted before: a STREAM-only revoke leaves the READ scope digest byte-identical (still valid); a READ revoke is `ACCESS_DENIED`; a narrowed READ makes the old expected digest `ACCESS_RETRY_REQUIRED` (409) and the fresh digest differs; shared caches key on the authority fingerprint, which includes the stored domain grants, so a revoke is a miss.
  5. New subscriptions after the revoke are refused before any native stream is opened. A reconnect denial is **not** by itself proof that an *active* SSE was cut: the PASS evidence is the matched Core/source receipts (Edge) plus the zero-byte negative case.

### 8.2 Revoke the acceptance session

`node dist/cli/execution-native-session.js revoke ...` with `private-owner-acceptance-session-revoke.v1` (`session_id` from the issue receipt). Revokes **exactly that session** (state `REVOKED`, reason `research_acceptance_revoked`,
the same effect as a logout: the owner's lease check fails at once), refuses a session that is not a Research acceptance session of the pinned owner (`ACCEPTANCE_SESSION_NOT_ACCEPTANCE`; the owner's normal sessions are never touched),
is idempotent (`ALREADY_REVOKED_BY_THIS_OPERATION` / `ALREADY_TERMINAL`), and only **after** the session is provably terminal wipes and removes the token file **if that file is the token file of exactly this session**
(`token_file: REMOVED|ABSENT|REMOVE_FAILED|RETAINED_NOT_BOUND_TO_SESSION`). The cleanup is bound to the exact session (BE-P10 Revision 3): the file at the path must be a root-owned regular file whose six-field document
carries this `session_id`, this `user_id` and a token that hashes to this session's stored hash; the wipe goes through the verified descriptor and the unlink happens only if the path still names that inode. Anything else —
a newer session's token at a reused path, a replaced, oversized, empty or torn file — is **retained untouched** and reported as `RETAINED_NOT_BOUND_TO_SESSION` (the session is revoked regardless; remove such a file
by hand only after confirming whose it is). A replayed revoke of an old session is therefore a typed terminal no-op that can never remove the token of a newer, still ACTIVE session. `ABSENT` means nothing was at the path;
`REMOVE_FAILED` means a non-root or non-regular file or an I/O error (the file is left as found).

### 8.3 Rollback matrix

| Situation | Action |
| --- | --- |
| Before section 5 | Nothing changed. Discard the private copies. |
| Policy installed, server not started or failed | Policy rows are immutable history (no delete/overwrite). **Rollback = revoke (8.1) + expiry**: the grants end at their own <= 2 h windows at the latest. The old identity-only bootstrap is unaffected and may be restarted from its preserved image/compose/descriptor only after block B is zero. |
| Window over / acceptance done | Revoke both grants (one artifact, two items) **and** the acceptance session; read blocks E and F; keep the receipts. Expiry alone also closes access but leaves no revoke receipt. |
| Standard server running, must stop | `SIGTERM` the process: it drains the app, then ends its own Core pool (exit 0). Exit 1 + `CONTROL_API_NATIVE_SHUTDOWN_RECOVERY_REQUIRED` = drain not proven: keep the container and DB as they are, do not kill or reset. Then block B before anything else. |
| Revoke keeps answering `MANAGER_REVOKE_DRAIN_PENDING` | A native obligation is unresolved/UNKNOWN. Do not force-close, SQL-repair or fabricate a terminal row. Read block B; the original source recovery owns it; retry the SAME file after it settles. Meanwhile grant expiry (<= 2 h) is the bound. |
| Any UNKNOWN / non-zero custody | Keep original objects, recovery registry inputs, receipts. Expiry of a window or trust is **not** a release. |
| Return to the previous service | Preserved image `sha256:7b2c7f34...`, old compose + overlays, bootstrap `cc6ae429...` + descriptor; state file `FINISHED` means it cannot issue another identity (correct). A separately reviewed lifecycle step, never a blind restart. |

Backup restore is a last resort and a separate decision (it would also roll back unrelated Research data written since the backup).

## 9. Zero-custody swap — what Codex does, in order (no step is run by this writer)

1. G1–G12 satisfied; image built and R3 green; the revoke and session-revoke artifacts reviewed and staged (not executed).
2. Edge opens the finite source window (official maintenance CAS) and returns fresh pins; Core fills runtime + owner artifacts, validates in **Plan B** mode (both uids), reviewer compares.
3. Baseline readback A–F; backup (G8).
4. Quiesce the identity-only bootstrap through IPC `shutdown`; re-read block B (zero custody or STOP and keep the old bootstrap).
5. Install the policy (section 5) -> ACK and readback C/E. Record the two grant ids and revisions in the revoke artifact; review it.
6. Start the standard composition (section 6); health, image ID, route reachability for READ and for STREAM.
7. Issue the acceptance session (section 7); hand Edge the token **file path** and `session_id` (not the token). Edge runs its READ then STREAM acceptance against the Research origin; negative cases include the official revoke (8.1) with correlated receipts.
8. At the end of the window (or on any doubt): grant revoke (8.1), session revoke (8.2), readback E/F, stop or leave the server per Bobby; record what was actually run and the explicit NOT_RUN list.
9. Anything UNKNOWN: stop; keep originals, recovery inputs and receipts.
