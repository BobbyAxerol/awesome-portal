/** Server-injected owning-source adapter, not an HTTP/ENV producer mapping.
 * PM's source rules are accepted; its Portal identity/wire mapping is still
 * WIRE_MAPPING_OPEN. Consequently no default installation exists. Dataset and
 * series use this SAME adapter only after the source owner supplies a mapping.
 */
import { accessDigest } from "./access-policy";
import { sumExactDecimals } from "../research/exact-decimal";
import { buildManagerEconomicSourceInput, prepareManagerEconomicSourceFactory } from "./manager-economic-source-input";
import type { EconomicSourceReduction } from "./manager-economic-source.contract";
import type { ManagerFact, ManagerModelDocument } from "./manager-model.contract";

type Document = Pick<ManagerModelDocument, "workspace_id" | "environment" | "profile_id" | "qualification" | "catalogue_digest" |
  "revision" | "source_set_digest" | "projection_generation" | "as_of_ms" | "recorded_through_ms">;
export interface ManagerEconomicSourceRequest {
  document: Document; metric: "NAV" | "NET_PNL"; partition: ManagerFact["partition"];
  /** Already field/row-authorized facts only. The mapper must not add hidden facts. */
  facts: readonly ManagerFact[]; expected_tuple_keys: readonly string[]; binding_digest: string;
}
export interface ManagerEconomicSourceInstallation {
  mapping_ref: string; source_locator: string;
  scope: { workspace_id: string; environment: ManagerModelDocument["environment"]; profile_id: string };
  catalogue_digest: string; trust_policy: { policy_ref: string; accepted_namespaces: readonly string[] };
  /** Current owner/trust/permission fence, checked before AND after mapping. */
  isCurrent: () => boolean;
  /** The owning source supplies census, window, revisions, leaves and identity.
   * A null return means this exact population/cut has no accepted bridge. */
  resolve: (request: ManagerEconomicSourceRequest) => { binding_digest: string; selection: unknown; rows: unknown } | null;
}
export interface ManagerEconomicSourceContext { document: ManagerModelDocument; runtime: ManagerEconomicSourceRuntime; }
export interface ManagerEconomicSourceResult {
  value: string | null; reason_code: string | null; provenance_refs: string[]; reduction: EconomicSourceReduction | null;
}
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256 && !/[\u0000-\u001f\u007f]/.test(v);
const tupleKey = (f: ManagerFact) => JSON.stringify([f.tuple.alpha_id, f.tuple.alpha_version_id, f.tuple.portfolio_id,
  f.tuple.deployment_id, f.tuple.account_id]);
const sorted = (values: readonly string[]) => [...new Set(values)].sort();
// Bind amounts by exact numeric value, not formatting. The reducer already
// canonicalizes decimals when identifying identical immutable source rows.
// Never coerce to Number: that could hide a meaningful small difference.
const sameExactAmount = (left: string, right: string | null): boolean => {
  if (right === null) return false;
  const canonical = sumExactDecimals([left]);
  return canonical !== null && canonical === sumExactDecimals([right]);
};
function detached<T>(value: T): T {
  const copy: T = JSON.parse(JSON.stringify(value));
  const freeze = (v: unknown): void => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(copy); return copy;
}

export class ManagerEconomicSourceRuntime {
  readonly mapping_digest: string;
  readonly calculation_revision: string;
  private readonly installation: ManagerEconomicSourceInstallation;
  private resolved: Map<string, ManagerEconomicSourceResult> | undefined;
  constructor(installation: ManagerEconomicSourceInstallation) {
    if (![installation.mapping_ref, installation.source_locator, installation.trust_policy.policy_ref,
      installation.scope.workspace_id, installation.scope.profile_id, installation.catalogue_digest].every(text) ||
      !installation.trust_policy.accepted_namespaces.length || installation.trust_policy.accepted_namespaces.length > 32 ||
      installation.trust_policy.accepted_namespaces.some(n => !text(n)) ||
      new Set(installation.trust_policy.accepted_namespaces).size !== installation.trust_policy.accepted_namespaces.length ||
      typeof installation.resolve !== "function" || typeof installation.isCurrent !== "function")
      throw new Error("ECONOMIC_SOURCE_INSTALLATION_INVALID");
    this.installation = { ...installation, scope: detached(installation.scope), trust_policy: detached(installation.trust_policy) };
    this.mapping_digest = accessDigest({ mapping_ref: installation.mapping_ref, source_locator: installation.source_locator,
      scope: installation.scope, catalogue_digest: installation.catalogue_digest,
      trust_policy: { ...installation.trust_policy, accepted_namespaces: sorted(installation.trust_policy.accepted_namespaces) } });
    // Retained v1 observations are NOT evidence under a newly installed mapping.
    this.calculation_revision = `manager-series-economic.v1:${this.mapping_digest}`;
  }

  isCurrent(): boolean { try { return this.installation.isCurrent() === true; } catch { return false; } }
  matchesScope(scope: ManagerEconomicSourceInstallation["scope"]): boolean {
    return scope.workspace_id === this.installation.scope.workspace_id && scope.environment === this.installation.scope.environment &&
      scope.profile_id === this.installation.scope.profile_id;
  }
  /** Each read owns an isolated proof snapshot: no cross-request cache, timer,
   * source ownership inference or random/clock identity. An identical binding
   * is resolved only once for that read, including its group/statement reuse. */
  forRead(): ManagerEconomicSourceRuntime {
    const read = new ManagerEconomicSourceRuntime(this.installation);
    read.resolved = new Map();
    return read;
  }
  proofSnapshotDigest(): string | null {
    return this.resolved ? accessDigest([...this.resolved].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : null;
  }
  private once(binding: string, resolve: () => ManagerEconomicSourceResult,
    refused: () => ManagerEconomicSourceResult): ManagerEconomicSourceResult {
    const previous = this.resolved?.get(binding);
    if (previous) return previous;
    let result: ManagerEconomicSourceResult;
    try { result = resolve(); } catch { result = refused(); }
    const captured = detached(result);
    this.resolved?.set(binding, captured);
    return captured;
  }

  reduce(document: ManagerModelDocument, partition: ManagerFact["partition"], metric: "NAV" | "NET_PNL",
    facts: readonly ManagerFact[], expectedTuples: ReadonlySet<string>): ManagerEconomicSourceResult {
    const unavailable = (reason_code: string): ManagerEconomicSourceResult => ({ value: null, reason_code,
      provenance_refs: [this.mapping_digest, this.installation.source_locator], reduction: null });
    try {
      if (!this.isCurrent()) return unavailable("ECONOMIC_SOURCE_MAPPING_NOT_CURRENT");
      const i = this.installation;
      if (document.qualification !== "SOURCE_VERIFIED" || document.workspace_id !== i.scope.workspace_id ||
        document.environment !== i.scope.environment || document.profile_id !== i.scope.profile_id || document.catalogue_digest !== i.catalogue_digest ||
        partition.economic_domain !== ({ paper: "PAPER", sandbox: "SANDBOX", live: "ACTUAL" } as const)[document.environment])
        return unavailable("ECONOMIC_SOURCE_DOCUMENT_NOT_BOUND");
      if (!facts.length || facts.length > 2000 || expectedTuples.size > 2000) return unavailable("ECONOMIC_SOURCE_FACTS_NOT_BOUND");
      const first = facts[0].metric;
      const semantic = (f: ManagerFact) => accessDigest({ unit: f.metric.unit, currency: f.metric.currency, basis: f.metric.basis,
        window: f.metric.window, methodology: f.metric.methodology_ref, policy: f.metric.policy_revision, denominator: f.metric.denominator });
      if (facts.some(f => f.kind !== (metric === "NAV" ? "current_nav" : "net_pnl") || f.classification !== "ECONOMIC" ||
        accessDigest(f.partition) !== accessDigest(partition) || !expectedTuples.has(tupleKey(f)) ||
        f.metric.availability !== "AVAILABLE" || f.metric.value === null || f.metric.quality.completeness !== "COMPLETE" ||
        f.metric.unit !== "MONEY" || !f.metric.methodology_ref || f.metric.currency !== partition.currency ||
        f.metric.basis !== partition.basis || semantic(f) !== semantic(facts[0])))
        return unavailable("ECONOMIC_SOURCE_FACTS_NOT_BOUND");
      const covered = new Set(facts.map(tupleKey));
      if ([...expectedTuples].some(k => !covered.has(k))) return unavailable("SOURCE_FACT_CENSUS_INCOMPLETE");
      const doc: Document = { workspace_id: document.workspace_id, environment: document.environment, profile_id: document.profile_id,
        qualification: document.qualification, catalogue_digest: document.catalogue_digest, revision: document.revision,
        source_set_digest: document.source_set_digest, projection_generation: document.projection_generation,
        as_of_ms: document.as_of_ms, recorded_through_ms: document.recorded_through_ms };
      const bound = { document: doc, metric, partition, facts: [...facts].sort((a, b) => a.fact_id.localeCompare(b.fact_id)),
        expected_tuple_keys: sorted([...expectedTuples]) };
      const request = detached({ ...bound, binding_digest: accessDigest({ mapping: this.mapping_digest, ...bound }) });
      return this.once(request.binding_digest, () => {
      const mapped = i.resolve(request);
      if (!this.isCurrent()) return unavailable("ECONOMIC_SOURCE_MAPPING_NOT_CURRENT");
      if (!mapped) return unavailable("ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED");
      if (mapped.binding_digest !== request.binding_digest) return unavailable("ECONOMIC_SOURCE_BINDING_MISMATCH");
      const built = buildManagerEconomicSourceInput(mapped.selection, mapped.rows);
      if (built.state !== "BUILT_PROPOSAL") return unavailable("ECONOMIC_SOURCE_INPUT_INVALID");
      const input = built.input, e = input.expectation;
      if (e.metric !== metric || e.environment !== document.environment || e.currency !== partition.currency || e.basis !== partition.basis ||
        accessDigest(e.window) !== accessDigest(first.window) || e.cut.recorded_through_ms !== document.recorded_through_ms ||
        e.cut.effective_at_ms > document.as_of_ms || e.valuation_cutoff_ms !== e.cut.effective_at_ms ||
        input.trust_policy.policy_ref !== i.trust_policy.policy_ref ||
        accessDigest(sorted(input.trust_policy.accepted_namespaces)) !== accessDigest(sorted(i.trust_policy.accepted_namespaces)))
        return unavailable("ECONOMIC_SOURCE_BINDING_MISMATCH");
      const byId = new Map(facts.map(f => [f.fact_id, f]));
      if (byId.size !== facts.length || input.rows.length !== facts.length) return unavailable("ECONOMIC_SOURCE_FACTS_NOT_BOUND");
      const seen = new Set<string>();
      for (const row of input.rows) {
        const f = byId.get(row.portal_fact_id);
        if (row.evidence !== "PROVEN_SOURCE_ROW" || !f || seen.has(row.portal_fact_id) || !sameExactAmount(row.amount, f.metric.value) ||
          row.cut.effective_at_ms !== f.effective_at_ms || row.cut.recorded_through_ms < f.recorded_at_ms ||
          row.ownership !== null && (row.ownership.economic_account_ref.state !== "PROVIDED" ||
          row.ownership.ownership_partition_ref.state !== "PROVIDED" ||
          row.ownership.economic_account_ref.ref !== f.economic_account_ref ||
          row.ownership.ownership_partition_ref.ref !== f.ownership_partition_ref))
          return unavailable("ECONOMIC_SOURCE_FACTS_NOT_BOUND");
        seen.add(row.portal_fact_id);
      }
      const { schema_version: _schema, rows: _rows, ...capturedSelection } = input;
      const prepared = prepareManagerEconomicSourceFactory(capturedSelection);
      if (prepared.state !== "PREPARED_PROPOSAL") return unavailable("ECONOMIC_SOURCE_INPUT_INVALID");
      // Dataset and series both reach the identical strict reducer. A proposal
      // schema parsing successfully is never itself accepted source authority.
      const reduction = prepared.dataset(input.rows);
      return { value: reduction.state === "COMPLETE" ? reduction.value : null,
        reason_code: reduction.state === "COMPLETE" ? null : reduction.reason_codes[0] ?? "ECONOMIC_SOURCE_INPUT_INVALID",
        provenance_refs: [this.mapping_digest, i.source_locator, ...(reduction.economic_set_digest ? [reduction.economic_set_digest] : [])], reduction };
      }, () => unavailable("ECONOMIC_SOURCE_MAPPING_REFUSED"));
    } catch { return unavailable("ECONOMIC_SOURCE_MAPPING_REFUSED"); }
  }
}
