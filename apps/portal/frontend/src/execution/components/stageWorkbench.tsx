/**
 * Shared pieces for the stage workbenches (EL-V2-06): the single guard band
 * a Canary/Live page may carry, and the envelope tile every panel renders
 * through. The anatomy itself is the V2-04 Paper anatomy from ./workspace.
 */
import type { PanelStatus } from "../contracts";
import { AuthorityWord, FreshnessIndicator } from "./badges";
import { PanelState } from "./states";

/**
 * Guard band budget: exactly one solid band per page (handoff V2-06
 * supplement). Text + shield + double border — never colour alone.
 */
export function StageGuardBand({ stage, note }: { stage: string; note: string }) {
  return (
    <div className="exec-guard-band" role="note" aria-label="Stage guard">
      <span className="exec-guard-shield" aria-hidden="true">
        ⛨
      </span>
      <strong>{stage}</strong>
      <span className="exec-role-meta exec-guard-note">{note}</span>
    </div>
  );
}

export interface EnvelopeLike {
  authority: string | null;
  panelState: PanelStatus;
  freshness: string | null;
  deliveryProfile: string | null;
  sourceVerification?: string | null;
  asOf?: string | null;
}

/** One source panel: readable, unavailable, or withheld — never an empty success. */
export function SourceTile({
  title,
  envelope,
  suppressed = false,
  warnings = [],
  unavailableReason,
}: {
  title: string;
  envelope: EnvelopeLike | null | undefined;
  suppressed?: boolean;
  warnings?: readonly string[];
  unavailableReason?: string;
}) {
  return (
    <section className="exec-source-tile" aria-label={title} data-suppressed={String(suppressed)}>
      <h3 className="exec-role-section">{title}</h3>
      {!envelope ? (
        <PanelState status="unavailable" reason="This panel was not published in the response." />
      ) : suppressed ? (
        <>
          <PanelState
            status="denied"
            reason="Suppressed by policy: while broker consistency is unverified, no broker-derived value is shown anywhere on this screen."
          />
          <p className="exec-role-meta">The Portal is withholding this, not failing to read it.</p>
        </>
      ) : envelope.panelState === "ok" ? (
        <p className="exec-role-meta">
          Readable · {envelope.authority ?? "authority not stated"}
          {envelope.asOf ? ` · as_of ${envelope.asOf}` : ""}
          {envelope.deliveryProfile ? ` · ${envelope.deliveryProfile}` : ""}
        </p>
      ) : (
        <>
          <PanelState status={envelope.panelState} reason={envelope.panelState === "unavailable" ? unavailableReason : undefined} />
          <p className="exec-role-meta">
            {envelope.authority ? <AuthorityWord authority={envelope.authority as never} /> : null}{" "}
            {envelope.freshness ? <FreshnessIndicator state={envelope.freshness as never} /> : null} profile{" "}
            {envelope.deliveryProfile ?? "not stated"}
            {envelope.sourceVerification !== undefined ? ` · verification ${envelope.sourceVerification ?? "not stated"}` : ""}
          </p>
        </>
      )}
      {warnings.length ? <p className="exec-role-meta">{warnings.join(" · ")}</p> : null}
    </section>
  );
}
