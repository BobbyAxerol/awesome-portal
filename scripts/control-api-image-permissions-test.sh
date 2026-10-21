#!/usr/bin/env bash
# Static gate for deploy/images/control-api.Dockerfile file permissions. No
# Docker, network or secrets. Fails when a non-secret SQL/COPY input in the final
# runtime stage would inherit the build context's (possibly umask-0077) modes,
# or when a private input is made readable beyond its owner.
#
# Why: the pinned Core009 schema SQL once landed in the image as UID1000 0600.
# The root cap-drop-ALL maintenance one-shot has no DAC_OVERRIDE, so it could not
# read it and the official policy install refused before any DB write.
set -euo pipefail
# CONTROL_API_DOCKERFILE may point at an alternate Dockerfile (negative tests).

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -I - \
  "${CONTROL_API_DOCKERFILE:-${root_dir}/deploy/images/control-api.Dockerfile}" \
  "${root_dir}/apps/control-api/src/execution-v2/current-human-candidate.sql" \
  "${root_dir}/apps/control-api/src/execution-v2/current-human-schema.ts" <<'PY'
import hashlib
import pathlib
import re
import sys

dockerfile, schema_sql, schema_ts = (pathlib.Path(a) for a in sys.argv[1:4])
errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


# Join line continuations, drop comments/blank lines.
logical: list[str] = []
pending = ""
for raw in dockerfile.read_text(encoding="utf-8").splitlines():
    stripped = raw.strip()
    if not pending and (not stripped or stripped.startswith("#")):
        continue
    if stripped.endswith("\\"):
        pending += stripped[:-1].rstrip() + " "
        continue
    logical.append((pending + stripped).strip())
    pending = ""
if pending:
    logical.append(pending.strip())

from_indexes = [i for i, line in enumerate(logical) if line.upper().startswith("FROM ")]
if len(from_indexes) < 2:
    raise SystemExit("control-api.Dockerfile: expected a build stage and a runtime stage.")
runtime = logical[from_indexes[-1]:]


def copies(dest_fragment: str) -> list[dict]:
    found = []
    for position, line in enumerate(runtime):
        if not line.upper().startswith("COPY "):
            continue
        flags = dict(re.findall(r"--(\w+)=(\S+)", line))
        args = [t for t in line.split()[1:] if not t.startswith("--")]
        if len(args) < 2 or "from" in flags:
            continue
        if dest_fragment in args[-1] or dest_fragment in " ".join(args[:-1]):
            found.append({"position": position, "flags": flags, "args": args, "line": line})
    return found


def require_copy(label: str, fragment: str, mode: str) -> dict | None:
    matches = copies(fragment)
    if len(matches) != 1:
        fail(f"{label}: expected exactly one runtime-stage COPY of {fragment!r}, found {len(matches)}.")
        return None
    flags = matches[0]["flags"]
    if flags.get("chown") != "root:root":
        fail(f"{label}: COPY must set --chown=root:root deliberately (image-owned, read-only to the runtime user); got {flags.get('chown')!r}.")
    if flags.get("chmod") != mode:
        fail(f"{label}: COPY must set --chmod={mode} explicitly; got {flags.get('chmod')!r}.")
    return matches[0]


# --- Non-secret inputs -------------------------------------------------------
migrations = require_copy("migrations", "apps/control-api/migrations", "0755")
schema_copy = require_copy("native schema SQL", "current-human-candidate.sql", "0644")
package_copy = require_copy("package.json", "apps/control-api/package.json", "0644")

# A directory COPY with --chmod=0755 also makes every file 0755; migrations are
# data, so files must be normalised to 0644 afterwards.
if migrations is not None:
    normalised = any(
        line.upper().startswith("RUN ")
        and "find" in line
        and "migrations" in line
        and "-type f" in line
        and re.search(r"chmod\s+0?644\b", line)
        for line in runtime[migrations["position"] + 1:]
    )
    if not normalised:
        fail("migrations: a RUN after the COPY must `find ... -type f ... chmod 0644` the migration files.")

# The schema directory must be created explicitly at 0755 (never implicit).
if schema_copy is not None:
    created = any(
        line.upper().startswith("RUN ")
        and re.search(r"mkdir\s+-m\s*0?755\b", line)
        and "native-schema" in line
        for line in runtime[: schema_copy["position"]]
    )
    if not created:
        fail("native-schema: directory must be created before the COPY with `mkdir -m 0755`.")
    if "./native-schema/" not in schema_copy["args"][-1]:
        fail("native-schema: the SQL must still land at ./native-schema/current-human-candidate.sql (path read by current-human-schema.ts).")

# --- Private input: never touched, never widened -----------------------------
bootstrap = copies("bootstrap-users.yaml")
if len(bootstrap) != 1:
    fail(f"bootstrap-users.yaml: expected exactly one COPY, found {len(bootstrap)}.")
else:
    flags = bootstrap[0]["flags"]
    if "chmod" in flags:
        fail("bootstrap-users.yaml: private input must not receive --chmod (mode unchanged).")
    if flags.get("chown") != "node:node":
        fail("bootstrap-users.yaml: ownership must stay --chown=node:node.")

SECRET_HINT = re.compile(
    r"bootstrap-users|secret|credential|\.env|\.jwt|\.pem|\.key|keyring|private|trust|token",
    re.IGNORECASE,
)
NON_SECRET_DESTINATIONS = ("migrations", "native-schema", "package.json")


def other_bits(mode: str) -> int:
    if re.fullmatch(r"0?[0-7]{3,4}", mode):
        return int(mode[-1])
    return 0


for line in runtime:
    upper = line.upper()
    if upper.startswith("COPY "):
        flags = dict(re.findall(r"--(\w+)=(\S+)", line))
        mode = flags.get("chmod")
        if mode is None:
            continue
        if not re.fullmatch(r"0?[0-7]{3,4}", mode):
            fail(f"{line}: symbolic --chmod is not allowed; use an explicit octal mode.")
            continue
        if other_bits(mode) & 4 and not any(d in line for d in NON_SECRET_DESTINATIONS):
            fail(f"world-readable --chmod={mode} on an input outside the audited non-secret set: {line}")
        if other_bits(mode) & 4 and SECRET_HINT.search(" ".join(t for t in line.split() if not t.startswith("--"))):
            if "package.json" not in line and "migrations" not in line and "current-human-candidate.sql" not in line:
                fail(f"secret-looking path made world-readable: {line}")
    elif upper.startswith("RUN ") and re.search(r"\b(chmod|chown)\b", line):
        if SECRET_HINT.search(line):
            fail(f"RUN chmod/chown touches a secret-looking path: {line}")
        for mode in re.findall(r"chmod\s+(?:-\w+\s+)*(\S+)", line):
            if re.search(r"(^|,)[ao]?[+=][rwxXst]*r", mode) or other_bits(mode) & 4:
                if not re.search(r"migrations|native-schema", line):
                    fail(f"RUN chmod grants world-read outside migrations/native-schema: {line}")

# --- No privilege or capability widening ------------------------------------
users = [line.split(None, 1)[1].strip() for line in runtime if line.upper().startswith("USER ")]
if not users or users[-1] != "node":
    fail(f"runtime stage must end as USER node; got {users!r}.")
for line in runtime:
    if re.search(r"\b(setcap|cap_add|--cap-add|sudo|apk add)\b", line):
        fail(f"runtime stage must not add capabilities or privileged tooling: {line}")

# --- Bytes are not edited by this hardening ---------------------------------
pinned = re.search(r'CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256\s*=\s*"([0-9a-f]{64})"', schema_ts.read_text(encoding="utf-8"))
actual = hashlib.sha256(schema_sql.read_bytes()).hexdigest()
if pinned is None or pinned.group(1) != actual:
    fail(f"schema SQL sha256 {actual} does not match the runtime pin {pinned.group(1) if pinned else None}.")

if errors:
    for message in errors:
        print(f"control-api image permissions: {message}", file=sys.stderr)
    raise SystemExit(1)
print("control-api image permissions: OK (non-secret SQL/COPY inputs 0644/0755 root-owned; private input untouched)")
PY
