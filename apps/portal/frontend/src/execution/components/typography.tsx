/**
 * Type roles — EL-V2-02 (handoff §5.2, §5.3).
 *
 * The role decides the typography; a screen never picks a size. These five
 * components exist so JSX has a name for the role it means, instead of
 * reaching for a "tile title" class that had also been serving as the page
 * title, or a 10px mono utility that had been serving as everything.
 *
 * Copy/density decision method (§11.8), applied wherever one of these is used:
 *  1. write the ONE question the route answers;
 *  2. keep only the state, consequence and next action above the fold;
 *  3. supporting analysis → tabs; provenance/raw → drawer; blockers/scope →
 *     rail;
 *  4. prose that is neither state, consequence nor next action goes to a
 *     disclosure or goes away — never made larger to fill space.
 *
 * Sparse screens keep this scale unchanged; they use a narrower measure or an
 * asymmetric grid. Inflated typography to fill a viewport is an automatic
 * rejection (§12 EL-V2-02 exit gate).
 */
import type { ReactNode } from "react";

/** Page identity: human name first (sans 24/32), immutable id second (meta). */
export function ExecutionPageTitle({
  children,
  id,
  as: Tag = "h1",
}: {
  children: ReactNode;
  /** Short immutable identifier rendered beside the name, in the meta role. */
  id?: string | null;
  as?: "h1" | "h2";
}) {
  return (
    <Tag className="exec-role-title exec-page-title">
      {children}
      {id ? <span className="exec-role-meta exec-page-title-id"> {id}</span> : null}
    </Tag>
  );
}

/** Section/panel heading (sans 15/22, 600). Sentence or title case, never uppercase mono. */
export function ExecutionSectionTitle({
  children,
  as: Tag = "h2",
}: {
  children: ReactNode;
  as?: "h2" | "h3";
}) {
  return <Tag className="exec-role-section">{children}</Tag>;
}

/**
 * Status, id, envelope (mono 11/16). Never the only text explaining a
 * decision — pair it with a body or section role that says what it means.
 */
export function ExecutionMeta({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="exec-role-meta" title={title}>
      {children}
    </span>
  );
}

/**
 * An exact value (mono 14/20, tabular). `kpi` lifts it to 24/32 — the same
 * level on every Execution screen, so a KPI strip never grows to fill space.
 */
export function ExecutionDataValue({
  children,
  kpi = false,
  unit,
}: {
  children: ReactNode;
  kpi?: boolean;
  /** Currency or unit, rendered in the meta role so it never masquerades as digits. */
  unit?: string | null;
}) {
  return (
    <span className={kpi ? "exec-role-kpi" : "exec-role-num"}>
      {children}
      {unit ? <span className="exec-role-meta exec-value-unit"> {unit}</span> : null}
    </span>
  );
}

/**
 * The secondary envelope caption (mono 10/14) — the ONE place 10px is allowed
 * (§5.2), and only because it expands. Renders a disclosure: the short line
 * is visible, the full method/envelope opens on demand.
 */
export function ExecutionEvidenceCaption({
  summary,
  children,
}: {
  /** The one-line caption always shown. */
  summary: ReactNode;
  /** Full method/envelope, revealed on expand. */
  children?: ReactNode;
}) {
  if (!children) return <span className="exec-role-caption">{summary}</span>;
  return (
    <details className="exec-evidence-caption">
      <summary className="exec-role-caption">{summary}</summary>
      <div className="exec-role-body">{children}</div>
    </details>
  );
}
