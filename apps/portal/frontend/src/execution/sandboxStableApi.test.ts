/**
 * Every V2 screen reads once per open (UXM-10 F-8, RV-07; first the Sandbox, now all of them). jsdom cannot show the browser
 * effect (the coexistence spec's `budget` rows do: a tab click or the `?tab=Promotion+plans` rewrite used to read again), so this
 * pins the cause and the rule that fixes it, in the route that builds the port. The behaviour (same port across a tab, a new
 * port and an aborted old one across a policy value or session change) is `useValueStableApi.test.tsx`.
 *
 * `screenDeliveryPolicy` returns a NEW object on every call, so `useMemo(() => createHttpApi({ policy }), [policy])` was a new
 * `api` after every URL change, and every screen effect that lists `api` ran again. The port is keyed on the policy's value
 * and the session, and it is the only port the route hands the screens (the cockpit's request port is keyed the same way).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { screenDeliveryPolicy } from "./profile";

const route = readFileSync(resolve(__dirname, "ExecutionPreviewRoute.tsx"), "utf8");

describe("every screen is given a port that survives a URL change", () => {
  it("the policy read from a screen is a new object each time (why the plain memo is not stable)", () => {
    const screen = { delivery_policy: { policy_revision: 4, query_enabled: true } };
    const a = screenDeliveryPolicy(screen);
    const b = screenDeliveryPolicy(screen);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("the route builds its ports with the value-keyed hook, not with a memo on the policy object", () => {
    expect(route).toMatch(/const api = useValueStableApi\(policy, scopeKey, \{ make: createHttpApi \}\)/);
    expect(route).toMatch(/const requestApi = useValueStableApi\(requestPolicy, scopeKey, \{ make: createHttpApi, forgetRuntime: false \}\)/);
    expect(route).toMatch(/const scopeKey = retainedSessionKey\(useSession\(\)\.principal\)/);
    // The only mention of the factory is as the port's transport; no memo on the policy object builds a port.
    expect(route).not.toMatch(/useMemo\(\(\) => createHttpApi/);
    expect(route).not.toMatch(/stableApi/);
  });

  it("the Sandbox, Canary and Live eligibility wrappers and their screens all take that one `api`", () => {
    expect(route).toMatch(/<V2StageEligibility api=\{api\} workspaceId=\{routeWorkspaceId\}><V2Sandbox api=\{api\}/);
    expect(route).toMatch(/<V2StageEligibility api=\{api\} workspaceId=\{routeWorkspaceId\}><V2Canary api=\{api\}/);
    expect(route).toMatch(/<V2StageEligibility api=\{api\} workspaceId=\{routeWorkspaceId\}><V2Live api=\{api\}/);
    expect(route).toMatch(/<V2Workbench api=\{api\} deploymentId=\{deploymentId\} \/>/);
    expect(route).toMatch(/<V2Portfolio api=\{api\} portfolioId=\{params\.portfolioId\} \/>/);
  });
});
