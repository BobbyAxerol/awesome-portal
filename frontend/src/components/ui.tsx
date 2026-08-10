/** Shared UI primitives: badges, chips, state views, collapsibles, segmented control. */
import { ChevronRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone: "pass" | "fail" | "pending"; children: ReactNode }) {
  if (tone === "pass") return <span className="badge-pass">{children}</span>;
  if (tone === "fail") return <span className="badge-fail">{children}</span>;
  return <span className="badge-pending">{children}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-raised p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`mono rounded px-3 py-1 text-[12px] transition-colors duration-200 ${
            value === option.value
              ? "bg-accent text-white"
              : "text-ink-soft hover:bg-sunken hover:text-ink"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StateView({
  kind,
  message,
  code,
  onRetry,
}: {
  kind: "loading" | "empty" | "failed" | "cancelled";
  message?: string;
  code?: string;
  onRetry?: () => void;
}) {
  if (kind === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-ink-soft">
        <Loader2 size={16} className="animate-spin" />
        <span className="mono text-[12px]">{message ?? "Loading…"}</span>
      </div>
    );
  }
  const titles: Record<string, string> = {
    empty: "Không có dữ liệu",
    failed: "Có lỗi xảy ra",
    cancelled: "Run đã bị huỷ",
  };
  return (
    <div className="flex flex-col items-center gap-2 py-12">
      <div className="mono text-[12px] text-ink-faint">{titles[kind]}</div>
      {code ? <span className="chip">{code}</span> : null}
      {message ? <div className="max-w-md text-center text-[13px] text-ink-soft">{message}</div> : null}
      {kind === "failed" && onRetry ? (
        <button type="button" className="btn-ghost mt-2" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group border-b border-line-soft py-1 last:border-b-0" open={defaultOpen}>
      <summary className="mono flex cursor-pointer select-none items-center justify-between py-1 text-[11px] uppercase text-ink-soft hover:text-ink">
        {title}
        <ChevronRight size={12} className="transition-transform duration-200 group-open:rotate-90" />
      </summary>
      <div className="collapsible-content border-t border-line-soft py-2">{children}</div>
    </details>
  );
}

export function DefinitionList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-line-soft">
      {rows.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[150px_1fr] gap-3 py-1">
          <dt className="mono text-[11px] uppercase text-ink-faint">{term}</dt>
          <dd className="mono text-[12px] text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricHero({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="kpi-value mt-1" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub ? <div className="mono mt-1 text-[11px] text-ink-faint">{sub}</div> : null}
    </div>
  );
}
