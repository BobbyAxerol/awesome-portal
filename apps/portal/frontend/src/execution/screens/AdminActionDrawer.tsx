/**
 * Phase 6 — Admin Action Drawer (hi-fi 1i, WF 1i, ops dark, no sidebar).
 *
 * IMPLEMENTATION_PHASES says "Depends: Phase 0 only; unlocks all later mutation
 * links", and that is the whole reason this screen exists before the backend
 * catalogue does. Phases 7–12 each link into this drawer; none of them can be
 * built while the thing they link to is missing.
 *
 * Three rules the hi-fi states and this screen enforces structurally rather
 * than by convention:
 *
 *   1. **A read is not a small mutation.** READ selections render no footer at
 *      all — there is no plan, no reason field, no apply button to disable. The
 *      hi-fi's green banner says why: read commands need no admin password and
 *      no step-up, and are safe during an incident.
 *   2. **A blocked command is shown, not hidden.** `NOT EXPOSED IN PORTAL` with
 *      the reason in full. Hiding it teaches the operator the Portal is
 *      complete when it is not, and they discover the gap during an incident.
 *   3. **Every mutation goes through CommandPlanDrawer.** This screen chooses
 *      *which* command; it does not re-implement plan/apply/verify. That
 *      machine — plan gates apply, plan expires, reason required, 202 is not
 *      success, PARTIAL never green — lives in one component so seventeen
 *      screens cannot each drift a little.
 *
 * The catalogue itself is a fixture (`adminCatalog.ts`) until BR-EX-28 lands.
 * `CATALOG_SOURCE` is rendered on screen so that is never ambiguous.
 */
import type { ReactNode } from "react";

import {
  ADMIN_CATALOG,
  CATALOG_SOURCE,
  type CatalogCommand,
  type CatalogGroup,
  type CommandTag,
} from "../adminCatalog";
import { CommandPlanDrawer, type CommandPlan, type DrawerStep, type VerifyEntry } from "../components/drawer";
import type { DeliveryProfile, VerificationResult } from "../contracts";
import type { DeliveryPolicy } from "../profile";
import { ExecutionSurface } from "../ExecutionSurface";

const TAG_LABEL: Record<CommandTag, string> = {
  READ: "READ",
  MUTATION: "MUTATION",
  DANGER: "DANGER",
  BLOCKED: "BLOCKED",
};

/**
 * A row is a button, not a div with onClick.
 *
 * The catalogue is a list of things you activate, and an operator driving this
 * screen from the keyboard during an incident is not an edge case. A div would
 * need role, tabIndex and a key handler bolted on to reach the same place a
 * button reaches for free — and would still lose the native disabled semantics
 * that BLOCKED rows depend on.
 */
function CommandRow({
  command,
  selected,
  onSelect,
}: {
  command: CatalogCommand;
  selected: boolean;
  onSelect: (command: CatalogCommand) => void;
}) {
  return (
    <button
      type="button"
      className="exec-admin-row"
      data-tag={command.tag}
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(command)}
    >
      <span className="exec-admin-rowhead">
        <span className="exec-admin-rowtitle">{command.title}</span>
        <span className="exec-admin-tag" data-tag={command.tag}>
          {TAG_LABEL[command.tag]}
        </span>
        <span className="exec-admin-scope">{command.scope}</span>
      </span>
      <span className="exec-admin-cli">{command.cliShort}</span>
    </button>
  );
}

export function AdminActionCatalog({
  groups = ADMIN_CATALOG,
  selectedId,
  onSelect,
}: {
  groups?: readonly CatalogGroup[];
  selectedId?: string | null;
  onSelect: (command: CatalogCommand) => void;
}) {
  return (
    <div className="exec-admin-catalog">
      <p className="exec-admin-lead">
        every mutation follows PLAN → APPLY (step-up) → VERIFY · pick a command to load it into the drawer →
      </p>
      {groups.map((group) => (
        <section className="exec-admin-group" key={group.name}>
          <h2 className="exec-admin-groupname">{group.name}</h2>
          {group.items.map((command) => (
            <CommandRow
              key={command.id}
              command={command}
              selected={command.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
      <p className="exec-admin-source">{CATALOG_SOURCE}</p>
    </div>
  );
}

/** READ selection: green banner, returns panel, and deliberately no footer. */
function ReadPanel({ command }: { command: CatalogCommand }) {
  return (
    <>
      <div className="exec-admin-read">
        <b>READ-ONLY</b> — no admin password (CLI) · no step-up (web) · safe during incidents
      </div>
      {command.returns ? (
        <div className="exec-admin-returns">
          <h3>Returns</h3>
          <p>{command.returns}</p>
        </div>
      ) : null}
      <p className="exec-admin-nofooter">no mutation footer — nothing to plan or apply</p>
    </>
  );
}

/** BLOCKED selection: the gap, named, with the reason in full. */
function BlockedPanel({ command }: { command: CatalogCommand }) {
  return (
    <div className="exec-admin-blocked" role="note">
      <b>NOT EXPOSED IN PORTAL</b>
      <p>{command.blockedReason}</p>
      <p className="exec-admin-blockedcli">
        Operators run this from the CLI host. The equivalent invocation is shown for audit and
        training only — the browser never runs a shell.
      </p>
      <code>{command.cliShort}</code>
    </div>
  );
}

export interface AdminDrawerFlow {
  plan?: CommandPlan | null;
  step: DrawerStep;
  verifyEntries?: readonly VerifyEntry[];
  outcome?: "VERIFIED" | "PARTIAL" | "FAILED" | null;
  verification?: VerificationResult | null;
  onGeneratePlan?: () => void;
  onApply?: (reason: string) => void;
}

/**
 * Phase 6 screen: catalogue on the left, drawer on the right.
 *
 * `flow` is supplied by the caller rather than owned here because the same
 * screen is driven by fixtures on Lane A and by the decision reducer on Lane B,
 * and a screen that owned its own plan state would have to be rewritten at the
 * boundary instead of re-wired.
 */
export function AdminActionDrawerScreen({
  groups = ADMIN_CATALOG,
  selected,
  onSelect,
  flow,
  policy,
  dataProfile,
  freshAuthSatisfied,
  secondApproverSatisfied,
  emptyHint = "Pick a command from the catalogue to load it into the drawer.",
  children,
}: {
  groups?: readonly CatalogGroup[];
  selected: CatalogCommand | null;
  onSelect: (command: CatalogCommand) => void;
  flow?: AdminDrawerFlow;
  policy?: DeliveryPolicy | null;
  dataProfile?: DeliveryProfile | null;
  freshAuthSatisfied?: boolean;
  secondApproverSatisfied?: boolean;
  emptyHint?: string;
  /** Extra evidence the caller wants under the drawer body. */
  children?: ReactNode;
}) {
  const isMutation = selected != null && (selected.tag === "MUTATION" || selected.tag === "DANGER");

  return (
    <ExecutionSurface kind="deployments" className="exec-admin">
      <header className="exec-admin-head">
        <h1>Admin actions</h1>
        <p className="exec-admin-sub">
          Operator Admin scope · UI and CLI share ONE command authority — the browser never runs a shell
        </p>
        <p className="exec-admin-sub">
          CLI password confirm ⇢ web step-up auth · read-only commands need neither
        </p>
      </header>
      <div className="exec-admin-panes">
        <AdminActionCatalog groups={groups} selectedId={selected?.id ?? null} onSelect={onSelect} />
        <aside className="exec-admin-drawer" aria-label="Command drawer">
          {selected == null ? (
            <p className="exec-admin-empty">{emptyHint}</p>
          ) : selected.tag === "BLOCKED" ? (
            <>
              <h2 className="exec-admin-seltitle">{selected.title}</h2>
              <p className="exec-admin-selmeta">{selected.id} · {selected.scope}</p>
              <BlockedPanel command={selected} />
            </>
          ) : selected.tag === "READ" ? (
            <>
              <h2 className="exec-admin-seltitle">{selected.title}</h2>
              <p className="exec-admin-selmeta">{selected.id} · {selected.scope}</p>
              <ReadPanel command={selected} />
            </>
          ) : (
            <CommandPlanDrawer
              title={selected.title}
              meta={`${selected.id} · ${selected.scope} · tier ${selected.tier}`}
              plan={flow?.plan ?? null}
              step={flow?.step ?? "plan"}
              verifyEntries={flow?.verifyEntries}
              outcome={flow?.outcome ?? null}
              danger={selected.tag === "DANGER"}
              confirmWord={selected.tag === "DANGER" ? "CLOSE" : undefined}
              riskTier={selected.tier}
              policy={policy ?? null}
              dataProfile={dataProfile ?? null}
              freshAuthSatisfied={freshAuthSatisfied}
              secondApproverSatisfied={secondApproverSatisfied}
              verification={flow?.verification ?? null}
              requestKey={`admin:${selected.id}`}
              onGeneratePlan={flow?.onGeneratePlan}
              onApply={flow?.onApply}
            />
          )}
          {isMutation ? children : null}
        </aside>
      </div>
    </ExecutionSurface>
  );
}
