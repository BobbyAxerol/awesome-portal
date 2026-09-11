import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { createCurrentSourceTruthLedger } from "../execution/current-source-truth-ledger";

function requiredArgument(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`${name} is required`);
  return args[index + 1];
}

function repeatedArguments(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      if (index + 1 >= args.length) throw new Error(`${name} is required`);
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 4 * 1024 * 1024) {
    throw new Error(`${label} must be a regular bounded file`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function validateOutput(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error("--output-file must be an absolute path");
  try {
    await lstat(path);
    throw new Error("--output-file must not already exist");
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "--output-file must not already exist") throw error;
    // ENOENT is the only accepted condition; all other lstat errors remain unsafe.
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const parent = dirname(path);
  const stats = await lstat(parent);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o700 ||
    (typeof process.geteuid === "function" && stats.uid !== process.geteuid())
  ) {
    throw new Error("truth ledger output directory must be caller-owned mode 0700");
  }
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (requiredArgument(args, "--acknowledge") !== "D3_CURRENT_SOURCE_TRUTH_LEDGER") {
    throw new Error("D3 truth-ledger acknowledgement is required");
  }
  const ownerResponseFile = requiredArgument(args, "--owner-response-file");
  const runtimeManifestFile = requiredArgument(args, "--runtime-manifest-file");
  const auditEvidenceFiles = repeatedArguments(args, "--audit-evidence-file");
  const outputArgument = requiredArgument(args, "--output-file");
  if (!isAbsolute(outputArgument)) throw new Error("--output-file must be an absolute path");
  const outputFile = resolve(outputArgument);
  if (auditEvidenceFiles.length !== 3 || new Set(auditEvidenceFiles).size !== 3) {
    throw new Error("exactly three distinct --audit-evidence-file values are required");
  }
  await validateOutput(outputFile);
  const ledger = createCurrentSourceTruthLedger({
    ownerResponse: await readJsonFile(ownerResponseFile, "owner response file"),
    runtimeManifest: await readJsonFile(runtimeManifestFile, "runtime manifest file"),
    auditEvidence: await Promise.all(
      auditEvidenceFiles.map((path) => readJsonFile(path, "D3 audit evidence file")),
    ),
  });
  await writeExclusive(outputFile, ledger);
  console.log(
    `D3 current-source truth ledger written without rows, cursors or credentials: ${ledger.capabilities.length} capabilities, ${ledger.relations.length} relations`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "D3 truth ledger failed");
    process.exitCode = 1;
  });
}
