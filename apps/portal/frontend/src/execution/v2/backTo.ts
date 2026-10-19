/**
 * Back by source (UXM-07 flow audit #8, route audit M6).
 *
 * A link from a list into a detail screen says where it came from with
 * `from=<source>` and, when the list had state worth restoring, `back=<the
 * list's own query string>`. The detail screen builds its Back label and target
 * from those two values, so Back lands on the list the reader left, with the
 * same filters, and says which list it is.
 *
 *   from=fleet                      /deployments/alphas        (+ back: q stage sort view tab owner health hide)
 *   from=accounts                   /deployments/accounts      (+ back: q issues venue credential)
 *   from=portfolio:<id>             /deployments/portfolios/<id>
 *   from=cockpit                    /governance/approvals      (+ back: view lens waiver)
 *   from=blotter                    /deployments/blotter       (+ back: q status side symbol venue sort)
 *
 * Trust. `from` and `back` are read from the URL and the URL is the reader's to
 * edit, so neither is echoed and neither is a redirect target. The target path
 * always comes from the table above, never from the value; an unknown `from`
 * is ignored (the screen's own default list is used); `back` keeps only the
 * keys the source lists, each short and free of control characters, and is
 * dropped whole when it is too long to be a list state. A built target must
 * start with one of the three execution roots or it is not used.
 *
 * `from` is a context key (`withContext` carries it), so a screen that shows a
 * Back by source builds its own onward links with `withoutOrigin(params)`:
 * otherwise Account 360 opened from Alpha 360 would inherit "Alpha Fleet".
 */
import { withContext } from "./urlState";

export const BACK_PARAM = "back";
/** Longest `back` (decoded) that is carried; a longer list state falls back to the plain list. */
export const BACK_MAX = 240;
const VALUE_MAX = 80;
const ROOTS = ["/deployments", "/governance", "/execution"] as const;

export const FROM_FLEET = "fleet";
export const FROM_ACCOUNTS = "accounts";
export const FROM_COCKPIT = "cockpit";
export const FROM_BLOTTER = "blotter";
export const FROM_PORTFOLIO_PREFIX = "portfolio:";

export type BackSource =
  | { kind: "fleet" }
  | { kind: "accounts" }
  | { kind: "cockpit" }
  | { kind: "blotter" }
  | { kind: "portfolio"; id: string };

interface SourceSpec {
  path: string;
  label: string;
  /** The list's own query keys that are restored; nothing else is. */
  keys: readonly string[];
}

const FLEET: SourceSpec = { path: "/deployments/alphas", label: "Alpha Fleet", keys: ["q", "stage", "sort", "view", "tab", "owner", "health", "hide"] };
const ACCOUNTS: SourceSpec = { path: "/deployments/accounts", label: "Accounts", keys: ["q", "issues", "venue", "credential"] };
const COCKPIT: SourceSpec = { path: "/governance/approvals", label: "Approvals", keys: ["view", "lens", "waiver"] };
const BLOTTER: SourceSpec = { path: "/deployments/blotter", label: "Blotter", keys: ["q", "status", "side", "symbol", "venue", "sort"] };

function specOf(source: BackSource): SourceSpec | null {
  switch (source.kind) {
    case "fleet": return FLEET;
    case "accounts": return ACCOUNTS;
    case "cockpit": return COCKPIT;
    case "blotter": return BLOTTER;
    case "portfolio": return null;
  }
}

const asParams = (search: URLSearchParams | string): URLSearchParams => (typeof search === "string" ? new URLSearchParams(search) : search);
const safeValue = (value: string): boolean => value.length <= VALUE_MAX && !/[\u0000-\u001f]/.test(value);

/** The restorable part of a list's query: only the source's keys, each short. Empty when there is none. */
function pickState(spec: SourceSpec, search: URLSearchParams | string): URLSearchParams {
  const from = asParams(search);
  const out = new URLSearchParams();
  for (const key of spec.keys) {
    const value = from.get(key);
    if (value !== null && value !== "" && safeValue(value)) out.set(key, value);
  }
  return out;
}

/** The `from` value of a source. */
export function fromValue(source: BackSource): string {
  return source.kind === "portfolio" ? `${FROM_PORTFOLIO_PREFIX}${source.id}` : source.kind;
}

/**
 * The query pairs a list adds to a link into a detail: `from`, and `back` when
 * the list has state and it fits. `originSearch` is the list's own `location.search`.
 */
export function originParams(source: BackSource, originSearch: URLSearchParams | string = ""): URLSearchParams {
  const out = new URLSearchParams();
  out.set("from", fromValue(source));
  const spec = specOf(source);
  if (spec) {
    const state = pickState(spec, originSearch).toString();
    if (state !== "" && state.length <= BACK_MAX) out.set(BACK_PARAM, state);
  }
  return out;
}

/** `href` with the origin appended (its own `from` and `back` win); the hash and any existing query are kept. */
export function withOrigin(href: string, source: BackSource, originSearch: URLSearchParams | string = ""): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  const rest = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = rest.indexOf("?");
  const path = queryAt < 0 ? rest : rest.slice(0, queryAt);
  const own = new URLSearchParams(queryAt < 0 ? "" : rest.slice(queryAt + 1));
  for (const [key, value] of originParams(source, originSearch)) if (!own.has(key)) own.set(key, value);
  const query = own.toString();
  return `${path}${query === "" ? "" : `?${query}`}${hash}`;
}

/** The URL's params without the origin, for the onward links of a screen that shows a Back by source. */
export function withoutOrigin(search: URLSearchParams | string): URLSearchParams {
  const next = new URLSearchParams(asParams(search));
  next.delete("from");
  next.delete(BACK_PARAM);
  return next;
}

export interface BackLink {
  label: string;
  /** Internal path with query; context params are added by the caller's `withContext`. */
  to: string;
  /** The reader's list state was restored (`back` was present and valid). */
  restored: boolean;
}

/** Which source a `from` value names, or null when it names none this module knows (never echoed). */
export function sourceOf(from: string | null): BackSource | null {
  if (from === null) return null;
  if (from === FROM_FLEET) return { kind: "fleet" };
  if (from === FROM_ACCOUNTS) return { kind: "accounts" };
  if (from === FROM_COCKPIT) return { kind: "cockpit" };
  if (from === FROM_BLOTTER) return { kind: "blotter" };
  if (from.startsWith(FROM_PORTFOLIO_PREFIX) && from.length > FROM_PORTFOLIO_PREFIX.length && from.length <= 256 && !/[\u0000-\u001f]/.test(from)) {
    return { kind: "portfolio", id: from.slice(FROM_PORTFOLIO_PREFIX.length) };
  }
  return null;
}

const inRoots = (path: string): boolean => ROOTS.some((root) => path === root || path.startsWith(`${root}/`));

/**
 * Where Back goes. `fallback` is the screen's own list when `from` is absent or
 * unknown (Alpha 360 -> the fleet; Account 360 -> the accounts list). `allowed`
 * narrows which sources the screen honours: a source that makes no sense for it
 * is ignored like an unknown one.
 */
export function resolveBack(
  params: URLSearchParams | string,
  fallback: BackSource,
  allowed: readonly BackSource["kind"][] = ["fleet", "accounts", "cockpit", "blotter", "portfolio"],
): BackLink {
  const search = asParams(params);
  const named = sourceOf(search.get("from"));
  const source = named !== null && allowed.includes(named.kind) ? named : fallback;
  const spec = specOf(source);

  let path: string;
  let label: string;
  let query = "";
  if (spec) {
    path = spec.path;
    label = spec.label;
    const raw = source === named ? search.get(BACK_PARAM) : null;
    if (raw !== null && raw.length <= BACK_MAX) query = pickState(spec, raw).toString();
  } else {
    const id = (source as { kind: "portfolio"; id: string }).id;
    path = `/deployments/portfolios/${encodeURIComponent(id)}`;
    label = `Portfolio ${id.length > 40 ? `${id.slice(0, 39)}…` : id}`;
  }
  if (!inRoots(path)) {
    // Unreachable with the table above; kept so a future edit cannot turn this into an open redirect.
    return { label: FLEET.label, to: FLEET.path, restored: false };
  }
  const restored = query !== "";
  // "results" only when there is a result set to be the same one: a plain list is just the list.
  return { label: source.kind === "fleet" && restored ? `${label} results` : label, to: restored ? `${path}?${query}` : path, restored };
}

/** `resolveBack` with the context params of the current URL (env, window, workspace) carried onto the target. */
export function backLinkFor(
  params: URLSearchParams | string,
  fallback: BackSource,
  allowed?: readonly BackSource["kind"][],
): BackLink {
  const back = resolveBack(params, fallback, allowed);
  return { ...back, to: withContext(back.to, withoutOrigin(params)) };
}
