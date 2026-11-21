/**
 * Generated-client input shape for S02 New Run.  Source of truth is the
 * adjacent `requested-spec.v1.schema.json`; this declaration is intentionally
 * producer-side only and must not be mistaken for a currently accepted
 * Control-API endpoint body.
 *
 * Dynamic route, manifest and optimizer choices remain P04 authority. P10
 * binds this DTO to an authenticated producer after P03 establishes identity.
 */

export type RequestedSpecScalarV1 = string | number | boolean;
export type ExactDecimalStringV1 = string;
export type ResearchRouteIdV1 =
  | "signal_notional"
  | "pct_equity"
  | "intrabar_bracket"
  | "dca_ladder"
  | "reactive"
  | "event_driven"
  | "native_event_lifecycle"
  | "orders"
  | "fill_replay"
  | "basket"
  | "arbitrage"
  | "portfolio"
  | "nautilus_dca_grid"
  | "options";

export interface ResearchAlphaBindingV1 {
  alpha_id: string;
  alpha_version_id: string;
}

export type PublishabilityV1 =
  | { alpha_binding: ResearchAlphaBindingV1; not_publishable: false }
  | { alpha_binding: null; not_publishable: true };

export interface ResearchDataSelectionV1 {
  dataset_id: string;
  symbol: string;
  timeframe: string;
}

export interface ResearchIntervalV1 {
  /** Source S02 controls are datetime-local. P10 normalizes only when its real producer contract proves a transport representation. */
  start: string;
  end_exclusive: string;
}

export interface ThreeWindowSpecV1 {
  protocol: "three_window_decay";
  windows: { is: ResearchIntervalV1; oos: ResearchIntervalV1; holdout: ResearchIntervalV1 };
  walk_forward?: never;
}

export interface AdvancedWalkForwardSpecV1 {
  protocol: "advanced";
  walk_forward: {
    start: string;
    end_exclusive: string;
    split_mode: string;
    frequency: string;
    window_mode: string;
  };
  windows?: never;
}

export interface IntrabarRouteParamsV1 {
  intrabar: {
    level_mode: "hlc_conservative" | "ohlc_path" | "close_only";
    same_bar_policy: "stop_first" | "target_first" | "ambiguity_flag";
    tick_size: ExactDecimalStringV1;
  };
}

export interface PortfolioRouteParamsV1 {
  portfolio: {
    mode: "longshort" | "market_neutral" | "directional" | "equal_weight" | "risk_parity" | "beta_neutral";
    sizing: "equal_weight" | "risk_parity" | "vol_target" | "kelly_fraction" | "fixed_notional" | "atr_risk" | "min_variance" | "score_weighted";
  };
}

export interface ReactiveRouteParamsV1 {
  reactive: {
    runtime: "R0" | "R1" | "R2" | "R3" | "R3B";
    audit_mode: "minimal" | "standard" | "audit";
  };
}

export interface DcaRouteParamsV1 {
  dca: {
    base_order_usd: ExactDecimalStringV1;
    safety_orders: number;
    step_scale: ExactDecimalStringV1;
  };
}

/**
 * A route discriminator and its parameter object travel together.  Keeping
 * this as a union (rather than two unrelated fields) makes an invalid client
 * payload a TypeScript error before the P02 runtime validator sees it.
 */
export type RequestedSpecRouteV1 =
  | { execution_route: "intrabar_bracket"; route_params: IntrabarRouteParamsV1 }
  | { execution_route: "portfolio"; route_params: PortfolioRouteParamsV1 }
  | { execution_route: "reactive"; route_params: ReactiveRouteParamsV1 }
  | { execution_route: "dca_ladder"; route_params: DcaRouteParamsV1 }
  | {
      execution_route: Exclude<
        ResearchRouteIdV1,
        "intrabar_bracket" | "portfolio" | "reactive" | "dca_ladder"
      >;
      route_params: Record<string, never>;
    };

export type ParameterSpaceOverrideV1 =
  | { name: string; kind: "sweep"; low: RequestedSpecScalarV1; high: RequestedSpecScalarV1 }
  | { name: string; kind: "pin"; value: RequestedSpecScalarV1 };

export interface RequestedSpecCommonV1 {
  schema_version: "research.requested-spec.v1";
  strategy_id: string;
  data: ResearchDataSelectionV1;
  optimization_mode: string;
  optimization_schedule: string;
  parameter_space_overrides: ParameterSpaceOverrideV1[];
  optuna_trials: number;
  early_stopping: number | null;
  random_seed: number | null;
  /** Sparse overrides only; actual keys and values are manifest-owned in P04. */
  optimization_config: Record<string, RequestedSpecScalarV1>;
  client: { engine_release_id: string; config_digest: string };
}

export type RequestedSpecV1 = RequestedSpecCommonV1
  & PublishabilityV1
  & RequestedSpecRouteV1
  & (ThreeWindowSpecV1 | AdvancedWalkForwardSpecV1);
