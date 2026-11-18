"""Exact approved receipt/identity-role PREPARATION, not a serving authenticator.

One new schema + one dormant NOLOGIN role; no old native role, ACL, identity,
policy, privilege, password or provider is modified. Activation requires the
genuine Core reverse composition and a separately verified bounded ACL window.
No import-time I/O, SQL user seed, automatic migration or observed-target pin.
"""
from datetime import datetime, timezone
from hashlib import sha256
import json
import re

from services.portfolio_management.native_fence import _relation_catalogue, native_catalogue_digest
from services.portfolio_management.native_registry_catalogue import registry_catalogue_digest

ROLE = 'ts_portal_research_identity'
SCHEMA = 'elp210_human_candidate'
TABLE = SCHEMA + '.source_receipts'
SQL_SHA256 = '305ba23619578935696bbcb6ce434b031746280101034f98accee9271d7ae370'
LIVE_SYSTEM = '7674585245102796834'
FORBIDDEN_TEST_SYSTEMS = {LIVE_SYSTEM, '7675333655652302882', '7688673963308855330'}
NATIVE_ROLES = ('ts_portal_native_read_source', 'ts_portal_native_read_control',
                'ts_portal_native_read_maintenance')


def require(ok, code):
    if not ok:
        raise ValueError(code)


def pin(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None,
            'IDENTITY_PREPARE_REFERENCE_PIN_REQUIRED')
    return value


async def receipt_catalogue(conn, *, semantic_acl=False):
    """Same PM metadata encoder, extended only for this exact new schema ACL.

    The expected digest must be generated on independent disposable PG15,
    reviewed/published BEFORE any call against the operational source.
    """
    value = await _relation_catalogue(conn, (TABLE,))
    value['schema'] = [dict(r) for r in await conn.fetch('''
        SELECT pg_get_userbyid(nspowner) AS owner,nspacl::text AS acl
        FROM pg_namespace WHERE nspname=$1''', SCHEMA)]
    value['classes'] = [dict(r) for r in await conn.fetch('''
        SELECT c.relname,c.relkind::text AS kind,pg_get_userbyid(c.relowner) AS owner,
          c.relacl::text AS acl
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1 ORDER BY c.relname''', SCHEMA)]
    value['functions'] = [dict(r) for r in await conn.fetch('''
        SELECT p.proname,pg_get_functiondef(p.oid) AS definition,
          pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=$1 ORDER BY p.proname,p.oid::regprocedure::text''', SCHEMA)]
    value['indexes'] = [dict(r) for r in await conn.fetch('''
        SELECT c.relname,pg_get_indexdef(i.indexrelid) AS definition
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        WHERE i.indrelid=to_regclass($1) ORDER BY c.relname''', TABLE)]
    if semantic_acl:
        # GRANT/REVOKE may materialize an implicit owner ACL. Compare effective
        # entries, not NULL versus owner-only text; NEVER alter pg_catalog.
        for group,kind,catalogue,owner,acl,selector in (
            ('schema','n','pg_namespace','nspowner','nspacl','nspname=$1'),
            ('classes','r','pg_class','relowner','relacl',"relnamespace=to_regnamespace($1) AND relname=$2"),
            ('functions','f','pg_proc','proowner','proacl',"pronamespace=to_regnamespace($1) AND proname=$2")):
            for row in value[group]:
                args = (SCHEMA,) if group == 'schema' else (SCHEMA,row.get('relname',row.get('proname')))
                row['acl'] = [dict(r) for r in await conn.fetch('''SELECT
                    CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
                    pg_get_userbyid(x.grantor) AS grantor,x.privilege_type,x.is_grantable
                    FROM '''+catalogue+''' CROSS JOIN LATERAL aclexplode(COALESCE('''+acl+
                    ",acldefault('"+kind+"',"+owner+'''))) x WHERE '''+selector+'''
                    ORDER BY grantee,grantor,privilege_type,is_grantable''', *args)]
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    require(len(raw) <= 65536, 'IDENTITY_PREPARE_CATALOGUE_BOUND')
    return sha256(raw).hexdigest()


async def dormant_role(conn):
    row = await conn.fetchrow('''SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,
        rolreplication,rolbypassrls,rolinherit,rolconnlimit,rolconfig
        FROM pg_roles WHERE rolname=$1''', ROLE)
    require(row is not None and not any(row[k] for k in ('rolcanlogin', 'rolsuper',
        'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls', 'rolinherit'))
        and row['rolconnlimit'] == 1 and row['rolconfig'] is None,
        'IDENTITY_PREPARE_DORMANT_ROLE_CHANGED')
    require(not await conn.fetchval('''SELECT EXISTS(
        SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=$1)
        OR member=(SELECT oid FROM pg_roles WHERE rolname=$1))''', ROLE),
        'IDENTITY_PREPARE_ROLE_MEMBERSHIP_CHANGED')
    # A prepared role has NO direct grants/owned objects, not merely NOLOGIN.
    require(not await conn.fetchval('''SELECT EXISTS(SELECT 1 FROM pg_shdepend
        WHERE refclassid='pg_authid'::regclass
        AND refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1))''', ROLE),
        'IDENTITY_PREPARE_ROLE_DEPENDENCIES_CHANGED')


class ReceiptPreparation:
    def __init__(self, sql, *, receipt_sha256, native_sha256, registry_sha256,
                 system_identifier, window_start, window_end, test_only=False,
                 semantic_acl=False):
        require(type(sql) is bytes and sha256(sql).hexdigest() == SQL_SHA256,
                'IDENTITY_PREPARE_SQL_DRIFT')
        self.sql = sql.decode('utf-8')
        self.receipt, self.native = map(pin, (receipt_sha256, native_sha256))
        # Existing-registry manifests retain their independent approved pin.
        # Original FRESH-native manifests have no such authority assertion:
        # None means ONLY compare transactional before/after ACL preservation.
        # It never admits writer access, a user or a business acceptance.
        self.registry = pin(registry_sha256) if registry_sha256 is not None else None
        require(type(test_only) is bool and type(system_identifier) is str
                and system_identifier.isascii() and system_identifier.isdecimal()
                and ((test_only and system_identifier not in FORBIDDEN_TEST_SYSTEMS)
                     or (not test_only and system_identifier == LIVE_SYSTEM)),
                'IDENTITY_PREPARE_PHYSICAL_TARGET_REQUIRED')
        require(all(type(x) is datetime and x.tzinfo is not None
                    for x in (window_start, window_end))
                and 0 < (window_end-window_start).total_seconds() <= 1800,
                'IDENTITY_PREPARE_WINDOW_REQUIRED')
        self.system, self.test_only = system_identifier, test_only
        require(type(semantic_acl) is bool, 'IDENTITY_PREPARE_ACL_MODE_INVALID')
        self.semantic_acl = semantic_acl
        self.start, self.end = window_start, window_end

    async def prepare(self, conn):
        require(not conn.is_in_transaction(), 'IDENTITY_PREPARE_OWNED_CONNECTION_REQUIRED')
        require(self.start <= datetime.now(timezone.utc) < self.end,
                'IDENTITY_PREPARE_OUTSIDE_WINDOW')
        async with conn.transaction():
            await conn.execute("SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='3000ms'; "
                               "SET LOCAL search_path=pg_catalog,public")
            row = await conn.fetchrow('''SELECT current_database() AS database,
                session_user::text AS login,current_user::text AS role,
                (pg_control_system()).system_identifier::text AS system,
                current_setting('server_version_num')::int AS version''')
            require(row is not None and row['database'] ==
                ('pm_native_golden_test' if self.test_only else 'live_data_executor')
                and row['login'] == row['role'] == 'bobby' and row['system'] == self.system
                and 150000 <= row['version'] < 160000,
                'IDENTITY_PREPARE_ACTUAL_TARGET_CHANGED')
            require(await conn.fetchval("SELECT pg_try_advisory_xact_lock(210,81446)"),
                    'IDENTITY_PREPARE_INSTALL_BUSY')

            registry_before = await registry_catalogue_digest(conn, new_roles=NATIVE_ROLES,
                                                              installed=True)
            async def preservation():
                require(await native_catalogue_digest(conn) == self.native,
                        'IDENTITY_PREPARE_NATIVE_DRIFT')
                current = await registry_catalogue_digest(conn, new_roles=NATIVE_ROLES, installed=True)
                require(current == registry_before and
                    (self.registry is None or current == self.registry),
                    'IDENTITY_PREPARE_REGISTRY_DRIFT')

            await preservation()
            schema = await conn.fetchval('SELECT to_regnamespace($1) IS NOT NULL', SCHEMA)
            role = await conn.fetchval('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1)', ROLE)
            require(schema == role, 'IDENTITY_PREPARE_PARTIAL_REQUIRES_REVIEW')
            if not schema:
                await conn.execute(self.sql)
                await conn.execute('CREATE ROLE ts_portal_research_identity NOLOGIN NOSUPERUSER '
                    'NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1')
            await dormant_role(conn)
            require(await receipt_catalogue(conn,semantic_acl=self.semantic_acl) == self.receipt,
                    'IDENTITY_PREPARE_RECEIPT_DRIFT')
            await preservation()
            require(self.start <= datetime.now(timezone.utc) < self.end,
                    'IDENTITY_PREPARE_OUTSIDE_WINDOW')
        # Successful context exit, not DDL submission, is the commit boundary.
        return {'state':'RECEIPT_AND_DORMANT_ROLE_PREPARED', 'created':not schema,
            'role':ROLE, 'role_can_login':False, 'identity_writer_grants':False,
            'mapping_created':False, 'business_authority_granted':False,
            'native_and_registry_pins_preserved':True, 'receipt_sha256':self.receipt,
            'registry_before_sha256':registry_before,'registry_after_sha256':registry_before,
            'registry_evidence':('REVIEWED_PIN_AND_PRESERVATION' if self.registry is not None
                                 else 'PRESERVATION_ONLY_NOT_AUTHORITY')}
