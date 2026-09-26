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
import { EngineAtlas, atlasHash, atlasLocationFromHash, governingStage, type AtlasLocation, type AtlasRunCell, type AtlasTab } from "./EngineAtlas";
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
    expect(document.querySelector("[data-header-search]")?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/search#stage=search",
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
    /* D9: the release coefficients as one mono line (name value · …), the notes under the disclosure. */
    expect(terms.textContent).toMatch(/(^|· )decay_lambda\u00a00\.5( ·|$)/);
    expect(terms.textContent).toMatch(/candidate_decay_lambda\u00a0unset/);
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

  it("names only mode × schedule pairs the release admits (DQ-10, HiFi copy restored in W4)", () => {
    view("modes");
    const text = (document.querySelector("[data-rule-one]") as HTMLElement).textContent ?? "";
    const mode1 = DOC.modes.find((mode) => mode.mode_id === "mode_1_decay")!;
    const valid = mode1.facts!.schedules.map((fact) => fact.schedule);
    // Every pair the sentence names is a valid pair in the manifest it renders.
    for (const schedule of ["per_fold_causal", "per_fold_decay"]) {
      expect(text).toContain(schedule);
      expect(valid).toContain(schedule);
    }
  });

  it("W4 CG-P04-04/06/07: OOS state chips, route engine facts, qualifiers, terms and weights", () => {
    view("modes");
    expect(document.querySelector('[data-mode="mode_1_decay"] [data-oos-state]')?.textContent).toBe("OOS: retrospective");
    fireEvent.click(document.querySelector('[data-mode="mode_1_decay"] [data-schedule="per_fold_causal"]') as HTMLElement);
    expect(document.querySelector('[data-mode="mode_1_decay"] [data-oos-state]')?.textContent).toBe("OOS: withheld until Stage 4");
    expect(document.querySelector('[data-mode="mode_1_decay"] [data-required-fields]')?.textContent).toContain("walk_forward.inner");
    expect(document.querySelector('[data-mode="mode_5_full_robust"] [data-oos-state]')?.textContent).toBe("no held-out window — train = test");
    expect(document.querySelectorAll('[data-mode="mode_4_is_only_robust"] [data-objective-weight]').length).toBeGreaterThan(5);
    expect(document.querySelector('[data-mode="mode_1_decay"] [data-objective-term-table]')?.textContent).toContain("std_decay");
    cleanup();
    view("routes");
    expect(document.querySelector('[data-route="arbitrage"] [data-status-word]')?.textContent).toBe("6/9");
    expect(document.querySelectorAll('[data-route="arbitrage"] [data-support-row]')).toHaveLength(9);
    expect(document.querySelector('[data-route="options"] [data-status-word]')?.textContent).toBe("DEFERRED");
    expect(document.querySelector('[data-route="fill_replay"] [data-route-method]')?.getAttribute("data-route-method")).toBe("tape");
    expect(document.querySelector('[data-route="signal_notional"] [data-declare-route]')?.getAttribute("href")).toBe("/research/quantbt/runs/new?step=route&route=signal_notional");
    expect(document.querySelector('[data-route="arbitrage"] [data-declare-route]')).toBeNull();
    cleanup();
    view("claims");
    expect(document.querySelector('[data-contract="event_lifecycle"] [data-claim-qualifier]')?.getAttribute("data-claim-qualifier")).toBe("ENGINE_DERIVES_OTHER_LEVEL");
  });

  it("publishes the release facts a researcher needs before declaring a run", () => {
    view("routes");
    const facts = document.querySelector("[data-release-facts]") as HTMLElement;
    expect(facts.textContent).toContain(`trial ceiling${DOC.current_release.trial_ceiling}`);
    expect(facts.textContent).toContain("p10.fixed-qualification.v1");
    expect(facts.textContent).toContain(DOC.current_release.config_digest!);
    expect(facts.querySelectorAll("[data-default-group]")).toHaveLength(4);
    expect(facts.querySelector("[data-walk-forward-options]")?.textContent).toContain("expanding/rolling");
    expect(facts.querySelector("[data-preflight-limits]")?.textContent).toContain("sweep dims 8");
  });

  it("selects a route into the hash from its row", () => {
    const onLocationChange = view("routes", { route: "signal_notional" });
    expect((document.querySelector('[data-route="signal_notional"]') as HTMLElement).style.boxShadow).toBe("inset 3px 0 0 var(--accent)");
    expect(document.querySelector('[data-route="signal_notional"]')?.getAttribute("aria-current")).toBe("true");
    fireEvent.click(document.querySelector('[data-route-link="intrabar_bracket"]') as HTMLElement);
    expect(onLocationChange).toHaveBeenCalledWith({ route: "intrabar_bracket" });
  });
});

describe("E7 / D9 — the HiFi's density (Unified 13.4.1)", () => {
  function viewWithRun(tab: AtlasTab, runCell: AtlasRunCell, location: Partial<Omit<AtlasLocation, "tab">> = {}) {
    render(
      <MemoryRouter>
        <EngineAtlas
          doc={DOC}
          state={researchState({ kind: "ok", rowCount: 1 })}
          tab={tab}
          onTabChange={vi.fn()}
          location={{ mode: null, schedule: null, route: null, run: "rrun_e1fa9e5cae3bcef8f8e38311905a17d5", ...location }}
          onLocationChange={vi.fn()}
          runCell={runCell}
        />
      </MemoryRouter>,
    );
  }

  it("12-1 each mode card has the HiFi's three columns: what it reads · objective · schedule → claim", () => {
    view("modes");
    for (const mode of DOC.modes) {
      const card = document.querySelector(`[data-mode="${mode.mode_id}"]`) as HTMLElement;
      expect([...card.querySelectorAll("[data-mode-column]")].map((column) => column.getAttribute("data-mode-column"))).toEqual(["reads", "objective", "claim"]);
      /* The schedule chips sit in the claim column, not the header (HiFi). */
      expect(card.querySelector("header [data-schedule], header [data-schedule-invalid]")).toBeNull();
      expect(card.querySelector('[data-mode-column="claim"] [data-schedule], [data-mode-column="claim"] [data-schedule-invalid]')).toBeTruthy();
    }
  });

  it("12-2 the stage that governs selection leads; the other stages, weights and sources sit under one closed disclosure", () => {
    view("modes");
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    expect(card.querySelector("[data-objective-lead]")?.getAttribute("data-objective-lead")).toBe("oos_candidate_selection");
    const more = card.querySelector("[data-objective-more]") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more.querySelectorAll("[data-objective-stage]")).toHaveLength(2);
    expect(governingStage([{ stage: "is_search" }])?.stage).toBe("is_search");
    expect(governingStage([{ stage: "is_search" }, { stage: "oos_candidate_selection" }])?.stage).toBe("oos_candidate_selection");
  });

  it("12-3 / 12-8 the run's own mode card carries '← this run'; only it opens that run's Search", () => {
    viewWithRun("modes", { state: "known", mode: "mode_1_decay", schedule: "per_fold_decay" });
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    expect(card.getAttribute("data-this-run")).toBe("true");
    expect(card.querySelector("[data-this-run-marker]")?.textContent).toBe("← this run");
    expect(card.getAttribute("style")).toContain("var(--accent)");
    /* It opens on the run's own schedule. */
    expect(card.querySelector('[data-schedule="per_fold_decay"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(card.querySelector('[data-open-search="mode_1_decay"]')?.getAttribute("href")).toContain("schedule=per_fold_decay");
    expect(document.querySelectorAll("[data-this-run-marker]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-open-search]")).toHaveLength(1);
    expect(document.querySelector('[data-find-runs="mode_2_sbb"]')?.getAttribute("href")).toBe("/research/quantbt/runs?mode=mode_2_sbb");
  });

  it("12-3 a run whose mode is not published, or not a WFO mode, marks no card and says why", () => {
    viewWithRun("modes", { state: "absent", reason: "You don't have access to this in your current workspace, or it doesn't exist." });
    expect(document.querySelector("[data-this-run-marker]")).toBeNull();
    expect(document.querySelector('[data-this-run-absent="absent"]')?.textContent).toContain("not published here");
    cleanup();
    viewWithRun("modes", { state: "known", mode: "fixed", schedule: "none" });
    expect(document.querySelector("[data-this-run-marker]")).toBeNull();
    expect(document.querySelector("[data-this-run-outside]")?.textContent).toContain("fixed × none");
  });

  it("12-5 routes: one card titled as the HiFi, one line per route; axes and engine facts open only on the selected row", () => {
    view("routes", { route: "arbitrage" });
    const card = document.querySelector('[data-tab-card="routes"]') as HTMLElement;
    expect(card.querySelector("h2")?.textContent).toBe("execution routes — support matrix, not aspiration");
    expect(card.querySelector("[data-tab-card-source]")?.textContent).toContain("arbitrage_support_matrix()");
    for (const route of DOC.routes) {
      const detail = document.querySelector(`[data-route-detail="${route.route_id}"]`) as HTMLElement;
      expect(detail.hidden, route.route_id).toBe(route.route_id !== "arbitrage");
    }
    expect(document.querySelector('[data-route-link="arbitrage"]')?.getAttribute("aria-expanded")).toBe("true");
    /* A blocked route's refusal reason is visible in its row, not behind the disclosure. */
    const blocked = DOC.routes.find((route) => route.axes.integration !== "ADAPTER_AVAILABLE")!;
    const reason = document.querySelector(`[data-route-reason="${blocked.route_id}"]`) as HTMLElement;
    expect(reason.closest("[hidden]")).toBeNull();
    expect(reason.textContent).toBe(blocked.reason);
  });

  it("12-6 / 12-7 claims: the HiFi's card and cert word; the screen's rules on every tab", () => {
    for (const tab of ["modes", "routes", "claims"] as const) {
      view(tab);
      expect(document.querySelectorAll("[data-screen-rules]"), tab).toHaveLength(1);
      cleanup();
    }
    view("claims");
    expect(document.querySelector('[data-tab-card="claims"] h2')?.textContent).toBe("claims by contract — two axes, never mixed");
    const claim = DOC.claims.find((item) => item.qualifier)!;
    expect(document.querySelector(`[data-contract="${claim.contract_id}"]`)?.textContent).toContain(`${claim.engine_certification} · ${claim.qualifier!.level_name}`);
    expect(document.querySelector('[data-tab-card="claims"]')?.textContent).toContain("The two chips on the Release Candidate screen carry the axes separately.");
  });
});
