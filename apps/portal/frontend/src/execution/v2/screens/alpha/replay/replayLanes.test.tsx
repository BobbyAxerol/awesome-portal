/** The replay lanes (QA3 R2-06 / R2-20): events show when the alpha has them; with none there is one sentence, not an empty band. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { LifeEvent } from "../lifecycleModel";
import { ReplayLanes } from "./ReplayLanes";

afterEach(cleanup);
const at = (iso: string) => Date.parse(iso) as LifeEvent["t"];
const event = (id: string, kind: LifeEvent["kind"], iso: string): LifeEvent => ({ id, kind, t: at(iso), title: id, actor: "bjones" });
const domain = { from: at("2026-10-16T00:00:00Z"), to: at("2026-10-17T12:00:00Z") };

describe("ReplayLanes", () => {
  it("draws the three lanes and counts the events inside the window", () => {
    render(<ReplayLanes events={{ events: [event("a", "incident", "2026-10-16T10:00:00Z"), event("b", "decision", "2026-10-17T01:00:00Z")], missing: [] }} domain={domain} fills={{ inWindow: 3, loaded: 3 }} />);
    expect(screen.getByRole("group", { name: "Stage, decision and incident events" })).toBeTruthy();
    expect(screen.getByTestId("replay-lanes").textContent).toContain("2 events in this window");
    expect(screen.getByTestId("replay-lanes").textContent).toContain("3 of 3 fills in this window");
  });

  it("with no stage, decision or incident event at all it is one sentence and no ribbon", () => {
    render(<ReplayLanes events={{ events: [event("f", "flow", "2026-10-16T10:00:00Z")], missing: ["stage", "decision", "incident"] }} domain={domain} />);
    expect(screen.queryByRole("group", { name: "Stage, decision and incident events" })).toBeNull();
    expect(screen.getByTestId("replay-lanes-none").textContent).toContain("No stage, decision or incident event is published for this alpha up to the read's as-of time.");
  });
});
