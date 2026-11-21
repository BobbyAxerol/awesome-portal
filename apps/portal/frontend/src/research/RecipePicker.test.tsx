import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipePicker } from "./RecipePicker";
import { emptyDraft } from "./NewRunRoute";
import { applyRecipe, recipesFromSetup } from "./runRecipes";
import type { SetupOptions, SetupProfile } from "./setupClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const FIXED_OPTIONS = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-run-setup-options.fixed.valid.json"), "utf8")) as SetupOptions;
const FIXED = FIXED_OPTIONS.profiles[0]!;
const variant = (over: Partial<SetupProfile>): SetupProfile => ({ ...structuredClone(FIXED), ...over });
const V1_V2: SetupProfile["requested_spec_versions"] = ["research.requested-spec.v1", "research.requested-spec.v2"];

const WFO = variant({
  profile_id: "wfo.v1", protocol: "advanced", optimization_schedule: "global",
  requested_spec_versions: V1_V2, trial_count: { min: 2, max: 400 }, trial_default: 10,
  seed_policy: "LOCKED", random_seed: 42, fold_bounds: { min: 2, max: 16 },
  frequencies: ["weekly", "monthly"], window_modes: ["expanding", "rolling"], inner_validation: "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
});
const CAUSAL = variant({
  profile_id: "causal.v1", protocol: "advanced", optimization_schedule: "per_fold_causal",
  requested_spec_versions: ["research.requested-spec.v2"], trial_count: { min: 1, max: 50 }, trial_default: 5,
  seed_policy: "REQUIRED", random_seed: null, frequencies: ["monthly"], window_modes: ["rolling"],
  inner_validation: "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",
  inner_constraints: { fold_bounds: { min: 2, max: 4 }, frequencies: ["weekly"], window_modes: ["expanding", "rolling"], train_window_pattern: "^[0-9]+D$" },
} as Partial<SetupProfile>);

function opts(profiles: SetupProfile[], engine: boolean = true): SetupOptions {
  const o = { ...structuredClone(FIXED_OPTIONS), profiles } as SetupOptions;
  if (!engine) delete (o as { engine_options?: unknown }).engine_options;
  return o;
}

afterEach(cleanup);

describe("RecipePicker", () => {
  const rs = recipesFromSetup(opts([FIXED, WFO, CAUSAL]));
  it("radiogroup, selected, recommended tag, closed row, one hint, click picks", () => {
    const onPick = vi.fn();
    const draft = emptyDraft();
    const picked = { ...draft, ...applyRecipe(rs[1]!, draft) };
    render(<RecipePicker recipes={rs} draft={picked} onPick={onPick} />);
    expect(screen.getByRole("radiogroup", { name: "Run recipe" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.querySelectorAll("[data-recipe-recommended]")).toHaveLength(1);
    expect(screen.getAllByText("Pick a recipe, then adjust anything below.")).toHaveLength(1);
    const closed = document.querySelector("[data-recipe-closed]")!;
    expect(closed.textContent).toContain("Not opened yet");
    expect(closed.textContent).toContain("not opened yet");
    expect(closed.querySelector("[role=radio]")).toBeNull();
    fireEvent.click(radios[2]!);
    expect(onPick).toHaveBeenCalledWith(applyRecipe(rs[2]!, picked));
  });
  it("arrows move focus without picking; Home/End wrap", () => {
    const onPick = vi.fn();
    render(<RecipePicker recipes={rs} draft={emptyDraft()} onPick={onPick} />);
    const radios = screen.getAllByRole("radio");
    radios[0]!.focus();
    fireEvent.keyDown(radios[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(radios[1]);
    fireEvent.keyDown(radios[1]!, { key: "ArrowLeft" });
    fireEvent.keyDown(radios[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(radios[2]);
    expect(onPick).not.toHaveBeenCalled();
  });
  it("nothing enabled renders only the reason", () => {
    const none = recipesFromSetup(opts([{ ...FIXED, state: "DISABLED", reason_code: "TIMEFRAME_NOT_ADMITTED" }]));
    const { container } = render(<RecipePicker recipes={none} draft={emptyDraft()} onPick={vi.fn()} disabledReason="No enabled profile · TIMEFRAME_NOT_ADMITTED" />);
    expect(container.querySelector("[data-recipe-none]")?.textContent).toContain("timeframe not admitted");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});
