#!/usr/bin/env python3
"""Create bounded, object-shaped evidence for one keyless Cosign image signature.

``cosign verify --output json`` correctly emits a JSON *array*.  Release packs
use object-only artifacts so they can reject duplicate keys and secret-shaped
data consistently.  This small adapter preserves the verified records inside
an exact, subject-bound envelope; it does not sign, publish, or activate an
image.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys
from typing import Any


SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")
IMAGE = re.compile(r"(?P<repository>[a-z0-9][a-z0-9._/-]*)@(?P<digest>sha256:[0-9a-f]{64})\Z")
MAX_OUTPUT_BYTES = 4 * 1024 * 1024


class SignatureError(ValueError):
    """The supplied image has no acceptable keyless signature evidence."""


def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise SignatureError("Cosign output contains a duplicate object key")
        result[key] = value
    return result


def parse_records(raw: bytes, image: str) -> list[dict[str, Any]]:
    match = IMAGE.fullmatch(image)
    if match is None:
        raise SignatureError("image must be a lowercase digest-pinned registry reference")
    if not raw or len(raw) > MAX_OUTPUT_BYTES:
        raise SignatureError("Cosign output is outside the safe size bound")
    try:
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SignatureError("Cosign output is not valid UTF-8 JSON") from exc
    if not isinstance(payload, list) or not payload:
        raise SignatureError("Cosign verification did not return any signature records")

    repository = match.group("repository")
    digest = match.group("digest")
    records: list[dict[str, Any]] = []
    for record in payload:
        if not isinstance(record, dict):
            raise SignatureError("Cosign signature record is not an object")
        critical = record.get("critical")
        if not isinstance(critical, dict):
            raise SignatureError("Cosign signature record has no critical binding")
        identity = critical.get("identity")
        subject = critical.get("image")
        if not isinstance(identity, dict) or not isinstance(subject, dict):
            raise SignatureError("Cosign signature record binding is malformed")
        if identity.get("docker-reference") != repository:
            raise SignatureError("Cosign signature repository binding drifted")
        if subject.get("docker-manifest-digest") != digest:
            raise SignatureError("Cosign signature digest binding drifted")
        records.append(record)
    return records


def verify(args: argparse.Namespace) -> dict[str, Any]:
    if IMAGE.fullmatch(args.image) is None:
        raise SignatureError("image must be a lowercase digest-pinned registry reference")
    completed = subprocess.run(
        [
            "cosign", "verify",
            "--certificate-identity", args.certificate_identity,
            "--certificate-oidc-issuer", args.certificate_oidc_issuer,
            "--output", "json", args.image,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise SignatureError("keyless Cosign signature verification failed")
    records = parse_records(completed.stdout, args.image)
    return {
        "schema_version": "portal.cosign-signature-evidence.v1",
        "image": args.image,
        "certificate_identity": args.certificate_identity,
        "certificate_oidc_issuer": args.certificate_oidc_issuer,
        "record_count": len(records),
        "records": records,
    }


def write_json(path: pathlib.Path, payload: dict[str, Any]) -> None:
    if path.exists() and path.is_symlink():
        raise SignatureError("signature evidence output must not be a symlink")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--certificate-identity", required=True)
    parser.add_argument("--certificate-oidc-issuer", required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    try:
        write_json(args.output, verify(args))
    except SignatureError as exc:
        print(f"Cosign signature verification failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
