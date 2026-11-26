// @vitest-environment node
/**
 * The header total comes from the server's own words. The body here is the real response shape (replica, Paper OKX, trimmed to three
 * orders): the exact-query scalars say 2000 / 2000 and the orders panel's coverage says the same.
 */
import { describe, expect, it } from "vitest";

import { readProfileEnvelope } from "../../../api/profileRead";
import real from "./blotterRealShape.fixture.json";
import { readBlotter } from "./blotterModel";

const read = (patch: (wire: any) => void = () => {}) => {
  const wire = structuredClone(real) as any;
  patch(wire);
  return readBlotter(readProfileEnvelope(wire)!);
};

describe("Blotter totals on the real response shape", () => {
  it("states the server's exact and filtered totals", () => {
    const page = read();
    expect(page.exactTotal).toBe(2000);
    expect(page.filteredTotal).toBe(2000);
    expect(page.orders).toHaveLength(3);
  });

  it("falls back to the orders panel's stated totals when the scalars are absent, never to the page length", () => {
    const page = read((wire) => { delete wire.data.exact_total; delete wire.data.filtered_total; });
    expect(page.exactTotal).toBe(2000);
    expect(page.filteredTotal).toBe(2000);
  });

  it("states no total when neither the scalars nor the panel carry one", () => {
    const page = read((wire) => { delete wire.data.exact_total; delete wire.data.filtered_total; wire.panels.orders.coverage.source_total = null; wire.panels.orders.coverage.filtered_total = null; });
    expect(page.exactTotal).toBeNull();
    expect(page.filteredTotal).toBeNull();
  });
});
