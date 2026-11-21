# Real-preview correction — WFO summary budget and gateway refresh

The new admitted HMD run `rrun_53793d9336d9e42d62da1979eb317d94` executed 400 optimizer trials on BTCUSDT / crypto-binance-1m / 1h (2026-06-01…2026-09-01, split 2026-07-01, weekly expanding, global mode 1, seed 42). It then **FAILED** sealing S4: `RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`. This is real failure evidence, not product acceptance. Private response receipt SHA-256 `83ccf5623652542b2fe67cc37a8c40e9ba44dead2a3ff7616e30a3ea40a66579`; raw response stays outside Git in owner-private state.

## Correction

P05 keeps its 65,536-byte compact summary limit. If it overflows, only the declared OHLC display overview is coarsened (160→80→40…1 buckets); every raw retained bar stays intact. Bucket bounds/sampling/counts remain explicit, extrema/volume/transitions still cover the entire source, and analytics, selection, fold guards and child audit are never discarded. If these authority facts still cannot fit, the writer fails closed. No existing seal is rewritten and the byte budget is not increased.

Focused pinned-QuantBT Python tests: 9 passed / 1 opt-in real-HMD test skipped (new lifecycle custody, immutable sidecar derivation, real golden W5b replay and summary-bound regressions). Library same-snapshot path: 26/26. `bash -n` passes for the preview helper. The fresh HMD run must be repeated after the corrected backend image is built; until then LW-03 / source-series digest / non-null trial rate remain new-run acceptance pending.

The backend-only preview refresh also exposed nginx's startup-resolved old Docker addresses: the static index was healthy while auth/API returned 502. The owned preview was recovered with an nginx reload. `preview.sh up` now validates/reloads that **preview** nginx after healthy dependencies and probes `/api/control/readyz` before recording identity. This changes no production config, protected Execution proxy or frontend image.

Capacity before correction: root 232 GiB free (37%); RAM 11 GiB available. No broad prune, volume removal or production/source mutation. Disposable tests clean their owned containers; preview data volumes stay retained. Cleanup decision: `NO_ACTION_NEEDED` pending final capacity readback.
