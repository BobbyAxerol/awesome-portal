/**
 * Research Loop — Release Candidate client (P21, Screen 11).
 *
 * Two reads and two writes, each named after its generated operation:
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
 *    with the same identity. A local seal is not a publication, a delivery or
 *    an approval (P22 owns those).
 *  - `researchReleaseCandidatePackGetV1` — the frozen pack by its identity.
 *
 * P22 adds three operations on the sealed candidate:
 *
 *  - `researchReleaseCandidatePublishV1` — one explicit click publishes the
 *    current local seal to the existing R1 Approval Inbox, fenced by the pack
 *    digest the composition returned. `201` delivered, `200` the idempotent
 *    replay, `202` an outcome the governance store did not confirm
 *    (`publication_state: "UNKNOWN"`), which is a success to be reconciled.
 *  - `researchReleaseCandidatePublishReconcileV1` — replays the stored request
 *    unchanged; only the actor who recorded the intent is admitted.
 *  - `researchReleaseCandidateApprovalMirrorGetV1` — the read-only R1 mirror.
 *
 * The contract declares no ETag and no `304`, so no validator is sent. Every
 * write carries the same-origin CSRF proof; the reads carry nothing extra.
 * The server's `error.message` is never rendered: the screen speaks from
 * `RC_REFUSAL_COPY`, keyed by status, and shows the code and request id only.
 */

import type { components as ReleaseCandidateComponents } from "@portal/contracts-research-release-candidate";
import type { components as PublicationComponents } from "@portal/contracts-research-release-candidate-publication";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import { lineageHref, toLineageRefusal, type LineageRefusal } from "./lineageClient";
import type { ResearchState } from "./state";

type RcSchemas = ReleaseCandidateComponents["schemas"];
type PublicationSchemas = PublicationComponents["schemas"];
type P21Compose = RcSchemas["ComposeResponseP21"];
type PublicationWire = PublicationSchemas["PublicationResponse"];

export interface RcPublication {
  state: PublicationWire["state"] | "CONFLICT" | null;
  release_candidate_id: string | null;
  approval_id: string | null;
  conflicting_approval_id: string | null;
  downstream_code: string | null;
  downstream_receipt_digest: string | null;
  attempt_count: number | null;
  intent_actor: { user_id: string; username: string } | null;
  updated_at_utc_ms: number | null;
  reconcile_allowed: boolean;
  claim_candidates: string[];
  availability: RcSchemas["Availability"];
}

export interface RcMirror {
  schema_version: "research.release-candidate-approval-mirror.v1";
  release_candidate_id: string;
  approval_id: string;
  href: string;
  availability: RcSchemas["Availability"];
  gate: "R1" | null;
  subject_id: string | null;
  subject_label: string | null;
  status: PublicationSchemas["ApprovalMirror"]["status"] | null;
  effective_status: string | null;
  sla_due_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  quorum_met: number | null;
  quorum_required: number | null;
  approval_version: number | null;
  evidence_set_hash: string | null;
  blocker_count: number | null;
  condition_count: number | null;
  conditions: string[];
  decision_outcomes: string[];
  rc_superseded: boolean | null;
  as_of_utc_ms: number;
}

export type RcCompose = Omit<P21Compose, "state" | "actions" | "mirror"> & {
  state: P21Compose["state"] | "PUBLISHED";
  actions: Omit<P21Compose["actions"], "publish"> & {
    publish: P21Compose["actions"]["publish"] & { release_candidate_id: string | null };
  };
  publication: RcPublication;
  mirror: RcMirror | null;
};
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
export interface RcPublishRequest {
  schema_version: "research.release-candidate-publish-request.v1";
  expected_pack_digest: string;
  request_key?: string;
  methodology_claim_id?: string;
  summary?: string;
  workspace_id?: string;
}
export interface RcReconcileRequest {
  schema_version: "research.release-candidate-publish-reconcile-request.v1";
}
export interface RcPublicationResponse {
  schema_version: "research.release-candidate-publication.v1";
  release_candidate_id: string | null;
  publication_state: PublicationWire["state"] | "CONFLICT";
  delivery_state: string;
  approval_state: string;
  replayed: boolean;
  run_id?: string;
  pack_digest?: string;
  href?: string | null;
  approval_id?: string | null;
  downstream_receipt_digest?: string | null;
  attempt_count?: number | null;
  updated_at_utc_ms?: number | null;
  conflicting_approval_id?: string | null;
  downstream_code?: string | null;
  intent_actor?: { user_id: string; username: string } | null;
  reconcile_allowed?: boolean;
  claim_candidates?: string[];
  availability?: RcSchemas["Availability"];
}

const RUNS = "/api/v1/quantbt/runs";
const PACKS = "/api/v1/research/release-candidates";

/** Reason codes the P21 service publishes (`release-candidate.service.ts`), named once. */
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
  /* P22 publish blockers (`release-candidate.service.ts` publishAction). */
  publicationDisabled: "P22_PUBLICATION_DISABLED",
  alreadyPublished: "P22_ALREADY_PUBLISHED",
  pendingReconcile: "P22_PUBLICATION_PENDING_RECONCILE",
  packNotCurrent: "P22_PACK_NOT_CURRENT",
  runNotMirrored: "P22_RUN_NOT_MIRRORED",
  alphaMismatch: "P22_ALPHA_MISMATCH",
  claimNotMirrored: "P22_CLAIM_NOT_MIRRORED",
  notPublished: "P22_NOT_PUBLISHED",
  /* P22 mirror availability (`release-candidate-publication.service.ts`). */
  mirrorReadDenied: "GOVERNANCE_R1_READ_DENIED",
} as const;

/** P22 `PublicationRefusalCode` values the screen words differently, named once. */
export const RC_PUBLICATION_CODE = {
  conflict: "RESEARCH_PUBLICATION_CONFLICT",
  packNotCurrent: "RESEARCH_PUBLICATION_PACK_NOT_CURRENT",
  openApprovalExists: "RESEARCH_PUBLICATION_OPEN_APPROVAL_EXISTS",
  retryable: "RESEARCH_PUBLICATION_RETRYABLE",
  refusedDownstream: "RESEARCH_PUBLICATION_REFUSED_DOWNSTREAM",
  recoveryActorMismatch: "RESEARCH_PUBLICATION_RECOVERY_ACTOR_MISMATCH",
  notReconcilable: "RESEARCH_PUBLICATION_NOT_RECONCILABLE",
} as const satisfies Record<string, string>;

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

export function publishPath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}/publish${query(workspaceId)}`;
}

export function reconcilePath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}/publish/reconcile${query(workspaceId)}`;
}

export function mirrorPath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}/mirror${query(workspaceId)}`;
}

export function publicationPath(releaseCandidateId: string, workspaceId?: string): string {
  return `${PACKS}/${encodeURIComponent(releaseCandidateId)}/publication${query(workspaceId)}`;
}

/** Screen 11's product routes (PLAN P21 §2.1). */
export function releaseCandidateHref(runId: string, options: { pack?: string | null } = {}): string {
  const base = `/research/quantbt/runs/${encodeURIComponent(runId)}/release-candidate`;
  return options.pack ? `${base}#pack=${encodeURIComponent(options.pack)}` : base;
}

export function packFromHash(hash: string): string | null {
  const match = /(?:^#|&)pack=([^&]+)/.exec(hash);
  if (!match) return null;
  const value = decodeURIComponent(match[1]!);
  return /^rc_[0-9A-HJKMNP-TV-Z]{26}$/.test(value) ? value : null;
}

export function releaseCandidatePackHref(releaseCandidateId: string): string {
  return `/research/quantbt/release-candidates/${encodeURIComponent(releaseCandidateId)}`;
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


const unavailablePublication = (releaseCandidateId: string, reason = "P22_PUBLICATION_NOT_PUBLISHED"): RcPublication => ({
  state: null,
  release_candidate_id: releaseCandidateId || null,
  approval_id: null,
  conflicting_approval_id: null,
  downstream_code: null,
  downstream_receipt_digest: null,
  attempt_count: null,
  intent_actor: null,
  updated_at_utc_ms: null,
  reconcile_allowed: false,
  claim_candidates: [],
  availability: { state: "NOT_PUBLISHED", reason_code: reason },
});

function sourceAvailability(source: PublicationWire["source"]): RcAvailability {
  if (source.availability === "AVAILABLE") return { state: "AVAILABLE", reason_code: null };
  return { state: source.availability === "PARTIAL" ? "PARTIAL" : "NOT_PUBLISHED", reason_code: source.reason_code ?? "P22_PUBLICATION_SOURCE_NOT_AVAILABLE" };
}

function mirrorFromWire(wire: PublicationWire): RcMirror | null {
  if (wire.approval_read !== "AVAILABLE" || wire.approval === null) return null;
  const approval = wire.approval;
  const asOf = Date.parse(approval.read_at);
  return {
    schema_version: "research.release-candidate-approval-mirror.v1",
    release_candidate_id: wire.release_candidate_id,
    approval_id: approval.approval_id,
    href: approval.href,
    availability: { state: "AVAILABLE", reason_code: null },
    gate: "R1",
    subject_id: approval.subject_id,
    subject_label: approval.subject_id,
    status: approval.status,
    effective_status: null,
    sla_due_at: approval.sla_due_at,
    expires_at: approval.expires_at,
    created_at: approval.created_at,
    quorum_met: null,
    quorum_required: null,
    approval_version: null,
    evidence_set_hash: approval.evidence_set_hash,
    blocker_count: null,
    condition_count: approval.conditions.length,
    conditions: approval.conditions.map((condition: PublicationSchemas["Condition"]) => `${condition.kind}: ${condition.statement}`),
    decision_outcomes: [],
    rc_superseded: wire.candidate_relation === "SUPERSEDED",
    as_of_utc_ms: Number.isFinite(asOf) ? asOf : wire.as_of_utc_ms,
  };
}

function publicationFromWire(wire: PublicationWire): RcPublication {
  return {
    state: wire.state === "NOT_PUBLISHED" ? null : wire.state,
    release_candidate_id: wire.release_candidate_id,
    approval_id: wire.published?.approval_id ?? wire.approval?.approval_id ?? null,
    conflicting_approval_id: null,
    downstream_code: wire.blocked_reason,
    downstream_receipt_digest: wire.published?.receipt_digest ?? null,
    attempt_count: null,
    intent_actor: wire.published ? { user_id: wire.published.by_user_id, username: wire.published.by_username } : null,
    updated_at_utc_ms: wire.published?.at_utc_ms ?? wire.as_of_utc_ms,
    reconcile_allowed: wire.state === "UNKNOWN" && wire.may_publish,
    claim_candidates: wire.source.eligible_methodology_claim_ids,
    availability: sourceAvailability(wire.source),
  };
}

function publicationAnswerFromWire(wire: PublicationWire, replayed = wire.replayed): RcPublicationResponse {
  const publication = publicationFromWire(wire);
  return {
    ...publication,
    schema_version: "research.release-candidate-publication.v1",
    publication_state: wire.state,
    delivery_state: wire.state === "DELIVERED" ? "DELIVERED" : wire.state,
    approval_state: wire.approval_read,
    replayed,
  };
}

function combinedCompose(value: unknown): value is RcCompose {
  return typeof value === "object" && value !== null && "publication" in value && "mirror" in value;
}

async function normaliseCompose(raw: P21Compose | RcCompose, options: { workspaceId?: string; signal?: AbortSignal } = {}): Promise<RcCompose> {
  if (combinedCompose(raw)) return raw;
  const releaseCandidateId = raw.local_seal.release_candidate_id;
  let wire: PublicationWire | null = null;
  if (releaseCandidateId !== null) {
    try {
      wire = await call<PublicationWire>(publicationPath(releaseCandidateId, options.workspaceId), { signal: options.signal });
    } catch {
      /* Publication is an optional P22 read; keep the P21 composition and a typed absence. */
    }
  }
  const publication = wire ? publicationFromWire(wire) : unavailablePublication(releaseCandidateId ?? "");
  return {
    ...raw,
    state: wire?.state === "DELIVERED" ? "PUBLISHED" : raw.state,
    actions: { ...raw.actions, publish: { ...raw.actions.publish, release_candidate_id: publication.release_candidate_id } },
    publication,
    mirror: wire ? mirrorFromWire(wire) : null,
  };
}

function normalisePublication(value: PublicationWire | RcPublicationResponse): RcPublicationResponse {
  if ("publication_state" in value) return value;
  return publicationAnswerFromWire(value);
}

export const releaseCandidateApi = {
  /** `researchReleaseCandidateComposeGetV1` plus the current P22 publication read when a seal exists. */
  compose: async (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) => {
    const raw = await call<P21Compose | RcCompose>(composePath(runId, options.workspaceId), { signal: options.signal });
    return normaliseCompose(raw, options);
  },

  /** `researchReleaseCandidateDraftPatchV1` — only ever from an explicit save. */
  patchDraft: async (runId: string, body: RcDraftPatch, options: { workspaceId?: string; signal?: AbortSignal } = {}) => {
    const raw = await call<P21Compose | RcCompose>(draftPath(runId, options.workspaceId), { method: "PATCH", body, signal: options.signal });
    return normaliseCompose(raw, options);
  },

  /** `researchReleaseCandidateLocalSealCreateV1` — only ever from an explicit click. */
  seal: (runId: string, body: RcSealRequest, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<RcSealResponse>(sealPath(runId, options.workspaceId), { method: "POST", body, signal: options.signal }),

  /** `researchReleaseCandidatePackGetV1` */
  pack: (releaseCandidateId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<RcPack>(packPath(releaseCandidateId, options.workspaceId), { signal: options.signal }),

  /** `researchReleaseCandidatePublishV1` — current backend accepts the full idempotent request body. */
  publish: async (releaseCandidateId: string, body: RcPublishRequest, options: { workspaceId?: string; signal?: AbortSignal } = {}) => {
    const raw = await call<PublicationWire>(publishPath(releaseCandidateId, options.workspaceId), { method: "POST", body, signal: options.signal });
    return normalisePublication(raw);
  },

  /** Replays the exact stored request on the current `/publish` endpoint. */
  reconcile: async (releaseCandidateId: string, options: { workspaceId?: string; signal?: AbortSignal; body?: RcPublishRequest } = {}) => {
    if (!options.body) throw new PortalApiError("Publication request is not available for replay.", 409, RC_REASON.pendingReconcile, null);
    const raw = await call<PublicationWire>(publishPath(releaseCandidateId, options.workspaceId), { method: "POST", body: options.body, signal: options.signal });
    return normalisePublication(raw);
  },

  /** Current backend publishes the authorized R1 mirror under the publication read. */
  mirror: async (releaseCandidateId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) => {
    try {
      return await call<RcMirror>(mirrorPath(releaseCandidateId, options.workspaceId), { signal: options.signal });
    } catch (error) {
      if (!(error instanceof PortalApiError) || error.status !== 404) throw error;
      const raw = await call<PublicationWire>(publicationPath(releaseCandidateId, options.workspaceId), { signal: options.signal });
      const mirror = mirrorFromWire(raw);
      if (mirror === null) throw error;
      return mirror;
    }
  },
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
export interface DeclarationIssue { path: string; message: string; }
export function declarationIssues(values: Record<DeclarationKey, string>): DeclarationIssue[] {
  const issues: DeclarationIssue[] = [];
  for (const key of DECLARATION_KEYS) {
    const value = values[key];
    if (value.length > DECLARATION_MAX) issues.push({ path: key, message: `at most ${DECLARATION_MAX} characters (now ${value.length})` });
    else if (value.length > 0 && value.trim().length === 0) issues.push({ path: key, message: "only whitespace — write the declaration or leave it empty" });
  }
  if (DECLARATION_KEYS.every((key) => values[key].trim().length === 0)) issues.push({ path: "(body)", message: "at least one declaration is required to save the draft" });
  return issues;
}

export function packSourceRoute(item: RcPackItem, runId: string, alphaId: string | null): string | null {
  if (item.source.href === null) return null;
  const run = `/research/quantbt/runs/${encodeURIComponent(runId)}`;
  switch (item.key) {
    case "ENGINE_CAPABILITY_BACKEND": return "/research/quantbt/atlas";
    case "DATASET_UNIVERSE_SNAPSHOTS":
    case "EXECUTION_ASSUMPTIONS": return `${run}/split`;
    case "METHODOLOGY_CLAIM": return `${run}/evidence#stage=claim`;
    case "SELECTED_PARAMS_LINEAGE": return `${run}/search`;
    case "FINAL_AUDIT_REPLAY": return `${run}/execute`;
    case "METRICS_SEMANTICS": return `${run}/report`;
    case "REPRODUCIBILITY_PARITY_CHECKSUMS": return `${run}/freeze`;
    case "ROBUSTNESS_PARAM_STABILITY_REGIME": return alphaId ? `/research/quantbt/alphas/${encodeURIComponent(alphaId)}/compare` : null;
    default: return null;
  }
}

export function railRoute(node: RcRailNode, compose: RcCompose): string | null {
  if (node.tone === "dim") return null;
  if (node.key === "alpha" && compose.run.binding) return lineageHref(compose.run.binding.alpha_id);
  if (node.key === "run") return `/research/quantbt/runs/${encodeURIComponent(compose.run_id)}/evidence`;
  return null;
}

/* Compatibility names retained for the P21 consumer tests; the P22 copy stays authoritative. */
export const CONFLICT_COPY = "evidence changed since composing — review the pack";
export const DENIED_COPY = "Access changed — reauthenticate or ask a workspace administrator.";
export const UNAVAILABLE_COPY = "Release candidate service is temporarily unavailable — your draft is kept locally.";
export const MIRROR_GHOST_NOTE = "Preview of the inbox row this publish will create on the Execution side. It stays a ghost until the record exists — this screen never fakes a governance state.";
export const SEAL_BUTTON = "Local seal evidence pack";

/**
 * The seal button's reason, in words, for the codes the service publishes.
 * Spec 11 §7 copy where one exists ("resolve MISSING rows first"); "publish"
 * reads "seal" because P21 does not publish (VD-P21-02). Any other code is
 * printed as the code itself.
 */
export const SEAL_BLOCKED_LABEL: Readonly<Record<string, string>> = {
  [RC_REASON.scratchUnbound]: "seal blocked — bind alpha_version first",
  [RC_REASON.versionNotActive]: "seal blocked — the bound alpha_version is not ACTIVE",
  [RC_REASON.integrityFailed]: "seal blocked — a referenced source failed its integrity check",
  [RC_REASON.evidenceMissing]: "resolve MISSING rows first",
  [RC_REASON.declarationsRequired]: "complete the two declarations first",
  [RC_REASON.alreadyPublished]: "published — immutable",
};

export function sealBlockedLabel(reasonCode: string): string {
  return SEAL_BLOCKED_LABEL[reasonCode] ?? reasonCode;
}

/**
 * The publish button's reason, in words, for the P22 blockers the service
 * publishes. The scratch-run wording is the hi-fi's own disabled label. Any
 * other code (P22_PACK_NOT_CURRENT, P22_ALPHA_MISMATCH, …) is printed as the
 * code itself.
 */
export const PUBLISH_BLOCKED_LABEL: Readonly<Record<string, string>> = {
  [RC_REASON.publicationDisabled]: "publish — not enabled in this build",
  [RC_REASON.sealNotCreated]: "seal the evidence pack first",
  [RC_REASON.alreadyPublished]: "published — immutable",
  [RC_REASON.runNotMirrored]: "publish blocked — this run is not mirrored to the governance store",
  [RC_REASON.pendingReconcile]: "publication outcome unknown — reconcile first",
  [RC_REASON.scratchUnbound]: "publish blocked — bind alpha_version first",
};

export function publishBlockedLabel(reasonCode: string): string {
  return PUBLISH_BLOCKED_LABEL[reasonCode] ?? reasonCode;
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * 403 and 404 say the same sentence and take the same state on purpose: the
 * server answers a non-member and an unknown run identically, so the screen
 * must not turn either into an existence hint (audit F-04).
 */
export const RC_NEUTRAL_REFUSAL =
  "This run may not exist or may be outside your access — nothing here confirms either.";

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

/* P22 publish/reconcile refusals — no hi-fi cell carries them (VD-P22-05). */
/** An open R1 approval for the same alpha and run already exists; nothing was attached. */
export const RC_OPEN_APPROVAL_COPY =
  "an open R1 approval already exists for this alpha and run — this candidate was not attached to it";
/** `RESEARCH_PUBLICATION_RETRYABLE`: the governance write did not settle; not a moved fence. */
export const RC_RETRYABLE_COPY = "publication did not settle — retry";
/** A 422 on publish: a server pre-check or a typed downstream refusal. */
export const RC_PUBLISH_REFUSED_COPY =
  "The service refused to publish this candidate. Nothing was published and no approval was attached.";
/** A downstream refusal answered as 409. */
export const RC_REFUSED_DOWNSTREAM_COPY =
  "The governance store refused this publication. Nothing was published and no approval was attached.";
export const RC_ACTOR_MISMATCH_COPY =
  "Only the researcher who recorded this publication may reconcile it. Nothing was re-submitted.";
export const RC_NOT_RECONCILABLE_COPY = "This publication is settled and cannot be reconciled. Nothing was re-submitted.";

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
 */
export function toRcWriteRefusal(error: unknown): RcWriteRefusal {
  if (!(error instanceof PortalApiError)) {
    return { outcome: "unavailable", code: null, status: 0, requestId: null, message: RC_UNAVAILABLE_COPY };
  }
  const { status } = error;
  const outcome: RcWriteOutcome =
    status === 401 || status === 403 || status === 404
      ? "denied"
      : status === 409
        ? "conflict"
        : status >= 500
          ? "unavailable"
          : "terminal";
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

/**
 * Publish and reconcile refusals: the same outcome by status as every other
 * write (`toRcWriteRefusal`), with the sentence chosen by the typed code where
 * a `409` or `422` means something narrower than "the fence moved". The code
 * decides the words only, never the outcome.
 */
export function toRcPublishRefusal(error: unknown): RcWriteRefusal {
  const base = toRcWriteRefusal(error);
  if (base.outcome === "conflict") {
    const message =
      base.code === RC_PUBLICATION_CODE.openApprovalExists
        ? RC_OPEN_APPROVAL_COPY
        : base.code === RC_PUBLICATION_CODE.retryable
          ? RC_RETRYABLE_COPY
          : base.code === RC_PUBLICATION_CODE.refusedDownstream
            ? RC_REFUSED_DOWNSTREAM_COPY
            : base.code === RC_PUBLICATION_CODE.recoveryActorMismatch
              ? RC_ACTOR_MISMATCH_COPY
              : base.code === RC_PUBLICATION_CODE.notReconcilable
                ? RC_NOT_RECONCILABLE_COPY
                : RC_CONFLICT_COPY;
    return { ...base, message };
  }
  if (base.outcome === "terminal" && base.status === 422) return { ...base, message: RC_PUBLISH_REFUSED_COPY };
  return base;
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

/** `availability: PARTIAL` is the only degraded outer state a composition declares. */
export function composeState(compose: RcCompose): ResearchState {
  if (compose.availability.state !== "AVAILABLE") {
    return {
      state: "partial",
      reason: `Composed with a declared source gap (${reasonOf(compose.availability)}). The seal stays blocked until it is resolved.`,
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
      reason: `Sealed pack with a declared note (${reasonOf(pack.delivery.availability)}).`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}
