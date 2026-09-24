#!/usr/bin/env python3
"""Audit ban-risque des sources de données tennis — 1 requête par source, user-agents réalistes."""
import urllib.request, ssl, json, sys, time

UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
UA_SIMPLE = "steo-elite-predictor/1.0 (personal project)"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def probe(name, url, ua=UA_BROWSER, timeout=20, max_bytes=400):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "*/*"})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            body = r.read(200000)
            dt = (time.time() - t0) * 1000
            sample = body[:max_bytes].decode("utf-8", "replace").replace("\n", "\\n")[:max_bytes]
            print(f"✅ {name}: HTTP {r.status} ({dt:.0f} ms, {len(body)}+ octets)")
            print(f"   ↳ {sample}")
    except Exception as e:
        code = getattr(e, "code", None)
        print(f"❌ {name}: {'HTTP ' + str(code) if code else type(e).__name__} — {str(e)[:120]}")

print("=" * 90)
print("AUDIT BAN-RISQUE SOURCES TENNIS (1 requête unique par source)")
print("=" * 90)

# 1. Tennis Abstract Elo (fichier CSV statique)
probe("Tennis Abstract ATP Elo CSV", "http://tennisabstract.com/reports/atp_elo_ratings.csv")
probe("Tennis Abstract WTA Elo CSV", "http://tennisabstract.com/reports/wta_elo_ratings.csv")

# 2. Sackmann GitHub raw (déjà utilisé, cache 24h)
probe("Sackmann rankings ATP", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_current.csv", ua=UA_SIMPLE)
probe("Sackmann matchs 2026", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2026.csv", ua=UA_SIMPLE)

# 3. ATP Tour officiel (statistiques service/retour) — test page publique
probe("ATP Tour (page stats)", "https://www.atptour.com/en/stats/leaderboard", timeout=15)

# 4. BetExplorer tennis (page de listing)
probe("BetExplorer tennis", "https://www.betexplorer.com/tennis/", timeout=15)

json.dump({"ok": True}, open("/home/z/my-project/scripts/audit_sources_result.json", "w"))
