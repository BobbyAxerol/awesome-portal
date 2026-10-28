/** The trial strip reads a stopped runtime as a finished trial (QA6 R5-05). */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrialStrip } from "./TrialStrip";

afterEach(cleanup);
const calendar = { started: { kind: "not-published", reasonCode: "X" }, exitReviewOpens: { kind: "not-published", reasonCode: "X" } } as never;

describe("TrialStrip", () => {
  it("says the trial ended, with the instant, instead of 'Trial day 5 of 5', when the runtime stopped", () => {
    render(<TrialStrip trial={{ kind: "day", day: 5, total: 5, ticks: 5, tick: 5 }} calendar={calendar} endedAt="16 Oct 12:04Z" />);
    expect(screen.getByTestId("trial-ended").textContent).toBe("Trial ended 16 Oct 12:04Z");
    expect(document.body.textContent).not.toMatch(/Trial day/);
  });
  it("keeps the day counter while the runtime has not stopped", () => {
    render(<TrialStrip trial={{ kind: "day", day: 5, total: 14, ticks: 14, tick: 5 }} calendar={calendar} />);
    expect(document.body.textContent).toMatch(/Trial day 5 of 14/);
  });
});
