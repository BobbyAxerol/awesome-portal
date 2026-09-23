/**
 * RF02-F1 · Screen 12 against spec 12, rendered from the manifest-generated
 * Atlas fixture (the same document the Research foundation read returns).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasDocument } from "./atlas";
import { EngineAtlas, atlasHash, atlasLocationFromHash, type AtlasLocation, type AtlasTab } from "./EngineAtlas";
import { formulaToTex } from "./Formula";
import { researchState } from "./state";

afterEach(cleanup);

const DOC = (
  JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/atlas.json"), "utf8")) as { atlas: AtlasDocument }
).atlas;

function view(tab: AtlasTab, location: Partial<Omit<AtlasLocation, "tab">> = {}, onLocationChange = vi.fn()) {
  render(
    <MemoryRouter>
      <EngineAtlas
        doc={DOC}
        state={researchState({ kind: "ok", rowCount: 1 })}
        tab={tab}
        onTabChange={vi.fn()}
        location={{ mode: null, schedule: null, route: null, run: null, ...location }}
        onLocationChange={onLocationChange}
      />
    </MemoryRouter>,
  );
  return onLocationChange;
}

describe("spec 12 T01 — three verbatim tabs and the full hash", () => {
  it("round-trips tab, mode, schedule, route and run", () => {
    const location: AtlasLocation = { tab: "modes", mode: "mode_1_decay", schedule: "per_fold_decay", route: "signal_notional", run: "R-1" };
    expect(atlasHash(location)).toBe("#tab=modes&mode=mode_1_decay&schedule=per_fold_decay&route=signal_notional&run=R-1");
    expect(atlasLocationFromHash(atlasHash(location))).toEqual(location);
    // A value that is not an identifier is not carried.
    expect(atlasLocationFromHash("#tab=routes&mode=%3Cscript%3E").mode).toBeNull();
  });

  it("names the tabs as the spec does and draws the breadcrumb", () => {
    view("modes");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["WFO modes", "Execution routes", "Claims by contract"]);
    const crumb = document.querySelector("[data-breadcrumb]") as HTMLElement;
    expect(crumb.textContent).toBe("Evidence Flow/Engine Atlas");
    // No run: the crumb names Evidence Flow without pretending to link.
    expect(within(crumb).queryByRole("link")).toBeNull();
    cleanup();
    view("modes", { run: "R-WFO-118" });
    expect(within(document.querySelector("[data-breadcrumb]") as HTMLElement).getByRole("link", { name: "Evidence Flow" }).getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/evidence",
    );
  });
});

describe("spec 12 §2 — the claim comes from mode × schedule", () => {
  it("changes the claim when a schedule chip is clicked, and reports it to the hash", () => {
    const onLocationChange = view("modes");
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    expect(card.querySelector("[data-claim]")?.textContent).toBe("not_causal_multi_fold_global_calibration");
    fireEvent.click(within(card).getByRole("button", { name: /per_fold_decay/ }));
    expect(card.querySelector("[data-claim]")?.textContent).toBe("selection_adjusted_outer_oos");
    expect(card.querySelector('[data-oos-use="USED"]')).toBeTruthy();
    expect(onLocationChange).toHaveBeenCalledWith({ mode: "mode_1_decay", schedule: "per_fold_decay" });
  });

  it("strikes through a schedule the mode does not list, never hides it", () => {
    view("modes");
    const card = document.querySelector('[data-mode="mode_2_sbb"]') as HTMLElement;
    expect(card.querySelector('[data-schedule-invalid="per_fold_causal"]')).toBeTruthy();
    expect(card.querySelector('[data-schedule-invalid="per_fold_decay"]')).toBeTruthy();
    expect(card.querySelectorAll("[data-schedule]")).toHaveLength(1);
  });

  it("shows a cert cap and avoid-when the source does not publish as not published, with the reason", () => {
    view("modes");
    const card = document.querySelector('[data-mode="mode_4_is_only_robust"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /per_fold_causal/ }));
    expect(card.querySelector("[data-claim]")?.textContent).toBe("strict_outer_oos_after_frozen_selection");
    expect(card.querySelector('[data-not-published="cert_cap"]')?.textContent).toMatch(/certifies an execution route/);
    const table = document.querySelector("[data-mode-table]") as HTMLElement;
    expect(within(table).getAllByText(/publishes no avoid-when guidance/)).toHaveLength(5);
    // No cap is invented from the HiFi's sample letters.
    expect(card.textContent).not.toMatch(/≤ C|\bcap B\b/);
  });

  it("cites the pinned source of every fact it shows", () => {
    view("modes");
    const sources = [...document.querySelectorAll("[data-fact-source]")].map((node) => node.textContent);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((text) => /quantbt\/[a-z_/]+\.py:\d+-\d+/.test(text ?? ""))).toBe(true);
  });
});

describe("spec 12 T02 — the objective, typeset with a mono fallback", () => {
  it("maps the engine formula text without interpreting it", () => {
    expect(formulaToTex("mean_oos_sharpe - candidate_decay_lambda * std_decay - candidate_decay_gamma * max(0, mean_decay)")).toBe(
      "\\texttt{mean\\_oos\\_sharpe} - \\texttt{candidate\\_decay\\_lambda} \\cdot \\texttt{std\\_decay} - \\texttt{candidate\\_decay\\_gamma} \\cdot \\max ( 0 ,\\, \\texttt{mean\\_decay} )",
    );
    expect(formulaToTex("x ≥ y")).toBeNull();
  });

  it("shows the formula text before KaTeX arrives, and the release coefficients", () => {
    view("modes");
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    const formulas = card.querySelectorAll("[data-formula-state]");
    expect(formulas.length).toBe(3);
    expect(card.textContent).toContain("mean_oos_sharpe - candidate_decay_lambda * std_decay");
    const terms = card.querySelector("[data-objective-terms]") as HTMLElement;
    expect(terms.textContent).toContain("decay_lambda0.5");
    expect(terms.textContent).toContain("candidate_decay_lambdaunset");
  });
});

describe("spec 12 T03 — deep links carry mode and schedule", () => {
  it("opens Search & Selection for the run it came from, with the pair", () => {
    view("modes", { run: "R-WFO-118" });
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /per_fold_decay/ }));
    expect(card.querySelector('[data-open-search="mode_1_decay"]')?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/search#stage=search&mode=mode_1_decay&schedule=per_fold_decay",
    );
  });

  it("without a run, finds runs in that mode instead of inventing one", () => {
    view("modes");
    expect(document.querySelector('[data-find-runs="mode_3_flat_minima"]')?.getAttribute("href")).toBe(
      "/research/quantbt/runs?mode=mode_3_flat_minima",
    );
    expect(document.querySelector("[data-open-search]")).toBeNull();
  });
});

describe("Q4 / D-4 and the release facts panel", () => {
  it("draws Rule One in gold, verbatim", () => {
    view("modes");
    const rule = document.querySelector("[data-rule-one]") as HTMLElement;
    expect(rule.getAttribute("style")).toContain("var(--accent-2)");
    expect(rule.textContent).toContain("Click the schedule chips below and watch the claim change.");
  });

  it("names only mode × schedule pairs the release admits (DQ-10)", () => {
    view("modes");
    const text = (document.querySelector("[data-rule-one]") as HTMLElement).textContent ?? "";
    const mode1 = DOC.modes.find((mode) => mode.mode_id === "mode_1_decay")!;
    const valid = mode1.facts!.schedules.map((fact) => fact.schedule);
    for (const schedule of ["per_fold_decay", "global"]) {
      expect(text).toContain(schedule);
      expect(valid).toContain(schedule);
    }
    expect(text).not.toContain("per_fold_causal");
  });

  it("publishes the release facts a researcher needs before declaring a run", () => {
    view("routes");
    const facts = document.querySelector("[data-release-facts]") as HTMLElement;
    expect(facts.textContent).toContain(`trial ceiling${DOC.current_release.trial_ceiling}`);
    expect(facts.textContent).toContain("p10.fixed-qualification.v1");
    expect(facts.textContent).toContain(DOC.current_release.config_digest!);
    expect(facts.querySelectorAll("[data-default-group]")).toHaveLength(4);
    expect(facts.querySelector("[data-walk-forward-options]")?.textContent).toContain("rolling (not admitted)");
  });

  it("selects a route into the hash from its row", () => {
    const onLocationChange = view("routes", { route: "signal_notional" });
    expect(document.querySelector('[data-route="signal_notional"]')?.getAttribute("aria-current")).toBe("true");
    fireEvent.click(document.querySelector('[data-route-link="intrabar_bracket"]') as HTMLElement);
    expect(onLocationChange).toHaveBeenCalledWith({ route: "intrabar_bracket" });
  });
});
