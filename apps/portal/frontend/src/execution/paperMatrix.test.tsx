/**
 * EL-V2-04 state matrix: projection freshness × observation gate. Every cell
 * must say what it is; no cell may render as an empty success.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaperWorkbench } from "./screens/PaperWorkbench";
import { paperWorkbench, GATE_MET } from "./paper.fixtures";
import { vnmWorkbench } from "./vnm.fixtures";
import { paperHandlers } from "./testHandlers";
import type { FreshnessState } from "./contracts";

afterEach(cleanup);

type Gate = "MET" | "UNMET" | "INSUFFICIENT";
const FRESHNESS: FreshnessState[] = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"];
const GATES: Gate[] = ["MET", "UNMET", "INSUFFICIENT"];

function gateOver(gate: Gate) {
  const base = paperWorkbench();
  if (gate === "MET") return GATE_MET;
  if (gate === "UNMET") return { observation: base.observation, unmetCriteria: base.unmetCriteria };
  // INSUFFICIENT: the server has not judged the gate and names no criterion.
  // Silence is not a pass.
  return { observation: { ...base.observation, met: false }, unmetCriteria: [] as string[] };
}

describe.each(FRESHNESS)("freshness %s", (freshness) => {
  it.each(GATES)("× gate %s renders its state and never an empty success", (gate) => {
    const data = paperWorkbench({
      ...gateOver(gate),
      envelope: { ...paperWorkbench().envelope, freshness },
    });
    render(<PaperWorkbench {...paperHandlers()} {...data} />);
    const cta = screen.getByRole("button", { name: /Request Paper Exit Review/ });
    expect(cta).toHaveProperty("disabled", gate !== "MET");
    // The masthead carries the freshness on its own axis.
    expect(screen.getByText(new RegExp(`EXECUTION · ${freshness}`))).toBeTruthy();
    // STALE on a non-calendar venue gets the stale banner; nothing else does.
    const stale = document.querySelector(".exec-paper-stale");
    if (freshness === "STALE") expect(stale).not.toBeNull();
    else expect(stale).toBeNull();
    // A gate the server did not meet never reads as met.
    if (gate !== "MET") expect(screen.queryByText(/Observation gate met/)).toBeNull();
    if (gate === "INSUFFICIENT") expect(cta.getAttribute("title")).toContain("observation gate not met");
    // The chart is real content or an honest state — never an empty frame.
    expect(screen.getByText(/BR-EX-34/)).toBeTruthy();
  });
});

describe("PAUSED comes from the venue calendar, not from the projection", () => {
  it("VNM closed: badge says PAUSED, stale banner absent even when the projection is STALE", () => {
    const data = vnmWorkbench({ envelope: { ...vnmWorkbench().envelope, freshness: "STALE" } });
    render(<PaperWorkbench {...paperHandlers()} {...data} />);
    expect(screen.getByText(/EXECUTION · PAUSED/)).toBeTruthy();
    expect(document.querySelector(".exec-paper-stale")).toBeNull();
    expect(document.querySelector(".exec-paper-calendar")).not.toBeNull();
  });
});
