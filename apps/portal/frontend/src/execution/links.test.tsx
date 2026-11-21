/**
 * `canonicalHref` (M11, #6): the server writes `?operation_id=` and
 * `?filter=findings|broker_sync` on the command-center links; Operations reads
 * `?operation=`. The correction is shared by the V1 Command Center and the V2
 * Overview, so both consumers are held to it here.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Today } from "./screens/CommandCenter";
import type { TodayPanel } from "./commandCenter";
import { canonicalHref } from "./links";

afterEach(cleanup);

describe("canonicalHref", () => {
  it("maps the server's ?operation_id= to the deep link Operations reads", () => {
    expect(canonicalHref("/execution/operations?operation_id=op_1253")).toBe("/execution/operations?operation=op_1253");
  });

  it("keeps every other param and the hash, in place", () => {
    expect(canonicalHref("/execution/operations?env=paper&operation_id=op_1&workspace_id=ws_1#row")).toBe(
      "/execution/operations?env=paper&operation=op_1&workspace_id=ws_1#row",
    );
  });

  it("an explicit operation wins over the older spelling", () => {
    expect(canonicalHref("/execution/operations?operation_id=op_old&operation=op_new")).toBe("/execution/operations?operation=op_new");
  });

  it("encodes an id the way the URL needs it", () => {
    expect(canonicalHref("/execution/operations?operation_id=op%2F1")).toBe("/execution/operations?operation=op%2F1");
  });

  it("keeps ?filter=findings and ?filter=broker_sync as the server sent them: no filter exists to map to, and none is claimed", () => {
    expect(canonicalHref("/execution/operations?filter=findings")).toBe("/execution/operations?filter=findings");
    expect(canonicalHref("/execution/operations?filter=broker_sync")).toBe("/execution/operations?filter=broker_sync");
  });

  it("leaves other routes and other params named operation_id alone", () => {
    expect(canonicalHref("/governance/approvals/AP-1/r2")).toBe("/governance/approvals/AP-1/r2");
    expect(canonicalHref("/execution/blotter?operation_id=op_1")).toBe("/execution/blotter?operation_id=op_1");
  });

  it("still normalises the two path forms it always did, and null stays null", () => {
    expect(canonicalHref("/execution/operations/op_1251")).toBe("/execution/operations?operation=op_1251");
    expect(canonicalHref("/deployments/paper/exit/AP-7")).toBe("/governance/exit-reviews/AP-7");
    expect(canonicalHref(null)).toBeNull();
    expect(canonicalHref("")).toBeNull();
  });
});

describe("the V1 consumer (Command Center, Today)", () => {
  it("renders the corrected link", () => {
    const panel = {
      state: "ok",
      authority: null,
      freshness: null,
      counts: { shown: 1, total: 1, exact: true, truncated: false, limit: null },
      items: [{ id: "t1", kind: "OPERATION", label: "Protective action partial", scheduledAt: null, authority: null, href: "/execution/operations?operation_id=op_1251" }],
    } as unknown as TodayPanel;
    render(<Today panel={panel} />);
    expect(screen.getByRole("link", { name: "Protective action partial" }).getAttribute("href")).toBe("/execution/operations?operation=op_1251");
  });
});
