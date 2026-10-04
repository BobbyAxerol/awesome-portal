/** Scope preservation for existing named Research links only; no authority inference. */
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link, useInRouterContext, useSearchParams, type LinkProps } from "react-router-dom";
import { withWorkspace } from "./runLinks";
import { LineageLink } from "./LineageLink";

export function workspaceNamedHref(to: LinkProps["to"], workspaceId?: string): LinkProps["to"] {
  if (typeof to !== "string" || !workspaceId) return to;
  const path = to.split(/[?#]/, 1)[0];
  if (path !== "/research/quantbt" && !path.startsWith("/research/quantbt/")) return to;
  const beforeHash = to.split("#", 1)[0];
  const queryAt = beforeHash.indexOf("?");
  const query = new URLSearchParams(queryAt < 0 ? "" : beforeHash.slice(queryAt + 1));
  // A destination's own explicit scope wins over the current screen's scope.
  return query.has("workspace_id") ? to : withWorkspace(to, workspaceId);
}

export const ResearchScopedLink = forwardRef<HTMLAnchorElement, LinkProps>(function ResearchScopedLink({ to, ...props }, ref) {
  const [params] = useSearchParams();
  return <Link {...props} ref={ref} to={workspaceNamedHref(to, params.get("workspace_id") || undefined)} />;
});

/** Keep the lightweight lineage link's existing DOM/props within S13. */
function RouterScopedLineageLink({ to, ...props }: Parameters<typeof LineageLink>[0]) {
  const [params] = useSearchParams();
  return <LineageLink {...props} to={workspaceNamedHref(to, params.get("workspace_id") || undefined) as string} />;
}

/** S14 also supports standalone presentational panels, exactly as before. */
export function ResearchScopedLineageLink(props: Parameters<typeof LineageLink>[0]) {
  return useInRouterContext() ? <RouterScopedLineageLink {...props} /> : <LineageLink {...props} />;
}

function RouterScopedAnchor({ href, anchorRef, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { anchorRef: React.Ref<HTMLAnchorElement> }) {
  const [params] = useSearchParams();
  return <a {...props} ref={anchorRef} href={href ? workspaceNamedHref(href, params.get("workspace_id") || undefined) as string : href} />;
}

/** Existing native anchors keep native navigation and exactly the same DOM. */
export const ResearchScopedAnchor = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function ResearchScopedAnchor(props, ref) {
  return useInRouterContext() ? <RouterScopedAnchor {...props} anchorRef={ref} /> : <a {...props} ref={ref} />;
});
