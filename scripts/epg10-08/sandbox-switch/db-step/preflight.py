import asyncio, asyncpg, ssl, urllib.parse as u, json, sys
dsn = open("/run/secrets/facade-db.dsn").read().strip()
async def go():
    ctx = ssl.create_default_context(cafile="/run/secrets/ts-postgres-ca.crt")
    x = u.urlsplit(dsn)
    c = await asyncpg.connect(host=x.hostname, port=x.port, user=x.username, password=x.password, database=x.path.lstrip("/"), ssl=ctx)
    out = {"tls": True, "db": await c.fetchval("select current_database()"), "user_is_login": (await c.fetchval("select current_user")) == x.username}
    async with c.transaction(isolation="repeatable_read", readonly=True):
        await c.execute("SET LOCAL ROLE ts_portal_manager_read")
        out["role"] = await c.fetchval("select current_user")
        out["ledger_rows"] = await c.fetchval("select count(*) from public.schema_migration_ledger")
        rels = ["strategies","portfolios","account_balances","command_transport_bindings","source_change_journal","economic_facts","orders","fills","domain_events"]
        out["counts"] = {r: await c.fetchval(f"select count(*) from public.{r}") for r in rels}
        try:
            await c.execute("insert into public.strategies default values"); out["write_attempt"] = "UNEXPECTEDLY_OK"
        except Exception as e:
            out["write_attempt"] = type(e).__name__
    await c.close()
    print(json.dumps(out, sort_keys=True))
asyncio.run(go())
