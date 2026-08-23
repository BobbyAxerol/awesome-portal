#!/usr/bin/env bash
# Static gate for the D2 image-publication trust chain. It validates workflow
# structure only and never contacts GitHub/GHCR or reads repository secrets.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="${root_dir}/.github/workflows/publish-images.yml"

python3 - "${workflow}" <<'PY'
import pathlib
import sys

import yaml

path = pathlib.Path(sys.argv[1])
raw = path.read_text(encoding="utf-8")
document = yaml.safe_load(raw)
if not isinstance(document, dict):
    raise SystemExit("Image publication workflow is not a YAML object.")
if "pull_request_target" in raw:
    raise SystemExit("Image publication must never run with pull_request_target authority.")
if "COSIGN_PRIVATE_KEY" in raw:
    raise SystemExit("D2 publication must use workload OIDC, not a repository signing key.")

permissions = document.get("permissions")
expected_permissions = {
    "contents": "read",
    "packages": "write",
    "id-token": "write",
}
if permissions != expected_permissions:
    raise SystemExit("Image publication permissions drifted from the least-privilege set.")

jobs = document.get("jobs")
job = jobs.get("publish") if isinstance(jobs, dict) else None
steps = job.get("steps") if isinstance(job, dict) else None
if not isinstance(steps, list):
    raise SystemExit("Image publication steps are missing.")
by_name = {
    step.get("name"): step
    for step in steps
    if isinstance(step, dict) and isinstance(step.get("name"), str)
}

edge_build = by_name.get("Build and publish execution edge image", {})
proxy_build = by_name.get("Build and publish source proxy image", {})
if edge_build.get("id") != "execution-edge-build" or proxy_build.get("id") != "source-proxy-build":
    raise SystemExit("D2 image digest outputs are not named deterministically.")
for step in (edge_build, proxy_build):
    options = step.get("with")
    if not isinstance(options, dict) or options.get("push") is not True:
        raise SystemExit("D2 images must be pushed before digest verification.")
    if options.get("provenance") != "mode=max" or options.get("sbom") is not True:
        raise SystemExit("D2 images require maximum provenance and SBOM attestations.")

required_actions = {
    "Install keyless image signer": "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    "Upload execution D2 publication evidence": "actions/upload-artifact@v7",
}
for name, action in required_actions.items():
    if by_name.get(name, {}).get("uses") != action:
        raise SystemExit(f"Publication action drifted: {name}.")

trivy_steps = [
    step
    for step in steps
    if isinstance(step, dict)
    and step.get("uses") == "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25"
]
if len(trivy_steps) != 4:
    raise SystemExit("D2 requires report and critical gates for both runtime images.")
if sum(step.get("with", {}).get("exit-code") == "1" for step in trivy_steps) != 2:
    raise SystemExit("Exactly two critical vulnerability gates must fail closed.")
for step in trivy_steps:
    image_ref = str(step.get("with", {}).get("image-ref", ""))
    if "outputs.digest" not in image_ref:
        raise SystemExit("Vulnerability scans must bind to immutable build digests.")

sign = by_name.get("Sign execution D2 images by immutable digest", {}).get("run", "")
verify = by_name.get("Verify keyless signatures and write D2 evidence", {}).get("run", "")
for command in ('cosign sign --yes "${EXECUTION_EDGE_IMAGE}"', 'cosign sign --yes "${SOURCE_PROXY_IMAGE}"'):
    if command not in sign:
        raise SystemExit("Both D2 images must be signed by digest.")
if verify.count("cosign verify") != 2:
    raise SystemExit("Both D2 signatures must be verified before publication evidence.")
for boundary in ("--certificate-identity", "--certificate-oidc-issuer", "SOURCE_COMMIT", "SHA256SUMS"):
    if boundary not in verify:
        raise SystemExit(f"D2 publication evidence is missing {boundary}.")

dispatch = document.get("on", document.get(True, {}))
dispatch = dispatch.get("workflow_dispatch") if isinstance(dispatch, dict) else None
inputs = dispatch.get("inputs") if isinstance(dispatch, dict) else None
scope = inputs.get("scope") if isinstance(inputs, dict) else None
options = scope.get("options") if isinstance(scope, dict) else None
if options != ["all", "execution-d2"]:
    raise SystemExit("Manual publication must expose only all or execution-d2 scope.")
PY

printf 'Execution D2 image publication trust-chain gate passed. No image was published.\n'
