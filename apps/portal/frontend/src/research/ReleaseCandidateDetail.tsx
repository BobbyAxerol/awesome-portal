/**
 * Screen 11 — Release Candidate & Publish (P21 compose/seal + P22 publish).
 *
 * The hi-fi (`QuantBT 11 Release Candidate and Publish.dc.html`) composes one
 * promotable unit and publishes it to the Approval Inbox. The order, geometry
 * and copy are the hi-fi's; every value is the server's — the P21 composition
 * and, for a sealed candidate, the P22 publication read — or a typed absence.
 * Departures are numbered `VD-P21-NN` / `VD-P22-NN` / `X1-DNN` (evidence
 * `upgrade/research_loop/evidence/P21/X1_S11_UNIFIED_CLAUDE_2026-09-26.md`):
 *
 *  - VD-P21-01 / X1-D03 the state chip is `NOT_PUBLISHABLE` for a run with no
 *    binding (spec §2.1), `PUBLISHED` only once the server says the candidate
 *    was delivered (the seal's `delivery_state` or the publication read), and
 *    otherwise the composition's `DRAFT`; a local seal adds its own
 *    `SEALED_LOCAL` chip until it is delivered.
 *  - VD-P21-02 / X1-D01 the local seal and the publish are two cards, each
 *    behind an inline confirmation (`role=alertdialog`): both write an
 *    immutable record (guide P22 FE "publish confirmation"; Codex P22 handoff
 *    "POST only on explicit confirmation").
 *  - VD-P21-03 the YAML preview is the server's 17 fields.
 *  - VD-P21-04 / X1-D09 the taxonomy, last-rc caption and verdict are the
 *    server's (P22 now publishes the predecessor comparison).
 *  - VD-P21-07 / X1-D04 pack source links resolve by contract key to a screen
 *    this build serves, only when the server published a source.
 *  - VD-P21-09 a sealed pack has a read-only route of its own; the 01 rc chip
 *    opens it, and `#pack=rc_…` forwards to it.
 *  - VD-P22-01 the mirror SLA prints the server's timestamps; no countdown.
 *  - VD-P22-02 "assignee pool" prints only a pool the mirror publishes; today
 *    the mirror says `NOT_PUBLISHED` with its reason code, which is printed.
 *  - VD-P22-08 the outcome vocabulary is the governance contract's. VD-FG-05-02:
 *    it prints only as a legend (`possible outcomes:`) while no decision is
 *    recorded; once `decision_outcomes` has entries only those print.
 *  - FG-05 (Codex P22 closeout): the raw `approval.status` and the separate
 *    `effective_status`, `rc_superseded`, the conflicting approval and the
 *    downstream code, the recorded intent's actor and attempts. A `401` goes to
 *    the shell's Frame 01D path, and a `403` and a `404` read the same.
 *
 * Nothing here counts, sorts, formats a number, diffs or decides: counts,
 * tones, titles, reason codes and the seal and publish gates are the server's.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import { DEFAULT_CURSOR, deepDiveHref } from "./evidenceCursor";
import {
  DECLARATION_KEYS,
  RC_DENIED_COPY,
  RC_NEUTRAL_REFUSAL,
  RC_REFUSAL_COPY,
  RC_WITHHELD_WORDS,
  declarationIssues,
  isDelivered,
  packSourceRoute,
  railRoute,
  rcReasonSentence,
  reasonOf,
  releaseCandidateHref,
  releaseCandidatePackHref,
  yamlText,
  yamlValue,
  type DeclarationIssue,
  type RcApproval,
  type RcAvailability,
  type RcCertificationAxis,
  type RcCompose,
  type RcField,
  type RcLocalSeal,
  type RcPack,
  type RcPackCounts,
  type RcPackItem,
  type RcPublication,
  type RcRailNode,
  type RcTaxonomyRow,
  type RcWriteRefusal,
} from "./releaseCandidateClient";
import type { ResearchState } from "./state";
import type { RcDeclarations, RcPackController, RcWriteOp, RcWriteSlot, ReleaseCandidateController } from "./useReleaseCandidate";
import type { RcPublicationController, RcPublicationView, RcReadFailure } from "./useReleaseCandidatePublication";
import { iso } from "./utcMinute";
import { shortDigest, shortId } from "./researchFormat";

export { releaseCandidateHref, releaseCandidatePackHref };

/* --------------------------------------------------------------- verbatim */

/** Hi-fi title, verbatim. */
export const RC_TITLE = "Release Candidate — compose, pin, publish";
/** Hi-fi subtitle, verbatim. */
export const RC_SUBTITLE =
  "A run is evidence; what travels is the release candidate. Publish writes one immutable record — the Approval Inbox reads it. Nothing here recomputes or approves.";
/** Hi-fi breadcrumb tail, verbatim. */
export const RC_CRUMB = "Release Candidate & Publish";

/** Hi-fi scratch banner, verbatim (split around the two inline elements). */
export const NOT_PUBLISHABLE_BADGE = "NOT_PUBLISHABLE";
export const NOT_PUBLISHABLE_COPY = [
  "This run was submitted without an ",
  "alpha_version",
  " binding — a scratch research run. It stays fully usable as evidence for you, but no release candidate can be composed from it. Bind a version at ",
  "New Run",
  " and re-run to publish.",
] as const;

export const IDENTITY_LABEL = "1 · identity & lineage — the unit that travels";
export const IDENTITY_SPEC = "spec v0.7 §3.1 — binding goes through rc_, never alpha↔run directly";
export const TAXONOMY_CAPTION = "change taxonomy vs last published rc — ";
export const VERDICT_LABEL = "gate verdict for this candidate";

/** Rail node labels by contract key (VD-P21-06: `run` reads "run / attempt"). */
export const RAIL_LABEL: Record<RcRailNode["key"], string> = {
  alpha: "alpha",
  alpha_version: "alpha_version",
  run: "run / attempt",
  selected_params: "selected params",
  release_candidate: "release candidate",
};

export const PACK_HEADER = "2 · evidence pack — 12 items of gate R1, each linked to the screen that proves it";
/** Spec 11 §7 chip titles, verbatim. */
export const CEILING_TITLE = "methodology claim ceiling — holdout locked, unlock lifts B → A";
export const ENGCERT_TITLE = "engine execution-contract certification (0–4) — separate axis from the methodology claim";
/** Hi-fi Alpha 360° title, verbatim. */
export const ALPHA360_TITLE = "opens the portal's Alpha 360° passport — outside this prototype";
export const NO_SOURCE_LINK_TITLE = "the server published no source for this row";

/** Hi-fi / spec 11 §2.4 status titles, verbatim; MISSING takes its reason code. */
export const STATUS_TITLE: Record<Exclude<RcPackItem["status"], "MISSING">, string> = {
  COMPLETE: "artifact present, digest pinned",
  DEGRADED: "partial artifact — travels as DEGRADED, reviewer sees it",
  INPUT: "researcher declaration — part of the signed pack",
};

export const RECORD_HEADER = "3 · record preview — exactly what is written, byte for byte (spec v0.7 §3.2)";

/** Handoff wording (VD-P21-02): the seal button never says Publish. */
export const SEAL_LABEL = "Local seal evidence pack";
export const SEAL_SENTENCE =
  "Sealing freezes this exact combination as a Portal-local immutable evidence pack. It creates no publication, no approval, no delivery, and does not start Paper.";
export const SEAL_CONFIRM = "Seal now? The pack below is frozen as it is composed; a later change to code, params or evidence composes a new candidate.";
export const SEAL_CONFIRM_BUTTON = "Confirm local seal";
export const SEAL_DIRTY = "save your declarations first — the seal fences the saved draft revision";
export const SEALED_SENTENCE =
  "This evidence pack is Portal-local and immutable. A further change to code, params or methodology composes a new candidate.";
export const SEALED_REPLAY = "The server returned this same pack for the same draft and evidence — a replay, not a second candidate.";
/** E1: the read authority in words; the token stays in `data-read-authority`. */
const READ_AUTHORITY_WORDS: Record<string, string> = {
  PORTAL_PERSISTED_RESEARCH: "portal-persisted research record",
};
export const DRAFT_NOT_PERSISTED = "save the two declarations first — the draft is not persisted yet";

/* ------------------------------------------------------------- P22 publish */

/** Hi-fi publish card label, verbatim. */
export const PUBLISH_LABEL = "publish";
/** Hi-fi publish sentence, verbatim, split around the mono rc id. */
export const PUBLISH_SENTENCE = [
  "Publishing freezes this exact combination as ",
  " in the portal governance store. It creates no account, no allocation, and does not start Paper — it only makes the candidate reviewable.",
] as const;
/** Hi-fi button label, verbatim. */
export function publishButtonLabel(releaseCandidateId: string): string {
  return `Publish release candidate ${releaseCandidateId}`;
}
/** Spec 11 §13, verbatim: the disabled label of a scratch run. */
export const PUBLISH_UNBOUND_LABEL = "publish blocked — bind alpha_version first";
/** The button of a candidate that has no seal yet; the reason sits beside it. */
export const PUBLISH_BLOCKED_LABEL = "publish blocked";
/** Spec 11 §3: the button while the request is in flight. */
export const PUBLISHING_LABEL = "publishing…";
/** Hi-fi separation-of-duties note, verbatim (VD-P22-13: on the publish card, as in the hi-fi). */
export const SOD_NOTE =
  "Separation of duties: the publisher cannot be the sole R1 approver where policy requires it. R1 approval default expiry: approved_at + 90d (policy default — confirm).";
export const PUBLISH_CONFIRM =
  "Publish now? One R1 approval request is created in the governance store for this exact pack. It cannot be edited afterwards — only superseded by a new candidate.";
export const PUBLISH_CONFIRM_BUTTON = "Confirm publish";
/** VD-P22-06: several mirrored claims, chosen from the server's list. */
export const CLAIM_LEGEND = "methodology claim to attach";
export const CLAIM_REQUIRED = "choose the methodology claim to attach first";
export const CLAIM_NONE = "the governance store lists no methodology claim for this run";

/** Hi-fi published card, verbatim. */
export const PUBLISHED_LABEL = "published — immutable";
export const PUBLISHED_SENTENCE =
  "Any further change to code, params, or methodology creates a NEW candidate and supersedes this one — this record itself never mutates.";

/** VD-P22-05: a recorded attempt the governance store did not confirm — no hi-fi cell. */
export const UNKNOWN_LABEL = "publication outcome unknown";
export const UNKNOWN_COPY =
  "The governance store did not confirm the last attempt. It is neither published nor refused. Only the researcher who recorded it may send the same request again; nothing is re-submitted with a different payload.";
export const RETRY_LABEL = "publish again — same request";

/** The pack route: publication is operated on the run's composition. */
export const PUBLISH_GHOST_LABEL = "publish — on the run's composition";
export const PUBLISH_GHOST_COPY =
  "A sealed pack is read-only. Publishing is operated on the run's composition; this route prints the publication and its mirror once they exist.";

/** Hi-fi mirror, draft branch, verbatim where the facts are the hi-fi's own copy. */
export const MIRROR_LABEL = "what the approval inbox sees";
export const MIRROR_SIDE = "read model · decisions live on the Execution side";
export const MIRROR_GATE = "R1 · RESEARCH EVIDENCE";
export const MIRROR_SUBJECT = "— not yet published";
export const MIRROR_SLA = "SLA starts at publish";
export const MIRROR_NOTE =
  "Preview of the inbox row this publish will create on the Execution side. It stays a ghost until the record exists — this screen never fakes a governance state.";
/** VD-P22-02: no contract field names an assignee pool. */
export const MIRROR_POOL_ABSENT = "assignee pool: not published";
/**
 * VD-P22-08: the governance contract's decision vocabulary (`ApprovalMirror.status`
 * minus PENDING). VD-FG-05-02: a legend, shown only while no decision is recorded.
 */
export const MIRROR_OUTCOMES = "possible outcomes: APPROVED · APPROVED_WITH_CONDITION · CHANGES_REQUESTED · DENIED · EXPIRED";
export const MIRROR_PUBLISHED_NOTE =
  "The reviewer opens this row, walks the same evidence links you pinned above, and records one of the outcomes above. Conditions and waivers they attach flow back into this mirror. You cannot edit anything past this point — only supersede with a new candidate.";
/** VD-P22-07: a Research fact beside the raw status, never in place of it. */
export const MIRROR_SUPERSEDED = "superseded by a newer candidate — the raw approval status above is unchanged";
export const MIRROR_NOT_READABLE = "not readable with your access";
export const MIRROR_NOT_FOUND = "the governance store has no approval by this id";
export const MIRROR_UNAVAILABLE = "the governance store did not answer this read — the mirror is read again in 60 s";
export const MIRROR_INBOX_LINK = "open in Approval Inbox";

/** Hi-fi rules footer, verbatim. */
export const RC_RULES =
  "The promotable unit is rc_, never a bare run_id. Digests pinned at publish are verified downstream. This screen never computes, approves, or mutates — its one verb is publish.";

export const PACK_ROUTE_IDENTITY =
  "A sealed pack freezes fields, pack rows and declarations; the lineage rail and taxonomy belong to the run's live composition.";

/** The publication read's own states, in words (never a governance verdict). */
export const PUBLICATION_READ_WORDS: Record<Exclude<RcPublicationView["state"], "fresh" | "stale">, string> = {
  idle: "no sealed candidate — nothing to publish yet",
  loading: "reading the publication…",
  unavailable: "the publication read did not answer — it is tried again on its own",
  session: RC_REFUSAL_COPY[401],
  /* F-04 / FG-05: a 403 and a 404 are one state and this one sentence, the same the writes say. */
  denied: `${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`,
  terminal: "The publication read was refused as invalid.",
};

/** Every block, in the order the screen renders it. */
export const RC_PANELS = {
  compose: ["header", "meta", "banner", "identity", "pack", "record", "seal", "sealed", "publish", "publish-unknown", "published", "mirror", "mirror-ghost", "rules"],
  pack: ["header", "meta", "identity", "pack", "record", "sealed", "published", "publish-ghost", "mirror", "mirror-ghost", "rules"],
} as const;

/** The two INPUT rows and the draft field each one edits. */
const DECLARATION_FIELD = {
  KNOWN_LIMITATIONS_WAIVERS: "known_limitations",
  PROPOSED_USE_RESTRICTIONS: "proposed_use_restrictions",
} as const satisfies Partial<Record<RcPackItem["key"], keyof RcDeclarations>>;

type DeclarationRowKey = keyof typeof DECLARATION_FIELD;

function declarationKey(key: RcPackItem["key"]): DeclarationRowKey | null {
  return key === "KNOWN_LIMITATIONS_WAIVERS" || key === "PROPOSED_USE_RESTRICTIONS" ? key : null;
}

/* -------------------------------------------------------------------- css */

/*
 * Scoped to `.rc-page`. Hi-fi colours map to palette tokens only (U02 gate).
 * W5c D-06/D-07/D-08 (axe, spec T14): the hi-fi's tinted grounds put the gold
 * (the warn token) and green (the good token) text below 4.5:1, so a chip or card carrying
 * that text keeps the white `--paper-raised` ground with a 3 px inset bar in
 * its tone; the ghost is carried by its dashed frame and faint ink, never by
 * `opacity`. DEGRADED rows keep the gold bar, not a gold fill.
 */
const RC_CSS = `
.rc-page { color: var(--ink); font-size: 13px; line-height: 1.5; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.rc-page a { color: var(--accent); text-decoration: none; }
.rc-page a:hover { color: var(--accent-strong); text-decoration: underline; }
:where(.rc-page) button, :where(.rc-page) textarea, :where(.rc-page) input { font: inherit; }
.rc-page a:focus-visible, .rc-page button:focus-visible, .rc-page textarea:focus-visible, .rc-page [tabindex]:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper-raised), 0 0 0 4px var(--accent); }
.rc-mono { font-family: var(--font-mono); }
.rc-long { overflow-wrap: anywhere; min-width: 0; }
.rc-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.rc-head > .l { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 320px; }
.rc-head > .r { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none; max-width: 100%; }
.rc-crumb { font-size: 12px; color: var(--ink-soft); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rc-crumb .sep { color: var(--ink-faint); }
.rc-crumb .here { color: var(--ink); }
.rc-title { font-family: var(--font-display); font-size: 22px; font-weight: 300; letter-spacing: -.01em; line-height: 1.25; margin: 0; }
.rc-sub { font-family: var(--font-display); font-style: italic; font-size: 13.5px; color: var(--ink-faint); margin: 0; }
.rc-state { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .05em; border-radius: 999px; padding: 2px 10px; white-space: nowrap;
  border: 1px solid var(--accent-2); color: var(--accent-2); background: var(--paper-raised); }
.rc-state[data-s="SEALED_LOCAL"], .rc-state[data-s="PUBLISHED"] { border-color: var(--good); color: var(--good); background: var(--paper-raised); }
.rc-state[data-s="NOT_PUBLISHABLE"] { border-color: var(--bad); color: var(--bad); background: var(--bad-bg); }
.rc-lifecycle { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-linkbtn { border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); padding: 5px 14px; font-family: var(--font-mono); font-size: 10px;
  font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.rc-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); min-width: 0; }
.rc-meta > span { overflow-wrap: anywhere; min-width: 0; }
.rc-banner { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border: 1px dashed var(--bad); border-radius: 8px; background: var(--bad-bg); padding: 10px 14px; }
.rc-banner .badge { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--bad); flex: none; }
.rc-banner .txt { font-size: 12px; color: var(--ink); line-height: 1.55; flex: 1 1 280px; min-width: 0; }
.rc-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); min-width: 0; }
.rc-ident { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.rc-cardhead { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; margin: 0; }
.rc-k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-soft); margin: 0; }
.rc-spec { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-rail { display: flex; align-items: stretch; flex-wrap: wrap; row-gap: 10px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.rc-rail > li { display: flex; align-items: center; min-width: 0; flex: 1 1 150px; max-width: 100%; }
.rc-node { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); padding: 7px 12px;
  min-width: 0; max-width: 100%; flex: 1 1 auto; color: inherit; }
a.rc-node { color: inherit; }
a.rc-node:hover { border-color: var(--accent); text-decoration: none; }
.rc-node .k { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-soft); }
.rc-node .v { font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.rc-node .sub { font-family: var(--font-mono); font-size: 9px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-node[data-tone="gold"] { border-color: var(--accent-2); box-shadow: inset 3px 0 0 var(--accent-2); }
.rc-node[data-tone="gold"] .v { color: var(--accent-2); }
.rc-node[data-tone="green"] { border-color: var(--good); box-shadow: inset 3px 0 0 var(--good); }
.rc-node[data-tone="green"] .v, .rc-node[data-tone="green"] .v a { color: var(--good); }
.rc-node[data-tone="dim"] { border-style: dashed; border-color: var(--line-strong); }
.rc-node[data-tone="dim"] .v { color: var(--ink-soft); }
.rc-arrow { padding: 0 8px; color: var(--ink-faint); font-size: 12px; align-self: center; }
.rc-taxrow { display: flex; gap: 14px; flex-wrap: wrap; border-top: 1px solid var(--line-soft); padding-top: 10px; min-width: 0; }
.rc-tax { flex: 1.3 1 380px; min-width: min(380px, 100%); display: flex; flex-direction: column; gap: 4px; }
.rc-tax table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rc-tax th { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); font-weight: 400; text-align: left;
  border-bottom: 1px solid var(--line-soft); padding: 0 0 3px; }
.rc-tax td { font-size: 11px; padding: 3px 0; border-bottom: 1px solid var(--line-soft); vertical-align: baseline; color: var(--ink-soft); line-height: 1.5; overflow-wrap: anywhere; }
.rc-tax .what { width: 210px; }
.rc-tax .state { width: 120px; }
.rc-tax td.state { font-family: var(--font-mono); font-size: 10px; font-weight: 600; }
.rc-tax td[data-s="UNCHANGED"] { color: var(--good); }
.rc-tax td[data-s="CHANGED"] { color: var(--bad); }
.rc-tax td[data-s="UNSET"] { color: var(--ink-soft); }
.rc-verdict { flex: 1 1 300px; min-width: min(300px, 100%); border-left: 1px solid var(--line-soft); padding-left: 14px; display: flex; flex-direction: column; gap: 5px; }
.rc-verdict .t { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--accent-2); overflow-wrap: anywhere; }
.rc-verdict .b { font-size: 11px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
.rc-packcard { overflow: hidden; }
.rc-packhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.rc-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.rc-ceiling, .rc-engcert { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border-radius: 3px; padding: 1px 7px; overflow-wrap: anywhere; }
.rc-ceiling { border: 1px solid var(--accent-2); background: var(--paper-raised); color: var(--accent-2); }
.rc-engcert { border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent); }
.rc-ceiling[data-ghost="true"], .rc-engcert[data-ghost="true"] { border-style: dashed; border-color: var(--line-strong); background: var(--paper-raised); color: var(--ink-soft); font-weight: 400; }
.rc-count { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.rc-pack { overflow-x: auto; min-width: 0; }
.rc-pack table { min-width: 960px; width: 100%; border-collapse: collapse; table-layout: fixed; }
.rc-pack thead th { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); font-weight: 400; text-align: left; padding: 5px 0;
  border-bottom: 1px solid var(--line-soft); }
.rc-pack td, .rc-pack tbody th { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line-soft); vertical-align: baseline; text-align: left; }
.rc-pack thead th:first-child, .rc-pack td:first-child { padding-left: 16px; }
.rc-pack thead th:last-child, .rc-pack td:last-child { padding-right: 16px; }
.rc-pack col.n { width: 42px; }
.rc-pack col.item { width: 250px; }
.rc-pack col.status { width: 96px; }
.rc-pack col.digest { width: 250px; }
.rc-pack col.source { width: 130px; }
.rc-pack tr[data-s="DEGRADED"] > td:first-child { box-shadow: inset 3px 0 0 var(--accent-2); }
.rc-pack tr[data-s="MISSING"] > * { background: var(--bad-bg); }
.rc-pack .n { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }
.rc-pack .item { font-size: 12px; font-weight: 500; text-transform: none; letter-spacing: normal; overflow-wrap: anywhere; color: var(--ink); }
.rc-status { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; }
.rc-status[data-s="COMPLETE"] { color: var(--good); }
.rc-status[data-s="DEGRADED"] { color: var(--accent-2); }
.rc-status[data-s="INPUT"] { color: var(--accent); }
.rc-status[data-s="MISSING"] { color: var(--bad); }
.rc-pack .digest { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-pack .digest[data-digest=""] { white-space: normal; overflow-wrap: anywhere; }
.rc-pack .source { font-family: var(--font-mono); font-size: 10px; overflow-wrap: anywhere; }
.rc-pack .source .off { color: var(--ink-soft); }
.rc-pack .note { font-size: 10.5px; color: var(--ink-soft); line-height: 1.5; overflow-wrap: anywhere; }
.rc-declared { display: block; margin-top: 3px; font-size: 11px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.rc-edit { margin-left: 6px; border: 0; background: transparent; color: var(--accent); font-family: var(--font-mono); font-size: 9.5px; padding: 0; cursor: pointer; }
.rc-edit[aria-disabled="true"] { color: var(--ink-soft); cursor: not-allowed; }
.rc-editor td { background: var(--paper); }
.rc-editor .box { display: flex; flex-direction: column; gap: 6px; max-width: 720px; }
.rc-editor textarea { width: 100%; min-height: 64px; resize: vertical; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper-raised); color: var(--ink);
  font-size: 12px; padding: 6px 8px; box-sizing: border-box; }
.rc-editor textarea[aria-invalid="true"] { border-color: var(--bad); }
.rc-editor .acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.rc-issue { color: var(--bad); font-size: 11px; }
.rc-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised);
  color: var(--ink); cursor: pointer; }
.rc-btn[data-primary="true"] { border-color: var(--accent); color: var(--accent); }
.rc-btn[aria-disabled="true"] { border-style: dashed; color: var(--ink-soft); cursor: not-allowed; }
.rc-packfoot { padding: 8px 16px; border-top: 1px solid var(--line-soft); background: var(--paper-sunken); font-size: 11px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
.rc-group3 { display: flex; gap: 14px; flex-wrap: wrap; align-items: stretch; min-width: 0; }
.rc-record { flex: 1.25 1 440px; min-width: min(440px, 100%); overflow: hidden; display: flex; flex-direction: column; }
.rc-record .h { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--line); }
.rc-copy { border: 0; background: transparent; color: var(--accent); font-family: var(--font-mono); font-size: 9.5px; padding: 0; cursor: pointer; }
.rc-yaml { flex: 1; padding: 10px 14px; background: var(--paper-raised); overflow-x: auto; margin: 0; }
.rc-yaml .line { display: flex; font-family: var(--font-mono); font-size: 10.5px; line-height: 1.75; white-space: nowrap; }
.rc-yaml .k { color: var(--ink-mute); width: 270px; flex: none; }
.rc-yaml .v { color: var(--ink); }
.rc-yaml .v[data-tone="gold"] { color: var(--accent-2); }
.rc-yaml .v[data-tone="red"] { color: var(--bad); }
.rc-yaml .v[data-tone="dim"] { color: var(--ink-mute); }
.rc-side { flex: 1 1 360px; min-width: min(360px, 100%); display: flex; flex-direction: column; gap: 14px; }
.rc-seal { border: 1px solid var(--accent-2); border-radius: 8px; background: var(--paper-raised); box-shadow: inset 3px 0 0 var(--accent-2); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-seal .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--accent-2); margin: 0; }
.rc-seal p { font-size: 11.5px; color: var(--ink); line-height: 1.6; margin: 0; }
.rc-seal p.sod { font-size: 10px; color: var(--ink-soft); line-height: 1.5; }
.rc-sealbtn { border: 1px solid var(--accent-2); border-radius: 6px; background: var(--accent-2); color: var(--accent-contrast); padding: 9px 14px; font-family: var(--font-mono);
  font-size: 11px; font-weight: 600; letter-spacing: .03em; cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.rc-sealbtn[aria-disabled="true"] { border: 1px dashed var(--line-strong); background: var(--paper); color: var(--ink-soft); cursor: not-allowed; }
.rc-confirm { border: 1px solid var(--accent-2); border-radius: 6px; background: var(--paper-raised); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
  font-size: 11.5px; line-height: 1.55; }
.rc-confirm .acts { display: flex; gap: 8px; flex-wrap: wrap; }
.rc-confirm .rc-btn[data-primary="true"] { border-color: var(--accent-2); background: var(--accent-2); color: var(--accent-contrast); }
.rc-blocked { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-notice { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; background: var(--paper-raised); font-size: 11px;
  line-height: 1.5; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-notice[data-outcome="conflict"], .rc-notice[data-outcome="denied"], .rc-notice[data-outcome="terminal"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.rc-notice[data-outcome="unavailable"] { border-color: var(--line-strong); background: var(--paper-sunken); color: var(--ink); }
.rc-notice[data-outcome="saved"], .rc-notice[data-outcome="sealed"], .rc-notice[data-outcome="published"] { border-color: var(--good); box-shadow: inset 3px 0 0 var(--good); color: var(--good); }
.rc-notice .code { font-family: var(--font-mono); font-size: 9px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-notice[data-outcome="conflict"] .code, .rc-notice[data-outcome="denied"] .code, .rc-notice[data-outcome="terminal"] .code { color: var(--bad); }
.rc-sealed { border: 1px solid var(--good); border-radius: 8px; background: var(--paper-raised); box-shadow: inset 3px 0 0 var(--good); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rc-sealed .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--good); margin: 0; }
.rc-sealed .id { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--good); overflow-wrap: anywhere; }
.rc-sealed .id a { color: var(--good); }
.rc-sealed p { font-size: 11px; color: var(--ink-soft); line-height: 1.55; margin: 0; overflow-wrap: anywhere; }
.rc-ghost { border: 1px dashed var(--line-strong); border-radius: 8px; background: var(--paper); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-ghost .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-soft); margin: 0; }
.rc-ghost p { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
.rc-mirrorrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); padding: 8px 12px; }
.rc-mirrorrow .gate { font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--accent); border: 1px solid var(--accent); border-radius: 3px; padding: 1px 6px; flex: none; }
.rc-mirrorrow .subj { font-family: var(--font-mono); font-size: 10.5px; flex: 1 1 170px; min-width: 0; overflow-wrap: anywhere; }
.rc-mirrorrow .st, .rc-mirrorrow .sla { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); flex: 0 1 auto; min-width: 0; overflow-wrap: anywhere; }
.rc-mirrormeta { display: flex; gap: 4px 10px; flex-wrap: wrap; font-size: 10px; color: var(--ink-soft); }
/* VD-FG-05-11: a separator travels with the item before it, so a wrapped line never starts with "·". */
.rc-mirrormeta .rc-mseg { display: inline-flex; gap: 10px; }
.rc-claims { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rc-claims legend { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--accent-2); padding: 0; margin-bottom: 2px; }
.rc-claims label { display: flex; gap: 6px; align-items: baseline; font-family: var(--font-mono); font-size: 10.5px; color: var(--ink); overflow-wrap: anywhere; min-width: 0; }
.rc-pubfacts { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); overflow-wrap: anywhere; margin: 0; }
.rc-unknown { border: 1px dashed var(--accent-2); border-radius: 8px; background: var(--paper-raised); box-shadow: inset 3px 0 0 var(--accent-2); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-unknown .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--accent-2); margin: 0; }
.rc-unknown p { font-size: 11px; color: var(--ink); line-height: 1.55; margin: 0; overflow-wrap: anywhere; }
.rc-mirror { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); padding: 14px 16px; display: flex;
  flex-direction: column; gap: 8px; min-width: 0; }
.rc-mirror .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-soft); margin: 0; }
.rc-mirror p { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; overflow-wrap: anywhere; }
.rc-mirror .facts { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-mirror .superseded { font-size: 10.5px; color: var(--bad); }
.rc-stale { font-family: var(--font-mono); font-size: 10px; color: var(--accent-2); overflow-wrap: anywhere; }
.rc-mstatus { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid var(--accent-2); border-radius: 3px; padding: 1px 7px; background: var(--paper-raised);
  color: var(--accent-2); flex: none; }
.rc-mstatus[data-s="APPROVED"], .rc-mstatus[data-s="APPROVED_WITH_CONDITION"] { border-color: var(--good); color: var(--good); }
.rc-mstatus[data-s="DENIED"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.rc-mstatus[data-s="EXPIRED"], .rc-mstatus[data-s="CHANGES_REQUESTED"] { border-color: var(--line-strong); color: var(--ink-soft); }
.rc-reason { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-soft); font-size: 9.5px; }
.rc-pending { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); padding: 10px 16px; }
.rc-skel { display: block; border-radius: 4px; background: var(--paper-sunken); height: 12px; }
.rc-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.rc-foot .t { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); margin: 0; font-weight: 400; }
.rc-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
@media (max-width: 900px) {
  .rc-verdict { border-left: 0; padding-left: 0; border-top: 1px solid var(--line-soft); padding-top: 10px; }
}
@media (max-width: 720px) {
  .rc-tax .what { width: 140px; }
  .rc-tax .state { width: 84px; }
  .rc-yaml .k { width: 230px; }
}
`;

/* ------------------------------------------------------------------ parts */

const RUNS_ROOT = "/research/quantbt/runs";

function runHref(runId: string, tail: string): string {
  return `${RUNS_ROOT}/${encodeURIComponent(runId)}/${tail}`;
}

function hubHref(runId: string): string {
  return deepDiveHref(runHref(runId, "evidence"), { ...DEFAULT_CURSOR, stage: "claim" });
}

/** A reason code, with its sentence when the screen knows one. The code is always printed. */
function Reason({ code, what }: { code: string | null | undefined; what?: string }) {
  if (!code) return null;
  const sentence = rcReasonSentence(code);
  return (
    <span className="rc-reason" data-reason-code={code} data-reason-for={what}>
      {sentence ? `${sentence} · ` : ""}
      {code}
    </span>
  );
}

/** A value the server did not send: the state word and the reason, never a digit. */
function Absent({ what, availability }: { what?: string; availability: RcAvailability }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what ?? ""} data-absent-state={availability.state}>
      <span className="rc-absent">
        {what ? `${what} — ` : ""}
        {RC_WITHHELD_WORDS[availability.state]}
      </span>
      <Reason code={reasonOf(availability)} />
    </span>
  );
}

/** A server-supplied path becomes a link only when it is a same-origin path. */
function isLocalPath(href: string | null | undefined): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
}

function Skeleton({ widths = [72, 96, 60] }: { widths?: number[] }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 px-4 py-3">
      {widths.map((width, index) => (
        <span key={index} aria-hidden="true" className="rc-skel" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

/** What a block shows when there is no composition to show: a skeleton, or its state word. */
function Pending({ state }: { state: ResearchState }) {
  if (state.state === "loading") return <Skeleton />;
  return (
    <p className="rc-pending" data-block-withheld={state.state}>
      {state.state} — nothing from this block is shown
    </p>
  );
}

/** Inline confirmation (spec 11 §5.6: no optimistic write). Focus moves to the confirm button. */
function Confirm({ label, sentence, detail, confirm, onConfirm, onCancel, action }: {
  label: string;
  sentence: string;
  detail: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  action: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="rc-confirm" role="alertdialog" aria-label={label} data-confirm={action}>
      <span>{sentence}</span>
      <span className="rc-mono rc-long" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
        {detail}
      </span>
      <span className="acts">
        <button ref={ref} type="button" className="rc-btn" data-primary="true" data-action={`confirm-${action}`} onClick={onConfirm}>
          {confirm}
        </button>
        <button type="button" className="rc-btn" data-action={`cancel-${action}`} onClick={onCancel}>
          Cancel
        </button>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- header */

function Header({ runId, here, chips }: { runId: string | null; here: ReactNode; chips: ReactNode }) {
  return (
    <header className="rc-head" data-panel="header">
      <div className="l">
        <nav className="rc-crumb" aria-label="Breadcrumb">
          {runId ? (
            <>
              <Link to={hubHref(runId)} data-action="back-to-hub">
                Evidence Flow
              </Link>
              <span className="sep">/</span>
              <span className="rc-mono" data-crumb-run title={runId}>
                {shortId(runId)}
              </span>
              <span className="sep">/</span>
            </>
          ) : null}
          <span className="here rc-long">{here}</span>
        </nav>
        <h2 className="rc-title">{RC_TITLE}</h2>
        <p className="rc-sub" data-subtitle>
          {RC_SUBTITLE}
        </p>
      </div>
      <div className="r">
        {chips}
        {runId ? (
          <Link to={runHref(runId, "report")} className="rc-linkbtn" data-action="run-report">
            run report
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/** Spec 11 §2.1: DRAFT gold / PUBLISHED green / NOT_PUBLISHABLE red; PUBLISHED only from a server fact. */
export function stateChipOf(compose: RcCompose, publication: RcPublication | null): "NOT_PUBLISHABLE" | "PUBLISHED" | RcCompose["state"] {
  if (compose.run.binding === null) return "NOT_PUBLISHABLE";
  if (isDelivered(compose, publication)) return "PUBLISHED";
  return compose.state;
}

function StateChip({ value }: { value: string }) {
  return (
    <span className="rc-state" data-s={value} data-state-chip={value}>
      {value}
    </span>
  );
}

function SealChips({ seal, delivered }: { seal: RcLocalSeal; delivered: boolean }) {
  if (seal.state !== "SEALED_LOCAL") return null;
  return (
    <>
      {delivered ? null : (
        <span className="rc-state" data-s="SEALED_LOCAL" data-seal-chip title="an immutable Portal-local pack exists">
          SEALED_LOCAL
        </span>
      )}
      <span className="rc-lifecycle" data-lifecycle>
        {seal.delivery_state ?? "delivery not published"} · {seal.approval_state ?? "approval not published"}
      </span>
    </>
  );
}

/**
 * The server's code lives behind a disclosure, never in the sentence: on
 * screen a 403 and a 404 must read the same (audit F-04, X3 2026-09-26).
 */
function CodeDetail({ code, className }: { code: string; className: string }) {
  return (
    <details className={className}>
      <summary>details</summary>
      <span data-error-code>{code}</span>
    </details>
  );
}

function Notice({ state, requestId, code, onRetry, inFlight }: {
  state: ResearchState;
  requestId: string | null;
  code: string | null;
  onRetry: () => void;
  inFlight: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-panel="notice" data-rc-notice={state.state}>
      <ResearchPanel title="release candidate" state={state} minBodyHeight={0} />
      {code ? <CodeDetail code={code} className="rc-reason" /> : null}
      {requestId ? (
        <span className="rc-reason" data-request-id>
          request {requestId}
        </span>
      ) : null}
      {state.mayRetry && !inFlight ? (
        <span>
          <button type="button" className="rc-btn" data-action="retry" onClick={onRetry}>
            read again
          </button>
        </span>
      ) : null}
      {state.state === "denied" || state.state === "terminal" ? (
        <span className="rc-reason">
          <Link to={RUNS_ROOT} data-action="run-library">
            ← Run Library
          </Link>
        </span>
      ) : null}
    </div>
  );
}

function Banner({ availability }: { availability: RcAvailability }) {
  const [before, mono, middle, link, after] = NOT_PUBLISHABLE_COPY;
  return (
    <div className="rc-banner" data-panel="banner" data-banner="NOT_PUBLISHABLE" role="note">
      <span className="badge">{NOT_PUBLISHABLE_BADGE}</span>
      <span className="txt">
        {before}
        <span className="rc-mono">{mono}</span>
        {middle}
        <Link to={`${RUNS_ROOT}/new`} data-action="new-run">
          {link}
        </Link>
        {after}{" "}
        <span className="rc-reason" data-reason-code={reasonOf(availability)}>
          {reasonOf(availability)}
        </span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- identity */

function Rail({ compose, sealedId }: { compose: RcCompose; sealedId: string | null }) {
  const nodes = compose.rail;
  return (
    <ol className="rc-rail" data-rail aria-label="lineage rail">
      {nodes.map((node, index) => {
        const label = RAIL_LABEL[node.key] ?? node.key;
        const title = node.detail ? `${label} — ${node.value} · ${node.detail}` : `${label} — ${node.value}`;
        const linkedPack = node.key === "release_candidate" && sealedId !== null && node.value === sealedId;
        const route = railRoute(node, compose);
        const body = (
          <>
            <span className="k">{label}</span>
            <span className="v" data-rail-value>
              {linkedPack ? (
                <Link to={releaseCandidatePackHref(node.value)} data-action="open-pack">
                  {shortId(node.value)}
                </Link>
              ) : (
                shortId(node.value)
              )}
            </span>
            {node.detail !== null ? (
              <span className="sub" data-rail-detail>
                {shortId(node.detail)}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={`${node.key}-${index}`}>
            {route ? (
              <Link className="rc-node" to={route} data-rail-node={node.key} data-tone={node.tone} title={title} data-rail-link={route}>
                {body}
              </Link>
            ) : (
              <div className="rc-node" data-rail-node={node.key} data-tone={node.tone} title={title}>
                {body}
              </div>
            )}
            {index < nodes.length - 1 ? (
              <span className="rc-arrow" aria-hidden="true">
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Taxonomy({ rows, comparison }: { rows: readonly RcTaxonomyRow[]; comparison: RcCompose["published_comparison"] }) {
  return (
    <div className="rc-tax" data-panel-part="taxonomy">
      <p className="rc-k" data-taxonomy-caption data-last-rc={comparison.last_release_candidate_id ?? ""}>
        {TAXONOMY_CAPTION}
        {comparison.last_release_candidate_id !== null ? (
          <Link className="rc-mono" to={releaseCandidatePackHref(comparison.last_release_candidate_id)} data-action="open-last-rc">
            {comparison.last_release_candidate_id}
          </Link>
        ) : (
          <Absent what="last published rc" availability={comparison.availability} />
        )}
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col" className="what">
              what
            </th>
            <th scope="col" className="state">
              state
            </th>
            <th scope="col">consequence (§3.4)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.what}-${index}`} data-taxonomy-row={row.what} data-taxonomy-state={row.state}>
              <td className="what">{row.what}</td>
              <td className="state" data-s={row.state}>
                {row.state}
              </td>
              <td>{row.consequence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdentityBlock({ compose, state }: { compose: RcCompose | null; state: ResearchState }) {
  return (
    <section className="rc-card rc-ident" data-panel="identity" aria-label="identity and lineage">
      <div className="rc-cardhead">
        <h3 className="rc-k">{IDENTITY_LABEL}</h3>
        <span className="rc-spec">{IDENTITY_SPEC}</span>
      </div>
      {compose ? (
        <>
          <Rail compose={compose} sealedId={compose.local_seal.state === "SEALED_LOCAL" ? compose.local_seal.release_candidate_id : null} />
          <div className="rc-taxrow">
            <Taxonomy rows={compose.taxonomy} comparison={compose.published_comparison} />
            <div className="rc-verdict" data-panel-part="verdict">
              <h4 className="rc-k">{VERDICT_LABEL}</h4>
              <span className="t" data-verdict-title>
                {compose.gate_verdict.title}
              </span>
              <p className="b" data-verdict-body>
                {compose.gate_verdict.body}
              </p>
            </div>
          </div>
        </>
      ) : (
        <Pending state={state} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ pack */

function CertChips({ axes }: { axes: RcCompose["certification_axes"] | null }) {
  if (!axes) {
    return (
      <>
        <span className="rc-ceiling" data-ghost="true" title={CEILING_TITLE} data-cert="methodology_claim">
          claim ceiling — not part of the frozen pack
        </span>
        <span className="rc-engcert" data-ghost="true" title={ENGCERT_TITLE} data-cert="engine_execution_contract">
          engine cert — not part of the frozen pack
        </span>
      </>
    );
  }
  return (
    <>
      <CertChip className="rc-ceiling" axis={axes.methodology_claim} title={CEILING_TITLE} name="methodology_claim" present="claim ceiling" />
      <CertChip className="rc-engcert" axis={axes.engine_execution_contract} title={ENGCERT_TITLE} name="engine_execution_contract" present="engine cert" />
    </>
  );
}

function CertChip({ className, axis, title, name, present }: {
  className: string;
  axis: RcCertificationAxis;
  title: string;
  name: string;
  present: string;
}) {
  const shown = axis.value !== null && axis.availability.state === "AVAILABLE";
  const code = axis.availability.reason_code;
  const sentence = rcReasonSentence(code);
  return (
    <span
      className={className}
      data-ghost={shown ? "false" : "true"}
      title={shown ? title : `${title} — ${sentence ?? RC_WITHHELD_WORDS[axis.availability.state]}${code ? ` (${code})` : ""}`}
      data-cert={name}
      data-reason-code={shown ? undefined : (code ?? axis.availability.state)}
    >
      {shown ? `${present} ${axis.value}` : `${present} — ${RC_WITHHELD_WORDS[axis.availability.state]}`}
    </span>
  );
}

function statusTitle(item: RcPackItem): string {
  return item.status === "MISSING" ? reasonOf(item.availability) : STATUS_TITLE[item.status];
}

function SourceCell({ item, route }: { item: RcPackItem; route: string | null }) {
  if (route) {
    return (
      <Link to={route} data-source-link={item.key} data-source-href={route}>
        {item.source.label}
      </Link>
    );
  }
  const title = item.key === "ALPHA_VERSION_PASSPORT" ? ALPHA360_TITLE : declarationKey(item.key) ? "your own declaration — edited on this row" : NO_SOURCE_LINK_TITLE;
  return (
    <span className="off" title={title} data-source-unlinked>
      {item.source.label}
    </span>
  );
}

export interface DeclarationEditor {
  /** Text in the open editors, by row. A row with no entry is closed. */
  edits: Partial<Record<DeclarationRowKey, string>>;
  /** Why editing is off, or null when a row may be edited. */
  lockedReason: string | null;
  /** False once the server says no draft edit is admitted, or the candidate is published (spec T07): no edit button at all. */
  editable: boolean;
  pending: boolean;
  /** An open editor holds text that differs from the saved draft. */
  dirty: boolean;
  /** Field-path problems found on the last save attempt (the server stays authoritative). */
  issues: DeclarationIssue[];
  open: (key: DeclarationRowKey) => void;
  change: (key: DeclarationRowKey, text: string) => void;
  cancel: (key: DeclarationRowKey) => void;
  save: () => void;
  /** Why save is off, or null. */
  saveBlocked: string | null;
  notice: ReactNode;
}

function DeclarationRow({ item, editor }: { item: RcPackItem; editor: DeclarationEditor }) {
  const key = declarationKey(item.key)!;
  const field = DECLARATION_FIELD[key];
  const text = editor.edits[key] ?? "";
  const labelId = useId();
  const blockedId = useId();
  const issues = editor.issues.filter((issue) => issue.path === field || issue.path === "(body)");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <tr className="rc-editor" data-editor={item.key}>
      <td colSpan={6}>
        <div className="box">
          <label id={labelId} className="rc-k" htmlFor={`${labelId}-input`}>
            {item.item} — declaration
          </label>
          <textarea
            ref={ref}
            id={`${labelId}-input`}
            data-declaration-input={item.key}
            data-declaration-field={field}
            value={text}
            aria-invalid={issues.length > 0 || undefined}
            aria-describedby={issues.length > 0 ? `${labelId}-issues` : undefined}
            onChange={(event) => editor.change(key, event.target.value)}
            readOnly={editor.lockedReason !== null}
          />
          {issues.length > 0 ? (
            <span id={`${labelId}-issues`} className="flex flex-col">
              {issues.map((issue) => (
                <span key={`${issue.path}:${issue.message}`} className="rc-issue" data-issue-path={issue.path} role="alert">
                  <span className="rc-mono">{issue.path}</span> — {issue.message}
                </span>
              ))}
            </span>
          ) : null}
          <div className="acts">
            <button
              type="button"
              className="rc-btn"
              data-primary="true"
              data-action="save-declaration"
              aria-disabled={editor.saveBlocked !== null || editor.pending || undefined}
              aria-describedby={editor.saveBlocked !== null ? blockedId : undefined}
              aria-busy={editor.pending || undefined}
              onClick={() => {
                if (editor.saveBlocked === null && !editor.pending) editor.save();
              }}
            >
              {editor.pending ? "saving…" : "save declaration"}
            </button>
            <button type="button" className="rc-btn" data-action="cancel-declaration" onClick={() => editor.cancel(key)}>
              cancel
            </button>
            {editor.saveBlocked !== null ? (
              <span id={blockedId} className="rc-blocked" data-save-blocked>
                {editor.saveBlocked}
              </span>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function PackRow({ item, route, declared, editor }: {
  item: RcPackItem;
  route: string | null;
  declared: string | null | undefined;
  editor: DeclarationEditor | null;
}) {
  const decl = declarationKey(item.key);
  const editing = decl !== null && editor !== null && editor.edits[decl] !== undefined;
  return (
    <>
      <tr data-pack-row={item.key} data-s={item.status} data-status={item.status} data-n={item.n}>
        <td className="n">{item.n}</td>
        <th scope="row" className="item">
          {item.item}
        </th>
        <td>
          <span className="rc-status" data-s={item.status} title={statusTitle(item)} data-status-chip>
            {item.status}
          </span>
        </td>
        <td className="digest" data-digest={item.digest ?? ""} title={item.digest ?? undefined}>
          {item.digest !== null ? item.digest : decl !== null ? <span className="rc-absent">— not declared</span> : <Absent availability={item.availability} />}
        </td>
        <td className="source">
          <SourceCell item={item} route={route} />
        </td>
        <td className="note">
          {item.note}
          {item.status === "MISSING" || item.status === "DEGRADED" ? (
            <>
              {" "}
              <Reason code={item.availability.reason_code} what={item.key} />
            </>
          ) : null}
          {decl !== null ? (
            <>
              <span className="rc-declared" data-declared={item.key}>
                {declared ? declared : <span className="rc-absent">not declared</span>}
              </span>
              {editor !== null && editor.editable && !editing ? (
                <button
                  type="button"
                  className="rc-edit"
                  data-action="edit-declaration"
                  data-edit={item.key}
                  aria-label={`edit ${item.item}`}
                  aria-disabled={editor.lockedReason !== null || undefined}
                  title={editor.lockedReason ?? undefined}
                  onClick={() => {
                    if (editor.lockedReason === null) editor.open(decl);
                  }}
                >
                  edit
                </button>
              ) : null}
            </>
          ) : null}
        </td>
      </tr>
      {editing && editor !== null ? <DeclarationRow item={item} editor={editor} /> : null}
    </>
  );
}

function PackBlock({ items, runId, alphaId, counts, axes, declarations, editor, state }: {
  items: readonly RcPackItem[] | null;
  runId: string | null;
  alphaId: string | null;
  counts: RcPackCounts | null;
  axes: RcCompose["certification_axes"] | null;
  declarations: RcDeclarations | null;
  editor: DeclarationEditor | null;
  state: ResearchState;
}) {
  return (
    <section className="rc-card rc-packcard" data-panel="pack" aria-label="evidence pack">
      <div className="rc-packhead">
        <h3 className="rc-k">{PACK_HEADER}</h3>
        <div className="rc-chips">
          {items ? <CertChips axes={axes} /> : null}
          {counts ? (
            <span className="rc-count" data-pack-counts>
              {counts.complete} COMPLETE · {counts.degraded} DEGRADED · {counts.input} INPUT · {counts.missing} MISSING
            </span>
          ) : items ? (
            <span className="rc-count" data-pack-counts-absent>
              counts are not part of the frozen pack
            </span>
          ) : null}
        </div>
      </div>
      {items ? (
        <div className="rc-pack" data-pack-scroll tabIndex={0} role="region" aria-label="evidence pack rows (scrolls sideways)">
          <table>
            <colgroup>
              <col className="n" />
              <col className="item" />
              <col className="status" />
              <col className="digest" />
              <col className="source" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">item</th>
                <th scope="col">status</th>
                <th scope="col">digest / value</th>
                <th scope="col">source</th>
                <th scope="col">note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const decl = declarationKey(item.key);
                return (
                  <PackRow
                    key={`${item.key}-${item.n}`}
                    item={item}
                    route={runId !== null ? packSourceRoute(item, runId, alphaId) : null}
                    declared={decl !== null && declarations ? declarations[DECLARATION_FIELD[decl]] : undefined}
                    editor={editor}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Pending state={state} />
      )}
      {editor?.notice ?? null}
      <p className="rc-packfoot">
        DEGRADED travels <em>as</em> DEGRADED — the reviewer sees it. MISSING blocks publish. The two INPUT rows are the researcher's own signed declarations.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- record */

type CopyState = "idle" | "copied" | "failed";

function RecordBlock({ fields, state }: { fields: readonly RcField[] | null; state: ResearchState }) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const flash = (next: CopyState) => {
    setCopy(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setCopy("idle");
    }, 1500);
  };

  const onCopy = () => {
    if (!fields) return;
    const text = yamlText(fields);
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      flash("failed");
      return;
    }
    clipboard.writeText(text).then(
      () => flash("copied"),
      () => flash("failed"),
    );
  };

  return (
    <section className="rc-card rc-record" data-panel="record" aria-label="record preview">
      <div className="h">
        <h3 className="rc-k">{RECORD_HEADER}</h3>
        <button type="button" className="rc-copy" data-action="copy-yaml" aria-disabled={fields === null || undefined} aria-live="polite" onClick={onCopy}>
          {copy === "copied" ? "✓ copied" : copy === "failed" ? "copy unavailable" : "copy yaml"}
        </button>
      </div>
      {fields ? (
        <div className="rc-yaml" data-yaml role="list" aria-label="record fields" tabIndex={0}>
          {fields.map((field) => (
            <div key={field.key} className="line" role="listitem" data-yaml-key={field.key} data-yaml-value={field.value ?? ""}>
              <span className="k">{field.key}</span>
              <span className="v" data-tone={field.tone} title={field.label}>
                {yamlValue(field)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Pending state={state} />
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- cards */

function RefusalNotice({ refusal, op }: { refusal: RcWriteRefusal; op: string }) {
  return (
    <div className="rc-notice" data-write-notice={op} data-outcome={refusal.outcome} role="alert">
      <span>{refusal.message}</span>
      {refusal.code ? <CodeDetail code={refusal.code} className="code" /> : null}
      {refusal.requestId ? (
        <span className="code" data-request-id>
          request {refusal.requestId}
        </span>
      ) : null}
      {/* FG-05: a 401 already raised the shell's Frame 01D sign-in; no second sign-in link here. */}
    </div>
  );
}

function WriteNotice({ slot, op }: { slot: RcWriteSlot; op: RcWriteOp }) {
  if (slot.state === "refused" && slot.op === op) return <RefusalNotice refusal={slot.refusal} op={op} />;
  if (op === "patch" && slot.state === "saved") {
    return (
      <div className="rc-notice" data-write-notice="patch" data-outcome="saved" role="status">
        declaration saved — the composition above is the server's answer to it
      </div>
    );
  }
  if (op === "seal" && slot.state === "sealed") {
    return (
      <div className="rc-notice" data-write-notice="seal" data-outcome="sealed" role="status">
        <span>sealed locally</span>
        <span className="code" data-seal-response-id>
          {slot.seal.release_candidate_id}
        </span>
      </div>
    );
  }
  return null;
}

function SealCard({ compose, controller, dirty, publishing }: {
  compose: RcCompose | null;
  controller: ReleaseCandidateController;
  dirty: boolean;
  publishing: boolean;
}) {
  const reasonId = useId();
  const [confirming, setConfirming] = useState(false);
  const pending = controller.write.state === "pending" || publishing;
  const sealing = controller.write.state === "pending" && controller.write.op === "seal";
  let blocked: { label: string; code: string | null } | null = null;
  if (!compose) blocked = { label: "the composition has not been read", code: null };
  else if (controller.writesLocked) blocked = { label: "writes are off — access changed", code: null };
  else if (!compose.actions.may_seal) {
    const code = compose.actions.seal_blocked_reason;
    blocked = { label: rcReasonSentence(code) ?? "the server does not allow a local seal of this composition", code };
  } else if (dirty) blocked = { label: SEAL_DIRTY, code: null };
  else if (compose.draft.draft_id === null) blocked = { label: DRAFT_NOT_PERSISTED, code: null };
  else if (pending) blocked = { label: sealing ? "sealing…" : "another write is in flight", code: null };

  useEffect(() => {
    if (blocked !== null) setConfirming(false);
  }, [blocked]);

  return (
    <section className="rc-seal" data-panel="seal" aria-label="local seal">
      <h3 className="k">local seal</h3>
      <p>{SEAL_SENTENCE}</p>
      {confirming && blocked === null && compose ? (
        <Confirm
          label="confirm local seal"
          action="local-seal"
          sentence={SEAL_CONFIRM}
          confirm={SEAL_CONFIRM_BUTTON}
          detail={`draft revision ${compose.draft.revision} · source ${compose.source_fingerprint}`}
          onConfirm={() => {
            setConfirming(false);
            controller.seal();
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button
          type="button"
          className="rc-sealbtn"
          data-action="local-seal"
          data-seal-enabled={blocked === null ? "true" : "false"}
          aria-disabled={blocked !== null || undefined}
          aria-describedby={blocked !== null ? reasonId : undefined}
          aria-busy={sealing || undefined}
          onClick={() => {
            if (blocked === null) setConfirming(true);
          }}
        >
          {sealing ? "sealing…" : SEAL_LABEL}
        </button>
      )}
      {blocked !== null ? (
        <span id={reasonId} className="rc-blocked" data-seal-blocked={blocked.code ?? "LOCAL"}>
          {blocked.label}
          {blocked.code ? ` · ${blocked.code}` : ""}
        </span>
      ) : null}
      <WriteNotice slot={controller.write} op="seal" />
    </section>
  );
}

function SealedCard({ seal, replayed }: {
  seal: {
    release_candidate_id: string | null;
    pack_digest: string | null;
    sealed_at_utc_ms: number | null;
    delivery_state: string | null;
    approval_state: string | null;
    availability: RcAvailability;
  };
  replayed: boolean;
}) {
  return (
    <section className="rc-sealed" data-panel="sealed" data-sealed={seal.release_candidate_id ?? ""} aria-label="sealed locally">
      <h3 className="k">sealed locally — immutable</h3>
      <span className="id" data-sealed-id>
        {seal.release_candidate_id !== null ? (
          <Link to={releaseCandidatePackHref(seal.release_candidate_id)} data-action="open-pack">
            {seal.release_candidate_id}
          </Link>
        ) : (
          <Absent what="release candidate id" availability={seal.availability} />
        )}
      </span>
      <p className="rc-mono" data-sealed-facts>
        sealed_at {seal.sealed_at_utc_ms !== null ? iso(seal.sealed_at_utc_ms) : "not published"} · pack digest {seal.pack_digest ?? "not published"}
      </p>
      <p className="rc-mono" data-sealed-lifecycle>
        <span data-delivery-state={seal.delivery_state ?? ""}>{seal.delivery_state ?? "delivery not published"}</span> ·{" "}
        <span data-approval-state={seal.approval_state ?? ""}>{seal.approval_state ?? "approval not published"}</span>
      </p>
      {seal.availability.state !== "AVAILABLE" ? (
        <p data-sealed-availability>
          <Absent what="this seal" availability={seal.availability} />
        </p>
      ) : null}
      {replayed ? <p data-seal-replayed>{SEALED_REPLAY}</p> : null}
      <p>{SEALED_SENTENCE}</p>
    </section>
  );
}

/** The publication read's own failure, in words, with its code and request id. */
function ReadFailure({ view, retry }: { view: RcPublicationView; retry?: () => void }) {
  if (view.state === "fresh" || view.state === "idle" || view.state === "loading") return null;
  const failure: RcReadFailure = view.failure;
  const transient = view.state === "stale" || view.state === "unavailable";
  const words =
    view.state === "stale"
      ? `publication as of ${iso(view.publication.as_of_utc_ms)} — the last read did not answer; it is read again in ${Math.round(view.retryInMs / 1000)} s`
      : PUBLICATION_READ_WORDS[view.state];
  return (
    <div
      className={view.state === "stale" ? "rc-stale" : "rc-notice"}
      data-outcome={transient ? "unavailable" : "denied"}
      data-publication-read={view.state}
      role={transient ? "status" : "alert"}
    >
      <span>{words}</span>
      {failure.code || failure.status ? (
        <CodeDetail code={failure.code ?? `HTTP ${failure.status}`} className="code" />
      ) : null}
      {failure.requestId ? (
        <span className="code" data-request-id>
          request {failure.requestId}
        </span>
      ) : null}
      {retry && view.state !== "session" && view.state !== "denied" ? (
        <span>
          <button type="button" className="rc-btn" data-action="retry-publication" onClick={retry}>
            read again
          </button>
        </span>
      ) : null}
      {/* FG-05: a 401 already raised the shell's Frame 01D sign-in; no second sign-in link here. */}
    </div>
  );
}

/**
 * FG-05: the conflicting approval and the downstream code the server recorded
 * for this publication, as sent. The approval becomes a link only when the
 * server's href is a same-origin path. Nothing is decided from them.
 */
function PublicationConflict({ publication }: { publication: RcPublication | null }) {
  if (publication === null) return null;
  const approvalId = publication.conflicting_approval_id ?? null;
  const code = publication.downstream_code ?? null;
  if (approvalId === null && code === null) return null;
  const href = publication.conflicting_approval_href ?? null;
  return (
    <p className="rc-pubfacts" data-publication-conflict={approvalId ?? ""} data-downstream-code={code ?? ""}>
      {approvalId !== null ? (
        <>
          conflicting approval{" "}
          {isLocalPath(href) ? (
            <Link to={href} data-action="open-conflicting-approval">
              {approvalId}
            </Link>
          ) : (
            <span data-conflicting-approval-unrouted>{approvalId}</span>
          )}
        </>
      ) : null}
      {approvalId !== null && code !== null ? " · " : null}
      {code !== null ? (
        <>
          downstream code <Reason code={code} what="downstream" />
        </>
      ) : null}
    </p>
  );
}

/** Why the publish button is not offered right now, first reason first. The server's reasons are authoritative. */
export function publishBlock(input: {
  compose: RcCompose | null;
  view: RcPublicationView;
  writesLocked: boolean;
  busy: boolean;
  publishing: boolean;
  claim: string | null;
}): { label: string; code: string | null } | null {
  const { compose, view } = input;
  if (!compose) return { label: "the composition has not been read", code: null };
  if (compose.run.binding === null) return { label: PUBLISH_UNBOUND_LABEL, code: "P21_SCRATCH_RUN_UNBOUND" };
  if (input.writesLocked) return { label: "writes are off — access changed", code: null };
  if (!compose.actions.publish.enabled) {
    const code = compose.actions.publish.blocked_reason;
    return { label: rcReasonSentence(code) ?? "the server does not offer publish for this composition", code };
  }
  if (view.state !== "fresh") {
    if (view.state === "stale") return { label: "the last publication read is stale — publish waits for a fresh read", code: view.failure.code };
    return { label: PUBLICATION_READ_WORDS[view.state], code: view.state === "idle" || view.state === "loading" ? null : view.failure.code };
  }
  const publication = view.publication;
  if (!publication.may_publish || publication.blocked_reason !== null) {
    const code = publication.blocked_reason;
    return { label: rcReasonSentence(code) ?? "the server does not offer publish for this candidate", code };
  }
  const claims = publication.source.eligible_methodology_claim_ids;
  if (claims.length === 0) return { label: CLAIM_NONE, code: null };
  if (claims.length > 1 && (input.claim === null || !claims.includes(input.claim))) return { label: CLAIM_REQUIRED, code: null };
  if (input.publishing) return { label: PUBLISHING_LABEL, code: null };
  if (input.busy) return { label: "another write is in flight", code: null };
  return null;
}

function PublishWriteNotice({ publication }: { publication: RcPublicationController }) {
  const slot = publication.write;
  if (slot.state === "refused") return <RefusalNotice refusal={slot.refusal} op="publish" />;
  if (slot.state === "answered") {
    const answer = slot.answer;
    return (
      <div className="rc-notice" data-write-notice="publish" data-outcome={answer.state === "DELIVERED" ? "published" : "unavailable"} role="status">
        <span>{answer.state === "DELIVERED" ? (answer.replayed ? "already published — same approval" : "published") : `publication ${answer.state}`}</span>
        <span className="code" data-publication-answer={answer.state}>
          {answer.state} · {answer.published?.approval_id ?? "no approval attached"}
          {answer.blocked_reason ? ` · ${answer.blocked_reason}` : ""}
        </span>
      </div>
    );
  }
  return null;
}

/** Hi-fi draft branch: one button behind a confirmation (X1-D01). */
function PublishCard({ compose, controller, publication }: {
  compose: RcCompose | null;
  controller: ReleaseCandidateController;
  publication: RcPublicationController;
}) {
  const reasonId = useId();
  const claimName = useId();
  const [claim, setClaim] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const view = publication.view;
  const releaseCandidateId = compose?.local_seal.release_candidate_id ?? null;
  const claims = view.state === "fresh" ? view.publication.source.eligible_methodology_claim_ids : [];
  const publishing = publication.write.state === "pending";
  const blocked = publishBlock({
    compose,
    view,
    writesLocked: controller.writesLocked,
    busy: controller.write.state === "pending",
    publishing,
    claim,
  });
  useEffect(() => {
    if (blocked !== null) setConfirming(false);
  }, [blocked]);
  const [before, after] = PUBLISH_SENTENCE;
  /* The button names the action (hi-fi); why it is off is said once, beside it (aria-describedby). */
  const label = publishing
    ? PUBLISHING_LABEL
    : blocked?.code === "P21_SCRATCH_RUN_UNBOUND"
      ? PUBLISH_UNBOUND_LABEL
      : releaseCandidateId !== null
        ? publishButtonLabel(releaseCandidateId)
        : PUBLISH_BLOCKED_LABEL;
  const choice = claims.length === 1 ? claims[0]! : claim;

  return (
    <section className="rc-seal" data-panel="publish" aria-label="publish" data-publish-state={view.state === "fresh" ? view.publication.state : view.state}>
      <h3 className="k">{PUBLISH_LABEL}</h3>
      <p data-publish-sentence>
        {before}
        {releaseCandidateId !== null ? (
          <span className="rc-mono" data-publish-rc>
            {releaseCandidateId}
          </span>
        ) : (
          <span className="rc-mono" data-publish-rc-absent>
            rc_(draft)
          </span>
        )}
        {after}
      </p>
      {view.state === "fresh" && claims.length > 1 && view.publication.may_publish ? (
        <fieldset className="rc-claims" data-claim-choice>
          <legend>{CLAIM_LEGEND}</legend>
          {claims.map((id) => (
            <label key={id}>
              <input
                type="radio"
                name={claimName}
                value={id}
                checked={claim === id}
                disabled={publishing || controller.writesLocked}
                onChange={() => setClaim(id)}
                data-claim={id}
              />
              <span>{id}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {confirming && blocked === null && compose && releaseCandidateId !== null && view.state === "fresh" ? (
        <Confirm
          label="confirm publish"
          action="publish"
          sentence={PUBLISH_CONFIRM}
          confirm={PUBLISH_CONFIRM_BUTTON}
          detail={`${releaseCandidateId} · pack ${view.publication.pack_digest} · claim ${choice ?? ""}`}
          onConfirm={() => {
            setConfirming(false);
            publication.publish(choice);
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button
          type="button"
          className="rc-sealbtn"
          data-action="publish"
          data-publish-enabled={blocked === null ? "true" : "false"}
          aria-disabled={blocked !== null || undefined}
          aria-describedby={blocked !== null && !publishing ? reasonId : undefined}
          aria-busy={publishing || undefined}
          onClick={() => {
            if (blocked === null) setConfirming(true);
          }}
        >
          {label}
        </button>
      )}
      {blocked !== null && !publishing ? (
        <span id={reasonId} className="rc-blocked" data-publish-blocked={blocked.code ?? "LOCAL"}>
          {blocked.label}
          {blocked.code ? ` · ${blocked.code}` : ""}
        </span>
      ) : null}
      <PublicationConflict publication={publication.publication} />
      <ReadFailure view={view} retry={publication.retry} />
      <PublishWriteNotice publication={publication} />
      <p className="sod">{SOD_NOTE}</p>
    </section>
  );
}

/** VD-P22-05: an attempt the governance store did not confirm; recovered only by the same request. */
function UnknownOutcomeCard({ publication, controller }: { publication: RcPublicationController; controller: ReleaseCandidateController }) {
  const reasonId = useId();
  const current = publication.publication!;
  const publishing = publication.write.state === "pending";
  const claims = current.source.eligible_methodology_claim_ids;
  const [claim, setClaim] = useState<string | null>(null);
  const claimName = useId();
  const choice = claims.length === 1 ? claims[0]! : claim;
  const blocked = controller.writesLocked
    ? { label: "writes are off — access changed", code: null }
    : !current.may_publish || current.blocked_reason !== null
      ? { label: rcReasonSentence(current.blocked_reason) ?? "the server does not admit a retry for you", code: current.blocked_reason }
      : current.reconcile_allowed === false
        ? /* FG-05: the server says the recorded request is not retryable; nothing else is offered. */
          { label: "the server does not admit a retry of the recorded request", code: null }
      : publication.view.state !== "fresh"
        ? { label: "the last publication read is stale — retry waits for a fresh read", code: null }
        : claims.length > 1 && (choice === null || !claims.includes(choice))
          ? { label: `${CLAIM_REQUIRED} — the same one as the recorded request`, code: null }
          : publishing || controller.write.state === "pending"
            ? { label: publishing ? PUBLISHING_LABEL : "another write is in flight", code: null }
            : null;
  return (
    <section className="rc-unknown" data-panel="publish-unknown" aria-label={UNKNOWN_LABEL} data-publication-state={current.state}>
      <h3 className="k">{UNKNOWN_LABEL}</h3>
      <p>{UNKNOWN_COPY}</p>
      <p className="rc-pubfacts" data-publication-facts={current.state}>
        publication {current.state} · {current.release_candidate_id} · as of {iso(current.as_of_utc_ms)}
      </p>
      {/* FG-05: who recorded the intent and how often it was sent, as the server keeps them. */}
      <p className="rc-pubfacts" data-publication-intent={current.intent_actor?.user_id ?? ""}>
        recorded by {current.intent_actor ? current.intent_actor.username : "actor not published"}
        {" · attempt_count "}
        {current.attempt_count !== undefined ? String(current.attempt_count) : "not published"}
        {" · recorded "}
        {current.publication_created_at ?? "not published"}
        {" · updated "}
        {current.updated_at_utc_ms !== undefined ? new Date(current.updated_at_utc_ms).toISOString() : "not published"}
      </p>
      <PublicationConflict publication={current} />
      {claims.length > 1 && current.may_publish ? (
        <fieldset className="rc-claims" data-claim-choice>
          <legend>{CLAIM_LEGEND}</legend>
          {claims.map((id) => (
            <label key={id}>
              <input type="radio" name={claimName} value={id} checked={claim === id} disabled={publishing} onChange={() => setClaim(id)} data-claim={id} />
              <span>{id}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <button
        type="button"
        className="rc-sealbtn"
        data-action="publish-retry"
        aria-disabled={blocked !== null || undefined}
        aria-describedby={blocked !== null && !publishing ? reasonId : undefined}
        aria-busy={publishing || undefined}
        onClick={() => {
          if (blocked === null) publication.publish(choice);
        }}
      >
        {publishing ? PUBLISHING_LABEL : RETRY_LABEL}
      </button>
      {blocked !== null && !publishing ? (
        <span id={reasonId} className="rc-blocked" data-publish-blocked={blocked.code ?? "LOCAL"}>
          {blocked.label}
          {blocked.code ? ` · ${blocked.code}` : ""}
        </span>
      ) : null}
      <ReadFailure view={publication.view} retry={publication.retry} />
      <PublishWriteNotice publication={publication} />
    </section>
  );
}

/** Hi-fi published branch: the immutable record, facts from the server's publication read. */
function PublishedCard({ releaseCandidateId, publication }: { releaseCandidateId: string | null; publication: RcPublicationController }) {
  const current = publication.publication;
  const published = current?.published ?? null;
  const approval = current?.approval_read === "AVAILABLE" ? current.approval : null;
  return (
    <section className="rc-sealed" data-panel="published" aria-label="published">
      <h3 className="k">{PUBLISHED_LABEL}</h3>
      <span className="id" data-published-id>
        {releaseCandidateId !== null ? (
          <Link to={releaseCandidatePackHref(releaseCandidateId)} data-action="open-pack">
            {releaseCandidateId}
          </Link>
        ) : (
          <span className="rc-absent">release candidate id — not published</span>
        )}
      </span>
      {published !== null ? (
        <>
          <p data-published-facts>
            <span className="rc-mono" data-published-at>
              published_at {iso(published.at_utc_ms)}
            </span>
            {" · "}
            <span data-published-by>by {published.by_username}</span>
            {" · evidence digest "}
            {approval !== null ? (
              <span className="rc-mono" data-evidence-digest>
                {approval.evidence_set_hash}
              </span>
            ) : (
              <span className="rc-absent" data-evidence-digest-absent>
                not read ({current?.approval_read ?? "no publication read"})
              </span>
            )}
            {". "}
            {PUBLISHED_SENTENCE}
          </p>
          <p className="rc-mono" data-published-receipt>
            receipt {published.receipt_digest} · approval {published.approval_id}
          </p>
        </>
      ) : (
        <p data-published-facts-absent>
          <span className="rc-absent">publication facts — not read in this session</span> {PUBLISHED_SENTENCE}
        </p>
      )}
      <PublicationConflict publication={current} />
      <ReadFailure view={publication.view} retry={publication.retry} />
    </section>
  );
}

/** Read-model ghost before publication: nothing inside it is interactive (spec 11 §16.3). */
function MirrorGhost({ foot }: { foot: ReactNode }) {
  return (
    <section className="rc-ghost" data-panel="mirror-ghost" data-mirror-ghost aria-label="approval inbox mirror, not published">
      <div className="rc-cardhead">
        <h3 className="k">{MIRROR_LABEL}</h3>
        <span className="rc-spec">{MIRROR_SIDE}</span>
      </div>
      <div className="rc-mirrorrow">
        <span className="gate">{MIRROR_GATE}</span>
        <span className="subj">{MIRROR_SUBJECT}</span>
        <span className="st" data-mirror-status="not-published">
          status not published
        </span>
        <span className="sla">{MIRROR_SLA}</span>
      </div>
      <div className="rc-mirrormeta" data-mirror-meta>
        <span className="rc-mseg">
          <span>{MIRROR_POOL_ABSENT}</span>
          <span>·</span>
        </span>
        <span className="rc-mseg">
          <span>conditions: not published</span>
          <span>·</span>
        </span>
        <span data-mirror-outcomes="legend">{MIRROR_OUTCOMES}</span>
      </div>
      <p>{MIRROR_NOTE}</p>
      <span className="rc-reason" data-mirror-foot>
        {foot}
      </span>
    </section>
  );
}

/** FG-05: the assignee pool exactly as the mirror publishes it; absent → the contract's reason, never a team name. */
function PoolLine({ approval }: { approval: RcApproval }) {
  const availability = approval.assignee_pool_availability;
  if (availability.state === "AVAILABLE" && approval.assignee_pool !== undefined) {
    return (
      <span data-mirror-pool="AVAILABLE">
        assignee pool:{" "}
        {approval.assignee_pool.length === 0
          ? "empty list published"
          : approval.assignee_pool.map((member) => `${member.username} (${member.role})`).join(" · ")}
      </span>
    );
  }
  return (
    <span data-mirror-pool={availability.state}>
      {MIRROR_POOL_ABSENT} · <Reason code={availability.reason_code ?? availability.state} what="assignee_pool" />
    </span>
  );
}

/** FG-05: the decisions Governance recorded (`decision_outcomes`) and its own `condition_count`, as sent. */
function decisionLine(approval: RcApproval): string {
  const outcomes = approval.decision_outcomes;
  const recorded =
    outcomes === undefined
      ? "decisions recorded: not published"
      : outcomes.length === 0
        ? "decisions recorded: none"
        : `decisions recorded: ${outcomes.map((decision) => `${decision.actor_user_id} ${decision.outcome}`).join(" · ")}`;
  return approval.condition_count !== undefined ? `${recorded} · condition_count ${approval.condition_count}` : recorded;
}

/** FG-05: the mirror's optional facts, only those the server sent. */
function mirrorExtras(approval: RcApproval): string {
  return [
    approval.subject_label !== undefined ? `subject ${approval.subject_label}` : null,
    approval.approval_version !== undefined ? `approval_version ${approval.approval_version}` : null,
    approval.blocker_count !== undefined ? `blocker_count ${approval.blocker_count}` : null,
    approval.quorum !== undefined ? `quorum met ${approval.quorum.met} of required ${approval.quorum.required}` : null,
    approval.as_of_utc_ms !== undefined ? `mirror as of ${new Date(approval.as_of_utc_ms).toISOString()}` : null,
  ]
    .filter((part): part is string => part !== null)
    .map((part) => ` · ${part}`)
    .join("");
}

function conditionLine(approval: RcApproval): string {
  return approval.conditions.length === 0
    ? "conditions: none"
    : `conditions: ${approval.conditions.map((condition) => `${condition.kind} — ${condition.label}`).join(" · ")}`;
}

/**
 * Hi-fi published branch: the solid inbox row, from the publication read's
 * `approval_read`. Read-only; its one link opens the approval where decisions
 * live (spec 11 §16.3 — no action buttons). A published candidate never shows
 * the ghost: an unreadable mirror says why.
 */
function MirrorCard({ publication }: { publication: RcPublicationController }) {
  const view = publication.view;
  const current = publication.publication;
  const read = current?.approval_read ?? null;
  const approval = read === "AVAILABLE" ? (current?.approval ?? null) : null;
  return (
    <section className="rc-mirror" data-panel="mirror" data-mirror-read={read ?? view.state} aria-label="approval inbox mirror">
      <div className="rc-cardhead">
        <h3 className="k">{MIRROR_LABEL}</h3>
        <span className="rc-spec">{MIRROR_SIDE}</span>
      </div>
      {current === null ? (
        <ReadFailure view={view} retry={publication.retry} />
      ) : (
        <>
          {view.state === "stale" ? <ReadFailure view={view} retry={publication.retry} /> : null}
          <div className="rc-mirrorrow">
            <span className="gate">{MIRROR_GATE}</span>
            <span className="subj" data-mirror-subject>
              {current.release_candidate_id} — {current.alpha_id} {current.alpha_version_id}
            </span>
            {approval !== null ? (
              <>
                <span className="rc-mstatus" data-s={approval.status} data-mirror-status={approval.status} title="raw Governance approval status">
                  {approval.status}
                </span>
                {/* FG-05: the effective status is its own fact beside the raw one, never in place of it. */}
                <span className="st" data-mirror-effective-status={approval.effective_status ?? "not-published"}>
                  {approval.effective_status !== undefined ? `effective ${approval.effective_status}` : "effective status not published"}
                </span>
                <span className="sla" data-mirror-sla>
                  SLA due {approval.sla_due_at} · expires {approval.expires_at}
                </span>
              </>
            ) : (
              <span className="st" data-mirror-status={read === "DENIED" ? "not-readable" : (read ?? "not-read").toLowerCase()}>
                approval status: {read === "DENIED" ? MIRROR_NOT_READABLE : read === "NOT_FOUND" ? MIRROR_NOT_FOUND : MIRROR_UNAVAILABLE}
              </span>
            )}
          </div>
          <div className="rc-mirrormeta" data-mirror-meta>
            <span className="rc-mseg">
              {approval !== null ? <PoolLine approval={approval} /> : <span>{MIRROR_POOL_ABSENT}</span>}
              <span>·</span>
            </span>
            {/* VD-FG-05-02: recorded decisions replace the static vocabulary; without any it stays, as a legend. */}
            {approval !== null && (approval.decision_outcomes?.length ?? 0) > 0 ? (
              <span data-mirror-conditions>{conditionLine(approval)}</span>
            ) : (
              <>
                <span className="rc-mseg">
                  <span data-mirror-conditions>{approval !== null ? conditionLine(approval) : "conditions: not read"}</span>
                  <span>·</span>
                </span>
                <span data-mirror-outcomes="legend">{MIRROR_OUTCOMES}</span>
              </>
            )}
          </div>
          {approval !== null ? (
            <span className="facts" data-mirror-decisions>
              {decisionLine(approval)}
            </span>
          ) : null}
          <span className="facts" data-mirror-facts>
            approval {approval?.approval_id ?? current.published?.approval_id ?? "not published"}
            {approval !== null ? ` · created ${approval.created_at} · read ${approval.read_at}` : ` · approval read ${read ?? "not made"}`}
            {approval !== null ? mirrorExtras(approval) : ""}
            {` · publication as of ${iso(current.as_of_utc_ms)}`}
          </span>
          {current.candidate_relation === "SUPERSEDED" || approval?.rc_superseded === true ? (
            <span
              className="superseded"
              data-mirror-superseded
              data-candidate-relation={current.candidate_relation}
              data-rc-superseded={approval?.rc_superseded === undefined ? "not-published" : String(approval.rc_superseded)}
            >
              {MIRROR_SUPERSEDED}
            </span>
          ) : null}
          <p>{MIRROR_PUBLISHED_NOTE}</p>
          {approval !== null && isLocalPath(approval.href) ? (
            <span>
              <Link to={approval.href} data-action="open-approval">
                {MIRROR_INBOX_LINK}
              </Link>
            </span>
          ) : null}
        </>
      )}
    </section>
  );
}

function Rules() {
  return (
    <footer className="rc-foot" data-panel="rules">
      <h3 className="t">rules of this screen</h3>
      <p>{RC_RULES}</p>
    </footer>
  );
}

/* ---------------------------------------------------------------- editor */

function normalized(text: string): string | null {
  return text.trim() === "" ? null : text;
}

function useDeclarationEditor(controller: ReleaseCandidateController, delivered: boolean): DeclarationEditor {
  const [edits, setEdits] = useState<Partial<Record<DeclarationRowKey, string>>>({});
  const [issues, setIssues] = useState<DeclarationIssue[]>([]);
  const { compose, write, writesLocked } = controller;
  const pending = write.state === "pending";

  const lockedReason = !compose
    ? "the composition has not been read"
    : writesLocked
      ? "writes are off — access changed"
      : !compose.actions.may_edit_draft
        ? "the server does not admit a draft edit"
        : null;

  const texts = (): Record<"known_limitations" | "proposed_use_restrictions", string> => ({
    known_limitations: edits.KNOWN_LIMITATIONS_WAIVERS ?? compose?.draft.known_limitations ?? "",
    proposed_use_restrictions: edits.PROPOSED_USE_RESTRICTIONS ?? compose?.draft.proposed_use_restrictions ?? "",
  });

  const payload = (): RcDeclarations | null => {
    if (!compose) return null;
    const draft = compose.draft;
    return {
      known_limitations: edits.KNOWN_LIMITATIONS_WAIVERS !== undefined ? normalized(edits.KNOWN_LIMITATIONS_WAIVERS) : draft.known_limitations,
      proposed_use_restrictions: edits.PROPOSED_USE_RESTRICTIONS !== undefined ? normalized(edits.PROPOSED_USE_RESTRICTIONS) : draft.proposed_use_restrictions,
    };
  };

  const dirty =
    compose !== null &&
    ((edits.KNOWN_LIMITATIONS_WAIVERS !== undefined && edits.KNOWN_LIMITATIONS_WAIVERS !== (compose.draft.known_limitations ?? "")) ||
      (edits.PROPOSED_USE_RESTRICTIONS !== undefined && edits.PROPOSED_USE_RESTRICTIONS !== (compose.draft.proposed_use_restrictions ?? "")));

  return {
    edits,
    lockedReason,
    /* Spec T07: after a delivered publication the INPUT rows are read-only. */
    editable: (compose?.actions.may_edit_draft ?? false) && !delivered,
    pending,
    dirty,
    issues,
    open: (key) =>
      setEdits((current) => (current[key] !== undefined ? current : { ...current, [key]: compose?.draft[DECLARATION_FIELD[key]] ?? "" })),
    change: (key, text) => setEdits((current) => ({ ...current, [key]: text })),
    cancel: (key) => {
      setIssues([]);
      setEdits((current) => {
        const copy = { ...current };
        delete copy[key];
        return copy;
      });
    },
    save: () => {
      const found = declarationIssues(texts());
      setIssues(found);
      if (found.length > 0) return;
      const body = payload();
      if (!body) return;
      void controller.patchDraft(body).then((ok) => {
        /* Only a 200 closes the editors; a refusal keeps every typed character. */
        if (ok) setEdits({});
      });
    },
    saveBlocked: lockedReason,
    notice: <WriteNotice slot={write} op="patch" />,
  };
}

/* ---------------------------------------------------------------- screen */

export type ReleaseCandidateScreenProps =
  | { mode: "compose"; runId: string; controller: ReleaseCandidateController; publication: RcPublicationController }
  | { mode: "pack"; releaseCandidateId: string; controller: RcPackController; publication: RcPublicationController };

/** Which card sits in the publish slot: the server's facts decide. */
function publishSlot(compose: RcCompose | null, publication: RcPublication | null): "publish" | "publish-unknown" | "published" {
  if (isDelivered(compose, publication)) return "published";
  if (publication !== null && (publication.state === "PENDING" || publication.state === "UNKNOWN")) return "publish-unknown";
  return "publish";
}

function ghostFoot(compose: RcCompose | null, publication: RcPublication | null): ReactNode {
  if (publication !== null) {
    return <Reason code={publication.blocked_reason ?? `P22_${publication.state}`} what="publication" />;
  }
  const absence = compose?.source_absences.approval_mirror;
  return absence ? <Reason code={reasonOf(absence)} what="approval_mirror" /> : "mirror not published";
}

function ComposeScreen({ runId, controller, publication }: { runId: string; controller: ReleaseCandidateController; publication: RcPublicationController }) {
  const { compose, state } = controller;
  const current = publication.publication;
  const delivered = isDelivered(compose, current);
  const slot = publishSlot(compose, current);
  const editor = useDeclarationEditor(controller, delivered);
  const sealed = compose?.local_seal.state === "SEALED_LOCAL" ? compose.local_seal : null;
  const replayed = controller.write.state === "sealed" && controller.write.replayed;
  const unbound = compose?.source_absences.alpha_binding;
  const chip = compose ? stateChipOf(compose, current) : null;

  return (
    <div
      className="rc-page"
      data-screen="release-candidate"
      data-rc-mode="compose"
      data-run={runId}
      data-rc-state={state.state}
      data-rc-chip={chip ?? ""}
      data-request-count={controller.requestCount}
      data-publication-requests={publication.requestCount}
      data-publication-polling={publication.polling ? "true" : "false"}
      aria-busy={controller.inFlight}
    >
      <style>{RC_CSS}</style>
      <Header
        runId={runId}
        here={RC_CRUMB}
        chips={
          compose && chip ? (
            <>
              <StateChip value={chip} />
              <SealChips seal={compose.local_seal} delivered={delivered} />
            </>
          ) : null
        }
      />
      <div className="rc-meta" data-panel="meta">
        {compose ? (
          <>
            <span data-read-authority={compose.read_authority}>{READ_AUTHORITY_WORDS[compose.read_authority] ?? compose.read_authority}</span>
            <span data-as-of>as of {iso(compose.as_of_utc_ms)}</span>
            <span data-source-fingerprint title={compose.source_fingerprint}>source {shortDigest(compose.source_fingerprint)}</span>
            <span data-draft-meta data-draft-revision={compose.draft.revision} data-draft-state={compose.draft.state}>
              {compose.draft.state === "VIRTUAL" ? "draft not saved yet" : `draft saved · revision ${compose.draft.revision}`}
              {compose.draft.updated_at_utc_ms !== null ? ` · saved ${iso(compose.draft.updated_at_utc_ms)}` : ""}
            </span>
          </>
        ) : (
          <span>{state.state}</span>
        )}
      </div>
      {state.state !== "available" ? (
        <Notice state={state} requestId={controller.refusal?.requestId ?? null} code={controller.refusal?.code ?? null} onRetry={controller.retry} inFlight={controller.inFlight} />
      ) : null}
      {compose && compose.run.binding === null ? <Banner availability={unbound ?? { state: "NOT_PUBLISHED", reason_code: "P21_SCRATCH_RUN_UNBOUND" }} /> : null}
      <IdentityBlock compose={compose} state={state} />
      <PackBlock
        items={compose?.pack ?? null}
        runId={compose?.run_id ?? null}
        alphaId={compose?.run.binding?.alpha_id ?? null}
        counts={compose?.pack_counts ?? null}
        axes={compose?.certification_axes ?? null}
        declarations={compose ? compose.draft : null}
        editor={compose ? editor : null}
        state={state}
      />
      <div className="rc-group3">
        <RecordBlock fields={compose?.yaml ?? null} state={state} />
        <div className="rc-side">
          {delivered ? null : <SealCard compose={compose} controller={controller} dirty={editor.dirty} publishing={publication.write.state === "pending"} />}
          {sealed ? <SealedCard seal={sealed} replayed={replayed} /> : null}
          {slot === "published" ? (
            <PublishedCard releaseCandidateId={sealed?.release_candidate_id ?? current?.release_candidate_id ?? null} publication={publication} />
          ) : slot === "publish-unknown" ? (
            <UnknownOutcomeCard publication={publication} controller={controller} />
          ) : (
            <PublishCard compose={compose} controller={controller} publication={publication} />
          )}
          {delivered ? <MirrorCard publication={publication} /> : <MirrorGhost foot={ghostFoot(compose, current)} />}
        </div>
      </div>
      <Rules />
    </div>
  );
}

function PackScreen({ releaseCandidateId, controller, publication }: { releaseCandidateId: string; controller: RcPackController; publication: RcPublicationController }) {
  const { pack, state } = controller;
  const current = publication.publication;
  const delivered = pack !== null && isDelivered({ local_seal: pack.delivery }, current);
  return (
    <div
      className="rc-page"
      data-screen="release-candidate"
      data-rc-mode="pack"
      data-release-candidate={releaseCandidateId}
      data-rc-state={state.state}
      data-rc-chip={delivered ? "PUBLISHED" : ""}
      data-publication-requests={publication.requestCount}
      aria-busy={controller.inFlight}
    >
      <style>{RC_CSS}</style>
      <Header
        runId={pack?.run_id ?? null}
        here={
          <>
            {RC_CRUMB} / <span className="rc-mono">{releaseCandidateId}</span>
          </>
        }
        chips={
          pack ? (
            <>
              {delivered ? <StateChip value="PUBLISHED" /> : null}
              <SealChips seal={pack.delivery} delivered={delivered} />
            </>
          ) : null
        }
      />
      <div className="rc-meta" data-panel="meta">
        {pack ? (
          <>
            <span data-read-authority={pack.read_authority}>{READ_AUTHORITY_WORDS[pack.read_authority] ?? pack.read_authority}</span>
            <span data-sealed-at>sealed {iso(pack.sealed_at_utc_ms)}</span>
            <span data-pack-digest title={pack.pack_digest}>pack {shortDigest(pack.pack_digest)}</span>
            <span data-source-fingerprint title={pack.frozen_core.source_fingerprint}>source {shortDigest(pack.frozen_core.source_fingerprint)}</span>
          </>
        ) : (
          <span>{state.state}</span>
        )}
      </div>
      {state.state !== "available" ? (
        <Notice state={state} requestId={controller.refusal?.requestId ?? null} code={controller.refusal?.code ?? null} onRetry={controller.retry} inFlight={controller.inFlight} />
      ) : null}
      <PackIdentity pack={pack} state={state} />
      <PackBlock
        items={pack?.frozen_core.pack ?? null}
        runId={pack?.run_id ?? null}
        alphaId={pack?.frozen_core.fields.find((field) => field.key === "alpha_id")?.value ?? null}
        counts={null}
        axes={null}
        declarations={pack ? pack.frozen_core.draft : null}
        editor={null}
        state={state}
      />
      <div className="rc-group3">
        <RecordBlock fields={pack?.frozen_core.fields ?? null} state={state} />
        <div className="rc-side">
          {pack ? (
            <SealedCard
              seal={{ ...pack.delivery, release_candidate_id: pack.release_candidate_id, pack_digest: pack.pack_digest, sealed_at_utc_ms: pack.sealed_at_utc_ms }}
              replayed={false}
            />
          ) : null}
          {delivered ? (
            <>
              <PublishedCard releaseCandidateId={releaseCandidateId} publication={publication} />
              <MirrorCard publication={publication} />
            </>
          ) : (
            <>
              <section className="rc-ghost" data-panel="publish-ghost" aria-label="publish, on the run's composition">
                <h3 className="k">{PUBLISH_GHOST_LABEL}</h3>
                <p>{PUBLISH_GHOST_COPY}</p>
                {current ? <Reason code={current.blocked_reason ?? `P22_${current.state}`} what="publication" /> : <ReadFailure view={publication.view} />}
                <PublicationConflict publication={current} />
                {pack ? (
                  <span>
                    <Link to={releaseCandidateHref(pack.run_id)} data-action="open-composition">
                      open the run's composition →
                    </Link>
                  </span>
                ) : null}
              </section>
              <MirrorGhost foot={current ? <Reason code={current.blocked_reason ?? `P22_${current.state}`} what="publication" /> : "the mirror is read on the run's composition"} />
            </>
          )}
        </div>
      </div>
      <Rules />
    </div>
  );
}

function PackIdentity({ pack, state }: { pack: RcPack | null; state: ResearchState }) {
  return (
    <section className="rc-card rc-ident" data-panel="identity" aria-label="identity and lineage">
      <div className="rc-cardhead">
        <h3 className="rc-k">{IDENTITY_LABEL}</h3>
        <span className="rc-spec">{IDENTITY_SPEC}</span>
      </div>
      {pack ? (
        <>
          <ol className="rc-rail" data-rail aria-label="sealed identity">
            <li>
              <Link className="rc-node" to={runHref(pack.run_id, "evidence")} data-rail-node="run" data-tone="ink">
                <span className="k">{RAIL_LABEL.run}</span>
                <span className="v" title={pack.run_id}>{shortId(pack.run_id)}</span>
              </Link>
              <span className="rc-arrow" aria-hidden="true">
                →
              </span>
            </li>
            <li>
              <div className="rc-node" data-rail-node="release_candidate" data-tone="green">
                <span className="k">{RAIL_LABEL.release_candidate}</span>
                <span className="v">{pack.release_candidate_id}</span>
                <span className="sub">{pack.delivery.state}</span>
              </div>
            </li>
          </ol>
          <p className="rc-verdict b" style={{ borderLeft: 0, paddingLeft: 0 }} data-pack-identity-note>
            {PACK_ROUTE_IDENTITY}{" "}
            <Link to={releaseCandidateHref(pack.run_id)} data-action="open-composition">
              open the run's composition →
            </Link>
          </p>
        </>
      ) : (
        <Pending state={state} />
      )}
    </section>
  );
}

export function ReleaseCandidateScreen(props: ReleaseCandidateScreenProps) {
  return props.mode === "compose" ? (
    <ComposeScreen runId={props.runId} controller={props.controller} publication={props.publication} />
  ) : (
    <PackScreen releaseCandidateId={props.releaseCandidateId} controller={props.controller} publication={props.publication} />
  );
}

/* Re-exported for the boundary test: the declaration keys this screen edits. */
export { DECLARATION_KEYS };
