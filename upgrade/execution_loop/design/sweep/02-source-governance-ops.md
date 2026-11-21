# Sweep 02 - Source read: Command Center, Ops/Incident, Governance, Admin drawer

Read-only sweep, branch claude/fe-parity, 2026-10-18. Every line of the 12 screens, `containers.tsx`, `profileContainers.tsx` and the components they open was read. Nothing else was touched.

Path prefixes: `S/` = `apps/portal/frontend/src/execution/screens/`, `C/` = `.../execution/components/`, `X/` = `.../execution/`.
Reach codes: **URL** = reachable by route alone, **URL?p** = needs a query param, **CLICK** = needs interaction, **DATA** = only when the server data/state says so, **LAB** = `/execution/_fixtures` or injected `demo` prop only (never product), **DEAD** = exported but mounted nowhere in product.
Kinds: tab, view, drawer, dialog, popover, disclosure, form, action, state, link (deep-link param), live (poll/SSE/clock), key (keyboard).

Headline facts: (1) none of the 12 screens has a tab strip or a modal. Sub-views are disclosures, a side rail, a detail pane, a menu. (2) Only these params are read: `workspace_id`, `operation`, `cmd`, `action`+`binding`, `alpha`+`run`+`claim`. Every filter, lane, chip and cursor is local React state, so none survives reload or can be linked. (3) Routes (registry): `/execution`, `/execution/operations`, `/execution/operations/incidents/:incidentId`, `/governance/approvals`, `/governance/approvals/new`, `/governance/approvals/:id/{r1,r2,live}`, `/governance/exit-reviews/:reviewId`, `/governance/waivers`, `/administration/actions` (`X/ExecutionPreviewRoute.tsx:292-392`). All mount inside `PreviewFrame` (banner + Inspector details + retained remount, `:108-165`).
Shell layers on every screen: `PreviewBanner` Details and Inspector disclosures (`X/ExecutionPreviewRoute.tsx:119,125`); a server note when the screen contract is not AVAILABLE (`:402`); `RetainedPill` popover role=dialog with Refresh (`X/RetainedBanner.tsx:53-76`).

## 1. Command Center (`/execution`) - `S/CommandCenter.tsx` + container `S/profileContainers.tsx:141`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| CC | Container loading/denied/unavailable/stale; "snapshot could not be read" | state | URL | GET `/compositions/command-center` | whole screen is only h1 + PanelState on any non-ok | profileContainers.tsx:162-178 |
| CC | Masthead "Good morning, {name}" or "Command Center"; N CRITICAL chip; BUSY n / QUIET chip | state | URL | snapshot.needsYou + actor | triage headline | CommandCenter.tsx:385-387 |
| CC | SESSION EXPIRED / SOURCE LOST badge + red alert line (last good as_of) | state | DATA (live phase) | SSE reducer | stream failure, values stay as read | :358-370 |
| CC | Stream line variants: "no stream published - snapshot only", "Live - freshness . phase", "published - not connected" | state | URL / DATA | `snapshot.stream_available` | stream status | :365-379, commandCenter.ts:376-391 |
| CC | Revision beat pip + `as_of` + "age m:ss" ticking | live | DATA (beat on as_of change; age only if motion allowed) | 1s interval, not under webdriver/reduced-motion/_fixtures | freshness | :330-342, :390-391 |
| CC | SSE EventSource `/api/v1/execution/command-center/stream` | live | DATA: only when `stream_available` + factory + retained absent | resume via GET `/command-center/realtime-snapshot` (v2 schema, 4xx = SNAPSHOT_FAILED) | live deltas, gap/epoch resnapshot, auth.expiring, backpressure 250ms/8 | commandCenterStream.ts:59-125, sse.ts:259-411, profileContainers.tsx:104-137 |
| CC | Composition re-read every 15 s (keepValue, stops while retained or tab hidden) | live | URL | `usePollTick(15000)` | revision beat | profileContainers.tsx:143,150, useRevision.ts:45 |
| CC | Source-health board: 3 chips, worst-of state, 9-col table, loading, read notes | view | URL | composition.sourceHealthEnvelope | per-profile source health | profileContainers.tsx:184-198, C/DerivationTile.tsx:182-235 |
| CC | Needs-you panel: ranked rows (rank, kind, title, summary, SLA clock + meter bar, "action ->") | view | URL | needs_you.items | triage queue | CommandCenter.tsx:145-169, :112-143 |
| CC | Row click -> `navigate(canonicalHref(item.href))`; row disabled with tooltip when no href | action | CLICK | server href | opens owning screen | :115-123, containers.tsx:1549 |
| CC | Needs-you state variants: PanelState (non-ok), "Nothing needs you" quiet block, truncated note "N of ~M seen" | state | DATA | counts.truncated / exact_total | honest counts | :150-166, commandCenter.ts:145-161 |
| CC | SLA clock: OVERDUE +mm:ss counts up, DUE SOON, ON TRACK, no-SLA text | live | DATA | sla_due_at vs read_at + 1s tick | breach visibility | :95-110 |
| CC | Fleet health cells (label, value or "not published") + footer says "cells link to their stage list" | view | URL | fleet_health.cells | counts | :171-204; **cells are plain divs, `cell.href` never rendered (footer claim is false)** |
| CC | Promotion pipeline: funnel (CountUp animation), alpha x stage matrix, alpha link per row, "current" cells, note | view | DATA (fleet read ok) | GET `/alphas?limit=50` once, fleetPipeline (cap 12 rows) | stage distribution | :280-323, fleetPipeline.ts:16-60; failed read = panel silently omitted (profileContainers.tsx:154,199) |
| CC | CrossEvidence block (authority line, source health, canary twin, journal `<details>`) | disclosure | URL | composition | why controls are dark | profileContainers.tsx:200, C/CrossEvidence.tsx:141-165 |
| CC | Today list: kind + link; CONDITION_EXPIRY forced to `/governance/waivers` | view | URL | today.items | schedule | :206-230 |

## 2. Operations Queue (`/execution/operations[?operation=op_x&workspace_id]`) - `S/OperationsQueue.tsx` + `containers.tsx:1163`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| OQ | Masthead chip "N NEED ATTENTION" / "NOTHING STUCK"; live label (source state . profile) | state | URL | queue.sourceIntegrationState | headline | OperationsQueue.tsx:331-336 |
| OQ | Sub line: counts, "profile fixture - Portal-authored triage records" | state | DATA | queue.deliveryProfile | provenance | :337-353 |
| OQ | 4 KPI tiles (In this view, Total, Need attention, PARTIAL) with "not published" | view | URL | page counts | summary | :368-376 |
| OQ | Filter chips Needs attention / Mine / All retained (server-side, local state, resets cursor + selection) | action | CLICK | `triage_state=UNACKNOWLEDGED` / `assigned_to=me` | filter | :377-390, containers.tsx:1295-1300,1213 |
| OQ | Table: pri ("no priority published"), operation button, command, target link (typed), 3-in-1 state cell (source / verify / triage), age, "nobody yet"/acked-by | view | URL | GET `/compositions/operations?workspace_id&after&before&triage_state&assigned_to` | one row per operation | :155-173,396-413 |
| OQ | Row select (operation id button) -> loads rail triage | action | CLICK or `?operation=` | local state | selection | :165, containers.tsx:1248-1253 |
| OQ | Deep link `?operation=` selects row if on page, else follow notice "Operation X is not on this page" | link | URL?p | requestedOperation | follow | containers.tsx:1248-1260,1294 |
| OQ | Empty / error: PanelState non-ok (not partial), empty row sentence from read_truth | state | DATA | read_truth | honest empty | :392-394,424-429 |
| OQ | Paging buttons "newer / older" (tooltips explain disabled) | action | CLICK | keyset cursors | paging | :434-441 |
| OQ | 15 s composition re-read (keepValue) + 1 s age clock + arrival flash on new ids | live | URL | `usePollTick`, `useNow`, `useArrivals` | ages never freeze | containers.tsx:1220-1239, :235-237,411 |
| OQ | Sidebar badge (navBadge attention) set via presentation chrome while mounted | state | URL | local | nav count | :243-248 |
| OQ | Alert rail: open/close toggle (x / flag) | disclosure | CLICK | local `railOpen` | rail | :227,251-258 |
| OQ | Rail 1: Mirror integrity per env (paper/sandbox/live): READY/PARTIAL/..., findings list, "not read" | view | URL | 3x GET `/durable-mirror/integrity?environment=` | gap/conflict | :267-292, containers.tsx:1200-1207 |
| OQ | Rail 3: alert cards - always PanelState "no alerts route" in product; plus WARN card per attention row (`href="#"`, click opens triage) | view | URL | derived rows | alerts | :298-317 |
| OQ | TriagePanel: disabled "Open incident - not published (BR-EX-33)" | action | DATA | none | blocked link to incident | :505-512 |
| OQ | TriagePanel: Acknowledge / Resolve + affordance reasons (Admin only, already resolved, ack-before-resolve) | action | CLICK | POST `/operations/{id}/acknowledge` ; POST `/operations/{id}/resolve` (reason>=8, evidence hash) | triage records, never changes source | :455-551, httpApi.ts:828-855 |
| OQ | **Both stay disabled in product: container only wires them if `workspaceId` prop is set, and the route passes none; Resolve would also send `reason=""`/`evidenceHash=""`, which the adapter rejects** | state | URL | n/a | dark triage | containers.tsx:1322,1333; ExecutionPreviewRoute.tsx:301; OperationsQueue.tsx:537 |
| OQ | Result states: effect sentence (server flags), 409 conflict alert "changed while you were looking", replayed by same key | state | DATA | WorkflowResult | feedback | :519-524,544; containers.tsx:1262-1279 |
| OQ | CrossEvidence above the queue (authority, source health, twin, journal) | disclosure | URL | composition | explains dark controls | containers.tsx:1286 |
| OQ | Smoke rows (phase trail, progress bar, escalation countdown), KPIs w/ sparkline, critical chip + topbar alerts toggle | view | LAB | demo | n/a | :126-153,354-367,299-306 |

## 3. Incident Detail (`/execution/operations/incidents/:incidentId[?workspace_id]`) - `S/IncidentDetail.tsx` + `containers.tsx:1353`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| ID | Loading skeleton ("Loading the incident") | state | URL | GET `/operations/incidents/{id}` | wait | IncidentDetail.tsx:106-111,153-159 |
| ID | Absent/unavailable/empty/stale frame: QuietEmpty "No incident to show" + "Why?" fold + disabled Acknowledge/Mark RESOLVED; `denied` draws no controls | state | URL (also bare `/incidents`, id=null) | EmptyRecordFrame | keeps frame | :113-152, C/EmptyRecordFrame.tsx:64-123 |
| ID | Masthead: state chip + severity, target link, owner; CHANGED - reload chip | state | DATA | incident | identity | :180-219 |
| ID | State rail OPEN->MITIGATED->RESOLVED; unknown state = unavailable panel | state | DATA | workflowState | forward-only | :222-252 |
| ID | Evidence panel: hash refs (`shortDigest`), count note "showing n of N", 4 source-panel chips each with sr-only "missing evidence" | view | URL | evidence, sourcePanels | refs only | :271-306 |
| ID | Operations taken: link buttons -> `navigate(/administration/actions?operation=)` | action | CLICK | correlatedOperations | hop to drawer | :313-318, containers.tsx:1379 |
| ID | Resolution gates panel (blocker codes via `blockerText`, "N blocked"/OPEN) | view | URL | resolutionGate | resolve prerequisites | :324-329 |
| ID | Annotations panel (hidden section when none) | view | DATA | annotations | notes | :347-357 |
| ID | Footer: Acknowledge, Mark RESOLVED / "blocked: n gates", "View resolution audit" (resolved); hidden entirely for non-Admin; reasons list | action | DATA | **no onAcknowledge/onResolve passed by container, so always disabled in product** | decision | :361-384, containers.tsx:1373-1380 |
| ID | Market band, live price, resolve budget meter, evidence/ops/gates/timeline smoke rows, "Apply plan" link | live | LAB | demo | n/a | :255-267,236-246,310-312 |

## 4. Approval Inbox (`/governance/approvals[?workspace_id]`) - `S/ApprovalInbox.tsx` + `containers.tsx:186`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| AI | Title row: "N pending", overdue pulse chip, "overdue not counted", stale/partial chips; `CountLine` "counting.../withheld/unavailable" | state | URL | counts | headline | ApprovalInbox.tsx:102-129,402-412 |
| AI | Links: Waivers & conditions, New request | action | CLICK | `/governance/waivers`, `/governance/approvals/new` | nav | :414-415 |
| AI | Actor/roles/policy line | state | DATA | actor, policy | context | :417-423 |
| AI | Banners: partial (row-field gaps), stale, cursor-reset notice with Dismiss | state | DATA | cursorFailure codes | honesty | :425-444, cursorFailure.ts:53-79 |
| AI | Segmented Mine / All / Overdue (+counts) | action | CLICK | `view=` INBOX, ALL or OVERDUE | scope | :447-457 |
| AI | Gate chips R1 R2 Paper Sandbox Live Exit (toggle off -> ALL); disabled while loading/denied/unavailable | action | CLICK | `view=` R1, R2, PAPER, SANDBOX, LIVE_GATES or EXIT_REVIEWS | scope | :458-476 |
| AI | Pending table: request (subject + id link + target), gate + 5-dot GateTrack, what's next (needs-you / inert reason / blockers / approvers), SLA phrase + bar | view | URL | GET `/governance/approvals?view&after&before&limit=100&workspace_id` | work queue | :268-296, containers.tsx:254-301 |
| AI | Row open: click, Enter or Space (role=button tabIndex 0); id anchor with stopPropagation | key | CLICK/key | `navigate(reviewRouteFor)` (r1/r2/exit/live) | open review (workspace_id **not carried**; worth verifying) | C/table.tsx:312-334, ApprovalInbox.tsx:172-186, ExecutionPreviewRoute.tsx:308 |
| AI | Row emphasis: overdue tint/border, inert dimmed with 3 reasons (SELF/QUORUM/BLOCKED) | state | DATA | sla, inert | never hide rows | :188-208,242-266 |
| AI | Empty: QuietEmpty with server read_truth title/line, "Start from a Research run" only when whole queue empty | state | DATA | read_truth | honest empty | :478-486 |
| AI | Table footer: totals, "load newer / load older", cursor, over-200 notice, residency note; RetentionNotice if page.retention != HOT (Request-a-restore button never wired) | action | CLICK/DATA | keyset cursors | paging | C/table.tsx:383-492, C/retention.tsx:80-104 |
| AI | SLA strip: overdue/due-soon counts, "next SLA breach in" ticking, "N not yours" | live | DATA | 1 s `useAgeTick` | deadlines | :394-399,511-530 |
| AI | Recently decided `<details>` (window, count) with decided table; "Full history ->" button **disabled (no onLoadOlderDecided from container)**; quiet line when none | disclosure | CLICK | GET `/governance/approvals/history[?workspace_id]` | decided list | :533-559, containers.tsx:219-229 |
| AI | No polling on the list (read once per filter/cursor change) | live | URL | n/a | gap | containers.tsx:254-301 |

## 5. New Approval Request (`/governance/approvals/new[?alpha&run&claim]`) - `S/NewApprovalRequest.tsx`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| NR | Prefill from `?alpha=&run=&claim=` (read once) | link | URL?p | URLSearchParams | Research handoff | :346-353 |
| NR | Evidence run ChoiceMenu (searchable >8, icon dot = claim listed) - picking fills alpha + exactly-one claim | popover | CLICK | GET `/api/v1/quantbt/runs?limit=50` | run pick | :154-182, runSuggestions.ts:75-80 |
| NR | Run-list unavailable reason text | state | DATA | runOptionsReason | why no list | :179-181 |
| NR | Alpha ChoiceMenu **never rendered in product (container passes no alphaOptions)**; "already in the loop" warning only for it | form | DEAD | n/a | n/a | :183-196,222-224; container :362-389 |
| NR | Methodology claim: ChoiceMenu (>1 claims) / single read-only / "cannot list claims" / "Pick a run first" | form | DATA | run claims | claim pick | :197-221 |
| NR | "Ids - edit by hand" `<details>` (open when no list or typed id off-list): run, alpha (if no list), claim text inputs | disclosure | CLICK/DATA | free text, server validates | manual path | :226-243 |
| NR | Summary textarea (>=8 chars); What-happens-next aside | form | URL | local | first reviewer sentence | :244-263 |
| NR | Decision bar verdict INCOMPLETE/READY/SENDING/SUBMITTED + blocker sentence (names which field) | state | URL | local | validation | :99-107,293-306 |
| NR | Submit for R1 review / Retry submit (disabled in flight, aria-describedby reason) | action | CLICK | POST `/governance/approvals` `governance.approval-create-request.v1`, request key per payload intent, ref guards double-click | create | :316-331,357-388; httpApi.ts:266 |
| NR | Results: Created / Replayed (SLA, policy, SoD), DUPLICATE (link to existing r1), REFUSED, OFFLINE (same key on retry) | state | DATA | ApprovalCreateOutcome | five truths | :125-150,267-291 |
| NR | After success: Open Approval Inbox link, "New request" resets key + summary (ids stay) | action | CLICK | local | next | :308-315 |

## 6. Gate R1 review (`/governance/approvals/:id/r1[?workspace_id]`) - `S/GateR1Review.tsx` + `containers.tsx:369`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| R1 | Non-ok (not stale/partial): kicker + EmptyRecordFrame with "Back to the Inbox" + "Why?" fold | state | URL | GET `/governance/approvals/{id}/r1` | absent/denied | GateR1Review.tsx:190-197 |
| R1 | STALE/PARTIAL chips + banners; DECIDED banner; self-approval banner | state | DATA | detail | honesty | :283-284,323-346 |
| R1 | Stepper, meta line, GateVerdict (headline, facts, SoD line, SLA h) + CheckStrip segments (title tooltips) | view | URL | checklist | conclusion first | :286-315 |
| R1 | "Policy & references" disclosure | disclosure | CLICK | policy | policy ref | :316-321 |
| R1 | Artifact passport `<details>` (n of m verified; unreadable vs none) + provenance chain | disclosure | CLICK | manifest | provenance | :347-367 |
| R1 | Checklist lines with research source links (Report/Run/Freeze/Audit via `refHref(workspace_id)`), "no source link" + reason tooltip | link | CLICK | ref | evidence | :369-398,45-57 |
| R1 | Known limitations panel or empty PanelState | view | DATA | limitations | caveats | :399-414 |
| R1 | Evidence series slot - never filled in product -> GateAbsences `<details>` "1 item not published" | disclosure | CLICK | none | absence | :273-275,415-416; C/gateFrame.tsx:69-85 |
| R1 | Decision panel: condition list; "+ add condition" `<details>` hidden when decided | disclosure | CLICK | local | typed conditions | :417-444 |
| R1 | Condition composer: text*, owner*, deadline (date), expires (date), blocking checkbox; "Cannot attach: ..." incl. expiry<deadline; Attach | form | CLICK | local -> `conditions` | typed condition | C/conditions.tsx:126-263 |
| R1 | CaptureNextStep (R2_CREATE) panel below conditions: blocked / no candidates / form | form | DATA | `governance.capture` context | create R2 review | C/CaptureNextStep.tsx:28-152, containers.tsx:561-567 |
| R1 | Decision bar: reviewer note input (>=8 for Request changes; **empty note sends canned reasons "Evidence reviewed and accepted."/"Evidence rejected."**), verdict BLOCKED / PENDING q/n / decided, first reason + "N more reasons" `<details>` | form | CLICK | local | decision reason | C/decisionBar.tsx:38-85, containers.tsx:545-547 |
| R1 | Action menu: primary Approve (or Approve with condition once a condition exists); "Other decisions" popover: Request changes, Deny, the other approve; Esc / outside click / focus-out close | popover | CLICK/key | GatePrimaryWithMenu | verbs | C/gateFrame.tsx:99-156 |
| R1 | Lock reasons as tooltip per verb: SELF_APPROVAL, BLOCKING_FINDINGS, EXPIRED, NOT_ELIGIBLE, server-not-granted, binding not ready, retained read-only | state | DATA | eligibility, binding | explain dark | GateR1Review.tsx:65-85,198-255; containers.tsx:360,519 |
| R1 | Mutations: POST `/commands/plans` (R1 command) -> POST `/operations/{id}/apply` -> poll GET `/operations/{id}` every 1.5 s x40 | action | CLICK | request key per intent+pins | APPROVE / DENY / APPROVE_WITH_CONDITION / REQUEST_CHANGES | containers.tsx:445-511,366-367,407-443 |
| R1 | DecisionTrail phases: planning, planned, applying, accepted (202 not success), verifying, settled, uncertain, failed, abandoned, "has not been confirmed", conflict | state | DATA | decision reducer | outcome honesty | containers.tsx:585-600, X/decision.ts:23-296 |
| R1 | Review does not refetch after settle; DECIDED banner appears only on reload | state | DATA | n/a | gap | containers.tsx:383-401 |

## 7. Gate R2 review (`/governance/approvals/:id/r2[?workspace_id]`) - `S/GateR2Review.tsx` + `containers.tsx:739`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| R2 | Non-ok frame (as R1); STALE/PARTIAL chips + banners | state | URL | GET `/governance/approvals/{id}/r2` | honesty | GateR2Review.tsx:188-195,275-276,334-343 |
| R2 | R1 lineage chip (state + link), R1 digest/expiry/decider, candidate/release/digest meta | view | URL | r1* fields | authority chain | :279-309 |
| R2 | R1-block banner variants: EXPIRED / DENIED / PENDING / MISSING / lineage not published | state | DATA | r1State | locks Approve | :31-49,328-333 |
| R2 | Verdict (SoD line, quorum, SLA, capital as_of, "capital limit breached") | view | URL | local | conclusion | :310-327 |
| R2 | Readiness groups (revision "not stated") or empty | view | DATA | readiness | prerequisites | :344-363 |
| R2 | Fit / criteria / stage-chips slots never fed -> GateAbsences `<details>` (up to 3) | disclosure | CLICK | none | absence | :264-268,344-366 |
| R2 | Capital preview (inverse panel): authority badge, before/after table, BREACH chips, "cannot be decided against" blockers, 3 non-served states (in flight / failed reason / no portfolio-currency-amount) | view | DATA | POST `/approvals/{id}/capital-preview` (re-requested when portfolio/amount/currency change) | what approval changes | :368-433, containers.tsx:803-832 |
| R2 | Observation policy panel - slot never fed -> always empty PanelState | state | URL | none | gap | :434-441 |
| R2 | Decision panel + "open conditions fleet-wide ->" link to `/governance/waivers`; composer `<details>` (always shown, no decided state) | disclosure | CLICK | local | conditions | :443-464 |
| R2 | CaptureNextStep (PAPER_EXIT_CREATE) | form | DATA | capture context | create exit review | containers.tsx:915-921 |
| R2 | Decision bar: note, locks (SELF, R1_NOT_VALID, CAPITAL_BREACH, PREVIEW_NOT_DECIDABLE, EXPIRED, NOT_ELIGIBLE), grant sentence ("Approve grants X only"), verb menu, trail | form | CLICK | R2 plan schema + apply + poll as R1 | R2 decision (no `decided` banner exists) | :466-505, containers.tsx:835-846,609-737 |

## 8. Gate LIVE review (`/governance/approvals/:id/live[?workspace_id]`) - `S/GateLiveReview.tsx` + `containers.tsx:1019`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| LV | Non-ok (**including stale**) frame; no partial banner | state | URL | GET `/governance/approvals/{id}/live` | absent | GateLiveReview.tsx:97-104 |
| LV | Verdict "dual approval" or "You cannot decide this - role holds no grant"; read_at; SlaCell ticking 1 s; link to Canary Control Room `/deployments/live/{dep}/canary` | live | DATA | liveReview | context | :112-132 |
| LV | Current source panel: state/freshness/completeness/as_of or unavailable | state | DATA | currentSource | live facts | :165-184 |
| LV | Canary-evidence branches list with reason codes, retryable | state | DATA | derivedBranches | evidence gaps | :185-203 |
| LV | Gate criteria panel: always PanelState "unavailable" in product | state | URL | none | no recompute | :236-247 |
| LV | Capital step panel always unavailable; "What approval changes" prose | state | URL | none | consequence | :276-297 |
| LV | Decision bar: note input, "Deny - back to canary", "Approve live step" **both permanently disabled** with reason (SoD / binding / "closed on this build") | action | URL | `locked=true` hard-coded | no live decision | :300-329, containers.tsx:1042-1055 |
| LV | Smoke canary record, drift chart (LinesChart), criteria table, capital-step bar, SMOKE banner | view | LAB | demo | n/a | :133-164,206-235,250-275 |

## 9. Paper/Sandbox Exit review (`/governance/exit-reviews/:reviewId[?workspace_id]`) - `S/PaperExitReview.tsx` + `containers.tsx:927`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| PX | Loading skeleton; non-ok frame; register route with no id = empty state "No exit review is named" | state | URL (no id also) | GET `/governance/exit-reviews/{id}` | absent | PaperExitReview.tsx:230-270, containers.tsx:935-940 |
| PX | Stepper, GateVerdict (blocked-but-extend/reject-available, gate met), STALE/PARTIAL banners | state | URL | server `gateMet` (never inferred) | conclusion | :355-433,498-507 |
| PX | Header badges PAPER_EXIT / GATE MET or UNMET / STALE / PARTIAL; LifecycleRail; decision strip (blocking, carried questions, quorum, conditions, panels read n/m) | view | URL | detail | summary | :341-346,508-521 |
| PX | Context rail: next-step card, recommendation, named blockers, quorum/SLA, provenance `<details>` with "Copy full" per sha256 (clipboard) | disclosure | CLICK | lineage | provenance | :371-412, C/workspace.tsx:276-408 |
| PX | Evidence panels grid: per-panel state, findings with source links, "carries into X", "N findings have no source link" | view | URL | panels | evidence | :108-136,528-538 |
| PX | Panel not read (non-ok/non-empty) -> blocks Promote, names panel | state | DATA | panel.status | no false pass | :282,326-333 |
| PX | Activation plan preview (mode, target stage, authority, side effect) or empty | view | DATA | activationPlan | what promote creates | :540-564 |
| PX | Conditions list + recommendation + fleet-wide link | view | URL | conditions | carry-over | :565-570 |
| PX | Reviewer note textarea - **local only; `onDecide(outcome)` sends fixed reason "Exit review decision: X."** | form | CLICK | local | looks recorded, is not | :571-580; containers.tsx:1005 |
| PX | Decision bar: primary "Approve promotion", "Other decisions" menu: "Extend observation +14d", "Reject - back to Paper HELD" (eligibility gates all three; gate gates promote) | popover | CLICK/key | POST `/commands/plans` (paper-exit schema, extension_days 14) -> apply -> poll | exit decision | :361-369,585-593; httpApi.ts:1178-1198 |
| PX | Decided banner / "Decided" rail - **container never passes `decided`**, so unreachable in product | state | LAB | n/a | gap | :355-359; containers.tsx:958-1007 |
| PX | Smoke masthead, copy-digest button, plan note | view | LAB | demo | n/a | :434-488,557 |

## 10. Waivers & conditions (`/governance/waivers`) - `S/WaiversRegister.tsx:341`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| WV | Header: expiring pulse chip, "N lapsed . blocking", "X not counted", partial chip, "Updated hh:mm UTC" | state | DATA | counts | headline | WaiversRegister.tsx:180-197 |
| WV | Five lane buttons Lapsed/Expiring/Open/Waived/All (count, note, "not counted") - local filter, resets cursor | action | CLICK | `state=` ; 4 probes GET `/governance/waivers?state&limit=1` | exact counts | :201-223, :383-399 |
| WV | Runway lanes (shared 0-45 d axis, ticking due text, event-bound note) or empty reasons | view | URL | page rows | what lapses when | :67-120 |
| WV | "Debt sits with" subject chips | view | DATA | page rows | grouping | :231-239 |
| WV | Register table (5 rows/page): expand caret button (single open) -> obligation / closes-by detail row; source decision link | disclosure | CLICK | `/governance/approvals/:id/{gate}` (no workspace) | audit | :267-308,60-62 |
| WV | Pager "newer / older" with explanations, "n of m shown", "No page was returned" | action | CLICK | cursors | paging | :319-331 |
| WV | 1 s age tick (counts from server `read_at`) | live | URL | useAgeTick | deadlines | :40-58 |
| WV | Fold "Command authority, source health and journal" -> CrossEvidence | disclosure | CLICK | `/compositions/waivers` | why dark | :421-424 |

## 11. Admin Action Drawer (`/administration/actions[?cmd&operation&action&binding]`) - `S/AdminActionDrawer.tsx` + `containers.tsx:1083`
| screen | element | kind | reached | data / endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| AD | Header chips; role chip; "CLI password -> web step-up" | view | URL | tasks.actorRole | frame | AdminActionDrawer.tsx:492-506 |
| AD | **Catalogue read failure blanks the whole screen (tasks, journal, activation) via one PanelState** | state | DATA | GET `/commands/catalog` | single point of failure | :508-509 |
| AD | Relay-disabled banner; `?action&binding` note with back-to-accounts link; `?operation` note with open-in-queue link | link | URL?p | query | arrival context | :512-547, containers.tsx:1141-1143 |
| AD | Task list grouped, each TaskRow (title, tag, scope, cli form, state label + reason) - click opens detail pane; groups dropped when empty | view | URL | GET `/commands/tasks` | catalogue | :582-609,240-270 |
| AD | `?cmd=<taskId>` preselects a task (initial only) | link | URL?p | useState(initial) | deep link | :475,483 |
| AD | Task detail pane: blocked banner (reason code) or CONNECTED . LOCAL R0 banner; joins-catalogue note; facts; CLI forms (read-only `pre`) | drawer | CLICK | task | detail | :285-382 |
| AD | Params inputs (only CONNECTED + runner) with required `*`, default placeholder, source registry; read-only rows otherwise | form | CLICK | local | R0 args | :357-382 |
| AD | "Run local R0 read" (disabled while running or required missing) -> receipt (transport, "source command sent: no", JSON, "Receipt integrity" digest `<details>`) or error PanelState | action | CLICK | POST `/commands/tasks/{id}/run` | local read only | :383-398, httpApi.ts:511-531 |
| AD | Authority hint (OPEN / FAIL_CLOSED, relay, counts sentence) | state | URL | composition.commandAuthority | why dark | :621-645 |
| AD | Staged activation: non-ok / empty / capability table | state | DATA | GET `/activation/capabilities` | owner state | :646-707 |
| AD | Classification filter chips All/Connected/Supported-inactive/Incompatible (disabled at 0) | action | CLICK | local | filter | :711-731 |
| AD | Command journal `<details>` (<=100 rows, "actor redacted", empty/unavailable) | disclosure | CLICK | composition.journal | what ran | :738-767 |
| AD | CrossEvidence mini (source health, canary twin) | view | URL | composition | context | containers.tsx:1133-1140 |
| AD | "Full published catalogue" `<details>` with tier chips (server refetch, clears selection) | disclosure | CLICK | `risk_tier=` | reference catalogue | :772-794, containers.tsx:1111-1116 |
| AD | EntryRow -> detail drawer: "NOT EXPOSED IN PORTAL", tier, steps, route; plan block **never passed in product**; "no plan or apply offered" | drawer | CLICK | catalogue entry | explain | :60-179,818-829 |
| AD | WF-1i demo machine (plan/apply/verify, two-man key, transcript) | drawer | LAB | `demoCli` | n/a | :555-581,830-835; C/drawer.tsx |

## 12. Shared components opened by the above
| screen | element | kind | reached | data | purpose | locator |
|---|---|---|---|---|---|---|
| shared | ChoiceMenu: trigger, listbox popover, type-to-filter (>8 opts), ArrowUp/Down/Home/End/Enter/Esc, outside pointer close, empty "Nothing matches" | key | CLICK | local | NR, CaptureNextStep | C/choiceMenu.tsx:18-152 |
| shared | CommandPlanDrawer (PLAN/APPLY/VERIFY, reason, typed-confirm word, R2-R4 fresh-auth + 2nd-approver blockers, UNCERTAIN gates, 409 key conflict, ExecutionTerminal Follow/Copy/Export/Clear/Expand) | drawer | LAB | props | **no product screen mounts it** | C/drawer.tsx:130-457, Fixtures.tsx:975-1536 |
| shared | RetentionNotice / RangeTooWideNotice | state | DATA (table only) | page.retention | cold/purged | C/retention.tsx:80-125 |
| shared | ReviewCapturePanel states: capabilities unknown, UNAVAILABLE(denied code), identity row "not published", summary>=24, Record review, captured/replayed link, failed | form | DATA | review-capture | CaptureNextStep and SandboxCertification | C/ReviewCapture.tsx:84-232 |
| shared | ProfileScreens (EnvelopeMasthead, CapabilityTable, DataBranches, QueryAnalyticsScreen, TypedUnavailableScreen) + all of profileContainers except CommandCenter container | view | DEAD | n/a | superseded by Rich* containers; only tests | S/ProfileScreens.tsx, profileContainers.tsx:210-433 |
| shared | PanelState taxonomy (loading/empty/partial/stale/denied/unavailable/insufficient/terminal), "Soon" retitle for source gaps | state | DATA | n/a | all | C/states.tsx:18-112 |

## Things a first-pass screenshot review would NOT show
1. **Disabled-forever controls**: Ops triage Acknowledge/Resolve (route passes no workspaceId), Incident Acknowledge/Mark RESOLVED/View audit (no handlers), Gate LIVE Approve/Deny (hard-locked), Inbox "Full history ->", Alpha picker on New Request, Exit-review reviewer note (looks recorded, is dropped). They look like normal buttons in a happy-path shot.
2. **Disclosures collapsed by default**: passport, Policy & references, add condition, absences, "N more reasons", Why?, provenance, journal, CrossEvidence fold, full catalogue, Recently decided, Ids-edit-by-hand, PreviewBanner Details/Inspector. Contents invisible until opened.
3. **Popovers/menus**: "Other decisions" verb menu (hides Deny and Request changes), ChoiceMenu listboxes, Retained pill dialog, alert-rail toggle.
4. **Result states only after a mutation**: Created/Replayed/Duplicate/Refused/Offline, DecisionTrail phases (accepted-not-success, uncertain, abandoned after 40 polls), 409 conflict, effect sentences, receipt JSON.
5. **Data-conditional variants**: R2 R1-block (4 states), self-approval, capital breach/undecidable/preview failed, stale vs partial banners, cursor-reset notice, retained read-only closure, lock reasons live only in tooltips and the decision bar.
6. **Live behaviour**: 1 s clocks (SLA bars, ages, runway countdowns), 15 s composition re-read, SSE stream (dark unless `stream_available`), revision beat, arrival flash, hidden-tab pause. A static frame cannot show motion or its absence.
7. **URL-only entry**: `?operation=` follow (and miss notice), `?cmd=`, `?action&binding`, `?alpha&run&claim`, `?workspace_id`, and id-less `/incidents`, `/exit-reviews` registers.
8. **Silent omissions**: Promotion pipeline vanishes if the fleet read fails; Annotations section and CC cells disappear or lose links (cells promise links but render none); rail alert cards are one "no alerts route" panel.
9. **Role gating**: Incident footer disappears for non-Admin; denied draws no controls; Triage affordance text varies by role.
10. **Possible defects found while reading** (verify in browser): Inbox row/Waiver source links drop `workspace_id`; Admin screen blanks entirely when only the catalogue read fails; R2 and Live have no decided banner; GateLive treats `stale` as absent; Resolve passes empty reason/hash.
