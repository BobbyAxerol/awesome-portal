# P04 frontend handoff — Engine Atlas only

Codex has delivered a read-only, same-origin backend source for S12:

```text
GET /api/v1/research/quantbt/atlas
response: research-engine-atlas.v1
```

Use the generated OpenAPI/DTO rather than handwritten field-name maps.

## Render rules

- Show `current_release` as the only current release. Render
  `historical_releases` as retained history, never as a selectable second
  runtime.
- Render all 14 route cards. `axes` is four independent facts: a route with
  `ENGINE_SUPPORTED` and `INTEGRATION_GAP` must be disabled with its exact
  `reason`, not styled as an engine failure.
- Only `signal_notional` and `pct_equity` are `P04_BASELINE_ONLY`; that is
  **not** a browser authorization to submit a run. No run button, fake queue,
  local compute or auto-enable behaviour belongs in P04.
- Reactive is displayed as the `event_driven` strategy facade only; do not
  present an invented `reactive()` endpoint.
- Render valid schedules and the warning/never-claim text from the manifest;
  do not infer an approval R1/R2 state from native engine capability.
- `evidence_contract.writer_state=P05_OWNED_NOT_ACTIVE` means describe the
  future evidence shape only. It must not look like a persisted artifact or
  completed run.
- The endpoint intentionally excludes wheel/RECORD hashes, paths and callable
  handles. Do not add a browser escape hatch for them.

## Required frontend tests when Claude owns the UI slice

1. Current/historical release labels, including unknown-version safe state.
2. All four-axis combinations render without auto-enable.
3. Invalid mode/schedule and deferred route preserve rich approved HiFi layout
   with an in-panel reason, not a replacement empty screen.
4. Browser does not issue a mutation or direct engine/data request from Atlas.

No frontend code was changed in P04. P09 owns Atlas route composition and
visual/browser acceptance.
