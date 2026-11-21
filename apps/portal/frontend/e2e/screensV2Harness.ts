/**
 * Test harness for the S2 screens (Overview, Blotter, Admin): the REAL HTTP
 * client over a stubbed `fetch` that is answered by the Playwright doubles, so a
 * screen test exercises the same readers the product does.
 *
 * Order of answers: the S2 double first (`answerOverview`), then the V2
 * operations double, then the main BFF double. Anything none of them knows is a
 * 501 with its path, so a forgotten route fails loudly.
 *
 * Tests only (it imports `vitest`). It lives in `e2e/`, outside `src`, because
 * the product-boundary walk treats every non-test file under `src/execution/v2`
 * as product; no product file may import it.
 */
import { vi } from "vitest";

import { answerExecutionBff } from "./bffDouble";
import { answerOverview } from "./bffDoubleOverview";
import { answerOperationsV2 } from "./bffDoubleV2";
import { createHttpApi } from "../src/execution/api/httpApi";
import type { ExecutionApi } from "../src/execution/api/ports";
import type { DeliveryPolicy } from "../src/execution/profile";

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

export interface Call {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

/** Routes `fetch` to the doubles and records every call. Undo with `vi.unstubAllGlobals()`. */
export function serveDoubles(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const method = init?.method ?? "GET";
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ method, path: url.pathname.replace(/^\/api\/v1\/execution/, ""), query: url.search, body });
    const answer =
      answerOverview(method, url.pathname, url.searchParams, body) ??
      (method === "GET" ? answerOperationsV2(method, url.pathname.replace(/^\/api\/v1\/execution/, ""), url.searchParams) : null) ??
      answerExecutionBff(method, url.pathname, url.searchParams);
    return new Response(typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": answer.contentType ?? "application/json" },
    });
  });
  return calls;
}

export const httpApi = (): ExecutionApi => createHttpApi({ policy: OPEN, readScope: {} });
