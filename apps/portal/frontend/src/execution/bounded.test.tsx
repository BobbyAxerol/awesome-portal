/**
 * C-PI04-04 — bounded Funnel and Capital Ledger.
 *
 * The defect these gates close was live: both readers consumed the row arrays
 * and none of the bounded fields, so a capped window rendered as though it were
 * the whole history. Every test here is a way that could come back.
 *
 * The population counts are read from the contract, never derived. That is the
 * distinction the assertions keep returning to: `events.length` is what arrived,
 * `event_count` is what exists, and a screen that computes the second from the
 * first is correct only until the server bounds a response.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readCapitalLedger, readOrderFunnel } from "./analytics";
import { OrderFunnelStrip } from "./screens/FullBlotter";

afterEach(cleanup);

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");
const load = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `execution-analytics.${name}.valid.json`), "utf8"));

describe("funnel reads the population, not the rows it received", () => {
  it("reads every bounded field the contract publishes", () => {
    const funnel = readOrderFunnel(load("order-funnel"))!;
    expect(funnel.bounded.total).toBe(4);
    expect(funnel.bounded.returned).toBe(4);
    expect(funnel.bounded.hasMore).toBe(false);
    expect(funnel.window).toBe("LIFECYCLE_AND_LATEST");
  });

  it("reads each stage's own exact count separately from its events", () => {
    const funnel = readOrderFunnel(load("order-funnel"))!;
    const submit = funnel.stages.find((s) => s.name === "SUBMIT")!;
    expect(submit.eventCount).toBe(1);
    expect(submit.returnedEventCount).toBe(1);
    expect(submit.truncated).toBe(false);
  });

  it("keeps the stage count when the window returned fewer events than exist", () => {
    const raw = load("order-funnel");
    const stage = raw.analytics.data.stages[0];
    stage.event_count = 4180;
    stage.returned_event_count = 1;
    stage.truncated = true;
    const funnel = readOrderFunnel(raw)!;
    const s = funnel.stages.find((x) => x.name === stage.stage)!;
    expect(s.eventCount).toBe(4180);
    // The array is still one event. The two numbers must not converge.
    expect(s.events.length).toBe(1);
    expect(s.truncated).toBe(true);
  });

  it("never treats a missing has_more as a complete response", () => {
    const raw = load("order-funnel");
    delete raw.analytics.data.has_more;
    expect(readOrderFunnel(raw)!.bounded.hasMore).toBe(false);
    raw.analytics.data.has_more = "true";
    // Only the literal boolean counts; a string is not a claim we can act on.
    expect(readOrderFunnel(raw)!.bounded.hasMore).toBe(false);
  });

  it("returns a null window rather than guessing one", () => {
    const raw = load("order-funnel");
    raw.analytics.data.window = "EVERYTHING";
    expect(readOrderFunnel(raw)!.window).toBeNull();
  });

  it("says the response is a bounded window, and that it is not a full export", () => {
    const raw = load("order-funnel");
    raw.analytics.data.has_more = true;
    raw.analytics.data.event_count = 4180;
    raw.analytics.data.returned_event_count = 4;
    render(<OrderFunnelStrip funnel={readOrderFunnel(raw)} status="ok" />);
    expect(screen.getByText(/Bounded window/)).toBeTruthy();
    expect(screen.getByText(/4,180/)).toBeTruthy();
    expect(screen.getByText(/not a full chronological export/)).toBeTruthy();
  });

  it("says nothing about bounding when the response is complete", () => {
    render(<OrderFunnelStrip funnel={readOrderFunnel(load("order-funnel"))} status="ok" />);
    expect(screen.queryByText(/Bounded window/)).toBeNull();
  });

  it("states that truncated stage events were never sent, not merely not rendered", () => {
    const raw = load("order-funnel");
    const stage = raw.analytics.data.stages[0];
    stage.event_count = 900;
    stage.returned_event_count = 1;
    stage.truncated = true;
    render(<OrderFunnelStrip funnel={readOrderFunnel(raw)} status="ok" />);
    expect(screen.getByText(/the rest were not sent/)).toBeTruthy();
  });
});

describe("ledger reads the population, and its totals describe it", () => {
  it("reads every bounded field the contract publishes", () => {
    const ledger = readCapitalLedger(load("capital-ledger"))!;
    expect(ledger.bounded.total).toBe(1);
    expect(ledger.bounded.returned).toBe(1);
    expect(ledger.bounded.hasMore).toBe(false);
    expect(ledger.window).toBe("LATEST");
  });

  it("keeps entry_count and the returned rows apart", () => {
    const raw = load("capital-ledger");
    raw.analytics.data.entry_count = 4180;
    raw.analytics.data.returned_entry_count = 1;
    raw.analytics.data.has_more = true;
    const ledger = readCapitalLedger(raw)!;
    expect(ledger.bounded.total).toBe(4180);
    expect(ledger.bounded.returned).toBe(1);
    expect(ledger.buckets.reduce((n, b) => n + b.entries.length, 0)).toBe(1);
  });

  it("does not infer has_more from the counts", () => {
    // total > returned and yet the server says complete. The reader reports
    // what it was told; deriving the flag would contradict the server.
    const raw = load("capital-ledger");
    raw.analytics.data.entry_count = 9;
    raw.analytics.data.returned_entry_count = 1;
    raw.analytics.data.has_more = false;
    expect(readCapitalLedger(raw)!.bounded.hasMore).toBe(false);
  });
});
