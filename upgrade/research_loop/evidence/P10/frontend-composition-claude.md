# P10 frontend composition — Screen 02 New Run, and two routes mounted

**Status:** `FE_NEW_RUN_MOUNTED` · Claude · 2026-09-21
**Handoff consumed:** [Claude P10 handoff](./frontend-handoff-claude.md) ·
[P10 report](./phase-report.md)
**UX authority:** [spec 02](../../release-v1.1/docs/screens/02_new_run.md) +
`QuantBT 02 New Run Preflight.dc.html`
**Contracts:** `@portal/contracts-research-run-create` for the write,
`@portal/contracts-research-preflight` for `may_create_run`.

## Decisions acknowledged

- **Screen 02 route:** `/research/quantbt/runs/new` — mounted.
- **Screen 14 canonical route:** `/research/quantbt/alpha-import` — mounted.
  Legacy `/research/quantbt/imports` untouched; `/research/alphas/import`
  stays unmounted while `ALPHA_POOL` is `COMMISSIONED`.
- **`S14-VIS-01` confirmed:** three authority states — parse → seven gates →
  register/activate. Code anatomy is a visual substage under parse, never a
  fourth state, endpoint, persistence field or backend transition. A browser
  test now asserts the substage changes **no** control's enablement when
  opened, on the product route rather than only in the fixture lane.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/NewRun.tsx` | 1156 | The eight-step composition and the review rail |
| `src/research/newRun.test.tsx` | 657 | `P10-T01…T10`, 37 tests |
| `src/research/runDraft.ts` | 365 | Draft model, verbatim validators, **the one serializer** |
| `src/research/runCreateClient.ts` | 200 | Typed create client, 12-code refusal map, intent id |
| `src/research/useNewRun.ts` | 162 | Container: declaration → preflight → create |
| `src/research/NewRunRoute.tsx` | 143 | Atlas-driven constraints, product route |
| `src/research/AlphaImportRoute.tsx` | 43 | Screen 14 on its canonical route |
| `src/research/atlas.ts` | +28/−8 | Retyped from the contract the browser reads |
| `src/research/atlasDocument.ts` | −70 | **Deleted** — `CG-P09-01` closed |
| `src/features/quantbt/QuantBTModule.tsx` | +24/−5 | Two routes mounted; `runs/new` is not a run id |
| `e2e/_probe-research-product.spec.ts` | +145 | Four browser tests on the real routes |
| `e2e/fixtures.ts` | +12 | P07/P08/P10 stubs |
| `e2e/research-foundation/*.json` | 2 new | Preflight and run-create probe fixtures |

## One serializer, three consumers

`serializeRequestedSpec` is defined once, in `runDraft.ts`, and a test asserts
no other module on the surface defines it. The review rail, the preflight
request and the create request all render or send that exact object — the
browser probe compares the two request bodies and requires them equal.

This is the rule the whole screen turns on: the moment preview and submit are
built by different code, the reader approves one thing and the server receives
another.

Three prohibitions hold inside it:

- **No untouched default is serialized** (spec 02 §13-1). `optimization_config`
  carries only the sparse override map; writing out a default would inflate the
  payload and freeze a value that should follow the release.
- **No digest is computed.** `client.config_digest` is the release identity the
  form was built from, not something derived from the draft. Asserted by source
  sweep.
- **Only one protocol's windows are sent.** Carrying both would ask the server
  to decide which the reader meant.

## The route grid is the engine's, not the form's

Step 3 renders from the Atlas manifest. A route the installed release adds
appears with no frontend change; a route it will not admit is drawn **disabled
with the engine's own refusal sentence** rather than hidden (§13-3). The browser
test reads the expected sentence out of the manifest at runtime rather than
hardcoding it — asserting a remembered string would pass while the screen
printed a different one, which is exactly what happened on the first run.

When the Atlas cannot be read, the form still renders — the reader's
declaration is theirs and does not vanish because a dependency did — but no
route is offered and the step says the form carries no local copy of the
release's routes.

## `may_create_run` is display state

The handoff is explicit that it is not a client authorization gate, so:

- submit is offered whenever a valid preflight exists, regardless of the flag;
- the published value is rendered beside it, and when it is `false` the screen
  says admission is decided when the request arrives;
- a typed `RESEARCH_RUN_CREATE_FORBIDDEN` after submit is mapped as a normal
  outcome of atomic re-admission, not as an error to explain away.

Treating the flag as a gate would have hidden a control the server might still
admit, and made the refusal look like a bug.

## An unknown outcome is never retried

`RESEARCH_RUN_TRANSPORT_UNKNOWN` — and a transport failure, which is
indistinguishable from here — leave the run's existence unknown. A blind retry
is how one declaration becomes two runs.

So `client_intent_id` is generated per attempt and **reused** by the re-check,
which lets the server answer `replayed` instead of creating a second run. The
screen offers "Check again" with the reason, never an automatic retry. A test
drives `502 → recheck → 202 replayed:true` and asserts both requests carried
the same intent id.

## Valid fields survive a refusal

`RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` is the case the handoff calls out:
the fixed P04 adapter may refuse rich route parameters. A test submits
`reactive: { runtime: "R3B", audit_mode: "audit" }`, takes the refusal, and
asserts the draft still holds those exact values. Silently downgrading them to
the adapter's fixed ones would submit something the reader never declared.

## `CG-P09-01` closed, and the narrowing layer deleted

Codex typed `claims` and `evidence_contract` in the foundation contract. The
remaining gap was that `atlas.ts` still typed from `@portal/contracts` (P04's
Portal API description) while the client returned P09's — two generated
descriptions of one document, with a checked narrowing between them.

`atlas.ts` now types from `@portal/contracts-research-foundation`, the contract
the browser actually reads, and `atlasDocument.ts` is deleted. A test asserts
the module imports that contract and not the other, so the second description
cannot come back.

What P09 still leaves wider is the schedule vocabulary (`valid_schedules`,
`default_schedule` are plain strings). Screen 12 renders both as text, so
nothing is lost on this surface — recorded rather than re-narrowed locally.

## Defects found by looking, not by testing

Four survived a green unit suite:

1. **`/api/runs/new` was requested on every visit.** Mounting Screen 02 under
   `runs/` made the module's run-id extractor read `new` as a run id and fetch
   a run that cannot exist — two console errors on a screen that had created
   nothing. Fixed at the source with a reserved-segment set, so `onRunRoute`
   and the header follow from the same fact.
2. **The wizard bar hid its first two steps.** With the Portal sidebar taking
   248px of 1280, eight pills overflowed into a horizontal scrollbar: a wizard
   whose step one is off-screen reads as one that starts at step three. It
   wraps now, and the probe asserts no pill is clipped by its own bar.
3. **`mode × schedule` printed a bare `×`** when both fields were empty, and
   the binding chip printed `PUBLISHABLE ·` with nothing after it. A separator
   with nothing on either side reads as a value that is there — the same rule
   as §3.3's "never a dash". Both say `not declared` now.
4. **A pin was claimed with no version bound.** The verbatim message rendered
   `Strategy is pinned by  (entrypoint …)`, naming a version the reader had not
   chosen, with the gap where its id belongs. Caught by the test written for
   defect 3.

## Test matrix

| ID | Requirement | Result |
|---|---|---|
| P10-T01 | one serializer; protocol windows; no default serialized; no digest | pass |
| P10-T02 | window rules verbatim and half-open | pass |
| P10-T03 | the declared parameter space is never widened; ceiling counts swept dims | pass |
| P10-T04 | release ceilings are the engine's; blocking order is the spec's | pass |
| P10-T05 | eight steps; manifest-driven route grid; blocked route shows its reason | pass |
| P10-T06 | `may_create_run` is display state, not a gate | pass |
| P10-T07 | the create body carries only the contract's fields; one intent id per attempt | pass |
| P10-T08 | 12 typed refusals; rich parameters survive an adapter refusal | pass |
| P10-T09 | a `202` is a queued run — no timer, worker or terminal state | pass |
| P10-T10 | one published path; no local DTO | pass |

## Gates

| gate | command | result |
|---|---|---|
| typecheck | `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| research suite | `npx vitest run src/research` | **275 passed / 11 files** |
| full frontend suite | `npm test` | **162 files, 2685 passed, 1 skipped, 0 failed** |
| build | `npm run build` | **exit 0** |
| browser probe | `npx playwright test --config=playwright.research-probe.config.ts` | **21 passed**, 0 console errors or warnings |

| visual regression | `npm run e2e:visual` | **exit 1 — 33 failed / 299 passed**, identical to the pre-existing set |

Every exit code above was read from the command itself, not from the tail of a
pipeline.

The visual failures are the drift recorded in the P09 packet: `7441c572`
widened Tailwind's `content` glob after the last baseline update, shifting
computed layout about a pixel app-wide. Compared by name against the set
measured on a clean worktree at `cac85b43`, the two are **identical** — 25
distinct tests, `comm` empty in both directions. This change set moves the
visual baseline by zero tests.

## Browser receipt — the real product routes

| check | result |
|---|---|
| `/research/quantbt/runs/new` renders at 1280 and 660 | pass |
| eight step pills, none clipped by the bar | pass |
| route grid from the manifest | 14 cards |
| blocked route disabled, carrying the manifest's own reason | pass |
| declare → preflight → create, end to end | `run_01HZQ7PROBE`, `QUEUED` |
| preflight body and create body carry the identical `requested_spec` | pass |
| no derived or private fact in the create body | pass |
| `/research/quantbt/alpha-import` renders with three authority states | pass |
| opening Code anatomy changes no enablement | pass |
| exactly one `.portal-shell` on both routes | pass |
| horizontal page overflow | 0 px at 1280 and 660 |
| console errors + warnings | **0** |

### Screenshot receipt — ephemeral, not archived

| file | dimensions | sha256 |
|---|---|---|
| `s02-new-run-laptop.png` | 1280x900 | `aabb8f13f97409e3c645a7cbf04e0e02d931ffe11205e6b7ab8e541b84339cb0` |
| `s02-new-run-mobile.png` | 660x1219 | `e9667a5bafc913e9770f2607634c098107ee6eb93b57b07795b5bf5f2447dcdb` |
| `s02-new-run-created.png` | 1280x900 | `a5e71b2695d1f78f425448ef0e2a5dc85462a80735f52c32c0b1977bc3cb5957` |
| `s14-alpha-import-route.png` | 1280x2730 | `2536b16a1f78f2e00d6f01804900365604a75cdd595b10fb0c6cb3383c202243` |

Location: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots-p10/`.
Reproduce: `npm run build`, `npx vite preview --port 4317 --strictPort`, then
`RESEARCH_SHOT_DIR=<dir> npx playwright test --config=playwright.research-probe.config.ts`.

## Browser-declaration amendment consumed — `BR-P10-01` and `BR-P10-02` closed

Codex published the facts at `394901d5`, and they are wired.

| Fact | Generated source | Where it lands |
|---|---|---|
| entrypoint, timeframes, `determinism.seed_required`, parameter space | `RegistryEntry.declaration` | `constraintsFrom()` and the sweep/pin table |
| trial ceiling (`4000`) | `Atlas.current_release.trial_ceiling` | the ceiling validator |
| four optimizer default groups | `Atlas.current_release.optimizer_defaults` | step 7, `RELEASE_DEFAULT · LOCKED` |
| current submission profile | `Atlas.current_release.submission_constraints` | step 7, stated in the server's own words |

**The version is located by an exact `alpha_version_id` match.** An entrypoint
is never inferred from an identifier and a near-match is not a match: if the
selected version is not in the registry, every declared fact is `null` and the
screen names which ones it could not read.

### `Infinity` is gone, and nothing replaced it

The old fallback read as "no limit" — a claim about the release that no
response supported. Every constraint is `null` until a response supplies it, the
check that depends on it simply does not run, and a panel says *which* facts
were not read. The server still enforces its own at preflight, so declining to
guess loosens nothing.

`missingConstraints()` is the single place that decides what to name, so the
screen cannot drift from the validators.

### The four default groups are explained, never editable

Every field renders `RELEASE_DEFAULT` with its `override_state`, and a `LOCKED`
row carries **no input at all** — an input the server will refuse is a promise
the screen cannot keep. A test asserts the draft's override map stays empty
while all four groups are on screen, because spec 02 §13-1 forbids serializing
a default and the amendment is explicit that these groups explain the release
without authorizing an override.

`submission_constraints` is stricter than the defaults it sits beside — one
trial, no optimizer override, null early-stop and null seed. It is stated
rather than enforced: a richer request stays submittable and the server's typed
refusal remains authoritative, exactly as the handoff directs.

### Browser receipt: the four validators fire from a typed response

Two new browser tests drive the product route with the registry and Atlas
answering from generated-shape fixtures, and each validator is triggered
through the form a reader uses:

| validator | trigger | sentence observed in the browser |
|---|---|---|
| entrypoint pin | strategy id ≠ declared entrypoint | `Strategy is pinned by av_delta_rsi_polynomial_alpha_1_0_0 (entrypoint alpha.delta_rsi:run) — …` |
| declared timeframes | timeframe `1d` | `The strategy declares only 1h, 4h.` |
| release ceiling | trials `9999` | `The engine release publishes a ceiling of 4000 trials.` |
| seed requirement | seed cleared | `The strategy declares determinism.seed_required — a fixed random seed is required.` |

The same test asserts the declared parameter space was **adopted** — four rows,
with the `fixed` declaration arriving pinned at `120` — and that no source
digest, adapter or provenance field reaches the table.

### Two further display defects found by reading the screenshot

- `all defaults from — nothing serialized` printed a dangling em dash while the
  release id was empty.
- `client.engine_release_id` was sent empty although the Atlas had published it.
  The release the form was declared against now travels with the spec, and the
  browser probe asserts `er_quantbt_111` arrives in the create body.
  `config_digest` stays empty: no response publishes one and the browser must
  not compute a digest. Recorded rather than papered over.

## Remaining backend request — one

### `CG-P10-01` — no published `client.config_digest`

`RequestedSpec.client.config_digest` is a required string, no response
publishes a value for it, and the browser may not compute a digest. It is sent
empty. The server accepts that today; if it is meant to identify the client
configuration, it needs a published source.

### `CG-P09-02` — still open, unchanged

No canonical fixture is published for the two foundation reads, so the browser
receipt uses fixtures generated from `journey.descriptor.ts` and
`research-engine-catalog.v1.json`. Valid current evidence; not product truth.

## Not claimed

No dev or production deployment. P11 owns progress, streaming and readback:
nothing here fabricates a timer, a terminal state or a worker status from the
`202`. The accordion over the full `optimization_config` surface renders the
override map and its summary, but not the four grouped default tables — those
need the release manifest's defaults, which the Atlas does not publish; the
sparse-override contract is fully honoured either way. `intent_kind` is `NEW`
only; the three other kinds exist in the contract and belong to the phases that
introduce reproduction and upgrade.
