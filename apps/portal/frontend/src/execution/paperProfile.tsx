/**
 * Paper profile selection (option B). The Paper screens read ONE Paper profile per request; Core publishes the allow-list it is
 * willing to serve (`read_profiles`) and the profile a body describes (`delivery_profile`). The choice lives in the URL
 * (`paper_profile`), so a link, reload and Back keep it, and an absent param is the stack default (nothing changes unless the
 * reader picks another profile).
 *
 * Two rules keep a screen from mixing profiles:
 *  - the profile-routed reads (`/screens/paper`, `/screens/paper/{id}[/vn-market]`, `/screens/blotter`, and on a Portfolio 360 page
 *    `/resources/portfolios/{id}` and `/derivations/portfolios/{id}/capital`) carry `profile_id`;
 *  - every other Paper-bound read (source health, execution quality, capital, sparklines, mirror integrity) is NOT routed by
 *    profile, so while a non-default profile is selected the API layer answers "unavailable" for them instead of drawing the
 *    default profile's numbers under another profile's name.
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import { profileLabel } from "./v2/profileLabel";

export const PAPER_PROFILE_PARAM = "paper_profile";
const PAPER_PROFILES = ["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP"] as const;
export type PaperProfileId = (typeof PAPER_PROFILES)[number];

/** The URL value when it names a known Paper profile; anything else reads as "the default". */
export function parsePaperProfile(value: string | null | undefined): PaperProfileId | null {
  return (PAPER_PROFILES as readonly string[]).includes(value ?? "") ? (value as PaperProfileId) : null;
}

/** The routes that are Paper screens: the only places the selection applies and travels to. */
export function isPaperScreenPath(path: string): boolean {
  return /^\/deployments\/(paper|blotter)(\/|$)/.test(path) || /^\/deployments\/(portfolios|accounts)\/[^/]+/.test(path);
}

/** The selection in the live URL, for the API layer (which has no router context). Never throws. */
export function selectedPaperProfile(): PaperProfileId | null {
  try {
    if (typeof window === "undefined" || !isPaperScreenPath(window.location.pathname)) return null;
    return parsePaperProfile(new URLSearchParams(window.location.search).get(PAPER_PROFILE_PARAM));
  } catch {
    return null;
  }
}

/** `path` with `profile_id` appended when a non-default profile is selected; otherwise unchanged (byte-identical default reads). */
export function withPaperProfile(path: string, profile: PaperProfileId | null = selectedPaperProfile()): string {
  if (profile === null) return path;
  return `${path}${path.includes("?") ? "&" : "?"}profile_id=${encodeURIComponent(profile)}`;
}

/** Read the selection from the router (so a change re-renders and re-reads) and a setter that keeps every other param. */
export function usePaperProfile(): { selected: PaperProfileId | null; select(next: string | null): void } {
  const [params, setParams] = useSearchParams();
  const selected = parsePaperProfile(params.get(PAPER_PROFILE_PARAM));
  const select = useCallback((next: string | null) => {
    setParams((current) => {
      const copy = new URLSearchParams(current);
      const profile = parsePaperProfile(next);
      if (profile === null) copy.delete(PAPER_PROFILE_PARAM);
      else copy.set(PAPER_PROFILE_PARAM, profile);
      // A cursor belongs to one profile's page; never carry it across a switch.
      copy.delete("after");
      copy.delete("before");
      return copy;
    }, { replace: false });
  }, [setParams]);
  return { selected, select };
}

/** The allow-list a body published, in the order Core published it (default first). Unknown words are dropped. */
export function readProfilesOf(raw: unknown): readonly PaperProfileId[] {
  return Array.isArray(raw) ? raw.flatMap((item) => { const p = parsePaperProfile(typeof item === "string" ? item : null); return p ? [p] : []; }) : [];
}

export interface PaperProfileBarProps {
  /** `delivery_profile` of the body on screen: the profile these numbers describe. null while nothing has been read. */
  delivered: string | null;
  /** `read_profiles` of the last body: what this stack will serve. */
  allowed: readonly PaperProfileId[];
}

/**
 * The page-header statement of which Paper profile the screen shows, plus a selector that exists only when Core allows more than
 * one. The statement names the profile the BODY describes (`delivered`), not the one asked for, so a slow or refused read never
 * labels one profile's numbers with another's name.
 */
let lastAllowed: readonly PaperProfileId[] = [];

export function PaperProfileBar({ delivered, allowed: published }: PaperProfileBarProps) {
  const { selected, select } = usePaperProfile();
  // A failed or loading read publishes no list; keep the last one so the reader can always switch back.
  if (published.length > 0) lastAllowed = published;
  const allowed = published.length > 0 ? published : lastAllowed;
  const requested = selected ?? allowed[0] ?? null;
  const mismatch = delivered !== null && requested !== null && delivered !== requested;
  return (
    <div className="exec-paper-profile" data-testid="paper-profile-bar">
      <span className="exec-paper-profile-label">Paper profile</span>
      <strong data-testid="paper-profile-shown">{delivered === null ? "Reading" : profileLabel(delivered)}</strong>
      {allowed.length > 1 ? (
        <label className="exec-paper-profile-select">
          <span className="exec-paper-profile-switch">Switch</span>
          <select value={requested ?? ""} onChange={(event) => select(event.target.value === allowed[0] ? null : event.target.value)} aria-label="Paper profile">
            {allowed.map((id) => <option key={id} value={id}>{profileLabel(id)}</option>)}
          </select>
        </label>
      ) : null}
      {mismatch ? <span role="status" data-testid="paper-profile-pending">Showing {profileLabel(delivered!)} until {profileLabel(requested!)} answers.</span> : null}
      {selected !== null ? <span className="exec-paper-profile-note">Other Paper panels (source health, execution quality, capital, sparklines) are not available per profile and are hidden while this profile is selected.</span> : null}
    </div>
  );
}
