/** A request's knobs are configuration, not a trace of the engine's proposals. */
import type { CurrentSourceSearch } from "./searchClient";

export function SamplerEvidenceRead({ fact, fallbackCode, fallbackWords = "sampler: not published" }: {
  fact?: CurrentSourceSearch["sampler_evidence"];
  fallbackCode?: string | null;
  fallbackWords?: string;
}) {
  if (!fact) return <span className="italic" title={fallbackCode ?? undefined} data-absent={fallbackCode ?? ""}>{fallbackWords}</span>;
  const requested = fact.requested_configuration;
  return (
    <>
      {requested.state === "AVAILABLE" && requested.optimization_config !== null ? (
        <span data-sampler-configuration="AVAILABLE" title={`${requested.scope} · ${requested.requested_spec_digest} · ${requested.source_ref}`}>
          <span>
            sampler configuration · requested spec
          </span>{" · "}
          <span data-sampler-configuration-values>
            {Object.entries(requested.optimization_config).map(([name, value]) => `${name} ${String(value)}`).join(" · ")}
            {requested.random_seed !== null ? ` · random seed ${requested.random_seed}` : ""}
          </span>
        </span>
      ) : (
        <span className="italic" title={`${requested.reason_code} · ${requested.source_ref}`} data-sampler-configuration="NOT_PUBLISHED">
          sampler configuration: not published
        </span>
      )}
      <span className="italic" title={`${fact.internal_trace.reason_code} · ${fact.internal_trace.source_ref}`} data-sampler-internal-trace={fact.internal_trace.state}>
        sampler internal trace: not published
      </span>
      <span title={`${fact.observed_trials.scope} · ${fact.observed_trials.source_ref}`} data-sampler-observed-trials>
        {fact.observed_trials.source_trial_count} retained trials · not an internal trace
      </span>
    </>
  );
}
