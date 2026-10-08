# BR-S02-21 — frozen Limit/OCO product qualification

Verdict: **PRODUCT_RUN_QUALIFIED / backend path only**, 2026-10-08 UTC.
This is the immutable qualification reference for the new recipe, not P24
owner/browser acceptance or a rollout of the shared preview/production.

## Exact input identity

- Profile: `p10.delta-event-driven-limit-oco-fixed-1h.v1`.
- Recipe digest: `99b29e57151d36005921ae4fa4af65dd1289d458fcdca25815ef529079f82d58`.
- Descriptor digest: `bd8fb94a6298ccc54278a8fe7e2cd707205721c52cda8adcbc9e51b5e49a2c88`.
- Alpha edition: `av_delta_rsi_polynomial_alpha_1_0_12`; protected kernel is
  unchanged. Adapter digest:
  `10453d3e2ab548371df4344c46601241501fff76e4fe109a0e3c91068a29b118`.
- Binding digest: `915da40aee3724cf17443b2027685ff5d9c29801ee332fa487aeca2e6e90f4b5`.
- Protocol: `DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1`, event-driven known-close /
  next-bar-close execution, QuantBT 1.1.1 accounting and matching.
- Fixed defaults: window 32, RSI length 20, signal length 9, ATR lengths 10/42,
  rvol 1.6, volume length 16, SL 1.3%; TP is twice the SL distance.
- First non-flat protected Alpha close after 300 warmup bars issues one LIMIT
  entry at that known close. No source signal means no invented entry.
  Notional 2,000, capital 20,000, leverage 3, fee 0.0005 per side, funding off.
  Entry expiry is bounded to 24 bars; SL/TP use actual parent-full-fill
  activation, reduce-only and an engine-owned OCO group.
- One trial; BTC/ETH/SOL only, 1h; CPU 90 s / wall 180 s / max span 92 days.
  This is not a generic order-tape/imported/native optimizer capability.

## Ordinary product runs, not direct engine stubs

Isolated project `portal-research-p23-ol12`, loopback 8096, fresh owned DB/artifact
volumes. Authenticated owner → P08 preflight → P10 admission → confined child
→ P05 sealed retention → named screen/journal reads. HMD was mounted read-only;
no direct Trading System/broker access. No shared preview DB was copied.

Requested UTC windows: IS `[2026-06-01,2026-06-08)`, OOS
`[2026-06-08,2026-06-15)`, declared Holdout `[2026-06-15,2026-06-17)`.
Dataset ID: `crypto-binance-1m`, requested BTC/ETH/SOL at `1h` from the HMD
indexed/resampled input; 300 predecessor warmup bars.

| Symbol | Run | Orders / fills / lifecycle events | Actual exit / sibling cancel | Exact fees |
|---|---|---|---|---|
| BTCUSDT | `rrun_eea1b8e46155c18f3bec6fe7b15ae646` | 3 / 2 / 8 | TP fill / SL cancel | `2.0260000000000007` |
| ETHUSDT | `rrun_b5aab0fcdabb491e1a8f4132b627b41c` | 3 / 2 / 8 | TP fill / SL cancel | `1.9740000000000002` |
| SOLUSDT | `rrun_8d26584cb3e740f9a29eebce25d0894d` | 3 / 2 / 8 | TP fill / SL cancel | `1.974` |

All completed with source-authoritative `SUCCEEDED / COMPLETED / READY`, and
passed the same seven screen reads, Progress/Evidence native-fact parity,
workspace non-enumeration 404, invalid cursor 400 and ≤1-MiB journal/page bounds.
Each real journal proves LIMIT intent and fill, two source parent-bound OCO
commands, two activations no earlier than the parent fill, exactly one exit
fill and the other child's cancellation at the same source bar.

Prices come from `result.orders`; parent/OCO/activation policy come from
`metadata.command_report`, joined only by the explicit source order ID.
Lifecycle timing comes from `metadata.lifecycle_event_report_v1`. Do not
pretend the bare OrderIntent itself publishes those fields; its nulls remain
typed. No `OCO_CANCEL` event or broker acknowledgement was invented.

Holdout stays `NOT_PUBLISHED / FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT`:
this fixed native child did not execute an independent Holdout. Empty IS/OOS
journals are truthful empty windows, not an unavailable whole screen.
Non-WFO search stays typed `NOT_APPLICABLE`. Funding is actual source zero
with funding disabled; other missing fields retain `missing_fields` reasons.

## Private proof custody and image identity

Private root: `/home/bobby/.local/state/portal-research-p23/20261008/expanded/`.
Full API responses, preflight/create receipts and identity stay private;
only this non-secret fact/index packet and small contract fixture are tracked.

| Receipt | SHA-256 |
|---|---|
| `limit-oco-btcusdt.json` | `0626a93d8f0574fea787f030633c5f964b4cfba24db0129f185da340c83485ee` |
| `limit-oco-ethusdt.json` | `1515f7661044825212ed74bc8aab27a5f721688321459cce4a6aa31e93d1ce5c` |
| `limit-oco-solusdt.json` | `7b3987043c4b0f7baaa6ad0c519fb9f1fa631135dc9f5c4389fc577ccac2d0b6` |

Qualification Control image:
`sha256:cd74ac64d3c19bf8ecb06e919bb8ed0bfb6b28370a7c33c5a14ae0a7503f3a01`.
Confined worker and API image:
`sha256:293abd5d7f26505b68fb565e82a6d1052b3a1da9308fda88d889a86c88129f09`.
These are dirty backend candidates from base `9cee82c7`; receipts include the
tracked source diff and each added source-file hash. Final compiled qualification
metadata is additive; these original execution images/receipts remain preserved.

Migration order: 119 recipe candidate → 120 identity uniqueness exception →
121 exact declaration/binding constraint → 123 window-seal batch index →
124 exact product-qualification reference. 122 was never issued/applied.
No historical recipe, failed run, source bytes, artifact manifest, seal or
business data is overwritten. Qualification opening does not remove auth,
workspace/lease/fencing/resource/admission checks or require a new engine pin.

Reproducer: `scripts/research-p23/limit-oco-product-receipt.mjs`. Resume named
reads on a completed run after a harness-only correction; do not rerun the
child merely because an assertion used the wrong source relation.

Frontend handoff and mutable gate/cleanup status live in the separate
[combined closeout](../P24/SUMMARY_LIMIT_OCO_BACKEND_CLOSEOUT_2026-10-08.md),
so this qualification digest does not change when tracking/owner review changes.
