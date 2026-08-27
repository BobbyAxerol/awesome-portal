#!/usr/bin/env python3
"""Focused mutation tests for the N17A readiness verifier."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile


MODULE_PATH = pathlib.Path(__file__).with_name("execution-n17a-readiness.py")
SPEC = importlib.util.spec_from_file_location("execution_n17a_readiness", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("cannot load N17A readiness verifier")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def expect_failure(callback, label: str) -> None:
    try:
        callback()
    except MODULE.ReadinessError:
        return
    raise AssertionError(f"expected fail-closed rejection: {label}")


def main() -> None:
    MODULE.verify_static()
    drills = [
        f"{scenario}=sha256:{index:064x}"
        for index, scenario in enumerate(MODULE.SCENARIOS, start=1)
    ]
    with tempfile.TemporaryDirectory(prefix="portal-n17a-verifier-") as directory:
        root = pathlib.Path(directory)
        evidence = root / "evidence.json"
        MODULE.seal_evidence(evidence, 1_777_777_777, drills)
        MODULE.verify_evidence(evidence)

        payload = json.loads(evidence.read_text(encoding="utf-8"))
        payload["production_active"] = True
        widened = root / "widened.json"
        widened.write_text(json.dumps(payload), encoding="utf-8")
        expect_failure(lambda: MODULE.verify_evidence(widened), "production authority")

        payload = json.loads(evidence.read_text(encoding="utf-8"))
        payload["drills"][0]["network_attempts"] = 1
        networked = root / "networked.json"
        networked.write_text(json.dumps(payload), encoding="utf-8")
        expect_failure(lambda: MODULE.verify_evidence(networked), "network attempt")

        payload = json.loads(evidence.read_text(encoding="utf-8"))
        payload["manifest_digest"] = "sha256:" + "f" * 64
        tampered = root / "tampered.json"
        tampered.write_text(json.dumps(payload), encoding="utf-8")
        expect_failure(lambda: MODULE.verify_evidence(tampered), "manifest tamper")

        expect_failure(
            lambda: MODULE.seal_evidence(root / "missing.json", 1_777_777_777, drills[:-1]),
            "missing drill",
        )

    print("N17A readiness verifier mutation tests passed.")


if __name__ == "__main__":
    main()
