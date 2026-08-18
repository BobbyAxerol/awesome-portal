/**
 * Shared surface primitives — v1 design system.
 *
 * These carry the layout vocabulary every screen shares: a panel, a section
 * heading, a toolbar row and a callout. They exist so a screen never invents
 * its own padding/border recipe, which is how two domains drift apart
 * visually (v0.5 §11.1).
 *
 * Nothing here wraps a single CSS property; each encodes a repeated
 * composition with its own semantics.
 */
import type { ReactNode } from "react";

export type CalloutTone = "info" | "warning" | "danger" | "muted";

/**
 * An explanatory box tied to a state or constraint.
 *
 * `tone` is semantic, not decorative: `danger` means the action is blocked,
 * `warning` means the result is usable but qualified.
 */
export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="callout" data-tone={tone} role="note">
      {title ? <p className="callout-title">{title}</p> : null}
      <div className="callout-body">{children}</div>
    </div>
  );
}

/** A bordered panel. `title` renders the standard panel header row. */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      {title || actions ? (
        <header className="panel-head">
          {typeof title === "string" ? <h2 className="panel-title">{title}</h2> : title}
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Section heading with an optional deck; used inside long configuration flows. */
export function SectionHeading({
  title,
  description,
  actions,
  level = 2,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
}) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div className="section-heading">
      <div className="min-w-0">
        <Tag className={level === 2 ? "panel-title" : "subsection-title"}>{title}</Tag>
        {description ? <p className="dek">{description}</p> : null}
      </div>
      {actions ? <div className="section-heading-actions">{actions}</div> : null}
    </div>
  );
}

/** Horizontal action row that wraps rather than scrolls on narrow viewports. */
export function Toolbar({ children, align = "start" }: { children: ReactNode; align?: "start" | "end" | "between" }) {
  return (
    <div className="toolbar" data-align={align}>
      {children}
    </div>
  );
}

/**
 * Numbered flow stepper.
 *
 * Backtest configuration is a sequence with a required order (v0.4 §P0.9);
 * showing where the user is prevents the "one enormous form" failure mode.
 */
export interface StepDefinition {
  id: string;
  label: string;
  /** Blocking problem for this step; the step renders as invalid. */
  error?: string | null;
  /** True when the step has been satisfied. */
  complete?: boolean;
  /**
   * Whether the reader has actually opened this step.
   *
   * `complete` is computed from validation, and a step with nothing filled in is
   * trivially valid — so a tick without this flag says "done" about work nobody
   * has looked at.
   */
  visited?: boolean;
}

export function Stepper({
  steps,
  activeId,
  onSelect,
}: {
  steps: readonly StepDefinition[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="stepper" aria-label="Run configuration steps">
      {steps.map((step, index) => {
        // A tick means "opened and clean", never "no blocking error yet".
        // Ticking a step nobody has opened reads as "already done", which is a
        // claim about the user's progress that the form cannot make.
        const state = step.error
          ? "error"
          : step.complete && step.visited
            ? "complete"
            : "pending";
        const active = step.id === activeId;
        return (
          <li key={step.id}>
            <button
              type="button"
              className={`stepper-step${active ? " stepper-step-active" : ""}`}
              data-state={state}
              aria-current={active ? "step" : undefined}
              onClick={() => onSelect(step.id)}
            >
              <span className="stepper-index mono" aria-hidden="true">
                {state === "complete" ? "✓" : state === "error" ? "!" : String(index + 1).padStart(2, "0")}
              </span>
              <span className="stepper-label">{step.label}</span>
              <span className="sr-only">
                {step.error
                  ? `— has an error: ${step.error}`
                  : state === "complete"
                    ? "— opened, no errors"
                    : "— not opened yet"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
