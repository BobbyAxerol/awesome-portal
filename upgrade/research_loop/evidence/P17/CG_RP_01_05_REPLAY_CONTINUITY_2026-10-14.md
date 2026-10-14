# §58 — CG-RP-01…05: Replay continuity backend delivery

2026-10-14 · Codex · branch `docs/research-loop-plan` · Claude source/head
`0c1a6e42` preserved. Delivery SHA is the normal-hook commit containing this
receipt. Backend implementation/contract evidence only; **not** shared-preview
activation, a new engine run, FE/browser acceptance or release approval.

## Read chain and scope

Read root `AGENTS.md`, Research working rules A13, Unified §13/P17, the P17
guide, `P17/README.md`, `phase-report.md`, `debt-register.json`, W5b receipt,
`COMPLETE_WINDOW_EXECUTION_BACKEND_2026-10-07.md`, its Claude handoff/consumer
receipt, current-source contracts/producer/readers and queue §58. The approved
slice extends the existing authenticated, authorized, no-store read:

`GET /api/v1/quantbt/runs/{runId}/current-source/replay`

No new route, migration, profile, engine/worker change, permission, market-data
access, polling/stream, runtime restart or frontend source/design edit. Existing
IS/Holdout completed-custody readers and native journal are not replaced.

## Field → authority → consumer

All new fields are additive/optional in generated contracts for rolling-client
compatibility; the amended reader emits them. Type names below are
`components["schemas"][name]` in `generated/research-current-source.d.ts`.

| ID | Served block / generated type | Source and semantics |
| --- | --- | --- |
| CG-RP-01 | `execution.split_shape` / `ReplaySplitShape` | Exact retained recipe/profile/adapter identity **and** sealed optimizer disclosure. Mode5 = `SINGLE_FULL_WINDOW`, `FULL_SAMPLE`, `oos_applicable:false`, `independent_holdout:false`, exact one-window ordinal span. A singleton fold alone never establishes train=test. |
| CG-RP-02 | `replay.window_cursor` / `ReplayWindowCursor` | Existing run-global dense observation relation and signed workspace/run/revision/limit/direction-bound keysets. Forward/backward navigation can cross a fold; no engine read/recomputation. |
| CG-RP-03 | `execution.fold_capital.boundaries[]` / `ReplayBoundaryFact` | Adjacent sealed fold spans, parameter hashes, actual retained trial/study identities, source fold-account policy and prior ending equity/position. No frontend parameter diff or parsed trial identity. |
| CG-RP-04 | `replay.page` / `ReplayPage` | Replay-only ceiling **400 bars**, existing **1 MiB** response ceiling. Search/transitions/journal and other relations remain at their existing 200-row caps. |
| CG-RP-05 | strict Zod, OpenAPI, generation/check/snapshot, fixtures/tests | One source for new Zod fields; checked generator applies them to the named OpenAPI reader, with no unrelated schema widening. |

### Shape and identity rules

- `ordinal_basis:SEALED_ACCOUNT_OBSERVATION_ORDINALS` refers to retained model
  account observations, not wall-clock density or broker/global causal order.
  WFO preparatory bars can precede the published outer-fold spans; their fold
  owner remains null. No rows or folds are manufactured to fill that interval.
- Old seals without spans/protocol emit `NOT_PUBLISHED` with
  `REPLAY_SEAL_PREDATES_FOLD_SPANS` / `REPLAY_PROTOCOL_NOT_RECORDED`, not an
  invented singleton. Overlapping/duplicate/inconsistent spans fail closed as
  `RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP` (503).
- Mode5 legacy IS/OOS/Holdout selectors are explicitly `NOT_APPLICABLE`, reason
  `FULL_SAMPLE_CALIBRATION_HAS_NO_INDEPENDENT_SPLIT_WINDOW`. The full-sample
  span belongs to `split_shape`; it is never renamed held-out OOS/Holdout.
- Source seal, manifest, representation revisions, RC/Report pins and cursor
  resources are unchanged. This presentation addendum does not invalidate old
  publication evidence or old <=200-bar cursors using the same requested limit.

### Cursor rules

`next_window_cursor` is passed as **`cursor`**; `previous_window_cursor` as
**`before`**. They are not playhead `at` tokens. Response rows stay ascending
even when reading backwards. Keep the same requested `limit` for the cursor;
restart a page after changing limit/workspace/run/revision. Existing invalid,
wrong-direction, cross-workspace and changed-limit refusals stay enforced.

`crossed_fold_boundary` describes a boundary within the returned page **or**
between the incoming cursor anchor and its returned edge, including backwards.
`first_fold_id`/`last_fold_id` describe this page's edges. `next_fold_id` and
`previous_fold_id` own the immediately adjacent observation, so they can equal
the current fold; null can mean an unassigned preparatory row or no further page.
Use cursor/page flags to distinguish termination, not fold-id nullability.

If a response would exceed 1 MiB, the reader returns a shorter window with
`byte_limited:true` and re-mints cursors from the **returned** edges. It retains
the selected `at` row; no skipped ordinal and no second DB scan. Metadata too
large even for one row still receives the existing typed 503, not truncation.

### Boundary rules

`params_digest_changed` compares sealed selected-parameter digests only:
`comparison_basis:SEALED_SELECTED_PARAMETERS_NOT_RUNTIME_BINDING`. Missing
digest → null plus `RS02_SEAL_DID_NOT_RETAIN_SELECTED_PARAMETERS`. It is not
proof of the runtime child's binding, replay purity or strategy-code equality.

Both `previous_selection` and `selection` publish actual trial/study facts.
Missing study/trial remains null plus its typed reason. A synthetic centroid
has no actual selected trial (`SYNTHETIC_SELECTION_HAS_NO_TRIAL`). Global
selection adds at most one indexed trial lookup, not one per bar/fold.

| Source account policy | Equity | Position |
| --- | --- | --- |
| `carry_position` | `CARRIED` | `CARRIED` |
| `close_at_boundary` | `CARRIED` | `CLOSED_AT_BOUNDARY` |
| `reset_flat` | `RESET` | `RESET_FLAT` |
| absent/unknown | `NOT_ASSERTED` | `NOT_ASSERTED` + `QUANTBT_FOLD_CARRY_POLICY_NOT_PUBLISHED` |

Previous ending values remain exact decimal strings. `start_basis` is an
observational baseline, not a substitute for account policy. A reset does not
invent initial capital from the previous end value. Appending a chart does not
make segmented/reset accounts one continuously compounded account.

## Fixtures, tests and limits of evidence

- Canonical, explicitly **synthetic** fixtures:
  `research-replay-continuity.multifold.synthetic.valid.json` (different hashes,
  trial/study on both sides, cursor/cap) and
  `research-replay-continuity.mode5.synthetic.valid.json` (full-sample split).
  Neither is a new shared-preview run receipt.
- Focused backend: four files / **68 PASS**; after adding the full-reader Mode5
  case, Replay suite **24/24 PASS**. Contracts **4/4 PASS**, isolated contract
  source-copy guard PASS. Strict malformed/extra-field, carry/reset/close/unknown,
  same/different/absent parameter hashes and missing source identities covered.
- The retained real-HMD WFO fixture contains **1,056 observations**. Sequential
  400-bar reads, incoming boundary crossing, backwards round-trip, far seek and
  changed-scope/limit rejection use those retained facts, not an engine rerun.
  Large exact-decimal tests force the byte cap and prove contiguous edge cursors.
- A new authenticated API test repeats the cross-fold 400-bar/forward/backward
  checks on **disposable PostgreSQL**, retaining exact source identity. It runs
  with the normal root commit hook alongside the production build, contract
  regeneration check, restore and existing security/regression gates. Commit
  completion requires that ordinary hook; no skipped/bypassed hook.
- An exploratory API-wide `tsc --noEmit` includes historical test scaffolding
  and is **not clean** (unrelated mock/type/import.meta diagnostics). No claim
  of that check passing; the repository production build excludes tests and
  remains a required normal-hook gate. Do not expand §58 to repair those tests.
- No new load/engine/DR run or frontend visual matrix: source storage, compute,
  restore protocol and UI are unchanged. This delivery does not declare Claude's
  new field mapping or Mode5 positive browser lane accepted.

## Handoff to Claude — preserve the approved chart

1. Read queue §58 plus this addendum and earlier P17/WEX handoffs; regenerate
   `npm run generate:research-current-source` in `packages/contracts`.
2. Read `execution.split_shape` for Mode5/full-sample vs fold windows. Never infer
   shape from `segments.length`; old omitted/absent fields keep a plain truthful
   fallback. Do not label Mode5 held-out. Keep existing completed-run access rules.
3. Only when play-across-folds is selected, continue with `window_cursor` using
   the query mapping above. Append by global ordinal, preserve each `bar.fold_id`,
   refuse gaps/revision changes, and support backwards. Do not reset at fold N+1.
4. Separators use `boundaries[]` and its null/reason facts; do not diff params,
   parse trial ids or infer carry from equal equity. A missing boundary fact
   stays a plain separator without a financial/selection assertion.
5. Read `page.max_bars`; actual row count can be smaller (`byte_limited`). Use
   cursors/flags, not `rows.length === limit`, for continuation. Server cap400
   does **not** increase the existing client trail bound <=600 or permit
   preloading/requests while play-across-folds is off. Retain clipping and the
   approved components/layout/marker system.
6. Use the published fixtures directly; test forward/back, crossing inside a
   page and at an incoming edge, Mode5, legacy absence, same/different params,
   unknown policy and byte-limited windows. Supply an affected product-browser
   receipt after a separately authorized API/web preview rebuild. No baseline
   re-record or runtime activation is required/authorized by this backend slice.

## Resource closeout

Only the normal test scripts' exact disposable DB/container/network are created;
their trap owns teardown, including failure. No preview stack, engine job,
credential, market data, image or business volume is created/deleted by §58.
Pre-gate root free space ~160 GiB/621 GiB (~25%); no disk-intensive app build.
Post-hook read-only capacity/owned-resource snapshot is required before handoff.
No broad pruning, cache/data cleanup, runner restart or volume deletion.
