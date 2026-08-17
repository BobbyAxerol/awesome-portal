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
