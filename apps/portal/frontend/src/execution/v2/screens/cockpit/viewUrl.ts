/**
 * The cockpit's lane, lens and waiver filter in the URL (route audit M9,
 * review2/07: `view=<server view key>`), so a reload and Back restore them.
 *
 *   view=r1 | r2 | exit-reviews | live | waiver     (the All lane is the default and stays out)
 *   lens=needs | yours | closed                     (Open is the default and stays out)
 *   waiver=open | expiring | waived | lapsed        (All is the default and stays out; read in any case)
 *
 * An unknown value reads as the default; the canonical form is written back
 * without it. The three are screen-local: they do not travel to other screens.
 */
import { FAMILY_LANES, LENSES, type FamilyLane, type Lane, type Lens } from "./laneModel";
import { WAIVER_STATES, type WaiverFilter } from "./Queue";

export const LANE_VIEW: Readonly<Record<Exclude<Lane, "all">, string>> = {
  r1: "r1",
  r2: "r2",
  exit: "exit-reviews",
  live: "live",
  waiver: "waiver",
};

export function laneFromView(raw: string | null): Lane {
  if (raw === null) return "all";
  const key = raw.trim().toLowerCase();
  const hit = (Object.entries(LANE_VIEW) as [Exclude<Lane, "all">, string][]).find(([, view]) => view === key);
  return hit ? hit[0] : "all";
}

/** `view=archive | reactivation | capital`: a family panel, not a gate lane (the gate lane then reads as All). */
export function familyFromView(raw: string | null): FamilyLane | null {
  const key = (raw ?? "").trim().toLowerCase();
  return FAMILY_LANES.find((family) => family.id === key)?.id ?? null;
}

export const viewOfLane = (lane: Lane): string | null => (lane === "all" ? null : LANE_VIEW[lane]);

export function lensFromUrl(raw: string | null): Lens {
  const key = (raw ?? "").trim().toLowerCase();
  return (LENSES as readonly string[]).includes(key) ? (key as Lens) : "open";
}

export const urlOfLens = (lens: Lens): string | null => (lens === "open" ? null : lens);

export function waiverFromUrl(raw: string | null): WaiverFilter {
  const key = (raw ?? "").trim().toUpperCase();
  return (WAIVER_STATES as readonly string[]).includes(key) ? (key as WaiverFilter) : "ALL";
}

export const urlOfWaiver = (filter: WaiverFilter): string | null => (filter === "ALL" ? null : filter.toLowerCase());

export interface CockpitView {
  lane?: Lane;
  lens?: Lens;
  waiver?: WaiverFilter;
  /** A family panel; wins over `lane` for the `view` key. `null` leaves the key to `lane`. */
  family?: FamilyLane | null;
}

/** `base` with the given parts written (a default removes its key); every other param is kept. Never touches `sel`. */
export function writeView(base: URLSearchParams | string, patch: CockpitView): URLSearchParams {
  const next = new URLSearchParams(typeof base === "string" ? base : base.toString());
  const put = (key: string, value: string | null) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  };
  if (patch.lane !== undefined) put("view", viewOfLane(patch.lane));
  if (patch.family != null) put("view", patch.family);
  if (patch.lens !== undefined) put("lens", urlOfLens(patch.lens));
  if (patch.waiver !== undefined) put("waiver", urlOfWaiver(patch.waiver));
  return next;
}
