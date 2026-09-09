"""
football_data_enricher.py — P4 Phase 3 (implémentation RÉELLE du stub P2)
==========================================================================

Télécharge les CSV historiques gratuits de football-data.co.uk (fichiers statiques,
sans quota, sans clé, sans risque de ban) et produit
data/enrichment/training_enrichment.json consommé par ml/train_xgboost.py
(DEFAULT_ENRICHMENT_PATH — déjà géré gracieusement si le fichier est absent).

Piliers d'enrichissement (contrat du loader `load_enrichment_data`):
  - clv_by_team      : { team: { avg_clv } } — proxy CLV par équipe
  - tactical_profiles: { team: { home/away: { shots_ratio, goal_conversion_rate,
                        defensive_compactness } } }
  - referee_profiles : { arbitre: {...} } (profil brut)
  - referee_league_agg: { div: { avg_severity, avg_cards_pm, avg_home_bias,
                        card_variance, foul_card_ratio }, "_global": {...} }
  - timestamp

DÉFINITIONS HONNÊTES (proxies documentés, pas de magie):
  - CLV proxy = ((1/moyenne_marché) - (1/Pinnacle)) / (1/Pinnacle) sur l'issue
    de l'équipe concernée. Pinnacle = book le plus sharp; un écart systématique
    moyenne↔Pinnacle est un signal de (dés)alignement du marché pour cette équipe.
  - shots_ratio = part des tirs dans ses matchs (home pour domicile, away pour extérieur)
  - goal_conversion_rate = buts / tirs
  - defensive_compactness = tirs adverses autorisés par match (bas = compact)

ANTI-FRAGILITÉ : tout échec (réseau, CSV manquant, parsing) est ignoré par
division/saison; le script sort 0 même en cas d'échec TOTAL (le training tourne
sans enrichissement — comportement P0 préservé). Aucune écriture hors du
répertoire data/enrichment.
"""

import io
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

BASE_URL = "https://www.football-data.co.uk/mmz4281/{season}/{div}.csv"

# Divisions couvertes (mapping identique à league_to_div dans train_xgboost.py)
DIVISIONS = ["E0", "E1", "SP1", "SP2", "I1", "I2", "D1", "D2", "F1", "F2", "N1", "P1", "B1", "SC0", "G1"]

# Dernières saisons (2122 = 2021/22 → 2627 = 2026/27)
SEASONS = ["2122", "2223", "2324", "2425", "2526", "2627"]

ENRICH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "enrichment")
OUTPUT_PATH = os.path.join(ENRICH_DIR, "training_enrichment.json")

REQUEST_TIMEOUT = 20
DELAY_BETWEEN_REQUESTS = 0.3  # politesse (fichiers statiques, aucun risque)

# Alias équipes football-data → noms ESPN/displayName courants
# (le loader matche exact puis case-insensitive; on émet donc les DEUX clés)
TEAM_ALIASES = {
    "Man United": ["Manchester United"],
    "Man City": ["Manchester City"],
    "Nott'm Forest": ["Nottingham Forest"],
    "Newcastle": ["Newcastle United"],
    "West Ham": ["West Ham United"],
    "Tottenham": ["Tottenham Hotspur"],
    "Wolves": ["Wolverhampton Wanderers"],
    "Brighton": ["Brighton and Hove Albion", "Brighton & Hove Albion"],
    "Leicester": ["Leicester City"],
    "Norwich": ["Norwich City"],
    "Cardiff": ["Cardiff City"],
    "Swansea": ["Swansea City"],
    "Ath Madrid": ["Atletico Madrid", "Atlético Madrid"],
    "Ath Bilbao": ["Athletic Bilbao", "Athletic Club"],
    "Betis": ["Real Betis"],
    "Sociedad": ["Real Sociedad"],
    "Alaves": ["Deportivo Alaves", "Deportivo Alavés"],
    "Espanol": ["Espanyol", "RCD Espanyol"],
    "Sp Gijon": ["Sporting Gijon", "Sporting Gijón"],
    "Inter": ["Inter Milan", "Internazionale"],
    "Milan": ["AC Milan"],
    "Roma": ["AS Roma"],
    "Lazio": ["SS Lazio"],
    "Napoli": ["SSC Napoli"],
    "Juventus": ["Juventus Turin"],
    "Atalanta": ["Atalanta Bergamo"],
    "Bayern Munich": ["Bayern München", "FC Bayern"],
    "Leverkusen": ["Bayer Leverkusen"],
    "Gladbach": ["Borussia Mönchengladbach", "Borussia Monchengladbach"],
    "Dortmund": ["Borussia Dortmund"],
    "Paris SG": ["Paris Saint Germain", "Paris Saint-Germain", "PSG"],
    "St Etienne": ["Saint Etienne", "Saint-Étienne", "AS Saint-Étienne"],
    "Glasgow Rangers": ["Rangers"],
    "Sporting CP": ["Sporting Lisbon", "Sporting"],
    "Vitoria SC": ["Vitoria Guimaraes", "Vitória Guimarães"],
}


def fetch_csv(url: str) -> str | None:
    """
    Télécharge un CSV. Retourne None si indisponible.
    Fast-fail sur erreur HTTP (403/404/503 = IP bloquée ou fichier absent):
    pas de retry inutile — le site sert des fichiers statiques, un 503
    persistant signale une IP non autorisée (ex: datacenter), on abandonne.
    Retry uniquement sur erreur réseau transitoire (timeout, DNS).
    """
    for attempt in range(2):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                    "Accept": "text/csv,*/*",
                },
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                if resp.status != 200:
                    return None
                raw = resp.read()
                return raw.decode("cp1252", errors="replace")
        except urllib.error.HTTPError:
            # 403/404/503 etc. — pas de retry (statique: même résultat)
            return None
        except Exception:
            if attempt == 0:
                time.sleep(1.0)
    return None


def _f(row: dict, key: str) -> float | None:
    v = row.get(key)
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_csv(content: str) -> list[dict]:
    """Parse un CSV football-data (guillemets rares, séparateur virgule)."""
    rows: list[dict] = []
    reader = io.StringIO(content)
    import csv as _csv

    for row in _csv.DictReader(reader):
        # Certaines lignes de fin de fichier sont vides/partielles
        if not row.get("HomeTeam") or not row.get("AwayTeam"):
            continue
        rows.append({k: (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k})
    return rows


def main() -> int:
    print("📊 football_data_enricher — téléchargement CSV football-data.co.uk")
    started = time.time()

    clv_sum: dict[str, list[float]] = defaultdict(list)
    tac: dict[str, dict[str, dict[str, list[float]]]] = defaultdict(
        lambda: {"home": defaultdict(list), "away": defaultdict(list)}
    )
    ref_matches: dict[str, list[dict]] = defaultdict(list)
    div_matches: dict[str, list[dict]] = defaultdict(list)

    downloaded = 0
    skipped = 0
    consecutive_failures = 0

    for season in SEASONS:
        for div in DIVISIONS:
            url = BASE_URL.format(season=season, div=div)
            content = fetch_csv(url)
            if not content:
                skipped += 1
                consecutive_failures += 1
                # Garde-fou: si les N premiers téléchargements échouent tous,
                # l'IP est bloquée (datacenter) → sortie immédiate et honnête.
                # (Le training tourne sans enrichissement, comportement P0.)
                if skipped >= 3 and downloaded == 0:
                    print("   ⚠️ 3 premiers téléchargements échoués — IP probablement bloquée par football-data.co.uk")
                    print("      → abandon propre (le training tourne sans enrichissement)")
                    return 0
                continue
            consecutive_failures = 0
            rows = parse_csv(content)
            downloaded += 1
            time.sleep(DELAY_BETWEEN_REQUESTS)

            for row in rows:
                home = row.get("HomeTeam", "")
                away = row.get("AwayTeam", "")
                fthg = _f(row, "FTHG")
                ftag = _f(row, "FTAG")
                if not home or not away or fthg is None or ftag is None:
                    continue

                avg_h, avg_a = _f(row, "AvgH"), _f(row, "AvgA")
                ps_h, ps_a = _f(row, "PSH"), _f(row, "PSA")

                # ── CLV proxy (moyenne marché vs Pinnacle) ──
                if avg_h and ps_h and ps_h > 0:
                    clv_sum[home].append((1 / avg_h - 1 / ps_h) / (1 / ps_h))
                if avg_a and ps_a and ps_a > 0:
                    clv_sum[away].append((1 / avg_a - 1 / ps_a) / (1 / ps_a))

                # ── Proxy tactique ──
                hs, as_ = _f(row, "HS"), _f(row, "AS")
                hst, ast = _f(row, "HST"), _f(row, "AST")
                hy, ay = _f(row, "HY"), _f(row, "AY")
                hr, ar = _f(row, "HR"), _f(row, "AR")
                hf, af = _f(row, "HF"), _f(row, "AF")

                if hs is not None and as_ is not None and (hs + as_) > 0:
                    tac[home]["home"]["shots_ratio"].append(hs / (hs + as_))
                    tac[away]["away"]["shots_ratio"].append(as_ / (hs + as_))
                    if fthg is not None and hs > 0:
                        tac[home]["home"]["goal_conversion_rate"].append(fthg / hs)
                    if ftag is not None and as_ > 0:
                        tac[away]["away"]["goal_conversion_rate"].append(ftag / as_)
                    tac[home]["home"]["defensive_compactness"].append(as_)
                    tac[away]["away"]["defensive_compactness"].append(hs)

                # ── Arbitres (divisions qui fournissent la colonne) ──
                referee = (row.get("Referee") or "").strip()
                if referee and hy is not None and ay is not None:
                    match_stats = {
                        "hy": hy, "ay": ay,
                        "hr": hr or 0, "ar": ar or 0,
                        "fouls": (hf or 0) + (af or 0),
                    }
                    ref_matches[referee].append(match_stats)
                    div_matches[div].append(match_stats)

    # ── Assemblage du JSON (contrat exact du loader) ──
    clv_by_team = {}
    for team, values in clv_sum.items():
        if len(values) >= 5:  # signal minimal
            clv_by_team[team] = {"avg_clv": round(sum(values) / len(values), 6)}
            # Alias vers les noms ESPN courants
            for alias in TEAM_ALIASES.get(team, []):
                clv_by_team.setdefault(alias, {"avg_clv": clv_by_team[team]["avg_clv"]})

    tactical_profiles = {}
    for team, sides in tac.items():
        profile = {}
        for side in ("home", "away"):
            sr = sides[side]["shots_ratio"]
            gc = sides[side]["goal_conversion_rate"]
            dc = sides[side]["defensive_compactness"]
            if len(sr) >= 5:
                profile[side] = {
                    "shots_ratio": round(sum(sr) / len(sr), 4),
                    "goal_conversion_rate": round((sum(gc) / len(gc)) if gc else 0.0, 4),
                    "defensive_compactness": round(sum(dc) / len(dc), 2) if dc else 5.0,
                }
        if profile:
            tactical_profiles[team] = profile
            for alias in TEAM_ALIASES.get(team, []):
                tactical_profiles.setdefault(alias, profile)

    def _ref_agg(stats: list[dict]) -> dict | None:
        if len(stats) < 10:  # profil arbitre minimal
            return None
        severities = [m["hy"] + m["ay"] + 2 * (m["hr"] + m["ar"]) for m in stats]
        cards = [m["hy"] + m["ay"] for m in stats]
        home_cards = [m["hy"] for m in stats]
        away_cards = [m["ay"] for m in stats]
        n = len(stats)
        mean = lambda xs: sum(xs) / len(xs) if xs else 0.0
        total_cards = sum(cards)
        home_bias = (sum(home_cards) - sum(away_cards)) / total_cards if total_cards > 0 else 0.0
        variance = sum((s - mean(severities)) ** 2 for s in severities) / n if n > 1 else 0.0
        return {
            "matches": n,
            "avg_severity": round(mean(severities), 3),
            "avg_cards_pm": round(mean(cards), 3),
            "avg_home_bias": round(home_bias, 3),
            "card_variance": round(variance, 3),
            "foul_card_ratio": round(total_cards / (sum(m["fouls"] for m in stats) or 1), 4),
        }

    referee_profiles = {}
    for name, stats in ref_matches.items():
        agg = _ref_agg(stats)
        if agg:
            referee_profiles[name] = agg

    referee_league_agg = {}
    for div, stats in div_matches.items():
        agg = _ref_agg(stats)
        if agg:
            referee_league_agg[div] = agg
    all_stats = [m for stats in div_matches.values() for m in stats]
    global_agg = _ref_agg(all_stats)
    if global_agg:
        referee_league_agg["_global"] = global_agg

    output = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "football-data.co.uk (CSV statiques, saisons 2122-2627)",
        "csv_downloaded": downloaded,
        "csv_skipped": skipped,
        "clv_by_team": clv_by_team,
        "tactical_profiles": tactical_profiles,
        "referee_profiles": referee_profiles,
        "referee_league_agg": referee_league_agg,
    }

    os.makedirs(ENRICH_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=1)

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"   ✅ {downloaded} CSV téléchargés, {skipped} indisponibles")
    print(f"   CLV: {len(clv_by_team)} équipes | Tactique: {len(tactical_profiles)} | Arbitres: {len(referee_profiles)} profils, {len(referee_league_agg)} agrégats")
    print(f"   💾 {OUTPUT_PATH} ({size_kb:.0f} KB) — {time.time() - started:.0f}s")
    print("   ℹ️ Le prochain run de train_xgboost.py consommera ce fichier (détection auto)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
