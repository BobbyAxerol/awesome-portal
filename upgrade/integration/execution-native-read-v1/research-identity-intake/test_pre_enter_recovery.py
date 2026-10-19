"""TEST_ONLY real PG15/verifier/SDK/SCRAM, explicitly MODELED Core ACKs.

Reviewed from Core's 19Oct draft; adds cancellation/interrupted-recovery and
negative terminal correlation coverage. Never genuine Core/human acceptance.
Run ONLY in the disposable PG15 harness; no production DSN/config/secret.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import secrets
from unittest.mock import patch

import asyncpg

import test_receipt_installation as baseline
from test_identity_intake import IdentityIntakeTests
from test_identity_role_window import TEST_ONLY_Core
from identity_role_window import IdentityRoleWindow, identity_pool
from receipt_installation import ReceiptPreparation, ROLE, TABLE, NATIVE_ROLES, dormant_role, receipt_catalogue
from services.portfolio_management.native_fence import native_catalogue_digest
from services.portfolio_management.native_registry_catalogue import registry_catalogue_digest
from services.portfolio_management.portal_human_candidate import PortalHumanCandidate, SourceResolution, _receipt

OWNER_DSN = 'postgresql://bobby@pm-native-golden-db/pm_native_golden_test'


class FutureJwtClock(datetime):
    """Deterministic real PyJWT expiry, scoped ONLY to RUN revalidation."""
    @classmethod
    def now(cls, tz=None):
        return datetime.now(tz) + timedelta(minutes=2)


class TEST_ONLY_UnenteredCore(TEST_ONLY_Core):
    """Old ISSUED refusal, then explicit candidate rollback-only protocol model."""
    def __init__(self, fixture):
        super().__init__(fixture)
        self.abort_seam = False
        self.phase = 'ISSUED'
        self.saved_terminal = None
        self.drop_reply_once = self.cancel_reply_once = False

    async def resolve(self, token):
        proof = self.proof(token)  # Real disposable Ed25519 authentication.
        self.terminals += 1
        if not self.ack_available:
            raise OSError('TEST_ONLY_CORE_UNAVAILABLE')
        if not self.abort_seam or proof['phase'] != 'ROLLED_BACK':
            raise ValueError('CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE')
        terminal = tuple(proof[k] for k in ('lease_id', 'attempt_id', 'workspace_id',
            'environment', 'workload_id', 'request_digest', 'source_receipt_id',
            'source_receipt_digest'))
        replayed = self.saved_terminal is not None
        if replayed and self.saved_terminal != terminal:
            raise ValueError('CURRENT_HUMAN_TERMINAL_CONFLICT')
        self.saved_terminal, self.phase = terminal, 'RETIRED'
        if self.cancel_reply_once:
            self.cancel_reply_once = False
            raise asyncio.CancelledError('TEST_ONLY_RECOVERY_CANCELLED')
        if self.drop_reply_once:
            self.drop_reply_once = False
            raise OSError('TEST_ONLY_REPLY_LOST_AFTER_RECORDED_ABORT')
        return {'replayed': replayed, 'phase': 'ROLLED_BACK'}


async def run():
    await baseline.run()  # Existing18, reused NOT additional distinct coverage.
    conn = await asyncpg.connect(OWNER_DSN, timeout=2, command_timeout=5)
    pools, cases = [], []
    try:
        await conn.execute('SET search_path=pg_catalog,public')
        now = datetime.now(timezone.utc)
        options = dict(receipt_sha256=await receipt_catalogue(conn, semantic_acl=True),
            native_sha256=await native_catalogue_digest(conn),
            registry_sha256=await registry_catalogue_digest(conn, new_roles=NATIVE_ROLES, installed=True),
            system_identifier=await conn.fetchval('SELECT (pg_control_system()).system_identifier::text'),
            window_start=now-timedelta(seconds=1), window_end=now+timedelta(minutes=2),
            test_only=True, semantic_acl=True)
        sql = Path('/candidate.sql').read_bytes()

        async def window():
            preparation = ReceiptPreparation(sql, **options)
            fixture = IdentityIntakeTests()
            fixture.setUp()
            core = TEST_ONLY_UnenteredCore(fixture)
            password = secrets.token_urlsafe(48)  # Disposable operator memory only.
            pool = await identity_pool('postgresql://'+ROLE+':'+password+
                '@pm-native-golden-db/pm_native_golden_test', preparation)
            pools.append(pool)
            candidate = PortalHumanCandidate(pool, fixture.candidate.verifier, core, fixture.candidate.config)
            result = IdentityRoleWindow(preparation, candidate, fixture.selection, fixture.token(), fixture.raw)
            await result.open(conn, password)
            return result, core

        async def denied(operation, code, error=ValueError):
            try:
                await operation()
            except error as exc:
                if code is not None:
                    assert str(exc) == code, (type(exc).__name__, str(exc))
            else:
                raise AssertionError('TEST_ONLY unexpected success: '+str(code))

        async def expire(w):
            attempt = w.prepared.attempt
            with patch('jwt.api_jwt.datetime', FutureJwtClock):
                await denied(w.run, 'HUMAN_TOKEN_REJECTED')
            assert w.state == 'RECOVERY_REQUIRED' and w.prepared.finished is False
            assert w._never_entered() and w.prepared.attempt is attempt
            assert not await conn.fetchval('SELECT EXISTS(SELECT 1 FROM '+TABLE+' WHERE lease_id=$1)', attempt.lease_id)
            await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
            return attempt

        async def retire(w):
            assert w.prepared.finished is False and w._never_entered()
            assert (await w.retire(conn))['state'] == 'RETIRED'
            await dormant_role(conn)
            assert await conn.fetchval('SELECT rolpassword IS NULL FROM pg_authid WHERE rolname=$1', ROLE)

        users_before = await conn.fetchval('SELECT count(*) FROM public.ts_users')
        w, core = await window()
        await denied(w.recover, 'IDENTITY_WINDOW_RECOVERY_NOT_READY')
        cases.append('OPEN_without_failed_RUN_does_not_allow_recovery')
        attempt = await expire(w)
        assert core.enters == 0
        cases.append('real_verifier_expiry_after_OPEN_no_ENTER_no_fake_finished')
        result = await w.recover()
        assert result.phase == 'ROLLED_BACK' and not result.portal_acknowledged
        physical = _receipt(await conn.fetchrow('SELECT * FROM '+TABLE+' WHERE lease_id=$1', attempt.lease_id), attempt)
        assert physical.phase == 'ROLLED_BACK' and not w.pool.is_closing()
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        cases.append('physical_ROLLED_BACK_without_compatible_Core_ACK_keeps_custody')
        core.abort_seam = True  # Explicit model, NOT an actual deployment.
        result = await w.recover()
        assert result.phase == 'ROLLED_BACK' and result.portal_acknowledged
        assert (result.source_receipt_id, result.source_receipt_digest) == (physical.source_receipt_id, physical.source_receipt_digest)
        assert w.prepared.attempt is attempt and core.enters == 0
        cases.append('same_original_attempt_and_physical_terminal_modeled_ACK')
        assert await w.recover() == result
        cases.append('repeated_recovery_reuses_exact_immutable_receipt')
        await retire(w)
        cases.append('terminal_ACK_exact_role_retirement_without_fake_finished')

        w, core = await window()
        core.abort_seam = True
        attempt = await expire(w)
        async with conn.transaction():
            await conn.fetchval('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
                'pma.elp210.human-source.v1:'+attempt.lease_id)
            result = await w.recover()
            assert result.phase == 'UNKNOWN' and not result.portal_acknowledged
            await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
            assert not w.pool.is_closing() and w.prepared.finished is False
            assert await conn.fetchval('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1', ROLE)
        cases.append('real_held_source_fence_UNKNOWN_never_means_expiry_rollback')
        assert (await w.recover()).portal_acknowledged
        assert w.prepared.attempt is attempt and core.enters == 0
        await retire(w)
        cases.append('released_fence_fresh_same_attempt_recovery_and_retirement')

        w, core = await window()
        core.abort_seam, core.drop_reply_once = True, True
        attempt = await expire(w)
        result = await w.recover()
        assert result.phase == 'ROLLED_BACK' and not result.portal_acknowledged
        assert core.phase == 'RETIRED'
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        assert not w.pool.is_closing()
        cases.append('lost_modeled_Core_ACK_after_recording_cannot_retire')
        result = await w.recover()
        assert result.portal_acknowledged and w.prepared.attempt is attempt and core.enters == 0
        await retire(w)
        cases.append('lost_ACK_requires_exact_terminal_replay_before_retire')

        w, core = await window()
        core.abort_seam = True
        attempt = w.prepared.attempt
        with patch.object(w.prepared.owner.verifier, 'verify', side_effect=asyncio.CancelledError('TEST_ONLY_BEFORE_ENTER')):
            await denied(w.run, 'TEST_ONLY_BEFORE_ENTER', asyncio.CancelledError)
        assert w._never_entered() and w.prepared.finished is False and core.enters == 0
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        assert (await w.recover()).portal_acknowledged and w.prepared.attempt is attempt
        await retire(w)
        cases.append('pre_ENTER_cancellation_preserved_then_official_fenced_recovery')

        w, core = await window()
        core.abort_seam = True
        attempt = w.prepared.attempt

        async def cancelled_before_sdk(*_):
            # Actual task cancellation at a TEST_ONLY pre-SDK scheduling seam.
            # The subsequent fence/receipt/SCRAM recovery still uses real PG/SDK.
            task = asyncio.current_task()
            asyncio.get_running_loop().call_soon(task.cancel, 'TEST_ONLY_TASK_CANCEL')
            await asyncio.Future()

        with patch('identity_role_window.resolve_prepared_identity', cancelled_before_sdk):
            await denied(w.run, 'TEST_ONLY_TASK_CANCEL', asyncio.CancelledError)
        assert w._never_entered() and w.prepared.finished is False and core.enters == 0
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        assert (await w.recover()).portal_acknowledged and w.prepared.attempt is attempt
        await retire(w)
        cases.append('actual_task_cancellation_at_pre_SDK_test_seam_recovers_without_uncancel')

        w, core = await window()
        core.abort_seam = True
        await expire(w)
        assert (await w.recover()).portal_acknowledged
        core.cancel_reply_once = True
        # Python3.10 wait_for may discard the child cancellation's message.
        # Require cancellation type/propagation and invalidation, not its text.
        await denied(w.recover, None, asyncio.CancelledError)
        # SDK may still hold the old resolution. The helper must not reuse it.
        assert w.prepared.resolution.portal_acknowledged and w._pre_enter_resolution is None
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        assert not w.pool.is_closing()
        cases.append('interrupted_recovery_invalidates_prior_local_ACK')
        assert (await w.recover()).portal_acknowledged
        await retire(w)
        cases.append('recovery_after_cancellation_replays_same_source_receipt')

        w, core = await window()
        core.abort_seam = True
        await expire(w)
        # Negative-only SDK result double: neither an admission nor terminal proof.
        with patch.object(w.prepared.owner, 'recover', return_value=SourceResolution('COMMITTED', 'TEST_ONLY', 'sha256:'+'0'*64, True)):
            await w.recover()
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        cases.append('unexpected_pre_ENTER_COMMITTED_even_with_ACK_never_retires')
        result = await w.recover()
        assert result.portal_acknowledged
        # ACK alone is insufficient: retire independently checks physical receipt.
        mismatched = SourceResolution('ROLLED_BACK', result.source_receipt_id, 'sha256:'+'0'*64, True)
        with patch.object(w.prepared.owner, 'recover', return_value=mismatched):
            await w.recover()
        await denied(lambda: w.retire(conn), 'IDENTITY_WINDOW_TERMINAL_MISMATCH')
        assert not w.pool.is_closing()
        cases.append('mismatched_physical_receipt_denies_before_pool_close')
        assert (await w.recover()).portal_acknowledged
        await retire(w)

        assert await conn.fetchval('SELECT count(*) FROM public.ts_users') == users_before
        assert await receipt_catalogue(conn, semantic_acl=True) == options['receipt_sha256']
        assert await registry_catalogue_digest(conn, new_roles=NATIVE_ROLES, installed=True) == options['registry_sha256']
        cases.append('zero_identity_business_DML_exact_ACLs_NULL_password_restored')
        print(json.dumps({'status': 'TEST_ONLY_SOURCE_PRE_ENTER_RECOVERY_PASS',
            'case_count': len(cases), 'cases': cases, 'reused_baseline_cases': 18,
            'source_pg_and_verifier': 'REAL_DISPOSABLE_PG15_AND_OFFICIAL_PM_SDK',
            'core': 'EXPLICIT_MODEL_NOT_ACTUAL_CORE',
            'real_human_or_connected_acceptance': False, 'production_mutations': 0}))
    finally:
        # Disposable cell only; operational UNKNOWN retains recovery custody.
        for pool in pools:
            await asyncio.wait_for(pool.close(), 3)
        await conn.close(timeout=2)


if __name__ == '__main__':
    asyncio.run(asyncio.wait_for(run(), 75))
