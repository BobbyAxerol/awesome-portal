/**
 * W4D — the one ResearchNotice, the W4A-contract primitives it leans on, and the
 * unknown-run crumb. FEWER WORDS: one sentence of at most six words, the code and
 * request id only in the tooltip, one action.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { forgetUnknownRuns, markRunUnknown, useRunUnknown } from "../app/researchRunCrumb";
import { Absence, AbsenceSummary } from "./Absence";
import { formatValue } from "./formatValue";
import { humanise } from "./humanise";
import { NOTICE_SENTENCE, ResearchNotice } from "./ResearchNotice";

afterEach(() => {
  cleanup();
  forgetUnknownRuns();
});

describe("ResearchNotice", () => {
  it.each(Object.entries(NOTICE_SENTENCE))("%s is one sentence of at most six words", (_state, sentence) => {
    expect(sentence.trim().split(/\s+/).length).toBeLessThanOrEqual(6);
  });

  it("prints the sentence and one action; code, request id and the server sentence are the tooltip, not text", () => {
    const { container } = render(
      <ResearchNotice state="denied" code="RESEARCH_X_NOT_FOUND" requestId="rq-9" detail="the long server sentence" action={<a href="/research/quantbt/runs">Library</a>} />,
    );
    expect(container.textContent).toBe("⊘Not available to you.Library");
    const notice = container.querySelector("[data-research-notice]")!;
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.getAttribute("data-refusal-code")).toBe("RESEARCH_X_NOT_FOUND");
    const tip = screen.getByTitle(/RESEARCH_X_NOT_FOUND/);
    expect(tip.getAttribute("title")).toBe("RESEARCH_X_NOT_FOUND · request rq-9 · the long server sentence");
    expect(tip.getAttribute("tabindex")).toBe("0"); // reachable by keyboard
    expect(container.querySelectorAll("a, button")).toHaveLength(1); // exactly one action
  });

  it("a demoted state is a status, not an alert, and an absent diagnostic invents none", () => {
    const { container } = render(<ResearchNotice state="stale" withheld={false} />);
    expect(container.querySelector("[role='status']")).not.toBeNull();
    expect(container.querySelector("[title]")).toBeNull();
    expect(container.textContent).toBe("◷Changed. Read again.");
  });
});

describe("W4A-contract primitives (identical contract)", () => {
  it("humanise reads a token as words and keeps acronyms upper", () => {
    expect(humanise("walk_forward_oos")).toBe("walk-forward OOS");
    expect(humanise("not_causal_multi_fold_global_calibration")).toBe("not causal · multi-fold · global calibration");
    expect(humanise("per_fold_causal")).toBe("per-fold causal");
    expect(humanise(null)).toBe("");
  });

  it("formatValue: UTC minute, grouped numbers, U+2212, never a signed zero", () => {
    expect(formatValue.utc(Date.UTC(2026, 9, 1, 13, 44))).toBe("2026-10-01 13:44 UTC");
    expect(formatValue.number("-1234.5")).toBe("−1,234.50");
    expect(formatValue.number(-0.0000003, { dp: 3 })).toBe("0.000");
    expect(formatValue.number(0.5, { dp: 1, unit: "%" })).toBe("0.5 %");
  });

  it("Absence prints `not published` and carries the reason as the tooltip; AbsenceSummary is one caption line", () => {
    const { container } = render(
      <p>
        <Absence reason="P19_X" what="cert" />
        <AbsenceSummary column="seed" reason="P02_SEED" count={7} total={100} />
      </p>,
    );
    expect(container.textContent).toBe("cert · not publishedseed · not published in 7 of 100");
    expect(container.querySelector("[data-not-published]")!.getAttribute("title")).toBe("P19_X");
    expect(container.querySelector("[data-absence-summary]")!.getAttribute("title")).toBe("P02_SEED");
  });
});

describe("unknown run in the shell crumb", () => {
  function Probe({ id }: { id: string }) {
    return <span data-probe>{useRunUnknown(id) ? "plain" : "link"}</span>;
  }

  it("is plain text once a screen says the run is not available, and only for that run", () => {
    render(
      <>
        <Probe id="rrun_a" />
        <Probe id="rrun_b" />
      </>,
    );
    expect([...document.querySelectorAll("[data-probe]")].map((n) => n.textContent)).toEqual(["link", "link"]);
    act(() => markRunUnknown("rrun_a"));
    expect([...document.querySelectorAll("[data-probe]")].map((n) => n.textContent)).toEqual(["plain", "link"]);
  });
});
