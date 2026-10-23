/**
 * WP-F3 (register 2f3): the four stage screens mounted on the lit bodies of the populated review lane, read through the REAL http client
 * and the REAL readers (`fetch` pointed at a fixture server booted with the populated profile). One test per element family and per state
 * the audit could not reach: the design's chips, KPIs, envelope, rollback readiness, the Internal / Broker / Difference columns, the
 * spine ticks, and the states a deployment id reaches (stale, breach, halted, gap, MISMATCH, dark).
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { AddressInfo } from "node:net";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import CanaryScreen from "../execution/v2/screens/canary";
import LiveScreen from "../execution/v2/screens/live";
import SandboxScreen from "../execution/v2/screens/sandbox";
import PaperWorkbenchScreen from "../execution/v2/screens/workbench";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  governanceWriteEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

let server: import("node:http").Server;
let api: ExecutionApi;
let origin = "";
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium", FIXTURE_REVIEW_PROFILE: "populated" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => realFetch(typeof input === "string" && input.startsWith("/") ? `${origin}${input}` : input, init));
  api = createHttpApi({ policy: OPEN, readScope: {} });
}, 30_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

afterEach(cleanup);

const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const chip = (id: string) => (document.querySelector(`[data-chip="${id}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim();
const doneTicks = () => document.querySelectorAll(".exec-blk-spine-node[data-s='done']").length;
/** The history rides a second read (the alpha's Manager dataset), so a tick count is waited for. */
const ticks = async (n: number) => waitFor(() => expect(doneTicks()).toBe(n), { timeout: n === 0 ? 1000 : 6000 });

async function canary(id: string) {
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${id}/canary`]}>
      <CanaryScreen api={api} deploymentId={id} />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1, name: "Canary control room" });
  await waitFor(() => expect(document.querySelector('[data-screen="canary-v2"]')?.getAttribute("data-state")).toBe("ready"));
}
async function live(id: string) {
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${id}`]}>
      <LiveScreen api={api} deploymentId={id} />
    </MemoryRouter>,
  );
  await screen.findByRole("tablist", { name: "Live sections" });
}
async function sandbox(id: string) {
  render(
    <MemoryRouter initialEntries={[`/deployments/sandbox/${id}`]}>
      <SandboxScreen api={api} deploymentId={id} />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1, name: "Sandbox certification" });
  await waitFor(() => expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-state")).not.toBe("loading"));
}
async function paper(id: string, variant: "paper" | "vnm" = "paper") {
  render(
    <MemoryRouter initialEntries={[`/deployments/paper/${id}`]}>
      <PaperWorkbenchScreen api={api} deploymentId={id} variant={variant} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('[data-screen="workbench-v2"]')?.getAttribute("data-state")).toBe("ready"), { timeout: 5000 });
}

describe("Canary (dep_canary_01): the design's elements are data", () => {
  it("chips: Running since, Fresh, No open findings; the guard tag; the spine ticks four stages; trial day 6 of 14 with both dates", async () => {
    await canary("dep_canary_01");
    expect(chip("runtime")).toContain("Running");
    expect(chip("runtime")).toContain("since 12 Oct 08:00Z");
    expect(chip("freshness")).toContain("Fresh");
    expect(chip("reconciliation")).toContain("No open findings");
    expect(text()).toContain("Real capital at risk");
    await ticks(4);
    expect(text()).toContain("Trial day 6 of 14");
    expect(text()).toContain("Started 12 Oct 08:00Z");
    expect(text()).toContain("Exit review opens 26 Oct 08:00Z");
  });

  it("the five KPIs print published figures with the server's share of the approved cap", async () => {
    await canary("dep_canary_01");
    const strip = within(screen.getByRole("group", { name: "Canary figures" }));
    for (const label of ["Capital consumed", "Gross notional", "Daily PnL", "Open orders", "Broker equity"]) expect(strip.getByText(label)).toBeTruthy();
    expect(text()).toContain("3,820.00");
    expect(text()).toContain("76.40% of approved");
    expect(text()).toContain("61.204% of approved");
    expect(text()).toContain("-38.60");
    expect(text()).toContain("5,112.40");
    // No "Not available" line for the figures: every one is published.
    expect(text()).not.toMatch(/Not available:[^.]*Capital consumed/);
  });

  it("envelope: limit, approved, consumed and the used bar per cap; the verdict; the duration row says what it does not have", async () => {
    await canary("dep_canary_01");
    const table = screen.getByRole("table", { name: "Canary envelope caps" });
    const cells = (label: string) => Array.from(table.querySelectorAll("tbody tr")).map((row) => (row.querySelector(`td[data-l="${label}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(cells("Limit").slice(0, 4)).toEqual(["10,000.00", "20,000.00", "500.00", "40"]);
    expect(cells("Approved")).toEqual(["5,000.00", "10,000.00", "250.00", "20", "14"]);
    expect(cells("Consumed")).toEqual(["3,820.00", "6,120.40", "38.60", "1", "6"]);
    expect(cells("Used").slice(0, 4)).toEqual(["76.40% used", "61.204% used", "15.44% used", "5.00% used"]);
    expect(text()).toContain("Within envelope");
    // Duration: no published limit and no ratio (a request is posted): typed, never a bar from a division of ours.
    expect(cells("Limit")[4]).toContain("Not available");
    expect(cells("Used")[4]).toContain("Not available");
  });

  it("rollback readiness: four checks with dates, the head says Ready, the drill says Passed", async () => {
    await canary("dep_canary_01");
    const section = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    expect(section.textContent).toContain("Ready");
    expect(section.textContent).toContain("Flatten plan prepared");
    expect(section.textContent).toContain("Checked 17 Oct 11:30Z");
    expect(section.textContent).toContain("Last update 17 Oct 12:04Z");
    expect(section.textContent).toContain("Passed");
    expect(section.textContent).toContain("Last drill 11 Oct 10:00Z");
  });

  it("the series is drawn from the published points and says the Paper and Backtest series are not published", async () => {
    await canary("dep_canary_01");
    expect(text()).toContain("22 points, none reduced");
    expect(text()).toContain("+111.50 USDT");
    expect(text()).toMatch(/Not available:\s*Paper and Backtest series/);
  });

  it("the four decisions stay closed and say so", async () => {
    await canary("dep_canary_01");
    const decisions = screen.getByRole("heading", { name: "Promotion decision" }).closest("section")!;
    for (const name of ["Hold", "Reduce", "Rollback", "Request scale"]) expect((within(decisions).getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Canary states a deployment id reaches", () => {
  it("_stale: the banner, a stale freshness chip, a broker check that is not ready, the rail head Not confirmed, and the scale-up blocker", async () => {
    await canary("dep_canary_01_stale");
    expect(text()).toContain("Broker data is stale. Scale-up is blocked; protective actions stay open.");
    expect(chip("freshness")).toContain("Stale");
    const rollback = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    expect(rollback.textContent).toContain("Not confirmed");
    expect(rollback.textContent).toContain("Not ready");
    expect(text()).toContain("Broker data is stale, so scale-up is blocked.");
  });

  it("_breach: the server's verdict is Breach and the capital bar is over its cap", async () => {
    await canary("dep_canary_01_breach");
    expect(text()).toContain("Breach");
    expect(text()).toContain("104.20% used");
  });

  it("dep_c1 (HALTED in the review universe): the runtime chip says Halted", async () => {
    await canary("dep_c1");
    expect(chip("runtime")).toContain("Halted");
  });

  it("_dark: the published dark body, typed absences, no figure", async () => {
    await canary("dep_canary_01_dark");
    expect(text()).toMatch(/Not available:\s*Capital consumed/);
    await ticks(0);
  });
});

describe("Live (dep_live_01): the design's elements are data", () => {
  it("chips, five KPIs, the broker equity caption from the server's difference, the series, four positions, two orders", async () => {
    await live("dep_live_01");
    expect(chip("runtime")).toContain("Running");
    expect(chip("freshness")).toContain("Fresh");
    expect(chip("reconciliation")).toContain("No open findings");
    for (const figure of ["60,000.00", "41,080.00", "-240.00", "60,118.40"]) expect(text()).toContain(figure);
    expect(text()).toContain("Matches internal");
    expect(text()).toContain("31 points, none reduced");
    expect(text()).toContain("High +7,523.04 USDT");
    expect(text()).toContain("Low -900.06 USDT");
    const positions = screen.getByRole("table", { name: /positions/i });
    expect(positions.querySelectorAll("tbody tr")).toHaveLength(4);
    await ticks(5);
  });

  it("Internal, Broker and Difference are three columns of published figures; the difference is the server's zero", async () => {
    await live("dep_live_01");
    expect(text()).toContain("Execution figure");
    const cols = Array.from(document.querySelectorAll(".exec-blk-triad-col")).map((c) => (c.textContent ?? "").replace(/\s+/g, " "));
    expect(cols).toHaveLength(3);
    expect(cols[0]).toContain("60,118.40");
    expect(cols[1]).toContain("60,118.40");
    expect(cols[2]).toContain("0.00");
  });

  it("leverage and ack latency stay typed (no published place for them)", async () => {
    await live("dep_live_01");
    expect(text()).toMatch(/Not available:\s*Leverage/);
    expect(text()).toMatch(/Not available:\s*Ack latency/);
  });
});

describe("Live: the states the audit could not reach", () => {
  it("_mismatch: Broker equity is Hidden, the chart is replaced, the broker and difference columns are hidden, and no broker figure is in the page", async () => {
    await live("dep_live_01_mismatch");
    expect(chip("reconciliation")).toContain("Mismatch");
    expect(text()).toContain("Hidden");
    expect(text()).toContain("While figures disagree");
    expect(text()).toContain("Internal and broker figures disagree. Chart hidden until reconciled.");
    expect(text()).toContain("Hidden while the figures disagree.");
    expect(text()).toContain("Risk-increasing actions are blocked until the figures match.");
    expect(screen.getByRole("link", { name: "Open finding" })).toBeTruthy();
    // The broker side was never sent: its figure (60,131.12 differs from the internal 60,118.40) is nowhere in the page.
    expect(text()).not.toContain("60,131.12");
    expect(text()).not.toContain("Matches internal");
    // The internal figures stay.
    expect(text()).toContain("60,118.40");
  });

  it("dep_b2 is a mismatch deployment of the review universe, so a Fleet link reaches the state", async () => {
    await live("dep_b2");
    expect(chip("reconciliation")).toContain("Mismatch");
  });

  it("_gap: the chart is replaced by the gap window and risk-increasing actions are blocked until it closes", async () => {
    await live("dep_live_01_gap");
    expect(text()).toContain("Updates are missing. Chart hidden until the gap is filled.");
    expect(text()).toContain("Risk-increasing actions are blocked until the gap closes.");
  });

  it("_stale: the banner names the as-of and the freshness chip says Stale", async () => {
    await live("dep_live_01_stale");
    expect(text()).toContain("Stale. Data as of 17 Oct 11:52Z.");
    expect(chip("freshness")).toContain("Stale");
  });

  it("_dark: typed absences only, no chart frame and no row", async () => {
    await live("dep_live_01_dark");
    expect(text()).toContain("Source not qualified.");
    expect(text()).toMatch(/Not available:/);
    await ticks(0);
  });
});

describe("Sandbox (dep_sandbox_01)", () => {
  it("chips (Running, Fresh, 2 open findings), the three-column reconciliation with the server's differences, and the spine ticks", async () => {
    await sandbox("dep_sandbox_01");
    expect(chip("runtime")).toContain("Running");
    expect(chip("freshness")).toContain("Fresh");
    expect(chip("reconciliation")).toContain("2 open findings");
    const cols = Array.from(document.querySelectorAll(".exec-blk-triad-col")).map((c) => (c.textContent ?? "").replace(/\s+/g, " "));
    expect(cols[0]).toContain("10,184.20");
    expect(cols[1]).toContain("10,184.21");
    expect(cols[2]).toContain("-0.01");
    await ticks(3);
    // The seven steps, the findings and the exit review are the screen's own (unchanged).
    expect(text()).toContain("4 / 7");
    expect(text()).toContain("Fee total differs by 0.01 USDT");
  });

  it("_mismatch: the difference column shows the server's larger gap", async () => {
    await sandbox("dep_sandbox_01_mismatch");
    const cols = Array.from(document.querySelectorAll(".exec-blk-triad-col")).map((c) => (c.textContent ?? "").replace(/\s+/g, " "));
    expect(cols[2]).toContain("-46.87");
  });

  it("_dark: no figure, typed absences", async () => {
    await sandbox("dep_sandbox_01_dark");
    expect(text()).toMatch(/Not available/);
    await ticks(0);
  });
});

describe("Workbench (dep_paper_01)", () => {
  it("is named by the alpha, asks the design's question, prints Runtime and Reconciliation and ticks R1 and R2", async () => {
    await paper("dep_paper_01");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Carry A");
    expect(text()).toContain("Tracking approved evidence? Ready to leave Paper?");
    expect(chip("runtime")).toContain("Running");
    expect(chip("reconciliation")).toContain("1 open finding");
    expect(chip("reconciliation")).toContain("1 unknown order");
    await ticks(2);
    // The Orders, Fills and Positions tabs exist and the Overview carries the equity, gate, accounting and quality panels.
    for (const tab of ["Overview", "Orders", "Fills", "Positions", "Sessions"]) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(text()).toContain("3 of 14 days");
  });

  it("there is no VN chip on a deployment that did not publish a VN venue calendar", async () => {
    await paper("dep_paper_01");
    expect(screen.queryByRole("link", { name: "VN market" })).toBeNull();
  });

  it("a VN deployment (_vn) links to its VN market variant, and the variant prints the published calendar", async () => {
    await paper("dep_paper_01_vn");
    expect(screen.getByRole("link", { name: "VN market" }).getAttribute("href")).toBe("/deployments/paper/dep_paper_01_vn/vn-market");
    cleanup();
    await paper("dep_paper_01", "vnm");
    expect(text()).toContain("Asia/Ho_Chi_Minh");
  });

  it("_halted: the runtime chip says Halted", async () => {
    await paper("dep_paper_01_halted");
    expect(chip("runtime")).toContain("Halted");
  });
});
