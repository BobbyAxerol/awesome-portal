import {
  assertExecutionReadScope,
  ExecutionReadScopeError,
  scopeAllowsField,
  scopeReadPopulation,
  type AuthorizedExecutionReadScope,
} from "./read-scope";

/** Existing retained JSON rows do not all carry the full economic tuple. A
 * partial row is readable only if every possible source tuple at that grain is
 * allowed. In particular, an account/portfolio shared with a hidden Alpha must
 * not become a totals oracle. This is filtering BEFORE aggregation, not hiding
 * already-computed totals. Source-qualified publication completeness is required.
 */
const anchors = [
  ["alpha_id", "alpha_id"],
  ["alpha_version_id", "alpha_version_id"],
  ["portfolio_id", "portfolio_id"],
  ["deployment_id", "deployment_id"],
  ["account_id", "account_id"],
] as const;
type Tuple = ReturnType<typeof scopeReadPopulation>["populationTuples"][number];
const tupleKey = (tuple: Tuple) => JSON.stringify([
  tuple.alpha_id, tuple.alpha_version_id, tuple.portfolio_id, tuple.deployment_id, tuple.account_id,
]);
type Population = { all: boolean; tuples: readonly (Tuple & { allowed: boolean })[];
  strategies: ReadonlyMap<string, string>; json: string };
const populations = new WeakMap<object, Population>();

function population(scope: AuthorizedExecutionReadScope): Population {
  assertExecutionReadScope(scope);
  const cached = populations.get(scope);
  if (cached) return cached;
  if (scope.mode === "LEGACY_COMPATIBILITY") {
    const result = { all: true, tuples: [], strategies: new Map<string, string>(), json: "{}" };
    populations.set(scope, result);
    return result;
  }
  const state = scopeReadPopulation(scope);
  if (!state.binding) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  const allowed = new Set(state.allowedTuples.map(tupleKey));
  const known = new Set(state.populationTuples.map(tupleKey));
  if ([...allowed].some(key => !known.has(key)))
    throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  const tuples = state.populationTuples.map(tuple => ({ ...tuple, allowed: allowed.has(tupleKey(tuple)) }));
  const strategies = new Map<string, string>();
  for (const pair of state.strategyPairs) {
    // The publication parser rejects duplicates/ambiguity. Preserve fail-closed
    // behavior here too, rather than accepting a last-write-wins association.
    if (strategies.has(pair.strategy_id))
      throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
    strategies.set(pair.strategy_id, pair.alpha_id);
  }
  // Even a whole-business reader is bound to the qualified publication. The
  // backing table can later acquire unknown/orphan rows or unanchored totals;
  // authority over every known tuple is not authority over those new rows.
  // Purpose narrowing likewise remains represented by the allowed flags.
  const result = { all: false, tuples, strategies,
    json: JSON.stringify({ tuples, strategy_pairs: [...strategies].map(([strategy_id, alpha_id]) => ({ strategy_id, alpha_id })) }) };
  populations.set(scope, result);
  return result;
}

/** parameterOffset is the ONE-BASED next PostgreSQL bind position. Exactly one
 * JSONB parameter is appended for nonempty V2 populations; legacy/empty reads
 * append none. fieldColumn accepts only fields or one trusted alias.fields.
 * Keys are closed JSON property names, never SQL identifiers from a request.
 */
export function projectionScopeSql(scope: AuthorizedExecutionReadScope, fieldColumn: string,
  parameterOffset: number): { sql: string; values: unknown[] } {
  assertExecutionReadScope(scope);
  const column = /^(?:([A-Za-z_][A-Za-z0-9_]{0,62})\.)?fields$/.exec(fieldColumn);
  if (!column || !Number.isSafeInteger(parameterOffset) || parameterOffset < 1 || parameterOffset > 65_535)
    throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
  const facts = population(scope);
  if (facts.all) return { sql: "TRUE", values: [] };
  if (!facts.tuples.some(tuple => tuple.allowed)) return { sql: "FALSE", values: [] };
  const field = column[1] ? `"${column[1]}"."fields"` : '"fields"';
  // Avoid shadowing a legitimate outer alias with the internal recordset alias.
  const alias = column[1] === "__elp2_scope_tuple" ? "__elp2_scope_tuple_2" : "__elp2_scope_tuple";
  const record = `"${alias}"`;
  const strategyAlias = column[1] === "__elp2_scope_strategy" ? "__elp2_scope_strategy_2" : "__elp2_scope_strategy";
  const strategy = `"${strategyAlias}"`;
  const keys = [...anchors.map(([key]) => key), "strategy_id"];
  const present = keys.map(key => `${field}->>'${key}' IS NOT NULL`).join(" OR ");
  const valid = keys.map(key => `(${field}->>'${key}' IS NULL OR jsonb_typeof(${field}->'${key}')='string')`).join(" AND ");
  const matches = anchors.map(([key, target]) => `(${field}->>'${key}' IS NULL OR ${field}->>'${key}'=${record}."${target}")`).join(" AND ");
  const strategyMatches = `(${field}->>'strategy_id' IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(($${parameterOffset}::jsonb)->'strategy_pairs') AS ${strategy}(strategy_id text, alpha_id text)
    WHERE ${strategy}.strategy_id=${field}->>'strategy_id' AND ${strategy}.alpha_id=${record}.alpha_id
  ))`;
  return {
    sql: `COALESCE((jsonb_typeof(${field})='object' AND (${present}) AND ${valid} AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(($${parameterOffset}::jsonb)->'tuples') AS ${record}(
        alpha_id text, alpha_version_id text, portfolio_id text, deployment_id text, account_id text, allowed boolean)
      WHERE ${matches} AND ${strategyMatches}
      HAVING bool_or(${record}.allowed) AND bool_and(${record}.allowed)
    )),FALSE)`,
    values: [facts.json],
  };
}

/** Equivalent JSON-grain predicate for trusted in-process compositions. It is
 * not a replacement for revalidate/deliver and must precede totals/analytics. */
export function projectionRowVisible(scope: AuthorizedExecutionReadScope, row: unknown): boolean {
  const facts = population(scope);
  if (facts.all) return true;
  if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
  const present: [typeof anchors[number][1], string][] = [];
  for (const [key, target] of anchors) {
    const property = Object.getOwnPropertyDescriptor(row, key);
    if (!property) continue;
    if (!("value" in property)) return false;
    const value: unknown = property.value;
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return false;
    present.push([target, value]);
  }
  // strategy_id is a distinct namespace. Only qualified exact lineage can
  // resolve it; equality with an Alpha ID never supplies an implicit mapping.
  const strategyProperty = Object.getOwnPropertyDescriptor(row, "strategy_id");
  if (strategyProperty) {
    if (!("value" in strategyProperty)) return false;
    const strategy: unknown = strategyProperty.value;
    if (strategy !== undefined && strategy !== null) {
      if (typeof strategy !== "string") return false;
      const alpha = facts.strategies.get(strategy);
      if (alpha === undefined) return false;
      present.push(["alpha_id", alpha]);
    }
  }
  if (!present.length) return false;
  let matched = false;
  for (const tuple of facts.tuples) {
    if (!present.every(([key, value]) => tuple[key] === value)) continue;
    if (!tuple.allowed) return false;
    matched = true;
  }
  return matched;
}

/** Closed scalar DTO fields only. Nested objects/arrays require a purpose-built
 * authorized adapter and are never recursively exposed by a generic whitelist.
 * Decimal strings and null remain exact; non-finite/unsupported values vanish.
 */
export function redactProjectionFields(scope: AuthorizedExecutionReadScope, row: unknown): Record<string, string | number | boolean | null> {
  assertExecutionReadScope(scope);
  const result: Record<string, string | number | boolean | null> = {};
  if (row === null || typeof row !== "object" || Array.isArray(row)) return result;
  for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(row))) {
    if (!scopeAllowsField(scope, key) || !("value" in property)) continue;
    const value: unknown = property.value;
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))
      result[key] = value;
  }
  return result;
}
