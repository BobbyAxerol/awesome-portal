#!/usr/bin/env python3
"""Verify Buildx SBOM/provenance attestations bound by a signed OCI index.

Buildx publishes SBOM and SLSA provenance as standard OCI attestation
manifests attached to the multi-platform image index.  They are not Cosign
``verify-attestation`` predicates.  The release workflow first verifies the
keyless Cosign signature of that immutable index, then this utility proves the
index-bound Buildx manifests refer to its linux/amd64 subject and carry both
required in-toto predicate layers.

The generated evidence deliberately contains only immutable public digests
and metadata; it never downloads a layer body or records credentials.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import stat
import subprocess
import sys
from typing import Any


SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")
IMAGE = re.compile(r"(?P<repository>[a-z0-9][a-z0-9._/-]*)@(?P<digest>sha256:[0-9a-f]{64})\Z")
MAX_RAW_BYTES = 4 * 1024 * 1024
OCI_INDEX_MEDIA_TYPES = {
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
}
OCI_MANIFEST_MEDIA_TYPES = {
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
}
ATTESTATION_ARTIFACT_TYPES = {
    "application/vnd.docker.attestation.manifest.v1+json",
    "application/vnd.oci.artifact.manifest.v1+json",
}
PREDICATES = {
    "sbom": "https://spdx.dev/Document",
    "provenance": "https://slsa.dev/provenance/v1",
}


class AttestationError(ValueError):
    """A signed Buildx attestation set is incomplete or internally invalid."""


def exact_digest(value: object, label: str) -> str:
    if not isinstance(value, str) or SHA256.fullmatch(value) is None:
        raise AttestationError(f"{label} must be an exact sha256 digest")
    return value


def object_json(raw: bytes | str, label: str) -> dict[str, Any]:
    if isinstance(raw, bytes):
        if not raw or len(raw) > MAX_RAW_BYTES:
            raise AttestationError(f"{label} is outside the safe size bound")
        try:
            raw = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AttestationError(f"{label} is not UTF-8 JSON") from exc
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AttestationError(f"{label} is invalid JSON") from exc
    if not isinstance(payload, dict):
        raise AttestationError(f"{label} must be a JSON object")
    return payload


def read_json(path: pathlib.Path, label: str) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise AttestationError(f"{label} is missing") from exc
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or metadata.st_size <= 0 or metadata.st_size > MAX_RAW_BYTES:
        raise AttestationError(f"{label} is outside the safe file bound")
    try:
        return object_json(path.read_bytes(), label)
    except OSError as exc:
        raise AttestationError(f"{label} cannot be read") from exc


def inspect_raw(reference: str) -> dict[str, Any]:
    completed = subprocess.run(
        ["docker", "buildx", "imagetools", "inspect", "--raw", reference],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip().splitlines()
        suffix = detail[-1] if detail else "unknown registry error"
        raise AttestationError(f"cannot retrieve immutable Buildx metadata: {suffix}")
    return object_json(completed.stdout, "registry manifest")


def descriptor_digest(descriptor: object, label: str) -> str:
    if not isinstance(descriptor, dict):
        raise AttestationError(f"{label} descriptor is invalid")
    return exact_digest(descriptor.get("digest"), f"{label} digest")


def select_descriptors(index: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    if index.get("mediaType") not in OCI_INDEX_MEDIA_TYPES:
        raise AttestationError("image is not an OCI index with Buildx attestations")
    descriptors = index.get("manifests")
    if not isinstance(descriptors, list) or not descriptors:
        raise AttestationError("OCI index has no manifest descriptors")
    runtimes: list[dict[str, Any]] = []
    attestations: list[dict[str, Any]] = []
    for descriptor in descriptors:
        if not isinstance(descriptor, dict):
            raise AttestationError("OCI index descriptor is invalid")
        platform = descriptor.get("platform")
        annotations = descriptor.get("annotations")
        if not isinstance(platform, dict):
            continue
        if platform.get("os") == "linux" and platform.get("architecture") == "amd64":
            runtimes.append(descriptor)
        is_buildx_attestation = (
            isinstance(annotations, dict)
            and annotations.get("vnd.docker.reference.type") == "attestation-manifest"
        )
        if is_buildx_attestation and platform.get("os") == "unknown" and platform.get("architecture") == "unknown":
            attestations.append(descriptor)
    if len(runtimes) != 1:
        raise AttestationError("OCI index must expose exactly one linux/amd64 subject manifest")
    if len(attestations) != 1:
        raise AttestationError("OCI index must expose exactly one Buildx attestation manifest")
    return runtimes[0], attestations[0]


def predicate_layer(manifest: dict[str, Any], predicate: str) -> dict[str, Any]:
    layers = manifest.get("layers")
    if not isinstance(layers, list):
        raise AttestationError("Buildx attestation manifest has no layer list")
    matches = []
    for layer in layers:
        if not isinstance(layer, dict):
            raise AttestationError("Buildx attestation layer is invalid")
        annotations = layer.get("annotations")
        if isinstance(annotations, dict) and annotations.get("in-toto.io/predicate-type") == predicate:
            matches.append(layer)
    if len(matches) != 1:
        raise AttestationError(f"Buildx attestation must carry exactly one {predicate} predicate")
    layer = matches[0]
    if layer.get("mediaType") != "application/vnd.in-toto+json":
        raise AttestationError("Buildx predicate layer is not an in-toto JSON layer")
    digest = exact_digest(layer.get("digest"), "Buildx predicate layer")
    size = layer.get("size")
    if not isinstance(size, int) or size <= 0:
        raise AttestationError("Buildx predicate layer size is invalid")
    return {"media_type": layer["mediaType"], "digest": digest, "size": size, "predicate_type": predicate}


def build_evidence(image: str, index: dict[str, Any], attestation: dict[str, Any]) -> dict[str, dict[str, Any]]:
    match = IMAGE.fullmatch(image)
    if match is None:
        raise AttestationError("image must be a lowercase digest-pinned registry reference")
    index_digest = match.group("digest")
    runtime, attestation_descriptor = select_descriptors(index)
    runtime_digest = descriptor_digest(runtime, "runtime manifest")
    attestation_digest = descriptor_digest(attestation_descriptor, "attestation manifest")
    if attestation.get("mediaType") not in OCI_MANIFEST_MEDIA_TYPES:
        raise AttestationError("Buildx attestation is not an OCI image manifest")
    if attestation.get("artifactType") not in ATTESTATION_ARTIFACT_TYPES:
        raise AttestationError("attestation artifact type is not an accepted Buildx type")
    subject = attestation.get("subject")
    if not isinstance(subject, dict) or subject.get("mediaType") not in OCI_MANIFEST_MEDIA_TYPES:
        raise AttestationError("Buildx attestation subject is invalid")
    if exact_digest(subject.get("digest"), "Buildx attestation subject") != runtime_digest:
        raise AttestationError("Buildx attestation subject does not match the linux/amd64 image manifest")

    binding = {
        "schema_version": "portal.buildx-attestation-evidence.v1",
        "image": image,
        "signed_index_digest": index_digest,
        "subject_manifest_digest": runtime_digest,
        "attestation_manifest": {
            "digest": attestation_digest,
            "media_type": attestation["mediaType"],
            "artifact_type": attestation["artifactType"],
            "reference_type": "attestation-manifest",
        },
        "verification": {
            "method": "cosign-signed-oci-index-plus-buildx-attestation-subject-binding",
            "browser_safe": True,
            "contains_runtime_secrets": False,
        },
    }
    return {
        kind: {**binding, "predicate": predicate_layer(attestation, predicate)}
        for kind, predicate in PREDICATES.items()
    }


def write_json(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run(args: argparse.Namespace) -> None:
    match = IMAGE.fullmatch(args.image)
    if match is None:
        raise AttestationError("--image must be a lowercase digest-pinned registry reference")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", args.service):
        raise AttestationError("--service must be a bounded lowercase service id")
    if (args.index_file is None) != (args.attestation_manifest_file is None):
        raise AttestationError("offline verification requires both --index-file and --attestation-manifest-file")
    if args.index_file is not None:
        index = read_json(args.index_file, "index file")
        attestation = read_json(args.attestation_manifest_file, "attestation manifest file")
    else:
        index = inspect_raw(args.image)
        _, descriptor = select_descriptors(index)
        attestation_reference = f"{match.group('repository')}@{descriptor_digest(descriptor, 'attestation manifest')}"
        attestation = inspect_raw(attestation_reference)
    for kind, payload in build_evidence(args.image, index, attestation).items():
        write_json(args.output_dir / f"{args.service}-{kind}.json", payload)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--output-dir", type=pathlib.Path, required=True)
    parser.add_argument("--index-file", type=pathlib.Path)
    parser.add_argument("--attestation-manifest-file", type=pathlib.Path)
    args = parser.parse_args()
    try:
        run(args)
    except AttestationError as exc:
        print(f"Buildx attestation verification failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
