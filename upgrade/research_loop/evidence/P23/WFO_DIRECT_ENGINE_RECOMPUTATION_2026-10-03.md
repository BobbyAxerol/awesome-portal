# V11-P23-DR — independent WFO recomputation

2026-10-03 · Codex · **SCOPED_PASS**, not full P23/P24 or deployment GO.
Continuation of [the mixed-load/manifest receipt](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md#9-next-boundary--claude-handoff).

## Actual engine → retained bytes → named BFF

At **08:40:41.287–08:40:47.597 UTC** (15:40 Asia/Saigon), the owned :8096
cell ran published **QuantBT 1.1.1** directly against the exact real P08
snapshot used by run `rrun_c3bc2113431102c1715a9d6d28d7b2bf`.
The worker was OFF. This is an independent computation, not merely reading
the retained result or invoking the production Portal runner again.

| Input / pin | Actual value |
| --- | --- |
| Dataset / symbol / interval | `crypto-binance-1m` / `BTCUSDT` / `1h` |
| Window | 2026-06-01 to 2026-09-01 exclusive; weekly expanding WFO, split 2026-06-08 |
| Profile | builtin Delta RSI, signal-notional, global mode-1-decay, 3 trials, seed 42 |
| Snapshot | `dss_88b246f4e852e4ba3493026cc0ec048b` |
| Snapshot byte SHA-256 | `8f3aae9217d77eeae6ec1f8c87d18358b3acae12bb95e5ee8abee9c7fdef110d` |
| Artifact | `rart_b0ebb6b61bc853b98a0b84ccadf27c07d3ed5091` |
| Manifest byte SHA-256 | `6e6ef7547f247f2ee6c9e87da8ca672159f6f6658abe1f03e08bdaac4f277ccc` |

`wfo-direct-oracle.py` verifies manifest/document/Parquet/native-bundle hashes,
exact source bounds and the image-owned strategy declaration before calling
`QuantBTEndpoint.walk_forward`. It imports no Portal runner, configuration
mapper, retention serializer, analytics or optimizer implementation.
The configuration is reconstructed from the hashed native configuration.
Seeded Optuna consumes ranges in **strategy declaration order**, not sorted
canonical-JSON key order. Every sealed range must match that declaration.

Results:

- **2,208 / 2,208** accounting-equity and UTC-ms time rows agree exactly.
- Six native `full_report` metrics agree: initial capital, final equity,
  number of trades, Sharpe, Sortino and max drawdown percent.
- Fold/trial cardinalities are **13 / 3**; selected parameter map matches the
  engine's best-trial map. This does not claim comparison of every trial
  objective, intermediate study or every fold field.
- Four named Evidence BFF metrics agree, with no numerical tolerance:
  initial equity `20000`, final equity `20301.191723679167`, net return
  fraction `0.01505958618395835`, max drawdown fraction
  `-0.016702041792833078`. Numerical differences are all **0**.
- Public net return uses the documented exact Decimal endpoint ratio, not
  the rounded binary64 percent from `full_report`. No metric is coerced to
  JS Number; only redundant decimal trailing zeros are normalized.
- Observed oracle-process peak RSS **306,532,352 bytes**; CPU 120-s, 16-MiB
  file, 128-FD and 2,208-bar bounds. This is not a full-cell peak measurement;
  the earlier mixed-load receipt measures the full seven-service cell.

## Immutable private receipt and failures

Private 0600 root remains
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
No private JSON body, raw strategy/tape, credentials or cookies is committed.

| Private file | SHA-256 / disposition |
| --- | --- |
| `wfo-direct-rrun_c3bc2113431102c1715a9d6d28d7b2bf-exact-decimal.json` | `a33873b8998c069628e3e127c701c9d4e2e65ed2f9c02ea15c91482e265eb881` · PASS |
| `wfo-direct-rrun_c3bc2113431102c1715a9d6d28d7b2bf-diagnostic-byte-diff.json` | `5a6277cab3fa319bd4e5e9b330a56bfb05733b75778dafa37d3cf7ea1df3d18d` · rejected oracle range ordering |
| `wfo-direct-rrun_c3bc2113431102c1715a9d6d28d7b2bf-declared-order.json` | `8db821e731fb9a6858fd18b8971ec7b0258a0f55fb3f30c3298d09a32148db4a` · rejected oracle float-ratio formula |

The two diagnostic failures were harness defects, not accepted product
passes. The first mismatched equity at ordinal 279 because sorted range
keys changed seeded sampling; the second matched raw equity/native metrics
but used the wrong public-return formula. Both remain archived. The final
oracle fixes configuration binding/formula, never source values or tolerances.

Runtime uses the unchanged [clean image set](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md#5-clean-candidate-and-exact-immutable-image-set),
identity byte hash `ca1bede1dd0bfda304ab40f3c7c127d848c77f5b6e3954a00b66bf45b2c4d979`.
The script hashes and exact source/API revisions are in the private receipt.
No image rebuild, new admission, seal, manifest rewrite, migration or source
write occurred. Re-run only if this profile's dependent input/code changes:

```sh
node scripts/research-p23/wfo-direct-parity-receipt.mjs --label=accepted-new-label
```

The label must be new; the harness refuses overwriting any previous receipt.
This closes **independent WFO recomputation for this admitted profile**.
It does not close a second-engine upgrade or full frontend acceptance.
Next packet: [P24 rollback / full gate matrix](../P24/V1_ACCEPTANCE.md).
