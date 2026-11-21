# Bracket V4 — exact ordinary-product qualification

Immutable qualification receipt, 2026-10-07. This is a versioned sizing
correction, not a replacement of an existing Alpha or historical profile.

- Base checkout: `eeb3ba20f1c2f11233b924bef7edb6e7418ff36d`, dirty candidate.
- Profile: `p10.delta-intrabar-bracket-fixed-1h.v4`.
- Profile digest: `b6a17c962f64c462fd7db2859160f2ef37547903e0084d00694ecc8dea5e20f0`.
- Recipe digest: `528bb56b03e05646ab3403b01080ca1d0406c0cb1bf4752469e0293ccd47e07a`.
- Native adapter SHA-256:
  `b0188dcf18d2678a509d1738f78134ad32be421180b5dd05576cfdcfc0205cb2`.
- Bound Alpha: `av_delta_rsi_polynomial_alpha_1_0_9`; installed engine
  `quantbt-engine==1.1.1`. No strategy kernel edit or new Alpha identity.
- Isolated stack: `portal-research-preview`, loopback `:8095`, read-only
  `crypto-binance-1m / BTCUSDT / 1h` historical data.

## Product receipt, not a direct engine test

Authenticated P08 preflight → P10 ordinary create → confined worker child →
P05 immutable Parquet/seal → typed window and execution-record GETs.
One exact candidate qualification override admitted this profile only.
No production, command plane, market data, users or existing seals were changed.

Run: `rrun_7b87e80e7dd7f7991dd0394fe889c714`, `COMPLETED`, materialization `READY`,
receipt at `2026-10-07T13:50:22.561Z`.
Private packet:
`/home/bobby/.local/state/portal-research-p23/window-execution-20261007/intrabar_bracket-final/`.
The packet's early `identity.json` is a stale preview-script stamp; it is not
used as OCI proof. Live container inspection before subsequent rollout names
Control API `sha256:541461295b9e3854bc343f18d69e97fc41ce352cdcacca2dc0dfab1564e34283`
and portal-api/worker
`sha256:739e5b30919e4e997f2433f3541c87e300b836fc0501ff803cd0b5723336ce54`.
The final window/execution acceptance packet independently captures live OCI
IDs after rollout, rather than reusing the stale stamp.

| Read | Actual source fact |
|---|---|
| IS | 168 observations; AVAILABLE, 25 descriptive metric facts |
| OOS | 168 observations; AVAILABLE, 25 descriptive metric facts |
| Holdout | NOT_PUBLISHED / FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT |
| Execution journal | Two retained `result.fills` rows |
| Entry | BUY, UTC ms `1781280000000`, price `63557.1`, quantity `0.03146776677979329` |
| Exit | SELL, UTC ms `1781470800000`, price `65209.5846`, same quantity, `take_profit` |

Window companion revision:
`870ee5b5d65864c1adc1a9a4f1183d7646c22a66264952e890fa4808f9446aff`.
Prices, quantities and fees are source decimal strings; clocks remain the
engine's known-close/next-bar intrabar clock, not broker wall-clock events.

V3 sized the input as contracts without the engine's fixed-notional metadata,
silently yielding zero executions for this tape. V4 uses the same protected
Delta signals with the declared `2000` fixed-notional public engine sizing.
The original adapter remains byte-identical:
`24648f971c22f8018c0a04810201d7b1d8ee1ea60614d37b936d79a41df6db5d`.
V1–V3 descriptors, qualification receipts and historic results remain intact.

## Qualification bounds

PASS is for this exact profile and real BTCUSDT/1h product run. It is not a
claim that every symbol/parameter/tape has positive fills. Fixed native
profiles currently execute IS/OOS, not the declared Holdout. This engine
intrabar facade publishes fills and exit reasons but not a full independent
order/OCO lifecycle journal; missing facts remain typed NOT_PUBLISHED.
The follow-up acceptance exercises normalized fill aliases, order-relation
absence and normal qualified admission with the temporary override removed.
