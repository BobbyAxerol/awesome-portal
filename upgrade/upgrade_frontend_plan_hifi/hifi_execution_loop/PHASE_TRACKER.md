# PHASE_TRACKER.md

> **The shared board for the Execution Loop.** Claude (frontend) and codex
> (backend) both read and write it, one row per phase, one row per hi-fi screen.
> Opened 2026-08-21.
>
> Companions: `IMPLEMENTATION_PHASES.md` says what each phase must DO,
> `EXECUTION_SCALE_AND_REFINE.md` says what it must survive, and this file says
> where each one actually IS.
>
> `ROADMAP_FRONTEND.md` reads this board and answers one question from it:
> **what Bobby must decide next, and what Claude does meanwhile.** Decisions go
> there; status stays here.

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
| 1 | Approval Inbox (4a) | `WIP` (screen + adapter complete; awaiting data) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | **Claude:** canonical `view`, CSRF transport and reviewed registry activation; backend SGP gate is green | 117/117 fresh-PG; 182k Inbox; public-gateway Inbox/R1 smoke; registry remains fixture |
| 2 | Gate R1 Review (1a) | `WIP` (adapter built, on the port) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | **Claude:** canonical plan/apply/poll routes + CSRF + distinct Portal-governance-write policy | immutable evidence + SoD/concurrency/audit implemented; public-gateway decision:audit:outbox = 1:1:1 |
| 3 | Gate R2 Review (1b) | `WIP` (screen + adapter, on the port) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | source activation/evidence + EX-BE-05a decision integration; generated `portfolio_id`/`currency` already consumed | EX-BE-07b active-epoch capital-preview repository/API delivered; flags/profile remain fixture/off |
| 4 | Paper Workbench (1c) | **screen built** (fixtures, scale-refined) | `FOUNDATION_COMPLETE` | screen API + source integration; M7 evidence | EX-BE-04b adaptive six-rung/exact series + cold contract delivered; production source remains inactive |
| 5 | Paper Exit Review (4b) | **screen closed on Lane A** (5 capability, 3 outcome, CSRF) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | PRE-IAM-02 đã map xong (`5b39e34`); còn real Paper source activation | PRE-IAM-02 fresh PG 129/129 + contract 20/20 + SGP runtime green; closeout linked below |
| 6 | Admin Action Drawer (1i) | **screen built** (64 lệnh canonical, nhóm theo server, 403 denied) | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | đã tiêu thụ catalogue revision 2 (`6da8a43`); còn relay capability + Lane B | EX-BE-05b/F0: ADMIN-scoped conservative catalogue, immutable hash-only blocked plan/no outbox, bounded retry + real concurrent replay/conflict, denied apply, Rust replay/conflict/UNCERTAIN and 149 TS + 95 Rust tests; all command flags false |
| 7 | Operations Queue (4e) | `FRONTEND_INTEGRATION_PENDING` | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Claude consumes F1a Lane A; source routes remain external | SGP exact-count 182k bidirectional keyset + ack→resolve/idempotency/audit delivered; fixture/unavailable source retained |
| 8 | Incident Detail (4d) | `FRONTEND_INTEGRATION_PENDING` | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Claude consumes F1b Lane A; real source contracts remain external | SGP Portal workflow/evidence/correlation delivered; 159/159 fresh-PG + 44/44 contracts; four source panels fixture/unavailable; no auto-resume/outbox |
| 9 | Command Center (5a) | **screen built** (4 panel, 5 state, fixtures) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | dark snapshot + 5 state đã tiêu thụ (`ee3576c`); còn BR-EX-28 §8.1 `streams`/`alpha-activity`, real source + SSE parity | PRE-IAM-03 bounded snapshot: fresh PG 139/139, contracts 26/26, 20k exact-observed corpus; EX-BE-06 SSE remains dark |
| 10 | Sandbox Certification (1d) | `BLOCKED` | `FOUNDATION_COMPLETE` | EX-BE-05a/05b; TS sandbox capability | EX-BE-03 stale/gap blocker delivered; production commands inactive; master plan §10.10 |
| 11 | Canary Control Room (1e) | `BLOCKED` | `PRODUCTION_INACTIVE` | EX-BE-05b; owner live-canary gate | EX-BE-04b query + EX-BE-06 SSE foundations delivered; shadow parity and production source still required |
| 12 | Live Full Operations (1f) | `BLOCKED` | `PRODUCTION_INACTIVE` | phase 11 evidence; EX-BE-08 | rev 4 profile contract delivered; source completeness + UNCERTAIN policy remain; master plan §10.12 |
| 13 | Paper Workbench VNM (4h) | **screen built** (variant of phase 4, fixtures) | `INTEGRATION_PENDING` | source/screen API integration; venue/ATO/ATC decision | EX-BE-04b adaptive query + EX-BE-03 PAUSED semantics delivered; timezone decision remains |
| 14 | Full Blotter (4c) | **screen built** (fixtures, scale-refined) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | **Trading System source owner + Bobby:** publish scope-bound order-list capability; Claude retains fixture and 4-stage funnel limitation | EX-BE-07b typed active-epoch funnel API delivered over mTLS/delegated auth; flag remains off |
| 15 | Alpha 360° (2a+2b) | **screen built** (9 tabs, fixtures, scale-refined) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | source owner/Codex activation parity + remaining detail/series integration | EX-BE-07b capped portfolio-bound insight API delivered; flag/profile remain off/fixture |
| 16 | Portfolio 360° (1h→3a) | **screen built** (3 representations, fixtures, scale-refined) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | **Trading System source owner:** publish packed `sample_counts`; Claude labels per-cell floor unavailable | EX-BE-07b source-backed correlation + capital-ledger APIs delivered with exact decimals |
| 17 | Account/Broker 360° (1g) | **screen built** (fixtures, scale-refined) | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | **Trading System source owner:** publish authoritative aggregate exposure verdict; Claude keeps unavailable, never sums | EX-BE-07b source-backed full-population exposure API delivered; count mismatches fail closed |
| 18 | Hardening | `BLOCKED` | `OPERATIONAL_EVIDENCE_PENDING` | live EX-BE-08 cross-cell/load/soak/DR; offline foundation delivered | BE: 81-test sealed-corpus/replay qualification gate; production SLO/restore/rollback evidence remains; master plan §§13–14 |

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
| `GateR2Review` | `screens/GateR2Review.tsx` | an expired R1 locks the bar; a capital preview without an envelope is refused; **every capital row names its currency** |
| `PaperExitReview` | `screens/PaperExitReview.tsx` | `met` is the server's; INSUFFICIENT_DATA carries forward; **every evidence number links its source** |
| `series.ts` (M2) | `series.ts` | finest interval that fits; a series that misdescribes its own resolution is caught |
| `subscription.ts` (M3) | `subscription.ts` | a gap voids the resume token; an epoch cutover waits for the server's deadline; a heartbeat advances nothing |
| M3 transport | `sse.ts` | one stream per screen, snapshot first, exactly one resume parameter |
| Analytics contracts | `analytics.ts` | read the engine's figures; never compute money, a breach, or a direction |

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

`EX-BE-05a` is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` for the SGP
backend lane.
`apps/control-api/src/governance/` plus migration `1723680000002` own the real
Portal Approval Inbox and R1 workflow: immutable evidence/findings/decisions,
evidence manifest integrity, SoD/eligibility, idempotent plan→apply→poll,
optimistic version/quorum, and atomic audit/outbox. External panels remain
`unavailable` and registry delivery remains `fixture`. Claude can now build the
response adapter against the field map in
[`EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md`](../../backend/EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md),
including the correction that Deny is allowed for self-authored evidence but
not for an expired/closed request. Fresh PostgreSQL is green at 117/117 tests;
the isolated public-gateway path proves CSRF denial, canonical
plan→apply→poll and exact 1:1:1 decision/audit/outbox atomicity. Phases 1 and 2
now carry only Claude's canonical route/CSRF integration and a reviewed
Portal-governance-write registry policy before product activation.

`EX-BE-03` is `FOUNDATION_COMPLETE`; source ingestion integration remains
pending and production-disabled. The Rust edge now owns a pure deterministic
reducer, structured source cursor, Portal epoch/sequence, gap and dead-letter
state, complete/partial snapshots, replay/parity cutover, resume overlap with
server jitter, and the five-state freshness evaluator. Embedded SQLx migrations
and repositories persist the replayable projection in Portal-owned PostgreSQL;
they do not read Trading System storage or grant command authority. Evidence is
42 Rust tests, a real PostgreSQL 16 migration/restart/cutover gate, strict
Clippy/format checks and a 182,000-observation replay corpus. Claude may build
gap, epoch-cutover, stale/paused and freshness fixtures now; EX-BE-04b below
now supplies Query API primitives while SSE delivery remains `EX-BE-06`.
Detailed handoff:
[`EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`](../../backend/EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md).

`EX-BE-04b` is `FOUNDATION_COMPLETE`; screen API and production source
integration remain pending. Rust `query-api` and the projection PostgreSQL
repository now provide signed scope/epoch/query-bound forward/backward keyset,
closed filter/sort allowlists, exact total/filtered counts, currency-separated
full-population aggregates, string-only decimal precision, adaptive
1m/5m/15m/1h/4h/1d series capped at 5,000 points and typed immutable cold
retention. Evidence is 47 Rust tests on PostgreSQL 16 including 182,000 rows,
concurrent insertion + eviction + reverse navigation and 2,881 exact series
points. Claude may now build opaque previous/next controls, server-interval zoom
requery and cold-access fixtures; it must not claim a live endpoint. Next Rust
slice is `EX-BE-06` SSE. Detailed handoff:
[`EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md`](../../backend/EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md).

`EX-BE-06` is `FOUNDATION_COMPLETE`; source and activation evidence remain
pending. Rust owns one bounded multiplexed stream per screen, exact projection
cursor IDs, retained replay, epoch/history/source/slow-consumer gaps and a
single journal poller rather than per-client database polling. TypeScript owns
the session-guarded same-origin proxy over a reusable mTLS HTTP/2 session; JWTs
never reach the browser. Both feature flags and registry `sse_enabled` remain
false. Claude's next task is the M3 EventSource adapter and fixtures listed in
[`EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`](../../backend/EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md)
§6, while preserving fixture delivery. Codex proceeds with `EX-BE-07a` pure
analytics contracts in parallel; the resulting state is recorded immediately
below.

`EX-BE-07a` is `FOUNDATION_COMPLETE`; source repositories and narrow screen APIs
remain pending. Rust now publishes pure deterministic contracts for R2 capital
preview, Blotter funnel, Alpha 360 batch preview, Portfolio 360 correlation and
capital ledger, and Account/Broker 360 binding exposure. All decimal values stay
strings, currencies are never implicitly combined, missing source stages remain
missing/partial, and every result carries `DERIVED`, formula version, freshness
floor and population completeness. Evidence is 21 focused analytics tests and a
72-test locked Rust/PostgreSQL workspace gate. Claude should execute §6 of
[`EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md`](../../backend/EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md)
against fixtures only; registry delivery remains `fixture`.

`EX-BE-07b` is `INTEGRATION_COMPLETE / SOURCE_ACTIVATION_AND_OPERATIONAL_EVIDENCE_PENDING`.
Six PostgreSQL repositories now read only the active epoch in a read-only
repeatable-read snapshot and require exact delivery profile, capability,
adapter and fact counts before invoking EX-BE-07a. Six narrow private Rust
screen routes are exposed through a session-guarded TypeScript same-origin BFF
over reusable mTLS HTTP/2 and exact-resource delegated JWTs. OpenAPI, generated
TypeScript types and a canonical fixture are committed. Both runtime flags stay
false and every registry profile stays `fixture`; this is not a live-source
claim. Backend evidence is 74/74 Rust/PostgreSQL tests with strict Clippy,
105/105 Control API tests, 9/9 contract tests and a green root workspace/Compose
gate. Claude may wire the six public routes and failure fixtures per §7 of
[`EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md`](../../backend/EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md)
without waiting for source activation.

Backend hardening checkpoint H1–H3 is complete. The same-origin SSE proxy now
releases its private HTTP/2 stream on downstream close or session-lease loss;
the Rust poller is retrying/readiness-aware and cursor-scoped to ACTIVE epochs;
realtime freshness is server-evaluated and policy-versioned. Evidence is 75/75
Rust/PostgreSQL plus strict Clippy/rustfmt. Delegated assertions preserve the
Portal-session `auth_time`, and R2 Capital Preview is ADMIN-only plus immutable
workspace/portfolio/currency bound. Analytics snapshots now verify ordered fact
digests, full-fact venue-aware quality and bounded payloads; the TypeScript
bridge has a FIFO concurrency/queue bulkhead and hardened HTTP/2 lifecycle.
Fresh-PG Control API build + 111/111 tests pass. This does not change Claude's
fixture contract or activate any delivery flag.

Offline `EX-BE-08a` is `OFFLINE_FOUNDATION_COMPLETE /
LIVE_SOURCE_AND_CROSS_CELL_EVIDENCE_PENDING`. Rust now seals compatibility-bound
corpora, checks reducer/replay/frozen-digest parity, blocks source gaps and emits
only redacted bounded evidence. The full Rust/PostgreSQL gate passes 81 tests
plus strict Clippy/rustfmt. D1–D4, a published production source mapper, live
parity, cross-cell load/fault/soak/restore evidence and explicit owner activation
still precede `fixture -> shadow`. Claude may keep implementing failure-state
fixtures but must not bind live topics or change delivery profiles. Detail:
[`EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md`](../../backend/EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md).

Dual-cell D0 is now `D0_EVIDENCE_COMPLETE / D1_OWNER_DECISION_PENDING`.
AWS-HK and SGP were inventoried read-only; no package, network, key, firewall,
container, database, Trading System source or delivery flag changed. The locked
path is SGP TypeScript → WireGuard/H2 mTLS/delegated JWT → AWS Portal Edge, with
an AWS-local Portal Source Proxy as the only exact-GET caller of the TS loopback
gateway. D1 network, D2 dark services, D3 public/auth probes and D4 Paper
BUILDING-epoch evidence remain separately gated. Claude should continue fixture
and failure/recovery UI only; no live topic or profile flip is unlocked. Detail:
[`EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md`](../../backend/EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md).

D1 offline preparation is now `OFFLINE_PREPARATION_COMPLETE /
D1_OWNER_EXECUTION_PENDING`: versioned WireGuard/mTLS/JWT/Source Proxy
templates, a value-redacting fail-closed preflight, dark Compose render and
rollback runbook are CI-gated, but no network, service, source read or runtime
flag was activated. This unlocks no new live FE profile. Claude should continue
fixture, unavailable, stale, reconnect and recovery UX without assuming AWS
availability. Detail:
[`EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md`](../../backend/EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md).

The live D1 checkpoint is `D1_NETWORK_ACCEPTED / APPLICATION_DARK`: the exact
AWS rule is privately recorded, both cells passed activation preflight, the
tunnel and link-loss behavior are accepted, and public 8443/8444 remain denied.
No Portal service/source/profile is active; D2 retains a separate owner window
and operator-role/image/identity/resource/DB stop-gates. This still unlocks no
live FE profile; Claude should continue fixture/failure-state work only.
Evidence:
[`EX_BE_02_LIVE_D1_EXECUTION_EVIDENCE.md`](../../backend/EX_BE_02_LIVE_D1_EXECUTION_EVIDENCE.md).

IAM and D1 were requalified on 2026-08-23 as
`IAM_VERIFIED / D1_REVALIDATED / APPLICATION_DARK`. The real role matched the
private EC2/VPC/subnet/SG/EIP/route-table record, with one exact WireGuard rule
and zero unsafe overlaps. Both peers remain healthy, public 8443/8444 are
denied, no Execution Portal workload is running and Trading System public
health is unchanged. The attached temporary role and IMDS hop-limit two still
block D2. This unlocks no live frontend consumer. Evidence:
[`EX_BE_02_LIVE_IAM_VERIFICATION_AND_D1_REVALIDATION.md`](../../backend/EX_BE_02_LIVE_IAM_VERIFICATION_AND_D1_REVALIDATION.md).

The D2 hardening checkpoint is `D2_HARDENED / LIVE_DEPLOYMENT_BLOCKED`.
Dark Edge now starts without initial/background source probes; seven exact
Source Proxy guards return 503 with no Trading System read credential. A private
TLS/SCRAM projection PostgreSQL, separate migration/runtime roles and one-shot
Rust migrator are integration-tested, including no-DDL/no-plaintext and Edge
readiness with no source. This still unlocks no frontend live profile. Claude
continues typed unavailable/dark states only; no EventSource, Lane B, query,
analytics or command activation. Evidence:
[`EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md`](../../backend/EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md).

Live host admission is now realigned for the owner-approved shared-host model.
`D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED` means the current
Trading System workload is captured as a preflight baseline and D2 is judged
by bounded 15-minute CPU/memory/I/O deltas plus emergency absolute ceilings.
Both historical OOMs were non-Portal 256 MiB workers and Bobby accepted that
attribution. No Portal service has started and there are no source/UI
capability changes. Evidence:
[`EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md`](../../backend/EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md).

D2 owner/change-window handling is now
`D2_AUTHORIZATION_CONTRACT_PREPARED / LIVE_D2_UNAUTHORIZED`. The backend
validator separates readiness from activation and permanently rejects source,
ingestion, Query, analytics, SSE, delivery-profile, command and Trading System
change authority. No window is open and no runtime changed. This unlocks no FE
profile; Claude continues only fixture/dark/unavailable/recovery work. Evidence:
[`EX_BE_02_LIVE_D2_AUTHORIZATION_CONTRACT.md`](../../backend/EX_BE_02_LIVE_D2_AUTHORIZATION_CONTRACT.md).

The D2 placement decision is final for this release: the full Portal remains
on SGP, while only the bounded Source Proxy, Rust Edge and private dark
projection boundary may run on the existing AWS-HK host. No new EC2/EIP/D1B is
authorized. D2 has a 5.00 vCPU / 5,632 MiB peak hard ceiling and a 4.00 vCPU /
4,608 MiB long-running hard ceiling; these are not reservations. D4 business projection storage will require a
separately encrypted volume on that same host. This still authorizes no live
frontend consumer; Claude keeps all live consumers off. Decision packet:
[`EX_BE_02_D2_PLACEMENT_DECISION.md`](../../backend/EX_BE_02_D2_PLACEMENT_DECISION.md).

The generated `portal_current_hifi_research_loop/` HTML/PNG/font export is
classified as reproducible local visual evidence and is intentionally ignored,
not product source. Claude's tracked `hifi.config.ts`, exporter, routes and
fixtures remain the canonical implementation inputs.

The live aggregate shared-host diagnostic subsequently passed with zero
blockers, but the IMDS hop-limit-one DryRun remains unauthorized on the actual
D1 operator role. Backend status is `HOST_PREFLIGHT_ACCEPTED /
IAM_ISOLATION_NOT_AUTHORIZED / LIVE_D2_UNAUTHORIZED`. This changes no frontend
profile: Claude keeps source/query/realtime/command consumers off. Evidence:
[`EX_BE_02_LIVE_D2_SHARED_HOST_REQUALIFICATION.md`](../../backend/EX_BE_02_LIVE_D2_SHARED_HOST_REQUALIFICATION.md).

The backend isolation operation is now machine-ordered and fixture-tested:
IMDS hop-limit one, exact profile detachment, then IMDS credential absence.
Status is `D2_ISOLATION_EXECUTABLE_PREPARED / LIVE_D2_UNAUTHORIZED`; it remains
backend-only and unlocks no Claude consumer.

D3 offline preparation is `D3_OFFLINE_PREPARATION_COMPLETE /
LIVE_D3_UNAUTHORIZED`. A separate overlay opens only the three public
contract/health/capability probes; the four alpha paths remain 503 and all
projection/query/SSE/analytics/command flags remain false/`fixture`. The
canonical TypeScript issuer, mode-0600 negative JWT corpus and redacted
H2/TLS1.3 mTLS probe harness are tested offline, but no live cross-cell claim is
made. This unlocks no frontend profile. Claude continues fixture, dark,
auth-denied and recovery UX only; no EventSource/Lane B/AWS polling. Evidence:
[`EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md`](../../backend/EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md).

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
| BR-EX-08, 09, 10 | **ACCEPT** | PRE-IAM-03 delivers dark server-ranked triage; typed grouping keeps ack≠resolve; EX-BE-06 SSE remains dark until parity evidence |
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
4. `EX-BE-01→02→03→04b→06` delivered the Rust AWS contracts, authenticated
   bounded transport, replayable projection, scalable query and multiplexed
   realtime foundations; source/activation evidence is still pending;
5. Claude: implement M3 EventSource integration/fixtures from the EX-BE-06
   handoff, while keeping registry delivery `fixture`;
6. Codex: `EX-BE-07a` pure analytics contracts/engines for phases 3 and 14–17 —
   delivered;
7. Codex: `EX-BE-07b` source repository and six narrow authenticated screen API
   integrations — delivered dark; source activation/evidence remains;
8. Claude: wire the generated EX-BE-07b same-origin contract and complete/
   partial/missing/forbidden/unavailable fixtures while keeping delivery
   `fixture` and all decimal values as strings;
9. Codex: offline `EX-BE-08a` qualification foundation is delivered: sealed
   corpora, reducer/replay/frozen-digest parity, gap blockers and redacted
   bounded evidence; live source/cross-cell evidence remains owner-gated.
   `EX-BE-05b` still starts only after source command/auth capability is proven.

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


---

## 13. Phases 3 and 5 — on the port, and read back the same way

Both screens now run through `ExecutionApi` — `getGateR2` and `getPaperExit`
alongside the inbox and R1 — and share one decision machine, because a
governance verdict is a plan/apply/poll like any other command and a `202` means
the same thing on all four screens.

Then `IMPLEMENTATION_PHASES` §3 and §5 were read back against what had been
built, the way §1 was. That found six gaps in Phase 1; it found six here.

| # | What §3 or §5 asks for | Now |
|---|---|---|
| 1 | Scale-refine I-4: the capital diff is **per currency** — "the strip must name its currency rather than implying a single number" | `currency` is its own column and its own field. A row that does not state one renders `not stated` and the adapter counts it as a gap. Currency was previously baked into the value string, so a USDT row above a VND row read as though they added up |
| 2 | §3 "Must work": **the R1 reference links to the R1 decision** | linked when a href is published; when none is, the chip says so rather than looking clickable. A reference a reviewer cannot open is a claim |
| 3 | An unreadable R1 state | maps to `MISSING`, which **blocks**. A reference we cannot understand is not one we may proceed on |
| 4 | §5 "Must work": **every evidence number links its source** (sessions tab, blotter, portfolio panel) | `href` + `sourceLabel` per finding; an unlinked one prints `no source link` and the adapter counts it. This screen decides a promotion, and a figure with nowhere to check it is an assertion rather than evidence |
| 5 | §5 layout: **lineage line** — artifact · R1 · R2 · observation policy · evidence-pack digest | rendered, with links where published. Without it a reviewer is asked to trust four earlier decisions they cannot see |
| 6 | §5 footer: "**Extend observation +14d** / **Reject — back to Paper HELD** / Approve promotion" | the labels carry their consequence. "Reject" alone does not tell a reviewer the deployment stops trading; "back to Paper HELD" does |

One more, from the adapter rather than the layout: an unpublished `gate_met` is
read as **unmet** and recorded as a gap. Absent is not met, and inferring it
from the coverage numbers printed beside it is precisely what this screen must
not do.

**Evidence:** 665 tests, `tsc` clean, build clean, visual baseline **101/101**.

### 13.1 Still open on these two

- **Phase 3 layout.** §3 asks for the decision bar **pinned top** and a
  two-column split, with the capital preview as a **dark-on-light strip**. The
  current build is a single column with the bar at the bottom. That is a visual
  gap, not a correctness one, and it is worth doing against the hi-fi rather
  than from the prose — logged here so it is not mistaken for finished.
- **Phase 3 "capital preview recomputes from requested amount".** Static today.
  It needs either a client recompute rule or a server preview endpoint; the
  second is correct, because a client that recomputes capital is a client
  inventing a number. Backend request when the phase is next picked up.
- **Conditions composer** (§3 "R2 approval creates typed conditions"): the
  decision path exists, the typed composer does not.

---

## 14. Design-system audit, and the conversion it produced

An audit of everything built so far against `DESIGN_SYSTEM_EXECUTION.md`, the
four governance hi-fi files and `CANONICAL_CAST.md`. The semantic rules held —
authority, freshness, the four fields, `202`, deny-by-default, all carried by
tests. The visual and structural side did not, and it failed in one systematic
way: DS §1 was read as a list of rules rather than as a **map of which surface
each screen belongs to**.

### 14.1 The finding

DS §1 assigns Governance (Approval Inbox, R1, R2) to a **light** theme and the
Deployments screens to the dark one. The hi-fi files confirm it in their own
CSS — the four governance mocks set a white page background, Paper Workbench
sets the Carbon near-black. Everything built so far was wrapped in one dark
surface, so four of the five screens rendered on a canvas the hi-fi never drew,
and Gate R2's *signature element* — a dark capital strip inside a light page —
could not exist, because there was no light page for it to sit in.

### 14.2 What DS §1 says versus what it means

§1's literal value is `research (light)`, the repo's Fund Paper theme: warm
cream on a teal accent. The governance hi-fi files draw Carbon light: white,
neutral hairlines, Carbon blue. §1 predates the §7 restyle of 2026-08-19 that
moved operations to a Carbon identity, so its **intent** holds — governance is
light — while its named theme is stale. HANDOFF §3 settles it: the hi-fi is the
visual authority.

Recorded as delta **P0-7**: a third theme, `operations-carbon-light`, the light
counterpart of `operations-carbon`. Fund Paper is untouched, so the Research
screens stay exactly where they were, and the isolation mechanism is unchanged —
still a wrapper, still unable to reach Research.

### 14.3 Two palette bugs the extraction caught

Worth recording because both would have shipped and neither is obvious:

- **`--line-soft` had the sunken-surface value.** The hi-fi runs a *two-tier*
  hairline — the outer card border and a lighter inner rule for table rows and
  card-header dividers. The inner tone is the single most frequent colour in the
  Approval Inbox file. Set to the surface value, every row separator on all four
  screens would have gone invisible on white, and `.exec-rail`'s 1px gaps with
  them.
- **`--surface-3` had a hairline value.** That tone is never a fill anywhere in
  the four files; the one real fill is the lifecycle stepper strip's.

A third token was added: `--bad-bg-soft`, a step below the banner fill, for the
overdue **row** tint. Without it the implementer reaches for the banner fill and
a single overdue row shouts as loudly as a statement about the whole screen.

### 14.4 Components that existed and were not used

| DS says | Was |
|---|---|
| `EvidencePanel` — R1, R2, exit reviews, Sandbox Cert | built in Phase 0, then each screen wrote its own list. Three renderings of one rule: *a verdict without a link is an opinion* |
| `LifecycleRail` — exit reviews among its users | absent from Paper Exit, which the hi-fi draws with one |
| `ConditionList` — R1/R2, passports, exits | never built, which is why "approve with condition" was a button with nothing behind it |

All three are now used where DS §9 assigns them. `ConditionList` is the last of
the eleven DS §4 components to exist; `BrokerStateDiff` and `InsightClaim`
remain, and both belong to phases not yet started.

### 14.5 Cast drift

`CANONICAL_CAST.md` states that it wins over a screen. Here the **screen was
right and the fixture was wrong**: the hi-fi's Approval Inbox is cast-conformant
and the fixture had drifted from it — inventing `AP-341`, giving `AP-259` an R1
gate it does not have, putting `AP-352` on BINANCE paper when the cast has it on
OKX TESTNET sandbox, and using `AP-259` as the separation-of-duty row where both
the cast and the hi-fi use `AP-311`. `AP-259` and `PX-31` belong in Recently
decided. Fixed in both the literal fixtures and the port's.

### 14.6 One conclusion of the audit was itself wrong

§13.1 said §3 asks for the decision bar **pinned top**. It does not. That came
from `IMPLEMENTATION_PHASES` §2's prose about Gate R1 and was generalised. All
four governance hi-fi files put the action row **last in normal flow, not sticky
and not pinned** — which is what was already built. Withdrawn.

---

## 15. Gate R2 — second read-back, after the light conversion

The first read-back of §3 (recorded in §13) predates the light theme, the two-up
grid and the conditions composer, so it was re-run against the current screen.
Five findings; one of them clears the code rather than condemning it.

| # | §3 or the hi-fi says | Current | Verdict |
|---|---|---|---|
| R2-1 | The blocked banner reads in full: *"AP-201 expired 2026-08-18. This R2 review cannot be decided against stale research evidence; re-run Gate R1 or extend its waiver. Approve is disabled."* | a one-line reason without the **date**, the **remedy** or the scope | **gap** — the date is what makes "expired" checkable rather than asserted, and "re-run Gate R1 or extend its waiver" is the only place the screen tells a reviewer what to do next |
| R2-2 | §3: *"right: R1 reference panel (decision, digest, **expiry**)"* | R1 is a chip in the meta strip; no expiry | **gap** — without the expiry a reviewer cannot see how stale the R1 is until it has already lapsed |
| R2-3 | Hi-fi footnote: *"evidence digest sha256:c81f… · decision is recorded against policy approval.v3 · conditions are typed objects with owner/deadline/expiry, never free text"* | absent | **gap** — the last clause is the screen explaining its own conditions model, and it is the sentence that stops somebody asking for a free-text box |
| R2-4 | §3: *"Data: **AP-352** Carry v3.2 → PF-MAIN (CAST)"* | fixture uses `AP-207`, and its R1 reference is `AP-201` — RSI's R1, a different alpha | **gap** — and the hi-fi drifts here too, using `AP-201`. `CANONICAL_CAST.md` wins: Carry v3.2's R1 is `AP-101`, and `AP-352` targets dep_77 on OKX TESTNET |
| R2-5 | §3 prose: *"EXPIRED **disables the whole decision bar**"* | Approve locked, Deny available | **not a gap.** The hi-fi's own banner says "**Approve** is disabled", and EX-BE-05a allows denial of a request whose evidence has lapsed. §3's prose is loose; the hi-fi and the backend agree with the code |

R2-5 is the useful one. Two of the five earlier read-backs produced a finding
that turned out to clear the implementation, and both times the prose was the
loose party — §3 here, and §2's "decision bar pinned top" in §14.6. The pattern
is worth naming: `IMPLEMENTATION_PHASES` summarises, the hi-fi draws, and where
they differ the drawing is the specification.

**Still needing the backend:** §3's *"capital preview recomputes from requested
amount"*. That belongs to a server endpoint — a client that recomputes capital
is a client inventing a number — and becomes a request when EX-BE-07 is picked
up.

---

## 16. M3 EventSource adapter and the analytics contracts (2026-08-22)

Bám `EX_BE_06_*.md` §6 (handoff cho Claude) và `EX_BE_07A_*.md` §2/§3/§6.
Frontend giữ nguyên `source_profile: fixture`; không endpoint nào được nối thật.

### 16.1 M3 — reducer và transport

`subscription.ts` thiếu ba thứ so với SSE thật, và một trong ba là lỗ do client
tự tạo ra:

| # | Thiếu | Vì sao nguy hiểm |
|---|---|---|
| M3-1 | không có **heartbeat** | heartbeat gộp vào `DELTA` sẽ đẩy `Last-Event-ID` qua những event chưa bao giờ được giao. Lần reconnect sau resume từ một điểm client tự bịa — một lỗ do client mở, và sau đó nhìn *giống hệt* delivery liền mạch |
| M3-2 | không có `auth.expiring` | credential hết hạn sẽ hiện ra như lỗi mạng, và operator đi kiểm tra nhầm chỗ |
| M3-3 | gap reason là **free text** | `slow_consumer` là lỗi của browser này, `history_evicted` thì không client nào sửa được. Gộp cả hai thành "connection problem" là gửi operator đi sai hướng |

Đã sửa: `GapReason` sáu giá trị + `readGapReason` (narrow, không đoán),
`HEARTBEAT` **không mang sequence — theo cấu trúc**, `AUTH_EXPIRING` không đổi
phase (stream vẫn đúng, chỉ là ta biết vì sao nó sẽ dừng).

`sse.ts` mới: một `EventSource` cho mỗi màn, snapshot-first, `streamUrl` ép
**đúng một** tham số resume (`snapshot_cursor` khi connect đầu, `last_event_id`
khi reconnect — gửi cả hai là 400). Native `EventSource` không set được header,
nên reconnect do client chủ động phải mang cursor qua query param.

**Mutation check:** dựng lại đúng lỗi M3-1 (heartbeat → `DELTA`) ⇒ test đỏ 1/18,
gỡ ra ⇒ 18/18. Gate cắn thật.

### 16.2 Analytics — viết theo OpenAPI, không theo prose

Codex publish `packages/contracts/openapi/execution-analytics.openapi.json` +
fixture `execution-analytics.capital-preview.valid.json` giữa chừng slice này.
Bản `analytics.ts` đầu tiên viết theo prose và **sai 9 tên trường**:

| Đoán | Thật |
|---|---|
| `data.lines[]` | field map phẳng: `allocated_before/after`, `available_before/after`, `allocation_headroom_before/after`, `maximum_allocated` |
| `data.*` | envelope hai lớp: `analytics.data`, metadata đọc ở `analytics` và ở gốc |
| `stage.name` | `stage.stage` |
| `claim_code` | `insight_id` + `alpha_id` |
| `value`/`unit` | `metrics[]` với enum 5 giá trị |
| `packing: "LOWER_TRIANGLE"` | `representation.matrix.packing: "LOWER_INCLUDING_DIAGONAL_ROW_MAJOR"` |
| `pairs[].a/b/value` | `left_id/right_id/coefficient/sample_count` |
| `external_account_ref` | `binding_id` |
| `completeness` | `population_completeness` |

**Không màn nào đổi.** Chỉ `analytics.ts` + fixtures. Đây là lần thứ hai port
design trả công đúng như vậy (lần đầu: EX-BE-05a, 4 trường).

Test đọc thẳng fixture codex publish, nên schema đổi ở upstream sẽ đỏ ở đây chứ
không đỏ trong browser.

### 16.3 Sáu ràng buộc đã đóng bằng test

| Ràng buộc | Cách giữ |
|---|---|
| Không tính tiền phía frontend | mọi line dựng bằng **gọi tên** một cặp field server; thêm gate quét toàn bộ `execution/**` tìm phép toán trên tên field tiền — có test tự chứng minh gate cắn. `?? "0"` bị gỡ: thiếu số ≠ số 0 |
| `decision_eligible=false` | lock `PREVIEW_NOT_DECIDABLE` — khoá Approve, **giữ số hiển thị**, **không khoá Deny**. Prop tri-state: `undefined` ("chưa hỏi") không được đọc thành "engine đồng ý" |
| Funnel đủ 4 stage | luôn render cả bốn theo thứ tự canonical dù server gửi một; ack không bao giờ suy ra từ fill đến sau |
| Batch ≤ 64 | `insightBatchRequest` **ném** thay vì để server từ chối; `chunkInsightRequests` chia sẵn; portfolio bắt buộc và echo lại, lệch thì fail closed |
| Correlation 150/151 | 150 → packed `n(n+1)/2 = 11,325`, đường chéo đúng `"1"`, ngoài biên trả `null` (không phải `0` — `0` là khẳng định độc lập); 151 → `RANKED_PAIRS` ≤ 500 + clusters, không bao giờ cấp phát ma trận vuông |
| Population không được gọi là total | `isFullPopulation` đòi `COMPLETE` **và** `account_count === expected_account_count`; cờ và số mâu thuẫn thì lấy nghĩa yếu hơn |

Thêm capital ledger: bucket theo currency, `direction` lấy từ server —
entry `REBALANCE` amount `0` direction `UNCHANGED` là chuyện có thật, client đọc
dấu của amount sẽ gọi nó là không có gì.

### 16.4 Evidence

`vitest` **807 passed / 1 skipped** (từ 734, +73) · `tsc -b --noEmit` sạch ·
`npm run build` sạch · visual baseline **101/101**.

### 16.5 Còn treo

- `EX-BE-07b` đã giao sáu source-backed API ở trạng thái dark. Adapter có thể
  nối sáu same-origin route ngay; dữ liệu thật cho màn 14–17 vẫn `BLOCKED` đến
  `EX-BE-08a` source parity/qualification/activation.
- `sse.ts` chưa gắn vào màn nào: topic/source binding thuộc `EX-BE-08a`; không
  đoán topic trước khi contract ingestion được chốt.
- R2-1…R2-4 (§15) vẫn chưa sửa — Lane A, không chờ backend.

### 16.6 Soát ngược sau slice (2026-08-22, cùng ngày)

Bobby yêu cầu kiểm lại cả đoạn dài vừa sửa. Dò bằng probe reducer + grep khả
năng với tới, không dựa vào suy luận. **Ba lỗi thật**, cả ba đều bị test hiện có
bỏ lọt vì test chỉ đi đường thẳng:

| # | Lỗi | Vì sao test cũ không bắt |
|---|---|---|
| A-1 | **`DELTA` sau `gap` đưa panel về `live` mà không cần snapshot** — và `gapReason` còn dính lại trong lúc `live` | test cũ chỉ kiểm `resumeToken` bị void sau gap, không ai gửi tiếp một delta. Mà delta *sẽ* đến: server vẫn đang stream |
| A-2 | **`capitalDecidable` không được nối vào container** | test màn truyền prop trực tiếp, test container không đụng prop đó. Mỗi nửa xanh, khúc nối ở giữa không ai đi |
| A-3 | **Container tự bịa `capitalEnvelope`** `{DERIVED, asOf: null, UNKNOWN, capital.v2}` | placeholder từ trước khi có `analytics.ts`; không test nào hỏi envelope đến từ đâu |

A-1 là lỗi nặng nhất trong ba. Sau gap, delta kế tiếp *liền mạch* về sequence
(10 → 11), nên check contiguity đi qua và panel trở lại `live` — bỏ banner gap,
hiện dữ liệu **có lỗ đã biết** như là dữ liệu hiện tại. Đúng thứ M3 sinh ra để
chặn. Đã sửa: delta chỉ áp dụng khi phase là `live` hoặc `reconnecting`
(`reconnecting` giữ lại có chủ ý — resume trong epoch còn giữ là hợp lệ, và
check contiguity là thứ chứng minh nó hạ cánh đúng).

A-3 đáng nói riêng: đó là frontend **tự gán authority cho một con số tiền**,
đúng loại việc mà cả slice này dựng hàng rào để chặn — mà hàng rào chỉ quét phép
toán, không quét envelope bịa. Giờ envelope đọc từ response.

Kèm theo: `getCapitalPreview` thành method riêng của port (không gộp vào
`getGateR2` — preview phải re-request khi amount đổi, review thì không),
`httpApi` bị interface bắt thiếu method và đã bổ sung theo deny-by-default,
blockers render ngay dưới bảng số, và `MONEY_ARITHMETIC` chuyển lên trước chỗ
dùng (đang ở trong TDZ, chạy được nhưng gãy nếu ai đó đổi vị trí describe).

**Evidence sau sửa:** vitest **820 passed / 1 skipped** (+13 test mới đi đúng ba
khúc nối trên) · tsc sạch · build sạch · visual baseline **101/101**.

**Bài học ghi lại:** ba lỗi đều nằm ở *chỗ nối*, không ở trong module nào. Test
theo module xanh 100% mà đường dây vẫn đứt. Từ slice sau: mỗi khi thêm một prop
hoặc một method port, phải có ít nhất một test đi **hết** fixture → port →
container → màn, chứ không chỉ test hai đầu.

### 16.7 Generated types bắt thêm một lỗi nữa

Codex commit `054efc3` (`EX-BE-07b`) ngay trước commit audit, kèm
`packages/contracts/generated/execution-analytics.d.ts` — 520 dòng type sinh từ
OpenAPI. CLAUDE.md §7.6 nói phải regenerate và dùng chúng chứ không chép tay.
Đọc vào thì lòi ra lỗi thứ tư:

| # | Lỗi | Hậu quả thật |
|---|---|---|
| A-4 | `getCapitalPreview` viết là **GET** kèm `?requested_amount=` | operation published là **POST** với body `CapitalPreviewRequest`. Endpoint thật trả **405**, và không test frontend nào phát hiện được vì fixture không quan tâm verb |

Đã sửa: POST đúng verb, body **type theo generated schema**
(`components["schemas"]["CapitalPreviewRequest"]`) qua alias tsconfig mới
`@portal/contracts-analytics`. Từ giờ codex đổi tên trường thì `tsc` đỏ ở đây,
không phải browser đỏ lúc chạy.

Kèm phát hiện: request bắt buộc **ba** trường, mà row R2 chỉ cấp được một →
**BR-EX-23** (`EXECUTION_SCALE_AND_REFINE.md`). Không đoán portfolio từ chuỗi
`subject`, vì parse sai thì reviewer duyệt vốn cho nhầm portfolio.

Ghi chú: `apps/portal/registry/FRONTEND_HANDOFF.md` mà CLAUDE.md §7.3 trỏ tới
**không tồn tại trong repo**. Backend request ghi vào
`EXECUTION_SCALE_AND_REFINE.md` — file điều phối frontend đang thực sự dùng.

**Evidence sau sửa:** vitest **821 passed / 1 skipped** · tsc sạch.

---

## 17. Phase 14 — Full Blotter dựng xong (2026-08-22)

Codex đang xử lý authenticate cho hai server, nên chọn việc song song không đụng
gì: màn 14. Backend của nó `INTEGRATION_COMPLETE` từ `EX-BE-07b`, reader funnel
và fixture đã có từ §16, hi-fi và `IMPLEMENTATION_PHASES` §14 đều đầy đủ.

**Trước khi dựng, soát lại §15 (R2-1…R2-4): cả bốn đã đóng từ trước** — banner
có date + remedy, R1 panel có digest/expiry/decidedBy, footnote có, cast đã là
`AP-352` / `AP-101` / Carry v3.2. §15 là ghi chép cũ chưa cập nhật, không phải
việc còn treo.

### 17.1 Ba quyết định của màn

| Quyết định | Vì sao |
|---|---|
| **Chip không lọc ở browser** — chỉ report, caller re-query | 9 dòng `FILLED` cạnh footer "48,213 total" là hai con số mô tả hai population, trình bày như một |
| **Count lấy từ `page`**, màn không giữ bản sao | `KeysetPage` đã có `totalCount` + `filteredCount`, và `KeysetTable` đã render chúng — bản thứ hai là cách footer và bảng lệch nhau |
| **Số không bao giờ viết tắt** | `0.0400` là một size, `60,890.00` là một giá. Blotter làm tròn thì không đối chiếu được với sao kê venue — mà đó là việc duy nhất nó có |

### 17.2 Bắt được một lỗi khi tự soát

Bản đầu tôi khai `totalCount` / `selectionCount` làm props riêng của màn, và
viết `<footer>` render count + cursor + virtualization note. Cả ba **đã có trong
`KeysetTable`**. Test đỏ ngay (`page.totalCount` undefined) và đó là may — lỗi
thật không phải crash mà là *hai nguồn cho một con số*. Đã bỏ props và footer
trùng; màn giờ chỉ thêm một dòng đặc thù (fee theo currency của venue).

Đúng loại lỗi §11.3 Reuse report sinh ra để chặn, và tôi vẫn mắc — vì viết màn
mới trước khi đọc lại API của component dùng chung.

### 17.3 Hai backend request mới

- **BR-EX-24** — chưa có endpoint list order. `EX-BE-07b` giao funnel *của một
  order*, không có gì trả danh sách. Màn chạy typed props + fixture, đúng cách
  Gate R1/R2 chạy trước `EX-BE-05a`.
- **BR-EX-25** — hi-fi vẽ **5 hop**, contract publish **4 stage**. `signal` và
  `intent` là bước upstream của order, endpoint không mang. Render 4 stage thật
  và **nói thẳng trên màn** hai hop kia không thuộc endpoint này; không bịa card
  `signal` từ `SUBMIT`.

### 17.4 Reuse report

Dùng lại: `KeysetTable` (M1, cả footer/cursor/virtualization), `AuthorityBadge`,
`OrderStatusChip`, `PanelState`, `ExecutionSurface`, class
`exec-inbox-head` / `exec-inbox-filter` / `exec-inbox-filters` / `exec-tile-title`.
Mới: `exec-num` (tabular-nums, dùng chung được cho mọi màn có số), khối
`exec-funnel-*`, vài class `exec-blotter-*`.

### 17.5 Evidence

vitest **844 passed / 1 skipped** (+23) · tsc sạch · build sạch · visual
baseline **101/101** · contrast gate 14/14.

### 17.6 Còn thiếu để đóng phase 14

- BR-EX-24 (list endpoint) và BR-EX-25 (câu trả lời về 5 hop).
- Scope toolbar (Alpha/Deployment/Venue/Time) mới là slot `scope`, chưa dựng
  select — chờ biết filter nào server nhận, dựng trước là đoán tên tham số.
- Chưa nối container; chưa có route. Cả hai chờ BR-EX-24.

---

## 18. Phase 17 — Account/Broker 360° dựng xong (2026-08-22)

### 18.1 Vì sao chọn 17 chứ không phải 6

Phase 6 (Admin Action Drawer) trông là đòn bẩy lớn nhất — "unlocks all later
mutation links", FE đã `READY`, shell + state machine + blocking rules đã dựng
từ §4. Nhưng catalogue của nó **mâu thuẫn với runtime evidence ba chiều**:

| Nguồn | Catalogue |
|---|---|
| Hi-fi 1i | **21 lệnh / 6 nhóm**, "all mutations: Generate plan gates Apply" |
| `command-catalog.yaml` | **13 action family**, chỉ **1** lệnh có `plan: true` |
| `extract/cli-command-map.json` | **19 command noun / 64 action** — 47 R0 read, 14 mutation, **7 action không có HTTP equivalent** |

`extract/` thắng (CLAUDE.md §0). Catalogue hi-fi **không phải tập con cũng không
phải tập cha** của hệ thống thật, và "plan gates apply cho mọi mutation" sai với
`plan: false` ở 11/12 lệnh. Đây là quyết định của Bobby, không phải chỗ để đoán —
nên phase 6 dừng, chuyển sang 17.

Phase 17 phụ thuộc 12 và 6, nhưng **chỉ ở hai nút mutation** (Sync now /
Dry-run), vốn nằm sau `operatorAdmin` và bị **ẩn hoàn toàn** khi không có quyền.
Phần lõi độc lập.

### 18.2 Quyết định lớn nhất của màn: headroom

Hi-fi bảo màn tự tính. Tôi **không** tính — xem BR-EX-26. Tóm tắt: đây là
control fail-closed, browser cộng sai thì màn nói ngược với thứ sắp xảy ra; và
browser không thể cộng đúng vì nó chỉ thấy `linked[]` mà endpoint trả, trong khi
`account_count` vs `expected_account_count` tồn tại chính vì population có thể
thiếu.

`aggregate === null` → panel `unavailable` **kèm lý do**, không phải im lặng.
Banner vắng mặt sẽ đọc thành "không có vấn đề" — đúng cách đọc mà control này
không chịu nổi.

Test chứng minh không có phép cộng: đổi verdict sang `EXCEEDED` mà giữ nguyên ba
dòng linked (vẫn cộng ra 41,000), banner hiện 46,800 — đi theo verdict, không
theo số học.

### 18.3 Những chỗ khác giữ sự thật

| Chỗ | Cách giữ |
|---|---|
| Ba cột | ba authority riêng — EXECUTION / BROKER / DERIVED. Gộp lại là một con số không quy được về nguồn, trên đúng màn có nhiệm vụ quy nguồn |
| `MATCH` vs `not compared` | `MATCH` là một khẳng định, chỉ server đưa ra. Không đọc được cả hai bên thì không phải delta bằng 0 |
| Số không báo cáo | `not reported`, không phải `0`. Trên màn đối soát, một lỗ trống **là** phát hiện |
| Secret | chỉ hiện alias + `secret never displayed` — người đọc cần biết đó là cố ý, không phải lỗi render |
| Guard band | dải đặc cho `LIVE_FULL` **và** `LIVE_CANARY`; canary cũng là vốn thật |
| Nút mutation | **ẩn hẳn**, không disable. Nút không bao giờ bấm được là câu hỏi người ta hỏi mãi |
| Sync history | giữ dòng `STALE 6.2s`. Lịch sử chỉ toàn thành công không phải lịch sử, là quảng cáo |
| Account đang xem | giữ trong bảng và đánh dấu `(this)` — lọc ra sẽ để lại một tổng mà các phần không cộng lại được trên màn |

### 18.4 Reuse report

Dùng lại: `AuthorityBadge`, `EnvironmentBadge`, `StatusChip`, `PanelState`,
`ExecutionSurface`, `isFullPopulation` + `readBindingExposure` (từ §16), class
`exec-inbox-head` / `exec-gate-panel` / `exec-grid-2` / `exec-gate-unverified` /
`exec-btn-ghost` / `exec-num` (mới ở §17, giờ dùng lại đúng như dự định).
Mới: khối `exec-360-*`.

### 18.5 Evidence

vitest **865 passed / 1 skipped** (+21) · tsc sạch · build sạch · visual
baseline **101/101** · contrast gate 14/14.

### 18.6 Còn thiếu để đóng phase 17

- BR-EX-26 (aggregate verdict). Đến khi có, màn render `unavailable` cho ô đó.
- Ba cột, linked accounts, sync history, findings đều chưa có contract — chỉ
  exposure buckets có. Cùng loại với BR-EX-24.
- Chưa nối container/route.

### 18.7 Tiếp theo

Phase 15 (Alpha 360°) rồi 16 (Portfolio 360°), đúng thứ tự phụ thuộc.

---

## 19. M5 làm cho đúng — cap theo dữ liệu thật, không theo cast hi-fi (2026-08-22)

Bobby chỉ ra: màn phải **co giãn theo lượng dữ liệu backend trả thật**, không
phải theo quy mô hi-fi vẽ. Soát lại hai màn vừa dựng thì đúng — tôi dựng theo
cast nhỏ. Ba lỗ:

| Chỗ | Hi-fi vẽ | Thực tế | Đã dựng |
|---|---|---|---|
| `linked` accounts (17) | 3 dòng | fixture đã ghi `expected 24`; binding thật có thể vài trăm | render **tất cả** |
| `syncHistory` (17) | 3 dòng | policy `live 5s` → **17,280 dòng/ngày** | render **tất cả** |
| fills trong funnel (14) | 3 fill | một order lớn có hàng nghìn | render **tất cả** |

`CapNotice` đã có từ Phase 0 mà tôi không dùng. Nhưng chỉ thêm cap thì vẫn sai.

### 19.1 `slice(0, limit)` là cách cắt sai

Trên bề mặt này, những dòng đáng xem **hiếm khi là dòng đầu**:

- Lịch sử sync cắt còn 10 dòng gần nhất **mất đúng dòng `STALE` duy nhất** trong
  cửa sổ. Lịch sử chỉ toàn thành công không phải lịch sử, là quảng cáo.
- Danh sách fill cắt từ đầu **mất fill cuối** — cái đóng lệnh.
- Danh sách linked account cắt theo thứ tự **mất account đang xem**, hoặc mất
  canary — đúng dòng operator mở màn này để kiểm.

Nên viết `components/cap.ts`: `capPreserving(rows, limit, isException, total)`
giữ **mọi dòng bất thường** rồi mới tiêu ngân sách còn lại cho phần thường, và
giữ nguyên thứ tự gốc để lịch sử vẫn đọc theo thời gian. `capNotice` nói rõ ba
điều: cắt còn bao nhiêu trên tổng bao nhiêu, có bao nhiêu dòng được **cứu từ
ngoài cửa sổ** (không có câu này thì các dòng hiện ra trông liền mạch mà thật ra
không), và khi **số dòng bất thường nhiều hơn cả ngân sách** — đó là phát hiện
về hệ thống, không phải chi tiết render.

Đây là invariant CLAUDE.md §8 đòi: *"degradation không được biến thành nói dối"*.

### 19.2 Ngân sách chọn theo hi-fi, không theo số tròn

`LINKED_BUDGET = 12`, `SYNC_BUDGET = 10`, `FILL_BUDGET = 12` — chọn sao cho
**trường hợp hi-fi vẽ vẫn render y hệt như vẽ, không kèm caption nào**. Test
khoá điều đó: 3 account → 3 dòng, không notice. Co giãn theo dữ liệu thật không
được làm hỏng dáng của trường hợp đã vẽ.

### 19.3 Cơ chế bắt được một lỗi trong chính fixture của tôi

Bản đầu `account360.fixtures.ts` dùng lại `EXPOSURE_COMPLETE` (24 account) cho
màn vẽ **3** linked account. Cap notice lập tức hiện *"showing 3 of 24 linked
accounts"* và test đỏ. **Notice đúng, fixture sai** — màn liệt kê 3 trong 24
account của một binding thì phải nói ra. Đã tách `EXPOSURE_FOR_THREE` cho trường
hợp hi-fi, giữ `PARTIAL_EXPOSURE` cho trường hợp thiếu population.

Và sửa một lỗi thật đi kèm: `total` từng lấy `expectedAccountCount ?? length`,
nên 214 dòng gặp `expected 24` sẽ báo "showing 12 of 24". Giờ lấy `max` — cầm
214 dòng thì population ít nhất là 214, dù trường count nói gì.

### 19.4 Evidence

vitest **884 passed / 1 skipped** (+19) · tsc sạch · build sạch · visual
baseline **101/101**.

Test chạy ở quy mô thật, không phải cast: 214 linked account, 17,280 dòng sync,
1,203 fill, và 50 sync FAILED trong ngân sách 10.

### 19.5 Áp cho các màn sau

Phase 15/16 dựng **từ đầu** với `capPreserving`, không dựng xong rồi vá. Ô
**Degradation** và **Invariant giữ nguyên** trong bảng scale refine §8 giờ có
một cơ chế dùng chung để trỏ tới, thay vì 17 màn mỗi màn tự nghĩ một kiểu.

---

## 20. Phase 15 — Alpha 360° dựng xong, sizing theo runtime (2026-08-22)

Bobby: *"giả định dữ liệu nhiều một chút để khi nhận dữ liệu từ trading system
không bị vỡ"*. Nên lần này **không đoán số** — lấy từ
`trading_system_portal_contract_pack/workload-profile.md`.

### 20.1 Số thật, và nó đổi thiết kế thế nào

| Số runtime | Hệ quả UI |
|---|---|
| 47 alpha · 2 portfolio · **85 account** · 80 copy policy | Accounting = 85 × currency ≈ **255 dòng**, không phải 2 như hi-fi vẽ |
| 16 shard Binance · 82 symbol DNSE | venue map **22+ dòng**, positions **hàng nghìn** |
| **`orders`, `fills`, `domain_events` KHÔNG có retention policy** | Orders & Fills, Positions, Audit là **vô hạn** → keyset, **không cap** |
| 975 items/s data layer · queue drop 1.3M | không phải hệ thống nhàn rỗi |
| **734/1468 feed missing · 21 stale** | `INSUFFICIENT_DATA` là trạng thái **mở màn**, không phải ca demo |

Dòng cuối đổi cả cách bố trí: fixture cho **3/12 tile không vẽ được** (một
`unavailable` vì kline shard publish_count=0, hai `insufficient_data`). Màn mở ra
với 12 chart khoẻ mạnh là màn chưa ai chạy thật.

### 20.2 Cap ở đâu, page ở đâu — hai thứ khác nhau

Đây là phân biệt quan trọng nhất của phase này:

- **Có trần thì cap** (venue, deployment, accounting, sessions): tập hữu hạn,
  biết được tổng, nên `capPreserving` + caption trung thực.
- **Không trần thì page** (positions, orders & fills, audit): `fills` và
  `domain_events` không có retention policy — chúng lớn mãi. Cap ở đây là **nói
  dối**, vì cap ngụ ý "có một tập bạn đáng lẽ xem hết được". 1,284,991 dòng
  command journal và còn tăng thì không phải tập đó.

Test khoá cả hai chiều: tab paged **không được** có caption `showing … of …`.

### 20.3 Ngoại lệ được giữ, ở đúng chỗ head-cap sẽ mất

| Panel | Ngân sách | Dòng được cứu | Vị trí thật |
|---|---|---|---|
| venue map | 16 | shard ngừng publish 14m | 19/22 |
| deployments | 24 | deployment `BLOCKED` | 51/60 |
| accounting | 40 | account không báo cáo | 200/255 |
| sessions | 20 | recovery chưa hoàn tất | 350/400 |

Cả bốn đều nằm **ngoài** cửa sổ head-cap. Đó là điểm của §19.

### 20.4 Ba lần test đỏ, cả ba là test tôi viết lỏng

`+112.40` trùng giữa contribution và bảng deployments (đúng — một cái là đóng
góp của venue, một cái là pnl của deployment, chúng trùng nhau); `USDT` trùng
trong chính panel contribution (BINANCE và OKX cùng USDT). Sửa thành khẳng định
**đúng thuộc tính cần chứng minh**: đếm nhãn currency theo từng dòng và khẳng
định **không có dòng tổng** — `expect(dd).toHaveLength(3)` +
`not.toMatch(/Total|Σ/)`. Assertion đó bắt được lỗi thật (ai đó thêm dòng tổng),
còn `getByText("+112.40")` thì không.

### 20.5 Evidence

vitest **907 passed / 1 skipped** (+23) · tsc sạch · build sạch · visual
baseline **101/101** · contrast gate 14/14.

Chạy ở quy mô runtime: 22 venue, 60 deployment, 1,200 position trong 48,213,
255 dòng accounting, 400 session, 500 dòng audit trong 1,284,991.

### 20.6 Còn thiếu để đóng phase 15

- Chưa có endpoint cho positions / orders / audit / accounting / sessions của
  một alpha (cùng loại BR-EX-24).
- Chart body vẫn là khung + caption; ECharts thuộc phase 18 theo `chart.tsx`.
- Chưa nối container/route.

---

## 21. Phase 16 — Portfolio 360° dựng xong (2026-08-22)

### 21.1 Phát hiện chính: 150 là trần **transport**, không phải trần **render**

`EX-BE-07a` pack tam giác dưới tới `dimension: 150` rồi mới chuyển ranked pairs.
Trần đó nói về **byte trên dây**. Còn 150 × 150 là **22,500 ô DOM** — browser
không dựng nổi, và kể cả dựng được thì không ai đọc được một giá trị ra khỏi nó.

Nên màn tự mang một ngưỡng hiển thị **thấp hơn nhiều**, và vượt ngưỡng thì
**leader lens thành view chính** — một dòng của một alpha là `n` ô, không phải
`n²`. Đây không phải fallback bịa ra vì scale: hi-fi **đã vẽ sẵn leader lens**,
nên đường degradation là một affordance có sẵn trong thiết kế.

Ba representation, một hàm thuần chọn giữa chúng, và lựa chọn **luôn được nói ra
trên màn**.

### 21.2 Ngân sách 4,096 ô — và lần đầu tôi đặt sai

Bản đầu để `MATRIX_CELL_BUDGET = 1_600` (40×40). Test đỏ ngay: fleet hôm nay 47
alpha = **2,209 ô** → rơi xuống lens, nghĩa là **matrix không bao giờ được thấy
trong production**. View chính của hi-fi mà không với tới được thì nó là bản vẽ,
không phải thiết kế.

Sửa thành **4,096** (64×64): 47 alpha vẫn là matrix, 150 vẫn là lens, và vẫn
thấp hơn trần transport năm lần. 64 entity là khoảng ranh giới một lưới có nhãn
còn dùng được.

Test bắt được vì luật là **hàm thuần** `correlationView()`, không phải một nhánh
`if` chôn trong render path. Kèm một test khoá hai thứ phải khớp nhau: hàm nói
"matrix" thì DOM phải thật sự có 47×47 ô — một hàm nói đúng mà panel vẽ khác sẽ
qua được mọi test còn lại.

### 21.3 Ba nghĩa của "không có số", giữ riêng

| Trạng thái | Hiển thị | Vì sao khác nhau |
|---|---|---|
| Đủ mẫu, có giá trị | `0.31` | — |
| **Kiểm rồi, dưới sàn 200 mẫu** | `—` INSUFFICIENT_DATA | đo rồi nhưng chưa đủ để đứng sau |
| **Không có sample count để kiểm** | số vẫn hiện + caption nói thẳng luật không áp được | "không kiểm được" ≠ "kiểm rồi không đạt" |

Ô **không** bị đánh dấu insufficient chỉ vì thiếu count. Và caption nói thẳng
thay vì im lặng — im lặng khiến các con số đọc như đã qua một bước kiểm chưa
từng chạy. Đó là **BR-EX-27**.

Fixture mô hình insufficiency theo **entity** chứ không rải ô ngẫu nhiên: `MM`
có 9 ngày lịch sử nên **cả dòng và cả cột** của nó là gạch — đúng như hi-fi vẽ,
và đúng nguyên nhân thật.

### 21.4 Ba danh sách leader, không gộp

Hi-fi ghi thẳng *"three ranked lists, never one merged 'leader score'"*. Lý do:
một alpha chiếm 70% exposure nhưng 20% variance là **vấn đề khác** với một alpha
20% exposure và 70% variance — một con số gộp trả lời cả hai giống nhau. Test
khẳng định có đúng 3 section và không có chữ "leader score" nào.

### 21.5 Evidence

vitest **934 passed / 1 skipped** (+27) · tsc sạch · build sạch · visual
baseline **101/101** · contrast gate 14/14.

Chạy ở ba quy mô: 4 entity (hi-fi), **47** (fleet hôm nay, matrix thật 47×47
trong DOM), **150** (trần transport → lens), và ranked 210 entity / 500 pair.

### 21.6 Còn thiếu để đóng phase 16

- **BR-EX-27** (`sample_counts` trên packed matrix) — đây là điều kiện đóng
  phase theo `IMPLEMENTATION_PHASES` §16.
- Chưa có endpoint cho holdings / approvals / incidents / audit của portfolio.
- Tab Audit render `unavailable` — chưa có command journal cấp portfolio.
- Chưa nối container/route.

### 21.7 Frontend hết việc Lane A

Sau phase 16, **mọi phase còn lại đều chờ người khác**: phase 6 chờ Bobby chốt
catalogue; 4, 7, 8, 9, 10, 13 chờ codex mở source; 11, 12 chờ owner mở cổng
production; 18 chờ có target subset.

---

## 22. Soát toàn diện lần hai — kết quả và sửa (2026-08-22)

Workflow 9 lăng kính × 3 refuter đối kháng, 358 agent. **116 phát hiện**: 64 qua
được vòng bác bỏ, 15 bị bác thật, **37 không kịp verify** (agent lỗi vì session
limit — không được tính là đã bác; tôi tự kiểm từng cái).

### 22.1 Năm critical, đều ở khe nối FE ↔ Control API

| Lỗi | Hậu quả |
|---|---|
| Gửi `filter=`, BFF đọc `view=` | **mọi chip lọc im lặng rơi về INBOX** |
| `readKeysetPage` không nhìn `page` | bảng rỗng + `0 total` trên một trang đầy |
| Plan body sai toàn bộ schema | thiếu `schema_version`, `workspace_id`; version là **số** |
| Apply gửi `request_key`, cần `apply_token` | apply không tới được plan của nó |
| R2 *"Approve with condition"* không khoá | R1 hết hạn vẫn cấp được authorization |

Không test frontend nào bắt được — **fixture mã hoá đúng những phỏng đoán mà
client mắc**.

### 22.2 Ba lỗi an toàn nặng hơn cả critical

1. **Quyền mặc định TRUE.** `eligibility ? … : true` ở R1; R2/Paper Exit không
   có prop; và cả hai reader **chưa bao giờ điền** trường mà type đã khai.
2. **Mọi approval bị khoá self-approval.** `creator` là object, `actor` không
   có trên wire → cả hai thành `"unknown"` → `"unknown" === "unknown"`.
3. **Lỗ gap mở qua cửa khác.** `DISCONNECTED` đưa mọi phase về `reconnecting`,
   mà `reconnecting` được phép nhận delta.

### 22.3 Bảy chỗ "im lặng" đã đóng

`total_count` vắng → `0 total` · quorum vắng → `0/2` · overdue vắng → `0` ·
SLA suy ra từ số phút, bỏ qua `sla.state` server phát · `PAUSED` gộp vào
`UNKNOWN` · filter echo bịa `eq ""` · poll cạn budget mà panel vẫn nói *"Still
observing"*.

Cộng cụm em dash: `—` từng mang **ba nghĩa** (không phí / phí không publish /
hop không có quantity). Mỗi cái giờ có chữ riêng.

### 22.4 Bốn gate hoá ra là giả

| Gate | Lách bằng |
|---|---|
| `SSE_EVENTS` | so hằng số với **bản chép tay trong cùng file** |
| money arithmetic | snake_case, template literal, member access |
| token literal | `oklch`/`color-mix`/`hwb`/named colour |
| registry policy | `if (!policy) continue` — im lặng bỏ qua |

Cả bốn giờ đọc từ nguồn thật, và mỗi cái có một test **chứng minh nó cắn**.

### 22.5 Contrast: token đúng, cặp sai

`--authority-meta` 3.60:1 và 3.01:1 — gate không thấy vì **badge đặt màu, trang
đặt nền, không chỗ nào viết hai thứ cạnh nhau**. Nâng token.

Stream banner 4.44:1/4.49:1 — ở đây **token đúng, cặp sai**: thang xám hiệu
chỉnh theo `--paper`, mà banner không phải surface. Nâng token sẽ **đảo thang**,
và chính gate ramp của nó bắt được. Sửa cặp.

### 22.6 Evidence

vitest **993 passed / 1 skipped** (từ 940, **+53**) · tsc sạch · build sạch ·
visual baseline **101/101** · contrast gate 14/14.

Commit: `dfbfb59` `2e3a42a` `8d8779a` `b090943` `ea32633` `883e09c` `4f20de3`.

### 22.7 Còn lại

Backend: 9 mục trong `HOTFIX_REQUEST_2026-08-22.md` (nặng nhất vẫn là
`DecimalString::parse` làm tròn âm thầm), cộng A-5 và BR-EX-24…27.

Frontend còn nợ thiết kế, không phải lỗi: R1/R2 chưa có outcome *"Request
changes"*, container chưa truyền typed conditions, Paper Exit wired mất
lifecycle rail, Alpha 360 thiếu equity-by-stage chart, Portfolio 360 leader lens
chưa highlight chéo. Tất cả cần contract hoặc quyết định sản phẩm trước.

---

## 23. Chín màn chưa dựng — và tôi đã nói sai một câu (2026-08-22)

Ở §21.7 tôi viết *"sau phase 16, frontend hết việc Lane A"*. **Sai.** 8/17 màn
đã dựng; **9 màn chưa có một dòng UI nào**, và phần lớn dựng được ngay trên
fixture đúng cách 14–17 đã dựng. "BLOCKED" trong bảng phase nghĩa là *tích hợp
backend* bị chặn, không phải UI bị chặn — chính tôi đã chứng minh điều đó bốn
lần rồi lại quên.

### 23.1 Chuỗi phụ thuộc thật (`IMPLEMENTATION_PHASES` §4–13)

| Phase | Màn | Phụ thuộc | Dựng được chưa |
|---|---|---|---|
| 4 | Paper Workbench (1c) | Phase 3 — **đã dựng** | ✅ **ngay bây giờ** |
| 13 | Paper Workbench VNM (4h) | Phase 4 (biến thể) | ✅ ngay sau 4 |
| 6 | Admin Action Drawer (1i) | Phase 0 — đã dựng | ⚠️ **chờ Bobby chốt catalogue** |
| 7 | Operations Queue (4e) | Phase 6 | ⛔ sau 6 |
| 8 | Incident Detail (4d) | Phase 7 | ⛔ sau 6 |
| 9 | Command Center (5a) | Phase 1, 7, 8 | ⛔ sau 6 |
| 10 | Sandbox Certification (1d) | Phase 4–6 | ⛔ sau 6 |
| 11 | Canary Control Room (1e) | Phase 10 | ⛔ sau 6 |
| 12 | Live Full Operations (1f) | Phase 11 | ⛔ sau 6 |

### 23.2 Một quyết định mở sáu màn

**Phase 6 chặn 7, 8, 9, 10, 11, 12** — sáu trong chín màn còn lại. Và phase 6
không chờ backend: shell, state machine, blocking rule đã dựng từ §4; nó chờ
**Bobby chốt catalogue** giữa ba nguồn mâu thuẫn:

| Nguồn | Catalogue |
|---|---|
| Hi-fi 1i | 21 lệnh / 6 nhóm, "all mutations: Generate plan gates Apply" |
| `command-catalog.yaml` | 13 action family, **1** lệnh có `plan: true` |
| `extract/cli-command-map.json` | 19 noun / 64 action — 47 read, 14 mutation, **7 action Portal bị cấm chạm** |

Đây là đòn bẩy lớn nhất còn lại trên toàn bộ frontend.

### 23.3 Làm được ngay mà không cần ai

**Phase 4 — Paper Workbench.** Phụ thuộc duy nhất là Phase 3, đã dựng. Sau nó
là **Phase 13 (VNM)**, mô tả trong `IMPLEMENTATION_PHASES` là "biến thể của 4",
nên hai màn đi liền một mạch.

## 24. Soát chéo hàng rào contract (2026-08-22)

Không soát code mà soát **cái gì giữ cái gì**.

**Sạch — đã kiểm, khỏi soát lại:** `contracts-snapshot.json` phủ 26/26 file,
digest khớp hết, không file nào publish mà nằm ngoài; `npm run generate` chạy
lại (exit 0, bốn file) rồi diff → generated types **khớp hoàn toàn** OpenAPI;
fixture capital-preview **hợp lệ** với `CapitalPreviewResponse` (tự compile
schema từ OpenAPI mà validate).

**Ba lỗ** → `HOTFIX_REQUEST_2026-08-22.md` H-10, H-11, H-12:

1. Analytics là contract **duy nhất không có schema gate**. Có digest, nhưng
   digest bắt "file đổi mà snapshot không cập nhật" — **không** bắt "fixture
   không còn khớp schema". Sửa cả hai cùng lúc thì đi lọt. Và đây là contract
   mang mọi con số tiền.
2. **Không test nào chứng minh Rust analytics khớp OpenAPI.** `query-api` có
   (codex thêm sau khi tôi báo A-2). `analytics` grep không ra một dòng chạm
   `packages/contracts`. Với sáu màn, thứ duy nhất nối tên trường Rust với
   OpenAPI là *một người đã viết cả hai* — đúng điều kiện đã sinh ra A-2.
3. **5/6 endpoint analytics không có fixture.** Fixture frontend cho chúng là
   tôi tự viết từ OpenAPI; `readCapitalPreview` đã cho thấy làm theo prose sai
   **9 tên trường**.

---

## 24A. Six-phase pre-IAM SGP queue — shared coordination (2026-08-22)

Master Plan §12.1.1 now owns this queue. It is deliberately independent of the
AWS IAM/Security Group window; none of these rows enables WireGuard, source
reads, projection ingestion, SSE or Trading System commands.

| ID | Backend / codex | Frontend / Claude | Shared status |
|---|---|---|---|
| PRE-IAM-01 | close Phase 1 Approval Inbox + Phase 2 Gate R1 on SGP with fresh-PG and public-gateway operational evidence | correct Phase 1/2 HTTP integration listed below; do not activate registry policy | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — backend gate green |
| PRE-IAM-02 | source-safe Paper Exit repository/API and deterministic evidence evaluation | Phase 5 Lane A mapping closed; retain real-source activation boundary | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — BE and FE Lane A accepted; source inactive |
| PRE-IAM-03 | dark Command Center snapshot API | five-state Lane A mapping closed; retain source/SSE parity boundary | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — BE and FE Lane A accepted; source/SSE inactive |
| PRE-IAM-04 | offline security/contract/load/replay/restore hardening | consume gap/cursor codes, bounded fields, typed errors and fixtures; keep every degraded state visible | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — requalified with contracts 39/39, Control API 149/149 and Rust/PG 95 |
| PRE-IAM-05 | D2 dark image/config/preflight/rollback preparation | no live/source activation work required; continue PRE-IAM-04 Lane A packet | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — renderer group ownership + render→ownership→readiness order requalified; D2 unauthorized |
| PRE-IAM-06 | reconcile backend guides, shared board and request ledger | FE evidence/status and superseded H-series reconciled; future drift is gated | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — seven doc authorities + generated catalogue drift gate accepted |

### 24A.1 Claude handoff required before Phase 1/2 product activation

Codex owns the backend closeout and will not edit Claude-owned frontend files.
The current adapter still has three contract-boundary blockers:

1. Mutating `post()` must send the double-submit `x-portal-csrf` value from the
   `__Host-portal_csrf` cookie and preserve same-origin credentials. Backend
   intentionally returns 403 without it.
2. Canonical routes are `POST /api/v1/execution/commands/plans`, `POST
   /api/v1/execution/operations/{operation_id}/apply`, and `GET
   /api/v1/execution/operations/{operation_id}`. The current frontend still
   inserts `/governance/approvals/.../decision-plans` and
   `/governance/operations/...`; those compatibility aliases will not be added.
3. Inbox `view=R2` is now a canonical backend selector. The operator hi-fi set
   is `INBOX / ALL / R1 / R2 / EXIT_REVIEWS / LIVE_GATES / OVERDUE`; backend
   additionally accepts `PAPER` and `SANDBOX` for API consumers. Claude decides
   presentation, not backend capability.

One policy question remains intentionally closed: Gate R1 is a Portal-owned
governance write, not a Trading System `paper_commands_enabled` permission.
Claude must keep Apply unavailable until a reviewed registry revision expresses
that authority separately. This is a product-activation blocker, not a blocker
to PRE-IAM-01 backend qualification.

Backend closeout evidence (2026-08-22): fresh PostgreSQL 16 passed 13 suites and
117/117 tests; isolated public-gateway smoke passed password rotation, Inbox/R1,
403 missing-CSRF, canonical plan→apply→poll and exact 1:1:1 decision/audit/outbox;
the SGP `portal` runtime is ready in research mode with non-dev auth and two
independent file-backed keyrings. The separate stable v1.0.1 stack was not
rebuilt. Full evidence:
[`EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md`](../../backend/EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md).

### 24A.2 PRE-IAM-02 Paper Exit handoff

Codex accepted the Phase 5 backend lane on 2026-08-22. Canonical contract:

- detail publishes `review.stage=PAPER_OBSERVATION` and `review.review_version`;
- source panels distinguish partial/stale/unavailable/error and every required
  finding remains source-linked and evidence-hashed;
- decisions use canonical `/commands/plans` → `/operations/{id}/apply` → poll;
- `PROMOTE` creates a Portal grant only; it does not activate Sandbox or call
  Trading System;
- extend/reject are server-eligible safe decisions even when evidence is not
  usable, while promotion fails closed.

Claude lane before activation: keep the new stage-driven LifecycleRail; read
`review_version`; map every panel failure state; bind extend/reject to
`can_extend_observation`/`can_reject`; select the Paper Exit plan schema and
decision vocabulary; and send same-origin double-submit CSRF on mutations.
Full backend evidence:
[`PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md`](../../backend/PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md).

Latest request `BR-EX-28` is acknowledged as a separate Phase 6 unblocker. It
requires a canonical command catalogue plus purpose-built typed HTTP endpoints;
it does not authorize Portal-to-Redis access or generic Redis `get`/`scan`.

### 24A.3 PRE-IAM-03 Command Center handoff

Codex accepted the dark Phase 9 snapshot backend lane on 2026-08-22. Canonical
contract is `GET /api/v1/execution/command-center` with schema
`execution.command-center-snapshot.v1` and generated TypeScript declaration.
It returns capped Needs You (10), six Fleet cells, user pins (5) and Today (12).
Ranking is server-owned `command-center.triage-rank.v1`.

Claude lane before activation: map busy/empty/partial/stale/unavailable; retain
per-panel authority and freshness; treat `observed_total_count` as a known
subset when `exact_total=false`; do not re-rank; keep a pinned target visibly
unavailable without Fleet; and keep EventSource/profile controls absent while
`stream_available=false`. Real incident/operation/Fleet sources and SSE parity
are deliberately not claimed. Full backend evidence:
[`PRE_IAM_03_DARK_COMMAND_CENTER_SNAPSHOT_CLOSEOUT.md`](../../backend/PRE_IAM_03_DARK_COMMAND_CENTER_SNAPSHOT_CLOSEOUT.md).

`BR-EX-28` remains a separate source/Phase 6 unblocker. Its §8.1 audit is
confirmed: OpenAPI has only four emergency-close `ops` paths, not routes for the
other eight extracted actions. Command Center later needs purpose-built
`streams` and `alpha-activity`; do not guess those routes or add generic Redis
reads.

### 24A.4 PRE-IAM-04 offline hardening handoff

Codex accepted the credential-free hardening lane on 2026-08-22. Canonical
backend changes distinguish projection sequence gap, cursor ahead, epoch
change, expired cursor and context mismatch; return safe typed analytics
problems; and expose bounded ledger/funnel windows without losing exact global
counts, totals or per-stage aggregates. All six analytics screen fixtures now
pass exact OpenAPI component validation and Rust serde parity.

Claude lane before activation: consume the generated declarations and five new
analytics fixtures; map `projection_sequence_gap`, `cursor_ahead`,
`latest_available_sequence` and `resnapshot_not_before`; keep malformed,
expired and context-mismatched cursors distinct; label bounded windows
honestly; retain every partial/stale/unavailable/gap state; and do not infer a
production SLO from offline test budgets. Source/realtime/command flags remain
dark. Full backend evidence:
[`PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md`](../../backend/PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md).

PRE-IAM-05 has now closed the D2 offline image/config/service, non-root/read-
only, preflight and rollback preparation lane. It did not authorize an AWS
network change, source read or Trading System mutation.

Claude's full task packet, exact contract read order, acceptance tests and the
three-step no-IAM continuation are recorded in
[`CODEX_TO_CLAUDE_PRE_IAM_04_FRONTEND_HANDOFF.md`](CODEX_TO_CLAUDE_PRE_IAM_04_FRONTEND_HANDOFF.md).
After PRE-IAM-05 the two immediately executable steps are PRE-IAM-06 tracking
reconciliation, then the contract-only `EX-BE-05b/F0` catalogue/typed-condition/
relay foundation. The latter keeps all eight unpublished `ops` routes blocked
and never substitutes direct DB/Redis access.

### 24A.5 PRE-IAM-05 D2 dark preparation closeout

Codex accepted only the offline D2 preparation lane on 2026-08-22. Edge and
Source Proxy images build and inspect as separate non-root/read-only units;
Compose fixes PID/CPU/memory/nofile/log bounds and supplemental-group secret
access; preflight validates immutable digests, dark flags, PKI/JWKS/source
identity and exact private addressing; candidate/rollback manifests are
equivalent after image-digest normalization. No AWS/network/source/service/
registry/runtime state changed. Full evidence:
[`PRE_IAM_05_D2_DARK_PREPARATION_CLOSEOUT.md`](../../backend/PRE_IAM_05_D2_DARK_PREPARATION_CLOSEOUT.md).

Claude has no D2 deployment task and continues the linked PRE-IAM-04 Lane A
packet. The next shared phase is PRE-IAM-06 reconciliation; D2 remains owner-
and change-window-gated.

### 24A.6 PRE-IAM-06 tracking reconciliation closeout

Master Plan, backend README, this board, frontend roadmap and the canonical
[`EXECUTION_REQUEST_LEDGER.md`](EXECUTION_REQUEST_LEDGER.md) now agree on exact
owner, blocker and qualified maturity. H-1–H-12 are retired; A-1–A-7 and
BR-EX-23–29 retain their real residual dependencies. The eight unpublished
Trading System `ops` actions remain externally owned and unreachable; generic
DB/Redis/CLI access remains prohibited. `scripts/execution-tracking-test.sh`
enforces those facts in the root workspace gate.

PRE-IAM-06 handed off to EX-BE-05b/F0, which is closed below. Claude continues
the PRE-IAM-04 consumer packet and the F0 catalogue/typed-condition mapping on
Lane A; no product route or runtime flag is enabled.

### 24A.7 EX-BE-05b/F0 offline operations foundation

Codex accepted F0 at `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` on 2026-08-22.
The canonical generated catalogue contains 64 unique `noun/verb` actions and
keeps every entry unreachable. Eight unpublished `ops` actions and generic
Redis capabilities remain blocked. The TypeScript Control API exposes the
session-bound catalogue, immutable blocked plan and operation readback; apply
is denied before source/relay construction and no outbox command is emitted.
The Rust relay crate has no network client and locks same-key replay,
payload-conflict and `UNCERTAIN` no-retry behavior. Governance now stores typed
`conditions[]`; singular `condition` is a deprecated compatibility alias.

Hardening requalification on 2026-08-23 advances only the contract catalogue to
revision 2. Catalogue reads are ADMIN/workspace/actor/environment/entity/risk
scoped with exact counts. Observed non-GET routes are at least R1 and require
owner review; every R1–R4 entry requires plan/apply. Plans validate bounded
payloads, reject sensitive keys and durably retain only the digest under
`HASH_ONLY_NO_RAW`. Bounded PostgreSQL `40001`/`40P01` retry is proven by real
concurrent replay/conflict requests. No reachability or runtime flag changed.

Claude's exact Lane A consumer contract and test list are in
[`CODEX_TO_CLAUDE_EX_BE_05B_F0_HANDOFF.md`](CODEX_TO_CLAUDE_EX_BE_05B_F0_HANDOFF.md).
No route/profile/command activation is authorized. Full backend evidence:
[`EX_BE_05B_F0_OFFLINE_OPERATIONS_FOUNDATION.md`](../../backend/EX_BE_05B_F0_OFFLINE_OPERATIONS_FOUNDATION.md).

Next safe backend lane without IAM: Portal-owned Operations Queue/Incident
workflow contracts and repositories over fixture/Portal records only. The
source-backed `command-journal`, findings, alerts, dead letters, trace-order,
streams and alpha-activity adapters remain blocked on Trading System owner
publication; Portal does not substitute DB/Redis/CLI access.

### 24A.8 EX-BE-05b/F1a Portal Operations Queue

Codex accepted F1a at `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` on
2026-08-23. SGP TypeScript/PostgreSQL now owns an ADMIN/workspace-bound queue
for Portal-created F0 operations, exact total/filtered counts, signed expiring
forward/back keysets and ordered `UNACKNOWLEDGED → ACKNOWLEDGED → RESOLVED`
triage. Source identity/status/verification are immutable, every workflow write
is optimistic/idempotent/audited and no outbox or source request is created.

Evidence is contracts 41/41 and fresh-PG Control API 155/155 including the
182,000-row corpus and dump/restore drill. Registry remains `fixture` and source
integration `UNAVAILABLE`. Claude's consumer packet is
[`CODEX_TO_CLAUDE_EX_BE_05B_F1A_HANDOFF.md`](CODEX_TO_CLAUDE_EX_BE_05B_F1A_HANDOFF.md).
Claude owns the Phase 7 Lane A adapter/UX/tests. F1b Portal Incident Detail is
closed below; source-backed operations remain blocked on published typed
Trading System routes and D4 evidence.

### 24A.9 EX-BE-05b/F1b Portal Incident Detail

Codex accepted F1b at `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` on
2026-08-23. SGP TypeScript/PostgreSQL now owns a forward-only
`OPEN → MITIGATED → RESOLVED` incident workflow with acknowledgement,
workspace-member assignment, append-only operator notes, hash-only evidence,
operation correlation, optimistic versions, request-key replay and atomic
audit/timeline events. Mitigation and resolution are server-gated; resolution
never resumes a deployment and no outbox/source request is created.

Evidence is contracts 44/44 and fresh-PG Control API 159/159 plus ten-migration
dump/restore. Findings, alerts, dead letters and trace-order are four typed
unavailable source panels. Claude's exact Lane A consumer packet is
[`CODEX_TO_CLAUDE_EX_BE_05B_F1B_HANDOFF.md`](CODEX_TO_CLAUDE_EX_BE_05B_F1B_HANDOFF.md).
Claude owns Phase 8 adapter/rail/degraded-state/accessibility tests. Codex next
rechecks the exact D2 IAM DryRun; D2/D3/D4 and source-backed Incident Detail
remain independently owner/contract/evidence gated.

---

## 25. Phase 4 — Paper Workbench dựng xong (2026-08-22)

Màn thứ 9/17. Phụ thuộc duy nhất là Phase 3, đã dựng — nên nó chưa từng bị chặn,
chỉ chưa ai làm.

### 25.1 Một quyết định bố cục quyết định cả màn

Hi-fi đặt observation gate **cạnh** biểu đồ equity, không phải dưới. Lý do nằm
trong mục đích của màn: **Paper tồn tại để thoát khỏi Paper**. Người đọc phải
cuộn mới biết mình đi được bao xa sẽ đọc biểu đồ và đoán thay.

Test khoá điều đó bằng cách khẳng định cả hai nằm trong **cùng một grid**, chứ
không phải khẳng định thứ tự DOM.

### 25.2 Ba luật của màn

| Luật | Cách giữ |
|---|---|
| CTA thoát **gọi tên** điều kiện chưa đạt | *"Blocked"* là một ticket; *"18 more days of observation (12 of 30)"* là một chỉ dẫn. Ba dòng, không phải một con số |
| Projection stale **nói rõ nó không khẳng định gì** | giữ giá trị cuối, đánh dấu, kèm câu *"orders remain authoritative in the Execution cell"* và *risk fails closed*. Operator hành động được trên con số biết là cũ; không hành động được trên khoảng trắng |
| `operatorAdmin` false **ẩn hẳn** nút mutation | không disable — nút không bao giờ bấm được là câu hỏi người ta hỏi mãi |

### 25.3 Drift: verdict của server, không phải so sánh của browser

`52.7%` so `54.1%` — "within band" hay không là **policy mà approval được cấp
theo**, không phải phép so sánh. Năm dòng drift mang đủ bốn verdict, gồm
`INSUFFICIENT_DATA` cho slippage với 12 fill: hiện một con số ở đó là **bịa ra
sự tự tin mà cỡ mẫu không đỡ nổi**.

Và câu quy tắc đi kèm: **WATCH không chặn gì, FAIL chặn exit**.

### 25.4 Reuse report

Dùng lại: `LifecycleRail` + `stageRail`, `ObservationProgress`, `ChartTile`,
`KeysetTable`, `AuthorityBadge`, `EnvironmentBadge`, `StatusChip`, `PanelState`,
`capPreserving`, `ExecutionSurface`, và các class `exec-alpha-kpis` /
`exec-alpha-tabs` / `exec-gate-panel` / `exec-360-facts` / `exec-360-sync`.
Mới: khối `exec-paper-*` (lineage strip, stale banner, exit block).

Lần này **đọc API component trước khi viết** — ở phase 14 tôi đẻ trùng cả footer
vì bỏ bước đó.

### 25.5 Scale

`orders`/`fills` không có retention → **page, không cap** (1,284,991 dòng trong
test). `sessions` hữu hạn → cap 20 giữ session `CRASHED` ở dòng **317/400**.

### 25.6 Evidence

vitest **1,011 passed / 1 skipped** (+18) · tsc sạch · build sạch · visual
baseline **101/101** · contrast 14/14.

### 25.7 Tiếp theo

**Phase 13 (Paper Workbench VNM)** là biến thể của phase 4 — dựng được ngay.
Sáu màn còn lại vẫn chờ Bobby chốt catalogue phase 6 (§23.2).

---

## 26. Phase 13 — Paper Workbench VNM (2026-08-22)

Màn **thứ 10/17**. `IMPLEMENTATION_PHASES` gọi nó là *"biến thể của phase 4"*,
nên phép thử thật sự là: **phase 4 dựng ra một màn, hay dựng ra một màn crypto?**

Kết quả: thêm ba prop tuỳ chọn vào `PaperWorkbench` (`calendar`,
`venueLocalTime`, `credential`) là đủ. **Không fork, không copy.** 18 test của
phase 4 vẫn xanh nguyên sau khi sửa. Mọi thứ "VN" của màn này là **dữ liệu** —
VND trên từng con số, LO/ATO/ATC nguyên văn, lot 100, T+2.5.

### 26.1 Điểm đóng phase là một hàm thuần

§13 đóng phase bằng đúng một câu: *"freshness clock **provably** pauses outside
09:00–14:45 ICT"*. Nên đồng hồ là **hàm thuần** `vnCalendar.ts`, không phải một
nhánh `if` trong render — thứ phải chứng minh được thì không nên nằm ở chỗ chỉ
kiểm được bằng cách đếm phần tử DOM.

Sáu test chỉ cho đồng hồ: mở/đóng đúng biên (14:45 là **giờ đóng**, không phải
phút giao dịch cuối), `PAUSED` chứ không `STALE`, đếm tới phiên mở tiếp qua cuối
tuần (20:14 thứ Sáu → 09:00 thứ Hai, **không phải 12 tiếng**), nhảy qua ngày
nghỉ lễ venue công bố, và `tradingDaysBetween` để **closure không tiêu vào cửa
sổ quan sát**.

Cái cuối là luật quan trọng nhất: một deployment ngồi qua Tết **chưa quan sát**
những ngày đó. Đếm chúng là thăng hạng một alpha bằng hai tuần thị trường đóng.

### 26.2 Bốn phân biệt màn này giữ

| Phân biệt | Vì sao |
|---|---|
| **`PAUSED` ≠ `STALE`** | ngoài phiên, dữ liệu tươi đúng như thị trường cho phép. Gắn STALE là đẩy operator đi tìm lỗi trong một hệ thống đang chạy đúng |
| **Session state ≠ runtime state** | hai chip cạnh nhau: `SUSPENDED_BY_CALENDAR` + `READY`. Gộp lại là báo một deployment khoẻ mạnh thành đã dừng |
| **Banner INFO ≠ warning** | thị trường đóng không phải sự cố. Banner amber sẽ khiến người ta đi tìm sự cố. Banner `stale` vẫn giữ warn — cái đó *là* sự cố |
| **LO/ATO/ATC nguyên văn** | `ATO` không phải `MARKET`, `LO` không phải `LIMIT`. Chúng khớp ở phiên đấu giá theo luật mà loại lệnh phiên liên tục không có, và từ đã dịch là từ venue không nhận ra khi gọi hỗ trợ |

### 26.3 Credential: hiện trạng thái, không đưa nút

DNSE OTP gia hạn ở phía Execution. Một nút ở đây là **lời hứa Portal không giữ
được**. Test khẳng định strip đó không có `role="button"` nào.

### 26.4 Evidence

vitest **1,026 passed / 1 skipped** (+15) · tsc sạch · build sạch · visual
baseline **101/101** · contrast 14/14. Phase 4 giữ nguyên 18/18 sau khi sửa.

### 26.5 Tình hình 17 màn

**10 đã dựng** (0, 1, 2, 3, 4, 5, 13, 14, 15, 16, 17 — tính cả shared).
**7 còn lại** (6, 7, 8, 9, 10, 11, 12) đều đi qua phase 6.

Bobby đã chốt **phương án B** cho catalogue phase 6: các use case hiện chỉ có
PostgreSQL/Redis/CLI cần được Trading System owner công bố thành HTTP contract
typed, bounded và authenticated. Codex chỉ viết Portal compatibility adapter
sau khi contract đó được công bố; Codex không mở endpoint trong Trading System
và Portal không truy cập trực tiếp DB/Redis/CLI. Vì vậy phase 6 vẫn chờ source
contract owner, không chờ một Portal escape hatch. Request lịch sử ở
`HOTFIX_REQUEST_2026-08-22.md`; ruling hiện hành ở `EXECUTION_REQUEST_LEDGER.md`
§4.3–§4.4.

## 27. D4 Paper-shadow offline authorization checkpoint — 2026-08-23

Backend status: `D4_OFFLINE_AUTHORIZATION_PREPARED /
LIVE_D4_PREDECESSOR_BLOCKED`.

- Full Portal/Control API/browser ingress remains on SGP; AWS-HK receives only
  the minimal Source Proxy + Rust Edge + private projection boundary.
- D4 cannot begin until D2 dark and D3 transport are accepted, dedicated Paper
  read identity rejects missing/wrong credentials, exact GET/cursor/
  completeness/resync contracts are published and encrypted projection storage
  is approved.
- Any future D4 epoch remains `BUILDING`; registry stays `fixture`; Query,
  analytics, SSE, commands and activation remain off.
- Claude may consume typed offline fixtures and error/gap codes only. It must
  not label Paper data live or open EventSource based on this checkpoint.
