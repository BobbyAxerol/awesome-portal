/**
 * New Run flow integration tests.
 *
 * These assert the flow-level claims that unit tests cannot: the picker offers
 * both projections, protocols are capability-gated, an out-of-space parameter
 * blocks submission before preflight, and no strategy id is hard-coded.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalContext } from "../../app/context";
import type { PortalRegistryDocument } from "../../portal/contracts";
import { ConfigWorkspace } from "./ConfigWorkspace";

const REGISTRY = join(process.cwd(), "../registry");
const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(REGISTRY, "fixtures/registry.public.json"), "utf8"),
);
const capabilitySource = JSON.parse(
  readFileSync(join(REGISTRY, "engine-capabilities.v1.json"), "utf8"),
);
const alphaSource = JSON.parse(readFileSync(join(REGISTRY, "alphas.v1.json"), "utf8"));

const BUILTIN = {
  strategy_id: "delta-rsi-polynomial-alpha",
  display_name: "Delta-RSI Polynomial Alpha",
  version: "1.0.0",
  default_timeframe: "1h",
  required_columns: ["open", "high", "low", "close", "volume"],
  structural_contract: {},
  parameter_space: { window: { low: 20, high: 60, step: 2 } },
};

const DATASETS = [
  {
    dataset_id: "crypto-binance-1m",
    symbol: null,
    venue: "binance",
    timeframe: null,
    dynamic_query: true,
    supported_timeframes: ["1h", "4h", "1d"],
    source_class: "historical",
    data_kind: "ohlcv",
    availability: "available",
    unavailable_reason: null,
    usage_scopes: ["backtest"],
    excluded_scopes: [],
    source_timezone: "UTC",
  },
];

const CONFIG_OPTIONS = {
  schema_version: "v1",
  protocols: ["three_window_decay", "advanced_walk_forward", "future_protocol"],
  target_modes: ["pct_equity"],
  optimization_modes: ["mode_1_decay", "none"],
  optimization_schedules: ["global"],
  split_frequencies: ["quarterly"],
  window_modes: ["expanding", "rolling"],
  position_boundary_policies: ["carry"],
  candidate_selection_metrics: ["robust_decay"],
  compatibility: {},
  defaults: { account: {}, execution: {}, optimization: {}, three_window: {}, advanced_walk_forward: {} },
};

function alphaProjection() {
  return {
    schema_version: "alpha-manifest/v1",
    alphas: alphaSource.alphas.map((alpha: Record<string, any>) => ({
      alpha_id: alpha.alpha_id,
      version: alpha.version,
      name: alpha.name,
      owner: { team: alpha.owner.team },
      entrypoint: alpha.entrypoint,
      artifact_digest: alpha.artifact.digest,
      strategy: {
        family: alpha.strategy.family,
        input_kind: alpha.strategy.input_kind,
        supported_endpoint_ids: alpha.strategy.supported_endpoint_ids,
        execution_contracts: alpha.strategy.execution_contracts,
        // The real projection publishes determinism (R15); omitting it here
        // would let the helper drift from the contract it stands in for.
        determinism: alpha.strategy.determinism,
      },
      data_requirements: {
        asset_classes: alpha.data_requirements.asset_classes,
        columns: alpha.data_requirements.columns,
        timeframes: alpha.data_requirements.timeframes,
        warmup_bars: alpha.data_requirements.warmup_bars,
      },
      parameters: { manager_exposed: alpha.parameters.manager_exposed },
      lifecycle: {
        stage: alpha.lifecycle.stage,
        quarantined: alpha.lifecycle.quarantined,
        certification: alpha.lifecycle.certification,
      },
    })),
  };
}

const originalFetch = globalThis.fetch;

interface MountOptions {
  strategies?: unknown;
  alphas?: unknown;
  capabilities?: unknown;
}

function mount({ strategies = [BUILTIN], alphas = alphaProjection(), capabilities = capabilitySource }: MountOptions = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.includes("/api/strategies")) return json(strategies);
    if (url.includes("/api/v1/alphas")) return json(alphas);
    if (url.includes("/api/v1/portal/capabilities")) return json(capabilities);
    if (url.includes("/api/datasets")) return json(DATASETS);
    if (url.includes("/api/config/options")) return json(CONFIG_OPTIONS);
    return json({});
  }) as unknown as typeof fetch;

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PortalContext.Provider value={{ registry, environment: "research" }}>
          <ConfigWorkspace />
        </PortalContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The stepper button for a step label. */
function stepButton(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(label) });
}

/** Clicks a step in the flow stepper. */
function goToStep(label: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("strategy step", () => {
  it("lists the imported alpha from the registry projection", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    expect(screen.getByText(/Imported alpha \(1\)/)).toBeTruthy();
  });

  it("hard-codes no strategy: an empty catalog offers nothing to run", async () => {
    mount({ strategies: [], alphas: { schema_version: "alpha-manifest/v1", alphas: [] } });
    await waitFor(() =>
      expect(screen.getByText(/Registry chưa công bố strategy nào/)).toBeTruthy(),
    );
    expect(screen.queryByText(/delta-rsi/)).toBeNull();
  });

  it("shows an unregistered alpha with its reason and refuses selection", async () => {
    mount({ strategies: [] });
    // waitFor treats a null RETURN as success, so assert inside the callback.
    const row = await waitFor(() => {
      const node = document.querySelector("[data-blocked='true']");
      if (!node) throw new Error("blocked strategy row not rendered yet");
      return node as HTMLButtonElement;
    });
    expect(row.disabled).toBe(true);
    expect(screen.getAllByText(/chưa đăng ký vào runtime registry/).length).toBeGreaterThan(0);
  });

  it("surfaces the artifact digest and entrypoint of the selected alpha", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    expect(screen.getByText(/strategy.delta_rsi:DeltaRsiStrategyAdapter/)).toBeTruthy();
  });
});

describe("capability gating", () => {
  it("offers only protocols the installed release certifies", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Dữ liệu");

    const protocolSelect = await screen.findByLabelText("Protocol");
    const values = within(protocolSelect as HTMLElement)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    // `future_protocol` is published by config options but not certified.
    expect(values).toEqual(["three_window_decay", "advanced_walk_forward"]);
  });

  it("falls back to published protocols and says so when the manifest is unreadable", async () => {
    mount({ capabilities: {} });
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Dữ liệu");
    const protocolSelect = await screen.findByLabelText("Protocol");
    const values = within(protocolSelect as HTMLElement)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).toContain("future_protocol");
    expect(screen.getByText(/Capability manifest chưa xác nhận/)).toBeTruthy();
  });
});

describe("parameter step", () => {
  it("seeds the editor from the strategy's declared space", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Tham số");
    await waitFor(() => expect(screen.getByText("window")).toBeTruthy());
    expect(screen.getByText(/\[20 … 60\] step 2/)).toBeTruthy();
  });

  it("blocks a value outside the declared space, before preflight", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Tham số");

    const high = await waitFor(() => {
      const input = screen.getAllByLabelText("high")[0];
      if (!input) throw new Error("high field not rendered yet");
      return input as HTMLInputElement;
    });
    fireEvent.change(high, { target: { value: "500" } });

    // The message appears both on the field and in the row summary; both are
    // intentional, so assert on presence rather than uniqueness.
    await waitFor(() =>
      expect(screen.getAllByText(/vượt giới hạn strategy công bố/).length).toBeGreaterThan(0),
    );

    goToStep("Kiểm tra & chạy");
    const run = await screen.findByRole("button", { name: /Chạy backtest/ });
    expect(run.hasAttribute("disabled")).toBe(true);
    expect(run.getAttribute("title")).toContain("parameter space");
  });

  it("accepts a narrowed range", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Tham số");
    const low = await waitFor(() => {
      const input = screen.getAllByLabelText("low")[0];
      if (!input) throw new Error("low field not rendered yet");
      return input as HTMLInputElement;
    });
    fireEvent.change(low, { target: { value: "30" } });
    await waitFor(() => expect(screen.queryByText(/nhỏ hơn giới hạn/)).toBeNull());
  });
});

describe("flow state", () => {
  it("marks a step with an error in the stepper", async () => {
    mount({ strategies: [], alphas: { schema_version: "alpha-manifest/v1", alphas: [] } });
    await waitFor(() => expect(screen.getByText(/Registry chưa công bố/)).toBeTruthy());
    const strategyStep = screen.getByRole("button", { name: /Strategy/ });
    expect(strategyStep.getAttribute("data-state")).toBe("error");
  });

  it("refuses to build a form when the config contract cannot be read", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/config/options")) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PortalContext.Provider value={{ registry, environment: "research" }}>
            <ConfigWorkspace />
          </PortalContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Portal không dựng form tạm để tránh gửi run sai/)).toBeTruthy(),
    );
  });
});

describe("declared data requirements", () => {
  it("discloses the strategy's columns, timeframes and warmup", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Dữ liệu");

    const panel = await screen.findByTestId("strategy-requirements");
    expect(panel.textContent).toContain("open, high, low, close, volume");
    expect(panel.textContent).toContain("1h");
    expect(panel.textContent).toContain("300");
  });

  it("says where each check happens instead of implying it gates them all", async () => {
    // The column and warmup checks need the actual frame, which only the server
    // has. Claiming to check them here would be inference, not reading.
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Dữ liệu");
    const panel = await screen.findByTestId("strategy-requirements");
    // Timeframe and seed are gated here; columns and warmup are the server's,
    // and the Review step now names which gate failed.
    expect(panel.textContent).toMatch(/Timeframe và seed được kiểm ngay tại form/);
    expect(panel.textContent).toMatch(/server kiểm ở preflight/);
  });

  it("reports an undeclared requirement rather than a plausible default", async () => {
    // Built-in only, with nothing declared: the imported manifest's columns take
    // precedence when present, so both sources have to be empty to reach this.
    mount({
      strategies: [{ ...BUILTIN, display_name: "Bare builtin", required_columns: [] }],
      alphas: { schema_version: "alpha-manifest/v1", alphas: [] },
    });
    await waitFor(() => expect(screen.getByText("Bare builtin")).toBeTruthy());
    goToStep("Dữ liệu");
    const panel = await screen.findByTestId("strategy-requirements");
    // Not "open, high, low, close, volume" guessed from `data_kind: ohlcv`.
    expect(panel.textContent).toMatch(/chưa khai báo/);
  });
});

describe("preflight gate results (R14)", () => {
  const CHECKS = [
    { id: "strategy", ok: true },
    { id: "dataset", ok: true },
    { id: "timeframe", ok: true },
    { id: "required_columns", ok: false, missing: ["funding_rate", "open_interest"] },
    { id: "parameter_space", ok: false, detail: "window step 2 vượt ceiling" },
  ];

  function mountWithPreflight(body: unknown, status = 200) {
    const previous = globalThis.fetch;
    mount();
    const stub = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/runs/preflight")) {
        return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return stub(input, init);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = previous;
    };
  }

  it("names each failed gate and lists the missing columns", async () => {
    mountWithPreflight({
      valid: false,
      strategy_id: "delta-rsi-polynomial-alpha",
      dataset_id: "crypto-binance-1m",
      symbol: "BTCUSDT",
      timeframe: "1h",
      windows: [],
      data_quality: { rows: 1, content_hash: "h", missing_bar_count: 0 },
      config_hash: "c",
      checks: CHECKS,
    });
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Kiểm tra & chạy");
    fireEvent.click(await screen.findByRole("button", { name: /Chạy backtest/ }));

    const failures = await screen.findByTestId("preflight-failures");
    // The names, not a count: that is what the analyst acts on.
    expect(failures.textContent).toContain("funding_rate, open_interest");
    expect(failures.textContent).toContain("window step 2 vượt ceiling");
    // Passing gates are reported too, so the reader sees what did run.
    expect(within(screen.getByTestId("preflight-checks")).getByText("Dataset")).toBeTruthy();
  });

  it("does not claim a gate passed when preflight reported none", async () => {
    // The old Review step rendered three fixed "pass" badges regardless.
    mountWithPreflight({
      valid: false,
      strategy_id: "s",
      dataset_id: "d",
      symbol: "BTCUSDT",
      timeframe: "1h",
      windows: [],
      data_quality: { rows: 1, content_hash: "h", missing_bar_count: 0 },
      config_hash: "c",
      checks: [],
    });
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Kiểm tra & chạy");
    fireEvent.click(await screen.findByRole("button", { name: /Chạy backtest/ }));

    expect(await screen.findByTestId("preflight-checks-absent")).toBeTruthy();
    expect(screen.queryByText("content hash")).toBeNull();
  });
});

describe("seed gate (R15)", () => {
  it("blocks submission when the manifest declares seed_required and no seed is set", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Delta RSI Polynomial")).toBeTruthy());
    goToStep("Tối ưu");
    const seed = await waitFor(() => {
      const input = screen.getByLabelText(/Random seed/);
      if (!input) throw new Error("seed field not rendered yet");
      return input as HTMLInputElement;
    });
    fireEvent.change(seed, { target: { value: "" } });

    goToStep("Kiểm tra & chạy");
    const run = await screen.findByRole("button", { name: /Chạy backtest/ });
    expect(run.hasAttribute("disabled")).toBe(true);
    expect(run.getAttribute("title")).toMatch(/seed_required/);
  });

  it("says when a strategy declared nothing, rather than implying seed is optional", async () => {
    // Unknown is not permission. A built-in publishes no manifest.
    mount({
      strategies: [{ ...BUILTIN, display_name: "Bare builtin" }],
      alphas: { schema_version: "alpha-manifest/v1", alphas: [] },
    });
    await waitFor(() => expect(screen.getByText("Bare builtin")).toBeTruthy());
    goToStep("Dữ liệu");
    const panel = await screen.findByTestId("strategy-requirements");
    expect(panel.textContent).toMatch(/strategy chưa khai báo/);
  });
});

describe("stepper honesty", () => {
  it("does not tick a step nobody has opened", async () => {
    mount();
    await screen.findByText("Chọn strategy");

    // Validation is trivially satisfied for empty steps, so the old rule ticked
    // all of them on arrival — which reads as "already done".
    expect(stepButton("Walk-forward").dataset.state).toBe("pending");
    expect(stepButton("Tham số").dataset.state).toBe("pending");
    expect(stepButton("Tối ưu").dataset.state).toBe("pending");
    expect(stepButton("Walk-forward").textContent).toContain("chưa mở");
  });

  it("ticks a step once it has been opened and has no error", async () => {
    mount();
    await screen.findByText("Chọn strategy");

    fireEvent.click(stepButton("Walk-forward"));

    expect(stepButton("Walk-forward").dataset.state).toBe("complete");
    expect(stepButton("Walk-forward").textContent).toContain("đã mở, không có lỗi");
    // Opening one step does not tick the ones after it.
    expect(stepButton("Tối ưu").dataset.state).toBe("pending");
  });
});

describe("first-screen hierarchy", () => {
  it("shows the three facts that decide a run, and files the rest behind a disclosure", async () => {
    mount();
    await screen.findByText("Chọn strategy");

    // Tier 1 is open: can this strategy run on my data?
    expect(screen.getByText("Cột bắt buộc")).toBeTruthy();
    expect(screen.getByText("Timeframe")).toBeTruthy();
    expect(screen.getByText("Nguồn")).toBeTruthy();

    // Tier 2 is present but closed — nothing is dropped, it is just not first.
    // (`<details>` keeps its children in the DOM, so the claim is about which
    // side of the disclosure a row sits on, not about existence.)
    const disclosure = screen.getByText(/Contract chi tiết/);
    const summary = disclosure.closest("details");
    expect(summary?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("Entrypoint").closest("details")).toBe(summary);
    expect(screen.getByText("Strategy ID").closest("details")).toBe(summary);
    // …and the tier-1 rows are not behind it.
    expect(screen.getByText("Cột bắt buộc").closest("details")).toBeNull();
  });
});
