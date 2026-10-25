/** Pure wrapper conformance. No native source, grant or authority is issued. */
import { describe,expect,it,vi } from "vitest";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import type { NativeCurrentRelationsPort } from "../src/execution-v2/native-current-relations-port";
import { NativeRootReceiptProvider } from "../src/execution-v2/native-root-provider";

function pureProvider() {
  // Exercise composition without constructing a transport or seeding source
  // authority. The verifier always denies; this is not a qualified adapter.
  const provider=Object.create(NativeRootReceiptProvider.prototype) as NativeRootReceiptProvider;
  const verify=vi.spyOn(provider,"verify").mockResolvedValue(null);
  return {provider,verify};
}

describe("native ROOT wrapper preserves independent trust surfaces",()=>{
  it("retains finite CURRENT lifetime and binds every other optional method to its original receiver",async()=>{
    const {provider,verify}=pureProvider(),calls:string[]=[];
    const current:NativeCurrentRelationsPort={usesPool:()=>false,
      observe:vi.fn(async()=>new Map()),sendFinite:vi.fn(async()=>{throw new Error("TEST_ONLY_NOT_AUTHORITY");})};
    const base:AccessTrustProvider={currentRelations:current,
      async verifyPolicy(){expect(this).toBe(base);calls.push("policy");return null;},
      async verifyReceipt(){expect(this).toBe(base);calls.push("receipt");return null;},
      async relations(){expect(this).toBe(base);calls.push("relations");return {qualified:false,revision:"TEST_ONLY",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null};},
      async verifiedHumanMapping(){expect(this).toBe(base);calls.push("mapping");return null;},
      async qualifyDelegatedReceipt(){expect(this).toBe(base);calls.push("delegated");return null;},
      async readPublication(){expect(this).toBe(base);calls.push("publication");return null;},
      verifyRootReceipt:vi.fn(async()=>null)};
    const composed=provider.compose(base);
    expect(composed.currentRelations).toBe(current);
    await composed.verifyPolicy({});await composed.verifyReceipt({});
    await composed.relations("TEST_ONLY-principal","TEST_ONLY-workspace");
    await composed.verifiedHumanMapping("TEST_ONLY-principal","TEST_ONLY-workspace");
    await composed.qualifyDelegatedReceipt!({}, {workspace_id:"TEST_ONLY-workspace",subject_user_id:"TEST_ONLY-principal",principal_ids:["TEST_ONLY-principal"]});
    await composed.readPublication!({workspace_id:"TEST_ONLY-workspace",environment:"paper",profile_id:"TEST_ONLY-profile",
      binding:{dataset_id:"TEST_ONLY-dataset",source_revision:"TEST_ONLY-revision",window:null}});
    expect(calls).toEqual(["policy","receipt","relations","mapping","delegated","publication"]);
    const original={grant_id:"TEST_ONLY-original",accepted_fact_digest:`sha256:${"a".repeat(64)}`},context=Object.freeze({phase:"QUALIFY" as const});
    expect(await composed.verifyRootReceipt!(original,context)).toBeNull();
    expect(verify).toHaveBeenCalledExactlyOnceWith(original,context);
    expect(base.verifyRootReceipt).not.toHaveBeenCalled();
    expect(current.observe).not.toHaveBeenCalled();expect(current.sendFinite).not.toHaveBeenCalled();
  });

  it("does not invent optional lifetime/publication/delegation providers when none were composed",()=>{
    const {provider}=pureProvider(),base:AccessTrustProvider={verifyPolicy:async()=>null,verifyReceipt:async()=>null,
      relations:async()=>({qualified:false,revision:"TEST_ONLY",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}),
      verifiedHumanMapping:async()=>null};
    const composed=provider.compose(base);
    expect(Object.hasOwn(composed,"currentRelations")).toBe(false);
    expect(Object.hasOwn(composed,"readPublication")).toBe(false);
    expect(Object.hasOwn(composed,"qualifyDelegatedReceipt")).toBe(false);
    expect(typeof composed.verifyRootReceipt).toBe("function");
  });
});
