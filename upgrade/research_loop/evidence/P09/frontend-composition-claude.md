# P09 frontend composition — Screens 00 and 12 on product routes, and `S14-VIS-01`

**Status:** `FE_PRODUCT_ROUTES_MOUNTED` · Claude · 2026-09-20
**Handoff consumed:** [Claude P09 handoff](./frontend-handoff-claude.md) ·
[P09 report](./phase-report.md)
**UX authority:** [spec 00](../../release-v1.1/docs/screens/00_journey_map.md) ·
[spec 12](../../release-v1.1/docs/screens/12_engine_atlas.md) ·
[spec 14 §Code anatomy](../../release-v1.1/docs/screens/14_alpha_import.md) +
the three `*.dc.html` hi-fi files
**Contract:** `@portal/contracts-research-foundation`
(`packages/contracts/generated/research-foundation.d.ts`, 305 lines).

## Decision recorded: `S14-VIS-01`

> **Keep three backend authority states — parse, seven gates,
> register/activate. Render Code anatomy as a presentation-only substage
> beneath parse. Do not add a lifecycle state, API field, migration or backend
> transition.**

Implemented as a collapsed `<details>` inside step 1 of Screen 14, holding the
six module-contract sections and the unlock map, verbatim from the hi-fi.

It is a local constant rather than a request because nothing in it is a server
fact *about a particular import*: it is the contract every import is measured
against, identical for every reader. Giving it a lifecycle would have invented
a fourth authority state the backend does not have.

Five tests hold the boundary, and the one that matters most asserts that
**every control's disabled state is byte-identical with the section open** —
the whole risk of a fourth visual group is that it quietly grows an authority.
The others assert it adds no step marker (still three), contains no editable
field, offers no action and issues no request, and names no lifecycle word.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/foundationClient.ts` | 305 | Two typed reads, ETag/304, P02 query rules, 11-code refusal map |
| `src/research/JourneyMap.tsx` | 317 | Screen 00 composition |
| `src/research/foundationRoutes.tsx` | 187 | The two product route containers |
| `src/research/codeAnatomy.ts` | 163 | `S14-VIS-01` reference content |
| `src/research/atlasDocument.ts` | 70 | The checked narrowing between the two generated Atlas types |
| `src/research/screenRoutes.ts` | 54 | The single `target_key` → path map |
| `src/research/foundation.test.tsx` | 688 | `P09-T01…T09`, 36 tests |
| `e2e/_probe-research-product.spec.ts` | 238 | 9 browser tests on the real routes |
| `src/research/EngineAtlas.tsx` | +173/−58 | Selected release facts; the two truncation fixes below |
| `src/research/AlphaImport.tsx` | +126 | The `S14-VIS-01` substage |
| `src/research/alphaImport.test.tsx` | +61 | Its five tests |
| `src/features/quantbt/QuantBTModule.tsx` | +13/−2 | The two routes mounted inside the existing shell |
| `e2e/fixtures.ts` | +35 | Foundation stubs, plus two endpoints that were never stubbed |
| `e2e/research-foundation/*.json` | 3 files | Probe fixtures generated from the repo's own sources |
| `src/research/researchBoundary.test.ts` | +14/−3 | Network allowlist widened to the foundation client |

Routes: `/research/quantbt/journey` and `/research/quantbt/atlas`, both inside
`QuantBTModule` so the Portal shell is rendered exactly once.

## The rules the handoff names

- **Two operations, same-origin, session-bound.** A test extracts every literal
  API path from the client and asserts the set is exactly the two published
  ones. P04's direct Portal API route is not used as a fallback: an
  unreachable Atlas is `unavailable` and no route row is invented (asserted).
- **`304` reuses the last exact typed response.** Handled explicitly rather
  than left to the browser cache, keyed by the full query because two
  selections are two representations. A `304` with no held copy re-reads
  unconditionally rather than rendering nothing.
- **`target_key` is presentation data.** Resolved only through
  `resolveScreenRoute`. A key containing a slash, a scheme or a
  protocol-relative prefix is refused before lookup, because the failure being
  prevented is a descriptor value that *is* a URL. Tested against
  `//evil.example.com`, `javascript:`, `../../admin` and friends; the browser
  probe additionally asserts every rendered `href` is a same-origin path.
- **P02 URL rules.** Only the thirteen declared cursor keys are forwarded —
  `promote=1` and `admin=true` are dropped, not passed through. `seq` and
  legacy `event_seq` may both appear only when equal; unequal values are
  refused **before** any request, because spending a round trip to be told the
  link contradicts itself helps nobody.
- **`pick` is inspection only.** `pick_effect` is printed rather than implied:
  a screen that merely declines to offer a button teaches a reader that the
  missing control is a bug. The probe asserts zero buttons and zero forms on
  the journey route.
- **Typed states render inside the composition.** `400`, `404`, `502` and
  `503` each keep the Atlas heading, its three tabs and the panel frame while
  showing the server's own sentence.
- **Current versus historical is the selection, nothing else.** A `HISTORICAL`
  selection prints "Historical identity retained — this release is not
  installed and cannot run." Retained identity is not a promise that it runs.

## Findings

### `CG-P09-01` — the foundation contract widens three sub-schemas P04 had typed

`AtlasResponse.atlas` declares `claims` and `evidence_contract` as free-form
objects and `CapabilityAxes` as four plain strings, where P04's
`ResearchEngineAtlasDocument` types all three precisely. S12's claims tab
renders four named fields, so the widening is a real loss.

A compile-time check proves the P04 document is a **strict refinement** of the
P09 one — every other field agrees. Rather than cast, the two widened fields
are checked once at the boundary in `atlasDocument.ts`; a document missing one
renders `partial` naming the exact path (`claims[0].engine_certification`)
instead of printing `undefined` inside a certification table. That is
validation against a published schema, not hand-parsing.

The durable fix is for the foundation OpenAPI to `$ref` the same two schemas,
after which `atlasDocument.ts` collapses to a type alias.

### `CG-P09-02` — no canonical fixture was published for either read

P07 and P08 both shipped `*.valid.json` fixtures; P09 shipped none. The browser
receipt therefore uses fixtures **generated from the repository's own sources**
— `journey.descriptor.ts` (including its real `content_sha256`, recomputed with
the module's own canonicalisation) and `research-engine-catalog.v1.json` (14
routes, 5 modes, 7 claims). They are not hand-written approximations, but they
are also not the contract package's word. Requested: publish both beside the
other fixtures.

### `FD-P09-02` — Screen 14 has no product route, and should not get one yet

The descriptor marks `alpha_import` `AVAILABLE`, and Screen 14 is built and
tested. Its proposed path `/research/alphas/import` sits under `ALPHA_POOL`,
which the registry still marks `COMMISSIONED`. Serving a working screen there
would contradict the feature's own badge — the same reason the import inbox
already lives under QuantBT rather than under Alpha Pool.

So the card renders `NOT ROUTED` rather than as a guessed path. **Bobby's
decision needed:** either move S14's canonical route under
`/research/quantbt/`, or have codex revise `ALPHA_POOL`'s maturity. I did not
pick one, because both are outside a frontend's authority.

### `FD-P09-03` — `preflight` is advertised as available but cannot be routed yet

The descriptor marks `preflight` `AVAILABLE`. P08's panel needs a
`RequestedSpec`, and the producer is P10's. No browser route can exist until
then, so the card renders `NOT ROUTED`.

**`NOT ROUTED` is deliberately not `SOON`.** The server's availability and this
build's routing are different facts; saying `SOON` would blame the roadmap for
a deployment gap and the reader would stop asking.

### `FD-P09-04` — two module endpoints were never stubbed

`/api/runs` and `/api/strategies` had no handler in `e2e/fixtures.ts`, so the
catch-all answered `501` and **every** QuantBT route carried two console errors
unrelated to the screen under test. Now stubbed as empty — the truthful answer
for a fixture environment with no runs.

## Defects found by looking at the screenshots

All three survived a green unit suite **and** a green fixture-lane probe.

1. **The claims tab clipped the one column that matters.** `never claims` was a
   fourth fixed column in a 980px table; on the product route, with the Portal
   sidebar taking 248px of 1280, it sat behind a horizontal scrollbar. A
   contract's honest limit that the reader must scroll sideways to find is a
   limit nobody reads — the same defect the route refusal reason had in P04. It
   is now its own line.
2. **The routes tab clipped the refusal reason and the input class.** Same
   cause, `minWidth: 1020`. Narrowing it to the column sum only moved the
   problem to 660px, where the reason then wrapped inside a track wider than
   the viewport. The columns now wrap instead: alignment across fourteen rows
   is worth a lot at 1280, where all five still fit on one line, and worth less
   than a readable refusal at 660.
3. **The flow arrows pointed right while the cards stacked.** At 660px the
   journey cards wrap to one per line and every `→` described a layout that was
   not there. Hidden below `md`, asserted both ways in the probe.

**Why the fixture lane missed all three: it has no sidebar.** The lane renders
at the full 1280 with no chrome, so a table that needs 980px fits there and
clips on the product route. A fixture lane is not a product route, and this
phase is the first that could have found that out.

### A fourth defect, caught by `tsc` rather than by `vitest`

Three test fixtures used values the contract does not allow: a `run_id` key
inside `InspectionCursor` (the cursor has no such field — `run_id` is run
context), a `default_schedule` of `"endpoint"` (the enum is
`global | per_fold_decay | per_fold_causal`), and invented axis values. All 33
tests passed; the typecheck refused them. Same class as `P04-FE-02`.

### A fifth, caught by running the probe twice

`expect(await locator.count()).toBe(4)` does not retry. Under two parallel
workers it read the page before React had committed and reported `0`. Every
count assertion in both probes is now the retrying `toHaveCount` form, and the
suite was run twice to confirm.

## Scope leak caught before it shipped

Suppressing the duplicated module caption on the two new routes was first
written by widening the existing `onTaskRoute` regex. That regex also matches
`/new`, `/imports` and `/alphas/*` — three screens outside this phase and
inside the 101-shot QuantBT visual baseline. A separate `onReferenceRoute`
now carries the change, so nothing outside `/journey` and `/atlas` moved.

## Test matrix

| ID | Requirement | Result |
|---|---|---|
| P09-T01 | the journey renders the pinned descriptor; no nested shell | pass |
| P09-T02 | `target_key` resolves only through the owned map; hostile keys refused | pass |
| P09-T02b | an unrouted `AVAILABLE` screen says `NOT ROUTED`, not `SOON` | pass |
| P09-T03 | only P02 keys forwarded; `seq`/`event_seq` conflict refused before the request; `pick` inspection-only | pass |
| P09-T04 | three Atlas tabs from the manifest; historical cannot run; read-only | pass |
| P09-T05 | a widened field is checked, never cast; `partial` names the missing path | pass |
| P09-T06 | ETag/`304` reuse; cache keyed by query; `304` with no copy re-reads | pass |
| P09-T07 | `400/404/502/503` keep their typed meaning inside the composition | pass |
| P09-T08 | no local DTO, no outside request, no engine/loader/Execution import | pass |
| P09-T09 | the composition survives a document-less render | pass |
| S14-VIS-01 | Code anatomy adds no authority, no action, no lifecycle | pass (5 tests) |

## Gates

| gate | command | result |
|---|---|---|
| typecheck | `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| research suite | `npx vitest run src/research` | **239 passed / 10 files** |
| build | `npm run build` | **exit 0** |
| browser probe | `npx playwright test --config=playwright.research-probe.config.ts` | **17 passed**, run twice, 0 console errors or warnings |
| visual regression | `npm run e2e:visual` | **exit 1 — 33 failed / 299 passed / 16 skipped**, all pre-existing (below) |

## Visual regression — 33 failures, none of them this change

`npm run e2e:visual` ends **exit 1**: 33 failed, 299 passed, 16 skipped.

| spec | failed |
|---|---|
| `execution-fixtures.spec.ts` | 21 |
| `visual.spec.ts` | 7 — `run-overview`, `run-execution` ×2, `run-parameters`, `planning-reports` ×3 |
| `execution-journeys.spec.ts` | 5 |

**The exit code was read from the command, not from the pipeline.** The first
attempt reported `exit 0` because the shell line ended in `tail`; the run had
also been killed part-way. Both were corrected before any of this was believed.

### Attribution, measured rather than argued

A clean worktree was created at `cac85b43` — the P09 backend commit, with none
of this change set — and the same tests run there:

| test | this tree | clean `HEAD` |
|---|---|---|
| `run-overview @ laptop` (QuantBT) | fail | **fail** |
| `planning-reports @ tablet`, research and operations (Planning) | fail | **fail** |
| `planning-reports @ mobile` (Planning) | fail | **fail** |
| `lifecyclerail @ laptop`, `@ workstation` (Execution) | fail | **fail** |

6 failed / 9 passed at `HEAD` on that subset — one screen from each of the three
failing families, all reproducing without this change.

The whole suite was then run at `HEAD` and the two failure sets compared by
name. They are **identical**: 33 failures, 299 passed, 25 distinct test names,
and `comm` reports nothing in either direction.

```
$ comm -13 head-fails.txt mine-fails.txt   # failing here but not at HEAD
$ comm -23 head-fails.txt mine-fails.txt   # failing at HEAD but not here
```

Both empty. This change set moves the visual baseline by zero tests.

### The mechanism

`7441c572` (Planning) widened Tailwind's `content` glob to scan the embedded
Planning source tree:

```
content: ["./index.html", "./src/**/*.{ts,tsx}",
          "../../../features/roadmap-task-board/frontend/src/**/*.{ts,tsx}"]
```

That changes which utilities Tailwind emits and in what order, which shifts
computed layout app-wide by about a pixel. It landed **after** the last baseline
update (`6fbe5a7c fix(ci): stabilize CodeQL and execution visual baseline`), and
no baseline was re-recorded for it. Every diff inspected shows **identical
content at a ~1px offset** — `lifecyclerail` and `charttile` were read
pixel-by-pixel and the text is the same string in the same place, one row up.

### What was not done, and why

**The baselines were not re-recorded.** Re-recording would make the suite green
and silently absorb a change nobody reviewed — the failing shots include
Execution and Planning screens outside this phase, and `--update-snapshots` is
not a frontend's way to close someone else's open diff. The 33 stay red and
named.

**Requested:** whoever owns `7441c572` re-records the baseline with
`npm run e2e:update` (which forces `=all`) and reviews the diff, or reverts the
glob. Until then `npm run e2e:visual` is red at `HEAD` and this change set does
not move it.

### One scope leak this run caught

The first version of the module-caption fix widened `onTaskRoute`, which also
matches `/new`, `/imports` and `/alphas/*` — three screens inside the 101-shot
QuantBT baseline. It was replaced with a separate `onReferenceRoute` before the
suite ran, so nothing outside `/journey` and `/atlas` moved.

## Browser receipt — the real product routes

Against a local `vite preview` of the production build, reached through the
Portal shell with the registry and session answered by the repository's own
stubs.

| check | S00 | S12 |
|---|---|---|
| renders at 1280×900 and 660×900 | pass | pass |
| exactly one `.portal-shell`, no nested nav or aside | pass | pass |
| source facts | 8 phases, 14 cards | 14 routes, 5 modes, 7 claims |
| horizontal page overflow | 0 px both widths | 0 px both widths |
| nothing hidden behind a sideways scrollbar | n/a | 0 elements |
| console errors + warnings | **0** | **0** |
| keyboard | tab order is DOM order | tabs focusable, Enter activates |
| named regions | every panel | every panel |
| reduced motion | 0 elements animate above 1 ms | 0 |
| deep link | `pick_effect` printed, 0 buttons, 0 forms | selection chip, historical note |

### Screenshot receipt — ephemeral, not archived

Not retained: the directory is removed when the session ends and no durable
private archive has been provisioned for Research visual evidence. Digests so
the same build can be re-verified.

| file | dimensions | sha256 |
|---|---|---|
| `s00-journey-laptop.png` | 1280x1394 | `673af59211ade7d37327d39efd18da004c725ad3d1ec4640cf4bdc9338d4ef44` |
| `s00-journey-mobile.png` | 660x1898 | `eb97b98f3683920af81220425fc6df215fc5ca1344058f74249b10f8453ad4ad` |
| `s12-atlas-routes-laptop.png` | 1280x1617 | `03ff96488f9208bac10a4e4c965a04c09130dfff2338f2ba437cfd4c631c21be` |
| `s12-atlas-claims-laptop.png` | 1280x900 | `99ce108beda160fdf84aec49db6b284a43f52efb1b01c9228ccf5ca700def631` |

The `s00-journey-*` and `s12-atlas-routes-laptop` digests above predate the
arrow fix and the header scoping; the current build's captures are in the same
directory and were taken on the final run.

Location: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots-p09/`.
Reproduce: `npm run build`, `npx vite preview --port 4317 --strictPort`, then
`RESEARCH_SHOT_DIR=<dir> npx playwright test --config=playwright.research-probe.config.ts`.

## Not claimed

No dev or production deployment, and no image was rebuilt to render fixtures.
Screen 14 is **not** mounted (`FD-P09-02`) and neither is a preflight route
(`FD-P09-03`). The eight-step New Run declaration remains P10's. `V11-P09-BR`
is Bobby's to set: this packet supplies the browser/HIFI receipt the handoff
asks for, not the phase verdict.
