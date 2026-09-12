/**
 * The four cross-cutting blocks the `compositions/*` routes carry.
 *
 * Goal 9. Four screens have a composition route that returns their own payload
 * plus per-profile source health, a redacted command journal, the canary twin
 * comparison and the command authority. Only the Admin Action Drawer read one,
 * and even it rendered two of the four inline — so source health and the twin
 * comparison were fetched on every one of those screens and shown on none.
 *
 * These live here rather than in each screen because the blocks say the same
 * thing wherever they appear: the authority is why the controls are dark, and
 * that answer must not drift between the drawer and the queue.
 */
import type { ReactNode } from "react";
import { PanelState } from "./states";
import { sourceTone } from "../sourceTone";
import { utcStamp } from "../time";
import { soonReason } from "../soon";
import type { CommandAuthority, OperationalComposition } from "../operationalComposition";

/**
 * Why every mutation control on this screen is dark.
 *
 * `FAIL_CLOSED` with the relay inactive is the reason, and §3.5 requires the
 * control to be present and to say why — a disabled button with no sentence
 * beside it is the half of that rule people forget.
 */
export function CommandAuthorityLine({ authority, relayState }: { authority: CommandAuthority | null; relayState?: string | null }) {
  const open = authority?.state === "OPEN";
  return (
    <p className="exec-cli-hint" data-tone={open ? "good" : "warn"}>
      <b>Command authority: {authority?.state ?? "not stated"}</b>
      {relayState ? ` · relay ${relayState}` : ""}
      {authority ? ` · relay ${authority.relayActive === null ? "state not published" : authority.relayActive ? "active" : "inactive"}` : ""}
      {" — "}
      {open
        ? "a CONNECTED task can be run through plan → apply → verify"
        /*
         * "no command can be run" was too wide, and the Admin Action Drawer
         * proved it: the relay was closed while four R0 read tasks were
         * runtime-active, and that screen offered a control that ran one. The
         * relay governs *change*, not reading. This line has no task counts of
         * its own, so it says only the part it can stand behind.
         */
        : "no command can change anything from this Portal until the relay is opened; what is listed is what would run"}
    </p>
  );
}

/** What has actually been run, as the source redacted it. */
export function CommandJournal({ journal }: { journal: OperationalComposition["journal"] | null }) {
  return (
    <details className="exec-cli-published">
      <summary>
        Command journal — {journal ? `${journal.rows.length} redacted entries · ${journal.state ?? "state not stated"}` : "not read"}
      </summary>
      {journal && journal.rows.length > 0 ? (
        <div className="exec-scroll-x">
          <table className="exec-360-sync" aria-label="Redacted command journal">
            <thead>
              <tr><th scope="col">when (UTC)</th><th scope="col">actor</th><th scope="col">command</th><th scope="col">outcome</th><th scope="col">detail</th></tr>
            </thead>
            <tbody>
              {journal.rows.slice(0, 100).map((row, index) => (
                <tr key={`${row.at ?? index}-${row.command ?? index}`}>
                  <td className="exec-num">{row.at ? utcStamp(row.at) : <span className="exec-gate-unverified">no clock published</span>}</td>
                  {/* The journal is redacted by contract and carries no actor on
                      most lanes. Saying so beats a blank cell, which reads as an
                      unattributed command. */}
                  <td>{row.actor ?? <span className="exec-gate-unverified">actor redacted</span>}</td>
                  <td>{row.command ?? "not published"}</td>
                  <td data-tone={sourceTone(row.outcome) ?? undefined}>{row.outcome ?? <span className="exec-role-meta">outcome not published</span>}</td>
                  <td className="exec-role-meta">{row.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journal.retention ? <p className="exec-role-meta">retention · {journal.retention}</p> : null}
        </div>
      ) : (
        <PanelState
          status={journal ? "empty" : "unavailable"}
          reason={journal
            ? `The journal answered with no entry${journal.reasonCode ? ` · ${journal.reasonCode}` : ""}.`
            : "The composition that carries the journal has not been read."}
        />
      )}
    </details>
  );
}

/** Every profile's source health on one line, in the source's own words. */
export function SourceHealthStrip({ sourceHealth }: { sourceHealth: OperationalComposition["sourceHealth"] | null }) {
  const profiles = sourceHealth?.profiles ?? [];
  if (profiles.length === 0) {
    return <PanelState status="unavailable" reason="No per-profile source health was published with this screen." />;
  }
  return (
    <div className="exec-scroll-x">
      <table className="exec-360-sync" aria-label="Source health by profile">
        <thead><tr><th scope="col">profile</th><th scope="col">state</th><th scope="col">reason</th></tr></thead>
        <tbody>
          {profiles.map((row) => (
            <tr key={row.profile}>
              <th scope="row">{row.profile}</th>
              <td data-tone={sourceTone(row.state) ?? undefined}>{row.state ?? "not stated"}</td>
              {/* A source gap is a schedule, not a fault: soonReason keeps the
                  code and lets the shared vocabulary decide the wording. */}
              <td className="exec-role-meta">{row.reasonCode ? soonReason(row.reasonCode) ?? row.reasonCode : "no reason published"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Whether the canary twin can be compared against live at all. */
export function CanaryTwinNote({ canaryTwin }: { canaryTwin: OperationalComposition["canaryTwin"] | null }) {
  if (!canaryTwin) {
    return <PanelState status="unavailable" reason="No canary twin comparison was published with this screen." />;
  }
  if (canaryTwin.state === "AVAILABLE") {
    return <p className="exec-role-meta">Canary twin comparison · {canaryTwin.state}</p>;
  }
  return (
    <PanelState
      status="unavailable"
      reason={canaryTwin.reasonCode ?? "The canary twin comparison is not qualified for this profile."}
    />
  );
}

/**
 * All four blocks, for a screen that wants the evidence without arranging it.
 *
 * The journal stays in its own `details` because it is a hundred rows; the
 * other three are short enough to read at a glance and are the answer to "why
 * is this dark", which should not need opening.
 */
export function CrossEvidence({
  composition,
  label = "Cross-cutting evidence",
  extra,
}: {
  composition: OperationalComposition | null;
  label?: string;
  extra?: ReactNode;
}) {
  return (
    <section className="exec-gate-panel" aria-label={label}>
      <div className="exec-tile-title">{label}</div>
      <CommandAuthorityLine authority={composition?.commandAuthority ?? null} />
      {extra}
      <div className="exec-tile-title">Source health by profile</div>
      <SourceHealthStrip sourceHealth={composition?.sourceHealth ?? null} />
      <div className="exec-tile-title">Canary twin</div>
      <CanaryTwinNote canaryTwin={composition?.canaryTwin ?? null} />
      <CommandJournal journal={composition?.journal ?? null} />
      {composition?.compositeRevision ? (
        <p className="exec-role-meta">composite revision · <span className="exec-num">{composition.compositeRevision.slice(0, 16)}</span></p>
      ) : null}
    </section>
  );
}
