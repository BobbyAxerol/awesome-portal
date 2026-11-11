/**
 * BK1: the bodies `TypedAbsenceController` (apps/control-api/src/typed-absence) answers for six contract-only reads: the envelope and the scope the
 * request named, every list, bucket and total omitted. Each is judged by the published schema and by the generated strict reader, which must
 * read every section as NO_SOURCE (never as an empty list, a zero or a state). The key sets are pinned on the control-api side too
 * (test/typed-absence-http.spec.ts), so the two cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { validateAgainst } from "../testkit/schema";
import { run as runStrict } from "./strictRead";
import { SIBLINGS, type SiblingId } from "./siblings.generated";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = runStrict as (reader: unknown, raw: unknown) => any;
const envelope = (name: string) => ({ schema_version: `portal.execution.${name}.v1`, workspace_id: "ws-1", record_authority: "PORTAL_PROJECTION", read_at_ms: 1800000000000 });
const subject = { subject: { type: "DEPLOYMENT", id: "dep-1" } };

const produced: Array<{ name: SiblingId; schema: string; body: Record<string, unknown>; absent: string[]; keep: Record<string, unknown> }> = [
  { name: "blotter-summary", schema: "execution-blotter-summary.v1.schema.json", body: { ...envelope("blotter-summary"), environment: "live" }, absent: ["status_buckets", "funnel"], keep: { environment: "live" } },
  { name: "cost-events", schema: "execution-cost-events.v1.schema.json", body: { ...envelope("cost-events"), ...subject }, absent: ["events", "totals"], keep: subject },
  { name: "grants", schema: "execution-grants.v1.schema.json", body: { ...envelope("grants"), ...subject }, absent: ["items"], keep: subject },
  { name: "limits", schema: "execution-limits.v1.schema.json", body: { ...envelope("limits"), ...subject }, absent: ["items"], keep: subject },
  { name: "recovery-events", schema: "execution-recovery-events.v1.schema.json", body: { ...envelope("recovery-events"), ...subject }, absent: ["events"], keep: subject },
  { name: "report-snapshots", schema: "execution-report-snapshots.v1.schema.json", body: { ...envelope("report-snapshots"), ...subject }, absent: ["items"], keep: subject },
];

describe.each(produced.map((p) => [p.name, p] as const))("typed absence body of %s", (name, entry) => {
  it("passes the published schema and the strict reader, and every section reads as NO_SOURCE", () => {
    expect(validateAgainst(entry.schema, "", structuredClone(entry.body))).toEqual([]);
    const read = run(SIBLINGS[name].read, structuredClone(entry.body));
    expect(read, name).not.toBeNull();
    for (const [key, value] of Object.entries(entry.keep)) expect(read[key]).toEqual(value);
    for (const section of entry.absent) expect(read[section], section).toEqual({ state: "NO_SOURCE" });
  });
  it("the reader tells an omitted section from a published empty one (an empty list is a statement the typed absence never makes)", () => {
    const read = run(SIBLINGS[name].read, { ...structuredClone(entry.body), [entry.absent[0]]: [] });
    expect(read[entry.absent[0]]).toEqual({ state: "PUBLISHED", value: [] });
  });
});
