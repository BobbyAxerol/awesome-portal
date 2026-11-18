"""OKX Paper catalogue package with the REAL Rust tool (new build, branch feat/catalogue-paper-okx-swap-20261118), one capped network-less container per call.
Cases: BINANCE with the OLD tool (e035cfee) and the NEW tool must be byte-identical to each other and to the installed Paper files; PAPER_OKX (proposal) must be unchanged;
PAPER_OKX_SWAP is the new set. Inputs: fresh read-only inventory meta.trading_system.out (identical to the Nov 16 dump), the installed base-49 candidate, T1 13 + five shared references."""
import copy, hashlib, json, os, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__)); S = os.path.dirname(D) + "/"
OUT = sys.argv[1]
E = "/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/"
INSTALLED = "/home/bobby/.worktrees/edge-from-running-source-20261116/scripts/epg10-08/t1-release/artifacts/"
TOOLS = {"old": (S + "rust-cache/catalogue-confirm", "tcc-e035cfee"), "new": (S + "rust-cache/okx-paper", "tcc-okx-swap")}
g = {"__file__": D + "/t1_t2_gen.py"}; exec(compile(open(D + "/t1_t2_gen.py").read().rsplit("\nmain()", 1)[0], "g", "exec"), g)
canon, digest, entry, release = g["canon"], g["digest"], g["entry"], g["release"]
meta = g["load_meta"](); orig = json.load(open(E + "edge-m0-r2-20261112/catalogue-candidate.json"))
T1, FIVE = g["T1_INCLUDED"], g["T2"][:4] + ["portfolio_audit_current_state"]
sha = lambda b: hashlib.sha256(b).hexdigest()
def tool(which, payload):
    p = subprocess.run([D + "/run-tool.sh", *TOOLS[which]], input=json.dumps(payload).encode(), capture_output=True)
    if p.returncode: return None, p.stderr.decode()
    return p.stdout, ""
PROFILE = ("mode", "venue", "environment", "profile_id")
pcols = lambda n: [c["name"] for c in meta[0][n] if c["name"] in PROFILE]
def assemble(add_names, shared_names):
    cat = copy.deepcopy(orig["catalogue"]); cat.pop("catalogue_sha256"); cat["authority"]["database"] = "live_data_executor"
    pol = copy.deepcopy(orig["policy"]); rels = cat["relations"]; pols = pol["relations"]
    for o in orig["omitted"]:
        n = o["relation"]
        if n in add_names or n in shared_names: continue
        rels.append({"schema": "public", "relation": n, "profile_columns": pcols(n)}); pols.append({"schema": "public", "relation": n, "profile_columns": pcols(n)})
    for n in add_names + shared_names:
        r, p = entry(n, meta, "DATABASE_SHARED_REFERENCE_NOT_MEMBERSHIP" if n in shared_names else "MODE_AND_VENUE"); rels.append(r); pols.append(p)
    k = lambda x: (x["schema"], x["relation"]); rels.sort(key=k); pols.sort(key=k); pol["relation_count"] = len(pols)
    seal = digest(cat); cat["catalogue_sha256"] = seal; pol["catalogue_sha256"] = seal
    return cat, pol
def final(which, pid, venue):
    cat, pol = assemble(T1, FIVE)
    out, err = tool(which, {"catalogue": cat, "policy": pol, "s1_m0": True})
    if out is None: return None, "prepare: " + err
    cand = json.loads(out)
    inv = "".join(f'{r["schema"]}.{r["relation"]}|' + ",".join(c["name"] for c in r["columns"]) + "\n" for r in cand["catalogue"]["relations"])
    out2, err2 = tool(which, {"refresh_m0": {"candidate": cand, "additions": [], "live_column_inventory": inv, "profile_id": pid, "venue": venue}})
    return out2, err2
res, files_by = {}, {}
for case, which, pid, venue in (("binance_old", "old", "PAPER_BINANCE_USDM", "BINANCE"), ("binance_new", "new", "PAPER_BINANCE_USDM", "BINANCE"),
                                ("okx_proposal_old", "old", "PAPER_OKX", "OKX"), ("okx_proposal_new", "new", "PAPER_OKX", "OKX"), ("okx_swap_new", "new", "PAPER_OKX_SWAP", "OKX")):
    out, err = final(which, pid, venue)
    if out is None: print(case, "TOOL REFUSED", err[:300]); res[case] = {"refused": err[:200]}; continue
    c = json.loads(out)
    files = {"relation-catalogue.json": canon(c["catalogue"]), "serving-policy.json": canon(c["policy"]), "profile-selection.json": canon(c["profile_descriptor"]),
             "manager-catalogue-release.json": canon(release(c)), "catalogue-candidate.json": out}
    d = f"{OUT}/{case}"; os.makedirs(d, exist_ok=True)
    row = {}
    for n, b in files.items(): open(f"{d}/{n}", "wb").write(b); row[n] = sha(b)
    s = c["catalogue"]["summary"]
    row.update(seal=c["catalogue"]["catalogue_sha256"], relations=s["relation_count"], returnable=s["returnable_column_count"], denied=s["secret_cell_excluded_column_count"],
               profile_sha256=c["profile_sha256"], status=c.get("status"))
    res[case] = row; files_by[case] = files
inst = {n: sha(open(INSTALLED + n, "rb").read()) for n in ("relation-catalogue.json", "serving-policy.json", "profile-selection.json", "manager-catalogue-release.json")}
check = {
    "binance_old_equals_new_all_5_files": all(res["binance_old"][n] == res["binance_new"][n] for n in ("relation-catalogue.json", "serving-policy.json", "profile-selection.json", "manager-catalogue-release.json", "catalogue-candidate.json")),
    "binance_new_equals_installed_paper": {n: res["binance_new"][n] == inst[n] for n in inst},
    "okx_proposal_old_equals_new": all(res["okx_proposal_old"][n] == res["okx_proposal_new"][n] for n in ("relation-catalogue.json", "serving-policy.json", "profile-selection.json", "manager-catalogue-release.json", "catalogue-candidate.json")),
}
print(json.dumps({"results": res, "installed_paper": inst, "checks": check}, indent=1, sort_keys=True))
