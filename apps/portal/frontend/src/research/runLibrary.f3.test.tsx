/**
 * Batch F3 · S01 - HiFi parity rows 01-6 and 01-10 (01-1 was closed in F2b).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary } from "./RunLibrary";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import { filtersFromSearch, type LibraryFilters } from "./useRunLibrary";
import { researchState } from "./state";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };

afterEach(cleanup);

describe("F3 01-10 - ?status= is case-insensitive", () => {
  it("accepts running / Running as RUNNING and still drops unknown values", () => {
    expect(filtersFromSearch("?status=running").status).toEqual(["RUNNING"]);
    expect(filtersFromSearch("?status=Running,failed").status).toEqual(["RUNNING", "FAILED"]);
    expect(filtersFromSearch("?status=running,nope").status).toEqual(["RUNNING"]);
  });
});

describe("F3 01-6 - the claim note keeps the right column", () => {
  it("every claim quote is pushed to the row's right edge, failed cards included", () => {
    const items: RunLibraryItem[] = fixture.items.map((r, i) => (i === 0 ? { ...r, status: "FAILED" } : r));
    render(
      <MemoryRouter>
        <RunLibrary
          filters={EMPTY}
          onFilters={vi.fn()}
          onToggleSel={vi.fn()}
          response={{ ...fixture, items }}
          items={items}
          state={researchState({ kind: "ok", rowCount: items.length })}
          sparklines={new Map()}
          onVisible={vi.fn()}
          onLoadNext={vi.fn()}
          onLoadPrevious={vi.fn()}
        />
      </MemoryRouter>,
    );
    const quotes = Array.from(document.querySelectorAll<HTMLElement>("blockquote[data-claim]"));
    expect(quotes.length).toBe(items.length);
    for (const q of quotes) expect(q.style.marginLeft).toBe("auto");
    expect(document.querySelector('blockquote[data-claim-kind="failed"]')).toBeTruthy();
  });
});
