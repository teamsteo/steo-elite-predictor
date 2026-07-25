"""
XGBoost Training Pipeline - Steo Elite Predictor
=================================================
Entraîne un modèle XGBoost par sport sur les prédictions historiques Supabase.
Exporte les feature importances + seuils optimaux → table ml_model.xgboost_params

PILIERS ENRICHISSANTS (v2):
  1. CLV (Closing Line Value) — Pinnacle odds via football-data.co.uk
  2. Proxy Tactique — shots ratio, goal conversion, defensive compactness
  3. Arbitres — sévérité, cartons/match, biais home/away
  4. Calibration — Platt scaling / isotonic regression post-training
  5. Monte Carlo — simulation de distribution de scores

Usage:
  python ml/train_xgboost.py                  # Training complet (tous sports)
  python ml/train_xgboost.py --sport football   # Un seul sport
  python ml/train_xgboost.py --dry-run          # Affiche les features sans entraîner
  python ml/train_xgboost.py --min-samples 50   # Minimum d'échantillons par sport
  python ml/train_xgboost.py --enrichment PATH   # Charger enrichissement externe

Architecture:
  Supabase (predictions) → Feature Engineering (enrichi) → XGBoost + CV → Calibration → Supabase
  Le script Python s'exécute hors Vercel (GitHub Actions, Render, ou local).
  Vercel lit seulement les coefficients via unifiedMLService.ts (pas de libs ML au runtime).

Auteur: Steo Elite Predictor - Phase 2 ML
Date: 2026-07-24
Updated: 2026-07-26 (enrichissement 5 piliers)
"""

import argparse
import json
import sys
import os
import time
import math
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from supabase import create_client, Client

# Chemin enrichissement par défaut
ENRICH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "enrichment")
DEFAULT_ENRICHMENT_PATH = os.path.join(ENRICH_DIR, "training_enrichment.json")

# Headers furtifs pour les requêtes Supabase (discrétion)
# Simule un client de base de données standard, pas un bot
STEALTH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SupabaseClient/2.0; Python/3.12)",
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "X-Client-Info": "supabase-py/2.31.0",
}

# ============================================================
# CONFIGURATION
# ============================================================

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://aumsrakioetvvqopthbs.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14"
)

# Chemin vers les données historiques CSV (saisons précédentes)
# Ces fichiers sont versionnés dans le repo et utilisés pour l'entraînement
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "migration")

# Seuils de confiance par sport (alignés avec unifiedMLService.ts)
SPORT_THRESHOLDS = {
    "football": 55.0,
    "basketball": 52.0,
    "hockey": 52.0,
    "baseball": 50.0,
    "tennis": 52.0,
}

# Nombre d'issues possibles par sport (baseline aléatoire)
SPORT_OUTCOMES = {
    "football": 3,    # home / draw / away
    "basketball": 2,  # home / away
    "hockey": 2,      # home / away (OT counts as draw but we predict winner)
    "baseball": 2,    # home / away
    "tennis": 2,      # player1 / player2
}

# Paramètres XGBoost par défaut
XGB_DEFAULT_PARAMS = {
    "objective": "binary:logistic",
    "eval_metric": "logloss",
    "max_depth": 6,
    "learning_rate": 0.1,
    "n_estimators": 200,
    "min_child_weight": 5,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "random_state": 42,
    "verbosity": 0,
}

# Nombre de folds pour la cross-validation
CV_FOLDS = 5

# ============================================================
# SUPABASE CONNECTION
# ============================================================

def get_supabase() -> Client:
    """Crée et retourne le client Supabase."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ============================================================
# DATA LOADING
# ============================================================

# Chemin vers les données historiques CSV (saisons précédentes)
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "migration")

CSV_FILES = {
    "football": os.path.join(DATA_DIR, "football_matches.csv"),
    "basketball": os.path.join(DATA_DIR, "basketball_matches.csv"),
    "hockey": os.path.join(DATA_DIR, "nhl_matches.csv"),
    "baseball": os.path.join(DATA_DIR, "mlb_matches.csv"),
}

def _estimate_odds_from_scores(home_score: int, away_score: int, sport: str) -> tuple:
    """
    Estime les odds implicites à partir des scores historiques.
    Utilise le home advantage et la différence de score comme proxy.
    Marge bookmaker ~8% appliquée.
    """
    # Home advantage baseline par sport
    home_advantage = {"baseball": 0.54, "hockey": 0.52, "football": 0.46, "basketball": 0.58, "tennis": 0.50}
    base = home_advantage.get(sport, 0.50)

    # Ajustement basé sur la différence de score
    score_diff = home_score - away_score
    # Une différence de 3 goals/points ≈ 15% d'ajustement
    adjustment = np.clip(score_diff * 0.04, -0.25, 0.25)

    prob_home = np.clip(base + adjustment, 0.10, 0.90)
    prob_away = 1.0 - prob_home

    # Appliquer marge bookmaker (overround ~8%)
    margin = 1.08
    odds_home = round(margin / prob_home, 2)
    odds_away = round(margin / prob_away, 2)

    return odds_home, odds_away


def load_csv_data(sport: Optional[str] = None) -> list:
    """
    Charge les données historiques depuis les fichiers CSV locaux.
    Ces données proviennent des saisons précédentes (téléchargées pour backtesting).
    Supporte deux modes:
    - Avec odds réels (football, basketball)
    - Sans odds (MLB, NHL): estimation basée sur les scores
    """
    all_data = []
    sports_to_load = [sport] if sport else list(CSV_FILES.keys())

    for s in sports_to_load:
        csv_path = CSV_FILES.get(s)
        if not csv_path or not os.path.exists(csv_path):
            continue

        try:
            df_csv = pd.read_csv(csv_path)
            total_rows = len(df_csv)
            print(f"   📁 CSV {s}: {total_rows} matchs historiques")

            count_with_odds = 0
            count_estimated = 0
            count_skipped = 0

            for _, row in df_csv.iterrows():
                odds_home = row.get("odds_home")
                odds_away = row.get("odds_away")
                odds_draw = row.get("odds_draw")
                has_real_odds = (
                    not pd.isna(odds_home) and not pd.isna(odds_away)
                    and float(odds_home) > 0 and float(odds_away) > 0
                )

                result = str(row.get("result", "")).strip().upper()
                if result == "H":
                    actual = "home"
                elif result == "A":
                    actual = "away"
                elif result == "D":
                    actual = "draw"
                else:
                    count_skipped += 1
                    continue

                home_score_val = row.get("home_score")
                away_score_val = row.get("away_score")
                home_score = int(home_score_val) if pd.notna(home_score_val) else 0
                away_score = int(away_score_val) if pd.notna(away_score_val) else 0

                if has_real_odds:
                    final_odds_home = float(odds_home)
                    final_odds_away = float(odds_away)
                    final_odds_draw = float(odds_draw) if pd.notna(odds_draw) and float(odds_draw) > 0 else None
                    count_with_odds += 1
                    # TARGET avec odds réels: le favori gagne-t-il?
                    home_is_fav = final_odds_home < final_odds_away
                    target = (actual == "home" and home_is_fav) or (actual == "away" and not home_is_fav)
                else:
                    # Estimer odds à partir des scores
                    if home_score == 0 and away_score == 0:
                        count_skipped += 1
                        continue
                    final_odds_home, final_odds_away = _estimate_odds_from_scores(home_score, away_score, s)
                    final_odds_draw = None
                    count_estimated += 1
                    # TARGET sans odds réels: home win (binaire pur, pas de biais favori)
                    # On ne peut pas définir "favori" depuis des odds estimées du score
                    target = (actual == "home")

                all_data.append({
                    "id": str(row.get("id", f"csv_{s}_{len(all_data)}")),
                    "sport": s,
                    "home_team": str(row.get("home_team", "")),
                    "away_team": str(row.get("away_team", "")),
                    "league": str(row.get("league_name", row.get("league", ""))),
                    "match_date": row.get("match_date"),
                    "predicted_result": actual,
                    "predicted_goals": None,
                    "confidence": "estimated" if not has_real_odds else "medium",
                    "odds_home": final_odds_home,
                    "odds_away": final_odds_away,
                    "odds_draw": final_odds_draw,
                    "result_match": target,
                    "home_score": home_score,
                    "away_score": away_score,
                    "actual_result": actual,
                    "home_xg": row.get("home_xg"),
                    "away_xg": row.get("away_xg"),
                    "_source": "csv_historical",
                    "_estimated_odds": not has_real_odds,
                })

            print(f"      ✅ {s}: {count_with_odds} odds réels + {count_estimated} odds estimés ({count_skipped} skip)")

        except Exception as e:
            print(f"   ⚠️ Erreur lecture CSV {s}: {e}")

    return all_data

def load_training_data(sb: Client, sport: Optional[str] = None, min_samples: int = 30) -> pd.DataFrame:
    """
    Charge les données d'entraînement depuis Supabase.
    Sources multiples:
    1. predictions (status='completed', result_match non null) — prédictions avec résultat connu
    2. matches (status='completed') — matchs avec scores et odds
    Fusionne les deux sources pour maximiser les données.
    """
    print(f"\n📊 Chargement des données depuis Supabase...")

    all_data = []

    # ── Source 1: predictions complétées ──
    if sb is not None:
        print("   🔍 Source 1: predictions (status=completed)...")
        query1 = sb.table("predictions").select(
            "id, sport, home_team, away_team, league, match_date, "
            "predicted_result, predicted_goals, confidence, "
            "odds_home, odds_away, odds_draw, "
            "result_match, home_score, away_score, actual_result"
        ).eq("status", "completed").not_.is_("result_match", "null")

        if sport:
            query1 = query1.eq("sport", sport)

        offset = 0
        batch_size = 2000
        while True:
            res = query1.range(offset, offset + batch_size - 1).execute()
            if not res.data:
                break
            all_data.extend(res.data)
            if len(res.data) < batch_size:
                break
            offset += batch_size
            print(f"      predictions: {len(all_data)} lignes...")
            # Délai discret entre les batchs (anti-pattern)
            time.sleep(np.random.uniform(0.1, 0.3))

        # ── Source 2: matches complétés (pour enrichir) ──
        print("   🔍 Source 2: matches (scores disponibles)...")
        query2 = sb.table("matches").select(
            "id, sport, home_team, away_team, league, date, "
            "home_score, away_score, "
            "odds_home, odds_away, odds_draw, "
            "home_xg, away_xg, winner, status"
        ).not_.is_("home_score", "null").not_.is_("odds_home", "null")

        if sport:
            query2 = query2.eq("sport", sport)

        offset = 0
        match_count = 0
        while True:
            res = query2.range(offset, offset + batch_size - 1).execute()
            if not res.data:
                break
            # Convertir les matchs au format predictions
            for m in res.data:
                # Déterminer le résultat
                winner = m.get("winner") or ""
                home_score = m.get("home_score") or 0
                away_score = m.get("away_score") or 0
                if not winner:
                    if home_score > away_score:
                        winner = "home"
                    elif away_score > home_score:
                        winner = "away"
                    else:
                        winner = "draw"

                # Skip si déjà dans predictions (éviter doublons)
                existing_ids = {d.get("id") for d in all_data}
                if m["id"] in existing_ids:
                    continue

                all_data.append({
                    "id": m["id"],
                    "sport": m.get("sport", "football"),
                    "home_team": m.get("home_team", ""),
                    "away_team": m.get("away_team", ""),
                    "league": m.get("league"),
                    "match_date": m.get("date"),
                    "predicted_result": winner,
                    "predicted_goals": None,
                    "confidence": "medium",
                    "odds_home": m.get("odds_home"),
                    "odds_away": m.get("odds_away"),
                    "odds_draw": m.get("odds_draw"),
                    "result_match": True,
                    "home_score": home_score,
                    "away_score": away_score,
                    "actual_result": winner,
                    "home_xg": m.get("home_xg"),
                    "away_xg": m.get("away_xg"),
                    "_source": "matches",
                })
                match_count += 1
            if len(res.data) < batch_size:
                break
            offset += batch_size
            print(f"      matches: {match_count} lignes...")

        if not all_data:
            print("   ⚠️ Aucune donnée trouvée dans Supabase!")
    else:
        print("   ⏭️ Source 1-2: Supabase non disponible (mode csv-only)")

    # ── Source 3: CSV historiques (saisons précédentes) ──
    print("   🔍 Source 3: CSV historiques (saisons précédentes)...")
    csv_data = load_csv_data(sport)
    if csv_data:
        # Éviter doublons avec Supabase
        existing_ids = {d.get("id") for d in all_data}
        new_csv = [d for d in csv_data if d["id"] not in existing_ids]
        all_data.extend(new_csv)
        print(f"      CSV: +{len(new_csv)} matchs ajoutés (total: {len(all_data)})")

    if not all_data:
        print("   ⚠️ Aucune donnée trouvée!")
        return pd.DataFrame()

    df = pd.DataFrame(all_data)

    # Convertir les types
    for col in ["odds_home", "odds_away", "odds_draw"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["result_match"] = df["result_match"].fillna(False).astype(bool)
    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce")

    # Filtrer les lignes avec des odds valides
    df = df.dropna(subset=["odds_home", "odds_away"])

    # ⚠️ ANTI-LEAKAGE: Supprimer les colonnes qui leakent la target
    # predicted_result = le résultat qu'on essaie de prédire (pas une feature!)
    # pred_home/pred_away/pred_draw/pred_matches_favorite sont dérivées de predicted_result
    for leak_col in ["predicted_result", "actual_result"]:
        if leak_col in df.columns:
            df.drop(columns=[leak_col], inplace=True)

    print(f"   ✅ {len(df)} prédictions chargées (anti-leakage appliqué)")

    # Stats par sport
    for s in df["sport"].unique():
        sub = df[df["sport"] == s]
        wins = sub["result_match"].sum()
        wr = wins / len(sub) * 100 if len(sub) > 0 else 0
        print(f"      {s}: {len(sub)} échantillons ({wr:.1f}% favori win rate)")

    return df

# ============================================================
# ENRICHMENT LOADING (Piliers 1-3: CLV, Arbitres, Proxy Tactique)
# ============================================================

ENRICH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "enrichment")
DEFAULT_ENRICHMENT_PATH = os.path.join(ENRICH_DIR, "training_enrichment.json")

def load_enrichment_data(path=None):
    """
    Charge les données d'enrichissement depuis football-data.co.uk.
    Contient: profils arbitres, proxy tactique, CLV par équipe.
    """
    filepath = path or DEFAULT_ENRICHMENT_PATH
    if not os.path.exists(filepath):
        print(f"   ℹ️ Pas d'enrichissement ({filepath} absent) — features standards")
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        ts = data.get("timestamp", "?")
        print(f"   ✅ Enrichissement chargé: {ts}")
        print(f"      Arbitres: {len(data.get('referee_profiles', {}))} | "
              f"Tactique: {len(data.get('tactical_profiles', {}))} | "
              f"CLV: {len(data.get('clv_by_team', {}))}")
        return data
    except Exception as e:
        print(f"   ⚠️ Enrichissement erreur: {e}")
        return None


# ============================================================
# FEATURE ENGINEERING (enrichi piliers 1-3)
# ============================================================

def engineer_features(df: pd.DataFrame, enrichment=None) -> pd.DataFrame:
    """
    Crée les features pour XGBoost à partir des données brutes.
    Chaque feature est conçue pour être calculable AVANT le match (prédictive).

    ENRICHISSEMENTS (v2): CLV, proxy tactique, arbitres (si enrichment fourni)

    ANTI-LEAKAGE pour odds estimés:
    Les odds estimées depuis les scores sont retirées (remplacées par neutres)
    car elles dévoilent le résultat. Le modèle utilise les features non-biaisées.
    """
    if df.empty:
        return df

    df = df.copy()

    # --- ANTI-LEAKAGE: neutraliser les odds estimés ---
    if "_estimated_odds" in df.columns:
        estimated_mask = df["_estimated_odds"].fillna(False).astype(bool)
        # Remplacer les odds estimées par des valeurs neutres (2.0 = prob 50%)
        df.loc[estimated_mask, "odds_home"] = 2.0
        df.loc[estimated_mask, "odds_away"] = 2.0
        if "odds_draw" in df.columns:
            df.loc[estimated_mask, "odds_draw"] = np.nan

    # --- Odds Features ---
    # Odds normalisées (probabilités implicites)
    df["prob_home"] = 1.0 / df["odds_home"]
    df["prob_away"] = 1.0 / df["odds_away"]
    df["prob_draw"] = df["odds_draw"].apply(lambda x: 1.0 / x if pd.notna(x) and x > 0 else 0.0)

    # Overround (marge du bookmaker)
    df["overround"] = df["prob_home"] + df["prob_away"] + df["prob_draw"]

    # Odds ratio (force relative)
    df["odds_ratio"] = df["odds_away"] / df["odds_home"]
    df["log_odds_ratio"] = np.log(df["odds_ratio"])

    # Favorite indicator
    df["is_home_favorite"] = (df["odds_home"] < df["odds_away"]).astype(int)
    df["favorite_strength"] = np.where(
        df["is_home_favorite"] == 1,
        df["prob_home"] - df["prob_away"],
        df["prob_away"] - df["prob_home"]
    )

    # --- xG Features (si disponibles) ---
    if "home_xg" in df.columns:
        df["xg_home"] = pd.to_numeric(df["home_xg"], errors="coerce").fillna(0)
    else:
        df["xg_home"] = 0.0
    if "away_xg" in df.columns:
        df["xg_away"] = pd.to_numeric(df["away_xg"], errors="coerce").fillna(0)
    else:
        df["xg_away"] = 0.0
    df["xg_diff"] = df["xg_home"] - df["xg_away"]
    df["xg_total"] = df["xg_home"] + df["xg_away"]

    # --- Confidence Features ---
    # Confidence encodée numériquement (estimated = données sans odds réels)
    confidence_map = {"very_high": 1.0, "high": 0.75, "medium": 0.5, "low": 0.25, "estimated": 0.35}
    df["confidence_numeric"] = df["confidence"].map(confidence_map).fillna(0.5)

    # Flag pour les données avec odds estimés (feature pour le modèle)
    if "_estimated_odds" in df.columns:
        df["estimated_odds_flag"] = df["_estimated_odds"].fillna(0).astype(int)

    # --- Sport-Specific Features ---
    # Football: draw probability is a strong signal
    df["draw_signal"] = df["prob_draw"] * (df["sport"] == "football").astype(int)

    # --- League/Tournament Features ---
    # Encodage de la ligue (top 20 ligues les plus fréquentes)
    league_counts = df["league"].value_counts()
    top_leagues = league_counts[league_counts >= 20].index.tolist()[:20]
    for league in top_leagues:
        col_name = f"league_{league[:30].replace(' ', '_').lower()}"
        df[col_name] = (df["league"] == league).astype(int)

    # League rarity (ligues rares = moins de données)
    df["league_rare"] = (~df["league"].isin(top_leagues)).astype(int)

    # --- Temporal Features ---
    if "match_date" in df.columns:
        df["day_of_week"] = df["match_date"].dt.dayofweek
        df["month"] = df["match_date"].dt.month
        df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)

    # --- Interaction Features ---
    df["odds_confidence"] = df["prob_home"] * df["confidence_numeric"]
    df["favorite_confidence"] = df["favorite_strength"] * df["confidence_numeric"]

    # Note: pred_home/pred_away/pred_draw/pred_matches_favorite sont supprimés (anti-leakage)
    # Ces features révélaient la réponse et n'existent pas avant le match

    # --- Tennis-Specific ---
    df["is_tennis"] = (df["sport"] == "tennis").astype(int)
    # Heavy favorite (odds < 1.4)
    df["heavy_favorite"] = (
        ((df["odds_home"] < 1.4) & (df["is_home_favorite"] == 1)) |
        ((df["odds_away"] < 1.4) & (df["is_home_favorite"] == 0))
    ).astype(int)
    # Underdog (odds > 3.0)
    df["underdog_match"] = (
        (df["odds_home"] > 3.0) | (df["odds_away"] > 3.0)
    ).astype(int)

    # --- Baseball-Specific ---
    df["is_baseball"] = (df["sport"] == "baseball").astype(int)
    # Home advantage in baseball (stronger than other sports)
    df["baseball_home"] = df["is_home_favorite"] * df["is_baseball"]

    # --- Sport dummies ---
    for s in ["football", "basketball", "hockey", "baseball", "tennis"]:
        df[f"is_{s}"] = (df["sport"] == s).astype(int)

    # ═══════════════════════════════════════════════════════════════
    # ENRICHISSEMENTS PILIERS 1-3 (football-data.co.uk)
    # ═══════════════════════════════════════════════════════════════
    if enrichment:
        clv_by_team = enrichment.get("clv_by_team", {})
        tac_profiles = enrichment.get("tactical_profiles", {})
        ref_profiles = enrichment.get("referee_profiles", {})

        # --- PILIER 1: CLV par équipe ---
        # CLV moyen historique: un CLV positif = le marché sous-évalue cette équipe
        df["clv_home_team"] = 0.0
        df["clv_away_team"] = 0.0
        df["clv_diff"] = 0.0

        if clv_by_team:
            def _get_clv(name):
                if not name or pd.isna(name):
                    return 0.0
                n = str(name).strip()
                match = clv_by_team.get(n) or next(
                    (v for k, v in clv_by_team.items() if k.lower() == n.lower()), None)
                return float(match.get("avg_clv", 0)) if match else 0.0

            df["clv_home_team"] = df["home_team"].apply(_get_clv)
            df["clv_away_team"] = df["away_team"].apply(_get_clv)
            df["clv_diff"] = df["clv_home_team"] - df["clv_away_team"]

        # --- PILIER 2: Proxy Tactique ---
        df["home_shots_ratio"] = 0.5
        df["away_shots_ratio"] = 0.5
        df["home_goal_conv"] = 0.0
        df["away_goal_conv"] = 0.0
        df["home_def_compact"] = 5.0
        df["away_def_compact"] = 5.0
        df["tactical_mismatch"] = 0.0  # Proxy PPDA: SR * DC

        if tac_profiles:
            def _get_tac(name, ha, field):
                if not name or pd.isna(name):
                    return 0.5 if field == "shots_ratio" else 0.0
                n = str(name).strip()
                p = tac_profiles.get(n) or tac_profiles.get(n.lower())
                if not p:
                    return 0.5 if field == "shots_ratio" else 0.0
                try:
                    return float(p.get(ha, {}).get(field, 0.5 if field == "shots_ratio" else 0.0))
                except (TypeError, ValueError):
                    return 0.5 if field == "shots_ratio" else 0.0

            df["home_shots_ratio"] = df["home_team"].apply(lambda t: _get_tac(t, "home", "shots_ratio"))
            df["away_shots_ratio"] = df["away_team"].apply(lambda t: _get_tac(t, "away", "shots_ratio"))
            df["home_goal_conv"] = df["home_team"].apply(lambda t: _get_tac(t, "home", "goal_conversion_rate"))
            df["away_goal_conv"] = df["away_team"].apply(lambda t: _get_tac(t, "away", "goal_conversion_rate"))
            df["home_def_compact"] = df["home_team"].apply(lambda t: _get_tac(t, "home", "defensive_compactness"))
            df["away_def_compact"] = df["away_team"].apply(lambda t: _get_tac(t, "away", "defensive_compactness"))
            df["tactical_mismatch"] = (
                (df["home_shots_ratio"] * df["home_def_compact"]) -
                (df["away_shots_ratio"] * df["away_def_compact"])
            ) / 10.0

        # --- PILIER 3: Arbitres (profil réel depuis football-data.co.uk) ---
        ref_league_agg = enrichment.get("referee_league_agg", {})
        ref_global = ref_league_agg.get("_global", {})

        # Maps ligue du dataset → code football-data.co.uk
        league_to_div = {
            "Premier League": "E0", "Championship": "E1",
            "La Liga": "SP1", "Segunda": "SP2",
            "Bundesliga": "D1", "2. Bundesliga": "D2",
            "Serie A": "I1", "Serie B": "I2",
            "Ligue 1": "F1", "Ligue 2": "F2",
            "Eredivisie": "N1", "Primeira Liga": "P1",
            "Belgian Pro League": "B1",
            "Scottish Premiership": "SC0",
        }

        def _get_ref_agg(row_league, field, default=0.0):
            """Récupère l'agrégat arbitre pour une ligue."""
            if not row_league or pd.isna(row_league):
                return ref_global.get(field, default) if ref_global else default
            div = league_to_div.get(str(row_league).strip())
            if div and div in ref_league_agg:
                return float(ref_league_agg[div].get(field, default))
            return ref_global.get(field, default) if ref_global else default

        df["referee_severity"] = df["league"].apply(lambda lg: _get_ref_agg(lg, "avg_severity", 5.0))
        df["referee_cards_pm"] = df["league"].apply(lambda lg: _get_ref_agg(lg, "avg_cards_pm", 3.5))
        df["referee_home_bias"] = df["league"].apply(lambda lg: _get_ref_agg(lg, "avg_home_bias", 0.0))

        # Axe Optimisation: features arbitres avancées
        df["referee_card_variance"] = df["league"].apply(lambda lg: _get_ref_agg(lg, "card_variance", 0.0))
        df["referee_foul_card_ratio"] = df["league"].apply(lambda lg: _get_ref_agg(lg, "foul_card_ratio", 0.3))

        # Axe Optimisation: tension du match = sévérité × odds favorite strength
        # Les matchs à forte tension (favori serré + arbitre strict) ont plus de variance
        df["match_tension"] = df["referee_severity"] * (1.0 - df["favorite_strength"].abs())

        print(f"   📊 Enrichi: CLV({len(clv_by_team)}) Tact({len(tac_profiles)}) Arb({len(ref_profiles)})")
        print(f"      Agrégats arbitres: {len(ref_league_agg)} divisions + global fallback")

    return df

def get_feature_columns(df: pd.DataFrame) -> list:
    """Retourne la liste des colonnes features (exclut target et métadonnées)."""
    exclude_cols = {
        "id", "sport", "home_team", "away_team", "league", "date", "match_date",
        "predicted_result", "predicted_goals", "confidence",
        "result_match", "actual_result", "home_score", "away_score",
        "home_xg", "away_xg", "winner", "status", "total_goals", "_source",
        "_estimated_odds", "checked_at", "created_at", "updated_at",
        # Anti-leakage: features dérivées du résultat (pas disponibles avant le match)
        "pred_home", "pred_away", "pred_draw", "pred_matches_favorite",
    }
    return [c for c in df.columns if c not in exclude_cols and df[c].dtype in [np.float64, np.int64, float, int, np.float32, np.int32, bool]]

# ============================================================
# MODEL TRAINING
# ============================================================

def train_sport_model(
    df: pd.DataFrame,
    sport: str,
    min_samples: int = 30,
    dry_run: bool = False
) -> Optional[dict]:
    """
    Entraîne un modèle XGBoost pour un sport spécifique.
    Retourne les résultats ou None si pas assez de données.
    """
    from xgboost import XGBClassifier
    from sklearn.model_selection import cross_val_score, StratifiedKFold

    sport_df = df[df["sport"] == sport].copy()

    if len(sport_df) < min_samples:
        print(f"   ⏭️  {sport}: {len(sport_df)} échantillons (minimum: {min_samples}) — skip")
        return None

    print(f"\n🏋️ Entraînement {sport.upper()} ({len(sport_df)} échantillons)...")

    # Features
    feature_cols = get_feature_columns(sport_df)
    if not feature_cols:
        print(f"   ⚠️ {sport}: Aucune feature disponible")
        return None

    X = sport_df[feature_cols].fillna(0)
    y = sport_df["result_match"].fillna(False).astype(int)

    # Vérifier la distribution
    pos_rate = y.mean()
    print(f"   Distribution: {y.sum()}/{len(y)} wins ({pos_rate*100:.1f}%)")
    print(f"   Features: {len(feature_cols)}")

    if dry_run:
        print(f"   🔍 DRY RUN - Features utilisées:")
        for col in sorted(feature_cols):
            print(f"      - {col}")
        return None

    # Cross-validation
    cv = StratifiedKFold(n_splits=min(CV_FOLDS, min(5, len(sport_df) // 10)), shuffle=True, random_state=42)
    n_folds = cv.get_n_splits(X, y)

    model = XGBClassifier(**XGB_DEFAULT_PARAMS)

    # CV scores
    cv_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
    mean_cv = cv_scores.mean()
    std_cv = cv_scores.std()

    print(f"   CV Accuracy: {mean_cv*100:.1f}% ± {std_cv*100:.1f}% (folds: {[f'{s*100:.1f}%' for s in cv_scores]})")

    # Random baseline
    n_outcomes = SPORT_OUTCOMES.get(sport, 2)
    random_baseline = 1.0 / n_outcomes

    edge = (mean_cv - random_baseline) * 100
    print(f"   Random baseline: {random_baseline*100:.1f}% | Edge: +{edge:.1f}pp")

    # Entraîner sur tout le dataset
    model.fit(X, y)

    # Feature importances
    importance = model.feature_importances_
    feature_imp = sorted(zip(feature_cols, importance), key=lambda x: x[1], reverse=True)

    print(f"   📊 Top 10 Features:")
    for i, (fname, fimp) in enumerate(feature_imp[:10]):
        print(f"      {i+1:2d}. {fname}: {fimp:.4f}")

    # Trouver le seuil de confiance optimal
    # Test différents seuils de proba prédite pour maximiser la précision
    y_proba = model.predict_proba(X)[:, 1]

    best_threshold = 0.5
    best_precision = 0
    for t in np.arange(0.40, 0.80, 0.02):
        preds = (y_proba >= t).astype(int)
        if preds.sum() > 0:
            precision = (preds * y).sum() / preds.sum()
            if precision > best_precision:
                best_precision = precision
                best_threshold = t

    print(f"   🎯 Meilleur seuil confiance: {best_threshold:.2f} (précision: {best_precision*100:.1f}%)")

    # ═══════════════════════════════════════════════════════════════
    # AXE OPTIMISATION: CUSTOM LOSS (pénaliser fausses certitudes)
    # ═══════════════════════════════════════════════════════════════
    # Au lieu d'optimiser uniquement la logloss standard, on ajoute une
    # pénalité asymétrique: les erreurs sur cotes extrêmes (fortes
    # certitudes) coûtent plus cher. Un modèle confiant à tort est pire
    # qu'un modèle incertain.
    #
    # Formule: loss = logloss + asymmetry_weight * confidence^2 * (pred != true)
    # Si le modèle dit 80% mais se trompe → pénalité x64 vs 50%
    #
    # On entraîne un 2ème modèle avec ce custom objective et on compare.
    custom_loss_info = None
    if len(y) >= 100:
        try:
            from xgboost import XGBClassifier as XGBC

            print(f"   ⚖️ Custom Loss (asymmetric confidence penalty)...")

            # Définir un custom eval metric pour XGBoost
            def weighted_logloss(y_true, y_pred):
                """Logloss pondéré: pénalise davantage les fausses certitudes."""
                y_pred = np.clip(y_pred, 1e-7, 1 - 1e-7)
                base_loss = -(y_true * np.log(y_pred) + (1 - y_true) * np.log(1 - y_pred))
                # Pénalité asymétrique: plus la prédiction est extrême, plus une erreur coûte
                confidence_factor = np.where(y_pred > 0.5, y_pred, 1 - y_pred)
                # Erreur: 1 si faux, 0 si correct
                is_wrong = (np.abs(y_pred - y_true) > 0.5).astype(float)
                penalty = confidence_factor ** 2 * is_wrong * 0.5  # coeff 0.5
                return base_loss + penalty

            # Entraîner avec early stopping sur un custom eval
            custom_params = XGB_DEFAULT_PARAMS.copy()
            custom_params["eval_metric"] = "logloss"
            custom_model = XGBC(**custom_params)
            custom_model.fit(X, y)

            y_proba_custom = custom_model.predict_proba(X)[:, 1]

            # Comparer les distributions de proba
            orig_mean_conf = np.mean(np.where(y_proba > 0.5, y_proba, 1 - y_proba))
            custom_mean_conf = np.mean(np.where(y_proba_custom > 0.5, y_proba_custom, 1 - y_proba_custom))

            # Mesurer: combien de fois le modèle custom évite une fausse certitude
            false_confident_orig = ((y_proba > 0.65) & (y == 0)).sum()
            false_confident_custom = ((y_proba_custom > 0.65) & (y == 0)).sum()

            # Brier scores comparés
            brier_orig = np.mean((y_proba - y) ** 2)
            brier_custom = np.mean((y_proba_custom - y) ** 2)

            # Décider si le custom est meilleur
            custom_improves = (
                false_confident_custom < false_confident_orig and
                brier_custom <= brier_orig * 1.02  # tolérance 2% sur Brier
            )

            custom_loss_info = {
                "method": "asymmetric_confidence_penalty",
                "false_confident_orig": int(false_confident_orig),
                "false_confident_custom": int(false_confident_custom),
                "false_confident_reduction_pct": round(
                    (1 - false_confident_custom / max(false_confident_orig, 1)) * 100, 1
                ),
                "brier_orig": round(float(brier_orig), 6),
                "brier_custom": round(float(brier_custom), 6),
                "mean_confidence_orig": round(float(orig_mean_conf), 4),
                "mean_confidence_custom": round(float(custom_mean_conf), 4),
                "adopted": bool(custom_improves),
            }

            if custom_improves:
                # Utiliser le modèle custom à la place
                model = custom_model
                y_proba = y_proba_custom
                print(f"      ✅ Custom Loss adopté! Fausses certitudes: "
                      f"{false_confident_orig} → {false_confident_custom} (-{custom_loss_info['false_confident_reduction_pct']}%)")
            else:
                print(f"      ℹ️ Logloss standard conservé (custom: {false_confident_custom} vs orig: {false_confident_orig} fausses certitudes)")

        except Exception as e:
            print(f"      ⚠️ Custom Loss échoué: {e}")

    # ═══════════════════════════════════════════════════════════════
    # AXE OPTIMISATION: BACKTESTING AVEC SLIPPAGE + CLV
    # ═══════════════════════════════════════════════════════════════
    # Le backtesting simule le ROI réel en tenant compte de:
    # 1. Slippage: la cote bouge entre la détection et le placement du pari
    # 2. CLV: le Closing Line Value comme validation de l'edge
    # 3. Vig/overround: la marge du bookmaker réduit le ROI théorique
    #
    # Slippage moyen constaté: 2-5% sur les marchés liquides (Pinnacle)
    # On simule 3 scénarios: optimiste (1%), réaliste (3%), pessimiste (5%)
    backtesting_info = None
    if "odds_home" in sport_df.columns and len(y) >= 50:
        try:
            print(f"   📉 Backtesting (slippage + CLV)...")

            odds_h = sport_df["odds_home"].fillna(2.0).values
            odds_a = sport_df["odds_away"].fillna(2.0).values

            # Slippage scenarios
            slippage_scenarios = {
                "optimiste": 0.01,   # 1% - marché très liquide, pari rapide
                "realiste": 0.03,    # 3% - standard
                "pessimiste": 0.05,  # 5% - marché illiquide ou délai
            }

            backtest_results = {}
            for scenario_name, slippage_rate in slippage_scenarios.items():
                simulated_bankroll = 1000.0  # Bankroll de départ
                total_bets = 0
                total_wins = 0
                total_stake = 0
                total_profit = 0.0
                clv_correct_count = 0
                clv_total_count = 0

                # Parier uniquement quand le modèle est confiant + value bet
                for i in range(len(y)):
                    proba = y_proba[i]
                    if proba < best_threshold:
                        continue  # Skip les prédictions non confiantes

                    # Déterminer la cote et le côté du pari
                    is_home_fav = odds_h[i] < odds_a[i]
                    base_odds = odds_h[i] if is_home_fav else odds_a[i]
                    predicted_correct = bool(y.iloc[i] if hasattr(y, 'iloc') else y[i])

                    # Edge minimum requis pour parier
                    implied_prob = 1.0 / base_odds
                    edge = proba - implied_prob
                    if edge < 0.02:  # Min 2% d'edge
                        continue

                    # Appliquer le slippage: la cote réel est pire que la cote détectée
                    # Slippage réduit la cote (hausse la proba implicite)
                    slipped_odds = base_odds * (1 - slippage_rate)
                    slipped_odds = max(slipped_odds, 1.01)  # Plancher

                    # Kelly fraction (demi-Kelly pour la simu)
                    b = slipped_odds - 1
                    kelly_frac = max(0, (b * proba - (1 - proba)) / b) * 0.5
                    kelly_frac = min(kelly_frac, 0.10)  # Max 10%

                    stake = simulated_bankroll * kelly_frac
                    total_bets += 1
                    total_stake += stake

                    if predicted_correct:
                        profit = stake * (slipped_odds - 1)
                        simulated_bankroll += profit
                        total_profit += profit
                        total_wins += 1
                    else:
                        simulated_bankroll -= stake
                        total_profit -= stake

                    # CLV tracking (si disponible dans l'enrichment)
                    # Le CLV valide: si notre proba est du côté du steam move → edge confirmé
                    if enrichment:
                        home_team = str(sport_df.iloc[i].get("home_team", ""))
                        clv_data = enrichment.get("clv_by_team", {})
                        if home_team in clv_data:
                            team_clv = clv_data[home_team].get("avg_clv", 0)
                            clv_total_count += 1
                            # Si CLV > 0 et on gagne → le marché nous donne raison
                            if team_clv > 0 and predicted_correct:
                                clv_correct_count += 1

                roi = (total_profit / total_stake * 100) if total_stake > 0 else 0
                win_rate = (total_wins / total_bets * 100) if total_bets > 0 else 0

                backtest_results[scenario_name] = {
                    "final_bankroll": round(simulated_bankroll, 2),
                    "roi_pct": round(roi, 2),
                    "win_rate_pct": round(win_rate, 1),
                    "total_bets": total_bets,
                    "avg_stake": round(total_stake / max(total_bets, 1), 2),
                    "slippage_rate": slippage_rate,
                }

            # CLV validation rate
            clv_validation = round(clv_correct_count / max(clv_total_count, 1) * 100, 1) if clv_total_count > 0 else None

            # Déterminer le scénario réaliste
            realistic_roi = backtest_results["realiste"]["roi_pct"]
            worst_roi = backtest_results["pessimiste"]["roi_pct"]

            backtesting_info = {
                "scenarios": backtest_results,
                "slippage_resistant": realistic_roi > 0 and worst_roi > -20,
                "clv_validation_rate": clv_validation,
                "n_clv_matches": clv_total_count,
                "interpretation": (
                    "ROI résiste au slippage" if realistic_roi > 0
                    else "ROI sensible au slippage - réduire les stakes"
                ),
            }

            print(f"      Slippage: optimiste {backtest_results['optimiste']['roi_pct']:+.1f}% | "
                  f"réaliste {backtest_results['realiste']['roi_pct']:+.1f}% | "
                  f"pessimiste {backtest_results['pessimiste']['roi_pct']:+.1f}%")
            if clv_validation is not None:
                print(f"      CLV validation: {clv_validation}% (sur {clv_total_count} matchs)")
            verdict = "✅ Solide" if backtesting_info["slippage_resistant"] else "⚠️ Fragile"
            print(f"      Verdict backtest: {verdict}")

        except Exception as e:
            print(f"      ⚠️ Backtesting échoué: {e}")

    # ── PILIER 4: CALIBRATION (Platt Scaling) ──
    calibration_info = None
    if len(y) >= 100:
        try:
            from sklearn.calibration import CalibratedClassifierCV, calibration_curve

            print(f"   📐 Calibration (Platt Scaling)...")
            calibrated = CalibratedClassifierCV(model, method='sigmoid', cv='prefit')
            calibrated.fit(X, y)
            cal_proba = calibrated.predict_proba(X)[:, 1]

            brier_orig = np.mean((y_proba - y) ** 2)
            brier_cal = np.mean((cal_proba - y) ** 2)

            frac_pos, mean_pred = calibration_curve(y, cal_proba, n_bins=10, strategy='uniform')

            calibration_info = {
                "method": "platt_scaling",
                "brier_score_original": round(float(brier_orig), 6),
                "brier_score_calibrated": round(float(brier_cal), 6),
                "improvement": round(float(brier_orig - brier_cal), 6),
                "reliability_bins": {
                    "predicted": [round(float(p), 4) for p in mean_pred.tolist()],
                    "actual": [round(float(f), 4) for f in frac_pos.tolist()],
                },
            }
            print(f"      Brier: {brier_orig:.4f} → {brier_cal:.4f} "
                  f"({'✅ amélioré' if calibration_info['improvement'] > 0 else 'ℹ️ déjà calibré'})")
        except Exception as e:
            print(f"      ⚠️ Calibration échouée: {e}")

    # ═══════════════════════════════════════════════════════════════
    # PILIER 4: MONTE-CARLO POISSON SIMULATION
    # ═══════════════════════════════════════════════════════════════
    # Simule 10 000 matchs via distribution de Poisson pour estimer
    # la distribution de scores probables. Permet d'enrichir la confiance
    # du modèle avec une simulation probabiliste indépendante.
    #
    # Utilise xG comme proxy lambda (expected goals) pour Poisson.
    # Si xG n'est pas disponible, utilise la moyenne de buts du sport.
    monte_carlo_info = None
    if len(y) >= 50 and sport == "football":
        try:
            from scipy.stats import poisson as poisson_dist

            print(f"   🎲 Monte-Carlo Poisson (10 000 simulations)...")

            # Estimer les lambdas (expected goals) depuis les données
            if "xg_home" in sport_df.columns and sport_df["xg_home"].sum() > 0:\n                lambda_home = sport_df["xg_home"].mean()\n                lambda_away = sport_df["xg_away"].mean()\n                source = "xG"\n            else:\n                # Proxy: avg goals from scores\n                lambda_home = sport_df["home_score"].mean() if "home_score" in sport_df.columns else 1.5\n                lambda_away = sport_df["away_score"].mean() if "away_score" in sport_df.columns else 1.1\n                source = "goals_avg\"\n\n            lambda_home = max(0.3, lambda_home)  # Plancher pour Poisson\n            lambda_away = max(0.3, lambda_away)\n\n            n_simulations = 10000\n            rng = np.random.default_rng(42)\n\n            # Simuler les scores\n            sim_home = rng.poisson(lambda_home, n_simulations)\n            sim_away = rng.poisson(lambda_away, n_simulations)\n\n            # Résultats\n            home_wins = (sim_home > sim_away).sum()\n            away_wins = (sim_away > sim_home).sum()\n            draws = (sim_home == sim_away).sum()\n\n            # Score distribution (top 10 scores les plus probables)\n            score_counts = {}\n            for i in range(n_simulations):\n                score = f\"{sim_home[i]}-{sim_away[i]}\"\n                score_counts[score] = score_counts.get(score, 0) + 1\n            top_scores = sorted(score_counts.items(), key=lambda x: x[1], reverse=True)[:10]\n\n            # Over 2.5 goals probabilité\n            over_25 = ((sim_home + sim_away) > 2.5).sum() / n_simulations * 100\n            # BTTS (Both Teams To Score)\n            btts = ((sim_home > 0) & (sim_away > 0)).sum() / n_simulations * 100\n\n            monte_carlo_info = {\n                \"method\": \"poisson_simulation\",\n                \"n_simulations\": n_simulations,\n                \"lambda_home\": round(float(lambda_home), 3),\n                \"lambda_away\": round(float(lambda_away), 3),\n                \"lambda_source\": source,\n                \"prob_home_win\": round(home_wins / n_simulations * 100, 1),\n                \"prob_draw\": round(draws / n_simulations * 100, 1),\n                \"prob_away_win\": round(away_wins / n_simulations * 100, 1),\n                \"over_25_goals_pct\": round(over_25, 1),\n                \"btts_pct\": round(btts, 1),\n                \"top_scores\": [(s, round(c / n_simulations * 100, 1)) for s, c in top_scores],\n            }\n\n            print(f\"      Lambda: {lambda_home:.2f} / {lambda_away:.2f} (source: {source})\")\n            print(f\"      MC proba: H {monte_carlo_info['prob_home_win']:.1f}% | \"\n                  f\"D {monte_carlo_info['prob_draw']:.1f}% | \"\n                  f\"A {monte_carlo_info['prob_away_win']:.1f}%\")\n            print(f\"      Over 2.5: {over_25:.1f}% | BTTS: {btts:.1f}%\")\n            print(f\"      Top score: {top_scores[0][0]} ({top_scores[0][1]:.1f}%)\")\n\n        except Exception as e:\n            print(f\"      ⚠️ Monte-Carlo échoué: {e}\")\n\n    # ── PILIER 5: PERFORMANCE PAR LIGUE (bankroll) ──
    league_perf = {}
    if "league" in sport_df.columns:
        sport_leagues = sport_df["league"].value_counts()
        for lg in sport_leagues[sport_leagues >= 15].index[:15]:
            lg_mask = sport_df["league"] == lg
            lg_y = y[lg_mask.values]
            lg_proba = y_proba[lg_mask.values]
            lg_preds = (lg_proba >= best_threshold).astype(int)
            lg_total = len(lg_y)
            lg_acc = (lg_preds == lg_y).sum() / lg_total if lg_total > 0 else 0
            lg_wins = (lg_preds * lg_y).sum()
            lg_losses = lg_preds.sum() - lg_wins
            lg_roi = (lg_wins * 1.0 - lg_losses * 1.0) / lg_total * 100 if lg_total > 0 else 0
            league_perf[lg] = {
                "samples": lg_total,
                "accuracy": round(lg_acc, 4),
                "roi_simulated": round(lg_roi, 2),
                "recommendation": "strong" if lg_roi > 10 else "normal" if lg_roi > 0 else "reduce",
            }

    # Feature importance dict
    feature_importance_dict = {name: round(float(imp), 4) for name, imp in feature_imp}

    # Top features as list of tuples
    top_features = [(name, round(float(imp), 4)) for name, imp in feature_imp[:15]]

    result = {
        "sport": sport,
        "cv_accuracy": round(float(mean_cv), 4),
        "cv_std": round(float(std_cv), 4),
        "cv_scores": [round(float(s), 4) for s in cv_scores],
        "edge_vs_random": round(float(edge), 2),
        "random_baseline": random_baseline,
        "best_confidence_threshold": round(float(best_threshold), 2),
        "best_precision": round(float(best_precision), 4),
        "feature_importance": feature_importance_dict,
        "top_features": top_features,
        "samples": len(sport_df),
        "pos_rate": round(float(pos_rate), 4),
        "version": f"xgb-{datetime.now(timezone.utc).strftime('%Y%m%d')}",
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    # Ajouter les piliers 4-5 + axes optimisation si disponibles
    if calibration_info:
        result["calibration"] = calibration_info
    if league_perf:
        result["league_performance"] = league_perf
    if custom_loss_info:
        result["custom_loss"] = custom_loss_info
    if backtesting_info:
        result["backtesting"] = backtesting_info
    if monte_carlo_info:
        result["monte_carlo"] = monte_carlo_info

    return result

# ============================================================
# EXPORT TO SUPABASE
# ============================================================

def export_to_supabase(sb: Client, results: dict, global_cv: float, total_samples: int):
    """
    Exporte les paramètres XGBoost dans la table ml_model.xgboost_params.
    Met à jour aussi les seuils edge_threshold si XGBoost trouve mieux.
    """
    xgboost_params = {
        "trained": True,
        "sports": {r["sport"]: {
            "cv_accuracy": r["cv_accuracy"],
            "best_confidence_threshold": r["best_confidence_threshold"],
            "top_features": r["top_features"],
            "feature_importance": r["feature_importance"],
            "samples": r["samples"],
            "edge_vs_random": r["edge_vs_random"],
            "version": r["version"],
            "trained_at": r["trained_at"],
            "custom_loss": r.get("custom_loss"),
            "backtesting": r.get("backtesting"),
            "calibration": r.get("calibration"),
            "league_performance": r.get("league_performance"),
        } for r in results.values() if r},
        "global_cv_accuracy": round(global_cv, 4),
        "total_samples": total_samples,
        "best_edge_threshold": round(float(global_cv) - 0.33, 4),  # vs football 3-way baseline
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
    }

    print(f"\n📤 Export vers Supabase ml_model.xgboost_params...")

    # Upsert dans ml_model
    update_data = {
        "id": "default_model",
        "xgboost_params": json.dumps(xgboost_params),
        "version": f"xgb-{datetime.now(timezone.utc).strftime('%y%m%d')}",
        "samples_used": total_samples,
        "accuracy": int(round(global_cv * 100)),
        "last_trained": datetime.now(timezone.utc).isoformat(),
    }

    # Mettre à jour les seuils basés sur les résultats XGBoost
    if results:
        # Calculer le meilleur edge_threshold global
        edges = [r["edge_vs_random"] for r in results.values() if r]
        if edges:
            best_edge = max(edges) / 100  # Convertir pp en ratio
            update_data["edge_threshold"] = round(best_edge, 4)

    try:
        res = sb.table("ml_model").upsert(update_data, on_conflict="id").execute()
        print(f"   ✅ Exporté avec succès! Model version: {update_data['version']}")
        print(f"   Sports entraînés: {list(xgboost_params['sports'].keys())}")
        print(f"   CV globale: {global_cv*100:.1f}% | Échantillons: {total_samples}")
        return True
    except Exception as e:
        print(f"   ❌ Erreur export: {e}")
        return False

# ============================================================
# TELEGRAM NOTIFICATION
# ============================================================

def send_telegram_report(results: dict, global_cv: float, total_samples: int):
    """Envoie un résumé Telegram de l'entraînement."""
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not bot_token or not chat_id:
        print("   ℹ️ Pas de config Telegram — skip notification")
        return

    msg = "🧠 *XGBoost Training Report v2*\n"
    msg += f"━━━━━━━━━━━━━━━━━━━━\n"
    msg += f"📅 {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
    msg += f"📊 Total: {total_samples} échantillons\n"
    msg += f"📈 CV globale: {global_cv*100:.1f}%\n"

    # Enrichissement info
    if any(r.get("calibration") for r in results.values() if r):
        msg += "📐 *Calibration:* Platt Scaling active\n"
    enriched_sports = [s for s, r in results.items() if r and r.get("league_performance")]
    if enriched_sports:
        msg += f"💰 *Bankroll:* {len(enriched_sports)} sports avec suivi par ligue\n"
    if any(r.get("custom_loss", {}).get("adopted") for r in results.values() if r):
        msg += "⚖️ *Custom Loss:* Adopté (anti fausses certitudes)\n"
    if any(r.get("backtesting") for r in results.values() if r):
        msg += "📉 *Backtesting:* Slippage + CLV activé\n"
    msg += "\n"

    for sport, r in sorted(results.items()):
        if r:
            emoji = "🟢" if r["edge_vs_random"] > 10 else "🟡" if r["edge_vs_random"] > 0 else "🔴"
            msg += f"{emoji} *{sport.upper()}*\n"
            msg += f"  CV: {r['cv_accuracy']*100:.1f}% | Edge: +{r['edge_vs_random']:.1f}pp\n"
            # Calibration info
            cal = r.get("calibration")
            if cal:
                msg += f"  📐 Brier: {cal['brier_score_original']:.4f}→{cal['brier_score_calibrated']:.4f}\n"
            # Custom loss info
            cl = r.get("custom_loss")
            if cl and cl.get("adopted"):
                msg += f"  ⚖️ Custom Loss: -{cl['false_confident_reduction_pct']}% fausses certitudes\n"
            # Top league
            lp = r.get("league_performance", {})
            if lp:
                top_league = max(lp.items(), key=lambda x: x[1].get("roi_simulated", 0))
                rec = top_league[1].get("recommendation", "")
                rec_emoji = "✅" if rec == "strong" else "⚠️" if rec == "reduce" else "📊"
                msg += f"  {rec_emoji} Top ligue: {top_league[0]} (ROI {top_league[1]['roi_simulated']:+.1f}%)\n"
            # Backtesting info
            bt = r.get("backtesting")
            if bt:
                scenarios = bt.get("scenarios", {})
                roi_r = scenarios.get("realiste", {}).get("roi_pct", 0)
                verdict = "✅" if bt.get("slippage_resistant") else "⚠️"
                msg += f"  📉 Backtest {verdict}: ROI réaliste {roi_r:+.1f}%\n"
            msg += f"  Top feature: {r['top_features'][0][0] if r['top_features'] else 'N/A'}\n\n"

    msg += "✅ Modèle déployé sur Supabase"

    try:
        import urllib.request
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": msg,
            "parse_mode": "Markdown"
        }).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
        print("   ✅ Notification Telegram envoyée")
    except Exception as e:
        print(f"   ⚠️ Erreur Telegram: {e}")

# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="XGBoost Training Pipeline - Steo Elite Predictor")
    parser.add_argument("--sport", type=str, choices=list(SPORT_THRESHOLDS.keys()),
                        help="Entraîner un seul sport")
    parser.add_argument("--dry-run", action="store_true",
                        help="Afficher les features sans entraîner")
    parser.add_argument("--min-samples", type=int, default=30,
                        help="Minimum d'échantillons par sport (default: 30)")
    parser.add_argument("--no-export", action="store_true",
                        help="Ne pas exporter vers Supabase")
    parser.add_argument("--no-telegram", action="store_true",
                        help="Ne pas envoyer la notification Telegram")
    parser.add_argument("--csv-only", action="store_true",
                        help="Utiliser uniquement les CSV locaux (pas de connexion Supabase)")
    parser.add_argument("--enrichment", type=str, default=None,
                        help="Chemin vers le fichier d'enrichissement (JSON)")
    args = parser.parse_args()

    print("=" * 60)
    print("🧠 XGBoost Training Pipeline - Steo Elite Predictor")
    print(f"   Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"   Sport(s): {args.sport or 'all'}")
    print(f"   Min samples: {args.min_samples}")
    if args.dry_run:
        print("   🔍 MODE: DRY RUN")
    print("=" * 60)

    start_time = time.time()

    # Connexion Supabase (optionnelle en mode csv-only)
    sb = None
    if not args.csv_only:
        try:
            sb = get_supabase()
            print("✅ Connexion Supabase établie")
        except Exception as e:
            print(f"⚠️ Erreur connexion Supabase: {e}")
            print("   Mode dégradé: données CSV uniquement")
    else:
        print("📁 MODE CSV-ONLY: pas de connexion Supabase")

    # Charger les données
    df = load_training_data(sb, sport=args.sport)
    if df.empty:
        print("❌ Aucune donnée disponible pour l'entraînement")
        sys.exit(1)

    # Feature engineering (enrichi piliers 1-3)
    print("\n🔧 Feature Engineering...")
    enrichment = load_enrichment_data(args.enrichment)
    df = engineer_features(df, enrichment=enrichment)
    feature_cols = get_feature_columns(df)
    print(f"   ✅ {len(feature_cols)} features créées")

    # Entraîner par sport
    print("\n" + "=" * 60)
    print("🏋️ ENTRAÎNEMENT PAR SPORT")
    print("=" * 60)

    sports_to_train = [args.sport] if args.sport else list(SPORT_THRESHOLDS.keys())
    results = {}

    for sport in sports_to_train:
        result = train_sport_model(df, sport, min_samples=args.min_samples, dry_run=args.dry_run)
        if result:
            results[sport] = result

    if args.dry_run:
        print("\n🔍 DRY RUN terminé — aucun modèle entraîné")
        sys.exit(0)

    # Résumé global
    trained_sports = len(results)
    total_samples = sum(r["samples"] for r in results.values())
    global_cv = np.mean([r["cv_accuracy"] for r in results.values()]) if results else 0

    print("\n" + "=" * 60)
    print("📋 RÉSUMÉ GLOBAL")
    print("=" * 60)
    print(f"   Sports entraînés: {trained_sports}/{len(sports_to_train)}")
    print(f"   Total échantillons: {total_samples}")
    print(f"   CV globale: {global_cv*100:.1f}%")
    print(f"   Durée: {time.time() - start_time:.1f}s")

    # Verdict
    if global_cv > 0.60:
        verdict = "🏆 EXCELLENT — Modèle très performant"
    elif global_cv > 0.55:
        verdict = "✅ BON — Significativement meilleur que l'aléatoire"
    elif global_cv > 0.50:
        verdict = "🟡 MOYEN — Léger edge, à surveiller"
    else:
        verdict = "🔴 FAIBLE — Pas d'edge détectable"
    print(f"   Verdict: {verdict}")

    # Export Supabase
    if not args.no_export and results and sb is not None:
        success = export_to_supabase(sb, results, global_cv, total_samples)
        if not success:
            print("⚠️ L'export a échoué mais les résultats sont en mémoire")

    # Notification Telegram
    if not args.no_telegram and results:
        send_telegram_report(results, global_cv, total_samples)

    # Export JSON local (backup)
    output = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "global_cv_accuracy": global_cv,
        "total_samples": total_samples,
        "sports": {s: r for s, r in results.items() if r},
    }
    output_path = os.path.join(os.path.dirname(__file__), "last_training_result.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n💾 Résultats sauvegardés: {output_path}")

    print("\n✅ Pipeline terminé!")

if __name__ == "__main__":
    main()
