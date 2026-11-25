/**
 * P1 display fields on the SCOPED_V2 body: strategies.description, deployments.account_policy_id / risk_profile_id.
 * Optional and nullable: a stated value reads, a stated null and an absent member both read as "not stated" (never 0, never a stand-in).
 */
import { describe, expect, it } from "vitest";

import { readAlphaResourceScoped } from "../../readers/alphaResourceScoped";
import { loadCanonical } from "../../testkit/loadCanonical";
import { alphaViewOf } from "./view";

type Body = { resource: { id: string }; data: Record<string, Record<string, unknown>[]> };
const FILE = "execution-resource-scoped-p1-fields.synthetic.valid.json";
const body = (): Body => structuredClone(loadCanonical<{ cases: Body[] }>(FILE).cases[0]!);
const viewOf = (b: Body) => {
  const read = readAlphaResourceScoped(b);
  expect(read).not.toBeNull();
  return alphaViewOf({ variant: "scoped", scoped: read! }, b.resource.id);
};

describe("scoped P1 fields", () => {
  it("reads the canonical fixture that carries them", () => {
    const b = body();
    const view = viewOf(b);
    expect(view.description).toBe("TEST_ONLY strategy description");
    expect(view.rows[0]).toMatchObject({ accountPolicyId: "policy_TEST_ONLY", riskProfileId: null });
  });

  it.each([[null], ["__absent__"]])("a description that is %j reads as not stated", (raw) => {
    const b = body();
    if (raw === "__absent__") delete b.data.strategies![0]!.description; else b.data.strategies![0]!.description = raw;
    expect(viewOf(b).description).toBeNull();
  });

  it("policy and risk profile absent from the row read as null, not as an empty or zero value", () => {
    const b = body();
    delete b.data.deployments![0]!.account_policy_id;
    delete b.data.deployments![0]!.risk_profile_id;
    expect(viewOf(b).rows[0]).toMatchObject({ accountPolicyId: null, riskProfileId: null });
  });

  it("a number is not a description or an id (the reader refuses it)", () => {
    const b = body();
    b.data.deployments![0]!.account_policy_id = 0;
    expect(readAlphaResourceScoped(b)).toBeNull();
  });
});
