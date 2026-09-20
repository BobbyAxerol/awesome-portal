# P08 frontend composition — Screen 02 preflight and Screen 05 split boundary

**Status:** `FE_PREFLIGHT_CONSUMER_COMPLETE` · Claude · 2026-09-20
**Handoff consumed:** [Claude P08 handoff](./frontend-handoff-claude.md) ·
[P08 report](./phase-report.md)
**UX authority:** [spec 02](../../release-v1.1/docs/screens/02_new_run.md) ·
[spec 05](../../release-v1.1/docs/screens/05_s1_split.md)
**Contract:** `@portal/contracts-research-preflight`
(`packages/contracts/generated/research-preflight.d.ts`, 508 lines). No field
name is retyped and no payload is parsed into a local structure.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/preflightClient.ts` | 251 | Typed client for both operations, the 19-code refusal map, local token invalidation |
| `src/research/usePreflight.ts` | 157 | Container: token lifecycle, spec-change invalidation, panel state |
| `src/research/PreflightPanel.tsx` | 471 | Screen 02 preflight composition — six panels |
| `src/research/SplitBoundary.tsx` | 282 | Screen 05 structural boundary |
| `src/research/preflight.test.tsx` | 713 | `P08-T01…T12`, 36 tests |
| `src/research/ResearchFixtures.tsx` | +213 | Six labelled instances in the fixture lane |
| `e2e/_probe-research-fixtures.spec.ts` | +100 | Two browser probes |
| `src/research/researchBoundary.test.ts` | +17/−1 | `preflightClient.ts` added to the network allowlist; new raw-hex guard |

## Scope taken, and scope deliberately not taken

P08 publishes two operations and the typed facts behind them. It does **not**
publish the release manifest, the alpha registry or the eight-step declaration
surface — the generated schema says so itself: *"P02 producer-side structural
contract for S02. It is not a live endpoint contract. P04 supplies
installed-manifest values and P10 supplies authenticated producer wiring."*

So what was built is the **preflight consumer**, not the wizard. The container
takes a `RequestedSpec` as an input rather than owning a form, which means the
same container serves a wizard, a reproduction or a fixture without change when
P10 wires the producer. Building the route grid or the parameter table now
would mean inventing the data sources they read from, which is the one thing
this phase forbids.

Screen 05 is the **structural boundary only**, exactly as the handoff scopes
it. P08 supplies typed topology and sealed-holdout integrity metadata, so the
screen renders protocol facts, fold boundaries and the seal. Purge, embargo,
inner folds, θ* digests and the gap scan are **not** in the contract and
therefore do not appear — a test asserts no panel mentions them, and a footer
names them as belonging to the completed split evidence rather than leaving the
absence unexplained.

## The two rules the tests exist to hold

### A token belongs to the exact spec it was issued for

Any difference in the requested spec drops the held token and its result. The
comparison is a key-ordered structural equality, **not** a canonicalisation and
**not** a digest: it never leaves the browser, is never compared against
`requested_spec_digest`, and answers exactly one question — *did the reader
change something since the preview*. Control API owns canonicalisation.

Every field is material. There is no cosmetic field in this contract: a changed
seed, trial count or symbol each produce a different effective spec, so treating
any of them as harmless would let a run be built from a preview of something
else. The invalidation runs as an effect on the spec rather than inside a
change handler, because the spec can also arrive from a reproduction or a deep
link, and a rule that fires on only one path is not a rule.

### The browser never derives the manifest

`requested_spec_digest` is never sent — a test asserts the POST body has exactly
one key, `requested_spec`. No digest is computed anywhere on the P08 surface
(asserted by source sweep as well as by the surface-wide boundary test). Fold
boundaries are positioned from server milliseconds; the only thing derived is
the pixel offset.

## Refusal behaviour

All 19 contract codes are mapped exhaustively via `Record<PreflightProblemCode, …>`,
so a code added backend-side fails this build rather than degrading to a generic
message. The handoff's four groups are each asserted:

| Group | Behaviour | Codes |
|---|---|---|
| Input fault | `highlightsInput`, token kept, edits preserved | `INVALID`, `TOPOLOGY_INVALID`, `TOPOLOGY_UNSUPPORTED`, `RESOURCE_REFUSED`, `SNAPSHOT_TOO_LARGE` |
| Dependency gap | `unavailable`, no retry, no fake empty preview | `DATA_UNAVAILABLE`, `REQUIRED_COLUMNS_UNAVAILABLE`, `FUNDING_UNAVAILABLE`, `WARMUP_UNAVAILABLE` |
| Dead token | token dropped, never resent | `EXPIRED`, `STALE`, `NOT_FOUND` |
| Transient | `failed-retryable`, offered to the reader, never retried behind their back | `UNAVAILABLE`, `REJECTED` |

A transport failure reports "The request did not reach the server." — actionable
without naming a proxy or a status line.

## Display decisions worth recording

- **`[start, end)` is written as `[start, end)`.** A half-open range drawn as
  `start → end` reads as inclusive, and the bar at `end` is exactly the one the
  methodology excludes. Asserted in both suites.
- **Zero is printed, absent is not.** `gaps 0` is a measurement and belongs on
  screen; an empty `reason_codes` renders "none reported" rather than a blank,
  because a blank cell reads as a missing field (§3.3).
- **`quality.passed` is a contract constant**, so it is not rendered as a green
  verdict. It would turn a sealing precondition into a result; the state word
  `SNAPSHOT_INTEGRITY_ONLY` is shown instead.
- **Server disclosures are rendered, never paraphrased** —
  `resource_estimate.disclosure`, `sealed_holdout.disclosure` and the `scope`
  constant. A test alters the constant in the response and asserts the DOM
  follows, so a local copy cannot creep back in.
- **The seal is drawn as a seal.** Hatched grey with a `--role-holdout` edge,
  never the OOS colour (spec 05 pitfall 3), and the word `SEALED` rather than an
  emoji (pitfall 4). There is no unlock control: an inert one would advertise an
  action this phase cannot perform.
- **Four route axes stay four chips.** Collapsing them would hide who can
  unblock a route.

## Findings

### `FD-P08-01` — the R2 capability ledger does not know the two new routes

`npm test` fails in `src/execution/r2Ledger.test.ts`:

```
+ [
+   "GET /api/v1/research/preflights/:preflight_token",
+   "POST /api/v1/research/preflights",
```

Same class as `FD-P07-02`, which codex closed: the guard re-derives routes from
`apps/control-api/src/**.controller.ts` and compares them with
`r2_ledger/capability-inventory.v1.json`. P08's two controller routes have no
inventory entry.

**Not fixed here.** The missing columns are `interaction_class`, `owner`,
`test_owner` and `evidence` — backend ownership claims that are codex's to make.
Pre-existing on the branch: this change set touches only
`apps/portal/frontend/src/research/**` and `e2e/`, and the failure reproduces
from the control-api tree alone.

### `FD-P08-02` — the boundary sweep gained a raw-hex guard

Research Light matches the hi-fi value for value, so a component reaching for a
raw hex is reaching for a colour the palette does not name — and that colour
will not follow the theme. The first draft of these panels copied the hi-fi's
literals for the seal, the train band and the OOS band, all three of which
already had tokens: `--role-holdout`, `--viz-train`, `--role-oos`. The sweep now
fails on any raw hex across the Research surface.

### `CG-P08-01` — no published field admits run creation (backend request, not blocking)

Screen 02's terminal action is *create run*, and P08 deliberately stops before
it (`preflight_admission: "PREFLIGHT_ONLY"`). When P10 publishes the create
operation, the same question P07 answered with `may_activate` applies here:
whether *this* caller may create a run from *this* preflight is a server fact.
Recorded now so the control is not built on an inference later.

```text
Backend request
- Field needed (P10): a caller-scoped boolean admitting run creation from a
  held preflight token.
- UI reason: Screen 02's create action must be withheld rather than offered to
  be refused — the precedent P05 set and P07 closed.
- Current impact: none. P08 exposes no create control, by design.
```

## Defects found by looking at the screenshots

Both survived a green unit suite and a green browser probe:

1. **Byte counts were unscannable.** `268435456 bytes` is the same number as
   `268,435,456 bytes`, but only one can be read at a glance — and a resource
   estimate whose magnitude cannot be read at a glance is not doing its job.
   Grouping is not abbreviation: every digit stays, nothing rounds, no unit
   changes. A test asserts the grouped string still contains the exact digits
   and matches no `MB`-style abbreviation, and the browser probe asserts the
   literal `268,435,456 bytes` and `8,766 rows`. `gap_ratio` is deliberately
   left ungrouped — it is a measured decimal, and touching it would change the
   measurement.
2. **The fold row's trailing interval was unlabelled.** An unlabelled interval
   at the end of a fold row reads as the fold's whole span rather than as the
   outer OOS window it is. It now reads `oos [start, end)`.

## Test matrix

| ID | Requirement | Result |
|---|---|---|
| P08-T01 | every preflight fact rendered from the typed response; half-open UTC | pass |
| P08-T02 | quality counters are measurements, not a verdict | pass |
| P08-T03 | resource estimate keeps its declared scope; server disclosure | pass |
| P08-T04 | both topology branches rendered exactly | pass |
| P08-T05 | four route axes stay four facts | pass |
| P08-T06 | a token belongs to the spec it was issued for | pass |
| P08-T07 | no digest computed; no `requested_spec_digest` sent | pass |
| P08-T08 | all 19 refusal codes mapped to the handoff's four behaviours | pass |
| P08-T09 | an expired token is dropped, never resent | pass |
| P08-T10 | panels keep their frame when the preflight is refused | pass |
| P08-T11 | Screen 05 renders the structural boundary only | pass |
| P08-T12 | the advanced protocol declares no seal | pass |

## Gates

| gate | command | result |
|---|---|---|
| typecheck | `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| research suite | `npx vitest run src/research` | **198 passed / 9 files** |
| full frontend suite | `npm test` | 2607 passed, 1 skipped, **1 failed: `r2Ledger` (`FD-P08-01`, codex-owned)** |
| build | `npm run build` | **exit 0** |
| browser probe | `npx playwright test --config=playwright.research-probe.config.ts` | **8 passed**, 0 console errors or warnings |

## Browser receipt

Against a local `vite preview` of the production build at `127.0.0.1:4317`,
Portal API stubbed with `stubPortalApi(page, "healthy")`.

| check | result |
|---|---|
| three Screen 02 instances, three Screen 05 instances | pass |
| half-open interval rendered literally | `[2022-01-01T00:00:00.000Z, 2026-01-01T00:00:00.000Z)` |
| grouped exact byte and row counts | `268,435,456 bytes`, `8,766 rows` |
| scope wording verbatim | pass |
| four axis chips | 4 |
| refused instance keeps its panels, shows no metadata | pass |
| dropped-preview instance states why | pass |
| seal is a repeating hatch, not the OOS colour | pass |
| no unlock control on Screen 05 | 0 buttons |
| unsealed protocol says so | pass |
| horizontal page overflow at 1280 and 660 | 0 px |
| console errors + warnings | **0** |

### Screenshot receipt — ephemeral, not archived

These captures live only in this session's scratchpad and are **not retained**:
the directory is removed when the session ends and no durable private archive
has been provisioned for Research visual evidence. Recorded with digests so the
same build can be re-verified.

| file | dimensions | sha256 |
|---|---|---|
| `s02-preflight.png` | 936x1352 | `7a644c4e8539dc204884e064afab36691b9ee296ff1fea8fff61f7bcb376fb51` |
| `s02-preflight-660.png` | 564x1459 | `1f772aba047d5d1b44b6883e25c68022a884ab16e0c9530a29507b3decc24616` |
| `s05-split.png` | 936x466 | `4e737d6ba9cdb367eba0a8156f36315695ba7ceb8f360d34ab92b7f2a3b568cf` |
| `s05-split-660.png` | 564x501 | `bac0a778dff9c15dc4e994c94141c6b981afc22a78c4aa260cc8add131faa098` |

Location: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots-p08/`.
Reproduce: `npm run build`, `npx vite preview --port 4317 --strictPort`, then
`RESEARCH_SHOT_DIR=<dir> npx playwright test --config=playwright.research-probe.config.ts`.

## Not claimed

No product route is mounted — P09 owns route normalisation, so the only place
these render today is the labelled fixture lane. No dev or production
deployment, and no image was rebuilt to consume P08. The eight-step declaration
surface of Screen 02 is **not** built: its data sources are P10's. Screen 05's
purge, embargo, inner folds, θ* digests and gap scan are **not** built: they are
P14's. `V11-P08-BR` stays `PENDING_OWNER_PHASE` — this is composition against a
published contract plus a fixture-lane browser receipt, not a browser acceptance
of a live route.
