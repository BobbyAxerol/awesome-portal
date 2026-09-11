#!/usr/bin/env python3
"""Focused fail-closed tests for the EDS-12 runtime-binding collector."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


HERE = pathlib.Path(__file__).resolve().parent
COLLECTOR_PATH = HERE / "collect-eds12-runtime-binding.py"
VERIFIER_PATH = HERE / "execution-eds12-qualification.py"


def load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


COLLECTOR = load("eds12_runtime_binding_collector", COLLECTOR_PATH)
VERIFIER = load("eds12_runtime_binding_verifier", VERIFIER_PATH)


class FakeDocker:
    def __init__(self, containers: dict[tuple[str, str], dict], images: dict[str, dict]) -> None:
        self.containers = containers
        self.images = images

    def one_container(self, project: str, service: str) -> dict:
        try:
            return copy.deepcopy(self.containers[(project, service)])
        except KeyError as error:
            raise COLLECTOR.CollectionError("runtime service identity is absent or ambiguous") from error

    def inspect_image(self, identifier: str) -> dict:
        try:
            return copy.deepcopy(self.images[identifier])
        except KeyError as error:
            raise COLLECTOR.CollectionError("runtime service image is unavailable") from error


class RuntimeBindingCollectorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.commit = "a" * 40
        self.images = {
            service: f"ghcr.io/bobbyaxerol/portal-{service}@sha256:{str(index + 1) * 64}"
            for index, service in enumerate(sorted(COLLECTOR.ALL_SERVICES))
        }
        self.manifest_path = self.root / "release-manifest.json"
        self.manifest_path.write_text(json.dumps({
            "schema_version": "portal.release-manifest.v1",
            "source_commit": self.commit,
            "source_ref": "refs/heads/main",
            "image_tag": f"sha-{self.commit}",
            "authority": {
                "portal_release": True,
                "trading_system_release": False,
                "source_activation": False,
                "query_activation": False,
                "sse_activation": False,
                "command_activation": False,
                "database_copy_between_channels": False,
            },
            "services": [
                {
                    "service_id": service,
                    "image": self.images[service],
                    "image_digest": COLLECTOR.IMAGE.fullmatch(self.images[service]).group(1),
                    "command_enabled": False,
                }
                for service in sorted(COLLECTOR.ALL_SERVICES)
            ],
            "profile_bindings": [
                {"profile_id": "research_sgp_stable", "project_name": "portal-stable-v1-0-1"},
                {"profile_id": "execution_aws_hk_dark", "project_name": "portal-execution-edge"},
            ],
            "deployment_compose_bundle": {
                "file": "deployment-compose-bundle.json",
                "sha256": "sha256:" + "f" * 64,
            },
        }, sort_keys=True), encoding="utf-8")
        self.release = COLLECTOR.release_context(self.manifest_path)
        self.docker = FakeDocker(self.containers(), self.image_metadata())

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def image_metadata(self) -> dict[str, dict]:
        result = {}
        for service, image in self.images.items():
            identifier = f"sha256:{service.replace('-', '')[:16].ljust(16, '0')}"
            result[identifier] = {"RepoDigests": [image]}
        return result

    def image_identifier(self, service: str) -> str:
        return f"sha256:{service.replace('-', '')[:16].ljust(16, '0')}"

    def container(self, project: str, service: str, env: list[str] | None = None) -> dict:
        return {
            "Image": self.image_identifier(service),
            "Config": {
                "Labels": {
                    "com.docker.compose.project": project,
                    "com.docker.compose.service": service,
                    "org.opencontainers.image.revision": self.commit,
                },
                "Env": env or [],
            },
            "State": {"Running": True, "Health": {"Status": "healthy"}},
        }

    def containers(self) -> dict[tuple[str, str], dict]:
        rows: dict[tuple[str, str], dict] = {}
        for service in COLLECTOR.SGP_SERVICES:
            env = ["FEATURE_EXECUTION_COMMAND_RELAY=false"] if service == "control-api" else []
            rows[("portal-stable-v1-0-1", service)] = self.container("portal-stable-v1-0-1", service, env)
        for _profile, suffix in COLLECTOR.AWS_PROJECT_SUFFIXES:
            project = "portal-execution-edge" + suffix
            for service in COLLECTOR.AWS_SERVICES:
                env = ["EDGE_COMMAND_RELAY_ENABLED=false"] if service == "execution-edge" else []
                rows[(project, service)] = self.container(project, service, env)
        return rows

    def deployment_state(self) -> pathlib.Path:
        path = self.root / "deployed-release.env"
        values = {
            "SOURCE_BRANCH": "main",
            "SOURCE_COMMIT": self.commit,
            "IMAGE_TAG": f"sha-{self.commit}",
            "RELEASE_MANIFEST_SHA256": self.release.manifest_sha256,
            "DEPLOYMENT_COMPOSE_BUNDLE_SHA256": self.release.compose_bundle_sha256,
            **{env_key: self.images[service] for service, env_key in COLLECTOR.SGP_SERVICES.items()},
        }
        path.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")
        return path

    def verifier_release(self) -> dict:
        return {
            "source_commit": self.release.source_commit,
            "image_tag": self.release.image_tag,
            "deployment_compose_bundle": {"sha256": self.release.compose_bundle_sha256},
        }

    def verifier_images(self) -> dict[str, str]:
        return {
            service: COLLECTOR.IMAGE.fullmatch(image).group(1)
            for service, image in self.images.items()
        }

    def test_sgp_marker_is_accepted_by_eds12_verifier(self) -> None:
        marker = COLLECTOR.collect_sgp(self.release, self.deployment_state(), self.docker)
        output = self.root / "sgp.env"
        COLLECTOR.write_sgp_marker(marker, output, replace=False)
        parsed = VERIFIER.read_runtime_env(output)
        VERIFIER.validate_sgp_runtime_marker(
            output,
            release=self.verifier_release(),
            release_manifest_sha256=self.release.manifest_sha256,
            images=self.verifier_images(),
        )
        self.assertEqual(parsed["HEALTH"], "HEALTHY")
        self.assertEqual(parsed["COMMANDS_ENABLED"], "false")
        self.assertNotIn("FEATURE_EXECUTION_COMMAND_RELAY", output.read_text(encoding="utf-8"))

    def test_aws_marker_is_accepted_by_eds12_verifier(self) -> None:
        marker = COLLECTOR.collect_aws_hk(self.release, self.docker)
        output = self.root / "aws.json"
        COLLECTOR.write_aws_marker(marker, output, replace=False)
        VERIFIER.validate_aws_hk_runtime_marker(
            output,
            release=self.verifier_release(),
            release_manifest_sha256=self.release.manifest_sha256,
            images=self.verifier_images(),
        )
        self.assertEqual({row["service_id"] for row in marker["services"]}, set(COLLECTOR.AWS_SERVICES))
        self.assertFalse(marker["command_relay_enabled"])

    def test_mismatched_runtime_revision_fails_before_marker_write(self) -> None:
        bad = self.containers()
        bad[("portal-execution-edge-live", "execution-edge")]["Config"]["Labels"]["org.opencontainers.image.revision"] = "b" * 40
        output = self.root / "aws.json"
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "source revision"):
            COLLECTOR.collect_aws_hk(self.release, FakeDocker(bad, self.image_metadata()))
        self.assertFalse(output.exists())

    def test_enabled_command_relay_fails(self) -> None:
        bad = self.containers()
        bad[("portal-stable-v1-0-1", "control-api")]["Config"]["Env"] = ["FEATURE_EXECUTION_COMMAND_RELAY=true"]
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "command relay"):
            COLLECTOR.collect_sgp(self.release, self.deployment_state(), FakeDocker(bad, self.image_metadata()))

    def test_existing_marker_requires_explicit_replace(self) -> None:
        output = self.root / "marker.env"
        output.write_text("old\n", encoding="utf-8")
        marker = COLLECTOR.collect_sgp(self.release, self.deployment_state(), self.docker)
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "already exists"):
            COLLECTOR.write_sgp_marker(marker, output, replace=False)
        COLLECTOR.write_sgp_marker(marker, output, replace=True)
        self.assertEqual(oct(output.stat().st_mode & 0o777), "0o600")


if __name__ == "__main__":
    unittest.main()
