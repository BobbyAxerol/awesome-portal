/** T3: Bindings are keyed by venue_account_id; mode and venue come from public.accounts via account_id. */
import { describe, expect, it } from "vitest";
import { bindingRows } from "../src/manager-lists/manager-lists.service";
import { CONDITIONAL_LEG_FIELDS, VENUE_ACCOUNT_FIELDS, profileProjectionCatalog } from "../src/execution/profile-projection.catalog";

const at = "2026-11-22T00:00:00.000Z";
const account = (id: string, mode: string, venue = "OKX") => ({ account_id: id, mode, venue, active: true, updated_at: at });
const venueAccount = (id: string, accountId: string) => ({ venue_account_id: id, account_id: accountId, venue: "OKX", active: true, updated_at: at });

describe("T3 Bindings keyed by venue_account_id", () => {
  it("uses venue_account_id as the binding id and takes the mode from accounts, not the profile", () => {
    const rows = bindingRows([account("a1", "PAPER"), account("a2", "live")], [venueAccount("va1", "a1"), venueAccount("va2", "a2")], [], "paper");
    expect(rows.map((row) => [row.bindingId, row.accountId, row.venue])).toEqual([["va1", "a1", "OKX"]]);
  });
  it("fails closed for a venue account whose account is not read or has no mode", () => {
    expect(bindingRows([account("a1", "paper")], [venueAccount("va9", "missing")], [], "paper")).toEqual([]);
    expect(bindingRows([{ account_id: "a1", venue: "OKX" }], [venueAccount("va1", "a1")], [], "paper")).toEqual([]);
  });
  it("ignores a legacy binding_id and skips rows without venue_account_id", () => {
    const rows = bindingRows([account("a1", "paper")], [{ account_id: "a1", binding_id: "old" }], [], "paper");
    expect(rows).toEqual([]);
  });
  it("keeps the account-derived fallback when venue_accounts is empty", () => {
    expect(bindingRows([account("a1", "paper")], [], [], "paper").map((row) => row.bindingId)).toEqual(["a1@OKX"]);
  });
});

describe("T3 projection catalogue column lists", () => {
  it("requests exactly the Edge-returnable columns and never mode/binding_id/state/status for venue_accounts", () => {
    expect([...VENUE_ACCOUNT_FIELDS]).toEqual(["venue_account_id", "account_id", "venue", "external_account_ref", "market_type", "order_category", "active", "created_at", "updated_at"]);
    expect(CONDITIONAL_LEG_FIELDS).toHaveLength(32);
    expect(CONDITIONAL_LEG_FIELDS).not.toContain("payload");
    expect(CONDITIONAL_LEG_FIELDS).not.toContain("spawned_order_ids");
    for (const env of ["paper", "sandbox", "live"] as const) {
      const bindings = profileProjectionCatalog(env);
      expect(bindings.find((b) => b.key === "venue_accounts")?.fields).toEqual(VENUE_ACCOUNT_FIELDS);
      expect(bindings.find((b) => b.key === "service_heartbeats")?.internal).toBe(true);
    }
  });
});
