# QA round 10 - final verification before freeze (2026-10-28)

- Reviewer: independent browser-acceptance reviewer, QA10
- Preview: http://127.0.0.1:8095 (FIXTURE lane, fixture banner present on every screen)
- Bundle: `index-DTcX2IC4.js` (confirmed with `curl http://127.0.0.1:8095/execution | grep index-`)
- Evidence: R11 tiles and shots (`.../scratchpad/r11/tiles`, `.../shots-r11`) viewed with Read; read-only Playwright probes (GET navigation, tab/lens clicks, Ctrl+K typing, no submit) saved under `.../scratchpad/q10/` (`txt/*.txt` = full page text of all 53 routes, `shot-*.png` = my extra captures, `crawl2.json` = 102 internal links followed).
- Scope: Task 1 (10 items) + Task 2 (53 routes text-scanned for "could not be read", "Unavailable", "Evidence incomplete", 4xx/5xx beyond the known retained-review 404; 102 links followed from every route; tiles read for overview, portfolios, fleet-table, alpha-360, compare-mixed, canary-dark, sandbox-mismatch, live-mismatch, approvals, replay).

## Task 1 - previous-round fixes

Result: 8 FIXED, 2 STILL OPEN.

| Id | Verdict | Evidence |
|---|---|---|
| N9a-01 sandbox-mismatch Grid D | FIXED | `sandbox-mismatch-1440-t01.png` y~540: STEPS PASSED "5 / 7", "1 failed · 1 unavailable"; Exit review card: "Step 4 failed. Step 7 is unavailable. 5 of 7 steps have passed." Steps tab: step 4 "Reconciliation clean" = FAIL, steps 1-3,5,6 PASS, 7 unavailable. Alpha 360 Grid D (`/deployments/alphas/alpha_d`): "SANDBOX · NOW ... 5 of 7 criteria met". Same number everywhere. |
| N9a-02 Operations from live-mismatch / live-gap | FIXED (with a new MAJOR, N10-M1) | Links resolve to `/execution/operations?target_id=dep_live_01_mismatch` and `..._gap`. Both pages render a LIST: 1 row "Reconcile · Real-funded · Error", receipt PARTIAL, display CURRENT, "1 of 1 matching · 120 in scope", Review button. No "Unavailable" panel (`q10/shot-opsmm.png`, `shot-opsgap.png`). Caveat: the row's target is `dep_live_01`, not the filtered target (N10-M1). |
| N9a-04 canary-dark | FIXED | `canary-dark-1440-t01.png`: runtime STOPPED, "Ended · 17 Oct 12:04Z", "Trial ended 17 Oct 12:04Z", Promotion decision card "Closed ... No promotion decision is offered from this record". Text scan: no Hold / Reduce / Rollback / Request scale buttons (only the word "rollback" in "Last rollback checks", marked HISTORICAL). Base canary room shows the same ended text. |
| N9a-05 alpha-replay-btc candles to as-of | STILL OPEN | Candles are no longer empty ("22 bars · 1h", `alpha-replay-btc-1440-t01.png`, `q10/shot-rbtc.png`), but (a) the plot shows ONE giant grey candle at the left edge plus one tiny blue bar, the other 21 bars are not drawn as candles; (b) the window is "16 Oct 15:00Z to 17 Oct 12:00Z", 11 days before the page as-of 28 Oct 12:04Z, x-axis has a single label "12:00"; (c) "0 of 1 fills in this window": the only fill (ord_00294, 28 Oct 11:21:33Z, 66,470.56) and the mark 66,470.50 are not on the chart; "11 events outside this window not drawn". The replay does not reach the as-of and cannot be read. |
| N9b-01 Portfolios register + Compare readable; Canary not HEALTHY | FIXED | `/deployments/portfolios`: 24 rows, no "could not be read"; Canary row (pf_TEST_ONLY_canary) health "DEGRADED"/"ATTENTION" tag, not HEALTHY (`portfolios-1440-t01.png`, `txt/portfolios.txt` l.128-140; Core = ATTENTION). Compare `pf_scale_001,pf_scale_006` and mixed `pf_TEST_ONLY_core,pf_TEST_ONLY_satellite` render with no Unavailable; mixed shows the honest typed message "Fewer than two picks share one basis ..." (`compare-mixed-1440-t01.png`). |
| N9b-02 closed AP-311, AP-152 print decided record | STILL OPEN | Decided record IS printed ("Closed: approved by bobby, 17 Oct 00:04Z. No decision is offered on a closed request."; Recorded table: DECISION approved / BY / AT). But on `/governance/approvals?sel=dec_AP-311&lens=closed` (`q10/shot-ap311.png`): amber banner "Evidence incomplete · 4 of 4 evidence branches not available · Live decisions are closed" and "3 obligations stay open after approval", "Read 28 Oct 12:04Z" under it, criteria card "6 met now and 7 after approval", "R1 lineage: Missing". On dec_AP-152 (R2 Basis B -> Core) and dec_AP-204 the text "N obligations stay open after approval", "Still open after approval", "Capital change preview ... AFTER APPROVAL" and "Evidence diff" are still printed for a request already approved. So both phrases the check forbids are still there ('after approval' on both; 'Evidence incomplete' on AP-311). |
| N9b-03 Alpha 360 Grid D defaults to Sandbox; toggle reaches Paper | FIXED | `/deployments/alphas/alpha_d`: "NET PNL, CURRENT Sandbox · dep_d1 +61.20 USDT", exposure 17,496.32, equity chart "Equity, Sandbox" 8,064.20; context bar Sandbox active. Clicking Paper (URL `?env=paper`) gives "Paper · dep_d2 -30.75 USDT", exposure 0.00, return -0.3075%. |
| Cmd K: carry, core, AP-352 | FIXED | Ctrl+K: "carry" = 8 results (alphas Carry 24 / Carry A, portfolio Carry Book 04, approvals); "core" = 5 results (approvals, Core, acc_bnc_core); "AP-352" = 1 result "Carry A -> Core R2". No "could not be read". Note: at 2.2 s the list still said "Searching"; results were there by 9 s (MINOR N10-m6). Results were not clicked. |
| Fleet link to alpha_e (Idea E) readable | FIXED for the page, no way in (N10-M3) | `/deployments/alphas/alpha_e` renders: "Idea E v0.1", "NOT SCORED · POLICY NOT SET", typed "Not available" stage rows and figures with reasons; no Unavailable panel. But no Fleet row, board card, map node or search hit links to it (see N10-M3). |
| Approvals: decided requests show no approve control | FIXED | Closed lens: for dec_AP-311 / EX-771 / AP-204 the only buttons are "Back to the queue", "Go to the decision", "Table", "Expand"; no Approve / Deny / Hold. (Footer key hint "A approve / R deny" is still printed, MINOR N10-m1.) |

## NEW BLOCKERS (1)

**N10-B1 - Closed approved requests print "Quorum at close 0 of N approvers" while the decision is "approved"**
- Screen: Approvals, Closed lens, every closed request checked: `?sel=dec_AP-311&lens=closed` ("0 of 1 approvers"), dec_AP-152 ("0 of 2"), dec_AP-204 ("0 of 2"), dec_EX-771 ("0 of 1").
- Evidence: `q10/shot-ap311.png`, right column, "Decision" card: "Closed: approved by bobby, 17 Oct 00:04Z" and, two lines below, "Quorum at close  0 of 1 approvers"; the same contradiction for the other three.
- Wrong: one fact (how many approvers approved) printed with two values on one card; a reader cannot tell if the request was validly decided. Fixture decided-record quorum is not populated from the decision (owner: P fixture world / E approvals; FIXTURE).

## NEW MAJOR (5)

**N10-M1 - Operations deep link filtered by a deployment lists a row for a different deployment** (WP B/P, FIXTURE). `/execution/operations?target_id=dep_live_01_mismatch` and `?target_id=dep_live_01_gap`: the Target chip says dep_live_01_mismatch / dep_live_01_gap, but the single row reads "Deployment dep_live_01 · Reconcile · inc_TEST_ONLY_fx_recon" (`q10/shot-opsmm.png`, `shot-opsgap.png`, row at y~640). Both links return the identical row, so the link lands on the wrong entity's operation.

**N10-M2 - Closed EX-771 (Grid D · dep_d2) lineage points to an approval of another alpha** (WP E, FIXTURE). Lineage table: "R1 AP-118, R2 AP-152". AP-152 is "R2 Basis B -> Core", approved 2 Sep by bobby, while Alpha 360 Grid D says R2 approved 13 Sep by lan (that is AP-204, "R2 Grid D -> Canary"). Same pattern: three different R2 requests all show "R1 REQUEST AP-101 ... Minh Pham, 5 Oct 2026" (dec_AP-204, dec_AP-152, EX-803 lineage differs). Facts do not tie across Approvals and Alpha 360.

**N10-M3 - Fleet "Research only 5" cannot be drilled into; Idea E (alpha_e) has no entry point** (WP A, FIXTURE/FE). The KPI card says RESEARCH ONLY 5, the table lists 69 alpha-in-portfolio rows, the Board and Map views and Ctrl+K "Idea E" ("Nothing matched") never show alpha_e. Page works only by typing the URL.

**N10-M4 - Overview card link to Fleet stage filter hits a 500 and shows an unexplained "STOPPED" chip** (WP F1/A, FIXTURE). Overview links `/deployments/live?stage=canary` -> `/deployments/alphas?stage=canary`. The request `GET /api/v1/execution/manager/fleet?environment=live&stage_filter=CANARY&group_by=health&limit=1` returns 500 `{"error":"FIXTURE_INTERNAL"}`; the Fleet header shows an amber "STOPPED" chip with "?" and "Start over" (`q10/shot-fleetcanary.png`, y~180) next to a table that did load (10 rows). "Start over" does not clear the filter. A user sees a stopped/error chip with no cause.

**N10-M5 - Alpha 360 for Grid D (alpha_d) prints "THE EXACT EQUITY SERIES COULD NOT BE READ (UPSTREAM_UNAVAILABLE ...)" in the Equity panel** (WP C, FIXTURE). `q10/ad2.png`: amber banner, all caps, raw error code, JSON-numbers jargon; the chart itself is drawn from daily closes (11 points, 1 gap) so it is a typed partial, but it is a 'could not be read' panel on a default-reachable Alpha 360 (503 on `/views/equity-chart`, also reproduced via Fleet board link `alpha_d?from=fleet`). Needs plain wording or a fixture that serves the series.

## MINOR (not counted)
- N10-m1 Approvals closed lens still prints the key hint "A approve / R deny / N note".
- N10-m2 Operations header pill "Source journal unavailable" next to "Read: Available" and "Source health 0 of 3 partial"; explained only inside the Source health drawer (audit journal integration).
- N10-m3 Admin Actions: status "UNAVAILABLE / RELAY OFF, kill switch engaged" while "6 of 24 can run now / READY TO RUN" for read actions.
- N10-m4 Overview "Open incidents at least 3" vs sidebar Operations badge 4 vs Operations "Open exceptions 4" (different nouns, no explanation).
- N10-m5 alpha-replay (Carry A) says "venue candles unavailable ... Trading System candles populated" in the same note as "No candles are drawn".
- N10-m6 Ctrl+K shows "Searching" for more than 2 s before results.
- N10-m7 Blotter deep links (`?deployment=dep_live_01|_mismatch|_gap|dep_canary_01&env=live`) answer 400 on `/api/v1/execution/screens/blotter` (second read) though the table shows the scoped rows; console noise.
- N10-m8 Alpha 360 Grid D with the Paper book selected: the "SANDBOX · NOW dep_d1 ... Allocated 8,000" header stays Sandbox while Net PnL/exposure show Paper dep_d2 (each labelled, never summed).

## What is good (keep)
- Stage pages now tie to Alpha 360 (5 of 7 on sandbox-mismatch vs Alpha 360; lifecycle sentence on every stage page: "published lifecycle has this alpha in ...").
- Ended / halted / stale / dark stages: Hold, Reduce, Rollback, Request scale, Halt, Emergency close, Submit and Request exit review are all DISABLED with a reason ("Not offered in the portal yet", "Blocked until every step passes", "Trial ended ... No promotion decision is offered"); canary-dark matches the base ended room.
- No time after the page as-of anywhere in the 53 pages except future schedule/expiry dates (exit review opens 8 Nov, step expiries).
- Typed absence everywhere (Not published: ..., Not available: ... with reasons); no "could not be read" in Overview, Fleet (3 views), Portfolios, Compare (3), Accounts, Account 360, Paper/Sandbox/Canary/Live and their states, Blotter, Approvals, New approval, Users, Profile & Access, Admin Actions.
- Portfolio register: Canary row correctly DEGRADED, mixed-basis portfolios flagged MIXED, 660px cards layout reads cleanly (`portfolios-660-t01.png`).
- Ctrl+K search works for alphas, portfolios, accounts, approvals; Closed approvals offer no decision control.
- Live mismatch: figures hidden while internal and broker disagree, with "Open finding" and "Open dry-run reconcile" both landing on usable pages; the incident page link works.
- Link crawl: 102 internal links (Overview cards, Fleet rows, portfolio / account / alpha / stage / approval / incident links) all opened; only the items above were flagged.

## What I could not check
- Real submit paths (approve, apply, promote, halt, request) - forbidden by the brief; I only verified they are disabled/absent.
- Full 342-link crawl: I deduplicated by URL pattern (4 samples per pattern) to 102 links; entity pages beyond the samples (e.g. each of 50 alphas / 65 accounts) were not each opened.
- Pixel comparison with the design JPGs for every route (only the screens named above were compared by eye); 1024 and 660 tiles were read only for portfolios and approvals, the rest of those widths relied on the R11 audit metrics, not my own viewing.
- Ctrl+K click-through of results (would navigate; not needed) and keyboard navigation inside the palette.
- Dark-theme / compact-density variants.
