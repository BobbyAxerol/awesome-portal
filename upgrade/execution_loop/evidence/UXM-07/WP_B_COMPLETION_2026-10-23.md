# WP-B completion: Operations and Incident (2026-10-23)

Level FIXTURE_LAB for every simulated fact (register section 2b). Nothing here is acceptance evidence. Audit baseline: `PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md` sections 15 (22 elements) and 21 (13 elements), items A1, A5, B8, highlights `ops-drawer` and `operations-nq`.

## 1. What changed

- Rows visible. Cause 1: fixture instants (22 Aug) against the real clock. Fixed two ways: `FIXTURE_REBASE_TIME=1` now also shifts microsecond instants (the regex took 0 to 3 fraction places, so `op_TEST_ONLY_s01..s11` were not shifted); and with it OFF the screen counts a range back from the read's own `observed_at_ms` (a read stating no instant falls back to the clock) and says "This read was observed ..., more than a day ago" when the read is older than 24H. No instant is hard-coded.
- Fixture lane (`e2e/bffDoubleV2.ts`, opt-in `simulated`): `incident_links` on rows (five incidents, many to many), varied `delivery_state`/`display_state`, `open_exception_count` from open incidents, incident roots that agree with the links.
- Operations: subtitle, Source segment (All / Commands / Admin journal, URL `source=`), Exceptions tab (count from the server health count, list from the rows' incident links), Audit tab (workflow timestamps the rows publish, actor typed once), Next actions (Check original request, Display updating, Open obligations, Review), tab count, flags never wrap.
- Ops drawer: sections Intent, Receipt, Display (own provenance line and timestamps), Triage, Operation, Linked incidents (page link and Peek), the existing pending-control entry (only through the `pending-preview` mount).
- Incident: routed page `/execution/operations/incidents/:incidentId` (head, stepper, Evidence, Operations taken, Resolution gates, Timeline, Children and original targets, Actions); `?peek=1` keeps the drawer, which now offers "Open full page". One lazy import and one branch in `ExecutionPreviewRoute.tsx` (the V2 route table entry already existed).

## 2. Element table (audit section 15, Operations)

| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar | BLOCKED FILE_OWNED_BY_OTHER_WP (D) | request posted (inbox B to D) |
| 2 | Title + subtitle | DATA | "Commands, exceptions and audit" |
| 3 | Freshness chip | DATA | "Observed 22 Aug 13:00Z"; Fresh/Stale verdict not drawn (no published freshness) |
| 4 | Sidebar count badge | BLOCKED FILE_OWNED_BY_OTHER_WP (D) | request posted |
| 5 | KPI Unknown outcomes | DATA | server verification count |
| 6 | KPI Pending receipts | DATA | FE-CAT-2, fixture 15 on the populated lane |
| 7 | KPI Display catching up | DATA | FE-CAT-2, "at least" while some row did not report |
| 8 | KPI Open exceptions | DATA | fixture 3 (open incidents); typed Not published when the server omits it |
| 9 | Source health disclosure | DATA | unchanged |
| 10 | Tabs with Exceptions count | DATA | count is the server's |
| 11 | Lens | DATA | Mine stays disabled with its reason (FE-030) |
| 12 | Range | DATA | counts back from the read |
| 13 | Source All / Commands / Admin journal | DATA / TYPED | Admin journal selects a typed "publishes no rows (FE-021)" |
| 14 | Operation, Receipt, Display dropdowns | PARTIAL, BLOCKED CONTRACT | Operation = command key input; Receipt and Display filters need K request (2) |
| 15 | Command rows | DATA | 36 to 50 rows visible, rebase off |
| 16 | Intent column | TYPED | closed row schema; CONTRACT request (1) |
| 17 | Receipt column | DATA | flag plus source/verification words plus delivery axis |
| 18 | Display column | DATA / TYPED | CURRENT, CATCHING UP, STALE; null and omitted stay separate typed gaps |
| 19 | Next action | DATA | four actions from published axes |
| 20 | Footer "N shown" | DATA | "50 of 61 matching, 120 in scope" (server counts) |
| 21 | Counts by status | DATA | unchanged, same snapshot |
| 22 | Row selection to ops drawer | DATA | three sections, provenance, incidents, target |
| 24 (ops drawer) | Intent / Receipt / Display separate | DATA, Intent TYPED | |

Counts section 15: DATA 18, TYPED 2 (Intent, Admin journal), BLOCKED 3 (context bar and badge: D; Receipt/Display dropdowns: K) (one element, #14, is partial: Operation and the filters that exist).

## 3. Element table (audit section 21, Incident)

| # | Element | State | Note |
|---|---|---|---|
| 1 | Own page | DATA | routed; drawer kept as peek |
| 2 | Context bar | BLOCKED FILE_OWNED_BY_OTHER_WP (D) | |
| 3 | INCIDENT tag + title | DATA | title is the id: root publishes no title (typed in the request list) |
| 4 | Id, target link, assignee line | DATA / TYPED | assignee "No assignee published" (FE-030) |
| 5 | Freshness chip | DATA | Observed from `observed_at_ms` |
| 6 | Stepper | DATA | |
| 7 | Evidence per-source chips | TYPED | four chips, CONTRACT request (3) |
| 8 | Operations taken | DATA | many-to-many join over queue links; coverage sentence; original target typed |
| 9 | Resolution gates | DATA / TYPED | acknowledged and mitigated from root timestamps, assignee and dry-run typed, server verdict "not published" |
| 10 | Timeline | DATA / TYPED | root timestamps; actor and per-event version typed |
| 11 | Acknowledge / Assign to me | TYPED | disabled with reason |
| 12 | Record exposure mitigated / Attach dry-run evidence | TYPED | added, disabled with reason |
| 13 | Mark mitigated / resolved | TYPED | disabled with reason |
| extra | Children and original targets, receipts | TYPED / DATA | typed panel with ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED; receipt per linked op from delivery axis |

Counts section 21: DATA 7, DATA/TYPED 3, TYPED 5, BLOCKED 1 (context bar: D). Contract requests (inbox B to K): `intent_state`, `delivery_state`/`display_state` filters, incident children on the V2 root, operations by incident, audit feed.

## 4. Layout (chromium, `scripts/probe-operations-layout.mjs`, local vite plus fixture BFF populated/medium, rebase off)

| Measure | Before this change (audit shot, build without rows) | After |
|---|---|---|
| Document horizontal overflow, Commands / Exceptions / Audit / drawer / incident page, 1440 1280 1024 660 390 | not measured (zero rows) | 0 at every measured width |
| Table body font sizes | n/a | 13px (figures and words) and 11px (captions and meta): two roles, no stray size |
| Flags wrapped onto two lines | n/a | 36 at 1024 before `white-space: nowrap`, 0 after |
| Cells with content sticking out | n/a | 0 |
| KPI tiles sticking out | n/a | 0 |
| Table scroll region past the viewport (inside its own region) | n/a | commands: 0 at 1440 and 1280, +22 to +278 at 1024 (scrolls in its region); exceptions +87, audit +114 at 1024; 0 at 660 and 390 (cards) |
| Incident page text sizes | n/a | 13px (26), 12px (57), 11px (48), one 24px title; panel heads 11px (6) |

Not measured: a few runs (commands 1024, lens-all 1024 in the second pass, incident 390 in the first) reported `ERR_NETWORK_CHANGED` from the sandbox browser and returned no numbers; the first pass measured them (0 doc overflow). `scripts/layout-audit.mjs` does not exist in this tree, so the probe above is the measurement.

## 5. Tests

- `npx vitest run src/execution/v2/screens/operations`: 12 files before, with `wpb.test.tsx` 13 files, 258 tests (234 existing/updated plus 24 new).
- New `wpb.test.tsx` (24): rows and three facts, Next actions, health strip, Exceptions, Audit, Source, drawer sections, peek, incident page head/sections/many-to-many/gates/evidence/timeline/actions/failures/legacy shape/scan paging, pure views, URL round trip.
- Updated: `operations.test.tsx` (Lens group scope, window tests anchored on the read, drawer sections, three new read-anchor tests), `opsUrl.test.tsx`, `src/fixtureBff/queueHealthSimulated.test.ts` (9), `timeRebase.test.ts` (microsecond case).
- Hygiene green: `disabledReason`, `testHygiene`, `v2Hygiene`, `titleAbsence`, `uxm10Css`, `flagOn`, `flagOff`, `linkTargets`, `routeContract`, `commandRouting`.
- `npx playwright test -c playwright.pending-preview.config.ts --workers=1`: 3 passed.
- `npx tsc --noEmit -p .`: no error under `src/` (the roadmap-task-board tree reports missing modules because its node_modules is not installed in a worktree; not ours).

## 6. Not verified

No visual baseline (primary records them). Context bar and sidebar badge not touched (shell). Intent has no value anywhere (closed schema). The real queue and incident root were not read; every figure above is the double's.
