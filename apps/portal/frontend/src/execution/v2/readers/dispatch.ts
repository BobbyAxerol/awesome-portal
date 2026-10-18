/**
 * Dispatch on `schema_version`: the one place that decides which reader a
 * body on a shared route goes to.
 *
 * With the workspace in SCOPED_V2 the server answers a V2 body on the SAME
 * route as the V1 one (consumer-review-2026-10-18, finding F8-01). A caller
 * that picks a reader by route alone reads the V2 body with the V1 reader,
 * which does not fail: it answers a V1-shaped object that is wrong (`no R1
 * lineage`, empty capital, side-effect flags `true`). So the choice is made
 * here, from the body, and the answer says which reader ran:
 *
 * - `v1`: the body is V1 (its `schema_version` ends `.v1`, or it has none, as
 *   several V1 bodies do) and the V1 reader read it;
 * - `v2`: the body names a V2 schema this route knows and the V2 reader read it;
 * - `unsupported`: nothing was read, and `reason` says why. It is never a
 *   partial V1-shaped object: a V2 body is refused rather than misread, a
 *   malformed body is refused rather than repaired, and a V2 schema with no
 *   reader built yet (activation) is named, not guessed at.
 *
 * `unsupported` is a readable answer, not an exception, so a screen can say
 * "this response is schema_version X, which this build does not read" instead
 * of "could not be read".
 */
import type { ExecutionApi, Result } from "../../api/ports";
import { readLiveReview, type LiveReviewPayload } from "../../api/profileRead";
import { readGateR2Detail, readPaperExitDetail, type GateR2Detail, type PaperExitDetail } from "../../api/rows";
import { v1Refusal } from "../../api/schemaGuard";
import { readCanaryControlRoom, readSandboxCertification } from "../../certification";
import { readLiveFullOperations } from "../../liveFull";
import { readStagedActivation } from "../../stagedActivation";
import {
  FOLLOWING_PARENT_V2_SCHEMA,
  GOVERNANCE_PARENT_OPERATION_V2_SCHEMA,
  GOVERNANCE_PARENT_V2_SCHEMA,
  LIVE_PARENT_V2_SCHEMA,
  readCanaryParentV2,
  readLiveParentV2,
  readOperationParentV2,
  readPaperExitParentV2,
  readR2ParentV2,
  readSandboxParentV2,
  type LiveParentV2,
  type PaperExitParentV2,
  type R2ParentV2,
} from "./governanceParents";
import { LIVE_SOURCE_V2_SCHEMA, readLiveSourceOperationsV2 } from "./liveSourceOperations";

export type UnsupportedReason =
  /** The body is not a JSON object. */
  | "NOT_AN_OBJECT"
  /** A `schema_version` that is neither V1 nor a V2 this route knows (a later version, another family). */
  | "UNKNOWN_SCHEMA_VERSION"
  /** A V1 body (or one with no version) the V1 reader could not read. */
  | "V1_MALFORMED"
  /** A V2 body the V2 reader refused: wrong family, missing or extra key, out-of-vocabulary word. */
  | "V2_MALFORMED"
  /** A V2 schema this route knows by name and no reader exists for yet. */
  | "V2_READER_NOT_BUILT"
  /** A V1 body on a route that has no V1 reader (operation parents). */
  | "V1_READER_NOT_BUILT"
  /** A V2 shape wearing a V1 `schema_version`: refused, not read as V1. */
  | "V2_MARKERS_UNDER_V1_VERSION";

export type VersionRead<A, B> =
  | { kind: "v1"; schemaVersion: string | null; value: A }
  | { kind: "v2"; schemaVersion: string; value: B }
  | { kind: "unsupported"; schemaVersion: string | null; reason: UnsupportedReason };

export interface VersionReaders<A, B> {
  /** The existing V1 reader. Absent when the route has none. */
  v1?: (raw: unknown) => A | null;
  /** The V2 reader. Absent when the V2 schema is known and not built yet. */
  v2?: (raw: unknown) => B | null;
  /** Every V2 `schema_version` this route can answer. */
  v2Schemas: readonly string[];
  /**
   * The exact V1 `schema_version`(s) this route's V1 reader reads. A body that
   * names another `.v1` schema (another route's review) is refused with
   * `UNKNOWN_SCHEMA_VERSION`, because the V1 readers are tolerant (`data ?? body`,
   * defaults) and would otherwise answer a V1-shaped object that is wrong for the
   * screen that asked (DP-2). A body with NO `schema_version` is still the V1
   * reader's to read, as several V1 bodies carry none.
   */
  v1Schemas?: readonly string[];
}

/** A `data` envelope's own `schema_version`, when it has one (the V1 readers unwrap `data ?? body`). */
function innerVersionOf(raw: unknown): string | null {
  const data = (raw as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const v = (data as Record<string, unknown>).schema_version;
  return typeof v === "string" ? v : null;
}

function versionOf(raw: unknown): { object: boolean; schemaVersion: string | null } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { object: false, schemaVersion: null };
  const v = (raw as Record<string, unknown>).schema_version;
  return { object: true, schemaVersion: typeof v === "string" ? v : null };
}

export function readByVersion<A, B>(raw: unknown, readers: VersionReaders<A, B>): VersionRead<A, B> {
  const { object, schemaVersion } = versionOf(raw);
  if (!object) return { kind: "unsupported", schemaVersion: null, reason: "NOT_AN_OBJECT" };

  if (schemaVersion !== null && readers.v2Schemas.includes(schemaVersion)) {
    if (readers.v2 === undefined) return { kind: "unsupported", schemaVersion, reason: "V2_READER_NOT_BUILT" };
    const value = readers.v2(raw);
    return value === null
      ? { kind: "unsupported", schemaVersion, reason: "V2_MALFORMED" }
      : { kind: "v2", schemaVersion, value };
  }

  const refusal = v1Refusal(raw);
  if (refusal !== null) {
    return {
      kind: "unsupported",
      schemaVersion: refusal.schemaVersion,
      reason: refusal.code === "V2_MARKERS_UNDER_V1_VERSION" ? "V2_MARKERS_UNDER_V1_VERSION" : "UNKNOWN_SCHEMA_VERSION",
    };
  }
  if (readers.v1 === undefined) return { kind: "unsupported", schemaVersion, reason: "V1_READER_NOT_BUILT" };
  if (readers.v1Schemas !== undefined) {
    const named = schemaVersion ?? innerVersionOf(raw);
    if (named !== null && !readers.v1Schemas.includes(named)) {
      return { kind: "unsupported", schemaVersion: named, reason: "UNKNOWN_SCHEMA_VERSION" };
    }
  }
  const value = readers.v1(raw);
  return value === null
    ? { kind: "unsupported", schemaVersion, reason: "V1_MALFORMED" }
    : { kind: "v1", schemaVersion, value };
}

/** Most characters of a body's `schema_version` that `unsupportedText` quotes; the rest is cut and marked. */
export const SCHEMA_VERSION_QUOTE_LIMIT = 80;

/** The version as a person can compare it: control characters removed, at most `SCHEMA_VERSION_QUOTE_LIMIT` characters. */
function quoteVersion(version: string): string {
  const clean = version.replace(/[\u0000-\u001f\u007f]/g, "");
  return clean.length <= SCHEMA_VERSION_QUOTE_LIMIT ? clean : `${clean.slice(0, SCHEMA_VERSION_QUOTE_LIMIT)}…`;
}

/** The sentence for an `unsupported` answer; names the version it saw (cut at `SCHEMA_VERSION_QUOTE_LIMIT`). */
export function unsupportedText(read: Extract<VersionRead<unknown, unknown>, { kind: "unsupported" }>): string {
  const seen = read.schemaVersion === null ? "no schema_version" : `schema_version "${quoteVersion(read.schemaVersion)}"`;
  switch (read.reason) {
    case "NOT_AN_OBJECT":
      return "The response is not a document this screen can read.";
    case "UNKNOWN_SCHEMA_VERSION":
      return `The response carries ${seen}, which this build does not read.`;
    case "V1_MALFORMED":
      return `The response (${seen}) could not be read.`;
    case "V2_MALFORMED":
      return `The response carries ${seen} but does not match that contract, so none of it is shown.`;
    case "V2_READER_NOT_BUILT":
      return `The response carries ${seen}, which this build has no reader for yet.`;
    case "V1_READER_NOT_BUILT":
      return `The response (${seen}) has no V1 reader on this route.`;
    case "V2_MARKERS_UNDER_V1_VERSION":
      return `The response is labelled ${seen} but carries a V2 shape, so it is not read as either.`;
  }
}

/* ── the routes ───────────────────────────────────────────────────────────── */

const GOVERNANCE = [GOVERNANCE_PARENT_V2_SCHEMA];

/** `GET /governance/approvals/{id}/r2` */
export const readR2ByVersion = (raw: unknown) =>
  readByVersion(raw, { v1: readGateR2Detail, v2: readR2ParentV2, v2Schemas: GOVERNANCE, v1Schemas: ["governance.r2-review.v1"] });
/** `GET /governance/exit-reviews/{id}` */
export const readPaperExitByVersion = (raw: unknown) =>
  readByVersion(raw, { v1: readPaperExitDetail, v2: readPaperExitParentV2, v2Schemas: GOVERNANCE, v1Schemas: ["governance.paper-exit-review.v1"] });
/** `GET /governance/approvals/{id}/live` */
export const readLiveReviewByVersion = (raw: unknown) =>
  readByVersion(raw, { v1: readLiveReview, v2: readLiveParentV2, v2Schemas: [LIVE_PARENT_V2_SCHEMA], v1Schemas: ["governance.live-review.v1"] });
/** `GET /deployments/{id}/certification` */
export const readSandboxByVersion = (raw: unknown) =>
  readByVersion(raw, {
    v1: readSandboxCertification, v2: readSandboxParentV2, v2Schemas: [FOLLOWING_PARENT_V2_SCHEMA], v1Schemas: ["governance.sandbox-certification.v1"],
  });
/** `GET /deployments/{id}/canary` */
export const readCanaryByVersion = (raw: unknown) =>
  readByVersion(raw, {
    v1: readCanaryControlRoom, v2: readCanaryParentV2, v2Schemas: [FOLLOWING_PARENT_V2_SCHEMA], v1Schemas: ["execution.canary-control-room.v1"],
  });
/** `GET /deployments/{id}/live` */
export const readLiveFullByVersion = (raw: unknown) =>
  readByVersion(raw, {
    v1: readLiveFullOperations, v2: readLiveSourceOperationsV2, v2Schemas: [LIVE_SOURCE_V2_SCHEMA], v1Schemas: ["execution.live-full-operations.v1"],
  });
/** `GET /operations/{id}` for an R2 or Paper Exit decision (no V1 reader on this route; the legacy union is read elsewhere). */
export const readOperationParentByVersion = (raw: unknown) =>
  readByVersion(raw, { v2: readOperationParentV2, v2Schemas: [GOVERNANCE_PARENT_OPERATION_V2_SCHEMA] });
/** `GET /activation/capabilities`, `GET /activation/plans/{id}`: V2 is named and not built yet. */
export const readActivationByVersion = (raw: unknown) =>
  readByVersion(raw, {
    v1: readStagedActivation,
    v1Schemas: ["execution.staged-activation-capabilities.v1", "execution.staged-activation-plan.v1"],
    v2Schemas: ["portal.execution.activation-capabilities-read.v2", "portal.execution.activation-plan-read.v2"],
  });

/* ── the cockpit's port ───────────────────────────────────────────────────── */

/** The three approval kinds the cockpit reads evidence for through a version-aware port. */
export type GovernanceParentKind = "r2" | "exit" | "live";

/** What `ExecutionApi.getGovernanceParent` answers: the route's dispatch, tagged with its kind. */
export type GovernanceParentRead =
  | { kind: "r2"; read: VersionRead<GateR2Detail, R2ParentV2> }
  | { kind: "exit"; read: VersionRead<PaperExitDetail, PaperExitParentV2> }
  | { kind: "live"; read: VersionRead<LiveReviewPayload, LiveParentV2> };

/** The dispatch for one kind. Never `null`: a body that cannot be read is an `unsupported` answer. */
export function readGovernanceParentByKind(kind: GovernanceParentKind, raw: unknown): GovernanceParentRead {
  switch (kind) {
    case "r2":
      return { kind, read: readR2ByVersion(raw) };
    case "exit":
      return { kind, read: readPaperExitByVersion(raw) };
    case "live":
      return { kind, read: readLiveReviewByVersion(raw) };
  }
}

/**
 * `getGovernanceParent` for a port that only has the V1 methods (the fixture
 * port, tests): the V1 result wrapped as a `v1` answer, failures passed
 * through untouched.
 */
export async function v1GovernanceParent(
  api: Pick<ExecutionApi, "getGateR2" | "getPaperExit" | "getLiveReview">,
  kind: GovernanceParentKind,
  id: string,
  workspaceId: string | undefined,
): Promise<Result<GovernanceParentRead>> {
  switch (kind) {
    case "r2": {
      const result = await api.getGateR2(id, workspaceId);
      return result.ok
        ? { ok: true, value: { kind, read: { kind: "v1", schemaVersion: null, value: result.value } }, warnings: result.warnings }
        : result;
    }
    case "exit": {
      const result = await api.getPaperExit(id, workspaceId);
      return result.ok
        ? { ok: true, value: { kind, read: { kind: "v1", schemaVersion: null, value: result.value } }, warnings: result.warnings }
        : result;
    }
    case "live": {
      const result = await api.getLiveReview(id, workspaceId);
      return result.ok
        ? { ok: true, value: { kind, read: { kind: "v1", schemaVersion: null, value: result.value } }, warnings: result.warnings }
        : result;
    }
  }
}
