"""Private one-time native-role provisioning; no secret values in output."""
import base64
import hashlib
import hmac
import os
import re

ROLES={
 'ts_portal_native_read_source':dict(limit=2,readonly=True,statement=3000,lock=1000,idle=10000),
 'ts_portal_native_read_control':dict(limit=2,readonly=False,statement=3000,lock=1000,idle=10000),
 'ts_portal_native_read_maintenance':dict(limit=1,readonly=False,statement=30000,lock=2000,idle=30000),
}

def password_bytes(value):
 if type(value) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{64}',value):
  raise ValueError('NEW_NATIVE_PASSWORD_FORMAT_CHANGED')
 return value.encode('ascii')

def verifier(value,salt=None):
 password=password_bytes(value)
 salt=os.urandom(16) if salt is None else salt
 if type(salt) is not bytes or len(salt)!=16:raise ValueError('SCRAM_SALT_INVALID')
 salted=hashlib.pbkdf2_hmac('sha256',password,salt,4096)
 stored=hashlib.sha256(hmac.digest(salted,b'Client Key','sha256')).digest()
 server=hmac.digest(salted,b'Server Key','sha256')
 enc=lambda b:base64.b64encode(b).decode('ascii')
 return 'SCRAM-SHA-256$4096:'+enc(salt)+'$'+enc(stored)+':'+enc(server)

def matches(value,stored):
 password_bytes(value)
 if type(stored) is not str:return False
 try:
  method,iteration,salt,client,server=re.fullmatch(
   r'(SCRAM-SHA-256)\$([0-9]+):([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)',stored).groups()
  if iteration!='4096':return False
  decoded=base64.b64decode(salt,validate=True)
  return hmac.compare_digest(verifier(value,decoded),stored)
 except (AttributeError,ValueError):return False

async def finalize(conn,passwords):
 if set(passwords)!=set(ROLES):raise ValueError('ONLY_EXACT_NEW_NATIVE_ROLES_ALLOWED')
 for value in passwords.values():password_bytes(value)
 rows=await conn.fetch('''SELECT rolname,rolpassword,rolsuper,rolcreatedb,rolcreaterole,
   rolreplication,rolbypassrls,rolinherit,rolcanlogin,rolconnlimit FROM pg_authid
   WHERE rolname=ANY($1::text[])''',list(ROLES))
 if len(rows)!=3:raise ValueError('NATIVE_ROLE_SET_CHANGED')
 for row in rows:
  name=row['rolname']
  if any(row[k] for k in ('rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','rolinherit')):
   raise ValueError('NATIVE_ROLE_PRIVILEGE_CHANGED')
  if not row['rolcanlogin'] or row['rolconnlimit']!=ROLES[name]['limit']:
   raise ValueError('NATIVE_ROLE_CONFIGURATION_CHANGED')
  if row['rolpassword'] is not None and not matches(passwords[name],row['rolpassword']):
   raise ValueError('EXISTING_NEW_NATIVE_PASSWORD_MISMATCH_NO_ROTATION')
 changed=0
 async with conn.transaction():
  # Prevent statement/parameter/context logging of session-local verifiers.
  # pg_stat_statements sees only the parameterized set_config and constant DO.
  for setting,value in (
   ('log_statement','none'),('log_duration','off'),('log_min_duration_statement','-1'),
   ('log_min_error_statement','panic'),('log_error_verbosity','terse'),
   ('log_parameter_max_length','0'),('log_parameter_max_length_on_error','0'),
   ('lock_timeout','1000'),('statement_timeout','3000')):
   await conn.execute("SELECT pg_catalog.set_config($1,$2,true)",setting,value)
  for row in rows:
   name=row['rolname'];settings=ROLES[name]
   if row['rolpassword'] is None:
    encoded=verifier(passwords[name])
    await conn.execute("SELECT pg_catalog.set_config('portal_native_commission.verifier',$1,true)",encoded)
    await conn.execute("SELECT pg_catalog.set_config('portal_native_commission.role',$1,true)",name)
    await conn.execute('''DO $native$ BEGIN
     EXECUTE pg_catalog.format('ALTER ROLE %I PASSWORD %L',
      pg_catalog.current_setting('portal_native_commission.role'),
      pg_catalog.current_setting('portal_native_commission.verifier'));
     END $native$''')
    changed+=1
   # Names are from the closed literal set, settings are bounded integers/bools.
   for setting,value in (
    ('default_transaction_read_only','on' if settings['readonly'] else 'off'),
    ('statement_timeout',str(settings['statement'])),('lock_timeout',str(settings['lock'])),
    ('idle_in_transaction_session_timeout',str(settings['idle']))):
    await conn.execute('ALTER ROLE "'+name+'" SET '+setting+"='"+value+"'")
 return dict(state='NEW_NATIVE_ROLE_CREDENTIALS_FINALIZED',new_verifiers_installed=changed,
  existing_credentials_rotated=False,role_count=3,secret_values_emitted=False)
