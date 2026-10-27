/**
 * Hygiene over RENDERED output (QA3 R2-04): no ticket or request id is printed where a reader looks. Alpha 360 (every tab), Trade Replay and
 * Compare are rendered on the preview lane, and the visible text, the accessible names and the tooltips of everything on the page are
 * searched. A gap says "Not available" in words; its request id and reason code live behind a disclosure that is not in the page until opened.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompareScreen from "../compare";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import AlphaScreen from "./index";
import { endPreviewLane, startPreviewLane } from "./previewLane.testbase";
import { sessionOf } from "./testApi";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
vi.mock("../../../components/TradeReplayEvents", () => ({ TradeReplayEvents: () => <div data-testid="v1-replay">V1 replay</div> }));

beforeEach(() => { session.current = sessionOf(V2_ROLE_PRESETS.manager); });
afterEach(() => { cleanup(); endPreviewLane(); });

const TICKET = /\bFE-\d{2,3}\b|BR-EX-|A360-|ELP2-REQ-/;

/** Everything a reader (or a screen reader, or a hover) can get from the page, outside a closed disclosure. */
function readable(): string {
  const attrs = [...document.querySelectorAll("[title],[aria-label],[placeholder],[alt]")].flatMap((el) => ["title", "aria-label", "placeholder", "alt"].map((name) => el.getAttribute(name) ?? ""));
  return [document.body.textContent ?? "", ...attrs].join("\n");
}
const offenders = (): string[] => readable().split("\n").flatMap((line) => (TICKET.test(line) ? [line.slice(Math.max(0, line.search(TICKET) - 50), line.search(TICKET) + 40)] : []));

const ALPHA_TABS = ["performance", "deployments", "evidence", "regime", "orders", "activity", "positions", "reconciliation"] as const;

describe("no ticket id in the rendered Alpha 360, Trade Replay or Compare", () => {
  it.each(ALPHA_TABS)("Alpha 360, tab %s", async (tab) => {
    const lane = startPreviewLane();
    render(
      <MemoryRouter initialEntries={[`/deployments/alphas/alpha_a${tab === "performance" ? "" : `?tab=${tab}`}`]}>
        <AlphaScreen api={lane.api} alphaId="alpha_a" />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(document.querySelector(".exec-alp2-meta")).not.toBeNull());
    // Let the dataset, lifecycle, series and tab reads settle.
    await waitFor(() => expect(document.body.textContent).toMatch(/Lifecycle/), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(offenders()).toEqual([]);
  });

  it("Alpha 360 with the Score drawer open", async () => {
    const lane = startPreviewLane();
    render(
      <MemoryRouter initialEntries={["/deployments/alphas/alpha_a"]}>
        <AlphaScreen api={lane.api} alphaId="alpha_a" />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /QBTS \d|Not scored/ }));
    await screen.findByText("Raw score");
    expect(offenders()).toEqual([]);
  });

  it("Trade Replay", async () => {
    const lane = startPreviewLane();
    render(
      <MemoryRouter initialEntries={["/deployments/alphas/alpha_btc_trend?tab=replay"]}>
        <AlphaScreen api={lane.api} alphaId="alpha_btc_trend" />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Trade Replay" });
    await screen.findByTestId("v1-replay");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(offenders()).toEqual([]);
  });

  it.each(["?in=pf_scale_001,pf_scale_006", "?in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite", "?kind=alpha&in=alpha_scale_001,alpha_scale_006"])("Compare %s", async (query) => {
    const lane = startPreviewLane();
    render(
      <MemoryRouter initialEntries={[`/deployments/compare${query}`]}>
        <CompareScreen api={lane.api} />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Compare" });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(offenders()).toEqual([]);
  });
});
