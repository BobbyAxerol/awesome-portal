# P12 frontend handoff — Screen 01 Run Library

Backend and generated P12 contracts are ready. Work only in the Research Screen-01 composition, route, client and tests you own. Do not modify P12 Control API, OpenAPI, migrations, PostgreSQL role grants, worker/QuantBT adapter, deployment overlays or Execution code to make a screen render.

## Mandatory reading order — do not skip the chain

Before changing TSX/CSS/tests, record these as `READ` in the P12 receipt:

1. [`CLAUDE-FOR-thanhvuong.md` A10, A13.1–A13.4](../../CLAUDE-FOR-thanhvuong.md) — especially the full handoff-chain and browser/HiFi rules.
2. [P11 backend packet](../P11/README.md), [P11 frontend handoff](../P11/frontend-handoff-claude.md) and [P11 display-fact amendment](../P11/contract-amendment-display-facts.md).
3. [P12 backend packet](./README.md) and [P12 phase report](./phase-report.md).
4. Screen-01 [spec](../../release-v1.1/docs/screens/01_run_library.md) and paired `QuantBT 01 Run Library.dc.html` **in a browser**.
5. [`research-run-library.openapi.json`](../../../../packages/contracts/openapi/research-run-library.openapi.json) and regenerated [`research-run-library.d.ts`](../../../../packages/contracts/generated/research-run-library.d.ts).

Prior P11 facts remain binding: when a fold timeline is `NOT_PUBLISHED`, retain the whole-fold band; do not split it into Search/OOS/freeze. Render an A–D certificate chip only when the typed source fact is actually issued. A claim string, Atlas capability or a fixture is never an alternate authority.

## Use these two named operations only

Regenerate first:

```bash
npm --prefix packages/contracts run generate:research-run-library
```

| Generated operation | Product use |
|---|---|
| `researchRunLibraryListV1` | Initial/keyset Library page and one visibility-aware running-card poll. Emit generated `status`, `mode`, `alpha`, `cursor`, `before`, `limit` values; browser compatibility `[]` spellings are not needed. |
| `researchRunLibrarySparklineV1` | IntersectionObserver/lazy read for one visible card only. |

Never use legacy `/api/v1/alphas*`, a direct Portal/QuantBT database route, private `/internal/*`, artifact/Parquet path, worker event identity, source cursor/lease, fixture timer or handwritten duplicate DTO. The browser must not decode opaque cursors or calculate a comparison key.

## Exact behavioural contract

- List order is `CREATED_AT_DESC_RUN_ID_DESC`, max 50. Preserve rows' current visual positions on `ids` polling; patch only returned visible cards. Do not re-sort, replace selected IDs or scroll the user because a status changed.
- `ids` supports at most 50 IDs and is mutually exclusive with cursors and all filters. Use **one** 10-second interval only while the route is visible and only for visible `RUNNING` IDs. Stop it on unmount/hidden/no running cards; no interval per card and no retry loop after terminal auth/refusal.
- Filters are URL state as Screen 01 requires. `status`, `mode`, `alpha` are OR within each group and AND across groups. `sel` is max two FIFO IDs and is navigation state; do not promote/rewrite it during refresh.
- The server owns `comparison.key`. Enable compare only when two non-null keys are exactly identical; otherwise preserve the HiFi refusal copy. Do not compare labels, alpha names or client hashes.
- `created_at_utc_ms`, `source_updated_at_utc_ms`, `as_of_utc_ms` are UTC milliseconds. Values are server strings/exact decimals; do not coerce or reformat null into zero.
- P12 has no clone/reproduce mutation. Reuse only the exact existing P10 producer intent navigation after its contract permits the required IDs; do not fabricate an endpoint or a browser-side `may_*` authority.

## Required truthful presentation

Keep the full HiFi Screen-01 composition in all states; replace contents inside cards/panels rather than replacing the route with a generic envelope.

| Contract state | Required Screen-01 treatment |
|---|---|
| `source_kind=LEGACY_1_0_8_METADATA` | Keep the card/layout; display its precise unavailable reason. Never call it current engine evidence. |
| `NOT_PUBLISHED` for metrics/sparkline/claim/certificate | Keep exact placeholder/panel but show reason; no `0`, `best`, completed metric, faux line or cert chip. |
| `PENDING_SOURCE_CALLBACK` | Render a pending source state, not stale success. |
| `rc: null` | Do not render/reserve a fake RC chip. |
| `sparkline.values=[]` | Keep the lazy placeholder and availability title; no artifact/Parquet fetch. |
| `DRAFT`, `QUEUED`, `CANCELLED`, `RECOVERY_REQUIRED` | Do not label an absent series as OOS equity. Preserve typed lifecycle and missing metric reason. |
| `400/401/403/404/503` | Preserve filter bar/route context and render typed refusal/retry according to the existing product error grammar; do not expose raw server text or relation names. |

Stage tooltip provenance is explicit. `SOURCE_VERBATIM` may be shown verbatim; `DERIVED_FROM_PERSISTED_STATE` is not a source methodology narrative; `NOT_PUBLISHED` means no invented stage narrative.

## Browser and acceptance work

Implement the complete Screen-01 spec/HiFi mapping: header/new-run link, filter bar, claims strip, group headers, rich cards, compare bar, typed empty/error states, lazy sparkline placeholder and rules footer. For every element/action record:

`HiFi element/copy → component → generated field/operation → typed state → browser assertion`.

Run the actual browser comparison against the HiFi at 1280px and 660px before claiming screen completion. Required P12 frontend proof includes S01 tests, URL/back/refresh restoration, two-card comparison/refusal, visibility-aware poll cleanup, lazy sparkline cancellation, no warning/error/overflow and keyboard/accessibility checks. Label fixture, product-route and real-API lanes separately. Do not re-record visual baselines broadly to hide a regression.

## Return packet to Codex

Send a Markdown receipt with: files/line count, generated contract revision, all prior handoffs/addenda read, mapping matrix, exact browser command/build SHA/route/viewports, console/network result, test counts, typed states tested, known source gaps and no-debt conclusion. If the UI needs a field/action absent from the generated contract, send one focused `CG-P12-*` request with source locator, expected/actual and a minimal proposed server field; do not map it by hand or alter P12 backend directly.
