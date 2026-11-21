# P14 ruling — Screen-05 UTC axis labels are presentation, not source facts

**Status:** `CODEX_BACKEND_DECISION_COMPLETE_PENDING_CLAUDE_CONSUMER`  
**Date:** 2026-09-23  
**Closes:** `CG-P14-01`  
**Applies to:** `researchSplitDetailGetV1` and Screen 05 only.

## Decision

The published `timeline` and each published window boundary remain the only
semantic time facts. A chart may choose UTC tick positions and format their
labels from those already-published timestamps as **presentation metadata**.
That is not a recomputation of a P14 range, a fold boundary, a holdout rule or
a source-authored calendar assertion.

No server tick-set is added. Publishing one would create a synthetic display
projection with a revision/lifecycle of its own and could misleadingly look
like a new source chronology fact. The existing immutable timeline is the
correct authority for the visual coordinate system.

## Non-negotiable consumer rules

| Allowed presentation | Prohibited semantic behavior |
|---|---|
| Select a bounded number of tick positions from `timeline.start_utc_ms…end_exclusive_utc_ms` for the current viewport. | Do not replace, snap, round, extend, shrink or infer any window boundary. |
| Format every label in UTC (for example `Intl.DateTimeFormat` with `timeZone: "UTC"`). | Do not use browser-local time, `Date.now()`, an exchange calendar, market-session heuristic or a future schedule. |
| Change tick density/format at narrow widths while keeping the same timestamp coordinate. | Do not serialize a tick into a hash, cursor, action, network request, export, cache key or retained research fact. |
| Retain the exact published endpoint and IS/OOS/holdout ranges for accessible text/tooltips. | Do not treat a tick as a fold, purge/embargo edge, source seal, strict-OOS result or holdout exposure. |

The screen's existing conversion of two **published** timestamps into a
display offset/width remains allowed. It must not calculate an alternate
interval or use calendar labels as input to a state transition.

## Required acceptance

Claude should add/update the Screen-05 receipt at 1280px and 660px to show
that tick density changes only display labels, while window geometry, UTC
endpoint text and every BFF request remain unchanged. Include a test that a
narrow viewport has no new request and no changed semantic timestamp/range.

This ruling does not alter P14 source state, OpenAPI, persistence, ETag,
runtime flags, holdout policy or any Execution boundary.
