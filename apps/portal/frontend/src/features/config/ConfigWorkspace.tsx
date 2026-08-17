/**
 * New Run — the QuantBT Research configuration flow.
 *
 * The flow is explicit and ordered (v0.4 §P0.9): strategy → data → windows →
 * parameters → optimization → review. Each step is validated on its own, so a
 * problem is reported where it can be fixed instead of appearing as one
 * preflight rejection at the end.
 *
 * Authority rules held here:
 *  - the strategy list comes from the two registry projections, never from a
 *    hard-coded id (strategy import contract §1);
 *  - the protocol list comes from the capability manifest of the INSTALLED
 *    engine release — an uncertified protocol is not offered (§4);
 *  - the parameter editor refuses values outside the declared space (§2);
 *  - the run request payload is unchanged, so the backend contract is frozen.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DateTimeField,
  FieldGrid,
  FieldSpan,
  NumberField,
  SelectField,
  TextField,
  ToggleField,
} from "../../components/form";
import { Collapsible, DefinitionList, StateView } from "../../components/ui";
import { Callout, Panel, SectionHeading, Stepper, Toolbar, type StepDefinition } from "../../components/surface";
import { api, type ParameterSpec } from "../../lib/api";
import { fmtCount } from "../../lib/format";
import {
  buildCatalog,
  certifiedProtocols,
  parseAlphas,
  parseCapabilities,
  protocolLimits,
  type CatalogEntry,
} from "../../portal/strategyCatalog";
import { runPath } from "../quantbt/routes";
import { ParameterEditor, ParameterSummary } from "./ParameterEditor";
import { PreflightChecks } from "./PreflightChecks";
import { StrategyDetail, StrategyPicker } from "./StrategyPicker";
import { ThreeWindowEditor } from "./ThreeWindowEditor";
import { WindowTimeline } from "./WindowTimeline";
import {
  checkResourceCeiling,
  readDeclaredSpace,
  seedSearchSpace,
  validateSearchSpace,
} from "./parameterSpace";

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
  holdoutEnd: "2026-08-14T00:00:00Z",
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
  dataEnd: "2026-08-14T00:00:00Z",
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

/** Human labels for protocol ids; unknown ids fall back to the raw id. */
const PROTOCOL_LABELS: Record<string, string> = {
  three_window_decay: "Three-Window Decay",
  advanced_walk_forward: "Advanced Walk-Forward",
};

const ACCOUNT_LABELS: Record<string, string> = {
  initial_capital: "Vốn ban đầu",
  leverage: "Đòn bẩy",
  maintenance_ratio: "Maintenance ratio",
  contract_size: "Contract size",
  alloc_per_trade: "Phân bổ mỗi lệnh",
  canonical_one_way_fee_rate: "Phí một chiều",
  funding_rate: "Funding rate",
};

type StepId = "strategy" | "data" | "windows" | "parameters" | "optimization" | "review";

export function ConfigWorkspace() {
  const navigate = useNavigate();

  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const options = useQuery({ queryKey: ["config-options"], queryFn: api.configOptions });
  const alphas = useQuery({ queryKey: ["alphas"], queryFn: api.alphas, staleTime: 5 * 60_000 });
  const capabilities = useQuery({
    queryKey: ["engine-capabilities"],
    queryFn: api.engineCapabilities,
    staleTime: 5 * 60_000,
  });

  const capabilityDoc = useMemo(
    () => (capabilities.data === undefined ? undefined : parseCapabilities(capabilities.data)),
    [capabilities.data],
  );
  const catalog = useMemo(
    () =>
      buildCatalog(
        strategies.data,
        alphas.data === undefined ? undefined : parseAlphas(alphas.data),
        capabilityDoc,
      ),
    [strategies.data, alphas.data, capabilityDoc],
  );

  const [step, setStep] = useState<StepId>("strategy");
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string>("");
  const [datasetId, setDatasetId] = useState("");
  const [windows, setWindows] = useState<WindowState>(DEFAULT_WINDOWS);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("");
  const [trials, setTrials] = useState(400);
  const [earlyStopping, setEarlyStopping] = useState<number | null>(200);
  const [seed, setSeed] = useState<number | null>(42);
  const [searchSpace, setSearchSpace] = useState<Record<string, ParameterSpec>>({});
  const [optimization, setOptimization] = useState(DEFAULT_OPTIMIZATION);
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [execution, setExecution] = useState(DEFAULT_EXECUTION);
  const [advanced, setAdvanced] = useState(DEFAULT_ADVANCED);
  const [validatedKey, setValidatedKey] = useState("");

  const selected = useMemo(
    () => catalog.find((entry) => entry.strategyId === strategyId) ?? null,
    [catalog, strategyId],
  );

  // Auto-select when the catalog offers exactly one runnable strategy: making
  // the user click through a single-item list adds nothing.
  useEffect(() => {
    if (strategyId || catalog.length === 0) return;
    const runnable = catalog.filter((entry) => entry.blockedReason === null);
    if (runnable.length === 1) setStrategyId(runnable[0].strategyId);
  }, [catalog, strategyId]);

  const declaredSpace = useMemo(
    () => readDeclaredSpace(selected?.runtime?.parameter_space),
    [selected],
  );

  // Re-seed the editable space whenever the selected strategy changes: a space
  // carried over from another strategy would be validated against the wrong
  // contract.
  useEffect(() => {
    setSearchSpace(seedSearchSpace(declaredSpace));
    setValidatedKey("");
  }, [declaredSpace]);

  useEffect(() => {
    if (selected?.defaultTimeframe && !timeframe) setTimeframe(selected.defaultTimeframe);
  }, [selected, timeframe]);

  useEffect(() => {
    if (!datasets.data?.length) return;
    if (datasets.data.some((item) => item.dataset_id === datasetId)) return;
    setDatasetId(datasets.data[0].dataset_id);
  }, [datasets.data, datasetId]);

  /* --- Protocol availability, declared not inferred ---------------------- */

  const certified = useMemo(() => certifiedProtocols(capabilityDoc), [capabilityDoc]);
  const availableProtocols = useMemo(() => {
    const published = options.data?.protocols ?? [];
    if (certified.length === 0) return published;
    return published.filter((item) => certified.includes(item));
  }, [options.data, certified]);

  useEffect(() => {
    if (availableProtocols.length && !availableProtocols.includes(protocol)) {
      setProtocol(availableProtocols[0]);
    }
  }, [availableProtocols, protocol]);

  const limits = useMemo(() => protocolLimits(capabilityDoc, protocol), [capabilityDoc, protocol]);

  /* --- Validation per step ---------------------------------------------- */

  const dataset = datasets.data?.find((item) => item.dataset_id === datasetId) ?? datasets.data?.[0];
  const timeframes = dataset?.supported_timeframes?.length
    ? dataset.supported_timeframes
    : selected?.timeframes.length
      ? selected.timeframes
      : ["15m", "1h", "4h", "1d"];

  const strategyError = !selected
    ? "Chưa chọn strategy."
    : (selected.blockedReason ?? null);

  const dataError =
    !dataset
      ? "Chưa có dataset nào khả dụng."
      : dataset.availability !== "available"
        ? (dataset.unavailable_reason ?? "Dữ liệu historical cho backtest không khả dụng.")
        : !symbol
          ? "Cần nhập symbol."
          : !timeframe
            ? "Cần chọn timeframe."
            : selected && selected.timeframes.length && !selected.timeframes.includes(timeframe)
              ? `Strategy chỉ khai báo timeframe ${selected.timeframes.join(", ")}.`
              : null;

  const windowError = useMemo(() => {
    if (protocol === "three_window_decay") {
      if (windows.isEnd !== windows.oosStart) return "OOS phải bắt đầu đúng nơi IS kết thúc.";
      if (windows.oosEnd !== windows.holdoutStart) return "Holdout phải bắt đầu đúng nơi OOS kết thúc.";
      if (windows.isStart >= windows.isEnd || windows.oosStart >= windows.oosEnd) {
        return "Mọi window phải có độ dài dương.";
      }
      if (!windows.holdoutEnd) return "Cần holdout end-exclusive cho truy vấn historical.";
      return null;
    }
    if (protocol === "advanced_walk_forward") {
      if (!advanced.dataStart || !advanced.dataEnd) {
        return "Cần analysis start và end-exclusive cho truy vấn historical.";
      }
      if (advanced.dataStart >= advanced.dataEnd) return "Analysis end phải sau analysis start.";
      return null;
    }
    return null;
  }, [protocol, windows, advanced]);

  const validation = useMemo(
    () => validateSearchSpace(searchSpace, declaredSpace),
    [searchSpace, declaredSpace],
  );
  const ceilingError = checkResourceCeiling(
    Object.keys(searchSpace).length,
    limits.maxParameterSpaceEntries,
  );
  const parameterError =
    validation.errors.length > 0
      ? `${validation.errors.length} tham số nằm ngoài parameter space đã công bố.`
      : ceilingError;

  const trialsError =
    limits.maxTrials !== null && trials > limits.maxTrials
      ? `Engine release công bố trần ${limits.maxTrials} trial.`
      : null;

  /*
   * Seed gate (R15).
   *
   * `seed_required` comes from the alpha manifest's `determinism` block, which
   * the registry now publishes. `null` means nothing declared it — a built-in
   * has no manifest — and unknown is NOT permission, so an undeclared strategy
   * is not gated but is not silently blessed either: the field below says which
   * of the three it is.
   */
  const seedError =
    selected?.seedRequired === true && seed === null
      ? "Strategy khai báo determinism.seed_required — cần random seed cố định."
      : null;

  const blockingError =
    strategyError ?? dataError ?? windowError ?? parameterError ?? trialsError ?? seedError;

  /* --- Request payload — shape unchanged from the frozen contract -------- */

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
      strategy_id: selected?.strategyId ?? "",
      dataset_id: dataset?.dataset_id ?? datasetId,
      symbol,
      timeframe,
      protocol,
      parameter_space: searchSpace,
      calibration,
      account,
      execution,
    };
  }, [account, advanced, dataset, datasetId, earlyStopping, execution, optimization, protocol, searchSpace, seed, selected, symbol, timeframe, trials, windows]);

  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);

  const preflight = useMutation({
    mutationFn: (variables: { body: typeof payload; key: string }) => api.preflight(variables.body),
    onSuccess: (_data, variables) => setValidatedKey(variables.key),
  });
  const createRun = useMutation({
    mutationFn: async () => (await api.createRun(payload)).run_id,
    onSuccess: (runId) => navigate(runPath(runId)),
  });

  const preflightValid = preflight.data?.valid === true && validatedKey === payloadKey;

  const handleRun = () => {
    if (!preflightValid) {
      preflight.mutate(
        { body: payload, key: payloadKey },
        { onSuccess: (response) => { if (response.valid) createRun.mutate(); } },
      );
      return;
    }
    createRun.mutate();
  };

  /* --- Steps ------------------------------------------------------------- */

  const steps: StepDefinition[] = [
    { id: "strategy", label: "Strategy", error: strategyError, complete: !strategyError },
    { id: "data", label: "Dữ liệu", error: dataError, complete: !dataError },
    { id: "windows", label: "Walk-forward", error: windowError, complete: !windowError },
    {
      id: "parameters",
      label: "Tham số",
      error: parameterError,
      complete: !parameterError && Object.keys(searchSpace).length > 0,
    },
    { id: "optimization", label: "Tối ưu", error: trialsError, complete: !trialsError },
    { id: "review", label: "Kiểm tra & chạy", complete: preflightValid },
  ];

  /* --- Loading / error --------------------------------------------------- */

  const bootstrapping = strategies.isLoading || datasets.isLoading || options.isLoading;
  const bootstrapFailed = strategies.isError || datasets.isError || options.isError;

  if (bootstrapping) return <StateView kind="loading" message="Đang tải contract cấu hình…" />;
  if (bootstrapFailed) {
    return (
      <StateView
        kind="failed"
        message="Không tải được contract cấu hình. Portal không dựng form tạm để tránh gửi run sai."
        onRetry={() => {
          void strategies.refetch();
          void datasets.refetch();
          void options.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="New Run"
        description="Cấu hình một backtest walk-forward. Mỗi bước được kiểm tra riêng trước khi gửi preflight."
      />

      <Stepper steps={steps} activeId={step} onSelect={(id) => setStep(id as StepId)} />

      <div className="run-config-grid">
        <div className="min-w-0 space-y-4">
          {step === "strategy" ? (
            <Panel title="Chọn strategy">
              {capabilities.isError ? (
                <Callout tone="warning" title="Capability manifest không đọc được">
                  Không xác nhận được engine release nào đang certify endpoint nào, nên danh sách
                  protocol bên dưới lấy nguyên từ config options thay vì lọc theo capability.
                </Callout>
              ) : null}
              <StrategyPicker
                entries={catalog}
                selectedId={strategyId}
                isLoading={alphas.isLoading}
                isError={strategies.isError}
                onRetry={() => {
                  void strategies.refetch();
                  void alphas.refetch();
                }}
                onSelect={(entry: CatalogEntry) => {
                  setStrategyId(entry.strategyId);
                  setTimeframe(entry.defaultTimeframe ?? "");
                  setStep("data");
                }}
              />
            </Panel>
          ) : null}

          {step === "data" ? (
            <Panel title="Dữ liệu thị trường">
              {/*
                * What the selected strategy declares it needs.
                *
                * Disclosure, not a gate. The timeframe IS gated below because
                * both sides declare it. The column and warmup checks are NOT
                * done here: the dataset descriptor publishes no column list, and
                * comparing against an assumed OHLCV set would be inferring
                * rather than reading. Those checks belong to server preflight —
                * see FRONTEND_HANDOFF §8.3 requests 14 and 15.
                */}
              {selected ? (
                <dl className="strategy-requirements" data-testid="strategy-requirements">
                  <div>
                    <dt className="label">Cột bắt buộc</dt>
                    <dd className="mono">
                      {selected.requiredColumns.length
                        ? selected.requiredColumns.join(", ")
                        : "strategy chưa khai báo"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Timeframe khai báo</dt>
                    <dd className="mono">
                      {selected.timeframes.length
                        ? selected.timeframes.join(", ")
                        : "strategy chưa khai báo"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Warmup bars</dt>
                    <dd className="mono">
                      {selected.warmupBars ?? "strategy chưa khai báo"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Seed</dt>
                    <dd className="mono">
                      {selected.seedRequired === true
                        ? "bắt buộc (determinism.seed_required)"
                        : selected.seedRequired === false
                          ? "không bắt buộc"
                          : "strategy chưa khai báo"}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Kiểm tra ở đâu</dt>
                    <dd>
                      Timeframe và seed được kiểm ngay tại form. Cột bắt buộc và warmup do
                      server kiểm ở preflight, và bước Kiểm tra hiển thị đúng gate nào fail.
                    </dd>
                  </div>
                </dl>
              ) : null}
              <FieldGrid>
                <FieldSpan>
                  <SelectField
                    label="Dataset"
                    value={datasetId}
                    options={(datasets.data ?? []).map((item) => ({
                      value: item.dataset_id,
                      label: `${item.dataset_id} · ${item.availability}`,
                    }))}
                    onChange={setDatasetId}
                    hint="Nguồn historical — chỉ dùng cho backtest/research. Realtime và paper là service riêng."
                  />
                </FieldSpan>
                <TextField
                  label="Symbol"
                  value={symbol}
                  onChange={setSymbol}
                  transform={(value) => value.toUpperCase()}
                  required
                />
                <SelectField
                  label="Timeframe"
                  value={timeframe}
                  options={timeframes}
                  onChange={setTimeframe}
                  hint={selected?.timeframes.length ? `Strategy khai báo: ${selected.timeframes.join(", ")}` : undefined}
                  required
                />
                <FieldSpan>
                  <SelectField
                    label="Protocol"
                    value={protocol}
                    options={availableProtocols.map((item) => ({
                      value: item,
                      label: PROTOCOL_LABELS[item] ?? item,
                    }))}
                    onChange={setProtocol}
                    hint={
                      certified.length
                        ? `Chỉ hiện protocol mà engine release đang cài đã certify (${certified.length}).`
                        : "Capability manifest chưa xác nhận — đang hiện toàn bộ protocol từ config options."
                    }
                  />
                </FieldSpan>
              </FieldGrid>
              {dataError ? <Callout tone="danger">{dataError}</Callout> : null}
            </Panel>
          ) : null}

          {step === "windows" ? (
            <Panel title={protocol === "three_window_decay" ? "Ba cửa sổ" : "Fold walk-forward"}>
              {protocol === "three_window_decay" ? (
                <ThreeWindowEditor windows={windows} onChange={setWindows} />
              ) : (
                <FieldGrid>
                  <DateTimeField
                    label="Analysis start"
                    value={advanced.dataStart}
                    onChange={(value) => setAdvanced({ ...advanced, dataStart: value })}
                  />
                  <DateTimeField
                    label="End exclusive"
                    value={advanced.dataEnd}
                    onChange={(value) => setAdvanced({ ...advanced, dataEnd: value })}
                  />
                  <FieldSpan>
                    <TextField
                      label="Split mode / OOS đầu tiên"
                      value={advanced.splitMode}
                      onChange={(value) => setAdvanced({ ...advanced, splitMode: value })}
                    />
                  </FieldSpan>
                  <SelectField
                    label="Tần suất"
                    value={advanced.splitFrequency}
                    options={options.data?.split_frequencies ?? []}
                    onChange={(value) => setAdvanced({ ...advanced, splitFrequency: value })}
                  />
                  <SelectField
                    label="Window"
                    value={advanced.windowMode}
                    options={options.data?.window_modes ?? []}
                    onChange={(value) => setAdvanced({ ...advanced, windowMode: value })}
                  />
                  {advanced.windowMode === "rolling" ? (
                    <FieldSpan>
                      <TextField
                        label="Train window"
                        value={advanced.trainWindow}
                        onChange={(value) => setAdvanced({ ...advanced, trainWindow: value })}
                      />
                    </FieldSpan>
                  ) : null}
                  <NumberField
                    label="Min train bars"
                    value={advanced.minTrainBars}
                    min={1}
                    step={1}
                    onChange={(value) => setAdvanced({ ...advanced, minTrainBars: value ?? 1 })}
                  />
                  <NumberField
                    label="Min test bars"
                    value={advanced.minTestBars}
                    min={1}
                    step={1}
                    onChange={(value) => setAdvanced({ ...advanced, minTestBars: value ?? 1 })}
                  />
                  <NumberField
                    label="Signal fill value"
                    value={advanced.fillValue}
                    onChange={(value) => setAdvanced({ ...advanced, fillValue: value ?? 0 })}
                  />
                </FieldGrid>
              )}
              {windowError ? <Callout tone="danger">{windowError}</Callout> : null}
            </Panel>
          ) : null}

          {step === "parameters" ? (
            <Panel title="Parameter space">
              <ParameterEditor
                searchSpace={searchSpace}
                declared={declaredSpace}
                validation={validation}
                ceilingError={ceilingError}
                onChange={setSearchSpace}
                onResetAll={() => setSearchSpace(seedSearchSpace(declaredSpace))}
              />
            </Panel>
          ) : null}

          {step === "optimization" ? (
            <>
              <Panel title="Tối ưu">
                <FieldGrid>
                  {protocol === "advanced_walk_forward" ? (
                    <>
                      <SelectField
                        label="Mode"
                        value={advanced.optimizationMode}
                        options={options.data?.optimization_modes ?? []}
                        onChange={(value) => setAdvanced({ ...advanced, optimizationMode: value })}
                      />
                      <SelectField
                        label="Schedule"
                        value={advanced.optimizationSchedule}
                        options={options.data?.optimization_schedules ?? []}
                        onChange={(value) => setAdvanced({ ...advanced, optimizationSchedule: value })}
                      />
                    </>
                  ) : null}
                  <NumberField
                    label="Optuna trials"
                    value={trials}
                    min={1}
                    step={1}
                    max={limits.maxTrials ?? undefined}
                    error={trialsError}
                    hint={limits.maxTrials !== null ? `Trần công bố: ${limits.maxTrials}` : undefined}
                    onChange={(value) => setTrials(value ?? 1)}
                  />
                  <NumberField label="Early stopping" value={earlyStopping} min={1} step={1} onChange={setEarlyStopping} />
                  <NumberField
                    label="Random seed"
                    hint={
                      selected?.seedRequired === true
                        ? "Strategy khai báo seed_required — bắt buộc."
                        : selected?.seedRequired === false
                          ? "Strategy khai báo seed không bắt buộc."
                          : "Strategy chưa khai báo determinism, nên Portal không kết luận seed có bắt buộc."
                    }
                    error={seedError ?? undefined}
                    value={seed}
                    step={1}
                    onChange={setSeed}
                  />
                  <SelectField
                    label="Selection metric"
                    value={String(protocol === "three_window_decay" ? "robust_decay" : optimization.candidate_selection_metric)}
                    options={options.data?.candidate_selection_metrics ?? []}
                    disabled={protocol === "three_window_decay"}
                    disabledReason="Three-Window Decay khoá metric ở robust_decay."
                    onChange={(value) => setOptimization((c) => ({ ...c, candidate_selection_metric: value }))}
                  />
                  <NumberField
                    label="Trading days / năm"
                    value={Number(optimization.scoring_trading_days)}
                    min={1}
                    step={1}
                    hint="Lịch annualization cho Sharpe/Sortino: 365 crypto, 252 equities. Ghi vào config/request.json."
                    onChange={(value) => setOptimization((c) => ({ ...c, scoring_trading_days: value ?? 365 }))}
                  />
                </FieldGrid>
              </Panel>

              <Collapsible title="Plateau & temporal robustness">
                <FieldGrid>
                  {(
                    [
                      ["top_is_fraction", "Top IS fraction"],
                      ["decay_lambda", "Decay lambda"],
                      ["decay_gamma", "Decay gamma"],
                      ["flat_top_fraction", "Flat top fraction"],
                      ["flat_eps", "DBSCAN eps"],
                      ["plateau_quantile", "Plateau quantile"],
                      ["temporal_weight", "Temporal weight"],
                      ["plateau_weight", "Plateau weight"],
                      ["dispersion_penalty", "Dispersion penalty"],
                      ["q25_weight", "Q25 weight"],
                    ] as const
                  ).map(([key, label]) => (
                    <NumberField
                      key={key}
                      label={label}
                      value={Number(optimization[key])}
                      onChange={(value) => setOptimization((c) => ({ ...c, [key]: value ?? 0 }))}
                    />
                  ))}
                </FieldGrid>
                <ToggleField
                  label="Bootstrap penalty"
                  checked={Boolean(optimization.use_bootstrap_penalty)}
                  onChange={(value) => setOptimization((c) => ({ ...c, use_bootstrap_penalty: value }))}
                />
                <ToggleField
                  label="Complexity penalty"
                  checked={Boolean(optimization.use_complexity_penalty)}
                  onChange={(value) => setOptimization((c) => ({ ...c, use_complexity_penalty: value }))}
                />
                <ToggleField
                  label="Numba scoring"
                  checked={Boolean(optimization.use_numba)}
                  onChange={(value) => setOptimization((c) => ({ ...c, use_numba: value }))}
                />
              </Collapsible>

              <Collapsible title="Tài khoản & khớp lệnh">
                <FieldGrid>
                  {(
                    [
                      "initial_capital",
                      "leverage",
                      "maintenance_ratio",
                      "contract_size",
                      "alloc_per_trade",
                      "canonical_one_way_fee_rate",
                      "funding_rate",
                    ] as const
                  ).map((key) => (
                    <NumberField
                      key={key}
                      label={ACCOUNT_LABELS[key] ?? key}
                      value={account[key] as number}
                      min={key === "funding_rate" ? undefined : 0}
                      onChange={(value) => setAccount({ ...account, [key]: value ?? 0 })}
                    />
                  ))}
                  <NumberField
                    label="Slippage"
                    value={execution.slippage}
                    min={0}
                    onChange={(value) => setExecution({ ...execution, slippage: value ?? 0 })}
                  />
                  <SelectField
                    label="Target mode"
                    value={execution.target_mode}
                    options={options.data?.target_modes ?? ["pct_equity"]}
                    onChange={(value) => setExecution({ ...execution, target_mode: value })}
                  />
                </FieldGrid>
                <ToggleField
                  label="Funding enabled"
                  checked={account.funding_enabled}
                  onChange={(value) => setAccount({ ...account, funding_enabled: value })}
                />
                <ToggleField
                  label="Pyramiding"
                  checked={account.use_pyramiding}
                  onChange={(value) => setAccount({ ...account, use_pyramiding: value })}
                />
              </Collapsible>
            </>
          ) : null}

          {step === "review" ? (
            <Panel title="Preflight TermSheet">
              {validatedKey && validatedKey !== payloadKey ? (
                <Callout tone="warning">Cấu hình đã đổi sau lần validate gần nhất — cần validate lại.</Callout>
              ) : null}
              {blockingError ? <Callout tone="danger">{blockingError}</Callout> : null}
              {preflight.isPending ? <StateView kind="loading" message="Đang validate market tape và run contract…" /> : null}
              {preflight.isError ? (
                <StateView
                  kind="failed"
                  message={preflight.error.message}
                  onRetry={() => preflight.mutate({ body: payload, key: payloadKey })}
                />
              ) : null}

              {preflight.data ? (
                <div className="space-y-3">
                  {/* Real gate results, not three fixed "pass" badges. */}
                  <PreflightChecks checks={preflight.data.checks ?? []} />
                  <div className="flex flex-wrap gap-2">
                    {preflight.data.windows.map((window) => (
                      <span key={window.role} className="chip">
                        {window.role} · {fmtCount(window.bars)} bars
                      </span>
                    ))}
                  </div>
                  <DefinitionList
                    rows={[
                      ["Strategy", `${selected?.displayName ?? "—"} · v${selected?.version ?? "—"}`],
                      ["Dataset", preflight.data.dataset_id],
                      ["Symbol / timeframe", `${preflight.data.symbol} · ${preflight.data.timeframe}`],
                      ["Loaded rows", fmtCount(preflight.data.data_quality.rows)],
                      ["Analysis rows", fmtCount(preflight.data.data_quality.analysis?.rows ?? preflight.data.data_quality.rows)],
                      ["Missing bars", `${preflight.data.data_quality.missing_bar_count}`],
                      ["Config hash", preflight.data.config_hash.slice(0, 12)],
                    ]}
                  />
                </div>
              ) : (
                <p className="field-hint">Validate cấu hình hiện tại trước khi gửi run.</p>
              )}

              <div className="mt-4">
                <ParameterSummary searchSpace={searchSpace} validation={validation} />
              </div>

              <Toolbar>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => preflight.mutate({ body: payload, key: payloadKey })}
                  disabled={Boolean(blockingError) || preflight.isPending}
                  title={blockingError ?? undefined}
                >
                  <RefreshCcw size={12} />
                  Validate
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={Boolean(blockingError) || createRun.isPending}
                  title={blockingError ?? undefined}
                  onClick={handleRun}
                >
                  <Play size={13} />
                  {createRun.isPending ? "Đang gửi…" : preflight.isPending ? "Đang validate…" : "Chạy backtest"}
                </button>
                {createRun.isError ? <span className="mono text-[12px] text-bad">{createRun.error.message}</span> : null}
              </Toolbar>
            </Panel>
          ) : null}
        </div>

        <aside className="run-config-aside">
          <Panel title="Strategy đang chọn">
            <StrategyDetail entry={selected} />
          </Panel>

          {protocol === "three_window_decay" ? (
            <WindowTimeline windows={windows} overlapError={windowError} />
          ) : (
            <Panel title="Advanced WFO">
              <DefinitionList
                rows={[
                  ["Analysis tape", `${advanced.dataStart || "dataset start"} → ${advanced.dataEnd || "dataset end"}`],
                  ["Split", `${advanced.splitMode} · ${advanced.splitFrequency}`],
                  ["Window", advanced.windowMode === "rolling" ? `rolling ${advanced.trainWindow}` : "expanding"],
                  ["Optimization", `${advanced.optimizationMode} · ${advanced.optimizationSchedule}`],
                  ["Boundary positions", "carry"],
                ]}
              />
            </Panel>
          )}

          <Collapsible title="Request preview">
            <pre className="request-preview">{JSON.stringify(payload, null, 2)}</pre>
          </Collapsible>
        </aside>
      </div>
    </div>
  );
}
