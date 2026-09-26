/**
 * Screen 07 · F4 — binding down to Stage 4, and the θ* digest copy (T10).
 *
 * X2 · B4 (CG-P16-02): the server compares sealed vs replayed params and
 * sealed vs runtime bundle under a named identity rule per lane and says
 * BOUND, DRIFT or NOT_COMPARED. This card prints that verdict and the four
 * rows exactly as served — a tick only where the server says MATCH, a cross
 * only where it says MISMATCH, and the server's reason where a side is
 * missing. CG-P16-03: the parameter authority below the rows says which
 * digest holds declared values and which holds code-fixed ones.
 */

import { useEffect, useState } from "react";

import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";
import { reasonCodeSentence } from "./researchRefusal";
import { shortDigest } from "./researchFormat";

export type Stage4BindingValue = CurrentSourceComponents["schemas"]["Stage4Binding"];
export type ParameterAuthorityValue = CurrentSourceComponents["schemas"]["ParameterAuthority"];
type Row = Stage4BindingValue["rows"][number];

const RULE_WORDS: Record<Row["identity_rule"], string> = {
  QUANTBT_WALKFORWARD_STRATEGY_CANDIDATE_ID_V1: "QuantBT candidate id",
  QUANTBT_STRATEGY_FINGERPRINT_V1: "QuantBT strategy fingerprint",
  SHA256_CANONICAL_PARAMETER_MAP_V1: "sha256 of the canonical parameter map",
  P04_ADAPTER_CONTRACT_DIGEST_V1: "P04 adapter contract digest",
};

const BADGE: Record<Stage4BindingValue["state"], { words: string; tone: string }> = {
  BOUND: { words: "✓ BOUND", tone: "var(--good)" },
  DRIFT: { words: "✕ DRIFT — BLOCKED", tone: "var(--bad)" },
  NOT_COMPARED: { words: "not compared", tone: "var(--ink-faint)" },
};

function mark(state: Row["state"]): { glyph: string; tone: string } {
  if (state === "MATCH") return { glyph: "✓", tone: "var(--good)" };
  if (state === "MISMATCH") return { glyph: "✕", tone: "var(--bad)" };
  return { glyph: "", tone: "var(--ink-faint)" };
}

function valueText(value: string | null): string | null {
  if (value === null) return null;
  return value.length > 24 ? `${shortDigest(value, 12)}…` : value;
}

export function ServedStage4Binding({ binding, authority }: { binding: Stage4BindingValue; authority?: ParameterAuthorityValue | null }) {
  const badge = BADGE[binding.state];
  return (
    <section
      className="flex flex-col gap-[6px] rounded-[8px] border px-[14px] py-[14px]"
      data-panel="stage4-binding"
      data-binding-compared={binding.state === "NOT_COMPARED" ? "false" : "true"}
      data-binding-state={binding.state}
      data-binding-lane={binding.lane}
      style={{ borderColor: binding.state === "DRIFT" ? "var(--bad)" : "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          F4 · binding down to Stage 4
        </h3>
        <span
          role="status"
          className="mono rounded-[3px] border px-1.5 text-[10px] font-bold"
          style={{ color: badge.tone, borderColor: badge.tone, background: binding.state === "DRIFT" ? "var(--bad-bg)" : "transparent" }}
          title={binding.reason_code ?? binding.schema_version}
          data-binding-badge={binding.state}
        >
          {badge.words}
        </span>
      </div>
      <ul className="flex flex-col">
        {binding.rows.map((row) => {
          const tick = mark(row.state);
          const shown = valueText(row.value);
          return (
            <li
              key={row.key}
              className="mono flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-0.5 border-b py-[3px] text-[10.5px] last:border-b-0"
              style={{ borderColor: "var(--line-soft)" }}
              data-binding-row={row.key}
              data-binding-row-state={row.state}
              data-binding-published={row.value === null ? "false" : "true"}
              title={`${RULE_WORDS[row.identity_rule]} · ${row.source_key}${row.value ? ` · ${row.value}` : ""}`}
            >
              <span style={{ color: "var(--ink-faint)" }}>{row.label}</span>
              {shown !== null ? (
                <span className="text-right" style={{ color: tick.tone === "var(--ink-faint)" ? "var(--ink)" : tick.tone }}>
                  {shown}
                  {tick.glyph ? `  ${tick.glyph}` : ""}
                </span>
              ) : row.state === "MISMATCH" ? (
                <span className="text-right" style={{ color: "var(--bad)" }}>
                  differs by fold ✕
                </span>
              ) : (
                <span className="text-right italic" style={{ color: "var(--ink-faint)" }} title={row.reason_code ?? undefined}>
                  not published
                </span>
              )}
              {row.folds.length > 1 || row.folds.some((fold) => fold.state !== "MATCH") ? (
                <span className="flex w-full flex-wrap gap-x-3 text-[9px]" data-binding-folds={row.key}>
                  {row.folds.map((fold) => {
                    const foldMark = mark(fold.state);
                    return (
                      <span
                        key={fold.fold_id}
                        style={{ color: fold.state === "NOT_PUBLISHED" ? "var(--ink-faint)" : foldMark.tone }}
                        title={fold.reason_code ?? (fold.audit_ordinal !== null ? `QuantBT child #${fold.audit_ordinal}` : undefined)}
                        data-binding-fold={fold.fold_id}
                        data-binding-fold-state={fold.state}
                      >
                        fold {fold.fold_id} {fold.value ? fold.value.slice(0, 8) : "—"} {foldMark.glyph}
                      </span>
                    );
                  })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-binding-note>
        {binding.lane === "RS02_RETAINED_CHILD_AUDIT"
          ? "Compared by QuantBT's own identities: the sealed θ*'s candidate id against the candidate each fold's out-of-sample generation child ran, and the strategy fingerprint of the frozen candidate's selection-stage children against the generation child's."
          : "Compared by digest: the registered fixed bundle and adapter contract against what the P04 child executed (its P14 receipt and the run's producer row) — the P04 replay is that child's own tape."}{" "}
        {binding.state === "NOT_COMPARED" && binding.reason_code ? (
          <span data-binding-reason={binding.reason_code}>{reasonCodeSentence(binding.reason_code)} ({binding.reason_code})</span>
        ) : binding.state === "DRIFT" ? (
          <span style={{ color: "var(--bad)" }}>Stage 5 must refuse this run; re-run Execute on the sealed selection or re-seal as a new attempt.</span>
        ) : null}
      </span>
      {authority ? <ParameterAuthorityNote authority={authority} /> : null}
    </section>
  );
}

/** CG-P16-03: which digest holds which kind of parameter. */
function ParameterAuthorityNote({ authority }: { authority: ParameterAuthorityValue }) {
  const fixed = authority.code_fixed;
  return (
    <div className="flex flex-col gap-0.5 border-t pt-1.5 text-[10px] leading-[1.5]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }} data-parameter-authority={fixed.state}>
      <span>
        <span className="mono">{authority.declared.names.length}</span> declared parameters are inside the params digest.
      </span>
      <span>
        Code-fixed values:{" "}
        {fixed.state === "AVAILABLE" ? (
          <span className="mono">{fixed.values.map((value) => `${value.name} = ${value.value}`).join(" · ") || "none"}</span>
        ) : (
          <span className="mono italic" style={{ color: "var(--ink-faint)" }} title={fixed.reason_code ?? undefined} data-code-fixed-reason={fixed.reason_code ?? ""}>
            not published
          </span>
        )}{" "}
        — outside the params digest, covered by the code digest{" "}
        <span className="mono" title={fixed.code_digest ?? undefined}>
          {fixed.code_digest ? `${shortDigest(fixed.code_digest, 8)}…` : "not published"}
        </span>{" "}
        inside the adapter contract{" "}
        <span className="mono" title={fixed.adapter_contract_digest ?? undefined}>
          {fixed.adapter_contract_digest ? `${shortDigest(fixed.adapter_contract_digest, 8)}…` : "not published"}
        </span>
        .
      </span>
    </div>
  );
}

/** Spec 07 T10: copy the θ* digest; confirms only once the clipboard accepted it. */
export function CopyThetaDigest({ digest }: { digest: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [state]);
  return (
    <button
      type="button"
      className="mono rounded-[3px] border bg-transparent px-1.5 text-[9px]"
      style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      title={`copy the full θ* params digest ${digest}`}
      data-action="copy-theta-digest"
      onClick={() => {
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
        if (!clipboard) {
          setState("failed");
          return;
        }
        clipboard.writeText(digest).then(
          () => setState("done"),
          () => setState("failed"),
        );
      }}
    >
      {state === "done" ? "✓ θ* digest copied" : state === "failed" ? "copy unavailable" : "copy θ* digest"}
    </button>
  );
}
