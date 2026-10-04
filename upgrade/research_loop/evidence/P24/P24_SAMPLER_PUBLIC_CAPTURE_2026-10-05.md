# P24 — real public sampler invocation capture

Date: 2026-10-05 (Asia/Saigon). Baseline: `99de587e`, backend lane
`codex/be-gaps`. Bobby approved completing the sample and sampler scope; this
packet covers the Python producer/retention implementation, not a production
release or a claim that old seals contain new observations.

## What is now captured

The isolated, serial QuantBT child observes the **actual** Optuna public API
calls on the effective sampler instance. Each original method runs exactly
once; its class identity, return, exceptions and RNG draws remain unchanged.
The observer uses `optuna.create_study` and public `BaseSampler` methods, not
private TPE internals, a vendored engine, a protected strategy edit, or trial
ordinal heuristics.

Source locators:

- `quantbt.walkforward.WalkForwardEngine.optimize_params`: the exact native
  `study_id` argument is observed before study creation. Unknown source scope
  remains `null`; local `observer_study_index` is explicitly observer-owned.
- `optuna.create_study`: the actual effective sampler/pruner class and study
  directions, with no inference of effective constructor defaults.
- `before_trial`, `infer_relative_search_space`, `sample_relative`,
  `sample_independent`, `after_trial`: actual call kinds, counts, numeric
  distributions and returned proposals, source trial number, UTC observation
  timestamps and terminal outcome.
- `research_child._run_delta_wfo_study`: restores both sampler and existing
  progress hooks in `finally`, then writes a **new-run-only** source artifact.
- `CurrentSourceArtifactAdapter.export_advanced_walkforward`: validates the
  source before the ordinary P05 lease/fence seal. A foreign or incompatible
  trace fails closed with `RESEARCH_CURRENT_SOURCE_SAMPLER_TRACE_INVALID`.

Wire scope: `OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY`.
Schema: `research.sampler-public-observer.v1`.

This does not claim posterior densities, likelihood ranking, startup/random
phase, internal candidate scoring or constructor parameters that the engine
did not publish. The original internal-trace absence is still truthful and
distinct from the new **available execution observation**. Historical seals
are not rewritten, guessed or filled from ledger rows.

## Bounded custody

- Source file: `wfo/sampler_public_trace.v1.json`.
- P05 immutable document: `source_sampler_public_trace`.
- Retained read source: `source_facts.search.sampler_trace`.
- Full capture: at most 400 trials, 16 studies, 32 numeric parameter names per
  study, 256 KiB canonical JSON. Unsupported observation or exceeded bounds
  is explicitly partial and cannot change the optimizer result.
- Public retained summary: at most 8 sample trials / 8 KiB. First/last samples
  keep their native identities; omitted sample count is explicit and separate
  from capture completeness.
- The source repository's contained-path and durable atomic writer produce
  compact canonical bytes. The P05 document bytes, digest and size are **the
  same** as the source capture, not a hash of a differently formatted file.
- Full source trace participates in `source_transform_digest` and normal P05
  manifest custody. Absent old source trace does not change old transform
  identity or create a synthetic new document.

## Focused verification

```bash
PYTHONPATH=apps/portal/backend/src:apps/portal \
  /home/bobby/portal-research/apps/portal/.venv/bin/python -m pytest \
  -c apps/portal/backend/pyproject.toml \
  apps/portal/backend/tests/test_research_sampler_trace.py \
  apps/portal/backend/tests/test_research_progress_w2.py -q
```

Result: **44/44 PASS** (14 sampler / 30 existing progress cases).

1. Installed Optuna **4.8.0**, real seeded `TPESampler`: 12 actual trials with
   exact baseline/observed equality of every parameter, objective, state and
   native trial number. Effective sampler class is unchanged.
2. Real `ask`/`tell` path and unknown native study scope: captured calls, no
   invented scope.
3. Original prune/failure exception and terminal outcomes are preserved.
4. Unsupported categorical observation is typed partial; study still runs.
5. Actual public `RandomSampler`, 400 trials / 8 numeric parameters: every
   source trial is retained, including 399; full file and summary stay within
   bounds. This is a **public-API budget test**, not a QuantBT market-data run.
6. Real P05 writer/seal verifies source bytes exactly equal retained document
   bytes; manifest document SHA-256 / size equal the public summary values.
7. Foreign run, incompatible/extra fields, changed invocation census, bad UTC
   timing, nonfinite numeric strings, unknown method, foreign study scope and
   boolean observer identity are rejected before retention.
8. Existing QuantBT callback/progress restoration and counts remain intact.

A mistaken first invocation of the helper script selected its whole default
test directory. It was stopped, is **not** a gate/PASS receipt, and was replaced
with the exact focused command above. No load/DR/full engine suite was repeated
to close this Python implementation.

Actual HMD child → P05 → source-block TS projection has now passed in the root
integration lane:2fold/3trial/36calls, exact2596-byte retained document custody.
[Combined closeout](./P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md) records
the source hash, native sampler/pruner, inputs and exact acceptance scope.
Focused tests alone are not a product runtime receipt or old-seal backfill.

## Handoff and resource scope

Root owns the generated TS contract and same-origin Search consumer; display
the new exact execution observation without renaming it a TPE-density trace.
No class/default/config fact may be backfilled into historical sealed runs.

This agent started no container, test actor, engine service or public listener;
all test artifacts were disposable pytest directories. Read-only capacity
snapshot: `/home/bobby` and `/tmp` share a 621 GiB filesystem with 171 GiB free
(27%); `NO_ACTION_NEEDED`, no prune/volume deletion. No stage/commit/push by
this agent; root performs the normal grouped gate and owned-file commit.
