/** Explicit operator invocation only. Inputs are private paths and hashes;
 * output is a private observation reference, never a grant or accepted fact. */
import { runResearchMembershipDiscovery } from "../execution-v2/research-membership-discovery-operator";

export function parseResearchDiscoveryArgs(argv: readonly string[]) {
  const allowed = new Set(["--manifest", "--manifest-sha256", "--binding", "--binding-sha256", "--out-dir"]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index]!;
    if (!allowed.has(key) || values.has(key) || index + 1 >= argv.length) throw new Error("RESEARCH_DISCOVERY_USAGE");
    const value = argv[++index]!;
    if (!value || value.startsWith("--")) throw new Error("RESEARCH_DISCOVERY_USAGE");
    values.set(key, value);
  }
  if (values.size !== allowed.size) throw new Error("RESEARCH_DISCOVERY_USAGE");
  return { manifest: { path: values.get("--manifest")!, sha256: values.get("--manifest-sha256")! },
    binding: { path: values.get("--binding")!, sha256: values.get("--binding-sha256")! },
    outputDirectory: values.get("--out-dir")! };
}

async function main() {
  const output = await runResearchMembershipDiscovery(parseResearchDiscoveryArgs(process.argv.slice(2)));
  process.stdout.write(JSON.stringify({ status: "OBSERVATION_ONLY", private_reference: output.path,
    sha256: output.sha256 }) + "\n");
}
if (require.main === module) {
  main().catch(() => { process.stderr.write("RESEARCH_DISCOVERY_OPERATION_FAILED\n"); process.exitCode = 1; });
}
