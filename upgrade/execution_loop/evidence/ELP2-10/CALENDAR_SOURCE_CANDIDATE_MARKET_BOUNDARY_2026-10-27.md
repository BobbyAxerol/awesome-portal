# Calendar source candidate: market and authority boundary — 27 October 2026

## Source inspection; not a qualified provider

At PM source `feat/core-registered-relations-runtime-20261025@c8871acf3c5bcbd8c5ddad10eaa4a5294616a7a2`, the historical
`contracts/portal-execution-owner/ts-oc-08b/schemas/venues-calendar.schema.json`
(Git blob `948b005dde2d1ce2481d0229f3211faa854f80a9`, SHA256
`a9db401845abb521cfd00d87764ccf8db17f21f5ebca177976177f0e4127d5b3`)
describes sessions with `trading_day`, UTC open/close, timezone, session ID
and calendar revision, with keyset pagination. This is a proposed N11 schema,
not proof of an installed source. Its companion catalogue states
`published: false`, `portal_reachable: false`, `source_binding_status:
TYPED_UNAVAILABLE`, and `CALENDAR_PROJECTION_REQUIRED`. Its profile is
`PAPER_BINANCE_USDM`; its positive example is synthetic Binance, not VN.

The current Portal `apps/control-api/src/execution/venue-calendar.ts` is a
different `VN_EQUITY` Data Layer seam with local session windows and explicit
`is_open`/holidays; it does not disclose its source session date. The N11
candidate is therefore neither an actual VN source nor a drop-in replacement.
The source semantics registry at `contracts/schema/portal-execution-e2-semantics-registry.v1.json`
also records `market-session-calendar` as a source-owner gap and expressly
distinguishes settlement dates from session windows. Do not infer a session day
from `as_of`, claim empty days as holidays, or convert a Binance example to VN.

## Exact next actions through Edge

1. Edge/source owner: state whether a current, qualified VN Equity session
   producer exists, with endpoint, current schema/pin, date/range semantics,
   timezone, breaks/holidays and source authority. Separately disposition the
   N11 Binance draft above: superseded, future candidate or mounted, with
   real source and profile evidence. Do not treat the shared name as a join.
2. Core: once the actual VN wire semantics are returned, publish the effective
   session date/range with typed absence and implement the appropriate bounded
   source binding; preserve scope, pagination and revision fences. Do not
   use the Binance fixture as runtime config.
3. Claude: consume Core's published date/range and verify fixture and actual
   API/browser lanes separately. No UI change is requested until the selected
   source contract is known.

Read-only source inspection only; Edge, PM runtime, database, permissions,
credentials and UI unchanged. Calendar remains `SOURCE_DARK`; ELP2-10 and
connected/browser qualification remain open. SHA checks and catalogue fields
are source evidence, not a positive real-calendar receipt.
