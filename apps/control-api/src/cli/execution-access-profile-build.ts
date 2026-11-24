/** OFFLINE access-profile artifact builder. Never imported by application startup, installs nothing.
 * node dist/cli/execution-access-profile-build.js --input <abs input.json> --out <abs new artifact.json>
 * Prints the artifact sha256 for the owner to approve. See execution-v2/access-profile-build-operator.ts. */
import { accessProfileBuildFailure, runAccessProfileBuild } from "../execution-v2/access-profile-build-operator";

void runAccessProfileBuild(process.argv.slice(2)).then(result => {
  process.stdout.write(JSON.stringify(result) + "\n");
}, error => {
  const failure = accessProfileBuildFailure(error);
  process.stderr.write(JSON.stringify({ code: failure.code }) + "\n");
  process.exitCode = failure.exitCode;
});
