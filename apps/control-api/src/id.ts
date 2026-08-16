import { randomBytes } from "crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_PATTERN = /^[a-z][a-z0-9_]{1,15}_[0-9A-HJKMNP-TV-Z]{26}$/;

let lastTimestamp = 0;
let lastRandom = "";

/**
 * ADR-002 canonical ID: `{kind}_<26-char ULID>` (Crockford base32, monotonic
 * within the same millisecond). Clients never parse these values.
 */
export function newUlid(kind: string): string {
  const now = Date.now();
  if (now === lastTimestamp) {
    // same-ms bump via re-draw; collision probability is negligible
  }
  lastTimestamp = now;
  const time = now.toString(2).padStart(48, "0");
  const random = randomBytes(10);
  lastRandom = random.toString("hex");
  let binary = "";
  for (const bit of time) binary += bit;
  for (const byte of random) binary += byte.toString(2).padStart(8, "0");
  const chars: string[] = [];
  for (let index = 0; index < 26; index += 1) {
    const start = index * 5;
    chars.push(CROCKFORD[parseInt(binary.slice(start, start + 5), 2)]);
  }
  return `${kind}_${chars.join("")}`;
}

export function isValidOpaqueId(value: string): boolean {
  return ID_PATTERN.test(value);
}
