# Codex → Claude — N20 Canonical Screen BFF Handoff

**Backend status:** `N20_COMPLETE / SOURCE_DARK / N21_NOT_STARTED`  
**Consumer branch:** continue on Claude's approved UI branch; do not merge or
deploy from this handoff.

## What Claude can consume now

Use the generated contract through:

```ts
import type { components } from "@portal/contracts-screen-bff";
```

The strict compatibility reader is:

```text
apps/portal/frontend/src/execution/screenBff.ts
```

Discovery endpoints:

```text
GET /api/v1/execution/screen-contracts?workspace_id=...
GET /api/v1/execution/screen-contracts/{screen_id}?workspace_id=...&resource_id=...
```

The catalogue has 23 screen surfaces and covers BR-EX-41…71. A USER receives
22 because the Admin Action Drawer contract is ADMIN-only.

## Required frontend behavior

1. Treat `TYPED_UNAVAILABLE` as terminal for that screen data API. Do not call
   it, retry it or replace it with fixture data presented as real.
2. `AVAILABLE` means the named narrow API contract already exists. It does not
   mean the N20 detail response contains screen payload data; `payload` is
   intentionally null because this API is contract discovery.
3. Render only the canonical state set: `ready`, `empty`, `stale`, `partial`,
   `denied`, `unavailable`, `error`. Client-side `loading` remains a transport
   lifecycle state, not a server fact.
4. Preserve `workspace_id` and the declared resource binding. Never infer a
   resource from a fixture, route label or previous screen.
5. Do not join Manager/source data, calculate verdicts/counts/SLA or infer
   permissions in React. All seven composition decisions are `SERVER_ONLY`.
6. Keep smoke data visibly marked until the matching narrow data API reaches
   real parity in N22–N27. N20 alone is not permission to delete it.
7. Never call the retired `/api/v1/execution/current-source/.../screens/...`
   routes. They now fail with HTTP 410 by design.

## Cross-screen requests

- BR-EX-55 / `portal.entity-names` appears on every screen contract.
- BR-EX-58 / `portal.blocker-catalog` appears only on stage workbenches.
- BR-EX-61 is bound to Sandbox Certification alongside BR-EX-60.
- BR-EX-68 is visible only to ADMIN.
- BR-EX-69–71 have explicit screen contracts and typed future delivery states.

## Claude's safe parallel lane

Claude may wire contract discovery, strict seven-state rendering, workspace /
resource propagation and typed-unavailable presentation. Do not enable new
source data or action buttons. N21 remains backend-owned and starts only after
Bobby explicitly names it.
