# P15 contract amendment — candidate-selection metric truth

**Status:** `CODEX_BACKEND_COMPLETE_PENDING_CLAUDE_CONSUMER`  
**Date:** 2026-09-23  
**Closes:** `CG-P15-01`  
**Contract:** `research-search.openapi.json` → generated
`research-search.d.ts`

## Decision

`requested_optimizer.candidate_selection_metric` is now a required,
discriminated fact on the named P15 BFF. It answers the requested-mode claim
without inferring an optimizer metric from a mode name or from mutable release
catalogue metadata.

For every current P04 request with
`requested_optimizer.state=DECLARED_NOT_EXECUTED`, the response is exactly:

```json
{
  "state": "NOT_PUBLISHED",
  "value": null,
  "provenance": "NONE",
  "reason_code": "P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC",
  "availability": {
    "state": "NOT_PUBLISHED",
    "reason_code": "P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC"
  }
}
```

The installed engine catalogue's current `robust_decay` default is **not**
emitted: it is current release metadata, not an immutable fact bound to this
historic P10 request. A mode name is likewise not evidence of a metric.

## Forward-compatible confirmed branch

A later source/producer may publish a metric only when it persisted the exact
run-bound engine default. It must use the other generated branch:

```json
{
  "state": "CONFIRMED",
  "value": "<published identifier>",
  "provenance": "RUN_BOUND_ENGINE_DEFAULT",
  "reason_code": null,
  "availability": { "state": "AVAILABLE", "reason_code": null }
}
```

That requires a new immutable producer/source fact. It must not be supplied by
a frontend lookup, current engine catalogue, mode/schedule string or a query
layer heuristic.

## Consumer rule

Regenerate `research-search.d.ts`. Render the current `NOT_PUBLISHED` state
and its reason in the existing rich claim/formula panel; do not show a metric
chip, formula value or `INFERRED` label. Keep the panel for a future
`CONFIRMED` branch, but do not add a local DTO or fallback inference.

This amendment adds no route, mutation, source read, worker, migration,
runtime flag or Execution/QuantBT access.

## Verification

The targeted P15/P16 amendment gate passed on 2026-09-23: Control API
contract/service/controller tests (16 tests), generated-contract tests (11
tests), Control API TypeScript build, generated-output verifier, snapshot
check and whitespace check. The service test proves the mutable
`robust_decay` catalogue value cannot enter a current P04 response.
