import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  forwardRef,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

/** ── Primitives (design system) ─────────────────────────────── */

export function Card({ children, className = "", ...rest }: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "good" | "bad"; children: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: "",
    accent: "chip-accent",
    good: "chip-good",
    bad: "chip-bad",
  };
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export type BadgeTone = "pass" | "fail" | "pending";
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge-${tone}`}>{children}</span>;
}

export type ButtonVariant = "primary" | "ghost";
export function Button({
  variant = "primary",
  children,
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${variant === "primary" ? "btn-primary" : "btn-ghost"}`} {...rest}>
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} className="input" {...props} />;
});

/** ── Form controls ──────────────────────────────────────────
 * `Select` and `Textarea` exist so a form is not half design-system and half
 * raw element. Before v1.1 the editors used bare `<select>`/`<textarea>`,
 * which is how the typography drifted (v1.1 plan §3.1). */

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`input select-control ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`input textarea-control ${className}`} {...rest} />;
  },
);

/** A labelled control with an optional hint, wired through `aria-describedby`. */
export function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  wide?: boolean;
  children: (props: { id: string; "aria-describedby": string | undefined }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`feature-field ${wide ? "feature-field-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": hintId })}
      {hint ? (
        <small className="feature-field-help" id={hintId}>
          {hint}
        </small>
      ) : null}
    </div>
  );
}

/** ── Checkbox ───────────────────────────────────────────────
 *
 * A styled native `<input type="checkbox">` rather than a div pretending to be
 * one: keyboard, focus, form association and screen-reader semantics stay
 * native, and only the box is drawn by us.
 *
 * `indeterminate` is a DOM property with no HTML attribute, so it is applied
 * through the ref. `loading` is its own state — the control is busy, not
 * merely disabled, and saying so is what keeps a pending mutation honest.
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> {
  checked?: boolean;
  indeterminate?: boolean;
  loading?: boolean;
  label?: ReactNode;
  /** Visually hides the label but keeps it for assistive technology. */
  labelHidden?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  checked = false,
  indeterminate = false,
  loading = false,
  disabled = false,
  label,
  labelHidden = false,
  onCheckedChange,
  className = "",
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  const state = loading ? "loading" : indeterminate && !checked ? "indeterminate" : checked ? "checked" : "unchecked";

  return (
    <label className={`checkbox ${className}`} data-state={state} data-disabled={disabled || loading}>
      <input
        ref={ref}
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        // Guarded rather than left to the DOM: a change dispatched while a
        // mutation is in flight must not queue a second one.
        onChange={(event) => {
          if (disabled || loading) return;
          onCheckedChange?.(event.target.checked);
        }}
        {...rest}
      />
      <span className="checkbox-box" aria-hidden="true" />
      {label ? <span className={labelHidden ? "sr-only" : "checkbox-label"}>{label}</span> : null}
    </label>
  );
}

export function NavTab({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`navtab ${active ? "navtab-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export type StateKind = "loading" | "empty" | "failed";
export function StateView({ kind, message }: { kind: StateKind; message?: string }) {
  const icon = kind === "loading" ? "…" : kind === "empty" ? "∅" : "✕";
  return (
    <div className={`state-${kind}`} role={kind === "failed" ? "alert" : "status"}>
      <span className="mono-label">{icon}</span>
      <p>{message ?? (kind === "loading" ? "Đang tải…" : kind === "empty" ? "Không có dữ liệu" : "Đã xảy ra lỗi")}</p>
    </div>
  );
}

export function SectionTitle({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div>
      {kicker && <p className="mono-label">{kicker}</p>}
      <h2 className="section-title">{children}</h2>
    </div>
  );
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="definition-list">
      {items.map(([term, def], i) => (
        <div key={i}>
          <dt>{term}</dt>
          <dd>{def}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Collapsible({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="collapsible" open={defaultOpen}>
      <summary>{summary}</summary>
      <div>{children}</div>
    </details>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  );
}

export function ChartFigure({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="chart-figure">
      {children}
      {caption && <figcaption className="dek">{caption}</figcaption>}
    </figure>
  );
}

/** ── Modal ──────────────────────────────────────────────────── */

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** ── Toast ──────────────────────────────────────────────────── */

interface ToastItem {
  id: number;
  message: string;
  tone: "info" | "good" | "bad";
}
const ToastContext = createContext<(message: string, tone?: ToastItem["tone"]) => void>(() => {});
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const push = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
