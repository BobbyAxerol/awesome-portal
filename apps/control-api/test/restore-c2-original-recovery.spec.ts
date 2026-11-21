import { describe, expect, it } from "vitest";
import { compareC2OriginalObservations, compareC2RetainedTerminal, RestoreC2OriginalRecovery } from "../src/execution-v2/restore-c2-original-recovery";
import type { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import type { CurrentHumanRecoveryClient } from "../src/execution-v2/current-human-recovery-client";
import type { Pool } from "pg";

const attempt = { lease_id: "lease", attempt_id: "attempt", workspace_id: "workspace", environment: "paper" as const,
  workload_id: "source", request_digest: `sha256:${"a".repeat(64)}`, human_issuer: "issuer", subject: "human",
  session_id: "session", session_revision: 2, authority_revision: 3, expires_at: 1730000000.001 };
const ack = { schema_version: "pma.current-human-recover-ack.v1" as const, lease_id: "lease", attempt_id: "attempt",
  phase: "COMMITTED" as const, portal_acknowledged: true };
const row = { attempt_id: "attempt", human_issuer: "issuer", source_trust_digest: `sha256:${"d".repeat(64)}`, workspace_id: "workspace", environment: "paper", workload_id: "source",
  request_digest: attempt.request_digest, subject_id: "human", session_id: "session", session_revision: "2",
  authority_revision: "3", expires_at_ms: "1730000000001", phase: "COMMITTED", terminal_receipt_digest: `sha256:${"b".repeat(64)}`,
  human_assertion_digest:`sha256:${"e".repeat(64)}` };

describe("TEST_ONLY C2 original observations cannot authorize restore", () => {
  it("compares exact source ACK and local terminal, but still never grants cutover", () => {
    expect(compareC2OriginalObservations(attempt, ack, row)).toBe("PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED");
    expect(compareC2OriginalObservations(attempt, { ...ack, phase: "UNKNOWN" }, row)).toBe("SOURCE_UNKNOWN");
    expect(compareC2OriginalObservations(attempt, { ...ack, portal_acknowledged: false }, row)).toBe("SOURCE_ACK_NOT_CONFIRMED");
    expect(compareC2OriginalObservations(attempt, { ...ack, attempt_id: "other" }, row)).toBe("SOURCE_UNKNOWN");
  });
  it("rejects mismatching original, binding, timing, terminal and absent digest", () => {
    for (const mismatch of [{ attempt_id: "other" }, { human_issuer: null }, { human_issuer: "other" }, { source_trust_digest: null }, { source_trust_digest: "invalid" }, { workspace_id: "other" }, { environment: "live" },
      { workload_id: "other" }, { request_digest: `sha256:${"c".repeat(64)}` }, { subject_id: "other" },
      { session_id: "other" }, { session_revision: "4" }, { authority_revision: "4" }, { expires_at_ms: "1730000000002" },
      { phase: "ROLLED_BACK" }, { terminal_receipt_digest: null }])
      expect(compareC2OriginalObservations(attempt, ack, { ...row, ...mismatch })).toBe("CORE_TERMINAL_NOT_MATCHED");
    expect(compareC2OriginalObservations(attempt, ack, undefined)).toBe("CORE_TERMINAL_NOT_MATCHED");
  });
  it("refuses fake provider/candidate composition before any work", () => {
    expect(() => new RestoreC2OriginalRecovery({} as Pool, {} as CurrentHumanCandidate, {} as CurrentHumanRecoveryClient))
      .toThrow("V2_RESTORE_RECOVERY_COMPOSITION_INVALID");
  });
  it("ties the authenticated retained terminal to the exact original, receipt and source trust",()=>{
    type Event=Parameters<typeof compareC2RetainedTerminal>[3];
    type Proof=Parameters<typeof compareC2RetainedTerminal>[5];
    const initial={operation_id:"test-issue",generation:"1",proof_hash:"a".repeat(64),predecessor_hash:"0".repeat(64),
      event_hash:"d".repeat(64),kind:"ISSUED_HUMAN_ASSERTION",lease_id:attempt.lease_id,body:{jti:attempt.lease_id,
      iss:attempt.human_issuer,sub:attempt.subject,sid:attempt.session_id,workspace_id:attempt.workspace_id,
      environment:attempt.environment,workload_id:attempt.workload_id,request_digest:attempt.request_digest,
      session_revision:attempt.session_revision,authority_revision:attempt.authority_revision,exp:attempt.expires_at,
      human_assertion_digest:row.human_assertion_digest}} as Event;
    const terminal={operation_id:"test-terminal",proof_hash:"b".repeat(64),predecessor_hash:"d".repeat(64),
      kind:"SIGNED_SOURCE_TERMINAL",lease_id:attempt.lease_id,generation:"3",event_hash:"e".repeat(64),
      body:{workspace_id:attempt.workspace_id,environment:attempt.environment,workload_id:attempt.workload_id,
        request_digest:attempt.request_digest}} as Event;
    const proof={state:"VERIFIED_NOT_CUTOVER",generation:"3",event_hash:terminal.event_hash,lease_id:attempt.lease_id,
      attempt_id:attempt.attempt_id,phase:"COMMITTED",terminal_receipt_digest:row.terminal_receipt_digest,
      source_trust_digest:row.source_trust_digest} as Proof;
    const compare=(a=attempt,k=ack,r=row,i=initial,t=terminal,p=proof)=>compareC2RetainedTerminal(a,k,r,i,t,p);
    expect(compare()).toBe("TERMINAL_PROOF_MATCH_ACK_CENSUS_NOT_VERIFIED");
    expect(compare(attempt,ack,{...row,human_assertion_digest:`sha256:${"f".repeat(64)}`})).toBe("INDEPENDENT_TERMINAL_PROOF_MISMATCH");
    expect(compare(attempt,ack,row,{...initial,body:{...initial.body,human_assertion_digest:null}})).toBe("INDEPENDENT_TERMINAL_PROOF_MISMATCH");
    for(const changed of [{terminal_receipt_digest:`sha256:${"c".repeat(64)}`},
      {source_trust_digest:`sha256:${"c".repeat(64)}`},{event_hash:"f".repeat(64)},
      {generation:"4"},{lease_id:"wrong"},{attempt_id:"wrong"},{phase:"ROLLED_BACK" as const}])
      expect(compare(attempt,ack,row,initial,terminal,{...proof,...changed})).toBe("INDEPENDENT_TERMINAL_PROOF_MISMATCH");
    expect(compare(attempt,{...ack,portal_acknowledged:false})).toBe("INDEPENDENT_TERMINAL_PROOF_MISMATCH");
    expect(compare(attempt,ack,row,{...initial,body:{...initial.body,session_revision:4}})).toBe("INDEPENDENT_TERMINAL_PROOF_MISMATCH");
    expect(compare(attempt,ack,row,initial,{...terminal,body:{...terminal.body,workspace_id:"wrong"}})).toBe("INDEPENDENT_TERMINAL_PROOF_MISMATCH");
  });
});
