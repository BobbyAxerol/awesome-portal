import { createHash } from "node:crypto";
import type { ResourceSelector } from "./access.contract";

/** Mechanically shared existing canonical encoding; no new digest semantics. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => [key,canonical(item)]));
  return value;
}
export const accessDigest = (value: unknown): string => `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
export function canonicalSelector(selector: ResourceSelector): ResourceSelector {
  if (selector.kind === "EXPLICIT_RESOURCE_SET") return { ...selector, ids: [...selector.ids].sort() };
  if (selector.kind === "PORTFOLIO_MEMBERSHIP") return { ...selector, portfolio_ids: [...selector.portfolio_ids].sort() };
  return selector;
}
