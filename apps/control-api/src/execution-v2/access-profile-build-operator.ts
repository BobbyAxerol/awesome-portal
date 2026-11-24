/** OFFLINE operator for the access-profile builder. Reads ONE absolute-path input JSON, writes ONE new artifact file
 * (never overwrites; mode 0600) and prints its sha256 for the owner to approve. It installs nothing, opens no database
 * and no socket, issues no session and seeds no SQL. The owner places the approved bytes root-owned 0600 by hand;
 * that, and the install, are separate gated steps that do not exist in this change.
 * Only READ ALLOW grants can be built; there is no option bypass. */
import { writeFile } from "node:fs/promises";
import { AccessProfileError, buildAccessProfileArtifact } from "./access-profile-artifact";
import { readAccessProfileInputFile } from "./access-profile-files";

export const ACCESS_PROFILE_BUILD_INPUT_MAX_BYTES = 65_536;
export type AccessProfileBuildOperatorCode = "ACCESS_PROFILE_BUILD_USAGE" | "ACCESS_PROFILE_BUILD_IO" | "ACCESS_PROFILE_BUILD_FAILED";
export class AccessProfileBuildOperatorError extends Error {
  constructor(readonly code: AccessProfileBuildOperatorCode, readonly exitCode: 1 | 2 = 1) {
    super("The access-profile builder did not complete."); this.name = "AccessProfileBuildOperatorError";
  }
}
export interface AccessProfileBuildIo {
  readInput(path: string): Promise<string>;
  /** Must refuse to overwrite. */
  writeNew(path: string, bytes: string): Promise<void>;
}
export const nodeAccessProfileBuildIo: AccessProfileBuildIo = {
  readInput: path => readAccessProfileInputFile(path, ACCESS_PROFILE_BUILD_INPUT_MAX_BYTES),
  writeNew: (path, bytes) => writeFile(path, bytes, { flag: "wx", mode: 0o600 }),
};

export function parseAccessProfileBuildArgs(argv: readonly string[]): { input: string; out: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (!["--input", "--out"].includes(flag) || values.has(flag) || i + 1 >= argv.length)
      throw new AccessProfileBuildOperatorError("ACCESS_PROFILE_BUILD_USAGE", 2);
    values.set(flag, argv[++i]!);
  }
  const input = values.get("--input"), out = values.get("--out");
  if (!input?.startsWith("/") || !out?.startsWith("/") || input === out) throw new AccessProfileBuildOperatorError("ACCESS_PROFILE_BUILD_USAGE", 2);
  return { input, out };
}

export async function runAccessProfileBuild(argv: readonly string[], io: AccessProfileBuildIo = nodeAccessProfileBuildIo) {
  const args = parseAccessProfileBuildArgs(argv);
  let raw: unknown;
  try {
    const bytes = await io.readInput(args.input);
    if (Buffer.byteLength(bytes, "utf8") < 2 || Buffer.byteLength(bytes, "utf8") > ACCESS_PROFILE_BUILD_INPUT_MAX_BYTES) throw new Error("size");
    raw = JSON.parse(bytes);
  } catch { throw new AccessProfileBuildOperatorError("ACCESS_PROFILE_BUILD_IO"); }
  const built = buildAccessProfileArtifact(raw);
  try { await io.writeNew(args.out, built.bytes); } catch { throw new AccessProfileBuildOperatorError("ACCESS_PROFILE_BUILD_IO"); }
  return Object.freeze({
    state: "ARTIFACT_BUILT" as const, installed: false as const, artifact_sha256: built.sha256, bytes: Buffer.byteLength(built.bytes, "utf8"),
    ...built.summary,
    next: "Owner reviews the file, approves this sha256, then places the same bytes root-owned 0600. Installing is a separate gated step that does not exist yet.",
  });
}

/** Only fixed public codes leave this boundary. Never echo even a typed error's
 * message: an invalid field can itself contain a submitted secret or path. */
export function accessProfileBuildFailure(error: unknown): { code: string; exitCode: 1 | 2 } {
  if (error instanceof AccessProfileBuildOperatorError) return { code: error.code, exitCode: error.exitCode };
  if (error instanceof AccessProfileError) return { code: error.code, exitCode: 1 };
  return { code: "ACCESS_PROFILE_BUILD_FAILED", exitCode: 1 };
}
