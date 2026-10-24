/** Package 5 (Codex ace3547ca): the Manager dataset reader consumes the group page and the group attribution, and the request carries group_limit / group_after / group_before. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { datasetQueryMismatch, encodeManagerDatasetQuery } from "../../api/managerDatasetQuery";
import { readManagerDataset } from "./managerDataset";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const contributors = (): Draft => structuredClone(loadCanonical<{ value: Draft }>("execution-manager-contributors.synthetic.valid.json").value);
const read = (raw: unknown) => { const r = readManagerDataset(raw); return r === null || r.kind !== "dataset" ? null : r.dataset; };

/** A body with `n` groups of the canonical one, paged `limit` at a time at `offset`. */
function paged(n: number, limit: number, offset: number): Draft {
  const body = contributors();
  const template = body.groups[0];
  const all = Array.from({ length: n }, (_, i) => ({ ...structuredClone(template), key: [{ field: "alpha_id", value: `TEST_ONLY:alpha-${String(i).padStart(4, "0")}` }],
    attribution: { alpha_id: `TEST_ONLY:alpha-${String(i).padStart(4, "0")}`, name: `Alpha ${i}`, owner_user_id: "TEST_ONLY:o", name_reason_code: null, owner_reason_code: null } }));
  body.groups = all.slice(offset, offset + limit);
  body.group_page = { limit, returned_count: body.groups.length, authorized_filtered_count: n,
    next_cursor: offset + limit < n ? "next" : null, previous_cursor: offset > 0 ? "prev" : null };
  return body;
}

describe("group page and attribution", () => {
  it("the canonical contributors fixture conforms and reads: one group with the whole page and its attribution", () => {
    expect(validateAgainst("execution-manager-dataset.v1.schema.json", "", contributors())).toEqual([]);
    const dataset = read(contributors())!;
    expect(dataset.groupPage).toEqual({ limit: 200, returnedCount: 1, authorizedFilteredCount: 1, nextCursor: null, previousCursor: null });
    expect(dataset.groups[0]!.attribution).toEqual({ alphaId: "TEST_ONLY:alpha", name: "TEST_ONLY · declared fixture", ownerUserId: "TEST_ONLY:research-owner", nameReasonCode: null, ownerReasonCode: null });
  });
  it("a page of 200 of 207 reads with its cursors, the next page holds the rest, and the population is not capped at 200", () => {
    const first = read(paged(207, 200, 0))!;
    expect(first.groups).toHaveLength(200);
    expect(first.groupPage).toMatchObject({ returnedCount: 200, authorizedFilteredCount: 207, nextCursor: "next", previousCursor: null });
    const last = read(paged(207, 200, 200))!;
    expect(last.groups).toHaveLength(7);
    expect(last.groupPage).toMatchObject({ authorizedFilteredCount: 207, nextCursor: null, previousCursor: "prev" });
  });
  it("exactly 200 groups is complete: no cursor either way", () => {
    expect(read(paged(200, 200, 0))!.groupPage).toMatchObject({ authorizedFilteredCount: 200, nextCursor: null, previousCursor: null });
  });
  it("refuses a page that disagrees with the groups, an over-limit page, and a lone page that is not the whole population", () => {
    const lie = paged(207, 200, 0); lie.group_page.returned_count = 199;
    expect(read(lie)).toBeNull();
    const over = paged(207, 200, 0); over.group_page.limit = 201;
    expect(read(over)).toBeNull();
    const lone = paged(10, 10, 0); lone.group_page.authorized_filtered_count = 12;
    expect(read(lone)).toBeNull();
    const extra = paged(5, 10, 0); extra.group_page.total = 5;
    expect(read(extra)).toBeNull();
  });
  it("attribution: a missing name or owner always says why, a present one never does, and the id is the group's own", () => {
    const ambiguous = contributors(); Object.assign(ambiguous.groups[0].attribution, { name: null, name_reason_code: "GROUP_NAME_AMBIGUOUS", owner_user_id: null, owner_reason_code: "GROUP_OWNER_NOT_PUBLISHED" });
    expect(read(ambiguous)!.groups[0]!.attribution).toMatchObject({ name: null, nameReasonCode: "GROUP_NAME_AMBIGUOUS", ownerUserId: null, ownerReasonCode: "GROUP_OWNER_NOT_PUBLISHED" });
    const noReason = contributors(); Object.assign(noReason.groups[0].attribution, { name: null });
    expect(read(noReason)).toBeNull();
    const reasonAndValue = contributors(); Object.assign(reasonAndValue.groups[0].attribution, { owner_reason_code: "GROUP_OWNER_AMBIGUOUS" });
    expect(read(reasonAndValue)).toBeNull();
    const otherAlpha = contributors(); otherAlpha.groups[0].attribution.alpha_id = "TEST_ONLY:another";
    expect(read(otherAlpha)).toBeNull();
    const unknownReason = contributors(); Object.assign(unknownReason.groups[0].attribution, { name: null, name_reason_code: "SECRET" });
    expect(read(unknownReason)).toBeNull();
    const extraKey = contributors(); extraKey.groups[0].attribution.email = "x@y";
    expect(read(extraKey)).toBeNull();
  });
  it("an attribution on a group that is not keyed by alpha_id is refused", () => {
    const body = contributors(); body.groups[0].key = [{ field: "portfolio_id", value: "TEST_ONLY:portfolio" }];
    expect(read(body)).toBeNull();
  });
  it("a body without group_page still reads (bare reads are unchanged)", () => {
    const body = contributors(); delete body.group_page; delete body.groups[0].attribution;
    const dataset = read(body)!;
    expect(dataset.groupPage).toBeUndefined();
    expect(dataset.groups[0]!.attribution).toBeUndefined();
  });
});

describe("the request", () => {
  const base = { surface: "FUND", environment: "paper", groupBy: ["alpha_id"] } as const;
  it("carries group_limit and ONE direction of group cursor, only with a group_by", () => {
    const first = encodeManagerDatasetQuery({ ...base, groupLimit: 50, limit: 1 } as never);
    expect(first?.wire).toMatchObject({ group_by: "alpha_id", group_limit: "50", limit: "1" });
    expect(encodeManagerDatasetQuery({ ...base, groupLimit: 50, groupAfter: "abc" } as never)?.wire).toMatchObject({ group_after: "abc" });
    expect(encodeManagerDatasetQuery({ ...base, groupBefore: "abc" } as never)?.wire).toMatchObject({ group_before: "abc" });
    expect(encodeManagerDatasetQuery({ ...base, groupAfter: "a", groupBefore: "b" } as never)).toBeNull();
    expect(encodeManagerDatasetQuery({ surface: "FUND", environment: "paper", groupLimit: 50 } as never)).toBeNull();
    for (const bad of [0, 201, 1.5, -1]) expect(encodeManagerDatasetQuery({ ...base, groupLimit: bad } as never)).toBeNull();
    expect(encodeManagerDatasetQuery({ ...base, groupAfter: "" } as never)).toBeNull();
    expect(encodeManagerDatasetQuery({ ...base, groupAfter: "x".repeat(4097) } as never)).toBeNull();
  });
  it("the answer must echo the asked group limit, and a body that does not page groups cannot answer a paged ask", () => {
    const body = read(paged(207, 50, 0))!;
    expect(datasetQueryMismatch(body, { ...base, groupLimit: 50 } as never)).not.toBe("group_limit");
    expect(datasetQueryMismatch(body, { ...base, groupLimit: 25 } as never)).toBe("group_limit");
    const bare = contributors(); delete bare.group_page;
    expect(datasetQueryMismatch(read(bare)!, { ...base, groupLimit: 50 } as never)).toBe("group_limit");
    expect(datasetQueryMismatch(read(bare)!, { ...base, groupAfter: "abc" } as never)).toBe("group_limit");
  });
});
