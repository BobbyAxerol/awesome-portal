// Generated from the native binding registry; do not hand-edit.
export const NATIVE_DELTA_BINDING_TABLE = [
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_3",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.3",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "intrabar_bracket",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "3f7fa95d8bc173ff641dfd3d8d4153f023d8af0703119201a8a5a6d81762480c"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "0670eadc53fbe302a7b420c67a8a568e33ab4f04223ac25381399538f934a028"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_4",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.4",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "reactive",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "3f7fa95d8bc173ff641dfd3d8d4153f023d8af0703119201a8a5a6d81762480c"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "25fcb22eb0c6e624d56418359269459cadbd5529b0438173190908b9c8733e21"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_5",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.5",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "event_driven",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "3f7fa95d8bc173ff641dfd3d8d4153f023d8af0703119201a8a5a6d81762480c"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "4ebcec6a18740465ec81e10f4560cb3cb72e651f75370fd2dcc99971fe5bac44"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_6",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.6",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "intrabar_bracket",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "c890ca50e958b39775b3325f0fe9ad18fbb02e50e239a36f1f68b6e2e5435772"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "aabd8677a24d1fc447b93f2b549513273b0ed382ea943121fe2e6348da55503d"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_7",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.7",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "reactive",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "c890ca50e958b39775b3325f0fe9ad18fbb02e50e239a36f1f68b6e2e5435772"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "856b0a42b51af1bcd1cc00b20315d25088b04670d265b6057f69addd9beae085"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_8",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.8",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "event_driven",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "c890ca50e958b39775b3325f0fe9ad18fbb02e50e239a36f1f68b6e2e5435772"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "928a572f2393eff021e0a0684ce4bb5c2b50a3cacfa485204d74e6c41f5fd3e6"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_9",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.9",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "intrabar_bracket",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "24648f971c22f8018c0a04810201d7b1d8ee1ea60614d37b936d79a41df6db5d"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "15cb147a294ac5ce76c27781481336b4b17fc35f1e8fc1f4a33405756e4b059c"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_10",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.10",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "reactive",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "24648f971c22f8018c0a04810201d7b1d8ee1ea60614d37b936d79a41df6db5d"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "4e8562ff17534c045a4e09ed443abba2bc9134c558b10f3f6dc4111bd2ef629b"
  },
  {
    "schema_version": "research.native-delta-binding.v1",
    "alpha_id": "delta-rsi-polynomial-alpha",
    "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_11",
    "declared_contract": {
      "schema_version": "research.alpha-source.v1",
      "version": "1.0.11",
      "entrypoint": "strategy.delta_rsi:generate_signals",
      "required_columns": [
        "open",
        "high",
        "low",
        "close",
        "volume"
      ],
      "timeframes": [
        "1h"
      ],
      "warmup_bars": 300,
      "determinism": {
        "seed_required": false,
        "external_io": false
      },
      "parameter_space": {
        "window": {
          "minimum": 20,
          "maximum": 60,
          "step": 2
        },
        "rsi_l": {
          "minimum": 12,
          "maximum": 30,
          "step": 1
        },
        "signalLength": {
          "minimum": 3,
          "maximum": 20,
          "step": 1
        },
        "len_atr1": {
          "minimum": 5,
          "maximum": 20,
          "step": 1
        },
        "len_atr2": {
          "minimum": 25,
          "maximum": 60,
          "step": 1
        },
        "rvol": {
          "minimum": 1,
          "maximum": 2.5,
          "step": 0.1
        },
        "len_vol": {
          "minimum": 8,
          "maximum": 40,
          "step": 2
        },
        "slpercent": {
          "minimum": 0.7,
          "maximum": 2.5,
          "step": 0.1
        }
      },
      "execution": {
        "adapter_id": "full03.delta-rsi.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "event_driven",
        "protocol": "three_window_decay",
        "parameter_mode": "FIXED_NATIVE_DELTA_V1"
      },
      "provenance": {
        "protected_kernel_sha256": "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
        "specification_sha256": "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730",
        "native_adapter_sha256": "24648f971c22f8018c0a04810201d7b1d8ee1ea60614d37b936d79a41df6db5d"
      }
    },
    "fixed_parameters": {
      "window": 32,
      "rsi_l": 20,
      "signalLength": 9,
      "len_atr1": 10,
      "len_atr2": 42,
      "rvol": 1.6,
      "len_vol": 16,
      "slpercent": 1.3
    },
    "adapter_contract_digest": "ff592163a4f64e8bd6ad5ca10e56ad238ac3fc0914926545217e97663943d329"
  }
];
