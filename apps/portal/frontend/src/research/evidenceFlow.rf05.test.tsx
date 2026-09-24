/**
 * RF-06 wave C — Screen 04 consumes the RF-05 Evidence contract.
 *
 * Every test here failed on the pre-wave-C screen. The fixtures are the real
 * preview responses (`:8095`, 2026-09-24), so what is asserted is what the
 * reader sees on those runs:
 *
 *  - `oos_performance` (registry v3) fills the HiFi tiles and the verdict
 *    header, each value from its engine field and each absence typed;
 *  - rolling Sharpe/beta keep their shells with the reason in words;
 *  - the monthly heat draws the one published month in the HiFi cell;
 *  - the status pill is the lifecycle's `display_status`, and only an
 *    in-progress run is told to watch progress;
 *  - a series is matched on run id as well when the revision is
 *    SOURCE_CONTENT_ONLY;
 *  - the retained passport renders a typed 200 not-applicable as an answer,
 *    and a 409 by its `lane_state`, never by its message text.
 */
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow, TILE_ORDER, monthTint, performanceFoot, performanceValue } from "./EvidenceFlow";
import { rollingSharpeOption, ratio } from "./EvidenceCharts";
import {
  SERIES_KINDS,
  seriesMatchesHub,
  toEvidenceRefusal,
  type EvidenceHub,
  type EvidenceSeries,
  type PerformanceMetric,
  type SeriesKind,
} from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import {
  CURRENT_SOURCE_LANE_COPY,
  REASON_CODE_SENTENCES,
  ResearchLaneConflictError,
  reasonCodeSentence,
  toResearchRefusal,
} from "./researchRefusal";
import { researchState } from "./state";
import { useEvidence, type PassportSlot, type SeriesSlot } from "./useEvidence";
import { PortalApiError } from "../lib/api";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

/* rrun_3935d7…: a new run with RF-05 analytics (preview :8095, 2026-09-24), verbatim. */
const HUB_ANALYTICS_JSON = {
  "schema_version": "research.evidence-hub.v1",
  "read_authority": "PORTAL_PERSISTED_RESEARCH",
  "run_id": "rrun_3935d7d16bbccabcc43382108ffca89d",
  "revision": "p13r1_cc2dd29666fec16271f7c39b0afa5eec6472e78a0fc85613429c543d10d5854c",
  "etag": "W/\"p13h1_52e73ec8d02465cd926e33bf541b0845b1c2378b0038b5cb2b8e38b126a06da4\"",
  "availability": {
    "state": "AVAILABLE",
    "reason_code": null
  },
  "readiness": "COMPLETE",
  "as_of_utc_ms": 1790251932400,
  "metric_registry_version": "research.metric-registry.v2",
  "core": {
    "source_adapter_id": "p04.delta-rsi.v1",
    "engine_version": "1.1.1",
    "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
    "source_transform_digest": "8924794d8e61094ebe3bf7b709b2a432c73694a04ba200fbc5474f5f0dec532b",
    "requested_spec_digest": "a246452fc3087d60912f3f679e06b0668e672a0d3fb7857ae14a71a6dcb1f5e2",
    "effective_spec_digest": "944df6c84a1d8502f141974f001d8732668f94a9e1c658119ff238e53219f291",
    "dataset_binding_digest": "16cc048b2605839be82718e77ca1c9f0333ed0e5b58317665dc4836ea0b0a5ab",
    "manifest_digest": "46dabe30008ccb2d1d07ac2706700ae3c5cfc6cfa04b701a9a373cb95671006f",
    "data": {
      "dataset_id": "crypto-binance-1m",
      "symbol": "BTCUSDT",
      "timeframe": "1h",
      "oos_observation_count": 744
    },
    "run_identity": {
      "status": {
        "value": "READY",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      "binding": {
        "alpha_id": "delta-rsi-polynomial-alpha",
        "alpha_name": "Delta-RSI Polynomial Alpha",
        "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_0",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      "created_at_utc_ms": {
        "value": 1790245531093,
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      "mode": {
        "value": "mode_1_decay",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      "schedule": {
        "value": "global",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      "route": {
        "id": {
          "value": "signal_notional",
          "availability": {
            "state": "AVAILABLE",
            "reason_code": null
          }
        },
        "contract": {
          "value": null,
          "availability": {
            "state": "NOT_PUBLISHED",
            "reason_code": "P13_ROUTE_CONTRACT_NOT_PUBLISHED"
          }
        }
      },
      "config_digest": {
        "value": "909514e09820e9fc8c2a37946c66053aaf7a9106875c73ed97165f7d1d02f452",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      "seed": {
        "value": null,
        "availability": {
          "state": "NOT_APPLICABLE",
          "reason_code": "P02_RANDOM_SEED_NOT_SELECTED"
        }
      }
    },
    "fold_navigation": {
      "observed_folds": [
        1
      ],
      "published_fold_count": 1,
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    }
  },
  "metrics": [
    {
      "key": "INITIAL_EQUITY",
      "label": "OOS opening equity",
      "unit": "CURRENCY",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "SOURCE_DERIVED",
      "definition_id": "research.metric.v1.oos_initial_equity",
      "value": "19996.892873321103",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    },
    {
      "key": "FINAL_EQUITY",
      "label": "OOS ending equity",
      "unit": "CURRENCY",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "ENGINE_DIRECT",
      "definition_id": "research.metric.v1.final_equity",
      "value": "19965.998848845535",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    },
    {
      "key": "NET_RETURN_FRACTION",
      "label": "OOS net return",
      "unit": "FRACTION",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "SOURCE_DERIVED",
      "definition_id": "research.metric.v1.oos_net_return_fraction",
      "value": "-0.001544941240185635450293621818514223089782795749",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    },
    {
      "key": "MAX_DRAWDOWN_FRACTION",
      "label": "OOS max drawdown",
      "unit": "FRACTION",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "SOURCE_DERIVED",
      "definition_id": "research.metric.v1.oos_max_drawdown_fraction",
      "value": "-0.00677683426162735796942751839545032620160288915",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    },
    {
      "key": "TRADE_COUNT",
      "label": "Trade count (child tape)",
      "unit": "COUNT",
      "scope": "CHILD_TAPE",
      "frequency": "RUN_FINAL",
      "origin": "ENGINE_DIRECT",
      "definition_id": "research.metric.v1.trade_count",
      "value": "45",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    },
    {
      "key": "BARS_PROCESSED",
      "label": "Bars processed (child tape)",
      "unit": "COUNT",
      "scope": "CHILD_TAPE",
      "frequency": "RUN_FINAL",
      "origin": "ENGINE_DIRECT",
      "definition_id": "research.metric.v1.bars_processed",
      "value": "2508",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      }
    },
    {
      "key": "BENCHMARK_RETURN_FRACTION",
      "label": "Benchmark return",
      "unit": "FRACTION",
      "scope": "NOT_PUBLISHED",
      "frequency": "RUN_FINAL",
      "origin": "NOT_PUBLISHED",
      "definition_id": "research.metric.v1.benchmark_return_fraction",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK"
      }
    },
    {
      "key": "FUNDING_TOTAL",
      "label": "Funding total",
      "unit": "CURRENCY",
      "scope": "NOT_PUBLISHED",
      "frequency": "RUN_FINAL",
      "origin": "NOT_PUBLISHED",
      "definition_id": "research.metric.v1.funding_total",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FUNDING"
      }
    }
  ],
  "oos_performance": {
    "registry_version": "research.metric-registry.v3",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    },
    "scope_locator": "quantbt==1.1.1:quantbt.core.scopes.scoped_result(scope='oos',fold_table=[P08 oos_start, last child bar])",
    "report_locator": "quantbt.metrics.performance.full_report(trading_days=365)",
    "return_sample": {
      "kind": "DAILY_UTC_EQUITY",
      "observation_count": 30,
      "annualization_periods": "365"
    },
    "metrics": [
      {
        "key": "OOS_SHARPE",
        "label": "OOS Sharpe",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_sharpe",
        "source_locator": "full_report.sharpe",
        "value": "0.7440081232022494",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      {
        "key": "OOS_SORTINO",
        "label": "OOS Sortino",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_sortino",
        "source_locator": "full_report.sortino",
        "value": "0.6073052223640069",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      {
        "key": "OOS_CAGR_FRACTION",
        "label": "OOS CAGR",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_cagr_fraction",
        "source_locator": "full_report.cagr_pct/100",
        "value": "-0.01807612128952335",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      {
        "key": "OOS_PROFIT_FACTOR",
        "label": "OOS profit factor",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_profit_factor",
        "source_locator": "full_report.profit_factor",
        "value": "1.1482912259589717",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      {
        "key": "OOS_LONG_HIT_RATE_FRACTION",
        "label": "OOS long-bar hit rate",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_long_hit_rate_fraction",
        "source_locator": "full_report.long_hitrate_pct/100",
        "value": "0.39603960396039604",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      {
        "key": "OOS_SHORT_HIT_RATE_FRACTION",
        "label": "OOS short-bar hit rate",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_short_hit_rate_fraction",
        "source_locator": "full_report.short_hitrate_pct/100",
        "value": "0.52800000000000004",
        "availability": {
          "state": "AVAILABLE",
          "reason_code": null
        }
      },
      {
        "key": "OOS_SHARPE_DECAY",
        "label": "Sharpe decay (IS → OOS)",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "NOT_PUBLISHED",
        "definition_id": "research.metric.v3.oos_sharpe_decay",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT"
        }
      }
    ]
  },
  "lifecycle": {
    "vocabulary": "research.run-status-vocabulary.v1",
    "durable_status": "READY",
    "display_status": "COMPLETED",
    "phase": "TERMINAL",
    "terminal_outcome": "COMPLETED",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "revision_binding": {
    "value": "RUN_INPUT_BOUND",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "claim": {
    "state": "NOT_ISSUED",
    "text": "The fixed P10 qualification sealed its artifacts but did not issue a release claim.",
    "cursor": null,
    "methodology_certificate": {
      "state": "NOT_PUBLISHED",
      "grade": null,
      "issued_at_utc_ms": null,
      "reason_code": "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE"
    },
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "stages": [
    {
      "key": "S1",
      "state": "DONE",
      "started_at_utc_ms": 1790245531183,
      "completed_at_utc_ms": 1790245531214
    },
    {
      "key": "S2",
      "state": "DONE",
      "started_at_utc_ms": 1790245531218,
      "completed_at_utc_ms": 1790245531224
    },
    {
      "key": "S3",
      "state": "DONE",
      "started_at_utc_ms": 1790245531227,
      "completed_at_utc_ms": 1790245531230
    },
    {
      "key": "S4",
      "state": "DONE",
      "started_at_utc_ms": 1790245531232,
      "completed_at_utc_ms": 1790245539490
    },
    {
      "key": "S5",
      "state": "DONE",
      "started_at_utc_ms": 1790245539498,
      "completed_at_utc_ms": 1790245539536
    }
  ],
  "series": [
    {
      "kind": "EQUITY_OOS",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_3935d7d16bbccabcc43382108ffca89d/evidence/series?kind=EQUITY_OOS"
    },
    {
      "kind": "MONTHLY_RETURNS",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_3935d7d16bbccabcc43382108ffca89d/evidence/series?kind=MONTHLY_RETURNS"
    },
    {
      "kind": "ROLLING_RETURNS_20",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_3935d7d16bbccabcc43382108ffca89d/evidence/series?kind=ROLLING_RETURNS_20"
    },
    {
      "kind": "RETURN_DISTRIBUTION",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_3935d7d16bbccabcc43382108ffca89d/evidence/series?kind=RETURN_DISTRIBUTION"
    },
    {
      "kind": "ROLLING_SHARPE_63",
      "availability": {
        "state": "NOT_APPLICABLE",
        "reason_code": "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW"
      },
      "href": "/api/v1/quantbt/runs/rrun_3935d7d16bbccabcc43382108ffca89d/evidence/series?kind=ROLLING_SHARPE_63"
    },
    {
      "kind": "ROLLING_BETA_63",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK"
      },
      "href": "/api/v1/quantbt/runs/rrun_3935d7d16bbccabcc43382108ffca89d/evidence/series?kind=ROLLING_BETA_63"
    }
  ],
  "warnings": [
    {
      "definition_id": "research.warning.v1.sampled_equity_series",
      "state": "ACTIVE",
      "reason_code": "P13_EXTREMA_BUCKET_SAMPLE",
      "copy": "The chart is an extrema-preserving sample. Official metrics use the full confined QuantBT result."
    },
    {
      "definition_id": "research.warning.v1.benchmark_not_published",
      "state": "ACTIVE",
      "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK",
      "copy": "No benchmark identity or return series was published by this adapter."
    },
    {
      "definition_id": "research.warning.v1.funding_not_published",
      "state": "ACTIVE",
      "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FUNDING",
      "copy": "No funding series was published by this adapter; zero is not implied."
    }
  ],
  "source_absences": {
    "benchmark": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK"
    },
    "funding": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FUNDING"
    },
    "audited_fills": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"
    },
    "per_fold_metrics": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_METRICS"
    }
  }
};

/* rrun_80d3c2…: SOURCE_CONTENT_ONLY, sealed before OOS analytics — the blocks that differ, verbatim. */
const HUB_PRE_ANALYTICS_DIFF = {
  "run_id": "rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed",
  "revision": "p13r1_016e8d8ab4ca3f408b5f9aa5d98a14db297fbb6160b89fca9f8cc5c898cdea2b",
  "etag": "W/\"p13h1_6a4aef933de96bdbbaf8d7416a0a1da9f97b4e1ad45278b19d741f6cb78a09cd\"",
  "oos_performance": {
    "registry_version": "research.metric-registry.v3",
    "availability": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
    },
    "scope_locator": null,
    "report_locator": null,
    "return_sample": null,
    "metrics": [
      {
        "key": "OOS_SHARPE",
        "label": "OOS Sharpe",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_sharpe",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      },
      {
        "key": "OOS_SORTINO",
        "label": "OOS Sortino",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_sortino",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      },
      {
        "key": "OOS_CAGR_FRACTION",
        "label": "OOS CAGR",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_cagr_fraction",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      },
      {
        "key": "OOS_PROFIT_FACTOR",
        "label": "OOS profit factor",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_profit_factor",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      },
      {
        "key": "OOS_LONG_HIT_RATE_FRACTION",
        "label": "OOS long-bar hit rate",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_long_hit_rate_fraction",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      },
      {
        "key": "OOS_SHORT_HIT_RATE_FRACTION",
        "label": "OOS short-bar hit rate",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_short_hit_rate_fraction",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      },
      {
        "key": "OOS_SHARPE_DECAY",
        "label": "Sharpe decay (IS → OOS)",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "NOT_PUBLISHED",
        "definition_id": "research.metric.v3.oos_sharpe_decay",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
        }
      }
    ]
  },
  "lifecycle": {
    "vocabulary": "research.run-status-vocabulary.v1",
    "durable_status": "READY",
    "display_status": "COMPLETED",
    "phase": "TERMINAL",
    "terminal_outcome": "COMPLETED",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "revision_binding": {
    "value": "SOURCE_CONTENT_ONLY",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "series": [
    {
      "kind": "EQUITY_OOS",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed/evidence/series?kind=EQUITY_OOS"
    },
    {
      "kind": "MONTHLY_RETURNS",
      "availability": {
        "state": "NOT_APPLICABLE",
        "reason_code": "P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE"
      },
      "href": "/api/v1/quantbt/runs/rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed/evidence/series?kind=MONTHLY_RETURNS"
    },
    {
      "kind": "ROLLING_RETURNS_20",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed/evidence/series?kind=ROLLING_RETURNS_20"
    },
    {
      "kind": "RETURN_DISTRIBUTION",
      "availability": {
        "state": "AVAILABLE",
        "reason_code": null
      },
      "href": "/api/v1/quantbt/runs/rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed/evidence/series?kind=RETURN_DISTRIBUTION"
    },
    {
      "kind": "ROLLING_SHARPE_63",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
      },
      "href": null
    },
    {
      "kind": "ROLLING_BETA_63",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_PREDATES_OOS_ANALYTICS"
      },
      "href": null
    }
  ]
};

/* rrun_5abb59…: cancelled before sealing — the blocks that differ, verbatim. */
const HUB_CANCELLED_DIFF = {
  "run_id": "rrun_5abb59f2ab9e02ccff1dad3f00df692b",
  "revision": null,
  "etag": "W/\"p13h1_406f6b7a2120523b77737c59f17c74bddf7074d39c69cce4231351889cf3f813\"",
  "availability": {
    "state": "NOT_PUBLISHED",
    "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
  },
  "readiness": "NOT_READY",
  "metric_registry_version": "research.metric-registry.v1",
  "metrics": [
    {
      "key": "INITIAL_EQUITY",
      "label": "OOS initial equity",
      "unit": "CURRENCY",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "SOURCE_DERIVED",
      "definition_id": "research.metric.v1.oos_initial_equity",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "FINAL_EQUITY",
      "label": "Final equity",
      "unit": "CURRENCY",
      "scope": "IS_PLUS_OOS",
      "frequency": "RUN_FINAL",
      "origin": "ENGINE_DIRECT",
      "definition_id": "research.metric.v1.final_equity",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "NET_RETURN_FRACTION",
      "label": "OOS net return",
      "unit": "FRACTION",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "SOURCE_DERIVED",
      "definition_id": "research.metric.v1.oos_net_return_fraction",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "MAX_DRAWDOWN_FRACTION",
      "label": "OOS max drawdown",
      "unit": "FRACTION",
      "scope": "OOS",
      "frequency": "RUN_FINAL",
      "origin": "SOURCE_DERIVED",
      "definition_id": "research.metric.v1.oos_max_drawdown_fraction",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "TRADE_COUNT",
      "label": "Trade count",
      "unit": "COUNT",
      "scope": "IS_PLUS_OOS",
      "frequency": "RUN_FINAL",
      "origin": "ENGINE_DIRECT",
      "definition_id": "research.metric.v1.trade_count",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "BARS_PROCESSED",
      "label": "Bars processed",
      "unit": "COUNT",
      "scope": "IS_PLUS_OOS",
      "frequency": "RUN_FINAL",
      "origin": "ENGINE_DIRECT",
      "definition_id": "research.metric.v1.bars_processed",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "BENCHMARK_RETURN_FRACTION",
      "label": "Benchmark return",
      "unit": "FRACTION",
      "scope": "NOT_PUBLISHED",
      "frequency": "RUN_FINAL",
      "origin": "NOT_PUBLISHED",
      "definition_id": "research.metric.v1.benchmark_return_fraction",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    },
    {
      "key": "FUNDING_TOTAL",
      "label": "Funding total",
      "unit": "CURRENCY",
      "scope": "NOT_PUBLISHED",
      "frequency": "RUN_FINAL",
      "origin": "NOT_PUBLISHED",
      "definition_id": "research.metric.v1.funding_total",
      "value": null,
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      }
    }
  ],
  "oos_performance": {
    "registry_version": "research.metric-registry.v3",
    "availability": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    },
    "scope_locator": null,
    "report_locator": null,
    "return_sample": null,
    "metrics": [
      {
        "key": "OOS_SHARPE",
        "label": "OOS Sharpe",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_sharpe",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      },
      {
        "key": "OOS_SORTINO",
        "label": "OOS Sortino",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_sortino",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      },
      {
        "key": "OOS_CAGR_FRACTION",
        "label": "OOS CAGR",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_cagr_fraction",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      },
      {
        "key": "OOS_PROFIT_FACTOR",
        "label": "OOS profit factor",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_profit_factor",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      },
      {
        "key": "OOS_LONG_HIT_RATE_FRACTION",
        "label": "OOS long-bar hit rate",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_long_hit_rate_fraction",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      },
      {
        "key": "OOS_SHORT_HIT_RATE_FRACTION",
        "label": "OOS short-bar hit rate",
        "unit": "FRACTION",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "ENGINE_DIRECT",
        "definition_id": "research.metric.v3.oos_short_hit_rate_fraction",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      },
      {
        "key": "OOS_SHARPE_DECAY",
        "label": "Sharpe decay (IS → OOS)",
        "unit": "RATIO",
        "scope": "OOS",
        "frequency": "RUN_FINAL",
        "origin": "NOT_PUBLISHED",
        "definition_id": "research.metric.v3.oos_sharpe_decay",
        "source_locator": null,
        "value": null,
        "availability": {
          "state": "NOT_PUBLISHED",
          "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
        }
      }
    ]
  },
  "lifecycle": {
    "vocabulary": "research.run-status-vocabulary.v1",
    "durable_status": "CANCELLED",
    "display_status": "CANCELLED",
    "phase": "TERMINAL",
    "terminal_outcome": "CANCELLED",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "revision_binding": {
    "value": null,
    "availability": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    }
  },
  "series": [
    {
      "kind": "EQUITY_OOS",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      },
      "href": null
    },
    {
      "kind": "MONTHLY_RETURNS",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      },
      "href": null
    },
    {
      "kind": "ROLLING_RETURNS_20",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      },
      "href": null
    },
    {
      "kind": "RETURN_DISTRIBUTION",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      },
      "href": null
    },
    {
      "kind": "ROLLING_SHARPE_63",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      },
      "href": null
    },
    {
      "kind": "ROLLING_BETA_63",
      "availability": {
        "state": "NOT_PUBLISHED",
        "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
      },
      "href": null
    }
  ],
  "claim": {
    "state": "NOT_PUBLISHED",
    "text": null,
    "cursor": null,
    "methodology_certificate": {
      "state": "NOT_PUBLISHED",
      "grade": null,
      "issued_at_utc_ms": null,
      "reason_code": "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE"
    },
    "availability": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    }
  },
  "warnings": [],
  "source_absences": {
    "benchmark": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    },
    "funding": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    },
    "audited_fills": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    },
    "per_fold_metrics": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    }
  },
  "core_run_status": {
    "value": "CANCELLED",
    "availability": {
      "state": "AVAILABLE",
      "reason_code": null
    }
  },
  "core_fold_navigation": {
    "observed_folds": [],
    "published_fold_count": null,
    "availability": {
      "state": "NOT_PUBLISHED",
      "reason_code": "P13_SOURCE_EVIDENCE_NOT_PUBLISHED"
    }
  }
};

/* The current-source read for all three runs: a typed 200, not a 409. */
const LANE_NOT_APPLICABLE_JSON = {
  "schema_version": "research.current-source-not-applicable.v1",
  "read_authority": "PORTAL_RETAINED_CURRENT_SOURCE",
  "run_id": "rrun_3935d7d16bbccabcc43382108ffca89d",
  "revision": "rs02_not-applicable_5a34eee81f3bcb6df36354e9623da2e14b1fde93da0664a067a4dfedd3395198",
  "etag": "\"rs02_not-applicable_5a34eee81f3bcb6df36354e9623da2e14b1fde93da0664a067a4dfedd3395198\"",
  "availability": {
    "state": "NOT_APPLICABLE",
    "reason_code": "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION"
  },
  "lane": {
    "state": "NOT_APPLICABLE",
    "operation": "evidence",
    "run_profile": "P04_FIXED_QUALIFICATION",
    "run_adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
    "retainable_profile_id": "rs02.delta-wfo-global.v1",
    "reason_code": "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION"
  }
};

const MONTHLY_ONE_MONTH_JSON = {
  "schema_version": "research.evidence-series.v1",
  "run_id": "rrun_3935d7d16bbccabcc43382108ffca89d",
  "revision": "p13r1_cc2dd29666fec16271f7c39b0afa5eec6472e78a0fc85613429c543d10d5854c",
  "etag": "\"p13r1_cc2dd29666fec16271f7c39b0afa5eec6472e78a0fc85613429c543d10d5854c\"",
  "kind": "MONTHLY_RETURNS",
  "availability": {
    "state": "AVAILABLE",
    "reason_code": null
  },
  "source_sample": {
    "source_observation_count": 744,
    "emitted_point_count": 1,
    "sampling": "FULL"
  },
  "values": [
    {
      "month_start_utc_ms": 1782864000000,
      "return_fraction": "-0.001544941240185635450293621818514223089782795749"
    }
  ]
};

const ROLLING_SHARPE_NOT_APPLICABLE_JSON = {
  "schema_version": "research.evidence-series.v1",
  "run_id": "rrun_3935d7d16bbccabcc43382108ffca89d",
  "revision": "p13r1_cc2dd29666fec16271f7c39b0afa5eec6472e78a0fc85613429c543d10d5854c",
  "etag": "\"p13r1_cc2dd29666fec16271f7c39b0afa5eec6472e78a0fc85613429c543d10d5854c\"",
  "kind": "ROLLING_SHARPE_63",
  "availability": {
    "state": "NOT_APPLICABLE",
    "reason_code": "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW"
  },
  "source_sample": {
    "source_observation_count": 0,
    "emitted_point_count": 0,
    "sampling": null
  },
  "values": []
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function hubAnalytics(): EvidenceHub {
  return clone(HUB_ANALYTICS_JSON) as unknown as EvidenceHub;
}

function hubPreAnalytics(): EvidenceHub {
  return { ...hubAnalytics(), ...clone(HUB_PRE_ANALYTICS_DIFF) } as unknown as EvidenceHub;
}

function hubCancelled(): EvidenceHub {
  const base = hubAnalytics();
  const { core_run_status, core_fold_navigation, ...rest } = clone(HUB_CANCELLED_DIFF);
  return {
    ...base,
    ...rest,
    core: {
      ...base.core,
      run_identity: { ...base.core.run_identity!, status: core_run_status },
      fold_navigation: core_fold_navigation,
    },
  } as unknown as EvidenceHub;
}

function withLifecycle(hub: EvidenceHub, lifecycle: Partial<NonNullable<EvidenceHub["lifecycle"]>>, readiness?: EvidenceHub["readiness"]): EvidenceHub {
  return { ...hub, readiness: readiness ?? hub.readiness, lifecycle: { ...hub.lifecycle!, ...lifecycle } };
}

const OK = researchState({ kind: "ok", rowCount: 8 });

function view(overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {}) {
  const runId = overrides.hub?.run_id ?? HUB_ANALYTICS_JSON.run_id;
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId={runId}
        hub={hubAnalytics()}
        state={OK}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

let requested: string[] = [];

function stub(responder: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      const [status, payload] = responder(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: new Headers(),
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  requested = [];
  vi.unstubAllGlobals();
});

const tile = (container: HTMLElement, key: string) => container.querySelector(`[data-metric='${key}']`);
const value = (container: HTMLElement, key: string) => container.querySelector(`[data-metric-value='${key}']`);

/* -------------------------------------------------------------------------
 * CG-P13-03 — registry v3 in the tiles
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — OOS performance fills the HiFi tiles", () => {
  it("orders the tiles as the HiFi row: equity, return, Sharpe, drawdown, trades", () => {
    const { container } = view();
    const keys = [...container.querySelectorAll("[data-metrics] > [data-metric]")].map((node) =>
      node.getAttribute("data-metric"),
    );
    expect(keys.slice(0, 5)).toEqual(["FINAL_EQUITY", "NET_RETURN_FRACTION", "OOS_SHARPE", "MAX_DRAWDOWN_FRACTION", "TRADE_COUNT"]);
    expect(keys).toEqual(TILE_ORDER);
  });

  it("prints Sharpe, Sortino and profit factor as two-decimal ratios, exact in the title", () => {
    const { container } = view();
    expect(value(container, "OOS_SHARPE")?.textContent).toBe("0.74");
    expect(value(container, "OOS_SHARPE")?.getAttribute("title")).toBe("0.7440081232022494");
    expect(value(container, "OOS_SORTINO")?.textContent).toBe("0.61");
    expect(value(container, "OOS_PROFIT_FACTOR")?.textContent).toBe("1.15");
    expect(value(container, "OOS_PROFIT_FACTOR")?.getAttribute("data-exact")).toBe("1.1482912259589717");
  });

  it("prints CAGR as a signed percentage with the screen's minus", () => {
    const { container } = view();
    expect(value(container, "OOS_CAGR_FRACTION")?.textContent).toBe("−1.81%");
    expect(value(container, "OOS_CAGR_FRACTION")?.getAttribute("title")).toBe("-0.01807612128952335");
  });

  it("labels the hit rates as per-bar and never as a win rate", () => {
    const { container } = view();
    for (const [key, shown] of [
      ["OOS_LONG_HIT_RATE_FRACTION", "39.60%"],
      ["OOS_SHORT_HIT_RATE_FRACTION", "52.80%"],
    ] as const) {
      const node = tile(container, key);
      expect(value(container, key)?.textContent, key).toBe(shown);
      expect(node?.textContent, key).toMatch(/bar hit rate/);
      expect(node?.querySelector("[data-metric-scope]")?.textContent, key).toContain("percent of bars");
      expect(node?.querySelector("[data-metric-scope]")?.getAttribute("title"), key).toContain("not a trade win rate");
      expect(node?.textContent?.toLowerCase(), key).not.toContain("win rate");
    }
  });

  it("names the engine field in the tile foot, where the HiFi names its source file", () => {
    const { container } = view();
    const foot = tile(container, "OOS_SHARPE")?.querySelector("[data-metric-scope]");
    expect(foot?.textContent).toBe("oos · ratio · full_report.sharpe");
    expect(foot?.getAttribute("title")).toContain("report quantbt.metrics.performance.full_report(trading_days=365)");
    expect(foot?.getAttribute("title")).toContain("sample 30 DAILY_UTC_EQUITY returns · annualisation 365");
  });

  it("keeps decay as a typed absence with its reason in words", () => {
    const { container } = view();
    const decay = tile(container, "OOS_SHARPE_DECAY");
    expect(decay?.querySelector("[data-metric-value]")).toBeNull();
    const withheld = decay?.querySelector("[data-withheld]");
    expect(withheld?.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(withheld?.getAttribute("title")).toContain("IS/OOS boundary is not in the run's receipt");
    expect(withheld?.getAttribute("data-reason-code")).toBe("P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT");
    expect(decay?.textContent).not.toMatch(/\b0(\.0+)?\b/);
  });

  it("gives a run sealed before analytics seven typed absences, never a zero", () => {
    const { container } = view({ hub: hubPreAnalytics() });
    for (const key of ["OOS_SHARPE", "OOS_SORTINO", "OOS_CAGR_FRACTION", "OOS_PROFIT_FACTOR", "OOS_SHARPE_DECAY"]) {
      expect(value(container, key), key).toBeNull();
      expect(tile(container, key)?.querySelector("[data-withheld]")?.getAttribute("data-reason-code"), key).toBe(
        "P13_SOURCE_PREDATES_OOS_ANALYTICS",
      );
    }
  });

  it("formats by unit without computing anything", () => {
    const metric = (overrides: Partial<PerformanceMetric>): PerformanceMetric =>
      ({ ...HUB_ANALYTICS_JSON.oos_performance.metrics[0], ...overrides }) as PerformanceMetric;
    expect(performanceValue(metric({ value: "-1.234" }))).toBe("−1.23");
    expect(performanceValue(metric({ key: "OOS_CAGR_FRACTION", unit: "FRACTION", value: "0.1" }))).toBe("+10.00%");
    expect(performanceFoot(metric({ source_locator: null, origin: "NOT_PUBLISHED" }))).toBe("oos · ratio · origin not published");
  });
});

/* -------------------------------------------------------------------------
 * Verdict header (spec 04 §2.6) in the HiFi slot
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — the verdict header states only what is published", () => {
  it("says fold count, OOS Sharpe and decay's absence — no verdict tally it was not given", () => {
    const { container } = view();
    const summary = container.querySelector("[data-verdict-summary]");
    expect(summary?.textContent).toBe("1 observed fold — OOS Sharpe 0.74, decay not published");
    expect(summary?.querySelector("[data-verdict-fact='OOS_SHARPE']")?.getAttribute("title")).toBe("0.7440081232022494");
    expect(summary?.textContent).not.toMatch(/PASS|WARN|DRAG|strongest supported/);
  });

  it("keeps the per-fold verdict shell (CG-P13-08) and the claims strip shells (CG-P13-07)", () => {
    const { container } = view();
    expect(container.querySelector("[data-gap='per-fold-verdict']")).toBeTruthy();
    for (const field of ["validation_claim", "chronological_claim", "oos_used_for_selection"]) {
      expect(container.querySelector(`[data-claim-field='${field}'] [data-withheld='NOT_PUBLISHED']`), field).toBeTruthy();
    }
  });
});

/* -------------------------------------------------------------------------
 * CG-P13-04 — rolling row
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — the rolling row", () => {
  it("lists the two new series kinds", () => {
    expect(SERIES_KINDS).toContain("ROLLING_SHARPE_63");
    expect(SERIES_KINDS).toContain("ROLLING_BETA_63");
  });

  it("keeps rolling Sharpe's shell with its reason and the published sample size, and does not read it", () => {
    const ensureSeries = vi.fn();
    const { container } = view({ ensureSeries });
    const half = container.querySelector("[data-rolling-figure] [data-series-panel='ROLLING_SHARPE_63']");
    expect(half?.querySelector("[data-rolling-shell]")).toBeTruthy();
    const note = half?.querySelector("[data-absence-note]");
    expect(note?.getAttribute("data-absence-note")).toBe("NOT_APPLICABLE");
    expect(note?.textContent).toContain("fewer daily returns than the 63-day rolling window");
    expect(note?.textContent).toContain("(30 daily UTC returns published; the window needs 63.)");
    expect(ensureSeries).not.toHaveBeenCalledWith("ROLLING_SHARPE_63");
  });

  it("types rolling beta as not published for want of a benchmark", () => {
    const { container } = view();
    const half = container.querySelector("[data-rolling-figure] [data-series-panel='ROLLING_BETA_63']");
    expect(half?.querySelector("[data-absence-note]")?.getAttribute("data-absence-note")).toBe("NOT_PUBLISHED");
    expect(half?.textContent).toContain("published no benchmark series");
  });

  it("reads rolling Sharpe when the Hub publishes it, and draws it from the server's values", () => {
    const hub = hubAnalytics();
    hub.series = hub.series.map((link) =>
      link.kind === "ROLLING_SHARPE_63" ? { ...link, availability: { state: "AVAILABLE", reason_code: null } } : link,
    );
    const ensureSeries = vi.fn();
    view({ hub, ensureSeries });
    expect(ensureSeries).toHaveBeenCalledWith("ROLLING_SHARPE_63");
    const option = rollingSharpeOption([
      { at_utc_ms: 1782864000000, sharpe: "-0.4567" },
      { at_utc_ms: 1782950400000, sharpe: "1.2" },
    ]) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(option.xAxis.type).toBe("time");
    expect(option.series[0].data).toEqual([
      [1782864000000, -0.4567],
      [1782950400000, 1.2],
    ]);
    expect(option.tooltip.formatter([{ dataIndex: 0, seriesName: "rolling 63-day Sharpe", marker: "" }])).toContain("−0.46");
    expect(ratio(1.2)).toBe("1.20");
  });

  it("says why a series that answered NOT_APPLICABLE has no line, instead of an empty chart", () => {
    const hub = hubAnalytics();
    hub.series = hub.series.map((link) =>
      link.kind === "ROLLING_SHARPE_63" ? { ...link, availability: { state: "AVAILABLE", reason_code: null } } : link,
    );
    const answered = clone(ROLLING_SHARPE_NOT_APPLICABLE_JSON) as unknown as EvidenceSeries;
    const { container } = view({
      hub,
      series: new Map<SeriesKind, SeriesSlot>([["ROLLING_SHARPE_63", { state: "ready", series: answered }]]),
    });
    const half = container.querySelector("[data-series-panel='ROLLING_SHARPE_63']");
    expect(half?.getAttribute("data-series-state")).toBe("absent");
    expect(half?.querySelector("[data-reason-sentence]")?.textContent).toContain("63-day rolling window");
  });
});

/* -------------------------------------------------------------------------
 * CG-P13-06 — monthly heat
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — the monthly heat", () => {
  it("draws the one published month as a HiFi cell, exact value in the title", () => {
    const monthly = clone(MONTHLY_ONE_MONTH_JSON) as unknown as EvidenceSeries;
    const { container } = view({ series: new Map<SeriesKind, SeriesSlot>([["MONTHLY_RETURNS", { state: "ready", series: monthly }]]) });
    const cell = container.querySelector("[data-month='2026-07']");
    expect(cell).toBeTruthy();
    expect(cell?.querySelector("[data-month-value]")?.textContent).toBe("−0.15%");
    expect(cell?.getAttribute("title")).toContain("-0.001544941240185635450293621818514223089782795749");
    expect(cell?.textContent).toContain("7/26");
    expect((cell?.querySelector("[data-month-cell]") as HTMLElement).style.opacity).toBe(
      String(monthTint("-0.001544941240185635450293621818514223089782795749")),
    );
  });

  it("tints by magnitude within the HiFi bounds", () => {
    expect(monthTint("0")).toBe(0.15);
    expect(monthTint("-0.01")).toBeCloseTo(0.24);
    expect(monthTint("0.5")).toBe(0.85);
  });

  it("gives a run with no measurable month the typed reason, and does not read the series", () => {
    const ensureSeries = vi.fn();
    const { container } = view({ hub: hubPreAnalytics(), ensureSeries });
    const panel = container.querySelector("[data-series-panel='MONTHLY_RETURNS']");
    expect(panel?.querySelector("[data-absence-note]")?.getAttribute("data-absence-note")).toBe("NOT_APPLICABLE");
    expect(panel?.textContent).toContain("No OOS month has a prior calendar month-end close");
    expect(ensureSeries).not.toHaveBeenCalledWith("MONTHLY_RETURNS");
  });
});

/* -------------------------------------------------------------------------
 * CG-P13-10/12 — lifecycle
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — status and the progress banner follow the lifecycle", () => {
  it("prints display_status in the pill, with the durable status behind it", () => {
    const { container } = view();
    const pill = container.querySelector("[data-run-status]");
    expect(pill?.textContent).toBe("COMPLETED");
    expect(pill?.getAttribute("data-durable-status")).toBe("READY");
    expect(pill?.getAttribute("title")).toContain("research.run-status-vocabulary.v1");
  });

  it("shows no banner for a completed run with evidence", () => {
    const { container } = view();
    expect(container.querySelector("[data-not-ready]")).toBeNull();
  });

  it("offers watch progress only while the lifecycle says IN_PROGRESS — even with partial evidence", () => {
    const hub = withLifecycle(hubAnalytics(), { phase: "IN_PROGRESS", display_status: "RUNNING", durable_status: "RUNNING", terminal_outcome: null }, "PARTIAL");
    const { container } = view({ hub });
    expect(container.querySelector("[data-not-ready]")?.getAttribute("data-not-ready")).toBe("IN_PROGRESS");
    expect(container.querySelector("[data-action='watch-progress']")).toBeTruthy();
  });

  it("words a cancelled run by its outcome, with no watch-progress link (real cancelled hub)", () => {
    const { container } = view({ hub: hubCancelled() });
    const notice = container.querySelector("[data-not-ready]");
    expect(notice?.getAttribute("data-not-ready")).toBe("CANCELLED");
    expect(notice?.getAttribute("data-phase")).toBe("TERMINAL");
    expect(notice?.textContent).toContain("This run was cancelled");
    expect(container.querySelector("[data-action='watch-progress']")).toBeNull();
    expect(container.querySelector("[data-action='open-runs']")).toBeTruthy();
    expect(container.querySelector("[data-run-status]")?.textContent).toBe("CANCELLED");
  });

  it("words a failed run by its outcome and points at its progress record", () => {
    const hub = withLifecycle(hubCancelled(), { terminal_outcome: "FAILED", display_status: "FAILED", durable_status: "FAILED" });
    const { container } = view({ hub });
    expect(container.querySelector("[data-not-ready]")?.getAttribute("data-not-ready")).toBe("FAILED");
    expect(container.querySelector("[data-action='open-progress-record']")).toBeTruthy();
    expect(container.querySelector("[data-action='watch-progress']")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * CG-P13-11 — revision binding
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — a SOURCE_CONTENT_ONLY revision is matched on run id too", () => {
  const seriesFor = (hub: EvidenceHub, runId: string): EvidenceSeries =>
    ({ ...(clone(MONTHLY_ONE_MONTH_JSON) as unknown as EvidenceSeries), run_id: runId, revision: hub.revision });

  it("rejects another run's series at the same content-only revision", () => {
    const hub = hubPreAnalytics();
    expect(hub.revision_binding?.value).toBe("SOURCE_CONTENT_ONLY");
    expect(seriesMatchesHub(hub, seriesFor(hub, hub.run_id))).toBe(true);
    expect(seriesMatchesHub(hub, seriesFor(hub, "rrun_someone_else_with_identical_output"))).toBe(false);
  });

  it("holds a Hub that does not declare its binding to the stricter rule", () => {
    const hub = { ...hubPreAnalytics(), revision_binding: undefined };
    expect(seriesMatchesHub(hub, seriesFor(hub, "rrun_other"))).toBe(false);
  });

  it("accepts a run-input-bound revision on the revision alone", () => {
    const hub = hubAnalytics();
    expect(hub.revision_binding?.value).toBe("RUN_INPUT_BOUND");
    expect(seriesMatchesHub(hub, seriesFor(hub, hub.run_id))).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * CG-P13-09 — the retained passport
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — the passport renders the lane's typed answer", () => {
  const notApplicable = (): PassportSlot =>
    ({ state: "not-applicable", answer: clone(LANE_NOT_APPLICABLE_JSON) }) as unknown as PassportSlot;

  it("renders a 200 not-applicable as not applicable, with its reason and no refusal", () => {
    const { container } = view({ passport: notApplicable() });
    const panel = container.querySelector("[data-passport]");
    expect(panel?.getAttribute("data-passport")).toBe("not-applicable");
    expect(panel?.querySelector("[data-passport-refusal]")).toBeNull();
    expect(panel?.querySelector("[data-passport-cause='NOT_APPLICABLE']")?.textContent).toContain(
      "bound to the P04 fixed qualification, which the retained lane never holds",
    );
    expect(panel?.textContent).toContain("rs02.delta-wfo-global.v1");
    expect(panel?.querySelector("[data-withheld='NOT_APPLICABLE']")).toBeTruthy();
  });

  it("keeps a 200 not-applicable out of the refused state in the hook", async () => {
    stub((url) => (url.includes("/current-source/evidence") ? [200, LANE_NOT_APPLICABLE_JSON] : [200, HUB_ANALYTICS_JSON]));
    const { result } = renderHook(() => useEvidence(HUB_ANALYTICS_JSON.run_id));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => result.current.ensurePassport());
    await waitFor(() => expect(result.current.passport.state).toBe("not-applicable"));
    expect(result.current.refusal).toBeNull();
  });

  it("asks the lane about a cancelled run and renders its answer, rather than inferring a skip", () => {
    const ensurePassport = vi.fn();
    view({ hub: hubCancelled(), ensurePassport });
    expect(ensurePassport).toHaveBeenCalled();
  });

  it("skips the read only while the run is in progress", () => {
    const ensurePassport = vi.fn();
    const hub = withLifecycle(hubAnalytics(), { phase: "IN_PROGRESS", display_status: "RUNNING", terminal_outcome: null });
    const { container } = view({ hub, ensurePassport });
    expect(ensurePassport).not.toHaveBeenCalled();
    expect(container.querySelector("[data-passport-cause='PENDING_SOURCE']")?.textContent).toContain(
      CURRENT_SOURCE_LANE_COPY.PENDING_SOURCE,
    );
  });

  it("carries a 409's lane_state from the problem body to the panel", async () => {
    stub((url) =>
      url.includes("/current-source/evidence")
        ? [
            409,
            {
              error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "anything at all" },
              details: { lane_state: "NOT_RETAINED_TERMINAL", effective_status: "CANCELLED" },
            },
          ]
        : [200, HUB_ANALYTICS_JSON],
    );
    const { result } = renderHook(() => useEvidence(HUB_ANALYTICS_JSON.run_id));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => result.current.ensurePassport());
    await waitFor(() => expect(result.current.passport.state).toBe("refused"));
    const slot = result.current.passport;
    expect(slot.state === "refused" ? slot.refusal.laneState : null).toBe("NOT_RETAINED_TERMINAL");
    cleanup();
    const { container } = view({ passport: slot });
    const panel = container.querySelector("[data-passport-refusal]");
    expect(panel?.getAttribute("data-lane-state")).toBe("NOT_RETAINED_TERMINAL");
    expect(panel?.querySelector("[data-passport-cause]")?.textContent).toBe(CURRENT_SOURCE_LANE_COPY.NOT_RETAINED_TERMINAL);
  });

  it("gives each lane state its own sentence", () => {
    for (const lane of ["PENDING_SOURCE", "PENDING_RETENTION", "NOT_RETAINED_LEGACY", "NOT_RETAINED_TERMINAL"] as const) {
      const refusal = toEvidenceRefusal(new ResearchLaneConflictError("x", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", null, lane));
      const { container, unmount } = view({ passport: { state: "refused", refusal } });
      expect(container.querySelector("[data-passport-cause]")?.getAttribute("data-passport-cause"), lane).toBe(lane);
      expect(container.querySelector("[data-passport-cause]")?.textContent, lane).toBe(CURRENT_SOURCE_LANE_COPY[lane]);
      unmount();
    }
  });

  it("no longer reads the lane from the message text", () => {
    const refusal = toEvidenceRefusal(
      new PortalApiError("Current QuantBT output is PENDING_RETENTION.", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", null),
    );
    const { container } = view({ passport: { state: "refused", refusal } });
    expect(container.querySelector("[data-passport-cause]")?.getAttribute("data-passport-cause")).toBe("NOT_RETAINED");
  });
});

/* -------------------------------------------------------------------------
 * Shared copy (researchRefusal.ts additions)
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — shared refusal additions are additive", () => {
  it("adds laneState only to a refusal whose error carried one", () => {
    const plain = toResearchRefusal(new PortalApiError("no", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", null));
    expect("laneState" in plain).toBe(false);
    const typed = toResearchRefusal(new ResearchLaneConflictError("no", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", null, "PENDING_RETENTION"));
    expect(typed.laneState).toBe("PENDING_RETENTION");
    expect(typed.message).toBe(plain.message);
    expect(typed.state).toBe(plain.state);
  });

  it("has a sentence for every reason code the RF-05 delivery introduced", () => {
    for (const code of [
      "P13_SOURCE_PREDATES_OOS_ANALYTICS",
      "P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE",
      "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW",
      "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT",
      "P13_OOS_RETURN_ZERO_VARIANCE",
      "P13_OOS_HAS_NO_DOWNSIDE_RETURNS",
      "P13_OOS_HAS_NO_LOSING_RETURNS",
      "P13_OOS_HAS_NO_LONG_EXPOSURE_BARS",
      "P13_OOS_HAS_NO_SHORT_EXPOSURE_BARS",
      "P13_OOS_LONG_EXPOSURE_NOT_IN_EVERY_SYMBOL",
      "P13_OOS_SHORT_EXPOSURE_NOT_IN_EVERY_SYMBOL",
      "P13_OOS_SPAN_BELOW_ONE_DAY",
      "P13_QUANTBT_CAGR_CLAMPED",
      "P13_RECEIPT_BYTE_BUDGET_EXHAUSTED",
      "P13_ENGINE_LOCATOR_MISMATCH",
      "P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS",
      "P13_ROLLING_SHARPE_ZERO_VARIANCE_WINDOWS",
      "P13_LEADING_MONTH_NOT_CONTIGUOUS_WITH_SOURCE_MONTHS",
    ]) {
      expect(reasonCodeSentence(code), code).toBeTruthy();
    }
    expect(reasonCodeSentence("SOMETHING_ELSE")).toBeNull();
    for (const sentence of Object.values(REASON_CODE_SENTENCES)) expect(sentence).not.toMatch(/\bwin rate\b/i);
  });
});
