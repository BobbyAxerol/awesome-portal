# Frozen qualification — multi-cycle native Limit/OCO optimizer

2026-10-08 · Bobby-approved §51 · PRODUCT_RUN_QUALIFIED for the exact recipe
below, not P24/release/owner-visual acceptance. This file is immutable once
referenced by migration 126; subsequent runtime/consumer receipts live elsewhere.

## Identity and authority

- Additive profile: `p10.delta-event-driven-limit-oco-search-1h.v1`.
- Alpha: `av_delta_rsi_polynomial_alpha_1_0_13`; protected Delta kernel unchanged.
- Profile digest: `2b69015b8975e3097cc797999188a6d6b75e29ce52fc3ad2d4c35026ab7f0d73`.
- Base source: `4ca279b19cbd9c72baff358ac45dc6ddccdd6a1a` plus owned dirty
  source, whose tracked diff SHA and every untracked source SHA are captured in
  each private receipt. Normal commit/landing follows the final runtime proof.
- Exact owned project: `portal-research-p23-ol12`, loopback 8096; no shared
  preview, production, dev, main, source data or business credentials mutated.
- Actual Control API image:
  `sha256:d834988ed723e82a8eaafa7698cb0fb5005ce61df54dd19ac9fc53527ca597aa`.
- Actual Portal API/isolated-worker image:
  `sha256:cfc44bb00b2b94b814e6a3b8d6cdb759260c16b23f4edc1f84ea05fe89c38480`.
- Pinned installed QuantBT 1.1.1, HMD read-only mount, native event-driven
  matching/accounting, serial public GenericEndpointEvaluator/Optuna optimizer
  and CandidateSelector robust plateau. No scalar surrogate or fabricated fills.

## Runnable scope

2–400 requested real trials (default 100), seed 42, Delta declared numeric
parameter space, no caller overrides/pins. Mode 4/global names the IS-only
intent; `QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1` explicitly names
the actual native selector, **not** the scalar WFO Mode 4 algorithm.
Optional early stopping remains explicit/null by default; these proofs used
null and completed/retained all 100 requested trials.

48-bar causal cycles, 24-bar Limit-entry expiry, known close signal/price,
next-bar activation, parent-full-fill SL STOP_MARKET / TP LIMIT OCO,
end-cycle expiry/cancel and engine reduce-only close before next entry.
No trading decision consults a future high/low or future fill.
1h BTCUSDT/ETHUSDT/SOLUSDT, 365-day admission span cap; the proof range is
90 days, not a claim that every span/trial count has been stress-tested.
Caps: 1,800 CPU seconds, 3,600 wall seconds, 4 GiB child memory, 512 MiB
scratch; one trial worker at a time, existing host/container limits preserved.

Real dataset `crypto-binance-1m`, 1h aggregation, explicit UTC end-exclusive:
IS 2026-06-01→2026-08-03 (63 days), OOS 2026-08-03→2026-08-21 (18 days),
declared Holdout 2026-08-21→2026-08-30 (9 days). IS has 300 predecessor
warmup bars. Selection sees warmup+IS only. Final selected realization sees
IS+OOS only; Holdout remains typed `NOT_PUBLISHED`, no rows or cursor.

## Ordinary product results (not direct engine tests)

Existing admin installer → new authenticated preflight → ordinary create →
confined child → P05 seal → Progress/Evidence/Split/current replay reads.
All named readers returned 200; terminal status is COMPLETED/READY.

| Symbol | Run | Trials/distinct | Parent cycles | Orders/fills | OCO fill+sibling-cancel pairs | Lifecycle rows |
|---|---|---:|---:|---:|---:|---:|
| BTCUSDT | `rrun_89c83c64caa0be6bc53559b2ecb5517f` | 100/98 | 21 | 84/42 | 13 | 231 |
| ETHUSDT | `rrun_ed6b16f4a6e5f38209add83002a81400` | 100/97 | 15 | 60/30 | 7 | 165 |
| SOLUSDT | `rrun_73d5472ef536a7a24025bb80c0ed4d4c` | 100/99 | 16 | 64/32 | 11 | 176 |

Selected engine trial numbers are 41, 69, 40 respectively (engine 0-based
identity, not display ordinal). Full 100-row populations contain actual
parameters, objectives, metrics and engine metadata; selected row matches
the public summary exactly. Detailed execution journals are the selected
realization, **not** 100 separately created product runs. Both IS and OOS
ORDER/COMMAND/LIFECYCLE/FILL reads exhaust opaque cursor pages (8 per run,
≤200 rows and ≤1 MiB each). Every child binds to an actual parent/OCO ID,
on-parent-full-fill activation; no observed sibling pair both fills.

## Receipt/byte custody

Private root (0600 files, not committed market data):
`/home/bobby/.local/state/portal-research-p23/20261008/expanded/`.
Runner: `scripts/research-p23/native-limit-oco-search-receipt.mjs`.

| Symbol | Receipt basename | Receipt SHA-256 | P05 manifest SHA-256 | 100-row retained part SHA-256 / bytes |
|---|---|---|---|---|
| BTC | `native-limit-oco-search-btcusdt-100-4.json` | `79ea635ccd7862030a499c345dbd9ec5747c931f98ddae086db1076c29e069c5` | `3a11fbeba0eb573faca7549a72aed48fca0236996e975fd713f3c1db54a596eb` | `a0dc7bd3bed6cd7eb8acfdad5d631c271a2359d677bf9a3c8a63c0514c7e109a` / 17,267 |
| ETH | `native-limit-oco-search-ethusdt-100-1.json` | `d533172b893c2277a5e7c44efa5eb2bdd9b8f71952d8bc963967d5c5b23378a0` | `c4cc3f4d066d3296736c9a69915ef26bdd92ed8291a508043bb5f3f0e90aa073` | `60b9479fc8eb855187a8162cd2c3e47ffa1d05adf3c2c2a9f8df686c8a51bdb5` / 16,896 |
| SOL | `native-limit-oco-search-solusdt-100-1.json` | `7b18a10cab19bba07c789fb0f3b498b08b70c751770473df2702996693b87745` | `ad9e208cc46a04422f883627f28351f8a249a4a4f5cefe0da9943feb478bdf4e` | `0c2189dadb7de3dec9b25c3234362feb95f19d992d98f3a6b43db783f5fc43e1` / 17,295 |

Source-child Parquet hashes (different from P05 reserialized part hashes):
BTC `71f2241fd827388ea9f5adb5b1260184800fc8e012d0e74ac175920388f8dbb3`;
ETH `fefca0b844a78cb11fe46403f36c94c1e13a0ae74691755282ba2d8b6db23f14`;
SOL `72bccbf3ef75c4c12315762688c6712ad9bbd0f904fe419ae74a52c09d2f654f`.
Original child bytes are verified before retention; P05 parts have their own
bytes SHA. The two hashes are not falsely asserted equal.

## Real defects found, repaired and preserved

The initial BTC request lacked the baseline first-trial parameter payload
(upstream 422); the exact owner API cancelled that intake. Two later attempts
completed the engine but failed terminal materialization because fixed-report
assumptions/public Split did not recognize native optimization. Their FAILED
history and retained bytes remain intact. Fixes publish the native Split state,
avoid an incorrect fixed trial-1 handoff, and treat only the dedicated typed
native `RESEARCH_REPORT_NOT_READY` as non-applicable; untyped/errors still fail.
The final successful proof above is a new ordinary run, not rewritten history.

## Honest consumer limits

Progress/Evidence publish `native_execution.optimization`; Split publishes
`NATIVE_OPTIMIZATION_SEALED_SEPARATELY` with the same native summary. Old scalar
Search/Freeze return typed NOT_APPLICABLE, not fake fixed/scalar WFO trials.
No dedicated native optimizer S06/S07/full native Report consumer is claimed;
the full population is sealed in P05 and the exact summary is public. No
Holdout execution, broker lifecycle authority, profitable-strategy guarantee,
P24 matrix/release acceptance, production rollout or compaction is claimed.

The original fixed Limit/OCO binding/descriptor and frozen qualification packet
remain unchanged. Only the additive exact recipe may receive product authority.
