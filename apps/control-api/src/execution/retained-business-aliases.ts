import { createHmac } from "node:crypto";
import type { ProjectionScalar } from "./profile-projection.repository";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";

/** A narrow publication subset, not a field grant. Actual values still require
 * the current scope's reviewed fields. No global business vocabulary changes. */
const fields = Object.freeze({
  account_sync_current_state: Object.freeze(["account_id", "currency", "mode", "status", "updated_at"]),
  account_sync_effective: Object.freeze(["account_id", "currency", "mode", "status", "created_at"]),
  account_sync_snapshots: Object.freeze(["account_id", "currency", "mode", "status", "created_at"]),
  reconciliation_findings: Object.freeze(["account_id", "strategy_id", "mode", "status", "created_at"]),
  conditional_order_group_legs: Object.freeze([
    "group_id", "leg_id", "sequence", "side", "quantity", "price", "state", "created_at", "updated_at",
  ]),
  order_bracket_legs: Object.freeze([
    "leg_id", "side", "quantity", "price", "status", "created_at", "updated_at", "submitted_at",
  ]),
} satisfies Record<string, readonly string[]>);

export function namedRetainedBusinessFields(relation: string): readonly string[] | null {
  return Object.hasOwn(fields, relation) ? fields[relation as keyof typeof fields] : null;
}

/** Call only after private identity validation and current row authorization.
 * Reuse the active server query-signing key with a distinct domain. These are
 * context/key-bound observation IDs, not stable source IDs or field grants. */
export function namedRetainedBusinessResourceId(key: string, workspaceId: string,
  environment: "paper" | "sandbox" | "live", profileId: string,
  operationId: string, validatedIdentity: readonly string[]): string {
  return `por1_${createHmac("sha256", key).update(JSON.stringify([
    "portal.execution.named-retained-row.v1", workspaceId, environment,
    profileId, operationId, validatedIdentity,
  ])).digest("hex")}`;
}

/** Only the actual checked-in collector alias or the exact generated named
 * alias can supply these records. Matching a bare relation name is not proof. */
export function namedRetainedBusinessSourceAllowed(relation: string, source: string): boolean {
  switch (relation) {
    case "account_sync_current_state": return source === "manager.current.account-sync-current-state";
    case "account_sync_effective": return source === "manager.accounts" || source === "manager.current.account-sync-effective";
    case "account_sync_snapshots": return source === "manager.current.account-sync-snapshots";
    case "reconciliation_findings": return source === "manager.reconciliation" || source === "manager.current.reconciliation-findings";
    case "execution_sessions": return source === "manager.sessions" || source === "manager.current.execution-sessions";
    case "conditional_order_group_legs": return source === "manager.conditional-orders" || source === "manager.current.conditional-order-group-legs";
    case "conditional_order_groups": return source === "manager.conditional-orders" || source === "manager.current.conditional-order-groups";
    // No legacy bracket collector alias exists in the checked-in adapter.
    case "order_bracket_legs": return source === "manager.current.order-bracket-legs";
    case "order_brackets": return source === "manager.current.order-brackets";
    default: return false;
  }
}

/** Do not downgrade session/strategy-bound rows to account-only visibility.
 * The narrow finding session adapter must recover strategy before this check;
 * missing accounts and partially authorized shared accounts stay unsupported. */
export function namedRetainedBusinessAnchored(relation: string, row: Record<string, ProjectionScalar>): boolean {
  const account = Object.getOwnPropertyDescriptor(row, "account_id");
  if (!account || !("value" in account) || typeof account.value !== "string" || !account.value) return false;
  if (relation === "account_sync_current_state" || relation === "account_sync_effective" ||
    relation === "account_sync_snapshots" || relation === "order_bracket_legs") return true;
  const strategy = Object.getOwnPropertyDescriptor(row, "strategy_id");
  return Boolean(strategy && "value" in strategy && typeof strategy.value === "string" && strategy.value);
}

const inherited = ["alpha_id", "alpha_version_id", "strategy_id", "deployment_id", "portfolio_id", "account_id"] as const;
type ParentRow = { fields: Record<string, ProjectionScalar> };

const boundedText = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && Buffer.byteLength(value) <= 4_096 && !/[\u0000-\u001f\u007f]/u.test(value);

/** Caller must first establish child account-grain visibility. A direct row
 * never acquires an unrelated session scope, even if it carries a session ID.
 * Do not inspect/validate the private session identity before that predicate. */
export function namedRetainedFindingNeedsSession(row: Record<string, ProjectionScalar>): boolean {
  const account = Object.getOwnPropertyDescriptor(row, "account_id");
  const strategy = Object.getOwnPropertyDescriptor(row, "strategy_id");
  return Boolean(account && "value" in account && boundedText(account.value) &&
    (!strategy || "value" in strategy && (strategy.value === null || strategy.value === undefined)));
}

/** Exact private foreign-key join, never an authorization decision. Only
 * already child-visible candidates are supplied. Full parent census builds
 * the ambiguity map BEFORE visibility: a hidden duplicate cannot be selected
 * away. Missing/ambiguous/contradictory parent rows uniformly produce no link.
 * Caller checks BOTH original parent and merged row under current scopes. */
export function joinRetainedFindingSessionRows<T extends ParentRow>(
  children: readonly T[], parents: readonly ParentRow[],
): { row: T; parent: ParentRow }[] {
  if (children.length > 2_000 || parents.length > 2_000)
    throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  const sessions = new Map<string, ParentRow | null>();
  for (const parent of parents) {
    const properties = Object.getOwnPropertyDescriptors(parent.fields);
    const identity = properties.execution_session_id;
    if (!identity || !("value" in identity) || !boundedText(identity.value)) continue;
    const account = properties.account_id, strategy = properties.strategy_id;
    const valid = Object.values(properties).every(property => "value" in property) &&
      account && "value" in account && boundedText(account.value) &&
      strategy && "value" in strategy && boundedText(strategy.value);
    sessions.set(identity.value, sessions.has(identity.value) || !valid ? null : parent);
  }
  return children.flatMap(child => {
    const properties = Object.getOwnPropertyDescriptors(child.fields);
    const identity = properties.execution_session_id;
    if (Object.values(properties).some(property => !("value" in property)) ||
      !identity || !("value" in identity) || !boundedText(identity.value))
      throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
    const parent = sessions.get(identity.value);
    if (!parent) return [];
    // Explicit child economic context and mode cannot be rewritten by a
    // session ID. Only the missing strategy is inherited, not other anchors.
    for (const key of [...inherited, "mode"] as const) {
      const own = properties[key]?.value, value = parent.fields[key];
      if (own !== null && own !== undefined && value !== null && value !== undefined && own !== value) return [];
    }
    if (properties.account_id?.value !== parent.fields.account_id) return [];
    const row = { ...child, fields: { ...child.fields, strategy_id: parent.fields.strategy_id } };
    return [{ row, parent }];
  });
}

/** Exact bracket FK join, not a permission resolver. A bracket may have no
 * strategy: its original account-grain row must independently pass the parent
 * scope's all-correlated-tuples rule BEFORE the merged child is considered.
 * No execution-session lookup or inference is performed. Full same-snapshot
 * parent census is required by the caller; duplicates poison the key even if
 * one parent is hidden/malformed. Unknown/unprovable links uniformly omit.
 */
export function joinRetainedBracketLegRows<T extends ParentRow>(
  children: readonly T[], parents: readonly ParentRow[], environment: "paper" | "sandbox" | "live",
): { row: T; parent: ParentRow; inherited_fields: readonly string[] }[] {
  if (children.length > 2_000 || parents.length > 2_000)
    throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  const groups = new Map<string, ParentRow | null>();
  const contextFields = [...inherited, "mode", "execution_session_id"] as const;
  for (const parent of parents) {
    const properties = Object.getOwnPropertyDescriptors(parent.fields);
    const id = properties.bracket_group_id;
    if (!id || !("value" in id) || !boundedText(id.value)) continue;
    const account = properties.account_id;
    const valid = Object.values(properties).every(property => "value" in property) &&
      account && "value" in account && boundedText(account.value) &&
      contextFields.every(key => {
        const property = properties[key];
        return !property || "value" in property &&
          (property.value === null || property.value === undefined || boundedText(property.value));
      }) &&
      (properties.mode?.value === null || properties.mode?.value === undefined || properties.mode.value === environment);
    groups.set(id.value, groups.has(id.value) || !valid ? null : parent);
  }
  return children.flatMap(child => {
    const properties = Object.getOwnPropertyDescriptors(child.fields);
    const id = properties.bracket_group_id;
    if (Object.values(properties).some(property => !("value" in property)) ||
      !id || !("value" in id) || !boundedText(id.value)) return [];
    const parent = groups.get(id.value);
    if (!parent) return [];
    const inheritedFields: string[] = [];
    const anchors: Record<string, ProjectionScalar> = {};
    for (const key of contextFields) {
      const own = properties[key]?.value, value = parent.fields[key];
      if (own !== null && own !== undefined && !boundedText(own)) return [];
      if (own !== null && own !== undefined && value !== null && value !== undefined && own !== value) return [];
      if (value !== null && value !== undefined && (own === null || own === undefined)) {
        anchors[key] = value;
        inheritedFields.push(key);
      }
    }
    if (properties.mode?.value !== null && properties.mode?.value !== undefined &&
      properties.mode.value !== environment) return [];
    // Explicit child values are never overwritten. Null/missing values have
    // no lineage of their own; the independently authorized parent supplies it.
    return [{ row: { ...child, fields: { ...child.fields, ...anchors } }, parent, inherited_fields: inheritedFields }];
  });
}

/** Exact conditional-group join shared with the pre-existing derivation.
 * Caller supplies both relations from ONE immutable snapshot and authorizes
 * the merged row under BOTH current dataset scopes before public redaction.
 * Duplicate group IDs are ambiguous even when a later policy could hide one.
 * A child cannot replace its parent's explicit economic anchor. */
export function joinRetainedConditionalLegRows<T extends ParentRow>(
  children: readonly T[], parents: readonly ParentRow[],
): T[] {
  if (children.length > 2_000 || parents.length > 2_000)
    throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  const groups = new Map<string, ParentRow | null>();
  for (const parent of parents) {
    const descriptors = Object.getOwnPropertyDescriptors(parent.fields);
    if (Object.values(descriptors).some(property => !("value" in property))) continue;
    const id: unknown = descriptors.group_id?.value;
    if (typeof id !== "string" || !id || id.length > 4_096) continue;
    groups.set(id, groups.has(id) ? null : parent);
  }
  return children.flatMap(child => {
    const childProperties = Object.getOwnPropertyDescriptors(child.fields);
    if (Object.values(childProperties).some(property => !("value" in property))) return [];
    const id: unknown = childProperties.group_id?.value;
    if (typeof id !== "string") return [];
    const parent = groups.get(id);
    if (!parent) return [];
    const anchors: Record<string, ProjectionScalar> = {};
    for (const key of inherited) {
      const value = parent.fields[key];
      if (value === undefined || value === null) continue;
      const own = childProperties[key];
      if (own && own.value !== undefined && own.value !== value) return [];
      anchors[key] = value;
    }
    return [{ ...child, fields: { ...anchors, ...child.fields } }];
  });
}
