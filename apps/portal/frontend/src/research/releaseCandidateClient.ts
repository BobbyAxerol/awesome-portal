/**
 * Research Loop — Release Candidate client (P21 + P22, Screen 11).
 *
 * Six operations, each named after its generated operation and nothing else:
 *
 *  - `researchReleaseCandidateComposeGetV1` — one bounded composition for one
 *    run: rail, taxonomy, 17 server-built fields (the YAML preview is the same
 *    list), 12 evidence-pack rows, their counts, the local-seal state and the
 *    action gate. The browser prints it; it never assembles a field, counts a
 *    status, diffs against a predecessor or decides whether a seal may happen.
 *  - `researchReleaseCandidateDraftPatchV1` — the caller's two declarations,
 *    fenced by the draft revision and the source fingerprint the composition
 *    returned (compare-and-swap). A `409` means the fence moved.
 *  - `researchReleaseCandidateLocalSealCreateV1` — one Portal-local immutable
 *    evidence pack. Idempotent: asking again for the same draft answers `201`
 *    with the same identity. A local seal is not a publication.
 *  - `researchReleaseCandidatePackGetV1` — the frozen pack by its identity.
 *  - `researchReleaseCandidatePublicationGetV1` (P22) — the durable publication
 *    state of one sealed candidate, its `may_publish` / `blocked_reason` gate
 *    and, once delivered, the R1 approval read under the caller's own
 *    authority. It is the only mirror: there is no `/mirror` route.
 *  - `researchReleaseCandidatePublishV1` (P22) — one explicit, confirmed publish
 *    of the current local seal, fenced by its pack digest. The browser sends
 *    the digest and the methodology claim the server listed; the idempotency
 *    key and the R1 summary are the server's (it derives both from the sealed
 *    pack). The answer is the same publication read.
 *
 * The contract declares no ETag and no `304`, so no validator is sent. Every
 * write carries the same-origin CSRF proof; the reads carry nothing extra.
 * The server's `error.message` is never rendered: the screen speaks from the
 * copy below, keyed by status and typed code, and shows the code and request
 * id only.
 */

import type { components as ReleaseCandidateComponents } from "@portal/contracts-research-release-candidate";
import type { components as PublicationComponents } from "@portal/contracts-research-release-candidate-publication";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { lineageHref, toLineageRefusal, type LineageRefusal } from "./lineageClient";
import { rememberRunLabel } from "./runLabels";
import type { ResearchState } from "./state";
import { REFUSAL_COPY } from "./researchRefusal";

type RcSchemas = ReleaseCandidateComponents["schemas"];
type PublicationSchemas = PublicationComponents["schemas"];

export type RcCompose = RcSchemas["ComposeResponseP21"];
export type RcAvailability = RcSchemas["Availability"];
export type RcRailNode = RcSchemas["ComposeRailNode"];
export type RcTaxonomyRow = RcSchemas["ComposeTaxonomyRow"];
export type RcField = RcSchemas["Field"];
export type RcPackItem = RcSchemas["PackItem"];
export type RcPackCounts = RcSchemas["ComposePackCounts"];
export type RcLocalSeal = RcSchemas["LocalSeal"];
export type RcDraft = RcSchemas["Draft"];
export type RcDraftPatch = RcSchemas["DraftPatch"];
export type RcSealRequest = RcSchemas["SealRequest"];
export type RcSealResponse = RcSchemas["SealResponse"];
export type RcPack = RcSchemas["PackResponse"];
export type RcCertificationAxis = RcSchemas["CertificationAxis"];
export type RcPublishedComparison = RcSchemas["PublishedComparison"];
export type RcPackKey = RcPackItem["key"];

/** P22 — the one publication read (and the publish answer). */
export type RcPublication = PublicationSchemas["PublicationResponse"];
export type RcApproval = PublicationSchemas["ApprovalMirror"];
export type RcApprovalCondition = PublicationSchemas["Condition"];
export type RcPublishRequest = PublicationSchemas["PublishRequest"];
/** FG-05: `researchAlphaVersionPublicationGetV1` — one Alpha version's latest delivered publication, or its typed absence. */
export type RcAlphaVersionPublication = PublicationSchemas["AlphaVersionPublicationResponse"];

const RUNS = "/api/v1/quantbt/runs";
const PACKS = "/api/v1/research/release-candidates";
const ALPHA_VERSIONS = "/api/v1/research/alpha-versions";

/** Reason codes the P21/P22 services publish, named once. */
export const RC_REASON = {
  scratchUnbound: "P21_SCRATCH_RUN_UNBOUND",
  versionNotActive: "P21_ALPHA_VERSION_NOT_ACTIVE",
  integrityFailed: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED",
  evidenceMissing: "P21_REQUIRED_EVIDENCE_MISSING",
  declarationsRequired: "P21_RESEARCHER_DECLARATIONS_REQUIRED",
  declarationRequired: "P21_RESEARCHER_DECLARATION_REQUIRED",
  assignedOnSeal: "P21_ASSIGNED_ON_LOCAL_SEAL",
  priorFingerprint: "P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT",
  sealNotCreated: "P21_LOCAL_SEAL_NOT_CREATED",
  localSealRequired: "P22_LOCAL_SEAL_REQUIRED",
  alreadyDelivered: "P22_ALREADY_DELIVERED",
  intakeDisabled: "P22_PUBLICATION_INTAKE_DISABLED",
} as const;

/* -------------------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------------- */

function query(workspaceId?: string): string {
  if (!workspaceId) return "";
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  return `?${params.toString()}`;
}

export function composePath(runId: string, workspaceId?: string): string {
  return `${RUNS}/${encodeURIComponent(runId)}/release-candidate${query(workspaceId)}`;
}

export function draftPath(runId: string, workspaceId?: string): string {
  return `${RUNS}/${encodeURIComponent(runId)}/release-candidate/draft${query(workspaceId)}`;
}

export function sealPath(runId: string, workspaceId?: string): string {
  return `${RUNS}/${encodeURIComponent(runId)}/release-candidate/seal${query(workspaceId)}`;
}

export function packPath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}${query(workspaceId)}`;
}

export function publicationPath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}/publication${query(workspaceId)}`;
}

/** FG-05 (Codex P22 closeout, S01/S02): the Alpha-version lookup; the browser never scans candidates. */
export function alphaVersionPublicationPath(alphaVersionId: string, workspaceId?: string): string {
  return `${ALPHA_VERSIONS}/${encodeURIComponent(alphaVersionId)}/publication${query(workspaceId)}`;
}

export function publishPath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}/publish${query(workspaceId)}`;
}

/** Screen 11's composition route (PLAN P21 §2.1). */
export function releaseCandidateHref(runId: string): string {
  return `/research/quantbt/runs/${encodeURIComponent(runId)}/release-candidate`;
}

/** A sealed pack's own read-only route (VD-P21-09); the 01 rc chip of a LOCAL_SEAL opens it. */
export function releaseCandidatePackHref(releaseCandidateId: string): string {
  return `/research/quantbt/release-candidates/${encodeURIComponent(releaseCandidateId)}`;
}

/**
 * W5c deep links (`…/release-candidate#pack=rc_…`) are still honoured: the
 * composition route forwards them to the pack route. Only a well-formed rc id
 * is accepted — the hash is never a URL.
 */
export function packFromHash(hash: string): string | null {
  const match = /(?:^#|&)pack=([^&]+)/.exec(hash);
  if (!match) return null;
  let value: string;
  try {
    value = decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
  return /^rc_[0-9A-HJKMNP-TV-Z]{26}$/.test(value) ? value : null;
}

/* -------------------------------------------------------------------------
 * Transport
 * ---------------------------------------------------------------------- */

async function call<T>(path: string, init: { method?: "GET" | "PATCH" | "POST"; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const write = method !== "GET";
  /* The CSRF proof rides on the writes and on nothing else. */
  const csrf = write ? csrfTokenFromCookie() : null;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    signal: init.signal,
    headers: {
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(write ? { "content-type": "application/json" } : {}),
    },
    ...(write ? { body: JSON.stringify(init.body ?? {}) } : {}),
  });
  if (!response.ok) {
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<RcSchemas["Problem"]>;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: the status is still typed */
    }
    /* The server's prose is never rendered (CG-P21-04). */
    throw new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

type Options = { workspaceId?: string; signal?: AbortSignal };

export const releaseCandidateApi = {
  /** `researchReleaseCandidateComposeGetV1` */
  compose: (runId: string, options: Options = {}) =>
    call<RcCompose>(composePath(runId, options.workspaceId), { signal: options.signal }).then((answer) => {
      if (answer.run_id === runId) rememberRunLabel(answer.run_id, answer.display_label);
      return answer;
    }),

  /** `researchReleaseCandidateDraftPatchV1` — only ever from an explicit save. */
  patchDraft: (runId: string, body: RcDraftPatch, options: Options = {}) =>
    call<RcCompose>(draftPath(runId, options.workspaceId), { method: "PATCH", body, signal: options.signal }),

  /** `researchReleaseCandidateLocalSealCreateV1` — only ever from a confirmed click. */
  seal: (runId: string, body: RcSealRequest, options: Options = {}) =>
    call<RcSealResponse>(sealPath(runId, options.workspaceId), { method: "POST", body, signal: options.signal }),

  /** `researchReleaseCandidatePackGetV1` */
  pack: (releaseCandidateId: string, options: Options = {}) =>
    call<RcPack>(packPath(releaseCandidateId, options.workspaceId), { signal: options.signal }).then((answer) => {
      rememberRunLabel(answer.run_id, answer.display_label);
      return answer;
    }),

  /** `researchReleaseCandidatePublicationGetV1` (P22): state, gate and the R1 mirror. */
  publication: (releaseCandidateId: string, options: Options = {}) =>
    call<RcPublication>(publicationPath(releaseCandidateId, options.workspaceId), { signal: options.signal }),

  /** `researchAlphaVersionPublicationGetV1` (P22) — Screens 01 and 02, one read per Alpha version, never polled. */
  alphaVersionPublication: (alphaVersionId: string, options: Options = {}) =>
    call<RcAlphaVersionPublication>(alphaVersionPublicationPath(alphaVersionId, options.workspaceId), { signal: options.signal }),

  /** `researchReleaseCandidatePublishV1` (P22) — only ever from a confirmed click. */
  publish: (releaseCandidateId: string, body: RcPublishRequest, options: Options = {}) =>
    call<RcPublication>(publishPath(releaseCandidateId, options.workspaceId), { method: "POST", body, signal: options.signal }),
} as const;

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

export const RC_WITHHELD_WORDS: Record<RcAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  PARTIAL: "partial",
  NOT_APPLICABLE: "not applicable",
};

export function reasonOf(availability: RcAvailability): string {
  return availability.reason_code ?? availability.state;
}

/**
 * One sentence per reason code the P21/P22 services publish, shown beside the
 * code (the code is always printed; an unknown code prints alone). Spec 11 §7
 * copy is verbatim where it exists ("resolve MISSING rows first").
 */
export const RC_REASON_SENTENCES: Readonly<Record<string, string>> = {
  /* P21 seal gate */
  P21_SCRATCH_RUN_UNBOUND: "bind alpha_version first — a scratch run cannot be sealed",
  P21_ALPHA_VERSION_NOT_ACTIVE: "the bound alpha_version is not ACTIVE",
  P21_REFERENCED_SOURCE_INTEGRITY_FAILED: "a referenced source is absent, malformed or disagrees with another copy — nothing can be sealed from it",
  P21_REQUIRED_EVIDENCE_MISSING: "resolve MISSING rows first",
  P21_RESEARCHER_DECLARATIONS_REQUIRED: "complete and save the two declarations first",
  P21_RESEARCHER_DECLARATION_REQUIRED: "not declared yet",
  P21_LOCAL_SEAL_NOT_CREATED: "no local pack has been sealed from this run",
  P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT: "the sealed pack was frozen against earlier evidence — the source has changed since",
  P21_ASSIGNED_ON_LOCAL_SEAL: "assigned on local seal",
  P21_SOURCE_DEGRADED_EVIDENCE: "partial evidence — travels as DEGRADED",
  P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED: "no issued methodology certificate",
  P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED: "no engine execution-contract certificate",
  /* W7 retained (Delta WFO) lane */
  P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED: "claim retained, no issued methodology certificate — travels as DEGRADED",
  P21_RETAINED_CURRENT_SOURCE_NOT_SEALED: "the run's retained current source is not sealed yet",
  P21_RETAINED_CLAIM_FACTS_NOT_PUBLISHED: "the retained source publishes no methodology claim facts for this run",
  P21_RETAINED_CHILD_AUDIT_MISMATCH: "the per-fold OOS child audit does not match the frozen candidate",
  P21_RETAINED_PARAMETER_DIGEST_MISMATCH: "the retained selection's parameter digest differs from the hand-off cursor",
  P21_RETAINED_REPORT_NOT_SEALED: "no report was sealed from the retained revision",
  /* P22 publication (compose affordance and publication read) */
  P22_LOCAL_SEAL_REQUIRED: "seal the evidence pack first",
  P22_NOT_PUBLISHED: "not published yet",
  P22_NO_PUBLISHED_PREDECESSOR: "no earlier candidate of this Alpha was published",
  P22_PUBLICATION_INTAKE_DISABLED: "publication intake is switched off on this deployment — the sealed pack is kept",
  P22_PUBLICATION_PENDING: "a publication was recorded and has not settled",
  P22_PUBLICATION_OUTCOME_UNKNOWN: "the governance store did not confirm the last attempt",
  P22_PUBLICATION_REFUSED: "the governance store refused this publication — nothing was attached",
  P22_GOVERNANCE_REFUSED: "the governance store refused this publication — nothing was attached",
  P22_ALREADY_DELIVERED: "published — immutable",
  P22_MIRROR_READ_ON_PUBLICATION_ROUTE: "the approval mirror is read live from the publication",
  P22_SOURCE_NOT_CHECKED: "the governance source was not checked",
  P22_PACK_INTEGRITY_FAILED: "the sealed pack no longer matches its digest",
  P22_FINAL_AUDIT_NOT_LINKED: "the sealed pack names no final audit run bound to an Alpha version",
  P22_RELEASE_CANDIDATE_SUPERSEDED: "a newer candidate was sealed for this run",
  P22_RELEASE_CANDIDATE_CURRENTNESS_UNKNOWN: "whether this is the run's newest candidate could not be read",
  P22_CURRENT_SOURCE_CHANGED: "the evidence changed since this pack was sealed — seal again",
  P22_GOVERNANCE_SOURCE_UNAVAILABLE: "the governance run mirror did not answer",
  P22_ALPHA_MAPPING_MISMATCH: "the governance run mirror names another Alpha or run",
  P22_RUN_NOT_TERMINAL: "the governance run mirror does not show this run as completed",
  P22_SOURCE_FACTS_PARTIAL: "the governance run mirror is missing an artifact hash, schema or methodology claim",
  P22_METHODOLOGY_CLAIM_NOT_PUBLISHED: "the chosen methodology claim is not one the governance store lists",
  P22_PUBLICATION_OWNED_BY_ANOTHER_ACTOR: "another researcher recorded this publication; only they may retry it",
  P22_SOURCE_PIN_CHANGED: "the pinned artifact changed since the publication was recorded",
  P22_SAVED_REQUEST_INVALID: "the recorded publication request is no longer valid",
  P22_DOWNSTREAM_OUTCOME_UNKNOWN: "the governance store did not confirm the last attempt",
  P22_APPROVAL_PIN_UNVERIFIED: "the approval was created but its evidence pin could not be verified yet",
};

export function rcReasonSentence(code: string | null | undefined): string | null {
  return code && Object.prototype.hasOwnProperty.call(RC_REASON_SENTENCES, code) ? RC_REASON_SENTENCES[code]! : null;
}

/** One YAML line exactly as the preview prints it and `copy yaml` copies it. */
export function yamlValue(field: RcField): string {
  return field.value ?? `null  # ${reasonOf(field.availability)}`;
}

/** `copy yaml`: the server's list, joined. Nothing is added, reordered or dropped. */
export function yamlText(fields: readonly RcField[]): string {
  return fields.map((field) => `${field.key}: ${yamlValue(field)}`).join("\n");
}

export type DeclarationKey = "known_limitations" | "proposed_use_restrictions";
export const DECLARATION_KEYS: readonly DeclarationKey[] = ["known_limitations", "proposed_use_restrictions"];
export const DECLARATION_MAX = 4096;
export const DECLARATION_OF_ROW: Partial<Record<RcPackKey, DeclarationKey>> = {
  KNOWN_LIMITATIONS_WAIVERS: "known_limitations",
  PROPOSED_USE_RESTRICTIONS: "proposed_use_restrictions",
};
export interface DeclarationIssue {
  path: string;
  message: string;
}
/**
 * The draft body the contract accepts (`DraftPatch`), checked before sending
 * so the reader sees the field path; the server stays authoritative.
 */
export function declarationIssues(values: Record<DeclarationKey, string>): DeclarationIssue[] {
  const issues: DeclarationIssue[] = [];
  for (const key of DECLARATION_KEYS) {
    const value = values[key];
    if (value.length > DECLARATION_MAX) {
      issues.push({ path: key, message: `at most ${DECLARATION_MAX} characters (now ${value.length})` });
    } else if (value.length > 0 && value.trim().length === 0) {
      issues.push({ path: key, message: "only whitespace — write the declaration or leave it empty" });
    }
  }
  if (DECLARATION_KEYS.every((key) => values[key].trim().length === 0)) {
    issues.push({ path: "(body)", message: "at least one declaration is required to save the draft" });
  }
  return issues;
}

/**
 * Where a pack row's evidence lives in this build, by contract key (W5c D-04).
 * A row links only when the server published a source for it; the server's
 * href string itself is never navigated to.
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

/** Rail links (W5c D-10): `alpha` → Screen 10 lineage, `run` → Screen 04 hub; a dim node never links. */
export function railRoute(node: RcRailNode, compose: Pick<RcCompose, "run" | "run_id">): string | null {
  if (node.tone === "dim") return null;
  /* F2b: the alpha and its version both open Screen 10 on the bound version; the selected params open Screen 07 on this run. */
  if ((node.key === "alpha" || node.key === "alpha_version") && compose.run.binding) {
    return lineageHref(compose.run.binding.alpha_id, { av: compose.run.binding.alpha_version_id });
  }
  if (node.key === "run") return `/research/quantbt/runs/${encodeURIComponent(compose.run_id)}/evidence`;
  if (node.key === "selected_params") return `/research/quantbt/runs/${encodeURIComponent(compose.run_id)}/freeze`;
  return null;
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * 403 and 404 say the same sentence and take the same state on purpose: the
 * server answers a non-member and an unknown run identically, so the screen
 * must not turn either into an existence hint (audit F-04).
 */
/* E1 (HiFi audit 2026-09-26): one F-04 sentence on every Research screen. */
export const RC_NEUTRAL_REFUSAL = REFUSAL_COPY.denied;

export const RC_REFUSAL_COPY = {
  network: "The request did not reach the server.",
  400: "This release candidate request is not valid. Reopen it from the run's evidence hub or report.",
  401: "Your session has ended. Sign in again to read or change this release candidate.",
  403: RC_NEUTRAL_REFUSAL,
  404: RC_NEUTRAL_REFUSAL,
  503: "Release candidate service is temporarily unavailable. Nothing on this screen was changed.",
  other: "The release candidate could not be read.",
} as const;

/** Spec 11 §7, verbatim: a write refused for access. */
export const RC_DENIED_COPY = "Access changed — reauthenticate or ask a workspace administrator.";
/** Spec 11 §7, verbatim: a write the service could not take. */
export const RC_UNAVAILABLE_COPY = "Release candidate service is temporarily unavailable — your draft is kept locally.";
/** Spec 11 §7 / §3, verbatim: the CAS fence moved. */
export const RC_CONFLICT_COPY = "evidence changed since composing — review the pack";
/** A 422: the server would not seal what is composed. */
export const RC_NOT_PUBLISHABLE_COPY =
  "The service refused to seal this composition. Review the blocked rows and the two declarations; nothing was sealed.";
/** A 400 on a write. */
export const RC_INVALID_COPY = "The service rejected this request as invalid; nothing was changed.";
/** A 409 on publish: the pack moved, or the recorded intent is someone else's or differs. */
export const RC_PUBLISH_CONFLICT_COPY =
  "evidence changed since composing — review the pack. Nothing was published; the publication was read again.";
/** A 503 or a request that never arrived on publish. */
export const RC_PUBLISH_UNAVAILABLE_COPY =
  "The publication service did not answer. Nothing on this screen was changed; publish again when it is back.";

export type RcRefusal = LineageRefusal;

/**
 * Reads: the lineage mapper decides state, retry and terminality by status
 * (the same F-04 rules); only the sentence is Screen 11's own.
 */
export function toRcRefusal(error: unknown): RcRefusal {
  const base = toLineageRefusal(error);
  const { status } = base;
  const message =
    status === 0
      ? RC_REFUSAL_COPY.network
      : status === 400 || status === 401 || status === 403 || status === 404 || status === 503
        ? RC_REFUSAL_COPY[status]
        : RC_REFUSAL_COPY.other;
  return { ...base, message };
}

/** What a refused write means for the card that sent it. */
export type RcWriteOutcome = "denied" | "conflict" | "unavailable" | "terminal";

export interface RcWriteRefusal {
  outcome: RcWriteOutcome;
  code: string | null;
  status: number;
  requestId: string | null;
  message: string;
}

/**
 * Writes (spec 11 §3): 401/403/404 are `denied` — the affected actions stop
 * and nothing retries; 409 is a moved fence, recovered by a re-read that keeps
 * the unsent text; 503, other 5xx and a request that never arrived are
 * `unavailable`, retried only by the reader; 400 and 422 are `terminal` for
 * that request.
 *
 * FG-05: a `401` on a seal, a draft save or a publish also goes to the shell's
 * Frame 01D sign-in path (`reportSessionExpired`), like every other Research
 * client; the card builds no sign-in of its own. Call once per refused write.
 */
export function toRcWriteRefusal(error: unknown): RcWriteRefusal {
  if (!(error instanceof PortalApiError)) {
    return { outcome: "unavailable", code: null, status: 0, requestId: null, message: RC_UNAVAILABLE_COPY };
  }
  const { status } = error;
  if (status === 401) reportSessionExpired();
  const outcome: RcWriteOutcome =
    status === 401 || status === 403 || status === 404 ? "denied" : status === 409 ? "conflict" : status >= 500 ? "unavailable" : "terminal";
  const message =
    outcome === "denied"
      ? status === 401
        ? RC_DENIED_COPY
        : `${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`
      : outcome === "conflict"
        ? RC_CONFLICT_COPY
        : outcome === "unavailable"
          ? RC_UNAVAILABLE_COPY
          : status === 422
            ? RC_NOT_PUBLISHABLE_COPY
            : RC_INVALID_COPY;
  return { outcome, code: error.code, status, requestId: error.requestId, message };
}

/** Publish refusals: the same outcome by status; the sentence says publish, not seal. */
export function toRcPublishRefusal(error: unknown): RcWriteRefusal {
  const base = toRcWriteRefusal(error);
  if (base.outcome === "conflict") return { ...base, message: RC_PUBLISH_CONFLICT_COPY };
  if (base.outcome === "unavailable") return { ...base, message: RC_PUBLISH_UNAVAILABLE_COPY };
  if (base.outcome === "terminal") {
    return { ...base, message: "The service refused this publish request. Nothing was published and no approval was attached." };
  }
  return base;
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

/** `availability: PARTIAL` is the only degraded outer state a composition declares. */
export function composeState(compose: RcCompose): ResearchState {
  if (compose.availability.state !== "AVAILABLE") {
    const code = reasonOf(compose.availability);
    const sentence = rcReasonSentence(compose.availability.reason_code);
    return {
      state: "partial",
      reason: `Composed with a declared source gap${sentence ? ` — ${sentence}` : ""}. The seal stays blocked until it is resolved.`,
      detail: code,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}

export function packState(pack: RcPack): ResearchState {
  if (pack.delivery.availability.state === "PARTIAL") {
    return {
      state: "partial",
      reason: "Sealed pack with a declared note.",
      detail: reasonOf(pack.delivery.availability),
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}

/**
 * Whether the server says this candidate was delivered to R1: the P21 local
 * seal's own delivery fact, or the P22 publication read. Either is the
 * server's; the browser never infers it from a click.
 */
export function isDelivered(compose: Pick<RcCompose, "local_seal"> | null, publication: RcPublication | null): boolean {
  return compose?.local_seal.delivery_state === "DELIVERED" || publication?.state === "DELIVERED";
}
