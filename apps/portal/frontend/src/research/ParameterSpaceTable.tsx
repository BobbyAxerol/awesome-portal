/**
 * The declared parameter space as one compact read-only table: what the alpha
 * version declares, nothing added. Shared by Import (parsed declaration), New
 * Run Review (declaration + the draft's sweep/pin) and any screen that holds a
 * declaration. It computes nothing: every cell is a value the declaration or
 * the draft already carries; a value that is not carried reads as typed absence.
 */

import type { DeclaredParameter } from "./alphaImportClient";
import type { ParameterEntry } from "./runDraft";

type Scalar = string | number | boolean | null;

export interface ParameterSpaceRow {
  name: string;
  kind: string | null;
  low?: Scalar;
  high?: Scalar;
  step?: number | null;
  levels?: readonly Scalar[];
  /** A fixed declaration's value. */
  value?: Scalar;
  /** The draft's choice for this parameter, when the screen holds one. */
  status?: { text: string; tone: "swept" | "pinned" | "refused" };
  /** A declaration shape this table cannot read: shown raw, not interpreted. */
  raw?: string;
}

export const PARAMETER_SPACE_CAPTION = "declared by the alpha version — you can narrow or pin, not add";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rows from a served `parameter_space` map. Entries without a declared kind are carried raw. */
export function rowsFromDeclaration(space: unknown): ParameterSpaceRow[] | null {
  if (!isRecord(space)) return null;
  return Object.entries(space).map(([name, entry]) => {
    const declared = entry as Partial<DeclaredParameter> | undefined;
    if (isRecord(entry) && typeof declared?.kind === "string") {
      switch (declared.kind) {
        case "int_range":
        case "float_range":
          return { name, kind: declared.kind, low: declared.low, high: declared.high, step: declared.step };
        case "categorical":
          return { name, kind: declared.kind, levels: declared.values };
        case "fixed":
          return { name, kind: declared.kind, value: declared.value };
      }
    }
    return { name, kind: null, raw: JSON.stringify(entry) };
  });
}

/** Rows from the draft's parameter entries (declaration + sweep/pin as the draft holds them). */
export function rowsFromEntries(entries: readonly ParameterEntry[]): ParameterSpaceRow[] {
  return entries.map((entry) => ({
    name: entry.name,
    kind: entry.declaredKind ?? null,
    ...(entry.levels
      ? { levels: entry.levels }
      : entry.declaredKind === "fixed"
        ? { value: entry.declaredLow }
        : { low: entry.declaredLow, high: entry.declaredHigh, step: entry.declaredStep ?? null }),
    status:
      entry.dimension === "pin"
        ? { text: `pinned ${entry.low}`, tone: "pinned" as const }
        : { text: `swept ${entry.low} … ${entry.high}`, tone: "swept" as const },
  }));
}

const TONE: Record<"swept" | "pinned" | "refused", string> = {
  swept: "var(--accent)",
  pinned: "var(--role-holdout)",
  refused: "var(--bad)",
};

function range(row: ParameterSpaceRow): string {
  if (row.raw !== undefined) return row.raw;
  if (row.levels) return `[${row.levels.map(String).join(", ")}]`;
  if (row.kind === "fixed") return String(row.value);
  return `${row.low} … ${row.high}`;
}

export function ParameterSpaceTable({
  rows,
  caption = true,
  ariaLabel = "declared parameters",
}: {
  rows: readonly ParameterSpaceRow[];
  caption?: boolean;
  ariaLabel?: string;
}) {
  const withStatus = rows.some((row) => row.status);
  return (
    <div data-parameter-space className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <div className="overflow-x-auto">
        <table className="mono w-full border-collapse text-[10.5px]" aria-label={ariaLabel}>
          <thead>
            <tr style={{ color: "var(--ink-faint)", textAlign: "left" }} className="text-[9px] uppercase">
              <th className="pb-1 pr-3 font-normal">param</th>
              <th className="pb-1 pr-3 font-normal">kind</th>
              <th className="pb-1 pr-3 font-normal">declared</th>
              <th className="pb-1 pr-3 font-normal">step</th>
              {withStatus ? <th className="pb-1 font-normal">status</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} data-parameter-row={row.name} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td className="py-[2px] pr-3" style={{ color: "var(--ink)" }}>{row.name}</td>
                <td className="py-[2px] pr-3" style={{ color: "var(--ink-faint)" }}>
                  {row.kind ?? <span className="italic" title="The declaration names no kind for this parameter.">not published</span>}
                </td>
                <td className="py-[2px] pr-3">{range(row)}</td>
                <td className="py-[2px] pr-3" style={{ color: "var(--ink-faint)" }} data-parameter-step={row.name}>
                  {row.step === null || row.step === undefined ? (
                    <span className="italic" title="The declaration names no grid for this parameter.">no grid</span>
                  ) : (
                    String(row.step)
                  )}
                </td>
                {withStatus ? (
                  <td className="py-[2px]" style={{ color: row.status ? TONE[row.status.tone] : "var(--ink-faint)" }} data-parameter-status={row.name}>
                    {row.status?.text}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? (
        <p className="m-0 text-[10px]" style={{ color: "var(--ink-faint)" }} title="The alpha version's declaration is the maximal surface. A run may sweep a narrower range or pin a value; it can never add or widen a parameter." data-parameter-space-caption>
          {PARAMETER_SPACE_CAPTION}
        </p>
      ) : null}
    </div>
  );
}
