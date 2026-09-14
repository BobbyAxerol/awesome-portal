#!/usr/bin/env python3
"""Apply one reviewed execution feature profile to a deployed Portal release.

This is deliberately *not* a generic environment editor.  It can write only
the small allowlist below, validates the already-deployed signed release, and
keeps a root-only rollback copy plus a non-secret transaction record.  The
GitHub production workflow is the only supported caller.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import tempfile
from datetime import datetime, timezone
from typing import Final, Mapping


CANONICAL_DEPLOYMENT_PATH: Final = pathlib.Path("/srv/portal")
FEATURE_KEYS: Final = (
    "CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES",
    "CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT",
    "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR",
    "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS",
    "CONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT",
)
PROFILES: Final[Mapping[str, Mapping[str, str]]] = {
    # Bobby approved the two useful read panels.  Market Context is explicitly
    # closed here because its Paper qualification record is still pending; it
    # must never be implied by the public candle route.
    "execution-public-panels-v1": {
        "CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES": "true",
        "CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT": "true",
        "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR": "false",
        "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS": "false",
        "CONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT": "false",
    },
    # Exact config-only rollback; it does not touch source profiles, command
    # relay, projections, users, databases, images, or release directories.
    "execution-read-baseline-v1": {
        "CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES": "false",
        "CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT": "false",
        "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR": "false",
        "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS": "false",
        "CONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT": "false",
    },
}
SOURCE_COMMIT_RE: Final = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE: Final = re.compile(r"^sha256:[0-9a-f]{64}$")
DOTENV_KEY_RE: Final = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


class ProfileError(ValueError):
    """A deployment profile cannot be safely applied."""


def fail(message: str) -> None:
    raise ProfileError(message)


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def require_regular_file(path: pathlib.Path, label: str) -> None:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        fail(f"{label} is absent")
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        fail(f"{label} must be a regular non-symlink file")


def require_regular_private_file(path: pathlib.Path, label: str) -> None:
    require_regular_file(path, label)
    metadata = path.stat()
    if metadata.st_mode & 0o077:
        fail(f"{label} must not be group/world accessible")


def read_scalar_dotenv(path: pathlib.Path, *, require_private: bool = True) -> dict[str, str]:
    if require_private:
        require_regular_private_file(path, "production environment")
    else:
        require_regular_file(path, "release marker")
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = DOTENV_KEY_RE.match(line)
        if match is None:
            continue
        key, value = match.groups()
        if key in result:
            fail(f"production environment repeats {key}")
        # Runtime feature keys are intentionally bare booleans.  Other values
        # are not interpreted or exposed by this tool.
        result[key] = value.strip().strip("\"'")
    return result


def atomic_write_private(path: pathlib.Path, text: str) -> None:
    # The stable deployment workflow intentionally leaves .env.production
    # owned by its SSH deploy identity (currently `bobby`, mode 0600).  This
    # root-run helper must preserve that ownership; changing it to root would
    # silently break a later reviewed deploy that needs to read the file.
    prior = path.stat() if path.exists() else None
    prior_mode = stat.S_IMODE(prior.st_mode) if prior is not None else 0o600
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, prior_mode)
        if prior is not None:
            os.chown(temporary, prior.st_uid, prior.st_gid)
        os.replace(temporary, path)
        os.chmod(path, prior_mode)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def ensure_private_directory(path: pathlib.Path, label: str) -> None:
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink() or not path.is_dir():
        fail(f"{label} must be a real directory")
    os.chmod(path, 0o700)


def rewrite_dotenv(original: str, overrides: Mapping[str, str]) -> str:
    if set(overrides) != set(FEATURE_KEYS):
        fail("profile allowlist drifted")
    rewritten: list[str] = []
    seen: set[str] = set()
    for line in original.splitlines():
        match = DOTENV_KEY_RE.match(line)
        if match is not None and match.group(1) in overrides:
            key = match.group(1)
            rewritten.append(f"{key}={overrides[key]}")
            seen.add(key)
        else:
            rewritten.append(line)
    for key in FEATURE_KEYS:
        if key not in seen:
            rewritten.append(f"{key}={overrides[key]}")
    return "\n".join(rewritten) + "\n"


def validate_release(
    deployment: pathlib.Path,
    source_commit: str,
    manifest_sha256: str,
    *,
    require_canonical_path: bool,
) -> tuple[pathlib.Path, pathlib.Path]:
    if not SOURCE_COMMIT_RE.fullmatch(source_commit):
        fail("source commit must be 40 lowercase hexadecimal characters")
    if not SHA256_RE.fullmatch(manifest_sha256):
        fail("release manifest SHA-256 must use sha256:<64 lowercase hex>")
    if deployment.is_symlink():
        fail("deployment directory must not be a symlink")
    resolved = deployment.resolve(strict=False)
    if require_canonical_path and resolved != CANONICAL_DEPLOYMENT_PATH:
        fail("deployment path must be the canonical /srv/portal directory")
    if not resolved.is_dir():
        fail("deployment directory is unavailable or unsafe")
    env_path = resolved / ".env.production"
    require_regular_private_file(env_path, "production environment")
    # A production host keeps this secret file owned by its restricted deploy
    # identity rather than root. Its privacy (not a particular UID) is the
    # security invariant, and atomic updates preserve the current owner.
    env_values = read_scalar_dotenv(env_path)
    if env_values.get("PORTAL_STACK_NAME") != "portal-stable-v1-0-1" or env_values.get("PORTAL_HTTP_PORT") != "18081":
        fail("production environment does not target the verified stable namespace and port")
    marker = resolved / "deployed-release.env"
    marker_values = read_scalar_dotenv(marker, require_private=False)
    if marker_values.get("SOURCE_COMMIT") != source_commit:
        fail("deployed source commit does not match the requested profile transaction")
    manifest = resolved / "releases" / source_commit / "release-manifest.json"
    # The manifest is deliberately public release evidence; only its hash and
    # release binding matter here.  The host environment/rollback copies stay
    # root-only and are checked by the private-file helper instead.
    require_regular_file(manifest, "release manifest")
    if sha256_file(manifest) != manifest_sha256:
        fail("deployed release manifest digest does not match the reviewed value")
    return env_path, resolved / "transition"


def backup_and_apply(
    env_path: pathlib.Path,
    transition: pathlib.Path,
    profile: str,
    source_commit: str,
) -> dict[str, object]:
    if profile not in PROFILES:
        fail("unknown production feature profile")
    require_regular_private_file(env_path, "production environment")
    original = env_path.read_text(encoding="utf-8")
    before_sha256 = sha256_file(env_path)
    next_text = rewrite_dotenv(original, PROFILES[profile])
    backup: pathlib.Path | None = None
    if next_text == original:
        changed_keys: list[str] = []
        backup_name: str | None = None
    else:
        backups = transition / "feature-profile-backups"
        ensure_private_directory(backups, "feature-profile backup directory")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = backups / f"{stamp}-{profile}-{source_commit}.env"
        shutil.copyfile(env_path, backup)
        os.chmod(backup, 0o600)
        backup_name = backup.name
        # Compute this against the reviewed target before replacing the file.
        # Comparing the just-created backup with the still-current environment
        # would always (and incorrectly) report an empty change set.
        current_values = read_scalar_dotenv(env_path)
        changed_keys = [
            key
            for key in FEATURE_KEYS
            if current_values.get(key) != PROFILES[profile][key]
        ]
    evidence_dir = transition / "feature-profile-evidence"
    ensure_private_directory(evidence_dir, "feature-profile evidence directory")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    evidence = evidence_dir / f"{stamp}-{profile}-{source_commit}.json"
    try:
        if backup is not None:
            atomic_write_private(env_path, next_text)
        after_sha256 = sha256_file(env_path)
        payload = {
            "schema_version": "portal.production-execution-feature-profile.v1",
            "applied_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "profile": profile,
            "source_commit": source_commit,
            "feature_values": dict(PROFILES[profile]),
            "changed_keys": changed_keys,
            "environment_before_sha256": before_sha256,
            "environment_after_sha256": after_sha256,
            "rollback_backup_name": backup_name,
        }
        atomic_write_private(evidence, json.dumps(payload, indent=2, sort_keys=True) + "\n")
    except BaseException:
        # A profile change without its rollback/evidence record is not a valid
        # transaction.  Restore the exact private pre-image before surfacing
        # the error to the workflow.
        if backup is not None:
            atomic_write_private(env_path, backup.read_text(encoding="utf-8"))
        raise
    return {**payload, "evidence_path": str(evidence), "rollback_backup_path": None if backup_name is None else str(backups / backup_name)}


def restore_backup(env_path: pathlib.Path, transition: pathlib.Path, backup_path: str) -> dict[str, str]:
    candidate = pathlib.Path(backup_path).resolve(strict=True)
    allowed = (transition / "feature-profile-backups").resolve(strict=True)
    if candidate.parent != allowed or candidate.suffix != ".env":
        fail("rollback backup is outside the feature-profile backup directory")
    require_regular_private_file(candidate, "feature profile rollback backup")
    atomic_write_private(env_path, candidate.read_text(encoding="utf-8"))
    return {"restored_backup": candidate.name, "environment_sha256": sha256_file(env_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deployment-path", type=pathlib.Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--release-manifest-sha256", required=True)
    parser.add_argument("--profile", choices=sorted(PROFILES))
    parser.add_argument("--check", action="store_true", help="validate and print intended values without writing")
    parser.add_argument("--restore-backup", help="restore an exact backup created by this tool")
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            fail("production feature profiles must run as root through the deployment workflow")
        if bool(args.profile) == bool(args.restore_backup):
            fail("choose exactly one of --profile or --restore-backup")
        env_path, transition = validate_release(
            args.deployment_path,
            args.source_commit,
            args.release_manifest_sha256,
            require_canonical_path=True,
        )
        ensure_private_directory(transition, "transition directory")
        lock_path = transition / "feature-profile.lock"
        with lock_path.open("a+", encoding="utf-8") as lock:
            os.chmod(lock_path, 0o600)
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            if args.restore_backup:
                result: dict[str, object] = restore_backup(env_path, transition, args.restore_backup)
            elif args.check:
                result = {
                    "decision": "CHECK_PASSED",
                    "profile": args.profile,
                    "source_commit": args.source_commit,
                    "feature_values": dict(PROFILES[args.profile]),
                    "environment_sha256": sha256_file(env_path),
                }
            else:
                result = backup_and_apply(env_path, transition, args.profile, args.source_commit)
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ProfileError, ValueError) as error:
        print(json.dumps({"decision": "NO_GO", "reason": str(error)}, sort_keys=True), file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
