import { z } from "zod";
import type { ManagerLeaseScope } from "./manager-lease";
import type { ManagerConsumerBounds } from "./manager-consumer";

const scope = z.object({ workspace_id: z.string().min(1).max(256), environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: z.string().min(1).max(256) }).strict();
const budget = z.object({
  maximum_documents_per_tick: z.number().int().min(1).max(4 * 32),
  maximum_document_bytes_per_tick: z.number().int().min(1).max(4 * 32 * 8 * 1024 * 1024),
  maximum_document_rows_per_tick: z.number().int().min(1).max(4 * 32 * 30_000),
  maximum_tick_ms: z.number().int().min(1).max(4 * 300_000),
  maximum_calculation_tasks_per_tick: z.number().int().min(0).max(4 * 32 * 128),
}).strict();
const registry = z.object({ schema_version: z.literal("portal.manager-profile-registry.v1"),
  partitions: z.array(scope).min(1).max(4), aggregate_budget: budget }).strict();

/** Independently reviewed private installation input, never browser authority.
 * Budgets bound aggregate serial work, not a memory reservation or permission to
 * install a source. Each partition still requires its own commissioning. */
export type ManagerProfileRegistry = Readonly<z.infer<typeof registry>>;
export interface ManagerProfileBudgetPartition {
  scope: ManagerLeaseScope;
  bounds: ManagerConsumerBounds;
  score?: { maximum_tasks_per_revision: number; recalculation?: unknown; restatement?: unknown };
  composition?: { maximum_tasks_per_revision: number };
  regime?: { maximum_tasks_per_revision: number; historical?: unknown };
}
const key = (value: ManagerLeaseScope) => JSON.stringify([value.workspace_id, value.environment, value.profile_id]);
const invalid = (): never => { throw new Error("MANAGER_RUNTIME_PROFILE_REGISTRY_INVALID"); };

/** No registry preserves the historical <=3-partition installation. Expanding
 * to four requires an exact tuple inventory AND an explicit aggregate budget;
 * changing a numeric cap alone cannot activate an additional partition. */
export function validateManagerProfileRegistry(partitions: readonly ManagerProfileBudgetPartition[], input?: ManagerProfileRegistry): void {
  if (partitions.length < 1 || partitions.length > 4) invalid();
  const keys = partitions.map(value => key(scope.parse(value.scope)));
  if (new Set(keys).size !== keys.length) invalid();
  if (!input) { if (partitions.length > 3) invalid(); return; }
  const parsed = registry.safeParse(input);
  const approvedRegistry = parsed.success ? parsed.data : invalid();
  const approved = approvedRegistry.partitions.map(key);
  if (new Set(approved).size !== approved.length || approved.length !== keys.length || keys.some(value => !approved.includes(value))) invalid();
  // This first-pass aggregate budget covers initial per-document tasks only.
  // Retained/IDLE historical work needs separate aggregate accounting before
  // it can join a registry-backed installation. Legacy <=3 above is unchanged.
  if (partitions.some(partition => partition.score?.recalculation !== undefined || partition.score?.restatement !== undefined ||
      partition.regime?.historical !== undefined)) invalid();
  const totals = { maximum_documents_per_tick: 0, maximum_document_bytes_per_tick: 0,
    maximum_document_rows_per_tick: 0, maximum_tick_ms: 0, maximum_calculation_tasks_per_tick: 0 };
  for (const partition of partitions) {
    const bounds = partition.bounds;
    const tasks = [partition.score, partition.composition, partition.regime].reduce((sum, value) => sum + (value?.maximum_tasks_per_revision ?? 0), 0);
    const contributions = { maximum_documents_per_tick: bounds.maximum_documents_per_tick,
      maximum_document_bytes_per_tick: bounds.maximum_documents_per_tick * bounds.maximum_document_bytes,
      maximum_document_rows_per_tick: bounds.maximum_documents_per_tick * bounds.maximum_document_rows,
      maximum_tick_ms: bounds.maximum_tick_ms,
      maximum_calculation_tasks_per_tick: bounds.maximum_documents_per_tick * tasks };
    for (const name of Object.keys(totals) as Array<keyof typeof totals>) {
      if (!Number.isSafeInteger(contributions[name]) || contributions[name] < 0) invalid();
      totals[name] += contributions[name];
      if (!Number.isSafeInteger(totals[name]) || totals[name] > approvedRegistry.aggregate_budget[name]) invalid();
    }
  }
}

/** Omission always means the pinned deployment default, not registry order.
 * Explicit non-default choices must be installed in this exact workspace/env.
 * Selecting a profile is not a grant: readers still authorize it independently. */
export function resolveManagerProfile(input: { defaultProfileId?: string; requestedProfileId?: string;
  installedProfileIds?: readonly string[] }): string {
  const selected = input.requestedProfileId ?? input.defaultProfileId;
  if (!selected) throw new Error("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  if (input.requestedProfileId !== undefined && selected !== input.defaultProfileId && !input.installedProfileIds?.includes(selected))
    throw new Error("EXECUTION_READ_NOT_AVAILABLE");
  return selected;
}
