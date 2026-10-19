"""Operator-only, one-shot identity ACL window. No listener or import-time I/O.

Own the isolated min0/max1 pool and do not share its credential/candidate with
another request. Real Core trust, session and durable recovery must be composed
BEFORE activation. UNKNOWN keeps the role/pool usable for official recovery;
expiry, cancellation or an empty pg_stat_activity never proves settlement.
"""
import asyncio
from datetime import datetime, timezone
from hashlib import sha256
import json

import asyncpg

from identity_intake import (ResearchIdentitySelection, prepare_identity,
                             resolve_prepared_identity)
from receipt_installation import (ReceiptPreparation, ROLE, TABLE, NATIVE_ROLES,
                                  dormant_role, receipt_catalogue, require)
from role_credentials import password_bytes, verifier, matches
from services.portfolio_management.native_fence import native_catalogue_digest
from services.portfolio_management.native_registry_catalogue import registry_catalogue_digest
from services.portfolio_management.portal_human_candidate import (
    PortalHumanCandidate, SourceResolution, _Prepared, _receipt,
)


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class IdentityPoolGuard:
    """Check every freshly opened physical connection, including recovery."""
    def __init__(self, preparation):
        self.preparation = preparation

    async def __call__(self, conn):
        p = self.preparation
        row = await conn.fetchrow('''SELECT current_database() AS db,session_user::text AS login,
            current_user::text AS role,(pg_control_system()).system_identifier::text AS system''')
        require(row is not None and row['db'] ==
            ('pm_native_golden_test' if p.test_only else 'live_data_executor')
            and row['login'] == row['role'] == ROLE and row['system'] == p.system,
            'IDENTITY_WINDOW_POOL_TARGET_CHANGED')


async def identity_pool(private_dsn, preparation):
    """Private operator input only; no caller-supplied DSN/URL in any route."""
    require(type(preparation) is ReceiptPreparation, 'IDENTITY_WINDOW_DEPENDENCIES_REQUIRED')
    return await asyncpg.create_pool(private_dsn,min_size=0,max_size=1,
        timeout=2,command_timeout=3,init=IdentityPoolGuard(preparation))


async def role_snapshot(conn, names):
    """Bounded metadata only; NEVER serialize password/verifier values."""
    rows = await conn.fetch('''SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,
        rolreplication,rolbypassrls,rolinherit,rolcanlogin,rolconnlimit,rolconfig,
        rolvaliduntil::text FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname''', names)
    deps = await conn.fetch('''SELECT r.rolname,d.dbid,d.classid,d.objid,d.objsubid,d.deptype::text
        FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid
        WHERE d.refclassid='pg_authid'::regclass AND r.rolname=ANY($1::text[])
        ORDER BY r.rolname,d.dbid,d.classid,d.objid,d.objsubid,d.deptype''', names)
    require(len(rows) == len(names) and len(deps) <= 256, 'IDENTITY_WINDOW_ROLE_BOUND')
    return digest({'roles':[dict(r) for r in rows], 'dependencies':[dict(r) for r in deps]})


class IdentityRoleWindow:
    """Exactly one prepared official SDK request; never a reusable auth service.

    Constructor is pure. open/run/recover/retire stay in the creating task.
    Unknown DDL COMMIT acknowledgements require operator readback, not retries.
    Public callers cannot supply roles, SQL, permissions or alternate tables.
    """
    def __init__(self, preparation, candidate, selection, human_token, raw_request):
        require(type(preparation) is ReceiptPreparation and type(candidate) is PortalHumanCandidate
            and type(selection) is ResearchIdentitySelection, 'IDENTITY_WINDOW_DEPENDENCIES_REQUIRED')
        pool = candidate.pool
        require(type(pool) is asyncpg.pool.Pool and pool.get_min_size() == 0
                and pool.get_max_size() == 1 and pool.get_size() == 0 and not pool.is_closing(),
                'IDENTITY_WINDOW_OWNED_EMPTY_POOL_REQUIRED')
        require(type(pool._init) is IdentityPoolGuard and pool._init.preparation is preparation
            and preparation.semantic_acl, 'IDENTITY_WINDOW_CHECKED_POOL_AND_SEMANTIC_PIN_REQUIRED')
        prepared = prepare_identity(candidate, selection, human_token, raw_request)
        require(type(prepared) is _Prepared, 'IDENTITY_WINDOW_ACTUAL_PREPARED_REQUIRED')
        self.preparation, self.prepared, self.pool = preparation, prepared, pool
        self.selection, self.raw = selection, raw_request
        self.task, self.state = asyncio.current_task(), 'DORMANT'
        self._pre_enter_failure = False
        self._pre_enter_resolution = None

    def guard(self):
        require(asyncio.current_task() is self.task, 'IDENTITY_WINDOW_TASK_CHANGED')

    async def target(self, conn):
        require(not conn.is_in_transaction(), 'IDENTITY_WINDOW_OWNED_CONNECTION_REQUIRED')
        row = await conn.fetchrow('''SELECT current_database() AS db,session_user::text AS login,
            current_user::text AS role,(pg_control_system()).system_identifier::text AS system,
            current_setting('server_version_num')::int AS version''')
        p = self.preparation
        require(row is not None and row['db'] ==
            ('pm_native_golden_test' if p.test_only else 'live_data_executor')
            and row['login'] == row['role'] == 'bobby' and row['system'] == p.system
            and 150000 <= row['version'] < 160000, 'IDENTITY_WINDOW_ACTUAL_TARGET_CHANGED')

    async def checks(self, conn):
        await conn.execute("SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='3000ms'; "
                           "SET LOCAL search_path=pg_catalog,public")
        require(await conn.fetchval('SELECT pg_try_advisory_xact_lock(210,81446)'),
                'IDENTITY_WINDOW_INSTALL_BUSY')
        require(await native_catalogue_digest(conn) == self.preparation.native,
                'IDENTITY_WINDOW_NATIVE_DRIFT')

    async def registry(self, conn):
        return await registry_catalogue_digest(conn, new_roles=NATIVE_ROLES, installed=True)

    async def open(self, conn, password):
        self.guard()
        require(self.state == 'DORMANT' and not self.prepared.entered,
                'IDENTITY_WINDOW_REUSE_DENIED')
        password_bytes(password)
        p = self.preparation
        require(p.start <= datetime.now(timezone.utc) < p.end, 'IDENTITY_WINDOW_OUTSIDE_WINDOW')
        await self.target(conn)
        # A failed/ambiguous transaction exit must not be reported as rollback.
        self.state = 'OPEN_UNCONFIRMED'
        async with conn.transaction():
            await self.checks(conn)
            await dormant_role(conn)
            auth = await conn.fetchrow('SELECT rolpassword,rolvaliduntil FROM pg_authid WHERE rolname=$1', ROLE)
            require(auth['rolpassword'] is None and auth['rolvaliduntil'] is None,
                    'IDENTITY_WINDOW_EXISTING_CREDENTIAL_REFUSED')
            require(await receipt_catalogue(conn,semantic_acl=True) == p.receipt, 'IDENTITY_WINDOW_RECEIPT_DRIFT')
            self.registry_before = await self.registry(conn)
            require(p.registry is None or self.registry_before == p.registry,
                    'IDENTITY_WINDOW_REGISTRY_DRIFT')
            self.native_roles = await role_snapshot(conn, list(NATIVE_ROLES))
            for setting,value in (
                ('log_statement','none'),('log_duration','off'),('log_min_duration_statement','-1'),
                ('log_min_error_statement','panic'),('log_error_verbosity','terse'),
                ('log_parameter_max_length','0'),('log_parameter_max_length_on_error','0')):
                await conn.execute('SELECT pg_catalog.set_config($1,$2,true)', setting,value)
            await conn.execute("SELECT pg_catalog.set_config('portal_identity_window.verifier',$1,true)",
                               verifier(password))
            await conn.execute('''DO $identity$ BEGIN
                EXECUTE pg_catalog.format('ALTER ROLE ts_portal_research_identity PASSWORD %L',
                    pg_catalog.current_setting('portal_identity_window.verifier'));
                END $identity$''')
            await conn.execute('''
                GRANT USAGE ON SCHEMA public,elp210_human_candidate TO ts_portal_research_identity;
                GRANT SELECT ON public.ts_users TO ts_portal_research_identity;
                GRANT INSERT(issuer,subject,display_name),UPDATE(user_id) ON public.ts_users
                    TO ts_portal_research_identity;
                GRANT SELECT,INSERT ON elp210_human_candidate.source_receipts TO ts_portal_research_identity;
                GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ts_portal_research_identity;
                ALTER ROLE ts_portal_research_identity SET search_path=pg_catalog,public;
                ALTER ROLE ts_portal_research_identity SET statement_timeout='3000';
                ALTER ROLE ts_portal_research_identity SET lock_timeout='500';
                ALTER ROLE ts_portal_research_identity SET idle_in_transaction_session_timeout='10000';
                ALTER ROLE ts_portal_research_identity SET default_transaction_read_only='off';
                ALTER ROLE ts_portal_research_identity LOGIN;
            ''')
            require(matches(password, await conn.fetchval('SELECT rolpassword FROM pg_authid WHERE rolname=$1',ROLE)),
                    'IDENTITY_WINDOW_CREDENTIAL_UNCONFIRMED')
            require(await role_snapshot(conn,list(NATIVE_ROLES)) == self.native_roles,
                    'IDENTITY_WINDOW_NATIVE_ROLE_DRIFT')
            self.registry_open = await self.registry(conn)
            self.receipt_open = await receipt_catalogue(conn,semantic_acl=True)
            self.role_open = await role_snapshot(conn,[ROLE])
            require(p.start <= datetime.now(timezone.utc) < p.end, 'IDENTITY_WINDOW_OUTSIDE_WINDOW')
        self.state = 'OPEN'
        return {'state':self.state,'role':ROLE,'business_authority_granted':False,
                'native_roles_preserved':True,'secret_values_emitted':False}

    async def run(self):
        self.guard()
        require(self.state == 'OPEN' and not self.prepared.entered,
                'IDENTITY_WINDOW_REUSE_DENIED')
        self.state = 'RECOVERY_REQUIRED'
        try:
            return await resolve_prepared_identity(self.prepared,self.selection,self.raw)
        except BaseException:
            # Validation/cancellation may precede SDK ENTER. This records only
            # where RUN failed, NEVER a source outcome or permission to retire.
            if self.prepared.finished is False and self._never_entered():
                self._pre_enter_failure = True
            raise

    def _never_entered(self):
        return all(getattr(self.prepared, name) is False
                   for name in ('entered', 'admitted', 'borrowed', 'outer_started'))

    async def recover(self):
        """Official fenced readback and real Core ACK, never a new identity attempt."""
        self.guard()
        r = self.prepared
        pre_enter = (self._pre_enter_failure and r.finished is False and self._never_entered())
        require(self.state == 'RECOVERY_REQUIRED' and (r.finished or pre_enter),
                'IDENTITY_WINDOW_RECOVERY_NOT_READY')
        if pre_enter:
            # A cancelled/repeated recovery must not reuse an older local ACK.
            self._pre_enter_resolution = None
        r.resolution = await r.owner.recover(r.attempt)
        if (pre_enter and type(r.resolution) is SourceResolution
                and r.resolution.phase == 'ROLLED_BACK'
                and r.resolution.portal_acknowledged is True):
            self._pre_enter_resolution = r.resolution
        return r.resolution

    async def retire(self, conn):
        """No wall-clock gate on recovery: revoke only after terminal ACK+drain."""
        self.guard()
        r = self.prepared
        terminal = r.resolution
        pre_enter_settled = (self._pre_enter_failure and r.finished is False
            and self._never_entered() and self._pre_enter_resolution is terminal
            and type(terminal) is SourceResolution and terminal.phase == 'ROLLED_BACK'
            and terminal.portal_acknowledged is True)
        require(self.state == 'RECOVERY_REQUIRED' and (r.finished or pre_enter_settled)
            and type(terminal) is SourceResolution and terminal.phase in ('COMMITTED','ROLLED_BACK')
            and terminal.portal_acknowledged is True, 'IDENTITY_WINDOW_TERMINAL_UNCONFIRMED')
        await self.target(conn)
        # Read immutable physical receipt BEFORE closing the only recovery pool.
        row = await conn.fetchrow('SELECT * FROM '+TABLE+' WHERE lease_id=$1',r.attempt.lease_id)
        require(row is not None, 'IDENTITY_WINDOW_RECEIPT_MISSING')
        physical = _receipt(row,r.attempt)
        require((physical.phase,physical.source_receipt_id,physical.source_receipt_digest) ==
            (terminal.phase,terminal.source_receipt_id,terminal.source_receipt_digest),
            'IDENTITY_WINDOW_TERMINAL_MISMATCH')
        require(self.pool.get_idle_size() == self.pool.get_size(),
                'IDENTITY_WINDOW_POOL_STILL_BORROWED')
        await asyncio.wait_for(self.pool.close(),5)
        require(self.pool.is_closing() and self.pool.get_size() == 0,
                'IDENTITY_WINDOW_POOL_NOT_CLOSED')
        self.state = 'RETIRE_UNCONFIRMED'
        async with conn.transaction():
            await self.checks(conn)
            require(not await conn.fetchval('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1)',ROLE),
                    'IDENTITY_WINDOW_ROLE_SESSIONS_REMAIN')
            require(await self.registry(conn) == self.registry_open
                and await receipt_catalogue(conn,semantic_acl=True) == self.receipt_open
                and await role_snapshot(conn,[ROLE]) == self.role_open
                and await role_snapshot(conn,list(NATIVE_ROLES)) == self.native_roles,
                'IDENTITY_WINDOW_OPEN_CATALOGUE_DRIFT')
            await conn.execute('''
                ALTER ROLE ts_portal_research_identity NOLOGIN PASSWORD NULL;
                ALTER ROLE ts_portal_research_identity RESET ALL;
                REVOKE USAGE ON SCHEMA public,elp210_human_candidate FROM ts_portal_research_identity;
                REVOKE SELECT ON public.ts_users FROM ts_portal_research_identity;
                REVOKE INSERT(issuer,subject,display_name),UPDATE(user_id) ON public.ts_users
                    FROM ts_portal_research_identity;
                REVOKE SELECT,INSERT ON elp210_human_candidate.source_receipts FROM ts_portal_research_identity;
                REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ts_portal_research_identity;
            ''')
            await dormant_role(conn)
            require(await self.registry(conn) == self.registry_before
                and await receipt_catalogue(conn,semantic_acl=True) == self.preparation.receipt
                and await role_snapshot(conn,list(NATIVE_ROLES)) == self.native_roles,
                'IDENTITY_WINDOW_RESTORATION_DRIFT')
        self.state = 'RETIRED'
        return {'state':self.state,'role_can_login':False,'identity_writer_grants':False,
                'receipt_and_mapping_history_preserved':True,'secret_values_emitted':False}
