/**
 * ContextBar — the one place environment and window are chosen (review2/00 A4).
 *
 * Props-driven: it shows what it is given and reports a change as a patch.
 * `ConnectedContextBar` binds it to the URL through `useExecUrlState`, whose
 * setter keeps every other param, so choosing a window never drops `q`, `sel`
 * or `workspace_id`. Nothing here stores state of its own.
 *
 * The window control is honest about the backend: until the read side accepts
 * a window (FE-025) the caller passes `windowLock` and the control is disabled
 * with the reason beside it, not left to look like it works. There is no
 * "As of" and no placeholder for an absent currency or scope; what is not
 * known is not drawn.
 */
import { useId } from "react";

import {
  ENV_LABEL,
  EXEC_ENVS,
  EXEC_WINDOWS,
  useExecUrlState,
  type ExecEnv,
  type ExecUrlParams,
  type ExecWindow,
} from "../urlState";
import "../css/shell.css";

export const WINDOW_NOT_SERVED_REASON = "Window applies when the server supports it.";

export interface WindowLock {
  reason: string;
  /** The window the data actually covers, e.g. `ALL`; shown beside the control when known. */
  effective?: string;
}

export interface EnvLock {
  /** Why the environment does not apply on this screen (one short sentence, ideally with its FE id). */
  reason: string;
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
   * the environment buttons are disabled and the reason is printed beside them,
   * the same pattern as `windowLock`. The pressed button keeps showing the URL's
   * environment; it is not a claim about the rows.
   */
  envLock?: EnvLock | null;
  /** Server-derived scope text, e.g. "Scope: Your alphas"; the bar never decides it from a role. */
  scope?: string | null;
  /** Plain anchor target for the "My access" link beside a locked control (D9). */
  accessHref?: string;
}

export function ContextBar({ env, window: selectedWindow, ccy, onChange, windowLock, envLock, scope, accessHref }: ContextBarProps) {
  const reasonId = useId();
  const envReasonId = useId();
  const locked = windowLock !== undefined && windowLock !== null;
  const envLocked = envLock !== undefined && envLock !== null;

  return (
    <div className="exec-ctxbar" role="group" aria-label="Context">
      <span className="exec-ctxbar-label">Context</span>
      <div className="exec-ctxbar-seg" role="group" aria-label="Environment" data-control="env">
        {EXEC_ENVS.map((value) => (
          <button
            key={value}
            type="button"
            data-v={value}
            aria-pressed={value === env}
            disabled={envLocked}
            aria-describedby={envLocked ? envReasonId : undefined}
            onClick={() => {
              if (value !== env) onChange({ env: value });
            }}
          >
            {ENV_LABEL[value]}
          </button>
        ))}
      </div>
      <div className="exec-ctxbar-seg" role="group" aria-label="Window" data-control="window">
        {EXEC_WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            data-v={value}
            aria-pressed={value === selectedWindow}
            disabled={locked}
            aria-describedby={locked ? reasonId : undefined}
            onClick={() => {
              if (value !== selectedWindow) onChange({ window: value });
            }}
          >
            {value}
          </button>
        ))}
      </div>
      {envLock ? <span id={envReasonId} className="exec-ctxbar-reason">{envLock.reason}</span> : null}
      {windowLock?.effective ? <span className="exec-ctxbar-lock">Window fixed: {windowLock.effective}</span> : null}
      {windowLock ? (
        <span id={reasonId} className="exec-ctxbar-reason">
          {windowLock.reason}
          {accessHref ? (
            <>
              {" "}
              <a href={accessHref}>My access</a>
            </>
          ) : null}
        </span>
      ) : null}
      {ccy ? <span className="exec-ctxbar-chip">{ccy} · one basis</span> : null}
      {scope ? <span className="exec-ctxbar-chip">{scope}</span> : null}
    </div>
  );
}

/** URL-bound: env and window come from the query and are written back with other params kept. */
export function ConnectedContextBar(props: Omit<ContextBarProps, "env" | "window" | "ccy" | "onChange">) {
  const { value, set } = useExecUrlState();
  // No read accepts a window yet (FE-025), so the control starts locked; a caller that knows better passes `windowLock={null}`.
  const windowLock = props.windowLock === undefined ? { reason: WINDOW_NOT_SERVED_REASON } : props.windowLock;
  return <ContextBar {...props} windowLock={windowLock} env={value.env} window={value.window} ccy={value.ccy} onChange={(patch) => set(patch)} />;
}
