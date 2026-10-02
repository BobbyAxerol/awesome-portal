/**
 * B11 · S03 — causal `PER_FOLD_STUDY` progress (Codex `da185d7a`).
 *
 * The base read is the committed `e2e/research-foundation/progress-read.json`. The per-fold selections,
 * `fold_reporting` and live trial identities are TYPED BUILDERS: the one change each block makes to that
 * canonical read, with fields named exactly as `packages/contracts/generated/research-progress.d.ts`
 * (`ProgressFoldSelection.scope = PER_FOLD_STUDY`, `study_id`, `source_trial_id`; `fold_reporting`).
 * No repo fixture serves a causal progress read yet.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProgressRead } from "./progressClient";
import { RunProgress } from "./RunProgress";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8")) as ProgressRead;
const DIGEST = `sha256:${"a".repeat(64)}`;

afterEach(cleanup);

type Selection = Record<string, unknown>;
function perFold(extra: Selection = {}): Selection {
  return {
    state: "AVAILABLE",
    scope: "PER_FOLD_STUDY",
    trial: 5,
    objective: "0.4200",
    objective_kind: "INNER_VALIDATION_DECAY_J",
    params_digest: DIGEST,
    reason_code: null,
    study_id: "study-s1",
    source_trial_id: "2",
    ...extra,
  };
}

function view(selections: Record<number, Selection>, props: Record<string, unknown> = {}, fold_reporting?: Record<string, unknown>) {
  const folds = BASE.progress!.folds.map((fold) => (selections[fold.fold] ? { ...fold, selection: selections[fold.fold] } : fold));
  const read = {
    ...BASE,
    current: { ...BASE.current, ...(fold_reporting ? { fold_reporting } : {}) },
    progress: { ...BASE.progress!, folds },
  } as unknown as ProgressRead;
  return render(
    <MemoryRouter>
      <RunProgress
        runId={read.run_id}
        read={read}
        snapshot={read.progress ?? null}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;

describe("PER_FOLD_STUDY keeps both native ids, and the ordinal is never a trial id", () => {
  it("value path: a selected fold names its study and source trial; the cumulative ordinal rides in the tooltip", () => {
    view({ 1: perFold() });
    const note = $('[data-fold-note="1"]')!;
    expect(note.textContent).toContain("inner J 0.420");
    expect(note.textContent).toContain("study study-s1 · trial 2");
    expect(note.textContent).not.toContain("trial 5");
    const chip = note.querySelector("[data-per-fold-trial]")!;
    expect(chip.getAttribute("data-study-id")).toBe("study-s1");
    expect(chip.getAttribute("data-source-trial-id")).toBe("2");
    expect(chip.getAttribute("title")).toBe("study study-s1 · source trial id 2 · display ordinal 5 is cumulative across studies, not a native trial id");
  });

  it("typed absence: an id the source did not publish says so, and never falls back to the ordinal", () => {
    view({ 1: perFold({ study_id: undefined, source_trial_id: undefined }) });
    const note = $('[data-fold-note="1"]')!;
    expect(note.textContent).toContain("study id not published · trial id not published");
    expect(note.textContent).not.toMatch(/trial 5\b/);
    expect(note.querySelector("[data-per-fold-trial]")!.getAttribute("title")).toContain("source trial id not published");
  });

  it("a running per-fold fold shows the live study and source trial, not the ordinal", () => {
    view({}, { foldTrials: { 3: 7 }, foldTrialIds: { 3: { studyId: "study-s3", sourceTrialId: "1", ordinal: 7 } } });
    const note = $('[data-fold-note="3"]')!;
    expect(note.textContent).toBe("study study-s3 · trial 1 · running");
    expect(note.querySelector("[data-per-fold-trial]")!.getAttribute("title")).toContain("display ordinal 7 is cumulative");
  });

  it("the evidence cursor chip carries both ids too", () => {
    view({ 1: perFold() }, { foldCursor: 1 });
    const chip = $("[data-cursor-trial]")!;
    expect(chip.textContent).toContain("study study-s1 · trial 2");
    expect(chip.getAttribute("data-source-trial-id")).toBe("2");
  });

  it("the study row counts the source's reported and planned folds, not the declared range", () => {
    view(
      { 1: perFold() },
      {},
      { basis: "P08_ADMISSION_AND_P11_JOURNAL_V1", declared_count: 16, planned_count: 2, reported_count: 3, done_count: 2, failed_count: 0, reason_code: null },
    );
    expect($("[data-study]")!.textContent).toContain("per-fold studies — 3 reported / 2 planned");
    expect($("[data-fold-reporting]")!.textContent).toContain("3 reported");
  });

  it("the percentage is the server's, untouched by per-fold identity", () => {
    view({ 1: perFold() });
    expect($("[data-progress-text]")!.textContent).toContain("42%");
  });

  it("global and legacy selections keep their wording (no study chip)", () => {
    view({ 1: { state: "AVAILABLE", scope: "GLOBAL_STUDY", trial: 5, objective: "0.4200", params_digest: DIGEST, reason_code: null } });
    const note = $('[data-fold-note="1"]')!;
    expect(note.textContent).toContain("global best J₁ 0.420 · trial 5");
    expect(note.querySelector("[data-per-fold-trial]")).toBeNull();
    expect($("[data-study]")!.textContent).not.toContain("per-fold studies");
  });
});
