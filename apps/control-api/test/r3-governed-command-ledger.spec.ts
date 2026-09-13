import { describe, expect, it } from "vitest";
import { executionContractAuthorityInternalCoverage } from "../src/execution/contract-authority";
import { EXECUTION_COMMAND_CATALOG } from "../src/operations/catalog.generated";
import { OPERATOR_TASKS } from "../src/operations/operator-tasks";
import {
  R3_GOVERNED_COMMAND_LEDGER,
  R3_GOVERNED_COMMAND_STATES,
  r3GovernedCommandEvidence,
} from "../src/execution/r3-governed-command-ledger";

describe("R3-2 governed command ledger", () => {
  it("classifies every Portal action, operator task and source catalogue command exactly once", () => {
    const expected = executionContractAuthorityInternalCoverage().actions.length +
      OPERATOR_TASKS.length + EXECUTION_COMMAND_CATALOG.entries.length;
    expect(R3_GOVERNED_COMMAND_LEDGER.rows).toHaveLength(expected);
    expect(new Set(R3_GOVERNED_COMMAND_LEDGER.rows.map((row) => row.id)).size).toBe(expected);
    for (const row of R3_GOVERNED_COMMAND_LEDGER.rows) {
      expect(R3_GOVERNED_COMMAND_STATES).toContain(row.state);
      expect(row.sourceSideEffectRequested).toBe(false);
      expect(row.actorRoles.length).toBeGreaterThan(0);
      expect(row.planApplyVerify.contract.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes Portal-authored workflow from local read capability and uncommissioned source commands", () => {
    expect(R3_GOVERNED_COMMAND_LEDGER.rows.find((row) => row.id.endsWith("/approval.review.r1")))
      .toMatchObject({
        state: "MUTATION_CONNECTED",
        owner: "PORTAL_CONTROL",
        browserMutationSecurity: "CSRF_REQUIRED",
        audit: "PORTAL_AUDIT_OUTBOX",
      });
    expect(R3_GOVERNED_COMMAND_LEDGER.rows.find((row) => row.id === "operator-task:inspect"))
      .toMatchObject({
        state: "LOCAL_R0_READ_CONNECTED",
        owner: "PORTAL_CONTROL",
        audit: "LOCAL_READ_AUDIT",
      });
    expect(R3_GOVERNED_COMMAND_LEDGER.rows.find((row) => row.id === "operator-task:redis-inspect"))
      .toMatchObject({ state: "NOT_APPLICABLE" });
    expect(R3_GOVERNED_COMMAND_LEDGER.rows.find((row) => row.id === "source-catalogue:ops/emergency-close"))
      .toMatchObject({ state: "SOURCE_NOT_COMMISSIONED", reasonCode: "SOURCE_ROUTE_MAPPING_AMBIGUOUS" });
  });

  it("keeps all source command traffic fail-closed and publishes no routes or payloads to runtime metadata", () => {
    const evidence = r3GovernedCommandEvidence();
    expect(evidence.ledger_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.row_count).toBe(R3_GOVERNED_COMMAND_LEDGER.rows.length);
    expect(evidence.invariants).toEqual({
      genericCliRelay: false,
      sourceCommandDispatched: false,
      unclassifiedRows: false,
    });
    const serializableValues = JSON.stringify({
      schema_version: evidence.schema_version,
      ledger_sha256: evidence.ledger_sha256,
      row_count: evidence.row_count,
      state_counts: evidence.state_counts,
      invariants: evidence.invariants,
    }).toLowerCase();
    for (const forbidden of ["/v1/admin", "http://", "https://", "authorization", "payload"]) {
      expect(serializableValues).not.toContain(forbidden);
    }
  });
});
