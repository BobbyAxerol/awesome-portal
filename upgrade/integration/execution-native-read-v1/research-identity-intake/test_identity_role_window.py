"""TEST_ONLY PG15/SCRAM/official SDK proof, NOT genuine Core/human acceptance.

Uses real official identity/receipt SQL, Ed25519 and SDK recovery. The clearly
labelled Core fixture authenticates test keys ONLY and cannot certify production.
No operational input, secret, session, listener, port or DB mount is consumed.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import secrets

import asyncpg
import jwt

import test_receipt_installation as baseline
from test_identity_intake import IdentityIntakeTests
from identity_role_window import IdentityRoleWindow, identity_pool
from receipt_installation import ReceiptPreparation, ROLE, TABLE, NATIVE_ROLES, dormant_role, receipt_catalogue
from services.portfolio_management.native_fence import native_catalogue_digest
from services.portfolio_management.native_registry_catalogue import registry_catalogue_digest
from services.portfolio_management.portal_human_candidate import PortalHumanCandidate

OWNER_DSN = 'postgresql://bobby@pm-native-golden-db/pm_native_golden_test'


class TEST_ONLY_Core:
    """Not a production authority provider; authenticates only disposable keys."""
    def __init__(self, fixture):
        self.fixture, self.ack_available, self.enter_allowed = fixture, True, True
        self.enters, self.terminals = 0, 0

    def proof(self, token):
        c = jwt.decode(token,self.fixture.source_key.public_key(),algorithms=['EdDSA'],
            issuer='TEST_ONLY-source',audience='TEST_ONLY-core')
        assert c['sub'] == c['workload_id'] == 'TEST_ONLY-workload'
        assert c['purpose'] == 'pma.current-human-lease.v1'
        return c

    async def enter(self, human, token):
        p = self.fixture.candidate.verifier.verify(human)
        proof = self.proof(token)
        assert proof['lease_id'] == p.token_id and proof['phase'] == 'ENTER'
        self.enters += 1
        if not self.enter_allowed:
            raise ValueError('TEST_ONLY_CORE_REVOKED')

    async def resolve(self, token):
        proof = self.proof(token)
        self.terminals += 1
        if not self.ack_available:
            raise OSError('TEST_ONLY_ACK_LOST')
        return {'replayed':False,'phase':proof['phase']}


async def run():
    await baseline.run()  # Reuse all 18 real SQL/bootstrap/negative cases.
    conn = await asyncpg.connect(OWNER_DSN,timeout=2,command_timeout=5)
    pools, cases = [], []
    try:
        await conn.execute('SET search_path=pg_catalog,public')
        system = await conn.fetchval('SELECT (pg_control_system()).system_identifier::text')
        now = datetime.now(timezone.utc)
        options = dict(receipt_sha256=await receipt_catalogue(conn,semantic_acl=True),
            native_sha256=await native_catalogue_digest(conn),
            registry_sha256=await registry_catalogue_digest(conn,new_roles=NATIVE_ROLES,installed=True),
            system_identifier=system,window_start=now-timedelta(seconds=1),
            window_end=now+timedelta(minutes=2),test_only=True,semantic_acl=True)
        sql = Path('/candidate.sql').read_bytes()
        recipe = ReceiptPreparation(sql,**options)
        await recipe.prepare(conn)
        semantic_pin = options['receipt_sha256']
        bad_pool = await identity_pool(OWNER_DSN,recipe)
        pools.append(bad_pool)
        try:
            async with bad_pool.acquire():
                raise AssertionError('TEST_ONLY owner credential accepted as source identity')
        except ValueError as exc:
            assert str(exc) == 'IDENTITY_WINDOW_POOL_TARGET_CHANGED'
        cases.append('owner_DSN_never_used_as_serving_pool')
        await bad_pool.close()

        async def window(**changes):
            prep = ReceiptPreparation(sql,**dict(options,**changes))
            fixture = IdentityIntakeTests()
            fixture.setUp()
            core = TEST_ONLY_Core(fixture)
            password = secrets.token_urlsafe(48)  # disposable memory only
            pool = await identity_pool('postgresql://'+ROLE+':'+password+
                '@pm-native-golden-db/pm_native_golden_test',prep)
            pools.append(pool)
            candidate = PortalHumanCandidate(pool,fixture.candidate.verifier,core,fixture.candidate.config)
            result = IdentityRoleWindow(prep,candidate,fixture.selection,fixture.token(),fixture.raw)
            return result,password,core

        async def denied(name, operation, error=ValueError, code=None):
            try:
                await operation()
            except error as exc:
                if code is not None:
                    assert str(exc) == code,(name,type(exc).__name__)
            else:
                raise AssertionError('TEST_ONLY unexpected success: '+name)
            cases.append(name)

        for name,change,code in (
            ('wrong_physical_target',{'system_identifier':'1'},'IDENTITY_WINDOW_ACTUAL_TARGET_CHANGED'),
            ('expired_operator_window',{'window_start':now-timedelta(minutes=2),
                'window_end':now-timedelta(minutes=1)},'IDENTITY_WINDOW_OUTSIDE_WINDOW'),
            ('wrong_native_pin',{'native_sha256':'0'*64},'IDENTITY_WINDOW_NATIVE_DRIFT'),
            ('wrong_registry_pin',{'registry_sha256':'0'*64},'IDENTITY_WINDOW_REGISTRY_DRIFT'),
            ('wrong_independent_receipt_pin',{'receipt_sha256':'0'*64},'IDENTITY_WINDOW_RECEIPT_DRIFT')):
            w,password,_ = await window(**change)
            await denied(name,lambda:w.open(conn,password),code=code)
            await dormant_role(conn)
            await w.pool.close()

        w,password,core = await window()
        await denied('invalid_password_before_any_grant',lambda:w.open(conn,'short'),
                     code='NEW_NATIVE_PASSWORD_FORMAT_CHANGED')
        await conn.execute('ALTER ROLE '+ROLE+" PASSWORD 'TEST_ONLY_unexpected_old_credential'")
        await denied('existing_credential_never_rotated',lambda:w.open(conn,password),
                     code='IDENTITY_WINDOW_EXISTING_CREDENTIAL_REFUSED')
        await conn.execute('ALTER ROLE '+ROLE+' PASSWORD NULL')
        await w.pool.close()
        w,password,core = await window()
        assert (await w.open(conn,password))['state'] == 'OPEN'
        await denied('no_retire_before_actual_SDK_terminal',lambda:w.retire(conn),
                     code='IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        await denied('open_window_never_reused',lambda:w.open(conn,password),code='IDENTITY_WINDOW_REUSE_DENIED')
        cases.append('atomic_exact_role_activation')
        await denied('real_SCRAM_wrong_password',lambda:asyncpg.connect(
            host='pm-native-golden-db',database='pm_native_golden_test',user=ROLE,
            password='TEST_ONLY_wrong',timeout=2),asyncpg.InvalidPasswordError)

        async with w.pool.acquire() as scoped:
            assert await scoped.fetchval('SELECT current_user') == ROLE
            assert await scoped.fetchval('SHOW search_path') == 'pg_catalog, public'
            assert await scoped.fetchval('SHOW statement_timeout') == '3s'
            assert await scoped.fetchval('SHOW lock_timeout') == '500ms'
            assert await scoped.fetchval('SHOW idle_in_transaction_session_timeout') == '10s'
            assert await scoped.fetchval('SHOW default_transaction_read_only') == 'off'
            cases.append('real_SCRAM_and_all_bounded_role_defaults')
            for name,statement in (
                ('status_insert_denied',"INSERT INTO public.ts_users(issuer,subject,display_name,status) VALUES('TEST_ONLY','bad',NULL,'ACTIVE')"),
                ('status_update_denied',"UPDATE public.ts_users SET status='ACTIVE'"),
                ('display_update_denied',"UPDATE public.ts_users SET display_name='bad'"),
                ('version_update_denied','UPDATE public.ts_users SET version=2'),
                ('delete_user_denied','DELETE FROM public.ts_users'),
                ('truncate_user_denied','TRUNCATE public.ts_users'),
                ('business_policy_denied','SELECT * FROM pm_membership.policy'),
                ('native_authority_denied','SELECT * FROM pm_core_authority.leases'),
                ('public_DDL_denied','CREATE TABLE public.TEST_ONLY_escape(x int)'),
                ('role_creation_denied','CREATE ROLE TEST_ONLY_escape'),
                ('receipt_delete_denied','DELETE FROM '+TABLE),
                ('receipt_update_denied','UPDATE '+TABLE+' SET receipt_id=receipt_id')):
                await denied(name,lambda statement=statement:scoped.execute(statement),asyncpg.InsufficientPrivilegeError)

        # Genuine SDK SQL commits; ONLY the Core endpoint is TEST_ONLY. A lost
        # terminal ACK must NOT return mapping or retire role/pool/credentials.
        core.ack_available = False
        await denied('COMMIT_with_lost_Core_ACK_no_mapping',w.run,code='HUMAN_IDENTITY_COMMIT_OUTCOME_UNCERTAIN')
        assert w.prepared.finished and w.prepared.resolution.phase == 'COMMITTED'
        assert not w.prepared.resolution.portal_acknowledged
        await denied('unacknowledged_COMMIT_retirement_denied',lambda:w.retire(conn),
                     code='IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        assert not w.pool.is_closing()
        assert await conn.fetchval('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',ROLE)
        user_id = await conn.fetchval('SELECT user_id FROM public.ts_users WHERE issuer=$1 AND subject=$2',
                                     w.selection.issuer,w.selection.subject)
        assert user_id is not None
        async with w.pool.acquire() as scoped:
            await denied('immutable_user_id_guard_preserved',lambda:scoped.execute(
                'UPDATE public.ts_users SET user_id=gen_random_uuid() WHERE user_id=$1',user_id),
                asyncpg.ObjectNotInPrerequisiteStateError)
        core.ack_available = True
        assert (await w.recover()).portal_acknowledged
        cases.append('official_fenced_recovery_after_lost_ACK')
        async with w.pool.acquire():
            await denied('borrowed_pool_not_force_closed',lambda:w.retire(conn),
                         code='IDENTITY_WINDOW_POOL_STILL_BORROWED')
            assert not w.pool.is_closing()
        assert (await w.retire(conn))['state'] == 'RETIRED'
        await dormant_role(conn)
        assert await conn.fetchval('SELECT rolpassword IS NULL FROM pg_authid WHERE rolname=$1',ROLE)
        await denied('retired_credential_cannot_connect',lambda:asyncpg.connect(
            host='pm-native-golden-db',database='pm_native_golden_test',user=ROLE,
            password=password,timeout=2),asyncpg.InvalidAuthorizationSpecificationError)
        assert await receipt_catalogue(conn,semantic_acl=True) == semantic_pin
        assert await conn.fetchval('SELECT count(*) FROM public.ts_users WHERE user_id=$1',user_id) == 1
        cases.append('known_terminal_drained_exact_retirement_preserves_history')

        # Re-open on the SAME reviewed semantic pin after materialized ACLs;
        # stable mapping is reused, not copied/renamed/reactivated.
        w,password,core = await window()
        await w.open(conn,password)
        result = await w.run()
        assert result['ts_user_id'] == str(user_id) and result['mapping_version'] == '1'
        await w.retire(conn)
        cases.append('repeat_window_same_mapping_and_independent_semantic_pin')

        w,password,core = await window()
        await w.open(conn,password)
        core.enter_allowed = False
        await denied('Core_revoke_before_source_borrow',w.run,code='HUMAN_AUTHORITY_UNAVAILABLE')
        assert w.prepared.resolution.phase == 'ROLLED_BACK' and not w.prepared.borrowed
        await w.retire(conn)
        cases.append('rejected_ENTER_terminal_tombstone_and_safe_retirement')

        w,password,core = await window()
        await w.open(conn,password)
        # Actual foreign transaction owns the SAME source fence. Source timeout
        # cannot distinguish commit/rollback, even when Core ACKs UNKNOWN.
        async with conn.transaction():
            await conn.fetchval('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
                               'pma.elp210.human-source.v1:'+w.prepared.attempt.lease_id)
            await denied('real_busy_fence_outcome_UNKNOWN',w.run,code='HUMAN_AUTHORITY_UNAVAILABLE')
            assert w.prepared.finished and w.prepared.resolution.phase == 'UNKNOWN'
            await denied('UNKNOWN_never_retires_even_with_ACK',lambda:w.retire(conn),
                         code='IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
            assert not w.pool.is_closing()
            assert await conn.fetchval('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',ROLE)
        assert (await w.recover()).phase == 'ROLLED_BACK'
        assert w.prepared.resolution.portal_acknowledged
        # Teardown has no wall-clock expiry shortcut or window-expiry veto.
        w.preparation.end = datetime.now(timezone.utc)-timedelta(seconds=1)
        await w.retire(conn)
        cases.append('released_fence_real_recovery_and_expired_window_retirement')

        await conn.execute("UPDATE public.ts_users SET status='SUSPENDED',version=version+1 WHERE user_id=$1",user_id)
        w,password,core = await window()
        await w.open(conn,password)
        await denied('existing_inactive_mapping_never_reactivated',w.run,code='TS_USER_NOT_ACTIVE')
        assert w.prepared.resolution.phase == 'ROLLED_BACK' and w.prepared.resolution.portal_acknowledged
        await w.retire(conn)
        assert await conn.fetchval('SELECT status FROM public.ts_users WHERE user_id=$1',user_id) == 'SUSPENDED'
        cases.append('inactive_mapping_rollback_receipt_and_exact_retirement')
        assert await conn.fetchval('SELECT count(*) FROM public.ts_users') == 1
        assert await registry_catalogue_digest(conn,new_roles=NATIVE_ROLES,installed=True) == options['registry_sha256']
        print(json.dumps({'status':'TEST_ONLY_PG15_IDENTITY_ROLE_WINDOW_PASS','case_count':len(cases),
            'cases':cases,'receipt_semantic_acl_sha256':semantic_pin,
            'baseline_receipt_cases':18,'production_mutations':0,
            'real_human_or_connected_acceptance':False,'all_identity_roles_retired':True}))
    finally:
        # Disposable cell only. Real UNKNOWN must retain its pool/credential;
        # this TEST_ONLY PG/network are destroyed by the owning harness.
        for pool in pools:
            await asyncio.wait_for(pool.close(),3)
        await conn.close(timeout=2)


if __name__ == '__main__':
    asyncio.run(asyncio.wait_for(run(),75))
