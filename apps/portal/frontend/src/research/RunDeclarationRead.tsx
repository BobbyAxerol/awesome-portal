/** Immutable inputs carried by this run's owning read, never current Registry. */
import type { components } from "@portal/contracts-research-progress";
import { ParameterSpaceTable, rowsFromDeclaration, type ParameterSpaceRow } from "./ParameterSpaceTable";

export type RunDeclaration = components["schemas"]["RunDeclaration"];

export function rowsForRunDeclaration(fact: RunDeclaration): ParameterSpaceRow[] | null {
  if (fact.state !== "AVAILABLE" || fact.declaration === null || fact.requested_overrides === null || fact.alpha_binding === null) return null;
  const rows = rowsFromDeclaration(fact.declaration.parameter_space);
  return rows?.map(row => {
    const override = fact.requested_overrides!.find(value => value.name === row.name);
    return override === undefined ? row : { ...row, status: override.kind === "pin"
      ? { text: `pinned ${String(override.value)}`, tone: "pinned" as const }
      : { text: `swept ${String(override.low)} … ${String(override.high)}`, tone: "swept" as const } };
  }) ?? null;
}

export function RunDeclarationRead({ fact }: { fact?: RunDeclaration | null }) {
  if (!fact) return null;
  const rows = rowsForRunDeclaration(fact);
  const declared = fact.declaration;
  return (
    <details data-run-declaration={fact.state} data-declaration-digest={fact.declaration_digest ?? undefined}>
      <summary className="mono cursor-pointer text-[10.5px]" title={fact.source_ref}>
        declared parameters · {fact.alpha_binding?.alpha_version_id ?? (fact.state === "NOT_APPLICABLE" ? "not applicable" : "not published")}
      </summary>
      {rows === null || declared === null ? (
        <span className="mono text-[10px]" title={`${fact.reason_code ?? "P24_RUN_DECLARATION_INCOMPLETE"} · ${fact.source_ref}`} data-declaration-absence={fact.reason_code ?? "P24_RUN_DECLARATION_INCOMPLETE"}>
          {fact.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
        </span>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="mono flex flex-wrap gap-x-3 gap-y-1 text-[10px]" data-run-declaration-chips>
            <span data-declared-binding>{fact.alpha_binding!.alpha_id} · {fact.alpha_binding!.alpha_version_id}</span>
            <span data-declared-entrypoint>{declared.entrypoint}</span>
            <span data-declared-timeframes>{declared.timeframes.join(" · ")}</span>
            <span data-declared-columns>{declared.required_columns.join(" · ")}</span>
            <span data-declared-warmup>warmup {declared.warmup_bars} bars</span>
            <span data-declared-seed>{declared.determinism.seed_required ? "fixed seed required" : "seed not required"}</span>
          </div>
          <ParameterSpaceTable rows={rows} caption={false} ariaLabel="run's immutable declared parameters" />
          <p className="mono m-0 text-[9.5px]" title={`${fact.declaration_digest} · ${fact.requested_spec_digest} · ${fact.source_ref}`} data-run-declaration-source>
            immutable alpha-version declaration · requested overrides · read-only
          </p>
        </div>
      )}
    </details>
  );
}
