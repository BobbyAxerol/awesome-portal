import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compareApi, NOT_MODIFIED } from "./compareClient";
import { releaseCandidateApi } from "./releaseCandidateClient";
import { reportApi } from "./reportClient";
import { forgetRunLabels, runLabelFor } from "./runLabels";

const RUN = "rrun_e1fa9e5c0f2b41d3a0c7e3b54a17d5aa";
const OTHER = "rrun_8c9c1f2a3b4c5d6e7f8091a2b3c41150";

function answer(body: unknown, status = 200): Response {
  return status === 304
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => forgetRunLabels());
afterEach(() => {
  forgetRunLabels();
  vi.unstubAllGlobals();
});

describe("D1-O1 direct-link label reads", () => {
  it("learns the Report detail label and retains it on 304", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(answer({ run_id: RUN, display_label: "R-WFO-075" }))
      .mockResolvedValueOnce(answer(null, 304));
    vi.stubGlobal("fetch", fetch);

    await reportApi.detail(RUN);
    expect(runLabelFor(RUN)).toBe("R-WFO-075");
    expect(await reportApi.detail(RUN, { etag: '"detail-1"' })).toBe(NOT_MODIFIED);
    expect(runLabelFor(RUN)).toBe("R-WFO-075");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("learns Compose and Pack labels only from their own response", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(answer({ run_id: RUN, display_label: "R-WFO-075" }))
      .mockResolvedValueOnce(answer({ run_id: OTHER, display_label: "R-P04-001" })));

    await releaseCandidateApi.compose(RUN);
    await releaseCandidateApi.pack("rc_one");
    expect(runLabelFor(RUN)).toBe("R-WFO-075");
    expect(runLabelFor(OTHER)).toBe("R-P04-001");
  });

  it.each([
    ["attempts", { mode: "attempts", attempts: [{ run_id: RUN, display_label: "R-WFO-075" }] }],
    ["markets", { mode: "markets", cards: [{ run: { run_id: RUN, display_label: "R-WFO-075" } }] }],
    ["pair", { mode: "pair", state: "AVAILABLE", pair: { runs: [{ run_id: RUN, display_label: "R-WFO-075" }] } }],
  ] as const)("learns Compare %s labels without numbering runs", async (_mode, result) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer({ result })));
    await compareApi.get("alpha_one", { mode: _mode });
    expect(runLabelFor(RUN)).toBe("R-WFO-075");
  });

  it("does not invent labels for refused or unlabelled reads", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(answer({ result: { mode: "pair", state: "REFUSED", pair: null } }))
      .mockResolvedValueOnce(answer({ run_id: RUN, display_label: null })));
    await compareApi.get("alpha_one", { mode: "pair", runs: [RUN, OTHER] });
    expect(runLabelFor(RUN)).toBeNull();
    await reportApi.detail(RUN);
    expect(runLabelFor(RUN)).toBeNull();
  });
});
