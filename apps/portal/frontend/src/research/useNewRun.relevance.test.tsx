import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { emptyDraft } from "./NewRunRoute";
import { NO_LIMITS, type RunDraft } from "./runDraft";
import { runCreateApi, type RunCreateResponse } from "./runCreateClient";
import { useNewRun } from "./useNewRun";

vi.mock("./usePreflight", () => ({ usePreflight: () => ({ preflight: { preflight_token: "pf_relevance", may_create_run: true } }) }));
const accepted = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/run-create.json"), "utf8")) as RunCreateResponse;
const draft = (): RunDraft => ({ ...emptyDraft(), alphaId: "delta-rsi", alphaVersionId: "av_delta_1", strategyId: "delta-rsi", datasetId: "dataset-fixture", symbol: "BTCUSDT", timeframe: "1h", windows: { is: { start: "2026-01-01T00:00", endExclusive: "2026-02-01T00:00" }, oos: { start: "2026-02-01T00:00", endExclusive: "2026-03-01T00:00" }, holdout: { start: "2026-03-01T00:00", endExclusive: "2026-04-01T00:00" } }, optimizationMode: "mode_1_decay", optimizationSchedule: "global", optunaTrials: "1", engineReleaseId: "quantbt_111", configDigest: "fixture-digest" });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["ack", "refusal"])("A create pending → patch B → late A %s cannot attach to B", async outcome => {
  let resolve!: (value: RunCreateResponse) => void, reject!: (reason: Error) => void;
  const create = vi.spyOn(runCreateApi, "create").mockImplementation(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }));
  const { result } = renderHook(() => useNewRun(draft(), NO_LIMITS, "workspace_a"));
  expect(result.current.blocking).toEqual([]);
  act(() => { result.current.submit(); result.current.submit(); });
  expect(create).toHaveBeenCalledTimes(1); expect(result.current.canSubmit).toBe(false);
  act(() => result.current.patch({ symbol: "ETHUSDT" }));
  expect(result.current.created).toBeNull(); expect(result.current.canSubmit).toBe(false);
  await act(async () => { if (outcome === "ack") resolve(accepted); else reject(new TypeError("Late old transport refusal")); });
  await waitFor(() => expect(result.current.createState.state).toBe("empty"));
  expect(result.current.draft.symbol).toBe("ETHUSDT");
  expect(result.current.created).toBeNull(); expect(result.current.createRefusal).toBeNull();
  expect(result.current.outcomeUnknown).toBe(false);
});
it("unchanged declaration may retry the exact original intent after a refusal, but never while pending", async () => {
  const create = vi.spyOn(runCreateApi, "create").mockRejectedValueOnce(new TypeError("Lost answer")).mockResolvedValueOnce({ ...accepted, replayed: true });
  const { result } = renderHook(() => useNewRun(draft(), NO_LIMITS, "workspace_a"));
  await act(async () => result.current.submit());
  await waitFor(() => expect(result.current.outcomeUnknown).toBe(true));
  await act(async () => result.current.recheck());
  await waitFor(() => expect(result.current.created?.replayed).toBe(true));
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0]);
});

it.each(["ack", "refusal"])("unmounted declaration ignores late create %s", async outcome => {
  let resolve!: (value: RunCreateResponse) => void, reject!: (reason: Error) => void;
  vi.spyOn(runCreateApi, "create").mockImplementation(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }));
  const { result, unmount } = renderHook(() => useNewRun(draft(), NO_LIMITS, "workspace_a"));
  act(() => result.current.submit());
  const previous = result.current;
  unmount();
  await act(async () => { if (outcome === "ack") resolve(accepted); else reject(new TypeError("Late unmounted refusal")); });
  expect(result.current).toBe(previous);
  expect(result.current.created).toBeNull();
  expect(result.current.createRefusal).toBeNull();
});
