import { createHash } from "node:crypto";
import type { CommandCenterInputs } from "./contracts";

/** Portal-owned observation baseline, not an Edge event ledger or a login timestamp. */
export interface DigestFact {
  id: string;
  kind: "INCIDENT" | "APPROVAL" | "OPERATION" | "RECONCILIATION" | "REVIEW_DUE" |
    "CONDITION_EXPIRY" | "VERIFIED_OPERATION" | "JOURNAL_COMMAND" | "SOURCE" | "STAGE";
  label: string;
  value: string;
  href: string;
  as_of: string | null;
}
export interface DigestSnapshot {
  workspace_id: string;
  revision: string;
  observed_at: string;
  coverage: "BOUNDED_OBSERVATIONS";
  facts: DigestFact[];
}
export interface DigestBaseline {
  version: number;
  seen_at: string;
  snapshot_revision: string;
  fingerprints: Record<string, string>;
}
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function digestFingerprint(fact: DigestFact): string {
  // Observing the same fact later is not a change. URLs and display labels are not state.
  return hash([fact.kind, fact.value]);
}
export function safeDigestHref(href: string, workspaceId: string): string {
  if (href.length > 1024 || !/^\/(?:execution|governance|deployments)(?:\/|\?|$)/.test(href) || /[\\\u0000-\u0020]/.test(href))
    return `/execution?workspace_id=${encodeURIComponent(workspaceId)}`;
  const url = new URL(href, "https://portal.invalid");
  if (url.origin !== "https://portal.invalid" || !/^\/(?:execution|governance|deployments)(?:\/|$)/.test(url.pathname))
    return `/execution?workspace_id=${encodeURIComponent(workspaceId)}`;
  url.searchParams.set("workspace_id", workspaceId);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function makeDigestSnapshot(workspaceId: string, observedAt: string, facts: DigestFact[]): DigestSnapshot {
  if (!workspaceId || workspaceId.length > 96 || !Number.isFinite(Date.parse(observedAt)) || facts.length > 200)
    throw new Error("DIGEST_INPUT_BOUND");
  const sorted = facts.map(f => {
    if (!f.id || f.id.length > 256 || !f.label || f.label.length > 512 || f.value.length > 1024 ||
      (f.as_of !== null && !Number.isFinite(Date.parse(f.as_of)))) throw new Error("DIGEST_FACT_INVALID");
    return { ...f, href: safeDigestHref(f.href, workspaceId) };
  }).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(sorted.map(f => f.id)).size !== sorted.length) throw new Error("DIGEST_DUPLICATE_FACT");
  return { workspace_id: workspaceId, revision: hash([workspaceId, sorted.map(({ as_of: _asOf, ...fact }) => fact)]), observed_at: observedAt,
    coverage: "BOUNDED_OBSERVATIONS", facts: sorted };
}
export function digestSnapshot(inputs: CommandCenterInputs): DigestSnapshot {
  const facts: DigestFact[] = [];
  for (const slice of inputs.triageSources) {
    if (slice.status.availability !== "AVAILABLE") continue;
    for (const item of slice.items) facts.push({ id: `${slice.status.source}:${item.kind}:${item.id}`,
      kind: item.kind, label: item.title, value: `${item.severity} · ${item.sla_state} · ${item.summary}`,
      href: item.href, as_of: item.as_of });
  }
  for (const slice of inputs.todaySources) {
    if (slice.status.availability !== "AVAILABLE") continue;
    for (const item of slice.items) facts.push({ id: `${slice.status.source}:${item.kind}:${item.id}`,
      kind: item.kind, label: item.label, value: item.scheduled_at, href: item.href, as_of: item.as_of });
  }
  const sources = new Map([...inputs.triageSources, ...inputs.todaySources, inputs.fleet].map(s => [s.status.source, s.status]));
  for (const status of sources.values()) facts.push({ id: `source:${status.source}`, kind: "SOURCE",
    label: status.source, value: `${status.availability}:${status.freshness_state}:${status.reason ?? ""}`,
    href: "/execution", as_of: status.as_of });
  // These are bounded observation slices, NOT a complete event feed. Missing rows
  // never become resolved/deleted events, and hidden previous rows never reappear.
  return makeDigestSnapshot(inputs.workspaceId, inputs.readAt.toISOString(), facts);
}
export function makeBaseline(snapshot: DigestSnapshot, version: number, seenAt: string): DigestBaseline {
  return { version, seen_at: seenAt, snapshot_revision: snapshot.revision,
    fingerprints: Object.fromEntries(snapshot.facts.map(f => [f.id, digestFingerprint(f)])) };
}
export function composeVisitDigest(snapshot: DigestSnapshot, baseline: DigestBaseline | null, mayMarkSeen = true) {
  const items = baseline ? snapshot.facts.map(f => ({ ...f,
    change: !Object.hasOwn(baseline.fingerprints, f.id) ? "NEW_OBSERVATION" as const :
      baseline.fingerprints[f.id] !== digestFingerprint(f) ? "CHANGED" as const : "UNCHANGED" as const,
    seen: baseline.fingerprints[f.id] === digestFingerprint(f),
  })).filter(f => !f.seen) : [];
  return { schema_version: "portal.execution.visit-digest.v1" as const,
    workspace_id: snapshot.workspace_id,
    may_mark_seen: mayMarkSeen,
    mark_seen_reason: mayMarkSeen ? null : "READ_ONLY_PROFILE" as const,
    state: baseline === null ? "NO_BASELINE" as const : items.length ? "READY" as const : "EMPTY" as const,
    reason_code: baseline === null ? "NO_COMPARISON_BASELINE" as const : null,
    snapshot_revision: snapshot.revision, observed_at: snapshot.observed_at, coverage: snapshot.coverage,
    baseline: baseline ? { version: baseline.version, seen_at: baseline.seen_at,
      snapshot_revision: baseline.snapshot_revision } : null,
    items, unseen_count: items.length, mark_seen: { snapshot_revision: snapshot.revision,
      expected_baseline_version: baseline?.version ?? 0 } };
}
