# FULL-03 — Immutable exact product qualification

Verdict: **28/28 PRODUCT_RUN_QUALIFIED**. Scope: ordinary authenticated
P08 preflight → P10 admission → isolated pinned QuantBT 1.1.1 child →
P05 immutable retention → eight named product reads. Not browser, production
or release acceptance. Private response/credential artifacts stay outside Git.

Dataset `crypto-binance-1m`, symbol `BTCUSDT` (perpetual source). All seven
indexed UTC resolutions: 1m/5m/15m/30m/1h/4h/1d. Three real trials per study.
Every preflight proves 300 **target-bar** predecessors, aligned half-open
edges, observed closed coverage, zero gaps and input <=100,000 bars.
Daily uses 2024-01-01…2025-03-01 Advanced / 2024-01-01…2025-01-01 Three Window;
other resolutions use 2026-06-01…2026-07-15 Advanced / 2026-06-01…2026-07-06 Three Window.
Engine-built folds remain authoritative. Global/causal/decay/Three Window
selection scope is checked separately; Three Window holdout is not used for selection.

Index revision: `f071401914c2734171308903cd6390422ac53a99a38dd3f89a8f52699a9a1374`.
Source manifest: `f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`.
Private sanitized summary SHA-256: `1a5d0817d14898a2771bdb09e522556671967bed7bc4a953652b93c7ca7d6a60`.
All current-source reads are AVAILABLE with their exact source/profile pair;
retained byte custody and Stage4 params/bundle match, RC missing count is zero.
Each malformed cursor returns 400 and all 28 foreign-workspace reads return 404.

| Exact profile | Real run | Snapshot rows including warmup | Private receipt SHA-256 |
| --- | --- | ---: | --- |
| p10.delta-wfo-temporal-1m.v1 | rrun_4f38f1002db11284dfbd3a70d40457f5 | 63660 | 141159d669d1b1096ca62c42e34d69a15f9c1730542195311ee076d5eba4f5ce |
| p10.delta-causal-inner-1m.v1 | rrun_c8382a796de8c93e76272d9d26105203 | 63660 | 26e5dfedca2389f333004cc76fd597958607c6116b2b2868cbdf6f6a320f23df |
| p10.delta-per-fold-decay-1m.v1 | rrun_90b7bd20b7b53478850eae5ce8994f23 | 63660 | 40697ddbaf0445e67cb525127029ed1685b9a72f625f81eded7e5ca2499a2d04 |
| p10.delta-three-window-optimized-1m.v1 | rrun_214d74b55f8f0e27098518840bd2f9ee | 50700 | d6338c56ebe74c2be3ee5d0639db90033c982fe212d04c54ab8932cad7fa7c0e |
| p10.delta-wfo-temporal-5m.v1 | rrun_0ff5158da619ee577927624fde1fb5af | 12972 | bd90349b57cf16b82d5b6ff608ca9cb47ac9eb398ca41cab5a83ef6460d8d83f |
| p10.delta-causal-inner-5m.v1 | rrun_7c15475fc3e86b1f234cc5fb934ba478 | 12972 | d7378f3315274f76dd21416a3ccefe144e9546d274dd92596cd4bf986dbae2ef |
| p10.delta-per-fold-decay-5m.v1 | rrun_1714f6c8e8a109410fb47d76c01199ac | 12972 | e70f15f448e4baafd488a585ddf0f78e4e35ef8fec5209fe76dbd697825d545a |
| p10.delta-three-window-optimized-5m.v1 | rrun_e2982d3ef4fc0cc06321805b6794f4d2 | 10380 | 6390ea12b2759d1432071de5fdd9181a349136ea2852072844b3ede553b18bcd |
| p10.delta-wfo-temporal-15m.v1 | rrun_497ed06fc802a81e4f13dc4e27652ac3 | 4524 | 25dad5ef1e7312d061e6fc75d303d5b5052d82daf6da575989e6fa0fb4fa21c9 |
| p10.delta-causal-inner-15m.v1 | rrun_aae5adb1ff66f51d08eed83ec9d78bca | 4524 | 80adb9ca4a2bd17f5c164611dcf74119626922859e913363b4f281d4ff062c42 |
| p10.delta-per-fold-decay-15m.v1 | rrun_d1fa68b97eda6cd70b4aec945d84ef84 | 4524 | a0aabbef7ffceb7f2245208a479efa4bcd6589feef5bcdaa47d8f05e63e35acd |
| p10.delta-three-window-optimized-15m.v1 | rrun_7ad23e5a282e527f3d92f11baf3f1084 | 3660 | 139875c6dea13d23eea9555f26706ea69769a640044fff6dd4f4b655b8d2daf5 |
| p10.delta-wfo-temporal-30m.v1 | rrun_0774d2cd709788992ee448d04935ad9e | 2412 | c5e7964655c07e4053e08a0149be594ba28248c067b32c2446e5e16c5580e195 |
| p10.delta-causal-inner-30m.v1 | rrun_bdce0fa5f65f45cac04789b60fb6d506 | 2412 | af4bd6afb7a5550f4ec84d131a0b650f1b72ac9e9f10ccb06e797a8e3f7acc0c |
| p10.delta-per-fold-decay-30m.v1 | rrun_eb870566e0cb1057d506610369f68694 | 2412 | 662c31a7dcef3f07b195eb37b2a3e4dcbfc785e17f62e0d55e2ff1fbaad28f88 |
| p10.delta-three-window-optimized-30m.v1 | rrun_e0c19836f57af2b3214c3ec0c7ef0c46 | 1980 | 37da4cb1c379f328eb05ad383b3de1b20e9ed55efcd2e01274ce005a1503b43c |
| p10.delta-wfo-temporal-1h.v1 | rrun_025206033d6cda2ea2c0f42b224f3eac | 1356 | 48b8f75981b13faee0f5482aa4426bc7feb2521302a716f17a9b4c3f071d88e2 |
| p10.delta-causal-inner-1h.v1 | rrun_10b9c9a35ae63e3a79a0e49419c78ed3 | 1356 | 350ba082cfeb31f92a83e4e02c9b4be64f8d168f01979007b9f8bf073414aefd |
| p10.delta-per-fold-decay-1h.v1 | rrun_e241508cfa3093569ef1594cd0a4632b | 1356 | ebd085708a58945c7545f7977bedbc5e72c3d60436b8a9de99d11039c97eb269 |
| p10.delta-three-window-optimized-1h.v1 | rrun_bad1b603818dcab3443f58ae4ae658c8 | 1140 | d820e525f7ff342dcff5f885857d6706887fb5e08e0fabe25b734d095adcab49 |
| p10.delta-wfo-temporal-4h.v1 | rrun_8c311a6311b7e813af5f16ec78157a43 | 564 | f3e8782bd309c24e0492a5c93aac463c8f1e620b9e3d69f782803759baef816a |
| p10.delta-causal-inner-4h.v1 | rrun_5b96229c1febaf0ca4b80f82d9da09db | 564 | feafc4db527058f9b2f8d6c074c2415504611c923a17a38bc2e05718cdf46b9e |
| p10.delta-per-fold-decay-4h.v1 | rrun_670f0ec96e3f97c7a67e6d772b5b16ac | 564 | 9c9661cb2d44a2124991eca01bace1a901bcec745d7290b054cb382129da7ca9 |
| p10.delta-three-window-optimized-4h.v1 | rrun_aaf47ac8e069ff1dd29689d831242f00 | 510 | d267b80230d4f53dbacd9263ab1697ebfc27b455a475a7de80b7712b0175f793 |
| p10.delta-wfo-temporal-1d.v1 | rrun_2a0efc56e084fa31eab7c4281a48b48b | 725 | 8e3b3c553452aa555948cdc1aae10acd9350d67fbde00af10ae0de7cef36b6bf |
| p10.delta-causal-inner-1d.v1 | rrun_e6c1270f48ff4bce53a58416be3fb277 | 725 | dad4679696ab9e1c07b84537dbf9e836b66f5f095d0b11ae32735dac013d572c |
| p10.delta-per-fold-decay-1d.v1 | rrun_26b1ec7824eec1da2fe758116a8284d7 | 725 | 72c4a9a67bb73356c0689a394a4828d10b5379835cd9b79e0cbad5d7b0778ef2 |
| p10.delta-three-window-optimized-1d.v1 | rrun_8b53ae433d1a5ddbdb4a93d966c411fa | 666 | 4301f527436d6346e2d39233bca9b761dd5fc7f646ac419f10156bea093c0619 |

## Immutable runtime identities

- Child/worker image: `sha256:5bb7279b19c4e31dc6b66fe7b4159f53398fd8a0c323073f4216938fbb0eb23a`.
- Child/worker image: `sha256:9d5e19069b00eca9a0cecc09584223df140194009fd03e7c230a23eaa23a86e3`.
- Child/worker image: `sha256:0923f4e9517e3dbdbdaf59ed1a355d4ad208e76f71e877ad3fab4adc6bcfff46`.
- Control API proof image: `sha256:c31616e36b5149038547f3443c3a9b4b1fe26c62a74659f01d7b1646dfd068f8`.
- Control API proof image: `sha256:6d1c6a458b53174febad56a7b104ca1e6fea4005bfb5e6f8ce83c8667b186f2f`.

Recipe descriptors and numeric strategy are unchanged by qualification. The proof
records each exact worker image (including bounded 1m storage/display fixes).
The final activation image additionally records these receipts; it does not rerun or
replace any old seal/AV/index. Migration 100 appends product proof to the candidate
history created by 098. Old 096/097 FULL-02 proof stays byte-identical.

Source-clock boundary evidence and implementation/rollback/cleanup receipt:
[source discovery](FULL_03_SOURCE_CLOCK_DISCOVERY_2026-10-06.md),
[delivery](FULL_03_INDEXED_TIMEFRAMES_2026-10-06.md).
