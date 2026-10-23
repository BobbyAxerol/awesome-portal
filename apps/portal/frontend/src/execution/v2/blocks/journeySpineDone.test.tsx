/**
 * JourneySpine, completed stages (WP-C): a done running stage keeps the facts the lifecycle read published (days in stage, the criteria
 * meter, the exit line), a done gate says who approved, and a done stage with nothing published still needs the one note.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JourneySpine } from "./JourneySpine";

afterEach(cleanup);
const node = (id: string) => within(screen.getByRole("list", { name: "Lifecycle" })).getAllByRole("listitem").find((li) => li.getAttribute("data-stage") === id)!;

describe("completed stages", () => {
  it("a done running stage prints days, criteria and the exit line; a done gate prints Approved, the date and who", () => {
    render(
      <JourneySpine
        current="live"
        stages={{
          r1: { outcome: "done", decidedBy: "bjones", line: "02 Jul" },
          paper: { outcome: "done", daysInStage: 40, criteria: { met: 7, total: 7 }, decidedBy: "bjones", line: "Exit 17 Sep · bjones" },
          live: { daysInStage: 6, decider: "Manager" },
        }}
      />,
    );
    expect(within(node("r1")).getByText("Approved")).toBeTruthy();
    expect(within(node("r1")).getByText("02 Jul")).toBeTruthy();
    expect(within(node("r1")).getByText("By bjones")).toBeTruthy();
    expect(within(node("paper")).getByText(/40/)).toBeTruthy();
    expect(within(node("paper")).getByText("7 of 7 criteria met")).toBeTruthy();
    expect(within(node("paper")).getByText("Exit 17 Sep · bjones")).toBeTruthy();
    expect(within(node("paper")).queryByText(/^By /)).toBeNull();
    expect(within(node("live")).getByText("Decides: Manager")).toBeTruthy();
  });

  it("a done stage that published no days, criteria or exit line still raises the one note under the spine", () => {
    render(<JourneySpine current="live" stages={{ paper: { outcome: "done" }, live: { daysInStage: 3, decider: "Manager" } }} />);
    expect(screen.getByText(/Days in stage, gate criteria and decider/)).toBeTruthy();
  });

  it("every card that published its facts leaves no note", () => {
    render(
      <JourneySpine
        current="live"
        stages={{
          r1: { outcome: "done", decidedBy: "a", line: "01 Jan" }, r2: { outcome: "done", decidedBy: "a", line: "02 Jan" },
          paper: { outcome: "done", daysInStage: 1, criteria: { met: 1, total: 1 }, line: "Exit 03 Jan · a" },
          sandbox: { outcome: "done", daysInStage: 1, criteria: { met: 1, total: 1 }, line: "Exit 04 Jan · a" },
          canary: { outcome: "done", daysInStage: 1, criteria: { met: 1, total: 1 }, line: "Exit 05 Jan · a" },
          live: { daysInStage: 1, decider: "Manager" },
        }}
      />,
    );
    expect(screen.queryByText(/Days in stage, gate criteria and decider/)).toBeNull();
  });
});
