# BAR-06 — Shared Contract Authority

> **Version:** 0.1<br>
> **Status:** BAR-06 complete (ADRs proposed for owner confirmation)<br>
> **Updated:** 2026-08-15<br>
> **Unified phase:** U09 Contract Foundation & Monorepo Platform Tooling<br>
> **Guide authority:** v0.4 §6.1–6.7, §29.3 M1

## 1. Goal and scope

BAR-06 establishes `packages/contracts/` as the source-controlled canonical
contract authority before the Control API gains business authority (U10):

- Canonical schemas for opaque IDs, UTC timestamps, decimals, RFC 7807
  problem documents, command envelopes (idempotency + optimistic
  concurrency) and the §6.7 event envelope.
- Committed generated TypeScript types from the FastAPI compatibility
  OpenAPI, plus cross-language fixture compilation (Python jsonschema vs
  TypeScript ajv).
- A breaking-change gate: digest snapshot + generated-type sync fail CI
  before application tests.
- ADR-001 (pnpm workspace/lock authority), ADR-002 (opaque ID format),
  ADR-005 (event schema encoding/registry) written as owner-confirmable
  proposals.

Non-goals: `packages/ui` extraction, visual harness, pnpm cutover execution
(follow-up slices), NATS/Protobuf runtime.

## 2. Locked decisions

1. **Canonical patterns** live once in `common.v1.schema.json` and are
   consumed by the Python `portal_api.domain.canonical` models and the TS
   fixtures; no service reinvents them.
2. **IDs are opaque.** New durable aggregates use `{kind}_<ULID-26>`; the
   control-api `{kind}_<32hex>` shape remains valid during the compatibility
   window (ADR-002). Both validate against `opaqueId`.
3. **Commands carry concurrency context by contract:** `idempotency_key`,
   `expected_aggregate_version`, `payload_schema_version` are required fields.
4. **Events are facts:** the §6.7 envelope is frozen with `additionalProperties:
   false`; producers register `event_type.v{n}` schemas before publishing
   (ADR-005).
5. **Breaking change = CI failure:** digest drift in
   `contracts-snapshot.json`, a stale `generated/portal-api.d.ts`, or a
   snapshot drift in the frozen OpenAPI all fail before application tests.

## 3. Workspace layout

```text
packages/contracts/
  README.md
  schemas/{common,problem,command-envelope,event-envelope}.v1.schema.json
  fixtures/{problem,command,event}.valid.json
  generated/portal-api.d.ts
  contracts-snapshot.json
  tooling/snapshot.py
  package.json / vitest.config.ts / test/fixtures.spec.ts
```

Python side: `portal_api/domain/canonical.py` (ProblemDocument,
CommandEnvelope, EventEnvelope) + `tests/test_canonical_contracts.py`.
Gates: `scripts/contracts-test.sh` (ajv + vitest + generated-type sync).

## 4. Implementation evidence

- [x] Canonical Draft 2020-12 schemas with strict unknown-field rejection:
  `common.v1` (ULID/UUID-hex opaque IDs, UTC timestamps, decimals,
  schema versions, traceparent), `problem.v1` (RFC 7807 + `code` +
  `request_id` + `traceparent`), `command-envelope.v1` (§6.2 fields),
  `event-envelope.v1` (§6.7 fields).
- [x] Three canonical fixtures (problem/command/event) validated in Python
  (jsonschema) and TypeScript (ajv 2020) — cross-language fixture
  compilation.
- [x] Python runtime models with strict validators (opaque ID shapes,
  timezone-aware timestamps, version/idempotency patterns); invalid/unknown
  fields and malformed envelopes rejected; dumps carry no secret markers.
- [x] `generated/portal-api.d.ts` committed from the frozen Portal OpenAPI;
  the contracts gate regenerates and diffs it — an OpenAPI/type drift fails
  CI.
- [x] `contracts-snapshot.json` digests all schemas/fixtures/generated
  types/README; a Python test verifies every digest.
- [x] ADR-001/002/005 written (Proposed for owner confirmation).
- [x] Contracts workspace suite passes `6` tests plus the generated-type
  sync; canonical Python suite passes `7` tests; full Portal backend
  regression passes `308 passed, 1 skipped`; full Planning backend passes
  `18 passed`; workspace verification passes including the protected
  strategy hash.

Technical debt and rollback:

- pnpm workspace cutover executes in follow-up slices per ADR-001; npm
  remains the temporary per-member authority.
- Rollback: revert the BAR-06 commits; the contracts workspace is additive
  and no runtime consumes the canonical models yet. No change was pushed or
  deployed.
