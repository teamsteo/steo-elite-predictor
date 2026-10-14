#!/usr/bin/env python3
"""Push le script d'analyse MLB sur main via l'API Contents GitHub."""
import base64, json, re, urllib.request, urllib.error

# Récupère le token depuis push_fix.py (jamais affiché en clair)
_m = re.search(r'TOKEN\s*=\s*"([^"]+)"', open("/home/z/my-project/scripts/push_fix.py").read())
TOKEN = _m.group(1)
REPO = "teamsteo/steo-elite-predictor"
BRANCH = "main"

FILES = [
    {
        "path": "scripts/mlb_analysis_tonight.py",
        "local": "/home/z/my-project/steo-src/scripts/mlb_analysis_tonight.py",
        "msg": "feat(mlb): script d'analyse carte du soir + combine low/medium (regle Palier)\n\nSources : MLB StatsAPI (probables, stats saison lanceurs, standings\nL10/run diff/streak) + ESPN web API (moneyline DraftKings).\nModele : ML de-vig + ajustements plafonnes (lanceurs ±4pp, L10 ±3pp,\nrun diff ±2pp) -> p_model, risque, edge vs marche.\nCombine : jambes risque <= 30%, variante medium 3e jambe.\n\nParametre date : python3 scripts/mlb_analysis_tonight.py [YYYYMMDD].\nCache responses dans scripts/mlb_env/ (evite les re-fetch).\n\nNote : version reconstruite apres perte sandbox — bug de conversion\namericaine->decimale (branches inversees) corrige et valide sur la\ncarte du 2026-09-08 (NYY -345 -> 1.29, COL +270 -> 3.70).",
    },
]

def api(url, method="GET", payload=None):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    data = None
    if payload is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(payload).encode()
    with urllib.request.urlopen(req, data=data, timeout=60) as r:
        return json.loads(r.read().decode())

for f in FILES:
    url = f"https://api.github.com/repos/{REPO}/contents/{f['path']}?ref={BRANCH}"
    sha = None
    try:
        sha = api(url)["sha"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        print(f"NOUVEAU FICHIER {f['path']}")
    content = base64.b64encode(open(f["local"], "rb").read()).decode()
    put = api(url, "PUT", {
        "message": f["msg"],
        "content": content,
        "branch": BRANCH,
        **({"sha": sha} if sha else {}),
    })
    print(f"PUSHED {f['path']} -> commit {put['commit']['sha'][:7]}")
