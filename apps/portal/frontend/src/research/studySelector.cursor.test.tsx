/** W5 §3.4: the S06 causal study selector is bound to the cursor's 1-based fold. */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudySurfaces, type StudySurface } from "./SearchSurface";
import type { CurrentSourceSearch } from "./searchClient";

afterEach(cleanup);

const SEARCH = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-current-source.search-surface.valid.json"), "utf8"),
) as CurrentSourceSearch;
const studies = ["0", "1", "2"].map(
  (fold_id): StudySurface => ({ scope: "INNER_VALIDATION_OUTER_STUDY", fold_id, study_id: `study_${fold_id}`, surface: SEARCH.surface as StudySurface["surface"] }),
);

function draw(foldOrdinal: number, onFold = vi.fn(), pick: string | null = null) {
  return render(
    <StudySurfaces studies={studies} declared={SEARCH.declared_space} parentReason={null} parametersOf={() => undefined} schedule="per_fold_causal" pick={pick} onPick={() => undefined} prunedCount={0} foldOrdinal={foldOrdinal} onFold={onFold} />,
  );
}

describe("S06 study selector · cursor", () => {
  it("fold=2 makes the study with fold_id 1 active, labelled fold_02, with aria-current", () => {
    const { container } = draw(2);
    const on = [...container.querySelectorAll("[data-study-pick]")].filter((b) => b.getAttribute("aria-current") === "true");
    expect(on.map((b) => b.getAttribute("data-study-pick"))).toEqual(["study_1"]);
    expect(on[0]!.textContent).toBe("F2");
    expect(container.querySelector("[data-study-pick][aria-pressed]")).toBeNull();
    expect(container.textContent).toContain("F2 · inner validation");
    expect(container.textContent).not.toContain("outer fold 1");
  });

  it("clicking fold_03 writes the 1-based fold 3", () => {
    const onFold = vi.fn();
    const { container } = draw(2, onFold);
    fireEvent.click(container.querySelector("[data-study-pick='study_2']") as HTMLElement);
    expect(onFold).toHaveBeenCalledWith(3);
  });

  it("a fold outside the studies falls back to the first", () => {
    const { container } = draw(9);
    expect(container.querySelector("[data-study-pick='study_0']")?.getAttribute("aria-current")).toBe("true");
  });
});
