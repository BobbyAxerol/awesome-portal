import { RawViewFeature } from "@/features/shared/RawViewFeature";

/**
 * Reports surface — the byte-preserved legacy fragment.
 *
 * The adjacent Interpretation view was removed in v1.1; Reports is now the
 * whole surface rather than the default half of a pair.
 */
export function ReportsFeature({ theme }: { theme: "light" | "dark" }) {
  return (
    <section data-testid="reports-feature">
      <div className="feature-context-bar">
        <span>Reports giữ nguyên nội dung legacy đã khóa.</span>
      </div>
      <RawViewFeature view="reports" theme={theme} />
    </section>
  );
}
