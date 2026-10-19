"""Explicit approved TS receipt + dormant-role preparation, never activation.

No guessed DB/identity, raw SQL user insert, writer grant, native schema-prepare,
credential generation, service start/restart or permissive catalogue adoption.
"""
import argparse
import asyncio
from datetime import datetime
import json
from pathlib import Path
import re

import asyncpg

from observe_existing import installed_source
from receipt_installation import ReceiptPreparation

# Reviewed independent fresh PG150018 result; NEVER calculate from live target.
RECEIPT_SHA256 = '4c38d6ebf0ac9ff2b0e274082b6b6ea895346245ba577114047d8e25668adc63'
PHASE = 'NOT_STARTED'


async def prepare(start, end):
    global PHASE
    PHASE = 'LOAD_PINNED_CONFIG'
    installed, config, _runtime, installation = installed_source()
    dsn, role = installed.dsn_for(config, installation, 'schema')
    if role != 'bobby':
        raise ValueError('IDENTITY_PREPARE_SCHEMA_OWNER_CHANGED')
    value = installation.value
    candidate = ReceiptPreparation(Path('/candidate.sql').read_bytes(),
        receipt_sha256=RECEIPT_SHA256, native_sha256=value['native_catalogue_sha256'],
        registry_sha256=(value['registry']['catalogue_sha256'] if installation.existing_registry
                        else None),
        system_identifier=config['target']['system_identifier'],
        window_start=start, window_end=end)
    PHASE = 'CONNECT_OWNER'
    conn = await asyncpg.connect(dsn, timeout=2, command_timeout=3)
    try:
        PHASE = 'VERIFY_ACTUAL_TARGET'
        await installed.checked_connection(conn, config, role)
        # Match PostgreSQL's normal implicit-catalogue-first resolution. An
        # explicit public-before-pg_catalog path falsely changes deparsed UUID
        # metadata where pgcrypto exposes a public same-named function.
        await conn.execute('SET search_path=pg_catalog,public')
        # Full EXISTING install verification is metadata/row-pin observation,
        # not the original schema installer/seeder or native acceptance action.
        await installation._target(conn)
        PHASE = 'VERIFY_EXISTING_INSTALLATION'
        await installation._verify(conn)
        PHASE = 'PREPARE_APPROVED_RECEIPT_AND_DORMANT_ROLE'
        result = await candidate.prepare(conn)
        PHASE = 'VERIFY_EXISTING_INSTALLATION_AFTER_COMMIT'
        await installation._verify(conn)
        return result
    finally:
        await conn.close(timeout=2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', required=True, action='store_true')
    parser.add_argument('--window-start', required=True)
    parser.add_argument('--window-end', required=True)
    args = parser.parse_args()
    try:
        result = asyncio.run(prepare(datetime.fromisoformat(args.window_start),
                                     datetime.fromisoformat(args.window_end)))
    except Exception as exc:
        # An exception can follow COMMIT. No rollback/absence claim, secret or
        # private diagnostics. Retain the receipt/schema for authoritative readback.
        code = str(exc)
        if re.fullmatch(r'(?:NATIVE_PRIVATE_|NATIVE_INSTALL_|FENCE_|IDENTITY_PREPARE_)[A-Z_]{1,80}', code) is None:
            code = 'CLOSED_PREPARATION_FAILURE'
        print(json.dumps({'state':'INSTALL_OUTCOME_UNCONFIRMED','automatic_rollback':False,
            'phase':PHASE,'reason_code':code,'error_type':type(exc).__name__}))
        raise SystemExit(1) from None
    print(json.dumps(result, sort_keys=True))
