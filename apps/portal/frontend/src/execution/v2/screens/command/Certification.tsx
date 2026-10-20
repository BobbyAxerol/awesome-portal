/**
 * Trading flows that an operation can impact and that need their own certification (UX-F14 to UX-F17), plus the mainnet canary.
 *
 * Every row is a disabled control with the phrase `Requires separate certification`. None of them is ever enabled: no flag, no prop and no
 * port turns one on, and no row has a handler. The mainnet canary never runs from the Portal.
 */
import { DockAction } from "../../Drawer";
import { SectionPanel } from "../../blocks";
import { CERTIFICATION_FLOWS, CERTIFICATION_PHRASE } from "./model";
import { ACCESS_HREF } from "./ReceiptPanel";

import "../../css/command.css";

export function Certification() {
  return (
    <SectionPanel title="Flows that need their own certification" level={2}>
      <div className="exec-cf-body-wrap">
        <ul className="exec-cf-ops" aria-label="Flows that require separate certification">
          {CERTIFICATION_FLOWS.map((flow) => (
            <li className="exec-cf-op" key={flow.id} data-flow={flow.id}>
              <div className="exec-cf-op-head">
                <CaseTag cases={flow.cases} />
              </div>
              <DockAction label={flow.label} reason={`${CERTIFICATION_PHRASE}. ${flow.why}`} accessHref={ACCESS_HREF} />
            </li>
          ))}
        </ul>
      </div>
    </SectionPanel>
  );
}

function CaseTag({ cases }: { cases: readonly string[] }) {
  return <span className="exec-cf-case">{cases.join(", ")}</span>;
}
