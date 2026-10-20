# UI copy diet, manager screens (2026-10-20)

Scope: Overview, Portfolios, Portfolio 360, Compare, Alpha Fleet, Approvals cockpit, Blotter, Accounts, Account 360, Operations, Incident,
Admin Actions, Users, Profile & Access, Command (fixture story), Scoped slice, and the shell chrome (context bar, lock reasons).
Direction (Bobby): fewer words; drop every label, caption, chip and explanatory sentence that is not needed to decide or act.

## Rules that decided each change

1. A request id (`FE-025`, `A360-4`) or a reason code is never on screen as text. It stays in the `title` and in visually hidden text
   (`exec-blk-sr`), so `textContent`, copy and assistive tech still carry it. Shared: `NotPublished`, `QuietIds`, `DockAction`.
2. A sentence that restates what a control or section says is removed, or becomes the `title` of the thing it explains.
3. One compact line per panel or screen for facts that are not published: `Not available: A, B, C` (shared `NotAvailableLine`). Its
   `title` holds one line per fact with the request id and the reason. No per-row or per-column "Not published".
4. Kept on purpose: exact values and units; stale/partial/denied/unavailable chips and banners; the global fixture banner; one short
   reason beside a disabled control (`aria-describedby` text unchanged or hidden, never removed); "Showing N of M"; absent values are
   "Not available" or "Not published", never `0`, `-` or `N/A`.
5. A fresh read prints no "Fresh" chip (the as-of line says it); aging, stale, paused and unknown keep theirs.

## Shared pieces added or changed

| File | Change |
|---|---|
| `v2/blocks/NotAvailableLine.tsx` (new) | the `Not available: ...` line; id optional; title lists id, request and reason per fact |
| `v2/blocks/QuietIds.tsx` (new) | hides `(FE-xxx)`, `(A360-n)` and ` . REASON_CODE` in a sentence (hidden text, same `textContent`) |
| `v2/blocks/notPublished.tsx` | `Not published` visible; id and reason code in title and hidden text |
| `v2/Drawer.tsx` (`DockAction`) | disabled reason printed through `QuietIds` |
| `v2/shell/ContextBar.tsx`, `ExecutionPreviewRoute.tsx` | one `Not applied: Environment, Window` line; locks carry `short`, `unapplied`; full reasons stay in the title and the `aria-describedby` text |
| `v2/screens/series/*` | chart caption shows measure, book and stated gaps; basis, methodology and exact window in the title |

## Shell chrome (ContextBar, lock reasons, NotPublished) , commit c21f5f01
| Before (visible) | After (visible) | Detail kept in |
|---|---|---|
| "Not applied here. This screen's read has no environment filter." + "Window applies when the server supports it." (two sentences) | "Not applied: Environment, Window" (one line) | title of the line + visually hidden text tied by aria-describedby to the disabled buttons |
| "Environment fixed: Paper" chip + "The deployment fixes the environment." | "Set by the page" (the pressed button already shows the environment) | title + aria-describedby text |
| "Window fixed: Since activation" / "... Trial window" + a second reason sentence | "Window: Since activation" (chip only) | title "Window fixed by this screen" + aria-describedby text |
| "Operations has its own Environment filter below." / "... Range control below. The server takes no window (FE-025)." | "Own filter below" / "Own range below" | title + aria-describedby text |
| "Blotter: Not published (FE-052). The orders read has no environment filter." / "... takes no window." | folded into "Not applied: Environment" and "Window: Current retained window" | title + aria-describedby text |
| "USDT · one basis" | "USDT" | title "One currency basis" |
| "Ignored invalid URL parameter: x. Defaults are shown." | "Ignored invalid URL parameter: x" | title "Defaults are shown" |
| every `Not published (FE-xxx)` (shared NotPublished block): visible id and reason code | "Not published" (+ what is missing) | tooltip "FE-xxx · request" and visually hidden text; textContent unchanged |

## Overview
| Before | After | Detail kept in |
|---|---|---|
| subhead "Fund, current facts. Windowed figures are Not published (FE-025)." | removed | line "Not available: ..." |
| stream sentence "No live stream is published for this profile. Values are as read; Refresh re-reads them." | "Not live" after the read time | title of the read time |
| FRESH chip when ok | removed (chip kept when aging/stale/paused/unknown) | |
| KPI cells Net PnL, Return, Drawdown ("Not published (FE-005/006/013/025)" x3 + notes) | one line "Not available: Net PnL, Return, Drawdown, Capital, Since your last visit, Contributors" | title: ids and reasons per fact |
| Capital panel (5 x "Not published (FE-017)"), "Since your last visit" panel + paragraph, Contributors panel + chart state (3 panels) | removed, named on the line above | same title |
| "Window: Not published (FE-025)" in Performance head | removed | |
| NAV note "Latest published point, <ts> · methodology X · window 90D" | "As of <ts>" | title |
| Open incidents note "Incidents in the ranked list, Operations" | link "Operations" | title |
| "Operations awaiting acknowledgement: 8" | "Awaiting acknowledgement: 8" | |
| partial banner "Some sources are partial; figures may be incomplete. See Source health below." | "Some figures may be incomplete" | title |
| stale banner "The last refresh failed (UPSTREAM_503). These are the values from the last good read." | "Showing the last good read" | title with the reason |
| chart caption "NAV in USDT · paper book · basis X · methodology Y · window A to B (UTC) · no stated gaps" | "NAV in USDT · paper book" (+ stated gaps when any) | title (full caption) |
| Current by currency aside "Current facts, not a window. Never added across currencies" | removed | |
| Needs attention foot "3 of 214 in total; the rest are ranked behind these and open in Operations." | link "All in Operations" | title |
| "Quiet as of <ts>. Pending work owned by others stays in its queues." | "Quiet as of <ts>" | |
| Fleet by stage aside "An alpha in two stages is counted in each", captions "(count of alphas, from the Fleet summary)", "(count of deployments, from the Command Centre snapshot)", "(not deployments)", note "Alphas and deployments are different units...", "Deployments: 182. Counts only; amounts live on the 360 screens." | "Alphas by stage", "Deployments by state", "Open issues", "Deployments: 182" | titles |
| Today aside "ok", Source health aside "Per profile", source reason code beside each profile | removed | reason code in the profile's title |
| researcher note "What a researcher may see is not decided (Not published (FE-026)); nothing beyond..." | one line "Not available: Net PnL, Researcher field policy" | title |
| layout | Needs attention beside the chart (first when stacked); page 2068px -> 1630px at 1440 | |

## Portfolios (register, Portfolio 360)
| Before | After | Detail kept in |
|---|---|---|
| sub "Top 6 / 9 portfolios · Context: Real-funded · showing all domains" | "Top 6 / 9 portfolios" | Context bar and Domain control already say context and domain |
| "Score: Not published (FE-011)" in the head, banner "Names and allocation only. NAV, Net PnL, Return, Drawdown, Concentration and Score are not published yet; each column says which request will publish it." | one line "Not available: NAV, Net PnL, Return, Drawdown, Concentration, Score" | title: id and request per fact |
| five columns NAV / Net PnL / Return / Drawdown / Concentration ("Not published (FE-xxx)" in every row: 30 cells for 6 rows) and their entries in the Columns menu | no columns; Portfolio column widened (150 -> 280px) so ids stop wrapping | same line |
| FRESH chip | removed when fresh (kept for aging/stale/unknown) | "As of" line |
| partial banner "The read is partial: some portfolios or figures may be missing." | "Some portfolios or figures may be missing" | title "The read is partial" |
| "Total NAV, this set: Not published (FE-013)" | removed | line |
| "Search, domain and sort apply to the 6 loaded portfolios; the read has no server filter." | "Filters cover the 6 loaded portfolios only." | title |
| "The portfolio read publishes no cursor, so the rest cannot be asked for yet." | "The read publishes no cursor." | |
| "Sorted by name: allocated capital sorts only inside one currency. Pick a currency to sort by it." | "Sorted by name. Pick a currency to sort by allocated capital." | |
| Absent cells "Not available · owner not published" | "Not available" | title + hidden text |
| Portfolio 360: Score; KPI notes ("From the deployments in this portfolio", "Account balances are never this portfolio's capital", "Per currency, as published; not a window", "Real-funded and Simulated are never added", "5 holdings counted by the server") | "5 holdings" only | |
| Portfolio 360: second KPI strip (Net PnL, Return, Drawdown "Not published") + Capital panel (9 "Not published" rows) + Concentration panel + four lane rows "Stage/Decision/Incident/Recall Not published (FE-031, FE-032)" x3 places + disabled Net PnL/Return segments + a second Export + drawdown pane | one line "Not available: Net PnL, Return, Drawdown, Concentration, Capital statements, Funding source, Stage, decision, incident and recall lanes, Score"; NAV joins the identity strip | title |
| equity caption "Last 90D / Account equity, not NAV / Benchmark: Not available / As of" | "Account equity, not NAV" + as-of | title (benchmark) |
| NAV caption with basis/methodology/window | "NAV in USDT · paper book" | title |
| "Every deployment reports Ready ... not a guarantee." | "Nothing needs attention" | title |
| banners "The resource is partial: some relations may be missing." / "Not available from the source: X." | "Some relations may be missing" / "Not available: X" | title |

## Compare
| Before | After | Detail kept in |
|---|---|---|
| sub "2 to 4 · one currency · one domain · identity, scalars and aligned series" | removed (the pick hint says it) | |
| FRESH chip | removed when fresh | |
| rows NAV, Net PnL, Return, Max drawdown, Score ("Not published (FE-xxx)" x2 columns each) | one line "Not available: NAV, Net PnL, Return, Max drawdown, Score" | title |
| Series head "... · Money is never converted or combined" | "USDT · Real-funded basis · 1 listed apart" | title |
| Metrics aside "Identity and published scalars" | removed | |
| "Comparing alphas is Not published (FE-033). Showing portfolios." | "Comparing alphas is not available. Showing portfolios." | title |

## Fleet
| Before | After | Detail kept in |
|---|---|---|
| sub "Identity only. Allocation, PnL and equity are not shown on this screen." | removed | |
| FRESH chip | removed when fresh | as-of line |
| KPI notes "In your scope", "Across all stages", "Holding deployments", "Health flag", "No deployment" (5) | removed | |
| "Not published yet: Group by (FE-012), Map (FE-035), Window (FE-025), Readiness (FE-027, FE-028), Compare (FE-033), Archived list (FE-034)." | "Not available: Group by, Map, Window, Readiness, Compare, Archived list" (still the aria-describedby of every disabled control) | title + hidden text with ids |
| partial banner "The read is partial: some rows or counts may be missing." | "Some rows or counts may be missing" | title |
| board note "Loaded rows only: N alphas placed by highest published stage. Stage counts are for your whole scope. Readiness and days in stage are not published (FE-027, FE-028)." | "Loaded rows only: N alphas placed by highest published stage" | title |
| board lane head "Readiness: Not published (FE-027, FE-028) for every alpha here" (x every lane) and "Not published (FE-027, FE-028)" in a collapsed gate lane | removed from view; "Not available" in the gate strip | hidden text per lane (a11y), toolbar line |
| Archived panel "Not published (FE-034). This lens makes no request until the backend publishes the list." | "Not published" | title + hidden text |
| Drawer / every DockAction disabled reason "Not published (FE-033)" and the like | "Not published" (ids not visible) | title + hidden text (shared QuietIds in Drawer.tsx) |

## Operations and Incident
| Before | After | Detail kept in |
|---|---|---|
| subtitle "Commands, exceptions and audit" | removed (the tabs say it) | |
| KPI notes "Operations you may see, before filters", "After the filters below", Read note "For this request" | removed ("of N matching" stays) | |
| Counts by status: caption "Counted by the server across the whole filtered query ... The Range control does not change them. Succeeded is the Portal queue record state only ... Same server snapshot ... observed ..." and four tiles each "Not published (FE-043)" | heading + one line "Not available: Triage, Verification, Source status, Severity counts" (when counts are absent); the caption is the heading's title; the Succeeded caveat is on the Succeeded row | titles |
| table columns Intent and Display ("Not published (FE-020)" / "(FE-032)" in every row) and per-row "Not published (FE-042)" under every target | no such columns/cells; one line "Not available: Intent, Display" (+ "Linked incidents" when a body omits them) | title; hidden text per row group |
| "Mine: Not published (FE-030). The queue has no assignee or creator, so it cannot be filtered to you." | "Mine: Not published. No assignee or creator is published, so it cannot be filtered to you." | hidden id, title |
| exceptions/audit/source journal sentences | "No exceptions feed. Incidents open from their own link." / "Who did what is not shown: the audit source is unavailable." / "... nothing is assumed healthy." | |
| Operation dock: "Not published" heading + four sentences | one line "Not available: Intent axis, Display axis, Amounts, Who acknowledged or resolved it" | title |
| Incident drawer: "Not published" heading + four named panels each "Not published (FE-031)" + Assignee row + reason code line | one line "Not available: Evidence, Operations taken, Resolution gates, Timeline, Assignee" | title (ids, reason code) |
| "Forward only. Mitigated and resolved are Portal records; they do not say the position or the source is safe." | "Forward only. Mitigated and resolved are Portal records, not a safety statement." | |
| "Integration unavailable; nothing was asked of the source." | "Integration unavailable" | title |

## Cockpit (Approvals)
| Before | After | Detail kept in |
|---|---|---|
| subtitle "Every decision, sorted by SLA" | removed (the queue head says "By SLA") | |
| "Archive, Reactivation and Capital: Not published (FE-034)" | "Not available: Archive, Reactivation, Capital" | title, hidden id |
| Receipt rows Ladder / Call / Receipt ref / What changes ("Not published (FE-030)" x4) | one line "Not available: Ladder, Call, Receipt ref, What changes" | title |
| "Informational only. Nothing is asked or sent in this preview." | removed (the global preview banner and the disabled controls say it) | |
| note under the Note field "Preview · not recorded", Receipt head "Preview · not recorded" | hidden text for assistive tech / removed | |
| every "Not published (FE-0xx) · REASON_CODE" in evidence and rail | "Not published" | title; hidden text |

## Blotter
| Before | After | Detail kept in |
|---|---|---|
| sub "Orders and fills, newest first. Paper profile, current retained window." | removed | count line says "newest first"; chips name environment and window |
| FRESH chip | removed when fresh | as-of |
| chips "environment Paper set by this read" / "window Current retained window set by this read" and the paragraph "Environment and window come from this read, not from the context bar: ... (Not published, FE-052, FE-025, FE-041). The environment highlighted ... does not change these rows." | the two chips without "set by this read"; the paragraph is hidden text | chip titles |
| "The last refresh failed (X). The rows below are the last good read." / "Some figures are missing. The read is partial." | "Showing the last good read" / "Some figures are missing" | titles |
| Order funnel aside "Open an order to see its path" + paragraph "Expand an order to read its path: ..." + note "Intent and signal steps happen before the order ..." | one line "Open an order to see its path" | titles |
| Export note "Not published (FE-016)" | "Not published" | title |

## Accounts and Account 360
| Before | After | Detail kept in |
|---|---|---|
| Accounts subtitle "Venue bindings and the sleeves on them"; as-of line "... · Live environment" | removed | the selected tab names the environment |
| three columns Physical equity / Σ Virtual · Headroom / Check ("Not available" + reason under every row) | no columns | per-cell reasons dropped; the screen names nothing extra because these were reads that do not exist per row |
| partial banner "The read is partial: some bindings may be missing." | "Some bindings may be missing" | title |
| count line "... The server does not filter these, so they narrow only what is loaded." | "N with issues in the M loaded rows, K on the server" | title |
| Export note "Not published (FE-016). Exporting this list is not offered yet." | "Not published. Not offered yet." | title |
| Account 360: "Shared by 3 sleeves. Native figures cover the whole account, not one sleeve." (banner) and "Shared by 3 sleeves" again in the Native custody KPI | one banner "Shared by 3 sleeves" | title |
| "Withheld. The portal never shows the broker account reference." (x2) | "Withheld" | title |
| stale banner "The last refresh failed (X). The last good read is shown." | "Showing the last good read" | title |
| "Not available from the source: Margin (MARGIN_SOURCE_GAP)" | "Not available: Margin" | title with the code |
| FRESH chip | removed when fresh | |
| Sleeves: column "Native attribution" ("Not computed / Native balance spans all sleeves" x3) and "Not totalled. Native balance is not split among sleeves." | no column; "Not totalled: native balance is not split among sleeves" | title |
| Positions: Long / Short / Gross notional rows ("Not published (A360-1)" x3) + "Notional per position is as published. Totals by side are not published ..." | one line "Not available: Long, short and gross notional" | title |
| Fees: three "Not published (FE-025)" rows, "Current source row" heading, "Current figures are what the latest ledger row states. They are not a window and are not summed." | one line "Not available: Fees, funding and borrow over a window"; heading "Current" | titles |
| Allocations aside "Logical" and "Logical allocations. They are no claim on the native balance." | "No claim on the native balance" | title |
| Reconciliation aside "Difference only where scopes match"; "The binding population is partial; read these differences as part of the picture." | removed; "Binding population partial" | title |
| "Showing the newest 10 of 200 published rows. Rows are listed as the source gave them; gaps in time are not filled." | "Showing the newest 10 of 200" | title |
| every Na reason ("Venue field not reported", ...) and Np id | "Not available" / "Not published" | title + hidden text |

## Admin Actions
| Before | After | Detail kept in |
|---|---|---|
| sub-head "Plan, apply and verify. Administrators only. This page plans; it does not apply." | removed | title of the heading |
| tier aside "Look only. Nothing changes. · 0 of 7 ready" (x6, e.g. "Moves money. Starts in Portfolios.") | "0 of 7 ready" | title |
| row sub "No catalogue key" (3 rows) | omitted | |
| footer "Open in Operations" (the header has the same link) | removed | header link |
| "The staged-activation read failed (X), so the first reason an action is not live is limited to what the task catalogue states." | "Reasons limited to the task catalogue" | title |

## Users
| Before | After | Detail kept in |
|---|---|---|
| sub "Accounts and their lifecycle. Administrators only." | removed | title of the heading |
| KPI notes "In the roster read", "Can sign in", "Hold no credential yet", "Sign-in blocked", "Kept with history", "Server-locked" (6) | removed | title on each KPI |
| "Account changes are made on the current Users screen. This view reads accounts only." | "Account changes are made on the current Users screen." | title of the heading |
| drawer rows "Role preset Not published (FE-015, FE-026, FE-037, FE-038)" and "Last sign-in Not published (FE-053)" (the toolbar line says both) | removed from the drawer | toolbar line title |
| "Not published (FE-...)" in the toolbar line | "Not published" | title, hidden text |

## Profile & Access
| Before | After | Detail kept in |
|---|---|---|
| KPI notes "From your session" x2; whole "Role preset Not published (FE-015) / Access is shown by capability" KPI | removed | one line "Not available: Role preset, Per-action eligibility, Who granted each item" (title: FE-015) |
| panel asides "Visibility only", "Seeing never grants this", "What, where and until when", "As published" | removed | |
| "Not published (FE-015) Per-action eligibility and the reason a control is off are not published for commands, archive and export." | on the line above | title |
| "The capability names behind Portfolios, Accounts, Operations and Blotter are provisional (FE-037) and may change." | "Provisional capability names: Portfolios, Accounts, Operations, Blotter" | title |
| "Who granted each item is not published (FE-015). State and trading-system columns are the Portal's own evaluation, not recomputed here." | "State and trading-system columns are the Portal's own evaluation." | line above |
| "The field matrix for researchers is not decided." | "Not decided" | |
| owner recovery reason code beside the sentence | sentence only | title, hidden text |
| "... These are the first 200 in the order the Portal sent them; the other 1 are not drawn here." | "Showing 200 of 201 grants. The other 1 are not drawn here" | title |

## Command (fixture story)
| Before | After | Detail kept in |
|---|---|---|
| sub "UXM-09 fixture · plan, typed confirmation, receipt and status" | removed | |
| banner "Fixture story: not connected to a source; fake port. Nothing here reaches a network or a source. The answers are scripted, and no command is ever sent." | "Fixture only" + "Fixture: not connected" | title |
| lane notes under the two radios, scripted-answer summary, "Choosing another scripted answer starts the flow over.", clock sentence | hidden text / select title; "Fixture clock: <time>" | titles |
| "Command sends/reads are not connected to a source: UXM-09 fixture" | "... not connected to a source: fixture" | |
| "Any other id is answered 404: an unknown receipt and one you may not read look the same." | "Any other id: 404" | |
| "No plan has been read. Reading a plan changes nothing and sends nothing." | "No plan has been read" | title |
| lookup help "A command id (ecm_ and 32 hex characters) or an operation id. Looking up changes nothing." | "A command id or an operation id" | title |
| certification intro "Each of these touches Live positions, funds or venue orders. A passing fixture ... is not a certification, and none of them is offered here." and title "Trading flows that need their own certification" | removed; title "Flows that need their own certification" (each row still says "Requires separate certification") | |
| "64 catalogue commands, 8 capital operations and 6 families. None is sendable: each control is disabled and says why." | "... None is sendable." | title |
| per row "Would be enabled by the staged-activation capability COMMAND_R2 once the relay is qualified. Portal grant name: not published, provisional (FE-037)." (x64+) | "Needs COMMAND_R2" | title |

## Scoped slice
| Before | After | Detail kept in |
|---|---|---|
| sub "Portfolio, fleet and alpha, read-only" | removed | |
| lane note "Fixture frames, not a real stream. Not connected to a real source." + the same words as the fixture legend | "Fixture: not connected"; legend visually hidden | note title, legend (accessible name) |
| scope panel: five sentences | three lines (scope, completeness, page); totals and policy sentences | title of the first |
| "Heartbeats 0 (liveness only)", "Notices 0 received, ..." | "Heartbeats 0" | titles |
| "Last notice: quality of the notice, not of the data" | "Last notice" | title |

## Layout fixes made on the way (V2 css only)

- Overview: Needs attention beside the chart (first when stacked at 390px); page height at 1440 from 2068px to 1630px.
- Portfolios: Portfolio column widened (150 to 280px) now that five empty measure columns are gone.
- Command: long panel titles wrap inside the head (the page overflowed by 150px at 390px; after the first rule 63px, after the
  `flex: 0 1 auto` fix 0, measured by an element probe on a private-port build).
- Fleet and Operations: label-and-number tiles two to a row at 390px instead of one tall tile each.

## Evidence

Screenshots of every screen at 1440 and 390, before and after, from the e2e harness build on a private port (temporary config, removed):
`/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/before/` and `.../after/` (`*.png`, with `*.txt` innerText dumps).
Visible text (innerText) at 1440, bytes before to after: overview 4135 to 2725, portfolio-360 4941 to 3549, portfolios 3145 to 2089,
accounts 1697 to 1235, command 3737 to 3081, operations 3632 to 3182, incident 4744 to 4187, compare 2069 to 1778, account-360 3094 to 2822,
admin 3982 to 3644, access 3373 to 3053.

## Gates (R1, `claude/fe-parity` worktree, `--maxWorkers=2`)

- `tsc --noEmit -p .`: exit 0.
- vitest `src/execution src/app`: 69,247 passed, 6 failed, none caused here: `realtimeProducerConsumer.test.tsx` (5; a NestJS
  `Optional` import in the symlinked node_modules, file not touched) and one `account.test.tsx` search test that failed under load and
  passes solo.
- absentValues, disabledReason, failClosed, castLeak, testHygiene, linkTargets, v2Hygiene, uxm10Css, flagOff, flagOn: green.
- `e2e/execution-v2-coexistence.spec.ts` on a private-port build of the V2 harness: 95 passed.
- NOT_RUN: `execution-v2-command.spec.ts` and `execution-v2-scoped.spec.ts` (literals updated for the new fixture words); the rest of the
  V2 Playwright lane; the visual-baseline suite and the full hook (R2 only); Docker lanes.
