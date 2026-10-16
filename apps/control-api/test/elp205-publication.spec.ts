import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { qualifyDatasetPublication, withCataloguePublications } from "../src/execution-v2/publication-adapter";
import { browserPublicationCatalogue, assertPublicationFieldName, metricPublicationRequirements, ECONOMIC_PUBLICATION_INPUTS } from "../src/execution-v2/publication-catalogue";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { browserManagerRelationOperationManifest } from "../src/execution/eds11r-manager-relation.registry";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const load = () => JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
const request = () => { const p=load(); return {workspace_id:p.authority.workspace_id,environment:p.environment,profile_id:p.profile_id,binding:p.authority.binding}; };
const options = {nowMs:2000,purpose:"BUSINESS" as const,allowTestOnly:true,
  expectedContinuity:{source_continuity_epoch:"test-only:epoch1",projection_generation:"test-only:g1",partition_id:"test-only:paper-fills",snapshot_id:"test-only:snapshot1"}};
describe("ELP2-05 publication admission (TEST_ONLY, not source certification)", () => {
  it("T05-01 inventories42 logical families/31 fields without source-shaped browser payload", () => {
    const result=browserManagerRelationOperationManifest();
    expect(result.operations).toHaveLength(54); expect(result.publication_catalogue.families).toHaveLength(42);
    expect(result.publication_catalogue.fields).toHaveLength(31);
    expect(JSON.stringify(result)).not.toMatch(/writer_refs|source_query_refs|jwt|mtls|source_cursor|source_pins/);
    result.publication_catalogue.families.length=0;
    expect(browserPublicationCatalogue().families).toHaveLength(42);
  });
  it("T05-01 serves the complete manifest exactly as its generated OpenAPI declares", () => {
    const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-publication-catalogue.openapi.json"), "utf8"));
    const defs = JSON.parse(JSON.stringify(api.components.schemas).replaceAll("#/components/schemas/", "#/$defs/"));
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile({
      $defs: defs, $ref: "#/$defs/ManagerPublicationManifest",
    });
    expect(validate(browserManagerRelationOperationManifest()), JSON.stringify(validate.errors)).toBe(true);
  });
  it.each(["environment","profile_id","catalogue_digest","family_id","purpose"] as const)("T05-02 rejects cross-mode/family/purpose binding %s", key => {
    const p=load(); (p as Record<string,unknown>)[key]="wrong";
    expect(()=>qualifyDatasetPublication(p,request(),options)).toThrow();
  });
  it("T05-02 binds request workspace, dataset, revision, window and generation", () => {
    for (const key of ["dataset_id","source_revision","catalogue_revision","projection_generation","window"] as const) {
      const r=request(); (r.binding as Record<string,unknown>)[key]=key==="window"?{from_ms:1100,to_ms:1900}:"other";
      expect(()=>qualifyDatasetPublication(load(),r,options)).toThrow("not available");
    }
    expect(()=>qualifyDatasetPublication(load(),{...request(),workspace_id:"other"},options)).toThrow();
    const p=load(); p.family_id="positions_episodes";
    expect(()=>qualifyDatasetPublication(p,request(),options)).toThrow();
  });
  it.each(["api_key","privateKey","access_token","password","auth_header","clientSecret"])("T05-03 rejects selected credential field %s", name => {
    expect(()=>assertPublicationFieldName(name)).toThrow("SECRET_FIELD");
  });
  it("T05-04 current-only metadata never promises snapshot traversal or total history", () => {
    const page=browserPublicationCatalogue().current_page_adapter;
    expect(page).toMatchObject({maximum_rows:200,maximum_response_bytes:1048576,stable_snapshot:false,authoritative_replay:false,total_history_cap:null});
  });
  it("T05-05 validates exact partition W/W+1 without number precision loss", () => {
    expect(qualifyDatasetPublication(load(),request(),options).barrier!.first_tail_sequence).toBe("9007199254740994");
    const p=load(); p.barrier!.first_tail_sequence="9007199254740995";
    expect(()=>qualifyDatasetPublication(p,request(),options)).toThrow();
    p.barrier!.first_tail_sequence="9007199254740994"; p.barrier!.retention_floor_sequence="9007199254740995";
    expect(()=>qualifyDatasetPublication(p,request(),options)).toThrow();
  });
  it.each(["DRAINING","REVOKED"] as const)("T05-06 observes %s on the next authority read without cached fallback", async state => {
    let source=load(); let calls=0;
    const provider=withCataloguePublications(unqualifiedAccessTrust,async()=>{calls++;return source;},{...options,now:()=>2000});
    expect(await provider.readPublication!(request())).toMatchObject({qualification:"TEST_ONLY"});
    source={...source,state}; await expect(provider.readPublication!(request())).rejects.toThrow(); expect(calls).toBe(2);
    expect(await provider.verifiedHumanMapping("x","y")).toBeNull();
  });
  it("T05-07 rejects missing/changed epoch proof, expired leases, future clocks and unexpected fields", () => {
    const p=load(); p.barrier=null; expect(()=>qualifyDatasetPublication(p,request(),options)).toThrow();
    for (const patch of [{expires_at_ms:2000},{issued_at_ms:2001},{observed_at_ms:2001},{source_as_of_ms:1900}])
      expect(()=>qualifyDatasetPublication({...load(),...patch},request(),options)).toThrow();
    expect(()=>qualifyDatasetPublication({...load(),relation:"fills"},request(),options)).toThrow();
    const q=load(); q.barrier!.projection_generation="other"; expect(()=>qualifyDatasetPublication(q,request(),options)).toThrow();
    for (const key of ["source_continuity_epoch","partition_id","snapshot_id"] as const) {
      const altered=load(); altered.barrier![key]="other";
      expect(()=>qualifyDatasetPublication(altered,request(),options)).toThrow();
    }
  });
  it("T05-08 missing source remains null, unsupported family unavailable", async () => {
    const provider=withCataloguePublications(unqualifiedAccessTrust,async()=>null,{purpose:"BUSINESS"});
    expect(await provider.readPublication!(request())).toBeNull();
    expect(browserPublicationCatalogue().families.every(f=>f.availability==="UNAVAILABLE"&&!f.runtime_enabled&&!f.history_full)).toBe(true);
  });
  it("T05-09 declares fund/Fleet/model owners and exact grains", () => {
    const families=browserPublicationCatalogue().families;
    for (const id of ["fund_portfolio_overview","alpha_fleet_overview","portfolio_score","regime_fit"])
      expect(families.find(f=>f.family_id===id)).toMatchObject({authority_owner:expect.any(String),grain:expect.any(String)});
    expect(families.find(f=>f.family_id==="alpha_fleet_overview")!.grain).toContain("five-ID tuple");
  });
  it("T05-10 production cannot use TEST_ONLY or self-asserted SOURCE_VERIFIED frozen exports", () => {
    expect(()=>qualifyDatasetPublication(load(),request(),{...options,allowTestOnly:false})).toThrow();
    const p=load(); for(const field of [p.source_read,p.transport_trust,p.privacy,p.field_policy,p.authority]) field.qualification="SOURCE_VERIFIED";
    expect(()=>qualifyDatasetPublication(p,request(),options)).toThrow();
  });
  it("T05-11 unsupported new export does not suppress separate current-page metadata", () => {
    const c=browserPublicationCatalogue(); expect(c.families.every(f=>!f.runtime_enabled)).toBe(true);
    expect(c.current_page_adapter.status).toBe("EXISTING_SEPARATE_AUTHORITY");
    expect(browserManagerRelationOperationManifest().operations).toHaveLength(54);
  });
  it("T05-12 distinguishes NAV snapshots, flows, costs and interval notional proof", () => {
    expect(ECONOMIC_PUBLICATION_INPUTS).toHaveLength(4);
    expect(ECONOMIC_PUBLICATION_INPUTS[0].semantic).toBe("POINT_IN_TIME_NOT_CERTIFIED_RETURN_HISTORY");
    expect(ECONOMIC_PUBLICATION_INPUTS[2].semantic).toContain("MISSING_IS_NOT_ZERO");
    expect(metricPublicationRequirements("portfolio_score")).toContain("external_flow_grid");
  });
  it("T05-13 direct ledger score has no universal research-binding dependency", () => {
    expect(metricPublicationRequirements("portfolio_score")).not.toContain("exact_research_run_binding");
    expect(metricPublicationRequirements("regime_fit")).toContain("exact_research_run_binding");
    expect(metricPublicationRequirements("portfolio_score")).toContain("approved_runtime_config");
  });
});
