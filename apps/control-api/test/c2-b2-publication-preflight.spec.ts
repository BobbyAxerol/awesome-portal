import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { C2B2PreparationCustody } from "../src/execution-v2/c2-b2-custody";
import { C2B2PublicationPreflight } from "../src/execution-v2/c2-b2-publication-preflight";

const sample=()=>({schema:"ts.c2.pm-current-access-publication-input.v1",expected_version:0,
  head:{db_login:"ts_pm_operator",db_role:"pm_scoped_writer",environment:"paper",user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",version:1},
  acceptance:{revoked:false,document:{field_revision:"pma-field-policy-20261016-r1",fields:["business_report"],membership_policy_revision:1,
    operations:["HISTORY","READ"],physical_refs:[],scopes:[{environment:"paper",portfolio_id:"paper-portfolio-g1"},
      {environment:"paper",portfolio_id:"paper-root-g1"}],visibility:"BUSINESS"}},
  portal_fills:["head.acceptance_id","head.workspace_id","head.workload_ref","acceptance.effective_from","acceptance.expires_at",
    "document.human_authority_revision","document.application_revision","document.acceptance_ref","document.delegation_ref"],
  rules:{canonical:"json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim:["expected_version","head.user_id","head.environment","head.db_login","head.db_role","head.version",
      "acceptance.revoked","acceptance.document.membership_policy_revision","acceptance.document.field_revision",
      "acceptance.document.visibility","acceptance.document.fields","acceptance.document.operations",
      "acceptance.document.physical_refs","acceptance.document.scopes"],
    effective_from:"signing time, UTC Z, whole seconds",window_max_days:90}});
const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const input=()=>{const b=Buffer.from(JSON.stringify(sample()));return {b1_bytes:b,b1_sha256:sha(b),cycle_sha256:"a".repeat(64),
  signer_spki_sha256:"b".repeat(64),signer_owner_ref_sha256:"c".repeat(64),portal_fields:{acceptance_id:"préparation",
    workspace_id:"review-workspace",workload_ref:"workload-1",effective_from:"2026-11-05T00:00:00Z",
    expires_at:"2026-12-05T00:00:00Z",human_authority_revision:42,application_revision:"app-1",
    acceptance_ref:"acceptance-1",delegation_ref:"delegation-1"}};};
const make=()=>{const pool={options:{connectionTimeoutMillis:1000,query_timeout:1000}} as ConstructorParameters<typeof C2B2PreparationCustody>[0];
  const custody=new C2B2PreparationCustody(pool),record=vi.spyOn(custody,"prepare").mockResolvedValue({state:"PREPARED_NOT_AUTHORIZED"});
  const reserve=vi.spyOn(custody,"reserve");return {record,reserve,bridge:new C2B2PublicationPreflight(custody)};};

describe("B2 preflight + custody, no signing or source authority",()=>{
  it("persists only the canonical-byte plan and returns an explicitly unauthorized preview",async()=>{
    const {record,reserve,bridge}=make(),request=input(),result=await bridge.prepare(request);
    expect(result.state).toBe("PREPARED_NOT_AUTHORIZED");
    expect(result.preview_ascii).toMatch(/\\u00e9/);
    expect(result.payload_sha256).toBe(sha(Buffer.from(result.preview_ascii,"ascii")));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({payload_sha256:result.payload_sha256,b1_sha256:request.b1_sha256}));
    expect(reserve).not.toHaveBeenCalled();
    const parsed=JSON.parse(result.preview_ascii);
    expect(parsed.acceptance.document.operations).toEqual(["HISTORY","READ"]);
    expect(parsed.acceptance.document.scopes.map((s:{portfolio_id:string})=>s.portfolio_id)).toEqual(["paper-portfolio-g1","paper-root-g1"]);
    expect(parsed.acceptance.document.human_authority_revision).toBe(42);
  });
  it("does not send a widened scope, B1 tampering or invalid portal fields to custody",async()=>{
    const {record,bridge}=make();
    const wider=sample();wider.acceptance.document.operations.push("STREAM");const bytes=Buffer.from(JSON.stringify(wider));
    await expect(bridge.prepare({...input(),b1_bytes:bytes,b1_sha256:sha(bytes)})).rejects.toThrow("C2_B2_PREFLIGHT_REFUSED");
    await expect(bridge.prepare({...input(),b1_sha256:"f".repeat(64)})).rejects.toThrow("C2_B1_INVALID");
    await expect(bridge.prepare({...input(),portal_fields:{...input().portal_fields,human_authority_revision:Number.MAX_SAFE_INTEGER+1}})).rejects.toThrow();
    await expect(bridge.prepare({...input(),portal_fields:{...input().portal_fields,expires_at:"2027-11-05T00:00:00Z"}})).rejects.toThrow();
    expect(record).not.toHaveBeenCalled();
  });
  it("rejects a custody conflict without creating any release permission",async()=>{
    const {record,reserve,bridge}=make();record.mockRejectedValueOnce(new Error("C2_B2_PLAN_BINDING_MISMATCH"));
    await expect(bridge.prepare(input())).rejects.toThrow("C2_B2_PLAN_BINDING_MISMATCH");
    expect(reserve).not.toHaveBeenCalled();
  });
  it("binds selected P8 public bytes to the preview plan and refuses a substituted key before custody",async()=>{
    const {record,reserve,bridge}=make(),request=input();
    const selected=generateKeyPairSync("ed25519"),issuer=generateKeyPairSync("ed25519"),source=generateKeyPairSync("ed25519");
    const signer_jwk_bytes=Buffer.from(JSON.stringify({...selected.publicKey.export({format:"jwk"}),kid:"p8",alg:"EdDSA",use:"sig"}));
    const spki=(key:typeof selected.publicKey)=>sha(key.export({format:"der",type:"spki"}));
    const signer_pins={jwk_sha256:sha(signer_jwk_bytes),signer_spki_sha256:spki(selected.publicKey),signer_kid:"p8",
      issuer_spki_sha256:spki(issuer.publicKey),issuer_kid:"issuer",source_spki_sha256:spki(source.publicKey)};
    const {signer_spki_sha256:_unused,...rest}=request;
    const result=await bridge.prepareWithPublicSigner({...rest,signer_jwk_bytes,signer_pins});
    expect(result.public_signer.state).toBe("PUBLIC_KEY_CHECKED_NOT_AUTHORIZED");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({signer_spki_sha256:signer_pins.signer_spki_sha256}));
    record.mockClear();
    await expect(bridge.prepareWithPublicSigner({...rest,signer_jwk_bytes,signer_pins:{...signer_pins,jwk_sha256:"0".repeat(64)}})).rejects.toThrow("C2_P8_PUBLIC_KEY_INVALID");
    expect(record).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();
  });
});
