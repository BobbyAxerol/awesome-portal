/**
 * PHASE 2B (round 2) · the mirror's own account of what it is missing.
 *
 * The durable mirror has recorded gaps and conflicts since it was built and
 * nothing has ever read them — no route, no screen. A system that files its own
 * holes where nobody looks reads as healthy, which is worse than not detecting
 * them at all.
 *
 * The envelope is an aggregate by design. `entity_key`, `row_id` and the
 * payload digests stay in the database: they name a customer's order, and an
 * operator needs to know a relation is incomplete, not which row it was.
 */

/** `READY` is a measured claim; `UNAVAILABLE` never carries a count. */
export type MirrorIntegrityState = "READY" | "PARTIAL" | "UNAVAILABLE";

export interface MirrorIntegrityFinding {
  readonly kind: "GAP" | "CONFLICT";
  readonly relationKey: string;
  readonly reasonCode: string;
  readonly findings: number;
  readonly firstDetectedAtMs: number | null;
  readonly lastDetectedAtMs: number | null;
}

export interface MirrorIntegrity {
  readonly state: MirrorIntegrityState;
  readonly reasonCode: string | null;
  readonly measuredRevision: string | null;
  readonly measuredAtMs: number | null;
  readonly readAtMs: number | null;
  /** Null, never zero, when nothing was measured to count. */
  readonly gapFindings: number | null;
  readonly conflictFindings: number | null;
  readonly totalFindings: number | null;
  readonly findings: readonly MirrorIntegrityFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const countOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function readMirrorIntegrity(raw: unknown): MirrorIntegrity | null {
  if (!isRecord(raw)) return null;
  if (raw.schema_version !== "execution.durable-mirror-integrity.v1") return null;
  const state = raw.state;
  if (state !== "READY" && state !== "PARTIAL" && state !== "UNAVAILABLE") return null;
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  return {
    state,
    reasonCode: typeof raw.reason_code === "string" ? raw.reason_code : null,
    measuredRevision: typeof raw.measured_revision === "string" ? raw.measured_revision : null,
    measuredAtMs: countOrNull(raw.measured_at_ms),
    readAtMs: countOrNull(raw.read_at_ms),
    gapFindings: countOrNull(raw.gap_findings),
    conflictFindings: countOrNull(raw.conflict_findings),
    totalFindings: countOrNull(raw.total_findings),
    findings: findings.flatMap((entry): MirrorIntegrityFinding[] => {
      if (!isRecord(entry)) return [];
      const kind = entry.kind;
      if (kind !== "GAP" && kind !== "CONFLICT") return [];
      if (typeof entry.relation_key !== "string" || typeof entry.reason_code !== "string") return [];
      return [{
        kind,
        relationKey: entry.relation_key,
        reasonCode: entry.reason_code,
        findings: countOrNull(entry.findings) ?? 0,
        firstDetectedAtMs: countOrNull(entry.first_detected_at_ms),
        lastDetectedAtMs: countOrNull(entry.last_detected_at_ms),
      }];
    }),
  };
}

/**
 * The sentence the panel shows. `0 gaps` is only ever said for a READY
 * measurement — for anything else it would be a claim nobody made.
 */
export function mirrorIntegritySentence(integrity: MirrorIntegrity): string {
  if (integrity.state === "UNAVAILABLE") {
    return integrity.reasonCode === "EDS06_MIRROR_DISABLED"
      ? "The durable mirror is switched off in this environment, so it has nothing to report."
      : integrity.reasonCode === "EDS06_MIRROR_NEVER_MEASURED"
        ? "The mirror has never completed a measurement here, so no count exists — not zero, none."
        : integrity.reasonCode === "EDS06_MIRROR_PROFILE_NOT_CONFIGURED"
          ? "No execution profile is configured for this environment, so the mirror was never scoped."
          : "The mirror integrity read did not complete, so nothing can be claimed about it.";
  }
  if (integrity.state === "READY") {
    return "The mirror measured itself against its current revision and recorded no gap and no conflict.";
  }
  const gaps = integrity.gapFindings ?? 0;
  const conflicts = integrity.conflictFindings ?? 0;
  return `The mirror recorded ${integrity.totalFindings ?? 0} finding(s) across `
    + `${gaps} relation(s) missing data and ${conflicts} with a digest conflict.`;
}
