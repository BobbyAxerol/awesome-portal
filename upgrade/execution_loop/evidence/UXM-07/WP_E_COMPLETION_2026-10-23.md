# WP-E completion: Approvals cockpit, New request, Profile & Access, Admin Actions, Users (2026-10-23)

Level: FIXTURE_LAB for everything simulated; R1 for the code (focused vitest, no visual suite, no docker). Not source acceptance, not permission to enable commands: no command, apply, approve, decision or submit transport was enabled, and every decision control is still disabled with its preview reason. Base `claude/post-land-20261022` tip `c9d2b717d`; worktree `/home/bobby/portal/.claude/worktrees/agent-a540a08ee9939a9e4`.

## 1. Commits (prefix, content)
`feat(users)` e0a6374e8, `feat(access)` 3a6d4c972, `feat(admin)` 656a8825a, `feat(request)` 9dae7b017, `feat(approvals)` 930559b74, then a closing `fix(layout)` commit and this note. The pre-commit hook was skipped (`--no-verify`) after the scoped gates, as the board allows (no full hook).

## 2. Element table (audit sections 16 to 20, items A8, A9, A10, B7, B11, B12 of 6(d))
State words: DATA (drawn from a published reader; `fx` = the simulated lane supplies the rows), TYPED (typed absence under the design's own title, legal), BLOCKED (named blocker). Inbox rows to K and D are in BOARD section 5 (two rows from E); the register rows are `## 2d` of SIMULATED_DATA_REGISTER_2026-10-22.md.

### 16. Approvals cockpit (32 rows: 25 DATA, 4 TYPED, 3 BLOCKED)
| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar | BLOCKED | FILE_OWNED_BY_OTHER_WP: WP-D shell (inbox row E to D) |
| 2 | Title + subtitle "Every decision, sorted by SLA" | DATA | |
| 3 | Freshness chip | DATA | "Queue read 18 Oct 12:04Z" is the browser's receipt time (the Portal publishes no inbox as-of); never "Fresh". True as-of: CONTRACT request (5) |
| 4, 5 | New request, Keys | DATA | |
| 6 | Sidebar Approvals count badge | BLOCKED | FILE_OWNED_BY_OTHER_WP: WP-D shell |
| 7 to 11 | Queue header, lane chips with counts, rows, state badges, SLA bar | DATA | unchanged |
| 12 | Decided today | DATA (fx) | counts the history read's decisions of the UTC day; two simulated decisions on the lane; "not read" when the read fails |
| 13 | Keyboard footer | DATA | |
| 14 | Detail header requester line | DATA | "Requested by stan" from the queue row; typed "Not published (FE-030)" when absent |
| 15 | Verdict banner structure | DATA | state headline, Quorum m of n and time left from the queue row, segmented meter with its "k/n" count |
| 15b | Headline claim "Can be approved, N obligations stay open" | BLOCKED | CONTRACT (request 3: `obligations_after_approval`); not claimed |
| 16 | Prior economic history | TYPED | panel under the design's title; CONTRACT request (1) |
| 17 | Still open after approval | TYPED | five labelled rows, each "Not published (FE-030)", never a number; CONTRACT request (3) |
| 18, 19, 20 | Checklist, Provenance, lineage/capital/risk plan | DATA | Provenance is new: gate, policy, workspace, read time |
| 21 to 25, 27 | SoD line, quorum meter, note, Approve with the "A" chip, Other decisions, preview banner | DATA | disabled, with the preview reason; the chip is generated content (`data-key`), the button name stays "Approve" |
| 26 | Receipt PREVIEW rows (none chosen, request and title, you, counts as) | DATA | "If approved: k of n approvals" only for an open request that is not yours, not Live, not a waiver; otherwise it says why it is not counted |
| 26b | Receipt "what changes" | TYPED | CONTRACT request (4) |
| X1 | Evidence diff panel (concept C4) | TYPED | CONTRACT request (2); R2 capital rows stay the only published diff |
| X2 | Waiver lane runway | DATA | one line per waiver on a shared 0 to 45 d axis from the register's `due_at` and `read_at` (existing fixture values: two ahead, one lapsed, rest no clock), soonest first, no-clock rows dashed "No clock, closes by event", the open waiver current, 12 lines then "Showing 12 of N" |
| X3 | Waiver verdict banner | DATA | the server's state word; "Lapses in 1d 21h" |

### 17. New request (14 rows: 13 DATA, 0 TYPED, 1 BLOCKED)
Context bar BLOCKED (WP-D). Subtitle, "Route page | Drawer from the queue" switch (the other frame is a new-tab link so typed text is not lost), the chip ("Run Library read", states reading/read/not available, no clock), step captions ("you, now", "a quant reviewer, not you", "capital, only after R1"), alpha and run pickers, claim, Ids by hand, summary (minimum is the server's 8, not the design's 24: DESIGN_DECISION kept), "What happens next" side panel (route page; folded disclosure in the drawer), Still needed bar with the hint "Fill the missing fields first", Submit, "Preview the result states" legend: all DATA. The drawer form from the queue (`?compose=request`) existed; it gained the switch.

### 18. Profile & Access (16 rows: 10 DATA, 5 TYPED, 1 BLOCKED)
Context bar BLOCKED (WP-D). DATA: title and subtitle ("name . Owner"), freshness chip (receipt time or "Freshness not published"), tile Signed in as, tile App sign-in ("Active", "Session ends 18 May 03:33Z" from the session's own `exp`, never a countdown), What you can see, What you can do (step-up chip on Manage grants from `GET /api/admin/step-up`; the Live gate row adds the cockpit's own sentence), reason dictionary, Manage grants step-up chip, Manage grants account x gate grid (fx: the V1 matrix now reads a fixture policy). TYPED: tile Role preset (carries "Owner . 14 capabilities held" in its note), tile Business access (the "Access policy" tile is the published neighbour), R2 step-up chip ("Step-up not stated": `stepUpRequired` is null for a gate decision), Granted to you (typed "No workspace is named" until the address or `sessionWorkspaceId` names one; the review URL with `workspace_id=ws_TEST_GRANTS` shows the table; inbox row E to D), Manage grants role preset tabs and matrix.

### 19. Admin Actions (20 rows: 17 DATA, 0 TYPED, 3 BLOCKED)
Context bar BLOCKED (WP-D). Design-preview toggles BLOCKED (DESIGN_DECISION: a design aid, kept out of the product). Command rows ready: BLOCKED EDGE_INPUT (relay qualification and per-command connection, B12). DATA: subtitle, freshness (published state word + read time), Open in Operations, state filters, "n of 24 can run now", relay-off banner, six tiers with their sentence printed beside "k of m ready" (it was a tooltip), per-action description and scope, the detail pane (always open in the docked layout: what, kind, scope, who, risk tier, how, state, why it is not live, a Plan / Apply / Verify strip as the catalogue states them, Apply Off), footer, provenance. fx: the six local reads (health, inspect, capital, performance, sizing, broker-read) are served CONNECTED with a FIXTURE_LAB receipt, so Read reads "6 of 7 ready" and "6 of 24 can run now"; every command keeps its published state.

### 20. Users (17 rows: 13 DATA, 2 TYPED, 2 BLOCKED)
Context bar and the design-preview toggles BLOCKED (WP-D; DESIGN_DECISION). DATA: subtitle ("Accounts and their lifecycle . Administrators only"), step-up chip and link, count tiles, search, state filter, Invite (disabled with reason), name + username chip + "(you)" (fx: the signed-in person is aliased onto the simulated roster's first row), state badges, Last seen (published `last_sign_in_at`; fx values), Role and Revision, Actions with the inline reason "You cannot disable yourself" under the self row's disabled button, archived note, footer count and "How accounts work". TYPED: Role preset column and Role-preset filter chips (no published source: the exact Edge input is ELP2-10/FE_CAT_8_9_ADDITIVE_FIELDS_2026-10-23.md; request 6).

Totals: 99 rows, 78 DATA, 11 TYPED, 10 BLOCKED (WP-D 7, CONTRACT 2, EDGE_INPUT 1, DESIGN_DECISION counted with WP-D rows: two toggles).

## 3. Honest-display rules kept
No float, no client money, no score. The only client arithmetic is a time difference between two published instants (lapse clock against the register's own read time, with the 0 to 45 d axis as scale) and "approvals so far + 1" on a published integer, said conditionally. A lapse with no `due_at` is "closes by event", never "never"; with no read time nothing is counted and it says so. No title attribute carries an absence (two heading titles became visible text and their `titleAbsence` rows were removed). Nothing posts, plans, applies or decides; the read-only run of a simulated local read is a POST that sends no source command and says so.

## 4. Fixture work (simulated lanes only; register `## 2d`)
`e2e/bffDoubleUsers.ts` (session alias), `e2e/bffDoubleAccess.ts` (the V1 matrix read and activity), `e2e/bffSimulated.ts` (six connected reads, run receipts, two decisions today), `e2e/bffAnswerer.ts` and `e2e/bffDouble.ts` (marked `WP-E begin/end` call lines and one POST hook). Shared files touched: `Drawer.tsx` (additive `keyHint` on `DockAction`), `titleAbsence.test.ts` (two stale allowlist rows removed). Preview notes for the primary: nginx needs exact locations for `GET /api/admin/profile-access` and `/activity` on the fixture BFF; `FIXTURE_REBASE_TIME=1` makes the simulated decisions "today".

## 5. Layout (scripts/layout-audit.mjs, populated fixture, vite build of this tree; overflow/clipped/wrapped/font outliers per width 1440/1280/1024/660/390)
Before = LAYOUT_QUALITY_AUDIT_2026-10-23.md (tip with the Users fix). After = this branch, same script (the four extra routes were added to the script locally for measurement and not committed).

| Route | Before (1440/1280/1024/660/390) | After |
|---|---|---|
| approvals | 0/0/2/0, 0/0/3/0, 0/0/0/0, 0/0/0/0, 0/0/3/0 | identical: the same prose labels wrap ("Capture R2 review", "R2 execution grant", "concentration top-3"), accepted by the brief |
| approvals drawer (`?compose=request`) | not measured | identical to approvals |
| approvals waiver lane (runway) | not measured | 0/0/0/0 at all five widths (first run found 3 wrapped queue clocks, one clipped no-clock label, a wrapped axis label and a wrapped "lapsed 7d 6h 22m ago"; fixed: short queue clock, the no-clock text inside its dashed track, a fixed 176px "when" column, nowrap ticks) |
| new-approval | 0 at all widths | 0 at all widths |
| profile-access (and with `workspace_id=ws_TEST_GRANTS`) | 0 at all widths | 0 at all widths (the step-up chips are stacked: side by side they pushed the Why column out of its panel) |
| profile-access, Manage grants tab | not measured | 0/0/0/1 at all widths: one off-scale 16px heading in the V1 `ProfileAccess.tsx` (not a WP-E file) |
| admin-actions | 0/0/0/4 at all widths ("Open" 13px beside an 11px flag) | 0/0/0/0 at all widths (the link beside a state flag uses the label role) |
| users | 0/0/0/5 at all widths | 0/0/0/0 at all widths |

Document and main overflow were 0 everywhere. Font roles: no new off-scale size; table text follows the cards.css 13px rule (runway "when" and clock cells use `--exec-font-num`, the note under a dashed track the caption role).

## 6. Not verified
No visual suite and no baseline recording (board rule). No real browser run of the deployed preview; the screens were audited against a local build of the fixture lane. The Playwright specs under `e2e/` were not run. `Granted to you` and the preview's nginx routes depend on the mount and the preview stack (inbox rows). The V1 Manage grants matrix heading (`ProfileAccess.tsx`, 16px) is outside WP-E's files and remains one off-scale outlier on that tab.

## 7. Tests (exact commands and counts are in the final report)
