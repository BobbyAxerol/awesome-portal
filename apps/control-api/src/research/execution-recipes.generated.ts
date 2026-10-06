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
    },
    {
      "profile_id": "p10.delta-signal-notional-per-fold-decay.v1",
      "profile_digest": "60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e",
      "descriptor": {
        "schema_version": "research.p10.delta-per-fold-decay-profile.v1",
        "profile_id": "p10.delta-signal-notional-per-fold-decay.v1",
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
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full02.quantbt-signal-notional-per-fold-decay.v1",
          "profile_id": "full02.delta-signal-notional-per-fold-decay.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.p10.delta-per-fold-decay-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-signal-notional-per-fold-decay.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL02_PROFILE"
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
      "profile_id": "p10.delta-signal-notional-three-window-optimized.v1",
      "profile_digest": "0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9",
      "descriptor": {
        "schema_version": "research.p10.delta-three-window-optimized-profile.v1",
        "profile_id": "p10.delta-signal-notional-three-window-optimized.v1",
        "adapter_id": "p04.delta-rsi.v1",
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "1h",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 92,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full02.quantbt-signal-notional-three-window.v1",
          "profile_id": "full02.delta-signal-notional-three-window.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        }
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.p10.delta-three-window-optimized-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-signal-notional-three-window-optimized.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 92,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL02_PROFILE"
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
      "profile_id": "p10.delta-wfo-temporal-1m.v1",
      "profile_digest": "a9f786f9f8da0378cab5b2cf93cbb77690a3bbaba78d675723013a32eedcd882",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-1m.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 66,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-1m.v1",
      "profile_digest": "ed6cf47dfc0a77a896991c3196b1673ea1912012f1e56448e50ccf6f5bc623fd",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-1m.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 66,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-1m.v1",
      "profile_digest": "96160c961c743d41a8e5d67df785ee1dbd4e83cca5978cbd7018813749608ecc",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-1m.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 66,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-1m.v1",
      "profile_digest": "cf654a316b3e2c5a9b8536212d3f86b0eeeba8f5140171530593cc4f88df5969",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "1m",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 66,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-1m.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1m",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 66,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-wfo-temporal-5m.v1",
      "profile_digest": "9ae851e6ddcafdde05b7241f65d9e27682bbebc8390119ce14c823b3f08a9cab",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-5m.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 333,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-5m.v1",
      "profile_digest": "efc3e8506c0e66ef7f3270a3d81d7b6eb679c05b35b38aacfa2f6c5baa43830d",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-5m.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 333,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-5m.v1",
      "profile_digest": "6709ca1c255e82e4a3ecc3024bc66b2bc1d5fb71349c9021dae2132d1791f3a0",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-5m.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 333,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-5m.v1",
      "profile_digest": "bc86229bf1664e817da2922f8343dda075b83c15f6a481c10ce0d015700b3083",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "5m",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 333,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-5m.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "5m",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 333,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-wfo-temporal-15m.v1",
      "profile_digest": "e2405bf06f6fb7190311276721485ed73f0d717eb38faa02a0fad094305829dc",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-15m.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 1000,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-15m.v1",
      "profile_digest": "c229226cbaf5a7236f6248b2f43005d48e1d1c6bcfefa6239c7a747fa54cf008",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-15m.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 1000,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-15m.v1",
      "profile_digest": "442dec251b367f28077ed88d515ce11326f944e0eab5e1d292dfc71d55d6d857",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-15m.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 1000,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-15m.v1",
      "profile_digest": "72a823455db1897e8ded989cb15126d7e503238f0afd3b1ecfc4ddc79509835d",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "15m",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 1000,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-15m.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "15m",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 1000,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-wfo-temporal-30m.v1",
      "profile_digest": "7af17c07b120342a30bfa9b7252d54b57cd4ed93e563ecd6169ebbdb35ab019c",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-30m.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 2000,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-30m.v1",
      "profile_digest": "b7994636b11c0124b86df5a027b7a8f195026517770e25c5c2f5488d2e54ccf0",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-30m.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 2000,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-30m.v1",
      "profile_digest": "3e20f9da3fc5e81c5ed2400f52d5d3a89f10847e632155ca468505620eddceef",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-30m.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 2000,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-30m.v1",
      "profile_digest": "61b0f469a93e76e5f990230612275f21c919c9e8fdea48bf423696d0c08a69b2",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "30m",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 2000,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-30m.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "30m",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 2000,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-wfo-temporal-1h.v1",
      "profile_digest": "d43576f1d4283afa5cd1f0592c92ff9a1af0d2075e8ef9d27e0687e34a902975",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-1h.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-1h.v1",
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
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-1h.v1",
      "profile_digest": "c145e3b3c4a1fc7fa76a80b32f205c9eab8a29d97c0dec132656aa5934da7307",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-1h.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-1h.v1",
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
        "max_span_days": 3650,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-1h.v1",
      "profile_digest": "afdd1d2e80a63072918f25a5433481f7e6d7b0655286e4f7dedc3fbb4c100d48",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-1h.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-1h.v1",
      "profile_digest": "ef1270e94b3c17181303b2590609e9cda0f59b5804233cb15adcec7072eefcc2",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "1h",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 3650,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-1h.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 3650,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-wfo-temporal-4h.v1",
      "profile_digest": "a96338dd2e3b382c3373290911bd6164762593d735c779ed96a644b379797c38",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-4h.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-4h.v1",
      "profile_digest": "c7226e52e49caeb5c2e9d5d5a2157526a1e3b8201bd869add40a57e3eebe0ba0",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-4h.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 3650,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-4h.v1",
      "profile_digest": "835e08c344e495bb792e59e58ef03f04e5969975dc61b09712920a66e329f1cb",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-4h.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-4h.v1",
      "profile_digest": "88101493443c80daf78df3718d111ec890ea96d74cff99daf8fc09745317ccca",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "4h",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 3650,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-4h.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 3650,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-wfo-temporal-1d.v1",
      "profile_digest": "76fd5c233e7d4d08ad1bf0840234e112eb27491fa07e36e660790bad5cb03ff2",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-wfo-temporal-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full03.quantbt-signal-notional-wfo-temporal-1d.v1",
          "profile_id": "full03.delta-signal-notional-wfo-temporal-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-wfo-temporal-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-causal-inner-1d.v1",
      "profile_digest": "3cf944d1630794bcdc9d75c63be030e7de331080e8063313040e2d100abe56b8",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-causal-inner-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full03.quantbt-signal-notional-causal-inner-1d.v1",
          "profile_id": "full03.delta-signal-notional-causal-inner-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-causal-inner-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 3650,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-per-fold-decay-1d.v1",
      "profile_digest": "3546b1fc433f2995d3e484bd9ea79611930be4a19549d4ee8b17732a3ee61eda",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-per-fold-decay-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-per-fold-decay-1d.v1",
          "profile_id": "full03.delta-signal-notional-per-fold-decay-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-per-fold-decay-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-three-window-optimized-1d.v1",
      "profile_digest": "4a8abf3bbb5c0cba1d87e93df97e24c98259426e2ebbf21cbdb598d4969b7fbf",
      "descriptor": {
        "schema_version": "research.full03-delta-profile.v1",
        "profile_id": "p10.delta-three-window-optimized-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "1d",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 3650,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full03.quantbt-signal-notional-three-window-optimized-1d.v1",
          "profile_id": "full03.delta-signal-notional-three-window-optimized-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "DELTA_THREE_WINDOW_OPTIMIZED",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-three-window-optimized-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 3650,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-1h.v1",
      "profile_digest": "9ff3faba04aca57c06273a04ba964e57fe27e4173c4cf8e23bc18dc628104c6b",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-1h.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 3650,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-1m.v1",
      "profile_digest": "5bfffbab43c7188eb1aefd79b24f2d956b50c950946ba6a114d9bc2abd171c25",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-1m.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 66,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-5m.v1",
      "profile_digest": "97ecb01a8bd432c38b5d7c8913d065533a5c7b7d5887f3832ce326f705f9956b",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-5m.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 333,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-15m.v1",
      "profile_digest": "aa7fca2ff8a869b3e093c79e87ab6326fdcf8ca6114cb33e00ee872a5feb857e",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-15m.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 1000,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-30m.v1",
      "profile_digest": "ec305b64d599b5dcba3f0bf155d13b39ee65f4542c0ae24f04d392fe9c7fdf17",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-30m.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 2000,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-4h.v1",
      "profile_digest": "290d57773732557b46a28a925f2d72b7f5cb9f649a26060122b5ed5b739153ba",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-4h.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 3650,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode3-global-1d.v1",
      "profile_digest": "3c0c5e82125b0897791eec9444b92d82737e1ae4929ef222c628f9b9a79fff10",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode3-global-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode3-global-1d.v1",
          "profile_id": "full04.delta-signal-notional-mode3-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode3-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 3650,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-1h.v1",
      "profile_digest": "b1b7711868dc03111c9ad923ffbe6837028818786be4133de36d7abad938aea7",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-1h.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-1m.v1",
      "profile_digest": "f9b5ea5c974b56ecce1b9dd38e21ac98cbafb9f55c2af756330b397b7f1d4f69",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-1m.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 66,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-5m.v1",
      "profile_digest": "8ed1ffce1a41ea64f44c1d45b55066cb1e3306f869504f22f4024fbd6677f7ac",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-5m.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 333,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-15m.v1",
      "profile_digest": "f0e76c9dd0d3377b699d66b8c8b079cf6a4125e44f142afdcf195aee72e1f481",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-15m.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 1000,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-30m.v1",
      "profile_digest": "be3336abf6d659e61d357cca8c911094c92ad530e9d3d679f41448e47715131d",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-30m.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 2000,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-4h.v1",
      "profile_digest": "d61512f448b572053502fca57fd8e7f45b13137cd53536a517432173528c0aa4",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-4h.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode2-global-1d.v1",
      "profile_digest": "7ed040be22c1a81d17b8c4198f36808a7713c32b112d7e26e7ac28e7c69bc824",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode2-global-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode2-global-1d.v1",
          "profile_id": "full04.delta-signal-notional-mode2-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode2-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-1h.v1",
      "profile_digest": "d3f431e55afbf9df5defcdcf56e6e3c6a50b28777c5ef9f4e1ccc3063a724b93",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-1h.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-1m.v1",
      "profile_digest": "b4df036ede4495ec079564813b22bcde480fe4df86bf3ce4a1ddf4ed5a3f3880",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-1m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 66,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-5m.v1",
      "profile_digest": "ac4e04c079027158c48da396856959449333dde74e60dce45c990492c28ad0db",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-5m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 333,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-15m.v1",
      "profile_digest": "8d1dd99925a2f5938d3ea8567831c8f61fdd8f132e61c73cce30d9c3adf48155",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-15m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 1000,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-30m.v1",
      "profile_digest": "4c261b0ccde17de14ff4ed94d9f107bb29046b1863db7f39d764a2ece9127141",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-30m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 2000,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-4h.v1",
      "profile_digest": "2b23b63997eac811a026904e8c67f33d4bd2cc231709468661a1a66649cb6f8b",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-4h.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-global-1d.v1",
      "profile_digest": "733acf79dbc67fa0e22cd174ff1c83b3256ed430410084b094dc439d373bc1fa",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-global-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-global-1d.v1",
          "profile_id": "full04.delta-signal-notional-mode4-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-1h.v1",
      "profile_digest": "f9ce9ec00d8da087733abee25b83e03bcd8f0b0c30bf9a0f74101bb6a5e2b27e",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-1h.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-1m.v1",
      "profile_digest": "8fcd8a19a4ee3626cfc1aac0f5a4652e83ce563f497d74519e35e2bf12297299",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-1m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 66,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-5m.v1",
      "profile_digest": "f422d261393b58324dd92b913bad494b19429c3d499948e1040fef97eebcee26",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-5m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 333,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-15m.v1",
      "profile_digest": "1ae46d8faffed3ba450535f292c53a3b3f53fa2f2bc78f838ea118519ab37944",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-15m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 1000,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-30m.v1",
      "profile_digest": "a3e805300237498e933444599b72e2876108b70a9ba7c28daaa3ea8557f0943a",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-30m.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 2000,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-4h.v1",
      "profile_digest": "c274002565714f94d61b0e7acb0374dd980d4f6a9497562575a72f89906b501b",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-4h.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode4-causal-1d.v1",
      "profile_digest": "956d3dbc819211c7caf3ec714adbac8b2f6fc2973bb826a4308c0b8088d90e48",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode4-causal-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode4-causal-1d.v1",
          "profile_id": "full04.delta-signal-notional-mode4-causal-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode4-causal-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-1h.v1",
      "profile_digest": "7b5b430746cf83c5cf16cc80c04d9b400b6afc3de1baa4719995a8e350d46db9",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-1h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-1h.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-1m.v1",
      "profile_digest": "a6f15a99d03c44be6ae95b7e226f72ae7c4b4f6a0e95be3afe5c467f1af9bbd6",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-1m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 66,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-1m.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-1m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 60000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-1m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "1m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 66,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-5m.v1",
      "profile_digest": "ffb56f1d31ce48baebf6f6cbda191ed9aa9636a5e4b9bfa07e555d8fda796f57",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-5m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "5m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 333,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-5m.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-5m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 300000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-5m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "5m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 333,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-15m.v1",
      "profile_digest": "bfeaf40e37863c841316b8ed5895fdcf0907c155964d6c59ec015ecfd14c2056",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-15m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "15m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-15m.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-15m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 900000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-15m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "15m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 1000,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-30m.v1",
      "profile_digest": "2e0e0575849e5253a36552f4269bc62604b90eace458ac9c8eff6d4a898de27f",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-30m.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "30m",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-30m.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-30m.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 1800000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-30m.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "30m",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 2000,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-4h.v1",
      "profile_digest": "0c1d2b9ce333bbe27d9d35e8a1a849c6b0112f559ee49c2f7c494ddd319cde3c",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-4h.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-4h.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.delta-mode5-global-1d.v1",
      "profile_digest": "b3f7df6fee1ff8e9647cfaaa52ac088f763001b172ae0e3f548233c00ce701d8",
      "descriptor": {
        "schema_version": "research.full04-delta-profile.v1",
        "profile_id": "p10.delta-mode5-global-1d.v1",
        "adapter_id": "full03.delta-rsi.v1",
        "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full04.quantbt-signal-notional-mode5-global-1d.v1",
          "profile_id": "full04.delta-signal-notional-mode5-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "alpha_id": "delta-rsi-polynomial-alpha",
          "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_1",
          "adapter_id": "full03.delta-rsi.v1",
          "adapter_contract_digest": "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b",
          "warmup_bars": 300
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "DELTA_WFO",
      "work_schema_version": "research.full03-delta-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.delta-mode5-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_FULL03_PROFILE",
        "FEATURE_RESEARCH_FULL04_PROFILE"
      ],
      "source_requirement": "FULL03_IMMUTABLE_DELTA_BINDING",
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
      "profile_id": "p10.imported-wfo-temporal-1h.v1",
      "profile_digest": "30a040a681faedc107a6d0d93323b64b01344143179dd66cc4fba315aa126383",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-wfo-temporal-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
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
          "source_adapter_id": "full05.quantbt-imported-wfo-temporal-1h.v1",
          "profile_id": "full05.imported-wfo-temporal-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-wfo-temporal-1h.v1",
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
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-causal-inner-1h.v1",
      "profile_digest": "6a2b467a8236de394b55867ee299af55f0ac78a4614478f1b847bfce274721c3",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-causal-inner-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
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
          "source_adapter_id": "full05.quantbt-imported-causal-inner-1h.v1",
          "profile_id": "full05.imported-causal-inner-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-causal-inner-1h.v1",
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
        "max_span_days": 3650,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-per-fold-decay-1h.v1",
      "profile_digest": "0aa25a01146d8d5a5e96f5b51aa0617a4ac250a669509a288ba68b0af68386a1",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-per-fold-decay-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-per-fold-decay-1h.v1",
          "profile_id": "full05.imported-per-fold-decay-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-per-fold-decay-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-three-window-optimized-1h.v1",
      "profile_digest": "5b4351c898308841a9c04c95c5f964c8466b2805e66c7410f4e6819e6fe78b46",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-three-window-optimized-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "1h",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 3650,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-three-window-optimized-1h.v1",
          "profile_id": "full05.imported-three-window-optimized-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-three-window-optimized-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 3650,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-wfo-temporal-4h.v1",
      "profile_digest": "516bedfb7b0ab78f7f1b096cf3aa2050b9447e980528a4636039fdfaeaf5f340",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-wfo-temporal-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full05.quantbt-imported-wfo-temporal-4h.v1",
          "profile_id": "full05.imported-wfo-temporal-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-wfo-temporal-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-causal-inner-4h.v1",
      "profile_digest": "dff635880a25cfa25c029c3753871964d9c82288f62d4a4cc347895ecbf3b768",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-causal-inner-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full05.quantbt-imported-causal-inner-4h.v1",
          "profile_id": "full05.imported-causal-inner-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-causal-inner-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 3650,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-per-fold-decay-4h.v1",
      "profile_digest": "1ee30bbe73858b3240b9bdd738bf45038bb61fcd2c97b450e4cf980a7612e288",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-per-fold-decay-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-per-fold-decay-4h.v1",
          "profile_id": "full05.imported-per-fold-decay-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-per-fold-decay-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-three-window-optimized-4h.v1",
      "profile_digest": "21fe55b875cd682339a402b89ee144cb6a3e98d0a7c0a641636202d679e2bfa1",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-three-window-optimized-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "4h",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 3650,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-three-window-optimized-4h.v1",
          "profile_id": "full05.imported-three-window-optimized-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-three-window-optimized-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 3650,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-wfo-temporal-1d.v1",
      "profile_digest": "4da4171d23820602bbf5a839caf1594fe924a39bf269a6119707dafa71d2363e",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-wfo-temporal-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full05.quantbt-imported-wfo-temporal-1d.v1",
          "profile_id": "full05.imported-wfo-temporal-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-wfo-temporal-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-causal-inner-1d.v1",
      "profile_digest": "bdfe21e16be87de6001d01f8e0baed7ad2ffcdc471828d3334dd2be01170d504",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-causal-inner-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
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
          "source_adapter_id": "full05.quantbt-imported-causal-inner-1d.v1",
          "profile_id": "full05.imported-causal-inner-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-causal-inner-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "max_span_days": 3650,
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
        },
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-per-fold-decay-1d.v1",
      "profile_digest": "9781d2569998c9234933f5a68b0b77c2c7c2ad8d58281e26d20beea4686c9fd8",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-per-fold-decay-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-per-fold-decay-1d.v1",
          "profile_id": "full05.imported-per-fold-decay-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-per-fold-decay-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "per_fold_decay",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-three-window-optimized-1d.v1",
      "profile_digest": "f92ee58812d46adc9c06022b90b34e50922a5f218fb858cb6e566acd403c02c1",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-three-window-optimized-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v1",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "timeframe": "1d",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_span_days": 3650,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "trial_scope": "GLOBAL_STUDY",
        "independent_holdout": true,
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-three-window-optimized-1d.v1",
          "profile_id": "full05.imported-three-window-optimized-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m"
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-three-window-optimized-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "three_window_decay",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "random_seed": 42,
        "max_span_days": 3650,
        "fold_bounds": null,
        "frequency": null,
        "window_mode": null,
        "requested_spec_versions": [
          "research.requested-spec.v1"
        ],
        "seed_policy": "LOCKED",
        "trial_default": 3,
        "early_stopping_policy": "FORBIDDEN",
        "dataset_id": "crypto-binance-1m"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode3-global-1h.v1",
      "profile_digest": "63ee66f010532ff4a05a8cbbd4de9a009d5c6ce81b1b70dc747aaa40e965a0a1",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode3-global-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode3-global-1h.v1",
          "profile_id": "full05.imported-mode3-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode3-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 3650,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode3-global-4h.v1",
      "profile_digest": "6d809cf090903c854a7a6896fec44296979979d8683d1f8679f45435f1c472ea",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode3-global-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode3-global-4h.v1",
          "profile_id": "full05.imported-mode3-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode3-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 3650,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode3-global-1d.v1",
      "profile_digest": "1f53fbd2ec1ca686ab23a2ce7902497792142ab82cd855c42de0180f488c4dc0",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode3-global-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode3-global-1d.v1",
          "profile_id": "full05.imported-mode3-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "flat_selector": "centroid",
          "flat_top_fraction": 1,
          "flat_eps": 1,
          "flat_min_samples": 2
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode3-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_3_flat_minima",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 5,
          "max": 5
        },
        "max_span_days": 3650,
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
        "trial_default": 5,
        "early_stopping_policy": "FORBIDDEN",
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode2-global-1h.v1",
      "profile_digest": "1506aa6b68d9057b6cf25449aab911e3d0641767749193c6708cf1d23c904f45",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode2-global-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode2-global-1h.v1",
          "profile_id": "full05.imported-mode2-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode2-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode2-global-4h.v1",
      "profile_digest": "ab815ddf6f75be363d0bde068d4c42cc09fee05193dcf89ac150959f0c84d5d6",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode2-global-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode2-global-4h.v1",
          "profile_id": "full05.imported-mode2-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode2-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode2-global-1d.v1",
      "profile_digest": "d4356079a8e1262b540b7a4465c89c3c2ad60cd57a053e6a4128015362166db8",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode2-global-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode2-global-1d.v1",
          "profile_id": "full05.imported-mode2-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "scoring_backend": "proxy",
          "sbb_samples": 32,
          "sbb_block_length": 20,
          "sbb_simulation": "stationary",
          "candidate_selection_metric": "mean_is_sharpe"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode2-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_2_sbb",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode4-global-1h.v1",
      "profile_digest": "3ab15458bb3f6e2021dc1caef72d99e04cb04d5e8657dc7c2b867231947c1fde",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode4-global-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode4-global-1h.v1",
          "profile_id": "full05.imported-mode4-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode4-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode4-global-4h.v1",
      "profile_digest": "d13741101a385d15e885f6ac065091d4444b6fb1697013b9867fad143db4165f",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode4-global-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode4-global-4h.v1",
          "profile_id": "full05.imported-mode4-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode4-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode4-global-1d.v1",
      "profile_digest": "6ffd40856484a52187dd97c2ae8ddb9c08c35a685e9625aaf114a8ffbd1d587a",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode4-global-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode4-global-1d.v1",
          "profile_id": "full05.imported-mode4-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode4-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode4-causal-1h.v1",
      "profile_digest": "04795e9d1e2292e50ffb164503a98ebef6fa3672cfc12b167516f57cfca29450",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode4-causal-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode4-causal-1h.v1",
          "profile_id": "full05.imported-mode4-causal-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode4-causal-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode4-causal-4h.v1",
      "profile_digest": "e29100ad8e3a890cfbac2ec512c230931e06985387f863c00d3d19ca6ec4c4df",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode4-causal-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode4-causal-4h.v1",
          "profile_id": "full05.imported-mode4-causal-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode4-causal-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode4-causal-1d.v1",
      "profile_digest": "68671e730fe568327e0e8c5c2a5db7bb971ccacedf36427d1c25eeeccc6c982c",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode4-causal-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 2,
          "max": 16
        },
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode4-causal-1d.v1",
          "profile_id": "full05.imported-mode4-causal-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48,
        "optimizer_settings": {
          "candidate_selection_metric": "is_only_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode4-causal-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_4_is_only_robust",
        "optimization_schedule": "per_fold_causal",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "PER_OUTER_FOLD_STUDY",
        "max_total_trials": 48
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode5-global-1h.v1",
      "profile_digest": "616d1e2844b8a4f794a3336e393c8f5ca5a498a3c74b0750d1d90bfa2c0c1467",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode5-global-1h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
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
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode5-global-1h.v1",
          "profile_id": "full05.imported-mode5-global-1h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 3600000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode5-global-1h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "1h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode5-global-4h.v1",
      "profile_digest": "1858583ef5ec15c52875f127d550ad4eb75f8953bbfeea7829c817bcc04ce1c9",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode5-global-4h.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "4h",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode5-global-4h.v1",
          "profile_id": "full05.imported-mode5-global-4h.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 14400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode5-global-4h.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "4h",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.imported-mode5-global-1d.v1",
      "profile_digest": "797de50fe123f8bbe7b607256666f8b07bb30becba51ca07e0dad5184788853e",
      "descriptor": {
        "schema_version": "research.full05-imported-profile.v1",
        "profile_id": "p10.imported-mode5-global-1d.v1",
        "adapter_id": "p17.imported-signal-notional.v1",
        "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
        "engine_release_id": "er_quantbt_111",
        "requested_spec_version": "research.requested-spec.v2",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "timeframe": "1d",
        "frequencies": [
          "weekly",
          "monthly",
          "quarterly"
        ],
        "window_modes": [
          "expanding",
          "rolling"
        ],
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
        },
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "random_seed": 42,
        "max_guard_bars": 10000,
        "inner_validation": "NOT_APPLICABLE",
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "current_source": {
          "source_adapter_id": "full05.quantbt-imported-mode5-global-1d.v1",
          "profile_id": "full05.imported-mode5-global-1d.v1"
        },
        "child_limits": {
          "cpu_seconds": 120,
          "wall_seconds": 240
        },
        "alpha_binding_requirements": {
          "source_contract": "research.alpha-source.v1",
          "binding_contract": "research.imported-search-binding.v1",
          "adapter_id": "p17.imported-signal-notional.v1",
          "adapter_contract_digest": "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6",
          "max_warmup_bars": 4096
        },
        "source_clock": {
          "clock_basis": "FIXED_UTC_INTERVAL_V1",
          "bar_interval_ms": 86400000,
          "source_timezone": "UTC",
          "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"
        },
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY",
        "optimizer_settings": {
          "candidate_selection_metric": "full_robust",
          "is_subperiods": 3,
          "flat_selector": "medoid"
        }
      },
      "adapter_kind": "IMPORTED_SEARCH",
      "work_schema_version": "research.full05-imported-work.v1",
      "resource_class": "p10-delta-wfo-v1",
      "queue_class": "HEAVY",
      "public_profile": {
        "profile_id": "p10.imported-mode5-global-1d.v1",
        "engine_release_id": "er_quantbt_111",
        "execution_route": "signal_notional",
        "protocol": "advanced",
        "optimization_mode": "mode_5_full_robust",
        "optimization_schedule": "global",
        "timeframe": "1d",
        "random_seed": 42,
        "trial_count": {
          "min": 3,
          "max": 3
        },
        "max_span_days": 3650,
        "fold_bounds": {
          "min": 1,
          "max": 1
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
        "inner_validation": "NOT_APPLICABLE",
        "dataset_id": "crypto-binance-1m",
        "trial_scope": "GLOBAL_STUDY"
      },
      "feature_flags": [
        "FEATURE_RESEARCH_RUN_PRODUCER",
        "FEATURE_RESEARCH_WFO_PROFILE",
        "FEATURE_RESEARCH_IMPORTED_EXECUTION",
        "FEATURE_RESEARCH_FULL05_PROFILE"
      ],
      "source_requirement": "IMPORTED_IMMUTABLE_SEARCH_BINDING",
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
    },
    {
      "profile_id": "p10.delta-signal-notional-per-fold-decay.v1",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_02_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "aa66781df94bd4dcb9567a1fc3c856586e36c4f42b0be7969b1df1859d406859",
      "recipe_digest": "7a208ce129e15bd1fdb6f4d411b2061ae8a1e54ab6a421a19b6e09e5e7e79716"
    },
    {
      "profile_id": "p10.delta-signal-notional-three-window-optimized.v1",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_02_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "aa66781df94bd4dcb9567a1fc3c856586e36c4f42b0be7969b1df1859d406859",
      "recipe_digest": "b1c678862ac808ad159dfe552d4b4c7c200aeb0016efca03b33765042f93b993"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-1m.v1",
      "recipe_digest": "c7ca66c51c5e551b4bec4d34264d779f3e40dac2c6c7d6f703983a133f324152",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-1m.v1",
      "recipe_digest": "d81fe4ec6a7a48980ad4fd6d5f3ff3f44039616121328a43d80d63ce8f6dcbb3",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-1m.v1",
      "recipe_digest": "257db249b3ebf7612bb3b6f6da641e47b98d7b2b8da5b496a942d71f929672d8",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-1m.v1",
      "recipe_digest": "3612b20dfb479b1c1d4dbc7539a8986f0e1fe2597544609058dfbaef24199a96",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-5m.v1",
      "recipe_digest": "683233e84ccacf13236f64f6c44fed2cda71383d15e79e680847c0541728bd41",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-5m.v1",
      "recipe_digest": "220f95a6b67de1de84933ec2bb90ae4a793bd31a672760817c5bfbba2d754261",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-5m.v1",
      "recipe_digest": "3c6ac70a73e52c52336c17be713b9cae88d5cc265066a5bb8e93c6adc0fa46d2",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-5m.v1",
      "recipe_digest": "3f869c22975be8021c40e76cc94e2ad6e0e35c2569861f6c63f4e7e2bea29c13",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-15m.v1",
      "recipe_digest": "3feccbaee4f201635f9522042715e57539b82fee2b6b1d4424ade86a8e089deb",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-15m.v1",
      "recipe_digest": "f3785570cbeb5fb343f1f0d91c5eb50eb7fe67c3c968dc7d2f26a3cfff131baf",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-15m.v1",
      "recipe_digest": "d857df2358ae54ca54280eb21e26932954f55d61073cc87ea40788859091ed71",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-15m.v1",
      "recipe_digest": "c2205253d5da0eba39017f4859f3b74538388a94ea28c3ff97e63ee9b55e7a8e",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-30m.v1",
      "recipe_digest": "f2f54a23a6c3e4dfeea03dfc6cb9acf7e7f9d2170164a001ec225d4753e1f60a",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-30m.v1",
      "recipe_digest": "29c9e25bd4643eebff26839fe373a4f5ae829db9f07892be250e303e23d6b4f0",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-30m.v1",
      "recipe_digest": "f24c9d1706268e9e44d25ea395930315bbe1fa10aea6e158449c78448fa5cf32",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-30m.v1",
      "recipe_digest": "5ca6c6325a6fc61202d01d74375f96d5395efa262aada35a7f0270f3cc19509c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-1h.v1",
      "recipe_digest": "a41fcdb4514b0775b85e7ada37a1d5ebc964c825758bd6e6656f84406a38b9c2",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-1h.v1",
      "recipe_digest": "9c0d24a796b968fed8a75b7d91ecfc2d6cd6d0365f82df8068ef3e646b494ec0",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-1h.v1",
      "recipe_digest": "b86b7d723187661c7a11618aac969ad3058ba289e37652cb61f35d38b9823fab",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-1h.v1",
      "recipe_digest": "fa6417f5c72982bb91de609f1aafe45da2d29f8d28b83211906eeae554cb87ab",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-4h.v1",
      "recipe_digest": "6eb59a8402c68569d996abaf1d958dc676daa90c8a0ad1b67c82aaf072d34836",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-4h.v1",
      "recipe_digest": "a56e5b49f74b80fdd6539dbc0ffa840129ebac90c815f39c6408093c757f376c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-4h.v1",
      "recipe_digest": "a7a62c116152b7f59caf694dff75c4c31354f945c8540851679bd749ad47fc22",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-4h.v1",
      "recipe_digest": "cf7218a670f80f96ca2f0fbb5cc013a1558f2c43e3d32960a5624ad7b6f5cbca",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-wfo-temporal-1d.v1",
      "recipe_digest": "e5104b9c29cf3d41f365d00bf4297b9f3508c2860a4936c6a7a4249f8f4af273",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-causal-inner-1d.v1",
      "recipe_digest": "3f3857d02ee0da571fe568f18cb8ceb304a472e35626c4cecbbd00233f6d8ae5",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-per-fold-decay-1d.v1",
      "recipe_digest": "dde7427bfcf46b3f243d6a6122f8ebd329dcc2faba88eebf94e841cba2a5fa29",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-three-window-optimized-1d.v1",
      "recipe_digest": "d79bda2fc12f35d5f0a6f8b735159963d1da9974ec681039eb58b173974934e2",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324"
    },
    {
      "profile_id": "p10.delta-mode3-global-1h.v1",
      "recipe_digest": "da91fbcf6cec2987f1fe4652f6a8afc3bf631b4578eb81955e426faac5a84359",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode3-global-1m.v1",
      "recipe_digest": "43c23dcb544b6466347a4a57b67f83c0602eb9d26cd8ad4068212778fc108fac",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode3-global-5m.v1",
      "recipe_digest": "0c4151b021f26503a5364082d2a5d916d235f53aa33f3c1ceec196b97bd1019a",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode3-global-15m.v1",
      "recipe_digest": "7321e277cb4290dd26b746ce81163a8a5dade53ab0a054fabf438c959c5d7b32",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode3-global-30m.v1",
      "recipe_digest": "5dfb2554ffd6198174d5a0f7cec3dfc6ea7007c2f6027029e447eb18554d46e7",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode3-global-4h.v1",
      "recipe_digest": "55fd613822760d6c62f7416b8d6040548faac66cbe2ed88a9772158e8dd6c037",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode3-global-1d.v1",
      "recipe_digest": "1013254639017729ee3afd5d825c6d55fa456e5b93dfa5c14615957db6ad4d48",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-1h.v1",
      "recipe_digest": "179c7a6717994fc2c4ec42c0f42c9bac1657bd07a77c7a9633a1ac48ad78d538",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-1m.v1",
      "recipe_digest": "f8851c896d3ce077a45767b743daa5034342842995ca5734eaf88c880c2d13e6",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-5m.v1",
      "recipe_digest": "65d1a6d2ca997c6d6c1d8dfbedaccb5af08160f287f05acbb012ae4ceda525c3",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-15m.v1",
      "recipe_digest": "8c0d4f59c1e254313a89fb3bba6f0be1846eaa13c1afab230f1a61c7215169ff",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-30m.v1",
      "recipe_digest": "848a287fd929b2c652cc0948da4230a93e83b81ad12094eb6937ec73fdb1a070",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-4h.v1",
      "recipe_digest": "7482f00252f62dc4c9c7ea4a73f1c57a9424a0f2b8d6f7a3d80d21e13072937a",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode2-global-1d.v1",
      "recipe_digest": "e860278f83d44a555953f89ab42282f2c42b1291459ea04834c61ab018073023",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-1h.v1",
      "recipe_digest": "f5d1930ee99c16c3dbc39638c4bf8a9431710f1cf7d9abab709a17f6e4039418",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-1m.v1",
      "recipe_digest": "aaf8bfea8b7e261b7e84ec645cc7fe1d08043fa61acc785b2a95b2ec0d7d5721",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-5m.v1",
      "recipe_digest": "1795592e932a875c3e1959f664e548d67d7f37a11d28a548e8e7d61067760efc",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-15m.v1",
      "recipe_digest": "a8efdf17c87bc1f73cc6eb870c3a333c7a5195b773dbc1905a1df85c612a373b",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-30m.v1",
      "recipe_digest": "7a300cb1d7ce9ce27fb4efebe16fa786c08a567bca6446727e67d1cc328d1ef4",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-4h.v1",
      "recipe_digest": "352cad3f5fccb5bc34788fcb5efee2b29c8c4d5273f05960ac500b633eac4656",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-global-1d.v1",
      "recipe_digest": "a579ebc9599046e1f62cffce3447e10e918de05a5da6f5bd7b1a5aed5c579535",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-1h.v1",
      "recipe_digest": "edf0f40b46fd0ba5c92b7d525b775fba43dd99b67010d89d1f5a5debd1d210ed",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-1m.v1",
      "recipe_digest": "fe783ec45fda3b08506cd6b73c3448b8b4261e9b8785eef6ce9aeeebed97ac5b",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-5m.v1",
      "recipe_digest": "228aea9413b832dd6b4e16bf09e5c9d0c56e70936fa7da0a5a7cabf96080be07",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-15m.v1",
      "recipe_digest": "ab19e87c0b1bcdd15762f42231dd2ddf738e3e149d0aa13c36c6688aef8650e8",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-30m.v1",
      "recipe_digest": "7aa0b54dff6badb200ef70fd39004c3b193a878d0bf9da9265ec7e8e770872dd",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-4h.v1",
      "recipe_digest": "081d41734d93ece070cf3427115b84c12fb7657d074d8919a498ea1a7e10d7e6",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode4-causal-1d.v1",
      "recipe_digest": "60c7508875880dbddd487f2252ce8eaf42ed3a247c881859808b45a09d523cad",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-1h.v1",
      "recipe_digest": "6a9ffc7982ee61fd6d554e0d56cb4cc63a4d75fc6bfe27a9550c7bb0c1bd4ae9",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-1m.v1",
      "recipe_digest": "59a28c95f361c18a27a4b44b23b94c4f6ad5ae87a3c8d188f64bcdad99e3b20b",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-5m.v1",
      "recipe_digest": "5f6396303784eed85fd2d13ce3d9cb51e9105551a6c2af5415645b5f48e02daa",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-15m.v1",
      "recipe_digest": "34827383c70714c9da5b4ae3d0fa5f4ba3f338f2cc00c442b165ef8d1166f41e",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-30m.v1",
      "recipe_digest": "bc434ae28b023e83f406c42ba4fa2d6d79991c488c3c99f9730a1cb88bef38d9",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-4h.v1",
      "recipe_digest": "488e7637f6083c62f2d4315b9676dd4b38820908cfef0a1139d142d392714760",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.delta-mode5-global-1d.v1",
      "recipe_digest": "639d2b2757ed15c3cec2fa4dc0994350131518212e554588c1da19f750ce09f3",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "2732b72edd920a40e34a5d2f2ed2f3be77d7e45cac4eb0ed81bc1c4fbcc4407e"
    },
    {
      "profile_id": "p10.imported-wfo-temporal-1h.v1",
      "recipe_digest": "52c61c96c615a47536d49587210840169fe854b7abb025d1681eb3285eb5ce1c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-causal-inner-1h.v1",
      "recipe_digest": "c5b3ec91a4a882c03f56719bd18afe7762cac7704f1c7d94e52ab87d16676367",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-per-fold-decay-1h.v1",
      "recipe_digest": "2726d80a4bbec93026d5890dccc7b45b135801f03f4a426934410b212297059c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-three-window-optimized-1h.v1",
      "recipe_digest": "5b03521078310aff69ae940a70421913e3e7ddb59ca1aba3483ddc47e4f82b83",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-wfo-temporal-4h.v1",
      "recipe_digest": "9d2e2790fc888a9df243b4638b6cac2fd3863c840abc0b6672145c6a17ddb30f",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-causal-inner-4h.v1",
      "recipe_digest": "40d2b8fd1bd33a161aa0e32ea5a5c044ff41eddc5a37189223402a763abbed47",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-per-fold-decay-4h.v1",
      "recipe_digest": "abe696103916f0b5f055aa70ba91388e7df35f48f53f70b155aa20643f7f6bae",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-three-window-optimized-4h.v1",
      "recipe_digest": "b83ffa9f82697c90981cafc2af67b3884a4a8bf2a59708a5e7eedde00193e9ac",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-wfo-temporal-1d.v1",
      "recipe_digest": "39bead10280fb2ab6754039e05de0a2e4f3c24594392103f856939e3233623de",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-causal-inner-1d.v1",
      "recipe_digest": "2a1c5a472dc7288ec82360d990371453c00b5b8c17f7933f2ac78f2d656a2fd4",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-per-fold-decay-1d.v1",
      "recipe_digest": "e541ae6e9ed74e349fc06d1be40c9112c6f8338f78a056d1cdf22da3fc10ea9c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-three-window-optimized-1d.v1",
      "recipe_digest": "ab111ad986ac3afb6e012893b4c45e80d1383a36f1aa19e83bf3a113665a081b",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode3-global-1h.v1",
      "recipe_digest": "85a7a1cb28eb88233ae57d1c04b0193933b9f6e5b9c766b87775af6a45e69475",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode3-global-4h.v1",
      "recipe_digest": "13388c1cd84fe1dc79648d6be08a56a7a3b95579fcd967cb1b5b611f9995ddec",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode3-global-1d.v1",
      "recipe_digest": "ecc93a5f09fbe01371b9bad242c055ce5368a05a2c3b5432dce217193e674087",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode2-global-1h.v1",
      "recipe_digest": "8f58991e77ab5ac5c84cf8d8021ad2ac71cc5a8d753bb7ece7873694e4c9bc20",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode2-global-4h.v1",
      "recipe_digest": "0836319301aa8f8df9e09836553f1e7df89f5d89810bdbd9cc3720f2fc3432b0",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode2-global-1d.v1",
      "recipe_digest": "23f75cedb5a8f7dc7797b024ef328d969508c5bca8d9168c55b89117bce7424e",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode4-global-1h.v1",
      "recipe_digest": "2babf0abcdd64016579d0eac1da980b011ad99e97d489b2de1df535dd22bee52",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode4-global-4h.v1",
      "recipe_digest": "1a29f39c409ffff87422cb750faad9571bd3a21981aed9b1138af0eded1d8a4c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode4-global-1d.v1",
      "recipe_digest": "50e359897741b23e6191d4470d4ccd1258eeadd6205430134bc81309841a7763",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode4-causal-1h.v1",
      "recipe_digest": "85f7970557ca3419d2a9293bb6c8e2e1b42d7fda4c054491db054ac0b1114174",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode4-causal-4h.v1",
      "recipe_digest": "dcc431f79e734f5816b0b795049f04d657d38058cd1495e1c83d5231b305caa5",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode4-causal-1d.v1",
      "recipe_digest": "611e711785f9f41e54ea84b1bc7e81a696c2bb99bc33dd2edb03b7b567c46ab0",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode5-global-1h.v1",
      "recipe_digest": "0df2bac883c9911e356e2293a50e715ad46b0b173ce4afd5a78392bba8e5a7fd",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode5-global-4h.v1",
      "recipe_digest": "c175eb3b97fa5997087dad95c84ea3766be78d852d9e704163ca2bcbd781c277",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
    },
    {
      "profile_id": "p10.imported-mode5-global-1d.v1",
      "recipe_digest": "9ba46ae80ad76ef91e9abe55e88cb04447204187e645b1c7ae01235ba0efe72c",
      "kind": "PRODUCT_RUN_QUALIFIED",
      "receipt_path": "upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md",
      "receipt_sha256": "89bc582112b4af8e5b140004689fe543d95a289dc4a603e131bffb116602f14e"
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
export const EXECUTION_RECIPE_REVISION = "1906970746d5c909d7aaeee36a322fc6684b0169de200ecab8ea91d6117b9737" as const;
