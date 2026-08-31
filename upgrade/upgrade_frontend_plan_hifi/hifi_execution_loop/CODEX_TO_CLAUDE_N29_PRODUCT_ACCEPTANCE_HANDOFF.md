# Codex → Claude: N29 product acceptance handoff

Date: 2026-08-31  
Backend branch: `feat/execution-manager-campaign`  
Runtime effect: none

## Backend truth

N29 closes all known Portal-owned backend gaps in BR-EX-41…71. The canonical
screen catalogue now has 23 entries: 22 `AVAILABLE` backend contracts and one
typed N28 unavailable contract (`EXECUTION_ACCOUNT_BROKER_360_SCREEN`). The
nine Trading System owner gaps remain typed unavailable and do not authorize a
browser-to-Edge/source path.

Two newly completed routes are:

- `POST /api/v1/execution/governance/approvals` —
  `governance.approval-create-request.v1` → `governance.approval-create.v1`;
- `GET /api/v1/execution/governance/waivers` —
  `governance.conditions-register.v1` with exact counts, bounded bidirectional
  keyset cursors and server-computed `OPEN | WAIVED | EXPIRING | LAPSED`.

The POST is same-origin/session/CSRF/workspace guarded. It pins the artifact
digest and methodology claim from the server-owned run registry, records the
requester for SoD, replays a matching request key, rejects a changed key with
409 and rejects duplicate open alpha/run work with the existing approval ID.
It never sends a Trading System command. Conditional decisions append immutable
register rows; lapsed rows are blocking and enter Command Center `today` as
`CONDITION_EXPIRY`.

Canonical generated types:
`packages/contracts/generated/execution-governance.d.ts`.

## Required Claude consumer slice

The backend acceptance is complete, but Product GO remains fail-closed because
`ExecutionPreviewRoute.tsx` still creates `createFixtureApi()` and explicitly
has no HTTP/EventSource consumer. Do all of the following on the frontend lane:

1. add same-origin methods for the two routes above to the canonical HTTP API;
2. generate a stable request key per user submit intent and preserve it only
   for retry of that same payload;
3. send the existing CSRF header and workspace session; never accept an
   artifact digest from a form field;
4. bind New Approval submit/error/replay/duplicate states to the response;
5. bind Waivers filters, exact totals, cursors and the four server states;
6. render `LAPSED` as blocking and link Command Center condition items back to
   `/governance/waivers`;
7. remove `NEW_REQUEST` and `WAIVER_ROWS` smoke only after consumer tests and a
   browser smoke prove equivalent/stronger behavior;
8. do not call Rust Edge, Source Proxy, Manager relations or Trading System
   directly from the browser;
9. keep Account/Broker 360 honestly unavailable with reason
   `N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED`.

## Acceptance expected from Claude

- success, replay, typed 400/403/404/409/422 and offline/error states;
- double-click does not create two approvals;
- requester cannot approve their own row;
- keyset forward/back navigation and filtered exact count;
- OPEN/WAIVED/EXPIRING/LAPSED visual parity without recomputing state client-side;
- native EventSource terminal-close rules remain unchanged;
- full frontend gate and browser smoke over the same-origin BFF;
- clear the existing React test warnings for async `act(...)`, duplicate list
  keys and whitespace nodes inside `<tr>` before returning Product GO evidence.

Do not mark Product GO or request stable promotion. Return the consumer commit
and evidence to Codex so the N29 manifest can be reissued with the frontend
gate closed; protected-main image signing remains a separate release gate.
