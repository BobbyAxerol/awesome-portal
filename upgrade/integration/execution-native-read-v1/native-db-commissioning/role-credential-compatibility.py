"""TEST ONLY fresh PG15 real SCRAM; no operational DSN or private credential."""
import asyncio
import json
import secrets
import sys
sys.path.insert(0,'/helpers')
import asyncpg
from role_credentials import ROLES,finalize

async def run():
 conn=await asyncpg.connect('postgresql://bobby@pm-native-golden-db/pm_native_golden_test',timeout=3,command_timeout=3)
 try:
  row=await conn.fetchrow('''SELECT current_database() AS db,current_user AS role,
   (pg_control_system()).system_identifier::text AS system''')
  assert row['db']=='pm_native_golden_test' and row['role']=='bobby'
  assert row['system'] not in ('7674585245102796834','7675333655652302882')
  for name,settings in ROLES.items():
   await conn.execute('CREATE ROLE "'+name+'" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT '+str(settings['limit']))
  passwords={name:secrets.token_urlsafe(48) for name in ROLES}
  assert (await finalize(conn,passwords))['new_verifiers_installed']==3
  for name,settings in ROLES.items():
   client=await asyncpg.connect(host='pm-native-golden-db',database='pm_native_golden_test',
    user=name,password=passwords[name],timeout=3,command_timeout=3)
   try:
    assert await client.fetchval('SELECT current_user')==name
    assert await client.fetchval('SHOW transaction_read_only')==('on' if settings['readonly'] else 'off')
    for setting,expected in (('statement_timeout',str(settings['statement'])),
     ('lock_timeout',str(settings['lock'])),('idle_in_transaction_session_timeout',str(settings['idle']))):
     assert await client.fetchval("SELECT current_setting($1)::interval=($2||' milliseconds')::interval",setting,expected)
   finally:await client.close(timeout=2)
  assert (await finalize(conn,passwords))['new_verifiers_installed']==0
  different=dict(passwords);different[next(iter(ROLES))]='a'*64
  try:await finalize(conn,different)
  except ValueError as error:assert str(error)=='EXISTING_NEW_NATIVE_PASSWORD_MISMATCH_NO_ROTATION'
  else:raise AssertionError('CREDENTIAL_OVERWRITE_ALLOWED')
  try:
   client=await asyncpg.connect(host='pm-native-golden-db',database='pm_native_golden_test',
    user=next(iter(ROLES)),password='wrong-test-only-password',timeout=3)
  except asyncpg.InvalidPasswordError:pass
  else:
   await client.close();raise AssertionError('WRONG_PASSWORD_ALLOWED')
  print(json.dumps(dict(status='ISOLATED_PG15_REAL_SCRAM_PASS',cases=1,
   authenticated_new_roles=3,wrong_password_denied=True,same_password_idempotent=True,
   different_password_refused=True,identities_or_acceptances_installed=False,runtime_enabled=False)))
 finally:await conn.close(timeout=2)

asyncio.run(asyncio.wait_for(run(),30))
