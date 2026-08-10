/** Complete run configuration workspace backed by the portal request schema. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, Collapsible, DefinitionList, SegmentedControl, StateView } from "../../components/ui";
import { api, type ParameterSpec } from "../../lib/api";
import { fmtCount } from "../../lib/format";
import { ThreeWindowEditor } from "./ThreeWindowEditor";
import { WindowTimeline } from "./WindowTimeline";

type Protocol = "three_window_decay" | "advanced_walk_forward";
type EditableSpec = ParameterSpec;

export interface WindowState {
  isStart: string;
  isEnd: string;
  oosStart: string;
  oosEnd: string;
  holdoutStart: string;
  holdoutEnd: string;
}

const DEFAULT_WINDOWS: WindowState = {
  isStart: "2020-01-01T00:00:00Z",
  isEnd: "2024-01-01T00:00:00Z",
  oosStart: "2024-01-01T00:00:00Z",
  oosEnd: "2025-07-01T00:00:00Z",
  holdoutStart: "2025-07-01T00:00:00Z",
  holdoutEnd: "",
};

const DEFAULT_OPTIMIZATION: Record<string, string | number | boolean | null> = {
  top_is_fraction: 0.1,
  top_is_k: null,
  decay_lambda: 0.5,
  decay_gamma: 0.5,
  candidate_decay_lambda: null,
  candidate_decay_gamma: null,
  candidate_selection_metric: "robust_decay",
  flat_top_fraction: 0.1,
  flat_eps: 0.15,
  flat_min_samples: 3,
  flat_selector: "medoid",
  plateau_quantile: 0.25,
  plateau_median_weight: 0.25,
  plateau_std_penalty: 0.5,
  plateau_size_bonus: 0.01,
  is_subperiods: 6,
  q25_weight: 0.3,
  dispersion_penalty: 0.5,
  temporal_weight: 0.65,
  plateau_weight: 0.35,
  use_bootstrap_penalty: false,
  use_complexity_penalty: false,
  sbb_samples: 256,
  sbb_block_length: 20,
  sbb_decay_lambda: 0.5,
  sbb_std_penalty: 0.1,
  sbb_simulation: "stationary",
  regime_count: 3,
  regime_lookback: 20,
  stress_vol_multiplier: 1,
  garch_p: 1,
  garch_q: 1,
  garch_dist: "t",
  garch_vol_multiplier: 1,
  scoring_backend: "endpoint",
  scoring_trading_days: 365,
  min_trades_per_year: 100,
  trade_penalty_factor: 0.5,
  use_numba: true,
};

const DEFAULT_ACCOUNT = {
  initial_capital: 20_000,
  leverage: 1,
  maintenance_ratio: 0.005,
  contract_size: 1,
  alloc_per_trade: 0.5,
  canonical_one_way_fee_rate: 0.0005,
  funding_enabled: true,
  funding_rate: 0.0001,
  use_pyramiding: false,
};

const DEFAULT_EXECUTION = { slippage: 0.0001, target_mode: "pct_equity", backend: "auto" };

const DEFAULT_ADVANCED = {
  dataStart: "2020-01-01T00:00:00Z",
  dataEnd: "",
  splitMode: "2022-01-01",
  splitFrequency: "quarterly",
  windowMode: "expanding",
  trainWindow: "365D",
  minTrainBars: 1,
  minTestBars: 1,
  fillValue: 0,
  optimizationMode: "mode_1_decay",
  optimizationSchedule: "global",
};

function NumericInput({
  label,
  value,
  onChange,
  min,
  step = "any",
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number | "any";
}) {
  return (
    <label className="space-y-1">
      <span className="label block">{label}</span>
      <input
        className="input w-full"
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="label block">{label}</span>
      <select className="input w-full" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5 last:border-0">
      <span className="mono text-[11px] text-ink-soft">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function ConfigWorkspace() {
  const navigate = useNavigate();
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const options = useQuery({ queryKey: ["config-options"], queryFn: api.configOptions });
  const strategy = strategies.data?.[0];

  const [protocol, setProtocol] = useState<Protocol>("three_window_decay");
  const [datasetId, setDatasetId] = useState("crypto-binance-1m");
  const [windows, setWindows] = useState<WindowState>(DEFAULT_WINDOWS);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [trials, setTrials] = useState(400);
  const [earlyStopping, setEarlyStopping] = useState<number | null>(200);
  const [seed, setSeed] = useState<number | null>(42);
  const [searchSpace, setSearchSpace] = useState<Record<string, EditableSpec>>({});
  const [optimization, setOptimization] = useState(DEFAULT_OPTIMIZATION);
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [execution, setExecution] = useState(DEFAULT_EXECUTION);
  const [advanced, setAdvanced] = useState(DEFAULT_ADVANCED);
  const [validatedKey, setValidatedKey] = useState("");

  useEffect(() => {
    if (!strategy || Object.keys(searchSpace).length) return;
    setSearchSpace(
      Object.fromEntries(
        Object.entries(strategy.parameter_space).map(([key, value]) => [
          key,
          {
            kind: Number.isInteger(value.low) && Number.isInteger(value.high) && Number.isInteger(value.step)
              ? "int_range"
              : "float_range",
            low: value.low,
            high: value.high,
            step: value.step,
          },
        ]),
      ),
    );
  }, [strategy, searchSpace]);

  useEffect(() => {
    if (!datasets.data?.length || datasets.data.some((item) => item.dataset_id === datasetId)) return;
    setDatasetId(datasets.data[0].dataset_id);
  }, [datasets.data, datasetId]);

  const dataset = datasets.data?.find((item) => item.dataset_id === datasetId) ?? datasets.data?.[0];
  const setOpt = (key: string, value: string | number | boolean | null) =>
    setOptimization((current) => ({ ...current, [key]: value }));

  const payload = useMemo(() => {
    const calibration =
      protocol === "three_window_decay"
        ? {
            is_start: windows.isStart,
            is_end_exclusive: windows.isEnd,
            oos_start: windows.oosStart,
            oos_end_exclusive: windows.oosEnd,
            holdout_start: windows.holdoutStart,
            holdout_end_exclusive: windows.holdoutEnd || null,
            optimization_mode: "mode_1_decay",
            optimization_schedule: "global",
            optuna_trials: trials,
            optuna_early_stopping: earlyStopping,
            random_seed: seed,
            optimization: { ...optimization, candidate_selection_metric: "robust_decay" },
          }
        : {
            data_start: advanced.dataStart || null,
            data_end_exclusive: advanced.dataEnd || null,
            split_mode: advanced.splitMode,
            split_frequency: advanced.splitFrequency,
            window_mode: advanced.windowMode,
            train_window: advanced.windowMode === "rolling" ? advanced.trainWindow : null,
            min_train_bars: advanced.minTrainBars,
            min_test_bars: advanced.minTestBars,
            fill_value: advanced.fillValue,
            optimization_mode: advanced.optimizationMode,
            optimization_schedule: advanced.optimizationSchedule,
            fold_boundary_position_policy: "carry",
            optuna_trials: advanced.optimizationMode === "none" ? 0 : trials,
            optuna_early_stopping: advanced.optimizationMode === "none" ? null : earlyStopping,
            random_seed: seed,
            optimization,
          };
    return {
      strategy_id: strategy?.strategy_id ?? "delta-rsi-polynomial-alpha",
      dataset_id: dataset?.dataset_id ?? datasetId,
      symbol,
      timeframe,
      protocol,
      parameter_space: searchSpace,
      calibration,
      account,
      execution,
    };
  }, [account, advanced, dataset, datasetId, earlyStopping, execution, optimization, protocol, searchSpace, seed, strategy, symbol, timeframe, trials, windows]);

  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);
  const preflight = useMutation({
    mutationFn: (variables: { body: typeof payload; key: string }) => api.preflight(variables.body),
    onSuccess: (_data, variables) => setValidatedKey(variables.key),
  });
  const createRun = useMutation({
    mutationFn: async () => (await api.createRun(payload)).run_id,
    onSuccess: (runId) => navigate(`/?run=${runId}`),
  });

  const overlapError = useMemo(() => {
    if (protocol !== "three_window_decay") return null;
    if (windows.isEnd !== windows.oosStart) return "OOS must start where IS ends";
    if (windows.oosEnd !== windows.holdoutStart) return "Holdout Live must start where OOS ends";
    if (windows.isStart >= windows.isEnd || windows.oosStart >= windows.oosEnd) return "Every window must have positive duration";
    return null;
  }, [protocol, windows]);

  const preflightValid = preflight.data?.valid === true && validatedKey === payloadKey;
  const runnable = !overlapError && preflightValid && !createRun.isPending;

  if (strategies.isLoading || datasets.isLoading || options.isLoading) return <StateView kind="loading" />;
  if (strategies.isError || datasets.isError || options.isError) {
    return <StateView kind="failed" message="Không tải được schema cấu hình" onRetry={() => void (strategies.refetch(), datasets.refetch(), options.refetch())} />;
  }

  const timeframes = dataset?.supported_timeframes?.length ? dataset.supported_timeframes : ["15m", "1h", "4h", "1d"];
  const fieldGrid = "grid grid-cols-2 gap-2";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
      <aside className="space-y-3 self-start xl:max-h-[calc(100vh-76px)] xl:overflow-y-auto xl:pr-2">
        <div>
          <h1 className="section-title">Run Configuration</h1>
          <p className="dek">Configure market tape, WFO, search space and account.</p>
        </div>

        <div>
          <div className="label mb-1.5">Protocol</div>
          <SegmentedControl
            value={protocol}
            onChange={setProtocol}
            options={[
              { value: "three_window_decay", label: "Three-Window" },
              { value: "advanced_walk_forward", label: "Advanced WFO" },
            ]}
          />
        </div>

        <Collapsible title="Market data" defaultOpen>
          <div className={fieldGrid}>
            <label className="col-span-2 space-y-1">
              <span className="label block">Dataset</span>
              <select className="input w-full" value={datasetId} onChange={(event) => setDatasetId(event.target.value)}>
                {datasets.data?.map((item) => <option key={item.dataset_id} value={item.dataset_id}>{item.dataset_id}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="label block">Symbol</span><input className="input w-full" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>
            <SelectInput label="Timeframe" value={timeframe} options={timeframes} onChange={setTimeframe} />
          </div>
        </Collapsible>

        {protocol === "three_window_decay" ? (
          <ThreeWindowEditor windows={windows} onChange={setWindows} />
        ) : (
          <Collapsible title="Walk-forward folds" defaultOpen>
            <div className={fieldGrid}>
              <label className="space-y-1"><span className="label block">Analysis start</span><input className="input w-full" type="datetime-local" value={advanced.dataStart.slice(0, 16)} onChange={(event) => setAdvanced({ ...advanced, dataStart: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label>
              <label className="space-y-1"><span className="label block">End exclusive</span><input className="input w-full" type="datetime-local" value={advanced.dataEnd.slice(0, 16)} onChange={(event) => setAdvanced({ ...advanced, dataEnd: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label>
              <label className="col-span-2 space-y-1"><span className="label block">Split mode / first OOS</span><input className="input w-full" value={advanced.splitMode} onChange={(event) => setAdvanced({ ...advanced, splitMode: event.target.value })} /></label>
              <SelectInput label="Frequency" value={advanced.splitFrequency} options={options.data?.split_frequencies ?? []} onChange={(value) => setAdvanced({ ...advanced, splitFrequency: value })} />
              <SelectInput label="Window" value={advanced.windowMode} options={options.data?.window_modes ?? []} onChange={(value) => setAdvanced({ ...advanced, windowMode: value })} />
              {advanced.windowMode === "rolling" ? <label className="col-span-2 space-y-1"><span className="label block">Train window</span><input className="input w-full" value={advanced.trainWindow} onChange={(event) => setAdvanced({ ...advanced, trainWindow: event.target.value })} /></label> : null}
              <NumericInput label="Min train bars" value={advanced.minTrainBars} min={1} step={1} onChange={(value) => setAdvanced({ ...advanced, minTrainBars: value ?? 1 })} />
              <NumericInput label="Min test bars" value={advanced.minTestBars} min={1} step={1} onChange={(value) => setAdvanced({ ...advanced, minTestBars: value ?? 1 })} />
              <NumericInput label="Signal fill value" value={advanced.fillValue} onChange={(value) => setAdvanced({ ...advanced, fillValue: value ?? 0 })} />
            </div>
          </Collapsible>
        )}

        <Collapsible title="Search space" defaultOpen>
          <div className="space-y-2">
            {Object.entries(searchSpace).map(([key, spec]) => (
              <div key={key} className="border-b border-line-soft pb-2 last:border-0">
                <div className="mb-1 grid grid-cols-[1fr_120px] items-center gap-2">
                  <span className="mono text-[11px] text-ink-soft">{key}</span>
                  <select className="input" value={spec.kind} onChange={(event) => {
                    const kind = event.target.value as EditableSpec["kind"];
                    const next: EditableSpec = kind === "fixed" ? { kind, value: 0 } : kind === "categorical" ? { kind, values: [] } : { kind, low: 0, high: 1, step: kind === "int_range" ? 1 : 0.1 };
                    setSearchSpace((current) => ({ ...current, [key]: next }));
                  }}>
                    {(["int_range", "float_range", "fixed", "categorical"] as const).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                </div>
                {spec.kind === "int_range" || spec.kind === "float_range" ? (
                  <div className="grid grid-cols-3 gap-1">
                    {(["low", "high", "step"] as const).map((field) => <input key={field} aria-label={`${key} ${field}`} className="input" type="number" step="any" value={spec[field]} onChange={(event) => setSearchSpace((current) => ({ ...current, [key]: { ...spec, [field]: Number(event.target.value) } }))} />)}
                  </div>
                ) : spec.kind === "fixed" ? (
                  <input className="input w-full" value={String(spec.value ?? "")} onChange={(event) => setSearchSpace((current) => ({ ...current, [key]: { kind: "fixed", value: Number.isNaN(Number(event.target.value)) ? event.target.value : Number(event.target.value) } }))} />
                ) : (
                  <input className="input w-full" value={spec.values.join(", ")} placeholder="value1, value2" onChange={(event) => setSearchSpace((current) => ({ ...current, [key]: { kind: "categorical", values: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } }))} />
                )}
              </div>
            ))}
          </div>
        </Collapsible>

        <Collapsible title="Optimization" defaultOpen>
          <div className={fieldGrid}>
            {protocol === "advanced_walk_forward" ? <>
              <SelectInput label="Mode" value={advanced.optimizationMode} options={options.data?.optimization_modes ?? []} onChange={(value) => setAdvanced({ ...advanced, optimizationMode: value })} />
              <SelectInput label="Schedule" value={advanced.optimizationSchedule} options={options.data?.optimization_schedules ?? []} onChange={(value) => setAdvanced({ ...advanced, optimizationSchedule: value })} />
            </> : null}
            <NumericInput label="Optuna trials" value={trials} min={1} step={1} onChange={(value) => setTrials(value ?? 1)} />
            <NumericInput label="Early stopping" value={earlyStopping} min={1} step={1} onChange={setEarlyStopping} />
            <NumericInput label="Random seed" value={seed} step={1} onChange={setSeed} />
            <SelectInput label="Selection metric" value={String(protocol === "three_window_decay" ? "robust_decay" : optimization.candidate_selection_metric)} options={options.data?.candidate_selection_metrics ?? []} disabled={protocol === "three_window_decay"} onChange={(value) => setOpt("candidate_selection_metric", value)} />
            <NumericInput label="Top IS fraction" value={Number(optimization.top_is_fraction)} min={0} onChange={(value) => setOpt("top_is_fraction", value ?? 0.1)} />
            <NumericInput label="Top IS k" value={optimization.top_is_k as number | null} min={1} step={1} onChange={(value) => setOpt("top_is_k", value)} />
            <NumericInput label="Decay lambda" value={Number(optimization.decay_lambda)} min={0} onChange={(value) => setOpt("decay_lambda", value ?? 0)} />
            <NumericInput label="Decay gamma" value={Number(optimization.decay_gamma)} min={0} onChange={(value) => setOpt("decay_gamma", value ?? 0)} />
            <SelectInput label="Scoring backend" value={String(optimization.scoring_backend)} options={["endpoint", "proxy"]} onChange={(value) => setOpt("scoring_backend", value)} />
            <NumericInput label="Trading days" value={Number(optimization.scoring_trading_days)} min={1} step={1} onChange={(value) => setOpt("scoring_trading_days", value ?? 365)} />
            <NumericInput label="Min trades / year" value={optimization.min_trades_per_year as number | null} min={0} onChange={(value) => setOpt("min_trades_per_year", value)} />
            <NumericInput label="Trade penalty" value={optimization.trade_penalty_factor as number | null} min={0} onChange={(value) => setOpt("trade_penalty_factor", value)} />
          </div>
          <ToggleInput label="Use Numba scoring" checked={Boolean(optimization.use_numba)} onChange={(value) => setOpt("use_numba", value)} />
        </Collapsible>

        <Collapsible title="Plateau & temporal robustness">
          <div className={fieldGrid}>
            <NumericInput label="Flat top fraction" value={Number(optimization.flat_top_fraction)} onChange={(value) => setOpt("flat_top_fraction", value ?? 0.1)} />
            <NumericInput label="DBSCAN eps" value={Number(optimization.flat_eps)} onChange={(value) => setOpt("flat_eps", value ?? 0.15)} />
            <NumericInput label="Min samples" value={Number(optimization.flat_min_samples)} step={1} onChange={(value) => setOpt("flat_min_samples", value ?? 3)} />
            <SelectInput label="Selector" value={String(optimization.flat_selector)} options={["medoid", "centroid"]} onChange={(value) => setOpt("flat_selector", value)} />
            <NumericInput label="Plateau quantile" value={Number(optimization.plateau_quantile)} onChange={(value) => setOpt("plateau_quantile", value ?? 0.25)} />
            <NumericInput label="Median weight" value={Number(optimization.plateau_median_weight)} onChange={(value) => setOpt("plateau_median_weight", value ?? 0.25)} />
            <NumericInput label="Std penalty" value={Number(optimization.plateau_std_penalty)} onChange={(value) => setOpt("plateau_std_penalty", value ?? 0.5)} />
            <NumericInput label="Size bonus" value={Number(optimization.plateau_size_bonus)} onChange={(value) => setOpt("plateau_size_bonus", value ?? 0.01)} />
            <NumericInput label="IS subperiods" value={Number(optimization.is_subperiods)} step={1} onChange={(value) => setOpt("is_subperiods", value ?? 6)} />
            <NumericInput label="Q25 weight" value={Number(optimization.q25_weight)} onChange={(value) => setOpt("q25_weight", value ?? 0.3)} />
            <NumericInput label="Dispersion penalty" value={Number(optimization.dispersion_penalty)} onChange={(value) => setOpt("dispersion_penalty", value ?? 0.5)} />
            <NumericInput label="Temporal weight" value={Number(optimization.temporal_weight)} onChange={(value) => setOpt("temporal_weight", value ?? 0.65)} />
            <NumericInput label="Plateau weight" value={Number(optimization.plateau_weight)} onChange={(value) => setOpt("plateau_weight", value ?? 0.35)} />
          </div>
          <ToggleInput label="Bootstrap penalty" checked={Boolean(optimization.use_bootstrap_penalty)} onChange={(value) => setOpt("use_bootstrap_penalty", value)} />
          <ToggleInput label="Complexity penalty" checked={Boolean(optimization.use_complexity_penalty)} onChange={(value) => setOpt("use_complexity_penalty", value)} />
        </Collapsible>

        <Collapsible title="SBB, regime & GARCH">
          <div className={fieldGrid}>
            <NumericInput label="SBB samples" value={Number(optimization.sbb_samples)} step={1} onChange={(value) => setOpt("sbb_samples", value ?? 256)} />
            <NumericInput label="Block length" value={Number(optimization.sbb_block_length)} step={1} onChange={(value) => setOpt("sbb_block_length", value ?? 20)} />
            <NumericInput label="SBB decay lambda" value={Number(optimization.sbb_decay_lambda)} onChange={(value) => setOpt("sbb_decay_lambda", value ?? 0.5)} />
            <NumericInput label="SBB std penalty" value={Number(optimization.sbb_std_penalty)} onChange={(value) => setOpt("sbb_std_penalty", value ?? 0.1)} />
            <SelectInput label="Simulation" value={String(optimization.sbb_simulation)} options={["stationary", "regime", "stress", "garch"]} onChange={(value) => setOpt("sbb_simulation", value)} />
            <NumericInput label="Regime count" value={Number(optimization.regime_count)} step={1} onChange={(value) => setOpt("regime_count", value ?? 3)} />
            <NumericInput label="Regime lookback" value={Number(optimization.regime_lookback)} step={1} onChange={(value) => setOpt("regime_lookback", value ?? 20)} />
            <NumericInput label="Stress vol multiplier" value={Number(optimization.stress_vol_multiplier)} onChange={(value) => setOpt("stress_vol_multiplier", value ?? 1)} />
            <NumericInput label="GARCH p" value={Number(optimization.garch_p)} step={1} onChange={(value) => setOpt("garch_p", value ?? 1)} />
            <NumericInput label="GARCH q" value={Number(optimization.garch_q)} step={1} onChange={(value) => setOpt("garch_q", value ?? 1)} />
            <SelectInput label="GARCH dist" value={String(optimization.garch_dist)} options={["t", "normal", "gaussian", "studentst"]} onChange={(value) => setOpt("garch_dist", value)} />
            <NumericInput label="GARCH vol multiplier" value={Number(optimization.garch_vol_multiplier)} onChange={(value) => setOpt("garch_vol_multiplier", value ?? 1)} />
          </div>
        </Collapsible>

        <Collapsible title="Account & execution" defaultOpen>
          <div className={fieldGrid}>
            {(["initial_capital", "leverage", "maintenance_ratio", "contract_size", "alloc_per_trade", "canonical_one_way_fee_rate", "funding_rate"] as const).map((key) => (
              <NumericInput key={key} label={key.replaceAll("_", " ")} value={account[key] as number} min={key === "funding_rate" ? undefined : 0} onChange={(value) => setAccount({ ...account, [key]: value ?? 0 })} />
            ))}
            <NumericInput label="Slippage" value={execution.slippage} min={0} onChange={(value) => setExecution({ ...execution, slippage: value ?? 0 })} />
            <SelectInput label="Target mode" value={execution.target_mode} options={options.data?.target_modes ?? ["pct_equity"]} onChange={(value) => setExecution({ ...execution, target_mode: value })} />
            <SelectInput label="Backend" value={execution.backend} options={["auto"]} onChange={(value) => setExecution({ ...execution, backend: value })} />
          </div>
          <ToggleInput label="Funding enabled" checked={account.funding_enabled} onChange={(value) => setAccount({ ...account, funding_enabled: value })} />
          <ToggleInput label="Use pyramiding" checked={account.use_pyramiding} onChange={(value) => setAccount({ ...account, use_pyramiding: value })} />
        </Collapsible>
      </aside>

      <section className="min-w-0 space-y-4">
        {protocol === "three_window_decay" ? <WindowTimeline windows={windows} overlapError={overlapError} /> : <AdvancedSummary advanced={advanced} />}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><span className="label">Preflight TermSheet</span>{validatedKey && validatedKey !== payloadKey ? <Badge tone="pending">configuration changed</Badge> : null}</div>
          {preflight.isPending ? <StateView kind="loading" message="Validating market tape and run contract…" /> : null}
          {preflight.isError ? <StateView kind="failed" message={preflight.error.message} onRetry={() => preflight.mutate({ body: payload, key: payloadKey })} /> : null}
          {overlapError ? <div className="mb-3 rounded-md border border-bad/40 bg-bad-bg p-3"><span className="mono text-[12px] font-semibold text-bad">{overlapError}</span></div> : null}
          {preflight.data ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2"><Badge tone="pass">schema</Badge><Badge tone="pass">boundaries</Badge><Badge tone="pass">content hash</Badge>{preflight.data.windows.map((window) => <span key={window.role} className="chip">{window.role} · {fmtCount(window.bars)} bars</span>)}</div>
              <DefinitionList rows={[
                ["Dataset", preflight.data.dataset_id],
                ["Symbol / timeframe", `${preflight.data.symbol} · ${preflight.data.timeframe}`],
                ["Loaded rows", fmtCount(preflight.data.data_quality.rows)],
                ["Analysis rows", fmtCount(preflight.data.data_quality.analysis?.rows ?? preflight.data.data_quality.rows)],
                ["Missing bars", `${preflight.data.data_quality.missing_bar_count}`],
                ["Config hash", preflight.data.config_hash.slice(0, 12)],
              ]} />
            </div>
          ) : <p className="text-[12px] text-ink-faint">Validate the current configuration before submitting a run.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => preflight.mutate({ body: payload, key: payloadKey })} disabled={Boolean(overlapError) || preflight.isPending}><RefreshCcw size={12} />Validate</button>
            <button type="button" className="btn-primary" disabled={!runnable} onClick={() => createRun.mutate()}><Play size={13} />{createRun.isPending ? "Submitting…" : "Run backtest"}</button>
            {createRun.isError ? <span className="mono text-[12px] text-bad">{createRun.error.message}</span> : null}
          </div>
        </div>
        <div className="card p-4">
          <div className="label mb-2">Request preview</div>
          <pre className="max-h-[520px] overflow-auto rounded bg-sunken p-3 text-[11px] leading-5 text-ink-soft">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      </section>
    </div>
  );
}

function AdvancedSummary({ advanced }: { advanced: typeof DEFAULT_ADVANCED }) {
  return (
    <div className="card p-4">
      <div className="label mb-3">Advanced WFO protocol</div>
      <DefinitionList rows={[
        ["Analysis tape", `${advanced.dataStart || "dataset start"} → ${advanced.dataEnd || "dataset end"}`],
        ["Split", `${advanced.splitMode} · ${advanced.splitFrequency}`],
        ["Window", advanced.windowMode === "rolling" ? `rolling ${advanced.trainWindow}` : "expanding"],
        ["Optimization", `${advanced.optimizationMode} · ${advanced.optimizationSchedule}`],
        ["Boundary positions", "carry"],
      ]} />
    </div>
  );
}
