# QuantBT Backtest Portal Prototype

An internal, audit-first portal for running and presenting QuantBT strategy
optimization and backtests. The first strategy is the protected Delta-RSI
research kernel in `strategy/main.py`.

The backend is being built first. See
[`implementation_plan_protoyype.md`](implementation_plan_protoyype.md) for the
domain protocol, architecture, UI specification and phase gates.

## Repository Policy

- `main`: reviewed release baseline.
- `dev`: active portal development.
- QuantBT is consumed through its public API and is not modified here.
- Market data, credentials and generated run artifacts are never committed.

## Backend Development

The scripts reuse the parent Pool Alpha environment and prefer the sibling
QuantBT `src/` tree for local research. Set `QUANTBT_SOURCE_PATH` to override it;
an installed `quantbt-engine` package is used when no local source tree exists.

```bash
./scripts/test_backend.sh
./scripts/run_backend.sh
```

The API binds to `127.0.0.1:8000` by default. OpenAPI is available at
`http://127.0.0.1:8000/api/docs`.

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

1. `./scripts/run_backend.sh` — backend on `127.0.0.1:8000`.
2. `./scripts/run_frontend.sh` — portal on `127.0.0.1:5173`.
3. Open `http://127.0.0.1:5173`, configure a Three-Window run, preflight, Run.
4. Watch the SSE stepper + structured log, then review Overview → Optimization
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
PYTHONPATH=backend/src:. ../.venv/bin/python \
  scripts/smoke_crypto_market_data.py --symbol ETHUSDT --timeframe 1h
```

The current ETHUSDT 1h smoke loads 57,914 bars in about one second. The exact
timing, date range, missing-bar count and content hash are emitted by the
script. Set `PORTAL_DATASET_MANIFEST` only when a fixed manifest-backed dataset
should override the dynamic crypto provider.
