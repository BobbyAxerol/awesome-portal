# Codex → Claude — Execution Loop product UI/UX refactor handoff

> Status: **OWNER_REJECTED_CURRENT_PRODUCT COMPOSITION**  
> Priority: **P0 before merging the Execution product-route preview into `dev`**  
> Scope: frontend composition, visual system, interaction completeness and product-route integration.  
> Non-goal: changing backend authority, financial meaning, safety states or Trading System contracts.

## 0. The decision

The current Execution screens contain a large amount of correct domain work, but the product-route
render is not acceptable as a Portal experience. Matching individual hi-fi blocks was not enough.
Once those blocks were mounted inside the real mother shell, the result became a split product:

- a light Research shell surrounding a dark Execution rectangle;
- an operations workstation whose typography reads like one long terminal dump;
- pages with different information densities but almost the same stacking strategy;
- tabs, filters and CTAs that look active while some are no-ops in the preview integration;
- provenance details, raw screen ids and digest fragments competing with the user's actual decision;
- no coherent relationship among page header, tab strip, main canvas and contextual right rail.

This is **not** a request to discard the content or weaken the existing contracts. Preserve the same
facts, safety semantics, seven states, exact decimal handling, authority envelopes, lifecycle model,
fixtures and backend boundaries. Refactor **how the product reveals and arranges them**.

The owner screenshot on 2026-08-24 is the rejection evidence. Existing green unit tests and visual
baselines do not overrule that decision: they prove stability and selected invariants, not that the
frozen composition was good.

### 0.1 Owner override — 2026-08-24

This section overrides any older HiFi note, design-system discussion or implementation phase that
describes Governance as light, calls a screen “exact”, or treats the top-level route as the whole
scope.

1. **HiFi is a functional floor and a design reference, not pixel authority.** The implementation may
   improve layout, wording, navigation and add decision-useful content. It may not omit a capability,
   sub-view, state or interaction demonstrated by the HiFi corpus.
2. **Read every `.dc.html` completely.** A main route existing is not completion. Tabs, filters,
   drawers, disclosures, role lenses, alternate states, chart interactions, row drill-downs,
   PLAN/APPLY/VERIFY steps and responsive behavior inside that file are all part of its minimum
   acceptance contract.
3. **Execution Loop is one Carbon workspace from Approval Inbox/Gate R1 onward.** Governance, exit
   review, workbench, operations, 360°, blotter and action surfaces share the same Carbon base canvas,
   shell and typography. There is no `governance-light` exception and no dark rectangle embedded in a
   light Execution page.
4. **“One Carbon theme” does not mean one literal hue.** Keep restrained semantic colors for status,
   severity, stage guards, focus and safety actions. Color must carry meaning and must never be the
   only signal. Do not introduce a second page theme.
5. **Typography roles are locked across the cluster.** A page title does not become smaller because a
   screen is dense, and a sparse page does not inflate its type. Density changes spacing, disclosure,
   columns and row height—not the type hierarchy.

Any active frontend guide or tracker that still says Governance Light or “rebuild exactly” must be
reconciled to this owner override before implementation continues.

## 1. Why the existing review was insufficient

`REVIEW_CODEX_PREVIEW_INTEGRATION_2026-08-23.md` correctly assessed routing, stop gates, fixture-only
network behavior and merge safety. Those are necessary, but they answer a different question.

| Previous question | New mandatory question |
|---|---|
| Does the route mount the intended fixture screen? | Does it look and behave like one continuous Portal workspace? |
| Is AWS-HK/realtime still dark? | Can the operator distinguish live capability, local simulation and disabled authority without reading a paragraph? |
| Are the component contracts preserved? | Is the information ordered by the decision the user is making? |
| Are screenshots stable? | Is the baseline itself worth preserving? |
| Does a button exist and have an accessible name? | Does every visible control produce a useful, testable result? |

Therefore the previous “three non-blocking fixes” conclusion no longer represents the merge gate.
The product composition is now blocking.

## 2. Evidence from the current implementation

### 2.1 The shell and the screen run different visual systems

`ExecutionSurface.tsx` applies `operations-carbon` only to a nested screen wrapper. `PortalShell.tsx`
keeps topbar, sidebar, page gutter and preferences outside that wrapper. In the rejected render the
topbar selector still says `Research Light`, the sidebar is warm white, and the page is Carbon black.

This is not a tasteful hybrid; it is an accidental seam. Theme is being used as a component-local skin
when the user experiences it as a workspace mode.

### 2.2 The declared typography is not the typography that is loaded

The Carbon token block declares IBM Plex fallbacks, but `package.json` only bundles Inter, JetBrains
Mono and Newsreader. `base.css` also hard-codes those families instead of consistently reading
`var(--font-display|body|mono)`. As a result:

- the Execution theme cannot reliably change typography through tokens;
- `exec-tile-title`, panel labels, buttons, tabs, ids, captions and much explanatory text all compete
  in small monospace;
- the main entity title is often rendered with the same 11px uppercase style as a panel micro-label;
- body prose sometimes looks like diagnostics, while shell prose uses a different visual voice.

### 2.3 Some product-preview controls are active-looking no-ops

`ExecutionPreviewRoute.tsx` mounts `PaperWorkbench`, `AlphaThreeSixty`, `PortfolioThreeSixty`,
`AccountBroker360` and `FullBlotter` directly. Their interaction callbacks are optional and the route
does not provide all of them. Examples include:

- `onTabChange` for Paper, Alpha and Portfolio;
- `onFilterChange`, `onResetCrossFilter`, `onExpand` and `onLoadOlder` for Full Blotter;
- `onRequestExit`, `onSyncNow`, `onDryRun` and navigation actions.

The controls render as buttons, but optional chaining turns the click into silence. This is worse than
a disabled control: it trains the user to distrust the product.

### 2.4 Engineering metadata occupies the primary reading path

The preview banner prints the raw `screenId`. Page headers and lineage strips foreground artifact
digests, source timestamps, revision tokens and internal ids. These fields are legitimate evidence,
but most of them answer “can I audit this later?”, not “what needs my attention now?”.

The current design treats “every rendered id must be navigable” as “render every id immediately”. The
first rule does not imply the second. Progressive disclosure can keep every value accessible without
putting all of them above the fold.

### 2.5 The page stacks correct blocks without a coherent decision hierarchy

Paper Workbench is meant to answer: **Can this deployment leave Paper, and if not, what blocks it?**
The current render gives similar visual weight to title metadata, lineage, lifecycle, five KPIs, an
empty-looking chart frame, observation progress, runtime health, accounting, contribution, drift and
tabs. The reader must construct the decision hierarchy themselves.

Sparse screens stretch a few values across large panels. Dense screens append more panels and tables
vertically. That is responsive CSS, but not responsive information architecture.

### 2.6 The current visual gate freezes local groups, not the integrated product experience

The group-level Execution baseline is valuable for state correctness. It intentionally hides the
sticky shell topbar and captures isolated groups. That means it cannot catch the exact failure shown
by the owner: the seam between shell, content, tabs and surrounding navigation.

The refactor needs a second baseline class: **canonical product routes with the real shell visible**.

### 2.7 Current Claude implementation audit — 2026-08-24

This is an audit of the implementation state currently present in the shared worktree, not a judgment
of the contributor. It separates useful engineering hardening from the product refactor requested by
the owner. Do not report the former as completion of the latter.

#### 2.7.1 Executive verdict

| Area | What the current pass actually does | Verdict |
|---|---|---|
| Responsive containment | Adds `min-width: 0`, wrapping, horizontal table scrollers and narrow-grid collapse | **KEEP — 7/10** |
| Integrated product composition | Leaves the light Portal shell around an independently themed Execution subtree | **REWORK — 2/10** |
| Carbon continuity | Preserves the Governance Light / Deployments Carbon split | **P0 BLOCKER** |
| Typography | Keeps pervasive uppercase/mono styling and does not introduce semantic type roles | **P0 BLOCKER** |
| Product-route interaction | Preview mounts controls without the callbacks/state required to make them work | **P0 BLOCKER — 2/10** |
| HiFi nested coverage | Top-level components and fixture states exist, but no complete route-level ledger proves every nested screen/state/action | **P0 BLOCKER** |
| Charts and analytical affordances | Large `ChartTile` frames still have no plot body on important routes | **P0 BLOCKER** |
| Visual and journey tests | Fixture groups test isolation/overflow but do not test the integrated shell, hierarchy or complete user journeys | **P0 BLOCKER** |
| Merge readiness | The useful responsive patch may be retained, but the product UI/UX is not ready for owner approval | **BLOCKED** |

The current work is therefore a **responsive-hardening subtask**, not the promised product refactor.
Its CSS and table containment fixes should be carried forward rather than discarded, but they do not
close any of the mandatory EL-V2-00 through EL-V2-09 phases in §12.

#### 2.7.2 Concrete omissions and contradictory implementation

1. **The shell/theme architecture still produces the exact visual seam in the owner screenshot.**
   `ExecutionSurface.tsx` explicitly says “two surfaces, not one” and maps `governance` to
   `operations-carbon-light`. `PortalShell.tsx` has no route-aware presentation context, while
   `TopBar.tsx` continues to expose `Research Light` and `Operations Dark` from a user preference.
   This contradicts the owner override in §0.1: from Approval Inbox/Gate R1 through Live, the whole
   shell and workspace must be one Carbon system.

2. **The current pass fixes overflow, not information architecture.** The dirty screen changes mainly
   add scroll wrappers, split identity lines and collapse grids. They do not establish a shared page
   header, primary decision summary, contextual right rail, disclosure hierarchy or continuous tab
   model. Sparse screens remain stretched; dense screens remain stacked terminal-like panels.

3. **Typography remains structurally inconsistent.** `execution.css` currently declares
   `font-family: var(--font-mono)` 144 times. The repository bundles Inter, JetBrains Mono and
   Newsreader, while the token story also refers to IBM Plex without bundling it. Page identity,
   section labels, buttons, captions, values and diagnostics still frequently share the same small
   uppercase mono voice. The responsive patch does not introduce the locked semantic role scale in
   §5.2.

4. **Product-preview controls are knowingly rendered as no-ops.** The preview route mounts screens
   without their optional callbacks. Confirmed examples include Paper/Alpha/Portfolio tab changes;
   Paper exit and history actions; Blotter filters, reset, expand and load-older; and Account sync and
   dry-run actions. The screen components call callbacks through optional chaining, so enabled-looking
   controls silently do nothing. Every such control needs a stateful preview adapter, an explicit
   disabled reason, or truthful navigation—never a silent click.

5. **The preview exposes implementation identity instead of product context.** The raw `screenId` is
   printed in the preview banner, while hashes, revisions, internal ids and lineage dominate several
   headers. These remain accessible evidence, but full digests and internal routing names belong in a
   provenance/inspector disclosure, not the primary scan path.

6. **Important charts are still empty frames by design.** `components/chart.tsx` says Phase 0 renders
   only the frame/caption and defers ECharts. Paper and Alpha fixtures often provide an envelope with
   no plot body. This creates the large blank block visible in the screenshot and omits tooltip,
   approved-envelope comparison, zoom/reset, expand, table/export and cross-filter behavior described
   by the implementation plan and HiFi.

7. **A top-level route count is being mistaken for complete HiFi coverage.** The preview can select
   the main screen components, but that does not prove the nested tabs, drawers, alternate state
   families, role-specific modes or confirmation ceremonies inside all eighteen `.dc.html` sources.
   Product routes currently default to a narrow happy-path state; `QUIET`, `STALE`, `UNMET`,
   `CRITICAL`, `MISMATCH`, denied/degraded and role variants largely remain fixture-only evidence.

8. **No product-level equivalent is demonstrated for several explicit HiFi capabilities.** The
   coverage ledger must locate or mark missing at least: Break-glass ceremony (WF 5b), role lens (WF
   5c), real Manager/Quant density behavior (WF 4g), full-journal drill-down, condition editing,
   request-changes flow, approval/smoke-plan drill-through and the required chart interactions. A
   differently named equivalent is acceptable only when the ledger links to the exact component,
   route, interaction and test.

9. **There is no shared contextual right rail or provenance drawer.** Individual panels are arranged
   side by side, but scope, blockers, evidence and actions do not follow the active tab consistently.
   The screenshot therefore feels like unrelated boxes rather than one decision workspace.

10. **Terminal styling has escaped its proper boundary.** A terminal is appropriate for bounded raw
    event/command/audit evidence. It is not the default grammar for page titles, primary action copy,
    cards, charts and explanatory prose. The current surface makes the whole application feel like a
    debug console without delivering the precision of an actual terminal.

11. **The status language can overstate progress.** `PHASE_TRACKER.md` can say a “screen” is built when
    the actual state is a component/fixture contract. From now on every item must report four separate
    states: `component contract built`, `product route mounted`, `nested interactions complete`, and
    `integrated visual approved`. The current composition is `REWORK_REQUIRED` even where backend and
    component contracts remain complete.

#### 2.7.3 Why the existing green tests do not approve this UI

- `execution-fixtures.spec.ts` hides `.portal-topbar` before screenshots, so it cannot detect the
  light-shell/dark-island seam shown by the owner.
- The same suite explicitly asserts that Governance remains light. That expectation implements the
  superseded design and must be rewritten for the Carbon-only owner override.
- Fixture screenshots crop isolated `[data-group]` sections instead of canonical product routes with
  the real shell, tab row, context rail and overlays visible.
- `execution-surface-audit.spec.ts` exercises `/execution/_fixtures` and primarily measures overflow,
  focus, IDs and contrast. It does not prove decision hierarchy, typography roles, right-rail
  continuity, nested-screen coverage or journey completion.
- The current responsive audit tolerates known clipped elements at mobile/tablet widths. A temporary
  diagnostic allowance may help locate debt, but it is not an acceptance gate; the merge gate is zero
  unexplained clipping.
- The preview smoke test proves route mounting and source isolation. It does not click the controls or
  assert that state, URLs, drawers, tabs and contextual content change.

Retain these tests for their narrow purpose, but add product-route visual baselines and journey tests.
Do not update screenshots merely to make the current composition green before owner sign-off.

#### 2.7.4 Mandatory correction list for Claude

1. Rewrite `ExecutionSurface.tsx` and its obsolete “two surfaces” rationale; introduce the
   route-aware Carbon workspace contract above `PortalShell` as defined in §4.
2. Make `TopBar`, sidebar, canvas, overlays and right rail consume the effective Execution presentation
   mode atomically. Do not leave the theme selector claiming `Research Light` on an Execution route.
3. Implement the semantic typography tokens/components and fixed role scale before restyling screens.
4. Build `ExecutionWorkspace`, `ExecutionPageHeader`, `ExecutionTabs`, `ExecutionContextRail`,
   `ExecutionProvenanceDrawer` and a bounded `ExecutionTerminal` (names may differ; responsibilities may
   not disappear).
5. Replace direct stateless preview mounting with per-screen stateful preview containers and test the
   transition caused by every visible enabled control.
6. Remove `screenId` and full digests from default chrome; keep them copyable in an inspector or
   provenance disclosure.
7. Replace blank analytical frames in the Paper reference slice with a real legible visualization and
   its required inspect/reset/expand/table behavior before migrating the remaining screens.
8. Complete the §11.6 ledger for every source HTML, including nested views and demo-prop variants;
   attach a route, state owner, interaction disposition and test to every row.
9. Replace the Governance-Light assertions and add shell-visible screenshots at canonical desktop and
   laptop sizes plus keyboard-driven journey tests.
10. Preserve the current responsive containment fixes, then tighten the final gate to zero unexplained
    clipping, zero duplicate ids and zero enabled no-op controls.

#### 2.7.5 What must not happen in the next pass

- Do not call scroll wrappers, line wrapping or mobile grid collapse “the UI/UX refactor”.
- Do not reduce the scope by deleting HiFi sub-screens, states or actions.
- Do not duplicate every HiFi word literally; preserve capability and improve hierarchy/content.
- Do not mass-apply more mono/uppercase styling to achieve visual consistency.
- Do not update visual baselines until the integrated Paper vertical slice is approved.
- Do not merge a preview whose buttons appear enabled but have no observable result.
- Do not wait for new backend work to fix shell continuity, typography, hierarchy or preview state;
  those are frontend architecture responsibilities.

#### 2.7.6 Required immediate sequence

1. Reconcile the current branch with this owner override and classify the responsive patch as a kept
   subtask, not a finished refactor.
2. Finish and publish the full §11.6 coverage ledger; mark unknowns instead of assuming coverage.
3. Complete EL-V2-01 (route-aware Carbon shell) and EL-V2-02 (semantic
   typography/anatomy) only after EL-V2-00 is accepted.
4. Rebuild Paper Workbench as the measured vertical slice, including real chart, working tabs,
   context rail, provenance disclosure and Paper Exit journey.
5. Obtain owner review of that single integrated route with the real shell visible.
6. Only then migrate Governance, Operations, 360° and Tools archetypes using the proven system.

## 3. Target mental model

Execution is not “a terminal page”. It is an **institutional operations workspace** with a terminal
available where exact commands, events or audit evidence require it.

The product should have three visual voices, not one:

1. **Navigation and decisions — sans.** Page title, section headings, explanatory copy, button labels.
2. **Numbers and compact identity — mono.** Prices, PnL, counts, timestamps, short ids and status codes.
3. **Raw operations evidence — terminal surface.** Request/response, command plan, event stream, audit
   payload and full digests, opened deliberately rather than painted across the whole page.

Every screen must make its primary question visible within one scan:

| Archetype | Primary question |
|---|---|
| Governance | What decision is waiting, and what evidence blocks it? |
| Workbench | Is this stage healthy and eligible to exit? |
| Control room | What is unsafe now, and what protective action remains available? |
| Queue/incident | What needs attention first, who owns it, and what is the next operation? |
| 360° entity | How is this entity composed, where is risk concentrated, and where should I drill down? |
| Blotter | Which exact orders/fills match the scope, and what is the event funnel? |
| Command drawer | What will change, under which authority, and how is completion verified? |

Anything not helping that first question belongs in a lower tab, contextual rail, disclosure panel or
provenance drawer.

## 4. Route-aware shell: the whole workspace must transition together

### 4.1 Required behavior

When a Deployments/Operations screen is active, apply Execution Carbon to:

- topbar;
- sidebar and active navigation item;
- content gutter/canvas;
- contextual right rail;
- overlays, command palette and drawers opened from that route;
- the screen itself.

There must be no supported state where the selector says `Research Light` while the product canvas is
Carbon black. The selector must show the **effective** workspace appearance.

Approval Inbox, Gate R1, Gate R2 and every Exit Review are part of Execution Loop and therefore use
the same Carbon base as Paper/Sandbox/Canary/Live. Distinguish a governance decision from an
operational workbench through hierarchy, density and component anatomy—not by switching the entire
canvas to white or inserting a dark preview island.

If an explicit appearance override is ever supported, it changes the entire workspace atomically; it
never creates a light chrome/dark island combination. That override is outside the current refactor:
the required and tested Execution appearance is Carbon.

### 4.2 Implementation direction

Create one route-level presentation context owned by the mother shell, for example:

```ts
type PortalPresentationMode =
  | "research-light"
  | "execution-carbon";
```

It is presentation metadata only, not a capability registry or a second feature model. Derive it from
the canonical resolved `screen_id`/Execution screen classification already used by the route; do not
infer it from `delivery_profile` because data delivery and visual mode are different concepts.

The provider applies the mode above `PortalShell`, and `ExecutionSurface` becomes a semantic screen
container rather than the only theme boundary. Keep the existing Research/Planning token values
untouched.

### 4.3 Shell integration details

- Active Execution nav uses a 3px accent rail + surface change, not a pale Research pill.
- Topbar breadcrumb becomes the compact product locator: `Execution / Paper / Carry v3.2`.
- Replace generic environment prose with a concise stage/environment badge.
- The preview warning belongs below the breadcrumb as a compact environment strip, not as a large
  sticky paragraph competing with the screen header.
- Remove raw `screen_id` from normal chrome. It may appear in an inspector accessible from the preview
  badge.
- Side navigation should not show `SOON` beside the route the user is currently viewing as an active
  preview. Use one truthful state such as `PREVIEW`, and keep unrelated future routes subdued.

## 5. Typography and scale contract

### 5.1 Load the fonts the design system claims to use

Choose one of these paths and make it true end-to-end:

1. preferred: bundle IBM Plex Sans and IBM Plex Mono for Execution; or
2. explicitly standardize Execution on the already bundled Inter + JetBrains Mono and update the
   design-system claim.

Do not declare IBM Plex as a fallback while never loading it. Do not let `base.css` hard-code families
that bypass contextual tokens. Shared selectors should read semantic font tokens.

### 5.2 Two-family maximum, one locked role scale

These are shared defaults, not per-screen suggestions. A component may respond at a documented narrow
breakpoint, but an individual screen may not invent a new size because it has more or less content.

| Role | Family | Locked size/line | Notes |
|---|---|---|---|
| Page title | Sans | 24 / 32 | weight 400; never uppercase mono |
| Entity subtitle | Sans + short mono id | 14 / 20 | human name first, immutable id second |
| Section title | Sans | 15 / 22 | sentence/title case, weight 600 |
| Body/action explanation | Sans | 13 / 20 | maximum readable line length around 72 characters |
| Button/tab/control | Sans | 13 / 18 | mono only when the label itself is a command token |
| Table header | Sans | 11 / 16 | uppercase optional, moderate tracking |
| Table/body data | Sans or Mono by meaning | 12 / 18 | identity in sans; exact values in mono |
| Numeric value | Mono | 14 / 20 | tabular, right aligned |
| KPI value | Mono | 24 / 32 | the same level across all Execution screens |
| Meta/status/id | Mono | 11 / 16 | never the only text explaining a decision |
| Terminal/log | Mono | 12 / 18 | exact, selectable, scrollable |

Load-bearing text must not be 10px. Ten pixels is reserved for a secondary envelope caption that the
user can expand, not for a page's primary identity or required action reason.

### 5.3 Remove the universal “micro-mono” effect

Audit at least these classes: `exec-tile-title`, `exec-blotter-note`, `exec-state-reason`,
`exec-disabled-reason`, button classes, filters and tabs. A class named “tile title” cannot also serve
as the main page title. Introduce explicit roles:

- `ExecutionPageTitle`;
- `ExecutionSectionTitle`;
- `ExecutionMeta`;
- `ExecutionDataValue`;
- `ExecutionEvidenceCaption`.

The role decides typography; individual screens should not choose arbitrary font-size utilities.

## 6. One continuous page anatomy

Every product route should use the same outer anatomy, even though inner composition changes:

```text
Portal topbar / breadcrumb / global controls
┌───────────────────────────────────────────────────────────────────────────┐
│ compact preview/environment strip (only when applicable)                  │
├───────────────────────────────────────────────────────────────────────────┤
│ page masthead: identity + stage/status                     primary action │
│ short purpose / scope                                      secondary menu │
├───────────────────────────────────────────────────────────────────────────┤
│ lifecycle or scope rail (only when meaningful)                            │
├──────────────────────────────────────────────────┬────────────────────────┤
│ main decision canvas                             │ contextual right rail  │
│ metrics / chart / table                          │ next decision          │
│                                                  │ blockers / freshness  │
│                                                  │ alerts / provenance   │
├──────────────────────────────────────────────────┴────────────────────────┤
│ detail tabs: positions / orders / sessions / accounting / evidence        │
└───────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Page masthead

The masthead contains only:

- human-readable entity name;
- short immutable id;
- stage, runtime, readiness and broker-sync badges as separate states;
- one sentence of purpose/scope when needed;
- one primary action and at most one overflow/secondary group.

It does not contain full hashes, raw screen ids, long authority captions or every approval reference.

### 6.2 Tabs

Tabs are a stable navigation layer, not a row of filter-looking buttons appended near the bottom.

- Put tabs immediately below masthead/scope, or immediately above the detail region they control.
- Active tab must share an edge/surface with its panel.
- Preserve selected tab in URL search/hash where deep linking matters.
- A tab click must always switch visible content and update accessibility state.
- On narrow widths, scroll only the tab strip, never the page.
- Counts may be shown only when authoritative and useful, e.g. `Orders 12`; do not add decoration.

### 6.3 Contextual right rail

Build one shared `ExecutionContextRail`, not seventeen unrelated side panels.

At ≥1280px it is a sticky 320–360px column below the topbar. Below that it becomes a drawer or an
inline region after the main decision block. It contains, in this order:

1. **Next decision/action** — what the current screen is for;
2. **Blockers/conditions** — named, not merely counted;
3. **Freshness/source health** — compact authority summary;
4. **Alerts/incidents** relevant to the current entity;
5. **Provenance** disclosure.

The rail follows tab/scope selection. If the user switches from Overview to Sessions, its next action
and source summary must not describe the old panel. The rail must not be a visually detached “right
bar” with unrelated global text.

### 6.4 Density by information shape

Do not force all screens into the same number of cards or the same panel height.

- Sparse content: use a narrower measure and grouped definition rows; do not stretch three facts over
  a 1,500px canvas.
- Dense content: use tables, virtualization, keyset navigation and sticky local toolbars; do not stack
  ten cards before the table.
- A chart gets height from its analytical job, not from available empty space.
- Never show a large empty chart frame. Render the fixture series or a compact honest state.
- Above the fold must contain the screen's primary decision, primary action and current blocker.

## 7. Content hierarchy and progressive disclosure

### 7.1 Preserve information, change its layer

| Information | Default presentation |
|---|---|
| Human name, stage, health, decision readiness | Always visible |
| Short entity/deployment/account id | Visible and navigable |
| R1/R2 or exit approval refs | Lifecycle rail or provenance summary |
| `as_of`, age, freshness | Compact source/freshness component; expand for full envelope |
| Full SHA-256, image digest, payload hash | Provenance drawer with copy action |
| Formula version, sample/coverage | Chart/table caption; expand for full method |
| Raw request/response/event | Terminal or audit tab only |
| Internal `screen_id`, fixture key | Preview inspector only |

Hashes are not secrets, but that does not make them good primary UI. Default text should read
`Artifact verified` or a short id such as `9f3c1a…e2`, with **Copy full digest** and **Open provenance**.
Never show a full digest in a masthead, KPI strip or explanatory sentence.

### 7.2 Copy budget

Operational UI copy should be terse and actionable:

- one-line state summary;
- one-line consequence;
- one next action.

Move policy explanations, implementation caveats and educational prose into help/disclosure. Avoid
paragraphs explaining invariants the component can demonstrate structurally.

Preview banner target:

```text
FIXTURE PREVIEW · No live connection · Actions are simulated
```

An info disclosure may list AWS-HK, Trading System, broker and realtime details. The default banner
must not occupy the same attention level as a production warning.

## 8. Interaction completeness contract

### 8.1 No visible no-op controls

Every visible interactive element must be classified:

| Class | Preview behavior |
|---|---|
| Local UI interaction | Must work: tabs, filters, expand/collapse, scope, rail open/close |
| Canonical navigation | Must route to the declared screen and preserve entity/scope context |
| Safe simulated workflow | Must show an explicit fixture plan/result and update local state |
| Unavailable source mutation | Disabled with an inline reason; never active-looking |
| Forbidden action | Hidden when policy requires hidden, otherwise denied state with required role |

Optional callbacks must not silently become product behavior. Use stateful preview containers for
direct-rendered screens or make the control require a handler before it renders as enabled.

### 8.2 Required preview journey tests

At minimum, prove these journeys on real product routes:

1. Paper: switch every tab → request exit → open Paper Exit Review → return with context preserved.
2. Alpha 360: change venue → all KPIs/tabs follow → open deployment/account.
3. Portfolio 360: switch tabs → select correlation lens → open Alpha 360.
4. Full Blotter: change filter → reset cross-filter → expand row funnel → load older.
5. Account 360: open dry-run/sync action; fixture mode either simulates visibly or disables honestly.
6. Queue → Incident → Action Drawer → Verify result → back to Queue.

Add a structural test: within every Execution preview product route, an enabled button must either
navigate, mutate visible state, open a surface or call a declared handler. A click that leaves route,
DOM state and accessible announcement unchanged is a failure unless the button is explicitly a repeat
action whose result is announced.

## 9. What the terminal should be

### 9.1 Terminal is a specialized evidence component

Use a terminal only for:

- command PLAN/APPLY/VERIFY transcript;
- exact request preview;
- event/audit stream;
- broker/reconciliation diagnostic output;
- raw payload or full provenance when explicitly opened.

Do not style the whole Workbench as a terminal. A dark operations theme is not the same as a CLI.

### 9.2 Terminal anatomy

```text
┌ Command verification ─ status ─ source ─ follow/pause ─ copy/export ┐
│ 10:42:01.121  PLAN      cmd_9f12       verified                     │
│ 10:42:02.008  APPLY     202 accepted   not terminal success         │
│ 10:42:02.611  VERIFY    sub-intent 1   passed                       │
│ 10:42:03.044  VERIFY    sub-intent 2   partial · residue remains    │
├──────────────────────────────────────────────────────────────────────┤
│ Details / raw request / provenance (explicit tab or disclosure)      │
└──────────────────────────────────────────────────────────────────────┘
```

Requirements:

- 12–13px mono, 18–20px line height, selectable text;
- timestamp, phase, object id and message use stable columns;
- severity/status has text and icon, never color alone;
- one local scroll container with sticky toolbar;
- follow/pause, copy selected, copy full, export and clear-local-view controls;
- gap/reconnect/partial states appear as typed rows, not hidden console errors;
- no fake shell prompt unless the user is actually viewing Equivalent CLI;
- Equivalent CLI is read-only, labelled **Browser never executes this command**;
- full hashes live in raw/provenance detail, with copy action;
- command terminal cannot declare success on `202`; only terminal verification may do so.

### 9.3 Terminal sizing

Default height should be 220–320px, expandable to a focused full-height panel. It must not consume the
entire page just because content is sparse. On a detail screen it belongs in a tab or drawer; on the
Action Drawer it may be the primary lower panel because verification is the user's task.

## 10. Paper Workbench — reference vertical slice

Refactor Paper first and use it as the proof that the shared system works. Do not mass-apply new CSS to
all seventeen screens before this vertical slice is owner-reviewed.

### 10.1 Target layout at workstation width

```text
Masthead
Carry v3.2                                  PAPER · READY
BINANCE · dep_74 · acct-paper-carry-v32     [Request exit review]

Lifecycle
R1 complete → R2 complete → PAPER 30/30 days, 312/300 trades → Sandbox → Canary → Live

Decision strip
Equity | 30d PnL | Drawdown | Allocation | Projection freshness

Main 9/3 or 8/4 grid
┌ Equity vs approved evidence ────────────┬ Next: Paper Exit Review ┐
│ real fixture series, readable axes       │ Gate met / blockers      │
│ approved baseline and gaps visible       │ 30/30 · 312/300 · cycles │
│ concise envelope caption                 │ primary CTA              │
└──────────────────────────────────────────┴──────────────────────────┘

Detail tabs
Overview | Positions | Orders | Fills | Sessions | Accounting | Evidence
```

### 10.2 What moves out of the default canvas

- full lineage and digests → Provenance in right rail;
- runtime session table → Sessions tab;
- full accounting rows → Accounting tab;
- full drift table and approved comparison → Evidence tab;
- long policy explanation → help/disclosure;
- only blocker summary and the most decision-relevant drift remain above the fold.

### 10.3 Paper acceptance

- shell, page and right rail all use one coherent Execution mode;
- title is immediately legible and larger than panel labels;
- real chart content or compact unavailable state, never a blank giant box;
- exit CTA works in the fixture journey or is disabled with the exact missing capability;
- every tab switches content;
- no full hash or raw screen id in default view;
- primary decision + blocker visible without scrolling at 1440×900 and 1728×1000;
- route baseline includes the real topbar/sidebar and right rail.

## 11. Refactor the remaining screens by archetype

### 11.1 Governance: Inbox, R1, R2, Exit Review

- Use the same Carbon workspace, shell, canvas and type roles as the rest of Execution Loop.
- Sticky decision bar is the primary action region.
- Evidence uses sections/tabs; checklist and blockers stay in right rail.
- R2 capital/activation preview is distinguished by border, surface elevation and a clear `PREVIEW`
  label; it is not a different page theme.
- Long evidence digests move to provenance.

### 11.2 Workbenches: Paper, VNM, Sandbox, Canary, Live

- Reuse the Paper anatomy.
- Stage-specific decision panel changes; the page skeleton does not.
- Canary/Live guard bands stay unmistakable but must not turn every panel red.
- Protective actions remain visible and distinct from risk-increasing actions.

### 11.3 Operations: Command Center, Queue, Incident

- Command Center is triage, not a data catalogue: ranked attention first, fleet summary second.
- Queue uses table + contextual alert rail; rail selection follows the selected row.
- Incident uses evidence/timeline/actions tabs with current containment and next action always visible.

### 11.4 Entity 360: Alpha, Portfolio, Account

- Scope and entity identity remain sticky.
- Use tabs for data families; do not render all families vertically.
- Cross-link rows/chips consistently.
- Account/Broker difference is the default decision panel; binding details and sync history are tabs.

### 11.5 Tools: Blotter and Action Drawer

- Blotter gives the table most of the canvas; scope/filter toolbar stays sticky locally.
- Action Drawer uses catalogue + focused drawer and terminal verification; it is the one place where a
  dense command-oriented visual voice is appropriate.

### 11.6 HiFi functional coverage ledger — mandatory before refactor

Claude must create and maintain a row-level coverage ledger in `PHASE_TRACKER.md` before changing the
screen composition. For each item below, record the production component/route, supported fixture
variants, interaction test and visual evidence. `route renders` is not a valid completion claim.

| HiFi source | Minimum nested coverage that must survive the refactor |
|---|---|
| `Execution Wireframes.dc.html` | all WF 1a–1i, 2a/2b, 3a, 4a–4h and 5a–5c behavior; canonical nav/lifecycle rail; break-glass ceremony; role lens; seven-state matrix; density and responsive rules; chart tooltip/zoom/expand/export/cross-filter/reset contract |
| `HiFi Approval Inbox.dc.html` | Mine/All/R1/R2/Exit/Live/Overdue filters; SLA ordering; separation-of-duty visibility; row navigation; empty inbox; recently decided and full history |
| `HiFi Gate R1 Review.dc.html` | artifact passport; evidence/checklist/limitations; WFO evidence; structured conditions; request changes/reject/approve; creator vs reviewer denial and immutable decision semantics |
| `HiFi Gate R2 Review.dc.html` | R1-valid and R1-expired variants; portfolio fit; account/risk plan; capital change preview; observation/rollback policy; structured conditions and disabled approval when blocked |
| `HiFi Paper Exit Review.dc.html` | MET/UNMET observation gate; coverage, drift, limits/accounting and portfolio fit; unresolved conditions; recommendation; extend/reject/promote outcomes and carry-forward evidence |
| `HiFi Paper Workbench.dc.html` | FRESH/STALE variants; lifecycle; observation eligibility; analytics/accounting/runtime evidence; Orders/Fills/Positions/Sessions tabs; report/approvals/admin/exit paths |
| `HiFi Paper Workbench VNM.dc.html` | OPEN/CLOSED session behavior; venue-calendar-paused freshness; runtime vs session state; DNSE OTP status; VND isolation; lot size, LO/ATO/ATC and settlement semantics |
| `HiFi Sandbox Certification.dc.html` | seven certification steps; HALTED fail-closed start; internal/broker/difference triptych; NONE/CRITICAL reconciliation variants; order-type certification; bounded smoke plan; cleanup and exit gates; admin/viewer authority |
| `HiFi Canary Control Room.dc.html` | OK/STALE broker variants; canary envelope; live/paper/backtest evidence; positions/orders; incidents/reconciliation; scale blocker; protective action vs risk-increasing action; operator/viewer authority |
| `HiFi Live Full Operations.dc.html` | OK/MISMATCH broker variants; broker truth replacing normal presentation when unsafe; exposure/orders; risk envelope; incidents; halt/reduce/emergency-close ladder; contribution drill-down; operator/viewer authority |
| `HiFi Command Center.dc.html` | BUSY/QUIET states; ranked triage; truthful empty state; fleet health drill-down; pinned watchlist; Today/deadlines/recent operations |
| `HiFi Operations Queue.dc.html` | Attention/Mine/All filters; operation ordering; typed states including PARTIAL; operation target/action navigation; alert-rail open/close; typed alert ownership; ack ≠ resolve |
| `HiFi Incident Detail.dc.html` | OPEN/RESOLVED states; forward-only state rail; finding/snapshot/blast-radius evidence; operations and timeline; apply-plan handoff; resolution prerequisites; closing never auto-resumes |
| `HiFi Admin Action Drawer.dc.html` | the complete action catalogue, not only allocation; READ/BLOCKED/MUTATION/DANGER treatment; selection; reason; step-up; PLAN/APPLY/VERIFY; VERIFIED/PARTIAL; residue re-plan; Equivalent CLI read-only; no forbidden lab-reset action |
| `HiFi Full Blotter.dc.html` | canonical scope; All/Filled/Partial/Rejected/Open filters; columns/export contract; cross-filter chip/reset; row expand/collapse; full signal→intent→risk→order→fill funnel; keyset/load-older and virtualization |
| `HiFi Alpha 360.dc.html` | venue scope propagating to every panel; Overview plus all 9 tabs (Insight, Positions, Orders/Fills, Risk, Sessions, Accounting, Reconciliation, Audit); twelve analytical tiles; insufficient-data handling; expand/export/cross-filter; entity drill-downs |
| `HiFi Portfolio 360.dc.html` | Overview/Structure & Correlation/Capital Ledger/Approvals/Incidents/Audit tabs; scope controls; structure and correlation; leader lens; contribution/edge; capital and authority paths; role-cut DENIED behavior |
| `HiFi Account Broker 360.dc.html` | internal/physical/difference triptych; aggregate headroom OK/EXCEEDED; broker binding and all linked virtual accounts; sync history; findings/history; Sync now and Dry-run reconcile; admin/viewer authority |

The ledger must also include every visible control discovered in the HTML, with one disposition:
`implemented`, `improved equivalent`, `disabled with reason`, `hidden by policy`, or `backend request`.
No item may be silently dropped because it was below the fold, behind a demo prop, or not shown in the
owner screenshot.

### 11.7 Content may be added, but only under a product rule

HiFi content is the minimum. Additional content or sub-views are welcome when they satisfy all of the
following:

- they shorten or improve a real operator/reviewer decision;
- their value is contract-backed or has a narrow backend request—never a frontend-invented financial
  fact;
- they respect authority, seven states, freshness and provenance;
- they use progressive disclosure instead of making the default canvas noisier;
- their control behavior, empty/error/denied state and visual evidence are tested;
- they do not duplicate information already available through a better drill-down.

Decorative prose, raw hashes, internal ids and repeated explanations do not count as useful added
content.

### 11.8 HiFi is the capability floor, not a pixel prison

Claude has explicit authority to improve composition, copy, grouping, responsive behavior and
information density. The eighteen HiFi files define the **minimum capabilities, states and journeys**;
they do not require literal copying of every paragraph, font size, box dimension or vertical stack.
Creativity is expected where the reference is verbose, visually unbalanced or inefficient.

Use this decision method on every screen before writing JSX:

1. Write the one operator/reviewer question the route must answer.
2. Select the state, consequence and next action that must be understood in the first scan.
3. Keep only that decision layer and its essential evidence above the fold.
4. Move supporting analysis into named tabs; move provenance/raw detail into a drawer; move blockers,
   scope and contextual actions into the right rail.
5. Verify that every moved HiFi capability remains reachable and appears in the coverage ledger.

#### When the HiFi has too much text

- Rewrite prose into **state → consequence → next action**; do not preserve paragraphs merely because
  they appear in the mockup.
- Use a one-line summary plus progressive disclosure for policy explanation, methodology and caveats.
- Convert comparable facts into a compact table, checklist, timeline or labelled key/value group.
- De-duplicate facts repeated in masthead, lineage, KPI and panel copy.
- Keep exact source wording only when it is an immutable policy/error/audit value.
- Never hide a blocker, eligibility condition, authority, source freshness or destructive consequence
  behind a generic “More” disclosure.

#### When a screen has little data

- Do **not** enlarge fonts, KPIs, buttons or panel padding to fill the viewport.
- Keep the global type ramp in §5.2 unchanged and use a constrained content width or asymmetric grid.
- Give the primary entity/decision an appropriately sized focal region, then use the remaining space
  for useful context: stage timeline, readiness/blockers, related entity links, recent activity or the
  contextual rail—only when those values are contract-backed.
- Prefer a deliberate quiet/empty state with a reason and next action over giant empty cards.
- If no additional truthful content exists, whitespace is acceptable. Fabricated metrics and inflated
  typography are not.

#### When a screen has dense data

- Keep one stable summary and action region; divide independent data families into tabs.
- Give tables and charts the canvas; keep their filters/toolbars locally sticky.
- Use virtualization/keyset continuation for large tables and adaptive resolution for charts.
- Preserve exact decimals and bounded counts; never shrink them until unreadable or ellipsize financial
  values merely to avoid composition work.
- Let the contextual rail follow the active selection instead of appending another full-width panel.

#### Creative freedom and hard boundaries

Claude may add a comparison, summary, small visualization, related-entity path, quiet-state guidance or
better drill-down when it improves a real decision and follows §11.7. Claude may also merge redundant
cards or replace a verbose block with a better component. Claude may **not** drop a nested HiFi
capability, invent a financial/risk truth, alter authority semantics, turn unavailable data into zero,
or solve sparse content by making the text arbitrarily large.

## 12. Implementation phases

The Execution Loop V2 upgrade has **exactly ten mandatory phases**. Claude must execute them in order,
keep at most one frontend phase `WIP`, update `PHASE_TRACKER.md` at the beginning and end of each phase,
and attach the named evidence. A later phase may be explored in a disposable spike, but its production
code may not be called complete or merged ahead of its predecessors. Phases may not be combined to
avoid an exit gate.

Backend/IAM work runs in parallel under §12.11. It never allows Claude to skip a frontend phase, and a
frontend phase never implies that a live source or command path is active.

### EL-V2-00 — Re-baseline, full HiFi inventory and truth in tracking

**Goal:** establish an honest V2 baseline before changing the visual system.

**Required work:**

- mark the integrated product composition `REWORK_REQUIRED` without reopening completed backend work;
- read all eighteen `.dc.html` sources completely, including demo props, hidden variants and scripts;
- build the §11.6 row-level ledger for every view, tab, state, action, drawer and drill-down;
- split every tracker item into `component contract`, `product route`, `nested interactions` and
  `integrated visual approval`;
- record the current shell-visible screenshots and the §2.7 defects as the before baseline;
- reconcile or supersede documents/tests that mandate Governance Light or literal HiFi copying;
- preserve the current responsive containment work as a named subtask, including its known clipping
  debt, rather than mislabelling it V2 completion.

**Evidence:** completed ledger; before screenshots at 1280×800, 1440×900 and 1728×1000; tracker diff;
list of obsolete assertions/docs to rewrite.

**Exit gate:** no `unknown` ledger row lacks an owner/disposition, and no “screen built” claim remains
ambiguous. **Nothing in EL-V2-01 may be merged before this gate.**

### EL-V2-01 — One route-aware Carbon workspace

**Goal:** eliminate the light shell/dark island and establish one visual environment from Approval
Inbox/Gate R1 through Live.

**Required work:**

- own `PortalPresentationMode` above `PortalShell` and derive it from the canonical resolved route;
- apply Execution Carbon atomically to topbar, sidebar, canvas, right rail, modal/drawer, palette and
  screen content;
- make the appearance control show the effective mode; it must never say Research Light on an
  Execution route;
- replace the obsolete `governance -> operations-carbon-light` branch and its tests;
- retain Research and Planning rendering unchanged;
- compress the fixture warning to the truthful one-line treatment in §7.2.

**Evidence:** shell-visible screenshots for Approval Inbox, R1, Paper and Live at the three canonical
desktop widths; route transition test; Research/Planning non-drift suite.

**Exit gate:** zero mixed-theme seam and zero obsolete Governance-Light assertion.

### EL-V2-02 — Semantic typography, density and workspace primitives

**Goal:** replace the terminal-dump grammar with a consistent institutional product system.

**Required work:**

- resolve the actual bundled font families and implement the locked role scale in §5.2;
- remove screen-local type improvisation and reduce mono to numeric/identity/evidence roles;
- implement the shared responsibilities in §6: workspace, page header, decision summary, tabs,
  contextual rail, provenance drawer and bounded terminal;
- implement constrained widths and responsive grid rules for sparse, balanced and dense screens;
- formalize the §11.8 copy/density decision method as component documentation and lint/testable class
  roles where practical;
- migrate only a small component fixture at this phase—do not mass-restyle the seventeen screens.

**Evidence:** type-role fixture; contrast/focus states; component responsibility/reuse report; 390,
834, 1280, 1440 and 1728 measurements.

**Exit gate:** two-family maximum, fixed role scale, reusable anatomy and zero component-level
unexplained clipping. Making sparse pages use larger text is an automatic rejection.

### EL-V2-03 — Stateful preview and interaction integrity

**Goal:** make the dev product preview truthful and remove every enabled no-op before visual migration.

**Required work:**

- replace stateless direct mounting with per-route preview controllers/state machines;
- classify every ledger control using §8.1;
- make tabs, filters, expand/collapse, scope and drawers work locally;
- make safe fixture workflows visibly simulated and source mutations explicitly disabled with reasons;
- preserve canonical route/entity/scope context through navigation and back navigation;
- remove raw `screenId` from normal chrome and expose it only through a preview inspector;
- add the structural enabled-control test and all six journeys in §8.2.

**Evidence:** route-level interaction suite; keyboard/focus/announcement evidence; a generated list of
all enabled controls with an observable result.

**Exit gate:** zero active-looking no-op controls. A control with an optional missing handler must not
render enabled.

### EL-V2-04 — Paper Workbench + Paper Exit reference vertical slice

**Goal:** prove the complete V2 composition and journey on one owner-reviewable domain slice.

**Required work:**

- implement §10 with a decision-first masthead, lifecycle, concise KPI strip, contextual exit rail,
  working detail tabs and provenance disclosure;
- implement a real equity/evidence chart with readable axes, tooltip, approved envelope, reset, expand
  and table/accessibility view—never a blank `ChartTile`;
- cover FRESH/AGING/STALE/PAUSED/UNKNOWN and MET/UNMET/INSUFFICIENT evidence states without inventing
  eligibility;
- complete Paper → request exit → Paper Exit Review → outcome/back journey in fixture mode;
- apply §11.8: reduce redundant prose and do not enlarge sparse regions.

**Evidence:** shell-visible route screenshots, interaction recording/test, chart tests, all §10.3
checks, and explicit owner visual review.

**Exit gate:** **Bobby approval is mandatory.** Claude must not migrate the remaining archetypes before
the Paper reference slice is approved or returned with named corrections.

### EL-V2-05 — Governance decision chain

**Goal:** deliver a continuous reviewer experience across Approval Inbox, Gate R1, Gate R2 and Exit
Reviews without reverting to a light document page.

**Required work:**

- implement every Governance ledger row: filters/history, evidence/checklists, conditions, capital
  preview, observation gate, immutable decisions and SoD/role variants;
- keep decision/blocker/action visible and move full provenance to disclosure;
- provide request-changes only through a published backend verb; otherwise show an explicit unavailable
  reason and raise a narrow backend request;
- test creator/reviewer/admin/denied/expired/conflict paths and context-preserving navigation;
- bind real SGP Control API data where the registry policy permits, independently of AWS-HK D4.

**Evidence:** four-route visual set; Inbox→R1/R2/Exit journeys; permission/CSRF/conflict tests; ledger
coverage for all governance variants.

**Exit gate:** every Governance capability has an implemented/improved/disabled/hidden/backend-request
disposition and zero fabricated write path.

### EL-V2-06 — Stage workbenches from Paper VNM through Live

**Goal:** reuse the approved Paper anatomy while preserving the distinct safety model of every stage.

**Required work:**

- complete Paper VNM, Sandbox Certification, Canary Control Room and Live Full Operations;
- implement all VNM calendar/session/order/settlement semantics and all seven Sandbox steps;
- preserve Canary/Live guard bands, source mismatch suppression and protective-versus-risk-increasing
  action asymmetry;
- make dense content tabbed and contextual; do not append all evidence vertically;
- keep commands disabled unless a later authority contract explicitly enables them.

**Evidence:** state matrix across VNM/Sandbox/Canary/Live; role and authority tests; source-unavailable,
stale, mismatch and recovery screenshots; workbench reuse report.

**Exit gate:** all stage-specific ledger rows are closed and the shared anatomy remains visually
consistent without erasing safety differences.

### EL-V2-07 — Operations, incident and command workflow

**Goal:** turn Command Center, Queue, Incident Detail and Admin Action Drawer into one coherent triage
and verification workflow.

**Required work:**

- rank attention in Command Center and provide truthful BUSY/QUIET states;
- connect Queue selection to a contextual alert rail and preserve ack ≠ resolve;
- implement Incident evidence, blast radius, timeline, containment and forward-only resolution rules;
- implement the full action catalogue, selection, reason, step-up, PLAN/APPLY/VERIFY, PARTIAL/residue
  handling and Equivalent CLI disclosure;
- implement the bounded terminal in §9 and typed reconnect/gap/error rows;
- include Break-glass only as the full ceremony from the HiFi/authority contract—never as a convenient
  red button or fixture command.

**Evidence:** Queue→Incident→Drawer→Verify→Queue journey; terminal accessibility/copy/export tests;
BUSY/QUIET and VERIFIED/PARTIAL visual evidence; command-authority negative tests.

**Exit gate:** operations read paths are complete, terminal states are truthful and no browser action
can bypass plan/apply/verify or command authority.

### EL-V2-08 — Entity 360, analytical surfaces and Full Blotter

**Goal:** make Alpha, Portfolio, Account/Broker and Blotter useful for analysis without turning them
into vertically stacked catalogues.

**Required work:**

- complete every Alpha/Portfolio/Account tab and role lens from the §11.6 ledger;
- propagate scope to all KPIs, charts, tables, links and contextual rail;
- implement internal/physical/difference, correlation/leader lens, capital/authority and source
  mismatch semantics without frontend financial recomputation;
- give Blotter the primary canvas with working filters, cross-filter/reset, funnel detail, keyset
  continuation, exact currency aggregates and virtualization;
- implement chart inspect/tooltip/zoom/reset/expand/table/export/cross-filter behavior and explicit
  insufficient-data states;
- apply §11.8: sparse tabs use constrained composition and related truthful context, never larger type.

**Evidence:** all entity/tab journeys; exact-decimal and aggregate contract tests; chart interaction and
screen-reader alternatives; large-row performance profile; route screenshots at supported widths.

**Exit gate:** every analytical ledger row is closed, no financial value is recomputed in the browser,
and dense routes meet the agreed render/DOM/interaction budgets.

### EL-V2-09 — Real-source Lane B, full hardening and V2 release acceptance

**Goal:** validate the finished product against approved real Paper projections, then close the V2
release without weakening safety or stable isolation.

**Required work:**

- consume only the source/query/SSE capabilities explicitly activated after §12.11 acceptance;
- activate one screen/profile at a time, Paper read-only first; retain fixture/unavailable fallback and
  show authority/freshness truthfully;
- compare fixture, shadow and source-backed rendering for schema, state, decimal and completeness
  parity—never hide a mismatch to make the screen look complete;
- complete typed 401/auth-expiry, gap/cursor/epoch, reconnect, backpressure and source-loss UX;
- run shell-visible visual, accessibility, keyboard, responsive, load, memory, DOM, reconnect and
  journey gates across all routes;
- prove Research/Planning and stable runtime non-regression, plus frontend rollback to the prior
  delivery profile;
- obtain owner visual/functional approval and record remaining command/live-source limitations
  explicitly.

**Evidence:** accepted D2/D3/D4 handoffs; per-screen Lane B activation record; shadow parity report;
complete coverage ledger; performance/a11y/visual reports; rollback rehearsal; owner sign-off.

**Exit gate:** all ten phases are accepted, every visible control and nested HiFi capability is
accounted for, real Paper read data works through the Portal boundary, and V2 can be rolled back without
touching Trading System. Only Bobby may authorize merge/release.

### 12.11 Codex backend/IAM lane running in parallel

The frontend sequence above is independent of live infrastructure until EL-V2-09, but Codex will use
the same development window to make a real read-only Paper source available as early as safely
possible. Current truth on 2026-08-24 is:

- D1 private carrier is accepted;
- D2/D3/D4 repository/offline preparation is complete;
- live D2 is **not accepted** because the exact IAM DryRun still returns `UnauthorizedOperation`;
- D3 has no live mTLS/H2/delegated-JWT evidence;
- D4 lacks its accepted predecessors, dedicated Paper read identity/contract, production mapper and
  approved encrypted projection storage;
- no Portal code may modify Trading System source, database, Redis, CLI, risk, accounting, broker or
  execution behavior.

The full Portal/browser/TypeScript Control API remains on SGP. AWS-HK receives only the bounded
Portal-owned Source Proxy, Rust Execution Edge and approved private projection boundary next to the
Trading System loopback API. The browser never connects to AWS-HK directly.

| Backend gate | Codex action | Owner/Trading System input | Frontend benefit |
|---|---|---|---|
| BE-V2-A — IAM effective allow | Re-run the exact-instance `ModifyInstanceMetadataOptions(DryRun=true)` verifier and accept only `DryRunOperation` | Ensure revision-2 policy is attached under the existing role's **Permissions policies**, is the managed policy default version, and no permissions boundary/SCP explicitly denies it | None yet; fixture work continues |
| BE-V2-B — Signed D2 admission | Verify default-branch signed Edge/Proxy images, workload PKI/JWKS, shared-host delta budget, listeners, ownership, TS health and rollback inputs | Approve the bounded D2 change window after the gate is green | Deployable dark services, still no source data |
| BE-V2-C — D2 dark deployment | Harden IMDS/detach temporary operator profile in the approved order; deploy Edge/Proxy dark; prove health, resource delta and rollback without TS changes | Window/rollback operator approval | Real service topology for frontend contract tests, source remains off |
| BE-V2-D — D3 transport acceptance | Run real WireGuard/private route, TLS 1.3 + mTLS, HTTP/2, delegated short-lived JWT, negative-auth and latency/source-loss probes | Provide/approve scoped identities and D3 window | Trusted SGP↔AWS transport and typed auth/availability errors |
| BE-V2-E — D4 Paper read contract | Validate a dedicated read-only identity, exact GET routes, stable cursor/completeness/resync semantics and encrypted Portal projection storage | Trading System owner publishes the bounded Paper contract/identity; Bobby opens D4 window | A lawful source for Paper/Blotter/account projections |
| BE-V2-F — Shadow projection | Ingest only into a BUILDING epoch, run replay/parity/completeness/freshness checks and keep registry/query/SSE activation off | Review the redacted parity/evidence report | Claude can test real-shaped source data without product activation |
| BE-V2-G — One-screen Lane B canary | Promote the accepted epoch and activate read-only Paper query, then SSE, one capability at a time with rollback | Bobby explicitly approves each registry/profile change | EL-V2-09 real-data validation, beginning with Paper |

No frontend phase may infer that the next backend row is complete. Codex publishes a narrow handoff
with exact endpoints, fields, delivery profile, error/freshness codes and activation status after each
accepted gate. Until then Claude must render fixture, shadow, unavailable or disabled truthfully.

## 13. Acceptance matrix

| Area | Blocking acceptance |
|---|---|
| Workspace | Execution route changes topbar/sidebar/content/right rail together |
| Theme control | Carbon from Approval Inbox/Gate R1 onward; no Governance Light or embedded theme island |
| Typography | two families maximum; the same locked title/section/body/data/terminal roles on every screen |
| HiFi coverage | every HTML and all nested tabs/states/actions have a ledger row, implementation and test disposition |
| Hierarchy | primary decision, blocker and action visible above fold |
| Density | sparse pages do not stretch; dense pages use tabs/tables/virtualization |
| Tabs | every visible tab changes its panel and preserves accessible state |
| Right rail | contextual, sticky at wide widths, follows scope/tab, collapses cleanly |
| Actions | zero enabled no-op controls |
| Preview | simulation/disabled behavior is explicit; no source side effect |
| Provenance | full digest/raw ids hidden by default but accessible and copyable |
| Terminal | bounded specialized surface with typed rows and PLAN/APPLY/VERIFY semantics |
| Visual evidence | real product-route baselines include shell; fixture baselines remain |
| Isolation | Research and Planning snapshots do not drift |
| Contracts | no financial recomputation, invented state or weakened fail-closed behavior |
| Phase discipline | EL-V2-00…09 completed in order; tracker and evidence updated at every gate |
| Content design | verbose screens use progressive disclosure; sparse screens never inflate typography to fill space |
| Real source | browser never reaches AWS-HK directly; Paper Lane B requires accepted D2→D3→D4 evidence |

## 14. What Claude should do next

1. Read this file, especially the implementation audit in §2.7, then read all eighteen `.dc.html`
   files completely—not only their initial render—together with the owner screenshot and the current
   uncommitted review/fixes. Do not report the current responsive containment patch as the requested
   product refactor.
2. Build the §11.6 coverage ledger, including demo-prop variants, tabs, drawers, links and actions.
3. Update `ROADMAP_FRONTEND.md` and `PHASE_TRACKER.md`: record all ten EL-V2-00…EL-V2-09 phases,
   reconcile the Carbon-only owner override, and mark the integrated product composition as
   `REWORK_REQUIRED`, while keeping completed backend/contract work completed.
4. Complete and provide the evidence for **EL-V2-00 only**. Do not start a mass CSS/screen rewrite.
5. Produce a short measured layout proposal for **Paper Workbench only** at 1440×900 and 1728×1000:
   bounding regions, type roles, right-rail behavior, disclosure moves and interaction matrix.
6. Ask Antigravity for an independent critique of hierarchy, type scale and state/action semantics.
7. Proceed to EL-V2-01 only after EL-V2-00 evidence is recorded; stop at each phase gate and update the
   shared tracker. EL-V2-04 requires Bobby's explicit visual approval before EL-V2-05 begins.
8. If any required UI behavior needs a new backend field/endpoint, send a narrow Backend Request to
   Codex. The shell/theme/type/no-op-preview fixes themselves do not require Trading System changes.

## 15. Non-regression boundary for Codex/Claude coordination

- Rust/TypeScript backend contracts, D1–D4 safety gates and source flags remain unchanged.
- `delivery_profile=fixture` remains visible and truthful.
- No browser connection to AWS-HK, Trading System, broker or realtime is added by this refactor.
- Do not merge “visual refactor” with backend activation.
- Preserve exact values and evidence access; change default prominence, not truth.
- Bobby remains the merge authority and owner visual sign-off is an explicit exit gate.
