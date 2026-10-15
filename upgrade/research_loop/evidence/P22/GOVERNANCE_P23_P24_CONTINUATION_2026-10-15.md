# Governance → P23/P24 preview continuation

2026-10-15 · Bobby approved all four backend slices · base `051eeb89`.
Status: **IN_PROGRESS**, not product/release acceptance.

## 1. Scope, authority and work ownership

Canonical index: Unified §13, final Governance continuation. Backend worktree
`/home/bobby/portal-research-be`, branch `codex/be-gaps`; coherent commits land
on `docs/research-loop-plan`. No push/dev/main/release/production/source change.
Claude owns accepted UI/design and follows the generated contract handoff.

| Gate / action | Portal authority | Execution authority |
| --- | --- | --- |
| R1 decision | Existing exact R1 read/decide capability, separation of duties, evidence/quorum/version checks | None; approval is not deployment |
| R2 decision | Inspect immutable R1 lineage, exact R2 grant/approver constraints; add its own named executor, never R1 alias | No risk-grant issuance, deployment or broker side effect |
| Paper Exit decision | Existing own command and complete same-read evidence manifest | No automatic promotion or runtime change |
| Live decision | Inspect existing LIVE_GATE policy/lineage and live read/decide capability; own named Portal command | No capital change, live activation or Trading System mutation |
| Downstream capture | Existing accepted source tuple/freshness/scope rules, not browser evidence assertions | Retained/offline/source-refused state remains blocked |

Policy gaps discovered during inspection are named explicitly; no invented
quorum, role, account permission, risk verdict or grant. Upstream executors
remain inactive even when a Portal-local decision is accepted.

## 2. Ordered delivery and tests

1. **GOV-C1** — inspect existing R1/Paper Exit contracts, fresh effective access
   and transactional plan/apply; repair demonstrated issues. Prove independent
   reviewer, manifest/checklist links, stale/mismatched evidence, workspace,
   revocation, retry/idempotency and audit cardinality on disposable PostgreSQL.
   Real API/browser receipts use ordinary APIs when actual source records exist;
   technical seeded records are labelled, never called product-source capture.
2. **GOV-C2** — inspect and preserve existing per-gate policy. Publish named
   R2/Live request/plan/apply/operation/context schemas and generated clients;
   enforce parent lineage and current authority again at apply/replay. Test
   R1-command mismatch, cross-gate/cross-actor tokens, quorum/expiry/CAS,
   source-unavailable positive refusal and no Execution relay/outbox command.
3. **GOV-C3** — build the explicit P23 origin receipt/dependency/config/image
   hash matrix. Unchanged evidence is REUSED_VERIFIED within its actual scope;
   changed auth/schema/decision paths get focused retakes. Accepted exactly
   three historical test-manifest exceptions remain strict83/86 and false
   full-store integrity. Do not forge fifteen same-image PASS envelopes.
4. **GOV-C4** — affected P24 journey T02/T14 and protected-data checks on one
   named preview candidate; map remaining Claude UI acceptance. Unsigned
   manifest is a review candidate only, max READY_FOR_BOBBY_REVIEW.

Focused tests first; group full mandatory hooks once per coherent delivery,
not per edit. Reuse unchanged numerical engine/load/restore evidence with
verified dependencies. Test account/session/grant expiry and bounded cell
teardown are required. No global prune or business/source-data deletion.

## 3. Read set

- Root AGENTS, Research A13.1–A13.4, Unified §13 rules/P22–P24/UDB closeout.
- Backend queue §56–§59 and both Governance cross-loop handoff/consumer records.
- EX-BE-05a / N09 existing Governance policy and immutable evidence contracts.
- Current TypeScript controllers/services/repositories/migrations and tests.
- P23 qualification closeout 2026-10-05; P24 acceptance/scenario addenda;
  UDB-04 closeout/debt dispositions, latest Claude S08 continuity receipt.

## 4. Implemented backend

- Transaction-local current identity/session-version, membership and exact
  capability locks at plan/apply/replay; Paper Exit rechecks its existing ADMIN
  rule. Source capture rechecks ADMIN plus its existing gate READ permissions
  in the same transaction, not on a second pool.
- Recompute actual child evidence manifest at apply; bind policy/version/quorum,
  R2 parent identity/version/manifest and actor intent. Separate R2 command,
  exact audit/outbox names; only Portal-local events, no Execution relay.
- R2 positive decisions preserve the existing ADMIN/independent-plan-author
  and approved R1 requirements. Paper Exit capture now requires approved R2,
  not PENDING. New accepted R2 captures have a nonblocking Portal-only note;
  old findings stay immutable. Upstream risk-grant capability remains off.
- Live reads its own `LIVE_GATE`, not an R2 row. The own named command is typed
  but blocked by `LIVE_PARENT_NOT_PUBLISHED`; no actual immutable Live parent
  policy exists, so no fake commissioning or upstream activation is claimed.
- Additive migration0133 preserves historical applied receipts and the original
  inbox view's column order. Historical pending plans with unrecorded policy
  pins must be replanned; old pins are not fabricated.
- Fixed conditional-quorum limitation ordinal collision: append after the last
  persisted ordinal under the approval lock, preserving every prior condition.
- Generated named per-gate plan/apply/operation contracts, exact authority
  requirements, distinct child/parent manifests, fixtures and strict tests.
- Added offline dependency-scoped reconciliation tooling; strict old
  `qualify.mjs` remains unchanged. [15-gate custody/disposition matrix](../P23/GOVERNANCE_DEPENDENCY_DISPOSITION_2026-10-15.md)
  hashes23 actual private raw files and separates unchanged numeric results
  from affected Governance semantics. Historical strict integrity stays83/86.

## 5. Test progression / honest evidence boundary

Initial isolated migration test caught PostgreSQL view column re-expansion:
the fix adds a separate decision-inbox view instead of replacing old column
positions. The next six-file PG run had99 PASS/one test-setup CHECK failure;
fixing the expiry fixture (created < SLA < expiry) gave15/15 focused PASS,
including dump/restore. Final added quorum/capture-authority regressions are
recorded below after their returned result; no skipped case is called PASS.

Final changed-file retake: `./scripts/control-api-test.sh
test/governance-continuation.spec.ts test/governance-product.spec.ts` — **27/27
PASS**, Control API TypeScript build PASS and PostgreSQL dump/restore PASS.
Includes17 continuation cases and10 product cases (four fresh capture
role/grant/session/workspace regressions). The unchanged four files retain
their prior79 PASS: Governance33, context22, Paper Exit13, Command Center11.
This is **106 unique targeted cases across scoped runs**, not a new all-repo
suite or a single same-image product qualification.

Contract run:343/344 passed initially; remaining test incorrectly embedded R2
as a Live backbone. Its canonical Live correction passed all134 fixture tests.
Together these cover344 unique contract checks, not477 distinct cases.
Reconciler tests14/14 PASS. Contract snapshot and N29/EDS12 static digest refresh
are mechanical with `runtime_effect: NONE`, not runtime/release acceptance.

Technical API tests use real PostgreSQL, authenticated HTTP, real transactions,
actual rollback/retry/quorum, but deliberately synthetic evidence fixtures.
They do not prove a positive source-backed capture on the shared retained
preview. Source activation/certificate/grant conditions remain unchanged.

## 6. Consumer and P24 handoff

[Exact Claude contract/story/acceptance handoff](./GOVERNANCE_PORTAL_DECISION_CLAUDE_HANDOFF_2026-10-15.md)
names five bounded consumer tasks. No frontend file is modified by Codex.
P24 may close only after the affected current-preview consumer/journey
receipts; it is not owner acceptance, signing or production readiness.
