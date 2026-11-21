# Consumer receipt: RV-05, RV-06, RV-07 (CLAUDE_FULLSTACK_REVIEW_2026-10-20), 2026-10-20

Lane: FIXTURE_LAB / BFF_DOUBLE (V2 build on a private port with a temporary Playwright config and specs, deleted afterwards). Tier R1: focused vitest, `tsc --noEmit` exit 0, the coexistence spec on the private build. R2 (full hook, pinned-image visual baselines, the flag-off build on :4175) is NOT_RUN; the stage-screen baselines will change by the "?" mark and need a recorder run at R2.

Commits on `claude/fe-parity`: `ecaeeb92` RV-05, `30cbd800` RV-06, RV-07 in the commit that carries this receipt (it also carries the `refresh-release-integrity-ledgers.sh --write` re-pin, which covers the three commits).

## RV-05 · F-5, the 7 KNOWN_AXE route variants (fixed at the source; `KNOWN_AXE` is now `{}`)

Cause, found with axe node targets: the one `scrollable-region-focusable` node on every Sandbox and Workbench variant is the compact lifecycle spine (`.exec-blk-spine[data-variant="compact"]`, `overflow-x: auto`), a `div role=img` row with no focusable child. At 1440 and 1024 it did not need to scroll, but the last node's `margin-right: -1px` pushed the row 1px past its box (scrollWidth 1144 vs clientWidth 1143), and axe counts any overflow. The 3 `link-in-text-block` nodes on `sandbox-steps` are the lineage ids (PX-29, AP-101, AP-207) in the Steps tab.

Fix: `useKeyboardScroll` (v2/useKeyboardScroll.ts), the CardsTable rule extracted and shared: the box becomes `role=region`, `tabIndex=0`, named `<label>, scrolls sideways` only while it overflows and nothing focusable (a, button, input, select, textarea, summary, tabindex) is inside. CardsTable now uses it and the spine uses it (390px: a real overflow, so a named Tab stop). The compact nodes get `margin-right: 0` (no border to overlap), so a row that fits no longer scrolls. `.exec-sbx-lineage .exec-blk-link` is underlined, scoped to that list as `.exec-alp2-kpis` already does; the shared `.exec-blk-link` is unchanged, so no shared token or class decision is needed.

axe-core 4.13 (wcag2a/aa, 2.1 a/aa), whole page, nodes per route at 1440 / 1024 / 390:

| route variant | before | after |
|---|---|---|
| sandbox, sandbox-plans, sandbox-v2body | 1 / 1 / 1 | 0 / 0 / 0 |
| sandbox-steps (1 scroll + 3 link) | 4 / 4 / 4 | 0 / 0 / 0 |
| workbench, workbench-fills, workbench-vnm | 1 / 1 / 1 | 0 / 0 / 0 |
| total over the 7 variants | 10 / 10 / 10 | 0 / 0 / 0 |

The coexistence spec's access test (axe + Tab walk + focus ring, 3 widths) now asserts all 32 routes clean; its `KNOWN_AXE` and `KNOWN_ACCESS` are both empty. A `uxm10Css` test pins the two CSS rules and that the shared link rule is untouched.

## RV-06 · "Not available" has a reason you can reach without a hover

The `title`-only reasons were on `GapLine`, the compact `NotPublished` cell, the header's aggregated gaps chip (`StageChipRow` / `ChipBody`) and the alpha-name line (`AlphaNameLine`). Each is now one `GapWhy`: a native `<button type=button>` with `aria-expanded`, `aria-controls` (only while open), an accessible name that starts with the visible text where the text is the trigger (WCAG 2.5.3). Enter, Space and tap open and close it; Escape closes it, returns focus to the button and stops there (a drawer or dialog around it stays open). Focus ring `2px solid var(--accent)`; the "?" mark is CSS (16px glyph, about 24px hit area), so the visible text, `textContent` and word count are unchanged. Closed, the body is not in the DOM. Open, it holds the request id and label, the server's reason code and one next-action line ("It appears here once the source publishes it."); ids and codes are never headline text. No long paragraph is restored.

Tests: `blocks.test.tsx` (aria state, click, focus, Escape, name-in-label, two independent disclosures, no `title` left on the line); the title assertions of the Workbench, Sandbox, Canary and Live tests now open the disclosure through `whyText` (v2/gapWhyTestUtil.ts) and read the rows; the coexistence spec presses Tab (visible ring), Enter, Space, Escape and taps at 390 with `hasTouch`.

Left as `title` (not the gap pattern, not mine to change here): table-cell reasons from `screens/workbench/cells.tsx` and `screens/live/parts.tsx` (`exec-blk-na` with a `title`), `NotAvailableLine`, the Sandbox banner and the Workbench spine and gate wrappers. They are the same defect class and a follow-up for the screen owners.

## RV-07 · F-8, one value-keyed port for every V2 screen

Cause as recorded in F-8: `screenDeliveryPolicy` returns a new object each render, so a port built on `[policy]` was a new `api` after every URL change and every screen effect listing `api` read again. Only Sandbox had the `stableApi` workaround.

Fix: `useValueStableApi(policy, scopeKey)` (src/execution/useValueStableApi.ts), used by `ExecutionPreviewRoute` for `api` and `requestApi`, so every screen gets it; `stableApi` is gone. The key is the value of the policy plus the session scope (`retainedSessionKey`: principal, session, role).

- A tab, selection, sort or slug rewrite: same port, no read. Measured.
- A policy-value or session change: a new port; the old port is aborted (its in-flight GETs end as a typed absence, never a throw, never a value for the new scope) and the session-wide runtime catalogue (`/runtime-manifest`, `/screen-contracts`) is forgotten, so it is read again for the new scope.
- A workspace or query change is a prop of the screen (`workspaceId`, `binding`), not part of the port; each screen's read effect lists it, cancels and fences the previous answer. The Stage eligibility provider's existing test ("a workspace switch asks again, and the old workspace's late answer is dropped") pins that half; a route test pins that the route passes the new workspace and keeps the port.
- Nothing is cached: `sharedRead` is in-flight only and keeps no result; the port object holds no data.

Tests: `useValueStableApi.test.tsx` (same value keeps the port and the factory ran once; policy or session change makes a new one and aborts the old; StrictMode does not abort the live port; an in-flight read of the old port is aborted and answered as unavailable; the runtime catalogue is read again after a scope change; and the real route with a probe screen: tab/selection/slug changes keep one `api` and issue 0 requests, a workspace change keeps the port and passes `ws_A`, `ws_B`, a session change and a policy revision make a new port); `sandboxStableApi.test.ts` now pins that the route only builds ports through the hook.

Measured on the same private build with the new and the old route (budget measure mode, api requests / body bytes). Tab click:

| screen | before | after |
|---|---|---|
| Canary | 2 / 19,034 | 0 / 0 |
| Live | 2 / 17,339 | 0 / 0 |
| Workbench (paper, fills, vn-market) | 2 / 78,576 | 0 / 0 |
| Portfolio 360 | 12 / 21,216 | 1 / 736 |
| Alpha 360 | 2 / 24,676 | 0 / 0 |
| Alpha replay | 3 / 27,527 | 1 / 2,851 |
| Account 360 | 4 / 8,270 | 0 / 0 |

Access, Fleet and Accounts keep their 2, 1 and 2: those tabs read their own data. First load also falls (the `?tab=` rewrite no longer reads twice): Portfolio 360 26 -> 16, Workbench 13 -> 11 (260,379 -> 181,803 B), Canary and Live 13 -> 11, Alpha 360 15 -> 12, Incident 15 -> 12, Cockpit R1 16 -> 13.

The BUDGET table in the coexistence spec is regenerated from this build (ceilings stay `ceil(1.25 x measured)`); the budget rows of the F-8 family assert the new numbers. Every first-load row also moved up by 2 requests (1,984 B) against the 2026-10-20 table; that drift is present with the old route too (two reads added to the shell since base `892ea030`), so it is not caused here, and the regenerated table records it.

## Gates (R1)

- `npx tsc --noEmit -p .` exit 0.
- `vitest run src/execution/v2/blocks`, `screens/{workbench,sandbox,live,canary,stage}`, `budgets`, `v2Hygiene`, `uxm10Css`, `linkTargets`, `cardsTable`, `flagOn`, `flagOff`, `failClosed`, `disabledReason`, `absentValues`, `previewBanner`, `sandboxStableApi`, `useValueStableApi`, `productBoundary`, `testkit`: 3,802 passed. Route and shell set (`src/app` incl. the flag-off PortalShell digests, shell, cockpit, access, slice, command): 2,537 passed.
- Coexistence spec on the private build: 105 passed; the 32 `flag-off build serves V1` rows could not run (no :4175 flag-off server in the temporary config): NOT_RUN, they run in R2.
- A full `src/execution/v2` run (before the fixes above) had 15 failures: 11 were this change (title assertions, a testkit file list), now green; 2 are `governanceParents` "25 parent bodies" (Codex's canonical fixture count, not touched here, not investigated) and 2 were fleet conformance timing cases that pass alone (621 passed).

## Not done, needs a decision or another owner

- Hover-only reasons listed under RV-06 (cells, `NotAvailableLine`, banner, spine and gate wrappers).
- `useExecutionRuntime` keeps its catalogue in a module variable for the whole page; it is now forgotten on a scope change, but it is still not keyed by principal in storage terms.
- The UXM-10 README still quotes the old F-8 and F-5 numbers; this receipt is the newer record.
