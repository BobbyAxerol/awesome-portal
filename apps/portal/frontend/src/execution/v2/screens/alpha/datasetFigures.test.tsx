/**
 * Alpha 360 figures from the Manager dataset (`getManagerDataset({surface: "ALPHA"})`), through the REAL HTTP client and readers over the
 * canonical `lifecycle.live` fixture (an ALPHA surface body is that fixture with its surface and alpha id set, as the fixture BFF serves it).
 * Exact strings, one cell per economic partition, a true zero as a value, and every absence typed with its reason.
 */
import { fromCents, toCents } from "../../../../../e2e/bffWorld";
import { costOverRun } from "../../../../../e2e/bffWorldBooks";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID } from "../../../../../e2e/bffDoubleAlpha";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { fixtureValue, FIXTURE_LIFECYCLE_LIVE, type Draft } from "../../readers/managerDataset.testbase";
import { whyText } from "../../gapWhyTestUtil";
import { answerReviewManager } from "../../../../../../fixture-bff/review-manager";
import AlphaScreen from "./index";
import { alphaHttpApi, serveAlphaDouble, sessionOf, type Override } from "./testApi";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
vi.mock("../../../components/TradeReplayEvents", () => ({ TradeReplayEvents: () => <div data-testid="v1-replay">V1 replay</div> }));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PATH = `/manager/alphas/${ALPHA_DOUBLE_ID}/overview`;

/** The fixture as an ALPHA body of this alpha; `withReturn` adds the 30D return key the fixture does not carry. */
function alphaBody(withReturn: boolean): Draft {
  const body = fixtureValue(FIXTURE_LIFECYCLE_LIVE);
  body.surface = "ALPHA";
  for (const item of body.items) item.alpha_id = ALPHA_DOUBLE_ID;
  if (withReturn) {
    body.query_options.metric_keys = [...body.query_options.metric_keys, "return_30d_pct"];
    body.query_options.sort_fields = [...body.query_options.sort_fields, "return_30d_pct"];
    body.items.forEach((item: Draft, index: number) => {
      const template = item.metrics.net_pnl;
      item.metrics.return_30d_pct = { ...template, value: index === 0 ? "-3.25" : "0", unit: "PERCENT", currency: null, availability: "AVAILABLE", reason_code: null };
    });
  }
  return body;
}

const serving = (answer: ReturnType<Override>): Override => (path) => (path === PATH ? answer : undefined);

function mount(override: Override) {
  serveAlphaDouble(override);
  return render(
    <MemoryRouter initialEntries={[`/deployments/alphas/${ALPHA_DOUBLE_ID}`]}>
      <AlphaScreen api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} />
    </MemoryRouter>,
  );
}
const tile = async (label: string): Promise<HTMLElement> => {
  const facts = await screen.findByLabelText("Current facts");
  return within(facts).getByText(label).closest("div")!;
};

describe("Return tile (return_30d_pct)", () => {
  it("prints the exact published figure per dataset row, a true zero as a value", async () => {
    mount(serving({ status: 200, body: alphaBody(true) }));
    await waitFor(() => expect(document.querySelectorAll("[aria-label='Current facts'] .exec-mgr-num").length).toBe(2));
    const figures = [...(await tile("Return")).querySelectorAll(".exec-mgr-num")];
    expect(figures.map((node) => node.textContent)).toEqual(["-3.25%", "0.00%"]);
    expect(figures.map((node) => (node.getAttribute("title") ?? "").split(" · ")[0])).toEqual(["-3.25", "0"]);
    expect(figures[1]!.getAttribute("data-zero")).toBe("true");
    expect((await tile("Return")).textContent).not.toContain("Not published: return (methodology per source)");
  });

  it("stays Not published: return (methodology per source) when the dataset does not carry the key, and says so", async () => {
    mount(serving({ status: 200, body: alphaBody(false) }));
    await waitFor(() => expect(document.querySelector("[aria-label='Current facts']")).not.toBeNull());
    const tileNode = await tile("Return");
    await waitFor(() => expect(tileNode.textContent).toContain("Not available"));
    expect(tileNode.querySelector('[data-gap="FE-006"]')).not.toBeNull();
    // Two disclosures: the request id (FE-006), then the dataset's own reason.
    expect(whyText([...tileNode.querySelectorAll("button[aria-expanded]")].at(-1) ?? null)).toContain("does not carry return_30d_pct");
  });

  it("stays Not published: return (methodology per source) when the dataset read is refused; Max drawdown has no key at all (FE-025)", async () => {
    mount(serving({ status: 503, body: { error: { code: "EXECUTION_READ_UNAVAILABLE", message: "down" } } }));
    const tileNode = await tile("Return");
    await waitFor(() => expect(tileNode.textContent).toContain("Not available"));
    expect(tileNode.querySelector('[data-gap="FE-006"]')).not.toBeNull();
    expect((await tile("Max drawdown")).querySelector('[data-gap="FE-025"]')).not.toBeNull();
  });
});

describe("Performance: windowed figures", () => {
  it("shows one cell per economic partition (Real-funded, USDT), exact, with Not published for keys the dataset does not carry", async () => {
    mount(serving({ status: 200, body: alphaBody(true) }));
    const table = await screen.findByRole("table", { name: "Windowed figures by portfolio" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
    // net_pnl "0" in an ACTUAL USDT partition: a figure, with the domain and currency beside it.
    expect(cell(rows[0]!, "Net PnL, realized")).toBe("Real-funded · USDT0.00 USDT");
    // allocation is a published key but this partition publishes none: a typed absence, not zero.
    expect(cell(rows[0]!, "Allocation")).toBe("Real-funded · USDTNot available");
    // The missing equity key stays absent; the approved copy names the fact, not an internal ticket.
    expect(cell(rows[0]!, "Equity, 30D end")).toBe("Not published: equity");
    expect(cell(rows[0]!, "Return, 30D")).toBe("-3.25%");
    expect(cell(rows[1]!, "Return, 30D")).toBe("0.00%");
    expect(table.textContent).not.toMatch(/Paper|Sandbox/);
  });

  it("does not print the panel's figures when the read failed: one typed absence with the reason", async () => {
    mount(serving({ status: 503, body: { error: { code: "EXECUTION_READ_UNAVAILABLE", message: "down" } } }));
    const panel = await screen.findByText("Windowed figures");
    const section = panel.closest("section")!;
    await waitFor(() => expect(section.textContent).toContain("Not available"));
    expect(section.querySelector("table")).toBeNull();
  });
});

describe("review lane rows for the suite's alpha (simulated keys through the port)", () => {
  it("prints Core by name, the Max drawdown tile, Cost drag and Forward days from the dataset; the other forward rows stay Not published", async () => {
    mount((path, search) => (path === PATH ? (answerReviewManager("GET", path, search, "populated") as ReturnType<Override>) : undefined));
    const facts = await screen.findByLabelText("Current facts");
    await waitFor(() => expect(facts.textContent).toMatch(/\d%/));
    // Max drawdown: a published negative percent of the same partition, not Not published.
    const drawdown = (await tile("Max drawdown")).querySelector(".exec-mgr-num")!;
    expect(drawdown.textContent).toMatch(/^-\d+(\.\d+)?%$/); // the worst point of the same window's DRAWDOWN series (QA2 R2-04), so its places are the series'
    expect(drawdown.getAttribute("title")).toMatch(/^-\d+(\.\d+)? · /);
    const table = await screen.findByRole("table", { name: "Windowed figures by portfolio" });
    const row = within(table).getAllByRole("row")[1]!;
    // The id pf_core is printed by the name the alpha body states for it.
    expect(row.querySelector("td[data-l='Portfolio']")?.textContent).toBe("Core");
    expect(row.querySelector("td[data-l='Allocation']")?.textContent).toBe("Real-funded · USDT80,000.00 USDT");
    expect(row.querySelector("td[data-l='Net PnL, realized']")?.textContent).toBe("Real-funded · USDT+1,120.80 USDT");
    expect(row.querySelector("td[data-l='Equity, 30D end']")?.textContent).toBe("Real-funded · USDT81,176.20 USDT");
    const cost = screen.getByRole("table", { name: "Cost drag" });
    const cell = (label: string) => [...cost.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === label)!.querySelector("td")!;
    // QA6 R2-06: the world's one fee model (10 bp fees and 4 bp funding of the allocation over a live run under 30 days), the figure the Live room states as paid since activation
    expect(cell("Fees").textContent).toBe(`Real-funded · USDT${fromCents(costOverRun(toCents("80000"), "fees"))} USDT`);
    expect(cell("Funding").textContent).toBe(`Real-funded · USDT${fromCents(costOverRun(toCents("80000"), "funding"))} USDT`);
    expect(cell("Slippage").textContent).toMatch(/USDT|Not available/);
    const forward = screen.getByRole("table", { name: "Forward observation" });
    const days = [...forward.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === "Forward days")!.querySelector("td")!;
    expect(days.textContent).toMatch(/^Real-funded · USDT\d+ days?$/);
    for (const label of ["Actual days", "Mixed return", "Mixed score"]) {
      const td = [...forward.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === label)!.querySelector("td")!;
      expect(td.textContent, label).toContain("Not available");
    }
  });
});
