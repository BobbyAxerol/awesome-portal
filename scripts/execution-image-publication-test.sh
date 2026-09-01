#!/usr/bin/env bash
# Static gate for the D2/D3 image-publication trust chain. It validates workflow
# structure only and never contacts GitHub/GHCR or reads repository secrets.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="${root_dir}/.github/workflows/publish-images.yml"

python3 - \
  "${workflow}" \
  "${root_dir}/deploy/images/execution-edge.Dockerfile" \
  "${root_dir}/deploy/images/source-proxy.Dockerfile" \
  "${root_dir}/deploy/images/control-api.Dockerfile" <<'PY'
import pathlib
import sys

import yaml

path = pathlib.Path(sys.argv[1])
raw = path.read_text(encoding="utf-8")
edge_dockerfile = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
proxy_dockerfile = pathlib.Path(sys.argv[3]).read_text(encoding="utf-8")
control_dockerfile = pathlib.Path(sys.argv[4]).read_text(encoding="utf-8")
document = yaml.safe_load(raw)
if not isinstance(document, dict):
    raise SystemExit("Image publication workflow is not a YAML object.")
if "pull_request_target" in raw:
    raise SystemExit("Image publication must never run with pull_request_target authority.")
if "COSIGN_PRIVATE_KEY" in raw:
    raise SystemExit("Execution publication must use workload OIDC, not a repository signing key.")

expected_edge_runtime = (
    "FROM gcr.io/distroless/cc-debian12:nonroot@sha256:"
    "9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f"
)
if expected_edge_runtime not in edge_dockerfile:
    raise SystemExit("Execution Edge runtime must remain on the reviewed pinned Distroless digest.")
for build_input in (
    "COPY packages/contracts packages/contracts",
    "COPY deploy/manifests deploy/manifests",
    "COPY upgrade/backend upgrade/backend",
    "COPY upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack",
):
    if build_input not in edge_dockerfile:
        raise SystemExit(f"Execution Edge embedded build input is missing: {build_input}")
expected_proxy_runtime = (
    "FROM nginxinc/nginx-unprivileged:1.31.4-alpine3.24-slim@sha256:"
    "021f32b23e2bfc8610ccdec499b709625dcee1369884d7a51bd8a23a3accb301"
)
if expected_proxy_runtime not in proxy_dockerfile:
    raise SystemExit("Source Proxy runtime must remain on the reviewed pinned NGINX digest.")
expected_control_runtime = (
    "FROM node:22.23.2-alpine3.24@sha256:"
    "c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32"
)
if control_dockerfile.count(expected_control_runtime) != 2:
    raise SystemExit("Control API build and runtime must share the reviewed pinned Node digest.")
for build_only_runtime_path in (
    "/usr/local/lib/node_modules/npm",
    "/usr/local/lib/node_modules/corepack",
    "/opt/yarn-*",
):
    if build_only_runtime_path not in control_dockerfile:
        raise SystemExit("Control API runtime package-manager removal boundary drifted.")

permissions = document.get("permissions")
expected_permissions = {
    "actions": "read",
    "checks": "read",
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
control_build = by_name.get("Build and publish Control API image", {})
if edge_build.get("id") != "execution-edge-build" or proxy_build.get("id") != "source-proxy-build":
    raise SystemExit("D2 image digest outputs are not named deterministically.")
if control_build.get("id") != "control-api-build":
    raise SystemExit("D3 Control API digest output is not named deterministically.")
for step in (edge_build, proxy_build):
    options = step.get("with")
    if not isinstance(options, dict) or options.get("push") is not True:
        raise SystemExit("D2 images must be pushed before digest verification.")
    if options.get("provenance") != "mode=max" or options.get("sbom") is not True:
        raise SystemExit("D2 images require maximum provenance and SBOM attestations.")
control_options = control_build.get("with")
if (
    not isinstance(control_options, dict)
    or control_options.get("push") is not True
    or control_options.get("provenance") != "mode=max"
    or control_options.get("sbom") is not True
):
    raise SystemExit("D3 Control API requires push, maximum provenance and SBOM attestations.")

required_actions = {
    "Install keyless image signer": "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    "Upload execution D2 publication evidence": "actions/upload-artifact@v7",
    "Upload execution D3 publication evidence": "actions/upload-artifact@v7",
    "Upload N14B current-source compatibility adjunct": "actions/upload-artifact@v7",
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
if len(trivy_steps) != 12:
    raise SystemExit("N14A requires report and critical gates for all six Portal images.")
if sum(step.get("with", {}).get("exit-code") == "1" for step in trivy_steps) != 6:
    raise SystemExit("Exactly six critical vulnerability gates must fail closed.")
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
d3_sign = by_name.get("Sign D3 Control API by immutable digest", {}).get("run", "")
d3_verify = by_name.get("Verify keyless signature and write D3 Control API evidence", {}).get("run", "")
if 'cosign sign --yes "${CONTROL_API_IMAGE}"' not in d3_sign:
    raise SystemExit("D3 Control API must be signed by digest.")
if d3_verify.count("cosign verify") != 1:
    raise SystemExit("D3 Control API signature must be verified before evidence publication.")
for boundary in ("--certificate-identity", "--certificate-oidc-issuer", "SOURCE_COMMIT", "SHA256SUMS"):
    if boundary not in d3_verify:
        raise SystemExit(f"D3 publication evidence is missing {boundary}.")

n14_release = by_name.get("Verify all release images and generate N14A candidate", {}).get("run", "")
for boundary in (
    "scripts/portal-current-source-release.py generate",
    "--n14a-pack-dir release/n14a-candidate",
    "--output-dir release/n14b-current-source",
    "scripts/portal-current-source-release.py verify",
):
    if boundary not in n14_release:
        raise SystemExit(f"N14B current-source publication binding is missing {boundary}.")

dispatch = document.get("on", document.get(True, {}))
dispatch = dispatch.get("workflow_dispatch") if isinstance(dispatch, dict) else None
inputs = dispatch.get("inputs") if isinstance(dispatch, dict) else None
scope = inputs.get("scope") if isinstance(inputs, dict) else None
options = scope.get("options") if isinstance(scope, dict) else None
if options != ["all", "execution-d2", "execution-d3"]:
    raise SystemExit("Manual publication must expose only all, execution-d2 or execution-d3 scope.")
PY

printf 'Execution D2/D3 image publication trust-chain gate passed. No image was published.\n'
