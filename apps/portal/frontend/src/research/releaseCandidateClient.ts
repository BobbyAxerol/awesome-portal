/**
 * Research Loop — Release Candidate client (P21, Screen 11).
 *
 * Four generated operations and nothing else:
 *
 *  - `researchReleaseCandidateComposeGetV1` — the bounded composition: 17
 *    server-built fields (and the identical YAML list), 12 evidence rows, the
 *    rail, the taxonomy, the draft and the local-seal facts.
 *  - `researchReleaseCandidateDraftPatchV1` — the caller's two declarations,
 *    fenced by the draft revision and the source fingerprint the server gave
 *    (body CAS, not `If-Match`: that is the contract P21 published).
 *  - `researchReleaseCandidateLocalSealCreateV1` — one immutable Portal-local
 *    pack, only from an explicit, confirmed click. Idempotent on the server.
 *  - `researchReleaseCandidatePackGetV1` — the sealed pack, read-only.
 *
 * P21 stops before publication. `actions.publish` and `mirror` are carried as
 * the server sent them and never acted on here: there is no publish call in
 * this module, and there must not be one until P22 publishes its own contract.
 *
 * No value is computed, sorted, re-hashed or compared for a verdict. The only
 * string equality below is identity bookkeeping (was the rc_ id the seal
 * returned the one already on screen?), which says "replayed", not "valid".
 */

import type { components as RcComponents } from "@portal/contracts-research-release-candidate";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import { lineageHref } from "./lineageClient";

type RcSchemas = RcComponents["schemas"];

export type RcCompose = RcSchemas["ComposeResponseP21"];
export type RcField = RcSchemas["Field"];
export type RcPackItem = RcSchemas["PackItem"];
export type RcPackKey = RcPackItem["key"];
export type RcAvailability = RcSchemas["Availability"];
export type RcDraft = RcSchemas["Draft"];
export type RcLocalSeal = RcSchemas["LocalSeal"];
export type RcRailNode = RcSchemas["ComposeRailNode"];
export type RcTaxonomyRow = RcSchemas["ComposeTaxonomyRow"];
export type RcCertificationAxis = RcSchemas["CertificationAxis"];
export type RcDraftPatch = RcSchemas["DraftPatch"];
export type RcSealRequest = RcSchemas["SealRequest"];
export type RcSealResponse = RcSchemas["SealResponse"];
export type RcPack = RcSchemas["PackResponse"];

/**
 * The publish gate as P21 types it, widened to what P22's parked draft
 * publishes (`enabled: boolean`, `blocked_reason: string | null`), so the
 * screen renders either without a cast. The screen still never publishes.
 */
export interface RcPublishGate {
  enabled: boolean;
  blocked_reason: string | null;
}

const RUNS = "/api/v1/quantbt/runs";
const PACKS = "/api/v1/research/release-candidates";

/** Screen 11's product route for a run. */
export function releaseCandidateHref(runId: string, options: { pack?: string | null } = {}): string {
  const base = `/research/quantbt/runs/${encodeURIComponent(runId)}/release-candidate`;
  return options.pack ? `${base}#pack=${encodeURIComponent(options.pack)}` : base;
}

/** The `#pack=` fragment a Run Library rc chip deep-links with, or null. */
export function packFromHash(hash: string): string | null {
  const match = /(?:^#|&)pack=([^&]+)/.exec(hash);
  if (!match) return null;
  const value = decodeURIComponent(match[1]!);
  return /^rc_[0-9A-HJKMNP-TV-Z]{26}$/.test(value) ? value : null;
}

function query(workspaceId?: string): string {
  if (!workspaceId) return "";
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  return `?${params.toString()}`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const write = method !== "GET";
  /* The CSRF proof rides on the two writes only. */
  const csrf = write ? csrfTokenFromCookie() : null;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(write ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    let code: string | null = null;
    let message = "";
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<RcSchemas["Problem"]>;
      code = problem?.error?.code ?? null;
      message = problem?.error?.message ?? "";
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: the status is still typed */
    }
    /* The server's sentence is diagnostics (the notice's details), never the notice. */
    throw new PortalApiError(message || `${response.status} ${response.statusText}`, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

function runPath(runId: string): string {
  return `${RUNS}/${encodeURIComponent(runId)}/release-candidate`;
}

export const releaseCandidateApi = {
  /** `researchReleaseCandidateComposeGetV1` */
  compose: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<RcCompose>(`${runPath(runId)}${query(options.workspaceId)}`, { signal: options.signal }),

  /** `researchReleaseCandidateDraftPatchV1` — both declarations, every time (the server replaces both). */
  patchDraft: (runId: string, body: RcDraftPatch, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<RcCompose>(`${runPath(runId)}/draft${query(options.workspaceId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      signal: options.signal,
    }),

  /** `researchReleaseCandidateLocalSealCreateV1` — only after the reader confirms. */
  seal: (runId: string, body: RcSealRequest, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<RcSealResponse>(`${runPath(runId)}/seal${query(options.workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: options.signal,
    }),

  /** `researchReleaseCandidatePackGetV1` */
  pack: (releaseCandidateId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<RcPack>(`${PACKS}/${encodeURIComponent(releaseCandidateId)}${query(options.workspaceId)}`, {
      signal: options.signal,
    }),
} as const;

/* -------------------------------------------------------------------------
 * Declarations — the only input on the screen
 * ---------------------------------------------------------------------- */

export type DeclarationKey = "known_limitations" | "proposed_use_restrictions";

export const DECLARATION_KEYS: readonly DeclarationKey[] = ["known_limitations", "proposed_use_restrictions"];

/** Which pack row carries which declaration (contract order 10 and 12). */
export const DECLARATION_OF_ROW: Partial<Record<RcPackKey, DeclarationKey>> = {
  KNOWN_LIMITATIONS_WAIVERS: "known_limitations",
  PROPOSED_USE_RESTRICTIONS: "proposed_use_restrictions",
};

/** `DraftPatch` bounds, restated so a message can name the field before a request is sent. */
export const DECLARATION_MAX = 4096;

export interface DeclarationIssue {
  /** The request-body path the message is about: `known_limitations`, or `(body)` for the pair. */
  path: string;
  message: string;
}

/**
 * The contract's own rules for a PATCH body, checked before sending so the
 * message can name its field. The server stays the authority: a body that
 * passes here can still be refused, and that refusal is shown as it came.
 */
export function declarationIssues(values: Record<DeclarationKey, string>): DeclarationIssue[] {
  const issues: DeclarationIssue[] = [];
  for (const key of DECLARATION_KEYS) {
    const value = values[key];
    if (value.length > DECLARATION_MAX) {
      issues.push({ path: key, message: `at most ${DECLARATION_MAX.toLocaleString("en-US")} characters (now ${value.length.toLocaleString("en-US")})` });
    } else if (value.length > 0 && value.trim().length === 0) {
      issues.push({ path: key, message: "only whitespace — write the declaration or leave it empty" });
    }
  }
  if (DECLARATION_KEYS.every((key) => values[key].trim().length === 0)) {
    issues.push({ path: "(body)", message: "at least one declaration is required to save the draft" });
  }
  return issues;
}

/** An empty box is `null` on the wire (the contract's "not declared"); text is sent exactly as typed. */
export function declarationValue(value: string): string | null {
  return value.trim().length === 0 ? null : value;
}

/* -------------------------------------------------------------------------
 * YAML — the server's 17 lines, joined, nothing added
 * ---------------------------------------------------------------------- */

/** One copy line: `key: value`, `null` for an absent value. No comment, no reorder. */
export function yamlLine(field: RcField): string {
  return `${field.key}: ${field.value ?? "null"}`;
}

export function yamlText(fields: readonly RcField[]): string {
  return fields.map(yamlLine).join("\n");
}

/* -------------------------------------------------------------------------
 * Evidence row → the screen that proves it
 * ---------------------------------------------------------------------- */

/**
 * The browser owns routing (`screenRoutes.ts`): a server string never becomes
 * a URL. Each row resolves by its contract key to a route this build serves,
 * and only when the server says the row has a source screen (`href !== null`).
 * `ALPHA_VERSION_PASSPORT` is Alpha 360°, outside this build, and never links.
 */
export function packSourceRoute(item: RcPackItem, runId: string, alphaId: string | null): string | null {
  if (item.source.href === null) return null;
  const run = `/research/quantbt/runs/${encodeURIComponent(runId)}`;
  switch (item.key) {
    case "ENGINE_CAPABILITY_BACKEND":
      return "/research/quantbt/atlas";
    case "DATASET_UNIVERSE_SNAPSHOTS":
    case "EXECUTION_ASSUMPTIONS":
      return `${run}/split`;
    case "METHODOLOGY_CLAIM":
      return `${run}/evidence#stage=claim`;
    case "SELECTED_PARAMS_LINEAGE":
      return `${run}/search`;
    case "FINAL_AUDIT_REPLAY":
      return `${run}/execute`;
    case "METRICS_SEMANTICS":
      return `${run}/report`;
    case "REPRODUCIBILITY_PARITY_CHECKSUMS":
      return `${run}/freeze`;
    case "ROBUSTNESS_PARAM_STABILITY_REGIME":
      return alphaId ? `/research/quantbt/alphas/${encodeURIComponent(alphaId)}/compare` : null;
    default:
      return null;
  }
}

/** Rail nodes that open a screen: the Alpha's lineage (10) and the run's hub (04). */
export function railRoute(node: RcRailNode, compose: RcCompose): string | null {
  if (node.tone === "dim") return null;
  if (node.key === "alpha" && compose.run.binding) return lineageHref(compose.run.binding.alpha_id);
  if (node.key === "run") return `/research/quantbt/runs/${encodeURIComponent(compose.run_id)}/evidence`;
  return null;
}

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

/** Spec 11 §2.1, verbatim. */
export const RC_TITLE = "Release Candidate — compose, pin, publish";
export const RC_SUBTITLE =
  "A run is evidence; what travels is the release candidate. Publish writes one immutable record — the Approval Inbox reads it. Nothing here recomputes or approves.";
/** The P21 boundary, said once under the hi-fi subtitle. */
export const RC_P21_NOTE =
  "In this build the verb is the local seal: it freezes a Portal-local evidence pack. Publishing to the Approval Inbox is not commissioned yet.";

/** Spec 11 §2.2, verbatim. */
export const NOT_PUBLISHABLE_TEXT_BEFORE = "This run was submitted without an ";
export const NOT_PUBLISHABLE_TEXT_AFTER =
  " binding — a scratch research run. It stays fully usable as evidence for you, but no release candidate can be composed from it. Bind a version at ";

export const IDENTITY_LABEL = "1 · identity & lineage — the unit that travels";
export const IDENTITY_NOTE = "spec v0.7 §3.1 — binding goes through rc_, never alpha↔run directly";
export const PACK_LABEL = "2 · evidence pack — 12 items of gate R1, each linked to the screen that proves it";
export const PACK_FOOTER =
  "DEGRADED travels as DEGRADED — the reviewer sees it. MISSING blocks the local seal. The two INPUT rows are the researcher's own signed declarations.";
export const YAML_LABEL = "3 · record preview — the 17 lines the local seal freezes, exactly as the server built them";
export const RULES_FOOTER =
  "The promotable unit is rc_, never a bare run_id. Digests pinned at the local seal are verified downstream. This screen never computes, approves, or mutates a sealed record — its one verb here is the local seal.";

/** Spec 11 §7 chip titles, verbatim. */
export const CLAIM_CHIP_TITLE = "methodology claim ceiling — holdout locked, unlock lifts B → A";
export const ENGINE_CHIP_TITLE =
  "engine execution-contract certification (0–4) — separate axis from the methodology claim";

/** Spec 11 §2.4 status titles, verbatim; MISSING says what it does in P21. */
export const STATUS_TITLE: Record<RcPackItem["status"], string> = {
  COMPLETE: "artifact present, digest pinned",
  DEGRADED: "partial artifact — travels as DEGRADED, reviewer sees it",
  INPUT: "researcher declaration — part of the signed pack",
  MISSING: "required evidence absent — blocks the local seal",
};

/** Spec 11 §2.5 local-seal copy, adapted from the hi-fi's publish card (P21 boundary). */
export const SEAL_LABEL = "local seal";
export const SEAL_BUTTON = "Local seal evidence pack";
export const SEAL_TEXT =
  "The local seal freezes this exact combination — the 17 fields, the 12 rows and your two declarations — as one immutable Portal-local pack and assigns its rc_ id. It creates no account, no allocation, delivers nothing and does not start Paper.";
export const SEAL_CONFIRM =
  "Seal now? The pack cannot be edited afterwards. A later change to a declaration or to the evidence composes a new candidate; this one stays as sealed.";
export const SEALED_NOTE =
  "Any further change to code, params, or methodology creates a NEW candidate and supersedes this one — this record itself never mutates.";

/** The publish half of the hi-fi, typed as not commissioned. */
export const PUBLISH_LABEL = "publish — not commissioned in this build";
export const PUBLISH_BUTTON = "Publish release candidate";
export const PUBLISH_TEXT =
  "Publishing will write the sealed pack to the portal governance store for the Approval Inbox. That step belongs to a later phase; nothing on this screen publishes, and no governance state is shown until a real record exists.";
export const SOD_NOTE =
  "Separation of duties: the publisher cannot be the sole R1 approver where policy requires it. R1 approval default expiry: approved_at + 90d (policy default — confirm).";

/** Spec 11 §2.5 mirror ghost, verbatim. */
export const MIRROR_LABEL = "what the approval inbox sees";
export const MIRROR_NOTE_RIGHT = "read model · decisions live on the Execution side";
export const MIRROR_SUBJECT = "— not yet published";
export const MIRROR_SLA = "SLA starts at publish";
export const MIRROR_OUTCOMES =
  "decision outcomes: APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED";
export const MIRROR_GHOST_NOTE =
  "Preview of the inbox row this publish will create on the Execution side. It stays a ghost until the record exists — this screen never fakes a governance state.";

/** Spec 11 §7, verbatim. */
export const CONFLICT_COPY = "evidence changed since composing — review the pack";
export const DENIED_COPY = "Access changed — reauthenticate or ask a workspace administrator.";
export const UNAVAILABLE_COPY = "Release candidate service is temporarily unavailable — your draft is kept locally.";

/**
 * Sentences for the reason codes P21 publishes. The code stays beside the
 * sentence (`data-reason-code`); an unknown code shows alone.
 */
export const RC_REASON_SENTENCES: Record<string, string> = {
  P21_SCRATCH_RUN_UNBOUND: "The run has no alpha_version binding, so no candidate can be sealed from it.",
  P21_ALPHA_VERSION_NOT_ACTIVE: "The bound Alpha version is not ACTIVE.",
  P21_REFERENCED_SOURCE_INTEGRITY_FAILED:
    "A referenced source identity is absent, malformed or disagrees with another copy, so nothing can be sealed from it.",
  P21_REQUIRED_EVIDENCE_MISSING: "resolve MISSING rows first",
  P21_RESEARCHER_DECLARATIONS_REQUIRED: "Both declarations must be saved before the local seal.",
  P21_LOCAL_SEAL_NOT_CREATED: "No local pack has been sealed from this run.",
  P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT:
    "The sealed pack was frozen against an earlier source fingerprint; the evidence has changed since.",
  P21_ASSIGNED_ON_LOCAL_SEAL: "assigned on local seal",
  P21_RESEARCHER_DECLARATION_REQUIRED: "not declared yet",
  P21_SOURCE_DEGRADED_EVIDENCE: "partial evidence — travels as DEGRADED",
  P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED: "no issued methodology certificate",
  P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED: "no engine execution-contract certificate",
  /* W7 · the retained (Delta WFO) lane names its own reasons. */
  P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED: "claim retained, no issued methodology certificate — travels as DEGRADED",
  P21_RETAINED_CURRENT_SOURCE_NOT_SEALED: "the run's retained current source is not sealed yet",
  P21_RETAINED_CLAIM_FACTS_NOT_PUBLISHED: "the retained seal predates the engine's claim facts",
  P21_RETAINED_CHILD_AUDIT_MISMATCH: "a fold's out-of-sample child is not the frozen selection",
  P21_RETAINED_PARAMETER_DIGEST_MISMATCH: "the retained selection and the hand-off cursor name different parameters",
  P21_RETAINED_REPORT_NOT_SEALED: "no report is sealed from the current retained evidence",
  P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED: "no published predecessor — publication is not commissioned yet",
  P22_PUBLICATION_NOT_COMMISSIONED: "publication to the Approval Inbox is not commissioned in this build",
};

export function rcReasonSentence(code: string | null | undefined): string | null {
  return code && code in RC_REASON_SENTENCES ? RC_REASON_SENTENCES[code]! : null;
}
