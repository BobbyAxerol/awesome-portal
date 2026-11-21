/** BE-P10. TEST_ONLY. The three new reviewed templates track the strict production schemas, carry the exact
 * Research target, hold no secret, and the Plan B runtime/owner templates carry the 2 h / trust caps. */
import { describe, expect, it } from "vitest";
import { acceptanceIssueDocument, acceptanceRevokeDocument } from "../src/execution-v2/research-acceptance-session";
import { managerRevokeDocument } from "../src/execution-v2/manager-domain-revoke";
import { parseOwnerArtifactArgs } from "../src/execution-v2/private-root-file";
import { PLACEHOLDER_QUOTED, RUNTIME_TEMPLATE, fill, readTemplate } from "./fixtures/core009-templates";

const REVOKE = "private-owner-manager-revoke.v1.template.json";
const ISSUE = "private-owner-acceptance-session-issue.v1.template.json";
const SESSION_REVOKE = "private-owner-acceptance-session-revoke.v1.template.json";
const runtimeTarget = JSON.parse(readTemplate(RUNTIME_TEMPLATE)).composition.owner_intakes[0].target;

describe("BE-P10 reviewed templates", () => {
  it.each([REVOKE, ISSUE, SESSION_REVOKE])("%s: one placeholder grammar, the exact Research target, no secret material", name => {
    const text = readTemplate(name);
    expect(() => JSON.parse(text)).not.toThrow();
    const all = text.match(/<<FILL:/g)?.length ?? 0;
    expect(all).toBeGreaterThan(0);
    expect([...text.matchAll(PLACEHOLDER_QUOTED)].length).toBe(all);
    expect(JSON.parse(text).target).toEqual(runtimeTarget);
    expect(text).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?:\/\/|password|Bearer |token":\s*"[A-Za-z0-9_-]{20,}/i);
  });
  it("the filled templates satisfy the strict schemas the CLIs read", () => {
    expect(managerRevokeDocument.safeParse(JSON.parse(fill(readTemplate(REVOKE)))).success).toBe(true);
    expect(acceptanceIssueDocument.safeParse(JSON.parse(fill(readTemplate(ISSUE), { SESSION_TTL_SECONDS: 3600 }))).success).toBe(true);
    expect(acceptanceRevokeDocument.safeParse(JSON.parse(fill(readTemplate(SESSION_REVOKE)))).success).toBe(true);
  });
  it("the session TTL placeholder cannot be filled beyond two hours or below one minute", () => {
    for (const ttl of [7201, 59])
      expect(acceptanceIssueDocument.safeParse(JSON.parse(fill(readTemplate(ISSUE), { SESSION_TTL_SECONDS: ttl }))).success).toBe(false);
  });
  it("the issue artifact is bound to the protected owner (any other user id is refused)", () => {
    const value = JSON.parse(fill(readTemplate(ISSUE), { SESSION_TTL_SECONDS: 3600 }));
    expect(acceptanceIssueDocument.safeParse({ ...value, user_id: "usr_other" }).success).toBe(false);
  });
  it("the revoke template names READ and STREAM separately, REVOKE mode, never both in one item", () => {
    const value = JSON.parse(readTemplate(REVOKE));
    expect(value.items.map((i: { action: string; mode: string }) => [i.action, i.mode])).toEqual([["business.read_all", "REVOKE"], ["stream.subscribe", "REVOKE"]]);
  });
  it("the Plan B runtime template carries the grant_window pin with the 2 h cap placeholder and the trust end", () => {
    const window = JSON.parse(readTemplate(RUNTIME_TEMPLATE)).composition.owner_intakes[0].grant_window;
    expect(window.plan).toBe("READ_AND_STREAM");
    expect(window.maximum_grant_ms).toMatch(/PLAN_B_MAXIMUM_GRANT_MS/);
    expect(window.trust_not_after_ms).toMatch(/TRUST_NOT_AFTER_MS/);
  });
});

describe("BE-P10 offline CLI argv (validated before any file or database is touched)", () => {
  const good = ["--artifact", "/root/a.json", "--sha256", "a".repeat(64), "--not-before-ms", "1000", "--not-after-ms", "2000"];
  it("accepts exactly the four flags plus --dry-run", () => {
    expect(parseOwnerArtifactArgs(good)).toEqual({ artifact: "/root/a.json", sha256: "a".repeat(64), notBeforeMs: 1000, notAfterMs: 2000, dryRun: false });
    expect(parseOwnerArtifactArgs([...good, "--dry-run"]).dryRun).toBe(true);
  });
  it.each([
    ["an unknown flag", [...good, "--force", "1"]], ["a missing value", good.slice(0, -1)], ["a duplicated flag", [...good, "--artifact", "/root/b.json"]],
    ["a relative artifact", ["--artifact", "a.json", ...good.slice(2)]], ["an uppercase/short hash", ["--artifact", "/root/a.json", "--sha256", "A".repeat(64), ...good.slice(4)]],
    ["a reversed window", [...good.slice(0, 4), "--not-before-ms", "2000", "--not-after-ms", "1000"]],
    ["a window longer than 24 h", [...good.slice(0, 4), "--not-before-ms", "0", "--not-after-ms", String(86_400_001)]],
    ["a non-numeric bound", [...good.slice(0, 4), "--not-before-ms", "soon", "--not-after-ms", "2000"]],
    ["no flags", []],
  ])("refuses %s as a usage error", (_n, argv) => {
    expect(() => parseOwnerArtifactArgs(argv)).toThrow("OWNER_ARTIFACT_USAGE");
  });
});
