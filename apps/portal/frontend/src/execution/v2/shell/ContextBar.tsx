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
 * known is not drawn. "As of" stays out on purpose: no read can be taken at a
 * past instant (decision B6; FE-036 was settled 2026-10-18 as current-only), so
 * the control would promise time travel the data cannot do.
 *
 * Scope and currency are published by the mounted screen (`contextFacts.ts`),
 * only when it knows them; the bar never derives either from a role.
 */
import { useId } from "react";
import { Link } from "react-router-dom";

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

export interface WindowLock {
  reason: string;
  /** The window the data actually covers, e.g. `ALL`; shown beside the control when known. */
  effective?: string;
}

export interface EnvLock {
  /** Why the environment does not apply on this screen (one short sentence, ideally with its FE id). */
  reason: string;
  /**
   * The environment the screen itself is in, when it knows (a deployment screen: Paper workbench, Sandbox,
   * Canary, Live). The pressed button shows this instead of the URL's `env`, and "Environment fixed: <label>"
   * is printed beside the control, the same pattern as `WindowLock.effective`. Without it the bar keeps showing
   * the URL's environment, which on `/deployments/paper/x` with no `env=paper` marks Real-funded by default.
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
   * the environment buttons are disabled and the reason is printed beside them,
   * the same pattern as `windowLock`. The pressed button keeps showing the URL's
   * environment; it is not a claim about the rows.
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
  return `Ignored invalid URL ${invalid.length === 1 ? "parameter" : "parameters"}: ${names}${more}. Defaults are shown.`;
}

export function ContextBar({ env, window: selectedWindow, ccy, onChange, windowLock, envLock, scope, accessHref, invalid, onDismissInvalid }: ContextBarProps) {
  const reasonId = useId();
  const envReasonId = useId();
  const locked = windowLock !== undefined && windowLock !== null;
  const envLocked = envLock !== undefined && envLock !== null;
  const lockedEnv = envLocked && typeof envLock.effective === "string" && (EXEC_ENVS as readonly string[]).includes(envLock.effective) ? envLock.effective : null;
  const shownEnv: ExecEnv = lockedEnv ?? env;

  return (
    <div className="exec-ctxbar" role="group" aria-label="Context">
      <span className="exec-ctxbar-label">Context</span>
      <div className="exec-ctxbar-seg" role="group" aria-label="Environment" data-control="env">
        {EXEC_ENVS.map((value) => (
          <button
            key={value}
            type="button"
            data-v={value}
            aria-pressed={value === shownEnv}
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
      {lockedEnv ? <span className="exec-ctxbar-lock">Environment fixed: {ENV_LABEL[lockedEnv]}</span> : null}
      {envLock ? <span id={envReasonId} className="exec-ctxbar-reason">{envLock.reason}</span> : null}
      {windowLock?.effective ? <span className="exec-ctxbar-lock">Window fixed: {windowLock.effective}</span> : null}
      {windowLock ? (
        <span id={reasonId} className="exec-ctxbar-reason">
          {windowLock.reason}
          {accessHref ? (
            <>
              {" "}
              <Link to={accessHref}>My access</Link>
            </>
          ) : null}
        </span>
      ) : null}
      {ccy ? <span className="exec-ctxbar-chip">{ccy} · one basis</span> : null}
      {scope ? <span className="exec-ctxbar-chip">{scope}</span> : null}
      {invalid && invalid.length > 0 ? (
        <span role="status" className="exec-ctxbar-reason" data-notice="invalid-params">
          {invalidNotice(invalid)}
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
  const windowLock = props.windowLock === undefined ? { reason: WINDOW_NOT_SERVED_REASON } : props.windowLock;
  const ccy = facts.ccy !== undefined ? facts.ccy : value.ccy;
  const scope = props.scope ?? facts.scope ?? null;
  return <ContextBar {...props} scope={scope} windowLock={windowLock} env={value.env} window={value.window} ccy={ccy} onChange={(patch) => set(patch)} invalid={invalid} onDismissInvalid={clearInvalid} />;
}
