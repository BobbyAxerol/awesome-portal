/**
 * Screen 07 — S3 Freeze / integrity / what-if (P16 + RS-02).
 *
 * The hi-fi promises a chain: three digests link, an ordering verdict passes,
 * a what-if grid re-scores the neighbourhood. What the source publishes is
 * narrower and the screen says so in the same breath as every green mark:
 *
 *  - a **match is only as wide as its scope**. The verify answer states it —
 *    retained bindings, and (A10a) the sealed P05 bytes when a durable
 *    receipt says they re-hash to the seal. The screen never prints "chain
 *    intact" and never lets `PARTIAL` read as whole.
 *  - **`BLOCKED` empties the table on purpose.** A binding mismatch or a
 *    corrupt/missing byte receipt BLOCKS — it never warns — and a frozen
 *    table filled from anywhere else would not be this run's.
 *  - **what-if is a fork, not an edit** (A10c). Sliders move over the
 *    server's nine nodes only; a missing cell is a word, never 0; the one
 *    diagnostic job starts from "evaluate grid" and nothing else; "create
 *    sibling attempt" opens Screen 02 with a copied draft. A fixed run keeps
 *    the card with every control disabled and the server's reason (A11).
 *
 * Two POSTs exist on this screen — verify and evaluate grid — and each fires
 * from its own click with the same-origin CSRF proof. Nothing on mount, no
 * fold change, no slider move and no re-render ever sends either.
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";

import { LineageLink, lineageHref } from "./LineageLink";

import { BoundWarningNote } from "./BoundWarning";
import { isWhatIf, WhatIfCard } from "./WhatIfCard";
import { CopyThetaDigest, ServedStage4Binding } from "./Stage4Binding";
import { DigestChain, hubDigestChain, retainedDigestChain, verifyChainLabel } from "./DigestChain";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import { CURRENT_SOURCE_LANE_COPY } from "./researchRefusal";
import {
  BLOCKED_NOTE,
  BYTE_STATE_WORDS,
  bytesBlock,
  type ArtifactBytes,
  type WhatIfEvaluateSlot,
  FREEZE_GAP_WORDS,
  FREEZE_WITHHELD_WORDS,
  INTEGRITY_KEYS,
  PARTIAL_SCOPE_NOTE,
  freezeGapReason,
  type CurrentSourceFreeze,
  type FreezeAvailability,
  type FreezeDetail as FreezeDetailDocument,
  type FreezeSourceGap,
  type FreezeWindow,
  type FrozenParameter,
  type Integrity,
  type IntegrityCheck,
} from "./freezeClient";
import { HAIRLINE_PERCENT, placeInTimeline } from "./splitClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import { hubDelegates, readsRetainedLane, type RetainedSlot, type VerifySlot } from "./useFreeze";
import type { ResearchState } from "./state";
import { reasonCodeSentence } from "./researchRefusal";
import { claimToken, foldLabel, formatMetric, formatUtc, shortDigest, shortId } from "./researchFormat";
import type { FoldOrdering, FoldOrderingRow } from "./freezeClient";
import { ChildAuditCompanionPanel } from "./ChildAuditCompanionPanel";
import { FoldSelectionPanel } from "./FoldSelectionPanel";
import { OrchestrationClocks } from "./OrchestrationClocks";
import {
  protocolLabel,
  retainedReadiness,
  walkForwardOf,
  type RunIdentity,
  type RunIdentitySlot,
} from "./retainedLane";
import type { ProgressRead } from "./progressClient";
import { ShortId } from "./ShortId";
import { ImportedAlphaLine } from "./ImportedAlphaLine";
import { CopyEvidenceLink, SCREEN_FRAME, StageRunBar } from "./SplitDetail";
import { trialLabel, trialTitle } from "./trialLabel";

/* --------------------------------------------------------------- verbatim */

/*
 * VD-TEXT-01 (Bobby, 2026-10-01): the header subtitle, the "rules of this
 * screen" footer and the two-clocks sentence are gone. The scope each match
 * carries is printed beside the match itself; the longer rule text lives in
 * a `title` where a control or label still needs it.
 */

/** Hover text for the retained-custody scope line (the line itself is one short clause). */
const RETAINED_SCOPE_TITLE =
  "A match here means the retained manifest, its row counts and its batch receipt agree with what Portal imported. It is not a check of artifact bytes, of causal order, of a selection, or of anything a broker saw.";

const CHECK_LABEL: Record<(typeof INTEGRITY_KEYS)[number], string> = {
  P04_ADAPTER_CONTRACT: "adapter contract",
  P10_MANIFEST_BINDING: "manifest binding",
  P04_FIXED_PARAMETER_BUNDLE: "fixed parameter bundle",
};

/* ------------------------------------------------------------------ parts */

function Withheld({ availability, what }: { availability: FreezeAvailability; what?: string }) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      title={availability.reason_code ?? availability.state}
    >
      {what ? `${what} — ` : ""}
      {FREEZE_WITHHELD_WORDS[availability.state]}
    </span>
  );
}

function Gap({ gap, what }: { gap: FreezeSourceGap; what: string }) {
  return (
    <span className="flex items-baseline gap-1.5" data-gap-fact={what} data-gap-state={gap.state}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {what}
      </span>
      <span
        className="mono text-[10px] italic"
        style={{ color: "var(--ink-faint)" }}
        title={freezeGapReason(gap)}
      >
        {FREEZE_GAP_WORDS[gap.state]}
      </span>
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: React.ReactNode;
  tone?: string;
  border?: string;
} & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
      style={{ color: tone, borderColor: border, background: "var(--paper-raised)" }}
      {...rest}
    >
      {children}
    </span>
  );
}

/** The one timestamp format on this screen: `formatUtc`, absence typed. */
function iso(at: number | null | undefined): string {
  return formatUtc(at) ?? "not published";
}

/* --------------------------------------------------------------- integrity */

/**
 * The three named checks, and the scope sentence that qualifies all of them.
 *
 * A matched check is marked in the good colour; the panel's own heading says
 * what kind of match it is, and the artifact bytes sit in the same panel as a
 * `NOT_ATTESTED` fact so the two are read together rather than apart.
 */
function IntegrityPanel({
  integrity,
  bytes,
  verify,
  onVerify,
}: {
  integrity: Integrity;
  bytes: ArtifactBytes | null | undefined;
  verify: VerifySlot;
  onVerify: () => void;
}) {
  const blocked = integrity.state === "BLOCKED";
  const byKey = new Map(integrity.checks.map((check) => [check.key, check] as const));

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-integrity={integrity.state}
      data-verification-scope={integrity.verification_scope}
      style={{
        borderColor: blocked ? "var(--bad)" : "var(--line)",
        background: blocked ? "var(--bad-bg-soft)" : "var(--paper-raised)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          retained binding check
        </h2>
        <Chip
          data-integrity-state={integrity.state}
          title={integrity.state === "BLOCKED" ? undefined : PARTIAL_SCOPE_NOTE}
          tone={blocked ? "var(--bad)" : "var(--role-holdout)"}
          border={blocked ? "var(--bad)" : "var(--role-holdout)"}
        >
          {integrity.state.toLowerCase()}
        </Chip>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
          {integrity.verification_scope.toLowerCase().replace(/_/g, " ")}
        </span>

        <button
          type="button"
          className="btn-ghost mono ml-auto text-[10px]"
          data-action="verify"
          onClick={onVerify}
          disabled={verify.state === "verifying"}
          title={
            verify.state === "verifying"
              ? "a verification is already in flight"
              : "re-read the retained bindings"
          }
        >
          {verify.state === "verifying" ? "verifying…" : "verify now"}
        </button>
      </div>

      {/* The scope, in words, beside every mark it qualifies. */}
      <p
        className="text-[11px] leading-[1.5]"
        style={{ color: "var(--ink-soft)" }}
        data-scope-note
        title={blocked ? BLOCKED_NOTE : PARTIAL_SCOPE_NOTE}
      >
        {blocked ? "a retained binding does not match — nothing below is shown as frozen" : "digest comparison only"}
      </p>

      <ul className="flex flex-col gap-1">
        {INTEGRITY_KEYS.map((key) => {
          const check = byKey.get(key);
          return (
            <li key={key} className="flex flex-wrap items-baseline gap-2" data-check={key}>
              <span className="mono text-[10px]" style={{ minWidth: 150 }}>
                {CHECK_LABEL[key]}
              </span>
              {check === undefined ? (
                <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                  not published
                </span>
              ) : (
                <CheckRow check={check} />
              )}
            </li>
          );
        })}
      </ul>

      {/*
        * The one fact that stops a row of matches reading as a chain: the
        * source artifact's bytes were never attested here.
        */}
      <Gap gap={integrity.source_artifact_bytes} what="source artifact bytes" />
      {(verify.state === "done" ? verify.verification.artifact_bytes : bytes) ? (
        <ByteReceipt bytes={(verify.state === "done" ? verify.verification.artifact_bytes : bytes) as ArtifactBytes} />
      ) : null}

      <VerifyLive verify={verify} />
    </section>
  );
}

/**
 * The verification's own answer, announced when it lands. Nothing here moves
 * on a timer: while the POST is in flight it says so and nothing else, and a
 * refusal is a refusal — neither can ever read as a match (P16-T10).
 */
function VerifyLive({ verify }: { verify: VerifySlot }) {
  return (
      <div role="status" aria-live="polite" data-verify-live>
        {verify.state === "done" ? (
          <div className="flex flex-col gap-0.5" data-verify-result={verify.verification.result}>
            <p className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              re-read {iso(verify.verification.verified_at_utc_ms)} ·{" "}
              {verify.verification.result.toLowerCase().replace(/_/g, " ")} · freeze revision{" "}
              {verify.verification.freeze_revision ?? "not published"}
            </p>
            {/*
              * The scope belongs to this verification response, not the adjacent snapshot.
              */}
            <p
              className="mono text-[9px]"
              style={{ color: "var(--ink-faint)" }}
              data-verify-scope={verify.verification.verification_scope}
            >
              this verification covers {verify.verification.verification_scope.toLowerCase().replace(/_/g, " ")}
            </p>
          </div>
        ) : verify.state === "refused" ? (
          <p className="text-[11px]" style={{ color: "var(--bad)" }} data-verify-refusal>
            <RefusalNote refusal={verify.refusal} />
          </p>
        ) : verify.state === "verifying" ? (
          <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-verify-pending>
            re-reading sealed bytes…
          </p>
        ) : null}
      </div>
  );
}

function CheckRow({ check }: { check: IntegrityCheck }) {
  const matched = check.state === "MATCH";
  return (
    <>
      <Chip
        data-check-state={check.state}
        tone={matched ? "var(--good)" : check.state === "MISMATCH" ? "var(--bad)" : "var(--ink-faint)"}
        border={matched ? "var(--good)" : check.state === "MISMATCH" ? "var(--bad)" : "var(--line)"}
      >
        {check.state.toLowerCase()}
      </Chip>
      {/*
        * Both digests are printed for a mismatch, because "does not match" is
        * not actionable without them — and neither is ever shortened or
        * compared here.
        */}
      <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-expected={check.key}>
        expected {check.expected_digest ?? "not published"}
      </span>
      <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-observed={check.key}>
        observed {check.observed_digest ?? "not published"}
      </span>
    </>
  );
}

/* ------------------------------------------------------ A10a · byte receipt */

/**
 * The durable byte receipt. A MATCH is the only green, and it is printed with
 * both manifest digests and the part count it covers; every other state is
 * its own word. A GET never produces a receipt — only "verify now" does — so
 * NOT_VERIFIED is the honest first state, not a failure.
 */
export function ByteReceipt({ bytes }: { bytes: ArtifactBytes }) {
  const blocked = bytesBlock(bytes);
  const matched = bytes.state === "MATCH";
  const tone = matched ? "var(--good)" : blocked ? "var(--bad)" : "var(--ink-faint)";
  return (
    <div
      className="flex flex-col gap-1 border-t pt-2"
      style={{ borderColor: "var(--line-soft)" }}
      data-byte-receipt={bytes.state}
      data-receipt-id={bytes.receipt_id ?? ""}
    >
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          artifact bytes
        </span>
        <Chip data-byte-state={bytes.state} tone={tone} border={matched || blocked ? tone : "var(--line)"} title={BYTE_NOTES_FULL[bytes.state]}>
          {BYTE_STATE_WORDS[bytes.state]}
        </Chip>
        {bytes.verified_at_utc_ms !== null ? (
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-byte-verified-at>
            re-read {formatUtc(bytes.verified_at_utc_ms) ?? "not published"}
          </span>
        ) : null}
        {bytes.parts_checked > 0 ? (
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-byte-parts>
            {bytes.parts_checked} parts · {bytes.documents_checked} documents · {bytes.parts_mismatched} differ
          </span>
        ) : null}
      </span>
      {bytes.expected_manifest_digest !== null ? (
        <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
            sealed manifest
          </span>
          <Digest value={bytes.expected_manifest_digest} data-byte-expected />
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
            · observed
          </span>
          <Digest value={bytes.observed_manifest_digest} data-byte-observed />
        </span>
      ) : null}
      {bytes.mismatches.length > 0 ? (
        <ul className="flex flex-col gap-0.5" data-byte-mismatches={bytes.mismatches.length}>
          {bytes.mismatches.map((mismatch) => (
            <li
              key={`${mismatch.kind}-${mismatch.table_kind ?? ""}-${mismatch.ordinal}`}
              className="mono flex flex-wrap items-baseline gap-x-1.5 text-[9px]"
              style={{ color: "var(--bad)" }}
              data-byte-mismatch={mismatch.kind}
            >
              <span>
                {mismatch.kind.toLowerCase()}
                {mismatch.table_kind ? ` ${mismatch.table_kind}` : ""} #{mismatch.ordinal}
              </span>
              <span>sealed</span>
              <Digest value={mismatch.expected_digest} />
              <span>≠ observed</span>
              <Digest value={mismatch.observed_digest} />
            </li>
          ))}
        </ul>
      ) : null}
      {bytes.state === "NOT_VERIFIED" ? null : (
        <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-byte-note title={BYTE_NOTES_FULL[bytes.state]}>
          {BYTE_NOTES[bytes.state]}
        </span>
      )}
    </div>
  );
}

/** Short visible note per byte state; the full sentence stays in the note's `title`. */
const BYTE_NOTES: Record<ArtifactBytes["state"], string> = {
  MATCH: "bytes only — not causal order, not a selection",
  MISMATCH: "bytes differ from the sealed digests — freeze stays BLOCKED",
  MISSING: "sealed bytes missing — freeze stays BLOCKED",
  NOT_VERIFIED: "",
  NOT_RETAINED: "no P05 artifact sealed — no bytes to re-read",
  UNAVAILABLE: "private verifier unreachable — nothing read",
  NOT_ENABLED: "byte verification not enabled here",
};

const BYTE_NOTES_FULL: Record<ArtifactBytes["state"], string> = {
  MATCH:
    "Every sealed part and document was re-read and hashes to the digest stored when the artifact was sealed. This covers bytes only — not causal order and not a selection.",
  MISMATCH:
    "Re-read bytes do not hash to the sealed digests. The expected digests are kept as sealed; nothing is rebaselined, and the freeze stays BLOCKED until the original bytes return.",
  MISSING:
    "Part of the sealed artifact is missing from the retained store. The freeze stays BLOCKED until those bytes are back.",
  NOT_VERIFIED: "No verification has been requested for these bytes. A read never re-opens them; verify now does.",
  NOT_RETAINED: "This run sealed no P05 artifact, so there are no bytes to re-read.",
  UNAVAILABLE: "The private verifier could not be reached. Nothing was read, recorded or claimed.",
  NOT_ENABLED: "Artifact byte verification is not enabled in this environment.",
};

/** Spec 07 §2.3 + §14: a thin red banner while sealed bytes BLOCK the run. */
function BlockedBanner({ bytes }: { bytes: ArtifactBytes }) {
  const first = bytes.mismatches[0];
  return (
    <div
      role="alert"
      className="rounded-[6px] border px-3.5 py-2 text-[11.5px] leading-[1.5]"
      style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)", color: "var(--bad)" }}
      data-blocked-banner={bytes.state}
    >
      <span className="mono font-semibold">BLOCKED — digest drift</span>
      {first ? (
        <span className="mono">
          {" "}· sealed {shortDigest(first.expected_digest)} ≠ observed {shortDigest(first.observed_digest) ?? "missing"}
        </span>
      ) : null}{" "}
      — run BLOCKED from promotion until re-verified
    </div>
  );
}

/* ------------------------------------------------------------ the ordering */

function WindowRow({ window, label }: { window: FreezeWindow | null; label: string }) {
  if (window === null) {
    return (
      <span className="flex items-baseline gap-1.5" data-window-row={label}>
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {label}
        </span>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          not published
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-2" data-window-row={label}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      <span className="mono text-[10px]">
        {iso(window.start_utc_ms)} → {iso(window.end_exclusive_utc_ms)}
      </span>
      {window.bars !== null ? (
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {window.bars} bars
        </span>
      ) : null}
      <Chip data-window-role={window.data_role}>{window.data_role.toLowerCase().replace(/_/g, " ")}</Chip>
      <Chip data-window-input={window.child_input_state}>
        {window.child_input_state.toLowerCase().replace(/_/g, " ")}
      </Chip>
      {window.evaluation_state !== null ? (
        <Chip data-window-evaluation={window.evaluation_state}>
          {window.evaluation_state.toLowerCase().replace(/_/g, " ")}
        </Chip>
      ) : null}
    </span>
  );
}

const AXIS_TONE: Record<string, string> = {
  IS: "var(--viz-train)",
  "outer OOS": "var(--role-oos)",
};

/**
 * Hi-fi F1, data-time axis only.
 *
 * The published windows, in the contract's chronological order, on one
 * data-time track. The axis runs from the first published start to the last
 * published end; the only arithmetic is the offset/width that turns two
 * published timestamps into a position — the same conversion Screen 05 uses.
 * No tick is generated, no boundary is inferred, and the wall clock is never
 * drawn on this track: spec 07 §5 pitfall 1, and it is not published anyway.
 */
function DataTimeAxis({ windows }: { windows: readonly { label: string; window: FreezeWindow | null }[] }) {
  const published = windows.filter(
    (entry): entry is { label: string; window: FreezeWindow } => entry.window !== null,
  );
  const first = published[0];
  const last = published[published.length - 1];
  if (first === undefined || last === undefined) return null;
  const timeline = {
    start_utc_ms: first.window.start_utc_ms,
    end_exclusive_utc_ms: last.window.end_exclusive_utc_ms,
  };

  return (
    <div className="flex flex-col gap-1" data-data-time-axis={published.length}>
      <div
        className="relative h-[22px] overflow-hidden rounded-[3px] border"
        style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
      >
        {published.map(({ label, window }) => {
          const geometry = placeInTimeline(timeline, window);
          return (
            <span
              key={label}
              data-axis-window={label}
              data-hairline={geometry.widthPercent < HAIRLINE_PERCENT ? "true" : "false"}
              title={`${label} · ${iso(window.start_utc_ms)} → ${iso(window.end_exclusive_utc_ms)} · ${window.data_role}`}
              className="absolute top-0 h-full border-r"
              style={{
                borderColor: "var(--paper-raised)",
                left: `${geometry.leftPercent}%`,
                width: `${Math.max(geometry.widthPercent, HAIRLINE_PERCENT)}%`,
                background: axisFill(label),
              }}
            />
          );
        })}
      </div>
      {/* The published endpoints, exactly — the track is a picture of them. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-axis-start>
          {iso(timeline.start_utc_ms)}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {published.map(({ label }) => (
            <span key={label} className="flex items-center gap-1" data-axis-legend={label}>
              <span
                aria-hidden
                className="inline-block h-[8px] w-[14px] rounded-[2px]"
                style={{ background: axisFill(label) }}
              />
              <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }}>
                {label}
              </span>
            </span>
          ))}
        </span>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-axis-end>
          {iso(timeline.end_exclusive_utc_ms)}
        </span>
      </div>
    </div>
  );
}

/** The holdout is never drawn in the colour of a window something read. */
function axisFill(label: string): string {
  return label === "holdout"
    ? "repeating-linear-gradient(135deg, var(--line-strong) 0 4px, var(--paper-sunken) 4px 8px)"
    : AXIS_TONE[label] ?? "var(--line-strong)";
}

/* --------------------------------------------------------- frozen profile */


function FrozenParameters({ parameters, blocked }: { parameters: readonly FrozenParameter[]; blocked: boolean }) {
  if (blocked) {
    return (
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--bad)" }} data-frozen-blocked>
        No frozen parameter is shown while a retained binding mismatches. Filling this table from a
        local default would put numbers here that are not this run's.
      </p>
    );
  }
  if (parameters.length === 0) {
    return (
      <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-frozen-empty>
        the source published no frozen parameter for this run
      </p>
    );
  }
  /*
   * Hi-fi F2's columns — parameter · declared range · range position ·
   * frozen θ* · reading — on a fixed layout, so a wider value can never push
   * one row's bar out of line with the next. Every cell is a published field;
   * the reading is the server's own `position_percent` and `bound_state`.
   */
  const head = "mono py-1.5 pr-2 text-left text-[9px] font-normal uppercase tracking-[.07em]";
  return (
    <div className="flex flex-col gap-1.5" data-frozen={parameters.length}>
      <table className="w-full table-fixed border-collapse" data-frozen-table>
        <colgroup>
          <col style={{ width: "17%" }} />
          <col style={{ width: "19%" }} />
          <col />
          <col style={{ width: "13%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}>
            <th scope="col" className={head}>
              parameter
            </th>
            <th scope="col" className={head}>
              declared range
            </th>
            <th scope="col" className={head}>
              range position
            </th>
            <th scope="col" className={`${head} text-right`}>
              frozen θ*
            </th>
            <th scope="col" className={`${head} pl-3`}>
              reading
            </th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((parameter) => (
            <tr
              key={parameter.name}
              className="border-b align-middle"
              style={{ borderColor: "var(--line-soft)" }}
              data-frozen-parameter={parameter.name}
            >
              <th scope="row" className="mono truncate py-2 pr-2 text-left text-[10.5px] font-normal normal-case tracking-normal" style={{ color: "var(--ink)" }}>
                {parameter.name}
              </th>
              <td className="mono py-2 pr-2 text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                {parameter.minimum} – {parameter.maximum} · step {parameter.step}
              </td>
              <td className="py-2 pr-3">
                <span
                  className="relative block h-[6px] rounded-[3px]"
                  style={{ background: "var(--paper-sunken)" }}
                  title={`${parameter.frozen_value} sits at ${parameter.position_percent}% of the declared range`}
                >
                  {/* The server's placement, again: the browser never recomputes it. */}
                  <span
                    data-frozen-position={parameter.name}
                    data-tick-tone={parameter.bound_warning?.state ?? "NOT_PUBLISHED"}
                    className="absolute top-[-3px] h-[12px] w-[3px] rounded-[1px]"
                    style={{
                      left: `calc(${parameter.position_percent}% - 1.5px)`,
                      background:
                        parameter.bound_warning?.state === "AT_BOUND"
                          ? "var(--bad)"
                          : parameter.bound_warning?.state === "NEAR_BOUND"
                            ? "var(--accent-2)"
                            : "var(--role-oos)",
                    }}
                  />
                </span>
              </td>
              <td
                className="mono py-2 text-right text-[11px] font-semibold tabular-nums"
                data-frozen-value={parameter.name}
              >
                {parameter.frozen_value}
              </td>
              {/* DR-02: the same server definition and renderer as Search S06. */}
              <td className="py-2 pl-3 text-[9.5px] leading-[1.4]" data-bound-state={parameter.bound_state}>
                <BoundWarningNote warning={parameter.bound_warning} positionPercent={parameter.position_percent} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------ stage-4 binding */

/**
 * Hi-fi F4 — binding down to Stage 4.
 *
 * The hi-fi compares four values: sealed vs replayed, params and bundle. This
 * contract publishes one of them — the sealed bundle digest — and Stage 4
 * publishes none, so the card keeps its place and says which side is missing.
 * Nothing here is marked bound: one value has nothing to be compared with.
 */
function Stage4Binding({ bundleDigest }: { bundleDigest: string | null }) {
  const rows: { key: string; label: string; value: string | null }[] = [
    { key: "sealed-params", label: "sealed params digest", value: null },
    { key: "replay-params", label: "params digest used by replay", value: null },
    { key: "sealed-bundle", label: "sealed bundle digest", value: bundleDigest },
    { key: "runtime-bundle", label: "runtime bundle digest", value: null },
  ];
  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-panel="stage4-binding"
      data-binding-compared="false"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          binding down to stage 4
        </h2>
        <span className="mono ml-auto text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          not compared
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-b-0"
            style={{ borderColor: "var(--line-soft)" }}
            data-binding-row={row.key}
            data-binding-published={row.value === null ? "false" : "true"}
          >
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              {row.label}
            </span>
            {row.value === null ? (
              <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                not published
              </span>
            ) : (
              <span className="mono break-all text-[10px]">{row.value}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
        only the sealed bundle digest is published — none compared
      </p>
    </section>
  );
}

/* ------------------------------------------------------- retained custody */

function RetainedPanel({ slot, onNeeded }: { slot: RetainedSlot; onNeeded: () => void }) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  /* D12: a P04 run is not held by the retained lane — nothing to check, nothing to say. */
  if (slot.state === "not-applicable") return null;

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-retained={slot.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        retained custody check
      </h2>

      {slot.state === "ready" ? (
        <RetainedRows freeze={slot.freeze} />
      ) : slot.state === "refused" ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-retained-refusal>
          {slot.laneState ? (
            /* The server names why the lane is empty; its message text is not read. */
            <span data-lane-state={slot.laneState}>{CURRENT_SOURCE_LANE_COPY[slot.laneState]}</span>
          ) : (
            <RefusalNote refusal={slot.refusal} />
          )}
        </p>
      ) : (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading…
        </p>
      )}
    </section>
  );
}

function RetainedRows({ freeze }: { freeze: CurrentSourceFreeze }) {
  const { integrity } = freeze;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <Chip
          data-retained-state={integrity.state}
          tone={integrity.state === "MATCH" ? "var(--good)" : "var(--bad)"}
          border={integrity.state === "MATCH" ? "var(--good)" : "var(--bad)"}
        >
          {integrity.state.toLowerCase()}
        </Chip>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-scope-code>
          {integrity.verification_scope.toLowerCase().replace(/_/g, " ")}
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-retained-rows>
          {integrity.retained_row_count} retained rows
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          retained {iso(freeze.provenance.retained_at_utc_ms)}
        </span>
      </div>

      {/* Both digests, printed, never compared here. */}
      <div className="flex flex-col gap-1">
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-manifest>
          manifest expected {integrity.expected_manifest_digest} · observed{" "}
          {integrity.observed_manifest_digest}
        </span>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-import>
          import expected {integrity.expected_retained_import_digest} · observed{" "}
          {integrity.observed_retained_import_digest}
        </span>
      </div>
      {/*
        * RS-02 is explicit that this `MATCH` is Portal retained custody —
        * manifest rows, counts and a batch receipt — and not an artifact-byte,
        * causal-order, selection or broker pass. The sentence travels with it.
        */}
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-retained-scope title={RETAINED_SCOPE_TITLE}>
        match = manifest, row counts, batch receipt only
      </p>
    </div>
  );
}

/* ----------------------------------------------- the retained WFO lane (W3b) */

/*
 * A Delta walk-forward run is never frozen through the P16 hub: the hub
 * answers NOT_APPLICABLE and names the retained current-source lane. Once
 * that lane answered AVAILABLE, everything below is read from it — its
 * integrity receipt, its frozen selection, its typed absences — and nothing
 * the hub said about itself (its NOT_APPLICABLE codes) reaches the screen.
 */

/** Sentences for the retained freeze's own reason codes, beside the shared registry. */
const RETAINED_REASON_SENTENCES: Record<string, string> = {
  P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES:
    "bytes verified at import; a read never reopens them",
  SELECTION_SAW_EVERY_OUTER_FOLD:
    "θ* chosen after every fold's OOS was read",
  P10_DELTA_WFO_PROFILE_DOES_NOT_ADMIT_PER_FOLD_CAUSAL_SCHEDULE:
    "profile admits no per-fold causal schedule",
  QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS:
    "no freeze or OOS-read timestamps published",
  RS02_SEAL_PREDATES_P17_CHILD_AUDIT:
    "retained before child audit was kept — OOS child not named",
  FROZEN_PARAMETERS_NOT_EXACT_NUMERIC_JSON:
    "frozen parameters not all exact numbers — identity not recomputed",
  RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET:
    "a read never enqueues an evaluation — no ΔJ",
  SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS:
    "no per-fold IS/OOS segments published",
};

function reasonText(code: string | null | undefined): string | null {
  return reasonCodeSentence(code) ?? (code ? RETAINED_REASON_SENTENCES[code] ?? null : null);
}

export { WHAT_IF_RULE } from "./WhatIfCard";

/* D15: the objective is "J" on every screen (S06 claim row, S07 strip, what-if); the unit label names which J it is. */
const OBJECTIVE_WORDS: Record<string, string> = {
  MODE_1_DECAY_J: "mode 1 decay",
  IS_MEAN_SHARPE: "IS mean Sharpe",
};

/** The S06 claim row's precision: two places, the screen's minus. */
function objectiveTwoPlaces(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed).replace(/^-/, "−");
}

/** D24: a QuantBT claim token in words (underscores out); the token itself is the title where it is drawn. */
function claimWords(value: string): string {
  return claimToken(value).toLowerCase().replace(/_/g, " ");
}

/** A digest as 8 hex with the full value one hover away. */
function Digest({ value, ...rest }: { value: string | null | undefined } & Record<string, unknown>) {
  const short = shortDigest(value);
  return short === null ? (
    <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} {...rest}>
      not published
    </span>
  ) : (
    <span className="mono text-[10px]" style={{ color: "var(--ink)" }} title={value ?? undefined} {...rest}>
      {short}
    </span>
  );
}

/** A typed absence that shows its code and, when one exists, its sentence. */
function TypedAbsence({
  what,
  state,
  code,
  ...rest
}: {
  what: string;
  state: string;
  code: string | null | undefined;
} & Record<string, unknown>) {
  const sentence = reasonText(code);
  return (
    <div className="flex flex-col gap-0.5" data-absence={what} data-absence-state={state} data-reason={code ?? ""} {...rest}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {what}
        </span>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {state.toLowerCase().replace(/_/g, " ")}
        </span>
        {/* D24: the sentence is the text; the server's code is the hover. */}
        {code ? (
          <span className="text-[10px]" style={{ color: "var(--ink-faint)" }} title={code} data-absence-code={code}>
            {sentence ?? ""}
          </span>
        ) : null}
      </span>
    </div>
  );
}

type RetainedFreeze = CurrentSourceFreeze;
type FoldEntry = NonNullable<ProgressRead["progress"]>["folds"][number];

/** `folds 1–2`, `fold 3`, `folds 1, 3, 4` — from the fold numbers the progress read published. */
function foldSpan(folds: readonly number[]): string {
  if (folds.length === 0) return "no fold";
  if (folds.length === 1) return `fold ${folds[0]}`;
  const contiguous = folds.every((fold, index) => index === 0 || fold === folds[index - 1] + 1);
  return contiguous ? `folds ${folds[0]}–${folds[folds.length - 1]}` : `folds ${folds.join(", ")}`;
}

function RetainedStrip({ freeze, identity }: { freeze: RetainedFreeze; identity: RunIdentitySlot }) {
  const selection = freeze.frozen_selection;
  const objectiveKind = (selection as { objective_kind?: string }).objective_kind ?? null;
  const objectiveWord = (objectiveKind && OBJECTIVE_WORDS[objectiveKind]) ?? null;
  const readiness = identity.state === "ready" ? retainedReadiness(identity.identity.progress) : undefined;
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border px-3.5 py-2"
      data-freeze-strip="RETAINED"
      data-read-authority={freeze.read_authority}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <Chip tone="var(--accent)" border="var(--accent)" title={freeze.read_authority}>
        retained current source
      </Chip>
      <span className="flex flex-wrap items-baseline gap-1.5" data-selection-state={selection.availability.state}>
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          selection
        </span>
        <span className="mono text-[10px]">{selection.availability.state.toLowerCase().replace(/_/g, " ")}</span>
        {selection.selected_trial_id !== null ? (
          <span
            className="mono text-[10px]"
            data-selected-trial={selection.selected_trial_id}
            title={trialTitle}
          >
            · {trialLabel({ sourceId: selection.selected_trial_id })}
          </span>
        ) : (
          <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
            · trial not published
          </span>
        )}
        {selection.objective !== null ? (
          <span className="mono text-[10px]" data-selected-objective={selection.objective} title={selection.objective}>
            · J {objectiveTwoPlaces(selection.objective)}
            {objectiveWord !== null ? ` · ${objectiveWord}` : ""}
          </span>
        ) : (
          <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
            · objective not published
          </span>
        )}
      </span>
      {/* Readiness is the run's seal on the retained lane, not the hub's NOT_READY for a lane it never holds. */}
      <Chip
        data-readiness={readiness ?? (readiness === null ? "NOT_PUBLISHED" : "READING")}
        tone={readiness === "READY" ? "var(--good)" : "var(--ink-soft)"}
        border={readiness === "READY" ? "var(--good)" : "var(--line)"}
        title="the attempt resolved from its source, materialized READY and sealed its mandatory bundle (P11 progress read)"
      >
        readiness{" "}
        {readiness === undefined ? "reading…" : readiness === null ? "not published" : readiness.toLowerCase().replace(/_/g, " ")}
      </Chip>
      <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
        as of {formatUtc(freeze.as_of_utc_ms) ?? "not published"}
      </span>
    </div>
  );
}

/** Hi-fi F3 on the retained lane: the receipt RS-02 publishes, pair by pair. */
function RetainedIntegrity({
  freeze,
  verify,
  onVerify,
}: {
  freeze: RetainedFreeze;
  verify: VerifySlot;
  onVerify: () => void;
}) {
  const { integrity } = freeze;
  const matched = integrity.state === "MATCH";
  const tone = matched ? "var(--good)" : "var(--bad)";
  const pairs = [
    {
      key: "manifest",
      label: "manifest digest",
      expected: integrity.expected_manifest_digest,
      observed: integrity.observed_manifest_digest,
    },
    {
      key: "retained-import",
      label: "retained import digest",
      expected: integrity.expected_retained_import_digest,
      observed: integrity.observed_retained_import_digest,
    },
  ];
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-panel="retained-integrity"
      data-integrity-state={integrity.state}
      data-verification-scope={integrity.verification_scope}
      style={{
        borderColor: matched ? "var(--line)" : "var(--bad)",
        background: matched ? "var(--paper-raised)" : "var(--bad-bg-soft)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          digest chain · retained custody
        </h2>
        <Chip data-retained-state={integrity.state} tone={tone} border={tone}>
          {integrity.state.toLowerCase()}
        </Chip>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-scope-code>
          {integrity.verification_scope.toLowerCase().replace(/_/g, " ")}
        </span>
        {/* Spec 07 §2.3: "verify now" — disabled while verifying, never optimistic. */}
        <button
          type="button"
          className="btn-ghost mono ml-auto text-[10px]"
          data-action="verify"
          onClick={onVerify}
          disabled={verify.state === "verifying"}
          title={
            verify.state === "verifying"
              ? "a verification is already in flight"
              : "re-read the sealed artifact bytes and record a receipt"
          }
        >
          {verify.state === "verifying" ? "verifying…" : "verify now"}
        </button>
      </div>

      <ul className="flex flex-col">
        {pairs.map((pair) => (
          <li
            key={pair.key}
            className="flex flex-col gap-0.5 border-b py-1.5 last:border-b-0"
            style={{ borderColor: "var(--line-soft)" }}
            data-integrity-row={pair.key}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="mono text-[10px]">{pair.label}</span>
              {/* The server's verdict over the receipt; this screen compares nothing itself. */}
              <Chip data-integrity-row-state={integrity.state} tone={tone} border={tone}>
                {integrity.state.toLowerCase()}
              </Chip>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                expected
              </span>
              <Digest value={pair.expected} data-expected={pair.key} />
              <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                · observed
              </span>
              <Digest value={pair.observed} data-observed={pair.key} />
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="mono text-[10px]" data-retained-rows={integrity.retained_row_count}>
          {formatMetric(integrity.retained_row_count, "count")} retained rows
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          retained {formatUtc(freeze.provenance.retained_at_utc_ms) ?? "not published"}
        </span>
      </div>

      {/* A server older than A10a publishes no receipt: keep its typed absence. */}
      {(verify.state === "done" ? verify.verification.artifact_bytes : freeze.byte_verification) ? (
        <ByteReceipt
          bytes={(verify.state === "done" ? verify.verification.artifact_bytes : freeze.byte_verification) as ArtifactBytes}
        />
      ) : (
        <TypedAbsence
          what="source artifact bytes"
          state={freeze.source_artifact_bytes.state}
          code={freeze.source_artifact_bytes.reason_code ?? freeze.source_artifact_bytes.availability.reason_code}
          data-source-bytes={freeze.source_artifact_bytes.state}
        />
      )}
      <VerifyLive verify={verify} />

      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-retained-scope title={RETAINED_SCOPE_TITLE}>
        match = manifest, row counts, batch receipt only
      </p>
    </section>
  );
}

/** Hi-fi F2 on the retained lane: the one frozen selection, and the folds it serves. */
function RetainedFrozenTable({ freeze, identity }: { freeze: RetainedFreeze; identity: RunIdentity | null }) {
  const parameters = Object.entries(freeze.frozen_selection.parameters);
  const run = identity?.progress?.run ?? null;
  const folds: FoldEntry[] = identity?.progress?.progress?.folds ?? [];
  const selected = folds.filter((fold) => fold.selection?.state === "AVAILABLE");
  const digests = [...new Set(selected.map((fold) => fold.selection?.params_digest ?? null))].filter(
    (digest): digest is string => digest !== null,
  );
  const global =
    run?.schedule === "global" &&
    selected.length > 0 &&
    selected.length === folds.length &&
    selected.every((fold) => fold.selection?.scope === "GLOBAL_STUDY") &&
    digests.length === 1;
  const foldNumbers = folds.map((fold) => fold.fold).sort((a, b) => a - b);
  const head = "mono px-3 py-2 text-left text-[10px] font-normal uppercase tracking-[.07em]";
  /* X2 · B3: the declared rows of θ* (range, placement, DR-02) when the server publishes them. */
  const declared = freeze.declared_space;
  const served: FrozenParameter[] | null =
    declared?.state === "AVAILABLE"
      ? declared.parameters.map((parameter) => ({
          name: parameter.name,
          kind: parameter.kind,
          minimum: parameter.minimum,
          maximum: parameter.maximum,
          step: parameter.step,
          frozen_value: parameter.value,
          position_percent: parameter.position_percent,
          bound_state: "WITHIN_DECLARED_RANGE" as const,
          bound_warning: parameter.bound_warning,
        }))
      : null;
  /* T10: the θ* digest — P11's fold params digest, the same sha256 the server binds in F4. */
  const thetaDigest = digests.length === 1 ? digests[0]! : freeze.stage4_binding?.sealed_params_sha256 ?? null;

  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden rounded-[6px] border"
      data-panel="frozen-parameters"
      data-frozen-scope={global ? "GLOBAL" : run?.schedule ?? "UNKNOWN"}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--line)" }}
      >
        <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          frozen θ* — {global ? "one shared set" : "retained selection"}
        </h2>
        <span className="flex flex-wrap items-center gap-2">
          {thetaDigest !== null ? (
            <span className="flex items-baseline gap-1.5" data-params-digest={thetaDigest}>
              <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                params digest
              </span>
              <Digest value={thetaDigest} />
              <CopyThetaDigest digest={thetaDigest} />
            </span>
          ) : null}
          {global ? (
            <Chip data-schedule="global" tone="var(--accent)" border="var(--accent)">
              shared
            </Chip>
          ) : null}
        </span>
      </div>

      {global ? (
        <p
          className="border-b px-3 py-1.5 text-[11px] leading-[1.5]"
          style={{ borderColor: "var(--line-soft)", background: "var(--accent-soft)", color: "var(--ink-soft)" }}
          data-shared-banner
        >
          <span className="mono" title="Global schedule: one θ* for every fold; the objective is study-wide">
            shared θ* · {foldSpan(foldNumbers)}
          </span>
        </p>
      ) : identity === null ? (
        <p className="border-b px-3 py-1.5 mono text-[10px] italic" style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}>
          reading the run's schedule…
        </p>
      ) : (
        <div className="flex flex-col gap-1 border-b px-3 py-1.5" style={{ borderColor: "var(--line-soft)" }} data-fold-selections>
          <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
            schedule {run?.schedule ?? "not published"} — the retained lane publishes one frozen selection
          </span>
          {folds.map((fold) => (
            <span key={fold.fold} className="flex flex-wrap items-baseline gap-2" data-fold-selection={fold.fold}>
              <span className="mono text-[10px]">{foldLabel(fold.fold - 1)}</span>
              {fold.selection?.state === "AVAILABLE" ? (
                <>
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                    {(fold.selection.scope ?? "").toLowerCase().replace(/_/g, " ")}
                  </span>
                  <Digest value={fold.selection.params_digest} />
                </>
              ) : (
                <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={fold.selection?.reason_code ?? undefined}>
                  selection not published
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {served !== null ? (
        <div className="px-3 py-1.5" data-frozen-source="declared-space">
          <FrozenParameters parameters={served} blocked={false} />
        </div>
      ) : parameters.length === 0 ? (
        <p className="mono px-3 py-2 text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-frozen-empty>
          the retained selection published no parameter
        </p>
      ) : (
        <table className="w-full table-fixed border-collapse" data-frozen-table data-frozen={parameters.length}>
          <colgroup>
            <col />
            <col style={{ width: "34%" }} />
          </colgroup>
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}>
              <th scope="col" className={head}>
                parameter
              </th>
              <th scope="col" className={`${head} text-right`}>
                frozen θ*
              </th>
            </tr>
          </thead>
          <tbody>
            {parameters.map(([name, value]) => (
              <tr
                key={name}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--line-soft)" }}
                data-frozen-param={name}
              >
                <th
                  scope="row"
                  className="mono truncate px-3 py-[7px] text-left text-[12px] font-normal normal-case tracking-normal"
                  style={{ color: "var(--ink)" }}
                >
                  {name}
                </th>
                {/* The exact decimal the server sent; nothing is rounded. */}
                <td className="mono px-3 py-[7px] text-right text-[12px] font-semibold tabular-nums" data-frozen-value={name}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div
        className="flex flex-col gap-1 border-t px-3 py-2.5"
        style={{ borderColor: "var(--line)", background: "var(--paper-sunken)" }}
      >
        {served !== null ? null : declared ? (
          /* The server answered: its own reason, never a UI code. */
          <TypedAbsence what="declared range · range position" state={declared.state} code={declared.reason_code} data-frozen-range />
        ) : (
          <TypedAbsence what="declared range · range position" state="NOT_PUBLISHED" code="UI_RETAINED_LANE_HAS_NO_FIELD" data-frozen-range />
        )}
        <span
          className="mono text-[10px]"
          style={{ color: "var(--ink-soft)" }}
          data-read-only
          title="Read-only by decision: writing onto a frozen set breaks the invariant the claim rests on. Manually entered params have no lineage — no path for them exists."
        >
          read-only
        </span>
      </div>
    </section>
  );
}

const FOLD_VERDICT_WORDS: Record<FoldOrderingRow["verdict"], string> = {
  NOT_CAUSAL_GLOBAL_SELECTION: "not causal · global selection",
  /* Per-fold study: the selection used only data before this fold's OOS. A data-time statement — never a claim about an engine freeze or first-OOS-read clock. */
  CAUSAL_DATA_TIME_SELECTION: "causal · data-time selection",
  NOT_EVALUATED: "not evaluated",
  NOT_PUBLISHED: "not published",
};

const BOUNDARY_WORDS: Record<FoldOrderingRow["data_time"]["boundary"], string> = {
  IS_ENDS_BEFORE_OOS: "IS ends before OOS",
  IS_OVERLAPS_OOS: "IS overlaps OOS",
  NOT_PUBLISHED: "window not published",
};

const CHILD_WORDS: Record<FoldOrderingRow["oos_generation_child"]["state"], string> = {
  MATCH: "OOS child = frozen θ*",
  MISMATCH: "OOS child ≠ frozen θ*",
  NOT_RETAINED: "child audit not retained",
  NOT_PUBLISHED: "no OOS generation child",
  NOT_COMPUTABLE: "θ* identity not computable",
};

/** A bar on the data-time axis only: IS then OOS, placed on the span of the returned folds. */
function DataTimeBar({ fold, span }: { fold: FoldOrderingRow; span: { lo: number; hi: number } | null }) {
  const place = (start: number | null | undefined, end: number | null | undefined) => {
    if (span === null || start == null || end == null || span.hi <= span.lo) return null;
    const left = ((start - span.lo) / (span.hi - span.lo)) * 100;
    const width = Math.max(((end - start) / (span.hi - span.lo)) * 100, 0.5);
    return { left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` };
  };
  const is = place(fold.data_time.is.start_utc_ms, fold.data_time.is.end_utc_ms);
  const oos = place(fold.data_time.oos.start_utc_ms, fold.data_time.oos.end_utc_ms);
  return (
    <span className="relative block h-[12px] min-w-[120px] flex-1 rounded-[3px]" style={{ background: "var(--paper-sunken)" }} aria-hidden>
      {is ? <span className="absolute inset-y-0 rounded-[3px]" data-segment="is" style={{ ...is, background: "var(--accent-soft)", border: "1px solid var(--accent)" }} /> : null}
      {oos ? <span className="absolute inset-y-0 rounded-[3px]" data-segment="oos" style={{ ...oos, background: "var(--warn-bg)", border: "1px solid var(--warn)" }} /> : null}
    </span>
  );
}

/**
 * W5a P16-T02/T11 — hi-fi F1 on the retained lane, per fold: DATA TIME (each
 * fold's own IS/OOS boundary and the server's causal verdict) and WALL CLOCK
 * (a typed absence: QuantBT publishes no freeze clocks). Two axes, never one.
 */
function FoldOrderingAxes({ ordering }: { ordering: FoldOrdering }) {
  const times = ordering.folds.flatMap((fold) => [
    fold.data_time.is.start_utc_ms, fold.data_time.is.end_utc_ms, fold.data_time.oos.start_utc_ms, fold.data_time.oos.end_utc_ms,
  ]).filter((value): value is number => typeof value === "number");
  const span = times.length > 1 ? { lo: Math.min(...times), hi: Math.max(...times) } : null;
  const global = ordering.selection_scope === "GLOBAL";
  const badge = global ? "⚠ NOT CAUSAL · GLOBAL SELECTION" : ordering.selection_scope === "PER_FOLD" ? "PER-FOLD · NOT EVALUATED" : "ORDERING NOT PUBLISHED";
  return (
    <div className="flex flex-col gap-2" data-fold-ordering={ordering.selection_scope} data-axes={ordering.axes.join(" ")}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-ordering-verdict>
        <span className="mono rounded-[3px] border px-2 py-[1px] text-[10px] font-bold" style={{ borderColor: "var(--warn)", color: "var(--warn)" }} data-ordering-badge>
          {badge}
        </span>
        {ordering.source_claims.chronological_claim ? (
          <span className="mono text-[10px]" data-source-claim title={`QuantBT walk_forward.chronological_validation_claim · ${claimToken(ordering.source_claims.chronological_claim)}`}>
            {claimWords(ordering.source_claims.chronological_claim)}
          </span>
        ) : null}
        {ordering.source_claims.causality_claim ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title="QuantBT walk_forward.causality_claim">
            {claimWords(ordering.source_claims.causality_claim)}
          </span>
        ) : null}
        {ordering.source_claims.oos_used_for_selection === true ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>oos_used_for_selection = true</span>
        ) : null}
      </span>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        F1 · two axes
      </span>
      <div className="flex flex-col gap-1" data-axis="DATA_TIME">
        <span className="mono text-[9.5px] font-bold uppercase tracking-[.1em]" style={{ color: "var(--warn)" }}>
          data time · {ordering.counts.folds} {ordering.counts.folds === 1 ? "fold" : "folds"}
        </span>
        <ol className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
          {ordering.folds.map((fold) => (
            <li
              key={fold.fold_id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
              data-fold-row={fold.fold_id}
              data-boundary={fold.data_time.boundary}
              data-fold-verdict={fold.verdict}
              data-oos-child={fold.oos_generation_child.state}
            >
              <span className="mono w-[52px] flex-none text-[10px]" style={{ color: "var(--ink-soft)" }}title={`QuantBT fold_id ${fold.fold_id}`}>{foldLabel(fold.fold_id)}</span>
              <DataTimeBar fold={fold} span={span} />
              <span
                className="mono text-[9.5px]"
                style={{ color: fold.data_time.boundary === "IS_OVERLAPS_OOS" ? "var(--bad)" : "var(--ink-faint)" }}
                data-boundary-words
                title={fold.data_time.boundary === "NOT_PUBLISHED"
                  ? fold.data_time.reason_code ?? undefined
                  : `IS → ${formatUtc(fold.data_time.is.end_utc_ms) ?? "?"} · OOS ${formatUtc(fold.data_time.oos.start_utc_ms) ?? "?"} → ${formatUtc(fold.data_time.oos.end_utc_ms) ?? "?"}`}
              >
                {BOUNDARY_WORDS[fold.data_time.boundary]}
              </span>
              <span className="mono text-[9.5px]" style={{ color: "var(--warn)" }} title={fold.reason_code ?? undefined} data-verdict-words>
                {FOLD_VERDICT_WORDS[fold.verdict]}
              </span>
              <span
                className="mono text-[9.5px]"
                data-child-words
                style={{
                  color: fold.oos_generation_child.state === "MATCH" ? "var(--good)" : fold.oos_generation_child.state === "MISMATCH" ? "var(--bad)" : "var(--ink-faint)",
                }}
                title={fold.oos_generation_child.reason_code
                  ?? (fold.oos_generation_child.candidate_id ? `QuantBT candidate ${fold.oos_generation_child.candidate_id} · child #${fold.oos_generation_child.audit_ordinal}` : undefined)}
              >
                {CHILD_WORDS[fold.oos_generation_child.state]}
                {/* D3: this is the engine's candidate id, not a params digest — it is labelled as what it is. */}
                {fold.oos_generation_child.candidate_id ? ` · candidate ${shortDigest(fold.oos_generation_child.candidate_id, 12)}` : ""}
              </span>
            </li>
          ))}
        </ol>
        <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-ordering-reason>
          {reasonText(ordering.folds[0]?.reason_code) ?? ordering.folds[0]?.reason_code ?? "no retained fold"}
          {global ? " — report evidence only" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1 border-t border-dashed pt-2" style={{ borderColor: "var(--line-strong)" }} data-axis="WALL_CLOCK">
        <span className="mono text-[9.5px] font-bold uppercase tracking-[.1em]" style={{ color: "var(--warn)" }}>
          wall clock
        </span>
        <TypedAbsence what="wall clock ordering" state={ordering.wall_clock.state} code={ordering.wall_clock.reason_code} />
      </div>
    </div>
  );
}

/** Hi-fi F1 on the retained lane: what the requested window says, and what no source clock says. */
function RetainedOrdering({ identity, ordering }: { identity: RunIdentity | null; ordering?: FoldOrdering | null }) {
  const window = walkForwardOf(identity?.requested ?? null);
  const label = protocolLabel(window, identity?.progress?.run?.protocol ?? null);
  const folds: FoldEntry[] = identity?.progress?.progress?.folds ?? [];
  const segmentGap = folds.find((fold) => fold.fold_timeline?.state === "NOT_PUBLISHED")?.fold_timeline ?? null;
  const declared = identity?.progress?.run?.declared_folds ?? null;
  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-panel="ordering"
      data-ordering-state={ordering ? ordering.selection_scope : "NOT_PUBLISHED"}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        ordering
      </h2>
      <div className="flex flex-col gap-1" data-data-time="REQUESTED_WINDOW">
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          data time · requested walk-forward window
        </span>
        {identity === null ? (
          <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
            reading the admitted spec…
          </span>
        ) : window.start !== null && window.endExclusive !== null ? (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-requested-window>
            <span className="mono text-[10px]">
              {window.start} → {window.endExclusive}
            </span>
            {label ? <Chip>{label}</Chip> : null}
            {declared?.state === "DECLARED" && declared.count !== null ? (
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                {declared.count} declared folds
              </span>
            ) : null}
          </span>
        ) : (
          <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
            requested window not published
          </span>
        )}
        {/* A W5a server publishes each fold's IS/OOS windows below; the older gap no longer applies. */}
        {segmentGap && !ordering ? (
          <TypedAbsence what="per-fold IS/OOS segments" state={segmentGap.state} code={segmentGap.reason_code} />
        ) : null}
      </div>
      {ordering ? (
        <>
          <FoldOrderingAxes ordering={ordering} />
          {/* Orchestration clocks under their own name: never an engine pool-freeze or first-OOS-read clock. */}
          <OrchestrationClocks events={ordering.stage_events} />
        </>
      ) : (
        <TypedAbsence what="wall clock ordering" state="NOT_PUBLISHED" code="UI_RETAINED_LANE_HAS_NO_FIELD" />
      )}
    </section>
  );
}

/** F4 → S4: the way on from the binding card to the replay that uses these digests; keeps the cursor. */
function ExecuteLink({ href }: { href: string | null }) {
  if (href === null) return null;
  return (
    <Link
      to={href}
      className="mono self-end text-[10px] uppercase tracking-[.06em]"
      style={{ color: "var(--accent)" }}
      data-action="binding-to-execute"
      title="Open S4 · Execute — the replay that must run these sealed digests"
    >
      replay in S4 →
    </Link>
  );
}

function RetainedFreezeBody({
  freeze,
  identity,
  verify,
  onVerify,
  evaluate,
  onEvaluate,
  executeHref,
  runId,
  workspaceId,
}: {
  runId: string;
  workspaceId?: string;
  executeHref: string | null;
  freeze: RetainedFreeze;
  identity: RunIdentitySlot;
  verify: VerifySlot;
  onVerify: () => void;
  evaluate: WhatIfEvaluateSlot;
  onEvaluate: (gridKey: string) => void;
}) {
  const known = identity.state === "ready" ? identity.identity : null;
  return (
    <div className="flex flex-col gap-3" data-lane="retained">
      <RetainedOrdering identity={known} ordering={(freeze as { fold_ordering?: FoldOrdering }).fold_ordering ?? null} />
      <FoldSelectionPanel ordering={(freeze as { fold_ordering?: FoldOrdering }).fold_ordering ?? null} />
      {/* The full source lifecycle audit (read on request) rides with the fold ordering that names each fold's child. */}
      {(freeze as { fold_ordering?: FoldOrdering }).fold_ordering ? <ChildAuditCompanionPanel runId={runId} workspaceId={workspaceId} /> : null}
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* D13: the what-if sits under the frozen θ* in the left column, so the two columns end together instead of leaving the left one empty. */}
        <div className="flex min-w-0 flex-col gap-3" data-column="left">
          <RetainedFrozenTable freeze={freeze} identity={known} />
          <WhatIfCard
            whatIf={isWhatIf(freeze.what_if) ? freeze.what_if : null}
            inert={{ state: String((freeze.what_if as { state?: unknown } | undefined)?.state ?? "NOT_PUBLISHED"), reason_code: ((freeze.what_if as { reason_code?: string | null } | undefined)?.reason_code) ?? null }}
            evaluate={evaluate}
            onEvaluate={onEvaluate}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3" data-column="right">
          {/* E2c (7.9): the chain the hi-fi draws, above the custody receipt it is verified by. */}
          <DigestChain chain={retainedDigestChain(freeze)} verifyLabel={verifyChainLabel(verify)} />
          <RetainedIntegrity freeze={freeze} verify={verify} onVerify={onVerify} />
          {freeze.stage4_binding ? (
            <ServedStage4Binding binding={freeze.stage4_binding} authority={freeze.parameter_authority ?? null} />
          ) : null}
          <ExecuteLink href={executeHref} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

export interface FreezeScreenProps {
  runId: string;
  detail: FreezeDetailDocument | null;
  state: ResearchState;
  cursor: EvidenceCursor;
  verify: VerifySlot;
  onVerify: () => void;
  retained: RetainedSlot;
  ensureRetained: () => void;
  onReread: () => void;
  /** W3b: the run identity a retained answer is read against (schedule, folds, readiness). */
  identity?: RunIdentitySlot;
  /** A10c: the one explicit "evaluate grid" action (retained WFO lane only). */
  whatIfEvaluate?: WhatIfEvaluateSlot;
  onWhatIfEvaluate?: (gridKey: string) => void;
  /**
   * Hub tab (Screen 04, Stage 3): the same body without this screen's own
   * frame, breadcrumb, title and header actions — the hub draws those.
   */
  embedded?: boolean;
  /** Optional workspace the child-audit companion read is scoped to (the personal workspace when absent). */
  workspaceId?: string;
}

export function FreezeScreen({
  runId,
  detail,
  state,
  cursor,
  verify,
  onVerify,
  retained,
  ensureRetained,
  onReread,
  identity = { state: "idle" },
  whatIfEvaluate = { state: "idle" },
  onWhatIfEvaluate = () => undefined,
  embedded = false,
  workspaceId,
}: FreezeScreenProps) {
  /* W3b: the hub delegated this run and the retained lane answered — read it from there. */
  const lane = readsRetainedLane(detail, retained) ? retained.freeze : null;
  /* While the delegated lane is still reading (or refused), the hub's own
     NOT_APPLICABLE body describes the hub, not this run: it is not drawn. */
  const handedOff = hubDelegates(detail) && retained.state !== "not-applicable";
  const freeze = lane === null && !handedOff ? detail?.freeze : undefined;
  const blocked = freeze?.integrity.state === "BLOCKED";
  /* A10a: the newest byte answer — this verify's own, else the read's receipt. */
  const bytes: ArtifactBytes | null =
    (verify.state === "done"
      ? verify.verification.artifact_bytes
      : lane !== null
        ? lane.byte_verification
        : detail && !handedOff
          ? detail.artifact_bytes
          : null) ?? null;

  return (
    <div
      className={embedded ? "flex w-full min-w-0 flex-col gap-[14px]" : `${SCREEN_FRAME} max-w-[1440px]`}
      data-screen="freeze-detail"
      data-run={runId}
      data-embedded={embedded ? "hub" : undefined}
    >
      {embedded ? null : (
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" style={{ color: "var(--ink-soft)" }}>
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/evidence`, { ...cursor, stage: "freeze" })}
          style={{ color: "var(--accent)" }}
          data-action="back-to-hub"
        >
          Evidence Flow
        </Link>
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <ShortId id={runId} label="run" />
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <span style={{ color: "var(--ink)" }}>
          Stage 3 · Freeze
        </span>
        <span style={{ color: "var(--ink-faint)" }}>·</span>
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/search`, { ...cursor, stage: "search" })}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-action="back-to-search"
        >
          ← S2 Search
        </Link>
        <span style={{ color: "var(--ink-faint)" }}>·</span>
        {/* P17 · spec 08 §1 inbound "07 next-stage". */}
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/execute`, { ...cursor, stage: "execute" })}
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-action="next-execute"
        >
          next: S4 Execute →
        </Link>
        {identity.state === "ready" && identity.identity.progress?.run?.alpha?.alpha_id ? (
          <>
            <span style={{ color: "var(--ink-faint)" }}>·</span>
            {/* Spec 07 outbound "attempt → 10": this run inside its alpha's attempt lineage. */}
            <LineageLink
              to={lineageHref(identity.identity.progress.run.alpha.alpha_id, {
                av: identity.identity.progress.run.alpha.alpha_version_id,
              })}
              className="mono text-[10px]"
              action="open-lineage"
            >
              attempt lineage →
            </LineageLink>
          </>
        ) : null}
      </nav>
      )}

      <StageRunBar runId={runId} active={retained.state === "refused" && retained.laneState != null} />

      {bytes && bytesBlock(bytes) ? <BlockedBanner bytes={bytes} /> : null}

      {embedded ? null : (
      <>
      <div className="flex flex-col gap-[3px]">
        <h1 className="text-[22px] font-light tracking-[-0.01em] [line-height:normal]" style={{ fontFamily: "var(--font-display)" }}>
          S3 · Freeze — ordering &amp; integrity
        </h1>
      </div>
      {/* E2: the HiFi header actions — copy the evidence link, and propose a new attempt from this run (spec 07 F2), independent of the what-if flag. */}
      <div className="flex flex-wrap items-center gap-3" data-header-actions>
        <CopyEvidenceLink />
        <Link
          to={`/research/quantbt/runs/new?from=${encodeURIComponent(runId)}`}
          className="mono text-[10px] uppercase tracking-[.06em]"
          style={{ color: "var(--accent)" }}
          data-action="propose-new-attempt"
        >
          propose new attempt →
        </Link>
      </div>
      </>
      )}

      {/* F2: an imported alpha's served identity; a built-in alpha publishes none, so nothing is drawn. */}
      {detail && freeze ? <ImportedAlphaLine binding={detail.imported_alpha} /> : null}

      {detail && freeze ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border px-3.5 py-2"
          data-freeze-strip={freeze.source_profile.state}
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        >
          <Chip data-source-profile={freeze.source_profile.state} tone="var(--accent)" border="var(--accent)">
            {freeze.source_profile.state.toLowerCase().replace(/_/g, " ")}
          </Chip>
          <span className="flex items-baseline gap-1.5" data-selection-state={freeze.selection.state}>
            <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              selection
            </span>
            <span className="mono text-[10px]">{freeze.selection.state.toLowerCase().replace(/_/g, " ")}</span>
          </span>
          {/* The contract's readiness, which this screen never showed. */}
          <Chip data-readiness={detail.readiness}>readiness {detail.readiness.toLowerCase()}</Chip>
          <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
            {detail.revision && !handedOff ? <span title={detail.revision} data-freeze-revision>revision {shortId(detail.revision)} · </span> : null}
            as of {iso(detail.as_of_utc_ms)}
          </span>
        </div>
      ) : lane !== null ? (
        <RetainedStrip freeze={lane} identity={identity} />
      ) : null}

      {lane !== null ? (
        <ProvenanceStrip
          provenance={{
            source_adapter_id: lane.provenance.source_adapter_id,
            engine_version: lane.provenance.engine_version,
            source_transform_digest: lane.provenance.source_transform_digest,
            requested_spec_digest: lane.provenance.requested_spec_digest,
            effective_spec_digest: lane.provenance.effective_spec_digest,
            dataset_binding_digest: lane.provenance.dataset_binding_digest,
            manifest_digest: lane.provenance.source_manifest_digest,
          }}
        />
      ) : detail && !handedOff ? (
        <ProvenanceStrip provenance={detail.provenance} />
      ) : null}

      {/* E2b (audit X4): S05 wraps its cards in a plain panel; the HiFi has no outer FREEZE card here either. */}
      <ResearchPanel
        title="freeze"
        variant="plain"
        meta={
          lane !== null ? (
            <span title={lane.revision ?? undefined}>retained lane · profile {lane.provenance.profile_id}</span>
          ) : detail?.revision && !handedOff ? (
            `revision ${shortId(detail.revision)}`
          ) : undefined
        }
        state={state}
        minBodyHeight={240}
        recovery={
          state.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread freeze
            </button>
          ) : undefined
        }
      >
        {detail && freeze ? (
          <div className="flex flex-col gap-3">
            <section
              className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
              data-panel="ordering"
              data-ordering-state={freeze.ordering.state}
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  ordering
                </h2>
                {/*
                  * `NOT_ASSERTED` is not a failed causality check and not a
                  * passed one. No verdict chip is drawn for it at all.
                  */}
                <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={freeze.ordering.reason_code}>
                  {freeze.ordering.state.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
              <Gap gap={freeze.ordering.wall_clock} what="wall clock ordering" />
              <div className="flex flex-col gap-1.5" data-data-time={freeze.ordering.data_time.state}>
                <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  data time{" "}
                  {freeze.ordering.data_time.chronology_kind !== null
                    ? `· ${freeze.ordering.data_time.chronology_kind.toLowerCase().replace(/_/g, " ")}`
                    : ""}
                </span>
                <DataTimeAxis
                  windows={[
                    { label: "IS", window: freeze.ordering.data_time.is },
                    { label: "outer OOS", window: freeze.ordering.data_time.outer_oos },
                    { label: "holdout", window: freeze.ordering.data_time.holdout },
                  ]}
                />
                <WindowRow window={freeze.ordering.data_time.is} label="IS" />
                <WindowRow window={freeze.ordering.data_time.outer_oos} label="outer OOS" />
                <WindowRow window={freeze.ordering.data_time.holdout} label="holdout" />
              </div>
            </section>

            {/* Hi-fi F2 beside F3/F4 at laptop width; stacked below it. */}
            <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-3" data-column="left">
              <section
                className="flex min-w-0 flex-col gap-2 rounded-[8px] border px-4 py-3"
                data-panel="frozen-parameters"
                style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                    frozen parameters
                  </h2>
                  {freeze.selection.parameter_bundle_digest !== null ? (
                    <>
                      <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-bundle-digest>
                        bundle {freeze.selection.parameter_bundle_digest}
                      </span>
                      <CopyThetaDigest digest={freeze.selection.parameter_bundle_digest} />
                    </>
                  ) : null}
                </div>
                <FrozenParameters parameters={freeze.frozen_parameters} blocked={blocked} />
                {/*
                  * There is no selection artifact and no selected trial. Saying
                  * so here, beside the parameters, stops the table reading as
                  * "the winner of something".
                  */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  <Gap gap={freeze.selection.strict_outer_oos} what="strict outer OOS" />
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-selection-refs>
                    selection artifact · trial · sequence — none published
                  </span>
                </div>
              </section>
              {/* D12/D13: the what-if card (here the fixed hub's single "not applicable" block) fills the left column's tail. */}
              <WhatIfCard whatIf={null} inert={{ state: freeze.what_if.state, reason_code: freeze.what_if.reason_code }} />
            <section
              className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
              data-panel="inspection"
              data-inspection-state={freeze.inspection.state}
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                fold inspection
              </h2>
              <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                {freeze.inspection.requested_fold === null
                  ? "no fold requested"
                  : `fold ${freeze.inspection.requested_fold} requested`}
              </p>
              <Withheld availability={freeze.inspection.availability} />
            </section>
              </div>

              <div className="flex min-w-0 flex-col gap-3" data-column="right">
                {/* E2c (7.9): the chain the hi-fi draws, above the integrity card it is verified by. */}
                <DigestChain chain={hubDigestChain(detail)} verifyLabel={verifyChainLabel(verify)} />
                <IntegrityPanel integrity={freeze.integrity} bytes={detail.artifact_bytes} verify={verify} onVerify={onVerify} />
                {detail.stage4_binding ? (
                  <ServedStage4Binding binding={detail.stage4_binding} authority={detail.parameter_authority ?? null} />
                ) : (
                  <Stage4Binding bundleDigest={freeze.selection.parameter_bundle_digest} />
                )}
                {embedded ? null : <ExecuteLink href={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/execute`, { ...cursor, stage: "execute" })} />}
              </div>
            </div>


            <RetainedPanel slot={retained} onNeeded={ensureRetained} />

            {Object.keys(detail.source_absences).length > 0 ? (
              /* D12: these gaps are already stated by the cards above; kept one click away, not repeated. */
              <details className="rounded-[8px] border px-4 py-2" data-source-absences style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}>
                <summary className="mono cursor-pointer text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  source gaps · {Object.keys(detail.source_absences).length}
                </summary>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-2">
                  {Object.entries(detail.source_absences).map(([name, gap]) => (
                    <Gap key={name} gap={gap} what={name.replace(/_/g, " ")} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : lane !== null ? (
          <RetainedFreezeBody
            runId={runId}
            workspaceId={workspaceId}
            freeze={lane}
            identity={identity}
            verify={verify}
            onVerify={onVerify}
            evaluate={whatIfEvaluate}
            onEvaluate={onWhatIfEvaluate}
            executeHref={embedded ? null : deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/execute`, { ...cursor, stage: "execute" })}
          />
        ) : null}
      </ResearchPanel>
    </div>
  );
}
