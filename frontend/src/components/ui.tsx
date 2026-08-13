import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  forwardRef,
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
