/**
 * ContextBar — the one place environment and window are chosen (review2/00 A4).
 *
 * Props-driven: it shows what it is given and reports a change as a patch.
 * `ConnectedContextBar` binds it to the URL through `useExecUrlState`, whose
 * setter keeps every other param, so choosing a window never drops `q`, `sel`
 * or `workspace_id`. Nothing here stores state of its own.
 *
 * The window control is honest about the backend: until the read side accepts
 * a window (FE-025) the caller passes `windowLock` and the buttons are not
 * drawn (no dead control, no pressed state the data does not follow); the
 * reason stays in the bar's title and hidden text. There is no
 * "As of" and no placeholder for an absent currency or scope; what is not
 * known is not drawn. "As of" stays out on purpose: no read can be taken at a
 * past instant (decision B6; FE-036 was settled 2026-10-18 as current-only), so
 * the control would promise time travel the data cannot do.
 *
 * Scope and currency are published by the mounted screen (`contextFacts.ts`),
 * only when it knows them; the bar never derives either from a role.
 */
import { useId } from "react";
import { Link } from "react-router-dom";
import { GapWhy } from "../blocks";

import {
  ENV_LABEL,
  EXEC_ENVS,
  EXEC_WINDOWS,
  useExecUrlState,
  type ExecEnv,
  type ExecUrlParams,
  type ExecWindow,
} from "../urlState";
import { useContextFactsValue } from "./contextFacts";
import "../css/shell.css";

export const WINDOW_NOT_SERVED_REASON = "Window applies when the server supports it.";
const WINDOW_NOT_SERVED: WindowLock = { reason: WINDOW_NOT_SERVED_REASON, unapplied: true };

export interface WindowLock {
  /** The full reason: the bar's title and hidden text; what prints is `short`. */
  reason: string;
  /** What prints beside the bar instead of `reason`; `null` prints nothing (the `effective` chip already says it). */
  short?: string | null;
  /** The read takes no window: the bar folds it into one "Not applied: ..." line instead of printing a sentence. */
  unapplied?: boolean;
  /** The window the data actually covers, e.g. `ALL`; shown beside the control when known. */
  effective?: string;
}

export interface EnvLock {
  /** Why the environment does not apply on this screen: the bar's title and hidden text (and the environment chip's description). */
  reason: string;
  /** What prints beside the bar instead of `reason`; `null` prints nothing. */
  short?: string | null;
  /** The read takes no environment: folded into the bar's one "Not applied: ..." line. */
  unapplied?: boolean;
  /**
   * The environment the screen itself is in, when it knows (a deployment screen: Paper workbench, Sandbox,
   * Canary, Live). The bar draws this as a chip instead of the buttons; the lock reason says why. Without it nothing is drawn for the environment.
   * A value that is not a known environment is ignored (the bar never prints a label it cannot name).
   */
  effective?: ExecEnv;
}

export type ContextPatch = Partial<Pick<ExecUrlParams, "env" | "window">>;

export interface ContextBarProps {
  env: ExecEnv;
  window: ExecWindow;
  /** Absent means the screen's own basis; nothing is drawn for it. */
  ccy?: string | null;
  onChange(patch: ContextPatch): void;
  windowLock?: WindowLock | null;
  /**
   * For a screen whose read takes no environment (the Blotter's orders read):
   * the environment buttons are not drawn and the bar says "Not applied", the
   * same pattern as `windowLock`. Nothing is pressed: the URL's environment is
   * not a claim about the rows.
   */
  envLock?: EnvLock | null;
  /** Server-derived scope text, e.g. "Scope: Your alphas"; the bar never decides it from a role. */
  scope?: string | null;
  /** Plain anchor target for the "My access" link beside a locked control (D9). */
  accessHref?: string;
  /** URL params that were present but rejected (names only; D7). Empty or absent draws nothing. */
  invalid?: readonly string[];
  /** Dismisses the invalid-params notice. */
  onDismissInvalid?(): void;
}

/** One line naming the rejected params; the values are never printed (they came from a URL anyone can craft). */
export function invalidNotice(invalid: readonly string[]): string {
  const names = invalid.slice(0, 6).join(", ");
  const more = invalid.length > 6 ? ` and ${invalid.length - 6} more` : "";
  return `Ignored invalid URL ${invalid.length === 1 ? "parameter" : "parameters"}: ${names}${more}`;
}

export function ContextBar({ env, window: selectedWindow, ccy, onChange, windowLock, envLock, scope, accessHref, invalid, onDismissInvalid }: ContextBarProps) {
  const reasonId = useId();
  const envReasonId = useId();
  const locked = windowLock !== undefined && windowLock !== null;
  const envLocked = envLock !== undefined && envLock !== null;
  const lockedEnv = envLocked && typeof envLock.effective === "string" && (EXEC_ENVS as readonly string[]).includes(envLock.effective) ? envLock.effective : null;
  // One compact line for every lock: locks that only say "this read takes no X" fold into "Not applied: X, Y".
  const notApplied = [envLock?.unapplied ? "Environment" : null, windowLock?.unapplied ? "Window" : null].filter((word): word is string => word !== null);
  const own = (lock: EnvLock | WindowLock | null | undefined): string | null => (lock === null || lock === undefined || lock.unapplied === true ? null : lock.short === undefined ? lock.reason : lock.short);
  const lockLine = [notApplied.length > 0 ? `Not applied: ${notApplied.join(", ")}` : null, own(envLock), own(windowLock)].filter((part): part is string => part !== null && part !== "");

  return (
    <div className="exec-ctxbar" role="group" aria-label="Context">
      <span className="exec-ctxbar-label">Context</span>
      {envLocked ? (
        // A locked control is not drawn as buttons that do nothing: a screen that knows its environment states it (a chip, reason attached),
        // one whose read takes none says so once in the "Not applied" line. A pressed button is only ever a choice the data follows.
        lockedEnv ? <span className="exec-ctxbar-chip" data-control="env" data-v={lockedEnv} title={envLock.reason} aria-label={`Environment: ${ENV_LABEL[lockedEnv]}`} aria-describedby={envReasonId}>{ENV_LABEL[lockedEnv]}</span> : null
      ) : (
        <div className="exec-ctxbar-seg" role="group" aria-label="Environment" data-control="env">
          {EXEC_ENVS.map((value) => (
            <button
              key={value}
              type="button"
              data-v={value}
              aria-pressed={value === env}
              onClick={() => {
                if (value !== env) onChange({ env: value });
              }}
            >
              {ENV_LABEL[value]}
            </button>
          ))}
        </div>
      )}
      {locked ? null : (
        <div className="exec-ctxbar-seg" role="group" aria-label="Window" data-control="window">
          {EXEC_WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              data-v={value}
              aria-pressed={value === selectedWindow}
              onClick={() => {
                if (value !== selectedWindow) onChange({ window: value });
              }}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      {envLocked ? <span id={envReasonId} className="exec-ctxbar-sr">{envLock.reason}</span> : null}
      {locked ? <span id={reasonId} className="exec-ctxbar-sr">{windowLock.reason}</span> : null}
      {windowLock?.effective ? <span className="exec-ctxbar-lock" title="Window fixed by this screen">Window: {windowLock.effective}</span> : null}
      {lockLine.length > 0 || (locked && accessHref) ? (
        <span className="exec-ctxbar-reason" data-notice="lock">
          {lockLine.join(" · ")}
          {[envLock?.reason, windowLock?.reason].some(Boolean) ? <GapWhy name="Why this is locked" rows={[envLock?.reason, windowLock?.reason].filter((r): r is string => Boolean(r))} next={null} /> : null}
          {locked && accessHref ? (
            <>
              {" "}
              <Link to={accessHref}>My access</Link>
            </>
          ) : null}
        </span>
      ) : null}
      {ccy ? <span className="exec-ctxbar-chip" title="One currency basis">{ccy}</span> : null}
      {scope ? <span className="exec-ctxbar-chip">{scope}</span> : null}
      {invalid && invalid.length > 0 ? (
        <span role="status" className="exec-ctxbar-reason" data-notice="invalid-params">
          <span title="Defaults are shown">{invalidNotice(invalid)}</span>
          {onDismissInvalid ? (
            <>
              {" "}
              <button type="button" className="exec-ctxbar-chip" onClick={onDismissInvalid}>Dismiss</button>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * URL-bound: env and window come from the query and are written back with other params kept.
 *
 * Scope and currency also come from the mounted screen (`useContextFacts`) when
 * it states them; a `scope` prop wins. A screen that publishes a currency (or
 * `null` for none) overrides the URL's `ccy`; one that publishes nothing leaves
 * the URL's `ccy` as it was.
 */
export function ConnectedContextBar(props: Omit<ContextBarProps, "env" | "window" | "ccy" | "onChange">) {
  const { value, set, invalid, clearInvalid } = useExecUrlState();
  const facts = useContextFactsValue();
  // No read accepts a window yet (FE-025), so the control starts locked; a caller that knows better passes `windowLock={null}`.
  const windowLock = props.windowLock === undefined ? WINDOW_NOT_SERVED : props.windowLock;
  const ccy = facts.ccy !== undefined ? facts.ccy : value.ccy;
  const scope = props.scope ?? facts.scope ?? null;
  return <ContextBar {...props} scope={scope} windowLock={windowLock} env={value.env} window={value.window} ccy={ccy} onChange={(patch) => set(patch)} invalid={invalid} onDismissInvalid={clearInvalid} />;
}
