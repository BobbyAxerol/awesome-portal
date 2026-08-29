/**
 * B7 — the inbox's chips are the server's views, and the parameter is `view`.
 *
 * Both halves are read from `apps/control-api/src/governance/contracts.ts`
 * rather than from a copy here. That file rejects the old `filter` spelling
 * outright now, so sending it is a failure rather than a silently-default
 * INBOX — which is what made the original bug invisible: every chip served the
 * inbox and looked right.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INBOX_FILTERS } from "./screens/ApprovalInbox";
import { ApprovalInboxContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";
import { createHttpApi } from "./api/httpApi";
import type { DeliveryPolicy } from "./profile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CONTRACTS = join(
  __dirname,
  "../../../../../apps/control-api/src/governance/contracts.ts",
);

/** The keys of `viewFilter` — the only views the server will honour. */
function serverViews(): string[] {
  const source = readFileSync(CONTRACTS, "utf8");
  const start = source.indexOf("const viewFilter");
  expect(start, "viewFilter not found — the extraction below proves nothing").toBeGreaterThan(0);
  const block = source.slice(start, source.indexOf("if (!(view in viewFilter))", start));
  // `[A-Z0-9_]`, not `[A-Z_]`: R1 and R2 contain digits, and the first draft of
  // this regex silently skipped both — the two views this test was written to
  // check. A gate blind to exactly what it checks is worse than no gate.
  return [...block.matchAll(/^\s*([A-Z][A-Z0-9_]*):\s*\[/gm)].map((m) => m[1]);
}

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  governanceWriteEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

describe("the chips are exactly the views the server serves", () => {
  it("finds the server's list at all", () => {
    expect(serverViews().length).toBeGreaterThanOrEqual(9);
  });

  it("offers every one of them and invents none", () => {
    // R2 was the one missing: the server served it, the screen had no chip, and
    // nothing anywhere said so.
    expect([...INBOX_FILTERS].sort()).toEqual(serverViews().sort());
  });

  it("renders a chip for each", async () => {
    render(<ApprovalInboxContainer api={createFixtureApi()} />);
    await screen.findByText("AP-352");
    for (const view of INBOX_FILTERS) {
      expect(
        screen.getAllByRole("button").some((b) => b.getAttribute("data-filter") === view)
          || screen.queryByRole("button", { name: new RegExp(view.replace("_", " "), "i") }),
        view,
      ).toBeTruthy();
    }
  });
});

describe("the query parameter is `view`", () => {
  it("sends view and never the rejected `filter` spelling", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await createHttpApi({ policy: OPEN }).listApprovals({ filter: "R2", limit: 25 });
    expect(calls[0]).toContain("view=R2");
    // The server pushes an invalid filter for this key rather than ignoring it.
    expect(calls[0]).not.toContain("filter=");
  });

  it("carries each chip through as its own view", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const api = createHttpApi({ policy: OPEN });
    for (const view of INBOX_FILTERS) await api.listApprovals({ filter: view, limit: 25 });
    for (const [i, view] of INBOX_FILTERS.entries()) {
      expect(calls[i], view).toContain(`view=${view}`);
    }
  });
});

/* ---------------------------------------------------------------------------
 * B8 — the routes a decision travels, and the permission it answers to.
 * ------------------------------------------------------------------------ */

describe("apply and poll reach the routes the controller mounts", () => {
  function serving() {
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return new Response(JSON.stringify({ operation_id: "op_1", status: "APPLIED_UNVERIFIED" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=tok" });
    return calls;
  }

  it("applies at /operations/{id}/apply, not under /governance", async () => {
    const calls = serving();
    await createHttpApi({ policy: OPEN }).applyPlan("op_1", "tok", "ws_1");
    expect(calls[0].url).toBe("/api/v1/execution/operations/op_1/apply");
    // The extra segment made this 404 — the same defect the plan route carried.
    expect(calls[0].url).not.toContain("/governance/operations");
  });

  it("polls at /operations/{id}", async () => {
    const calls = serving();
    await createHttpApi({ policy: OPEN }).pollOperation("op_1");
    expect(calls[0].url).toBe("/api/v1/execution/operations/op_1");
    expect(calls[0].url).not.toContain("/governance/operations");
  });

  it("matches the routes the OpenAPI declares", () => {
    const paths = Object.keys(
      JSON.parse(
        readFileSync(
          join(
            __dirname,
            "../../../../../packages/contracts/openapi/execution-governance.openapi.json",
          ),
          "utf8",
        ),
      ).paths,
    );
    expect(paths).toContain("/api/v1/execution/operations/{operation_id}/apply");
    expect(paths).toContain("/api/v1/execution/operations/{operation_id}");
    expect(paths).toContain("/api/v1/execution/commands/plans");
    // The three the adapter used to invent.
    for (const invented of [
      "/api/v1/execution/governance/operations/{operation_id}/apply",
      "/api/v1/execution/governance/operations/{operation_id}",
      "/api/v1/execution/governance/approvals/{approval_id}/decision-plans",
    ]) {
      expect(paths, invented).not.toContain(invented);
    }
  });
});

describe("a governance write answers to its own gate", () => {
  it("is refused with no policy at all, and says a decision cannot be recorded", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi({ policy: null });
    const planned = await api.planDecision({
      approvalId: "AP-1",
      workspaceId: "ws",
      decision: "APPROVE",
      reason: "eight or more",
      expectedApprovalVersion: 1,
      requestKey: "rk",
    });
    expect(planned.ok).toBe(false);
    if (!planned.ok) expect(planned.reason).toMatch(/no decision can be recorded/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the conflation rather than hiding it behind a command tier", async () => {
    const closed = { ...OPEN, paperCommandsEnabled: false };
    const result = await createHttpApi({ policy: closed }).applyPlan("op_1", "tok", "ws");
    expect(result.ok).toBe(false);
    // The operator reads why, and the reason names the request that would end it.
    if (!result.ok) expect(result.reason).toMatch(/BR-EX-31/);
  });
});
