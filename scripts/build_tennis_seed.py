#!/usr/bin/env python3
"""
Seed Tennis V3 — télécharge tennis-data.co.uk (ATP+WTA 2021-2026), précalcule les Elo,
produit src/lib/tennis-v3/seed/tennis-seed.json.gz (léger, commité).

Algo Elo documenté (doit rester identique à src/lib/tennis-v3/elo-engine.ts) :
  BASE=1500 ; K = 250 / (games+5)^0.4 ; margin mult (Bo3: 2-0=1.0, 2-1=0.85 ;
  Bo5: 3-0=1.10, 3-1=1.0, 3-2=0.9) ; bo5_mult=1.10 ; E = 1/(1+10^(-d/400))
  Ra' = Ra + K*bo5_mult*margin*(W-E) — deux pistes: overall + surface.

Usage : python3 scripts/build_tennis_seed.py [--years 2021:2026] [--slow-ms 6000]
"""
import urllib.request, ssl, io, json, gzip, time, sys, math, re, unicodedata, os, pickle
from datetime import date, datetime, timedelta

try:
    import openpyxl
except ImportError:
    print("pip install openpyxl"); sys.exit(1)

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
BASE_XLSX = "https://www.tennis-data.co.uk/hrjk-85HytOjkhth76j_ygh4jf7"

YEARS = list(range(2021, 2027))
SLOW_MS = 6000
OUT = "/home/z/my-project/src/lib/tennis-v3/seed/tennis-seed.json.gz"

# ---------------- utilitaires noms ----------------
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def clean_name(raw):
    """'Alcaraz C.' → clé canon 'alcaraz-c' ; garde aussi affichage."""
    s = strip_accents(raw or "").lower()
    s = re.sub(r"[^a-z\s.-]", "", s).strip()
    return re.sub(r"\s+", " ", s)

def display_name(raw):
    return raw.strip()

# ---------------- Elo ----------------
class Elo:
    BASE = 1500.0
    def __init__(self):
        self.overall = {}
        self.surface = {"Hard": {}, "Clay": {}, "Grass": {}}
    def get(self, d, p):
        return d.get(p, self.BASE)
    def games(self, p):
        return self.overall.get(p, {}).get("games", 0) if isinstance(self.overall.get(p), dict) else 0

def k_factor(games):
    return 250.0 / (math.pow(games + 5, 0.4))

def margin_mult(wsets, lsets, bo5):
    diff = wsets - lsets
    if bo5:
        return {3: 1.10, 2: 1.00, 1: 0.90}.get(diff, 1.0)
    return {2: 1.00, 1: 0.85}.get(diff, 1.0)

def expected(ra, rb):
    return 1.0 / (1.0 + math.pow(10, -(ra - rb) / 400.0))

def update(elo, w, l, surface, wsets, lsets, bo5, walkover):
    margin = 0.85 if walkover else margin_mult(wsets, lsets, bo5)
    bo5m = 1.10 if bo5 else 1.0
    for d in [elo.overall] + [elo.surface.get(surface)]:
        if d is None: continue
        gw = d.get(w, {"games": 0})["games"]
        gl = d.get(l, {"games": 0})["games"]
        ra = d.get(w, {"rating": 1500.0})["rating"]
        rb = d.get(l, {"rating": 1500.0})["rating"]
        e = expected(ra, rb)
        delta = k_factor(gw) * bo5m * margin * (1.0 - e)
        delta_l = k_factor(gl) * bo5m * margin * (0.0 - (1.0 - e) if False else -((1.0 - e) - 0.0))
        # symétrie: le perdant perd exactement ce que le gagnant gagne (mêmes K approx.)
        d[w] = {"rating": ra + delta, "games": gw + 1}
        d[l] = {"rating": rb - delta, "games": gl + 1}

# ---------------- lecture xlsx ----------------
def parse_date(v):
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    s = str(v)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m: return s[:10]
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m: return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None

CACHE_DIR = "/home/z/my-project/scripts/.xlsx_cache"

def load_xlsx(url):
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, re.sub(r"[^a-z0-9]", "_", url.lower())[-60:] + ".pkl")
    if os.path.exists(cache_file):
        with open(cache_file, "rb") as f:
            return pickle.load(f)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=60, context=ctx).read()
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    out = []
    for r in rows:
        if r is None: continue
        d = dict(zip(header, r))
        if not d.get("Winner") or not d.get("Loser"): continue
        out.append(d)
    with open(cache_file, "wb") as f:
        pickle.dump(out, f)
    return out

def norm_odds(v):
    try:
        f = float(v)
        return f if 1.01 <= f <= 100 else None
    except (TypeError, ValueError):
        return None

# ---------------- main ----------------
def main():
    matches = []  # chronologique
    for year in YEARS:
        for tag, url in [
            ("atp", f"{BASE_XLSX}/{year}/{year}.xlsx"),
            ("wta", f"{BASE_XLSX}/{year}w/{year}.xlsx"),
        ]:
            try:
                rows = load_xlsx(url)
                print(f"✅ {tag.upper()} {year}: {len(rows)} matchs")
                for d in rows:
                    dt = parse_date(d.get("Date"))
                    if not dt: continue
                    w, l = display_name(str(d["Winner"])), display_name(str(d["Loser"]))
                    wc, lc = clean_name(w), clean_name(l)
                    if not wc or not lc or wc == lc: continue
                    bo5 = (str(d.get("Best of") or "3") == "5")
                    comment = str(d.get("Comment") or "").lower()
                    walkover = "walkover" in comment or "retired" in comment
                    def safe_int(v):
                        try: return int(v)
                        except (TypeError, ValueError): return 0
                    wsets = safe_int(d.get("Wsets"))
                    lsets = safe_int(d.get("Lsets"))
                    matches.append({
                        "date": dt, "w": wc, "l": lc, "wd": w, "ld": l,
                        "surface": str(d.get("Surface") or "Hard"),
                        "court": str(d.get("Court") or "Outdoor"),
                        "series": str(d.get("Series") or ""),
                        "tourney": str(d.get("Tournament") or ""),
                        "round": str(d.get("Round") or ""),
                        "bo5": bool(bo5), "wsets": wsets, "lsets": lsets,
                        "walkover": walkover,
                        "wrank": d.get("WRank") if d.get("WRank") is not None else 0,
                        "lrank": d.get("LRank") if d.get("LRank") is not None else 0,
                        "wpts": d.get("WPts") if d.get("WPts") is not None else 0,
                        "lpts": d.get("LPts") if d.get("LPts") is not None else 0,
                        "psw": norm_odds(d.get("PSW")), "psl": norm_odds(d.get("PSL")),
                    })
            except Exception as e:
                print(f"❌ {tag.upper()} {year}: {type(e).__name__} {str(e)[:100]}")
            time.sleep(SLOW_MS / 1000.0)
    matches.sort(key=lambda m: m["date"])
    print(f"TOTAL: {len(matches)} matchs")

    # Elo
    elo = Elo.__new__(Elo)
    elo.overall, elo.surface = {}, {"Hard": {}, "Clay": {}, "Grass": {}}
    for m in matches:
        surf = m["surface"] if m["surface"] in ("Hard", "Clay", "Grass") else "Hard"
        update(elo, m["w"], m["l"], surf, m["wsets"], m["lsets"], m["bo5"], m["walkover"])

    # ratings finaux
    ratings = {}
    all_names = set(elo.overall.keys())
    for name in all_names:
        o = elo.overall.get(name, {"rating": 1500.0, "games": 0})
        ratings[name] = {
            "overall": round(o["rating"], 1), "games": o["games"],
            "hard": round(elo.surface["Hard"].get(name, {"rating": 1500.0})["rating"], 1),
            "clay": round(elo.surface["Clay"].get(name, {"rating": 1500.0})["rating"], 1),
            "grass": round(elo.surface["Grass"].get(name, {"rating": 1500.0})["rating"], 1),
        }

    # matchs récents (150 jours) pour forme/veto/H2H incrémental
    cutoff = (date.today() - timedelta(days=150)).isoformat()
    recent = [m for m in matches if m["date"] >= cutoff]
    slim = []
    for m in recent:
        slim.append({k: m[k] for k in ["date", "w", "l", "surface", "court", "series", "tourney", "round", "bo5", "wsets", "lsets", "walkover", "wrank", "lrank", "wpts", "lpts"]})

    # dernières vues par joueur (absence/veto)
    last_seen = {}
    for m in matches:
        last_seen[m["w"]] = m["date"]; last_seen[m["l"]] = m["date"]

    # stats agrégées 5 ans par joueur (surface, indoor, bo5, rang)
    player_stats = {}
    def bump(p, field):
        s = player_stats.setdefault(p, {"hw": 0, "hl": 0, "cw": 0, "cl": 0, "gw": 0, "gl": 0, "iw": 0, "il": 0, "bo5": 0, "m": 0, "rank": 0, "pts": 0})
        s[field] += 1
    for m in matches:
        surf = m["surface"]
        wf, lf = ({"Hard": "hw", "Clay": "cw", "Grass": "gw"}.get(surf, "hw"), {"Hard": "hl", "Clay": "cl", "Grass": "gl"}.get(surf, "hl"))
        bump(m["w"], wf); bump(m["l"], lf)
        if m["court"].lower().startswith("indoor"):
            bump(m["w"], "iw"); bump(m["l"], "il")
        if m["bo5"]:
            bump(m["w"], "bo5"); bump(m["l"], "bo5")
        bump(m["w"], "m"); bump(m["l"], "m")
        player_stats[m["w"]]["rank"] = m["wrank"] or player_stats[m["w"]]["rank"]
        player_stats[m["l"]]["rank"] = m["lrank"] or player_stats[m["l"]]["rank"]
        player_stats[m["w"]]["pts"] = m["wpts"] or player_stats[m["w"]]["pts"]
        player_stats[m["l"]]["pts"] = m["lpts"] or player_stats[m["l"]]["pts"]
    # display names
    display = {}
    for m in matches:
        display[m["w"]] = m["wd"]; display[m["l"]] = m["ld"]

    seed = {
        "generatedAt": date.today().isoformat(),
        "algoVersion": "elo-v1",
        "sources": ["tennis-data.co.uk"],
        "license": "données publiques tennis-data.co.uk — usage personnel non commercial",
        "ratings": ratings,
        "playerStats": player_stats,
        "displayNames": display,
        "recentMatches": slim,
        "lastSeen": last_seen,
        "counts": {"total": len(matches), "recent": len(slim)},
    }
    blob = json.dumps(seed, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    import os, base64
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(blob.decode("utf-8"))
    # module base64 embarqué (bundling sûr sur Vercel)
    b64 = base64.b64encode(open(OUT, "rb").read()).decode()
    b64_path = "/home/z/my-project/src/lib/tennis-v3/seed-b64.ts"
    with open(b64_path, "w") as f:
        f.write("/**\n * Tennis V3 — Seed embarqué (base64 du gz)\n * Généré par scripts/build_tennis_seed.py — NE PAS ÉDITER À LA MAIN\n */\n\nexport const SEED_B64 =\n\"" + b64 + "\";\n")
    print(f"💾 seed → {OUT} ({os.path.getsize(OUT)/1024:.0f} Ko gz) + seed-b64.ts ({len(b64)/1024:.0f} Ko)")
    # top 10 Elo contrôle
    top = sorted(ratings.items(), key=lambda kv: -kv[1]["overall"])[:10]
    for n, r in top: print(f"   {n}: {r['overall']} (h {r['hard']}/c {r['clay']}/g {r['grass']})")

if __name__ == "__main__":
    main()
