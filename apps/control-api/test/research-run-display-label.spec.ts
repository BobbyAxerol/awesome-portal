/**
 * D1 — the one rule that turns a run into `R-WFO-118`.
 *
 * The label is read by Screens 01, 03-08 and 10, so the risk it carries is
 * not "it looks wrong" but "two screens print two different numbers for the
 * same run". These cases pin the two halves that make that impossible: one
 * formatter, and one SQL fragment that every read shares.
 */

import { describe, expect, it } from "vitest";

import {
  RUN_DISPLAY_LABEL_KINDS,
  runDisplayLabel,
  runDisplayOrdinal,
  runDisplayOrdinalSql,
} from "../src/research/run-display-label";

const WFO = "p10.delta-signal-notional-wfo.v1";
const WFO_V2 = "p10.delta-signal-notional-wfo.v2";
const P04 = "p04.fixed-qualification.v1";

describe("D1 run display label", () => {
  it("writes the kind and the ordinal exactly as the hi-fi does", () => {
    /* The hi-fi prints `R-WFO-118`, `R-TT-002`, `R-FULL-004` — three digits,
       zero padded, on every one of its five kinds. */
    expect(runDisplayLabel(WFO, 118)).toBe("R-WFO-118");
    expect(runDisplayLabel(WFO, 7)).toBe("R-WFO-007");
    expect(runDisplayLabel(P04, 7)).toBe("R-P04-007");
    expect(runDisplayLabel(WFO, 1204)).toBe("R-WFO-1204");
  });

  it("labels the three shipped display profiles, never an unknown child", () => {
    expect(Object.keys(RUN_DISPLAY_LABEL_KINDS).sort()).toEqual([P04, WFO, WFO_V2]);
    expect(runDisplayLabel(WFO_V2, 7)).toBe("R-WFO-007");
    expect(runDisplayLabel("p16.delta-whatif-grid.v1", 3)).toBeNull();
    expect(runDisplayLabel(null, 3)).toBeNull();
    expect(runDisplayLabel(undefined, 3)).toBeNull();
  });

  it("refuses an ordinal that is not a real position", () => {
    /* A child row, a legacy row and an unreadable count all arrive as "no
       ordinal". None of them may become `R-WFO-000`. */
    expect(runDisplayLabel(WFO, null)).toBeNull();
    expect(runDisplayLabel(WFO, undefined)).toBeNull();
    expect(runDisplayLabel(WFO, 0)).toBeNull();
    expect(runDisplayLabel(WFO, -1)).toBeNull();
    expect(runDisplayLabel(WFO, 2.5)).toBeNull();
  });

  it("reads a count(*) whichever way the driver hands it over", () => {
    /* `count(*)` is bigint: node-postgres gives a string, some drivers a
       bigint. A silent NaN here would blank every label in production while
       every unit test stayed green. */
    expect(runDisplayOrdinal("118")).toBe(118);
    expect(runDisplayOrdinal(118)).toBe(118);
    expect(runDisplayOrdinal(118n)).toBe(118);
    expect(runDisplayOrdinal("0")).toBeNull();
    expect(runDisplayOrdinal(null)).toBeNull();
    expect(runDisplayOrdinal("abc")).toBeNull();
  });

  it("counts only logical runs of the same kind, up to this one", () => {
    const sql = runDisplayOrdinalSql("library", "label_producer");
    /* Only PRIMARY rows are numbered and only a PRIMARY row gets a number:
       numbering a worker or audit child would make the sequence skip for
       everybody else. */
    expect(sql).toContain("library.relationship_kind = 'PRIMARY'");
    expect(sql).toContain("peer_run.relationship_kind = 'PRIMARY'");
    /* Same workspace and same stored profile — the partition. */
    expect(sql).toContain("peer_run.workspace_id = library.workspace_id");
    expect(sql).toContain("peer_producer.execution_profile_id = label_producer.execution_profile_id");
    // v1/v2 share the WFO display kind and must not both print R-WFO-001.
    expect(sql).toContain("peer_producer.execution_profile_id IN ('p10.delta-signal-notional-wfo.v1','p10.delta-signal-notional-wfo.v2')");
    /* Ordered by creation with the run id as the tiebreak, inclusive of this
       run, which is what makes the first run number 1 and keeps a run's
       number from moving when a later run is accepted. */
    expect(sql).toContain("(peer_run.created_at, peer_run.run_id)");
    expect(sql).toContain("<= (library.created_at, library.run_id)");
  });

  it("is the same fragment for every read, only the aliases change", () => {
    /* Three reads publish this label. If they could drift, two screens could
       disagree about one run — the exact failure D1 exists to prevent. */
    const library = runDisplayOrdinalSql("library", "label_producer");
    const progress = runDisplayOrdinalSql("durable", "producer");
    expect(progress).toBe(
      library.replaceAll("library.", "durable.").replaceAll("label_producer.", "producer."),
    );
  });
});
