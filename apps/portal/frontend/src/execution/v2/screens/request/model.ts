/**
 * New request V2 (S3 W-REQUEST): the pure model. No React, no network.
 *
 * What lives here, and why it is not in the component:
 *
 * - The validation matrix. Submit is enabled only when this says `ready`, and the same
 *   answer produces the "Still needed" sentence, so the button and the sentence can never
 *   disagree (V1 had to patch exactly that: a dead button explaining the wrong blocker).
 * - The hostile-text rule. A summary becomes the first sentence a reviewer reads, and it is
 *   pinned into the evidence manifest. Direction-changing and invisible characters are
 *   refused before anything is sent; a server message that carries them is shown with the
 *   characters spelled out, never interpreted.
 * - The typed refusal mapping: the server's `CODE: message` becomes one plain sentence by
 *   code, and the server's own words stay available verbatim for Provenance.
 *
 * Numbers that come from the contract, not from the hi-fi (D8): the summary minimum is 8
 * (`ApprovalCreateRequest.summary.minLength`, also V1), not the hi-fi's 24; the maximum is
 * 2,000 (`maxLength`). Ids follow the schema's `Identifier` pattern.
 */
import type { ApprovalCreateOutcome } from "../../../api/ports";
import type { RunClaim, RunOption } from "../../../runSuggestions";
import { readUtcEpochMs } from "../../../screenDataContract";
import { formatAsOf } from "../../boundary";

/* ── limits (execution-governance-product.v1.schema.json: ApprovalCreateRequest) ── */

/** D8: the server and V1 value. The hi-fi said 24; the server would accept 8, so 24 would refuse valid requests. */
export const MIN_SUMMARY = 8;
export const MAX_SUMMARY = 2000;
/** Schema `Identifier`: `^[A-Za-z0-9._:-]{1,191}$`. */
export const ID_PATTERN = /^[A-Za-z0-9._:-]{1,191}$/;
export const ID_RULE = "letters, digits and . _ : -";

/* ── fields ──────────────────────────────────────────────────────────────── */

export interface RequestFields {
  alphaId: string;
  runId: string;
  claimId: string;
  summary: string;
}
export const EMPTY_FIELDS: RequestFields = { alphaId: "", runId: "", claimId: "", summary: "" };

/** What the server receives: every field trimmed, none guessed. */
export interface SubmitPayload {
  alphaId: string;
  evidenceRunId: string;
  methodologyClaimId: string;
  summary: string;
}

/* ── hostile text ────────────────────────────────────────────────────────── */

/**
 * Code point ranges that are refused in the summary and spelled out when a server string carries them: C0/C1 controls
 * except tab and the line breaks, soft hyphen, the Arabic letter mark, the Mongolian vowel separator, zero-width and
 * direction marks, embeddings and isolates (U+200B-U+200F, U+2028-U+202E, U+2060-U+206F), the BOM, interlinear
 * annotation, the Tags block, and lone surrogates. Written as numbers so no invisible character sits in this source.
 */
const HOSTILE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008], [0x000b, 0x000c], [0x000e, 0x001f], [0x007f, 0x009f], [0x00ad, 0x00ad], [0x061c, 0x061c], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0xe0000, 0xe007f], [0xd800, 0xdfff],
];

/**
 * Invisible fillers: they render as nothing (or as a blank), so they must not count toward the summary minimum, but they are
 * not direction-changing and a legitimate text can carry one, so they are not refused outright. The hostile ranges above
 * (zero-width, direction marks, soft hyphen, BOM, tags, ...) are refused; these are only not counted. Also not counted: any
 * Unicode space other than the ASCII space, tab and line breaks (no-break, em and ideographic spaces).
 */
const FILLER_RANGES: readonly (readonly [number, number])[] = [
  [0x034f, 0x034f], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x2800, 0x2800], [0x3164, 0x3164], [0xffa0, 0xffa0],
  [0x00a0, 0x00a0], [0x1680, 0x1680], [0x2000, 0x200a], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000],
];

function isFiller(cp: number): boolean {
  for (const [lo, hi] of FILLER_RANGES) if (cp >= lo && cp <= hi) return true;
  return false;
}

/** Code points of `text` that a reader can see: fillers are left out. */
export function visibleCount(text: string): number {
  let n = 0;
  for (const ch of text) if (!isFiller(ch.codePointAt(0) ?? 0)) n += 1;
  return n;
}

function isHostile(cp: number): boolean {
  for (const [lo, hi] of HOSTILE_RANGES) if (cp >= lo && cp <= hi) return true;
  return false;
}

function label(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** The hostile code points of `text`, as `U+202E`-style labels, at most four, each once. */
export function hostileCharacters(text: string): string[] {
  const found: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!isHostile(cp)) continue;
    const l = label(cp);
    if (!found.includes(l)) found.push(l);
    if (found.length === 4) break;
  }
  return found;
}

/** A string from outside, safe to print: each hostile character becomes its code point in brackets. Long text is cut. */
export function showable(text: string, max = 400): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    out += isHostile(cp) ? `[${label(cp)}]` : ch;
    if (out.length > max * 2) break;
  }
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

export function codePointCount(text: string): number {
  let n = 0;
  for (const _ of text) n += 1;
  return n;
}

/* ── validation matrix ───────────────────────────────────────────────────── */

export type FieldKey = "alpha" | "run" | "claim" | "summary";

export interface Need {
  field: FieldKey;
  /** The phrase that follows "Still needed:". */
  text: string;
}

export type SummaryState = "empty" | "short" | "ok" | "long" | "hostile";

export interface SummaryCheck {
  state: SummaryState;
  /** Characters counted the way the counter prints them: VISIBLE code points of the trimmed text (invisible fillers are not counted; UTF-16 units when that is larger and the limit is the question). */
  count: number;
  /** Hostile code points found, `U+202E`-style, at most four. */
  hostile: readonly string[];
}

export function checkSummary(raw: string): SummaryCheck {
  const text = raw.trim();
  // Far past the limit the answer is "too long" whatever else is in it: no need to walk megabytes on every keystroke.
  if (text.length > MAX_SUMMARY * 8) return { state: "long", count: text.length, hostile: [] };
  const hostile = hostileCharacters(text);
  const points = codePointCount(text);
  const visible = visibleCount(text);
  const units = Math.max(points, text.length);
  if (hostile.length > 0) return { state: "hostile", count: visible, hostile };
  if (units > MAX_SUMMARY) return { state: "long", count: units, hostile };
  if (visible === 0) return { state: "empty", count: 0, hostile };
  if (visible < MIN_SUMMARY) return { state: "short", count: visible, hostile };
  return { state: "ok", count: visible, hostile };
}

export interface Validation {
  needs: readonly Need[];
  summary: SummaryCheck;
  ready: boolean;
  /** Present exactly when `ready`. */
  payload: SubmitPayload | null;
}

function idNeed(field: "alpha" | "run" | "claim", noun: string, raw: string): Need | null {
  const value = raw.trim();
  if (value === "") return { field, text: `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}` };
  if (!ID_PATTERN.test(value)) return { field, text: `a valid ${noun} id (${ID_RULE}, up to 191)` };
  return null;
}

export function validateFields(fields: RequestFields): Validation {
  const summary = checkSummary(fields.summary);
  const needs: Need[] = [];
  const alpha = idNeed("alpha", "alpha", fields.alphaId);
  if (alpha) needs.push(alpha);
  const run = idNeed("run", "evidence run", fields.runId);
  if (run) needs.push(run);
  const claim = idNeed("claim", "methodology claim", fields.claimId);
  if (claim) needs.push(claim);
  switch (summary.state) {
    case "empty":
    case "short":
      needs.push({ field: "summary", text: `a summary of ${MIN_SUMMARY}+ characters` });
      break;
    case "long":
      needs.push({ field: "summary", text: `a summary of ${MAX_SUMMARY.toLocaleString("en-US")} characters or fewer (${summary.count.toLocaleString("en-US")} now)` });
      break;
    case "hostile":
      needs.push({ field: "summary", text: `a summary without hidden or direction-changing characters (${summary.hostile.join(", ")})` });
      break;
    case "ok":
      break;
  }
  const ready = needs.length === 0;
  return {
    needs,
    summary,
    ready,
    payload: ready
      ? { alphaId: fields.alphaId.trim(), evidenceRunId: fields.runId.trim(), methodologyClaimId: fields.claimId.trim(), summary: fields.summary.trim() }
      : null,
  };
}

export function stillNeeded(needs: readonly Need[]): string {
  return `Still needed: ${needs.map((n) => n.text).join(", ")}.`;
}

/** The counter beside the summary label: `0 · min 8`, or `2,300 · max 2,000` once it is over. */
export function summaryCounter(check: SummaryCheck): string {
  if (check.state === "long") return `${check.count.toLocaleString("en-US")} · max ${MAX_SUMMARY.toLocaleString("en-US")}`;
  return `${check.count.toLocaleString("en-US")} · min ${MIN_SUMMARY}`;
}

/* ── what the submit button says when it is dead ─────────────────────────── */

export type SubmitGate =
  | { open: true }
  | { open: false; kind: "policy" | "sending" | "settled" | "uncertain" | "held" | "incomplete"; reason: string };

export function submitGate(input: {
  validation: Validation;
  submitting: boolean;
  settled: boolean;
  writeBlockedReason: string | null | undefined;
  /** The last send was not confirmed: only a same-key retry or a discard is allowed. */
  uncertain?: boolean;
  /** Why the host holds Submit for now (a pending "Discard this request?" question); null/undefined when it does not. */
  held?: string | null;
}): SubmitGate {
  // Order matters: the policy answer is the most basic one, and "sending" must not be hidden behind a field list.
  const policy = input.writeBlockedReason?.trim();
  if (policy) return { open: false, kind: "policy", reason: policy };
  if (input.settled) return { open: false, kind: "settled", reason: "This request is already recorded. Start a new request to send another." };
  if (input.submitting) return { open: false, kind: "sending", reason: "Sending. A second click is ignored until the server answers." };
  if (input.uncertain) return { open: false, kind: "uncertain", reason: "The last send was not confirmed. Retry it with the same key, or discard it, before sending anything else." };
  const held = input.held?.trim();
  if (held) return { open: false, kind: "held", reason: held };
  if (!input.validation.ready) return { open: false, kind: "incomplete", reason: "Fill the missing fields first." };
  return { open: true };
}

/* ── prefill from the URL (read once, never submitted) ───────────────────── */

export interface Prefill {
  alphaId?: string;
  runId?: string;
  claimId?: string;
}

export interface PrefillRead {
  prefill: Prefill;
  /** One line per value that was not used, so a bad link is explained instead of silently ignored. */
  notices: readonly string[];
}

/** `?alpha=&run=&claim=` as V1 reads them, but an id that cannot be a valid id is dropped and said so. */
export function readPrefill(params: URLSearchParams): PrefillRead {
  const prefill: Prefill = {};
  const notices: string[] = [];
  const take = (name: string, key: keyof Prefill, noun: string) => {
    const raw = params.get(name);
    if (raw === null || raw.trim() === "") return;
    const value = raw.trim();
    if (ID_PATTERN.test(value)) prefill[key] = value;
    else notices.push(`The link's ${noun} was not a valid id (${ID_RULE}), so it was left empty.`);
  };
  take("alpha", "alphaId", "alpha");
  take("run", "runId", "evidence run");
  take("claim", "claimId", "methodology claim");
  return { prefill, notices };
}

/* ── pickers from the Run Library ────────────────────────────────────────── */

export interface AlphaChoice {
  id: string;
  label: string;
  /** Completed runs of this alpha among the runs LOADED; `null` for an alpha taken from the server's catalog (the count is not published). */
  runCount: number | null;
}

/**
 * FE-069: the alpha picker from the Run Library's own `filter_catalog.alphas` (the whole workspace, not the runs loaded so far). Two
 * alphas with the same name are told apart by id; the order is the label's. No count is shown: the catalog publishes none.
 */
export function catalogAlphaChoices(catalog: readonly { id: string; name: string }[]): AlphaChoice[] {
  const nameCount = new Map<string, number>();
  for (const { name } of catalog) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  return catalog
    .map<AlphaChoice>(({ id, name }) => ({ id, label: (nameCount.get(name) ?? 0) > 1 ? `${name} (${id})` : name, runCount: null }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}

/** What the server calls the scope of the create route's alpha, in words. Only a published value has a label; none is invented. */
export const ALPHA_SCOPE_LABEL: Readonly<Record<string, string>> = {
  WORKSPACE_ALL_COMPLETED_RUNS: "All completed runs in this workspace",
};

/** D8: alphas that have a COMPLETED run. Two alphas with the same name are told apart by id; nothing is guessed about permissions. */
export function alphaChoices(options: readonly RunOption[]): AlphaChoice[] {
  const byId = new Map<string, { name: string | null; runs: number }>();
  for (const o of options) {
    const seen = byId.get(o.alphaId);
    if (seen) seen.runs += 1;
    else byId.set(o.alphaId, { name: o.alphaName, runs: 1 });
  }
  const nameCount = new Map<string, number>();
  for (const { name } of byId.values()) if (name) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  const out: AlphaChoice[] = [];
  for (const [id, { name, runs }] of byId) {
    const label = name ? ((nameCount.get(name) ?? 0) > 1 ? `${name} (${id})` : name) : id;
    out.push({ id, label, runCount: runs });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "en"));
}

/** Completed runs of one alpha, newest first. */
export function runChoices(options: readonly RunOption[], alphaId: string): RunOption[] {
  return options
    .filter((o) => o.alphaId === alphaId)
    .sort((a, b) => (b.createdMs ?? 0) - (a.createdMs ?? 0));
}

export function runLabel(o: RunOption): string {
  const day = o.createdMs !== null && Number.isFinite(o.createdMs) ? new Date(o.createdMs).toISOString().slice(0, 10) : null;
  return day ? `${o.runId} · ${day}` : o.runId;
}

export type ClaimView =
  | { kind: "pick-run" }
  /** The run id is not one the list returned (typed by hand, or the list was cut): the claim is typed too. */
  | { kind: "typed" }
  | { kind: "only"; claim: RunClaim }
  | { kind: "pick"; claims: readonly RunClaim[] }
  /** `[]`: the Run Library says no claim is eligible. The server still decides a typed one. */
  | { kind: "none-listed" }
  /** `null`: it cannot list them, and says why. */
  | { kind: "cannot-list"; reason: string }
  /** `undefined`: an older response without the field. */
  | { kind: "not-published" };

export function claimView(options: readonly RunOption[], runId: string): ClaimView {
  const run = runId.trim();
  if (run === "") return { kind: "pick-run" };
  const picked = options.find((o) => o.runId === run);
  if (!picked) return { kind: "typed" };
  if (picked.claims === undefined) return { kind: "not-published" };
  if (picked.claims === null) return { kind: "cannot-list", reason: picked.claimsReason ?? "R1_CLAIMS_NOT_PUBLISHED" };
  if (picked.claims.length === 0) return { kind: "none-listed" };
  if (picked.claims.length === 1) return { kind: "only", claim: picked.claims[0]! };
  return { kind: "pick", claims: picked.claims };
}

export function claimHint(c: RunClaim): string {
  return [c.grade, c.state].filter((x): x is string => typeof x === "string" && x !== "").join(" · ");
}

/* ── the server's answer ─────────────────────────────────────────────────── */

/** The reason the HTTP port and `readOutcome` give for a 2xx whose body is not a created approval. */
export const UNREADABLE_REASON = "The create response could not be read.";

const FAILED_STATUS = ["loading", "empty", "partial", "stale", "denied", "unavailable", "insufficient_data", "terminal"] as const;

/**
 * The port is typed, but its answer crosses a boundary (a fake, a future adapter). An object that is not one of the four
 * documented shapes is a failed read, never a guess at a created approval.
 */
export function readOutcome(raw: unknown): ApprovalCreateOutcome {
  // An answer that exists but cannot be read is NOT "the server said no": the request may have been created. Uncertain.
  const unreadable: ApprovalCreateOutcome = { kind: "failed", status: "unavailable", reason: UNREADABLE_REASON, offline: true };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return unreadable;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  if (o.kind === "created" || o.kind === "replayed") {
    const approvalId = str(o.approvalId);
    if (approvalId === null) return unreadable;
    return {
      kind: o.kind,
      approvalId,
      subjectLabel: str(o.subjectLabel) ?? "",
      status: str(o.status) ?? "",
      slaDueAt: str(o.slaDueAt),
      policyVersion: str(o.policyVersion),
      quorumRequired: typeof o.quorumRequired === "number" && Number.isInteger(o.quorumRequired) && o.quorumRequired >= 0 ? o.quorumRequired : null,
      requester: str(o.requester),
    };
  }
  if (o.kind === "duplicate") return { kind: "duplicate", existingApprovalId: str(o.existingApprovalId), reason: str(o.reason) ?? "Open work for this alpha and run already exists." };
  if (o.kind === "failed") {
    const status = (FAILED_STATUS as readonly unknown[]).includes(o.status) ? (o.status as (typeof FAILED_STATUS)[number]) : "unavailable";
    return { kind: "failed", status, reason: str(o.reason) ?? "The request failed.", ...(o.offline === true ? { offline: true } : {}) };
  }
  return unreadable;
}

/** `CODE: message` as the HTTP port writes it; a reason without a code keeps `code: null`. */
export function splitReason(reason: string): { code: string | null; message: string } {
  const match = /^([A-Z][A-Z0-9_]{2,}): ([\s\S]*)$/.exec(reason);
  return match ? { code: match[1]!, message: match[2]! } : { code: null, message: reason };
}

/** One sentence per documented code (governance.service.ts createApproval, the schema's problems, the HTTP edge). Unknown codes get no invented sentence. */
const CODE_SENTENCE: Readonly<Record<string, string>> = {
  EVIDENCE_RUN_NOT_ELIGIBLE: "That run is not eligible for this alpha and methodology claim.",
  CLAIM_NOT_ELIGIBLE: "The methodology claim is not eligible for this run.",
  EVIDENCE_RUN_NOT_FOUND: "The server does not know that evidence run.",
  EVIDENCE_ARTIFACT_CHANGED: "The run's frozen artifact changed after you picked it. Pick the run again.",
  REQUEST_KEY_PAYLOAD_CONFLICT: "An earlier submit with the same key had different content, so this one was refused. Start a new request.",
  REQUEST_KEY_CONFLICT: "An earlier submit with the same key had different content, so this one was refused. Start a new request.",
  REQUEST_KEY_REUSED: "An earlier submit with the same key had different content, so this one was refused. Start a new request.",
  APPROVAL_CREATE_SERIALIZATION_CONFLICT: "Another request for this alpha and run was being created at the same moment. Check the queue, then try again.",
  INVALID_APPROVAL_CREATE_REQUEST: "The server could not accept the fields as sent. Check the ids and the summary.",
  WORKSPACE_ACCESS_DENIED: "You are not a member of the workspace this request would be created in.",
  WORKSPACE_NOT_FOUND: "The workspace this request would be created in was not found.",
  SESSION_REQUIRED: "Your session ended. Sign in again, then send the request.",
  CSRF_INVALID: "The page's security token no longer matches. Reload the page and send the request again.",
  ORIGIN_DENIED: "The server refused the request's origin.",
};

export interface Refusal {
  code: string | null;
  /** The plain sentence for the code; null when the code has none (the server's words are then the headline). */
  sentence: string | null;
  /** The server's own message, with hostile characters spelled out. */
  message: string;
  /** `CODE: message` as received (hostile characters spelled out): what Provenance prints. */
  verbatim: string;
}

export function refusalOf(reason: string): Refusal {
  const { code, message } = splitReason(reason);
  return { code, sentence: code !== null ? CODE_SENTENCE[code] ?? null : null, message: showable(message), verbatim: showable(reason) };
}

/** What the screen shows for a failed outcome. */
export type FailureKind = "denied" | "uncertain" | "refused" | "unavailable";

const DENIED_CODES: ReadonlySet<string> = new Set(["WORKSPACE_ACCESS_DENIED", "SESSION_REQUIRED", "CSRF_INVALID", "ORIGIN_DENIED"]);

export function failureKind(outcome: Extract<ApprovalCreateOutcome, { kind: "failed" }>): FailureKind {
  // Uncertain = the request may have been created: the network dropped, the answer timed out (408), the server failed after
  // it may have acted (5xx), or a 2xx came back unreadable. Only a definite refusal leaves the key free to be replaced.
  if (outcome.offline === true || outcome.reason === UNREADABLE_REASON) return "uncertain";
  const { code } = splitReason(outcome.reason);
  const http = code !== null ? /^HTTP_(\d{3})$/.exec(code) : null;
  if (http !== null && (http[1] === "408" || http[1]![0] === "5")) return "uncertain";
  if (outcome.status === "denied" || (code !== null && DENIED_CODES.has(code))) return "denied";
  // A typed answer from the server is a refusal. A bare sentence from the port (no delivery policy) or an HTTP_4xx without a typed code is "could not": the server did not create it.
  if (code !== null && !code.startsWith("HTTP_")) return "refused";
  return "unavailable";
}

/* ── routes ──────────────────────────────────────────────────────────────── */

/** An approval id that is safe to put in a path. The V1 route helper takes any string; a hostile id must not reach a link. */
export function safeApprovalId(id: string | null): string | null {
  return id !== null && /^[A-Za-z0-9._:-]{1,191}$/.test(id) ? id : null;
}

export const QUEUE_HREF = "/governance/approvals";
export const RUN_LIBRARY_HREF = "/research/quantbt/runs";
export const NEW_REQUEST_HREF = "/governance/approvals/new";

/** The house instant `19 Oct 12:04Z` from an ISO instant; null when the text is not one (never a made-up time). */
export function dueText(iso: string | null): string | null {
  if (iso === null) return null;
  const ms = readUtcEpochMs(Date.parse(iso));
  return ms === null ? null : formatAsOf(ms);
}

/** The key lifecycle's identity: same fields, same intent. */
export function payloadIdentity(p: SubmitPayload): string {
  return JSON.stringify([p.alphaId, p.evidenceRunId, p.methodologyClaimId, p.summary]);
}
