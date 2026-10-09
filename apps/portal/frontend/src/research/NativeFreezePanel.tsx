/**
 * Screen 07 · the frozen selection of a natively searched run (`FreezeDetail.native_freeze`, §55).
 *
 * What it freezes is the parameters the native optimizer selected on its in-sample study, bound to the sealed artifact they were read
 * from. It is not a Walk-forward certificate and says so: that is a typed absence. Two integrity facts are kept apart:
 *   - the PREPARATION check (`native_freeze.integrity`): the manifest, every part and the documents matched when the read was prepared,
 *     at a stated time, with `current_bytes_rechecked = false` — historic proof, not a fresh byte check;
 *   - the BYTE receipt (`artifact_bytes`, and the one an explicit "Verify bytes" returns): the sealed bytes read again now. A mismatch or a
 *     block wins over any earlier match.
 * The preparation manifest digest and the P05 artifact manifest digest name different objects and are never compared here.
 */

import { Absence } from "./Absence";
import type { ArtifactBytes, FreezeDetail, FreezeVerification } from "./freezeClient";
import { humanise } from "./humanise";
import { shortId } from "./researchFormat";
import { iso } from "./utcMinute";

type Native = NonNullable<FreezeDetail["native_freeze"]>;

const CARD = { borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" } as const;
const LABEL = "text-[10px] font-medium uppercase tracking-[.07em]";

const SCOPE_WORDS: Record<string, string> = {
  P05_MANIFEST_ALL_PARTS_AND_DOCUMENTS_AT_PREPARATION: "the sealed manifest, every part and the documents, at preparation",
  P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS: "the sealed manifest, every part and the documents",
  ORIGINAL_CHILD_PARQUET_BYTES_NOT_REWRITTEN_P05_PARTS: "the original child Parquet bytes, not the rewritten P05 parts",
};

function Fact({ id, label, children, title }: { id: string; label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-native-freeze-fact={id} title={title}>
      <dt className={LABEL} style={{ color: "var(--ink-faint)" }}>{label}</dt>
      <dd className="mono m-0 break-words text-[12px]" style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{children}</dd>
    </div>
  );
}

const digest = (value: string) => (
  <span title={value} data-digest={value}>{value.slice(0, 16)}…</span>
);

/** The newest byte answer wins on a bad outcome: any state but MATCH is shown as the verdict, whatever an earlier read said. */
export function byteVerdict(bytes: ArtifactBytes | null): "match" | "mismatch" | "blocked" | "none" {
  if (bytes === null) return "none";
  if (bytes.state === "MATCH") return "match";
  if (bytes.state === "MISMATCH" || bytes.state === "MISSING") return "mismatch";
  return "blocked";
}

export interface NativeFreezePanelProps {
  native: Native;
  /** The byte receipt in hand: this verification's own when the reader just asked, else the read's. */
  bytes: ArtifactBytes | null;
  verifying: boolean;
  verification: FreezeVerification | null;
  /** The screen's own typed refusal sentence when the explicit verification could not run; nothing about the bytes is claimed then. */
  refusal?: React.ReactNode;
  onVerify: () => void;
}

export function NativeFreezePanel({ native, bytes, verifying, verification, refusal = null, onVerify }: NativeFreezePanelProps) {
  const verdict = byteVerdict(bytes);
  const tone = verdict === "match" ? "var(--good)" : verdict === "none" ? "var(--ink-faint)" : "var(--bad)";
  const parameters = Object.entries(native.selected_parameters);
  const prep = native.integrity;
  const evidence = native.selection_evidence ?? null;
  return (
    <section className="flex flex-col gap-3" data-native-freeze={native.selected_trial_number} aria-label="Native freeze">
      <section className="flex flex-col gap-2 rounded-[8px] border px-4 py-3" style={CARD} data-native-freeze-selection>
        <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          Frozen selection
          <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>the parameters the native optimizer selected, sealed with their source</span>
        </h3>
        <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <Fact id="trial" label="selected trial" title="The engine's 0-based trial number and the 1-based display ordinal: two facts.">
            number {native.selected_trial_number} · ordinal {native.selected_trial_ordinal}
          </Fact>
          <Fact id="scope" label="scope">{native.selected_trial_scope === "NATIVE_IS_STUDY" ? "native in-sample study" : humanise(native.selected_trial_scope)}</Fact>
          <Fact id="objective" label="selected objective">{native.selected_objective}</Fact>
          <Fact id="digest" label="parameters digest">{digest(native.selected_parameters_digest)}</Fact>
          <Fact id="profile" label="execution profile" title={`digest ${native.execution_profile.digest}`}>{native.execution_profile.id}</Fact>
          {evidence ? (
            <Fact id="evidence" label="selection evidence" title="Counts the engine retained; neighbour trial identities were not retained.">
              medoid trial {evidence.medoid_trial_number} · plateau score {evidence.plateau_score} · {evidence.neighbor_count} neighbours
            </Fact>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-1.5" data-native-freeze-parameters>
          {parameters.map(([key, value]) => (
            <span key={key} className="mono rounded-[6px] border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} data-freeze-parameter={key} data-exact={value}>
              <span style={{ color: "var(--ink-faint)" }}>{key} </span>
              {value}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-[8px] border px-4 py-3" style={CARD} data-native-freeze-artifact>
        <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          Sealed artifact
          <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>revision {native.artifact.revision}</span>
        </h3>
        <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          <Fact id="manifest" label="artifact manifest digest" title="The P05 artifact's manifest. The preparation manifest is a different object and is not compared with it.">{digest(native.artifact.manifest_digest)}</Fact>
          <Fact id="source-table" label="source table digest" title={SCOPE_WORDS[native.artifact.source_table_digest_scope]}>{digest(native.artifact.source_table_digest)}</Fact>
          <Fact id="source-scope" label="source table covers">{SCOPE_WORDS[native.artifact.source_table_digest_scope] ?? humanise(native.artifact.source_table_digest_scope)}</Fact>
        </dl>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="source parts (scrolls sideways)">
          <table className="w-full min-w-[420px] text-[11px]" data-native-source-parts>
            <thead>
              <tr style={{ color: "var(--ink-faint)", textAlign: "left" }}>
                <th scope="col" className="mono py-1 pr-3 text-[9.5px] font-medium uppercase">part</th>
                <th scope="col" className="mono py-1 pr-3 text-[9.5px] font-medium uppercase">sha-256</th>
                <th scope="col" className="mono py-1 pr-3 text-right text-[9.5px] font-medium uppercase">rows</th>
                <th scope="col" className="mono py-1 text-right text-[9.5px] font-medium uppercase">bytes</th>
              </tr>
            </thead>
            <tbody>
              {native.artifact.source_parts.map((part) => (
                <tr key={part.ordinal} data-source-part={part.ordinal} style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <td className="mono py-[3px] pr-3">{part.ordinal}</td>
                  <td className="mono py-[3px] pr-3">{digest(part.sha256)}</td>
                  <td className="mono py-[3px] pr-3 text-right">{part.rows.toLocaleString("en-US")}</td>
                  <td className="mono py-[3px] text-right">{part.bytes.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-[8px] border px-4 py-3" style={{ ...CARD, borderColor: verdict === "mismatch" || verdict === "blocked" ? "var(--bad)" : "var(--line)" }} data-native-freeze-integrity data-byte-verdict={verdict}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>Integrity</h3>
          <button type="button" className="btn-ghost no-print mono ml-auto text-[10px]" data-action="verify" onClick={onVerify} disabled={verifying} title={verifying ? "a verification is already in flight" : "read the sealed artifact bytes again now and record a receipt"}>
            {verifying ? "verifying…" : "Verify bytes"}
          </button>
        </div>
        <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          <Fact id="preparation" label="at preparation" title={SCOPE_WORDS[prep.verification_scope]}>
            <span data-prep-state={prep.state}>{humanise(prep.state)}</span> · {iso(prep.checked_at_utc_ms)}
          </Fact>
          <Fact id="preparation-scope" label="that check covered">{SCOPE_WORDS[prep.verification_scope] ?? humanise(prep.verification_scope)}</Fact>
          <Fact id="rechecked" label="bytes re-read since">
            <span data-current-bytes-rechecked={String(prep.current_bytes_rechecked)}>{prep.current_bytes_rechecked ? "yes" : "no — historic proof, not a fresh check"}</span>
          </Fact>
          <Fact id="identity" label="selected trial · parameters digest">
            {prep.selected_identity_match ? "trial matches" : "trial differs"} · {prep.selected_parameter_digest_match ? "digest matches" : "digest differs"}
          </Fact>
          <Fact id="bytes" label="byte receipt">
            {bytes === null ? (
              <Absence reason={null} state="NOT_PUBLISHED" />
            ) : (
              <span style={{ color: tone }} data-byte-state={bytes.state} title={bytes.receipt_id ?? undefined}>
                {humanise(bytes.state)}
                {bytes.verified_at_utc_ms !== null ? ` · ${iso(bytes.verified_at_utc_ms)}` : ""}
                {` · ${bytes.parts_checked} part${bytes.parts_checked === 1 ? "" : "s"} · ${bytes.documents_checked} documents`}
                {bytes.receipt_id ? ` · ${shortId(bytes.receipt_id, 12)}` : ""}
              </span>
            )}
          </Fact>
          {bytes !== null && bytes.mismatches.length > 0 ? (
            <Fact id="mismatches" label="mismatches">
              <span style={{ color: "var(--bad)" }} data-byte-mismatches={bytes.mismatches.length}>{bytes.mismatches.length} differ</span>
            </Fact>
          ) : null}
          {verification !== null ? (
            <Fact id="verification" label="this verification" title={verification.verification_scope}>
              <span data-verification-result={verification.result}>{humanise(verification.result)}</span> · {iso(verification.verified_at_utc_ms)}
            </Fact>
          ) : null}
        </dl>
        {refusal !== null ? (
          <p className="m-0 text-[11px]" role="alert" style={{ color: "var(--bad)" }} data-verify-refusal>
            {refusal}
          </p>
        ) : null}
        <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          <Fact id="certificate" label="scalar Walk-forward certificate"><Absence reason={native.scalar_wfo_certificate.reason_code} state="NOT_APPLICABLE" /></Fact>
          <Fact id="chronology" label="freeze chronology (wall clock)"><Absence reason={native.chronology.reason_code} state="NOT_PUBLISHED" /></Fact>
        </dl>
      </section>
    </section>
  );
}
