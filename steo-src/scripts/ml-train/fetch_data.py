#!/usr/bin/env python3
"""
fetch_data.py — Extrait les features + résultats depuis Supabase
Prépare le dataset pour l'entraînement XGBoost.

Usage:
    python fetch_data.py [--sport SPORT] [--output FILE] [--days DAYS]

Sortie: CSV avec features et labels prêts pour train.py
"""

import os
import sys
import json
import csv
import argparse
from datetime import datetime, timedelta
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ pip install supabase")
    sys.exit(1)

# ============================================
# CONFIGURATION
# ============================================

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Variables d'environnement manquantes:")
    print("   NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL")
    print("   SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY")
    print("   (.env file supporté)")
    sys.exit(1)

# Charger .env si présent
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    print(f"📄 Chargement {env_path}...")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("\"'")
                if key == "NEXT_PUBLIC_SUPABASE_URL" and not SUPABASE_URL:
                    SUPABASE_URL = val
                elif key == "SUPABASE_URL" and not SUPABASE_URL:
                    SUPABASE_URL = val
                elif key == "SUPABASE_SERVICE_ROLE_KEY" and not SUPABASE_KEY:
                    SUPABASE_KEY = val
                elif key == "SUPABASE_ANON_KEY" and not SUPABASE_KEY:
                    SUPABASE_KEY = val


def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_predictions(supabase: Client, sport: str = None, days: int = 365):
    """Récupère les prédictions complétées avec features."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    query = supabase.table("predictions").select("*") \
        .eq("status", "completed") \
        .not_("result_match", "is", None) \
        .gte("match_date", cutoff) \
        .order("match_date", desc=True) \
        .limit(5000)

    if sport and sport != "all":
        query = query.eq("sport", sport)

    print(f"📊 Récupération des prédictions ({days} derniers jours)...")
    result = query.execute()
    print(f"✅ {len(result.data)} prédictions récupérées")

    return result.data


def fetch_matches(supabase: Client, sport: str = None, days: int = 365):
    """Récupère les matchs terminés avec stats avancées."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    query = supabase.table("matches").select("*") \
        .eq("status", "STATUS_FINAL") \
        .not_("home_score", "is", None) \
        .gte("date", cutoff) \
        .order("date", desc=True) \
        .limit(5000)

    if sport and sport != "all":
        query = query.eq("sport", sport)

    print(f"📊 Récupération des matchs ({days} derniers jours)...")
    result = query.execute()
    print(f"✅ {len(result.data)} matchs récupérés")

    return result.data


def extract_features(prediction: dict, match_data: dict = None) -> dict:
    """Extrait les features d'une prédiction pour XGBoost."""
    features = {}

    # === Features de base ===
    p = prediction

    # Sport encodé
    sport = (p.get("sport") or "").lower()
    features["sport_football"] = 1 if sport == "football" or sport == "soccer" else 0
    features["sport_basketball"] = 1 if sport == "basketball" or sport == "nba" else 0
    features["sport_hockey"] = 1 if sport == "hockey" or sport == "nhl" else 0
    features["sport_tennis"] = 1 if sport == "tennis" else 0
    features["sport_baseball"] = 1 if sport == "baseball" or sport == "mlb" else 0

    # Cotes
    odds_home = p.get("odds_home")
    odds_draw = p.get("odds_draw")
    odds_away = p.get("odds_away")

    features["odds_home"] = float(odds_home) if odds_home else 2.0
    features["odds_draw"] = float(odds_draw) if odds_draw else 3.5
    features["odds_away"] = float(odds_away) if odds_away else 2.0

    # Probabilités implicites
    features["implied_prob_home"] = 1.0 / features["odds_home"]
    features["implied_prob_away"] = 1.0 / features["odds_away"]
    features["implied_prob_draw"] = 1.0 / features["odds_draw"]

    # Marge du bookmaker
    margin = features["implied_prob_home"] + features["implied_prob_draw"] + features["implied_prob_away"]
    features["bookmaker_margin"] = margin

    # Écart de cotes
    features["odds_spread"] = abs(features["odds_home"] - features["odds_away"])

    # Favori clair
    features["is_home_favorite"] = 1 if features["odds_home"] < features["odds_away"] else 0
    features["favorite_strength"] = min(
        features["implied_prob_home"] if features["odds_home"] < features["odds_away"] else features["implied_prob_away"],
        0.95
    )

    # === Features temporelles ===
    match_date = p.get("match_date")
    if match_date:
        try:
            dt = datetime.fromisoformat(match_date.replace("Z", "+00:00"))
            features["month"] = dt.month
            features["day_of_week"] = dt.weekday()
            features["hour"] = dt.hour
            features["is_weekend"] = 1 if dt.weekday() >= 5 else 0
        except (ValueError, TypeError):
            features["month"] = 6
            features["day_of_week"] = 0
            features["hour"] = 15
            features["is_weekend"] = 0
    else:
        features["month"] = 6
        features["day_of_week"] = 0
        features["hour"] = 15
        features["is_weekend"] = 0

    # === Features de confiance du modèle ===
    confidence = (p.get("confidence") or "").lower()
    features["confidence_very_high"] = 1 if confidence == "very_high" else 0
    features["confidence_high"] = 1 if confidence == "high" else 0
    features["confidence_medium"] = 1 if confidence == "medium" else 0
    features["confidence_low"] = 1 if confidence == "low" else 0

    # Risque
    features["risk_percentage"] = float(p.get("risk_percentage") or 0) / 100.0

    # === Features JSON (model_confidence, features) ===
    features_json = p.get("features") or {}
    if isinstance(features_json, str):
        try:
            features_json = json.loads(features_json)
        except (json.JSONDecodeError, TypeError):
            features_json = {}

    if isinstance(features_json, dict):
        # Forme
        features["home_form_score"] = float(features_json.get("homeFormScore", 0))
        features["away_form_score"] = float(features_json.get("awayFormScore", 0))
        features["form_diff"] = features["home_form_score"] - features["away_form_score"]

        # xG (football)
        features["home_xg"] = float(features_json.get("homeXg", 0))
        features["away_xg"] = float(features_json.get("awayXg", 0))
        features["xg_diff"] = features["home_xg"] - features["away_xg"]
        features["xg_total"] = features["home_xg"] + features["away_xg"]

        # Dixon-Coles
        features["dc_home_win_prob"] = float(features_json.get("dcHomeWinProb", 0))
        features["dc_draw_prob"] = float(features_json.get("dcDrawProb", 0))
        features["dc_away_win_prob"] = float(features_json.get("dcAwayWinProb", 0))

        # Contexte
        features["context_score"] = float(features_json.get("contextScore", 0))
        features["data_quality"] = float(features_json.get("dataQuality", 50))

        # ML legacy
        features["ml_edge"] = float(features_json.get("mlEdge", 0))
        features["ml_confidence"] = float(features_json.get("mlConfidence", 0))

        # Injuries
        features["injury_count"] = float(features_json.get("injuryCount", 0))

        # Net rating (basketball)
        features["home_net_rating"] = float(features_json.get("homeNetRating", 0))
        features["away_net_rating"] = float(features_json.get("awayNetRating", 0))
        features["net_rating_diff"] = features["home_net_rating"] - features["away_net_rating"]

    # === Label (target) ===
    features["result_correct"] = 1 if p.get("result_match") else 0

    # Type de prédiction
    features["predicted_home"] = 1 if p.get("predicted_result") == "home" else 0
    features["predicted_draw"] = 1 if p.get("predicted_result") == "draw" else 0
    features["predicted_away"] = 1 if p.get("predicted_result") == "away" else 0

    # Resultat reel
    actual_result = p.get("actual_result") or ""
    features["actual_home"] = 1 if actual_result == "home" else 0
    features["actual_draw"] = 1 if actual_result == "draw" else 0
    features["actual_away"] = 1 if actual_result == "away" else 0

    # Scores
    features["home_score"] = float(p.get("home_score") or 0)
    features["away_score"] = float(p.get("away_score") or 0)
    features["total_goals"] = features["home_score"] + features["away_score"]

    # Metadata
    features["match_id"] = p.get("match_id", "")
    features["home_team"] = p.get("home_team", "")
    features["away_team"] = p.get("away_team", "")
    features["league"] = p.get("league", "")
    features["sport_raw"] = sport
    features["match_date"] = str(match_date or "")

    return features


def main():
    parser = argparse.ArgumentParser(description="Extraire features depuis Supabase")
    parser.add_argument("--sport", default="all", help="Sport: all, football, basketball, tennis, hockey, baseball")
    parser.add_argument("--output", default="ml_dataset.csv", help="Fichier CSV de sortie")
    parser.add_argument("--days", type=int, default=365, help="Nombre de jours à analyser")
    args = parser.parse_args()

    supabase = get_supabase()

    # Ping
    try:
        supabase.table("predictions").select("id", count="exact").limit(1).execute()
        print("✅ Connexion Supabase OK")
    except Exception as e:
        print(f"❌ Connexion Supabase échouée: {e}")
        sys.exit(1)

    # Fetch data
    predictions = fetch_predictions(supabase, args.sport, args.days)
    if not predictions:
        print("⚠️ Aucune prédiction trouvée")
        sys.exit(0)

    # Extraire features
    print("🔧 Extraction des features...")
    all_features = []
    for p in predictions:
        features = extract_features(p)
        all_features.append(features)

    # Déterminer les colonnes (features uniquement, sans metadata)
    meta_cols = {"match_id", "home_team", "away_team", "league", "sport_raw", "match_date"}
    label_cols = {"result_correct", "actual_home", "actual_draw", "actual_away",
                  "predicted_home", "predicted_draw", "predicted_away",
                  "home_score", "away_score", "total_goals"}
    feature_cols = sorted(set(all_features[0].keys()) - meta_cols - label_cols)

    # Write CSV
    all_cols = feature_cols + sorted(label_cols) + sorted(meta_cols)
    output_path = Path(args.output)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_cols)
        writer.writeheader()
        writer.writerows(all_features)

    print(f"\n📁 Dataset sauvegardé: {output_path}")
    print(f"   {len(all_features)} lignes, {len(feature_cols)} features")
    print(f"   Sports: {set(f['sport_raw'] for f in all_features)}")

    # Stats rapides
    correct = sum(1 for f in all_features if f["result_correct"] == 1)
    print(f"   Win rate global: {correct}/{len(all_features)} = {correct/len(all_features)*100:.1f}%")

    return str(output_path)


if __name__ == "__main__":
    main()
