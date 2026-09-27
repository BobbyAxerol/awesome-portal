/**
 * E13 · P19 — what a submission may say about the run it came from.
 *
 * The PostgreSQL lane (`research-w5a-migration.spec.ts`) proves the row that
 * lands. These cases guard the boundary that decides whether it can land at
 * all: before E13 the only declarable relation was `SIBLING_OF`, and it
 * required a what-if cell, so the `?from=<run>` clone every screen offers had
 * no way to name its parent. Every cloned attempt was therefore stored with a
 * NULL `parent_attempt_id`, and Screen 10 read all 33 attempts as ROOT.
 */

import { describe, expect, it } from "vitest";

import { ResearchRunCreateRequestSchema } from "../src/research/run-create.contract";
import { wfoRequested } from "./research-w1-wfo.fixture";

const PARENT = "rrun_e1fa9e5c0f2b41d3a0c7e3b54a17d5aa";

/**
 * The canonical W1 Delta-WFO request, so these cases only ever fail on the
 * one field they are about. Rebuilding a requested spec by hand here would
 * have made a P02 schema change read as an E13 regression.
 */
const REQUESTED_SPEC = wfoRequested();

/** The smallest submission the schema accepts, with the lineage under test. */
function request(lineage?: unknown): unknown {
  return {
    schema_version: "research.run-create.v1",
    client_intent_id: "rci_e13_unit",
    preflight_token: "rpft_e13_unit",
    requested_spec: REQUESTED_SPEC,
    intent_kind: "NEW",
    ...(lineage === undefined ? {} : { lineage }),
  };
}

describe("E13 run-create lineage", () => {
  it("accepts a plain clone that names only the run it copied", () => {
    const parsed = ResearchRunCreateRequestSchema.safeParse(request({ relation: "CLONE_OF", parent_run_id: PARENT }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.lineage).toEqual({ relation: "CLONE_OF", parent_run_id: PARENT });
  });

  it("still accepts the what-if sibling, cell and all", () => {
    const parsed = ResearchRunCreateRequestSchema.safeParse(
      request({ relation: "SIBLING_OF", parent_run_id: PARENT, what_if_cell_id: "x6y4" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("refuses a clone that smuggles a what-if cell", () => {
    /* A clone is not a node on a grid. Letting the cell through would store a
       fork's reason for a copy nobody forked. */
    expect(ResearchRunCreateRequestSchema.safeParse(
      request({ relation: "CLONE_OF", parent_run_id: PARENT, what_if_cell_id: "x6y4" }),
    ).success).toBe(false);
  });

  it("refuses a sibling with no cell, and an unknown relation", () => {
    expect(ResearchRunCreateRequestSchema.safeParse(
      request({ relation: "SIBLING_OF", parent_run_id: PARENT }),
    ).success).toBe(false);
    expect(ResearchRunCreateRequestSchema.safeParse(
      request({ relation: "REPRODUCTION_OF", parent_run_id: PARENT }),
    ).success).toBe(false);
  });

  it("refuses a parent id that is not an opaque run id", () => {
    for (const bad of ["", "../etc", "rrun_" + "x".repeat(200)]) {
      expect(ResearchRunCreateRequestSchema.safeParse(
        request({ relation: "CLONE_OF", parent_run_id: bad }),
      ).success).toBe(false);
    }
  });

  it("keeps lineage optional, so a plain new run is unchanged", () => {
    /* The command digest folds `lineage` in only when present, which is what
       keeps every pre-W5a golden digest byte-identical. */
    const parsed = ResearchRunCreateRequestSchema.safeParse(request());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("lineage" in parsed.data).toBe(false);
  });
});
