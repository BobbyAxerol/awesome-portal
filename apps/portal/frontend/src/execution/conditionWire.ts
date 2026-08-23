/**
 * Typed conditions on the wire (BR-EX-29, delivered as `TypedConditionSchema`).
 *
 * A decision used to travel with one flattened string —
 * `"cap 50,000 · owner Lan · deadline 2026-09-01"` — because the schema
 * accepted nothing else. It accepts `conditions[]` now, and the difference is
 * not cosmetic: a string cannot be checked for a missing owner, cannot be
 * compared for duplicates, and cannot have its expiry held against its
 * deadline. The server does all three, and a client that sends prose makes
 * every one of those checks impossible.
 *
 * The rules below are the server's, restated here so the operator reads a
 * sentence instead of a 422 they cannot act on. They are not a second
 * validator: anything that passes here is still checked there.
 */
import type { TypedCondition } from "./components/conditions";

/** The wire shape. `expires_at`, not `expiry` — the schema's spelling. */
export interface ConditionWire {
  text: string;
  owner: string;
  deadline: string | null;
  expires_at: string | null;
  blocking: boolean;
}

/** `TypedConditionSchema`: at most sixteen per decision. */
export const MAX_CONDITIONS = 16;
/** `text` has a floor of eight characters, like every reason on this surface. */
export const MIN_CONDITION_TEXT = 8;

/**
 * Convert, or explain why not.
 *
 * Returns the wire array, or a sentence naming the first condition that cannot
 * be sent. Deliberately not "drop the bad ones and send the rest": a reviewer
 * who attached four conditions and had one silently discarded has approved
 * something they did not intend.
 */
export function toConditionWire(
  conditions: readonly TypedCondition[],
): { ok: true; value: ConditionWire[] } | { ok: false; reason: string } {
  if (conditions.length > MAX_CONDITIONS) {
    return {
      ok: false,
      reason: `A decision carries at most ${MAX_CONDITIONS} conditions; this has ${conditions.length}.`,
    };
  }

  const wire: ConditionWire[] = [];
  for (const [index, condition] of conditions.entries()) {
    const at = `Condition ${index + 1}`;
    const text = condition.text.trim();
    if (text.length < MIN_CONDITION_TEXT) {
      return { ok: false, reason: `${at} needs at least ${MIN_CONDITION_TEXT} characters.` };
    }
    // The schema requires an owner and the frontend type allows null, so this
    // is the one place the two disagree — and the server is right. An unowned
    // condition is a wish, and the reviewer is told rather than having their
    // decision refused with a field path.
    const owner = condition.owner?.trim() ?? "";
    if (owner.length === 0) {
      return { ok: false, reason: `${at} has no owner. A condition nobody owes is not a condition.` };
    }
    const deadline = condition.deadline?.trim() || null;
    const expiresAt = condition.expiry?.trim() || null;
    if (deadline && expiresAt && expiresAt < deadline) {
      return {
        ok: false,
        reason: `${at} expires (${expiresAt}) before its deadline (${deadline}), so it could never be met.`,
      };
    }
    wire.push({ text, owner, deadline, expires_at: expiresAt, blocking: condition.blocking });
  }

  const seen = new Set(wire.map((c) => JSON.stringify(c)));
  if (seen.size !== wire.length) {
    return { ok: false, reason: "Two of these conditions are identical. Remove the duplicate." };
  }
  return { ok: true, value: wire };
}

/*
 * There is deliberately no `readConditions` here.
 *
 * Codex's handoff permits a read compatibility path "only where old stored
 * responses still expose singular `condition`", and none does: neither the R2
 * review schema nor the Paper Exit schema carries `conditions` or `condition`
 * at all, and no reader in this folder reads one. A function with no call site
 * is not a compatibility path, it is a claim the code does not make.
 *
 * Writing one anyway would also contradict BR-EX-30, raised three commits ago
 * against exactly this: reading a field no contract publishes. The moment a
 * response documents either spelling, the reader belongs here — and not before.
 */
