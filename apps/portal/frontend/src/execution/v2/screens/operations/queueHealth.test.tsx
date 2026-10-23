/**
 * Operations queue V2: health counts (pending receipts, display catching up, open exceptions) and the per-row delivery and display
 * axes (FE-CAT-2), driven by bodies built from the published fixture `execution-operational-queue-health.synthetic.valid.json`
 * (loaded fresh per test, never written) and read through the real V2 reader.
 *
 * Held to: the server's integers are printed as they are (a counted 0 is 0, a floor says so); a null count and an omitted key are
 * "Not published", never 0; the numbers are the server's over the whole filtered set, so they do not move with the loaded rows;
 * a row axis that is omitted or null is a typed gap and never a derived word; malformed health voids the read.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { readOperationalQueueV2, type OperationalQueueReadV2 } from "../../readers/operationalQueue";
import { loadCanonical } from "../../testkit/loadCanonical";
import OperationsV2 from "./index";

afterEach(() => cleanup());

type Body = Record<string, any>;
const NOW = new Date("2026-08-22T13:00:00Z");
const queueBody = (edit: (queue: Body) => void = () => undefined): Body => {
  const queue = loadCanonical<{ queue: Body }>("execution-operational-queue-health.synthetic").queue;
  edit(queue);
  return queue;
};
const read = (body: Body): Result<OperationalQueueReadV2> => {
  const value = readOperationalQueueV2(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
};
function mount(body: Body) {
  const api = { listOperationalQueueV2: vi.fn(async () => read(body)), getIncidentRootV2: vi.fn() } as unknown as ExecutionApi;
  render(<MemoryRouter initialEntries={["/execution/operations?workspace_id=ws_1&env=paper"]}><OperationsV2 api={api} now={NOW} /></MemoryRouter>);
}
const table = () => screen.findByRole("table", { name: "Commands" });
const health = () => screen.getByRole("group", { name: "Operations health" });
const kpi = (label: string) => within(health()).getByText(label).closest(".exec-blk-kpi") as HTMLElement;
const dataRows = () => within(screen.getByRole("table", { name: "Commands" })).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";

describe("the health strip", () => {
  it("prints the server's counts: a number, a counted zero, and a null as Not published", async () => {
    mount(queueBody());
    await table();
    expect(kpi("Pending receipts").textContent).toContain("1");
    expect(kpi("Pending receipts").textContent).toContain("Awaiting a receipt");
    // A counted zero is a zero, with no floor wording because every row reported.
    expect(kpi("Display catching up").textContent).toContain("0");
    expect(kpi("Display catching up").textContent).not.toContain("at least");
    // The owning source did not report exceptions: a typed gap with its request id, never 0.
    expect(kpi("Open exceptions").textContent).toContain("Not published");
    expect(kpi("Open exceptions").textContent).not.toMatch(/\b0\b/);
  });

  it("says a PARTIAL count is a floor", async () => {
    mount(queueBody((q) => { q.page.health.pending_receipt_count.coverage = "PARTIAL"; }));
    await table();
    expect(kpi("Pending receipts").textContent).toContain("at least: some rows did not report");
  });

  it("an omitted key keeps today's gap, and an absent health keeps all of them (never 0)", async () => {
    mount(queueBody((q) => { delete q.page.health; }));
    await table();
    for (const label of ["Pending receipts", "Open exceptions"]) {
      expect(kpi(label).textContent).toContain("Not published");
      expect(kpi(label).textContent).not.toMatch(/\b0\b/);
    }
    expect(kpi("Display catching up").textContent).toContain("The queue read publishes no projection display state.");
  });

  it("does not recount from the loaded rows: the number stays the server's when the page holds fewer rows", async () => {
    mount(queueBody((q) => {
      q.page.rows = q.page.rows.filter((r: Body) => r.delivery_state !== "AWAITING_RECEIPT");
      q.page.health.pending_receipt_count.count = 40;
      q.page.filtered_count = 50;
      q.page.total_count = 60;
    }));
    await table();
    expect(kpi("Pending receipts").textContent).toContain("40");
  });

  it("a malformed health block voids the read instead of printing a number", async () => {
    for (const edit of [
      (q: Body) => { q.page.health.pending_receipt_count.count = q.page.filtered_count + 1; },
      (q: Body) => { q.page.health.pending_receipt_count.count = 0; }, // a row on the page awaits a receipt
      (q: Body) => { q.page.health.open_exception_count = { count: null, observed_at: null, coverage: "COMPLETE" }; },
      (q: Body) => { q.page.health.display_lag_count.count = "0"; },
      (q: Body) => { q.page.health.basis = "LOADED_ROWS"; },
      (q: Body) => { q.page.health.total_pending = 1; },
    ]) expect(readOperationalQueueV2(queueBody(edit))).toBeNull();
  });
});

describe("the Receipt and Display columns", () => {
  it("draw the published axes of each row", async () => {
    mount(queueBody());
    await table();
    const rows = dataRows();
    expect(rows).toHaveLength(3);
    const text = rows.map((r) => `${cell(r, "Receipt")}|${cell(r, "Display")}`).join("\n");
    expect(text).toContain("Delivery: receipt confirmed");
    expect(text).toContain("Delivery: awaiting receipt");
    expect(text).toContain("Delivery: no receipt expected");
    expect(rows.every((r) => cell(r, "Display").includes("Current"))).toBe(true);
  });

  it("a null axis is a typed gap that names FE-032; an omitted axis keeps the old gap; neither is a word", async () => {
    mount(queueBody((q) => {
      q.page.rows[0].display_state = null;
      q.page.rows[0].delivery_state = null;
      delete q.page.rows[1].display_state;
      delete q.page.rows[1].delivery_state;
      q.page.health.pending_receipt_count.count = 0;
    }));
    await table();
    const rows = dataRows();
    const cells = rows.map((r) => cell(r, "Display"));
    expect(cells.filter((c) => c.includes("Not published") || c.includes("Not available"))).toHaveLength(2);
    expect(cells.filter((c) => c.includes("Current"))).toHaveLength(1);
    for (const r of rows.slice(0, 2)) expect(cell(r, "Receipt")).not.toContain("Delivery:");
  });

  it("rejects an axis value outside the closed vocabulary", () => {
    expect(readOperationalQueueV2(queueBody((q) => { q.page.rows[0].display_state = "FRESH"; }))).toBeNull();
    expect(readOperationalQueueV2(queueBody((q) => { q.page.rows[0].delivery_state = "SHIPPED"; }))).toBeNull();
    expect(readOperationalQueueV2(queueBody((q) => { q.page.rows[0].display_state = 3; }))).toBeNull();
  });
});
