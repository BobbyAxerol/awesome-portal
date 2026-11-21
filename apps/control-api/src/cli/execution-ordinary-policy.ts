/** Explicit private Research operator, never imported by application startup.
 * node dist/cli/execution-ordinary-policy.js install-policy --artifact <private>
 *   --sha256 <approved> --not-before-ms <N> --not-after-ms <N> [--dry-run]
 * node dist/cli/execution-ordinary-policy.js accept-root [--dry-run]
 * Both use the pinned native/Core ROOT manifests. No public route or source
 * receipt JSON, command/Live activation, session issue or SQL seed is supported. */
import "reflect-metadata";
import { runOrdinaryPolicyOperator, ordinaryPolicyOperatorFailure } from "../execution-v2/ordinary-policy-operator";

void runOrdinaryPolicyOperator(process.argv.slice(2)).then(result => {
  process.stdout.write(JSON.stringify(result) + "\n");
}, error => {
  const failure = ordinaryPolicyOperatorFailure(error);
  process.stderr.write(JSON.stringify({ code: failure.code }) + "\n");
  process.exitCode = failure.exitCode;
});
