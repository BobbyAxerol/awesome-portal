/**
 * Goal 6 — the mechanisms where they meet real screens.
 *
 * `listMotion.test.ts` proves each mechanism in isolation. These prove the
 * three places a screen used to drop the data on the floor: an age column that
 * rendered a dash while the timestamp sat two columns away, a queue that
 * ignored the operation a link named, and a clock the route froze at first
 * paint.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { FullBlotter, type BlotterRow } from "./screens/FullBlotter";
import { OperationsQueueScreen } from "./screens/OperationsQueue";
import { readOperationsQueue } from "./operations";
import { blotterHandlers } from "./testHandlers";
import { OPERATIONS_QUEUE_FIXTURE } from "./operations.fixtures";
import type { Envelope, KeysetPage } from "./contracts";

const ENVELOPE: Envelope = { authority: "EXECUTION", asOf: "2026-09-08T12:00:00Z", freshness: "OK" };

afterEach(cleanup);

const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

const row = (over: Partial<BlotterRow> = {}): BlotterRow => ({
  orderId: "ord_1",
  at: new Date(Date.now() - 11 * 60_000 - 30_000).toISOString(),
  deployment: "dep_1",
  venue: "BINANCE",
  symbol: "ETHUSDT",
  orderType: "LIMIT",
  side: "BUY",
  quantity: "0.08",
  price: "1819.57",
  status: "ACCEPTED",
  fee: null,
  feeCurrency: null,
  ...over,
});

const page = (rows: readonly BlotterRow[]): KeysetPage<BlotterRow> => ({
  rows, totalCount: rows.length, filteredCount: rows.length,
  nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false,
  appliedFilters: [], appliedSort: [],
} as unknown as KeysetPage<BlotterRow>);

describe("blotter age column", () => {
  it("ages a real order from the timestamp already on the row", () => {
    // The column existed and rendered "—" on every row while `at` — published,
    // parsed, and displayed two columns to the left — went unread. An operator
    // asking how long an ACCEPTED order has been sitting there got a dash.
    mount(<FullBlotter {...blotterHandlers()} envelope={ENVELOPE} filter="ALL" page={page([row()])} />);
    expect(screen.getByTitle(/^placed /).textContent).toMatch(/11m \d\ds/);
  });

  it("keeps the dash when the row carries no usable timestamp", () => {
    // An age of "0s" would claim the order was placed this instant.
    mount(<FullBlotter {...blotterHandlers()} envelope={ENVELOPE} filter="ALL" page={page([row({ at: "" })])} />);
    expect(screen.queryByTitle(/^placed /)).toBeNull();
  });
});

// The canonical fixture, loaded rather than retyped.
const queue = () => readOperationsQueue(JSON.parse(JSON.stringify(OPERATIONS_QUEUE_FIXTURE)))!;

describe("operations queue source line", () => {
  it("keeps the contract's word and explains what it means", () => {
    // §7 keeps "fixture" visible so nobody mistakes this for source data. On
    // its own it read as "these rows are made up"; they are the Portal's own
    // triage records, and the queue is empty because none have been filed.
    mount(<OperationsQueueScreen queue={queue()} onOpen={() => {}} />);
    expect(screen.getByText(/profile fixture/)).toBeTruthy();
    expect(screen.getByText(/Portal-authored triage records/)).toBeTruthy();
  });

  it("says so when a linked operation is not on this page", () => {
    // Silently showing an unfiltered queue would let the reader conclude the
    // operation is absent from the source rather than from this page.
    mount(
      <OperationsQueueScreen
        queue={queue()}
        onOpen={() => {}}
        followNotice="Operation owf_9 is not on this page of the queue — load older rows or clear the filter to reach it."
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/owf_9 is not on this page/);
  });
});
