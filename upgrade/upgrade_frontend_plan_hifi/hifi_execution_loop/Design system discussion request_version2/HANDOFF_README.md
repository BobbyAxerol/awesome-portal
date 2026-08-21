# HANDOFF_README.md
> Entry point for Claude Code / Codex implementing the Execution cluster (Gates R1/R2 + Paper → Sandbox → Canary → Live) of the Quant Ecosystem Portal.
> Owner-approved design deliverables, 2026-08-19. UI copy: English. Every hi-fi screen states its wireframe id (chip `WF <id>` in the header).

## 1. Read in this order
1. `EXECUTION_CLUSTER_GUIDE.md` — locked decisions D1–D6, screen inventory, nav/lineage graph, backend shape, non-negotiable UI rules.
2. `DESIGN_SYSTEM_EXECUTION.md` — token patch, §7 v2 IBM-carbon identity (authoritative palette + type), component contracts, chart envelope, state rules, §8 responsive contract, §9 component↔screen matrix.
3. `CANONICAL_CAST.md` — the one sample-data cast; screens and code fixtures must not invent ids outside it.
4. `IMPLEMENTATION_PHASES.md` — per-screen build order (Phase 0 shell → 6 hardening); follow it phase by phase.
3. `Execution Wireframes.dc.html` — approved wireframes (turn 3 newest → turn 1). Hi-fi must trace to these ids; 3c lists the 9 consistency fixes already applied at hi-fi.
4. The hi-fi screens below.
5. Source-of-truth spec: `uploads/ALPHA_POOL_TO_LIVE_PORTFOLIO_PORTAL_DESIGN_SPEC_v0.7_vi.md` (+ `uploads/PORTFOLIO_MANAGEMENT_CLI_GUIDE.md` for the admin-action catalog, `uploads/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` for entities). Spec wins on conflict; repo `portal-stable-v1.0.1` is the code baseline (tokens.css, base.css, shell.css patterns).

## 2. Hi-fi screens ↔ wireframes
| File | WF | Theme | Demo states (Tweaks) |
|---|---|---|---|
| `HiFi Gate R1 Review.dc.html` | 1a | governance light | viewerIsCreator (self-approval block) |
| `HiFi Gate R2 Review.dc.html` | 1b | light + dark ops preview strip | r1State VALID/EXPIRED |
| `HiFi Paper Workbench.dc.html` | 1c | ops dark | freshnessState FRESH/STALE · operatorAdmin |
| `HiFi Sandbox Certification.dc.html` | 1d | ops dark (venue: OKX TESTNET) | reconFinding NONE/CRITICAL (fail-closed) |
| `HiFi Canary Control Room.dc.html` | 1e | ops dark + double-red guard | brokerSync OK/STALE (scale blocked, protect open) |
| `HiFi Live Full Operations.dc.html` | 1f | ops dark + solid-red guard | brokerState OK/MISMATCH (banner replaces broker panel) |
| `HiFi Account Broker 360.dc.html` | 1g | ops dark + guard (live account) | aggregateHeadroom OK/EXCEEDED |
| `HiFi Portfolio 360.dc.html` | 3a (deep) | ops dark | Leader lens · tabs: Structure/Ledger/Approvals/Incidents/Audit implemented; Overview = honest APX-6 empty state |
| `HiFi Alpha 360.dc.html` | 2a + 2b | ops dark | venueScope All/BINANCE/OKX/DERIBIT — filters ALL panels + KPIs; 9 tabs implemented incl. 12-tile Insight Charts |
| `HiFi Command Center.dc.html` | 5a | ops dark | morning BUSY/QUIET — ranked cross-loop triage, fleet health, watchlist |
| `HiFi Approval Inbox.dc.html` | 4a | governance light | inboxEmpty; working filters; SoD rows dimmed |
| `HiFi Paper Exit Review.dc.html` | 4b | governance light + ops evidence | gate met/extend/reject decision bar |
| `HiFi Full Blotter.dc.html` | 4c | ops dark | working status filters, cross-filter chip w/ reset, row→funnel expand, keyset cursor |
| `HiFi Incident Detail.dc.html` | 4d | ops dark | incidentState OPEN/RESOLVED; resolve never auto-resumes |
| `HiFi Operations Queue.dc.html` | 4e | ops dark | alertRail; needs-attention default filter |
| `HiFi Paper Workbench VNM.dc.html` | 4h | ops dark | SUSPENDED_BY_CALENDAR ≠ error; VND; DNSE OTP strip |
| `HiFi Admin Action Drawer.dc.html` | 1i (upgraded) | ops dark drawer | applyOutcome VERIFIED/PARTIAL; 21-command catalog from the CLI guide; plan→apply→verify wired |

## 3. What is real vs sample
- All layout, states, copy, and interaction contracts are the design. All numbers/IDs are **sample data shaped by the DB schema guide** (consistent cast: PF-CRYPTO/PF-MAIN; Grid v2.1 dep_88/91/94; Carry v3.2 dep_74; MM v1.1; venues BINANCE/OKX/DERIBIT/VN MARKET from the venue registry — never hardcoded).
- Charts are hand-drawn SVG stand-ins; implement with ECharts/Lightweight Charts per spec §16, keeping each chart's **envelope caption** (window · interval · currency · as_of · authority · formula version · samples/coverage) exactly as rendered.
- Tabs/screens marked `COMMISSIONED — NOT IN THIS SLICE` are deliberate honest empty states; never backfill with fake data.

## 3b. Sizing: hi-fi is a sample, not a pixel spec
Hi-fi screens are composed at ~1440px. **Never hardcode their absolute widths/heights.** Implement layout with the repo shell (`shell.css`: `.portal-rail`, `--content-max`, `--content-gutter`, breakpoints 640/768/900/1024/1280) and the Responsive & scaling contract in `DESIGN_SYSTEM_EXECUTION.md` §8 — keep the hi-fi's proportions and hierarchy, let the grid decide pixels. Sidebar exists only ≥1024px; tables scroll inside panels; drawers go full-screen <720px.

## 4. Invariants baked into every screen (do not regress)
- AuthorityBadge (`EXECUTION | BROKER | DERIVED · as_of · age`) on every data panel; freshness judged per-venue policy.
- Runtime state · promotion stage · readiness · broker sync = 4 separate fields. Stage names verbatim `PAPER_OBSERVATION / SANDBOX_VALIDATION / LIVE_CANARY / LIVE_FULL`.
- Guard treatment: canary = double red border + shield + `LIVE · CANARY`; live = solid red border; never color-only.
- `STALE / MISMATCH / DENIED / INSUFFICIENT_DATA / PARTIAL` are rendered states; `202 ≠ success`; PARTIAL never green.
- Currencies (USDT/USDC/VND) never summed without an FX policy; chips mark non-base currency.
- Mutations only via CommandPlanDrawer (plan → step-up apply → verify), admin scope; CLI shown read-only; browser never runs a shell.
- Every rendered ID is a navigable chip; screens join by immutable lineage, never by name/time.

## 4b. Out-of-scope link targets (deliberate)
Links pointing at screens NOT in this slice — Promotion Timeline, Waivers & Conditions registry, Reports/EOD, full audit history, evidence-pack browser, `rec_*` reconciliation reports, `CX schedule` — are rendered as real anchors on purpose. Implement them as route stubs (honest "commissioned — later slice" page), never delete the link and never invent the screen. Break-glass (WF 5b) and role lens (WF 5c) are wireframe-approved contracts awaiting hi-fi; implement from the wireframe + guide rules.

## 5. Implementation order (from guide §7 / spec APX slices)
Slice 1–2: R1 + R2 · Slice 3: read-only Paper 360° · Slice 4: Admin plan/apply/verify · Slice 5: Portfolio 360° baseline · Slice 6: Sandbox certification · Slice 7: correlation/benchmark analytics · Slice 8: Canary/Live governance.
