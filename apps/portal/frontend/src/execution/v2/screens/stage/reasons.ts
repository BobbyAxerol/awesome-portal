/**
 * Why a stage control is off, in one place (S3 plan s1; hi-fi kit.js `KIT.WHY`).
 *
 * The five sentences the Sandbox, Canary, Live and New request screens share for a
 * disabled button. Every string is the one the hi-fi prints; screens pass the sentence
 * as the `reason` of a `DockAction` (which ties it to the button with `aria-describedby`
 * and adds the "My access" link) or beside a plain disabled `<button>`.
 *
 * Choosing the key is the caller's job and follows the server, not the role name (D10):
 * `noGrant` only when the server refused for a missing grant, `liveClosed` when the
 * command policy is closed, `notEnabled` when the profile does not offer the action.
 * The hi-fi keys `noExport`, `author` and `needNote` belong to other screens and are not
 * stage reasons (`needNote` says 12 characters; the stage note needs 24 and the request
 * summary 8, D8a, so they print their own count).
 */
export const STAGE_WHY = {
  /** The signed-in person lacks the grant the server asked for. */
  noGrant: "Needs the approver grant",
  /** The action exists but this profile does not offer it. */
  notEnabled: "Not enabled for this profile",
  /** Real-funded decisions (Hold, Reduce, Rollback, Halt, Emergency close, Request scale) cannot be sent from this build. */
  liveClosed: "Live decisions are closed on this build",
  /** The screen is a read-only view on this build. */
  readOnly: "Read-only on this build",
  /** The command relay is not qualified, so nothing can be sent through it. */
  relay: "Relay is not qualified yet",
} as const;

export type StageWhyKey = keyof typeof STAGE_WHY;

export const STAGE_WHY_KEYS = Object.keys(STAGE_WHY) as readonly StageWhyKey[];

/** The sentence for a key. An unknown key (a caller cast) reads as `notEnabled`, never as a permission. */
export function stageWhy(key: StageWhyKey): string {
  return Object.hasOwn(STAGE_WHY, key) ? STAGE_WHY[key] : STAGE_WHY.notEnabled;
}
