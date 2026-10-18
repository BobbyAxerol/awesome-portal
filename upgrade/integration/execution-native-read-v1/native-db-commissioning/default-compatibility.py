"""TEST ONLY PG15 pgcrypto name resolution; original independent pins unchanged."""
import argparse
import asyncio
import importlib.util
import json
import sys
from pathlib import Path
import asyncpg

root=Path('/source');sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location('golden',root/'pm-native-golden-export.py')
golden=importlib.util.module_from_spec(spec);spec.loader.exec_module(golden)
parser=argparse.ArgumentParser();parser.add_argument('--config');parser.add_argument('--approved-sha256')
value,input_pin,sources,policy,nf=golden.load(parser.parse_args())
PREPARED='1ff3681d953be64dfe181d88238ba70b0de676416f414551f48bedbebc08c94c'
GUARDED='5dfb08737ba24a7df409d03573d9cf2441e3ea86cb0b04d8057783ef0d5968e2'

async def run():
 conn=await asyncpg.connect(golden.DSN,timeout=3,command_timeout=5)
 try:
  row=await conn.fetchrow('''SELECT current_database() AS db,current_user AS role,
   (pg_control_system()).system_identifier::text AS system''')
  assert row['db']=='pm_native_golden_test' and row['role']=='bobby'
  assert row['system'] not in golden.LIVE_SYSTEMS
  await conn.execute('CREATE EXTENSION pgcrypto')
  async with conn.transaction():
   await conn.execute('SET LOCAL search_path=public,pg_catalog')
   for sql in (sources['users'],policy,sources['read'],sources['fence']):await conn.execute(sql)
   a=value['admission']
   await conn.execute('INSERT INTO pm_core_authority.limits VALUES(TRUE,$1,$2,$3)',
    a['configuration_digest'],a['maximum_unresolved'],a['maximum_retained'])
  before=await nf.native_catalogue_digest(conn)
  assert before!=PREPARED,'PGCRYPTO_MISMATCH_MUST_REPRODUCE'
  async with conn.transaction():
   await conn.execute("SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='3s'")
   await conn.execute('ALTER TABLE public.ts_users ALTER COLUMN user_id SET DEFAULT pg_catalog.gen_random_uuid()')
  prepared=await nf.native_catalogue_digest(conn)
  assert prepared==PREPARED,'ORIGINAL_INDEPENDENT_PREPARED_PIN_REQUIRED'
  await conn.execute(sources['guards'])
  guarded=await nf.native_catalogue_digest(conn)
  assert guarded==GUARDED,'ORIGINAL_INDEPENDENT_GUARDED_PIN_REQUIRED'
  assert await conn.fetchval('SELECT count(*) FROM public.ts_users')==0
  print(json.dumps(dict(status='ISOLATED_PG15_PGCRYPTO_COMPATIBILITY_PASS',cases=1,
   original_prepared_sha256=PREPARED,original_guarded_sha256=GUARDED,
   shadowed_before_sha256=before,identities_or_acceptances_installed=False,
   runtime_enabled=False,production_capacity_qualified=False)))
 finally:await conn.close(timeout=2)

asyncio.run(asyncio.wait_for(run(),30))
