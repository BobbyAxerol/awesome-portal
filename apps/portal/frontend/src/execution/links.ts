/**
 * Route normalisation for hrefs that arrive in published fixture documents and
 * in the server's own link fields.
 *
 * Three corrections live here, at the edge, because the sources are not ours
 * to change (their tests compare byte-for-byte; the request to fix them is
 * filed in FRONTEND_HANDOFF §8.34):
 *
 * - `/execution/operations/{op}`: the queue addresses operations by query, not
 *   path, so it becomes `/execution/operations?operation={op}`;
 * - `/deployments/paper/exit/{id}`: exit reviews live under /governance;
 * - `/execution/operations?operation_id={id}`, which the command-center
 *   snapshot writes (command-center.repository.ts), becomes `?operation={id}`,
 *   the one deep link Operations reads (V1 and V2 alike). Any other param on
 *   the href stays, in its place.
 *
 * What it does NOT do: `?filter=findings` and `?filter=broker_sync` (also from
 * the snapshot) name a queue filter that does not exist, in V1 or in V2. The
 * href is kept as the server sent it and no filter is claimed; Operations V2
 * reads `filter` and says so in a sentence rather than landing on an unfiltered
 * page in silence. A label that says "Findings" is the server's wording and is
 * not ours to rewrite here.
 */
export function canonicalHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const op = /^\/execution\/operations\/(op_\w+)$/.exec(href);
  if (op) return `/execution/operations?operation=${op[1]}`;
  const exit = /^\/deployments\/paper\/exit\/([A-Z]+-\d+)$/.exec(href);
  if (exit) return `/governance/exit-reviews/${exit[1]}`;
  return withOperationParam(href);
}

const OPERATIONS_QUERY = /^(\/execution\/operations)\?([^#]*)(#.*)?$/;

/** `?operation_id=` -> `?operation=` on the Operations route; every other href is returned as it came. */
function withOperationParam(href: string): string {
  const match = OPERATIONS_QUERY.exec(href);
  if (!match) return href;
  const [, path, query, hash = ""] = match;
  const params = new URLSearchParams(query);
  if (!params.has("operation_id")) return href;
  const next = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "operation_id") {
      // An explicit `operation` already in the href wins; the older spelling is dropped.
      if (!params.has("operation")) next.append("operation", value);
    } else next.append(key, value);
  }
  const text = next.toString();
  return `${path}${text === "" ? "" : `?${text}`}${hash}`;
}
