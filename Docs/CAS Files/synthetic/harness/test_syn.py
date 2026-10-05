import json, os, itertools
from decimal import Decimal as D
from collections import defaultdict
import pytest
from api.import_helpers import _authed_headers_and_member, PAN_DISCLAIMER_VERSION, _test_db
SYN="/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only/Docs/CAS Files/synthetic/"
TRUTH=json.load(open(SYN+"truth.json"))
SEQ=os.environ.get("SEQ","p3_FY.pdf").split(",")
OUT=os.environ.get("OUT","/dev/null")

def upload(client, headers, mid, fn, log):
    r=client.post("/imports/parse", files={"file":(fn,open(SYN+fn,'rb').read(),"application/pdf")},
        data={"password":"MF@123","household_member_id":mid,"pan_disclaimer_version":PAN_DISCLAIMER_VERSION}, headers=headers)
    if r.status_code!=200: log.append(f"PARSE {fn} -> {r.status_code} {r.text[:300]}"); return
    p=r.json()
    review=[{"fund":s["name"],"match":s["match_status"],"plan":s["plan_type"],"conf":s["match_confidence"],"suggested":s["suggested_name"],"code":s["suggested_amfi_code"]}
            for s in p["schemes"] if s["match_status"]!="confirmed" or s["plan_type"]=="unclassified"]
    log.append({"file":fn,"needs_review":review,"schemes":len(p["schemes"]),"people":len(p["people"])})
    body={"session_id":p["session_id"],"household_member_id":mid,"scheme_confirmations":[]}
    c=client.post("/imports/confirm", json=body, headers=headers)
    if c.status_code!=200:
        log.append(f"CONFIRM BLOCKED {fn}: {c.status_code} {c.text[:250]}")
        # Simulate the user resolving the review screen: accept the suggested match / pick plan from name.
        confs=[]
        for s in p["schemes"]:
            x={"temp_id":s["temp_id"]}
            if s["match_status"]!="confirmed" and s["suggested_amfi_code"]: x["amfi_code"]=s["suggested_amfi_code"]
            if len(x)>1: confs.append(x)
        body["scheme_confirmations"]=confs
        c=client.post("/imports/confirm", json=body, headers=headers)
        if c.status_code!=200: log.append(f"CONFIRM STILL BLOCKED after accepting suggestions: {c.status_code} {c.text[:250]}"); return
        log.append(f"confirmed after manual review (accepted {len(confs)} suggestions)")
    j=c.json(); log.append(f"confirm {fn}: added={j['added']} skipped={j['skipped']}")

def test_seq(client):
    truth=TRUTH[SEQ[-1]]
    headers, mid = _authed_headers_and_member(client, "+919811122233", name=truth["investor"])
    log=[]
    for fn in SEQ: upload(client, headers, mid, fn, log)
    h=client.get(f"/household-members/{mid}/holdings", headers=headers).json()
    from app.models.reference import Scheme
    from app.models.folio import Folio
    db=_test_db(); sch={str(s.id):s for s in db.query(Scheme).all()}
    plan={ (f.folio_number, f.scheme_id): f.plan_type.value for f in db.query(Folio).all()}
    got=defaultdict(D); val=D(0); navless=[]
    for row in h.get("holdings",[]):
        s=sch[row["scheme_id"]]; got[s.isin]+=D(row["units_held"])
        if row["current_value"] is None: navless.append(s.name)
        else: val+=D(row["current_value"])
    exp=defaultdict(D); expval=defaultdict(D); names={}
    for f in truth["funds"]:
        exp[f["isin"]]+=D(f["close"]); expval[f["isin"]]+=D(f["value"]); names[f["isin"]]=f["fund"]
    funds=[]
    for isin in set(exp)|set(got):
        e,g=exp.get(isin,D(0)),got.get(isin,D(0))
        if e==0 and g==0: continue
        funds.append({"fund":names.get(isin,isin),"isin":isin,"cas_units":str(e),"dash_units":str(g),"diff":str(e-g),
                      "cas_value":str(expval.get(isin,0)),"lost_value":str((e-g)*(expval[isin]/e if e else 0))})
    res={"seq":SEQ,"log":log,"cas_total":truth["total_value"],"dash_total":str(val),"navless":navless,
         "lifetime_xirr":h.get("lifetime_xirr"),"funds":funds,"plans":sorted(set(plan.values()))}
    json.dump(res,open(OUT,"w"),indent=1,default=str)
