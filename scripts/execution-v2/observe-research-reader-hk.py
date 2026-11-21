#!/usr/bin/env python3
"""One bounded Research/Paper source observation; never an authority writer.

Run only on the approved HK host against the exact installed accessor. The
artifact is written exclusively to a caller-owned 0700 directory. No raw
source observation or credentials are printed. This does not exercise Edge.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from uuid import uuid4

EXPECTED_BINDING = {
    "issuer": "portal-control-api.native-manager-read",
    "subject": "usr_5a38d5dfb08b44748f5776fbe04a1434",
    "workspace": "ws_06G19F61YB8CFR7TEWMS7HQ660",
    "environment": "paper",
    "workload": "portal-research-membership-discovery-paper-v1",
}
EXPECTED_SOURCE = {"database_name": "live_data_executor", "database_oid": "16384",
                   "system_identifier": "7674585245102796834"}
FUNCTION_PIN = "a2c1d8785313b34e033d53ae2609d166ffd505812fc0daf46a72e58f35291fc2"
QUERY = """BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='2s'; SET LOCAL lock_timeout='250ms';
SELECT CASE WHEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') =
  'a2c1d8785313b34e033d53ae2609d166ffd505812fc0daf46a72e58f35291fc2'
  THEN elp210_research_discovery.observe()::text ELSE NULL END
FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('elp210_research_discovery.observe()');
ROLLBACK;"""


def main():
    if len(sys.argv) != 2:
        raise ValueError("PRIVATE_DIRECTORY_REQUIRED")
    directory = Path(sys.argv[1])
    info = directory.lstat()
    if (not directory.is_absolute() or directory.resolve() != directory or
            not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or
            stat.S_IMODE(info.st_mode) != 0o700):
        raise ValueError("PRIVATE_DIRECTORY_INVALID")
    command = ["docker", "exec", "live_data_executor", "psql", "-X", "-qAt",
               "-v", "ON_ERROR_STOP=1", "-U", "ts_portal_research_membership_read",
               "-d", "live_data_executor", "-c", QUERY]
    result = subprocess.run(command, capture_output=True, timeout=10, check=False)
    if result.returncode != 0 or not 0 < len(result.stdout) <= 32769:
        raise ValueError("ACCESSOR_OBSERVATION_FAILED")
    raw = result.stdout.rstrip(b"\n")
    data = json.loads(raw)
    if (data.get("schema_version") != "pma.research-membership-rows.v1" or
            data.get("binding") != EXPECTED_BINDING or data.get("source") != EXPECTED_SOURCE or
            not isinstance(data.get("heads"), list) or not isinstance(data.get("receipts"), list) or
            (data.get("mapping") is not None and
             (not isinstance(data["mapping"], dict) or data["mapping"].get("status") != "ACTIVE"))):
        raise ValueError("OBSERVATION_CORRELATION_FAILED")
    checked = directory.lstat()
    if (not stat.S_ISDIR(checked.st_mode) or checked.st_uid != os.geteuid() or
            stat.S_IMODE(checked.st_mode) != 0o700 or
            (checked.st_dev, checked.st_ino) != (info.st_dev, info.st_ino) or
            directory.resolve() != directory):
        raise ValueError("PRIVATE_DIRECTORY_CHANGED")
    path = directory / ("research-source-observation-" + str(uuid4()) + ".json")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    print(json.dumps({"path": str(path), "sha256": hashlib.sha256(raw).hexdigest(),
                      "function_sha256": FUNCTION_PIN,
                      "mapping": "ACTIVE" if data.get("mapping") else "NOT_ACTIVE_OR_MISSING",
                      "paper_heads": len(data["heads"]), "receipts": len(data["receipts"]),
                      "kind": "SOURCE_ACCESSOR_ONLY_NOT_EDGE_ACCEPTANCE"}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("RESEARCH_SOURCE_OBSERVATION_FAILED", file=sys.stderr)
        sys.exit(1)
