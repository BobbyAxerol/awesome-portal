/**
 * Overview Contributors, package 5: a bounded group page, completeness from `group_page` (never from the count), Next/Previous by the opaque
 * cursors, name and owner from the group's own attribution, full-population totals unchanged on every page, cursors reset with the question.
 * The linked fixture is the canonical `execution-manager-contributors.synthetic.valid.json` group, multiplied.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { loadCanonical } from "../../testkit/loadCanonical";
import { newSeriesDouble, wrapFetch } from "../series/seriesDouble.testbase";
import { sessionOf } from "../alpha/testApi";
import { datasetFor, withDataset } from "../portfolios/datasetFixtures.testbase";
import OverviewScreen from "./index";
import { CONTRIBUTORS_GROUP_LIMIT, contributorsView } from "./contributorsModel";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = { ...sessionOf(["governance.r1.read"]), principal: null };
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
  vi.stubGlobal("fetch", wrapFetch(globalThis.fetch, newSeriesDouble("unavailable")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Body = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Query = Parameters<Parameters<typeof withDataset>[1] & {}>[0];
const canonical = (): Body => structuredClone(loadCanonical<{ value: Body }>("execution-manager-contributors.synthetic.valid.json").value);
const name = (i: number): string => `TEST_ONLY:alpha-${String(i).padStart(4, "0")}`;

/** `n` groups of the canonical one; the server pages them by `limit` and the opaque cursors "after:K" / "before:K" (K = offset). Totals stay the canonical group's. */
function server(n: number, mask: (i: number, attribution: Body) => void = () => undefined) {
  const template = canonical().groups[0];
  const all = Array.from({ length: n }, (_, i) => {
    const group = structuredClone(template);
    group.key = [{ field: "alpha_id", value: name(i) }];
    // The canonical group publishes no partition; one amount is added so the panel has a figure to draw (every group the same, so a page cannot change it).
    group.economic_partitions = [{ partition: partition("PAPER", "USDT", "usdt"), metrics: { net_pnl: moneyMetric({ value: "100.25" }) } }];
    group.attribution = { alpha_id: name(i), name: `Alpha ${i}`, owner_user_id: "TEST_ONLY:owner", name_reason_code: null, owner_reason_code: null };
    mask(i, group.attribution);
    return group;
  });
  return (query: Query) => datasetFor("FUND", "unused", (body: Body) => {
    if (!query.groupBy?.length) { body.groups = []; return; }
    const limit = query.groupLimit ?? 200;
    const offset = query.groupAfter !== undefined ? Number(query.groupAfter.split(":")[1]) : query.groupBefore !== undefined ? Math.max(0, Number(query.groupBefore.split(":")[1]) - limit) : 0;
    body.groups = all.slice(offset, offset + limit);
    body.selected_window = { requested: query.window, resolved: { from_ms: 1_700_000_000_000, to_ms: 1_700_000_900_000 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
    body.items = [body.items[0]];
    body.page = { limit: 1, returned_count: 1, authorized_filtered_count: 900, next_cursor: "TEST_ONLY:row", previous_cursor: null };
    body.group_page = { limit, returned_count: body.groups.length, authorized_filtered_count: n, next_cursor: offset + limit < n ? `after:${offset + limit}` : null, previous_cursor: offset > 0 ? `before:${offset}` : null };
  });
}

function Go({ to }: { to: string }) { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(to)}>go {to}</button>; }
const mount = (api: ReturnType<typeof withDataset>, entry = "/execution?env=paper&window=30D") =>
  render(<MemoryRouter initialEntries={[entry]}><Go to="/execution?env=paper&window=7D" /><OverviewScreen api={api} sseFactory={null} /></MemoryRouter>);
const panel = () => screen.getByRole("region", { name: "Contributors" });
const settled = async () => { await waitFor(() => expect(within(panel()).queryByRole("table", { name: "Contributors by alpha" })).not.toBeNull()); };
const firstAlpha = () => panel().querySelector("tbody th")?.firstChild?.textContent ?? "";

describe("group page", () => {
  it("asks for a bounded group page (never the default 200), states 'top N of M' once, and offers only Next on the first page", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), server(207), asked));
    await settled();
    const q = asked.find((a) => a.groupBy !== undefined)!;
    expect(q.groupLimit).toBe(CONTRIBUTORS_GROUP_LIMIT);
    expect(q.groupAfter).toBeUndefined();
    expect(q.groupBefore).toBeUndefined();
    expect(screen.getAllByTestId("contributors-population").length).toBe(1);
    expect(panel().textContent!.match(/Top 34 of 207 alpha groups/g)!.length).toBe(1);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Next asks with the opaque after-cursor only, Previous with the before-cursor only, one direction at a time, and the page follows", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), server(207), asked));
    await settled();
    expect(firstAlpha()).toBe("Alpha 0");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(firstAlpha()).toBe(`Alpha ${CONTRIBUTORS_GROUP_LIMIT}`));
    const next = asked.filter((a) => a.groupBy !== undefined).at(-1)!;
    expect(next.groupAfter).toBe(`after:${CONTRIBUTORS_GROUP_LIMIT}`);
    expect(next.groupBefore).toBeUndefined();
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(firstAlpha()).toBe("Alpha 0"));
    const back = asked.filter((a) => a.groupBy !== undefined).at(-1)!;
    expect(back.groupBefore).toBe(`before:${CONTRIBUTORS_GROUP_LIMIT}`);
    expect(back.groupAfter).toBeUndefined();
  });

  it("full-group totals are the same on every page (rows and amounts of the canonical group) and shares are not rescaled by paging", async () => {
    mount(withDataset(httpApi(), server(207)));
    await settled();
    const rowsOf = () => [...panel().querySelectorAll("tbody tr")].map((tr) => [...tr.children].slice(-3).map((c) => c.textContent));
    const first = rowsOf();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(firstAlpha()).toBe(`Alpha ${CONTRIBUTORS_GROUP_LIMIT}`));
    expect(rowsOf()).toEqual(first);
  });

  it("the last page has no Next; a context change (window) drops the cursor and asks the first page again", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), server(40), asked));
    await settled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(firstAlpha()).toBe(`Alpha ${CONTRIBUTORS_GROUP_LIMIT}`));
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "go /execution?env=paper&window=7D" }));
    await waitFor(() => expect(asked.some((a) => a.groupBy !== undefined && a.window === "7D")).toBe(true));
    const after = asked.filter((a) => a.groupBy !== undefined && a.window === "7D");
    expect(after.every((a) => a.groupAfter === undefined && a.groupBefore === undefined)).toBe(true);
    await waitFor(() => expect(firstAlpha()).toBe("Alpha 0"));
  });

  it("Refresh starts again at the first page", async () => {
    const asked: Query[] = [];
    mount(withDataset(httpApi(), server(207), asked));
    await settled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(firstAlpha()).toBe(`Alpha ${CONTRIBUTORS_GROUP_LIMIT}`));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(firstAlpha()).toBe("Alpha 0"));
  });
});

describe("completeness comes from group_page", () => {
  const viewOf = (n: number, limit: number) => {
    const read = server(n)({ surface: "FUND", environment: "paper", window: "30D", groupBy: ["alpha_id"], groupLimit: limit });
    return contributorsView({ served: true, fundRead: { phase: "idle" }, fund: datasetFor("FUND", "u"), grouped: { phase: "ready", warnings: [], value: read } });
  };
  it("more than 200 groups: the first 200 are named as 200 of the total, with a next cursor", () => {
    const view = viewOf(207, 200);
    if (view.kind !== "ready") throw new Error(JSON.stringify(view));
    expect(view.groups.length).toBe(200);
    expect(view.population.partial).toBe(true);
    expect(view.population.statement).toContain("Top 200 of 207 alpha groups");
    expect(view.population.groupPage).toMatchObject({ hasNext: true, hasPrevious: false, total: 207 });
  });
  it("exactly 200 groups is complete", () => {
    const view = viewOf(200, 200);
    if (view.kind !== "ready") throw new Error(JSON.stringify(view));
    expect(view.groups.length).toBe(200);
    expect(view.population.partial).toBe(false);
    expect(view.population.statement).toContain("200 alpha groups, all shown");
  });
});

describe("attribution", () => {
  it("shows the group's own name and owner; a masked name or owner is a typed absence in words, never an id turned into a name", async () => {
    mount(withDataset(httpApi(), server(5, (i, a) => {
      if (i === 1) Object.assign(a, { name: null, name_reason_code: "GROUP_NAME_AMBIGUOUS" });
      if (i === 2) Object.assign(a, { owner_user_id: null, owner_reason_code: "GROUP_OWNER_NOT_PUBLISHED" });
      if (i === 3) Object.assign(a, { name: null, name_reason_code: "GROUP_NAME_NOT_PUBLISHED", owner_user_id: null, owner_reason_code: "GROUP_OWNER_AMBIGUOUS" });
    })));
    await settled();
    const header = (i: number) => panel().querySelectorAll("tbody th")[i]!.textContent!;
    expect(header(0)).toContain("Alpha 0");
    expect(header(0)).toContain("Owner TEST_ONLY:owner");
    expect(header(1)).toContain(name(1));
    expect(header(1)).toContain("Name ambiguous");
    expect(header(1)).not.toContain("Alpha 1");
    expect(header(2)).toContain("Alpha 2");
    expect(header(2)).toContain("Owner not published");
    expect(header(3)).toContain("Name not published");
    expect(header(3)).toContain("Owner ambiguous");
  });
});
