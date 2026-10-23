/**
 * FE-CAT-4 / DEBT-UXM07-052 · the Accounts list takes the figures the bindings list publishes (`figures`, `counts`) and reads the
 * per-row carriers ONLY for rows without them. Driven through the real product HTTP client over a stubbed `fetch`; the list body is
 * the published synthetic fixture (`execution-bindings-list.figures.synthetic.valid.json`), never a copy of it.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerAccount } from "../../../../../e2e/bffDoubleAccount";
import { createHttpApi } from "../../../api/httpApi";
import type { ExecutionApi } from "../../../api/ports";
import { SLOW } from "../../waitsTestUtil";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { loadCanonical } from "../../testkit/loadCanonical";
import AccountScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const POLICY = {
  policyRevision: 6, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: false, governanceWriteEnabled: true,
  paperCommandsEnabled: false, sandboxCommandsEnabled: false, liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false,
};

type Body = Record<string, any>;
const FIXTURE_NAME = "execution-bindings-list.figures.synthetic.valid.json";

/** A fresh parse of the published figures fixture, optionally edited by the test. */
const listBody = (edit: (body: Body) => void = () => undefined): Body => {
  const body = loadCanonical<Body>(FIXTURE_NAME);
  edit(body);
  return body;
};

function stubFetch(list: () => Body): { calls: string[]; reads(): string[] } {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    calls.push(`${url.pathname}${url.search}`);
    const answer = url.pathname === "/api/v1/execution/broker-bindings"
      ? { status: 200, body: list() }
      : answerAccount("GET", url.pathname, url.searchParams);
    if (answer === null) return new Response(JSON.stringify({ error: { code: "bff_double_gap", message: url.pathname } }), { status: 501, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }));
  // The two per-row carriers: the account resource and the binding exposure.
  return { calls, reads: () => calls.map((call) => decodeURIComponent(call)).filter((call) => /\/resources\/accounts\/|\/broker-bindings\/[^/?]+\/exposure/.test(call)) };
}

const makeApi = (): ExecutionApi => createHttpApi({ policy: POLICY });
const mount = (entry = "/deployments/accounts?env=paper") =>
  render(<MemoryRouter initialEntries={[entry]}><AccountScreen api={makeApi()} /></MemoryRouter>);

beforeEach(() => {
  session.current = {
    principal: { principalId: "p1", username: "bobby", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId: "u1", isOwner: false, ownerState: "NOT_OWNER", capabilities: [...V2_ROLE_PRESETS.manager] } },
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const table = () => screen.getByRole("table", { name: "Bindings" });
const rowsOf = () => within(table()).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const loaded = async () => screen.findByRole("table", { name: "Bindings" }, SLOW);
const rowFor = (id: string) => rowsOf().find((row) => cell(row, "Binding · Venue").includes(id))!;
const tabs = () => screen.getAllByRole("tab").map((tab) => tab.textContent ?? "");

describe("rows that carry published figures", () => {
  it("shows native equity, the virtual sum, headroom, the check and the sleeves from the list, with no per-row read for them", async () => {
    const stub = stubFetch(() => listBody());
    mount();
    await loaded();
    const full = rowFor("bnc_main@BINANCE");
    expect(cell(full, "Physical equity")).toContain("412,880.25");
    expect(cell(full, "Σ Virtual · Headroom")).toContain("197,500.00");
    expect(cell(full, "Σ Virtual · Headroom")).toContain("Headroom 215,380.25");
    expect(cell(full, "Check")).toContain("Within physical");
    expect(cell(full, "Account")).toContain("3 sleeves");
    // Of the four rows only gate_legacy has no figures: it alone costs the two carrier reads.
    await waitFor(() => expect(stub.reads().length).toBeGreaterThan(0), SLOW);
    expect(new Set(stub.reads().map((call) => call.replace(/\?.*$/, "")))).toEqual(new Set([
      "/api/v1/execution/resources/accounts/gate_legacy", "/api/v1/execution/broker-bindings/gate_legacy@GATE/exposure",
    ]));
  });

  it("keeps an absent native equity a typed absence (never the wallet balance, never 0) and a published zero a zero", async () => {
    stubFetch(() => listBody());
    mount();
    await loaded();
    const row = rowFor("byb_noeq@BYBIT");
    expect(cell(row, "Physical equity")).toContain("Not available");
    expect(cell(row, "Physical equity")).not.toMatch(/\d/);
    expect(cell(row, "Σ Virtual · Headroom")).toContain("1,200.50");
    expect(cell(row, "Check")).toContain("Not available");
    expect(cell(row, "Account")).toContain("0 sleeves"); // a counted zero, published as 0
  });

  it("prints a mixed-currency row as one line per currency, never a sum, and says which coverage is partial", async () => {
    stubFetch(() => listBody());
    mount();
    await loaded();
    const row = rowFor("okx_mixed@OKX");
    const physical = cell(row, "Physical equity");
    expect(physical).toContain("5,000.10");
    expect(physical).toContain("7,000.00");
    expect(physical).not.toContain("12,000.10");
    const virtual = cell(row, "Σ Virtual · Headroom");
    expect(virtual).toContain("2,500.00");
    expect(virtual).toContain("No virtual sum in this currency"); // USDC has equity and no virtual entry
    expect(virtual).toContain("Partial coverage");
    // Each currency is checked on its own: USDT within, USDC not available.
    const check = cell(row, "Check");
    expect(check).toContain("Within physical");
    expect(check).toContain("Not available");
  });

  it("a row without figures keeps the capped two-read fallback and prints its own typed absences", async () => {
    stubFetch(() => listBody());
    mount();
    await loaded();
    const legacy = rowFor("gate_legacy@GATE");
    await waitFor(() => expect(cell(legacy, "Physical equity")).toContain("Account read failed"), SLOW);
    expect(cell(legacy, "Check")).toContain("Not available");
  });

  it("a row whose producer published only some figure keys is read per row, not shown half and half", async () => {
    const stub = stubFetch(() => listBody((body) => {
      delete body.page.rows[0].figures.virtual_headroom; // no owning source for headroom on this producer
    }));
    mount();
    await loaded();
    await waitFor(() => expect(stub.reads().some((call) => call.includes("bnc_main@BINANCE/exposure"))).toBe(true), SLOW);
  });

  it("rejects a malformed figure: the read fails closed and nothing is shown", async () => {
    stubFetch(() => listBody((body) => { body.page.rows[0].figures.native_equity[0].value = "4.1e5"; }));
    mount();
    await waitFor(() => expect(screen.queryByRole("table", { name: "Bindings" })).toBeNull(), SLOW);
  });

  it("the cap counts rows without figures only: 25 published rows are all shown with no footnote", async () => {
    const stub = stubFetch(() => listBody((body) => {
      const template = body.page.rows[0];
      body.page.rows = Array.from({ length: 25 }, (_, index) => ({ ...structuredClone(template), binding_id: `b${index}@BINANCE`, account_id: `a${index}` }));
      body.page.total_count = 25; body.page.filtered_count = 25;
    }));
    mount();
    await loaded();
    expect(rowsOf()).toHaveLength(25);
    expect(cell(rowsOf()[24]!, "Physical equity")).toContain("412,880.25");
    expect(screen.queryByText(/read one row at a time/)).toBeNull();
    expect(stub.reads()).toEqual([]);
  });
});

describe("the tab strip counts", () => {
  it("shows the published count on the other environments and the read's own count on the selected one", async () => {
    stubFetch(() => listBody());
    mount();
    await loaded();
    // paper is selected (4 rows read); live 1 and sandbox 2 are the server's published counts.
    expect(tabs()).toEqual(["Real-funded1", "Paper4", "Sandbox2"]);
  });

  it("prints no number for an environment the server could not count (null), never 0", async () => {
    stubFetch(() => listBody((body) => { body.counts.by_environment.live = null; }));
    mount();
    await loaded();
    expect(tabs()).toEqual(["Real-funded", "Paper4", "Sandbox2"]);
  });

  it("keeps a counted zero as 0", async () => {
    stubFetch(() => listBody((body) => { body.counts.by_environment.sandbox = 0; }));
    mount();
    await loaded();
    expect(tabs()).toEqual(["Real-funded1", "Paper4", "Sandbox0"]);
  });

  it("without published counts the strip is exactly what it was: only the selected tab has a number", async () => {
    stubFetch(() => listBody((body) => { delete body.counts; }));
    mount();
    await loaded();
    expect(tabs()).toEqual(["Real-funded", "Paper4", "Sandbox"]);
    expect(screen.getByRole("button", { name: /^Issues only/ }).getAttribute("title")).not.toContain("across all environments");
  });

  it("shows the published all-environment issue count on the Issues control (a stable total), and the loaded count stays in its label and title", async () => {
    stubFetch(() => listBody());
    mount();
    await loaded();
    const button = screen.getByRole("button", { name: /^Issues only/ });
    expect(button.getAttribute("title")).toContain("3 across all environments");
    // The visible number is the published total; the loaded rows (okx_mixed sync delayed, gate_legacy suspended) are in the label.
    expect(button.querySelector(".exec-acct-tab-count")?.textContent).toBe("3");
    expect(button.getAttribute("aria-label")).toContain("2 in the");
    fireEvent.click(screen.getByRole("tab", { name: /^Sandbox/ }));
  });

  it("rejects malformed counts: the read fails closed instead of printing a number it cannot vouch for", async () => {
    stubFetch(() => listBody((body) => { body.counts.by_environment.live = -1; }));
    mount();
    await waitFor(() => expect(screen.queryByRole("table", { name: "Bindings" })).toBeNull(), SLOW);
  });
});
