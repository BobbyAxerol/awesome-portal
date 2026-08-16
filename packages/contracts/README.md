# Portal Contracts — canonical schema authority (U09 / BAR-06)

`packages/contracts/` is the source-controlled canonical contract workspace:
IDs, timestamps, decimals, RFC 7807 problem documents, command envelopes
(idempotency + optimistic concurrency) and event envelopes (§6.7 of the v0.4
guide). Schemas live in `schemas/`, canonical fixtures in `fixtures/`, and the
committed TypeScript types generated from the Portal OpenAPI in `generated/`.

Rules:

- JSON Schema Draft 2020-12 with `additionalProperties: false`; unknown fields
  are breaking.
- IDs are opaque: clients never parse them. New durable aggregates use the
  prefixed ULID shape; the control-api's prefixed UUID-hex shape remains
  valid during the compatibility window (ADR-002).
- Timestamps are timezone-aware UTC ISO 8601 with explicit precision.
- Decimals cross service boundaries as strings (decimal.v1), never floats.
- Errors are RFC 7807 documents with a stable machine `code`, safe `detail`
  and `request_id`; no stack, secret, host path or raw upstream assertion.
- Commands carry `request_id`, `actor_id`, `workspace_id`, `idempotency_key`,
  `expected_aggregate_version` and `payload_schema_version`; events carry the
  canonical §6.7 envelope with `traceparent` and producer provenance.
- Fixtures contain no business fakes: every fixture validates against its
  schema in both Python (jsonschema) and TypeScript (ajv) — cross-language
  fixture compilation is the acceptance gate.
- Breaking changes: a drift in any digest in `contracts-snapshot.json`, in
  the committed generated types or in the frozen OpenAPI snapshots fails CI
  before application tests.

Layout:

```text
packages/contracts/
  README.md
  schemas/
    common.v1.schema.json
    problem.v1.schema.json
    command-envelope.v1.schema.json
    event-envelope.v1.schema.json
  fixtures/
    problem.valid.json
    command.valid.json
    event.valid.json
  generated/
    portal-api.d.ts
  contracts-snapshot.json
  package.json
  tsconfig.json
  vitest.config.ts
  test/fixtures.spec.ts
```
