# Codex → Claude: N15B current-capability gateway acceptance

Backend status: `QUERY_ACCEPTED_FOR_PAPER_OVERVIEW_ONLY / PRODUCT_RUNTIME_DARK`  
Command status: `DEFERRED_N16B`  
Event/Artifact status: `SOURCE_DOES_NOT_CURRENTLY_EXIST`

## What frontend may consume

- Canonical fixture:
  `packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json`.
- Query is accepted only for `paper / PAPER_BINANCE_USDM /
  PAPER_TRADING_SCREEN` and these three capabilities:
  `deployments.positions`, `deployments.execution-quality`,
  `sessions.current`.
- Unaccepted screens/profiles receive
  `N15B_QUERY_CAPABILITY_NOT_ACCEPTED` with
  `SUPPORTED_BUT_NOT_ACTIVATED / UNAVAILABLE` before any source call.
- The same-origin response can expose the sanitized `gateway` block for an
  audit/details disclosure. It is not primary screen content.

## Required UI truth

- Keep fixture/current-source switching behind the reviewed registry/profile
  gate; N15B did not activate product runtime.
- Do not show a global green gateway. Query, Command, Event and Artifact are
  independent.
- Do not expose hashes, profile IDs, request IDs or transport vocabulary in
  the masthead/KPI strip. Put them only in compact diagnostics when useful.
- Do not create dead Command, Event or Artifact controls. Command waits for
  N16B; Event and Artifact remain honestly unavailable.
- A future Portal projection delta must read `PORTAL_PROJECTION_DELTA`, never
  Trading System event/realtime.
- Continue the single Carbon Execution surface and proportional information
  density; this handoff changes data truth, not the approved visual system.

## Claude parallel work

Claude can finish the typed Paper Overview adapter and all eight honest
loading/empty/partial/stale/unavailable/error states against the accepted
three-capability shape. Sandbox/Canary/Live and other Paper screens stay on
their current fixture/unavailable contracts until separately accepted.

Backend proceeds to N16B. Frontend must not infer that N16B Command will share
the N15B read identity or become available automatically.

