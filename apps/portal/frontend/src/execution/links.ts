/**
 * Route normalisation for hrefs that arrive in published fixture documents.
 *
 * Two links in the inlined contract fixtures point at routes the registry
 * never owned: `/execution/operations/{op}` (the queue addresses operations by
 * query, not path) and `/deployments/paper/exit/{id}` (exit reviews live under
 * /governance). The fixtures are codex's verbatim copies and must not drift
 * (their tests compare byte-for-byte), so the correction lives here at the
 * edge — and a request to fix the source routes is filed in
 * FRONTEND_HANDOFF §8.34.
 */
export function canonicalHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const op = /^\/execution\/operations\/(op_\w+)$/.exec(href);
  if (op) return `/execution/operations?operation=${op[1]}`;
  const exit = /^\/deployments\/paper\/exit\/([A-Z]+-\d+)$/.exec(href);
  if (exit) return `/governance/exit-reviews/${exit[1]}`;
  return href;
}
