/** The Manager dataset when the producer binds exact snapshot transitions (Codex 82947ceb2): the reader accepts the published timing AND the legacy pin, and stays strict. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { readManagerDataset } from "./managerDataset";
import { FIXTURE_STAGE_TRANSITIONS } from "./managerDataset.testbase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const timing = (): Draft => structuredClone(loadCanonical<{ value: Draft }>(`${FIXTURE_STAGE_TRANSITIONS}.valid.json`).value);
const legacy = (): Draft => structuredClone(loadCanonical<{ value: Draft }>("execution-manager-dataset.partitions.synthetic.valid.json").value);
const read = (raw: unknown) => { const r = readManagerDataset(raw); return r === null || r.kind !== "dataset" ? null : r.dataset; };

describe("published stage timing", () => {
  it("the published example conforms to the schema and reads: one row carries the entry time, the row no transition binds keeps the typed absence", () => {
    expect(validateAgainst("execution-manager-dataset.v1.schema.json", "", timing())).toEqual([]);
    const dataset = read(timing())!;
    expect(dataset.stageTimingPublished).toBe(true);
    const bound = dataset.items.filter((row) => row.enteredAtMs !== null);
    expect(bound).toHaveLength(1);
    expect(bound[0]).toMatchObject({ currentStage: "LIVE", enteredAtMs: 1000, daysInStage: 0, stageLifecycleReasons: { enteredAtMs: null, daysInStage: null } });
    const absent = dataset.items.filter((row) => row.enteredAtMs === null);
    expect(absent[0]!.stageLifecycleReasons).toMatchObject({ currentStage: "MULTIPLE_ACTIVE_STAGES", enteredAtMs: "STAGE_ENTRY_TIME_NOT_PUBLISHED" });
  });
  it("the legacy pin still reads and carries no flag", () => {
    const dataset = read(legacy())!;
    expect(dataset.stageTimingPublished).toBeUndefined();
    expect(dataset.queryOptions.unavailableFields).toHaveLength(2);
  });
  it("accepts an empty unavailable_fields list; refuses a list of one, an unknown policy value, and a day count that is not the elapsed whole days", () => {
    const empty = timing();
    empty.query_options.unavailable_fields = [];
    expect(read(empty)?.queryOptions.unavailableFields).toEqual([]);
    const one = timing();
    one.query_options.unavailable_fields = [one.query_options.unavailable_fields[0]];
    expect(read(one)).toBeNull();
    const policy = timing();
    policy.stage_lifecycle.entry_time = "SOMETIME";
    expect(read(policy)).toBeNull();
    const days = timing();
    days.items[0].days_in_stage = 1;
    expect(read(days)).toBeNull();
    const after = timing();
    after.items[0].entered_at_ms = after.as_of_ms + 1;
    expect(read(after)).toBeNull();
    const reason = timing();
    reason.items[0].stage_lifecycle_reasons.entered_at_ms = "STAGE_ENTRY_TIME_NOT_PUBLISHED";
    expect(read(reason)).toBeNull();
  });
});
