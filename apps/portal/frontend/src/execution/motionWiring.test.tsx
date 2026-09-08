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
import { targetHrefFor } from "./idLinks";
import { readGateR1Detail } from "./api/rows";
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

describe("targetHrefFor — routing by the type the source published", () => {
  it("routes each addressable kind to its own register", () => {
    expect(targetHrefFor("ACCOUNT", "acct-live-01")).toBe("/deployments/accounts/acct-live-01");
    expect(targetHrefFor("PORTFOLIO", "PF-MAIN")).toBe("/deployments/portfolios/PF-MAIN");
    expect(targetHrefFor("BROKER_BINDING", "binance_main_01")).toBe("/deployments/accounts?binding=binance_main_01");
  });

  it("links ids the old prefix rule silently dropped", () => {
    // The queue routed by sniffing for an `acct-` prefix, so an ACCOUNT whose
    // id is named anything else was left as plain text — inference losing to
    // the answer the source had already given.
    expect(targetHrefFor("ACCOUNT", "binance_testnet_main")).toBe("/deployments/accounts/binance_testnet_main");
  });

  it("needs the environment before it can address a deployment", () => {
    // The same deployment id exists under three books; without the environment
    // there is no way to know which route resolves, and a link to a route that
    // does not resolve is worse than plain text.
    expect(targetHrefFor("DEPLOYMENT", "dep_1")).toBeNull();
    expect(targetHrefFor("DEPLOYMENT", "dep_1", "SANDBOX")).toBe("/deployments/sandbox/dep_1");
  });

  it("sends nobody to a route that does not exist", () => {
    expect(targetHrefFor("SYSTEM", "trading-system")).toBeNull();
    expect(targetHrefFor("ORDER", "ord_9")).toBeNull();
    expect(targetHrefFor("ACCOUNT", null)).toBeNull();
    expect(targetHrefFor(null, "acct-1")).toBeNull();
  });

  it("escapes an id rather than letting it shape the path", () => {
    expect(targetHrefFor("ACCOUNT", "a/b?c")).toBe("/deployments/accounts/a%2Fb%3Fc");
  });
});

describe("a governance decision names a workspace that exists", () => {
  it("carries the workspace the review published", () => {
    // The client used to post the literal "default". It is not a workspace id:
    // measured against dev on 2026-09-08, `workspace_id=default` answers 404
    // WORKSPACE_NOT_FOUND while the same read with the field omitted answers
    // 200. So every Approve/Deny on R1, R2, Live and Exit Review failed on the
    // first press, and nothing on the screen said so beforehand.
    const detail = readGateR1Detail({
      workspace_id: "ws_real",
      data: { approval: { approval_id: "AP-201" } },
    });
    expect(detail?.workspaceId).toBe("ws_real");
  });

  it("reports no workspace rather than inventing one", () => {
    // `null` is what makes the screen close its controls with a reason. A
    // fallback string here would put the failure back one step, to the press.
    const detail = readGateR1Detail({ data: { approval: { approval_id: "AP-201" } } });
    expect(detail?.workspaceId).toBeNull();
    expect(readGateR1Detail({ workspace_id: "", data: { approval: { approval_id: "AP-201" } } })?.workspaceId).toBeNull();
  });
});
