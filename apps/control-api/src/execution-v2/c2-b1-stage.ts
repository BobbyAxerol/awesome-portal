import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { inspectPinnedC2B1NotAuthorized } from "./c2-b1-preflight";

/** Durable staging of the already pinned *public B1 input*, not a P7/P8
 * acceptance, signing reservation, publication, or permission to sign.
 * The caller must provision a dedicated private directory on a trusted local
 * filesystem. This does not defend against a malicious process with the same
 * UID that can replace ancestor directories, nor an unreliable filesystem. */
const fail = (reason: string): never => { throw new Error(reason); };
const validHash = /^[0-9a-f]{64}$/;
const privateRegular = (stat: { isFile(): boolean; nlink: number; uid: number; mode: number; size: number },
  maxSize: number) => stat.isFile() && stat.nlink === 1 && stat.uid === process.geteuid?.()
    && (stat.mode & 0o7777) === 0o600 && stat.size > 0 && stat.size <= maxSize;

/** Write once by hash, fsync both file and directory, and revalidate on retry.
 * Incomplete/conflicting files are never deleted or overwritten: the caller
 * must investigate rather than mistake an interrupted write for evidence. */
export async function stagePinnedC2B1PublicInput(directory: string, bytes: Uint8Array, expectedSha256: string): Promise<Readonly<{
  state: "STAGED_NOT_AUTHORIZED" | "ALREADY_STAGED_NOT_AUTHORIZED"; input_sha256: string }>> {
  if (!isAbsolute(directory) || !validHash.test(expectedSha256) || !(bytes instanceof Uint8Array)
    || bytes.byteLength < 1 || bytes.byteLength > 131_072) return fail("C2_B1_STAGE_INPUT_INVALID");
  const snapshot = Buffer.from(bytes);
  inspectPinnedC2B1NotAuthorized(snapshot, expectedSha256);
  const dir = resolve(directory), stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.geteuid?.()
    || (stat.mode & 0o7777) !== 0o700 || await realpath(dir) !== dir)
    return fail("C2_B1_STAGE_DIRECTORY_INVALID");
  const filename = join(dir, `b1-${expectedSha256}.json`);
  let created = false;
  let file;
  try {
    try {
      file = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    }
    const before = await file.stat();
    if (created) {
      // Created file is deliberately allowed to start empty; no other file is.
      if (!before.isFile() || before.nlink !== 1 || before.uid !== process.geteuid?.()
        || (before.mode & 0o7777) !== 0o600 || before.size !== 0) return fail("C2_B1_STAGE_FILE_INVALID");
      await file.writeFile(snapshot);
      const after = await file.stat();
      if (!privateRegular(after, 131_072) || after.size !== snapshot.length) return fail("C2_B1_STAGE_WRITE_INCOMPLETE");
    } else {
      if (!privateRegular(before, 131_072) || before.size !== snapshot.length) return fail("C2_B1_STAGE_CONFLICT_OR_INCOMPLETE");
      const actual = await file.readFile();
      const after = await file.stat();
      if (!privateRegular(after, 131_072) || !actual.equals(snapshot) || before.ino !== after.ino
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
        return fail("C2_B1_STAGE_CONFLICT_OR_INCOMPLETE");
    }
    // Re-fsync existing files too: a previous writer may have crashed after
    // write but before its directory entry was made durable.
    await file.sync();
  } finally { await file?.close(); }
  const dirFd = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const after = await dirFd.stat();
    if (after.dev !== stat.dev || after.ino !== stat.ino) return fail("C2_B1_STAGE_DIRECTORY_CHANGED");
    await dirFd.sync();
  } finally { await dirFd.close(); }
  return Object.freeze({ state: created ? "STAGED_NOT_AUTHORIZED" : "ALREADY_STAGED_NOT_AUTHORIZED",
    input_sha256: expectedSha256 });
}
