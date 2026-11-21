/**
 * The provenance strip, shared by Screens 05, 06 and 07.
 *
 * Every deep dive's hi-fi carries a source line — `config/fold_plan.json`,
 * `parameter_set.json · bundle manifest` — and every contract publishes the
 * digests behind it. The first pass of these three screens rendered the facts
 * and dropped the provenance, which is the half that tells a reader *which*
 * run's facts they are looking at.
 *
 * Nothing here is parsed or shortened: a digest is printed as the server sent
 * it, and a digest the server did not send says so rather than disappearing.
 */

export interface ProvenanceFacts {
  source_adapter_id?: string | null;
  engine_version?: string | null;
  input_scope?: string | null;
  adapter_contract_digest?: string | null;
  source_transform_digest?: string | null;
  source_split_digest?: string | null;
  requested_spec_digest?: string | null;
  effective_spec_digest?: string | null;
  dataset_binding_digest?: string | null;
  manifest_digest?: string | null;
  p14_split_revision?: string | null;
}

const DIGEST_LABEL: [keyof ProvenanceFacts, string][] = [
  ["adapter_contract_digest", "adapter contract"],
  ["source_transform_digest", "source transform"],
  ["source_split_digest", "source split"],
  ["requested_spec_digest", "requested spec"],
  ["effective_spec_digest", "effective spec"],
  ["dataset_binding_digest", "dataset binding"],
  ["manifest_digest", "manifest"],
];

export function ProvenanceStrip({ provenance }: { provenance: ProvenanceFacts }) {
  const digests = DIGEST_LABEL.filter(([key]) => provenance[key] !== undefined);
  /* One short line (source · revision · engine); every digest and the input scope ride in the tooltip. */
  const line = [
    provenance.source_adapter_id,
    provenance.p14_split_revision ? `split ${provenance.p14_split_revision}` : null,
    provenance.engine_version ? `engine ${provenance.engine_version}` : null,
  ].filter(Boolean);
  const tip = [
    provenance.input_scope !== undefined
      ? `input scope ${provenance.input_scope === null ? "not published" : provenance.input_scope.toLowerCase().replace(/_/g, " ")}`
      : null,
    ...digests.map(([key, label]) => `${label} ${provenance[key] === null ? "not published" : provenance[key]}`),
    provenance.p14_split_revision === null ? "split revision not published" : null,
  ].filter(Boolean);

  return (
    <p
      className="mono text-[9.5px]"
      data-provenance
      style={{ color: "var(--ink-faint)" }}
      title={tip.length > 0 ? tip.join("\n") : undefined}
    >
      {line.length > 0 ? line.join(" · ") : <em>provenance not published</em>}
    </p>
  );
}
