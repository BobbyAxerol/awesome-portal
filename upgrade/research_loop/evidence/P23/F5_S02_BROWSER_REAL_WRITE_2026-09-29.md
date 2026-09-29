# F5 / P23 — S02 real browser preflight and create

2026-09-29 · Codex · `docs/research-loop-plan` · **S02 positive-write scoped PASS; F5/P23 OPEN**.

The isolated `portal-research-p23-ol12` cell at `127.0.0.1:8096` used its existing seven pinned images, including `portal-web` image `sha256:3fb4332d9002a6c2244bde76d6a7dba46c915e9739ff7d86de1c9328a1158044`, with clean source `b9ea91214004d3fcd09dd8a374c5025b47cb49e7`. No image was rebuilt. This is not an exact-HEAD F3 image receipt. No shared preview, dev, production, Execution Edge or Trading System runtime was changed.

`scripts/research-p23/f5-s02-browser-write.mjs` signs in as the existing `p23-owner` test principal, opens the S02 product route with `?from=rrun_d8e174e6268aedbf868de56edd062b29&step=review`, waits for the real immutable requested spec to copy, then clicks real browser preflight and create. The clone produces a **new** intent and token; it does not reuse the parent run's token, job or manifest. No `page.route` interception or fixture response is used. The two browser POSTs carry byte-equivalent `requested_spec` JSON (SHA-256 `ef445fcca8f96096441fd9becae0027996a246403c6a21f3a10f8f6958ec8855`), and create carries `CLONE_OF`/the exact parent run. The script checks the progress route, one new durable job per click, and waits until the child reports `COMPLETED/READY` before the cell is stopped.

| Viewport | New run | Real response/result | Jobs | Overflow/page error | Private receipt SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1280×900 | `rrun_6fcef592a1ce277ca2e9b986ce17fba1` | preflight 201/may-create true; create 202/replayed false; progress 200; terminal `COMPLETED/READY` | 156→157 | 0/0 | `eda5b2e1e0a20a9a014d2f736bebb8096f82767d38982b50033c3c3c2ac2e89d` |
| 660×900 | `rrun_275363708ddba707f0809a835d79167b` | same checks; independent new intent and terminal run | 157→158 | 0/0 | `1914cc430263ed944d0343f5c2ebac94094fe520ada0cff583006657f11098d1` |

The mode-0600 JSON receipts are `/home/bobby/.local/state/portal-research-p23/20260927/runtime/f5-s02-browser-{1280,660}-20260929.json`. Both record exact seven image IDs, clean source SHA, route/status/checks, and `full_f5_passed=false` / `full_p23_passed=false`; they do not contain credentials. A prior 1280 diagnostic (`f5-s02-diagnostic-1280-20260929.json`, SHA-256 `017e9f382eb5ac03526b7fd782974233d473cb20f7a37e35607e3f86635f34f8`) used dirty source and is **not** counted as acceptance; its one test run also completed READY. The P23 cell was stopped with `cell.mjs down` after the two clean results, retaining volumes and receipts.

`node --check`, `git diff --check`, the repository's non-skipped commit hook and the real browser/API/DB checks passed for harness commit `b9ea9121`. The paired [S14 real-write receipt](./F5_S14_BROWSER_REAL_WRITE_2026-09-29.md) covers the other named UI write path. Together they prove positive S02/S14 product-route writes on this pinned image only.

**Still open:** F5/FG-03 negative 400/401/403/404/409/503 matrix and cleanup/revocation of disposable identities, full S00–S14 current-candidate browser lane, publication/Governance consumer, exact-HEAD build, P23 remaining T gates, and P24 release rehearsal. Do not relabel this positive subset as F5, F3, OL-24, P23 or product acceptance.
