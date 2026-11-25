/**
 * D1 (CORE_EDGE_DISPLAY_COVERAGE_MATRIX_20261125): an orders relation the source did NOT deliver is drawn as unavailable, with the
 * server's reason code, never as "No orders on this page". The body starts from the published canonical `execution-full-blotter.partial`
 * and changes only the orders verdict and rows, so the shape under test is the published one.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { readProfileEnvelope } from "../../../api/profileRead";
import type { ExecutionApi } from "../../../api/ports";
import { resetOverviewDouble } from "../../../../../e2e/bffDoubleOverview";
import { loadCanonical } from "../../testkit/loadCanonical";
import { sessionOf } from "../alpha/testApi";
import { ordersNotRead, readBlotter } from "./blotterModel";
import BlotterScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  resetOverviewDouble();
  serveDoubles();
  session.current = sessionOf(["governance.r1.read"]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Body = Record<string, unknown> & { capabilities: Record<string, unknown>[]; data: Record<string, unknown> };
const canonical = () => loadCanonical<Body>("execution-full-blotter.partial");

/** The canonical body with zero orders and the orders source said as `state` with `reason`. */
function notRead(state: string, reason: string | null, capabilityId = "source.orders"): Body {
  const body = canonical();
  body.state = "unavailable";
  body.completeness = "PARTIAL";
  body.capabilities = [{ capability_id: capabilityId, state, relations: ["orders"], reason_code: reason, retryable: state === "UNAVAILABLE", authority: "DERIVED", formula_version: "portal.current-projection.orders-exact-query.v1" }];
  body.data = { ...body.data, orders: [], fills: [], exact_total: null, filtered_total: null };
  return body;
}

// `withReadSignal` is dropped: the screen would otherwise re-scope to a fresh HTTP client and bypass this one.
const apiServing = (body: unknown): ExecutionApi => ({
  ...httpApi(),
  withReadSignal: undefined,
  getBlotterProfile: async () => {
    const profile = readProfileEnvelope(body);
    return profile === null ? { ok: false, status: "unavailable", reason: "UNREADABLE" } : { ok: true, value: profile };
  },
});

const mount = (api: ExecutionApi) => render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={api} /></MemoryRouter>);

describe("ordersNotRead", () => {
  it("is null for the canonical read, which did read its orders", () => {
    expect(ordersNotRead(readProfileEnvelope(canonical())!)).toBeNull();
  });
  it("reads an UNAVAILABLE source.orders capability with its reason", () => {
    expect(ordersNotRead(readProfileEnvelope(notRead("UNAVAILABLE", "N22_SOURCE_UNAVAILABLE"))!)).toEqual({ kind: "unavailable", reason: "N22_SOURCE_UNAVAILABLE" });
  });
  it("reads a DENIED source.orders capability as denied, not as unavailable", () => {
    expect(ordersNotRead(readProfileEnvelope(notRead("DENIED", "ORDERS_OUT_OF_SCOPE"))!)).toEqual({ kind: "denied", reason: "ORDERS_OUT_OF_SCOPE" });
  });
  it("an EMPTY or PARTIAL source.orders capability is a read, not a failure", () => {
    expect(ordersNotRead(readProfileEnvelope(notRead("EMPTY", null))!)).toBeNull();
    expect(ordersNotRead(readProfileEnvelope(notRead("PARTIAL", "SOURCE_PARTIAL"))!)).toBeNull();
  });
  it("another capability's failure is not the orders' failure", () => {
    expect(ordersNotRead(readProfileEnvelope(notRead("UNAVAILABLE", "X", "source.fills"))!)).toBeNull();
  });
  it("the orders PANEL verdict wins over the capability, in both directions", () => {
    const profile = readProfileEnvelope(notRead("UNAVAILABLE", "N22_SOURCE_UNAVAILABLE"))!;
    const panel = (state: string, reason: string | null) => ({ state, reason_code: reason }) as never;
    expect(ordersNotRead({ ...profile, panels: { orders: panel("UNAVAILABLE", "PANEL_CODE") } })).toEqual({ kind: "unavailable", reason: "PANEL_CODE" });
    expect(ordersNotRead({ ...profile, panels: { orders: panel("DENIED", null) } })).toEqual({ kind: "denied", reason: null });
    expect(ordersNotRead({ ...profile, panels: { orders: panel("EMPTY", null) } })).toBeNull();
  });
  it("readBlotter carries it", () => {
    expect(readBlotter(readProfileEnvelope(notRead("UNAVAILABLE", "N22_SOURCE_UNAVAILABLE"))!).ordersNotRead).toEqual({ kind: "unavailable", reason: "N22_SOURCE_UNAVAILABLE" });
  });
});

describe("the screen", () => {
  it("draws an unavailable orders source as unavailable with its code, never as an empty blotter", async () => {
    mount(apiServing(notRead("UNAVAILABLE", "N22_SOURCE_UNAVAILABLE")));
    expect(await screen.findByText("Orders are unavailable")).toBeTruthy();
    expect(screen.getByText(/N22_SOURCE_UNAVAILABLE/)).toBeTruthy();
    expect(screen.getByText("Orders were not read")).toBeTruthy();
    expect(screen.queryByText(/No orders on this page/)).toBeNull();
    expect(screen.queryByText(/No orders in this scope and window/)).toBeNull();
    expect(screen.queryByRole("table", { name: "Orders" })).toBeNull();
  });

  it("draws a denied orders source as outside the access", async () => {
    mount(apiServing(notRead("DENIED", "ORDERS_OUT_OF_SCOPE")));
    expect(await screen.findByText("Orders are outside your access")).toBeTruthy();
    expect(screen.queryByText(/No orders on this page/)).toBeNull();
  });

  it("a read that did deliver zero orders still says so (empty is not unavailable)", async () => {
    const body = notRead("EMPTY", null);
    body.state = "empty";
    mount(apiServing(body));
    expect(await screen.findByText(/No orders in this scope and window/)).toBeTruthy();
    expect(screen.queryByText("Orders are unavailable")).toBeNull();
  });

  it("Try again asks the Portal again", async () => {
    let reads = 0;
    const api: ExecutionApi = {
      ...httpApi(),
      withReadSignal: undefined,
      getBlotterProfile: async () => {
        reads += 1;
        return { ok: true, value: readProfileEnvelope(notRead("UNAVAILABLE", "N22_SOURCE_UNAVAILABLE"))! };
      },
    };
    mount(api);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reads).toBe(2));
    expect(await screen.findByText("Orders are unavailable")).toBeTruthy();
  });
});
