# 🧠 XGBoost ML Pipeline - Steo Elite Predictor

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TRAINING (Python)                        │
│  GitHub Actions / Local / Render                            │
│                                                             │
│  Supabase (predictions)                                      │
│       ↓                                                     │
│  Feature Engineering (30+ features)                         │
│       ↓                                                     │
│  XGBoost + Cross-Validation (5 folds)                       │
│       ↓                                                     │
│  Feature Importances + Optimal Thresholds                   │
│       ↓                                                     │
│  Supabase (ml_model.xgboost_params)                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    INFERENCE (TypeScript)                   │
│  Vercel Serverless (pas de libs ML nécessaires)             │
│                                                             │
│  unifiedMLService.ts → loadMLModel()                        │
│       ↓                                                     │
│  scoreWithXGBoost() → pondération par feature importances   │
│       ↓                                                     │
│  adaptiveThresholdsML.ts → calculateMLAdjustment()           │
│       ↓                                                     │
│  Mix: 60% heuristiques + 40% XGBoost                        │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Training local
```bash
cd ml
pip install -r requirements.txt
python train_xgboost.py                  # Tous les sports
python train_xgboost.py --sport football # Un seul sport
python train_xgboost.py --dry-run         # Voir les features
```

### Variables d'environnement
| Variable | Description | Requis |
|----------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role | ✅ |
| `TELEGRAM_BOT_TOKEN` | Notification Telegram | ❌ |
| `TELEGRAM_CHAT_ID` | Chat ID Telegram | ❌ |

### GitHub Actions
Le workflow `.github/workflows/xgboost-training.yml` s'exécute tous les jours à 05:10 UTC.
Peut aussi être déclenché manuellement depuis l'onglet Actions.

## Features

Le script crée 30+ features à partir des données de prédictions:

### Odds Features
- `prob_home/away/draw` — Probabilités implicites
- `odds_ratio`, `log_odds_ratio` — Force relative
- `favorite_strength` — Écart de proba
- `is_home_favorite` — Indicateur binaire
- `overround` — Marge bookmaker

### Confidence Features
- `confidence_numeric` — Confiance encodée (0.25-1.0)
- `odds_confidence` — Interaction odds × confiance

### Sport-Specific
- `draw_signal` — Signal draw (football)
- `heavy_favorite` — Odds < 1.4 (tennis)
- `baseball_home` — Home advantage baseball

### Temporal
- `day_of_week`, `month`, `is_weekend`

### Interactions
- `favorite_confidence` — Favori × confiance
- `pred_matches_favorite` — Prédiction alignée avec favori

## XGBoost dans les prédictions

Une fois entraîné, le modèle influence les prédictions:
- **60% heuristiques** (Dixon-Coles, contexte, forme)
- **40% XGBoost** (feature importances entraînées)
- Bonus de confiance quand les deux sont alignés
- Visible dans le reasoning: `🧠 XGBoost score 72% — coefficients entraînés appliqués`
