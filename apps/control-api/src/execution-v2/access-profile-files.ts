/** Offline authoring input only. No credentials, runtime configuration or writes.
 * Reject special files before open, use nonblocking/no-follow open to cover a
 * replacement race, and never allocate/read more than the declared cap + 1. */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { TextDecoder } from "node:util";

export async function readAccessProfileInputFile(path: string, maximumBytes: number): Promise<string> {
  const refused = (): never => { throw new Error("ACCESS_PROFILE_FILE_REFUSED"); };
  if (!path.startsWith("/") || !Number.isSafeInteger(maximumBytes) || maximumBytes < 2 || maximumBytes > 131_072) return refused();
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 2 || before.size > maximumBytes) return refused();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.dev !== before.dev || actual.ino !== before.ino || actual.size !== before.size ||
        actual.size < 2 || actual.size > maximumBytes) return refused();
    const bytes = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const part = await file.read(bytes, length, bytes.length - length, null);
      if (part.bytesRead === 0) break;
      length += part.bytesRead;
    }
    const after = await file.stat();
    if (length !== actual.size || length > maximumBytes || after.size !== actual.size ||
        after.mtimeMs !== actual.mtimeMs || after.ctimeMs !== actual.ctimeMs) return refused();
    // Malformed UTF-8 cannot silently normalize through JSON.parse/stringify.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await file.close(); }
}
