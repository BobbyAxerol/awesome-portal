/**
 * RF01-F5 · one browser codec for `p02-cursor.v2`, shared by Screen 00 and
 * Screens 04–08 (audit F-01).
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_CURSOR, parseCursor, parseCursorProblems, serializeCursor } from "./evidenceCursor";
import { journeyLinkProblems, journeyQueryFromSearch, JOURNEY_CURSOR_KEYS } from "./foundationClient";
import {
  CURSOR_CODEC,
  CURSOR_STAGES,
  INSPECTION_CURSOR_KEYS,
  decodeInspectionCursor,
  encodeInspectionCursor,
} from "./inspectionCursor";
import { evidenceHrefFor } from "./JourneyMap";

describe("RF01-F5 — the codec is P02 v2, exactly", () => {
  it("names the codec and its closed stage set", () => {
    expect(CURSOR_CODEC).toBe("p02-cursor.v2");
    expect(CURSOR_STAGES).toEqual(["summary", "split", "search", "freeze", "execute", "claim", "atlas"]);
    expect(INSPECTION_CURSOR_KEYS[0]).toBe("stage");
    expect(JOURNEY_CURSOR_KEYS).toEqual(["run_id", ...INSPECTION_CURSOR_KEYS]);
  });

  it("keeps every value opaque — nothing is coerced to a number", () => {
    const { cursor, problems } = decodeInspectionCursor("#stage=search&fold=wf-3&trial=t-0042&study=s-west");
    expect(problems).toEqual([]);
    expect(cursor).toEqual({ stage: "search", fold: "wf-3", trial: "t-0042", study: "s-west" });
    expect(encodeInspectionCursor(cursor)).toBe("stage=search&fold=wf-3&study=s-west&trial=t-0042");
  });

  it("reports what it refuses instead of dropping it silently", () => {
    const { cursor, problems } = decodeInspectionCursor("#stage=deploy&tab=x&fold=1&fold=2&params=bad%20value");
    expect(cursor).toEqual({});
    expect(problems).toEqual([
      { code: "CURSOR_VALUE_INVALID", key: "stage" },
      { code: "CURSOR_UNSUPPORTED_KEY", key: "tab" },
      { code: "CURSOR_DUPLICATE_KEY", key: "fold" },
      { code: "CURSOR_VALUE_INVALID", key: "params" },
    ]);
  });

  it("folds agreeing seq/event_seq to one seq and refuses a disagreement", () => {
    expect(decodeInspectionCursor("event_seq=9").cursor).toEqual({ seq: "9" });
    expect(decodeInspectionCursor("seq=9&event_seq=9").cursor).toEqual({ seq: "9" });
    const conflict = decodeInspectionCursor("seq=9&event_seq=8");
    expect(conflict.cursor).toEqual({});
    expect(conflict.problems).toEqual([{ code: "CURSOR_SEQUENCE_CONFLICT", key: "seq" }]);
  });
});

describe("RF01-F5 — Screens 04–08 read the shared codec and lose nothing", () => {
  it("carries the keys it does not interpret through a round trip", () => {
    const hash = "#stage=search&fold=3&study=s-west&trial=42&pick=best&trade=tr-7&event_seq=91&mode=wfo&playback_ordinal=5";
    const cursor = parseCursor(hash);
    expect(cursor).toMatchObject({ stage: "search", fold: 3, trial: 42, seq: 91 });
    expect(cursor.carried).toEqual({ study: "s-west", pick: "best", trade: "tr-7", mode: "wfo", playback_ordinal: "5" });
    expect(serializeCursor(cursor)).toBe(
      "#stage=search&fold=3&study=s-west&trial=42&pick=best&trade=tr-7&seq=91&mode=wfo&playback_ordinal=5",
    );
    expect(parseCursor(serializeCursor(cursor))).toEqual(cursor);
  });

  it("keeps a non-numeric trial id instead of dropping it", () => {
    const cursor = parseCursor("#stage=search&fold=2&trial=t-0042");
    expect(cursor.trial).toBeNull();
    expect(cursor.carried).toEqual({ trial: "t-0042" });
    expect(serializeCursor(cursor)).toContain("trial=t-0042");
    expect(parseCursorProblems("#stage=search&fold=2&trial=t-0042")).toEqual([]);
  });

  it("says so when the fold cannot be opened here", () => {
    expect(parseCursor("#fold=wf-3").fold).toBe(DEFAULT_CURSOR.fold);
    expect(parseCursorProblems("#fold=wf-3")).toEqual([{ code: "CURSOR_VALUE_UNREADABLE", key: "fold" }]);
    expect(parseCursorProblems("#stage=search&tab=x")).toEqual([{ code: "CURSOR_UNSUPPORTED_KEY", key: "tab" }]);
  });
});

describe("RF01-F5 — Screen 00 ↔ Screen 04 round-trip", () => {
  it("a Screen 04 hash, sent as a journey query and handed back, is the same cursor", () => {
    const hub = parseCursor("#stage=freeze&fold=4&trial=17&params=prm_9d44f2&study=s-1&pick=best");
    const query = journeyQueryFromSearch(`?run_id=R-1&${serializeCursor(hub).slice(1)}`);
    expect(query).toMatchObject({ run_id: "R-1", stage: "freeze", fold: "4", trial: "17", study: "s-1", pick: "best" });
    // The server echoes the cursor it accepted; Screen 00 hands it back to 04.
    const { run_id: _run, workspace_id: _ws, ...cursor } = query;
    const href = evidenceHrefFor("R-1", {
      cursor: cursor as never,
      canonical_query: "",
      codec: "p02-cursor.v2",
      pick_effect: "INSPECTION_ONLY",
      ambiguity_state: "NOT_APPLICABLE",
    });
    expect(href.startsWith("/research/quantbt/runs/R-1/evidence#")).toBe(true);
    expect(parseCursor(href.slice(href.indexOf("#")))).toEqual(hub);
  });

  it("names a refused journey key rather than dropping it", () => {
    expect(journeyLinkProblems("?run_id=R-1&stage=search&colour=red")).toEqual([
      { code: "CURSOR_UNSUPPORTED_KEY", key: "colour" },
    ]);
    expect(journeyQueryFromSearch("?run_id=R-1&stage=search&colour=red")).toEqual({ run_id: "R-1", stage: "search" });
  });
});
