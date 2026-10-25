import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CurrentSourcePrincipal } from "../src/execution/current-source.proxy";
import { createPaperVenueCalendarSource, type VenueCalendarReadContext,
  type VenueCalendarSourceInstallation, type VenueCalendarSourceSnapshot } from "../src/execution/venue-calendar-source";
import { assertPublishedSchema } from "./stage-contract-validator";

const snapshot = () => JSON.parse(readFileSync(join(__dirname, "fixtures/paper-venue-calendar.synthetic.json"), "utf8")) as VenueCalendarSourceSnapshot;
const principal: CurrentSourcePrincipal = { workspaceId: "synthetic-workspace", user: {
  userId: "synthetic-user", username: "synthetic-user", displayName: "Synthetic user", role: "USER", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1, disabledAt: null,
  createdAt: new Date(0), updatedAt: new Date(0),
}, session: { sessionId: "synthetic-session", userId: "synthetic-user", state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date(0), idleExpiresAt: new Date("2099-01-01"), absoluteExpiresAt: new Date("2099-01-01") } };
const context: VenueCalendarReadContext = { environment: "paper", profile_id: "synthetic-paper",
  deployment_id: "synthetic-deployment", venue: "SYNTHETIC_VN" };
function setup() {
  let source: unknown = snapshot(), now = Date.parse("2026-10-25T01:00:02Z"), missing = false, revoked = false;
  const checks = vi.fn(async () => { if (revoked) throw new Error("private source detail"); });
  const provider = vi.fn<VenueCalendarSourceInstallation["withVerifiedSnapshot"]>(async (_principal, _context, use) =>
    use(missing ? null : { snapshot: source, assertCurrent: checks }));
  const binding = { workspace_id: "synthetic-workspace", profile_id: "synthetic-paper", venue: "SYNTHETIC_VN",
    source_ref: "synthetic-edge-calendar", catalogue_revision: "synthetic-catalogue-1", withVerifiedSnapshot: provider };
  const service = createPaperVenueCalendarSource(binding, () => now);
  return { service, provider, binding, checks, source: () => source as VenueCalendarSourceSnapshot,
    replace: (value: unknown) => { source = value; }, now: (value: number) => { now = value; },
    missing: () => { missing = true; }, revoke: () => { revoked = true; } };
}

describe("private Edge calendar BFF source (synthetic lease; not connected acceptance)", () => {
  it("publishes the existing public Fact contract, exact zero/false and no private source pins", async () => {
    const f = setup(); const result = await f.service.withCalendar(principal, context, async value => value);
    assertPublishedSchema("execution-stage-facts.v1.schema.json", "VenueCalendar", result);
    expect(result.is_open).toEqual({ availability: "AVAILABLE", value: false, reason_code: null });
    expect(result.holidays.value).toEqual([]);
    expect(result.windows.value?.map(value => value.kind)).toEqual(["OPENING_AUCTION", "TRADING_SESSION", "TRADING_SESSION", "CLOSING_AUCTION"]);
    expect(result.breaks.value).toEqual([{ name: "BREAK", from: "11:30", to: "13:00", basis: "GAP_BETWEEN_PUBLISHED_WINDOWS" }]);
    expect(result.as_of.value).toBe("2026-10-25T01:00:00.000Z");
    expect(JSON.stringify(result)).not.toMatch(/synthetic-(edge|catalogue|calendar)|source_revision|observed_at_ms|expires_at_ms/);
    expect(f.checks).toHaveBeenCalledTimes(2);
    expect(f.provider.mock.calls[0]?.slice(0, 2)).toEqual([principal, context]);
    expect(f.provider.mock.calls[0]?.[0]).not.toBe(principal);
  });
  it("round-trips the unchanged canonical public fixture already consumed by the frontend reader", async () => {
    const value = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"),
      "fixtures/execution-venue-calendar.synthetic.valid.json"), "utf8")).value;
    const f = setup(), source = f.source(), at = Date.parse(value.as_of.value);
    source.source_as_of = value.as_of.value; source.observed_at_ms = at + 1000; source.expires_at_ms = at + 600_000;
    source.payload = { timezone: value.timezone.value, is_open: value.is_open.value, holidays: value.holidays.value,
      sessions: value.windows.value.map(({ name, open, close }: { name: string; open: string; close: string }) => ({ name, open, close })) };
    f.now(at + 2000);
    expect(await f.service.withCalendar(principal, context, async calendar => calendar)).toEqual(value);
  });
  it.each(["workspace", "profile", "venue", "environment"])("does not query a foreign %s source", async axis => {
    const f = setup(), actor = structuredClone(principal), selected = structuredClone(context);
    if (axis === "workspace") actor.workspaceId = "foreign";
    if (axis === "profile") selected.profile_id = "foreign";
    if (axis === "venue") selected.venue = "foreign";
    if (axis === "environment") (selected as any).environment = "live";
    const result = await f.service.withCalendar(actor, selected, async value => value);
    expect(result.windows.reason_code).toBe("SOURCE_CALENDAR_NOT_BOUND");
    expect(f.provider).not.toHaveBeenCalled();
  });
  it("treats a missing source as typed absence, not an empty calendar or 0", async () => {
    const f = setup(); f.missing();
    const result = await f.service.withCalendar(principal, context, async value => value);
    expect(result.windows.value).toBeNull(); expect(result.is_open.value).toBeNull();
    expect(result.as_of.reason_code).toBe("SOURCE_CALENDAR_NOT_PUBLISHED");
    expect(f.checks).not.toHaveBeenCalled();
  });
  it.each(["workspace_id", "profile_id", "venue", "source_ref", "catalogue_revision", "environment", "market"])(
    "rejects a mismatched %s publication before delivery", async key => {
      const f = setup(); f.replace({ ...f.source(), [key]: "foreign" }); const deliver = vi.fn();
      await expect(f.service.withCalendar(principal, context, deliver)).rejects.toThrow();
      expect(deliver).not.toHaveBeenCalled();
    });
  it.each(["expired", "future-observation", "future-source", "invalid-time", "nan-clock"])(
    "refuses %s rather than substituting the Portal observation clock", async problem => {
      const f = setup(), source = f.source();
      if (problem === "expired") f.now(source.expires_at_ms);
      if (problem === "future-observation") source.observed_at_ms = source.expires_at_ms - 1;
      if (problem === "future-source") source.source_as_of = "2026-10-25T02:00:00Z";
      if (problem === "invalid-time") source.source_as_of = "2026-02-30T00:00:00Z";
      if (problem === "nan-clock") f.now(NaN);
      const deliver = vi.fn();
      await expect(f.service.withCalendar(principal, context, deliver)).rejects.toThrow();
      expect(deliver).not.toHaveBeenCalled();
    });
  it("rechecks expiry after workbench composition and never releases the prepared body", async () => {
    const f = setup();
    await expect(f.service.withCalendar(principal, context, async () => {
      f.now(f.source().expires_at_ms); return { private_body: true };
    })).rejects.toMatchObject({ code: "SOURCE_CALENDAR_EXPIRED" });
  });
  it.each([false, true])("refuses a revoked lease before/after composition (%s) with safe error copy", async after => {
    const f = setup(); if (!after) f.revoke(); const deliver = vi.fn(async () => { f.revoke(); return "not delivered"; });
    await expect(f.service.withCalendar(principal, context, deliver)).rejects.toMatchObject({
      code: "SOURCE_CALENDAR_ACCESS_CHANGED", message: "SOURCE_CALENDAR_ACCESS_CHANGED" });
    expect(deliver).toHaveBeenCalledTimes(after ? 1 : 0);
  });
  it("detaches source bytes so an in-flight mutation cannot alter the mapped response", async () => {
    const f = setup(); f.checks.mockImplementation(async () => { (f.source().payload as any).is_open = true; });
    const result = await f.service.withCalendar(principal, context, async value => value);
    expect(result.is_open.value).toBe(false);
  });
  it.each(["oversized", "missing-payload", "extra", "undefined"])("rejects %s input before mapping", async problem => {
    const f = setup();
    if (problem === "oversized") f.replace({ ...f.source(), payload: { long: "界".repeat(262_144 / 3) } });
    if (problem === "missing-payload") { const value: any = f.source(); delete value.payload; }
    if (problem === "extra") f.replace({ ...f.source(), credential: "private" });
    if (problem === "undefined") f.replace(undefined);
    await expect(f.service.withCalendar(principal, context, async value => value)).rejects.toMatchObject({ code: "SOURCE_CALENDAR_PAYLOAD_INVALID" });
  });
  it("keeps invalid sessions and unknown holidays typed, without discarding valid independent facts", async () => {
    const f = setup(); const source = f.source(), block = source.payload as any; block.sessions.reverse(); delete block.holidays;
    const result = await f.service.withCalendar(principal, context, async value => value);
    expect(result.windows.reason_code).toBe("SOURCE_SESSIONS_NOT_ORDERED_OR_INVALID");
    expect(result.holidays.reason_code).toBe("SOURCE_HOLIDAY_LIST_NOT_PUBLISHED"); expect(result.timezone.value).toBe("Asia/Ho_Chi_Minh");
  });
  it("does not replace business callback failures with a calendar result or invoke delivery again", async () => {
    const f = setup(), expected = new Error("original workbench failure"), deliver = vi.fn(async () => { throw expected; });
    await expect(f.service.withCalendar(principal, context, deliver)).rejects.toBe(expected);
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it("rejects adapters that omit or repeat their source-disclosure callback", async () => {
    for (const repeat of [false, true]) {
      const f = setup();
      const bad = createPaperVenueCalendarSource({ ...f.binding, async withVerifiedSnapshot(_actor, _context, use) {
        if (!repeat) return undefined as never;
        await use(null); return use(null);
      } });
      const deliver = vi.fn(async value => value);
      await expect(bad.withCalendar(principal, context, deliver)).rejects.toMatchObject({ code: "SOURCE_CALENDAR_BINDING_INVALID" });
      expect(deliver).toHaveBeenCalledTimes(repeat ? 1 : 0);
    }
  });
});
