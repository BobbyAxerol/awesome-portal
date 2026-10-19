/** S3 W0a · the stage frame blocks: StageHeader, Tabs / UrlTabs, CapGauge, BlockerList, Triad.suppressed. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readMetric, type Metric } from "../boundary";
import { ConnectedContextBar } from "../shell/ContextBar";
import {
  BlockerList,
  CapGauge,
  FE_REQUEST_LABEL,
  REAL_CAPITAL_AT_RISK,
  SectionPanel,
  STAGE_CHIP_LABELS,
  STAGE_GUARD,
  StageHeader,
  TRIAD_SUPPRESSED_COPY,
  Tabs,
  Triad,
  UrlTabs,
  fractionToPercent,
  type StageChips,
  type StageTab,
} from "./index";

afterEach(cleanup);

const DASHES = /[—–]|\bN\/A\b|\bNaN\b/;
const NOT_PUBLISHED_CHIPS: StageChips = {
  runtime: { state: "not-published", id: "FE-067", detail: "Source flag: active" },
  freshness: { state: "not-published", id: "FE-027" },
  reconciliation: { state: "not-published", id: "FE-067" },
};
const header = (over: Partial<Parameters<typeof StageHeader>[0]> = {}) => (
  <StageHeader
    stage="sandbox"
    crumb={[{ label: "Alpha Fleet", to: "/deployments/alphas" }, { label: "OKX-Test-01", to: "/deployments/accounts/a1" }, { label: "Sandbox" }]}
    title="Sandbox certification"
    subtitle="OKX testnet"
    chips={NOT_PUBLISHED_CHIPS}
    {...over}
  />
);

describe("StageHeader · guard frame", () => {
  it.each([
    ["sandbox", "left", false],
    ["canary", "double", true],
    ["live", "double", true],
  ] as const)("%s: %s frame, real-capital sentence %s", (stage, frame, risk) => {
    const { container } = render(header({ stage }));
    const root = container.querySelector("header.exec-stage-guard") as HTMLElement;
    expect(root.getAttribute("data-frame")).toBe(frame);
    expect(root.getAttribute("data-stage")).toBe(stage);
    expect(STAGE_GUARD[stage].frame).toBe(frame);
    expect(root.textContent?.includes(REAL_CAPITAL_AT_RISK)).toBe(risk);
    expect(REAL_CAPITAL_AT_RISK).toBe("Real capital at risk");
  });

  it("names the stage in the tag: Sandbox, Live · Canary, Live", () => {
    for (const [stage, word] of [["sandbox", "Sandbox"], ["canary", "Live · Canary"], ["live", "Live"]] as const) {
      const { container } = render(header({ stage }));
      expect(container.querySelector(".exec-stage-tag > span")?.textContent).toBe(word);
      cleanup();
    }
  });

  it("the title is the h1, the subtitle follows, and the crumb is a labelled list with the last item as the current page", () => {
    render(header());
    expect(screen.getByRole("heading", { level: 1, name: "Sandbox certification" })).toBeTruthy();
    expect(screen.getByText("OKX testnet")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const items = within(nav).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Alpha Fleet", "OKX-Test-01", "Sandbox"]);
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/deployments/alphas", "/deployments/accounts/a1"]);
    expect(items[2].getAttribute("aria-current")).toBe("page");
    expect(items[0].getAttribute("aria-current")).toBeNull();
  });

  it("renders crumb links through renderLink when the screen passes the router's Link", () => {
    const renderLink = vi.fn((to: string, children: unknown) => <span data-to={to}>{children as string}</span>);
    const { container } = render(header({ renderLink }));
    expect(renderLink).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelector('[data-to="/deployments/accounts/a1"]')?.textContent).toBe("OKX-Test-01");
  });

  it("omits the subtitle and the extra slot when absent, and puts extra inside the frame after the spine", () => {
    const bare = render(header({ subtitle: undefined }));
    expect(bare.container.querySelector(".exec-stage-sub")).toBeNull();
    expect(bare.container.querySelector(".exec-stage-extra")).toBeNull();
    cleanup();
    const { container } = render(header({ stage: "canary", extra: <p>Trial day not stated</p> }));
    const root = container.querySelector("header") as HTMLElement;
    const extra = within(root).getByText("Trial day not stated");
    expect(extra.closest(".exec-stage-extra")?.previousElementSibling?.className).toBe("exec-stage-spine");
  });
});

describe("StageHeader · the three chips", () => {
  const chipsOf = (container: HTMLElement) => [...container.querySelectorAll(".exec-stage-chip")] as HTMLElement[];

  it("prints Runtime, Display freshness and Reconciliation, in that order, as a term list", () => {
    const { container } = render(header());
    expect(chipsOf(container).map((c) => c.querySelector("dt")?.textContent)).toEqual(["Runtime", "Display freshness", "Reconciliation"]);
    expect(Object.values(STAGE_CHIP_LABELS)).toEqual(["Runtime", "Display freshness", "Reconciliation"]);
    expect(screen.getByRole("group", { name: "Deployment state" })).toBeTruthy();
  });

  it("a chip the backend has not published says Not published and carries its FE id (no green Running)", () => {
    const { container } = render(header());
    const [runtime, freshness, recon] = chipsOf(container);
    expect(runtime.textContent).toContain("Not published");
    expect(runtime.textContent).toContain("(FE-067)");
    expect(runtime.textContent).toContain("Source flag: active");
    expect(freshness.textContent).toContain("(FE-027)");
    expect(recon.textContent).toContain("(FE-067)");
    expect(container.querySelector(".exec-flag")).toBeNull();
    expect(container.textContent).not.toMatch(/Running|Reconciling/);
    for (const id of ["FE-027", "FE-067"] as const) expect(FE_REQUEST_LABEL[id]).toBeTruthy();
  });

  it("covers every state: loading is busy and says so, not-available names its reason, a flag keeps its word, a dot carries its words", () => {
    const chips: StageChips = {
      runtime: { state: "loading" },
      freshness: { state: "dot", tone: "warn", text: "Stale · 11:40Z", note: "Last event" },
      reconciliation: { state: "flag", kind: "partial", label: "2 open", note: "Findings" },
    };
    const { container } = render(header({ chips }));
    const [runtime, freshness, recon] = chipsOf(container);
    expect(runtime.querySelector("dd")?.getAttribute("aria-busy")).toBe("true");
    expect(runtime.textContent).toContain("Loading");
    expect(freshness.textContent).toContain("Stale · 11:40Z");
    expect(freshness.querySelector(".exec-stage-chipdot")?.getAttribute("aria-hidden")).toBe("true");
    expect(freshness.querySelector(".exec-stage-chipdot")?.getAttribute("data-tone")).toBe("warn");
    expect(recon.querySelector(".exec-flag")?.textContent).toContain("2 open");
    cleanup();
    const na = render(header({ chips: { ...NOT_PUBLISHED_CHIPS, runtime: { state: "not-available", reason: "Runtime source not ready" } } }));
    expect(chipsOf(na.container)[0].textContent).toContain("Not available · Runtime source not ready");
    cleanup();
    const bare = render(header({ chips: { ...NOT_PUBLISHED_CHIPS, runtime: { state: "not-available" } } }));
    expect(chipsOf(bare.container)[0].querySelector("dd")?.textContent).toBe("Not available");
  });

  it("a state this build does not know says Not available, never a value", () => {
    const odd = { ...NOT_PUBLISHED_CHIPS, runtime: { state: "running" } } as unknown as StageChips;
    const { container } = render(header({ chips: odd }));
    expect(chipsOf(container)[0].querySelector("dd")?.textContent).toBe("Not available");
  });

  it("prints no dash, N/A or NaN anywhere in the header", () => {
    const { container } = render(header({ stage: "live" }));
    expect(container.textContent).not.toMatch(DASHES);
  });
});

describe("StageHeader · compact spine slot", () => {
  it("is a compact JourneySpine; with nothing published the lifecycle says Not published (FE-027/028)", () => {
    const { container } = render(header());
    expect(container.querySelector('.exec-blk-spine[data-variant="compact"]')).toBeTruthy();
    expect(container.querySelector(".exec-stage-spine")?.textContent).toContain("(FE-027/028)");
  });

  it("onSelect turns the nodes into buttons and reports the stage id; the current node is marked", () => {
    const onSelect = vi.fn();
    render(header({ stage: "canary", spine: { current: "canary", onSelect } }));
    fireEvent.click(screen.getByRole("button", { name: "Live, Later" }));
    fireEvent.click(screen.getByRole("button", { name: "Canary, Now" }));
    expect(onSelect.mock.calls).toEqual([["live"], ["canary"]]);
    expect(screen.getByRole("button", { name: "Canary, Now" }).closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("a blocked current stage is announced as blocked, and without onSelect the nodes are not buttons", () => {
    render(header({ spine: { current: "sandbox", blocked: true } }));
    expect(screen.getByRole("img", { name: "Sandbox, Blocked" })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("brings the current stage into view on mount, horizontally only; no throw where scrollIntoView does not exist (jsdom)", () => {
    // jsdom: the method is absent, the header still renders.
    expect(typeof HTMLElement.prototype.scrollIntoView).not.toBe("function");
    expect(() => render(header({ stage: "canary", spine: { current: "canary" } }))).not.toThrow();
    cleanup();
    const seen: Array<{ stage: string | null; opts: unknown }> = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) {
      seen.push({ stage: this.getAttribute("data-stage"), opts });
    };
    try {
      render(header({ stage: "live", spine: { current: "live" } }));
      expect(seen).toEqual([{ stage: "live", opts: { inline: "center", block: "nearest", behavior: "auto" } }]);
      cleanup();
      seen.length = 0;
      // No published current stage: nothing is marked current, nothing is scrolled.
      render(header());
      expect(seen).toEqual([]);
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

/* ── Tabs ─────────────────────────────────────────────────────────────── */

const TABS: readonly StageTab[] = [
  { id: "reconciliation", label: "Reconciliation" },
  { id: "steps", label: "Steps", count: 7 },
  { id: "promotion-plans", label: "Promotion plans" },
  { id: "timeline", label: "Timeline" },
];

describe("Tabs · a11y", () => {
  const setup = (value = "reconciliation") => {
    const onChange = vi.fn();
    const view = render(
      <Tabs tabs={TABS} value={value} onChange={onChange} label="Sandbox sections">
        <p>panel body</p>
      </Tabs>,
    );
    return { onChange, ...view };
  };

  it("is a named tablist of tabs with one tabpanel, selection by aria-selected, roving tabindex", () => {
    setup("steps");
    const list = screen.getByRole("tablist", { name: "Sandbox sections" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Reconciliation", "Steps (7)", "Promotion plans", "Timeline"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false"]);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toBe("panel body");
    for (const tab of tabs) expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
  });

  it("names the Steps tab with its count and prints a count only when one is published (never (0) for a missing one)", () => {
    render(<Tabs tabs={[{ id: "a", label: "A", count: 7 }, { id: "b", label: "B", count: null }, { id: "c", label: "C", count: 0 }, { id: "d", label: "D" }]} value="a" onChange={() => undefined} label="x" />);
    expect(screen.getByRole("tab", { name: "A (7)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "B" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "C (0)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "D" })).toBeTruthy();
  });

  it("a click selects", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(onChange).toHaveBeenCalledWith("timeline");
  });

  it.each([
    ["ArrowRight", "reconciliation", "steps"],
    ["ArrowRight", "timeline", "reconciliation"],
    ["ArrowLeft", "steps", "reconciliation"],
    ["ArrowLeft", "reconciliation", "timeline"],
    ["Home", "promotion-plans", "reconciliation"],
    ["End", "steps", "timeline"],
  ])("%s on %s selects %s, and focus follows", (key, from, to) => {
    const { onChange } = setup(from);
    const origin = screen.getAllByRole("tab").find((t) => t.id.endsWith(`-tab-${from}`)) as HTMLElement;
    origin.focus();
    fireEvent.keyDown(origin, { key });
    expect(onChange).toHaveBeenCalledWith(to);
    expect((document.activeElement as HTMLElement).id.endsWith(`-tab-${to}`)).toBe(true);
  });

  it("other keys do nothing and are not swallowed", () => {
    const { onChange } = setup();
    const tab = screen.getAllByRole("tab")[0];
    const notPrevented = fireEvent.keyDown(tab, { key: "Enter" });
    fireEvent.keyDown(tab, { key: "a" });
    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a value that is not a tab shows the first tab, so the bar is never unreachable by keyboard", () => {
    setup("nope");
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("shows the notice as a status line above the panel", () => {
    render(<Tabs tabs={TABS} value="steps" onChange={() => undefined} label="x" notice='Tab "Nope" is not available. Showing reconciliation.' />);
    expect(screen.getByRole("status").textContent).toBe('Tab "Nope" is not available. Showing reconciliation.');
  });
});

describe("UrlTabs · ?tab= through tabAliases", () => {
  function Where() {
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <output data-testid="where">{`${pathname}${search}`}</output>
        <button type="button" onClick={() => navigate(-1)}>back</button>
      </>
    );
  }
  const mount = (url: string, history: string[] = []) =>
    render(
      <MemoryRouter initialEntries={[...history, url]} initialIndex={history.length}>
        <UrlTabs surface="sandbox" tabs={TABS} label="Sandbox sections">
          {(active) => <p data-testid="active">{active}</p>}
        </UrlTabs>
        <Where />
      </MemoryRouter>,
    );
  const where = () => screen.getByTestId("where").textContent;
  const notice = () => document.querySelector(".exec-stage-notice");
  const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent;

  it("opens the default tab on a bare URL and keeps the URL bare", () => {
    mount("/deployments/sandbox/d1");
    expect(screen.getByTestId("active").textContent).toBe("reconciliation");
    expect(where()).toBe("/deployments/sandbox/d1");
    expect(notice()).toBeNull();
  });

  it("choosing a tab writes ?tab= and keeps the other params; choosing the default removes it", () => {
    mount("/deployments/sandbox/d1?workspace_id=w1");
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(where()).toBe("/deployments/sandbox/d1?workspace_id=w1&tab=timeline");
    expect(screen.getByTestId("active").textContent).toBe("timeline");
    fireEvent.click(screen.getByRole("tab", { name: "Reconciliation" }));
    expect(where()).toBe("/deployments/sandbox/d1?workspace_id=w1");
  });

  it("a keyboard move pushes history, so Back returns to the previous tab", () => {
    mount("/x?tab=steps", ["/start"]);
    const steps = screen.getByRole("tab", { name: /Steps/ });
    steps.focus();
    fireEvent.keyDown(steps, { key: "End" });
    expect(where()).toBe("/x?tab=timeline");
    fireEvent.click(screen.getByText("back"));
    expect(where()).toBe("/x?tab=steps");
    expect(screen.getByTestId("active").textContent).toBe("steps");
  });

  it("a V1 label opens the right tab and the URL is rewritten to the slug with replace (Back does not return to the label)", () => {
    mount("/x?tab=Promotion+plans&env=sandbox", ["/start"]);
    expect(screen.getByTestId("active").textContent).toBe("promotion-plans");
    expect(selected()).toBe("Promotion plans");
    expect(where()).toBe("/x?tab=promotion-plans&env=sandbox");
    fireEvent.click(screen.getByText("back"));
    expect(where()).toBe("/start");
  });

  it("a short review2/07 slug resolves too", () => {
    mount("/x?tab=plans");
    expect(screen.getByTestId("active").textContent).toBe("promotion-plans");
    expect(where()).toBe("/x?tab=promotion-plans");
  });

  it("an explicit default is removed from the URL", () => {
    mount("/x?tab=reconciliation&sel=a");
    expect(where()).toBe("/x?sel=a");
  });

  it("an unknown value opens the default tab, says so in one line, and cleans the URL; the line stays until a tab is chosen", () => {
    mount("/x?tab=Heat+Map&sel=a");
    expect(screen.getByTestId("active").textContent).toBe("reconciliation");
    expect(where()).toBe("/x?sel=a");
    expect(notice()?.textContent).toBe('Tab "Heat Map" is not available. Showing reconciliation.');
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(notice()).toBeNull();
  });

  it("coexists with the URL-bound context bar: both canonicalise the same URL once, without a loop or losing a param", () => {
    render(
      <MemoryRouter initialEntries={["/x?tab=plans&window=30D&env=PAPER"]}>
        <ConnectedContextBar windowLock={null} />
        <UrlTabs surface="sandbox" tabs={TABS} label="Sandbox sections">
          {(active) => <p data-testid="active">{active}</p>}
        </UrlTabs>
        <Where />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("active").textContent).toBe("promotion-plans");
    expect(new URLSearchParams(where()?.split("?")[1]).get("tab")).toBe("promotion-plans");
    expect(new URLSearchParams(where()?.split("?")[1]).get("window")).toBe("30d");
    expect(new URLSearchParams(where()?.split("?")[1]).get("env")).toBe("paper");
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    expect(new URLSearchParams(where()?.split("?")[1]).get("tab")).toBe("promotion-plans");
  });

  it("does not rewrite a canonical URL", () => {
    mount("/x?tab=steps");
    expect(where()).toBe("/x?tab=steps");
  });
});

/* ── CapGauge ─────────────────────────────────────────────────────────── */

describe("CapGauge · one printing of a request id per panel", () => {
  it("inside a SectionPanel only the first not-published gauge prints the id; the others read Not published and keep it in the tooltip", () => {
    render(
      <SectionPanel title="Envelope">
        <CapGauge label="Capital" />
        <CapGauge label="Gross" />
        <CapGauge label="Daily loss" fe="FE-072" />
      </SectionPanel>,
    );
    const cells = [...document.querySelectorAll<HTMLElement>(".exec-gauge-wrap")];
    expect(cells.map((c) => c.textContent)).toEqual(["Not published (FE-071) Used", "Not published Used", "Not published (FE-072) Used"]);
    expect(cells[1]!.querySelector(".exec-blk-np")!.getAttribute("title")).toBe(`Not published (FE-071): ${FE_REQUEST_LABEL["FE-071"]}`);
    // The gap is still on every cell as a words-first statement, never a dash or a zero.
    expect(document.body.textContent).not.toMatch(DASHES);
  });

  it("outside a panel every gauge prints its own id", () => {
    render(
      <>
        <CapGauge label="Capital" />
        <CapGauge label="Gross" />
      </>,
    );
    expect([...document.querySelectorAll(".exec-gauge-wrap")].map((c) => c.textContent)).toEqual(["Not published (FE-071) Used", "Not published (FE-071) Used"]);
  });
});

describe("CapGauge · D7: only a server-published ratio draws a bar", () => {
  it("with no ratio it says Not published (FE-071) and draws nothing", () => {
    const { container } = render(<CapGauge label="Capital" />);
    expect(container.textContent).toContain("Not published");
    expect(container.textContent).toContain("(FE-071)");
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector(".exec-gauge")).toBeNull();
  });

  it("carries another request id when asked", () => {
    const { container } = render(<CapGauge label="Gross" fe="FE-072" />);
    expect(container.textContent).toContain("(FE-072)");
  });

  it.each([null, "", "abc", "-0.1", "1e-1", ".5", "01", "0.", "76%", " 0.5"])("%j is unreadable, not a bar and not 0", (ratio) => {
    const { container } = render(<CapGauge label="Capital" ratio={ratio} />);
    expect(container.textContent).toMatch(/Not available · unreadable value/);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.textContent).not.toMatch(/0(\.0+)?% used/);
  });

  it("a number (not a decimal string) is refused", () => {
    const { container } = render(<CapGauge label="Capital" ratio={0.76 as unknown as string} />);
    expect(container.textContent).toContain("unreadable value");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws the bar for a published fraction: named for assistive tech, width = the figure, 80% mark present", () => {
    const { container } = render(<CapGauge label="Capital" ratio="0.7634" />);
    const bar = screen.getByRole("img", { name: "Capital: 76.34% used" });
    expect(bar.getAttribute("data-full")).toBe("0.7634");
    const fill = container.querySelector(".exec-gauge-fill") as HTMLElement;
    expect(fill.style.width).toBe("76.34%");
    expect(fill.getAttribute("data-tone")).toBe("ok");
    expect(container.querySelector(".exec-gauge-mark")?.getAttribute("data-at")).toBe("80");
    expect(container.querySelector(".exec-gauge-text")?.textContent).toBe("76.34% used");
  });

  it.each([
    ["0.79", "ok"],
    ["0.8", "warn"],
    ["0.9499", "warn"],
    ["0.95", "bad"],
    ["1", "bad"],
  ])("ratio %s is tone %s", (ratio, tone) => {
    const { container } = render(<CapGauge label="Capital" ratio={ratio} />);
    expect(container.querySelector(".exec-gauge-fill")?.getAttribute("data-tone")).toBe(tone);
  });

  it("over the cap clamps the bar to its track but keeps the exact figure in the readout", () => {
    const { container } = render(<CapGauge label="Capital" ratio="1.05" />);
    expect((container.querySelector(".exec-gauge-fill") as HTMLElement).style.width).toBe("100%");
    expect(container.querySelector(".exec-gauge-text")?.textContent).toBe("105.00% used");
  });

  it("a published zero is a bar at zero, not a missing value", () => {
    const { container } = render(<CapGauge label="Capital" ratio="0" />);
    expect(screen.getByRole("img", { name: "Capital: 0.00% used" })).toBeTruthy();
    expect((container.querySelector(".exec-gauge-fill") as HTMLElement).style.width).toBe("0%");
  });

  it("showText=false keeps the accessible name and drops the readout", () => {
    const { container } = render(<CapGauge label="Capital" ratio="0.5" showText={false} />);
    expect(container.querySelector(".exec-gauge-text")).toBeNull();
    expect(screen.getByRole("img", { name: "Capital: 50.00% used" })).toBeTruthy();
  });

  it("fractionToPercent moves the decimal point on the string and refuses anything else", () => {
    expect(fractionToPercent("0.76")).toBe("76");
    expect(fractionToPercent("0.7634")).toBe("76.34");
    expect(fractionToPercent("0.5")).toBe("50");
    expect(fractionToPercent("0.005")).toBe("0.5");
    expect(fractionToPercent("1")).toBe("100");
    expect(fractionToPercent("12.3456")).toBe("1234.56");
    expect(fractionToPercent("0")).toBe("0");
    for (const bad of ["", "-1", "1e2", "0x1", ".5", "00.1", "1,5", "NaN"]) expect(fractionToPercent(bad), bad).toBeNull();
  });
});

/* ── BlockerList ──────────────────────────────────────────────────────── */

describe("BlockerList", () => {
  const items = [
    { key: "a", text: "Commands are closed on this build.", code: "COMMANDS_CLOSED" },
    { key: "b", text: "Risk-increasing orders are blocked.", code: "SOURCE_GAP" },
    { key: "c", text: "Canary exit evidence is not available.", code: "SOURCE_GAP" },
  ];

  it("is a titled panel with a list of plain sentences", () => {
    render(<BlockerList items={items} />);
    const panel = screen.getByRole("region", { name: "What is blocking" });
    const list = within(panel).getByRole("list", { name: "What is blocking" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(items.map((i) => i.text));
    expect(panel.querySelectorAll(".exec-blocker-item")).toHaveLength(3);
  });

  it("keeps the reason codes out of the sentences and lists each once under one Provenance disclosure", () => {
    const { container } = render(<BlockerList items={items} provenance={<p>Deployment dep_x</p>} />);
    for (const li of container.querySelectorAll(".exec-blocker-item")) expect(li.textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(1);
    expect(details[0].querySelector("summary")?.textContent).toBe("Provenance");
    expect([...details[0].querySelectorAll(".exec-blocker-codes li")].map((li) => li.textContent)).toEqual(["COMMANDS_CLOSED", "SOURCE_GAP"]);
    expect(details[0].textContent).toContain("Deployment dep_x");
  });

  it("no codes and no provenance means no disclosure at all", () => {
    const { container } = render(<BlockerList items={[{ key: "a", text: "Waits for step 4." }]} />);
    expect(container.querySelector("details")).toBeNull();
  });

  it("an empty list is not 'nothing is blocking': it says Not available unless the caller has the server's word", () => {
    const { container } = render(<BlockerList items={[]} />);
    expect(container.querySelector(".exec-blocker-list")).toBeNull();
    expect(container.querySelector(".exec-blocker-empty")?.textContent).toBe("Not available");
    cleanup();
    const said = render(<BlockerList items={[]} emptyText="Nothing is blocking." />);
    expect(said.container.querySelector(".exec-blocker-empty")?.textContent).toBe("Nothing is blocking.");
  });

  it("title and bare frame: no panel, the list keeps a name", () => {
    const { container } = render(<BlockerList items={items} frame="bare" label="Exit blockers" />);
    expect(container.querySelector(".exec-blk-panel")).toBeNull();
    expect(screen.getByRole("list", { name: "Exit blockers" })).toBeTruthy();
    cleanup();
    render(<BlockerList items={items} title="Before scale-up" />);
    expect(screen.getByRole("region", { name: "Before scale-up" })).toBeTruthy();
  });

  it("prints no dash or N/A", () => {
    const { container } = render(<BlockerList items={items} />);
    expect(container.textContent).not.toMatch(DASHES);
  });
});

/* ── Triad.suppressed ─────────────────────────────────────────────────── */

describe("Triad suppressed (Live mismatch)", () => {
  const BROKER_FIGURE = "10184.21";
  const m = (value: string): Metric => {
    const read = readMetric({ state: "AVAILABLE", value }, { unit: "money" });
    if (read === null) throw new Error("unreadable fixture");
    return read;
  };
  const rows = [
    { key: "equity", label: "Equity", suffix: "USDT", internal: m("10184.20"), broker: m(BROKER_FIGURE), difference: m("-0.01") },
    { key: "fees", label: "Fees paid", internal: m("12.34"), broker: m("12.35"), difference: m("-0.01") },
  ];

  it("withholds Broker and Difference: the sentence, no rows, no figures, no as-of in the DOM", () => {
    const { container } = render(<Triad rows={rows} suppressed internal={{ asOf: null }} broker={{ asOf: null }} />);
    const [internal, broker, diff] = screen.getAllByRole("region");
    expect(within(internal).getByText("10,184.20")).toBeTruthy();
    for (const col of [broker, diff]) {
      expect(col.getAttribute("data-state")).toBe("suppressed");
      expect(col.textContent).toContain("Hidden while the figures disagree.");
      expect(col.querySelector("dl")).toBeNull();
      expect(col.querySelector(".exec-blk-num")).toBeNull();
    }
    expect(container.textContent).not.toContain("10,184.21");
    expect(container.textContent).not.toContain(BROKER_FIGURE);
    expect(container.textContent).not.toContain("12.35");
    expect(container.textContent).not.toContain("0.01");
    expect(TRIAD_SUPPRESSED_COPY).toBe("Hidden while the figures disagree");
  });

  it("is a different claim from Not available (a side that reported nothing)", () => {
    const { container } = render(<Triad rows={rows} suppressed />);
    const [, broker, diff] = screen.getAllByRole("region");
    expect(broker.textContent).not.toContain("Not available");
    expect(diff.textContent).not.toContain("Not available");
    expect(container.querySelectorAll('[data-state="suppressed"]')).toHaveLength(4);
    cleanup();
    const missing = render(<Triad rows={rows} broker={null} />);
    expect(missing.container.textContent).toContain("Not available");
    expect(missing.container.textContent).not.toContain("Hidden while");
  });

  it("the Broker sub-line does not claim an as-of while hidden, and the Difference keeps its note", () => {
    render(<Triad rows={rows} suppressed />);
    const [, broker, diff] = screen.getAllByRole("region");
    expect(broker.querySelector(".exec-blk-triad-sub")?.textContent).toBe("Venue report");
    expect(diff.querySelector(".exec-blk-triad-sub")?.textContent).toBe("Derived · matching scopes only");
  });

  it("without the flag the triad is unchanged: all three columns draw their rows", () => {
    const { container } = render(<Triad rows={rows} />);
    expect(container.querySelectorAll("dl")).toHaveLength(3);
    expect(container.querySelector('[data-state="suppressed"]')).toBeNull();
    expect(container.textContent).toContain("10,184.21");
    cleanup();
    const off = render(<Triad rows={rows} suppressed={false} />);
    expect(off.container.querySelectorAll("dl")).toHaveLength(3);
  });
});

/* ── hygiene of the new sources ───────────────────────────────────────── */

describe("hygiene of the stage block sources and stylesheet", () => {
  const read = (name: string) => readFileSync(join(__dirname, name), "utf8");
  const sources = ["StageHeader.tsx", "Tabs.tsx", "CapGauge.tsx", "BlockerList.tsx"];

  it.each(sources)("%s: no raw colour, inline colour, font-family or font-size", (file) => {
    const text = read(file);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|color-mix\(/);
    expect(text).not.toMatch(/style=\{\{[^}]*(color|background|font)/);
    expect(text).not.toMatch(/font-family|fontFamily|font-size|fontSize/);
  });

  it("the stylesheet uses the .exec-stage-* / .exec-gauge-* / .exec-blocker-* prefixes only", () => {
    const css = readFileSync(join(__dirname, "..", "css", "stage.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const classes = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((match) => match[1]))];
    expect(classes.length).toBeGreaterThan(20);
    expect(classes.filter((name) => !/^exec-(stage-|gauge(-|$)|blocker-)/.test(name) && name !== "exec-blk-kpi-label")).toEqual([]);
  });

  it("a disabled button is never drawn by these blocks", () => {
    for (const file of sources) expect(read(file)).not.toMatch(/<button[^>]*(?<![-\w])disabled\b/);
  });
});
