# P08 frontend handoff for Claude — typed Screen 02/05 preflight foundation

Status: `BACKEND_AND_TYPED_CONTRACT_READY`; Claude owns HIFI composition,
frontend unit/browser/dev receipt. Do not change Execution Loop shell or call
Portal API/HMD/QuantBT/PostgreSQL directly.

## Consume the generated contract; do not map server fields by hand

- Canonical OpenAPI: `packages/contracts/openapi/research-preflight.openapi.json`.
- Generated types: `packages/contracts/generated/research-preflight.d.ts`.
- Frontend alias: `@portal/contracts-research-preflight` (already added to
  `apps/portal/frontend/tsconfig.json`).
- Regenerate/check: `cd packages/contracts && npm run generate:research-preflight`
  and `./tooling/verify-generated.sh`.

Use generated `paths`, `operations` and `components` types. The contract has
concrete types for UTC ranges, warmup, quality, fold/topology, resource
estimate, dataset binding and effective spec. Do not re-create field names or
parse a generic metadata record.

## One prerequisite correction before the P08 consumer lane

The full frontend typecheck currently has exactly three P07 fixture errors in
`src/research/ResearchFixtures.tsx`: registry/registration fixture literals
omit the already-published required `may_activate: boolean`. Add truthful
fixture values for their caller context (do **not** make the server field
optional and do not replace production consumers with fixture fallbacks), then
record the clean frontend typecheck in the P07/P08 receipt. This is a
frontend-fixture follow-up from P07, not a reason to weaken P08's contract.

## Only two same-origin operations

| Product need | Method/path | Browser input | Server truth |
|---|---|---|---|
| Authoritative preflight | `POST /api/v1/research/preflights` | `requested_spec`, optional `workspace_id`, existing CSRF/session | actor-scoped opaque token plus effective spec, quality, snapshot boundary, exact topology and resource estimate |
| Reopen unchanged preview | `GET /api/v1/research/preflights/:preflight_token` | opaque token, optional workspace | exact current immutable metadata only |

Never send `requested_spec_digest`; Control API canonicalizes it. Never hold or
render an internal HMAC principal, source URL/path, reader input, raw candle,
Parquet file, holdout value, private snapshot query or worker reservation.

## Screen 02 New Run rules

1. Build HIFI form state from P02 `requested_spec`; submit it only to the POST
   operation. The returned `effective_spec` is authoritative: client-side fold
   estimates are visual hints only and must not override it.
2. Any material requested-spec edit clears the locally held token/result before
   another preflight. A successful response can be reopened by GET only while
   it has not expired; P10 will revalidate it server-side before a run exists.
3. Render UTC `[start,end)` labels from typed `snapshot.query`/`logical_range`,
   `CLOSED_BARS_ONLY`, warmup `requested_bars`, source timezone/calendar,
   quality counters and the bounded resource units. Do not forward-fill or
   hide gaps.
4. Render the exact `topology` union. `three_window_decay` has sealed metadata
   only; `advanced_walk_forward` is currently expanding only. If the server
   returns `RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED` for rolling, show the
   typed refusal — do not derive a train width in browser.
5. Keep trial wording exactly scoped by `resource_estimate.scope`; do not turn
   it into a product-wide trial/reservation claim.

## Screen 05 Split foundation

P08 supplies only typed topology and sealed-holdout integrity metadata. It does
not supply a chart, raw values, fit, result, unlock control or evaluation
state. Screen 05 may render the HIFI structural boundary/labels from this
contract; P14 owns completed split/evidence/holdout transparency.

## Required error and state behavior

- `INVALID`, `TOPOLOGY_INVALID`: preserve form edits; highlight typed invalid
  input.
- `DATA_UNAVAILABLE`, `REQUIRED_COLUMNS_UNAVAILABLE`, `FUNDING_UNAVAILABLE`,
  `WARMUP_UNAVAILABLE`, `ROUTE_NOT_ADMITTED`, `ROUTE_UNKNOWN`,
  `RELEASE_STALE`, `TOPOLOGY_UNSUPPORTED`, `RESOURCE_REFUSED`,
  `SNAPSHOT_TOO_LARGE`: show server reason faithfully; no fake empty preview
  and no browser fallback data read.
- `EXPIRED`/`STALE`: clear token and require a new preflight; do not retry the
  old token or submit a run.
- `UNAVAILABLE`/`REJECTED`: preserve unsaved requested form state, show a
  retryable typed condition, and never expose transport internals.

## Claude receipt required

- Unit tests: typed create/get, material-edit token clearing, every topology
  branch/refusal, no raw-HMD request and no manually defined P08 DTO.
- Browser/HIFI: Screen 02 desktop/mobile + keyboard/errors, Screen 05 metadata
  boundary, no console warning/error, no overflow and existing Research shell
  intact.
- Run only narrow frontend tests/build/browser lane needed for this composition;
  do not rebuild an image/deploy solely to consume P08. Return exact commands,
  counts and private screenshot/trace references to this evidence directory.
