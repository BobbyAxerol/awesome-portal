/**
 * F1 · S00 — a journey card behaves by the scope the SERVER declares
 * (CG-S00-AV-01, 2_wiring S00; 400-trial audit §6.2).
 *
 * The descriptor serves `requires_run` and, from revision 4, `requires_alpha`.
 * Before this, the browser recomputed the scope from its own route table: the
 * Alpha version card (`requires_alpha: true`) was drawn as "PICK A RUN", and
 * the Compare card (`requires_run: true`) was a bare link that asked for no
 * run. Every body below is the canonical revision-4 fixture, not a hand-built
 * descriptor.
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { JourneyMap, PICK_ALPHA_BADGE, PICK_RUN_BADGE } from "./JourneyMap";
import type { JourneyCard, JourneyResponse } from "./foundationClient";
import { researchState } from "./state";
import { journeyCardScope, pickRunHref } from "./screenRoutes";

afterEach(cleanup);

function fixture(name: string): JourneyResponse {
  return JSON.parse(
    readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", name), "utf8"),
  ) as JourneyResponse;
}

const V4 = fixture("research-foundation.journey-v4.valid.json");
const V3 = fixture("research-foundation.journey-v3.valid.json");
const cardsOf = (response: JourneyResponse): JourneyCard[] => response.descriptor.phases.flatMap((phase) => phase.cards);

function draw(response: JourneyResponse, runId: string | null = null) {
  render(
    <MemoryRouter>
      <JourneyMap
        descriptor={response.descriptor}
        inspection={null}
        state={researchState({ kind: "ok", rowCount: 1 })}
        runId={runId}
      />
    </MemoryRouter>,
  );
}
const node = (id: string) => document.querySelector(`[data-card="${id}"]`) as HTMLElement;

describe("journeyCardScope reads the served flags", () => {
  it("run beats alpha; alpha without run is alpha; neither is none", () => {
    expect(journeyCardScope({ requires_run: true })).toBe("RUN");
    expect(journeyCardScope({ requires_run: true, requires_alpha: true })).toBe("RUN");
    expect(journeyCardScope({ requires_run: false, requires_alpha: true })).toBe("ALPHA");
    expect(journeyCardScope({ requires_run: false, requires_alpha: false })).toBe("NONE");
    /* A descriptor older than revision 4 does not serve the flag: not declared, not guessed. */
    expect(journeyCardScope({ requires_run: false })).toBe("NONE");
  });

  it("an alpha picker opens the Run Library grouped by Alpha; a run picker does not", () => {
    expect(pickRunHref("alpha_version_legacy", "ALPHA")).toBe("/research/quantbt/runs?to=alpha_version_legacy&group=1");
    expect(pickRunHref("execute_replay")).toBe("/research/quantbt/runs?to=execute_replay");
  });
});

describe("the revision-4 descriptor, drawn", () => {
  it("is revision 4 and serves requires_alpha on exactly the Alpha version card", () => {
    expect(V4.descriptor.revision).toBe(4);
    expect(cardsOf(V4).filter((card) => card.requires_alpha === true).map((card) => card.card_id)).toEqual(["alpha-version"]);
  });

  it("Alpha version: an alpha picker, never a run picker", () => {
    draw(V4);
    const card = node("alpha-version");
    expect(card.getAttribute("data-card-picks-alpha")).toBe("alpha_version_legacy");
    expect(card.getAttribute("data-card-picks-run")).toBeNull();
    expect(card.getAttribute("data-card-unreachable")).toBeNull();
    expect(card.getAttribute("href")).toBe("/research/quantbt/runs?to=alpha_version_legacy&group=1");
    expect(card.textContent).not.toContain(PICK_ALPHA_BADGE);
    expect(card.textContent).toContain("pick an alpha →");
    expect(card.textContent).not.toContain(PICK_RUN_BADGE);
    expect(card.textContent).not.toContain("pick a run");
  });

  it("Compare (served requires_run: true): a run picker, not a bare link", () => {
    draw(V4);
    const compare = cardsOf(V4).find((card) => card.card_id === "compare")!;
    expect(compare.requires_run).toBe(true);
    const card = node("compare");
    expect(card.getAttribute("data-card-picks-run")).toBe("compare_runs");
    expect(card.getAttribute("href")).toBe("/research/quantbt/runs?to=compare_runs");
    expect(card.textContent).not.toContain(PICK_RUN_BADGE);
    expect(card.textContent).toContain("pick a run →");
  });

  it("every AVAILABLE card behaves by its served scope", () => {
    draw(V4);
    for (const served of cardsOf(V4).filter((card) => card.availability === "AVAILABLE")) {
      const drawn = node(served.card_id);
      const scope = journeyCardScope(served);
      expect(drawn.hasAttribute("data-card-picks-run"), `${served.card_id} run picker`).toBe(scope === "RUN");
      expect(drawn.hasAttribute("data-card-picks-alpha"), `${served.card_id} alpha picker`).toBe(scope === "ALPHA");
      expect(drawn.getAttribute("data-card-unreachable"), `${served.card_id} is a dead end`).toBeNull();
    }
  });

  it("a run in hand opens a per-run screen directly, but still asks for an alpha", () => {
    draw(V4, "rrun_1");
    expect(node("split").getAttribute("href")).toBe("/research/quantbt/runs/rrun_1/split");
    expect(node("split").hasAttribute("data-card-picks-run")).toBe(false);
    /* The run id names no alpha version, so the alpha card is still a picker. */
    expect(node("alpha-version").getAttribute("data-card-picks-alpha")).toBe("alpha_version_legacy");
    /* Lineage and Compare live under an Alpha, which a run id alone cannot open. */
    expect(node("attempt-lineage").getAttribute("data-card-picks-run")).toBe("attempt_lineage");
  });
});

describe("a revision-3 descriptor (no requires_alpha)", () => {
  it("does not guess the Alpha version card's scope from its key", () => {
    draw(V3);
    const card = node("alpha-version");
    expect(card.getAttribute("data-card-picks-run")).toBeNull();
    expect(card.getAttribute("data-card-picks-alpha")).toBeNull();
    expect(card.getAttribute("data-card-unreachable")).toBe("NOT ROUTED");
  });
});
