"""
XGBoost Training Pipeline - Steo Elite Predictor
=================================================
Entraîne un modèle XGBoost par sport sur les prédictions historiques Supabase.
Exporte les feature importances + seuils optimaux → table ml_model.xgboost_params

Usage:
  python ml/train_xgboost.py                  # Training complet (tous sports)
  python ml/train_xgboost.py --sport football # Un seul sport
  python ml/train_xgboost.py --dry-run         # Affiche les features sans entraîner
  python ml/train_xgboost.py --min-samples 50  # Minimum d'échantillons par sport

Architecture:
  Supabase (predictions) → Feature Engineering → XGBoost + CV → Supabase (ml_model)
  Le script Python s'exécute hors Vercel (GitHub Actions, Render, ou local).
  Vercel lit seulement les coefficients via unifiedMLService.ts (pas de libs ML au runtime).

Auteur: Steo Elite Predictor - Phase 2 ML
Date: 2026-07-24
"""

import argparse
import json
import sys
import os
import time
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
from supabase import create_client, Client

# ============================================================
# CONFIGURATION
# ============================================================

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://aumsrakioetvvqopthbs.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14"
)

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

def load_training_data(sb: Client, sport: Optional[str] = None, min_samples: int = 30) -> pd.DataFrame:
    """
    Charge toutes les prédictions résolues depuis Supabase.
    Filtre sur les prédictions complétées avec un résultat connu.
    """
    print(f"\n📊 Chargement des données depuis Supabase...")

    query = sb.table("predictions").select(
        "id, sport, home_team, away_team, league, match_date, "
        "predicted_result, predicted_goals, confidence, "
        "odds_home, odds_away, odds_draw, "
        "result_match, home_score, away_score, actual_result"
    ).eq("status", "completed").not_.is_("result_match", "null")

    if sport:
        query = query.eq("sport", sport)

    # Charger par lots de 2000 pour éviter les timeouts
    all_data = []
    offset = 0
    batch_size = 2000

    while True:
        res = query.range(offset, offset + batch_size - 1).execute()
        if not res.data:
            break
        all_data.extend(res.data)
        if len(res.data) < batch_size:
            break
        offset += batch_size
        print(f"   Chargé {len(all_data)} prédictions...")

    if not all_data:
        print("   ⚠️ Aucune donnée trouvée!")
        return pd.DataFrame()

    df = pd.DataFrame(all_data)

    # Convertir les types
    for col in ["odds_home", "odds_away", "odds_draw"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["result_match"] = df["result_match"].astype(bool)
    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce")

    # Filtrer les lignes avec des odds valides
    df = df.dropna(subset=["odds_home", "odds_away"])

    print(f"   ✅ {len(df)} prédictions chargées")

    # Stats par sport
    for s in df["sport"].unique():
        sub = df[df["sport"] == s]
        wins = sub["result_match"].sum()
        wr = wins / len(sub) * 100 if len(sub) > 0 else 0
        print(f"      {s}: {len(sub)} échantillons ({wr:.1f}% win rate)")

    return df

# ============================================================
# FEATURE ENGINEERING
# ============================================================

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Crée les features pour XGBoost à partir des données brutes.
    Chaque feature est conçue pour être calculable AVANT le match (prédictive).
    """
    if df.empty:
        return df

    df = df.copy()

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

    # --- Confidence Features ---
    # Confidence encodée numériquement
    confidence_map = {"very_high": 1.0, "high": 0.75, "medium": 0.5, "low": 0.25}
    df["confidence_numeric"] = df["confidence"].map(confidence_map).fillna(0.5)

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

    # --- Predicted Result Features ---
    # Est-ce que la prédiction est "home"?
    df["pred_home"] = (df["predicted_result"] == "home").astype(int)
    df["pred_away"] = (df["predicted_result"] == "away").astype(int)
    df["pred_draw"] = (df["predicted_result"] == "draw").astype(int)

    # Alignement prédiction / favori
    df["pred_matches_favorite"] = (
        (df["pred_home"] == 1) & (df["is_home_favorite"] == 1) |
        (df["pred_away"] == 1) & (df["is_home_favorite"] == 0)
    ).astype(int)

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

    return df

def get_feature_columns(df: pd.DataFrame) -> list:
    """Retourne la liste des colonnes features (exclut target et métadonnées)."""
    exclude_cols = {
        "id", "sport", "home_team", "away_team", "league", "date", "match_date",
        "predicted_result", "predicted_goals", "confidence",
        "result_match", "actual_result", "home_score", "away_score"
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
    y = sport_df["result_match"].astype(int)

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

    # Feature importance dict
    feature_importance_dict = {name: round(float(imp), 4) for name, imp in feature_imp}

    # Top features as list of tuples
    top_features = [(name, round(float(imp), 4)) for name, imp in feature_imp[:15]]

    return {
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
        "version": f"2.0-xgb-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}",
        "samples_used": total_samples,
        "accuracy": round(global_cv * 100, 2),
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

    msg = "🧠 *XGBoost Training Report*\n"
    msg += f"━━━━━━━━━━━━━━━━━━━━\n"
    msg += f"📅 {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
    msg += f"📊 Total: {total_samples} échantillons\n"
    msg += f"📈 CV globale: {global_cv*100:.1f}%\n\n"

    for sport, r in sorted(results.items()):
        if r:
            emoji = "🟢" if r["edge_vs_random"] > 10 else "🟡" if r["edge_vs_random"] > 0 else "🔴"
            msg += f"{emoji} *{sport.upper()}*\n"
            msg += f"  CV: {r['cv_accuracy']*100:.1f}% | Edge: +{r['edge_vs_random']:.1f}pp\n"
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

    # Connexion Supabase
    try:
        sb = get_supabase()
        print("✅ Connexion Supabase établie")
    except Exception as e:
        print(f"❌ Erreur connexion Supabase: {e}")
        sys.exit(1)

    # Charger les données
    df = load_training_data(sb, sport=args.sport)
    if df.empty:
        print("❌ Aucune donnée disponible pour l'entraînement")
        sys.exit(1)

    # Feature engineering
    print("\n🔧 Feature Engineering...")
    df = engineer_features(df)
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
    if not args.no_export and results:
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
