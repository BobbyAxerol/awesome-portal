/**
 * Lightweight link shared by Alpha Import and Compare.
 * Do not import the full Lineage screen just to render navigation.
 */
import type { ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";

export { lineageHref } from "./lineageClient";

/** Router navigation in product routes; same-origin anchor in isolated panels. */
export function LineageLink({
  to,
  children,
  className,
  action,
  title,
  primary,
  extra,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  action?: string;
  /** F2b: tooltip for a link whose label is a short arrow-phrase. */
  title?: string;
  /** F2b: marks the one forward action of a block (styled by the host screen). */
  primary?: boolean;
  /** F2b: extra `data-*` attributes the host screen's tests and styles key on. */
  extra?: Record<`data-${string}`, string>;
}) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <Link to={to} className={className} data-action={action} title={title} data-primary={primary ? "true" : undefined} {...extra}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className} data-action={action} title={title} data-primary={primary ? "true" : undefined} {...extra}>
      {children}
    </a>
  );
}
