# RS-01 frontend handoff — generated contract amendment only

**Owner:** Claude for consumer/UI work.  
**Backend state:** `BACKEND_REMEDIATED · FEATURE_DARK`; this is not an activation
request and does not authorize changes to a worker, runtime, database, source
adapter or Execution surface.

## Read first

1. [RS-01 report](./phase-report.md)
2. [Unified RS-01 board row](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-rs-01)
3. Existing P11/P13/P14/P15/P16/P17 handoffs and the actual source HiFi/spec in
   a browser at 1280px and 660px.

Regenerate only the published declarations before consuming them:

```bash
npm --prefix packages/contracts run generate:research-progress
npm --prefix packages/contracts run generate:research-evidence
npm --prefix packages/contracts run generate:research-replay
```

Never hand-write a DTO/error parser, decode an opaque cursor, calculate a
financial value, or replace the rich screen shell with a whole-route failure
envelope.

## Consumer changes required

| Screen / generated fact | Required UI behaviour |
|---|---|
| S03 Progress `current.terminal_materialization` | `PENDING` stays visually **FINISHING / finalizing durable evidence** inside the existing rich console/readiness shell. Do not show `COMPLETED`, an ETA, or a certificate until `READY`. |
| S04 Evidence R2 `metric_registry_version`, metric scope, series metadata | Render server-provided labels/scope/decimal strings and retention/sampling/omission disclosure. Do not reuse R1 wording as a claim about R2 or calculate rolling/monthly/histogram values in TSX. |
| S05 Split | Preserve exact typed range/refusal states. A transform mismatch or chronology refusal remains a panel-local typed state; do not draw alternate boundaries. |
| S06/S07 derived readers | Their source remains the same immutable P14/P13 material. Preserve rich layouts and typed absent panels; no new UI fact/action is published by RS-01. |
| S08 Replay | Send one generated `at_ordinal` only for an explicit deep-link/recovery choice. On `409 RESEARCH_REPLAY_CURSOR_EXPIRED`, discard the opaque token and offer/refetch safely; do not retry an expired token in a loop. Treat replay responses as no-store. Never expect or condition a UI on `304`. |

## Mandatory focused browser checks

- Preserve each screen's HiFi shell at 1280px and 660px; no generic blank or
  unavailable page substitution.
- Assert a terminal `PENDING` state cannot look complete.
- Assert R2 monthly/rolling/histogram labels come only from the generated DTO.
- Assert expiry gives one bounded recovery/refetch path and no retry loop.
- Confirm deep-link/back/refresh does not expose a cursor or raw backend prose.
- Keep fixture, product-route and real API receipts separately labelled.

Return a normal phase receipt with source HTML/spec mapping, generated revision,
browser command/viewports, console/network result and any exact missing backend
fact as one `CG-Pxx-*` request. Do not change the RS-01 backend files.

