import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { AccessPolicyError, accessResource, accessText, tsMembershipAcceptance,
  type TsMembershipAcceptance } from "./access.contract";
import { accessDigest, type AccessRelations } from "./access-policy";
import type { AccessReceipt } from "./access.repository";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import type { CurrentHumanMutations } from "./current-human-mutations";
import { currentAccessRelations } from "./access-current-relations";

/** Private adapter contract, not an existing TS wire or browser authority. */
export interface DelegatedReceiptScope {
  workspace_id: string;
  subject_user_id: string;
  principal_ids: readonly string[];
}
export interface DelegatedReceiptSource {
  fact: TsMembershipAcceptance;
  mapping: null | { ts_user_id: string; revision: string };
  relations: readonly { principal_id: string; relations: AccessRelations }[];
}
export interface QualifiedDelegatedMembershipReceipt extends DelegatedReceiptSource {
  /** The provider holds a real source revocation fence until release, through
   * Core's physical COMMIT/ROLLBACK, not just a TTL or last timestamp check. */
  assertCurrent(): void;
  /** Bounded provider lifetime; never source I/O while Core locks are held. */
  release(): Promise<void>;
}
type Result = { receipt: AccessReceipt; replayed: boolean };
const revision = tsMembershipAcceptance.shape.mapping_revision;
const distinctIds = z.array(accessText).refine(items => new Set(items).size === items.length, "DUPLICATE_SOURCE_RESOURCE");
const sourceRelations = z.object({ qualified: z.boolean(), revision: z.string().min(1),
  own_alpha_ids: distinctIds, member_portfolio_ids: distinctIds,
  roots: z.record(z.array(accessResource).refine(items =>
    new Set(items.map(item => JSON.stringify([item.kind, item.id]))).size === items.length, "DUPLICATE_SOURCE_RESOURCE")),
  membership: z.object({ revision, receipt_id: accessText, mapping_revision: revision }).strict().nullable(),
  current_authority: currentAccessRelations.nullable().optional(),
}).strict();
const sourceSchema = z.object({ fact: tsMembershipAcceptance,
  mapping: z.object({ ts_user_id: accessText, revision }).strict().nullable(),
  relations: z.array(z.object({ principal_id: accessText, relations: sourceRelations }).strict()),
}).strict();
const mismatch = () => new AccessPolicyError("RECEIPT_BINDING_MISMATCH", 409);
const notQualified = () => new AccessPolicyError("RECEIPT_NOT_QUALIFIED", 503);

/** Detach and canonicalize only declared relation SETS, never source fact bytes,
 * opaque revisions or incomplete populations. No silent truncation/defaults. */
export function detachDelegatedReceiptSource(value: DelegatedReceiptSource,
  scope: DelegatedReceiptScope): DelegatedReceiptSource {
  const parsed = sourceSchema.safeParse(value);
  if (!parsed.success) throw mismatch();
  const source = parsed.data;
  const expected = [...scope.principal_ids].sort(), actual = source.relations.map(item => item.principal_id).sort();
  if (source.fact.workspace_id !== scope.workspace_id || source.fact.portal_user_id !== scope.subject_user_id ||
    new Set(actual).size !== actual.length || accessDigest(expected) !== accessDigest(actual)) throw mismatch();
  source.relations.sort((a, b) => a.principal_id < b.principal_id ? -1 : a.principal_id > b.principal_id ? 1 : 0);
  for (const entry of source.relations) {
    entry.relations.own_alpha_ids.sort(); entry.relations.member_portfolio_ids.sort();
    for (const resources of Object.values(entry.relations.roots)) resources.sort((a, b) => {
      const left = JSON.stringify([a.kind, a.id]), right = JSON.stringify([b.kind, b.id]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return source;
}
function guardNow(guard: () => void): void {
  let result: unknown;
  try { result = guard(); } catch { throw notQualified(); }
  if (result && (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function") {
    void Promise.resolve(result).catch(() => undefined);
    throw notQualified();
  }
}

/** The service authenticates the initial fact and checks immutable history
 * before calling this port. Pre-drain authorization retains all existing Core
 * and detached source checks. Only fresh held proof can authorize final writes. */
export async function coordinateDelegatedMembershipReceipt(pool: Pool,
  coordinator: CurrentHumanMutations,
  qualify: ((input: unknown, scope: DelegatedReceiptScope) => Promise<QualifiedDelegatedMembershipReceipt | null>) | undefined,
  input: unknown, scope: DelegatedReceiptScope, initial: DelegatedReceiptSource,
  process: (db: PoolClient, write: boolean, source: DelegatedReceiptSource, guard?: () => void) => Promise<Result | null>): Promise<Result> {
  if (!coordinator.usesPool(pool) || !qualify) throw notQualified();
  const detached = detachDelegatedReceiptSource(initial, scope), proofDigest = accessDigest(detached);
  let current: DelegatedReceiptSource | null = null, guard: (() => void) | undefined;
  try {
    return await coordinator.executeVerified({ family: "QUALIFIED_DELEGATED_RECEIPT", operation: "ACCEPT_RECEIPT",
      key_digest: accessDigest(["DELEGATED_RECEIPT", detached.fact.source, detached.fact.receipt_id]),
      request_digest: accessDigest(detached.fact), target_id: scope.workspace_id }, {
      retain_after_application_rollback: true,
      authorize: async db => { await process(db, false, detached); },
      acquire_fence: async () => {
        let lease: QualifiedDelegatedMembershipReceipt | null;
        try { lease = await qualify(input, structuredClone(scope)); } catch { throw notQualified(); }
        if (!lease || typeof lease.release !== "function") throw notQualified();
        const held = lease;
        try {
          if (typeof held.assertCurrent !== "function") throw notQualified();
          const fresh = detachDelegatedReceiptSource({ fact: held.fact, mapping: held.mapping, relations: held.relations }, scope);
          if (accessDigest(fresh) !== proofDigest) throw mismatch();
          const check = held.assertCurrent.bind(held);
          guardNow(check); current = fresh; guard = () => guardNow(check);
          return { assertCurrent: guard, release: async () => {
            try { await held.release(); } catch { throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 503); }
          } };
        } catch (error) {
          try { await held.release(); } catch { throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 503); }
          throw error;
        }
      },
      apply: async db => {
        if (!current || !guard) throw notQualified();
        const result = await process(db, true, current, guard);
        if (!result) throw notQualified();
        return result;
      },
      terminal: result => ({ outcome: "APPLIED", receipt_ref: result.receipt.operation_id, reason_code: null }),
    });
  } catch (error) {
    if (error instanceof CurrentHumanLeaseError) {
      if (error.code === "CURRENT_HUMAN_MUTATION_KEY_CONFLICT") throw new AccessPolicyError("RECEIPT_PAYLOAD_CONFLICT", 409);
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 503);
    }
    throw error;
  }
}
