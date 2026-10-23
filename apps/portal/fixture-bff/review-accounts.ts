/** FIXTURE_LAB only: a single synthetic physical book alongside the shared
 * deployment graph. Never derive physical equity from an internal balance in
 * a real adapter. Named native/adverse fixtures are intentionally untouched. */
import { scaled, addDecimal } from "../frontend/e2e/bffScale";
import { ACCOUNT_DOUBLE_AS_OF } from "../frontend/e2e/bffDoubleAccount";

type Obj = Record<string, any>;
type Book = { binding: ReturnType<typeof scaled>["bindings"][number]; buckets: Obj[] };
const cache = new WeakMap<object, Map<string, Book>>();
const accountCache = new WeakMap<object, Map<string, Book>>();
const object = (x: unknown): x is Obj => x !== null && typeof x === "object" && !Array.isArray(x);

function books(): Map<string, Book> {
  const world = scaled();
  const hit = cache.get(world);
  if (hit) return hit;
  const out = new Map<string, Book>();
  const byAccount = new Map<string, Map<string, string>>();
  for (const alpha of world.alphas) for (const deployment of alpha.deployments) {
    const key = `${deployment.environment}:${deployment.accountId}`;
    const amounts = byAccount.get(key) ?? new Map<string, string>();
    amounts.set(deployment.currency, addDecimal(amounts.get(deployment.currency) ?? "0", deployment.allocation));
    byAccount.set(key, amounts);
  }
  for (const binding of world.bindings) {
    const amounts = byAccount.get(`${binding.environment}:${binding.accountId}`) ?? new Map([["USDT", "0"]]);
    const buckets = [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, used]) => ({
      currency, used, reserved: "100", available: "900", headroom: "1000",
      // Synthetic independent venue report, deliberately NOT the internal NAV
      // and deliberately different from wallet balance (a 10-unit venue PnL).
      native_equity: addDecimal(used, "1000"), wallet_balance: addDecimal(used, "990"),
    }));
    out.set(binding.bindingId, { binding, buckets });
  }
  cache.set(world, out);
  accountCache.set(world, new Map([...out.values()].map(book => [book.binding.accountId, book])));
  return out;
}

function sourceAbsent(book: Book): boolean {
  return book.binding.credentialState === "NOT_PUBLISHED" || book.binding.credentialState === "EXPIRED";
}

function figures(book: Book, at: string): Obj {
  if (sourceAbsent(book)) return {
    native_equity: null, virtual_used: null, virtual_headroom: null, sleeve_count: null,
  };
  const amounts = (key: string) => book.buckets.map(b => ({ currency: b.currency, value: b[key], observed_at: at, coverage: "COMPLETE" }));
  return { native_equity: amounts("native_equity"), virtual_used: amounts("used"), virtual_headroom: amounts("headroom"),
    sleeve_count: { count: 1, observed_at: at, coverage: "COMPLETE" } };
}

/** One cached O(bindings + deployments) graph; no per-row reader/network calls. */
export function linkedAccountFigures(pathname: string, input: unknown): unknown {
  if (!object(input) || "error" in input) return input;
  const path = pathname.replace(/^\/api\/v1\/execution/, "");
  if (path === "/broker-bindings" && object(input.page) && Array.isArray(input.page.rows) && typeof input.source_as_of === "string") {
    return { ...input, page: { ...input.page, rows: input.page.rows.map((row: Obj) => {
      const book = books().get(row.binding_id);
      return book ? { ...row, figures: figures(book, input.source_as_of) } : row;
    }) } };
  }
  const binding = /^\/broker-bindings\/([^/]+)(\/exposure)?$/.exec(path);
  if (binding) {
    const book = books().get(decodeURIComponent(binding[1]!));
    if (!book) return input;
    if (!binding[2] && object(input.item) && typeof input.source_as_of === "string")
      return { ...input, item: { ...input.item, figures: figures(book, input.source_as_of) } };
    if (binding[2] && object(input.analytics) && object(input.analytics.data)) {
      const at = ACCOUNT_DOUBLE_AS_OF;
      const absent = sourceAbsent(book);
      return { ...input, analytics: { ...input.analytics, input_as_of: at, panel_state: absent ? "unavailable" : input.analytics.panel_state,
        input_completeness: absent ? "UNKNOWN" : "COMPLETE", data: { ...input.analytics.data,
          binding_id: book.binding.bindingId, account_count: absent ? 0 : 1, expected_account_count: 1,
          population_completeness: absent ? "UNKNOWN" : "COMPLETE",
          buckets: absent ? [] : book.buckets.map(({ currency, used, reserved, available, headroom }) => ({
            currency, used, reserved, available, headroom, account_count: 1, oldest_source_as_of: at, newest_source_as_of: at,
          })),
        } } };
    }
  }
  const account = /^\/resources\/accounts\/([^/]+)$/.exec(path);
  if (account && object(input.data)) {
    books();
    const book = accountCache.get(scaled())!.get(decodeURIComponent(account[1]!));
    if (!book || sourceAbsent(book)) return input;
    const at = input.as_of;
    // This explicit synthetic source is shared by all three reads. Existing
    // expired/missing-source fixtures keep their source-gap capabilities.
    const broker_sync = book.buckets.map(b => ({ sync_id: `review:${book.binding.bindingId}:${b.currency}`,
      source: "BROKER", status: book.binding.credentialState === "SYNC_SYNCED" ? "SYNCED" : "STALE",
      currency: b.currency, native_equity: b.native_equity, wallet_balance: b.wallet_balance,
      synced_at: at, synced_at_ms: Date.parse(at),
    }));
    return { ...input, data: { ...input.data, broker_sync } };
  }
  return input;
}
