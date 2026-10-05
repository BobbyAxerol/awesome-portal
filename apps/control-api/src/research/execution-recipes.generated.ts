// Generated from apps/portal/registry/research-execution-recipes.v1.json; do not hand-edit.
export const EXECUTION_RECIPE_TABLE = {
  "schema_version": "research.execution-recipes.v1",
  "recipes": [
    {
      "profile_id": "p04.fixed-qualification.v1",
      "profile_digest": null,
      "descriptor": {
        "schema_version": "research.full01.legacy-fixed-descriptor.v1",
        "profile_id": "p04.fixed-qualification.v1",
        "adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "child_limits": {
          "cpu_seconds": 45,
          "wall_seconds": 90
        }
      },
      "adapter_kind": "DELTA_FIXED",
      "work_schema_version": "research.p10.delta-work.v1",
      "resource_class": "p10-delta-rsi-v1",
      "queue_class": "INTERACTIVE",
      "public_profile": {
        "profile_id": "p04.fixed-qualification.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "trial_count": {
          "min": 1,
          "max": 1
        },
        "random_seed": null,
        "max_span_days": null,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1",
          "research.requested-spec.v2"
        ],
        "seed_policy": "FORBIDDEN",
        "trial_default": 1,
        "early_stopping_policy": "FORBIDDEN"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER"
      ],
      "source_requirement": "IMMUTABLE_DELTA_BINDING",
      "budgets": {
        "memory_bytes": 4294967296,
        "cpu_seconds": 45,
        "wall_seconds": 90,
        "scratch_bytes": 67108864,
        "io_bytes": 536870912,
        "file_bytes": 2097152,
        "fd_limit": 128,
        "planning_max_bars": 100000,
        "max_warmup_bars": 100000
      },
      "preview_override": null
    },
    {
      "profile_id": "p10.delta-signal-notional-wfo.v1",
      "profile_digest": "b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca",
      "descriptor": {
        "schema_version": "research.p10.delta-wfo-profile.v1",
        "profile_id": "p10.delta-signal-notional-wfo.v1",
        "adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "frequency": "weekly",
        "window_mode": "expanding",
        "timeframe": "1h",
        "max_span_days": 92,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "optuna_trials": 3,
        "random_seed": 42,
        "current_source": {
          "source_adapter_id": "rs02.quantbt-signal-notional-wfo.v1",
          "profile_id": "rs02.delta-signal-notional-wfo.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.p10.delta-wfo-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-signal-notional-wfo.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 92,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "frequency": "weekly",
        "window_mode": "expanding",
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE"
      ],
      "source_requirement": "IMMUTABLE_DELTA_BINDING",
      "budgets": {
        "memory_bytes": 4294967296,
        "cpu_seconds": 120,
        "wall_seconds": 240,
        "scratch_bytes": 134217728,
        "io_bytes": 536870912,
        "file_bytes": 16777216,
        "fd_limit": 128,
        "planning_max_bars": 100000,
        "max_warmup_bars": 100000
      },
      "preview_override": {
        "flag": "FEATURE_RESEARCH_PREVIEW_LONG_WFO",
        "python_flag": "PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO",
        "required_environment": "local",
        "required_auth_mode": "dev",
        "min_trials": 2,
        "max_trials": 400,
        "cpu_seconds": 1800,
        "wall_seconds": 3600
      }
    },
    {
      "profile_id": "p10.delta-signal-notional-wfo.v2",
      "profile_digest": "d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0",
      "descriptor": {
        "schema_version": "research.p10.delta-wfo-profile.v2",
        "profile_id": "p10.delta-signal-notional-wfo.v2",
        "adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 92,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "rs02.quantbt-signal-notional-wfo.v1",
          "profile_id": "rs02.delta-signal-notional-wfo.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.p10.delta-wfo-work.v2",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-signal-notional-wfo.v2",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 92,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "frequency": null,
        "window_mode": null,
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "requested_spec_versions": [
          "research.requested-spec.v2"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE"
      ],
      "source_requirement": "IMMUTABLE_DELTA_BINDING",
      "budgets": {
        "memory_bytes": 4294967296,
        "cpu_seconds": 120,
        "wall_seconds": 240,
        "scratch_bytes": 134217728,
        "io_bytes": 536870912,
        "file_bytes": 16777216,
        "fd_limit": 128,
        "planning_max_bars": 100000,
        "max_warmup_bars": 100000
      },
      "preview_override": {
        "flag": "FEATURE_RESEARCH_PREVIEW_LONG_WFO",
        "python_flag": "PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO",
        "required_environment": "local",
        "required_auth_mode": "dev",
        "min_trials": 2,
        "max_trials": 400,
        "cpu_seconds": 1800,
        "wall_seconds": 3600
      }
    },
    {
      "profile_id": "p10.delta-signal-notional-causal-inner.v1",
      "profile_digest": "60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1",
      "descriptor": {
        "schema_version": "research.p10.delta-causal-inner-profile.v1",
        "profile_id": "p10.delta-signal-notional-causal-inner.v1",
        "adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 92,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",
        "inner_constraints": {
          "fold_bounds": {
            "min": 2,
            "max": 16
          },
          "frequencies": [
            "weekly",
            "monthly",
            "quarterly"
          ],
          "window_modes": [
            "expanding",
            "rolling"
          ],
          "train_window_pattern": "^[1-9][0-9]{0,4}(D|h)$"
        },
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "current_source": {
          "source_adapter_id": "rs02.quantbt-signal-notional-causal-inner.v1",
          "profile_id": "rs02.delta-signal-notional-causal-inner.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.p10.delta-causal-inner-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-signal-notional-causal-inner.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 92,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "frequency": null,
        "window_mode": null,
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "requested_spec_versions": [
          "research.requested-spec.v2"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",
        "inner_constraints": {
          "fold_bounds": {
            "min": 2,
            "max": 16
          },
          "frequencies": [
            "weekly",
            "monthly",
            "quarterly"
          ],
          "window_modes": [
            "expanding",
            "rolling"
          ],
          "train_window_pattern": "^[1-9][0-9]{0,4}(D|h)$"
        }
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE"
      ],
      "source_requirement": "IMMUTABLE_DELTA_BINDING",
      "budgets": {
        "memory_bytes": 4294967296,
        "cpu_seconds": 120,
        "wall_seconds": 240,
        "scratch_bytes": 134217728,
        "io_bytes": 536870912,
        "file_bytes": 16777216,
        "fd_limit": 128,
        "planning_max_bars": 100000,
        "max_warmup_bars": 100000
      },
      "preview_override": null
    },
    {
      "profile_id": "p10.vn-stock-daily-observed-fixed.v1",
      "profile_digest": "acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e",
      "descriptor": {
        "schema_version": "research.p10.vn-daily-observed-fixed-profile.v1",
        "profile_id": "p10.vn-stock-daily-observed-fixed.v1",
        "adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "dataset_id": "vn-stock-daily",
        "symbol": "FPT",
        "timeframe": "1d",
        "source_timezone": "Asia/Ho_Chi_Minh",
        "clock_basis": "OBSERVED_SOURCE_LOCAL_DATE_V1",
        "warmup_bars": 300,
        "warmup_semantics": "LAST_N_OBSERVED_PREDECESSORS_V1",
        "max_span_days": 732,
        "optuna_trials": 1,
        "parameter_policy": "P04_FIXED_PARAMETERS_V1",
        "account_model": "GENERIC_SIGNAL_NOTIONAL_RESEARCH_NOT_VN_VENUE",
        "calendar_authority": "NOT_PUBLISHED",
        "child_limits": {
          "cpu_seconds": 45,
          "wall_seconds": 90
        }
      },
      "adapter_kind": "VN_OBSERVED_FIXED",
      "work_schema_version": "research.p10.vn-observed-fixed-work.v1",
      "resource_class": "p10-vn-observed-fixed-v1",
      "queue_class": "INTERACTIVE",
      "public_profile": {
        "profile_id": "p10.vn-stock-daily-observed-fixed.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "trial_count": {
          "min": 1,
          "max": 1
        },
        "random_seed": null,
        "max_span_days": 732,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "FORBIDDEN",
        "trial_default": 1,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "vn-stock-daily",
        "symbol": "FPT",
        "source_timezone": "Asia/Ho_Chi_Minh",
        "clock_basis": "OBSERVED_SOURCE_LOCAL_DATE_V1",
        "calendar_authority": "NOT_PUBLISHED",
        "warmup_semantics": "LAST_N_OBSERVED_PREDECESSORS_V1",
        "account_model": "GENERIC_SIGNAL_NOTIONAL_RESEARCH_NOT_VN_VENUE"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_VN_OBSERVED_PROFILE"
      ],
      "source_requirement": "VN_OBSERVED_EXACT_QUALIFICATION",
      "budgets": {
        "memory_bytes": 4294967296,
        "cpu_seconds": 45,
        "wall_seconds": 90,
        "scratch_bytes": 67108864,
        "io_bytes": 536870912,
        "file_bytes": 2097152,
        "fd_limit": 128,
        "planning_max_bars": 100000,
        "max_warmup_bars": 100000
      },
      "preview_override": null
    },
    {
      "profile_id": "p17.imported-signal-notional.v1",
      "profile_digest": "f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298",
      "descriptor": {
        "schema_version": "research.p17.imported-signal-notional-profile.v1",
        "profile_id": "p17.imported-signal-notional.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "parameter_mode": "declared-pins-v1",
        "source_contract": "research.alpha-source.v1",
        "context_contract": "research.imported-alpha-context.v1",
        "output_contract": "research.imported-signal-notional-output.v1",
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240,
          "max_source_bytes": 262144,
          "max_signal_points": 250000
        }
      },
      "adapter_kind": "IMPORTED_FIXED",
      "work_schema_version": "research.p17.imported-work.v1",
      "resource_class": "p17-imported-signal-notional-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p17.imported-signal-notional.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "ALPHA_DECLARED",
        "trial_count": {
          "min": 1,
          "max": 1
        },
        "random_seed": null,
        "max_span_days": null,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "ALPHA_DECLARED",
        "trial_default": 1,
        "early_stopping_policy": "FORBIDDEN"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION"
      ],
      "source_requirement": "IMMUTABLE_IMPORTED_BINDING",
      "budgets": {
        "memory_bytes": 4294967296,
        "cpu_seconds": 120,
        "wall_seconds": 240,
        "scratch_bytes": 134217728,
        "io_bytes": 536870912,
        "file_bytes": 16777216,
        "fd_limit": 128,
        "planning_max_bars": 100000,
        "max_warmup_bars": 4096
      },
      "preview_override": null
    }
  ],
  "qualification_references": [
    {
      "profile_id": "p04.fixed-qualification.v1",
      "kind": "LEGACY_COMPATIBILITY_REFERENCE",
      "receipt_path": "upgrade/research_loop/evidence/P04/phase-report.md",
      "receipt_sha256": "e5abfa01b98c6dd2dd31be8bba0fc860c0ff940575447c2db9c942d084911283",
      "recipe_digest": "00136ee2c90b6ce0b35d13f2df3d8494d6f4c38a4df405fd0d9acdcc727fe013"
    },
    {
      "profile_id": "p10.delta-signal-notional-wfo.v1",
      "kind": "LEGACY_COMPATIBILITY_REFERENCE",
      "receipt_path": "upgrade/research_loop/evidence/P23/P23_QUALIFICATION_CLOSEOUT_2026-10-05.md",
      "receipt_sha256": "1d55c24164e8a5cdb487f63edb9671b42202a805f7b07b5c07fd166401ab24cb",
      "recipe_digest": "cf81a5690c2b2d26c467f8f63c384f4782c4345d484b9c1e0b32e4d463057214"
    },
    {
      "profile_id": "p10.delta-signal-notional-wfo.v2",
      "kind": "LEGACY_COMPATIBILITY_REFERENCE",
      "receipt_path": "upgrade/research_loop/evidence/P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md",
      "receipt_sha256": "3cc4b8f1456c71d7771e96cd8f5ca8667f95c7feef7503c8dacc6f53da0de58d",
      "recipe_digest": "a0b748908970e811c11ed2b7262f1e4e37586abccd1a91e9c82046a7e4c67c17"
    },
    {
      "profile_id": "p10.delta-signal-notional-causal-inner.v1",
      "kind": "LEGACY_COMPATIBILITY_REFERENCE",
      "receipt_path": "upgrade/research_loop/evidence/P10/B8_CAUSAL_INNER_CURRENT_SOURCE_2026-10-02.md",
      "receipt_sha256": "2fbb79c3ac99cdcdf7c386c898685914fe91b23615877ebf72d2b2bf13eb3092",
      "recipe_digest": "9cded8e84aef1cec2f128fb0da997b9aacf1638db7458e4b4f77df119a564a40"
    },
    {
      "profile_id": "p10.vn-stock-daily-observed-fixed.v1",
      "kind": "LEGACY_COMPATIBILITY_REFERENCE",
      "receipt_path": "upgrade/research_loop/evidence/P10/B8_VN_FIXED_PRODUCT_VERTICAL_2026-10-02.md",
      "receipt_sha256": "7c6cf8def81fa0cde91f09fbf1edcf1a51fe5500e7df875fbaff062ccadcc7b0",
      "recipe_digest": "9edd017c7be84bc242827f8e36830c8af063017f79efd53987608f6e3f9b9267"
    },
    {
      "profile_id": "p17.imported-signal-notional.v1",
      "kind": "LEGACY_COMPATIBILITY_REFERENCE",
      "receipt_path": "upgrade/research_loop/evidence/P10/E17_IMPORTED_DRAFT_EXECUTION_BACKEND_RECEIPT_2026-09-27.md",
      "receipt_sha256": "71a4ff87498f181a966097ad4fbce90920262e5d2934f2470e1f7fdab057145a",
      "recipe_digest": "196b770bcc1197e9f6b4417756b3a6106bfea3c3a62afca279788cf3fdd19f0c"
    }
  ],
  "preflight_policy": {
    "maximum_active_unbound_per_actor": 16,
    "reuse": "IDENTICAL_FRESH_SOURCE_REVALIDATED_UNBOUND_ONLY",
    "expiry_extension": false
  },
  "setup_bounds": {
    "maximum_profiles": 256,
    "maximum_bytes": 1048576
  }
} as const;
export const EXECUTION_RECIPE_REVISION = "e635e7986c90587e5253ee461b1e74d94db5fddcd4aa9eac20b976ad59c6774c" as const;
