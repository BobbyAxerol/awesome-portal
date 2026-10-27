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

## 8. QA1 fixes (browser review R3, QA1_REVIEW_R3_2026-10-23.md)
Method: each issue was reproduced in a Playwright probe against a LOCAL stack (vite dev on 15173 + the fixture BFF on 8000, populated profile, `FIXTURE_REBASE_TIME=1`; never 8095), fixed, then measured at 1440/1024/660 (probe scripts and screenshots in the session scratchpad `qa-e/`). Layout audit on the same stack (`--base-url`): approvals 0/0/3/0 (1440), 0/0/4/0 (1280), 0 (1024, 660), 0/0/3/0 (390); new-approval, profile-access (also with `workspace_id` and on the Manage tab), admin-actions and users 0/0/0/0 at all five widths; the three remaining approvals wraps are the known prose labels ("Capture R2 review", "R2 execution grant") and the receipt's request title.

| Id | State | How, evidence |
|---|---|---|
| I-16 | FIXED | A findings column that is the same typed absence on every row is not drawn; one line under the table says "Observed and limit: Not published (FE-028) for every finding" (`ck-observed-absent`). A column with real cells stays. |
| I-17 | NOT FIXED (part) | The raw enums are in words now (Live "R1 state", the Canary branch state, lock sentences: `stateWords`). The default selection and which kind carries a chart follow the fixture's published data (R2 AP-352 first), which is the fixture world (WP-P/K), not this screen. |
| I-18 | FIXED | Verdict flags are `white-space: nowrap` and their column is as wide as the flag ("WITHIN", "INSUFFICIENT", "UNAVAILABLE" whole); reason codes get `<wbr>` after every separator (`breakable`, text unchanged), in the not-published cells, ids, the Canary reason column. Probe: the codes wrap as `N23_CANARY_DERIVATION_NOT_` / `PUBLISHED`, never inside a word. |
| I-19, I-23 | FIXED | Master-detail: the queue is a fixed-height sticky panel whose list scrolls inside it, the rail is sticky; the page is 1,877px at 1440 (was 4,160) and at scroll 700 queue, detail and rail are all in view (probe: queue 68 to 888, rail 68 to 746). Stacked (1100px and below): the queue is capped at 70vh; a tap scrolls the detail to the top once it is rendered (660: main top 109 after the tap, was 3,433 below), and the detail has Back to the queue and Go to the decision. |
| I-20 | FIXED | "Decided today" and the J/K legend are inside the sticky queue panel, always visible. |
| I-21 | FIXED | The five counts and the diff before/after are mono, tabular, right-aligned; exact decimals are thousands-grouped with every digit kept (11,000.00 to 16,000.00); nowrap. |
| I-22, I-26 | INFO | Verified OK by the reviewer. |
| I-24 | NOT FIXED | Blocker: preview nginx (primary). The fixture BFF answers `GET /api/v1/quantbt/runs` (200 locally with the same build; the alpha picker works), the preview sends it to the real control-api (401). Inbox row E to primary posted. The picker has no other published source (FE-069). |
| I-25 | NOT FIXED (part) | "Ids edit by hand" opens only when the Run Library is unavailable (I-24); the minimum 8 is the server's (DESIGN_DECISION kept); breadcrumb and the context chips are WP-D. |
| I-27 | NOT MINE | Dates: WP-P (world clock). |
| I-28 | CONTRACT | Role preset, business access, granted by: typed, requests (6), (7), (8) posted to K. |
| I-29 | FIXED | The Why and Granted tables keep to their panel at 1440 (tighter cell padding; capability keys wrap between their parts; Environments and Revision ride under Scope and Access). At 1024 the Granted table still scrolls inside its wrapper: the fade shows it and the grant name stays put (sticky first column). |
| I-30 | NOT FIXED | The Why text for an allowed row is the published capability that allows it; a plain-language reason needs a published reason (CONTRACT, FE-015). |
| I-31 | FIXED | The V1 matrix is inside the page's flow (the empty band and the nested H2 are gone, the V1 sentence is in the head), the head says which workspace the page reads and that the grants are portal-wide ("their read takes no workspace, so the address does not change them": the read has no workspace parameter), the duplicate step-up chip is hidden, 660: the grid fits (word labels become icons, columns 54px). |
| I-32 | FIXED (part) | Toggles carry their word (See / Decide), header cells and toggles share one fixed-layout width (probe: headers sit over their cells), step-up shown once, a missing React key in the V1 header fixed. The role-preset segmented control and preset table stay typed ("Role preset: Not available", request 6): no published source. |
| I-33 | NOT FIXED | Honest: the relay is off and the catalogue states non-read tasks not enabled; the design's 13 ready would claim a relay that does not exist (EDGE_INPUT, B12). |
| I-34 | FIXED | Action sub-labels use the sans body role at 13px (they were mono). |
| I-35 | FIXED | The detail pane is the page's right column from 1101px up by the page's own query (the shared dock mode is an overlay up to 1500px, so at 1440 there was no pane): sticky, open on the first ready read, "Run local read" reachable; a ready read no longer prints the relay's "Not live because" sentence. The "(source: admin)" label is not drawn: the link sends no source parameter, so the label would say something untrue. |
| I-36 | NOT FIXED | Minor 1024/660 indent of one card label; the scroll at 1024 is 0 now. |
| I-37 | NOT MINE / NOT FIXED | Dates: WP-P. The roster is 123 generic accounts by design (scale and keyset tests), a renamed first nine broke the username ordering the tests rely on; the design's seven named accounts need a smaller fixture roster (WP-P). |
| I-38 | FIXED | "Showing 50 of 123 accounts"; filtered "Showing 1 of 1 matching accounts (123 in all)". |
| I-39 | NOT FIXED (part) | The Disable/Enable buttons are disabled with their reasons (not live); Invite stays a disabled control and so cannot wear the primary style. The 1024 scroll of the roster is a sticky-less cards table (shared). |
| I-40, I-41 | WP-D | Message sent to WP-D (ab6c0896703e1cf0d) with the evidence. |
| I-42 to I-45 | WP-D | Shell. |

Tests: cockpit 36 (presentation) and the cockpit suites 691, access 121, admin 113, users 281 (a 200-row scale test is time-bound and fails only when the machine load is above about 30), request 489, fixtureBff 440; hygiene (testHygiene, disabledReason, uxm10Css, titleAbsence, v2Hygiene) green after the V1-matrix stylesheet moved to `screens/access/manageGrid.css` (v2Hygiene allows only `.exec-*` classes in `v2/css`); `tsc --noEmit -p .` clean.

## 9. QA2 fixes (round 2, QA2_REVIEW_R3_2026-10-24.md; R3-nn ids)
Same method as section 8 (local stack, probes at 1440/1024/660). Measured at 1024: Users table 710 of 710 (no scroll; was 1046), Admin provenance 712 of 712 (was 787), Users columns State 125, Actions 124.

| Id | State | How |
|---|---|---|
| R3-09, R3-10 | NOT FIXED (fixture world, WP-P) | The page prints each fact from its own read; four fixture sources disagree (R2 review, approval-evidence, inbox row, history subject). Inbox row E to P lists exactly what the fixture must emit so criteria, diff, preview and capital come from one record per approval. Typed absences stay where a read publishes nothing. |
| R3-11 | FIXED (page) / NOT FIXED (data) | The R2 heading reads "R2 review . R1 approved" (it headed an R2 request with "R1 approved"). PENDING with quorum met and OVERDUE-but-needs-you rows are fixture data (same E to P row). |
| R3-12 | FIXED | The primary stays blue (dimmed) while off, and "Preview . not recorded" is printed beside the decision buttons. |
| R3-13 | WP-P | Session end date (world clock). |
| R3-14 | FIXED | An owner with no grants listed reads the empty-table sentence plus one: "You hold every capability through the owner anchor, not through a grant." Role preset stays one typed line (no source, request 6). |
| R3-15 | FIXED | "Decide at Live gate" reads "Not available yet" beside "Live decisions are closed on this build" (the capability fact stays `allowed`, the status follows the build). Archive rows stay "Not available yet": no published eligibility. |
| R3-16 | NOT FIXED (minor) | Capability keys are the published basis; the 36-character user id wraps into two even lines. |
| R3-17 | FIXED | The two panels are a stretched pair (equal height). |
| R3-19 | NOT FIXED (CONTRACT) | The "mode" box is free text because no read lists the `modes` registry; the pane now says so under the box; request to K posted. |
| R3-20 | NOT FIXED | Role preset (CONTRACT, request 6); the 123 generic accounts and date format are fixture/shared (WP-P). |
| R3-21 | WAITING | Will take Users, Manage grants and the signed-in person from the single roster after "WORLD-V1 sha" appears in LOG.md; inbox row E to P. |
| R3-23 | FIXED (Users, Admin) | Users 661 to 1100px: tighter cells, Revision left to the drawer (its first fact), wrapped inline reasons, the account and its action sticky if the table still scrolls: 710 of 710. Admin provenance wraps inside its panel. Operations is WP-B. |
| R3-25 | FIXED (Approvals) | "Go to the decision" is drawn only with a request selected. Operations' 9,005px is WP-B. |
| R3-18, R3-24, R3-26 | WP-P / WP-D | Relay-off scenario, search ellipsis, context bar. |

Tests: cockpit presentation 38, access 121 + 1, admin 114, users 281 (the 200-row search test now waits with SLOW, as the other large renders do: it failed at machine load above 15). tsc clean. `disabledReason.test.ts` fails on two buttons in `overview/Contributors.tsx` (WP-F1, not E).

## 10. QA3 round 4 (R3-02, R3-04, roster, ticket ids)

| QA3 | Status | What changed |
|---|---|---|
| R3-04 BLOCKER (one approval, three capital figures and two targets) | FIXED | `e2e/bffApprovalWorld.ts`: ONE record per approval id (portfolio id and name from the world's three native portfolios, the world's exact allocation as "current", a stated requested step, after = current + requested, 1-place weight, criteria 7 total / 5 or 6 met now / 7 after, quorum from the inbox row). The inbox title and `portfolio_id`, the R2 review (target, requested amount, capital rows, candidates), the capital preview, the evidence diff ("Allocated capital", "Criteria met"), the receipt-preview sentence, the evidence history subject and the history subjects all read it (`bffSimulated.ts` and a `// ===== WP-E` block in `review-manager.ts` `wpkApprovalEvidence`). The R2 Criteria panel states the counted criteria ("Criterion rows are not published. The evidence read counts 5 met now and 7 after approval.") instead of Not published beside a count. Registered in section 2d. Unit test `src/fixtureBff/approvalRecord.test.ts`. |
| R3-02 BLOCKER (Queue read / Read follow the wall clock) | FIXED | The Approvals chip prints the inbox envelope's own `read_at` (new `InboxResult.readAt`, parsed in `httpApi.listApprovals`; the preview's rebase layer sets it to the world clock), "Queue read time not published" without one; Decided today counts at that instant. The Profile & Access chip is now "Freshness not published" (the Access read publishes no time) and the stale-read line no longer prints a browser time. No `Date.now()` is used in a double body of mine. |
| People roster | FIXED (Manage grants) | In the positive world `policyAccounts` lists `PEOPLE` (bobby the owner, lan, minh, stan, hoa, tuan), the Users roster's people; the activity read answers for minh's world id. |
| Ticket ids FE-nnn in copy | FIXED in cockpit and Access tiles; PARTIAL elsewhere | `NOT_PUBLISHED`, `notPublishedFor`, FamilyPanel and the separation-of-duty line print "Not published" with no ticket id; the Access tile note lost "(FE-015)". Ids that remain sit in the shared `gapTitle` / `GapWhy` disclosures and visually hidden text (blocks, not mine). |
| Cmd K ('canary', 'Hoa', GET /search, FE-023) | WP-D | Not mine. |
