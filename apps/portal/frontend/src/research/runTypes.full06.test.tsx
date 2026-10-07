/** FULL-06 expansion: run types per Alpha version, native recipe words, and the recipe's own trial budget. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry } from "./alphaImportClient";
import { trialBudgetProblem, type ProfilePins } from "./dataDeclaration";
import { clockWords, nativeLines, routeWord } from "./nativeFacts";
import { RunTypePicker } from "./RunTypePicker";
import { recipesFromSetup } from "./runRecipes";
import { FIXED_OPTIONS } from "./runSetup.s02.test";
import type { SetupProfile } from "./setupClient";
import { profilePinsFromSetup } from "./useRunSetup";
import { runTypesFrom } from "./useRunTypes";

afterEach(cleanup);

const entry = (label: string, at: number): RegistryEntry => ({ alpha_id: "a", alpha_version_id: `av_${label}`, version_label: `av_${label}`, lifecycle_state: "ACTIVE", registered_at_utc_ms: at, declaration: { timeframes: ["1h"] } } as unknown as RegistryEntry);

describe("run types", () => {
  const entries = [entry("1_0_0", 1), entry("1_0_1", 2), entry("1_0_2", 3), entry("1_0_3", 4), entry("1_0_9", 9)];
  const probed = new Map([
    ["av_1_0_0", { routes: ["signal_notional"], recipes: 6 }],
    ["av_1_0_1", { routes: ["signal_notional"], recipes: 9 }],
    ["av_1_0_2", { routes: ["pct_equity"], recipes: 9 }],
    ["av_1_0_3", { routes: [] as string[], recipes: 0 }],
    ["av_1_0_9", { routes: ["intrabar_bracket"], recipes: 1 }],
  ]);
  it("groups by route, names the version only where two share a route, hides a version with nothing to run", () => {
    const types = runTypesFrom(probed, entries, "av_1_0_1");
    expect(types.map((type) => type.label)).toEqual(["Notional · 1.0.1", "Notional · 1.0.0", "Percent equity", "Bracket"]);
    expect(types.find((type) => type.versionId === "av_1_0_3")).toBeUndefined();
  });
  it("keeps the version in use even when it has no recipe (so the person sees why)", () => {
    expect(runTypesFrom(probed, entries, "av_1_0_3").some((type) => type.versionId === "av_1_0_3")).toBe(true);
  });
  it("the picker offers a choice only when there is one, and picking another version calls back once", () => {
    const onPick = vi.fn();
    const types = runTypesFrom(probed, entries, "av_1_0_1");
    const { container, rerender } = render(<RunTypePicker types={types} current="av_1_0_1" onPick={onPick} pending={false} />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    (container.querySelector('[data-run-type="av_1_0_2"]') as HTMLElement).click();
    (container.querySelector('[data-run-type="av_1_0_1"]') as HTMLElement).click();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("av_1_0_2");
    rerender(<RunTypePicker types={types.slice(0, 1)} current="av_1_0_1" onPick={onPick} pending={false} />);
    expect(container.querySelector("[data-run-types]")).toBeNull();
  });
});

describe("native recipes", () => {
  const native = (): SetupProfile => ({
    ...structuredClone(FIXED_OPTIONS.profiles[0]!), profile_id: "p10.delta-intrabar-bracket-fixed-1h.v3", execution_route: "intrabar_bracket",
    native_input: {
      schema_version: "research.native-delta-input.v1", adapter_sha256: "a".repeat(64), symbol_policy: "BTC_ETH_SOL_SINGLE_SYMBOL", signal_authority: "PROTECTED_DELTA_CLOSE_ONLY",
      target_notional: "2000", position_unit: "CONTRACT_QUANTITY", execution_clock: "KNOWN_CLOSE_NEXT_BAR_INTRABAR",
      bracket: { stop_fraction: "0.013", take_profit_fraction: "0.026", level_mode: "percent_distance" },
      account: { initial_capital: "20000", leverage: "3", one_way_fee_rate: "0.0005", funding_enabled: false }, optimizer: "NOT_APPLICABLE_FIXED_DELTA_INPUT_NOT_SCALAR_OPTIMIZER",
    },
  } as SetupProfile);
  it("maps the server-owned input and says it in words", () => {
    const pins = profilePinsFromSetup(native());
    expect(pins.nativeInput?.bracket).toEqual({ stopFraction: "0.013", takeProfitFraction: "0.026", levelMode: "percent_distance" });
    expect(routeWord("intrabar_bracket")).toBe("Bracket");
    expect(clockWords("KNOWN_CLOSE_NEXT_BAR_CLOSE")).toBe("known close, executes at the next bar close");
    expect(nativeLines(pins.nativeInput!)).toEqual([
      "known close, executes next bar intrabar",
      "stop 1.3% · take-profit 2.6% (percent distance)",
      "fixed target 2,000 notional (contract quantity)",
      "capital 20,000 · leverage 3× · fee 0.05% per side · funding off",
      "fixed Delta input, one execution — not a scalar optimizer",
    ]);
  });
  it("the recipe is its own card: 'Bracket · native' with the stop, take-profit and clock", () => {
    const [recipe] = recipesFromSetup({ ...structuredClone(FIXED_OPTIONS), profiles: [native()] });
    expect(recipe).toMatchObject({ enabled: true, executionRoute: "intrabar_bracket" });
    expect(recipe!.label).toBe("Bracket · native");
    expect(recipe!.summary).toBe("stop 1.3% · take-profit 2.6% · known close, executes next bar intrabar");
  });
});

describe("trialBudgetProblem", () => {
  const pins = (over: Partial<ProfilePins>): ProfilePins => ({ ...profilePinsFromSetup(FIXED_OPTIONS.profiles[0]!), enabled: true, trials: { min: 2, max: 400, default: 10 }, trialScope: "GLOBAL_STUDY", maxTotalTrials: null, ...over });
  it("says the range, an exact count, and the per-fold total", () => {
    expect(trialBudgetProblem("100", pins({}), null)).toBeNull();
    expect(trialBudgetProblem("1", pins({}), null)).toBe("Trials must be 2–400 for this recipe.");
    expect(trialBudgetProblem("401", pins({}), null)).toBe("Trials must be 2–400 for this recipe.");
    expect(trialBudgetProblem("4", pins({ trials: { min: 3, max: 3, default: 3 } }), null)).toBe("This recipe runs exactly 3 trials.");
    const perFold = pins({ trialScope: "PER_OUTER_FOLD_STUDY", maxTotalTrials: 6400 });
    expect(trialBudgetProblem("400", perFold, 16)).toBeNull();
    expect(trialBudgetProblem("400", perFold, 17)).toBe("400 trials × 17 folds = 6800; this recipe admits 6400 in total. Use fewer trials or fewer folds.");
    expect(trialBudgetProblem("", pins({}), null)).toBeNull();
    expect(trialBudgetProblem("50", pins({ enabled: false }), null)).toBeNull();
  });
});
