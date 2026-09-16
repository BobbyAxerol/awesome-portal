#!/usr/bin/env python3
"""Static authority checks for the isolated Portal CI/publication runner.

This is intentionally dependency-free so it runs before the rest of the
Portal CI suite.  It protects the separation between an untrusted build plane
and the narrow production deploy runner.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNNER_DIR = ROOT / "deploy" / "self-hosted-ci-runner"
LOCK = RUNNER_DIR / "actions-runner.lock.json"
INSTALLER = ROOT / "scripts" / "install-portal-ci-publish-runner.sh"
ASSERTION = ROOT / "scripts" / "assert-self-hosted-ci-publish-runner.sh"
CI = ROOT / ".github" / "workflows" / "ci.yml"
PUBLISH = ROOT / ".github" / "workflows" / "publish-images.yml"
SECURITY = ROOT / ".github" / "workflows" / "security.yml"
DEPLOY = ROOT / ".github" / "workflows" / "deploy.yml"
FEATURE_PROFILE = ROOT / ".github" / "workflows" / "production-feature-profile.yml"
ACTIONLINT_CONFIG = ROOT / ".github" / "actionlint.yaml"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read(path: Path) -> str:
    require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def check_shell(path: Path) -> None:
    result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True)
    require(result.returncode == 0, f"shell syntax invalid for {path.name}: {result.stderr.strip()}")


def main() -> int:
    lock = json.loads(read(LOCK))
    require(lock["schema_version"] == "portal.self-hosted-ci-publish-runner-lock.v1", "lock schema drifted")
    require(lock["runner_version"] == "2.337.0", "runner version must match reviewed deploy runner")
    require(lock["asset_name"] == "actions-runner-linux-x64-2.337.0.tar.gz", "runner asset drifted")
    require(
        lock["asset_url"] == "https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz",
        "runner URL drifted",
    )
    require(
        lock["asset_sha256"] == "70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613",
        "runner checksum drifted",
    )
    require(lock["runner_name"] == "portal-ci-publish-sgp1", "runner name drifted")
    require(lock["runner_labels"] == ["portal-ci", "portal-publish"], "runner labels drifted")
    require(lock["runner_user"] == "portal-ci-runner", "runner user drifted")
    require(lock["runner_home"] == "/srv/portal-ci-runner", "runner home drifted")
    require(lock["runtime_directory"] == "/srv/portal-ci-runner/runtime", "runner runtime drifted")

    installer = read(INSTALLER)
    assertion = read(ASSERTION)
    cleanup = read(RUNNER_DIR / "job-completed-cleanup.sh")
    docker_unit = read(RUNNER_DIR / "portal-ci-rootless-docker.service")
    runner_unit = read(RUNNER_DIR / "portal-gh-ci-publish-runner.service")
    slice_unit = read(RUNNER_DIR / "portal-ci-publish.slice")
    readme = read(RUNNER_DIR / "README.md")

    for path in (INSTALLER, ASSERTION, RUNNER_DIR / "job-completed-cleanup.sh", RUNNER_DIR / "wait-for-rootless-docker.sh"):
        check_shell(path)

    require("--install-browser-deps" in installer, "installer must explicitly gate browser dependencies")
    require("useradd --system" in installer and "--shell /usr/sbin/nologin" in installer, "runner must be a non-login system user")
    require("docker" not in installer.split("useradd --system", 1)[1].split("install -d", 1)[0], "runner must not be added to Docker group")
    require(
        not re.search(r"(?:usermod|gpasswd|adduser).*sudo|/etc/sudoers", installer),
        "installer must not grant sudo to CI runner",
    )
    require("shred -u" in installer, "registration token must be destroyed")
    require("--replace" in installer and "--labels \"${runner_labels}\"" in installer, "runner registration must be deterministic")
    require("name=rootless" in installer and "dockerd-rootless.sh" in installer, "installer must verify rootless Docker")
    require("wait-for-rootless-docker.sh" in installer and "systemctl enable --now \"${docker_service_name}\"" in installer, "installer must wait for rootless Docker readiness")

    for unit in (docker_unit, runner_unit):
        require("User=portal-ci-runner" in unit, "runner units must not run as root")
        require("Slice=portal-ci-publish.slice" in unit, "runner units must share bounded slice")
        require("ReadWritePaths=/srv/portal-ci-runner" in unit, "runner filesystem boundary drifted")
        require("/var/run/docker.sock" not in unit and "/run/docker.sock" not in unit, "rootful Docker socket must never be mounted")
    require("Delegate=yes" in docker_unit, "rootless Docker needs delegated cgroups")
    require("NoNewPrivileges=no" in docker_unit and "RestrictSUIDSGID=no" in docker_unit, "rootless user-map exception drifted")
    require("CapabilityBoundingSet=" not in docker_unit, "rootless map helpers must retain their host-required setuid path")
    for incompatible_directive in (
        "PrivateDevices=yes",
        "ProtectSystem=strict",
        "ProtectKernelTunables=yes",
        "ProtectKernelModules=yes",
        "ProtectClock=yes",
        "ProtectHostname=yes",
        "ProtectProc=invisible",
        "RestrictRealtime=yes",
        "RestrictAddressFamilies=",
    ):
        require(incompatible_directive not in docker_unit, f"rootless host compatibility drifted: {incompatible_directive}")
    require("PrivateTmp=yes" in docker_unit and "ProtectHome=yes" in docker_unit and "ProtectControlGroups=yes" in docker_unit, "compatible daemon hardening drifted")
    require("NoNewPrivileges=yes" in runner_unit and "RestrictSUIDSGID=yes" in runner_unit and "ProtectSystem=strict" in runner_unit, "Actions runner must retain no-privilege hardening")
    require("MemoryMax=20G" in slice_unit and "CPUQuota=600%" in slice_unit and "MemorySwapMax=0" in slice_unit, "resource envelope drifted")
    require("ACTIONS_RUNNER_HOOK_JOB_COMPLETED" in runner_unit, "completion cleanup hook must remain wired")

    require("realpath -e" in cleanup, "cleanup must resolve exact paths before deletion")
    require("container prune" in cleanup and "network prune" in cleanup, "bounded rootless cleanup missing")
    require("image prune --all" in cleanup and "buildx prune" in cleanup, "bounded image/cache cleanup missing")
    require("volume prune" not in cleanup and "system prune" not in cleanup, "cleanup must never prune volumes or global Docker state")
    require("/srv/portal" not in cleanup.replace("/srv/portal-ci-runner", ""), "cleanup must never target Portal runtime")
    require("portal-deploy-sgp1" not in assertion, "CI assertion must not permit deployment runner")
    require("name=rootless" in assertion and "portal-ci-publish-sgp1" in assertion, "runner assertion drifted")
    require("rootless Docker" in readme and "never prunes Docker volumes" in readme, "operational cleanup documentation drifted")

    ci = read(CI)
    publish = read(PUBLISH)
    security = read(SECURITY)
    deploy = read(DEPLOY)
    profile = read(FEATURE_PROFILE)
    actionlint_config = read(ACTIONLINT_CONFIG)
    for label in ("portal-deploy", "portal-ci", "portal-publish"):
        require(f"- {label}" in actionlint_config, f"Actionlint custom runner label missing: {label}")
    for workflow, label in ((ci, "portal-ci"), (publish, "portal-publish"), (security, "portal-ci")):
        require(f"runs-on: [self-hosted, linux, x64, {label}]" in workflow, f"{label} workflow routing drifted")
        require("assert-self-hosted-ci-publish-runner.sh" in workflow, f"{label} workflow lacks runner assertion")
        require("ubuntu-latest" not in workflow, f"{label} workflow must not consume hosted runner quota")
    require("test_self_hosted_ci_publish_runner.py" in ci, "CI must statically protect its own runner contract")
    require("npx playwright install chromium" in ci and "--with-deps chromium" not in ci, "browser setup must remain non-root")
    require("gh api" not in publish and "jq -r" not in publish, "publication must not depend on uninstalled gh/jq")
    require("curl --fail-with-body" in publish and "python3 - \"${required_name}\"" in publish, "publication CI gate poll must use portable tools")
    require("runs-on: [self-hosted, linux, x64, portal-deploy]" in deploy, "deploy runner routing drifted")
    require("runs-on: [self-hosted, linux, x64, portal-deploy]" in profile, "feature profile runner routing drifted")
    require("portal-ci" not in deploy and "portal-publish" not in deploy, "deployment must not use CI/publication runner")

    print("self-hosted CI/publication runner contract: PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"self-hosted CI/publication runner contract: FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
