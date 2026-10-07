/**
 * Native route result (S04), the S08 native wording, and the S06 null-objective guard.
 * The canonical fixture is the served `research.native-route-result.v1`; typed fields are patched
 * for NOT_PUBLISHED costs and null counts.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { NativeExecutionPanel, type NativeExecution } from "./NativeExecutionPanel";
import { NATIVE_REPLAY_NOTE, isNativeReplayRoute } from "./ExecuteDetail";
import { SurfaceProgression, SurfaceScatter } from "./SearchSurface";
import type { CurrentSourceSearch } from "./searchClient";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const NATIVE = JSON.parse(readFileSync(join(FIXTURES, "research-native-route-result.valid.json"), "utf8")) as NativeExecution;
const SEARCH = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;

const fact = (container: HTMLElement, id: string) => container.querySelector(`[data-native-fact="${id}"]`) as HTMLElement;

describe("S04 native execution panel", () => {
  it("renders nothing for a non-native run", () => {
    expect(render(<NativeExecutionPanel native={undefined} />).container.firstChild).toBeNull();
    expect(render(<NativeExecutionPanel native={null} />).container.firstChild).toBeNull();
  });

  it("reads the canonical fixture in words and keeps a served zero a zero", () => {
    const { container } = render(<NativeExecutionPanel native={NATIVE} />);
    expect(fact(container, "route").textContent).toContain("Reactive");
    expect(fact(container, "clock").textContent).toContain("known close, executes next-bar close");
    expect(fact(container, "authority").textContent).toContain("engine accounting, not a Portal P&L");
    expect(fact(container, "unit").textContent).toContain("contract quantity");
    expect(fact(container, "unit").textContent).toContain("2000");
    expect(fact(container, "fees").textContent).toBe("fees0");
    expect(fact(container, "fills").textContent).toContain("0");
    expect(fact(container, "fills").textContent).not.toContain("not published");
    expect(fact(container, "scope").textContent).toContain("full child tape");
    expect(fact(container, "replay").textContent).toContain("retained engine audit — not broker events");
    expect(fact(container, "optimizer").textContent).toContain("not applicable — fixed input, not a scalar optimizer");
  });

  it("says not published for NOT_PUBLISHED funding and a null orders count, never 0", () => {
    const { container } = render(<NativeExecutionPanel native={NATIVE} />);
    const funding = fact(container, "funding");
    expect(funding.textContent).toContain("not published");
    expect(funding.textContent).not.toMatch(/\b0\b/);
    expect(funding.querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe("NATIVE_RESULT_SERIES_NOT_PUBLISHED");
    const orders = fact(container, "orders");
    expect(orders.textContent).toContain("not published");
    expect(orders.textContent).not.toMatch(/\b0\b/);
  });

  it("prints an AVAILABLE decimal exactly as served and a null fills count as not published", () => {
    const patched = {
      ...NATIVE,
      execution_route: "intrabar_bracket",
      input_protocol: "DELTA_CLOSE_BRACKET_INTENTS_V1",
      clock: "KNOWN_CLOSE_NEXT_BAR_INTRABAR",
      fees: { state: "AVAILABLE", total: "12.3400", reason_code: null },
      funding: { state: "AVAILABLE", total: "0", reason_code: null },
      fills_count: null,
      orders_count: 0,
    } as unknown as NativeExecution;
    const { container } = render(<NativeExecutionPanel native={patched} />);
    expect(fact(container, "route").textContent).toContain("Bracket");
    expect(fact(container, "clock").textContent).toContain("known close, executes next bar intrabar");
    expect(fact(container, "fees").textContent).toBe("fees12.3400");
    expect(fact(container, "funding").textContent).toBe("funding0");
    expect(fact(container, "fills").textContent).toContain("not published");
    expect(fact(container, "orders").textContent).toBe("orders0");
  });

  it("NOT_PUBLISHED fees show not published, not a zero or a dash", () => {
    const patched = { ...NATIVE, fees: { state: "NOT_PUBLISHED", total: null, reason_code: "NATIVE_RESULT_SERIES_NOT_PUBLISHED" } } as NativeExecution;
    const { container } = render(<NativeExecutionPanel native={patched} />);
    expect(fact(container, "fees").textContent).toContain("not published");
    expect(fact(container, "fees").textContent).not.toMatch(/\b0\b|–/);
  });
});

describe("S08 native replay wording", () => {
  it("names the three native routes and nothing else", () => {
    expect(isNativeReplayRoute("intrabar_bracket")).toBe(true);
    expect(isNativeReplayRoute("reactive")).toBe(true);
    expect(isNativeReplayRoute("event_driven")).toBe(true);
    expect(isNativeReplayRoute("signal_notional")).toBe(false);
    expect(isNativeReplayRoute(null)).toBe(false);
    expect(NATIVE_REPLAY_NOTE).toMatch(/OOS equity sample/);
    expect(NATIVE_REPLAY_NOTE).toMatch(/not a broker lifecycle replay/);
  });
});

describe("S06 pruned trial with a null objective", () => {
  const pruned = () => {
    const surface = structuredClone(SEARCH.surface!);
    surface.points = surface.points.map((point, index) =>
      index === 0 ? { ...point, state: "PRUNED" as const, objective: null, objective_bucket: null, best_so_far: null } : point,
    );
    return surface;
  };

  it("the scatter draws the point hollow, says not published and keeps the point and θ*", () => {
    const surface = pruned();
    const first = surface.points[0]!;
    const { container } = render(<SurfaceScatter surface={surface} parametersOf={() => undefined} schedule="global" pick={null} onPick={() => undefined} />);
    expect(container.textContent).not.toMatch(/NaN|null/);
    const dot = container.querySelector(`[data-surface-point="${first.trial_id}"]`) as HTMLElement | null;
    if (dot) expect(dot.getAttribute("data-point-bucket")).toBe("");
    if (surface.selected_trial_id) expect(container.querySelector(`[data-surface-point="${surface.selected_trial_id}"]`)).not.toBeNull();
  });

  it("progression draws no dot for a null objective, and a null ramp end places nothing at 0", () => {
    const surface = pruned();
    const first = surface.points[0]!;
    const view = render(<SurfaceProgression surface={surface} declared={{ parameters: [] } as never} prunedCount={1} />);
    expect(view.container.querySelector(`[data-progression-trial="${first.trial_id}"]`)).toBeNull();
    expect(view.container.textContent).not.toMatch(/NaN|null/);
    view.unmount();
    const flat = structuredClone(surface);
    flat.objective_ramp = { ...flat.objective_ramp, minimum: null, maximum: null };
    const flatView = render(<SurfaceProgression surface={flat} declared={{ parameters: [] } as never} prunedCount={1} />);
    expect(flatView.container.querySelectorAll("[data-progression-trial]").length).toBe(0);
  });

  it("the sampled caption names the served point limit", () => {
    const surface = pruned();
    surface.sampling = "STRIDE_KEEPING_SELECTED_AND_BEST_V1";
    const { container } = render(<SurfaceScatter surface={surface} parametersOf={() => undefined} schedule="global" pick={null} onPick={() => undefined} />);
    expect(container.querySelector("[data-surface-caption]")?.textContent).toContain(`sampled ≤${surface.point_limit} of ${surface.source_trial_count}`);
  });
});
