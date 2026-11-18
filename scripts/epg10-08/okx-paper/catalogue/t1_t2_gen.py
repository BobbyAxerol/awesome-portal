"""Scratch-only draft generator for catalogue T1 / T1+T2 release sets (PAPER_BINANCE_USDM and PAPER_OKX).

NOT the Rust tool. Extends the validated replica approach (sandbox-offline/sandbox_gen.py regression) with
"add whole relations from DB metadata". Reads: the installed 49-relation candidate (Edge evidence dir) and
local text dumps of read-only catalogue queries (meta.trading_system.out). Writes only under --out.
Method check done separately: format_type/attnotnull/attnum reproduce the 859 existing column entries exactly.
"""
import argparse, copy, hashlib, json, os

EDGE = "/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08"
HERE = os.path.dirname(os.path.abspath(__file__))

def canon(v):
    b = json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode(); assert b.isascii(); return b
def digest(v): return hashlib.sha256(canon(v)).hexdigest()

T1_INCLUDED = ["alpha_deadman_heartbeats", "command_transport_bindings", "conditional_order_group_native_parents",
    "economic_account_cash_balances", "economic_account_fact_census", "economic_account_scope_heads", "economic_facts",
    "economic_performance_projections_v2", "economic_reconciliation_cases", "economic_tie_out_reports",
    "execution_algorithm_parents", "risk_pool_state_projections", "source_change_journal"]
T1_HELD = {"private_event_inbox": "profile columns include `environment` (provider environment, not the paper/sandbox/live value of the Manager profile): predicate semantics unprovable, 0 rows in Paper",
           "private_order_child_links": "same: `environment` marker column",
           "private_order_spawned_algo_links": "same: `environment` marker column",
           "source_change_publication_paper_replay_v1": "VIEW without any key (PENDING_QUERY_KEY) and a pg_lsn column the value encoder does not know"}
T2 = ["strategies", "alphas", "traders", "portfolio_equity_snapshots", "portfolio_audit_current_state", "portfolio_audit_log"]
PROFILE = ("mode", "venue")
# jsonb columns are denied everywhere in T1/T2 (no writer review); these names are also name-denied by the Manager.
SECRETISH = ("password", "passwd", "secret", "token", "api_key", "apikey", "private", "credential", "authorization", "auth_header", "signature")

def load_meta():
    cols, pk, uq = {}, {}, {}
    for l in open(os.path.join(HERE, "meta.trading_system.out")):
        p = l.rstrip("\n").split("|")
        if p[0] == "col": cols.setdefault(p[1], []).append(dict(ordinal=int(p[2]), name=p[3], data_type=p[4], nullable=p[5] == "true"))
        elif p[0] == "pk": pk[p[1]] = p[2].split(",")
        elif p[0] == "uq" and p[4] == "true": uq.setdefault(p[1], []).append({"columns": p[3].split(","), "kind": "UNIQUE_INDEX", "name": p[2]})
    return cols, pk, uq

def review(name, c):
    """-> (classification, reason)"""
    if c["data_type"] == "jsonb": return "SECRET_CELL_EXCLUDED", "jsonb, shape/content not writer-reviewed (class (c) free-form risk); denied"
    low = c["name"].lower()
    if low in ("raw", "raw_request", "raw_response", "payload", "command_payload", "outcome_payload", "capability_snapshot", "metadata", "raw_metadata"):
        return "SECRET_CELL_EXCLUDED", "name-denied by the Manager"
    if any(s in low for s in SECRETISH) and not low.endswith(("_id", "_status", "_version", "_fingerprint", "_hash")):
        return "SECRET_CELL_EXCLUDED", "secret-pattern name"
    return "RETURNABLE", "scalar (a)/(b)"

def entry(name, meta, scope):
    cols, pk, uq = meta
    shared = scope == "DATABASE_SHARED_REFERENCE_NOT_MEMBERSHIP"
    out_cols, denied = [], 0
    for c in cols[name]:
        cl, _ = review(name, c)
        denied += cl != "RETURNABLE"
        out_cols.append({"classification": cl, "data_type": c["data_type"], "name": c["name"], "nullable": c["nullable"], "ordinal": c["ordinal"]})
    names = {c["name"] for c in out_cols}
    cand = [{"columns": pk[name], "kind": "PRIMARY_KEY", "name": None}] + sorted(uq.get(name, []), key=lambda x: x["name"])
    prof = [] if shared else [p for p in (c["name"] for c in cols[name]) if p in PROFILE]
    if not shared: assert prof == [p for p in PROFILE if p in names] or set(prof) == set(PROFILE), name
    rel = {"columns": out_cols, "key": {"candidates": cand, "selected": {"columns": pk[name], "name": None, "status": "PRIMARY_KEY"}},
           "kind": "TABLE", "owner": "bobby",
           "privileges": {"delete": False, "insert": False, "references": False, "select": True, "trigger": False, "truncate": False, "update": False},
           "profile_classification": "FIXED_PROFILE_CONTEXT" if shared else "RELATION_PROFILE_MARKERS_PRESENT",
           "profile_columns": prof, "query_status": "PENDING_TS_OC_03D", "relation": name, "schema": "public",
           "secret_cell_excluded_column_count": denied, "source_binding": "DISABLED"}
    terms = [k for k in pk[name] if k not in PROFILE]
    if name == "portfolio_equity_snapshots": terms, origin = ["ts", "id"], "ADDITIVE_MIGRATION"   # idx_mgrread_portfolio_equity_ts_id exists (checked)
    elif shared or pk[name][:2] == ["mode", "venue"]: origin = "EXISTING"                          # PK index leads with (mode,venue,key) or with the key
    else: origin = "ADDITIVE_MIGRATION"                                                            # idx_mgrread_<rel>(mode,venue,<terms>) must be created (see MIGRATION_DRAFT.sql)
    pol = {"index_origin": origin, "key_proof": "PRIMARY_KEY", "key_terms": [{"column": t, "kind": "COLUMN"} for t in terms],
           "profile_columns": prof, "relation": name, "schema": "public"}
    return rel, pol

def build(base, add_names, shared_names, profile_id, venue, meta):
    r = copy.deepcopy(base)
    cat, pol = r["catalogue"], r["policy"]
    seal0 = cat.pop("catalogue_sha256"); assert seal0 == digest(cat)
    a = cat["authority"]; a["profile_id"] = profile_id; a["profile_venue"] = venue
    for n in add_names + shared_names:
        scope = "DATABASE_SHARED_REFERENCE_NOT_MEMBERSHIP" if n in shared_names else "MODE_AND_VENUE"
        rel, p = entry(n, meta, scope)
        assert n not in {x["relation"] for x in cat["relations"]}
        cat["relations"].append(rel); pol["relations"].append(p)
        r["selected_scopes"].append({"relation": n, "schema": "public", "scope": scope})
    r["omitted"] = [x for x in r["omitted"] if x["relation"] not in set(add_names + shared_names)]
    r["omitted_relation_count"] = len(r["omitted"])
    key = lambda x: (x["schema"], x["relation"])
    cat["relations"].sort(key=key); pol["relations"].sort(key=key); r["selected_scopes"].sort(key=key)
    rels = cat["relations"]
    kinds = {}
    for x in rels: kinds[x["kind"]] = kinds.get(x["kind"], 0) + 1
    cat["summary"] = {"pending_query_key_relation_count": sum(x["key"]["selected"]["status"] == "PENDING_QUERY_KEY" for x in rels),
        "pending_ts_oc_03d_relation_count": len(rels),
        "primary_key_relation_count": sum(x["key"]["selected"]["status"] == "PRIMARY_KEY" for x in rels),
        "profile_marker_relation_count": sum(bool(x["profile_columns"]) for x in rels),
        "relation_count": len(rels), "relation_kind_counts": dict(sorted(kinds.items())),
        "returnable_column_count": sum(c["classification"] == "RETURNABLE" for x in rels for c in x["columns"]),
        "secret_cell_excluded_column_count": sum(c["classification"] != "RETURNABLE" for x in rels for c in x["columns"]),
        "source_binding": "DISABLED", "unique_key_relation_count": sum(x["key"]["selected"]["status"] == "UNIQUE_INDEX" for x in rels)}
    pol["relation_count"] = len(pol["relations"])
    seal = digest(cat); cat["catalogue_sha256"] = seal; pol["catalogue_sha256"] = seal
    desc = {"schema_version": "portal.native-manager-read.profile-selection.v1", "environment": "paper", "profile_id": profile_id, "profile_mode": "paper",
            "venue": venue, "source_database_target": "trading_system", "published_catalogue_sha256": seal,
            "catalogue_file_sha256": digest(cat), "serving_policy_file_sha256": digest(pol)}
    r["profile_sha256"] = digest(desc); r["profile_descriptor"] = desc
    r["schema_refresh"] = {"status": "CANDIDATE_REQUIRES_TS_PIN_APPROVAL", "added_relation_count": len(add_names + shared_names), "source_catalogue_sha256": seal0}
    return r

def release(r):
    c = r["catalogue"]
    return {"schema_version": "portal.execution.manager-catalogue-release.v1", "environment": "paper", "profile_id": c["authority"]["profile_id"],
            "catalogue_sha256": "sha256:" + c["catalogue_sha256"], "relations": sorted("public." + x["relation"] for x in c["relations"])}

def write(r, d):
    os.makedirs(d, exist_ok=False)
    f = {"relation-catalogue.json": canon(r["catalogue"]), "serving-policy.json": canon(r["policy"]), "profile-selection.json": canon(r["profile_descriptor"]),
         "manager-catalogue-release.json": canon(release(r)), "catalogue-candidate.json": canon(r) + b"\n"}
    h = {}
    for n, b in f.items():
        open(os.path.join(d, n), "xb").write(b); h[n] = hashlib.sha256(b).hexdigest()
    return h

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); a = ap.parse_args()
    meta = load_meta()
    base = json.load(open(EDGE + "/edge-m0-r2-20261112/catalogue-candidate.json"))   # installed tuple A, 49 relations / 859 columns, PAPER_BINANCE_USDM
    summary = {}
    for tup, pid, venue in (("paper-binance", "PAPER_BINANCE_USDM", "BINANCE"), ("paper-okx", "PAPER_OKX", "OKX")):
        for tag, add, sh in (("base49", [], []), ("t1", T1_INCLUDED, []), ("t1t2", T1_INCLUDED, T2)):
            r = build(base, add, sh, pid, venue, meta)
            h = write(r, os.path.join(a.out, tup, tag))
            s = r["catalogue"]["summary"]
            summary[f"{tup}/{tag}"] = {"files": h, "seal": r["catalogue"]["catalogue_sha256"], "relations": s["relation_count"], "returnable": s["returnable_column_count"], "denied": s["secret_cell_excluded_column_count"]}
    print(json.dumps(summary, indent=1, sort_keys=True))
main()
