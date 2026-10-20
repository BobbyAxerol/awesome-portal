/** OFFLINE shape + finite-validity check of the two private Core009 files.
 * Opens ONLY the two JSON files it is given (they hold references and public
 * reviewed seals, never key/cert/DSN/password values). It never connects to a
 * database, Docker, SSH or a source, never reads a referenced key/certificate,
 * and writes nothing. `--stat-refs` adds lstat() of the referenced paths
 * (type/owner/mode/size), still without opening them.
 *
 *   node dist/cli/core009-validate.js --runtime <runtime.json> --owner <owner.json>
 *     [--plan read-only|read-and-stream] [--expect-runtime-sha256 <hex>]
 *     [--trust-expires-at <UTC ISO>] [--now <UTC ISO>] [--min-remaining-minutes N]
 *     [--max-window-hours N] [--max-grant-hours N] [--workspace-id <id>]
 *     [--no-research-review] [--policy-install-only] [--stat-refs [--runtime-uid N] [--runtime-path <abs>]]
 *
 * Exit: 0 all checks passed, 1 at least one error, 2 usage. Output is a JSON
 * report of stable codes + JSON paths; a pass is not an approval or install. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { inspectCore009Preparation, statCore009References, type Core009Finding, type Core009Plan } from "../execution-v2/core009-preparation";

const usage = (): never => { process.stderr.write("CORE009_VALIDATE_USAGE\n"); process.exit(2); };
function privateJson(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > 131072) throw new Error("FILE_REJECTED");
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
  const flags = new Set(["--no-research-review", "--stat-refs", "--policy-install-only"]);
  const values = new Map<string, string>(), switches = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (flags.has(a)) { switches.add(a); continue; }
    if (!a.startsWith("--") || i + 1 >= argv.length) return usage();
    values.set(a, argv[++i]!);
  }
  return { values, switches };
}
const instant = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return usage();
  const ms = Date.parse(value);
  return Number.isSafeInteger(ms) ? ms : usage();
};
const positive = (value: string | undefined, scale: number): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * scale : usage();
};

async function main(): Promise<void> {
  const { values, switches } = parseArgs(process.argv.slice(2));
  const known = new Set(["--runtime", "--owner", "--plan", "--expect-runtime-sha256", "--trust-expires-at", "--now",
    "--min-remaining-minutes", "--max-window-hours", "--max-grant-hours", "--workspace-id", "--runtime-uid", "--runtime-path"]);
  if ([...values.keys()].some(k => !known.has(k)) || !values.get("--runtime") || !values.get("--owner")) usage();
  const plan = (values.get("--plan") ?? "read-only") as Core009Plan;
  if (plan !== "read-only" && plan !== "read-and-stream") usage();
  const expected = values.get("--expect-runtime-sha256");
  if (expected !== undefined && !/^[a-f0-9]{64}$/.test(expected)) usage();
  // Every option is validated BEFORE any file is opened.
  const options = {
    nowMs: instant(values.get("--now")) ?? Date.now(), plan, mode: switches.has("--policy-install-only") ? "policy-install-only" as const : "serve" as const, researchReview: !switches.has("--no-research-review"),
    workspaceId: values.get("--workspace-id"), trustExpiresAtMs: instant(values.get("--trust-expires-at")),
    minRemainingMs: positive(values.get("--min-remaining-minutes"), 60_000),
    maxWindowMs: positive(values.get("--max-window-hours"), 3_600_000),
    maxGrantMs: positive(values.get("--max-grant-hours"), 3_600_000), expectedRuntimeSha256: expected,
  };
  const uidText = values.get("--runtime-uid");
  const runtimeUid = uidText === undefined ? undefined : /^\d+$/.test(uidText) ? Number(uidText) : usage();
  const runtime = privateJson(values.get("--runtime")!), owner = privateJson(values.get("--owner")!);
  const report = inspectCore009Preparation(runtime, owner, options);
  let stat: Core009Finding[] = [];
  if (switches.has("--stat-refs")) {
    stat = await statCore009References(runtime, async p => lstatSync(p), { runtimeUid, runtimePath: values.get("--runtime-path") });
    report.errors.push(...stat);
    report.ok = report.errors.length === 0;
  }
  process.stdout.write(JSON.stringify({ schema_version: "portal.core009-preparation-report.v1", stat_refs: switches.has("--stat-refs"), ...report }) + "\n");
  process.exitCode = report.ok ? 0 : 1;
}
void main().catch(() => { process.stderr.write(JSON.stringify({ code: "CORE009_VALIDATE_FAILED" }) + "\n"); process.exitCode = 1; });
