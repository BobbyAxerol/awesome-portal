# V11-P23-DR — one real WFO retained-artifact/DB/BFF parity subset

2026-09-30 · Codex · `docs/research-loop-plan` · **SCOPED PASS; P23/P24 OPEN**.

The isolated `portal-research-p23-ol12` cell at loopback `:8096` was started
with its existing private volumes and a clean source tree. No run, import,
command or business-data write was issued. Existing owned P23 test sessions
were renewed by their original passwords; no credential reset or principal
change occurred. The cell was stopped after the read-only probe, without
removing volumes.

The input is the previously completed real HMD/QuantBT 1.1.1 Advanced WFO
`rrun_4e6c52d2171e86e734a7519bc3bfe2f5`, from the owned test receipt
`run-w07-single-2-20260929.json`. The probe requires its true `COMPLETED`
terminal receipt, one immutable P05 `SEALED` artifact and one RS-02 seal.

| Boundary | Measured fact |
| --- | --- |
| P05 artifact | `rart_d30e2ade8eadd68d5711a1d2a30be4ce041eb45a`, revision 1 |
| Manifest SHA-256 | `faa796d8aa523ba471f86548851e56fe248a999ada1fc37b6ae463b805336681` |
| Summary SHA-256 | `2e4ef9b2c8841718c5ca65788c0e24fd686da36d58e03875e16ee028a8f0d4ed` |
| Retained import digest | `f40807a80d411c4940997912448a3c566ad157814bcbe28db7e5efd9bd79d327` |
| Parquet parts | 10/10 SHA-256, byte lengths and Parquet metadata row counts checked |
| Rows | 1,056 observations + 2 folds + 3 trials + 1 candidate + 1 selection = 1,063; manifest, DB seal, DB rows and owner BFF passport agree |
| Exact decimal fields | initial/final equity, net return fraction, max drawdown fraction match sealed summary and BFF byte-for-byte as strings |
| BFF | 200 `AVAILABLE`, `PORTAL_RETAINED_CURRENT_SOURCE`; manifest/import/transform provenance pins agree with DB |

This proves **one real completed WFO's sealed Parquet → retained database →
authenticated owner BFF** count, summary and provenance parity. It does not
recompute the WFO directly in QuantBT; the separate Delta direct-engine
receipt covers only one P04 run. It does not qualify all datasets, windows,
source series, browser charts, publication or full V11-P23-DR/P23/P24.

Reproducer: [`scripts/research-p23/wfo-retained-parity-receipt.mjs`](../../../../scripts/research-p23/wfo-retained-parity-receipt.mjs).
Focused refusal tests: 5/5 pass (count, decimal, foreign/absent/wrong authority,
manifest/import digest drift). The private 0600 receipt is
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/v11-p23-wfo-retained-parity.json`;
SHA-256 `886ffa098d39802a9e3f2d9ea61cd9de998ed970680c9ccf4fa452da6d78d1ed`.
Neither raw candles, credentials nor private JSON were committed.
