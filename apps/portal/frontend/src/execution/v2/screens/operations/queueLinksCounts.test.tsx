/**
 * Operations queue V2: incident links per row (FE-042) and counts by status
 * (FE-043), driven by bodies built from the published fixture
 * `execution-operational-queue-links-counts.synthetic.valid.json` (L0, loaded
 * fresh per test and never written) and read through the real V2 reader.
 *
 * What these tests hold the screen to:
 *   - the server's two link numbers are printed as they are, and a link to an
 *     incident the caller cannot read is neither listed nor counted, so the
 *     empty state says "No readable incident links", never "No incident";
 *   - an absent field is "Not published (FE-042/FE-043)", never 0 or none;
 *   - counts are the server's: the tile does not move when the loaded rows,
 *     the page size or the Range control disagree with it.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { readOperationalQueueV2, type OperationalQueueReadV2 } from "../../readers/operationalQueue";
import { loadCanonical } from "../../testkit/loadCanonical";
import OperationsV2, { ROW_CAP } from "./index";

afterEach(() => {
  cleanup();
});

type Body = Record<string, any>;
const FIXTURE = "execution-operational-queue-links-counts.synthetic";
const NOW = new Date("2026-08-22T13:00:00Z");

/** A fresh queue body from L0. Edit it in the test; the file on disk is never touched. */
const queueBody = (edit: (queue: Body) => void = () => undefined): Body => {
  const queue = loadCanonical<{ queue: Body }>(FIXTURE).queue;
  edit(queue);
  return queue;
};

function read(body: Body): Result<OperationalQueueReadV2> {
  const value = readOperationalQueueV2(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(body: Body, entry = "/execution/operations?workspace_id=ws_1&env=paper") {
  const api = {
    listOperationalQueueV2: vi.fn(async () => read(body)),
    getIncidentRootV2: vi.fn(),
  } as unknown as ExecutionApi;
  render(
    <MemoryRouter initialEntries={[entry]}>
      <OperationsV2 api={api} now={NOW} />
      <Where />
    </MemoryRouter>,
  );
  return api;
}

const table = () => screen.findByRole("table", { name: "Commands" });
const rowOf = (operationId: string) =>
  screen.getByRole("group", { name: `Incident links for operation ${operationId}` }).closest("tr") as HTMLElement;
const linksOf = (operationId: string) => screen.getByRole("group", { name: `Incident links for operation ${operationId}` });
const tile = (name: string) => screen.getByRole("group", { name: `${name} counts` });
const bucket = (group: HTMLElement, label: string) => {
  const li = [...group.querySelectorAll("li")].find((item) => item.firstElementChild?.textContent?.startsWith(label));
  if (!li) throw new Error(`no bucket ${label}`);
  return li;
};
const figure = (li: Element) => li.lastElementChild?.textContent;

/** Replaces a row's links, with the server's own arithmetic for `truncated`. */
function withLinks(row: Body, items: Body[], authorized = items.length) {
  row.incident_links = {
    basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY",
    bound: 3,
    authorized_link_count: authorized,
    truncated: authorized > items.length,
    items,
  };
}

describe("FE-042 incident links in the queue row", () => {
  it("lists the three links the server returned, each opening the incident drawer route, and the exact remainder", async () => {
    mount(queueBody());
    await table();
    const group = linksOf("op_TEST_ONLY_links_a");
    const links = within(group).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["inc_TEST_ONLY_links_4", "inc_TEST_ONLY_links_3", "inc_TEST_ONLY_links_2"]);
    // The status/severity words as published, in the server's order (newest first).
    const items = within(group).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "inc_TEST_ONLY_links_4Related · Open · Warning",
      "inc_TEST_ONLY_links_3Mitigates · Mitigated · Warning",
      "inc_TEST_ONLY_links_2Triggered by · Resolved · Warning",
    ]);
    // The server said 4 authorized links and listed 3: both numbers are printed, as they are.
    expect(group.textContent).toContain("1 more not shown (3 of 4 readable links listed)");
    // The route is the existing incident drawer route; the context in the query string is kept.
    expect(links[0]!.getAttribute("href")).toBe("/execution/operations/incidents/inc_TEST_ONLY_links_4?workspace_id=ws_1&env=paper");
  });

  it("one link: no remainder line", async () => {
    mount(queueBody((q) => {
      const row = q.page.rows[0];
      withLinks(row, [row.incident_links.items[0]]);
    }));
    await table();
    const group = linksOf("op_TEST_ONLY_links_a");
    expect(within(group).getAllByRole("link")).toHaveLength(1);
    expect(group.textContent).not.toMatch(/more not shown/);
    expect(group.getAttribute("data-state")).toBe("listed");
  });

  it("exactly three links is complete, not truncated: no remainder line", async () => {
    mount(queueBody((q) => {
      const row = q.page.rows[0];
      withLinks(row, row.incident_links.items.slice(0, 3), 3);
    }));
    await table();
    const group = linksOf("op_TEST_ONLY_links_a");
    expect(within(group).getAllByRole("link")).toHaveLength(3);
    expect(group.textContent).not.toMatch(/more not shown/);
  });

  it("more than three: the remainder is the server's two numbers, for any count above the bound", async () => {
    mount(queueBody((q) => {
      const row = q.page.rows[0];
      withLinks(row, row.incident_links.items.slice(0, 3), 11);
    }));
    await table();
    expect(linksOf("op_TEST_ONLY_links_a").textContent).toContain("8 more not shown (3 of 11 readable links listed)");
  });

  it("a NOT_ATTESTED slot keeps its place and is not a link: it names no incident", async () => {
    mount(queueBody());
    await table();
    const group = linksOf("op_TEST_ONLY_links_b");
    expect(within(group).getAllByRole("link").map((a) => a.textContent)).toEqual(["inc_TEST_ONLY_links_1"]);
    const items = within(group).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1]!.textContent).toBe("Incident not attestedINCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE");
    expect(items[1]!.querySelector("a")).toBeNull();
    // Two authorized links, two listed: nothing is "not shown".
    expect(group.textContent).not.toMatch(/more not shown/);
  });

  it("zero authorized links says 'No readable incident links', never 'No incident'", async () => {
    mount(queueBody());
    await table();
    const group = linksOf("op_TEST_ONLY_links_c");
    expect(group.textContent).toBe("No readable incident links");
    expect(group.getAttribute("data-state")).toBe("none");
    expect(within(group).queryAllByRole("link")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\bno incidents?\b/i);
    expect(document.body.textContent).not.toMatch(/\bnone\b/i);
  });

  it("links to incidents the caller cannot read (403-hidden) are omitted by the server and appear nowhere", async () => {
    // The server drops them from `items` and from `authorized_link_count`: the body of a caller who may read one
    // of three linked incidents is exactly a one-link body. The screen cannot, and does not try to, tell them apart.
    mount(queueBody((q) => {
      const row = q.page.rows[0];
      withLinks(row, [row.incident_links.items[2]], 1);
    }));
    await table();
    const group = linksOf("op_TEST_ONLY_links_a");
    expect(within(group).getAllByRole("link").map((a) => a.textContent)).toEqual(["inc_TEST_ONLY_links_2"]);
    expect(group.textContent).not.toMatch(/more not shown|hidden|forbidden|denied|1 of/i);
  });

  it("an absent field is 'Not published (FE-042)', not 'none' and not zero", async () => {
    mount(queueBody((q) => {
      delete q.page.rows[0].incident_links;
    }));
    await table();
    const group = linksOf("op_TEST_ONLY_links_a");
    expect(group.textContent).toBe("Not published (FE-042)");
    expect(group.getAttribute("data-state")).toBe("absent");
    // The other rows still publish theirs.
    expect(linksOf("op_TEST_ONLY_links_c").textContent).toBe("No readable incident links");
  });

  it("an older body without the field on any row says so on every row", async () => {
    mount(queueBody((q) => {
      for (const row of q.page.rows) delete row.incident_links;
      delete q.page.status_counts;
    }));
    await table();
    const groups = screen.getAllByRole("group", { name: /^Incident links for operation / });
    expect(groups).toHaveLength(3);
    for (const group of groups) expect(group.textContent).toBe("Not published (FE-042)");
  });

  it("keeps the six kit columns: the links live in the Target and operation cell", async () => {
    mount(queueBody());
    const t = await table();
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Time", "Target and operation", "Intent", "Receipt", "Display", "Next"]);
    expect(linksOf("op_TEST_ONLY_links_a").closest("td")?.getAttribute("data-l")).toBe("Target and operation");
  });

  describe("accessibility", () => {
    it("every row's links are a named group, every link names the incident and the operation", async () => {
      mount(queueBody());
      await table();
      for (const id of ["a", "b", "c"]) expect(linksOf(`op_TEST_ONLY_links_${id}`)).toBeTruthy();
      const link = screen.getByRole("link", { name: "Open incident inc_TEST_ONLY_links_4, linked to operation op_TEST_ONLY_links_a" });
      // The accessible name carries the visible text (WCAG 2.5.3 label in name).
      expect(link.getAttribute("aria-label")).toContain(link.textContent!);
      // The list is a list, with its items, even with list styling removed.
      expect(within(linksOf("op_TEST_ONLY_links_a")).getByRole("list").getAttribute("role")).toBe("list");
    });

    it("keyboard order inside a row: the row, then its incident links in the server's order, then Next", async () => {
      mount(queueBody());
      await table();
      const row = rowOf("op_TEST_ONLY_links_b");
      const stops = [...row.querySelectorAll<HTMLElement>("a[href], button")];
      expect(stops.map((el) => el.getAttribute("aria-label") ?? el.textContent)).toEqual([
        // Row b is ACKNOWLEDGED with an UNCERTAIN outcome: its action is the check-original button.
        "Open incident inc_TEST_ONLY_links_1, linked to operation op_TEST_ONLY_links_b",
        "Check original request",
      ]);
      expect(row.getAttribute("tabindex")).toBe("0");
      // No positive tabindex anywhere: the visual and the tab order are the DOM order.
      expect(document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
    });

    it("activating a link goes to the incident route and does not also open the operation", async () => {
      mount(queueBody());
      await table();
      const link = screen.getByRole("link", { name: /Open incident inc_TEST_ONLY_links_4/ });
      // Enter and Space on a link must not reach the row's own open handler.
      fireEvent.keyDown(link, { key: "Enter" });
      fireEvent.keyDown(link, { key: " " });
      expect(screen.queryByRole("complementary")).toBeNull();
      fireEvent.click(link);
      expect(screen.getByTestId("where").textContent).toBe(
        "/execution/operations/incidents/inc_TEST_ONLY_links_4?workspace_id=ws_1&env=paper",
      );
      expect(screen.getByTestId("where").textContent).not.toContain("sel=");
    });

    it("an incident id with a reserved character (the schema allows a colon) is encoded into one path segment", async () => {
      mount(queueBody((q) => {
        const row = q.page.rows[0];
        const item = { ...row.incident_links.items[0], incident_id: "inc:7.a" };
        withLinks(row, [item], 1);
      }));
      await table();
      expect(screen.getByRole("link", { name: /Open incident inc:7\.a/ }).getAttribute("href"))
        .toBe("/execution/operations/incidents/inc%3A7.a?workspace_id=ws_1&env=paper");
    });

    it("the cell is plain text and wraps: a long id does not widen a card (no fixed width, wrap allowed)", async () => {
      mount(queueBody((q) => {
        const row = q.page.rows[0];
        withLinks(row, [{ ...row.incident_links.items[0], incident_id: `inc_${"x".repeat(187)}` }], 1);
      }));
      await table();
      const link = within(linksOf("op_TEST_ONLY_links_a")).getByRole("link");
      expect(link.textContent).toHaveLength(191);
      expect(link.className).toBe("exec-ops-link-id");
    });
  });
});

describe("FE-043 counts by status", () => {
  it("prints the server's exact integers for every bucket, with its totals", async () => {
    mount(queueBody());
    await table();
    const triage = tile("Triage");
    expect(bucket(triage, "Unacknowledged").textContent).toBe("Unacknowledged1");
    expect(bucket(triage, "Acknowledged").textContent).toBe("Acknowledged1");
    expect(bucket(triage, "Resolved").textContent).toBe("Resolved1");
    expect(triage.querySelector(".exec-ops-dim-total")?.textContent).toBe("3under every filter");
    const verification = tile("Verification");
    expect([...verification.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Not started0", "Pending1", "Succeeded1", "Failed0", "Partial0", "Uncertain1", "Denied0", "Expired0",
    ]);
    expect([...tile("Source status").querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Blocked0", "Pending1", "Running0", "Succeeded1", "Failed0", "Expired0", "Uncertain1",
    ]);
  });

  it("says what the counts cover and when they were read, and that Succeeded is a Portal record state", async () => {
    mount(queueBody());
    await table();
    const region = screen.getByRole("region", { name: "Counts by status" });
    expect(region.textContent).toContain("Counted by the server across the whole filtered query, not just the loaded rows.");
    expect(region.textContent).toContain("Succeeded is the Portal queue record state only");
    expect(region.textContent).toContain("Same server snapshot as the table, observed ");
    // The contract publishes no snapshot id: the screen invents none.
    expect(region.textContent).not.toMatch(/snapshot (id|#)|txid/i);
  });

  it("an active filter: its own dimension ignores it, shows the siblings, and marks the selected bucket", async () => {
    mount(queueBody());
    await table();
    // The fixture applies severity=WARNING. Severity's total is the scope under the OTHER filters (6), not the filtered 3.
    const severity = tile("Severity");
    expect(severity.querySelector(".exec-ops-dim-total")?.textContent).toBe("6with the severity filter ignored");
    expect([...severity.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Info1", "Warning (filtered)3", "Error1", "Critical1",
    ]);
    expect(severity.querySelector('li[data-selected="true"]')?.textContent).toBe("Warning (filtered)3");
    // The other dimensions are under every filter, and none is marked.
    for (const name of ["Triage", "Verification", "Source status"]) {
      expect(tile(name).querySelector('li[data-selected="true"]')).toBeNull();
      expect(tile(name).textContent).toContain("under every filter");
    }
  });

  it("the Needs attention lens is a triage filter: the triage tile ignores it and marks Unacknowledged", async () => {
    mount(queueBody((q) => {
      q.page.applied_filters = [{ field: "triage_state", op: "eq", value: "UNACKNOWLEDGED" }];
      q.page.filtered_count = 1;
      q.page.rows = [q.page.rows[2]];
      const d = q.page.status_counts.dimensions;
      // Under the lens alone: triage ignores it (6 in scope); the others count only the UNACKNOWLEDGED rows.
      d.triage_state = { own_filter_applied: true, total: 6, counts: { UNACKNOWLEDGED: 1, ACKNOWLEDGED: 3, RESOLVED: 2 } };
      d.verification_result = { own_filter_applied: false, total: 1, counts: { NOT_STARTED: 0, PENDING: 1, SUCCEEDED: 0, FAILED: 0, PARTIAL: 0, UNCERTAIN: 0, DENIED: 0, EXPIRED: 0 } };
      d.source_status = { own_filter_applied: false, total: 1, counts: { BLOCKED: 0, PENDING: 1, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, EXPIRED: 0, UNCERTAIN: 0 } };
      d.severity = { own_filter_applied: false, total: 1, counts: { INFO: 0, WARNING: 1, ERROR: 0, CRITICAL: 0 } };
    }));
    await table();
    const triage = tile("Triage");
    expect(triage.querySelector('li[data-selected="true"]')?.textContent).toBe("Unacknowledged (filtered)1");
    expect(bucket(triage, "Acknowledged").textContent).toBe("Acknowledged3");
    expect(triage.querySelector(".exec-ops-dim-total")?.textContent).toBe("6with the triage filter ignored");
  });

  it("zero buckets are published zeros and print as 0 where the server counted", async () => {
    mount(queueBody());
    await table();
    const failed = bucket(tile("Verification"), "Failed");
    expect(figure(failed)).toBe("0");
    expect(failed.getAttribute("data-selected")).toBeNull();
  });

  it("an absent status_counts is 'Not published (FE-043)' in every tile, and no tile prints a zero", async () => {
    mount(queueBody((q) => {
      delete q.page.status_counts;
    }));
    await table();
    for (const name of ["Triage", "Verification", "Source status", "Severity"]) {
      const group = tile(name);
      expect(group.getAttribute("data-state")).toBe("absent");
      expect(group.textContent).toBe(`${name}Not published (FE-043)`);
      expect(group.querySelectorAll("li")).toHaveLength(0);
    }
    // The scope sentence still says what a count would cover, but there is no snapshot claim without counts.
    const region = screen.getByRole("region", { name: "Counts by status" });
    expect(region.textContent).not.toContain("Same server snapshot");
    // The published page counts are untouched.
    const kpis = document.querySelector(".exec-blk-kpis") as HTMLElement;
    expect(within(kpis).getByText("Matching").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("3");
  });

  it("a present but malformed dimension voids the page: no tile, no table, no invented figure", async () => {
    mount(queueBody((q) => {
      delete q.page.status_counts.dimensions.severity;
    }));
    await waitFor(() => expect(screen.queryByRole("table", { name: "Commands" })).toBeNull());
    await screen.findByText(/unreadable/);
    expect(screen.queryByRole("region", { name: "Counts by status" })).toBeNull();
  });

  it("a count that does not add up (sum != total) voids the page rather than being shown", async () => {
    mount(queueBody((q) => {
      q.page.status_counts.dimensions.triage_state.counts.RESOLVED = 2;
    }));
    await screen.findByText(/unreadable/);
    expect(screen.queryByRole("region", { name: "Counts by status" })).toBeNull();
  });

  it("never recomputes from the loaded page: two rows loaded of three matching, the tiles still say 1/1/1 of 3", async () => {
    mount(queueBody((q) => {
      q.page.rows = q.page.rows.slice(0, 2);
      q.page.next_cursor = "cur_next";
      q.page.has_more = true;
    }));
    const t = await table();
    // Loaded rows are ACKNOWLEDGED and RESOLVED only; the UNACKNOWLEDGED row was not fetched.
    expect(within(t).queryAllByRole("row")).toHaveLength(3);
    expect(figure(bucket(tile("Triage"), "Unacknowledged"))).toBe("1");
    expect(tile("Triage").querySelector(".exec-ops-dim-total")?.textContent).toBe("3under every filter");
    const kpis = document.querySelector(".exec-blk-kpis") as HTMLElement;
    expect(within(kpis).getByText("Loaded").nextElementSibling?.textContent).toContain("of 3 matching");
  });

  it("the Range control hides loaded rows but does not change a count", async () => {
    mount(queueBody((q) => {
      q.page.rows[0].created_at = "2026-01-01T00:00:00Z";
      q.page.rows[0].updated_at = "2026-01-01T00:00:00Z";
      q.page.rows[0].acknowledged_at = "2026-01-01T00:00:00Z";
      q.page.rows[0].resolved_at = "2026-01-01T00:00:00Z";
    }));
    await table();
    expect(screen.getByText(/1 loaded older than 24H hidden\./)).toBeTruthy();
    expect(figure(bucket(tile("Triage"), "Resolved"))).toBe("1");
    expect(tile("Triage").querySelector(".exec-ops-dim-total")?.textContent).toBe("3under every filter");
  });

  it("a 200-row page: counts above the loaded rows are printed whole, with thousands separators and no arithmetic", async () => {
    mount(queueBody((q) => {
      const template = q.page.rows[2];
      q.page.rows = Array.from({ length: ROW_CAP }, (_, i) => ({
        ...structuredClone(template),
        operation_id: `op_TEST_ONLY_scale_${String(i).padStart(3, "0")}`,
        incident_links: { basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY", bound: 3, authorized_link_count: 0, truncated: false, items: [] },
      }));
      q.page.total_count = 12345;
      q.page.filtered_count = 1234;
      q.page.applied_filters = [];
      q.page.next_cursor = "cur_next";
      q.page.has_more = true;
      q.page.status_counts.dimensions = {
        triage_state: { own_filter_applied: false, total: 1234, counts: { UNACKNOWLEDGED: 1000, ACKNOWLEDGED: 200, RESOLVED: 34 } },
        verification_result: { own_filter_applied: false, total: 1234, counts: { NOT_STARTED: 0, PENDING: 1234, SUCCEEDED: 0, FAILED: 0, PARTIAL: 0, UNCERTAIN: 0, DENIED: 0, EXPIRED: 0 } },
        source_status: { own_filter_applied: false, total: 1234, counts: { BLOCKED: 0, PENDING: 1230, RUNNING: 4, SUCCEEDED: 0, FAILED: 0, EXPIRED: 0, UNCERTAIN: 0 } },
        severity: { own_filter_applied: false, total: 1234, counts: { INFO: 0, WARNING: 1234, ERROR: 0, CRITICAL: 0 } },
      };
    }));
    const t = await table();
    expect(within(t).getAllByRole("row")).toHaveLength(ROW_CAP + 1);
    expect(tile("Triage").querySelector(".exec-ops-dim-total")?.textContent).toBe("1,234under every filter");
    expect(figure(bucket(tile("Triage"), "Unacknowledged"))).toBe("1,000");
    expect(figure(bucket(tile("Source status"), "Running"))).toBe("4");
    // 200 loaded rows against 1,234 matching: the loaded figure is its own tile, never fed back into a count.
    const kpis = document.querySelector(".exec-blk-kpis") as HTMLElement;
    expect(within(kpis).getByText("Loaded").nextElementSibling?.textContent).toBe("200of 1,234 matching");
    // Every one of the 200 rows says it has no readable links, and none says 'No incident'.
    expect(screen.getAllByText("No readable incident links")).toHaveLength(ROW_CAP);
    // The DOM budget holds: the cap disables Load more instead of growing the table.
    expect(screen.getByRole("button", { name: "Load more" }).hasAttribute("disabled")).toBe(true);
  });

  it("tiles are named groups under one named region, with a heading each", async () => {
    mount(queueBody());
    await table();
    const region = screen.getByRole("region", { name: "Counts by status" });
    expect(within(region).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual([
      "Triage counts", "Verification counts", "Source status counts", "Severity counts",
    ]);
    expect(within(region).getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Counts by status", "Triage", "Verification", "Source status", "Severity",
    ]);
    // The selected bucket is said in words, not only in weight.
    expect(tile("Severity").textContent).toContain("Warning (filtered)");
  });
});

describe("honesty across the whole screen", () => {
  it("prints no dash, no N/A and no 'No incident', whatever the body carries", async () => {
    for (const edit of [
      (q: Body) => void q,
      (q: Body) => { delete q.page.status_counts; for (const row of q.page.rows) delete row.incident_links; },
    ]) {
      cleanup();
      mount(queueBody(edit));
      await table();
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toContain("N/A");
      expect(text).not.toMatch(/\bno incidents?\b/i);
    }
  });
});
