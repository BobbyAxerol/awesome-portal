/**
 * Every operation that is not published as sendable, as a DISABLED control with the exact reason.
 *
 * Three sources, none of them invented here:
 *   - the 64 entries of the command catalogue (`portal_reachable` is false on every one; the reason is the entry's own `blocked_reason`);
 *   - the eight capital operations the bridge supports technically and the source has not qualified;
 *   - the families the source has not admitted (the ELP2-07 coverage table).
 *
 * "The capability that would enable it" is shown only when one is PUBLISHED: the staged-activation key of the tier (`COMMAND_R1` to
 * `COMMAND_R4`), and only for an entry blocked by the relay itself. For a route the source does not publish no capability helps, and the
 * row says so. The Portal grant has no published name, so it is `provisional (FE-037)`, never a made-up one.
 *
 * The control is `DockAction`: a disabled button that carries its reason (`aria-describedby`). No row has a handler.
 */
import { DockAction } from "../../Drawer";
import { SectionPanel } from "../../blocks";
import { CAPITAL_OPERATION_ROWS, EXCLUDED_FAMILY_ROWS, GRANT_NAME_NOTE, catalogueRows, type CatalogueView, type DisabledRow } from "./model";
import { ACCESS_HREF } from "./ReceiptPanel";

import "../../css/command.css";

function Row({ row }: { row: DisabledRow }) {
  const capability = row.capability;
  return (
    <li className="exec-cf-op" data-op={row.id}>
      <div className="exec-cf-op-head">
        <span className="exec-cf-id">{row.label}</span>
        {row.tier !== null ? <span className="exec-cf-meta">{row.tier}</span> : null}
        {row.code !== null ? <span className="exec-cf-mono exec-cf-meta">{row.code}</span> : null}
      </div>
      <DockAction label={`Send ${row.label}`} reason={row.reason} accessHref={ACCESS_HREF} />
      <p className="exec-cf-meta" data-capability={capability.kind} title={capability.kind === "staged_activation" ? `Would be enabled by the staged-activation capability ${capability.key} once the relay is qualified. ${GRANT_NAME_NOTE}` : `${capability.because} ${GRANT_NAME_NOTE}`}>
        {capability.kind === "staged_activation"
          ? <>Needs <span className="exec-cf-id">{capability.key}</span></>
          : <>{capability.because}</>}
      </p>
    </li>
  );
}

export function DisabledOperations({ catalogue }: { catalogue: CatalogueView | null }) {
  const groups = catalogue === null ? [] : catalogueRows(catalogue);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <SectionPanel title="Operations that are not sendable" level={2}>
      <div className="exec-cf-body-wrap">
        <p className="exec-cf-meta" data-summary="disabled" title="Each control is disabled and says why.">
          {catalogue === null
            ? "The command catalogue has not been read, so its operations are not listed."
            : `${total} catalogue commands, ${CAPITAL_OPERATION_ROWS.length} capital operations and ${EXCLUDED_FAMILY_ROWS.length} families. None is sendable.`}
        </p>
        <details className="exec-cf-group" data-group="capital">
          <summary>Capital commands ({CAPITAL_OPERATION_ROWS.length})</summary>
          <ul className="exec-cf-ops">{CAPITAL_OPERATION_ROWS.map((row) => <Row key={row.id} row={row} />)}</ul>
        </details>
        <details className="exec-cf-group" data-group="families">
          <summary>Families the source has not admitted ({EXCLUDED_FAMILY_ROWS.length})</summary>
          <ul className="exec-cf-ops">{EXCLUDED_FAMILY_ROWS.map((row) => <Row key={row.id} row={row} />)}</ul>
        </details>
        {groups.map((group) => (
          <details className="exec-cf-group" key={group.code ?? "none"} data-group={group.code ?? "none"}>
            <summary>{group.label} ({group.rows.length})</summary>
            <ul className="exec-cf-ops">{group.rows.map((row) => <Row key={row.id} row={row} />)}</ul>
          </details>
        ))}
      </div>
    </SectionPanel>
  );
}
