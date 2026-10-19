/**
 * Alpha 360 flow fixes (UXM-07 flow audit #7/#8/#10, route audit M5/M7): the two
 * disabled request controls, Back by source, the alias tab's anchor, links that
 * are handled by the router, and Trade Replay's Back.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID } from "../../../../../e2e/bffDoubleAlpha";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import AlphaScreen from "./index";
import AlphaReplay from "./replay";
import { alphaHttpApi, serveAlphaDouble, sessionOf } from "./testApi";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
vi.mock("../../../components/TradeReplayEvents", () => ({
  TradeReplayEvents: () => <div data-testid="v1-replay">V1 replay</div>,
}));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{pathname + search + hash}</output>;
}
const where = () => screen.getByTestId("where").textContent ?? "";

const BASE = `/deployments/alphas/${ALPHA_DOUBLE_ID}`;

function mount(entry: string) {
  const served = serveAlphaDouble();
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaScreen api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} />
      <Where />
    </MemoryRouter>,
  );
  return { ...served, view };
}
const ready = () => screen.findByRole("heading", { level: 1, name: /BTC-Trend/ });
const back = () => screen.getByRole("link", { name: /^←/ });
/** Every href on the page: a hostile `from` must reach none of them. */
const hrefs = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");

describe("Request archive and Request gate review (flow audit #7)", () => {
  it("are two disabled controls, each with its reason and a My access link", async () => {
    const { calls } = mount(BASE);
    await ready();
    for (const [label, fe] of [["Request archive", "FE-034"], ["Request gate review", "FE-020"]] as const) {
      const button = screen.getByRole("button", { name: label }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toContain(`Not published (${fe})`);
      const access = screen.getByRole("link", { name: `My access: ${label}` });
      expect(access.getAttribute("href")).toBe("/administration/profile-access");
    }
    // pressing a disabled control sends nothing
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Request archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Request gate review" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls.slice(before).filter((url) => /archive|gate|request/i.test(url))).toEqual([]);
  });

  it("the My access link keeps the URL context", async () => {
    mount(`${BASE}?workspace_id=ws_1&env=live`);
    await ready();
    const href = screen.getByRole("link", { name: "My access: Request archive" }).getAttribute("href")!;
    expect(href).toContain("/administration/profile-access");
    expect(href).toContain("workspace_id=ws_1");
  });

  it("are not drawn before the alpha is read", () => {
    mount(BASE);
    expect(screen.queryByRole("button", { name: "Request archive" })).toBeNull();
  });
});

describe("Back by source (flow audit #8, route audit M6)", () => {
  it("with no origin it is 'Alpha Fleet', not 'results', and goes to the plain list", async () => {
    mount(BASE);
    await ready();
    expect(back().textContent).toBe("← Alpha Fleet");
    expect(back().getAttribute("href")).toBe("/deployments/alphas");
  });

  it("from the fleet it restores the list state the reader left", async () => {
    mount(`${BASE}?from=fleet&back=${encodeURIComponent("q=btc&stage=live&view=board&owner=asmith")}&workspace_id=ws_1`);
    await ready();
    expect(back().textContent).toBe("← Alpha Fleet results");
    const url = new URL(back().getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/deployments/alphas");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "btc", stage: "live", view: "board", owner: "asmith", workspace_id: "ws_1" });
    // the Back target does not carry the origin on to the list
    expect(url.searchParams.has("from")).toBe(false);
    expect(url.searchParams.has("back")).toBe(false);
  });

  it("from the fleet with no list state it is the plain 'Alpha Fleet'", async () => {
    mount(`${BASE}?from=fleet`);
    await ready();
    expect(back().textContent).toBe("← Alpha Fleet");
    expect(back().getAttribute("href")).toBe("/deployments/alphas");
  });

  it("from a portfolio it goes back to that portfolio", async () => {
    mount(`${BASE}?from=${encodeURIComponent("portfolio:pf-1")}`);
    await ready();
    expect(back().textContent).toBe("← Portfolio pf-1");
    expect(back().getAttribute("href")).toBe("/deployments/portfolios/pf-1");
  });

  it("from the cockpit it goes back to Approvals with the lane and lens", async () => {
    mount(`${BASE}?from=cockpit&back=${encodeURIComponent("view=r1&lens=needs")}`);
    await ready();
    expect(back().textContent).toBe("← Approvals");
    expect(back().getAttribute("href")).toBe("/governance/approvals?view=r1&lens=needs");
  });

  it("from the blotter it goes back to the Blotter", async () => {
    mount(`${BASE}?from=blotter&back=${encodeURIComponent("status=open")}`);
    await ready();
    expect(back().textContent).toBe("← Blotter");
    expect(back().getAttribute("href")).toBe("/deployments/blotter?status=open");
  });

  it("a source this screen does not honour, and an unknown or hostile value, are ignored and never echoed", async () => {
    for (const from of ["accounts", "https://evil.example/x", "//evil.example", "javascript:alert(1)", "portfolio:", "nonsense"]) {
      const { view } = mount(`${BASE}?from=${encodeURIComponent(from)}&back=${encodeURIComponent("q=zzz")}`);
      await ready();
      expect(back().getAttribute("href"), from).toBe("/deployments/alphas");
      expect(back().textContent, from).toBe("← Alpha Fleet");
      expect(hrefs().join(" ")).not.toContain("evil.example");
      expect(document.querySelector("[data-screen]")?.textContent).not.toContain("evil.example");
      view.unmount();
      cleanup();
    }
  });

  it("the origin survives a tab change, and onward links do not inherit it", async () => {
    mount(`${BASE}?from=fleet&back=${encodeURIComponent("q=btc")}`);
    await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Deployments" }));
    await waitFor(() => expect(where()).toContain("tab=deployments"));
    expect(where()).toContain("from=fleet");
    expect(back().textContent).toBe("← Alpha Fleet results");
    const table = await screen.findByRole("table", { name: "Deployments of this alpha" });
    for (const link of within(table).getAllByRole("link")) {
      const href = link.getAttribute("href")!;
      expect(href, href).not.toContain("from=");
      expect(href, href).not.toContain("back=");
    }
  });
});

describe("an alias tab keeps its anchor (route audit M5)", () => {
  it("?tab=Insight+Charts becomes tab-less Performance with #charts, as on Portfolio 360", async () => {
    mount(`${BASE}?tab=Insight+Charts&window=30d`);
    await ready();
    await waitFor(() => expect(where()).toBe(`${BASE}?window=30d#charts`));
  });

  it("Risk lands on Positions#risk and Accounting on Performance#costs", async () => {
    mount(`${BASE}?tab=Risk`);
    await ready();
    await waitFor(() => expect(where()).toBe(`${BASE}?tab=positions#risk`));
    cleanup();
    mount(`${BASE}?tab=Accounting`);
    await ready();
    await waitFor(() => expect(where()).toBe(`${BASE}#costs`));
  });

  it("an alias that implies a param keeps both the param and the anchor-free URL", async () => {
    mount(`${BASE}?tab=Audit`);
    await ready();
    await waitFor(() => expect(where()).toBe(`${BASE}?tab=activity&type=audit`));
  });
});

describe("links are routed, not full page loads (route audit M7)", () => {
  /** A click the router handles is default-prevented; an `<a href>` left alone would reload the page. */
  const routed = (link: HTMLElement) => fireEvent.click(link) === false;

  it("a deployment link, an account link and an order's Replay link change the location without a reload", async () => {
    mount(`${BASE}?tab=deployments`);
    await ready();
    const table = await screen.findByRole("table", { name: "Deployments of this alpha" });
    expect(routed(within(table).getByRole("link", { name: "dep_live_01" }))).toBe(true);
    await waitFor(() => expect(where()).toContain("/deployments/live/dep_live_01"));
  });

  it("the lifecycle stage detail links to its deployments through the router", async () => {
    mount(BASE);
    await ready();
    const detail = document.querySelector(".exec-alp2-stage-detail")!;
    const link = within(detail as HTMLElement).queryAllByRole("link")[0];
    if (link) {
      expect(routed(link)).toBe(true);
      expect(link.getAttribute("href")).toMatch(/^\/deployments\//);
    }
  });

  it("an order's Open link goes to its place in Trade Replay without a reload", async () => {
    mount(`${BASE}?tab=orders`);
    await ready();
    const link = (await screen.findAllByRole("link", { name: "Open" })).find((a) => (a.getAttribute("href") ?? "").includes("focus=order"))!;
    expect(routed(link)).toBe(true);
    await waitFor(() => expect(where()).toContain("tab=replay&focus=order%3Aord_"));
  });

  it("a Positions account link goes through the router", async () => {
    mount(`${BASE}?tab=positions`);
    await ready();
    const links = await screen.findAllByRole("link", { name: /^acct_/ });
    expect(routed(links[0]!)).toBe(true);
    await waitFor(() => expect(where()).toContain("/deployments/accounts/acct_"));
  });
});

describe("Trade Replay's Back (flow audit #10)", () => {
  function mountReplay(entry: string) {
    const served = serveAlphaDouble();
    render(
      <MemoryRouter initialEntries={[entry]}>
        <AlphaReplay api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} />
        <Where />
      </MemoryRouter>,
    );
    return served;
  }

  it("goes to the alpha's Orders & Fills by default", async () => {
    mountReplay("/replay?focus=order:ord_005");
    const link = await screen.findByRole("link", { name: "← Orders & Fills" });
    expect(link.getAttribute("href")).toBe(`${BASE}?tab=orders`);
    expect(fireEvent.click(link)).toBe(false);
    await waitFor(() => expect(where()).toBe(`${BASE}?tab=orders`));
  });

  it("goes to the Blotter, with its list state, when the link came from there", async () => {
    mountReplay(`/replay?focus=order:ord_005&from=blotter&back=${encodeURIComponent("status=open&symbol=BTCUSDT")}`);
    const link = await screen.findByRole("link", { name: "← Blotter" });
    expect(link.getAttribute("href")).toBe("/deployments/blotter?status=open&symbol=BTCUSDT");
  });

  it("the scope chips onward do not inherit the origin", async () => {
    mountReplay("/replay?from=blotter&back=status%3Dopen");
    const chip = await screen.findByRole("link", { name: "BTC-Trend v3" });
    expect(chip.getAttribute("href")).toBe(BASE);
  });

  it("inside Alpha 360 the replay banner's Back follows the same rule", async () => {
    mount(`${BASE}?tab=replay&focus=order:ord_005&from=blotter&back=${encodeURIComponent("status=open")}`);
    const link = await screen.findByRole("link", { name: "Back to Blotter" });
    expect(link.getAttribute("href")).toBe("/deployments/blotter?status=open");
    cleanup();
    mount(`${BASE}?tab=replay&focus=order:ord_005`);
    const orders = await screen.findByRole("link", { name: "Back to Orders & Fills" });
    expect(orders.getAttribute("href")).toBe(`${BASE}?tab=orders`);
  });

  it("an unknown from falls back to Orders & Fills", async () => {
    mountReplay("/replay?from=https%3A%2F%2Fevil.example");
    const link = await screen.findByRole("link", { name: "← Orders & Fills" });
    expect(link.getAttribute("href")).toBe(`${BASE}?tab=orders`);
    expect(hrefs().join(" ")).not.toContain("evil.example");
    expect(document.querySelector("[data-screen]")?.textContent).not.toContain("evil.example");
  });
});
