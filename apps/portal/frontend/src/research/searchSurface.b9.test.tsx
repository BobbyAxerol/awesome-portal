/**
 * B8/B9 · S06 — a surface point carries its own exact parameters.
 *
 * The surface is the published canonical fixture; the optional `parameters`
 * on points are added by a typed builder (generated `SurfacePoint` schema).
 * The ledger page is deliberately empty: the tooltip must not depend on it.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SurfaceScatter, pointParameters } from "./SearchSurface";
import type { CurrentSourceSearch } from "./searchClient";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const SEARCH = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;
const SURFACE = SEARCH.surface!;

function withParameters(): typeof SURFACE {
  const surface = structuredClone(SURFACE);
  surface.points = surface.points.map((point) => ({
    ...point,
    parameters: Object.fromEntries(surface.axes.map((axis) => [axis, `${point.source_ordinal}.2400000000000004`])),
  }));
  return surface;
}

function mount(surface: typeof SURFACE, ledger: (id: string) => Record<string, string> | undefined) {
  return render(<SurfaceScatter surface={surface} parametersOf={ledger} schedule="global" pick={null} onPick={() => undefined} />);
}

describe("S06 point parameters", () => {
  it("a point's tooltip reads its own parameters when the ledger page holds none of them", () => {
    const surface = withParameters();
    const { container } = mount(surface, () => undefined);
    const first = container.querySelector("[data-surface-point]") as HTMLElement;
    const point = surface.points.find((candidate) => candidate.trial_id === first.getAttribute("data-surface-point"))!;
    expect(first.getAttribute("data-params-source")).toBe("point");
    expect(first.getAttribute("data-source-ordinal")).toBe(String(point.source_ordinal));
    expect(first.getAttribute("title")).not.toContain("not published");
    expect(first.getAttribute("title")).toContain(`${point.source_ordinal}.24`);
  });

  it("the point wins over a (mismatched) ledger row; an older body falls back to the ledger, then to a typed 'not published'", () => {
    const surface = withParameters();
    const point = surface.points[0];
    expect(pointParameters(point, () => ({ [surface.axes[0]]: "ledger" })).source).toBe("point");
    const { parameters: _drop, ...legacy } = point;
    expect(pointParameters(legacy as typeof point, () => ({ a: "1" }))).toEqual({ parameters: { a: "1" }, source: "ledger" });
    expect(pointParameters(legacy as typeof point, () => undefined)).toEqual({ parameters: undefined, source: "none" });
  });

  it("display rounding is title-only: the exact string stays on the point", () => {
    const surface = withParameters();
    const point = surface.points[0];
    const exact = Object.values(point.parameters!)[0];
    expect(exact).toBe(`${point.source_ordinal}.2400000000000004`);
    expect(Object.values(pointParameters(point, () => undefined).parameters!)[0]).not.toBe(exact);
  });
});
