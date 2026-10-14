#!/usr/bin/env python3
"""Push alerte ops (route scan) + backtest split zone stats sur main via l'API Contents."""
import base64, json, re, urllib.request, urllib.error

# Récupère le token depuis push_fix.py (jamais affiché en clair)
_m = re.search(r'TOKEN\s*=\s*"([^"]+)"', open("/home/z/my-project/scripts/push_fix.py").read())
TOKEN = _m.group(1)
REPO = "teamsteo/steo-elite-predictor"
BRANCH = "main"

FILES = [
    {
        "path": "src/app/api/live-calibration/scan/route.ts",
        "local": "/home/z/my-project/steo-src/src/app/api/live-calibration/scan/route.ts",
        "msg": "feat(live-calibration): alerte Telegram sur echec du travail arriere-plan\n\nDepuis le mode background (after), la reponse 200 part AVANT la\ncalibration : le cron GH Actions est vert meme si le pipeline\narriere-plan plante, et les console.error ne sont lus par personne.\n\n- notifyOpsFailure() : alerte DM Telegram best-effort sur\n  (a) crash global du after(), (b) echecs de calibration par match\n  (1 message consolide max par run)\n- throttle en memoire : 1 alerte max par signature / 45 min\n  (anti-spam si Understat est down plusieurs runs consecutifs)\n- les reports pour budget epuise ne sont PAS alertes (reprise\n  normale au run cron suivant)\n- HTML echape (escHtml) pour les noms d'equipes et messages d'erreur",
    },
    {
        "path": "scripts/backtest_minute_split.ts",
        "local": "/home/z/my-project/steo-src/scripts/backtest_minute_split.ts",
        "msg": "feat(backtest): decoupage <30' vs >=30' pour trancher la question zone stats\n\nReutilise l'echantillon + priors walk-forward du run A/B shrinkage\n(250 matchs big-5 2025-26), refetch les tirs minutes Understat et\ncalibre chaque match DEUX fois : fenetre 0-30' (duration 30, temps\nrestant 60') et 0-45' (MT), meme prior, comparaison appairee vs\nscore final (Brier + logloss).\n\nCuts : volume xG<=30' (signal quasi nul vs present), etat du score\na 30' (0-0 vs buts), picks, mouvement L1 vs prior, confiance.\n\nResume automatique (npx tsx scripts/backtest_minute_split.ts),\nresume auto si minute_split_results.jsonl existe deja.",
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
