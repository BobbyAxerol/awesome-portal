"""TEST_ONLY actual disposable PG15, never operational configuration/identity.

Derives receipt golden from the ORIGINAL SQL in an independently created DB;
uses real metadata/transactions/triggers. Test fixtures confer no human grant.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import re

import asyncpg

from receipt_installation import (ReceiptPreparation, ROLE, SQL_SHA256, TABLE,
    FORBIDDEN_TEST_SYSTEMS, NATIVE_ROLES, receipt_catalogue)
from services.portfolio_management.native_fence import native_catalogue_digest
from services.portfolio_management.native_registry_catalogue import registry_catalogue_digest

SQL = 'contracts/baseline/portfolio-account-v1_1/'
PINS = {
    'users':('init-db/99-pma11-verified-user-identity.sql','80514c246e40fe26ef0d43f311fbc9c39bf3b57f354ca2cbff4e4f5ca2ef7752'),
    'policy':(SQL+'pma11-04-membership-candidate.sql','43dbebc8d776ba12a990127ac7d3e6a0c74059c8e374d9256718c52f6afe53ef'),
    'read':(SQL+'pma11-business-root-read-candidate.sql','74a5ee6e1e9732882b6d3ac8da75adebedd11afcf32aad2ad17d33d9f65173fe'),
    'fence':(SQL+'pma11-business-root-fence-candidate.sql','5692f7ad6fa918f6a3f0511b02ec2b8969e0047e109e3b577d3cde8757c3f269'),
    'guards':(SQL+'pma11-business-root-guards-candidate.sql','c1cd273561d198f5e52664592f0284c0f2feca4255b99a3ed4bcad0080f2d57a'),
    'receipts':(SQL+'pma11-elp210-human-commit-candidate.sql', SQL_SHA256),
}


async def run():
    sources = {}
    for name,(relative,pin) in PINS.items():
        raw = (Path('/candidate.sql') if name == 'receipts' else Path('/source')/relative).read_bytes()
        assert sha256(raw).hexdigest() == pin
        sources[name] = raw
    conn = await asyncpg.connect('postgresql://bobby@pm-native-golden-db/pm_native_golden_test',
        timeout=2, command_timeout=5)
    cases = []
    try:
        target = await conn.fetchrow("SELECT current_database() AS db,current_user AS role,"
            "(pg_control_system()).system_identifier::text AS system,"
            "current_setting('server_version_num')::int AS version")
        assert target['db'] == 'pm_native_golden_test' and target['role'] == 'bobby'
        assert target['system'] not in FORBIDDEN_TEST_SYSTEMS and 150000 <= target['version'] < 160000
        await conn.execute('SET search_path=public,pg_catalog')
        await conn.execute('CREATE EXTENSION pgcrypto')
        policy = re.search(rb'CREATE TABLE IF NOT EXISTS pm_membership\.policy \(.*?\n\);',
                           sources['policy'], re.S).group().decode()
        async with conn.transaction():
            await conn.execute(sources['users'].decode())
            # Exact already-qualified native UUID default on the real source;
            # no extension/function/old-table mutation is needed there.
            await conn.execute('ALTER TABLE public.ts_users ALTER COLUMN user_id SET DEFAULT pg_catalog.gen_random_uuid()')
            await conn.execute('CREATE SCHEMA pm_membership; REVOKE ALL ON SCHEMA pm_membership FROM PUBLIC;'+policy)
            await conn.execute(sources['read'].decode())
            await conn.execute(sources['fence'].decode())
            # Explicit TEST_ONLY safety bounds; NOT measured production capacity.
            await conn.execute('INSERT INTO pm_core_authority.limits VALUES(TRUE,$1,8,4096)', 'c'*64)
        await conn.execute(sources['guards'].decode())
        await conn.execute('SET search_path=pg_catalog,public')
        for role in NATIVE_ROLES:
            await conn.execute('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOINHERIT')
        before = await native_catalogue_digest(conn)
        await conn.execute('SET search_path=public,pg_catalog')
        assert await native_catalogue_digest(conn) != before
        await conn.execute('SET search_path=pg_catalog,public')
        assert await native_catalogue_digest(conn) == before
        cases.append('pgcrypto_search_path_false_drift_reproduced_without_DDL')
        registry = await registry_catalogue_digest(conn, new_roles=NATIVE_ROLES, installed=True)
        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute(sources['receipts'].decode())
            golden = await receipt_catalogue(conn)
        finally:
            await tx.rollback()
        assert not await conn.fetchval("SELECT to_regnamespace('elp210_human_candidate') IS NOT NULL")
        now = datetime.now(timezone.utc)
        options = dict(receipt_sha256=golden, native_sha256=before, registry_sha256=registry,
            system_identifier=target['system'], window_start=now-timedelta(seconds=1),
            window_end=now+timedelta(minutes=2), test_only=True)

        async def deny(name, change, code):
            try:
                await ReceiptPreparation(sources['receipts'], **dict(options, **change)).prepare(conn)
            except ValueError as exc:
                assert str(exc) == code, (name, str(exc))
            else:
                raise AssertionError('TEST_ONLY unexpected prepare success: '+name)
            cases.append(name)

        await deny('wrong_physical_target_before_DDL', {'system_identifier':'1'}, 'IDENTITY_PREPARE_ACTUAL_TARGET_CHANGED')
        await deny('expired_window_before_DDL', {'window_start':now-timedelta(minutes=2),
            'window_end':now-timedelta(minutes=1)}, 'IDENTITY_PREPARE_OUTSIDE_WINDOW')
        await deny('native_drift_before_DDL', {'native_sha256':'0'*64}, 'IDENTITY_PREPARE_NATIVE_DRIFT')
        await deny('registry_drift_before_DDL', {'registry_sha256':'0'*64}, 'IDENTITY_PREPARE_REGISTRY_DRIFT')
        await deny('wrong_independent_receipt_pin_rolls_back_ALL_DDL', {'receipt_sha256':'0'*64}, 'IDENTITY_PREPARE_RECEIPT_DRIFT')
        assert not await conn.fetchval('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1)',ROLE)
        assert not await conn.fetchval("SELECT to_regnamespace('elp210_human_candidate') IS NOT NULL")
        await conn.execute('CREATE ROLE '+ROLE+' NOLOGIN')
        await deny('unregistered_partial_role_refused', {}, 'IDENTITY_PREPARE_PARTIAL_REQUIRES_REVIEW')
        await conn.execute('DROP ROLE '+ROLE)  # exact role in this disposable TEST_ONLY cell
        installer = ReceiptPreparation(sources['receipts'], **options)
        result = await installer.prepare(conn)
        assert result['created'] is True and result['role_can_login'] is False
        assert (await installer.prepare(conn))['created'] is False
        cases.extend(['real_atomic_preparation', 'idempotent_reapply'])
        # Existing old public ACLs may legitimately differ from a fresh golden.
        # FRESH-mode preparation must preserve them, NOT bless/admit them.
        await conn.execute('CREATE ROLE "TEST_ONLY_old_reader" NOLOGIN')
        await conn.execute('GRANT USAGE ON SCHEMA public TO "TEST_ONLY_old_reader"')
        preserved = await registry_catalogue_digest(conn,new_roles=NATIVE_ROLES,installed=True)
        assert preserved != registry
        await deny('reviewed_registry_pin_never_replaced_by_observation', {}, 'IDENTITY_PREPARE_REGISTRY_DRIFT')
        fresh = ReceiptPreparation(sources['receipts'], **dict(options,registry_sha256=None))
        preserved_result = await fresh.prepare(conn)
        assert preserved_result['registry_evidence'] == 'PRESERVATION_ONLY_NOT_AUTHORITY'
        assert preserved_result['registry_before_sha256'] == preserved_result['registry_after_sha256'] == preserved
        assert preserved_result['identity_writer_grants'] is False
        cases.append('fresh_manifest_old_ACL_preservation_is_not_authority')
        await conn.execute('REVOKE USAGE ON SCHEMA public FROM "TEST_ONLY_old_reader"')
        await conn.execute('DROP ROLE "TEST_ONLY_old_reader"')
        await conn.execute('ALTER ROLE '+ROLE+' LOGIN')
        await deny('existing_role_login_drift_refused', {}, 'IDENTITY_PREPARE_DORMANT_ROLE_CHANGED')
        await conn.execute('ALTER ROLE '+ROLE+' NOLOGIN')
        await conn.execute('ALTER TABLE '+TABLE+' DISABLE TRIGGER human_commit_expiry')
        await deny('disabled_receipt_trigger_refused', {}, 'IDENTITY_PREPARE_RECEIPT_DRIFT')
        await conn.execute('ALTER TABLE '+TABLE+' ENABLE TRIGGER human_commit_expiry')

        async def receipt(lease, expired=False):
            await conn.execute('INSERT INTO '+TABLE+' VALUES($1,$2,$3,$4,$5,$6,$7,$8,DEFAULT)',
                lease,lease+'-attempt','sha256:'+'a'*64,'COMMITTED',
                datetime.now(timezone.utc)+timedelta(seconds=-10 if expired else 60),
                lease+'-receipt','sha256:'+'b'*64,'{}')
        try:
            async with conn.transaction():
                await receipt('TEST_ONLY-expired', True)
        except asyncpg.InsufficientPrivilegeError:
            assert not await conn.fetchval('SELECT EXISTS(SELECT 1 FROM '+TABLE+' WHERE lease_id=$1)', 'TEST_ONLY-expired')
        else:
            raise AssertionError('TEST_ONLY deferred expiry allowed COMMIT')
        cases.append('real_deferred_expiry_prevents_COMMIT')
        await receipt('TEST_ONLY-valid')
        for operation in ('UPDATE '+TABLE+' SET receipt_id=receipt_id', 'DELETE FROM '+TABLE, 'TRUNCATE '+TABLE):
            try:
                await conn.execute(operation)
            except asyncpg.InsufficientPrivilegeError:
                pass
            else:
                raise AssertionError('TEST_ONLY immutable receipt changed')
            cases.append('immutable_'+operation.split()[0].lower())
        assert not await conn.fetchval("SELECT has_table_privilege($1,'public.ts_users','INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege($1,'public.ts_users','INSERT,UPDATE')",ROLE)
        assert await native_catalogue_digest(conn) == before
        assert await registry_catalogue_digest(conn,new_roles=NATIVE_ROLES,installed=True) == registry
        assert await conn.fetchval('SELECT count(*) FROM public.ts_users') == 0
        cases.append('no_writer_grants_or_identity_or_native_registry_change')
        print(json.dumps({'status':'TEST_ONLY_PG15_RECEIPT_PREPARATION_PASS','cases':cases,
            'case_count':len(cases),'receipt_sha256':golden,'postgres_version_num':target['version'],
            'registry_catalogue_sha256':registry,
            'sql_sha256':SQL_SHA256,'production_mutations':0,'real_human_or_connected_acceptance':False}))
    finally:
        await conn.close(timeout=2)


if __name__ == '__main__':
    asyncio.run(asyncio.wait_for(run(),45))
