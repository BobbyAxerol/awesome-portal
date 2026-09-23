# P04 frontend composition — Screen 12 Engine Atlas

**Status:** `FE_SCREEN12_COMPOSITION_COMPLETE` · Claude · 2026-09-20
**Directive:** [P03–P06 contract-first vertical-slice brief](../../CLAUDE_P03_P06_VERTICAL_SLICE_RECOVERY_BRIEF.md)
**UX authority:** [spec 12](../../release-v1.1/docs/screens/12_engine_atlas.md) +
`QuantBT 12 Mode Atlas.dc.html`

## What was built

`apps/portal/frontend/src/research/EngineAtlas.tsx` — the three-tab reference
surface, rendered entirely from `ResearchEngineAtlasDocument`.

| Tab | Source field | Composition |
|---|---|---|
| `modes` | `doc.modes` | rule one / rule two banners, then one card per mode: schedule chips with the default marked, objective, artifact fields, the verbatim `suspect` line, `when_to_use`, `rules` |
| `routes` | `doc.routes` | one row per route: id, family, contract, backend, report levels, **all four axes as separate chips**, and the engine's own `reason` |
| `claims` | `doc.claims` | contract, engine cert, numeric guarantee, `never_claims`, and the min-formula footer |

The header carries `current_release` and, separately, every
`historical_releases` entry labelled *retained history*.

## Spec conformance

- **Reviewer checklist item 1 — "0 hardcoded route/mode in JSX".** No
  `route_id`, `mode_id` or `contract_id` literal appears in the component. It is
  structurally impossible for a row to exist that the manifest does not carry.
- **T06 manifest-drive.** A test renders a document with fifteen routes and
  asserts fifteen rows, with no component change. This is the spec's own
  acceptance for the rule that the Atlas grows with the engine.
- **T04 deferred route.** `arbitrage_triangular` renders with
  `INTEGRATION_GAP`, its exact refusal string, and a test asserts the row
  contains no button and no link.
- **Four axes stay four facts.** A route that is `ENGINE_SUPPORTED` and
  `INTEGRATION_GAP` marks *integration* as the blocker while the engine chip
  still reads `ENGINE_SUPPORTED`. Collapsing these would blame the engine for a
  gap Portal owns and hide who can unblock it.

## Visual system

Research Light is the Portal's existing paper token set. Verified value by
value against the hi-fi: `--paper #faf9f5`, `--ink #1c2532`, `--line #e3e0d7`,
`--ink-soft #4e5a6e`, `--ink-faint #939db0`, `--accent #0f4c5c`,
`--accent-soft #e2edf0`, `--paper-sunken #f4f2ec`, `--line-soft #efede4` — all
identical to the values the HTML inlines. The component therefore uses tokens
only and contains no raw hex, satisfying the display rule while matching the
hi-fi exactly. Execution Carbon and the shared shell were not touched.

## Data lane

**Typed inactive.** P04's `GET /api/v1/research/quantbt/atlas` exists and its
DTO is generated, but mounting a product route is P09's shared-route work. The
component therefore takes the document as a prop: when P09 wires the route the
same component renders real data with no change. Rendering it today happens only
in the labelled fixture lane.

With `doc: null` the screen keeps its heading, its three tabs and the panel
frame, and states the transport fact inside the panel. It does not become an
envelope or a blank page.

## Not claimed

No run/submit affordance anywhere (asserted by test), no engine or data request,
no approval state inferred from an engine report level, no wheel/RECORD path.
`V11-P04-BR` remains `PENDING_OWNER_PHASE`: this is composition over a contract,
not a browser acceptance of a product route.

## Contract gap

None found. The published DTO carried every field Screen 12's three tabs
require.

## Browser receipt

`e2e/_probe-research-fixtures.spec.ts` against a local `vite preview` of the
production build, Portal API stubbed with the repository's own
`stubPortalApi(page, "healthy")` helper so the probe tests composition rather
than the auth gate.

| check | result |
|---|---|
| renders at 1280×900 and 660×900 | pass |
| console errors + warnings | **0** |
| horizontal page overflow | 0 px at both widths — wide tables scroll inside their own frame |
| panels holding their frame | 25+ |
| both Atlas instances present, second one document-less | heading, three tabs and the `unavailable` fact all retained |
| keyboard reaches the tabs; every panel is a named region | pass |

### Screenshot receipt — ephemeral, not archived

These captures live only in this session's scratchpad and are **not retained**:
the directory is removed when the session ends and no durable private archive
was provisioned for Research visual evidence. They are recorded here as an
ephemeral receipt with full digests so the same build can be re-verified, not
as a stored artifact someone can fetch later.

| file | location | dimensions | sha256 |
|---|---|---|---|
| `research-fixtures-laptop.png` | `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots/` | 1280x3824 | `03518e24af7e9f828029f50a88b9bd577e6f2910a11fd81f333e64ecfbaf95f3` |
| `research-fixtures-mobile.png` | `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots/` | 660x5854 | `f81446b594c6ed058bb0a925107244aa09d28e5de1ef6d13871bbc72bb9b04ae` |

Reproduce: `npm run build`, `npx vite preview --port <p>`, then
`npx playwright test --config=playwright.research-probe.config.ts` with
`RESEARCH_SHOT_DIR` set. A durable location for Research visual evidence is a
provisioning request, not something this slice should invent.

## Findings found by looking, not by testing

Two defects survived 112 passing unit tests and were visible in the first
capture:

1. **The refusal reason truncated.** `axes · reason` was a residual `flex:1`
   column; after five fixed columns only ~280 px remained, so
   "Schema-only in the support matrix: no Portal adapter." was cut off. A
   disabled route whose reason is unreadable fails the one requirement the
   handoff places on it. Axes and reason now take the full row width on their
   own line.
2. **A run-on status line** in the queue panel — recorded in the P06 packet.

## Correction — RF01-F6, 2026-09-23 (audit F-08)

The "Typed inactive" paragraph above is historical and no longer true. P09
mounted Screen 12 on its product route (`/research/quantbt/atlas`) over the
same-origin Control API read `GET /api/v1/research/quantbt/atlas`
(`foundationClient.ts`, `foundationRoutes.tsx`). The Python public route was
retired in RF01-B1 (`a0d0004d`); the internal `/internal/research/engine-atlas`
is the Control API's only source. What remains open for Screen 12 is spec-12
completeness (per mode×schedule facts, verbatim tabs, KaTeX), owned by
RF02-B1/RF02-F1 — see `P04/debt-register.json` `closure_notes` for P04-DG-03.
