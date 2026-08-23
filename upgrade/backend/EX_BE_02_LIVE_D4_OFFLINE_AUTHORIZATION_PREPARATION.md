# EX-BE-02-LIVE D4 — Offline Paper Shadow Authorization Preparation

Date: 2026-08-23  
Status: `D4_OFFLINE_AUTHORIZATION_PREPARED / LIVE_D4_PREDECESSOR_BLOCKED`

## Goal

Make the future first Paper source read explicit, bounded and reversible while
keeping all production activation off. This slice adds authorization and
evidence contracts only; it starts no service and reads no Trading System
business route.

## Architecture ruling preserved

The full Portal, TypeScript Control API and browser ingress stay on the SGP
research server. AWS-HK hosts only the minimal Source Proxy, Rust Execution Edge
and private projection boundary on the existing shared Trading System instance.
Portal has no authority to modify Trading System code, database, Redis, CLI,
risk, accounting, broker or execution behavior.

## Discovery findings converted into stop gates

The supplied Trading System contract pack shows:

- `X-API-Key` is optional on alpha-facing reads, so possession/knowledge of an
  alpha identifier can bypass the identity property Portal requires;
- orders/fills/positions expose limit-only reads without a stable deep cursor;
- events have a time cursor, but observed population/completeness is too sparse
  to prove it is the complete projection source; and
- no owner-published cross-resource resync contract closes those gaps.

Portal therefore does not invent a production mapper or call DB/Redis/CLI
directly. The Trading System owner must publish a dedicated read-only identity,
exact GET surface and cursor/completeness/resync semantics first.

## Delivered

- `deploy/execution-d4/owner-input.env.example`: credential-free owner/evidence
  schema.
- `scripts/execution-d4-authorization.py`: fail-closed `template`, `readiness`
  and `qualification` validation.
- `scripts/test_execution_d4_authorization.py`: positive and adversarial gate
  coverage.
- `deploy/runbooks/execution-d4-paper-shadow-and-rollback.md`: future BUILDING-
  epoch-only qualification and rollback sequence.
- Workspace verification now requires, tracks, compiles and tests the D4 assets.

## Invariants

Both readiness and qualification require exact D2/D3 accepted predecessors, one
commit, a <=2-hour owner window, hardened source identity, locked route/contract/
cursor digests and encrypted approved storage. D4 qualification always holds:

- `BUILDING_EPOCH_STATUS=BUILDING`;
- `REGISTRY_DELIVERY_PROFILE=fixture`;
- activation, Query, analytics, SSE, commands and Trading System changes false;
- no credentials or source payloads in Git/evidence; and
- no unreviewed reuse of the AWS-HK root volume for business projections.

## Evidence and remaining blockers

Local validator evidence: 8/8 tests pass. No runtime or network mutation was
performed. Live D4 remains blocked by accepted live D2 and D3, signed published
images, workload identities, dedicated Paper read contract, production mapper,
encrypted storage and an owner-approved change window.

The next executable infrastructure action is still D2 isolation after the exact
IAM policy is effective on `PrimusPortalExecutionD1Operator-v1`, followed by
reviewed promotion/publish, D2 dark deployment and D3 transport acceptance.
