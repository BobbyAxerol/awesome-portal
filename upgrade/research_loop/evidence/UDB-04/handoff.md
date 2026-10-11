# UDB-04 — Claude consumer / browser handoff

[Unified](../../../UNIFIED_IMPLEMENTATION_PLAN.md#udb-04), [report](./phase-report.md),
[gaps](./debt-register.json). Same Research branch; the initial checkpoint
changed no FE file. The later [approved cache amendment](./cache-limit-amendment.md)
changes only the strict validator literal and its tests. Preserve approved rich components/layout/theme; no blanket baseline
re-record, fixture as real proof, zero from null or repeated engine build.

## Contract delivered, no new composition needed

`research-release-candidate-publication.d.ts` `ApprovalMirror.href` and
conflict`approval_href` retain authorized`workspace_id` on the R1 link.
Keep consuming server href. Actual existing RC→R1 click+reload PASS;
legacy href remains valid, extra query/fragment/external URL rejects.
Do not infer a source workspace or downstream approval from that link.

401expired/disabled,403missing capability,404hidden scope/object remain
distinct from503`PORTAL_AUTHORITY_UNAVAILABLE`/`PORTAL_READ_STORE_UNAVAILABLE`.
503`EXECUTION_LOCAL_READ_BUSY` is bounded **local** admission, not Edge/source
failure. These failures must not enable stream/poll/source fallback.

## FE-UDB04-01 — Retained CC still bootstraps

Actual `/execution` at1280/660 makes one
`GET /api/v1/execution/command-center/realtime-snapshot` with valid retained
context, source/SSE off. Exact-web smoke repeats it without HTTP failure:
not solely caused by the Portfolio context503. A bootstrap GET is **not**
proof an EventSource/upstream connection opened.

Inspect `screens/profileContainers.tsx` `fetchCommandCenterResume`,
CommandCenterLive wiring and its hook, not just `profileRealtime.ts`.
Exit:0bootstrap/stream/idle API in retained CC; Refresh reads once; context
503/malformed/auth/revoke stays closed; explicit non-retained compatibility
separate. Rich panels remain static/visible with original source timestamps.

## FE-UDB04-02 — Six failing accessibility cells

Measured WCAG2A/AA+2.1AA at both1280/660:

| Surface | Failure / locator |
|---|---|
| CC/Fleet retained banner | `color-contrast`: `.exec-preview-details > summary`, `.exec-preview-inspector > summary`,4.44:1 vs4.5:1; `execution.css`. Scoped palette approval, not change a global token across the app. |
| Fleet | `nested-interactive`:50`.exec-af-row[role=button]` contain focusable controls; `screens/AlphaFleet.tsx` row role/click/keyboard branches. Preserve expand/navigation/inner controls; valid semantics, not removal to silence Axe. |
| CC table | `scrollable-region-focusable`: `.exec-deriv-body > .exec-scroll-x`, `components/DerivationTile.tsx`; actual region needs keyboard focus/context, not a visual redesign. |
| Real R1 typed-unavailable title | `color-contrast`4.11:1 vs4.5:1; `components/states.tsx` +state/governance CSS. Keep typed absence/content, not hide the panel. |

Exit: only affected6Axe+keyboard cells retaken1280/660,0serious/critical,
row/link/inner-control navigation preserved, overflow0; screenshots/token
differences recorded for Bobby, baseline update only via existing approval.
Two RC Axe cells already pass and remain unchanged.

## Backend-owned, do not conceal

`UDB04-BE-01`:latest4summary SLOs (Library679/Progress631/Evidence744/CC626ms
vs500; Report441ms passes). `UDB04-BE-02`: Portfolio/context503 during
full matrix; smaller probes pass but do not close burst. Codex profiles/fixes
query/admission; FE must not swallow assertions, fabricate an empty list,
increase poll/retry cadence or relabel smoke as mixed-load acceptance.

68cells have0overflow/pageerror/businesswrite and real RC scope PASS, but
overall browser FAIL. No owner visual acceptance, source/SSE/commands or
production/signed release is authorized by this handoff.

## Later backend checkpoint / compatibility

Core DNS outage now returns typed503`PORTAL_AUTHORITY_UNAVAILABLE` instead
of500. Combined current-auth DB + fresh-volume artifact recovery is proven
69/69 on the named DNS-corrected image; this does not turn browser/load green.

**Historical, superseded by the approved amendment below:** the tested16MiB data-cache proposal was **not the final setting**: backend
retains the published8MiB limit so your current strict context parser remains
valid. Larger Paper views coalesce only in flight. Do not change the limit
unilaterally or interpret it as a permission/response-size/source authority.
If Bobby approves16MiB later, Codex and Claude must coordinate schema/types,
canonical fixture, exact validator and affected browser receipt together.

## Bobby-approved cache amendment — 2026-10-11

Approved: Codex synchronizes backend, schema/OpenAPI reference, generated
types, canonical fixture and strict validator to **16,777,216 serialized
bytes**, without changing design. [Amendment/test receipt](./cache-limit-amendment.md)
records the coordinated result. Aggregate snapshot budget, not a per-entry
or permission/response-size limit; TTL2s and fresh Core authorization unchanged.
This supersedes only the old8MiB/not-activated statement, not any SLO/Axe FAIL
or remaining bootstrap/burst work above. No extra consumer design work needed.
