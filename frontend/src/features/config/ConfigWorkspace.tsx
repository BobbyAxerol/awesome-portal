/** Run configuration workspace (plan §13.1, §27.4 blueprint).
 *  Desktop: config rail 360px | timeline preview + preflight TermSheet. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../lib/api";
import { fmtCount } from "../../lib/format";
import { Badge, Collapsible, DefinitionList, SegmentedControl, StateView } from "../../components/ui";
import { ThreeWindowEditor } from "./ThreeWindowEditor";
import { WindowTimeline } from "./WindowTimeline";

const DATASET_ID = "crypto-binance-1m";

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

export function ConfigWorkspace() {
  const navigate = useNavigate();
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const strategy = strategies.data?.[0];
  const dataset = datasets.data?.find((item) => item.dataset_id === DATASET_ID) ?? datasets.data?.[0];

  const [protocol, setProtocol] = useState<"three_window_decay" | "advanced_walk_forward">(
    "three_window_decay",
  );
  const [windows, setWindows] = useState<WindowState>(DEFAULT_WINDOWS);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [trials, setTrials] = useState(200);
  const [params] = useState<Record<string, { low: number; high: number; step: number }>>({});

  const searchSpace = useMemo(() => {
    if (params && Object.keys(params).length > 0) return params;
    return (strategy?.parameter_space ?? {}) as Record<string, { low: number; high: number; step: number }>;
  }, [params, strategy]);

  const payload = useMemo(() => {
    const toSpec = (value: { low: number; high: number; step: number }) => ({
      kind: Number.isInteger(value.low) && Number.isInteger(value.high) ? "int_range" : "float_range",
      low: value.low,
      high: value.high,
      step: value.step,
    });
    const calibration =
      protocol === "three_window_decay"
        ? {
            is_start: windows.isStart,
            is_end_exclusive: windows.isEnd,
            oos_start: windows.oosStart,
            oos_end_exclusive: windows.oosEnd,
            holdout_start: windows.holdoutStart,
            holdout_end_exclusive: windows.holdoutEnd || null,
            optuna_trials: trials,
            optuna_early_stopping: Math.max(50, Math.round(trials / 2)),
            random_seed: 42,
            optimization: {},
          }
        : {
            split_mode: windows.oosStart,
            split_frequency: "quarterly",
            window_mode: "expanding",
            optimization_mode: "mode_1_decay",
            optimization_schedule: "global",
            fold_boundary_position_policy: "carry",
            optuna_trials: trials,
            optuna_early_stopping: Math.max(50, Math.round(trials / 2)),
            random_seed: 42,
            optimization: {},
          };
    return {
      strategy_id: strategy?.strategy_id ?? "delta-rsi-polynomial-alpha",
      dataset_id: dataset?.dataset_id ?? DATASET_ID,
      symbol,
      timeframe,
      protocol,
      parameter_space: Object.fromEntries(
        Object.entries(searchSpace).map(([key, value]) => [key, toSpec(value)]),
      ),
      calibration,
      account: {},
      execution: {},
    };
  }, [protocol, windows, symbol, timeframe, trials, searchSpace, strategy, dataset]);

  const preflight = useMutation({ mutationFn: () => api.preflight(payload) });
  const createRun = useMutation({
    mutationFn: async () => {
      const created = await api.createRun(payload);
      return created.run_id;
    },
    onSuccess: (runId) => navigate(`/?run=${runId}`),
  });

  const overlapError = useMemo(() => {
    const rows = [
      ["IS", windows.isStart, windows.isEnd],
      ["OOS", windows.oosStart, windows.oosEnd],
      ["Holdout", windows.holdoutStart, windows.holdoutEnd || undefined],
    ] as const;
    for (let i = 1; i < rows.length; i += 1) {
      const prevEnd = rows[i - 1][2] as string | undefined;
      const currentStart = rows[i][1] as string | undefined;
      if (currentStart && prevEnd && currentStart < prevEnd) {
        return `${rows[i][0]} starts before ${rows[i - 1][0]} ends`;
      }
      if (currentStart && currentStart !== prevEnd) {
        return `${rows[i][0]} must start exactly where ${rows[i - 1][0]} ends`;
      }
    }
    return null;
  }, [windows]);

  const preflightValid = preflight.data?.valid === true;
  const runnable = !overlapError && preflightValid && !createRun.isPending;

  if (strategies.isLoading || datasets.isLoading) {
    return <StateView kind="loading" />;
  }
  if (strategies.isError || datasets.isError) {
    return <StateView kind="failed" message="Không tải được cấu hình nền tảng" onRetry={() => void (strategies.refetch(), datasets.refetch())} />;
  }

  return (
    <div className="grid grid-cols-[360px_1fr] gap-6">
      <aside className="space-y-3 self-start">
        <h1 className="section-title">Run Configuration</h1>
        <p className="dek">Cấu hình protocol, dữ liệu, search space và account.</p>

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

        <div>
          <div className="label mb-1.5">Dataset · symbol · timeframe</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input col-span-2" value={dataset?.dataset_id ?? DATASET_ID} readOnly aria-label="Dataset" />
            <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol" />
            <select className="input" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} aria-label="Timeframe">
              {["1h", "4h", "1d"].map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>
        </div>

        {protocol === "three_window_decay" ? (
          <ThreeWindowEditor windows={windows} onChange={setWindows} />
        ) : (
          <div className="card p-3">
            <div className="label mb-2">Advanced WFO — split config</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="label">First OOS start</label>
              <input
                className="input"
                type="datetime-local"
                value={windows.oosStart.slice(0, 16)}
                onChange={(e) =>
                  setWindows({ ...windows, oosStart: new Date(e.target.value).toISOString() })
                }
              />
            </div>
            <p className="mt-2 text-[12px] leading-5 text-ink-faint">
              Fold preview xuất hiện sau preflight; các nhóm Split/Optimization/Selection/Account sẽ mở rộng đầy đủ ở đây.
            </p>
          </div>
        )}

        <Collapsible title="Search space" defaultOpen>
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(searchSpace).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_110px_110px_60px] items-center gap-1">
                <span className="mono text-[11px] text-ink-soft">{key}</span>
                <input className="input" aria-label={`${key} low`} value={value.low} onChange={() => undefined} readOnly />
                <input className="input" aria-label={`${key} high`} value={value.high} onChange={() => undefined} readOnly />
                <input className="input" aria-label={`${key} step`} value={value.step} onChange={() => undefined} readOnly />
              </div>
            ))}
            <p className="text-[11px] leading-4 text-ink-faint">
              Khung tìm kiếm cố định theo structural contract của strategy; chỉnh chi tiết nằm trong phiên bản kế tiếp.
            </p>
          </div>
        </Collapsible>

        <Collapsible title="Optimization">
          <DefinitionList
            rows={[
              ["Optuna trials", `${trials}`],
              ["Selection metric", "robust_decay"],
              ["Seed", "42"],
            ]}
          />
          <label className="label mt-2">Trials</label>
          <input className="input mt-1 w-full" type="number" min={10} max={2000} value={trials} onChange={(e) => setTrials(Number(e.target.value))} />
        </Collapsible>

        <Collapsible title="Account & execution">
          <DefinitionList
            rows={[
              ["Initial capital", "$20,000"],
              ["Leverage", "1x"],
              ["Fee (one-way)", "0.05%"],
              ["Slippage", "0.01%"],
              ["Funding", "enabled @ 0.01%"],
              ["Alloc / trade", "50%"],
            ]}
          />
        </Collapsible>
      </aside>

      <section className="min-w-0 space-y-4">
        <WindowTimeline windows={windows} overlapError={overlapError} />

        <div className="card p-4">
          <div className="label mb-3">Preflight — TermSheet</div>
          {preflight.isPending ? <StateView kind="loading" message="Đang kiểm tra dữ liệu…" /> : null}
          {preflight.isError ? (
            <StateView kind="failed" message={preflight.error.message} onRetry={() => preflight.mutate()} />
          ) : null}
          {overlapError ? (
            <div className="mb-3 rounded-md border border-bad/40 bg-bad-bg p-3">
              <span className="mono text-[12px] font-semibold text-bad">{overlapError}</span>
            </div>
          ) : null}
          {preflight.data ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="pass">schema</Badge>
                <Badge tone="pass">boundaries</Badge>
                <Badge tone="pass">content hash</Badge>
                {preflight.data.windows.map((window) => (
                  <span key={window.role} className="chip">
                    {window.role} · {fmtCount(window.bars)} bars
                  </span>
                ))}
              </div>
              <DefinitionList
                rows={[
                  ["Dataset", `${preflight.data.dataset_id}`],
                  ["Symbol / timeframe", `${preflight.data.symbol} · ${preflight.data.timeframe}`],
                  ["Rows", fmtCount(preflight.data.data_quality.rows)],
                  ["Missing bars", `${preflight.data.data_quality.missing_bar_count}`],
                  ["Config hash", preflight.data.config_hash.slice(0, 12)],
                ]}
              />
            </div>
          ) : null}
          {!preflight.data && !preflight.isPending && !preflight.isError ? (
            <p className="text-[12px] text-ink-faint">Nhấn “Kiểm tra cấu hình” để chạy preflight trước khi Run.</p>
          ) : null}
          <div className="mt-4 flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => preflight.mutate()} disabled={Boolean(overlapError) || preflight.isPending}>
              <RefreshCcw size={12} />
              Kiểm tra cấu hình
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!runnable || preflight.isPending}
              onClick={() => {
                if (!preflight.data) {
                  preflight.mutate();
                  return;
                }
                createRun.mutate();
              }}
            >
              <Play size={13} />
              {createRun.isPending ? "Submitting…" : "Run"}
              <kbd className="rounded border border-white/30 px-1 text-[10px]">⌘⏎</kbd>
            </button>
            {createRun.isError ? <span className="mono text-[12px] text-bad">{createRun.error.message}</span> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
