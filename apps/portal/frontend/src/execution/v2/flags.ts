/**
 * Execution V2 rollout manifest (review2/07 s5).
 *
 * One build-time list, `VITE_EXECUTION_V2_SCREENS`, decides which screens use
 * their V2 component; the same route serves both. Unset or empty keeps every
 * screen on V1. V2 also needs the umbrella preview flag, so a stack that has
 * the manifest but not the product routes stays on V1 instead of half-enabled.
 */
import { EXECUTION_PREVIEW_ENABLED } from "../previewRegistry";

export const EXEC_V2_SCREEN_KEYS = [
  "fleet",
  "archived",
  "portfolios",
  "alpha",
  "workbench",
  "account",
  "ops",
  "profile",
  "overview",
  "cockpit",
  "shell",
  "compare",
  "blotter",
  "admin",
  "users",
  "replay",
] as const;
export type ExecV2ScreenKey = (typeof EXEC_V2_SCREEN_KEYS)[number];

/**
 * Keys that are named in the manifest but mount nothing (audit, 2026-10-19).
 *
 * - `archived`: the Archived lens is part of the Fleet (`tab=archived`, key `fleet`); there is no separate screen.
 * - `workbench`: the V2 Paper / Stage workbench (S5) is not built; the V1 workbench still renders.
 * - `replay`: Trade Replay rides the Alpha 360 Replay tab (key `alpha`); nothing reads `replay` itself.
 *
 * They stay in the list because env files and build args already carry them
 * (a key dropped from the list would read as a typo), but `isV2Screen` answers
 * false for them even when the manifest names them, so listing one cannot make
 * a screen look migrated. `flags.test.ts` holds both halves: every other key is
 * read by `isV2Screen("<key>")` in source, and these three are read nowhere.
 */
export const EXEC_V2_RESERVED_KEYS = ["archived", "workbench", "replay"] as const satisfies readonly (typeof EXEC_V2_SCREEN_KEYS)[number][];
const RESERVED: ReadonlySet<string> = new Set(EXEC_V2_RESERVED_KEYS);

const KNOWN: ReadonlySet<string> = new Set(EXEC_V2_SCREEN_KEYS);

/** Pure: a typo in the list drops that key only, never turns anything else on. */
export function parseV2Manifest(raw: string | undefined): ReadonlySet<ExecV2ScreenKey> {
  const keys = (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is ExecV2ScreenKey => KNOWN.has(part));
  return new Set(keys);
}

export const EXECUTION_V2_SCREENS = parseV2Manifest(import.meta.env.VITE_EXECUTION_V2_SCREENS);

export function isV2Screen(
  key: ExecV2ScreenKey,
  set: ReadonlySet<ExecV2ScreenKey> = EXECUTION_V2_SCREENS,
  umbrella: boolean = EXECUTION_PREVIEW_ENABLED,
): boolean {
  return umbrella && !RESERVED.has(key) && set.has(key);
}

export const EXECUTION_V2_SHELL = isV2Screen("shell");
