import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardsTable, type CardsColumn } from "./cardsTable";
import { Flag } from "./Flag";

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
  nav: string | null;
  state: "ok" | "stale";
}

const ROWS: Row[] = [
  { id: "d1", name: "BTC-Trend v3", nav: "1,204,331.50", state: "ok" },
  { id: "d2", name: "ETH-Carry v1", nav: null, state: "stale" },
];

const COLUMNS: CardsColumn<Row>[] = [
  { key: "name", label: "Deployment", render: (r) => r.name },
  { key: "nav", label: "NAV", numeric: true, render: (r) => r.nav },
  { key: "state", label: "State", render: (r) => <Flag kind={r.state} /> },
];

const table = (extra: Partial<Parameters<typeof CardsTable<Row>>[0]> = {}) =>
  render(<CardsTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} label="Deployments" {...extra} />);

describe("CardsTable as a plain table", () => {
  it("renders a labelled table with a header cell per column", () => {
    table();
    const grid = screen.getByRole("table", { name: "Deployments" });
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Deployment", "NAV", "State"]);
    expect(within(grid).getAllByRole("row")).toHaveLength(3);
  });

  it("puts data-l with the column label on every body cell", () => {
    const { container } = table();
    const cells = container.querySelectorAll("tbody td");
    expect(cells).toHaveLength(ROWS.length * COLUMNS.length);
    cells.forEach((cell, i) => expect(cell.getAttribute("data-l")).toBe(COLUMNS[i % COLUMNS.length]!.label));
  });

  it("keeps data-numeric on the numeric th and every numeric td, and only there", () => {
    const { container } = table();
    expect([...container.querySelectorAll('th[data-numeric="true"]')].map((n) => n.textContent)).toEqual(["NAV"]);
    const numeric = [...container.querySelectorAll('td[data-numeric="true"]')];
    expect(numeric).toHaveLength(ROWS.length);
    numeric.forEach((cell) => expect(cell.getAttribute("data-l")).toBe("NAV"));
    expect(container.querySelectorAll("td:not([data-numeric]) ")).toHaveLength(ROWS.length * 2);
  });

  it("shows Not available, never a dash or zero, for an absent value", () => {
    const { container } = table();
    const cell = container.querySelectorAll("tbody tr")[1]!.querySelector('td[data-l="NAV"]')!;
    expect(cell.textContent).toBe("Not available");
    expect(container.textContent).not.toMatch(/[—–]|N\/A/);
    expect(cell.textContent).not.toBe("0");
  });

  it("keeps a published zero as a value", () => {
    const { container } = table({ rows: [{ id: "z", name: "Z", nav: "0.00", state: "ok" }] });
    expect(container.querySelector('td[data-l="NAV"]')!.textContent).toBe("0.00");
  });

  it("renders the empty slot only when there are no rows", () => {
    table({ rows: [], empty: <p>No deployments in this window.</p> });
    expect(screen.getByText("No deployments in this window.")).toBeTruthy();
    cleanup();
    table({ empty: <p>No deployments in this window.</p> });
    expect(screen.queryByText("No deployments in this window.")).toBeNull();
  });
});

describe("row opening", () => {
  it("rows are inert without onRowOpen", () => {
    const { container } = table();
    const row = container.querySelector("tbody tr")!;
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(row.getAttribute("data-interactive")).toBeNull();
  });

  it("opens on click, Enter and Space, and marks the selected row", () => {
    const onRowOpen = vi.fn();
    const { container } = table({ onRowOpen, selectedKey: "d2" });
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0]!.getAttribute("tabindex")).toBe("0");
    fireEvent.click(rows[0]!);
    fireEvent.keyDown(rows[0]!, { key: "Enter" });
    fireEvent.keyDown(rows[0]!, { key: " " });
    fireEvent.keyDown(rows[0]!, { key: "a" });
    expect(onRowOpen).toHaveBeenCalledTimes(3);
    expect(onRowOpen).toHaveBeenLastCalledWith(ROWS[0]);
    expect(rows[1]!.getAttribute("data-selected")).toBe("true");
    expect(rows[1]!.getAttribute("aria-current")).toBe("true");
    expect(rows[0]!.getAttribute("data-selected")).toBeNull();
  });
});

describe("CardsTable sortable headers (P-B4)", () => {
  const sortable: CardsColumn<Row>[] = [
    { key: "name", label: "Deployment", sortKey: "name", head: <i data-testid="sw" />, render: (r) => r.name },
    { key: "nav", label: "NAV", numeric: true, sortKey: "nav", render: (r) => r.nav },
    { key: "state", label: "State", sortOffReason: "Not sortable yet", render: (r) => <Flag kind={r.state} /> },
  ];

  it("is unchanged without onSort: no buttons, no aria-sort", () => {
    const { container } = render(<CardsTable columns={sortable} rows={ROWS} rowKey={(r) => r.id} label="Deployments" />);
    expect(container.querySelectorAll("th button")).toHaveLength(0);
    expect(container.querySelectorAll("th[aria-sort]")).toHaveLength(0);
  });

  it("prints a button on sortKey columns and aria-sort on the sorted head only, reports the key, and keeps the label as the name", () => {
    const onSort = vi.fn();
    const { container } = render(<CardsTable columns={sortable} rows={ROWS} rowKey={(r) => r.id} label="Deployments" sort={{ key: "nav", dir: "desc" }} onSort={onSort} />);
    const heads = [...container.querySelectorAll("th")];
    expect(heads.map((h) => h.getAttribute("aria-sort"))).toEqual([null, "descending", null]);
    expect(heads[2]!.getAttribute("title")).toBe("Not sortable yet");
    fireEvent.click(within(heads[0]!).getByRole("button", { name: "Deployment" }));
    expect(onSort).toHaveBeenCalledWith("name");
    expect(heads[0]!.querySelector('[data-testid="sw"]')!.parentElement!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("cards.css", () => {
  const css = readFileSync(join(__dirname, "css/cards.css"), "utf8");

  it("switches at 660px and prints data-l before the value", () => {
    expect(css).toMatch(/@media \(max-width: 660px\)/);
    expect(css).toMatch(/content: attr\(data-l\)/);
  });

  it("never ellipsises a numeric cell", () => {
    const numericBlocks = css.split("}").filter((block) => /data-numeric/.test(block));
    expect(numericBlocks.length).toBeGreaterThan(0);
    numericBlocks.forEach((block) => expect(block).not.toMatch(/text-overflow/));
  });
});

describe("CardsTable scroll region (UXM-10 F-5, scrollable-region-focusable)", () => {
  /** jsdom has no layout: say how wide the content is against the box. */
  function overflow(scroll: number, client: number) {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scroll);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(client);
  }
  afterEach(() => vi.restoreAllMocks());

  it("is a plain div, with no Tab stop, while the table fits", () => {
    overflow(500, 500);
    const { container } = table();
    const wrap = container.querySelector(".exec-cards-wrap")!;
    expect(wrap.getAttribute("tabindex")).toBeNull();
    expect(wrap.getAttribute("role")).toBeNull();
  });

  it("becomes a named, focusable region when it scrolls and nothing inside can take focus", () => {
    overflow(900, 500);
    table();
    const region = screen.getByRole("region", { name: "Deployments, scrolls sideways" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toBe("exec-cards-wrap");
  });

  it("names the cut-off side in data-more (end at the start of the scroll), and nothing while the table fits", () => {
    overflow(900, 500);
    const { container, unmount } = table({ onRowOpen: () => undefined });
    const wrap = container.querySelector<HTMLElement>(".exec-cards-wrap")!;
    expect(wrap.getAttribute("data-more")).toBe("end");
    wrap.scrollLeft = 200;
    fireEvent.scroll(wrap);
    expect(wrap.getAttribute("data-more")).toBe("both");
    wrap.scrollLeft = 400;
    fireEvent.scroll(wrap);
    expect(wrap.getAttribute("data-more")).toBe("start");
    unmount();
    overflow(500, 500);
    expect(table().container.querySelector(".exec-cards-wrap")!.hasAttribute("data-more")).toBe(false);
  });

  it("fades the cut-off edge in the stylesheet, and only while data-more says there is more", () => {
    const css = readFileSync(join(__dirname, "css/cards.css"), "utf8");
    expect(css).toMatch(/\.exec-cards-wrap\[data-more="end"\]\s*\{[^}]*mask-image/);
    expect(css).toMatch(/\.exec-cards-wrap\[data-more="both"\]\s*\{[^}]*mask-image/);
  });

  it("stays a plain div when it scrolls but a row is focusable (the rows already take focus)", () => {
    overflow(900, 500);
    const { container } = table({ onRowOpen: () => undefined });
    expect(container.querySelector(".exec-cards-wrap")!.getAttribute("tabindex")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("stays a plain div when it scrolls but a header sorts (a button is focusable content)", () => {
    overflow(900, 500);
    const sortable: CardsColumn<Row>[] = COLUMNS.map((c) => (c.key === "name" ? { ...c, sortKey: "name" } : c));
    render(<CardsTable columns={sortable} rows={ROWS} rowKey={(r) => r.id} label="Deployments" onSort={() => undefined} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
