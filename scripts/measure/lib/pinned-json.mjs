import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Read once: the bytes parsed must be exactly the bytes covered by the caller's pin. */
export function readPinnedJson(path, expectedSha256, mismatchCode, { read = readFileSync } = {}) {
  const bytes = read(path);
  const actualSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (actualSha256 !== expectedSha256) throw new Error(`REFUSED:${mismatchCode}`);
  return JSON.parse(bytes.toString("utf8"));
}
