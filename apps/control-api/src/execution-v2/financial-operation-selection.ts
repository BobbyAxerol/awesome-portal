/** CORE-03 DARK preparation only. This module mints NO capability/credential,
 * grants nothing and never issues/enters/releases a native or owning PM lease.
 * Existing AccessTrustProvider snapshots do not contain PM AcceptedCurrentAccess
 * or a CurrentReadAuthority tied to its owning request/connection/transaction.
 * Even internally correlated SOURCE_VERIFIED data therefore stays UNBOUND.
 * No runtime/HTTP/DB/DI import selects this factory. */
import { z } from "zod";
import { accessText, managerDomainReadInput, tsMembershipAcceptance,
  type ManagerDomainReadInput, type ManagerDomainReadDecision, type ManagerDomainStreamDecision } from "./access.contract";
import { currentAccessRelations } from "./access-current-relations";
import { accessDigest } from "./access-digest";
import type { AccessTrustProvider } from "./access-trust";
import { readDatasetBinding, readPublication } from "./read-publication";
import { isBusinessReadField } from "./read-fields";

const operation = z.enum(["READ", "HISTORY", "EXPORT", "STREAM"]);
export type FinancialOperation = z.infer<typeof operation>;
/** Requirements, NOT grants or a PM wire translation. In particular EXPORT's
 * report.export and STREAM's independent grant cannot come from a READ result. */
export const FINANCIAL_OPERATION_REQUIREMENTS = Object.freeze({
  READ: Object.freeze(["business.read_all"] as const),
  HISTORY: Object.freeze(["business.read_all"] as const),
  EXPORT: Object.freeze(["business.read_all", "report.export"] as const),
  STREAM: Object.freeze(["business.read_all", "stream.subscribe"] as const),
});
const revision = tsMembershipAcceptance.shape.mapping_revision;
const mapping = z.object({ ts_user_id: accessText, revision }).strict();
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$(?![\s\S])/);
const milliseconds = z.number().int().nonnegative().safe();
// Validation of existing internal DTOs, not an accepted source credential schema.
const readDecision = z.object({ actor: managerDomainReadInput.shape.actor,
  authority_fingerprint: digest, scope_digest: digest,
  field_policy_sha256: managerDomainReadInput.shape.domain.shape.field_policy_sha256,
  field_policy_ref: accessText, valid_until_ms: milliseconds, now_ms: milliseconds,
  policy_revision: revision, grant_id: accessText, grant_revision: revision }).strict();
const streamDecision = readDecision.extend({ stream_scope_digest: digest,
  stream_grant_id: accessText, stream_grant_revision: revision }).strict();
const request = z.object({ context: managerDomainReadInput, operation,
  // Expected selection pins only: these strings do not attest a workload/app authority.
  workload_id: accessText, source_audience: accessText, mapping,
  expected_policy_revision: revision, binding: readDatasetBinding,
  fields: z.array(accessText).min(1).max(256).refine(v => new Set(v).size === v.length),
  tuples: readPublication.shape.tuples.min(1).refine(v =>
    new Set(v.map(tuple => accessDigest(tuple))).size === v.length),
}).strict();
export type FinancialOperationSelectionRequest = z.infer<typeof request>;
export interface FinancialOperationSelectionDependencies {
  access: Pick<AccessTrustProvider, "relations" | "verifiedHumanMapping" | "readPublication">;
  /** Existing Core decision functions, closed over their actual owner/pool by
   * the caller. These DTO checks do not brand a lookalike as a held capability. */
  readDecision(input: ManagerDomainReadInput): Promise<ManagerDomainReadDecision | null>;
  streamDecision?(input: ManagerDomainReadInput): Promise<ManagerDomainStreamDecision | null>;
  now(): number;
}
const STATUS = "PROPOSAL_NOT_FINANCIAL_AUTHORITY" as const;
export type FinancialOperationUnbound = "CURRENT_MAPPING" | "CURRENT_RELATIONS" | "QUALIFIED_PUBLICATION"
  | "CORE_READ_DECISION" | "CORE_STREAM_DECISION" | "PORTAL_REPORT_EXPORT_DECISION"
  | "HISTORICAL_WINDOW_GENERATION" | "PUBLICATION_POPULATION_COVERAGE"
  | "PM_WORKLOAD_APP_FIELD_ACCEPTANCE" | "PM_OPERATION_AUDIENCE_ACCEPTANCE" | "PM_OPERATION_FIELD_ACCEPTANCE"
  | "PM_OWNING_REQUEST_CONNECTION_TRANSACTION" | "PM_REPORT_SCOPE_BUSINESS_REPORT" | "TS_OWNING_COMMIT_FENCE";
type Refusal = "INPUT_INVALID" | "AUDIENCE_CONFLATION" | "FIELD_NOT_PUBLISHED" | "CURRENT_INPUT_INVALID" | "CURRENT_IDENTITY_MISMATCH"
  | "CURRENT_DECISION_MISMATCH" | "CURRENT_DECISION_EXPIRED" | "PUBLICATION_BINDING_MISMATCH"
  | "TUPLE_NOT_IN_PUBLICATION" | "CURRENT_INPUT_CHANGED" | "SOURCE_CHECK_FAILED";
type Label = "PROPOSAL" | "TEST_ONLY";
export type FinancialOperationSelectionResult =
  | { state: "REFUSED"; status: typeof STATUS; qualification: Label; reason_code: Refusal }
  | { state: "UNBOUND"; status: typeof STATUS; qualification: Label; missing_bindings: readonly FinancialOperationUnbound[] }
  | { state: "PREPARED_UNBOUND"; status: typeof STATUS; qualification: Label;
      missing_bindings: readonly FinancialOperationUnbound[];
      selection: Readonly<FinancialOperationSelectionRequest>;
      correlation_digest: string; publication_revision: string;
      required_core_actions: readonly string[] };
const refused = (reason_code: Refusal): FinancialOperationSelectionResult =>
  Object.freeze({ state: "REFUSED", status: STATUS, qualification: "PROPOSAL", reason_code });
const unbound = (...missing_bindings: FinancialOperationUnbound[]): FinancialOperationSelectionResult =>
  Object.freeze({ state: "UNBOUND", status: STATUS, qualification: "PROPOSAL", missing_bindings: Object.freeze(missing_bindings) });
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const identity = (decision: z.infer<typeof readDecision>) => {
  const { now_ms: _observedClock, ...meaning } = decision;
  return meaning;
};

/** Two fresh rounds through the injected existing ports detect mapping,
 * revocation/session, policy, field and publication changes during preparation.
 * This is NOT an atomic/held TS fence: the result always lists the absent PM
 * acceptance/owning-transaction port, even after both rounds agree. */
export function prepareFinancialOperationSelectionFactory(dependencies: FinancialOperationSelectionDependencies) {
  const { access, readDecision: decideRead, streamDecision: decideStream, now } = dependencies;
  return Object.freeze({ prepare: async (input: unknown): Promise<FinancialOperationSelectionResult> => {
    const parsed = request.safeParse(input);
    if (!parsed.success) return refused("INPUT_INVALID");
    const selected = freeze(parsed.data);
    // Native identity trust cannot supply financial operation authority. All
    // other audience strings remain expectations, including pma.management.v1:
    // that known management audience is NOT an accepted financial-read binding.
    if (selected.source_audience === "pma.identity.v1") return refused("AUDIENCE_CONFLATION");
    if (!selected.fields.every(isBusinessReadField)) return refused("FIELD_NOT_PUBLISHED");
    if (!access.readPublication) return unbound("QUALIFIED_PUBLICATION");
    const publicationRequest = { workspace_id: selected.context.workspace_id, environment: selected.context.environment,
      profile_id: selected.context.domain.profile_id, binding: selected.binding };
    const inspect = async () => {
      const [human, relations, publication, decision, stream] = await Promise.all([
        access.verifiedHumanMapping(selected.context.actor.user_id, selected.context.workspace_id),
        access.relations(selected.context.actor.user_id, selected.context.workspace_id),
        access.readPublication!(structuredClone(publicationRequest)), decideRead(structuredClone(selected.context)),
        selected.operation === "STREAM" && decideStream ? decideStream(structuredClone(selected.context)) : null,
      ]);
      return { human, relations, publication, decision, stream };
    };
    const check = (snapshot: Awaited<ReturnType<typeof inspect>>) => {
      const clock = now();
      if (!milliseconds.safeParse(clock).success) return { error: refused("CURRENT_INPUT_INVALID") };
      if (snapshot.human === null) return { error: unbound("CURRENT_MAPPING") };
      if (snapshot.relations?.qualified !== true || snapshot.relations.current_authority == null)
        return { error: unbound("CURRENT_RELATIONS") };
      if (snapshot.publication === null) return { error: unbound("QUALIFIED_PUBLICATION") };
      if (snapshot.decision === null) return { error: unbound("CORE_READ_DECISION") };
      const human = mapping.safeParse(snapshot.human), source = currentAccessRelations.safeParse(snapshot.relations.current_authority),
        publication = readPublication.safeParse(snapshot.publication), decision = readDecision.safeParse(snapshot.decision),
        stream = snapshot.stream === null ? null : streamDecision.safeParse(snapshot.stream);
      if (!human.success || !source.success || !publication.success || !decision.success || stream !== null && !stream.success)
        return { error: refused("CURRENT_INPUT_INVALID") };
      if (accessDigest(human.data) !== accessDigest(selected.mapping) || source.data.subject_user_id !== selected.context.actor.user_id ||
        source.data.workspace_id !== selected.context.workspace_id || source.data.ts_user_id !== human.data.ts_user_id ||
        source.data.mapping_revision !== human.data.revision) return { error: refused("CURRENT_IDENTITY_MISMATCH") };
      const d = decision.data;
      if (accessDigest(d.actor) !== accessDigest(selected.context.actor) || d.policy_revision !== selected.expected_policy_revision ||
        d.field_policy_sha256 !== selected.context.domain.field_policy_sha256 ||
        selected.context.expected_scope_digest !== undefined && d.scope_digest !== selected.context.expected_scope_digest)
        return { error: refused("CURRENT_DECISION_MISMATCH") };
      if (d.now_ms > clock || d.now_ms >= d.valid_until_ms || clock >= d.valid_until_ms)
        return { error: refused("CURRENT_DECISION_EXPIRED") };
      if (stream?.success) {
        const { stream_scope_digest: _scope, stream_grant_id: _grant, stream_grant_revision: _revision, ...base } = stream.data;
        // Independent STREAM may shorten READ's ceiling, never widen it.
        if (base.valid_until_ms > d.valid_until_ms || accessDigest(identity({ ...base, valid_until_ms: d.valid_until_ms })) !==
          accessDigest(identity(d))) return { error: refused("CURRENT_DECISION_MISMATCH") };
        if (base.now_ms > clock || base.now_ms >= base.valid_until_ms || clock >= base.valid_until_ms)
          return { error: refused("CURRENT_DECISION_EXPIRED") };
      }
      const p = publication.data;
      if (p.workspace_id !== selected.context.workspace_id || p.environment !== selected.context.environment ||
        p.profile_id !== selected.context.domain.profile_id || accessDigest(p.binding) !== accessDigest(selected.binding))
        return { error: refused("PUBLICATION_BINDING_MISMATCH") };
      const tuples = new Set(p.tuples.map(tuple => accessDigest(tuple)));
      if (!selected.tuples.every(tuple => tuples.has(accessDigest(tuple)))) return { error: refused("TUPLE_NOT_IN_PUBLICATION") };
      return { value: { human: human.data, source: source.data, publication: p, decision: identity(d),
        stream: stream?.success ? { ...identity(stream.data), stream_scope_digest: stream.data.stream_scope_digest,
          stream_grant_id: stream.data.stream_grant_id, stream_grant_revision: stream.data.stream_grant_revision } : null } };
    };
    try {
      const first = check(await inspect());
      if (first.error) return first.error;
      const second = check(await inspect());
      if (second.error) return second.error;
      if (accessDigest(first.value) !== accessDigest(second.value)) return refused("CURRENT_INPUT_CHANGED");
      const current = second.value!;
      const missing: FinancialOperationUnbound[] = ["PM_WORKLOAD_APP_FIELD_ACCEPTANCE", "PM_OPERATION_AUDIENCE_ACCEPTANCE", "PM_OPERATION_FIELD_ACCEPTANCE",
        "PM_OWNING_REQUEST_CONNECTION_TRANSACTION", "TS_OWNING_COMMIT_FENCE"];
      if (selected.operation === "STREAM" && current.stream === null) missing.push("CORE_STREAM_DECISION");
      if (selected.operation === "EXPORT") missing.push("PORTAL_REPORT_EXPORT_DECISION", "PM_REPORT_SCOPE_BUSINESS_REPORT");
      if (selected.operation === "HISTORY" && (selected.binding.window === null || !selected.binding.projection_generation))
        missing.push("HISTORICAL_WINDOW_GENERATION");
      if (current.publication.population_coverage !== "COMPLETE_FOR_DATASET_WINDOW") missing.push("PUBLICATION_POPULATION_COVERAGE");
      const qualification: Label = current.publication.qualification === "TEST_ONLY" ? "TEST_ONLY" : "PROPOSAL";
      return freeze({ state: "PREPARED_UNBOUND" as const, status: STATUS, qualification,
        missing_bindings: missing, selection: selected, correlation_digest: accessDigest({ selected, current }),
        publication_revision: current.publication.publication_revision,
        required_core_actions: FINANCIAL_OPERATION_REQUIREMENTS[selected.operation] });
    } catch { return refused("SOURCE_CHECK_FAILED"); }
  } });
}
