# G2 / D4 — Screen 02 prefills the outer window bounds from the chosen dataset's coverage (Claude, 2026-09-30)

**Package:** Unified plan §13.4.1 row **D4** (decision, owner delegation 2026-09-26) and §G row **G2** · HiFi audit row **02-13**.
**Branch:** `feat/research-g2-d4-s02-prefill`, cut from `d3d99f26` (`origin/docs/research-loop-plan`). Not pushed.
**Route:** `/research/quantbt/runs/new` (Data step and Walk-forward step; the review rail shows one line on every step).
**Scope kept:** S02 files only (`NewRun.tsx`, `runDraft.ts`, `NewRunRoute.tsx` untouched, one new S02 test). One addition outside that list, and why: the canonical dataset-catalog fixture did not exist (see "Fixture").

## The decision, and what it can honestly mean

D4: prefill the windows from the coverage of the dataset the reader picked; editable; blank when there is no dataset; no invented default.

The catalog does not publish a window. It publishes **month partitions** (`first_month`, `last_month`, `months`, `granularity: MONTH_PARTITION`) and says of itself, in `coverage_rule`, that "it is not the exact first or last bar; preflight queries the bounded range and refuses what is absent" (`research_dataset_catalog.py:112`). The one thing that statement fixes literally is the **outer envelope**: nothing can lie before the first day of the first partition or after the last day of the last one. Everything inside that envelope — where IS ends, where OOS starts and ends, where the holdout starts — is not a fact anyone publishes. So the rule implemented is: fill the outer envelope, leave the interior empty, say so.

## Served facts read (file@commit `d3d99f26`, and the live preview on 2026-09-30, GET only)

| Fact | Where | What it says |
|---|---|---|
| Coverage shape | `packages/contracts/openapi/research-preflight.openapi.json` `DatasetCatalog`; `research_dataset_catalog.py:61,112` | `coverage` is `{first_month, last_month, months, granularity}` or **null** (a single-symbol descriptor always publishes null); `symbols.state` is `PUBLISHED` or `NOT_PUBLISHED` with a reason; `source_timezone` per dataset |
| Live catalog | `GET /api/v1/research/datasets` on `localhost:8095` | 1 dataset `crypto-binance-1m` (UTC, `CRYPTO_24_7`), 29 symbols; BTCUSDT `2020-01 → 2026-09`, 81 months. The same document validates (Ajv, strict) against the schema the fixture is checked against |
| Naive boundaries are read in the dataset's clock | `research_preflight_snapshot.py:187` `parse_source_instant`; Atlas `split_mode_rule` ("in the dataset's source timezone") | a `datetime-local` string is localized to `source_timezone` by the server |
| Three-window rules the server enforces | `research_preflight_snapshot.py:431` (contiguous), `:439` (holdout end ≤ last closed bar), `:443–447` (each window ≥ 1 bar), `:1192` warmup gate | **no length, ratio or default** for any window |
| No default for the interior | live Atlas `walk_forward_options.split_mode_rule` | "…it must lie strictly inside walk_forward.start and end_exclusive; **there is no release default to fall back on.**" |
| The version's warmup | registry `declaration.warmup_bars` (300 for `delta-rsi-polynomial-alpha`) via `constraintsFrom` | server refuses when fewer bars precede the first window |
| Admission of the Delta walk-forward profile | `delta-wfo.profile.ts:39–40`, `run-admission.service.ts:264` | span ≤ 92 days, 2–16 weekly folds, 1h. **Not published to the browser** (Atlas `submission_constraints` carries only the fixed-qualification profile) |

## What is prefilled — exactly four fields

| Field (protocol) | Value | Derived from |
|---|---|---|
| `windows.is.start` (three-window) | `${first_month}-01T00:00` | `coverage.first_month` |
| `windows.holdout.endExclusive` (three-window) | first day of the month **after** `last_month`, `T00:00` | `coverage.last_month` |
| `walkForward.start` (advanced) | same as IS start | `coverage.first_month` |
| `walkForward.endExclusive` (advanced) | same as holdout end | `coverage.last_month` |

The conversion is calendar text (`coverageMonthEdges`, integer month arithmetic; December rolls the year). No `Date`, no timezone conversion, no bar arithmetic. Both protocols are filled at pick time, because the reader may switch protocol afterwards; only the active protocol's fields are ever serialized (unchanged).

Prefill happens **only from the reader's own pick** (the Dataset and Symbol handlers in `DataStep`), never from an effect. So a catalog that arrives late, a re-render, a `?from=` copy or a what-if fork cannot overwrite anything.

## What is deliberately NOT prefilled, and why

| Not filled | Why |
|---|---|
| IS end, OOS start, OOS end, holdout start; the first OOS instant (advanced) | No served fact defines them. `split_mode_rule` says there is no default; the three-window declaration carries no length or ratio. Any "OOS = the last N days" or "60/20/20" would be the browser's own methodology. Left empty, with one line on the Walk-forward card saying why |
| Anything when there is no dataset, no symbol, no catalog, an unlisted dataset/symbol, unpublished coverage, or a coverage that contradicts itself (`months` > span, `first > last`, month 13) | Nothing served to read. Each of these is its own state with its own sentence (table below) |
| A warmup-adjusted IS start, or an end at the last closed bar | Both need bar arithmetic (`warmup_bars × timeframe`; the last closed bar) that the preflight owns. See "Known consequence" |
| Coverage-derived dates on a `?from=` copy or fork | Those windows are a declaration, not a prefill. `draftFromRequestedSpec` drops provenance; the pick rule never overwrites a non-empty value it did not place |

## Known consequence — read this before pressing preflight

The envelope is the outermost value the coverage allows, not a value the server is known to admit. On the live data, by the code path (not observed — preflight counts as a write on this preview, so none was sent):

- IS start = the first day of the first partition leaves no bar before it, so the **warmup gate** (`RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE`, `:1192`) will refuse until the reader moves IS start inward by the version's declared warmup (300 bars at 1h ≈ 12.5 days, at 4h ≈ 50 days). The card says so, with the version's own number.
- Holdout end = the end of the last partition; the last partition is the current month (2026-09), so the end likely exceeds the last closed bar → `RESEARCH_PREFLIGHT_DATA_UNAVAILABLE` (`:439`).
- For the advanced protocol the whole coverage (~2,465 days) exceeds the admitted 92-day span of the only advanced profile create admits (`run-admission.service.ts:264`) — a fact the browser cannot read today.

This is the honest ceiling of what month-granular coverage supports. The reader is told (caption per field, card note, and the version's warmup bars) and the preflight stays authoritative. The way to make the prefill land on values the server admits is a backend fact, requested below (BR-D4-1).

## Behaviour rules

Per field, a pick does exactly one of three things (`applyCoveragePrefill`, pure, in `runDraft.ts`):

1. the field still holds the value a previous coverage put there → **replaced** by the new coverage's value, or **emptied** when the new pick publishes none (never merged, never kept);
2. the field is empty and the reader never touched it → **filled**;
3. anything else (typed, copied, cleared by the reader, retyped to the same string) → **left exactly as it is**.

A field carries a prefill only while it still holds the exact string that was placed (`placed[field] === value`), so an outside mutation can never be mistaken for a prefill. An edit records the field as touched (`markPrefillTouched`), which is what makes "cleared by the reader" and "retyped to the identical value" stay the reader's.

Provenance lives in an optional `RunDraft.coveragePrefill`. `serializeRequestedSpec` never reads it: there is still one serializer (the existing "exists exactly once" test passes), a prefilled draft serializes byte-for-byte like the same dates typed by hand, and no provenance key can reach a payload. Any change to the serialized spec — including one caused by a pick replacing a prefilled date — still drops the held preflight token (`usePreflight`, spec-based), and the change itself sends nothing.

## What the reader sees (UI copy, English)

| Where | Text |
|---|---|
| Data step, once a dataset is chosen | ready: "Outer walk-forward bounds prefilled from this coverage — edit them in the Walk-forward step." · ready but all bounds are the reader's: "Coverage is published; the outer walk-forward bounds already hold your own values, so nothing was prefilled." · otherwise the reason below |
| Walk-forward card, top, when values came from coverage | "Prefilled from the coverage of {dataset} · {symbol}: {first} → {last} · {n} months, {tz} month partitions." · "Month edges, not bar times — preflight checks the exact range, and the {N} warmup bars the version declares must fit before IS start. Every value stays editable." · "IS end, OOS and holdout start are left empty: the server publishes no rule for splitting coverage into windows." (advanced: "First OOS instant is left empty: the release publishes no default for it.") |
| Under each filled bound | "prefilled from BTCUSDT coverage · first day of 2020-01" / "… · end of 2026-09" (three-window: on its own line under the row, prefixed "IS start" / "Holdout end", so the two inputs stay level) |
| Review rail, Window timeline | "Outer bounds prefilled from BTCUSDT coverage (2020-01 → 2026-09) until edited." (only while a filled bound is still on screen) |
| Partitions with holes | "40 of 43 months present" instead of "43 months" |
| Reasons (one state each) | No dataset is chosen, so nothing is prefilled. · The dataset catalog was not read, so there is no coverage to prefill from. · {id} is not in the dataset catalog, … · {server's unavailable reason} Nothing is prefilled. · {server's symbols reason} Nothing is prefilled. · No symbol is chosen, … · {SYM} is not among this dataset's {n} listed symbols, … (truncated list: "…the {n} symbols listed (the list is truncated)…") · Coverage is not published for {SYM} in {id}, … · The published coverage of {SYM} (… months) is not a consistent month range, … |

Nothing shows 0 or a dash for an absent value; the empty state adds one quiet line on the Walk-forward card and nothing on the Context step, so the `new-run` visual baseline (Context step) is unchanged in markup.

## Tests

`apps/portal/frontend/src/research/coveragePrefill.test.tsx` — **33 tests**, every catalog / atlas / registry / preflight document loaded from `packages/contracts/fixtures` (no hand-built object; variants are `structuredClone` of the fixture with one field changed).

| Group | Tests | Covers |
|---|---|---|
| calendar rule | 2 | month edges incl. December rollover; malformed / backwards / year-overflow refused |
| plan states | 6 | every non-ready state and its sentence; symbol read as the form reads it; truncated list; self-contradicting coverage |
| pick semantics (pure) | 9 | four fields only; nothing chosen → no change; replaced not merged; emptied when unpublished; edit kept through later picks; cleared stays cleared; typed/copied never overwritten; `carriedCoverage`; protocol fields |
| provenance vs payload | 2 | serializes exactly as typed-by-hand, no provenance key; `?from=` copy drops provenance and a later pick keeps the copied dates |
| **real `NewRunRoute` + `useNewRun`, stubbed `fetch`** | 7 | nothing chosen → blank; choose → filled + captions; edit survives re-render / step change / next pick; change dataset → replaced; coverage not published → blank + reason on both steps; no-symbol-list dataset and catalog not served; the POST body carries the prefilled dates as ordinary dates, no write until preflight is pressed, a held token dies when a pick changes the spec, and the next POST carries the replaced bound |
| view, both protocols | 7 | advanced span + first-OOS reason; both protocols filled; holes; cleared/retyped; warmup named / unknown / zero; timezone; "your own values" state |

Mutation checks (each reverted, source restored byte-for-byte): refilling a cleared field → 1 test fails; overwriting any value → 6 fail; keeping the old value when the new pick has none → 3 fail; not recording an edit → 1 fails (the first version of the suite let this one survive; the cleared/retyped cell was added because of it).

Other gates, run on this tree:

- `packages/contracts` `research-preflight.spec.ts`: **6 pass** (5 existing + 1 new: the fixture validates against the OpenAPI `DatasetCatalog` schema and has teeth). `snapshot.py --check`: matches all 216 tracked files (no tracked file touched).
- `tsc -p tsconfig.json --noEmit`: **exit 0**.
- S02 files together (`coveragePrefill`, `newRun`, `w4`, `preflight`): **4 files, 153 tests pass**; `newRun` + `w4` are 84, as before the change.
- Full frontend suite: **198 files, 3877 pass, 3 skipped, 3 failed**. Two (`PortalShell.test.tsx` "legacy Planning hash link", `newRun.test.tsx` "names 24 controls") timed out under load from other agents' hooks and **pass in isolation** (96 tests in the three files, 95 pass). The third, `styles/tokens.test.ts` "keeps every raw color literal inside the declared token files", **fails on the base**: it lists raw colors in `src/research/AlphaImport.tsx` (S14, E6), a file this change does not touch and that is byte-identical to `d3d99f26`. Left for S14's owner; not fixed here.
- Not run: the visual baseline (`./scripts/portal-web-visual.sh`, pinned image) and the real-API lane. The Context-step markup is unchanged, so no baseline drift is expected, but that is a claim, not a run (G6 owns it).

## Fixture (the one addition outside the S02 file list)

The brief expected a dataset catalog under `packages/contracts/fixtures/research-preflight.*`. **None existed** — only `research-preflight.response.valid.json`; the catalog lived as hand-built objects in `w4.test.tsx`, the Control API spec and the e2e stubs. Adding one is what "load the canonical fixture" required, so:

`packages/contracts/fixtures/research-preflight.dataset-catalog.valid.json` — five datasets covering every state Screen 02 must tell apart: `crypto-binance-1m` (faithful subset of the live catalog: BTCUSDT, ETHUSDT, SOLUSDT, two quarterly contracts), `fixture-bybit-1h` (same symbol name, different coverage; a symbol with holes), `fixture-single-symbol-1d` (listed symbol, `coverage: null`, `Asia/Ho_Chi_Minh` clock), `fixture-query-any-symbol` (`NOT_PUBLISHED`), `fixture-unavailable-1h`. Validated with Ajv strict against `DatasetCatalog` (as is the live payload); the new contract test pins it. It is not in `snapshot.py` `TRACKED`, like most `research-*` fixtures, so the integrity record is unaffected.

## Browser

Vite on `localhost:5232` from this worktree, proxying to the preview at `localhost:8095`; harness login; after login every non-GET request was aborted and listed — **none were attempted**; preflight and create were never touched. Prefill was verified by looking at the form. Two runs: **live** (the catalog the preview serves) and **fx** (the canonical fixture served through `page.route`, a GET substitute — the preview has one dataset, so a dataset change and unpublished coverage can only be shown that way). 34 screenshots, 1440 and 660, states: empty, prefilled, edited, changed symbol, changed dataset, coverage not published. I looked at them (prefilled / edited / changed / not published at 1440; prefilled / changed / not published / empty at 660).

- Live, prefilled: IS start `2020-01-01T00:00`, holdout end `2026-10-01T00:00`, the four interior inputs empty; edited: `2021-03-04T05:00` survives leaving the step and returning; changed symbol (BTCUSDT_260327): the edit stays, holdout end becomes `2026-05-01T00:00`.
- Fixture: changed dataset (`fixture-bybit-1h`): holdout end `2025-12-01T00:00`, the caption and card name the new coverage; `fixture-single-symbol-1d` / `VN30F1M`: holdout blank, reason on both steps.
- **Horizontal overflow: none** in any of the 34 (`scrollWidth` = `clientWidth` at 1440 and 660). Page errors: none.
- **axe**: the screen already carries `color-contrast` (74–78 nodes at 1440; `--ink-faint` #939db0 on white is 2.73:1) and one `heading-order`, in every state including empty. The first build of the new captions added 2–3 more of the same class (they copied the faint hint style); they now use `--ink-soft` (6.97:1) and **axe attributes 0 nodes to the new notes, captions, status line or rail line in all 34 shots**. The pre-existing violations are the token's, not touched here.
- Layout finding, fixed: a hint under one input of a three-window row lifted it out of line with its neighbour (the row aligns by bottom edge); the caption now sits on its own line under the row.

Screenshot SHA-256, first 16 hex (images not committed; scratchpad `g2-d4/shots/`):

| Live 1440 | | Live 660 | |
|---|---|---|---|
| 1-empty-data | `4bd44e0ad17682ec` | 1-empty-data | `f49627bc7fcc8902` |
| 1-empty-windows | `556ee20617a83b25` | 1-empty-windows | `4f4f1d67d3ff5679` |
| 2-prefilled-data | `e0878d7b3e7fb965` | 2-prefilled-data | `c163b5fc8ffdb2a9` |
| 2-prefilled-windows | `e611e8c2972fe5f0` | 2-prefilled-windows | `0a6170ab324154a3` |
| 2-prefilled-review | `b41e68156aae88a0` | 2-prefilled-review | `63dd9cb46c0013f1` |
| 3-edited-windows | `4abde78a0ad30d7a` | 3-edited-windows | `d5a5cb067837cde0` |
| 4-changed-symbol-windows | `57dba4bbfa07f1f4` | 4-changed-symbol-windows | `d9071632fdcd19db` |

| Fixture 1440 | | Fixture 660 | |
|---|---|---|---|
| 1-empty-data | `ddb9dececa463ce2` | 1-empty-data | `f49627bc7fcc8902` |
| 1-empty-windows | `d5cbf73c77377445` | 1-empty-windows | `4f4f1d67d3ff5679` |
| 2-prefilled-data | `97ba1174dafb761d` | 2-prefilled-data | `3b88ef3d3273fe70` |
| 2-prefilled-windows | `cc8ca78e3d5906ff` | 2-prefilled-windows | `e98e04f2f97099a6` |
| 2-prefilled-review | `65a4103abd4e2eba` | 2-prefilled-review | `63dd9cb46c0013f1` |
| 3-edited-windows | `27e5d5b19a605030` | 3-edited-windows | `d5a5cb067837cde0` |
| 4-changed-symbol-windows | `edc239e4a74209de` | 4-changed-symbol-windows | `ffdfea6302b5aef4` |
| 4-changed-dataset-windows | `698fc53aa2c40b02` | 4-changed-dataset-windows | `fa518ba254c73477` |
| 5-not-published-data | `4056c0161405dc6e` | 5-not-published-data | `93944231234920f3` |
| 5-not-published-windows | `60adf0fa24eb0d09` | 5-not-published-windows | `928e16a5e8f90b87` |

(Identical hashes across live and fixture at 660 are the same pixels: those states read the same data.)

## HiFi deviations (audit row 02-13)

| HiFi | Built | Why |
|---|---|---|
| Dates prefilled for all six inputs (`2020-01-01 → 2024-01-01 → 2025-07-01 → 2026-08-14`) | Two of six (IS start, holdout end); the other four empty, with the reason on the card | The HiFi's interior dates are demo values; no served fact or rule produces them. The audit row itself allows "prefill from the dataset's coverage, **or keep a blank form**" |
| Holdout end `2026-08-14` (the data's last bar) | End of the last partition (`2026-10-01`) | The catalog publishes months, not the last bar |
| "empty Holdout Live runs to the dataset's last bar" | Not built | The server requires an explicit holdout end (`:439`); an empty one is still refused by the validator |
| Window timeline bars with bar counts (02-10) | Untouched | Needs per-window bar counts from the server — open under BR-D4-1 |

## Backend requests (proposals only — not implemented; codex/owner decide)

**BR-D4-1 — publish the exact bar edges the preflight already computes, per (dataset, symbol, timeframe).**
- Need: on the dataset catalog symbol (or a sibling read), `first_bar_start_utc` and `last_closed_bar_end_utc`, and — because the version's warmup is server arithmetic — an `earliest_first_window_start_utc` for a given `alpha_version_id` (`first bar + warmup_bars × timeframe`).
- UI reason: with these the outer bounds can be exact and admitted on the two gates that refuse today's prefill (warmup, last closed bar), and the HiFi's per-window bar counts (02-10) become readable. Without them the prefill is an envelope the reader must trim.
- Today: `research_dataset_catalog.py` deliberately opens no data file, so this is a metadata sidecar / index read, not a scan. The preflight already derives both values (`:1077`, `:436`).
- Shape: (proposal) additive fields, `null` = not published, with the same `NOT_PUBLISHED` reason pattern as `symbols`.

**BR-D4-2 — an owner decision: if the interior boundaries should ever be prefilled, publish the rule, do not let the browser choose it.**
- The rule is methodology ("OOS = the last N days", "holdout = last N months", fractions of bars…) and no server fact defines it. Options: (a) a published rule in the release config (`walk_forward_options` sibling for three-window, covered by `config_digest`, so the browser sends it unchanged); (b) a server-computed `suggested_windows` per (dataset, symbol, timeframe, version) so the browser fills nothing it computed. The browser fills interior boundaries only when one of these exists.
- Until then the interior stays empty by design.

**BR-D4-3 — publish the locked-profile admission facts the form cannot read.**
- `max_span_days` (92), fold bounds (2–16), fixed timeframe/frequency of the Delta walk-forward profile, next to `submission_constraints`.
- UI reason: an advanced prefill spanning the whole coverage can never be created; today the reader only learns at create (`run-admission.service.ts:264`).

## Open

1. **BR-D4-1/2/3** above — until BR-D4-1 lands, IS start and holdout end are envelope values the reader trims; the card says so.
2. **Receipt on a stack that allows writes**: press preflight on the prefilled values plus reader-chosen interior boundaries and record the refusals the code path predicts (`RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE`, `RESEARCH_PREFLIGHT_DATA_UNAVAILABLE`). Not done here: preflight is a write on the preview.
3. **Timezone premise**: the month partitions are assumed to be named on the dataset's `source_timezone` (the clock the server applies to a naive boundary). True for the only live dataset (UTC); the catalog does not say it. BR-D4-1's UTC instants would remove the premise.
4. **Visual baseline and real-API lane** not run (G6, pinned image).
5. **`styles/tokens.test.ts` fails on the base** because of `AlphaImport.tsx` (S14/E6) — outside this scope.
6. The interior dates in the HiFi are demo data; if the owner wants them prefilled after all, that is BR-D4-2, not a frontend change.
7. Advanced-protocol prefill is built (both protocols share the envelope rule) but its usefulness is limited by BR-D4-3 until the 92-day admission fact is published.

## Files

- `apps/portal/frontend/src/research/runDraft.ts` — coverage plan, edges, pick semantics, provenance (pure); clone resets provenance. The serializer is unchanged.
- `apps/portal/frontend/src/research/NewRun.tsx` — pick handlers on the Data step, status line, Walk-forward note and captions, rail line.
- `apps/portal/frontend/src/research/coveragePrefill.test.tsx` — new, 33 tests.
- `packages/contracts/fixtures/research-preflight.dataset-catalog.valid.json` — new canonical fixture.
- `packages/contracts/test/research-preflight.spec.ts` — one contract test for the fixture.
- This record. Numstat: in the commit.

Rollback: revert the commit; the change is additive (an optional draft field, new copy, no contract or serializer change). No feature flag.
