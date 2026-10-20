/**
 * Command confirmation, receipt and status: the FIXTURE story page (UXM-09, flag key `command`, OFF by default).
 *
 * EVERYTHING ON THIS PAGE IS A FIXTURE. The port is a scripted fake that never reaches a network (`fakePort.ts`); the real send path is
 * disabled with its reason (`Command sends are not connected to a source: UXM-09 fixture`); no capability, grant or source is read or
 * changed. A passing story is composition evidence for the screen states, not proof that a command was ever accepted by anything.
 *
 * Mount contract (the integrator wires it; nothing in this lane does): default export, rendered inside the Router, behind
 * the `command` flag key, which answers false while it is pending (`EXEC_V2_PENDING_KEYS`). Props are all optional:
 *   - `catalogue`: an already-read `CommandCatalogue` (tests pass the canonical file); or
 *   - `api`: an `ExecutionApi` whose `getCommandCatalogue()` is read once, on mount (a read, never a write);
 *   - `port`: a command port; the default is the scripted fake.
 *
 * Sections: fixture controls (family and scripted answer) -> the flow (plan, typed confirmation, receipt) -> the real send path
 * (disabled) -> receipt lookup -> every operation that is not sendable -> trading flows that need their own certification.
 *
 * Scale and degradation (evidence/UXM-09/README.md):
 *
 * | cardinality | break point | degradation | server contract | invariant | perf budget |
 * |---|---|---|---|---|---|
 * | catalogue 64 entries (schema max 64) + 8 capital operations + 6 families; one plan; blockers/warnings up to 128 each | a catalogue larger than 64 cannot arrive (`total_entries` const 64); 128 blockers print as a list | groups are collapsed `<details>`; blockers are a plain list | none new; lookup by command key/idempotency key is not published (FE-032) | no operation is enabled by being listed; a gap says `Not published (FE-xxx)` | one catalogue read on mount; no polling; no effect calls the command port |
 */
import { useEffect, useMemo, useState } from "react";

import type { CommandCatalogue } from "../../../adminCatalog";
import type { ExecutionApi } from "../../../api/ports";
import { SectionPanel } from "../../blocks";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { Certification } from "./Certification";
import { CommandFlow } from "./CommandFlow";
import { DisabledOperations } from "./DisabledOperations";
import { createFakeCommandPort } from "./fakePort";
import { formatUtcEpochMs } from "../../../screenDataContract";
import type { CommandPort, Lane } from "./port";
import { SEND_DISABLED_REASON } from "./port";
import { ACCESS_HREF } from "./ReceiptPanel";
import { StatusLookup } from "./StatusLookup";
import {
  CAPITAL_INTENT,
  COMMAND_ID_APPLIED,
  COMMAND_ID_DELIVERY_UNKNOWN,
  COMMAND_ID_LANDED,
  COMMAND_ID_REJECTED,
  COMMAND_ID_REVOKED,
  COMMAND_ID_UNVERIFIED,
  F0_OPERATION_BODY,
  SCENARIOS,
  STORY_NOW_MS,
  scenarioById,
  type ScenarioId,
} from "./storyData";

import "../../css/command.css";

export const COMMAND_SCREEN_KEY = "command" as const;

export interface CommandStoryProps {
  /** Reads the command catalogue once, on mount. Ignored when `catalogue` is given. */
  api?: Pick<ExecutionApi, "getCommandCatalogue">;
  catalogue?: CommandCatalogue | null;
  /** Overrides the scripted fake (a test). Never a connected port: this lane has none. */
  port?: CommandPort;
  initialScenario?: ScenarioId;
}

const LANES: readonly { lane: Lane; label: string; note: string }[] = [
  { lane: "F0", label: "F0 command (published bodies)", note: "The plan, operation and denial are the published fixtures. Apply is always denied while the relay is disabled." },
  { lane: "CAPITAL", label: "Capital command (synthetic TEST_ONLY)", note: "A schema-valid preview and statuses built from the published vocabulary. Not a product receipt." },
];

const LOOKUP_IDS: readonly [string, string][] = [
  [F0_OPERATION_BODY.operation_id, "an F0 operation, blocked"],
  [COMMAND_ID_LANDED, "a command, acknowledged, business unknown"],
  [COMMAND_ID_APPLIED, "a command, applied, projection catching up, venue pending"],
  [COMMAND_ID_DELIVERY_UNKNOWN, "a command whose delivery has settled to acknowledged"],
  [COMMAND_ID_REJECTED, "a command the source rejected"],
  [COMMAND_ID_REVOKED, "access revoked (403)"],
  [COMMAND_ID_UNVERIFIED, "a receipt that cannot be verified (503)"],
];

export default function CommandStoryPage({ api, catalogue, port, initialScenario = "f0-denied" }: CommandStoryProps) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(initialScenario);
  const lane = scenarioById(scenarioId).lane;
  const scenario = scenarioById(scenarioId);
  const fake = useMemo(() => createFakeCommandPort({ scenario: initialScenario }), [initialScenario]);
  const active: CommandPort = port ?? fake;
  const [read, setRead] = useState<CommandCatalogue | null>(catalogue ?? null);

  // The scripted answer follows the select. Setting it is a plain assignment; no port method is called.
  fake.setScenario(scenarioId);

  useEffect(() => {
    if (catalogue !== undefined || api === undefined) return;
    let live = true;
    void api.getCommandCatalogue().then((result) => {
      if (live && result.ok) setRead(result.value);
    });
    return () => {
      live = false;
    };
  }, [api, catalogue]);
  const shown = catalogue !== undefined ? catalogue : read;
  const now = useMemo(() => () => STORY_NOW_MS, []);

  return (
    <div className="exec-cf-page" data-screen="command-fixture-v2">
      <header className="exec-cf-mast">
        <h1 className="exec-cf-title">Command confirmation</h1>
        <p className="exec-cf-sub">UXM-09 fixture · plan, typed confirmation, receipt and status</p>
        <p className="exec-cf-banner" role="note">
          <Flag kind="display" label="Fixture only" />
          <span>Nothing here reaches a network or a source. The answers are scripted, and no command is ever sent.</span>
        </p>
      </header>

      <SectionPanel title="Fixture controls" level={2}>
        <div className="exec-cf-body-wrap">
          <fieldset className="exec-cf-fields exec-cf-lanes">
            <legend className="exec-cf-label">Command family</legend>
            {LANES.map((entry) => (
              <label key={entry.lane} className="exec-cf-radio">
                <input
                  type="radio"
                  name="exec-cf-lane"
                  checked={lane === entry.lane}
                  onChange={() => setScenarioId(SCENARIOS.find((s) => s.lane === entry.lane)!.id)}
                />
                <span>{entry.label}</span>
                <span className="exec-cf-meta">{entry.note}</span>
              </label>
            ))}
          </fieldset>
          <div className="exec-cf-fld">
            <label htmlFor="exec-cf-scenario" className="exec-cf-label"><span>Scripted answer</span></label>
            <select id="exec-cf-scenario" className="exec-cf-control" value={scenarioId} aria-describedby="exec-cf-scenario-sum" onChange={(e) => setScenarioId(e.target.value as ScenarioId)}>
              {SCENARIOS.filter((s) => s.lane === lane).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <p id="exec-cf-scenario-sum" className="exec-cf-meta">{scenario.summary}</p>
          </div>
          <p className="exec-cf-meta" data-notice="restart">Choosing another scripted answer starts the flow over.</p>
          <p className="exec-cf-meta" data-notice="clock">Fixture clock: {formatUtcEpochMs(STORY_NOW_MS)}. A plan's expiry is judged against it, not against real time.</p>
        </div>
      </SectionPanel>

      <SectionPanel title="Confirm a command" level={2}>
        <div className="exec-cf-body-wrap">
          <CommandFlow key={scenarioId} port={active} lane={lane} capital={CAPITAL_INTENT} now={now} />
        </div>
      </SectionPanel>

      <SectionPanel title="Real send path" level={2}>
        <div className="exec-cf-body-wrap">
          <DockAction label="Send to the Trading System" reason={SEND_DISABLED_REASON} accessHref={ACCESS_HREF} />
        </div>
      </SectionPanel>

      <SectionPanel title="Look up a receipt" level={2}>
        <div className="exec-cf-body-wrap">
          <StatusLookup port={active} />
          <details className="exec-cf-group">
            <summary>Fixture ids to try</summary>
            <ul className="exec-cf-list">
              {LOOKUP_IDS.map(([id, text]) => <li key={id}><span className="exec-cf-id">{id}</span> <span className="exec-cf-meta">{text}</span></li>)}
              <li><span className="exec-cf-meta">Any other id is answered 404: an unknown receipt and one you may not read look the same.</span></li>
            </ul>
          </details>
        </div>
      </SectionPanel>

      <DisabledOperations catalogue={shown} />
      <Certification />
    </div>
  );
}
