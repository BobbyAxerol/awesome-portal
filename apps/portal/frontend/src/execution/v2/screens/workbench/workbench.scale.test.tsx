/**
 * L2 scale (Rules 9.8.3) for the Paper workbench: 200 rows, the dev profile's
 * numbers, 1 MiB and ~7 MiB bodies, and a 5,000-point equity series. The screen
 * draws at most 200 rows per table and says "Showing 200 of N"; the heavy body
 * is read and modelled within a budget and never rendered whole.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readProfileEnvelope } from "../../../api/profileRead";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { MIB, fillToBytes, serializedBytes, timed } from "../../testkit/scale";
import PaperWorkbenchScreen from "./index";
import { PAGE_CAP, buildWorkbench } from "./model";
import { DEP, STRATEGY, envelopeOf, fakeApi, paperWire, qualityOf, qualityWire, sessionOf, type Wire } from "./workbench.harness.fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => cleanup());

function mountWire(wire: Wire, quality = qualityOf()) {
  const served = fakeApi({ profile: { ok: true, value: envelopeOf(wire) }, quality: { ok: true, value: quality } });
  const view = render(
    <MemoryRouter initialEntries={[`/deployments/paper/${DEP}`]}>
      <PaperWorkbenchScreen api={served.api} deploymentId={DEP} />
    </MemoryRouter>,
  );
  return { ...served, view };
}
const ready = () => screen.findByRole("heading", { level: 1, name: new RegExp(STRATEGY) });
const open = async (label: string) => {
  fireEvent.click(within(screen.getByRole("tablist")).getByRole("tab", { name: label }));
  await waitFor(() => expect(within(screen.getByRole("tablist")).getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true"));
};
const bodyRows = (name: string) => within(screen.getByRole("table", { name })).getAllByRole("row").length - 1;

describe("200 rows per table, said out loud", () => {
  it("1,250 orders: the newest 200 are drawn and the label counts the rest", async () => {
    const quality = qualityOf(qualityWire({ data: { ...qualityWire().data, order_population: "1250", fill_population: "640" } }));
    mountWire(paperWire({ orders: 1250, fills: 640, positions: 3 }), quality);
    await ready();
    await open("Orders");
    expect(bodyRows("Orders")).toBe(PAGE_CAP);
    expect(screen.getByTestId("Orders-cap").textContent).toBe("Showing 200 of 1,250 orders");
    // Newest first: the last order made is the first row.
    expect(within(screen.getByRole("table", { name: "Orders" })).getAllByRole("row")[1].textContent).toContain("c-0044-1249");
    await open("Fills");
    expect(bodyRows("Fills")).toBe(PAGE_CAP);
    expect(screen.getByTestId("Fills-cap").textContent).toBe("Showing 200 of 640 fills");
  });

  it("the population the quality read publishes can be larger than what the page carried", async () => {
    const quality = qualityOf(qualityWire({ data: { ...qualityWire().data, order_population: "1247" } }));
    mountWire(paperWire({ orders: 200 }), quality);
    await ready();
    await open("Orders");
    expect(screen.getByTestId("Orders-cap").textContent).toBe("Showing 200 of 1,247 orders");
  });

  it("with no published population a full page says the total is not published", async () => {
    const wire = paperWire({ orders: 200 });
    const served = fakeApi({ profile: { ok: true, value: envelopeOf(wire) }, quality: { ok: false, status: "unavailable", reason: "down" } });
    render(
      <MemoryRouter initialEntries={[`/deployments/paper/${DEP}?tab=orders`]}>
        <PaperWorkbenchScreen api={served.api} deploymentId={DEP} />
      </MemoryRouter>,
    );
    await ready();
    expect(screen.getByTestId("Orders-cap").textContent).toBe("Showing the first 200 orders; the total is not published");
  });

  it("positions at 400 rows draw 200 and say at least 400; the open count is the page's", async () => {
    mountWire(paperWire({ positions: 400 }));
    await ready();
    await open("Positions");
    expect(bodyRows("Positions")).toBe(PAGE_CAP);
    expect(screen.getByTestId("Positions-cap").textContent).toBe("Showing 200 of at least 400 positions");
    await open("Overview");
    expect(screen.getByRole("row", { name: /Open positions/ }).textContent).toContain("400");
  });

  it("DOM stays bounded: well under a thousand table cells on any tab at 1,250 rows", async () => {
    mountWire(paperWire({ orders: 1250, fills: 1250, positions: 1250 }));
    await ready();
    for (const label of ["Orders", "Fills", "Positions"]) {
      await open(label);
      expect(document.querySelectorAll("tbody tr").length, label).toBeLessThanOrEqual(PAGE_CAP);
    }
  });
});

describe("a long equity series", () => {
  it("5,000 snapshots draw under 150 chart nodes and the caption says what was reduced", async () => {
    mountWire(paperWire({ equity: 5000, history: true }));
    await ready();
    const figure = document.querySelector("figure.exec-eq2")!;
    expect(figure.querySelectorAll("svg *").length).toBeLessThan(150);
    expect(figure.textContent).toMatch(/5,000|of 1,438|reduced|kept/);
    // The chart's own caption carries the count; the panel no longer prints a second "N snapshots published".
    expect(document.body.textContent).not.toContain("snapshots published");
  });
});

describe("the heavy profile (dev: ~7.4 MB, ~6 s)", () => {
  it("1 MiB: read, modelled and drawn inside the budget, still 200 rows", async () => {
    const built = fillToBytes((factor) => paperWire({ orders: factor * 40, fills: factor * 30, positions: 60, equity: 200 }), MIB);
    expect(built.bytes).toBeGreaterThanOrEqual(MIB);
    const read = timed(() => readProfileEnvelope(built.value));
    expect(read.value).not.toBeNull();
    const model = timed(() => buildWorkbench(read.value!, qualityOf()));
    expect(read.ms + model.ms).toBeLessThan(3000);
    expect(model.value.orders.rows).toHaveLength(PAGE_CAP);
    const mounted = timed(() => mountWire(built.value));
    await ready();
    expect(mounted.ms).toBeLessThan(5000);
    await open("Orders");
    expect(bodyRows("Orders")).toBe(PAGE_CAP);
  });

  it("~7 MiB: read and modelled inside the budget; the model keeps 200 rows and never the rest", () => {
    const built = fillToBytes((factor) => paperWire({ orders: factor * 40, fills: factor * 30, positions: 60, equity: 200 }), 7 * MIB, 8192);
    expect(serializedBytes(built.value)).toBeGreaterThanOrEqual(7 * MIB);
    const read = timed(() => readProfileEnvelope(built.value));
    expect(read.value).not.toBeNull();
    const model = timed(() => buildWorkbench(read.value!, qualityOf()));
    expect(read.ms).toBeLessThan(5000);
    expect(model.ms).toBeLessThan(5000);
    expect(model.value.orders.rows).toHaveLength(PAGE_CAP);
    expect(model.value.fills.rows).toHaveLength(PAGE_CAP);
    expect(model.value.orders.loaded).toBeGreaterThan(PAGE_CAP * 10);
    expect(model.value.orders.label).toMatch(/^Showing 200 of [\d,]+ orders$/);
    // What the screen holds is the capped window, not the body: the model is a small fraction of the wire.
    const kept = serializedBytes({ orders: model.value.orders.rows, fills: model.value.fills.rows });
    expect(kept).toBeLessThan(serializedBytes(built.value) / 4);
  });

  it("the dev profile's own numbers (1,247 snapshots, 19 orders, 10 fills) are an ordinary page", async () => {
    mountWire(paperWire({ equity: 1247, orders: 19, fills: 10, positions: 1, history: true }));
    await ready();
    expect(screen.getByRole("heading", { name: "Equity vs approved band" })).toBeTruthy();
    await open("Orders");
    expect(screen.getByTestId("Orders-cap").textContent).toBe("19 orders");
  });
});
