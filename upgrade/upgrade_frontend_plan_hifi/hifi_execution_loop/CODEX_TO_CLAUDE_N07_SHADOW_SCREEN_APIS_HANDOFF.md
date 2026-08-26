# Codex → Claude: N07 Paper Workbench shadow-screen handoff

Status: `CONTRACT_READY / ADAPTER_AND_PARITY_LANE_OPEN /
REGISTRY_AND_REAL_SOURCE_STILL_OFF`

Date: 2026-08-26

## What is available

N07 adds one same-origin read route:

```text
GET /api/v1/execution/deployments/paper/{deploymentId}/projection/{panel}
panel = orders | positions
```

Canonical sources:

- OpenAPI: `packages/contracts/openapi/execution-analytics.openapi.json`;
- generated TS: `packages/contracts/generated/execution-analytics.d.ts`;
- fixture: `packages/contracts/fixtures/execution-paper-workbench.orders-shadow.valid.json`;
- backend detail: `upgrade/backend/EX_BE_03_N07_PROJECTION_QUERY_ANALYTICS_SHADOW.md`.

## Claude should do now

1. Add an adapter for only the two commissioned panels, using generated types.
2. Keep every decimal as a string; formatting is display-only and must never be
   fed back into counts, totals or commands.
3. Render `ProfileBadge`, panel authority, freshness, completeness and warnings
   from the envelope—not from browser inference.
4. Map `empty`, `partial`, `stale`, 403/404, projection unavailable and
   `N07_CURSOR_RESNAPSHOT_REQUIRED` into existing honest-state components.
5. On 409 resnapshot, discard both cursors and fetch page one. Never retry an
   invalid/expired cursor in a loop.
6. Run fixture-vs-adapter parity and visual checks at Paper Workbench sizes.
7. Keep the screen-level registry profile `fixture`; any local shadow preview
   must be explicitly labelled and cannot be committed as product activation.

## Do not infer or widen

- This response does **not** deliver stage equity, accounting, envelope
  consumption, execution quality, contribution, Alpha Fleet or Trade Replay.
- BR-EX-41/49/50 stay mapped to N08/N09/N10/N11 as recorded in the unified plan.
- Do not query AWS-HK, Trading System, PostgreSQL or Edge directly from the
  browser; only use the same-origin Control API.
- Do not expose activation/image/schema hashes in primary UI. If later needed,
  keep evidence identity in a secondary evidence drawer/copy affordance.
- Do not enable EventSource, per-panel polling, registry promotion or commands.

## Error behavior

Expected typed codes include:

```text
N07_QUERY_INVALID
N07_CURSOR_RESNAPSHOT_REQUIRED
N07_SHADOW_EPOCH_UNAVAILABLE
N07_ACTIVATION_EVIDENCE_INVALID
N07_QUERY_UNAVAILABLE
N07_SHADOW_SCREEN_DISABLED
```

Treat 401/session failure as terminal at the shared session layer. Treat 409 as
one explicit resnapshot. Treat unavailable/disabled as an honest state, not an
empty business dataset.

## Exit evidence to return

- adapter/unit tests for both panels;
- fixture parity output;
- 409 resnapshot test with no retry loop;
- empty/partial/stale/unavailable screenshots or visual baselines;
- confirmation that registry stayed `fixture` and no direct source call exists.

The real shadow switch waits for accepted N06 evidence, Bobby's N07 owner
approval and backend activation evidence. Frontend completion does not grant
that authority.
