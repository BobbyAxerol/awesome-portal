import { describe, expect, it } from "vitest";
import { CLIENT_WINDOW_MAX, LEGACY_WINDOW_MAX, foldWindowLimit } from "./useReplay";

describe("§59 foldWindowLimit", () => {
  it("reads a fold whole when it fits what the server serves", () => {
    expect(foldWindowLimit(168, 8192)).toBe(168);
    expect(foldWindowLimit(168, 400)).toBe(168);
  });
  it("never asks for more than the server advertises, and falls back to the legacy 200 when it advertises nothing", () => {
    expect(foldWindowLimit(2160, 400)).toBe(400);
    expect(foldWindowLimit(2160, undefined)).toBe(LEGACY_WINDOW_MAX);
    expect(foldWindowLimit(2160, null)).toBe(LEGACY_WINDOW_MAX);
  });
  it("is capped by what the screen draws", () => {
    expect(foldWindowLimit(9000, 8192)).toBe(CLIENT_WINDOW_MAX);
  });
});
