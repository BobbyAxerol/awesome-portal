# EX-BE-05a — Governance, Evidence, Approval Repository and API

Status: `OPERATIONAL_EVIDENCE_PENDING`  
Branch: `feat/execution_loop`  
Authority: TypeScript Control API + Portal PostgreSQL  
External dependency: none for Approval Inbox and Gate R1

## 1. Goal and boundary

EX-BE-05a replaces the Execution Loop's Phase 1/2 backend fixtures with a
Portal-owned governance read/decision path. It deliberately does not connect to
AWS HK, the Rust edge, the Trading System, broker state, or their databases.
Linked Research/Execution panels therefore return a complete envelope with
`panel_state=unavailable`; absence is explicit and is never converted into zero,
pass, or fresh.

This slice owns:

- approval request workflow state and SLA;
- immutable evidence metadata and evidence-set digest;
- immutable policy findings and reviewer decisions;
- reviewer eligibility and separation of duties;
- idempotent decision planning, apply authorization, optimistic concurrency,
  audit and outbox records;
- scalable Approval Inbox reads over the EX-BE-04a query primitive.

It does not own Research artifact truth, execution observations, broker facts,
promotion side effects, or creation of a browser-trusted evidence package. A
future trusted Research-to-Control-API intake/cutover must create R1 requests;
EX-BE-05a does not add an unsafe form endpoint that lets a browser assert its own
artifact hashes.

## 2. Durable model

Migration
[`1723680000002_execution-governance.sql`](../../apps/control-api/migrations/1723680000002_execution-governance.sql)
adds:

| Relation | Purpose | Invariant |
|---|---|---|
| `governance_approval_requests` | Portal workflow aggregate, SLA, quorum and optimistic version | workspace scoped; pending/terminal timestamps consistent |
| `governance_approval_inbox` | query projection with server-evaluated SLA state | no browser clock inference |
| `governance_approval_evidence` | artifact passport metadata | append-only trigger; hash/source/provenance retained |
| `governance_approval_findings` | policy/formula findings | append-only trigger; blocking is separate from watch |
| `governance_decision_plans` | short-lived idempotent command intent | unique actor/workspace/request key; payload and evidence bound |
| `governance_approval_decisions` | reviewer verdict ledger | append-only; one decision per actor/request |

Plans, decisions, approval version, audit and outbox rows use PostgreSQL
`SERIALIZABLE` transactions. Detail reads use one `REPEATABLE READ READ ONLY`
snapshot. A terminal verdict never updates the immutable evidence/finding rows.

## 3. HTTP contract

All routes require a valid Portal session and workspace membership. Mutation
routes additionally require exact allowed Origin, double-submit CSRF and an
`ADMIN` reviewer role.

| Method and route | Contract |
|---|---|
| `GET /api/v1/execution/governance/approvals` | exact total/filtered count, bidirectional HMAC keyset, allowlisted filters/sorts, whole-queue SLA counts |
| `GET /api/v1/execution/governance/approvals/{approval_id}/r1` | request, actor eligibility, immutable evidence manifest, findings, prior decisions and honest unavailable linked panels |
| `POST /api/v1/execution/commands/plans` | R1 approve/condition/deny plan, `request_key` replay, expected version, exact evidence hashes, all blockers/warnings |
| `POST /api/v1/execution/operations/{operation_id}/apply` | operation/payload/key-bound apply token; returns HTTP 202 with `status=PENDING` |
| `GET /api/v1/execution/operations/{operation_id}` | authoritative operation poll; only `SUCCEEDED` here is terminal success |

Supported Inbox views are `INBOX`, `ALL`, `R1`, `PAPER`, `SANDBOX`,
`LIVE_GATES`, `EXIT_REVIEWS` and `OVERDUE`. Direct filters cover status, gate,
environment, SLA state, requester, subject and evidence completeness. SQL
identifiers and values are never accepted directly from the client.

The response still echoes `delivery_profile=fixture`: registry revision 4 has
not activated a real screen delivery profile. `record_authority=PORTAL` states
who owns the workflow rows; it does not claim a connected external projection.

## 4. Decision safety

Planning computes a canonical payload digest and the current evidence-set
digest. Apply refuses:

- reused request keys with a different intent;
- expired or blocked plans;
- forged, cross-operation or cross-payload apply tokens;
- changed approval versions or evidence sets;
- self-approval, duplicate reviewers, incomplete evidence or blocking findings
  for positive decisions;
- decisions on an expired/closed request.

Self-denial is allowed so an author/requester can withdraw unsafe evidence;
self-approval is never allowed. `APPROVE_WITH_CONDITION` requires a persisted
condition. Multi-reviewer quorum advances one immutable decision/version at a
time. A concurrent stale reviewer gets `APPROVAL_VERSION_CONFLICT`, not a lost
update.

Cursor and governance apply tokens use independent, rotatable HMAC keyrings.
Outstanding plans retain their signing key ID so rotation does not invalidate a
still-live plan; old key material may be removed only after the maximum plan TTL.
Non-local startup fails closed if either keyring is absent, malformed, shorter
than 32 bytes, missing its active key, or shares a secret with the other ring.

## 5. Frontend mapping for Claude

Claude can implement a thin adapter without changing either screen component:

| Backend field | Frontend prop |
|---|---|
| `page.rows[].blocker_count` / `blocker_summary` | `blockerCount` / `blockerSummary` |
| `page.rows[].sla.age_minutes` / `budget_minutes` | `sla.ageMinutes` / `budgetMinutes` |
| `page.rows[].quorum_met` / `quorum_required` | `quorumMet` / `quorumRequired` |
| `page.rows[].inert` / `needs_you` | `inert` / `needsYou` |
| `data.approval.subject_label` / `release_candidate` | `alphaLabel` / `releaseCandidate` |
| `data.evidence_manifest.entries[]` | `passport[]` |
| `data.checklist[]` | `checklist[]` (`outcome` is already lowercase) |
| `data.eligibility.locks[]` | `locks[]` |
| last `data.decisions[]` item | decided record |

The adapter must obey `eligibility.can_approve`,
`can_approve_with_condition` and `can_deny` separately. In particular, the
current UI comment “Deny is never locked” is too broad: denial remains available
for self-authored evidence, but an expired or already-decided request is closed.
The HTTP 202 apply body is non-terminal even if the operation poll immediately
returns `SUCCEEDED`.

## 6. Verification evidence

Focused tests live in
[`governance.spec.ts`](../../apps/control-api/test/governance.spec.ts) and
[`governance-token.spec.ts`](../../apps/control-api/test/governance-token.spec.ts).
They cover:

- session, workspace isolation, RBAC, Origin and CSRF;
- a real 182,000-row PostgreSQL Inbox, exact counts and forward/backward keysets;
- evidence-manifest fail-closed behavior and append-only database triggers;
- request-key replay/payload conflict, evidence mismatch and forged apply token;
- self-approval refusal, self-denial, conditional approval and quorum;
- concurrent version conflict, plan expiry, apply replay, audit and outbox
  atomicity;
- independent keyrings and live-plan key rotation.

Current local evidence:

- TypeScript strict typecheck: pass;
- isolated keyring/token tests: 3/3 pass;
- authoritative fresh-PostgreSQL 16 run: 9 suites and 95/95 tests pass;
- governance coverage: 14/14 tests pass against the real 182,000-row corpus;
- liveness/readiness coverage: 2/2 tests pass, including fail-closed database
  readiness;
- isolated Compose lifecycle: migration and bootstrap jobs exit 0, the API
  becomes healthy, `/readyz` returns 200, and the service runs as `node` with a
  read-only root filesystem, all Linux capabilities dropped and
  `no-new-privileges` enabled.

Run the authoritative gate when Docker access is available:

```bash
./scripts/control-api-test.sh
```

The fresh-database implementation gate is green. Status remains
`OPERATIONAL_EVIDENCE_PENDING` only because the wider EX-BE-08 load, security,
soak, restore and rollback evidence has not been completed.

## 7. Deployment and rollback

Production configuration requires independent secrets:

- `CONTROL_API_QUERY_CURSOR_ACTIVE_KEY_ID` / `CONTROL_API_QUERY_CURSOR_KEYS_JSON`;
- `CONTROL_API_GOVERNANCE_APPLY_ACTIVE_KEY_ID` /
  `CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON`;
- `CONTROL_API_GOVERNANCE_PLAN_TTL_SECONDS` (default 300 seconds).

The migration is additive. Rollback disables screen query/command delivery in
registry policy first, then returns to the prior Control API image. Database
down migration is only for a proven empty/non-production slice; immutable
governance evidence must not be destroyed to make an application rollback easy.

Compose runs migration and bootstrap as separate one-shot services before the
long-lived API starts. The API container never mutates schema or creates users in
its process command, and readiness checks PostgreSQL rather than reporting a
false positive from process liveness alone.

## 8. Next backend slice

The next independent backend runway is `EX-BE-01`: Rust canonical contracts and
the read-only Trading System compatibility adapter. `EX-BE-05b` remains later,
after source command/auth capabilities are proven. Neither next slice authorizes
Portal code to modify the Trading System.
