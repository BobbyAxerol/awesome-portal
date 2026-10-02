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
import { EngineAtlas, atlasHash, atlasLocationFromHash, governingStage, sharedAvoidWhen, symbolGutterCh, type AtlasLocation, type AtlasRunCell, type AtlasTab } from "./EngineAtlas";
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
    // F2b: no run means no Evidence Flow to return to, so the way out is the Journey Map.
    expect(crumb.textContent).toBe("Journey Map/Engine Atlas");
    expect(within(crumb).getByRole("link", { name: "Journey Map" }).getAttribute("href")).toBe("/research/quantbt/journey");
    const exits = document.querySelector("[data-atlas-exits]") as HTMLElement;
    expect(within(exits).getByRole("link", { name: /Run Library/ }).getAttribute("href")).toBe("/research/quantbt/runs");
    expect(within(exits).getByRole("link", { name: /New Run/ }).getAttribute("href")).toBe("/research/quantbt/runs/new?step=route");
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
    /* W1: every mode publishes the same absent cert cap, so it is one chip for the tab, with the reason in its tooltip; no card repeats it. */
    expect(card.querySelector('[data-not-published="cert_cap"]')).toBeNull();
    expect(card.querySelector("[data-cert-cap]")).toBeNull();
    expect(document.querySelectorAll("[data-cert-cap]")).toHaveLength(1);
    expect(document.querySelector("[data-cert-cap-shared]")?.getAttribute("title")).toMatch(/certifies an execution route/);
    /* RF-04 + VD-TEXT-01: the five modes share one avoid-when reason, so the
       typed absence is said once under the table — "avoid when — not
       published" — with the server's sentence in its tooltip, not in the flow. */
    const table = document.querySelector("[data-mode-table]") as HTMLElement;
    expect(within(table).queryAllByText(/publishes no avoid-when guidance/)).toHaveLength(0);
    const shared = table.querySelector("[data-avoid-when-shared]") as HTMLElement;
    /* QA S12: the footer line is gone (an empty promise); the typed absence rides the table heading's tooltip. */
    expect(table.querySelectorAll("p")).toHaveLength(0);
    expect(shared.textContent).toBe("when to reach for which mode");
    expect(shared.getAttribute("title")).toMatch(/publishes no avoid-when guidance/);
    expect(table.querySelectorAll('[data-mode-row="mode_1_decay"] td')).toHaveLength(2);
    // No cap is invented from the HiFi's sample letters.
    expect(card.textContent).not.toMatch(/≤ C|\bcap B\b/);
  });

  it("keeps a per-mode avoid-when column when the modes do not share one sentence", () => {
    const modes = DOC.modes.map((mode, index) =>
      index === 0 && mode.facts
        ? { ...mode, facts: { ...mode.facts, avoid_when: { ...mode.facts.avoid_when, reason: "Its own reason." } } }
        : mode,
    );
    expect(sharedAvoidWhen(modes)).toBeNull();
    expect(sharedAvoidWhen(DOC.modes)?.reason).toMatch(/publishes no avoid-when guidance/);
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
  it("draws Rule One in gold, short; the worked example is its tooltip (VD-TEXT-01)", () => {
    view("modes");
    const rule = document.querySelector("[data-rule-one]") as HTMLElement;
    expect(rule.getAttribute("style")).toContain("var(--accent-2)");
    expect(rule.textContent).toContain("claim = mode × schedule, never the mode alone");
    expect(rule.textContent).not.toContain("Click the schedule chips");
    expect(rule.getAttribute("title")).toContain("Click the schedule chips below and watch the claim change.");
    // Rule Two keeps its box (HiFi geometry) but says it in one line; the sentence is the tooltip.
    const two = document.querySelector("[data-rule-two]") as HTMLElement;
    expect(two.textContent).toContain("Execution route is chosen separately");
    expect(two.getAttribute("title")).toMatch(/Two selector layers, never mixed/);
  });

  it("names only mode × schedule pairs the release admits (DQ-10, HiFi copy restored in W4)", () => {
    view("modes");
    const text = (document.querySelector("[data-rule-one]") as HTMLElement).getAttribute("title") ?? "";
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
    // F2b: the sentence is a tooltip; the row keeps the function name and the token.
    const qualifier = document.querySelector('[data-contract="event_lifecycle"] [data-claim-qualifier]') as HTMLElement;
    expect(qualifier.textContent).toMatch(/certify_result_metadata ≠ L\d /);
    expect(qualifier.getAttribute("title")).toContain("the catalog level is the Portal record");
  });

  it("F2b: the status badge tooltip carries walk_forward_status; no new visible text", () => {
    view("routes");
    const badges = [...document.querySelectorAll("[data-route] [data-status-word]")] as HTMLElement[];
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.getAttribute("title")).toMatch(/walk-forward: (supported|partial|not_listed|not published)/);
      expect(badge.textContent).not.toMatch(/walk-forward/);
    }
    const options = document.querySelector('[data-route="options"] [data-status-word]') as HTMLElement;
    expect(options.getAttribute("title")).toContain("DEFERRED · walk-forward: ");
    expect(document.querySelector('[data-route="signal_notional"] [data-route-dot]')?.getAttribute("data-route-dot")).toBe("admitted");
  });

  it("F2b: every mode card links to New Run at the Optimization step", () => {
    view("modes");
    const link = document.querySelector('[data-mode="mode_1_decay"] [data-declare-mode]') as HTMLElement;
    expect(link.getAttribute("href")).toBe("/research/quantbt/runs/new?step=optimization&mode=mode_1_decay&schedule=global");
    expect(link.getAttribute("title")).toContain("mode_1_decay");
    expect(document.querySelectorAll("[data-declare-mode]").length).toBe(document.querySelectorAll("[data-mode]").length);
  });

  it("publishes the release facts a researcher needs before declaring a run", () => {
    view("routes");
    const facts = document.querySelector("[data-release-facts]") as HTMLElement;
    /* E1: an exact integer is grouped, and the 64-character digest is short on
       screen with the whole value still carried for a reader who needs it. */
    expect(facts.textContent).toContain("trial ceiling4,000");
    expect(facts.textContent).toContain("p10.fixed-qualification.v1");
    const digest = facts.querySelector("[data-config-digest]") as HTMLElement;
    expect(digest.getAttribute("data-config-digest")).toBe(DOC.current_release.config_digest);
    expect(digest.getAttribute("title")).toBe(DOC.current_release.config_digest);
    expect(digest.textContent).toBe(DOC.current_release.config_digest!.slice(0, 8));
    expect(facts.querySelector("[data-preflight-limits]")?.textContent).toContain("cpu 86,400 s");
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
    expect(card.querySelector("h2")?.textContent).toBe("execution routes");
    expect(card.textContent).not.toMatch(/not a defect|not aspiration/);
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

  it("12-6 claims: the HiFi's card and cert word; no 'rules of this screen' footer on any tab (VD-TEXT-01)", () => {
    for (const tab of ["modes", "routes", "claims"] as const) {
      view(tab);
      expect(document.querySelectorAll("[data-screen-rules]"), tab).toHaveLength(0);
      expect(document.body.textContent, tab).not.toMatch(/rules of this screen|the UI never composes/);
      cleanup();
    }
    view("claims");
    expect(document.querySelector('[data-tab-card="claims"] h2')?.textContent).toBe("claims by contract");
    const claim = DOC.claims.find((item) => item.qualifier)!;
    expect(document.querySelector(`[data-contract="${claim.contract_id}"]`)?.textContent).toContain(`${claim.engine_certification} · ${claim.qualifier!.level_name}`);
    expect(document.querySelector('[data-tab-card="claims"]')?.textContent).toContain("certificate = min(engine cert, methodology cap, artifact completeness)");
  });
});

describe("RF-04 — S12 density against the HiFi, and what is honestly bigger", () => {
  it("sizes the symbol gutter from the symbols the manifest publishes, and drops it when they stop fitting", () => {
    /* The HiFi's sample symbols are names; a 140 px gutter fits them. */
    expect(symbolGutterCh([{ symbol: "S_OOS" }, { symbol: "std_decay" }])).toBe(23);
    expect(symbolGutterCh([{ symbol: "d_k = is_sharpe_k - oos_sharpe_k" }])).toBe(32);
    /* QuantBT 1.1.1 publishes whole expressions; past the cap the gutter stops
       paying for itself and the term stacks instead. */
    expect(symbolGutterCh([{ symbol: "plateau_score = q + plateau_median_weight * median - plateau_std_penalty * std + plateau_size_bonus * log1p(n)" }])).toBeNull();
  });

  it("uses the gutter for name-shaped symbols and stacks expression-shaped ones", () => {
    view("modes");
    const short = document.querySelector('[data-mode="mode_1_decay"] [data-objective-term-table]') as HTMLElement;
    expect([...short.children].every((row) => row.getAttribute("data-term-layout") === "gutter")).toBe(true);
    const long = document.querySelector('[data-mode="mode_4_is_only_robust"] [data-objective-term-table]') as HTMLElement;
    expect([...long.children].every((row) => row.getAttribute("data-term-layout") === "stacked")).toBe(true);
  });

  it("names the cap it applies and serves every term the manifest published", () => {
    view("modes");
    for (const mode of DOC.modes) {
      const objective = mode.facts?.objective;
      const published = objective && "terms" in objective ? (objective.terms ?? []) : [];
      if (published.length === 0) continue;
      const card = document.querySelector(`[data-mode="${mode.mode_id}"]`) as HTMLElement;
      const shown = card.querySelectorAll("[data-objective-term-table] [data-objective-term]");
      const hidden = card.querySelectorAll("[data-objective-term-table-more] [data-objective-term]");
      /* Never a silent slice: shown + hidden is everything the engine served. */
      expect(shown.length + hidden.length, mode.mode_id).toBe(published.length);
      /* And the summary says what it caps, in the open — or that nothing is capped. */
      expect(card.querySelector("[data-objective-more] summary")?.textContent, mode.mode_id).toContain(
        hidden.length > 0 ? `${shown.length} of ${published.length} terms` : `all ${published.length} terms shown`,
      );
    }
  });

  it("says when_to_use once — in the table the HiFi keeps it in, not also in the card", () => {
    view("modes");
    for (const mode of DOC.modes) {
      if (!mode.when_to_use) continue;
      expect(screen.getAllByText(mode.when_to_use), mode.mode_id).toHaveLength(1);
      expect((document.querySelector(`[data-mode-row="${mode.mode_id}"]`) as HTMLElement).textContent).toContain(mode.when_to_use);
    }
  });

  it("keeps the governing stage on the column's label row, not on a line of its own", () => {
    view("modes");
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    const label = card.querySelector('[data-mode-column="objective"] > span:first-child') as HTMLElement;
    expect(label.textContent).toContain("objective — Stage 2 opens every term");
    expect(label.querySelector("[data-governing-stage]")?.getAttribute("data-governing-stage")).toBe("oos_candidate_selection");
    expect(label.textContent).toContain("maximize");
    /* The lead block is the formula alone. */
    expect((card.querySelector("[data-objective-lead]") as HTMLElement).children).toHaveLength(1);
  });

  it("puts the release facts on the tab row rather than in a band of its own", () => {
    view("modes");
    const tablist = document.querySelector('[role="tablist"]') as HTMLElement;
    const facts = document.querySelector("[data-release-facts]") as HTMLElement;
    expect(facts.parentElement).toBe(tablist.parentElement);
    expect((facts as HTMLDetailsElement).open).toBe(false);
  });
});
