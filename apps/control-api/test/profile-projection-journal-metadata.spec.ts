/** SQL-shape mocks only. Actual PG/order/scope proof belongs to the PG lane. */
import { describe,it,expect,vi } from "vitest";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";

const epoch="12345678-1234-1234-1234-123456789abc";
function fixture(){
  const row={workspace_id:"TEST_ONLY-workspace",environment:"paper",profile_id:"TEST_ONLY-profile",
    projection_epoch:epoch,projection_sequence:"11",source_as_of:null,received_at:new Date(2000),
    completeness:"PARTIAL",payload_digest:"a".repeat(64),observation_authority:"PORTAL_OBSERVATION",
    observation_semantics:"BOUNDED_CURRENT_PAGE",source_contract_revision:"TEST_ONLY-contract",
    source_catalogue_sha256:"b".repeat(64)};
  Object.defineProperty(row,"payload",{get(){throw Error("TEST_ONLY_PRIVATE_PAYLOAD_ACCESSED");}});
  const query=vi.fn(async(text:string,_values?:unknown[])=>({rows:text.trimStart().startsWith("SELECT ")?[row]:[]}));
  const release=vi.fn(),connect=vi.fn(async()=>({query,release}));
  const repository=new ExecutionProfileProjectionRepository({connect} as never);
  return{repository,query,release,connect};
}
describe("Scalar-only projection journal metadata",()=>{
  it("sets a finite server timeout in a read-only transaction and selects no JSONB",async()=>{
    const f=fixture(),rows=await f.repository.journalMetadataAfter("TEST_ONLY-workspace","paper","TEST_ONLY-profile",epoch,10,200);
    const statements=f.query.mock.calls.map(([text])=>text);
    expect(statements.slice(0,3)).toEqual(["BEGIN","SET TRANSACTION READ ONLY","SET LOCAL statement_timeout='2000ms'"]);
    const select=f.query.mock.calls.find(([text])=>text.trimStart().startsWith("SELECT "))!;
    expect(select[0]).not.toMatch(/\bpayload\b/i);expect(select[0]).not.toContain("*");
    expect(select[0]).toContain("WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3");
    expect(select[0]).toContain("AND projection_epoch=$4 AND projection_sequence>$5");
    expect(select[0]).toContain("ORDER BY projection_sequence ASC LIMIT $6");
    expect(select[1]).toEqual(["TEST_ONLY-workspace","paper","TEST_ONLY-profile",epoch,10,200]);
    expect(rows).toHaveLength(1);expect(rows[0]).not.toHaveProperty("payload");
    expect(rows[0]).toMatchObject({projectionSequence:11,sourceCatalogueSha256:"b".repeat(64)});
    expect(statements.at(-1)).toBe("COMMIT");expect(f.release).toHaveBeenCalledOnce();
  });
  it.each([-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])("rejects unsafe sequence %s before connecting",async sequence=>{
    const f=fixture();await expect(f.repository.journalMetadataAfter("w","paper","p",epoch,sequence,1))
      .rejects.toThrow("EDS09B_OBSERVATION_JOURNAL_BOUND_INVALID");
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([0,201,1.5,NaN,Infinity])("rejects unsafe limit %s before connecting",async limit=>{
    const f=fixture();await expect(f.repository.journalMetadataAfter("w","paper","p",epoch,0,limit))
      .rejects.toThrow("EDS09B_OBSERVATION_JOURNAL_BOUND_INVALID");
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("keeps an empty journal empty rather than inventing metadata",async()=>{
    const f=fixture();f.query.mockResolvedValue({rows:[]});
    expect(await f.repository.journalMetadataAfter("w","paper","p",epoch,0,1)).toEqual([]);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("rolls back and releases the same client after a failed bounded SELECT",async()=>{
    const f=fixture(),original=f.query.getMockImplementation()!;
    f.query.mockImplementation(async(text,values)=>{if(text.trimStart().startsWith("SELECT "))throw Error("TEST_ONLY_SQL_FAILURE");return original(text,values);});
    await expect(f.repository.journalMetadataAfter("w","paper","p",epoch,0,1)).rejects.toThrow("TEST_ONLY_SQL_FAILURE");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");expect(f.release).toHaveBeenCalledOnce();
  });
});
