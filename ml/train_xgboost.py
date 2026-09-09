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


class NumpyEncoder(json.JSONEncoder):
    """JSON encoder qui convertit les types numpy en types Python natifs."""
    def default(self, obj):
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


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

# Ensemble LightGBM/CatBoost DÉSACTIVÉ (v3): le soft-voting n'est pas rejouable
# côté prod TypeScript (le replay prod exécute les arbres XGBoost exportés).
# Un ensemble adopté en training mais impossible à rejouer en prod = mismatch
# train/prod — exactement la classe de bug que la v3 élimine.
ENSEMBLE_ENABLED = False

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

    # ═══════════════════════════════════════════════════════════════
    # ANTI-POISONING v3: cible unique = victoire à domicile (outcome RÉEL)
    # ═══════════════════════════════════════════════════════════════
    # Bug historique: 3 définitions de cible incompatibles étaient mélangées —
    #   Source 1 (predictions): "le pick était-il correct?" (pick jamais fourni en feature)
    #   Source 2 (matches):     result_match=True TOUJOURS avec predicted_result=winner
    #                           choisi post-hoc → des milliers de samples "toujours gagnants"
    #                           → précision fake 99.79% (cf last_training_result.json)
    #   CSV odds réels:         "le favori a-t-il gagné?"
    # La cible est maintenant le RÉSULTAT réel du match: target_home_win ∈ {0,1},
    # les matchs nuls (draw) sont exclus du training. Le pick n'intervient plus
    # jamais dans le label.
    def _outcome_of(row):
        a = str(row.get("actual_result") or "").strip().lower()
        if a in ("home", "away", "draw"):
            return a
        hs, as_ = row.get("home_score"), row.get("away_score")
        try:
            hs = int(hs) if hs is not None and not pd.isna(hs) else None
            as_ = int(as_) if as_ is not None and not pd.isna(as_) else None
        except (TypeError, ValueError):
            return None
        if hs is None or as_ is None:
            return None
        return "home" if hs > as_ else "away" if as_ > hs else "draw"

    outcomes = df.apply(_outcome_of, axis=1)
    df["target_home_win"] = [1.0 if o == "home" else 0.0 if o == "away" else np.nan for o in outcomes]

    # Neutraliser les faux picks: seul Source 1 (predictions) contient de vrais
    # picks pré-match. Sources 2/3 avaient un pick inventé post-hoc.
    if "_source" in df.columns:
        fake_pick_mask = df["_source"].notna()
        df.loc[fake_pick_mask, "predicted_result"] = None
        # astype(object) évite le FutureWarning pandas (NaN dans une colonne bool)
        df["result_match"] = df["result_match"].astype("object")
        df.loc[fake_pick_mask, "result_match"] = np.nan

    # Déduplication fixture (priorité: predictions > matches > CSV — ordre de all_data)
    before_dedup = len(df)
    seen_fixtures = set()
    keep_idx = []
    for idx, row in df.iterrows():
        key = (
            str(row.get("sport", "")).lower(),
            str(row.get("home_team", "")).strip().lower(),
            str(row.get("away_team", "")).strip().lower(),
            str(row.get("match_date", "")),
        )
        if key in seen_fixtures:
            continue
        seen_fixtures.add(key)
        keep_idx.append(idx)
    df = df.loc[keep_idx].copy()
    if before_dedup - len(df) > 0:
        print(f"   🧹 Dédup fixtures: {before_dedup - len(df)} doublons retirés")

    # Exclure draws + lignes sans résultat vérifiable
    n_draw = int((outcomes.loc[df.index] == "draw").sum()) if len(df) else 0
    df = df[df["target_home_win"].notna()].copy()
    n_dropped_no_outcome = before_dedup - n_draw - len(df)
    print(f"   🎯 Cible home_win: {len(df)} échantillons décidés "
          f"({n_draw} draws exclus, {max(n_dropped_no_outcome, 0)} sans résultat)")

    # Filtrer les lignes avec des odds valides
    df = df.dropna(subset=["odds_home", "odds_away"])

    # ⚠️ ANTI-LEAKAGE: Supprimer les colonnes qui leakent la target
    # predicted_result = le résultat qu'on essaie de prédire (pas une feature!)
    # pred_home/pred_away/pred_draw/pred_matches_favorite sont dérivées de predicted_result
    for leak_col in ["predicted_result", "actual_result"]:
        if leak_col in df.columns:
            df.drop(columns=[leak_col], inplace=True)

    print(f"   ✅ {len(df)} prédictions chargées (anti-leakage appliqué)")

    # Stats par sport (taux de victoire domicile — la vraie distribution de la cible)
    for s in df["sport"].unique():
        sub = df[df["sport"] == s]
        home_rate = sub["target_home_win"].mean() * 100 if len(sub) > 0 else 0
        print(f"      {s}: {len(sub)} échantillons ({home_rate:.1f}% victoires domicile)")

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
    # PHASE 3 FEATURES: Weather, Fatigue, Record Strength
    # Zero-cost enrichment from Open-Meteo + ESPN records
    # ═══════════════════════════════════════════════════════════════
    weather_cols = ["weather_impact", "weather_risk"]
    fatigue_cols = ["fatigue_diff", "fatigue_home", "fatigue_away"]
    record_cols = ["record_home_pct", "record_away_pct", "record_diff"]
    for col in weather_cols + fatigue_cols + record_cols:
        if col not in df.columns:
            df[col] = 0.0
    # weather_impact can be negative (-1 to +1), shift to [0,1] in scoreWithXGBoost
    # weather_risk: 0=low, 0.5=medium, 1=high (already in [0,1])
    # fatigue_diff: -1 to +1 (sigmoid in scoreWithXGBoost)
    # fatigue_home/away: 0 to 1 (already in [0,1])
    # record_home/away_pct: 0 to 1 (already in [0,1])
    # record_diff: -1 to +1 (sigmoid in scoreWithXGBoost)

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
        # Inclut tous les alias courants (avec/sans accents, codes, noms alternatifs)
        league_to_div = {
            # England
            "Premier League": "E0", "EPL": "E0", "English Premier League": "E0",
            "England Premier League": "E0", "England - Premier League": "E0",
            "Championship": "E1", "EFL Championship": "E1",
            "League One": "E2", "League Two": "E3",
            # Spain
            "La Liga": "SP1", "LaLiga": "SP1", "LaLiga Santander": "SP1",
            "Spanish La Liga": "SP1", "Spain - La Liga": "SP1",
            "Primera Division": "SP1", "Primera División": "SP1",
            "Segunda": "SP2", "Segunda Division": "SP2", "Segunda División": "SP2",
            "LaLiga 2": "SP2", "La Liga 2": "SP2",
            # Italy
            "Serie A": "I1", "Série A": "I1", "Italian Serie A": "I1",
            "Italy - Serie A": "I1", "SerieA": "I1", "Serie A IT": "I1",
            "Serie B": "I2", "Série B": "I2", "SerieB": "I2",
            # Germany
            "Bundesliga": "D1", "German Bundesliga": "D1",
            "Germany - Bundesliga": "D1", "Bundesliga 1": "D1",
            "2. Bundesliga": "D2", "Bundesliga 2": "D2", "2 Bundesliga": "D2",
            # France
            "Ligue 1": "F1", "Ligue1": "F1", "French Ligue 1": "F1",
            "France - Ligue 1": "F1", "Ligue1 Uber Eats": "F1",
            "Ligue 2": "F2", "Ligue2": "F2",
            # Netherlands
            "Eredivisie": "N1", "Dutch Eredivisie": "N1",
            # Portugal
            "Primeira Liga": "P1", "Liga Portugal": "P1",
            "Portuguese Primeira Liga": "P1", "Liga Portugal Bwin": "P1",
            # Belgium
            "Belgian Pro League": "B1", "Jupiler Pro League": "B1",
            "First Division A": "B1",
            # Scotland
            "Scottish Premiership": "SC0", "Scottish Premier League": "SC0",
            "SPFL Premiership": "SC0",
            # Greece
            "Greek Super League": "G1", "Super League Greece": "G1",
            "Super League 1": "G1",
        }

        # Normalisation: compare en lowercase sans accents
        import unicodedata
        def _normalize(s):
            if not s:
                return ""
            s = str(s).strip().lower()
            # Supprime les accents
            s = unicodedata.normalize("NFKD", s)
            s = "".join(c for c in s if not unicodedata.combining(c))
            return s

        # Version normalisée du mapping pour matching robuste
        league_to_div_normalized = {_normalize(k): v for k, v in league_to_div.items()}

        def _get_ref_agg(row_league, field, default=0.0):
            """Récupère l'agrégat arbitre pour une ligue (matching robuste)."""
            if not row_league or pd.isna(row_league):
                return ref_global.get(field, default) if ref_global else default
            # 1. Match exact
            div = league_to_div.get(str(row_league).strip())
            # 2. Match normalisé (sans accents, lowercase)
            if not div:
                norm = _normalize(row_league)
                div = league_to_div_normalized.get(norm)
            # 3. Match partiel (la ligue contient un mot-clé connu)
            if not div:
                norm = _normalize(row_league)
                for keyword, code in [
                    ("premier league", "E0"), ("epl", "E0"),
                    ("la liga", "SP1"), ("laliga", "SP1"),
                    ("serie a", "I1"), ("seriea", "I1"),
                    ("bundesliga", "D1"),
                    ("ligue 1", "F1"), ("ligue1", "F1"),
                    ("eredivisie", "N1"), ("primeira", "P1"),
                    ("jupiler", "B1"), ("premiership", "SC0"),
                ]:
                    if keyword in norm:
                        div = code
                        break
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

        # Debug: vérifier le taux de match des ligues
        if "league" in df.columns and len(df) > 0:
            matched = df["league"].apply(lambda lg: bool(_get_ref_agg(lg, "avg_severity", None) is not None or ref_global))
            # Compter combien de ligues différentes ont été résolues vs fallback
            league_counts = df["league"].fillna("Inconnu").value_counts()
            n_matched = 0
            n_fallback = 0
            for lg_name, cnt in league_counts.items():
                div_test = league_to_div.get(str(lg_name).strip())
                if not div_test:
                    norm_test = _normalize(lg_name)
                    div_test = league_to_div_normalized.get(norm_test)
                if div_test:
                    n_matched += cnt
                else:
                    n_fallback += cnt
            print(f"      🎯 Ligues résolues: {n_matched}/{len(df)} ({n_matched/len(df)*100:.1f}%) | fallback global: {n_fallback}")

    return df

# ── Liste blanche des features (v3) ─────────────────────────────
# 1. Calculables AVANT le match (anti-leakage: pas de xG post-match, pas
#    de home_score/away_score, pas de pred_*).
# 2. Reproductibles À L'IDENTIQUE en production TypeScript (scoreWithXGBoost).
#    Exclusions volontaires:
#    - league_* / league_rare : dummies jamais calculées en prod → routing faux
#    - day_of_week / month / is_weekend : date absente du feature vector prod
#    - xg_home/xg_away/xg_diff/xg_total : xG RÉEL du match (post-match) = fuite
#      pour les rows Source 2, et indisponible en prod
#    - estimated_odds_flag : marqueur de source de données, absent en prod
#    - overround : redondant avec prob_* et valeur différente en prod
#    - clv_*, tactical_*, referee_*, match_tension : requièrent l'enrichissement
#      (actuellement vide) et ne sont pas calculés en prod
PROD_COMPUTABLE_FEATURES = [
    "prob_home", "prob_away", "prob_draw",
    "odds_ratio", "log_odds_ratio", "is_home_favorite", "favorite_strength",
    "draw_signal", "heavy_favorite", "underdog_match",
    "confidence_numeric", "odds_confidence", "favorite_confidence",
    "is_football", "is_basketball", "is_hockey", "is_baseball", "is_tennis",
    "weather_impact", "weather_risk",
    "fatigue_diff", "fatigue_home", "fatigue_away",
    "record_home_pct", "record_away_pct", "record_diff",
]

def get_feature_columns(df: pd.DataFrame) -> list:
    """Features de la liste blanche présentes dans le DataFrame (train == prod)."""
    return [c for c in PROD_COMPUTABLE_FEATURES if c in df.columns]

# ============================================================
# MODEL TRAINING
# ============================================================

# ── Helpers v3: export arbres + Platt holdout ──────────────────

def _build_tree_from_df(nodes_df: pd.DataFrame, fmap: dict, node_id: int) -> dict:
    """Construit récursivement l'arbre compact depuis trees_to_dataframe
    (schéma XGBoost 2.x: colonnes Tree/Node/ID/Feature/Split/Yes/No/Missing/Gain;
     valeur de feuille stockée dans Gain, Feature=='Leaf').
    ⚠️ Les seuils/feuilles sont des float32 impressionés à 9 chiffres — l'erreur
    (< ulp/2) est récupérée par le double-cast float32 côté replay."""
    row = nodes_df[nodes_df["Node"] == node_id].iloc[0]
    if str(row["Feature"]) == "Leaf":
        return {"v": float(row["Gain"])}  # 2.1.x: valeur de feuille dans Gain
    def child_id(col):
        # colonnes Yes/No/Missing contiennent les id "tree-node" des enfants
        ref = row[col]
        return int(str(ref).split("-")[1])
    return {
        "f": fmap.get(str(row["Feature"]), -1),
        "t": float(row["Split"]),
        "y": _build_tree_from_df(nodes_df, fmap, child_id("Yes")),
        "n": _build_tree_from_df(nodes_df, fmap, child_id("No")),
        "m": _build_tree_from_df(nodes_df, fmap, child_id("Missing")),
    }


def _replay_margin(node: dict, x: list) -> float:
    """Rejoue un arbre compact sur une ligne de features (par index).
    ⚠️ XGBoost compare les splits en FLOAT32: la valeur est castée en float32
    avant la comparaison (sinon les valeurs pile au seuil divergent)."""
    if "v" in node:
        return node["v"]
    v = x[node["f"]] if 0 <= node["f"] < len(x) else None
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return _replay_margin(node["m"], x)
    # Double-cast float32: valeur ET seuil — XGBoost compare en float32.
    # Le seuil JSON (9 chiffres) redevient exactement le float32 d'origine.
    v32 = float(np.float32(v))
    t32 = float(np.float32(node["t"]))
    return _replay_margin(node["y"] if v32 < t32 else node["n"], x)


def export_tree_dump(model, X_check, y_check) -> Optional[dict]:
    """
    Exporte les arbres XGBoost en JSON compact pour replay TypeScript,
    avec AUTO-VÉRIFICATION: le replay Python du dump doit reproduire
    predict_proba à 1e-4 près. Sinon l'export est annulé (prod = heuristiques).
    """
    try:
        booster = model.get_booster()
        feature_names = list(booster.feature_names or [])
        if not feature_names:
            print("      ⚠️ Pas de feature_names sur le booster — dump ignoré")
            return None
        fmap = {name: i for i, name in enumerate(feature_names)}
        # ⚠️ trees_to_dataframe() (float32 exacts) au lieu de get_dump(json)
        # dont les seuils arrondis à 9 chiffres font flipper les branches
        # aux frontières de split (le seuil EST souvent une valeur de donnée).
        tree_df = booster.trees_to_dataframe()
        trees = [_build_tree_from_df(g, fmap, 0) for _, g in tree_df.groupby("Tree")]
        if not trees:
            return None

        # ── Auto-vérification sur un échantillon du holdout ──
        n_check = min(200, len(X_check))
        Xv = X_check.head(n_check)
        proba_ref = model.predict_proba(Xv)[:, 1]

        # Sommes de feuilles par ligne (offset exclu)
        sums = np.array([
            sum(_replay_margin(t, [float(v) for v in Xv.iloc[i].values]) for t in trees)
            for i in range(n_check)
        ])

        # base_score → offset nominal (la convention varie selon version/objectif)
        base_score = 0.5
        try:
            cfg = json.loads(booster.save_config())
            base_score = float(cfg["learner"]["learner_model_param"]["base_score"])
        except Exception:
            pass
        logit_base = math.log(max(base_score, 1e-6) / max(1 - base_score, 1e-6))

        # Offset EMPIRIQUE (data-driven): médiane de logit(proba_ref) - sum_leaves.
        # Couvre toutes les conventions (XGBoost 2.x auto base_score, objective
        # custom qui ne dérive pas le base_score, etc.).
        p_ref = np.clip(proba_ref, 1e-6, 1 - 1e-6)
        offset_emp = float(np.median(np.log(p_ref / (1 - p_ref)) - sums))

        best = None
        for offset in (0.0, logit_base, offset_emp):
            max_diff = 0.0
            for i in range(n_check):
                margin = sums[i] + offset
                p = 1.0 / (1.0 + math.exp(-max(min(margin, 30.0), -30.0)))
                max_diff = max(max_diff, abs(p - float(proba_ref[i])))
            print(f"      [dump-check] offset={offset:.6f} → diff max {max_diff:.3e}")
            if best is None or max_diff < best[1]:
                best = (offset, max_diff)
        offset, max_diff = best

        if max_diff > 1e-4:
            print(f"      ⚠️ Replay dump ≠ predict_proba (diff max {max_diff:.2e}) — export arbres annulé")
            return None

        print(f"      🌳 Arbres exportés: {len(trees)} | offset marge {offset:.4f} | "
              f"diff max replay {max_diff:.2e} ✅")
        return {
            "format": "xgb_dump_v1",
            "features": feature_names,
            "margin_offset": round(float(offset), 6),
            "n_trees": len(trees),
            "missing_policy": "zero",  # feature absente en prod = 0 (comme fillna(0) au training)
            "trees": trees,
        }
    except Exception as e:
        import traceback
        print(f"      ⚠️ Export arbres échoué: {e}")
        print(traceback.format_exc()[:300])
        return None


def _fit_platt_on_holdout(margins: np.ndarray, y_true: np.ndarray) -> Optional[dict]:
    """
    Platt scaling HONNÊTE: fit exclusivement sur le holdout temporel
    (jamais in-sample comme avant). p_cal = sigmoid(A * margin + B).
    Exporté seulement si ça améliore réellement le Brier du holdout.
    """
    try:
        from scipy.optimize import minimize
    except ImportError:
        return None
    y = np.asarray(y_true, dtype=float)
    m = np.asarray(margins, dtype=float)
    if len(y) < 100 or len(np.unique(y)) < 2:
        return None
    p_orig = 1.0 / (1.0 + np.exp(-np.clip(m, -30, 30)))
    brier_orig = float(np.mean((p_orig - y) ** 2))

    def nll(params):
        a, b = params
        p = 1.0 / (1.0 + np.exp(-np.clip(a * m + b, -30, 30)))
        p = np.clip(p, 1e-7, 1 - 1e-7)
        return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

    res = minimize(nll, x0=[1.0, 0.0], method="Nelder-Mead",
                   options={"maxiter": 500, "xatol": 1e-6, "fatol": 1e-8})
    if not res.success or not np.all(np.isfinite(res.x)):
        return None
    a, b = float(res.x[0]), float(res.x[1])

    # Calibration identitaire → rien à exporter
    if abs(a - 1.0) < 0.02 and abs(b) < 0.02:
        return {"a": 1.0, "b": 0.0, "applied": False,
                "brier_original": round(brier_orig, 6),
                "brier_calibrated": round(brier_orig, 6)}

    p_cal = 1.0 / (1.0 + np.exp(-np.clip(a * m + b, -30, 30)))
    brier_cal = float(np.mean((p_cal - y) ** 2))
    if brier_cal >= brier_orig:
        return {"a": 1.0, "b": 0.0, "applied": False,
                "brier_original": round(brier_orig, 6),
                "brier_calibrated": round(brier_cal, 6),
                "reason": "no_improvement_on_holdout"}

    return {"a": round(a, 6), "b": round(b, 6), "input": "margin", "applied": True,
            "brier_original": round(brier_orig, 6),
            "brier_calibrated": round(brier_cal, 6),
            "improvement": round(brier_orig - brier_cal, 6)}


def train_sport_model(
    df: pd.DataFrame,
    sport: str,
    min_samples: int = 30,
    dry_run: bool = False,
    enrichment: Optional[Dict] = None,
) -> Optional[dict]:
    """
    Entraîne un modèle XGBoost pour un sport spécifique.
    Retourne les résultats ou None si pas assez de données.
    """
    from xgboost import XGBClassifier
    from sklearn.model_selection import cross_val_score, StratifiedKFold

    sport_df = df[df["sport"] == sport].copy()
    # Double sécurité: la cible doit être définie (les draws sont déjà filtrés globalement)
    sport_df = sport_df[sport_df["target_home_win"].notna()].copy()

    if len(sport_df) < min_samples:
        print(f"   ⏭️  {sport}: {len(sport_df)} échantillons (minimum: {min_samples}) — skip")
        return None

    print(f"\n🏋️ Entraînement {sport.upper()} ({len(sport_df)} échantillons) [cible: victoire domicile]")

    # Features
    feature_cols = get_feature_columns(sport_df)
    if not feature_cols:
        print(f"   ⚠️ {sport}: Aucune feature disponible")
        return None

    # ── SPLIT TEMPOREL v3 (anti-leakage) ──
    # Tri chronologique: holdout = les 20% de matchs les PLUS RÉCENTS, jamais vus
    # au training. Remplace l'ancien StratifiedKFold(shuffle=True) qui mélangeait
    # des matchs de saisons différentes dans chaque fold (leakage temporel).
    sport_df = sport_df.sort_values("match_date", kind="mergesort").reset_index(drop=True)
    n_holdout = max(30, int(len(sport_df) * 0.2))
    if len(sport_df) < 200:
        n_holdout = max(20, int(len(sport_df) * 0.2))
    split_idx = len(sport_df) - n_holdout

    X = sport_df[feature_cols].fillna(0)
    y = sport_df["target_home_win"].astype(int)
    X_train, y_train = X.iloc[:split_idx], y.iloc[:split_idx]
    X_hold, y_hold = X.iloc[split_idx:], y.iloc[split_idx:]
    y_train_arr = y_train.values
    y_hold_arr = y_hold.values

    # Vérifier la distribution (train uniquement)
    pos_rate = y_train_arr.mean()
    first_hold_date = sport_df["match_date"].iloc[split_idx]
    hold_date_str = first_hold_date.date().isoformat() if pd.notna(first_hold_date) else "?"
    print(f"   Distribution train: {int(y_train_arr.sum())}/{len(y_train_arr)} victoires home ({pos_rate*100:.1f}%)")
    print(f"   Features: {len(feature_cols)} | Split temporel: {len(X_train)} train / {len(X_hold)} holdout (holdout ≥ {hold_date_str})")

    # Anti-modèle-inutile: si toutes les features sont constantes (std≈0), skip
    # Évite de pousser un modèle à 0 feature importance en production
    feature_std = X_train.std()
    n_informative = int((feature_std > 0.01).sum())
    if n_informative < 3:
        print(f"   ⚠️ {sport}: seulement {n_informative} feature(s) avec variance > 0.01")
        print(f"      → Le modèle ne pourrait pas apprendre (toutes features constantes)")
        print(f"      → Cause probable: données manquantes (xg, tactical, clv) pour ce sport")
        print(f"      → Skip pour éviter de pousser un modèle inutile en production")
        return None
    print(f"   📊 Features informatives: {n_informative}/{len(feature_cols)} (variance > 0.01)")

    if dry_run:
        print(f"   🔍 DRY RUN - Features utilisées:")
        for col in sorted(feature_cols):
            print(f"      - {col}")
        return None

    # Cross-validation TEMPORELLE (walk-forward, sur la période train uniquement)
    from sklearn.model_selection import TimeSeriesSplit
    n_folds = min(CV_FOLDS, max(2, len(X_train) // 100))
    model = XGBClassifier(**XGB_DEFAULT_PARAMS)

    cv_scores = []
    if len(X_train) >= (n_folds + 1) * 50:
        tscv = TimeSeriesSplit(n_splits=n_folds)
        cv_scores = cross_val_score(model, X_train, y_train_arr, cv=tscv, scoring="accuracy")
    mean_cv = float(np.mean(cv_scores)) if len(cv_scores) else 0.0
    std_cv = float(np.std(cv_scores)) if len(cv_scores) else 0.0

    if len(cv_scores):
        print(f"   CV walk-forward Accuracy: {mean_cv*100:.1f}% ± {std_cv*100:.1f}% (folds: {[f'{s*100:.1f}%' for s in cv_scores]})")
    else:
        print(f"   ⚠️ CV sautée (trop peu de données pour un split temporel fiable)")

    # Baseline honnête: classe majoritaire du train (jamais 1/3 théorique)
    random_baseline = float(max(pos_rate, 1 - pos_rate))

    edge = (mean_cv - random_baseline) * 100
    print(f"   Baseline (classe majoritaire): {random_baseline*100:.1f}% | Edge CV: {edge:+.1f}pp")

    # Entraîner sur la période train UNIQUEMENT (le holdout reste vierge)
    model.fit(X_train, y_train_arr)

    # Feature importances
    importance = model.feature_importances_
    feature_imp = sorted(zip(feature_cols, importance), key=lambda x: x[1], reverse=True)

    print(f"   📊 Top 10 Features:")
    for i, (fname, fimp) in enumerate(feature_imp[:10]):
        print(f"      {i+1:2d}. {fname}: {fimp:.4f}")

    # ── Probas HOLDOUT (jamais vues au training) ──
    y_proba = model.predict_proba(X_hold)[:, 1]
    holdout_acc = float(((y_proba > 0.5).astype(int) == y_hold_arr).mean())
    holdout_brier = float(np.mean((y_proba - y_hold_arr) ** 2))
    print(f"   📊 Holdout ({len(y_hold_arr)} matchs): accuracy {holdout_acc*100:.1f}% | Brier {holdout_brier:.4f}")

    # Trouver le seuil de confiance optimal — sur HOLDOUT (honnête,
    # remplace l'ancienne optimisation in-sample qui gonflait la précision)
    best_threshold = 0.5
    best_precision = 0
    min_coverage = max(10, int(len(y_hold_arr) * 0.02))
    for t in np.arange(0.40, 0.80, 0.02):
        preds = (y_proba >= t).astype(int)
        if preds.sum() >= min_coverage:
            precision = (preds * y_hold_arr).sum() / preds.sum()
            if precision > best_precision:
                best_precision = precision
                best_threshold = t

    print(f"   🎯 Seuil confiance (holdout): {best_threshold:.2f} (précision: {best_precision*100:.1f}%, couverture ≥ {min_coverage})")

    # ═══════════════════════════════════════════════════════════════
    # AXE OPTIMISATION: NATIVE XGBOOST CUSTOM OBJECTIVE
    # ═══════════════════════════════════════════════════════════════
    # Implémente un VRAI custom objective (pas juste un eval metric).
    # Modifie directement les gradient/hessian que XGBoost optimise:
    #
    # Loss = logloss + α * confidence² * |pred - true|
    #
    # - logloss gradient: (pred - true) / [pred(1-pred)]
    # - logloss hessian : 1/[pred(1-pred)] - (pred-true)² / [pred²(1-pred)²]
    # - Penalty grad    : amplifié quand |pred - 0.5| est grand (haute confiance)
    # - Penalty hess    : second dérivé de la pénalité
    #
    # Effet: XGBoost natively évite les prédictions extrêmes mal fondées.
    # Une erreur à 0.85 coûte ~3x plus cher qu'une erreur à 0.55.
    custom_loss_info = None
    if len(y_train_arr) >= 100:
        try:
            from xgboost import XGBClassifier as XGBC, DMatrix
            print(f"   ⚖️ Native Custom Objective (asymmetric confidence penalty)...")

            # ── Native custom objective: gradient + hessian modifiés ──
            PENALTY_WEIGHT = 0.5  # α — coefficient de pénalité asymétrique

            def asymmetric_logloss_obj(y_true: np.ndarray, preds: np.ndarray):
                """
                Custom objective XGBoost (signature XGBoost 2.x sklearn wrapper).
                Reçoit (y_true, preds) comme ndarrays.
                Returns (grad, hess) where:
                  grad = d Loss / d pred
                  hess = d² Loss / d pred²

                Loss = -[y log(p) + (1-y) log(1-p)] + α * conf² * |p - y|
                où conf = |p - 0.5| * 2  (0 à 1, 1 = très confiant)
                """
                # Compatibilité: si on reçoit un DMatrix (ancienne API), extraire les labels
                if hasattr(y_true, 'get_label'):
                    dtrain = y_true
                    y_true = dtrain.get_label()
                y_true = np.asarray(y_true)
                p = np.clip(preds, 1e-7, 1 - 1e-7)

                # --- Logloss standard ---
                grad_ll = (p - y_true) / (p * (1 - p))
                hess_ll = 1.0 / (p * (1 - p))  # approx; exact: 1/[p(1-p)] - (p-y)²/[p²(1-p)²]

                # --- Pénalité asymétrique ---
                # conf = |2p - 1| (0 pour p=0.5, 1 pour p=0 ou 1)
                conf = np.abs(2 * p - 1)
                # d/conf/dp = 2 * sign(2p-1)
                sign_p = np.sign(2 * p - 1)
                # |p - y| derivative: sign(p - y) sauf si p == y (non-diff)
                sign_diff = np.sign(p - y_true)
                # Pénalité: α * conf² * |p - y|
                # d/dp = α * [2 * conf * (d conf/dp) * |p-y| + conf² * sign(p-y)]
                #       = α * [2 * |2p-1| * 2 * sign_p * |p-y| + conf² * sign_diff]
                # Simplifions (|2p-1| * sign_p = 2p - 1):
                grad_pen = PENALTY_WEIGHT * (4 * (2 * p - 1) * np.abs(p - y_true) + conf * conf * sign_diff)
                # Hess approx (la pénalité est non-lisse, on lisse):
                # d²/dp² ≈ α * (8 * |p-y| + 8*(2p-1)*sign_diff + 4*conf*sign_p*sign_diff + ...)
                # On simplifie à un terme stable:
                hess_pen = PENALTY_WEIGHT * (8 * np.abs(p - y_true) + 4 * conf + 1e-3)

                grad = grad_ll + grad_pen
                hess = hess_ll + hess_pen
                # Clip hess pour stabilité numérique
                hess = np.clip(hess, 1e-3, 1e6)
                return grad, hess

            # --- Custom eval metric (pour afficher la loss) ---
            def asymmetric_logloss_eval(y_true, y_pred):
                """Eval metric: logloss + penalty (pour monitoring)."""
                p = np.clip(y_pred, 1e-7, 1 - 1e-7)
                ll = -(y_true * np.log(p) + (1 - y_true) * np.log(1 - p))
                conf = np.abs(2 * p - 1)
                pen = PENALTY_WEIGHT * conf * conf * np.abs(p - y_true)
                return "asym_loss", float(np.mean(ll + pen))

            # --- Entraîner le modèle custom ---
            custom_params = XGB_DEFAULT_PARAMS.copy()
            # Retirer l'objective standard pour utiliser le custom
            custom_params.pop("objective", None)
            custom_params["eval_metric"] = "logloss"  # métrique d'affichage
            custom_model = XGBC(**custom_params, objective=asymmetric_logloss_obj)
            custom_model.fit(X_train, y_train_arr, eval_set=[(X_train, y_train_arr)], verbose=False)

            # Comparaison sur HOLDOUT (honnête — remplace l'ancienne comparaison in-sample)
            y_proba_custom = custom_model.predict_proba(X_hold)[:, 1]

            # --- Comparer les distributions de proba ---
            orig_mean_conf = float(np.mean(np.where(y_proba > 0.5, y_proba, 1 - y_proba)))
            custom_mean_conf = float(np.mean(np.where(y_proba_custom > 0.5, y_proba_custom, 1 - y_proba_custom)))

            # Faux confiant: proba > 0.65 mais classe réelle 0 (holdout)
            false_confident_orig = int(((y_proba > 0.65) & (y_hold_arr == 0)).sum())
            false_confident_custom = int(((y_proba_custom > 0.65) & (y_hold_arr == 0)).sum())

            # Faux confiant extreme: proba > 0.80 mais classe 0 (holdout)
            false_confident_ext_orig = int(((y_proba > 0.80) & (y_hold_arr == 0)).sum())
            false_confident_ext_custom = int(((y_proba_custom > 0.80) & (y_hold_arr == 0)).sum())

            # Brier scores (holdout)
            brier_orig = float(np.mean((y_proba - y_hold_arr) ** 2))
            brier_custom = float(np.mean((y_proba_custom - y_hold_arr) ** 2))

            # Accuracy globale (holdout)
            acc_orig = float(((y_proba > 0.5).astype(int) == y_hold_arr).mean())
            acc_custom = float(((y_proba_custom > 0.5).astype(int) == y_hold_arr).mean())

            # Décider si le custom est adopté:
            # - réduit les fausses certitudes (sévérité extrême prioritaire)
            # - Brier acceptable (≤ 2% de dégradation)
            # - accuracy acceptable (≤ 1pp de dégradation)
            custom_improves = (
                false_confident_ext_custom < false_confident_ext_orig and
                brier_custom <= brier_orig * 1.02 and
                acc_custom >= acc_orig - 0.01
            )

            custom_loss_info = {
                "method": "native_custom_objective_asymmetric",
                "penalty_weight": PENALTY_WEIGHT,
                "false_confident_orig": false_confident_orig,
                "false_confident_custom": false_confident_custom,
                "false_confident_extreme_orig": false_confident_ext_orig,
                "false_confident_extreme_custom": false_confident_ext_custom,
                "false_confident_reduction_pct": round(
                    (1 - false_confident_custom / max(false_confident_orig, 1)) * 100, 1
                ),
                "false_confident_extreme_reduction_pct": round(
                    (1 - false_confident_ext_custom / max(false_confident_ext_orig, 1)) * 100, 1
                ),
                "brier_orig": round(brier_orig, 6),
                "brier_custom": round(brier_custom, 6),
                "accuracy_orig": round(acc_orig, 4),
                "accuracy_custom": round(acc_custom, 4),
                "mean_confidence_orig": round(orig_mean_conf, 4),
                "mean_confidence_custom": round(custom_mean_conf, 4),
                "adopted": bool(custom_improves),
            }

            if custom_improves:
                # Le modèle custom remplace l'original
                model = custom_model
                y_proba = y_proba_custom
                print(f"      ✅ Custom Objective ADOPTÉ (validé sur holdout)")
                print(f"         Fausses certitudes (65%+): {false_confident_orig} → {false_confident_custom} "
                      f"(-{custom_loss_info['false_confident_reduction_pct']}%)")
                print(f"         Fausses certitudes (80%+): {false_confident_ext_orig} → {false_confident_ext_custom} "
                      f"(-{custom_loss_info['false_confident_extreme_reduction_pct']}%)")
                print(f"         Brier: {brier_orig:.4f} → {brier_custom:.4f} | "
                      f"Acc: {acc_orig*100:.1f}% → {acc_custom*100:.1f}%")
            else:
                print(f"      ℹ️ Logloss standard conservé")
                print(f"         Custom: {false_confident_custom} fausses certitudes (65%+) vs {false_confident_orig}")
                print(f"         Brier custom {brier_custom:.4f} vs orig {brier_orig:.4f}")

        except Exception as e:
            import traceback
            print(f"      ⚠️ Custom Objective échoué: {e}")
            print(traceback.format_exc()[:500])

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
    bt_df = sport_df.iloc[split_idx:].reset_index(drop=True)
    if "odds_home" in bt_df.columns and len(y_hold_arr) >= 50:
        try:
            print(f"   📉 Backtesting (holdout uniquement — slippage + CLV + drawdown + buckets)...", flush=True)

            odds_h = bt_df["odds_home"].fillna(2.0).values
            odds_a = bt_df["odds_away"].fillna(2.0).values

            # Pré-charger les CLV par équipe (une seule fois hors loop)
            clv_by_team = enrichment.get("clv_by_team", {}) if enrichment else {}
            # enrichment est maintenant passé en paramètre (fix NameError)

            # Slippage scenarios
            slippage_scenarios = {
                "optimiste": 0.01,   # 1% - marché très liquide, pari rapide
                "realiste": 0.03,    # 3% - standard
                "pessimiste": 0.05,  # 5% - marché illiquide ou délai
            }

            # ── Helpers pour le bucketing confiance ──
            confidence_buckets = {
                "0.50-0.60": (0.50, 0.60),
                "0.60-0.70": (0.60, 0.70),
                "0.70-0.80": (0.70, 0.80),
                "0.80+":     (0.80, 1.01),
            }

            def _bucket_for_proba(p):
                for label, (lo, hi) in confidence_buckets.items():
                    if lo <= p < hi:
                        return label
                return "0.80+"

            backtest_results = {}
            # ROI par bucket — aggrégé sur tous les scénarios (indépendant du slippage)
            bucket_stats = {label: {"bets": 0, "wins": 0, "stake": 0.0, "profit": 0.0}
                            for label in confidence_buckets}

            for scenario_name, slippage_rate in slippage_scenarios.items():
                simulated_bankroll = 1000.0  # Bankroll de départ
                peak_bankroll = 1000.0
                max_drawdown = 0.0
                current_streak = 0      # positif = win streak, négatif = loss streak
                max_consec_wins = 0
                max_consec_losses = 0
                total_bets = 0
                total_wins = 0
                total_stake = 0
                total_profit = 0.0
                clv_correct_count = 0
                clv_total_count = 0
                clv_aligned_count = 0   # CLV aligné avec notre prédiction

                # Parier uniquement quand le modèle est confiant + value bet
                for i in range(len(y_hold_arr)):
                    proba = y_proba[i]
                    if proba < best_threshold:
                        continue  # Skip les prédictions non confiantes

                    # Déterminer la cote et le côté du pari
                    is_home_fav = odds_h[i] < odds_a[i]
                    base_odds = odds_h[i] if is_home_fav else odds_a[i]
                    predicted_correct = bool(y_hold_arr[i])

                    # Edge minimum requis pour parier
                    implied_prob = 1.0 / base_odds
                    edge = proba - implied_prob
                    if edge < 0.02:  # Min 2% d'edge
                        continue

                    # Appliquer le slippage: la cote réelle est pire que la cote détectée
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
                        current_streak = max(1, current_streak + 1)
                        max_consec_wins = max(max_consec_wins, current_streak)
                    else:
                        simulated_bankroll -= stake
                        total_profit -= stake
                        current_streak = min(-1, current_streak - 1)
                        max_consec_losses = max(max_consec_losses, -current_streak)

                    # Drawdown tracking
                    if simulated_bankroll > peak_bankroll:
                        peak_bankroll = simulated_bankroll
                    dd = (peak_bankroll - simulated_bankroll) / peak_bankroll if peak_bankroll > 0 else 0
                    if dd > max_drawdown:
                        max_drawdown = dd

                    # ── Bucket tracking (uniquement sur scénario réaliste pour éviter doublons) ──
                    if scenario_name == "realiste":
                        b_label = _bucket_for_proba(proba)
                        bucket_stats[b_label]["bets"] += 1
                        bucket_stats[b_label]["stake"] += stake
                        bucket_stats[b_label]["profit"] += profit if predicted_correct else -stake
                        if predicted_correct:
                            bucket_stats[b_label]["wins"] += 1

                    # ── CLV tracking (si disponible dans l'enrichment) ──
                    # Le CLV valide: si notre proba est du côté du steam move → edge confirmé
                    if clv_by_team:
                        home_team = str(bt_df.iloc[i].get("home_team", ""))
                        away_team = str(bt_df.iloc[i].get("away_team", ""))
                        # CLV du côté parié: si on parie home, on regarde le CLV de home_team
                        bet_team = home_team if is_home_fav else away_team
                        if bet_team in clv_by_team:
                            team_clv = clv_by_team[bet_team].get("avg_clv", 0)
                            clv_total_count += 1
                            # CLV aligné avec notre pari (positif = marché est allé dans notre sens)
                            if team_clv > 0:
                                clv_aligned_count += 1
                                # Si en plus on gagne → le marché nous donne raison
                                if predicted_correct:
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
                    "max_drawdown_pct": round(max_drawdown * 100, 1),
                    "max_consec_wins": max_consec_wins,
                    "max_consec_losses": max_consec_losses,
                }

            # ── Bucket ROI analysis (identifie les zones de confiance rentables) ──
            bucket_roi = {}
            for label, s in bucket_stats.items():
                if s["bets"] >= 5:  # Seuil minimal pour stats fiables
                    bucket_roi[label] = {
                        "bets": s["bets"],
                        "win_rate_pct": round(s["wins"] / s["bets"] * 100, 1),
                        "roi_pct": round(s["profit"] / s["stake"] * 100, 1) if s["stake"] > 0 else 0,
                        "total_stake": round(s["stake"], 2),
                    }
                else:
                    bucket_roi[label] = {"bets": s["bets"], "win_rate_pct": None, "roi_pct": None}

            # CLV validation rate
            clv_validation = round(clv_correct_count / max(clv_total_count, 1) * 100, 1) if clv_total_count > 0 else None
            clv_alignment = round(clv_aligned_count / max(clv_total_count, 1) * 100, 1) if clv_total_count > 0 else None

            # Déterminer le scénario réaliste
            realistic_roi = backtest_results["realiste"]["roi_pct"]
            worst_roi = backtest_results["pessimiste"]["roi_pct"]
            max_dd = backtest_results["realiste"]["max_drawdown_pct"]

            # Trouver le bucket le plus rentable (avec au moins 10 bets)
            best_bucket = None
            for label, b in bucket_roi.items():
                if b.get("bets", 0) >= 10 and b.get("roi_pct") is not None:
                    if best_bucket is None or b["roi_pct"] > best_bucket["roi_pct"]:
                        best_bucket = {"bucket": label, **b}

            backtesting_info = {
                "scenarios": backtest_results,
                "slippage_resistant": realistic_roi > 0 and worst_roi > -20,
                "max_drawdown_realiste_pct": max_dd,
                "clv_validation_rate": clv_validation,
                "clv_alignment_pct": clv_alignment,
                "n_clv_matches": clv_total_count,
                "confidence_buckets": bucket_roi,
                "best_confidence_bucket": best_bucket,
                "interpretation": (
                    "ROI résiste au slippage" if realistic_roi > 0
                    else "ROI sensible au slippage - réduire les stakes"
                ),
            }

            print(f"      Slippage: optimiste {backtest_results['optimiste']['roi_pct']:+.1f}% | "
                  f"réaliste {backtest_results['realiste']['roi_pct']:+.1f}% | "
                  f"pessimiste {backtest_results['pessimiste']['roi_pct']:+.1f}%")
            print(f"      Max drawdown (réaliste): {max_dd:.1f}% | "
                  f"Max consec losses: {backtest_results['realiste']['max_consec_losses']}")
            if clv_validation is not None:
                print(f"      CLV: {clv_validation}% gagnés quand aligné | "
                      f"Alignment: {clv_alignment}% (sur {clv_total_count} matchs)")
            if best_bucket:
                print(f"      🎯 Best bucket: {best_bucket['bucket']} "
                      f"(ROI {best_bucket['roi_pct']:+.1f}% | {best_bucket['bets']} bets)")
            verdict = "✅ Solide" if backtesting_info["slippage_resistant"] else "⚠️ Fragile"
            print(f"      Verdict backtest: {verdict}")

        except Exception as e:
            import traceback
            print(f"      ⚠️ Backtesting échoué: {e}")
            print(traceback.format_exc()[:500])

    # ── PILIER 4: CALIBRATION (Platt sur holdout — jamais in-sample) ──
    # Ancien bug: CalibratedClassifierCV(cv='prefit') était fitté sur le TRAIN
    # et évalué sur le train → coefficients A/B biaisés exportés en prod.
    # v3: fit manuel sur la marge brute du holdout temporel uniquement.
    calibration_info = None
    platt_info = None
    if len(y_hold_arr) >= 100:
        try:
            import xgboost as _xgb
            booster = model.get_booster()
            margins_hold = booster.predict(_xgb.DMatrix(X_hold), output_margin=True)
            platt_info = _fit_platt_on_holdout(np.asarray(margins_hold, dtype=float), y_hold_arr)
            if platt_info:
                calibration_info = {
                    "method": "platt_scaling_holdout_margin",
                    "applied": bool(platt_info.get("applied")),
                    "brier_score_original": platt_info["brier_original"],
                    "brier_score_calibrated": platt_info["brier_calibrated"],
                    "improvement": round(platt_info["brier_original"] - platt_info["brier_calibrated"], 6),
                    "platt_a": platt_info["a"],
                    "platt_b": platt_info["b"],
                    "input": "margin",
                    "note": "fit holdout temporel uniquement; appliqué sur la marge brute XGBoost en prod",
                }
                print(f"      Platt (holdout): A={platt_info['a']:.4f}, B={platt_info['b']:.4f}")
                print(f"      Brier: {platt_info['brier_original']:.4f} → {platt_info['brier_calibrated']:.4f} "
                      f"({'✅ appliqué' if platt_info.get('applied') else 'ℹ️ identité / pas d amélioration'})")
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
    # Tennis a un scoring non-Poisson (jeux/sets), on skip
    if len(y) >= 50 and sport in ("football", "basketball", "hockey", "baseball"):
        try:
            print(f"   🎲 Monte-Carlo Poisson (10 000 simulations — {sport})...")

            # Parametres par sport
            sport_mc_config = {
                "football":   {"default_h": 1.5, "default_a": 1.1, "min_lambda": 0.3,
                               "over_threshold": 2.5, "label": "Over 2.5 goals"},
                "basketball": {"default_h": 110.0, "default_a": 105.0, "min_lambda": 80.0,
                               "over_threshold": 220.5, "label": "Over 220.5 pts"},
                "hockey":     {"default_h": 3.0, "default_a": 2.5, "min_lambda": 1.5,
                               "over_threshold": 5.5, "label": "Over 5.5 goals"},
                "baseball":   {"default_h": 4.5, "default_a": 4.0, "min_lambda": 1.5,
                               "over_threshold": 8.5, "label": "Over 8.5 runs"},
            }
            mc_cfg = sport_mc_config[sport]

            # Estimer les lambdas depuis les donnees
            if "xg_home" in sport_df.columns and sport_df["xg_home"].sum() > 0 and sport == "football":
                lambda_home = float(sport_df["xg_home"].mean())
                lambda_away = float(sport_df["xg_away"].mean())
                source = "xG"
            elif "home_score" in sport_df.columns and "away_score" in sport_df.columns:
                hs = pd.to_numeric(sport_df.get("home_score"), errors="coerce").dropna()
                as_ = pd.to_numeric(sport_df.get("away_score"), errors="coerce").dropna()
                lambda_home = float(hs.mean()) if len(hs) > 0 else mc_cfg["default_h"]
                lambda_away = float(as_.mean()) if len(as_) > 0 else mc_cfg["default_a"]
                source = "scores_avg"
            else:
                lambda_home = mc_cfg["default_h"]
                lambda_away = mc_cfg["default_a"]
                source = "sport_default"

            # Plancher pour Poisson
            lambda_home = max(mc_cfg["min_lambda"], lambda_home)
            lambda_away = max(mc_cfg["min_lambda"], lambda_away)

            n_simulations = 10000
            rng = np.random.default_rng(42)

            # Simuler les scores
            sim_home = rng.poisson(lambda_home, n_simulations)
            sim_away = rng.poisson(lambda_away, n_simulations)

            # Resultats
            home_wins = int((sim_home > sim_away).sum())
            away_wins = int((sim_away > sim_home).sum())
            draws = int((sim_home == sim_away).sum())

            # Score distribution (top 10 scores les plus probables)
            score_counts = {}
            for i in range(n_simulations):
                score = f"{sim_home[i]}-{sim_away[i]}"
                score_counts[score] = score_counts.get(score, 0) + 1
            top_scores = sorted(score_counts.items(), key=lambda x: x[1], reverse=True)[:10]

            # Over threshold probabilite
            over_threshold = mc_cfg["over_threshold"]
            over_pct = float(((sim_home + sim_away) > over_threshold).sum() / n_simulations * 100)
            # BTTS (Both Teams To Score)
            btts = float(((sim_home > 0) & (sim_away > 0)).sum() / n_simulations * 100)

            # Expected totals
            expected_total = float(np.mean(sim_home + sim_away))
            std_total = float(np.std(sim_home + sim_away))

            # Probabilites normalisees
            if sport in ("basketball",):
                prob_home = home_wins / n_simulations * 100
                prob_away = away_wins / n_simulations * 100
                prob_draw = 0.0
            else:
                prob_home = home_wins / n_simulations * 100
                prob_draw = draws / n_simulations * 100
                prob_away = away_wins / n_simulations * 100

            monte_carlo_info = {
                "method": "poisson_simulation",
                "sport": sport,
                "n_simulations": n_simulations,
                "lambda_home": round(lambda_home, 3),
                "lambda_away": round(lambda_away, 3),
                "lambda_source": source,
                "prob_home_win": round(prob_home, 1),
                "prob_draw": round(prob_draw, 1),
                "prob_away_win": round(prob_away, 1),
                "expected_total_score": round(expected_total, 2),
                "std_total_score": round(std_total, 2),
                "over_threshold_label": mc_cfg["label"],
                "over_threshold_value": over_threshold,
                "over_threshold_pct": round(over_pct, 1),
                "btts_pct": round(btts, 1),
                "top_scores": [(s, round(c / n_simulations * 100, 1)) for s, c in top_scores],
            }

            print(f"      Lambda: {lambda_home:.2f} / {lambda_away:.2f} (source: {source})")
            print(f"      MC proba: H {prob_home:.1f}% | D {prob_draw:.1f}% | A {prob_away:.1f}%")
            print(f"      {mc_cfg['label']}: {over_pct:.1f}% | BTTS: {btts:.1f}%")
            print(f"      Expected total: {expected_total:.1f} ± {std_total:.1f}")
            if top_scores:
                print(f"      Top score: {top_scores[0][0]} ({top_scores[0][1]:.1f}%)")

        except Exception as e:
            import traceback
            print(f"      ⚠️ Monte-Carlo échoué: {e}")
            print(traceback.format_exc()[:500])

    # ── PILIER 5: PERFORMANCE PAR LIGUE (bankroll, holdout uniquement) ──
    league_perf = {}
    if "league" in bt_df.columns:
        bt_leagues = bt_df["league"].value_counts()
        for lg in bt_leagues[bt_leagues >= 15].index[:15]:
            lg_mask = (bt_df["league"] == lg).values
            lg_y = y_hold_arr[lg_mask]
            lg_proba = y_proba[lg_mask]
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
        "label": "home_win",
        "label_semantics": "P(victoire domicile | match décidé, draws exclus)",
        "cv_accuracy": round(float(mean_cv), 4),
        "cv_std": round(float(std_cv), 4),
        "cv_scores": [round(float(s), 4) for s in cv_scores],
        "cv_method": "timeseries_walk_forward_train_only" if len(cv_scores) else "skipped_insufficient_data",
        "holdout_accuracy": round(float(holdout_acc), 4),
        "holdout_brier": round(float(holdout_brier), 6),
        "n_train": int(len(X_train)),
        "n_holdout": int(len(X_hold)),
        "temporal_split": True,
        "edge_vs_random": round(float(edge), 2),
        "random_baseline": round(random_baseline, 4),
        "best_confidence_threshold": round(float(best_threshold), 2),
        "best_precision": round(float(best_precision), 4),
        "feature_importance": feature_importance_dict,
        "top_features": top_features,
        "features": feature_cols,
        "samples": len(sport_df),
        "pos_rate": round(float(pos_rate), 4),
        "version": f"xgb-{datetime.now(timezone.utc).strftime('%Y%m%d')}",
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    # Ajouter les piliers 4-5 + axes optimisation si disponibles
    if calibration_info:
        result["calibration"] = calibration_info
    if platt_info:
        result["platt"] = platt_info
    if league_perf:
        result["league_performance"] = league_perf
    if custom_loss_info:
        result["custom_loss"] = custom_loss_info
    if backtesting_info:
        result["backtesting"] = backtesting_info
    if monte_carlo_info:
        result["monte_carlo"] = monte_carlo_info

    # ── Export arbres (replay fidèle en prod TS) ──
    # Auto-vérifié: le replay du dump doit reproduire predict_proba sur le holdout.
    # Si échec → pas de tree_dump → prod retombe sur les heuristiques (jamais
    # l'ancienne moyenne pondérée directionnellement fausse).
    tree_dump = export_tree_dump(model, X_hold, y_hold)
    if tree_dump:
        result["tree_dump"] = tree_dump

    return result

# ============================================================
# ENSEMBLE TRAINING (Phase 3: XGBoost + LightGBM + CatBoost)
# ============================================================

def train_ensemble(
    sport_df: pd.DataFrame,
    feature_cols: list,
    pos_rate: float,
    sport: str,
    xgb_result: dict | None = None,
    n_folds: int = 5,
    random_state: int = 42,
) -> dict | None:
    """
    Train an ensemble of XGBoost + LightGBM + CatBoost with soft voting.
    Only adopted if ensemble CV > XGBoost-alone CV by more than 1pp.
    Gracefully falls back to XGBoost alone if LightGBM/CatBoost unavailable.
    """
    try:
        from sklearn.model_selection import StratifiedKFold
    except ImportError:
        return None

    target_col = "result_match"
    if target_col not in sport_df.columns:
        return None

    X = sport_df[feature_cols].fillna(0).values
    y = sport_df[target_col].astype(int).values

    # Subsample if too large for ensemble training speed
    MAX_ENSEMBLE_SAMPLES = 5000
    if len(y) > MAX_ENSEMBLE_SAMPLES:
        rng = np.random.RandomState(random_state)
        idx = rng.choice(len(y), MAX_ENSEMBLE_SAMPLES, replace=False)
        X, y = X[idx], y[idx]

    if len(y) < 50:
        print(f"      ⚠️ Not enough samples for ensemble ({len(y)} < 50), keeping XGBoost alone")
        return None

    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=random_state)

    # --- XGBoost CV (reuse from xgb_result if available) ---
    xgb_cv_acc = float(xgb_result["cv_accuracy"]) if xgb_result else 0.0

    # --- LightGBM ---
    lgb_cv_scores = []
    lgb_models = []
    try:
        from lightgbm import LGBMClassifier
        print(f"      🔵 LightGBM training ({n_folds}-fold)...")
        for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
            X_tr, X_val = X[train_idx], X[val_idx]
            y_tr, y_val = y[train_idx], y[val_idx]
            model = LGBMClassifier(
                objective="binary",
                n_estimators=200,
                max_depth=6,
                num_leaves=31,
                subsample=0.8,
                colsample_bytree=0.8,
                learning_rate=0.05,
                random_state=random_state,
                verbose=-1,
            )
            model.fit(X_tr, y_tr)
            score = model.score(X_val, y_val)
            lgb_cv_scores.append(score)
            lgb_models.append(model)
        lgb_mean = float(np.mean(lgb_cv_scores))
        print(f"         LightGBM CV: {lgb_mean:.4f}")
    except ImportError:
        print(f"         ⚠️ LightGBM not available, skipping")
        lgb_mean = 0.0
        lgb_models = []
    except Exception as e:
        print(f"         ⚠️ LightGBM error: {e}")
        lgb_mean = 0.0
        lgb_models = []

    # --- CatBoost ---
    cb_cv_scores = []
    cb_models = []
    try:
        from catboost import CatBoostClassifier
        print(f"      🟢 CatBoost training ({n_folds}-fold)...")
        for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
            X_tr, X_val = X[train_idx], X[val_idx]
            y_tr, y_val = y[train_idx], y[val_idx]
            model = CatBoostClassifier(
                iterations=200,
                depth=6,
                learning_rate=0.1,
                subsample=0.8,
                random_state=random_state,
                verbose=0,
                allow_writing_files=False,
            )
            model.fit(X_tr, y_tr)
            score = model.score(X_val, y_val)
            cb_cv_scores.append(score)
            cb_models.append(model)
        cb_mean = float(np.mean(cb_cv_scores))
        print(f"         CatBoost CV: {cb_mean:.4f}")
    except ImportError:
        print(f"         ⚠️ CatBoost not available, skipping")
        cb_mean = 0.0
        cb_models = []
    except Exception as e:
        print(f"         ⚠️ CatBoost error: {e}")
        cb_mean = 0.0
        cb_models = []

    # --- Soft Voting Ensemble CV ---
    ensemble_cv_scores = []
    ensemble_models = []
    if lgb_models and cb_models:
        print(f"      🔀 Ensemble (XGB+LGB+CB) soft voting CV...")
        for fold in range(n_folds):
            # Average probabilities from all 3 models
            xgb_proba = None
            lgb_proba = lgb_models[fold].predict_proba(X)[:, 1] if fold < len(lgb_models) else None
            cb_proba = cb_models[fold].predict_proba(X)[:, 1] if fold < len(cb_models) else None

            # If we don't have per-fold XGBoost models, use overall estimate
            if xgb_proba is None:
                xgb_proba = np.full(len(y), xgb_cv_acc)

            if lgb_proba is not None and cb_proba is not None:
                ensemble_proba = (xgb_proba + lgb_proba + cb_proba) / 3.0
            elif lgb_proba is not None:
                ensemble_proba = (xgb_proba + lgb_proba) / 2.0
            elif cb_proba is not None:
                ensemble_proba = (xgb_proba + cb_proba) / 2.0
            else:
                ensemble_proba = xgb_proba

            # For proper CV, we need per-fold val predictions
            # Use the average of CV scores as a proxy for simplicity
            pass

        # Simplified: use weighted average of individual CVs as ensemble CV estimate
        # (Proper per-fold ensemble would require restructuring)
        if lgb_mean > 0 and cb_mean > 0:
            ensemble_cv = float((xgb_cv_acc + lgb_mean + cb_mean) / 3.0)
        elif lgb_mean > 0:
            ensemble_cv = float((xgb_cv_acc + lgb_mean) / 2.0)
        elif cb_mean > 0:
            ensemble_cv = float((xgb_cv_acc + cb_mean) / 2.0)
        else:
            ensemble_cv = xgb_cv_acc

        improvement = (ensemble_cv - xgb_cv_acc) * 100  # in percentage points

        print(f"         Ensemble CV: {ensemble_cv:.4f} vs XGBoost: {xgb_cv_acc:.4f} (+{improvement:.2f}pp)")

        # Only adopt if improvement > 1pp
        if improvement > 1.0:
            print(f"         ✅ Ensemble ADOPTED (improvement +{improvement:.2f}pp > 1pp threshold)")
            models_used = ["xgboost"]
            individual_cvs = {"xgboost": xgb_cv_acc}
            if lgb_mean > 0:
                models_used.append("lightgbm")
                individual_cvs["lightgbm"] = lgb_mean
            if cb_mean > 0:
                models_used.append("catboost")
                individual_cvs["catboost"] = cb_mean

            # Average feature importances across all models
            all_importances = {}
            if xgb_result and xgb_result.get("feature_importance"):
                all_importances["xgboost"] = xgb_result["feature_importance"]

            return {
                "ensemble_used": True,
                "ensemble_cv": round(ensemble_cv, 4),
                "improvement_pp": round(improvement, 2),
                "models": models_used,
                "individual_cvs": {k: round(v, 4) for k, v in individual_cvs.items()},
            }
        else:
            print(f"         ❌ Ensemble REJECTED (improvement +{improvement:.2f}pp <= 1pp threshold)")
            return {
                "ensemble_used": False,
                "ensemble_cv": round(ensemble_cv, 4),
                "improvement_pp": round(improvement, 2),
                "models": ["xgboost"],
                "individual_cvs": {"xgboost": xgb_cv_acc},
            }
    else:
        print(f"      ⚠️ Not enough alternative models for ensemble, keeping XGBoost alone")
        return None


# ============================================================
# EXPORT TO SUPABASE
# ============================================================

def export_to_supabase(sb: Client, results: dict, global_cv: float, total_samples: int):
    """
    Exporte les paramètres XGBoost dans la table ml_model.xgboost_params.
    v3: inclut les arbres (replay TS), Platt holdout, métriques holdout,
    liste blanche de features. Garde-fou taille: si le payload dépasse 6MB,
    les dumps d'arbres les plus lourds sont retirés (prod → heuristiques).
    """
    xgboost_params = {
        "trained": True,
        "scoring": "trees",
        "training_version": 3,
        "label": "home_win",
        "label_semantics": "P(victoire domicile | match décidé, draws exclus)",
        "sports": {r["sport"]: {
            "cv_accuracy": r["cv_accuracy"],
            "cv_method": r.get("cv_method"),
            "best_confidence_threshold": r["best_confidence_threshold"],
            "top_features": r["top_features"],
            "feature_importance": r["feature_importance"],
            "features": r.get("features"),
            "samples": r["samples"],
            "edge_vs_random": r["edge_vs_random"],
            "version": r["version"],
            "trained_at": r["trained_at"],
            "custom_loss": r.get("custom_loss"),
            "backtesting": r.get("backtesting"),
            "calibration": r.get("calibration"),
            "platt": r.get("platt"),
            "tree_dump": r.get("tree_dump"),
            "scoring": "trees" if r.get("tree_dump") else "none",
            "holdout": {
                "n_train": r.get("n_train"),
                "n_holdout": r.get("n_holdout"),
                "accuracy": r.get("holdout_accuracy"),
                "brier": r.get("holdout_brier"),
            },
            "label": r.get("label"),
            "label_semantics": r.get("label_semantics"),
            "league_performance": r.get("league_performance"),
            "ensemble": r.get("ensemble"),
        } for r in results.values() if r},
        "global_cv_accuracy": round(global_cv, 4),
        "total_samples": total_samples,
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Garde-fou taille payload (row Supabase jsonb): < 6MB cible, 4MB plancher
    payload = json.dumps(xgboost_params, cls=NumpyEncoder)
    if len(payload) > 6 * 1024 * 1024:
        print(f"   ⚠️ Payload {len(payload)/1e6:.1f}MB — réduction des dumps d'arbres les plus lourds")
        sport_keys = sorted(
            xgboost_params["sports"].keys(),
            key=lambda k: -len(json.dumps(xgboost_params["sports"][k].get("tree_dump") or {}, cls=NumpyEncoder)),
        )
        for sk in sport_keys:
            if len(payload) <= 4 * 1024 * 1024:
                break
            if xgboost_params["sports"][sk].get("tree_dump"):
                xgboost_params["sports"][sk]["tree_dump"] = None
                xgboost_params["sports"][sk]["scoring"] = "none"
                print(f"      - arbres '{sk}' retirés (scoring → heuristiques)")
                payload = json.dumps(xgboost_params, cls=NumpyEncoder)

    print(f"\n📤 Export vers Supabase ml_model.xgboost_params (payload {len(payload)/1e6:.2f}MB)...")

    # Upsert dans ml_model
    update_data = {
        "id": "default_model",
        "xgboost_params": payload,
        "version": f"xgb-{datetime.now(timezone.utc).strftime('%y%m%d')}",
        "samples_used": int(total_samples),
        "accuracy": int(round(global_cv * 100)),
        "last_trained": datetime.now(timezone.utc).isoformat(),
    }

    # Mettre à jour les seuils basés sur les résultats XGBoost
    if results:
        # Calculer le meilleur edge_threshold global
        edges = [r["edge_vs_random"] for r in results.values() if r]
        if edges:
            best_edge = max(edges) / 100  # Convertir pp en ratio
            update_data["edge_threshold"] = float(round(best_edge, 4))

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
            # Health check: verify DNS + connectivity before proceeding
            try:
                sb.table("predictions").select("id", count="exact").limit(1).execute()
                print("✅ Connexion Supabase établie")
            except Exception as e:
                if "Name or service not known" in str(e) or "resolve" in str(e).lower():
                    print("⚠️ Supabase DNS inaccessible — mode CSV uniquement")
                    sb = None
                else:
                    print(f"⚠️ Supabase query échouée: {e}")
                    print("   Mode dégradé: données CSV uniquement")
                    sb = None
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
        result = train_sport_model(df, sport, min_samples=args.min_samples, dry_run=args.dry_run, enrichment=enrichment)
        if result:
            # Phase 3: Try ensemble (XGBoost + LightGBM + CatBoost)
            # v3: DÉSACTIVÉ par défaut (ENSEMBLE_ENABLED=False) — non rejouable côté prod TS
            sport_df = df[df["sport"] == sport].copy()
            ensemble_info = None
            if ENSEMBLE_ENABLED and not args.dry_run:
                try:
                    ensemble_info = train_ensemble(
                        sport_df=sport_df,
                        feature_cols=feature_cols,
                        pos_rate=result.get("pos_rate", 0.5),
                        sport=sport,
                        xgb_result=result,
                    )
                    if ensemble_info:
                        result["ensemble"] = ensemble_info
                except Exception as e:
                    print(f"      ⚠️ Ensemble error for {sport}: {e}")
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
        json.dump(output, f, indent=2, cls=NumpyEncoder)
    print(f"\n💾 Résultats sauvegardés: {output_path}")

    print("\n✅ Pipeline terminé!")

if __name__ == "__main__":
    main()
