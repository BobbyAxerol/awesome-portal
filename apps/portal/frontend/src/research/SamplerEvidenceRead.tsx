/** A request's knobs are configuration, not a trace of the engine's proposals. */
import type { CurrentSourceSearch } from "./searchClient";

export function SamplerEvidenceRead({ fact, fallbackCode, fallbackWords = "sampler: not published" }: {
  fact?: CurrentSourceSearch["sampler_evidence"];
  fallbackCode?: string | null;
  fallbackWords?: string;
}) {
  if (!fact) return <span className="italic" title={fallbackCode ?? undefined} data-absent={fallbackCode ?? ""}>{fallbackWords}</span>;
  const requested = fact.requested_configuration;
  const trace = fact.execution_trace;
  const captured = trace && trace.state !== "NOT_PUBLISHED" ? trace.capture : null;
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
      {captured ? (
        <span data-sampler-execution-trace={trace?.state} title={`${captured.scope} · sha256:${captured.artifact_sha256} · ${captured.size_bytes} bytes · ${captured.sampled_trial_count} sampled / ${captured.recorded_trial_count} recorded trials`}>
          {Array.from(new Set(captured.studies.map(study => study.sampler_class))).join(" / ")} · {captured.recorded_trial_count} observed trials · {captured.invocation_count} sampler calls
          {trace?.state === "PARTIAL" ? " · partial capture" : ""}
          <span data-sampler-trace-samples title={JSON.stringify(captured.sample_trials)}>
            {" · "}{captured.sampled_trial_count} retained trace examples
          </span>
        </span>
      ) : trace ? (
        <span className="italic" data-sampler-execution-trace="NOT_PUBLISHED" title={`${trace.reason_code} · ${trace.source_ref}`}>
          sampler calls: not recorded for this run
        </span>
      ) : null}
      <span className="italic" title={`${fact.internal_trace.reason_code} · ${fact.internal_trace.source_ref}`} data-sampler-internal-trace={fact.internal_trace.state}>
        {captured ? "TPE density/ranking internals: not published" : "sampler internal trace: not published"}
      </span>
      <span title={`${fact.observed_trials.scope} · ${fact.observed_trials.source_ref}`} data-sampler-observed-trials>
        {fact.observed_trials.source_trial_count} retained trials · not an internal trace
      </span>
    </>
  );
}
