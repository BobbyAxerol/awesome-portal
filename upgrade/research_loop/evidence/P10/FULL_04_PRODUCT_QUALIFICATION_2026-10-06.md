# FULL-04 — Immutable exact product qualification

Verdict: **35/35 PRODUCT_RUN_QUALIFIED**, ordinary authenticated P08 → P10 → confined pinned QuantBT 1.1.1 → P05 → eight named screen reads.
Not browser/production/release acceptance. Seven indexed UTC target clocks; 300 predecessor bars and <=100,000 input bars per recipe.
Mode3 native plateau/centroid, Mode2 bounded proxy bootstrap with explicit IS candidate ranking, Mode4 IS-only global/fold-local, Mode5 full-sample calibration.
No Mode1 inner fold or ranking is substituted. A synthetic centroid is not an Optuna trial; Mode5 has one full-span fold and no untouched OOS/Final Audit claim.
The separate legacy linked-audit executor preserves its exact historical adapter fence (typed 409); native selection/retention/final-audit disclosure is readable through this chain.

Private summary SHA-256: `b32c2fbdbf7540f8a2ae60aca63cc0a8b30f0931e0936229def88b903285d11e`.
| Exact recipe | Real run | Bars | Native evidence | Target | CPU s / wall s / RSS MiB | Private receipt SHA-256 |
| --- | --- | ---: | --- | --- | --- | --- |
| p10.delta-mode3-global-1h.v1 | rrun_59de1d980a212505d43520f11068b237 | 1356 | PLATEAU | TRIAL | 10.481 / 11.080 / 379.9 | 5672b798c2a6377dc44ed1ca719aba3652714c703e4c93204900e0f754499ce9 |
| p10.delta-mode3-global-1m.v1 | rrun_fc45441b258288ee691129109a1d3ac4 | 63660 | PLATEAU | TRIAL | 13.016 / 13.334 / 468.0 | bda54d7f5213ebdc68482b6c3d1b7b3a5fb40bd8af2762c79bfa1a5b24464063 |
| p10.delta-mode3-global-5m.v1 | rrun_aba989123d410c76421373fc38ede5cb | 12972 | PLATEAU | SYNTHETIC_CENTROID | 10.587 / 10.839 / 396.0 | bcddda3680456b9a0f22da14895ae32408f5ba780c48f56f9977a8cdfdb780f2 |
| p10.delta-mode3-global-15m.v1 | rrun_276596db3bdadffa3dc0d92cd913885a | 4524 | PLATEAU | SYNTHETIC_CENTROID | 10.497 / 10.818 / 384.8 | 8b5419ab7cc461b3d3c1eeefa111e3f88fa892fe584bab0d52d38b20d08a3cdb |
| p10.delta-mode3-global-30m.v1 | rrun_6b2430b15a3cb682397beb3470e518b7 | 2412 | PLATEAU | TRIAL | 9.663 / 9.856 / 382.3 | 0587603d087c13337c4629ff88a94f0ed46ed082db57c7e92224e3ae839fc4d3 |
| p10.delta-mode3-global-4h.v1 | rrun_e449ad1efa1753dd2e626479b4595eee | 564 | PLATEAU | TRIAL | 10.301 / 10.478 / 379.8 | 14dc31f8ec4577dc6b46eaedfcb771249706b4bab64311195c766b50a1edbbe3 |
| p10.delta-mode3-global-1d.v1 | rrun_9d82420510a60a93e1e94209db7492fe | 725 | PLATEAU | SYNTHETIC_CENTROID | 14.896 / 15.259 / 378.3 | 654d8a7c93e3166d78e5ae7dd3cfe5767718f8f55fe20a5027d229d32d328d74 |
| p10.delta-mode2-global-1h.v1 | rrun_32c7f7b70d35cf734877092485c8fd20 | 1356 | BOOTSTRAP_PROXY | TRIAL | 10.134 / 10.315 / 340.2 | 10920634603ac881d11b90d6d9e2f38fb21efe370e3fc4e833e99586b3100ef5 |
| p10.delta-mode2-global-1m.v1 | rrun_82c2ef8002dc0089901c59bdc62ad2d6 | 63660 | BOOTSTRAP_PROXY | TRIAL | 12.775 / 13.041 / 412.6 | 8328da5547b86ce94fb76a21ed2bd0f6505a899768c184ed6e341fedb694b049 |
| p10.delta-mode2-global-5m.v1 | rrun_6d8cef398561abd275bd3244548317ed | 12972 | BOOTSTRAP_PROXY | TRIAL | 10.920 / 11.120 / 352.1 | 2f01e49edfd6dad70c88623507ed30f192daa531143c6361b991fa74e875af24 |
| p10.delta-mode2-global-15m.v1 | rrun_3fc2c683df65b38c8878c1908da8bb1d | 4524 | BOOTSTRAP_PROXY | TRIAL | 10.625 / 10.731 / 343.8 | b704176931cf7c24a9b981cc6b239bf838fb0d22c5f4c1ac133d0c488b9e4f9c |
| p10.delta-mode2-global-30m.v1 | rrun_b781e6daa4867aaa8b7984b162331af3 | 2412 | BOOTSTRAP_PROXY | TRIAL | 10.258 / 10.456 / 341.7 | 19f5685d8c51b65f993260d2799e682cef02cae13a350d54effb921dcf7b0335 |
| p10.delta-mode2-global-4h.v1 | rrun_3962a1cf47977d27aa59f287643bf847 | 564 | BOOTSTRAP_PROXY | TRIAL | 10.364 / 10.559 / 339.9 | b05c10923a71bb7b2c78eaa6fa821c50dab88493beda01247d8b3308e305ce3a |
| p10.delta-mode2-global-1d.v1 | rrun_2538b5f0dd1edb973a7eb0183ee26a79 | 725 | BOOTSTRAP_PROXY | TRIAL | 10.225 / 10.464 / 340.2 | 4a12ab15509f33ec21d9e1551b7f1e3e792503e71a326f7a72b287b6b170ae52 |
| p10.delta-mode4-global-1h.v1 | rrun_e3734e2a757823327de2f57256a0cabc | 1356 | IS_ONLY_DISPERSION | TRIAL | 8.337 / 8.536 / 324.6 | 13e386c5ad7412242ab485201002e671c441ab65dd9813eb75f2b50ebe49f2a7 |
| p10.delta-mode4-global-1m.v1 | rrun_5bbb4de33f9dfa0dc9d00e4535cf921d | 63660 | IS_ONLY_DISPERSION | TRIAL | 11.053 / 11.259 / 411.8 | 3ec17542354e3eca40dc4ebd2e6a4166f6b4e7060629780e7cec124c163e5efa |
| p10.delta-mode4-global-5m.v1 | rrun_bd7394b12be30da679abc5a2c58c25c0 | 12972 | IS_ONLY_DISPERSION | TRIAL | 9.043 / 9.251 / 341.7 | 3e2ad924da0d1299e802b0699cdd11d10b379a62e516006928638235b2ad3962 |
| p10.delta-mode4-global-15m.v1 | rrun_d91849e2399af127494e4528bd2f0e3d | 4524 | IS_ONLY_DISPERSION | TRIAL | 8.590 / 8.798 / 329.9 | 751a53391702cfc85f7f3d354422dfb63157a426fda4656686d310c7ac268e80 |
| p10.delta-mode4-global-30m.v1 | rrun_69114bba42dc922828490084cf4da5ab | 2412 | IS_ONLY_DISPERSION | TRIAL | 10.587 / 10.859 / 327.7 | 48feebf4cd954fa46e318a7f6a7476b855bb1b547cb32be833ab5ce99a9b368a |
| p10.delta-mode4-global-4h.v1 | rrun_79900fb0c2916241c6372adf8b885389 | 564 | IS_ONLY_DISPERSION | TRIAL | 8.599 / 8.866 / 324.8 | b6080129270040863e890cd661e7f5af7a13624a2480cdeccb39c0e9f0337e6b |
| p10.delta-mode4-global-1d.v1 | rrun_490f8eeb6959b365ca1164f4c7df8740 | 725 | IS_ONLY_DISPERSION | TRIAL | 8.945 / 9.104 / 326.0 | 1e4f29c7533c238dc767e6dda76829593afb98e69ef7af6edd76765b2592e5fe |
| p10.delta-mode4-causal-1h.v1 | rrun_ce53f7f50bce82f0493bf7a5a1699f2e | 1356 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 12.003 / 12.285 / 326.0 | afcb6ed3110dc12fe90361d868b00c6de7fc3b289850d6f7e11e558181d9622c |
| p10.delta-mode4-causal-1m.v1 | rrun_bf0750723c896dd0405d21dbf0f8465e | 63660 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 11.694 / 11.882 / 414.1 | d790ff9e5724332324d225b52376e342c8bb1899d0294911c10c59365494d4dd |
| p10.delta-mode4-causal-5m.v1 | rrun_25d58012355508bc80b4668d83e52ec2 | 12972 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 9.292 / 9.532 / 342.2 | 88200375cf81ac0c2dd21ab8bccc2d374718773e48986279861a6b10f520a088 |
| p10.delta-mode4-causal-15m.v1 | rrun_55cc861aae2bd3ad2b9c1820514aa9d1 | 4524 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 8.894 / 9.113 / 329.4 | 3ec0b04b5ef067817f1f520585a466c041fee2dd632d5ba513f656703045640b |
| p10.delta-mode4-causal-30m.v1 | rrun_af2c0b5a618743c90955e584c7603cdd | 2412 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 8.812 / 8.980 / 327.5 | a1e0cf93678688556272bb7b80df275a5ee08e5561e9936a5690246f695191cc |
| p10.delta-mode4-causal-4h.v1 | rrun_0c146e81618c0782dc9c9f948bf57ea3 | 564 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 9.043 / 9.278 / 324.6 | de3994b3faad0d9e5b70d4be21849e5d5ed0450151fd235cb0fb62097dd49088 |
| p10.delta-mode4-causal-1d.v1 | rrun_90e4e66731cc39301df4b6e6aad5bde9 | 725 | IS_ONLY_DISPERSION | STUDY_LOCAL_TRIAL | 8.766 / 8.867 / 325.1 | f46b79f86fbbb683924f946f55e853fdd9d20bbf17c601dc3e1eca701a2fea51 |
| p10.delta-mode5-global-1h.v1 | rrun_a68cdbc5f10c5d3375389a96e0782415 | 1356 | FULL_SAMPLE_ROBUST | TRIAL | 8.435 / 8.652 / 326.5 | 11e044c2ee125fd8c0781f941b7d615c1d5ff043d7ea3d7cfa9f237367e8fde9 |
| p10.delta-mode5-global-1m.v1 | rrun_51461e08070bb15a5c0f788f4bfd490a | 63660 | FULL_SAMPLE_ROBUST | TRIAL | 12.241 / 12.521 / 414.7 | 8cfe610629e8d0504367f45b773645cc879e212e30de669c21d7f43dae4104e2 |
| p10.delta-mode5-global-5m.v1 | rrun_77db1bfe27a51ea0132fe695d759d83c | 12972 | FULL_SAMPLE_ROBUST | TRIAL | 9.112 / 9.302 / 343.7 | 8e0db54c1050b8cd96938fc39bd4129bec9198f3116c6afc0f4f6aaae89f1123 |
| p10.delta-mode5-global-15m.v1 | rrun_9b18dc2a719785ed595369c0acfec17e | 4524 | FULL_SAMPLE_ROBUST | TRIAL | 9.091 / 9.301 / 329.5 | c37872e08a8fe7c53a86db07b28f2139999e04985ca90b694e49474ba6fb65fd |
| p10.delta-mode5-global-30m.v1 | rrun_93dcfe9938f91163c0fc964c05a95136 | 2412 | FULL_SAMPLE_ROBUST | TRIAL | 8.425 / 8.571 / 328.2 | ece0716b11691c062455b67449cf0aec67629059b2d5994ef305bc31f5f8a537 |
| p10.delta-mode5-global-4h.v1 | rrun_a5a0d719784e996ca30930ec47ede053 | 564 | FULL_SAMPLE_ROBUST | TRIAL | 8.971 / 9.152 / 325.9 | 8a4db4f875796df223e17edb8e20dc94ec8f74a641f534fbe0d7a79fe2fddfc5 |
| p10.delta-mode5-global-1d.v1 | rrun_1a07f2465ce00a58483cc5b6bd938f82 | 725 | FULL_SAMPLE_ROBUST | TRIAL | 8.383 / 8.506 / 325.9 | 80f53b86d4999d10b74df55a7e3a235606b07cf7519f0f9d9f7dadc90a65b113 |

All recipes retain 120 CPU /240 wall seconds,4GiB address-space and128MiB enforced scratch ceilings; no preview-long exception. Scratch high-water is NOT_MEASURED, not inferred from output bytes. Native engine trial/fold/output counts and blob hashes are bound by each immutable child receipt in the private summary.

All35 foreign-workspace reads return404; malformed cursors return400. Byte custody/Stage4 params+bundle MATCH; RC missing count0.

- Worker image: `sha256:bc8e865a2e37a3eaa426748047382a11f459505619358f9b7abacccf51431d85`.
- Worker image: `sha256:1d9d5f86ef6d9750083213e0d2df1c1d08afce3a2ae87f9df3884831d1e42259`.
- Worker image: `sha256:5bf7fca9426b487e67b5199a1a636a03c28923d5f1d1808cbe7eff615e30feb3`.
- Control API image: `sha256:ec777762c91b70bafbd5fc9c003df708b6acaed647860cff160da1e34f554851`.
- Control API image: `sha256:62b8a258d50ca669a5e1de28aa919c11cd4a4a6bce476a8f647b52999f59e2d4`.
- Control API image: `sha256:c80073d6f5e33c0384900a2169ad03c3a50b475421c1532cf183d7ef9cb55d49`.
- Control API image: `sha256:7d283597c0f55c8f0c1f393fb8357d037e9431883040feaa10442f3242e63f64`.

[Implementation, activation, rollback, cleanup and frontend handoff](FULL_04_OTHER_MODES_2026-10-06.md).
