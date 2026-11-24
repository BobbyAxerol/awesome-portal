/** OFFLINE ONLY. Writes one NEW existing-format artifact; never applies it.
 * node dist/cli/execution-access-profile-change.js --operation BOOTSTRAP --input <abs build-input> --out <abs new-file>
 * RENEW / HOT_ADD also require --current <abs artifact> --current-sha256 <independent expected sha256>.
 * Existing predecessor files are retained. Actual installed head/history CAS,
 * ordinary mutation and Stan delegation are separately assigned G3 work. */
import { runOrdinaryProfileLifecycle, ordinaryProfileLifecycleFailure } from "../execution-v2/ordinary-profile-lifecycle-operator";

void runOrdinaryProfileLifecycle(process.argv.slice(2)).then(result => {
  process.stdout.write(JSON.stringify(result) + "\n");
}, error => {
  const failure = ordinaryProfileLifecycleFailure(error);
  process.stderr.write(JSON.stringify({ code: failure.code }) + "\n");
  process.exitCode = failure.exitCode;
});
