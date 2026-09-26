/**
 * Screen 11 — Release Candidate composer (P21).
 *
 * The hi-fi composes one promotable unit in three blocks — identity & lineage,
 * a 12-row R1 evidence pack, and the record preview beside publish and the
 * Approval Inbox mirror. P21 delivers the local half of that story, so the
 * screen keeps the hi-fi's hierarchy and says, in place, what this build does:
 *
 *  - **every value is the server's.** The 17 fields, the YAML list (the same
 *    list), the 12 rows and their counter, the rail, the taxonomy and the gate
 *    verdict render as sent. Nothing here counts, sorts, diffs or re-hashes.
 *  - **the verb is the local seal.** It needs saved declarations and the
 *    server's `may_seal`, asks for confirmation, and shows the immutable pack
 *    it produced (`SEALED_LOCAL · NOT_DELIVERED · NOT_APPROVED`).
 *  - **publish and the mirror are drawn as the hi-fi's ghost**, typed by the
 *    server's `P22_PUBLICATION_NOT_COMMISSIONED`. There is no publish request,
 *    no fake `PUBLISHED`, no SLA, no R1 row.
 *  - **a refusal is panel-local.** Denied, unavailable, conflict and terminal
 *    each keep the composition on screen and name themselves where they
 *    happened; a whole-route error page is only for a composition that could
 *    not be read at all.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ResearchPanel } from "./ResearchPanel";
import {
  CLAIM_CHIP_TITLE,
  CONFLICT_COPY,
  DECLARATION_MAX,
  DECLARATION_OF_ROW,
  DENIED_COPY,
  ENGINE_CHIP_TITLE,
  IDENTITY_LABEL,
  IDENTITY_NOTE,
  MIRROR_GHOST_NOTE,
  MIRROR_LABEL,
  MIRROR_NOTE_RIGHT,
  MIRROR_OUTCOMES,
  MIRROR_SLA,
  MIRROR_SUBJECT,
  NOT_PUBLISHABLE_TEXT_AFTER,
  NOT_PUBLISHABLE_TEXT_BEFORE,
  PACK_FOOTER,
  PACK_LABEL,
  PUBLISH_BUTTON,
  PUBLISH_LABEL,
  PUBLISH_TEXT,
  RC_P21_NOTE,
  RC_SUBTITLE,
  RC_TITLE,
  RULES_FOOTER,
  SEALED_NOTE,
  SEAL_BUTTON,
  SEAL_CONFIRM,
  SEAL_LABEL,
  SEAL_TEXT,
  SOD_NOTE,
  STATUS_TITLE,
  UNAVAILABLE_COPY,
  YAML_LABEL,
  packSourceRoute,
  railRoute,
  rcReasonSentence,
  yamlLine,
  yamlText,
  type DeclarationKey,
  type RcCertificationAxis,
  type RcCompose,
  type RcField,
  type RcPack,
  type RcPackItem,
  type RcPublishGate,
} from "./releaseCandidateClient";
import { formatUtc } from "./researchFormat";
import type { ReleaseCandidateController } from "./useReleaseCandidate";

/* ------------------------------------------------------------------ style */

/*
 * Spec 11 §11 CSS ledger, in palette tokens (the Research surface takes no raw
 * colour). The hi-fi's warm-white gold tint and off-white YAML ground have no
 * token; they map to --paper and --paper-raised (W5c decision D-06).
 */
const RC_CSS = `
.rc-page { display: flex; flex-direction: column; gap: 14px; color: var(--ink); font-size: 13px; min-width: 0; }
.rc-mono { font-family: var(--font-mono); }
.rc-long { overflow-wrap: anywhere; word-break: break-all; min-width: 0; }
.rc-faint { color: var(--ink-faint); }
.rc-soft { color: var(--ink-soft); }
.rc-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 16px;
  border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.rc-head .crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); min-width: 0; }
.rc-head .title { font-family: var(--font-display); font-size: 22px; font-weight: 300; letter-spacing: -.01em; margin: 0; }
.rc-head .sub { font-family: var(--font-display); font-style: italic; font-size: 13.5px; color: var(--ink-faint); margin: 0; }
.rc-head .p21 { font-size: 11.5px; color: var(--ink-soft); margin: 0; }
.rc-head .right { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rc-state { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .05em; border-radius: 999px; padding: 2px 10px; border: 1px solid; white-space: nowrap; }
/* D-07: gold and green text clear AA only on the raised paper (4.71 / 5.25), so chips keep that ground. */
.rc-state[data-s="DRAFT"] { border-color: var(--accent-2); color: var(--accent-2); background: var(--paper-raised); }
.rc-state[data-s="SEALED_LOCAL"] { border-color: var(--good); color: var(--good); background: var(--paper-raised); }
.rc-state[data-s="NOT_PUBLISHABLE"] { border-color: var(--bad); color: var(--bad); background: var(--bad-bg); }
.rc-btnlink { border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); color: var(--accent); padding: 5px 14px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; text-decoration: none; white-space: nowrap; }
.rc-banner { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; border: 1px dashed var(--bad); border-radius: 8px; background: var(--bad-bg); padding: 10px 14px; }
.rc-banner .badge { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--bad); flex: none; }
.rc-banner .txt { font-size: 12px; line-height: 1.55; flex: 1 1 280px; min-width: 0; }
.rc-alert { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; border: 1px solid var(--bad); border-radius: 8px; background: var(--bad-bg);
  padding: 8px 14px; font-size: 12px; line-height: 1.55; }
.rc-alert[data-tone="neutral"] { border-color: var(--line); background: var(--paper-sunken); }
.rc-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.rc-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); }
.rc-rail { display: flex; flex-wrap: wrap; align-items: stretch; row-gap: 10px; }
.rc-railitem { display: flex; align-items: center; min-width: 0; max-width: 100%; }
.rc-node { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised);
  padding: 7px 12px; min-width: 150px; max-width: min(320px, 100%); color: inherit; text-decoration: none; }
.rc-node .k { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-faint); }
.rc-node .v { font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; overflow-wrap: anywhere; word-break: break-all; }
.rc-node .sub { font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rc-node[data-tone="gold"] { border-color: var(--accent-2); box-shadow: inset 3px 0 0 var(--accent-2); }
.rc-node[data-tone="gold"] .v { color: var(--accent-2); }
.rc-node[data-tone="green"] { border-color: var(--good); box-shadow: inset 3px 0 0 var(--good); }
.rc-node[data-tone="green"] .v { color: var(--good); }
.rc-node[data-tone="dim"] { border-style: dashed; border-color: var(--line-strong); }
.rc-node[data-tone="dim"] .v { color: var(--ink-faint); }
.rc-node[data-tone="dim"] .k { color: var(--ink-faint); }
a.rc-node:hover { border-color: var(--accent); text-decoration: none; }
.rc-arrow { padding: 0 8px; color: var(--ink-faint); font-size: 12px; align-self: center; }
.rc-split { display: flex; flex-wrap: wrap; gap: 14px; border-top: 1px solid var(--line-soft); padding-top: 10px; }
.rc-tax { flex: 1.3 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rc-tax .hdr, .rc-tax .row { display: flex; align-items: baseline; }
.rc-tax .hdr { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); border-bottom: 1px solid var(--line-soft); padding-bottom: 3px; }
.rc-tax .row { font-size: 11px; padding: 3px 0; border-bottom: 1px solid var(--paper-sunken); }
.rc-tax .what { width: 210px; flex: none; color: var(--ink-soft); padding-right: 8px; }
.rc-tax .state { width: 120px; flex: none; font-family: var(--font-mono); font-size: 10px; font-weight: 600; }
.rc-tax .state[data-s="UNCHANGED"] { color: var(--good); }
.rc-tax .state[data-s="CHANGED"] { color: var(--bad); }
.rc-tax .state[data-s="UNSET"] { color: var(--ink-faint); }
.rc-tax .cons { flex: 1; min-width: 0; color: var(--ink-soft); line-height: 1.5; }
.rc-verdict { flex: 1 1 300px; min-width: 0; border-left: 1px solid var(--line-soft); padding-left: 14px; display: flex; flex-direction: column; gap: 5px; }
.rc-verdict .t { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--accent-2); }
.rc-verdict .b { font-size: 11px; color: var(--ink-soft); line-height: 1.55; }
.rc-reason { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); overflow-wrap: anywhere; }
.rc-packcard { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1); min-width: 0; }
.rc-packhead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.rc-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rc-ceiling, .rc-engcert { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid; border-radius: 3px; padding: 1px 7px; white-space: nowrap; }
.rc-ceiling { border-color: var(--accent-2); color: var(--accent-2); background: var(--paper-raised); }
.rc-engcert { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.rc-ceiling[data-ghost], .rc-engcert[data-ghost] { border-style: dashed; border-color: var(--line-strong); color: var(--ink-faint); background: var(--paper); font-weight: 600; }
.rc-count { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.rc-pack { overflow-x: auto; }
.rc-pack table { border-collapse: collapse; min-width: 960px; width: 100%; table-layout: fixed; }
.rc-pack th { text-align: left; font-weight: 400; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint);
  border-bottom: 1px solid var(--line-soft); padding: 5px 0; }
.rc-pack th:first-child, .rc-pack td:first-child { padding-left: 16px; }
.rc-pack th:last-child, .rc-pack td:last-child { padding-right: 16px; }
.rc-pack td, .rc-pack tbody th { vertical-align: baseline; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--paper-sunken); }
.rc-pack tbody th { text-align: left; font-weight: 500; font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--ink); }
.rc-pack tr[data-status="DEGRADED"] td:first-child { box-shadow: inset 3px 0 0 var(--accent-2); }
.rc-pack tr[data-status="MISSING"] > * { background: var(--bad-bg); }
.rc-pack .n { font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.rc-pack .item { font-size: 12px; font-weight: 500; }
.rc-status { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; }
.rc-status[data-s="COMPLETE"] { color: var(--good); }
.rc-status[data-s="DEGRADED"] { color: var(--accent-2); }
.rc-status[data-s="INPUT"] { color: var(--accent); }
.rc-status[data-s="MISSING"] { color: var(--bad); }
.rc-digest { display: block; font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-digest[data-absent] { color: var(--bad); }
.rc-digest[data-absent="declaration"] { color: var(--accent); }
.rc-src { font-family: var(--font-mono); font-size: 10px; }
.rc-src[data-unlinked] { color: var(--ink-faint); }
.rc-note { font-size: 10.5px; color: var(--ink-faint); line-height: 1.5; overflow-wrap: break-word; }
.rc-edit { border: 0; background: transparent; color: var(--accent); font-family: var(--font-mono); font-size: 9.5px; padding: 0; margin-left: 6px; cursor: pointer; }
.rc-edit:disabled { color: var(--ink-faint); cursor: not-allowed; }
.rc-decl td { background: var(--paper); }
.rc-decl textarea { width: 100%; min-height: 64px; resize: vertical; font-family: var(--font-body); font-size: 12px; line-height: 1.5; color: var(--ink);
  border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper-raised); padding: 6px 8px; box-sizing: border-box; }
.rc-decl textarea[aria-invalid="true"] { border-color: var(--bad); }
.rc-declbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 6px; font-size: 10.5px; color: var(--ink-faint); }
.rc-issue { color: var(--bad); font-size: 11px; }
.rc-packfoot { padding: 8px 16px; border-top: 1px solid var(--line-soft); background: var(--paper-sunken); font-size: 11px; color: var(--ink-soft); line-height: 1.55; }
.rc-lower { display: flex; flex-wrap: wrap; gap: 14px; align-items: stretch; }
.rc-yamlcard { flex: 1.25 1 440px; min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); box-shadow: var(--shadow-e1);
  overflow: hidden; display: flex; flex-direction: column; }
.rc-yamlhead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--line); }
.rc-copy { border: 0; background: transparent; color: var(--accent); font-family: var(--font-mono); font-size: 9.5px; padding: 0; cursor: pointer; }
.rc-yaml { flex: 1; padding: 10px 14px; background: var(--paper-raised); overflow-x: auto; margin: 0; }
.rc-yaml .line { display: flex; font-family: var(--font-mono); font-size: 10.5px; line-height: 1.75; white-space: nowrap; }
.rc-yaml .k { color: var(--ink-mute); width: 270px; flex: none; }
.rc-yaml .v[data-tone="ink"] { color: var(--ink); }
.rc-yaml .v[data-tone="gold"] { color: var(--accent-2); }
.rc-yaml .v[data-tone="red"] { color: var(--bad); }
.rc-yaml .v[data-tone="dim"] { color: var(--ink-mute); }
.rc-yaml .c { color: var(--ink-faint); padding-left: 1.5em; }
.rc-side { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.rc-seal { border: 1px solid var(--accent-2); border-radius: 8px; background: var(--paper-raised); box-shadow: inset 3px 0 0 var(--accent-2); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 8px; }
.rc-seal .rc-label { color: var(--accent-2); }
.rc-seal .txt { font-size: 11.5px; line-height: 1.6; }
.rc-sealbtn { border: 1px solid var(--accent-2); background: var(--accent-2); color: var(--accent-contrast); border-radius: 6px; font-family: var(--font-mono);
  font-size: 11px; font-weight: 600; letter-spacing: .03em; padding: 9px 14px; cursor: pointer; text-align: center; }
.rc-sealbtn[aria-disabled="true"] { border: 1px dashed var(--line-strong); background: var(--paper); color: var(--ink-faint); cursor: not-allowed; }
.rc-ghostbtn { border: 1px dashed var(--line-strong); background: var(--paper); color: var(--ink-faint); border-radius: 6px; font-family: var(--font-mono);
  font-size: 11px; font-weight: 600; padding: 9px 14px; cursor: not-allowed; text-align: center; }
.rc-smallbtn { border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink); border-radius: 6px; font-family: var(--font-mono); font-size: 10.5px;
  padding: 4px 10px; cursor: pointer; }
.rc-smallbtn:disabled { color: var(--ink-faint); cursor: not-allowed; }
.rc-smallbtn[data-primary] { border-color: var(--accent-2); background: var(--accent-2); color: var(--accent-contrast); }
.rc-confirm { border: 1px solid var(--accent-2); border-radius: 6px; background: var(--paper-raised); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; font-size: 11.5px; line-height: 1.55; }
.rc-sealed { border: 1px solid var(--good); border-radius: 8px; background: var(--paper-raised); box-shadow: inset 3px 0 0 var(--good); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.rc-sealed .rc-label { color: var(--good); }
.rc-sealed .id { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--good); overflow-wrap: anywhere; }
.rc-life { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; border: 1px solid var(--line-strong); border-radius: 3px; padding: 1px 6px; color: var(--ink-soft); background: var(--paper-raised); }
.rc-publish { border: 1px dashed var(--line-strong); border-radius: 8px; background: var(--paper); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.rc-mirror { display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--line-strong); border-radius: 8px; background: var(--paper); padding: 14px 16px; }
/* D-08: the hi-fi fades the ghost with opacity .75, which drops its text below AA; the dashed frame and faint ink carry "ghost" instead. */
.rc-mirror .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); padding: 8px 12px; }
.rc-mirror .gate { font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--accent); border: 1px solid var(--accent); border-radius: 3px; padding: 1px 6px; flex: none; }
.rc-mirror .meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 10px; color: var(--ink-faint); }
.rc-sealedpack { border: 1px solid var(--good); border-radius: 8px; background: var(--paper-raised); padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rc-sealedpack dl { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 11px; }
.rc-sealedpack dt { color: var(--ink-faint); font-family: var(--font-mono); font-size: 10px; }
.rc-sealedpack dd { margin: 0; font-family: var(--font-mono); font-size: 10.5px; overflow-wrap: anywhere; word-break: break-all; }
.rc-sealedpack .decl { white-space: pre-wrap; font-family: var(--font-body); font-size: 11.5px; word-break: normal; }
.rc-rules { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.rc-rules .t { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); }
.rc-rules .b { font-size: 11px; color: var(--ink-soft); line-height: 1.6; }
.rc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .rc-verdict { border-left: 0; padding-left: 0; border-top: 1px solid var(--line-soft); padding-top: 8px; }
  .rc-tax .what { width: 140px; }
  .rc-tax .state { width: 84px; }
  .rc-yaml .k { width: 230px; }
}
`;

/* ------------------------------------------------------------ small parts */

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

/** The domain chip: the server's `state`, plus the local-seal fact beside it — never `PUBLISHED`. */
function StateChips({ compose }: { compose: RcCompose }) {
  const unbound = compose.run.binding === null;
  return (
    <>
      <span className="rc-state" data-s={unbound ? "NOT_PUBLISHABLE" : compose.state} data-rc-state={unbound ? "NOT_PUBLISHABLE" : compose.state}>
        {unbound ? "NOT_PUBLISHABLE" : compose.state}
      </span>
      {compose.local_seal.state === "SEALED_LOCAL" ? (
        <span className="rc-state" data-s="SEALED_LOCAL" data-rc-seal-state="SEALED_LOCAL" title="an immutable Portal-local pack exists — not delivered, not approved">
          SEALED_LOCAL
        </span>
      ) : null}
    </>
  );
}

function Header({ runId, compose }: { runId: string; compose: RcCompose | null }) {
  const run = encodeURIComponent(runId);
  return (
    <header className="rc-head" data-panel="header">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <nav className="crumbs" aria-label="breadcrumb">
          <Link to={`/research/quantbt/runs/${run}/evidence#stage=claim`} data-action="back-to-hub">
            Evidence Flow
          </Link>
          <span className="rc-faint">/</span>
          <span className="rc-mono rc-long">{runId}</span>
          <span className="rc-faint">/</span>
          <span style={{ color: "var(--ink)" }}>Release Candidate &amp; Publish</span>
        </nav>
        <h1 className="title">{RC_TITLE}</h1>
        <p className="sub">{RC_SUBTITLE}</p>
        <p className="p21" data-p21-boundary>
          {RC_P21_NOTE}
        </p>
      </div>
      <div className="right">
        {compose ? <StateChips compose={compose} /> : null}
        <Link className="rc-btnlink" to={`/research/quantbt/runs/${run}/report`} data-action="run-report">
          run report
        </Link>
      </div>
    </header>
  );
}

function NotPublishableBanner() {
  return (
    <div className="rc-banner" role="note" data-banner="NOT_PUBLISHABLE">
      <span className="badge">NOT_PUBLISHABLE</span>
      <span className="txt">
        {NOT_PUBLISHABLE_TEXT_BEFORE}
        <span className="rc-mono">alpha_version</span>
        {NOT_PUBLISHABLE_TEXT_AFTER}
        <Link to="/research/quantbt/runs/new" data-action="new-run">
          New Run
        </Link>{" "}
        and re-run to seal a candidate.
      </span>
    </div>
  );
}

const RAIL_LABEL: Record<RcCompose["rail"][number]["key"], string> = {
  alpha: "alpha",
  alpha_version: "alpha_version",
  run: "run / attempt",
  selected_params: "selected params",
  release_candidate: "release candidate",
};

function Rail({ compose }: { compose: RcCompose }) {
  return (
    <div className="rc-rail" data-rail>
      {compose.rail.map((node, index) => {
        const route = railRoute(node, compose);
        const body = (
          <>
            <span className="k">{RAIL_LABEL[node.key]}</span>
            <span className="v">{node.value}</span>
            {node.detail !== null ? <span className="sub">{node.detail}</span> : null}
          </>
        );
        const title = `${RAIL_LABEL[node.key]} — ${node.value}${node.detail ? ` · ${node.detail}` : ""}`;
        return (
          <div className="rc-railitem" key={node.key}>
            {route ? (
              <Link className="rc-node" to={route} data-rail-key={node.key} data-tone={node.tone} title={title}>
                {body}
              </Link>
            ) : (
              <div className="rc-node" data-rail-key={node.key} data-tone={node.tone} title={title}>
                {body}
              </div>
            )}
            {index < compose.rail.length - 1 ? (
              <span className="rc-arrow" aria-hidden="true">
                →
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Identity({ compose }: { compose: RcCompose }) {
  const comparison = compose.published_comparison;
  return (
    <section className="rc-card" data-panel="identity" aria-label="identity and lineage">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="rc-label">{IDENTITY_LABEL}</span>
        <span className="rc-mono rc-faint" style={{ fontSize: 9.5 }}>
          {IDENTITY_NOTE}
        </span>
      </div>
      <Rail compose={compose} />
      <div className="rc-split">
        <div className="rc-tax" data-taxonomy>
          <span className="rc-label" data-last-rc={comparison.last_release_candidate_id ?? ""}>
            change taxonomy vs last published rc —{" "}
            {comparison.last_release_candidate_id ?? "none published"}
          </span>
          <Reason code={comparison.availability.reason_code} what="published_comparison" />
          <div className="hdr" aria-hidden="true">
            <span className="what">what</span>
            <span className="state">state</span>
            <span className="cons">consequence (§3.4)</span>
          </div>
          {compose.taxonomy.map((row) => (
            <div className="row" key={row.what} data-taxonomy-row data-taxonomy-state={row.state}>
              <span className="what">{row.what}</span>
              <span className="state" data-s={row.state}>
                {row.state}
              </span>
              <span className="cons">{row.consequence}</span>
            </div>
          ))}
        </div>
        <div className="rc-verdict" data-gate-verdict>
          <span className="rc-label">gate verdict for this candidate</span>
          <span className="t">{compose.gate_verdict.title}</span>
          <span className="b">{compose.gate_verdict.body}</span>
          <Reason code={compose.actions.seal_blocked_reason} what="seal" />
        </div>
      </div>
    </section>
  );
}

function CertChip({ axis, kind }: { axis: RcCertificationAxis; kind: "claim" | "engine" }) {
  const className = kind === "claim" ? "rc-ceiling" : "rc-engcert";
  const title = kind === "claim" ? CLAIM_CHIP_TITLE : ENGINE_CHIP_TITLE;
  const name = kind === "claim" ? "claim ceiling" : "engine cert";
  if (axis.value !== null) {
    return (
      <span className={className} title={title} data-cert-axis={kind === "claim" ? "methodology_claim" : "engine_execution_contract"} data-cert-value={axis.value}>
        {name} {axis.value}
      </span>
    );
  }
  const reason = axis.availability.reason_code;
  return (
    <span
      className={className}
      data-ghost
      title={`${title} — ${rcReasonSentence(reason) ?? "not published"}${reason ? ` (${reason})` : ""}`}
      data-cert-axis={kind === "claim" ? "methodology_claim" : "engine_execution_contract"}
      data-reason-code={reason ?? ""}
    >
      {name} — not published
    </span>
  );
}

function DigestCell({ item, declaration }: { item: RcPackItem; declaration: DeclarationKey | undefined }) {
  if (item.digest !== null) {
    return (
      <span className="rc-digest" title={`sha256:${item.digest}`} data-digest={item.digest}>
        sha256:{item.digest}
      </span>
    );
  }
  const code = item.availability.reason_code;
  return (
    <span className="rc-digest" data-absent={declaration ? "declaration" : "evidence"} title={code ?? item.availability.state} data-reason-code={code ?? ""}>
      {declaration ? "— not declared" : `— ${code ?? item.availability.state}`}
    </span>
  );
}

interface DeclarationProps {
  controller: ReleaseCandidateController;
  editable: boolean;
  lockedReason: string | null;
}

function DeclarationEditor({ field, controller, onClose }: { field: DeclarationKey; controller: ReleaseCandidateController; onClose: () => void }) {
  const id = useId();
  const value = controller.values[field];
  const issues = controller.issues.filter((issue) => issue.path === field || issue.path === "(body)");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div data-declaration-editor={field}>
      <label className="rc-sr" htmlFor={id}>
        {field}
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        maxLength={DECLARATION_MAX + 200}
        aria-invalid={issues.length > 0 || undefined}
        aria-describedby={`${id}-help`}
        onChange={(event) => controller.setValue(field, event.target.value)}
        data-declaration-input={field}
      />
      <div className="rc-declbar" id={`${id}-help`}>
        <span className="rc-mono">
          {value.length.toLocaleString("en-US")} / {DECLARATION_MAX.toLocaleString("en-US")}
        </span>
        {controller.dirty[field] ? <span data-unsaved={field}>unsaved — not part of any pack yet</span> : <span>saved in the draft</span>}
        {issues.map((issue) => (
          <span className="rc-issue" key={`${issue.path}:${issue.message}`} data-issue-path={issue.path} role="alert">
            <span className="rc-mono">{issue.path}</span> — {issue.message}
          </span>
        ))}
        <span className="ml-auto inline-flex gap-2">
          {controller.dirty[field] ? (
            <button type="button" className="rc-smallbtn" onClick={() => controller.discard(field)} data-action="discard-declaration">
              discard
            </button>
          ) : null}
          <button type="button" className="rc-smallbtn" onClick={onClose} data-action="close-declaration">
            close
          </button>
        </span>
      </div>
    </div>
  );
}

function EvidencePack({ compose, controller, editable, lockedReason }: { compose: RcCompose } & DeclarationProps) {
  const [open, setOpen] = useState<DeclarationKey | null>(null);
  const counts = compose.pack_counts;
  const anyDirty = controller.dirty.known_limitations || controller.dirty.proposed_use_restrictions;
  return (
    <section className="rc-packcard" data-panel="evidence-pack" aria-label="evidence pack">
      <div className="rc-packhead">
        <span className="rc-label">{PACK_LABEL}</span>
        <span className="rc-chips">
          <CertChip axis={compose.certification_axes.methodology_claim} kind="claim" />
          <CertChip axis={compose.certification_axes.engine_execution_contract} kind="engine" />
          <span className="rc-count" data-pack-counts={`${counts.complete}/${counts.degraded}/${counts.input}/${counts.missing}`}>
            {counts.complete} COMPLETE · {counts.degraded} DEGRADED · {counts.input} INPUT · {counts.missing} MISSING
          </span>
        </span>
      </div>
      <div className="rc-pack" tabIndex={0} role="region" aria-label="evidence pack rows (scrolls sideways)">
        <table>
          <colgroup>
            <col style={{ width: 42 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 250 }} />
            <col style={{ width: 130 }} />
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
            {compose.pack.map((item) => {
              const declaration = DECLARATION_OF_ROW[item.key];
              const route = packSourceRoute(item, compose.run_id, compose.run.binding?.alpha_id ?? null);
              return [
                <tr key={item.key} data-pack-row={item.key} data-status={item.status}>
                  <td className="n">{item.n}</td>
                  <th scope="row" className="item">
                    {item.item}
                  </th>
                  <td>
                    <span className="rc-status" data-s={item.status} title={STATUS_TITLE[item.status]}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ maxWidth: 250 }}>
                    <DigestCell item={item} declaration={declaration} />
                  </td>
                  <td>
                    {route ? (
                      <Link className="rc-src" to={route} data-source-link={item.key}>
                        {item.source.label}
                      </Link>
                    ) : (
                      <span
                        className="rc-src"
                        data-unlinked
                        title={
                          item.key === "ALPHA_VERSION_PASSPORT"
                            ? "opens the portal's Alpha 360° passport — outside this build"
                            : declaration
                              ? "your own declaration — edited on this row"
                              : "no source screen was named for this row"
                        }
                      >
                        {item.source.label}
                      </span>
                    )}
                    {declaration ? (
                      <button
                        type="button"
                        className="rc-edit"
                        disabled={!editable}
                        aria-expanded={open === declaration}
                        title={editable ? `edit ${declaration}` : lockedReason ?? undefined}
                        onClick={() => setOpen(open === declaration ? null : declaration)}
                        data-action="edit-declaration"
                        data-declaration={declaration}
                      >
                        {open === declaration ? "editing" : "edit"}
                      </button>
                    ) : null}
                  </td>
                  <td className="rc-note">
                    {item.note}
                    {item.status === "MISSING" || item.status === "DEGRADED" ? (
                      <>
                        {" "}
                        <Reason code={item.availability.reason_code} what={item.key} />
                      </>
                    ) : null}
                  </td>
                </tr>,
                declaration && open === declaration && editable ? (
                  <tr key={`${item.key}-editor`} className="rc-decl">
                    <td />
                    <td colSpan={5}>
                      <DeclarationEditor field={declaration} controller={controller} onClose={() => setOpen(null)} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      <DeclarationsBar compose={compose} controller={controller} editable={editable} lockedReason={lockedReason} anyDirty={anyDirty} />
      <div className="rc-packfoot">{PACK_FOOTER}</div>
    </section>
  );
}

function DeclarationsBar({
  compose,
  controller,
  editable,
  lockedReason,
  anyDirty,
}: { compose: RcCompose; anyDirty: boolean } & DeclarationProps) {
  const draft = compose.draft;
  const fenceMoved = draft.state === "PERSISTED" && draft.source_fingerprint !== compose.source_fingerprint;
  const bodyIssues = controller.issues.filter((issue) => issue.path === "(body)");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2" style={{ borderTop: "1px solid var(--line-soft)", fontSize: 11 }} data-declarations-bar data-draft-state={draft.state}>
      <span className="rc-label">declarations</span>
      <span className="rc-mono rc-soft" data-draft-revision={draft.revision}>
        draft {draft.state === "VIRTUAL" ? "not saved yet" : `revision ${draft.revision}`}
        {draft.updated_at_utc_ms !== null ? ` · saved ${formatUtc(draft.updated_at_utc_ms)}` : ""}
      </span>
      {fenceMoved ? (
        <span className="rc-soft" data-fence-moved>
          saved against an earlier source fingerprint — save again to fence it to the current evidence
        </span>
      ) : null}
      {bodyIssues.map((issue) => (
        <span className="rc-issue" key={issue.message} data-issue-path={issue.path} role="alert">
          {issue.message}
        </span>
      ))}
      <span className="ml-auto inline-flex items-center gap-2">
        {!editable && lockedReason ? <span className="rc-faint">{lockedReason}</span> : null}
        <button
          type="button"
          className="rc-smallbtn"
          data-primary={anyDirty || fenceMoved || undefined}
          disabled={!editable || controller.saving || (!anyDirty && !fenceMoved)}
          onClick={controller.save}
          data-action="save-declarations"
        >
          {controller.saving ? "saving…" : "save declarations"}
        </button>
      </span>
    </div>
  );
}

function Yaml({ fields }: { fields: readonly RcField[] }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    const text = yamlText(fields);
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) {
      setCopied("failed");
      return;
    }
    clipboard.writeText(text).then(
      () => setCopied("copied"),
      () => setCopied("failed"),
    );
  };
  return (
    <section className="rc-yamlcard" data-panel="record-preview" aria-label="record preview">
      <div className="rc-yamlhead">
        <span className="rc-label">{YAML_LABEL}</span>
        <button type="button" className="rc-copy" onClick={copy} data-action="copy-yaml" aria-live="polite">
          {copied === "copied" ? "✓ copied" : copied === "failed" ? "copy unavailable — select the lines" : "copy yaml"}
        </button>
      </div>
      <pre className="rc-yaml" tabIndex={0} aria-label={`${fields.length} record lines`} data-yaml-lines={fields.length}>
        {fields.map((field) => (
          <span className="line" key={field.key} data-yaml-key={field.key} data-yaml-value={field.value ?? ""} title={field.label}>
            <span className="k">{field.key}</span>
            <span className="v" data-tone={field.tone}>
              {field.value ?? "null"}
            </span>
            {field.value === null && field.availability.reason_code ? (
              <span className="c" aria-label={`reason ${field.availability.reason_code}`}>
                # {field.availability.reason_code}
              </span>
            ) : null}
            <span className="rc-sr">{"\n"}</span>
          </span>
        ))}
      </pre>
      <span className="rc-sr" data-yaml-text>
        {fields.map(yamlLine).join("\n")}
      </span>
    </section>
  );
}

/** Why the seal button is not offered right now, first reason first. The server's reason is authoritative. */
function sealBlock(compose: RcCompose, controller: ReleaseCandidateController): { code: string | null; text: string } | null {
  if (controller.writesLocked) return { code: null, text: DENIED_COPY };
  if (!compose.actions.may_seal) {
    const code = compose.actions.seal_blocked_reason;
    return { code, text: rcReasonSentence(code) ?? "The server does not allow a local seal of this composition." };
  }
  if (controller.dirty.known_limitations || controller.dirty.proposed_use_restrictions) {
    return { code: null, text: "save your declarations first — the seal fences the saved draft revision" };
  }
  if (compose.draft.draft_id === null) return { code: null, text: "save your declarations first — no draft is stored yet" };
  if (controller.saving) return { code: null, text: "saving the draft…" };
  return null;
}

function SealCard({ compose, controller }: { compose: RcCompose; controller: ReleaseCandidateController }) {
  const [confirming, setConfirming] = useState(false);
  const reasonId = useId();
  const block = sealBlock(compose, controller);
  const disabled = block !== null || controller.sealing;
  useEffect(() => {
    if (disabled) setConfirming(false);
  }, [disabled]);
  return (
    <section className="rc-seal" data-panel="local-seal" aria-label="local seal">
      <span className="rc-label">{SEAL_LABEL}</span>
      <span className="txt">{SEAL_TEXT}</span>
      {confirming && !disabled ? (
        <div className="rc-confirm" role="alertdialog" aria-label="confirm local seal" data-seal-confirm>
          <span>{SEAL_CONFIRM}</span>
          <span className="rc-mono rc-soft rc-long" style={{ fontSize: 10 }}>
            draft revision {compose.draft.revision} · source {compose.source_fingerprint}
          </span>
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rc-smallbtn"
              data-primary
              onClick={() => {
                setConfirming(false);
                controller.seal();
              }}
              data-action="confirm-local-seal"
            >
              Confirm local seal
            </button>
            <button type="button" className="rc-smallbtn" onClick={() => setConfirming(false)} data-action="cancel-local-seal">
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="rc-sealbtn"
          aria-disabled={disabled || undefined}
          aria-describedby={block ? reasonId : undefined}
          onClick={() => {
            if (!disabled) setConfirming(true);
          }}
          data-action="local-seal"
          data-seal-enabled={!disabled}
        >
          {controller.sealing ? "sealing…" : SEAL_BUTTON}
        </button>
      )}
      {block ? (
        <span id={reasonId} className="rc-reason" data-seal-blocked={block.code ?? "LOCAL"} style={{ fontSize: 10.5 }}>
          {block.text}
          {block.code && rcReasonSentence(block.code) !== block.text ? "" : ""}
          {block.code ? ` · ${block.code}` : ""}
        </span>
      ) : null}
    </section>
  );
}

function SealedCard({ compose, controller }: { compose: RcCompose; controller: ReleaseCandidateController }) {
  const seal = compose.local_seal;
  const id = seal.release_candidate_id;
  if (seal.state !== "SEALED_LOCAL" || id === null) return null;
  const outcome = controller.sealOutcome;
  const replayed = outcome !== null && outcome.response.release_candidate_id === id && outcome.replayed;
  const open = controller.packRead.state !== "idle" && controller.packRead.id === id;
  return (
    <section className="rc-sealed" data-panel="sealed" data-sealed={id} aria-label="sealed locally">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="rc-label">sealed locally — immutable</span>
        <span className="flex flex-wrap gap-1.5">
          <span className="rc-life" data-delivery-state={seal.delivery_state ?? ""}>
            {seal.delivery_state ?? "delivery not published"}
          </span>
          <span className="rc-life" data-approval-state={seal.approval_state ?? ""}>
            {seal.approval_state ?? "approval not published"}
          </span>
        </span>
      </div>
      <span className="id">{id}</span>
      <span className="rc-soft" style={{ fontSize: 11, lineHeight: 1.55 }}>
        sealed_at {formatUtc(seal.sealed_at_utc_ms) ?? "not published"} · pack digest{" "}
        <span className="rc-mono rc-long">{seal.pack_digest ? `sha256:${seal.pack_digest}` : "not published"}</span>. {SEALED_NOTE}
      </span>
      {replayed ? (
        <span className="rc-soft" style={{ fontSize: 11 }} data-seal-replayed>
          The server returned this same pack for the same draft and evidence — a replay, not a second candidate.
        </span>
      ) : null}
      {seal.availability.state !== "AVAILABLE" ? <Reason code={seal.availability.reason_code} what="local_seal" /> : null}
      <span>
        <button
          type="button"
          className="rc-smallbtn"
          aria-expanded={open}
          onClick={() => controller.openPack(id)}
          data-action="open-sealed-pack"
        >
          {open ? "read the sealed pack again" : "open the sealed pack"}
        </button>
      </span>
    </section>
  );
}

function SealedPack({ controller }: { controller: ReleaseCandidateController }) {
  const read = controller.packRead;
  if (read.state === "idle") return null;
  if (read.state === "loading") {
    return <ResearchPanel title="sealed pack" state={{ state: "loading", reason: "Loading.", mayRetry: false, retainsContent: false }} minBodyHeight={80} />;
  }
  if (read.state === "refused") {
    return (
      <ResearchPanel
        title="sealed pack"
        state={{ state: read.refusal.state, reason: read.refusal.message, detail: [read.refusal.code, read.refusal.requestId ? `request_id ${read.refusal.requestId}` : null].filter(Boolean).join(" · ") || null, mayRetry: read.refusal.mayRetry, retainsContent: false }}
        minBodyHeight={40}
        recovery={
          <button type="button" className="rc-smallbtn" onClick={() => controller.openPack(read.id)} data-action="retry-pack">
            read again
          </button>
        }
      />
    );
  }
  return <SealedPackView pack={read.pack} />;
}

function SealedPackView({ pack }: { pack: RcPack }) {
  const core = pack.frozen_core;
  return (
    <section className="rc-sealedpack" data-panel="sealed-pack" data-sealed-pack={pack.release_candidate_id} aria-label="sealed pack">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="rc-label" style={{ color: "var(--good)" }}>
          sealed pack · {pack.release_candidate_id}
        </span>
        <span className="rc-mono rc-faint" style={{ fontSize: 9.5 }}>
          read-only · {pack.read_authority}
        </span>
      </div>
      <dl>
        <dt>run</dt>
        <dd>{pack.run_id}</dd>
        <dt>pack digest</dt>
        <dd data-pack-digest={pack.pack_digest}>sha256:{pack.pack_digest}</dd>
        <dt>sealed at</dt>
        <dd>{formatUtc(pack.sealed_at_utc_ms) ?? "not published"}</dd>
        <dt>source fingerprint</dt>
        <dd>{core.source_fingerprint}</dd>
        <dt>delivery · approval</dt>
        <dd>
          {pack.delivery.delivery_state ?? "not published"} · {pack.delivery.approval_state ?? "not published"}
        </dd>
      </dl>
      <span className="rc-label">frozen fields ({core.fields.length})</span>
      <dl data-frozen-fields={core.fields.length}>
        {core.fields.map((field) => [
          <dt key={`${field.key}-k`}>{field.key}</dt>,
          <dd key={`${field.key}-v`} data-frozen-field={field.key}>
            {field.value ?? `null # ${field.availability.reason_code ?? field.availability.state}`}
          </dd>,
        ])}
      </dl>
      <span className="rc-label">frozen evidence rows ({core.pack.length})</span>
      <dl data-frozen-rows={core.pack.length}>
        {core.pack.map((item) => [
          <dt key={`${item.key}-k`}>
            {item.n} · {item.item}
          </dt>,
          <dd key={`${item.key}-v`} data-frozen-row={item.key} data-status={item.status}>
            {item.status}
            {item.digest ? ` · sha256:${item.digest}` : ""}
          </dd>,
        ])}
      </dl>
      <span className="rc-label">signed declarations</span>
      <dl>
        <dt>known_limitations</dt>
        <dd className="decl" data-frozen-declaration="known_limitations">
          {core.draft.known_limitations}
        </dd>
        <dt>proposed_use_restrictions</dt>
        <dd className="decl" data-frozen-declaration="proposed_use_restrictions">
          {core.draft.proposed_use_restrictions}
        </dd>
      </dl>
    </section>
  );
}

function PublishGhost({ gate }: { gate: RcPublishGate }) {
  const reasonId = useId();
  return (
    <section className="rc-publish" data-panel="publish" data-publish-ghost data-blocked-reason={gate.blocked_reason ?? ""} aria-label="publish">
      <span className="rc-label">{PUBLISH_LABEL}</span>
      <span style={{ fontSize: 11.5, lineHeight: 1.6 }} className="rc-soft">
        {PUBLISH_TEXT}
      </span>
      <button type="button" className="rc-ghostbtn" aria-disabled="true" aria-describedby={reasonId} data-action="publish" onClick={(event) => event.preventDefault()}>
        {PUBLISH_BUTTON}
      </button>
      <span id={reasonId}>
        <Reason code={gate.blocked_reason} what="publish" />
      </span>
      <span className="rc-faint" style={{ fontSize: 10, lineHeight: 1.5 }}>
        {SOD_NOTE}
      </span>
    </section>
  );
}

/** Read-model ghost, no interactive element (spec 11 checklist 3). */
function MirrorGhost({ compose }: { compose: RcCompose }) {
  const absence = compose.source_absences.approval_mirror;
  return (
    <section className="rc-mirror" data-panel="mirror" data-mirror-ghost aria-label="approval inbox mirror (not published)">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="rc-label">{MIRROR_LABEL}</span>
        <span className="rc-mono rc-faint" style={{ fontSize: 9 }}>
          {MIRROR_NOTE_RIGHT}
        </span>
      </div>
      <div className="row">
        <span className="gate">R1 · RESEARCH EVIDENCE</span>
        <span className="rc-mono" style={{ fontSize: 10.5, flex: "1 1 170px", minWidth: 0 }}>
          {MIRROR_SUBJECT}
        </span>
        <span className="rc-mono rc-faint" style={{ fontSize: 10 }}>
          —
        </span>
        <span className="rc-mono rc-faint" style={{ fontSize: 9.5 }}>
          {MIRROR_SLA}
        </span>
      </div>
      <div className="meta">
        <span>assignee pool: Quant Reviewers</span>
        <span>·</span>
        <span>conditions: —</span>
        <span>·</span>
        <span>{MIRROR_OUTCOMES}</span>
      </div>
      <span className="rc-soft" style={{ fontSize: 10.5, lineHeight: 1.55 }}>
        {MIRROR_GHOST_NOTE}
      </span>
      {absence ? <Reason code={absence.reason_code} what="approval_mirror" /> : null}
    </section>
  );
}

/* ------------------------------------------------------- write outcomes */

function MutationNotice({ controller }: { controller: ReleaseCandidateController }) {
  const { mutation, conflict } = controller;
  if (conflict) {
    return (
      <div className="rc-alert" role="alert" data-mutation-state="conflict">
        <strong className="rc-mono" style={{ color: "var(--bad)", fontSize: 11 }}>
          409
        </strong>
        <span style={{ flex: "1 1 240px" }}>
          {CONFLICT_COPY}. The composition was read again; your unsaved text is kept in its row.
        </span>
        {mutation ? <span className="rc-reason">{[mutation.refusal.code, mutation.refusal.requestId ? `request_id ${mutation.refusal.requestId}` : null].filter(Boolean).join(" · ")}</span> : null}
        <button type="button" className="rc-smallbtn" onClick={controller.dismissConflict} data-action="dismiss-conflict">
          reviewed
        </button>
      </div>
    );
  }
  if (!mutation) return null;
  const { lane, refusal } = mutation;
  const verb = lane === "draft" ? "save" : "local seal";
  const text =
    refusal.state === "denied"
      ? DENIED_COPY
      : refusal.state === "unavailable" || refusal.state === "failed-retryable"
        ? UNAVAILABLE_COPY
        : `The server refused this ${verb}. Nothing was ${lane === "draft" ? "saved" : "sealed"}; your text is kept.`;
  return (
    <div className="rc-alert" data-tone={refusal.state === "unavailable" || refusal.state === "failed-retryable" ? "neutral" : undefined} role="alert" data-mutation-state={refusal.state} data-mutation-lane={lane}>
      <strong className="rc-mono" style={{ fontSize: 11 }}>
        {refusal.state}
      </strong>
      <span style={{ flex: "1 1 240px" }}>{text}</span>
      <span className="rc-reason">{[refusal.code, refusal.requestId ? `request_id ${refusal.requestId}` : null].filter(Boolean).join(" · ")}</span>
      {refusal.sessionExpired ? (
        <Link to="/login" data-action="reauthenticate" aria-label="sign in again">
          sign in again
        </Link>
      ) : null}
      {refusal.state === "unavailable" || refusal.state === "failed-retryable" ? (
        <button type="button" className="rc-smallbtn" onClick={lane === "draft" ? controller.save : controller.retry} data-action="retry-mutation">
          {lane === "draft" ? "try the save again" : "read the composition again"}
        </button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

export interface ReleaseCandidateScreenProps {
  runId: string;
  controller: ReleaseCandidateController;
}

function Frame({ runId, compose, children }: { runId: string; compose: RcCompose | null; children: ReactNode }) {
  return (
    <div className="rc-page" data-screen="release-candidate" data-run={runId} data-compose-state={compose ? compose.local_seal.state : "none"}>
      <style>{RC_CSS}</style>
      <Header runId={runId} compose={compose} />
      {children}
    </div>
  );
}

export function ReleaseCandidateScreen({ runId, controller }: ReleaseCandidateScreenProps) {
  const { compose, state } = controller;

  if (!compose) {
    const notFound = controller.composeRefusal?.notFound ?? false;
    return (
      <Frame runId={runId} compose={null}>
        <div data-rc-state-panel={state.state}>
          <ResearchPanel
            title="release candidate"
            state={state}
            minBodyHeight={160}
            recovery={
              <button type="button" className="rc-smallbtn" onClick={controller.retry} data-action="retry">
                read again
              </button>
            }
          />
        </div>
        {notFound ? (
          <p className="rc-soft" style={{ fontSize: 12 }}>
            <Link to="/research/quantbt/runs" data-action="run-library">
              ← Run Library
            </Link>
          </p>
        ) : null}
      </Frame>
    );
  }

  const editable = compose.actions.may_edit_draft && !controller.writesLocked && !controller.sealing;
  const lockedReason = controller.writesLocked ? DENIED_COPY : !compose.actions.may_edit_draft ? "the server does not allow editing this draft" : null;
  const gate: RcPublishGate = compose.actions.publish;

  return (
    <Frame runId={runId} compose={compose}>
      {compose.run.binding === null ? <NotPublishableBanner /> : null}
      {state.state !== "available" ? (
        <div data-rc-state-panel={state.state}>
          <ResearchPanel
            title="release candidate composition"
            meta={`as of ${formatUtc(compose.as_of_utc_ms) ?? "—"}`}
            state={state}
            minBodyHeight={0}
            recovery={
              <button type="button" className="rc-smallbtn" onClick={controller.retry} data-action="retry">
                read again
              </button>
            }
          />
        </div>
      ) : null}
      <MutationNotice controller={controller} />
      <Identity compose={compose} />
      <EvidencePack compose={compose} controller={controller} editable={editable} lockedReason={lockedReason} />
      <div className="rc-lower">
        <Yaml fields={compose.yaml} />
        <div className="rc-side">
          {compose.local_seal.state === "SEALED_LOCAL" ? <SealedCard compose={compose} controller={controller} /> : null}
          <SealCard compose={compose} controller={controller} />
          <PublishGhost gate={gate} />
          <MirrorGhost compose={compose} />
        </div>
      </div>
      <SealedPack controller={controller} />
      <div className="rc-rules" data-rules>
        <span className="t">rules of this screen</span>
        <span className="b">{RULES_FOOTER}</span>
        <span className="rc-mono rc-faint" style={{ fontSize: 9.5 }} data-as-of={compose.as_of_utc_ms}>
          composed as of {formatUtc(compose.as_of_utc_ms) ?? "—"} · {compose.read_authority} · source {compose.source_fingerprint}
        </span>
      </div>
    </Frame>
  );
}
