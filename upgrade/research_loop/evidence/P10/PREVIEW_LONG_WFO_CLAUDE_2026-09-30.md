# P10 · Preview-only long Delta WFO (Claude, 2026-09-30)

Owner approval: Bobby, 2026-09-30 — "a PREVIEW-ONLY way to run the Delta
walk-forward (WFO) profile with up to 400 Optuna trials, so the
research-portal preview can hold a long, data-rich run. dev/main behaviour
must not change."

Branch `claude/preview-long-wfo` from `6ac69315`. One commit.

## Why

The locked W1 §1.1 profile (`p10.delta-signal-notional-wfo.v1`) runs exactly
3 Optuna trials under a 120 CPU-s / 240 wall-s child. That is enough to prove
the lane, but it gives the preview screens (search surface, trial ledger,
parameter frequency, importance) almost no data. A long study needs a larger
trial count *and* a larger child budget. It must never reach dev, stable or
production.

## The flag and its guard

| Side | Key | Default | Refused unless |
|---|---|---|---|
| Control API | `FEATURE_RESEARCH_PREVIEW_LONG_WFO` (env `CONTROL_API_FEATURE_RESEARCH_PREVIEW_LONG_WFO` in the preview overlay) | `false` | `AUTH_MODE=dev` **and** `PORTAL_ENV=local`, and `FEATURE_RESEARCH_WFO_PROFILE=true` — `loadConfig` throws at startup |
| Python worker | `PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO` | `false` | `PORTAL_ENV=local` — `delta_wfo_preview_long_enabled()` raises `DeltaWfoPreviewLongMisconfigured`; every WFO job then fails with a named reason, never a silent fallback |

Both flags are wired only through `deploy/research-preview/compose.research-preview.yaml`
(default `false`, and the worker gets `PORTAL_ENV: ${PORTAL_ENV:-research}` so a
missing value refuses) and added to the env template in
`scripts/research-preview/preview.sh`. No other compose file, the dev stack or
any production overlay sets them.

## What changes when the flag is on

| Concern | Off (unchanged) | On (preview only) |
|---|---|---|
| Admission `optuna_trials` | exactly 3 — "The Delta walk-forward profile runs exactly 3 Optuna trials." | integer 2..400 — else "The preview long walk-forward profile admits 2 to 400 Optuna trials." |
| `random_seed`, route, schedule, timeframe, span, folds | locked | locked (seed ≠ 42 still refused with the old sentence) |
| Profile id / digest | `p10.delta-signal-notional-wfo.v1` / `b86c66fa…` | **same** — the requested spec records the real trial count; nothing fakes 3 |
| P06 job cost `cpuSeconds` | 120 | 1800 (`DELTA_WFO_PREVIEW_LONG_RESOURCE_PROFILE`) |
| Child limits | cpu 120 s / wall 240 s | cpu 1800 s / wall 3600 s (`DELTA_WFO_PREVIEW_LONG_LIMITS` in TS, `DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS` in Python; the P06 `validate()` range admits them only while the flag is on) |
| Child trial count | profile's 3 | receipt carries `optuna_trials` (2..400); the child's clean environment cannot see the flag, so the parent adds the key only when its flag admitted it |
| P11 journal / ingress CPU cap | 120 | 1800 |
| RS-02 seal `TRIAL` rows | 2..64 (Python export + Control API seal) | 2..400 |
| RS-02 current-source admission trial budget | 3 | the run's admitted count |

Why 2, not 1: the retained RS-02 lane seals at least two TRIAL rows and the
child asserts `trial_rows == optuna_trials`, so admitting 1 would queue a run
that can never seal. Candidates stay ≤ 64 (global schedule keeps the top 10 %:
40 of 400).

Preflight needs no preview ceiling: the release's published trial ceiling is
already 4000 and the P08 CPU estimate for 400 trials × 16 folds × 92 days of 1h
bars is ~142 CPU-s, far under its 86 400 ceiling. Inventing a lower preview
ceiling there would be a second, contradictory number.

## Read-side contract widening (applies everywhere, changes nothing observable off)

A sealed 400-trial artifact must be readable, and the progress `run_completed`
usage must carry up to 1800 CPU-s. The wire validators were widened; the
*writers* stay flag-gated, so with the flag off no stored value can exceed the
old bounds:

- `current-source.contract.ts` — `CURRENT_SOURCE_MAXIMUM_TRIAL_ROWS = 400` for
  evidence passport `trials`, ledger `source_trial_count`, fold-filter
  `matched_rows`, probe `pruned_trial_count`; `current-source.service.ts` reads
  up to that many TRIAL rows.
- `progress.contract.ts` — usage `cpu_seconds` wire max 120 → 1800; the
  per-profile cap in `progress.service.ts` still refuses a Delta WFO above 120
  (and P04 above 45) unless the flag is on.
- OpenAPI `research-current-source.openapi.json` / `research-progress.openapi.json`
  maxima + descriptions, regenerated `.d.ts`, `contracts-snapshot.json`.

One honest difference off: a worker that sends a WFO usage of 121..1800 CPU-s
used to be refused by the zod wire check; it is now refused by the per-profile
check. Same `400 RESEARCH_PROGRESS_INVALID`; the internal message differs. The
Python journal already clamps usage to the profile cap, so no installed worker
sends such a value.

## Tests

| Gate | Command | Result |
|---|---|---|
| New Control API spec | `npx vitest run test/research-preview-long-wfo.spec.ts` | 10 / 10 pass — flag off: 400 refused with the locked sentence, 3 admitted; flag on: 2/3/400 admitted under the same id+digest, 1 and 401 refused with the preview sentence, seed 43 refused; sentence→field map; `loadConfig` default off, refused without WFO profile, refused under Cloudflare auth (local and research); run-create cost 120 off / 1800 on; progress cap 120 off / 1800 on; seal TRIAL 65 refused off, 401 refused on, 400 reaches custody on |
| Touched Control API specs | `research-w1-wfo-profile`, `research-w4-preflight`, `preview-auto-login.config`, `research-w1-current-source-ingest`, `research-current-source.service` + new | 6 files, 80 / 80 pass |
| Control API build | `npx tsc -p apps/control-api/tsconfig.build.json --noEmit` | exit 0 |
| Control API full vitest (no DB) | `npx vitest run` | 927 pass / 17 fail / 416 skip — every failure is `ECONNREFUSED 127.0.0.1:5432` (disposable PostgreSQL lanes) or an absent `/services/...` container path; none in a touched file |
| Contracts package | `vitest run` in `packages/contracts` | 17 files, 197 / 197 pass |
| New Python tests | `tests/test_research_preview_long_wfo.py` | 8 / 8 pass, incl. a **real** namespace-isolated child through `DurableQuantWorker`: 65 trials, 65 live `trial_completed` events, budget cap `30.000` core-min, `run_completed` usage ≤ 1800, RS-02 seal with `TRIAL: 65` |
| Python backend full suite | `pytest backend/tests` (pool_alpha venv, quantbt-engine 1.1.1) | 735 pass / 4 fail / 8 skip — the 4 are environment-only (`nats` not installed; `test_m0_freeze` nginx conf digest + `portal-api` distribution version) and untouched by this change |
| Preview script test | `node --test scripts/research-p23/cell.test.mjs` | pass |

## Setting it on an existing preview

`preview.sh init` leaves an existing env file alone. On a preview whose env
file already exists, add both keys and recreate `control-api` and
`quant-worker-py`:

```
CONTROL_API_FEATURE_RESEARCH_PREVIEW_LONG_WFO=true
PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO=true
```

(`PORTAL_ENV=local` and `CONTROL_API_AUTH_MODE=dev` are already in the preview
template.) A run then asks for its trial count in `requested_spec.optuna_trials`.

## Not verified here

- A 400-trial run on real HMD data (only the 65-trial golden tape ran).
  The scheduler lease is capped at 300 s and the producer emits a heartbeat
  while the child is alive; a run that actually uses the 3600 s wall budget
  has not been observed end to end.
- Whether the New Run form lets a user enter a WFO trial count other than 3
  (frontend not touched).
