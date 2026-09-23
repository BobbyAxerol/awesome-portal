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

  return (
    <details
      className="rounded-[6px] border px-3 py-1.5"
      data-provenance
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
    >
      <summary className="mono cursor-pointer text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        provenance
        {provenance.source_adapter_id ? ` · ${provenance.source_adapter_id}` : ""}
        {provenance.engine_version ? ` · engine ${provenance.engine_version}` : ""}
      </summary>

      <div className="mt-1.5 flex flex-col gap-1">
        {provenance.input_scope !== undefined ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-input-scope>
            input scope{" "}
            {provenance.input_scope === null ? (
              <em>not published</em>
            ) : (
              provenance.input_scope.toLowerCase().replace(/_/g, " ")
            )}
          </span>
        ) : null}

        {/*
          * The requested and the effective spec are two facts, and a reader
          * who cannot see both cannot tell whether the run they are reading is
          * the run that was asked for.
          */}
        {digests.map(([key, label]) => (
          <span
            key={key}
            className="mono text-[9.5px]"
            style={{ color: "var(--ink-faint)" }}
            data-provenance-digest={key}
          >
            {label} {provenance[key] === null ? <em>not published</em> : provenance[key]}
          </span>
        ))}

        {provenance.p14_split_revision !== undefined ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-split-revision-row>
            split revision{" "}
            {provenance.p14_split_revision === null ? <em>not published</em> : provenance.p14_split_revision}
          </span>
        ) : null}
      </div>
    </details>
  );
}
