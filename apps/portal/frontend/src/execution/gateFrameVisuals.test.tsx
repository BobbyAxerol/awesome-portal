/** The visual parts of the gate frame say only what the data says: marks per check, a chain with its verification, a track by gate. */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CheckStrip, GateTrack, ProvenanceChain } from "./components/gateFrame";

afterEach(cleanup);

describe("CheckStrip", () => {
  it("draws one segment per check in the server's own mark, and says the count in words", () => {
    render(<CheckStrip checks={[{ label: "a", outcome: "pass" }, { label: "b", outcome: "watch" }, { label: "c", outcome: "fail" }, { label: "d", outcome: "insufficient" }]} />);
    const marks = [...document.querySelectorAll(".exec-gf-strip-bar i")].map((i) => i.getAttribute("data-mark"));
    expect(marks).toEqual(["pass", "watch", "fail", "insufficient"]);
    expect(document.querySelector(".exec-gf-strip")!.getAttribute("aria-label")).toBe("1 of 4 checks passed");
  });
  it("draws nothing for no checks — an empty checklist is not a perfect score", () => {
    const { container } = render(<CheckStrip checks={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ProvenanceChain", () => {
  it("ticks only what the server verified and states the rest", () => {
    render(<ProvenanceChain nodes={[{ label: "digest", value: "sha256:9f3c", verification: "✓ verified" }, { label: "entrypoint", value: "pkg:Rsi", verification: null, note: "· note" }]} />);
    const items = [...document.querySelectorAll("[data-provenance] li")];
    expect(items.map((li) => li.getAttribute("data-verified"))).toEqual(["true", "false"]);
    expect(items[1]!.textContent).toContain("not verified");
  });
});

describe("GateTrack", () => {
  it("marks only the request's own gate; the others are neutral — a position is not a history of accepted gates", () => {
    render(<GateTrack at="PAPER" />);
    expect([...document.querySelectorAll(".exec-gf-track i")].map((i) => i.getAttribute("data-state"))).toEqual(["other", "other", "current", "other", "other"]);
    expect(document.querySelector(".exec-gf-track")!.getAttribute("aria-label")).toMatch(/Position/);
  });
});
