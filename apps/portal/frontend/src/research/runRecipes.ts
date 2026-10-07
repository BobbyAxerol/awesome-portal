/**
 * Screen 02 · run recipes: a ready-made protocol x mode x schedule x trials x seed x walk-forward combination, picked in one click.
 *
 * Everything here is derived from the served setup (`SetupOptions`): one recipe per ENABLED profile, with the catalogue pairs the
 * setup lists as closed returned apart (never selectable). No mode, profile id or count is written in this file; the only wording
 * that is not served is a small generic mapping of the protocol and schedule words. A recipe never touches the windows, dataset,
 * symbol, parameters or route params: it sets what the three separate controls (protocol, mode, schedule) and the trial / seed /
 * walk-forward defaults would have set, and the reader customises afterwards.
 */

import {
  SPEC_V2,
  SCHEDULE_PER_FOLD_CAUSAL,
  isCausalProfile,
  profileTrialDefault,
  type ProfilePins,
} from "./dataDeclarationV2";
import { humanise } from "./humanise";
import { clockWords, routeWord } from "./nativeFacts";
import type { RunDraft } from "./runDraft";
import type { SetupOptions } from "./setupClient";
import { engineOptionPair, profilesFromSetup } from "./useRunSetup";

const SPEC_V1 = "research.requested-spec.v1";

/** The most closed (not opened yet) recipes the picker lists. */
export const MAX_CLOSED_RECIPES = 6;

export interface RecipeContext {
  /** The Atlas modes, for the display name of a mode (`mode_id` humanised when absent). */
  atlasModes?: readonly { mode_id: string; display_name?: string }[];
  /** When given, only profiles of this execution route are offered (a recipe never silently changes the route). */
  executionRoute?: string;
  /** The release defaults the walk-forward adoption prefers when the profile admits them (`frequency_default`, `window_mode_default`). */
  frequencyDefault?: string;
  windowModeDefault?: string;
}

export interface Recipe {
  /** Stable: the profile id, or `closed:<mode>:<schedule>` for a catalogue pair no profile opens. */
  id: string;
  label: string;
  /** One short line: trials, seed, window mode and frequency, as the profile serves them. */
  summary: string;
  /** Extra detail for a tooltip (the requested-spec v2 note, the reason of a closed one). */
  title: string;
  enabled: boolean;
  /** Closed recipes only: the profile's own typed reason, else the pair's, else `PROFILE_NOT_OPENED`. */
  reasonCode: string | null;
  /** The profile this recipe applies; null for a catalogue pair no profile describes. */
  profile: ProfilePins | null;
  protocol: RunDraft["protocol"] | null;
  executionRoute: string | null;
  optimizationMode: string;
  optimizationSchedule: string;
  /** Only a requested-spec v2 profile is enabled for this combination, so picking it declares v2. */
  v2Only: boolean;
  /** Release defaults the walk-forward adoption prefers, carried from the context. */
  frequencyDefault: string | null;
  windowModeDefault: string | null;
  /** The change picking this recipe makes to `draft` (same as `applyRecipe(recipe, draft)`). */
  patch: (draft: RunDraft) => Partial<RunDraft>;
}

/* ------------------------------------------------------------------ wording */

function protocolRank(profile: ProfilePins): number {
  if (profile.optimizationSchedule === SCHEDULE_PER_FOLD_CAUSAL) return 2;
  return profile.protocol === "three_window_decay" ? 0 : 1;
}

function modeName(mode: string, ctx: RecipeContext): string {
  const named = ctx.atlasModes?.find((entry) => entry.mode_id === mode)?.display_name;
  return named && named.trim() !== "" ? named : humanise(mode);
}

/** The generic schedule word (`global` says nothing). */
function scheduleWord(schedule: string): string {
  return schedule === "" || schedule === "global" ? "" : humanise(schedule);
}

function baseLabel(profile: ProfilePins): string {
  if (profile.nativeInput) return `${routeWord(profile.executionRoute)} · native`;
  if (profile.optimizationSchedule === SCHEDULE_PER_FOLD_CAUSAL) return "Causal inner selection";
  if (profile.protocol === "three_window_decay") {
    const single = profile.trials !== null && profile.trials.min === 1 && profile.trials.max === 1;
    return single ? "Quick check · Three Window" : "Three Window search";
  }
  return "Walk-forward search";
}

function trialsWord(profile: ProfilePins): string | null {
  const trials = profile.trials;
  if (trials === null) return null;
  if (trials.min === trials.max) return `${trials.min} ${trials.min === 1 ? "trial" : "trials"}`;
  return `${trials.min}–${trials.max} trials`;
}

function seedWord(profile: ProfilePins): string {
  switch (profile.seed.state) {
    case "fixed":
      return profile.seed.value !== null ? "seed locked" : "seed open";
    case "forbidden":
      return "no seed";
    default:
      return profile.seedRequirement === "required" ? "seed required" : profile.seedRequirement === "optional" ? "seed optional" : "seed open";
  }
}

/** The window mode and frequency the recipe adopts (the release default when admitted, else the first admitted). */
function pick(list: readonly string[] | null, preferred: string | null): string | null {
  if (list === null || list.length === 0) return null;
  return preferred !== null && list.includes(preferred) ? preferred : list[0]!;
}

/**
 * The finest fold frequency the profile admits. The release default (quarterly) suits a multi-year span; a recipe starts on a short
 * recent span (a month or three), where only a fine frequency gives the 2+ outer folds the temporal profiles require.
 */
const FINEST_FIRST = ["weekly", "monthly", "quarterly", "semi_yearly", "yearly", "single"] as const;
function pickFrequency(list: readonly string[] | null): string | null {
  if (list === null || list.length === 0) return null;
  return FINEST_FIRST.find((value) => list.includes(value)) ?? list[0]!;
}

/** `0.1` → `10%` (an exact fraction, no rounding beyond float noise). */
function pctWord(fraction: number): string {
  return `${Number((fraction * 100).toPrecision(6))}%`;
}

function summaryOf(profile: ProfilePins, ctx: RecipeContext): string {
  const parts: (string | null)[] = profile.nativeInput
    ? [profile.nativeInput.bracket ? `stop ${Number((Number(profile.nativeInput.bracket.stopFraction) * 100).toPrecision(6))}% · take-profit ${Number((Number(profile.nativeInput.bracket.takeProfitFraction) * 100).toPrecision(6))}%` : null, clockWords(profile.nativeInput.executionClock)]
    : [profile.account ? `${pctWord(profile.account.allocPerTrade)} of equity` : null, trialsWord(profile), seedWord(profile)];
  if (profile.protocol === "advanced") {
    parts.push(pick(profile.windowModes, ctx.windowModeDefault ?? null), pickFrequency(profile.frequencies));
  }
  return parts.filter((part): part is string => part !== null).join(" · ");
}

function onlyV2(profile: ProfilePins): boolean {
  const versions = profile.requestedSpecVersions;
  return versions !== null && versions.includes(SPEC_V2) && !versions.includes(SPEC_V1);
}

/* ---------------------------------------------------------------- building */

function applyToDraft(recipe: Recipe, draft: RunDraft): Partial<RunDraft> {
  const profile = recipe.profile;
  if (!recipe.enabled || profile === null || recipe.protocol === null) return {};
  const change: Partial<RunDraft> = {
    protocol: recipe.protocol,
    optimizationMode: recipe.optimizationMode,
    optimizationSchedule: recipe.optimizationSchedule,
  };
  if (recipe.executionRoute !== null && recipe.executionRoute !== draft.executionRoute) {
    change.executionRoute = recipe.executionRoute as RunDraft["executionRoute"];
  }
  const trials = profileTrialDefault(profile);
  if (trials !== null) change.optunaTrials = String(trials);
  if (profile.seed.state === "fixed" && profile.seed.value !== null) change.randomSeed = String(profile.seed.value);
  else if (profile.seed.state === "forbidden") change.randomSeed = "";

  const walkForward: RunDraft["walkForward"] = { ...draft.walkForward };
  let touched = false;
  if (recipe.protocol === "advanced") {
    const frequency = pickFrequency(profile.frequencies);
    const windowMode = pick(profile.windowModes, recipe.windowModeDefault);
    if (frequency !== null) walkForward.frequency = frequency;
    if (windowMode !== null) walkForward.windowMode = windowMode;
    if (recipe.v2Only) {
      walkForward.declaredV2 = true;
      /* A v2-only recipe requires the three temporal guards: the served defaults go into the EMPTY ones (a zero applies no guard), typed values stay. */
      const guards = profile.temporalGuards?.defaults ?? null;
      if (guards !== null) {
        const fill = (current: string | undefined, value: number) => (current === undefined || current.trim() === "" ? String(value) : current);
        walkForward.labelHorizonBars = fill(walkForward.labelHorizonBars, guards.labelHorizonBars);
        walkForward.purgeBars = fill(walkForward.purgeBars, guards.purgeBars);
        walkForward.embargoBars = fill(walkForward.embargoBars, guards.embargoBars);
      }
    } else delete walkForward.declaredV2;
    touched = true;
  }
  const inner = profile.innerConstraints;
  if (isCausalProfile(profile) && inner !== null) {
    const current = draft.walkForward.inner ?? { splitFrequency: "", windowMode: "expanding", trainWindow: "", minFolds: "" };
    walkForward.inner = {
      ...current,
      splitFrequency: pick(inner.frequencies, recipe.frequencyDefault) ?? current.splitFrequency,
      windowMode: pick(inner.windowModes, current.windowMode) ?? current.windowMode,
    };
    touched = true;
  }
  if (touched) change.walkForward = walkForward;
  return change;
}

function build(partial: Omit<Recipe, "patch">): Recipe {
  const recipe: Recipe = { ...partial, patch: () => ({}) };
  recipe.patch = (draft) => applyToDraft(recipe, draft);
  return recipe;
}

export function recipesFromSetup(options: SetupOptions | null, ctx: RecipeContext = {}): Recipe[] {
  if (options === null) return [];
  const profiles = profilesFromSetup(options).filter(
    (profile) =>
      profile.protocol !== null
      && (profile.protocol === "advanced" || profile.protocol === "three_window_decay")
      && (ctx.executionRoute === undefined || profile.executionRoute === null || profile.executionRoute === ctx.executionRoute),
  );
  /* A one-trial fixed check (no search, no seed) is its own recipe. Every other profile of the same protocol, route, mode and schedule
     is one recipe: when the backend serves several trial ranges (a minimal 3-trial qualification beside a 2–400 one), the widest stands,
     so the user is offered ONE card with the real range, not a card per qualification. */
  const fixedCheck = (profile: ProfilePins) => profile.trials !== null && profile.trials.min === 1 && profile.trials.max === 1 && profile.seed.state === "forbidden";
  const combo = (profile: ProfilePins) => [profile.protocol, profile.executionRoute ?? "", profile.optimizationMode ?? "", profile.optimizationSchedule ?? "", fixedCheck(profile) ? "fixed" : "search"].join("|");
  const wider = (a: ProfilePins, b: ProfilePins) => (a.trials?.max ?? 0) > (b.trials?.max ?? 0);

  /* v1/v2 twins of one combination collapse: the widest range, then the v1 one; v2 only when it alone is enabled. */
  const chosen = new Map<string, ProfilePins>();
  for (const profile of profiles.filter((entry) => entry.enabled)) {
    const key = combo(profile);
    const held = chosen.get(key);
    if (held === undefined || wider(profile, held) || (!wider(held, profile) && onlyV2(held) && !onlyV2(profile))) chosen.set(key, profile);
  }
  const twins = new Set<string>();
  for (const profile of profiles.filter((entry) => entry.enabled)) {
    const held = chosen.get(combo(profile));
    if (held !== undefined && held !== profile) twins.add(held.profileId);
  }
  const ordered = [...chosen.values()].sort(
    (a, b) => protocolRank(a) - protocolRank(b) || (a.optimizationMode ?? "").localeCompare(b.optimizationMode ?? "") || a.profileId.localeCompare(b.profileId),
  );

  const modes = new Set(ordered.map((profile) => profile.optimizationMode ?? ""));
  const routes = new Set(ordered.map((profile) => profile.executionRoute ?? ""));
  const labelled = ordered.map((profile) => {
    let label = baseLabel(profile);
    if (modes.size > 1) label += ` · ${modeName(profile.optimizationMode ?? "", ctx)}`;
    if (routes.size > 1 && profile.executionRoute) label += ` · ${humanise(profile.executionRoute)}`;
    return { profile, label };
  });
  /* Two recipes that still read alike are told apart by their schedule, then by the profile id. */
  const counts = new Map<string, number>();
  for (const entry of labelled) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  const enabled: Recipe[] = labelled.map(({ profile, label }) => {
    let text = label;
    if ((counts.get(label) ?? 0) > 1) {
      /* Told apart by the schedule word — "global" included, so the plain one is not the unlabelled leftover. */
      const schedule = scheduleWord(profile.optimizationSchedule ?? "") || "global";
      text = `${label} · ${schedule}`;
    }
    const v2 = onlyV2(profile);
    return build({
      id: profile.profileId,
      label: text,
      summary: summaryOf(profile, ctx),
      title: `${profile.profileId}${v2 ? " · requested-spec v2" : twins.has(profile.profileId) ? " · a requested-spec v2 twin is a customisation" : ""}`,
      enabled: true,
      reasonCode: null,
      profile,
      protocol: profile.protocol as RunDraft["protocol"],
      executionRoute: profile.executionRoute,
      optimizationMode: profile.optimizationMode ?? "",
      optimizationSchedule: profile.optimizationSchedule ?? "",
      v2Only: v2,
      frequencyDefault: ctx.frequencyDefault ?? null,
      windowModeDefault: ctx.windowModeDefault ?? null,
    });
  });

  /* Closed: mode x schedule combinations no enabled profile opens (catalogue pairs first, then disabled profiles the catalogue does not list). */
  const opened = new Set(enabled.map((recipe) => `${recipe.optimizationMode}|${recipe.optimizationSchedule}`));
  const closed: Recipe[] = [];
  const close = (mode: string, schedule: string, reason: string | null, profile: ProfilePins | null) => {
    const key = `${mode}|${schedule}`;
    if (opened.has(key)) return;
    opened.add(key);
    const schedules = scheduleWord(schedule);
    closed.push(
      build({
        id: `closed:${mode}:${schedule}`,
        label: `${modeName(mode, ctx)}${schedules !== "" ? ` · ${schedules}` : ""}`,
        summary: "",
        title: reason ?? "PROFILE_NOT_OPENED",
        enabled: false,
        reasonCode: reason ?? "PROFILE_NOT_OPENED",
        profile,
        protocol: null,
        executionRoute: profile?.executionRoute ?? null,
        optimizationMode: mode,
        optimizationSchedule: schedule,
        v2Only: false,
        frequencyDefault: null,
        windowModeDefault: null,
      }),
    );
  };
  for (const pair of options.engine_options?.optimization_pairs ?? []) {
    if (pair.state === "ENABLED") continue;
    const own = profiles.find((profile) => !profile.enabled && profile.optimizationMode === pair.optimization_mode && profile.optimizationSchedule === pair.optimization_schedule && profile.reason !== null);
    close(pair.optimization_mode, pair.optimization_schedule, own?.reason ?? engineOptionPair(options, pair.optimization_mode, pair.optimization_schedule)?.reasonCode ?? null, own ?? null);
  }
  for (const profile of profiles.filter((entry) => !entry.enabled && entry.optimizationMode !== null && entry.optimizationSchedule !== null)) {
    close(profile.optimizationMode!, profile.optimizationSchedule!, profile.reason, profile);
  }
  return [...enabled, ...closed.slice(0, MAX_CLOSED_RECIPES)];
}

/** What picking `recipe` changes in `draft`: never windows, dataset, symbol or parameters. A closed recipe changes nothing. */
export function applyRecipe(recipe: Recipe, draft: RunDraft): Partial<RunDraft> {
  return applyToDraft(recipe, draft);
}

/** The draft's protocol, mode and schedule (and, for a v2-only recipe, a declared v2) are this recipe's. */
export function recipeIsSelected(recipe: Recipe, draft: RunDraft): boolean {
  if (!recipe.enabled || recipe.protocol === null) return false;
  if (draft.protocol !== recipe.protocol || draft.optimizationMode !== recipe.optimizationMode || draft.optimizationSchedule !== recipe.optimizationSchedule) return false;
  if (recipe.executionRoute !== null && draft.executionRoute !== recipe.executionRoute) return false;
  /* Recipes of one combination differ by what they admit (trials): the declared count names the one it falls in. */
  const trials = recipe.profile?.trials ?? null;
  if (trials !== null) {
    const declared = draft.optunaTrials.trim() === "" ? null : Number(draft.optunaTrials);
    if (declared === null || !Number.isInteger(declared) || declared < trials.min || declared > trials.max) return false;
  }
  return recipe.v2Only ? draft.walkForward.declaredV2 === true : true;
}

/** The first enabled recipe (the list is already ordered), or null. */
export function recommendedRecipe(recipes: readonly Recipe[]): Recipe | null {
  return recipes.find((recipe) => recipe.enabled) ?? null;
}
