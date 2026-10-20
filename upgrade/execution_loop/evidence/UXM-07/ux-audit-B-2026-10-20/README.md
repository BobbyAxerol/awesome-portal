# UXM-07 UX audit, group B (2026-10-20)

Lane: FIXTURE_LAB (research preview, `http://127.0.0.1:8095`, built from `e88f0b03`). Not connected evidence.
Screens: Workbench (Paper), Live, Canary, Sandbox, Blotter, Admin, Users, Trade Replay, Access, Approvals cockpit, Operations (+ dock).
Method: host Chromium (Playwright) at 1440, 1024 and 390 px; real rendered text read from `text-<screen>-1440.txt`;
tab switches, drawer/dock open and close, Esc, disclosures (`?`, Provenance, Sources), ChartTools Table/Expand, review-note form,
Columns menu, Approvals keys (`j`, `?`, Esc) and New request drawer, Tab order; axe (WCAG 2 A/AA) and a horizontal-overflow probe on
25 routes at 1440 and 390 (`automated-probe-all.json` is the 1440 pass).
"After" images were taken on a local Vite build of this branch proxied to the same fixture BFF (`after-*.png`).
The fixed top bars in full-page captures land mid-page (capture artefact, not a defect).

Automated result: axe 0 violations on 25 routes at 1440 and 390; no document-level horizontal overflow at any width; the only
inner overflow was the Workbench lifecycle row at 390 (fixed).

## Defects

sha = commit that carries the fix (code commit); `open` = not changed here, reason given.

| # | Screen | Defect | Fixed? | sha |
|---|---|---|---|---|
| 1 | Workbench, Live, Canary, Sandbox @390 | Lifecycle row (R1 ... Live) wider than the card: SANDBOX / CANARY / LIVE scrolled out of sight (`after-workbench-390.png`) | fixed (6 stages share the row at 660 px and below) | 693ee04d |
| 2 | Blotter | Conditional groups, Type column read `Ouo` (a code lower-cased by the word formatter) | fixed (`OUO`) | 693ee04d |
| 3 | Blotter | Esc did not close the Columns menu while focus was on the Columns button | fixed (Esc on the wrapper) | 693ee04d |
| 4 | Access | Granted-to-you card told the reader to add `?workspace_id=...` to the address (developer instruction) | fixed (existing sentence "No workspace is named for this read.") | 693ee04d |
| 5 | Access | "Held:" repeated 15 times in Basis / Why columns | fixed (word deleted; names only) | 693ee04d |
| 6 | Access | Page subtitle "Fixture reviewer . Owner" repeated the Signed in as and Owner cards | fixed (subtitle deleted) | 693ee04d |
| 7 | Access | 36-character user id wrapped as 35 characters plus a one-character orphan line | fixed (even two-line wrap) | 693ee04d |
| 8 | Users | Disabled "Role preset: not published" select, repeating the "Not published Role presets" line under it (dead control) | fixed (select deleted; the line stays) | 693ee04d |
| 9 | Users drawer | Role printed twice: `User USER` | fixed | 693ee04d |
| 10 | Admin drawer | "Capital actions begin with a preview..." printed in the drawer and again in the page footer | fixed (drawer copy deleted) | 693ee04d |
| 11 | Approvals (evidence) | "(rev rev 12)", "(rev account policy rev 7)": the word "rev" added to a revision that already carries it | fixed (prefix only when absent) | 693ee04d |
| 12 | KPI strip (Overview, Fleet, others) @1024 | Odd tile count in the two-column grid left a grey empty block (`after-overview-kpis-1024.png`) | fixed (last odd tile spans the row) | 693ee04d |
| 13 | Trade Replay | Chart header repeated "Trade replay - trade logs on candles" under the panel title "Trade Replay", the account chip twice, a keyboard-hint tail, and the log header a "row <-> marker share order_id" tail | fixed (V2 `plain` reading only; V1 DOM untouched) | 693ee04d |
| 14 | Workbench (and every ChartTools chart) | Expand widened the chart but kept its 280 px height: half the dialog empty (`after-wb-chart-expand-1440.png`) | fixed (equity chart takes half the window height) | 693ee04d |
| 15 | Operations dock | Pending-control preview form: "Ready to preview" hint beside the Preview button, and a sentence explaining that the five version counters cannot be edited (they are plain text, no field) | fixed (both deleted) | 693ee04d |
| 16 | Context bar (all screens) | Where the read takes no environment or window the 7 buttons stay drawn and disabled, with Real-funded and 90D pressed (Blotter shows Real-funded pressed above rows that are Paper) | open: shell-wide look change, tests assert it (ContextBar.test 125, 134); recommend drawing only the segment that works and no pressed state when "Not applied" | - |
| 17 | Overview, Admin, Users, Blotter | Two timestamp styles on one screen (`17 Oct 12:00:00Z` and `2026-10-17 12:00:00 UTC`) | open: `utcStamp` vs `formatAsOf`, many screens and tests; needs one decision | - |
| 18 | Live (V1 body) | Three consecutive one-line "Not available" panels (Reconciliation, Positions, Orders) plus header and strip gap lines: six "Not available" lines on one screen | open: V2 body already folds them; V1 regions are asserted by live.test (lines 150-204) | - |
| 19 | Users drawer | Disable and Archive each print the same reason, which is also printed above the table | open: both are asserted disabled-with-reason; recommend one shared reason line as on Live | - |
| 20 | Operations dock | Raw `RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED` printed after the coverage sentence; dock title is the raw command key; Resolve reason ends in an ellipsis (title attribute only) | open: coverage copy and dock name are asserted by tests | - |
| 21 | Approvals decision rail | "Preview - not recorded" under each disabled decision plus the page banner | open: reason is each button's aria-describedby (INC-1 design) | - |
| 22 | Blotter @390 | 50 order cards of six lines each: a 15,000 px page | open: cards table layout; propose two-column cards or a 20-row page at phone width | - |
| 23 | Workbench Orders | Quantity column mixes 0.1 / 0.12 / 0.08 (exact decimals, right aligned, not point aligned) | open: exact-decimal rule; needs a per-column decimal-place decision | - |
| 24 | Shell top bar @1024 and @390 | Breadcrumb clipped ("dep_canary_01 . c", "dep_live_01 . live fu") | open: shell, outside group B | - |
| 25 | Every screen | Console 404 `/api/v1/execution/retained-review` (and one 401 on Approvals load) | open: fixture BFF does not serve the route; not a V2 defect | - |
| 26 | Sandbox | Finding ids (`fnd_...`) inline after the summary | open: asserted by sandbox.test 341; id is a support reference | - |
| 27 | Workbench exit request, Operations pending-control preview | Not mounted on the preview (no workspace named; `command` flag not in the 20-key list), so reviewed in code and unit tests only | open: needs a preview build with `command` and a workspace | - |

## New user-visible sentences

None added. One existing sentence is reused in a new place (Access, Granted to you): "No workspace is named for this read."

Deleted text: "Held: " prefix, the Access subtitle, `?workspace_id=...` instruction, the "Role preset: not published" select,
the Users drawer role code, the Admin drawer capital sentence, "Ready to preview", the version-counter note, and in Trade Replay (V2) the
panel title echo, account chip echo and two hint tails.

## Gates

tsc (apps/portal/frontend files): clean. vitest `src/execution/v2` + testHygiene + absentValues + failClosed (--maxWorkers=2):
202 of 204 files pass. Two reds, neither from this change: `testHygiene` names three `if (!read.ok) return;` lines in
`v2/readers/alphaFleetRealtime.conformance.test.ts` (already on `e88f0b03`); `portfolio.test.tsx` "names Net PnL ... ONCE" failed
once with an act() console warning under machine load and passes alone (2 of 2 reruns, whole file 69 of 69).
v2Hygiene, uxm10Css, linkTargets and flagOff are green. Flag-off DOM: the only shared file touched is `TradeReplayEvents.tsx`,
and every edit there is behind `plain`, which only the V2 replay passes.

## Files

`<screen>-<width>.png` before; `after-*.png` after; `text-<screen>-1440.txt` the rendered text read; `automated-probe-all.json` axe and probe.
