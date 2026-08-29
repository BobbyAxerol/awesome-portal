# Codex → Claude: N17B exact current-set handoff

**Backend status:** `N17B_EXACT_CURRENT_SET_ACCEPTED`  
**UI runtime status:** `PAPER_PRIVATE_QUERY_QUALIFIED / PRODUCT_BFF_NOT_DEPLOYED / LIVE_COMMAND_INACTIVE`

## What Claude may consume now

- The Paper Overview backend slice has an accepted exact capability set:
  positions, execution quality and current sessions.
- The browser-facing route remains the same-origin Control API current-source
  BFF. Never call AWS-HK/Edge/Manager-v2 directly.
- A successful BFF envelope identifies:
  - `schema_version=portal.execution.current-source-bff.v2`;
  - `gateway.acceptance=N17B_EXACT_CURRENT_SET_ACCEPTED`;
  - `gateway.adapter=MANAGER_V2_CURRENT_AS_IS`;
  - exact capability/source-binding IDs and profile.
- Bounded pressure is explicit. Render typed degraded/unavailable state for
  `N17B_RATE_LIMIT_QUEUE_TIMEOUT`, `N17B_SOURCE_RATE_LIMITED` or
  `N17B_SOURCE_REJECTED`; do not implement a browser retry loop.

## Honest UI states

| Product slice | State to render |
| --- | --- |
| Paper exact Query | `BACKEND_ACCEPTED`, switch to real only after the dev runtime flag is actually enabled |
| Sandbox/Live reads | unavailable/not activated; do not reuse Paper rows |
| `live.emergency-close` | compatibility accepted, runtime inactive; no enabled action |
| other commands | retain N16B typed unavailable classifications |
| Event/Artifact | source does not currently exist; no fake stream/artifact |

Do not show image/commit hashes, private addresses, JWT/resource names, raw
relation names or infrastructure diagnostics in normal product UI. Put concise
operator-safe state in the existing details/diagnostics surface only.

## Frontend work that can run in parallel

1. Add the v2 envelope and typed N17B error union to the current-source client.
2. Keep the Paper screen's existing skeleton/empty/error layout; swap fixture
   data only when the runtime response says the exact Paper slice is active.
3. Add cancellation on unmount and one user-initiated retry; no timer-based or
   EventSource retry for this HTTP Query path.
4. Keep Sandbox, Live and all mutation controls non-actionable.
5. Add fixtures for accepted-but-not-deployed, real Paper success, paced
   degraded, source unavailable and auth-expired states.

The backend implementation report is
[`EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md`](../../backend/EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md).

