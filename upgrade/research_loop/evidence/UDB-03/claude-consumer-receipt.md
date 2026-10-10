# UDB-03 · Claude consumer receipt (FE-UDB03-01/02/03)

2026-10-10 · lane `claude/fe-parity` on top of `18cbeeb9`. Read first: [handoff](./handoff.md) @18cbeeb9, [screen matrix](./screen-matrix.md) @18cbeeb9,
`packages/contracts/generated/execution-retained-review.d.ts` + `fixtures/execution-retained-review.valid.json` (the fixture is loaded by the test, not copied).

## What changed (frontend only)

| Item | Where | State |
|---|---|---|
| Strict reader of `GET /api/v1/execution/retained-review`; one read per page, shared store, `absent` on 404/401/malformed/network (page then behaves as before) | `execution/retainedReview.ts` | READ→MAPPED→CONSUMED→BROWSER_VERIFIED |
| Periodic re-read stops once the context says retained; advances once per explicit **Refresh**; Research job polling unaffected (`scope: "always"`) | `useRevision.ts`, `research/useFreeze.ts` | BROWSER_VERIFIED: 0 API requests in 36 s idle, 6 route×width cells |
| No realtime bootstrap / EventSource when retained; channel phase `retained` / `RETAINED_NO_STREAM`; a 204 from bootstrap maps to the same instead of `REALTIME_SNAPSHOT_INVALID`; the dot is amber with its own wording, not the red "closed" | `profileRealtime.ts`, `sourceTone.ts` | BROWSER_VERIFIED: 0 `realtime-snapshot`/`stream` requests |
| One-line banner (existing banner element, previously hidden by owner decision 2026-08-25, now shown **only** for retained): "RETAINED REVIEW · STALE · PARTIAL", Refresh, Details with per-profile source-as-of / observed / panels captured, access in this profile, resource-management typed gap | `RetainedBanner.tsx`, `ExecutionPreviewRoute.tsx`, `execution.css` | BROWSER_VERIFIED 1280/660 |
| Refresh remounts the screen subtree, so every reader (ticked or not) reads once | `ExecutionPreviewRoute.tsx` | BROWSER_VERIFIED: Alpha Fleet re-reads context + list + sparklines |
| RC → R1 deep link keeps its explicit Research `workspace_id` through navigation and reload; the API call carries it | no change needed | BROWSER_VERIFIED with a probe approval id (a real RC publication was not available in the inbox: it was empty) |
| Alpha360 Overview overflow (1411 px at 1280): a KPI cell with the unbroken code `N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED` | `execution.css` `.exec-alpha-kpi .exec-num { overflow-wrap: anywhere }` | 0 px at 1280 and 660 |
| Alpha360 Insight Charts overflow (113 px at 1280, 299 px at 660): tile-facts sentences in a nowrap `.exec-num` cell | `execution.css` `.exec-tile-facts` | 0 px; all ten tabs measured 0 |

## Gates

- `npx vitest run` (frontend): 4 reds found, all fixed — 3 were mine from earlier work (overlay test colour literals, a `disabled` without a reason entry, the new `stream_enabled` bit) and 1 was the persistence ledger missing four UDB tables (registered as `NEEDS_CODEX_REVIEW`, ingress UNCLASSIFIED; classifying them is Codex's). Final full frontend run after the last change: 382 files, 6443 passed, 1 skipped, 0 failed.
- 11 new tests in `retainedReview.test.tsx` (fixture-driven; a context that says stream/mutation/upstream enabled is refused; interval stops, Refresh advances once, Research polling untouched; no bootstrap/EventSource; falls back when 404).
- `tsc -b` clean; control-api untouched; N29/EDS-12 re-pinned (`runtime_effect: NONE`).
- Browser: `research-preview` web rebuilt from this lane (`preview.sh build/up portal-web`), real `claude-preview` session, Chromium 1280 and 660.

## Visual change to approve (Bobby)

The handoff asks to show retained context; the only way on a page whose banner was hidden is to show it. It is one 28 px line using the existing banner styling, only when the stack answers `retained_review_v1`. If you prefer it elsewhere (e.g. inside the masthead), say so — nothing else moved, no baseline re-recorded.

## Not claimed

Source-live, cross-stack ProductGO, UDB-04, and the 68-cell visual comparison against HiFi (not re-run). Visual baselines were not re-recorded; the two overflow fixes change layout only in the states that overflowed.
