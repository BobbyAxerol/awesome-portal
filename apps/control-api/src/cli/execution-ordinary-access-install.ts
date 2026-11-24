/** DRY-RUN ONLY access-profile check for an ordinary Core. There is no install path in this build.
 * node dist/cli/execution-ordinary-access-install.js --dry-run --artifact <root-owned 0600 abs path> --sha256 <approved>
 *   --not-before-ms <N> --not-after-ms <N> --target-file <root-owned 0600 abs target pin json>
 *   --target-sha256 <independently approved target pin sha256>
 * See execution-v2/ordinary-access-install-dry-run.ts for why a real install is gated. */
import { accessProfileInstallFailure, runAccessProfileInstallDryRun } from "../execution-v2/ordinary-access-install-dry-run";

void runAccessProfileInstallDryRun(process.argv.slice(2)).then(result => {
  process.stdout.write(JSON.stringify(result) + "\n");
}, error => {
  const failure = accessProfileInstallFailure(error);
  process.stderr.write(JSON.stringify({ code: failure.code }) + "\n");
  process.exitCode = failure.exitCode;
});
