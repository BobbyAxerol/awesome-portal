/** Explicit offline file authoring. No DB/config/source/session/installer. */
import { writeFile } from "node:fs/promises";
import { AccessProfileError } from "./access-profile-artifact";
import { readAccessProfileInputFile } from "./access-profile-files";
import { buildOrdinaryProfileLifecycle, OrdinaryProfileLifecycleError } from "./ordinary-profile-lifecycle";
import { PRIVATE_FILE_MAX_BYTES } from "./private-root-file";

export const ORDINARY_PROFILE_LIFECYCLE_INPUT_MAX_BYTES = 65_536;
export class OrdinaryProfileLifecycleOperatorError extends Error {
  constructor(readonly code: "ORDINARY_PROFILE_USAGE" | "ORDINARY_PROFILE_IO" | "ORDINARY_PROFILE_FAILED",
    readonly exitCode: 1 | 2 = 1) { super("The offline profile operation did not complete."); }
}
const usage = (): never => { throw new OrdinaryProfileLifecycleOperatorError("ORDINARY_PROFILE_USAGE", 2); };
export function parseOrdinaryProfileLifecycleArgs(argv: readonly string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (!["--operation", "--input", "--out", "--current", "--current-sha256"].includes(flag) || values.has(flag) ||
      i + 1 >= argv.length) return usage();
    values.set(flag, argv[++i]!);
  }
  const operation = values.get("--operation"), input = values.get("--input"), out = values.get("--out"),
    current = values.get("--current"), sha256 = values.get("--current-sha256");
  if (!operation || !["BOOTSTRAP", "RENEW", "HOT_ADD"].includes(operation) || !input?.startsWith("/") ||
    !out?.startsWith("/") || input === out || out === current || input === current) return usage();
  if (operation === "BOOTSTRAP" ? current !== undefined || sha256 !== undefined :
    !current?.startsWith("/") || !sha256 || !/^[a-f0-9]{64}$/.test(sha256)) return usage();
  return { operation, input, out, current, sha256 };
}
export interface OrdinaryProfileLifecycleIo {
  read(path: string, maximumBytes: number): Promise<string>;
  /** Must refuse overwrite and create mode0600. */
  writeNew(path: string, bytes: string): Promise<void>;
}
const nodeIo: OrdinaryProfileLifecycleIo = {
  read: readAccessProfileInputFile,
  writeNew: (path, bytes) => writeFile(path, bytes, { flag: "wx", mode: 0o600 }),
};
function checkedBytes(bytes: string, maximum: number): string {
  const size = Buffer.byteLength(bytes, "utf8");
  if (size < 2 || size > maximum) throw new OrdinaryProfileLifecycleOperatorError("ORDINARY_PROFILE_IO");
  return bytes;
}
export async function runOrdinaryProfileLifecycle(argv: readonly string[], io: OrdinaryProfileLifecycleIo = nodeIo) {
  const args = parseOrdinaryProfileLifecycleArgs(argv);
  let next: unknown, current: string | undefined;
  try {
    next = JSON.parse(checkedBytes(await io.read(args.input, ORDINARY_PROFILE_LIFECYCLE_INPUT_MAX_BYTES), ORDINARY_PROFILE_LIFECYCLE_INPUT_MAX_BYTES));
    if (args.current) current = checkedBytes(await io.read(args.current, PRIVATE_FILE_MAX_BYTES), PRIVATE_FILE_MAX_BYTES);
  } catch { throw new OrdinaryProfileLifecycleOperatorError("ORDINARY_PROFILE_IO"); }
  const result = buildOrdinaryProfileLifecycle({ schema_version: "portal.ordinary-profile-lifecycle.v1",
    operation: args.operation, expected_current_sha256: args.sha256 ?? null, next }, current);
  try { await io.writeNew(args.out, result.artifact.bytes); }
  catch { throw new OrdinaryProfileLifecycleOperatorError("ORDINARY_PROFILE_IO"); }
  return Object.freeze({ state: result.state, operation: result.operation, installed: false as const,
    database_checked: false as const, source_checked: false as const, delegation_performed: false as const,
    application_requires: result.application_requires, predecessor_sha256: result.predecessor?.artifact_sha256 ?? null,
    predecessor_grants_retained_in_input: result.predecessor?.grants.length ?? 0,
    artifact_sha256: result.artifact.sha256, ...result.artifact.summary });
}
/** Fixed categories only; never relay paths, input text, SQL or arbitrary errors. */
export function ordinaryProfileLifecycleFailure(error: unknown): { code: string; exitCode: 1 | 2 } {
  if (error instanceof OrdinaryProfileLifecycleOperatorError) return { code: error.code, exitCode: error.exitCode };
  if (error instanceof OrdinaryProfileLifecycleError || error instanceof AccessProfileError) return { code: error.code, exitCode: 1 };
  return { code: "ORDINARY_PROFILE_FAILED", exitCode: 1 };
}
