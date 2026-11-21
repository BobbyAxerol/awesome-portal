# BE-P10 — Core009 follow-up: Plan B installer, official manager-domain revoke, Research acceptance-session issuer/revoker (Claude, 2026-10-20)

Owner Claude (backend writer; Bobby's 2026-10-20 approval of Plan B, an official Core-side revoke and an AuthService-issued temporary acceptance session).
Codex reviews and performs the runtime swap. Base `4972daec` (tip of `claude/be-integ`, contains BE-P7/BE-P9); private worktree branch
`worktree-agent-a65cca4dfd8644a0f`. Tier **R3, focused gates only**; ordinary hook **NOT_RUN** (`git -c core.hooksPath=/dev/null`). **No migration, no HTTP route,
no contract artifact changed** (so `contracts-test.sh` is not needed and NOT_RUN), no runtime/DB/Docker/SSH/secret access, no FE edit, no edit to
`UNIFIED_IMPLEMENTATION_PLAN.md` / `FRONTEND_BACKEND_SYNC.md`; `contracts-snapshot.json`, EDS-12/N29 ledgers and `persistence-ownership.v1.json` are NOT committed (the lead regenerates;
see "Ledger rows the lead must refresh"). Nothing here is installed, issued, revoked or connected: **PREPARED_SOURCE_ONLY**. Every fixture value is `TEST_ONLY`.

## Status (vocabulary: DELIVERED_AT_COMMIT = source + fake-backed tests green; PENDING_GATE = R3 on final bytes / image build; NOT_RUN = needs PG or a runtime)

| Task | Status | Commit |
| --- | --- | --- |
| 1. Official offline Core-side revoke (READ and STREAM separately), CLI + service, audit, replay, typed refusals, running-consumer behavior | DELIVERED_AT_COMMIT (fakes); **real PostgreSQL spec written, NOT_RUN**; PENDING_GATE (R3 + new image); **Codex ACCEPTED / CHANGES_REQUESTED requested** | `630d5fdf` |
| 2. Plan B installer (READ + STREAM together, <= 2 h, <= renewed trust), truthful ACK, validator, templates | DELIVERED_AT_COMMIT (fakes); PENDING_GATE; Codex review requested | `cfade7cc` |
| 3. Acceptance-session issuer + revoker through the actual AuthService, token only into a root-owned 0600 file | DELIVERED_AT_COMMIT (fakes); **real session issuance NOT_RUN**; PENDING_GATE; no owner decision needed | `d5983721` |
| 4. Runbook revision 2 + this ledger + addenda on the analysis and the owner return | DELIVERED (docs, R0) | this commit |

Code commits: `cfade7cc` -> `630d5fdf` -> `d5983721` (30 files in the three, +2593/-47 with tests and templates). New image required: the installed `sha256:7b2c7f34...` image (built from `7818d563`) has none of it.

## 1. Task 1 — the official revoke

**Where grants are evaluated** (read, not changed): `selectManagerDomainGrant` requires `g.revoked_at_ms === null && valid_from <= now < valid_until` and an exact owner/subject/policy/seal match;
READ and STREAM are resolved separately and STREAM additionally needs a current READ (`evaluateManagerDomainStream`). The authority fingerprint and both scope digests include the stored domain grants
(grant id/revision/window), so a revoke or narrowing changes every digest derived from them. Grants are stored in `portal_access_grants_v2` (UPDATE allowed), audit in `portal_access_policy_events`
(UPDATE/DELETE trigger-forbidden). The `authority_change` trigger refuses a grant/session write unless the coordinator owns the pending drain and **no native obligation is unresolved**: the revoke
**must** go through `CurrentHumanMutations` (this is why the CLI is the right shape), and a pending frame/READ makes it retry.

**Design.** `execution-native-revoke` -> `readPinnedManagerRevoke` (root-owned 0600 regular file via `private-root-file.ts`, SHA-256 pin, compact JSON, exact target pin from the hash-pinned manifest
intake, finite operator window <= 24 h; only the minted token is accepted by the service) -> `ExecutionAccessService.revokeReviewedManagerDomainGrants`:
1. read-only pre-check (`SET TRANSACTION READ ONLY`, physical target): if the audit rows of EXACTLY this artifact exist -> return the original receipts (`replayed:true`), write nothing, no coordinator call;
2. `executeVerified({family:"REVIEWED_POLICY", operation:"REVOKE_MANAGER_GRANT"})`; `authorize` (dry plan: advisory lock `portal-access-v2:<ws>` = the key readers try-lock, DB identity, owner anchor, reviewed policy FOR UPDATE NOWAIT, plan) runs BEFORE the intent exists, so a predictable refusal never strands a drain;
3. `apply`: `UPDATE` of the named grants + one immutable event per grant (`operation='REVOKE'`, `source='portal.private-owner-manager-revoke.v1'`, `source_receipt_id=<revocation_id>:<grant_id>`, per-grant `key_digest`), all in one transaction.

Remove-only: `REVOKE` sets `revoked_at_ms` (= DB clock); `NARROW` shortens `valid_until_ms` (strictly after now, strictly before the stored value, after `valid_from`). `assertManagerRevokeNeverWidens` checks the FINAL object: only
`revision` and exactly one of the two fields may differ and validity never grows; a cleared revocation or another field is a typed refusal. Outcomes per grant: `REVOKED`, `NARROWED`, `NOOP_ALREADY_REVOKED`, `NOOP_EXPIRED`
(no grant write; the audit row still records it as receipt `outcome:"DENIED", http_status:200, reason_code:"NOOP_*"` to avoid widening the shared receipt vocabulary — question 2).
Typed refusals (`ManagerRevokeError`, fixed message, code only): `ARTIFACT_REFUSED`, `NOT_COMMISSIONED`, `TARGET_MISMATCH`, `GRANT_NOT_FOUND` (unknown **and** other-workspace ids are indistinguishable), `GRANT_NOT_MANAGER_DOMAIN` (legacy), `ACTION_MISMATCH`, `REVISION_CONFLICT`,
`NARROW_INVALID`, `NARROW_NOT_EARLIER`, `KEY_CONFLICT`, `DRAIN_PENDING` / `RETRY_REQUIRED` (CLI exit 75: retry the SAME file). Because the key is permanent per `revocation_id`, an artifact that is *refused before the intent exists* can be fixed and re-run under the same id; a
failure inside `apply` keeps the intent PENDING (retained, exactly like the installer) and the exact retry completes it once.

Audit scope: every revoke that is PERFORMED (or typed-no-op'd) leaves one immutable row per grant; a REFUSED attempt changes no state and leaves no Core row (its record is the CLI's typed stderr code and the reviewed artifact), exactly like a refused installer run.

**What a running consumer does** (documented in the runbook 8.1, verified in `be-p10-revoke-running-consumer.spec.ts`): no cross-process hint is needed. (1) During the revoke the drain is open: new native admissions get `CURRENT_HUMAN_DRAINING`. (2) After commit, every client's next
`ScopedReplayHub.poll` calls its trusted `current()` = `authorizeManagerNativeStream` = a fresh locked Core decision; revoked READ or STREAM -> `ACCESS_DENIED`, contended lock -> `ACCESS_RETRY_REQUIRED`, narrowed window -> changed scope identity: all terminate the client and **close the
native stream**, with no source read, no frame, no `acquire`, no byte (the hub never appends a terminal write to a native response). (3) Frame delivery re-runs `current()` before `acquire`, and the Candidate re-checks (`assertNativeExecutionNoticeCurrent`) inside its own transaction, so a revoke committed between poll and send still refuses the frame.
(4) READ-only revoke also stops STREAM (needs READ); STREAM-only revoke leaves the READ scope digest byte-identical; a narrowed READ makes the old `expected_scope_digest` `ACCESS_RETRY_REQUIRED` (409). (5) New subscriptions are refused before a native stream is opened. The latency is the poll cadence of the server's stream coordinator (not in the code I read: question 5).
`ScopedReplayHub.revoke(predicate)` stays an in-process fast purge only.

## 2. Task 2 — Plan B installer

`PrivateOwnerCommissioningPin.grant_window` (`{plan:"READ_AND_STREAM", maximum_grant_ms <= 7200000, trust_not_after_ms}`, optional strict key of `owner_intakes[]` in the hash-pinned manifest) makes `readPinnedOwnerArtifact` demand exactly one READ ALLOW + one STREAM ALLOW (same
subject/environment/domain/field-seal reference, **distinct ids, their own intervals**), each `valid_until - valid_from <= maximum_grant_ms` and `valid_until <= trust_not_after_ms`; anything else is the one opaque `RECEIPT_NOT_QUALIFIED` 503 (no oracle). An already-expired window is a validator finding only (the lost-ACK replay stays possible).
`execution-native-install policy` refuses a manifest without the pin (`NATIVE_RESEARCH_INSTALL_GRANT_WINDOW_REQUIRED`); the serving path is unchanged. Fresh-policy-only and the typed `POLICY_REVISION_CONFLICT` are unchanged (no merge, no repair, no seed).
**ACK labels:** derived from the artifact since `2062fcdc` (the installed image predates it and prints `DOMAIN_READ_ONLY`); a regression test pins "a STREAM artifact never reports READ-only/`stream_commissioned:false`, with or without the pin". Under a Plan B pin the ACK adds `plan` and the two grants' ids and windows (READ-only ACK bytes unchanged).
**Validator** (`core009-validate --plan read-and-stream`): `--trust-expires-at` mandatory (`TRUST_END_REQUIRED_FOR_PLAN_B`), 2 h hard cap (`--max-grant-hours` can only lower it), manifest pin required/forbidden by plan (`GRANT_WINDOW_PIN_MISSING` / `_IN_READ_ONLY_PLAN`), pin vs trust (`GRANT_WINDOW_PIN_OUTLIVES_TRUST`), `PLAN_B_GRANT_SET_INVALID`, `PLAN_B_GRANT_ID_NOT_DISTINCT`, `PLAN_B_GRANTS_NOT_SAME_SCOPE`,
`GRANT_EXCEEDS_PLAN_B_WINDOW`, `GRANT_OUTLIVES_TRUST`; the grant caps stay strict in `--policy-install-only`. Templates updated (runtime `grant_window`, STREAM hints); the READ-only owner template is kept as superseded.

## 3. Task 3 — acceptance session

**Reuse, not new authority.** `AuthService.issueResearchAcceptanceSession` is a wrapper over the existing one-view issuance (`issueVerifiedSession`, the coordinator's `VERIFIED_AUTH_ISSUANCE`, a new operation label `RESEARCH_ACCEPTANCE`), the same `createSession` and audit as login/preview. Research-only (AUTH_MODE dev + PORTAL_ENV local + coordinator present).
TTL 60 s..2 h applied to **both** idle and absolute lifetime (and never beyond the service's own limits); the session is stored with access subject `research-acceptance:v1`, which (a) gives the "at most one ACTIVE" rule — a second issue is REFUSED (`ACCEPTANCE_ALREADY_ACTIVE`), never replaces — and (b) can never validate under Cloudflare mode.
The owner's normal sessions neither block nor are touched. Evidence class in every receipt: `RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE` (same class as the approved PREVIEW session; **not** a Cloudflare-main acceptance).
`execution-native-session issue|revoke`: root-owned 0600 hash-pinned artifacts, target from the manifest, finite window. Issue: exclusive creation of the root-owned 0600 token file first (parent root-owned and not group/world-writable, `O_EXCL|O_NOFOLLOW`), then issuance, then the token is written **only** there. The token is in no stdout/stderr/receipt/audit/event
(asserted over console, stdout, stderr, receipts, audit, events, sessions, coordinator calls). A write failure after commit revokes that exact session at once (`..._SESSION_REVOKED`) or says it could not confirm (`..._REVOKE_UNCONFIRMED`). Revoke: exact session id via `REVIEWED_POLICY / REVOKE_ACCEPTANCE_SESSION`; refuses any session that is not an acceptance session of the pinned owner; idempotent; wipes and removes the token file only after the session is terminal.

## 4. Files

| Area | Files |
| --- | --- |
| Shared boundary | `execution-v2/private-root-file.ts` (root-owned pinned file reader, compact JSON, argv), `execution-v2/owner-target.ts` (target pin + physical/anchor/member checks) |
| Task 1 | `execution-v2/manager-domain-revoke.ts`, `access.service.ts` (`revokeReviewedManagerDomainGrants`, `revokeManagerDomainOn`, `priorManagerRevoke`), `native-core-composition.ts` (`revokeOwnerManagerGrants`), `current-human-mutations.ts` (zod operations only), `cli/execution-native-revoke.ts` |
| Task 2 | `core-owner-commissioning.ts`, `native-core-runtime.ts`, `cli/execution-native-install.ts`, `core009-preparation.ts`, `cli/core009-validate.ts` |
| Task 3 | `auth/auth.service.ts`, `execution-v2/research-acceptance-session.ts`, `cli/execution-native-session.ts` |
| Deploy | `deploy/research-preview/native-core-templates/`: runtime + STREAM templates edited; new `private-owner-manager-revoke`, `private-owner-acceptance-session-issue`, `private-owner-acceptance-session-revoke` templates; readback SQL blocks E and F |
| Tests | `test/be-p10-manager-revoke.spec.ts` (40), `be-p10-revoke-running-consumer.spec.ts` (8), `be-p10-plan-b-installer.spec.ts` (26), `be-p10-acceptance-session.spec.ts` (38), `be-p10-templates.spec.ts` (18), `be-p10-manager-revoke-pg.spec.ts` (3, **PG-gated, NOT_RUN**), `test/fixtures/fake-core-world.ts`, `core009-templates.ts`, one narrowed guard in `elp210-core009-validate-cli.spec.ts` |

## 5. Tests and gates (with what they are not)

All fakes: a scripted in-memory Core world + fake coordinator (`fake-core-world.ts`, **not PostgreSQL**), a fake root-owned filesystem and token sink, the REAL `AuthService`, `ExecutionAccessService`, evaluators (`evaluateManagerDomainRead/Stream`), `ScopedReplayHub`. Cases: positive revoke READ only / STREAM only / both; NARROW; replay (pre-check and replay-only transaction);
KEY_CONFLICT; wrong workspace; unknown; legacy; wrong action; stale revision; expired and already revoked (typed no-ops); wrong DB/system/login/anchor; not commissioned; drain pending then completion; failure after intent (rollback + exact retry); concurrent revoke vs read (same advisory key, 55P03 -> retry-required, reader 409);
audit row allow-list with no secret/path/hash; never-widens (7 mutations); artifact boundary (owner/mode/symlink/size/hash/pretty/unknown key/target/window/forged token); Plan B caps (11 invalid shapes, pin bounds, tighter pin, replay after expiry, ACK labels, validator codes); session issue (owner principal, TTL cap both lifetimes, token only in sink, second issue refused, normal sessions untouched, 9 refusals, write failure, no coordinator),
session revoke (exact, idempotent, expired, not-acceptance, wrong target, custody pending, wipe failure), default token sink (O_EXCL|O_NOFOLLOW 0600, root-owned parent, wipe before unlink).

| Gate | Result |
| --- | --- |
| `tsc -p tsconfig.build.json --noEmit` (control-api, at `d5983721`) | **exit 0** |
| Scoped `tsc` over the 5 new specs (not the PG one), the fixtures, `elp210-core009-*` specs and the 4 CLIs (temporary config, not committed) | **exit 0**. Adding the PG-gated spec gives exit 2 with exactly one diagnostic, `test/harness.ts: Cannot find module 'node-pg-migrate'` under `moduleResolution: node` — the same pre-existing diagnostic every PG spec importing the harness has; no diagnostic in any file written here |
| vitest focused, `--maxWorkers=2`, Node host, no PG: `be-p10-*` + `elp210-core009-*` + `elp210-native-core-runtime`, `-manager-consumer`, `-manager-domain-access`, `-commissioning`, `-current-human-candidate`, `-root-receipt`, `-lifecycle-authority`, `-native-frame-coupled`, `-native-http-selected` + `native-*` + `elp209-realtime` + `elp209-native-frame-coordinator` | **26 files passed, 4 skipped (PG-gated); 673 tests passed, 375 skipped (PG-gated)**; exit 0. New in this package: 130 passing (40 + 8 + 26 + 38 + 18) and 3 PG-gated skipped |
| Earlier wider run (adds `elp210-*`, `elp209-*`, `a4-*`, `auth.spec.ts`) | 1545 passed, 1 failed (the readback-SQL guard, fixed in `d5983721` and re-run green: 17/17) and **4 files failing on `ECONNREFUSED 127.0.0.1:5432`** (`a4-account-lifecycle`, `a4-governance-delegation`, `a4-owner-access`, `auth`; no PG on this host) = NOT_RUN, unrelated to this change |
| Default-path proof | the pre-existing owner-install / commissioning / native-core / composition / main-boot specs pass unchanged (the installer's file boundary was moved into `private-root-file.ts` with identical checks); the new-test-on-old-code variant (rules 10.10a-5) is NOT_RUN for Plan B because the new behavior is opt-in by the manifest pin and absent otherwise |
| Ordinary hook / R2 / R3 on the final bytes, image build, `contracts-test.sh` | NOT_RUN (R3 of the landing; no contract artifact changed) |

## 6. NOT_RUN (and what runs it)

* Real PostgreSQL: `be-p10-manager-revoke-pg.spec.ts` (3 tests: real coordinator + triggers, immutable audit, reader-holds-lock, authority-lock timeout) and the existing PG specs. **Needs a disposable `TEST_DATABASE_URL`.**
* The four `a4-*`/`auth.spec.ts` files need a PG on 127.0.0.1:5432 and cannot run here (pre-existing, unrelated).
* Normal R2/R3 ordinary hook for the final bytes; image build; `contracts-test.sh` (no contract artifact changed); full-project `tsc` (fails on pre-existing unrelated test files; the build config and the scoped config over the new files are the gates).
* Everything on a runtime: install, session issue, revoke, source window, STREAM route reachability, connected READ/STREAM/revoke/recovery.

## 7. What Codex does at the swap (details in runbook revision 2, section 9)

Build the image from the landed commit and run R3; stage reviewed **revoke** and **session-revoke** artifacts before the window (G12); validate in Plan B mode with the renewed trust end; baseline readback A–F; quiesce the bootstrap by IPC `shutdown`; install (ACK must say `DOMAIN_READ_AND_STREAM_GRANT` with the two grants and windows <= 2 h);
start `node dist/main.js` with the env pair; issue the acceptance session and hand Edge the token **file path + session_id** (never the token); run the official revoke + session revoke at the end; read E/F. Mutation capacity: `maximum_intents` must exceed `mutation_intents_used + 6` (install, session issue, session revoke, each revoke artifact, plus headroom).

## 8. Ledger rows the lead must refresh (not edited here)

`persistence-ownership.v1.json`: `portal_access_grants_v2` (new offline owner-maintenance remove-only ingress `execution-native-revoke`), `portal_access_policy_events` (same ingress, `operation='REVOKE'`, `source` tag), `auth_sessions` / `auth_audit_events` (new offline ingress `execution-native-session`; one new locked read of `auth_sessions`).
No capability-inventory row is needed: **no HTTP route was added.**

## 9. Questions for Codex

1. **Coordinator family.** The durable `elp210_candidate.mutations` table has a family CHECK but no operation column, so both remove-only operations ride on `REVIEWED_POLICY` as zod-only operations (no schema/hash change), and the acceptance session on `VERIFIED_AUTH_ISSUANCE / RESEARCH_ACCEPTANCE`. Accept, or do you want distinct families (that is a schema change + re-registration)?
2. **No-op receipts.** `NOOP_EXPIRED` / `NOOP_ALREADY_REVOKED` are written as Core access receipts with `outcome:"DENIED", http_status:200` and the typed `reason_code`, to avoid a new `AccessReceipt.outcome` member (which the public audit DTO may enumerate). Accept or extend the vocabulary?
3. **Retained intent.** Like the installer, a failure inside `apply` keeps the intent PENDING (drain open, reads refused) until the SAME file completes. For a revoke that fail-closed behavior is intended, but there is no offline `abort` command (only the private `recoverAbandoned`). Do you want one?
4. **STREAM route reachability.** The native-review overlay sets `FEATURE_EXECUTION_REALTIME_SSE=false`; the stream is mounted by the native consumer through `realtime_limits`. Please confirm from the running process that the STREAM route is actually reachable before treating the STREAM grant as commissionable; a grant record says nothing about it.
5. **Revoke latency.** A running stream client is closed at its next poll; which cadence does the Research stream coordinator use? If it is too slow for the acceptance claim, an in-process notifier would need a DB `LISTEN` (new code, not built).
6. **Token delivery to Edge.** The token lives in a root-owned 0600 file; the cookie name is `__Host-portal_session` (Secure, https only). Who reads the file and sets the cookie for Edge's harness, and over which approved channel does the path travel? Idle expiry shortens to 30 min after the first `markSeen`, so the harness must keep using the session.
7. **Renewed trust does not exist yet.** The current candidate trust ends `2026-10-20T08:00:59Z`; Plan B artifacts can only be validated and installed once the renewed end is known (the caps bind to it).
8. **Persistence-ownership / capability ledgers**: please confirm the row updates in section 8 (no route, so no capability row).

## Revision 3 (Edge CHANGES_REQUESTED 20Oct)

Edge reviewed the pinned bytes of `0deeee70` and returned CHANGES_REQUESTED on three exact items (handoff section "Core009 revision2 - CHANGES_REQUESTED before commissioning"); Bobby's approval of the Core009 work covers this correction. Written by Claude on a fresh worktree reset to the `claude/fe-parity` tip `be6d98d1`. Same limits as above: **fakes only, no runtime, no secret, no database, no Docker/SSH, no migration, no HTTP route, no contract artifact**, `git -c core.hooksPath=/dev/null`; `contracts-snapshot.json` and the EDS-12/N29 ledgers are not committed. Nothing was installed, issued, revoked or connected: still **PREPARED_SOURCE_ONLY**.

| # | Edge item | Fix | Commit |
| --- | --- | --- | --- |
| 1 | Revoke cleanup removed whatever file sat at the token path: issue S1 at P, revoke S1, issue S2 at the reused P, replay the S1 revoke wiped S2's live token while S2 stayed ACTIVE | Cleanup takes the exact binding `{session_id, user_id, token_sha256 = stored session_token_hash}` (the revoke lock now also selects `session_token_hash`; it is never put in a receipt). The default sink opens no-follow, requires a root-owned regular file of 1..4096 bytes, and removes it only if the six-field `portal.research-acceptance-session-token.v1` document carries that session id, that user and a token hashing to that hash (constant-time compare). It wipes through the verified descriptor and unlinks only if the path still names that inode. A mismatched, replaced, oversized, empty, torn or reused-path file is **RETAINED untouched**: receipt `token_file: "RETAINED_NOT_BOUND_TO_SESSION"`; absent (ENOENT/ENOTDIR only) stays `ABSENT`; a non-root/non-regular file or an I/O error stays `REMOVE_FAILED`. Terminal/recovery semantics are unchanged: the replayed S1 revoke is the same typed `ALREADY_REVOKED_BY_THIS_OPERATION` no-op and never touches S2 | `6fa94980` |
| 2 | The token sink ignored `FileHandle.write().bytesWritten`: a short or zero write was fsynced and acknowledged after the session COMMIT | The default sink loops until the whole buffer (<= 4 KiB) is written using `bytesWritten`, at most `ACCEPTANCE_TOKEN_WRITE_MAX_ATTEMPTS = 16`; zero, negative, NaN or larger-than-requested counts fail. After the (kept) fsync it checks the fstat length and reads the content back from the same descriptor (constant-time compare, buffers zeroed, never logged). Flags are now `O_RDWR\|O_CREAT\|O_EXCL\|O_NOFOLLOW`, 0600, root-owned parent as before. Any failure truncates the partial secret, then the existing compensating **exact-session** revoke runs (`..._SESSION_REVOKED`, or `..._REVOKE_UNCONFIRMED` if that cannot complete); no receipt, no ACK, no token in any output | `e04f1684` |
| 3 | `execution-native-session --dry-run` branched only after `buildPool`, the registered-schema read, native composition and AuthService/Argon2 construction | The CLI reads the hash-pinned manifest target (no Core DB query) and branches on `--dry-run` **before** any Pool, schema read, `compose`, `AuthService` or `Argon2CredentialService`. New `verifyAcceptanceArtifactOffline` validates the artifact fully (root-owned 0600, SHA-256, compact JSON, shape, target vs manifest pin, owner, TTL, finite window) and the DB-free token-path rules through a new read-only `preflight` on the sink (issue: root-owned non-writable parent and nothing at the path; revoke: nothing or a root-owned regular non-symlink file). It creates, writes, wipes and unlinks nothing | `6111eb39` |
| 4 | Persistence ingress ledger (lead-owned) | `persistence-ownership.v1.json`: `portal_access_grants_v2` and `portal_access_policy_events` gain the offline remove-only `execution-native-revoke` ingress; `auth_sessions` and `auth_audit_events` gain the offline `execution-native-session` ingress; `auth_sessions` one new locked read (`read` and `readers` 2 -> 3). The tools reuse existing repository statements, so no other verb count changes. The file has one row per table (the tests key by table), so the four existing rows were edited in place in their own layout (14 lines changed), not duplicated | `be83e7fb` |
| - | Typing follow-up | the acceptance spec rig types `deps.files` as `AcceptanceTokenFiles` (scoped tsc finding; test-only) | `32c0d6eb` |

Runbook rev 2 (same file name, same revision label, corrected in place) was refreshed in sections 2 (`--dry-run`), 7 (complete verified write, write-failure codes) and 8.2 (token cleanup, `RETAINED_NOT_BOUND_TO_SESSION`) and the "what changed" table. Its SHA-256 is now `bd9c908ba238f7cc9eabd2d2c13764ab1ab6ceee30ff1e0b22b6c129f7dcb35e` (the handoff's `3417afbd...` pin is superseded).

### New pins (SHA-256 of the files at the last code commit `32c0d6eb`; `be83e7fb` for the ledger)

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/research-acceptance-session.ts` (was `2bd35bb2...`) | `6a4ed7dc790318d60c4fd2593e48ac1845629afde444b38b11bbfba3661d1eb3` |
| `apps/control-api/src/cli/execution-native-session.ts` (was `df0f3277...`) | `fa353d3398acd79fdff8525972c1130622c8978306d0c2227c2e092be4290257` |
| `apps/control-api/test/be-p10-acceptance-session.spec.ts` | `81aa116b3c9645fbabe4c33c8556c45c1661afc7d017db3663fc23477c7cc464` |
| `apps/control-api/test/be-p10-native-session-cli.spec.ts` (new) | `07c114b3724ef3fe2a3614c6b657f7af7ca4eccd453a5f854b643c5a58477b06` |
| `upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/persistence-ownership.v1.json` | `b0b35646ecf1c3c6c426b4a96bca5b77ff045909eaf8505e6f8aaea12c53f92b` |

### Tests and gates (and what they are not)

All fakes: the scripted in-memory Core world and fake coordinator (**not PostgreSQL**), the REAL `AuthService`, a fake inode-level disk behind a mocked `node:fs/promises` for the default sink (inodes survive unlink while a handle is open), and spies on the pool factory, schema check, composition, AuthService and credential service for the CLI.

| Gate | Result |
| --- | --- |
| `be-p10-acceptance-session.spec.ts` | **63 passed** (was 38): +25 = revoke cleanup binding (S1/S2 reproducer on the default sink and on the injectable sink, absent, 7 mismatched-file variants, 4 replaced-file shapes, path swapped after verification, expired-session cleanup, pure binding check) and the bounded verified write (partial writes completed, zero progress after a short write, no progress, error after partial, fsync failure, lying short write, corrupted read-back, 3 nonsensical counts, attempt cap, unconfirmed compensation, token only in the file); each failing case asserts the exact-session revoke, the audit rows, the emptied partial file and the refused ACK |
| `be-p10-native-session-cli.spec.ts` (new) | **23 passed**: issue and revoke dry-runs (zero pool / schema / compose / AuthService / Argon2 / write, read-only opens of the artifact only), 19 typed refusals each with zero such calls and the token file untouched, scope and usage errors, and a contrast case without `--dry-run` proving the spies are live. Against the previous CLI bytes **21 of the 23 fail** |
| Focused run `be-p10`, `elp210-core009`, `elp210-native`, `-manager`, `-commissioning`, `-current-human`, `-root-receipt`, `-lifecycle-authority`, `native-`, `elp209-realtime`, `elp209-native-frame`, `--maxWorkers=2`, Node host, no PG | **38 files passed, 6 skipped (PG-gated); 1098 tests passed, 410 skipped (PG-gated)**, exit 0 |
| `tsc -p tsconfig.build.json --noEmit` (control-api, at `32c0d6eb`) | **exit 0** |
| Scoped `tsc` over the two specs and `test/fixtures/*.ts` (temporary config, not committed) | no diagnostic in any file written here; six pre-existing `src/auth/cookies.ts` diagnostics (the Fastify cookie augmentation is not in that file set), the same family as the scoped-config note in section 5 |
| `cd apps/portal/frontend && npx vitest run src/execution/r2Ledger.test.ts` | **22 passed** |

### NOT_RUN

* **Real PostgreSQL**: `be-p10-manager-revoke-pg.spec.ts` and the other PG specs (needs a disposable `TEST_DATABASE_URL`); the four `a4-*`/`auth.spec.ts` files that need PG on 127.0.0.1:5432.
* **Normal R3 / ordinary hook** on the final bytes (the handoff's "actual disposable-PG / normal R3 gates on the final composition"), R2, full-project `tsc`, `contracts-test.sh` (no contract artifact changed).
* **Image build** from the corrected bytes (the installed `7b2c7f34` image predates all of BE-P10).
* Everything on a runtime: install, session issue, revoke, source window, STREAM reachability, connected READ/STREAM/revoke/recovery. A real root-owned filesystem (uid 0, real `fsync`, real short-write behavior) was not exercised; the sink is proven against a fake descriptor model only.

### Residual notes for the reviewer

* The cleanup guards the unlink by an inode re-check, but POSIX offers no atomic unlink-by-inode; a swap between that re-check and `unlink` is not closable in user space. The wipe never touches the swapped file (it goes through the verified descriptor) and the swap window is two syscalls under a root-owned non-writable directory.
* `RETAINED_NOT_BOUND_TO_SESSION` leaves a possibly stale token file for the operator to inspect; the runbook says to remove it by hand only after confirming whose it is.
* The pre-existing `ACCEPTANCE_TOKEN_FILE_REFUSED` code now also covers verification failures of the write (length/content), by design: one opaque typed code.
