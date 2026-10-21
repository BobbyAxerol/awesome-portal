import { describe, expect, it } from "vitest";
import { AccessPolicyError } from "../src/execution-v2/access.contract";
import { nativeInstallFailureCode } from "../src/execution-v2/native-install-error";

describe("Core009 owner-install safe diagnostics", () => {
  it.each(["POLICY_REVISION_CONFLICT", "RECEIPT_NOT_QUALIFIED"] as const)(
    "returns the documented %s category without the exception message", code => {
      const error = new AccessPolicyError(code);
      error.message = "TEST_ONLY private artifact /run/private/key and SQL detail";
      expect(nativeInstallFailureCode(error)).toBe(code);
    });
  it.each([
    "CURRENT_HUMAN_SCHEMA_TARGET_MISMATCH",
    "NATIVE_RESEARCH_INSTALL_GRANT_WINDOW_REQUIRED",
  ])("preserves the existing safe %s category", code => {
    expect(nativeInstallFailureCode(new Error(code))).toBe(code);
  });
  it.each([
    { code: "POLICY_REVISION_CONFLICT", message: "TEST_ONLY private artifact" },
    Object.assign(new Error("TEST_ONLY SQL detail"), { code: "RECEIPT_NOT_QUALIFIED" }),
    new Error("RECEIPT_NOT_QUALIFIED"),
    new Error("CURRENT_HUMAN_SCHEMA_FAILED /run/private/key"),
    new AccessPolicyError("ACCESS_RETRY_REQUIRED"),
    null, undefined, "TEST_ONLY private bytes",
  ])("does not expose an untrusted, unrelated or detailed error", error => {
    expect(nativeInstallFailureCode(error)).toBe("NATIVE_RESEARCH_INSTALL_FAILED");
  });
});
