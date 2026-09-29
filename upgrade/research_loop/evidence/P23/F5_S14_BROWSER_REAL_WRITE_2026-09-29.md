# F5 / P23 — S14 real browser write on the owned cell

2026-09-29 · Codex · `docs/research-loop-plan` · **S14 scoped PASS; F5/P23 OPEN**.

The existing `portal-research-p23-ol12` cell at `127.0.0.1:8096` ran seven pinned images without rebuild. Its identity recorded clean source `ac2a43bc3087cd9e8b95d9f261ba0c2df486ab42` and `portal-web` image `sha256:3fb4332d9002a6c2244bde76d6a7dba46c915e9739ff7d86de1c9328a1158044`. This is **not** an exact-HEAD web image or full F3 receipt. No shared preview, dev, production, Trading System or Execution Edge runtime was changed.

`scripts/research-p23/f5-s14-browser-write.mjs` signs in as the existing `p23-owner` test principal and drives the actual S14 product route in Chromium with **no route stubs**. It submits the accepted E17 single-file Alpha test source, with a unique inert comment per browser run so the server's duplicate-digest gate remains active. The browser performs exactly parse → seven gates → register DRAFT → activate ACTIVE; the owner API then reads the same version back from the registry. The receipt stores only digest/metadata, not source bytes, password or cookies.

| Viewport | Result | Real API/DOM checks | Jobs | Private receipt SHA-256 |
| --- | --- | --- | --- | --- |
| 660×900 | PASS | Parse 201, 16 server mirror rows, seven PASS gates 200, DRAFT 201/revision 1, ACTIVE 200/revision 2, registry ACTIVE, overflow 0, page errors 0 | 155→155 | `b84b95dac6c632d7bd41ad945de6f47441f2e9f3ec36c7a1bf9cf2be56981294` |
| 1280×900 | PASS | Same four writes and readback; overflow 0, page errors 0 | 155→155 | `89bc0f7b74cd2a15edacd016b75edd81620813f47648ed7973ee3dd0d9fd073c` |

The mode-0600 JSON receipts live under `/home/bobby/.local/state/portal-research-p23/20260927/runtime/` with names `f5-s14-browser-660-unique-20260929.json` and `f5-s14-browser-1280-unique-20260929.json`; both retain `full_f5_passed=false` and `full_p23_passed=false`. Alpha test versions `av_p23_f5_88e06bc5_0_3_0` and `av_p23_f5_67947d1d_0_3_0` are ACTIVE **only inside this disposable cell**. No run was implicitly created and no real strategy code was executed by import.

The first 660 exploratory attempt (`f5-s14-browser-660-20260929.json`, SHA-256 `2cb0e1ca83b3794311c42009ffb633c94eb8564fa05cabf4a646699ba5389841`) failed the digest-unique gate because it reused byte-identical source from the first 1280 attempt. This was a harness-input error, not a server/UI regression; it was preserved rather than overwritten. The follow-up harness commit `ac2a43bc` supplies a distinct source digest per run without weakening the gate. The original 1280 exploratory PASS (`3fbdd6cc625f347556c4557ad201b0b4ba36513822b9787fba290a7c633c384f`) is not counted in the paired result because it lacked the later overflow assertion.

`node --check`, `git diff --check` and the repository's non-skipped commit hook passed for `1e643792` and `ac2a43bc` (Control API 1,344 passed / 1 skipped on the first hook; no failures on the second). The P23 cell was stopped with `cell.mjs down` after the receipts; volumes/images/private evidence were retained, not pruned.

**Still open:** S02 real browser declare/preflight/create, full S00–S14 current-candidate browser lane, publication/Governance consumer, exact-HEAD image rebuild, mixed cold-cache/WFO overlap, remaining P23 T gates and P24. This receipt closes only the S14 real-write subgate of F5. W06 already met its original 500-ms SLO; the owner-approved 500–600-ms allowance was not used.
