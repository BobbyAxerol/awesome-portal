# Calendar session date disclosure gap — 27 October 2026

## Finding and scope

The retained Edge maximum-data catalogue at Edge source
`9ae6f128144e8a17919d21ce7b12654c42d9ded4` still classifies
`venue_calendar` as `SOURCE_OWNER_GAP`: settlement dates are not a session
calendar. There is no qualified runtime provider or connected proof here.

An independent Core/consumer design gap exists even after that provider is
available. The private source example in
`apps/control-api/test/fixtures/paper-venue-calendar.synthetic.json` carries a
`payload.date`. `venueCalendarFromSource` in
`apps/control-api/src/execution/venue-calendar.ts` maps its timezone, session
times, breaks, holidays and `is_open`, but does not project the session date.
The existing `VenueCalendar` public contract in
`packages/contracts/openapi/execution-paper-read.openapi.json` and the accepted
`VenueCalendarPanel` in
`apps/portal/frontend/src/execution/v2/screens/workbench/Calendar.tsx` likewise
do not disclose that date. Thus a time-only session can be displayed without
telling the user which date it applies to. `source_as_of` is an observation
clock, not proof that the session date equals that clock's local date.

This is a source/contract/consumer finding, not a runtime failure receipt. It
does not change the current `SOURCE_DARK` result, alter the component, invent
an exchange calendar, or decide whether a future source serves one date or a
range.

## Action and ownership

1. **Edge → market/source owner:** identify the authoritative session-date or
   effective-range field, venue timezone, revision, and how it binds to each
   session/open-state observation. Return the exact contract and real source
   locator through Edge; settlement-only data is insufficient.
2. **Core:** after that source semantic is known, publish a typed effective date
   or range, preserving explicit absence and separate `source_as_of`. Check
   source revision, workspace, principal, stale/expiry, local midnight, closed
   days and mismatched or missing dates. Regenerate the affected contract and
   fixture, and test the real provider separately from synthetic tests.
3. **Claude:** after Core publishes the contract, consume and display the
   source's date/range beside the time-only windows without changing the
   approved visual language. Keep source absence visible; no client-derived date
   or inference of open state from window arithmetic. Record fixture and real
   browser receipts separately.

Until the source contract is known, an arbitrary day inferred from Portal's
clock or `source_as_of` would be a new semantic, not a safe repair. Other
independent work is not blocked by this finding.

Verification: source and existing consumer/contract inspection only, no code,
test, source, runtime or UI change. This Markdown-only receipt and Unified link
use R0 after exact path/`git diff --cached --check`, linked-file inspection and
`scripts/execution-tracking-test.sh`; no source qualification is implied.
