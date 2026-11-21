/**
 * The command confirmation flow: plan, typed confirmation, one send, a receipt. Fixture lane (UXM-09).
 *
 * Mount contract: `port` is the only thing it talks to. A `fixture` port answers from a script and never reaches a network; the
 * `DISABLED_PORT` answers nothing and the flow does not call it: Submit stays closed with the exact reason
 * (`Command sends are not connected to a source: UXM-09 fixture`). There is no connected port in this lane.
 *
 * Keyboard parity with New request: every action is a button, Enter in a field never submits, Submit is aria-disabled (focus stays on
 * it while a send is in flight), a new answer takes focus, and the discard question focuses "Keep the request".
 */
import { StepBar } from "./StepBar";
import { ConfirmPanel } from "./ConfirmPanel";
import { PlanPanel } from "./PlanPanel";
import { ReceiptPanel } from "./ReceiptPanel";
import type { CapitalIntentView } from "./model";
import type { CommandPort, Lane } from "./port";
import { useCommandFlow } from "./useCommandFlow";

import "../../css/command.css";

export interface CommandFlowProps {
  port: CommandPort;
  lane: Lane;
  capital: CapitalIntentView;
  /** The clock a plan's expiry is judged against. The story passes its fixed clock. */
  now?: () => number;
}

export function CommandFlow({ port, lane, capital, now }: CommandFlowProps) {
  const flow = useCommandFlow({ port, lane, capital, now });
  const step: 1 | 2 | 3 = flow.receipt !== null ? 3 : flow.plan.status === "ready" ? 2 : 1;
  return (
    <div className="exec-cf-flow" data-lane={lane} data-port={port.kind}>
      <StepBar current={step} />
      <PlanPanel flow={flow} />
      <ConfirmPanel flow={flow} />
      <ReceiptPanel flow={flow} />
    </div>
  );
}
