#!/usr/bin/env python3
"""Static contract test for the dedicated self-hosted deployment runner."""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/deploy.yml"
PROFILE_WORKFLOW = ROOT / ".github/workflows/production-feature-profile.yml"
LOCK = ROOT / "deploy/self-hosted-runner/actions-runner.lock.json"
SERVICE = ROOT / "deploy/self-hosted-runner/portal-gh-deploy-runner.service"
INSTALLER = ROOT / "scripts/install-portal-deploy-runner.sh"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    profile_workflow = PROFILE_WORKFLOW.read_text(encoding="utf-8")
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    service = SERVICE.read_text(encoding="utf-8")
    installer = INSTALLER.read_text(encoding="utf-8")

    require(
        "runs-on: [self-hosted, linux, x64, portal-deploy]" in workflow,
        "deploy workflow must target only the dedicated self-hosted label",
    )
    for marker in (
        '"${RUNNER_NAME}" == "portal-deploy-sgp1"',
        '"$(id -u)" != "0"',
        '"${HOME}" == "/srv/portal-gh-runner"',
        '"${RUNNER_TEMP}/portal-deploy-ssh"',
        "Remove deployment SSH material",
        "shred -u --",
    ):
        require(marker in workflow, f"missing runner hardening marker: {marker}")
    require("~/.ssh" not in workflow, "persistent runner home must not receive SSH material")
    require("gh api" not in workflow and "jq " not in workflow, "runner must not require gh or jq")

    require(
        "runs-on: [self-hosted, linux, x64, portal-deploy]" in profile_workflow,
        "production feature-profile workflow must use the dedicated deployment runner",
    )
    for marker in (
        '"${RUNNER_NAME}" == "portal-deploy-sgp1"',
        '"${HOME}" == "/srv/portal-gh-runner"',
        '"${RUNNER_TEMP}/portal-deploy-ssh"',
        "Remove deployment SSH material",
        "ssh_deploy() {",
        "scp_deploy() {",
        "UserKnownHostsFile=\"${DEPLOY_SSH_DIR}/known_hosts\"",
        "StrictHostKeyChecking=yes",
    ):
        require(marker in profile_workflow, f"missing feature-profile hardening marker: {marker}")
    require(
        "~/.ssh" not in profile_workflow,
        "feature-profile workflow must not persist SSH material in runner HOME",
    )

    require(lock["runner_name"] == "portal-deploy-sgp1", "runner name drifted")
    require(lock["runner_label"] == "portal-deploy", "runner label drifted")
    require(lock["runner_user"] == "portal-gh-runner", "runner user drifted")
    require(lock["runner_home"] == "/srv/portal-gh-runner", "runner home drifted")
    require(
        re.fullmatch(r"[0-9a-f]{64}", lock["asset_sha256"]) is not None,
        "runner asset SHA-256 is invalid",
    )
    require(
        lock["asset_name"] == f"actions-runner-linux-x64-{lock['runner_version']}.tar.gz",
        "runner asset/version mismatch",
    )
    require(
        lock["asset_url"].endswith(f"/v{lock['runner_version']}/{lock['asset_name']}"),
        "runner download URL/version mismatch",
    )

    for marker in (
        "User=portal-gh-runner",
        "NoNewPrivileges=yes",
        "ProtectSystem=strict",
        "ProtectHome=yes",
        "CapabilityBoundingSet=",
        "ReadWritePaths=/srv/portal-gh-runner",
    ):
        require(marker in service, f"missing service hardening marker: {marker}")
    require("User=root" not in service, "runner must never run as root")
    require("sha256sum --check --status" in installer, "installer must verify runner binary hash")
    require("shred -u -- \"${registration_token_file}\"" in installer, "installer must destroy bootstrap token")
    require("runner_directory_created=0" in installer, "partial-install cleanup must not delete a pre-existing runner")
    require("--unattended --replace" in installer, "runner registration must be unattended and replace-safe")
    subprocess.run(["bash", "-n", str(INSTALLER)], check=True)
    print("self-hosted deployment runner contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
