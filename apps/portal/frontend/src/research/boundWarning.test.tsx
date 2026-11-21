/** DR-02 · the one bound-warning renderer, shared by Search S06 and Freeze S07. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BOUND_WARNING_COPY,
  BoundWarningNote,
  boundWarningTitle,
  boundWarningWords,
  type BoundWarningValue,
} from "./BoundWarning";

function warning(state: BoundWarningValue["state"], side: BoundWarningValue["side"] = null, reason: string | null = null): BoundWarningValue {
  return {
    definition_id: "research.bound-warning.v1",
    copy_version: "research.bound-warning-copy.v1",
    reference_space: "DECLARED_RANGE",
    state,
    side,
    reason_code: reason,
  };
}

describe("DR-02 BoundWarningNote", () => {
  it("prints the server's state and side, never a browser-derived one", () => {
    expect(boundWarningWords(warning("AT_BOUND", "UPPER"))).toBe("at upper bound");
    expect(boundWarningWords(warning("NEAR_BOUND", "LOWER"))).toBe("near lower bound");
    expect(boundWarningWords(warning("INTERIOR"))).toBe("interior");
    expect(boundWarningWords(warning("NOT_APPLICABLE", null, "BOUND_WARNING_ZERO_WIDTH_RANGE"))).toBe("no position");
  });

  it("carries the guide's safe copy verbatim and never claims 'not an optimum' or a gate", () => {
    const title = boundWarningTitle(warning("NEAR_BOUND", "UPPER"), 88.5);
    expect(title).toContain(BOUND_WARNING_COPY);
    expect(title).toContain("88.5% of the declared range");
    expect(title.toLowerCase()).not.toContain("optimum");
    expect(title.toLowerCase()).not.toContain("before deploy");
    expect(boundWarningTitle(warning("NOT_APPLICABLE", null, "BOUND_WARNING_CATEGORICAL_PARAMETER"))).toContain(
      "a categorical value has no position in a range",
    );
  });

  it("does not re-classify: a 99% position the server called INTERIOR stays interior", () => {
    const { container } = render(<BoundWarningNote warning={warning("INTERIOR")} positionPercent={99} />);
    const note = container.querySelector("[data-bound-warning]");
    expect(note?.textContent).toBe("99% · interior");
    expect(note?.getAttribute("data-bound-warning")).toBe("INTERIOR");
  });

  it("is the one renderer both screens import (no second threshold anywhere in the UI)", () => {
    const root = join(__dirname);
    for (const file of ["SearchDetail.tsx", "FreezeDetail.tsx"]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain('import { BoundWarningNote } from "./BoundWarning"');
      expect(source).not.toMatch(/position_percent\s*[<>]=?\s*\d/);
    }
  });
});
