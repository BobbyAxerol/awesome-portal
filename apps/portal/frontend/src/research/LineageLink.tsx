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
}: {
  to: string;
  children: ReactNode;
  className?: string;
  action?: string;
}) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <Link to={to} className={className} data-action={action}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className} data-action={action}>
      {children}
    </a>
  );
}
