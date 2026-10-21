/** OFFLINE shape + reference check of the future Research Manager data-leg overlay config.
 * Opens ONLY the one JSON file it is given (references, public hashes and reviewed metadata;
 * never a key/certificate/token value). It never opens a referenced key/certificate, connects
 * to a database, Docker, SSH or a source, and writes nothing.
 *
 *   node dist/cli/manager-data-leg-validate.js --config <config.json> --workspace-id <id>
 *     [--now <UTC ISO>] [--inactive-preparation] [--expected-leaf-san <uri>]
 *     [--reviewed-kids a,b,c] [--stable-sha256 hex,hex]
 *
 * Exit: 0 all checks passed, 1 at least one error, 2 usage. Output is a JSON report of stable
 * codes + JSON paths (never a value); a pass is not a PKI issuance, trust pin, grant or approval. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { inspectManagerDataLegConfigBytes, MANAGER_DATA_LEG_REPORT_SCHEMA } from "../execution-v2/manager-data-leg-config";

const usage = (): never => { process.stderr.write("MANAGER_DATA_LEG_VALIDATE_USAGE\n"); process.exit(2); };
function privateJson(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > 65536) throw new Error("FILE_REJECTED");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = fstatSync(fd);
    if (!actual.isFile() || actual.dev !== before.dev || actual.ino !== before.ino || actual.size !== before.size) throw new Error("FILE_REJECTED");
    const out = Buffer.alloc(actual.size + 1);
    let length = 0;
    for (;;) {
      const n = readSync(fd, out, length, out.length - length, null);
      if (n === 0) break;
      length += n;
    }
    if (length !== actual.size) throw new Error("FILE_REJECTED");
    return out.subarray(0, length);
  } finally { closeSync(fd); }
}
function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  let inactive = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--inactive-preparation") { inactive = true; continue; }
    if (!a.startsWith("--") || i + 1 >= argv.length) return usage();
    values.set(a, argv[++i]!);
  }
  return { values, inactive };
}
const instant = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return usage();
  const ms = Date.parse(value);
  return Number.isSafeInteger(ms) ? ms : usage();
};
const list = (value: string | undefined): string[] | undefined => (value === undefined ? undefined : value.split(",").filter(Boolean));

function main(): void {
  const { values, inactive } = parseArgs(process.argv.slice(2));
  const known = new Set(["--config", "--workspace-id", "--now", "--expected-leaf-san", "--reviewed-kids", "--stable-sha256"]);
  if ([...values.keys()].some(k => !known.has(k)) || !values.get("--config") || !values.get("--workspace-id")) usage();
  const stable = list(values.get("--stable-sha256"));
  if (stable?.some(h => !/^[a-f0-9]{64}$/.test(h))) usage();
  // Every option is validated BEFORE the file is opened.
  const options = {
    expectedWorkspaceId: values.get("--workspace-id")!, nowMs: instant(values.get("--now")), requireIssuedLeaf: !inactive,
    expectedLeafSanUri: values.get("--expected-leaf-san"), reviewedKids: list(values.get("--reviewed-kids")), knownStableSha256: stable,
  };
  const report = inspectManagerDataLegConfigBytes(privateJson(values.get("--config")!), options);
  process.stdout.write(JSON.stringify({ schema_version: MANAGER_DATA_LEG_REPORT_SCHEMA, ...report }) + "\n");
  process.exitCode = report.ok ? 0 : 1;
}
try { main(); } catch { process.stderr.write(JSON.stringify({ code: "MANAGER_DATA_LEG_VALIDATE_FAILED" }) + "\n"); process.exitCode = 1; }
