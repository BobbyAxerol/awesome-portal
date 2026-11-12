/** One-shot, READ-ONLY probe of the TS identity mapping through Core's existing client (C04).
 *
 *   node dist/cli/execution-identity-mapping-probe.js --config <abs path> --sha256 <approved sha256 of the config>
 *
 * The config is a private compact-JSON file owned by the process user (0400/0600) whose SHA256 the operator
 * approved; its TLS references are pinned the same way. No database, session, grant or mapping is touched.
 * Exit: 0 FOUND, 3 NOT_FOUND, 2 usage, 1 any other typed refusal (stderr carries only a fixed code). */
import { readNativeRuntimeReference } from "../execution-v2/native-core-runtime";
import { IdentityMappingProbeError, runIdentityMappingProbe } from "../execution-v2/identity-mapping-probe";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--config" || args[2] !== "--sha256" || !args[1]!.startsWith("/") || !/^[a-f0-9]{64}$/.test(args[3]!)) {
    process.stderr.write(JSON.stringify({ code: "IDENTITY_MAPPING_PROBE_USAGE" }) + "\n"); process.exitCode = 2; return;
  }
  const bytes = await readNativeRuntimeReference({ path: args[1]!, sha256: args[3]! }, 32768);
  const result = await runIdentityMappingProbe(bytes, args[3]!);
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.status === "FOUND" ? 0 : 3;
}
void main().catch(error => {
  process.stderr.write(JSON.stringify({ code: error instanceof IdentityMappingProbeError ? error.code : "IDENTITY_MAPPING_PROBE_FAILED" }) + "\n");
  process.exitCode = 1;
});
