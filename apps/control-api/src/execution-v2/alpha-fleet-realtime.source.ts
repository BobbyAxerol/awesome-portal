/**
 * ELP2-09 `alpha_fleet_overview`: the notice source and the baseline identity. Server-only; no authority is minted here.
 *
 * Source truth, stated once. The only durable, ordered signal this dataset has today is the Portal's own Manager
 * publication log (`execution_manager_model_revisions`, written by the existing projection commit under a dense
 * `source_sequence` rule: `MANAGER_CHECKPOINT_GAP` refuses a skipped ordinal). A notice therefore means exactly one thing:
 * a newer publication revision committed inside the SAME (source_epoch, projection_generation). It carries no figure,
 * no delta and no claim about market, order or Trading System state. No Edge scoped-notice source is commissioned for this
 * dataset (`edge_notice_source: NOT_COMMISSIONED` in the snapshot); when one is, it replaces this adapter behind the same
 * `ScopedNoticeSource` port rather than being mixed into it.
 *
 * The adapter reads scalar head metadata and at most `maximumNotices` revision rows WITHOUT their payload; it keeps no
 * cache, no timer and no registry. The SAME `ScopedReplayHub` that calls it owns lifetime, queue, bytes and delivery.
 */
import { accessDigest } from "./access-policy";
import { edgeScopedNoticeBatch, type EdgeScopedNoticeBatch, type ScopedReplayBinding } from "./realtime.contract";
import { ScopedReplayError } from "./scoped-replay-cursor";
import type { ScopedNoticeSource } from "./realtime";
import { ALPHA_FLEET_DATASET, ALPHA_FLEET_STREAM_MODEL } from "./alpha-fleet-realtime.contract";
import { z } from "zod";

export interface FleetHead {
  revision: string; source_epoch: string; source_sequence: string; projection_generation: string;
  payload_digest: string; catalogue_digest: string;
}
export interface FleetRevisionRow { revision: string; source_sequence: string; created_at_ms: number; qualification: string | null; }
/** The two reads the source needs. `ManagerModelRepository` implements it; a unit test supplies a plain object. */
export interface FleetRevisionLog {
  head(workspace: string, environment: string, profile: string): Promise<FleetHead | null>;
  /** `SOURCE_VERIFIED` | `TEST_ONLY` | null for an unknown revision. A TEST_ONLY revision is never offered as a baseline. */
  revisionQualification(workspace: string, environment: string, profile: string, revision: string): Promise<string | null>;
  /** Rows with `source_sequence > after`, ascending, at most `limit`, inside exactly this (epoch, generation). No payload. */
  revisionMetadataAfter(workspace: string, environment: string, profile: string, epoch: string, generation: string,
    after: string, limit: number): Promise<FleetRevisionRow[]>;
}

export type FleetSelection = Readonly<{ workspace_id: string; environment: "paper" | "sandbox" | "live"; profile_id: string }>;

const sha = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const ordinalText = z.string().regex(/^(?:0|[1-9][0-9]{0,18})$(?![\s\S])/);
const coordinate = z.object({
  version: z.literal(1), epoch_digest: sha, generation_digest: sha, original_snapshot_id: sha,
  baseline_ordinal: ordinalText, after_ordinal: ordinalText,
}).strict().refine(v => BigInt(v.after_ordinal) >= BigInt(v.baseline_ordinal), "FLEET_ORDINAL_BEFORE_BASELINE");
export type FleetCoordinate = z.infer<typeof coordinate>;
const PREFIX = "mf1.";

const invalid = (code: ConstructorParameters<typeof ScopedReplayError>[0]): never => { throw new ScopedReplayError(code); };
const digestOf = (kind: string, value: string) => accessDigest({ schema_version: `portal.alpha-fleet-realtime.${kind}.v1`, value });

export function encodeFleetCoordinate(value: FleetCoordinate): string {
  try {
    const token = PREFIX + Buffer.from(JSON.stringify(coordinate.parse(value)), "utf8").toString("base64url");
    if (Buffer.byteLength(token) > 2048) throw Error();
    return token;
  } catch { return invalid("CURSOR_INVALID_OR_EXPIRED"); }
}
export function decodeFleetCoordinate(token: string): Readonly<FleetCoordinate> {
  try {
    if (typeof token !== "string" || Buffer.byteLength(token) > 2048 || !/^mf1\.[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const body = token.slice(PREFIX.length), bytes = Buffer.from(body, "base64url");
    if (bytes.toString("base64url") !== body) throw Error();
    const parsed = coordinate.parse(JSON.parse(bytes.toString("utf8")));
    if (encodeFleetCoordinate(parsed) !== token) throw Error(); // canonical form only
    return Object.freeze(parsed);
  } catch { return invalid("CURSOR_INVALID_OR_EXPIRED"); }
}

export const fleetQueryDigest = (s: FleetSelection): string => accessDigest({
  schema_version: "portal.alpha-fleet-realtime.query.v1", workspace_id: s.workspace_id, environment: s.environment,
  profile_id: s.profile_id, dataset: ALPHA_FLEET_DATASET });
/** Identity of the publication lineage a notice may be drawn from. A catalogue change inside a generation is a new source set. */
export const fleetSourceSetDigest = (s: FleetSelection, head: Pick<FleetHead, "catalogue_digest" | "source_epoch">): string => accessDigest({
  schema_version: "portal.alpha-fleet-realtime.source-set.v1", query_digest: fleetQueryDigest(s),
  catalogue_digest: head.catalogue_digest, source_epoch: head.source_epoch });

/** Pure capture of the head a snapshot is taken at. It is the barrier: the stream starts at exactly this ordinal, never at "now". */
export function fleetBaseline(head: FleetHead, selection: FleetSelection) {
  const ordinal = head.source_sequence;
  if (!ordinalText.safeParse(ordinal).success) return invalid("SOURCE_COVERAGE_UNPROVED");
  const source_set_digest = fleetSourceSetDigest(selection, head);
  const snapshot_id = accessDigest({ schema_version: "portal.alpha-fleet-realtime.snapshot.v1", query_digest: fleetQueryDigest(selection),
    source_set_digest, revision: head.revision, projection_generation: head.projection_generation, ordinal, payload_digest: head.payload_digest });
  return Object.freeze({
    query_digest: fleetQueryDigest(selection), source_set_digest, snapshot_id,
    source_continuity_epoch: head.source_epoch, projection_generation: head.projection_generation, ordinal,
    source_cursor: encodeFleetCoordinate({ version: 1, epoch_digest: digestOf("epoch", head.source_epoch),
      generation_digest: digestOf("generation", head.projection_generation), original_snapshot_id: snapshot_id,
      baseline_ordinal: ordinal, after_ordinal: ordinal }),
  });
}

export class ManagerFleetNoticeSource implements ScopedNoticeSource {
  constructor(private readonly log: FleetRevisionLog, private readonly maximumNotices = 200) {
    if (!Number.isSafeInteger(maximumNotices) || maximumNotices < 1 || maximumNotices > 200) throw Error("FLEET_NOTICE_BOUND_INVALID");
  }

  async read(binding: ScopedReplayBinding, after: string, requestedLimit = this.maximumNotices, signal?: AbortSignal): Promise<EdgeScopedNoticeBatch> {
    try {
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) return invalid("SOURCE_COVERAGE_UNPROVED");
      if (signal?.aborted) return invalid("SOURCE_UNAVAILABLE");
      const c = decodeFleetCoordinate(after);
      if (binding.dataset !== ALPHA_FLEET_DATASET || binding.window !== null || binding.model_revision !== ALPHA_FLEET_STREAM_MODEL ||
        !["paper", "sandbox", "live"].includes(binding.environment)) return invalid("SCOPE_CHANGED");
      const selection: FleetSelection = { workspace_id: binding.workspace_id, environment: binding.environment, profile_id: binding.profile_id };
      if (binding.query_digest !== fleetQueryDigest(selection) || binding.snapshot_id !== c.original_snapshot_id) return invalid("SCOPE_CHANGED");
      const head = await this.log.head(selection.workspace_id, selection.environment, selection.profile_id);
      if (signal?.aborted) return invalid("SOURCE_UNAVAILABLE");
      if (!head) return invalid("SOURCE_UNAVAILABLE");
      // A new epoch, generation or catalogue is a new lineage: the old cursor is not resumed, the browser re-baselines.
      if (digestOf("epoch", head.source_epoch) !== c.epoch_digest || digestOf("generation", head.projection_generation) !== c.generation_digest ||
        head.source_epoch !== binding.source_continuity_epoch || head.projection_generation !== binding.projection_generation ||
        fleetSourceSetDigest(selection, head) !== binding.source_set_digest) return invalid("GENERATION_CHANGED");
      if (!ordinalText.safeParse(head.source_sequence).success) return invalid("SOURCE_COVERAGE_UNPROVED");
      const headOrdinal = BigInt(head.source_sequence), afterOrdinal = BigInt(c.after_ordinal);
      // The head moving BACKWARDS is a rollback or a corrupt checkpoint, never "nothing new".
      if (headOrdinal < afterOrdinal) return invalid("SOURCE_COVERAGE_UNPROVED");
      const wanted = headOrdinal - afterOrdinal;
      if (wanted === 0n) return { notices: [], next_cursor: after, caught_up: true };
      const count = Number(wanted < BigInt(Math.min(requestedLimit, this.maximumNotices)) ? wanted : BigInt(Math.min(requestedLimit, this.maximumNotices)));
      const rows = await this.log.revisionMetadataAfter(selection.workspace_id, selection.environment, selection.profile_id,
        head.source_epoch, head.projection_generation, c.after_ordinal, count);
      if (signal?.aborted) return invalid("SOURCE_UNAVAILABLE");
      // The writer refuses a skipped ordinal, so a short or gapped prefix is retention loss or corruption: never skip, never re-baseline silently.
      if (rows.length !== count) return invalid("SOURCE_COVERAGE_UNPROVED");
      const notices = rows.map((row, index) => {
        // Qualification belongs to EACH persisted publication, not the head
        // alone. An unverified intermediate revision is a gap: never skip it
        // or expose even a revision notice under a SOURCE_VERIFIED baseline.
        if (row.qualification !== "SOURCE_VERIFIED" ||
          !ordinalText.safeParse(row.source_sequence).success || BigInt(row.source_sequence) !== afterOrdinal + BigInt(index + 1) ||
          !Number.isSafeInteger(row.created_at_ms) || row.created_at_ms < 0) return invalid("SOURCE_COVERAGE_UNPROVED");
        return {
          resume_cursor: encodeFleetCoordinate({ ...c, after_ordinal: row.source_sequence }),
          projection_generation: head.projection_generation,
          quality: {
            // A publication-revision notice states neither completeness nor freshness of any figure: those belong to the named read.
            completeness: "PARTIAL" as const, freshness: "UNKNOWN" as const, coverage: "AUTHORIZED_ONLY" as const,
            source_as_of_ms: null, portal_observed_at_ms: row.created_at_ms, source_set_ref: binding.source_set_digest,
            confidence: "PROVISIONAL" as const,
            reasons: ["PORTAL_PUBLICATION_REVISION_NOTICE", "NO_EDGE_NOTICE_SOURCE", "SOURCE_FRESHNESS_NOT_ATTESTED"],
          },
        };
      });
      // A source replacement during revision I/O invalidates this batch even
      // when the initial head matched. The Hub separately fences current
      // human/field authority; this scalar recheck protects source lineage.
      const current = await this.log.head(selection.workspace_id, selection.environment, selection.profile_id);
      if (signal?.aborted || !current) return invalid("SOURCE_UNAVAILABLE");
      if (current.source_epoch !== head.source_epoch || current.projection_generation !== head.projection_generation ||
        fleetSourceSetDigest(selection, current) !== binding.source_set_digest) return invalid("GENERATION_CHANGED");
      if (!ordinalText.safeParse(current.source_sequence).success || BigInt(current.source_sequence) < headOrdinal ||
        (current.source_sequence === head.source_sequence &&
          (current.revision !== head.revision || current.payload_digest !== head.payload_digest)))
        return invalid("SOURCE_COVERAGE_UNPROVED");
      return edgeScopedNoticeBatch.parse({ notices, next_cursor: notices[notices.length - 1]!.resume_cursor,
        caught_up: rows[rows.length - 1]!.source_sequence === current.source_sequence });
    } catch (error) { if (error instanceof ScopedReplayError) throw error; return invalid("SOURCE_UNAVAILABLE"); }
  }
}
