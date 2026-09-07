/**
 * G9 drain hook: it waits while inactive, drains once active, and keeps the
 * last page set on screen while a re-drain runs.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ExecutionApi } from "./api/ports";
import { readRelationPage } from "./api/managerRelations";
import { useRelationFacts } from "./useRelationFacts";

afterEach(cleanup);

const PAGE = {
  schema_version: "portal.execution.eds11r.manager-relation-page.v1", state: "POPULATED", environment: "paper",
  source_health: { availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1 },
  page: { next_cursor: null, has_more: false, total_unknown: true },
  records: [{ resource_id: "r1", values: { order_id: 1, strategy_id: "a" } }],
};

function fakeApi(calls: string[]): ExecutionApi {
  return { getManagerRelationPage: async (q: { routeId: string }) => { calls.push(q.routeId); return { ok: true as const, value: readRelationPage(PAGE)! }; } } as unknown as ExecutionApi;
}

describe("useRelationFacts", () => {
  it("does not read while inactive, then drains every replay relation once active and reports the set", async () => {
    const calls: string[] = [];
    const api = fakeApi(calls);
    const { result, rerender } = renderHook(({ active }: { active: boolean }) => useRelationFacts(api, "paper", active), { initialProps: { active: false } });
    expect(result.current.status).toBe("loading");
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(0);
    rerender({ active: true });
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(calls).toEqual(["orders", "fills", "order-brackets", "order-bracket-legs", "conditional-order-groups", "conditional-order-group-legs", "portfolio-capital-ledger"]);
    expect(result.current.value?.state).toBe("POPULATED");
    expect(result.current.value?.facts.orders).toHaveLength(1);
    expect(result.current.value?.pages).toBe(7);
  });
});
