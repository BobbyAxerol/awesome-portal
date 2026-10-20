/**
 * Sandbox reads once per open (UXM-10 F-8). jsdom cannot show the browser effect (the coexistence spec's `budget · sandbox*` rows
 * do: a tab click or the `?tab=Promotion+plans` rewrite used to read the certification, the capabilities and the eligibility
 * again), so this pins the cause and the rule that fixes it, in the route that builds the port.
 *
 * `screenDeliveryPolicy` returns a NEW object on every call, so `useMemo(() => createHttpApi({ policy }), [policy])` is a new `api`
 * after every URL change, and every screen effect that lists `api` runs again. The V2 Sandbox is handed an api keyed on the
 * policy's value; the other screens keep the memo they had.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { screenDeliveryPolicy } from "./profile";

const route = readFileSync(resolve(__dirname, "ExecutionPreviewRoute.tsx"), "utf8");

describe("the Sandbox is given a port that survives a URL change", () => {
  it("the policy read from a screen is a new object each time (why the plain memo is not stable)", () => {
    const screen = { delivery_policy: { policy_revision: 4, query_enabled: true } };
    const a = screenDeliveryPolicy(screen);
    const b = screenDeliveryPolicy(screen);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("the V2 Sandbox and its eligibility wrapper take the value-keyed port; the V1 branch and other screens still take `api`", () => {
    expect(route).toMatch(/const stableApi = useMemo\(\(\) => createHttpApi\(\{ policy \}\), \[policyKey\]\)/);
    expect(route).toMatch(/const policyKey = JSON\.stringify\(policy\)/);
    expect(route).toMatch(/<V2StageEligibility api=\{stableApi\} workspaceId=\{routeWorkspaceId\}><V2Sandbox api=\{stableApi\}/);
    expect(route).toMatch(/<SandboxCertificationContainer api=\{api\} deploymentId=\{deploymentId\} \/>/);
    expect(route).toMatch(/<V2Canary api=\{api\} deploymentId=\{deploymentId\} \/>/);
  });
});
