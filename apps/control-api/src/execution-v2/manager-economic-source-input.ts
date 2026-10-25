/** CORE-04: shared strict proposal input builder for dataset and series callers.
 * No ManagerFact/account ID is converted into a trusted economic identity.
 * The caller supplies every semantic proof explicitly under BE-P21's existing
 * PROPOSAL schema. A parsed proposal is NOT accepted source mapping, current
 * app/field authority, publication qualification or permission to persist it.
 * The optional server-injected owning adapter uses this builder. Installing a
 * producer mapping is separate authority: this factory alone remains DARK.
 */
import { economicSourceReductionInput, MANAGER_ECONOMIC_SOURCE_STATUS,
  type EconomicSourceReductionInput } from "./manager-economic-source.contract";
import { reduceEconomicSource } from "./manager-economic-source-reducer";

const selectionSchema = economicSourceReductionInput.omit({ schema_version: true, rows: true });
type Selection = ReturnType<typeof selectionSchema.parse>;
const schemaVersion = "portal.execution.manager-economic-source-reduction-input.proposal.v1" as const;
const refusal = (path: readonly PropertyKey[]) => ({ state: "REFUSED" as const,
  status: MANAGER_ECONOMIC_SOURCE_STATUS, reason_code: "ECONOMIC_SOURCE_INPUT_INVALID" as const,
  issue_path: path.map(String).join(".").slice(0, 512) });

export type ManagerEconomicSourceBuild =
  | { state: "BUILT_PROPOSAL"; status: typeof MANAGER_ECONOMIC_SOURCE_STATUS; input: EconomicSourceReductionInput }
  | ReturnType<typeof refusal>;

/** Zod produces a detached value; freeze only that clone, never caller state. */
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function build(selection: Selection, rows: unknown): ManagerEconomicSourceBuild {
  const parsed = economicSourceReductionInput.safeParse({ schema_version: schemaVersion, ...selection, rows });
  if (!parsed.success) return refusal(parsed.error.issues[0]?.path ?? []);
  return Object.freeze({ state: "BUILT_PROPOSAL", status: MANAGER_ECONOMIC_SOURCE_STATUS, input: freeze(parsed.data) });
}

/** One strict builder: no inferred namespace, census, ownership, cost, cut,
 * policy, default zero, or conversion of a legacy row into a proven one. */
export function buildManagerEconomicSourceInput(selection: unknown, rows: unknown): ManagerEconomicSourceBuild {
  const parsed = selectionSchema.safeParse(selection);
  return parsed.success ? build(parsed.data, rows) : refusal(parsed.error.issues[0]?.path ?? []);
}

/** Capture ONE explicit cut/population/field-semantic selection for both
 * consumers. Historical callers create a separate factory per cut; a factory
 * never sums independent cuts. Both paths share the actual builder and reducer,
 * not copied arithmetic. No accepted-producer status can be requested here. */
export function prepareManagerEconomicSourceFactory(selection: unknown) {
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success) return refusal(parsed.error.issues[0]?.path ?? []);
  const captured = freeze(parsed.data);
  const reduce = (rows: unknown) => {
    const result = build(captured, rows);
    // Existing total reducer supplies the same typed refusal/no-number shape
    // for malformed input; no new public availability or reason vocabulary.
    return reduceEconomicSource(result.state === "BUILT_PROPOSAL" ? result.input : null);
  };
  return Object.freeze({ state: "PREPARED_PROPOSAL" as const, status: MANAGER_ECONOMIC_SOURCE_STATUS,
    dataset: reduce, series: reduce });
}
