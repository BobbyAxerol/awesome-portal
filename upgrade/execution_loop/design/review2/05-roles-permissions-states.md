# Review 2 / 05 - Roles, permissions, states, command lifecycle (critic, read-only, 2026-10-18)

Read: README, UXM-02, V1_SCREEN_REVIEW, sweep 02+05, guide v1.1 §3/§5/§14/§17, FRONTEND_HANDOFF §4, hifi m01-m10 (all three strip states), concepts c1-c4. Nothing run.
Legend: **F** full authorized, **S** own slice only, **RO** read-only, **-** not rendered, **(I)** inferred by me, no design exists, **?** needs Bobby. ✓ designed, ◐ cell/row only, ○ none.
Ground truth on roles: hifi strip has only **Manager / Source not ready / Researcher** (C4 relabels Manager as "Reviewer"). Guide §3.1 names 3 people (Bobby, Stan, Thanhvuong) and says enforcement is by capability, never persona label. Operator, Reviewer, Viewer, Admin exist only in V1 code/tests (`USER/ADMIN/OPERATOR/RISK_APPROVER`) and UXM-02 journey 3. So 4 of 6 requested columns are (I).
Structural defect: the sidebar is identical in every state (Researcher still sees Accounts, Approval Inbox, Waivers, Exit Reviews) while M10 says Researcher Accounts / R2 / Canary / Live = "Not shown". Nav must come from the same capability list as M10.

## 1. Role x screen matrix (SEE / DO)

| Screen / component | Manager (✓) | Researcher (✓) | Operator (I) | Reviewer (I; C4 ✓) | Viewer-restricted (I) | Owner/Admin (I) |
|---|---|---|---|---|---|---|
| M01 Overview | F. KPIs, Needs attention, Contributors, Portfolios. DO: drill only | S "My overview": 3 KPIs, My alphas. No Needs attention, no env switch, no totals | F? attention+ops; money ? | F? (R2 needs fund context) | RO, scope ? | F |
| M02 Portfolios | F list, totals, Columns. Export off | S "My portfolios", 1 row, no search/filter/Columns/totals/Unallocated | RO health, money ? | RO F? | RO | F |
| M03 Fleet | F tabs+counts, Owner, Group, peek. DO: Open Alpha 360 | S own rows only; no tabs/counts/Owner/Group/"Showing x of N". Peek still has disabled **Recall** | RO | RO | RO | F |
| M04 Portfolio 360 | F 7 tabs. DO: Actions drawer (grant/recall/target), Report pack | S "your slice": 3 KPIs + Alphas tab only; no Actions, no Report pack | RO Activity/Incidents | RO + Approvals tab | RO | F + Actions |
| M05 Alpha 360 | F. DO: Explain; **no Archive button exists** | S own alpha; Score rows "Not shown to your role". DO: Request archive | RO | RO evidence | RO | F |
| M06 Account 360 | F incl. Physical binding | **Contradiction**: sleeve ledger + PM capital shown, native "Not shown to your role", but M10 says Accounts "Not shown" | F recon/sync | - ? | RO | F |
| M07 Deployment header | F, links Alpha/Account 360 | KPIs; Account link replaced by "Account not available" | F | RO | RO | F |
| M08 Archived | F, tabs, Start reactivation review | S own ("Alphas you own"), no tabs/Owner/count. Review disabled | RO | RO | RO | F |
| M09 Operations | F: Commands/Exceptions/Audit, lenses incl. "Needs my approval". DO: Check original, Review request, Ack/Resolve | S "Your requests": own rows, Exceptions "No open exceptions", own Audit, no Source health | F. DO: Check original, Ack/Resolve | F? Decisions lens | RO | F + Resolve |
| M10 Profile & Access | self-view + Manage users (STEP-UP) | self-view, no grant mgmt | self-view | self-view | self-view | self-view + owner grid (V1) |
| Inbox / New request / Waivers / Exit review (**not in hifi**) | F; decide per grant | "Your requests" (R1 only per M10) | ? | F decide | RO | F |
| Gates R1/R2/Live via C4 cockpit | F if grant | RO own requests only (1 of 4 queue items) | - ? | F decide per grant | RO | F per grant |
| Admin Actions (**not in hifi**) | RO catalogue | - (403 denied) | R0 reads; two-man key | - | RO + "Viewer" banner | F; step-up |
| C1 Command bar ⌘K | F search, jump, Action "Request archive..." | **Not designed.** Sample list holds peers, ops, approvals | server-scoped (I) | scoped (I) | scoped (I) | F |
| C1 Context bar | env, window, "Scope: All portfolios" | Scope must lock to "Your slice"; **not designed** | same | same | same | same |
| C1 Digest | F "Since your last visit" | **Not designed**; own events only | ops events | decisions | ? | F |
| C1 Heat map | F (size = allocation, color = health) | **Leak**: size is share-of-whole of hidden peers; must not render | - | - | ? | F |
| C2 Capital flow / Compare | F, 2-4 items | ✓ banner "Capital flow and compare are manager views." (tabs still shown?) | - | - | ? | F |
| C3 Spine / Board / Ribbon | F; Board All owners/Mine | Own only; **bug**: "Open exit review" primary stays visible; no lane totals | RO | RO | RO | F |
| C4 Cockpit | queue by SLA, approve/reject, receipt preview | ✓ queue filtered to own, read-only "Reviewers decide this request." | - | F decide | RO | F |

Field-policy §3.2 still **undecided** and visible in hifi: (a) absolute money for researcher: M01 "My allocation 120,000", M02/M04 200,000 (same alpha, different numbers), M03 Allocation/Net PnL/Unrealized/**Balance** 132,980, M06 sleeve balance 88,200, budget 80,000/100,000 - §3.2 default is "not exported unless policy allows"; (b) D7 real portfolio name vs "your slice" (M04 shows `pf_0001 · Live · your slice`, name "Core" in h1); (c) ranking denominator (Score is Pending so untested); (d) export grant (3 different copies, §2 below); (e) temporal ownership (who sees archived alphas after owner change); (f) whether Researcher sees approver identity on their request; (g) Viewer scope.

### 1b. Actions: who, disabled copy, link target

Rule to adopt (D9 + info-leak): hide what a role must not know exists (nav, tabs, peers); disable with reason what is visible but not doable. Permission reasons link to **M10 "What you can do"** (`/administration/profile-access#do`, link text "Why?"); state reasons link to the blocking object. Only C4 has a "Why?" link today.

| Action | Allowed | Disabled copy (exact) / where it exists | Link | Status |
|---|---|---|---|---|
| Grant / Recall / Set target (M04) | Manager with `budget.adjust` | Researcher: button absent. Propose "Manager action." (M10 copy). Source not ready: "Source not ready" (✓ M04) | M10#do | ◐ no link |
| Return capital / Lock / Deploy | Manager w/ cap | "Open obligations: recall pending" / "Not offered in the portal yet" / "Your role does not include this" (✓ M04, inline text only) | M10#do; obligations -> M09 row | ◐ |
| Fleet peek "Recall" | none (F2: capital actions start in M04) | title="No permission" - **remove button**; if kept: "Capital actions start in Portfolio 360." | M04 | ✗ contradicts F2 |
| Submit command (M04 confirm) | Manager | none designed for step-up/second approver/revoked/offline; see §4 | - | ✗ |
| Request archive (M05, C3, C1) | Researcher, own alpha | tooltip-only "A manager approves it in Operations" (invisible on touch). Add inline line. After sent: "Archive already requested." | M09 row | ◐ |
| Archive (manager-initiated) | Manager, 2nd person approves (M10) | **No entry point anywhere** (guide §13 flow has no button) | - | ✗ |
| Withdraw own archive request | Researcher | **Not designed**. Propose "Withdraw request" while Awaiting approval | M09 | ✗ |
| Review request (M09) | Manager, not requester | Propose "You requested this. Another manager decides." | M10#do | ✗ |
| Start reactivation review (M08) | Manager | Researcher: "Managers start reviews" (✓ text, no link) | M10#do | ◐ |
| Check original request | Operator, Manager, Admin | Researcher has none (their row says "No receipt"). Propose "Only operators can check receipts." | M10#do | ◐ |
| Send again | nobody while UNKNOWN | "Send again is blocked until the outcome is known." (✓ M09) | scroll to Check original | ✓ |
| Acknowledge / Resolve (M09) | Operator, Admin | Resolve disabled with **no reason** in 3 places. Propose "Acknowledge first." / "Resolve is blocked until the outcome is known." / "Admin only." V1 hides footer for non-Admin: contradicts D9 | M10#do | ✗ |
| Approve / Reject (C4) | Reviewer with grant | "You created this request." (+Why?) / "Reviewers decide this request." (+Why?) / "Blocked: {blocker}." (no link) / "Evidence not published." / "Decision recorded. It cannot be edited." (✓ c4 `can()`) | Why? -> M10; blocker -> evidence row | ◐ |
| Approve w/ condition, Request changes, Deny, Extend +14d | Reviewer | **Missing from C4** (only Approve/Reject/Note). V1 has all as "Other decisions" | - | ✗ |
| Approve Live | Reviewer, dual + step-up | V1: hard-locked "closed on this build". C4 enables it (AP-410) | M10#do | ✗ conflict |
| Export | grant | M02 "Needs an export grant"; M03 "Export is not available yet"; M10 "Export is not built yet"; M04 none. One copy needed (§5 D11) | M10#do | ✗ |
| Manage users and grants | Admin/Manager, step-up | "Another administrator does it." (own rights); Researcher "Not part of your role." (✓ M10) | - | ◐ |
| Mark all seen (digest) | everyone | n/a (per-user, harmless) | - | ○ |

## 2. State coverage matrix

Hifi strip gives only healthy / "Source not ready" (=unavailable) / researcher (=denied+slice). `Loading` existed in lowfi and was dropped in hifi. FRONTEND_HANDOFF §4: loading/empty/partial/stale/denied/unavailable/terminal must never merge.
Cols: 01 02 03 04 05 06 07 08 09 10 | C1 C2 C3 C4 (M-screens then concepts). ● whole-screen designed, ◐ row/chip only, ○ none.

| State | 01 02 03 04 05 06 07 08 09 10 | C1 C2 C3 C4 | Where designed / note |
|---|---|---|---|
| loading | ○○○○○○○○○○ | ○○○○ | none in hifi |
| empty (true zero) | ○◐○○○○○○◐○ | ○○○○ | M09 "No open exceptions", M02 "None published" |
| partial | ○○◐◐◐○○◐◐○ | ◐○◐◐ | rows "Not published", "10D of 30D", "9-day gap", Partial receipt |
| stale | ◐○◐◐○●●◐◐○ | ◐○○◐ | chips "Stale 14m/3h"; no whole-screen "last good" banner |
| denied | ○○○○○◐◐○○● | ○◐○● | M10 grid; M06/M07 "Not shown"; C4 read-only; **no URL-level denied page** |
| unavailable | ●●●●●●●●●● | ○●●● | "Source not ready" strip state; C1 ignores it |
| terminal (hard failure) | ○○○○○○○○○○ | ○○○○ | none |
| authorized-empty | ○○○○○○○○○○ | ○○○○ | researcher with 0 alphas undistinguishable from denied |
| revoked | ○○○○○○○○○○ | ○○○○ | none (guide §3.2, UX-F03) |
| replaying / resync | ○○○○○○○○○○ | ○○○○ | chips say only "Fresh/Stale" |
| insufficient evidence | ◐◐◐◐●○○◐○○ | ○○○◐ | "Pending", "INSUFFICIENT DATA", "Not available" |
| UNKNOWN outcome | ○○○◐○○◐◐●○ | ◐○○○ | M09 drawer is the only full design |
| UNCERTAIN / abandoned | ○○○○○○○○○○ | ○○○○ | C4 receipt has only Preview/Recorded |
| DUPLICATE / replay | ○○○○○○○○○○ | ○○○○ | none |
| retained read-only | ○○○○○○○○○○ | ○○○○ | none |
| session expired | ○○○○○○○○○◐ | ○○○○ | M10 "Ends in 7h 12m" only |
| source lost | ○○○○○○○○○○ | ○○○○ | V1 Command Center has it; V2 dropped |
| MISMATCH / guarded | ○○○○○◐○○○○ | ○○○○ | M06 banner "Native figures are not sleeve capital." only |

Exact copy for the missing cells (English, short; `{}` = filled by data; never show 0 or a dash):

| State | Copy | Placement / link |
|---|---|---|
| loading | "Loading {screen}..." + skeleton rows; KPI shows blank bar, never 0 | in-place; keeps context bar |
| empty | M03 "No alphas match these filters." [Clear all]; M08 "No archived alphas."; M09 "No commands in {window}." | table body |
| authorized-empty | "Nothing here yet. You have no alphas in this view." Must differ from denied and never say "0 of N" | M01/M03/M08 body |
| denied (URL) | "You can't open this page." + "See what you can access" | M10#see |
| terminal | "Could not load {screen}. Request ID {id}." [Try again] | full panel (CLAUDE.md U07 request-ID rule) |
| partial (screen) | "Some figures are missing. {n} of {m} sources reported." | banner above KPIs |
| stale (screen) | "Showing data as of {hh:mmZ}. Source has not updated for {age}." | banner, last good kept |
| revoked | "Your access changed. Restricted data was removed from this page." | banner + M10#see; clear caches |
| replaying / resync | "Catching up. Live updates resumed from {hh:mmZ}; figures may shift." | chip next to Fresh |
| insufficient | "Not enough data yet ({n} of {m} days)." | cell reason line |
| UNCERTAIN | "We could not confirm this. It may have applied. Check the original request before doing anything." | drawer banner, [Check original request] |
| abandoned | "Stopped waiting for confirmation. Nothing is assumed. Check the original request." | same |
| DUPLICATE | "Already sent. Showing the original result." (create: "A request for this already exists: {AP-id}.") | link to original receipt |
| retained read-only | "Showing saved data. Read-only until you refresh." | pill + [Refresh] |
| session expired | "Your session expired. Sign in to continue. Nothing was sent." | modal, preserves URL |
| source lost | "Live link lost. Showing data as of {hh:mmZ}." | chip red + banner |
| MISMATCH | "Internal and broker figures disagree by {x}. Chart hidden until reconciled." | replaces chart (V1 rule) |

## 3. Command / receipt lifecycle (guide §14: transport / authoritative / projection / venue are four independent facts)

| Step | Receipt chip | Reconciliation chip | Allowed next | Appears in | Designed? |
|---|---|---|---|---|---|
| Preview | "PREVIEW - NOT APPLIED" | n/a | Submit, Cancel | M04 drawer; C4 "Preview - not recorded"; M09 "Preview only" row (G1: backend may not keep it) | ✓ |
| Submitting (transport) | none yet | none | wait; button locked, aria-busy | M04 strip "Request sent -> Receipt -> Read side current" is static | ◐ |
| Accepted (202) | Accepted | Catching up | wait; not success | M04 Activity "Accepted / Catching up" | ◐ |
| Applied | Applied hh:mm | Current | Copy references | M09 root row + effect table | ✓ |
| Applied, display lag | Applied | Catching up | none, no resend; "Display updating" | M09 row 12:10 | ✓ |
| Partial | Partial | Catching up | Acknowledge; Resolve off | M09 RECALL_PARTIAL amounts | ✓ |
| Pending drain | Pending drain | Current | Open obligations | M09 ARCHIVE row | ✓ |
| Rejected | Rejected + reason | Current | Review new preview | M09 "Version conflict" | ◐ no 409 copy |
| Timeout / unknown | UNKNOWN | Reconciling | Check original request; Send again off | M09 drawer, M04 "Outcome unknown", M07 "1 unknown order" | ✓ |
| Check original -> result | becomes Applied/Rejected, or "Not found" | - | Send again only after "Not found" | **no result state** | ✗ |
| Duplicate -> replay | "Replayed" + original receipt_ref | same as original | open original | none | ✗ |
| Uncertain / abandoned | UNCERTAIN / Abandoned | - | Check original | none | ✗ |
| Decision recorded (gate) | Recorded rcpt_x | - | none, immutable | C4 rail | ✓ |

Gaps: the receipt is only designed for capital commands (M09/M04) and gate decisions (C4); archive request and reactivation have no receipt chain beyond "No receipt / Nothing is archived until a receipt says so." Preview rows are hidden for Researcher.

## 4. Separation of duty, quorum, step-up

| Rule (source) | How UI should show | Designed? |
|---|---|---|
| Creator may not approve own request (V1 R1 "SELF_APPROVAL"; Exit "requester cannot decide"; R2 "plan author cannot sole-approve") | Rail line "✕ Separation of duty: you created this request" + disabled Approve with copy | ✓ C4 |
| Tests say **Deny is allowed for the author**; C4 disables Reject too | Allow "Withdraw/Deny" for author, block Approve | ✗ conflict |
| Quorum n of m (R1/R2/Live 2, Exit 1) | Squares "Quorum ■□ 1 of 2", queue "0 of 2 approvers" | ✓ C4 |
| Who approved first, "waiting for second approver", same person cannot approve twice | Propose "Needs a second approver. 1 of 2 so far." and "You already approved this." | ✗ |
| Archive needs a second person (M10) and requester != approver (M09 "Needs my approval") | Same rail block in M09 drawer | ✗ |
| Step-up per risk tier R1-R4 (V1: R2-R4 fresh auth + 2nd approver; R4 security key; emergency close types CLOSE; OPERATOR needs single-use admin key; "Manage users" STEP-UP REQUIRED) | Only a tag "STEP-UP REQUIRED" (M10) and the words "step-up required" in C4 effect row. No prompt, verifying, passed, expired, failed states | ✗ |
| Live gate: dual approval + step-up, but V1 closed by design | Disabled with "Live decisions are closed on this build." | ✗ C4 enables |
| No self-elevation, ceiling "up to the access you hold" | ✓ M10 rows | ✓ |
| Visibility never grants action ("Seeing is not deciding.") | ✓ M10 | ✓ |
| R2 needs valid R1 (expired/denied/pending/missing) | Disabled "R1 is {state}. Decide R1 first." -> R1 link | ✗ not in C4 |
| Revoked mid-panel (guide §14) | Server re-check; "Your access changed. Nothing was sent." | ✗ |

Proposed step-up block (in command drawer and C4 rail, above Submit): states `required` "Confirm it's you before sending." -> `verifying` "Waiting for your security key..." -> `passed` "Confirmed for 5 min." -> `failed` "Confirmation failed. Nothing was sent." -> `expired` "Confirmation expired. Confirm again." Needs backend (profile-access v2 step-up is in sweep 06 missing list).

## 5. Decisions Bobby must take

| # | Decision | Options | Recommendation | UX consequence |
|---|---|---|---|---|
| D10 | Researcher absolute money (§3.2) | a) hide all amounts, show % of own allocation; b) own allocation + own PnL only; c) as hifi (also Balance, sleeve ledger, budget) | **b** | Drop M03 Balance + Unrealized-balance, M06 ledger/PM capital for researcher; fix 120k vs 200k sample numbers |
| D11 | Researcher and Accounts | a) hide Accounts + M06/M07 links; b) sleeve-only view | **a** (matches M10) | Delete M06 researcher variant, remove nav item, deep link shows denied page |
| D12 | Role model | a) 6 role labels; b) capabilities with presets; Operator/Reviewer/Viewer as presets | **b** | Strip needs Operator/Reviewer/Viewer states, M10 lists capabilities; nav generated from capabilities |
| D13 | Hide vs disable | rule in §1b | **adopt** | Remove Fleet Recall; show disabled Actions to Researcher; V1 incident footer no longer hidden for non-Admin |
| D14 | Step-up UI | a) inline block in drawer/rail; b) separate page; c) login-time only | **a** | New component with 5 states; backend step-up endpoint |
| D15 | Live gate on build | a) closed with reason; b) open dual + step-up | **a** until backend opens | Fix C4 AP-410 to disabled "Live decisions are closed on this build." |
| D16 | Author on own request | a) block all verbs (C4); b) allow Deny/Withdraw (tests) | **b** (follow tests) | Reject becomes "Withdraw" for creator |
| D17 | Cockpit verbs | a) Approve/Reject; b) add "Other decisions" (condition, request changes, deny, extend) | **b** | Verb menu + condition composer in rail; note rule per verb |
| D18 | Researcher view of C1 | heat map hidden; command bar server-scoped, same "No result" for hidden and absent; digest own events | **adopt** | Add researcher states to c1; no client filtering |
| D19 | Researcher sees reviewer identity/notes | a) names + notes; b) note + "A manager"; c) status only | **b** | M09 researcher drawer gains decision note; names redacted |
| D20 | Export copy | one copy until built: "Export is not available yet."; later "Needs an export grant." | **adopt** | Same string on M02, M03, M04, M10 with M10#do link |
| D21 | Temporal ownership | a) effective-now only; b) as-of history | **a** | Former owner loses archived row; attribution stays for managers only |
| D22 | Withdraw / cancel request | allow while Awaiting approval | **yes** | Button in M05 + M09 researcher drawer; receipt "Withdrawn" |
