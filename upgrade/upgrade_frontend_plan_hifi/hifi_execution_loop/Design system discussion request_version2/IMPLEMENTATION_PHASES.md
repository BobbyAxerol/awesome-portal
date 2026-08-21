# IMPLEMENTATION_PHASES.md
> One phase = one hi-fi screen, in dependency order. Claude: open the phase's `.dc.html` file and rebuild EXACTLY that — the hi-fi is the visual truth; this doc tells you what in it must WORK, not just render.
> Constraint docs: `DESIGN_SYSTEM_EXECUTION.md` (DS), `CANONICAL_CAST.md` (CAST — all ids), `HANDOFF_README.md` (§4b out-of-scope stubs), `EXECUTION_CLUSTER_GUIDE.md` (GUIDE), spec `uploads/ALPHA_POOL_TO_LIVE_PORTFOLIO_PORTAL_DESIGN_SPEC_v0.7_vi.md`, CLI catalog `uploads/PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`.
> Sizing: never hardcode hi-fi pixels — DS §8 (shell.css breakpoints 640/768/900/1024/1280, sidebar ≥1024 only, tables scroll inside panels, drawers full-screen <720).
> Each phase's **Demo states** (the Tweaks in the hi-fi) are its acceptance tests: reproduce them as fixture toggles.

## Phase 0 — Shell & shared components (no screen)
Reuse `apps/portal/frontend` `tokens.css/base.css/shell.css`. Build: canonical sidebar + topbar (identical in all 16 sidebar screens — copy any hi-fi; groups COMMAND / GOVERNANCE / DEPLOYMENTS / ADMINISTRATION, active = left border + surface change); governance-light + operations-dark surfaces (DS §7 palette, hex values in the hi-fi are authoritative); shared components per DS §4/§9: AuthorityBadge (EXECUTION/BROKER/DERIVED + as_of + age), StatusChip, guard bands (canary double-red+shield, live solid red), FreshnessIndicator (per-venue policy), VenueScope, LifecycleRail, EvidencePanel (✓/!/✗ + link), SLA cell, ChartTile envelope caption, states LOADING/DENIED/UNAVAILABLE/empty (WF 4g/5c); route stubs for out-of-scope targets (HANDOFF §4b).
**Done when:** fixture page shows every component in every state; nav routes exist.

## Phase 1 — Approval Inbox (`HiFi Approval Inbox.dc.html`, WF 4a, governance light)
Depends: Phase 0.
Layout top→bottom: topbar (breadcrumb `Governance / Approvals / Inbox`, GOVERNANCE badge) · H1 + `5 PENDING` amber + `1 OVERDUE` red + policy line ("policy approval.v3 · you are Lan · roles") · filter chip row · request table · footer strip · Recently-decided table.
Must work: filters **Mine (default) / All / R1 / R2 / Exit reviews / Live gates / Overdue** actually filter rows; sort overdue → due-soon → age; row click navigates (AP-201→R1 screen, AP-352→R2 screen, EX-771→Paper Exit Review).
Row treatments to copy exactly: AP-352 = red-tinted row + 3px red left border + `26h / 24h · OVERDUE`; AP-360 = blockers red "2 — audit replay failed", quorum "blocked before review"; AP-311 = whole row dimmed gray with quorum "1/2 · awaiting 2nd — **not you** (separation-of-duty)" — dimmed, never hidden.
Footer strip: overdue/due-soon counts · sort rule · "visibility ≠ authority".
Demo states: `inboxEmpty` → "Inbox zero" panel (heading + one mono line), recently-decided stays.
Data: CAST approvals only. Done when: journey Inbox → review → back works with filters preserved.

## Phase 2 — Gate R1 Review (`HiFi Gate R1 Review.dc.html`, WF 1a, governance light)
Depends: Phase 1 (entered from inbox).
Layout: decision bar pinned top (Approve / Request changes / Reject + policy version + quorum) — never in overflow menus · two columns: left artifact passport (identity, digest, evidence pack sections: IS/OOS/holdout, WFO stability, drawdown/regime, assumptions, limitations/waivers, reproducibility checksums, proposed restrictions) · right reviewer checklist (each item = EvidencePanel row ✓/!/✗ linking its evidence) · typed conditions composer (owner · deadline · expiry · blocking).
Must work: decision buttons enabled only when checklist complete; conditions attach to the decision object.
Demo states: `viewerIsCreator` → decision bar replaced by read-only notice (self-approval blocked, reason shown) — separation-of-duty proof.
Data: subject RSI v1.7 · RC-41 · AP-201 (CAST). Done when: decision writes and Inbox reflects it.

## Phase 3 — Gate R2 Review (`HiFi Gate R2 Review.dc.html`, WF 1b, light + dark ops preview strip)
Depends: Phase 2.
Layout: same decision-bar pattern as R1 · left: operational readiness checklist (venue/account plan, risk profile rev, capital request, observation policy) · right: R1 reference panel (decision, digest, expiry) · the signature element: **dark operational preview strip** (capital before/after diff — the same mental model the Action Drawer uses later; keep it visually dark-on-light exactly as the hi-fi).
Must work: capital preview recomputes from requested amount; R1 reference links to the R1 decision.
Demo states: `r1State` VALID/EXPIRED — EXPIRED disables the whole decision bar with reason ("R1 evidence expired — re-run R1"), not just a tooltip.
Data: AP-352 Carry v3.2 → PF-MAIN (CAST). Done when: R2 approval creates typed conditions and unlocks paper deployment.

## Phase 4 — Paper Workbench (`HiFi Paper Workbench.dc.html`, WF 1c, ops dark)
Depends: Phase 3.
Layout: header band (PAPER chip, alpha + deployment identity, READY badge, pin ⌖) · lineage strip (artifact sha, R1 AP-101, R2 AP-207, portfolio, deployment — every id a chip) · **LifecycleRail**: `R1 ✓ AP-101 → R2 ✓ AP-207 → PAPER ● 12/30 days · 184/300 trades → SANDBOX — → CANARY — → LIVE —` (✓ links decisions, current has blue border) · 5-KPI strip (auto-fit, no orphan cells) · equity chart WITH observation-gate progress panel beside it (never below the fold — Paper exists to EXIT Paper) · positions + orders tables · "Request Exit Review" CTA (disabled until gate met, tooltip states which condition is unmet).
Must work: blotter links route to Full Blotter scope-pre-filtered (stub until Phase 14); exit CTA routes to Paper Exit Review.
Demo states: `freshnessState` FRESH/STALE — STALE = amber banner + projection panel marked stale + note that risk fails closed; `operatorAdmin` false hides mutation buttons entirely.
Data: Carry v3.2 · dep_74 · BINANCE (CAST). Done when: rail, gate progress, and both demo states render from fixture data.

## Phase 5 — Paper Exit Review (`HiFi Paper Exit Review.dc.html`, WF 4b, governance light + ops evidence)
Depends: Phase 4 (CTA target), Phase 1 (inbox row EX-771).
Layout: header `PAPER_EXIT · EX-771 — Grid v2.1 · dep_94 · DERIBIT → promote to SANDBOX_VALIDATION?` + GATE MET green · lineage line (artifact, R1 AP-118, R2 AP-152, observation policy, evidence pack digest) · four evidence panels in 2×2: Observation coverage (30/30 · 312/300 · restarts 2/2) / Drift vs approved evidence (WATCH items amber, non-blocking; slippage INSUFFICIENT_DATA carries forward) / Limits & health / Portfolio fit observed-vs-expected · unresolved-conditions + operator-recommendation strip · decision footer: **Extend observation +14d / Reject — back to Paper HELD / Approve promotion** (primary).
Must work: every evidence number links its source (sessions tab, blotter, portfolio panel); the three outcomes write distinct states.
Variant note (build later, same template): Sandbox Exit adds cleanup checklist + order-type cert; Canary Exit adds envelope compliance + scale plan.
Data: EX-771 (CAST). Done when: approve flips dep_94's rail to SANDBOX; extend/reject round-trip to inbox.

## Phase 6 — Admin Action Drawer (`HiFi Admin Action Drawer.dc.html`, WF 1i upgraded, ops dark, NO sidebar)
Depends: Phase 0 only; unlocks all later mutation links.
Layout: full-page two-pane — left **catalog: 21 commands in 6 groups** exactly as the CLI guide (Read & inspect / Portfolio & capital / Deployment & risk / Account / Broker sync & reconciliation / Emergency & destructive), each row: title + tag chip (READ green · MUTATION blue · DANGER red · BLOCKED dashed gray) + scope + first CLI line; right **drawer 490px** (full-screen <720): header (tag, title, meta line) · PLAN/APPLY/VERIFY stepper (mutations only).
Must work per selection: READ → green banner "no password/step-up" + returns panel, no footer. BLOCKED (lab reset) → red "NOT EXPOSED IN PORTAL" + why. Allocation → Before/After diff + policy checks (concentration = warning-not-blocking) . Emergency close → read-only flatten plan + typed `CLOSE` confirm + red apply. Generic mutations → exact request preview (METHOD/PATH/PAYLOAD as CLI prints) + authority checks. All mutations: Equivalent-CLI block (display-only, "browser never runs a shell") · required reason field · **Generate plan** gates Apply (plan chip `cmd_9f12 · expires 60s`) · Apply → VERIFY timeline: `202 — NOT success yet` first line, per-sub-intent ✓ rows, terminal banner.
Demo states: `applyOutcome` VERIFIED/PARTIAL — PARTIAL = amber banner, residue described, "Plan residue re-apply" button, same idempotency key, never green.
Done when: one real allocation runs end-to-end against control-api with ledger + audit rows.

## Phase 7 — Operations Queue + Alert Rail (`HiFi Operations Queue.dc.html`, WF 4e, ops dark)
Depends: Phase 6 (rows link drawer plans).
Layout: H1 + `2 NEED ATTENTION` amber · filter chips **Needs attention (default) / Mine / All (24h)** + sort note ("PARTIAL >15m escalates to an alert") · operations table (op / command / target / state / age / actor / next step) — attention rows amber-tinted with amber left border · right **Alert Rail** 340px, toggled by topbar `⚑ Alerts · 1 critical`.
Must work: filters filter (All reveals VERIFIED rows); next-step links: op_1251 → Drawer residue re-apply, op_1253 → Incident inc_44; rail cards navigate (CRITICAL → Incident Detail); rail close/open persists.
Rail rules to keep verbatim: alert = state change of a typed object (finding/sync/operation/condition), never free text; ack ≠ resolve; badge counts CRITICAL only.
Demo states: `alertRail` boolean.
Data: op_1249–1253 (CAST). Done when: queue ↔ drawer ↔ incident links round-trip.

## Phase 8 — Incident Detail (`HiFi Incident Detail.dc.html`, WF 4d, ops dark)
Depends: Phase 7.
Layout: header (INCIDENT chip, `inc_44 — position MISMATCH · acct-live-grid-v21 · BINANCE`, OPEN·CRITICAL, meta "opened · owner · from alert · SLA ack ✓") · forward-only state rail `OPEN → MITIGATED (exposure frozen ✓) → RESOLVED` · two panels: **Evidence** (finding rf_2101 with local-vs-broker Δ, two sync snapshot digests, blast radius "dep_88 fail-closed · 2 sibling accounts unaffected", probable cause) + footer rule "broker is truth — resolution converges local TO broker" / **Operations taken** (op rows with status chips + "Open apply plan" button → Drawer) · Timeline panel · action footer.
Must work: "Mark RESOLVED" stays disabled with inline reason (clean dry-run + reason required); resolved state shows amber note "dep_88 still HALTED — resume deliberately left to the operator".
Demo states: `incidentState` OPEN/RESOLVED — RESOLVED adds op_1254 VERIFIED row + green rail + resolution timeline entries.
Done when: resolve flow enforces both preconditions and never auto-resumes.

## Phase 9 — Command Center (`HiFi Command Center.dc.html`, WF 5a, ops dark)
Depends: Phases 1, 7, 8 (its rows land there). Becomes default landing route after this phase.
Layout: greeting H1 + `1 CRITICAL` · **Needs you now** panel — ranked rows (rank number, type chip INCIDENT/APPROVAL/OPERATION, title, SLA cell, action link), rank = severity → SLA → age, #1 red-tinted, #2–3 amber left border; rows are whole-row links (inc_44 → Incident, AP-352 → R2, op_1251 → Queue, AP-201 → R1) · two-up: **Fleet health** (Live/Canary/Sandbox/Paper/Broker sync/Findings count cells — counts only, cells link stage lists) + **Pinned watchlist** (stage chip incl. guard `⛨ CANARY`, identity, PnL/progress, health chip; "pin ⌖ from any workbench · max 5 · user-owned order · a pin never mutes alerts") · **Today** strip (upcoming reviews, expiring conditions, last VERIFIED op → full journal).
Demo states: `morning` BUSY/QUIET — QUIET = "Nothing needs you" + sync 8/8 green + findings 0.
Done when: every row/cell navigates; triage list derives from the same typed objects as the alert rail.

## Phase 10 — Sandbox Certification (`HiFi Sandbox Certification.dc.html`, WF 1d, ops dark)
Depends: Phases 4–6.
Layout: header (SANDBOX chip, Carry v3.2 · OKX TESTNET · dep_77, venue from data never copy) · lineage strip (R1 AP-101 · R2 AP-207 · paper exit PX-29) · LifecycleRail (SANDBOX ● certification 5/7) · **7-step certification strip** (connect → sync → order types cert → recon clean → timeboxed run → cleanup → exit review; done/current/pending states) · 3-column **Internal / Broker / Difference** triptych (EXECUTION vs BROKER vs DERIVED AuthorityBadges) · timeboxed cert-run panel (capital cap 50 USDT, 30min auto-halt, "approved by AP-207 scope") · findings table.
Must work: step strip reflects fixture state; diff column derives.
Demo states: `reconFinding` NONE/CRITICAL — CRITICAL = red banner, orders fail-closed, cert step blocked, exit CTA disabled.
Done when: certification state machine renders all 7 steps from data.

## Phase 11 — Canary Control Room (`HiFi Canary Control Room.dc.html`, WF 1e, ops dark)
Depends: Phase 10.
Layout: **double-red guard band + shield + `LIVE · CANARY`** (never color-only) · lineage (R1 AP-118 · R2 AP-152 · sandbox exit SX-14 · canary approval AP-311) · LifecycleRail (CANARY ● day 9/14) · 5-KPI · envelope-compliance panel (capital 5,000/5,000 at cap — progress bars vs canary envelope rev 3, tighter than base risk profile rev 12) · live blotter + positions · protective actions row (halt / reduce / close) + scale-up action.
Must work: protective vs scale asymmetry is the point of the screen.
Demo states: `brokerSync` OK/STALE — STALE blocks **scale-up only** (disabled + reason), protective actions stay enabled, amber banner explains the asymmetry.
Data: Grid v2.1 dep_88 acct-canary-grid (CAST). Done when: asymmetric gating works.

## Phase 12 — Live Full Operations (`HiFi Live Full Operations.dc.html`, WF 1f, ops dark)
Depends: Phase 11.
Layout: **solid-red guard band `LIVE`** · lineage (canary exit CX-08 · live dual approval AP-330) · LifecycleRail (LIVE ● since 2026-08-01) · 5-KPI (Capital/Gross/…) · internal-vs-broker panel pair · positions/orders with open-order footer · protective actions.
Demo states: `brokerState` OK/MISMATCH — MISMATCH **replaces the broker panel** with a fail-closed banner (finding link → Incident, dry-run reconcile link → Drawer); no numbers rendered from a mismatched source.
Data: acct-live-grid-v21 (CAST — never `-bin`). Done when: MISMATCH state suppresses broker-derived values everywhere on the screen.

## Phase 13 — Paper Workbench VNM (`HiFi Paper Workbench VNM.dc.html`, WF 4h, ops dark)
Depends: Phase 4 (variant of it).
Layout: header adds `■ SUSPENDED_BY_CALENDAR` neutral-gray chip + READY green together (session state ≠ runtime state) + "reopens in 12h 40m" · **calendar banner in INFO tone, not warning**: data as_of last close, freshness aging PAUSED against venue calendar (not STALE), off-hours signals queue as GTD-at-open, risk re-validates at open · LifecycleRail (PAPER ● 6/30 sessions) · KPI cells flex-fill (no orphan) · VND currency chip on every panel, never USDT mixing · DNSE credential strip (OTP session expiry amber; renewal is Execution-side, portal shows status only) · blotter: order types **LO/ATO/ATC verbatim**, lot 100, T+2.5 in accounting panel.
Data: VnMomo v0.9 dep_101 (CAST). Done when: freshness clock provably pauses outside 09:00–14:45 ICT.

## Phase 14 — Full Blotter (`HiFi Full Blotter.dc.html`, WF 4c, ops dark)
Depends: Phase 4 (link sources exist); unblocks all "full blotter →" links.
Layout: H1 + EXECUTION AuthorityBadge · scope toolbar (Alpha/Deployment/Venue/Time selects) + status filter chips + Columns/Export · cross-filter chip row · table (9 cols, sticky header, min-width ~980 scrolling inside panel) · footer (count label, "load older — cursor c_ab34… (keyset, never OFFSET)", virtualization note).
Must work: status filters **All/Filled/Partial/Rejected/Open** filter rows AND count label; cross-filter chip `✕ reset` removes chip and switches count "412 in selection" → "48,213 total"; **FILLED row click expands the funnel**: `signal → intent → risk grant ✓ → order ACK → fill` cards with timestamps + per-hop ms deltas + links (sizing decision, ledger entry), click again collapses; REJECTED rows show risk reason inline.
Data: ord_87xx/88xx rows (CAST deployments). Done when: arriving from any screen pre-applies that screen's scope.

## Phase 15 — Alpha 360° (`HiFi Alpha 360.dc.html`, WF 2a + 2b, ops dark)
Depends: Phases 4, 10–12, 14.
Layout: header (ALPHA chip, Grid v2.1 · av_2041, artifact/owner/certification meta, "Artifact passport →") · **scope bar: Portfolio / Mode / Venue / Window — drives EVERY panel and KPI below** · deployment map venue × stage from registry (BINANCE canary red chip, OKX HALTED amber, DERIBIT paper, VN MARKET planned; broker-sync column; rows link stage workbenches, accounts link Account 360°) — per-deployment lifecycle lives HERE, no screen-level rail (DS §9 note 1) · 6-KPI · equity-by-stage overlay + per-venue contribution charts · deployments table · **9 tabs, all implemented**: Overview · Insight Charts (12 tiles, each with envelope caption + INSUFFICIENT_DATA as real state, venue-compare select) · Positions · Orders & Fills · Risk (canary envelope row marked) · Sessions (restart-recovery evidence) · Accounting (per account/currency, canonical in Execution cell) · Reconciliation (per-venue policy freshness; paper N/A) · Audit (command journal).
Must work: `venueScope` tweak (All/BINANCE/OKX/DERIBIT) filters every tab's rows AND the KPIs; tab row scrolls horizontally, never the page.
Done when: one scope change provably re-filters all 9 tabs.

## Phase 16 — Portfolio 360° (`HiFi Portfolio 360.dc.html`, WF 1h→3a, ops dark)
Depends: Phase 15 (row links).
Layout: header (PF-CRYPTO — name user-editable, id immutable) · NAV/alloc strip · tabs: **Structure & Correlation (primary)**: correlation matrix (alpha × alpha + vs market benchmark, DERIVED badge + formula ver + sample counts), **leader lens** (pick an alpha → its corr row, exposure lead, contribution highlighted), contribution panel, alpha rows linking Alpha 360° · Capital Ledger tab (append-only rows: movement chip, amount, before→after, operation id, actor+approval) · Approvals tab (5 decisions, typed conditions with expiry) · Incidents tab (0 open + resolved history with what closed them) · Audit tab · Overview tab stays the honest APX-6 empty state — no fake data.
Must work: leader-lens selection re-highlights matrix + panels; every id chips to its screen.
Done when: correlation panels render INSUFFICIENT_DATA when samples < threshold instead of numbers.

## Phase 17 — Account/Broker 360° (`HiFi Account Broker 360.dc.html`, WF 1g, ops dark)
Depends: Phases 12, 6.
Layout: solid-red guard band (live account) + identity line (acct-live-grid-v21 · Grid v2.1 · dep_88 · PF-CRYPTO · live · BINANCE · MARGIN/CROSS · settle USDT · rev 14 · SYNC OK 0.9s) · 3-column **Internal virtual (EXECUTION) / Physical broker (BROKER + digest + age) / Difference (DERIVED)** — diff shows `Δ 186.00 — funding accrual pending, INFO` with dry-run link · **Broker binding panel**: external_account_ref, credential alias VALID (secret never displayed), NET mode, table of 3 linked virtual accounts + footer `Σ virtual 41,000 vs physical 43,120 → headroom +2,120` + the rule "the aggregate check is THIS screen's job — one physical backs several virtual, never assigned per-alpha" · two-up: Sync history (with per-policy STALE row) + Reconciliation findings (+ Sync now / Dry-run buttons behind operatorAdmin).
Demo states: `aggregateHeadroom` OK/EXCEEDED — EXCEEDED = red banner: Σ virtual exceeds physical, ALL linked accounts fail closed; `operatorAdmin` hides mutation buttons.
Done when: headroom computes from the linked-accounts table, not a hardcoded value.

## Phase 18 — Hardening (contracts already written; no new screens)
- Break-glass in the Drawer (WF 5b): risk-reducing commands only, server-side preconditions, typed `BREAK-GLASS` confirm, automatic aftermath (incident + review approval SLA 24h + CRITICAL alert + no resume until review decides).
- Role lens (WF 5c): DENIED panels visible-but-withheld (lock + required role), amounts never, ids masked per binding scope, export inherits lens, role switch logged.
- §4g everywhere: LOADING skeletons (layout-stable), UNAVAILABLE (last-good as_of dimmed), density modes Operator/Manager/Quant.
- Chart interactions (WF 4g): ECharts replaces the hi-fi SVG stand-ins keeping envelope captions verbatim; tooltip = value + envelope; dataZoom + double-click reset; tile expand → full-width + table + export; series click cross-filters the sibling blotter with visible reset chip.

## Rules for every phase
UI copy English; stage names verbatim; ids only from CAST. Four separate fields always: runtime state · promotion stage · readiness · broker sync. PARTIAL/STALE/MISMATCH/DENIED never green, never hidden. Currencies never summed without FX policy. Every rendered id is a navigable chip. Palette/type from DS §7 (copy from hi-fi); sizes from DS §8, never from hi-fi pixels.
