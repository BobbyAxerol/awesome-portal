/**
 * B9 · S01 - served per-point UTC dates on the 24-column sparkline, and the
 * honest basis label next to the all-time return.
 *
 * Test data: the canonical `healthy().library_summary` (typed builder) plus
 * `return_basis` / `points` shaped from the generated RunSparklineResponse and
 * EnrichedAnalysis types (derived from the fixture's own first/last points).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary } from "./RunLibrary";
import { healthy } from "./enrichedAnalysis.fixtures";
import { readAllTime, type RunLibraryItem, type RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import { type LibraryFilters, type SparklineRead } from "./useRunLibrary";

const base = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const SUMMARY = healthy().library_summary;

afterEach(cleanup);

function draw(item: RunLibraryItem, sparklines: ReadonlyMap<string, SparklineRead> = new Map()) {
  render(
    <MemoryRouter>
      <RunLibrary
        filters={EMPTY}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={{ ...base, items: [item] }}
        items={[item]}
        state={researchState({ kind: "ok", rowCount: 1 })}
        sparklines={sparklines}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
      />
    </MemoryRouter>,
  );
  return document.querySelector<HTMLElement>(`[data-sparkline="${item.run_id}"]`)!;
}

const plain = { ...base.items[0], analytics_all_time: undefined, last_30d: undefined } as unknown as RunLibraryItem;
const VALUES = ["100", "101.5", "99.25"];
const AT = [1_700_000_000_000, 1_700_086_400_000, 1_700_172_800_000];

function scrubOn(read: SparklineRead) {
  const box = draw(plain, new Map([[plain.run_id, read]]));
  const scrub = box.querySelector<HTMLElement>("[data-spark-scrub]")!;
  fireEvent.keyDown(scrub, { key: "ArrowRight" });
  return box;
}

describe("B9 S01 - sparkline column dates", () => {
  it("names the served UTC date of the column when points are served", () => {
    const box = scrubOn({ kind: "series", values: VALUES, at: AT, source: null, revision: null });
    expect(box.querySelector("[data-scrub-date]")!.textContent).toBe("2023-11-14 22:13 UTC");
    expect(box.querySelector("[data-scrub-live]")!.textContent).toContain("2023-11-14 22:13 UTC");
  });

  it("keeps the position-only read when the body carries no points", () => {
    const box = scrubOn({ kind: "series", values: VALUES, source: null, revision: null });
    expect(box.querySelector("[data-scrub-date]")!.textContent).toBe("1 of 3");
  });
});

describe("B9 S01 - all-time return basis", () => {
  const first = SUMMARY.sparkline[0]!;
  const last = SUMMARY.sparkline[SUMMARY.sparkline.length - 1]!;
  const basis = {
    definition_id: "FIRST_LAST_RETAINED_OOS_EQUITY_V1",
    scope: "RETAINED_OOS_OBSERVATIONS",
    first_at_utc_ms: first.at_utc_ms,
    last_at_utc_ms: last.at_utc_ms,
    start_equity: first.value,
    end_equity: last.value,
  };
  const withBlock = (block: unknown) => ({ ...base.items[0], analytics_all_time: block }) as unknown as RunLibraryItem;

  it("labels the return with the served basis, titled with the served definition", () => {
    const box = draw(withBlock({ ...SUMMARY, return_basis: basis }));
    const note = box.querySelector<HTMLElement>('[data-all-time-cell="return"] [data-return-basis]')!;
    expect(note.textContent).toContain("first→last");
    expect(note.getAttribute("title")).toContain("FIRST_LAST_RETAINED_OOS_EQUITY_V1");
    expect(note.getAttribute("title")).toContain("not the last-30D return");
    expect(box.querySelector('[data-all-time-cell="return"]')!.textContent).toContain("+13.94%");
  });

  it("is baseline-identical when return_basis is absent or malformed", () => {
    const absent = draw(withBlock(SUMMARY));
    expect(absent.querySelector("[data-return-basis]")).toBeNull();
    cleanup();
    const bad = readAllTime(withBlock({ ...SUMMARY, return_basis: { definition_id: 1 } }));
    expect(bad.kind === "summary" && bad.summary.return_basis).toBeFalsy();
  });
});
