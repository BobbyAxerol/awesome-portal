/**
 * Execution V2 URL contract (review2/07 s1): one parser for the params every
 * V2 screen shares, so a bad value is explained and dropped in one place
 * instead of silently falling back inside each `useParamState`.
 *
 * Defaults are never serialised (keeps `/execution$`-style URLs stable). An
 * invalid value reads as the default and is listed in `invalid` so the caller
 * can say so. `routeState.ts` is untouched; V1 screens keep using it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

export const EXEC_ENVS = ["live", "paper", "sandbox"] as const;
export type ExecEnv = (typeof EXEC_ENVS)[number];
export const DEFAULT_ENV: ExecEnv = "live";
/** The URL value `live` stays; the screen word for the domain is "Real-funded" (06 G2/N1). */
export const ENV_LABEL: Readonly<Record<ExecEnv, string>> = {
  live: "Real-funded",
  paper: "Paper",
  sandbox: "Sandbox",
};

export const EXEC_WINDOWS = ["7D", "30D", "90D", "ALL"] as const;
export type ExecWindow = (typeof EXEC_WINDOWS)[number];
export const DEFAULT_WINDOW: ExecWindow = "90D";

export const EXEC_STAGES = ["paper", "sandbox", "canary", "live"] as const;
export type ExecStage = (typeof EXEC_STAGES)[number];

/** Values of `compose`: which composer a screen opens over itself (D8c). Today only the New request drawer. */
export const EXEC_COMPOSERS = ["request"] as const;
export type ExecComposer = (typeof EXEC_COMPOSERS)[number];

export interface ExecUrlParams {
  env: ExecEnv;
  window: ExecWindow;
  /** Absent means "the screen's own basis"; no default currency is invented. */
  ccy: string | null;
  /** Empty means all stages. */
  stage: readonly ExecStage[];
  q: string | null;
  sort: string | null;
  group: string | null;
  sel: string | null;
  tab: string | null;
  view: string | null;
  ctx: string | null;
  from: string | null;
  workspace_id: string | null;
  /**
   * `compose=request` opens the New request drawer over the current screen (D8c).
   * It is its own key because `sel` already means "the selected row"; screen-local, so it never travels
   * with a link (not in `CONTEXT_KEYS`), and Back closes the drawer because opening it pushes a history entry.
   */
  compose: ExecComposer | null;
}
export type ExecUrlKey = keyof ExecUrlParams;

/** Params that travel between screens; everything else is screen-local (07 s1). */
export const CONTEXT_KEYS = ["env", "window", "ccy", "workspace_id", "from"] as const satisfies readonly ExecUrlKey[];

interface Codec<T> {
  empty: T;
  /** `undefined` means the value is not valid for this param. */
  read(raw: string): T | undefined;
  /** `null` means the value is the default and stays out of the URL. */
  write(value: T): string | null;
}

// URLSearchParams has already decoded the value; what remains is length and control characters.
function token(max: number): Codec<string | null> {
  return {
    empty: null,
    read: (raw) => (raw.length <= max && !/[\u0000-\u001f]/.test(raw) ? raw : undefined),
    write: (value) => (value === null || value === "" ? null : value),
  };
}

function oneOf<T extends string>(allowed: readonly T[], empty: T, normalise: (raw: string) => string): Codec<T> {
  return {
    empty,
    read: (raw) => {
      const value = normalise(raw);
      return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
    },
    write: (value) => (value === empty ? null : normalise(value)),
  };
}

const CODECS: { [K in ExecUrlKey]: Codec<ExecUrlParams[K]> } = {
  env: oneOf(EXEC_ENVS, DEFAULT_ENV, (raw) => raw.toLowerCase()),
  // Written lower-case like the rest of the URL (`window=30d`); read in any case.
  window: oneOf(EXEC_WINDOWS, DEFAULT_WINDOW, (raw) => raw.toUpperCase()),
  ccy: {
    empty: null,
    read: (raw) => (/^[A-Za-z]{2,10}$/.test(raw) ? raw.toUpperCase() : undefined),
    write: (value) => value,
  },
  stage: {
    empty: [],
    read: (raw) => {
      const parts = raw.toLowerCase().split(",").map((part) => part.trim());
      if (parts.includes("all")) return parts.every((part) => part === "all" || (EXEC_STAGES as readonly string[]).includes(part)) ? [] : undefined;
      if (!parts.every((part) => (EXEC_STAGES as readonly string[]).includes(part))) return undefined;
      return EXEC_STAGES.filter((stage) => parts.includes(stage));
    },
    write: (value) => (value.length === 0 ? null : EXEC_STAGES.filter((stage) => value.includes(stage)).join(",")),
  },
  q: token(200),
  sort: token(64),
  group: token(64),
  sel: token(256),
  tab: token(64),
  view: token(64),
  ctx: {
    // `kind:id`, the breadcrumb origin that replaces `from`.
    ...token(256),
    read: (raw) => (raw.length <= 256 && /^[a-z][a-z0-9_-]*:\S+$/i.test(raw) ? raw : undefined),
  },
  from: token(256),
  workspace_id: token(128),
  compose: {
    empty: null,
    read: (raw) => {
      const value = raw.toLowerCase();
      return (EXEC_COMPOSERS as readonly string[]).includes(value) ? (value as ExecComposer) : undefined;
    },
    write: (value) => value,
  },
};

const KEYS = Object.keys(CODECS) as ExecUrlKey[];

function asParams(search: URLSearchParams | string): URLSearchParams {
  return typeof search === "string" ? new URLSearchParams(search) : search;
}

export interface ParsedUrlState {
  value: ExecUrlParams;
  /** Keys that were present but not valid; their value above is the default. */
  invalid: readonly ExecUrlKey[];
}

export function parseUrlParams(search: URLSearchParams | string): ParsedUrlState {
  const params = asParams(search);
  const invalid: ExecUrlKey[] = [];
  const value: Record<string, unknown> = {};
  for (const key of KEYS) {
    const codec = CODECS[key] as Codec<unknown>;
    const raw = params.get(key)?.trim() ?? "";
    const read = raw === "" ? codec.empty : codec.read(raw);
    if (read === undefined) {
      invalid.push(key);
      value[key] = codec.empty;
    } else value[key] = read;
  }
  return { value: value as unknown as ExecUrlParams, invalid };
}

/**
 * Writes `patch` over `base`: a default (or `null`) removes the key, any other
 * param in `base` is kept untouched, so screen-local params survive.
 */
export function serializeUrlParams(patch: Partial<ExecUrlParams>, base: URLSearchParams | string = ""): URLSearchParams {
  const next = new URLSearchParams(asParams(base));
  for (const key of KEYS) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const written = (CODECS[key] as Codec<unknown>).write(patch[key]);
    if (written === null) next.delete(key);
    else next.set(key, key === "window" ? written.toLowerCase() : written);
  }
  return next;
}

/**
 * Context the left rail carries: the same as the command bar minus `from`. `from` is a breadcrumb origin
 * for one hop, not context to follow into an unrelated screen (audit L3).
 */
export const RAIL_CONTEXT_KEYS = ["env", "window", "ccy", "workspace_id"] as const satisfies readonly (typeof CONTEXT_KEYS)[number][];

/**
 * True for an app-internal path: starts with one `/` and is not protocol-relative (`//host`, `/\host`).
 * Anything else (absolute URL, `mailto:`, `javascript:`, bare or query-only text) is not ours to decorate.
 */
export function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\");
}

/**
 * Carries the context params of `current` onto an internal link. The link's own
 * values win; each context key ends up at most once; the hash is kept. Only an
 * href that is an internal path (`isInternalPath`) is touched: absolute URLs,
 * other schemes, protocol-relative and relative hrefs come back unchanged, with
 * no context. `keys` narrows what is carried (the rail leaves `from` out).
 */
export function withContext(href: string, current: URLSearchParams | string, keys: readonly (typeof CONTEXT_KEYS)[number][] = CONTEXT_KEYS): string {
  if (!isInternalPath(href)) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  const rest = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = rest.indexOf("?");
  const path = queryAt < 0 ? rest : rest.slice(0, queryAt);
  const own = new URLSearchParams(queryAt < 0 ? "" : rest.slice(queryAt + 1));

  const { value } = parseUrlParams(current);
  const carried = serializeUrlParams(Object.fromEntries(keys.map((key) => [key, value[key]])));
  for (const [key, text] of carried) if (!own.has(key)) own.set(key, text);
  for (const key of CONTEXT_KEYS) if (own.getAll(key).length > 1) own.set(key, own.get(key) ?? "");

  const query = own.toString();
  return `${path}${query === "" ? "" : `?${query}`}${hash}`;
}

/** `search` without the named keys; every other param is kept in order. */
export function withoutParams(search: URLSearchParams | string, drop: readonly string[]): URLSearchParams {
  const next = new URLSearchParams(asParams(search));
  for (const key of drop) next.delete(key);
  return next;
}

export interface ExecUrlState extends ParsedUrlState {
  set(patch: Partial<ExecUrlParams>, options?: { replace?: boolean }): void;
  /** Forget the invalid keys once the screen has told the user. */
  clearInvalid(): void;
}

/**
 * Thin hook over `useSearchParams`. A URL that is not canonical (invalid value,
 * explicit default, upper-case window) is rewritten once with `replace`; the
 * invalid keys are remembered so a notice can outlive the rewrite.
 */
export function useExecUrlState(): ExecUrlState {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseUrlParams(params), [params]);
  const [seen, setSeen] = useState<readonly ExecUrlKey[]>([]);

  useEffect(() => {
    const canonical = serializeUrlParams(parsed.value, params);
    if (canonical.toString() !== params.toString()) setParams(canonical, { replace: true });
    if (parsed.invalid.length > 0) {
      setSeen((prev) => (parsed.invalid.every((key) => prev.includes(key)) ? prev : [...new Set([...prev, ...parsed.invalid])]));
    }
  }, [parsed, params, setParams]);

  const set = useCallback(
    (patch: Partial<ExecUrlParams>, options?: { replace?: boolean }) =>
      setParams(serializeUrlParams(patch, params), { replace: options?.replace ?? false }),
    [params, setParams],
  );
  const clearInvalid = useCallback(() => setSeen([]), []);

  const invalid = useMemo(() => [...new Set([...seen, ...parsed.invalid])], [seen, parsed.invalid]);

  return { value: parsed.value, invalid, set, clearInvalid };
}
