# Canonical Delta-RSI reference — single-file Import example

Bobby authorized publishing this canonical sample on 2026-10-05; no further
owner-supplied private strategy is required. The exact authoritative source is
[deltaRsiReference.py](../../../apps/portal/frontend/src/research/samples/deltaRsiReference.py).
The Import screen's **Use sample** button copies that file's raw UTF-8 bytes;
there is no duplicated source string or browser-side Python parser/executor.

## Read the file by purpose

| Section | Definition | Responsibility |
|---|---|---|
| 1 | `ALPHA_CONTRACT` | Source/version/entrypoint, OHLCV, timeframes, warmup, determinism and all eight calibrated parameter bounds. |
| 2 | `DeltaRsiParameters.read` | Read the exact admitted run pins; never silently substitute defaults. |
| 3 | `DeltaRsiIndicators` | Stateless RSI/EMA/ATR/volume helpers and the endpoint derivative of a trailing quadratic fit. |
| 4 | `DeltaRsiPolicy.target_weight` | Filtered entries, direction-change exits and a hard-stop state machine. Return the previous-bar target. |
| 5 | `generate_signals` | Consume the child-supplied past-only history; emit the exact `research.imported-signal-notional-output.v1` envelope. |

The source has three plain, stateless classes with static methods and one
public function. Helper definitions are purpose separation, not an arbitrary
plugin API: no inheritance, metaclasses, instance fields, imports, dynamic
calls, reflection, IO or recursion are admitted. Loading validates and defines
the module without calling the strategy; actual execution remains confined to
the existing child and its CPU/wall/memory limits. Parse/gates/register,
explicit activation and New Run remain separate server-owned actions.

## Semantics and limits

This is a **Delta-RSI bounded-history reference**, not a replacement for
`delta-rsi-polynomial-alpha`, not the protected strategy's source export and
not a claim of full-history kernel parity. It uses the same eight parameter
names/ranges and mathematical indicator/policy family, but recomputes its
indicator/position state from the beginning of each supplied history window.
Its 256-bar warmup gives at most 257 bars to each evaluation. It emits
`1000 * previous_bar_target_weight` (short/flat/long), not fills or metrics.
Fees, sizing/accounting and realized performance are computed by QuantBT.
The alpha performs no optimization and does not use the seed itself, although
the source contract requires a seed so each run binds one explicitly.

Recommended initial pins mirror the existing Delta-RSI baseline:
`window=32`, `rsi_l=20`, `signalLength=9`, `len_atr1=10`, `len_atr2=42`,
`rvol=1.6`, `len_vol=16`, `slpercent=1.3`. These are documented example
choices, not hidden defaults or claims about profitable settings.

Use one supported declared timeframe (`1h`, `4h` or `1d`), real read-only
historical data and the currently qualified imported fixed
`signal_notional` profile. Capability/preflight/run admission still decides
what the installed release can execute. A sample does not bypass any gate.
The source's fixed notional and all assumptions are code-fixed and therefore
part of the exact source-byte digest. Edit code or declarations to register a
different immutable AlphaVersion; changing its label cannot overwrite bytes.
