# FULL-05 — Immutable imported-source product qualification

Verdict: **27/27 PRODUCT_RUN_QUALIFIED**. Authenticated P07 import/register (DRAFT) → P08 → P10 → confined QuantBT 1.1.1 → P05 → eight named screen reads.
This is backend product qualification, not browser/production/release acceptance. No built-in Delta receipt is reused.
Imported AV: `av_full05_canonical_delta_rsi_1_0_0`. Source SHA-256: `bd8a5b68e9a72023069731020a3e890463609eecb1565ef8c9ed713a87ebd2ac`.
Canonical purpose-separated Delta/RSI source; declared 256 target-bar warmup, 1h/4h/1d fixed-UTC indexed BTCUSDT history. Numeric ranges/steps, pins and numeric categories supported; nonnumeric optimizer parameters and categorical centroids have explicit incompatibility refusals, never encoded as fake decimals.
Private summary SHA-256: `5bfcdf4bca17e64b0079f4a51ef0ecc8b0e8a88963bc01292c8ddb2dd644f6e8`.
| Exact recipe | Real run | Bars | CPU s / wall s / RSS MiB | Receipt SHA-256 |
| --- | --- | ---: | --- | --- |
| p10.imported-wfo-temporal-1h.v1 | rrun_a9addaaf275b763bcaa87d51edc12ad1 | 1312 | 12.409 / 12.621 / 313.7 | cdf07383dd8d6e952afaab963cd966f4e2f03f21ef7b6c5ca00a05605661966b |
| p10.imported-causal-inner-1h.v1 | rrun_e1561686b54159b23355e3ef0b252629 | 1312 | 16.186 / 16.394 / 314.2 | a36fae511cfcaaa9fe5e471efb6d835ad864e15ac0dc6d7c229e5d68a90adae3 |
| p10.imported-per-fold-decay-1h.v1 | rrun_dbb7d3983a4fb9a28f300d1046a49e60 | 1312 | 12.292 / 12.433 / 313.1 | ad107fde18b3543105995232754fd8212bd03858850bc1f47eba28756513d3c2 |
| p10.imported-three-window-optimized-1h.v1 | rrun_72e7b2d0deca2bb82fa9f5f2b925888d | 1096 | 10.819 / 11.019 / 325.5 | e122f9191425043c2269b4e7f1472eabc96d2e45a6ae15835f446a2285c05c57 |
| p10.imported-wfo-temporal-4h.v1 | rrun_7442038157fede7c63669a2846474f28 | 520 | 8.856 / 9.050 / 312.7 | 93f49128572014dde03a0a1361fc180e9759dc0c0316d22ee6f4cd4abb508a18 |
| p10.imported-causal-inner-4h.v1 | rrun_7e7465f6e00ed5c25633eae454c68f28 | 520 | 9.037 / 9.171 / 312.4 | b5b84d70286c5c4762ad8fa86bbcea17ca2ddd7ed3424ac423a7f3c9434081a3 |
| p10.imported-per-fold-decay-4h.v1 | rrun_181ad16d18024ebcd039d74b08ec6819 | 520 | 8.461 / 8.584 / 312.3 | cd4f5095edf3bbcdf2d040bb9cc5f35e48228bd3db67d65b33fb9773604ceae7 |
| p10.imported-three-window-optimized-4h.v1 | rrun_0ec4baaeb1ebc20b453c3e598a74e8e3 | 466 | 8.941 / 9.108 / 325.0 | 55fd863c1a04ded3dd14f7708313e09342c7f894b2f5813b7de888a91a8e915e |
| p10.imported-wfo-temporal-1d.v1 | rrun_34eb15c8da8884440e018c6df2ef7956 | 681 | 9.128 / 9.303 / 312.7 | e864aaeda1ad71f3c7cd05f61b2062ce5402b2276878e06d464a4e799d30133a |
| p10.imported-causal-inner-1d.v1 | rrun_3f8bdff40effb7f8b38b7b19a62be213 | 681 | 16.963 / 17.317 / 314.0 | 2fbd1cc8eca4c0fc26fa9d75b93a68a9cf10e3f387af83345755c0b46dea5b4d |
| p10.imported-per-fold-decay-1d.v1 | rrun_f8a6f89e8d1f56697313ae72f231f3df | 681 | 8.939 / 9.048 / 312.4 | c6f5a2a152b8530ccc7b3c955f4b9c000f34a36517366b822f9103b519c63a3b |
| p10.imported-three-window-optimized-1d.v1 | rrun_73850c1f844a340e219d70f6aab57bd6 | 622 | 9.317 / 9.546 / 325.6 | 053f4ced41476f0ea8cc30c57f87982889c4e29b26fb2aa95cb8082eca70ef4f |
| p10.imported-mode3-global-1h.v1 | rrun_d9c01571dc4bb3c08713f20c695ef526 | 1312 | 17.928 / 18.233 / 367.3 | a05d908099db19974c058921e326b928648fc4573b1245d3dcbb08cdc560ec8b |
| p10.imported-mode3-global-4h.v1 | rrun_f8029536410fc994ffa1db43c7a208d4 | 520 | 14.099 / 14.382 / 366.8 | a414c9d89e1f4f391793352a1964ad8f6607c4d0834607c9fdc9bb66e6a6c4f9 |
| p10.imported-mode3-global-1d.v1 | rrun_1595ad845e7bce538be44fb6b5d1bfd8 | 681 | 12.340 / 12.525 / 367.4 | 54df2525d1bff65a3978b8ec47e1f25a9515e94590dc73af1e11c813c5ce7ed7 |
| p10.imported-mode2-global-1h.v1 | rrun_e70fc4aed2921f9df73d197675f83954 | 1312 | 15.411 / 15.680 / 329.5 | cdc221cb07ad8bcbc45919f68c8f264ccc56c7980b1bcbacbb941122e5b62fd0 |
| p10.imported-mode2-global-4h.v1 | rrun_30a405b0b4aecb71aaeb2cc382949760 | 520 | 9.761 / 9.906 / 329.0 | de8536f905b8aec3f8f0b0c464d8f06623f0a9f28518474c8d20634eaf12ed06 |
| p10.imported-mode2-global-1d.v1 | rrun_b62aa5bd1480479d4c713c9cb3e6b09e | 681 | 10.864 / 11.046 / 329.0 | f24dd23d9115f4beb4dfdf4c4c327b2f198cdeb49c3ae232b0a1945471f0152b |
| p10.imported-mode4-global-1h.v1 | rrun_41d6340bb4a596c1982abe5308cc1eb0 | 1312 | 12.632 / 12.826 / 314.4 | 2eafaed5cdf322e4069c496da57506895a1cdc920732869f8727e0612dfdebb2 |
| p10.imported-mode4-global-4h.v1 | rrun_4809de20c1790cc048bcd9a6c0e4c20a | 520 | 8.765 / 9.013 / 313.0 | 337e9b419ffa541f79c49f955a3bd37c2aa6c4b1668594a02910ce1a2a58e64e |
| p10.imported-mode4-global-1d.v1 | rrun_42a4ca3eb3ebf209e4019e8f7e406aa6 | 681 | 9.306 / 9.409 / 312.8 | ede419b2c70665dd838f9cb105a9c10c06c8ad6e7b5161c358d0c4385ea69695 |
| p10.imported-mode4-causal-1h.v1 | rrun_ff40cc874819d8e74871d6fede1a2bb0 | 1312 | 12.150 / 12.567 / 313.5 | afa5796f4203868f37b3d00b901082511d4e08774c0b6b9468c0acefe0e6c7a0 |
| p10.imported-mode4-causal-4h.v1 | rrun_7f1664598eabceb40dfd42e9061ebaf0 | 520 | 8.475 / 8.559 / 313.9 | c2877e0f756fde56069619a7212fde22cfada5ee3ba18a77c5c22e3af6152a2a |
| p10.imported-mode4-causal-1d.v1 | rrun_d04c54f0147d69b268e10dc1bb5782cb | 681 | 8.761 / 8.921 / 314.8 | b344ccb612ce9b43ee11c6994d574f506f8eadc1973aa2f185544d81d2df5f8f |
| p10.imported-mode5-global-1h.v1 | rrun_abc47b3bb1579671a6be25cfb993f1c2 | 1312 | 9.962 / 10.119 / 314.8 | fdf31ba750485148355148a6e27f167fc6dc6a90a65d08ea3b607742b42fc5c5 |
| p10.imported-mode5-global-4h.v1 | rrun_a6debc82b1c16a2d90c7dd98b169afcb | 520 | 7.651 / 7.757 / 314.2 | fdff556c11d3c2c75b65bcfcabac4690abfa991b2b9f170d5afa401fe13acfa4 |
| p10.imported-mode5-global-1d.v1 | rrun_080ff69f6faa61092aba3f86811b0f69 | 681 | 8.027 / 8.204 / 313.3 | 053a5c73d1ba5ab233af5d6587d3b1409bc8498fcb6a869dc4243c497a35aa65 |

All exact caps remain 120 CPU/240 wall seconds,4GiB address space,128MiB scratch. Scratch high-water is NOT_MEASURED. Native mode/schedule selection is retained; no causal-inner claim for global/mode3/mode5; independent Three Window Holdout is not selection input.
All27 foreign-workspace reads return404; malformed cursors400, retained byte/Stage4 params/bundle MATCH, RC missing count0. Source bytes/immutable declaration live under the same lease; private credentials/DSNs stay outside Git.

- Worker image: `sha256:6fb5c614858c9fb31eb6c3d6b40f8897b7a9a6f8c2c0b8f348e74ef61967c69e`.
- Worker image: `sha256:621961f930f5e18b6554e2657ae7dfd87c26d78323abea65d496b1262c265e19`.
- Control API image: `sha256:bcead80dfae24e681843aa8e47c2c940b56189d5c0ca1c9a22408abf9c7553d8`.

[Implementation and frontend handoff](FULL_05_IMPORTED_ALPHA_2026-10-06.md).
