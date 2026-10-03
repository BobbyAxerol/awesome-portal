/**
 * B11 · SELECTION_SURFACES (S04/S05, S06, S07) — causal/inner current-source bindings.
 *
 * Fixture authority: bodies are the published canonical fixtures under packages/contracts/fixtures
 * (read with readFileSync). The causal fields are TYPED BUILDERS derived from those fixtures and from the
 * generated types: `research-causal-inner.selection.synthetic.valid.json` is SYNTHETIC_CONTRACT_FIXTURE_NOT_ENGINE_EVIDENCE;
 * the per-study surfaces re-use the canonical surface body under new study ids. Nothing here is engine evidence.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CausalSelectionPanel, planIsCausal, type PlanFold } from "./CausalSelectionPanel";
import { FoldSelectionPanel } from "./FoldSelectionPanel";
import type { FoldOrdering } from "./freezeClient";
import { freezeLineLabel, PoolFunnel } from "./SearchStageB";
import { StudySurfaces, type StudySurface } from "./SearchSurface";
import type { CurrentSourceSearch } from "./searchClient";
import type { CurrentSourceSplit } from "./splitClient";
import type { CurrentSourceEvidence } from "./evidenceClient";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const read = <T,>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

const SPLIT = read<CurrentSourceSplit>("research-current-source.split.valid.json");
const SEARCH = read<CurrentSourceSearch>("research-current-source.search-surface.valid.json");
const FREEZE = read<{ fold_ordering: FoldOrdering }>("research-current-source.freeze-binding.valid.json");
const SELECTION = read<{ selection: NonNullable<PlanFold["causal_selection"]> }>("research-causal-inner.selection.synthetic.valid.json").selection;

function causalFold(): PlanFold {
  return { ...SPLIT.fold_plan.folds[0]!, causal_selection: SELECTION };
}

describe("S04/S05 · fold causal selection", () => {
  it("shows observed inner rows and the DECLARED minimum, each labelled for what it is", () => {
    const guards = { inner_min_folds: { value: 2, state: "AVAILABLE", reason_code: null } } as Partial<CurrentSourceSplit["guards"]>;
    const { container } = render(<CausalSelectionPanel fold={causalFold()} guards={guards} foldNumber={1} />);
    const panel = container.querySelector("[data-card='causal-selection']") as HTMLElement;
    expect(panel.querySelector("[data-inner-observed]")?.getAttribute("data-inner-observed")).toBe("2");
    expect(panel.querySelector("[data-inner-observed]")?.textContent).toContain("source-reported");
    expect(panel.querySelector("[data-inner-min-folds]")?.getAttribute("data-inner-min-folds")).toBe("2");
    expect(panel.textContent).toContain("declared minimum");
    expect(panel.querySelectorAll("[data-inner-fold]")).toHaveLength(2);
    expect(panel.querySelector("[data-causal-trial]")?.textContent).toContain("fold_0.trial_1");
    expect(panel.querySelector("[data-causal-scope]")?.textContent).toContain("own OOS fold");
  });

  it("keeps a missing declared minimum as a typed absence with the server's reason", () => {
    const guards = { inner_min_folds: { value: null, state: "NOT_PUBLISHED", reason_code: "SERVER_GUARD_REASON" } } as Partial<CurrentSourceSplit["guards"]>;
    const { container } = render(<CausalSelectionPanel fold={causalFold()} guards={guards} />);
    const absent = container.querySelector("[data-inner-min-folds-state='NOT_PUBLISHED']") as HTMLElement;
    expect(absent.textContent).toContain("SERVER_GUARD_REASON");
    expect(container.querySelector("[data-inner-min-folds]")).toBeNull();
  });

  it("draws nothing for a legacy fold and reports no causal plan", () => {
    const legacy = SPLIT.fold_plan.folds[0]!;
    const { container } = render(<CausalSelectionPanel fold={legacy} />);
    expect(container.firstChild).toBeNull();
    expect(planIsCausal(SPLIT.fold_plan.folds)).toBe(false);
    expect(planIsCausal([causalFold()])).toBe(true);
  });

  it("verdict rule: causal score basis is named in the evidence verdicts type", () => {
    const basis: NonNullable<CurrentSourceEvidence["fold_verdicts"]>["rule"]["score_basis"] = "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS";
    expect(basis).toMatch(/INNER_VALIDATION/);
  });
});

describe("S06 · one surface per outer study", () => {
  const surface = SEARCH.surface!;
  const studies = ["fold_0", "fold_1"].map(
    (study_id, index): StudySurface => ({
      scope: "INNER_VALIDATION_OUTER_STUDY",
      fold_id: String(index),
      study_id,
      surface: surface as StudySurface["surface"],
    }),
  );

  it("shows the parent run-global surface as NOT APPLICABLE with the served reason and a study selector", () => {
    function Harness() {
      const [fold, setFold] = useState(1);
      return (
      <StudySurfaces
        studies={studies}
        declared={SEARCH.declared_space}
        parentReason="SERVED_PARENT_REASON"
        parametersOf={() => undefined}
        schedule="per_fold"
        pick={null}
        onPick={() => undefined}
        prunedCount={0}
        foldOrdinal={fold}
        onFold={setFold}
      />
      );
    }
    const { container } = render(<Harness />);
    const parent = container.querySelector("[data-panel='surface-run-global']") as HTMLElement;
    expect(parent.getAttribute("data-panel-state")).toBe("NOT_APPLICABLE");
    expect(parent.textContent).toContain("not applicable");
    expect(parent.textContent).toContain("SERVED_PARENT_REASON");
    expect(container.querySelectorAll("[data-study-pick]")).toHaveLength(2);
    expect(container.querySelector("[data-panel='scatter'], [data-surface]")).toBeTruthy();
    expect(container.querySelector("[data-study-pick='fold_0']")?.getAttribute("aria-current")).toBe("true");
    expect(container.textContent).toContain("fold_01 · inner validation");
    fireEvent.click(container.querySelector("[data-study-pick='fold_1']") as HTMLElement);
    expect(container.textContent).toContain("fold_02 · inner validation");
    expect(container.textContent).not.toContain("global study");
  });
});

describe("S06 · K is not applicable on a causal pool", () => {
  it("labels K NOT APPLICABLE with the served code, never 'K not published'", () => {
    const pool = SEARCH.pool;
    if (!pool) throw new Error("canonical search fixture carries a pool");
    const causal = { ...pool, rule: { ...pool.rule, state: "NOT_APPLICABLE", reason_code: "SERVED_K_REASON", expression: null, k: null }, reevaluation_scope: "PER_FOLD_STUDY" } as typeof pool;
    expect(freezeLineLabel(causal)?.text).toBe("POOL · K NOT APPLICABLE");
    const { container } = render(
      <MemoryRouter>
        <PoolFunnel search={{ ...SEARCH, pool: causal }} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-k-callout='not-applicable']")?.textContent).toContain("K not applicable");
    expect(container.querySelector("[data-k-callout='not-applicable']")?.textContent).toContain("SERVED_K_REASON");
    expect(container.textContent).toContain("each outer fold, its own study");
  });
});

describe("S07 · per-fold selection on the freeze ordering", () => {
  const ordering = (): FoldOrdering => ({
    ...FREEZE.fold_ordering,
    selection_scope: "PER_FOLD",
    folds: FREEZE.fold_ordering.folds.map((fold) => ({
      ...fold,
      verdict: "CAUSAL_DATA_TIME_SELECTION" as const,
      reason_code: null,
      selected_candidate: { candidate_id: "cand_x", params_digest: "a".repeat(64), study_id: `fold_${fold.fold_id}`, selected_trial_id: `fold_${fold.fold_id}.trial_1`, inner_fold_count: 2 },
    })),
  });

  it("shows each fold's own candidate and the causal data-time verdict; the engine clock stays absent", () => {
    render(<FoldSelectionPanel ordering={ordering()} />);
    expect(screen.getAllByText("causal · data-time selection")).toHaveLength(2);
    expect(document.querySelectorAll("[data-own-candidate='cand_x']")).toHaveLength(2);
    const clock = document.querySelector("[data-engine-clock='absent']") as HTMLElement;
    expect(clock.textContent).toContain("engine wall clock: not published");
    expect(clock.textContent).toContain(FREEZE.fold_ordering.wall_clock.reason_code);
    expect(document.querySelector("[data-orchestration-clocks]")).toBeNull();
  });

  it("is absent for a GLOBAL ordering", () => {
    const { container } = render(<FoldSelectionPanel ordering={FREEZE.fold_ordering} />);
    expect(container.firstChild).toBeNull();
  });
});
