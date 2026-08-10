import { describe, expect, it } from "vitest";

import { canOpenRunResults, isTerminal } from "./api";

describe("run result routing", () => {
  it("opens result views only for completed runs", () => {
    expect(canOpenRunResults("COMPLETED")).toBe(true);
    expect(canOpenRunResults("FAILED")).toBe(false);
    expect(canOpenRunResults("CANCELLED")).toBe(false);
    expect(canOpenRunResults("OPTIMIZING_IS")).toBe(false);
  });

  it("stops status polling for every terminal state", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("SELECTING_PARAMS")).toBe(false);
  });
});
