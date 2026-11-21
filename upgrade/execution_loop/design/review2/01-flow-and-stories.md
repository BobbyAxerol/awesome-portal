# Review 2 / 01 — Flows and stories: clear, complete, not redundant (critic read, 2026-10-18)

Read: README (D/S/UI/C/R), UXM-01, UXM-02, V1_SCREEN_REVIEW, V1_SUBSCREEN_DISPOSITION, hifi M01-M10, concepts C1-C4, guide §3-§5, §13-§14.
Method: link audit of the HIFI files (every `<a>` is `href="#"`, so targets are inferred from labels and from the design docs). Evidence cited as file/state.
Verdicts: clear = path exists and every step answers its question; unclear = path exists but a step, target or return is undefined; broken = dead end or missing screen.

## 1. Stories and verdicts

| # | Persona | Story ("As a ... I want ... so that ...") | Path | Verdict |
|---|---|---|---|---|
| M1 | Manager | check fund health in one glance, so I know if anything needs me today | M01 -> Needs attention -> M09 / M03 -> M05 | unclear: "All" and "Investigate" targets undefined (F3); stage screens have no HIFI (F12) |
| M2 | Manager | compare portfolios (and alphas) on one basis, so I can reallocate | M01 -> M02 -> M04 -> C2 Compare | unclear: Compare lives inside one Portfolio 360 only (F9) |
| M3 | Manager | grant / recall / retarget budget with a preview, so I never act blind | M04 Actions -> preview -> submit -> M09 receipt | clear; loops on Rejected/UNKNOWN (F7, F8) |
| M4 | Manager | approve or reject a researcher's archive request, so risk is wound down safely | M01 "Review ->" / M09 row / nav Approval Inbox / C4 | broken: no Approve/Reject on the M09 drawer, no Archive lane in C4 (F1) |
| M5 | Manager | find which alpha drags a portfolio and why | M04 Alphas -> M05 -> Deployments -> M07 / M06 | unclear: M04 rows and accounts are not links (F4); back label wrong (F6) |
| M6 | Manager | decide whether an archived alpha should come back | M08 -> Start reactivation review -> ? | broken: review has no screen, no owner queue (F2) |
| M7 | Manager | move an alpha R1 -> R2 -> Paper -> Sandbox -> Canary -> Live with evidence | Inbox/C4 -> Gate -> M07 stage screens -> Exit review | unclear: S2 (light full-review screens) vs C4 (cockpit is primary) (F10); M07 is a placeholder |
| R1 | Researcher | see how my alphas run, so I know if they work | M01 own slice -> M03 own -> M05 | clear (but 3 screens overlap, F14) |
| R2 | Researcher | understand why my score is Pending | M05 -> Explain drawer | clear |
| R3 | Researcher | request to stop my alpha, so risk is wound down | M05 "Request archive" -> form -> M09 "Your requests" -> M08 | broken: the request form (reason, evidence window, open obligations, guide §13 step 1-2) has no screen (F2) |
| R4 | Researcher | ask for a gate review when my alpha is ready, so it can advance | M05 / C3 spine "Open exit review" -> New Approval Request | unclear: no HIFI; entry only on the C3 concept (F12) |
| R5 | Researcher | watch my archived alpha's paper monitor and suggest reactivation | M08 -> M05 | unclear: UXM-02 draws "suggest reactivation", M10/M08 say "Managers start reviews" and the button is disabled with no alternative (F2) |
| O1 | Operator | resolve an UNKNOWN receipt without resending | M09 -> Check original request -> (outcome) -> ? | unclear: result states and next hop not drawn; targets are plain text (F3, F7) |
| O2 | Operator | clear a stale / unreconciled account | M09 Exceptions -> M06 Reconciliation -> fix -> Resolve | unclear: M06 has no remediation, M09 Resolve is a free action (F8) |
| O3 | Operator | follow a pending-drain archive to completion | M09 "Open obligations" -> M08 detail / M05 | unclear: link target undefined (F3) |
| V1 | Reviewer | decide the next request by SLA with evidence, with separation of duty | M09 chip / nav / M01 -> C4 -> decide -> next | unclear: three entries into one queue, C4 has no app nav (F10, F11) |
| V2 | Reviewer | reject with a note and get a receipt | C4 | clear |
| V3 | Reviewer | review waivers and exit reviews | nav Waivers / Exit Reviews | broken: no screen; C4 has no Waiver lane (F1, F12) |
| W1 | Viewer (read-all, no mutation, e.g. Stan-lite) | read fund status without risk of acting | M01-M06, M08 | clear |
| W2 | Any | learn why a control is disabled and how to get access | disabled control -> M10 "My access" | broken: only C4 has a "Why?" link; M03/M04/M08 show a title tooltip or a bare sentence (F5) |
| W3 | Any | land on the right first screen for my role | login -> ? | unclear: only Manager/Researcher modelled (F11) |

## 2. Findings

**F1. Approval taxonomy is split; some approvals have no deciding screen.** (broken)
- Problem: kinds of decision are gate (R1, R2, Exit, Live), capital approval (AP-1047/1042/1038 in M04 Approvals), archive, reactivation, waiver. C4 "one shell for every gate" has only lanes R1/R2/Exit/Live. M09 drawer for `ARCHIVE · Awaiting approval` shows three facts and "Nothing is archived until a receipt says so", with no Approve/Reject (m09 html l.103-110). Row `data-row="appr"` opens the UNKNOWN drawer (prototype bug, l.60). M09 row 11:30 links to "Approval Inbox" while row 13:58 says "Review request".
- Where: M09, C4, M04 Approvals tab, nav Governance.
- Impact: story M4 and V3 cannot be completed; F3 of UXM-02 (manager approves archive "in Operations & Decisions") has no UI.
- Fix: C4 lanes become decision kinds: Gate R1, R2, Exit, Live, Archive, Reactivation, Capital, Waiver. M09 and M01 only count and deep-link (`/decisions?kind=archive&id=`); no decide buttons outside the cockpit.

**F2. Archive / reactivation lifecycle has holes at both ends.**
- Problem: (a) "Request archive" (M05 header, C3 header) opens nothing: no form for reason, evidence window, open positions/orders, plan (guide §13.1-2). (b) M08 "Start reactivation review" leads nowhere; the "Review" column ("Under review") has no destination. (c) Researcher cannot even suggest reactivation (UXM-02 diagram vs D3/M10). (d) After submission nothing tells the researcher where to look (toast to "Your requests"). (e) D8 hides every archived alpha from Fleet, including `Archive requested` and `Pending drain` alphas that still hold positions; M05 would show them as ACTIVE with no lifecycle chip.
- Impact: R3/R5/M6 broken; a live-risk alpha can vanish from the screen that shows risk.
- Fix: design 2 drawers: Request archive (on M05, M08 row) and Reactivation review (on M08 and as a C4 lane). Fleet shows `Archive requested / Pending drain` with a lifecycle chip until drained; only `Archived` lives only in M08. Add "Suggest reactivation" for researchers (creates a manager-visible note, not a review).

**F3. Entities and IDs that should navigate are plain text.**
- Where and what: M09 Target column (Portfolio Canary, Account Binance-02, BTC-Trend v3) and exception targets; M01 digest items (C1); M05 `rc-8812` receipts, "Receipts 2"; M04 AP-/INC- ids, Activity rows, "Account" names in Accounts tab, alpha names in Alphas tab; M07 "1 unknown order · Operations" (unfiltered); M08 "Open obligations"; C2 ledger `cmd-7d41`; M06 other sleeves.
- Impact: dead ends everywhere the operator needs to pivot (O1-O3, M5).
- Fix: one ID-chip component (type icon + value) with a fixed target map: alpha -> M05, deployment -> M07, account/sleeve -> M06, portfolio -> M04, receipt/command -> shared Receipt drawer, incident -> M09 incident drawer, approval -> C4 request. Every chip is a link with the current context in the URL, and has a "Copy" affordance.

**F4. M04 -> M05 and M04 -> M06 are not wired.**
- Problem: F1/UXM-02 says Portfolio 360 is the route to Alpha 360 and Account 360. In the HIFI the Alphas-tab rows and the Accounts-tab physical accounts are plain text; the only link is "Open in Alpha Fleet" (portfolio filter), which drops the manager into a different screen and loses the "I came from Core" breadcrumb.
- Fix: make rows links; "Open in Alpha Fleet" stays as a secondary link; M05/M06 get a portfolio breadcrumb segment when entered from M04.

**F5. D9 (disabled + one-line reason + M10 link) is not implemented in the HIFI.**
- Problem: M03 peek "Recall" is `disabled title="No permission"` (tooltip is not accessible on touch/keyboard, no sentence, no link); M04 disabled actions have a reason but no link; M08 "Managers start reviews" has no link; M10 has no deep link target per capability; only C4 has "Why?". No "who can grant me this / request access" path in M10.
- Impact: W2 broken; Viewers and Researchers hit walls everywhere.
- Fix: shared `DisabledReason` component: label, one reason sentence (visible, not tooltip), "Why? / My access" link to `M10#cap=<capability>`; in M10 the matching row is highlighted and shows the grantor (owner) and "Ask Bobby/Stan" (mailto or in-app note). Add a user menu in the top bar ("My access") so M10 is not only a sidebar item.

**F6. Back-stack is label-fixed, not origin-aware.**
- Problem: M05 "<- Fleet results", M06 "<- Accounts", M07 "<- Alpha 360" are hard labels. M05 is reached from 6 places (M01 My alphas, M03, M04, M08, M09, C1 command bar), M06 from 4 (M04, M05, M07, C1). Back to a list only works for list -> detail. Peek selection (`sel`) and cursor are not promised to survive; a 409 cursor reset on return is not described.
- Fix: carry `from=` (route + serialized context) in the URL; back label reads "<- Portfolio Core", "<- Operations", etc.; browser Back must give the same result; on return restore filters, sort, `sel`, scroll; if the cursor is stale show the standard 409 sentence and keep the filters.

**F7. UNKNOWN / Rejected / Partial outcomes have no designed continuation.**
- Problem: "Check original request" has no result state in the HIFI (found Applied? Rejected? still unknown?). Rejected row "Review new preview" and Partial "Display updating" have no target. For a Rejected capital command the user must go back to M04 and re-find the portfolio and action, with the old amounts lost (F2 of UXM-02: capital actions start only in M04).
- Fix: show an outcome strip in the drawer (Found: Applied | Rejected | Still unknown at HH:MM). "Review new preview" deep-links to `M04?action=target&pf=..&prefill=cmd_id` with the previous values pre-filled and the conflict reason; "Check again" keeps the drawer open and shows last-checked time.

**F8. Exception "Resolve" can close a still-true problem; operator cannot remediate.**
- Problem: M09 exceptions (stale valuation, recall not released, display behind) have Acknowledge and Resolve. M06 Reconciliation is read-only (V1 dead "Sync now/Dry-run" removed, no replacement), no Admin Action link. Resolve needs no reason and may be clicked while the condition holds.
- Fix: Resolve requires a note; if the source condition still holds show a warning and keep the item as "Resolved - condition persists" (auto-reopen). Add a "Go to evidence" button (M06 tab, scoped) and an "Admin actions" entry only when the capability exists (else D9 reason).

**F9. Compare has no sensible entry point; ledger/flow placed per portfolio.**
- Problem: C2 puts Compare (2-4 portfolios or alphas) inside one Portfolio 360. A comparison of portfolios begins in M02, of alphas in M03; today you open Core and then search for other portfolios inside it.
- Fix: multi-select (checkbox) in M02/M03 -> "Compare N" -> `/compare?kind=portfolio&ids=`; M04 keeps only "Compare with ..." that pre-selects the current one. Capital flow stays in M04 (single-portfolio concept).

**F10. S2 vs C4 conflict: two review UIs.**
- Problem: S2 keeps V1 "Governance Light" screens for full review (Gate R1/R2/Live, Exit, Waivers). C4 says the cockpit is the primary experience and Gate/Exit pages become deep links into the same shell. Left unresolved this builds the review twice (light + dark), and C4 itself omits Waiver/Archive (F1).
- Fix: see Decision D-1. Recommended: one cockpit, one theme.

**F11. First-run landing and role model are incomplete.**
- Problem: the HIFI knows two states: Manager (Stan) and Researcher (asmith). Operator, Reviewer, Viewer are capability sets without a landing page. Researcher still sees the full sidebar (Accounts "Not shown", Approval Inbox, Waivers, Exit Reviews per M10) - entries that open an empty screen. C4 has no sidebar at all and a different header ("Governance / Decision cockpit", fixed persona "Lan"), so a reviewer cannot get to Execution or back to where they came from; M10 appears nowhere in C4 except the Why link.
- Fix (landing by capability, not by label): any `read-all` -> M01; own-slice only -> M01 "My overview"; has `decide` capability and nothing else -> Decisions cockpit; has `operations.read` and no read-all -> M09; nothing -> M10 with an explanation. Sidebar items are removed or collapsed per M10 "Not shown" rows (never shown-but-empty). Give C4 the same app shell and side nav.

**F12. HIFI coverage gaps break the end-to-end stories.**
- Problem: M07 is a placeholder ("Existing detail screen - unchanged"). Missing screens that stories depend on: Gate/Exit shell (S2/C4 partial), Waivers, New Approval Request, Paper Workbench, Sandbox cert, Canary/Live (shared header), Blotter with scope, Incident drawer, Admin actions, Request-archive and Reactivation drawers, Receipt drawer, `/administration/users` (Manage users and grants is "Allowed - STEP-UP" in M10 but has no screen). 20 of 30 V1 screens still have no V2 design (V1_SCREEN_REVIEW §6).
- Fix: mark each story's non-designed step explicitly in a "Flow coverage" table; do not close the flow review as approved until M7/M4/M6/R3/O1 each have every step drawn.

**F13. Vocabulary of "things that need me" is not unified.**
- Problem: M01 tags INCIDENT / OPERATION / APPROVAL; M09 splits Commands, Exceptions, Audit (no Incidents, no Decisions tab although S3 says "Operations | Decisions" and incidents open as drawer from M09); M04 has Incidents (INC-0318) and Approvals (AP-) as separate More tabs; M04/M05/M06 Activity use different columns. Seven ID schemes: AP-, EX-, INC-, cmd-, rcpt_, rc-, idem_.
- Impact: "Needs attention -> All" cannot land on one screen; a user cannot tell if "exception" and "incident" are the same.
- Fix: one noun set: Command (with receipt), Exception (system-found, open/ack/resolved), Incident = escalated Exception with a runbook, Decision (approval). One receipt id displayed (`receipt_ref`) with other ids in details. M09 tabs: Commands | Exceptions (incl. incidents) | Decisions (count + link to cockpit) | Audit.

**F14. Context (env, window, currency, scope, as-of, selection) is re-declared per screen and partly lost.**
- Problem: (a) every page owns its own env/window seg controls (hifi.js keeps `__win` only within a page); C1's single context bar is accepted but the per-page controls are not removed. (b) Defaults disagree: UXM-01 `window=30d`, UI3 90D, M01 renders 30D pressed with KPIs labelled "30D", hifi.js defaults to 90. (c) UXM-01 "Equity 30D never changes with window" vs UI3 "7D/30D/90D/ALL on every data cell"; ALL is not in the URL param list. (d) env (live/paper/sandbox) is a partition in M01/M02 but a stage filter in M03 (All/Live/Canary/Sandbox/Paper), and a domain toggle (Real-funded/Paper/Sandbox, D2) in M05; Canary sits inside env=live. M03 has no env control, so M01 env=paper then Fleet shows all 214. (e) M09 is fixed at "real-funded USDT, UTC+7, 24H" with no env/currency controls while its Source health lists three profiles; other screens print UTC. (f) Currency: only a "Switch basis" link in M02; no ccy in M01/M04 headers beyond a label. (g) As-of: C1 "As of: now" picker appears in one concept, but M09/M05 data can't be time-travelled. (h) Scope: C1 "Scope: All portfolios" - not in UXM-01 params and not reflected in M03's Portfolio filter or M09.
- Fix: one context contract: `env, window, ccy, scope, asof` in the URL, one bar (C1) mounted by the shell, per-screen overrides shown as a labelled chip ("this card: 30D fixed", M09 "24H"). Drop `as-of` unless a screen supports it. Define env <-> stage mapping once (env=live includes Canary & Live stages; Fleet reads env). Timezone: show UTC everywhere with a user-timezone toggle in the profile.

**F15. Capital actions leak outside M04 (contradiction with F2).**
- Problem: F2 says capital action starts only from M04, yet M03 peek has a "Recall" button (disabled in the sample, but the control exists), M05 Allocation events, and M06 budget rows could grow the same. A second entry point creates a second preview flow.
- Fix: replace the peek "Recall" with "Open in Portfolio 360 -> Actions" (portfolio and deployment pre-selected) or remove.

**F16. "Needs attention" -> "All" and the digest have no destination contract.**
- Problem: M01 panel mixes three object types; "All" is a link without a stated target. C1 digest ("Since your last visit") lists events with no links, and "Mark all seen" has no per-item state. Researcher M01 has no attention or request-status block at all, so the "my archive request was approved" news reaches the researcher only if the digest exists.
- Fix: "All" -> M09 with `tab=exceptions` + decisions count chip; digest items link to the ID-chip target; researcher M01 shows "My requests" (status chips) above My alphas.

**F17. Sparse (source not ready) state has no next step.**
- Problem: M01/M02/M04 in "Source not ready" show banners and Not available everywhere; the only thing possible is read identity. No link to Source health (M09) or "who is fixing it".
- Fix: banner links "Source health" (M09 panel) and shows last-qualified time; Operators see "Open source health", others see "Reported at HH:MM".

**F18. Duplicate approval and request tracking rows inside M09 sample.** (minor, clarity)
- The same BTC-Trend v3 archive request is shown at 13:58 in the Manager state and at 11:30 in the Researcher state (different time, different reference) - the review cannot tell whether the two views agree. A portfolio named "Canary" (pf_0003) collides with stage "Canary". Fix the sample data and add a type icon to entity names.

**F19. M05 has contradictory / repeated stage facts.**
- Research Evidence says params digest `MATCH`; the Regime Fit tab says deployed digest `77ab..e1` vs bound `9c1e..b7` = `MISMATCH`, regime "Not evaluated". Paper/Sandbox own-path table and the cross-stage table list the same stage periods twice; header stage chips + Deployments tab + C3 spine + Activity "Stage . Canary -> Live" + event ribbon all state stage history. Pick one place per fact (see §4).

## 3. Decisions Bobby must take

| ID | Question | Options | Recommendation and UX consequence |
|---|---|---|---|
| D-1 | One review UI or two (S2 vs C4)? | (a) Light legacy screens + cockpit; (b) cockpit only, in app theme; (c) cockpit for list, light page for detail | **(b)**: one theme, one URL (`/decisions/<id>`), every gate/exit/waiver/archive/reactivation is a lane. Users learn one screen; reviewers never see a second visual language. Cost: V1 light screens retired, tests rewritten. |
| D-2 | Which decision kinds does the cockpit own? | (a) Gates only (as drawn); (b) gates + archive + reactivation + capital approvals + waivers | **(b)**. Without it "approve an archive" has no screen (M4 broken). Manager's inbox becomes one queue sorted by SLA. |
| D-3 | Where are Approval Inbox / Waivers / Exit Reviews in the nav? | (a) keep 3 Governance items; (b) one "Decisions" item with kind filter + badge; M09 keeps only a count | **(b)**. Three nav items mean three ways into the same queue (F1/F13). One badge tells the reviewer where the work is. |
| D-4 | Landing per capability | (a) everybody M01; (b) capability-based landing (F11) | **(b)**. A reviewer-only or operator-only user otherwise opens a screen full of "Not shown". |
| D-5 | Context model | (a) per-screen controls (current HIFI); (b) one shell context bar (C1) with documented screen overrides | **(b)** plus: pick default window (30D per UXM-01 or 90D per UI3 - choose one, not both), define env<->stage, drop as-of if unsupported. Otherwise users re-pick the window on every hop and numbers differ silently. |
| D-6 | Fleet visibility of archive-in-progress (D8 refinement) | (a) archived + requested + pending-drain only in M08; (b) requested/pending-drain stay in Fleet with chip | **(b)**. Alphas with open obligations still carry risk; hiding them from the risk screen is unsafe. Fully `Archived` stays only in M08. |
| D-7 | Can a researcher suggest reactivation? | (a) No (D3 strict); (b) "Suggest" note visible to managers, no review created | **(b)**. Keeps D3 (managers own reviews) but gives the researcher a way to act on a recovered monitor (UXM-02 R5). |
| D-8 | Resolve semantics for exceptions | (a) free action (V1); (b) note required + auto-reopen if condition persists | **(b)**. Prevents closing a still-true problem; costs one extra field. |
| D-9 | Compare entry | (a) inside Portfolio 360 only; (b) multi-select in M02/M03 + deep link | **(b)** (F9). |
| D-10 | Back behaviour | (a) fixed label (current); (b) origin-aware back + restored list state | **(b)** (F6); requires `from` param in the URL contract. |
| D-11 | Is the 5-role model written down? | (a) only Manager/Researcher (guide §3.1); (b) add Operator, Reviewer, Viewer as capability bundles in M10 | **(b)**: M10 already lists capabilities; naming the bundles lets landing, nav and tests be role-driven. Needs P5 (field policy) approved first. |

## 4. Things to remove because redundant

1. Per-screen env/window segment controls once the C1 context bar ships (M01, M02, M03, M04, M05, M06). Keep only labelled local overrides (M09 24H, fixed-30D sparkline).
2. M01 "All performance rows" table: repeats NAV, PnL, Return, Drawdown and scores already in the KPI strip and Capital panel (3 renderings of the same numbers). Move definitions into a "What do these mean" tooltip or the metric dictionary.
3. M03 peek "Recall" button (F15); capital actions only from M04.
4. Separate nav items Approval Inbox, Waivers, Exit Reviews once the cockpit is chosen (D-3). Keep deep links for compatibility.
5. Three fleet visualisations: C1 heat map on M01, C3 Fleet board, M03 table. Keep Table | Board | Map as view modes inside M03; M01 gets one small link, not another fleet panel.
6. M05 duplicate stage statements: Paper/Sandbox "own path" table inside the cross-stage section (keep the cross-stage table), header stage chips (keep as "Where it runs" spine only), Activity stage events (keep as ribbon markers + the Decisions timeline, remove from the Deployments tab).
7. M05 "Bound run / params digest" block repeated in Performance, Research Evidence and Regime Fit - one "Bound run" card in Research Evidence, other tabs show a status chip linking to it.
8. Command history copies: M04 Configuration log + Activity + Approvals + Incidents tabs, C2 Capital ledger, M05 Activity & Decisions, M06 Audit, M09 Commands/Audit all show the same command events with different columns and ids. Keep one event model and one Receipt drawer; each screen shows a filtered view (ledger = capital events only).
9. "Open in Alpha Fleet" on M04 as the *primary* route to alphas (replace by row links, F4).
10. Researcher triplication: M01 "My alphas", M02 "My portfolios" and M03 Fleet (own) answer "how are my alphas doing". Keep M01 My alphas as the same component as M03 (not a separate table) and collapse M02 for researchers into a grouping option of M03.
11. Digest vs Needs attention vs M09 Audit: keep digest = history ("what changed"), attention = open items; remove resolved/applied rows from Needs attention and the "Applied" lines from the digest unless they are decisions about *my* requests.
12. C4 persona hard-coded in header ("Lan - Ops Approver") and its own header: replace with the shared shell/profile menu.
