/**
 * The preview lane in a test: the SAME answer order as `apps/portal/fixture-bff/app.ts` (`answerFor`), the populated review profile
 * at medium scale, behind the real `createHttpApi` client and its readers. So a screen test here sees what a reviewer on the fixture
 * preview sees for a subject: the review dataset and series (`review-manager.ts`, WP-C section), then the e2e doubles for every other
 * read, then the review relations transform. FIXTURE_LAB only; never acceptance evidence.
 */
import { vi } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../../../../e2e/bffAnswerer";
import { setFixtureNow, setFixtureScale } from "../../../../../e2e/bffScale";
import { answerReviewManager } from "../../../../../../fixture-bff/review-manager";
import { transformReviewBody } from "../../../../../../fixture-bff/review-relations";
import { createHttpApi } from "../../../api/httpApi";
import type { ExecutionApi } from "../../../api/ports";
import type { DeliveryPolicy } from "../../../profile";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true,
  paperCommandsEnabled: true, sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};

export const PREVIEW_NOW = "2026-10-22T12:00:00Z";

export interface PreviewLane {
  api: ExecutionApi;
  /** Every request URL, in order. */
  calls: string[];
  callsTo(part: string): string[];
}

/** Call in a test; undo with `endPreviewLane()` (afterEach). */
export function startPreviewLane(): PreviewLane {
  setFixtureScale("medium");
  setFixtureNow(PREVIEW_NOW);
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    calls.push(input);
    const url = new URL(String(input), "http://fixture.test");
    const search = url.search;
    const request = { method: "GET", path: url.pathname, search, headers: {}, body: null };
    const review = answerReviewManager("GET", url.pathname, new URLSearchParams(search), "populated");
    const answered = review === null ? answerFixtureRequest(request, { ...V2_OPTIONS, simulated: true }) : { ...review, headers: { "content-type": "application/json" } };
    if (answered === null) return new Response(JSON.stringify({ error: { code: "FIXTURE_GAP" } }), { status: 501, headers: { "content-type": "application/json" } });
    const body = answered.status === 200 ? transformReviewBody(url.pathname, answered.body, "populated") : answered.body;
    return new Response(JSON.stringify(body), { status: answered.status, headers: { "content-type": "application/json" } });
  });
  return { api: createHttpApi({ policy: OPEN, readScope: {} }), calls, callsTo: (part) => calls.filter((c) => new URL(c, "http://fixture.test").pathname.includes(part)) };
}

export function endPreviewLane(): void {
  vi.unstubAllGlobals();
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
}
