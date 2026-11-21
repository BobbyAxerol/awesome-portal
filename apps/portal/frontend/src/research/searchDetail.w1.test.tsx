/**
 * W1 · G2 — S06 trial label.
 *
 * Search serves only the source's own trial id, so it prints `source N`:
 * never a hash-prefixed id, never `trial N`, never an ordinal computed from it.
 * Data: the published canonical surface fixture (read, not copied).
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SurfaceScatter } from "./SearchSurface";
import type { CurrentSourceSearch } from "./searchClient";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const SEARCH = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;

describe("W1-search trial label", () => {
  it("the legend names θ* and the best in-sample point by source id", () => {
    const { container } = render(<SurfaceScatter surface={SEARCH.surface!} parametersOf={() => undefined} schedule="global" pick={null} onPick={() => undefined} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/θ\* · source \S+/);
    expect(text).toMatch(/best IS · source \S+/);
    expect(text).not.toMatch(/[#]\d/);
    expect(text).not.toMatch(/trial \d/);
  });
});
