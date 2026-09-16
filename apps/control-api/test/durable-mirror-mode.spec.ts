import { describe, expect, it } from "vitest";
import {
  durableMirrorMode,
  durableMirrorReadEnabled,
  durableMirrorWriteEnabled,
  legacyHistoryWriteEnabled,
} from "../src/execution/durable-mirror-mode";

const flags = (write: "true" | "false", reads: "true" | "false") => ({
  FEATURE_EXECUTION_DURABLE_MIRROR: write,
  FEATURE_EXECUTION_DURABLE_MIRROR_READS: reads,
});

describe("durable mirror write/read cutover", () => {
  it("keeps legacy reads and writes during writer-only warm-up", () => {
    const config = flags("true", "false");
    expect(durableMirrorWriteEnabled(config)).toBe(true);
    expect(durableMirrorReadEnabled(config)).toBe(false);
    expect(legacyHistoryWriteEnabled(config)).toBe(true);
    expect(durableMirrorMode(config)).toBe("DUAL_WRITE_WARMUP");
  });

  it("moves the reader only when both flags are true", () => {
    const config = flags("true", "true");
    expect(durableMirrorWriteEnabled(config)).toBe(true);
    expect(durableMirrorReadEnabled(config)).toBe(true);
    expect(legacyHistoryWriteEnabled(config)).toBe(false);
    expect(durableMirrorMode(config)).toBe("MIRROR_READ_ACTIVE");
  });

  it("leaves the compatible table as the sole store while the mirror is disabled", () => {
    const config = flags("false", "false");
    expect(durableMirrorWriteEnabled(config)).toBe(false);
    expect(durableMirrorReadEnabled(config)).toBe(false);
    expect(legacyHistoryWriteEnabled(config)).toBe(true);
    expect(durableMirrorMode(config)).toBe("LEGACY_ONLY");
  });
});
