/**
 * Research Loop — the imported alpha's read identity (F2, S06 + S07).
 *
 * `imported_alpha` is published by the Search and Freeze reads only for a run
 * of an IMPORTED alpha. A built-in alpha publishes nothing, so nothing is drawn
 * (not an "n/a" line). One compact mono line, all of it the server's:
 * `imported · <entrypoint> · sha256:<first 8 of source_digest>…`, then the
 * categorical parameters as served as chips. The full digests and every pinned
 * parameter ride in the title.
 */

import type { components as SearchComponents } from "@portal/contracts-research-search";

export type ImportedAlphaBinding = SearchComponents["schemas"]["ImportedAlphaReadBinding"];

const DIGEST_SHOWN = 8;

/** `sha256:abcd1234…` — the served source digest, shortened; the full value is in the title. */
export function importedAlphaDigestLabel(binding: ImportedAlphaBinding): string {
  return `sha256:${binding.source_digest.slice(0, DIGEST_SHOWN)}…`;
}

export function ImportedAlphaLine({ binding }: { binding: ImportedAlphaBinding | null | undefined }) {
  if (!binding) return null;
  const categorical = binding.parameters.filter((parameter) => parameter.kind === "categorical");
  const title = [
    `source_digest sha256:${binding.source_digest}`,
    `entrypoint ${binding.entrypoint}`,
    `parameter_bundle_digest sha256:${binding.parameter_bundle_digest}`,
    ...binding.parameters.map((parameter) => `${parameter.name} (${parameter.kind}) = ${String(parameter.value)}`),
  ].join("\n");
  return (
    <div
      className="mono flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]"
      style={{ color: "var(--ink-soft)" }}
      data-imported-alpha={binding.entrypoint}
      title={title}
    >
      <span>imported</span>
      <span style={{ color: "var(--ink-faint)" }} aria-hidden="true">
        ·
      </span>
      <span data-imported-entrypoint>{binding.entrypoint}</span>
      <span style={{ color: "var(--ink-faint)" }} aria-hidden="true">
        ·
      </span>
      <span data-imported-digest={binding.source_digest}>{importedAlphaDigestLabel(binding)}</span>
      {categorical.map((parameter) => (
        <span
          key={parameter.name}
          className="rounded-[3px] border px-1.5 py-[1px] text-[10px]"
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }}
          data-imported-param={parameter.name}
          title={`${parameter.name} (categorical) = ${String(parameter.value)}`}
        >
          {parameter.name}={String(parameter.value)}
        </span>
      ))}
    </div>
  );
}
