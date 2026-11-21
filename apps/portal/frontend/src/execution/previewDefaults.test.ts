/**
 * QA2 R4-01: the registry's canonical route of the Blotter (/deployments/blotter) renders the Blotter by itself: the feature has a
 * default preview screen, and that screen is one the preview owns.
 */
import { describe, expect, it } from "vitest";

import { EXECUTION_PREVIEW_FEATURE_DEFAULTS, hasExecutionPreview } from "./previewRegistry";

describe("preview feature defaults", () => {
  it("the Blotter feature opens the full blotter screen on its canonical route", () => {
    expect(EXECUTION_PREVIEW_FEATURE_DEFAULTS.EXECUTION_BLOTTER).toBe("EXECUTION_FULL_BLOTTER_SCREEN");
    expect(hasExecutionPreview("EXECUTION_FULL_BLOTTER_SCREEN")).toBe(true);
  });

  it("every default points at a screen the preview owns", () => {
    for (const screen of Object.values(EXECUTION_PREVIEW_FEATURE_DEFAULTS)) expect(hasExecutionPreview(screen), screen).toBe(true);
  });
});
