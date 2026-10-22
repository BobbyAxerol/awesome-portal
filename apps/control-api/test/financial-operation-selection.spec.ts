/** Synthetic CORE-03 DARK preparation only; not PM financial acceptance. */
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import type { ManagerDomainReadDecision, ManagerDomainStreamDecision } from "../src/execution-v2/access.contract";
import type { AccessRelations } from "../src/execution-v2/access-policy";
import type { ExecutionReadPublication } from "../src/execution-v2/read-publication";
import { FINANCIAL_OPERATION_REQUIREMENTS, prepareFinancialOperationSelectionFactory,
  type FinancialOperationSelectionRequest } from "../src/execution-v2/financial-operation-selection";

const hash = (value: string) => accessDigest(value);
function setup() {
  const input: FinancialOperationSelectionRequest = {
    operation: "READ", source_audience: "TEST_ONLY-proposed-financial-audience", workload_id: "TEST_ONLY-workload",
    context: { actor: { user_id: "TEST_ONLY-person", session_id: "TEST_ONLY-session", session_generation: 4 },
      workspace_id: "TEST_ONLY-workspace", environment: "paper",
      domain: { profile_id: "TEST_ONLY-financial-profile", catalogue_sha256: "a".repeat(64),
        profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64) }, expected_scope_digest: hash("READ-scope") },
    mapping: { ts_user_id: "TEST_ONLY-ts-human", revision: "mapping-revision" }, expected_policy_revision: "policy-revision",
    binding: { dataset_id: "TEST_ONLY-financial-dataset", source_revision: "source-revision",
      projection_generation: "generation-1", catalogue_revision: "catalogue-revision", window: { from_ms: 100, to_ms: 900 } },
    fields: ["current_nav", "net_pnl"],
    tuples: [{ alpha_id: "TEST_ONLY-alpha", alpha_version_id: "TEST_ONLY-alpha-version", portfolio_id: "TEST_ONLY-portfolio",
      deployment_id: "TEST_ONLY-deployment", account_id: "TEST_ONLY-internal-account" }],
  };
  const decision: ManagerDomainReadDecision = { actor: structuredClone(input.context.actor),
    authority_fingerprint: hash("current-human-fingerprint"), scope_digest: hash("READ-scope"),
    field_policy_sha256: input.context.domain.field_policy_sha256, field_policy_ref: "TEST_ONLY-reviewed-fields",
    valid_until_ms: 10_000, now_ms: 1_000, policy_revision: input.expected_policy_revision,
    grant_id: "TEST_ONLY-read-grant", grant_revision: "read-revision" };
  const stream: ManagerDomainStreamDecision = { ...structuredClone(decision), valid_until_ms: 9_000,
    stream_scope_digest: hash("independent-STREAM"), stream_grant_id: "TEST_ONLY-stream-grant", stream_grant_revision: "stream-revision" };
  const relations: AccessRelations = { qualified: true, revision: "source-relations-revision", own_alpha_ids: [],
    member_portfolio_ids: [], roots: {}, membership: null,
    current_authority: { schema_version: "pma.core-current-relations.v1", subject_user_id: input.context.actor.user_id,
      workspace_id: input.context.workspace_id, ts_user_id: input.mapping.ts_user_id,
      mapping_revision: input.mapping.revision, resources: [{ environment: "paper", revision: "current-cut", own_alpha_ids: [],
        member_portfolio_ids: [], roots: [] }], grants: [] } };
  const publication: ExecutionReadPublication = { workspace_id: input.context.workspace_id,
    environment: input.context.environment, profile_id: input.context.domain.profile_id, qualification: "TEST_ONLY",
    publication_revision: "historical-population-revision", binding: structuredClone(input.binding),
    population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY-source-publication",
    current_linkage: null, resources: [{ kind: "PORTFOLIO", id: input.tuples[0].portfolio_id }], tuples: structuredClone(input.tuples) };
  const access = { verifiedHumanMapping: vi.fn(async () => structuredClone(input.mapping)),
    relations: vi.fn(async () => structuredClone(relations)), readPublication: vi.fn(async () => structuredClone(publication)) };
  const readDecision = vi.fn(async () => structuredClone(decision)), streamDecision = vi.fn(async () => structuredClone(stream));
  const now = vi.fn(() => 2_000);
  const dependencies = { access, readDecision, streamDecision, now };
  return { input, decision, stream, relations, publication, access, readDecision, streamDecision, now, dependencies,
    factory: prepareFinancialOperationSelectionFactory(dependencies) };
}

describe("financial operation selection remains a DARK unbound proposal", () => {
  it("correlates existing inputs twice, freezes detached result and never creates a held capability", async () => {
    const s = setup(), before = structuredClone(s.input), result = await s.factory.prepare(s.input);
    expect(result).toMatchObject({ state: "PREPARED_UNBOUND", qualification: "TEST_ONLY",
      status: "PROPOSAL_NOT_FINANCIAL_AUTHORITY", publication_revision: s.publication.publication_revision,
      missing_bindings: ["PM_WORKLOAD_APP_FIELD_ACCEPTANCE", "PM_OPERATION_AUDIENCE_ACCEPTANCE", "PM_OPERATION_FIELD_ACCEPTANCE",
        "PM_OWNING_REQUEST_CONNECTION_TRANSACTION", "TS_OWNING_COMMIT_FENCE"] });
    expect(s.access.verifiedHumanMapping).toHaveBeenCalledTimes(2);
    expect(s.access.relations).toHaveBeenCalledTimes(2);
    expect(s.access.readPublication).toHaveBeenCalledTimes(2);
    expect(s.readDecision).toHaveBeenCalledTimes(2);
    expect(s.streamDecision).not.toHaveBeenCalled();
    expect(s.input).toEqual(before);
    if (result.state !== "PREPARED_UNBOUND") throw new Error("unexpected refusal");
    expect(Object.isFrozen(result.selection.context.actor)).toBe(true);
    s.input.context.actor.user_id = "mutated-caller";
    expect(result.selection.context.actor.user_id).toBe(before.context.actor.user_id);
    expect(result).not.toHaveProperty("assertCurrent");
    expect(result).not.toHaveProperty("release");
    expect(result).not.toHaveProperty("accepted");
  });

  it("SOURCE_VERIFIED publication still cannot promote inputs into accepted PM authority", async () => {
    const s = setup(); s.publication.qualification = "SOURCE_VERIFIED";
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "PREPARED_UNBOUND", qualification: "PROPOSAL",
      missing_bindings: expect.arrayContaining(["PM_OPERATION_FIELD_ACCEPTANCE", "TS_OWNING_COMMIT_FENCE"]) });
  });

  it.each(["READ", "HISTORY", "EXPORT", "STREAM"] as const)("binds %s independently", async operation => {
    const s = setup(); s.input.operation = operation;
    const result = await s.factory.prepare(s.input);
    expect(result).toMatchObject({ state: "PREPARED_UNBOUND", required_core_actions: FINANCIAL_OPERATION_REQUIREMENTS[operation] });
    expect(s.streamDecision).toHaveBeenCalledTimes(operation === "STREAM" ? 2 : 0);
    if (result.state !== "PREPARED_UNBOUND") throw new Error("unexpected refusal");
    expect(result.selection.operation).toBe(operation);
    if (operation === "EXPORT") expect(result.missing_bindings).toEqual(expect.arrayContaining([
      "PORTAL_REPORT_EXPORT_DECISION", "PM_REPORT_SCOPE_BUSINESS_REPORT"]));
  });

  it("requires STREAM separately even when ordinary READ and its native selection match", async () => {
    const s = setup(); s.input.operation = "STREAM";
    const factory = prepareFinancialOperationSelectionFactory({ ...s.dependencies, streamDecision: undefined });
    expect(await factory.prepare(s.input)).toMatchObject({ state: "PREPARED_UNBOUND",
      missing_bindings: expect.arrayContaining(["CORE_STREAM_DECISION"]) });
  });

  it("does not use current memberships as proof of historical population or continuity", async () => {
    const s = setup(); s.input.operation = "HISTORY";
    s.input.binding.window = null; delete s.input.binding.projection_generation;
    s.publication.binding = structuredClone(s.input.binding); s.publication.population_coverage = "PARTIAL";
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "PREPARED_UNBOUND",
      missing_bindings: expect.arrayContaining(["HISTORICAL_WINDOW_GENERATION", "PUBLICATION_POPULATION_COVERAGE"]) });
    expect(s.relations.own_alpha_ids).toEqual([]);
  });

  it("never creates false joins from independently present alpha and account IDs", async () => {
    const s = setup();
    s.publication.tuples = [{ ...s.input.tuples[0], account_id: "another-account" },
      { ...s.input.tuples[0], alpha_id: "another-alpha" }];
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code: "TUPLE_NOT_IN_PUBLICATION" });
  });

  it.each([
    ["unknown operation", (s: ReturnType<typeof setup>) => ({ ...s.input, operation: "COMMIT" })],
    ["undeclared audience credential", (s: ReturnType<typeof setup>) => ({ ...s.input, audience: "pma.management.v1" })],
    ["fake held flag", (s: ReturnType<typeof setup>) => ({ ...s.input, held: true })],
    ["fake accepted flag", (s: ReturnType<typeof setup>) => ({ ...s.input, accepted: true })],
    ["duplicate field", (s: ReturnType<typeof setup>) => ({ ...s.input, fields: ["net_pnl", "net_pnl"] })],
    ["duplicate tuple", (s: ReturnType<typeof setup>) => ({ ...s.input, tuples: [...s.input.tuples, ...s.input.tuples] })],
  ])("rejects %s without consulting any provider", async (_name, makeInput) => {
    const s = setup();
    expect(await s.factory.prepare(makeInput(s))).toMatchObject({ state: "REFUSED", reason_code: "INPUT_INVALID" });
    expect(s.access.relations).not.toHaveBeenCalled();
  });

  it("rejects undeclared/technical fields rather than silently removing them", async () => {
    const s = setup(); s.input.fields.push("private_key");
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code: "FIELD_NOT_PUBLISHED" });
    expect(s.access.relations).not.toHaveBeenCalled();
  });

  it("refuses native identity audience and never treats management audience as financial acceptance", async () => {
    const s = setup(); s.input.source_audience = "pma.identity.v1";
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code: "AUDIENCE_CONFLATION" });
    expect(s.access.relations).not.toHaveBeenCalled();
    s.input.source_audience = "pma.management.v1";
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "PREPARED_UNBOUND",
      missing_bindings: expect.arrayContaining(["PM_OPERATION_AUDIENCE_ACCEPTANCE"]) });
  });

  it.each([
    ["actor", (s: ReturnType<typeof setup>) => { s.decision.actor.user_id = "other-human"; }, "CURRENT_DECISION_MISMATCH"],
    ["session", (s: ReturnType<typeof setup>) => { s.decision.actor.session_generation++; }, "CURRENT_DECISION_MISMATCH"],
    ["policy", (s: ReturnType<typeof setup>) => { s.decision.policy_revision = "other-policy"; }, "CURRENT_DECISION_MISMATCH"],
    ["field seal", (s: ReturnType<typeof setup>) => { s.decision.field_policy_sha256 = "d".repeat(64); }, "CURRENT_DECISION_MISMATCH"],
    ["read scope", (s: ReturnType<typeof setup>) => { s.decision.scope_digest = hash("other-scope"); }, "CURRENT_DECISION_MISMATCH"],
    ["mapping", (s: ReturnType<typeof setup>) => { s.relations.current_authority!.mapping_revision = "new-mapping"; }, "CURRENT_IDENTITY_MISMATCH"],
    ["workspace", (s: ReturnType<typeof setup>) => { s.publication.workspace_id = "other-workspace"; }, "PUBLICATION_BINDING_MISMATCH"],
    ["environment", (s: ReturnType<typeof setup>) => { s.publication.environment = "sandbox"; }, "PUBLICATION_BINDING_MISMATCH"],
    ["profile", (s: ReturnType<typeof setup>) => { s.publication.profile_id = "other-profile"; }, "PUBLICATION_BINDING_MISMATCH"],
    ["generation", (s: ReturnType<typeof setup>) => { s.publication.binding.projection_generation = "new-generation"; }, "PUBLICATION_BINDING_MISMATCH"],
  ])("refuses mismatched %s", async (_name, change, reason_code) => {
    const s = setup(); change(s);
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code });
  });

  it("checks expiry after awaited providers, not only at factory creation", async () => {
    const s = setup(); s.now.mockReturnValueOnce(2_000).mockReturnValueOnce(10_000);
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code: "CURRENT_DECISION_EXPIRED" });
  });

  it("rechecks actual current source and refuses revocation/change between its two rounds", async () => {
    const s = setup();
    s.readDecision.mockImplementationOnce(async () => structuredClone(s.decision)).mockImplementationOnce(async () => {
      throw new Error("TEST_ONLY-revoked-with-private-details-not-to-return");
    });
    const result = await s.factory.prepare(s.input);
    expect(result).toMatchObject({ state: "REFUSED", reason_code: "SOURCE_CHECK_FAILED" });
    expect(JSON.stringify(result)).not.toContain("private-details");
  });

  it("refuses a changed publication even with the same dataset binding", async () => {
    const s = setup();
    s.access.readPublication.mockImplementationOnce(async () => structuredClone(s.publication))
      .mockImplementationOnce(async () => ({ ...structuredClone(s.publication), publication_revision: "changed" }));
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code: "CURRENT_INPUT_CHANGED" });
  });

  it("does not retain mutable input across asynchronous provider calls", async () => {
    const s = setup(); const expected = structuredClone(s.input);
    s.readDecision.mockImplementationOnce(async () => { s.input.workload_id = "mutated"; return structuredClone(s.decision); });
    const result = await s.factory.prepare(s.input);
    expect(result.state).toBe("PREPARED_UNBOUND");
    if (result.state === "PREPARED_UNBOUND") expect(result.selection.workload_id).toBe(expected.workload_id);
  });

  it("reports absent historical publication instead of using current source IDs", async () => {
    const s = setup(); const access = { ...s.access, readPublication: undefined };
    expect(await prepareFinancialOperationSelectionFactory({ ...s.dependencies, access }).prepare(s.input))
      .toMatchObject({ state: "UNBOUND", missing_bindings: ["QUALIFIED_PUBLICATION"] });
  });

  it("refuses a widened or unrelated independent STREAM decision", async () => {
    const s = setup(); s.input.operation = "STREAM"; s.stream.valid_until_ms = 11_000;
    expect(await s.factory.prepare(s.input)).toMatchObject({ state: "REFUSED", reason_code: "CURRENT_DECISION_MISMATCH" });
  });

  it("binds workload and operation selection in the correlation digest without attesting either", async () => {
    const s = setup(), first = await s.factory.prepare(s.input);
    s.input.workload_id = "different-expected-workload"; const second = await s.factory.prepare(s.input);
    expect(first.state).toBe("PREPARED_UNBOUND"); expect(second.state).toBe("PREPARED_UNBOUND");
    if (first.state === "PREPARED_UNBOUND" && second.state === "PREPARED_UNBOUND") {
      expect(first.correlation_digest).not.toBe(second.correlation_digest);
      expect(second.missing_bindings).toContain("PM_WORKLOAD_APP_FIELD_ACCEPTANCE");
    }
  });
});
