"""Owner-only exact Research mapping observation; no listener or provisioning.

The reviewed source loader pins the physical target and original source role.
Only the official read-only mapping adapter queries identities. Never print
configuration, DSNs, credentials or underlying exceptions. Mapping is not auth.
"""
import asyncio
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import re

import asyncpg

from services.portfolio_management.existing_identity_mapping import ExistingIdentityMappingSource

CONFIG = "/home/bobby/secure/portal-native-manager-read/v1/commissioning/private-config.json"
CONFIG_SHA256 = "d18c555704da8542a610cbda60e5218e59ef4b0f7c265968e322b2454108fc11"
DATABASE = "live_data_executor"
SYSTEM = "7674585245102796834"
ISSUER = "portal-control-api.native-manager-read"
SUBJECT = "usr_5a38d5dfb08b44748f5776fbe04a1434"


def installed_source():
    # Installed release deliberately names its pinned operator entrypoint at
    # release root; do not silently import a newer mutable PM checkout.
    path = Path('/source/pm-native-manager-read.py')
    if sha256(path.read_bytes()).hexdigest() != '5ba8e6196ceebc5b93c7a8112de91c0a131f50b1a7178902054c5e76e6712942':
        raise ValueError('RESEARCH_MAPPING_ENTRYPOINT_CHANGED')
    spec = importlib.util.spec_from_file_location('installed_native_manager_read', path)
    installed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(installed)
    config, runtime, installation = installed.load(CONFIG, CONFIG_SHA256)
    if (config["target"]["database"], config["target"]["system_identifier"]) != (DATABASE, SYSTEM):
        raise ValueError("RESEARCH_MAPPING_TARGET_CHANGED")
    return installed, config, runtime, installation


async def observe():
    installed, config, _runtime, installation = installed_source()
    dsn, role = installed.dsn_for(config, installation, "source")
    if role != "ts_portal_native_read_source":
        raise ValueError("RESEARCH_MAPPING_ROLE_CHANGED")

    async def check(conn):
        await installed.checked_connection(conn, config, role)

    pool = await asyncpg.create_pool(dsn=dsn, min_size=0, max_size=1, timeout=1,
                                    command_timeout=1, init=check)
    try:
        source = ExistingIdentityMappingSource(pool, db_login=role, db_role=role,
            db_name=DATABASE, timeout_seconds=2, acquire_timeout_seconds=1,
            query_timeout_seconds=1, statement_timeout_ms=750, lock_timeout_ms=250)
        mapping = await source.lookup(human_issuer=ISSUER, subject=SUBJECT)
    finally:
        await asyncio.wait_for(pool.close(), 3)
    return {"schema_version": "edge.research-identity-observation.v1",
        "status": "ACTIVE_EXACT_MAPPING_FOUND" if mapping else "NO_ACTIVE_EXACT_MAPPING",
        "database": DATABASE, "system_identifier": SYSTEM, "source_role": role,
        "official_adapter": "ExistingIdentityMappingSource.lookup",
        "read_only": True, "mapping": mapping,
        "inactive_identity_not_reactivated": True, "business_authority_granted": False}


if __name__ == "__main__":
    try:
        result = asyncio.run(asyncio.wait_for(observe(), 10))
    except Exception as exc:
        # Fail closed: unavailable is not NOT_FOUND. No exception internals.
        code = str(exc)
        if re.fullmatch(r'(?:NATIVE_PRIVATE_|NATIVE_READ_|FENCE_|HUMAN_MAPPING_|RESEARCH_MAPPING_)[A-Z_]{1,80}', code) is None:
            code = "CLOSED_OBSERVATION_FAILURE"
        print(json.dumps({"status":"OBSERVATION_UNAVAILABLE", "absence_proven":False,
                          "reason_code":code, "error_type":type(exc).__name__}))
        raise SystemExit(1) from None
    print(json.dumps(result, sort_keys=True))
