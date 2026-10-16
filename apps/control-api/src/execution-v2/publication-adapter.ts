import type { AccessTrustProvider } from "./access-trust";
import { datasetPublication, DatasetPublication, PublicationPurpose } from "./publication.contract";
import { accessDigest } from "./access-policy";
import type { ExecutionReadPublicationRequest } from "./read-publication";
import { EXECUTION_PUBLICATION_CATALOGUE } from "./publication-source.generated";

export class ExecutionPublicationError extends Error {
  constructor(readonly code: "PUBLICATION_CONTRACT_REJECTED" | "PUBLICATION_NOT_QUALIFIED" |
    "PUBLICATION_REVOKED" | "PUBLICATION_DRAINING" | "PUBLICATION_EXPIRED" |
    "PUBLICATION_SCOPE_MISMATCH" | "PUBLICATION_CONTINUITY_UNPROVED", readonly status = 503) {
    super("The requested source publication is not available.");
  }
}
const reject = (code: ExecutionPublicationError["code"], status = 503): never => { throw new ExecutionPublicationError(code, status); };
export interface PublicationContinuity {
  source_continuity_epoch: string; projection_generation: string; partition_id: string; snapshot_id: string;
}
interface PublicationOptions {
  purpose: PublicationPurpose; allowTestOnly?: boolean; expectedContinuity?: PublicationContinuity;
}

/** No publication state is cached: revoke/drain and receipt expiry are checked
 * on every scope mint and final delivery fence by ExecutionReadScopes. Source
 * proof verification is the qualified private adapter's responsibility; a
 * string receipt or this parser is not itself mTLS/signature verification. */
export function qualifyDatasetPublication(input: unknown, request: ExecutionReadPublicationRequest,
  options: PublicationOptions & { nowMs: number }): DatasetPublication {
  const parsed = datasetPublication.safeParse(input);
  if (!parsed.success || !Number.isSafeInteger(options.nowMs) || options.nowMs < 0)
    return reject("PUBLICATION_CONTRACT_REJECTED");
  const p = parsed.data;
  if (p.state === "REVOKED") return reject("PUBLICATION_REVOKED", 409);
  if (p.state === "DRAINING") return reject("PUBLICATION_DRAINING", 409);
  if (p.issued_at_ms > options.nowMs || p.expires_at_ms <= options.nowMs || p.expires_at_ms <= p.issued_at_ms)
    return reject("PUBLICATION_EXPIRED");
  if (p.observed_at_ms > options.nowMs || p.source_as_of_ms !== null && p.source_as_of_ms > p.observed_at_ms)
    return reject("PUBLICATION_CONTRACT_REJECTED");
  if (p.catalogue_digest !== EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest ||
      !EXECUTION_PUBLICATION_CATALOGUE.families.some(f => f.family_id === p.family_id))
    return reject("PUBLICATION_NOT_QUALIFIED");
  if (p.authority.binding.dataset_id !== p.family_id ||
      p.purpose !== options.purpose || p.environment !== request.environment || p.profile_id !== request.profile_id ||
      p.authority.environment !== request.environment || p.authority.profile_id !== request.profile_id ||
      p.authority.workspace_id !== request.workspace_id || accessDigest(p.authority.binding) !== accessDigest(request.binding))
    return reject("PUBLICATION_SCOPE_MISMATCH", 409);
  const qualifications = [p.source_read, p.transport_trust, p.privacy, p.field_policy, p.authority];
  if (qualifications.some(f => f.qualification !== "SOURCE_VERIFIED" && !(options.allowTestOnly === true && f.qualification === "TEST_ONLY")))
    return reject("PUBLICATION_NOT_QUALIFIED");
  // The pinned new Edge catalogue has no commissioned exports. TEST_ONLY is
  // intentionally available only to an explicitly isolated server test adapter.
  if (p.authority.qualification === "SOURCE_VERIFIED") return reject("PUBLICATION_NOT_QUALIFIED");
  if (p.history_capability === "SNAPSHOT_TAIL") {
    const b = p.barrier, expected = options.expectedContinuity;
    if (!b || BigInt(b.first_tail_sequence) !== BigInt(b.snapshot_sequence) + 1n ||
        BigInt(b.retention_floor_sequence) > BigInt(b.first_tail_sequence) ||
        p.authority.binding.projection_generation !== b.projection_generation || !expected ||
        b.source_continuity_epoch !== expected.source_continuity_epoch || b.projection_generation !== expected.projection_generation ||
        b.partition_id !== expected.partition_id || b.snapshot_id !== expected.snapshot_id)
      return reject("PUBLICATION_CONTINUITY_UNPROVED");
  } else if (p.barrier !== null) return reject("PUBLICATION_CONTINUITY_UNPROVED");
  // Current pages and observed history never acquire an event/replay purpose.
  if (p.purpose === "STREAM" && p.history_capability !== "SNAPSHOT_TAIL")
    return reject("PUBLICATION_CONTINUITY_UNPROVED");
  return structuredClone(p);
}

/** Composes with, never replaces, Portal/TS identity and current field policy.
 * No routes/client/credentials are created here; default production trust is
 * unchanged. Missing source is null, not a guessed relation or successful empty. */
export function withCataloguePublications(base: AccessTrustProvider,
  source: (request: ExecutionReadPublicationRequest) => Promise<unknown | null>,
  options: PublicationOptions & { now?: () => number }): AccessTrustProvider {
  const policy = {purpose:options.purpose,allowTestOnly:options.allowTestOnly === true,
    expectedContinuity:options.expectedContinuity && structuredClone(options.expectedContinuity)};
  const now = options.now ?? Date.now;
  return {
    verifyPolicy: input => base.verifyPolicy(input), verifyReceipt: input => base.verifyReceipt(input),
    relations: (user, workspace) => base.relations(user, workspace),
    verifiedHumanMapping: (user, workspace) => base.verifiedHumanMapping(user, workspace),
    readPublication: async request => {
      const copy = structuredClone(request);
      const result = await source(structuredClone(copy));
      if (result === null) return null;
      return qualifyDatasetPublication(result, copy, { ...policy, nowMs: now() }).authority;
    },
  };
}
