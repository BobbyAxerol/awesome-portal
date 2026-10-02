/** EST_S01 - `enriched_analysis_availability` typed absence on the card (generated type + canonical fixture). */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { RunLibrary } from "./RunLibrary";
import { readEnrichmentAbsence, type RunLibraryItem, type RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import type { LibraryFilters } from "./useRunLibrary";

const library = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../../packages/contracts/fixtures/research-enriched-analysis.old-seal-absent.valid.json"),
    "utf8",
  ),
);
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
afterEach(cleanup);

const base = { ...(library.items.find((i) => i.status === "COMPLETED") ?? library.items[0]!) } as RunLibraryItem;
delete (base as { analytics_all_time?: unknown }).analytics_all_time;
delete (base as { enriched_analysis_availability?: unknown }).enriched_analysis_availability;

function mount(item: RunLibraryItem) {
  return render(
    <MemoryRouter>
      <RunLibrary
        filters={EMPTY}
        onFilters={() => {}}
        onToggleSel={() => {}}
        response={{ ...library, items: [item], page: { ...library.page, total_rows: 1, filtered_rows: 1 } }}
        items={[item]}
        state={researchState({ kind: "ok", rowCount: 1 })}
        sparklines={new Map()}
        onVisible={() => {}}
        onLoadNext={() => {}}
        onLoadPrevious={() => {}}
      />
    </MemoryRouter>,
  );
}
const served = (a: unknown) => ({ ...base, enriched_analysis_availability: a }) as RunLibraryItem;

describe("EST_S01 enriched_analysis_availability", () => {
  it("prints the served reason as a typed absence with the code in the tooltip", () => {
    const { container } = mount(served({ state: fixture.state, reason_code: fixture.reason_code }));
    const node = container.querySelector("[data-all-time-absent]")!;
    expect(node.getAttribute("data-all-time-absent")).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
    expect(node.textContent).toBe("all time — not published");
    expect(node.getAttribute("title")).toContain("SEALED_ENRICHMENT_NOT_COMPUTED");
  });
  it("shows the other served code as is (unsealed source)", () => {
    const { container } = mount(served({ state: "NOT_PUBLISHED", reason_code: "SOURCE_EVIDENCE_NOT_SEALED" }));
    expect(container.querySelector("[data-all-time-absent]")?.getAttribute("data-reason-code")).toBe("SOURCE_EVIDENCE_NOT_SEALED");
  });
  it("shows nothing for AVAILABLE or a field that is not served (today's behaviour)", () => {
    expect(mount(served({ state: "AVAILABLE", reason_code: null })).container.querySelector("[data-all-time-absent]")).toBeNull();
    cleanup();
    expect(mount(base).container.querySelector("[data-all-time-absent]")).toBeNull();
  });
  it("reader refuses a malformed absence without inventing a code", () => {
    expect(readEnrichmentAbsence(served({ state: "NOT_PUBLISHED", reason_code: null }))).toBeNull();
    expect(readEnrichmentAbsence(served(undefined))).toBeNull();
  });
  it("a present all-time block wins over the absence line", () => {
    const item = {
      ...base,
      analytics_all_time: { basis: "BROKEN" },
      enriched_analysis_availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_EVIDENCE_NOT_SEALED" },
    } as unknown as RunLibraryItem;
    const { container } = mount(item);
    expect(container.querySelector("[data-all-time-absent]")).toBeNull();
    expect(container.querySelector("[data-all-time-refused]")).not.toBeNull();
  });
});
