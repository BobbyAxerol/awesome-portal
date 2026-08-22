# PRE-IAM-01 — SGP Phase 1–2 Backend Closeout

Date: 2026-08-22  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Scope: Approval Inbox and Gate R1 on the SGP Portal control plane only

## 1. Decision

The backend lanes of Execution product Phase 1 (Approval Inbox) and Phase 2
(Gate R1) are closed on SGP. The canonical session-protected public-gateway path
is qualified from login through immutable decision persistence without an AWS,
Rust edge, Trading System, broker or private Trading System database call.

This is not product activation. Registry revision 4 remains `fixture`; query,
projection-ingestion, SSE and every Paper/Sandbox/Live command flag remain
false. A Portal-owned R1 governance decision is not a Trading System Paper
command.

## 2. Delivered boundary

- TypeScript Control API and Portal PostgreSQL own Approval Inbox, R1 evidence,
  eligibility/SoD, decision plan, apply, operation poll, audit and outbox.
- Inbox supports canonical `R2` selection in addition to the existing views;
  this is a contract capability, not an activated screen.
- Operation polling returns both lifecycle `status` and
  `verification_result`; the current Portal-local transaction advances them
  together, while the contract leaves room for later external verification.
- Cursor and governance apply tokens use independent rotatable keyrings.
- Non-local Compose loads those keyrings from read-only files. Inline and file
  delivery for the same keyring is fail-closed as ambiguous.
- The provisioning helper creates independent 32-byte secrets atomically,
  keeps the directory at 0700 and files at 0600, and never prints values.

## 3. Qualification evidence

### 3.1 Fresh PostgreSQL gate

Command: `./scripts/control-api-test.sh`

- PostgreSQL 16 container created from an empty volume;
- migration and TypeScript production build pass;
- 13 test files and 117/117 tests pass;
- Governance repository/API: 18/18;
- governance token/keyring: 3/3;
- non-local file configuration/fail-closed cases: 3/3;
- 182,000-row Approval Inbox proves exact count, filters/sorts and bidirectional
  keysets against a real database.

### 3.2 Isolated public-gateway gate

Command: `sudo -n ./scripts/portal smoke`

The dedicated `portal-smoke` project on port 18080 proved:

1. migrations and bootstrap complete before API startup;
2. one-time activation requires password rotation before protected façade
   access, followed by a new authenticated session;
3. the smoke-only workspace is created explicitly rather than assumed;
4. Approval Inbox and immutable R1 detail are readable through nginx;
5. a mutation without `x-portal-csrf` returns 403;
6. canonical plan → apply → poll succeeds with Origin and double-submit CSRF;
7. terminal poll returns `status=SUCCEEDED` and
   `verification_result=SUCCEEDED`;
8. persisted decision, product audit and outbox cardinality is exactly 1:1:1;
9. the pre-existing authenticated Planning gateway smoke still passes;
10. all isolated containers, volumes and network are removed on exit.

The first qualification attempt exposed two test-harness assumptions—bootstrap
does not create a workspace, and an activated user remains password-change
restricted until rotation. The harness now models both production rules instead
of weakening them.

### 3.3 SGP research runtime gate

The development Compose project `portal` was rebuilt from this branch only.

- `/api/control/readyz`: ready, PostgreSQL ready;
- auth mode: `cloudflare_access_local_password`, not `dev`;
- runtime environment: `research`;
- service UID: non-root 1000;
- both keyring files are readable at their read-only container mount;
- both inline JSON keyring inputs are absent;
- the separate `portal-stable-v1-0-1` project was not rebuilt and all of its
  long-lived services remained healthy/running.

Runtime key files and `.env` references are ignored private state. No key value
or one-time credential is committed or recorded in this report.

## 4. Claude handoff before product activation

Claude can continue frontend work in parallel, but Phase 1/2 must remain
unavailable for real apply until all three items are resolved:

1. the common mutation transport reads `__Host-portal_csrf` and sends
   `x-portal-csrf` with same-origin credentials;
2. the adapter uses the canonical routes:
   - `POST /api/v1/execution/commands/plans`;
   - `POST /api/v1/execution/operations/{operation_id}/apply`;
   - `GET /api/v1/execution/operations/{operation_id}`;
3. a reviewed registry policy distinguishes Portal governance writes from
   `paper_commands_enabled`; no compatibility alias or policy conflation should
   be added.

The frontend may expose the operator view set `INBOX`, `ALL`, `R1`, `R2`,
`EXIT_REVIEWS`, `LIVE_GATES`, `OVERDUE`; the backend additionally keeps `PAPER`
and `SANDBOX` for API consumers.

## 5. Residual risk and next step

- AWS-HK D1, cross-cell source activation and Trading System reads remain dark
  and are unrelated to this closeout.
- Wider EX-BE-08 load/soak/restore/rollback work is still required before any
  production delivery profile can be activated.
- The next independent backend slice is `PRE-IAM-02`: deterministic Paper Exit
  Review repository/API with explicit missing/stale/partial evidence states and
  no execution command side effect.

