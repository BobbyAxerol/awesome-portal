"""Emit Manager wire shapes by driving the image's REAL facade code (ManagerReadFacade subclass S1ReadFacade, handle()) with a stub source.
Bypasses mTLS/JWT (stub gate) and PostgreSQL (stub source with synthetic typed rows). Usage: gen_wire.py CATALOGUE POLICY OUTDIR"""
import asyncio, json, os, sys, types
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID
sys.path[:0] = ["/app", "/opt/manager-s1"]
from services.portal_execution_owner import manager_facade as mf
import manager_s1

cat_path, pol_path, out = sys.argv[1:4]
catalogue = mf.ManagerCatalogue(json.load(open(cat_path)), json.load(open(pol_path)))
AS_OF = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)
PID = os.environ.get("GEN_PROFILE_ID", "PAPER_BINANCE_USDM")
PROFILE = {"mode": os.environ.get("GEN_MODE", "paper"), "venue": os.environ.get("GEN_VENUE", "BINANCE")}
SOURCE_ID = "sha256:" + "ab" * 32
S1 = manager_s1._RELATIONS

def synth(col, n):
    t = col.data_type
    if t == "text": return f"v{n}"
    if t.startswith("timestamp"): return AS_OF
    if t == "date": return date(2026, 11, 16)
    if t.startswith("numeric"): return Decimal("12.50000000")
    if t == "double precision": return 1.5
    if t in ("bigint", "integer", "smallint"): return n
    if t == "boolean": return True
    if t == "uuid": return UUID(int=n)
    if t == "text[]": return [f"a{n}", f"b{n}"]
    if t == "jsonb": return {"k": n}
    return f"v{n}"

def row_for(binding, n):
    row = {c.name: synth(c, n) for c in binding.safe_columns}
    for k in binding.key_columns:
        if k in row and not isinstance(row[k], str): pass
    if binding.relation in S1:
        for k in binding.key_columns: row[k] = f"k{n:04d}"
        if "mode" in row: row["mode"] = PROFILE["mode"]
        if "venue" in row: row["venue"] = PROFILE["venue"]
    return row

def keys_for(binding, row, n):
    out = []
    for k in binding.key_columns:
        v = row.get(k)
        out.append(v if v is not None else f"k{n:04d}")
    return tuple(out)

class Stub:
    def __init__(self, identity):
        self._identity = identity
        self.mode = "page"   # page | empty | more
    def source_identity(self):
        return self._identity
    async def fetch_page(self, binding, *, profile_values, after, limit):
        n = {"page": 1, "empty": 0, "more": limit + 1}[self.mode]
        rows = tuple(row_for(binding, i + 1) for i in range(n))
        keys = tuple(keys_for(binding, r, i + 1) for i, r in enumerate(rows))
        if binding.relation in S1:
            scope = {"mode": PROFILE["mode"], "venue": PROFILE["venue"]} if binding.relation == "account_balances" else None
            total = len(rows)
            proof = {"version": "edge-s1.v1", "mechanism": "M0", "source_id": SOURCE_ID, "relation": "public." + binding.relation,
                     "scope": scope, "generation": {"at": AS_OF.isoformat(), "snapshot": "10:20:11,12"},
                     "total_in_scope": total, "status": "COMPLETE" if total <= limit else "PARTIAL",
                     "reason": None if total <= limit else "SCOPE_EXCEEDS_ONE_PAGE", "absence_authority": False}
            manager_s1._CONTEXT.get()["proof"] = proof
            rows, keys = rows[:limit], keys[:limit]
        return mf.SourcePage(rows=rows, key_values=keys, as_of=AS_OF)
    async def fetch_record(self, binding, *, profile_values, key): return None
    async def close(self): pass

class Gate:
    policy = types.SimpleNamespace(profile_id=PID)
    def authorize(self, intent, peer, jwt):
        return types.SimpleNamespace(profile_id=PID, profile_values=dict(PROFILE), client_workload_id="wire-shape-stub")

identity = None
if hasattr(mf, "build_source_identity"):
    identity = mf.build_source_identity(database_name=os.environ.get("GEN_DB_NAME", "trading_system"), database_oid=int(os.environ.get("GEN_DB_OID", "16384")), ledger_rows=int(os.environ.get("GEN_LEDGER_ROWS", "175")),
                                        latest_ledger_version="20261115_t1_read_indexes")
stub = Stub(identity)
facade = manager_s1.S1ReadFacade.__new__(manager_s1.S1ReadFacade)
facade._gate = Gate(); facade._profile_id = PID; facade._catalogue = catalogue; facade._source = stub
facade._cursor_codec = mf.CursorCodec(__import__("cryptography.fernet", fromlist=["Fernet"]).Fernet.generate_key()); facade._source_binding_enabled = True; facade._route_enabled = True
facade._limiter = mf.SlidingWindowRateLimiter(limit=10000); facade._maximum_concurrency = 4; facade._in_flight = 0
facade._admission_lock = asyncio.Lock()

async def call(path, query=None):
    req = mf.ManagerRequest(method="GET", path=path, query=query or {}, trace_id="wire-shape-trace", peer=None, delegated_jwt="stub")
    resp = await facade.handle(req)
    return {"status": resp.status_code, "body": json.loads(json.dumps(resp.body))}

async def main():
    os.makedirs(out, exist_ok=True)
    def put(name, doc): open(f"{out}/{name}.json", "w").write(json.dumps(doc, sort_keys=True))
    put("_catalogue", await call("/portal/execution/v2/manager/catalog"))
    put("_capabilities", await call("/portal/execution/v2/manager/capabilities"))
    rels = sorted((b.schema, b.relation) for b in [catalogue.binding(s, r) for s, r in
           [(x["schema"], x["relation"]) for x in json.load(open(cat_path))["relations"]]])
    for schema, relation in rels:
        b = catalogue.binding(schema, relation)
        modes = ["page", "empty"] + (["more"] if relation not in S1 else ["more"])
        for mode in modes:
            stub.mode = mode
            token = manager_s1._CONTEXT.set({})
            try:
                put(f"{schema}.{relation}.{mode}", await call(f"/portal/execution/v2/manager/records/{schema}/{relation}", {"limit": "1"}))
            finally:
                manager_s1._CONTEXT.reset(token)
    print("emitted", len(rels), "relations ->", out)
asyncio.run(main())
