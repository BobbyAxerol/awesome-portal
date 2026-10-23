/**
 * V2 reader for the per-user, per-workspace visit digest (Codex package 3, `portal.execution.visit-digest.v1`):
 * `GET /api/v1/execution/visit-digest?workspace_id=` and `POST /api/v1/execution/visit-digest/seen?workspace_id=`
 * (`VisitDigest`, `VisitDigestSeen`; operationIds `executionVisitDigestGetV1`, `executionVisitDigestSeenV1`).
 *
 * What the body IS: the Portal's own last-seen OBSERVATION baseline compared with the current authorized command-center slice
 * (triage, today, source). What it is NOT, and what this reader keeps true for a screen:
 * - `coverage` is the constant `BOUNDED_OBSERVATIONS`: no complete event history, no NAV delta, no "resolved" or "deleted" inferred from
 *   a row that fell out of a top-N list. `NEW_OBSERVATION` is "newly visible", not "newly created";
 * - `NO_BASELINE` is a FIRST VISIT (nothing was ever acknowledged), not an empty history; `EMPTY` is "nothing changed since the baseline",
 *   not a statement about history;
 * - `may_mark_seen` and its reason are the server's; nothing is parsed out of a label, a value or an href into a permission or an event.
 *   An `href` is data: it must be a path inside the app (`/execution`, `/governance`, `/deployments`), else the read is refused;
 * - `mark_seen` is exactly the POST body the server wants back (snapshot revision and expected baseline version): sent only on an explicit
 *   user action, never on a read.
 *
 * Runtime rules the schema states by `allOf` and this reader enforces (a violation voids the read, nothing is repaired): `may_mark_seen`
 * true has no reason and false says `READ_ONLY_PROFILE`; `NO_BASELINE` has no baseline, `NO_COMPARISON_BASELINE`, no items and no unseen;
 * every other state has a baseline and no reason code; `READY` has at least one item; `EMPTY` none; every item is `seen: false`, ids are
 * unique and the unseen count equals the item count; `mark_seen.snapshot_revision` is the body's own revision. A body for another workspace
 * than the one asked is refused by `visitDigestAnswers`. An item KIND outside the vocabulary is typed `UNKNOWN` (a word, never a guess);
 * any other closed enum outside its vocabulary voids the read. Never throws.
 */
import { closed, oneOf, rec } from "./accessSelf";

export const VISIT_DIGEST_SCHEMA = "portal.execution.visit-digest.v1";
export const VISIT_DIGEST_PATH = "/visit-digest";
export const VISIT_DIGEST_SEEN_PATH = "/visit-digest/seen";
export const VISIT_DIGEST_STATES = ["NO_BASELINE", "READY", "EMPTY"] as const;
export type VisitDigestState = (typeof VISIT_DIGEST_STATES)[number];
export const VISIT_ITEM_KINDS = ["INCIDENT", "APPROVAL", "OPERATION", "RECONCILIATION", "REVIEW_DUE", "CONDITION_EXPIRY", "VERIFIED_OPERATION", "JOURNAL_COMMAND", "SOURCE", "STAGE"] as const;
export type VisitItemKind = (typeof VISIT_ITEM_KINDS)[number] | "UNKNOWN";
export const VISIT_CHANGES = ["NEW_OBSERVATION", "CHANGED"] as const;
export type VisitChange = (typeof VISIT_CHANGES)[number];
export const MAX_VISIT_ITEMS = 200;

const TOP_KEYS = ["schema_version", "state", "workspace_id", "may_mark_seen", "mark_seen_reason", "reason_code", "snapshot_revision", "observed_at", "coverage", "baseline", "items", "unseen_count", "mark_seen"] as const;
const ITEM_KEYS = ["id", "kind", "label", "value", "href", "as_of", "change", "seen"] as const;
const REVISION = /^[0-9a-f]{64}$/;
const HREF = /^\/(?:execution|governance|deployments)(?:\/|\?|$)/;
// ASCII/C1 controls, DEL, zero-width and bidi-control format characters: text that can reorder or hide what a screen prints.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩؜᠎﻿]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export interface VisitBaseline {
  version: number;
  seenAt: string;
  snapshotRevision: string;
}

export interface VisitItem {
  id: string;
  kind: VisitItemKind;
  label: string;
  value: string;
  /** A path inside the app, as the server published it. The screen keeps its workspace and context params when it links. */
  href: string;
  asOf: string | null;
  change: VisitChange;
}

export interface VisitDigest {
  state: VisitDigestState;
  workspaceId: string;
  mayMarkSeen: boolean;
  /** `READ_ONLY_PROFILE` when `mayMarkSeen` is false, else `null`. */
  markSeenReason: "READ_ONLY_PROFILE" | null;
  snapshotRevision: string;
  observedAt: string;
  baseline: VisitBaseline | null;
  items: readonly VisitItem[];
  unseenCount: number;
  /** The POST body, as the server wants it back. */
  markSeen: VisitDigestSeenBody;
}

export interface VisitDigestSeenBody {
  snapshot_revision: string;
  expected_baseline_version: number;
}

export type VisitDigestRead = { kind: "digest"; digest: VisitDigest } | { kind: "unsupported_shape"; schemaVersion: string | null };

function text(value: unknown, max: number, min = 1): string | null {
  if (typeof value !== "string" || value.length < min || value.length > max || UNSAFE.test(value) || LONE_SURROGATE.test(value)) return null;
  return min > 0 && value.trim().length === 0 ? null : value;
}

function instant(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

const version = (value: unknown, min: number): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= 2_147_483_646 ? value : null;

function readBaseline(raw: unknown): VisitBaseline | null {
  const b = closed(raw, ["version", "seen_at", "snapshot_revision"]);
  if (b === null) return null;
  const v = version(b.version, 1);
  const seenAt = instant(b.seen_at);
  return v === null || seenAt === null || typeof b.snapshot_revision !== "string" || !REVISION.test(b.snapshot_revision) ? null : { version: v, seenAt, snapshotRevision: b.snapshot_revision };
}

function readItem(raw: unknown): VisitItem | null {
  const r = closed(raw, ITEM_KEYS);
  if (r === null || r.seen !== false) return null;
  const id = text(r.id, 256);
  const label = text(r.label, 512);
  const value = text(r.value, 1024, 0);
  const change = oneOf(r.change, VISIT_CHANGES);
  const href = typeof r.href === "string" && r.href.length <= 2048 && HREF.test(r.href) && !UNSAFE.test(r.href) && !LONE_SURROGATE.test(r.href) ? r.href : null;
  const asOf = r.as_of === null ? null : instant(r.as_of);
  if (id === null || label === null || value === null || change === null || href === null || (r.as_of !== null && asOf === null)) return null;
  // A kind this build does not know is typed UNKNOWN: the item is still shown with its own label, and no meaning is guessed from the word.
  const kind: VisitItemKind = oneOf(r.kind, VISIT_ITEM_KINDS) ?? "UNKNOWN";
  if (typeof r.kind !== "string") return null;
  return { id, kind, label, value, href, asOf, change };
}

export function readVisitDigest(raw: unknown): VisitDigestRead | null {
  try {
    const top = rec(raw);
    if (top === null) return null;
    if (top.schema_version !== VISIT_DIGEST_SCHEMA) return { kind: "unsupported_shape", schemaVersion: typeof top.schema_version === "string" ? top.schema_version : null };
    const r = closed(raw, TOP_KEYS);
    if (r === null) return null;
    const state = oneOf(r.state, VISIT_DIGEST_STATES);
    const workspaceId = text(r.workspace_id, 96);
    const observedAt = instant(r.observed_at);
    const markSeen = closed(r.mark_seen, ["snapshot_revision", "expected_baseline_version"]);
    const expected = markSeen === null ? null : version(markSeen.expected_baseline_version, 0);
    if (state === null || workspaceId === null || observedAt === null || markSeen === null || expected === null) return null;
    if (typeof r.snapshot_revision !== "string" || !REVISION.test(r.snapshot_revision) || markSeen.snapshot_revision !== r.snapshot_revision) return null;
    if (r.coverage !== "BOUNDED_OBSERVATIONS" || typeof r.may_mark_seen !== "boolean") return null;
    // may_mark_seen and its reason are one fact.
    if (r.may_mark_seen ? r.mark_seen_reason !== null : r.mark_seen_reason !== "READ_ONLY_PROFILE") return null;
    if (!Array.isArray(r.items) || r.items.length > MAX_VISIT_ITEMS) return null;
    const items: VisitItem[] = [];
    for (const raw of r.items) {
      const item = readItem(raw);
      if (item === null) return null;
      items.push(item);
    }
    if (new Set(items.map((i) => i.id)).size !== items.length) return null;
    const unseen = typeof r.unseen_count === "number" && Number.isSafeInteger(r.unseen_count) && r.unseen_count >= 0 && r.unseen_count <= MAX_VISIT_ITEMS ? r.unseen_count : null;
    if (unseen === null || unseen !== items.length) return null;
    const baseline = r.baseline === null ? null : readBaseline(r.baseline);
    if (r.baseline !== null && baseline === null) return null;
    if (state === "NO_BASELINE") {
      if (baseline !== null || r.reason_code !== "NO_COMPARISON_BASELINE" || items.length !== 0) return null;
    } else {
      if (baseline === null || r.reason_code !== null) return null;
      if (state === "READY" ? items.length < 1 : items.length !== 0) return null;
    }
    return {
      kind: "digest",
      digest: {
        state, workspaceId, mayMarkSeen: r.may_mark_seen, markSeenReason: r.may_mark_seen ? null : "READ_ONLY_PROFILE", snapshotRevision: r.snapshot_revision,
        observedAt, baseline, items, unseenCount: unseen, markSeen: { snapshot_revision: markSeen.snapshot_revision as string, expected_baseline_version: expected },
      },
    };
  } catch {
    return null;
  }
}

/** The query string of the GET and the POST: `workspace_id` only, and only when the address names a workspace. */
export function visitDigestQuery(workspaceId: string | undefined): string | null {
  if (workspaceId === undefined) return "";
  return workspaceId.length >= 1 && workspaceId.length <= 96 && !UNSAFE.test(workspaceId) ? `?workspace_id=${encodeURIComponent(workspaceId)}` : null;
}

/** True when the body answers THIS question: the same workspace when one was asked. A body for another workspace is never shown. */
export function visitDigestAnswers(digest: VisitDigest, workspaceId: string | undefined): boolean {
  return workspaceId === undefined || digest.workspaceId === workspaceId;
}

/** The result of an explicit mark-seen: ok (the new digest), a 409 conflict (read again and act again), or a typed failure. */
export type VisitDigestMarkResult =
  | { kind: "ok"; digest: VisitDigest }
  | { kind: "conflict"; code: string | null }
  | { kind: "refused"; status: number; code: string | null }
  | { kind: "unavailable"; reason: string };
