"""
Football-Data.co.uk Enricher - CLV, Arbitres, Proxy Tactique
============================================================
Télécharge les CSV gratuits depuis football-data.co.uk et génère:
- CLV (Closing Line Value) via Pinnacle opening vs closing odds
- Profils arbitres (cartons/match, sévérité, biais)
- Proxy tactique par équipe (ratio tirs, possession, rendement)
- Données enrichies pour le pipeline XGBoost

Source: https://www.football-data.co.uk/data.php
- Zéro API key, zéro quota, zéro coût
- 22 divisions, 11 pays, remonte à 1993/94
- Pinnacle opening (PSH/PSD/PSA) + closing (PCH/PCD/PCA) odds
- Arbitre + cartons + tirs + corners + fautes par match

Usage:
  python ml/football_data_enricher.py                     # Enrichissement complet
  python ml/football_data_enricher.py --current-only     # Saison en cours uniquement
  python ml/football_data_enricher.py --leagues E0,SP1,D1 # Ligues spécifiques
"""

import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

# ============================================================
# CONFIGURATION
# ============================================================

# Ligues majeures européennes (codes football-data.co.uk)
LEAGUE_MAP = {
    "E0": {"name": "Premier League", "country": "ENG", "tier": 1},
    "E1": {"name": "Championship", "country": "ENG", "tier": 2},
    "SP1": {"name": "La Liga", "country": "ESP", "tier": 1},
    "SP2": {"name": "Segunda", "country": "ESP", "tier": 2},
    "D1": {"name": "Bundesliga", "country": "DEU", "tier": 1},
    "D2": {"name": "2. Bundesliga", "country": "DEU", "tier": 2},
    "I1": {"name": "Serie A", "country": "ITA", "tier": 1},
    "I2": {"name": "Serie B", "country": "ITA", "tier": 2},
    "F1": {"name": "Ligue 1", "country": "FRA", "tier": 1},
    "F2": {"name": "Ligue 2", "country": "FRA", "tier": 2},
    "N1": {"name": "Eredivisie", "country": "NED", "tier": 1},
    "P1": {"name": "Primeira Liga", "country": "POR", "tier": 1},
    "B1": {"name": "Belgian Pro League", "country": "BEL", "tier": 1},
    "T1": {"name": "Turkish Super Lig", "country": "TUR", "tier": 1},
    "G1": {"name": "Greek Super League", "country": "GRE", "tier": 1},
    "SC0": {"name": "Scottish Premiership", "country": "SCO", "tier": 1},
}

# Saisons à télécharger (format YY-YY)
# football-data.co.uk saison: 2627 = 2026-2027
def get_seasons(current_only: bool = False) -> List[str]:
    """Retourne les codes saison à télécharger."""
    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month

    # Déterminer la saison en cours
    if month >= 7:  # Juillet+ = nouvelle saison
        current = f"{str(year % 100)}{str((year + 1) % 100)}"
    else:
        current = f"{str((year - 1) % 100)}{str(year % 100)}"

    # Saisons historiques (pour le CLV et les profils riches)
    cy = int(current[:2])
    ny = int(current[2:])
    previous1 = f"{(cy - 1) % 100:02d}{(ny - 1) % 100:02d}"
    previous2 = f"{(cy - 2) % 100:02d}{(ny - 2) % 100:02d}"

    if current_only:
        return [current]
    return [current, previous1, previous2]


BASE_URL = "https://www.football-data.co.uk/mmz4281"

# Output directory
ENRICH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "enrichment")

# Headers furtifs
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# ============================================================
# DATA FETCHING
# ============================================================

def download_csv(division: str, season: str) -> Optional[List[Dict]]:
    """
    Télécharge un CSV depuis football-data.co.uk.
    Retourne une liste de dicts ou None si erreur.
    """
    url = f"{BASE_URL}/{season}/{division}.csv"

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read().decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(content))
            rows = list(reader)
            return rows if rows else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None  # Pas encore de données pour cette saison
        print(f"   ⚠️ HTTP {e.code} pour {division}/{season}")
        return None
    except Exception as e:
        print(f"   ⚠️ Erreur {division}/{season}: {e}")
        return None


def fetch_all_leagues(seasons: List[str], league_codes: Optional[List[str]] = None) -> List[Dict]:
    """
    Télécharge les CSV pour toutes les ligues demandées.
    Ajoute les métadonnées division/season à chaque ligne.
    """
    codes = league_codes or list(LEAGUE_MAP.keys())
    all_matches = []
    total_fetched = 0

    for season in seasons:
        for code in codes:
            league_info = LEAGUE_MAP.get(code, {"name": code, "country": "UNK", "tier": 3})
            rows = download_csv(code, season)

            if rows is None:
                continue

            for row in rows:
                row["_division"] = code
                row["_league_name"] = league_info["name"]
                row["_country"] = league_info["country"]
                row["_tier"] = league_info["tier"]
                row["_season"] = season

            all_matches.extend(rows)
            total_fetched += len(rows)
            print(f"   ✅ {league_info['name']} {season}: {len(rows)} matchs")

            # Politesse: 2 secondes entre les requêtes
            time.sleep(2)

    print(f"\n   📊 Total: {total_fetched} matchs téléchargés")
    return all_matches


# ============================================================
# PILIER 1: CLV (CLOSING LINE VALUE)
# ============================================================

def compute_clv_history(matches: List[Dict]) -> Dict:
    """
    Calcule le Closing Line Value pour chaque match.
    CLV = (Probabilité sharp opening) - (Probabilité marché closing)
    Un CLV positif = le marché a ajusté vers notre sens = edge confirmé.

    Sources dans les CSV:
    - Opening: PSH/PSD/PSA (Pinnacle opening) quand disponibles
    - Closing: B365H/B365D/B365A (Bet365) comme proxy du marché à la fermeture
    - Alternative: MaxBets MBH/MBA comme proxy sharp
    """
    clv_data = []
    clv_by_league = defaultdict(list)
    clv_summary = {}

    for m in matches:
        try:
            # Pinnacle Opening Odds (sharp book)
            psh = float(m.get("PSH", 0) or 0)
            psd = float(m.get("PSD", 0) or 0)
            psa = float(m.get("PSA", 0) or 0)

            # Bet365 Closing Odds (proxy marché closing)
            bch = float(m.get("B365H", 0) or 0)
            bcd = float(m.get("B365D", 0) or 0)
            bca = float(m.get("B365A", 0) or 0)

            # Skip si odds manquantes (il faut au moins une paire)
            has_pinnacle = all(x > 1.01 for x in [psh, psa])
            has_bet365 = all(x > 1.01 for x in [bch, bcd, bca])

            if not has_pinnacle and not has_bet365:
                continue

            # Si on a Pinnacle + Bet365, calculer CLV complet
            # Sinon, utiliser B365H vs BWA (Bet365 vs William Hill) comme proxy
            if has_pinnacle and has_bet365:
                open_h, open_d, open_a = psh, psd, psa
                close_h, close_d, close_a = bch, bcd, bca
                odds_source = "pinnacle_vs_bet365"
            elif has_bet365:
                # B365 vs BWH comme proxy
                bwh = float(m.get("BWH", 0) or 0)
                bwd = float(m.get("BWD", 0) or 0)
                bwa = float(m.get("BWA", 0) or 0)
                if not all(x > 1.01 for x in [bwh, bwa]):
                    continue
                open_h, open_d, open_a = bwh, bwd, bwa
                close_h, close_d, close_a = bch, bcd, bca
                odds_source = "bw_vs_b365"
            else:
                continue

            # Probabilités implicites (normalisées, retirer overround)
            def normalize_probs(h, d, a):
                total = 1/h + (1/d if d > 1 else 0) + 1/a
                return {
                    "home": (1/h) / total,
                    "draw": (1/d) / total if d > 1 else 0,
                    "away": (1/a) / total,
                }

            open_probs = normalize_probs(open_h, open_d, open_a)
            close_probs = normalize_probs(close_h, close_d, close_a)

            # CLV: différence de probabilité (opening vs closing)
            # Si le closing a baissé pour home, l'argent est allé sur home
            clv_home = open_probs["home"] - close_probs["home"]
            clv_draw = open_probs["draw"] - close_probs["draw"] if open_probs["draw"] > 0 else 0
            clv_away = open_probs["away"] - close_probs["away"]

            # Résultat du match
            ftr = m.get("FTR", "").strip().upper()  # H/D/A

            # Steam move: mouvement significatif (>3% de probabilité)
            steam_move = None
            max_move = max(abs(clv_home), abs(clv_draw), abs(clv_away))
            if max_move > 0.03:
                if abs(clv_home) == max_move:
                    steam_move = "home" if clv_home > 0.03 else "away"
                elif abs(clv_away) == max_move:
                    steam_move = "away" if clv_away > 0.03 else "home"
                elif abs(clv_draw) > 0.03:
                    steam_move = "draw"

            entry = {
                "home_team": m.get("HomeTeam", ""),
                "away_team": m.get("AwayTeam", ""),
                "date": m.get("Date", ""),
                "division": m.get("_division", ""),
                "league_name": m.get("_league_name", ""),
                "ftr": ftr,
                "odds_source": odds_source,
                "open_odds": {"home": open_h, "draw": open_d, "away": open_a},
                "close_odds": {"home": close_h, "draw": close_d, "away": close_a},
                "open_probs": {k: round(v, 4) for k, v in open_probs.items()},
                "close_probs": {k: round(v, 4) for k, v in close_probs.items()},
                "clv": {
                    "home": round(clv_home, 4),
                    "draw": round(clv_draw, 4),
                    "away": round(clv_away, 4),
                },
                "steam_move": steam_move,
                "max_clv": round(max_move, 4),
            }
            clv_data.append(entry)

            # Agréger par ligue
            clv_by_league[entry["division"]].append(entry)

        except (ValueError, TypeError, ZeroDivisionError):
            continue

    # Résumé par ligue
    for div, entries in clv_by_league.items():
        n = len(entries)
        avg_home_clv = sum(e["clv"]["home"] for e in entries) / n if n > 0 else 0
        avg_away_clv = sum(e["clv"]["away"] for e in entries) / n if n > 0 else 0
        steam_count = sum(1 for e in entries if e["steam_move"] is not None)
        clv_summary[div] = {
            "matches": n,
            "avg_clv_home": round(avg_home_clv, 4),
            "avg_clv_away": round(avg_away_clv, 4),
            "steam_move_pct": round(steam_count / n * 100, 1) if n > 0 else 0,
        }

    print(f"\n📈 CLV: {len(clv_data)} matchs avec Pinnacle odds")
    for div, summary in sorted(clv_summary.items()):
        league = LEAGUE_MAP.get(div, {}).get("name", div)
        print(f"   {league}: {summary['matches']} matchs | "
              f"CLV home moy: {summary['avg_clv_home']:+.3f} | "
              f"Steam: {summary['steam_move_pct']}%")

    return {
        "matches": clv_data[-2000:],  # Garder les 2000 plus récents
        "summary": clv_summary,
    }


# ============================================================
# PILIER 3: PROFILS ARBITRES
# ============================================================

def compute_referee_profiles(matches: List[Dict]) -> Dict:
    """
    Construit les profils d'arbitres à partir des données historiques.
    Pour chaque arbitre: cartons/match, sévérité, tendance penalties (proxy via fautes).
    """
    referee_stats = defaultdict(lambda: {
        "total_matches": 0,
        "yellow_cards": 0,
        "red_cards": 0,
        "total_fouls": 0,
        "total_goals": 0,
        "home_wins": 0,
        "away_wins": 0,
        "draws": 0,
        "divisions": set(),
    })

    for m in matches:
        referee = m.get("Referee", "").strip()
        if not referee:
            continue

        try:
            hy = int(m.get("HY", 0) or 0)  # Home yellows
            ay = int(m.get("AY", 0) or 0)  # Away yellows
            hr = int(m.get("HR", 0) or 0)  # Home reds
            ar = int(m.get("AR", 0) or 0)  # Away reds
            hf = int(m.get("HF", 0) or 0)  # Home fouls committed
            af = int(m.get("AF", 0) or 0)  # Away fouls committed
            fthg = int(m.get("FTHG", 0) or 0)  # Home goals
            ftag = int(m.get("FTAG", 0) or 0)  # Away goals
            ftr = m.get("FTR", "").strip().upper()

            s = referee_stats[referee]
            s["total_matches"] += 1
            s["yellow_cards"] += hy + ay
            s["red_cards"] += hr + ar
            s["total_fouls"] += hf + af
            s["total_goals"] += fthg + ftag
            s["divisions"].add(m.get("_division", ""))

            if ftr == "H":
                s["home_wins"] += 1
            elif ftr == "A":
                s["away_wins"] += 1
            else:
                s["draws"] += 1

        except (ValueError, TypeError):
            continue

    # Calculer les profils finaux
    profiles = {}
    for referee, s in referee_stats.items():
        if s["total_matches"] < 10:  # Minimum 10 matchs pour un profil fiable
            continue

        n = s["total_matches"]
        profiles[referee] = {
            "name": referee,
            "matches": n,
            "yellow_per_match": round(s["yellow_cards"] / n, 2),
            "red_per_match": round(s["red_cards"] / n, 2),
            "cards_per_match": round((s["yellow_cards"] + s["red_cards"]) / n, 2),
            "fouls_per_match": round(s["total_fouls"] / n, 2),
            "goals_per_match": round(s["total_goals"] / n, 2),
            "home_win_pct": round(s["home_wins"] / n * 100, 1),
            "away_win_pct": round(s["away_wins"] / n * 100, 1),
            "draw_pct": round(s["draws"] / n * 100, 1),
            "severity_index": round(((s["yellow_cards"] + s["red_cards"] * 3) / n), 2),
            "divisions": list(s["divisions"]),
            # Indice de sévérité normalisé (0-10): 0 = très lax, 10 = très strict
            "severity_normalized": min(10, round((s["yellow_cards"] + s["red_cards"] * 3) / n * 2, 1)),
        }

    # Top 10 arbitres les plus stricts
    sorted_refs = sorted(profiles.items(), key=lambda x: x[1]["severity_index"], reverse=True)

    print(f"\n👨‍⚖️ Arbitres: {len(profiles)} profils (min 10 matchs)")
    print(f"   Top 5 sévérité:")
    for name, p in sorted_refs[:5]:
        print(f"      {name}: {p['severity_index']:.1f} idx | "
              f"{p['yellow_per_match']:.1f}J/{p['red_per_match']:.1f}R/match | "
              f"{p['matches']} matchs")

    return {
        "profiles": dict(sorted_refs[:200]),  # Top 200 arbitres
        "count": len(profiles),
    }


# ============================================================
# PILIER 2: PROXY TACTIQUE (données disponibles)
# ============================================================

def compute_tactical_profiles(matches: List[Dict]) -> Dict:
    """
    Calcule des proxy tactiques par équipe à partir des données disponibles:
    - Shots Ratio (SR): part des tirs d'une équipe
    - Goal Conversion Rate
    - Defensive Compactness (proxy: fautes commises, corners concédés)
    - Home/Away Split Performance

    NOTE: Le vrai PPDA (Pressing) n'est pas disponible gratuitement.
    Ces proxies capturent des dimensions similaires.
    """
    team_stats = defaultdict(lambda: {
        "home": {"matches": 0, "goals_for": 0, "goals_against": 0,
                  "shots": 0, "shots_against": 0, "shots_target": 0, "shots_target_against": 0,
                  "corners": 0, "corners_against": 0, "fouls": 0, "fouls_against": 0,
                  "yellow_cards": 0, "red_cards": 0, "wins": 0},
        "away": {"matches": 0, "goals_for": 0, "goals_against": 0,
                  "shots": 0, "shots_against": 0, "shots_target": 0, "shots_target_against": 0,
                  "corners": 0, "corners_against": 0, "fouls": 0, "fouls_against": 0,
                  "yellow_cards": 0, "red_cards": 0, "wins": 0},
        "division": set(),
    })

    for m in matches:
        home = m.get("HomeTeam", "").strip()
        away = m.get("AwayTeam", "").strip()
        div = m.get("_division", "")

        try:
            fthg = int(m.get("FTHG", 0) or 0)
            ftag = int(m.get("FTAG", 0) or 0)
            hs = int(m.get("HS", 0) or 0)   # Home shots
            as_ = int(m.get("AS", 0) or 0)  # Away shots
            hst = int(m.get("HST", 0) or 0) # Home shots on target
            ast_ = int(m.get("AST", 0) or 0) # Away shots on target
            hc = int(m.get("HC", 0) or 0)   # Home corners
            ac = int(m.get("AC", 0) or 0)   # Away corners
            hf = int(m.get("HF", 0) or 0)   # Home fouls
            af = int(m.get("AF", 0) or 0)   # Away fouls
            hy = int(m.get("HY", 0) or 0)   # Home yellows
            ay = int(m.get("AY", 0) or 0)   # Away yellows
            hr = int(m.get("HR", 0) or 0)   # Home reds
            ar = int(m.get("AR", 0) or 0)   # Away reds
            ftr = m.get("FTR", "").strip().upper()

            # Home team stats
            if home:
                h = team_stats[home]["home"]
                h["matches"] += 1
                h["goals_for"] += fthg
                h["goals_against"] += ftag
                h["shots"] += hs
                h["shots_against"] += as_
                h["shots_target"] += hst
                h["shots_target_against"] += ast_
                h["corners"] += hc
                h["corners_against"] += ac
                h["fouls"] += hf
                h["fouls_against"] += af
                h["yellow_cards"] += hy
                h["red_cards"] += hr
                if ftr == "H":
                    h["wins"] += 1
                team_stats[home]["division"].add(div)

            # Away team stats
            if away:
                a = team_stats[away]["away"]
                a["matches"] += 1
                a["goals_for"] += ftag
                a["goals_against"] += fthg
                a["shots"] += as_
                a["shots_against"] += hs
                a["shots_target"] += ast_
                a["shots_target_against"] += hst
                a["corners"] += ac
                a["corners_against"] += hc
                a["fouls"] += af
                a["fouls_against"] += hf
                a["yellow_cards"] += ay
                a["red_cards"] += ar
                if ftr == "A":
                    a["wins"] += 1
                team_stats[away]["division"].add(div)

        except (ValueError, TypeError):
            continue

    # Calculer les profils finaux
    profiles = {}
    for team, data in team_stats.items():
        total_matches = data["home"]["matches"] + data["away"]["matches"]
        if total_matches < 10:
            continue

        # Home stats
        hm = data["home"]["matches"]
        am = data["away"]["matches"]

        def calc_ratio(s, n):
            return round(s / n, 2) if n > 0 else 0

        # Proxy tactique: shots ratio (dominance offensive)
        total_shots_h = data["home"]["shots"] + data["home"]["shots_against"]
        total_shots_a = data["away"]["shots"] + data["away"]["shots_against"]
        sr_home = data["home"]["shots"] / total_shots_h if total_shots_h > 0 else 0.5
        sr_away = data["away"]["shots"] / total_shots_a if total_shots_a > 0 else 0.5

        # Goal conversion rate
        gcr_home = (data["home"]["goals_for"] / data["home"]["shots"]
                     if data["home"]["shots"] > 0 else 0)
        gcr_away = (data["away"]["goals_for"] / data["away"]["shots"]
                     if data["away"]["shots"] > 0 else 0)

        # Defensive compactness proxy (inverse de corners concédés + fautes)
        home_corners_conceded = data["home"]["corners_against"]
        away_corners_conceded = data["away"]["corners_against"]
        dc_home = max(0, 10 - round(home_corners_conceded / hm, 2)) if hm > 0 else 5
        dc_away = max(0, 10 - round(away_corners_conceded / am, 2)) if am > 0 else 5

        profiles[team] = {
            "name": team,
            "total_matches": total_matches,
            "home_matches": hm,
            "away_matches": am,
            "home": {
                "goals_for_per_match": calc_ratio(data["home"]["goals_for"], hm),
                "goals_against_per_match": calc_ratio(data["home"]["goals_against"], hm),
                "shots_ratio": round(sr_home, 3),
                "shots_per_match": calc_ratio(data["home"]["shots"], hm),
                "shots_target_per_match": calc_ratio(data["home"]["shots_target"], hm),
                "goal_conversion_rate": round(gcr_home, 3),
                "corners_per_match": calc_ratio(data["home"]["corners"], hm),
                "fouls_per_match": calc_ratio(data["home"]["fouls"], hm),
                "cards_per_match": calc_ratio(data["home"]["yellow_cards"] + data["home"]["red_cards"], hm),
                "defensive_compactness": dc_home,
                "win_pct": round(data["home"]["wins"] / hm * 100, 1) if hm > 0 else 0,
            },
            "away": {
                "goals_for_per_match": calc_ratio(data["away"]["goals_for"], am),
                "goals_against_per_match": calc_ratio(data["away"]["goals_against"], am),
                "shots_ratio": round(sr_away, 3),
                "shots_per_match": calc_ratio(data["away"]["shots"], am),
                "shots_target_per_match": calc_ratio(data["away"]["shots_target"], am),
                "goal_conversion_rate": round(gcr_away, 3),
                "corners_per_match": calc_ratio(data["away"]["corners"], am),
                "fouls_per_match": calc_ratio(data["away"]["fouls"], am),
                "cards_per_match": calc_ratio(data["away"]["yellow_cards"] + data["away"]["red_cards"], am),
                "defensive_compactness": dc_away,
                "win_pct": round(data["away"]["wins"] / am * 100, 1) if am > 0 else 0,
            },
            "divisions": list(data["division"]),
        }

    print(f"\n⚽ Proxy Tactique: {len(profiles)} profils d'équipe (min 10 matchs)")

    # Exemple d'équipes connues
    sample_teams = ["Arsenal", "Liverpool", "Real Madrid", "Barcelona", "PSG",
                     "Bayern Munich", "Man City", "Chelsea"]
    for team in sample_teams:
        if team in profiles:
            p = profiles[team]
            print(f"   {team}: SR home {p['home']['shots_ratio']:.2f} | "
                  f"GCR {p['home']['goal_conversion_rate']:.2f} | "
                  f"DC {p['home']['defensive_compactness']:.1f}")

    return {
        "profiles": profiles,
        "count": len(profiles),
    }


# ============================================================
# PILIER 1+: CLV PAR EQUIPE (value tracking)
# ============================================================

def compute_clv_by_team(clv_data: List[Dict]) -> Dict:
    """
    Calcule le CLV moyen par équipe.
    Permet de voir quelles équipes sont systématiquement mal évaluées par le marché.
    """
    team_clv = defaultdict(lambda: {"clv_sum": 0, "count": 0, "steam_followed": 0, "steam_against": 0})

    for entry in clv_data:
        try:
            # Home team
            h = team_clv[entry["home_team"]]
            h["clv_sum"] += entry["clv"]["home"]
            h["count"] += 1
            if entry["steam_move"] == "home":
                h["steam_followed"] += 1

            # Away team
            a = team_clv[entry["away_team"]]
            a["clv_sum"] += entry["clv"]["away"]
            a["count"] += 1
            if entry["steam_move"] == "away":
                a["steam_followed"] += 1

            # Vérifier si le steam move était correct (le marché avait raison)
            ftr = entry["ftr"]
            if entry["steam_move"] == "home" and ftr == "H":
                h["steam_followed"] += 0  # Déjà compté
            elif entry["steam_move"] == "away" and ftr == "A":
                a["steam_followed"] += 0

        except (KeyError, TypeError):
            continue

    # Finaliser
    result = {}
    for team, s in team_clv.items():
        if s["count"] < 5:
            continue
        result[team] = {
            "avg_clv": round(s["clv_sum"] / s["count"], 4),
            "matches": s["count"],
            "steam_move_count": s["steam_followed"],
        }

    return dict(sorted(result.items(), key=lambda x: abs(x[1]["avg_clv"]), reverse=True)[:300])


# ============================================================
# SAVE & LOAD
# ============================================================

def save_enrichment(data: Dict, path: str):
    """Sauvegarde les données d'enrichissement en JSON."""
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # Convertir les sets en lists pour JSON
    def fix_serializable(obj):
        if isinstance(obj, set):
            return list(obj)
        elif isinstance(obj, defaultdict):
            return dict(obj)
        return obj

    # Sérialiser manuellement pour gérer les types complexes
    class CustomEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, set):
                return list(obj)
            if isinstance(obj, (datetime,)):
                return obj.isoformat()
            return super().default(obj)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, cls=CustomEncoder, indent=2, ensure_ascii=False, default=fix_serializable)

    size = os.path.getsize(path)
    print(f"\n💾 Enrichissement sauvegardé: {path} ({size / 1024:.1f} KB)")


def load_enrichment(path: str) -> Optional[Dict]:
    """Charge les données d'enrichissement depuis JSON."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Erreur chargement enrichissement: {e}")
        return None


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Football Data Enricher - CLV, Arbitres, Proxy Tactique")
    parser.add_argument("--current-only", action="store_true",
                        help="Saison en cours uniquement")
    parser.add_argument("--leagues", type=str, default=None,
                        help="Ligues spécifiques (ex: E0,SP1,D1)")
    parser.add_argument("--output", type=str, default=None,
                        help="Chemin de sortie personnalisé")
    args = parser.parse_args()

    print("=" * 60)
    print("📊 Football-Data.co.uk Enricher")
    print(f"   Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"   Source: football-data.co.uk (GRATUIT, zéro quota)")
    print("=" * 60)

    start_time = time.time()

    # Déterminer les ligues
    league_codes = None
    if args.leagues:
        league_codes = [l.strip() for l in args.leagues.split(",")]
        print(f"   Ligues: {league_codes}")
    else:
        print(f"   Ligues: {len(LEAGUE_MAP)} divisions européennes")

    # Saisons
    seasons = get_seasons(current_only=args.current_only)
    print(f"   Saisons: {seasons}")

    # 1. Télécharger les données
    print(f"\n📥 Téléchargement des CSV...")
    matches = fetch_all_leagues(seasons, league_codes)

    if not matches:
        print("❌ Aucune donnée téléchargée")
        sys.exit(1)

    # 2. Calculer les enrichissements
    print(f"\n🔍 Calcul des enrichissements...")

    # Pilier 1: CLV
    clv_result = compute_clv_history(matches)
    clv_team = compute_clv_by_team(clv_result.get("matches", []))

    # Pilier 2: Proxy Tactique
    tactical_result = compute_tactical_profiles(matches)

    # Pilier 3: Arbitres
    referee_result = compute_referee_profiles(matches)

    # Assembler le résultat
    enrichment = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "football-data.co.uk",
        "seasons": seasons,
        "total_matches_fetched": len(matches),
        "clv": {
            "history": clv_result.get("matches", [])[-500:],  # 500 derniers
            "summary": clv_result.get("summary", {}),
            "by_team": clv_team,
        },
        "referees": referee_result,
        "tactical_proxy": tactical_result,
        "metadata": {
            "pillars": ["clv", "referees", "tactical_proxy"],
            "note": "PPDA/pressing non disponible (données Opta propriétaires)",
        },
    }

    # Sauvegarder
    output_path = args.output or os.path.join(ENRICH_DIR, "enrichment.json")
    save_enrichment(enrichment, output_path)

    # Also save a lightweight version for the training pipeline
    training_data = {
        "timestamp": enrichment["timestamp"],
        "referee_profiles": referee_result["profiles"],
        "tactical_profiles": tactical_result["profiles"],
        "clv_summary": clv_result.get("summary", {}),
        "clv_by_team": clv_team,
    }
    training_path = os.path.join(ENRICH_DIR, "training_enrichment.json")
    save_enrichment(training_data, training_path)

    # Duration
    duration = time.time() - start_time
    print(f"\n⏱️ Durée: {duration:.1f}s")
    print("✅ Enrichissement terminé!")

    # Print summary for next step
    print(f"\n📋 Résumé pour le pipeline ML:")
    print(f"   - {len(referee_result['profiles'])} profils arbitre")
    print(f"   - {len(tactical_result['profiles'])} profils tactiques équipe")
    print(f"   - {len(clv_team)} profils CLV équipe")
    print(f"\n👉 Lancer ensuite: python ml/train_xgboost.py --enrichment {training_path}")


if __name__ == "__main__":
    main()
