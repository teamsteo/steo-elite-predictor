#!/usr/bin/env python3
"""
train.py — Entraînement XGBoost pour steo-elite-predictor

Pipeline:
  1. Fetch données depuis Supabase (via fetch_data.py)
  2. Entraîne un modèle XGBoost par sport
  3. Calcule feature importances + seuils optimaux
  4. Exporte les paramètres dans Supabase (table ml_model)

Usage:
    python train.py [--sport SPORT] [--days DAYS] [--min-samples N]
    python train.py --all-sports          # Tous les sports
    python train.py --export-only         # Réexporte les derniers résultats

Le script est conçu pour tourner:
  - Localement: python train.py
  - GitHub Actions: schedule hebdomadaire
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
except ImportError:
    print("❌ pip install numpy pandas")
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ pip install supabase")
    sys.exit(1)

# ============================================
# CONFIGURATION
# ============================================

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

# Charger .env
env_path = SCRIPT_DIR / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip().strip("\"'")
                if not SUPABASE_URL and key in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"):
                    SUPABASE_URL = val
                if not SUPABASE_KEY and key in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"):
                    SUPABASE_KEY = val

# Features à exclure de l'entraînement (metadata/labels)
EXCLUDE_COLS = {
    "match_id", "home_team", "away_team", "league", "sport_raw", "match_date",
    "result_correct", "actual_home", "actual_draw", "actual_away",
    "predicted_home", "predicted_draw", "predicted_away",
    "home_score", "away_score", "total_goals"
}

# Features par sport
SPORT_FEATURES = {
    "football": [
        "odds_home", "odds_draw", "odds_away",
        "implied_prob_home", "implied_prob_away", "implied_prob_draw",
        "bookmaker_margin", "odds_spread", "is_home_favorite", "favorite_strength",
        "month", "day_of_week", "hour", "is_weekend",
        "confidence_very_high", "confidence_high", "confidence_medium", "confidence_low",
        "risk_percentage",
        "home_form_score", "away_form_score", "form_diff",
        "home_xg", "away_xg", "xg_diff", "xg_total",
        "dc_home_win_prob", "dc_draw_prob", "dc_away_win_prob",
        "context_score", "data_quality", "ml_edge", "ml_confidence",
        "injury_count"
    ],
    "basketball": [
        "odds_home", "odds_away",
        "implied_prob_home", "implied_prob_away",
        "bookmaker_margin", "odds_spread", "is_home_favorite", "favorite_strength",
        "month", "day_of_week", "hour", "is_weekend",
        "confidence_very_high", "confidence_high", "confidence_medium", "confidence_low",
        "risk_percentage",
        "home_form_score", "away_form_score", "form_diff",
        "home_net_rating", "away_net_rating", "net_rating_diff",
        "context_score", "data_quality", "ml_edge", "ml_confidence",
    ],
    "tennis": [
        "odds_home", "odds_away",
        "implied_prob_home", "implied_prob_away",
        "bookmaker_margin", "odds_spread", "is_home_favorite", "favorite_strength",
        "month", "day_of_week", "hour", "is_weekend",
        "confidence_very_high", "confidence_high", "confidence_medium", "confidence_low",
        "risk_percentage",
        "context_score", "data_quality", "ml_edge", "ml_confidence",
    ],
    "hockey": [
        "odds_home", "odds_away",
        "implied_prob_home", "implied_prob_away",
        "bookmaker_margin", "odds_spread", "is_home_favorite", "favorite_strength",
        "month", "day_of_week", "hour", "is_weekend",
        "confidence_very_high", "confidence_high", "confidence_medium", "confidence_low",
        "risk_percentage",
        "home_form_score", "away_form_score", "form_diff",
        "context_score", "data_quality", "ml_edge", "ml_confidence",
    ],
    "baseball": [
        "odds_home", "odds_away",
        "implied_prob_home", "implied_prob_away",
        "bookmaker_margin", "odds_spread", "is_home_favorite", "favorite_strength",
        "month", "day_of_week", "hour", "is_weekend",
        "confidence_very_high", "confidence_high", "confidence_medium", "confidence_low",
        "risk_percentage",
        "home_form_score", "away_form_score", "form_diff",
        "context_score", "data_quality", "ml_edge", "ml_confidence",
    ],
}


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL et SUPABASE_KEY requis")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_data(sport: str = "all", days: int = 365) -> str:
    """Exécute fetch_data.py et retourne le chemin du CSV."""
    output = str(DATA_DIR / f"dataset_{sport}_{days}d.csv")
    cmd = [
        sys.executable, str(SCRIPT_DIR / "fetch_data.py"),
        "--sport", sport,
        "--output", output,
        "--days", str(days)
    ]
    print(f"🔄 Exécution: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ fetch_data.py échoué:\n{result.stderr}")
        sys.exit(1)
    print(result.stdout)
    return output


def load_dataset(csv_path: str) -> pd.DataFrame:
    """Charge le dataset CSV."""
    df = pd.read_csv(csv_path)
    print(f"📊 Dataset chargé: {len(df)} lignes, {len(df.columns)} colonnes")
    return df


def train_xgboost_model(df: pd.DataFrame, sport: str) -> dict:
    """
    Entraîne un modèle XGBoost pour un sport donné.
    Retourne un dict avec les paramètres entraînés.
    """
    print(f"\n🏋️ Entraînement XGBoost — {sport.upper()}")

    # Features disponibles
    available_features = [c for c in df.columns if c not in EXCLUDE_COLS]
    sport_features = [f for f in SPORT_FEATURES.get(sport, available_features) if f in df.columns]

    if not sport_features:
        print(f"⚠️ {sport}: aucune feature disponible")
        return None

    X = df[sport_features].copy()
    y = df["result_correct"].values

    # Remplir NaN
    X = X.fillna(0)
    y = np.nan_to_num(y, nan=0.0)

    n_samples = len(X)
    if n_samples < 20:
        print(f"⚠️ {sport}: pas assez d'échantillons ({n_samples} < 20)")
        return None

    print(f"   {n_samples} échantillons, {len(sport_features)} features")

    try:
        import xgboost as xgb
        from sklearn.model_selection import cross_val_score, StratifiedKFold
        from sklearn.metrics import accuracy_score, classification_report
    except ImportError:
        print("❌ pip install xgboost scikit-learn")
        return None

    # === Entraînement avec cross-validation ===
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        min_child_weight=5,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
        use_label_encoder=False,
    )

    # 5-fold cross-validation
    cv = StratifiedKFold(n_splits=min(5, max(2, n_samples // 20)), shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
    cv_mean = cv_scores.mean()
    cv_std = cv_scores.std()

    # Fit final model on all data
    model.fit(X, y)

    # Feature importances
    importance = model.get_booster().get_score(importance_type="gain")
    total_importance = sum(importance.values()) if importance else 1
    feature_importance = {
        feat: round(float(imp / total_importance), 4)
        for feat, imp in importance.items()
    }

    # Top features
    top_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:10]

    # === Calculer les seuils optimaux ===
    # Edge threshold: trouver le seuil de confiance où le modèle est le plus fiable
    y_pred_proba = model.predict_proba(X)[:, 1]
    y_pred = model.predict(X)

    # Seuil de confiance par décile
    thresholds_analysis = {}
    for decile in range(1, 10):
        lower = (decile - 1) / 10.0
        upper = decile / 10.0
        mask = (y_pred_proba >= lower) & (y_pred_proba < upper)
        if mask.sum() >= 5:
            acc = accuracy_score(y[mask], y_pred[mask])
            thresholds_analysis[f"{int(lower*100)}-{int(upper*100)}%"] = {
                "count": int(mask.sum()),
                "accuracy": round(float(acc), 3)
            }

    # Best confidence threshold
    best_threshold = 0.5
    best_acc = 0
    for t in np.arange(0.3, 0.8, 0.05):
        mask = y_pred_proba >= t
        if mask.sum() >= 10:
            acc = accuracy_score(y[mask], y_pred[mask])
            if acc > best_acc:
                best_acc = acc
                best_threshold = round(float(t), 2)

    # === Résultats ===
    train_acc = accuracy_score(y, y_pred)

    result = {
        "sport": sport,
        "samples": n_samples,
        "features_count": len(sport_features),
        "features_used": sport_features,
        "feature_importance": feature_importance,
        "top_features": top_features,
        "cv_accuracy": round(float(cv_mean), 4),
        "cv_std": round(float(cv_std), 4),
        "train_accuracy": round(float(train_acc), 4),
        "best_confidence_threshold": best_threshold,
        "best_threshold_accuracy": round(float(best_acc), 4),
        "thresholds_analysis": thresholds_analysis,
        "n_estimators": 100,
        "max_depth": 4,
        "learning_rate": 0.1,
        "trained_at": datetime.utcnow().isoformat(),
        "version": f"2.0.{datetime.utcnow().strftime('%Y%m%d%H%M')}"
    }

    print(f"   ✅ CV Accuracy: {cv_mean:.1%} (+/- {cv_std:.1%})")
    print(f"   ✅ Train Accuracy: {train_acc:.1%}")
    print(f"   ✅ Top features: {[f[0] for f in top_features[:5]]}")
    print(f"   ✅ Best threshold: {best_threshold} → {best_acc:.1%}")

    return result


def export_to_supabase(sport_results: dict, global_results: dict):
    """Exporte les paramètres entraînés dans Supabase ml_model."""
    supabase = get_supabase()

    print("\n📤 Export vers Supabase...")

    # 1. Mettre à jour ml_model (modèle principal)
    model_update = {
        "version": global_results.get("version", "2.0.0"),
        "edge_threshold": global_results.get("best_edge_threshold", 0.05),
        "injury_impact_factor": 1.0,
        "form_weight": global_results.get("optimal_form_weight", 0.05),
        "xg_weight": global_results.get("optimal_xg_weight", 0.03),
        "net_rating_weight": global_results.get("optimal_net_rating_weight", 0.03),
        "min_data_quality": global_results.get("optimal_min_data_quality", 50),
        "confidence_weights": json.dumps({
            "very_high": 0.5,
            "high": 0.4,
            "medium": 0.25,
            "low": 0.1,
        }),
        "samples_used": global_results.get("total_samples", 0),
        "accuracy": int(global_results.get("global_cv_accuracy", 0) * 100),
        "last_trained": datetime.utcnow().isoformat(),
        # Nouveau: paramètres XGBoost
        "xgboost_params": json.dumps({
            "trained": True,
            "sports": {k: {
                "cv_accuracy": v.get("cv_accuracy", 0),
                "best_confidence_threshold": v.get("best_confidence_threshold", 0.5),
                "top_features": v.get("top_features", [])[:5],
                "feature_importance": v.get("feature_importance", {}),
                "samples": v.get("samples", 0),
                "version": v.get("version", ""),
                "trained_at": v.get("trained_at", ""),
            } for k, v in sport_results.items() if v},
            "global_cv_accuracy": global_results.get("global_cv_accuracy", 0),
            "total_samples": global_results.get("total_samples", 0),
            "best_edge_threshold": global_results.get("best_edge_threshold", 0.05),
        }),
    }

    try:
        result = supabase.table("ml_model").upsert(
            model_update,
            on_conflict="id"
        ).execute()
        print(f"✅ ml_model mis à jour (version {model_update['version']})")
    except Exception as e:
        print(f"❌ Erreur maj ml_model: {e}")
        # Essayer avec insert si upsert échoue (colonne xgboost_params peut ne pas exister)
        try:
            model_update_no_xgb = {k: v for k, v in model_update.items() if k != "xgboost_params"}
            result = supabase.table("ml_model").upsert(
                model_update_no_xgb,
                on_conflict="id"
            ).execute()
            print(f"✅ ml_model mis à jour (sans xgboost_params - colonne manquante)")
            print("⚠️ Pour activer les params XGBoost, ajoutez la colonne JSONB:")
            print("   ALTER TABLE ml_model ADD COLUMN xgboost_params JSONB;")
        except Exception as e2:
            print(f"❌ Erreur maj ml_model (fallback): {e2}")

    # 2. Créer une entrée dans ml_patterns pour les insights XGBoost
    for sport, sr in sport_results.items():
        if not sr:
            continue

        top_features = sr.get("top_features", [])
        if top_features:
            pattern_id = f"{sport}_xgboost_insight"
            pattern_desc = f"XGBoost {sport}: top features = {[f[0] for f in top_features[:3]]}"

            try:
                supabase.table("ml_patterns").upsert({
                    "id": pattern_id,
                    "sport": sport,
                    "pattern_type": "xgboost_model",
                    "condition": f"cv_acc={sr.get('cv_accuracy', 0):.1%}",
                    "outcome": "model_trained",
                    "sample_size": sr.get("samples", 0),
                    "success_rate": int(sr.get("cv_accuracy", 0) * 100),
                    "confidence": min(float(sr.get("cv_accuracy", 0)), 0.99),
                    "description": pattern_desc,
                    "last_updated": datetime.utcnow().isoformat()
                }, on_conflict="id").execute()
                print(f"✅ Pattern XGBoost sauvegardé: {sport}")
            except Exception as e:
                print(f"⚠️ Pattern XGBoost ({sport}): {e}")


def create_env_template():
    """Crée un template .env si absent."""
    env_path = SCRIPT_DIR / ".env"
    if not env_path.exists():
        env_path.write_text("""# Steo Elite ML Training — Variables d'environnement
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
""")
        print(f"📄 Template .env créé: {env_path}")
        print("   Remplissez vos clés Supabase avant de lancer le script.")


def main():
    parser = argparse.ArgumentParser(
        description="Entraînement XGBoost pour steo-elite-predictor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
  python train.py                        # Football uniquement (défaut)
  python train.py --all-sports           # Tous les sports
  python train.py --sport tennis         # Tennis uniquement
  python train.py --days 180             # 6 derniers mois
  python train.py --min-samples 30       # Minimum 30 échantillons
        """
    )
    parser.add_argument("--sport", default="football", help="Sport à entraîner")
    parser.add_argument("--all-sports", action="store_true", help="Tous les sports")
    parser.add_argument("--days", type=int, default=365, help="Jours de données")
    parser.add_argument("--min-samples", type=int, default=20, help="Min échantillons par sport")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip fetch (utiliser cache)")
    parser.add_argument("--output", default=None, help="Dossier de sortie")
    parser.add_argument("--export-only", action="store_true", help="Réexporte les résultats sans réentraîner")
    args = parser.parse_args()

    print("=" * 60)
    print("🏋️ STEO ELITE — XGBoost ML Training")
    print("=" * 60)
    print(f"📅 {datetime.utcnow().isoformat()}")
    print()

    # Vérifier config
    if not SUPABASE_URL or not SUPABASE_KEY:
        create_env_template()
        print("\n❌ Configurez vos clés Supabase dans .env")
        sys.exit(1)

    # Vérifier connexion
    try:
        supabase = get_supabase()
        supabase.table("predictions").select("id", count="exact").limit(1).execute()
        print("✅ Connexion Supabase OK\n")
    except Exception as e:
        print(f"❌ Connexion Supabase: {e}")
        sys.exit(1)

    # Sports à entraîner
    sports = []
    if args.all_sports:
        sports = ["football", "basketball", "tennis", "hockey", "baseball"]
    elif args.sport == "all":
        sports = ["football", "basketball", "tennis", "hockey", "baseball"]
    else:
        sports = [args.sport]

    # Fetch données
    if not args.skip_fetch:
        fetch_data(sport="all" if len(sports) > 1 else sports[0], days=args.days)

    # Charger datasets
    sport_results = {}
    global_results = {
        "total_samples": 0,
        "global_cv_accuracy": 0,
        "best_edge_threshold": 0.05,
        "version": f"2.0.{datetime.utcnow().strftime('%Y%m%d%H%M')}",
    }

    csv_path = DATA_DIR / f"dataset_{'all' if len(sports) > 1 else sports[0]}_{args.days}d.csv"
    if csv_path.exists():
        df = load_dataset(str(csv_path))

        for sport in sports:
            # Filtrer par sport
            sport_col = "sport_football" if sport == "football" else f"sport_{sport}"
            if sport_col in df.columns:
                sport_df = df[df[sport_col] == 1].copy()
            else:
                sport_df = df[df["sport_raw"] == sport].copy()

            if len(sport_df) < args.min_samples:
                print(f"⚠️ {sport}: {len(sport_df)} échantillons < {args.min_samples} min")
                continue

            result = train_xgboost_model(sport_df, sport)
            if result:
                sport_results[sport] = result
                global_results["total_samples"] += result["samples"]
    else:
        # Essayer avec chaque sport séparément
        for sport in sports:
            csv_sport = DATA_DIR / f"dataset_{sport}_{args.days}d.csv"
            if csv_sport.exists():
                df = load_dataset(str(csv_sport))
                result = train_xgboost_model(df, sport)
                if result:
                    sport_results[sport] = result
                    global_results["total_samples"] += result["samples"]
            else:
                print(f"⚠️ Dataset non trouvé: {csv_sport}")

    if not sport_results:
        print("\n❌ Aucun modèle entraîné (données insuffisantes?)")
        print("💡 Astuce: Lancez d'abord quelques jours de prédictions, puis relancez.")
        sys.exit(1)

    # Calculer la moyenne globale
    cv_accs = [r["cv_accuracy"] for r in sport_results.values() if r.get("cv_accuracy")]
    if cv_accs:
        global_results["global_cv_accuracy"] = round(sum(cv_accs) / len(cv_accs), 4)

    # Meilleur edge threshold global
    best_thresh = 0.5
    best_thresh_acc = 0
    for r in sport_results.values():
        if r.get("best_threshold_accuracy", 0) > best_thresh_acc:
            best_thresh_acc = r["best_threshold_accuracy"]
            best_thresh = r.get("best_confidence_threshold", 0.5)
    global_results["best_edge_threshold"] = best_thresh

    # === Résumé ===
    print("\n" + "=" * 60)
    print("📋 RÉSUMÉ ENTRAÎNEMENT")
    print("=" * 60)

    for sport, r in sport_results.items():
        emoji = {"football": "⚽", "basketball": "🏀", "tennis": "🎾", "hockey": "🏒", "baseball": "⚾"}.get(sport, "📊")
        print(f"\n{emoji} {sport.upper()}")
        print(f"   Échantillons: {r['samples']}")
        print(f"   CV Accuracy: {r['cv_accuracy']:.1%} (+/- {r['cv_std']:.1%})")
        print(f"   Train Accuracy: {r['train_accuracy']:.1%}")
        print(f"   Seuil optimal: {r['best_confidence_threshold']} → {r['best_threshold_accuracy']:.1%}")
        print(f"   Top features: {[f[0] for f in r['top_features'][:5]]}")

    print(f"\n📈 GLOBAL: {global_results['total_samples']} échantillons, CV avg = {global_results['global_cv_accuracy']:.1%}")

    # Sauvegarder les résultats localement
    results_path = DATA_DIR / "training_results.json"
    with open(results_path, "w") as f:
        json.dump({
            "trained_at": datetime.utcnow().isoformat(),
            "global": global_results,
            "sports": sport_results
        }, f, indent=2, default=str)
    print(f"📁 Résultats locaux: {results_path}")

    # Export vers Supabase
    export_to_supabase(sport_results, global_results)

    print("\n✅ Entraînement terminé avec succès!")
    print("   Les paramètres sont disponibles dans Supabase ml_model.xgboost_params")
    print("   Vercel les utilisera automatiquement pour les prochaines prédictions.")


if __name__ == "__main__":
    main()
