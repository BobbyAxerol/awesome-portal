import {randomBytes,randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {C2JournalAuthenticatorCandidate,type C2JournalEventBinding} from "../src/execution-v2/restore-c2-journal-authenticator-candidate";

describe("TEST_ONLY custody journal authenticator",()=>{
  it("binds key, custody, clusters, operation, generation and exact event hash",()=>{
    const key=randomBytes(32),auth=new C2JournalAuthenticatorCandidate(key,"test-key");
    const binding:C2JournalEventBinding={custody_id:randomUUID(),source_system_identifier:"100",authority_system_identifier:"200",
      operation_id:randomUUID(),generation:"1",event_hash:"a".repeat(64)};
    const mac=auth.mac(binding);
    expect(()=>auth.verify(binding,"test-key",mac)).not.toThrow();
    key.fill(0); // Construction captured its own key bytes.
    expect(()=>auth.verify(binding,"test-key",mac)).not.toThrow();
    for(const changed of [{...binding,custody_id:randomUUID()},{...binding,source_system_identifier:"101"},
      {...binding,authority_system_identifier:"201"},{...binding,operation_id:randomUUID()},{...binding,generation:"2"},
      {...binding,event_hash:"b".repeat(64)}])
      expect(()=>auth.verify(changed,"test-key",mac)).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    expect(()=>auth.verify(binding,"wrong-key",mac)).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    expect(()=>auth.verify(binding,"test-key","0".repeat(64))).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    const other=new C2JournalAuthenticatorCandidate(randomBytes(32),"test-key");
    expect(other.keyCommitment()).not.toBe(auth.keyCommitment());
    expect(()=>other.verify(binding,"test-key",mac)).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    // Verification does not call a caller-shadowed public MAC method.
    Reflect.set(auth,"mac",()=>mac);
    expect(()=>auth.verify({...binding,generation:"2"},"test-key",mac)).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
  });
  it("rejects weak configuration and invalid binding shapes",()=>{
    expect(()=>new C2JournalAuthenticatorCandidate(Buffer.alloc(32),"test-key")).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    expect(()=>new C2JournalAuthenticatorCandidate(randomBytes(31),"test-key")).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    const auth=new C2JournalAuthenticatorCandidate(randomBytes(32),"test-key");
    const binding:C2JournalEventBinding={custody_id:randomUUID(),source_system_identifier:"100",authority_system_identifier:"200",
      operation_id:randomUUID(),generation:"1",event_hash:"a".repeat(64)};
    for(const changed of [{...binding,custody_id:"invalid"},{...binding,authority_system_identifier:"100"},
      {...binding,generation:"0"},{...binding,generation:"9223372036854775808"},{...binding,event_hash:"invalid"}])
      expect(()=>auth.mac(changed)).toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
  });
});
