import { z } from "zod";
import type { CurrentSourcePrincipal } from "./current-source.proxy";
import { unpublishedVenueCalendar, venueCalendarFromSource, type VenueCalendar } from "./venue-calendar";

export const PAPER_VENUE_CALENDAR_SOURCE = Symbol("PAPER_VENUE_CALENDAR_SOURCE");
const text = z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/u);
const milliseconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const snapshotSchema = z.object({
  schema_version: z.literal("portal.internal.venue-calendar.v1"),
  workspace_id: text, environment: z.literal("paper"), profile_id: text, venue: text,
  market: z.literal("VN_EQUITY"), source_ref: text, catalogue_revision: text,
  source_revision: text, source_as_of: z.string().datetime({ offset: true }),
  observed_at_ms: milliseconds, expires_at_ms: milliseconds,
  payload: z.unknown().refine(value => value !== undefined),
}).strict();
export type VenueCalendarSourceSnapshot = z.infer<typeof snapshotSchema>;
export interface VenueCalendarReadContext {
  environment: "paper"; profile_id: string | null; deployment_id: string; venue: string;
}
export interface PaperVenueCalendarSource {
  withCalendar<T>(principal: CurrentSourcePrincipal, context: VenueCalendarReadContext,
    deliver: (calendar: VenueCalendar) => Promise<T>): Promise<T>;
}
export class VenueCalendarSourceError extends Error {
  constructor(readonly code: "SOURCE_CALENDAR_BINDING_INVALID" | "SOURCE_CALENDAR_EXPIRED" |
    "SOURCE_CALENDAR_ACCESS_CHANGED" | "SOURCE_CALENDAR_PAYLOAD_INVALID") { super(code); }
}
export interface VenueCalendarSourceInstallation {
  workspace_id: string; profile_id: string; venue: string; source_ref: string; catalogue_revision: string;
  /** The owner supplies an authenticated Edge read under the ORIGINAL human's
   * independent CURRENT authority. It holds its source/custody fence until the
   * callback finishes. This is not a raw fetch or a self-reported quality bit.
   * No direct DL access, credential, URL, role default or STREAM grant is added.
   * A null lease is an explicit missing calendar, not an empty trading day. */
  withVerifiedSnapshot<T>(principal: CurrentSourcePrincipal, context: Readonly<VenueCalendarReadContext>,
    use: (lease: { snapshot: unknown; assertCurrent(): Promise<void> } | null) => Promise<T>): Promise<T>;
}

/** Private, bounded BFF composition. Absent installation leaves the deployed
 * default byte-identical. Installing this seam alone does NOT qualify Edge's
 * SOURCE_DARK calendar or install an upstream transport/provider. */
export function createPaperVenueCalendarSource(installation: VenueCalendarSourceInstallation,
  now: () => number = Date.now): PaperVenueCalendarSource {
  const bindingSchema = snapshotSchema.pick({ workspace_id: true, profile_id: true, venue: true,
    source_ref: true, catalogue_revision: true });
  const binding = Object.freeze(bindingSchema.parse({ workspace_id: installation.workspace_id,
    profile_id: installation.profile_id, venue: installation.venue, source_ref: installation.source_ref,
    catalogue_revision: installation.catalogue_revision }));
  if (typeof installation.withVerifiedSnapshot !== "function") throw new VenueCalendarSourceError("SOURCE_CALENDAR_BINDING_INVALID");
  const withSnapshot = installation.withVerifiedSnapshot.bind(installation);
  return Object.freeze({ async withCalendar<T>(principal: CurrentSourcePrincipal, context: VenueCalendarReadContext,
    deliver: (calendar: VenueCalendar) => Promise<T>): Promise<T> {
    // Scope mismatch never asks an unrelated provider to discover the resource.
    if (principal.workspaceId !== binding.workspace_id || context.environment !== "paper" ||
      context.profile_id !== binding.profile_id || context.venue !== binding.venue)
      return deliver(unpublishedVenueCalendar("SOURCE_CALENDAR_NOT_BOUND"));
    const actor = structuredClone(principal), selected = Object.freeze({ ...context });
    // A misbehaving adapter must not run the workbench twice or silently claim
    // to have used a calendar while skipping the final-disclosure callback.
    let calls = 0;
    const result = await withSnapshot(actor, selected, async lease => {
      if (++calls !== 1) throw new VenueCalendarSourceError("SOURCE_CALENDAR_BINDING_INVALID");
      if (lease === null) return deliver(unpublishedVenueCalendar("SOURCE_CALENDAR_NOT_PUBLISHED"));
      let source: VenueCalendarSourceSnapshot;
      try {
        if (Buffer.byteLength(JSON.stringify(lease.snapshot), "utf8") > 262_144) throw new Error();
        source = snapshotSchema.parse(structuredClone(lease.snapshot));
      } catch { throw new VenueCalendarSourceError("SOURCE_CALENDAR_PAYLOAD_INVALID"); }
      if (Object.entries(binding).some(([key, value]) => source[key as keyof typeof binding] !== value))
        throw new VenueCalendarSourceError("SOURCE_CALENDAR_BINDING_INVALID");
      const assertTime = () => {
        const at = now(), asOf = Date.parse(source.source_as_of);
        if (!Number.isSafeInteger(at) || at < 0 || !Number.isFinite(asOf) || asOf > source.observed_at_ms ||
          source.observed_at_ms > at || source.expires_at_ms <= source.observed_at_ms || at >= source.expires_at_ms)
          throw new VenueCalendarSourceError("SOURCE_CALENDAR_EXPIRED");
      };
      const assertCurrent = async () => {
        assertTime();
        try { await lease.assertCurrent(); }
        catch { throw new VenueCalendarSourceError("SOURCE_CALENDAR_ACCESS_CHANGED"); }
        assertTime();
      };
      await assertCurrent();
      const response = await deliver(venueCalendarFromSource(source.payload, source.source_as_of));
      await assertCurrent();
      return response;
    });
    if (calls !== 1) throw new VenueCalendarSourceError("SOURCE_CALENDAR_BINDING_INVALID");
    return result;
  } });
}
