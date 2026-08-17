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

/**
 * The states a `StateView` can express.
 *
 * U02 requires these to stay visually distinct rather than collapsing into one
 * spinner or one "no data" message (v0.4 §25.8). `failed` and `cancelled` are
 * the pre-existing QuantBT run states and are kept so run views do not change
 * behaviour; the rest come from the Portal availability contract.
 */
export type StateViewKind =
  | "loading"
  | "empty"
  | "partial"
  | "stale"
  | "denied"
  | "unavailable"
  | "commissioned"
  | "failed"
  | "cancelled";

/** Title + non-colour glyph per state, so greyscale and print stay readable. */
const STATE_META: Record<Exclude<StateViewKind, "loading">, { title: string; glyph: string }> = {
  empty: { title: "Chưa có dữ liệu", glyph: "—" },
  partial: { title: "Dữ liệu một phần", glyph: "◐" },
  stale: { title: "Dữ liệu cũ", glyph: "◔" },
  denied: { title: "Không có quyền truy cập", glyph: "⊘" },
  unavailable: { title: "Nguồn không khả dụng", glyph: "○" },
  commissioned: { title: "Chưa triển khai", glyph: "◌" },
  failed: { title: "Có lỗi xảy ra", glyph: "✕" },
  cancelled: { title: "Run đã bị huỷ", glyph: "⊗" },
};

export function StateView({
  kind,
  message,
  code,
  onRetry,
}: {
  kind: StateViewKind;
  message?: string;
  code?: string;
  onRetry?: () => void;
}) {
  if (kind === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-ink-soft" role="status">
        <Loader2 size={16} className="animate-spin" />
        <span className="mono text-[12px]">{message ?? "Đang tải…"}</span>
      </div>
    );
  }
  const meta = STATE_META[kind];
  return (
    <div className="flex flex-col items-center gap-2 py-12" data-state={kind}>
      <div className="mono text-[12px] text-ink-faint">
        <span aria-hidden="true">{meta.glyph}</span> {meta.title}
      </div>
      {code ? <span className="chip">{code}</span> : null}
      {message ? <div className="max-w-md text-center text-[13px] text-ink-soft">{message}</div> : null}
      {onRetry && (kind === "failed" || kind === "unavailable") ? (
        <button type="button" className="btn-ghost mt-2" onClick={onRetry}>
          Thử lại
        </button>
      ) : null}
    </div>
  );
}

/**
 * Loading placeholder that reserves the shape of what is coming.
 *
 * A spinner tells the reader "wait"; it does not stop the page from jumping when
 * the data lands. Every screen here went from one line of text to a full layout in
 * a single frame, which is most of what "not smooth" means in practice. These
 * blocks hold the same footprint as the content that replaces them.
 *
 * `aria-hidden` with a single live region: a screen reader should hear "đang tải",
 * not a description of grey rectangles.
 */
export function Skeleton({
  variant = "line",
  count = 1,
  height,
}: {
  variant?: "line" | "metric" | "chart" | "row";
  count?: number;
  height?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className="skeleton"
          data-variant={variant}
          style={height ? { height } : undefined}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/** The loading shape of a results screen: metric strip, chart, table rows. */
export function ResultsSkeleton({ message }: { message?: string }) {
  return (
    <div className="space-y-4" data-testid="results-skeleton">
      <span className="sr-only" role="status">
        {message ?? "Đang tải…"}
      </span>
      <div className="skeleton-metric-row">
        <Skeleton variant="metric" count={5} />
      </div>
      <Skeleton variant="chart" height={280} />
      <div className="skeleton-rows">
        <Skeleton variant="row" count={6} />
      </div>
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
