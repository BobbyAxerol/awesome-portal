# QuantBT Backtest Portal Prototype

An internal, audit-first portal for running and presenting QuantBT strategy
optimization and backtests. The first strategy is the protected Delta-RSI
research kernel in `strategy/main.py`.

The prototype now includes the calculation backend, run service and interactive
analysis workspace. See
[`implementation_plan_protoyype.md`](implementation_plan_protoyype.md) for the
domain protocol, architecture, UI specification and phase gates.

## Repository Policy

- `main`: reviewed release baseline.
- `dev`: active portal development.
- QuantBT is consumed through its public API and is not modified here.
- Market data, credentials and generated run artifacts are never committed.

## Backend Development

The backend uses the published `quantbt-engine==1.0.8` package from PyPI with
its `optimization` extra; it does not require a sibling QuantBT source checkout.
For the integrated deployment, run `../../scripts/portal up` from the parent
workspace rather than starting the frontend and backend separately.

```bash
./scripts/test_backend.sh
./scripts/smoke_quantbt_pypi.sh  # synthetic data; no market-data service needed
./scripts/run_backend.sh
```

`smoke_quantbt_pypi.sh` confirms that the imported `quantbt` package belongs to
the installed PyPI distribution, then runs the deterministic fixture through
three-window, Advanced Walk-Forward, API and artifact use cases. It is the
pre-server-migration compatibility gate; it does not replace a later web UI run
with real market data.

The API binds to `127.0.0.1:8000` by default. OpenAPI is available at
`http://127.0.0.1:8000/api/docs`.

Start the complete local workspace in one command:

```bash
./scripts/run_dev.sh
```

Then open `http://127.0.0.1:5173/?new=1` to configure a run. The configuration
workspace exposes data windows, typed parameter ranges, WFO mode/schedule,
selection controls, account sizing, canonical one-way fee, slippage, funding
and pyramiding before preflight.

Important read APIs include:

```text
GET /api/config/options
GET /api/runs/{run_id}/config
GET /api/runs/{run_id}/ledger
GET /api/runs/{run_id}/wfo/{folds,trials,candidates,parameters}
GET /api/runs/{run_id}/presentation/{calendar,rebased}
GET /api/runs/{run_id}/series/{is,oos,holdout_live,stitched}
```

The trial ledger contains unique Optuna search trials. OOS candidate replays
remain a separate collection, so optimization counts and selection evidence do
not double count the same `trial_id`.

## Frontend

```bash
./scripts/run_frontend.sh        # Vite dev server on 127.0.0.1:5173, proxies /api -> :8000
```

Build and unit tests:

```bash
cd frontend
npm run build                    # tsc -b && vite build
npm test                         # vitest (format helpers)
```

Playwright visual gate (screenshots + blank-canvas/console check at
1440x900 / 1280x720 / 390x844) — run after a completed run exists:

```bash
cd frontend
npx playwright install chromium   # once per clone
RUN_ID=<run_id> npm run preview -- --port 4173 &  # or `npm run dev`
RUN_ID=<run_id> PORTAL_URL=http://127.0.0.1:4173 node e2e/screenshots.mjs
```

## End-To-End Smoke

1. `./scripts/run_dev.sh` starts backend and frontend together.
2. Open `http://127.0.0.1:5173`, configure a Three-Window run, preflight, Run.
3. Watch the SSE stepper + structured log, then review Overview → Optimization
   → Parameters → Execution → Audit. Export bundle from Audit / top bar.

Access from a remote machine without public exposure:

```bash
ssh -L 8000:127.0.0.1:8000 -L 5173:127.0.0.1:5173 <user>@<vps>
# then browse http://127.0.0.1:5173 locally
```

See `implementation_plan_protoyype.md` §22 for the hardening gates that must
pass before any public-IP deployment (auth, TLS, CORS, rate limits).

## Market Data

The default dataset source is `crypto-binance-1m`. The API accepts a Binance
futures symbol and target timeframe, then delegates to the canonical
`CryptoBinance1m.load_resampled` DuckDB path under Pool Alpha. It does not copy
market files or expose their server-side location.

```bash
PYTHONPATH=backend/src:. .venv/bin/python \
  scripts/smoke_crypto_market_data.py --symbol ETHUSDT --timeframe 1h
```

The current ETHUSDT 1h smoke loads 57,914 bars in about one second. The exact
timing, date range, missing-bar count and content hash are emitted by the
script. Set `PORTAL_DATASET_MANIFEST` only when a fixed manifest-backed dataset
should override the dynamic crypto provider.
