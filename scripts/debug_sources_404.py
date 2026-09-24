#!/usr/bin/env python3
"""Debug sources 404 : variantes URL Tennis Abstract + inventaire Sackmann via API GitHub."""
import urllib.request, ssl, json, time

UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

def probe(name, url, timeout=20):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA_BROWSER, "Accept": "*/*"})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            body = r.read(300)
            dt = (time.time() - t0) * 1000
            print(f"✅ {name}: HTTP {r.status} ({dt:.0f} ms) — {body[:200]!r}")
            return body
    except Exception as e:
        code = getattr(e, "code", None)
        print(f"❌ {name}: {'HTTP ' + str(code) if code else type(e).__name__} — {str(e)[:100]}")
        return None

print("=== TENNIS ABSTRACT (variantes) ===")
probe("TA www http", "http://www.tennisabstract.com/reports/atp_elo_ratings.csv")
probe("TA www https", "https://www.tennisabstract.com/reports/atp_elo_ratings.csv")
probe("TA page blog elo", "https://tennisabstract.com/blog/the-elo-ratings/")

print("\n=== SACKMANN (API GitHub sans token) ===")
info = probe("API repo tennis_atp", "https://api.github.com/repos/JeffSackmann/tennis_atp")
print("\n=== SACKMANN (variantes branches) ===")
probe("raw master README", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/README.md")
probe("raw main README", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/main/README.md")
probe("raw atp_matches_2025", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2025.csv")
