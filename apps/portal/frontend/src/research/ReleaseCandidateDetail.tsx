/**
 * Screen 11 — Release Candidate (P21).
 *
 * The hi-fi (`QuantBT 11 Release Candidate and Publish.dc.html`) composes one
 * promotable unit and publishes it to an Approval Inbox. P21 delivers the
 * local half only (handoff: local seal ≠ publish ≠ delivery ≠ approval), so the
 * hi-fi's order, geometry and copy are kept and each cell carries the P21
 * contract's answer or a typed absence. Every departure is a numbered
 * `VD-P21-NN`:
 *
 *  - VD-P21-01 the state chip is the composition's `DRAFT`; a local seal adds
 *    its own `SEALED_LOCAL` chip with delivery · approval beside it, and
 *    `NOT_PUBLISHABLE` is the banner's badge, never the chip.
 *  - VD-P21-02 the publish card is a local-seal card ("Local seal evidence
 *    pack"); publish and the approval-inbox mirror are P22 ghosts.
 *  - VD-P21-03 the YAML preview is the server's 17 fields, whose keys differ
 *    from the hi-fi's; the declarations travel as pack rows 10 and 12.
 *  - VD-P21-04 the taxonomy is the server's (all `UNSET` today) and the
 *    last-rc caption is a typed absence, never a fabricated predecessor.
 *  - VD-P21-05 both certification chips are the contract's axes; an absent
 *    axis is a ghost chip with its reason.
 *  - VD-P21-06 rail values and details are the server's; the `run` node reads
 *    "run / attempt".
 *  - VD-P21-07 pack source links are printed as the server sent them
 *    (CG-P21-02), even where they differ from this build's routes.
 *  - VD-P21-08 an INPUT row edits inline and saves with "save declaration"
 *    (CAS; a 409 keeps the text and says so).
 *  - VD-P21-09 a sealed pack has a read-only route of its own.
 *  - VD-P21-10 a null YAML value reads `null  # <reason_code>`.
 *  - VD-P21-11…15 are recorded in the P21 report.
 *
 * P22 turns the publish ghost into the hi-fi's publish card and the mirror
 * ghost into the hi-fi's solid mirror once the candidate is PUBLISHED. The
 * departures are numbered `VD-P22-NN`:
 *
 *  - VD-P22-01 the mirror SLA cell prints the server's `sla_due_at` and
 *    `expires_at` verbatim; the hi-fi countdown ("4d 21h left") is a typed
 *    absence — the browser does no date arithmetic.
 *  - VD-P22-02 "assignee pool" has no contract field: "assignee pool: not
 *    published".
 *  - VD-P22-03 the published card's `by` is the server's intent actor.
 *  - VD-P22-04 publish is one click, as in the hi-fi (no confirm modal).
 *  - VD-P22-05 the unknown-outcome card, its reconcile button and the conflict
 *    banners have no hi-fi cell; they sit where the publish card sits.
 *  - VD-P22-06 several mirrored claims → a radio list above the button.
 *  - VD-P22-07 `rc_superseded` is a separate line, never a status.
 *  - VD-P22-08 the decision-outcome list is the hi-fi's prose, verbatim; the
 *    status chip prints the raw governance value.
 *
 * Nothing here counts, sorts, formats, diffs or decides: counts, tones,
 * titles, reason codes and the seal and publish gates are all the server's.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import { DEFAULT_CURSOR, deepDiveHref } from "./evidenceCursor";
import {
  RC_DENIED_COPY,
  RC_NEUTRAL_REFUSAL,
  RC_WITHHELD_WORDS,
  publishBlockedLabel,
  reasonOf,
  releaseCandidateHref,
  releaseCandidatePackHref,
  sealBlockedLabel,
  yamlText,
  yamlValue,
  type RcAvailability,
  type RcCertificationAxis,
  type RcCompose,
  type RcField,
  type RcLocalSeal,
  type RcMirror,
  type RcPack,
  type RcPackCounts,
  type RcPackItem,
  type RcPublication,
  type RcRailNode,
  type RcTaxonomyRow,
} from "./releaseCandidateClient";
import type { ResearchState } from "./state";
import type { RcDeclarations, RcPackController, RcWriteOp, RcWriteSlot, ReleaseCandidateController } from "./useReleaseCandidate";
import type { RcMirrorController } from "./useReleaseCandidateMirror";
import { iso } from "./utcMinute";

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
export const NO_SOURCE_LINK_TITLE = "the server published no link for this row";

/** Hi-fi / spec 11 §2.4 status titles, verbatim; MISSING takes its reason code. */
export const STATUS_TITLE: Record<Exclude<RcPackItem["status"], "MISSING">, string> = {
  COMPLETE: "artifact present, digest pinned",
  DEGRADED: "partial artifact — travels as DEGRADED, reviewer sees it",
  INPUT: "researcher declaration — part of the signed pack",
};

export const RECORD_HEADER = "3 · record preview — exactly what is written, byte for byte (spec v0.7 §3.2)";

/** Handoff wording (VD-P21-02): the button never says Publish. */
export const SEAL_LABEL = "Local seal evidence pack";
export const SEAL_SENTENCE =
  "Sealing freezes this exact combination as a Portal-local immutable evidence pack. It creates no publication, no approval, no delivery, and does not start Paper.";
/** Hi-fi separation-of-duties note, verbatim. */
export const SOD_NOTE =
  "Separation of duties: the publisher cannot be the sole R1 approver where policy requires it. R1 approval default expiry: approved_at + 90d (policy default — confirm).";
export const SEALED_SENTENCE =
  "This evidence pack is Portal-local and immutable. It is not published, delivered or approved; a further change to code, params or methodology composes a new candidate.";
export const SEALED_REPLAY = "already sealed — same pack";
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
/** Spec 11 §3: the button while the request is in flight. */
export const PUBLISHING_LABEL = "publishing…";
/** VD-P22-06: several mirrored claims, chosen from the server's list. */
export const CLAIM_LEGEND = "methodology claim to attach";
export const CLAIM_REQUIRED = "choose the methodology claim to attach first";

/** Hi-fi published card, verbatim. */
export const PUBLISHED_LABEL = "published — immutable";
export const PUBLISHED_SENTENCE =
  "Any further change to code, params, or methodology creates a NEW candidate and supersedes this one — this record itself never mutates.";
export const PUBLISHED_BY_ABSENT = "by — not published";

/** VD-P22-05: a 202 or an unsettled attempt — no hi-fi cell. */
export const UNKNOWN_LABEL = "publication outcome unknown";
export const UNKNOWN_COPY =
  "Publication outcome unknown — the governance store did not confirm. Reconcile to recover the receipt; nothing is re-submitted with a different payload.";
export const RECONCILE_LABEL = "reconcile";
export const RECONCILING_LABEL = "reconciling…";
export const RECONCILE_NOT_ADMITTED = "the server does not admit a reconcile for you";
export const RECONCILE_REQUEST_NOT_AVAILABLE = "the exact publication request is not available for replay";

/** The pack route has no publication facts; they belong to the run's composition. */
export const PUBLISH_GHOST_LABEL = "publish — on the run's composition";
export const PUBLISH_GHOST_COPY =
  "A sealed pack is read-only. Publishing and the approval-inbox mirror are read and operated on the run's composition; this pack prints its own delivery facts only.";

/** Hi-fi mirror, draft branch, verbatim. */
export const MIRROR_LABEL = "what the approval inbox sees";
export const MIRROR_SIDE = "read model · decisions live on the Execution side";
export const MIRROR_GATE = "R1 · RESEARCH EVIDENCE";
export const MIRROR_SUBJECT = "— not yet published";
export const MIRROR_SLA = "SLA starts at publish";
export const MIRROR_META = [
  "assignee pool: Quant Reviewers",
  "conditions: —",
  "decision outcomes: APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED",
] as const;
export const MIRROR_NOTE =
  "Preview of the inbox row this publish will create on the Execution side. It stays a ghost until the record exists — this screen never fakes a governance state.";
export const MIRROR_GHOST_FOOT = "mirror not published";
export const MIRROR_GHOST_PACK_FOOT = "the mirror is read on the run's composition";

/** Hi-fi mirror, published branch: verbatim prose; facts are the server's. */
export const MIRROR_POOL_ABSENT = "assignee pool: not published";
export const MIRROR_CONDITIONS_NONE = "conditions: none yet";
export const MIRROR_OUTCOMES =
  "decision outcomes: APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED";
export const MIRROR_PUBLISHED_NOTE =
  "The reviewer opens this row, walks the same evidence links you pinned above, and records one of six outcomes. Conditions and waivers they attach flow back into this mirror. You cannot edit anything past this point — only supersede with a new candidate.";
/** VD-P22-07: a Research fact beside the raw status, never in place of it. */
export const MIRROR_SUPERSEDED = "superseded by a newer candidate — the raw approval status above is unchanged";
export const MIRROR_NOT_READABLE = "not readable with your access";
export const MIRROR_INBOX_LINK = "open in Approval Inbox";
/** VD-P22-01: the hi-fi countdown is not computed. */
export const MIRROR_LEFT_ABSENT = "time left — not published";
export function mirrorStaleLine(asOfUtcMs: number): string {
  return `mirror as of ${iso(asOfUtcMs)} — the governance store did not answer`;
}
export const MIRROR_UNAVAILABLE = "the governance store did not answer — no mirror was read in this session";

/** Hi-fi rules footer, verbatim. */
export const RC_RULES =
  "The promotable unit is rc_, never a bare run_id. Digests pinned at publish are verified downstream. This screen never computes, approves, or mutates — its one verb is publish.";

export const PACK_ROUTE_IDENTITY =
  "A sealed pack freezes fields, pack rows and declarations; the lineage rail and taxonomy belong to the run's live composition.";

/** Every block, in the order the screen renders it. */
export const RC_PANELS = {
  compose: [
    "header",
    "meta",
    "banner",
    "identity",
    "pack",
    "record",
    "seal",
    "sealed",
    "publish",
    "publish-unknown",
    "published",
    "mirror",
    "mirror-ghost",
    "rules",
  ],
  pack: ["header", "meta", "identity", "pack", "record", "sealed", "publish-ghost", "mirror-ghost", "rules"],
} as const;

/** The two INPUT rows and the draft field each one edits. */
const DECLARATION_FIELD = {
  KNOWN_LIMITATIONS_WAIVERS: "known_limitations",
  PROPOSED_USE_RESTRICTIONS: "proposed_use_restrictions",
} as const satisfies Partial<Record<RcPackItem["key"], keyof RcDeclarations>>;

type DeclarationKey = keyof typeof DECLARATION_FIELD;

function declarationKey(key: RcPackItem["key"]): DeclarationKey | null {
  return key === "KNOWN_LIMITATIONS_WAIVERS" || key === "PROPOSED_USE_RESTRICTIONS" ? key : null;
}

/* -------------------------------------------------------------------- css */

/*
 * Scoped to `.rc-page`. Hi-fi colours map to palette tokens only: the gold
 * and its chip ground → --accent-2/--accent-2-soft; green → --good/--good-bg;
 * red → --bad/--bad-bg; teal → --accent/--accent-soft; the near-white tints →
 * --paper; the strong rule → --line-strong; the mute ink → --ink-mute.
 */
const RC_CSS = `
.rc-page { color: var(--ink); font-size: 13px; line-height: 1.5; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.rc-page a { color: var(--accent); text-decoration: none; }
.rc-page a:hover { color: var(--accent-strong); text-decoration: underline; }
:where(.rc-page) button, :where(.rc-page) textarea { font: inherit; }
.rc-page a:focus-visible, .rc-page button:focus-visible, .rc-page textarea:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper-raised), 0 0 0 4px var(--accent); }
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
.rc-state { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .05em; border-radius: 999px; padding: 2px 10px;
  border: 1px solid var(--accent-2); color: var(--accent-2); background: var(--accent-2-soft); }
.rc-state[data-s="SEALED_LOCAL"], .rc-state[data-s="PUBLISHED"] { border-color: var(--good); color: var(--good); background: var(--good-bg); }
.rc-lifecycle { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-linkbtn { border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); padding: 5px 14px; font-family: var(--font-mono); font-size: 10px;
  font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.rc-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); min-width: 0; }
.rc-meta > span { overflow-wrap: anywhere; min-width: 0; }
.rc-banner { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border: 1px dashed var(--bad); border-radius: 8px; background: var(--bad-bg); padding: 10px 14px; }
.rc-banner .badge { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--bad); flex: none; }
.rc-banner .txt { font-size: 12px; color: var(--ink); line-height: 1.55; flex: 1 1 280px; min-width: 0; }
.rc-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); min-width: 0; }
.rc-ident { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.rc-cardhead { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; margin: 0; }
.rc-k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); margin: 0; }
.rc-spec { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rc-rail { display: flex; align-items: stretch; flex-wrap: wrap; row-gap: 10px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.rc-rail > li { display: flex; align-items: center; min-width: 0; flex: 1 1 150px; max-width: 100%; }
.rc-node { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); padding: 7px 12px;
  min-width: 0; max-width: 100%; flex: 1 1 auto; }
.rc-node .k { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); }
.rc-node .v { font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.rc-node .sub { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rc-node[data-tone="gold"] { border-color: var(--accent-2); background: var(--paper); }
.rc-node[data-tone="gold"] .v { color: var(--accent-2); }
.rc-node[data-tone="green"] { border-color: var(--good); background: var(--good-bg); }
.rc-node[data-tone="green"] .v, .rc-node[data-tone="green"] .v a { color: var(--good); }
.rc-node[data-tone="dim"] { border-style: dashed; border-color: var(--line-strong); }
.rc-node[data-tone="dim"] .k { color: var(--line-strong); }
.rc-node[data-tone="dim"] .v { color: var(--ink-faint); }
.rc-arrow { padding: 0 8px; color: var(--ink-faint); font-size: 12px; align-self: center; }
.rc-taxrow { display: flex; gap: 14px; flex-wrap: wrap; border-top: 1px solid var(--line-soft); padding-top: 10px; min-width: 0; }
.rc-tax { flex: 1.3 1 380px; min-width: min(380px, 100%); display: flex; flex-direction: column; gap: 4px; }
.rc-tax table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rc-tax th { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); font-weight: 400; text-align: left;
  border-bottom: 1px solid var(--line-soft); padding: 0 0 3px; }
.rc-tax td { font-size: 11px; padding: 3px 0; border-bottom: 1px solid var(--line-soft); vertical-align: baseline; color: var(--ink-soft); line-height: 1.5; overflow-wrap: anywhere; }
.rc-tax .what { width: 210px; }
.rc-tax .state { width: 120px; }
.rc-tax td.state { font-family: var(--font-mono); font-size: 10px; font-weight: 600; }
.rc-tax td[data-s="UNCHANGED"] { color: var(--good); }
.rc-tax td[data-s="CHANGED"] { color: var(--bad); }
.rc-tax td[data-s="UNSET"] { color: var(--ink-faint); }
.rc-verdict { flex: 1 1 300px; min-width: min(300px, 100%); border-left: 1px solid var(--line-soft); padding-left: 14px; display: flex; flex-direction: column; gap: 5px; }
.rc-verdict .t { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--accent-2); overflow-wrap: anywhere; }
.rc-verdict .b { font-size: 11px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
.rc-packcard { overflow: hidden; }
.rc-packhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.rc-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.rc-ceiling, .rc-engcert { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border-radius: 3px; padding: 1px 7px; overflow-wrap: anywhere; }
.rc-ceiling { border: 1px solid var(--accent-2); background: var(--accent-2-soft); color: var(--accent-2); }
.rc-engcert { border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent); }
.rc-ceiling[data-ghost="true"], .rc-engcert[data-ghost="true"] { border-style: dashed; border-color: var(--line-strong); background: var(--paper); color: var(--ink-faint); font-weight: 400; }
.rc-count { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.rc-pack { overflow-x: auto; min-width: 0; }
.rc-pack table { min-width: 960px; width: 100%; border-collapse: collapse; table-layout: fixed; }
.rc-pack th { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); font-weight: 400; text-align: left; padding: 5px 0;
  border-bottom: 1px solid var(--line-soft); }
.rc-pack td { padding: 6px 0; border-bottom: 1px solid var(--line-soft); vertical-align: baseline; }
.rc-pack th:first-child, .rc-pack td:first-child { padding-left: 16px; }
.rc-pack th:last-child, .rc-pack td:last-child { padding-right: 16px; }
.rc-pack col.n { width: 42px; }
.rc-pack col.item { width: 250px; }
.rc-pack col.status { width: 96px; }
.rc-pack col.digest { width: 250px; }
.rc-pack col.source { width: 110px; }
.rc-pack tr[data-s="DEGRADED"] > td { background: var(--state-degraded-bg); }
.rc-pack tr[data-s="MISSING"] > td { background: var(--bad-bg); }
.rc-pack .n { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.rc-pack .item { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; padding-right: 8px; }
.rc-status { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; }
.rc-status[data-s="COMPLETE"] { color: var(--good); }
.rc-status[data-s="DEGRADED"] { color: var(--accent-2); }
.rc-status[data-s="INPUT"] { color: var(--accent); }
.rc-status[data-s="MISSING"] { color: var(--bad); }
.rc-pack .digest { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); padding-right: 8px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-pack .source { font-family: var(--font-mono); font-size: 10px; overflow-wrap: anywhere; padding-right: 8px; }
.rc-pack .source .off { color: var(--ink-faint); }
.rc-pack .note { font-size: 10.5px; color: var(--ink-faint); line-height: 1.5; overflow-wrap: anywhere; }
.rc-declared { display: block; margin-top: 3px; font-size: 11px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.rc-edit { margin-left: 6px; border: 0; background: transparent; color: var(--accent); font-family: var(--font-mono); font-size: 9.5px; padding: 0; cursor: pointer; }
.rc-edit[aria-disabled="true"] { color: var(--ink-faint); cursor: not-allowed; }
.rc-editor td { background: var(--paper); }
.rc-editor .box { display: flex; flex-direction: column; gap: 6px; max-width: 720px; }
.rc-editor textarea { width: 100%; min-height: 64px; resize: vertical; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper-raised); color: var(--ink);
  font-size: 12px; padding: 6px 8px; }
.rc-editor .acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.rc-btn { font-family: var(--font-mono); font-size: 10.5px; line-height: 22px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised);
  color: var(--ink); cursor: pointer; }
.rc-btn[data-primary="true"] { border-color: var(--accent); color: var(--accent); }
.rc-btn[aria-disabled="true"] { border-style: dashed; color: var(--ink-faint); cursor: not-allowed; }
.rc-packfoot { padding: 8px 16px; border-top: 1px solid var(--line-soft); background: var(--paper-sunken); font-size: 11px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
.rc-group3 { display: flex; gap: 14px; flex-wrap: wrap; align-items: stretch; min-width: 0; }
.rc-record { flex: 1.25 1 440px; min-width: min(440px, 100%); overflow: hidden; display: flex; flex-direction: column; }
.rc-record .h { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--line); }
.rc-copy { border: 0; background: transparent; color: var(--accent); font-family: var(--font-mono); font-size: 9.5px; padding: 0; cursor: pointer; }
.rc-yaml { flex: 1; padding: 10px 14px; background: var(--paper); overflow-x: auto; margin: 0; }
.rc-yaml .line { display: flex; font-family: var(--font-mono); font-size: 10.5px; line-height: 1.75; white-space: nowrap; }
.rc-yaml .k { color: var(--ink-mute); width: 270px; flex: none; }
.rc-yaml .v { color: var(--ink); }
.rc-yaml .v[data-tone="gold"] { color: var(--accent-2); }
.rc-yaml .v[data-tone="red"] { color: var(--bad); }
.rc-yaml .v[data-tone="dim"] { color: var(--ink-mute); }
.rc-side { flex: 1 1 360px; min-width: min(360px, 100%); display: flex; flex-direction: column; gap: 14px; }
.rc-seal { border: 1px solid var(--accent-2); border-radius: 8px; background: var(--paper); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-seal .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--accent-2); margin: 0; }
.rc-seal p { font-size: 11.5px; color: var(--ink); line-height: 1.6; margin: 0; }
.rc-seal p.sod { font-size: 10px; color: var(--ink-faint); line-height: 1.5; }
.rc-sealbtn { border: 1px solid var(--accent-2); border-radius: 6px; background: var(--accent-2); color: var(--accent-contrast); padding: 9px 14px; font-family: var(--font-mono);
  font-size: 11px; font-weight: 600; letter-spacing: .03em; cursor: pointer; text-align: left; }
.rc-sealbtn[aria-disabled="true"] { border: 1px dashed var(--line-strong); background: var(--paper); color: var(--ink-faint); cursor: not-allowed; }
.rc-blocked { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-blocked .code { color: var(--ink-faint); }
.rc-notice { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; background: var(--paper-raised); font-size: 11px;
  line-height: 1.5; color: var(--ink-soft); overflow-wrap: anywhere; }
.rc-notice[data-outcome="conflict"], .rc-notice[data-outcome="denied"], .rc-notice[data-outcome="terminal"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.rc-notice[data-outcome="unavailable"] { border-color: var(--line-strong); background: var(--paper-sunken); }
.rc-notice[data-outcome="saved"], .rc-notice[data-outcome="sealed"], .rc-notice[data-outcome="published"] { border-color: var(--good); background: var(--good-bg); color: var(--good); }
.rc-notice .code { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rc-sealed { border: 1px solid var(--good); border-radius: 8px; background: var(--good-bg); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rc-sealed .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--good); margin: 0; }
.rc-sealed .id { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--good); overflow-wrap: anywhere; }
.rc-sealed .id a { color: var(--good); }
.rc-sealed p { font-size: 11px; color: var(--ink-soft); line-height: 1.55; margin: 0; overflow-wrap: anywhere; }
.rc-ghost { border: 1px dashed var(--line-strong); border-radius: 8px; background: var(--paper); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;
  opacity: .75; min-width: 0; }
.rc-ghost .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); margin: 0; }
.rc-ghost p { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
.rc-ghostbtn { align-self: flex-start; border: 1px dashed var(--line-strong); border-radius: 6px; background: var(--paper); color: var(--ink-faint); padding: 9px 14px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600; }
.rc-mirrorrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); padding: 8px 12px; }
.rc-mirrorrow .gate { font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--accent); border: 1px solid var(--accent); border-radius: 3px; padding: 1px 6px; flex: none; }
.rc-mirrorrow .subj { font-family: var(--font-mono); font-size: 10.5px; flex: 1 1 170px; min-width: 0; }
.rc-mirrorrow .st, .rc-mirrorrow .sla { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); flex: none; }
.rc-mirrormeta { display: flex; gap: 4px 10px; flex-wrap: wrap; font-size: 10px; color: var(--ink-faint); }
.rc-claims { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rc-claims legend { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--accent-2); padding: 0; margin-bottom: 2px; }
.rc-claims label { display: flex; gap: 6px; align-items: baseline; font-family: var(--font-mono); font-size: 10.5px; color: var(--ink); overflow-wrap: anywhere; min-width: 0; }
.rc-pubfacts { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); overflow-wrap: anywhere; margin: 0; }
.rc-unknown { border: 1px dashed var(--accent-2); border-radius: 8px; background: var(--accent-2-soft); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-unknown .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--accent-2); margin: 0; }
.rc-unknown p { font-size: 11px; color: var(--ink); line-height: 1.55; margin: 0; overflow-wrap: anywhere; }
.rc-mirror { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); padding: 14px 16px; display: flex;
  flex-direction: column; gap: 8px; min-width: 0; }
.rc-mirror .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); margin: 0; }
.rc-mirror p { font-size: 10.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; overflow-wrap: anywhere; }
.rc-mirror .facts { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.rc-mirror .superseded { font-size: 10.5px; color: var(--bad); }
.rc-mirror .stale { font-family: var(--font-mono); font-size: 10px; color: var(--accent-2); }
.rc-mirrorrow .sla[data-live="true"] { color: var(--ink-soft); }
.rc-mirror .rc-mirrorrow .st, .rc-mirror .rc-mirrorrow .sla { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.rc-mstatus { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid var(--accent-2); border-radius: 3px; padding: 1px 7px; background: var(--accent-2-soft);
  color: var(--accent-2); flex: none; }
.rc-mstatus[data-s="APPROVED"], .rc-mstatus[data-s="APPROVED_WITH_CONDITION"] { border-color: var(--good); background: var(--good-bg); color: var(--good); }
.rc-mstatus[data-s="DENIED"] { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
.rc-mstatus[data-s="EXPIRED"] { border-color: var(--line-strong); background: var(--paper); color: var(--ink-faint); }
.rc-meff { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); flex: none; }
.rc-reason { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rc-absent { font-family: var(--font-mono); font-style: italic; color: var(--ink-faint); font-size: 9.5px; }
.rc-pending { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); padding: 10px 16px; }
.rc-skel { display: block; border-radius: 4px; background: var(--paper-sunken); height: 12px; }
.rc-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.rc-foot .t { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 0; font-weight: 400; }
.rc-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
@media (max-width: 900px) {
  .rc-verdict { border-left: 0; padding-left: 0; border-top: 1px solid var(--line-soft); padding-top: 10px; }
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

/** A value the server did not send: the state word and the reason, never a digit. */
function Absent({ what, availability }: { what?: string; availability: RcAvailability }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what ?? ""} data-absent-state={availability.state}>
      <span className="rc-absent">
        {what ? `${what} — ` : ""}
        {RC_WITHHELD_WORDS[availability.state]}
      </span>
      <span className="rc-reason" data-reason-code>
        {reasonOf(availability)}
      </span>
    </span>
  );
}

/** A server-supplied path becomes a link only when it is a same-origin path. */
function isLocalPath(href: string | null): href is string {
  return href !== null && href.startsWith("/") && !href.startsWith("//");
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

/* ---------------------------------------------------------------- header */

function Header({
  runId,
  here,
  chips,
}: {
  runId: string | null;
  here: ReactNode;
  chips: ReactNode;
}) {
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
              <span className="rc-mono rc-long" data-crumb-run>
                {runId}
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

function SealChips({ seal }: { seal: RcLocalSeal }) {
  if (seal.state !== "SEALED_LOCAL") return null;
  return (
    <>
      <span className="rc-state" data-s="SEALED_LOCAL" data-seal-chip>
        SEALED_LOCAL
      </span>
      <span className="rc-lifecycle" data-lifecycle>
        {seal.delivery_state ?? "delivery not published"} · {seal.approval_state ?? "approval not published"}
      </span>
    </>
  );
}

function Notice({
  state,
  requestId,
  code,
  onRetry,
  inFlight,
}: {
  state: ResearchState;
  requestId: string | null;
  code: string | null;
  onRetry: () => void;
  inFlight: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-panel="notice" data-rc-notice={state.state}>
      <ResearchPanel title="release candidate" state={state} minBodyHeight={0} />
      {code ? (
        <span className="rc-reason" data-error-code>
          {code}
        </span>
      ) : null}
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
    </div>
  );
}

function Banner({ availability }: { availability: RcAvailability }) {
  const [before, mono, middle, link, after] = NOT_PUBLISHABLE_COPY;
  return (
    <div className="rc-banner" data-panel="banner" role="note">
      <span className="badge">{NOT_PUBLISHABLE_BADGE}</span>
      <span className="txt">
        {before}
        <span className="rc-mono">{mono}</span>
        {middle}
        <Link to={`${RUNS_ROOT}/new`} data-action="new-run">
          {link}
        </Link>
        {after}{" "}
        <span className="rc-reason" data-reason-code>
          {reasonOf(availability)}
        </span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- identity */

function Rail({ nodes, sealedId }: { nodes: readonly RcRailNode[]; sealedId: string | null }) {
  return (
    <ol className="rc-rail" data-rail aria-label="lineage rail">
      {nodes.map((node, index) => {
        const label = RAIL_LABEL[node.key] ?? node.key;
        const linked = node.key === "release_candidate" && sealedId !== null && node.value === sealedId;
        return (
          <li key={`${node.key}-${index}`}>
            <div
              className="rc-node"
              data-rail-node={node.key}
              data-tone={node.tone}
              title={node.detail ? `${label} — ${node.detail}` : label}
            >
              <span className="k">{label}</span>
              <span className="v" data-rail-value>
                {linked ? (
                  <Link to={releaseCandidatePackHref(node.value)} data-action="open-pack">
                    {node.value}
                  </Link>
                ) : (
                  node.value
                )}
              </span>
              {node.detail !== null ? (
                <span className="sub" data-rail-detail>
                  {node.detail}
                </span>
              ) : null}
            </div>
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
      <p className="rc-k" data-taxonomy-caption>
        {TAXONOMY_CAPTION}
        {comparison.last_release_candidate_id !== null ? (
          <span className="rc-mono" data-last-rc>
            {comparison.last_release_candidate_id}
          </span>
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
            <tr key={`${row.what}-${index}`} data-taxonomy-row={row.what}>
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
          <Rail
            nodes={compose.rail}
            sealedId={compose.local_seal.state === "SEALED_LOCAL" ? compose.local_seal.release_candidate_id : null}
          />
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

function CertChip({
  className,
  axis,
  title,
  name,
  present,
}: {
  className: string;
  axis: RcCertificationAxis;
  title: string;
  name: string;
  present: string;
}) {
  const shown = axis.value !== null && axis.availability.state === "AVAILABLE";
  return (
    <span className={className} data-ghost={shown ? "false" : "true"} title={title} data-cert={name}>
      {shown ? (
        `${present} ${axis.value}`
      ) : (
        <>
          {present} — {RC_WITHHELD_WORDS[axis.availability.state]}{" "}
          <span className="rc-reason" data-reason-code>
            {reasonOf(axis.availability)}
          </span>
        </>
      )}
    </span>
  );
}

function statusTitle(item: RcPackItem): string {
  return item.status === "MISSING" ? reasonOf(item.availability) : STATUS_TITLE[item.status];
}

function SourceCell({ item }: { item: RcPackItem }) {
  if (isLocalPath(item.source.href)) {
    return (
      <Link to={item.source.href} data-source-href={item.source.href}>
        {item.source.label}
      </Link>
    );
  }
  const title = item.key === "ALPHA_VERSION_PASSPORT" ? ALPHA360_TITLE : NO_SOURCE_LINK_TITLE;
  return (
    <span className="off" title={title} data-source-unlinked>
      {item.source.label}
    </span>
  );
}

export interface DeclarationEditor {
  /** Text in the open editors, by row. A row with no entry is closed. */
  edits: Partial<Record<DeclarationKey, string>>;
  /** Why editing is off, or null when a row may be edited. */
  lockedReason: string | null;
  /** False once the server says no draft edit is admitted (a published candidate, T07): no edit button at all. */
  editable: boolean;
  pending: boolean;
  open: (key: DeclarationKey) => void;
  change: (key: DeclarationKey, text: string) => void;
  cancel: (key: DeclarationKey) => void;
  save: () => void;
  /** Why save is off, or null. */
  saveBlocked: string | null;
  notice: ReactNode;
}

function DeclarationRow({ item, editor }: { item: RcPackItem; editor: DeclarationEditor }) {
  const key = declarationKey(item.key)!;
  const text = editor.edits[key] ?? "";
  const labelId = useId();
  const blockedId = useId();
  return (
    <tr className="rc-editor" data-editor={item.key}>
      <td colSpan={6}>
        <div className="box">
          <label id={labelId} className="rc-k" htmlFor={`${labelId}-input`}>
            {item.item} — declaration
          </label>
          <textarea
            id={`${labelId}-input`}
            data-declaration-input={item.key}
            value={text}
            onChange={(event) => editor.change(key, event.target.value)}
            readOnly={editor.lockedReason !== null}
          />
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

function PackRow({
  item,
  declared,
  editor,
}: {
  item: RcPackItem;
  declared: string | null | undefined;
  editor: DeclarationEditor | null;
}) {
  const decl = declarationKey(item.key);
  const editing = decl !== null && editor !== null && editor.edits[decl] !== undefined;
  return (
    <>
      <tr data-pack-row={item.key} data-s={item.status} data-n={item.n}>
        <td className="n">{item.n}</td>
        <td className="item">{item.item}</td>
        <td>
          <span className="rc-status" data-s={item.status} title={statusTitle(item)} data-status>
            {item.status}
          </span>
        </td>
        <td className="digest" data-digest title={item.digest ?? undefined}>
          {item.digest !== null ? item.digest : <Absent availability={item.availability} />}
        </td>
        <td className="source">
          <SourceCell item={item} />
        </td>
        <td className="note">
          {item.note}
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

function PackBlock({
  items,
  counts,
  axes,
  declarations,
  editor,
  state,
}: {
  items: readonly RcPackItem[] | null;
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
        <div className="rc-pack" data-pack-scroll>
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
        <button
          type="button"
          className="rc-copy"
          data-action="copy-yaml"
          aria-disabled={fields === null || undefined}
          onClick={onCopy}
        >
          {copy === "copied" ? "✓ copied" : copy === "failed" ? "copy unavailable" : "copy yaml"}
        </button>
      </div>
      {fields ? (
        <div className="rc-yaml" data-yaml role="list" aria-label="record fields">
          {fields.map((field) => (
            <div key={field.key} className="line" role="listitem" data-yaml-key={field.key}>
              <span className="k">{field.key}</span>
              <span className="v" data-tone={field.tone} data-yaml-value title={field.label}>
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

function WriteNotice({ slot, op }: { slot: RcWriteSlot; op: RcWriteOp }) {
  if (slot.state === "refused" && slot.op === op) {
    const { refusal } = slot;
    return (
      <div className="rc-notice" data-write-notice={op} data-outcome={refusal.outcome} role="alert">
        <span>{refusal.message}</span>
        {refusal.code ? (
          <span className="code" data-error-code>
            {refusal.code}
          </span>
        ) : null}
        {refusal.requestId ? (
          <span className="code" data-request-id>
            request {refusal.requestId}
          </span>
        ) : null}
      </div>
    );
  }
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
        <span>{slot.replayed ? SEALED_REPLAY : "sealed locally"}</span>
        <span className="code" data-seal-response-id>
          {slot.seal.release_candidate_id}
        </span>
      </div>
    );
  }
  if (slot.state === "published" && slot.op === op) {
    return (
      <div className="rc-notice" data-write-notice={op} data-outcome="published" role="status">
        <span>{slot.answer.replayed ? "already published — same approval" : op === "reconcile" ? "reconciled — receipt recovered" : "published"}</span>
        <span className="code" data-publication-answer>
          {slot.answer.publication_state} · {slot.answer.approval_id ?? "approval id not published"}
        </span>
      </div>
    );
  }
  return null;
}

function SealCard({
  compose,
  controller,
}: {
  compose: RcCompose | null;
  controller: ReleaseCandidateController;
}) {
  const reasonId = useId();
  const pending = controller.write.state === "pending";
  let blocked: { label: string; code: string | null } | null = null;
  if (!compose) blocked = { label: "the composition has not been read", code: null };
  else if (controller.writesLocked) blocked = { label: "writes are off — access changed", code: null };
  else if (!compose.actions.may_seal)
    blocked = compose.actions.seal_blocked_reason
      ? { label: sealBlockedLabel(compose.actions.seal_blocked_reason), code: compose.actions.seal_blocked_reason }
      : { label: "seal blocked", code: null };
  else if (compose.draft.draft_id === null) blocked = { label: DRAFT_NOT_PERSISTED, code: null };
  else if (pending) blocked = { label: controller.write.state === "pending" && controller.write.op === "seal" ? "sealing…" : "a save is in flight", code: null };

  return (
    <section className="rc-seal" data-panel="seal" aria-label="local seal">
      <h3 className="k">local seal</h3>
      <p>{SEAL_SENTENCE}</p>
      <button
        type="button"
        className="rc-sealbtn"
        data-action="local-seal"
        aria-disabled={blocked !== null || undefined}
        aria-describedby={blocked !== null ? reasonId : undefined}
        aria-busy={pending || undefined}
        onClick={() => {
          if (blocked === null) controller.seal();
        }}
      >
        {SEAL_LABEL}
      </button>
      {blocked !== null ? (
        <span id={reasonId} className="rc-blocked" data-seal-blocked={blocked.code ?? ""}>
          {blocked.label}
          {blocked.code && blocked.code !== blocked.label ? <span className="code"> · {blocked.code}</span> : null}
        </span>
      ) : null}
      <WriteNotice slot={controller.write} op="seal" />
    </section>
  );
}

function SealedCard({
  seal,
  replayed,
}: {
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
    <section className="rc-sealed" data-panel="sealed" aria-label="sealed locally">
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
        sealed_at {seal.sealed_at_utc_ms !== null ? iso(seal.sealed_at_utc_ms) : "not published"} · pack digest{" "}
        {seal.pack_digest ?? "not published"}
      </p>
      <p className="rc-mono" data-sealed-lifecycle>
        {seal.delivery_state ?? "delivery not published"} · {seal.approval_state ?? "approval not published"}
      </p>
      {seal.availability.state !== "AVAILABLE" ? (
        <p data-sealed-availability>
          <Absent what="this seal" availability={seal.availability} />
        </p>
      ) : null}
      {replayed ? <p data-sealed-replay>{SEALED_REPLAY}</p> : null}
      <p>{SEALED_SENTENCE}</p>
    </section>
  );
}

/** The pack route's publish slot: read-only, nothing to operate. */
function PublishGhost({ reason }: { reason: ReactNode }) {
  return (
    <section className="rc-ghost" data-panel="publish-ghost" aria-label="publish, on the run's composition">
      <h3 className="k">{PUBLISH_GHOST_LABEL}</h3>
      <p>{PUBLISH_GHOST_COPY}</p>
      <span className="rc-reason" data-reason-code>
        {reason}
      </span>
    </section>
  );
}

/** Server facts of the latest attempt, printed as sent; never a verdict of the browser's. */
function PublicationFacts({ publication }: { publication: RcPublication }) {
  if (publication.state === null) return null;
  return (
    <p className="rc-pubfacts" data-publication-facts={publication.state}>
      publication {publication.state}
      {publication.attempt_count !== null ? ` · attempt ${publication.attempt_count}` : " · attempt not published"}
      {publication.updated_at_utc_ms !== null ? ` · recorded ${iso(publication.updated_at_utc_ms)}` : ""}
      {publication.intent_actor !== null ? ` · by ${publication.intent_actor.username}` : ""}
      {publication.downstream_code !== null ? (
        <>
          {" · downstream "}
          <span data-downstream-code>{publication.downstream_code}</span>
        </>
      ) : null}
      {publication.conflicting_approval_id !== null ? (
        <>
          {" · open approval "}
          <span data-conflicting-approval>{publication.conflicting_approval_id}</span>
        </>
      ) : null}
    </p>
  );
}

/** Hi-fi draft branch: one button, one click (VD-P22-04). */
function PublishCard({ compose, controller }: { compose: RcCompose | null; controller: ReleaseCandidateController }) {
  const reasonId = useId();
  const claimName = useId();
  const [claim, setClaim] = useState<string | null>(null);
  const action = compose?.actions.publish ?? null;
  const releaseCandidateId = action?.release_candidate_id ?? compose?.local_seal.release_candidate_id ?? null;
  const claims = compose?.publication.claim_candidates ?? [];
  const choose = claims.length > 1;
  const pending = controller.write.state === "pending";
  const publishing = controller.write.state === "pending" && controller.write.op === "publish";

  let blocked: { label: string; code: string | null } | null = null;
  if (!compose || !action) blocked = { label: "the composition has not been read", code: null };
  else if (controller.writesLocked) blocked = { label: "writes are off — access changed", code: null };
  else if (!action.enabled)
    blocked = action.blocked_reason
      ? { label: publishBlockedLabel(action.blocked_reason), code: action.blocked_reason }
      : { label: "publish blocked", code: null };
  else if (releaseCandidateId === null || compose.local_seal.pack_digest === null)
    blocked = { label: publishBlockedLabel(compose.local_seal.availability.reason_code ?? "P21_LOCAL_SEAL_NOT_CREATED"), code: null };
  else if (choose && (claim === null || !claims.includes(claim))) blocked = { label: CLAIM_REQUIRED, code: null };
  else if (pending) blocked = { label: publishing ? PUBLISHING_LABEL : "another write is in flight", code: null };

  const label = publishing
    ? PUBLISHING_LABEL
    : blocked === null && releaseCandidateId !== null
      ? publishButtonLabel(releaseCandidateId)
      : (blocked?.label ?? PUBLISH_LABEL);
  const [before, after] = PUBLISH_SENTENCE;

  return (
    <section className="rc-seal" data-panel="publish" aria-label="publish">
      <h3 className="k">{PUBLISH_LABEL}</h3>
      <p data-publish-sentence>
        {before}
        {releaseCandidateId !== null ? (
          <span className="rc-mono" data-publish-rc>
            {releaseCandidateId}
          </span>
        ) : (
          <Absent what="rc_" availability={compose?.local_seal.availability ?? { state: "NOT_PUBLISHED", reason_code: null }} />
        )}
        {after}
      </p>
      {compose && choose && action?.enabled ? (
        <fieldset className="rc-claims" data-claim-choice>
          <legend>{CLAIM_LEGEND}</legend>
          {claims.map((id) => (
            <label key={id}>
              <input
                type="radio"
                name={claimName}
                value={id}
                checked={claim === id}
                disabled={pending || controller.writesLocked}
                onChange={() => setClaim(id)}
                data-claim={id}
              />
              <span>{id}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <button
        type="button"
        className="rc-sealbtn"
        data-action="publish"
        data-publish-enabled={blocked === null ? "true" : "false"}
        aria-disabled={blocked !== null || undefined}
        aria-describedby={blocked !== null && !publishing ? reasonId : undefined}
        aria-busy={publishing || undefined}
        onClick={() => {
          if (blocked === null) controller.publish(choose ? claim : null);
        }}
      >
        {label}
      </button>
      {blocked !== null && !publishing ? (
        <span id={reasonId} className="rc-blocked" data-publish-blocked={blocked.code ?? ""}>
          {blocked.code ?? blocked.label}
        </span>
      ) : null}
      {compose ? <PublicationFacts publication={compose.publication} /> : null}
      <WriteNotice slot={controller.write} op="publish" />
      <p className="sod">{SOD_NOTE}</p>
    </section>
  );
}

/** VD-P22-05: an outcome the governance store did not confirm, recovered by reconcile only. */
function UnknownOutcomeCard({ compose, controller }: { compose: RcCompose; controller: ReleaseCandidateController }) {
  const reasonId = useId();
  const publication = compose.publication;
  const reconciling = controller.write.state === "pending" && controller.write.op === "reconcile";
  const pending = controller.write.state === "pending";
  const answer = controller.write.state === "unknown" ? controller.write.answer : null;
  const blocked = controller.writesLocked
    ? "writes are off — access changed"
    : !publication.reconcile_allowed
      ? RECONCILE_NOT_ADMITTED
      : !controller.canReconcile
        ? RECONCILE_REQUEST_NOT_AVAILABLE
      : pending
        ? reconciling
          ? RECONCILING_LABEL
          : "another write is in flight"
        : null;
  return (
    <section className="rc-unknown" data-panel="publish-unknown" aria-label="publication outcome unknown">
      <h3 className="k">{UNKNOWN_LABEL}</h3>
      <p>{UNKNOWN_COPY}</p>
      {answer !== null ? (
        <p className="rc-pubfacts" data-unknown-answer>
          {answer.publication_state} · {answer.release_candidate_id} · attempt {answer.attempt_count} · {answer.delivery_state} · {answer.approval_state}
        </p>
      ) : null}
      <PublicationFacts publication={publication} />
      <button
        type="button"
        className="rc-sealbtn"
        data-action="reconcile"
        aria-disabled={blocked !== null || undefined}
        aria-describedby={blocked !== null && !reconciling ? reasonId : undefined}
        aria-busy={reconciling || undefined}
        onClick={() => {
          if (blocked === null) controller.reconcile();
        }}
      >
        {reconciling ? RECONCILING_LABEL : RECONCILE_LABEL}
      </button>
      {blocked !== null && !reconciling ? (
        <span id={reasonId} className="rc-blocked" data-reconcile-blocked>
          {blocked}
        </span>
      ) : null}
      <WriteNotice slot={controller.write} op="publish" />
      <WriteNotice slot={controller.write} op="reconcile" />
    </section>
  );
}

/** Hi-fi published branch: the immutable record, facts from the server. */
function PublishedCard({ compose, mirror }: { compose: RcCompose; mirror: RcMirror | null }) {
  const publication = compose.publication;
  const releaseCandidateId = publication.release_candidate_id ?? compose.local_seal.release_candidate_id;
  return (
    <section className="rc-sealed" data-panel="published" aria-label="published">
      <h3 className="k">{PUBLISHED_LABEL}</h3>
      <span className="id" data-published-id>
        {releaseCandidateId !== null ? (
          <Link to={releaseCandidatePackHref(releaseCandidateId)} data-action="open-pack">
            {releaseCandidateId}
          </Link>
        ) : (
          <Absent what="release candidate id" availability={publication.availability} />
        )}
      </span>
      <p data-published-facts>
        <span className="rc-mono" data-published-at>
          published_at {publication.updated_at_utc_ms !== null ? iso(publication.updated_at_utc_ms) : "not published"}
        </span>
        {" · "}
        <span data-published-by>{publication.intent_actor !== null ? `by ${publication.intent_actor.username}` : PUBLISHED_BY_ABSENT}</span>
        {" · evidence digest "}
        {mirror !== null && mirror.evidence_set_hash !== null ? (
          <span className="rc-mono" data-evidence-digest>
            {mirror.evidence_set_hash}
          </span>
        ) : (
          <Absent availability={mirror?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }} />
        )}
        {". "}
        {PUBLISHED_SENTENCE}
      </p>
      <p className="rc-mono" data-published-receipt>
        receipt {publication.downstream_receipt_digest ?? "not published"} · approval {publication.approval_id ?? "not published"}
      </p>
    </section>
  );
}

/** Read-model ghost: nothing inside it is interactive (spec 11 §16.3). */
function MirrorGhost({ foot }: { foot: ReactNode }) {
  return (
    <section className="rc-ghost" data-panel="mirror-ghost" data-ghost="true" aria-label="approval inbox mirror, not published">
      <div className="rc-cardhead">
        <h3 className="k">{MIRROR_LABEL}</h3>
        <span className="rc-spec">{MIRROR_SIDE}</span>
      </div>
      <div className="rc-mirrorrow">
        <span className="gate">{MIRROR_GATE}</span>
        <span className="subj">{MIRROR_SUBJECT}</span>
        <span className="st" data-mirror-status="not-published">status not published</span>
        <span className="sla">{MIRROR_SLA}</span>
      </div>
      <div className="rc-mirrormeta">
        {MIRROR_META.map((part, index) => (
          <span key={part}>
            {index > 0 ? "· " : ""}
            {part}
          </span>
        ))}
      </div>
      <p>{MIRROR_NOTE}</p>
      <span className="rc-reason" data-mirror-foot>
        {foot}
      </span>
    </section>
  );
}

/** A mirror number or id, or its absence in words — never a digit the server did not send. */
function fact(value: string | number | null): string {
  return value === null ? "not published" : String(value);
}

/**
 * Hi-fi published branch: the solid inbox row. Read-only; its one link opens
 * the approval where decisions live (spec 11 §16.3 — no action buttons).
 */
function MirrorCard({ mirror, view }: { mirror: RcMirror | null; view: RcMirrorController["view"] }) {
  const readable = mirror !== null && mirror.status !== null && mirror.availability.state !== "NOT_APPLICABLE";
  return (
    <section className="rc-mirror" data-panel="mirror" data-mirror-view={view.state} aria-label="approval inbox mirror">
      <div className="rc-cardhead">
        <h3 className="k">{MIRROR_LABEL}</h3>
        <span className="rc-spec">{MIRROR_SIDE}</span>
      </div>
      {view.state === "denied" ? (
        <div className="rc-notice" data-outcome="denied" data-mirror-denied role="alert">
          <span>{view.status === 401 || view.status === 0 ? RC_DENIED_COPY : `${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`}</span>
          {view.code ? (
            <span className="code" data-error-code>
              {view.code}
            </span>
          ) : null}
          {view.requestId ? (
            <span className="code" data-request-id>
              request {view.requestId}
            </span>
          ) : null}
        </div>
      ) : mirror === null ? (
        <div className="rc-notice" data-outcome="unavailable" data-mirror-unavailable role="status">
          <span>{MIRROR_UNAVAILABLE}</span>
          {view.state === "unavailable" && view.code ? <span className="code">{view.code}</span> : null}
        </div>
      ) : (
        <>
          {view.state === "stale" ? (
            <span className="stale" data-mirror-stale role="status">
              {mirrorStaleLine(view.asOfUtcMs)}
            </span>
          ) : null}
          <div className="rc-mirrorrow">
            <span className="gate">{MIRROR_GATE}</span>
            <span className="subj rc-long" data-mirror-subject>
              {mirror.subject_label !== null ? mirror.subject_label : <Absent what="subject" availability={mirror.availability} />}
            </span>
            {readable ? (
              <>
                <span className="rc-mstatus" data-s={mirror.status ?? ""} data-mirror-status={mirror.status ?? ""}>
                  {mirror.status}
                </span>
                {mirror.effective_status !== null ? (
                  <span className="rc-meff" data-mirror-effective>
                    effective {mirror.effective_status}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="st" data-mirror-status="not-readable">
                approval status: {MIRROR_NOT_READABLE}
              </span>
            )}
            <span className="sla" data-live="true" data-mirror-sla>
              SLA due {fact(mirror.sla_due_at)} · expires {fact(mirror.expires_at)} · {MIRROR_LEFT_ABSENT}
            </span>
          </div>
          <div className="rc-mirrormeta" data-mirror-meta>
            <span>{MIRROR_POOL_ABSENT}</span>
            <span>·</span>
            <span data-mirror-conditions>{mirror.conditions.length === 0 ? MIRROR_CONDITIONS_NONE : `conditions: ${mirror.conditions.join(" · ")}`}</span>
            <span>·</span>
            <span>{MIRROR_OUTCOMES}</span>
          </div>
          <span className="facts rc-long" data-mirror-facts>
            approval {mirror.approval_id} · version {fact(mirror.approval_version)} · quorum {fact(mirror.quorum_met)} of {fact(mirror.quorum_required)} · blockers{" "}
            {fact(mirror.blocker_count)} · decisions {mirror.decision_outcomes.length === 0 ? "none recorded" : mirror.decision_outcomes.join(" · ")} · as of{" "}
            {iso(mirror.as_of_utc_ms)}
          </span>
          {mirror.availability.state !== "AVAILABLE" ? (
            <span data-mirror-availability>
              <Absent what="mirror" availability={mirror.availability} />
            </span>
          ) : null}
          {mirror.rc_superseded ? (
            <span className="superseded" data-mirror-superseded>
              {MIRROR_SUPERSEDED}
            </span>
          ) : null}
          <p>{MIRROR_PUBLISHED_NOTE}</p>
          {isLocalPath(mirror.href) ? (
            <span>
              <Link to={mirror.href} data-action="open-approval">
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

function useDeclarationEditor(controller: ReleaseCandidateController): DeclarationEditor {
  const [edits, setEdits] = useState<Partial<Record<DeclarationKey, string>>>({});
  const { compose, write, writesLocked } = controller;
  const pending = write.state === "pending";

  const lockedReason = !compose
    ? "the composition has not been read"
    : writesLocked
      ? "writes are off — access changed"
      : !compose.actions.may_edit_draft
        ? "the server does not admit a draft edit"
        : null;

  const payload = (): RcDeclarations | null => {
    if (!compose) return null;
    const draft = compose.draft;
    return {
      known_limitations:
        edits.KNOWN_LIMITATIONS_WAIVERS !== undefined ? normalized(edits.KNOWN_LIMITATIONS_WAIVERS) : draft.known_limitations,
      proposed_use_restrictions:
        edits.PROPOSED_USE_RESTRICTIONS !== undefined ? normalized(edits.PROPOSED_USE_RESTRICTIONS) : draft.proposed_use_restrictions,
    };
  };

  const next = payload();
  const saveBlocked =
    lockedReason ??
    (next !== null && next.known_limitations === null && next.proposed_use_restrictions === null
      ? "at least one declaration is required"
      : null);

  return {
    edits,
    lockedReason,
    editable: compose?.actions.may_edit_draft ?? false,
    pending,
    open: (key) =>
      setEdits((current) =>
        current[key] !== undefined ? current : { ...current, [key]: compose?.draft[DECLARATION_FIELD[key]] ?? "" },
      ),
    change: (key, text) => setEdits((current) => ({ ...current, [key]: text })),
    cancel: (key) =>
      setEdits((current) => {
        const copy = { ...current };
        delete copy[key];
        return copy;
      }),
    save: () => {
      const body = payload();
      if (!body) return;
      void controller.patchDraft(body).then((ok) => {
        /* Only a 200 closes the editors; a refusal keeps every typed character. */
        if (ok) setEdits({});
      });
    },
    saveBlocked,
    notice: <WriteNotice slot={write} op="patch" />,
  };
}

/* ---------------------------------------------------------------- screen */

export type ReleaseCandidateScreenProps =
  | { mode: "compose"; runId: string; controller: ReleaseCandidateController; mirror: RcMirrorController }
  | { mode: "pack"; releaseCandidateId: string; controller: RcPackController };

/** Which card sits in the publish slot: the server's state decides; a 202 in hand shows the unknown card until the re-read lands. */
function publishSlot(compose: RcCompose | null, write: RcWriteSlot): "publish" | "publish-unknown" | "published" {
  if (compose?.state === "PUBLISHED") return "published";
  const unsettled = compose?.publication.state === "PENDING" || compose?.publication.state === "UNKNOWN";
  if (compose && (unsettled || write.state === "unknown")) return "publish-unknown";
  return "publish";
}

function ComposeScreen({
  runId,
  controller,
  mirror,
}: {
  runId: string;
  controller: ReleaseCandidateController;
  mirror: RcMirrorController;
}) {
  const { compose, state } = controller;
  const slot = publishSlot(compose, controller.write);
  const editor = useDeclarationEditor(controller);
  const sealed = compose?.local_seal.state === "SEALED_LOCAL" ? compose.local_seal : null;
  const replayed = controller.write.state === "sealed" && controller.write.replayed;
  const unbound = compose?.source_absences.alpha_binding;

  return (
    <div
      className="rc-page"
      data-screen="release-candidate"
      data-rc-mode="compose"
      data-run={runId}
      data-rc-state={state.state}
      data-domain-state={compose?.state ?? ""}
      data-request-count={controller.requestCount}
      data-mirror-requests={mirror.requestCount}
      data-mirror-polling={mirror.polling ? "true" : "false"}
      aria-busy={controller.inFlight}
    >
      <style>{RC_CSS}</style>
      <Header
        runId={runId}
        here={RC_CRUMB}
        chips={
          compose ? (
            <>
              <span className="rc-state" data-s={compose.state} data-state-chip>
                {compose.state}
              </span>
              <SealChips seal={compose.local_seal} />
            </>
          ) : null
        }
      />
      <div className="rc-meta" data-panel="meta">
        {compose ? (
          <>
            <span>{compose.read_authority}</span>
            <span data-as-of>as of {iso(compose.as_of_utc_ms)}</span>
            <span data-source-fingerprint>source {compose.source_fingerprint}</span>
            <span data-draft-meta>
              draft {compose.draft.state} · revision {compose.draft.revision}
              {compose.draft.updated_at_utc_ms !== null ? ` · saved ${iso(compose.draft.updated_at_utc_ms)}` : ""}
            </span>
          </>
        ) : (
          <span>{state.state}</span>
        )}
      </div>
      {state.state !== "available" ? (
        <Notice
          state={state}
          requestId={controller.refusal?.requestId ?? null}
          code={controller.refusal?.code ?? null}
          onRetry={controller.retry}
          inFlight={controller.inFlight}
        />
      ) : null}
      {unbound && unbound.state === "NOT_PUBLISHED" ? <Banner availability={unbound} /> : null}
      <IdentityBlock compose={compose} state={state} />
      <PackBlock
        items={compose?.pack ?? null}
        counts={compose?.pack_counts ?? null}
        axes={compose?.certification_axes ?? null}
        declarations={compose ? compose.draft : null}
        editor={compose ? editor : null}
        state={state}
      />
      <div className="rc-group3">
        <RecordBlock fields={compose?.yaml ?? null} state={state} />
        <div className="rc-side">
          <SealCard compose={compose} controller={controller} />
          {sealed ? <SealedCard seal={sealed} replayed={replayed} /> : null}
          {slot === "published" && compose ? (
            <PublishedCard compose={compose} mirror={mirror.mirror} />
          ) : slot === "publish-unknown" && compose ? (
            <UnknownOutcomeCard compose={compose} controller={controller} />
          ) : (
            <PublishCard compose={compose} controller={controller} />
          )}
          {compose?.state === "PUBLISHED" && (compose.mirror !== null || mirror.view.state !== "fresh") ? (
            <MirrorCard mirror={mirror.mirror} view={mirror.view} />
          ) : (
            <MirrorGhost
              foot={
                <>
                  {MIRROR_GHOST_FOOT}
                  {compose?.source_absences.approval_mirror ? ` · ${reasonOf(compose.source_absences.approval_mirror)}` : ""}
                </>
              }
            />
          )}
        </div>
      </div>
      <Rules />
    </div>
  );
}

function PackScreen({ releaseCandidateId, controller }: { releaseCandidateId: string; controller: RcPackController }) {
  const { pack, state } = controller;
  return (
    <div
      className="rc-page"
      data-screen="release-candidate"
      data-rc-mode="pack"
      data-release-candidate={releaseCandidateId}
      data-rc-state={state.state}
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
        chips={pack ? <SealChips seal={pack.delivery} /> : null}
      />
      <div className="rc-meta" data-panel="meta">
        {pack ? (
          <>
            <span>{pack.read_authority}</span>
            <span data-sealed-at>sealed {iso(pack.sealed_at_utc_ms)}</span>
            <span data-pack-digest>pack {pack.pack_digest}</span>
            <span data-source-fingerprint>source {pack.frozen_core.source_fingerprint}</span>
          </>
        ) : (
          <span>{state.state}</span>
        )}
      </div>
      {state.state !== "available" ? (
        <Notice
          state={state}
          requestId={controller.refusal?.requestId ?? null}
          code={controller.refusal?.code ?? null}
          onRetry={controller.retry}
          inFlight={controller.inFlight}
        />
      ) : null}
      <PackIdentity pack={pack} state={state} />
      <PackBlock
        items={pack?.frozen_core.pack ?? null}
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
          <PublishGhost reason={pack ? `${pack.delivery.delivery_state ?? "delivery not published"} · ${pack.delivery.approval_state ?? "approval not published"}` : state.state} />
          <MirrorGhost foot={MIRROR_GHOST_PACK_FOOT} />
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
              <div className="rc-node" data-rail-node="run" data-tone="ink">
                <span className="k">{RAIL_LABEL.run}</span>
                <span className="v">{pack.run_id}</span>
              </div>
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
    <ComposeScreen runId={props.runId} controller={props.controller} mirror={props.mirror} />
  ) : (
    <PackScreen releaseCandidateId={props.releaseCandidateId} controller={props.controller} />
  );
}
