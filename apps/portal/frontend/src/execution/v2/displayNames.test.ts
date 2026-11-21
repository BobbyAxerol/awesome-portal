import { describe, expect, it } from "vitest";

import { CODE_NAMES, codeName, humanizeCode, METHOD_NOT_STATED, samplingWords } from "./displayNames";

describe("display names (UXM07-048/4)", () => {
  it("names the codes the screens showed raw, and nothing a reader would have to decode", () => {
    expect(codeName("POLICY_PENDING")).toEqual({ name: "Access policy pending", known: true });
    expect(codeName("OWNER_RECOVERY_NOT_APPROVED").name).toBe("Owner recovery not approved");
    expect(codeName("PAPER_OBSERVATION").name).toBe("Paper observation");
    expect(codeName("paper_activation_authorization").name).toBe("Paper activation authorization");
    for (const [code, name] of Object.entries(CODE_NAMES)) {
      expect(name, code).not.toContain("_");
      expect(name, code).not.toMatch(/\.$/);
    }
  });

  it("an unknown code is humanized and marked unknown, never guessed at", () => {
    expect(codeName("TYPED_SOURCE_OPERATION_NOT_PUBLISHED")).toEqual({ name: "Typed source operation not published", known: false });
    expect(humanizeCode("  ")).toBe("  ");
    expect(codeName("toString").known).toBe(false);
  });

  it("names a sampling method by what it keeps; any other method is not stated", () => {
    expect(samplingWords("PER_SERIES_BUCKET_EXTREMA")).toEqual({ words: "min and max kept per bucket", known: true });
    expect(samplingWords("MIN_MAX_LAST_BUCKET_V1").words).toContain("last value");
    expect(samplingWords("LTTB")).toEqual({ words: METHOD_NOT_STATED, known: false });
    expect(samplingWords("constructor").known).toBe(false);
  });
});
