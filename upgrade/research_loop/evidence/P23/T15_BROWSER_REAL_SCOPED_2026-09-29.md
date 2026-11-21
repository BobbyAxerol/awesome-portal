# P23-T15 — browser-real replay subset on the owned cell

2026-09-29 · Codex · `docs/research-loop-plan` · **SCOPED PASS / full T15 and P23 OPEN**.

The isolated `portal-research-p23-ol12` cell at `127.0.0.1:8096` was restarted from its seven existing pinned images, without a build or changes to the shared preview, dev, Production or Execution. The cell identity records clean source `649611bf9b1f58262777a569fe1b2c06c5e3437b`; the `portal-web` image is `sha256:3fb4332d9002a6c2244bde76d6a7dba46c915e9739ff7d86de1c9328a1158044` (built 2026-09-29 04:30 UTC). The only later frontend commit `08fa8ee0` changed S13/S11 tests, not S08 product source. This is **not** a rebuilt exact-HEAD F3 receipt.

The new `scripts/research-p23/t15-browser-real.mjs` signs in as the existing `p23-owner` test principal using its private 0600 session file. It uses a real Chromium page and the same-origin gateway; it never stubs requests, calls `/internal/`, or submits a Research mutation after login. WFO `rrun_90578b81460c44f1a2729b717b3c2c8b` served an `AVAILABLE` retained execution replay; P04 `rrun_d8e174e6268aedbf868de56edd062b29` served an `AVAILABLE` hub replay.

| Viewport | Real browser assertions | Requests | Jobs before/after | Private receipt SHA-256 |
| --- | --- | ---: | ---: | --- |
| 1280×900 | WFO deep-link + retained lane; 100 candles cut to 1 at first causal cursor and 2 after one step; P04 switch/back restores WFO run and lane; overflow 0; page errors 0 | 36 | 155→155 | `9c1476c386b4c30d0b2edc9db72a582614540af295cc5939a5f1cdb21bbfa295` |
| 660×900 | Same assertions; overflow 0; page errors 0 | 37 | 155→155 | `146d33242639753ae3d757ec1d649c96813df7089fc15c86a6642ad2cb033b5d` |

Both private JSON receipts are mode 0600 under `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`, include exact seven image IDs, source SHA, run IDs, API response hashes, request paths and result flags, and retain `full_t15_passed=false` / `full_p23_passed=false`. An initial desktop exploratory receipt (`435cdceb5988c4cfd8ae3fe42bd0c61592fb87a7e59eb1803d2d46fabc26e30f`) lacks the later viewport/overflow assertion and is not counted as the paired result.

**Limit:** no cold-cache/WFO-concurrent browser window, full S00–S14 lane, S02/S14 real browser write, published RC/Governance consumer, dev hostname or P24 visual/print acceptance was exercised. Those remain T15/F3/F5/OL-24/P24 gates. No SLO or W06 verdict changed. The source code and test identities are local only; no push/merge/deploy.
