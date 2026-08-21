# PHASE_TRACKER.md

> **The shared board for the Execution Loop.** Claude (frontend) and codex
> (backend) both read and write it, one row per phase, one row per hi-fi screen.
> Opened 2026-08-21.
>
> Companions: `IMPLEMENTATION_PHASES.md` says what each phase must DO,
> `EXECUTION_SCALE_AND_REFINE.md` says what it must survive, and this file says
> where each one actually IS.

## How to use it

- **Claude** updates the FE column and §4/§5. Frontend work never waits on a
  backend row being green — components are built against props, and props come
  from spec, not from an endpoint (see §3).
- **codex** updates the BE column and §6. §6 is the request queue: every
  `BR-EX-*` a phase needs, with the phase it unblocks.
- Neither side marks a phase `DONE` without evidence in the Evidence column.
  A gate that has not run is not a gate.

| Status | Meaning |
|---|---|
| `DONE` | Merged with green gates, evidence recorded |
| `WIP` | In progress this slice |
| `READY` | Unblocked, not started |
| `BLOCKED` | Waiting on a named dependency |
| `—` | Not applicable to that side |

The BE column uses the architecture lifecycle vocabulary from spec §2.3:
`CONTRACT_COMPLETE`, `FOUNDATION_COMPLETE`, `INTEGRATION_PENDING`,
`PRODUCTION_INACTIVE`, `OPERATIONAL_EVIDENCE_PENDING`, and `PRODUCT_COMPLETE`.
These qualify what is complete; they do not mean frontend `DONE`.

---

## 1. Phase board

| # | Screen (WF) | FE | BE | Needs | Evidence |
|---|---|---|---|---|---|
| 0 | Shell & shared components | **DONE** | `CONTRACT_COMPLETE` | — EX-BE-00R4 delivered | FE: 42 tests · build · visual baseline **drifted, see §9**; BE: registry rev 4 · 17 fixture profiles · fail-closed policy tests · generated OpenAPI/TS contract |
| 1 | Approval Inbox (4a) | `WIP` (screen + adapter complete; awaiting data) | `OPERATIONAL_EVIDENCE_PENDING` | registry activation (`query_enabled`) — **not** the fresh-PG rerun | EX-BE-05a endpoint over EX-BE-04a; FE adapter reconciled against the §5 field map; FE runs on `createFixtureApi` |
| 2 | Gate R1 Review (1a) | `WIP` (adapter built, on the port) | `OPERATIONAL_EVIDENCE_PENDING` | registry activation (`query_enabled`) — **not** the fresh-PG rerun | immutable evidence + plan/apply/poll + SoD/concurrency/audit implemented; FE obeys `eligibility.can_*` separately |
| 3 | Gate R2 Review (1b) | `WIP` (states built) | `FOUNDATION_COMPLETE` | EX-BE-03/05a/07 capital preview | master plan §§10.3, 12.2 |
| 4 | Paper Workbench (1c) | `BLOCKED` | `FOUNDATION_COMPLETE` | EX-BE-03/04b; M7 evidence | adaptive six-rung server charts; master plan §§10.4, 15.1 |
| 5 | Paper Exit Review (4b) | `WIP` (states built) | `FOUNDATION_COMPLETE` | EX-BE-03/05a evidence integration | master plan §§10.5, 12.2 |
| 6 | Admin Action Drawer (1i) | `READY`¹ | `FOUNDATION_COMPLETE` | EX-BE-02/05b; TS command capability | request-key/UNCERTAIN contract §7.3; production disabled |
| 7 | Operations Queue (4e) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-05b operation integration | EX-BE-04a bidirectional keyset delivered; ack≠resolve remains |
| 8 | Incident Detail (4d) | `BLOCKED` | `FOUNDATION_COMPLETE` | EX-BE-05a/05b/06 integration | source completeness required; master plan §§10.8, 12.2 |
| 9 | Command Center (5a) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-03/04b/06 | overlap+jitter SSE recovery; master plan §§10.9, 15.1 |
| 10 | Sandbox Certification (1d) | `BLOCKED` | `FOUNDATION_COMPLETE` | EX-BE-03/05a/05b; TS sandbox capability | production commands inactive; master plan §10.10 |
| 11 | Canary Control Room (1e) | `BLOCKED` | `PRODUCTION_INACTIVE` | EX-BE-03/04b/05b/06; owner live-canary gate | rev 4 profile contract delivered; shadow parity still required; master plan §10.11 |
| 12 | Live Full Operations (1f) | `BLOCKED` | `PRODUCTION_INACTIVE` | phase 11 evidence; EX-BE-08 | rev 4 profile contract delivered; source completeness + UNCERTAIN policy remain; master plan §10.12 |
| 13 | Paper Workbench VNM (4h) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-03/04b; venue/ATO/ATC decision | server age/timezone contract; master plan §10.13 |
| 14 | Full Blotter (4c) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-03/04b/07 | bidirectional keyset/cold-retention/funnel contract; master plan §10.14 |
| 15 | Alpha 360° (2a+2b) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-03/04b/07 | adaptive charts + batched previews/portfolio context; master plan §10.15 |
| 16 | Portfolio 360° (1h→3a) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-03/04b/07 | 150×150 cap; master plan §10.16 |
| 17 | Account/Broker 360° (1g) | `BLOCKED` | `INTEGRATION_PENDING` | EX-BE-03/04b/07 | full-binding aggregate; master plan §10.17 |
| 18 | Hardening | `BLOCKED` | `OPERATIONAL_EVIDENCE_PENDING` | EX-BE-08; implemented target subset | master plan §§13–14 |

¹ Phase 6's drawer shell, state machine and blocking rules are already built and
tested (§4). What is blocked is wiring it to a real command endpoint — the
screen can be assembled against fixtures the moment its catalogue is agreed.

---

## 2. Phase 0 — what landed

Built on branch `feat/execution_loop`. Scope was the component half of Phase 0;
the nav half is blocked (§6).

**Carbon isolation.** `[data-theme="operations-carbon"]` in `tokens.css`, applied
by `src/execution/ExecutionSurface.tsx` to a wrapper element rather than to
`<html>`. Custom properties set on that wrapper win for its subtree, so an
Execution token physically cannot reach a Research screen. This was the owner's
option 1, chosen over route-scoping precisely because it converts "do not touch
Research" from a discipline into a structural fact.

**Evidence:**

| Gate | Result |
|---|---|
| `npx vitest run` | **415 passed**, 1 skipped, 34 files (baseline was 383/33) |
| `npm run build` | clean |
| `scripts/portal-web-visual.sh` | **101 passed**, zero drift |

The visual gate is the one that matters here: 46 of those baselines are
operations-theme Research screens, and none of them moved.

---

## 3. Why frontend does not wait for backend

Every component below takes props whose shape is transcribed from a document
that already exists, so wiring them later is a mapping exercise rather than a
redesign. Recorded here so the parallelism is auditable rather than assumed:

| Prop shape | Source |
|---|---|
| `Envelope` — authority, as_of, source_sequence, freshness, warnings | `EXECUTION_CLUSTER_GUIDE` §5 |
| `ChartEnvelope` — 13 caption fields | spec v0.7 §16.2 |
| `PromotionStage`, `RuntimeState`, `Readiness`, `BrokerSync` | spec v0.7 §5.2 |
| `StrategyId`/`DeploymentId`/`AccountId`/`PortfolioId`/`ExternalAccountRef` | DB schema guide, layers 2/3/5/9 |

`src/execution/contracts.ts` is the transcription. If codex publishes a field
name that differs, the fix is that file, not the seventeen screens.

---

## 4. Shared component inventory

All in `apps/portal/frontend/src/execution/`. Every one renders in every state
on the fixture page at `/execution/_fixtures` (not a registry feature, not in
nav — it is the Phase 0 exit gate, not a product screen).

| Component | File | Enforces |
|---|---|---|
| `AuthorityBadge` | `components/badges.tsx` | DERIVED without a formula version is stated, not omitted |
| `FreshnessIndicator` | `components/badges.tsx` | PAUSED ≠ STALE — a closed venue is not a fault |
| `StatusChip` + order/operation/runtime/sync variants | `components/badges.tsx` | PARTIAL never green, in either vocabulary |
| `EnvironmentBadge` | `components/badges.tsx` | canary reads `LIVE · CANARY`, never `CANARY` |
| `GuardBand` | `components/lifecycle.tsx` | canary double border, live solid, same hue (D2) |
| `LifecycleRail` + `stageRail` | `components/lifecycle.tsx` | the rail reaches back to R1/R2 |
| `ObservationProgress` | `components/lifecycle.tsx` | `met` comes from the server, never inferred |
| `EvidencePanel` | `components/evidence.tsx` | a verdict without a link is an opinion |
| `SlaCell` | `components/evidence.tsx` | OVERDUE in words, not only in red |
| `VenueScope` / `VenueIdentity` | `components/scope.tsx` | venue is registry data (D5) |
| `ChartTile` + `envelopeCaption` | `components/chart.tsx` | the caption is the contract |
| `PanelState` / `PanelSkeleton` / `CommissionedPanel` / `CapNotice` | `components/states.tsx` | eight distinct claims, never one blank |
| `CommandPlanDrawer` | `components/drawer.tsx` | plan→apply→verify; 202 is not success |
| `VerificationChip` | `components/badges.tsx` | UNCERTAIN reads as escalate, not as wait |
| `CapabilityChip` | `components/badges.tsx` | per capability — no global green flag (§6.2) |
| `ProfileBadge` | `components/badges.tsx` | fixture and shadow are labelled; the other four are carried elsewhere |
| `reconcilePanelProfile` | `profile.ts` | a panel may claim less authority than its screen, never more |
| **`KeysetTable`** | `components/table.tsx` | no page numbers; counts from the server; numerics never ellipsised |
| `adapter.ts` | `adapter.ts` | decimals stay strings; unknown enums keep their raw token; a 202 reads as PENDING whatever the body claims |
| `ApprovalInbox` | `screens/ApprovalInbox.tsx` | an un-actionable row is dimmed, never hidden |
| `GateR1Review` | `screens/GateR1Review.tsx` | self-approval is derived, not trusted; **self-denial is allowed**, Deny locks only on EXPIRED/NOT_ELIGIBLE |
| `api/` + `decision.ts` | `api/ports.ts`, `api/rows.ts`, `api/fixtureApi.ts`, `api/httpApi.ts`, `decision.ts` | a 202 lands in `accepted`, never in `settled`; a refused read never becomes an empty list |
| `containers.tsx` | `screens/containers.tsx` | list · detail · plan · apply · poll, on the port |
| `GateR2Review` | `screens/GateR2Review.tsx` | an expired R1 locks the bar; a capital preview without an envelope is refused |
| `PaperExitReview` | `screens/PaperExitReview.tsx` | `met` is the server's; INSUFFICIENT_DATA is a third outcome that carries forward |
| `series.ts` (M2) | `series.ts` | finest interval that fits; a series that misdescribes its own resolution is caught |
| `subscription.ts` (M3) | `subscription.ts` | a gap voids the resume token; an epoch cutover waits for the server's deadline |

Tests are behavioural, not snapshots: `execution.test.tsx` fails if PARTIAL turns
green, if canary loses its double border, if the skeleton enters the
accessibility tree, or if Apply reports only its first blocker.

---

## 5. Deltas found while building

Recorded so codex and a later reader see decisions, not drift. Screen-level
deltas live in `EXECUTION_SCALE_AND_REFINE.md` §7; these are the ones Phase 0
surfaced.

| # | Document says | Hi-fi / repo says | Resolution |
|---|---|---|---|
| P0-1 | DS §4: AuthorityBadge takes "color from `--authority-*`, glyph per authority" | Every hi-fi renders EXECUTION / BROKER / DERIVED in the **same** tones — `#f4f4f4` for the word, `#6f6f6f` for the meta | Hi-fi wins (HANDOFF §3). Authority is carried by the WORD. A hue-coded authority is invisible to a reader who cannot separate hues, and this distinction is load-bearing. Two tokens instead of four. |
| P0-2 | DS §7 lists 16 Carbon values | The hi-fi also uses `#4c4c4c` (Carbon `border-strong`), 8 occurrences | Added as `--line-strong`. DS §7 is 16/17 complete, not wrong. |
| P0-3 | DS §7: typography is IBM Plex Sans / Mono | Neither fontsource package is installed, and the repo has no Node toolchain on the host | Font stack declares IBM Plex first with Inter/JetBrains as fallback, so structure is right and only the typeface differs. Adding the two packages is a lockfile change — **owner decision, see §7**. |
| P0-4 | `.editorconfig` exempts Markdown from trailing-whitespace trimming | The pre-commit hook's `git diff --cached --check` did not | `*.md text -whitespace` in `.gitattributes`. Code paths keep the check. |
| P0-5 | DS §3: "Column headers: prose face micro-labels — **not mono**". DS §7 v2: "IBM Plex **Mono** carries labels, nav badges, buttons, tabs, IDs, all numerics, lineage strip, **table headers**" | Every `<th>` in the Full Blotter hi-fi is `font-family:'IBM Plex Mono'`, 10px, weight 500, uppercase, `letter-spacing:.08em`, `#8d8d8d` on `#1d1d1d` | The design system contradicts itself in two sections. Hi-fi wins (HANDOFF §3): headers are **mono**. `KeysetTable`'s CSS is transcribed from those values rather than invented, so the two sections can be reconciled by deleting the DS §3 clause. |
| P0-6 | Full Blotter hi-fi expands a row inline for the signal→fill funnel | Variable-height rows make virtualization at 182k rows unworkable, which is the reason BR-EX-13 asked for the funnel as a separate endpoint | Owner chose the **drawer**. `KeysetTable` therefore has `selectedKey` and no inline expansion, and rows stay a fixed 32px. Recorded here because the hi-fi still draws the caret. |

---

## 6. Backend decisions and remaining dependencies

### 6.1 Delivered unblocker

Registry revision 3 landed in `e78a597`: COMMAND / GOVERNANCE / DEPLOYMENTS /
ADMINISTRATION are canonical groups, all seventeen `EXECUTION_*` screens have
unique routes, and `/execution` is owned by Execution Command Center. Evidence:
53 focused contract/API tests plus root `./scripts/portal verify`. Phase 0 is no
longer blocked on backend registry work; frontend nav wiring remains frontend-owned.

Registry revision 4 (`EX-BE-00R4`) is now delivered. Every commissioned Execution
screen exposes `delivery_profile=fixture` and policy revision 1 with query,
projection, SSE and all four command classes disabled. Missing/inconsistent metadata
fails startup; OpenAPI, canonical public fixture and generated TypeScript contract are
in sync. Claude may wire `ProfileBadge` and fixture/shadow states without waiting on
`EX-BE-04a`, AWS or Trading System.

`EX-BE-04a` is now `FOUNDATION_COMPLETE`. `apps/control-api/src/query/` owns
the reusable TypeScript control-plane list primitive: HMAC-signed/expiring
`after`/`before` cursors, stable sort plus immutable-ID tie-break, allowlisted
filters/sorts, exact `total_count`/`filtered_count`, explicit public-column
projection, RBAC/workspace scope and one repeatable-read read-only PostgreSQL
snapshot. The canonical `keyset-page.v1` fields match `readKeysetPage` exactly.
Evidence: 14 focused tests on 182,000 PostgreSQL rows (including concurrent
insert/eviction, reverse navigation, cursor tamper/replay and injection), Control API
76/76, TypeScript contracts 8/8 and Python canonical contracts 7/7. It does
not itself create an Approval endpoint; its integration handoff is now consumed
by `EX-BE-05a` below. Detailed handoff:
[`EX_BE_04A_CONTROL_PLANE_QUERY_PRIMITIVES.md`](../../backend/EX_BE_04A_CONTROL_PLANE_QUERY_PRIMITIVES.md).

`EX-BE-05a` is implemented and is `OPERATIONAL_EVIDENCE_PENDING`.
`apps/control-api/src/governance/` plus migration `1723680000002` own the real
Portal Approval Inbox and R1 workflow: immutable evidence/findings/decisions,
evidence manifest integrity, SoD/eligibility, idempotent plan→apply→poll,
optimistic version/quorum, and atomic audit/outbox. External panels remain
`unavailable` and registry delivery remains `fixture`. Claude can now build the
response adapter against the field map in
[`EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md`](../../backend/EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md),
including the correction that Deny is allowed for self-authored evidence but
not for an expired/closed request. Strict typecheck and keyring tests pass; the
fresh PostgreSQL/Docker rerun is still an explicit backend release gate, not a
claimed pass. Codex has since confirmed it does **not** gate Claude's adapter
work, so phases 1 and 2 no longer carry it as a frontend dependency; what they
carry instead is registry activation.

### 6.2 BR-EX decisions

The binding contract is
[`EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md`](../../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md)
§15.1. All twenty-two requests now have a decision:

| Requests | Decision | Consequence |
|---|---|---|
| BR-EX-01, 02, 03 | **ACCEPT** | keyset, server filter/sort and exact counts unblock scalable phases 1/7/14 |
| BR-EX-04 | **MODIFY** | server selects the adaptive six-rung interval ladder and guarantees ≤5,000 points |
| BR-EX-05 | **ACCEPT + MODIFY** | zoom re-queries at the next finer rung; qualification records p50/p95/p99/RSS/scan cost |
| BR-EX-06 | **ACCEPT** | capped batched insight previews |
| BR-EX-07 | **MODIFY** | packed correlation through 150; ranked pairs/clusters above cap |
| BR-EX-08, 09, 10 | **ACCEPT** | ranked triage, typed grouping with ack≠resolve, one multiplexed SSE |
| BR-EX-11 | **MODIFY** | nullable true source sequence; Portal epoch/sequence + cursor and gap/resnapshot semantics |
| BR-EX-12, 13, 14, 15 | **ACCEPT** | server precision, funnel, full binding aggregate, required/echoed portfolio context |
| BR-EX-16, 17 | **ACCEPT** | source completeness and bidirectional keyset remove false continuity/navigation claims |
| BR-EX-18, 21 | **ACCEPT** | plan request-key idempotency and explicit target-aware `UNCERTAIN` safety policy |
| BR-EX-19, 20 | **ACCEPT** | server age/lag semantics and registry revision 4 delivery-profile propagation |
| BR-EX-22 | **ACCEPT** | v0.7 §21.4 budgets are provisional until measured owner-approved baselines replace them |

These decisions remove frontend contract uncertainty; they do not imply the real
Trading System authority is wired. Each screen's production status remains in the
BE column and the detailed gate is in master plan §12.2.

### 6.3 Backend disposition of the frontend review

`BACKEND_PLAN_REVIEW.md` F-1–F-9 were all accepted, with F-9 refined so safety is
target- and command-aware rather than a blanket lock. The immediate backend runway is:

1. `EX-BE-04a` TypeScript control-plane query primitives — delivered;
2. `EX-BE-05a` governance/evidence workflow — implemented; the fresh-PG rerun is
   a backend release gate and codex has confirmed it no longer gates the
   frontend adapter (2026-08-21). Recorded as codex's statement, not as a gate
   this side ran;
3. Claude: wire the Phase 1/2 adapters while keeping `fixture`/`unavailable` visible;
4. in parallel when assigned, `EX-BE-01→02→03→04b→06` for the Rust AWS read/projection/realtime path;
5. `EX-BE-05b` only after source command/auth capability is proven.

This closes the architectural disagreement: Approval Inbox and Gate R1 do not wait
for AWS networking, a Rust projection or a Trading System change.

### 6.4 Remaining external/owner dependencies

- Approve SGP↔AWS private connectivity, mTLS/delegated JWT and Portal-owned AWS
  projection database.
- Trading System owner: mandatory/dedicated gateway credentials, version/capability
  identity, command-journal evidence, monotonic delta/event contract, broader runtime
  events, trace IDs, source keyset and CLI-gap HTTP contracts.
- Confirm first real scope as Paper + BINANCE USD_M.
- Decide VNM calendar authority and ATO/ATC behavior.
- Approve risk-tier/SoD/WebAuthn policy and separate Live protective from
  risk-increasing activation.
- Choose the display-timezone default and approve HTTP/2/HTTP/3 evidence for the
  production same-origin SSE path.

No Portal agent may resolve these dependencies by modifying Trading System, reading
its database/Redis directly, shelling into its hosts, calling its CLI, or treating
fixture/shadow data as production authority.

---

## 7. Contract pack arrived — first reconciliation

`trading_system_portal_contract_pack/` landed 2026-08-21 09:31, while Phase 0
was being built. The discovery gate is closed: `extract/COVERAGE.json` reports
**15/15 COVERED**, `REDACTION-AUDIT.json` PASS over 70 files, no mutations.
Pin the gateway by image digest `sha256:4f63dc9949f8…`, not by git HEAD — the
running gateway is not built from the checked-out commit.

That makes it possible to check `contracts.ts` against runtime evidence rather
than against prose. First pass, using `extract/vocabularies.json`:

| Our type | Trading System evidence | Verdict |
|---|---|---|
| `RuntimeState` = ACTIVE / REDUCING / HALTED / ARCHIVED | `strategy_deployments.state` and `portfolios.state` CHECK = ACTIVE / ARCHIVED / HALTED / REDUCING | **exact match** |
| `PromotionStage` = PAPER_OBSERVATION / SANDBOX_VALIDATION / LIVE_CANARY / LIVE_FULL | no `promotion_stage` column anywhere in 94 tables | **confirmed Portal-owned** — matches spec §23.2, which lists promotion stage as an additive gap. Ours to define. |
| `BrokerSync` = OK / STALE / MISMATCH / UNKNOWN | `account_sync_snapshots.status` CHECK = **ERROR** / MISMATCH / OK / STALE | **mismatch** — the real system has `ERROR`, we have `UNKNOWN`. `ERROR` must be added; whether `UNKNOWN` survives as a Portal-side "not yet observed" is a modelling decision, not a transcription one. |
| `mode` (paper/sandbox/live) | every mode column = backtest / live / paper / replay / sandbox | we render three of five; `backtest` and `replay` are Research-side and out of Execution scope |

Two things follow. The approach in §3 held up — three of four vocabularies were
right from the documents alone. And a **full reconciliation pass of
`contracts.ts` against `extract/` is now a real slice**, not speculation: 22
enums, 91 DB CHECKs, 124 reason codes and 85 payload models are sitting there to
check against, and doing it before seventeen screens are built on those types is
much cheaper than after.

---

## 8. Open for the owner

1. **IBM Plex fonts.** Two `@fontsource` packages, a lockfile change and a CI
   `npm audit` pass. Without them the Execution surface has Carbon's colour and
   geometry but Inter's letterforms — DS §7 calls the mono-forward type part of
   the identity, so this is a visible gap rather than a cosmetic one.
2. **Order/fill ratio** (carried from the scale pass): 1,000 per day across
   150–500 deployments is ~2–7 per deployment per day. Every blotter, event and
   workbench budget rests on it.
3. ~~**Visual baseline re-record.**~~ **Closed 2026-08-21 — see §10.**

   Original note kept for the record:
   **Visual baseline re-record.** 52 of 101 baselines drifted when the registry
   grew the shared navigation rail. One diff was inspected: the content area is
   unchanged, only the rail moved, and the QuantBT label has not regressed. The
   remaining 51 have not been reviewed. Re-recording the batch without reviewing
   it spends the one gate that would have caught an unintended Research change.
   Recommendation is to review all 52, then re-record.

   **Re-measured 2026-08-21 after slices S1b–S5 and S4: still exactly 52 failed
   / 49 passed.** Nine commits of Execution Loop work added no drift at all,
   which is the Carbon isolation and the Lane A boundary both holding — the
   fixture page is not a registry feature, so it is not screenshotted, and no
   Execution token reaches a Research screen. The 52 are entirely the nav rail.
4. **Display timezone.** Everything on the wire is RFC3339 UTC and that is
   right. A Singapore team watching HK execution and a VN market still has to
   read times somewhere. Raised now so it does not surface during phase 13.

---

## 9. Backend master plan — reviewed

Codex delivered the initial `EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md`
(`29c9b17`, 907 lines) on 2026-08-21. The frontend review is
[`BACKEND_PLAN_REVIEW.md`](BACKEND_PLAN_REVIEW.md).

**Settled by the initial plan:** the original fifteen `BR-EX-*` were ruled
(11 ACCEPT, 4 MODIFY, none refused); `BrokerSync` and `UNKNOWN` resolved exactly as slice S1 concluded
independently; nine panel states and five freshness values match verbatim;
`PromotionStage` confirmed Portal-owned.

**Changed on this side in response** (slice S1b, before the review was written):
the envelope in `contracts.ts` now carries `projectionEpoch`,
`projectionSequence`, `sourceCursor`, `lagMs`, `panelState` and
`capabilitySnapshotId`; `VerificationResult`, `CapabilityState`, `RiskTier` and
`DeliveryProfile` are new; `VerificationChip`, `CapabilityChip` and
`ProfileBadge` are new components. Mechanism M2 no longer sends an interval, M3
resumes on `{epoch}:{sequence}`, and §3.1's ladder is restated as "finest
interval that fits" rather than fixed brackets — that last one corrects a mistake
this side made first.

**Backend response recorded** — all seven new requests `BR-EX-16 … BR-EX-22`
are ruled in master plan §15.1, and F-1–F-9 are dispositioned in §15.4. The
architectural disagreement is closed by splitting `EX-BE-04a/04b` and
`EX-BE-05a/05b`: Approval Inbox and Gate R1 now start on TypeScript/control-plane
PostgreSQL without waiting on Rust, AWS connectivity, a projection database or a
Trading System change.

**Registry revision 4 consumed** (slice S1c, same day it landed). `screens[]`
carries `delivery_profile` and a `delivery_policy` of seven independent flags.
`src/execution/profile.ts` reads both structurally rather than through the
generated `ScreenContract`, so the two sides did not have to land together.
Three rules are now enforced in code:

- a panel may claim **less** authority than its screen, never more; more is
  `unavailable`, fail-closed (`reconcilePanelProfile`);
- **no published policy is not permission** — `commandEnabled` returns false for
  every tier when `delivery_policy` is null;
- R3 protective and R4 risk-increasing read **different flags**, so enabling
  emergency protection can never enable capital expansion.

A cross-boundary test parses the shipped `registry.json` directly: every
published profile must resolve to a known value, and every screen must have all
four command tiers disabled. It fails the day a command is switched on in the
registry, which is the day somebody should be told.

**Slice S2 landed** — `components/table.tsx`, mechanism M1, bidirectional per
BR-EX-17. Evidence below.

**Governance screens wired to a port, not to an endpoint.** `ExecutionApi` has
two implementations. `createFixtureApi` is what the screens run on today and is a
real implementation rather than canned objects — rows go through the same
`readApprovalRow`/`readKeysetPage` path the network will, apply returns a
202-shaped receipt, and the poll walks three verification steps so a screen that
closed on the first response could not look correct. `createHttpApi` is complete
and currently answers `unavailable` for everything, because registry revision 4
ships every screen with `query_enabled: false`; refusing before the request is
deny-by-default applied to the network. Swapping the implementation is the only
change the real endpoint needs.

**Deny rule corrected, and it matches what codex implemented independently.**
This side previously claimed "Deny is never locked", which was too broad.
Self-denial is allowed — withdrawing your own artifact is the safe direction, and
a blocking finding is a reason to deny rather than an obstacle to denying — but
an `EXPIRED` request has nothing live to refuse and `NOT_ELIGIBLE` means the
actor cannot decide in either direction. Both gates lock Deny on exactly those
two; a closed gate removes its controls rather than disabling them.

**A mapping gap for the approval row.** The keyset fixture sorts by `sla_due_at`,
which is right for ordering and not sufficient for rendering: turning a due time
into `26h / 24h · OVERDUE` needs a clock, and per BR-EX-19 the only trusted one
is the server's. A row carrying `due_at` without `age_minutes` renders the SLA
cell as a stated gap rather than a number computed on a laptop. To be checked
against the `EX_BE_05A` field map in the next slice.

**Phase 0's navigation half is closed**, and it closed without bespoke work: the
shell has always computed navigation from the registry, so wiring the Execution
Loop in was revisions 3 and 4 landing plus an icon for each new key. That is now
evidence rather than a design claim — `navigation.test.ts` asserts that every
`EXECUTION_*` feature sits in a declared group, appears in the sidebar when it
opts in, resolves from its canonical route, has an icon this build can draw
(22/22 keys mapped), holds a unique route, and that the fixture page has not
leaked into the registry.


---

## 10. Visual baseline — reviewed, re-recorded, green

The 52 drifted baselines were reviewed before re-recording rather than after,
because re-recording a batch you have not read spends the one gate that would
have caught an unintended Research change. What the review found is worth
keeping, because the first hypothesis was wrong.

**Method.** For each of the 52, the expected and actual images were diffed
pixel-wise, the nav rail (x < 230) masked out, and what remained ranked. A
horizontal-shift search was run first to test whether the content had simply
moved; the best shift was 0 on every image, so it had not. **48 of 52 changed
outside the rail** — the "it is only the nav rail" reading, taken from one image
earlier, did not survive the other 51. The five distinct families were then
opened and read.

**Every change traced to one of three causes, and none of them is a regression:**

| Cause | Evidence | Screens |
|---|---|---|
| Registry revisions 3 and 4 | nav rail grew; Command Center reads `13 → 22 features in the registry` and `9 → 18 COMMISSIONED`, which is the registry-driven shell working correctly | all 52 (rail), Command Center (counts) |
| Feature label corrected | `QuantBT Research` → `QuantBT Backtest`; `registry.json` and `UNIFIED_IMPLEMENTATION_PLAN.md` §1 both say Backtest, so the **baseline** was the stale side | Research screens, Command Center |
| UI copy converted to English | `Tìm kiếm → Search`, `NGUỒN → SOURCE`, `ĐƠN VỊ → UNITS`, `Module dự kiến → Planned modules`, `LIÊN KẾT PORTAL → PORTAL … PLANNING LINKS` | Research and Planning |

**The third cause is not new drift.** It landed in `2c0cf9e` and `b23619f` on
**2026-08-18**, both already merged to `main` and both already in this branch's
base. The snapshots were last recorded on **2026-08-17**. The baselines were
four days older than the code they guarded, so `main` itself would have failed
this gate — the red was pre-existing debt, not something the Execution Loop
introduced. Nine slices of Execution Loop work added zero drift, which is the
Carbon isolation and the Lane A boundary both holding.

**Result:** re-recorded, then re-run **without** `--update` to prove the gate
compares rather than records: **101 passed, 0 failed.**

### 10.1 Discrepancy for Bobby — the language rule · **RESOLVED 2026-08-21**

> **Bobby's ruling:** English everywhere. The one exception is the Roadmap and
> Task-tracking **documents** already written in Vietnamese — those stay, because
> translating them is expensive and buys nothing. That is document content, not
> UI chrome: the labels, buttons, tabs and states around them are English.

`CLAUDE.md` §3.8 and §0 are rewritten accordingly, and the re-recorded baselines
already match. Repository, baseline and rule now agree. The original finding is
kept below because it is the reason the question was asked at all.

---

**Original finding:**

`CLAUDE.md` §3.8 and §0 say Research and Planning keep Vietnamese until a
separate conversion plan is approved. `main` converted both to English on
2026-08-18, three days before that rule was written. Re-recording has now baked
English into the baselines, because a gate must reflect the code that exists —
but the rule and the repository disagree and only the owner can settle which is
right. Recorded here rather than resolved, per rule §6: a mismatch between code
and documents is written down with evidence, not read whichever way is
convenient. If the answer is "revert to Vietnamese", the baselines are
re-recorded again and that is cheap; leaving the gate permanently red was the
expensive option.

---

## 11. Requests to codex

| # | Request | Status |
|---|---|---|
| C-1 | **Do not leave an allowlisted file untracked.** `scripts/verify-workspace.sh` checks an explicit list of files that must be tracked. On 2026-08-21 `apps/control-api/test/health.spec.ts` was on disk and in that list but not committed, so the pre-commit hook rejected **every** commit in the shared tree, including frontend-only ones. Adding a path to the allowlist and committing the file it names should happen in the same commit. | **Resolved** by codex the same day; kept as a coordination rule because the failure mode is silent for whoever added the entry and total for everybody else. |
| C-2 | `sla.age_minutes` / `budget_minutes` on the approval row, so SLA age is never computed from the browser clock (BR-EX-19). | **Delivered** in `EX_BE_05A` §5, before the request was sent. |

### 11.1 Constraint accepted from codex, 2026-08-21

> Claude may finish the Phase 1/2 adapter and drop the `fresh-PG gate pending`
> dependency, but `delivery_profile` stays `fixture` and every runtime flag
> stays false until `EX-BE-02`/`EX-BE-03` have evidence.

Accepted, and pinned as a gate rather than a promise. `execution.test.tsx`
asserts against the shipped `registry.json` that every `EXECUTION_*` screen is
`delivery_profile: fixture`, and that `query_enabled`,
`projection_ingestion_enabled`, `sse_enabled` and all four command tiers are
false. **Those tests are written to fail on the day activation happens** — that
is the point. When they do, the activation and the test update land in the same
commit, so nothing switches on unnoticed.


---

## 12. Phase 1 — what the frontend finished without codex

`IMPLEMENTATION_PHASES` §1 and `EXECUTION_SCALE_AND_REFINE` §6 were read back
against what had actually been built, and six things were missing. All six are
Lane A and none needed a backend.

| # | What §1 or §6 asks for | What was there | Now |
|---|---|---|---|
| 1 | "AP-352 = red-tinted row + 3px red left border"; "AP-360 = blockers red"; "AP-311 = whole row dimmed" — *copy exactly* | uniform rows | `rowEmphasis` on the table; overdue gets a **border as well as a tint**, so an SLA breach is not behind one hue |
| 2 | Footer strip: "overdue/due-soon counts · sort rule · **visibility ≠ authority**" | counts and sort only | the third clause is in. It is the sentence that explains the dimmed rows; without it the dimming reads as a rendering bug |
| 3 | §6: pending list **un-virtualized** — "if it exceeds 200 the problem is operational, not visual — surface that honestly rather than paginating it away" | virtualized above 200 like every other list | `neverVirtualize` on the table, and an overflow notice that says the condition is operational |
| 4 | §6: "Recently-decided gets M1 with a default 30-day window" | no window stated | window printed. Decided history is unbounded, and a list with no window silently claims to be all of it |
| 5 | §6 invariant: SoD rows "dimmed, never filtered out; a server-side filter must not drop them" | dimmed, but nothing would notice a drop | `inertCount`, counted by the server over the **whole filter**. If a filter drops separation-of-duty rows the count and the rows disagree, visibly |
| 6 | "row click navigates (AP-201→R1, AP-352→R2, EX-771→Paper Exit Review)" | one callback, no destination | `reviewRouteFor` routes **by gate, not by identifier** — deriving it from the id would work for the cast and fail on the first real approval |

The fixture API now honours cursors as well, forward and backward. A fixture
that returns the same page whatever the cursor lets a paging bug through
unnoticed, and the container's paging code was the one thing that needed
exercising.

**Evidence:** 649 tests, `tsc` clean, build clean, and the visual baseline still
**101/101** — Lane A touched no product screen, which is the boundary holding.

### 12.1 What Phase 1 still waits on, and it is not much

The screen is finished. What is left is not frontend work:

1. **Registry activation** — `query_enabled` for `EXECUTION_APPROVALS`. Until
   then `createHttpApi` refuses before it calls, by design.
2. **The route.** `/governance/approvals` renders the commissioned brief, and it
   should: putting the real screen there while it runs on fixtures would break
   the Lane A boundary — fixture data at a product route is exactly what that
   boundary forbids. The swap is one line in `MODULES` on the day the data is
   real.
3. **One discrepancy for codex.** `IMPLEMENTATION_PHASES` §1 lists seven chips —
   Mine / All / R1 / **R2** / Exit reviews / Live gates / Overdue. `EX-BE-05a` §3
   supports eight — `INBOX, ALL, R1, PAPER, SANDBOX, LIVE_GATES, EXIT_REVIEWS,
   OVERDUE`. The hi-fi has an **R2** chip the backend does not, and the backend
   has **PAPER**/**SANDBOX** chips the hi-fi does not. The frontend currently
   follows the backend's eight, since a chip that filters nothing is worse than
   a missing one — but the two lists should agree before phase 1 closes.
