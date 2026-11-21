# FULL-06 /6a — Immutable percent-equity product qualification

Verdict: **63/63 PRODUCT_RUN_QUALIFIED** for percent-equity only. Ordinary authenticated P08 → P10 → confined pinned QuantBT1.1.1 → P05 → eight named reads through RC.
Not acceptance of6b–6f, browser, production or release. Other route input adapters and genuine inputs are listed in the implementation ledger.
All98 predecessor recipes and their qualification rows deep-equal FULL05 at5e854933; predecessor table SHA-256: `923b91aca25bfa2b042cf902911941ffdecd5acfe2b9763160e99de6a21a1c29`.
AV `av_delta_rsi_polynomial_alpha_1_0_2` is separate from protected historical notional AV1.0.1. Allocation0.1 is10% of live equity on signal changes, not2,000 currency units. Capital20,000; leverage3; canonical one-way fee0.0005; slippage0; fundingoff. Sealed config bytes are compared for each actual run.
Percent-equity results do not emit per-bar fees/funding/turnover: these remain null, never zero or invented fills. Absent order/fill/trade fields remain null; an actually source-published empty collection counts zero. Source equity/positions/candles and independently emitted lifecycle audit are retained; positions retain legacy engine semantics, not an assertion of native target units. Source unknown/unspecified execution tokens and null accounting certification are preserved, not converted into a native account certification. The native-prepared-WFO clock token does not certify a final native account runtime.
Private summary SHA-256: `15acbe741df768c7f43aa2125fe2ae1406467c0f2bb2fd19e5121fd500a4f8a3`.
| Exact recipe | Real run | Bars | CPU /wall seconds /RSS MiB | Receipt SHA-256 |
| --- | --- | ---: | --- | --- |
| p10.delta-pct-equity-wfo-temporal-1m.v1 | rrun_cff27b2f839003b2db0b16e4309e7cc6 | 63660 | 8.990 /9.172 /384.8 | 5526301a192310e009eb1f948a0117712da0cd3555b8da488e4ee191002fb876 |
| p10.delta-pct-equity-causal-inner-1m.v1 | rrun_917ed6bf9b2d373892cfb815b4dfd088 | 63660 | 10.192 /10.372 /386.7 | 69ebbffb9efa3f095d623bbc711ba4fbad4b8284f286ff54750eaa528e0c05d4 |
| p10.delta-pct-equity-per-fold-decay-1m.v1 | rrun_3d5e7997d780b95c7c01afa65b9f18f0 | 63660 | 8.680 /8.820 /381.9 | 2f22a8b8e5ce2091ada65ebdec2bcce626e4d378e32c9e83a890d465b9f19c56 |
| p10.delta-pct-equity-three-window-optimized-1m.v1 | rrun_d2b6b1849a2d08b2375b4d38954a2102 | 50700 | 8.400 /8.541 /365.8 | 9c7353ba433bc3540288d7efc430a7737df1e0423d08869706c8488aca8ee53d |
| p10.delta-pct-equity-wfo-temporal-5m.v1 | rrun_d85605f25fba4a2a01e14d97b83f7b34 | 12972 | 8.205 /8.369 /333.1 | ae61f86448fa01e5dadaad9a7b592f2125df48d2ff6769590c1c39863105e356 |
| p10.delta-pct-equity-causal-inner-5m.v1 | rrun_3fb6f22bd556618c2afc9b802b617c45 | 12972 | 8.306 /8.519 /332.4 | 732d7fadb38e1a9cb23facbbefab3899b055db7e0f6eec1ffe2c5177e73c4546 |
| p10.delta-pct-equity-per-fold-decay-5m.v1 | rrun_0917eadae3fae1d18f3226e117f1c8f4 | 12972 | 9.645 /9.780 /331.5 | 5f357a47058c4bfa09ed02bc4e95b0cdefe05d737d38c7f3c5b75d6a03f1aa14 |
| p10.delta-pct-equity-three-window-optimized-5m.v1 | rrun_df710f1c70fd1c579927ebee9d10cf0a | 10380 | 7.865 /8.004 /331.2 | e192b7a534cc403d1eb9d3ffdc0b3d345ffa32ee0adb3c2886becbb8d4894c09 |
| p10.delta-pct-equity-wfo-temporal-15m.v1 | rrun_d2fea71f7b00b0c3ea39c966de499ac3 | 4524 | 7.067 /7.151 /323.1 | 2c98190fc5904369e442d54314793d3eefc8718454172092b7dce4e10642a6d0 |
| p10.delta-pct-equity-causal-inner-15m.v1 | rrun_1281a92d97d25690287aa2d74686b388 | 4524 | 8.410 /8.611 /322.5 | 9bd1486f3e62da9081b117a48d304558e3da75813a01df4bd3b3e29e7af33a4c |
| p10.delta-pct-equity-per-fold-decay-15m.v1 | rrun_76dcb072aa5370809d7e0b7bf2fbbc98 | 4524 | 7.266 /7.411 /323.4 | e9da018c2b2afcd65b6b80abf3d742ac3dd588a7991306b355f401456d4766c1 |
| p10.delta-pct-equity-three-window-optimized-15m.v1 | rrun_5e9b15f45f191b3474ec816eb3fd9bdf | 3660 | 7.304 /7.402 /323.3 | 77d897e9a710999756b791392fba86cfbe8a6feb7ed549c850abecaf04ada21e |
| p10.delta-pct-equity-wfo-temporal-30m.v1 | rrun_050bc6f60edee2429f0a6f4c0134ec27 | 2412 | 9.456 /9.708 /322.7 | 687dcc44b6de9a40404fe1d4098800b1eca13c177852c3182c8513bc200d697f |
| p10.delta-pct-equity-causal-inner-30m.v1 | rrun_010a227b9812a8abf77a415aa96e6a75 | 2412 | 7.615 /7.758 /321.0 | 027d0e86747bdbdfedc243253091fd02919b03eb19db44c1c96a7f3d6a350d38 |
| p10.delta-pct-equity-per-fold-decay-30m.v1 | rrun_66bdd875149f5e7829ce526b90bab35c | 2412 | 7.415 /7.559 /321.1 | 60fd524e8eb5c9c9c3fb8446c9baa9e991973a1ae9daa76ed92382379763f8d9 |
| p10.delta-pct-equity-three-window-optimized-30m.v1 | rrun_5fe2ebae3dd875c5f94387ac469ab121 | 1980 | 7.396 /7.566 /321.7 | 933bfded1a83b7488c0c68ba03127e54f908fede77caac053e7ab5c85bb7c78e |
| p10.delta-pct-equity-wfo-temporal-1h.v1 | rrun_069f8691e7d4a0af66b2f1a9bca181e8 | 1356 | 7.195 /7.304 /320.7 | f111a324903195ac3b9f9405d43e27033bce34a7c78b7100248cc17dc7e6d482 |
| p10.delta-pct-equity-causal-inner-1h.v1 | rrun_3d5aedb94fa0f8b16e69880b4380dda9 | 1356 | 7.945 /8.113 /320.4 | d9814ba0694618152ee313ac4fe3a28163f6ab2f7c671f95349c6a96a9ae5f6a |
| p10.delta-pct-equity-per-fold-decay-1h.v1 | rrun_03cabbd1b6848b6cd83f9a0e8a5d36e5 | 1356 | 7.260 /7.482 /319.9 | 9ac0ca42729cc80c76ba62ab79ef4ddbc4daebb3819b1f8754eef18f73f944b1 |
| p10.delta-pct-equity-three-window-optimized-1h.v1 | rrun_130befe6d6e4d3d37dcd231de6dcd89e | 1140 | 7.259 /7.411 /321.0 | 4132b1286890505f8c2c232aec94b7f77ea963628068455662555f67bd4f3903 |
| p10.delta-pct-equity-wfo-temporal-4h.v1 | rrun_173e3914d70dbd5558d846ff9dbc037a | 564 | 7.227 /7.362 /321.1 | c24cb0c942c8f4930a26b140e8ea6e31afa9080ba6714c7b77743a146ed98b1e |
| p10.delta-pct-equity-causal-inner-4h.v1 | rrun_47270190e15776e3508de7cb44f0248e | 564 | 7.945 /8.161 /319.6 | 83d7c46fa8413a8111740cf8d5add9f780306e46c8f63b9b6566168a3fc053d6 |
| p10.delta-pct-equity-per-fold-decay-4h.v1 | rrun_50fa41ca55668a7bb2bad2f26765a3c1 | 564 | 7.693 /7.862 /320.9 | 10c34b274d53abb215515f3e02a030d451f375ef33a34ab17c0713f8abcea324 |
| p10.delta-pct-equity-three-window-optimized-4h.v1 | rrun_5d0614a72934fcfe6c2a08c6134df7b0 | 510 | 7.402 /7.537 /319.5 | 546f6026d2a31e9bd3f5208e84c55aa38c5426cb21360c54c64a250526ba3f59 |
| p10.delta-pct-equity-wfo-temporal-1d.v1 | rrun_ab0d897fb1753fdb1b7e6cc3e0db9c35 | 725 | 7.457 /7.653 /320.6 | 3df718308fef44e3ab79452d2912951d7b3a2f550141a210f08e0dae301737b9 |
| p10.delta-pct-equity-causal-inner-1d.v1 | rrun_c889f5010611e708adf9e7b711788366 | 725 | 8.415 /8.568 /320.7 | 4bb0fb28742613a13cc33464fd2befd53ae9a222eb4c760155e7bb8ab7f9f33e |
| p10.delta-pct-equity-per-fold-decay-1d.v1 | rrun_714a785a7da413be0c6d4086099c7416 | 725 | 8.229 /8.427 /321.2 | bebd700568d5532f48cfb2d33b766f25906d73d8bf018f3f1204957b93c99f67 |
| p10.delta-pct-equity-three-window-optimized-1d.v1 | rrun_fbf2c99a73738a1518b1a75747345319 | 666 | 9.158 /9.419 /320.9 | e028453ac55b65076b495d74bb1eda327bc805ecba6425c9c9251918eb0c947e |
| p10.delta-pct-equity-mode3-global-1h.v1 | rrun_f5d1e15f3f3d5a07256f977ff0116048 | 1356 | 8.878 /9.006 /379.4 | 64d4883eff3cc17d462758a99014b06439b622b98338afe0c7deaede01be2ae9 |
| p10.delta-pct-equity-mode3-global-1m.v1 | rrun_76273ef82f82393346fbee74fc36773f | 63660 | 13.242 /13.529 /443.7 | f6e2da4af4adaf7113a6e366258bb6c6d896ed4dd284695116d06d04150d6a79 |
| p10.delta-pct-equity-mode3-global-5m.v1 | rrun_ed084aee9475afa8e056e8f63b8c4c0c | 12972 | 9.413 /9.545 /391.6 | 6e7cfd1c85ccf5751196aaece15af4d2cc63dd32fde72143792c32cf24d5bee3 |
| p10.delta-pct-equity-mode3-global-15m.v1 | rrun_85670187848ed02a4a61822512fd34df | 4524 | 9.762 /10.052 /382.0 | 8b43a498f1dbd5190ded4f9e06f043443e9560e6b691b8d1e8830c9d038cfba9 |
| p10.delta-pct-equity-mode3-global-30m.v1 | rrun_9785f977b00f76a903865f131ff96edc | 2412 | 8.976 /9.154 /380.7 | 2a50c9a7294551c928a97d0ff3c9c4cec8fdf72c3ae02816a48fedd346b40d21 |
| p10.delta-pct-equity-mode3-global-4h.v1 | rrun_f559a045d69f4e8a4e67e9f8602a4ffc | 564 | 9.009 /9.212 /379.5 | 80f73cf307bb7444787d368b8c2ec3b2af8c3a245ddf0f0126a681e417963633 |
| p10.delta-pct-equity-mode3-global-1d.v1 | rrun_a546ff80cec4297c4263d21dfab75025 | 725 | 8.825 /8.907 /378.0 | dd56755b73c8f1a70708da18aa00faee71896cbee87908cef4370ff32ac585af |
| p10.delta-pct-equity-mode2-global-1h.v1 | rrun_959e2cc354b91b6824205fef078cb11a | 1356 | 9.373 /9.506 /335.4 | 792c90c9f26c388fe77784cfa6dea547fa4842c81f88a2f0155086e43b3895fc |
| p10.delta-pct-equity-mode2-global-1m.v1 | rrun_3e0344ce4940cd7530bd3683b2d06c39 | 63660 | 11.278 /11.478 /398.6 | ae060ba114b48027578848963d99cb536c1faf5b8121e8bccb4a8478ca9aea86 |
| p10.delta-pct-equity-mode2-global-5m.v1 | rrun_c032130877dbf610b2e543ad67f2da33 | 12972 | 10.035 /10.360 /346.4 | 98e04f388ceb66d11a48c4c3f860f0a777acb7596821864fb1897415cdfbc913 |
| p10.delta-pct-equity-mode2-global-15m.v1 | rrun_6b062ad460dfd1e86710a8fc9c95faba | 4524 | 9.459 /9.711 /337.9 | 13defef5bfa3e536610b186d190349303f6aff52b612a71721a7d36e3e253f35 |
| p10.delta-pct-equity-mode2-global-30m.v1 | rrun_8be6bf819381d44e0a44742ed508b869 | 2412 | 9.395 /9.660 /336.7 | 7cb17760dbccc01ab467fb682bd8befe410812c3d18c802eae40544cd09fafb1 |
| p10.delta-pct-equity-mode2-global-4h.v1 | rrun_329c0c445ea6fd5f91a647411a35ed48 | 564 | 9.265 /9.506 /334.7 | fad9ad00b47a7717e6a35898501cc8974cedec8415fbd534886df5a24bf98203 |
| p10.delta-pct-equity-mode2-global-1d.v1 | rrun_08b30b9dc963eff641adf5e1cdac9627 | 725 | 8.733 /9.016 /333.7 | 62e066426cb5355d009dbe189c06a2d532cdf70244d1bb01c56928900bc34661 |
| p10.delta-pct-equity-mode4-global-1h.v1 | rrun_0f42dda54ab8393b1b42d68e3d077378 | 1356 | 7.342 /7.468 /319.3 | e6c23804e41ddeffd9ee6ae17d08d6d94344b64255e982ade25d62c2fff8bbcc |
| p10.delta-pct-equity-mode4-global-1m.v1 | rrun_52bc866075fe4902ba7da1b761106b21 | 63660 | 11.921 /12.188 /384.3 | 32ec9db1c8cee5e73b36f5ceebe31b918a5fbf89660c63b37bc21ad3b71c5bd4 |
| p10.delta-pct-equity-mode4-global-5m.v1 | rrun_75d4588fc8e5518af6036babf26d4a55 | 12972 | 8.315 /8.454 /333.8 | 312b157d70d9229b61f3e9db4cae85a2d06df7660f02ac9b488f2a367faf5b46 |
| p10.delta-pct-equity-mode4-global-15m.v1 | rrun_959bae23080b71052e2adef700699f5e | 4524 | 7.924 /8.098 /323.8 | f2bed7630471a2026b601e2937a018109bc4c7cb4ce68ed4198962b9f6916ed3 |
| p10.delta-pct-equity-mode4-global-30m.v1 | rrun_249a98db6ca0664dbf90b351796fadf6 | 2412 | 9.794 /10.056 /321.8 | b1bc1d7366de87f5e00aa20315affe3376609adc544a3ddbf55ea3da9c8b78db |
| p10.delta-pct-equity-mode4-global-4h.v1 | rrun_ede8ab50885e077241cd3b244e3185ba | 564 | 7.345 /7.539 /319.5 | 05661bbd410a8f4a7bb78ef085766eb7b8e42899263c9f989aa94bc0031014ad |
| p10.delta-pct-equity-mode4-global-1d.v1 | rrun_a5d3c3cc806e12b0c0333d43b6688678 | 725 | 8.059 /8.264 /321.1 | 51ee1d46e00a482bb8213a6f87b949d9da78d0f2151466babe342ee94afe8a40 |
| p10.delta-pct-equity-mode4-causal-1h.v1 | rrun_71a34ef70c1a5834cf523d56f8bef7c0 | 1356 | 7.900 /8.055 /320.3 | 51799f00d96e9fb87e1f6a78bb292477c1e8f94f6a4c3618582b167d43405c04 |
| p10.delta-pct-equity-mode4-causal-1m.v1 | rrun_a6355c9db6e1aa7c2fe4b38441bf14e2 | 63660 | 10.613 /10.917 /388.2 | aaa745506dc6f95f865df98ee914a1d4e21037fc48e3ee6dbbd11dc995ba03b8 |
| p10.delta-pct-equity-mode4-causal-5m.v1 | rrun_e7817e6391a9124d6b12a240d0f68d5d | 12972 | 9.313 /10.826 /334.3 | 7e608aba3048ceeb5b8b743f80a4d5d929cfdbde776984a1968aba728becfc66 |
| p10.delta-pct-equity-mode4-causal-15m.v1 | rrun_f9687d02475245fe587875ad825fd4a5 | 4524 | 8.330 /8.588 /323.5 | 34f816f3dc32fc2442bc3040ffc0de8198d9e24c68fe95206b66b2a5a712b569 |
| p10.delta-pct-equity-mode4-causal-30m.v1 | rrun_dbd8448c67bae7f63ff68faf3f7fbdde | 2412 | 8.017 /8.263 /322.3 | e1f6cee0e4cf0af1b5438e8e92f4ec47effe25836d535612e6d78a51fbc03c8b |
| p10.delta-pct-equity-mode4-causal-4h.v1 | rrun_c8b9bb8e5020cecc849e49ea01a1a5d5 | 564 | 7.431 /7.556 /320.5 | e83178b72b0716ac1983f1b469c9b9d642edcb4b4b38e2d228f042a8717fb901 |
| p10.delta-pct-equity-mode4-causal-1d.v1 | rrun_7065a35f686e8e67ebae9e6c8e372ff6 | 725 | 7.863 /8.117 /320.6 | f25f2f324bef0b14e70e12f869f1cbfa7557e30cab83a63f5afb3e4c3e96fd18 |
| p10.delta-pct-equity-mode5-global-1h.v1 | rrun_cc45d144af76c8fc4e5fc2c88b6a65fb | 1356 | 7.361 /7.456 /321.9 | 1678c9dd7e4f987308cf66f3a00e3dc60197a515e72f3f65e533400399f6b51b |
| p10.delta-pct-equity-mode5-global-1m.v1 | rrun_3a6189d803c00acb753bf604ff639a25 | 63660 | 10.779 /11.009 /399.2 | 7d1d9bba923a80fc2e72d3491c32d64b0e2437d658f17e0d5258b9470a5ab2cf |
| p10.delta-pct-equity-mode5-global-5m.v1 | rrun_d60b19bbcf718ef8e5fe9bc27a151467 | 12972 | 9.645 /9.762 /337.2 | 86435653e68ec94870398325c184a907d61a1477686cda8a8958daec0e4eb5ae |
| p10.delta-pct-equity-mode5-global-15m.v1 | rrun_3308cb18a02ce69b333714f86c186163 | 4524 | 8.435 /8.624 /325.1 | ab462a6331e06a5a2d21ffb9f5482ca2375ce05569f4840053aaaa060a7213f5 |
| p10.delta-pct-equity-mode5-global-30m.v1 | rrun_802299c7a9e772da8d23464e4a127dd6 | 2412 | 8.250 /9.890 /322.2 | 101bbacbbc7714a059e318b8acee99058b67a69fe12177c79aa32eec3ee842d2 |
| p10.delta-pct-equity-mode5-global-4h.v1 | rrun_09b2fca02442edc62068d4e159d13dd7 | 564 | 8.097 /8.623 /320.1 | b81229aa856a08a65a305e1503c1d3af17f9b3579e3cb78b6f98ca62add17d0a |
| p10.delta-pct-equity-mode5-global-1d.v1 | rrun_a5b521bc930533bd1161238e653a21c6 | 725 | 8.474 /9.044 /321.3 | 3ceaeab279ab30ebcad22b716c471b5ca8dc4909f98a5cc5528030dd630c7fe7 |

Each exact recipe retains120CPU/240wall seconds,4GiB address space,128MiB scratch and100,000 target bars. Scratch high-water NOT_MEASURED; no preview-long override. Each uses300 actual indexed target-bar predecessors,7 closed fixed-UTC HMD clocks. Native mode/selection/holdout disclosure stays unchanged.
All63 foreign-workspace reads404; malformed cursors400; retained byte custody and Stage4 params/bundle MATCH; RC missing count0. Old AV/seals/candidate qualifications are never rewritten.

- Worker image: `sha256:4e4846655c482b2035c18441b9c94fc65f04e3023b32c066bb15c8ac7eb9a4ba`.
- Control API image: `sha256:9286f62fd56ff0f3d4ca20c9bddeeac772317c9e3a856b4b1a4234e54fd8abd7`.

[Delivery, exact remaining route gaps, rollback and frontend handoff](FULL_06_ROUTE_FAMILIES_2026-10-06.md).
