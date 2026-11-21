# V11-P23-DR — one real Delta direct/retained/API parity receipt

2026-09-29 · Codex · `docs/research-loop-plan` · **SCOPED PASS; P23 OPEN**.

The isolated `portal-research-p23-ol12` cell at loopback :8096 was read-only
for this check. The owner-bound Evidence GET returned 200 and
`AVAILABLE/COMPLETE`. A direct call to the installed `quantbt-engine==1.1.1`
public `QuantBTEndpoint.signal_notional` ran over the exact immutable P08
snapshot, using the sealed P04 Delta parameter map and the sealed OOS-end
boundary. This did not call the Portal `QuantBTGateway`, launch a new job,
read a browser fixture, or write market data.

| Pin or fact | Actual value |
| --- | --- |
| Run / installed adapter | `rrun_d8e174e6268aedbf868de56edd062b29` / `p04.delta-rsi.v1` |
| Engine / current isolated Portal API image | `1.1.1` / `sha256:b4f23edda66d075bf024e02e9b9f74a7d711ea590a16b93f3718acb143615db2` |
| Dataset / instrument / interval | `crypto-binance-1m` / `BTCUSDT` / `1h` |
| Source content / source manifest | `9b17eefb9f95b4920e89d1b8998a021da87080d32168fd873b5ab6d00ee6019d` / `f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47` |
| Immutable snapshot | `dss_830094e5ae84e29b36d613cbb2ff30b2`; verified Parquet SHA-256 `42ccef20ff66a19d219ba1aeb9355923f1e60c04a7e09851fa96e32c022368b3` |
| Window / row boundary | 684 snapshot bars, 636 child IS/OOS bars before `2026-06-15T00:00Z`; sealed Holdout excluded |
| Sealed artifact | One successful completed attempt; request, dataset binding and Evidence source blobs rehashed before comparison |

| Exact metric | Direct engine | Sealed source | Owner BFF | Difference |
| --- | ---: | ---: | ---: | ---: |
| `FINAL_EQUITY` | `20130.193634373325` | `20130.193634373325` | `20130.193634373325` | `0` |
| `TRADE_COUNT` | `4` | `4` | `4` | `0` |
| `BARS_PROCESSED` | `636` | `636` | `636` | `0` |

The BFF marks all three metrics `ENGINE_DIRECT` and binds the same run and
engine version. This is exact numerical parity for these three facts of **one
real P04 Delta run**, not proof of every Evidence series, WFO mode, browser
chart, benchmark, other dataset, or all V11-P23-DR workload windows. The
existing P04 HMD direct-data receipt remains a separate source-loader check;
this receipt proves the persisted snapshot → direct engine → sealed source →
owner API path. Do not turn this into a full P23/P24 verdict.

The reproducible probe is
[`scripts/research-p23/direct-parity-receipt.mjs`](../../../../scripts/research-p23/direct-parity-receipt.mjs).
Its focused tests pass 3/3, including changed sealed-source/BFF value,
foreign run and typed absence refusals. The private 0600 receipt is
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/v11-p23-direct-parity.json`,
SHA-256 `0ac7a8fff07a6d312bbef3e5ae6e809793e45b288772ad34ebc753a820685122`.
No credential, raw candle or private response was committed. W06's two
clean-image passes remain separate; no SLO relaxation was applied.
