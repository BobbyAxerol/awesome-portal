/**
 * Opt-in FIXTURE_LAB review projections, never a product/source adapter.
 *
 * Three legacy Portfolio double account keys name counterparts the Account double actually holds.
 * Those exact references are unified. Scaled internal account balances also use
 * the shared deployment graph; generated bindings share an explicit synthetic
 * physical book. Native legacy adverse scenarios are not rewritten or
 * relabelled as economic sleeves.
 * Unknown resources/errors remain unknown; an account alias in the URL is not a fallback lookup.
 * The caller must opt in AFTER selecting the original response and preserve its HTTP status.
 */
export type ReviewProfile = "populated" | "layout-stress";
import { scaled, addDecimal } from "../frontend/e2e/bffScale";
import { linkedAccountFigures } from "./review-accounts";

/** Review-only internal balance projection from the same deployment graph as
 * Manager. Physical broker equity/wallet and native sparse fixtures are untouched. */
function linkedBalances(rows: unknown[]): unknown[] {
  return rows.map(row => {
    if (!record(row) || typeof row.account_id !== "string" || typeof row.currency !== "string") return row;
    const binding = scaled().bindings.find(b => b.accountId === row.account_id);
    if (!binding) return row;
    const members = scaled().alphas.flatMap(a => a.deployments).filter(d =>
      d.accountId === row.account_id && d.environment === binding.environment && d.currency === row.currency);
    if (!members.length) return row;
    const total = members.reduce((n, d) => addDecimal(addDecimal(n, d.allocation), d.realized), "0");
    if (typeof row.locked !== "string" || !/^-?\d+(\.\d+)?$/.test(row.locked)) return row;
    const negativeLocked = row.locked.startsWith("-") ? row.locked.slice(1) : `-${row.locked}`;
    return { ...row, total, free: addDecimal(total, negativeLocked) };
  });
}

const ACCOUNT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  "Binance-02": "acc_bnc_core",
  "OKX-01": "acc_okx_main",
  "Paper-Binance": "acc_pap_sim",
});
const HUMAN_NAMES = new Set(["display_name", "portfolio_name", "alpha_name", "account_name", "deployment_name"]);
const ENTITY_KEYS = ["alpha_id", "strategy_id", "portfolio_id", "account_id", "deployment_id", "row_key"];
const STRESS_SUFFIX = " · Nhóm nghiên cứu đa thị trường — danh mục dài để kiểm tra xuống dòng, dấu tiếng Việt và 日本語";

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function accountKey(value: string): string {
  return Object.prototype.hasOwnProperty.call(ACCOUNT_KEYS, value) ? ACCOUNT_KEYS[value]! : value;
}

/** Only same-origin account links, never arbitrary URLs, query text or opaque cursor content. */
function accountLink(value: string): string {
  return value.replace(/^(\/(?:deployments\/accounts|api\/v1\/execution\/resources\/accounts)\/)(Binance-02|OKX-01|Paper-Binance)(?=\/|\?|#|$)/u,
    (_match, prefix: string, id: string) => `${prefix}${accountKey(id)}`);
}

function longName(value: string): string {
  if (value.trim() === "" || value.endsWith(STRESS_SUFFIX)) return value;
  // Under the published Manager name ceiling (256 UTF-16 code units); no control/bidi/zero-width characters.
  // Array.from also avoids splitting an astral character when retaining the beginning of a name.
  return `${Array.from(value).slice(0, 64).join("")}${STRESS_SUFFIX}`;
}

function walk(value: unknown, stress: boolean): unknown {
  if (Array.isArray(value)) return value.map((child) => walk(child, stress));
  if (!record(value)) return value;
  // Do not rewrite even display strings in nested typed errors/refusals.
  if (Object.prototype.hasOwnProperty.call(value, "error")) return value;
  const entity = ENTITY_KEYS.some((key) => typeof value[key] === "string");
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === "account_balances" && Array.isArray(child)) return [key, linkedBalances(child).map(row => walk(row, stress))];
    if (key === "account_id" && typeof child === "string") return [key, accountKey(child)];
    if (key === "account_ids" && Array.isArray(child)) return [key, child.map((id) => typeof id === "string" ? accountKey(id) : id)];
    if (key === "id" && value.kind === "ACCOUNT" && typeof child === "string") return [key, accountKey(child)];
    if ((key === "href" || key === "url") && typeof child === "string") return [key, accountLink(child)];
    if (stress && typeof child === "string" && (HUMAN_NAMES.has(key) || (entity && (key === "name" || key === "label")))) {
      return [key, longName(child)];
    }
    return [key, walk(child, stress)];
  }));
}

/**
 * JSON bodies only, explicitly selected review profiles only. Defaults are unchanged because nothing
 * calls this function without opting in. No added rows, permissions or successful outcomes.
 */
export function transformReviewBody(path: string, body: unknown, profile: ReviewProfile): unknown {
  const pathname = path.split("?", 1)[0]!;
  if (!pathname.startsWith("/api/v1/execution/") && pathname !== "/api/admin/accounts") return body;
  if (!record(body) || Object.prototype.hasOwnProperty.call(body, "error")) return body;
  return walk(linkedAccountFigures(pathname, body), profile === "layout-stress");
}
