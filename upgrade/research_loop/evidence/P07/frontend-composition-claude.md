# P07 frontend composition — Screen 14 Alpha Import

**Status:** `FE_SCREEN14_COMPOSITION_COMPLETE` · Claude · 2026-09-20
**Handoff consumed:** [Claude S14 handoff](./frontend-handoff-claude.md) ·
[P07 evidence packet](./README.md)
**UX authority:** [spec 14](../../release-v1.1/docs/screens/14_alpha_import.md) +
`QuantBT 14 Alpha Import.dc.html`
**Contract:** `@portal/contracts-research-alpha-import`
(`packages/contracts/generated/research-alpha-import.d.ts`, 422 lines). No type
and no error string is hand-written on the frontend.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/alphaImportClient.ts` | 262 | Typed client for all five same-origin operations + the refusal map |
| `src/research/AlphaImport.tsx` | 655 | Screen 14, presentational |
| `src/research/useAlphaImport.ts` | 291 | Container state: sequencing, receipt invalidation, CAS |
| `src/research/alphaImport.test.tsx` | 684 | T01–T12, 33 tests |
| `src/research/ResearchFixtures.tsx` | +173 | Four labelled Screen 14 instances in the fixture lane |
| `e2e/_probe-research-fixtures.spec.ts` | +101 | Two browser probes over Screen 14 |
| `src/research/researchBoundary.test.ts` | +32/−1 | Network rule restated as a same-origin allowlist |

`/research/alphas/import` is **a new screen**. Nothing under
`/research/quantbt/imports` was changed, redirected or deleted;
`ResearchAlphaAnalysis` is not imported, rendered or requested anywhere on the
browser surface.

## The five operations

All typed from the generated contract, all same-origin under `/api/v1/research/alphas`:

| Step | Call | Guard before it fires |
|---|---|---|
| 1 | `POST /import/parse` | non-empty source |
| 2 | `POST /import/gates` | `parse.parse_ok === true`, carries `source_file_ref` |
| 3 | `POST /import/register` | `gates.all_pass === true`, carries `gate_receipt_id` |
| — | `POST /{id}/activate` | CAS on `expected_alpha_revision` |
| — | `GET /` | on mount and after every write |

**Receipt invalidation.** Editing the source — typing, pasting or dropping a
new file — drops the parse receipt, the gate receipt, the registration and the
refusal together. A receipt belongs to exact bytes; carrying one across an edit
would register something nobody gated. The same happens on
`…SOURCE_NOT_FOUND` / `…SOURCE_EXPIRED`, which force a fresh Parse rather than
letting step 2 resend a reference already known to be dead.

## Spec conformance

- **Fail-closed.** The first `FAIL` is followed by `SKIPPED` for every later
  gate, the fail-closed sentence appears, and step 3 is disabled. Asserted in
  both the unit suite and the browser.
- **The mirror is read-only.** A test asserts the mirror subtree contains zero
  `input`, `textarea`, `select` or `contenteditable`. There is no editable
  entrypoint, parameter-space, determinism or data-contract field anywhere on
  the screen — the parameter space comes from the code.
- **`missing` renders no value.** §3.3 holds: the `dd` for a missing field is
  empty and the chip carries the fact. Asserted in the DOM too, not only in
  JSX.
- **`static_scan_disclosure` is read from `GatesResponse`**, not copied. The
  test proves it by altering the constant in the response and asserting the DOM
  follows.
- **120 ms stagger**, suppressed under `prefers-reduced-motion` — the reduced
  motion test renders all seven rows before any timer runs.
- **DRAFT ≠ ACTIVE.** `lifecycle_state` is only ever the server's word. The
  DRAFT note disappears when the server says `ACTIVE`, and a successful
  registration never implies activation.
- **Verbatim copy.** Three contractual sentences are exported constants and
  asserted character-for-character, em dashes included, in the unit suite and
  again in the browser.

## Visual system

Research Light only. `--good #1e7b4f` and `--bad #b43a3a` match the hi-fi
value for value, so the gate column needs no raw hex. No `exec-*` token is used
— Execution Carbon is a dark surface and would not survive being dropped into a
paper one. No shared shell file was touched (handoff: Research-scoped early
screen primitives; P09 normalises later).

## Data lane

**Typed inactive, with the client wired.** The five routes exist and
`useAlphaImport` calls them, but mounting a product route is P09's shared-route
work, so the only place Screen 14 renders today is the labelled fixture lane,
where it is given constants and issues no request.

## Findings

### `CG-P07-01` — activation admission was unpublished (resolved 2026-09-20)

`POST /{alpha_version_id}/activate` can answer
`RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN`, but nothing the browser may read
says *in advance* whether this actor may activate: `RegistryEntry` and
`RegistrationResponse` carry the object's lifecycle, not the caller's rights
over it.

P05 settled the precedent — `mayExport()` requires the server's own admission,
because a control that exists only to be refused teaches the reader that
controls lie. The backend now publishes required `may_activate: boolean` on
both `RegistrationResponse` and `RegistryEntry`, evaluated per actor by the
exact same predicate as `POST /{alpha_version_id}/activate` after workspace
membership is checked. The real S14 container reads the generated registration
field directly; it does not infer permission from a browser-held role or object
lifecycle. Fixture branches remain useful for visual coverage, but they are no
longer a substitute for server admission.

### `FD-P07-02` — the R2 capability ledger omitted the five new routes (resolved 2026-09-20)

At the time Claude identified this gap, `npm test` failed in
`src/execution/r2Ledger.test.ts`:

```
expected [ 'GET /api/v1/research/alphas', …(4) ] to deeply equal []
```

The guard re-derives routes from `apps/control-api/src/**.controller.ts` and
compares them with `r2_ledger/capability-inventory.v1.json`. P07's backend
published five controller routes without a ledger entry, so the inventory is
now incomplete and the gate is red.

The backend owner added all five entries with exact interaction class, consumer,
owner, test owner and truthful P07/P09 evidence. They remain marked
`unused_capability: true` because P09, not P07, owns the first mounted product
route and browser receipt. The ledger gate is now green; no route is falsely
claimed as product-active.

### `FD-P07-03` — the boundary sweep's network rule was too blunt

`researchBoundary.test.ts` banned `fetch(` outright across the Research surface.
That held only while every Research module was prop-driven. P07 has to call the
Portal's own BFF, and a rule like that gets deleted the first time it is
inconvenient — which is how a boundary stops being one.

It is now an allowlist with a positive assertion: `fetch` may appear in exactly
`alphaImportClient.ts`, that module may contain no scheme and no
protocol-relative host at all, and its `BASE` must start with `/api/v1/`. An
absolute URL there would be an analyser or engine address, which is precisely
what the P07 handoff forbids. The prohibition is stronger than the ban it
replaced, because it now checks *where* requests go rather than *whether* they
exist.

## Defects found by looking at the screenshot, not by the tests

158 tests passed before these were visible in the crops:

1. **`SKIPPED` was unreadable.** The state word used `--line-strong` (#c6c2b6),
   a border tone, giving roughly 1.9:1 against white. `SKIPPED` is the word that
   tells the reader a gate never ran, so it has to be legible; it now uses
   `--ink-mute` (#68738a).
2. **The alpha-id input was greyed with no reason given.** It was disabled until
   all seven gates passed, which bought nothing — typing a name early is
   harmless — while adding exactly the silent disabled control §3.5 exists to
   prevent. The input is now always editable; the Register button already states
   why it is closed.

A third, `§3.5` itself, was caught by the repo's own guard rather than by me:
four disabled step controls had no reason. Each now carries both a `title` and a
visible sentence, because a tooltip alone reaches neither touch nor keyboard:

| control | sentence |
|---|---|
| Parse | Drop a .py file or paste the module first. |
| Run gates | Parse a source first — the gates run against the server's parse receipt. |
| Run gates (parse incomplete) | The parse did not complete. The mirror above shows which fields are missing. |
| Register draft | Run the gates first. / A gate failed. Fix the module and submit it again. / All seven gates must pass. / Name the alpha this version belongs to. |
| Activate | Activation is in flight. |

## Test matrix

| ID | Spec requirement | Result |
|---|---|---|
| T01 | clean `.py` → mirror complete, step 2 enabled | pass |
| T02 | missing field red; gate 1 FAIL then SKIPPED | pass |
| T03 | gate 3 message verbatim; step 3 disabled | pass |
| T04 | 7 PASS on a 120 ms stagger; step 3 enabled | pass |
| T05 | `av_0_3_0` DRAFT; supersedes note; registry strip | pass |
| T06 | ACTIVE; the rc-composable note disappears | pass |
| T07 | Screen 02 prefill from `av_` | **NOT_RUN_BY_DESIGN — Screen 02/New Run does not exist in P07. P10 owns it and its browser receipt; this is neither green nor a P07 defect.** |
| T08 | two files → single-file error verbatim | pass |
| T09 | reduced motion → no stagger | pass |
| T10 | dropzone label, gate rows `role=list`, named regions | pass |
| T11 | copy diff zero, all 14 refusal codes mapped | pass |
| T12 | 660px: mirror scrolls in frame, no page overflow | pass |

## Gates

| gate | command | result |
|---|---|---|
| typecheck | `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| research suite | `npx vitest run src/research` | **158 passed / 8 files** |
| full frontend suite | `npm test` | **158 test files, 0 failures** after the backend ledger closeout |
| build | `npm run build` | **exit 0** |
| browser probe | `npx playwright test --config=playwright.research-probe.config.ts` | **6 passed**, 0 console errors or warnings |

## Browser receipt

Against a local `vite preview` of the production build at `127.0.0.1:4317`,
Portal API stubbed with the repository's own `stubPortalApi(page, "healthy")`.

| check | result |
|---|---|
| four Screen 14 instances render | pass |
| gate cascade in the DOM | `PASS,PASS,FAIL,SKIPPED×4` |
| fail-closed sentence, DRAFT note, disclosure | byte-exact |
| register disabled + its reason visible | pass |
| `warmup_bars` missing → empty `dd` | pass |
| unparsed instance keeps its panels and says what is owed | pass |
| horizontal page overflow at 1280 and 660 | 0 px |
| console errors + warnings | **0** |

### Screenshot receipt — ephemeral, not archived

These captures live only in this session's scratchpad and are **not retained**:
the directory is removed when the session ends and no durable private archive
has been provisioned for Research visual evidence. Recorded with full digests so
the same build can be re-verified, not as an artifact anyone can fetch later.

| file | dimensions | sha256 |
|---|---|---|
| `s14-clean.png` | 936x1371 | `a920d6740739aec584b5f6213096781cf73b0c1b1998a674cbe8e4e3706838a2` |
| `s14-failing.png` | 936x1343 | `5c0fdead135cc46201fd3c96df77ac382fa5d2b94e6372a46fabfc41b28affbb` |
| `s14-clean-660.png` | 564x1371 | `39f8c6da64605887a5d0efae87206e137786c855bcd943f7b4e59694b76b164d` |
| `research-fixtures-laptop.png` | 1280x8398 | `c1cf62354855d59d92283475efcff3c7a1a705cb87b7402d4bc0d695660d60e8` |
| `research-fixtures-mobile.png` | 660x10497 | `8aba30fe7837df9d3b0375e0553f98ab692f1bab0f8ff6375fe84f4bd0d12f4e` |

Location: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots-p07/`.
Reproduce: `npm run build`, `npx vite preview --port 4317 --strictPort`, then
`RESEARCH_SHOT_DIR=<dir> npx playwright test --config=playwright.research-probe.config.ts`.

## Not claimed

No product route is mounted (P09 owns route normalisation). No dev or
production deployment. `V11-P07-BR` stays `PENDING_OWNER_PHASE`: this is
composition against a published contract plus a fixture-lane browser receipt,
not a browser acceptance of a live route. Screen 14 T07 is
`NOT_RUN_BY_DESIGN`; P10 owns Screen 02/New Run and that cross-screen prefill.
`CG-P07-01` and `FD-P07-02` are resolved.
