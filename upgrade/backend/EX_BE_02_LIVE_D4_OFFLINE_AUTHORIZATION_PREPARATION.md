# EX-BE-02-LIVE D4 — Offline Paper Shadow Authorization Preparation

Date: 2026-08-23  
Status: `D4_OFFLINE_AUTHORIZATION_PREPARED / D3_PREDECESSOR_ACCEPTED / LIVE_D4_INPUTS_BLOCKED`

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
- Rust `paper-shadow-mapper`: typed exact-decimal normalization for the four
  business resources, cross-alpha rejection, stable event cursor/idempotency,
  partial-page semantics and a sealed synthetic corpus.
- Split Edge readiness: PostgreSQL health and mapper-ingestion health are
  independent, so an empty store can no longer report D4 ready.
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

Local validator evidence: 8/8 tests pass. D2 dark and D3 transport were accepted
on 2026-08-24; see
[`EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md`](./EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md).
Live D4 remains blocked by the dedicated Paper read identity and exact bounded
source contract, production pagination/resync ingestor and owner-aligned corpus
qualification, encrypted approved projection storage with backup/restore, and
a new owner-approved change window.

The production-independent mapper core and synthetic corpus are now complete;
the remaining mapper blocker is specifically the owner-published pagination/
watermark/resync orchestrator and its live runtime binding. Detail:
[`EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md`](./EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md).

The next executable action is the D4 input audit. It must prove these inputs
without modifying Trading System. Source read and `BUILDING` epoch creation may
start only after the validator's `readiness` mode accepts the private owner
input.
