/**
 * The real HTTP client against the Alpha 360 e2e double, for the screen tests.
 *
 * `fetch` is routed to `answerAlpha`; the client under test is `createHttpApi`,
 * so every body passes through the product readers, not through a hand-built
 * object. An `override` can replace or refuse any one path (a 503, a slow
 * page, an empty body); anything the double does not know answers 501 so a
 * wrong path fails loudly.
 */
import { vi } from "vitest";

import { answerAlpha, type BffAnswerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { createHttpApi } from "../../../api/httpApi";
import type { ExecutionApi } from "../../../api/ports";
import type { DeliveryPolicy } from "../../../profile";

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

export type Override = (path: string, search: URLSearchParams) => BffAnswerAlpha | null | undefined;

export interface ServedDouble {
  /** Every request URL, in order. */
  calls: string[];
  /** Calls whose path (no query) ends with or contains `part`. */
  callsTo(part: string): string[];
}

export function serveAlphaDouble(override?: Override): ServedDouble {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const parsed = new URL(url, "http://portal.test");
    const path = parsed.pathname.replace(/^\/api\/v1\/execution/, "");
    const answer = override?.(path, parsed.searchParams) ?? answerAlpha("GET", path, parsed.searchParams) ?? { status: 501, body: { error: { code: "bff_double_gap", message: path } } };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return { calls, callsTo: (part) => calls.filter((c) => new URL(c, "http://portal.test").pathname.includes(part)) };
}

export const alphaHttpApi = (): ExecutionApi => createHttpApi({ policy: OPEN, readScope: {} });

/** A session standing in for `useSession`. */
export function sessionOf(capabilities: Iterable<string>, userId = "principal-visual-baseline") {
  return {
    principal: { principalId: `p_${userId}`, username: "asmith", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready" as const, access: { userId, isOwner: false, ownerState: "NOT_OWNER", capabilities: [...capabilities] } },
  };
}
